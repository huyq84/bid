// ============================================================
// react-engine.js — 增强版 ReAct 引擎
// 解决 5 个关键问题：
//   1. 支持嵌套 JSON 的正则解析（栈匹配大括号深度）
//   2. 支持单次回复中多个 [TOOL_USE] 调用
//   3. 工具结果截断 + 防回显
//   4. 上下文膨胀管理——超长历史自动摘要压缩
//   5. 无进展检测——防止 LLM 死循环
// ============================================================

import { executeTool } from './llm-tools.js';
import { query } from './db.js';

const MAX_RESULT_CHARS = 500;        // 工具结果截断长度
const MAX_HISTORY_CHARS = 8000;      // 消息历史最大字符数，超过则压缩
const MAX_CONSECUTIVE_SAME_TOOL = 3; // 同一工具连续调用阈值
const STALE_WINDOW = 5;              // 连续多少轮无新进展判定为停滞

// ==================== 问题 #1: 增强解析 ====================

/**
 * 从 LLM 回复中解析所有 [TOOL_USE] 调用
 * 用栈匹配大括号深度，正确处理嵌套 JSON
 * 返回 [{toolName, toolParams, rawReply, fullReply}]
 */
function parseAllToolCalls(reply) {
  const calls = [];
  // P16 修复: 支持三种 LLM 格式
  // 格式1: [TOOL_USE:name=xxx,params={JSON}] (系统 prompt 标准格式, name= 后面是工具名)
  // 格式2: [TOOL_USE:toolName,key=val] (LLM 简写,无 params= 关键字)
  // 格式3: [TOOL_USE:toolName,params={JSON}] (混合,无 name= 前缀)
  // 注意: [^\\]] 匹配除 ] 外的字符(JS 正则中 [^]] 不合法)

  // 先尝试格式1和格式3 (params=JSON) — name= 可有可无
  const paramsRegex = /\[TOOL_USE:(?:name=)?(\w+),params=(\{[\s\S]*?\})\]/g;
  let match;

  while ((match = paramsRegex.exec(reply)) !== null) {
    const toolName = match[1];
    const rawParams = match[2];

    // 用栈匹配大括号深度，找到真正的 params 结尾
    let depth = 0;
    let paramEnd = match.index + match[0].length;
    const paramsStart = match.index + match[0].indexOf('{');
    for (let i = paramsStart; i < reply.length; i++) {
      const ch = reply[i];
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) {
          paramEnd = i + 1;
          break;
        }
      }
    }

    // 提取完整 params 字符串（含嵌套大括号）
    const fullParams = reply.slice(paramsStart, paramEnd);

    // 尝试 JSON 解析，失败时尝试修复常见 LLM 输出问题（键无引号、尾随逗号等）
    let toolParams;
    try {
      toolParams = JSON.parse(fullParams);
    } catch (e) {
      console.warn(`[react] JSON 解析失败: ${e.message}, 尝试修复...`);
      // 修复1: 给无引号的键加引号，保留 { 或 , 前缀 ($1)
      let fixed = fullParams;
      fixed = fixed.replace(/([{,])\s*([a-zA-Z_]\w*)\s*:/g, '$1"$2":');
      // 修复1b: 处理 key=value 格式(某些LLM用=而非:) → "key": value
      fixed = fixed.replace(/([{,])\s*([a-zA-Z_]\w*)\s*=/g, '$1"$2":');
      // 修复1c: 给无引号的字符串值加引号（排除数字、布尔、null、已引号字符串、对象、数组）
      fixed = fixed.replace(/:\s*(?!"|true|false|null|\d|\{|\[)([a-zA-Z_]\w*)/g, ': "$1"');
      // 修复2: 去掉尾随逗号
      fixed = fixed.replace(/,\s*([}\]])/g, '$1');
      try {
        toolParams = JSON.parse(fixed);
        console.warn(`[react] 修复后解析成功`);
      } catch (e2) {
        console.warn(`[react] 修复后仍失败: ${e2.message}`);
        continue;
      }
    }

    calls.push({ toolName, toolParams, rawReply: reply });
  }

  // 再尝试格式2 (简写 key=val) — 排除已被格式1/3匹配的位置
  const simpleRegex = /\[TOOL_USE:(\w+),([^\]]+)\]/g;
  while ((match = simpleRegex.exec(reply)) !== null) {
    // 跳过 params= 格式（已被上面处理）
    if (match[0].includes('params=')) continue;

    const toolName = match[1];
    const fullMatch = match[0];
    const inner = fullMatch.slice('[TOOL_USE:'.length, -1); // 去掉 [TOOL_USE: 和 ]
    const params = {};
    // 解析 key=value 或 key="value" — [^\s,]+ 匹配到空格或逗号为止
    const kvRegex = /(\w+)=(?:"([^"]*)"|([^\s,]+))/g;
    let kv;
    while ((kv = kvRegex.exec(inner)) !== null) {
      const key = kv[1];
      const val = kv[2] !== undefined ? kv[2] : kv[3];
      // 尝试转数字
      params[key] = isNaN(val) ? val : Number(val);
    }
    calls.push({ toolName, toolParams: params, rawReply: reply });
  }

  return calls;
}

// ==================== 问题 #3: 工具结果截断 + 防回显 ====================

/**
 * 截断并摘要工具结果，防止上下文爆炸和 LLM 回显
 */
function truncateToolResult(result) {
  const text = typeof result === 'string' ? result : JSON.stringify(result, null, 2);

  if (text.length <= MAX_RESULT_CHARS) return text;

  // 如果是 JSON，尝试保留关键信息
  try {
    const obj = JSON.parse(text);
    const summary = truncateObject(obj, MAX_RESULT_CHARS);
    return summary;
  } catch {
    // 非 JSON，直接截断
    return text.slice(0, MAX_RESULT_CHARS) + `\n\n… (已截断，共 ${text.length} 字符)`;
  }
}

/**
 * 递归截断对象，保留关键结构
 */
function truncateObject(obj, maxChars) {
  if (obj === null || obj === undefined) return String(obj);
  if (typeof obj !== 'object') return String(obj);
  if (Array.isArray(obj)) {
    if (obj.length === 0) return '[]';
    // 数组只保留前 3 项 + 计数
    const preview = obj.slice(0, 3).map(item =>
      typeof item === 'object' ? truncateObject(item, maxChars) : String(item)
    );
    const suffix = obj.length > 3 ? ` …(+${obj.length - 3} more)` : '';
    const result = `[${preview.join(', ')}]${suffix}`;
    return result.length <= maxChars ? result : result.slice(0, maxChars);
  }

  // 对象只保留前 5 个 key
  const keys = Object.keys(obj).slice(0, 5);
  const parts = keys.map(k => {
    const val = obj[k];
    if (typeof val === 'object' && val !== null) {
      return `${k}: ${truncateObject(val, maxChars - k.length - 4)}`;
    }
    return `${k}: ${String(val)}`;
  });
  const result = `{${parts.join(', ')}}`;
  return result.length <= maxChars ? result : result.slice(0, maxChars);
}

// ==================== 工具结果可读摘要 ====================

/**
 * 为结构化工具结果生成人类可读摘要（无 message 字段时兜底）
 */
function buildToolSummary(toolName, result) {
  // dryRun 类：显示预览信息
  if (result.dryRun === true) {
    if (result.count !== undefined) {
      return `dryRun 预览：将操作 ${result.count} 条记录${result.events ? '（ID: ' + result.events.map(e => e.id).join(', ') + '）' : ''}`;
    }
    if (result.eventId) {
      return `dryRun 预览：将确认事件 ${result.eventId}`;
    }
  }
  // 确认/删除类
  if (result.confirmed) return `已确认 ${result.confirmed} 条记录`;
  if (result.deleted !== undefined) return `已删除 ${result.deleted} 条记录`;
  if (result.created !== undefined) return `已创建 ${result.created} 条记录`;
  if (result.updated !== undefined) return `已更新 ${result.updated} 条记录`;
  // 事件 ID 类
  if (result.eventId) return `操作完成：事件 ${result.eventId}`;
  // 兜底：提取关键数字字段
  const nums = Object.entries(result)
    .filter(([k, v]) => typeof v === 'number' && k !== 'id')
    .map(([k, v]) => `${k}: ${v}`);
  if (nums.length > 0) return `${toolName} 完成：${nums.join(', ')}`;
  // 最终兜底
  return `${toolName} 执行成功`;
}

// ==================== 问题 #4: 上下文压缩 ====================

/**
 * 当消息历史超过 MAX_HISTORY_CHARS 时，压缩早期消息
 * 策略：保留最近 N 条完整消息，更早的消息合并为一条摘要
 */
function compressHistory(messages) {
  if (messages.length <= 3) return messages; // 太短不压缩

  // 计算总字符数
  let totalChars = 0;
  for (const m of messages) {
    totalChars += (m.content || '').length;
  }

  if (totalChars <= MAX_HISTORY_CHARS) return messages;

  // 保留最近 5 条完整消息，更早的合并为摘要
  const KEEP_FULL = 5;
  const toCompress = messages.slice(0, messages.length - KEEP_FULL);
  const keep = messages.slice(messages.length - KEEP_FULL);

  if (toCompress.length === 0) return messages;

  // 生成摘要
  const userMessages = toCompress.filter(m => m.role === 'user');
  const assistantMessages = toCompress.filter(m => m.role === 'assistant' && !m.content.includes('[TOOL_USE]'));
  const toolResults = toCompress.filter(m => m.role === 'user' && m.content.startsWith('工具执行结果'));

  let summaryParts = [];
  if (userMessages.length > 0) {
    summaryParts.push(`用户消息 ${userMessages.length} 条（已压缩）`);
  }
  if (assistantMessages.length > 0) {
    summaryParts.push(`助手回复 ${assistantMessages.length} 条（已压缩）`);
  }
  if (toolResults.length > 0) {
    // 统计工具调用类型
    const toolCounts = {};
    for (const tr of toolResults) {
      const match = tr.content.match(/工具执行结果 \((\w+)\)/);
      if (match) {
        toolCounts[match[1]] = (toolCounts[match[1]] || 0) + 1;
      }
    }
    summaryParts.push(`工具调用 ${Object.entries(toolCounts).map(([k, v]) => `${k}: ${v}次`).join(', ')}`);
  }

  const summary = `[历史摘要（早期消息已压缩）] ${summaryParts.join(' | ')}`;

  return [
    { role: 'user', content: summary },
    ...keep
  ];
}

// ==================== 问题 #5: 无进展检测 ====================

/**
 * 检测 LLM 是否在死循环——连续多次调用相同工具或返回相似结果
 * 返回 true = 检测到停滞，应该终止
 */
function detectStaleLoop(toolHistory) {
  if (toolHistory.length < STALE_WINDOW) return false;

  // 取最近 STALE_WINDOW 轮
  const recent = toolHistory.slice(-STALE_WINDOW);

  // 检测 1: 同一工具 + 相同参数 连续调用超过阈值
  // 用 "toolName:paramHash" 作为 key，区分不同参数的调用
  const toolCounts = {};
  for (const t of recent) {
    const key = typeof t === 'string' ? t : `${t.name}:${hashParams(t.params)}`;
    toolCounts[key] = (toolCounts[key] || 0) + 1;
  }
  for (const [key, count] of Object.entries(toolCounts)) {
    if (count >= MAX_CONSECUTIVE_SAME_TOOL) {
      const toolName = key.split(':')[0];
      console.warn(`[react] 检测到死循环: 工具 "${toolName}" 以相同参数连续调用 ${count} 次`);
      return true;
    }
  }

  // 检测 2: 连续多轮工具结果完全相同（说明 LLM 在原地打转）
  const results = recent.map(t => typeof t === 'object' ? JSON.stringify(t) : String(t));
  if (results.length >= 3) {
    const lastThree = results.slice(-3);
    if (lastThree[0] === lastThree[1] && lastThree[1] === lastThree[2]) {
      console.warn('[react] 检测到死循环: 连续 3 轮工具结果完全相同');
      return true;
    }
  }

  return false;
}

/**
 * 对 params 对象生成简短 hash，用于死循环检测
 */
function hashParams(params) {
  if (!params || typeof params !== 'object') return String(params);
  return JSON.stringify(Object.keys(params).sort().reduce((acc, k) => {
    acc[k] = params[k];
    return acc;
  }, {}));
}

// ==================== 主引擎 ====================

/**
 * 执行 ReAct 循环
 * @param {object} options
 * @param {object} options.llm - MinMaxClient 实例
 * @param {string} options.systemPrompt - 系统提示
 * @param {Array} options.messages - 初始消息历史 [{role, content}]
 * @param {number} options.maxIterations - 最大迭代次数（默认 15）
 * @param {string} options.chatModel - 模型名
 * @param {object} options.override - 覆盖配置
 * @param {object} options.ctx - 工具执行上下文 {projectId, date, permLevel}
 * @returns {Promise<object>} { reply, actions, results, pendingActions, iterations, model }
 */
export async function runReactLoop(options) {
  const {
    llm,
    systemPrompt,
    messages,
    maxIterations = 15,
    chatModel,
    override,
    ctx
  } = options;

  let iterations = 0;
  let reply = '';
  const actions = [];
  const results = [];
  const pendingActions = [];
  let currentMessages = [...messages];
  const toolHistory = []; // 记录工具调用历史，用于死循环检测

  while (iterations < maxIterations) {
    iterations++;

    // 上下文压缩（问题 #4）
    currentMessages = compressHistory(currentMessages);

    // 调用 LLM
    const rawReply = await llm.chat({
      system: systemPrompt,
      messages: currentMessages,
      maxTokens: 4096,
      temperature: 0.3,
      model: chatModel,
      override
    });

    // 调试：打印 rawReply 前 200 字符
    console.log(`[react] iter${iterations} rawReply(${rawReply.length} chars):`, rawReply.slice(0, 200));

    // 增强解析：支持多个 [TOOL_USE] 调用（问题 #1）
    const toolCalls = parseAllToolCalls(rawReply);
    console.log(`[react] iter${iterations} toolCalls:`, toolCalls.length, toolCalls.map(c => c.toolName));

    if (toolCalls.length > 0) {
      // 处理所有工具调用（按顺序）
      for (const call of toolCalls) {
        const { toolName, toolParams } = call;

        // 记录到死循环检测历史（工具名 + 参数，区分不同参数的调用）
        toolHistory.push({ name: toolName, params: toolParams });

        try {
          const toolResult = await executeTool(toolName, toolParams, {
            projectId: ctx.projectId,
            date: ctx.date,
            permLevel: ctx.permLevel || 'allow'
          });

          // 检查是否需要用户授权（pending action）
          if (toolResult && toolResult.needsConfirm && toolResult.pendingAction) {
            pendingActions.push(toolResult.pendingAction);
            // 不记录到 actions/results，等用户授权后再执行
            // 回灌"需要授权"信息给 LLM
            currentMessages.push({
              role: 'assistant',
              content: rawReply
            });
            currentMessages.push({
              role: 'user',
              content: `⚠️ 操作需要用户授权: ${toolResult.pendingAction.summary}\n请等待用户确认后继续。`
            });
            continue;
          }

          // 截断工具结果（问题 #3）
          const truncatedResult = truncateToolResult(toolResult);

          // 记录结果
          const isQuery = toolName.startsWith('query') ||
                          toolName === 'getStats' ||
                          toolName === 'comparePlansVsActuals' ||
                          toolName === 'triggerInspection' ||
                          toolName === 'queryProjects';

          if (!isQuery) {
            actions.push({ type: toolName, data: toolParams });
            // P13 修复: 优先提取 result.message(人类可读),而非整个 JSON.stringify
            let humanMsg;
            if (toolResult && typeof toolResult === 'object' && toolResult.message) {
              humanMsg = String(toolResult.message).slice(0, 200);
            } else if (typeof toolResult === 'string') {
              // 工具直接返回字符串(非对象),直接用,不 JSON.stringify
              humanMsg = toolResult.slice(0, 200);
            } else if (toolResult && typeof toolResult === 'object') {
              // 结构化结果但无 message：生成可读摘要
              humanMsg = buildToolSummary(toolName, toolResult);
            } else {
              humanMsg = truncatedResult.slice(0, 200);
            }
            results.push({
              ok: toolResult?.ok !== false,
              message: humanMsg,
              action: { type: toolName, data: toolParams }
            });
          }

          // 回灌工具结果（问题 #3: 用截断后的文本，防止回显）
          currentMessages.push({
            role: 'assistant',
            content: rawReply
          });
          currentMessages.push({
            role: 'user',
            content: `工具执行结果 (${toolName}):\n${truncatedResult}`
          });
          // DEBUG: 打印回灌内容
          console.log(`[react] 回灌工具结果: ${toolName} → ${truncatedResult.slice(0, 300)}`);

        } catch (e) {
          console.warn(`[react] 工具执行失败: ${toolName}`, e.message);
          currentMessages.push({
            role: 'assistant',
            content: rawReply
          });
          currentMessages.push({
            role: 'user',
            content: `工具执行出错 (${toolName}): ${e.message}`
          });
        }

        // 无进展检测（问题 #5）
        if (detectStaleLoop(toolHistory)) {
          console.warn('[react] 检测到死循环，终止 ReAct 循环');
          reply = '抱歉，我似乎陷入了循环，无法继续处理。请换个说法试试。';
          return {
            reply,
            source: 'llm',
            iterations,
            actions,
            results,
            pendingActions,
            model: chatModel,
            stopped: 'stale_loop'
          };
        }
      }
    } else {
      // 没有工具调用，回复结束
      reply = rawReply;
      break;
    }
  }

  if (!reply) {
    reply = '抱歉，我暂时无法回答这个问题。';
  }

  // P11/P16 修复: 从 reply 中移除 [TOOL_USE:...] 块（支持 name=xxx,params={} 和 简写 key=val 格式）
  // (?:name=)? 匹配可选的 name= 前缀
  const cleanReply = reply.replace(/\[TOOL_USE:(?:name=)?\w+(?:,params=\{[\s\S]*?\}|,[^\]]+)?\]/g, '').trim();

  // P11 修复: 收集所有 toolCalls（从 actions 中提取）
  const toolCalls = actions.map((a, i) => ({
    name: a.type,
    params: a.data,
    result: results[i] || null
  }));

  // P18 修复: cleanReply 为空时返回友好提示，不要 fallback 到含 [TOOL_USE] 的原文
  let finalReply = results.length > 0
    ? `已执行 ${results.length} 个操作：${results.map(r => r.message).join('；')}`
    : (cleanReply || '抱歉，我暂时无法回答这个问题。');

  return {
    reply: finalReply,
    toolCalls,  // P11: 新增结构化工具调用列表
    source: 'llm',
    iterations,
    actions,
    results,
    pendingActions,
    model: chatModel,
    stopped: iterations >= maxIterations ? 'max_iterations' : undefined
  };
}

// ============================================================
// Agent 模式 — 任务拆解 + 执行循环
// ============================================================

// 内存中的中止标志 Map: taskId → true
export const abortFlags = new Map();

/**
 * 生成唯一的任务 ID
 */
function generateTaskId() {
  return 'task_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
}

/**
 * 广播任务进度到前端（通过 WebSocket）
 */
function broadcastTaskProgress(wss, taskId, tasks, reply) {
  if (!wss) return;
  const msg = JSON.stringify({
    type: 'task-progress',
    taskId,
    tasks: tasks.map(t => ({ id: t.id, title: t.title, status: t.status })),
    reply: reply || null
  });
  wss.clients.forEach(client => {
    if (client.readyState === 1) client.send(msg);
  });
}

/**
 * 从用户消息中提取 LLM 回复的 JSON
 */
function extractJsonFromText(text) {
  // 查找 {...} 或 [...] 块
  const jsonMatch = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (!jsonMatch) return null;
  try {
    return JSON.parse(jsonMatch[1]);
  } catch {
    return null;
  }
}

/**
 * Agent 模式主循环
 * 1. 任务拆解: 调用 LLM 把用户请求拆解为子任务列表
 * 2. 执行循环: 逐个执行任务，通过 WebSocket 推送进度
 * 3. 中止检测: 每轮检查 abort flag
 * 4. 最终汇总: 所有任务完成后让 LLM 生成总结
 *
 * @param {object} options
 * @param {object} options.llm - MinMaxClient 实例
 * @param {string} options.systemPrompt - 系统提示（含工具描述和项目上下文）
 * @param {string} options.userMessage - 用户原始消息
 * @param {Array} options.messages - 初始消息历史
 * @param {string} options.chatModel - 模型名
 * @param {object} options.override - 覆盖配置
 * @param {object} options.ctx - 工具执行上下文 {projectId, date, permLevel}
 * @param {object} options.wss - WebSocket 服务器实例
 * @returns {Promise<object>} { reply, tasks, taskId, source: 'llm' }
 */
export async function runAgentLoop(options) {
  const { llm, systemPrompt, userMessage, messages, chatModel, override, ctx, wss } = options;
  const taskId = generateTaskId();

  console.log(`[agent] 开始任务拆解: taskId=${taskId}, message="${userMessage.slice(0, 50)}..."`);

  // ==================== 阶段 1: 任务拆解 ====================
  const decomposePrompt = `你是一个任务规划器。请将用户的请求拆解为可执行的子任务列表。

## 规则
1. 如果请求简单（1个工具调用可完成），返回 {"mode": "chat", "reason": "简单查询"}
2. 如果请求复杂（需多步操作），返回 {"mode": "agent", "tasks": [{"id": 1, "title": "子任务标题", "dependsOn": [依赖的id列表]}]}
3. 任务标题用中文，简洁明确
4. dependsOn 是可选的，表示依赖关系
5. 只返回 JSON，不要其他文字

## 业务规则
- "完成今日计划" = 先 queryPlans 找出未完成计划 → 用 createEvent 创建"今日完成工作"事件（记录当天施工内容）→ 最后 updatePlan 把计划进度更新为 100%
- "确认草稿事件" = queryEvents 找出 draft 事件 → confirmEvent 逐个确认
- ⚠️ 任何涉及"完成计划"、"标记完成"、"更新进度"的操作，都必须先 createEvent 再 updatePlan，绝不允许跳过 createEvent

## 示例
用户: "查询今日完成并确认所有草稿事件"
返回: {"mode": "agent", "tasks": [{"id": 1, "title": "查询今日完成事件"}, {"id": 2, "title": "确认所有草稿事件", "dependsOn": [1]}]}

## 当前用户请求
${userMessage}`;

  try {
    const decomposeReply = await llm.chat({
      system: decomposePrompt,
      messages: [{ role: 'user', content: userMessage }],
      maxTokens: 1024,
      temperature: 0.2,
      model: chatModel,
      override
    });
    console.log(`[agent] 拆解结果:`, decomposeReply.slice(0, 300));

    const parsed = extractJsonFromText(decomposeReply);
    if (!parsed || parsed.mode !== 'agent' || !parsed.tasks || parsed.tasks.length <= 1) {
      // 无需拆解，走普通 chat 模式
      console.log(`[agent] 判断为简单请求，走普通 chat 模式`);
      return null; // 返回 null 表示不启用 agent 模式
    }

    const tasks = parsed.tasks.map((t, i) => ({
      id: t.id || (i + 1),
      title: t.title || `任务 ${i + 1}`,
      status: 'pending',
      dependsOn: t.dependsOn || []
    }));

    console.log(`[agent] 拆解为 ${tasks.length} 个子任务:`, tasks.map(t => t.title));

    // 广播初始任务列表到前端
    broadcastTaskProgress(wss, taskId, tasks, null);

    // ==================== 阶段 2: 执行循环 ====================
    const taskResults = [];
    let allActions = [];
    let allResults = [];
    let currentMessages = [...messages];

    for (const task of tasks) {
      // 检查中止标志
      if (abortFlags.has(taskId)) {
        console.log(`[agent] 用户中止, taskId=${taskId}`);
        task.status = 'pending'; // 未开始的任务保持 pending
        broadcastTaskProgress(wss, taskId, tasks, '任务已中止');
        return {
          reply: '任务已中止',
          tasks,
          taskId,
          source: 'llm',
          stopped: 'user_abort'
        };
      }

      // 检查依赖
      const allDepsDone = task.dependsOn.every(depId => {
        const dep = tasks.find(t => t.id === depId);
        return dep && dep.status === 'completed';
      });
      if (!allDepsDone) {
        task.status = 'failed';
        broadcastTaskProgress(wss, taskId, tasks, null);
        continue;
      }

      // 执行任务
      task.status = 'in_progress';
      broadcastTaskProgress(wss, taskId, tasks, null);
      console.log(`[agent] 执行任务 #${task.id}: ${task.title}`);

      // 构造该任务的上下文（注入关键业务约束，防止 LLM 跳过必要步骤）
      const taskMessages = [
        ...currentMessages,
        {
          role: 'user',
          content: `现在请执行子任务 #${task.id}: ${task.title}。请直接调用工具完成，然后简要报告结果。

⚠️ 重要规则：
- 如果要"完成"某个计划（标记完成/进度100%），必须先调用 createEvent 创建 type=progress 的完成事件，再调用 updatePlan 更新进度。绝不要只调 updatePlan 而不调 createEvent
- 事件 ID 必须从 queryEvents 查询获取，禁止编造`
        }
      ];

      try {
        const result = await runReactLoop({
          llm,
          systemPrompt,
          messages: taskMessages,
          maxIterations: 10,
          chatModel,
          override,
          ctx
        });

        if (result.stopped === 'stale_loop') {
          task.status = 'failed';
          taskResults.push({ taskId: task.id, title: task.title, status: 'failed', reason: '死循环' });
        } else {
          task.status = 'completed';
          allActions.push(...(result.actions || []));
          allResults.push(...(result.results || []));
          taskResults.push({ taskId: task.id, title: task.title, status: 'completed', result: result.reply });
          // 把本轮消息追加到 currentMessages 供后续任务参考
          currentMessages.push({ role: 'user', content: `子任务 #${task.id} 完成: ${result.reply}` });
        }
      } catch (e) {
        task.status = 'failed';
        taskResults.push({ taskId: task.id, title: task.title, status: 'failed', reason: e.message });
        console.warn(`[agent] 任务 #${task.id} 执行失败:`, e.message);
      }

      broadcastTaskProgress(wss, taskId, tasks, null);
    }

    // ==================== 阶段 3: 最终汇总 ====================
    const completedCount = tasks.filter(t => t.status === 'completed').length;
    const summaryPrompt = `所有子任务已执行完毕。请生成一个简洁的总结回复。

## 任务完成情况
${tasks.map(t => `- #${t.id} ${t.title}: ${t.status === 'completed' ? '✅ 已完成' : '❌ 失败'}`).join('\n')}

## 各任务结果
${taskResults.map(r => `- #${r.taskId} ${r.title}: ${r.result || r.reason || '无结果'}`).join('\n')}

请用中文回复用户，简洁专业。`;

    try {
      const finalReply = await llm.chat({
        system: summaryPrompt,
        messages: [{ role: 'user', content: '请总结所有任务完成情况。' }],
        maxTokens: 2048,
        temperature: 0.3,
        model: chatModel,
        override
      });

      broadcastTaskProgress(wss, taskId, tasks, finalReply);

      return {
        reply: finalReply,
        tasks,
        taskId,
        source: 'llm',
        actions: allActions,
        results: allResults,
        iterations: tasks.length
      };
    } catch (e) {
      // LLM 总结失败，用简单汇总
      const fallbackReply = `任务执行完毕，共完成 ${completedCount}/${tasks.length} 项。\n${tasks.map(t => `- #${t.id} ${t.title}: ${t.status}`).join('\n')}`;
      broadcastTaskProgress(wss, taskId, tasks, fallbackReply);
      return {
        reply: fallbackReply,
        tasks,
        taskId,
        source: 'llm',
        actions: allActions,
        results: allResults,
        iterations: tasks.length
      };
    }

  } catch (e) {
    // 任务拆解失败，fallback 到普通 chat
    console.warn(`[agent] 任务拆解失败:`, e.message, '→ fallback 到普通 chat');
    return null;
  }
}
