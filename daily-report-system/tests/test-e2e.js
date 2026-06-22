// 端到端集成测试：真实后端 + jsdom 前端
// 验证：app.js 改造后的代码 + 真实 Minmax LLM 调用

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

// jsdom 默认不带 fetch，把 Node 的原生 fetch 注入
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

// 等待 init() + 首次健康检查
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  let pass = 0, fail = 0;
  const ok = (name, cond, detail) => {
    if (cond) { pass++; console.log(`  ✅ ${name}` + (detail ? ' · ' + detail : '')); }
    else      { fail++; console.log(`  ❌ ${name}` + (detail ? ' · ' + detail : '')); }
  };

  // 等 init 完成
  await sleep(500);

  console.log('\n=== 1. 页面初始化 ===');
  ok('项目名加载', doc.getElementById('projectName').textContent === '百草园城市更新项目');
  ok('进度事件统计', doc.getElementById('statProgress').textContent === '2');
  ok('事件流渲染', doc.getElementById('eventTimeline').children.length === 7);
  ok('事项台账渲染', doc.getElementById('issueList').children.length === 4);

  console.log('\n=== 2. 后端健康检查（轮询结果）===');
  await sleep(500);
  const backendLabel = doc.getElementById('backendLabel').textContent;
  const backendDot = doc.getElementById('backendDot').style.background;
  console.log('  顶栏状态:', backendLabel, '| 颜色:', backendDot);
  ok('后端在线', backendLabel.includes('LLM 真实') || backendLabel.includes('后端在线'),
     `label=${backendLabel}`);
  ok('状态点为绿色或黄色', backendDot === 'rgb(16, 185, 129)' || backendDot === 'rgb(245, 158, 11)');

  console.log('\n=== 3. LLM 设置页 ===');
  // 调用 openLLMSettings
  win.openLLMSettings();
  await sleep(800);
  const llmBody = doc.getElementById('llmConfigBody').innerHTML;
  ok('显示 LLM provider', llmBody.includes('MiniMax'));
  ok('显示 base URL', llmBody.includes('api.minimaxi.com'));
  ok('显示 model', llmBody.includes('MiniMax-M3'));
  ok('显示 API key（脱敏）', llmBody.includes('sk-cp-0p****W2Xc'));
  ok('显示已配置徽章', llmBody.includes('已配置'));

  // 关闭
  doc.getElementById('modalLLM').classList.remove('show');

  console.log('\n=== 4. 真实 LLM 语音解析 ===');
  win.openVoiceInput();
  await sleep(100);
  doc.getElementById('voiceText').value = '高管办公区墙面基层处理，王师傅三个人在做，进度 50%';
  win.parseVoiceText();
  await sleep(5000); // LLM 真实调用需要时间

  const vpArea = doc.getElementById('vp-area').textContent;
  const vpTask = doc.getElementById('vp-task').textContent;
  const vpProgress = doc.getElementById('vp-progress').textContent;
  const vpConfidence = doc.getElementById('vp-confidence').textContent;
  console.log('  解析结果:', { vpArea, vpTask, vpProgress, vpConfidence });
  ok('识别为高管办公区', vpArea.includes('高管'));
  ok('识别任务名', vpTask.includes('墙面基层') || vpTask.includes('墙面'));
  ok('识别进度', vpProgress.includes('50%'));
  ok('显示 LLM 来源', vpConfidence.includes('LLM 真实') || vpConfidence.includes('LLM'),
     `confidence=${vpConfidence}`);

  // 保存事件
  win.saveVoiceEvent();
  await sleep(200);
  ok('事件数 +1', win.MockData.EVENTS.length === 8, `events=${win.MockData.EVENTS.length}`);

  console.log('\n=== 5. 真实 LLM 周报聚合 ===');
  win.openWeeklyReport();
  await sleep(200);
  // 周报聚合耗时 25-35 秒，等待最多 60 秒
  let waited = 0;
  let weeklyContent = '';
  while (waited < 60000) {
    await sleep(2000);
    waited += 2000;
    weeklyContent = doc.getElementById('weeklyReportContent').innerHTML;
    if (!weeklyContent.includes('AI 正在聚合')) break;
    console.log(`  等待中... ${waited/1000}s`);
  }
  ok('周报含项目名', weeklyContent.includes('百草园'));
  ok('周报含本周概述', weeklyContent.includes('本周概述'));
  ok('周报含各区域进度', weeklyContent.includes('各区域进度'));
  ok('周报含专项事项', weeklyContent.includes('专项事项'));
  ok('周报含下周计划', weeklyContent.includes('下周计划'));
  ok('周报显示 LLM 真实', weeklyContent.includes('LLM 真实'),
     `片段: ${weeklyContent.slice(weeklyContent.indexOf('周报初稿') - 100, weeklyContent.indexOf('周报初稿') + 200).slice(0, 300)}`);

  // 关闭周报
  doc.getElementById('modalWeekly').classList.remove('show');

  console.log('\n=== 6. 事件操作（确认/删除）===');
  // 找到草稿事件并确认
  const drafts = win.MockData.EVENTS.filter(e => e.status === 'draft');
  console.log('  草稿事件数:', drafts.length);
  if (drafts.length > 0) {
    win.confirmEvent(drafts[0].id);
    ok('确认事件后状态变 confirmed', win.MockData.EVENTS.find(e => e.id === drafts[0].id).status === 'confirmed');
  }

  // 筛选
  win.filterEvents('progress', { classList: { add: () => {}, remove: () => {} } });
  await sleep(200);
  const progressCount = doc.getElementById('eventTimeline').children.length;
  ok('筛选 progress', progressCount === 2 || progressCount === 3, `count=${progressCount}`);

  console.log('\n=== 汇总 ===');
  console.log(`  通过: ${pass}  失败: ${fail}`);
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => {
  console.error('测试异常:', e);
  console.error(e.stack);
  process.exit(1);
});
