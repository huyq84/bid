// 量化"操作占小、数据占大"的效果
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');
const mockDataCode = fs.readFileSync(path.join(__dirname, '..', 'mock-data.js'), 'utf8');
const appCode = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

// 把 <link rel="stylesheet"> 替换为内联 <style> 让 jsdom 解析
const htmlInline = html.replace(
  /<link[^>]*href="styles\.css"[^>]*>/,
  `<style>${css}</style>`
);

const dom = new JSDOM(htmlInline, {
  url: 'http://localhost/index.html',
  runScripts: 'dangerously',
  pretendToBeVisual: true
});

dom.window.fetch = (...args) => fetch(...args);
dom.window.alert = () => {};
dom.window.confirm = () => true;

const win = dom.window;
const doc = win.document;
const scriptEl = doc.createElement('script');
scriptEl.textContent = mockDataCode + '\n' + appCode;
doc.body.appendChild(scriptEl);

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  await sleep(800);

  console.log('=== 关键元素尺寸测量（基于 CSS 计算值）===\n');

  // 用 window.getComputedStyle 拿 CSS 高度
  const ops = [
    { name: '概览小卡片',   sel: '.summary-item' },
    { name: '录入入口卡片', sel: '.entry-card' },
    { name: '事件操作按钮', sel: '.event-actions .btn' },
    { name: '筛选 chip',    sel: '.filter-chip' },
    { name: '事项行',       sel: '.issue-row' },
    { name: '工具栏',       sel: '.toolbar' },
    { name: '卡片 header',  sel: '.card-header' }
  ];

  const cs = win.getComputedStyle.bind(win);

  function height(el) {
    if (!el) return 0;
    const s = cs(el);
    return parseFloat(s.paddingTop) + parseFloat(s.paddingBottom) + parseFloat(s.height || s.minHeight || 20);
  }
  function fontPx(el) {
    if (!el) return 0;
    return parseFloat(cs(el).fontSize);
  }

  for (const op of ops) {
    const el = doc.querySelector(op.sel);
    if (el) {
      const h = height(el);
      const fs = fontPx(el);
      console.log(`  ${op.name.padEnd(12, ' ')}: ${h.toFixed(0).padStart(3)}px  字号 ${fs}px`);
    }
  }

  console.log('\n=== 事件流密度估算 ===');
  const event = doc.querySelector('.event-item');
  if (event) {
    const eventH = height(event);
    const eventFs = fontPx(event);
    console.log(`  事件卡片   : ${eventH.toFixed(0)}px  字号 ${eventFs}px`);
    // 假设主区高度 = 视口 - topbar - header - 日历 (估算)
    const viewportH = 720; // 假设 720p 屏幕
    const topbarH = 50;
    const tabContent = doc.querySelector('.tab-content');
    if (tabContent) {
      // 概览卡 + 录入卡 + 工具栏 + 事件卡 header
      const summaryCard = doc.querySelector('.today-summary');
      const entryCard = doc.querySelector('.entry-card');
      const toolbar = doc.querySelector('.toolbar');
      const eventHeader = doc.querySelector('#eventTimeline')?.parentElement?.parentElement?.querySelector('.card-header');
      const summaryH = height(summaryCard) + 50; // 概览卡
      const entryH = height(entryCard) + 50;     // 录入卡
      const toolbarH = height(toolbar);
      const eventHeaderH = height(eventHeader);
      const overhead = summaryH + entryH + toolbarH + eventHeaderH + 32; // 32 = 4 个 card margin
      const available = viewportH - topbarH - overhead;
      const fitCount = Math.floor(available / eventH);
      console.log(`\n  假设 720p 屏幕：`);
      console.log(`  概览卡+录入卡+工具栏+事件卡 header = ${overhead}px`);
      console.log(`  事件流可用高度 = ${available}px`);
      console.log(`  可容纳事件数 = ${fitCount} 条（每条 ${eventH}px）`);
    }
  }

  process.exit(0);
})();
