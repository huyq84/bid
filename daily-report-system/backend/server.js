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
import fs from 'fs';
import { WebSocketServer } from 'ws';
import http from 'http';
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
  groupId: process.env.MINIMAX_GROUP_ID,
  provider: (process.env.MINIMAX_PROVIDER || 'anthropic').toLowerCase()
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

// 根据 modelId 创建 LLM 客户端（自定义模型或默认）
function getLLMClient(modelId) {
  if (!modelId) return llm;
  const custom = CUSTOM_MODELS.find(m => m.id === modelId);
  if (!custom) {
    console.warn('[models] 未找到自定义模型:', modelId, '回退默认');
    return llm;
  }
  console.log('[models] 使用自定义模型:', custom.name, '(' + custom.modelId + ')');
  // 默认 Anthropic 协议；如果是 agnes-ai 等非 Anthropic 平台，用 openai 协议
  const provider = (custom.provider || 'anthropic').toLowerCase();
  return new MinMaxClient({
    apiKey: custom.apiKey,
    baseUrl: custom.baseUrl,
    model: custom.modelId,
    maxTokens: custom.maxTokens || LLM_CONFIG.maxTokens,
    temperature: custom.temperature ?? LLM_CONFIG.temperature,
    groupId: custom.groupId || LLM_CONFIG.groupId,
    provider: provider
  });
}

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

// 获取支持的 LLM 提供商列表
const PROVIDERS = [
  { id: 'openai', name: 'OpenAI', modelsUrl: 'https://api.openai.com/v1/models', authHeader: 'Bearer' },
  { id: 'anthropic', name: 'Anthropic', modelsUrl: 'https://api.anthropic.com/v1/models', authHeader: 'x-api-key' },
  { id: 'together', name: 'Together AI', modelsUrl: 'https://api.together.xyz/v1/models', authHeader: 'Bearer' },
  { id: 'siliconflow', name: 'SiliconFlow', modelsUrl: 'https://api.siliconflow.cn/v1/models', authHeader: 'Bearer' },
  { id: 'volcengine', name: '火山引擎', modelsUrl: 'https://ark.cn-beijing.volces.com/api/v3/models', authHeader: 'Bearer' },
  { id: 'custom', name: '自定义', modelsUrl: null, authHeader: 'Bearer' }
];

// 获取提供商支持的模型列表
app.get('/api/models/providers', (req, res) => {
  res.json(PROVIDERS.map(p => ({ id: p.id, name: p.name, hasModelsUrl: !!p.modelsUrl })));
});

// 获取指定提供商的模型列表
// 注意：/api/models/custom 的 handler 必须在 /api/models/:providerId 之前注册
// 否则通配路由会先匹配，吞掉 custom 路径
app.get('/api/models/:providerId', async (req, res, next) => {
  const { providerId } = req.params;
  // 排除 'custom'，让下一个 handler 处理
  if (providerId === 'custom') return next();
  const provider = PROVIDERS.find(p => p.id === providerId);
  if (!provider) return res.status(404).json({ error: '未知的提供商' });
  
  if (!provider.modelsUrl) {
    return res.json({ models: [] });
  }
  
  const apiKey = req.query.apiKey || process.env.OPENAI_API_KEY || '';
  if (!apiKey) {
    return res.status(401).json({ error: '缺少 API Key' });
  }
  
  try {
    const response = await fetch(provider.modelsUrl, {
      headers: {
        'Authorization': `${provider.authHeader} ${apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({ error: errorText });
    }
    
    const data = await response.json();
    // 标准化不同提供商的模型列表格式
    let models = [];
    if (providerId === 'openai' || providerId === 'together' || providerId === 'siliconflow') {
      models = (data.data || []).map(m => ({
        id: m.id,
        name: m.name || m.id,
        ownedBy: m.ownedBy || m.owner || 'unknown'
      }));
    } else if (providerId === 'anthropic') {
      models = (data.models || []).map(m => ({
        id: m.name,
        name: m.display_name || m.name,
        ownedBy: 'anthropic'
      }));
    } else if (providerId === 'volcengine') {
      models = (data.models || []).map(m => ({
        id: m.id,
        name: m.name || m.id,
        ownedBy: 'volcengine'
      }));
    }
    
    res.json({ models });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
// 获取自定义模型列表（持久化到项目根目录 custom-models.json）
// 使用绝对路径避免 ES Module 路径解析问题
const MODELS_FILE = 'D:\\hyq\\cjs\\zb\\daily-report-system\\custom-models.json';

function loadCustomModelsFromFile() {
  try {
    if (fs.existsSync(MODELS_FILE)) {
      return JSON.parse(fs.readFileSync(MODELS_FILE, 'utf-8'));
    }
  } catch (e) { /* 首次运行没有文件 */ }
  return [];
}

function saveCustomModelsToFile(models) {
  try {
    fs.writeFileSync(MODELS_FILE, JSON.stringify(models, null, 2), 'utf-8');
  } catch (e) {
    console.warn('[models] 保存自定义模型失败:', e.message);
  }
}

const CUSTOM_MODELS = loadCustomModelsFromFile();

app.get('/api/models/custom', (req, res) => {
  try {
    const data = fs.readFileSync(MODELS_FILE, 'utf-8');
    const models = JSON.parse(data);
    res.json({ models });
  } catch (e) {
    res.json({ models: [] });
  }
});

// 添加自定义模型（持久化到文件）
app.post('/api/models/custom', (req, res) => {
  const { name, baseUrl, apiKey, modelId, maxTokens, temperature, provider } = req.body;
  if (!name || !baseUrl || !apiKey) {
    return res.status(400).json({ error: '缺少必要字段' });
  }
  
  const newModel = {
    id: Date.now().toString(),
    name,
    baseUrl,
    apiKey,
    modelId: modelId || '',
    maxTokens: maxTokens || 4096,
    temperature: temperature || 0.5,
    provider: provider || 'anthropic',
    createdAt: new Date().toISOString()
  };
  
  CUSTOM_MODELS.push(newModel);
  saveCustomModelsToFile(CUSTOM_MODELS);
  res.json({ model: { ...newModel, apiKey: apiKey.slice(0, 6) + '****' + apiKey.slice(-4) } });
});

// 删除自定义模型（持久化到文件）
app.delete('/api/models/custom/:id', (req, res) => {
  const { id } = req.params;
  const models = loadCustomModelsFromFile();
  const idx = models.findIndex(m => m.id === id);
  if (idx !== -1) {
    models.splice(idx, 1);
    saveCustomModelsToFile(models);
  }
  res.json({ ok: true });
});

// 更新自定义模型（主要用于修改 API Key）
app.put('/api/models/custom/:id', (req, res) => {
  const { id } = req.params;
  const models = loadCustomModelsFromFile();
  const idx = models.findIndex(m => m.id === id);
  if (idx === -1) return res.status(404).json({ error: '模型不存在' });
  const { name, baseUrl, apiKey, modelId, maxTokens, temperature, groupId, provider } = req.body;
  if (name !== undefined) models[idx].name = name;
  if (baseUrl !== undefined) models[idx].baseUrl = baseUrl;
  if (apiKey !== undefined) models[idx].apiKey = apiKey;
  if (modelId !== undefined) models[idx].modelId = modelId;
  if (maxTokens !== undefined) models[idx].maxTokens = maxTokens;
  if (temperature !== undefined) models[idx].temperature = temperature;
  if (groupId !== undefined) models[idx].groupId = groupId;
  if (provider !== undefined) models[idx].provider = provider;
  saveCustomModelsToFile(models);
  res.json({ model: models[idx] });
});

// 测试自定义模型连接
app.post('/api/models/custom/test/:id', async (req, res) => {
  const { id } = req.params;
  const models = loadCustomModelsFromFile();
  const m = models.find(x => x.id === id);
  if (!m) return res.status(404).json({ success: false, error: '模型不存在' });

  const start = Date.now();
  try {
    // 简单 ping：尝试访问 /v1/models 或 /models
    const url = m.baseUrl.replace(/\/+$/, '') + '/models';
    const response = await fetch(url, {
      headers: { 'Authorization': 'Bearer ' + m.apiKey },
      timeout: 8000
    });
    res.json({
      success: response.ok,
      latencyMs: Date.now() - start,
      error: response.ok ? null : 'HTTP ' + response.status
    });
  } catch (e) {
    res.json({ success: false, latencyMs: Date.now() - start, error: e.message });
  }
});

// 通用模型发现：从任意 Base URL 拉取模型列表
app.post('/api/models/discover', async (req, res) => {
  const { baseUrl, apiKey } = req.body;
  if (!baseUrl || !apiKey) return res.status(400).json({ error: '缺少 baseUrl 或 apiKey' });

  // 尝试各种常见路径获取模型列表
  const paths = ['/models', '/v1/models', '/api/v1/models'];
  let lastError = '';

  for (const p of paths) {
    try {
      const url = baseUrl.replace(/\/+$/, '') + p;
      const response = await fetch(url, {
        headers: {
          'Authorization': 'Bearer ' + apiKey,
          'Content-Type': 'application/json'
        },
        timeout: 5000
      });
      if (!response.ok) {
        lastError = 'HTTP ' + response.status;
        continue;
      }
      const data = await response.json();
      // 标准化不同返回格式
      let models = [];
      if (Array.isArray(data)) {
        models = data.map(m => ({ id: m.id || m.name, name: m.name || m.id }));
      } else if (data.data && Array.isArray(data.data)) {
        models = data.data.map(m => ({ id: m.id, name: m.name || m.id }));
      } else if (data.models && Array.isArray(data.models)) {
        models = data.models.map(m => ({ id: m.id || m.name, name: m.name || m.id || m.display_name }));
      }
      if (models.length > 0) return res.json({ models });
    } catch (e) {
      lastError = e.message;
    }
  }

  res.status(404).json({ error: '无法获取模型列表: ' + lastError });
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
  const client = getLLMClient(req.body.modelId);
  try {
    const result = await client.parseVoice({ text, projectId, areas: areas || [], workers: workers || [], plans: plans || [] });
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
  
  const client = getLLMClient(req.body.modelId);
  try {
    const result = await client.parsePhoto({ imageBase64, caption, projectId, areas: areas || [], type, plans: plans || [] });
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
  const client = getLLMClient(req.body.modelId);
  try {
    const result = await client.optimizeText({ text, projectId, areas: areas || [], plans: plans || [] });
    res.json({ source: 'llm', latencyMs: Date.now() - start, ...result });
  } catch (e) {
    console.warn('[错误] LLM 文本优化失败:', e.message);
    res.status(503).json({ source: 'error', latencyMs: Date.now() - start, error: 'LLM 连接失败: ' + e.message });
  }
});

// 周报聚合
app.post('/api/aggregate-weekly', async (req, res) => {
  const { projectId, projectName, client: clientName, weekStart, weekEnd, events, issues, areas } = req.body;
  if (!events) return res.status(400).json({ error: 'events 不能为空' });

  const start = Date.now();
  const llmClient = getLLMClient(req.body.modelId);
  try {
    const result = await llmClient.aggregateWeekly({ projectId, projectName, client: clientName, weekStart, weekEnd, events, issues, areas });
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
    const { message, history, projectId, date, sessionId, modelId } = req.body;
    if (!message) return res.status(400).json({ error: 'message required' });

    const pid = projectId || 'baicaoyuan';
    const d = date || new Date().toISOString().slice(0, 10);

    // 根据 modelId 获取 LLM 客户端
    const chatLlm = getLLMClient(modelId);

    // 0. 读取权限级别（请求里显式传的 permLevel 优先于 DB 设置）
    let permLevel = 'confirm';
    if (req.body.permLevel && ['allow', 'confirm', 'strict'].includes(req.body.permLevel)) {
      permLevel = req.body.permLevel;
    } else {
      try {
        const permRes = await query("SELECT value FROM dr_settings WHERE key='llm_permission'");
        if (permRes.rows.length > 0) permLevel = permRes.rows[0].value.level || 'confirm';
      } catch {}
    }

    // 1. 拉取项目上下文
    const ctx = await buildChatContext(pid, d);
    const ctxText = contextToText(ctx) + (permLevel ? '\n\n## 当前权限\n' + permLevel : '');

    let reply, actions, memory, source = 'mock';
    let llmResult = null;
    try {
      const maxIters = req.body.maxIters || 10;
      llmResult = await chatLlm.chatWithContext({ message, history, contextText: ctxText, permLevel, maxIters, projectId: pid, date: d });
      reply = llmResult.reply;
      actions = llmResult.actions;
      memory = llmResult.memory;  // ✅ 短期对话记忆
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
      // ✅ mutate 工具已执行过的 action：把 result 透传到 results，不重复写库
      if (action._source === 'tool' && action._result) {
        results.push({ action, ...action._result });
        continue;
      }
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

    // 3. 使用 LLM 声明的剩余任务（用于续批）
    const hasMore = llmResult?.hasMore || false;
    const remainingItems = llmResult?.remainingItems || [];

    res.json({ reply, actions, results, pendingActions, blockedActions, hasMore, remainingItems, latencyMs: Date.now() - start, source, sessionId, permLevel, memory });
  } catch (e) {
    console.error('[chat] error:', e);
    const mock = _mockChatReply(req.body?.message || '');
    res.status(200).json({ reply: mock.reply, actions: mock.actions, results: [], latencyMs: Date.now() - start, source: 'mock', error: e.message });
  }
});

// ==================== 会话管理 API ====================

// GET /api/chat/sessions?projectId=X — 列出项目下的所有会话
app.get('/api/chat/sessions', async (req, res) => {
  try {
    const pid = req.query.projectId || 'baicaoyuan';
    const result = await query(
      "SELECT id, name, created_at FROM dr_sessions WHERE project_id = $1 ORDER BY updated_at DESC",
      [pid]
    );
    res.json(result.rows || []);
  } catch (e) {
    console.warn('[chat] 列出会话失败:', e.message);
    res.json([]);
  }
});

// POST /api/chat/sessions — 创建新会话
app.post('/api/chat/sessions', async (req, res) => {
  try {
    const { projectId, name } = req.body;
    const pid = projectId || 'baicaoyuan';
    const id = 'cs_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
    const now = new Date().toISOString();
    const result = await query(
      "INSERT INTO dr_sessions (id, project_id, name, created_at, updated_at) VALUES ($1, $2, $3, $4, $4) RETURNING id, name, created_at",
      [id, pid, name || '新对话', now]
    );
    res.json(result.rows[0]);
  } catch (e) {
    console.warn('[chat] 创建会话失败:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/chat/sessions/:id — 删除会话
app.delete('/api/chat/sessions/:id', async (req, res) => {
  try {
    const sid = req.params.id;
    await query("DELETE FROM dr_session_messages WHERE session_id = $1", [sid]);
    await query("DELETE FROM dr_sessions WHERE id = $1", [sid]);
    res.json({ deleted: true });
  } catch (e) {
    console.warn('[chat] 删除会话失败:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/chat/sessions/:id — 重命名会话
app.put('/api/chat/sessions/:id', async (req, res) => {
  try {
    const sid = req.params.id;
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });
    const result = await query(
      "UPDATE dr_sessions SET name = $1, updated_at = NOW() WHERE id = $2 RETURNING id, name, created_at",
      [name, sid]
    );
    res.json(result.rows[0]);
  } catch (e) {
    console.warn('[chat] 重命名会话失败:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/chat/sessions/:id/messages — 获取会话消息
app.get('/api/chat/sessions/:id/messages', async (req, res) => {
  try {
    const sid = req.params.id;
    const result = await query(
      "SELECT id, role, content, created_at FROM dr_session_messages WHERE session_id = $1 ORDER BY created_at ASC",
      [sid]
    );
    res.json(result.rows || []);
  } catch (e) {
    console.warn('[chat] 获取消息失败:', e.message);
    res.json([]);
  }
});

// DELETE /api/chat/sessions/:id/messages — 清空会话消息
app.delete('/api/chat/sessions/:id/messages', async (req, res) => {
  try {
    const sid = req.params.id;
    await query("DELETE FROM dr_session_messages WHERE session_id = $1", [sid]);
    res.json({ cleared: true });
  } catch (e) {
    console.warn('[chat] 清空消息失败:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/chat/sessions/:id/messages — 保存消息
app.post('/api/chat/sessions/:id/messages', async (req, res) => {
  try {
    const sid = req.params.id;
    const { role, content } = req.body;
    if (!role || !content) return res.status(400).json({ error: 'role and content required' });
    const id = 'msg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
    const now = new Date().toISOString();
    const result = await query(
      "INSERT INTO dr_session_messages (id, session_id, role, content, created_at) VALUES ($1, $2, $3, $4, $5) RETURNING id, role, content, created_at",
      [id, sid, role, content, now]
    );
    res.json({ ...result.rows[0], sessionId: sid });
  } catch (e) {
    console.warn('[chat] 保存消息失败:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/chat/messages — 保存消息（兼容旧路径）
app.post('/api/chat/messages', async (req, res) => {
  try {
    const { sessionId, role, content } = req.body;
    if (!sessionId || !role || !content) return res.status(400).json({ error: 'sessionId, role, content required' });
    const id = 'msg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
    const now = new Date().toISOString();
    const result = await query(
      "INSERT INTO dr_session_messages (id, session_id, role, content, created_at) VALUES ($1, $2, $3, $4, $5) RETURNING id",
      [id, sessionId, role, content, now]
    );
    res.json({ id: result.rows[0].id });
  } catch (e) {
    console.warn('[chat] 保存消息失败:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/chat/messages/:id — 删除单条消息
app.delete('/api/chat/messages/:id', async (req, res) => {
  try {
    const mid = req.params.id;
    await query("DELETE FROM dr_session_messages WHERE id = $1", [mid]);
    res.json({ deleted: true });
  } catch (e) {
    console.warn('[chat] 删除消息失败:', e.message);
    res.status(500).json({ error: e.message });
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
