/**
 * Settings — everything the planner is allowed to assume, made editable.
 * Also the home of the syllabus validator, export/import, and Exam Mode.
 */

import { el } from '../util/dom.js';
import { todayISO, addDays, DOW, isValidISODate } from '../util/dates.js';
import { SYLLABUS_VERSION } from '../../data/syllabus.js';
import { runValidation } from '../core/validate.js';
import { addExam, removeExam, buildRecoveryPlan } from '../core/examMode.js';
import { exportJSON, importJSON, resetAll, pushLog } from '../core/store.js';

import { update, openModal, go, emptyState, statCard } from '../app.js';

export function renderSettings(a) {
  const st = a.state;
  const wrap = el('div', { class: 'stack' });
  const h = el('div', { class: 'page-head' });
  h.append(el('h1', {}, 'Settings'));
  h.append(el('p', { class: 'sub' }, 'Every assumption the planner makes is listed here, and every one of them is editable.'));
  wrap.append(h);

  wrap.append(targetSection(a));
  wrap.append(timeSection(a));
  wrap.append(plannerSection(a));
  wrap.append(examSection(a));
  wrap.append(dataSection(a));
  wrap.append(validationSection(a));
  return wrap;
}

function targetSection(a) {
  const st = a.state;
  const c = el('div', { class: 'card' });
  c.append(el('h2', {}, 'Target dates'));
  c.append(el('p', { class: 'small muted' },
    'The "finish" date is when you want the whole syllabus covered, including revision. The entrance date is only used for display and the final-phase switch.'));

  const f1 = el('label', { class: 'field' });
  f1.append(el('span', {}, 'Finish the whole syllabus by'));
  const d1 = el('input', { type: 'date', value: st.settings.deadline });
  d1.addEventListener('change', () => {
    update((s) => {
      s.settings.deadline = d1.value;
      pushLog(s, 'settings', `Syllabus target moved to ${d1.value}`);
    });
  });
  f1.append(d1);
  c.append(f1);

  const f2 = el('label', { class: 'field' });
  f2.append(el('span', {}, 'Entrance exam date'));
  const d2 = el('input', { type: 'date', value: st.settings.examDate });
  d2.addEventListener('change', () => { update((s) => { s.settings.examDate = d2.value; }); });
  f2.append(d2);
  f2.append(el('small', {}, 'Defaults to an assumption, not a published date. Check it against the official notice.'));
  c.append(f2);

  const presets = el('div', { class: 'btn-row' });
  for (const [label, days] of [['6 months', 182], ['9 months', 274], ['12 months', 365], ['18 months', 548]]) {
    const b = el('button', { class: 'sm' }, label);
    b.addEventListener('click', () => {
      if (!confirm(`Move the syllabus target to ${label} from today?`)) return;
      update((s) => { s.settings.deadline = addDays(todayISO(), days); });
    });
    presets.append(b);
  }
  c.append(presets);
  return c;
}

function timeSection(a) {
  const st = a.state;
  const c = el('div', { class: 'card' });
  c.append(el('h2', {}, 'Available time'));

  const num = (label, key, min, max, step, help) => {
    const f = el('label', { class: 'field' });
    f.append(el('span', {}, label));
    const i = el('input', { type: 'number', min: String(min), max: String(max), step: String(step), value: String(st.settings[key]) });
    i.addEventListener('change', () => {
      update((s) => { s.settings[key] = Math.max(min, Math.min(max, Number(i.value) || 0)); });
    });
    f.append(i);
    if (help) f.append(el('small', {}, help));
    return f;
  };

  const row = el('div', { class: 'field-row' });
  row.append(num('Weekday minutes', 'defaultDailyMinutes', 0, 900, 15));
  row.append(num('Weekend extra (per day)', 'weekendExtraMinutes', 0, 600, 15));
  c.append(row);

  const f = el('label', { class: 'field' });
  f.append(el('span', {}, `Safety buffer: ${st.settings.bufferPct}%`));
  const r = el('input', { type: 'range', min: '0', max: '30', step: '5', value: String(st.settings.bufferPct) });
  r.addEventListener('input', () => { f.firstChild.textContent = `Safety buffer: ${r.value}%`; });
  r.addEventListener('change', () => { update((s) => { s.settings.bufferPct = Number(r.value); }); });
  f.append(r);
  f.append(el('small', {}, 'Time held back for illness, festivals and homework. The app will never plan into the buffer.'));
  c.append(f);

  // Study days
  const sf = el('label', { class: 'field' });
  sf.append(el('span', {}, 'Study days'));
  const drow = el('div', { class: 'dow-row' });
  for (const d of DOW) {
    const on = st.settings.studyDays.includes(d);
    const lab = el('label', { class: on ? 'on' : '' });
    const inp = el('input', { type: 'checkbox' });
    inp.checked = on;
    inp.addEventListener('change', () => {
      update((s) => {
        const set = new Set(s.settings.studyDays);
        if (inp.checked) set.add(d); else set.delete(d);
        s.settings.studyDays = [...set].sort();
      });
    });
    lab.append(inp, el('span', {}, d));
    drow.append(lab);
  }
  sf.append(drow);
  c.append(sf);

  // Coaching
  const cf = el('label', { class: 'field' });
  cf.append(el('span', {}, 'Coaching days (35% less time)'));
  const crow = el('div', { class: 'dow-row' });
  for (const d of DOW) {
    const on = !!st.settings.coaching[d];
    const lab = el('label', { class: on ? 'on' : '' });
    const inp = el('input', { type: 'checkbox' });
    inp.checked = on;
    inp.addEventListener('change', () => {
      update((s) => {
        if (inp.checked) s.settings.coaching[d] = true; else delete s.settings.coaching[d];
      });
    });
    lab.append(inp, el('span', {}, d));
    crow.append(lab);
  }
  cf.append(crow);
  c.append(cf);

  // One-off days
  const bf = el('label', { class: 'field' });
  bf.append(el('span', {}, 'One-off day overrides'));
  const ta = el('textarea', { placeholder: '2027-01-15:0\n2027-02-20:90' });
  ta.value = Object.entries(st.settings.busyDays).map(([k, v]) => `${k}:${v}`).join('\n');
  ta.addEventListener('change', () => {
    const next = {};
    for (const line of ta.value.split(/\r?\n/)) {
      const s2 = line.trim();
      if (!s2) continue;
      const [d, v] = s2.split(':');
      if (isValidISODate(d)) next[d] = Math.max(0, Math.min(720, Number(v ?? 0) || 0));
    }
    update((s) => { s.settings.busyDays = next; });
  });
  bf.append(ta);
  bf.append(el('small', {}, 'One per line as date:minutes. 0 blocks the day entirely.'));
  c.append(bf);

  return c;
}

function plannerSection(a) {
  const st = a.state;
  const c = el('div', { class: 'card' });
  c.append(el('h2', {}, 'Planner behaviour'));

  const f = el('label', { class: 'field' });
  f.append(el('span', {}, `Smallest useful block: ${st.settings.minTaskMinutes} min`));
  const r = el('input', { type: 'range', min: '10', max: '45', step: '5', value: String(st.settings.minTaskMinutes) });
  r.addEventListener('input', () => { f.firstChild.textContent = `Smallest useful block: ${r.value} min`; });
  r.addEventListener('change', () => { update((s) => { s.settings.minTaskMinutes = Number(r.value); }); });
  f.append(r);
  f.append(el('small', {}, 'Below this, the planner will not create a block — it will give the time to a bigger day instead.'));
  c.append(f);

  const f2 = el('label', { class: 'field' });
  f2.append(el('span', {}, `Longest single block: ${st.settings.maxTaskMinutes} min`));
  const r2 = el('input', { type: 'range', min: '30', max: '120', step: '10', value: String(st.settings.maxTaskMinutes) });
  r2.addEventListener('input', () => { f2.firstChild.textContent = `Longest single block: ${r2.value} min`; });
  r2.addEventListener('change', () => { update((s) => { s.settings.maxTaskMinutes = Number(r2.value); }); });
  f2.append(r2);
  c.append(f2);

  const f3 = el('label', { class: 'field' });
  f3.append(el('span', {}, `Mixed MCQ set size: ${st.settings.mixedMcqSize}`));
  const r3 = el('input', { type: 'range', min: '5', max: '40', step: '5', value: String(st.settings.mixedMcqSize) });
  r3.addEventListener('input', () => { f3.firstChild.textContent = `Mixed MCQ set size: ${r3.value}`; });
  r3.addEventListener('change', () => { update((s) => { s.settings.mixedMcqSize = Number(r3.value); }); });
  f3.append(r3);
  c.append(f3);

  const f4 = el('label', { class: 'field' });
  f4.append(el('span', {}, 'Revision intervals (days between passes)'));
  const ri = el('input', { type: 'text', value: st.settings.revisionIntervals.join(', ') });
  ri.addEventListener('change', () => {
    const v = ri.value.split(',').map((x) => Math.max(1, Math.min(120, Number(String(x).trim()) || 1))).slice(0, 8);
    if (!v.length) return;
    update((s) => { s.settings.revisionIntervals = v; });
  });
  f4.append(ri);
  f4.append(el('small', {}, 'Lengthens automatically for topics you answer correctly, compresses for topics you miss.'));
  c.append(f4);

  const arch = el('label', { class: 'check' });
  const cb = el('input', { type: 'checkbox' });
  cb.checked = !!st.settings.includeBArch;
  cb.addEventListener('change', () => { update((s) => { s.settings.includeBArch = cb.checked; }); });
  arch.append(cb, el('span', {}, 'Include B.Arch-only topics'));
  c.append(arch);

  // Subject weights
  const wf = el('label', { class: 'field' });
  wf.append(el('span', {}, 'Subject weights'));
  const wrow = el('div', { class: 'field-row' });
  for (const s of a.index.subjects) {
    const f5 = el('label', { class: 'field' });
    f5.append(el('span', {}, s.name));
    const rr = el('input', { type: 'range', min: '0.5', max: '2', step: '0.1', value: String(st.settings.subjectWeight[s.id] ?? 1) });
    rr.addEventListener('change', () => { update((x) => { x.settings.subjectWeight[s.id] = Number(rr.value); }); });
    f5.append(rr);
    wrow.append(f5);
  }
  wf.append(wrow);
  c.append(wf);

  const pinned = st.overrides.pinnedItemIds || [];
  if (pinned.length) {
    c.append(el('h3', { style: 'margin-top:12px' }, `Pinned topics (${pinned.length})`));
    const pr = el('div', { class: 'btn-row' });
    const clr = el('button', { class: 'sm' }, 'Unpin everything');
    clr.addEventListener('click', () => { update((s) => { s.overrides.pinnedItemIds = []; }); });
    pr.append(clr);
    c.append(pr);
  }
  return c;
}

function examSection(a) {
  const st = a.state;
  const c = el('div', { class: 'card' });
  c.append(el('div', { class: 'card-head' },
    el('h2', {}, 'Exam Mode'),
    el('span', { class: 'badge accent' }, `${(st.exams || []).length} added`)));
  c.append(el('p', { class: 'small muted' },
    'Add your school exams. During an exam the planner stops starting new chapters and cuts IOE load to revision and practice only, ',
    'then raises it again afterwards. It will not guess your exam dates for you.'));

  const list = el('div', { class: 'list' });
  for (const ex of st.exams || []) {
    const r = el('div', { class: 'row wrap' });
    const g = el('div', { class: 'grow' });
    g.append(el('div', { class: 'title' }, ex.name));
    g.append(el('div', { class: 'meta' },
      `${ex.start} → ${ex.end} · ${(ex.subjects || []).join(', ') || 'all subjects'} · ${ex.availableMinPerDay} min/day`));
    r.append(g);
    const rp = el('button', { class: 'sm' }, 'Recovery plan');
    rp.addEventListener('click', () => showRecovery(a, ex));
    r.append(rp);
    const del = el('button', { class: 'sm danger' }, 'Remove');
    del.addEventListener('click', () => { update((s) => removeExam(s, ex.id)); });
    r.append(del);
    list.append(r);
  }
  if (!(st.exams || []).length) list.append(emptyState('No exams added', 'Normally 2–4 school or entrance exams per year.'));
  c.append(list);

  const f = el('div', { style: 'margin-top:14px' });
  const name = el('input', { type: 'text', placeholder: 'e.g. Pre-board Exam' });
  const start = el('input', { type: 'date', value: addDays(todayISO(), 14) });
  const end = el('input', { type: 'date', value: addDays(todayISO(), 20) });
  const mins = el('input', { type: 'number', min: '0', max: '600', step: '15', value: '90' });

  const grid = el('div', { class: 'field-row' });
  const mk = (label, node) => { const l = el('label', { class: 'field' }); l.append(el('span', {}, label), node); return l; };
  grid.append(mk('Name', name), mk('Start', start), mk('End', end), mk('Minutes/day still available', mins));
  f.append(grid);

  const subs = el('label', { class: 'field' });
  subs.append(el('span', {}, 'Subjects in this exam (these lose IOE time)'));
  const chips = el('div', { class: 'chip-row' });
  const chosen = new Set();
  for (const s of a.index.subjects) {
    const b = el('button', { class: 'sm' }, s.name);
    b.addEventListener('click', () => {
      if (chosen.has(s.id)) { chosen.delete(s.id); b.classList.remove('primary'); }
      else { chosen.add(s.id); b.classList.add('primary'); }
    });
    chips.append(b);
  }
  subs.append(chips);
  f.append(subs);

  const add = el('button', { class: 'primary' }, 'Add exam');
  add.addEventListener('click', () => {
    if (!name.value.trim()) { alert('Give the exam a name.'); return; }
    if (end.value < start.value) { alert('The end date cannot be before the start date.'); return; }
    update((s) => {
      addExam(s, {
        name: name.value.trim(),
        start: start.value,
        end: end.value,
        subjects: a.index.subjects.filter((x) => chosen.has(x.id)).map((x) => x.name),
        availableMinPerDay: Math.max(0, Number(mins.value) || 0),
        priority: 'high',
      });
      pushLog(s, 'exam', `Exam Mode added: ${name.value.trim()} (${start.value} → ${end.value})`);
    });
    name.value = '';
  });
  f.append(add);
  c.append(f);
  return c;
}

function showRecovery(a, exam) {
  openModal('Recovery plan', (body) => {
    const p = buildRecoveryPlan(a.state, a.index, exam);
    body.append(el('p', { class: 'small muted' },
      `The ${p.examDays} days after ${exam.name} end are treated as a recovery window, then IOE load returns to normal. ` +
      'Recovery is capped so it cannot quietly swallow your whole plan.'));
    const g = el('div', { class: 'metric-grid' });
    g.append(statCard('Recovery days', String(p.recoveryDays)));
    g.append(statCard('Load multiplier', `${p.multiplier}×`));
    g.append(statCard('During exam', `${p.duringMultiplier}×`));
    g.append(statCard('Back to normal', p.resumeDate || '—'));
    body.append(g);
    if (p.notes && p.notes.length) {
      const ul = el('ul', { class: 'small', style: 'margin-top:12px;padding-left:18px' });
      for (const n of p.notes) ul.append(el('li', { style: 'margin-bottom:4px' }, n));
      body.append(ul);
    }
  }, [{ label: 'Close', run: (close) => close(), primary: true }]);
}

function dataSection(a) {
  const st = a.state;
  const c = el('div', { class: 'card' });
  c.append(el('h2', {}, 'Your data'));
  c.append(el('p', { class: 'small muted' },
    'Everything lives in this browser\'s localStorage. There is no account and no server. ',
    'Export regularly if the progress matters to you.'));

  const size = (() => {
    try { return Math.round(JSON.stringify(st).length / 1024); } catch { return 0; }
  })();

  const g = el('div', { class: 'metric-grid' });
  g.append(statCard('Storage used', `${size} KB`));
  g.append(statCard('Logged sessions', String(Object.values(st.days || {}).reduce((x, d) => x + ((d && d.sessions) || []).length, 0))));
  g.append(statCard('Subtopics tracked', String(Object.keys(st.items || {}).length)));
  g.append(statCard('Mistakes recorded', String((st.mistakes || []).length)));
  c.append(g);

  const row = el('div', { class: 'btn-row', style: 'margin-top:14px' });

  const exp = el('button', { class: 'primary' }, 'Export as JSON');
  exp.addEventListener('click', () => {
    const text = exportJSON(st);
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a2 = el('a', { href: url, download: `ioe-planner-${todayISO()}.json` });
    document.body.append(a2);
    a2.click();
    a2.remove();
    URL.revokeObjectURL(url);
  });
  row.append(exp);

  const imp = el('button', {}, 'Import from JSON');
  imp.addEventListener('click', () => {
    const inp = el('input', { type: 'file', accept: '.json,application/json' });
    inp.addEventListener('change', async () => {
      const f = inp.files && inp.files[0];
      if (!f) return;
      try {
        const text = await f.text();
        const next = importJSON(text);
        if (!next) { alert('That file could not be read as planner data.'); return; }
        if (!confirm(`Replace your current data with the imported file?\n\nImported: ${Object.keys(next.items || {}).length} subtopics, deadline ${next.settings.deadline}.`)) return;
        update(() => { a.state = next; }, { keep: true });
        location.reload();
      } catch (err) {
        alert(`Import failed: ${err.message}`);
      }
    });
    inp.click();
  });
  row.append(imp);

  const csv = el('button', {}, 'Export progress as CSV');
  csv.addEventListener('click', () => exportCSV(a));
  row.append(csv);

  c.append(row);

  const danger = el('div', { style: 'margin-top:18px' });
  danger.append(el('hr', { class: 'sep' }));
  const reset = el('button', { class: 'danger' }, 'Erase all progress');
  reset.addEventListener('click', () => {
    if (!confirm('Erase ALL progress, logs, mistakes and settings? This cannot be undone.')) return;
    if (!confirm('Are you certain? Export first if you want a backup.')) return;
    resetAll();
    location.hash = '';
    location.reload();
  });
  danger.append(reset);
  c.append(danger);
  return c;
}

function exportCSV(a) {
  const rows = [['item_id', 'subject', 'unit', 'topic', 'subtopic', 'status', 'progress_pct', 'mcq_attempted', 'mcq_correct', 'next_revision']];
  for (const s of a.index.subjects) {
    for (const u of s.units) {
      for (const t of u.topics) {
        for (const id of t.itemIds) {
          const r = a.state.items[id] || {};
          const m = r.mcq || {};
          rows.push([id, s.name, `${u.n}. ${u.title}`, t.title,
            (a.index.byId.get(id) || {}).title || '', r.status || '', r.progressPct ?? 0,
            m.att ?? 0, m.correct ?? 0, r.nextRevisionDue || '']);
        }
      }
    }
  }
  const csv = rows.map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const link = el('a', { href: url, download: `ioe-progress-${todayISO()}.csv` });
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function validationSection(a) {
  const c = el('div', { class: 'card' });
  c.append(el('h2', {}, 'Syllabus validation'));
  c.append(el('p', { class: 'small muted' },
    `The shipped database is validated against itself on every page load, so a broken or partial syllabus can never go unnoticed. ` +
    `Current version: ${SYLLABUS_VERSION}.`));

  const result = a.scratch.validation || runValidation(a.state, { index: a.index });
  const g = el('div', { class: 'metric-grid' });
  g.append(statCard('Status', result.ok ? 'Valid' : `${result.errors.length} errors`, result.ok ? 'no problems found' : '', result.ok ? 'good' : 'critical'));
  g.append(statCard('Subjects', String(result.totals.subjects)));
  g.append(statCard('Chapters', String(result.totals.units)));
  g.append(statCard('Subtopics', String(result.totals.items)));
  g.append(statCard('Questions mapped', `${result.questionBank.mapped}/${result.questionBank.total}`));
  c.append(g);

  if (result.errors.length) {
    const ul = el('ul', { class: 'small', style: 'color:var(--critical);padding-left:18px' });
    for (const e of result.errors.slice(0, 12)) ul.append(el('li', { style: 'margin-bottom:3px' }, e));
    c.append(ul);
  }
  if (result.warnings.length) {
    const ul = el('ul', { class: 'small muted', style: 'padding-left:18px' });
    for (const w of result.warnings.slice(0, 8)) ul.append(el('li', { style: 'margin-bottom:3px' }, w));
    c.append(ul);
  }

  // Layer 3: paste an official baseline and diff it.
  const f = el('label', { class: 'field', style: 'margin-top:14px' });
  f.append(el('span', {}, 'Verify against the official notice (optional)'));
  const ta = el('textarea', { placeholder: 'Paste the official syllabus headings here to prove nothing is missing…' });
  ta.style.minHeight = '140px';
  f.append(ta);
  f.append(el('small', {}, 'Every heading you paste is matched against the database. Anything in your paste that is not in the database is reported as missing — that is how you catch a syllabus change without trusting this app.'));
  c.append(f);

  const row = el('div', { class: 'btn-row' });
  const check = el('button', { class: 'primary' }, 'Compare');
  check.addEventListener('click', () => {
    if (ta.value.trim().length < 20) { alert('Paste more of the official text first.'); return; }
    const r = runValidation(a.state, { index: a.index, baselineText: ta.value });
    a.scratch.validation = r;
    update(() => {}, { keepScratch: true });
  });
  row.append(check);
  const copy = el('button', {}, 'Copy database headings');
  copy.addEventListener('click', async () => {
    const lines = a.index.units.map((u) => `${u.n}. ${u.title}`);
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      alert(`Copied ${lines.length} chapter headings.`);
    } catch {
      ta.value = lines.join('\n');
      alert('Clipboard unavailable — the headings were placed in the box above instead.');
    }
  });
  row.append(copy);
  c.append(row);

  if (result.baseline) {
    const b = el('div', { class: 'card', style: 'background:var(--panel-2);margin-top:12px' });
    b.append(el('b', {}, `Baseline: ${result.baseline.matchedCount} matched, ${result.baseline.missingCount} missing, ${result.baseline.extra.length} extra`));
    if (result.baseline.missing.length) {
      b.append(el('p', { class: 'small', style: 'margin:6px 0 0;color:var(--critical)' },
        'In your paste but not in the database:'));
      const ul = el('ul', { class: 'small', style: 'padding-left:18px' });
      for (const m of result.baseline.missing.slice(0, 10)) ul.append(el('li', {}, m));
      b.append(ul);
    }
    c.append(b);
  }
  return c;
}
