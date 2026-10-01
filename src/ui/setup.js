/**
 * Setup wizard — the first screen. It only collects what the planner genuinely
 * cannot guess. Anything assumed is stated on the screen, because a study plan
 * built on a silently-wrong deadline is worse than no plan at all.
 */

import { el } from '../util/dom.js';
import { todayISO, diffDays, DOW, isValidISODate } from '../util/dates.js';
import { SYLLABUS_META } from '../../data/syllabus.js';
import { marksLabel } from '../core/model.js';
import * as store from '../core/store.js';
import { update, app, go } from '../app.js';

const STEPS = [
  { id: 'target', title: 'Exam target', help: 'These two dates drive every projection in the app.' },
  { id: 'time', title: 'Your time', help: 'Be honest here — the planner will not invent hours you do not have.' },
  { id: 'calendar', title: 'Week & coaching', help: 'Coaching and school days genuinely reduce study time.' },
  { id: 'weights', title: 'Subject priority', help: 'Adjust only if you are stronger or weaker somewhere.' },
  { id: 'review', title: 'Check & start', help: 'Confirm the assumptions before anything is planned.' },
];

export function renderSetup(a) {
  const st = a.state;
  const step = a.scratch.setupStep || 0;
  const wrap = el('div', { class: 'stack' });

  // Progress rail
  const rail = el('div', { class: 'card' });
  rail.append(el('h1', {}, 'Set up your planner'));
  rail.append(el('p', { class: 'sub' },
    `${SYLLABUS_META.paperName || 'B.E. / B.Arch.'} Class 12 · syllabus ${SYLLABUS_META.version}. `,
    el('br'),
    'Five short steps. Nothing is sent anywhere — everything stays in this browser.'));
  const dots = el('div', { class: 'q-progress' });
  STEPS.forEach((s, i) => {
    const d = el('span', { class: i === step ? 'cur' : i < step ? 'ok' : '' });
    d.title = s.title;
    dots.append(d);
  });
  rail.append(dots);
  wrap.append(rail);

  const body = el('div', { class: 'card' });
  const def = STEPS[step];
  body.append(el('h2', {}, `${step + 1}. ${def.title}`));
  body.append(el('p', { class: 'sub' }, def.help));

  if (def.id === 'target') targetStep(body, a);
  else if (def.id === 'time') timeStep(body, a);
  else if (def.id === 'calendar') calendarStep(body, a);
  else if (def.id === 'weights') weightsStep(body, a);
  else reviewStep(body, a);

  const nav = el('div', { class: 'btn-row between', style: 'margin-top:18px' });
  const back = el('button', { class: 'ghost' }, '← Back');
  back.disabled = step === 0;
  back.addEventListener('click', () => { a.scratch.setupStep = step - 1; update(() => {}, { keepScratch: true }); });

  const next = el('button', { class: 'primary' }, step === STEPS.length - 1 ? 'Start planning →' : 'Next →');
  next.addEventListener('click', () => {
    if (step < STEPS.length - 1) {
      a.scratch.setupStep = step + 1;
      update(() => {}, { keepScratch: true });
    } else {
      finish(a);
    }
  });
  nav.append(back, next);
  body.append(nav);
  wrap.append(body);
  return wrap;
}

function targetStep(box, a) {
  const st = a.state;
  const f1 = el('label', { class: 'field' });
  f1.append(el('span', {}, 'Last day to finish the whole syllabus'));
  const d1 = el('input', { type: 'date', value: st.settings.deadline, min: todayISO() });
  d1.addEventListener('change', () => { st.settings.deadline = d1.value; update(() => {}, { keepScratch: true }); });
  f1.append(d1);
  f1.append(el('small', {}, 'This is a planning target, not the entrance date. Default: end of Chaitra 2083 B.S.'));
  box.append(f1);

  const f2 = el('label', { class: 'field' });
  f2.append(el('span', {}, 'Entrance exam date (for countdown display)'));
  const d2 = el('input', { type: 'date', value: st.settings.examDate });
  d2.addEventListener('change', () => { st.settings.examDate = d2.value; update(() => {}, { keepScratch: true }); });
  f2.append(d2);
  box.append(f2);

  const days = diffDays(todayISO(), st.settings.deadline);
  const note = el('div', { class: 'card', style: 'background:var(--panel-2)' });
  note.append(el('b', {}, days >= 0 ? `${days} days of runway` : 'That date is in the past'));
  note.append(el('p', { class: 'small muted', style: 'margin:4px 0 0' },
    'A Class 12 student usually needs 8–14 months for a full first pass plus revision. ' +
    'If your runway is much shorter the planner will say so plainly rather than pretend otherwise.'));
  box.append(note);

  const arch = el('label', { class: 'check' });
  const cb = el('input', { type: 'checkbox' });
  cb.checked = !!st.settings.includeBArch;
  cb.addEventListener('change', () => { st.settings.includeBArch = cb.checked; update(() => {}, { keepScratch: true }); });
  arch.append(cb, el('span', {}, 'Include B.Arch-only topics (Building Drawing & Design, etc.)'));
  box.append(arch);
}

function timeStep(box, a) {
  const st = a.state;
  const f = el('label', { class: 'field' });
  f.append(el('span', {}, 'Study minutes on a normal school day'));
  const n = el('input', { type: 'number', min: '0', max: '900', step: '15', value: String(st.settings.defaultDailyMinutes) });
  n.addEventListener('change', () => {
    st.settings.defaultDailyMinutes = Math.max(0, Math.min(900, Number(n.value) || 0));
    update(() => {}, { keepScratch: true });
  });
  f.append(n);
  f.append(el('small', {}, 'Typical full-day students: 120–180. A sustainable ceiling for most people is about 4 hours.'));
  box.append(f);

  const f2 = el('label', { class: 'field' });
  f2.append(el('span', {}, 'Extra minutes available on weekends (per day)'));
  const n2 = el('input', { type: 'number', min: '0', max: '600', step: '15', value: String(st.settings.weekendExtraMinutes) });
  n2.addEventListener('change', () => {
    st.settings.weekendExtraMinutes = Math.max(0, Math.min(600, Number(n2.value) || 0));
    update(() => {}, { keepScratch: true });
  });
  f2.append(n2);
  box.append(f2);

  const f3 = el('label', { class: 'field' });
  f3.append(el('span', {}, `Safety buffer: ${st.settings.bufferPct}%`));
  const r = el('input', { type: 'range', min: '0', max: '30', step: '5', value: String(st.settings.bufferPct) });
  r.addEventListener('input', () => { f3.firstChild.textContent = `Safety buffer: ${r.value}%`; });
  r.addEventListener('change', () => { st.settings.bufferPct = Number(r.value); update(() => {}, { keepScratch: true }); });
  f3.append(r);
  f3.append(el('small', {}, 'Held back for illness, festivals, school homework and unexpected work. 10% is a common default.'));
  box.append(f3);

  const perDay = Math.round(st.settings.defaultDailyMinutes * (1 - st.settings.bufferPct / 100));
  const wknd = Math.round((st.settings.defaultDailyMinutes + st.settings.weekendExtraMinutes) * (1 - st.settings.bufferPct / 100));
  const box2 = el('div', { class: 'card', style: 'background:var(--panel-2)' });
  box2.append(el('b', {}, `That gives ${perDay} min/day on weekdays and ${wknd} min/day at weekends.`));
  box2.append(el('p', { class: 'small muted', style: 'margin:4px 0 0' },
    'The app never schedules a minute it has not been told you have.'));
  box.append(box2);
}

function calendarStep(box, a) {
  const st = a.state;
  const f = el('label', { class: 'field' });
  f.append(el('span', {}, 'Which days do you study?'));
  const row = el('div', { class: 'dow-row' });
  for (const d of DOW) {
    const on = st.settings.studyDays.includes(d);
    const lab = el('label', { class: on ? 'on' : '' });
    const inp = el('input', { type: 'checkbox', value: String(d) });
    inp.checked = on;
    inp.addEventListener('change', () => {
      const set = new Set(st.settings.studyDays);
      if (inp.checked) set.add(d); else set.delete(d);
      st.settings.studyDays = [...set].sort();
      lab.className = inp.checked ? 'on' : '';
      update(() => {}, { keepScratch: true });
    });
    lab.append(inp, el('span', {}, d));
    row.append(lab);
  }
  f.append(row);
  box.append(f);

  const f2 = el('label', { class: 'field' });
  f2.append(el('span', {}, 'Days with coaching (reduce study time by 35%)'));
  const row2 = el('div', { class: 'dow-row' });
  for (const d of DOW) {
    const on = !!st.settings.coaching[d];
    const lab = el('label', { class: on ? 'on' : '' });
    const inp = el('input', { type: 'checkbox', value: String(d) });
    inp.checked = on;
    inp.addEventListener('change', () => {
      if (inp.checked) st.settings.coaching[d] = true; else delete st.settings.coaching[d];
      lab.className = inp.checked ? 'on' : '';
      update(() => {}, { keepScratch: true });
    });
    lab.append(inp, el('span', {}, d));
    row2.append(lab);
  }
  f2.append(row2);
  box.append(f2);

  const f3 = el('label', { class: 'field' });
  f3.append(el('span', {}, 'One-off unavailable days (comma-separated, YYYY-MM-DD)'));
  const inp = el('input', {
    type: 'text',
    value: Object.entries(st.settings.busyDays).map(([k, v]) => `${k}:${v}`).join(', '),
    placeholder: '2027-01-15:0, 2027-02-20:90',
  });
  inp.addEventListener('change', () => {
    const next = {};
    for (const part of inp.value.split(',')) {
      const s = part.trim();
      if (!s) continue;
      const [d, v] = s.split(':');
      if (isValidISODate(d)) next[d] = Math.max(0, Math.min(720, Number(v ?? 0) || 0));
    }
    st.settings.busyDays = next;
    update(() => {}, { keepScratch: true });
  });
  f3.append(inp);
  f3.append(el('small', {}, 'Format date:minutes. Use 0 for a fully blocked day, or a real number to override that day.'));
  box.append(f3);
}

function weightsStep(box, a) {
  const st = a.state;
  const names = a.index.subjects.map((s) => s.name);
  const help = el('p', { class: 'small muted' },
    'Weight 1.00 is neutral. Raise a subject you are weak in, lower one you already know. ' +
    'The IOE paper marks are shown for reference — this changes weighting, not the paper.');
  box.append(help);
  const row = el('div', { class: 'field-row' });
  for (const s of a.index.subjects) {
    const f = el('label', { class: 'field' });
    const head = el('span', {}, `${s.name} `);
    head.append(el('small', { class: 'muted' }, marksLabel(s)));
    f.append(head);
    const w = st.settings.subjectWeight[s.id] ?? 1;
    const r = el('input', { type: 'range', min: '0.5', max: '2', step: '0.1', value: String(w) });
    const out = el('div', { class: 'small muted' }, `${w.toFixed(1)}×`);
    r.addEventListener('input', () => { out.textContent = `${Number(r.value).toFixed(1)}×`; });
    r.addEventListener('change', () => {
      st.settings.subjectWeight[s.id] = Number(r.value);
      update(() => {}, { keepScratch: true });
    });
    f.append(r, out);
    row.append(f);
  }
  box.append(row);
  const note = el('div', { class: 'card', style: 'background:var(--panel-2)' });
  note.append(el('b', {}, 'Revision intervals'));
  note.append(el('p', { class: 'small muted', style: 'margin:4px 0 0' },
    `Spaced revision runs ${st.settings.revisionIntervals.join(' → ')} days apart, and stretches automatically ` +
    'for topics you answer correctly and compresses for topics you miss. You can change this later in Settings.'));
  box.append(note);
}

function reviewStep(box, a) {
  const st = a.state;
  const days = diffDays(todayISO(), st.settings.deadline);
  const s = a.assessment;

  const dl = el('dl', { class: 'kv' });
  const add = (k, v) => { dl.append(el('dt', {}, k), el('dd', {}, v)); };
  add('Syllabus finish target', `${st.settings.deadline} (${days} days)`);
  add('Entrance exam date', st.settings.examDate);
  add('Weekday study time', `${st.settings.defaultDailyMinutes} min → ${Math.round(st.settings.defaultDailyMinutes * (1 - st.settings.bufferPct / 100))} usable`);
  add('Weekend extra', `+${st.settings.weekendExtraMinutes} min/day`);
  add('Study days', st.settings.studyDays.map((d) => DOW[d]).join(', '));
  add('Coaching days', DOW.filter((d) => st.settings.coaching[d]).join(', ') || 'none');
  add('One-off blocks', Object.keys(st.settings.busyDays).length);
  add('Syllabus size', `${a.index.items.length} subtopics across ${a.index.units.length} chapters`);
  if (st.settings.includeBArch) add('B.Arch topics', 'included');
  box.append(dl);

  const verdict = el('div', { class: 'card', style: 'margin-top:14px' });
  verdict.append(el('h3', {}, 'What the planner thinks'));
  const p = el('p', { class: 'small' }, s.message);
  verdict.append(p);
  if (s.requiredPerDay > 0) {
    verdict.append(el('p', { class: 'small muted', style: 'margin:0' },
      `About ${s.requiredPerDay} min/day of IOE work is needed. You can see exactly how to get there on the Dashboard.`));
  }
  box.append(verdict);

  const warn = el('div', { class: 'card', style: 'background:var(--high-soft);margin-top:14px' });
  warn.append(el('b', {}, 'Assumptions this app is making'));
  const ul = el('ul', { class: 'small', style: 'margin:6px 0 0;padding-left:18px' });
  for (const t of [
    'Your syllabus is the IOE B.E./B.Arch. Class 12 list, version ' + SYLLABUS_META.version + '.',
    'Exam Mode is off until you add a school exam date — it will not guess when your school exams are.',
    'Everything is stored in this browser only. Clearing site data clears your progress.',
    'MCQ results come from you. The app never invents an accuracy you did not report.',
  ]) ul.append(el('li', {}, t));
  warn.append(ul);
  box.append(warn);
}

function finish(a) {
  update((st) => {
    st.setupDone = true;
    st.meta.setupCompletedAt = new Date().toISOString();
    delete st.__wizard;
  });
  go('#/dashboard');
}
