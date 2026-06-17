// test-long-term-memory.js - 阶段 5 长期记忆测试
import { initMemoryTable, getMemory, getAllMemories, saveMemory, recordCorrection, getMemorySummary } from './long-term-memory.js';

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { console.log(`  ✅ ${name}`); pass++; }
  else { console.log(`  ❌ ${name} ${detail ? '- ' + detail : ''}`); fail++; }
}

const pid = 'baicaoyuan';
const testDate = '2026-06-17-test-ltm';

console.log('=== Test 1: 初始化记忆表 ===');
try {
  await initMemoryTable();
  check('表初始化成功', true);
} catch (e) {
  check('表初始化成功', false, e.message);
}

console.log('\n=== Test 2: 保存和读取记忆 ===');
await saveMemory(pid, 'test-key', { value: 'hello', num: 42 });
const val = await getMemory(pid, 'test-key');
console.log('  saved value:', val);
check('保存成功', val !== null);
check('读取正确', val?.value === 'hello' && val?.num === 42);

console.log('\n=== Test 3: 不存在时返回 null ===');
const missing = await getMemory(pid, 'nonexistent-key');
check('不存在的 key 返回 null', missing === null);

console.log('\n=== Test 4: 更新已有记忆 ===');
await saveMemory(pid, 'test-key', { value: 'updated', num: 99 });
const updated = await getMemory(pid, 'test-key');
check('更新后值改变', updated?.value === 'updated' && updated?.num === 99);

console.log('\n=== Test 5: 获取所有记忆 ===');
await saveMemory(pid, 'test-key-2', { type: 'another' });
const all = await getAllMemories(pid);
console.log('  all:', Object.keys(all));
check('获取所有记忆', Object.keys(all).length >= 2);

console.log('\n=== Test 6: 记录纠错 ===');
await recordCorrection(pid, 'updateEvent', 'E123 不是木工事件，是油漆工');
const corrections = await getMemory(pid, 'corrections');
console.log('  corrections:', corrections?.[0]);
check('纠错记录成功', corrections && corrections.length >= 1);

console.log('\n=== Test 7: 记忆摘要生成 ===');
const summary = await getMemorySummary(pid);
console.log('  summary:', summary?.slice(0, 200) || 'empty');
check('生成摘要', !!summary);
check('摘要包含纠错', summary?.includes('纠错') || summary?.includes('E123'));

console.log('\n=== Test 8: 清除记忆 ===');
await getAllMemories(pid).then(all => {
  console.log('  clear before:', Object.keys(all));
});
const clearResult = await import('./long-term-memory.js').then(m => {
  return m.clearAllMemory(pid);
});
const afterClear = await getAllMemories(pid);
console.log('  clear after:', Object.keys(afterClear));
check('清除后为空', Object.keys(afterClear).length === 0);

console.log('\n=== 汇总 ===');
console.log(`  通过: ${pass} / ${pass + fail}`);
process.exit(fail > 0 ? 1 : 0);
