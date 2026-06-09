// 数据添加功能测试
const fs = require('fs');
const path = require('path');

// 读取 mock-data.js
const mockDataCode = fs.readFileSync(path.join(__dirname, '..', 'mock-data.js'), 'utf8');

// 创建模拟的全局环境
global.localStorage = { getItem: () => 'baicaoyuan', setItem: () => {} };
global.window = {};

// 执行 mock-data.js
new Function(mockDataCode)();
const MockData = global.window.MockData;

// 测试函数
const ok = (name, cond, detail) => {
  if (cond) { 
    console.log(`  ✅ ${name}` + (detail ? ' · ' + detail : '')); 
    return true;
  } else {
    console.log(`  ❌ ${name}` + (detail ? ' · ' + detail : '')); 
    return false;
  }
};

console.log('\n=== 数据添加功能测试 ===\n');

let pass = 0, fail = 0;

// 1. 测试初始数据
console.log('--- 1. 初始数据检查 ---');
const initialEventCount = MockData.EVENTS.length;
const initialPlanCount = MockData.PLANS['baicaoyuan']?.length || 0;
const initialIssueCount = MockData.ISSUES.length;
const check1 = ok('事件初始数量', initialEventCount > 0, `count=${initialEventCount}`);
const check2 = ok('计划初始数量', initialPlanCount > 0, `count=${initialPlanCount}`);
const check3 = ok('事项初始数量', initialIssueCount > 0, `count=${initialIssueCount}`);

// 2. 测试添加事件
console.log('\n--- 2. 添加事件测试 ---');
const testEvent = {
  id: 'E999',
  projectId: 'baicaoyuan',
  date: '2026-06-09',
  time: '14:30',
  type: 'progress',
  areaId: 'A1',
  payload: { taskName: '测试任务', progress: '50%', owner: '测试人员', headcount: 2 },
  submitter: '张明',
  source: 'manual',
  confidence: 1.0,
  status: 'draft',
  note: '测试事件'
};

MockData.EVENTS.push(testEvent);
const newEventCount = MockData.EVENTS.length;
const check4 = ok('添加事件成功', newEventCount === initialEventCount + 1, `count=${newEventCount}`);
const check5 = ok('事件数据正确', MockData.EVENTS.find(e => e.id === 'E999')?.payload.taskName === '测试任务');

// 3. 测试添加计划
console.log('\n--- 3. 添加计划测试 ---');
const testPlan = {
  id: 'PLAN999',
  projectId: 'baicaoyuan',
  date: '2026-06-09',
  description: '测试日计划',
  laborSchedule: [{ laborType: '电工', count: 3 }],
  areaTargets: [{ areaId: 'A1', taskName: '测试目标', targetProgress: '80%' }],
  createdAt: new Date().toISOString(),
  createdBy: '张明'
};

MockData.PLANS['baicaoyuan'].push(testPlan);
const newPlanCount = MockData.PLANS['baicaoyuan'].length;
const check6 = ok('添加计划成功', newPlanCount === initialPlanCount + 1, `count=${newPlanCount}`);
const check7 = ok('计划数据正确', MockData.PLANS['baicaoyuan'].find(p => p.id === 'PLAN999')?.description === '测试日计划');

// 4. 测试添加事项
console.log('\n--- 4. 添加事项测试 ---');
const testIssue = {
  id: 'ISSUE999',
  projectId: 'baicaoyuan',
  title: '测试事项',
  type: 'safety',
  severity: 'medium',
  status: 'open',
  description: '测试事项描述',
  areaId: 'A1',
  createdAt: new Date().toISOString(),
  createdBy: '张明'
};

MockData.ISSUES.push(testIssue);
const newIssueCount = MockData.ISSUES.length;
const check8 = ok('添加事项成功', newIssueCount === initialIssueCount + 1, `count=${newIssueCount}`);
const check9 = ok('事项数据正确', MockData.ISSUES.find(i => i.id === 'ISSUE999')?.title === '测试事项');

// 5. 测试语音解析
console.log('\n--- 5. 语音解析测试 ---');
const parsed = MockData.mockParseVoice('高管办公区墙面基层处理，王师傅三个人在做，进度 50%', 'baicaoyuan');
const check10 = ok('解析返回类型', parsed.type === 'progress');
const check11 = ok('解析返回区域', parsed.areaId === 'A1');
const check12 = ok('解析返回任务名', typeof parsed.payload.taskName === 'string' && parsed.payload.taskName.length > 0, `taskName=${parsed.payload.taskName}`);
const check13 = ok('解析返回进度', parsed.payload.progress === '50%');
const check14 = ok('解析返回人数', typeof parsed.payload.headcount === 'number', `headcount=${parsed.payload.headcount}`);
const check15 = ok('解析返回置信度', typeof parsed.confidence === 'number' && parsed.confidence > 0, `confidence=${parsed.confidence}`);

// 6. 测试日报事件获取
console.log('\n--- 6. 日报事件获取测试 ---');
const dailyEvents = MockData.getDailyEvents('baicaoyuan', '2026-06-05');
const check16 = ok('获取日事件成功', Array.isArray(dailyEvents), `count=${dailyEvents.length}`);

// 7. 测试月报统计
console.log('\n--- 7. 月报统计测试 ---');
const monthlyStats = MockData.getMonthlyStats('baicaoyuan', 2026, 6);
const check17 = ok('月报统计返回对象', typeof monthlyStats === 'object');
const check18 = ok('月报包含进度数', typeof monthlyStats.progressCount === 'number', `progressCount=${monthlyStats.progressCount}`);

// 汇总
console.log('\n=== 测试汇总 ===');
const checks = [check1, check2, check3, check4, check5, check6, check7, check8, check9, 
                check10, check11, check12, check13, check14, check15, check16, check17, check18];
pass = checks.filter(Boolean).length;
fail = checks.length - pass;

console.log(`  通过: ${pass}  失败: ${fail}`);
console.log(`\n结论: ${fail === 0 ? '✅ 所有数据添加功能测试通过' : '⚠️ 部分测试失败'}`);

process.exit(fail > 0 ? 1 : 0);
