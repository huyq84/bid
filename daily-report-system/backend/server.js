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
import router, { setWss } from './routes.js';
import { getBeijingDate } from './timezone.js';
import { createWsServer, broadcastInspection, broadcastRefresh } from './ws-server.js';
import os from 'os';
import { buildChatContext } from './chat-context.js';
import { TOOLS, executeTool, getToolDescriptions } from './llm-tools.js';
import { createMemory, recordQuery, recordAction, recordPreference } from './chat-memory.js';
import { runReactLoop, runAgentLoop, abortFlags } from './react-engine.js';
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

// 周报聚合 V2: GET 端点 + 后端自己读 DB（修复 CLAUDE.md 中"尚未实现"项）
// 前端只传 projectId + weekStart + weekEnd,后端从 dr_events / dr_issues 读 7 天数据调 LLM
app.get('/api/aggregate/weekly', async (req, res) => {
  const { projectId, weekStart, weekEnd } = req.query;
  if (!projectId || !weekStart || !weekEnd) {
    return res.status(400).json({ error: 'projectId, weekStart, weekEnd required' });
  }
  const start = Date.now();
  try {
    // 1. 查项目基本信息
    const projRes = await query('SELECT id, name, client, location FROM dr_projects WHERE id=$1', [projectId]);
    if (projRes.rows.length === 0) return res.status(404).json({ error: `项目 ${projectId} 不存在` });
    const project = projRes.rows[0];

    // 2. 查 7 天 events
    const evRes = await query(
      `SELECT id, project_id, date, time, type, area_id, plan_id, payload, submitter, source, status, voice_text, note, completion_type, building_no, floor_no, owner, task_name
       FROM dr_events
       WHERE project_id=$1 AND date BETWEEN $2 AND $3
       ORDER BY date, time`,
      [projectId, weekStart, weekEnd]
    );
    const events = evRes.rows;

    // 3. 查 7 天 issues
    const isRes = await query(
      `SELECT id, project_id, type, title, area_id, priority, status, created_date, deadline, owner, description, resolution, photos, propose_dept, cooperate_dept
       FROM dr_issues
       WHERE project_id=$1 AND (
         (created_date BETWEEN $2 AND $3) OR
         (status != 'closed' AND deadline BETWEEN $2 AND $3)
       )
       ORDER BY priority DESC, created_date`,
      [projectId, weekStart, weekEnd]
    );
    const issues = isRes.rows;

    // 4. 查项目区域
    const arRes = await query(
      'SELECT id, name, floor, manager FROM dr_areas WHERE project_id=$1 ORDER BY id',
      [projectId]
    );
    const areas = arRes.rows;

    // 5. 调 LLM 聚合（失败降级 mock）
    try {
      const result = await llm.aggregateWeekly({
        projectId, projectName: project.name, client: project.client,
        weekStart, weekEnd, events, issues, areas
      });
      return res.json({
        source: 'llm',
        latencyMs: Date.now() - start,
        eventsCount: events.length,
        issuesCount: issues.length,
        ...result
      });
    } catch (e) {
      console.warn('[降级] /api/aggregate/weekly LLM 失败,回退 mock:', e.message);
      const result = mockAggregateWeekly({
        projectId, projectName: project.name, client: project.client,
        weekStart, weekEnd, events, issues, areas
      });
      return res.json({
        source: 'mock',
        latencyMs: Date.now() - start,
        eventsCount: events.length,
        issuesCount: issues.length,
        fallbackReason: e.message,
        ...result
      });
    }
  } catch (e) {
    console.error('[aggregate/weekly] error:', e);
    res.status(500).json({ error: e.message });
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

// Inject wss into routes for broadcast
setWss(wss);

// ============================================================
// 聊天主端点 — 增强版 ReAct 引擎
// ============================================================
const MAX_REACT_ITERATIONS = 15;

app.post('/api/chat', async (req, res) => {
  const { message, history, projectId, date, sessionId, permLevel, model, baseUrl, apiKey, protocol, mode } = req.body;
  if (!message) return res.status(400).json({ error: 'message required' });

  const start = Date.now();
  const pid = projectId || 'baicaoyuan';
  const d = date || getBeijingDate();
  const chatModel = (model && String(model).trim()) || LLM_CONFIG.model;
  const overrideBaseUrl = (baseUrl && String(baseUrl).trim()) || null;
  const overrideApiKey = (apiKey && String(apiKey).trim()) || null;
  const overrideProtocol = (protocol && String(protocol).trim()) || null;
  if (chatModel !== LLM_CONFIG.model || overrideBaseUrl || overrideProtocol) {
    console.log(`[chat] 使用临时覆盖: model=${chatModel} baseUrl=${overrideBaseUrl || LLM_CONFIG.baseUrl} protocol=${overrideProtocol || LLM_CONFIG.protocol || 'anthropic'}`);
  }

  try {
    // 1. 构建上下文
    const ctx = await buildChatContext(pid, d);
    if (overrideProtocol === 'openai') {
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
1. 查询类请求：先调用查询工具，然后基于结果生成自然语言回复。
2. 录入类请求：直接调用写入工具，无需先查询。
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
- 写入操作完成后简要告知用户结果
- ⚠️ **数据以工具执行结果为准，不要依赖对话历史中的旧状态**。当工具结果与之前对话矛盾时，以工具结果为准，不要编造或沿用之前的结论
- 🚫 **禁止空口回复**：当用户要求执行操作（如"取消确认"、"删除"、"修改"等）时，**必须调用对应的工具**（如 unconfirmEvent），绝不能用自然语言假装已完成。未调用工具就等于未执行
- 🚫 **禁止编造 ID**：事件 ID 必须从 queryEvents 查询结果中获取（格式如 E00593035），绝不凭空编造
- 🚫 **禁止"重试"空话**：当用户要求执行操作时，**立即调用工具**，不要说"让我重试"、"换一种方式"等废话，不要解释过程，直接执行
- ⚠️ **完成计划必须先创建事件**：当用户要求"完成计划"、"标记完成"时，必须先调用 createEvent 创建一条 type=progress 的完成事件（记录当天施工内容），再调用 updatePlan 更新进度为 100%。绝不要跳过 createEvent 直接 updatePlan`;

    // 3. 构建消息历史
    const messages = [];
    if (history && history.length > 0) {
      messages.push(...history.slice(-10));
    }
    messages.push({ role: 'user', content: message });

    // P0-1 修复：把"保存 user 消息"提到 runReactLoop 之前，确保 LLM 失败时 user 也不丢
    // P0-4 修复：ID 统一为 cm_${Date.now()}_${rand}，与 routes.js POST /api/chat/messages 一致
    let userMsgId = null;
    let sessionValid = true; // 标记 session 是否还存在（删除后外键会失败）

    // 检查 session 是否存在（避免每次插入都触发外键错误）
    if (sessionId) {
      const sessCheck = await query('SELECT id FROM dr_chat_sessions WHERE id=$1', [sessionId]);
      if (sessCheck.rows.length === 0) {
        sessionValid = false;
        console.warn(`[chat] session ${sessionId} 不存在，跳过消息持久化（可能已被删除）`);
      }
    }

    const persistMessage = async (role, content) => {
      if (!sessionId || !sessionValid) return null;
      try {
        const id = 'cm_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        await query('INSERT INTO dr_chat_messages (id, session_id, role, content) VALUES ($1, $2, $3, $4)', [id, sessionId, role, content]);
        await query('UPDATE dr_chat_sessions SET updated_at = NOW() WHERE id = $1', [sessionId]);
        return id;
      } catch (e) {
        console.warn('[chat] 保存消息失败:', e.message);
        sessionValid = false; // 避免后续重复尝试
        return null;
      }
    };
    userMsgId = await persistMessage('user', message);

    let engineResult;
    let isMock = false;
    let isAgent = false;
    try {
      // 4. Agent 模式自动判断（mode=auto 或未指定时启用）
      if (mode !== 'chat') {
        console.log(`[chat] 尝试 Agent 模式自动判断...`);
        const agentResult = await runAgentLoop({
          llm,
          systemPrompt,
          userMessage: message,
          messages,
          maxIterations: MAX_REACT_ITERATIONS,
          chatModel,
          override: {
            baseUrl: overrideBaseUrl || undefined,
            apiKey: overrideApiKey || undefined,
            protocol: overrideProtocol || undefined
          },
          ctx: {
            projectId: pid,
            date: d,
            permLevel: permLevel || 'allow'
          },
          wss
        });

        if (agentResult) {
          // Agent 模式已处理
          isAgent = true;
          engineResult = agentResult;
          console.log(`[chat] Agent 模式完成: taskId=${agentResult.taskId}, tasks=${agentResult.tasks?.length || 0}`);
        } else {
          console.log(`[chat] Agent 判断为简单请求，走普通 chat 模式`);
        }
      }

      // 5. 普通 ReAct 聊天（非 Agent 或 Agent 降级时）
      if (!isAgent) {
        engineResult = await runReactLoop({
          llm,
          systemPrompt,
          messages,
          maxIterations: MAX_REACT_ITERATIONS,
          chatModel,
          override: {
            baseUrl: overrideBaseUrl || undefined,
            apiKey: overrideApiKey || undefined,
            protocol: overrideProtocol || undefined
          },
          ctx: {
            projectId: pid,
            date: d,
            permLevel: permLevel || 'allow'
          }
        });
      }
    } catch (e) {
      // P0-1 修复：LLM 失败时也把"降级 mock 回复"作为 assistant 落库，保持 user+assistant 配对
      isMock = true;
      const fallbackReply = `抱歉，LLM 暂时不可用：${e.message}`;
      const assistantMsgId = await persistMessage('assistant', fallbackReply);
      console.warn('[降级] LLM 聊天失败，回退 mock:', e.message);
      return res.json({
        reply: fallbackReply,
        source: 'mock',
        latencyMs: Date.now() - start,
        fallbackReason: e.message,
        userMsgId,
        assistantMsgId
      });
    }

  // 5. 写 assistant 消息（LLM 成功路径）- P11 修复: 存清理后的 reply（去除 [TOOL_USE] 块）
  const assistantMsgId = await persistMessage('assistant', engineResult.reply);

  // P17: LLM 执行了写操作 → 广播 WebSocket 刷新，通知前端自动重载数据
  const MUTATE_ACTIONS = new Set([
    'createEvent','confirmEvent','updateEvent','deleteEvent','batchDelete',
    'createIssue','updateIssue','closeIssue','deleteIssue',
    'createPlan','updatePlan','deletePlan',
    'createAttendance','deleteEventsByQuery','deletePlansByQuery',
    'createECC','updateECC','deleteECC',
    'createDrawingDeepening','deleteDrawingDeepening',
    'createStandardTrade','deleteStandardTrade',
    'upsertWeeklyLabor','deleteWeeklyLabor',
    'savePage06Photo','deletePage06Photo',
    'saveManagementTeam','deleteManagementTeam',
    'createAttendance','saveMilestonePlan','deleteMilestonePlan',
    'createArea','deleteArea',
  ]);
  const hasMutateAction = (engineResult.actions || []).some(a => MUTATE_ACTIONS.has(a.type));
  if (hasMutateAction) {
    try { broadcastRefresh(wss, pid); } catch (_) {}
  }

  res.json({
    reply: engineResult.reply,
    toolCalls: engineResult.toolCalls || [],  // P11: 新增结构化工具调用列表
    source: 'llm',
    latencyMs: Date.now() - start,
    iterations: engineResult.iterations,
    actions: engineResult.actions,
    results: engineResult.results,
    pendingActions: engineResult.pendingActions,
    model: chatModel,
    stopped: engineResult.stopped,
    userMsgId,
    assistantMsgId,
    // Agent 模式新增字段
    isAgent,
    tasks: engineResult.tasks || null,
    taskId: engineResult.taskId || null
  });
  } catch (e) {
      // 外层兜底：覆盖 build context / persistMessage 等前置阶段失败
    console.warn('[降级] /api/chat 前置失败:', e.message);
    if (!res.headersSent) {
      res.json({
        reply: `抱歉，会话处理失败：${e.message}`,
        source: 'mock',
        latencyMs: Date.now() - start,
        fallbackReason: e.message
      });
    }
  }
});

// ============================================================
// Agent 任务中止端点
// ============================================================
app.post('/api/chat/tasks/:taskId/abort', async (req, res) => {
  const { taskId } = req.params;
  abortFlags.set(taskId, true);
  console.log(`[agent] 用户请求中止任务: ${taskId}`);
  res.json({ ok: true, message: '任务中止请求已发送' });
});

// ============================================================
// 聊天辅助端点
// ============================================================

/**
 * 授权端点 — 真正执行之前需要授权的敏感操作
 * 前端在用户点击"确认"后调用此接口，携带 pendingActions 中的 action 数据
 */
app.post('/api/chat/authorize', async (req, res) => {
  const { pendingActions, sessionId, projectId, date } = req.body || {};

  if (!pendingActions || !Array.isArray(pendingActions) || pendingActions.length === 0) {
    return res.status(400).json({ ok: false, error: '缺少 pendingActions' });
  }

  const pid = projectId || 'baicaoyuan';
  const d = date || getBeijingDate();
  const executed = [];
  const failed = [];

  for (const action of pendingActions) {
    try {
      const toolResult = await executeTool(action.type, action.data, {
        projectId: pid,
        date: d,
        permLevel: 'allow'
      });
      executed.push({ type: action.type, result: toolResult });
      console.log(`[authorize] 已执行: ${action.type}`);
    } catch (e) {
      failed.push({ type: action.type, error: e.message });
      console.warn(`[authorize] 执行失败: ${action.type}: ${e.message}`);
    }
  }

  // 如果有成功的操作，通知前端刷新页面
  if (executed.length > 0) {
    broadcastRefresh(wss, pid);
  }

  res.json({
    ok: true,
    executed,
    failed,
    message: `已授权执行 ${executed.length} 个操作${failed.length > 0 ? `，${failed.length} 个失败` : ''}`
  });
});

/**
 * 拒绝端点 — 用户拒绝某个 pending action
 */
app.post('/api/chat/reject', (req, res) => {
  const { pendingIds } = req.body || {};
  console.log(`[reject] 用户拒绝操作`, pendingIds);
  res.json({ ok: true, message: '操作已拒绝' });
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
