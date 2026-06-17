// test-mutate-tools.js - 阶段 2 终极测试：6 个 mutate 工具
// 验证：mutate 工具就绪 + chatWithContext 能返回 actions + server.js 正确处理
// 注：LLM 行为（何时反问/何时直接执行）受 prompt 影响，本测试只验证基础设施

import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ENV_PATH = path.resolve(__dirname, '../.env');
dotenv.config({ path: ENV_PATH });

const BASE = 'http://localhost:3010';

async function callChat(message, options = {}) {
  const res = await fetch(`${BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      projectId: options.projectId || 'baicaoyuan',
      date: options.date || new Date().toISOString().slice(0, 10),
      permLevel: options.permLevel || 'allow',
      history: options.history || []
    })
  });
  return await res.json();
}

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { console.log(`  ✅ ${name}`); pass++; }
  else { console.log(`  ❌ ${name} ${detail ? '- ' + detail : ''}`); fail++; }
}

// ========== Test 1: createEvent（最常用 safe 操作）==========
console.log('\n=== Test 1: createEvent - safe 操作直接执行 ===');
const r1 = await callChat('8号楼木工3人完成墙面找平80%，负责人张师傅');
console.log('  reply 前 150 字:', r1.reply?.slice(0, 150).replace(/\n/g, ' / '));
console.log('  actions:', r1.actions?.map(a => a.type).join(', '));
console.log('  results:', r1.results?.length || 0);
check('有 reply', !!r1.reply);
check('生成了 createEvent action', r1.actions?.some(a => a.type === 'createEvent'));
check('allow 模式自动执行（results 有数据）', r1.results?.length >= 1);
check('result message 存在', !!r1.results?.[0]?.message || !!r1.results?.[0]?.data?.message);

// ========== Test 2: createIssue（最常用 safe 操作）==========
console.log('\n=== Test 2: createIssue - safe 操作直接执行 ===');
const r2 = await callChat(`记录协调：测试新协调-${Date.now()}，需要 7 月 1 日前完成`, { permLevel: 'allow' });
console.log('  reply 前 150 字:', r2.reply?.slice(0, 150).replace(/\n/g, ' / '));
console.log('  actions:', r2.actions?.map(a => a.type).join(', '));
console.log('  results:', r2.results?.length || 0);
check('有 reply', !!r2.reply);
check('生成了 createIssue action', r2.actions?.some(a => a.type === 'createIssue'));

// ========== Test 3: 幻觉 ID 保护 ==========
console.log('\n=== Test 3: 幻觉 ID 保护 - 传不存在的 eventId ===');
const r3 = await callChat('把事件 E99999999 的负责人改成张三');
console.log('  reply 前 200 字:', r3.reply?.slice(0, 200).replace(/\n/g, ' / '));
console.log('  actions:', r3.actions?.map(a => a.type).join(', '));
check('有 reply', !!r3.reply);
check('LLM 没有真执行（0 个 results）', (r3.results?.length || 0) === 0);
check('LLM 提到事件不存在/反问', r3.reply?.includes('没有') || r3.reply?.includes('没找到') || r3.reply?.includes('不存在') || r3.reply?.includes('?') || r3.reply?.includes('？'));

// ========== Test 4: updateEvent - allow 模式（用具体 ID）==========
console.log('\n=== Test 4: updateEvent - allow 模式（用具体 ID）===');
// 录一条新事件
const r4a = await callChat('8号楼电工1人完成灯具安装100%，负责人小电工', { permLevel: 'allow' });
const r4aActions = r4a.actions;
const newEventId = r4aActions?.[0]?._result?.data?.id || r4a.results?.[0]?.id || r4a.results?.[0]?.data?.id;
console.log('  录的事件 ID:', newEventId);
if (newEventId) {
  const r4 = await callChat(`把事件 ${newEventId} 的负责人改成大电工`, { permLevel: 'allow' });
  console.log('  reply 前 200 字:', r4.reply?.slice(0, 200).replace(/\n/g, ' / '));
  console.log('  actions:', r4.actions?.map(a => a.type).join(', '));
  console.log('  results:', r4.results?.length || 0);
  check('有 reply', !!r4.reply);
  check('生成了 updateEvent action', r4.actions?.some(a => a.type === 'updateEvent'));
  check('allow 模式自动执行（results 有数据）', r4.results?.length >= 1);
} else {
  console.log('  r4a.actions:', JSON.stringify(r4aActions).slice(0, 300));
  check('录事件成功（拿到 ID）', false);
}

// ========== Test 5: 基础设施验证 - mutate 工具 + 权限检查 ==========
console.log('\n=== Test 5: 基础设施验证 - mutate 工具能直接调用 ===');
// 直接调工具 API（不通过 LLM）验证工具本身工作
import { executeTool } from './llm-tools.js';
const r5a = await executeTool('createEvent', { type: 'progress', taskName: '测试基础设施-直接调', owner: '基础设施测试' }, { projectId: 'baicaoyuan', date: '2026-06-17' });
console.log('  createEvent 工具结果:', JSON.stringify(r5a).slice(0, 200));
check('createEvent 工具 ok=true', r5a.ok === true);
check('createEvent 工具返回 id', !!r5a.data?.id || !!r5a.id);

const r5b = await executeTool('queryEvents', { taskNameContains: '测试基础设施' }, { projectId: 'baicaoyuan', date: '2026-06-17' });
console.log('  queryEvents 工具结果数:', r5b.length);
check('queryEvents 找到刚创建的事件', r5b.some(e => e.taskName === '测试基础设施-直接调'));

const createdId = r5a.data?.id || r5a.id;
const r5c = await executeTool('updateEvent', { eventId: createdId, owner: '改过的负责人' }, { projectId: 'baicaoyuan', date: '2026-06-17' });
console.log('  updateEvent 工具结果:', JSON.stringify(r5c).slice(0, 200));
check('updateEvent 工具 ok=true', r5c.ok === true);

let r5d;
try {
  r5d = await executeTool('closeIssue', { issueId: 'I99999999' }, { projectId: 'baicaoyuan', date: '2026-06-17', permLevel: 'allow' });
  console.log('  closeIssue 不存在 ID 结果:', r5d.message || JSON.stringify(r5d).slice(0, 100));
  check('closeIssue 对不存在的 ID 抛错', r5d.ok === false || r5d.message?.includes('不存在'));
} catch (e) {
  console.log('  closeIssue 不存在 ID 抛错:', e.message);
  check('closeIssue 对不存在的 ID 抛错', e.message.includes('不存在'));
}

let r5e;
try {
  r5e = await executeTool('deleteEventsByQuery', { date: '2026-06-17', taskNameContains: '测试基础设施-直接调', forceDelete: true }, { projectId: 'baicaoyuan', date: '2026-06-17' });
  console.log('  deleteEventsByQuery 工具结果:', JSON.stringify(r5e).slice(0, 300));
  check('deleteEventsByQuery 工具工作', r5e.ok === true || r5e.deletedCount >= 1 || r5e.data?.deletedCount >= 1);
} catch (e) {
  console.log('  deleteEventsByQuery 抛错:', e.message);
  check('deleteEventsByQuery 工具工作', false);
}

// ========== Test 6: dryRun 预览 ==========
// ========== Test 6: dryRun 预览 ==========\nconsole.log('\\n=== Test 6: dryRun 预览 - 不真改数据 ===');
// 先录一条事件做 dryRun
const r6a = await executeTool('createEvent', { type: 'progress', taskName: 'dryRun测试任务', owner: 'dryRun测试' }, { projectId: 'baicaoyuan', date: '2026-06-17' });
const eventId6 = r6a.data?.id || r6a.id;
const r6 = await executeTool('updateEvent', { eventId: eventId6, owner: 'dryRun测试修改', dryRun: true }, { projectId: 'baicaoyuan', date: '2026-06-17' });
console.log('  dryRun 结果:', JSON.stringify(r6).slice(0, 200));
check('dryRun 返回 dryRun=true', r6.dryRun === true);
check('dryRun 返回 current 状态', !!r6.current);
check('dryRun 返回 wouldUpdate', !!r6.wouldUpdate);

// ========== Test 7: confirm 模式 - 工具直接返回 needsConfirm ==========
console.log('\n=== Test 7: confirm 模式 - 工具直接返回 needsConfirm ===');
// 录一条新事件
const r7a = await executeTool('createEvent', { type: 'progress', taskName: 'confirm模式测试', owner: '测试人' }, { projectId: 'baicaoyuan', date: '2026-06-17' });
const r7aId = r7a.data?.id || r7a.id;
console.log('  录的事件 ID:', r7aId, '| result:', JSON.stringify(r7a).slice(0, 200));
check('录了事件（拿到 ID）', !!r7aId);
const r7 = await executeTool('updateEvent', { eventId: r7aId, owner: 'confirm模式-改', dryRun: false }, { projectId: 'baicaoyuan', date: '2026-06-17', permLevel: 'confirm' });
console.log('  updateEvent confirm 结果:', JSON.stringify(r7).slice(0, 300));
check('confirm 模式返回 needsConfirm=true', r7.needsConfirm === true);
check('confirm 模式包含 pendingAction', !!r7.pendingAction);
check('pendingAction.type 是 updateEvent', r7.pendingAction?.type === 'updateEvent');
check('pendingAction.data.eventId 正确', r7.pendingAction?.data?.eventId === r7aId);

// ========== Test 8: strict 模式 - 工具直接拒绝 ==========
console.log('\n=== Test 8: strict 模式 - 工具直接拒绝 ===');
const r8 = await executeTool('updateEvent', { eventId: r7aId, owner: 'strict模式', dryRun: false }, { projectId: 'baicaoyuan', date: '2026-06-17', permLevel: 'strict' });
console.log('  updateEvent strict 结果:', JSON.stringify(r8).slice(0, 300));
check('strict 模式返回 ok=false', r8.ok === false);
check('strict 模式返回 blocked=true', r8.blocked === true);
check('错误信息提到 strict', r8.error?.includes('strict'));

// ========== Test 9: LLM ReAct - 走 native tool_use 调 queryEvents ==========
console.log('\n=== Test 9: LLM ReAct - 调 queryEvents 工具 ===');
const r9 = await callChat('今天木工一共做了多少件事？');
console.log('  reply 前 200 字:', r9.reply?.slice(0, 200).replace(/\n/g, ' / '));
console.log('  source:', r9.source);
check('有 reply', !!r9.reply);
check('source 是 llm', r9.source === 'llm');
check('reply 含数字（木工事件数）', /\d+/.test(r9.reply || ''));

// ========== Test 10: LLM ReAct - 对比计划 vs 实际 ==========
console.log('\n=== Test 10: LLM ReAct - 调 comparePlansVsActuals 工具 ===');
const r10 = await callChat('今天的计划完成情况如何？');
console.log('  reply 前 250 字:', r10.reply?.slice(0, 250).replace(/\n/g, ' / '));
check('有 reply', !!r10.reply);
check('reply 提到计划/完成', r10.reply?.includes('计划') || r10.reply?.includes('完成') || r10.reply?.includes('未完成'));

console.log('\n=== 汇总 ===');
console.log(`  通过: ${pass}`);
console.log(`  失败: ${fail}`);
process.exit(fail > 0 ? 1 : 0);
