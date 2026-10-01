/**
 * Progress — the measurement view. It is deliberately hard to make this look
 * good: every number is a count of real logged evidence, and topics without
 * evidence are shown as exactly that.
 */

import { el } from '../util/dom.js';
import { fmtMinutes, fmtDate, todayISO } from '../util/dates.js';
import { STATUS_LABEL, STATUS_ORDER } from '../core/store.js';
import { subjectFeasibility, actualAverageMinutes } from '../core/feasibility.js';
import { barRow, statCard } from '../app.js';

export function renderProgress(a) {
  const st = a.state;
  const cov = a.assessment.coverage;
  const wrap = el('div', { class: 'stack' });

  const h = el('div', { class: 'page-head' });
  h.append(el('h1', {}, 'Progress'));
  h.append(el('p', { class: 'sub' },
    'Counts are of real logged activity. A topic only becomes Strong or Mastered with MCQ and revision evidence, ',
    'not simply because you opened it.'));
  wrap.append(h);

  // Headline metrics
  const top = el('div', { class: 'card' });
  const g = el('div', { class: 'metric-grid' });
  g.append(statCard('Syllabus complete', `${cov.completionPct}%`, `${cov.completed}/${cov.total}`));
  g.append(statCard('Content covered', `${cov.coveragePct}%`, 'studied at least once'));
  g.append(statCard('Time left', fmtMinutes(cov.minutesRemaining), `of ${fmtMinutes(cov.minutesTotal)} total`));
  const avg = actualAverageMinutes(st).average;
  g.append(statCard('Your daily average', fmtMinutes(avg), 'last 14 days'));
  top.append(g);
  wrap.append(top);

  // Status distribution
  const dist = el('div', { class: 'card' });
  dist.append(el('h2', {}, 'Status distribution'));
  const total = cov.total || 1;
  const bar = el('div', { class: 'bar', style: 'height:14px' });
  const COLORS = {
    not_started: 'var(--line-2)', studying: 'var(--normal)', studied_once: 'var(--high)',
    needs_revision: 'var(--critical)', weak: 'var(--critical)', strong: 'var(--good)', mastered: 'var(--good)',
  };
  for (const s of STATUS_ORDER) {
    const n = cov[s] || 0;
    if (!n) continue;
    const seg = el('i', { style: `width:${(n / total) * 100}%;background:${COLORS[s]}`, title: `${STATUS_LABEL[s]}: ${n}` });
    bar.append(seg);
  }
  dist.append(bar);
  const chips = el('div', { class: 'chip-row', style: 'margin-top:10px' });
  for (const s of STATUS_ORDER) {
    chips.append(el('span', { class: 'tag' },
      el('span', { style: `display:inline-block;width:8px;height:8px;border-radius:50%;background:${COLORS[s]};margin-right:6px` }),
      `${STATUS_LABEL[s]} ${cov[s] || 0}`));
  }
  dist.append(chips);
  wrap.append(dist);

  // Per-subject feasibility
  const feas = subjectFeasibility(st, a.index);
  const fc = el('div', { class: 'card pad-0' });
  fc.append(el('div', { class: 'row' }, el('h2', { class: 'grow' }, 'Per-subject position'),
    el('span', { class: 'card-note' }, 'per day = what finishing this subject by the deadline needs')));
  const wrapT = el('div', { class: 'table-wrap' });
  const t = el('table');
  t.append(el('thead', {}, el('tr', {},
    el('th', {}, 'Subject'), el('th', { class: 'num' }, 'Marks'), el('th', { class: 'num' }, 'Done'),
    el('th', { class: 'num' }, 'Total'), el('th', {}, 'Progress'),
    el('th', { class: 'num' }, 'Left'), el('th', { class: 'num' }, 'Per day'))));
  const tb = el('tbody');
  for (const f of feas) {
    const pct = f.total ? (f.done / f.total) * 100 : 0;
    const tr = el('tr');
    tr.append(el('td', {}, f.subject.name));
    tr.append(el('td', { class: 'num' }, f.subject.marks == null ? '—' : String(f.subject.marks)));
    tr.append(el('td', { class: 'num' }, String(f.done)));
    tr.append(el('td', { class: 'num' }, String(f.total)));
    tr.append(el('td', { style: 'min-width:110px' }, barRow(pct, pct >= 80 ? 'good' : '')));
    tr.append(el('td', { class: 'num' }, fmtMinutes(f.remaining)));
    tr.append(el('td', { class: 'num' }, f.remaining ? fmtMinutes(f.perDay) : '—'));
    tb.append(tr);
  }
  t.append(tb);
  wrapT.append(t);
  fc.append(wrapT);
  wrap.append(fc);

  // Chapter ETAs
  const ec = el('div', { class: 'card pad-0' });
  ec.append(el('div', { class: 'row' }, el('h2', { class: 'grow' }, 'Chapter completion forecast'),
    el('span', { class: 'card-note' }, 'simulated from your actual plan')));
  const el2 = el('div', { class: 'table-wrap' });
  const t2 = el('table');
  t2.append(el('thead', {}, el('tr', {},
    el('th', {}, '#'), el('th', {}, 'Chapter'), el('th', {}, 'Subject'),
    el('th', {}, 'Progress'), el('th', { class: 'num' }, 'Left'), el('th', {}, 'ETA'))));
  const tb2 = el('tbody');
  const sorted = [...a.chapters].sort((x, y) => {
    if (!x.eta && !y.eta) return (x.etaOrder ?? 0) - (y.etaOrder ?? 0);
    if (!x.eta) return 1;
    if (!y.eta) return -1;
    return x.eta < y.eta ? -1 : 1;
  });
  for (const c of sorted) {
    const tr = el('tr');
    tr.append(el('td', { class: 'mono' }, String(c.unit.n)));
    tr.append(el('td', {}, el('a', { href: `#/syllabus/${c.unit.subjectId}/${c.unit.id}` }, c.unit.title)));
    tr.append(el('td', {}, c.unit.subjectName));
    tr.append(el('td', { style: 'min-width:110px' },
      barRow(c.progress, c.complete ? 'good' : '')));
    tr.append(el('td', { class: 'num' }, c.complete ? '—' : fmtMinutes(c.remainingMin)));
    tr.append(el('td', {}, c.complete
      ? el('span', { class: 'badge good' }, 'Complete')
      : c.eta
        ? el('span', { class: 'badge accent' }, c.eta)
        : el('span', { class: 'badge high' }, 'not scheduled')));
    tb2.append(tr);
  }
  t2.append(tb2);
  el2.append(t2);
  ec.append(el2);
  wrap.append(ec);

  // Accuracy
  const acc = accuracyBySubject(a);
  if (Object.keys(acc).length) {
    const ac = el('div', { class: 'card' });
    ac.append(el('h2', {}, 'MCQ accuracy by subject'));
    ac.append(el('p', { class: 'small muted' },
      'Only from questions you actually answered. Low accuracy is the clearest signal of where to spend time.'));
    const list = el('div', { class: 'list', style: 'margin-top:8px' });
    for (const [k, v] of Object.entries(acc).sort((x, y) => x[1].pct - y[1].pct)) {
      const r = el('div', { class: 'row' });
      r.append(el('div', { class: 'grow title' }, k));
      r.append(el('div', { style: 'min-width:140px' }, barRow(v.pct, v.pct >= 70 ? 'good' : v.pct >= 50 ? 'high' : 'critical')));
      r.append(el('span', { class: 'mono small' }, `${v.correct}/${v.att}`));
      list.append(r);
    }
    ac.append(list);
    wrap.append(ac);
  }

  // Adherence
  const adh = adherence(a);
  const ah = el('div', { class: 'card' });
  ah.append(el('h2', {}, 'Adherence, last 30 days'));
  const m2 = el('div', { class: 'metric-grid' });
  m2.append(statCard('Days logged', String(adh.logged)));
  m2.append(statCard('Sessions logged', String(adh.sessions)));
  m2.append(statCard('Planned', fmtMinutes(adh.planned)));
  m2.append(statCard('Actually done', fmtMinutes(adh.actual)));
  m2.append(statCard('Follow-through', `${adh.pct}%`));
  ah.append(m2);
  ah.append(el('p', { class: 'small muted', style: 'margin-top:10px' },
    adh.sessions === 0
      ? 'Nothing logged yet. Follow-through is the single best predictor of whether this plan will hold.'
      : adh.pct >= 80
        ? 'Strong follow-through. The projections above are probably realistic.'
        : 'Low follow-through. Either lower the daily target in Settings, or the plan is not built around your real life.'));
  wrap.append(ah);

  return wrap;
}

function accuracyBySubject(a) {
  const out = {};
  for (const s of a.index.subjects) {
    let att = 0;
    let correct = 0;
    for (const id of s.units.flatMap((u) => u.itemIds)) {
      const r = a.state.items[id];
      if (r && r.mcq) { att += r.mcq.att || 0; correct += r.mcq.correct || 0; }
    }
    if (att > 0) out[s.name] = { att, correct, pct: Math.round((correct / att) * 100) };
  }
  return out;
}

function adherence(a) {
  const t = todayISO();
  let planned = 0;
  let actual = 0;
  let logged = 0;
  let sessions = 0;
  for (let i = 0; i < 30; i++) {
    const d = a.plan.plan[fmtDate(addDaysLocal(t, -i), {})] || a.state.days[addDaysLocal(t, -i)];
    if (!d) continue;
    if ((d.sessions || []).length) logged++;
    sessions += (d.sessions || []).length;
    actual += d.actualMin || 0;
    if (i === 0) planned += d.plannedMin || 0;
  }
  // Planned total comes from the stored days, not the regenerated plan.
  for (let i = 0; i < 30; i++) {
    const d = a.state.days[addDaysLocal(t, -i)];
    if (d) planned += (d.tasks || []).reduce((x, task) => x + (task.plannedMin || 0), 0);
  }
  return { planned, actual, logged, sessions, pct: planned ? Math.min(100, Math.round((actual / planned) * 100)) : 0 };
}

function addDaysLocal(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}
