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
import { fileURLToPath } from 'url';
import { MinMaxClient } from './llm-client.js';
import { buildChatContext, contextToText } from './chat-context.js';
import { executeAction } from './chat-actions.js';
import { isSensitiveAction, getActionSummary } from './chat-actions.js';
import { dailyInspection, generateProactiveMessages } from './inspection-engine.js';
import { query } from './db.js';
import apiRoutes from './routes.js';
import os from 'os';

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
  groupId: process.env.MINIMAX_GROUP_ID
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
  try {
    const reply = await llm.chat({
      system: '你是一个有用的助手。',
      messages: [{
        role: 'user',
        content: '请用一句话简单介绍你自己，控制在 30 字以内。'
      }],
      maxTokens: 100,
      temperature: 0.5
    });
    res.json({
      success: true,
      reply: reply,
      latencyMs: Date.now() - start,
      model: LLM_CONFIG.model
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
  const { text, projectId, areas, workers, plans } = req.body;
  if (!text) return res.status(400).json({ error: 'text 不能为空' });

  const start = Date.now();
  try {
    const result = await llm.parseVoice({ text, projectId, areas: areas || [], workers: workers || [], plans: plans || [] });
    res.json({ source: 'llm', latencyMs: Date.now() - start, ...result });
  } catch (e) {
    console.warn('[错误] LLM 语音解析失败:', e.message);
    res.status(503).json({ source: 'error', latencyMs: Date.now() - start, error: 'LLM 连接失败: ' + e.message });
  }
});

// 照片解析
app.post('/api/parse-photo', async (req, res) => {
  const { imageBase64, caption, projectId, areas, type, plans } = req.body;
  const start = Date.now();
  
  // 调试日志
  console.log('[照片解析请求]');
  console.log('  projectId:', projectId);
  console.log('  caption:', caption ? caption.slice(0, 50) + '...' : '(空)');
  console.log('  areas:', JSON.stringify(areas));
  console.log('  type:', type);
  
  try {
    const result = await llm.parsePhoto({ imageBase64, caption, projectId, areas: areas || [], type, plans: plans || [] });
    console.log('[照片解析结果]', JSON.stringify(result));
    res.json({ source: 'llm', latencyMs: Date.now() - start, ...result });
  } catch (e) {
    console.warn('[错误] LLM 照片解析失败:', e.message);
    res.status(503).json({ source: 'error', latencyMs: Date.now() - start, error: 'LLM 连接失败: ' + e.message });
  }
});

// 文本优化
app.post('/api/optimize-text', async (req, res) => {
  const { text, projectId, areas, plans } = req.body;
  if (!text) return res.status(400).json({ error: 'text 不能为空' });

  const start = Date.now();
  try {
    const result = await llm.optimizeText({ text, projectId, areas: areas || [], plans: plans || [] });
    res.json({ source: 'llm', latencyMs: Date.now() - start, ...result });
  } catch (e) {
    console.warn('[错误] LLM 文本优化失败:', e.message);
    res.status(503).json({ source: 'error', latencyMs: Date.now() - start, error: 'LLM 连接失败: ' + e.message });
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
    console.warn('[错误] LLM 周报聚合失败:', e.message);
    res.status(503).json({ source: 'error', latencyMs: Date.now() - start, error: 'LLM 连接失败: ' + e.message });
  }
});

// ==================== AI 对话 — 权限分级 ====================
// pending 操作暂存区
const _pendingActions = new Map();
let _paSeq = 0;

app.post('/api/chat', async (req, res) => {
  const start = Date.now();
  try {
    const { message, history, projectId, date, sessionId } = req.body;
    if (!message) return res.status(400).json({ error: 'message required' });

    const pid = projectId || 'baicaoyuan';
    const d = date || new Date().toISOString().slice(0, 10);

    // 0. 读取权限级别
    let permLevel = 'confirm';
    try {
      const permRes = await query("SELECT value FROM dr_settings WHERE key='llm_permission'");
      if (permRes.rows.length > 0) permLevel = permRes.rows[0].value.level || 'confirm';
    } catch {}

    // 1. 拉取项目上下文
    const ctx = await buildChatContext(pid, d);
    const ctxText = contextToText(ctx) + (permLevel ? '\n\n## 当前权限\n' + permLevel : '');

    let reply, actions, source = 'mock';
    try {
      const result = await llm.chatWithContext({ message, history, contextText: ctxText, permLevel, projectId: pid, date: d });
      reply = result.reply;
      actions = result.actions;
      source = 'llm';
    } catch (e) {
      console.warn('[chat] LLM 失败，降级 mock:', e.message);
      const mock = _mockChatReply(message, permLevel);
      reply = mock.reply;
      actions = mock.actions;
    }

    // 2. 按权限分级执行
    const enrichedCtx = { ...ctx, date: d, projectId: pid, plans: ctx.today.plans };
    const results = [];
    const pendingActions = [];
    const blockedActions = [];

    for (const action of (actions || [])) {
      const sensitive = isSensitiveAction(action.type);
      if (sensitive && permLevel === 'strict') {
        blockedActions.push({ action, reason: '权限设置为禁止危险操作' });
      } else if (sensitive && permLevel === 'confirm') {
        const paId = 'pa_' + (++_paSeq);
        _pendingActions.set(paId, { action, ctx: enrichedCtx });
        pendingActions.push({
          id: paId,
          type: action.type,
          summary: getActionSummary(action),
          data: action.data
        });
      } else {
        // allow 模式 或 安全操作 → 立即执行
        const r = await executeAction(action, enrichedCtx);
        results.push({ action, ...r });
      }
    }

    // 4. 任何模式下，若没有待授权操作（allow 已自动执行 / strict 被拒绝），清掉 reply 里误导的"请授权"措辞
    if (pendingActions.length === 0 && reply && (permLevel === 'allow' || permLevel === 'strict' || (permLevel === 'confirm' && results.length > 0))) {
      reply = reply
        .replace(/请点击(?:下方)?卡片上的\s*✅\s*授权执行\s*按钮[。.，,！!]*/g, '')
        .replace(/需要您授权确认[。.，,！!]*/g, '')
        .replace(/请(?:您)?(?:点击|确认|授权)[。.，,！!]*/g, '')
        .replace(/已(?:生成|为你生成).*?操作[，,]?\s*/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    }

    // 3. 计算是否还有待处理项目（用于续批）
    let hasMore = false;
    let remainingItems = [];
    if (results.length > 0 || pendingActions.length > 0) {
      try {
        const freshCtx = await buildChatContext(pid, d);
        const recordedNames = new Set(freshCtx.today.events.map(e => e.taskName));
        remainingItems = freshCtx.today.plans
          .filter(p => !recordedNames.has(p.name))
          .map(p => `${p.name}（${(p.areas || []).join('/') || ''} 负责人:${p.owner || '-'} 进度:${p.progress || '0%'}）`);
        hasMore = remainingItems.length > 0;
      } catch {}
    }

    res.json({ reply, actions, results, pendingActions, blockedActions, hasMore, remainingItems, latencyMs: Date.now() - start, source, sessionId, permLevel });
  } catch (e) {
    console.error('[chat] error:', e);
    const mock = _mockChatReply(req.body?.message || '');
    res.status(500).json({ error: e.message, reply: mock.reply, actions: mock.actions, results: [], latencyMs: Date.now() - start });
  }
});

// 用户授权执行敏感操作
app.post('/api/chat/authorize', async (req, res) => {
  try {
    const { pendingId } = req.body;
    if (!pendingId) return res.status(400).json({ error: 'pendingId required' });

    const entry = _pendingActions.get(pendingId);
    if (!entry) return res.status(404).json({ error: '授权请求已过期或不存在' });

    _pendingActions.delete(pendingId);
    const result = await executeAction(entry.action, entry.ctx);
    res.json({ ok: true, result, action: entry.action });
  } catch (e) {
    console.error('[chat] 授权执行失败:', e);
    res.status(500).json({ error: e.message });
  }
});

// 用户拒绝/取消执行
app.post('/api/chat/reject', async (req, res) => {
  const { pendingId } = req.body;
  if (pendingId) _pendingActions.delete(pendingId);
  res.json({ ok: true });
});

// 更新巡检设置（立即生效）
app.post('/api/settings/inspection', async (req, res) => {
  try {
    const { times, interval } = req.body;
    if (times) _inspectionTriggers = times.map(t => { const p = t.split(':').map(Number); return [p[0] || 8, p[1] || 0]; });
    if (interval && interval >= 1) _inspectionInterval = interval;
    clearInterval(schedulerInterval);
    schedulerInterval = setInterval(scheduler, _inspectionInterval * 1000);
    scheduler(); // 立即执行一次，防止跨过本周期的触发时间
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 手动触发巡检（前端可调用，立即执行并推送）
app.post('/api/chat/inspect', async (req, res) => {
  try {
    await runInspection();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

function _mockChatReply(text, permLevel = 'confirm') {
  return { reply: '⚠️ LLM 连接失败，无法处理您的请求。请检查后端 LLM 配置（API Key / Base URL / 网络连接）后重试。', actions: [] };
}

// ==================== 数据库 API 路由 ====================
app.use(apiRoutes);

// ==================== 主动巡检 + WebSocket 推送 ====================
import { WebSocketServer } from 'ws';
import http from 'http';

let wss = null;
const connectedClients = new Set();

// 推送消息到所有连接
function broadcastToClients(msg) {
  const data = JSON.stringify(msg);
  connectedClients.forEach(c => {
    try { c.send(data); } catch {}
  });
}

// 巡检 + 生成主动消息
async function runInspection() {
  try {
    const today = new Date().toISOString().slice(0, 10);
    // 查询所有项目
    let projectIds = ['baicaoyuan'];
    try {
      const result = await query('SELECT id FROM dr_projects');
      if (result.rows && result.rows.length > 0) {
        projectIds = result.rows.map(r => r.id);
      }
    } catch (e) {
      console.warn('[巡检] 查询项目列表失败，使用默认:', e.message);
    }
    let allMessages = [];
    for (const pid of projectIds) {
      const reminders = await dailyInspection(pid, today);
      const messages = await generateProactiveMessages(reminders);
      // 每条消息带上 projectId
      messages.forEach(m => {
        allMessages.push({ projectId: pid, message: m.message });
      });
    }
    if (allMessages.length > 0) {
      console.log(`[巡检] 发现 ${allMessages.length} 条提醒（${projectIds.length} 个项目）`);
      broadcastToClients({
        type: 'reminders',
        ts: Date.now(),
        reminders: allMessages
      });
    } else {
      console.log('[巡检] 一切正常，无提醒');
    }
  } catch (e) {
    console.error('[巡检] 失败:', e);
  }
}

// 调度器：每分钟检查，触发时间从设置读取
let _lastRunHour = -1;
let _inspectionTriggers = [[8, 30], [13, 0], [17, 30]];
let _inspectionInterval = 60;

async function loadInspectionSettings() {
  try {
    const res = await query("SELECT value FROM dr_settings WHERE key='inspection_times'");
    if (res.rows.length > 0) {
      const val = res.rows[0].value;
      if (val.times && Array.isArray(val.times)) {
        _inspectionTriggers = val.times.map(t => {
          const parts = t.split(':').map(Number);
          return [parts[0] || 8, parts[1] || 0];
        });
      }
      if (val.interval && val.interval >= 1) _inspectionInterval = val.interval;
    }
  } catch {}
}

function scheduler() {
  const now = new Date();
  const totalMinutes = now.getHours() * 60 + now.getMinutes();
  // 窗口宽度 = max(1, interval/60) 分钟，防止跳过触发点
  const windowMin = Math.max(1, Math.ceil(_inspectionInterval / 60));
  for (const [h, m] of _inspectionTriggers) {
    const triggerMin = h * 60 + m;
    // 当前时间在 [触发时间, 触发时间+窗口) 内，且该小时未跑过
    if (totalMinutes >= triggerMin && totalMinutes < triggerMin + windowMin && _lastRunHour !== h) {
      _lastRunHour = h;
      runInspection();
      return;
    }
  }
  // 启动时跑一次（如果是 8:00-22:00 之间）
  if (_lastRunHour === -1 && totalMinutes >= 480 && totalMinutes <= 1320) {
    _lastRunHour = -2;
    setTimeout(runInspection, 5000);
  }
}
let schedulerInterval = setInterval(scheduler, 60000);

// 第一次启动后加载设置并重新设置 interval
setTimeout(async () => {
  await loadInspectionSettings();
  clearInterval(schedulerInterval);
  schedulerInterval = setInterval(scheduler, _inspectionInterval * 1000);
  scheduler();
}, 3000);

// ==================== 启动 ====================
const PORT = process.env.BACKEND_PORT || 3010;
const server = http.createServer(app);
server.listen(PORT, '0.0.0.0', async () => {
  // 初始化数据库
  try {
    const { initDatabase } = await import('./db.js');
    await initDatabase();
    console.log('  [数据库] 表已就绪');
  } catch (dbErr) {
    console.warn('  [数据库] 初始化失败 (不影响 LLM 路由):', dbErr.message);
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
  console.log(`  WebSocket: ws://localhost:${PORT}/ws/chat`);
  console.log(`========================================\n`);

  // 启动 WebSocket
  wss = new WebSocketServer({ server, path: '/ws/chat' });
  wss.on('connection', (ws) => {
    connectedClients.add(ws);
    console.log(`[WS] 客户端连接 (当前 ${connectedClients.size} 个)`);
    ws.on('close', () => {
      connectedClients.delete(ws);
      console.log(`[WS] 客户端断开 (剩余 ${connectedClients.size} 个)`);
    });
    ws.on('error', () => connectedClients.delete(ws));
  });
});
