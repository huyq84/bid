// test-memory-final.js - 阶段 4 短期记忆完整测试
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
  return await res.json();
}

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { console.log(`  ✅ ${name}`); pass++; }
  else { console.log(`  ❌ ${name} ${detail ? '- ' + detail : ''}`); fail++; }
}

console.log('=== Test 1: 查询 → memory 记录 ===');
const r1 = await callChat('今天完成了哪些工作？');
console.log('  reply:', (r1.reply || '').slice(0, 120));
console.log('  memory:', r1.memory ? '✅ present' : '❌ missing');
console.log('  queryHistory:', r1.memory?.queryHistory?.length || 0);
check('有 memory 对象', !!r1.memory);
check('memory 包含 queryHistory', r1.memory?.queryHistory?.length >= 1);
check('queryHistory 有 queryEvents', r1.memory?.queryHistory?.some(q => q.tool === 'queryEvents'));

console.log('\n=== Test 2: 写入 → actionHistory ===');
const r2 = await callChat('木工1人在1号楼完成吊顶龙骨安装80%，负责人李师傅');
console.log('  actionHistory:', r2.memory?.actionHistory?.length || 0);
check('有 reply', !!r2.reply);
check('actionHistory 有 createEvent', r2.memory?.actionHistory?.some(a => a.type === 'createEvent'));
check('actionHistory 记录了对应 ID', !!r2.memory?.actionHistory?.find(a => a.targetId));

console.log('\n=== Test 3: 多轮 → memory 累积 ===');
const r3 = await callChat('列出今天所有区域');
const r4 = await callChat('那些区域分别有哪些事件？');
console.log('  r4 queryHistory:', r4.memory?.queryHistory?.length || 0);
check('多轮查询后 memory 累积 ≥ 3 条', r4.memory?.queryHistory?.length >= 3);

console.log('\n=== Test 4: memory summary 注入 ===');
// memory summary 会在 system prompt 中追加，影响 LLM 行为
// 如果 memory 中有历史记录，LLM 应该能利用这些信息
const r5 = await callChat('刚才创建的木工事件，负责人是谁？');
console.log('  reply:', (r5.reply || '').slice(0, 150));
check('有 reply', !!r5.reply);

console.log('\n=== Test 5: 清理 → memory 过期过滤 ===');
// 调用 cleanExpired 后，超时的记录应该被清除
import { cleanExpired, createMemory } from './chat-memory.js';
const mem = createMemory();
mem.queryHistory.push({ tool: 'oldQuery', timestamp: Date.now() - 31 * 60 * 1000 }); // 31 分钟前
mem.queryHistory.push({ tool: 'recentQuery', timestamp: Date.now() });
cleanExpired(mem);
check('过期记录被清除', mem.queryHistory.length === 1);
check('只保留近期记录', mem.queryHistory[0]?.tool === 'recentQuery');

console.log('\n=== 汇总 ===');
console.log(`  通过: ${pass} / ${pass + fail}`);
process.exit(fail > 0 ? 1 : 0);
