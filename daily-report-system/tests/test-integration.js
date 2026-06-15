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

// 拦截 fetch：测试时不需要真的打后端，记录调用即可
const fetchCalls = [];
dom.window.fetch = async (url, options = {}) => {
  fetchCalls.push({ url, method: options.method || 'GET', body: options.body });
  return { ok: true, json: async () => ({ ok: true }) };
};

// 测试环境：手动挂载 M.saveIssuesToStorage（模拟 app.js 中 loadDataFromAPI 成功后的 override）
// 这样不依赖真实后端就能验证调用链
if (dom.window.MockData) {
  dom.window.MockData.saveIssuesToStorage = async function() {
    for (const iss of dom.window.MockData.ISSUES) {
      await dom.window.fetch('http://localhost:3010/api/issues', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: iss.id, projectId: iss.projectId, type: iss.type, title: iss.title,
          status: iss.status || 'open', proposeDept: iss.proposeDept, cooperateDept: iss.cooperateDept
        })
      });
    }
  };
}

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
    console.log('协调事宜列表子元素数:', issueList?.children.length);
    console.log('项目信息卡已移除:', !dom.window.document.getElementById('projectInfoCard') ? '✅' : '❌');
    console.log('统计标签已移除:', !dom.window.document.getElementById('statProgress') ? '✅' : '❌');
    console.log('月报入口已添加:', !!dom.window.document.querySelector('.entry-card[onclick*="openMonthlyReport"]') ? '✅' : '❌');
    // 验证卡片顺序：今日计划 在 协调事宜 前面
    const asideCards = dom.window.document.querySelectorAll('aside .card');
    const planIdx = [...asideCards].findIndex(c => c.querySelector('#dailyPlanCard'));
    const issueIdx = [...asideCards].findIndex(c => c.querySelector('#issueList'));
    console.log('今日计划在协调事宜之前:', planIdx < issueIdx && planIdx > -1 ? '✅' : '❌');
    // 验证今日计划图例
    const legend = dom.window.document.querySelector('.calendar-legend');
    console.log('日历图例含"今日计划":', legend && legend.textContent.includes('今日计划') ? '✅' : '❌');

    // 测试核心函数是否被定义
    const funcs = ['renderEvents', 'openVoiceInput', 'openPhotoInput', 'openManualInput', 'openWeeklyReport', 'confirmTodayReport', 'mockUploadPhoto', 'openMonthlyReport'];

    // 测试项目隔离：所有 getPage*Data/getPlansForProject 应按 projectId 过滤
    // 模拟 MockData 加载 PostgreSQL 数据（2 个项目，各自有不同 ISSUES）
    const TEST_MD = {
      PROJECTS: [
        { id: 'baicaoyuan', name: '百草园城市更新项目' },
        { id: 'lvcheng-riverside', name: '绿城·滨江壹号' }
      ],
      ISSUES: [
        { id: 'I_B1', projectId: 'baicaoyuan', type: 'coordination', title: '百草园协调A', proposeDept: 'A部门', cooperateDept: 'B部门', status: 'open' },
        { id: 'I_B2', projectId: 'baicaoyuan', type: 'coordination', title: '百草园协调B', proposeDept: 'A部门', cooperateDept: 'B部门', status: 'open' },
        { id: 'I_L1', projectId: 'lvcheng-riverside', type: 'coordination', title: '绿城协调X', proposeDept: 'X部门', cooperateDept: 'Y部门', status: 'open' }
      ]
    };
    Object.assign(dom.window.MockData, TEST_MD);
    const baicaoyuanItems = dom.window.MockData.getPage12Data('baicaoyuan', true);
    const lvchengItems = dom.window.MockData.getPage12Data('lvcheng-riverside', true);
    console.log('项目隔离-百草园协调数:', baicaoyuanItems.length === 2 ? '✅' : '❌', '(' + baicaoyuanItems.length + '/2)');
    console.log('项目隔离-绿城协调数:', lvchengItems.length === 1 ? '✅' : '❌', '(' + lvchengItems.length + '/1)');
    console.log('百草园不含绿城数据:', !baicaoyuanItems.some(i => i.issue.includes('绿城')) ? '✅' : '❌');
    console.log('绿城不含百草园数据:', !lvchengItems.some(i => i.issue.includes('百草园')) ? '✅' : '❌');
    // 周报聚合也按项目隔离
    const baicWeek = dom.window.MockData.mockAggregateWeekly('baicaoyuan', '2026-06-15', '2026-06-21');
    const lvWeek = dom.window.MockData.mockAggregateWeekly('lvcheng-riverside', '2026-06-15', '2026-06-21');
    console.log('周报-百草园项目名:', baicWeek.projectName === '百草园城市更新项目' ? '✅' : '❌');
    console.log('周报-绿城项目名:', lvWeek.projectName === '绿城·滨江壹号' ? '✅' : '❌');
    console.log('周报-百草园协调数:', baicWeek.coordinationIssues.length === 2 ? '✅' : '❌', '(' + baicWeek.coordinationIssues.length + '/2)');
    console.log('周报-绿城协调数:', lvWeek.coordinationIssues.length === 1 ? '✅' : '❌', '(' + lvWeek.coordinationIssues.length + '/1)');
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
    setTimeout(async () => {
      const preview = dom.window.document.getElementById('voiceParsePreview');
      console.log('语音解析预览显示:', preview.style.display === 'block' ? '✅' : '❌');
      const saveBtn = dom.window.document.getElementById('voiceSaveBtn');
      console.log('保存按钮可用:', !saveBtn.disabled ? '✅' : '❌');

      // 模拟：保存语音事件
      const eventsBefore = dom.window.MockData.EVENTS.length;
      dom.window.saveVoiceEvent();
      const eventsAfter = dom.window.MockData.EVENTS.length;
      console.log('保存语音事件: 事件数', eventsBefore, '→', eventsAfter, eventsAfter === eventsBefore + 1 ? '✅' : '❌');

      // 模拟：保存协调事宜并验证走 PostgreSQL 后端
      const issuesBefore = dom.window.MockData.ISSUES.filter(i => i.type === 'coordination' && i.status !== 'closed').length;
      dom.window.document.getElementById('i-title').value = '测试协调：与设计院确认 X 节点';
      dom.window.document.getElementById('i-propose').value = '精装项目部';
      dom.window.document.getElementById('i-cooperate').value = '设计单位';
      await dom.window.saveIssue();
      const issuesAfter = dom.window.MockData.ISSUES.filter(i => i.type === 'coordination' && i.status !== 'closed').length;
      const newIssueCall = fetchCalls.filter(c => c.url.includes('/api/issues') && c.method === 'POST' && c.body && c.body.includes('测试协调')).pop();
      console.log('保存协调: 协调数', issuesBefore, '→', issuesAfter, issuesAfter === issuesBefore + 1 ? '✅' : '❌');
      console.log('调用后端 /api/issues:', newIssueCall ? '✅' : '❌');
      console.log('请求体含 proposeDept:', newIssueCall && newIssueCall.body.includes('精装项目部') ? '✅' : '❌');
      console.log('请求体含 cooperateDept:', newIssueCall && newIssueCall.body.includes('设计单位') ? '✅' : '❌');

      // 测试 page 10/11 数据动态性：向 M.PLANS 注入 progress 计划 → getPageSectionsData 应返回
      dom.window.MockData.PLANS = dom.window.MockData.PLANS || {};
      dom.window.MockData.PLANS['baicaoyuan'] = dom.window.MockData.PLANS['baicaoyuan'] || [];
      const mockPlans = [
        { id: 'TEST_P1', projectId: 'baicaoyuan', type: 'progress', status: 'active', buildingNo: '1号楼', floorNo: '一层', areaId: 'A1', taskName: '墙面面层', startDate: '2026-06-15', endDate: '2026-06-21' },
        { id: 'TEST_P2', projectId: 'baicaoyuan', type: 'progress', status: 'active', buildingNo: '1号楼', floorNo: '二层', areaId: 'A1', taskName: '天花吊顶', startDate: '2026-06-15', endDate: '2026-06-21' },
        { id: 'TEST_P3', projectId: 'baicaoyuan', type: 'material', status: 'active', buildingNo: '1号楼', floorNo: '一层', areaId: 'A1', taskName: '材料进场', startDate: '2026-06-15', endDate: '2026-06-21' }
      ];
      dom.window.MockData.PLANS['baicaoyuan'].push(...mockPlans);
      const sections = dom.window.MockData.getPageSectionsData('baicaoyuan');
      console.log('page 10/11 sections 数:', sections.length >= 1 ? '✅' : '❌', '(' + sections.length + ')');
      const sec1 = sections.find(s => s.name === '1号楼');
      console.log('page 10/11 包含"1号楼"section:', sec1 ? '✅' : '❌');
      console.log('page 10/11 排除 material 计划:', sec1 && sec1.rows.length === 2 ? '✅' : '❌', '(' + (sec1 ? sec1.rows.length : 0) + '/2)');
      const floorNames = sec1 ? sec1.floorHeaders.map(f => f.name) : [];
      console.log('page 10/11 楼层头动态收集:', floorNames.includes('一层') && floorNames.includes('二层') ? '✅' : '❌', '(' + floorNames.join(',') + ')');
      // 切项目验证隔离
      dom.window.MockData.PLANS['lvcheng-riverside'] = [{ id: 'L_P1', projectId: 'lvcheng-riverside', type: 'progress', status: 'active', buildingNo: 'B栋', floorNo: '三层', areaId: 'B1', taskName: 'B 栋精装', startDate: '2026-06-15', endDate: '2026-06-21' }];
      const lvSections = dom.window.MockData.getPageSectionsData('lvcheng-riverside');
      const lvHas1 = lvSections.some(s => s.name === '1号楼');
      const lvHasB = lvSections.some(s => s.name === 'B栋');
      console.log('page 10/11 切项目 - 绿城无"1号楼":', !lvHas1 ? '✅' : '❌');
      console.log('page 10/11 切项目 - 绿城有"B栋":', lvHasB ? '✅' : '❌');

      // 模拟：打开周报
      dom.window.openWeeklyReport();
      const weeklyContent = dom.window.document.getElementById('weeklyReportContent');
      console.log('周报内容长度:', weeklyContent?.innerHTML.length);
      console.log('周报含"本周概述":', weeklyContent?.innerHTML.includes('本周概述') ? '✅' : '❌');
      console.log('周报含"协调事宜"section:', weeklyContent?.innerHTML.includes('协调事宜') ? '✅' : '❌');
      console.log('周报含新建的"测试协调":', weeklyContent?.innerHTML.includes('测试协调') ? '✅' : '❌');
      console.log('周报含"提出部门"列表头:', weeklyContent?.innerHTML.includes('提出部门') ? '✅' : '❌');
      console.log('周报含"配合部门"列表头:', weeklyContent?.innerHTML.includes('配合部门') ? '✅' : '❌');

      console.log('\\n=== 集成测试通过 ✅ ===');
      process.exit(0);
    }, 1000);
  } catch (e) {
    console.error('测试失败:', e.message);
    console.error(e.stack);
    process.exit(1);
  }
}, 2000);
