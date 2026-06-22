// 验证：调试日志和面板
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
dom.window.prompt = () => '测试区域';

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

  console.log('=== 1. 调试函数存在 ===');
  ['logVoiceDebug', 'renderVoiceDebugPanel', 'clearVoiceDebug', 'copyVoiceDebug'].forEach(f =>
    ok(f, typeof win[f] === 'function')
  );

  console.log('\n=== 2. 调试面板元素存在 ===');
  ok('voiceDebugPanel 存在', !!doc.getElementById('voiceDebugPanel'));
  ok('voiceDebugLog 存在', !!doc.getElementById('voiceDebugLog'));

  console.log('\n=== 3. 打开弹窗时清空日志 ===');
  win.openVoiceInput();
  await sleep(100);
  ok('打开后面板隐藏', doc.getElementById('voiceDebugPanel').style.display === 'none');

  console.log('\n=== 4. 调一次 LLM 解析，看日志 ===');
  await win.parseVoiceText('多功能厅日常巡检');
  await sleep(5000);
  ok('面板显示', doc.getElementById('voiceDebugPanel').style.display !== 'none');
  const logHtml = doc.getElementById('voiceDebugLog').innerHTML;
  ok('日志包含 "发起 LLM 请求"', logHtml.includes('发起 LLM 请求'));
  ok('日志包含 "收到 HTTP 响应"', logHtml.includes('收到 HTTP 响应'));
  ok('日志包含 "LLM 返回结果"', logHtml.includes('LLM 返回结果'));
  ok('日志包含 "已应用到表单"', logHtml.includes('已应用到表单'));
  ok('日志显示耗时', /\d+ms/.test(logHtml));

  console.log('\n=== 5. 日志数量正确 ===');
  console.log('  voiceDebugLog.length =', win.voiceDebugLog.length);
  ok('日志条数 >= 4', win.voiceDebugLog.length >= 4);

  console.log('\n=== 6. 看 console.log 真实输出 ===');
  // jsdom console 默认不显示，捕获一下
  const lines = [];
  dom.window.console.log = (...args) => lines.push(args.join(' '));
  await win.parseVoiceText('员工餐厅区天花吊顶龙骨安装');
  await sleep(5000);
  const voiceLines = lines.filter(l => l.includes('[voice]'));
  ok('控制台有 🎤[voice] 日志', voiceLines.length > 0,
     `lines=${voiceLines.slice(0, 3).join(' | ')}`);

  console.log('\n=== 7. 复制日志 ===');
  // jsdom 没有 clipboard 也没 execCommand，验证函数能跑不报错
  try {
    win.copyVoiceDebug();
    ok('copyVoiceDebug 调用不抛错', true);
  } catch (e) {
    ok('copyVoiceDebug 调用不抛错', false, e.message);
  }

  console.log('\n=== 8. 清空日志 ===');
  win.clearVoiceDebug();
  ok('清空后面板隐藏', doc.getElementById('voiceDebugPanel').style.display === 'none');
  ok('voiceDebugLog.length === 0', win.voiceDebugLog.length === 0);

  console.log(`\n=== 汇总 ===`);
  console.log(`  通过 ${pass} / 失败 ${fail}`);
  process.exit(fail > 0 ? 1 : 0);
})();
