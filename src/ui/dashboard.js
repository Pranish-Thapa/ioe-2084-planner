/**
 * Dashboard — the single answer to "what do I do today, and am I going to
 * make it?". Everything here is derived; nothing is stored.
 */

import { el } from '../util/dom.js';
import { todayISO, addDays, fmtMinutes, fmtDate, relDayLabel } from '../util/dates.js';


import { barRow, statCard, emptyState, update } from '../app.js';

const TONE = { on_track: 'good', tight: 'high', high: 'critical', impossible: 'critical', done: 'good' };

export function renderDashboard(a) {
  const st = a.state;
  const s = a.assessment;
  const today = todayISO();
  const day = a.plan.plan[today];
  const wrap = el('div', { class: 'stack' });

  wrap.append(head(a, s, day));

  // --- Today's headline ------------------------------------------------
  const cols = el('div', { class: 'grid cols-2' });
  cols.append(todayCard(a, day));
  cols.append(deadlineCard(a, s));
  wrap.append(cols);

  // --- Syllabus coverage ----------------------------------------------
  wrap.append(coverageCard(a));

  // --- Chapters needing attention -------------------------------------
  const attention = a.chapters
    .filter((c) => !c.complete)
    .slice(0, 6);
  if (attention.length) {
    const c = el('div', { class: 'card pad-0' });
    c.append(el('div', { class: 'row' },
      el('h2', { class: 'grow' }, 'Chapters to work next'),
      el('a', { class: 'btn sm', href: '#/syllabus' }, 'Open Syllabus'),
    ));
    const list = el('div', { class: 'list' });
    for (const ch of attention) list.append(chapterRow(a, ch));
    c.append(list);
    wrap.append(c);
  }

  // --- Recent + upcoming ------------------------------------------------
  const two = el('div', { class: 'grid cols-2' });
  two.append(weekCard(a));
  two.append(logsCard(a));
  wrap.append(two);

  return wrap;
}

function head(a, s, day) {
  const h = el('div', { class: 'page-head' });
  h.append(el('h1', {}, 'Dashboard'));
  const phase = a.plan.meta;
  h.append(el('p', { class: 'sub' },
    `${relDayLabel(phase.today, phase.today)} · ${phase.phaseLabel} · `,
    day && day.tasks.length
      ? `${day.tasks.length} task${day.tasks.length === 1 ? '' : 's'}, ${fmtMinutes(day.plannedMin)} planned`
      : 'nothing planned today',
  ));
  return h;
}

function todayCard(a, day) {
  const c = el('div', { class: 'card' });
  c.append(el('div', { class: 'card-head' },
    el('h2', {}, "Today's plan"),
    el('a', { class: 'btn sm', href: '#/today' }, 'Open'),
  ));

  if (a.plan.meta.phase && a.plan.meta.phase !== 'learn' && a.plan.meta.syllabusLearned) {
    c.append(el('p', { class: 'small muted' }, a.plan.meta.phaseLabel));
  }

  if (!day || !day.tasks.length) {
    c.append(emptyState(
      day && day.closed ? day.closedReason : 'No study blocks today',
      day && day.closed ? 'The work has been redistributed to other days.' : 'Either you have finished everything scheduled, or the day is fully blocked.',
    ));
    return c;
  }

  const total = day.plannedMin;
  const avail = day.availableMin;
  c.append(el('div', { class: 'metric-grid', style: 'margin-bottom:12px' },
    statCard('Planned', fmtMinutes(total)),
    statCard('Available', fmtMinutes(avail)),
    statCard('Done', `${day.sessions ? day.sessions.length : 0}/${day.tasks.length}`),
  ));
  c.append(barRow(avail > 0 ? (total / avail) * 100 : 0));

  const list = el('div', { class: 'list', style: 'margin-top:12px' });
  for (const t of day.tasks.slice(0, 5)) {
    const r = el('div', { class: 'row' });
    r.append(el('span', { class: `badge ${t.priority}` }, t.priority));
    const g = el('div', { class: 'grow' });
    g.append(el('div', { class: 'title truncate' }, t.title));
    g.append(el('div', { class: 'meta' }, `${t.type} · ${t.subjectName || '—'}`));
    r.append(g, el('span', { class: 'mono small' }, fmtMinutes(t.plannedMin)));
    list.append(r);
  }
  c.append(list);
  if (day.tasks.length > 5) {
    c.append(el('p', { class: 'small muted', style: 'margin:10px 0 0' },
      `+ ${day.tasks.length - 5} more`));
  }
  return c;
}

function deadlineCard(a, s) {
  const c = el('div', { class: 'card' });
  c.append(el('div', { class: 'card-head' }, el('h2', {}, 'Deadline feasibility')));
  c.append(el('div', { class: 'inline', style: 'margin-bottom:10px' },
    el('span', { class: `badge ${TONE[s.level] || 'low'}` },
      { on_track: 'On track', tight: 'Tight', high: 'High risk', impossible: 'Not possible', done: 'Syllabus done' }[s.level]),
    el('span', { class: 'small muted' }, s.daysLeft >= 0 ? `${s.daysLeft} days left` : 'Deadline passed'),
  ));
  c.append(el('p', { class: 'small' }, s.message));

  const dl = el('dl', { class: 'kv', style: 'margin-top:10px' });
  const row = (k, v) => dl.append(el('dt', {}, k), el('dd', { class: 'mono' }, v));
  row('Work remaining', fmtMinutes(s.work.total));
  row('Capacity left', fmtMinutes(s.capacityTotal));
  row('Needed per day', s.requiredPerDay ? fmtMinutes(s.requiredPerDay) : '—');
  if (s.sustainablePerDay) row('Sustainable pace', fmtMinutes(s.sustainablePerDay));
  if (s.actualAvg) row('Your recent average', fmtMinutes(s.actualAvg));
  if (s.projectedFinish) row('Projected finish', s.projectedFinish);
  c.append(dl);

  if (s.daysOverdue > 0) {
    c.append(el('div', { class: 'card', style: 'background:var(--critical-soft);margin-top:12px' },
      el('b', { style: 'color:var(--critical)' },
        `At your current average you finish ${s.daysOverdue} day${s.daysOverdue === 1 ? '' : 's'} after the deadline.`)));
  }

  if (s.suggestions && s.suggestions.length) {
    c.append(el('h3', { style: 'margin-top:14px' }, 'What to change'));
    const ul = el('ul', { class: 'small', style: 'margin:0;padding-left:18px' });
    for (const t of s.suggestions.slice(0, 5)) ul.append(el('li', { style: 'margin-bottom:5px' }, t));
    c.append(ul);
  }
  return c;
}

function coverageCard(a) {
  const cov = a.assessment.coverage;
  const c = el('div', { class: 'card' });
  c.append(el('div', { class: 'card-head' },
    el('h2', {}, 'Syllabus coverage'),
    el('a', { class: 'btn sm', href: '#/progress' }, 'Breakdown'),
  ));
  c.append(barRow(cov.completionPct, cov.completionPct >= 80 ? 'good' : ''));
  c.append(el('p', { class: 'small muted', style: 'margin:6px 0 12px' },
    `${cov.completed} of ${cov.total} subtopics complete · ${fmtMinutes(cov.minutesRemaining)} of new work left`));

  const g = el('div', { class: 'metric-grid' });
  g.append(statCard('Not started', String(cov.not_started || 0)));
  g.append(statCard('Studying', String(cov.studying || 0)));
  g.append(statCard('Weak', String(cov.weak || 0)));
  g.append(statCard('Strong', String(cov.strong || 0)));
  g.append(statCard('Mastered', String(cov.mastered || 0)));
  c.append(g);

  const per = el('div', { class: 'table-wrap', style: 'margin-top:14px' });
  const t = el('table');
  t.append(el('thead', {}, el('tr', {},
    el('th', {}, 'Subject'), el('th', { class: 'num' }, 'Done'),
    el('th', { class: 'num' }, 'Total'), el('th', {}, 'Progress'),
    el('th', { class: 'num' }, 'Left'))));
  const tb = el('tbody');
  for (const s of a.index.subjects) {
    const ids = s.units.flatMap((u) => u.itemIds);
    const done = ids.filter((id) => a.state.items[id] && a.state.items[id].progressPct >= 100).length;
    const pct = ids.length ? (done / ids.length) * 100 : 0;
    const tr = el('tr');
    tr.append(el('td', {}, s.name));
    tr.append(el('td', { class: 'num' }, String(done)));
    tr.append(el('td', { class: 'num' }, String(ids.length)));
    tr.append(el('td', { style: 'min-width:120px' }, barRow(pct, pct >= 80 ? 'good' : '')));
    tr.append(el('td', { class: 'num' }, fmtMinutes(remainingOf(a, ids))));
    tb.append(tr);
  }
  t.append(tb);
  per.append(t);
  c.append(per);
  return c;
}

function remainingOf(a, ids) {
  let m = 0;
  for (const id of ids) {
    const r = a.state.items[id];
    if (!r) continue;
    if (r.status === 'strong' || r.status === 'mastered') continue;
    const it = a.index.byId.get(id);
    const est = r.estMinOverride || estOf(a, it);
    m += Math.max(0, Math.round(est * (1 - r.progressPct / 100)));
  }
  return m;
}

function estOf(a, item) {
  if (!item) return 45;
  const base = a.index.subjects.find((s) => s.id === item.subjectId);
  const per = (base && base.minutesPerItem) || 45;
  return Math.round(per * (item.size || 1));
}

function chapterRow(a, ch) {
  const r = el('div', { class: 'row' });
  r.append(el('span', { class: 'tag mono' }, ch.unit.n));
  const g = el('div', { class: 'grow' });
  g.append(el('div', { class: 'title truncate' }, ch.unit.title));
  g.append(el('div', { class: 'meta' },
    `${ch.unit.subjectName} · ${ch.done}/${ch.unit.itemIds.length} subtopics · ${fmtMinutes(ch.remainingMin)} left`));
  r.append(g);
  if (ch.eta) r.append(el('span', { class: 'badge good' }, `ETA ${ch.eta}`));
  else r.append(el('span', { class: 'badge high' }, 'no ETA'));
  const go2 = el('a', { class: 'btn sm', href: `#/syllabus/${ch.unit.subjectId}/${ch.unit.id}` }, 'Open');
  r.append(go2);
  return r;
}

function weekCard(a) {
  const c = el('div', { class: 'card' });
  c.append(el('h2', {}, 'Next 7 days'));
  const list = el('div', { class: 'list' });
  const today = todayISO();
  for (let i = 0; i < 7; i++) {
    const d = addDays(today, i);
    const day = a.plan.plan[d];
    const r = el('div', { class: 'row' });
    const g = el('div', { class: 'grow' });
    g.append(el('div', { class: 'title' }, i === 0 ? 'Today' : relDayLabel(d, today)));
    g.append(el('div', { class: 'meta' }, fmtDate(d, { weekday: 'short', day: 'numeric', month: 'short' })));
    r.append(g);
    if (!day) { r.append(el('span', { class: 'muted small' }, '—')); }
    else if (day.closed) { r.append(el('span', { class: 'badge low' }, 'closed')); }
    else if (!day.tasks.length) { r.append(el('span', { class: 'muted small' }, 'free')); }
    else {
      r.append(el('span', { class: 'mono small' }, fmtMinutes(day.plannedMin)));
      r.append(el('span', { class: 'badge' }, `${day.tasks.length} tasks`));
    }
    r.append(el('a', { class: 'btn sm', href: `#/today/${d}` }, 'View'));
    list.append(r);
  }
  c.append(list);
  return c;
}

function logsCard(a) {
  const c = el('div', { class: 'card' });
  c.append(el('h2', {}, 'Recent activity'));
  const entries = (a.state.log || []).slice(0, 12);
  if (!entries.length) {
    c.append(emptyState('Nothing logged yet',
      'Log a task from Today\'s Plan and your progress, revision schedule and projections all update.'));
    return c;
  }
  const list = el('div', { class: 'list' });
  for (const e of entries) {
    const r = el('div', { class: 'row' });
    const g = el('div', { class: 'grow' });
    g.append(el('div', { class: 'truncate' }, e.message));
    g.append(el('div', { class: 'meta' }, `${e.kind} · ${(e.at || '').slice(0, 16).replace('T', ' ')}`));
    r.append(g);
    list.append(r);
  }
  c.append(list);
  return c;
}
