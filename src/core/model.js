/**
 * Syllabus model: turns the nested syllabus database into a flat, addressable
 * list of study items, and computes coverage / chapter progress from state.
 *
 * Hierarchy:  Subject -> Unit -> Topic (official) -> Subtopic (derived) -> Task
 *
 * The official syllabus lists Subject -> Unit -> Topic-bullets. Those bullets
 * are the authoritative content and are NEVER dropped. Subtopics are a
 * *derived* finer split (so the planner can schedule a 50-minute topic into
 * two 25-minute chunks) generated deterministically by deriveSubtopics().
 */

import { DEFAULT_ITEM_MINUTES, SUBJECT_BASE_MINUTES } from '../../data/syllabus.js';
import { STATUS, COVERED, RESOLVED, getItem } from './store.js';

/* ------------------------------------------------------------------ */
/* Subtopic derivation                                                  */
/* ------------------------------------------------------------------ */

const LABEL_RE = /^([A-Za-z][A-Za-z ()\/&.'-]{2,40}):\s*(.+)$/;

/**
 * Split an official topic bullet into studyable subtopics.
 * Rules (deterministic, documented, no guessing of content):
 *   1. Normalise whitespace and trailing punctuation.
 *   2. If the bullet has a "Label: rest" prefix (e.g. "applications: a, b, c")
 *      keep the label and split the remainder.
 *   3. Split on ';' when present (the syllabus uses ';' to separate distinct
 *      clusters).
 *   4. Otherwise split on ', ' when that yields 2..9 parts of sane length.
 *   5. Anything that would produce fragments of 1-2 characters is merged back.
 * A bullet always yields at least one subtopic, so nothing is ever lost.
 */
export function deriveSubtopics(title) {
  const clean = String(title).replace(/\s+/g, ' ').replace(/[.;,]\s*$/, '').trim();
  if (!clean) return ['Untitled topic'];

  const labelMatch = clean.match(LABEL_RE);
  let prefix = '';
  let body = clean;
  if (labelMatch) {
    prefix = labelMatch[1].trim();
    body = labelMatch[2].trim();
  }

  let parts = body.includes(';') ? body.split(';') : null;
  if (!parts) {
    const comma = body.split(',').map((s) => s.trim()).filter(Boolean);
    const usable = comma.length >= 2 && comma.length <= 9 && comma.every((s) => s.length >= 3);
    parts = usable ? comma : null;
  }
  if (!parts) parts = [body];

  const out = [];
  for (let p of parts) {
    p = p.replace(/^[\s,;:]+/, '').replace(/[\s,;:]+$/, '').replace(/\s+/g, ' ').trim();
    if (!p) continue;
    const nested = p.match(LABEL_RE);
    if (nested) {
      out.push(nested[1].trim());
      const rest = nested[2].trim();
      if (rest.length > 2) out.push(...rest.split(', ').map((s) => s.trim()).filter((s) => s.length > 2));
    } else {
      out.push(p);
    }
  }

  // Merge pathologically short fragments into the previous one.
  const merged = [];
  for (const p of out) {
    if (p.replace(/[^a-z0-9]/gi, '').length <= 2 && merged.length) merged[merged.length - 1] += `, ${p}`;
    else merged.push(p);
  }

  const final = merged.length ? merged : [clean];
  if (!prefix) return final.map(capitalise);
  return final.map((p, i) => {
    const labelled = i === 0 ? `${prefix}: ${lowerFirst(p)}` : `${prefix} — ${lowerFirst(p)}`;
    return capitalise(labelled);
  });
}

function capitalise(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function lowerFirst(s) {
  // keep acronyms / proper nouns intact
  if (/^[A-Z]{2,}/.test(s)) return s;
  return s.charAt(0).toLowerCase() + s.slice(1);
}

/**
 * Paper marks for a subject, stated honestly. `marks: null` means the
 * allocation is not verified against a citable source, which is not the same
 * as the subject being worth nothing - so we never print a 0 for it.
 */
export function marksLabel(subject) {
  const m = subject && subject.marks;
  if (m === null || m === undefined) return 'marks not verified';
  return `${m} marks on the paper`;
}

/* ------------------------------------------------------------------ */
/* Index                                                               */
/* ------------------------------------------------------------------ */

export function buildIndex(subjectGroups) {
  const items = [];
  const topics = [];
  const units = [];
  const subjects = [];

  for (const s of subjectGroups) {
    const subj = { id: s.id, name: s.name, short: s.short || s.name, marks: s.marks, color: s.color, units: [] };
    for (const u of s.units) {
      const unit = {
        id: `${s.id}-U${u.n}`,
        subjectId: s.id,
        subjectName: s.name,
        color: s.color,
        n: u.n,
        title: u.title,
        topics: [],
        itemIds: [],
      };
      for (const t of u.topics) {
        const topic = {
          id: `${unit.id}-T${unit.topics.length + 1}`,
          unitId: unit.id,
          subjectId: s.id,
          title: t.title,
          size: t.size || 3,
          estMin: t.estMin || null,
          difficulty: t.difficulty || null,
          itemIds: [],
        };
        const subs = deriveSubtopics(t.title);
        subs.forEach((st, i) => {
          // Distribute the topic's time budget across its subtopics, weight by
          // text length so a long subtopic gets proportionally more time.
          const weights = subs.map((s2) => Math.max(1, s2.split(/\s+/).length));
          const totalW = weights.reduce((a, b) => a + b, 0);
          const base = SUBJECT_BASE_MINUTES[s.id] || 24;
          const est = Math.max(12, Math.round(((t.estMin || base * topic.size) * weights[i]) / totalW));
          const item = {
            id: `${topic.id}-S${i + 1}`,
            topicId: topic.id,
            unitId: unit.id,
            subjectId: s.id,
            subjectName: s.name,
            subjectShort: subj.short,
            color: s.color,
            unitTitle: u.title,
            unitN: u.n,
            topicTitle: t.title,
            title: st,
            index: i,
            count: subs.length,
            size: topic.size,
            estMin: t.estMin ? Math.max(10, Math.round((t.estMin * weights[i]) / totalW)) : est,
            marks: s.marks,
          };
          items.push(item);
          topic.itemIds.push(item.id);
          unit.itemIds.push(item.id);
        });
        topics.push(topic);
        unit.topics.push(topic);
      }
      units.push(unit);
      subj.units.push(unit);
    }
    subjects.push(subj);
  }

  return { items, topics, units, subjects, byId: new Map(items.map((i) => [i.id, i])) };
}

/* ------------------------------------------------------------------ */
/* Estimation                                                          */
/* ------------------------------------------------------------------ */

export function estMinutesFor(state, item) {
  const rec = getItem(state, item.id);
  if (rec.estMinOverride) return rec.estMinOverride;
  if (!Number.isFinite(item.estMin) || item.estMin <= 0) return DEFAULT_ITEM_MINUTES;
  return item.estMin;
}

/** Difficulty 1..5 blended from the syllabus weight and the user's own rating. */
export function difficultyOf(state, item) {
  const rec = getItem(state, item.id);
  if (rec.difficulty) return rec.difficulty;
  return item.size;
}

/* ------------------------------------------------------------------ */
/* Coverage                                                            */
/* ------------------------------------------------------------------ */

export function coverage(state, index) {
  const counts = {
    total: index.items.length,
    completed: 0,
    studying: 0,
    needs_revision: 0,
    not_started: 0,
    weak: 0,
    mastered: 0,
    strong: 0,
    contentDone: 0,
    covered: 0,
    minutesRemaining: 0,
    minutesTotal: 0,
  };
  for (const item of index.items) {
    const r = getItem(state, item.id);
    counts[r.status] = (counts[r.status] || 0) + 1;
    if (COVERED.has(r.status)) counts.covered++;
    if (r.progressPct >= 100) counts.contentDone++;
    if (RESOLVED.has(r.status)) counts.completed++;
    const est = estMinutesFor(state, item);
    counts.minutesTotal += est;
    if (!RESOLVED.has(r.status)) {
      counts.minutesRemaining += Math.max(0, Math.round(est * (1 - r.progressPct / 100)));
    }
  }
  counts.completionPct = counts.total ? Math.round((counts.completed / counts.total) * 100) : 0;
  counts.contentPct = counts.total ? Math.round((counts.contentDone / counts.total) * 100) : 0;
  counts.coveragePct = counts.total ? Math.round((counts.covered / counts.total) * 100) : 0;
  return counts;
}

export function subjectCoverage(state, index) {
  return index.subjects.map((s) => {
    const ids = s.units.flatMap((u) => u.itemIds);
    let completed = 0;
    let covered = 0;
    let weak = 0;
    let studying = 0;
    let rem = 0;
    let tot = 0;
    for (const id of ids) {
      const r = getItem(state, id);
      const it = index.byId.get(id);
      const est = estMinutesFor(state, it);
      tot += est;
      if (RESOLVED.has(r.status)) { completed++; rem += 0; }
      else rem += Math.max(0, Math.round(est * (1 - r.progressPct / 100)));
      if (COVERED.has(r.status)) covered++;
      if (r.status === STATUS.WEAK || r.status === STATUS.NEEDS_REVISION) weak++;
      if (r.status === STATUS.STUDYING) studying++;
    }
    return {
      ...s,
      total: ids.length,
      completed,
      covered,
      weak,
      studying,
      minutesTotal: tot,
      minutesRemaining: rem,
      pct: ids.length ? Math.round((completed / ids.length) * 100) : 0,
    };
  });
}

/** Syllabus fully "learned" once nothing is not_started / studying remains. */
export function syllabusLearned(state, index) {
  return index.items.every((it) => {
    const r = getItem(state, it.id);
    return COVERED.has(r.status);
  });
}

/* ------------------------------------------------------------------ */
/* Chapter (unit) completion intelligence                              */
/* ------------------------------------------------------------------ */

/**
 * Chapter (unit) statistics.
 *
 * IMPORTANT distinction, deliberately kept separate:
 *   done     -> content finished (progressPct 100). This is what UNLOCKS the
 *               next chapter, because the student's next move is a sequencing
 *               decision, not a judgement about their own competence.
 *   resolved -> status Strong/Mastered, i.e. backed by MCQ and revision
 *               evidence. This only shrinks the remaining workload and
 *               stretches revision intervals.
 */
export function unitStats(state, index, unit) {
  let done = 0;
  let resolved = 0;
  let covered = 0;
  let weightedProgress = 0;
  let weight = 0;
  let remMin = 0;
  let started = null;
  let lastStudied = null;
  let weak = 0;
  for (const id of unit.itemIds) {
    const it = index.byId.get(id);
    const r = getItem(state, id);
    const est = estMinutesFor(state, it);
    weight += est;
    if (r.progressPct > 0) {
      weightedProgress += est * r.progressPct;
      if (!started) started = r.firstSeenAt ? r.firstSeenAt.slice(0, 10) : null;
    }
    if (r.progressPct >= 100) done++;
    if (RESOLVED.has(r.status)) resolved++;
    if (COVERED.has(r.status)) covered++;
    if (r.status === STATUS.WEAK || r.status === STATUS.NEEDS_REVISION) weak++;
    if (!RESOLVED.has(r.status)) remMin += Math.max(0, Math.round(est * (1 - r.progressPct / 100)));
    if (r.lastStudied && (!lastStudied || r.lastStudied > lastStudied)) lastStudied = r.lastStudied;
  }
  const progress = weight ? Math.round(weightedProgress / weight) : 0;
  return {
    unit,
    total: unit.itemIds.length,
    done,
    resolved,
    covered,
    weak,
    progress,
    remainingMin: remMin,
    started: started || lastStudied,
    lastStudied,
    complete: done === unit.itemIds.length,
  };
}

export function allUnitStats(state, index) {
  return index.units.map((u) => unitStats(state, index, u));
}

/** Next unit the planner expects to touch (first with unfinished content). */
export function nextUnit(state, index, subjectId = null) {
  for (const u of index.units) {
    if (subjectId && u.subjectId !== subjectId) continue;
    const s = unitStats(state, index, u);
    if (!s.complete) return s;
  }
  return null;
}
