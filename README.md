# IOE 2084 Study Planner

> **Syllabus data is the official 2083 syllabus.** The 2084 notice was not
> available when this was built, so nothing here has been invented to fill the
> gap. Check [Assumptions & sources](ASSUMPTIONS.md) before trusting any topic
> list. Everything you enter stays in your own browser.

An adaptive study planner for the IOE B.E./B.Arch. entrance exam. It schedules
your syllabus, tells you honestly whether you can finish in time, adapts when
you miss days or gain a topic, and never pretends that reading something once
means you have mastered it.

No accounts. No server. No build step. No network calls. No external AI
service. Everything the planner knows is in this folder.

## Run it

```bash
npm start          # http://127.0.0.1:5173
```

Any static server works — `python -m http.server`, VS Code Live Server, or
opening the files through a local server. Do **not** open `index.html` with a
`file://` URL: the app uses native ES modules, which browsers refuse to load
from the filesystem.

```bash
npm test           # engine suite + UI suite (1029 assertions)
npm run test:engine
npm run test:ui
npm run validate   # syllabus database self-check
```

There is a third suite that needs a real browser, so it is not part of
`npm test`:

```bash
npm start                                    # in one terminal
edge --headless=new --remote-debugging-port=9222   # in another
npm run test:browser                         # 95 assertions
```

`tests/browser.test.js` drives the app over the DevTools protocol: it finishes
the wizard from scratch, visits every route, logs a session, answers a question,
reloads the page, and fails on any console error. It is the check that catches
what a DOM shim cannot — real stylesheets, real layout, real `localStorage`.

Run it against a **fresh browser profile**. It does not clear `localStorage`
itself, so a profile that already holds planner state will fail the first-run
wizard checks.

There are no dependencies to install. `npm install` is not required, and there
is no lockfile because there is nothing to lock.

## What it actually does

**The plan is derived, never stored.** There is no hard-coded
Monday-to-Sunday timetable. On every state change the planner walks forward
from today to your deadline and rebuilds the schedule from remaining work,
days left, available hours, chapter difficulty, revision due dates, missed
sessions, school exams and MCQ accuracy. A stored schedule could drift out of
sync with reality; a derived one cannot.

**It simulates as it plans.** When the planner emits a learn task for a topic,
its internal ledger advances that topic's progress and books the topic's next
revision date. The next day is therefore planned from a realistic future state,
not a frozen snapshot. Without this, the planner would re-pick the same
highest-scoring topic forever.

**It reports shortfalls instead of lying.** Tasks never exceed the minutes
actually available on a day. If the work will not fit before your deadline, the
dashboard says so with the arithmetic shown. A planner that dumps a six-hour
backlog on one day is not planning, it is pretending.

**You choose the day, or you let it be chosen for you.** Ranking by urgency is
a good default, but it means the same few chapters keep winning, which is no use
if you need something specific today. Today's Plan has a **What to study** card
with three options:

- **Planner's choice** — the existing urgency ranking.
- **Random** — still-needed topics are drawn at random for that day, so the day
  is not always the same chapters. The draw is seeded by the date, so it cannot
  reshuffle under you mid-session, and **Shuffle again** re-draws it.
- **My picks** — tick the exact topics you want. They are scheduled first, in
  the order you ticked them, and no unrequested chapter is added alongside them.

Picks are scoped to the single date you made them on. Nothing about picking a
topic for today changes any other day. Your chapters get first claim on the
day's minutes; practice only takes what is genuinely left over. Picking three
chapters from one subject is fine — the per-subject cap that stops the
automatic choice from proposing the same subject all day does not apply to a
chapter you chose yourself. Due revisions, practice and mistake-bank work still
appear, because those are outstanding obligations rather than new reading.

The day also reports what it is doing. The picks card shows how many of your
topics it expects to finish today, and a chapter task shows `4 of 7 subtopics
done`, because a chapter is split into subtopics and one block often leaves
some of them untouched. A chapter that is genuinely finished is marked complete
rather than being left stranded at 98%; if a pick cannot fit in the day's time,
the plan names it rather than quietly dropping it.

**Time estimates start as guesses and get corrected.** A subtopic's estimate
comes from its topic's size and difficulty, and every real session updates it:
"took longer than expected" raises the estimate, "too difficult" raises both the
estimate and the priority, "finished early" lowers it.

**Mastery requires evidence.** Completing content sets progress to 100% and
unlocks the next chapter, because sequencing is a planning decision. It does not
make a topic Strong. Strong and Mastered require real MCQ results and a recorded
successful revision — see `evaluateMastery()` in `src/core/planner.js`.

**Accuracy is never invented.** During simulation the planner deliberately does
not advance a synthetic MCQ accuracy, because a plan built on invented
competence is worthless. Only what you actually answer counts.

**A mistake is cleared only by answering it correctly.** There is no "mark
cleared" button. That is deliberate: a self-report is not evidence. A wrong
answer opens an entry in the Mistake Bank, and only a correct re-solve closes
it. One slip does not erase mastery you earned, but it does bring the topic
back sooner.

**Undoing a log undoes the progress too.** Each logged session stores a snapshot
of the records it touched, so "Undo all logs on this day" restores your real
progress instead of just deleting the log line.

## The views

| View | What it is for |
| --- | --- |
| Dashboard | Risk verdict, countdown, required daily pace, what to work on next |
| Today's Plan | The day's blocks, logging outcomes, unlogged sessions from the past, **Start tomorrow instead** — one click blocks today and shifts its work on, with an undo — and **What to study**: hand-pick your own chapters, or ask for a randomised day |
| Syllabus | Per-subtopic status, your time and difficulty estimates, pin and skip, chapter ETAs |
| Calendar | Month grid of load and phase; spots runs of empty days and walls of exam-period days |
| Practice | 40 syllabus-mapped MCQs, by due-for-revision set, weak topics, chapter, or subject |
| Mistake Bank | Everything you got wrong, and the re-solve that clears it |
| Progress | Status distribution, per-subject feasibility, chapter completion forecast, adherence |
| Settings | Deadlines, daily hours, coaching, school exams, validation, import/export |
| Assumptions | Every assumption the app makes, and what to do if it is wrong |

## Data

State lives in `localStorage` under `ioe-planner:state`, schema 3. Export JSON
from Settings to back it up or move it to another browser. Import validates the
file and refuses anything that is not planner data, so a wrong file can never be
mistaken for an empty one that would wipe your progress.

Records for the optional B.Arch track are preserved even while that track is
switched off, so toggling the option never destroys real progress.

The Architecture subject's **mark split is unverified** — the B.Arch paper does
carry marks for it, but no citable source states the number. It is stored as
`marks: null` and rendered as "marks not verified" or an em-dash, never as `0`,
and it never feeds a projection. Practice has no Architecture row because all 40
questions map to the four B.E. subjects. See `ASSUMPTIONS.md` §1.

## Layout

```
index.html            app shell
styles.css            all styling
serve.js              zero-dependency static server
data/
  syllabus.js         88 official topic bullets, 20 units, 4 subjects
  questions.js        40 mapped MCQs with worked explanations
src/
  app.js              state wiring, router, render loop, modals
  core/
    store.js          schema-3 persistence, migrations, import/export
    model.js          subtopic derivation, indexing, coverage, unit stats
    revision.js       performance-based spaced repetition
    feasibility.js    capacity, required pace, risk, projected finish
    examMode.js       terminal exam suppression and recovery planning
    planner.js        the simulation planner, logging, mastery
    validate.js       syllabus database and external-baseline checks
  ui/                 one module per view
  util/               DOM helpers, date helpers
tests/
  engine.test.js      808 assertions, no DOM required
  ui.test.js          221 assertions, renders every view for real
  dom-shim.mjs        minimal DOM so the UI can be tested headless
  browser.test.js     95 assertions, drives real headless Edge
```

## Honest limitations

- The bundled syllabus is the **2083** IOE B.E./B.Arch. list, version
  `ioe-be-barch-2083-r1`. The 2084 notice may differ. Verify the topic list, and
  use the baseline comparison in Settings to check it — see
  [ASSUMPTIONS.md](ASSUMPTIONS.md).
- The app cannot know your real commitment. Tell it you have time you do not
  have and it will produce an impossible schedule; the feasibility check is
  arithmetic, not a promise.
- It cannot detect burnout. It can point out that the plan is too full; only you
  can act on that.
- It does not sync across devices. Export JSON to move your data.
- It is not affiliated with IOE. Subject and marks data is public information
  used for planning.

## A layout trap worth knowing about

`body` is a **column flex container**, so it must never be given a definite
`height`. Doing so makes it a fixed box, and on any page taller than the window
the flex algorithm shrinks the chrome around `main` — which collapsed the tab bar
to 1px and left every link unclickable, stranding the user with no way off the
page. `body` therefore uses `min-height: 100dvh` (never `height`), and the
sticky chrome (`.topbar`, `.tabs`, `.footer`) carries `flex-shrink: 0` as a
second line of defence.

This is invisible to the DOM shim, which has no layout engine, so it is guarded
by `tests/browser.test.js` section 3b, which measures the real rendered box at
three window sizes. Each non-dashboard view also carries its own `← Dashboard`
link, so the tab bar is a convenience rather than the only way home.
