// ============================================================
// test-tool-consistency.js - 工具描述一致性回归测试
// ============================================================
//
// 防止再次出现"机器人说没这工具"或"机器人拒绝调工具"这类问题。
// 检查 3 件事：
//   1) llm-tools.js 的 TOOLS 数组
//   2) llm-client.js _getNativeTools() 生成的 Anthropic schema
//   3) llm-client.js systemMsg 工具清单（用 _toolsListText() 渲染）
//
// 三个数据源必须完全一致：同一份 TOOLS，schema 和 systemMsg 都从这里生成。
//
// 顺便检查 chat-actions.js 的 SENSITIVE_ACTIONS 集合：
//   - 如果 llm-tools.js 标 requiresConfirm=true，但 SENSITIVE_ACTIONS 没有，
//     说明 permLevel=confirm 时不会走"待授权卡片"——这是策略偏离，给 warning。
//
// 运行：node backend/test-tool-consistency.js
// 退出码：0 = 通过；1 = 有 ERROR 级别的不一致

import { TOOLS } from './llm-tools.js';
import { MinMaxClient } from './llm-client.js';
import { SENSITIVE_ACTIONS, isSensitiveAction } from './chat-actions.js';

let errors = 0;
let warnings = 0;

function ok(msg) { console.log(`  ✅ ${msg}`); }
function err(msg) { console.log(`  ❌ ${msg}`); errors++; }
function warn(msg) { console.log(`  ⚠️  ${msg}`); warnings++; }

console.log('========================================');
console.log('  工具描述一致性检查');
console.log('========================================\n');

// ---------- 1) 基础数据校验 ----------
console.log('【1】TOOLS 基础校验');
const toolNames = new Set();
const dupes = [];
for (const t of TOOLS) {
  if (!t.name) { err('有工具缺 name'); continue; }
  if (toolNames.has(t.name)) dupes.push(t.name);
  toolNames.add(t.name);
}
if (dupes.length > 0) err(`重复工具名: ${dupes.join(', ')}`);
else ok(`共 ${TOOLS.length} 个工具，无重名`);

const noDesc = TOOLS.filter(t => !t.description || t.description.length < 5);
if (noDesc.length > 0) err(`缺描述的工具: ${noDesc.map(t => t.name).join(', ')}`);
else ok('所有工具都有 description');

const noHandler = TOOLS.filter(t => typeof t.handler !== 'function');
if (noHandler.length > 0) err(`缺 handler: ${noHandler.map(t => t.name).join(', ')}`);
else ok('所有工具都有 handler');

const mutateWithQuery = TOOLS.filter(t => t.isMutate && (!t.params || !t.params.dryRun));
if (mutateWithQuery.length > 0) {
  warn(`mutate 工具未声明 dryRun 参数（不一定是 bug，但失去 dry-run 预览能力）: ${mutateWithQuery.map(t => t.name).join(', ')}`);
}

// ---------- 2) _getNativeTools schema 一致性 ----------
console.log('\n【2】Anthropic native tool schema 校验');
const client = new MinMaxClient({ apiKey: 'test' });
const nativeTools = client._getNativeTools();
const nativeNames = new Set(nativeTools.map(t => t.name));

if (nativeTools.length !== TOOLS.length) {
  err(`_getNativeTools 数量 ${nativeTools.length} ≠ TOOLS 数量 ${TOOLS.length}`);
} else {
  ok(`_getNativeTools 生成 ${nativeTools.length} 个工具，与 TOOLS 一一对应`);
}

// 名称是否完全对齐
for (const t of TOOLS) {
  if (!nativeNames.has(t.name)) err(`TOOLS 里有 ${t.name}，但 _getNativeTools 缺`);
}
for (const n of nativeNames) {
  if (!toolNames.has(n)) err(`_getNativeTools 里有 ${n}，但 TOOLS 缺`);
}

// schema 字段是否完整
for (const nt of nativeTools) {
  if (!nt.input_schema) { err(`${nt.name} 缺 input_schema`); continue; }
  if (nt.input_schema.type !== 'object') err(`${nt.name} input_schema.type 不是 object`);
  if (!nt.input_schema.properties) err(`${nt.name} 缺 input_schema.properties`);
  // required 里所有项必须都在 properties 里
  for (const req of (nt.input_schema.required || [])) {
    if (!nt.input_schema.properties[req]) err(`${nt.name} required[${req}] 不在 properties 中`);
  }
}
ok('每个 schema 都有 input_schema + properties + required 自洽');

// ---------- 3) systemMsg 工具清单是否提到所有 mutate ----------
console.log('\n【3】systemMsg 工具清单校验');
import('fs').then(fs => {
  const src = fs.readFileSync(new URL('./llm-client.js', import.meta.url), 'utf-8');
  // 抓 systemMsg 字符串里 "_toolsListText" 之后的部分太复杂——
  // 直接 render 整段：找 systemMsg 模板里的 ${_toolsListText()} 占位符位置
  // 但模板在模板字符串里，无法直接 render

  // 退而求其次：直接执行 _toolsListText
  // 把 _toolsListText 提取出来用 eval（hack 但够用）
  const match = src.match(/function _toolsListText\(\) \{[\s\S]*?\n\}/);
  if (!match) { err('找不到 _toolsListText 函数'); return; }
  const fakeModule = { REGISTERED_TOOLS: TOOLS };
  const fn = new Function('REGISTERED_TOOLS', match[0] + '\nreturn _toolsListText();');
  const toolsText = fn(TOOLS);

  const mentioned = new Set();
  for (const t of TOOLS) {
    if (toolsText.includes(`- ${t.name}:`)) mentioned.add(t.name);
  }

  for (const t of TOOLS) {
    if (t.isMutate && !mentioned.has(t.name)) {
      err(`systemMsg 工具清单**漏掉**了 mutate 工具 ${t.name} —— LLM 看不到！`);
    }
  }
  for (const t of TOOLS) {
    if (!t.isMutate && !mentioned.has(t.name)) {
      warn(`systemMsg 漏掉查询工具 ${t.name}（不影响 LLM 调用，但日志读起来不全）`);
    }
  }
  if (mentioned.size >= TOOLS.filter(t => t.isMutate).length) {
    ok(`systemMsg 提到所有 ${TOOLS.filter(t => t.isMutate).length} 个 mutate 工具`);
  }

  // ---------- 4) chat-actions SENSITIVE_ACTIONS vs requiresConfirm ----------
  console.log('\n【4】SENSITIVE_ACTIONS ↔ requiresConfirm 策略校验');
  const reqConfirmTrue = TOOLS.filter(t => t.requiresConfirm === true).map(t => t.name);
  const reqConfirmFalse = TOOLS.filter(t => t.requiresConfirm === false).map(t => t.name);
  const sensitiveSet = SENSITIVE_ACTIONS;

  // 注意：SENSITIVE_ACTIONS 是 action.type 命名空间（chat-actions.js 的 action type），
  // 不一定 1:1 对应 tool name。检查名字相同的交集。

  for (const tName of reqConfirmTrue) {
    if (!sensitiveSet.has(tName)) {
      warn(`${tName} requiresConfirm=true 但不在 SENSITIVE_ACTIONS——permLevel=confirm 时可能不走"待授权卡片"`);
    }
  }
  for (const aName of sensitiveSet) {
    const t = TOOLS.find(t => t.name === aName);
    if (!t) continue;  // SENSITIVE_ACTIONS 可能含纯 action type 不对应 tool
    if (t.requiresConfirm !== true) {
      err(`${aName} 在 SENSITIVE_ACTIONS 但 requiresConfirm=${t.requiresConfirm}——两套真相矛盾`);
    }
  }
  if (warnings === 0 && errors === 0) ok('SENSITIVE_ACTIONS ↔ requiresConfirm 完全一致');
  else if (errors === 0) ok(`SENSITIVE_ACTIONS 偏离项已 warn（无 hard error）`);

  // ---------- 总结 ----------
  console.log('\n========================================');
  if (errors === 0) {
    console.log(`  ✅ 通过：${warnings} 个 warning，0 个 error`);
  } else {
    console.log(`  ❌ 失败：${errors} 个 error，${warnings} 个 warning`);
  }
  console.log('========================================');
  process.exit(errors === 0 ? 0 : 1);
});
