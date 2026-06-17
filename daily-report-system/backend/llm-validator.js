// llm-validator.js - 幻觉校验工具
// 在 LLM 写入数据前，校验所有关键字段是否真实存在
// 被 createEvent/updateEvent/closeIssue 等 handler 调用

import { query } from './db.js';

/**
 * 校验并纠正 LLM 传入的事件字段
 * @param {object} data - LLM 输出的字段
 * @param {object} ctx - { projectId, date, plans? }
 * @returns {object} { ok, validated: {...}, warnings: string[] }
 */
export async function validateEventData(data, ctx) {
  const warnings = [];
  const validated = { ...data };
  const projectId = ctx.projectId || 'baicaoyuan';
  const date = ctx.date;

  // 1. areaId 校验 — 查项目注册的区域列表
  if (validated.areaId) {
    // 查 dr_events 表获取所有已知区域 ID（不限日期/项目）
    const areaCheck = await query(
      `SELECT DISTINCT area_id FROM dr_events WHERE area_id IS NOT NULL AND area_id != '' LIMIT 100`,
      []
    );
    const knownAreaIds = new Set(areaCheck.rows.map(r => r.area_id));
    if (!knownAreaIds.has(validated.areaId)) {
      warnings.push(`areaId "${validated.areaId}" 在当前项目未找到，已置空`);
      validated.areaId = null;
    }
  }

  // 2. planId 校验 — 必须是今日有效计划
  if (validated.planId) {
    const planCheck = await query(
      `SELECT COUNT(*)::int FROM dr_plans WHERE id=$1 AND project_id=$2 AND date=$3`,
      [validated.planId, projectId, date]
    );
    if (planCheck.rows[0].count === 0) {
      warnings.push(`planId "${validated.planId}" 不存在，已移除`);
      validated.planId = null;
    }
  }

  // 3. owner 校验 — 必须存在于 WORKERS
  // TODO: 需要从 DB 读 workers 表
  // if (validated.owner && !WORKERS.some(w => w.name === validated.owner)) {
  //   warnings.push(`owner "${validated.owner}" 不在人员名单中，保留原值`);
  //   validated.owner = null;
  // }

  // 4. buildingNo 校验 — 如果传了，必须匹配已知楼栋
  // 当前 DB 无楼栋限制，跳过

  return { ok: true, validated, warnings };
}

/**
 * 校验并纠正计划字段
 */
export async function validatePlanData(data, ctx) {
  const warnings = [];
  const validated = { ...data };
  const projectId = ctx.projectId || 'baicaoyuan';
  const date = ctx.date;

  // 1. planId 校验
  if (validated.planId) {
    const planCheck = await query(
      `SELECT COUNT(*)::int FROM dr_plans WHERE id=$1 AND project_id=$2 AND date=$3`,
      [validated.planId, projectId, date]
    );
    if (planCheck.rows[0].count === 0) {
      warnings.push(`planId "${validated.planId}" 不存在`);
      return { ok: false, error: `计划 ${validated.planId} 不存在`, validated, warnings };
    }
  }

  // 2. areaId 校验
  if (validated.areaId) {
    const areaCheck = await query(
      `SELECT COUNT(*)::int FROM dr_events WHERE project_id=$1 AND date=$2 AND area_id=$3 LIMIT 1`,
      [projectId, date, validated.areaId]
    );
    if (areaCheck.rows[0].count === 0) {
      warnings.push(`areaId "${validated.areaId}" 在当前项目/日期未找到`);
      validated.areaId = null;
    }
  }

  return { ok: true, validated, warnings };
}

/**
 * 校验协调事项 ID
 */
export async function validateIssueId(issueId, ctx) {
  if (!issueId) return { ok: false, error: 'issueId 必填' };
  const exists = await query(
    `SELECT COUNT(*)::int FROM dr_issues WHERE id=$1`,
    [issueId]
  );
  if (exists.rows[0].count === 0) {
    return { ok: false, error: `协调 ${issueId} 不存在` };
  }
  return { ok: true };
}
