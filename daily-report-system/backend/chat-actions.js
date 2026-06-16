// chat-actions.js - LLM 返回的 action 的执行器
import { query } from './db.js';

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
export const SENSITIVE_ACTIONS = new Set(['updateEvent', 'deleteEvent', 'updateIssue', 'closeIssue', 'deleteIssue']);

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
    case 'updateIssue': return `更新协调: ${d.issueId} (${d.title || d.status || ''})`;
    case 'closeIssue': return `关闭协调: ${d.issueId}`;
    case 'deleteIssue': return `删除协调: ${d.issueId}`;
    case 'openWeeklyReport': return '打开周报';
    case 'confirmEvent': return `确认事件: ${d.eventId}`;
    default: return t;
  }
}

const handlers = {
  /**
   * 录日报事件
   * data: { type, areaId, areaName, taskName, planId, owner, progress, headcount, note, time }
   */
  async createEvent(data, ctx) {
    console.log('[createEvent] ctx.projectId:', ctx.projectId, 'ctx:', JSON.stringify(ctx).slice(0,200));
    const type = data.type || 'progress';
    const eventType = ['progress', 'material', 'safety', 'coordination', 'attendance', 'issue', 'drawing'].includes(type) ? type : 'progress';
    const id = data.id || newId('E');
    const time = data.time || nowHHMM();

    let planId = data.planId || null;
    if (!planId && data.planName) {
      const m = ctx.plans?.find(p => p.name.includes(data.planName) || data.planName.includes(p.name));
      if (m) planId = m.id;
    }

    await query(
      `INSERT INTO dr_events (id, project_id, date, time, type, area_id, plan_id, payload, submitter, source, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11)
       ON CONFLICT (id) DO UPDATE SET
         time=EXCLUDED.time, type=EXCLUDED.type, area_id=EXCLUDED.area_id,
         plan_id=EXCLUDED.plan_id, payload=EXCLUDED.payload, status=EXCLUDED.status`,
      [
        id, ctx.projectId || 'baicaoyuan', ctx.date, time, eventType,
        data.areaId || null, planId,
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
        data.status || 'draft'
      ]
    );

    return {
      id, type: eventType, time,
      message: `已记录${getTypeName(eventType)}: ${data.taskName || '事件'}`
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

    const type = data.type || existing.type;
    const areaId = data.areaId ?? existing.area_id;
    const status = data.status || existing.status;
    if (data.taskName) payload.taskName = data.taskName;
    if (data.owner) payload.owner = data.owner;
    if (data.progress) payload.progress = data.progress;
    if (data.headcount) payload.headcount = data.headcount;
    if (data.laborRequirements) payload.laborRequirements = data.laborRequirements;
    if (data.note || data.description) payload.description = data.note || data.description;

    await query(
      `UPDATE dr_events SET type=$1, area_id=$2, status=$3, payload=$4::jsonb WHERE id=$5`,
      [type, areaId, status, JSON.stringify(payload), eventId]
    );
    return { message: `已更新事件 ${eventId}` };
  },

  async deleteEvent(data, ctx) {
    const { eventId } = data;
    if (!eventId) throw new Error('eventId 必填');
    await query('DELETE FROM dr_events WHERE id=$1', [eventId]);
    return { message: `已删除事件 ${eventId}` };
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
