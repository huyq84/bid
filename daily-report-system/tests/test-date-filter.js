// 验证：选中日期后操作不串数据
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const mockDataCode = fs.readFileSync(path.join(__dirname, '..', 'mock-data.js'), 'utf8');
const appCode = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

const dom = new JSDOM(html, {
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
let pass = 0, fail = 0;
const ok = (n, c, d) => { (c ? pass++ : fail++); console.log(`  ${c ? '✅' : '❌'} ${n}` + (d ? ` · ${d}` : '')); };

(async () => {
  await sleep(800);

  // 工具：拿到事件流里所有可见的事件的 date 集合
  function visibleDates() {
    const items = doc.querySelectorAll('#eventTimeline .event-item');
    return new Set(Array.from(items).map(el => {
      // event-item 本身不显示 date，从 M.EVENTS 按 id 查
      return null;
    }));
  }

  function visibleEventCount() {
    return doc.querySelectorAll('#eventTimeline .event-item').length;
  }

  // 初始化
  win.currentCalendarDate = new Date('2026-06-01');
  win.initProject();
  win.initCalendar();
  await sleep(200);

  console.log('\n=== 步骤 1: 选 6/8（mock 无数据）===');
  win.toggleCalendarDate('2026-06-08', { preventDefault(){} });
  await sleep(200);
  const count8 = visibleEventCount();
  console.log(`  6/8 可见事件数: ${count8}`);
  ok('6/8 mock 无事件（count=0）', count8 === 0, `count=${count8}`);

  // 拿一个 6/9 的草稿事件（mock 里 7 条事件全归 6/9）
  const ev9 = win.MockData.EVENTS.find(e => e.date === '2026-06-09' && e.status === 'draft');
  console.log(`  6/9 草稿事件: ${ev9?.id || '无'}`);
  ok('6/9 有草稿事件', !!ev9);

  // 再选 6/8（mock 里没数据）
  win.toggleCalendarDate('2026-06-08', { preventDefault(){} });
  await sleep(200);
  const ev8 = win.MockData.EVENTS.find(e => e.date === '2026-06-08' && e.status === 'draft');
  console.log(`  6/8 草稿事件: ${ev8?.id || '无 (mock 无数据, 正常)'}`);

  console.log('\n=== 步骤 2: 确认 6/8 草稿（验证不影响 6/9）===');
  if (ev8) {
    win.confirmEvent(ev8.id);
    await sleep(200);
    const updated8 = win.MockData.EVENTS.find(e => e.id === ev8.id);
    ok('6/8 事件已变 confirmed', updated8.status === 'confirmed', `status=${updated8.status}`);
    if (ev9) {
      const updated9 = win.MockData.EVENTS.find(e => e.id === ev9.id);
      ok('6/9 草稿事件未受影响', updated9.status === 'draft', `status=${updated9.status}`);
    }
  } else {
    // 6/8 没数据，直接测试：切回 6/9 确认一个，看 6/8 状态
    console.log('  (6/8 无 mock 事件, 跳过此步)');
  }

  console.log('\n=== 步骤 3: 切到 6/9，确认一个 6/9 草稿 ===');
  win.toggleCalendarDate('2026-06-09', { preventDefault(){} });
  await sleep(200);
  if (ev9) {
    const beforeCount = win.MockData.EVENTS.filter(e => e.date === '2026-06-09' && e.status === 'confirmed').length;
    win.confirmEvent(ev9.id);
    await sleep(200);
    const updated9 = win.MockData.EVENTS.find(e => e.id === ev9.id);
    ok('6/9 事件已确认', updated9.status === 'confirmed', `status=${updated9.status}`);
    const afterCount = win.MockData.EVENTS.filter(e => e.date === '2026-06-09' && e.status === 'confirmed').length;
    ok('6/9 已确认数 +1', afterCount === beforeCount + 1, `before=${beforeCount}, after=${afterCount}`);
  }

  console.log('\n=== 步骤 4: 撤回 6/9 事件 ===');
  if (ev9) {
    win.confirmEvent(ev9.id);
    await sleep(200);
    const updated9 = win.MockData.EVENTS.find(e => e.id === ev9.id);
    ok('6/9 事件已撤回为 draft', updated9.status === 'draft', `status=${updated9.status}`);
  }

  console.log('\n=== 步骤 5: 选 6/9 后, 一键确认（应只影响 6/9）===');
  if (ev9) {
    // 先确认 ev9 看效果
    win.confirmEvent(ev9.id);
    await sleep(200);
    const beforeCount = win.MockData.EVENTS.filter(e => e.date === '2026-06-09' && e.status === 'confirmed').length;
    win.confirmTodayReport();
    await sleep(200);
    // 现在 6/9 应该没草稿了（ev9 刚被确认了），所以一键确认 0 个
    // 但其他 6/9 的草稿应该被确认
    const afterCount = win.MockData.EVENTS.filter(e => e.date === '2026-06-09' && e.status === 'confirmed').length;
    const draftCount9 = win.MockData.EVENTS.filter(e => e.date === '2026-06-09' && e.status === 'draft').length;
    ok('6/9 一键确认后无草稿', draftCount9 === 0, `drafts=${draftCount9}`);
    ok('6/9 已确认数 >= 之前', afterCount >= beforeCount, `before=${beforeCount}, after=${afterCount}`);
  }

  console.log('\n=== 步骤 6: stats 按选中日期统计 ===');
  // 切到 6/9
  win.toggleCalendarDate('2026-06-09', { preventDefault(){} });
  await sleep(200);
  const statProgress9 = parseInt(doc.getElementById('statProgress').textContent);
  const progressCount9 = win.MockData.EVENTS.filter(e =>
    e.date === '2026-06-09' && e.type === 'progress' && e.projectId === 'baicaoyuan'
  ).length;
  ok('stats 进度数字 = 6/9 实际数', statProgress9 === progressCount9,
     `stat=${statProgress9}, actual=${progressCount9}`);

  console.log('\n=== 步骤 7: 多选模式下确认 6/9 + 6/8，stats 应合并 ===');
  // 模拟多选
  win.toggleMultiSelect();
  await sleep(200);
  // 当前应该是 6/9，再加 6/8
  win.toggleCalendarDate('2026-06-08', { preventDefault(){} });
  await sleep(200);
  // 当前 selectedDates 应该包含 6/9 和 6/8
  console.log(`  selectedDates: ${JSON.stringify(win.selectedDates)}`);
  const statMulti = parseInt(doc.getElementById('statProgress').textContent);
  // 多选 = 6/8 + 6/9 进度数（6/8 是 0）
  const expectedMulti = progressCount9 + 0;
  ok('多选 stats 数字 = 6/8+6/9 进度数', statMulti === expectedMulti,
     `stat=${statMulti}, expected=${expectedMulti}`);

  console.log(`\n=== 汇总 ===`);
  console.log(`  通过 ${pass} / 失败 ${fail}`);
  process.exit(fail > 0 ? 1 : 0);
})();
