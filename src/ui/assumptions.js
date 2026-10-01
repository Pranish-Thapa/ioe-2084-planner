/**
 * Assumptions & sources — the honesty page.
 *
 * The single most dangerous thing a study planner can do is present a guess as
 * a fact. Everything the app assumes, and where it came from, is listed here in
 * plain language so it can be checked and corrected.
 */

import { el } from '../util/dom.js';
import { SYLLABUS_META, SYLLABUS_VERSION, SUBJECTS } from '../../data/syllabus.js';
import { approxBSYear } from '../util/dates.js';


export function renderAssumptions(a) {
  const wrap = el('div', { class: 'stack' });
  const h = el('div', { class: 'page-head' });
  h.append(el('h1', {}, 'Assumptions & sources'));
  h.append(el('p', { class: 'sub' },
    'What this app believes, why, and what to do if it is wrong. Nothing here is hidden in the code.'));
  wrap.append(h);

  // The most important caveat, first and unmissable.
  const warn = el('div', { class: 'card', style: 'border-color:var(--high)' });
  warn.append(el('h2', {}, 'The one thing to check first'));
  warn.append(el('p', {},
    el('b', {}, 'The syllabus in this app is the IOE B.E./B.Arch. Class 12 list, version ' + SYLLABUS_VERSION + '.'),
    ' The "2084" entrance year and an "end of Chaitra 2083" finish date are not the same moment, and the ' +
    'official notice for a future year may not have been published yet when this was built. ' +
    'Verify the topic list against the notice on the official IOE site before relying on it.'));
  const row = el('div', { class: 'btn-row' });
  for (const s of (SYLLABUS_META.sources || [])) {
    const link = el('a', { class: 'btn sm', href: s.url, target: '_blank', rel: 'noreferrer noopener' },
      s.label || s.url);
    row.append(link);
  }
  row.append(el('a', { class: 'btn sm primary', href: '#/settings' }, 'Verify against a pasted baseline'));
  warn.append(row);
  wrap.append(warn);

  wrap.append(section('Dates', [
    ['Internal calendar is Gregorian (A.D.)', 'All dates are stored as YYYY-MM-DD in the Gregorian calendar. The app does not ship a B.S.–A.D. conversion table, because an unverified one would silently shift every deadline.'],
    ['B.S. year is display-only and approximate', `"end of Chaitra 2083" is shown by subtracting roughly 57 years from the A.D. year (currently ≈ ${approxBSYear(2081)}). This is a label, not a calculation used for planning.`],
    ['The finish date is a planning target', 'It is the day you want the whole syllabus covered, including revision. It is not the entrance date. Both are editable in Settings.'],
    ['Entrance date defaults to an assumption', 'The default entrance date is a placeholder so the countdown has something to show. Check it against the official notice.'],
  ]));

  wrap.append(section('Syllabus', [
    ['Scope', `${SUBJECTS.length} subjects, ${a.index.units.length} chapters, ${a.index.topics.length} topics, ${a.index.items.length} subtopics after splitting topics into their constituent parts.`],
    ['Marks are reference only', 'Subject marks are shown for weighting decisions. They do not change what the app plans.'],
    ['B.Arch topics are opt-in', 'Building Drawing & Design and other B.Arch-only content is hidden unless you enable it, so a B.E. student is never shown topics that are not on their paper.'],
    ['Subtopic estimates are heuristic', 'Each subtopic gets a share of its topic based on size (core / standard / supporting). These are starting guesses, corrected by your own difficulty ratings and real timings.'],
    ['The validator is the safety net', `runValidation() checks the database against itself on every load: every unit has items, every topic maps to a subtopic, no empty subjects, and all ${a.index.items.length} questions map to a real subtopic.`],
  ]));

  wrap.append(section('Time and scheduling', [
    ['The buffer is real time you do not study', `${a.state.settings.bufferPct}% is held back for illness, festivals and homework. The planner never schedules into it.`],
    ['Coaching reduces available time', 'A coaching day loses 35% of the day. This is a modelling choice, not a fact about you — change it by using one-off day overrides in Settings.'],
    ['Exam Mode needs your exam dates', 'The app will not guess when your school exams are. Until you add them, Exam Mode is off and your normal daily target applies even during exams.'],
    ['A day below the minimum block size is left alone', `If a day cannot hold a block of ${a.state.settings.minTaskMinutes} minutes, nothing is scheduled and the work moves elsewhere. Token 5-minute tasks are not honest.`],
    ['No timetable is hard-coded', 'The plan is derived from remaining work, days left and available time. There is no Monday-to-Sunday template, so changing your available hours re-plans everything.'],
  ]));

  wrap.append(section('Progress and mastery', [
    ['Studying something is not mastering it', 'Finishing content sets progress to 100% and unlocks the next chapter, because sequencing is a planning decision. It does NOT make a topic Strong.'],
    ['Strong and Mastered need evidence', 'Both require real MCQ results and a recorded revision. A topic you merely read is "Studied once", whatever it feels like.'],
    ['Accuracy is never invented', 'Practice records what you answer. The planner deliberately does not advance a synthetic accuracy during simulation, because a plan built on invented competence is worthless.'],
    ['Difficulty ratings change future estimates', 'Marking something "Too difficult" raises its time estimate and its priority, so the next plan is more realistic rather than repeating the same mistake.'],
    ['Revision stretches and compresses', 'Successful revisions lengthen the next interval; failures shorten it to one day and mark the topic weak.'],
  ]));

  wrap.append(section('What this app cannot do', [
    ['It cannot know your real commitment', 'It will happily produce an impossible schedule if you tell it you have time you do not have. The feasibility check is arithmetic, not a promise.'],
    ['It cannot detect burnout', 'It can suggest reducing load, but only you can say the plan is too much.'],
    ['It cannot see the official notice change', 'That is what the baseline comparison in Settings is for. Paste the new notice and any missing topic is reported.'],
    ['It does not sync across devices', 'Data is per-browser localStorage. Export JSON to move it.'],
    ['It is not affiliated with IOE', 'Independent study tool. The marks and subject structure are public information used for planning.'],
  ]));

  const c = el('div', { class: 'card' });
  c.append(el('h2', {}, 'Built with'));
  c.append(el('p', { class: 'small muted' },
    'Plain HTML, native ES modules and CSS. No frameworks, no build step, no network calls, no external AI services. ',
    'Everything the planner knows is in this folder.'));
  const back = el('a', { class: 'btn sm', href: '#/dashboard' }, 'Back to Dashboard');
  c.append(back);
  wrap.append(c);
  return wrap;
}

function section(title, rows) {
  const c = el('div', { class: 'card' });
  c.append(el('h2', {}, title));
  const t = el('table');
  const tb = el('tbody');
  for (const [k, v] of rows) {
    tb.append(el('tr', {},
      el('td', { style: 'width:34%;font-weight:550;vertical-align:top' }, k),
      el('td', { class: 'muted' }, v)));
  }
  t.append(tb);
  c.append(t);
  return c;
}
