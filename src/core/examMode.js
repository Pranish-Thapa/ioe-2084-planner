/**
 * Terminal / school Exam Mode.
 * ---------------------------------------------------------------------------
 * Three phases around a school exam:
 *
 *   pre       (leadInDays before the exam starts)
 *               -> IOE load trimmed to ~60% of normal, school exam prep added
 *   during    (exam running)
 *               -> IOE maintenance only: settings.examModeIoeShare of the day
 *                  (default 15%), spent on high-value revision / mistake review.
 *                  No new syllabus chapters are started.
 *   recovery  (settings.recoveryDays after the exam ends)
 *               -> IOE workload temporarily boosted by recoveryBoostPct, and
 *                  the planner schedules the deferred work that piled up.
 *
 * Nothing is destroyed: the syllabus backlog stays intact and is re-planned
 * once the exam clears. The only thing that changes is how many minutes go to
 * IOE on each day, and the phase gates which task types are allowed.
 */

import { diffDays, dateRange, todayISO, dow, addDays } from '../util/dates.js';
import { uid, pushLog, STATUS } from './store.js';
import { estMinutesFor } from './model.js';

export const PHASE = {
  NORMAL: 'normal',
  PRE: 'pre',
  DURING: 'during',
  RECOVERY: 'recovery',
};

export function makeExam(partial = {}) {
  return {
    id: uid('exam'),
    name: 'Terminal Exam',
    start: todayISO(),
    end: todayISO(),
    subjects: [], // e.g. ['Math', 'Physics', 'Nepali'] — free text, not IOE subjects
    priority: 'high', // high | medium | low
    availableMinPerDay: 180,
    ioeShareDuring: null, // overrides settings.examModeIoeShare when set
    leadInDays: 7,
    recoveryDays: null, // overrides settings.recoveryDays when set
    note: '',
    ...partial,
  };
}

export function examFor(state, dateISO) {
  for (const e of state.exams || []) {
    if (diffDays(e.start, dateISO) >= 0 && diffDays(dateISO, e.end) >= 0) return e;
  }
  return null;
}

export function upcomingExams(state) {
  const t = todayISO();
  return (state.exams || []).filter((e) => diffDays(e.end, t) >= 0).sort((a, b) => (a.start < b.start ? -1 : 1));
}

/**
 * The exam context for a given day. Pure function of state + date.
 */
export function examContext(state, dateISO) {
  const st = state.settings;
  const t = todayISO();

  // "during"
  for (const e of state.exams || []) {
    if (diffDays(e.start, dateISO) >= 0 && diffDays(dateISO, e.end) >= 0) {
      const total = e.availableMinPerDay || 180;
      const ioe = e.ioeShareDuring != null ? e.ioeShareDuring : st.examModeIoeShare;
      return {
        phase: PHASE.DURING,
        exam: e,
        dayTotal: total,
        ioeMinutes: Math.max(15, Math.round(total * ioe)),
        schoolMinutes: Math.max(0, Math.round(total * (1 - ioe))),
        allowNewChapters: false,
        multiplier: ioe,
        note: `${e.name}: IOE reduced to ${Math.round(ioe * 100)}% of study time.`,
      };
    }
  }

  // "pre"
  let pre = null;
  for (const e of state.exams || []) {
    const untilStart = diffDays(dateISO, e.start);
    if (untilStart > 0 && untilStart <= (e.leadInDays ?? 7)) {
      if (!pre || untilStart < pre.untilStart) pre = { exam: e, untilStart };
    }
  }
  if (pre) {
    const ramp = 1 - (pre.untilStart / (pre.exam.leadInDays ?? 7)) * 0.4; // 1.0 -> 0.6
    return {
      phase: PHASE.PRE,
      exam: pre.exam,
      dayTotal: null,
      ioeMinutes: null,
      schoolMinutes: null,
      allowNewChapters: true,
      multiplier: ramp,
      note: `${pre.exam.name} in ${pre.untilStart} day${pre.untilStart === 1 ? '' : 's'} — IOE load reduced to ${Math.round(ramp * 100)}%.`,
    };
  }

  // "recovery"
  for (const e of state.exams || []) {
    const since = diffDays(e.end, dateISO);
    const len = e.recoveryDays ?? st.recoveryDays;
    if (since > 0 && since <= len) {
      const decay = 1 - (since - 1) / Math.max(1, len);
      const boost = 1 + st.recoveryBoostPct / 100 * decay;
      return {
        phase: PHASE.RECOVERY,
        exam: e,
        dayTotal: null,
        ioeMinutes: null,
        schoolMinutes: null,
        allowNewChapters: true,
        multiplier: boost,
        note: `Recovery after ${e.name} — IOE load boosted to ${Math.round(boost * 100)}% for ${len - since + 1} more day(s).`,
      };
    }
  }

  return {
    phase: PHASE.NORMAL,
    exam: null,
    dayTotal: null,
    ioeMinutes: null,
    schoolMinutes: null,
    allowNewChapters: true,
    multiplier: 1,
    note: '',
  };
}

export function isExamModeActive(state) {
  return (state.exams || []).some((e) => diffDays(e.end, todayISO()) >= 0);
}

/** Which task types the planner is allowed to emit in this phase. */
export function allowedTaskTypes(ctx) {
  switch (ctx.phase) {
    case PHASE.DURING:
      // Maintenance only: no new chapters, no long derivations.
      return new Set(['revise', 'practice', 'mistakes', 'personal', 'mixed', 'fill', 'maintenance']);
    case PHASE.RECOVERY:
      return new Set(['learn', 'revise', 'practice', 'mistakes', 'personal', 'mixed', 'test', 'fill']);
    case PHASE.PRE:
      return new Set(['learn', 'revise', 'practice', 'mistakes', 'personal', 'mixed', 'fill']);
    default:
      return new Set(['learn', 'revise', 'practice', 'mistakes', 'personal', 'mixed', 'test', 'fill']);
  }
}

/** Add an exam and immediately note the change so the plan regenerates. */
export function addExam(state, exam) {
  const e = makeExam(exam);
  state.exams.push(e);
  pushLog(state, 'exam', `Exam added: ${e.name} (${e.start} → ${e.end})`);
  return e;
}

export function removeExam(state, id) {
  const before = state.exams.length;
  state.exams = state.exams.filter((e) => e.id !== id);
  if (state.exams.length !== before) pushLog(state, 'exam', 'Exam removed — normal IOE load restored');
}

/**
 * Post-exam recovery plan. Returns a concrete, ordered list of what has to
 * happen and whether it is still feasible. Called by the app after an exam
 * ends (and from the Progress page any time).
 */
export function buildRecoveryPlan(state, index, exam, opts = {}) {
  const st = state.settings;
  const resumeFrom = addDays(exam.end, 1);
  const recoveryDays = exam.recoveryDays ?? st.recoveryDays;
  const recoveryEnd = addDays(exam.end, recoveryDays);

  // How much IOE time was lost during the exam?
  let lostMinutes = 0;
  let lostDays = 0;
  for (const d of dateRange(exam.start, exam.end)) {
    const ctx = examContext(state, d);
    const normal = baseAvailableMinutes(state, d);
    const actual = Math.round(normal * ctx.multiplier);
    lostMinutes += Math.max(0, normal - actual);
    lostDays++;
  }

  // Deferred work: backlog + due revisions accumulated during the exam.
  const backlogMin = remainingWorkMinutes(state, index);
  const horizon = Math.max(1, diffDays(resumeFrom, st.deadline));
  const perDay = opts.perDay ?? st.defaultDailyMinutes;
  const boostedPerDay = Math.round(perDay * (1 + st.recoveryBoostPct / 100));
  const capacity = horizon * boostedPerDay;
  const requiredPerDay = Math.ceil(backlogMin / horizon);

  const feasible = backlogMin <= capacity;

  return {
    exam,
    resumeFrom,
    recoveryEnd,
    lostMinutes,
    lostDays,
    backlogMin,
    horizonDays: horizon,
    boostedPerDay,
    capacity,
    requiredPerDay,
    feasible,
    deficit: Math.max(0, backlogMin - capacity),
    plan: feasible
      ? [
          `Resume at ${boostedPerDay} min/day for ${Math.min(recoveryDays, horizon)} days (recovery boost ${st.recoveryBoostPct}%).`,
          `Re-plan the ${lostMinutes} min deferred during the exam, spread across the recovery window.`,
          'Keep revision due-dates intact — nothing is deleted, only deferred.',
        ]
      : [
          `Even with the ${st.recoveryBoostPct}% boost, you are ${Math.ceil(opts.deficitMinutes ?? (backlogMin - capacity))} min short.`,
          'Options: extend study time on weekends, trim low-value revision, or accept that low-priority chapters move past the deadline.',
          'Use the Syllabus page to mark low-priority chapters as "Low value" so the planner can defer them honestly.',
        ],
  };
}

function remainingWorkMinutes(state, index) {
  let total = 0;
  for (const item of index.items) {
    const r = state.items[item.id];
    if (!r) continue;
    if (r.status === STATUS.STRONG || r.status === STATUS.MASTERED) continue;
    total += Math.max(0, Math.round(estMinutesFor(state, item) * (1 - (r.progressPct || 0) / 100)));
  }
  return total;
}

function baseAvailableMinutes(state, dateISO) {
  const st = state.settings;
  const d = dow(dateISO);
  let m = st.studyDays.includes(d) ? st.defaultDailyMinutes : 0;
  if (d === 0 || d === 6) m += st.weekendExtraMinutes;
  if (st.coaching[d]) m = Math.round(m * 0.7);
  return Math.max(0, m);
}
