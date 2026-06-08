# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目性质

`platform/` 是百草园周报的**数据填报原型** —— 单页面 HTML+JS 应用，所有逻辑在浏览器里跑，无构建/后端/包管理。兄弟目录 `../01封面.html` ~ `../12协调事宜.html` 是静态交付物（PPT 风格 1280×720 页面）；本目录是它们的**数据录入侧**。版本：v5.2。

## 运行

直接双击 `index.html` 用浏览器打开即可。唯一网络依赖是 CDN（Tailwind、Choices.js、jsPDF、html2canvas）—— 无 CDN 也能跑（用本地副本替换），但截图/IndexedDB/getUserMedia 在 `file://` 协议下可能受限，必要时 `python -m http.server` 起个本地静态服务。

`preview.html` 是另一入口：只读预览 12 个静态页面（`preview_pages/*.html`），与填报主流程解耦。

## 架构总览

**单页应用 + 全局对象 + localStorage** —— 没有框架。状态集中在两个地方：
- `window.__report` —— 当前周期（period）的内存数据
- `localStorage` —— 跨刷新持久化，键名 `bcy_report_${period}` 单独存每期

### 模块职责

| 文件 | 职责 |
|---|---|
| `js/app.js` | 主入口。状态机 + `App` 全局对象（所有用户操作回调），页面切换、Toast、模态框、anomaly 渲染。启动顺序 = `index.html` 里 `<script>` 顺序，**不要改**。 |
| `js/store.js` | 数据层。`Store.load/save/seed/getPeriods/getPeriodInfo/...`；默认 `nav_tree`、`pages_data` schema、跨期复制逻辑都在这里。 |
| `js/llm.js` | Mock LLM。`LLM.extractWorkDone / extractLabor / extractECC / extractDesign / planNextWeek / extendSchedule / groupPhotos` —— 都是 `await wait(600-900ms)` 后返回假数据。 |
| `js/rules.js` | 异常检测规则。`Rules.detectAll(report)` 返回 `{id, level, section, msg}[]`，level = red/yellow/blue。每次 rerender 都跑，覆盖 `report.ai_review.anomalies`。 |
| `js/nav_tree.js` | 左侧边栏树。`NavTree.renderHTML / renumber / addChapter / addPage / moveNode / findNode` —— 前缀自动编号、拖拽、改名、增删都靠它。 |
| `js/report_list.js` | 周报列表 modal。多期管理、批量删除、基准周期、生成周期、冲突处理。 |
| `js/sections/s01..s12_*.js` | 13 个章节渲染器（不含 13/14 自由型）。每文件 = `window.Sections["XX"] = { title, render(report), [materialize(report)] }`。 |
| `js/modules/capture.js` | 随手拍。`getUserMedia` + IndexedDB（库名 `bcy_capture`，store `photos`），与主流程解耦。 |
| `js/export_pdf.js` | PDF 导出。`jsPDF` + `html2canvas` 把每个 section 栅格化成 1280×720 的横版 PDF。 |
| `css/app.css` | 平台 UI 样式（中性灰+蓝）。 |

### Section 注册约定

每个 section 文件就一个 IIFE 赋值：

```js
window.Sections["XX"] = {
  title: "...",
  render(report) { return `<div>...</div>`; },
  // 可选: 重复型版式用 materialize 把 report.work_done groupBy('area')
  materialize(report) { return [{ id, keyValue, data: [...] }]; }
};
```

`app.js` 调度：`currentSection` (page_id, e.g. `'01'`) → `Sections[page_id].render(report)` → 插入 `#section-content`。没有 `initFilter` 的章节会在 `setTimeout(0)` 后调 `initFilter()`，给 Choices.js 接管 select 的窗口。

### 数据模型 (一份 report 对象的形态)

存于 `localStorage['bcy_report_2026-W21']`：

```js
{
  report_id, period: { week_no, start, end, report_date },
  project: { id, name, general_contractor, subcontractor },
  submitter: { org, user_id, role },
  receiver: { org, user_id, role },
  nav_tree: [...],          // 见下文
  pages_data: { '01': {...}, '04': {...}, ... },  // 每页原始 schema
  work_done: [...],         // 04 摊平数组 (area/task/progress/owner/deadline)
  site_photos: [...],       // 05
  construction_sections: [...],  // 10
  next_week_plan: [...],    // 09 (含 progress 7 元素数组 = 一~日)
  ui_config: { template_version, bg_image, cover, brand, prefix_format },
  ai_review: { auto_generated, generated_at, anomalies, evidence }
}
```

### nav_tree 结构 (核心)

树状，`{ id, type: 'chapter' | 'page', name, prefix, manual_prefix, children: [], [page_id], [is_closing] }`：
- `chapter` 节点有 `children`
- `page` 节点有 `page_id`（指向上面 `pages_data` 的 key）
- `prefix` 由 `NavTree.renumber` 自动算（`第N章` / `N.M`），`manual_prefix=true` 时冻结
- 封尾节点用 `is_closing: true`

### 三类版式

- **single** —— 1 个实例，直接 render（03/06/07/08/09/11/12）
- **repeatable** —— 实例数 = 数据 groupBy 后的组数（04/05 按 area，10 按 floor）；`materialize(report)` 做 group
- **free** —— 用户自由添加（13 随手拍 / 14 封尾；v5 引入）

## 与父项目的关系

| 父项目 (`../01封面.html` 等) | `platform/` |
|---|---|
| 12 个静态 HTML 页面，1280×720 画布 | 1 个 SPA，填数据用 |
| Tailwind CDN + 背景图 | Tailwind CDN + 中性灰主题 |
| 没有数据 | 数据从 `report` 对象反推 |
| 已是交付物 | 仍是原型（LLM 全 mock） |

`preview_pages/` 是从父项目复制的 13 份静态副本，供 `preview.html` iframe 展示用 —— **改父项目后记得同步过来**，否则预览和实际填报会漂移。

## 重要约定 & Gotchas

- **page_id 与 node.id 是两套**：`page_id` 形如 `'01'`/`'0301'`（在 pages_data 里寻址），node.id 形如 `'n01'`/`'n0301'`（树里寻址）。`App.gotoSection(pageId)` 内部用 `findNodeByPageId` 转换。
- **03 / 0301 历史包袱**：`n03` chapter 名字"组织架构"，其子 `n0301` page_id=`03` = "到岗管理人员"；**紧跟的兄弟节点** `n04` page_id=`0301` = "重要节点"。`store.js` 的 `load()` 里有 v3→v5 的迁移代码块保护旧数据。
- **受保护节点**：`App.confirmRemove` 拦截 `n01/n02/n03/n0301` 和 `page_id` 为 `01/02/03/0301` 的节点，禁止删除。
- **跨期复制**：`Store.seed(period, prevReport)` 把上期 `work_done` 的 progress 全归零、`roster.present=false`、`labor_stats` 把上期 next_week 复制成 this_week；项目/报送信息原样继承。`prevReport` 来自 `getPeriods()` 中上一期 —— 顺序由 `periods.sort()` 保证。
- **Reviewer 模式**：`renderSection` 注入只读 banner，然后把 `#section-content` 内所有 `input/select/button` 标 `disabled=true`（例外：`el.dataset.reviewerAllowed`）。
- **脚本加载顺序见 `index.html`**：先 `nav_tree → report_list → store → llm → rules → sections/* → modules/capture → export_pdf → app.js`。IIFE 之间通过 `window.Store` / `window.Rules` / `window.LLM` / `window.Sections` 互相引用，**顺序不能错**。
- **页面名歧义**：用户口里的"04 章节"通常指 `page_id='04'`（上周工作完成），但 tree 里它的父 chapter 是 `n05`（"上周工作"）—— 章节标题跟 page 标题不一致，UI 改的是 tree 节点 name，改的也是 `page_id` 那一行。

## 调试入口

浏览器控制台：

```js
// 跳到任意章节（page_id 形式）
App.gotoSection('09')

// 切填报人 / 复核人
App.changeRole('reviewer')

// 触发 AI 草稿（mock）
App.s09AiPlan()
App.s04ExtractPaste()

// 重置所有数据
Store.reset()  // 等价 localStorage.clear()

// 看完整 report 对象
window.__report

// 暴露在 window 上的跨文件助手
window._toast('hi', 'success')   // 弹 toast
window._rerender()                // 全量重渲
window._currentPeriod_get()       // 当前周期
window._findNodeByPageId(tree, '09')
```

## 关键设计文档

`docs/方案设计_v5.md` 是当前主线方案。**改数据模型或新增 section 前先看**：§0 立场、§1 三类版式、§2 实例化算法、§3 数据模型。比 v3/v4 新的部分是"数据反推版式"和"左侧可编辑树"。

## v1 不做的事（见 README）

真实 LLM / 真实文件解析 / 真实 PDF 排版（当前是 html2canvas 栅格化）/ 真实鉴权 / 多项目 / 历史回灌。
