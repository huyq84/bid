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

  // 检测 1: 同一工具连续调用超过阈值
  const toolCounts = {};
  for (const t of recent) {
    toolCounts[t] = (toolCounts[t] || 0) + 1;
  }
  for (const [tool, count] of Object.entries(toolCounts)) {
    if (count >= MAX_CONSECUTIVE_SAME_TOOL) {
      console.warn(`[react] 检测到死循环: 工具 "${tool}" 连续调用 ${count} 次`);
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

    // 增强解析：支持多个 [TOOL_USE] 调用（问题 #1）
    const toolCalls = parseAllToolCalls(rawReply);

    if (toolCalls.length > 0) {
      // 处理所有工具调用（按顺序）
      for (const call of toolCalls) {
        const { toolName, toolParams } = call;

        // 记录到死循环检测历史
        toolHistory.push(toolName);

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

  return {
    reply: cleanReply || reply,  // 如果清理后为空,保留原文(防止空回复)
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
