/**
 * Syllabus completeness validator.
 * ===========================================================================
 * "Check syllabus completeness" must be able to DETECT an accidentally omitted
 * chapter or topic. Because we cannot diff against the live official document
 * from inside a static app, this validator works in three layers:
 *
 *   LAYER 1 — STRUCTURAL INTEGRITY (always runs, offline, deterministic)
 *     Detects: duplicate ids, empty units, empty subjects, missing subtopics,
 *     zero/NaN estimates, subjects with no units, mark totals that disagree
 *     with the declared total, orphaned topic references, and any syllabus item
 *     in the user's data that no longer exists in the database.
 *
 *   LAYER 2 — COVERAGE AUDIT (always runs)
 *     Reports the declared count per subject/unit and the count of items that
 *     exist, so a human can eyeball a sudden drop after a syllabus update.
 *     It also flags the "silent trim" risk: subjects whose item count fell
 *     since the last saved run.
 *
 *   LAYER 3 — EXTERNAL BASELINE (optional, user-supplied)
 *     The user can paste a text listing of the official syllabus. Every
 *     numbered heading and every non-empty line is normalised and matched
 *     against the database. Anything not found is reported as MISSING. This is
 *     how you prove nothing was dropped when the official notice changes.
 */

import { SUBJECTS, SYLLABUS_META, SYLLABUS_VERSION, allSubjectGroups } from '../../data/syllabus.js';
import { buildIndex } from './model.js';
import { QUESTION_BANK, buildQuestionIndex } from '../../data/questions.js';

function normaliseText(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function runValidation(state, opts = {}) {
  const groups = allSubjectGroups(state?.settings?.includeBArch || false);
  const index = opts.index || buildIndex(groups);
  const errors = [];
  const warnings = [];
  const info = [];

  /* ---------------- LAYER 1: structural integrity ---------------- */

  // 1a. Unique ids across every level.
  const seen = new Map();
  const dupes = [];
  for (const item of index.items) {
    if (seen.has(item.id)) dupes.push(item.id);
    seen.set(item.id, item);
  }
  for (const t of index.topics) {
    if (seen.has(t.id)) dupes.push(t.id);
    seen.set(t.id, t);
  }
  for (const u of index.units) {
    if (seen.has(u.id)) dupes.push(u.id);
    seen.set(u.id, u);
  }
  if (dupes.length) errors.push(`Duplicate identifiers found: ${[...new Set(dupes)].join(', ')}`);

  // 1b. Empty containers — the classic way a chapter silently disappears.
  for (const s of index.subjects) {
    if (!s.units.length) errors.push(`Subject "${s.name}" has no units.`);
    for (const u of s.units) {
      if (!u.topics.length) errors.push(`${s.name} → Unit ${u.n} "${u.title}" has no topics.`);
      if (!u.itemIds.length) errors.push(`${s.name} → Unit ${u.n} "${u.title}" has no study items.`);
      for (const t of u.topics) {
        if (!t.itemIds.length) errors.push(`${s.name} → "${t.title}" produced no subtopics.`);
      }
    }
  }

  // 1c. Estimates must be usable (edge case 14).
  let missingEst = 0;
  for (const item of index.items) {
    if (!Number.isFinite(item.estMin) || item.estMin <= 0) missingEst++;
  }
  if (missingEst) warnings.push(`${missingEst} study item(s) have no usable time estimate (they will use the ${45}-minute default).`);

  // 1d. Mark total. The 140 baseline covers the four verified B.E. subjects, so
  // the sum is checked against SUBJECTS only - B.Arch content sits outside it.
  const markSum = SUBJECTS.reduce((a, s) => a + (s.marks || 0), 0);
  if (markSum !== SYLLABUS_META.totalMarks) {
    errors.push(`Subject marks sum to ${markSum} but the syllabus metadata declares ${SYLLABUS_META.totalMarks}.`);
  }
  for (const s of groups) {
    if (s.marks == null) {
      warnings.push(`"${s.name}" has no verified mark allocation. The paper does carry marks for it, but the split could not be confirmed against a citable source, so it is not used in any projection. Planning weight falls back to neutral (1.0).`);
    } else if (!s.marks) {
      warnings.push(`Subject "${s.name}" has no mark allocation.`);
    }
  }

  // 1e. Every subject needs a unit numbering 1..N with no gaps.
  for (const s of index.subjects) {
    const nums = s.units.map((u) => u.n).sort((a, b) => a - b);
    for (let i = 0; i < nums.length; i++) {
      if (nums[i] !== i + 1) {
        errors.push(`${s.name}: unit numbering has a gap or duplicate (${nums.join(', ')}).`);
        break;
      }
    }
  }

  // 1f. Titles must be non-empty and not placeholder-ish.
  for (const item of index.items) {
    if (!item.title || item.title.length < 3) errors.push(`Item ${item.id} has an empty title.`);
    if (/^untitled/i.test(item.title)) errors.push(`Item ${item.id} fell back to "Untitled topic" — the source text may be empty.`);
  }

  /* ---------------- LAYER 2: coverage audit ---------------- */

  const bySubject = index.subjects.map((s) => {
    const units = s.units.map((u) => ({
      n: u.n,
      title: u.title,
      topics: u.topics.length,
      items: u.itemIds.length,
    }));
    return {
      id: s.id,
      name: s.name,
      marks: s.marks,
      units: units.length,
      topics: s.units.reduce((a, u) => a + u.topics.length, 0),
      items: s.units.reduce((a, u) => a + u.itemIds.length, 0),
      unitDetail: units,
    };
  });

  const totals = {
    subjects: bySubject.length,
    units: bySubject.reduce((a, s) => a + s.units, 0),
    topics: bySubject.reduce((a, s) => a + s.topics, 0),
    items: index.items.length,
  };

  // Silent-trim detection against the last recorded snapshot.
  const prev = state?.meta?.validationSnapshot;
  if (prev) {
    for (const s of bySubject) {
      const before = prev.bySubject?.find((x) => x.id === s.id);
      if (!before) continue;
      if (s.items < before.items) {
        errors.push(
          `${s.name}: ${before.items - s.items} study item(s) DISAPPEARED since the last check (${prev.version} → ${SYLLABUS_VERSION}).`,
        );
      } else if (s.items > before.items) {
        info.push(`${s.name}: +${s.items - before.items} study item(s) added since the last check.`);
      }
    }
  }
  if (state) {
    state.meta.validationSnapshot = { at: new Date().toISOString(), version: SYLLABUS_VERSION, bySubject };
  }

  // 1g. User data referencing items that no longer exist.
  if (state) {
    const valid = new Set(index.items.map((i) => i.id));
    const orphans = Object.keys(state.items || {}).filter((id) => !valid.has(id));
    if (orphans.length) {
      warnings.push(`${orphans.length} saved progress record(s) refer to syllabus items that no longer exist and were dropped: ${orphans.slice(0, 5).join(', ')}${orphans.length > 5 ? '…' : ''}`);
    }
  }

  // 1h. Question bank mapping.
  const qIdx = buildQuestionIndex(index);
  const unmapped = QUESTION_BANK.filter((q) => !q.itemId || !index.byId.has(q.itemId));
  const qDupe = new Set();
  const qDupes = [];
  for (const q of QUESTION_BANK) {
    if (qDupe.has(q.id)) qDupes.push(q.id);
    qDupe.add(q.id);
  }
  if (qDupes.length) errors.push(`Question bank has duplicate ids: ${qDupes.join(', ')}`);
  if (unmapped.length) {
    warnings.push(`${unmapped.length} question(s) could not be mapped to a syllabus item and will not appear in practice: ${unmapped.map((q) => q.id).join(', ')}`);
  }
  for (const q of QUESTION_BANK) {
    if (typeof q.answer !== 'number' || q.answer < 0 || q.answer >= (q.options?.length || 0)) {
      errors.push(`Question ${q.id} has an invalid answer index.`);
    }
    if (!q.solve || !q.solve.correct || !q.solve.concept) {
      warnings.push(`Question ${q.id} has an incomplete solution explanation.`);
    }
  }
  const answeredUnits = new Set(Array.from(qIdx.byItem.keys()).map((id) => index.byId.get(id)?.unitId));
  const unitsWithoutQuestions = index.units.filter((u) => !answeredUnits.has(u.id));
  if (unitsWithoutQuestions.length) {
    info.push(
      `${unitsWithoutQuestions.length} unit(s) have no MCQs yet (Practice and Mistake Bank will be thin there): ${unitsWithoutQuestions.slice(0, 4).map((u) => u.title).join('; ')}${unitsWithoutQuestions.length > 4 ? '…' : ''}`,
    );
  }

  /* ---------------- LAYER 3: external baseline ---------------- */

  let baseline = null;
  if (opts.baselineText && opts.baselineText.trim().length > 20) {
    baseline = diffAgainstBaseline(index, opts.baselineText);
    for (const m of baseline.missing) errors.push(`Not found in the database: "${m}"`);
    for (const extra of baseline.extra) warnings.push(`In the database but not in the pasted baseline: "${extra}"`);
  }

  return {
    at: new Date().toISOString(),
    version: SYLLABUS_VERSION,
    meta: SYLLABUS_META,
    ok: errors.length === 0,
    errors,
    warnings,
    info,
    totals,
    bySubject,
    baseline,
    questionBank: { total: QUESTION_BANK.length, mapped: QUESTION_BANK.length - unmapped.length, unmapped: unmapped.map((q) => q.id) },
  };
}

/**
 * Match a pasted official syllabus against the database.
 * Heuristics: any line is treated as a candidate label. A line matches if a
 * database title (unit, topic or subtopic) contains it, or it contains one.
 * This is deliberately generous in matching and strict in reporting, so it
 * produces false "missing" reports for numbering noise like "1." or "2.1" —
 * those are filtered out below.
 */
export function diffAgainstBaseline(index, text) {
  const dbLabels = [];
  for (const u of index.units) {
    dbLabels.push(u.title);
    dbLabels.push(`${u.n}. ${u.title}`);
  }
  for (const t of index.topics) dbLabels.push(t.title);
  for (const i of index.items) dbLabels.push(i.title);

  const dbNorm = dbLabels.map((s) => ({ raw: s, n: normaliseText(s) })).filter((x) => x.n.length > 6);

  const lines = String(text)
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*[\u2022\-\*]\s*/, '').replace(/^\s*[\d.]+\s*/, '').trim())
    .filter((l) => l.length > 6);

  const missing = [];
  const matched = new Set();
  for (const line of lines) {
    const n = normaliseText(line);
    if (n.length < 6) continue;
    // Ignore pure headings with no content (e.g. "Mathematics Full Marks: 50")
    if (/^(full marks?|total|subject)\b/.test(n)) continue;
    const hit = dbNorm.find((d) => d.n === n || d.n.includes(n) || n.includes(d.n));
    if (hit) matched.add(hit.raw);
    else missing.push(line.length > 90 ? `${line.slice(0, 90)}…` : line);
  }

  // Anything in the DB the user never pasted — usually means the baseline was
  // partial. Reported as a warning, not an error.
  const extra = dbNorm.filter((d) => d.n.length > 25 && !matched.has(d.raw))
    .map((d) => (d.raw.length > 70 ? `${d.raw.slice(0, 70)}…` : d.raw))
    .slice(0, 12);

  return {
    linesChecked: lines.length,
    matchedCount: matched.size,
    missing: missing.slice(0, 40),
    missingCount: missing.length,
    extra,
  };
}
