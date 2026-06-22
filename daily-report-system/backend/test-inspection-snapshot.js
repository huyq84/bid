import { query } from './db.js';

const today = '2026-06-19';
const pid = 'baicaoyuan';

async function main() {
  console.log('=== 当前数据快照 ===\n');
  
  const projects = await query('SELECT id, name FROM dr_projects');
  console.log(`项目数: ${projects.rows.length}`);
  for (const p of projects.rows) console.log(`  - ${p.id}: ${p.name}`);
  
  const plans = await query(
    'SELECT id, task_name, start_date, end_date, progress, status FROM dr_daily_plans WHERE project_id=$1 AND start_date<=($2)::text AND end_date>=($2)::text',
    [pid, today]
  );
  console.log(`\n今日计划: ${plans.rows.length}`);
  for (const p of plans.rows) console.log(`  - [${p.id}] ${p.task_name} | ${p.start_date}~${p.end_date} | 进度:${p.progress} | 状态:${p.status}`);
  
  const events = await query(
    'SELECT id, type, status, payload FROM dr_events WHERE project_id=$1 AND date=$2',
    [pid, today]
  );
  console.log(`\n今日事件: ${events.rows.length}`);
  for (const e of events.rows) console.log(`  - [${e.id}] type=${e.type} status=${e.status} payload=${JSON.stringify(e.payload).slice(0,80)}`);
  
  const attCount = await query(
    'SELECT count(*) FROM dr_events WHERE project_id=$1 AND date=$2 AND type=$3',
    [pid, today, 'attendance']
  );
  console.log(`\nAttendance 事件: ${attCount.rows[0].count}`);
  
  const mgrs = await query('SELECT count(*) FROM dr_management_team');
  console.log(`管理团队: ${mgrs.rows[0].count}`);
  
  const issues = await query(
    'SELECT id, title, status, created_date FROM dr_issues WHERE project_id=$1 AND status!=\'closed\' ORDER BY created_date',
    [pid]
  );
  console.log(`\n未关闭协调: ${issues.rows.length}`);
  for (const i of issues.rows) console.log(`  - [${i.id}] ${i.title} | ${i.created_date} | ${i.status}`);
  
  const ecc = await query(
    'SELECT id, title, status, discovered_date FROM dr_ecc_items WHERE project_id=$1 AND status!=\'closed\' ORDER BY discovered_date',
    [pid]
  );
  console.log(`\n未关闭 ECC: ${ecc.rows.length}`);
  for (const e of ecc.rows) console.log(`  - [${e.id}] ${e.title} | ${e.discovered_date} | ${e.status}`);
  
  console.log('\n=== 预期触发的规则 ===');
  const hour = new Date().getHours();
  const dow = new Date().getDay();
  console.log(`当前时间: ${hour}:00, 星期${['日','一','二','三','四','五','六'][dow]}`);
  console.log(`规则1(未填报): ${plans.rows.length > 0 && hour >= 10 ? '✅ 满足' : plans.rows.length > 0 ? '⏰ 需等到10点后' : '❌ 无今日计划'}`);
  console.log(`规则2(考勤): ${mgrs.rows[0].count > 0 && hour >= 9 ? (attCount.rows[0].count === 0 ? '✅ 触发(到岗0人)' : '⚠️ 已有考勤记录') : '❌ 不满足'}`);
  console.log(`规则3(进度紧急): ${plans.rows.some(p=>{const dl=Math.floor((new Date(p.end_date)-new Date(today))/86400000);return dl>=0&&dl<=2&&parseInt(p.progress||'0')<50;}) ? '✅ 有紧急计划' : '❌ 无'}`);
  console.log(`规则4(协调超期): ${issues.rows.some(i=>Math.floor((new Date(today)-new Date(i.created_date))/86400000)>3) ? '✅ 有超期' : '❌ 无'}`);
  console.log(`规则5(ECC超期): ${ecc.rows.some(e=>Math.floor((new Date(today)-new Date(e.discovered_date))/86400000)>7) ? '✅ 有超期' : '❌ 无'}`);
  console.log(`规则6(周报): ${dow===5&&hour>=15||dow===6&&hour<12 ? '✅ 触发' : '❌ 不触发'}`);
  console.log(`规则7(下班未确认): ${hour>=17 ? (events.rows.some(e=>e.status!=='confirmed') ? '✅ 触发' : '❌ 都已确认') : '⏰ 需等到17:30'}`);
}

main().catch(console.error);
