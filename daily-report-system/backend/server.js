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
import { mockParseVoice, mockParsePhoto, mockAggregateWeekly } from './mock-fallback.js';
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
    console.warn('[降级] LLM 语音解析失败，回退 mock:', e.message);
    const result = mockParseVoice(text, projectId, areas || [], workers || [], plans || []);
    res.json({ source: 'mock', latencyMs: Date.now() - start, fallbackReason: e.message, ...result });
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
    console.warn('[降级] LLM 照片解析失败，回退 mock:', e.message);
    const result = mockParsePhoto(caption, projectId, areas || [], type, plans || []);
    console.log('[Mock解析结果]', JSON.stringify(result));
    res.json({ source: 'mock', latencyMs: Date.now() - start, fallbackReason: e.message, ...result });
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

    // 1. 拉取项目上下文
    const ctx = await buildChatContext(pid, d);
    const ctxText = contextToText(ctx);

    let reply, actions, source = 'mock';
    try {
      const result = await llm.chatWithContext({ message, history, contextText: ctxText });
      reply = result.reply;
      actions = result.actions;
      source = 'llm';
    } catch (e) {
      console.warn('[chat] LLM 失败，降级 mock:', e.message);
      const mock = _mockChatReply(message);
      reply = mock.reply;
      actions = mock.actions;
    }

    // 2. 按权限分级执行
    const enrichedCtx = { ...ctx, date: d, projectId: pid, plans: ctx.today.plans };
    const results = [];
    const pendingActions = [];

    for (const action of (actions || [])) {
      if (isSensitiveAction(action.type)) {
        // 敏感操作 -> 暂存，等用户授权
        const paId = 'pa_' + (++_paSeq);
        _pendingActions.set(paId, { action, ctx: enrichedCtx });
        pendingActions.push({
          id: paId,
          type: action.type,
          summary: getActionSummary(action),
          data: action.data
        });
      } else {
        // 安全操作 -> 立即执行
        const r = await executeAction(action, enrichedCtx);
        results.push({ action, ...r });
      }
    }

    res.json({ reply, actions, results, pendingActions, latencyMs: Date.now() - start, source, sessionId });
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

// 手动触发巡检（前端可调用，立即执行并推送）
app.post('/api/chat/inspect', async (req, res) => {
  try {
    await runInspection();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

function _mockChatReply(text) {
  const t = text || '';

  // 删除/编辑事件
  const delMatch = t.match(/(?:删除|删掉|移除|去掉)\s*[Ee]?(\w+)/);
  if (delMatch) {
    return { reply: '将要删除事件 ' + delMatch[0] + '，需要您授权确认。', actions: [{ type: 'deleteEvent', data: { eventId: 'E' + delMatch[1] } }] };
  }
  const editMatch = t.match(/(?:把|将|给)?\s*[Ee]?(\w+)\s*(?:进度|改成|改为|更新)?\s*(\d+%)?/);
  if (editMatch && (t.includes('进度') || t.includes('改成') || t.includes('改为') || t.includes('更新'))) {
    return { reply: '将要更新事件 ' + editMatch[1] + '，需要您授权确认。', actions: [{ type: 'updateEvent', data: { eventId: 'E' + editMatch[1], progress: editMatch[2] || '' } }] };
  }
  // 关闭/删除协调
  const closeMatch = t.match(/(?:关闭|关掉|完成|解决)\s*[Ii]?(\w+)/);
  if (closeMatch) {
    return { reply: '将要关闭协调 ' + closeMatch[0] + '，需要您授权确认。', actions: [{ type: 'closeIssue', data: { issueId: 'I' + closeMatch[1] } }] };
  }

  if (t.includes('协调') || t.includes('记录') || t.includes('设计院') || t.includes('图纸') || t.includes('配合')) {
    // 简单的协调解析
    const m = t.match(/记录协调[：:]\s*(.+?)[，,。\n]*(?:提出[：:]\s*(.+?))?[，,。\n]*(?:配合[：:]\s*(.+?))?/);
    if (m) {
      return {
        reply: '已记录协调事宜',
        actions: [{
          type: 'createIssue',
          data: { title: m[1] || t, proposeDept: m[2] || '', cooperateDept: m[3] || '', priority: 'medium' }
        }]
      };
    }
    return { reply: '请补充协调内容', actions: [] };
  }
  if (t.includes('签到') || t.includes('请假')) {
    return {
      reply: '已记录签到（请在前端确认具体人员）',
      actions: []
    };
  }
  if (t.includes('完成') || t.includes('进度') || t.includes('施工') || t.includes('木工') || t.includes('瓦工') || t.includes('电工')) {
    // 提取任务名（取第一个名词短语）
    const taskMatch = t.match(/(今天|刚才|上午|下午)?(.+?)(完成|进度|开始|进行|进行中)/);
    const taskName = taskMatch ? taskMatch[2].trim() : t.slice(0, 20);
    const progressMatch = t.match(/(\d+)\s*%/);
    const headcountMatch = t.match(/(\d+)\s*人/);
    return {
      reply: '已记录进度事件',
      actions: [{
        type: 'createEvent',
        data: {
          type: 'progress',
          taskName,
          progress: progressMatch ? progressMatch[0] : '',
          headcount: headcountMatch ? parseInt(headcountMatch[1]) : 0
        }
      }]
    };
  }
  if (t.includes('周报') || t.includes('生成')) {
    return { reply: '📊 已为你打开周报预览界面。', actions: [] };
  }
  return { reply: '你好！我是 AI 助手，可以帮你记录事件、协调、签到等。试试说"今天木工完成大堂天花龙骨 80%"', actions: [] };
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

// 调度器：每小时检查一次（实际触发由 _lastRunHour 控制）
let _lastRunHour = -1;
function scheduler() {
  const now = new Date();
  const hour = now.getHours();
  const minute = now.getMinutes();
  // 在 8:30, 13:00, 17:30 触发
  const triggers = [[8, 30], [13, 0], [17, 30]];
  for (const [h, m] of triggers) {
    if (hour === h && minute === m && _lastRunHour !== hour) {
      _lastRunHour = hour;
      runInspection();
      return;
    }
  }
  // 启动时跑一次（如果是 8:00-22:00 之间）
  if (_lastRunHour === -1 && hour >= 8 && hour <= 22) {
    _lastRunHour = -2; // 防止启动后立即重复
    setTimeout(runInspection, 5000);
  }
}
setInterval(scheduler, 60 * 1000);  // 每分钟检查一次
setTimeout(scheduler, 3000);  // 启动 3 秒后初始化

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
    // 连接时主动推一次巡检
    setTimeout(() => runInspection(), 1000);
    ws.on('close', () => {
      connectedClients.delete(ws);
      console.log(`[WS] 客户端断开 (剩余 ${connectedClients.size} 个)`);
    });
    ws.on('error', () => connectedClients.delete(ws));
  });
});
