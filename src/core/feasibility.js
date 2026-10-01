/**
 * Feasibility engine.
 * ---------------------------------------------------------------------------
 * Answers one question honestly:  "Can I still finish the whole syllabus by my
 * deadline, and if not, by how much am I short?"
 *
 *     remaining workload
 *     ------------------
 *     available study time          =  required average per day
 *
 * Nothing here is optimistic. Available time is the *real* number after:
 *   - non-study days removed
 *   - coaching reductions
 *   - one-off busy days
 *   - terminal exams (the IOE share only, since school exams take the rest)
 *   - a buffer for illness, festivals, unexpected work
 */

import { dateRange, diffDays, todayISO, fmtMinutes, dow } from '../util/dates.js';
import { estMinutesFor, unitStats, coverage } from './model.js';
import { STATUS, RESOLVED, getItem } from './store.js';

import { examContext, PHASE } from './examMode.js';

/** Minutes available on a single day BEFORE exam-mode and buffer adjustments. */
export function baseAvailableMinutes(state, dateISO) {
  const st = state.settings;
  const d = dow(dateISO);

  if (st.busyDays[dateISO] !== undefined) {
    // Explicit override wins (a free weekend can be set to a bigger number).
    return Math.max(0, st.busyDays[dateISO] || 0);
  }
  if (!st.studyDays.includes(d)) return 0;

  let m = st.defaultDailyMinutes;
  if (d === 0 || d === 6) m += st.weekendExtraMinutes;
  if (st.coaching[d]) m = Math.round(m * 0.65);
  return Math.max(0, m);
}

/** Final usable IOE minutes for a day, after exam mode and buffer. */
export function availableMinutesFor(state, dateISO) {
  const base = baseAvailableMinutes(state, dateISO);
  if (base === 0) return 0;
  const ctx = examContext(state, dateISO);
  let m = base;
  if (ctx.phase === PHASE.DURING) m = Math.max(15, Math.round(base * ctx.multiplier));
  else m = Math.round(base * ctx.multiplier);
  m = Math.round(m * (1 - (state.settings.bufferPct / 100)));
  return Math.max(0, m);
}

/** Remaining minutes of new/needed learning work. */
export function remainingWorkMinutes(state, index) {
  let learn = 0;
  let revise = 0;
  for (const item of index.items) {
    const r = getItem(state, item.id);
    if (RESOLVED.has(r.status)) continue;
    const est = estMinutesFor(state, item);
    const left = Math.max(0, Math.round(est * (1 - r.progressPct / 100)));
    learn += left;
    if (r.lastStudied) revise += Math.round(est * 0.45); // 3-4 revision passes
  }
  return { learn, revise, total: learn + revise };
}

function upcomingCapacity(state, fromISO, toISO) {
  let total = 0;
  const perDay = {};
  for (const d of dateRange(fromISO, toISO)) {
    const m = availableMinutesFor(state, d);
    perDay[d] = m;
    total += m;
  }
  return { total, perDay };
}

/** Recent actual study minutes over the last N days (for the "current average"). */
export function actualAverageMinutes(state, windowDays = 14) {
  const t = todayISO();
  const from = addDaysLocal(t, -(windowDays - 1));
  let sum = 0;
  let days = 0;
  for (const d of dateRange(from, t)) {
    sum += state.days[d]?.actualMin || 0;
    days++;
  }
  return { average: days ? Math.round(sum / days) : 0, total: sum, days };
}

function addDaysLocal(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

export const RISK = { ON_TRACK: 'on_track', TIGHT: 'tight', HIGH: 'high', IMPOSSIBLE: 'impossible', DONE: 'done' };

export function assess(state, index) {
  const st = state.settings;
  const t = todayISO();
  const cov = coverage(state, index);
  const work = remainingWorkMinutes(state, index);
  const daysLeft = Math.max(0, diffDays(t, st.deadline));

  if (work.total === 0) {
    return {
      level: RISK.DONE, daysLeft, work, coverage: cov,
      message: 'Syllabus complete. The planner has switched to revision and exam practice.',
      requiredPerDay: 0, capacityTotal: 0, actualAvg: actualAverageMinutes(state).average,
      suggestions: [], unitsBehind: [], projectedFinish: st.deadline,
    };
  }

  const { total: capacity, perDay } = upcomingCapacity(state, t, st.deadline);
  const requiredPerDay = daysLeft > 0 ? Math.ceil(work.total / daysLeft) : work.total;
  const current = actualAverageMinutes(state).average;
  const sustainable = Math.max(0, Math.round(
    (capacity / Math.max(1, Object.keys(perDay).length)) * 0.85,
  ));

  // Risk is judged on whether the plan is *achievable*, not on a comparison
  // against a history that may not exist yet. A brand-new state has zero
  // logged minutes; dividing by that would label every fresh start HIGH risk.
  const dailyCapacity = capacity / Math.max(1, Object.keys(perDay).length);
  const requiredVsCapacity = requiredPerDay / Math.max(1, dailyCapacity);
  const requiredVsHabit = current > 0 ? requiredPerDay / current : null;

  let level;
  if (requiredVsCapacity > 1.0) {
    // Not merely tight — the total workload exceeds the time that exists.
    level = work.total > capacity ? RISK.IMPOSSIBLE : RISK.HIGH;
  } else if (requiredVsHabit === null) {
    // No history to judge: achievable on paper, so only the load level matters.
    level = requiredVsCapacity > 0.75 ? RISK.TIGHT : RISK.ON_TRACK;
  } else if (requiredVsHabit > 1.15) level = RISK.HIGH;
  else if (requiredVsHabit > 0.95) level = RISK.TIGHT;
  else level = RISK.ON_TRACK;

  // Projected finish date: how long the CURRENT pace needs, vs the deadline.
  const daysNeededAtCurrent = current > 0 ? Math.ceil(work.total / current) : null;
  const projectedFinish = daysNeededAtCurrent
    ? addDaysLocal(t, daysNeededAtCurrent)
    : daysLeft <= 0 ? t : null;

  // Which chapters are the bottleneck?
  const unitsBehind = index.units
    .map((u) => unitStats(state, index, u))
    .filter((s) => !s.complete && s.remainingMin > 0)
    .sort((a, b) => b.remainingMin - a.remainingMin)
    .slice(0, 5);

  const suggestions = buildSuggestions({
    level, work, capacity, requiredPerDay, current, sustainable,
    daysLeft, unitsBehind, st, index, state,
  });

  return {
    level, daysLeft, work, coverage: cov,
    requiredPerDay, capacityTotal: capacity, actualAvg: current, sustainablePerDay: sustainable,
    projectedFinish,
    daysOverdue: projectedFinish && diffDays(st.deadline, projectedFinish) > 0
      ? diffDays(st.deadline, projectedFinish) : 0,
    unitsBehind, suggestions,
    message: messageFor(level, { work, capacity, requiredPerDay, current, daysLeft }),
  };
}

function messageFor(level, { work, capacity, requiredPerDay, current, daysLeft }) {
  const have = current ? `${fmtMinutes(current)}/day` : 'no logged history yet';
  switch (level) {
    case RISK.IMPOSSIBLE:
      return `Not enough time: ${fmtMinutes(work.total)} of work left but only ${fmtMinutes(capacity)} available before the deadline.`;
    case RISK.HIGH:
      return `Deadline risk: HIGH. You need ${fmtMinutes(requiredPerDay)}/day but your recent average is ${have}.`;
    case RISK.TIGHT:
      return `Tight but possible. ${fmtMinutes(requiredPerDay)}/day needed against ${have}.`;
    default:
      return `On track. ${fmtMinutes(requiredPerDay)}/day needed over the next ${daysLeft} day${daysLeft === 1 ? '' : 's'}.`;
  }
}

function buildSuggestions({ level, work, capacity, requiredPerDay, current, sustainable, daysLeft, unitsBehind, st, index, state }) {
  if (level === RISK.ON_TRACK) {
    return [
      `Keep roughly ${fmtMinutes(requiredPerDay)}/day. You have ${daysLeft} days of runway.`,
      'Protect your revision ladder — skipping it creates far more work later.',
    ];
  }
  const out = [];
  const gap = work.total - capacity;

  if (gap > 0) {
    out.push(`Short by ${fmtMinutes(gap)} in total. The realistic choices are below — pick two, not all of them.`);
  }

  // Concrete, sustainable levers, each quantified.
  const need = Math.max(0, requiredPerDay - current);
  if (current > 0 && need > 0) {
    const daysAvailable = Math.max(1, daysLeft);
    const perDayExtra = Math.ceil(gap / daysAvailable);
    out.push(`Add ${fmtMinutes(Math.min(perDayExtra, 30))}/day (sustainable for a Class 12 student; more than ~30m extra usually fails).`);
  }
  out.push(`Weekend blocks: each extra free weekend day you log in is worth ~${fmtMinutes(sustainable)}.`);

  // Trim low-value revision.
  const strongCount = Object.values(state.items).filter((r) => r.status === STATUS.STRONG).length;
  if (strongCount > 5) {
    out.push(`${strongCount} items are already Strong — their revision intervals are auto-stretched, so nothing extra is needed.`);
  }

  // Focus on unfinished syllabus.
  if (unitsBehind.length) {
    out.push(
      `Biggest remaining load: ${unitsBehind.slice(0, 2).map((u) => `${u.unit.subjectName} — ${u.unit.title} (${fmtMinutes(u.remainingMin)})`).join('; ')}.`,
    );
  }

  // Shorten revision sessions.
  out.push('Switch to short revision sessions (10-15 min) instead of long re-reads — same recall benefit, much cheaper.');

  // Realistic ceiling warning.
  const hours = requiredPerDay / 60;
  if (hours > 4) {
    out.push(
      `WARNING: finishing everything now needs ${hours.toFixed(1)}h/day. That is not sustainable. Choose which chapters to defer, or move the deadline — do not attempt a 10h schedule.`,
    );
  }
  if (level === RISK.IMPOSSIBLE) {
    out.push('Mark low-value chapters as "Low" priority in the Syllabus page so the planner can plan honestly for what you WILL finish.');
  }
  return out;
}

/** Per-subject feasibility, for the Progress page. */
export function subjectFeasibility(state, index) {
  const t = todayISO();
  const daysLeft = Math.max(0, diffDays(t, state.settings.deadline));
  return index.subjects.map((s) => {
    const ids = s.units.flatMap((u) => u.itemIds);
    let rem = 0;
    let done = 0;
    for (const id of ids) {
      const r = getItem(state, id);
      const it = index.byId.get(id);
      if (RESOLVED.has(r.status)) { done++; continue; }
      rem += Math.max(0, Math.round(estMinutesFor(state, it) * (1 - r.progressPct / 100)));
    }
    const perDay = daysLeft ? Math.ceil(rem / daysLeft) : rem;
    return { subject: s, remaining: rem, done, total: ids.length, perDay, feasible: rem <= 0 };
  });
}
