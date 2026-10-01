# Assumptions

Every assumption this planner makes, why it makes it, and what to do if it is
wrong. The same list is readable inside the app under **Assumptions**, and
everything in it is editable in **Settings** or fixable by logging honestly.

The dangerous thing a study planner can do is present a guess as a fact. This
file is the counterweight.

## 1. The syllabus — read this first

| | |
| --- | --- |
| **What the app uses** | `ioe-be-barch-2083-r1` — the IOE B.E./B.Arch. Class 12 list, 4 subjects, 20 chapters, 88 official topic bullets, 296 subtopics after splitting topics into their constituent parts. |
| **Why** | It is the most recent complete, citable version of the topic structure. |
| **Risk** | The **2084** entrance year's notice may revise the topic list, the mark split, or the paper pattern. The exact 2084 detail notice was not available when this was built. |
| **What to do** | Open <https://entrance.ioe.edu.np> and compare. Then paste the new notice into the **Compare against a baseline** box in Settings — it reports every topic that is missing, extra, or changed. |

Reference sources:

- <https://entrance.ioe.edu.np> — official Entrance Board of IOE, Pulchowk
- <https://www.pea.edu.np/content/uploads/2024/05/IOE-Entrance-New-Syllabus.pdf>
- <https://ioe-entrance.bibeksubedi0001.com.np/syllabus>

The mark split (140 total, 120 minutes, 10% negative marking) is reference
information for weighting. It does not change what the app schedules.

B.Arch-only content — Building Drawing & Design and the other B.Arch subjects —
is **opt-in**, so a B.E. student is never shown topics that are not on their
paper.

Two things the app will not guess about the B.Arch track:

| Item | What the app does | Why |
| --- | --- | --- |
| The Architecture mark split | Recorded as `marks: null` and shown as "marks not verified" / an em-dash. Never printed as `0`, and never used in a projection. Planning weight falls back to neutral `1.0`. | The B.Arch paper does carry marks for Architecture, but the split is not stated in any source I could cite. Showing `0` would read as "worth nothing", which is a false claim. `null` is the honest encoding of "unknown", and it is what the app states on screen. |
| Architecture MCQs | None. All 40 questions map to the four B.E. subjects, so Practice shows no Architecture row. | Writing questions would mean inventing exam-style content. If you add some, `tests/ui.test.js` section 5d fails deliberately so the row gets re-checked. |

## 2. Dates

| Assumption | Why | What to do |
| --- | --- | --- |
| Internal dates are Gregorian (A.D.), stored as `YYYY-MM-DD`. | An unverified B.S.–A.D. conversion table would silently shift every deadline. | Nothing. This is the safe choice. |
| The B.S. year is a display label only ("end of Chaitra 2083 B.S."). | Derived by subtracting roughly 57 years from the A.D. year. It is not used in planning. | Ignore it if it looks wrong; it changes no calculation. |
| The finish date is a *planning target*, not the exam date. | You want the syllabus covered, with revision, before the exam. | Edit it in Settings. |
| Default finish date `2027-04-13`, default entrance date `2027-04-25`. | Placeholders so the wizard and countdown have something to show. | Replace both on the first screen of the setup wizard. They are the two numbers that matter most. |

## 3. Time and scheduling

| Assumption | Value | Why | Change it |
| --- | --- | --- | --- |
| Buffer held back from every day | 10% | Illness, festivals, homework. The planner never schedules into it. | Settings → planner |
| Coaching day penalty | 35% of the day | A modelling choice, not a fact about you. | Use one-off day overrides in Settings instead |
| Minimum useful block | 15 min | A 5-minute task is not honest work. A day that cannot hold a block is left empty and the work moves. | Settings → planner |
| Maximum block | 60 min | Long enough to be deep, short enough to survive a bad day. | Settings → planner |
| Default daily study time | 150 min (2.5 h) | A realistic default, not a recommendation. | Settings → time |
| Subtopic time estimate | topic minutes split by size (core / standard / supporting) | A starting guess, not a measurement. | Corrected automatically by your real logs and difficulty ratings |
| Revision intervals | 1, 3, 8, 17, 30 days, stretched by performance | Standard spaced-repetition shape. | Settings → planner |

There is **no** hard-coded weekly timetable. The plan is derived from remaining
work × days left × available hours, so changing your available hours re-plans
everything from that day forward.

## 4. Progress and mastery

- **Completing content is a sequencing decision, not mastery.** Finishing a
  topic sets progress to 100% and unlocks the next chapter. It does not make the
  topic Strong.
- **Strong and Mastered require evidence.** Both need real MCQ accuracy and a
  recorded successful revision. A topic you merely read is "Studied once".
- **Accuracy is never invented.** The planner does not advance a synthetic
  accuracy during simulation. Only what you actually answer counts.
- **A wrong answer opens a mistake; only a correct re-solve closes it.** There
  is no "mark cleared" button, because a self-report is not evidence.
- **One slip does not erase earned mastery.** A wrong answer on a Strong or
  Mastered topic is recorded in the bank and brings the topic's revision
  forward, but it does not demote the label. Accuracy below 70% over 6+
  attempts is what moves a topic to Weak.
- **Difficulty ratings change future estimates.** "Too difficult" raises the time
  estimate and the priority. "Took longer than expected" raises the estimate
  toward what you actually spent.
- **Unlogged days are assumed missed.** The planner will not assume you studied
  something it has no record of. This is the single most important honesty rule
  in the app: an unlogged session is redistributed, not quietly assumed done.

## 5. School exams

- **The app will not guess your school exam dates.** Until you add them, Exam
  Mode is off and your normal daily target applies even during exams. Add them
  in Settings → Exams.
- **During an exam, new chapters pause.** Revision, practice, mistake-bank work
  and syllabus maintenance continue, scaled to a configurable share of the day.
- **After an exam, load is boosted** for a recovery window (default 14 days at
  +25%) so the backlog is absorbed rather than dumped on the last week.
- Exam Mode never deletes work. The remaining syllabus is redistributed across
  the days that are still available.

## 6. What the app cannot do

- It cannot know your real commitment. It will happily produce an impossible
  schedule if you tell it you have time you do not have.
- It cannot detect burnout. It can show that the plan is too full; only you can
  act on it.
- It cannot see the official notice change. That is what baseline comparison is
  for.
- It does not sync across devices. Data is per-browser `localStorage`; export
  JSON to move it.
- It is not affiliated with IOE.

## 7. Privacy

There is no analytics, no telemetry, and no network request of any kind. The app
is plain files served by a local Node server. Your progress never leaves your
machine, and clearing site data in the browser erases it — export a JSON backup
first if that would matter.
