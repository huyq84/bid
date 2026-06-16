// chat-context.js - 为 LLM 组装完整的项目数据上下文
import { query } from './db.js';

/**
 * 构建 LLM 需要的项目数据上下文
 * @param {string} projectId - 项目ID
 * @param {string} date - 日期 YYYY-MM-DD
 * @returns {Object} 上下文对象
 */
export async function buildChatContext(projectId, date) {
  // 并行拉取所有数据
  const [
    projectRes,
    areasRes,
    workersRes,
    teamRes,
    plansRes,
    eventsRes,
    issuesRes
  ] = await Promise.all([
    query('SELECT * FROM dr_projects WHERE id=$1', [projectId]),
    query('SELECT id, name, floor, manager FROM dr_areas WHERE project_id=$1 ORDER BY id', [projectId]),
    query('SELECT id, name, role, team, phone FROM dr_workers ORDER BY id'),
    query('SELECT id, position, name, phone FROM dr_management_team ORDER BY position'),
    query(`SELECT id, task_name, start_date, end_date, progress, status, area_targets, labor_schedule, extra
           FROM dr_daily_plans WHERE project_id=$1 AND start_date <= $2 AND end_date >= $2 ORDER BY start_date`, [projectId, date]),
    query(`SELECT id, time, type, area_id, plan_id, payload, submitter, status, note
           FROM dr_events WHERE project_id=$1 AND date=$2 ORDER BY time`, [projectId, date]),
    query(`SELECT id, type, title, area_id, priority, status, created_date, owner, description
           FROM dr_issues WHERE project_id=$1 AND status != 'closed' ORDER BY created_date DESC LIMIT 10`, [projectId])
  ]);

  // 今日事件汇总
  const todayEvents = eventsRes.rows.map(e => ({
    id: e.id,
    time: e.time,
    type: e.type,
    area: e.area_id,
    taskName: e.payload?.taskName || '',
    owner: e.payload?.owner || '',
    progress: e.payload?.progress || '',
    headcount: e.payload?.headcount || 0,
    laborRequirements: e.payload?.laborRequirements || [],
    status: e.status
  }));

  // 计划列表（精简为 LLM 友好的格式）
  const activePlans = plansRes.rows.map(p => ({
    id: p.id,
    name: p.task_name,
    startDate: p.start_date,
    endDate: p.end_date,
    progress: p.progress,
    owner: p.extra?.owner || '',
    status: p.status,
    areas: p.area_targets || [],
    labor: p.labor_schedule || [],
    extra: p.extra || {}
  }));

  // 区域列表（用于匹配 areaId）
  const areas = areasRes.rows.map(a => ({
    id: a.id,
    name: a.name,
    floor: a.floor,
    manager: a.manager
  }));

  // 工人列表（用于匹配负责人）
  const workers = workersRes.rows.map(w => ({
    id: w.id,
    name: w.name,
    role: w.role,
    team: w.team
  }));

  // 管理人员（用于签到）
  const managementTeam = teamRes.rows.map(m => ({
    id: m.id,
    position: m.position,
    name: m.name
  }));

  // 未关闭协调
  const openIssues = issuesRes.rows.map(i => ({
    id: i.id,
    type: i.type,
    title: i.title,
    area: i.area_id,
    priority: i.priority,
    status: i.status,
    createdDate: i.created_date,
    owner: i.owner
  }));

  // 统计
  const stats = {
    eventsToday: todayEvents.length,
    eventsUnconfirmed: todayEvents.filter(e => e.status !== 'confirmed').length,
    plansActive: activePlans.length,
    issuesOpen: openIssues.length
  };

  return {
    projectId,
    projectName: projectRes.rows[0]?.name || projectId,
    date,
    today: {
      events: todayEvents,
      plans: activePlans,
      issues: openIssues
    },
    reference: {
      areas,        // 区域列表
      workers,      // 工人
      managementTeam // 管理人员（用于签到）
    },
    stats
  };
}

/**
 * 把上下文转成 LLM 友好的文本摘要
 * 用于拼接到 system prompt 中
 */
export function contextToText(ctx) {
  const lines = [];
  lines.push(`## 可用操作（返回 JSON actions 数组，每项含 type + data）`);
  lines.push(`安全操作（自动执行）：`);
  lines.push(`  - createEvent: [必填] type（事件类型）+ taskName（任务名称）| [可选] areaId（区域）, owner（负责人）, progress（进度百分比）, headcount（总人数=各工种人数之和）, laborRequirements（工种×人数明细）, note（备注）, planId（计划ID）`);
  lines.push(`    type∈{progress（进度）,material（材料）,safety（安全）,coordination（协调）,attendance（考勤）,issue（问题）,drawing（图纸）}`);
  lines.push(`  - createIssue: [必填] title | [可选] type, areaId, priority, proposeDept, cooperateDept, owner, description`);
  lines.push(`  - createAttendance: [必填] records: { managerId, present, reason }`);
  lines.push(`  - confirmEvent: [必填] eventId（将事件标记为已确认）`);
  lines.push(`敏感操作（需要用户授权后执行）：`);
  lines.push(`  - updateEvent: [必填] eventId | [可选] taskName（任务名称）, owner（负责人）, progress（进度）, headcount（总人数）, laborRequirements（工种×人数）, type, status`);
  lines.push(`  - deleteEvent: [必填] eventId`);
  lines.push(`  - updateIssue: [必填] issueId | [可选] title, status, priority, owner, description`);
  lines.push(`  - closeIssue: [必填] issueId`);
  lines.push(`  - deleteIssue: [必填] issueId`);
  lines.push(``);
  lines.push(`## 反问规则`);
  lines.push(`- 缺少[必填]字段时必须反问用户，不要生成 action`);
  lines.push(`- 缺少[可选]字段时留空默认值`);
  lines.push(`- 用户说"录入今日完成"等模糊表述 → 反问"请问要记录什么任务？"`);
  lines.push(`- 用户说"确认事件 E123"或"标记为已完成" → 使用 confirmEvent: { eventId: "E123" }`);
  lines.push('');
  lines.push(`## 项目：${ctx.projectName} (${ctx.projectId})`);
  lines.push(`## 日期：${ctx.date}`);
  lines.push('');
  lines.push(`## 今日统计`);
  lines.push(`- 已录事件：${ctx.stats.eventsToday} 条（未确认 ${ctx.stats.eventsUnconfirmed} 条）`);
  lines.push(`- ⚠️ 人数说明：每个事件中的 headcount = 各工种人数（laborRequirements）之和，不含负责人。如木工3人+电工2人，headcount=5`);
  lines.push(`- 进行中计划：${ctx.stats.plansActive} 个`);
  lines.push(`- 未关闭协调：${ctx.stats.issuesOpen} 个`);
  lines.push('');

  if (ctx.today.plans.length > 0) {
    lines.push(`## 今日进行中的计划（可用于匹配）`);
    ctx.today.plans.forEach(p => {
      const laborStr = (p.labor || []).map(l => `${l.trade || ''} × ${l.count || 0}人`).join('、');
      lines.push(`- [${p.id}] ${p.name} | 区域: ${(p.areas || []).join('/') || '未指定'} | 负责人: ${p.owner || '未指定'} | 进度: ${p.progress || '0%'} | 劳动力: ${laborStr || '未指定'} | 起止: ${p.startDate}~${p.endDate}`);
    });
    lines.push('');
  }

  if (ctx.today.events.length > 0) {
    lines.push(`## 今日已录事件（避免重复）`);
    ctx.today.events.slice(0, 20).forEach(e => {
      const laborStr = (e.laborRequirements || []).map(l => `${l.trade}${l.count}人`).join('、');
      lines.push(`- [${e.id}] ${e.time} ${e.type} ${e.taskName}${e.owner ? ' @' + e.owner : ''} ${e.progress ? e.progress : ''} ${laborStr ? '工种:'+laborStr : ''}`);
    });
    if (ctx.today.events.length > 20) lines.push(`... 共 ${ctx.today.events.length} 条`);
    lines.push('');
  }

  if (ctx.reference.areas.length > 0) {
    lines.push(`## 项目区域（用 id 引用）`);
    ctx.reference.areas.forEach(a => {
      lines.push(`- [${a.id}] ${a.name} | 楼层: ${a.floor || ''} | 负责人: ${a.manager || ''}`);
    });
    lines.push('');
  }

  if (ctx.reference.workers.length > 0) {
    lines.push(`## 工人列表（按角色分类）`);
    const byRole = {};
    ctx.reference.workers.forEach(w => {
      if (!byRole[w.role]) byRole[w.role] = [];
      byRole[w.role].push(w);
    });
    Object.keys(byRole).forEach(role => {
      const names = byRole[role].slice(0, 10).map(w => w.name).join('、');
      lines.push(`- ${role}: ${names}${byRole[role].length > 10 ? ' 等' : ''}`);
    });
    lines.push('');
  }

  if (ctx.reference.managementTeam.length > 0) {
    lines.push(`## 管理人员（用于签到）`);
    ctx.reference.managementTeam.forEach(m => {
      lines.push(`- [${m.id}] ${m.position}: ${m.name}`);
    });
    lines.push('');
  }

  if (ctx.today.issues.length > 0) {
    lines.push(`## 未关闭协调（用于去重）`);
    ctx.today.issues.forEach(i => {
      lines.push(`- [${i.id}] ${i.title} | 区域: ${i.area || '未指定'} | 优先级: ${i.priority} | 创建: ${i.createdDate}`);
    });
    lines.push('');
  }

  return lines.join('\n');
}
