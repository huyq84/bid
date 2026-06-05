# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目性质

这不是一个可构建的代码工程，而是**百草园城市更新项目工作周报的静态 HTML 演示文稿**（汇报单位：北京清尚；总包：中建三局集团（深圳）有限公司）。所有内容均为单文件 HTML + 配套 PNG 截图，无 npm/构建/测试/打包流程。修改即保存，浏览器直接打开即可预览。

## 目录结构

- `01封面.html` ~ `12协调事宜.html` —— 12 个独立的幻灯片页面，每页一文件
- `周报汇总.html` —— 把 12 个页面内联到单一 HTML 中，通过顶部导航按钮切换（`showPage()` JS）
- `百草园-清尚-周报2026.5.18.pdf` —— 完整周报的 PDF 交付物
- `*.png` —— 每个 HTML 对应的渲染截图，以及 `背景.png`、施工段划分楼层图等素材
- 命名规范：`<编号><标题>.html` / `<编号><标题>.png`，编号带前导零（`01`、`02`、`0301`、`03`）

## 页面规范（必须保持一致）

- **画布尺寸**：每页固定 `1280px × 720px`（`.main-container` / `.slide-container` / `.page-frame`）
- **样式框架**：通过 CDN 加载 Tailwind —— `<script src="https://cdn.tailwindcss.com?plugins=forms,container-queries"></script>`，**不**使用本地构建链
- **字体**：`'Noto Sans SC', 'Microsoft YaHei', 'PingFang SC', sans-serif`（部分封面用 `Kaiti`）
- **背景**：所有页面共用同一张背景图（`背景.png` 或 googleusercontent URL），通过 `background-size: cover` 铺满
- **页眉元素**（02 及之后）：左侧 58×52 梯形装饰块（`#37a3eb`，`clip-path: polygon(0 0, 60% 0, 100% 100%, 0 100%)`）+ 顶部 3px 横线 + 标题
- **品牌色**：
  - 主蓝 `#00adef` / `#37a3eb`
  - 深蓝 `#0081cc` / `#005596`
  - 强调黄 `#facc15` / 黄色文字
- **中文内容**：所有正文均为中文，标题用 `tracking-[0.2em]` / `tracking-widest` 增加字距

## 维护要点

- 改完单页 HTML 后，**同步更新 `周报汇总.html`** 中对应 `<div class="page-wrapper" id="pageXX">` 块，并在顶部导航 `<button>` 中保证顺序与编号一致
- 渲染截图（PNG）通常在 HTML 定稿后用浏览器/Puppeteer 重新生成；交付前确认 HTML 与同名 PNG 内容一致
- HTML 中的背景图 URL 指向 `lh3.googleusercontent.com`（Google AI Studio 导出产物），**不要假设这些 URL 长期有效**；如需离线分发，应改用本地 `背景.png`
- 周报日期、汇报单位、汇报人等元信息可能跨版本变化，集中检查 `01封面.html` 和 PDF 文件名
