// 验证：操作事件后日历同步
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

  // 工具：抓日历某一天的状态点 HTML
  function dayStatusHtml(dateStr) {
    const cells = doc.querySelectorAll('.calendar-day');
    for (const cell of cells) {
      if (cell.textContent.includes(String(parseInt(dateStr.split('-')[2]))) &&
          cell.querySelector('.calendar-dots')) {
        return cell.querySelector('.calendar-dots').innerHTML;
      }
    }
    return null;
  }

  // 切换到 6 月
  win.currentCalendarDate = new Date('2026-06-01');
  win.initCalendar();
  // 选 6/5 为当前选中日期（confirmTodayReport 只操作 selectedDates 范围）
  win.toggleCalendarDate('2026-06-05', { preventDefault(){} });
  await sleep(200);

  console.log('=== 6 月 5 日初始状态 ===');
  const before = dayStatusHtml('2026-06-05');
  console.log('  ', before?.replace(/\s+/g, ' ').trim());
  ok('5 日有状态点', before && before.includes('○'), `html=${before?.slice(0, 100)}`);

  // 找到一个 5 日的草稿事件
  const events5 = win.MockData.EVENTS.filter(e => e.date === '2026-06-05' && e.status === 'draft');
  if (events5.length === 0) {
    console.log('  (没有 5 日草稿事件，跳过)');
  } else {
    const evId = events5[0].id;
    console.log(`\n=== 确认事件 ${evId} ===`);
    win.confirmEvent(evId);
    await sleep(200);
    const after = dayStatusHtml('2026-06-05');
    console.log('  ', after?.replace(/\s+/g, ' ').trim());
    // 5 号原本只有 1 个草稿，确认后变 1 个 confirmed
    ok('5 日状态从草稿变已确认', after && after.includes('✓'), `html=${after?.slice(0, 100)}`);

    // 再撤回
    console.log(`\n=== 撤回事件 ${evId} ===`);
    win.confirmEvent(evId);
    await sleep(200);
    const after2 = dayStatusHtml('2026-06-05');
    console.log('  ', after2?.replace(/\s+/g, ' ').trim());
    ok('5 日状态从已确认变回草稿', after2 && after2.includes('○'), `html=${after2?.slice(0, 100)}`);
  }

  console.log('\n=== 一键确认所有今日草稿 ===');
  // 先手动加一个草稿事件
  win.MockData.EVENTS.unshift({
    id: 'TEST-DRAFT', projectId: 'baicaoyuan', date: '2026-06-05', time: '16:00',
    type: 'progress', areaId: 'A1', status: 'draft',
    payload: { taskName: '测试', progress: '50%', status: '进行中', owner: '测试', headcount: 1 }
  });
  win.renderTodayEvents();
  win.updateCalendar();
  await sleep(200);
  const beforeAll = dayStatusHtml('2026-06-05');
  console.log('  添加草稿后:', beforeAll?.replace(/\s+/g, ' ').trim());
  ok('添加草稿后 5 日有 ○', beforeAll && beforeAll.includes('○'));

  win.confirmTodayReport();
  await sleep(200);
  const afterAll = dayStatusHtml('2026-06-05');
  console.log('  一键确认后:', afterAll?.replace(/\s+/g, ' ').trim());
  ok('一键确认后 5 日都是已确认', afterAll && afterAll.includes('✓') && !afterAll.includes('○'),
     `html=${afterAll?.slice(0, 100)}`);

  console.log('\n=== 新增事件后日历同步 ===');
  const evCountBefore = win.MockData.EVENTS.length;
  win.MockData.EVENTS.unshift({
    id: 'TEST-1', projectId: 'baicaoyuan', date: '2026-06-05', time: '16:00',
    type: 'progress', areaId: 'A1', status: 'draft',
    payload: { taskName: '测试', progress: '50%', status: '进行中', owner: '测试', headcount: 1 }
  });
  win.renderTodayEvents();
  win.updateCalendar();
  await sleep(200);
  const afterNew = dayStatusHtml('2026-06-05');
  console.log('  ', afterNew?.replace(/\s+/g, ' ').trim());
  ok('新增事件后 5 日有点', afterNew !== null, `html=${afterNew?.slice(0, 100)}`);

  console.log(`\n=== 汇总 ===`);
  console.log(`  通过 ${pass} / 失败 ${fail}`);
  process.exit(fail > 0 ? 1 : 0);
})();
