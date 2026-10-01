/**
 * Real-browser smoke test. Drives the app in headless Edge over the DevTools
 * protocol so that anything the DOM shim cannot catch (CSS, focus, real
 * layout, real localStorage) still gets exercised.
 *
 *   node tests/browser.test.js            (expects `npm start` to be running)
 *
 * It is intentionally not part of `npm test`: it needs a browser and a server.
 */

const BASE = process.env.BASE || 'http://127.0.0.1:5173/';
const CDP = process.env.CDP || 'http://127.0.0.1:9222';

let pass = 0;
const failures = [];
const errors = [];
let currentSection = '';

function section(t) { currentSection = t; console.log(`\n${t}`); }
function ok(cond, msg) {
  if (cond) { pass++; console.log(`  PASS  ${msg}`); }
  else { failures.push(`${currentSection}: ${msg}`); console.log(`  FAIL  ${msg}`); }
}

/* --- minimal CDP client --------------------------------------------- */

async function newTarget(url) {
  const r = await fetch(`${CDP}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' });
  return r.json();
}

function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  const pending = new Map();
  const events = [];
  let id = 0;
  const ready = new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true });
    ws.addEventListener('error', rej, { once: true });
  });
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    } else if (msg.method) {
      events.push(msg);
      if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
        errors.push(msg.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
      }
      if (msg.method === 'Runtime.exceptionThrown') {
        errors.push(msg.params.exceptionDetails.text + ' ' +
          (msg.params.exceptionDetails.exception?.description || ''));
      }
    }
  });
  return {
    ready,
    events,
    send(method, params = {}) {
      const mid = ++id;
      return new Promise((resolve, reject) => {
        pending.set(mid, { resolve, reject });
        ws.send(JSON.stringify({ id: mid, method, params }));
      });
    },
    close() { ws.close(); },
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function evaluate(c, expression) {
  const r = await c.send('Runtime.evaluate', {
    expression: `(() => { ${expression} })()`,
    returnByValue: true,
    awaitPromise: true,
  });
  if (r.exceptionDetails) {
    throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  }
  return r.result.value;
}

/* --- run -------------------------------------------------------------- */

const target = await newTarget(BASE);
const c = connect(target.webSocketDebuggerUrl);
await c.ready;
await c.send('Runtime.enable');
await c.send('Page.enable');
await sleep(1500);

section('1. The app boots in a real browser');
{
  const t = await evaluate(c, 'return document.body.innerText;');
  ok(/Set up your planner/.test(t), 'the first-run wizard is shown');
  ok(/Last day to finish the whole syllabus/.test(t), 'step 1 is rendered');
  const styled = await evaluate(c, 'const h=document.querySelector("#view h1"); return h ? getComputedStyle(h).fontSize : null;');
  ok(!!styled && parseFloat(styled) > 16, `the stylesheet is applied (h1 = ${styled})`);
  const w = await evaluate(c, 'const el=document.querySelector("#view .card, #view form, #view .stack"); return el ? el.getBoundingClientRect().width : 0;');
  ok(w > 200, `the view has real layout width (${Math.round(w)}px)`);
}

section('2. The wizard completes and the dashboard appears');
{
  for (let i = 0; i < 4; i++) {
    await evaluate(c, `
      const b = [...document.querySelectorAll('button')].find((x) => /^Next/.test(x.textContent));
      if (b) b.click();
      return true;`);
    await sleep(200);
  }
  const review = await evaluate(c, 'return document.body.innerText;');
  ok(/Assumptions this app is making/.test(review), 'the review step is reached');
  await evaluate(c, `
    const b = [...document.querySelectorAll('button')].find((x) => /Start planning/.test(x.textContent));
    if (b) b.click();
    return true;`);
  await sleep(600);
  const t = await evaluate(c, 'return document.body.innerText;');
  ok(!/Set up your planner/.test(t), 'the wizard is gone');
  ok(/Dashboard|On track|Tight|High risk/.test(t), 'the dashboard is shown');
  ok(await evaluate(c, 'return !!document.getElementById("riskPill") && !document.getElementById("riskPill").hidden;'),
    'the risk pill is visible');
  ok(await evaluate(c, 'return document.querySelectorAll("#tabs a").length >= 8;'), 'the tabs are visible');
}

section('3. Every route renders in the browser without errors');
{
  for (const r of ['today', 'syllabus', 'calendar', 'practice', 'mistakes', 'progress', 'settings', 'assumptions', 'dashboard']) {
    await evaluate(c, `location.hash = "#/${r}"; return true;`);
    await sleep(350);
    const res = await evaluate(c, `
      const v = document.getElementById('view');
      return { text: v.innerText.length, err: /could not be rendered/i.test(v.innerText) };`);
    ok(res.text > 40, `${r} rendered ${res.text} chars`);
    ok(!res.err, `${r} did not hit the error boundary`);
  }
}

section('3b. The nav is really visible, not just present in the DOM');
{
  // Regression guard. A column flex body given `height: 100%` crushes its
  // siblings on any page taller than the window: the tab bar collapsed to 1px
  // and every link became unclickable, so there was no way off the page. The
  // DOM shim has no layout engine, so only a real browser can catch this.
  const sizes = [[754, 487], [390, 780], [1280, 500]];
  const routes = ['dashboard', 'calendar', 'settings', 'today'];
  for (const [w, h] of sizes) {
    await c.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 700 });
    for (const r of routes) {
      await evaluate(c, `location.hash = "#/${r}"; return true;`);
      await sleep(300);
      const m = await evaluate(c, `
        const n = document.getElementById('tabs');
        const box = n.getBoundingClientRect();
        const a = n.querySelector('a');
        const ab = a.getBoundingClientRect();
        return { nav: Math.round(box.height), client: n.clientHeight, link: Math.round(ab.height), top: Math.round(ab.top), vh: innerHeight };`);
      ok(m.nav >= 20 && m.client >= 20, `${w}x${h} #/${r}: tab bar is ${m.nav}px tall (needs 20px or more)`);
      ok(m.link >= 20, `${w}x${h} #/${r}: its links are ${m.link}px tall, so they can be clicked`);
      ok(m.top >= 0 && m.top < m.vh, `${w}x${h} #/${r}: the tab bar is inside the viewport (top ${m.top}px)`);
    }
  }
  await c.send('Emulation.clearDeviceMetricsOverride');
  await sleep(200);
}

section('3c. The "back to dashboard" link really navigates');
{
  for (const r of ['calendar', 'settings', 'today', 'practice']) {
    await evaluate(c, `location.hash = "#/${r}"; return true;`);
    await sleep(320);
    const found = await evaluate(c, `
      const a = [...document.querySelectorAll('#view a')].find((x) => x.getAttribute('href') === '#/dashboard');
      if (!a) return { ok: false };
      const box = a.getBoundingClientRect();
      a.click();
      return { ok: true, h: Math.round(box.height) };`);
    ok(found.ok, `#/${r} has a dashboard link`);
    ok(found.h >= 16, `#/${r} dashboard link is ${found.h}px tall and clickable`);
    await sleep(320);
    const at = await evaluate(c, 'return location.hash;');
    ok(at === '#/dashboard', `#/${r} -> clicked the link and landed on ${at}`);
  }
}

section('4. Logging a session updates the real UI');
{
  await evaluate(c, 'location.hash = "#/today"; return true;');
  await sleep(400);
  const before = await evaluate(c, 'return document.getElementById("view").innerText;');
  ok(/Done/.test(before), 'the day shows tasks with a Done action');
  await evaluate(c, `
    const b = [...document.querySelectorAll('#view button')].find((x) => x.textContent.trim() === 'Done');
    if (b) b.click();
    return true;`);
  await sleep(300);
  const modal = await evaluate(c, 'return { open: !document.getElementById("modal").hidden, t: document.getElementById("modal").innerText };');
  ok(modal.open, 'the log dialog opened');
  ok(/Minutes actually spent/.test(modal.t), 'the dialog is fully rendered');
  await evaluate(c, `
    const b = [...document.querySelectorAll('#modal button')].find((x) => /Save session/.test(x.textContent));
    if (b) b.click();
    return true;`);
  await sleep(500);
  const after = await evaluate(c, 'return document.getElementById("view").innerText;');
  ok(/Logged sessions/.test(after), 'the logged session is listed in the UI');
  ok(after !== before, 'the page changed after logging');
}

section('5. An MCQ answer records real state');
{
  await evaluate(c, 'location.hash = "#/practice"; return true;');
  await sleep(400);
  await evaluate(c, `
    const b = [...document.querySelectorAll('#view button')].find((x) => x.textContent.trim() === 'Practise');
    if (b) b.click();
    return true;`);
  await sleep(400);
  const q = await evaluate(c, 'return { opts: document.querySelectorAll("#view .mcq-option").length, t: document.getElementById("view").innerText };');
  ok(q.opts === 4, `the question renders 4 options (${q.opts})`);
  ok(/question 1 of/.test(q.t), 'the runner is showing question 1');
  await evaluate(c, 'document.querySelectorAll("#view .mcq-option")[0].click(); return true;');
  await sleep(400);
  const ex = await evaluate(c, 'return document.getElementById("view").innerText;');
  ok(/mcq-explain|explanation|Correct|Not quite/i.test(ex), 'the answer is explained');
  const att = await evaluate(c, 'return JSON.parse(localStorage.getItem("ioe-planner:state")).items;');
  ok(Object.values(att).some((r) => r.mcq && r.mcq.att > 0), 'an attempt was persisted to localStorage');
}

section('5b. You can hand-pick the day in a real browser');
{
  await evaluate(c, 'location.hash = "#/today"; return true;');
  await sleep(700);
  const modes = await evaluate(c, `
    return [...document.querySelectorAll('#view button[data-mode]')].map((b) => b.dataset.mode);`);
  ok(modes.join(',') === 'auto,picks', `the two ways of choosing a day are on screen (${modes.join(',')})`);
  ok(!(await evaluate(c, `
    return /Shuffle again|Random/.test(document.getElementById('view').innerText);`)),
    'the random-day control is gone from the page');

  // Switching to "My chapters" must pre-fill the planner's own chapters, so
  // editing a day means adjusting the plan rather than rebuilding it.
  await evaluate(c, `
    const b = [...document.querySelectorAll('#view button[data-mode]')].find((x) => x.dataset.mode === 'picks');
    b.click();
    return true;`);
  await sleep(600);
  const seeded = await evaluate(c, `
    const st = JSON.parse(localStorage.getItem('ioe-planner:state'));
    const d = new Date(); const iso = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    const picks = st.overrides.todayPicks[iso] || [];
    const boxes = [...document.querySelectorAll('#view input[data-topic-key]')];
    return { picks, ticked: boxes.filter((b) => b.checked).map((b) => b.dataset.topicKey), total: boxes.length };`);
  ok(seeded.picks.length > 0, `the day opens with the planner's chapters already chosen (${JSON.stringify(seeded.picks)})`);
  ok(seeded.ticked.length === seeded.picks.length,
    `every pre-filled chapter shows as ticked in the real DOM (${seeded.ticked.length} ticked of ${seeded.total} boxes)`);
  ok(await evaluate(c, `
    return /of .+ planned/i.test(document.getElementById('view').innerText);`),
    'the selection compares itself against the budget for the day');

  // Real click on a real checkbox, inside a collapsed <details>. The node has
  // to be re-queried after each click, because ticking re-renders the view and
  // the old element is detached - which is exactly what a real user sees.
  const added = [];
  for (let i = 0; i < 2; i++) {
    added.push(await evaluate(c, `
      const boxes = [...document.querySelectorAll('#view input[data-topic-key]')];
      const box = boxes.filter((x) => !x.checked)[0];
      const det = box.closest('details');
      if (det) det.open = true;
      const k = box.dataset.topicKey;
      box.click();
      return k;`));
    await sleep(450);
  }
  const stored = await evaluate(c, `
    const st = JSON.parse(localStorage.getItem('ioe-planner:state'));
    const d = new Date(); const iso = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    return { picks: st.overrides.todayPicks[iso] };`);
  ok(Array.isArray(stored.picks) && stored.picks.length === seeded.picks.length + 2,
    `the real clicks were added to the pre-filled set (${JSON.stringify(stored.picks)})`);
  for (const k of added) ok(stored.picks.includes(k), `the clicked chapter ${k} is stored`);

  // The chosen topics must actually be what the day plans, and must lead it.
  const planned = await evaluate(c, 'return document.getElementById("view").innerText;');
  ok(/You chose this for today/i.test(planned), 'the day says the topics were chosen by hand');

  // Removing one must shrink the day, not add anything.
  const removed = await evaluate(c, `
    const box = [...document.querySelectorAll('#view input[data-topic-key]')].find((x) => x.checked);
    const k = box.dataset.topicKey;
    box.click();
    return k;`);
  await sleep(500);
  const after = await evaluate(c, `
    const st = JSON.parse(localStorage.getItem('ioe-planner:state'));
    const d = new Date(); const iso = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    return st.overrides.todayPicks[iso];`);
  ok(!after.includes(removed), `unticking ${removed} removes it from the day`);
}

section('6. The app persists across a real reload');
{
  await evaluate(c, 'return true;');
  await c.send('Page.reload', { ignoreCache: false });
  await sleep(1800);
  const t = await evaluate(c, 'return document.body.innerText;');
  ok(!/Set up your planner/.test(t), 'the wizard does not reappear after a reload');
  ok(/Logged sessions|Session result|Practice/.test(t), 'the app came back with the saved state');
}

section('7. No console errors anywhere in the journey');
{
  // `tabs:outgoing.message.ready` is the browser's own internal DevTools
  // messaging complaining about a listener, not anything the page did; its
  // count changes between runs, which is why it is filtered by shape.
  const real = errors.filter((e) => !/favicon|ERR_FILE_NOT_FOUND|Autofill|No Listener:|outgoing\.message/i.test(e));
  ok(real.length === 0, `no console errors (${real.length})`);
  for (const e of real.slice(0, 6)) console.log(`      ${e.slice(0, 200)}`);
}

/* -------------------------------------------------------------------- */

await fetch(`${CDP}/json/close/${target.id}`);
c.close();

console.log(`\n${'-'.repeat(60)}`);
console.log(`${pass} passed, ${failures.length} failed`);
if (failures.length) {
  console.log('\nFailures:');
  for (const f of failures) console.log(`  - ${f}`);
  process.exitCode = 1;
}
