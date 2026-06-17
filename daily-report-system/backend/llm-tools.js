// llm-tools.js - ReAct 循环用的查询工具集
import { query } from './db.js';
import { executeAction } from './chat-actions.js';

const TOOLS = [
  {
    name: 'queryEvents',
    description: '查询今日完成（日报事件）。可按日期、类型、区域、状态、任务名模糊筛选',
    params: { date: 'YYYY-MM-DD，默认今日', type: '事件类型', areaId: '区域ID', taskNameContains: '任务名关键词', status: 'draft|confirmed', limit: '最多返回条数' },
    handler: async (params, ctx) => {
      const date = params.date || ctx.date;
      const conds = ['project_id=$1', 'date=$2'];
      const vals = [ctx.projectId, date];
      let i = 3;
      if (params.type) { conds.push(`type=$${i++}`); vals.push(params.type); }
      if (params.areaId) { conds.push(`area_id=$${i++}`); vals.push(params.areaId); }
      if (params.status) { conds.push(`status=$${i++}`); vals.push(params.status); }
      if (params.taskNameContains) { conds.push(`payload->>'taskName' ILIKE $${i++}`); vals.push(`%${params.taskNameContains}%`); }
      const limit = params.limit || 50;
      const r = await query(`SELECT * FROM dr_events WHERE ${conds.join(' AND ')} ORDER BY time LIMIT ${limit}`, vals);
      return r.rows.map(e => ({
        id: e.id, time: e.time, type: e.type, areaId: e.area_id,
        taskName: e.payload?.taskName || '', owner: e.owner || e.payload?.owner || '',
        progress: e.payload?.progress || '', headcount: e.payload?.headcount || 0,
        laborRequirements: e.payload?.laborRequirements || [],
        completionType: e.completion_type || '', buildingNo: e.building_no || '',
        floorNo: e.floor_no || '', status: e.status, source: e.source
      }));
    }
  },
  {
    name: 'queryPlans',
    description: '查询今日计划（起止日期覆盖今天的施工计划）',
    params: { date: 'YYYY-MM-DD，默认今日', status: 'active|completed|paused', areaId: '区域ID' },
    handler: async (params, ctx) => {
      const date = params.date || ctx.date;
      const conds = ['project_id=$1', 'start_date <= $2', 'end_date >= $2'];
      const vals = [ctx.projectId, date];
      let i = 3;
      if (params.status) { conds.push(`status=$${i++}`); vals.push(params.status); }
      const r = await query(`SELECT * FROM dr_daily_plans WHERE ${conds.join(' AND ')} ORDER BY start_date`, vals);
      return r.rows.map(p => {
        const extra = p.extra || {};
        return {
          id: p.id, taskName: p.task_name, progress: p.progress, status: p.status,
          startDate: p.start_date, endDate: p.end_date,
          areaId: extra.areaId || '', areaName: extra.areaName || '',
          owner: extra.owner || '', buildingNo: extra.buildingNo || '',
          floorNo: extra.floorNo || '', totalManDays: p.total_man_days || 0,
          laborSchedule: Array.isArray(p.labor_schedule) ? p.labor_schedule : [],
          areaTargets: Array.isArray(p.area_targets) ? p.area_targets : [],
          type: extra.type || ''
        };
      });
    }
  },
  {
    name: 'queryIssues',
    description: '查询协调事项',
    params: { status: 'open|in_progress|closed', type: '事项类型', areaId: '区域ID' },
    handler: async (params, ctx) => {
      const conds = ['project_id=$1'];
      const vals = [ctx.projectId];
      let i = 2;
      if (params.status) { conds.push(`status=$${i++}`); vals.push(params.status); }
      if (params.type) { conds.push(`type=$${i++}`); vals.push(params.type); }
      if (params.areaId) { conds.push(`area_id=$${i++}`); vals.push(params.areaId); }
      const r = await query(`SELECT * FROM dr_issues WHERE ${conds.join(' AND ')} ORDER BY created_date DESC LIMIT 20`, vals);
      return r.rows.map(x => ({
        id: x.id, type: x.type, title: x.title, areaId: x.area_id,
        priority: x.priority, status: x.status, createdDate: x.created_date,
        owner: x.owner, description: x.description
      }));
    }
  },
  {
    name: 'getStats',
    description: '获取指定日期的统计摘要（计划数、事件数、完成率等）',
    params: { date: 'YYYY-MM-DD，默认今日' },
    handler: async (params, ctx) => {
      const date = params.date || ctx.date;
      const [eventsRes, plansRes, issuesRes] = await Promise.all([
        query(`SELECT type, status, completion_type, COUNT(*) as c FROM dr_events WHERE project_id=$1 AND date=$2 GROUP BY type, status, completion_type`, [ctx.projectId, date]),
        query(`SELECT status, COUNT(*) as c FROM dr_daily_plans WHERE project_id=$1 AND start_date <= $2 AND end_date >= $2 GROUP BY status`, [ctx.projectId, date]),
        query(`SELECT status, COUNT(*) as c FROM dr_issues WHERE project_id=$1 AND status!='closed' GROUP BY status`, [ctx.projectId])
      ]);
      return {
        date,
        events: {
          total: eventsRes.rows.reduce((s, r) => s + parseInt(r.c), 0),
          byType: Object.fromEntries(eventsRes.rows.filter(r => r.type).map(r => [r.type, parseInt(r.c)])),
          byStatus: Object.fromEntries(eventsRes.rows.filter(r => r.status).map(r => [r.status, parseInt(r.c)])),
          planned: eventsRes.rows.filter(r => r.completion_type === 'planned').reduce((s, r) => s + parseInt(r.c), 0),
          unplanned: eventsRes.rows.filter(r => r.completion_type === 'unplanned').reduce((s, r) => s + parseInt(r.c), 0)
        },
        plans: {
          total: plansRes.rows.reduce((s, r) => s + parseInt(r.c), 0),
          byStatus: Object.fromEntries(plansRes.rows.map(r => [r.status, parseInt(r.c)]))
        },
        openIssues: issuesRes.rows.reduce((s, r) => s + parseInt(r.c), 0)
      };
    }
  },
  {
  name: 'comparePlansVsActuals',
  description: '对比今日计划和今日完成，找出已完成、未完成和计划外完成的任务',
  params: { date: 'YYYY-MM-DD，默认今日' },
  handler: async (params, ctx) => {
    const date = params.date || ctx.date;
    const [plansRes, eventsRes] = await Promise.all([
      query(`SELECT * FROM dr_daily_plans WHERE project_id=$1 AND start_date <= $2 AND end_date >= $2 ORDER BY start_date`, [ctx.projectId, date]),
      query(`SELECT * FROM dr_events WHERE project_id=$1 AND date=$2 ORDER BY time`, [ctx.projectId, date])
    ]);
    const plans = plansRes.rows.map(p => {
      const extra = p.extra || {};
      return { id: p.id, taskName: p.task_name, progress: p.progress, owner: extra.owner || '', status: p.status };
    });
    const events = eventsRes.rows.map(e => ({
      id: e.id, taskName: e.payload?.taskName || '', owner: e.owner || e.payload?.owner || '',
      progress: e.payload?.progress || '', planId: e.plan_id, completionType: e.completion_type || '',
      type: e.type
    }));
    const eventPlanIds = new Set(events.filter(e => e.planId).map(e => e.planId));
    const eventTaskNames = new Set(events.map(e => e.taskName).filter(Boolean));
    const completed = plans.filter(p => eventPlanIds.has(p.id) || eventTaskNames.has(p.taskName));
    const pending = plans.filter(p => !eventPlanIds.has(p.id) && !eventTaskNames.has(p.taskName));
    const unplanned = events.filter(e => e.completionType === 'unplanned' || (!e.planId && !pending.some(p => p.taskName === e.taskName)));
    return {
      date,
      planCount: plans.length,
      eventCount: events.length,
      completedPlans: completed.map(p => ({ id: p.id, taskName: p.taskName, progress: p.progress, owner: p.owner })),
      pendingPlans: pending.map(p => ({ id: p.id, taskName: p.taskName, progress: p.progress, owner: p.owner })),
      unplannedEvents: unplanned.map(e => ({ id: e.id, taskName: e.taskName, owner: e.owner, progress: e.progress, type: e.type })),
      summary: `计划 ${plans.length} 项，已完成 ${completed.length} 项，未完成 ${pending.length} 项${unplanned.length ? `，计划外 ${unplanned.length} 项` : ''}`
    };
  }
  },

  // ========== 写入工具（mutate）==========
  // 所有 mutate 工具都支持 dryRun 参数：true=只返回将影响的数据，不真写库
  // 工具内部走 chat-actions.js 的 executeAction，自动对接权限分级

  {
  name: 'createEvent',
  description: '创建一条施工日报事件。type + taskName 必填。areaId/planId/owner/progress/headcount 等可选。⚠️ 必须先调 queryPlans 确认 planId 真实存在。',
  isMutate: true,
  requiresConfirm: false,  // safe action
  params: { dryRun: 'true=只返回将创建的数据', type: 'progress|material|safety|coordination|attendance|issue|drawing', taskName: '任务名', areaId: '区域ID', planId: '关联计划ID', owner: '负责人', progress: '进度%', headcount: '总人数', laborRequirements: '工种×人数', completionType: 'planned|unplanned', buildingNo: '楼栋', floorNo: '楼层', note: '备注' },
  handler: async (params, ctx) => {
    const { dryRun, ...data } = params;
    if (dryRun) {
      return {
        dryRun: true,
        wouldCreate: { projectId: ctx.projectId, date: ctx.date, ...data },
        warning: '这是 dry-run，未实际写入数据库。告诉用户并请求确认（如果 permLevel=confirm）。'
      };
    }
    const result = await executeAction({ type: 'createEvent', data }, ctx);
    return { dryRun: false, ...result, inputData: data };  // ✅ 不要用 data 字段名（会覆盖 result.data）
  }
  },

  {
  name: 'updateEvent',
  description: '根据 eventId 修改一条事件。eventId 必填——必须先调 queryEvents 拿到真实 ID（不要编造）。可改 taskName/owner/progress/headcount/type/status/areaId/completionType/buildingNo/floorNo。',
  isMutate: true,
  requiresConfirm: true,  // sensitive
  params: { dryRun: 'true=只返回将修改的内容', eventId: '事件ID（必填）', taskName: '任务名', owner: '负责人', progress: '进度%', headcount: '总人数', laborRequirements: '工种×人数', type: '事件类型', status: 'draft|confirmed', areaId: '区域ID', completionType: 'planned|unplanned', buildingNo: '楼栋', floorNo: '楼层' },
  handler: async (params, ctx) => {
    const { dryRun, eventId, ...data } = params;
    if (!eventId) throw new Error('eventId 必填');
    // 校验事件存在
    const cur = await query('SELECT id, type, status, area_id, plan_id, payload, completion_type, building_no, floor_no, owner FROM dr_events WHERE id=$1', [eventId]);
    if (cur.rows.length === 0) throw new Error(`事件 ${eventId} 不存在。请先调 queryEvents 查真实 ID。`);
    if (dryRun) {
      return {
        dryRun: true,
        eventId,
        current: cur.rows[0],
        wouldUpdate: data,
        warning: '这是 dry-run，未实际修改。告诉用户将改什么，请求确认（如果 permLevel=confirm）。'
      };
    }
    // 权限检查：confirm 模式下返回待授权
    if (ctx?.permLevel === 'confirm') {
      return {
        dryRun: false,
        needsConfirm: true,
        pendingAction: { type: 'updateEvent', data: { eventId, ...data } },
        summary: `编辑事件 ${eventId} (${data.taskName || data.progress || ''})`,
        message: '请用户点击 ✅ 授权卡片确认执行'
      };
    }
    const result = await executeAction({ type: 'updateEvent', data: { eventId, ...data } }, ctx);
    return { dryRun: false, ...result, eventId, inputData: data };
  }
  },

  {
  name: 'deleteEventsByQuery',
  description: '⚠️ 危险操作！按条件批量删除事件。date 必填（限定到某一天），必须至少再给一个其他条件（timeFrom/timeTo/status/type/planId/areaId/taskNameContains/ids）。先 dryRun 看会删哪些，得到用户确认后再 forceDelete=true 真删。',
  isMutate: true,
  requiresConfirm: true,  // sensitive
  params: { dryRun: 'true=只列出会删什么，不真删', forceDelete: 'true=真删', date: 'YYYY-MM-DD 必填', timeFrom: 'HH:MM', timeTo: 'HH:MM', status: 'draft|confirmed', type: '事件类型', planId: '计划ID', areaId: '区域ID', taskNameContains: '任务名关键词', ids: '显式 eventId 列表', confirmConditions: '中文描述"要删什么"，给用户看' },
  handler: async (params, ctx) => {
    const { dryRun, forceDelete, confirmConditions, ...data } = params;
    if (!data.date && !ctx.date) throw new Error('date 必填');
    data.date = data.date || ctx.date;

    // 干跑模式：列出会被删的事件
    if (dryRun || !forceDelete) {
      const conds = ['project_id=$1', `date=$${2}`];
      const vals = [ctx.projectId, data.date];
      let i = 3;
      if (data.timeFrom) { conds.push(`time >= $${i++}`); vals.push(data.timeFrom); }
      if (data.timeTo) { conds.push(`time <= $${i++}`); vals.push(data.timeTo); }
      if (data.status) { conds.push(`status=$${i++}`); vals.push(data.status); }
      if (data.type) { conds.push(`type=$${i++}`); vals.push(data.type); }
      if (data.planId) { conds.push(`plan_id=$${i++}`); vals.push(data.planId); }
      if (data.areaId) { conds.push(`area_id=$${i++}`); vals.push(data.areaId); }
      if (data.taskNameContains) { conds.push(`payload->>'taskName' ILIKE $${i++}`); vals.push(`%${data.taskNameContains}%`); }
      if (Array.isArray(data.ids) && data.ids.length > 0) { conds.push(`id = ANY($${i++}::text[])`); vals.push(data.ids); }

      const filterCount = (data.timeFrom?1:0) + (data.timeTo?1:0) + (data.status?1:0) + (data.type?1:0) + (data.planId?1:0) + (data.areaId?1:0) + (data.taskNameContains?1:0) + (data.ids?.length?1:0);
      if (filterCount === 0) {
        throw new Error('batchDelete 至少需要一个筛选条件（timeFrom/timeTo/status/type/planId/areaId/taskNameContains/ids）');
      }

      const r = await query(`SELECT id, time, type, area_id, payload FROM dr_events WHERE ${conds.join(' AND ')} ORDER BY time`, vals);
      return {
        dryRun: true,
        matchingCount: r.rows.length,
        wouldDelete: r.rows.map(e => ({ id: e.id, time: e.time, type: e.type, areaId: e.area_id, taskName: e.payload?.taskName || '' })),
        confirmConditions: confirmConditions || '（未提供确认条件）',
        warning: `这是 dry-run。会匹配 ${r.rows.length} 条事件，未实际删除。要真删请设置 forceDelete=true 并再次调用（且 permLevel=allow 或 confirm 已授权）。`
      };
    }
    // 真删
    data.confirmConditions = confirmConditions;
    if (ctx?.permLevel === 'confirm') {
      return {
        dryRun: false,
        needsConfirm: true,
        pendingAction: { type: 'batchDelete', data },
        summary: `批量删除 ${data.date} 的事件（${data.taskNameContains || data.areaId || data.type || '按条件'}）`,
        message: '请用户点击 ✅ 授权卡片确认执行'
      };
    }
    const result = await executeAction({ type: 'batchDelete', data }, ctx);
    return { dryRun: false, ...result };
  }
  },

  {
  name: 'updateIssue',
  description: '修改协调事项。issueId 必填——必须先调 queryIssues 拿到真实 ID。可改 title/status/priority/owner/description。',
  isMutate: true,
  requiresConfirm: true,  // sensitive
  params: { dryRun: 'true=只返回将修改的内容', issueId: '协调ID（必填）', title: '标题', status: 'open|in_progress|closed', priority: 'low|medium|high', owner: '负责人', description: '描述' },
  handler: async (params, ctx) => {
    const { dryRun, issueId, ...data } = params;
    if (!issueId) throw new Error('issueId 必填');
    const cur = await query('SELECT * FROM dr_issues WHERE id=$1', [issueId]);
    if (cur.rows.length === 0) throw new Error(`协调 ${issueId} 不存在。请先调 queryIssues 查真实 ID。`);
    if (dryRun) {
      return { dryRun: true, issueId, current: cur.rows[0], wouldUpdate: data, warning: 'dry-run，未实际修改' };
    }
    if (ctx?.permLevel === 'confirm') {
      return {
        dryRun: false,
        needsConfirm: true,
        pendingAction: { type: 'updateIssue', data: { issueId, ...data } },
        summary: `更新协调: ${issueId}`,
        message: '请用户点击 ✅ 授权卡片确认执行'
      };
    }
    const result = await executeAction({ type: 'updateIssue', data: { issueId, ...data } }, ctx);
    return { dryRun: false, ...result, issueId, inputData: data };
  }
  },

  {
  name: 'closeIssue',
  description: '关闭协调事项（标记为已闭环）。issueId 必填。',
  isMutate: true,
  requiresConfirm: true,  // sensitive
  params: { dryRun: 'true=只返回将关闭的内容', issueId: '协调ID（必填）' },
  handler: async (params, ctx) => {
    const { dryRun, issueId } = params;
    if (!issueId) throw new Error('issueId 必填');
    const cur = await query('SELECT * FROM dr_issues WHERE id=$1', [issueId]);
    if (cur.rows.length === 0) throw new Error(`协调 ${issueId} 不存在`);
    if (dryRun) {
      return { dryRun: true, issueId, current: cur.rows[0], warning: 'dry-run，未实际关闭' };
    }
    if (ctx?.permLevel === 'confirm') {
      return {
        dryRun: false,
        needsConfirm: true,
        pendingAction: { type: 'closeIssue', data: { issueId } },
        summary: `关闭协调: ${issueId}`,
        message: '请用户点击 ✅ 授权卡片确认执行'
      };
    }
    const result = await executeAction({ type: 'closeIssue', data: { issueId } }, ctx);
    return { dryRun: false, ...result, issueId };
  }
  },

  {
  name: 'updatePlan',
  description: '完善计划字段。planId 必填——必须先调 queryPlans 拿到真实 ID。可改 areaId/owner/progress/buildingNo/floorNo/laborRequirements/taskName/status。',
  isMutate: true,
  requiresConfirm: true,  // sensitive
  params: { dryRun: 'true=只返回将完善的内容', planId: '计划ID（必填）', areaId: '区域ID', areaName: '区域名', owner: '负责人', progress: '进度%', buildingNo: '楼栋', floorNo: '楼层', laborRequirements: '工种×人数', taskName: '任务名', status: 'active|completed|paused' },
  handler: async (params, ctx) => {
    const { dryRun, planId, ...data } = params;
    if (!planId) throw new Error('planId 必填');
    const cur = await query('SELECT * FROM dr_daily_plans WHERE id=$1', [planId]);
    if (cur.rows.length === 0) throw new Error(`计划 ${planId} 不存在。请先调 queryPlans 查真实 ID。`);
    if (dryRun) {
      return { dryRun: true, planId, current: cur.rows[0], wouldUpdate: data, warning: 'dry-run，未实际修改' };
    }
    if (ctx?.permLevel === 'confirm') {
      return {
        dryRun: false,
        needsConfirm: true,
        pendingAction: { type: 'updatePlan', data: { planId, ...data } },
        summary: `完善计划: ${planId}`,
        message: '请用户点击 ✅ 授权卡片确认执行'
      };
    }
    const result = await executeAction({ type: 'updatePlan', data: { planId, ...data } }, ctx);
    return { dryRun: false, ...result, planId, inputData: data };
  }
  }
  ];

export async function executeTool(name, params, ctx) {
  const tool = TOOLS.find(t => t.name === name);
  if (!tool) throw new Error(`未知工具: ${name}`);
  const ctxSafe = { projectId: ctx?.projectId || 'baicaoyuan', date: ctx?.date || new Date().toISOString().slice(0, 10) };
  if (ctx?.permLevel) ctxSafe.permLevel = ctx.permLevel;
  return await tool.handler(params || {}, ctxSafe);
}

export function getToolDescriptions() {
  return TOOLS.map(t => {
    const paramStr = Object.entries(t.params).map(([k, v]) => `    ${k}: ${v}`).join('\n');
    return `- ${t.name}: ${t.description}\n${paramStr}`;
  }).join('\n\n');
}
