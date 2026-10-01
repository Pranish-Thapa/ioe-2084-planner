/**
 * Persistence layer.
 * ---------------------------------------------------------------------------
 * v1 uses localStorage (synchronous, simple, survives refresh).
 * The repository interface is intentionally narrow:
 *      load() -> state        save(state)        export() -> string
 *      import(json)           reset()            clear()
 * so swapping in IndexedDB or a REST backend later means replacing this file
 * only. No other module talks to localStorage directly.
 */

import { SYLLABUS_VERSION, allSubjectGroups } from '../../data/syllabus.js';
import { todayISO, addDays, approxBSYear, isValidISODate } from '../util/dates.js';
import { buildIndex } from './model.js';

const KEY = 'ioe-planner:state';
const SCHEMA = 3; // bump + add a migrate() step when the shape changes

export const STATUS = {
  NOT_STARTED: 'not_started',
  STUDYING: 'studying',
  STUDIED_ONCE: 'studied_once',
  NEEDS_REVISION: 'needs_revision',
  WEAK: 'weak',
  STRONG: 'strong',
  MASTERED: 'mastered',
};

export const STATUS_ORDER = [
  STATUS.NOT_STARTED,
  STATUS.STUDYING,
  STATUS.STUDIED_ONCE,
  STATUS.NEEDS_REVISION,
  STATUS.WEAK,
  STATUS.STRONG,
  STATUS.MASTERED,
];

export const STATUS_LABEL = {
  not_started: 'Not started',
  studying: 'Studying',
  studied_once: 'Studied once',
  needs_revision: 'Needs revision',
  weak: 'Weak',
  strong: 'Strong',
  mastered: 'Mastered',
};

/** Statuses that mean "the syllabus item has been covered at least once". */
export const COVERED = new Set([
  STATUS.STUDYING,
  STATUS.STUDIED_ONCE,
  STATUS.NEEDS_REVISION,
  STATUS.STRONG,
  STATUS.MASTERED,
]);

/** Statuses that require no further scheduled learning (only light maintenance). */
export const RESOLVED = new Set([STATUS.STRONG, STATUS.MASTERED]);

export function defaultSettings() {
  const deadline = '2027-04-13'; // end of Chaitra 2083 B.S. — editable, see ASSUMPTIONS.md
  return {
    name: '',
    level: 'fresh', // fresh | some | advanced
    setupComplete: false,
    startDate: todayISO(),
    deadline,
    examDate: '2027-04-25', // application assumption, editable
    deadlineBsLabel: `Chaitra ${approxBSYear(2027)} B.S.`,

    // Time budget
    defaultDailyMinutes: 150,
    studyDays: [0, 1, 2, 3, 4, 5, 6], // 0=Sun .. 6=Sat
    weekendExtraMinutes: 90,
    preferredHours: [{ from: '06:30', to: '08:30' }, { from: '19:00', to: '21:00' }],
    coaching: {}, // { "1": "Class 16:00-18:00" }
    busyDays: {}, // { "2026-11-20": "Trip" }  — one-off low availability
    maxTaskMinutes: 60,
    minTaskMinutes: 15,
    bufferPct: 10, // keep 10% of each day free as slack

    // Weighting
    subjectWeight: { MATH: 1.25, PHY: 1.1, CHE: 1.0, ENG: 0.7 },
    includeBArch: false, // B.Arch-only topics are opt-in

    // Revision engine
    revisionIntervals: [1, 3, 8, 17, 30],
    revisionEnabled: true,
    // Fraction of a normal day kept for IOE maintenance during a school exam
    examModeIoeShare: 0.15,
    // Days after a school exam during which IOE workload is boosted to recover
    recoveryBoostPct: 25,
    recoveryDays: 14,

    // Practice
    mcqPerTopic: 12,
    mixedMcqSize: 20,

    // How new material is chosen for a day:
    //   auto    - the planner ranks topics by urgency and takes the best fit
    //   shuffle - it still respects due revisions and the daily budget, but
    //             picks among the still-needed topics at random, so a day is
    //             not always the same handful of chapters in the same order
    planStyle: 'auto',
  };
}

export function defaultState() {
  return {
    meta: {
      schema: SCHEMA,
      createdAt: new Date().toISOString(),
      syllabusVersion: SYLLABUS_VERSION,
      lastPlanAt: null,
      lastPlanKey: null,
    },
    settings: defaultSettings(),
    items: {}, // itemId -> progress record
    days: {}, // dateISO -> { availableMin, closed, tasks[], logged, actualMin }
    exams: [], // terminal / school exams
    tests: [], // practice test results
    mistakes: [], // mistake bank
    personal: [], // user-added personal tasks
    overrides: { pinnedItemIds: [], note: '', todayPicks: {}, shuffleNonce: {} },
    log: [], // planner decision log (redistributions, drops, recoveries)
  };
}

function blankItem() {
  return {
    status: STATUS.NOT_STARTED,
    progressPct: 0,
    estMinOverride: null,
    difficulty: null, // 1..5, user-settable
    minutesLearned: 0,
    lastStudied: null,
    revisionStage: 0,
    nextRevisionDue: null,
    lastRevisionScore: null,
    mcq: { att: 0, correct: 0, streak: 0, last: null },
    firstSeenAt: null,
    completedAt: null,
  };
}

/* ------------------------------------------------------------------ */
/* Load / migrate / save                                                */
/* ------------------------------------------------------------------ */

export function load() {
  let raw = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch (e) {
    console.warn('localStorage unavailable, running in memory only', e);
  }
  if (!raw) {
    const s = defaultState();
    seedItems(s);
    return s;
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    console.warn('Corrupt saved state, starting fresh (old data kept as backup)');
    try { localStorage.setItem(`${KEY}:corrupt:${Date.now()}`, raw); } catch {}
    const s = defaultState();
    seedItems(s);
    return s;
  }
  const s = migrate(parsed);
  seedItems(s);
  return s;
}

export function save(state) {
  state.meta.lastSavedAt = new Date().toISOString();
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch (e) {
    console.error('Save failed (quota?)', e);
    return false;
  }
}

export function exportJSON(state) {
  return JSON.stringify(state, null, 2);
}

/**
 * Read a state file. Returns null — never throws — when the text is not JSON
 * or not recognisably planner data, so a bad file can never be mistaken for an
 * empty (progress-wiping) import.
 */
export function importJSON(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const looksLikeState = (parsed.meta && typeof parsed.meta === 'object')
    || (parsed.settings && typeof parsed.settings === 'object')
    || (parsed.items && typeof parsed.items === 'object');
  if (!looksLikeState) return null;
  const s = migrate(parsed);
  seedItems(s);
  return s;
}

export function resetAll() {
  try { localStorage.removeItem(KEY); } catch {}
  const s = defaultState();
  seedItems(s);
  return s;
}

export function hasSavedData() {
  try { return !!localStorage.getItem(KEY); } catch { return false; }
}

function migrate(state) {
  const base = defaultState();
  const s = { ...base, ...state };
  s.meta = { ...base.meta, ...(state.meta || {}) };
  s.settings = { ...base.settings, ...(state.settings || {}) };
  s.settings.subjectWeight = {
    ...base.settings.subjectWeight,
    ...((state.settings || {}).subjectWeight || {}),
  };
  s.items = state.items || {};
  s.days = state.days || {};
  s.exams = state.exams || [];
  s.tests = state.tests || [];
  s.mistakes = state.mistakes || [];
  s.personal = state.personal || [];
  s.overrides = { ...base.overrides, ...(state.overrides || {}) };
  s.log = state.log || [];
  // `overrides.skippedDates` was a second, unreachable way to block a day: it
  // was read by the planner but nothing ever wrote it. Blocked days are
  // `settings.busyDays[date] === 0`. Fold any legacy values across so a
  // hand-edited export keeps working, then drop the dead field.
  if (Array.isArray((state.overrides || {}).skippedDates)) {
    for (const d of state.overrides.skippedDates) {
      if (isValidISODate(d) && s.settings.busyDays[d] === undefined) {
        s.settings.busyDays[d] = 0;
      }
    }
  }
  delete s.overrides.skippedDates;
  // v3 renamed trackBArch -> includeBArch; accept either so an older export
  // does not silently drop the B.Arch toggle.
  if (state.settings && 'trackBArch' in state.settings && !('includeBArch' in state.settings)) {
    s.settings.includeBArch = !!state.settings.trackBArch;
  }

  const from = (state.meta || {}).schema || 1;
  if (from < SCHEMA) {
    // v1->v2: personal tasks + overrides block
    // v2->v3: revision stage / nextRevisionDue moved onto the item record
    s.meta.schema = SCHEMA;
  }
  s.meta.syllabusVersion = SYLLABUS_VERSION;
  return s;
}

/** Create a progress record for every syllabus item, keeping existing data. */
function seedItems(state) {
  const idx = buildIndex(allSubjectGroups(state.settings.includeBArch));
  for (const item of idx.items) {
    const prev = state.items[item.id];
    state.items[item.id] = prev ? { ...blankItem(), ...prev, mcq: { ...blankItem().mcq, ...(prev.mcq || {}) } } : blankItem();
    if (!state.items[item.id].firstSeenAt) state.items[item.id].firstSeenAt = state.meta.createdAt;
  }
  // Drop records for items that are in no version of the syllabus. Records for
  // the optional B.Arch track are kept even while that track is switched off,
  // so toggling the option never silently destroys real progress.
  const known = new Set(buildIndex(allSubjectGroups(true)).items.map((i) => i.id));
  for (const id of Object.keys(state.items)) {
    if (!known.has(id)) delete state.items[id];
  }
}

/* ------------------------------------------------------------------ */
/* Item accessors                                                       */
/* ------------------------------------------------------------------ */

export function getItem(state, id) {
  if (!state.items[id]) state.items[id] = blankItem();
  return state.items[id];
}

export function setStatus(state, id, status) {
  const it = getItem(state, id);
  const was = it.status;
  it.status = status;
  if (status === STATUS.NOT_STARTED) {
    it.progressPct = 0;
    it.completedAt = null;
  }
  if (was !== status) {
    pushLog(state, 'status', `${id} → ${STATUS_LABEL[status]}`);
  }
  return it;
}

export function pushLog(state, kind, message, extra = {}) {
  state.log.unshift({ at: new Date().toISOString(), kind, message, ...extra });
  if (state.log.length > 400) state.log.length = 400;
}

export function uid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function blankDay() {
  return { availableMin: null, closed: false, closedReason: '', tasks: [], logged: false, actualMin: 0, note: '' };
}

export function getDay(state, dateISO) {
  if (!state.days[dateISO]) state.days[dateISO] = blankDay();
  const d = state.days[dateISO];
  if (!Array.isArray(d.tasks)) d.tasks = [];
  return d;
}

export function addDaysToScheduleHorizon(state) {
  // Convenience: used when the deadline is moved backwards.
  const cutoff = addDays(state.settings.deadline, -1);
  for (const [date, day] of Object.entries(state.days)) {
    if (date > cutoff) day.tasks = [];
  }
}
