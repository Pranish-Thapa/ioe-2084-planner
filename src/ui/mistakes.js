/**
 * Mistake Bank — the questions you got wrong, and the only route to clearing
 * them. Re-solving correctly is what promotes a topic out of Weak.
 */

import { el } from '../util/dom.js';
import { questionById } from '../../data/questions.js';
import { STATUS_LABEL } from '../core/store.js';
import { markRevisionFailed } from '../core/revision.js';
import { todayISO } from '../util/dates.js';
import { emptyState, update, statCard, openModal, closeModal, go } from '../app.js';

const LETTERS = ['A', 'B', 'C', 'D'];

export function renderMistakes(a) {
  const st = a.state;
  const all = st.mistakes || [];
  const open = all.filter((m) => !m.resolved);
  const cleared = all.filter((m) => m.resolved);

  const wrap = el('div', { class: 'stack' });
  const h = el('div', { class: 'page-head' });
  h.append(el('h1', {}, 'Mistake Bank'));
  h.append(el('p', { class: 'sub' },
    'Every wrong answer lands here. A question is only cleared when you answer it correctly on a re-solve — ',
    'that is what moves a topic out of Weak and into Strong.'));
  wrap.append(h);

  const c = el('div', { class: 'card' });
  const g = el('div', { class: 'metric-grid' });
  g.append(statCard('Open', String(open.length)));
  g.append(statCard('Cleared', String(cleared.length)));
  g.append(statCard('Total wrong', String(all.length)));
  const subjects = new Set(open.map((m) => m.subject).filter(Boolean));
  g.append(statCard('Subjects hit', String(subjects.size)));
  c.append(g);

  if (open.length) {
    const bySub = {};
    for (const m of open) (bySub[m.subject || 'General'] ||= []).push(m);
    c.append(el('p', { class: 'small muted', style: 'margin-top:12px' },
      [...Object.entries(bySub)].map(([k, v]) => `${k}: ${v.length}`).join(' · ')));
  }
  wrap.append(c);

  if (!all.length) {
    wrap.append(emptyState('No mistakes recorded',
      'Answer questions in Practice and anything you get wrong is collected here automatically.'));
    return wrap;
  }

  if (open.length) {
    const rev = el('div', { class: 'card' });
    rev.append(el('h2', {}, 'Re-solve open mistakes'));
    rev.append(el('p', { class: 'small muted' },
      'This re-solves only the questions you still have wrong, and records the result as real practice.'));
    const b = el('button', { class: 'primary', style: 'margin-top:8px' },
      `Re-solve ${Math.min(20, open.length)} question${open.length === 1 ? '' : 's'}`);
    b.addEventListener('click', () => startResolver(a, open.slice(0, 20).map((m) => m.questionId)));
    rev.append(b);
    wrap.append(rev);

    wrap.append(list(a, open, 'Open mistakes'));
  }

  if (cleared.length) {
    wrap.append(list(a, cleared, 'Cleared', true));
  }
  return wrap;
}

function list(a, entries, title, isCleared = false) {
  const c = el('div', { class: 'card pad-0' });
  c.append(el('div', { class: 'row' }, el('h2', { class: 'grow' }, title),
    el('span', { class: 'badge ' + (isCleared ? 'good' : 'critical') }, String(entries.length))));
  const listEl = el('div', { class: 'list' });
  for (const m of entries) {
    const q = questionById(m.questionId);
    const r = el('div', { class: 'row wrap' });
    r.append(el('span', { class: 'tag' }, m.subject || 'General'));
    const g = el('div', { class: 'grow' });
    g.append(el('div', { class: 'title' }, q ? q.stem : `${m.questionId} (question not found)`));
    const item = a.index.byId.get(m.itemId);
    const rec = a.state.items[m.itemId];
    const bits = [
      item ? item.title : null,
      rec ? STATUS_LABEL[rec.status] : null,
      m.timesWrong > 1 ? `wrong ${m.timesWrong}×` : null,
      (m.at || '').slice(0, 10),
    ].filter(Boolean);
    g.append(el('div', { class: 'meta' }, bits.join(' · ')));
    r.append(g);

    if (q) {
      const b = el('button', { class: 'sm' }, 'Review');
      b.addEventListener('click', () => reviewDialog(a, m, q));
      r.append(b);
    }
    if (!isCleared) {
      const rs = el('button', { class: 'sm primary' }, 'Re-solve');
      rs.addEventListener('click', () => startResolver(a, [m.questionId]));
      r.append(rs);
    } else {
      const re = el('button', { class: 'sm ghost' }, 'Reopen');
      re.addEventListener('click', () => {
        update((st) => {
          const x = st.mistakes.find((y) => y.id === m.id);
          if (x) x.resolved = false;
          // Reopening is an admission of doubt, so bring the topic back sooner.
          markRevisionFailed(st, m.itemId, todayISO());
        });
      });
      r.append(re);
    }
    listEl.append(r);
  }
  c.append(listEl);
  return c;
}

function reviewDialog(a, m, q) {
  const picked = el('div');
  const build = (reveal) => {
    picked.replaceChildren();
    q.options.forEach((text, i) => {
      const o = el('div', { class: 'mcq-option', style: 'cursor:default' });
      o.append(el('span', { class: 'k' }, LETTERS[i]));
      o.append(el('span', {}, text));
      if (reveal) {
        if (i === q.answer) o.classList.add('correct');
        else if (i === m.picked) o.classList.add('wrong');
      }
      picked.append(o);
    });
  };
  build(false);

  openModal('Review mistake', (body) => {
    body.append(el('span', { class: 'badge' }, m.subject || 'General'));
    body.append(el('p', { style: 'margin-top:8px;font-weight:550' }, q.stem));
    body.append(picked);
    const ex = el('div', { class: 'mcq-explain', style: 'margin-top:10px' }, q.explain);
    body.append(ex);

    const re = el('div', { style: 'margin-top:14px' });
    re.append(el('b', {}, 'Do you remember the answer now?'));
    const row = el('div', { class: 'btn-row', style: 'margin-top:8px' });
    const yes = el('button', { class: 'primary' }, 'Re-solve it properly');
    yes.addEventListener('click', () => { closeModal(); startResolver(a, [m.questionId]); });
    const no = el('button', {}, 'No — still weak');
    no.addEventListener('click', () => {
      closeModal();
      update((st) => { markRevisionFailed(st, m.itemId, todayISO()); });
    });
    row.append(yes, no);
    re.append(row);
    body.append(re);
  }, [
    {
      label: 'Show the answer',
      run: () => { build(true); },
    },
  ]);
}

/**
 * Re-solving is the ONLY way a mistake is cleared, and that is deliberate: a
 * "mark cleared" button would be a self-report, and self-reports are not
 * evidence. The session runs through the same runner as any other practice set.
 */
function startResolver(a, questionIds) {
  const queue = questionIds.filter((id) => questionById(id));
  if (!queue.length) return;
  a.scratch.practiceResult = null;
  a.scratch.practice = {
    active: true,
    kind: 'Mistake Bank re-solve',
    params: { mistakeMode: true },
    queue,
    index: 0,
    results: [],
    startedAt: Date.now(),
    mistakeMode: true,
  };
  update(() => {}, { keepScratch: true });
  go('#/practice');
}
