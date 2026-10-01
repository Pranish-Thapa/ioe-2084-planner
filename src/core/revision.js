/**
 * Spaced revision engine.
 * ---------------------------------------------------------------------------
 * Ladder implemented (the spec's flow):
 *     initial study
 *       -> short revision        (+1 day)
 *       -> second revision       (+3 days)
 *       -> later revision        (+8 days)
 *       -> mixed MCQ revision    (+17 days)
 *       -> final revision        (+30 days)
 *
 * The intervals are NOT fixed. Each gap is scaled by:
 *   - performance on the last revision / test  (good -> longer gap)
 *   - declared weakness                       (weak  -> shorter gap)
 *   - remaining time before the deadline       (near the end -> compress)
 * and the ladder is re-scaled live in Settings so the user can tune it.
 *
 * Because the schedule is stored on the item record (nextRevisionDue), the
 * planner only has to ask "what is due, and how overdue is it".
 */

import { STATUS, getItem } from './store.js';
import { diffDays, addDays, todayISO } from '../util/dates.js';

export const REVISION_REASON = {
  NEW: 'Newly studied — build the first memory trace',
  SHORT: 'Short-term recall check',
  SECOND: 'Second spaced revision',
  GAP: 'Larger-gap consolidation',
  MIXED: 'Mixed-MCQ revision (interleaved)',
  FINAL: 'Final revision before the exam',
  OVERDUE: 'Revision interval reached (overdue)',
  WEAK: 'Marked weak — targeted reinforcement',
  MISTAKE: 'Open mistakes in the Mistake Bank',
};

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * Performance of an item in 0..1, combining declared status with measured
 * MCQ accuracy. Returns null when there is no evidence at all — the planner
 * then treats the item as "assumed average" rather than inventing a score.
 */
export function performance(state, itemId, rec = null) {
  const r = rec || getItem(state, itemId);
  const acc = r.mcq.att >= 4 ? r.mcq.correct / r.mcq.att : null;
  const statusBoost = {
    [STATUS.MASTERED]: 0.95,
    [STATUS.STRONG]: 0.85,
    [STATUS.NEEDS_REVISION]: 0.55,
    [STATUS.STUDIED_ONCE]: 0.6,
    [STATUS.STUDYING]: 0.5,
    [STATUS.WEAK]: 0.3,
    [STATUS.NOT_STARTED]: 0.35,
  }[r.status] ?? 0.5;
  if (acc === null) return statusBoost;
  // Measured evidence dominates, status nudges it.
  return clamp(acc * 0.75 + statusBoost * 0.25, 0, 1);
}

/**
 * The next gap in days, given the current ladder stage and performance.
 * Good performance stretches the gap; weakness compresses it. Near the exam the
 * ladder is compressed so everything gets at least one more pass.
 */
export function nextGapDays(state, itemId, fromDate = todayISO(), rec = null) {
  const st = state.settings;
  const r = rec || getItem(state, itemId);
  const base = st.revisionIntervals[Math.min(r.revisionStage, st.revisionIntervals.length - 1)] ?? 3;
  const p = performance(state, itemId, r);

  // 1.0 performance -> 1.6x,  0.3 performance -> 0.5x
  let mult = 0.5 + p * 1.1;

  // Weak items are pulled back in.
  if (r.status === STATUS.WEAK) mult *= 0.6;
  if (r.status === STATUS.MASTERED) mult *= 1.5;
  if (r.mcq.att >= 8 && r.mcq.correct / r.mcq.att >= 0.9) mult *= 1.2;

  // Open mistakes force a short return.
  const openMistakes = (state.mistakes || []).filter((m) => m.itemId === itemId && !m.resolved).length;
  if (openMistakes > 0) mult *= 0.6;

  // Compress near the exam so the last passes actually fit.
  const daysLeft = st.deadline ? diffDays(fromDate, st.deadline) : 999;
  if (daysLeft < 21) mult *= 0.7;
  if (daysLeft < 10) mult *= 0.6;

  return Math.max(1, Math.round(base * mult));
}

/** Call immediately after a successful study/revision/practice event. */
export function markStudied(state, itemId, dateISO, kind = 'learn', quality = null) {
  const r = getItem(state, itemId);
  r.lastStudied = dateISO;
  if (kind === 'learn') {
    r.revisionStage = Math.min(r.revisionStage, 0);
    r.nextRevisionDue = addDays(dateISO, Math.max(1, Math.round((state.settings.revisionIntervals[0] ?? 1) * 0.8)));
  } else {
    const q = quality === null ? performance(state, itemId) : quality;
    r.lastRevisionScore = q;
    r.revisionStage = Math.min(r.revisionStage + 1, state.settings.revisionIntervals.length - 1);
    r.nextRevisionDue = addDays(dateISO, nextGapDays(state, itemId, dateISO));
  }
  if (r.status === STATUS.NOT_STARTED) r.status = STATUS.STUDYING;
  return r;
}

/** A failed revision pushes the item back down the ladder. */
export function markRevisionFailed(state, itemId, dateISO) {
  const r = getItem(state, itemId);
  r.lastRevisionScore = 0;
  r.revisionStage = Math.max(0, r.revisionStage - 1);
  r.status = STATUS.WEAK;
  r.nextRevisionDue = addDays(dateISO, 1);
  return r;
}

/** Items with a revision due on or before `dateISO`. */
export function dueRevisions(state, dateISO = todayISO()) {
  const out = [];
  for (const [itemId, r] of Object.entries(state.items)) {
    if (!r.nextRevisionDue) continue;
    const od = diffDays(r.nextRevisionDue, dateISO);
    if (od >= 0) out.push({ itemId, due: r.nextRevisionDue, overdue: od, stage: r.revisionStage });
  }
  out.sort((a, b) => b.overdue - a.overdue || a.stage - b.stage);
  return out;
}

/** Human explanation shown in the "Revision due today" panel. */
export function explainRevision(state, index, entry, dateISO = todayISO()) {
  const item = index.byId.get(entry.itemId);
  if (!item) return null;
  const r = getItem(state, entry.itemId);
  const p = performance(state, entry.itemId);
  const reasons = [];

  if (entry.overdue > 0) {
    reasons.push(
      `Last studied ${entry.overdue === 1 ? 'yesterday' : `${entry.overdue} days ago`}; revision interval reached.`,
    );
  } else {
    reasons.push('Revision scheduled for today.');
  }
  if (r.status === STATUS.WEAK) reasons.push('Marked weak — needs reinforcement.');
  if (r.mcq.att >= 4) {
    reasons.push(
      `Last accuracy ${Math.round((r.mcq.correct / r.mcq.att) * 100)}% over ${r.mcq.att} MCQs.`,
    );
  } else {
    reasons.push('No recent MCQ evidence for this topic.');
  }
  const openM = (state.mistakes || []).filter((m) => m.itemId === entry.itemId && !m.resolved).length;
  if (openM) reasons.push(`${openM} open mistake${openM > 1 ? 's' : ''} in the Mistake Bank.`);

  const stage = entry.stage;
  const label =
    stage <= 0 ? 'Short revision' : stage === 1 ? 'Second revision' : stage === 2 ? 'Consolidation' : stage === 3 ? 'Mixed-MCQ revision' : 'Final revision';

  const minutes = r.status === STATUS.WEAK ? 25 : stage >= 3 ? 20 : 15;
  return {
    item,
    record: r,
    label,
    performance: p,
    reasons,
    lastStudied: r.lastStudied,
    recommend: {
      minutes,
      parts: [
        `${minutes - 10} min concept recall (write formulas from memory)`,
        stage >= 2 ? '10 MCQs on this topic' : '5 quick self-recall checks',
        openM ? 'Review the open mistakes' : 'Note anything you could not recall',
      ],
    },
    performanceLabel: p >= 0.85 ? 'Strong' : p >= 0.6 ? 'Average' : 'Weak',
  };
}
