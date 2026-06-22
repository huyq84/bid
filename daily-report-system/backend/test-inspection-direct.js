// test-inspection-direct.js - 直接调用巡检模块做单元测试
import { dailyInspection, generateProactiveMessages } from './inspection-engine.js';
import { query } from './db.js';

const TODAY = '2026-06-19';
const PID = 'baicaoyuan';

let rollbackSql = [];
function addRollback(sql) { rollbackSql.push(sql); }

async function runTest() {
  console.log('\n========================================');
  console.log('  巡检功能单元测试（直接调用模块）');
  console.log('========================================\n');

  // ===== 准备测试数据 =====
  console.log('📦 准备测试数据...\n');

  // 规则1: 未填报计划 — 插入一个今日计划但不创建关联事件
  await query(
    `INSERT INTO dr_daily_plans (id, project_id, task_name, start_date, end_date, progress, status, extra)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (id) DO UPDATE SET task_name=$3, start_date=$4, end_date=$5, progress=$6, status=$7, extra=$8`,
    ['TEST-R1', PID, '未填报测试计划', TODAY, TODAY, '80%', 'active', '{}']
  );
  addRollback(`DELETE FROM dr_daily_plans WHERE id='TEST-R1'`);

  // 规则3: 临近截止且进度低
  await query(
    `INSERT INTO dr_daily_plans (id, project_id, task_name, start_date, end_date, progress, status, extra)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (id) DO UPDATE SET task_name=$3, start_date=$4, end_date=$5, progress=$6, status=$7, extra=$8`,
    ['TEST-R3', PID, '紧急天花板', '2026-06-17', '2026-06-20', '30%', 'active', '{}']
  );
  addRollback(`DELETE FROM dr_daily_plans WHERE id='TEST-R3'`);

  await query(
    `INSERT INTO dr_daily_plans (id, project_id, task_name, start_date, end_date, progress, status, extra)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (id) DO UPDATE SET task_name=$3, start_date=$4, end_date=$5, progress=$6, status=$7, extra=$8`,
    ['TEST-R4', PID, '紧急地面', '2026-06-18', '2026-06-19', '20%', 'active', '{}']
  );
  addRollback(`DELETE FROM dr_daily_plans WHERE id='TEST-R4'`);

  // 规则4: 超期协调
  await query(
    `INSERT INTO dr_issues (id, project_id, type, title, area_id, priority, status, created_date, owner)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (id) DO UPDATE SET title=$4, status=$7, created_date=$8, owner=$9`,
    ['TEST-I1', PID, 'coordination', '超期协调A', 'BAI-A1', 'high', 'open', '2026-06-15', '张明']
  );
  addRollback(`DELETE FROM dr_issues WHERE id='TEST-I1'`);

  await query(
    `INSERT INTO dr_issues (id, project_id, type, title, area_id, priority, status, created_date, owner)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (id) DO UPDATE SET title=$4, status=$7, created_date=$8, owner=$9`,
    ['TEST-I2', PID, 'coordination', '超期协调B', 'BAI-B2', 'medium', 'open', '2026-06-16', '李华']
  );
  addRollback(`DELETE FROM dr_issues WHERE id='TEST-I2'`);

  // 规则5: ECC超期
  await query(
    `INSERT INTO dr_ecc_items (id, project_id, title, area_id, status, discovered_date)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (id) DO UPDATE SET title=$3, status=$5, discovered_date=$6`,
    ['TEST-E1', PID, 'ECC超期A', 'BAI-A1', 'open', '2026-06-10']
  );
  addRollback(`DELETE FROM dr_ecc_items WHERE id='TEST-E1'`);

  await query(
    `INSERT INTO dr_ecc_items (id, project_id, title, area_id, status, discovered_date)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (id) DO UPDATE SET title=$3, status=$5, discovered_date=$6`,
    ['TEST-E2', PID, 'ECC超期B', 'BAI-B2', 'closing', '2026-06-08']
  );
  addRollback(`DELETE FROM dr_ecc_items WHERE id='TEST-E2'`);

  console.log('✅ 测试数据已就绪\n');

  // ===== 运行巡检 =====
  console.log('🔔 运行 dailyInspection("baicaoyuan", "2026-06-19")...\n');

  const reminders = await dailyInspection(PID, TODAY);
  const messages = await generateProactiveMessages(reminders);

  console.log(`发现 ${reminders.length} 条原始提醒:\n`);
  for (const r of reminders) {
    console.log(`  [${r.priority.toUpperCase()}] ${r.type}: ${r.title}`);
  }

  console.log(`\n生成 ${messages.length} 条消息:\n`);
  for (const m of messages) {
    console.log(`  [${m.priority.toUpperCase()}] ${m.message}`);
  }

  // ===== 验证 =====
  console.log('\n========================================');
  console.log('  测试结果');
  console.log('========================================\n');

  const rules = [
    {
      name: '规则1: 未填报计划',
      type: 'unreported_plans',
      expectTrigger: true,
      expectPriority: 'high',
      desc: '插了3个今日计划，其中2个(紧急天花板/紧急地面)没关联事件',
    },
    {
      name: '规则2: 考勤到岗',
      type: 'attendance_missing',
      expectTrigger: true, // 今天没有 attendance 事件，headcount=0 < 23*0.5=11.5
      desc: '23个管理人员，0人到岗 → 触发',
    },
    {
      name: '规则3: 进度紧急',
      type: 'progress_urgent',
      expectTrigger: true,
      expectPriority: 'high',
      desc: '紧急天花板(剩1天/30%) + 紧急地面(剩0天/20%)',
    },
    {
      name: '规则4: 协调超期',
      type: 'issue_overdue',
      expectTrigger: true,
      expectPriority: 'medium',
      desc: 'TEST-I1(6/15,4天) + TEST-I2(6/16,3天)',
    },
    {
      name: '规则5: ECC超期',
      type: 'ecc_overdue',
      expectTrigger: true,
      expectPriority: 'medium',
      desc: 'TEST-E1(6/10,9天) + TEST-E2(6/08,11天)',
    },
    {
      name: '规则6: 周报提醒',
      type: 'weekly_report',
      expectTrigger: false,
      desc: '当前12:00，未到15:00',
    },
    {
      name: '规则7: 下班未确认',
      type: 'unconfirmed_events',
      expectTrigger: false,
      desc: '当前12:00，未到17:30',
    },
  ];

  let passed = 0;
  let failed = 0;

  for (const rule of rules) {
    const found = reminders.find(r => r.type === rule.type);
    const triggered = !!found;
    const ok = triggered === rule.expectTrigger;
    
    if (ok) {
      passed++;
      console.log(`✅ PASS  ${rule.name}`);
    } else {
      failed++;
      console.log(`❌ FAIL  ${rule.name}`);
    }
    
    console.log(`  预期: ${rule.expectTrigger ? '触发' : '不触发'} | 实际: ${triggered ? '触发' : '不触发'}`);
    if (found) {
      console.log(`  优先级: ${found.priority} | 标题: ${found.title}`);
      if (rule.expectPriority && found.priority !== rule.expectPriority) {
        console.log(`  ⚠️ 优先级不匹配: 期望 ${rule.expectPriority}, 实际 ${found.priority}`);
      }
    }
    console.log(`  说明: ${rule.desc}`);
    console.log();
  }

  // ===== 清理 =====
  console.log('🧹 清理测试数据...\n');
  for (const sql of rollbackSql) {
    try { await query(sql); } catch(e) { console.log(`  ⚠️ 清理失败: ${e.message}`); }
  }
  console.log('✅ 已清理\n');

  // ===== 总结 =====
  console.log('========================================');
  console.log(`  总计: ${passed + failed} | ✅ ${passed} | ❌ ${failed}`);
  console.log('========================================\n');

  if (failed > 0) {
    console.log('❌ 有 ' + failed + ' 条未通过');
    process.exit(1);
  } else {
    console.log('🎉 全部 7 条规则测试通过！');
    process.exit(0);
  }
}

runTest().catch(e => {
  console.error('测试异常:', e);
  process.exit(2);
});
