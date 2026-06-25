// ============================================================
// server.js - 日报系统后端入口
// 职责：
//   1. 读父级 .env（不修改）
//   2. 启动 Express + CORS
//   3. 代理 LLM 请求到 Minmax
//   4. 提供降级：LLM 失败时回退到规则化 mock
// ============================================================

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';
import { MinMaxClient } from './llm-client.js';
import { query } from './db.js';
import { mockParseVoice, mockParsePhoto, mockAggregateWeekly, mockOptimizeText } from './mock-fallback.js';
import router from './routes.js';
import { createWsServer, broadcastInspection } from './ws-server.js';
import os from 'os';
import { buildChatContext } from './chat-context.js';
import { TOOLS, executeTool, getToolDescriptions } from './llm-tools.js';
import { createMemory, recordQuery, recordAction, recordPreference } from './chat-memory.js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 关键：读同级 .env
const ENV_PATH = path.resolve(__dirname, '../.env');
dotenv.config({ path: ENV_PATH });
console.log('[启动] 加载 .env:', ENV_PATH);

// LLM 配置
const LLM_CONFIG = {
  apiKey: process.env.MINIMAX_API_KEY,
  baseUrl: process.env.MINIMAX_BASE_URL,
  model: process.env.MINIMAX_MODEL,
  maxTokens: parseInt(process.env.MINIMAX_MAX_TOKENS) || 4096,
  temperature: parseFloat(process.env.MINIMAX_TEMPERATURE) || 0.5,
  groupId: process.env.MINIMAX_GROUP_ID,
  protocol: process.env.MINIMAX_PROTOCOL || 'anthropic'  // 'anthropic' | 'openai'
};

console.log('[启动] LLM 配置:');
console.log('  - baseUrl:', LLM_CONFIG.baseUrl);
console.log('  - model:', LLM_CONFIG.model);
console.log('  - apiKey:', LLM_CONFIG.apiKey ? LLM_CONFIG.apiKey.slice(0, 8) + '...' + LLM_CONFIG.apiKey.slice(-4) : '(未设置)');
console.log('  - groupId:', LLM_CONFIG.groupId || '(未设置)');
console.log('  - maxTokens:', LLM_CONFIG.maxTokens);
console.log('  - temperature:', LLM_CONFIG.temperature);

if (!LLM_CONFIG.apiKey) {
  console.warn('[警告] MINIMAX_API_KEY 未设置，所有 LLM 请求将自动降级为 mock');
}

const llm = new MinMaxClient(LLM_CONFIG);

// ============================================================
// Express 启动
// ============================================================
const app = express();
app.use(cors());
app.use(express.json({ limit: '20mb' })); // 照片 base64 可能很大

// 简易请求日志
app.use((req, res, next) => {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${req.method} ${req.url}`);
  next();
});

// ============================================================
// 路由
// ============================================================

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    llm: {
      configured: !!LLM_CONFIG.apiKey,
      baseUrl: LLM_CONFIG.baseUrl,
      model: LLM_CONFIG.model,
      groupId: LLM_CONFIG.groupId
    }
  });
});

// 读 LLM 配置（脱敏）
app.get('/api/llm/config', (req, res) => {
  res.json({
    provider: 'MiniMax',
    baseUrl: LLM_CONFIG.baseUrl,
    model: LLM_CONFIG.model,
    maxTokens: LLM_CONFIG.maxTokens,
    temperature: LLM_CONFIG.temperature,
    groupId: LLM_CONFIG.groupId,
    apiKeyMasked: LLM_CONFIG.apiKey ? LLM_CONFIG.apiKey.slice(0, 8) + '****' + LLM_CONFIG.apiKey.slice(-4) : null,
    configured: !!LLM_CONFIG.apiKey
  });
});

// 测试 LLM 连接
app.post('/api/llm/test', async (req, res) => {
  const start = Date.now();
  const { model, baseUrl, apiKey, protocol } = req.body;
  try {
    const reply = await llm.chat({
      system: '你是一个有用的助手。',
      messages: [{
        role: 'user',
        content: '请用一句话简单介绍你自己，控制在 30 字以内。'
      }],
      maxTokens: 100,
      temperature: 0.5,
      model: model,
      override: {
        baseUrl: baseUrl || undefined,
        apiKey: apiKey || undefined,
        protocol: protocol || undefined
      }
    });
    res.json({
      success: true,
      reply: reply,
      latencyMs: Date.now() - start,
      model: model || LLM_CONFIG.model
    });
  } catch (e) {
    res.status(500).json({
      success: false,
      error: e.message,
      latencyMs: Date.now() - start
    });
  }
});

// 语音解析
app.post('/api/parse-voice', async (req, res) => {
  const { text, projectId, areas, workers } = req.body;
  if (!text) return res.status(400).json({ error: 'text 不能为空' });

  const start = Date.now();
  try {
    const result = await llm.parseVoice({ text, projectId, areas, workers });
    res.json({ source: 'llm', latencyMs: Date.now() - start, ...result });
  } catch (e) {
    console.warn('[降级] LLM 语音解析失败，回退 mock:', e.message);
    const result = mockParseVoice(text, projectId, areas, workers);
    res.json({ source: 'mock', latencyMs: Date.now() - start, fallbackReason: e.message, ...result });
  }
});

// 照片解析
app.post('/api/parse-photo', async (req, res) => {
  const { imageBase64, caption, projectId, areas, type } = req.body;
  const start = Date.now();
  
  // 调试日志
  console.log('[照片解析请求]');
  console.log('  projectId:', projectId);
  console.log('  caption:', caption ? caption.slice(0, 50) + '...' : '(空)');
  console.log('  areas:', JSON.stringify(areas));
  console.log('  type:', type);
  
  try {
    const result = await llm.parsePhoto({ imageBase64, caption, projectId, areas, type });
    console.log('[照片解析结果]', JSON.stringify(result));
    res.json({ source: 'llm', latencyMs: Date.now() - start, ...result });
  } catch (e) {
    console.warn('[降级] LLM 照片解析失败，回退 mock:', e.message);
    const result = mockParsePhoto(caption, projectId, areas, type);
    console.log('[Mock解析结果]', JSON.stringify(result));
    res.json({ source: 'mock', latencyMs: Date.now() - start, fallbackReason: e.message, ...result });
  }
});

// 文本优化
app.post('/api/optimize-text', async (req, res) => {
  const { text, projectId } = req.body;
  if (!text) return res.status(400).json({ error: 'text 不能为空' });

  const start = Date.now();
  try {
    const result = await llm.optimizeText({ text, projectId });
    res.json({ source: 'llm', latencyMs: Date.now() - start, ...result });
  } catch (e) {
    console.warn('[降级] LLM 文本优化失败，回退 mock:', e.message);
    const result = mockOptimizeText(text);
    res.json({ source: 'mock', latencyMs: Date.now() - start, fallbackReason: e.message, ...result });
  }
});

// 周报聚合
app.post('/api/aggregate-weekly', async (req, res) => {
  const { projectId, projectName, client, weekStart, weekEnd, events, issues, areas } = req.body;
  if (!events) return res.status(400).json({ error: 'events 不能为空' });

  const start = Date.now();
  try {
    const result = await llm.aggregateWeekly({ projectId, projectName, client, weekStart, weekEnd, events, issues, areas });
    res.json({ source: 'llm', latencyMs: Date.now() - start, ...result });
  } catch (e) {
    console.warn('[降级] LLM 周报聚合失败，回退 mock:', e.message);
    const result = mockAggregateWeekly({ projectId, projectName, client, weekStart, weekEnd, events, issues, areas });
    res.json({ source: 'mock', latencyMs: Date.now() - start, fallbackReason: e.message, ...result });
  }
});

// ============================================================
// 挂载 DB 路由（会话、设置等 CRUD）
// ============================================================
app.use(router);

// ============================================================
// WebSocket
// ============================================================
const server = http.createServer(app);
const wss = createWsServer(server);

// ============================================================
// 聊天主端点 — ReAct 循环 + 工具调用
// ============================================================
const MAX_REACT_ITERATIONS = 15;

app.post('/api/chat', async (req, res) => {
  const { message, history, projectId, date, sessionId, permLevel, model, baseUrl, apiKey, protocol } = req.body;
  if (!message) return res.status(400).json({ error: 'message required' });

  const start = Date.now();
  const pid = projectId || 'baicaoyuan';
  const d = date || new Date().toISOString().slice(0, 10);
  // 客户端可以临时指定 model（来自设置页切换的自定义模型）；不传则用 .env 默认
  const chatModel = (model && String(model).trim()) || LLM_CONFIG.model;
  const overrideBaseUrl = (baseUrl && String(baseUrl).trim()) || null;
  const overrideApiKey = (apiKey && String(apiKey).trim()) || null;
  const overrideProtocol = (protocol && String(protocol).trim()) || null;
  if (chatModel !== LLM_CONFIG.model || overrideBaseUrl || overrideProtocol) {
    console.log(`[chat] 使用临时覆盖: model=${chatModel} baseUrl=${overrideBaseUrl || LLM_CONFIG.baseUrl} protocol=${overrideProtocol || LLM_CONFIG.protocol || 'anthropic'}`);
  }

  try {
    // 1. 构建上下文（本地模型上下文窗口小，限制数据量）
    const ctx = await buildChatContext(pid, d);
    if (overrideProtocol === 'openai') {
      // 截断事件，只保留最近 5 条，避免本地小模型 context 溢出
      if (ctx.today?.events?.length > 5) ctx.today.events = ctx.today.events.slice(-5);
      if (ctx.today?.plans?.length > 5) ctx.today.plans = ctx.today.plans.slice(-5);
    }

    // 2. 构建系统提示
    const toolDescs = getToolDescriptions();
    const systemPrompt = `你是一个智能施工日报助手，负责查询和录入施工现场数据。

## 可用工具（通过 tool_use 调用）
${toolDescs}

## 项目上下文
${ctx.contextText || '暂无上下文数据'}

## 回复规则
1. 查询类请求：先调用查询工具（queryEvents/queryPlans/queryIssues/getStats/comparePlansVsActuals/queryConstructionData/queryProjects），然后基于结果生成自然语言回复。
2. 录入类请求：直接调用写入工具（createEvent/updateEvent/closeIssue/createPlan/createAttendance），无需先查询。
3. 闲聊/咨询类请求：直接回复，不调用工具。
4. 写入操作：默认自动执行（除非用户明确要求先 dryRun 预览）。
5. 回复用中文，简洁专业。

## 工具调用格式
当你需要调用工具时，回复格式为：
[TOOL_USE:name=工具名,params={参数JSON}]

## 重要
- 收到工具执行结果后，直接用自然语言回复用户，**不要重复或引用工具结果的原始内容**
- 查询事件时默认查今日（${d}），除非用户指定日期
- 创建事件时 type 用：progress/material/safety/coordination/attendance/drawing
- 更新事件时必须先用 queryEvents 找到正确的事件 ID
- 写入操作完成后简要告知用户结果`;

    // 3. 构建消息历史
    const messages = [];
    if (history && history.length > 0) {
      messages.push(...history.slice(-10));
    }
    messages.push({ role: 'user', content: message });

    // 4. ReAct 循环
    let iterations = 0;
    let reply = '';
    const actions = [];
    const results = [];
    let pendingActions = [];
    const memory = createMemory();
    let currentMessages = [...messages];

    while (iterations < MAX_REACT_ITERATIONS) {
      iterations++;

      // 调用 LLM
      const rawReply = await llm.chat({
        system: systemPrompt,
        messages: currentMessages,
        maxTokens: 4096,
        temperature: 0.3,
        model: chatModel,
        override: {
          baseUrl: overrideBaseUrl || undefined,
          apiKey: overrideApiKey || undefined,
          protocol: overrideProtocol || undefined
        }
      });

      // 解析工具调用
      const toolMatch = rawReply.match(/\[TOOL_USE:name=(\w+),params=(\{[\s\S]*?\})\]/);

      if (toolMatch) {
        const toolName = toolMatch[1];
        const toolParams = JSON.parse(toolMatch[2]);

        // 记录查询历史
        if (toolName.startsWith('query') || toolName === 'getStats' || toolName === 'comparePlansVsActuals') {
          recordQuery(memory, toolName, toolParams, 0);
        }

        try {
          const toolResult = await executeTool(toolName, toolParams, {
            projectId: pid,
            date: d,
            permLevel: permLevel || 'allow'
          });

          // 记录动作历史
          if (toolName.startsWith('create') || toolName.startsWith('update') || toolName.startsWith('close') || toolName.startsWith('delete')) {
            recordAction(memory, toolName, toolParams.id || toolParams.eventId || 'unknown');
          }

          const resultText = typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult, null, 2);

          // 如果是写入工具，记录结果
          if (!toolName.startsWith('query') && toolName !== 'getStats' && toolName !== 'comparePlansVsActuals' && toolName !== 'triggerInspection' && toolName !== 'queryProjects') {
            actions.push({ type: toolName, data: toolParams });
            results.push({ ok: true, message: resultText.slice(0, 200) });
          }

          // 回灌工具结果（只喂原始结果，不加 [TOOL_RESULT] 包装，防止 LLM 回显）
          currentMessages.push({
            role: 'assistant',
            content: rawReply
          });
          currentMessages.push({
            role: 'user',
            content: `工具执行结果 (${toolName}):\n${resultText}`
          });

        } catch (e) {
          console.warn(`[chat] 工具执行失败: ${toolName}`, e.message);
          currentMessages.push({
            role: 'assistant',
            content: rawReply
          });
          currentMessages.push({
            role: 'user',
            content: `工具执行出错 (${toolName}): ${e.message}`
          });
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

    // 5. 保存对话到数据库
    if (sessionId) {
      try {
        await query('INSERT INTO dr_chat_messages (id, session_id, role, content) VALUES (gen_random_uuid(), $1, $2, $3)', [sessionId, 'user', message]);
        await query('INSERT INTO dr_chat_messages (id, session_id, role, content) VALUES (gen_random_uuid(), $1, $2, $3)', [sessionId, 'assistant', reply]);
        await query('UPDATE dr_chat_sessions SET updated_at = NOW() WHERE id = $1', [sessionId]);
      } catch (e) {
        console.warn('[chat] 保存消息失败:', e.message);
      }
    }

    res.json({
      reply,
      source: 'llm',
      latencyMs: Date.now() - start,
      iterations,
      actions,
      results,
      pendingActions,
      model: chatModel
    });

  } catch (e) {
    console.warn('[降级] LLM 聊天失败，回退 mock:', e.message);
    res.json({
      reply: `抱歉，LLM 暂时不可用：${e.message}`,
      source: 'mock',
      latencyMs: Date.now() - start,
      fallbackReason: e.message
    });
  }
});

// ============================================================
// 聊天辅助端点
// ============================================================

app.post('/api/chat/authorize', (req, res) => {
  const { pendingId } = req.body || {};
  res.json({ ok: true, action: { type: 'authorized' }, result: { message: '操作已授权' } });
});

app.post('/api/chat/reject', (req, res) => {
  res.json({ ok: true });
});

app.post('/api/chat/inspect', (req, res) => {
  broadcastInspection(wss);
  res.json({ ok: true, message: '巡检提醒已发送' });
});

app.post('/api/settings/inspection', async (req, res) => {
  try {
    const { initDatabase } = await import('./db.js');
    await initDatabase();
    const { query } = await import('./db.js');
    await query(
      `INSERT INTO dr_settings (key, value, updated_at) VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $2::jsonb, updated_at = NOW()`,
      ['inspection_times', JSON.stringify(req.body)]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================================
// 启动
// ============================================================
const PORT = process.env.BACKEND_PORT || 3010;
server.listen(PORT, '0.0.0.0', async () => {
  // 初始化数据库（静默，失败不影响启动）
  try {
    const { initDatabase } = await import('./db.js');
    await initDatabase();
    console.log('  ✅ 数据库已初始化');
  } catch (e) {
    console.log('  ⚠️ 数据库初始化失败（聊天功能不可用）:', e.message);
  }

  // 收集局域网IPv4地址
  const networkInterfaces = os.networkInterfaces();
  const lanIps = [];
  Object.values(networkInterfaces).forEach(adapterList => {
    adapterList.forEach(netInfo => {
      // 筛选非本地回环的IPv4局域网地址
      if (netInfo.family === 'IPv4' && !netInfo.internal) {
        lanIps.push(netInfo.address);
      }
    });
  });

  console.log(`\n========================================`);
  console.log(`  日报后端已启动`);
  console.log(`  本机访问: http://localhost:${PORT}`);
  console.log(`  局域网访问地址：`);
  if (lanIps.length > 0) {
    lanIps.forEach(ip => console.log(`    http://${ip}:${PORT}`));
  } else {
    console.log(`    未检测到局域网网卡，请检查WiFi/网线连接`);
  }
  console.log(`  健康检查: http://localhost:${PORT}/api/health`);
  console.log(`========================================\n`);
});
