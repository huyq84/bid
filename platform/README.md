# 百草园周报填报平台 - 原型

> 形态: HTML + TailwindCSS (CDN) + MockJS (CDN) + 原生 ES Module
> 状态: 静态原型 (Mock 数据 + Mock LLM)
> 上层方案: 详见 `docs/方案设计_v3.md`

---

## 快速开始

直接在浏览器打开 `index.html` 即可:

```
D:\hyq\cjs\周报\platform\index.html
```

零构建，零后端，零网络依赖（除CDN）。

---

## 文件结构

```
platform/
├── index.html               # 主填报界面 (章节导航 + 章节内容)
├── preview.html             # 12页周报预览 (iframe 加载 12 个分页)
├── docs/
│   └── 方案设计_v3.md
├── css/
│   └── app.css              # 平台 UI 样式 (中性灰+蓝)
├── js/
│   ├── store.js             # 报告数据 store (localStorage 持久化)
│   ├── llm.js               # Mock LLM 服务 (语音/粘贴/附件 → 结构化抽取)
│   ├── rules.js             # 异常检测规则引擎
│   ├── app.js               # 主入口 (章节切换、Toast、按钮事件)
│   └── sections/            # 12 章节渲染器
│       ├── s01_cover.js
│       ├── s02_toc.js
│       ├── s03_roster.js
│       ├── s0301_milestones.js
│       ├── s04_work_done.js      ← 多入口 (voice/paste/form/file)
│       ├── s05_photos.js
│       ├── s06_labor.js         ← 多入口
│       ├── s07_ecc.js           ← 多入口
│       ├── s08_design.js        ← 多入口 (voice/paste/form)
│       ├── s09_plan.js          ← 多入口 (ai/voice/paste)
│       ├── s10_sections.js
│       ├── s11_schedule.js      ← AI 续排入口
│       └── s12_coord.js
└── preview_pages/           # 12 个预览页 (从 ../01~12.html 复制)
    ├── 01.html .. 12.html
    └── 0301.html
```

---

## 演示路径

1. 打开 `index.html` → 默认进入 01 封面，**4 个区块都是只读**
2. 点击左侧 **04 上周完成** → 看到 10 条已确认事项
3. 切换到 **粘贴文本** Tab，粘贴一段话，**🤖 AI 抽取** → 出现草稿卡（带置信度）
4. 点击 **✓ 接受** 任一草稿 → 合并到下方"已确认事项"
5. 切换到 **上传附件** Tab → 上传一个 PDF/Word/Excel/图片，模拟抽取
6. 进入 **09 下周计划** → **🤖 AI 智能排甘特** → 模拟生成 14 条续排草稿
7. 在甘特图上**点击任一进度格** → 切换 fill/empty
8. 顶部 **⚙ 重新生成 AI 草稿** → 触发异常检测规则重新跑
9. 顶部 **👁 预览 12 页周报** → 新窗口打开 12 页周报 (完全沿用原 HTML 模板)

---

## 4 种录入入口

每个 AI 章节顶部都有 4 个 Tab：

| Tab | 用途 | Mock 实现 |
|---|---|---|
| 🎤 语音 | 现场口述 | 调用 `window.SpeechRecognition`；无则 Mock 返回假语音 |
| 📋 粘贴 | 微信群/邮件/便签 | 直接文本 → LLM 抽取 |
| ✍️ 表单 | 手动逐条录入 | 内联表单，不走 LLM |
| 📎 附件 | PDF/Word/Excel/图片 | `LLM.parseAttachment(file)` Mock 抽取 |

---

## 异常检测规则 (7条)

详见 `js/rules.js`：

| 规则 | 等级 | 说明 |
|---|---|---|
| `ecc-low-close-rate` | 🔴 红 | 关闭率 < 70% |
| `ecc-mismatch` | 🟡 黄 | 已关+流程中+未关 ≠ 总数 (允许 ±1 容差) |
| `carry-over-untouched` | 🟡 黄 | 上周进行中未续排 |
| `labor-spike` | 🟡 黄 | 总人数环比超 30% |
| `empty-coordination` | 🔵 蓝 | 协调表全空 |
| `missing-owner` | 🔵 蓝 | 工作完成缺责任人 |
| `missing-task-text` | 🔵 蓝 | 工作完成缺事项描述 |

等级规则：
- 🔴 红：阻塞导出（v1 暂不阻塞）
- 🟡 黄：建议处理
- 🔵 蓝：提示

---

## 数据持久化

`localStorage` 键名: `bcy_report_v2` (调试时清空即可重置)

清除方式（任一）:
- 控制台: `localStorage.clear()`
- `Store.reset()` 调用
- 浏览器 DevTools → Application → Local Storage → 删除

---

## v1 不做的事

- ❌ 真实 LLM 调用 (目前 LLM.js 全 Mock)
- ❌ PDF/Word/PPT 真实导出 (按钮提示 v2)
- ❌ 楼层图标注真实交互
- ❌ 真实鉴权 / 角色
- ❌ 多项目切换
- ❌ 历史数据回灌

---

## 调试入口

打开控制台，可以:

```js
// 跳到任意章节
App.goto('09')

// 触发 AI 草稿生成
Sections['04']._activeTab = 'paste';
document.getElementById('s04-paste-text').value = '这周食堂腻子完了';
App.s04ExtractPaste();

// 重置数据
Store.reset();

// 查看报告全文
Store.load()
```

---

## 测试已覆盖

- ✅ 13 个章节全部渲染
- ✅ 4 个 AI 章节的多入口切换
- ✅ AI 抽取 → 草稿卡 → 接受/丢弃 闭环
- ✅ 异常检测规则 7 条均运行
- ✅ 12 页周报预览 iframe 切换正常
- ✅ 楼层图 3 张正确加载
- ✅ 甘特图 21 行渲染，进度格可点击切换
- ✅ ECC 数字自动重算关闭率
- ✅ 人员合计自动重算
- ✅ localStorage 持久化/恢复

