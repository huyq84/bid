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
export const SAFE_ACTIONS = new Set(['createEvent', 'createIssue', 'createAttendance', 'confirmEvent', 'openWeeklyReport']);
export const SENSITIVE_ACTIONS = new Set(['updateEvent', 'deleteEvent', 'batchDelete', 'updateIssue', 'closeIssue', 'deleteIssue', 'updatePlan', 'deleteEventsByQuery']);
export function isSensitiveAction(type) {
  return SENSITIVE_ACTIONS.has(type);
}

export function getActionSummary(action) {
  const t = action.type;
  const d = action.data || {};
  switch (t) {
    case 'createEvent': return `录入事件: ${d.taskName || '施工事件'}`;
    case 'createIssue': return `记录协调: ${d.title || '协调事宜'}`;
    case 'createAttendance': return `签到: ${Object.keys(d.records || {}).length} 人`;
    case 'updateEvent': return `编辑事件: ${d.eventId} (${d.taskName || d.progress || ''})`;
    case 'deleteEvent': return `删除事件: ${d.eventId}`;
    case 'batchDelete': {
      const conds = [];
      if (d.date) conds.push(d.date);
      if (d.timeFrom) conds.push(`从 ${d.timeFrom}`);
      if (d.timeTo) conds.push(`到 ${d.timeTo}`);
      if (d.status) conds.push(`状态=${d.status}`);
      if (d.type) conds.push(`类型=${d.type}`);
      if (d.taskNameContains) conds.push(`含"${d.taskNameContains}"`);
      if (d.areaId) conds.push(`区域=${d.areaId}`);
      if (d.planId) conds.push(`计划=${d.planId}`);
      if (d.ids) conds.push(`IDs=${d.ids.length}个`);
      return `批量删除: ${conds.join(' ')}`;
    }
    case 'deleteEventsByQuery': {
      const conds = [];
      if (d.date) conds.push(d.date);
      if (d.taskNameContains) conds.push(`含"${d.taskNameContains}"`);
      if (d.areaId) conds.push(`区域=${d.areaId}`);
      if (d.type) conds.push(`类型=${d.type}`);
      if (d.ids) conds.push(`${d.ids.length}个ID`);
      return `批量删除今日事件: ${conds.join(' ') || '按条件'}${d.confirmConditions ? ' (' + d.confirmConditions + ')' : ''}`;
    }
    case 'updateIssue': return `更新协调: ${d.issueId} (${d.title || d.status || ''})`;
    case 'closeIssue': return `关闭协调: ${d.issueId}`;
    case 'deleteIssue': return `删除协调: ${d.issueId}`;
    case 'openWeeklyReport': return '打开周报';
    case 'confirmEvent': return `确认事件: ${d.eventId}`;
    case 'updatePlan': return `完善计划: ${d.planId} (${d.taskName || d.owner || d.progress || d.areaId || '更新字段'})`;
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
      // 兜底：按 taskName 精确匹配今日计划
      const m = ctx.plans?.find(p => p.taskName === data.taskName);
      if (m) planId = m.id;
    }

    const completionType = (data.completionType === 'planned' || data.completionType === 'unplanned') ? data.completionType : 'planned';

    await query(
      `INSERT INTO dr_events
        (id, project_id, date, time, type, area_id, plan_id, payload, submitter, source, status,
         completion_type, building_no, floor_no, owner)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12,$13,$14,$15)
       ON CONFLICT (id) DO UPDATE SET
         time=EXCLUDED.time, type=EXCLUDED.type, area_id=EXCLUDED.area_id,
         plan_id=EXCLUDED.plan_id, payload=EXCLUDED.payload, status=EXCLUDED.status,
         completion_type=EXCLUDED.completion_type, building_no=EXCLUDED.building_no,
         floor_no=EXCLUDED.floor_no, owner=EXCLUDED.owner`,
      [
        id, ctx.projectId || 'baicaoyuan', ctx.date, time, eventType,
        cleanedData.areaId || null, planId,
        JSON.stringify({
          taskName: data.taskName || '',
          owner: data.owner || '',
          progress: data.progress || '',
          headcount: data.headcount || 0,
          laborRequirements: data.laborRequirements || [],
          description: data.note || data.description || ''
        }),
        data.submitter || '李华',
        data.source || 'chat',
        data.status || 'draft',
        completionType,
        data.buildingNo || null,
        data.floorNo || null,
        data.owner || null
      ]
    );

    return {
      id, type: eventType, time,
      message: `已记录${getTypeName(eventType)}: ${data.taskName || '事件'}${warnings}`
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
    if (data.taskName) payload.taskName = data.taskName;
    if (data.owner) payload.owner = data.owner;
    if (data.progress) payload.progress = data.progress;
    if (data.headcount) payload.headcount = data.headcount;
    if (data.laborRequirements) payload.laborRequirements = data.laborRequirements;
    if (data.note || data.description) payload.description = data.note || data.description;

    // 顶层列：completion_type / building_no / floor_no / owner
    const completionType = data.completionType || existing.completion_type || null;
    const buildingNo = data.buildingNo ?? existing.building_no ?? null;
    const floorNo = data.floorNo ?? existing.floor_no ?? null;
    const ownerCol = data.owner ?? existing.owner ?? null;

    await query(
      `UPDATE dr_events SET type=$1, area_id=$2, status=$3, payload=$4::jsonb,
         completion_type=$5, building_no=$6, floor_no=$7, owner=$8
       WHERE id=$9`,
      [type, areaId, status, JSON.stringify(payload),
       completionType, buildingNo, floorNo, ownerCol, eventId]
    );

    const warnSuffix = warnings.length > 0 ? ` [幻觉警告: ${warnings.join('; ')}]` : '';
    return { message: `已更新事件 ${eventId}${warnSuffix}` };
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
    await query(
      `INSERT INTO dr_issues (id, project_id, type, title, area_id, priority, status, created_date, deadline, owner, description, propose_dept, cooperate_dept)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT (id) DO UPDATE SET
         title=EXCLUDED.title, area_id=EXCLUDED.area_id, priority=EXCLUDED.priority,
         owner=EXCLUDED.owner, description=EXCLUDED.description,
         propose_dept=EXCLUDED.propose_dept, cooperate_dept=EXCLUDED.cooperate_dept`,
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
        data.cooperateDept || null
      ]
    );
    return { id, title: data.title, message: `已记录协调: ${data.title}` };
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

    for (const [managerId, rec] of Object.entries(records)) {
      await query(
        `INSERT INTO dr_daily_attendance (date, project_id, manager_id, present, reason)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (date, project_id, manager_id) DO UPDATE
         SET present=EXCLUDED.present, reason=EXCLUDED.reason`,
        [date, projectId, managerId, rec.present, rec.reason || '']
      );
    }
    const absent = Object.entries(records).filter(([_, r]) => !r.present);
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

    // 顶层列：progress / status
    if (data.progress != null && data.progress !== '') { sets.push(`progress=$${idx++}`); params.push(String(data.progress)); }
    if (data.status) { sets.push(`status=$${idx++}`); params.push(data.status); }

    // areaId 写入 area_targets（[{ areaId, name }]）的 areaId 字段
    if (planAreaId) {
      let areaTargets = existing.area_targets || [];
      if (!Array.isArray(areaTargets) || areaTargets.length === 0) {
        areaTargets = [{ areaId: planAreaId }];
      } else {
        areaTargets = [{ ...areaTargets[0], areaId: planAreaId }, ...areaTargets.slice(1)];
      }
      sets.push(`area_targets=$${idx++}::jsonb`); params.push(JSON.stringify(areaTargets));
    }

    // 其它字段统一写到 extra JSONB
    const extraChanged = [];
    if (data.owner) { extra.owner = data.owner; extraChanged.push('owner'); }
    if (data.buildingNo) { extra.buildingNo = data.buildingNo; extraChanged.push('buildingNo'); }
    if (data.floorNo) { extra.floorNo = data.floorNo; extraChanged.push('floorNo'); }
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
    return { planId, updatedFields: [...extraChanged, ...(data.progress ? ['progress'] : []), ...(data.areaId ? ['areaId'] : []), ...(data.status ? ['status'] : [])], message: `已完善计划 ${planId}` };
  }
};

function getTypeName(type) {
  return {
    progress: '进度',
    material: '材料',
    safety: '安全',
    coordination: '协调',
    attendance: '考勤',
    issue: '问题',
    drawing: '图纸深化'
  }[type] || '事件';
}
