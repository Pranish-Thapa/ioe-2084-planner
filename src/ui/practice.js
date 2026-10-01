/**
 * Practice — the MCQ engine.
 *
 * Two rules make this different from a quiz app:
 *   1. Nothing is recorded until you actually answer.
 *   2. Every wrong answer goes to the Mistake Bank, and clearing the bank
 *      changes your status. That feedback loop is the only thing that makes
 *      the "Strong" and "Mastered" labels mean anything.
 */

import { el } from '../util/dom.js';
import { QUESTION_BANK, questionsForItems, questionsForUnit } from '../../data/questions.js';

import { STATUS } from '../core/store.js';
import { dueRevisions } from '../core/revision.js';
import { marksLabel } from '../core/model.js';
import { recordAnswer } from '../core/planner.js';
import { todayISO } from '../util/dates.js';
import { emptyState, update, statCard, barRow } from '../app.js';

const LETTERS = ['A', 'B', 'C', 'D'];

export function renderPractice(a) {
  const s = a.scratch.practice;
  if (s && s.active) return runner(a, s);
  if (a.scratch.practiceResult) return resultView(a, a.scratch.practiceResult);

  const wrap = el('div', { class: 'stack' });
  const h = el('div', { class: 'page-head' });
  h.append(el('h1', {}, 'Practice'));
  const due = dueRevisions(a.state, todayISO());
  h.append(el('p', { class: 'sub' },
    `${QUESTION_BANK.length} questions mapped to the syllabus. `,
    due.length ? `${due.length} topic${due.length === 1 ? '' : 's'} due for revision today.` : 'Nothing due for revision right now.'));
  wrap.append(h);

  if (!QUESTION_BANK.length) {
    wrap.append(emptyState('Question bank is empty',
      'Questions ship with the app and are validated against the syllabus on every run.'));
    return wrap;
  }

  // Due-for-revision set: highest-yield practice.
  wrap.append(setCard(a, 'Due for revision today',
    'Questions from topics whose spaced-revision date has arrived. This is the highest-yield practice available.',
    due.map((d) => d.itemId),
    `${due.length} topics`));

  // Wrong answers.
  const weak = a.state.items ? Object.entries(a.state.items)
    .filter(([, r]) => r.status === STATUS.WEAK || r.status === STATUS.NEEDS_REVISION)
    .map(([id]) => id) : [];
  wrap.append(setCard(a, 'Weak topics',
    'Everything you previously got wrong or flagged as difficult.',
    weak,
    `${weak.length} topics`));

  // Whole units.
  const units = el('div', { class: 'card' });
  units.append(el('h2', {}, 'By chapter'));
  const list = el('div', { class: 'list' });
  for (const u of a.index.units) {
    const qs = questionsForUnit(a.index, u.id);
    if (!qs.length) continue;
    const r = el('div', { class: 'row' });
    r.append(el('span', { class: 'tag mono' }, String(u.n)));
    const g = el('div', { class: 'grow' });
    g.append(el('div', { class: 'title' }, u.title));
    g.append(el('div', { class: 'meta' }, `${u.subjectName} · ${qs.length} questions`));
    r.append(g);
    const b = el('button', { class: 'sm primary' }, 'Practise');
    b.addEventListener('click', () => start(a, 'chapter', { unitId: u.id }, qs));
    r.append(b);
    list.append(r);
  }
  units.append(list);
  wrap.append(units);

  // Whole subjects.
  const subs = el('div', { class: 'card' });
  subs.append(el('h2', {}, 'By subject'));
  const sl = el('div', { class: 'list' });
  for (const s2 of a.index.subjects) {
    const ids = s2.units.flatMap((u) => u.itemIds);
    const qs = questionsForItems(a.index, ids);
    if (!qs.length) continue;
    const r = el('div', { class: 'row' });
    const g = el('div', { class: 'grow' });
    g.append(el('div', { class: 'title' }, s2.name));
    g.append(el('div', { class: 'meta' }, `${qs.length} questions · ${marksLabel(s2)}`));
    r.append(g);
    const b = el('button', { class: 'sm' }, 'Practise');
    b.addEventListener('click', () => start(a, 'subject', { subjectId: s2.id }, qs));
    r.append(b);
    sl.append(r);
  }
  subs.append(sl);
  wrap.append(subs);

  return wrap;
}

function setCard(a, title, help, itemIds, badge) {
  const c = el('div', { class: 'card' });
  c.append(el('div', { class: 'card-head' }, el('h2', {}, title), el('span', { class: 'badge accent' }, badge)));
  c.append(el('p', { class: 'small muted' }, help));
  if (!itemIds.length) {
    c.append(el('p', { class: 'small', style: 'margin:6px 0 0' }, 'Nothing to practise here yet.'));
    return c;
  }
  const qs = questionsForItems(a.index, itemIds);
  if (!qs.length) {
    c.append(el('p', { class: 'small', style: 'margin:6px 0 0' },
      'No questions are mapped to these topics yet.'));
    return c;
  }
  const row = el('div', { class: 'btn-row', style: 'margin-top:10px' });
  for (const n of [10, 20]) {
    const take = qs.slice(0, Math.min(n, qs.length));
    if (take.length < 5 && n === 20) continue;
    const b = el('button', { class: n === 10 ? 'primary' : '' }, `${take.length} questions`);
    b.addEventListener('click', () => start(a, title, { itemIds }, take));
    row.append(b);
  }
  c.append(row);
  return c;
}

function start(a, kind, params, questions) {
  a.scratch.practiceResult = null;
  a.scratch.practice = {
    active: true,
    kind,
    params,
    queue: questions.map((q) => q.id),
    index: 0,
    results: [],
    startedAt: Date.now(),
  };
  update(() => {}, { keepScratch: true });
}

function currentQuestion(a) {
  const s = a.scratch.practice;
  const id = s.queue[s.index];
  return QUESTION_BANK.find((q) => q.id === id);
}

function runner(a, s) {
  const wrap = el('div', { class: 'stack' });
  const q = currentQuestion(a);
  const total = s.queue.length;
  const done = s.index;

  const head = el('div', { class: 'page-head' });
  const hrow = el('div', { class: 'btn-row between' });
  const title = el('div');
  title.append(el('h1', { style: 'margin:0' }, 'Practice'));
  title.append(el('p', { class: 'sub', style: 'margin:0' },
    `${s.kind} · question ${Math.min(done + 1, total)} of ${total}`));
  hrow.append(title);
  const quit = el('button', { class: 'sm' }, 'End session');
  quit.addEventListener('click', () => endSession(a, true));
  hrow.append(quit);
  head.append(hrow);

  const prog = el('div', { class: 'q-progress', style: 'margin-top:10px' });
  for (let i = 0; i < total; i++) {
    const r = s.results[i];
    const cls = r ? (r.correct ? 'ok' : 'no') : i === s.index ? 'cur' : '';
    prog.append(el('span', { class: cls }));
  }
  head.append(prog);
  wrap.append(head);

  if (!q) return endSession(a, false);

  const card = el('div', { class: 'card' });
  card.append(el('div', { class: 'inline', style: 'margin-bottom:8px' },
    el('span', { class: 'badge accent' }, q.subject || 'General'),
    q.unit ? el('span', { class: 'tag' }, q.unit) : null,
    el('span', { class: 'tag mono' }, q.id),
  ));
  card.append(el('p', { style: 'font-size:16.5px;font-weight:550' }, q.stem));

  const answer = s.results[s.index];
  const options = el('div', { style: 'margin-top:12px' });
  q.options.forEach((text, i) => {
    const o = el('button', { class: 'mcq-option' });
    o.append(el('span', { class: 'k' }, LETTERS[i]));
    o.append(el('span', {}, text));
    if (answer) {
      o.disabled = true;
      if (i === q.answer) o.classList.add('correct');
      else if (i === answer.picked) o.classList.add('wrong');
    } else {
      o.addEventListener('click', () => choose(a, i));
    }
    options.append(o);
  });
  card.append(options);

  if (answer) {
    const ex = el('div', { class: 'mcq-explain' });
    ex.append(el('b', {}, answer.correct ? 'Correct. ' : `Not quite — the answer is ${LETTERS[q.answer]}. `));
    ex.append(document.createTextNode(q.explain));
    card.append(ex);

    const next = el('button', { class: 'primary', style: 'margin-top:12px' },
      s.index + 1 >= total ? 'Finish session' : 'Next question →');
    next.addEventListener('click', () => {
      if (s.index + 1 >= total) endSession(a, false);
      else { s.index++; update(() => {}, { keepScratch: true }); }
    });
    card.append(next);
  }

  wrap.append(card);
  return wrap;
}

function choose(a, picked) {
  const s = a.scratch.practice;
  const q = currentQuestion(a);
  const correct = picked === q.answer;

  s.results[s.index] = { picked, correct };

  // Real data only: record the attempt, and route wrong answers to the bank.
  update((st) => { recordAnswer(st, q, picked); }, { keepScratch: true });
}

function endSession(a, confirmAbandon) {
  const s = a.scratch.practice;
  if (!s) { a.scratch.practice = null; update(() => {}, { keepScratch: true }); return; }
  const answered = s.results.filter(Boolean);
  if (confirmAbandon && answered.length && !confirm(`End the session? ${answered.length} answered question(s) will still be recorded.`)) return;

  const right = answered.filter((r) => r.correct).length;
  const wrong = answered.length - right;
  // Only count the questions that were actually reached, in queue order.
  const seen = new Set();
  for (let i = 0; i < s.results.length; i++) if (s.results[i]) seen.add(s.queue[i]);
  const summary = {
    right,
    wrong,
    total: answered.length,
    unique: seen.size,
    kind: s.kind,
    cleared: (a.state.mistakes || []).filter((m) => m.resolved && m.resolvedAt && m.questionId && seen.has(m.questionId)).length,
  };
  a.scratch.practice = null;
  a.scratch.practiceResult = summary;
  update(() => {}, { keepScratch: true });
  return resultView(a, summary);
}

function resultView(a, r) {
  const acc = r.total ? Math.round((r.right / r.total) * 100) : 0;
  const wrap = el('div', { class: 'stack' });
  const h = el('div', { class: 'page-head' });
  h.append(el('h1', {}, 'Session result'));
  h.append(el('p', { class: 'sub' },
    r.total
      ? `${r.right} of ${r.total} correct (${acc}%) across ${r.unique} question${r.unique === 1 ? '' : 's'}.`
      : 'No questions were answered.'));
  wrap.append(h);

  const c = el('div', { class: 'card' });
  const g = el('div', { class: 'metric-grid' });
  g.append(statCard('Correct', String(r.right)));
  g.append(statCard('Wrong', String(r.wrong), r.wrong ? `${r.wrong} in the Mistake Bank` : ''));
  g.append(statCard('Accuracy', r.total ? `${acc}%` : '—'));
  c.append(g);

  const tone = acc >= 80 ? 'good' : acc >= 60 ? '' : 'high';
  if (r.total) {
    c.append(el('div', { style: 'margin-top:12px' }, barRow(acc, tone)));
  }
  c.append(el('p', { class: 'small muted', style: 'margin-top:12px' },
    r.wrong
      ? 'Wrong answers are in the Mistake Bank. Re-solve them there and answer correctly to clear them — nothing else clears a mistake.'
      : 'These results are recorded and will adjust your revision schedule.'));

  const row = el('div', { class: 'btn-row' });
  const back = el('button', { class: 'primary' }, 'Back to practice sets');
  back.addEventListener('click', () => { a.scratch.practiceResult = null; update(() => {}, { keepScratch: true }); });
  row.append(back);
  if (r.wrong) {
    const mb = el('a', { class: 'btn', href: '#/mistakes' }, `Open Mistake Bank (${r.wrong})`);
    row.append(mb);
  }
  c.append(row);
  wrap.append(c);
  return wrap;
}
