// chat-actions.js - LLM 返回的 action 的执行器
import { query } from './db.js';
import { validateEventData, validatePlanData, validateIssueId } from './llm-validator.js';

function nowHHMM() {
  const d = new Date();
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

function newId(prefix) {
  return prefix + String(Date.now()).slice(-6) + Math.floor(Math.random() * 100);
}

/**
 * 执行一个 action
 * @param {Object} action - { type, data }
 * @param {Object} ctx - { projectId, date }
 * @returns {Object} 执行结果 { ok, data, message }
 */
export async function executeAction(action, ctx) {
  const handler = handlers[action.type];
  if (!handler) {
    return { ok: false, error: `不支持的操作类型: ${action.type}` };
  }
  // 敏感操作的权限检查（仅在非 allow 模式下生效）
  if (SENSITIVE_ACTIONS.has(action.type) && ctx?.permLevel === 'strict') {
    return {
      ok: false,
      error: `当前权限=strict，禁止 ${action.type} 这类敏感操作`,
      needsConfirm: false,
      blocked: true
    };
  }
  try {
    const result = await handler(action.data, ctx);
    return { ok: true, data: result, message: result.message || '已执行' };
  } catch (e) {
    console.error(`[chat-action] ${action.type} 失败:`, e);
    return { ok: false, error: e.message };
  }
}

// 安全操作（自动执行） vs 敏感操作（需授权）
export const SAFE_ACTIONS = new Set(['createEvent', 'createIssue', 'createPlan', 'createAttendance', 'confirmEvent', 'openWeeklyReport']);
export const SENSITIVE_ACTIONS = new Set(['updateEvent', 'deleteEvent', 'batchDelete', 'updateIssue', 'closeIssue', 'deleteIssue', 'updatePlan', 'deletePlan', 'deleteEventsByQuery', 'deletePlansByQuery']);
export function isSensitiveAction(type) {
  return SENSITIVE_ACTIONS.has(type);
}

export function getActionSummary(action) {
  const t = action.type;
  const d = action.data || {};
  switch (t) {
    case 'createEvent': {
      const typeName = getTypeName(d.type);
      const statusName = d.status ? getEventStatusName(d.status) : '';
      return `录入【${typeName}】${d.taskName || '施工事件'}${statusName ? '（' + statusName + '）' : ''}`;
    }
    case 'createIssue': {
      const typeName = getIssueTypeName(d.type);
      return `记录【${typeName}】${d.title || '协调事宜'}`;
    }
    case 'createAttendance': return `签到: ${Object.keys(d.records || {}).length} 人`;
    case 'updateEvent': return `编辑事件 ${d.eventId}（${d.taskName || d.progress || ''}）`;
    case 'deleteEvent': return `删除事件 ${d.eventId}`;
    case 'batchDelete': {
      const conds = [];
      if (d.date) conds.push(d.date);
      if (d.timeFrom) conds.push(`从 ${d.timeFrom}`);
      if (d.timeTo) conds.push(`到 ${d.timeTo}`);
      if (d.status) conds.push(`状态=${getEventStatusName(d.status)}`);
      if (d.type) conds.push(`类型=${getTypeName(d.type)}`);
      if (d.taskNameContains) conds.push(`含"${d.taskNameContains}"`);
      if (d.areaId) conds.push(`区域=${d.areaId}`);
      if (d.planId) conds.push(`计划=${d.planId}`);
      if (d.ids) conds.push(`${d.ids.length}个ID`);
      return `批量删除事件: ${conds.join(' ')}`;
    }
    case 'deleteEventsByQuery': {
      const conds = [];
      if (d.date) conds.push(d.date);
      if (d.taskNameContains) conds.push(`含"${d.taskNameContains}"`);
      if (d.areaId) conds.push(`区域=${d.areaId}`);
      if (d.type) conds.push(`类型=${getTypeName(d.type)}`);
      if (d.ids) conds.push(`${d.ids.length}个ID`);
      return `批量删除事件: ${conds.join(' ') || '按条件'}${d.confirmConditions ? ' (' + d.confirmConditions + ')' : ''}`;
    }
    case 'updateIssue': {
      const parts = [];
      if (d.title) parts.push(d.title);
      if (d.status) parts.push(getIssueStatusName(d.status));
      if (d.priority) parts.push('优先级=' + d.priority);
      return `更新协调 ${d.issueId}${parts.length ? '（' + parts.join(' / ') + '）' : ''}`;
    }
    case 'closeIssue': return `关闭协调 ${d.issueId}`;
    case 'deleteIssue': return `删除协调 ${d.issueId}`;
    case 'createPlan': {
      const statusName = d.status ? getPlanStatusName(d.status) : '';
      return `创建计划【${d.taskName || '未命名计划'}】${statusName ? '（' + statusName + '）' : ''}`;
    }
    case 'updatePlan': {
      const parts = [];
      if (d.progress) parts.push('进度=' + d.progress);
      if (d.owner) parts.push('负责人=' + d.owner);
      if (d.status) parts.push(getPlanStatusName(d.status));
      return `完善计划 ${d.planId}${parts.length ? '（' + parts.join(' / ') + '）' : ''}`;
    }
    case 'deletePlan': return `删除计划 ${d.planId}`;
    case 'openWeeklyReport': return '打开周报';
    case 'confirmEvent': return `确认事件 ${d.eventId}`;
    default: return t;
  }
}

const handlers = {
  /**
   * 录日报事件
   * data: { type, areaId, areaName, taskName, planId, planName, owner, progress, headcount,
   *         laborRequirements, completionType, buildingNo, floorNo, note, description, time }
   */
  async createEvent(data, ctx) {
    console.log('[createEvent] ctx.projectId:', ctx.projectId, 'ctx:', JSON.stringify(ctx).slice(0,200));

    // ✅ 幻觉校验 — 拦截 LLM 编造的 ID
    const v = await validateEventData(data, ctx);
    if (!v.ok) {
      throw new Error(`幻觉校验失败: ${v.warnings.join(', ')}`);
    }
    // 应用校验后的值（cleaned areaId/planId 等）
    const cleanedData = { ...data, ...v.validated };
    // 合并 warnings 到 message 中
    const warnings = v.warnings.length > 0 ? ` [幻觉警告: ${v.warnings.join('; ')}]` : '';

    const type = data.type || 'progress';
    const eventType = ['progress', 'material', 'safety', 'coordination', 'attendance', 'issue', 'drawing'].includes(type) ? type : 'progress';
    const id = data.id || newId('E');
    const time = data.time || nowHHMM();

    // 计划匹配：优先用 planId（校验后），否则按 planName 模糊匹配
    let planId = cleanedData.planId || null;
    if (!planId && data.planName) {
      const m = ctx.plans?.find(p => p.taskName?.includes(data.planName) || data.planName.includes(p.taskName || ''));
      if (m) planId = m.id;
    }
    if (!planId && data.taskName) {
      // 兜底：按 taskName 模糊匹配今日计划（LLM 可能微调任务名）
      const m = ctx.plans?.find(p => p.taskName?.includes(data.taskName) || data.taskName.includes(p.taskName || ''));
      if (m) planId = m.id;
    }

    // ✅ 自动从关联计划补全字段（与前端表单 onPlanSelect / onEditPlanChange 行为一致）
    // 规则：LLM 没传的字段从 plan 补全；LLM 传了的字段尊重 LLM 输入（不覆盖）
    let plan = null;
    if (planId) {
      const plans = ctx.plans || [];
      plan = plans.find(p => p.id === planId) || null;
      // 兜底：如果 ctx.plans 里没有（可能 ctx 过期），从 DB 查一次
      if (!plan) {
        try {
          const r = await query('SELECT * FROM dr_daily_plans WHERE id=$1', [planId]);
          if (r.rows.length > 0) {
            const p = r.rows[0];
            const extra = p.extra || {};
            plan = {
              id: p.id, taskName: p.task_name, progress: p.progress, status: p.status,
              startDate: p.start_date, endDate: p.end_date,
              areaId: p.area_id || extra.areaId || '', areaName: extra.areaName || '',
              owner: p.owner || extra.owner || '', buildingNo: p.building_no || extra.buildingNo || '',
              floorNo: p.floor_no || extra.floorNo || '', totalManDays: p.total_man_days || 0,
              laborSchedule: Array.isArray(p.labor_schedule) ? p.labor_schedule : [],
              laborRequirements: Array.isArray(p.labor_schedule) ? p.labor_schedule : [],
              areaTargets: Array.isArray(p.area_targets) ? p.area_targets : [],
              type: p.type || extra.type || '', process: extra.process || '',
              description: extra.description || '', safetyNotes: extra.safetyNotes || '',
              materials: Array.isArray(extra.materials) ? extra.materials : [],
              machinery: Array.isArray(extra.machinery) ? extra.machinery : [],
            };
          }
        } catch (e) {
          console.warn('[createEvent] DB plan 兜底查询失败:', e.message);
        }
      }
    }
    if (plan) {
      // 补全各字段（仅当 LLM 没传）
      if (!cleanedData.taskName && plan.taskName) cleanedData.taskName = plan.taskName;
      if (!cleanedData.areaId && plan.areaId) cleanedData.areaId = plan.areaId;
      if (!cleanedData.owner && plan.owner) cleanedData.owner = plan.owner;
      if (!cleanedData.buildingNo && plan.buildingNo) cleanedData.buildingNo = plan.buildingNo;
      if (!cleanedData.floorNo && plan.floorNo) cleanedData.floorNo = plan.floorNo;
      // 进度：LLM 没传 progress 但 plan 有（用户说"完成"=100% 留给 LLM 自己决定；plan 的 progress 也保留给 LLM 参考）
      if (!cleanedData.progress && plan.progress) cleanedData.progress = plan.progress;
      // 工种：LLM 没传 laborRequirements，尝试从 plan 拿
      if ((!Array.isArray(cleanedData.laborRequirements) || cleanedData.laborRequirements.length === 0)) {
        const lr = plan.laborRequirements || plan.laborSchedule || [];
        if (Array.isArray(lr) && lr.length > 0) {
          cleanedData.laborRequirements = lr.map(l => ({
            trade: l.trade || l.type || '',
            count: l.count || l.headcount || 0
          })).filter(x => x.trade);
        }
      }
    }

    const completionType = (data.completionType === 'planned' || data.completionType === 'unplanned') ? data.completionType : 'planned';

    // 计算 headcount
    const laborReqs = Array.isArray(cleanedData.laborRequirements) ? cleanedData.laborRequirements : [];
    const computedHeadcount = laborReqs.reduce((s, l) => s + (l.count || 0), 0);

    await query(
      `INSERT INTO dr_events
        (id, project_id, date, time, type, area_id, plan_id, payload, submitter, source, status,
         completion_type, building_no, floor_no, owner, note, voice_text, confidence, photos, task_name)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19::jsonb,$20)
       ON CONFLICT (id) DO UPDATE SET
         time=EXCLUDED.time, type=EXCLUDED.type, area_id=EXCLUDED.area_id,
         plan_id=EXCLUDED.plan_id, payload=EXCLUDED.payload, status=EXCLUDED.status,
         completion_type=EXCLUDED.completion_type, building_no=EXCLUDED.building_no,
         floor_no=EXCLUDED.floor_no, owner=EXCLUDED.owner,
         note=EXCLUDED.note, voice_text=EXCLUDED.voice_text, confidence=EXCLUDED.confidence, photos=EXCLUDED.photos,
         task_name=EXCLUDED.task_name`,
      [
        id, ctx.projectId || 'baicaoyuan', ctx.date, time, eventType,
        cleanedData.areaId || null, planId,
        JSON.stringify({
          taskName: cleanedData.taskName || '',
          owner: cleanedData.owner || '',
          progress: cleanedData.progress || '',
          headcount: cleanedData.headcount ?? computedHeadcount,
          laborRequirements: laborReqs,
          description: cleanedData.description || ''
        }),
        data.submitter || '李华',
        data.source || 'chat',
        data.status || 'draft',
        completionType,
        cleanedData.buildingNo || null,
        cleanedData.floorNo || null,
        cleanedData.owner || null,
        cleanedData.note || null,
        cleanedData.voiceText || null,
        cleanedData.confidence != null ? cleanedData.confidence : null,
        JSON.stringify(cleanedData.photos || []),
        cleanedData.taskName || ''
      ]
    );

    return {
      ok: true, id, type: eventType, time,
      message: `已记录${getTypeName(eventType)}: ${cleanedData.taskName || '事件'}${warnings}${plan ? ' [已从关联计划自动补全字段]' : ''}`
    };
  },

  // ========== 编辑/删除事件 ==========

  async updateEvent(data, ctx) {
    const { eventId } = data;
    if (!eventId) throw new Error('eventId 必填');
    const cur = await query('SELECT * FROM dr_events WHERE id=$1', [eventId]);
    if (cur.rows.length === 0) throw new Error(`事件 ${eventId} 不存在`);
    const existing = cur.rows[0];
    const payload = existing.payload || {};

    // ✅ 幻觉校验 — areaId 必须存在于已知区域
    let warnings = [];
    let areaId = data.areaId;
    if (areaId !== undefined) {
      const areaCheck = await query(
        `SELECT DISTINCT area_id FROM dr_events WHERE area_id IS NOT NULL AND area_id != '' LIMIT 100`,
        []
      );
      const knownAreaIds = new Set(areaCheck.rows.map(r => r.area_id));
      if (!knownAreaIds.has(areaId)) {
        warnings.push(`areaId "${areaId}" 不存在，已忽略`);
        areaId = existing.area_id; // 回退到原值
      }
    } else {
      areaId = existing.area_id;
    }
    const status = data.status || existing.status;
    const type = data.type || existing.type;
    const time = data.time || existing.time;
    const source = data.source || existing.source;
    if (data.taskName) payload.taskName = data.taskName;
    if (data.owner) payload.owner = data.owner;
    if (data.progress) payload.progress = data.progress;
    if (data.headcount) payload.headcount = data.headcount;
    if (data.laborRequirements) payload.laborRequirements = Array.isArray(data.laborRequirements) ? data.laborRequirements : (() => { try { return JSON.parse(data.laborRequirements); } catch { return []; } })();
    if (data.note || data.description) payload.description = data.note || data.description;

    // 顶层列：plan_id / completion_type / building_no / floor_no / owner
    const planId = data.planId ?? existing.plan_id ?? null;
    const completionType = data.completionType || existing.completion_type || null;
    const buildingNo = data.buildingNo ?? existing.building_no ?? null;
    const floorNo = data.floorNo ?? existing.floor_no ?? null;
    const ownerCol = data.owner ?? existing.owner ?? null;

    await query(
      `UPDATE dr_events SET type=$1, area_id=$2, status=$3, payload=$4::jsonb,
         plan_id=$5, completion_type=$6, building_no=$7, floor_no=$8, owner=$9,
         time=$10, source=$11
       WHERE id=$12`,
      [type, areaId, status, JSON.stringify(payload),
       planId, completionType, buildingNo, floorNo, ownerCol,
       time, source, eventId]
    );

    const warnSuffix = warnings.length > 0 ? ` [幻觉警告: ${warnings.join('; ')}]` : '';
    return { ok: true, message: `已更新事件 ${eventId}${warnSuffix}` };
  },

  async deleteEvent(data, ctx) {
    const { eventId } = data;
    if (!eventId) throw new Error('eventId 必填');
    const r = await query('DELETE FROM dr_events WHERE id=$1', [eventId]);
    if (r.rowCount === 0) throw new Error(`未找到事件 ${eventId}，删除失败`);
    return { message: `已删除事件 ${eventId}` };
  },

  /**
   * 批量按条件删除事件
   * data: { date, timeFrom, timeTo, status, type, planId, areaId, taskNameContains, source, ids }
   *   - date: 必填（YYYY-MM-DD），限定到具体某天
   *   - timeFrom / timeTo: HH:MM，闭区间
   *   - status: draft | confirmed
   *   - type: progress / material / safety / ...
   *   - planId: 关联的计划ID
   *   - areaId: 区域ID
   *   - taskNameContains: 任务名包含（模糊）
   *   - source: 来源筛选
   *   - ids: 显式 eventId 列表（与其他条件是 AND 关系）
   * 安全：必须至少有一个筛选条件；不允许删整张表
   */
  async batchDelete(data, ctx) {
    const filters = [];
    const params = [];
    const wheres = [];

    // 必填：项目 + 日期（限定到某一天，避免误删历史）
    if (data.projectId || ctx.projectId) {
      params.push(data.projectId || ctx.projectId);
      wheres.push(`project_id=$${params.length}`);
    }
    if (!data.date) {
      // 没传 date 时，回退到 ctx.date（当前会话日期）
      if (ctx.date) {
        params.push(ctx.date);
        wheres.push(`date=$${params.length}`);
      } else {
        throw new Error('batchDelete 需指定 date（YYYY-MM-DD）');
      }
    } else {
      params.push(data.date);
      wheres.push(`date=$${params.length}`);
    }

    if (data.timeFrom) {
      params.push(data.timeFrom);
      wheres.push(`time>=$${params.length}`);
    }
    if (data.timeTo) {
      params.push(data.timeTo);
      wheres.push(`time<=$${params.length}`);
    }
    if (data.status) {
      params.push(data.status);
      wheres.push(`status=$${params.length}`);
    }
    if (data.type) {
      params.push(data.type);
      wheres.push(`type=$${params.length}`);
    }
    if (data.planId) {
      params.push(data.planId);
      wheres.push(`plan_id=$${params.length}`);
    }
    if (data.areaId) {
      params.push(data.areaId);
      wheres.push(`area_id=$${params.length}`);
    }
    if (data.taskNameContains) {
      params.push(`%${data.taskNameContains}%`);
      wheres.push(`payload->>'taskName' ILIKE $${params.length}`);
    }
    if (data.source) {
      params.push(data.source);
      wheres.push(`source=$${params.length}`);
    }
    if (Array.isArray(data.ids) && data.ids.length > 0) {
      params.push(data.ids);
      wheres.push(`id = ANY($${params.length}::text[])`);
    }

    // 安全：必须至少有一个非必填的过滤条件（time/status/type/planId/areaId/taskNameContains/ids）
    const filterCount = (data.timeFrom ? 1 : 0) + (data.timeTo ? 1 : 0) +
                        (data.status ? 1 : 0) + (data.type ? 1 : 0) +
                        (data.planId ? 1 : 0) + (data.areaId ? 1 : 0) +
                        (data.taskNameContains ? 1 : 0) +
                        (data.ids?.length > 0 ? 1 : 0);
    if (filterCount === 0) {
      throw new Error('batchDelete 需至少一个筛选条件（timeFrom/timeTo/status/type/planId/areaId/taskNameContains/ids），不能删除整张表');
    }

    // 先查询匹配的事件（让前端可展示给用户确认）
    const whereSql = wheres.join(' AND ');
    const matchRes = await query(
      `SELECT id, time, type, area_id, payload FROM dr_events WHERE ${whereSql} ORDER BY time`,
      params
    );
    const matched = matchRes.rows;
    const idsToDelete = matched.map(r => r.id);

    if (idsToDelete.length === 0) {
      return { message: '没有匹配的事件', deletedCount: 0, deletedIds: [] };
    }

    // 用 IN 子句删除
    const deleteRes = await query(
      `DELETE FROM dr_events WHERE id = ANY($1::text[])`,
      [idsToDelete]
    );

    return {
      message: `已批量删除 ${idsToDelete.length} 条事件`,
      deletedCount: idsToDelete.length,
      deletedIds: idsToDelete,
      deletedEvents: matched.map(r => ({
        id: r.id,
        time: r.time,
        type: r.type,
        areaId: r.area_id,
        taskName: r.payload?.taskName || ''
      }))
    };
  },

  // ✅ deleteEventsByQuery 是 LLM mutate 工具名，server.js 把它当作 batchDelete 的别名
  // （避免 LLM 用了工具名作为 action type 时 server.js 找不到 handler）
  async deleteEventsByQuery(data, ctx) {
    return await handlers.batchDelete(data, ctx);
  },

  /**
   * 录协调事宜
   */
  async createIssue(data, ctx) {
    const id = data.id || newId('I');
    const issueType = data.type || 'coordination';
    const today = ctx.date;
    const isClosed = data.status === 'closed';
    await query(
      `INSERT INTO dr_issues (id, project_id, type, title, area_id, priority, status, created_date, deadline, owner, description, propose_dept, cooperate_dept, resolution, photos, closed_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16)
       ON CONFLICT (id) DO UPDATE SET
         title=EXCLUDED.title, area_id=EXCLUDED.area_id, priority=EXCLUDED.priority,
         owner=EXCLUDED.owner, description=EXCLUDED.description,
         propose_dept=EXCLUDED.propose_dept, cooperate_dept=EXCLUDED.cooperate_dept,
         resolution=EXCLUDED.resolution, photos=EXCLUDED.photos, closed_date=EXCLUDED.closed_date`,
      [
        id, ctx.projectId, issueType,
        data.title || '未命名协调',
        data.areaId || null,
        data.priority || 'medium',
        data.status || 'open',
        data.createdDate || today,
        data.deadline || null,
        data.owner || null,
        data.description || '',
        data.proposeDept || null,
        data.cooperateDept || null,
        data.resolution || null,
        JSON.stringify(data.photos || []),
        isClosed ? (data.closedDate || today) : null
      ]
    );
    return { id, title: data.title, message: `已记录【${getIssueTypeName(issueType)}】${data.title}` };
  },

  // ========== 编辑/删除/关闭协调 ==========

  async updateIssue(data, ctx) {
    const { issueId } = data;
    if (!issueId) throw new Error('issueId 必填');
    const sets = []; const params = []; let idx = 1;
    if (data.title) { sets.push(`title=$${idx++}`); params.push(data.title); }
    if (data.status) { sets.push(`status=$${idx++}`); params.push(data.status); }
    if (data.priority) { sets.push(`priority=$${idx++}`); params.push(data.priority); }
    if (data.owner) { sets.push(`owner=$${idx++}`); params.push(data.owner); }
    if (data.description !== undefined) { sets.push(`description=$${idx++}`); params.push(data.description); }
    if (data.proposeDept) { sets.push(`propose_dept=$${idx++}`); params.push(data.proposeDept); }
    if (data.cooperateDept) { sets.push(`cooperate_dept=$${idx++}`); params.push(data.cooperateDept); }
    if (data.deadline) { sets.push(`deadline=$${idx++}`); params.push(data.deadline); }
    if (data.areaId) { sets.push(`area_id=$${idx++}`); params.push(data.areaId); }
    if (data.resolution) { sets.push(`resolution=$${idx++}`); params.push(data.resolution); }
    if (data.photos) { sets.push(`photos=$${idx++}::jsonb`); params.push(JSON.stringify(data.photos)); }
    if (sets.length === 0) throw new Error('没有要更新的字段');
    params.push(issueId);
    await query(`UPDATE dr_issues SET ${sets.join(', ')} WHERE id=$${idx}`, params);
    return { message: `已更新协调 ${issueId}` };
  },

  async closeIssue(data, ctx) {
    const { issueId } = data;
    if (!issueId) throw new Error('issueId 必填');
    await query(`UPDATE dr_issues SET status='closed', closed_date=$1 WHERE id=$2`, [ctx.date, issueId]);
    return { message: `已关闭协调 ${issueId}` };
  },

  async deleteIssue(data, ctx) {
    const { issueId } = data;
    if (!issueId) throw new Error('issueId 必填');
    await query('DELETE FROM dr_issues WHERE id=$1', [issueId]);
    return { message: `已删除协调 ${issueId}` };
  },

  /**
   * 签到
   */
  async createAttendance(data, ctx) {
    const date = data.date || ctx.date;
    const projectId = ctx.projectId;
    const records = data.records || {};
    const count = Object.keys(records).length;
    if (count === 0) throw new Error('签到记录为空');

    // 查找managementTeam中已有的ID
    const knownManagers = ctx.plans?.flatMap?.(p => p.managers) || [];
    const managementTeam = ctx.reference?.managementTeam || [];
    
    // 将records中的name映射到ID
    const resolvedRecords = {};
    for (const [key, rec] of Object.entries(records)) {
      let managerId = key;
      // 如果key是名字，查找对应的ID
      if (!key.startsWith('M') && !key.startsWith('MGR')) {
        const match = managementTeam.find(m => m.name === key || m.position?.includes(key));
        if (match) managerId = match.id;
      }
      resolvedRecords[managerId] = rec;
    }

    for (const [managerId, rec] of Object.entries(resolvedRecords)) {
      await query(
        `INSERT INTO dr_daily_attendance (date, project_id, manager_id, present, reason)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (date, project_id, manager_id) DO UPDATE
         SET present=EXCLUDED.present, reason=EXCLUDED.reason`,
        [date, projectId, managerId, rec.present, rec.reason || '']
      );
    }
    const absent = Object.entries(resolvedRecords).filter(([_, r]) => !r.present);
    return {
      date, count,
      message: `已签到 ${count} 人${absent.length > 0 ? `（${absent.length} 人未到：${absent.map(([id, r]) => id + (r.reason ? `(${r.reason})` : '')).join('、')}）` : ''}`
    };
  },

  /**
   * 确认事件（将 status 改为 confirmed）
   */
  async confirmEvent(data, ctx) {
    const { eventId } = data;
    if (!eventId) throw new Error('eventId 必填');
    await query(
      `UPDATE dr_events SET status='confirmed' WHERE id=$1`,
      [eventId]
    );
    return { message: `已确认事件 ${eventId}` };
  },

  /**
   * 完善计划字段（区域、负责人、进度、楼栋/楼层、劳动力等）
   * data: { planId, areaId?, areaName?, owner?, progress?, buildingNo?, floorNo?, laborRequirements?, status? }
   */
  async updatePlan(data, ctx) {
    const { planId } = data;
    if (!planId) throw new Error('planId 必填');
    const cur = await query('SELECT * FROM dr_daily_plans WHERE id=$1', [planId]);
    if (cur.rows.length === 0) throw new Error(`计划 ${planId} 不存在`);
    const existing = cur.rows[0];
    const extra = existing.extra || {};

    // ✅ 幻觉校验 — areaId 必须存在于已知区域
    let planAreaId = data.areaId;
    if (planAreaId) {
      const areaCheck = await query(
        `SELECT DISTINCT area_id FROM dr_events WHERE area_id IS NOT NULL AND area_id != '' LIMIT 100`,
        []
      );
      const knownAreaIds = new Set(areaCheck.rows.map(r => r.area_id));
      if (!knownAreaIds.has(planAreaId)) {
        planAreaId = null; // 幻觉 ID 直接丢弃
      }
    }

    const sets = []; const params = []; let idx = 1;

    // 顶层列：description / progress / status / type / process / owner / building_no / floor_no / total_man_days / area_id
    if (data.description != null && data.description !== '') { sets.push(`description=$${idx++}`); params.push(data.description); }
    if (data.progress != null && data.progress !== '') { sets.push(`progress=$${idx++}`); params.push(String(data.progress)); }
    if (data.status) { sets.push(`status=$${idx++}`); params.push(data.status); }
    if (data.type) { sets.push(`type=$${idx++}`); params.push(data.type); }
    if (data.process) { sets.push(`process=$${idx++}`); params.push(data.process); }
    if (data.owner) { sets.push(`owner=$${idx++}`); params.push(data.owner); }
    if (data.buildingNo) { sets.push(`building_no=$${idx++}`); params.push(data.buildingNo); }
    if (data.floorNo) { sets.push(`floor_no=$${idx++}`); params.push(data.floorNo); }
    if (data.totalManDays != null && data.totalManDays !== '') { sets.push(`total_man_days=$${idx++}`); params.push(Number(data.totalManDays) || 0); }
    if (planAreaId) { sets.push(`area_id=$${idx++}`); params.push(planAreaId); }
    if (data.materials) { sets.push(`materials=$${idx++}::jsonb`); params.push(JSON.stringify(data.materials)); }
    if (data.machinery) { sets.push(`machinery=$${idx++}::jsonb`); params.push(JSON.stringify(data.machinery)); }
    if (data.safetyNotes) { sets.push(`safety_notes=$${idx++}`); params.push(data.safetyNotes); }

    // 其余字段仍写到 extra JSONB（payload 类结构数据）
    const extraChanged = [];
    if (data.taskName) { extra.taskName = data.taskName; extraChanged.push('taskName'); }
    if (data.laborRequirements) { extra.laborRequirements = data.laborRequirements; extraChanged.push('laborRequirements'); }
    if (data.areaName) { extra.areaName = data.areaName; extraChanged.push('areaName'); }

    if (extraChanged.length > 0) {
      sets.push(`extra=$${idx++}::jsonb`);
      params.push(JSON.stringify(extra));
    }

    if (sets.length === 0) throw new Error('没有要更新的字段');

    sets.push(`updated_at=$${idx++}`);
    params.push(new Date().toISOString());
    params.push(planId);

    await query(`UPDATE dr_daily_plans SET ${sets.join(', ')} WHERE id=$${idx}`, params);
    return { planId, updatedFields: [...extraChanged, ...(data.progress ? ['progress'] : []), ...(data.areaId ? ['areaId'] : []), ...(data.status ? ['status'] : []), ...(data.type ? ['type'] : []), ...(data.process ? ['process'] : []), ...(data.owner ? ['owner'] : []), ...(data.buildingNo ? ['buildingNo'] : []), ...(data.floorNo ? ['floorNo'] : []), ...(data.materials ? ['materials'] : []), ...(data.machinery ? ['machinery'] : []), ...(data.safetyNotes ? ['safetyNotes'] : [])], message: `已完善计划 ${planId}` };
  },

  /**
   * 创建施工计划
   * data: { id, projectId, taskName, startDate, endDate, date, description, progress,
   *         status, laborRequirements, laborSchedule, areaId, areaName, areaTargets,
   *         owner, buildingNo, floorNo, extra }
   */
  async createPlan(data, ctx) {
    const id = data.id || newId('P');
    const projectId = data.projectId || ctx.projectId || 'baicaoyuan';
    const taskName = data.taskName || '未命名计划';
    const startDate = data.startDate || data.date || ctx.date;
    const endDate = data.endDate || startDate;
    const progress = data.progress || '0%';
    const status = data.status || 'active';
    const laborSchedule = Array.isArray(data.laborSchedule) ? data.laborSchedule : (Array.isArray(data.laborRequirements) ? data.laborRequirements : []);
    const areaTargets = Array.isArray(data.areaTargets) ? data.areaTargets : [];
    const totalManDays = data.totalManDays || 0;

    // 顶层列：owner/building_no/floor_no 优先用列；extra 仅放 areaId/areaName 等没有专属列的字段
    const owner = data.owner || null;
    const buildingNo = data.buildingNo || null;
    const floorNo = data.floorNo || null;
    const process = data.process || null;
    const description = data.description || '';

    // 构建 extra JSONB：仅放没有专属列的非标准字段
    const extra = data.extra || {};
    if (data.areaName) extra.areaName = data.areaName;
    if (data.laborRequirements && !data.laborSchedule) extra.laborRequirements = data.laborRequirements;

    const now = new Date().toISOString();
    const _toJsonbParam = (v) => {
      if (v == null) return null;
      if (typeof v === 'string') {
        try { const parsed = JSON.parse(v); return JSON.stringify(parsed); } catch { return v; }
      }
      return JSON.stringify(v);
    };
    const _laborSchedule = _toJsonbParam(laborSchedule);
    const _areaTargets = _toJsonbParam(areaTargets);
    const _extra = _toJsonbParam(extra);
    const _materials = _toJsonbParam(data.materials || []);
    const _machinery = _toJsonbParam(data.machinery || []);
    const _zoneImages = _toJsonbParam(data.zoneImages || []);
    await query(
      `INSERT INTO dr_daily_plans
        (id, project_id, date, start_date, end_date, description, task_name, progress,
         status, type, process, owner, building_no, floor_no, area_id,
         materials, machinery, safety_notes, zone_images,
         labor_schedule, area_targets, total_man_days,
         extra, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,$17::jsonb,$18,$19::jsonb,$20::jsonb,$21::jsonb,$22,$23::jsonb,$24,$25)
       ON CONFLICT (id) DO UPDATE SET
         project_id=EXCLUDED.project_id, start_date=EXCLUDED.start_date, end_date=EXCLUDED.end_date,
         description=EXCLUDED.description, task_name=EXCLUDED.task_name, progress=EXCLUDED.progress,
         status=EXCLUDED.status, type=EXCLUDED.type, process=EXCLUDED.process, owner=EXCLUDED.owner,
         building_no=EXCLUDED.building_no, floor_no=EXCLUDED.floor_no, area_id=EXCLUDED.area_id,
         materials=EXCLUDED.materials, machinery=EXCLUDED.machinery,
         safety_notes=EXCLUDED.safety_notes, zone_images=EXCLUDED.zone_images,
         labor_schedule=EXCLUDED.labor_schedule,
         area_targets=EXCLUDED.area_targets, total_man_days=EXCLUDED.total_man_days,
         extra=EXCLUDED.extra, updated_at=EXCLUDED.updated_at`,
      [
        id, projectId, data.date || null, startDate, endDate,
        description, taskName, progress, status,
        data.type || null, process, owner, buildingNo, floorNo,
        data.areaId || null,
        _materials, _machinery, data.safetyNotes || null, _zoneImages,
        _laborSchedule, _areaTargets, totalManDays,
        _extra, now, now
      ]
    );

    return { id, taskName, startDate, endDate, status, message: `已创建计划【${taskName}】${getPlanStatusName(status) ? '（' + getPlanStatusName(status) + '）' : ''}` };
  },

  /**
   * 物理删除单条 plan（DB 真的删）
   * data: { planId }
   */
  async deletePlan(data, ctx) {
    const { planId } = data;
    if (!planId) throw new Error('planId 必填');
    const cur = await query('SELECT id, task_name FROM dr_daily_plans WHERE id=$1', [planId]);
    if (cur.rows.length === 0) {
      // 幂等：已不存在视为成功
      return { planId, message: `计划 ${planId} 不存在或已被删除` };
    }
    await query('DELETE FROM dr_daily_plans WHERE id=$1', [planId]);
    return { planId, deletedTaskName: cur.rows[0].task_name, message: `已删除计划: ${cur.rows[0].task_name}` };
  },

  /**
   * 按 ID 列表批量删除 plan
   * data: { ids: ['Pxxx', ...] }
   */
  async deletePlansByQuery(data, ctx) {
    const { ids } = data;
    if (!Array.isArray(ids) || ids.length === 0) throw new Error('ids 必填且非空');
    const cur = await query('SELECT id, task_name FROM dr_daily_plans WHERE id = ANY($1::text[])', [ids]);
    const realIds = cur.rows.map(r => r.id);
    if (realIds.length === 0) {
      return { deletedIds: [], deletedCount: 0, message: '没有匹配的计划' };
    }
    await query('DELETE FROM dr_daily_plans WHERE id = ANY($1::text[])', [realIds]);
    return {
      deletedIds: realIds,
      deletedCount: realIds.length,
      message: `已删除 ${realIds.length} 条计划: ${cur.rows.map(r => r.task_name).join('、')}`
    };
  }
};

function getTypeName(type) {
  return {
    progress: '进度',
    material: '材料',
    safety: '安全',
    coordination: '协调',
    attendance: '考勤',
    drawing: '图纸深化'
  }[type] || '事件';
}

function getIssueTypeName(type) {
  return {
    quality: '质量整改',
    safety: '安全隐患',
    coordination: '协调事项',
    ecc: 'ECC 专项',
    change: '工程变更',
    visa: '签证'
  }[type] || '协调';
}

function getEventStatusName(s) {
  return { draft: '草稿', confirmed: '已确认' }[s] || s;
}

function getIssueStatusName(s) {
  return { open: '待处理', in_progress: '处理中', closed: '已闭环' }[s] || s;
}

function getPlanStatusName(s) {
  return { active: '进行中', completed: '已完成', paused: '已暂停', cancelled: '已取消' }[s] || s;
}

function getSourceName(s) {
  return { voice: '语音', photo: '拍照', manual: '手动', chat: 'AI 对话', auto: '自动' }[s] || s;
}
