/**
 * THE PLANNING ENGINE
 * ===========================================================================
 * There is no hard-coded Monday-to-Sunday timetable. The plan is *derived* on
 * every state change from:
 *
 *   remaining syllabus  x  days remaining  x  available hours
 *   x  chapter difficulty x  progress x  weakness x  revision due dates
 *   x  missed sessions    x  terminal exams x  consistency x  test accuracy
 *
 * ---------------------------------------------------------------------------
 * THE SIMULATION LEDGER  (the part that makes this work)
 *
 * The plan is built by walking forward day by day and *simulating* what
 * happens: when a learn task is emitted for a topic, the ledger advances that
 * topic's progress and books its next revision. The next day therefore plans
 * from a realistic future state, not from a frozen snapshot.
 *
 * Without this, every day would re-pick the single highest-scoring item forever.
 * With it, the planner behaves like a real study sequence: finish a topic,
 * move to the next, keep earlier topics coming back for revision on schedule.
 *
 * ---------------------------------------------------------------------------
 * Design rules that keep it honest:
 *
 *  1. DERIVED, NOT STORED.  state.days[d].tasks is regenerated from scratch
 *     each pass. The only source of truth for "what did I actually do" is
 *     the logged sessions. The plan can never drift out of sync with reality.
 *
 *  2. A HARD DAILY CEILING.  Tasks are never emitted beyond the minutes
 *     actually available that day. A 6-hour backlog is never dumped on one
 *     day — it is spread, and if it will not fit before the deadline the
 *     planner reports the shortfall instead of lying.
 *
 *  3. CHUNKED TASKS.  A 90-minute topic becomes 60 + 30 across two days, so
 *     partial completion always advances progress rather than restarting.
 *
 *  4. EXPLAINABLE PRIORITIES.  Every task carries a plain-language `reason`
 *     and one of Critical / High / Normal / Low. No mystery "AI score".
 *
 *  5. NO SPARE TIME WASTED.  After the phase quotas are met, an overflow pass
 *     fills whatever time is left with the best genuinely-useful work.
 */

import {
  dateRange, diffDays, addDays, todayISO, fmtMinutes,
} from '../util/dates.js';
import { estMinutesFor, difficultyOf, syllabusLearned, unitStats } from './model.js';
import { STATUS, RESOLVED, getItem, pushLog, getDay, blankDay, uid } from './store.js';
import { availableMinutesFor, remainingWorkMinutes } from './feasibility.js';
import { markStudied, markRevisionFailed, nextGapDays } from './revision.js';
import { examContext, allowedTaskTypes, PHASE } from './examMode.js';

const MAX_HORIZON_DAYS = 900;
export const TASK_TYPES = ['learn', 'revise', 'practice', 'mixed', 'mistakes', 'test', 'personal', 'fill'];

export const PRIORITY = { CRITICAL: 'critical', HIGH: 'high', NORMAL: 'normal', LOW: 'low' };
const PRIORITY_RANK = { critical: 0, high: 1, normal: 2, low: 3 };

/* ------------------------------------------------------------------ */
/* Simulation ledger                                                   */
/* ------------------------------------------------------------------ */

function makeLedger(state, index) {
  const sim = new Map();
  for (const item of index.items) {
    const r = getItem(state, item.id);
    sim.set(item.id, { ...r, mcq: { ...(r.mcq || { att: 0, correct: 0, streak: 0 }) } });
  }
  return sim;
}

const simGet = (sim, id) => sim.get(id);

/** Minutes of learning still required for an item, per the simulated state. */
function learnMinutesLeft(state, index, sim, itemId) {
  const r = simGet(sim, itemId);
  const est = r.estMinOverride || estMinutesFor(state, index.byId.get(itemId));
  return Math.max(0, Math.round(est * (1 - r.progressPct / 100)));
}

/**
 * A single derived subtopic is often only 8-12 minutes, which is smaller than
 * a usable study block. Students do not study a subtopic in isolation — they
 * work through a whole topic. So the unit of planning is the TOPIC, and one
 * block may span several subtopics of that topic.
 */
const topicKeyOf = (item) => `${item.unitId}::${item.topicId || item.id}`;

/**
 * Stable pseudo-random ordering, so "shuffle" is random between days but
 * identical every time the plan is re-derived on the same day.
 *
 * `Math.random()` cannot be used here: the plan is re-derived on every state
 * change and every render, so a non-deterministic order would reshuffle the
 * student's day under them, mid-session. The seed is the date plus a nonce the
 * user bumps with "shuffle again", which makes the result reproducible and
 * therefore testable.
 */
function stableShuffle(list, seed) {
  const keyed = list.map((v, i) => {
    const s = `${seed}::${topicKeyOf(v) || v.key || i}`;
    let h = 2166136261;
    for (let k = 0; k < s.length; k++) {
      h ^= s.charCodeAt(k);
      h = Math.imul(h, 16777619);
    }
    return { v, h: (h >>> 0), i };
  });
  keyed.sort((a, b) => (a.h - b.h) || (a.i - b.i));
  return keyed.map((k) => k.v);
}

/** The topics the student hand-picked for one specific date, in their order. */
export function picksForDate(state, dateISO) {
  const all = (state.overrides && state.overrides.todayPicks) || {};
  const list = all[dateISO];
  return Array.isArray(list) ? list.filter((k) => typeof k === 'string') : [];
}

/**
 * How this date was chosen: 'picks' | 'shuffle' | 'auto'.
 *
 * The presence of the date key decides, not the length of the list, so that
 * switching to "my picks" with nothing ticked yet still shows the picker
 * instead of silently falling back to the automatic choice.
 */
export function pickModeForDate(state, dateISO) {
  const all = (state.overrides && state.overrides.todayPicks) || {};
  if (Object.prototype.hasOwnProperty.call(all, dateISO)) return 'picks';
  return state.settings.planStyle === 'shuffle' ? 'shuffle' : 'auto';
}

/**
 * Group unfinished subtopics into chapters.
 *
 * `minLeft` is the floor on minutes remaining before a chapter is worth a
 * block at all — small enough leftovers are not worth a token task. A
 * hand-picked chapter passes 0 instead, because a chapter the student
 * explicitly asked for has to be finishable: with the floor applied, a chapter
 * one minute short is invisible forever and silently never completes.
 */
function groupTopics(state, index, sim, ctx, limit = 10, minLeft = 8) {
  const groups = new Map();
  for (const item of index.items) {
    const r = simGet(sim, item.id);
    if (r.status === STATUS.STRONG || r.status === STATUS.MASTERED) continue;
    if (r.progressPct >= 100 && r.status !== STATUS.WEAK) continue;
    const key = topicKeyOf(item);
    let g = groups.get(key);
    if (!g) {
      g = {
        key,
        unitId: item.unitId,
        subjectId: item.subjectId,
        subjectName: item.subjectName,
        unitTitle: item.unitTitle,
        topicTitle: item.topicTitle || item.title,
        topicId: item.topicId || item.id,
        members: [],
        left: 0,
        score: 0,
      };
      groups.set(key, g);
    }
    g.members.push(item);
    g.left += learnMinutesLeft(state, index, sim, item.id);
    // A chapter the student has already started is allowed to be a small
    // finishing block. The floors below exist to avoid offering an unusable
    // sliver of *untouched* content; refusing the last 10 minutes of a chapter
    // you already did 50 minutes of strands it permanently.
    if (simGet(sim, item.id).progressPct > 0) g.started = true;
    // Chapter cohesion means the whole topic should agree on its urgency, so
    // take the most urgent subtopic rather than averaging it away.
    g.score = Math.max(g.score, needScore(state, index, sim, item, ctx));
  }
  // `g.left > 0` is essential: a chapter with nothing left is finished, not
  // "started and unfinished". Letting it through yields a 0-minute task, which
  // `add()` rejects, which marks learn dead for the whole day.
  const out = [...groups.values()].filter((g) => g.left > 0 && (g.left >= minLeft || g.started));
  if (ctx.shuffleSeed != null) {
    // Randomise the order, then still prefer the most urgent when the budget
    // cannot take everything: the day varies, the plan never becomes reckless.
    const shuffled = stableShuffle(out, ctx.shuffleSeed);
    shuffled.sort((a, b) => (b.score > a.score + 0.35 ? -1 : b.score < a.score - 0.35 ? 1 : 0));
    return shuffled.slice(0, limit);
  }
  out.sort((a, b) => b.score - a.score || b.left - a.left);
  return out.slice(0, limit);
}

/**
 * Advance a learn block across its subtopics, finishing one before moving to
 * the next, so partial progress is always recorded on the subtopic the
 * student actually reached.
 */
function simAdvanceLearnBlock(state, index, sim, group, minutes, dateISO) {
  let pool = minutes;
  const touched = [];
  for (const item of group.members) {
    if (pool <= 0) break;
    const r = simGet(sim, item.id);
    const left = learnMinutesLeft(state, index, sim, item.id);
    if (left <= 0) continue;
    const give = Math.min(left, pool);
    simAdvanceLearn(state, index, sim, item.id, give, dateISO);
    pool -= give;
    touched.push(item.id);
  }
  return touched;
}

function simAdvanceLearn(state, index, sim, itemId, minutes, dateISO) {
  const r = simGet(sim, itemId);
  const est = r.estMinOverride || estMinutesFor(state, index.byId.get(itemId));
  r.progressPct = Math.min(100, Math.round(((r.progressPct / 100) * est + minutes) / est * 100));
  r.minutesLearned = (r.minutesLearned || 0) + minutes;
  if (r.status === STATUS.NOT_STARTED) r.status = STATUS.STUDYING;
  r.lastStudied = dateISO;
  r.revisionStage = 0;
  r.nextRevisionDue = addDays(dateISO, Math.max(1, Math.round((state.settings.revisionIntervals[0] ?? 1) * 0.8)));
  if (r.progressPct >= 100 && (r.status === STATUS.STUDYING || r.status === STATUS.NOT_STARTED)) {
    r.status = STATUS.STUDIED_ONCE;
  }
}

function simAdvanceRevise(state, sim, itemId, dateISO, quality) {
  const r = simGet(sim, itemId);
  r.progressPct = 100;
  r.lastStudied = dateISO;
  if (r.status === STATUS.NOT_STARTED || r.status === STATUS.STUDYING) r.status = STATUS.STUDIED_ONCE;
  if (quality !== null && quality < 0.5) {
    r.status = STATUS.WEAK;
    r.revisionStage = Math.max(0, r.revisionStage - 1);
    r.nextRevisionDue = addDays(dateISO, 1);
  } else {
    r.lastRevisionScore = quality;
    r.revisionStage = Math.min(r.revisionStage + 1, state.settings.revisionIntervals.length - 1);
    r.nextRevisionDue = addDays(dateISO, nextGapDays(state, itemId, dateISO, r));
    if (r.status === STATUS.NEEDS_REVISION && quality >= 0.85) r.status = STATUS.STRONG;
  }
}

function simAdvancePractice(sim, itemId, count) {
  const r = simGet(sim, itemId);
  r.mcq.att = (r.mcq.att || 0) + count;
  // `correct` is deliberately NOT advanced here. Inventing an accuracy the
  // student never demonstrated would be exactly the "fake intelligence" this
  // app is supposed to avoid. Real results come from the Practice engine.
}

/* ------------------------------------------------------------------ */
/* Plan phase                                                          */
/* ------------------------------------------------------------------ */

export function planPhase(state, index, today = todayISO()) {
  const learned = syllabusLearned(state, index);
  const daysLeft = diffDays(today, state.settings.deadline);
  if (learned) return daysLeft <= 14 ? 'final' : daysLeft <= 30 ? 'exam_prep' : 'consolidate';
  return daysLeft <= 30 ? 'exam_prep' : 'learn';
}

const PHASE_MIX = {
  learn: { learn: 0.55, revise: 0.22, practice: 0.12, mixed: 0.06, mistakes: 0.05 },
  consolidate: { learn: 0.05, revise: 0.32, practice: 0.28, mixed: 0.25, mistakes: 0.1 },
  exam_prep: { learn: 0.12, revise: 0.3, practice: 0.24, mixed: 0.24, mistakes: 0.1 },
  final: { learn: 0, revise: 0.32, practice: 0.2, mixed: 0.28, mistakes: 0.2 },
};

export const PHASE_LABEL = {
  learn: 'First pass — covering the syllabus',
  consolidate: 'Syllabus done — consolidating',
  exam_prep: 'Exam preparation',
  final: 'Final fortnight',
};

/* ------------------------------------------------------------------ */
/* Scoring                                                             */
/* ------------------------------------------------------------------ */

function needScore(state, index, sim, item, ctx) {
  const r = simGet(sim, item.id);
  const sw = state.settings.subjectWeight[item.subjectId] ?? 1;
  const difficulty = difficultyOf(state, item) / 5;

  // 1. Do we still need to LEARN this at all?
  const learnNeed =
    r.status === STATUS.NOT_STARTED ? 1.0
    : r.status === STATUS.STUDYING ? 0.72 + (1 - r.progressPct / 100) * 0.5
    : r.status === STATUS.WEAK ? 0.55
    : 0.3;

  // 2. Weakness — declared and measured.
  const weakScore = {
    [STATUS.WEAK]: 1.0,
    [STATUS.NEEDS_REVISION]: 0.8,
    [STATUS.STUDIED_ONCE]: 0.45,
    [STATUS.STUDYING]: 0.4,
    [STATUS.STRONG]: 0.12,
    [STATUS.MASTERED]: 0.05,
    [STATUS.NOT_STARTED]: 0.2,
  }[r.status] ?? 0.3;
  const acc = r.mcq.att >= 4 ? 1 - r.mcq.correct / r.mcq.att : 0.45;

  // 3. Deadline pressure. Behind -> unfinished syllabus outranks polish.
  const coverageBoost = r.status === STATUS.NOT_STARTED
    ? Math.min(1.6, Math.max(0, ctx.pressure - 1) * 1.1)
    : 0;

  // 4. Stickiness: finishing what you started beats fragmenting attention.
  const stick = r.progressPct > 0 && r.progressPct < 100 ? (r.progressPct / 100) * 0.7 : 0;

  // 5. Chapter cohesion: stay inside the open unit unless something is urgent.
  const cohesion = ctx.openUnitId === item.unitId ? 0.55 : 0;

  return (
    1.7 * learnNeed +
    1.25 * weakScore +
    0.8 * acc +
    0.45 * coverageBoost +
    stick +
    cohesion +
    0.3 * (sw - 1) +
    0.35 * difficulty
  );
}

function reviseScore(state, sim, entry, ctx) {
  const r = simGet(sim, entry.itemId);
  const overdueBoost = Math.min(1.4, entry.overdue * 0.18);
  const stageBoost = entry.stage * 0.12;
  const weakBoost = r.status === STATUS.WEAK ? 0.8 : r.status === STATUS.NEEDS_REVISION ? 0.6 : 0;
  const phaseBoost = ctx.phase === 'final' || ctx.phase === 'exam_prep' ? 0.7 : 0;
  const squeeze = ctx.daysLeft <= 30 ? (30 - ctx.daysLeft) / 60 : 0;
  return 1.2 + overdueBoost + stageBoost + weakBoost + ctx.pressure * 0.5 + phaseBoost + squeeze;
}

function priorityLabel(type, r, entry, ctx) {
  const weak = r.status === STATUS.WEAK || r.status === STATUS.NEEDS_REVISION;
  switch (type) {
    case 'learn':
      if (r.status === STATUS.NOT_STARTED && (ctx.pressure > 1.05 || ctx.daysLeft <= 45)) return PRIORITY.CRITICAL;
      if (r.progressPct > 0) return PRIORITY.HIGH;
      return ctx.pressure > 0.9 ? PRIORITY.HIGH : PRIORITY.NORMAL;
    case 'revise':
      if (entry && entry.overdue >= 3) return PRIORITY.CRITICAL;
      if (weak) return PRIORITY.HIGH;
      return PRIORITY.NORMAL;
    case 'practice':
    case 'test':
      return weak || ctx.phase === 'final' ? PRIORITY.HIGH : PRIORITY.NORMAL;
    case 'mistakes':
      return PRIORITY.HIGH;
    case 'mixed':
      return ctx.phase === 'final' ? PRIORITY.HIGH : PRIORITY.NORMAL;
    case 'fill':
      return PRIORITY.LOW;
    default:
      return PRIORITY.NORMAL;
  }
}

/* ------------------------------------------------------------------ */
/* Task builders                                                       */
/* ------------------------------------------------------------------ */

function baseTask(item, date, type) {
  return {
    type,
    date,
    itemId: item ? item.id : null,
    unitId: item ? item.unitId : null,
    subjectId: item ? item.subjectId : null,
    subjectName: item ? item.subjectName : null,
    unitTitle: item ? item.unitTitle : null,
    title: item ? item.title : '',
  };
}

function mkLearnTask(state, index, sim, group, minutes, ctx, date) {
  const lead = group.members[0];
  const r = simGet(sim, lead.id);
  const chunk = Math.max(0, Math.min(minutes, group.left));
  const resumed = group.members.some((m) => simGet(sim, m.id).progressPct > 0);
  const mcq = Math.max(4, Math.round((chunk / 22) * 10));
  const startPct = Math.round(
    (group.members.reduce((a, m) => a + simGet(sim, m.id).progressPct, 0) / group.members.length),
  );
  const endPct = Math.min(100, Math.round(startPct + (chunk / Math.max(1, group.left)) * (100 - startPct)));
  const names = group.members.map((m) => m.title);
  // A chapter is split into subtopics, so finishing a block can leave some of
  // them untouched. Counted across the whole chapter, not just the ones still
  // outstanding: reporting "0 of 3" while the chapter is actually 4/7 done reads
  // as though the work was ignored.
  const chapterMembers = index.items.filter((i) => topicKeyOf(i) === group.key);
  const subtopicsDone = chapterMembers
    .filter((m) => simGet(sim, m.id).progressPct >= 100).length;
  const subtopicsTotal = chapterMembers.length || group.members.length;

  return {
    ...baseTask(lead, date, 'learn'),
    id: `t_learn_${group.key.replace(/[^A-Za-z0-9]+/g, '_')}`,
    itemId: lead.id,
    itemIds: group.members.map((m) => m.id),
    topicId: group.topicId,
    title: group.topicTitle,
    plannedMin: chunk,
    progressBefore: r.progressPct,
    progressAfter: endPct,
    chapterProgress: startPct,
    subtopicsDone,
    subtopicsTotal,
    subtopics: names,
    detail: `${names.length > 1 ? `Cover ${names.length} part${names.length > 1 ? 's' : ''}: ${names.join(', ')}.` : `Work through "${names[0]}".`} Then solve ${mcq} MCQs.`,
    reason: resumed
      ? `Partly done (${startPct}%) — finishing it is faster than restarting.`
      : ctx.pressure > 1.05
        ? 'Unfinished syllabus and you are behind pace, so new content takes priority over polish.'
        : 'Not yet studied — needed for syllabus completion.',
    mcq,
    priority: priorityLabel('learn', r, null, ctx),
  };
}

function mkReviseTask(state, index, sim, entry, minutes, ctx, date) {
  const item = index.byId.get(entry.itemId);
  const r = simGet(sim, entry.itemId);
  const weak = r.status === STATUS.WEAK || r.status === STATUS.NEEDS_REVISION;
  const mcq = entry.stage >= 2 ? 12 : 6;
  const recall = Math.max(8, minutes - 10);
  const why = [];
  if (entry.overdue > 0) why.push(`last studied ${entry.overdue} day${entry.overdue === 1 ? '' : 's'} ago`);
  else if (entry.overdue === 0) why.push('due today');
  if (weak) why.push('marked weak');
  if (r.mcq.att >= 4) why.push(`last accuracy ${Math.round((r.mcq.correct / r.mcq.att) * 100)}%`);

  return {
    ...baseTask(item, date, 'revise'),
    id: `t_revise_${entry.itemId}`,
    title: item.title,
    plannedMin: minutes,
    stage: entry.stage,
    overdue: entry.overdue,
    detail: [`${recall} min concept recall from memory`, entry.stage >= 2 ? `${mcq} MCQs` : '5 self-recall checks', weak ? 're-derive what you missed' : 'note gaps']
      .join(' → '),
    reason: `Spaced revision (${why.join(', ') || 'interval reached'}).`,
    mcq,
    priority: priorityLabel('revise', r, entry, ctx),
  };
}

function mkPracticeTask(state, index, sim, item, minutes, ctx, date) {
  const r = simGet(sim, item.id);
  const acc = r.mcq.att >= 4 ? Math.round((r.mcq.correct / r.mcq.att) * 100) : null;
  const mcq = Math.max(8, Math.round((minutes / 20) * 10));
  return {
    ...baseTask(item, date, 'practice'),
    id: `t_practice_${item.id}`,
    title: item.title,
    plannedMin: minutes,
    detail: `Solve ${mcq} MCQs on this topic, then review every mistake.`,
    reason: acc === null
      ? 'No MCQ evidence for this topic yet — testing establishes a baseline.'
      : `Accuracy ${acc}% — targeted practice where you lose marks.`,
    mcq,
    priority: priorityLabel('practice', r, null, ctx),
  };
}

function mkMixedTask(state, minutes, ctx, date, count) {
  const mcq = count || state.settings.mixedMcqSize;
  return {
    ...baseTask(null, date, 'mixed'),
    id: `t_mixed_${date}`,
    title: 'Mixed MCQ practice',
    subjectName: 'Mixed',
    plannedMin: minutes,
    detail: `${mcq} questions across every subject you have studied. No notes, then check.`,
    reason: ctx.phase === 'final' || ctx.phase === 'exam_prep'
      ? 'Interleaved practice is the closest simulation of the real paper.'
      : 'Interleaved practice stops you studying in comfort-zone blocks.',
    mcq,
    priority: priorityLabel('mixed', { status: STATUS.STUDIED_ONCE }, null, ctx),
  };
}

function mkMistakesTask(state, count, minutes, ctx, date) {
  return {
    ...baseTask(null, date, 'mistakes'),
    id: `t_mistakes_${date}`,
    title: 'Mistake Bank review',
    subjectName: 'Mistakes',
    plannedMin: minutes,
    detail: `Re-solve ${count} question${count === 1 ? '' : 's'} you previously got wrong.`,
    reason: 'Open mistakes in your Mistake Bank — the highest-yield revision you have.',
    priority: PRIORITY.HIGH,
  };
}

function mkTestTask(state, index, minutes, ctx, date) {
  const weakest = index.subjects
    .map((s) => {
      const ids = s.units.flatMap((u) => u.itemIds);
      let a = 0; let c = 0;
      for (const id of ids) { const r = getItem(state, id); a += r.mcq.att; c += r.mcq.correct; }
      return { s, acc: a >= 5 ? c / a : null };
    })
    .filter((x) => x.acc !== null)
    .sort((x, y) => x.acc - y.acc)[0];
  return {
    ...baseTask(null, date, 'test'),
    id: `t_test_${date}`,
    title: 'Timed test — full syllabus',
    subjectName: 'Full test',
    plannedMin: minutes,
    detail: 'Full-length timed paper. No notes, no pausing. Review afterwards.',
    reason: weakest
      ? `Full-length simulation. Weakest measured subject: ${weakest.s.name} (${Math.round(weakest.acc * 100)}%).`
      : 'Full-length simulation to build exam stamina and accuracy.',
    priority: PRIORITY.HIGH,
  };
}

function mkPersonalTask(p, date) {
  return {
    ...baseTask(null, date, 'personal'),
    id: `t_personal_${p.id}`,
    title: p.title,
    subjectName: 'Personal',
    plannedMin: p.minutes || 30,
    detail: p.detail || 'Personal task you added.',
    reason: 'You added this yourself.',
    priority: PRIORITY.HIGH,
    personalId: p.id,
  };
}

/* ------------------------------------------------------------------ */
/* Candidate selection                                                 */
/* ------------------------------------------------------------------ */

function rankedLearnItems(state, index, sim, ctx, limit = 8) {
  const out = [];
  for (const item of index.items) {
    const r = simGet(sim, item.id);
    if (r.status === STATUS.STRONG || r.status === STATUS.MASTERED) continue;
    if (r.progressPct >= 100 && r.status !== STATUS.WEAK) continue;
    if (learnMinutesLeft(state, index, sim, item.id) < 10) continue;
    out.push({ item, score: needScore(state, index, sim, item, ctx) });
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, limit);
}

/**
 * Revision that is due on `date`, read straight from the simulated records.
 *
 * The simulated `nextRevisionDue` is the single source of truth. A separate
 * "ledger" copied once at the start would go stale the moment the simulation
 * learned or revised something, which would silently mean the plan never
 * schedules any revision at all.
 */
function dueEntries(state, index, sim, date, ctx) {
  const out = [];
  for (const [itemId, r] of sim) {
    if (!index.byId.has(itemId)) continue;
    if (r.status === STATUS.MASTERED) continue;
    if (!r.nextRevisionDue) continue;
    if (r.status === STATUS.NOT_STARTED) continue;
    const overdue = diffDays(r.nextRevisionDue, date);
    if (overdue < 0) continue;
    out.push({
      itemId,
      due: r.nextRevisionDue,
      overdue,
      stage: r.revisionStage || 0,
      score: reviseScore(state, sim, { itemId, due: r.nextRevisionDue, overdue, stage: r.revisionStage || 0 }, ctx),
    });
  }
  return out;
}

function rankedPracticeItems(state, index, sim, ctx, limit = 6) {
  const out = [];
  for (const item of index.items) {
    const r = simGet(sim, item.id);
    if (r.status === STATUS.NOT_STARTED) continue;
    const acc = r.mcq.att >= 4 ? r.mcq.correct / r.mcq.att : 0.5;
    const weak = r.status === STATUS.WEAK || r.status === STATUS.NEEDS_REVISION ? 1 : 0;
    const openMistakes = (state.mistakes || []).filter((m) => m.itemId === item.id && !m.resolved).length;
    const s = (1 - acc) * 2 + weak + Math.min(1, openMistakes * 0.3) + (ctx.phase !== 'learn' ? 0.5 : 0);
    if (s > 0.9) out.push({ item, score: s });
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, limit);
}

/* ------------------------------------------------------------------ */
/* Task factory (one attempt for a type)                               */
/* ------------------------------------------------------------------ */

function makeTask(type, args) {
  const {
    state, index, sim, ctx, date, budget, allowed, lastMixedDi, di,
    subjectCount, perSubjectCap,
  } = args;
  const st = state.settings;
  const minT = st.minTaskMinutes;
  const maxT = st.maxTaskMinutes;
  if (budget < minT) return null;
  if (!allowed.has(type)) return null;

  // A subject that already has its blocks today cannot take another one. This
  // check has to happen during candidate selection — otherwise the planner
  // keeps re-proposing the same full subject and stalls with spare time.
  const subjectFull = (sid) => (subjectCount?.[sid] || 0) >= (perSubjectCap ?? 2);

  if (type === 'learn') {
    if (!ctx.ectx.allowNewChapters) return null;
    // When the student has hand-picked topics for this date, do not add
    // chapters they did not ask for. Due revisions, practice and mistakes are
    // obligations rather than new reading, so they still run.
    if (ctx.picks && ctx.picks.length) return null;
    const cands = groupTopics(state, index, sim, ctx).filter((g) => !subjectFull(g.subjectId));
    for (const g of cands) {
      // Same rule as the group filter: a chapter already in progress may be a
      // short finishing block, an untouched one may not.
      if (g.left <= 0) continue;
      if (g.left < minT - 4 && !g.started) continue;
      const chunk = Math.max(minT, Math.min(maxT, g.left, budget));
      const t = mkLearnTask(state, index, sim, g, chunk, ctx, date);
      return { task: t, after: () => simAdvanceLearnBlock(state, index, sim, g, t.plannedMin, date) };
    }
    return null;
  }

  if (type === 'revise') {
    const entries = dueEntries(state, index, sim, date, ctx)
      .filter((e) => !subjectFull(e.itemId ? index.byId.get(e.itemId)?.subjectId : null));
    if (!entries.length) return null;
    entries.sort((a, b) => b.score - a.score || b.overdue - a.overdue);
    for (const e of entries) {
      const r = simGet(sim, e.itemId);
      const minutes = Math.max(minT, Math.min(r.status === STATUS.WEAK ? 25 : 20, maxT, budget));
      const t = mkReviseTask(state, index, sim, e, minutes, ctx, date);
      return { task: t, after: () => simAdvanceRevise(state, sim, e.itemId, date, r.status === STATUS.WEAK ? 0.4 : 0.85) };
    }
    return null;
  }

  if (type === 'practice') {
    const cands = rankedPracticeItems(state, index, sim, ctx).filter((c) => !subjectFull(c.item.subjectId));
    for (const { item } of cands) {
      const minutes = Math.max(minT, Math.min(30, budget));
      const t = mkPracticeTask(state, index, sim, item, minutes, ctx, date);
      return { task: t, after: () => simAdvancePractice(sim, item.id, t.mcq) };
    }
    return null;
  }

  if (type === 'maintenance') {
    // Exam Mode with genuinely nothing due: keep a light, honest touch rather
    // than an empty day. It does NOT advance learning — it is orientation only.
    const minutes = Math.max(minT, Math.min(20, budget));
    return {
      task: {
        ...baseTask(null, date, 'maintenance'),
        id: `t_maint_${date}`,
        title: 'Exam-Mode maintenance',
        subjectName: 'Maintenance',
        plannedMin: minutes,
        detail: 'Skim your chapter checklist, write down the three areas you are least sure about, and park them for after the exam.',
        reason: 'Exam Mode — keeping the syllabus in view without competing with your school exam.',
        priority: PRIORITY.LOW,
      },
      after: () => {},
    };
  }

  if (type === 'mistakes') {
    const open = (state.mistakes || []).filter((m) => !m.resolved);
    if (!open.length) return null;
    const count = Math.max(3, Math.round((budget / 25) * 6));
    return { task: mkMistakesTask(state, Math.min(open.length, count), Math.min(30, budget), ctx, date), after: () => {} };
  }

  if (type === 'mixed') {
    if (di - lastMixedDi < 1) return null;
    let studied = 0;
    for (const it of index.items) if (simGet(sim, it.id).status !== STATUS.NOT_STARTED) studied++;
    if (studied < 4) return null;
    const minutes = Math.max(minT, Math.min(30, budget));
    const mcq = Math.min(st.mixedMcqSize, Math.max(5, Math.round((minutes / 22) * 12)));
    return { task: mkMixedTask(state, minutes, ctx, date, mcq), after: () => {} };
  }

  if (type === 'test') {
    const minutes = Math.max(minT, Math.min(60, budget));
    return { task: mkTestTask(state, index, minutes, ctx, date), after: () => {} };
  }

  return null;
}

/* ------------------------------------------------------------------ */
/* MAIN PLANNER                                                       */
/* ------------------------------------------------------------------ */

export function generatePlan(state, index, opts = {}) {
  const today = opts.today || todayISO();
  const deadline = state.settings.deadline;

  // --- 1. Global pressure -------------------------------------------------
  const work = remainingWorkMinutes(state, index);
  const capacityDays = dateRange(today, deadline);
  let capacity = 0;
  for (const d of capacityDays) capacity += availableMinutesFor(state, d);
  const pressure = capacity > 0 ? work.total / capacity : 99;
  const phase = planPhase(state, index, today);
  const daysLeft = diffDays(today, deadline);
  const openUnit = openUnitId(state, index);

  const sim = makeLedger(state, index);

  // --- 2. Seed any revision date implied by the record itself -------------
  // The simulated records already carry `nextRevisionDue`; this only fills in
  // the ones that were never scheduled, so revision is never orphaned.
  for (const item of index.items) {
    const r = simGet(sim, item.id);
    if (r.lastStudied && !r.nextRevisionDue && !RESOLVED.has(r.status)) {
      const gap = nextGapDays(state, item.id, r.lastStudied, r);
      r.nextRevisionDue = addDays(r.lastStudied, gap);
    }
  }

  const mix = PHASE_MIX[phase];
  const plan = {};
  const skipped = [];
  const dropped = [];
  let lastMixedDi = -99;
  let lastTestDi = -99;
  const perSubjectMinutes = {};
  const horizonEnd = addDays(today, Math.min(MAX_HORIZON_DAYS, Math.max(0, daysLeft)));

  for (const [di, date] of dateRange(today, horizonEnd).entries()) {
    const cap = availableMinutesFor(state, date);
    const ectx = examContext(state, date);
    const day = blankDay();
    day.date = date;
    day.availableMin = cap;
    day.phase = ectx.phase;
    day.note = ectx.note;

    if (cap <= 0) {
      day.closed = true;
      day.closedReason = ectx.phase === PHASE.DURING
        ? 'Exam Mode — IOE maintenance only'
        : state.settings.busyDays[date] !== undefined
          ? 'You marked this day unavailable'
          : 'Not a study day';
      plan[date] = day;
      continue;
    }

    const allowed = allowedTaskTypes(ectx);
    const picks = picksForDate(state, date);
    const nonces = (state.overrides && state.overrides.shuffleNonce) || {};
    const shuffleSeed =
      state.settings.planStyle === 'shuffle' ? `${date}#${nonces[date] || 0}` : null;
    const ctx = { pressure, phase, daysLeft, ectx, openUnitId: openUnit, today, date, picks, shuffleSeed };
    const tasks = [];
    const subjectCount = {};
    let budget = cap;
    const perSubjectCap = 2;

    const add = (task, opts = {}) => {
      if (!task || task.plannedMin <= 0) return false;
      if (budget < task.plannedMin - 0.5) return false;
      if (task.type === 'learn' || task.type === 'revise' || task.type === 'practice' || task.type === 'fill') {
        // The per-subject cap exists to stop the automatic choice from proposing
        // the same subject all day. A hand-picked topic is an explicit decision,
        // so it is not subject to that cap.
        if (!opts.ignoreCap && task.subjectId && (subjectCount[task.subjectId] || 0) >= perSubjectCap) return false;
        if (task.subjectId) subjectCount[task.subjectId] = (subjectCount[task.subjectId] || 0) + 1;
      }
      tasks.push(task);
      budget -= task.plannedMin;
      const k = task.subjectId || 'MIX';
      perSubjectMinutes[k] = (perSubjectMinutes[k] || 0) + task.plannedMin;
      return true;
    };

    // --- Pinned items first (explicit user override) ---------------------
    for (const itemId of state.overrides.pinnedItemIds || []) {
      const item = index.byId.get(itemId);
      if (!item) continue;
      const r = simGet(sim, itemId);
      if (RESOLVED.has(r.status)) continue;
      const left = learnMinutesLeft(state, index, sim, itemId);
      if (left < 5) continue;
      // Pin the whole topic the item belongs to, so the block still respects
      // the subject cap and the pinning is never silently ignored.
      const group = groupTopics(state, index, sim, ctx, 999)
        .find((g) => g.members.some((m) => m.id === itemId));
      if (!group) continue;
      if ((subjectCount[item.subjectId] || 0) >= perSubjectCap) continue;
      const t = mkLearnTask(state, index, sim, group, Math.min(state.settings.maxTaskMinutes, group.left, budget), ctx, date);
      t.pinned = true;
      t.reason = 'Pinned by you — scheduled first regardless of score.';
      if (add(t)) simAdvanceLearnBlock(state, index, sim, group, t.plannedMin, date);
    }

    // --- Topics the student hand-picked for this date ---------------------
    // These win over the automatic choice, and keep the order the student
    // chose. Anything that no longer needs learning is reported rather than
    // silently dropped, so a pick is never quietly ignored.
    const missedPicks = [];
    let picksDone = 0;
    if (picks.length) {
      const all = groupTopics(state, index, sim, ctx, 999, 0);
      const isComplete = (key) => {
        const members = index.items.filter((i) => topicKeyOf(i) === key);
        // An unknown key has no subtopics at all. Vacuously "every" would score
        // it as done, so a stale or corrupt pick is reported as a miss instead.
        if (!members.length) return false;
        return members.every((i) => {
          const rr = simGet(sim, i.id);
          if (rr.progressPct >= 100 || rr.status === STATUS.STRONG || rr.status === STATUS.MASTERED) return true;
          // "No minutes left" is the app's real definition of done: a subtopic
          // at 98% of a 12-minute estimate has 0.24 minutes left, which rounds
          // to 0. Testing progressPct alone would strand it at 98% forever.
          return learnMinutesLeft(state, index, sim, i.id) <= 0;
        });
      };
      for (const [pi, key] of picks.entries()) {
        if (isComplete(key)) { picksDone++; continue; }
        const group = all.find((g) => g.key === key);
        if (!group) {
          missedPicks.push(key);
          continue;
        }
        const t = mkLearnTask(state, index, sim, group,
          Math.min(state.settings.maxTaskMinutes, group.left, budget), ctx, date);
        t.picked = true;
        t.pickRank = pi;
        t.reason = 'You chose this for today.';
        if (add(t, { ignoreCap: true })) {
          simAdvanceLearnBlock(state, index, sim, group, t.plannedMin, date);
          if (isComplete(key)) picksDone++;
        } else {
          missedPicks.push(key);
        }
      }
    }

    // --- Personal tasks for this exact day -------------------------------
    for (const p of state.personal || []) {
      if (p.date === date && !p.done) add(mkPersonalTask(p, date));
    }

    const mk = (type) => makeTask(type, {
      state, index, sim, ctx, date, budget, allowed, lastMixedDi, di,
      subjectCount, perSubjectCap,
    });

    // --- Pass 1: phase quotas --------------------------------------------
    const quota = {};
    const spent = {};
    for (const k of ['learn', 'revise', 'practice', 'mixed', 'mistakes']) {
      quota[k] = Math.round(cap * (mix[k] || 0));
      spent[k] = 0;
    }
    // A hand-picked day gives the student's own chapters first claim on the
    // minutes. Practice is not skipped, only deferred to whatever is genuinely
    // left over, otherwise finishing a pick early silently redirects the day
    // to Mixed MCQ. Revisions stay in the quota pass: those are obligations.
    const deferred = picks.length ? ['practice', 'mixed', 'mistakes'] : [];
    for (const k of deferred) quota[k] = 0;
    const alreadyUsed = tasks.reduce((a, t) => a + t.plannedMin, 0);
    for (const k of Object.keys(quota)) {
      quota[k] = Math.max(0, quota[k] - Math.round(alreadyUsed * (mix[k] || 0)));
    }

    const dead = new Set();
    let guard = 0;
    while (budget >= state.settings.minTaskMinutes && guard++ < 20) {
      let bestType = null;
      let bestDeficit = 0;
      for (const k of ['revise', 'learn', 'practice', 'mistakes', 'mixed']) {
        if (dead.has(k) || !allowed.has(k)) continue;
        const d = quota[k] - spent[k];
        if (d > bestDeficit) { bestDeficit = d; bestType = k; }
      }
      if (!bestType) break;
      const made = mk(bestType);
      if (!made || !add(made.task)) { dead.add(bestType); continue; }
      made.after();
      spent[bestType] += made.task.plannedMin;
      if (made.task.type === 'mixed') lastMixedDi = di;
    }

    // --- Weekly full-length test in the later phases ----------------------
    if (allowed.has('test') && phase !== 'learn' && di - lastTestDi >= 7 && budget >= 45) {
      const made = mk('test');
      if (made && add(made.task)) lastTestDi = di;
    }

    // --- Pass 2: overflow — never waste spare time -----------------------
    const OVERFLOW_ORDER = ectx.phase === PHASE.DURING
      ? ['revise', 'mistakes', 'mixed', 'practice', 'maintenance']
      : ['learn', 'revise', 'mistakes', 'practice', 'mixed'];
    // On a hand-picked day the overflow pass must not reach for another
    // chapter, so the deferred types are skipped here and run at the end.
    const overflowOrder = deferred.length
      ? OVERFLOW_ORDER.filter((t) => !deferred.includes(t) && t !== 'learn')
      : OVERFLOW_ORDER;
    guard = 0;
    let progressed = true;
    while (budget >= state.settings.minTaskMinutes && guard++ < 12 && progressed) {
      progressed = false;
      for (const t of overflowOrder) {
        const made = mk(t);
        if (made && add(made.task)) {
          made.after();
          progressed = true;
          if (made.task.type === 'mixed') lastMixedDi = di;
          break;
        }
      }
    }

    // --- Pass 3: the deferred types, now the picks have had their turn -----
    if (deferred.length) {
      guard = 0;
      let progressed = true;
      while (budget >= state.settings.minTaskMinutes && guard++ < 8 && progressed) {
        progressed = false;
        for (const t of deferred) {
          if (!allowed.has(t)) continue;
          const made = mk(t);
          if (made && add(made.task)) {
            made.after();
            progressed = true;
            if (made.task.type === 'mixed') lastMixedDi = di;
            break;
          }
        }
      }
    }

    // --- Pass 4: today only — explicit bonus block with alternatives -----
    if (date === today && budget >= state.settings.minTaskMinutes) {
      const fill = buildFillTask(state, index, sim, ctx, budget, tasks, picks.length > 0);
      if (fill) add(fill);
    }

    day.tasks = tasks.sort(
      // Hand-picked topics keep the order the student chose them in and lead
      // the day: an explicit instruction must not be re-sorted by urgency, or
      // the plan silently reads as if it ignored the choice.
      (a, b) => (a.pickRank ?? 1e9) - (b.pickRank ?? 1e9)
        || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
        || b.plannedMin - a.plannedMin,
    );
    day.plannedMin = day.tasks.reduce((a, t) => a + t.plannedMin, 0);
    day.headroom = Math.max(0, Math.round(budget));

    // Surface how the day's material was chosen, and anything that could not
    // be honoured, so the plan never looks like it ignored the student.
    day.pickStyle = picks.length ? 'picks' : state.settings.planStyle === 'shuffle' ? 'shuffle' : 'auto';
    day.picksTotal = picks.length;
    day.picksDone = picksDone;
    if (missedPicks.length) day.picksMissed = missedPicks;

    // Anything that did not fit and could not be placed later is reported.
    if (day.headroom >= state.settings.minTaskMinutes && date === today) {
      day.headroom = Math.max(0, Math.round(budget));
    }
    plan[date] = day;
  }

  // --- 3. What will not fit before the deadline --------------------------
  let unassignedMin = 0;
  for (const item of index.items) {
    const r = simGet(sim, item.id);
    if (r.status === STATUS.STRONG || r.status === STATUS.MASTERED) continue;
    unassignedMin += learnMinutesLeft(state, index, sim, item.id);
  }
  if (unassignedMin > 0) {
    dropped.push({
      minutes: unassignedMin,
      message: `${fmtMinutes(unassignedMin)} of syllabus work could not be scheduled before ${deadline}. The planner will keep working to the deadline, but this is the honest shortfall — see the Progress page for ways to close it.`,
    });
  }

  return {
    plan,
    meta: {
      generatedAt: new Date().toISOString(),
      today,
      deadline,
      phase,
      phaseLabel: PHASE_LABEL[phase],
      daysLeft,
      pressure: Math.round(pressure * 100) / 100,
      capacity,
      workTotal: work.total,
      work,
      unassignedMin,
      perSubjectMinutes,
      syllabusLearned: work.total === 0,
      openUnit,
    },
    missed: findMissedSessions(state, today),
    skipped,
    dropped,
  };
}

function itemBusyToday(tasks, type, itemId) {
  return tasks.some((t) => t.type === type && t.itemId === itemId);
}

function openUnitId(state, index) {
  let best = null;
  let bestScore = -Infinity;
  for (const u of index.units) {
    const s = unitStats(state, index, u);
    if (s.complete) continue;
    const inFlight = s.covered > 0 ? 1 : 0;
    const score = inFlight * 2 - s.progress / 100;
    if (score > bestScore) { bestScore = score; best = u.id; }
  }
  return best;
}

function buildFillTask(state, index, sim, ctx, budget, todayTasks, picksActive = false) {
  const st = state.settings;
  const options = [];

  // On a hand-picked day the bonus block must not smuggle in a chapter the
  // student did not choose, so that option is withheld entirely.
  const cands = picksActive
    ? []
    : groupTopics(state, index, sim, ctx, 3)
        .filter((g) => !itemBusyToday(todayTasks, 'learn', g.members[0].id));
  if (cands.length) {
    const group = cands[0];
    options.push({
      weight: 3,
      make: () => mkLearnTask(state, index, sim, group, Math.min(st.maxTaskMinutes, budget, group.left), ctx, ctx.today),
    });
  }

    const soon = [...sim]
      .filter(([itemId, r]) => r.nextRevisionDue
        && r.status !== STATUS.NOT_STARTED
        && r.status !== STATUS.MASTERED
        && index.byId.has(itemId)
        && diffDays(ctx.today, r.nextRevisionDue) > 0
        && diffDays(ctx.today, r.nextRevisionDue) <= 4
        && !itemBusyToday(todayTasks, 'revise', itemId))
      .map(([itemId, r]) => ({ itemId, due: r.nextRevisionDue, stage: r.revisionStage || 0, until: diffDays(ctx.today, r.nextRevisionDue) }))
      .sort((a, b) => a.until - b.until)[0];
  if (soon) {
    options.push({
      weight: 2,
      make: () => mkReviseTask(state, index, sim, { itemId: soon.itemId, overdue: -soon.until, stage: soon.stage }, Math.min(20, budget), ctx, ctx.today),
    });
  }

  const open = (state.mistakes || []).filter((m) => !m.resolved);
  if (open.length) {
    options.push({
      weight: 2.5,
      make: () => mkMistakesTask(state, Math.min(open.length, 6), Math.min(25, budget), ctx, ctx.today),
    });
  }

  options.push({
    weight: 2,
    make: () => mkMixedTask(state, Math.min(30, budget), ctx, ctx.today, Math.max(8, Math.round((budget / 22) * 12))),
  });

  if (!options.length) return null;
  options.sort((a, b) => b.weight - a.weight);
  // Try each option in turn. Picking one and letting `add` reject it wholesale
  // silently lost the whole bonus block whenever the subject cap disagreed.
  const ordered = [];
  for (const o of options) {
    const made = o.make();
    if (made) ordered.push(made);
    if (ordered.length >= 3) break;
  }
  const first = ordered[0];
  if (!first) return null;
  return {
    ...first,
    id: `${first.id}_fill`,
    type: 'fill',
    priority: PRIORITY.LOW,
    reason: 'You finished early — spare time, not wasted time.',
    alternatives: ordered.slice(1)
      .map((t2) => ({ id: t2.id, type: t2.type, itemId: t2.itemId, title: t2.title, plannedMin: t2.plannedMin, detail: t2.detail })),
  };
}

/* ------------------------------------------------------------------ */
/* Missed-session detection (edge cases 1 & 2)                          */
/* ------------------------------------------------------------------ */

function findMissedSessions(state, today) {
  const out = [];
  for (let i = 30; i >= 1; i--) {
    const d = addDays(today, -i);
    const cap = availableMinutesFor(state, d);
    if (cap <= 0) continue;
    const done = (state.days[d]?.sessions || []).reduce((a, s) => a + (s.actualMin || 0), 0);
    if (done === 0) out.push({ date: d, lostMin: cap, reason: 'No study logged' });
    else if (done < cap * 0.5) out.push({ date: d, lostMin: cap - done, reason: 'Partial day' });
  }
  const totalLost = out.reduce((a, o) => a + o.lostMin, 0);
  return {
    days: out,
    totalLost,
    consecutive: longestRun(out.map((o) => o.date)),
    note: out.length === 0 ? null
      : out.length === 1
        ? `${out[0].lostMin} min from ${out[0].date} will be spread across coming days, not dumped on one.`
        : `${out.length} quiet days, ${totalLost} min lost. Redistributed across the plan; deadline risk recalculated.`,
  };
}

function longestRun(dates) {
  const sorted = Array.from(new Set(dates)).sort();
  let best = 0; let cur = 0; let prev = null;
  for (const d of sorted) {
    if (prev && diffDays(prev, d) === 1) cur++;
    else cur = 1;
    best = Math.max(best, cur);
    prev = d;
  }
  return best;
}

/* ------------------------------------------------------------------ */
/* Chapter completion intelligence                                      */
/* ------------------------------------------------------------------ */

export function chapterIntelligence(state, index, planResult) {
  const plan = planResult?.plan || {};
  const firstScheduled = {};
  const lastScheduled = {};
  for (const [date, day] of Object.entries(plan)) {
    for (const t of day.tasks || []) {
      if (!t.unitId) continue;
      if (!firstScheduled[t.unitId] || date < firstScheduled[t.unitId]) firstScheduled[t.unitId] = date;
      if (!lastScheduled[t.unitId] || date > lastScheduled[t.unitId]) lastScheduled[t.unitId] = date;
    }
  }

  const today = todayISO();
  return index.units.map((u, idx) => {
    const s = unitStats(state, index, u);
    const next = index.units.slice(idx + 1).find((o) => !unitStats(state, index, o).complete);
    const eta = s.complete ? (s.lastStudied || null) : (lastScheduled[u.id] || null);
    const status = s.complete ? 'Complete'
      : !s.started ? 'Not started'
        : s.progress >= 80 ? 'Almost done'
          : 'In progress';
    return {
      ...s,
      eta,
      etaNote: s.complete
        ? `Finished ${s.lastStudied || ''}`.trim()
        : eta
          ? (diffDays(today, eta) <= 0 ? 'due today' : `in ${diffDays(today, eta)} day${diffDays(today, eta) === 1 ? '' : 's'}`)
          : 'not scheduled — check feasibility',
      nextUnit: next ? { id: next.id, title: next.title, subject: next.subjectName } : null,
      scheduledFrom: firstScheduled[u.id] || null,
      status,
    };
  });
}

/* ------------------------------------------------------------------ */
/* Writing the plan into state                                         */
/* ------------------------------------------------------------------ */

export function commitPlan(state, planResult) {
  const today = planResult.meta.today;
  for (const [date, day] of Object.entries(planResult.plan)) {
    if (date < today) continue;
    const prev = state.days[date] || blankDay();
    state.days[date] = {
      ...prev,
      availableMin: day.availableMin,
      closed: day.closed,
      closedReason: day.closedReason,
      phase: day.phase,
      note: day.note,
      tasks: day.tasks,
      plannedMin: day.plannedMin,
      headroom: day.headroom || 0,
    };
  }
  state.meta.lastPlanAt = planResult.meta.generatedAt;
  state.meta.lastPlanPressure = planResult.meta.pressure;
  state.meta.lastPlanPhase = planResult.meta.phase;
  return planResult;
}

/* ------------------------------------------------------------------ */
/* Logging outcomes (section 13: daily adaptation)                     */
/* ------------------------------------------------------------------ */

export const OUTCOMES = {
  DONE: 'done',
  PARTIAL: 'partial',
  SKIPPED: 'skipped',
  HARD: 'too_difficult',
  SLOW: 'longer_than_expected',
  EARLY: 'finished_early',
};

export const OUTCOME_LABEL = {
  done: 'Completed',
  partial: 'Partially completed',
  skipped: 'Skipped',
  too_difficult: 'Too difficult',
  longer_than_expected: 'Took longer than expected',
  finished_early: 'Finished early',
};

export function logTask(state, index, dateISO, task, outcome, actualMin, fraction = null) {
  const day = getDay(state, dateISO);
  if (!day.sessions) day.sessions = [];

  const f = fraction !== null ? fraction
    : outcome === OUTCOMES.DONE || outcome === OUTCOMES.EARLY || outcome === OUTCOMES.SLOW ? 1
      : outcome === OUTCOMES.PARTIAL ? 0.5
        : 0;

  // Snapshot the records this session is about to touch, so logging can be
  // undone honestly. Without this, "undo" could only drop the log line and
  // leave the progress behind, which is the kind of lie this app avoids.
  const touched = task.itemIds && task.itemIds.length
    ? task.itemIds.slice()
    : (task.itemId ? [task.itemId] : []);
  const preItems = {};
  for (const id of touched) if (state.items[id]) preItems[id] = cloneRecord(state.items[id]);

  const session = {
    id: uid('s'),
    date: dateISO,
    taskId: task.id,
    type: task.type,
    itemId: task.itemId || null,
    unitId: task.unitId || null,
    subjectId: task.subjectId || null,
    title: task.title,
    plannedMin: task.plannedMin,
    actualMin: Math.max(0, Math.round(actualMin || 0)),
    fraction: f,
    outcome,
    at: new Date().toISOString(),
  };
  if (Object.keys(preItems).length) session.undo = { items: preItems };
  day.sessions.push(session);
  day.actualMin = (day.sessions || []).reduce((a, s) => a + s.actualMin, 0);
  day.logged = true;

  if (task.type === 'learn' && Array.isArray(task.itemIds) && task.itemIds.length > 1) {
    // A learn block can span several subtopics of one topic. Real minutes must
    // be distributed in study order — finishing one subtopic before starting
    // the next — otherwise every subtopic would appear equally half-done and
    // the progress numbers would be fiction.
    const members = task.itemIds.map((id) => index.byId.get(id)).filter(Boolean);
    let left = outcome === OUTCOMES.SKIPPED ? 0 : Math.max(0, Math.round(session.actualMin * f));
    for (const m of members) {
      const part = { ...task, itemId: m.id, itemIds: undefined };
      if (outcome === OUTCOMES.SKIPPED) { applyOutcomeToItem(state, index, part, outcome, 0, dateISO, session); continue; }
      if (left <= 0) break;
      const rec = getItem(state, m.id);
      const est = rec.estMinOverride || estMinutesFor(state, m);
      const rem = Math.max(0, Math.round(est * (1 - rec.progressPct / 100)));
      if (rem <= 0) continue;
      const give = Math.min(rem, left);
      applyOutcomeToItem(state, index, { ...part, plannedMin: give }, outcome, give / est, dateISO, session);
      left -= give;
    }
  } else if (task.itemId) {
    applyOutcomeToItem(state, index, task, outcome, f, dateISO, session);
  }
  if (task.personalId) {
    const p = (state.personal || []).find((x) => x.id === task.personalId);
    if (p && outcome !== OUTCOMES.SKIPPED) p.done = true;
  }
  if (outcome === OUTCOMES.SKIPPED) {
    pushLog(state, 'skip', `Skipped: ${task.title} — re-planned into later days`);
  }
  return session;
}

function applyOutcomeToItem(state, index, task, outcome, f, dateISO, session) {
  const r = getItem(state, task.itemId);
  const item = index.byId.get(task.itemId);
  if (!item) return;

  if (outcome === OUTCOMES.SKIPPED) {
    if (r.nextRevisionDue && diffDays(r.nextRevisionDue, dateISO) > 0) r.nextRevisionDue = dateISO;
    return;
  }

  if (task.type === 'learn') {
    const est = r.estMinOverride || estMinutesFor(state, item);
    r.progressPct = Math.min(100, Math.round(((r.progressPct / 100) * est + f * task.plannedMin) / est * 100));
    r.minutesLearned = (r.minutesLearned || 0) + f * task.plannedMin;
    if (!r.firstSeenAt) r.firstSeenAt = `${dateISO}T00:00:00.000Z`;
    if (r.status === STATUS.NOT_STARTED) r.status = STATUS.STUDYING;
    if (outcome === OUTCOMES.TOO_DIFFICULT) {
      r.status = STATUS.WEAK;
      r.difficulty = Math.min(5, (r.difficulty || item.size) + 1);
    }
    markStudied(state, item.id, dateISO, 'learn');
    // Snap any subtopic of this chapter that has no minutes left to 100%.
    // Otherwise a subtopic can sit at 98% forever: the planner treats it as
    // finished because there is nothing left to study, but the record never
    // says so, so the syllabus and the day's counters never agree.
    for (const sib of index.items) {
      if (topicKeyOf(sib) !== topicKeyOf(item)) continue;
      const sr = getItem(state, sib.id);
      if (sr.progressPct >= 100) continue;
      const est = sr.estMinOverride || estMinutesFor(state, sib);
      // Mirrors learnMinutesLeft(): what is left rounds to whole minutes.
      if (Math.max(0, Math.round(est * (1 - sr.progressPct / 100))) <= 0) sr.progressPct = 100;
    }
  } else if (task.type === 'revise') {
    r.progressPct = Math.max(r.progressPct, 100);
    if (outcome === OUTCOMES.TOO_DIFFICULT) {
      markRevisionFailed(state, item.id, dateISO);
    } else {
      const q = outcome === OUTCOMES.PARTIAL ? 0.45 : outcome === OUTCOMES.DONE ? 0.9 : 0.75;
      markStudied(state, item.id, dateISO, 'revise', q);
      if (r.status === STATUS.NEEDS_REVISION && q >= 0.85) r.status = STATUS.STRONG;
    }
  } else if (task.type === 'practice') {
    if (outcome === OUTCOMES.DONE) r.mcq.att = (r.mcq.att || 0) + (task.mcq || 10);
  }

  if (outcome === OUTCOMES.SLOW) {
    const actual = session.actualMin || task.plannedMin;
    const est = r.estMinOverride || estMinutesFor(state, item);
    r.estMinOverride = Math.min(240, Math.max(15, Math.round((r.estMinOverride || est) * 0.4 + actual * 0.6)));
  }
  if (outcome === OUTCOMES.TOO_DIFFICULT && !r.difficulty) r.difficulty = Math.min(5, item.size + 1);
  if (r.progressPct >= 100 && r.status !== STATUS.STRONG && r.status !== STATUS.MASTERED) {
    r.status = STATUS.STUDIED_ONCE;
  }
}

function cloneRecord(o) {
  return typeof structuredClone === 'function' ? structuredClone(o) : JSON.parse(JSON.stringify(o));
}

/**
 * Undo every session logged on a day, restoring the progress each one changed.
 *
 * Snapshots are replayed in reverse order, so the earliest snapshot wins and the
 * day ends up exactly as it was before the first session was logged.
 */
export function undoSessions(state, dateISO) {
  const day = getDay(state, dateISO);
  if (!day || !day.sessions || !day.sessions.length) return { removed: 0, restored: 0 };
  const sessions = day.sessions.slice();
  let restored = 0;
  for (let i = sessions.length - 1; i >= 0; i--) {
    const items = sessions[i].undo && sessions[i].undo.items;
    if (!items) continue;
    for (const [id, snap] of Object.entries(items)) {
      state.items[id] = cloneRecord(snap);
      restored++;
    }
  }
  day.sessions = [];
  day.actualMin = 0;
  day.logged = false;
  pushLog(state, 'undo', `Undid ${sessions.length} logged session(s) on ${dateISO} and restored the progress they recorded.`);
  return { removed: sessions.length, restored };
}

/**
 * Record ONE MCQ answer as evidence, and keep the Mistake Bank in step.
 *
 * This is the only place an MCQ result touches state, so the Practice runner
 * and the Mistake Bank can never disagree about what counts as evidence.
 *
 * Rules:
 *   - a wrong answer opens (or re-opens) a mistake and pulls the next revision
 *     closer, but it does not erase a topic the user has already earned
 *     Strong / Mastered with real evidence;
 *   - a correct answer on a question that is in the bank is what RESOLVES it.
 *     A mistake is never cleared by a button or a self-report.
 */
export function recordAnswer(state, question, picked, opts = {}) {
  const at = opts.at || new Date().toISOString();
  const dateISO = at.slice(0, 10);
  const correct = picked === question.answer;
  const rec = getItem(state, question.itemId);
  const outcome = { correct, itemId: question.itemId, questionId: question.id, mistake: null };

  if (rec) {
    rec.mcq = rec.mcq || { att: 0, correct: 0, streak: 0, last: null };
    rec.mcq.att += 1;
    rec.mcq.last = at;
    if (correct) {
      rec.mcq.correct += 1;
      rec.mcq.streak = (rec.mcq.streak || 0) + 1;
    } else {
      rec.mcq.streak = 0;
      if (RESOLVED.has(rec.status)) {
        // A slip does not erase mastery that was earned with real evidence, but
        // it does bring the topic back sooner.
        rec.lastRevisionScore = Math.min(rec.lastRevisionScore ?? 0.5, 0.5);
        rec.nextRevisionDue = addDays(dateISO, Math.max(1, Math.round(nextGapDays(state, question.itemId, dateISO) * 0.4)));
      } else {
        // A topic still being learned is honestly Weak the moment you get it wrong.
        rec.status = STATUS.WEAK;
        markRevisionFailed(state, question.itemId, dateISO);
      }
    }
  }

  state.mistakes = state.mistakes || [];
  const existing = state.mistakes.find((m) => m.questionId === question.id);

  if (!correct) {
    if (existing) {
      existing.timesWrong = (existing.timesWrong || 1) + 1;
      existing.resolved = false;
      existing.picked = picked;
      existing.at = at;
      outcome.mistake = existing.id;
    } else {
      const m = {
        id: `m_${question.id}`,
        questionId: question.id,
        itemId: question.itemId,
        subject: question.subject || null,
        picked,
        answer: question.answer,
        at,
        resolved: false,
        timesWrong: 1,
        timesRight: 0,
      };
      state.mistakes.push(m);
      outcome.mistake = m.id;
    }
  } else if (existing && !existing.resolved) {
    // The re-solve that actually clears the bank entry.
    existing.resolved = true;
    existing.resolvedAt = at;
    existing.timesRight = (existing.timesRight || 0) + 1;
    outcome.mistake = existing.id;
    if (rec) {
      if (rec.progressPct < 100) rec.progressPct = 100;
      // A cleared mistake is a real revision attempt, so the interval stretches.
      markStudied(state, question.itemId, dateISO, 'revise', 0.85);
      if (rec.status === STATUS.WEAK || rec.status === STATUS.NEEDS_REVISION) {
        rec.status = STATUS.STUDIED_ONCE;
      }
    }
  }

  pushLog(state, 'mcq',
    `${correct ? 'Correct' : 'Wrong'}: ${String(question.stem || '').slice(0, 70)}`,
    { questionId: question.id, itemId: question.itemId });
  return outcome;
}

/**
 * Promote an item to Strong / Mastered — but only on EVIDENCE.
 * "I studied it once" is never enough.
 */
export function evaluateMastery(state, itemId) {
  const r = getItem(state, itemId);
  if (r.status === STATUS.NOT_STARTED) return { promoted: false, reason: 'Not started yet.' };

  const acc = r.mcq.att >= 6 ? r.mcq.correct / r.mcq.att : null;
  const revScore = r.lastRevisionScore;
  const openMistakes = (state.mistakes || []).filter((m) => m.itemId === itemId && !m.resolved).length;

  // Demotion to Weak needs only MCQ evidence.
  if (r.progressPct >= 100 && acc !== null && acc < 0.7) {
    r.status = STATUS.WEAK;
    return { promoted: true, to: 'Weak', reason: `MCQ accuracy ${Math.round(acc * 100)}% — needs reinforcement.` };
  }

  const blockers = [];
  if (r.progressPct < 100) blockers.push('content not finished');
  if (acc === null) blockers.push(`need 6+ MCQs (have ${r.mcq.att})`);
  if (revScore === null) blockers.push('no revision attempt recorded');
  if (blockers.length) return { promoted: false, reason: `Not enough evidence: ${blockers.join(' · ')}.` };

  if (acc >= 0.85 && revScore >= 0.8) {
    r.status = STATUS.MASTERED;
    return { promoted: true, to: 'Mastered', reason: `MCQ ${Math.round(acc * 100)}% plus a successful revision.` };
  }
  if (acc >= 0.7) {
    r.status = STATUS.STRONG;
    return { promoted: true, to: 'Strong', reason: `MCQ ${Math.round(acc * 100)}% — revision intervals will stretch.` };
  }
  r.status = STATUS.WEAK;
  return { promoted: true, to: 'Weak', reason: `MCQ ${Math.round(acc * 100)}% — needs reinforcement.` };
}
