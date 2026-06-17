// debug-chat.js - 详细看 chat 响应
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ENV_PATH = path.resolve(__dirname, '../.env');
dotenv.config({ path: ENV_PATH });

const r = await fetch('http://localhost:3010/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    message: '1号楼木工2人完成天花吊顶50%，负责人老李',
    permLevel: 'allow'
  })
});
const data = await r.json();
console.log('reply:', data.reply);
console.log('---');
console.log('actions:');
data.actions?.forEach((a, i) => console.log(`  [${i}]`, JSON.stringify(a)));
console.log('---');
console.log('results:');
data.results?.forEach((r, i) => console.log(`  [${i}]`, JSON.stringify(r).slice(0, 300)));
console.log('---');
console.log('source:', data.source);
console.log('latency:', data.latencyMs);
