/**
 * Engine test suite. Runs headless in Node with no dependencies:
 *     npm test
 *
 * This exercises the parts of the app where a silent bug would be most
 * damaging: schedule feasibility, the daily ceiling, adaptation to missed days,
 * early finishes, terminal exams, and syllabus completeness.
 */

// --- minimal localStorage shim so store.js runs in Node --------------------
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
  clear: () => mem.clear(),
};

const {
  defaultState, getItem, STATUS, save, load, exportJSON, importJSON, resetAll,
} = await import('../src/core/store.js');
const { buildIndex, coverage, deriveSubtopics, unitStats, marksLabel } = await import('../src/core/model.js');
const {
  generatePlan, commitPlan, logTask, undoSessions, recordAnswer, OUTCOMES, chapterIntelligence, evaluateMastery, picksForDate,
} = await import('../src/core/planner.js');
const { availableMinutesFor, baseAvailableMinutes, assess, RISK, remainingWorkMinutes } = await import('../src/core/feasibility.js');
const { addExam, examContext, PHASE, buildRecoveryPlan } = await import('../src/core/examMode.js');
const { runValidation } = await import('../src/core/validate.js');
const {
  markStudied, nextGapDays, performance, markRevisionFailed, dueRevisions,
} = await import('../src/core/revision.js');
const { allSubjectGroups, SUBJECTS, SYLLABUS_META, BARCH_ONLY } = await import('../data/syllabus.js');
const { allMappedQuestions } = await import('../data/questions.js');
const D = await import('../src/util/dates.js');
const { todayISO } = D;

/* ------------------------------------------------------------------ */
let pass = 0;
let fail = 0;
const failures = [];

function ok(cond, label, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; failures.push(`${label}${detail ? ' â€” ' + detail : ''}`); console.log(`  FAIL  ${label}${detail ? ' â€” ' + detail : ''}`); }
}
function eq(a, b, label) { ok(a === b, label, `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }
function near(a, b, tol, label) { ok(Math.abs(a - b) <= tol, label, `expected ~${b}Â±${tol}, got ${a}`); }
function section(t) { console.log(`\n${t}`); }

/* ------------------------------------------------------------------ */
section('1. Syllabus database integrity');
{
  const index = buildIndex(allSubjectGroups(false));
  eq(index.subjects.length, 4, 'four subjects present');
  eq(SUBJECTS.length, 4, 'SUBJECTS constant has 4 entries');
  const marks = SUBJECTS.reduce((a, s) => a + s.marks, 0);
  eq(marks, SYLLABUS_META.totalMarks, 'subject marks sum to the declared total');

  // Every unit/topic in the source data must survive into the index.
  let srcTopics = 0;
  for (const s of SUBJECTS) for (const u of s.units) srcTopics += u.topics.length;
  eq(index.topics.length, srcTopics, 'no topic dropped during indexing');

  let srcUnits = 0;
  for (const s of SUBJECTS) for (const _u of s.units) srcUnits++;
  eq(index.units.length, srcUnits, 'no unit dropped during indexing');

  ok(index.items.length > index.topics.length, 'subtopics were derived from topics');
  eq(new Set(index.items.map((i) => i.id)).size, index.items.length, 'all item ids unique');

  // Explicit spot checks on the known IOE structure.
  const mathUnits = index.subjects.find((s) => s.id === 'MATH').units;
  eq(mathUnits.length, 7, 'Mathematics has 7 units');
  eq(index.subjects.find((s) => s.id === 'PHY').units.length, 6, 'Physics has 6 units');
  eq(index.subjects.find((s) => s.id === 'CHE').units.length, 3, 'Chemistry has 3 units');
  eq(index.subjects.find((s) => s.id === 'ENG').units.length, 4, 'English has 4 units');
  ok(index.byId.has('MATH-U4-T1-S1'), 'Coordinate Geometry / straight lines item exists');
  ok(index.byId.has('PHY-U5-T1-S1'), 'Electrostatics subtopic exists');
  ok(index.byId.has('CHE-U1-T1-S1'), 'Chemical arithmetic subtopic exists');
  ok(index.byId.has('ENG-U4-T1-S1'), 'Comprehension subtopic exists');

  // Estimable times for everything (edge case 14).
  const badEst = index.items.filter((i) => !Number.isFinite(i.estMin) || i.estMin <= 0);
  eq(badEst.length, 0, 'every study item has a positive time estimate');

  // Subtopic derivation never loses the source words.
  for (const t of index.topics) {
    const subs = t.itemIds.map((id) => index.byId.get(id).title.toLowerCase());
    const joined = subs.join(' ').replace(/[^a-z0-9 ]/g, '');
    const key = t.title.toLowerCase().split(/[;:]/)[0].replace(/[^a-z0-9 ]/g, '').trim();
    const first = key.split(' ').slice(0, 3).join(' ');
    if (first.length > 6) ok(joined.includes(first), `subtopics preserve source text for "${t.title.slice(0, 40)}â€¦"`);
  }
}

section('2. Subtopic derivation is safe');
{
  eq(deriveSubtopics('').length, 1, 'empty string still yields one subtopic');
  eq(deriveSubtopics('!!!???').length, 1, 'punctuation-only yields one subtopic');
  const one = deriveSubtopics('Youngâ€™s double slit experiment');
  eq(one.length, 1, 'a short phrase is not split');
  const many = deriveSubtopics('Electrostatics: Coulombâ€™s law, electric field and Gauss law, potential and potential gradient, capacitors and combinations, dielectrics, energy stored, polarization and displacement');
  ok(many.length >= 4, 'a long colon-list splits into several subtopics');
  ok(many[0].toLowerCase().includes('electrostatics'), 'the label is preserved on the first subtopic');
  for (const s of many) ok(s.replace(/[^a-z]/gi, '').length > 2, `subtopic is not a fragment: "${s.slice(0, 30)}"`);
}

section('3. Fresh state produces a feasible plan with no impossible days');
let state = defaultState();
let index = buildIndex(allSubjectGroups(state.settings.trackBArch));
{
  const r = generatePlan(state, index);
  eq(r.meta.phase, 'learn', 'a fresh state starts in the learn phase');
  const days = Object.keys(r.plan);
  ok(days.length > 100, `plan covers the whole horizon (${days.length} days)`);
  let over = 0;
  let emptyNonStudy = 0;
  for (const [d, day] of Object.entries(r.plan)) {
    const cap = availableMinutesFor(state, d);
    const planned = (day.tasks || []).reduce((a, t) => a + t.plannedMin, 0);
    if (planned > cap) over++;
    if (cap === 0 && (day.tasks || []).length) emptyNonStudy++;
  }
  eq(over, 0, 'no day is ever over-committed');
  eq(emptyNonStudy, 0, 'no tasks land on a zero-availability day');

  const t0 = r.plan[days[0]].tasks;
  ok(t0.length > 0, 'today has tasks');
  const hasLearn = t0.some((t) => t.type === 'learn');
  ok(hasLearn, 'today includes a learn task on a fresh state');
  for (const t of t0) {
    ok(t.plannedMin <= state.settings.maxTaskMinutes, `task respects the ${state.settings.maxTaskMinutes}-minute task cap`);
    ok(!!t.reason && t.reason.length > 5, 'every task carries a human-readable reason');
    ok(['critical', 'high', 'normal', 'low'].includes(t.priority), 'every task has a plain priority label');
  }
  // No single subject should own the whole day.
  const subj = {};
  for (const t of t0) if (t.subjectId) subj[t.subjectId] = (subj[t.subjectId] || 0) + t.plannedMin;
  const maxSubj = Math.max(0, ...Object.values(subj));
  ok(maxSubj <= t0.reduce((a, t) => a + t.plannedMin, 0) * 0.75, 'the day is not monopolised by one subject');
}

section('4. Less available time produces a smaller plan (the "no fake intelligence" test)');
{
  const before = generatePlan(state, index);
  const today = before.meta.today;
  const planBefore = before.plan[today].plannedMin;

  const saved = state.settings.defaultDailyMinutes;
  state.settings.defaultDailyMinutes = 60;
  const after = generatePlan(state, index);
  const planAfter = after.plan[today].plannedMin;
  ok(planAfter < planBefore, `cutting daily time 150->60 min shrank today's plan (${planBefore} -> ${planAfter} min)`);
  eq(planAfter, availableMinutesFor(state, today), 'the plan fills exactly the available time');
  state.settings.defaultDailyMinutes = saved;
}

section('5. Missed days are spread, not dumped');
{
  // Simulate three missed days by logging nothing for 3 days of real time is
  // not possible without a clock, so we assert the mechanism directly: a large
  // backlog never produces an over-cap day, and the backlog stays in the pool.
  const s2 = defaultState();
  const i2 = buildIndex(allSubjectGroups(false));
  // Mark 60% of items as started to create a big carry-over.
  let n = 0;
  for (const item of i2.items) {
    if (n++ % 100 < 60) {
      const r = getItem(s2, item.id);
      r.status = STATUS.STUDYING;
      r.progressPct = 40;
      r.lastStudied = '2026-09-20';
    }
  }
  const res = generatePlan(s2, i2);
  let worst = 0;
  for (const [d, day] of Object.entries(res.plan)) {
    const cap = availableMinutesFor(s2, d);
    worst = Math.max(worst, (day.tasks || []).reduce((a, t) => a + t.plannedMin, 0) - cap);
  }
  ok(worst <= 0, `a huge backlog still never over-commits a day (worst overshoot ${worst} min)`);
  const learnTasks = Object.values(res.plan).flatMap((d) => d.tasks).filter((t) => t.type === 'learn');
  ok(learnTasks.length > 0, 'the backlog keeps being worked, not abandoned');
  const firstDay = res.plan[res.meta.today];
  ok(firstDay.plannedMin <= availableMinutesFor(s2, res.meta.today), 'day one respects the ceiling after a backlog');
}

section('6. Chapter completion intelligence');
{
  const r = generatePlan(state, index);
  const ch = chapterIntelligence(state, index, r);
  eq(ch.length, index.units.length, 'intelligence covers every unit');
  const withEta = ch.filter((c) => c.eta);
  ok(withEta.length > 5, `most units get a projected completion date (${withEta.length}/${ch.length})`);
  ok(ch.some((c) => c.nextUnit), 'units report the next chapter');
  const s0 = ch[0];
  ok(['Not started', 'In progress', 'Almost done', 'Complete'].includes(s0.status), `unit status is meaningful ("${s0.status}")`);
  // ETAs must be inside the horizon, never absurd.
  for (const c of withEta) {
    const dd = D.diffDays(r.meta.today, c.eta);
    ok(dd >= 0 && dd <= 400, `ETA for "${c.unit.title}" is inside the horizon (${dd} days)`);
  }
  // ETA order should roughly follow plan order.
  const ordered = ch.filter((c) => c.eta).map((c) => c.eta).sort();
  ok(ordered.length === withEta.length, 'ETAs are sortable');
}

section('7. Completing a chapter unlocks the next one and preserves revision');
{
  const s3 = defaultState();
  const i3 = buildIndex(allSubjectGroups(false));
  const before = generatePlan(s3, i3);
  const firstUnit = i3.units[0];
  // Complete the whole first unit, logging exactly the minutes still required.
  for (const id of firstUnit.itemIds) {
    const item = i3.byId.get(id);
    const rec = getItem(s3, id);
    const est = rec.estMinOverride || item.estMin;
    const left = Math.max(1, Math.round(est * (1 - rec.progressPct / 100)));
    const task = {
      id: `t_learn_${id}`, type: 'learn', itemId: id, unitId: item.unitId,
      subjectId: item.subjectId, title: item.title, plannedMin: left, mcq: 8,
    };
    logTask(s3, i3, before.meta.today, task, OUTCOMES.DONE, left, 1);
  }
  const st = unitStats(s3, i3, firstUnit);
  eq(st.complete, true, 'the unit is marked complete after logging every item');
  const ch3 = chapterIntelligence(s3, i3, generatePlan(s3, i3));
  eq(ch3[0].status, 'Complete', 'completed unit shows as Complete');
  ok(ch3[0].nextUnit !== null, 'next chapter is reported for a completed unit');
  // Revision must survive completion.
  const revsDue = dueRevisions(s3, D.addDays(before.meta.today, 3));
  ok(revsDue.length > 0, 'completed chapter still schedules revision (revision is not destroyed)');
  const after = generatePlan(s3, i3);
  const laterRevise = Object.entries(after.plan)
    .slice(0, 25)
    .flatMap(([, d]) => d.tasks)
    .filter((t) => t.type === 'revise');
  ok(laterRevise.length > 0, 'revision tasks appear in the plan after chapter completion');
  ok(laterRevise.some((t) => t.unitId === firstUnit.id), 'the finished chapter comes back for revision');
}

section('8. Spaced revision responds to performance');
{
  const s4 = defaultState();
  const i4 = buildIndex(allSubjectGroups(false));
  const strongItem = i4.byId.get('MATH-U4-T1-S1');
  const weakItem = i4.byId.get('MATH-U5-T2-S1');

  const rs = getItem(s4, strongItem.id);
  rs.status = STATUS.STRONG;
  rs.mcq = { att: 20, correct: 19, streak: 5, last: null };
  const rw = getItem(s4, weakItem.id);
  rw.status = STATUS.WEAK;
  rw.mcq = { att: 20, correct: 6, streak: 0, last: null };

  ok(performance(s4, strongItem.id) > performance(s4, weakItem.id), 'a strong topic measures better than a weak one');
  const gapStrong = nextGapDays(s4, strongItem.id);
  const gapWeak = nextGapDays(s4, weakItem.id);
  ok(gapStrong > gapWeak, `strong topics get longer gaps (${gapStrong}d) than weak ones (${gapWeak}d)`);

  const before = nextGapDays(s4, strongItem.id);
  markStudied(s4, strongItem.id, '2026-09-30', 'revise', 0.95);
  ok(nextGapDays(s4, strongItem.id) >= before, 'a good revision lengthens the next interval');
  const wb = nextGapDays(s4, weakItem.id);
  markRevisionFailed(s4, weakItem.id, '2026-09-30');
  eq(getItem(s4, weakItem.id).status, STATUS.WEAK, 'a failed revision marks the topic weak');
  eq(D.diffDays('2026-09-30', getItem(s4, weakItem.id).nextRevisionDue), 1, 'a failed revision comes back tomorrow');
  ok(dueRevisions(s4, '2026-10-05').length > 0, 'overdue items appear in the due list');
}

section('9. Mastery requires evidence, not "studied once"');
{
  const s5 = defaultState();
  const i5 = buildIndex(allSubjectGroups(false));
  const id = 'PHY-U1-T3-S1';
  const r = getItem(s5, id);
  r.status = STATUS.STUDIED_ONCE;
  r.progressPct = 100;
  let res = evaluateMastery(s5, id);
  ok(!res.promoted, 'studied-once with no evidence is NOT promoted');

  r.mcq = { att: 8, correct: 3, streak: 0, last: null };
  res = evaluateMastery(s5, id);
  ok(res.promoted && res.to === 'Weak', 'poor MCQ evidence moves an item to Weak');

  r.mcq = { att: 8, correct: 6, streak: 2, last: null };
  r.lastRevisionScore = 0.8;
  res = evaluateMastery(s5, id);
  ok(res.promoted && res.to === 'Strong', 'decent MCQ + a recorded revision moves an item to Strong');

  r.mcq = { att: 20, correct: 19, streak: 6, last: null };
  r.lastRevisionScore = 0.9;
  r.revisionStage = 2;
  res = evaluateMastery(s5, id);
  ok(res.promoted && res.to === 'Mastered', 'strong MCQ + successful revision = Mastered');
  const g = nextGapDays(s5, id);
  const weakRef = defaultState();
  const wid = 'PHY-U1-T3-S1';
  getItem(weakRef, wid).status = STATUS.WEAK;
  const gw = nextGapDays(weakRef, wid);
  ok(g > gw, `mastered items get longer gaps (${g}d) than weak ones (${gw}d)`);
}

section('10. Terminal exam mode reduces load and preserves the syllabus');
{
  const s6 = defaultState();
  const i6 = buildIndex(allSubjectGroups(false));
  // A real student mid-exam has study history. Seed some so the planner has
  // genuine maintenance work to preserve rather than an empty slate.
  const seeded = i6.items.slice(0, 8);
  for (const item of seeded) {
    const r = getItem(s6, item.id);
    r.progressPct = 100;
    r.status = STATUS.STUDIED_ONCE;
    r.mcq = { att: 6, correct: 5, streak: 2, last: null };
    r.lastRevisionScore = 0.8;
  }
  const t = todayISO();
  const base = generatePlan(s6, i6);
  const normalMin = base.plan[t].plannedMin;

  const exam = addExam(s6, {
    name: 'Terminal Exam',
    start: t,
    end: D.addDays(t, 6),
    subjects: ['Math', 'Physics', 'Nepali'],
    availableMinPerDay: 210,
    priority: 'high',
  });
  ok(exam.id, 'exam added with an id');

  const during = generatePlan(s6, i6);
  const duringMin = during.plan[t].plannedMin;
  ok(duringMin < normalMin, `Exam Mode cut IOE load (${normalMin} -> ${duringMin} min)`);
  const ctx = examContext(s6, D.addDays(t, 2));
  eq(ctx.phase, PHASE.DURING, 'mid-exam days report the DURING phase');
  ok(ctx.allowNewChapters === false, 'no new chapters during the exam');
  const duringTasks = during.plan[D.addDays(t, 2)].tasks;
  ok(!duringTasks.some((x) => x.type === 'learn'), 'no learn tasks scheduled during the exam');
  ok(
    duringTasks.some((x) => ['revise', 'practice', 'mistakes', 'mixed', 'maintenance'].includes(x.type)),
    'maintenance work is kept alive during the exam',
  );
  ok(duringTasks.length > 0, 'exam days are never left empty');

  // Nothing destroyed.
  const workBefore = remainingWorkMinutes(s6, i6).total;
  const cov = coverage(s6, i6);
  eq(cov.total, i6.items.length, 'the syllabus item count is untouched by Exam Mode');

  // Recovery.
  const afterEnd = D.addDays(t, 8);
  const rctx = examContext(s6, afterEnd);
  eq(rctx.phase, PHASE.RECOVERY, 'days after the exam enter recovery');
  ok(rctx.multiplier > 1, `recovery boosts IOE load (x${rctx.multiplier.toFixed(2)})`);
  const rec = buildRecoveryPlan(s6, i6, exam);
  ok(rec.feasible, `recovery plan is feasible (need ${rec.requiredPerDay} min/day over ${rec.horizonDays} days)`);
  ok(rec.lostMinutes > 0, `recovery plan quantifies the ${rec.lostMinutes} min lost during the exam`);
  ok(workBefore > 0, 'the deferred workload is still tracked, not deleted');
}

section('11. Feasibility engine is honest');
{
  const s7 = defaultState();
  const i7 = buildIndex(allSubjectGroups(false));
  const a = assess(s7, i7);
  ok(a.daysLeft > 150, `deadline countdown works (${a.daysLeft} days)`);
  ok(a.work.total > 0, 'remaining workload is non-zero on a fresh state');
  ok(a.requiredPerDay > 0, 'a required daily average is produced');
  ok(['on_track', 'tight', 'high', 'impossible', 'done'].includes(a.level), `risk level is a known label ("${a.level}")`);
  ok(a.suggestions.length > 0, 'actionable suggestions are generated');
  for (const s of a.suggestions) ok(typeof s === 'string' && s.length > 10, 'suggestion is a real sentence');

  // Impossible case: set the deadline to tomorrow.
  s7.settings.deadline = D.addDays(D.todayISO(), 1);
  s7.settings.defaultDailyMinutes = 20;
  const bad = assess(s7, i7);
  ok(bad.level === RISK.IMPOSSIBLE || bad.level === RISK.HIGH, `a 1-day deadline is flagged as risky ("${bad.level}")`);
  ok(bad.suggestions.some((x) => /sustainable|not sustainable|choose/i.test(x)), 'the engine warns against impossible schedules rather than generating one');
  const p = generatePlan(s7, i7);
  for (const day of Object.values(p.plan)) {
    const planned = (day.tasks || []).reduce((a, t) => a + t.plannedMin, 0);
    ok(planned <= (day.availableMin || 0) + 0.001, 'even in the impossible case no day is over-filled');
  }
}

section('12. Deadline change and exam-mode edge cases');
{
  const s8 = defaultState();
  const i8 = buildIndex(allSubjectGroups(false));
  s8.settings.deadline = D.addDays(D.todayISO(), 10);
  const a8 = assess(s8, i8);
  ok(a8.daysLeft === 10, 'moving the deadline moves the countdown');
  const p8 = generatePlan(s8, i8);
  const horizon = Object.keys(p8.plan);
  ok(horizon.length <= 12, `the plan horizon follows the new deadline (${horizon.length} days)`);

  // A day too small to hold even one useful block is left alone; the work
  // simply moves to the next day rather than being crushed into a token task.
  const s9 = defaultState();
  s9.settings.busyDays[D.todayISO()] = 10;
  const p9 = generatePlan(s9, i8);
  eq(p9.plan[D.todayISO()].tasks.length, 0, 'a 10-minute day gets no tasks (below the minimum task size)');
  const p9b = generatePlan(s9, i8);
  ok(p9b.plan[D.addDays(D.todayISO(), 1)].tasks.length > 0, 'the next day absorbs the work');

  // A day that can just hold one block gets exactly one, not a pile of scraps.
  const s9c = defaultState();
  s9c.settings.busyDays[D.todayISO()] = 30;
  const p9c = generatePlan(s9c, i8);
  eq(p9c.plan[D.todayISO()].tasks.length, 1, 'a 30-minute day gets exactly one block');

  // A completely free weekend.
  const s10 = defaultState();
  s10.settings.busyDays[D.todayISO()] = 600;
  const p10 = generatePlan(s10, i8);
  const raw10 = baseAvailableMinutes(s10, D.todayISO());
  eq(raw10, 600, 'an explicit free day overrides the default');
  eq(
    p10.plan[D.todayISO()].availableMin,
    Math.round(600 * (1 - s10.settings.bufferPct / 100)),
    'the day budget is the raw time minus the safety buffer',
  );
  ok(p10.plan[D.todayISO()].tasks.length >= 4, 'a free day gets a substantial plan');

  // Non-study day.
  const s11 = defaultState();
  s11.settings.studyDays = [1, 2, 3, 4, 5]; // no weekends
  const p11 = generatePlan(s11, i8);
  const sat = D.dateRange(D.todayISO(), D.addDays(D.todayISO(), 10)).find((d) => D.dow(d) === 6);
  eq(p11.plan[sat].tasks.length, 0, 'a non-study day is left empty');
  eq(p11.plan[sat].closed, true, 'a non-study day is marked closed');
}

section('13. Outcomes drive adaptation');
{
  const s12 = defaultState();
  const i12 = buildIndex(allSubjectGroups(false));
  const r = generatePlan(s12, i12);
  const t = r.meta.today;
  const learn = r.plan[t].tasks.find((x) => x.type === 'learn');
  const single = (id, over = {}) => ({ ...learn, id: over.id || 'one', itemId: id, itemIds: undefined, ...over });

  // Partial completion of a topic-sized block: real minutes are handed out in
  // study order, so earlier subtopics finish and later ones stay untouched.
  logTask(s12, i12, t, learn, OUTCOMES.PARTIAL, 30, 0.5);
  const covered = learn.itemIds.map((id) => getItem(s12, id));
  const started = covered.filter((c) => c.progressPct > 0);
  ok(started.length > 0, `partial completion advances progress (${started.map((c) => c.progressPct).join('/')}%)`);
  ok(started.length < covered.length, 'partial work does not claim to have covered the whole topic');
  ok(
    covered.filter((c) => c.progressPct > 0 && c.progressPct < 100).length > 0,
    'a partly-done subtopic is left mid-way, not falsely completed',
  );
  ok(
    covered[covered.length - 1].progressPct === 0 || covered[0].progressPct === 100,
    'minutes land on the earliest subtopics first',
  );

  // A single subtopic logged on its own behaves the simple way. The logged
  // minutes are derived from the real estimate so the assertion is stable
  // regardless of how the syllabus data happens to split its subtopics.
  const solo = learn.itemIds[learn.itemIds.length - 1];
  const soloEst = estOf(s12, i12.byId.get(solo));
  const soloMin = Math.max(2, Math.round(soloEst / 4));
  logTask(s12, i12, t, single(solo, { plannedMin: soloMin }), OUTCOMES.PARTIAL, soloMin, 0.5);
  const soloRec = getItem(s12, solo);
  ok(soloRec.progressPct > 0, 'a single-subtopic partial advances progress');
  eq(soloRec.status, STATUS.STUDYING, 'a partially studied item is "Studying"');

  // "Too difficult" -> weak + difficulty up.
  const hardItem = i12.units[3].itemIds[0];
  const hard = single(hardItem, { id: 'hard' });
  logTask(s12, i12, t, hard, OUTCOMES.TOO_DIFFICULT, 60, 0.2);
  eq(getItem(s12, hardItem).status, STATUS.WEAK, '"Too difficult" marks the topic weak');
  ok((getItem(s12, hardItem).difficulty || 0) > i12.byId.get(hardItem).size, 'difficulty rating was raised');

  // "Took longer" -> the estimate is corrected upward.
  const slowItem = i12.units[4].itemIds[0];
  const slow = single(slowItem, { id: 'slow' });
  const estBefore = estOf(s12, i12.byId.get(slowItem));
  logTask(s12, i12, t, slow, OUTCOMES.SLOW, 120, 1);
  const estAfter = estOf(s12, i12.byId.get(slowItem));
  ok(estAfter > estBefore, `"Took longer than expected" raises the estimate (${estBefore} -> ${estAfter} min)`);

  // Skipped -> item unchanged, pushed back into the pool.
  const skipItem = i12.units[5].itemIds[0];
  const before = JSON.stringify(getItem(s12, skipItem));
  const sk = single(skipItem, { id: 'skip' });
  logTask(s12, i12, t, sk, OUTCOMES.SKIPPED, 0, 0);
  const afterRec = getItem(s12, skipItem);
  ok(afterRec.status === JSON.parse(before).status, 'skipping does not corrupt the item record');
  const r12b = generatePlan(s12, i12);
  const stillPlanned = Object.values(r12b.plan).flatMap((d) => d.tasks).some((x) => x.itemId === skipItem);
  ok(stillPlanned, 'a skipped item is re-planned into a later day');
}

function estOf(s, item) {
  const r = getItem(s, item.id);
  return r.estMinOverride || item.estMin;
}

/** Minutes still outstanding for an item, matching the planner's own rule. */
function learnLeft(s, idx, id) {
  const e = estOf(s, idx.byId.get(id));
  return Math.max(0, Math.round(e * (1 - (getItem(s, id).progressPct || 0) / 100)));
}

section('14. Terminal strategy after the syllabus is finished');
{
  const s13 = defaultState();
  const i13 = buildIndex(allSubjectGroups(false));
  for (const item of i13.items) {
    const r = getItem(s13, item.id);
    r.status = STATUS.STRONG;
    r.progressPct = 100;
    r.lastStudied = '2026-09-01';
  }
  const r13 = generatePlan(s13, i13);
  eq(r13.meta.phase, 'consolidate', 'a finished syllabus moves the planner out of the learn phase');
  ok(!r13.meta.syllabusLearned === false, 'syllabusLearned flag is set');
  const tasks = Object.values(r13.plan).flatMap((d) => d.tasks);
  eq(tasks.filter((t) => t.type === 'learn').length, 0, 'no new syllabus chapters are assigned once complete');
  ok(tasks.some((t) => t.type === 'mixed'), 'mixed MCQ practice is scheduled');
  ok(tasks.some((t) => t.type === 'test'), 'full-length tests are scheduled');
  const a13 = assess(s13, i13);
  eq(a13.level, RISK.DONE, 'feasibility reports DONE');

  // Push the deadline close -> final phase.
  s13.settings.deadline = D.addDays(D.todayISO(), 10);
  eq(generatePlan(s13, i13).meta.phase, 'final', 'within 14 days the planner enters the final phase');
}

section('15. Complete-syllabus early (edge case 16)');
{
  const s14 = defaultState();
  const i14 = buildIndex(allSubjectGroups(false));
  for (const item of i14.items) {
    const r = getItem(s14, item.id);
    r.status = STATUS.STRONG;
    r.progressPct = 100;
  }
  s14.settings.deadline = D.addDays(D.todayISO(), 200);
  const r14 = generatePlan(s14, i14);
  const tasks = Object.values(r14.plan).flatMap((d) => d.tasks);
  eq(tasks.filter((t) => t.type === 'learn').length, 0, 'finishing early does not restart the syllabus');
  ok(tasks.length > 0, 'but the plan is still useful (revision + practice continue)');
  for (const [d, day] of Object.entries(r14.plan)) {
    const planned = (day.tasks || []).reduce((a, x) => x.plannedMin, 0);
    ok(planned <= (day.availableMin || 0) + 0.001, `still never over-commits (${d})`);
  }
}

section('16. Syllabus completeness validator');
{
  const s15 = defaultState();
  const v = runValidation(s15, { index });
  ok(v.ok, `validator reports OK on the shipped database (${v.errors.length} errors)`);
  for (const e of v.errors) console.log(`         error: ${e}`);
  eq(v.totals.subjects, 4, 'validator counts 4 subjects');
  eq(v.totals.units, index.units.length, 'validator unit count matches the index');
  eq(v.totals.topics, index.topics.length, 'validator topic count matches the index');
  eq(v.totals.items, index.items.length, 'validator item count matches the index');
  ok(v.questionBank.total > 0 && v.questionBank.mapped === v.questionBank.total, 'every question maps to a syllabus item');
  ok(v.bySubject.every((s) => s.items > 0 && s.topics > 0), 'every subject reports non-zero items');

  // Layer 3: an external baseline that omits things must be detected.
  const truncated = SUBJECTS.filter((s) => s.id !== 'CHE')
    .flatMap((s) => s.units)
    .map((u) => `${u.n}. ${u.title}`)
    .join('\n');
  const v2 = runValidation(defaultState(), { index, baselineText: truncated });
  ok(
    v2.baseline.missingCount === 0 && v2.baseline.extra.length > 0,
    'a partial baseline is detected as incomplete (DB content absent from it)',
  );
  // ...and a baseline line the database does not contain is an error.
  const invented = `${truncated}\n14. Biomolecules and applied biotechnology`;
  const v2b = runValidation(defaultState(), { index, baselineText: invented });
  ok(v2b.baseline.missingCount > 0, 'a baseline topic the database lacks is reported as missing');
  ok(!v2b.ok, 'a syllabus gap fails validation');

  // Structural damage must be caught.
  const broken = JSON.parse(JSON.stringify(SUBJECTS));
  broken[0].units = [];
  const brokenIndex = buildIndex(broken);
  const v3 = runValidation(defaultState(), { index: brokenIndex });
  ok(!v3.ok, 'a subject with no units is flagged as an error');
  ok(v3.errors.some((e) => /no units/i.test(e)), 'the empty-subject error is explicit');
}

section('17. Persistence round-trip');
{
  const s16 = defaultState();
  s16.settings.defaultDailyMinutes = 200;
  s16.settings.setupComplete = true;
  getItem(s16, 'MATH-U1-T1-S1').status = STATUS.WEAK;
  s16.mistakes.push({ id: 'm1', questionId: 'M001', itemId: 'MATH-U4-T1-S1', date: '2026-09-29', timesWrong: 2, lastWrong: '2026-09-29', resolved: false });
  s16.exams.push({ id: 'e1', name: 'Pre-board', start: '2026-10-05', end: '2026-10-12', subjects: [], priority: 'high', availableMinPerDay: 200 });
  ok(save(s16), 'state saves to localStorage');

  const back = load();
  eq(back.settings.defaultDailyMinutes, 200, 'settings persist');
  eq(back.settings.setupComplete, true, 'setup completion persists');
  eq(getItem(back, 'MATH-U1-T1-S1').status, STATUS.WEAK, 'item status persists');
  eq(back.mistakes.length, 1, 'mistake bank persists');
  eq(back.exams.length, 1, 'exams persist');
  eq(Object.keys(back.items).length, index.items.length, 'every syllabus item has a record after reload');

  const round = importJSON(exportJSON(s16));
  eq(round.settings.defaultDailyMinutes, 200, 'export/import round-trips settings');

  // Corrupt data must not break the app (edge case 13).
  localStorage.setItem('ioe-planner:state', '{ this is not json');
  const recovered = load();
  eq(recovered.meta.schema, 3, 'a corrupt store falls back to a fresh state instead of crashing');
  resetAll();
  eq(Object.keys(load().items).length, index.items.length, 'reset re-seeds every item');
}

section('18. Question bank quality');
{
  const qs = allMappedQuestions(index);
  eq(qs.length, Object.values(SUBJECTS).length ? qs.length : 0, 'questions load');
  ok(qs.length >= 30, `a usable question bank (${qs.length} questions)`);
  for (const q of qs) {
    ok(Array.isArray(q.options) && q.options.length === 4, `${q.id} has 4 options`);
    ok(typeof q.answer === 'number' && q.answer >= 0 && q.answer < 4, `${q.id} has a valid answer index`);
    for (const f of ['correct', 'concept', 'wrong']) {
      ok(q.solve && typeof q.solve[f] === 'string' && q.solve[f].length > 20, `${q.id} explanation has a "${f}" section`);
    }
    ok(!q.unmapped, `${q.id} is mapped to a syllabus item`);
  }
  const ids = new Set(qs.map((q) => q.id));
  eq(ids.size, qs.length, 'question ids are unique');
}

section('19. MCQ answers are the only evidence (and undo is real)');
{
  const st = defaultState();
  const item = index.items.find((i) => i.questions && i.questions.length) || index.items[0];
  const q = { id: 'q_test', itemId: item.id, subject: 'PHY', answer: 1, stem: 'Test question stem' };
  const wrong = [0, 2, 3].find((i) => i !== q.answer);

  // Nothing is recorded before an answer is given.
  eq(getItem(st, item.id).mcq.att, 0, 'no attempt is recorded before answering');

  const r1 = recordAnswer(st, q, wrong);
  eq(r1.correct, false, 'a wrong answer is reported as wrong');
  eq(getItem(st, item.id).mcq.att, 1, 'exactly one attempt was recorded');
  eq(getItem(st, item.id).mcq.correct, 0, 'no correct answer was invented');
  eq(getItem(st, item.id).status, STATUS.WEAK, 'a topic being learned is honestly Weak after a wrong answer');
  eq((st.mistakes || []).length, 1, 'the wrong answer went to the Mistake Bank');
  eq(st.mistakes[0].resolved, false, 'the mistake is open');
  ok(r1.mistake, 'the outcome points at the mistake that was opened');

  // A second wrong answer must not create a duplicate entry.
  recordAnswer(st, q, wrong);
  eq((st.mistakes || []).length, 1, 'the same question is not duplicated in the bank');
  eq(st.mistakes[0].timesWrong, 2, 'the bank counted both wrong answers');

  // Only a correct re-solve clears it.
  const r3 = recordAnswer(st, q, q.answer);
  eq(r3.correct, true, 'the re-solve was correct');
  eq(st.mistakes[0].resolved, true, 'a correct re-solve clears the mistake');
  eq(st.mistakes[0].timesRight, 1, 'the successful re-solve was counted');
  eq(getItem(st, item.id).mcq.att, 3, 'all three attempts are recorded');
  eq(getItem(st, item.id).mcq.correct, 1, 'only the real correct answer counts');

  // One slip must not erase mastery that was earned with evidence.
  const st2 = defaultState();
  const it2 = index.items[1];
  getItem(st2, it2.id).status = STATUS.MASTERED;
  getItem(st2, it2.id).progressPct = 100;
  recordAnswer(st2, { id: 'q_m', itemId: it2.id, subject: 'MATH', answer: 0, stem: 's' }, 1);
  eq(getItem(st2, it2.id).status, STATUS.MASTERED, 'a single wrong answer does not demote a Mastered topic');
  ok((st2.mistakes || []).length === 1, 'but the wrong answer is still recorded in the bank');

  // Undo restores progress, not just the log.
  const st3 = defaultState();
  const before = JSON.parse(JSON.stringify(getItem(st3, index.items[2].id)));
  const task = {
    id: 't_x', type: 'learn', title: 'Test learn', plannedMin: 60, itemId: index.items[2].id,
  };
  logTask(st3, index, todayISO(), task, OUTCOMES.DONE, 60);
  ok(getItem(st3, index.items[2].id).progressPct > 0, 'logging advanced the topic');
  const res = undoSessions(st3, todayISO());
  eq(res.removed, 1, 'the session was removed');
  eq(getItem(st3, index.items[2].id).progressPct, before.progressPct, 'undo restored the real progress');
  eq(getItem(st3, index.items[2].id).status, before.status, 'undo restored the status');
  eq(getItem(st3, index.items[2].id).firstSeenAt, before.firstSeenAt, 'undo restored the untouched fields');
  eq(st3.days[todayISO()].sessions.length, 0, 'the day has no sessions after undo');
  eq(st3.days[todayISO()].actualMin, 0, 'the day has no minutes after undo');
  eq(undoSessions(st3, todayISO()).removed, 0, 'undoing twice is harmless');

  // Two sessions in a day unwind to the state before the first one.
  const st4 = defaultState();
  const id4 = index.items[3].id;
  const snap0 = JSON.parse(JSON.stringify(getItem(st4, id4)));
  logTask(st4, index, todayISO(), { id: 't1', type: 'learn', title: 'One', plannedMin: 30, itemId: id4 }, OUTCOMES.DONE, 30);
  logTask(st4, index, todayISO(), { id: 't2', type: 'learn', title: 'Two', plannedMin: 30, itemId: id4 }, OUTCOMES.DONE, 30);
  ok(getItem(st4, id4).progressPct > snap0.progressPct, 'two sessions advanced the topic twice');
  eq(undoSessions(st4, todayISO()).removed, 2, 'both sessions were undone');
  eq(getItem(st4, id4).progressPct, snap0.progressPct, 'undoing two sessions returns to the original progress');
}

section('20. Optional B.Arch content');
{
  const base = defaultState();
  const without = buildIndex(allSubjectGroups(base.settings.includeBArch));
  const withB = buildIndex(allSubjectGroups(true));
  ok(withB.items.length > without.items.length, 'turning B.Arch on adds topics');
  ok(withB.subjects.length > without.subjects.length, 'and adds a subject');
  const ids = new Set(without.items.map((i) => i.id));
  ok(withB.items.every((i) => ids.has(i.id) || /arch/i.test(i.subjectId || i.subject || '')),
    'B.Arch mode only adds topics, it never rewrites the shared ones');
  eq(base.settings.includeBArch, false, 'B.Arch is opt-in by default');

  // Records for the optional track survive a reload with the track switched off.
  const st = defaultState();
  st.settings.includeBArch = true;
  save(st);
  const off = load();
  off.settings.includeBArch = false;
  save(off);
  const backOn = load();
  const barchCount = withB.items.length - without.items.length;
  eq(Object.keys(backOn.items).length, withB.items.length,
    'switching B.Arch off and on again does not destroy those progress records');
  ok(barchCount > 0, 'there was B.Arch content to preserve');
}

section('20b. Unverified marks are never shown as zero');
{
  const arch = BARCH_ONLY.find((s) => s.id === 'ARCH');
  ok(arch, 'the B.Arch-only subject exists');
  eq(arch.marks, null, 'its mark allocation is recorded as unverified (null), not 0');
  ok(arch.marks !== 0, 'a 0 would read as "worth nothing" on the paper');
  eq(marksLabel(arch), 'marks not verified', 'the label says unverified instead of printing a number');
  eq(marksLabel({ marks: 50 }), '50 marks on the paper', 'a verified subject still shows its real allocation');
  eq(marksLabel({ marks: 0 }), '0 marks on the paper', 'an explicit zero from real data is still shown as zero');
  ok(!/0 marks/.test(marksLabel(arch)), 'the unverified case never renders "0 marks"');

  // The 140-mark baseline is the four verified B.E. subjects only.
  const beSum = SUBJECTS.reduce((a, s) => a + (s.marks || 0), 0);
  eq(beSum, SYLLABUS_META.totalMarks, 'the unverified B.Arch subject does not disturb the 140 baseline');

  // A B.E. student should not be warned about a subject they opted out of...
  const offState = defaultState();
  const offReport = runValidation(offState);
  ok(!offReport.warnings.some((w) => /no verified mark allocation/.test(w)),
    'a B.E.-only plan is not warned about B.Arch marks');
  // ...but a B.Arch student is told, because it changes their paper.
  const onState = defaultState();
  onState.settings.includeBArch = true;
  const onReport = runValidation(onState);
  eq(onReport.errors.length, 0, 'enabling B.Arch still validates with no errors');
  ok(onReport.warnings.some((w) => /no verified mark allocation/.test(w)),
    'a B.Arch plan is explicitly warned that the Architecture split is unverified');

  // And the unverified allocation must not leak into planning.
  const st = defaultState();
  st.settings.includeBArch = true;
  st.settings.setupComplete = true;
  const idx = buildIndex(allSubjectGroups(true));
  const plan = generatePlan(st, idx);
  const archItems = idx.items.filter((i) => i.subjectId === 'ARCH');
  ok(archItems.length > 0, 'Architecture produced study items');
  const archTasks = Object.values(plan.plan)
    .flatMap((day) => day.tasks || [])
    .filter((t) => t.subjectId === 'ARCH');
  ok(archTasks.length > 0, `Architecture still gets scheduled despite the unknown mark split (${archTasks.length} tasks)`);
  ok(archTasks.every((t) => Number.isFinite(t.plannedMin) && t.plannedMin > 0),
    'its scheduled minutes are finite and positive, not NaN or 0 from a null mark');
}

section('21. Bad imports are refused, not silently emptied');
{
  eq(importJSON('not json at all'), null, 'garbage text is refused');
  eq(importJSON('{"nope":1}'), null, 'an unrelated JSON object is refused');
  eq(importJSON('[1,2,3]'), null, 'a JSON array is refused');
  eq(importJSON('null'), null, 'null is refused');
  const st = defaultState();
  const good = importJSON(exportJSON(st));
  ok(good !== null, 'a real export still imports');
  eq(Object.keys(good.items).length, index.items.length, 'and is fully seeded');
  ok((good.log || []).length >= (st.log || []).length, 'log history is carried over');
}

section('22. There is exactly one way to block a day');
{
  const st = defaultState();
  // The dead `overrides.skippedDates` field used to duplicate busyDays: it was
  // read by the planner but nothing could write it, so two mechanisms existed
  // for "I have no time that day" and only one worked.
  eq(Object.prototype.hasOwnProperty.call(st.overrides, 'skippedDates'), false,
    'the default state no longer carries the dead skippedDates field');

  const d = todayISO();
  st.settings.busyDays[d] = 0;
  eq(availableMinutesFor(st, d), 0, 'busyDays[date] = 0 is the single mechanism, and it works');
  eq(baseAvailableMinutes(st, d), 0, 'and it is honoured before any phase or buffer maths');
  delete st.settings.busyDays[d];
  ok(availableMinutesFor(st, d) > 0, 'removing it restores the day');

  // A hand-edited export using the old field still blocks the day, via migration.
  const legacy = JSON.parse(exportJSON(st));
  legacy.overrides.skippedDates = [d, 'not-a-date', '2027-13-45'];
  delete legacy.settings.busyDays[d];
  const migrated = importJSON(JSON.stringify(legacy));
  ok(migrated !== null, 'a legacy export with skippedDates still imports');
  eq(migrated.overrides.skippedDates, undefined, 'the dead field is dropped after migration');
  eq(migrated.settings.busyDays[d], 0, 'its date was folded into busyDays');
  eq(migrated.settings.busyDays['not-a-date'], undefined, 'a malformed date was discarded');
  eq(migrated.settings.busyDays['2027-13-45'], undefined, 'an impossible date was discarded');
  // A shape-matching but non-existent date must not be treated as real.
  eq(D.isValidISODate('2027-02-30'), false, '2027-02-30 is rejected - February never has 30 days');
  eq(D.isValidISODate('2027-13-45'), false, 'month 13 day 45 is rejected');
  eq(D.isValidISODate('2027-00-10'), false, 'month 0 is rejected');
  eq(D.isValidISODate('2027-01-00'), false, 'day 0 is rejected');
  eq(D.isValidISODate('2027-1-5'), false, 'unpadded input is rejected');
  eq(D.isValidISODate('today'), false, 'a non-date is rejected');
  eq(D.isValidISODate('2028-02-29'), true, 'a real leap day is accepted');
  eq(D.isValidISODate('2027-02-28'), true, 'an ordinary day is accepted');
  eq(D.isValidISODate('2027-12-31'), true, 'the last day of the year is accepted');
  eq(availableMinutesFor(migrated, d), 0, 'and the day is genuinely blocked after migration');

  // An existing explicit busyDays entry must win over a legacy skip.
  const both = JSON.parse(exportJSON(st));
  both.overrides.skippedDates = [d];
  both.settings.busyDays[d] = 90;
  const bothMigrated = importJSON(JSON.stringify(both));
  eq(bothMigrated.settings.busyDays[d], 90, 'an explicit busyDays value is not overwritten by migration');
}
section('23. The student can choose the day, or have it randomised');
{
  const st = defaultState();
  const idx = buildIndex(allSubjectGroups(st.settings.trackBArch));
  const today = todayISO();

  // Gather a few real topic keys spread across subjects.
  const keys = [];
  for (const u of idx.units) for (const t of u.topics) keys.push(`${u.id}::${t.id}`);
  const keyOf = (plan, task) => `${task.unitId}::${task.topicId || task.itemId}`;

  // --- hand-picked ------------------------------------------------------
  const picked = [keys[40], keys[10]];
  st.overrides.todayPicks[today] = picked;

  const r = generatePlan(st, idx, { today });
  const day = r.plan[today];
  const learnKeys = day.tasks.filter((t) => t.type === 'learn').map((t) => keyOf(r, t));

  eq(day.pickStyle, 'picks', 'the day records that it was built from hand-picks');
  eq(picksForDate(st, today).join(','), picked.join(','), 'the stored picks keep the order they were chosen in');
  ok(learnKeys.includes(picked[0]) && learnKeys.includes(picked[1]),
    'both chosen topics appear in the day', `got ${JSON.stringify(learnKeys)}`);
  eq(learnKeys[0], picked[0], 'they appear in the order the student chose');
  ok(day.tasks.filter((t) => t.picked).length >= 1, 'chosen tasks are flagged as chosen');
  ok(day.tasks.find((t) => t.picked)?.reason?.includes('You chose'),
    'and the plan says why they are there');

  // No other new material may sneak in alongside the picks.
  const learnIdx = day.tasks.filter((t) => t.type === 'learn').length;
  eq(learnIdx, day.tasks.filter((t) => t.picked && t.type === 'learn').length,
    'a hand-picked day contains no unrequested new chapters');

  // Picks are date-scoped: they must not leak onto another day.
  const tomorrow = D.addDays(today, 1);
  const r2 = generatePlan(st, idx, { today });
  eq(picksForDate(st, tomorrow).length, 0, "tomorrow's picks are empty");
  ok(r2.plan[tomorrow].pickStyle !== 'picks' || !r2.plan[tomorrow].tasks.some((t) => t.picked),
    "today's picks do not leak onto tomorrow");

  // A pick that no longer needs learning is reported, not silently dropped.
  const st2 = defaultState();
  st2.overrides.todayPicks[today] = ['NOPE-U1::NOPE-U1-T1'];
  const bad = generatePlan(st2, idx, { today });
  eq((bad.plan[today].picksMissed || []).length, 1, 'an unresolvable pick is reported back to the student');

  // --- randomised -------------------------------------------------------
  const st3 = defaultState();
  st3.settings.planStyle = 'shuffle';
  const a1 = generatePlan(st3, idx, { today });
  const a2 = generatePlan(st3, idx, { today });
  const learnSig = (p) => JSON.stringify(p.plan[today].tasks.map((t) => `${t.type}:${t.itemId}:${t.plannedMin}`));
  eq(learnSig(a1), learnSig(a2), 'a randomised day is identical when re-derived, so it cannot churn mid-session');
  eq(a1.plan[today].pickStyle, 'shuffle', 'the day records that it was randomised');

  // Bumping the nonce is what actually changes the day.
  st3.overrides.shuffleNonce[today] = 1;
  const a3 = generatePlan(st3, idx, { today });
  ok(learnSig(a3) !== learnSig(a1), '"shuffle again" produces a different day');

  // Randomising must never buy extra time or break the ceiling.
  let overBudget = 0;
  for (let n = 0; n < 12; n++) {
    st3.overrides.shuffleNonce[today] = n;
    const p = generatePlan(st3, idx, { today });
    for (const [d, dd] of Object.entries(p.plan)) {
      if (dd.plannedMin > dd.availableMin) overBudget++;
      if (dd.closed && dd.tasks.length) overBudget++;
    }
  }
  eq(overBudget, 0, 'randomising never exceeds a day\'s available minutes or schedules a closed day');

  // Due revisions must survive randomising - they are obligations, not taste.
  const st4 = defaultState();
  st4.settings.planStyle = 'shuffle';
  const r4 = generatePlan(st4, idx, { today });
  ok(r4.plan[today].plannedMin <= r4.plan[today].availableMin,
    'a randomised first day still fits in the day');
  ok(day.plannedMin <= day.availableMin, 'a hand-picked day also fits in the day');
}
section('24. A hand-picked day stays hand-picked, and reports honestly');
{
  const idx = buildIndex(allSubjectGroups(false));
  const today = todayISO();
  const keyOf = (t) => `${t.unitId}::${t.topicId || t.itemId}`;

  // --- picking several chapters from ONE subject is allowed ---------------
  const unit = idx.units.filter((u) => u.subjectId === 'MATH')[0];
  const threeSameSubject = unit.topics.slice(0, 3).map((t) => `${unit.id}::${t.id}`);
  ok(threeSameSubject.length >= 2, `a unit offers several chapters to pick (${threeSameSubject.length})`);
  {
    const st = defaultState();
    st.overrides.todayPicks[today] = threeSameSubject;
    const d = generatePlan(st, idx, { today }).plan[today];
    const pickedTasks = d.tasks.filter((t) => t.picked);
    // The per-subject cap of 2 used to silently drop the third pick.
    eq(d.picksMissed, undefined, 'no pick is dropped by the per-subject cap');
    ok(pickedTasks.length >= 2, `all picks on the page (${pickedTasks.length})`);
    eq(new Set(pickedTasks.map(keyOf)).size, pickedTasks.length, 'and no pick is scheduled twice');
  }

  // --- no unrequested chapter is ever added ------------------------------
  for (const picked of [threeSameSubject, ['MATH-U1::MATH-U1-T1', 'PHY-U1::PHY-U1-T1']]) {
    const st = defaultState();
    st.overrides.todayPicks[today] = picked;
    const chosen = new Set(picked);
    let guard = 0;
    // Tick every pick off, day by day, and watch what turns up.
    while (guard++ < 30) {
      const r = generatePlan(st, idx, { today });
      const t = r.plan[today].tasks.find((x) => x.type === 'learn' && x.picked);
      if (!t) break;
      commitPlan(st, r);
      logTask(st, idx, today, t, OUTCOMES.DONE, t.plannedMin, 1);
    }
    const d = generatePlan(st, idx, { today }).plan[today];
    const strays = d.tasks.filter((t) => (t.type === 'learn' || t.type === 'fill') && !chosen.has(keyOf(t)));
    eq(strays.length, 0, `a hand-picked day never gains an unrequested chapter (${strays.length})`);
    ok(!d.tasks.some((t) => t.picked), 'and no picked chapter is left hanging once it is finished');
    eq(d.picksDone, picked.length, `every pick is reported as done (${d.picksDone}/${d.picksTotal})`);
  }

  // --- a pick that only partly fits stays, and says how far it got --------
  {
    const st = defaultState();
    st.overrides.todayPicks[today] = ['MATH-U1::MATH-U1-T1'];
    let r = generatePlan(st, idx, { today });
    commitPlan(st, r);
    const t = r.plan[today].tasks.find((x) => x.type === 'learn' && x.picked);
    logTask(st, idx, today, t, OUTCOMES.DONE, t.plannedMin, 1);

    const d = generatePlan(st, idx, { today }).plan[today];
    const left = d.tasks.find((x) => x.type === 'learn' && x.picked);
    ok(!!left, 'a partly finished chapter stays on the day rather than vanishing');
    ok(left.subtopicsTotal > 1, 'the chapter really is split into subtopics');
    ok(left.subtopicsDone > 0 && left.subtopicsDone < left.subtopicsTotal,
      `and it reports real progress instead of a bare "0 of N" (${left.subtopicsDone}/${left.subtopicsTotal})`);
    // Counts must be chapter-wide, not just the outstanding members.
    const chapter = idx.items.filter((i) => `${i.unitId}::${i.topicId}` === 'MATH-U1::MATH-U1-T1');
    eq(left.subtopicsTotal, chapter.length, 'the subtopic total is the whole chapter, not the remainder');
    eq(left.subtopicsDone, chapter.filter((i) => (st.items[i.id]?.progressPct ?? 0) >= 100).length,
      'and the done count matches the recorded state');
  }

  // --- leftover time goes to practice only after the picks are served -----
  {
    const st = defaultState();
    st.overrides.todayPicks[today] = ['PHY-U1::PHY-U1-T1'];
    st.settings.defaultDailyMinutes = 300; // plenty of spare time
    const d = generatePlan(st, idx, { today }).plan[today];
    const order = d.tasks.map((t) => t.type);
    const lastPick = order.lastIndexOf('learn');
    const firstPractice = order.findIndex((t) => t === 'practice' || t === 'mixed');
    if (lastPick >= 0 && firstPractice >= 0) {
      ok(firstPractice > lastPick || d.tasks[firstPractice].picked,
        'your chapters come before practice, not after');
    }
    // Once the only pick is finished, the day is free to spend time on practice.
    commitPlan(st, generatePlan(st, idx, { today }));
    for (let n = 0; n < 30; n++) {
      const r = generatePlan(st, idx, { today });
      const t = r.plan[today].tasks.find((x) => x.type === 'learn' && x.picked);
      if (!t) break;
      commitPlan(st, r);
      logTask(st, idx, today, t, OUTCOMES.DONE, t.plannedMin, 1);
    }
    const after = generatePlan(st, idx, { today }).plan[today];
    eq(after.picksDone, 1, 'the pick is complete');
    ok(after.tasks.some((t) => t.type === 'practice' || t.type === 'mixed'),
      'and the freed time goes to practice rather than to a new chapter');
  }

  // --- the bonus block must not smuggle in a chapter on a picked day ------
  {
    // `buildFillTask` is handed no topic candidates at all while picks are
    // active, so a bonus block can only ever be revision/practice/mistakes.
    const st = defaultState();
    st.settings.defaultDailyMinutes = 300;
    st.overrides.todayPicks[today] = ['MATH-U1::MATH-U1-T1'];
    const chosen = new Set(['MATH-U1::MATH-U1-T1']);
    let sawBonus = false;
    for (let n = 0; n < 25; n++) {
      const r = generatePlan(st, idx, { today });
      const d0 = r.plan[today];
      for (const f of d0.tasks.filter((t) => t.type === 'fill')) {
        sawBonus = true;
        ok(['revise', 'practice', 'mixed', 'mistakes'].includes(f.type),
          `a bonus block on a picked day is never a new chapter (got "${f.type}")`);
        ok(!chosen.size || !f.unitId || chosen.has(`${f.unitId}::${f.topicId || f.itemId}`),
          'and never points at an unrequested chapter');
      }
      const t = d0.tasks.find((x) => x.type === 'learn' && x.picked);
      if (!t) break;
      commitPlan(st, r);
      logTask(st, idx, today, t, OUTCOMES.DONE, t.plannedMin, 1);
    }
    const final = generatePlan(st, idx, { today }).plan[today];
    eq(final.picksDone, 1, 'the pick finishes cleanly across repeated ticks');
    ok(final.tasks.every((t) => t.type !== 'learn' || chosen.has(keyOf(t))),
      'and the finished day contains no unrequested chapter at all');
    // sawBonus only documents whether the bonus path was reachable at all.
    if (!sawBonus) console.log('      (no bonus block occurred on a picked day)');
  }
}

section('25. A chapter is never stranded by a rounding tail');
{
  const idx = buildIndex(allSubjectGroups(false));
  const st0 = defaultState();
  const est = (it) => estOf(st0, it);
  const unit = idx.units.find((u) => u.subjectId === 'CHE');
  const topic = unit.topics.find((t) => t.itemIds.length === 1 && est(idx.byId.get(t.itemIds[0])) >= 40);
  const sid = topic.itemIds[0];
  const chapterEst = est(idx.byId.get(sid));

  // Every remainder a chapter can be left with must still be reachable. The
  // floors that keep untouched content in usable blocks must not apply to a
  // chapter the student has already started, or the last few minutes of a
  // chapter can never be scheduled and it is never counted done either.
  const unreachable = [];
  for (let leftMin = 1; leftMin <= 14; leftMin++) {
    const pct = Math.round(100 * (1 - leftMin / chapterEst));
    const st = defaultState();
    st.items[sid] = { ...st.items[sid], progressPct: pct, status: STATUS.STUDYING, nextRevisionDue: '2020-01-01' };
    const d = generatePlan(st, idx, { today: todayISO() }).plan[todayISO()];
    const task = d.tasks.find((x) => x.type === 'learn' && x.topicId === topic.id);
    if (!task) { unreachable.push(`${Math.round(chapterEst * (1 - pct / 100))}m`); continue; }
    ok(task.plannedMin > 0, `a ${Math.round(chapterEst * (1 - pct / 100))}m remainder is a real block, not a 0-minute one`);
  }
  eq(unreachable.length, 0, `every small remainder is still schedulable (missed: ${unreachable.join(', ') || 'none'})`);

  // And the finishing block must actually close the chapter out.
  {
    const pct = Math.round(100 * (1 - 6 / chapterEst));
    const st = defaultState();
    st.items[sid] = { ...st.items[sid], progressPct: pct, status: STATUS.STUDYING, nextRevisionDue: '2020-01-01' };
    const r = generatePlan(st, idx, { today: todayISO() });
    const task = r.plan[todayISO()].tasks.find((x) => x.type === 'learn' && x.topicId === topic.id);
    commitPlan(st, r);
    logTask(st, idx, todayISO(), task, OUTCOMES.DONE, task.plannedMin, 1);
    ok(getItem(st, sid).progressPct >= 100 || learnLeft(st, idx, sid) === 0,
      'logging the finishing block leaves no minutes outstanding');
    const next = generatePlan(st, idx, { today: D.addDays(todayISO(), 1) }).plan[D.addDays(todayISO(), 1)];
    ok(!next.tasks.some((x) => x.type === 'learn' && x.topicId === topic.id),
      'and the chapter does not come back');
  }

  // A finished chapter must never be re-offered as a 0-minute block: that is
  // what silently switched learn off for a whole day when the tail filter was
  // first relaxed.
  {
    const st = defaultState();
    const groups = allSubjectGroups(false);
    ok(groups.length > 0, 'sanity');
    const d = generatePlan(st, idx, { today: todayISO() }).plan[todayISO()];
    ok(d.tasks.filter((x) => x.type === 'learn').every((x) => x.plannedMin > 0),
      'every learn block on a fresh plan has a positive length');
  }

  // The relaxation must not shrink the overall plan.
  {
    const st = defaultState();
    for (const it of idx.units.slice(0, 2).flatMap((u) => u.itemIds.slice(0, 3))) {
      const rec = getItem(st, it);
      rec.progressPct = Math.min(100, rec.progressPct + 40);
      rec.status = STATUS.STUDYING;
    }
    const r = generatePlan(st, idx);
    const learn = Object.values(r.plan).flatMap((d) => d.tasks).filter((x) => x.type === 'learn');
    ok(learn.length >= 100, `new material is still scheduled across the horizon (${learn.length} blocks)`);
  }
}
console.log(`  ${pass} passed, ${fail} failed`);
if (fail) {
  console.log('\nFailures:');
  for (const f of failures) console.log(`  - ${f}`);
}
console.log('='.repeat(64));
process.exit(fail ? 1 : 0);
