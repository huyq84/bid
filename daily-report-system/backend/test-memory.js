// test-memory.js - 阶段 4 短期记忆测试
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

console.log('=== Test 1: 第一轮查询 → memory 记录 ===');
const r1 = await callChat('今天木工做了哪些事？');
console.log('  memory:', r1.memory ? 'present' : 'missing');
console.log('  queryHistory:', r1.memory?.queryHistory?.length || 0);
check('有 memory 对象', !!r1.memory);
check('memory 包含 queryHistory', r1.memory?.queryHistory?.length >= 1);
check('queryHistory 有 queryEvents', r1.memory?.queryHistory?.some(q => q.tool === 'queryEvents'));
check('queryHistory 有结果计数', r1.memory?.queryHistory?.some(q => q.resultCount > 0));

console.log('\n=== Test 2: 写入操作 → actionHistory ===');
const r2 = await callChat('8号楼木工2人完成脚手架搭设60%，负责人张师傅');
console.log('  actionHistory:', r2.memory?.actionHistory?.length || 0);
check('有 reply', !!r2.reply);
check('actionHistory 有 createEvent', r2.memory?.actionHistory?.some(a => a.type === 'createEvent'));
check('actionHistory 记录了对应 ID', !!r2.memory?.actionHistory?.find(a => a.targetId));

console.log('\n=== Test 3: 多轮对话 → memory 累积 ===');
const r3 = await callChat('列出今天所有区域');
const r4 = await callChat('那这些区域分别有哪些事件？');
console.log('  r4 queryHistory:', r4.memory?.queryHistory?.length || 0);
check('多轮查询后 memory 累积', r4.memory?.queryHistory?.length >= 3);

console.log('\n=== Test 4: LLM 回复中包含 memory 感知 ===');
const r5 = await callChat('刚才提到的木工任务中，有哪些还没完成的？');
console.log('  Reply:', r5.reply?.slice(0, 150).replace(/\n/g, ' / '));
check('回复提到未完成/进度', r5.reply?.includes('未') || r5.reply?.includes('进度'));

console.log('\n=== 汇总 ===');
console.log(`  通过: ${pass} / ${pass + fail}`);
process.exit(fail > 0 ? 1 : 0);
