/**
 * Syllabus — the database, made editable in the only way that stays honest.
 *
 * You may override a subtopic's status, its time estimate, and its priority.
 * Every override is stored as data, so the planner can plan for what you will
 * ACTUALLY finish rather than pretending the whole list gets done.
 */

import { el } from '../util/dom.js';
import { fmtMinutes, todayISO } from '../util/dates.js';
import { STATUS, STATUS_LABEL, STATUS_ORDER } from '../core/store.js';
import { barRow, emptyState, update, openModal } from '../app.js';

const PRIORITY_BY_STATUS = {
  [STATUS.NOT_STARTED]: 'normal',
  [STATUS.STUDYING]: 'high',
  [STATUS.STUDIED_ONCE]: 'high',
  [STATUS.WEAK]: 'critical',
  [STATUS.NEEDS_REVISION]: 'high',
  [STATUS.STRONG]: 'normal',
  [STATUS.MASTERED]: 'normal',
};

export function renderSyllabus(a) {
  const st = a.state;
  const wrap = el('div', { class: 'stack' });
  const activeSubject = a.route.params.subject;
  const openUnit = a.route.params.unit;

  const h = el('div', { class: 'page-head' });
  h.append(el('h1', {}, 'Syllabus'));
  h.append(el('p', { class: 'sub' },
    `${a.index.items.length} subtopics across ${a.index.units.length} chapters and ${a.index.subjects.length} subjects. `,
    'Change any status here and the whole plan re-derives immediately.'));
  wrap.append(h);

  // Subject tabs
  const tabs = el('div', { class: 'card', style: 'padding:10px 12px' });
  const row = el('div', { class: 'chip-row' });
  const all = el('a', { class: `btn sm${activeSubject ? '' : ' primary'}`, href: '#/syllabus' }, 'All');
  row.append(all);
  for (const s of a.index.subjects) {
    const ids = s.units.flatMap((u) => u.itemIds);
    const done = ids.filter((id) => (st.items[id] || {}).progressPct >= 100).length;
    row.append(el('a', {
      class: `btn sm${activeSubject === s.id ? ' primary' : ''}`,
      href: `#/syllabus/${s.id}`,
    }, `${s.name} ${done}/${ids.length}`));
  }
  tabs.append(row);
  wrap.append(tabs);

  const units = activeSubject
    ? a.index.subjects.filter((s) => s.id === activeSubject).flatMap((s) => s.units)
    : a.index.units;

  if (!units.length) {
    wrap.append(emptyState('No chapters here', 'Pick a subject above.'));
    return wrap;
  }

  const etaByUnit = new Map(a.chapters.map((c) => [c.unit.id, c]));

  for (const u of units) {
    const ch = etaByUnit.get(u.id);
    wrap.append(unitCard(a, u, ch, openUnit === u.id));
  }
  return wrap;
}

function unitCard(a, unit, ch, forceOpen) {
  const c = el('div', { class: 'unit' });
  const isOpen = forceOpen || a.scratch.openUnits?.[unit.id] || false;

  const head = el('button', { class: 'unit-head' });
  head.append(el('span', { class: 'n' }, String(unit.n)));
  const g = el('div', { class: 'grow' });
  g.append(el('div', { class: 't' }, unit.title));
  const meta = [`${unit.subjectName}`, ch ? `${ch.done}/${unit.itemIds.length} done` : '', ch ? `${fmtMinutes(ch.remainingMin)} left` : '']
    .filter(Boolean).join(' · ');
  g.append(el('div', { class: 'meta' }, meta));
  head.append(g);

  head.append(el('div', { style: 'min-width:110px' }, barRow(ch ? ch.progress : 0, ch && ch.progress >= 100 ? 'good' : '')));
  if (ch && ch.eta) head.append(el('span', { class: 'badge good nowrap' }, `ETA ${ch.eta}`));
  else if (ch) head.append(el('span', { class: 'badge high nowrap' }, 'no ETA'));
  head.append(el('span', { class: 'muted small' }, isOpen ? '▲' : '▼'));

  head.addEventListener('click', () => {
    a.scratch.openUnits = a.scratch.openUnits || {};
    a.scratch.openUnits[unit.id] = !isOpen;
    update(() => {}, { keepScratch: true });
  });
  c.append(head);

  if (!isOpen) return c;

  const body = el('div', { class: 'unit-body' });
  for (const t of unit.topics) {
    body.append(topicBlock(a, t));
  }
  const foot = el('div', { class: 'btn-row', style: 'margin-top:10px' });
  const expand = el('button', { class: 'sm' }, 'Expand all subtopics');
  expand.addEventListener('click', () => {
    a.scratch.openTopics = a.scratch.openTopics || {};
    const anyClosed = unit.topics.some((t) => !a.scratch.openTopics[t.id]);
    for (const t of unit.topics) a.scratch.openTopics[t.id] = anyClosed;
    update(() => {}, { keepScratch: true });
  });
  foot.append(expand);

  const markAll = el('button', { class: 'sm' }, 'Mark chapter content done');
  markAll.addEventListener('click', () => {
    if (!confirm(`Mark every subtopic in "${unit.title}" as content-complete?\n\nThis only affects content coverage. Status still needs MCQ and revision evidence to become Strong or Mastered.`)) return;
    update((st) => {
      for (const it of unit.itemIds) {
        const rec = st.items[it] || (st.items[it] = { progressPct: 0, mcq: { att: 0, correct: 0, streak: 0 } });
        rec.progressPct = 100;
        if (rec.status === 'not_started') rec.status = 'studied_once';
      }
    }, { keepScratch: true });
  });
  foot.append(markAll);
  body.append(foot);
  c.append(body);
  return c;
}

function topicBlock(a, topic) {
  const wrap = el('div', { class: 'topic' });
  const open = a.scratch.openTopics?.[topic.id] || false;

  const head = el('div', { class: 'topic-head' });
  const btn = el('button', { class: 'ghost sm' }, open ? '▾' : '▸');
  btn.setAttribute('aria-label', open ? 'Collapse' : 'Expand');
  btn.addEventListener('click', () => {
    a.scratch.openTopics = a.scratch.openTopics || {};
    a.scratch.openTopics[topic.id] = !open;
    update(() => {}, { keepScratch: true });
  });
  head.append(btn);

  const g = el('div', { class: 'grow' });
  g.append(el('span', { class: 'topic-title' }, topic.title));
  const st = aggregate(a, topic.itemIds);
  g.append(el('span', { class: 'meta small' }, ` ${st.done}/${topic.itemIds.length} · ${st.statusLabel}`));
  head.append(g);

  const pinnedIds = new Set(a.state.overrides?.pinnedItemIds || []);
  const pinned = topic.itemIds.every((id) => pinnedIds.has(id));
  const partly = !pinned && topic.itemIds.some((id) => pinnedIds.has(id));

  const pin = el('button', {
    class: pinned ? 'sm primary' : 'sm ghost',
    title: pinned
      ? 'Unpin: stop scheduling this topic first'
      : 'Pin this topic to the front of every day',
    'aria-pressed': pinned ? 'true' : 'false',
  }, pinned ? '📌' : '📍');
  if (partly) pin.title = 'Some subtopics of this topic are pinned';
  pin.addEventListener('click', () => {
    update((st) => {
      const ids = new Set(st.overrides.pinnedItemIds || []);
      for (const id of topic.itemIds) {
        if (ids.has(id)) ids.delete(id); else ids.add(id);
      }
      st.overrides.pinnedItemIds = [...ids];
    }, { keepScratch: true });
  });
  head.append(pin);
  wrap.append(head);

  if (!open) return wrap;

  for (const id of topic.itemIds) wrap.append(subRow(a, id));
  return wrap;
}

function subRow(a, id) {
  const item = a.index.byId.get(id);
  const st = a.state;
  const rec = st.items[id] || (st.items[id] = {
    progressPct: 0, status: STATUS.NOT_STARTED, revisionStage: 0,
    mcq: { att: 0, correct: 0, streak: 0, last: null },
  });

  const r = el('div', { class: 'sub-item' });
  r.append(el('span', { class: `badge ${PRIORITY_BY_STATUS[rec.status] || 'low'}`, title: 'Status' }, STATUS_LABEL[rec.status] || rec.status));

  const g = el('div', { class: 'grow' });
  g.append(el('div', {}, item.title));
  const bits = [];
  if (rec.progressPct) bits.push(`${rec.progressPct}%`);
  if (rec.mcq && rec.mcq.att) bits.push(`MCQ ${rec.mcq.correct}/${rec.mcq.att}`);
  if (rec.nextRevisionDue) {
    const d = rec.nextRevisionDue;
    bits.push(d === todayISO() ? 'revision due today' : `revision ${d}`);
  }
  const est = rec.estMinOverride || estOf(a, item);
  bits.push(`~${est} min`);
  g.append(el('div', { class: 'meta small' }, bits.join(' · ')));
  r.append(g);

  const sel = el('select', { class: 'status-sel', 'aria-label': `Status for ${item.title}` });
  for (const s of STATUS_ORDER) sel.append(el('option', { value: s }, STATUS_LABEL[s] || s));
  sel.value = rec.status;
  sel.addEventListener('change', () => {
    update((s) => {
      const rec2 = s.items[id];
      rec2.status = sel.value;
      if (sel.value === STATUS.WEAK || sel.value === STATUS.NEEDS_REVISION) rec2.progressPct = 100;
      if (sel.value === STATUS.MASTERED || sel.value === STATUS.STRONG) {
        rec2.progressPct = 100;
        if (sel.value === STATUS.MASTERED) rec2.mcq = { att: Math.max(rec2.mcq.att, 20), correct: Math.max(rec2.mcq.correct, 19), streak: Math.max(rec2.mcq.streak, 3), last: rec2.mcq.last };
      }
    }, { keepScratch: true });
  });
  r.append(sel);

  const estBtn = el('button', { class: 'sm ghost', title: 'Override the time estimate' }, '⏱');
  estBtn.addEventListener('click', () => overrideEstimate(a, id, est));
  r.append(estBtn);

  return r;
}

function overrideEstimate(a, id, current) {
  const item = a.index.byId.get(id);
  const input = el('input', { type: 'number', min: '5', max: '600', step: '5', value: String(current) });
  const box = el('div');
  box.append(el('p', { class: 'small muted' }, item.title));
  const l = el('label', { class: 'field' });
  l.append(el('span', {}, 'Minutes you think this actually takes'), input);
  l.append(el('small', {}, 'Your estimate replaces the built-in one. The planner uses it for every future projection.'));
  box.append(l);
  openModal('Time estimate', (b) => b.append(box), [
    { label: 'Cancel', run: (close) => close() },
    {
      label: 'Save',
      primary: true,
      run: (close) => {
        const v = Math.max(5, Math.min(600, Number(input.value) || current));
        close();
        update((s) => { s.items[id].estMinOverride = v; });
      },
    },
  ]);
}

function estOf(a, item) {
  const s = a.index.subjects.find((x) => x.id === item.subjectId);
  return Math.round(((s && s.minutesPerItem) || 45) * (item.size || 1));
}

function aggregate(a, ids) {
  let done = 0;
  const set = new Set();
  let weak = false;
  for (const id of ids) {
    const r = a.state.items[id];
    if (!r) { set.add(STATUS.NOT_STARTED); continue; }
    if (r.progressPct >= 100) done++;
    set.add(r.status);
    if (r.status === STATUS.WEAK) weak = true;
  }
  let statusLabel = 'Not started';
  if (weak) statusLabel = 'Weak';
  else if (set.has(STATUS.STUDYING)) statusLabel = 'Studying';
  else if (set.has(STATUS.MASTERED)) statusLabel = 'Mastered';
  else if (set.has(STATUS.STRONG)) statusLabel = 'Strong';
  else if (set.has(STATUS.STUDIED_ONCE)) statusLabel = 'Studied once';
  else if (done > 0) statusLabel = `${done}/${ids.length} done`;
  return { done, statusLabel };
}
