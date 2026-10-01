/**
 * App core: state wiring, routing, and the shared render loop.
 *
 * There is no framework. Views are functions that return a DOM node; the
 * router swaps them into #view. Every state change goes through `update()`,
 * which persists, regenerates the plan, and re-renders the active view. The
 * plan is therefore never stale — it is always derived, never stored.
 */

import * as store from './core/store.js';
import { buildIndex, coverage, subjectCoverage } from './core/model.js';
import { allSubjectGroups, SYLLABUS_META, SYLLABUS_VERSION } from '../data/syllabus.js';
import { generatePlan, commitPlan, chapterIntelligence, logTask, undoSessions, recordAnswer, evaluateMastery, OUTCOMES } from './core/planner.js';
import { assess, availableMinutesFor, subjectFeasibility } from './core/feasibility.js';
import { examContext, isExamModeActive, upcomingExams, PHASE } from './core/examMode.js';
import { todayISO, diffDays, fmtMinutes, fmtDate, addDays } from './util/dates.js';
import { el, clear } from './util/dom.js';

import { renderSetup } from './ui/setup.js';
import { renderDashboard } from './ui/dashboard.js';
import { renderToday } from './ui/today.js';
import { renderSyllabus } from './ui/syllabus.js';
import { renderCalendar } from './ui/calendar.js';
import { renderPractice } from './ui/practice.js';
import { renderMistakes } from './ui/mistakes.js';
import { renderProgress } from './ui/progress.js';
import { renderSettings } from './ui/settings.js';
import { renderAssumptions } from './ui/assumptions.js';

/* ------------------------------------------------------------------ */
/* App state                                                           */
/* ------------------------------------------------------------------ */

export const app = {
  state: null,
  index: null,
  plan: null,
  assessment: null,
  chapters: [],
  route: { name: 'dashboard', params: {} },
  /** Per-view scratch space, e.g. the in-progress MCQ session. */
  scratch: {},
};

const ROUTES = [
  { name: 'dashboard', title: 'Dashboard', render: renderDashboard },
  { name: 'today', title: "Today's Plan", render: renderToday },
  { name: 'syllabus', title: 'Syllabus', render: renderSyllabus },
  { name: 'calendar', title: 'Calendar', render: renderCalendar },
  { name: 'practice', title: 'Practice', render: renderPractice },
  { name: 'mistakes', title: 'Mistake Bank', render: renderMistakes, badge: (a) => (a.state.mistakes || []).filter((m) => !m.resolved).length },
  { name: 'progress', title: 'Progress', render: renderProgress },
  { name: 'settings', title: 'Settings', render: renderSettings },
  { name: 'assumptions', title: 'Assumptions', render: renderAssumptions, hidden: true },
];

/* ------------------------------------------------------------------ */
/* Derivation                                                          */
/* ------------------------------------------------------------------ */

/** Recompute everything derived from state. Never cached across changes. */
export function recompute() {
  const st = app.state;
  app.index = buildIndex(allSubjectGroups(!!st.settings.includeBArch));
  app.plan = generatePlan(st, app.index);
  app.assessment = assess(st, app.index);
  app.chapters = chapterIntelligence(st, app.index, app.plan);
  // Mirror the projection into state.days for today onwards. Past days keep
  // whatever was committed when they were still in the future, and logged
  // sessions are never touched, so the record of what you did stays intact.
  commitPlan(st, app.plan);
}

/**
 * Apply a mutation, persist, and re-render.
 * `opts.keepScratch` lets a view hold transient UI state (an open question).
 */
export function update(mutator, opts = {}) {
  const result = typeof mutator === 'function' ? mutator(app.state) : undefined;
  recompute();
  store.save(app.state);
  // Clear transient UI state BEFORE rendering, so the view is rendered with the
  // scratch it is actually going to have. Doing it afterwards leaves the view
  // showing state that no longer exists, and the next render silently collapses
  // whatever the user had open.
  if (!opts.keepScratch && !opts.keep) app.scratch = {};
  render();
  return result;
}

export function commitAndRender() {
  recompute();
  store.save(app.state);
  render();
}

/* ------------------------------------------------------------------ */
/* Router                                                              */
/* ------------------------------------------------------------------ */

export function parseHash() {
  const raw = (location.hash || '').replace(/^#\/?/, '');
  const [name, ...rest] = raw.split('/');
  const route = ROUTES.find((r) => r.name === name) || ROUTES[0];
  const params = {};
  if (route.name === 'syllabus') {
    params.subject = rest[0] || null;
    params.unit = rest[1] || null;
  }
  if (route.name === 'today') params.date = rest[0] || null;
  if (route.name === 'calendar') params.month = rest[0] || null;
  if (route.name === 'practice') params.set = rest[0] || null;
  return { name: route.name, params };
}

export function go(hash) {
  if (location.hash === hash) render();
  else location.hash = hash;
}

function renderTabs() {
  const nav = document.getElementById('tabs');
  clear(nav);
  for (const r of ROUTES) {
    if (r.hidden) continue;
    const a = el('a', { href: `#/${r.name}` });
    a.textContent = r.title;
    if (r.name === app.route.name) a.setAttribute('aria-current', 'page');
    const n = r.badge ? r.badge(app) : 0;
    if (n > 0) {
      const b = el('span', { class: 'tab-count' });
      b.textContent = String(n);
      a.append(' ', b);
    }
    nav.append(a);
  }
}

function renderChrome() {
  const st = app.state;
  const a = app.assessment;
  const daysLeft = diffDays(todayISO(), st.settings.deadline);

  const risk = document.getElementById('riskPill');
  risk.dataset.level = a.level;
  risk.textContent = {
    on_track: 'On track', tight: 'Tight', high: 'High risk', impossible: 'Not possible', done: 'Syllabus done',
  }[a.level] || a.level;
  risk.title = a.message;

  const cd = document.getElementById('countdown');
  cd.textContent = daysLeft < 0
    ? `${Math.abs(daysLeft)}d past`
    : daysLeft === 0 ? 'Deadline is today' : `${daysLeft}d left`;

  document.getElementById('brandSub').textContent =
    `Class 12 · ${SYLLABUS_META.paperName || 'B.E. / B.Arch.'}${st.settings.includeBArch ? ' (B.Arch. included)' : ''}`;

  document.getElementById('footVersion').textContent = `Syllabus ${SYLLABUS_VERSION}`;

  // Banner: the most important thing the user should know right now.
  const banner = document.getElementById('banner');
  clear(banner);
  const msg = bannerMessage(a, daysLeft);
  if (msg) {
    banner.hidden = false;
    banner.dataset.kind = msg.kind;
    banner.append(el('b', {}, msg.title), ' ', msg.body);
    if (msg.action) {
      banner.append(' ');
      const btn = el('button', { class: 'sm' }, msg.action.label);
      btn.addEventListener('click', msg.action.run);
      banner.append(btn);
    }
  } else {
    banner.hidden = true;
  }
}

function bannerMessage(a, daysLeft) {
  const st = app.state;
  if (daysLeft < 0) {
    return {
      kind: 'danger',
      title: 'Your deadline has passed.',
      body: 'Pick a new target date in Settings so the planner can project an honest schedule again.',
      action: { label: 'Open Settings', run: () => go('#/settings') },
    };
  }
  if (st.setupDone !== true) return null;
  if (a.level === 'impossible' || a.level === 'high') {
    return { kind: 'danger', title: a.message, body: '' };
  }
  if (isExamModeActive(st)) {
    const ctx = examContext(st, todayISO());
    return { kind: 'info', title: ctx.note || 'Exam Mode is active.', body: 'IOE work is limited to revision and practice until your school exam ends.' };
  }
  if (a.level === 'tight') {
    return { kind: 'info', title: a.message, body: '' };
  }
  return null;
}

function render() {
  if (!app.state) return;
  const inWizard = app.state.setupDone !== true;

  if (inWizard) {
    // The wizard replaces the whole app until it is finished.
    document.getElementById('tabs').hidden = true;
    document.getElementById('banner').hidden = true;
    document.getElementById('brandSub').textContent = 'First-time setup';
    document.getElementById('riskPill').hidden = true;
    document.getElementById('countdown').textContent = 'Not configured';
    document.getElementById('footVersion').textContent = `Syllabus ${SYLLABUS_VERSION}`;
    const host = document.getElementById('view');
    clear(host);
    let node;
    try {
      node = renderSetup(app);
    } catch (err) {
      console.error(err);
      node = el('div', { class: 'card' },
        el('h2', {}, 'Setup could not be rendered'),
        el('p', { class: 'muted small' }, String(err && err.message ? err.message : err)));
    }
    if (node) host.append(node);
    return;
  }

  document.getElementById('tabs').hidden = false;
  document.getElementById('riskPill').hidden = false;

  renderTabs();
  renderChrome();
  const route = ROUTES.find((r) => r.name === app.route.name) || ROUTES[0];
  const host = document.getElementById('view');
  clear(host);
  // A permanent way home on every view except the dashboard itself. The tab bar
  // is the primary navigation, but it is chrome above the content: on a short
  // window, or if it ever fails to render again, the user must still be able to
  // get back to the dashboard.
  if (route.name !== 'dashboard') {
    host.append(el('nav', { class: 'crumbs', 'aria-label': 'Breadcrumb' },
      el('a', { class: 'crumb', href: '#/dashboard' }, '← Dashboard')));
  }
  let node;
  try {
    node = route.render(app);
  } catch (err) {
    console.error(err);
    node = el('div', { class: 'card' },
      el('h2', {}, 'This view could not be rendered'),
      el('p', { class: 'muted small' }, String(err && err.message ? err.message : err)),
      el('p', { class: 'muted small' }, 'Your saved data is untouched.'),
    );
  }
  if (node) host.append(node);
  host.focus({ preventScroll: true });
}

/* ------------------------------------------------------------------ */
/* Engine helpers re-exported for the views                            */
/* ------------------------------------------------------------------ */

export {
  fmtMinutes, fmtDate, todayISO, diffDays, addDays, store, OUTCOMES,
  evaluateMastery, logTask, undoSessions, recordAnswer,
  availableMinutesFor, subjectCoverage, coverage, commitPlan,
  subjectFeasibility, upcomingExams, PHASE,
};

/* ------------------------------------------------------------------ */
/* Modal                                                               */
/* ------------------------------------------------------------------ */

export function openModal(title, buildBody, footerButtons = []) {
  const modal = document.getElementById('modal');
  clear(modal);
  const box = el('div', { class: 'modal-box', role: 'dialog', 'aria-modal': 'true' });
  const head = el('div', { class: 'modal-head' }, el('h2', {}, title));
  const x = el('button', { class: 'ghost sm', 'aria-label': 'Close' }, '✕');
  x.addEventListener('click', closeModal);
  head.append(x);
  const body = el('div', { class: 'modal-body' });
  buildBody(body, closeModal);
  box.append(head, body);
  if (footerButtons.length) {
    const foot = el('div', { class: 'modal-foot' });
    for (const b of footerButtons) {
      const btn = el('button', { class: b.primary ? 'primary' : '' }, b.label);
      btn.addEventListener('click', () => b.run(closeModal, body));
      foot.append(btn);
    }
    box.append(foot);
  }
  modal.append(box);
  modal.hidden = false;
  modal.onclick = (e) => { if (e.target === modal) closeModal(); };
  document.addEventListener('keydown', escClose);
}

export function closeModal() {
  const modal = document.getElementById('modal');
  modal.hidden = true;
  clear(modal);
  modal.onclick = null;
  document.removeEventListener('keydown', escClose);
}

function escClose(e) { if (e.key === 'Escape') closeModal(); }

/* ------------------------------------------------------------------ */
/* Shared helpers used by several views                                */
/* ------------------------------------------------------------------ */

export function barRow(pct, tone = '') {
  return el('div', { class: 'bar-row' },
    el('div', { class: `bar ${tone}` }, el('i', { style: `width:${Math.max(0, Math.min(100, pct))}%` })),
    el('span', { class: 'pct' }, `${Math.round(pct)}%`),
  );
}

export function statCard(k, v, d, tone) {
  return el('div', { class: 'card stat' },
    el('span', { class: 'k' }, k),
    el('span', { class: 'v', style: tone ? `color:var(--${tone})` : null }, v),
    d ? el('span', { class: 'd' }, d) : null,
  );
}

export function card(title, ...children) {
  const c = el('div', { class: 'card' });
  if (title) c.append(el('h2', {}, title));
  for (const ch of children) if (ch) c.append(ch);
  return c;
}

export function emptyState(title, body) {
  return el('div', { class: 'empty' }, el('b', {}, title), body ? el('span', {}, body) : null);
}

export function todayTasks(dateISO) {
  const day = app.plan?.plan?.[dateISO];
  return day ? day.tasks : [];
}

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

function boot() {
  const restored = store.load();
  if (!restored) {
    // First run: a clean state, and the setup wizard takes over.
    app.state = store.defaultState();
    app.route = { name: 'dashboard', params: {} };
  } else {
    app.state = restored;
    app.route = parseHash();
  }
  recompute();

  // If setup has not been finished, the wizard is the only route allowed.
  if (app.state.setupDone !== true) app.route = { name: 'dashboard', params: {} };

  window.addEventListener('hashchange', () => {
    if (app.state.setupDone !== true) { render(); return; }
    app.route = parseHash();
    render();
    document.getElementById('view').scrollIntoView({ block: 'start' });
  });

  window.addEventListener('keydown', (e) => {
    if (e.target.matches('input, textarea, select')) return;
    if (e.key >= '1' && e.key <= '8') {
      const r = ROUTES.filter((x) => !x.hidden)[Number(e.key) - 1];
      if (r) go(`#/${r.name}`);
    }
  });

  render();

  if (app.state.setupDone !== true) {
    // The setup view renders into #view; make sure it knows it is the wizard.
    app.state.__wizard = true;
    render();
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();

