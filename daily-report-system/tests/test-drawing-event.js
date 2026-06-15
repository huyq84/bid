// 验证：图纸深化事件类型（手动录入 → 周报 08 页）
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const mockDataCode = fs.readFileSync(path.join(__dirname, 'mock-data.js'), 'utf8');
const appCode = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');

const dom = new JSDOM(html, {
  url: 'http://localhost/index.html',
  runScripts: 'dangerously',
  pretendToBeVisual: true
});

const scriptEl = dom.window.document.createElement('script');
scriptEl.textContent = mockDataCode + '\n' + appCode;
dom.window.document.body.appendChild(scriptEl);

const win = dom.window;
const doc = win.document;

let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  ✅ ${name}` + (detail ? ' · ' + detail : '')); }
  else      { fail++; console.log(`  ❌ ${name}` + (detail ? ' · ' + detail : '')); }
};

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  await sleep(800);

  console.log('\n=== 1. TYPE_META 含 drawing ===');
  ok('TYPE_META.drawing 定义', win.MockData.TYPE_META?.drawing?.label === '图纸深化');
  ok('drawing color', win.MockData.TYPE_META?.drawing?.color === '#6366f1');

  console.log('\n=== 2. 4 个 type select 含 drawing option ===');
  ok('vp-type 含 drawing', doc.getElementById('vp-type')?.querySelector('option[value="drawing"]') !== null);
  ok('pp-type 含 drawing', doc.getElementById('pp-type')?.querySelector('option[value="drawing"]') !== null);
  ok('m-type 含 drawing', doc.getElementById('m-type')?.querySelector('option[value="drawing"]') !== null);
  ok('edit-type 含 drawing', doc.getElementById('edit-type')?.querySelector('option[value="drawing"]') !== null);

  console.log('\n=== 3. 筛选 chip 含 drawing ===');
  ok('filter-chip[data-filter="drawing"]', doc.querySelector('.filter-chip[data-filter="drawing"]') !== null);

  console.log('\n=== 4. 手动录入：renderManualForm(\'drawing\') ===');
  doc.getElementById('m-type').value = 'drawing';
  win.renderManualForm();
  await sleep(50);
  ok('表单 m-task 存在', doc.getElementById('m-task') !== null);
  ok('表单 m-owner 存在', doc.getElementById('m-owner') !== null);
  ok('表单 m-progress 存在', doc.getElementById('m-progress') !== null);

  console.log('\n=== 5. 保存图纸深化事件 ===');
  const drawingBefore = (win.MockData.EVENTS || []).filter(e => e.type === 'drawing').length;
  const ddBefore = (win.MockData.DRAWING_DEEPENINGS || []).length;

  doc.getElementById('m-task').value = '5号咖啡厅立面图调整';
  doc.getElementById('m-owner').value = '李欢';
  doc.getElementById('m-progress').value = '50%';
  // 区域必填
  const areaSelect = doc.getElementById('m-area');
  if (areaSelect && areaSelect.options.length > 1) areaSelect.value = areaSelect.options[1].value;
  doc.getElementById('m-date').value = '2026-06-12';
  doc.getElementById('m-time').value = '10:30';
  doc.getElementById('m-note').value = '测试';
  win.saveManualEvent({ skipCloseModal: true });

  const drawingAfter = (win.MockData.EVENTS || []).filter(e => e.type === 'drawing').length;
  const ddAfter = (win.MockData.DRAWING_DEEPENINGS || []).length;
  ok('EVENTS drawing +1', drawingAfter === drawingBefore + 1, `${drawingBefore}→${drawingAfter}`);
  ok('DRAWING_DEEPENINGS +1', ddAfter === ddBefore + 1, `${ddBefore}→${ddAfter}`);

  const newEvent = win.MockData.EVENTS.find(e => e.type === 'drawing' && e.payload?.taskName === '5号咖啡厅立面图调整');
  ok('事件 payload.taskName 正确', newEvent?.payload?.taskName === '5号咖啡厅立面图调整');
  ok('事件 payload.owner 正确', newEvent?.payload?.owner === '李欢');
  ok('事件 payload.progress 正确', newEvent?.payload?.progress === '50%');

  const ddRecord = win.MockData.DRAWING_DEEPENINGS.find(d => d.eventId === newEvent?.id);
  ok('DRAWING_DEEPENINGS 关联 eventId', ddRecord !== undefined);
  ok('DRAWING_DEEPENINGS.task 正确', ddRecord?.task === '5号咖啡厅立面图调整');
  ok('DRAWING_DEEPENINGS.progress 正确', ddRecord?.progress === '50%');

  console.log('\n=== 6. 周报 08 页含新建事件 ===');
  // 切到 08 页（需要打开 mapping modal）
  // 直接调用 getPage08Data
  const page08Data = win.MockData.getPage08Data('baicaoyuan');
  ok('getPage08Data 返回数组', Array.isArray(page08Data));
  // 由于 saveUnifiedEvent/saveManualEvent 已把新事件双写到 DRAWING_DEEPENINGS，
  // 所以 getPage08Data 通过 DRAWING_DEEPENINGS 路径返回（source 取决于是否带 eventId）。
  // 关键断言：新建任务的 task 文本 + 完整的 8 条 seed 数据仍在。
  ok('getPage08Data 含新建任务', page08Data.some(r => r.task === '5号咖啡厅立面图调整'));
  const hasSeed = page08Data.filter(r => r.source === 'seed').length;
  ok('保留 8 条 seed 条目', hasSeed === 8, `seed count=${hasSeed}`);
  ok('原 seed 任务"1-2号咖啡厅样板段策划整理"仍在',
     page08Data.some(r => r.task === '1-2号咖啡厅样板段策划整理'));

  console.log('\n=== 7. mockParseVoice 识别图纸深化 ===');
  if (typeof win.MockData.mockParseVoice === 'function') {
    const r1 = win.MockData.mockParseVoice('5号咖啡厅图纸深化进度50%，李欢负责', 'baicaoyuan');
    ok('"图纸深化" → drawing', r1.type === 'drawing', `type=${r1.type}`);
    ok('drawing 自动识别进度', r1.payload?.progress === '50%');
    const r2 = win.MockData.mockParseVoice('样板段打样中，需要等设计确认', 'baicaoyuan');
    ok('"打样" → drawing', r2.type === 'drawing', `type=${r2.type}`);
    const r3 = win.MockData.mockParseVoice('高管区天花吊顶龙骨安装，张师傅带两个人在做', 'baicaoyuan');
    ok('非图纸描述仍为 progress', r3.type === 'progress', `type=${r3.type}`);
  } else {
    ok('mockParseVoice 存在', false);
  }

  console.log('\n=== 8. 编辑事件：renderEditForm(\'drawing\') ===');
  if (newEvent) {
    win.selectedEventId = newEvent.id;
    doc.getElementById('edit-type').value = 'drawing';
    win.renderEditForm('drawing', newEvent.payload);
    await sleep(50);
    ok('edit-task 存在', doc.getElementById('edit-task') !== null);
    ok('edit-owner 存在', doc.getElementById('edit-owner') !== null);
    ok('edit-progress 存在', doc.getElementById('edit-progress') !== null);
  }

  console.log('\n=== 汇总 ===');
  console.log(`  通过: ${pass}  失败: ${fail}`);
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => {
  console.error('测试异常:', e.message);
  console.error(e.stack);
  process.exit(1);
});
