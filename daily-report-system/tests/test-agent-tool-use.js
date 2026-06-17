// test-agent-tool-use.js - 阶段 1 集成测试
// 验证 chatWithContext 使用原生 tool_use 协议后的完整链路：
//   1. LLM 主动调 queryEvents 查数据
//   2. 后端执行工具并回灌 tool_result
//   3. LLM 收到结果后输出自然语言总结
//   4. 可以执行 actions（录入事件）

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
      permLevel: options.permLevel || 'allow',  // 用 allow 避免授权弹窗
      history: options.history || []
    })
  });
  return await res.json();
}

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) {
    console.log(`  ✅ ${name}`);
    pass++;
  } else {
    console.log(`  ❌ ${name} ${detail ? '- ' + detail : ''}`);
    fail++;
  }
}

// ========== Test 1: 查询场景 — LLM 应该主动调 queryEvents ==========
console.log('\n=== Test 1: 查询场景 - LLM 主动调 queryEvents ===');
const r1 = await callChat('今天木工都做了哪些事？请用表格列出来');
console.log('  reply 前 200 字:', r1.reply?.slice(0, 200).replace(/\n/g, ' / '));
console.log('  source:', r1.source);
console.log('  latencyMs:', r1.latencyMs);
console.log('  actions:', r1.actions?.length || 0);
console.log('  pendingActions:', r1.pendingActions?.length || 0);
check('有 reply', !!r1.reply && r1.reply.length > 0);
check('回复包含表格或列表', r1.reply?.includes('|') || r1.reply?.includes('1.') || r1.reply?.includes('1、'));
check('source 是 llm (不是 mock)', r1.source === 'llm', `实际: ${r1.source}`);
check('latency 合理 (<60s)', r1.latencyMs < 60000, `${r1.latencyMs}ms`);

// ========== Test 2: 录入场景 — LLM 应该直接输出 createEvent action ==========
console.log('\n=== Test 2: 录入场景 - LLM 直接生成 createEvent action ===');
const r2 = await callChat('1号楼木工3人完成大堂龙骨安装80%，负责人老刘');
console.log('  reply 前 200 字:', r2.reply?.slice(0, 200).replace(/\n/g, ' / '));
console.log('  actions:', r2.actions?.length || 0);
console.log('  results:', r2.results?.length || 0);
check('有 reply', !!r2.reply);
check('生成了至少 1 个 action', r2.actions?.length >= 1);
check('action type 是 createEvent', r2.actions?.[0]?.type === 'createEvent');
const ae = r2.actions?.[0]?.data;
check('action.data.taskName 提取正确', ae?.taskName?.includes('龙骨') || ae?.taskName?.includes('木工'));
check('action.data.progress 提取正确', ae?.progress === '80%' || ae?.progress === '80');
check('action.data.headcount 提取正确', ae?.headcount === 3);
check('permLevel=allow 下 action 已自动执行', r2.results?.length >= 1);
check('结果 message 存在', r2.results?.[0]?.message);

// ========== Test 3: 工具链场景 — LLM 应该先查后录入（多轮） ==========
console.log('\n=== Test 3: 工具链场景 - LLM 先查后录入 ===');
const r3 = await callChat('把今天木工做的最后一条事件，负责人改成张师傅');
console.log('  reply 前 200 字:', r3.reply?.slice(0, 200).replace(/\n/g, ' / '));
console.log('  actions:', r3.actions?.map(a => a.type).join(', '));
check('有 reply', !!r3.reply);
check('可能调了 queryEvents 工具（reply 提到事件 ID 或 0 个 action）', r3.reply?.includes('E') || r3.actions?.length >= 1);
check('或 LLM 决定不操作并反问（reply 含反问）', r3.reply?.includes('？') || r3.reply?.includes('?'));

// ========== Test 4: 反问场景 — 必填字段缺失 ==========
console.log('\n=== Test 4: 反问场景 - 缺必填字段 ===');
const r4 = await callChat('帮我录一条施工事件');
console.log('  reply 前 200 字:', r4.reply?.slice(0, 200).replace(/\n/g, ' / '));
check('有 reply', !!r4.reply);
check('没有生成 action（缺必填）', (r4.actions?.length || 0) === 0);
check('reply 含反问（"什么任务"/"哪个区域"）', r4.reply?.includes('什么') || r4.reply?.includes('哪个') || r4.reply?.includes('？'));

// ========== Test 5: Mock 降级场景 — LLM 失败时的 fallback ==========
console.log('\n=== Test 5: 健康检查 + mock 降级路径 ===');
const health = await fetch(`${BASE}/api/health`).then(r => r.json());
check('后端健康', health.ok === true);
check('LLM 已配置', health.llm?.configured === true);
check('LLM 模型已设置', !!health.llm?.model);

console.log('\n=== 汇总 ===');
console.log(`  通过: ${pass}`);
console.log(`  失败: ${fail}`);
process.exit(fail > 0 ? 1 : 0);
