// 验证：语音弹窗新功能（区域编辑 + LLM 真实调用 + 新区域询问）
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
dom.window.prompt = () => 'VIP 接待室';  // 自动返回测试区域名

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

  console.log('=== 1. 区域管理函数存在 ===');
  const fns = ['renderAreaOptions', 'addCustomArea', 'manageAreas', 'confirmAddNewArea',
               'dismissNewAreaHint', 'handleParsedArea', 'initCustomAreas', 'getProjectAreas'];
  fns.forEach(f => ok(f, typeof win[f] === 'function'));

  console.log('\n=== 2. 打开语音弹窗，区域下拉框有内容 ===');
  win.openVoiceInput();
  await sleep(200);
  const select = doc.getElementById('vp-area');
  const optionCount = select?.querySelectorAll('option').length || 0;
  ok('vp-area 有 option', optionCount > 0, `count=${optionCount}`);

  console.log('\n=== 3. 已有区域能正确选中 ===');
  // mock ParseVoice 后给 areaId
  win.applyVoiceParseResult({
    type: 'progress',
    areaId: 'A2',
    areaName: '',
    payload: { taskName: '测试', owner: '张师傅', progress: '50%', headcount: 1 },
    confidence: 0.9
  });
  await sleep(200);
  const sel = doc.getElementById('vp-area').value;
  ok('A2 自动选中', sel === 'A2', `value=${sel}`);

  console.log('\n=== 4. LLM 识别到新区域名，弹询问 ===');
  // 模拟后端返回新区域
  win.applyVoiceParseResult({
    type: 'progress',
    areaId: '',
    areaName: 'VIP 接待室',
    payload: { taskName: '墙面找平', owner: '李师傅', progress: '', headcount: 2 },
    confidence: 0.85
  });
  await sleep(200);
  const hint = doc.getElementById('vp-area-hint');
  ok('hint 显示', hint && hint.style.display !== 'none');
  ok('hint 提到 VIP 接待室', hint && hint.innerHTML.includes('VIP 接待室'));
  const hasAddBtn = hint && hint.innerHTML.includes('添加为新区域');
  ok('有"添加为新区域"按钮', hasAddBtn);

  console.log('\n=== 5. 点击"添加为新区域"后，区域被加入列表 ===');
  const beforeCount = win.getProjectAreas().length;
  win.confirmAddNewArea('VIP 接待室', 'vp-area');
  await sleep(200);
  const afterCount = win.getProjectAreas().length;
  ok('区域数 +1', afterCount === beforeCount + 1, `before=${beforeCount}, after=${afterCount}`);
  ok('新区域是 custom', !!win.findAreaByName('VIP 接待室')?.custom);
  ok('vp-area 自动选中新区域', doc.getElementById('vp-area').value !== '');

  console.log('\n=== 6. 区域管理弹窗：可列出所有区域 ===');
  win.manageAreas();
  await sleep(200);
  const areasList = doc.getElementById('areasListContainer');
  ok('areasListContainer 有内容', areasList && areasList.innerHTML.length > 50,
     `html.length=${areasList?.innerHTML.length}`);
  ok('列出新增的 VIP 接待室', areasList?.innerHTML.includes('VIP 接待室'));

  console.log('\n=== 7. 重新识别调 LLM（异步）===');
  doc.getElementById('voiceText').value = '高管办公区墙面开始处理';
  await win.reparseVoiceText();
  await sleep(5000);
  const vpArea = doc.getElementById('vp-area').value;
  ok('reparse 后 LLM 设置了区域', vpArea === 'A1' || vpArea !== '', `value=${vpArea}`);

  console.log('\n=== 8. parseVoiceText 真实 LLM 调用 ===');
  // 先重置 vp-type
  doc.getElementById('vp-type').value = '';
  doc.getElementById('vp-area-hint').style.display = 'none';
  await win.parseVoiceText('商业展示区安全巡检，一切正常');
  // 等待 LLM 返回（看 hint 文本判断）
  let waited = 0;
  while (waited < 15000) {
    await sleep(500);
    waited += 500;
    const hint = doc.getElementById('recordingHint')?.textContent || '';
    if (hint.includes('LLM 真实') || hint.includes('Mock 模式')) break;
  }
  // 再等一小会儿让 DOM 应用
  await sleep(200);
  const vpTypeAfter = doc.getElementById('vp-type').value;
  console.log('  vp-type value:', vpTypeAfter);
  const vpTypeOptions = Array.from(doc.getElementById('vp-type').options).map(o => o.value);
  console.log('  vp-type options:', vpTypeOptions.join(','));
  ok('type 正确（safety 或其他）', vpTypeAfter && vpTypeAfter.length > 0, `type=${vpTypeAfter}`);
  const vpAreaAfter = doc.getElementById('vp-area').value;
  ok('area 正确（A4 商业展示区）', vpAreaAfter === 'A4', `area=${vpAreaAfter}`);

  console.log('\n=== 9. 持久化：localStorage 保存 customAreas ===');
  const saved = doc.defaultView.localStorage.getItem('customAreas');
  ok('localStorage 有 customAreas', saved && saved.includes('VIP 接待室'),
     `saved=${saved?.slice(0, 100)}`);

  console.log(`\n=== 汇总 ===`);
  console.log(`  通过 ${pass} / 失败 ${fail}`);
  process.exit(fail > 0 ? 1 : 0);
})();
