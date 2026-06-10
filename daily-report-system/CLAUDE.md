# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目性质

日报到周报 LLM 聚合系统的 **Phase 1 demo**。前端是纯静态 HTML/CSS/JS，后端是单文件 Express（用作 LLM 代理 + 降级层）。**没有数据库、没有构建链**——所有数据来自 `mock-data.js`（前端）和 `backend/mock-fallback.js`（后端）。LLM 真实调用走 `MiniMax`（Anthropic 兼容协议），失败时自动降级到规则化 mock。

## 启动与开发

### 跑前端（两种方式）

```bash
# 方式 1：直接双击 index.html
# 方式 2：本地静态服务器（推荐，避免 file:// 的 CORS 限制）
cd daily-report-system
python -m http.server 8080
# 浏览器访问 http://localhost:8080
```

### 跑后端（LLM 代理）

```bash
# 方式 1：直接跑
cd backend
node server.js
# 监听 http://localhost:3010

# 方式 2：watch 模式（改 server.js / llm-client.js 自动重启）
cd backend
npm run dev

# 方式 3（Windows）：双击 backend/start.bat
```

后端启动时会读 **项目根目录的 `.env`**（不是 `backend/.env`），加载 `MINIMAX_*` 系列变量。`backend/server.js:22` 的 `ENV_PATH = path.resolve(__dirname, '../.env')` 是关键。

### 集成测试

```bash
cd tests
npm install            # 装 jsdom
node test-integration.js
# 或端到端版本（需要后端跑着）
node test-e2e.js
```

所有测试都用 `jsdom` + `runScripts: 'dangerously'`，手动注入 `mock-data.js` + `app.js`（因为 jsdom 默认不加载 `<script src>`，见 `tests/test-integration.js:14-19`）。

**没有正式的 lint / 格式化 / 类型检查**——保持和现有代码风格一致即可（4 空格缩进、CommonJS 在 tests / ESM 在 backend、模板字符串中插入 HTML）。

## 架构

```
┌────────────────────────┐  fetch  ┌─────────────────────────┐
│  index.html (静态)     │ ──────▶ │  backend/server.js      │
│  + app.js              │         │  (Express, 端口 3010)   │
│  + mock-data.js        │         │                         │
│  + styles.css          │         │  ├─ llm-client.js       │ ──▶ MiniMax /v1/messages
└────────────────────────┘         │  └─ mock-fallback.js    │ （LLM 失败时回退）
                                   └─────────────────────────┘
```

### 前端职责
- 4 种录入方式：语音、拍照、手动、事项台账
- 今日事件流 + 日历视图 + 项目信息 + 事项台账
- 后端状态指示（30 秒轮询 `/api/health`，见 `app.js:1371`）
- 真实 LLM 失败时**静默降级**到 `mock-data.js` 的规则化解析

### 后端职责（`backend/server.js`）
只有 5 个端点，全是 LLM 代理 + 降级：

| 端点 | 作用 | 降级函数 |
|------|------|---------|
| `GET  /api/health` | 后端 + LLM 配置状态 | — |
| `GET  /api/llm/config` | 脱敏显示 LLM 配置 | — |
| `POST /api/llm/test` | 测试连接 | — |
| `POST /api/parse-voice` | 语音 → 结构化 | `mockParseVoice` |
| `POST /api/parse-photo` | 照片 caption → 元数据 | `mockParsePhoto` |
| `POST /api/aggregate-weekly` | 一周事件 → 周报初稿 | `mockAggregateWeekly` |

**关键模式**（`backend/server.js:130-167`）：每个 LLM 端点都用 `try { llm.xxx } catch { mockXxx }`，并在响应里返回 `source: 'llm' | 'mock'` + `latencyMs` + `fallbackReason`，让前端能区分数据来源。

### LLM 客户端（`backend/llm-client.js`）

- `MinMaxClient` 用 fetch 直连 Anthropic 兼容端点（`POST /v1/messages`）
- 自带 3 次重试：网络错误 + 空响应 + 缓存穿透（最后一条 user 消息加 `\n\n ` 打破缓存键，见 `llm-client.js:46-51`）
- 30 秒 `AbortController` 超时
- JSON 解析容错：剥 markdown 包裹 + 提取首个 `{...}` 块（`_parseJsonSafe`，`llm-client.js:283`）
- 业务方法 3 个：`parseVoice` / `parsePhoto` / `aggregateWeekly`，每个都内嵌中文 system prompt 教 LLM 输出严格 JSON
- `parsePhoto` **实际只用 caption**——`MiniMax-M3` 是否支持 vision 未确认，所以 base64 完全不传（见 `llm-client.js:192-194` 的注释）

### 数据模型（共享给前后端）

`mock-data.js` 把所有 mock 数据挂到 `window.MockData` 上（`mock-data.js:607`），关键字段：
- `PROJECTS` / `AREAS[projectId]` / `WORKERS` — 档案库，几乎不变
- `EVENTS` / `HISTORY_EVENTS` — 当天/历史事件，`type` ∈ `progress | material | safety | coordination | attendance`
- `ISSUES` — 跨日跟踪的事项，`type` ∈ `quality | safety | coordination | ecc | change | visa`，`status` ∈ `open | in_progress | closed`

`app.js` 通过 `let M = window.MockData;`（`app.js:5`）访问。

## 修改时容易踩的坑

1. **前后端规则必须双份维护**。`mock-data.js` 的 `mockParseVoice` 跟 `backend/mock-fallback.js` 的 `mockParseVoice` 是平行的，改一边要同步另一边——这是降级策略，不是 DRY 违反。
2. **后端读的是项目根 `.env`，不是 `backend/.env`**。新增环境变量要么放根 `.env`，要么改 `backend/server.js:22` 的 `ENV_PATH`。
3. **LLM 输出 JSON 不可信**。`_parseJsonSafe` 已经做了三道处理（去 markdown / 提取 `{...}` / 字段兜底），但调用方仍要在拿到 `areaId` 后用 `areas.find(a => a.id === obj.areaId)` 校验。
4. **App.js 是单文件 1500+ 行**，从 `initCalendarWithToday` 开始按职责段划分，LLM 集成追加在文件末尾（`app.js:1361` 注释 "追加 - 不影响原有逻辑"）。新功能如需改核心渲染，优先在对应段内改；跨段改动风险高。
5. **测试用 `setTimeout` 等异步**（`test-integration.js:29, 60, 80`），如果改了 `app.js` 的初始化时序，需要相应调 timeout。
6. **样式在 `styles.css`，主蓝 `#00adef`**——新增组件时先 grep 现有 `.card` / `.btn` / `.form-input` 复用，不要内联大量样式。

## 集成点

- 与 **百草园/绿城/万科** 周报系统的对接**尚未实现**（`design.md` 是规划文档，`app.js:473` 的"导出到周报系统"目前是 mock 按钮）。`design.md` 描述的 `weekly-report-adapter.js` 还没写。
- 真实 LLM 唯一接入点是 `MINIMAX_API_KEY`（根 `.env`），协议是 Anthropic 兼容（`x-api-key` header + `anthropic-version: 2023-06-01`）。
- 没有身份认证、没有数据库、没有 Redis——`.env` 里的 `DB_*` / `REDIS_*` / `JWT_*` 是 `design.md` 规划的 Phase 2 配置，当前代码不读。

## 关键文件速查

| 文件 | 作用 |
|------|------|
| `index.html` | 主页骨架 + 9 个模态框（语音/拍照/手动/事项/周报/项目切换/事件详情/事件编辑/日计划/LLM 设置） |
| `app.js` | 全部前端逻辑（1500+ 行），状态 + 渲染 + 录入 + 后端调用 |
| `mock-data.js` | 3 个项目的 PROJECTS/AREAS/WORKERS/EVENTS/ISSUES 静态数据 + 规则化 mockParse* |
| `styles.css` | 主蓝 `#00adef` 品牌色，所有 `.card` `.btn` `.modal` `.timeline` 等基础类 |
| `backend/server.js` | Express 入口，5 个 LLM 代理端点 |
| `backend/llm-client.js` | `MinMaxClient`：fetch + 重试 + JSON 容错 + 3 个业务方法 |
| `backend/mock-fallback.js` | 后端版规则化降级（与 `mock-data.js` 平行） |
| `.env` | 根目录环境变量（**不是** `backend/.env`），`MINIMAX_*` 是当前唯一被读取的 |
| `design.md` | Phase 1→4 的完整技术规划，部分尚未实现（可作路线图参考） |
| `requirements.md` | 原始需求文档 |
