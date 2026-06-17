// poc-tool-use.js - POC：探测 MiniMax-M3 是否支持 Anthropic 原生 tool_use
// 最小测试：发一个 queryEvents 工具，看 LLM 是否返回 tool_use 块

import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ENV_PATH = path.resolve(__dirname, '../.env');
dotenv.config({ path: ENV_PATH });

const apiKey = process.env.MINIMAX_API_KEY;
const baseUrl = process.env.MINIMAX_BASE_URL;
const model = process.env.MINIMAX_MODEL;

console.log('[POC] 配置:');
console.log('  baseUrl:', baseUrl);
console.log('  model:', model);
console.log('  apiKey:', apiKey ? apiKey.slice(0, 8) + '...' : '(未设置)');
console.log();

if (!apiKey || !baseUrl || !model) {
  console.error('❌ .env 缺关键配置，无法跑 POC');
  process.exit(1);
}

const url = baseUrl.endsWith('/v1') ? `${baseUrl}/messages` : `${baseUrl}/v1/messages`;
console.log('[POC] 请求 URL:', url);
console.log();

// 一个简单的 queryEvents 工具
const tools = [
  {
    name: 'queryEvents',
    description: '查询指定日期的施工日报事件。可按类型、区域、状态筛选。',
    input_schema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'YYYY-MM-DD 格式日期' },
        type: { type: 'string', enum: ['progress', 'material', 'safety', 'coordination'] },
        areaId: { type: 'string', description: '区域 ID' },
        limit: { type: 'number', description: '最多返回条数' }
      },
      required: []
    }
  }
];

const body = {
  model,
  max_tokens: 1024,
  temperature: 0.1,
  tools,
  system: '你是一个施工日报助手。用户问查询时，优先调用 queryEvents 工具而不是凭空回答。',
  messages: [
    {
      role: 'user',
      content: '今天都完成了哪些施工事件？'
    }
  ]
};

console.log('[POC] 发送请求...');
const start = Date.now();

try {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify(body)
  });

  const latency = Date.now() - start;
  console.log(`[POC] HTTP ${res.status} (${latency}ms)`);

  const text = await res.text();

  if (!res.ok) {
    console.error('❌ 请求失败:');
    console.error(text.slice(0, 1000));
    process.exit(2);
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    console.error('❌ 响应不是 JSON:');
    console.error(text.slice(0, 500));
    process.exit(3);
  }

  console.log('\n[POC] 响应内容:');
  console.log(JSON.stringify(data, null, 2));

  // 检测关键字段
  console.log('\n[POC] 探测结果:');
  const content = data.content || [];

  const hasToolUse = content.some(b => b.type === 'tool_use');
  const hasText = content.some(b => b.type === 'text');
  const hasStopReason = data.stop_reason;
  const toolUseBlock = content.find(b => b.type === 'tool_use');

  console.log('  - stop_reason:', hasStopReason);
  console.log('  - 含 text 块:', hasText);
  console.log('  - 含 tool_use 块:', hasToolUse);

  if (toolUseBlock) {
    console.log('  - 调用的工具:', toolUseBlock.name);
    console.log('  - 工具参数:', JSON.stringify(toolUseBlock.input, null, 2));
    console.log('  - tool_use_id:', toolUseBlock.id);
  }

  console.log();
  if (hasStopReason === 'tool_use' && hasToolUse) {
    console.log('✅ [结论] MiniMax-M3 支持 Anthropic 原生 tool_use 协议');
    console.log('   - stop_reason === "tool_use"');
    console.log('   - 返回了 type="tool_use" 的 content 块');
    console.log('   - 可以进入阶段 1 改造');
  } else if (hasText && !hasToolUse) {
    console.log('⚠️ [结论] MiniMax-M3 不支持原生 tool_use（LLM 直接用文字回答）');
    console.log('   - 当前方案需要降级：继续用文本 JSON 模拟');
  } else {
    console.log('❓ [结论] 响应异常，需要进一步排查');
  }

} catch (e) {
  console.error('❌ 网络错误:', e.message);
  process.exit(4);
}
