// debug-memory.js - 检查 memory 是否通过 JSON 传输
const BASE = 'http://localhost:3010';

async function callChat(msg) {
  const res = await fetch(`${BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: msg,
      projectId: 'baicaoyuan',
      date: new Date().toISOString().slice(0, 10),
      permLevel: 'allow'
    })
  });
  const json = await res.json();
  console.log('=== Raw response ===');
  console.log('memory:', json.memory ? JSON.stringify(json.memory, null, 2).slice(0, 1000) : 'undefined');
  console.log('reply:', (json.reply || '').slice(0, 100));
  console.log('actions:', json.actions?.length);
  console.log('source:', json.source);
  console.log('toolsCalled:', json.toolsCalled);
  return json;
}

(async () => {
  await callChat('今天木工做了哪些事？');
})();
