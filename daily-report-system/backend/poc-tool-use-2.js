// poc-tool-use-2.js - POC 第二步：测试 LLM 在收到 tool_result 后能否继续对话
// 模拟完整一轮：user → tool_use → tool_result → final text

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
const url = baseUrl.endsWith('/v1') ? `${baseUrl}/messages` : `${baseUrl}/v1/messages`;

const tools = [
  {
    name: 'queryEvents',
    description: '查询指定日期的施工日报事件。返回事件列表（含 id/time/type/taskName/progress/owner/areaId）。',
    input_schema: {
      type: 'object',
      properties: {
        date: { type: 'string' },
        type: { type: 'string', enum: ['progress', 'material', 'safety', 'coordination'] },
        areaId: { type: 'string' }
      }
    }
  }
];

// 第一步：user → tool_use
console.log('[POC2] Step 1: 发送 user 消息，期望 LLM 调 queryEvents');
const res1 = await fetch(url, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01'
  },
  body: JSON.stringify({
    model,
    max_tokens: 1024,
    temperature: 0.1,
    tools,
    system: '你是施工日报助手。用户问查询时优先调工具，不要凭空回答。',
    messages: [{ role: 'user', content: '今天木工做了哪些事？' }]
  })
});

const data1 = await res1.json();
const toolUse = data1.content.find(b => b.type === 'tool_use');
const textBlock = data1.content.find(b => b.type === 'text');

console.log('  - LLM 文字:', textBlock?.text);
console.log('  - LLM 调用工具:', toolUse?.name, JSON.stringify(toolUse?.input));
console.log('  - stop_reason:', data1.stop_reason);
console.log('  - tool_use_id:', toolUse?.id);
console.log();

if (!toolUse) {
  console.error('❌ Step 1 失败：LLM 没有调用工具');
  process.exit(1);
}

// 模拟工具执行结果
const mockToolResult = [
  { id: 'E001', time: '08:30', type: 'progress', taskName: '大堂吊顶龙骨安装', areaId: 'BAI-A1', progress: '80%', owner: '刘师傅' },
  { id: 'E002', time: '14:00', type: 'progress', taskName: '2号楼木工吊顶', areaId: 'BAI-B2', progress: '50%', owner: '张师傅' }
];

// 第二步：把 tool_result 回灌，期望 LLM 输出自然语言总结
console.log('[POC2] Step 2: 把工具结果回灌，期望 LLM 输出自然语言总结');
const res2 = await fetch(url, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01'
  },
  body: JSON.stringify({
    model,
    max_tokens: 1024,
    temperature: 0.1,
    tools,
    system: '你是施工日报助手。基于工具结果给用户清晰的中文总结。',
    messages: [
      { role: 'user', content: '今天木工做了哪些事？' },
      { role: 'assistant', content: data1.content },  // ← LLM 之前的完整响应
      {
        role: 'user',
        content: [{
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: JSON.stringify(mockToolResult)
        }]
      }
    ]
  })
});

const data2 = await res2.json();
console.log('  - HTTP', res2.status);
console.log('  - stop_reason:', data2.stop_reason);
console.log('  - content blocks:', data2.content.map(b => b.type).join(', '));

const finalText = data2.content.find(b => b.type === 'text')?.text;
console.log('  - LLM 最终回答:');
console.log('    ' + (finalText || '(空)').split('\n').join('\n    '));
console.log();

if (data2.stop_reason === 'end_turn' && finalText) {
  console.log('✅ [结论] LLM 在收到 tool_result 后能正确总结并 end_turn');
  console.log('   - 完整 ReAct 链路 OK：user → tool_use → tool_result → final answer');
  console.log('   - 可以进入实际改造阶段');
} else if (data2.stop_reason === 'tool_use') {
  console.log('⚠️ [结论] LLM 在收到结果后又调了工具（可能描述不够，需要再来一轮）');
} else {
  console.log('❓ [结论] 响应异常');
}
