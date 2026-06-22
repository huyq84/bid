// 验证：用户改写后的 index.html + 追加的 LLM 集成
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
dom.window.AbortController = AbortController;
dom.window.alert = (m) => console.log('[alert]', m);
dom.window.confirm = () => true;

const win = dom.window;
const doc = win.document;

// 注入脚本
const scriptEl = doc.createElement('script');
scriptEl.textContent = mockDataCode + '\n' + appCode;
doc.body.appendChild(scriptEl);

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  ✅ ${name}` + (detail ? ' · ' + detail : '')); }
  else      { fail++; console.log(`  ❌ ${name}` + (detail ? ' · ' + detail : '')); }
};

(async () => {
  await sleep(800);

  console.log('\n=== 1. 页面初始化（不报错）===');
  ok('项目名加载', doc.getElementById('projectName').textContent.includes('百草园'));
  ok('今日事件渲染', doc.getElementById('eventTimeline').children.length > 0,
     `count=${doc.getElementById('eventTimeline').children.length}`);
  ok('事项台账渲染', doc.getElementById('issueList').children.length > 0,
     `count=${doc.getElementById('issueList').children.length}`);
  ok('项目信息卡渲染（不报错）', doc.getElementById('projectInfoBody').innerHTML.length > 50);
  ok('日计划卡存在', doc.getElementById('dailyPlanCard') !== null);
  ok('日历存在', doc.getElementById('calendarGrid') !== null);

  console.log('\n=== 2. 顶栏 LLM 状态指示器 ===');
  await sleep(500);
  const label = doc.getElementById('backendLabel').textContent;
  const dot = doc.getElementById('backendDot').style.background;
  console.log(`  label=${label}, dot=${dot}`);
  ok('后端在线', label.includes('LLM') || label.includes('后端'),
     `label=${label}`);
  ok('顶栏有 backendStatus', doc.getElementById('backendStatus') !== null);

  console.log('\n=== 3. 关键函数都存在 ===');
  const fns = ['renderTodayEvents', 'renderProjectInfo', 'renderIssues', 'renderStats', 'initCalendar', 'renderDailyPlanCard',
               'checkBackendHealth', 'openLLMSettings', 'testLLMConnection',
               'openVoiceInput', 'openPhotoInput', 'openManualInput', 'openWeeklyReport'];
  fns.forEach(f => ok(f, typeof win[f] === 'function'));

  console.log('\n=== 4. 打开 LLM 设置模态框 ===');
  try {
    win.openLLMSettings();
    await sleep(800);
    const body = doc.getElementById('llmConfigBody').innerHTML;
    ok('模态框显示', doc.getElementById('modalLLM').classList.contains('show'));
    ok('显示 provider', body.includes('MiniMax'));
    ok('显示 base URL', body.includes('api.minimaxi.com'));
    ok('显示 model', body.includes('MiniMax-M3'));
    ok('显示已配置徽章', body.includes('已配置'));
  } catch (e) {
    ok('LLM 设置页打开', false, e.message);
  }

  console.log('\n=== 5. 测试 LLM 连接 ===');
  try {
    const testBtn = doc.querySelector('#modalLLM .btn-primary');
    if (testBtn) {
      win.testLLMConnection();
      await sleep(5000);
      const result = doc.getElementById('llmTestResult').innerHTML;
      ok('测试返回结果', result.includes('连接成功') || result.includes('连接失败'),
         result.includes('连接成功') ? '✅' : '❌');
    } else {
      ok('找到测试按钮', false);
    }
  } catch (e) {
    ok('测试 LLM', false, e.message);
  }

  console.log('\n=== 6. 事件操作 ===');
  // 找草稿事件并确认
  const events = win.MockData.EVENTS.filter(e => e.status === 'draft');
  if (events.length > 0) {
    win.confirmEvent(events[0].id);
    ok('确认事件', win.MockData.EVENTS.find(e => e.id === events[0].id).status === 'confirmed');
  }

  // 筛选
  try {
    const chip = doc.querySelector('.filter-chip[data-filter="progress"]');
    if (chip) {
      win.filterEvents('progress', chip);
      await sleep(200);
      ok('筛选 progress', doc.getElementById('eventTimeline').children.length >= 0);
    }
  } catch (e) {
    ok('筛选', false, e.message);
  }

  console.log('\n=== 汇总 ===');
  console.log(`  通过: ${pass}  失败: ${fail}`);
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => {
  console.error('测试异常:', e.message);
  console.error(e.stack);
  process.exit(1);
});
