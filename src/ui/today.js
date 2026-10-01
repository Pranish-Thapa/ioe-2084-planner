/**
 * Today's Plan — the workhorse view.
 *
 * The plan is derived, not stored, so this view must never be the place where
 * progress is recorded. It only logs sessions; the planner re-derives after
 * every log. It also surfaces missed sessions, because an unlogged day is the
 * single biggest cause of a plan silently going stale.
 */

import { el } from '../util/dom.js';
import { todayISO, addDays, relDayLabel, fmtDate, fmtMinutes } from '../util/dates.js';
import { OUTCOMES, OUTCOME_LABEL, picksForDate, pickModeForDate } from '../core/planner.js';
import { update, openModal, app, statCard, emptyState, barRow, logTask, undoSessions } from '../app.js';

const TYPE_LABEL = {
  learn: 'Learn', revise: 'Revise', practice: 'Practice', mixed: 'Mixed MCQ',
  mistakes: 'Mistake Bank', test: 'Full test', personal: 'Personal', fill: 'Bonus',
  maintenance: 'Maintenance',
};

export function renderToday(a) {
  const st = a.state;
  const date = a.route.params.date || todayISO();
  // Tasks are the projection (state.days mirrors it); sessions and minutes are
  // history and only ever live in state.days.
  const day = a.state.days[date] || a.plan.plan[date];
  const wrap = el('div', { class: 'stack' });

  const h = el('div', { class: 'page-head' });
  h.append(el('h1', {}, date === todayISO() ? "Today's plan" : `Plan for ${fmtDate(date, { weekday: 'long', day: 'numeric', month: 'long' })}`));
  const isToday = date === todayISO();
  h.append(el('p', { class: 'sub' },
    relDayLabel(date, todayISO()),
    ' · ',
    el('a', { href: '#/today' }, 'Today'),
    date < todayISO() ? ' · ' : ' · ',
    date < todayISO() ? null : el('a', { href: `#/today/${addDays(date, 1)}` }, 'Next day →'),
  ));
  wrap.append(h);

  // Missed sessions — shown first, because they change today's work.
  if (isToday && a.plan.missed && a.plan.missed.length) {
    wrap.append(missedCard(a));
  }

  if (!day) {
    wrap.append(emptyState('Outside the planning horizon',
      'The planner only projects as far as your deadline. Move the target date in Settings to extend it.'));
    return wrap;
  }

  wrap.append(dayHeader(a, day, date, isToday));

  if (isToday) wrap.append(blockTodayCard(a, date, day));

  // Only offer the choice on a day that is still ahead of the student; a
  // picker on a finished day would imply the past can be re-planned.
  if (date >= todayISO()) wrap.append(chooseTodayCard(a, date, day));

  if (day.closed) {
    wrap.append(emptyState(day.closedReason || 'This day is closed',
      'Nothing is scheduled here, and none of your available time is counted against the deadline.'));
  } else if (!day.tasks.length) {
    wrap.append(emptyState('No tasks on this day',
      'Either everything scheduled for this day is done, or there is not enough usable time for a useful block.'));
  } else {
    const done = new Set((day.sessions || []).filter((x) => x.outcome !== OUTCOMES.SKIPPED).map((x) => x.taskId));
    for (const t of day.tasks) {
      wrap.append(taskCard(a, t, done.has(t.id), date));
    }
  }

  if (day.sessions && day.sessions.length) wrap.append(sessionLog(a, day));

  return wrap;
}

/**
 * "Start tomorrow" - block today entirely.
 *
 * Without this, a plan created late at night shows work for a day that has
 * already effectively ended, and the honest response is to have nothing planned
 * today. The day is blocked through the same `busyDays` mechanism Settings
 * already uses, so it persists, exports and re-plans like any other override.
 */
/**
 * "Choose what to study today" - hand-pick the chapters, or ask for a
 * randomised day.
 *
 * The planner ranks topics by urgency, which is the right default but means the
 * same few chapters keep winning. Picks are stored per date, so a choice only
 * ever applies to the day it was made; due revisions, practice and mistake-bank
 * work still run, because those are outstanding obligations rather than new
 * reading.
 */
function chooseTodayCard(a, date, day) {
  const st = a.state;
  const picks = picksForDate(st, date);
  const mode = pickModeForDate(st, date);
  const c = el('div', { class: 'card' });

  c.append(el('div', { class: 'title' }, 'What to study'));
  c.append(el('p', { class: 'small muted', style: 'margin:4px 0 10px' },
    'Choose your own chapters for this day, or let it be picked for you.'));

  if (mode === 'shuffle') {
    c.append(el('p', { class: 'small', style: 'margin:0 0 10px;color:var(--ink-3)' },
      'Today was randomised: still-needed topics were drawn at random rather than by urgency.'));
  }

  if (mode === 'picks' && !picks.length) {
    c.append(el('p', { class: 'small', style: 'margin:0 0 10px;color:var(--high)' },
      'Nothing selected yet, so today still follows the planner. Tick at least one topic below, or switch back to the planner\'s choice.'));
  }

  if (mode === 'picks' && day && day.picksMissed && day.picksMissed.length) {
    const names = day.picksMissed.map((k) => {
      const [, tid] = k.split('::');
      const t = a.index.topics.find((x) => x.id === tid);
      return t ? t.title : k;
    });
    c.append(el('p', { class: 'small', style: 'margin:0 0 10px;color:var(--high)' },
      `Could not fit today: ${names.join('; ')}. Shorten the list or give the day more time.`));
  }

  const bar = el('div', { class: 'row wrap', style: 'gap:6px;margin-bottom:10px' });

  const opt = (key, label, hint) => {
    const b = el('button', {
      class: `sm ${mode === key ? 'primary' : 'ghost'}`,
      'aria-pressed': mode === key ? 'true' : 'false',
      'data-mode': key,
      title: hint,
      onclick: () => {
        update((s) => {
          if (!s.overrides.todayPicks) s.overrides.todayPicks = {};
          if (key === 'picks') {
            if (!s.overrides.todayPicks[date]) s.overrides.todayPicks[date] = [];
          } else {
            // Leaving "my picks" must also leave the automatic choice intact,
            // so clear the selection rather than leaving it silently active.
            delete s.overrides.todayPicks[date];
            s.settings.planStyle = key === 'shuffle' ? 'shuffle' : 'auto';
          }
        });
      },
    }, label);
    return b;
  };

  bar.append(opt('auto', 'Planner\'s choice'));
  bar.append(opt('shuffle', 'Random'));
  bar.append(opt('picks', 'My picks'));
  c.append(bar);

  if (mode === 'shuffle') {
    const r = el('div', { class: 'row wrap', style: 'gap:8px' });
    r.append(el('span', { class: 'small muted', style: 'flex:1' },
      'Still-needed topics are picked at random for this day. Due revisions and the daily time limit are unaffected.'));
    r.append(el('button', {
      class: 'sm ghost',
      onclick: () => update((s) => {
        if (!s.overrides.shuffleNonce) s.overrides.shuffleNonce = {};
        s.overrides.shuffleNonce[date] = (s.overrides.shuffleNonce[date] || 0) + 1;
      }),
    }, 'Shuffle again'));
    c.append(r);
  }

  if (mode === 'picks') {
    const done = (day && typeof day.picksDone === 'number') ? day.picksDone : 0;
    const miss = day && day.picksMissed ? day.picksMissed.length : 0;
    c.append(el('div', { class: 'row small muted', style: 'margin-bottom:8px;gap:10px' },
      el('span', {},
        picks.length
          ? `${done} of ${picks.length} picked topic${picks.length === 1 ? '' : 's'} done today`
          : 'Nothing selected yet'),
      miss ? el('span', { style: 'color:var(--high)' }, `${miss} did not fit today`) : null,
      picks.length
        ? el('button', {
            class: 'sm ghost',
            onclick: () => update((s) => { delete s.overrides.todayPicks[date]; }),
          }, 'Clear')
        : null,
    ));
    c.append(topicPicker(a, date, picks));
  }

  return c;
}

/** Subject-collapsible list of topics for one date. */
function topicPicker(a, date, picks) {
  const chosen = new Set(picks);
  const wrap = el('div', { style: 'display:flex;flex-direction:column;gap:6px' });

  for (const subj of a.index.subjects) {
    const det = el('details');
    det.append(el('summary', { class: 'small' }, `${subj.name} (${subj.units.length} units)`));
    for (const unit of subj.units) {
      det.append(el('div', { class: 'small muted', style: 'margin:8px 0 4px;font-weight:600' },
        `Unit ${unit.n} \u00b7 ${unit.title}`));
      for (const topic of unit.topics) {
        const key = `${unit.id}::${topic.id}`;
        const on = chosen.has(key);
        det.append(el('label', { class: 'check', style: 'margin-bottom:2px' },
          el('input', {
            type: 'checkbox',
            checked: on,
            'data-topic-key': key,
            onchange: (ev) => update((s) => {
              if (!s.overrides.todayPicks) s.overrides.todayPicks = {};
              const list = new Set(s.overrides.todayPicks[date] || []);
              if (ev.target.checked) list.add(key);
              else list.delete(key);
              s.overrides.todayPicks[date] = [...list];
            }),
          }),
          el('span', { class: 'truncate', title: topic.title }, topic.title),
        ));
      }
    }
    wrap.append(det);
  }
  return wrap;
}

function blockTodayCard(a, date, day) {
  const st = a.state;
  const blocked = st.settings.busyDays[date] === 0;
  const c = el('div', { class: 'card' });

  if (blocked) {
    c.append(el('div', { class: 'title' }, 'Today is blocked'));
    c.append(el('p', { class: 'small muted', style: 'margin:4px 0 10px' },
      'No study time is counted for today. Everything that was planned here has moved to a later day.'));
    const b = el('button', { class: 'sm' }, 'Undo — I can study today');
    b.addEventListener('click', () => {
      update((s) => { delete s.settings.busyDays[date]; });
    });
    c.append(b);
    return c;
  }

  if (day.availableMin <= 0) return c;

  c.append(el('div', { class: 'title' }, 'Not studying today?'));
  c.append(el('p', { class: 'small muted', style: 'margin:4px 0 10px' },
    'Started late, or nothing left today? Block today and the plan starts tomorrow instead. '
    + 'Nothing you have already logged is lost.'));

  const b = el('button', { class: 'sm' }, 'Start tomorrow instead');
  const logged = (day.sessions || []).length;
  b.addEventListener('click', () => {
    const apply = () => {
      update((s) => { s.settings.busyDays[date] = 0; });
    };
    if (!logged) { apply(); return; }
    openModal('Block today?', (body) => {
      body.append(el('p', {},
        `You have already logged ${logged} session${logged === 1 ? '' : 's'} today. `
        + 'Those sessions stay on record, but today gets no further study time and the remaining work '
        + 'moves to a later day.'));
    }, [
      { label: 'Block today', primary: true, run: () => { apply(); } },
      { label: 'Cancel', run: (close) => close() },
    ]);
  });
  c.append(b);
  return c;
}

function dayHeader(a, day, date, isToday) {
  const c = el('div', { class: 'card' });
  const m = el('div', { class: 'metric-grid' });
  m.append(statCard('Planned', fmtMinutes(day.plannedMin)));
  m.append(statCard('Available', fmtMinutes(day.availableMin)));
  m.append(statCard('Logged', fmtMinutes(day.actualMin || 0)));
  m.append(statCard('Tasks', String(day.tasks.length)));
  c.append(m);
  if (day.availableMin > 0) {
    c.append(el('div', { style: 'margin-top:12px' }, barRow((day.plannedMin / day.availableMin) * 100)));
  }
  if (day.note) c.append(el('p', { class: 'small muted', style: 'margin:10px 0 0' }, day.note));
  if (day.phase && day.phase !== 'normal') {
    c.append(el('p', { class: 'small', style: 'margin:6px 0 0' },
      el('span', { class: 'badge accent' }, `Exam Mode: ${day.phase}`),
      ' New chapters are paused and only maintenance work is scheduled.'));
  }
  return c;
}

function missedCard(a) {
  const missed = a.plan.missed;
  const c = el('div', { class: 'card', style: 'border-color:var(--high)' });
  c.append(el('div', { class: 'card-head' },
    el('h2', {}, `${missed.length} unlogged session${missed.length === 1 ? '' : 's'}`),
  ));
  c.append(el('p', { class: 'small muted' },
    'These are past plan blocks with no session recorded. Log them honestly — the planner will redistribute the work. ' +
    'Guessing here is what makes a planner lie to you.'));

  const total = missed.reduce((x, m2) => x + m2.plannedMin, 0);
  c.append(el('p', { class: 'small', style: 'margin:0 0 10px' },
    el('b', {}, fmtMinutes(total)), ' of planned work has no record.'));

  const list = el('div', { class: 'list' });
  for (const m of missed.slice(0, 8)) {
    const r = el('div', { class: 'row wrap' });
    r.append(el('span', { class: 'tag mono' }, fmtDate(m.date, { day: 'numeric', month: 'short' })));
    const g = el('div', { class: 'grow' });
    g.append(el('div', { class: 'title truncate' }, m.title));
    g.append(el('div', { class: 'meta' }, `${m.type} · ${fmtMinutes(m.plannedMin)}`));
    r.append(g);
    for (const [label, outcome] of [['Done', OUTCOMES.DONE], ['Partial', OUTCOMES.PARTIAL], ['Skipped', OUTCOMES.SKIPPED]]) {
      const b = el('button', { class: 'sm' }, label);
      b.addEventListener('click', () => logMissed(a, m, outcome));
      r.append(b);
    }
    list.append(r);
  }
  c.append(list);
  return c;
}

function logMissed(a, m, outcome) {
  const task = a.plan.plan[m.date]?.tasks.find((t) => t.id === m.taskId) || m;
  const f = outcome === OUTCOMES.PARTIAL ? 0.5 : outcome === OUTCOMES.DONE ? 1 : 0;
  update((st) => {
    logTask(st, a.index, m.date, task, outcome, outcome === OUTCOMES.SKIPPED ? 0 : Math.round(m.plannedMin * (f || 0.5)), f);
  });
}

function taskCard(a, t, done, date) {
  const c = el('div', { class: `task${done ? ' done' : ''}` });
  c.dataset.priority = t.priority || 'normal';

  const top = el('div', { class: 'task-top' });
  const g = el('div', { class: 'grow' });
  g.append(el('div', { class: 'task-type' }, TYPE_LABEL[t.type] || t.type));
  g.append(el('div', { class: 'task-title' }, t.title));
  const meta = [];
  if (t.subjectName) meta.push(t.subjectName);
  if (t.unitTitle) meta.push(t.unitTitle);
  if (t.mcq) meta.push(`${t.mcq} MCQs`);
  if (meta.length) g.append(el('div', { class: 'meta' }, meta.join(' · ')));
  top.append(g);
  top.append(el('span', { class: `badge ${t.priority}` }, t.priority));
  top.append(el('span', { class: 'mono small nowrap' }, fmtMinutes(t.plannedMin)));
  c.append(top);

  if (t.detail) c.append(el('div', { class: 'task-detail' }, t.detail));
  if (t.reason) c.append(el('div', { class: 'task-reason' }, t.reason));

  if (Array.isArray(t.subtopics) && t.subtopics.length > 1) {
    const wrap = el('div', { class: 'task-subtopics' });
    for (const s of t.subtopics) wrap.append(el('span', { class: 'tag' }, s));
    c.append(wrap);
  }

  if (typeof t.progressBefore === 'number' && typeof t.progressAfter === 'number') {
    c.append(el('div', { class: 'small muted' },
      `Progress on this topic: ${t.progressBefore}% → ${t.progressAfter}%`));
  }

  // A chapter can hold several subtopics, so one block can leave some of them
  // untouched. Without this the chapter simply reappears and looks ignored.
  if (typeof t.subtopicsTotal === 'number' && t.subtopicsTotal > 1) {
    c.append(el('div', { class: 'small muted' },
      `${t.subtopicsDone} of ${t.subtopicsTotal} subtopics done`
      + (t.subtopicsDone >= t.subtopicsTotal ? ' — chapter complete' : '')));
  }

  if (!done) {
    const actions = el('div', { class: 'task-actions' });
    for (const key of ['DONE', 'PARTIAL', 'SLOW', 'TOO_DIFFICULT', 'SKIPPED']) {
      const b = el('button', { class: key === 'DONE' ? 'primary sm' : 'sm' }, outcomeWord(key));
      // The button you press is the outcome that opens preselected.
      b.addEventListener('click', () => openLogDialog(a, t, date, key));
      actions.append(b);
    }
    c.append(actions);
  } else {
    c.append(el('div', { class: 'task-actions' },
      el('span', { class: 'badge good' }, 'Logged')));
  }
  return c;
}

function outcomeWord(key) {
  return {
    DONE: 'Done', PARTIAL: 'Partly done', SLOW: 'Took longer', TOO_DIFFICULT: 'Too difficult', SKIPPED: 'Skipped',
  }[key];
}
/** Log dialog: real minutes, real fraction, real difficulty rating. */
function openLogDialog(a, task, date, preselect) {
  const item = task.itemId ? a.index.byId.get(task.itemId) : null;
  openModal('Log this session', (body) => {
    body.append(el('p', { class: 'small muted' },
      `${TYPE_LABEL[task.type] || task.type} · planned ${fmtMinutes(task.plannedMin)}`));

    body.append(el('p', {}, el('b', {}, task.title)));

    const outcomeSel = el('select');
    for (const k of Object.keys(OUTCOMES)) {
      const o = el('option', { value: k }, OUTCOME_LABEL[k] || k);
      outcomeSel.append(o);
    }
    outcomeSel.value = preselect && OUTCOMES[preselect] ? OUTCOMES[preselect] : OUTCOMES.DONE;
    let outcome = outcomeSel.value;
    outcomeSel.addEventListener('change', () => { outcome = outcomeSel.value; sync(); });
    const ol = el('label', { class: 'field' });
    ol.append(el('span', {}, 'Outcome'), outcomeSel);
    body.append(ol);

    const minIn = el('input', { type: 'number', min: '0', max: '600', step: '5', value: String(task.plannedMin) });
    const ml = el('label', { class: 'field' });
    ml.append(el('span', {}, 'Minutes actually spent'), minIn);
    body.append(ml);

    const fr = el('input', { type: 'range', min: '0', max: '100', step: '10', value: '100' });
    const frOut = el('span', { class: 'mono' }, '100%');
    const fl = el('label', { class: 'field' });
    fl.append(el('span', {}, 'How much of the planned work got done '), frOut);
    fr.addEventListener('input', () => { frOut.textContent = `${fr.value}%`; });
    fl.append(fr);
    body.append(fl);

    const diffSel = el('select');
    for (const [v, l] of [[0, 'Way too easy'], [1, 'A bit easy'], [2, 'About right'], [3, 'Somewhat hard'], [4, 'Very hard']]) {
      diffSel.append(el('option', { value: String(v) }, l));
    }
    diffSel.value = '2';
    const dl = el('label', { class: 'field' });
    dl.append(el('span', {}, 'How hard was this?'), diffSel);
    dl.append(el('small', {}, 'Affects time estimates and priority, so future plans get more accurate.'));
    body.append(dl);

    const mcqIn = el('input', { type: 'number', min: '0', max: '200', step: '1', value: String(task.mcq || 0) });
    const mcl = el('label', { class: 'field' });
    mcl.append(el('span', {}, 'MCQs attempted (optional)'), mcqIn);
    body.append(mcl);

    const corIn = el('input', { type: 'number', min: '0', max: '200', step: '1', value: '' });
    const corl = el('label', { class: 'field' });
    corl.append(el('span', {}, 'MCQs correct (optional — leave blank if you have not checked)'), corIn);
    corl.append(el('small', {}, 'Only fill this in with a real result. The app never guesses your accuracy.'));
    body.append(corl);

    const warn = el('p', { class: 'small muted' });
    body.append(warn);

    function sync() {
      const parts = [];
      if (outcome === OUTCOMES.SKIPPED) parts.push('Nothing will be recorded against progress. The topic returns to the pool.');
      if (Number(corIn.value) > Number(mcqIn.value || 0)) parts.push('Correct cannot exceed attempted — the form will ignore it.');
      warn.textContent = parts.join(' ');
    }
    [outcomeSel, minIn, fr, diffSel, mcqIn, corIn].forEach((n) => n.addEventListener('input', sync));
    sync();

    body._collect = () => {
      const f = Number(fr.value) / 100;
      const actual = outcome === OUTCOMES.SKIPPED ? 0 : Number(minIn.value) || 0;
      const att = Number(mcqIn.value) || 0;
      const cor = corIn.value === '' ? null : Math.min(att, Number(corIn.value) || 0);
      return { outcome, f, actual, difficulty: Number(diffSel.value), att, cor };
    };
  }, [
    { label: 'Cancel', run: (close) => close() },
    {
      label: 'Save session',
      primary: true,
      run: (close, body) => {
        const v = body._collect();
        close();
        update((st) => {
          const d = Number(v.difficulty);
          if (item && d !== 2) st.items[task.itemId].difficulty = d;
          if (v.att > 0) {
            const rec = st.items[task.itemId];
            rec.mcq = rec.mcq || { att: 0, correct: 0, streak: 0, last: null };
            rec.mcq.att += v.att;
            if (v.cor !== null) {
              rec.mcq.correct += v.cor;
              rec.mcq.streak = v.cor >= v.att * 0.7 ? (rec.mcq.streak || 0) + 1 : 0;
            }
            rec.mcq.last = new Date().toISOString();
          }
          logTask(st, a.index, date, task, v.outcome, v.actual, v.f);
        });
      },
    },
  ]);
}

function sessionLog(a, day) {
  const c = el('div', { class: 'card' });
  c.append(el('h2', {}, 'Logged sessions'));
  const wrap = el('div', { class: 'table-wrap' });
  const t = el('table');
  t.append(el('thead', {}, el('tr', {},
    el('th', {}, 'Task'), el('th', {}, 'Outcome'),
    el('th', { class: 'num' }, 'Planned'), el('th', { class: 'num' }, 'Actual'))));
  const tb = el('tbody');
  for (const s of day.sessions) {
    tb.append(el('tr', {},
      el('td', {}, s.title || '—'),
      el('td', {}, el('span', { class: 'badge' }, OUTCOME_LABEL[s.outcome] || s.outcome)),
      el('td', { class: 'num' }, fmtMinutes(s.plannedMin)),
      el('td', { class: 'num' }, fmtMinutes(s.actualMin)),
    ));
  }
  t.append(tb);
  wrap.append(t);
  c.append(wrap);

  const back = el('button', { class: 'sm danger', style: 'margin-top:10px' }, 'Undo all logs on this day');
  back.addEventListener('click', () => {
    const n = (day.sessions || []).length;
    if (!confirm(`Remove all ${n} session(s) logged on this day and restore the progress they recorded?`)) return;
    const res = update((st) => undoSessions(st, day.date || a.route.params.date || todayISO()));
    if (res && res.removed) {
      openModal('Sessions undone', (b) => {
        b.append(el('p', {},
          `Removed ${res.removed} logged session${res.removed === 1 ? '' : 's'} and restored ${res.restored} progress record${res.restored === 1 ? '' : 's'}.`));
        b.append(el('p', { class: 'small muted' },
          'The plan for the day has been re-derived from your actual remaining work.'));
      }, [{ label: 'Close', primary: true, run: (close) => close() }]);
    }
  });
  c.append(back);
  return c;
}
