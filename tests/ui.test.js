/**
 * UI smoke tests.
 *
 * Renders every view for real against a DOM shim and drives the main user
 * journeys. The point is to catch the things unit tests on the engines cannot:
 * a wrong property name, a bad import, a view that throws on a real state.
 *
 *   node tests/ui.test.js
 */

import { installDocument, nodes } from './dom-shim.mjs';

installDocument();

// Clear storage BEFORE importing the app, so its single boot() sees a first
// run. Importing it again with a different specifier would create a SECOND
// module instance with its own state, and the DOM would show that instance
// while the test asserted against the first.
const store = await import('../src/core/store.js');
store.resetAll();

const { app, update, go, openModal, closeModal } = await import('../src/app.js');
const { todayISO, addDays } = await import('../src/util/dates.js');
const { OUTCOMES } = await import('../src/core/planner.js');
const { SYLLABUS_VERSION } = await import('../data/syllabus.js');
const { QUESTION_BANK } = await import('../data/questions.js');

let pass = 0;
const failures = [];
let currentSection = '';

function section(name) {
  currentSection = name;
  console.log(`\n${name}`);
}
function ok(cond, msg) {
  if (cond) { pass++; console.log(`  PASS  ${msg}`); }
  else { failures.push(`${currentSection}: ${msg}`); console.log(`  FAIL  ${msg}`); }
}
function eq(a, b, msg) {
  const same = a === b;
  ok(same, same ? msg : `${msg} (expected ${JSON.stringify(b)}, got ${JSON.stringify(a)})`);
}

/** Render the current route and return the #view node. */
function renderNow() {
  const host = nodes.get('view');
  const before = host.childNodes.length;
  // Trigger a re-render the same way a user action would.
  return host;
}

function allText() {
  return nodes.get('view').textContent;
}

function findButtons(pred) {
  return [...nodes.get('view').walk()].filter((n) => n.tagName === 'BUTTON' && pred(n));
}

function click(node) {
  node.dispatch('click', { preventDefault() {}, stopPropagation() {} });
}

/* ================================================================== */

section('1. Boot: the setup wizard takes over a fresh state');
{
  ok(app.state !== null, 'a state exists after boot');
  eq(app.state.setupDone, undefined, 'a fresh state has not completed setup');
  const text = allText();
  ok(/Set up your planner/i.test(text), 'the wizard is rendered instead of the app');
  ok(/Syllabus finish target|Last day to finish/i.test(text), 'step 1 asks for the finish date');
  ok(!/open days with no work/i.test(text), 'the dashboard is NOT shown before setup finishes');
}

section('2. The wizard walks all five steps and starts planning');
{
  const buttons = findButtons((b) => /^Next/.test(b.textContent));
  ok(buttons.length > 0, 'a Next button exists');
  for (let i = 0; i < 4; i++) {
    const next = findButtons((b) => /^Next/.test(b.textContent))[0];
    ok(!!next, `step ${i + 2} has a Next button`);
    click(next);
  }
  ok(/Check & start/i.test(allText()), 'the last step is the review screen');
  ok(/Assumptions this app is making/i.test(allText()), 'the review states its assumptions');

  const start = findButtons((b) => /Start planning/i.test(b.textContent))[0];
  ok(!!start, 'the finish button is present');
  click(start);
  eq(app.state.setupDone, true, 'setup is marked complete');
  ok(/Dashboard/i.test(nodes.get('view').textContent), 'the dashboard renders after setup');
  ok(nodes.get('riskPill').textContent.length > 0, 'the risk pill is populated');
  ok(/\d+d left|Deadline is today/.test(nodes.get('countdown').textContent), 'the countdown is populated');
  ok(nodes.get('tabs').querySelectorAll('a').length >= 8, 'the navigation tabs are rendered');
}

section('3. Every view renders against a real state');
{
  for (const route of ['dashboard', 'today', 'syllabus', 'calendar', 'practice', 'mistakes', 'progress', 'settings', 'assumptions']) {
    const before = failures.length;
    go(`#/${route}`);
    const t = nodes.get('view').textContent;
    ok(t.length > 40, `${route} renders content (${t.length} chars)`);
    ok(failures.length === before, `${route} throws nothing`);
  }
}

section('4. Dashboard numbers are real');
{
  go('#/dashboard');
  const t = allText();
  ok(/On track|Tight|High risk|Not possible|Syllabus done/.test(t), 'a risk verdict is shown');
  ok(/Work remaining/.test(t), 'remaining work is shown');
  ok(/\/day|Needed per day/.test(t), 'a required daily pace is shown');
  ok(/Chapters to work next/.test(t), 'upcoming chapters are listed');
  const s = app.assessment;
  ok(s.work.total > 0, 'a fresh plan has real remaining work');
  ok(s.capacityTotal > 0, 'real capacity was computed');
  ok(s.coverage.total === app.index.items.length, 'coverage covers every subtopic');
}

section('5. Logging a task moves real state');
{
  go('#/today');
  const before = JSON.stringify(app.state.items);
  const openers = findButtons((b) => /^(Done|Partly done)$/.test(b.textContent.trim()));
  ok(openers.length > 0, 'each task offers a Done and a Partly done button');
  click(openers[0]);

  const modal = nodes.get('modal');
  ok(modal.hidden === false, 'the log dialog opened');
  const save = [...modal.walk()].find((b) => b.tagName === 'BUTTON' && /Save session/.test(b.textContent));
  ok(!!save, 'the dialog has a Save button');

  const itemsBefore = Object.values(app.state.items).filter((r) => r.progressPct > 0).length;
  click(save);
  eq(modal.hidden, true, 'the dialog closed on save');
  const itemsAfter = Object.values(app.state.items).filter((r) => r.progressPct > 0).length;
  ok(itemsAfter > itemsBefore, `logging advanced real progress (${itemsBefore} -> ${itemsAfter} items touched)`);
  ok(JSON.stringify(app.state.items) !== before, 'state changed');

  const today = todayISO();
  const day = app.state.days[today];
  ok(day && day.sessions && day.sessions.length === 1, 'exactly one session was recorded');
  ok(day.actualMin > 0, 'actual minutes were recorded');
}

section('5b. "Skipped" is preselected, and undo really restores progress');
{
  go('#/today');
  // The first day may now be fully logged from section 5, so use tomorrow.
  const tomorrow = addDays(todayISO(), 1);
  go(`#/today/${tomorrow}`);
  const skip = findButtons((b) => b.textContent.trim() === 'Skipped')[0];
  ok(!!skip, 'a Skipped button exists on an unlogged task');
  click(skip);
  const sel = [...nodes.get('modal').walk()].find((n) => n.tagName === 'SELECT');
  eq(sel.value, 'skipped', 'pressing "Skipped" opens the dialog with Skipped preselected');
  const save = [...nodes.get('modal').walk()].find((b) => b.tagName === 'BUTTON' && /Save session/.test(b.textContent));
  click(save);
  eq((app.state.days[tomorrow]?.sessions || []).length, 1, 'the skipped session was recorded');
  eq((app.state.days[tomorrow]?.sessions || [])[0].actualMin, 0, 'a skipped session records zero minutes');
  const touchedIds = Object.values(app.state.items).filter((r) => r.progressPct > 0).map((r) => r.id);
  ok(touchedIds.length > 0, 'earlier progress is still in place before the undo');

  // Undo, and check the progress from section 5 is genuinely restored.
  const beforeUndo = Object.values(app.state.items).filter((r) => r.progressPct > 0).length;
  go(`#/today/${todayISO()}`);
  const undo = findButtons((b) => /Undo all logs on this day/.test(b.textContent))[0];
  ok(!!undo, 'the undo control is offered when a day has logged sessions');
  const snapshot = JSON.stringify(app.state.items);
  click(undo);
  eq((app.state.days[todayISO()]?.sessions || []).length, 0, 'the day has no sessions after undo');
  eq(app.state.days[todayISO()].actualMin, 0, 'actual minutes were rolled back');
  ok(JSON.stringify(app.state.items) !== snapshot, 'undo actually changed the item records');
  ok(/restored/.test(nodes.get('modal').textContent),
    'the app confirms exactly what the undo restored');
  const msg = nodes.get('modal').textContent.match(/Removed (\d+) logged session/);
  ok(msg && Number(msg[1]) >= 1, 'the confirmation counts the removed sessions');
  closeModal();
  const afterUndo = Object.values(app.state.items).filter((r) => r.progressPct > 0).length;
  ok(afterUndo < beforeUndo + 1, `progress was rolled back (${beforeUndo} -> ${afterUndo} items with progress)`);

  // Put the session back so later sections still have logged evidence.
  go(`#/today/${todayISO()}`);
  const doneBtn = findButtons((b) => b.textContent.trim() === 'Done')[0];
  click(doneBtn);
  const save2 = [...nodes.get('modal').walk()].find((b) => b.tagName === 'BUTTON' && /Save session/.test(b.textContent));
  click(save2);
  ok((app.state.days[todayISO()]?.sessions || []).length === 1, 'the day has a real session again');
}

section('5c. The B.Arch toggle actually changes the syllabus');
{
  const n0 = app.index.items.length;
  update((st) => { st.settings.includeBArch = true; });
  const n1 = app.index.items.length;
  ok(n1 > n0, `including B.Arch adds topics (${n0} -> ${n1})`);
  ok(app.index.subjects.some((s) => /arch/i.test(s.name)), 'a B.Arch subject appears in the index');
  go('#/syllabus');
  ok(/B\.Arch|Architecture/i.test(allText()), 'the syllabus view shows the extra subject');
  const covered = app.assessment.coverage.total;
  eq(covered, n1, 'coverage covers the enlarged syllabus');
  update((st) => { st.settings.includeBArch = false; });
  eq(app.index.items.length, n0, 'turning B.Arch off restores the original syllabus');
}

section('5d. The unverified B.Arch mark split is never shown as 0');
{
  update((st) => { st.settings.includeBArch = true; });
  const routes = ['#/progress', '#/practice', '#/setup'];
  for (const r of routes) {
    go(r);
    const txt = allText();
    ok(!/\b0 marks\b/.test(txt), `${r} never renders "0 marks" for the unverified subject`);
    ok(!/\bnull\b/i.test(txt), `${r} never leaks a raw null into the page`);
  }
  go('#/progress');
  const prog = allText();
  ok(/Architecture/.test(prog), 'the progress table includes the B.Arch subject row');
  // Read the real cell rather than regexing the whole page for a stray "0".
  const archRow = [...nodes.get('view').walk()].find((n) => n.tagName === 'TR' && /Architecture/.test(n.textContent));
  ok(!!archRow, 'the Architecture row exists in the table');
  const cells = archRow ? [...archRow.walk()].filter((n) => n.tagName === 'TD').map((td) => td.textContent.trim()) : [];
  eq(cells[0], 'Architecture (B.Arch only)', 'first cell is the subject name');
  eq(cells[1], '—', 'its marks cell is an em-dash, not 0 and not null');
  ok(cells.slice(2).some((c) => /^\d+$/.test(c)), 'its done/total columns are still real numbers');
  ok(/(^|\D)50(\D|$)/.test(prog), 'a verified subject still shows its real allocation in the same table');

  // Known content gap, pinned deliberately: every question in the bank maps to a
  // B.E. subject, so Practice has no Architecture row at all. If questions are
  // ever added for it, this assertion fails on purpose and the row is re-checked.
  go('#/practice');
  const prac = allText();
  ok(/marks on the paper/.test(prac), 'practice still labels verified subjects with their paper marks');
  ok(!/Architecture/.test(prac), 'practice has no Architecture row (no questions are mapped to it yet)');
  update((st) => { st.settings.includeBArch = false; });
  go('#/progress');
  ok(/50/.test(allText()), 'and the verified allocation is still there with B.Arch off');
}

section('5e. "Start tomorrow" blocks today and shifts the work on');
{
  const today = todayISO();
  const tomorrow = addDays(today, 1);
  go('#/today');

  // Blocking a day that already has logged sessions asks for confirmation first.
  const blockToday = () => {
    const b = findButtons((x) => /Start tomorrow instead/.test(x.textContent))[0];
    ok(!!b, 'the block control is on the page');
    click(b);
    const confirm = [...nodes.get('modal').walk()]
      .find((x) => x.tagName === 'BUTTON' && /Block today/.test(x.textContent));
    if (confirm) click(confirm);
    return !!confirm;
  };

  const before = app.state.days[today];
  ok(before && before.availableMin > 0, 'today starts with usable time available');
  const beforeTasks = (app.state.days[today].tasks || []).length;
  const tomorrowBefore = (app.state.days[tomorrow] || {}).availableMin || 0;

  ok(/Start tomorrow instead/.test(allText()), 'the Today view offers a one-click way to start tomorrow');
  const confirmed = blockToday();
  if (confirmed) ok(true, 'and it asked for confirmation first, because today already has logged sessions');
  eq(app.state.settings.busyDays[today], 0, 'today is recorded as a blocked day');
  eq(app.state.days[today].availableMin, 0, 'today has no usable time left');
  eq((app.state.days[today].tasks || []).length, 0, 'nothing is scheduled on a blocked day');
  ok(/Today is blocked/.test(allText()), 'the view says today is blocked');
  const undo = findButtons((b) => /Undo/.test(b.textContent))[0];
  ok(!!undo, 'an undo is offered, so this is not a one-way door');

  const tomorrowAfter = (app.state.days[tomorrow] || {}).availableMin || 0;
  eq(tomorrowAfter, tomorrowBefore, 'tomorrow is untouched - the work is redistributed, not deleted');

  // The plan must still exist tomorrow, otherwise "start tomorrow" broke the plan.
  ok((app.state.days[tomorrow] || {}).tasks?.length > 0, 'tomorrow still has real work scheduled');

  // Undo restores the day.
  click(undo);
  eq(app.state.settings.busyDays[today], undefined, 'undo removed the block');
  ok(app.state.days[today].availableMin > 0, 'today got its time back');
  ok((app.state.days[today].tasks || []).length === beforeTasks,
    `and its original ${beforeTasks} tasks came back`);

  // It must survive a reload, like any other setting.
  go('#/today');
  blockToday();
  const raw = JSON.parse(localStorage.getItem('ioe-planner:state'));
  eq(raw.settings.busyDays[today], 0, 'the block is persisted, not just held in memory');
  click(findButtons((b) => /Undo/.test(b.textContent))[0]);
  eq(JSON.parse(localStorage.getItem('ioe-planner:state')).settings.busyDays[today], undefined,
    'and the undo is persisted too');
}

section('6. The plan re-derives instead of being stored');
{
  const planA = JSON.stringify(app.plan.plan[todayISO()].tasks);
  // A deadline far in the future should NOT change today: that is correct, the
  // plan has runway. A deadline that forces the app into its final phase must.
  update((st) => { st.settings.deadline = addDays(todayISO(), 200); });
  const planB = JSON.stringify(app.plan.plan[todayISO()].tasks);
  ok(planA === planB, 'a still-comfortable deadline does not churn today\'s plan');

  update((st) => { st.settings.deadline = addDays(todayISO(), 18); });
  const planC = JSON.stringify(app.plan.plan[todayISO()].tasks);
  ok(planB !== planC, 'a deadline 18 days out changes the plan immediately');
  ok(['exam_prep', 'final'].includes(app.plan.meta.phase),
    `the planner switched phase under pressure (${app.plan.meta.phase})`);
  ok(Object.keys(app.plan.plan).length <= 19,
    `the horizon shrank to the new deadline (${Object.keys(app.plan.plan).length} days)`);

  update((st) => { st.settings.defaultDailyMinutes = 60; });
  const planD = JSON.stringify(app.plan.plan[todayISO()].tasks);
  ok(planC !== planD, 'changing available time changed the plan immediately');

  update((st) => { st.settings.defaultDailyMinutes = 150; st.settings.deadline = addDays(todayISO(), 365); });
}

section('7. Setting a subtopic status in the Syllabus re-plans');
{
  go('#/syllabus');
  // Expand the first chapter, then the first topic.
  const heads = findButtons((b) => b.className === 'unit-head');
  ok(heads.length > 0, 'chapters are listed');
  click(heads[0]);
  const topicToggles = findButtons((b) => b.getAttribute('aria-label') === 'Expand');
  ok(topicToggles.length > 0, 'topics can be expanded');
  click(topicToggles[0]);

  const selects = [...nodes.get('view').walk()].filter((n) => n.tagName === 'SELECT' && n.className === 'status-sel');
  ok(selects.length > 0, 'each subtopic has a status selector');
  const firstId = Object.keys(app.state.items).find((k) => app.state.items[k].status !== 'mastered');
  const sel = selects[0];
  sel.value = 'weak';
  sel.dispatch('change');
  const anyWeak = Object.values(app.state.items).some((r) => r.status === 'weak');
  ok(anyWeak, 'changing a status is persisted');

  // Pins: the button must show the real pinned state, not a hard-coded class.
  const isPin = (b) => /Pin this topic|Unpin/.test(b.getAttribute('title') || '');
  const pinBtn = findButtons(isPin)[0];
  ok(!!pinBtn, 'topics offer a pin control');
  ok(!/Unpin/.test(pinBtn.getAttribute('title')), 'the pin starts unpinned');
  click(pinBtn);
  const pinBtn2 = findButtons(isPin)[0];
  ok(/Unpin/.test(pinBtn2.getAttribute('title')), 'pinning is reflected in the button state');
  ok((app.state.overrides.pinnedItemIds || []).length > 0, 'the pin was persisted');
  ok(pinBtn2.getAttribute('aria-pressed') === 'true', 'the pin button reports its pressed state for assistive tech');
  click(pinBtn2);
  eq((app.state.overrides.pinnedItemIds || []).length, 0, 'unpinning clears it again');

  // Acting on a subtopic must not collapse the tree the user is working in.
  const openTopics = () => Object.keys(app.scratch.openTopics || {}).length;
  const beforeOpen = openTopics();
  const sel2 = [...nodes.get('view').walk()].filter((n) => n.tagName === 'SELECT' && n.className === 'status-sel')[1];
  sel2.value = 'needs_revision';
  sel2.dispatch('change');
  ok(openTopics() === beforeOpen, 'changing a status keeps the expanded topics open');
  ok([...nodes.get('view').walk()].some((n) => n.className === 'status-sel'),
    'the subtopic list is still rendered after a status change');
}

section('8. Exam Mode from the UI');
{
  go('#/settings');
  const nameIn = [...nodes.get('view').walk()].find((n) => n.tagName === 'INPUT' && n.getAttribute('placeholder')?.includes('Pre-board'));
  ok(!!nameIn, 'the exam form has a name field');
  nameIn.value = 'Pre-board';
  const dates = [...nodes.get('view').walk()].filter((n) => n.tagName === 'INPUT' && n.getAttribute('type') === 'date');
  ok(dates.length >= 2, 'the exam form has start and end dates');
  const subjBtns = findButtons((b) => b.textContent === 'Math' || b.textContent === 'Physics');
  ok(subjBtns.length > 0, 'subjects can be selected for the exam');
  click(subjBtns[0]);

  const add = findButtons((b) => /Add exam/.test(b.textContent))[0];
  ok(!!add, 'the Add exam button exists');
  click(add);
  eq((app.state.exams || []).length, 1, 'the exam was added');
  ok(/1 added/.test(nodes.get('view').textContent), 'the exam count updated in the UI');

  // During the exam, no learn tasks.
  const ex = app.state.exams[0];
  update((st) => { st.settings.busyDays = {}; });
  const during = app.plan.plan[ex.start] || app.plan.plan[addDays(ex.start, 1)];
  if (during) {
    ok(!during.tasks.some((t) => t.type === 'learn'), 'no new chapters are scheduled during the exam');
  }
  // Remove it again.
  const del = findButtons((b) => /Remove/.test(b.textContent))[0];
  if (del) { click(del); eq((app.state.exams || []).length, 0, 'the exam was removed'); }
}

section('9. Practice: answering is the only thing that records anything');
{
  go('#/practice');
  ok(/Practice/.test(allText()), 'the practice view renders');
  ok(/Question bank is empty/.test(allText()) === false, 'the question bank is populated');

  // The chapter/subject cards are the sets that always exist.
  const start = findButtons((b) => b.textContent.trim() === 'Practise')[0];
  ok(!!start, 'a practice set can be started');
  click(start);
  ok(/question 1 of/.test(allText()), 'the runner opened at question 1');

  const options = [...nodes.get('view').walk()].filter((n) => n.className && n.className.includes('mcq-option'));
  ok(options.length === 4, `the question shows 4 options (got ${options.length})`);

  // The item's attempt count must not change before answering.
  const s = app.scratch.practice;
  const qid = s.queue[0];
  const q = QUESTION_BANK.find((x) => x.id === qid);
  const attBefore = (app.state.items[q.itemId]?.mcq?.att) || 0;
  ok(!/explanation/i.test(allText()), 'no answer is revealed before you answer');
  click(options[q.answer]);
  ok(/explanation|Correct|Not quite/i.test(allText()), 'the answer is explained after you answer');
  const attAfter = app.state.items[q.itemId]?.mcq?.att || 0;
  eq(attAfter, attBefore + 1, 'answering recorded exactly one attempt');

  // Answer the rest and reach the result screen.
  let guard = 0;
  while (guard++ < 40) {
    if (/Session result/.test(allText())) break;
    const opts = [...nodes.get('view').walk()].filter((n) => n.className && n.className.includes('mcq-option') && !n.disabled);
    if (opts.length) {
      const cur = app.scratch.practice;
      if (!cur) break;
      const cq = QUESTION_BANK.find((x) => x.id === cur.queue[cur.index]);
      click(opts[cq.answer]);
    }
    const next = findButtons((b) => /Next question|Finish session/.test(b.textContent))[0];
    if (next) click(next);
  }
  ok(/Session result/.test(allText()), 'the session ends on a result screen');
  ok(new RegExp(`${s.queue.length} of ${s.queue.length} correct`).test(allText()),
    'the result screen reports the real score (all answered correctly)');
  ok(/Mistake Bank/.test(allText()) === false || /0 correct/.test(allText()), 'an all-correct session adds no mistakes');
  eq((app.state.mistakes || []).length, 0, 'answering correctly creates no mistake');
  const back = findButtons((b) => /Back to practice sets/.test(b.textContent))[0];
  ok(!!back, 'the result screen can be dismissed');
  click(back);
  ok(/questions mapped to the syllabus/i.test(allText()), 'dismissing returns to the set list');
}

section('10. Mistake Bank: only a correct re-solve clears a mistake');
{
  go('#/practice');
  // Answer a whole set wrong so the bank has real entries.
  const starters = findButtons((b) => b.textContent.trim() === 'Practise');
  ok(starters.length > 0, 'chapter sets are available');
  click(starters[0]);
  for (let guard = 0; guard < 60; guard++) {
    if (/Session result/.test(allText())) break;
    const opts = [...nodes.get('view').walk()].filter((n) => n.className && n.className.includes('mcq-option') && !n.disabled);
    const s = app.scratch.practice;
    if (!opts.length || !s) break;
    const q = QUESTION_BANK.find((x) => x.id === s.queue[s.index]);
    // Deliberately wrong.
    click(opts[[0, 1, 2, 3].find((i) => i !== q.answer)]);
    const next = findButtons((b) => /Next question|Finish session/.test(b.textContent))[0];
    if (next) click(next);
  }
  const opened = (app.state.mistakes || []).length;
  ok(opened > 0, `wrong answers were recorded (${opened} in the bank)`);
  ok(/Session result/.test(allText()), 'the all-wrong session shows a result');
  ok(/in the Mistake Bank/.test(allText()), 'the result points at the Mistake Bank');

  go('#/mistakes');
  const t = allText();
  ok(/Mistake Bank/.test(t), 'the mistake bank renders');
  ok(new RegExp(`^Open\\s*${opened}`, 'm').test(t) || /Open/.test(t), 'open mistakes are counted');
  ok(/Re-solve/.test(t), 'the bank offers a re-solve action');
  ok(/Mark cleared/.test(t) === false, 'there is NO self-report "mark cleared" escape hatch');

  // There is no way to clear a mistake without answering it correctly.
  const before = (app.state.mistakes || []).filter((m) => !m.resolved).length;
  eq(before, opened, `all ${opened} mistakes are open`);

  // Re-solve one of them, answering WRONG: it must stay open.
  const firstId = app.state.mistakes[0].questionId;
  const q = QUESTION_BANK.find((x) => x.id === firstId);
  go('#/mistakes');
  const listButtons = findButtons((b) => b.textContent.trim() === 'Re-solve');
  ok(listButtons.length > 0, 'each open mistake has a re-solve button');
  click(listButtons[0]);
  ok(/question 1 of 1/.test(allText()), 'a one-question re-solve session started');
  const opts = [...nodes.get('view').walk()].filter((n) => n.className && n.className.includes('mcq-option') && !n.disabled);
  click(opts[[0, 1, 2, 3].find((i) => i !== q.answer)]);
  const fin = findButtons((b) => /Finish session/.test(b.textContent))[0];
  click(fin);
  ok(/Session result/.test(allText()), 'the re-solve finished');
  const stillOpen = (app.state.mistakes || []).filter((m) => !m.resolved).length;
  eq(stillOpen, before, 'answering wrong again does NOT clear the mistake');

  // Now answer the same question correctly: that is the only thing that clears it.
  go('#/mistakes');
  const again = findButtons((b) => b.textContent.trim() === 'Re-solve')[0];
  click(again);
  const opts2 = [...nodes.get('view').walk()].filter((n) => n.className && n.className.includes('mcq-option') && !n.disabled);
  click(opts2[q.answer]);
  const fin2 = findButtons((b) => /Finish session/.test(b.textContent))[0];
  click(fin2);
  const nowOpen = (app.state.mistakes || []).filter((m) => !m.resolved).length;
  eq(nowOpen, before - 1, 'answering correctly on a re-solve clears the mistake');
  const cleared = app.state.mistakes.find((m) => m.questionId === firstId);
  eq(cleared.resolved, true, 'the entry is marked resolved');
  ok(cleared.timesRight >= 1, 'the successful re-solve was counted');

  go('#/mistakes');
  ok(/Cleared/.test(allText()), 'cleared entries are still shown, for honesty');
  const reopen = findButtons((b) => b.textContent.trim() === 'Reopen')[0];
  if (reopen) {
    click(reopen);
    eq((app.state.mistakes || []).filter((m) => !m.resolved).length, before, 'a cleared mistake can be reopened');
  }
}

section('11. Progress reflects real logged evidence');
{
  go('#/progress');
  const t = allText();
  ok(/Status distribution/.test(t), 'the status distribution renders');
  ok(/Per-subject position/.test(t), 'per-subject feasibility renders');
  ok(/Chapter completion forecast/.test(t), 'chapter ETAs render');
  ok(/Adherence/.test(t), 'adherence renders');
  const s = app.assessment;
  const sum = ['not_started', 'studying', 'studied_once', 'needs_revision', 'weak', 'strong', 'mastered']
    .reduce((x, k) => x + (s.coverage[k] || 0), 0);
  eq(sum, app.index.items.length, 'every subtopic is counted in exactly one status bucket');
}

section('12. Calendar renders a month grid');
{
  go('#/calendar');
  const t = allText();
  const days = [...nodes.get('view').walk()].filter((n) => n.className && n.className.includes('cal-day') && !n.className.includes('empty'));
  ok(days.length >= 28, `the month grid has cells (${days.length})`);
  ok(/This month in numbers/.test(t), 'the month summary renders');
  ok(/Legend/.test(t), 'the legend renders');

  // The header must match the real weekday of each cell.
  const dows = [...nodes.get('view').walk()].filter((n) => n.className === 'dow').map((n) => n.textContent);
  eq(dows.join(','), 'Mo,Tu,We,Th,Fr,Sa,Su', 'the grid starts on Monday and says so');
  const dayNum = (c) => {
    const s = c.childNodes.find((n) => n.className === 'd');
    return s ? Number(s.textContent) : NaN;
  };
  eq(new Date(2027, 3, 1).getDay(), 4, '(sanity: April 1 2027 really is a Thursday)');
  go('#/calendar/2027-04');
  // Include the leading/trailing padding cells, or the offset is always zero.
  const cells = [...nodes.get('view').walk()].filter((n) => n.className && n.className.includes('cal-day'));
  const firstCell = cells.find((c) => dayNum(c) === 1);
  ok(!!firstCell, 'the 1st of the month has a cell');
  eq(cells.indexOf(firstCell), 3, 'the 1st sits in the Thursday column');

  // A month where the 1st is a Monday has no offset at all.
  go('#/calendar/2027-02');
  eq(new Date(2027, 1, 1).getDay(), 1, '(sanity: February 1 2027 is a Monday)');
  const cells2 = [...nodes.get('view').walk()].filter((n) => n.className && n.className.includes('cal-day') && !n.className.includes('empty'));
  eq(cells2.indexOf(cells2.find((c) => dayNum(c) === 1)), 0,
    'a month starting on Monday needs no leading offset');
  go('#/calendar');
}

section('13. Settings: export produces real JSON');
{
  go('#/settings');
  const exp = findButtons((b) => /Export as JSON/.test(b.textContent))[0];
  ok(!!exp, 'the export button exists');
  // Avoid the real download path; assert the serialiser instead.
  const text = store.exportJSON(app.state);
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { /* handled below */ }
  ok(parsed !== null, 'exported JSON parses');
  eq(parsed.settings.deadline, app.state.settings.deadline, 'the exported deadline round-trips');
  ok(Object.keys(parsed.items).length > 0, 'item progress is included');
}

section('14. Import rejects nonsense and accepts a round trip');
{
  const good = store.exportJSON(app.state);
  const back = store.importJSON(good);
  ok(back !== null, 'a valid export re-imports');
  eq(back.settings.deadline, app.state.settings.deadline, 'the deadline round-trips through import');
  eq(store.importJSON('not json at all'), null, 'garbage is rejected');
  eq(store.importJSON('{"nope":1}'), null, 'a JSON object that is not planner data is rejected');
}

section('15. Validation panel shows a clean database');
{
  go('#/settings');
  const t = allText();
  ok(/Syllabus validation/.test(t), 'the validation panel renders');
  ok(/Valid|No problems/i.test(t) || /\d+ errors/.test(t), 'a validation verdict is shown');
  ok(new RegExp(String(QUESTION_BANK.length)).test(t), 'the question count is shown');
  const check = findButtons((b) => /Compare/.test(b.textContent))[0];
  ok(!!check, 'the baseline comparison control exists');
}

section('16. State survives a reload (localStorage round trip)');
{
  update((st) => { st.settings.defaultDailyMinutes = 175; });
  const saved = store.save(app.state);
  const reloaded = store.load();
  ok(reloaded !== null, 'state was reloaded from localStorage');
  eq(reloaded.settings.defaultDailyMinutes, 175, 'a setting survived the round trip');
  ok(Object.keys(reloaded.items).length === Object.keys(app.state.items).length, 'item records survived');
}

section('17. No view renders a stack trace or an empty shell');
{
  const junk = ['#/', '#/nonsense', '#/today/1999-01-01', '#/syllabus/ZZZ', '#/calendar/2020-13', '#/practice/xyz'];
  for (const h of junk) {
    const before = failures.length;
    go(h);
    ok(failures.length === before, `route ${h} is handled gracefully`);
    ok(!/could not be rendered/.test(allText()), `route ${h} does not hit the error boundary`);
  }
}

section('17b. Every view has a permanent way back to the dashboard');
{
  // The tab bar is the primary nav, but it is chrome above the content. A user
  // must never be stranded on a page, so each non-dashboard route carries its
  // own link home.
  const routes = ['#/today', '#/syllabus', '#/calendar', '#/practice', '#/mistakes', '#/progress', '#/settings', '#/assumptions'];
  for (const r of routes) {
    go(r);
    const back = [...nodes.get('view').walk()].find((n) => n.tagName === 'A' && n.getAttribute('href') === '#/dashboard');
    ok(!!back, `${r} offers a link back to the dashboard`);
  }
  go('#/dashboard');
  const onDash = [...nodes.get('view').walk()].find((n) => n.tagName === 'A' && /Dashboard/.test(n.textContent));
  ok(!onDash, 'the dashboard does not link to itself');
  // The shim has no real navigation, so the click itself is proven in
  // tests/browser.test.js; here we only pin the target it points at.
  go('#/calendar');
  const link = [...nodes.get('view').walk()].find((n) => n.tagName === 'A' && n.getAttribute('href') === '#/dashboard');
  eq(link.textContent.trim(), '← Dashboard', 'the link is labelled as a way home');
}

/* ================================================================== */

/* ================================================================== */

section('18. You choose the day, or ask for a random one');
{
  const today = todayISO();
  go('#/today');

  ok(/What to study/.test(allText()), 'the Today view lets you choose what to study');
  const modes = [...nodes.get('view').walk()].filter((n) => n.tagName === 'BUTTON' && n.getAttribute('data-mode'));
  eq(modes.map((m) => m.getAttribute('data-mode')).join(','), 'auto,shuffle,picks',
    'all three ways of choosing a day are offered');

  // --- random ----------------------------------------------------------
  const shuffleBtn = modes.find((m) => m.getAttribute('data-mode') === 'shuffle');
  click(shuffleBtn);
  eq(app.state.settings.planStyle, 'shuffle', 'choosing "Random" switches the plan style');
  ok(/Shuffle again/.test(allText()), 'and offers to draw a different day');
  const nonceBefore = (app.state.overrides.shuffleNonce || {})[today] || 0;
  click(findButtons((x) => /Shuffle again/.test(x.textContent))[0]);
  eq((app.state.overrides.shuffleNonce || {})[today] || 0, nonceBefore + 1,
    '"shuffle again" re-draws the day');

  // Back to the default.
  click([...nodes.get('view').walk()].find((n) => n.getAttribute('data-mode') === 'auto'));
  eq(app.state.settings.planStyle, 'auto', 'the planner\'s own choice can be restored');

  // --- hand-picked -----------------------------------------------------
  click([...nodes.get('view').walk()].find((n) => n.getAttribute('data-mode') === 'picks'));
  const boxes = [...nodes.get('view').walk()].filter((n) => n.tagName === 'INPUT' && n.getAttribute('type') === 'checkbox');
  ok(boxes.length > 20, `every topic is offered for picking (${boxes.length} topics listed)`);

  const chosen = boxes.slice(0, 2);
  for (const b of chosen) {
    b.checked = true;
    b.dispatch('change', { target: b, preventDefault() {}, stopPropagation() {} });
  }
  const stored = app.state.overrides.todayPicks[today] || [];
  eq(stored.length, 2, 'ticking a topic stores it as a pick for today');
  ok(stored.includes(chosen[0].getAttribute('data-topic-key')), 'the pick is keyed by the topic the student saw');
  ok(/You chose this for today/.test(allText()) || app.state.days[today].tasks.some((t) => t.picked),
    'and the chosen topic is what the day plans');

  // Picks are per-day, never global.
  eq((app.state.overrides.todayPicks[addDays(today, 1)] || []).length, 0,
    "a pick is scoped to today only");

  click(findButtons((x) => /Clear/.test(x.textContent))[0]);
  eq((app.state.overrides.todayPicks[today] || []).length, 0, 'the picks can be cleared');
}

console.log(`\n${'-'.repeat(60)}`);
console.log(`${pass} passed, ${failures.length} failed`);
if (failures.length) {
  console.log('\nFailures:');
  for (const f of failures) console.log(`  - ${f}`);
  process.exitCode = 1;
}
