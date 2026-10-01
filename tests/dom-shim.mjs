/**
 * A DOM shim just large enough to run the real view code headlessly.
 *
 * The UI is a large part of this app and cannot be left untested, but the
 * project is deliberately dependency-free, so jsdom is not an option. This
 * implements the handful of DOM APIs the views actually use, faithfully
 * enough that a typo or a bad property access fails here rather than silently
 * in a browser.
 *
 * It is a test harness, not a browser. It does not implement layout, CSS or
 * real event dispatch order.
 */

/* ------------------------------------------------------------------ */
/* Node                                                                */
/* ------------------------------------------------------------------ */

class ShimNode {
  constructor(type) {
    this.nodeType = type;
    this.childNodes = [];
    this.parentNode = null;
    this.listeners = new Map();
  }

  get firstChild() { return this.childNodes[0] || null; }
  get children() { return this.childNodes.filter((c) => c.nodeType === 1); }

  appendChild(child) {
    if (child.parentNode) child.parentNode.removeChild(child);
    child.parentNode = this;
    this.childNodes.push(child);
    return child;
  }

  append(...nodes) {
    for (const n of nodes.flat(4)) {
      if (n === null || n === undefined || n === false) continue;
      this.appendChild(typeof n === 'object' ? n : textNode(String(n)));
    }
  }

  replaceChildren(...nodes) {
    while (this.firstChild) this.removeChild(this.firstChild);
    this.append(...nodes);
  }

  removeChild(child) {
    const i = this.childNodes.indexOf(child);
    if (i >= 0) this.childNodes.splice(i, 1);
    child.parentNode = null;
    return child;
  }

  remove() { if (this.parentNode) this.parentNode.removeChild(this); }

  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(fn);
  }

  removeEventListener(type, fn) {
    const l = this.listeners.get(type) || [];
    const i = l.indexOf(fn);
    if (i >= 0) l.splice(i, 1);
  }

  /** Fire the registered handlers. Order is registration order. */
  dispatch(type, event = {}) {
    const ev = { type, target: this, preventDefault() {}, stopPropagation() {}, ...event };
    for (const fn of [...(this.listeners.get(type) || [])]) fn(ev);
    return ev;
  }

  /** First descendant matching a simple selector (tag, .class, #id). */
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }

  querySelectorAll(sel) {
    const out = [];
    const wantClass = sel.startsWith('.');
    const wantId = sel.startsWith('#');
    const wantTag = !wantClass && !wantId ? sel.toUpperCase() : null;
    const walk = (n) => {
      for (const c of n.childNodes) {
        if (c.nodeType !== 1) continue;
        const classes = (c.className || '').split(/\s+/).filter(Boolean);
        const hit = wantClass
          ? classes.includes(sel.slice(1))
          : wantId
            ? c.id === sel.slice(1)
            : c.tagName === wantTag;
        if (hit) out.push(c);
        walk(c);
      }
    };
    walk(this);
    return out;
  }

  get textContent() {
    if (this.nodeType === 3) return this._text || '';
    return this.childNodes.map((c) => c.textContent).join('');
  }

  set textContent(v) {
    this.childNodes = [];
    if (v !== '') this.appendChild(textNode(String(v)));
  }

  /** Depth-first walk over every element in this subtree. */
  * walk() {
    for (const c of this.childNodes) {
      if (c.nodeType !== 1) continue;
      yield c;
      yield* c.walk();
    }
  }
}

class ShimText extends ShimNode {
  constructor(t) { super(3); this._text = t; }
}

class ShimElement extends ShimNode {
  constructor(tag) {
    super(1);
    this.tagName = String(tag).toUpperCase();
    this.attributes = new Map();
    this.className = '';
    this.id = '';
    this.style = { cssText: '' };
    this.dataset = {};
    this._value = '';
    this._checked = false;
    this._disabled = false;
    this._hidden = false;
    this.classList = {
      add: (...c) => { this.className = [...new Set([...this.className.split(/\s+/).filter(Boolean), ...c])].join(' '); },
      remove: (...c) => { this.className = this.className.split(/\s+/).filter((x) => x && !c.includes(x)).join(' '); },
      contains: (c) => this.className.split(/\s+/).includes(c),
      toggle: (c, on) => { if (on === undefined) { this.classList.contains(c) ? this.classList.remove(c) : this.classList.add(c); } else if (on) this.classList.add(c); else this.classList.remove(c); },
    };
  }

  setAttribute(k, v) {
    this.attributes.set(k, String(v));
    if (k === 'class') this.className = String(v);
    if (k === 'id') this.id = String(v);
    if (k === 'value') this._value = String(v);
    if (k === 'checked') this._checked = true;
  }

  getAttribute(k) { return this.attributes.has(k) ? this.attributes.get(k) : null; }
  hasAttribute(k) { return this.attributes.has(k); }
  removeAttribute(k) { this.attributes.delete(k); }

  get value() { return this._value; }
  set value(v) { this._value = String(v); }

  get checked() { return this._checked; }
  set checked(v) { this._checked = !!v; }

  get disabled() { return this._disabled; }
  set disabled(v) { this._disabled = !!v; }

  get hidden() { return this._hidden; }
  set hidden(v) { this._hidden = !!v; }

  get files() { return this._files || null; }
  set files(v) { this._files = v; }

  set innerHTML(v) { this.childNodes = []; this.appendChild(textNode(String(v))); }
  get innerHTML() { return this.textContent; }

  get scrollIntoView() { return () => {}; }
  focus() {}
  click() { this.dispatch('click'); }
}/* ------------------------------------------------------------------ */
/* Document + window                                                   */
/* ------------------------------------------------------------------ */

function textNode(t) { return new ShimText(t); }

const byId = new Map();
function stub(tag, id) {
  const n = new ShimElement(tag);
  if (id) { n.id = id; byId.set(id, n); }
  n.onclick = null;
  return n;
}

const documentElement = stub('html');
const head = stub('head');
const body = stub('body');
const docListeners = new Map();

// `window` is the global object in a browser; mirror that so view code that
// touches `window` behaves the same here.
if (!globalThis.window) globalThis.window = globalThis;
globalThis.addEventListener = (t, fn) => document.addEventListener(t, fn);
globalThis.removeEventListener = (t, fn) => document.removeEventListener(t, fn);

globalThis.document = {
  readyState: 'complete',
  documentElement,
  head,
  body,
  createElement: (tag) => new ShimElement(tag),
  createTextNode: (t) => textNode(String(t)),
  getElementById: (id) => byId.get(id) || null,
  querySelector: (sel) => documentElement.querySelector(sel),
  querySelectorAll: (sel) => documentElement.querySelectorAll(sel),
  addEventListener(type, fn) {
    if (!docListeners.has(type)) docListeners.set(type, []);
    docListeners.get(type).push(fn);
  },
  removeEventListener(type, fn) {
    const l = docListeners.get(type) || [];
    const i = l.indexOf(fn);
    if (i >= 0) l.splice(i, 1);
  },
  dispatch(type, ev) { for (const fn of [...(docListeners.get(type) || [])]) fn({ type, ...ev }); },
};

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
  key: (i) => [...store.keys()][i] ?? null,
  get length() { return store.size; },
};

let hash = '';
globalThis.location = {
  get hash() { return hash; },
  set hash(v) { hash = v; document.dispatch('hashchange'); },
  reload() { /* no-op in tests */ },
};

const confirmAnswers = [];
globalThis.confirm = () => (confirmAnswers.length ? confirmAnswers.shift() : true);
globalThis.alert = () => {};
// `navigator` is a read-only accessor on the Node global, so extend it.
if (!globalThis.navigator) Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true });
try { globalThis.navigator.clipboard = { writeText: async () => {} }; } catch { /* non-fatal */ }
globalThis.Blob = class { constructor(parts) { this.parts = parts; } };
// `Node` is used by src/util/dom.js for its instanceof checks.
globalThis.Node = ShimNode;
globalThis.URL = {
  createObjectURL: () => 'blob:mock',
  revokeObjectURL: () => {},
};

/* ------------------------------------------------------------------ */
/* Test helpers                                                        */
/* ------------------------------------------------------------------ */

/** Register the elements index.html provides. */
export function installDocument() {
  for (const [tag, id] of [
    ['header', 'topbar'], ['nav', 'tabs'], ['div', 'banner'],
    ['main', 'view'], ['footer', 'footer'], ['div', 'modal'],
    ['span', 'riskPill'], ['span', 'countdown'], ['span', 'brandSub'],
    ['span', 'footVersion'],
  ]) {
    if (!byId.has(id)) byId.set(id, stub(tag, id));
  }
  // The modal body is created dynamically; provide a stable hook.
  return byId;
}

export const nodes = byId;
export { ShimElement, ShimText, textNode, confirmAnswers };
export function node(tag) { return new ShimElement(tag); }
