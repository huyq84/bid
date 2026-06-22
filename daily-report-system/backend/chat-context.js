// chat-context.js - 为 LLM 组装完整的项目数据上下文
import { query } from './db.js';

/**
 * 构建 LLM 需要的项目数据上下文
 * 字段命名约定：统一用 camelCase（与前端 JSON / LLM action 一致）
 *   - 计划：dr_daily_plans 的 task_name → taskName, labor_schedule → laborSchedule, area_targets → areaTargets
 *   - 事件：dr_events 的 area_id → areaId, plan_id → planId, payload.* 保留 payload
 *   - 协调：dr_issues 的 area_id → areaId, created_date → createdDate
 *
 * 「今日计划」 = dr_daily_plans 中 startDate <= today <= endDate 的记录
 * 「今日完成」 = dr_events 中 date = today 的记录
 *
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
    issuesRes,
    eccRes,
    drawingsRes,
    milestonesRes,
    ganttRes
  ] = await Promise.all([
    query('SELECT * FROM dr_projects WHERE id=$1', [projectId]),
    query('SELECT id, name, floor, manager FROM dr_areas WHERE project_id=$1 ORDER BY id', [projectId]),
    query('SELECT id, name, role, team, phone FROM dr_workers ORDER BY id'),
    query('SELECT id, position, name, phone FROM dr_management_team ORDER BY position'),
    query(`SELECT id, task_name, start_date, end_date, progress, status, type, process, owner, building_no, floor_no, area_id, materials, machinery, safety_notes, zone_images, area_targets, labor_schedule, total_man_days, extra
           FROM dr_daily_plans WHERE project_id=$1 AND start_date <= $2 AND end_date >= $2 ORDER BY start_date`, [projectId, date]),
    query(`SELECT id, time, type, area_id, plan_id, payload, submitter, status, note, voice_text, photos, completion_type, building_no, floor_no, owner, source, date, confidence
           FROM dr_events WHERE project_id=$1 AND date=$2 ORDER BY time`, [projectId, date]),
    query(`SELECT id, type, title, area_id, priority, status, created_date, owner, description, deadline, resolution, closed_date, propose_dept, cooperate_dept
           FROM dr_issues WHERE project_id=$1 AND status != 'closed' ORDER BY created_date DESC LIMIT 10`, [projectId]),
    query(`SELECT * FROM dr_ecc_items WHERE project_id=$1 ORDER BY discovered_date DESC LIMIT 10`, [projectId]),
    query(`SELECT * FROM dr_drawing_deepenings WHERE project_id=$1 ORDER BY created_date DESC LIMIT 10`, [projectId]),
    query(`SELECT * FROM dr_milestone_plans WHERE project_id=$1 ORDER BY id LIMIT 20`, [projectId]),
    query(`SELECT * FROM dr_weekly_gantt_items ORDER BY area_order, seq LIMIT 20`)
  ]);

  // 今日事件汇总（即"今日完成"，来自 dr_events）
  // 字段约定：完全对应前端 EVENT shape（camelCase），并补齐 LLM 用得到的辅助信息
  const todayEvents = eventsRes.rows.map(e => {
    const areaId = e.area_id || '';
    const area = areasRes.rows.find(a => a.id === areaId);
    return {
      id: e.id,
      projectId: e.project_id,
      date: e.date,
      time: e.time,
      type: e.type,                                  // progress/material/safety/coordination/attendance/drawing
      areaId,
      areaName: area?.name || '',                    // ✅ 从 reference.areas 反查
      planId: e.plan_id,
      taskName: e.payload?.taskName || '',
      owner: e.owner || e.payload?.owner || '',
      progress: e.payload?.progress || '',
      headcount: e.payload?.headcount || 0,
      laborRequirements: (() => { const v = e.payload?.laborRequirements; return Array.isArray(v) ? v : (typeof v === 'string' ? (() => { try { return JSON.parse(v); } catch { return []; } })() : []); })(),
      description: e.payload?.description || e.note || '',
      note: e.note || '',
      completionType: e.completion_type || '',          // planned / unplanned
      buildingNo: e.building_no || '',
      floorNo: e.floor_no || '',
      submitter: e.submitter,
      source: e.source,
      status: e.status,                                 // draft / confirmed
      confidence: e.confidence,
      voiceText: e.voice_text || '',
      hasPhotos: Array.isArray(e.photos) && e.photos.length > 0,
      photoCount: Array.isArray(e.photos) ? e.photos.length : 0
    };
  });

  // 计划列表（即"今日计划"，来自 dr_daily_plans）
  // 字段约定：完全对应前端 PLAN shape（camelCase），DB column 直接读取（不再走 extra）
  const activePlans = plansRes.rows.map(p => {
    const extra = p.extra || {};
    const planAreaId = p.area_id || extra.areaId || '';
    const planArea = areasRes.rows.find(a => a.id === planAreaId);
    return {
      id: p.id,
      projectId: p.project_id,
      date: p.date,
      taskName: p.task_name,
      description: p.description || extra.description || '',
      process: p.process || extra.process || '',
      startDate: p.start_date,
      endDate: p.end_date,
      progress: p.progress,
      status: p.status,
      type: p.type || extra.type || '',
      areaId: planAreaId,
      areaName: planArea?.name || extra.areaName || '',
      buildingNo: p.building_no || extra.buildingNo || '',
      floorNo: p.floor_no || extra.floorNo || '',
      owner: p.owner || extra.owner || '',
      totalManDays: p.total_man_days || 0,
      materials: Array.isArray(p.materials) ? p.materials : (extra.materials || []),
      machinery: Array.isArray(p.machinery) ? p.machinery : (extra.machinery || []),
      safetyNotes: p.safety_notes || extra.safetyNotes || '',
      zoneImages: Array.isArray(p.zone_images) ? p.zone_images : (extra.zoneImages || []),
      areaTargets: Array.isArray(p.area_targets) ? p.area_targets : [],
      laborSchedule: Array.isArray(p.labor_schedule) ? p.labor_schedule : []
    };
  });

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
    team: w.team,
    phone: w.phone
  }));

  // 管理人员（用于签到）
  const managementTeam = teamRes.rows.map(m => ({
    id: m.id,
    position: m.position,
    name: m.name
  }));

  // 未关闭协调
  const openIssues = issuesRes.rows.map(i => {
    const areaId = i.area_id || '';
    const area = areasRes.rows.find(a => a.id === areaId);
    return {
      id: i.id,
      projectId: i.project_id,
      type: i.type,
      title: i.title,
      areaId,
      areaName: area?.name || '',
      priority: i.priority,
      status: i.status,
      createdDate: i.created_date,
      deadline: i.deadline,
      owner: i.owner,
      description: i.description,
      resolution: i.resolution || '',
      closedDate: i.closed_date,
      proposeDept: i.propose_dept,
      cooperateDept: i.cooperate_dept
    };
  });

  // ECC 变更
  const eccItems = eccRes.rows.map(e => ({
    id: e.id, title: e.title, areaId: e.area_id,
    discoveredDate: e.discovered_date, status: e.status,
    closedDate: e.closed_date, photos: e.photos || []
  }));

  // 图纸深化
  const drawings = drawingsRes.rows.map(d => ({
    id: d.id, task: d.task, owner: d.owner, status: d.status,
    areaId: d.area_id, planId: d.plan_id, progress: d.progress,
    eventId: d.event_id, createdDate: d.created_date
  }));

  // 里程碑节点
  const milestones = milestonesRes.rows.map(m => ({
    id: m.id, category: m.category, nodeType: m.node_type,
    areaLabel: m.area_label, description: m.description,
    targetMonth: m.target_month, year: m.year
  }));

  // 甘特图
  const ganttItems = ganttRes.rows.map(g => ({
    id: g.id, area: g.area, areaOrder: g.area_order, seq: g.seq,
    task: g.task, durationDays: g.duration_days,
    schedule: g.schedule || [], labor: g.labor, material: g.material
  }));

  // 统计
  const stats = {
    eventsToday: todayEvents.length,
    eventsUnconfirmed: todayEvents.filter(e => e.status !== 'confirmed').length,
    eventsPlanned: todayEvents.filter(e => e.completionType === 'planned').length,
    eventsUnplanned: todayEvents.filter(e => e.completionType === 'unplanned').length,
    plansActive: activePlans.length,
    plansCompleted: activePlans.filter(p => p.status === 'completed').length,
    issuesOpen: openIssues.length
  };

  return {
    projectId,
    projectName: projectRes.rows[0]?.name || projectId,
    date,
    today: {
      plans: activePlans,
      events: todayEvents,
      issues: openIssues,
      eccItems,
      drawings,
      milestones,
      ganttItems
    },
    reference: {
      areas,
      workers,
      managementTeam
    },
    stats
  };
}

/**
 * 把上下文转成 LLM 友好的文本摘要
 * 用于拼接到 system prompt 中
 *
 * 关键概念：
 *   - 「今日计划」= 计划列表（来自 dr_daily_plans，今天处于 startDate~endDate 区间）
 *   - 「今日完成」= 已录事件（来自 dr_events，今天 date=today）
 *   - 用户说"录入 X 完成"或"记录 X 进度"→ createEvent（向"今日完成"加一条）
 *   - 用户说"修改/完善计划 X"→ updatePlan（修改"今日计划"中的某条）
 */
export function contextToText(ctx) {
  const lines = [];

  // 待处理项目：今日计划里，taskName 还不在今日完成里的
  const planEventNames = new Set(ctx.today.events.map(e => e.taskName).filter(Boolean));
  const pendingPlans = ctx.today.plans.filter(p => !planEventNames.has(p.taskName));

  lines.push(`## 核心概念（重要）`);
  lines.push(`- 「今日计划」= 计划表（dr_daily_plans）中今天处于起止区间内的任务，代表"计划要做什么"`);
  lines.push(`- 「今日完成」= 日报事件表（dr_events）中 date=今天 的记录，代表"实际做了什么/进度如何"`);
  lines.push(`- createEvent → 录入"今日完成"（一条日报事件），即向 dr_events 加一条记录——记录"实际做了什么/进度如何"`);
  lines.push(`- createPlan → 创建新的"今日计划"（一条施工计划），即向 dr_daily_plans 加一条记录——规划"计划要做什么"。createPlan 与 createEvent 是互斥的：用户说"计划/安排/规划"用 createPlan，说"做了/完成了/记录了"用 createEvent，不要同时调用`);
  lines.push(`- updatePlan → 完善"今日计划"（更新计划字段），即修改 dr_daily_plans 中某条记录`);
  lines.push(`- createIssue → 录协调事宜（与计划/事件无关的独立事项台账）`);
  lines.push('');

  lines.push(`## 可用操作（返回 JSON actions 数组，每项含 type + data）`);
  lines.push(`安全操作（自动执行）：`);
  lines.push(`  - createEvent: [必填] type（事件类型）+ taskName（任务名称） | [可选] areaId, areaName, planId（关联计划ID）, owner（负责人）, progress（进度%,如 80%）, headcount（总人数=各工种人数之和）, laborRequirements（工种×人数,如[{trade:"木工",count:3}]）, note（备注）, completionType（planned|unplanned）, buildingNo, floorNo, type（事件类型：progress/material/safety/coordination/attendance/issue/drawing）`);
  lines.push(`    type∈{progress（进度/今日完成）, material（材料进场）, safety（安全）, coordination（协调沟通）, attendance（考勤）, issue（问题）, drawing（图纸深化）}`);
  lines.push(`  - createPlan: [必填] taskName（任务名） | [可选] startDate, endDate, areaId, areaName, owner, progress, buildingNo, floorNo, laborRequirements, status（创建新的施工计划——与 createEvent 互斥，不要同时调）`);
  lines.push(`  - createIssue: [必填] title | [可选] type, areaId, priority, proposeDept, cooperateDept, owner, description`);
  lines.push(`  - createAttendance: [必填] records: { managerId, present, reason }`);
  lines.push(`  - confirmEvent: [必填] eventId（将"今日完成"标记为已确认）`);
  lines.push(`敏感操作（需要用户授权后执行）：`);
  lines.push(`  - updateEvent: [必填] eventId | [可选] taskName, owner, progress, headcount, laborRequirements, type, status, areaId, completionType, buildingNo, floorNo`);
  lines.push(`  - deleteEvent: [必填] eventId（仅删 1 条）`);
  lines.push(`  - batchDelete: [必填] date（YYYY-MM-DD）+ 至少 1 个其他条件 | [可选] timeFrom, timeTo, status, type, planId, areaId, taskNameContains, ids（按条件批量删除）`);
  lines.push(`  - updateIssue: [必填] issueId | [可选] title, status, priority, owner, description`);
  lines.push(`  - closeIssue: [必填] issueId`);
  lines.push(`  - deleteIssue: [必填] issueId`);
  lines.push(`  - updatePlan: [必填] planId | [可选] type, owner, progress, buildingNo, floorNo, totalManDays, description, process, laborRequirements, taskName, status, areaId, areaName, materials, machinery, safetyNotes（完善"今日计划"字段）`);
  lines.push(``);
  lines.push(`## 反问规则`);
  lines.push(`- 缺少[必填]字段时必须反问用户，不要生成 action`);
  lines.push(`- 缺少[可选]字段时留空默认值，不要反问`);
  lines.push(`- 用户说"录入今日完成"等模糊表述时，反问"请问要记录什么任务？"`);
  lines.push(`- 用户说"标记 E123 为已确认/已完成"→ confirmEvent: { eventId: "E123" }`);
  lines.push('');
  lines.push(`## 批量操作规则（重要）`);
  lines.push(`- 用户要求批量处理（如"完善今日计划""录入所有"）时，必须对照"待处理项目"一次性输出所有 action，严禁分批`);
  lines.push('');
  lines.push(`## 自检规则（重要）`);
  lines.push(`- 每次执行完 mutation（create/update/delete）后，必须立即调用对应的 query 工具验证结果——创建后查是否存在，修改后查字段是否更新，删除后查是否已消失`);
  lines.push(`- 验证通过后再向用户报告成功，并附上验证后查到的实际数据（id、字段值等）`);
  lines.push(`- 验证失败（查询结果与预期不符）时，重试 1 次（调整参数后再次调用 mutation 工具）`);
  lines.push(`- 若重试后仍然失败，立即停止尝试，如实向用户报告「连续失败，请检查后端或手动操作」，不要编造成功，不要无限重试`);
  lines.push('');
  lines.push(`## 项目：${ctx.projectName} (${ctx.projectId})`);
  lines.push(`## 日期：${ctx.date}`);
  lines.push('');
  lines.push(`## 今日统计`);
  lines.push(`- 今日计划（进行中）：${ctx.stats.plansActive} 个（已完成 ${ctx.stats.plansCompleted} 个）`);
  lines.push(`- 今日完成（已录事件）：${ctx.stats.eventsToday} 条（未确认 ${ctx.stats.eventsUnconfirmed} 条；计划内 ${ctx.stats.eventsPlanned} 条，计划外 ${ctx.stats.eventsUnplanned} 条）`);
  lines.push(`- 未关闭协调：${ctx.stats.issuesOpen} 个`);
  lines.push(`- ⚠️ 人数说明：每个事件中的 headcount = 各工种人数（laborRequirements）之和，不含负责人。如木工3人+电工2人，headcount=5`);
  lines.push('');

  // ============== 今日计划 ==============
  if (ctx.today.plans.length > 0) {
    lines.push(`## 今日计划（共 ${ctx.today.plans.length} 条）— 来自 dr_daily_plans，今天处于起止区间内`);
    lines.push(`字段：id, taskName, description, process（工序）, startDate~endDate, progress, status（active/completed/paused）, type, areaId+areaName, buildingNo, floorNo, owner, totalManDays, materials[], machinery[], safetyNotes, zoneImages[], areaTargets[], laborSchedule[]`);
    ctx.today.plans.forEach(p => {
      const areaStr = p.areaName || (p.areaId || '未指定');
      const laborStr = (p.laborSchedule || []).map(l => `${l.trade || l.laborType || ''} × ${l.count || 0}人`).join('、') || '未指定';
      const extras = [];
      if (p.buildingNo) extras.push(`楼栋:${p.buildingNo}`);
      if (p.floorNo) extras.push(`楼层:${p.floorNo}`);
      if (p.totalManDays) extras.push(`总工日:${p.totalManDays}`);
      if (p.process) extras.push(`工序:${p.process}`);
      if (p.type) extras.push(`类型:${p.type}`);
      if (p.materials && p.materials.length > 0) extras.push(`材料:${p.materials.join('、')}`);
      if (p.machinery && p.machinery.length > 0) extras.push(`机械:${p.machinery.join('、')}`);
      if (p.safetyNotes) extras.push(`安全:${p.safetyNotes}`);
      lines.push(`- [${p.id}] taskName="${p.taskName}" | 区域:${areaStr} | 负责人:${p.owner || '未指定'} | 进度:${p.progress || '0%'} | 状态:${p.status || 'active'} | 劳动力:${laborStr} | 起止:${p.startDate}~${p.endDate}${extras.length ? ' | ' + extras.join(',') : ''}`);
    });
    lines.push('');
  } else {
    lines.push(`## 今日计划（0 条）`);
    lines.push('');
  }

  // ============== 今日完成 ==============
  if (ctx.today.events.length > 0) {
    lines.push(`## 今日完成（共 ${ctx.today.events.length} 条）— 来自 dr_events，今天 date=${ctx.date} 录的实际事件`);
    lines.push(`字段：id, time, type（事件类型：progress/material/safety/coordination/attendance/drawing）, taskName, areaId+areaName, planId, owner, progress, headcount, laborRequirements[], completionType（planned/unplanned）, buildingNo, floorNo, status（draft/confirmed）, source, submitter, confidence, note, hasPhotos`);
    ctx.today.events.slice(0, 20).forEach(e => {
      const laborArr = Array.isArray(e.laborRequirements) ? e.laborRequirements : (typeof e.laborRequirements === 'string' ? (() => { try { return JSON.parse(e.laborRequirements); } catch { return []; } })() : []);
      const laborStr = laborArr.map(l => `${l.trade}${l.count}人`).join('、');
      const planLink = e.planId ? ` 关联计划ID=${e.planId}` : '';
      const ct = e.completionType ? ` 完成类型:${e.completionType}` : '';
      const build = (e.buildingNo || e.floorNo) ? ` 楼栋:${e.buildingNo || '-'}/楼层:${e.floorNo || '-'}` : '';
      const area = e.areaName ? `${e.areaName}(${e.areaId})` : (e.areaId || '未指定');
      const src = e.source ? ` 来源:${e.source}` : '';
      const sub = e.submitter ? ` 填报人:${e.submitter}` : '';
      const photo = e.hasPhotos ? ` 照片:${e.photoCount}张` : '';
      const conf = e.confidence != null ? ` 置信度:${(e.confidence*100).toFixed(0)}%` : '';
      lines.push(`- [${e.id}] ${e.time || '-'} type=${e.type} taskName="${e.taskName}" 区域:${area}${e.owner ? ' 负责人:' + e.owner : ''} 进度:${e.progress || '-'} 人数:${e.headcount || 0}${planLink}${ct}${build}${src}${sub}${photo}${conf} status=${e.status}`);
    });
    if (ctx.today.events.length > 20) lines.push(`... 共 ${ctx.today.events.length} 条`);
    lines.push('');
  } else {
    lines.push(`## 今日完成（0 条）`);
    lines.push('');
  }

  // ============== 待处理项目 ==============
  if (pendingPlans.length > 0) {
    lines.push(`## 待处理项目（共 ${pendingPlans.length} 项）— 今日计划中还未生成"今日完成"的任务`);
    pendingPlans.forEach((p, i) => {
      const laborStr = (p.laborSchedule || []).map(l => `${l.trade || l.laborType || ''} × ${l.count || 0}人`).join('、');
      lines.push(`  ${i+1}. [${p.id}] taskName="${p.taskName}" | 区域:${(p.areaTargets || []).map(a => a.areaId).join('/') || '未指定'} | 负责人:${p.owner || '未指定'} | 进度:${p.progress || '0%'} | 劳动力:${laborStr || '未指定'}`);
    });
    lines.push('');
  }

  // ============== 参考数据 ==============
  if (ctx.reference.areas.length > 0) {
    lines.push(`## 项目区域（用 areaId 引用，例：BAI-A1）`);
    ctx.reference.areas.forEach(a => {
      lines.push(`- [${a.id}] ${a.name} | 楼层:${a.floor || ''} | 负责人:${a.manager || ''}`);
    });
    lines.push('');
  }

  if (ctx.reference.workers.length > 0) {
    lines.push(`## 工人列表（按角色分类，用于匹配 owner/负责人）`);
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
    lines.push(`## 管理人员（用于签到 createAttendance）`);
    ctx.reference.managementTeam.forEach(m => {
      lines.push(`- [${m.id}] ${m.position}: ${m.name}`);
    });
    lines.push('');
  }

  if (ctx.today.issues.length > 0) {
    lines.push(`## 未关闭协调（用于去重，issueId 引用）`);
    lines.push(`字段：id, type（quality/safety/coordination/ecc/change/visa）, title, areaId+areaName, priority（high/medium/low）, status（open/in_progress/closed）, createdDate, deadline, owner, description, resolution, proposeDept, cooperateDept`);
    ctx.today.issues.forEach(i => {
      const area = i.areaName ? `${i.areaName}(${i.areaId})` : (i.areaId || '未指定');
      const extras = [];
      if (i.deadline) extras.push(`截止:${i.deadline}`);
      if (i.proposeDept) extras.push(`发起方:${i.proposeDept}`);
      if (i.cooperateDept) extras.push(`配合方:${i.cooperateDept}`);
      if (i.resolution) extras.push(`解决方案:${i.resolution}`);
      lines.push(`- [${i.id}] type=${i.type} | 标题:"${i.title}" | 区域:${area} | 优先级:${i.priority} | 状态:${i.status} | 创建:${i.createdDate}${i.owner ? ' @' + i.owner : ''}${extras.length ? ' | ' + extras.join(' | ') : ''}`);
    });
    lines.push('');
  }

  // ============== ECC 变更 ==============
  if (ctx.today.eccItems && ctx.today.eccItems.length > 0) {
    lines.push(`## ECC 变更（${ctx.today.eccItems.length} 项）`);
    lines.push(`字段：id, title, areaId, discoveredDate, status（open/closed/closing）, closedDate`);
    ctx.today.eccItems.forEach(e => {
      lines.push(`- [${e.id}] ${e.title} | 区域:${e.areaId || '未指定'} | 发现:${e.discoveredDate} | 状态:${e.status}${e.closedDate ? ' | 关闭:' + e.closedDate : ''}`);
    });
    lines.push('');
  }

  // ============== 图纸深化 ==============
  if (ctx.today.drawings && ctx.today.drawings.length > 0) {
    lines.push(`## 图纸深化（${ctx.today.drawings.length} 项）`);
    lines.push(`字段：id, task, owner, status, areaId, planId, progress, eventId, createdDate`);
    ctx.today.drawings.forEach(d => {
      lines.push(`- [${d.id}] ${d.task} | 负责人:${d.owner || '未指定'} | 状态:${d.status} | 区域:${d.areaId || '未指定'} | 进度:${d.progress || '-'} | 创建:${d.createdDate}`);
    });
    lines.push('');
  }

  // ============== 里程碑节点 ==============
  if (ctx.today.milestones && ctx.today.milestones.length > 0) {
    lines.push(`## 里程碑节点（${ctx.today.milestones.length} 项）`);
    lines.push(`字段：id, category, nodeType, areaLabel, description, targetMonth, year`);
    ctx.today.milestones.forEach(m => {
      lines.push(`- [${m.id}] ${m.category} | ${m.nodeType || ''} | ${m.areaLabel || ''} | ${m.description} | 目标:${m.targetMonth || ''} ${m.year || ''}`);
    });
    lines.push('');
  }

  // ============== 甘特图 ==============
  if (ctx.today.ganttItems && ctx.today.ganttItems.length > 0) {
    lines.push(`## 周甘特图（${ctx.today.ganttItems.length} 项）`);
    lines.push(`字段：id, area, areaOrder, seq, task, durationDays, schedule, labor, material`);
    ctx.today.ganttItems.forEach(g => {
      lines.push(`- [${g.id}] ${g.area} | ${g.task} | 工期:${g.durationDays}天 | 劳动力:${g.labor || '-'} | 材料:${g.material || '-'}`);
    });
    lines.push('');
  }

  return lines.join('\n');
}
