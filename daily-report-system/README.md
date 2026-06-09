# 施工日报系统 - Demo (Phase 1 Mock 版)

## 目标

为"日报到周报 LLM 聚合系统"做**最小可运行 demo**，用 mock 数据把核心流程跑通。

## 跑通的核心流程

  ① 多项目切换（百草园 / 绿城·滨江 / 万科·都会）
  ② 今日事件流（自动按时间排序、类型筛选）
  ③ 4 种录入方式：
      - 语音录入（mock 录音 2.5 秒 + 规则化解析）
      - 拍照录入（mock 上传 + AI 识别元数据）
      - 手动录入（结构化表单，按事件类型动态渲染字段）
      - 事项台账登记（独立通道：质量/安全/协调/ECC/变更/签证）
  ④ 事件操作：查看详情、确认、删除
  ⑤ 一键确认日报（批量把草稿转已确认）
  ⑥ 一键生成周报（mock 聚合：按区域汇总、统计事项、生成下周计划）

## 文件清单

  - `index.html`     主页面（顶部 + 左侧事件流 + 右侧项目信息/事项台账）
  - `styles.css`     样式（沿用 #00adef 主蓝品牌色）
  - `mock-data.js`   Mock 数据 + 规则化解析函数（mockParseVoice/Photo/Weekly）
  - `app.js`         主逻辑（渲染/录入/聚合/模态框/Toast）
  - `design.md`      原始设计文档（未改）
  - `requirements.md`原始需求文档（未改）
  - `tests/`         集成测试（jsdom，不参与产品运行）

## 运行方式

直接双击 `index.html` 即可在浏览器打开，**不需要任何构建步骤**。

或者用本地静态服务器：

```bash
cd daily-report-system
python -m http.server 8080
# 浏览器访问 http://localhost:8080
```

## 集成测试

```bash
cd tests
npm install  # 安装 jsdom
node test-integration.js
```

测试覆盖：
  - 页面初始化
  - 项目加载
  - 事件流渲染
  - 语音解析 → 保存事件
  - 周报聚合

## 关键设计点

### 1. 数据模型（4 个核心实体）

| 实体 | 类比 | 落地 |
|------|------|------|
| 档案库 | 几乎不变的数据 | PROJECTS / AREAS / WORKERS |
| 事件流 | 当天日报的核心 | EVENTS（type: progress/material/safety/coordination/attendance） |
| 事项台账 | 跨日跟踪 | ISSUES（status: open/in_progress/closed） |
| 周报 | 聚合产物 | mockAggregateWeekly() 输出 |

### 2. 减负策略（已实现）

  - 昨天复制：mockAggregateWeekly 默认基于当周事件聚合
  - 默认智能填充：手动录入时进度/人数预填常用值
  - 拍照即录入：mock 拍照后自动归类到区域
  - 语音即录入：mock 录音 2.5 秒后自动填入示例文本 + 解析
  - 一键确认日报：批量处理草稿 → 已确认

### 3. 字段设计

每个 event 的 `payload` 根据 `type` 不同而不同，进度事件有 taskName/progress/owner 等，材料事件有 materialName/quantity/action 等。**这样既保留灵活性，又避免 5 大类各开一张表的繁琐**。

## 后续 Phase 2 计划

  - 后端：Node.js + Express + PostgreSQL
  - 真实 LLM 接入：OpenAI / Claude（替换 mockParse* 函数）
  - 真实语音识别：Web Speech API 或 Whisper
  - 真实图像识别：GPT-4V / Claude Vision
  - 周报系统对接：REST API
  - 多用户/权限/工单
