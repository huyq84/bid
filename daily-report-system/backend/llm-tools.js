// llm-tools.js - ReAct 循环用的查询工具集
import { query } from './db.js';
import { executeAction } from './chat-actions.js';

export const TOOLS = [
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
        planId: e.plan_id || '',
        taskName: e.payload?.taskName || '', owner: e.owner || e.payload?.owner || '',
        progress: e.payload?.progress || '', headcount: e.payload?.headcount || 0,
        laborRequirements: Array.isArray(e.payload?.laborRequirements) ? e.payload.laborRequirements : [],
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
          areaId: p.area_id || extra.areaId || '', areaName: extra.areaName || '',
          owner: p.owner || extra.owner || '', buildingNo: p.building_no || extra.buildingNo || '',
          floorNo: p.floor_no || extra.floorNo || '', totalManDays: p.total_man_days || 0,
          laborSchedule: Array.isArray(p.labor_schedule) ? p.labor_schedule : [],
          areaTargets: Array.isArray(p.area_targets) ? p.area_targets : [],
          type: p.type || extra.type || ''
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
  description: '创建一条施工日报事件。type + taskName 必填。areaId/planId/owner/progress/headcount 等可选。⚠️ 必须先调 queryPlans 确认 planId 真实存在。type 取值：progress/material/safety/coordination/attendance/drawing（不要用 issue，那属于协调事项）。',
  isMutate: true,
  requiresConfirm: false,  // safe action
  params: { dryRun: 'true=只返回将创建的数据', type: '事件类型：progress/material/safety/coordination/attendance/drawing', taskName: '任务名', areaId: '区域ID', areaName: '区域名（备用）', planId: '关联计划ID', owner: '负责人', progress: '进度%', headcount: '总人数', laborRequirements: '工种×人数', completionType: 'planned|unplanned', buildingNo: '楼栋', floorNo: '楼层', note: '备注/description', time: 'HH:MM 不传则用当前时间', source: 'voice|photo|manual|chat|auto，不传默认 chat' },
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
  description: '根据 eventId 修改一条事件。eventId 必填——必须先调 queryEvents 拿到真实 ID（不要编造）。可改 taskName/owner/progress/headcount/type/status/areaId/planId/completionType/buildingNo/floorNo/note/time/source。',
  isMutate: true,
  requiresConfirm: false,  // safe — 同 createEvent
  params: { dryRun: 'true=只返回将修改的内容', eventId: '事件ID（必填）', taskName: '任务名', owner: '负责人', progress: '进度%', headcount: '总人数', laborRequirements: '工种×人数', type: '事件类型', status: 'draft|confirmed', areaId: '区域ID', planId: '关联计划ID（先调 queryPlans 查真实 ID）', completionType: 'planned|unplanned', buildingNo: '楼栋', floorNo: '楼层', note: '备注/description', time: 'HH:MM', source: 'voice|photo|manual|chat|auto' },
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
  name: 'createIssue',
  description: '创建一条协调事项。title 必填。type（quality/safety/coordination/ecc/change/visa）等可选。⚠️ 不要用 type=issue（事件类型字段）。',
  isMutate: true,
  requiresConfirm: false,  // safe：与 SAFE_ACTIONS 一致
  params: { dryRun: 'true=只返回将创建的内容', title: '协调标题（必填）', type: '协调类型：quality/safety/coordination/ecc/change/visa', areaId: '区域ID', priority: 'low|medium|high', owner: '负责人', description: '描述', deadline: 'YYYY-MM-DD 截止日期', proposeDept: '发起方', cooperateDept: '配合方' },
  handler: async (params, ctx) => {
    const { dryRun, ...data } = params;
    if (!data.title) throw new Error('title 必填');
    if (dryRun) {
      return { dryRun: true, wouldCreate: { projectId: ctx.projectId, ...data }, warning: '这是 dry-run，未实际写入数据库' };
    }
    const result = await executeAction({ type: 'createIssue', data }, ctx);
    return { dryRun: false, ...result, inputData: data };
  }
  },

  {
  name: 'updateIssue',
  description: '修改协调事项。issueId 必填——必须先调 queryIssues 拿到真实 ID。可改 title/status/priority/owner/description/type/areaId/proposeDept/cooperateDept/deadline。',
  isMutate: true,
  requiresConfirm: true,  // sensitive
  params: { dryRun: 'true=只返回将修改的内容', issueId: '协调ID（必填）', title: '标题', status: 'open|in_progress|closed', priority: 'low|medium|high', owner: '负责人', description: '描述', type: '协调类型：quality/safety/coordination/ecc/change/visa', areaId: '区域ID', deadline: 'YYYY-MM-DD 截止日期', proposeDept: '发起方', cooperateDept: '配合方', resolution: '解决方案' },
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
  description: '完善计划字段。planId 必填——必须先调 queryPlans 拿到真实 ID。可改 areaId/type/owner/progress/buildingNo/floorNo/laborRequirements/taskName/status/description/process/totalManDays/materials/machinery/safetyNotes。',
  isMutate: true,
  requiresConfirm: true,  // sensitive
  params: { dryRun: 'true=只返回将完善的内容', planId: '计划ID（必填）', areaId: '区域ID', areaName: '区域名', type: '事件类型:progress|material|safety|coordination|attendance|drawing', owner: '负责人', progress: '进度%', buildingNo: '楼栋', floorNo: '楼层', laborRequirements: '工种×人数', taskName: '任务名', status: 'active|completed|paused', description: '描述', process: '工序', totalManDays: '总工日', materials: '材料清单（字符串数组）', machinery: '机械设备（字符串数组）', safetyNotes: '安全注意事项' },
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
  },

  // ========== 新增写入工具 ==========

  {
  name: 'createPlan',
  description: '创建新的施工计划。taskName 必填。可指定 date/startDate/endDate/areaId/type/owner/progress/buildingNo/floorNo/laborRequirements/description/process/totalManDays/materials/machinery/safetyNotes。⚠️ 日期必须在合理范围内。',
  isMutate: true,
  requiresConfirm: false,  // ✅ safe：与 systemMsg 一致；chat-actions.js 的 SENSITIVE_ACTIONS 也不含 createPlan
  params: { dryRun: 'true=只返回将创建的内容', taskName: '任务名（必填）', date: 'YYYY-MM-DD，计划执行日期', startDate: '开始日期', endDate: '结束日期', areaId: '区域ID', areaName: '区域名', type: '事件类型:progress|material|safety|coordination|attendance|drawing', owner: '负责人', progress: '进度%', buildingNo: '楼栋', floorNo: '楼层', laborRequirements: '工种×人数', status: 'active|completed|paused', description: '描述', process: '工序', totalManDays: '总工日', materials: '材料清单（字符串数组）', machinery: '机械设备（字符串数组）', safetyNotes: '安全注意事项' },
  handler: async (params, ctx) => {
    const { dryRun, taskName, ...data } = params;
    if (!taskName) throw new Error('taskName 必填');
    const planId = 'P' + Date.now();
    const id = data.id || planId;
    const projectId = ctx.projectId || 'baicaoyuan';
    if (dryRun) {
      return { dryRun: true, wouldCreate: { id, projectId, taskName, ...data }, warning: '这是 dry-run，未实际写入数据库' };
    }
    const result = await executeAction({ type: 'createPlan', data: { id, projectId, taskName, ...data } }, ctx);
    return { dryRun: false, ...result, id, taskName, inputData: { id, projectId, taskName, ...data } };
  }
  },

  {
  name: 'deletePlan',
  description: '⚠️ 物理删除单条计划。planId 必填——必须先调 queryPlans 拿到真实 ID。删除后不可恢复（DB 真的删，不只是前端隐藏）。',
  isMutate: true,
  requiresConfirm: true,  // sensitive：物理删除
  params: { dryRun: 'true=只返回将被删除的计划', planId: '计划ID（必填）' },
  handler: async (params, ctx) => {
    const { dryRun, planId } = params;
    if (!planId) throw new Error('planId 必填');
    const cur = await query('SELECT id, task_name, start_date, end_date, status FROM dr_daily_plans WHERE id=$1', [planId]);
    if (cur.rows.length === 0) throw new Error(`计划 ${planId} 不存在。请先调 queryPlans 查真实 ID。`);
    if (dryRun) {
      return { dryRun: true, planId, current: cur.rows[0], warning: 'dry-run，未实际删除' };
    }
    if (ctx?.permLevel === 'confirm') {
      return {
        dryRun: false,
        needsConfirm: true,
        pendingAction: { type: 'deletePlan', data: { planId } },
        summary: `删除计划: ${cur.rows[0].task_name} (${planId})`,
        message: '请用户点击 ✅ 授权卡片确认执行'
      };
    }
    await query('DELETE FROM dr_daily_plans WHERE id=$1', [planId]);
    return { dryRun: false, ok: true, data: { planId, deletedTaskName: cur.rows[0].task_name }, planId, message: `已删除计划: ${cur.rows[0].task_name}` };
  }
  },

  {
  name: 'deletePlansByQuery',
  description: '⚠️ 危险操作！按条件批量删除计划。必填：date（限定到某一天）+ 至少一个其他条件（status/areaId/owner/taskNameContains/ids）。先 dryRun=true 看会被删哪些，确认后 dryRun=false + forceDelete=true 真删。',
  isMutate: true,
  requiresConfirm: true,  // sensitive
  params: {
    dryRun: 'true=只列出将被删除的计划',
    forceDelete: 'true=真删（需要 dryRun=false）',
    date: 'YYYY-MM-DD 必填（限定范围，可与 startDate/endDate 之一配合）',
    startDate: 'YYYY-MM-DD 起始日（含），可与 date 互斥',
    endDate: 'YYYY-MM-DD 结束日（含），可与 date 互斥',
    status: 'active|completed|paused|cancelled',
    areaId: '区域ID',
    owner: '负责人（模糊匹配）',
    taskNameContains: '任务名关键词（模糊匹配）',
    ids: '显式 planId 列表（数组）',
    confirmConditions: '中文描述"要删什么"，给用户看'
  },
  handler: async (params, ctx) => {
    const { dryRun, forceDelete, ids, taskNameContains, date, startDate, endDate, ...rest } = params;

    // 1) 至少一个筛选条件
    if (!ids && !date && !startDate && !endDate && !taskNameContains && !rest.areaId && !rest.status && !rest.owner) {
      throw new Error('deletePlansByQuery 至少需要一个筛选条件（ids/date/startDate/endDate/areaId/status/owner/taskNameContains）');
    }

    // 2) 拼 SQL
    const conds = ['1=1'];
    const vals = [];
    let i = 1;
    if (ids && Array.isArray(ids) && ids.length > 0) {
      conds.push(`id = ANY($${i++}::text[])`);
      vals.push(ids);
    }
    if (date) { conds.push(`(start_date <= $${i} AND end_date >= $${i})`); vals.push(date); i++; }
    if (startDate) { conds.push(`end_date >= $${i++}`); vals.push(startDate); }
    if (endDate) { conds.push(`start_date <= $${i++}`); vals.push(endDate); }
    if (rest.areaId) {
      const i1 = i++;
      const i2 = i++;
      conds.push(`(extra->>'areaId' = $${i1} OR area_targets @> $${i2}::jsonb)`);
      vals.push(rest.areaId);
      vals.push(JSON.stringify([{areaId: rest.areaId}]));
    }
    // ✅ owner 在 createPlan 路径只写 extra->>'owner'（顶层 owner 列为 null），所以同时查
    if (rest.status) { conds.push(`status = $${i++}`); vals.push(rest.status); }
    if (rest.owner) {
      const i1 = i++;
      const i2 = i++;
      conds.push(`(owner = $${i1} OR extra->>'owner' = $${i2})`);
      vals.push(rest.owner);
      vals.push(rest.owner);
    }
    if (taskNameContains) { conds.push(`task_name ILIKE $${i++}`); vals.push(`%${taskNameContains}%`); }

    const sql = `SELECT id, task_name, start_date, end_date, status FROM dr_daily_plans WHERE ${conds.join(' AND ')} ORDER BY start_date LIMIT 200`;
    const cur = await query(sql, vals);
    const wouldDelete = cur.rows;

    if (dryRun) {
      return {
        dryRun: true,
        matchCount: wouldDelete.length,
        plans: wouldDelete,
        warning: `将删除 ${wouldDelete.length} 条计划。要真删请传 dryRun=false + forceDelete=true`
      };
    }

    if (!forceDelete) {
      throw new Error('批量删除需要 forceDelete=true。安全起见，必须二次确认。');
    }

    if (ctx?.permLevel === 'confirm') {
      return {
        dryRun: false,
        needsConfirm: true,
        pendingAction: { type: 'deletePlansByQuery', data: { ids: wouldDelete.map(p => p.id), confirmConditions: rest.confirmConditions } },
        summary: `批量删除 ${wouldDelete.length} 条计划`,
        message: '请用户点击 ✅ 授权卡片确认执行'
      };
    }

    // 3) 真删
    const idsToDelete = wouldDelete.map(p => p.id);
    await query('DELETE FROM dr_daily_plans WHERE id = ANY($1::text[])', [idsToDelete]);
    return { dryRun: false, ok: true, data: { deletedIds: idsToDelete, count: idsToDelete.length }, deletedCount: idsToDelete.length, message: `已删除 ${idsToDelete.length} 条计划` };
  }
  },

  {
  name: 'deleteIssue',
  description: '⚠️ 删除协调事项。issueId 必填——必须先调 queryIssues 拿到真实 ID。删除后不可恢复。',
  isMutate: true,
  requiresConfirm: true,
  params: { dryRun: 'true=只列出将被删除的协调', issueId: '协调ID（必填）' },
  handler: async (params, ctx) => {
    const { dryRun, issueId } = params;
    if (!issueId) throw new Error('issueId 必填');
    if (dryRun) {
      const cur = await query('SELECT * FROM dr_issues WHERE id=$1', [issueId]);
      if (cur.rows.length === 0) throw new Error(`协调 ${issueId} 不存在`);
      return { dryRun: true, issueId, current: cur.rows[0], warning: 'dry-run，未实际删除' };
    }
    const result = await executeAction({ type: 'deleteIssue', data: { issueId } }, ctx);
    return { ...result, issueId };
  }
  },

  {
  name: 'deleteEvent',
  description: '⚠️ 删除单条事件。eventId 必填——必须先调 queryEvents 拿到真实 ID。删除后不可恢复。',
  isMutate: true,
  requiresConfirm: true,
  params: { dryRun: 'true=只列出将被删除的事件', eventId: '事件ID（必填）' },
  handler: async (params, ctx) => {
    const { dryRun, eventId } = params;
    if (!eventId) throw new Error('eventId 必填');
    if (dryRun) {
      const cur = await query('SELECT * FROM dr_events WHERE id=$1', [eventId]);
      if (cur.rows.length === 0) throw new Error(`事件 ${eventId} 不存在`);
      return { dryRun: true, eventId, current: cur.rows[0], warning: 'dry-run，未实际删除' };
    }
    const result = await executeAction({ type: 'deleteEvent', data: { eventId } }, ctx);
    return { ...result, eventId };
  }
  },

  {
  name: 'confirmEvent',
  description: '确认事件（将 status 改为 confirmed）。eventId 必填——必须先调 queryEvents 拿到真实 ID。',
  isMutate: true,
  requiresConfirm: false,
  params: { dryRun: 'true=只返回将确认的事件', eventId: '事件ID（必填）' },
  handler: async (params, ctx) => {
    const { dryRun, eventId } = params;
    if (!eventId) throw new Error('eventId 必填');
    if (dryRun) {
      const cur = await query('SELECT * FROM dr_events WHERE id=$1', [eventId]);
      if (cur.rows.length === 0) throw new Error(`事件 ${eventId} 不存在`);
      return { dryRun: true, eventId, current: cur.rows[0], warning: 'dry-run，未实际确认' };
    }
    const result = await executeAction({ type: 'confirmEvent', data: { eventId } }, ctx);
    return { ...result, eventId };
  }
  },

  {
  name: 'createECC',
  description: '创建 ECC（工程变更指令）项。title 必填。可指定 areaId/discoveredDate/status/closedDate/photos。',
  isMutate: true,
  requiresConfirm: true,
  params: { dryRun: 'true=只返回将创建的内容', title: 'ECC 标题（必填）', areaId: '区域ID', discoveredDate: '发现日期 YYYY-MM-DD', status: 'open|closed|closing', closedDate: '关闭日期 YYYY-MM-DD', photos: '照片数组' },
  handler: async (params, ctx) => {
    const { dryRun, title, ...data } = params;
    if (!title) throw new Error('title 必填');
    const id = 'ECC' + Date.now();
    const projectId = ctx.projectId || 'baicaoyuan';
    if (dryRun) {
      return { dryRun: true, wouldCreate: { id, projectId, title, ...data }, warning: '这是 dry-run，未实际写入数据库' };
    }
    const isClosed = data.status === 'closed';
    await query(
      `INSERT INTO dr_ecc_items (id, project_id, title, area_id, discovered_date, status, closed_date, photos)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb) ON CONFLICT (id) DO UPDATE
       SET title=EXCLUDED.title, area_id=EXCLUDED.area_id, discovered_date=EXCLUDED.discovered_date,
           status=EXCLUDED.status, closed_date=EXCLUDED.closed_date, photos=EXCLUDED.photos`,
      [id, projectId, title, data.areaId || null, data.discoveredDate || ctx.date, data.status || 'open',
       isClosed ? (data.closedDate || ctx.date) : null, JSON.stringify(data.photos || [])]
    );
    return { id, title, message: `已创建 ECC: ${title}` };
  }
  },

  {
  name: 'closeECC',
  description: '关闭 ECC 项。eccId 必填——必须先调 queryECC 拿到真实 ID。',
  isMutate: true,
  requiresConfirm: true,
  params: { dryRun: 'true=只返回将关闭的 ECC', eccId: 'ECC ID（必填）', resolution: '关闭说明' },
  handler: async (params, ctx) => {
    const { dryRun, eccId, ...data } = params;
    if (!eccId) throw new Error('eccId 必填');
    if (dryRun) {
      const cur = await query('SELECT * FROM dr_ecc_items WHERE id=$1', [eccId]);
      if (cur.rows.length === 0) throw new Error(`ECC ${eccId} 不存在`);
      return { dryRun: true, eccId, current: cur.rows[0], warning: 'dry-run，未实际关闭' };
    }
    await query(`UPDATE dr_ecc_items SET status='closed', closed_date=$1 WHERE id=$2`, [ctx.date, eccId]);
    return { eccId, message: `已关闭 ECC ${eccId}` };
  }
  },

  {
  name: 'deleteECC',
  description: '⚠️ 删除 ECC 项。eccId 必填。删除后不可恢复。',
  isMutate: true,
  requiresConfirm: true,
  params: { dryRun: 'true=只列出将被删除的 ECC', eccId: 'ECC ID（必填）' },
  handler: async (params, ctx) => {
    const { dryRun, eccId } = params;
    if (!eccId) throw new Error('eccId 必填');
    if (dryRun) {
      const cur = await query('SELECT * FROM dr_ecc_items WHERE id=$1', [eccId]);
      if (cur.rows.length === 0) throw new Error(`ECC ${eccId} 不存在`);
      return { dryRun: true, eccId, current: cur.rows[0], warning: 'dry-run，未实际删除' };
    }
    await query('DELETE FROM dr_ecc_items WHERE id=$1', [eccId]);
    return { eccId, message: `已删除 ECC ${eccId}` };
  }
  },

  {
  name: 'createDrawing',
  description: '创建图纸深化记录。task 必填。可指定 owner/status/areaId/planId/progress/eventId。',
  isMutate: true,
  requiresConfirm: true,
  params: { dryRun: 'true=只返回将创建的内容', task: '深化任务（必填）', owner: '负责人', status: '待开始|进行中|已完成', areaId: '区域ID', planId: '关联计划ID', progress: '进度%', eventId: '关联事件ID' },
  handler: async (params, ctx) => {
    const { dryRun, task, ...data } = params;
    if (!task) throw new Error('task 必填');
    const id = 'DD' + Date.now();
    const projectId = ctx.projectId || 'baicaoyuan';
    if (dryRun) {
      return { dryRun: true, wouldCreate: { id, projectId, task, ...data }, warning: '这是 dry-run，未实际写入数据库' };
    }
    await query(
      `INSERT INTO dr_drawing_deepenings (id, project_id, task, owner, status, plan_id, area_id, created_date, progress, event_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (id) DO UPDATE
       SET task=EXCLUDED.task, owner=EXCLUDED.owner, status=EXCLUDED.status,
           plan_id=EXCLUDED.plan_id, area_id=EXCLUDED.area_id,
           progress=EXCLUDED.progress, event_id=EXCLUDED.event_id`,
      [id, projectId, task, data.owner || null, data.status || '进行中', data.planId || null,
       data.areaId || null, ctx.date, data.progress || null, data.eventId || null]
    );
    return { id, task, message: `已创建图纸深化: ${task}` };
  }
  },

  {
  name: 'createAttendance',
  description: '批量录入管理人员签到。records 必填——对象格式 {managerId: {present: true/false, reason: "请假"}}。',
  isMutate: true,
  requiresConfirm: false,
  params: { dryRun: 'true=只返回将签到的数据', date: 'YYYY-MM-DD，默认今日', records: '{managerId: {present: true/false, reason: ""}}' },
  handler: async (params, ctx) => {
    const { dryRun, ...data } = params;
    const records = data.records;
    const date = data.date || ctx.date;
    const projectId = ctx.projectId || 'baicaoyuan';
    if (!records || Object.keys(records).length === 0) throw new Error('records 必填');
    if (dryRun) {
      return { dryRun: true, date, records, warning: '这是 dry-run，未实际签到' };
    }
    const count = Object.keys(records).length;
    for (const [managerId, rec] of Object.entries(records)) {
      await query(
        `INSERT INTO dr_daily_attendance (date, project_id, manager_id, present, reason)
         VALUES ($1,$2,$3,$4,$5) ON CONFLICT (date, project_id, manager_id) DO UPDATE
         SET present=EXCLUDED.present, reason=EXCLUDED.reason`,
        [date, projectId, managerId, rec.present || true, rec.reason || '']
      );
    }
    return { date, count, message: `已签到 ${count} 人` };
  }
  },

  {
  name: 'createArea',
  description: '创建项目区域。projectId 和 id 必填，name 为区域名称。',
  isMutate: true,
  requiresConfirm: true,
  params: { dryRun: 'true=只返回将创建的区域', projectId: '项目ID（必填）', id: '区域ID（必填）', name: '区域名称', floor: '楼层', manager: '负责人' },
  handler: async (params, ctx) => {
    const { dryRun, projectId, id, ...data } = params;
    if (!projectId || !id) throw new Error('projectId 和 id 必填');
    if (dryRun) {
      return { dryRun: true, projectId, id, name: data.name, warning: '这是 dry-run，未实际写入数据库' };
    }
    await query(
      `INSERT INTO dr_areas (project_id, id, name, floor, manager) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (project_id, id) DO UPDATE SET name=$3, floor=$4, manager=$5`,
      [projectId, id, data.name || '', data.floor || '', data.manager || '']
    );
    return { projectId, id, name: data.name, message: `已创建区域: ${data.name}` };
  }
  },

  {
  name: 'deleteArea',
  description: '⚠️ 删除项目区域。projectId 和 id 必填。删除后区域下的事件将失去关联。',
  isMutate: true,
  requiresConfirm: true,
  params: { dryRun: 'true=只检查区域是否存在', projectId: '项目ID（必填）', id: '区域ID（必填）' },
  handler: async (params, ctx) => {
    const { dryRun, projectId, id } = params;
    if (!projectId || !id) throw new Error('projectId 和 id 必填');
    if (dryRun) {
      const cur = await query('SELECT * FROM dr_areas WHERE project_id=$1 AND id=$2', [projectId, id]);
      if (cur.rows.length === 0) throw new Error(`区域 ${projectId}/${id} 不存在`);
      return { dryRun: true, projectId, id, current: cur.rows[0], warning: 'dry-run，未实际删除' };
    }
    await query('DELETE FROM dr_areas WHERE project_id=$1 AND id=$2', [projectId, id]);
    return { projectId, id, message: `已删除区域 ${id}` };
  }
  },

  {
  name: 'createStandardTrade',
  description: '创建标准工种模板。tradeName 必填。可指定 mapFrom（映射来源）和 sortOrder（排序）。',
  isMutate: true,
  requiresConfirm: true,
  params: { dryRun: 'true=只返回将创建的工种', tradeName: '工种名称（必填）', mapFrom: '映射来源', sortOrder: '排序号' },
  handler: async (params, ctx) => {
    const { dryRun, tradeName, ...data } = params;
    if (!tradeName) throw new Error('tradeName 必填');
    if (dryRun) {
      return { dryRun: true, tradeName, warning: '这是 dry-run，未实际写入数据库' };
    }
    const r = await query(
      `INSERT INTO dr_standard_trades (project_id, trade_name, map_from, sort_order) VALUES ($1, $2, $3, $4) RETURNING id`,
      [ctx.projectId || null, tradeName, data.mapFrom || null, data.sortOrder || 0]
    );
    return { id: r.rows[0].id, tradeName, message: `已创建标准工种: ${tradeName}` };
  }
  },

  {
  name: 'deleteStandardTrade',
  description: '⚠️ 删除标准工种模板。tradeId 必填。',
  isMutate: true,
  requiresConfirm: true,
  params: { dryRun: 'true=只检查工种是否存在', tradeId: '工种ID（必填）' },
  handler: async (params, ctx) => {
    const { dryRun, tradeId } = params;
    if (!tradeId) throw new Error('tradeId 必填');
    if (dryRun) {
      const cur = await query('SELECT * FROM dr_standard_trades WHERE id=$1', [tradeId]);
      if (cur.rows.length === 0) throw new Error(`工种 ${tradeId} 不存在`);
      return { dryRun: true, tradeId, current: cur.rows[0], warning: 'dry-run，未实际删除' };
    }
    await query('DELETE FROM dr_standard_trades WHERE id=$1', [tradeId]);
    return { tradeId, message: `已删除标准工种` };
  }
  },

  {
  name: 'createManagement',
  description: '创建/更新管理层团队成员。position 和 name 必填。',
  isMutate: true,
  requiresConfirm: true,
  params: { dryRun: 'true=只返回将创建的信息', position: '职位（必填）', name: '姓名（必填）', phone: '电话', id: '自定义ID' },
  handler: async (params, ctx) => {
    const { dryRun, position, name, ...data } = params;
    if (!position || !name) throw new Error('position 和 name 必填');
    const id = data.id || `M${Date.now()}`;
    if (dryRun) {
      return { dryRun: true, id, position, name, warning: '这是 dry-run，未实际写入数据库' };
    }
    await query(
      `INSERT INTO dr_management_team (id, position, name, phone) VALUES ($1,$2,$3,$4)
       ON CONFLICT (id) DO UPDATE SET position=$2, name=$3, phone=$4`,
      [id, position, name, data.phone || '']
    );
    return { id, position, name, message: `已创建管理层成员: ${name}` };
  }
  },

  {
  name: 'createGanttItem',
  description: '创建甘特图任务项。area 和 task 必填。可指定 durationDays/schedule/labor/material/areaOrder/seq。',
  isMutate: true,
  requiresConfirm: true,
  params: { dryRun: 'true=只返回将创建的任务', area: '区域名称（必填）', task: '任务描述（必填）', durationDays: '持续天数', schedule: '日期列表', labor: '劳动力需求', material: '材料需求', areaOrder: '区域排序（数字）', seq: '任务序号（数字）' },
  handler: async (params, ctx) => {
    const { dryRun, area, task, ...data } = params;
    if (!area || !task) throw new Error('area 和 task 必填');
    const id = 'G' + Date.now();
    if (dryRun) {
      return { dryRun: true, id, area, task, warning: '这是 dry-run，未实际写入数据库' };
    }
    await query(
      `INSERT INTO dr_weekly_gantt_items (id, area, area_order, seq, task, duration_days, schedule, labor, material)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9)`,
      [id, area, data.areaOrder || 0, data.seq || 1, task, data.durationDays || 1,
       JSON.stringify(data.schedule || []), data.labor || '', data.material || '']
    );
    return { id, area, task, message: `已创建甘特任务: ${task}` };
  }
  },

  {
  name: 'createMilestone',
  description: '创建里程碑节点。category 和 description 必填。可指定 nodeType/areaLabel/targetMonth。',
  isMutate: true,
  requiresConfirm: true,
  params: { dryRun: 'true=只返回将创建的里程碑', category: '类别（必填）', nodeType: '节点类型', areaLabel: '区域标签', description: '描述（必填）', targetMonth: '目标月份', year: '年份' },
  handler: async (params, ctx) => {
    const { dryRun, category, description, ...data } = params;
    if (!category || !description) throw new Error('category 和 description 必填');
    const id = data.id || `MS${Date.now()}`;
    if (dryRun) {
      return { dryRun: true, id, category, description, warning: '这是 dry-run，未实际写入数据库' };
    }
    await query(
      `INSERT INTO dr_milestone_plans (project_id, id, category, node_type, area_label, description, target_month, year, sub_items)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb) ON CONFLICT (project_id, id) DO UPDATE
       SET category=$3, node_type=$4, area_label=$5, description=$6, target_month=$7, year=$8`,
      [ctx.projectId || 'baicaoyuan', id, category, data.nodeType || '', data.areaLabel || '', description, data.targetMonth || '', data.year || 2026, '[]']
    );
    return { id, category, description, message: `已创建里程碑: ${description}` };
  }
  },

  {
  name: 'updateWeeklyLabor',
  description: '批量更新周劳动力数据。rows 必填——数组格式 [{weekStart, tradeId, thisWeekCount, nextWeekCount}]。',
  isMutate: true,
  requiresConfirm: true,
  params: { dryRun: 'true=只返回将更新的内容', rows: '[{weekStart, tradeId, thisWeekCount, nextWeekCount}]' },
  handler: async (params, ctx) => {
    const { dryRun, rows } = params;
    if (!rows || !Array.isArray(rows)) throw new Error('rows 必填');
    if (dryRun) {
      return { dryRun: true, rows, warning: '这是 dry-run，未实际写入数据库' };
    }
    for (const r of rows) {
      if (!r.weekStart || !r.tradeId) continue;
      await query(
        `INSERT INTO dr_weekly_labor_data (project_id, week_start, trade_id, this_week_count, next_week_count, updated_at)
         VALUES ($1,$2,$3,$4,$5, now()) ON CONFLICT (project_id, week_start, trade_id) DO UPDATE
         SET this_week_count=$4, next_week_count=$5, updated_at=now()`,
        [ctx.projectId || 'baicaoyuan', r.weekStart, parseInt(r.tradeId), parseInt(r.thisWeekCount)||0, parseInt(r.nextWeekCount)||0]
      );
    }
    return { count: rows.length, message: `已更新 ${rows.length} 条劳动力数据` };
  }
  },

  {
  name: 'createConstructionZone',
  description: '创建施工段排期。building 和 process 必填。可指定 location/floors。',
  isMutate: true,
  requiresConfirm: true,
  params: { dryRun: 'true=只返回将创建的施工段', building: '楼栋（必填）', process: '工序（必填）', location: '位置', floors: '楼层列表' },
  handler: async (params, ctx) => {
    const { dryRun, building, process, ...data } = params;
    if (!building || !process) throw new Error('building 和 process 必填');
    const id = 'CZ' + Date.now();
    if (dryRun) {
      return { dryRun: true, id, building, process, warning: '这是 dry-run，未实际写入数据库' };
    }
    await query(
      `INSERT INTO dr_construction_zone_schedules (id, building, location, process, floors) VALUES ($1,$2,$3,$4,$5::jsonb)`,
      [id, building, data.location || '', process, JSON.stringify(data.floors || [])]
    );
    return { id, building, process, message: `已创建施工段: ${building} - ${process}` };
  }
  },

  // ========== 新增查询工具 ==========

  {
  name: 'queryECC',
  description: '查询 ECC（工程变更指令）项。可按时 status/type/areaId 筛选',
  params: { status: 'open|closed|closing', type: 'ECC 类型', areaId: '区域ID', limit: '最多返回条数' },
  handler: async (params, ctx) => {
    const conds = ['project_id=$1'];
    const vals = [ctx.projectId || 'baicaoyuan'];
    let i = 2;
    if (params.status) { conds.push(`status=$${i++}`); vals.push(params.status); }
    if (params.areaId) { conds.push(`area_id=$${i++}`); vals.push(params.areaId); }
    const limit = params.limit || 50;
    const r = await query(`SELECT * FROM dr_ecc_items WHERE ${conds.join(' AND ')} ORDER BY discovered_date DESC LIMIT ${limit}`, vals);
    return r.rows.map(e => ({
      id: e.id, title: e.title, areaId: e.area_id, discoveredDate: e.discovered_date, status: e.status, closedDate: e.closed_date, photos: e.photos || []
    }));
  }
  },

  {
  name: 'queryGantt',
  description: '查询甘特图任务项。可按时 area/task 筛选',
  params: { area: '区域名称', limit: '最多返回条数' },
  handler: async (params, ctx) => {
    const conds = ['1=1'];
    const vals = [];
    let i = 1;
    if (params.area) { conds.push(`area ILIKE $${i++}`); vals.push(`%${params.area}%`); }
    const limit = params.limit || 100;
    const r = await query(`SELECT * FROM dr_weekly_gantt_items WHERE ${conds.join(' AND ')} ORDER BY area_order, seq LIMIT ${limit}`, vals);
    return r.rows.map(g => ({
      id: g.id, area: g.area, task: g.task, durationDays: g.duration_days, schedule: g.schedule || [], labor: g.labor, material: g.material, areaOrder: g.area_order, seq: g.seq
    }));
  }
  },

  {
  name: 'queryMilestone',
  description: '查询里程碑节点。可按时 category/nodeType 筛选',
  params: { category: '类别', nodeType: '节点类型', limit: '最多返回条数' },
  handler: async (params, ctx) => {
    const conds = ['project_id=$1'];
    const vals = [ctx.projectId || 'baicaoyuan'];
    let i = 2;
    if (params.category) { conds.push(`category=$${i++}`); vals.push(params.category); }
    if (params.nodeType) { conds.push(`node_type=$${i++}`); vals.push(params.nodeType); }
    const limit = params.limit || 50;
    const r = await query(`SELECT * FROM dr_milestone_plans WHERE ${conds.join(' AND ')} ORDER BY id LIMIT ${limit}`, vals);
    return r.rows.map(m => ({
      id: m.id, category: m.category, nodeType: m.node_type, areaLabel: m.area_label, description: m.description, targetMonth: m.target_month, year: m.year
    }));
  }
  },

  {
  name: 'queryManagement',
  description: '查询管理层团队成员',
  params: {},
  handler: async (params, ctx) => {
    const r = await query('SELECT * FROM dr_management_team ORDER BY position');
    return r.rows.map(m => ({
      id: m.id, position: m.position, name: m.name, phone: m.phone
    }));
  }
  },

  {
  name: 'queryStandardTrade',
  description: '查询标准工种模板',
  params: { projectId: '项目ID（可选）' },
  handler: async (params, ctx) => {
    const r = await query('SELECT * FROM dr_standard_trades ORDER BY project_id NULLS FIRST, sort_order');
    return r.rows.map(s => ({
      id: s.id, projectId: s.project_id, tradeName: s.trade_name, mapFrom: s.map_from, sortOrder: s.sort_order
    }));
  }
  },

  {
  name: 'queryWeeklyLabor',
  description: '查询周劳动力数据。weekStart 必填',
  params: { weekStart: 'YYYY-MM-DD，必填' },
  handler: async (params, ctx) => {
    if (!params.weekStart) throw new Error('weekStart 必填');
    const r = await query(
      `SELECT * FROM dr_weekly_labor_data WHERE project_id=$1 AND week_start=$2 ORDER BY trade_id`,
      [ctx.projectId || 'baicaoyuan', params.weekStart]
    );
    return r.rows.map(row => ({
      id: row.id, weekStart: row.week_start, tradeId: row.trade_id, thisWeekCount: row.this_week_count, nextWeekCount: row.next_week_count
    }));
  }
  },

  {
  name: 'queryDrawing',
  description: '查询图纸深化记录。可按时 status/areaId 筛选',
  params: { status: '待开始|进行中|已完成', areaId: '区域ID', limit: '最多返回条数' },
  handler: async (params, ctx) => {
    const conds = ['project_id=$1'];
    const vals = [ctx.projectId || 'baicaoyuan'];
    let i = 2;
    if (params.status) { conds.push(`status=$${i++}`); vals.push(params.status); }
    if (params.areaId) { conds.push(`area_id=$${i++}`); vals.push(params.areaId); }
    const limit = params.limit || 50;
    const r = await query(`SELECT * FROM dr_drawing_deepenings WHERE ${conds.join(' AND ')} ORDER BY created_date DESC LIMIT ${limit}`, vals);
    return r.rows.map(d => ({
      id: d.id, task: d.task, owner: d.owner, status: d.status, areaId: d.area_id, planId: d.plan_id, progress: d.progress, createdDate: d.created_date
    }));
  }
  },

  {
  name: 'queryAttendance',
  description: '查询签到历史。date 必填',
  params: { date: 'YYYY-MM-DD，必填' },
  handler: async (params, ctx) => {
    if (!params.date) throw new Error('date 必填');
    const r = await query(
      `SELECT * FROM dr_daily_attendance WHERE project_id=$1 AND date=$2 ORDER BY manager_id`,
      [ctx.projectId || 'baicaoyuan', params.date]
    );
    return r.rows.map(a => ({
      date: a.date, managerId: a.manager_id, present: a.present, reason: a.reason
    }));
  }
  },

  {
  name: 'queryPhoto',
  description: '查询照片记录。可按时 projectId/type 筛选',
  params: { projectId: '项目ID', type: 'page03|page06', limit: '最多返回条数' },
  handler: async (params, ctx) => {
    const conds = ['1=1'];
    const vals = [];
    let i = 1;
    if (params.projectId) { conds.push(`project_id=$${i++}`); vals.push(params.projectId); }
    const limit = params.limit || 50;
    // 合并 page03 和 page06 的照片
    const r = await query(`SELECT * FROM dr_page06_photos WHERE ${conds.join(' AND ')} ORDER BY created_at DESC LIMIT ${limit}`, vals);
    return r.rows.map(p => ({
      id: p.id, projectId: p.project_id, src: p.src, caption: p.caption || '', tradeId: p.trade_id
    }));
  }
  },

  {
  name: 'queryConstructionZone',
  description: '查询施工段排期',
  params: { building: '楼栋关键词', limit: '最多返回条数' },
  handler: async (params, ctx) => {
    const conds = ['1=1'];
    const vals = [];
    let i = 1;
    if (params.building) { conds.push(`building ILIKE $${i++}`); vals.push(`%${params.building}%`); }
    const limit = params.limit || 50;
    const r = await query(`SELECT * FROM dr_construction_zone_schedules WHERE ${conds.join(' AND ')} LIMIT ${limit}`, vals);
    return r.rows.map(z => ({
      id: z.id, building: z.building, location: z.location, process: z.process, floors: z.floors || []
    }));
  }
  },

  {
  name: 'queryECCSummary',
  description: '查询 ECC 汇总统计（按项目）',
  params: { projectId: '项目ID（可选）' },
  handler: async (params, ctx) => {
    const pid = params.projectId || ctx.projectId || 'baicaoyuan';
    const r = await query('SELECT * FROM dr_ecc_summaries WHERE project_id=$1', [pid]);
    return r.rows.map(s => ({
      projectId: s.project_id, total: s.total, closed: s.closed, closing: s.closing, open: s.open, rate: s.rate
    }));
  }
  },

  {
  name: 'queryAreas',
  description: '查询项目区域列表。可按时 projectId 筛选',
  params: { projectId: '项目ID（可选，默认 baicaoyuan）' },
  handler: async (params, ctx) => {
    const pid = params.projectId || ctx.projectId || 'baicaoyuan';
    const r = await query('SELECT * FROM dr_areas WHERE project_id=$1 ORDER BY id', [pid]);
    return r.rows.map(a => ({
      id: a.id, name: a.name, floor: a.floor, manager: a.manager
    }));
  }
  },

  {
  name: 'queryWorkers',
  description: '查询工人列表',
  params: {},
  handler: async (params, ctx) => {
    const r = await query('SELECT * FROM dr_workers ORDER BY id');
    return r.rows.map(w => ({
      id: w.id, name: w.name, role: w.role, team: w.team, phone: w.phone
    }));
  }
  },

  {
  name: 'queryProjects',
  description: '查询所有项目',
  params: {},
  handler: async (params, ctx) => {
    const r = await query('SELECT * FROM dr_projects ORDER BY id');
    return r.rows.map(p => ({
      id: p.id, name: p.name, client: p.client, location: p.location, color: p.color, enabledFields: p.enabled_fields || []
    }));
  }
  },

  {
  name: 'triggerInspection',
  description: '触发系统巡检，检查今日/本周数据中的问题（未填报计划、进度异常、协调超期等）并生成提醒',
  params: { projectId: '项目ID，默认baicaoyuan', date: '日期，默认今日', scope: 'all=全量检查 | plans=仅检查计划 | issues=仅检查事项 | attendance=仅检查考勤' },
  handler: async (params, ctx) => {
    const { projectId, date, scope } = params;
    const pid = projectId || ctx.projectId || 'baicaoyuan';
    const d = date || new Date().toISOString().slice(0, 10);
    
    // 动态导入inspection-engine
    const { dailyInspection } = await import('./inspection-engine.js');
    const reminders = await dailyInspection(pid, d);
    
    return {
      date: d,
      projectId: pid,
      reminderCount: reminders.length,
      reminders: reminders.map(r => ({
        type: r.type,
        priority: r.priority,
        title: r.title,
        message: r.message
      })),
      message: `巡检完成，发现 ${reminders.length} 条提醒`
    };
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
