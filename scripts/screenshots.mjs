// Walks through the demo in headless Chrome like a phone user and saves a
// screenshot of each step (docs/screens). Needs: `npx expo start --web`
// on :8081 and Chrome started with --remote-debugging-port=9333.
//   node scripts/screenshots.mjs [outDir] [baseUrl]
import { Buffer } from 'node:buffer';
import { mkdirSync, writeFileSync } from 'node:fs';

const OUT = process.argv[2] ?? 'docs/screens';
const BASE = process.argv[3] ?? 'http://localhost:8081';
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Our own tab, so other pages open in that Chrome are left alone.
const page = await (await fetch('http://127.0.0.1:9333/json/new?about:blank', { method: 'PUT' })).json();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
  }
};
const send = (method, params = {}) =>
  new Promise((res) => {
    const i = ++id;
    pending.set(i, res);
    ws.send(JSON.stringify({ id: i, method, params }));
  });
const evaluate = async (expr) =>
  (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
const size = (h) => send('Emulation.setDeviceMetricsOverride', { width: 390, height: h, deviceScaleFactor: 2, mobile: true });
const waitForText = async (text, ms = 30000) => {
  for (let t = 0; t < ms; t += 500) {
    if (await evaluate(`document.body.innerText.includes(${JSON.stringify(text)})`)) return true;
    await sleep(500);
  }
  console.log('timed out waiting for:', text);
  return false;
};
const shot = async (name) => {
  await sleep(400);
  const r = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.result.data, 'base64'));
  console.log('saved', name);
};
const find = (text) =>
  evaluate(`(() => {
    const want = ${JSON.stringify(text)};
    const all = [...document.querySelectorAll('body *')].filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && (el.innerText || '').trim() === want;
    });
    const el = all.filter((a) => !all.some((b) => b !== a && a.contains(b))).pop();
    if (!el) return null;
    el.scrollIntoView({ block: 'center' });
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  })()`);
const click = async (p) => {
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased'])
    await send('Input.dispatchMouseEvent', { type, x: p.x, y: p.y, button: 'left', clickCount: 1 });
};
const tap = async (text, wait = 1500) => {
  const p = await find(text);
  if (!p) return console.log('not found:', text);
  await click(p);
  await sleep(wait);
};
const typeInto = async (placeholder, text) => {
  const p = await evaluate(`(() => {
    const el = [...document.querySelectorAll('input')].find((i) => i.placeholder === ${JSON.stringify(placeholder)});
    if (!el) return null; el.scrollIntoView({ block: 'center' });
    const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  })()`);
  if (!p) return console.log('no input:', placeholder);
  await click(p);
  await send('Input.insertText', { text });
  await sleep(600);
};
const scrollTop = () =>
  evaluate(`[...document.querySelectorAll('div')].forEach((d) => { if (d.scrollHeight > d.clientHeight + 5) d.scrollTop = 0; }); window.scrollTo(0, 0)`);

await send('Page.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true }); // always the latest bundle
await size(844);
await send('Page.navigate', { url: `${BASE}/login` });
await waitForText('Explore the demo', 120000);
await sleep(1500);
await shot('1-login');
await tap('Explore the demo', 500);
await waitForText('Kapkolia Demo Inspection');
await shot('2-my-runs');
await tap('Kapkolia Demo Inspection', 500);
await waitForText('ROUTE');
await sleep(9000); // map tiles
await shot('3-run-map');
await tap('J-001', 500);
await waitForText('DISTANCE');
await scrollTop();
await sleep(500);
await shot('4-waypoint');
await tap('Demo: walk to this waypoint', 1500);
await tap('Check in here', 2500);
await tap('Yes', 500);
await typeInto('0', '72');
await tap('Good', 500);
await size(1650);
await scrollTop();
await sleep(1200);
await shot('5-checklist');
await tap('Submit inspection', 3000);
await size(844);
await scrollTop();
await sleep(800);
await shot('6-submitted');
await evaluate('history.back()');
await sleep(5000);
await scrollTop();
await shot('7-run-progress');

// Offline: no signal, inspect the next junction, see it queued, then sync.
await tap('Demo: turn signal off', 2500);
await tap('J-002', 500);
await waitForText('DISTANCE');
await tap('Demo: walk to this waypoint', 1500);
await tap('Check in here', 1500);
await tap('Yes', 500);
await typeInto('0', '45');
await tap('Good', 500);
await tap('Submit inspection', 2000);
await scrollTop();
await sleep(800);
await shot('8-offline-saved');
await evaluate('history.back()');
await sleep(4000);
await size(1100);
await scrollTop();
await sleep(1500);
await shot('9-offline-run');
await tap('Demo: turn signal on', 5000);
await scrollTop();
await sleep(1500);
await shot('10-synced');
ws.close();
await fetch(`http://127.0.0.1:9333/json/close/${page.id}`);
