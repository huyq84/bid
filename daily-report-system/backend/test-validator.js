// test-validator.js - 阶段 3 幻觉校验测试
import { executeTool } from './llm-tools.js';

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { console.log(`  ✅ ${name}`); pass++; }
  else { console.log(`  ❌ ${name} ${detail ? '- ' + detail : ''}`); fail++; }
}

console.log('=== Test 1: createEvent - areaId 幻觉校验 ===');
try {
  const r1 = await executeTool('createEvent', {
    type: 'progress', taskName: '幻觉测试-坏areaId', owner: '测试', areaId: 'FAKE_AREA_999'
  }, { projectId: 'baicaoyuan', date: '2026-06-17' });
  console.log('  result:', JSON.stringify(r1).slice(0, 300));
  check('创建成功', r1.ok === true);
  check('message 含幻觉警告', r1.message?.includes('幻觉警告') || r1.message?.includes('areaId'));
} catch (e) {
  console.log('  异常:', e.message);
  check('创建成功（幻觉 areaId 被丢弃）', e.message?.includes('幻觉'));
}

console.log('\n=== Test 2: updateEvent - areaId 幻觉校验 ===');
// 先录一个正常事件
const r2a = await executeTool('createEvent', { type: 'progress', taskName: '幻觉测试-update', owner: '测试' }, { projectId: 'baicaoyuan', date: '2026-06-17' });
const eventId = r2a.data?.id || r2a.id;
console.log('  事件 ID:', eventId);
try {
  const r2 = await executeTool('updateEvent', { eventId, areaId: 'FAKE_AREA_888' }, { projectId: 'baicaoyuan', date: '2026-06-17' });
  console.log('  result:', JSON.stringify(r2).slice(0, 300));
  check('更新成功', r2.ok === true);
  check('message 含幻觉警告', r2.message?.includes('幻觉警告') || r2.message?.includes('areaId'));
} catch (e) {
  console.log('  异常:', e.message);
  check('更新成功（幻觉 areaId 被丢弃）', e.message?.includes('幻觉'));
}

console.log('\n=== Test 3: updateEvent - 正确 areaId 不被拦截 ===');
// 录一个带 areaId 的事件
const r3a = await executeTool('createEvent', { type: 'progress', taskName: '幻觉测试-areaId-ok', owner: '测试', areaId: 'A1' }, { projectId: 'baicaoyuan', date: '2026-06-17' });
const eventId3 = r3a.data?.id || r3a.id;
console.log('  事件 ID:', eventId3);
try {
  const r3 = await executeTool('updateEvent', { eventId: eventId3, areaId: 'A1' }, { projectId: 'baicaoyuan', date: '2026-06-17' });
  console.log('  result:', JSON.stringify(r3).slice(0, 300));
  check('更新成功', r3.ok === true);
  check('没有幻觉警告', !(r3.message?.includes('幻觉警告') || r3.message?.includes('areaId')));
} catch (e) {
  console.log('  异常:', e.message);
  check('更新成功', false, e.message);
}

console.log('\n=== Test 4: updatePlan - areaId 幻觉校验 ===');
const r4a = await executeTool('createEvent', { type: 'progress', taskName: '幻觉测试-plan', owner: '测试' }, { projectId: 'baicaoyuan', date: '2026-06-17' });
const eventId4 = r4a.data?.id || r4a.id;
console.log('  事件 ID:', eventId4);
try {
  const r4 = await executeTool('updateEvent', { eventId: eventId4, areaId: 'FAKE_PLAN_777' }, { projectId: 'baicaoyuan', date: '2026-06-17' });
  console.log('  result:', JSON.stringify(r4).slice(0, 300));
  check('更新成功', r4.ok === true);
  check('message 含幻觉警告', r4.message?.includes('幻觉警告') || r4.message?.includes('areaId'));
} catch (e) {
  console.log('  异常:', e.message);
  check('更新成功（幻觉 areaId 被丢弃）', e.message?.includes('幻觉'));
}

console.log('\n=== Test 5: updateIssue - 不存在的 issueId 校验 ===');
try {
  const r5 = await executeTool('closeIssue', { issueId: 'I_FAKE_000' }, { projectId: 'baicaoyuan', date: '2026-06-17' });
  console.log('  result:', JSON.stringify(r5).slice(0, 200));
  check('closeIssue 拒绝不存在 ID', r5.ok === false || r5.message?.includes('不存在'));
} catch (e) {
  console.log('  异常:', e.message);
  check('closeIssue 拒绝不存在 ID', e.message.includes('不存在'));
}

console.log('\n=== 汇总 ===');
console.log(`  通过: ${pass}`);
console.log(`  失败: ${fail}`);
process.exit(fail > 0 ? 1 : 0);
