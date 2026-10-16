// Load a page in the debug Chrome (:9333) and print console errors + page text.
const url = process.argv[2] ?? 'http://localhost:8081/login';
const targets = await (await fetch('http://127.0.0.1:9333/json')).json();
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data);
  if (m.method === 'Runtime.exceptionThrown') console.log('EXCEPTION', m.params.exceptionDetails.exception?.description?.slice(0, 600) ?? m.params.exceptionDetails.text);
  if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type)) console.log(m.params.type.toUpperCase(), m.params.args.map((a) => a.value ?? a.description).join(' ').slice(0, 600));
  if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') console.log('LOG', m.params.entry.text.slice(0, 300), m.params.entry.url ?? '');
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
  } };
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Page.navigate', { url });
await new Promise((r) => setTimeout(r, 12000));
const t = await send('Runtime.evaluate', { expression: 'document.body.innerText.slice(0, 500)', returnByValue: true });
console.log('BODY TEXT:', JSON.stringify(t.result?.result?.value));
ws.close();
