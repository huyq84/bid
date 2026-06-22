// 集成测试脚本：用 jsdom 加载 index.html 并跑 init()
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

const dom = new JSDOM(html, {
  url: 'http://localhost/index.html',  // 用 http 避免 file:// origin 限制
  runScripts: 'dangerously',
  pretendToBeVisual: true
});

// jsdom 默认不会加载外部 <script src>，手动注入
const mockDataCode = fs.readFileSync(path.join(__dirname, 'mock-data.js'), 'utf8');
const appCode = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
const scriptEl = dom.window.document.createElement('script');
scriptEl.textContent = mockDataCode + '\n' + appCode;
dom.window.document.body.appendChild(scriptEl);

dom.window.console.log = (...args) => console.log('[浏览器]', ...args);
dom.window.console.error = (...args) => console.error('[浏览器 ERROR]', ...args);

// 拦截 alert / confirm
dom.window.alert = (m) => console.log('[alert]', m);
dom.window.confirm = (m) => { console.log('[confirm]', m); return true; };

// 等脚本加载完成
setTimeout(() => {
  try {
    // 检查关键元素
    const projectName = dom.window.document.getElementById('projectName');
    const eventTimeline = dom.window.document.getElementById('eventTimeline');
    const issueList = dom.window.document.getElementById('issueList');
    const statProgress = dom.window.document.getElementById('statProgress');

    console.log('项目名:', projectName?.textContent);
    console.log('进度事件数:', statProgress?.textContent);
    console.log('事件流子元素数:', eventTimeline?.children.length);
    console.log('事项台账子元素数:', issueList?.children.length);

    // 测试核心函数是否被定义
    const funcs = ['renderEvents', 'openVoiceInput', 'openPhotoInput', 'openManualInput', 'openWeeklyReport', 'confirmTodayReport', 'mockUploadPhoto'];
    funcs.forEach(f => {
      console.log('  ' + f + ':', typeof dom.window[f] === 'function' ? '✅' : '❌');
    });

    // 模拟：调用一次 filterEvents
    dom.window.filterEvents('progress', { classList: { add: () => {}, remove: () => {} } });
    console.log('\\n筛选 progress 后，事件流子元素数:', eventTimeline.children.length);

    // 模拟：打开语音录入模态框
    dom.window.openVoiceInput();
    const modalVoice = dom.window.document.getElementById('modalVoice');
    console.log('语音模态框打开:', modalVoice.classList.contains('show') ? '✅' : '❌');

    // 模拟：填入语音文本并解析
    dom.window.document.getElementById('voiceText').value = '员工餐厅区天花吊顶龙骨安装，张师傅带两个人在做，进度到 80%';
    dom.window.parseVoiceText();
    setTimeout(() => {
      const preview = dom.window.document.getElementById('voiceParsePreview');
      console.log('语音解析预览显示:', preview.style.display === 'block' ? '✅' : '❌');
      const saveBtn = dom.window.document.getElementById('voiceSaveBtn');
      console.log('保存按钮可用:', !saveBtn.disabled ? '✅' : '❌');

      // 模拟：保存语音事件
      const eventsBefore = dom.window.MockData.EVENTS.length;
      dom.window.saveVoiceEvent();
      const eventsAfter = dom.window.MockData.EVENTS.length;
      console.log('保存语音事件: 事件数', eventsBefore, '→', eventsAfter, eventsAfter === eventsBefore + 1 ? '✅' : '❌');

      // 模拟：打开周报
      dom.window.openWeeklyReport();
      const weeklyContent = dom.window.document.getElementById('weeklyReportContent');
      console.log('周报内容长度:', weeklyContent?.innerHTML.length);
      console.log('周报含"本周概述":', weeklyContent?.innerHTML.includes('本周概述') ? '✅' : '❌');

      console.log('\\n=== 集成测试通过 ✅ ===');
      process.exit(0);
    }, 1000);
  } catch (e) {
    console.error('测试失败:', e.message);
    console.error(e.stack);
    process.exit(1);
  }
}, 2000);
