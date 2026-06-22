// test-inspection.js - 巡检功能自动化测试
// 用法: cd backend && node test-inspection.js
import { query } from './db.js';

const TODAY = '2026-06-19';
const PID = 'baicaoyuan';
const TEST_IDS = {
  plan1: 'TEST-R1',
  plan2: 'TEST-R3',
  plan3: 'TEST-R4',
  event1: 'E999001',
  event2: 'E999002',
  issue1: 'TEST-I1',
  issue2: 'TEST-I2',
  ecc1: 'TEST-E1',
  ecc2: 'TEST-E2',
};

let rollbackSql = [];

function addRollback(sql) {
  rollbackSql.push(sql);
}

async function runTest() {
  console.log('\n========================================');
  console.log('  巡检功能自动化测试');
  console.log('========================================\n');

  // ===== 1. 准备测试数据 =====
  console.log('📦 准备测试数据...\n');

  // 规则1 & 3: 今日计划（一个已填报→不触发，一个未填报→触发规则1）
  await query(
    `INSERT INTO dr_daily_plans (id, project_id, task_name, start_date, end_date, progress, status, extra)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (id) DO UPDATE SET task_name=$3, start_date=$4, end_date=$5, progress=$6, status=$7, extra=$8`,
    [TEST_IDS.plan1, PID, '规则1-已填报测试', TODAY, TODAY, '80%', 'active', '{}']
  );
  addRollback(`DELETE FROM dr_daily_plans WHERE id='${TEST_IDS.plan1}'`);

  // 规则3: 临近截止且进度低
  await query(
    `INSERT INTO dr_daily_plans (id, project_id, task_name, start_date, end_date, progress, status, extra)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (id) DO UPDATE SET task_name=$3, start_date=$4, end_date=$5, progress=$6, status=$7, extra=$8`,
    [TEST_IDS.plan2, PID, '规则3-紧急天花板', '2026-06-17', '2026-06-20', '30%', 'active', '{}']
  );
  addRollback(`DELETE FROM dr_daily_plans WHERE id='${TEST_IDS.plan2}'`);

  // 规则3: 另一个临近截止
  await query(
    `INSERT INTO dr_daily_plans (id, project_id, task_name, start_date, end_date, progress, status, extra)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (id) DO UPDATE SET task_name=$3, start_date=$4, end_date=$5, progress=$6, status=$7, extra=$8`,
    [TEST_IDS.plan3, PID, '规则3-紧急地面', '2026-06-18', '2026-06-19', '20%', 'active', '{}']
  );
  addRollback(`DELETE FROM dr_daily_plans WHERE id='${TEST_IDS.plan3}'`);

  // 规则1: 为 plan1 创建一个关联事件（这样它就不会被标记为"未填报"）
  await query(
    `INSERT INTO dr_events (id, project_id, date, type, area_id, plan_id, payload, status, source)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (id) DO UPDATE SET type=$4, area_id=$5, plan_id=$6, payload=$7, status=$8, source=$9`,
    [TEST_IDS.event1, PID, TODAY, 'progress', 'BAI-A1', TEST_IDS.plan1,
     '{"taskName":"规则1-已填报测试","progress":"80%","owner":"张明"}', 'confirmed', 'test']
  );
  addRollback(`DELETE FROM dr_events WHERE id='${TEST_IDS.event1}'`);

  // 规则4: 超期协调（3天前创建）
  await query(
    `INSERT INTO dr_issues (id, project_id, type, title, area_id, priority, status, created_date, owner)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (id) DO UPDATE SET title=$4, status=$7, created_date=$8, owner=$9`,
    [TEST_IDS.issue1, PID, 'coordination', '规则4-超期协调A', 'BAI-A1', 'high', 'open', '2026-06-15', '张明']
  );
  addRollback(`DELETE FROM dr_issues WHERE id='${TEST_IDS.issue1}'`);

  // 规则4: 另一个超期协调
  await query(
    `INSERT INTO dr_issues (id, project_id, type, title, area_id, priority, status, created_date, owner)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (id) DO UPDATE SET title=$4, status=$7, created_date=$8, owner=$9`,
    [TEST_IDS.issue2, PID, 'coordination', '规则4-超期协调B', 'BAI-B2', 'medium', 'open', '2026-06-16', '李华']
  );
  addRollback(`DELETE FROM dr_issues WHERE id='${TEST_IDS.issue2}'`);

  // 规则5: ECC超期（7天前发现）
  await query(
    `INSERT INTO dr_ecc_items (id, project_id, title, area_id, status, discovered_date)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (id) DO UPDATE SET title=$3, status=$5, discovered_date=$6`,
    [TEST_IDS.ecc1, PID, '规则5-ECC超期A', 'BAI-A1', 'open', '2026-06-10']
  );
  addRollback(`DELETE FROM dr_ecc_items WHERE id='${TEST_IDS.ecc1}'`);

  await query(
    `INSERT INTO dr_ecc_items (id, project_id, title, area_id, status, discovered_date)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (id) DO UPDATE SET title=$3, status=$5, discovered_date=$6`,
    [TEST_IDS.ecc2, PID, '规则5-ECC超期B', 'BAI-B2', 'closing', '2026-06-08']
  );
  addRollback(`DELETE FROM dr_ecc_items WHERE id='${TEST_IDS.ecc2}'`);

  // 规则7: 未确认事件
  await query(
    `INSERT INTO dr_events (id, project_id, date, type, area_id, payload, status, source)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (id) DO UPDATE SET type=$4, area_id=$5, payload=$6, status=$7, source=$8`,
    [TEST_IDS.event2, PID, TODAY, 'progress', 'BAI-A1',
     '{"taskName":"规则7-未确认测试","progress":"50%"}', 'draft', 'test']
  );
  addRollback(`DELETE FROM dr_events WHERE id='${TEST_IDS.event2}'`);

  console.log('✅ 测试数据已就绪\n');

  // ===== 2. 调用巡检接口 =====
  console.log('🔔 调用 /api/chat/inspect ...\n');

  let inspectionResult;
  try {
    const res = await fetch('http://localhost:3010/api/chat/inspect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    inspectionResult = await res.json();
    console.log('  响应:', JSON.stringify(inspectionResult));
  } catch (e) {
    console.log(`\n  ⚠️ 后端未运行（${e.message}），改用直接调用 dailyInspection\n`);
    // 直接调用后端模块
    const { dailyInspection, generateProactiveMessages } = await import('./inspection-engine.js');
    const reminders = await dailyInspection(PID, TODAY);
    const messages = await generateProactiveMessages(reminders);
    inspectionResult = { ok: true, reminders, messages };
    console.log(`  发现 ${messages.length} 条提醒:\n`);
    for (const m of messages) {
      console.log(`  [${m.priority.toUpperCase()}] ${m.message}`);
    }
  }

  // ===== 3. 验证结果 =====
  console.log('\n========================================');
  console.log('  测试结果');
  console.log('========================================\n');

  const rules = [
    {
      id: '规则1',
      name: '未填报计划',
      type: 'unreported_plans',
      expectTrigger: true,
      expectPriority: 'high',
      desc: 'plan2(紧急天花板)和plan3(紧急地面)今日有计划但未填',
    },
    {
      id: '规则2',
      name: '考勤到岗检查',
      type: 'attendance_missing',
      expectTrigger: false, // 今天有 attendance 事件（headcount > 0），不会触发
      desc: '今天有 attendance 事件，到岗人数充足',
    },
    {
      id: '规则3',
      name: '进度紧急',
      type: 'progress_urgent',
      expectTrigger: true,
      expectPriority: 'high',
      desc: 'plan2(剩1天/30%)和plan3(剩0天/20%)',
    },
    {
      id: '规则4',
      name: '协调超期',
      type: 'issue_overdue',
      expectTrigger: true,
      expectPriority: 'medium',
      desc: 'issue1(6/15创建,4天)和issue2(6/16创建,3天)',
    },
    {
      id: '规则5',
      name: 'ECC超期',
      type: 'ecc_overdue',
      expectTrigger: true,
      expectPriority: 'medium',
      desc: 'ecc1(6/10发现,9天)和ecc2(6/08发现,11天)',
    },
    {
      id: '规则6',
      name: '周报提醒',
      type: 'weekly_report',
      expectTrigger: false, // 12:00 周五，未到15:00
      desc: '当前 12:00，未到15:00',
    },
    {
      id: '规则7',
      name: '下班未确认',
      type: 'unconfirmed_events',
      expectTrigger: false, // 12:00，未到17:30
      desc: '当前 12:00，未到17:30',
    },
  ];

  let passed = 0;
  let failed = 0;

  for (const rule of rules) {
    const found = inspectionResult.messages?.find(m => m.type === rule.type);
    const triggered = !!found;
    const status = triggered === rule.expectTrigger ? '✅ PASS' : '❌ FAIL';
    
    if (triggered === rule.expectTrigger) {
      passed++;
    } else {
      failed++;
    }

    console.log(`${status} ${rule.id} ${rule.name}`);
    console.log(`  预期: ${rule.expectTrigger ? '触发' : '不触发'} | 实际: ${triggered ? '触发' : '不触发'}`);
    if (found) {
      console.log(`  优先级: ${found.priority} | 消息: ${found.message}`);
      if (rule.expectPriority && found.priority !== rule.expectPriority) {
        console.log(`  ⚠️ 优先级不匹配: 期望 ${rule.expectPriority}, 实际 ${found.priority}`);
      }
    }
    console.log(`  说明: ${rule.desc}`);
    console.log();
  }

  // ===== 4. 清理测试数据 =====
  console.log('🧹 清理测试数据...\n');
  try {
    for (const sql of rollbackSql) {
      await query(sql);
    }
    console.log('✅ 测试数据已清理\n');
  } catch (e) {
    console.log(`⚠️ 清理失败: ${e.message}\n`);
  }

  // ===== 5. 总结 =====
  console.log('========================================');
  console.log(`  总计: ${passed + failed} | ✅ ${passed} | ❌ ${failed}`);
  console.log('========================================\n');

  if (failed > 0) {
    console.log('❌ 有部分测试未通过，请检查上方日志');
    process.exit(1);
  } else {
    console.log('🎉 全部测试通过！');
    process.exit(0);
  }
}

runTest().catch(e => {
  console.error('测试异常:', e);
  process.exit(2);
});
