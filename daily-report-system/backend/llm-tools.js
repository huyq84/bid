// llm-tools.js - ReAct 循环用的查询工具集
import { query } from './db.js';

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
  }
];

export async function executeTool(name, params, ctx) {
  const tool = TOOLS.find(t => t.name === name);
  if (!tool) throw new Error(`未知工具: ${name}`);
  const ctxSafe = { projectId: ctx?.projectId || 'baicaoyuan', date: ctx?.date || new Date().toISOString().slice(0, 10) };
  return await tool.handler(params || {}, ctxSafe);
}

export function getToolDescriptions() {
  return TOOLS.map(t => {
    const paramStr = Object.entries(t.params).map(([k, v]) => `    ${k}: ${v}`).join('\n');
    return `- ${t.name}: ${t.description}\n${paramStr}`;
  }).join('\n\n');
}
