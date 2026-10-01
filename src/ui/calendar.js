/**
 * Calendar — a month view of load and phase. The point is not decoration; it
 * is spotting the two failure modes early: a run of "no tasks" days, and a
 * wall of red days in the last fortnight before a school exam.
 */

import { el } from '../util/dom.js';
import { todayISO, addDays, dateRange, dow, DOW_MON_FIRST, MONTH, fmtMinutes, fmtDate } from '../util/dates.js';
import { go } from '../app.js';

export function renderCalendar(a) {
  const wrap = el('div', { class: 'stack' });
  const today = todayISO();
  const month = a.route.params.month || today.slice(0, 7);
  const [y, m] = month.split('-').map(Number);

  const h = el('div', { class: 'page-head' });
  h.append(el('h1', {}, 'Calendar'));
  h.append(el('p', { class: 'sub' },
    'Dots show what kind of work is planned. Shaded days are closed or unavailable. ',
    'Click a day to open its plan.'));
  wrap.append(h);

  // Month nav
  const nav = el('div', { class: 'card', style: 'padding:10px 12px' });
  const nrow = el('div', { class: 'btn-row between' });
  const prev = el('a', { class: 'btn sm', href: `#/calendar/${shiftMonth(y, m, -1)}` }, '← Previous');
  const now = el('a', { class: 'btn sm', href: `#/calendar/${today.slice(0, 7)}` }, 'This month');
  const next = el('a', { class: 'btn sm', href: `#/calendar/${shiftMonth(y, m, 1)}` }, 'Next →');
  nrow.append(prev, el('h2', { style: 'margin:0' }, `${MONTH[m - 1]} ${y}`), el('div', { class: 'inline' }, now, next));
  nav.append(nrow);
  wrap.append(nav);

  const first = `${month}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const last = `${month}-${String(lastDay).padStart(2, '0')}`;

  // Grid starts on the Monday of the week containing the 1st.
  const startOffset = (dow(first) + 6) % 7;
  const gridStart = addDays(first, -startOffset);
  const cells = dateRange(gridStart, addDays(last, (6 - ((dow(last) + 6) % 7))));

  const cal = el('div', { class: 'cal' });
  for (const d of DOW_MON_FIRST) cal.append(el('div', { class: 'dow' }, d[0] + d[1].toLowerCase()));

  for (const d of cells) {
    const inMonth = d.slice(0, 7) === month;
    if (!inMonth) { cal.append(el('div', { class: 'cal-day empty' })); continue; }
    const day = a.plan.plan[d];
    const cls = ['cal-day'];
    if (d === today) cls.push('today');
    if (day && day.closed) cls.push('closed');
    if (d === a.scratch.calSelected) cls.push('sel');

    const b = el('button', { class: cls.join(' '), 'aria-label': fmtDate(d, { day: 'numeric', month: 'long' }) });
    b.append(el('span', { class: 'd' }, String(Number(d.slice(8, 10)))));
    if (day && day.plannedMin > 0) {
      b.append(el('span', { class: 'load' }, `${Math.round(day.plannedMin / 60 * 10) / 10}h`));
    } else if (day && day.closed) {
      b.append(el('span', { class: 'load', style: 'font-size:9px' }, 'closed'));
    }
    if (day && day.tasks.length) {
      const dots = el('div', { class: 'dots' });
      const kinds = [...new Set(day.tasks.map((t) => t.type))];
      for (const k of kinds.slice(0, 5)) dots.append(el('span', { class: `dot ${k}` }));
      b.append(dots);
    }
    b.addEventListener('click', () => go(`#/today/${d}`));
    cal.append(b);
  }
  wrap.append(cal);

  // Legend
  const leg = el('div', { class: 'card' });
  leg.append(el('h3', {}, 'Legend'));
  const lr = el('div', { class: 'chip-row' });
  for (const [k, label] of [['learn', 'Learn'], ['revise', 'Revise'], ['practice', 'Practice'], ['mixed', 'Mixed MCQ'], ['mistakes', 'Mistakes']]) {
    lr.append(el('span', { class: 'tag' }, el('span', { class: `dot ${k}`, style: 'display:inline-block;margin-right:6px' }), label));
  }
  leg.append(lr);
  wrap.append(leg);

  // Month summary — the useful part.
  const monthDays = dateRange(first, last).map((d) => a.plan.plan[d]).filter(Boolean);
  const planned = monthDays.reduce((x, d2) => x + d2.plannedMin, 0);
  const avail = monthDays.reduce((x, d2) => x + (d2.availableMin || 0), 0);
  const empty = monthDays.filter((d2) => !d2.closed && !d2.tasks.length);

  const sum = el('div', { class: 'card' });
  sum.append(el('h2', {}, 'This month in numbers'));
  const g = el('div', { class: 'metric-grid' });
  g.append(kpi('Planned', fmtMinutes(planned)));
  g.append(kpi('Available', fmtMinutes(avail)));
  g.append(kpi('Open days', String(monthDays.filter((d2) => !d2.closed).length)));
  g.append(kpi('Idle open days', String(empty.length)));
  sum.append(g);
  if (empty.length) {
    sum.append(el('p', { class: 'small muted', style: 'margin-top:10px' },
      `${empty.length} open day${empty.length === 1 ? '' : 's'} with no work. `,
      empty.length > 6
        ? 'That is a lot of unused capacity — consider lowering the per-task minimum or adding free days in Settings.'
        : 'Usually fine, but check they are genuinely free rather than a planning bug.'));
  }
  wrap.append(sum);
  return wrap;
}

function kpi(k, v) {
  return el('div', { class: 'stat' }, el('span', { class: 'k' }, k), el('span', { class: 'v' }, v));
}

function shiftMonth(y, m, delta) {
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
