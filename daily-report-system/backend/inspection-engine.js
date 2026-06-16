// inspection-engine.js - 巡检规则引擎
// 检查今日/本周数据，发现问题返回提醒
import { query } from './db.js';
import { buildChatContext } from './chat-context.js';

function daysBetween(a, b) {
  const d1 = new Date(a);
  const d2 = new Date(b);
  return Math.floor((d2 - d1) / 86400000);
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * 每日巡检
 * @param {string} projectId
 * @param {string} date
 * @returns {Array} 提醒列表
 */
export async function dailyInspection(projectId, date) {
  const reminders = [];
  const ctx = await buildChatContext(projectId, date);
  const hour = new Date().getHours();
  const today = date || todayStr();

  // === 规则 1：今日有计划但未填报事件 ===
  const todayEventAreaIds = new Set(ctx.today.events.map(e => e.area).filter(Boolean));
  const todayEventPlanIds = new Set(ctx.today.events.map(e => e.planId).filter(Boolean));
  const unReportedPlans = ctx.today.plans.filter(p =>
    !todayEventPlanIds.has(p.id) && !todayEventAreaIds.has(p.areas?.[0])
  );
  if (unReportedPlans.length > 0 && hour >= 10) {
    reminders.push({
      type: 'unreported_plans',
      priority: 'high',
      title: `今日有 ${unReportedPlans.length} 个计划还未填报事件`,
      plans: unReportedPlans.map(p => ({ id: p.id, name: p.name, area: p.areas?.[0], owner: p.owner })),
      message: '这些计划今天需要记录事件。',
      suggestedActions: unReportedPlans.slice(0, 3).map(p => p.id)
    });
  }

  // === 规则 2：9:00 后签到缺失 ===
  if (hour >= 9) {
    const allMgrs = ctx.reference.managementTeam;
    const presentIds = new Set();
    // 从 events 中找 attendance 类型事件
    ctx.today.events.filter(e => e.type === 'attendance').forEach(e => {
      if (e.payload?.managerId) presentIds.add(e.payload.managerId);
    });
    const absent = allMgrs.filter(m => !presentIds.has(m.id));
    if (absent.length > 0) {
      reminders.push({
        type: 'attendance_missing',
        priority: 'medium',
        title: `今日有 ${absent.length} 人未签到：${absent.slice(0, 5).map(m => m.name).join('、')}${absent.length > 5 ? ' 等' : ''}`,
        managers: absent.map(m => ({ id: m.id, name: m.name, position: m.position })),
        message: '需要补签到吗？',
        suggestedActions: absent.map(m => m.id)
      });
    }
  }

  // === 规则 3：计划进度异常（临近截止但进度低）===
  const urgentPlans = ctx.reference.plans ? [] : [];  // 需要查询所有计划
  // 单独查询所有 active 计划
  const allPlansRes = await query(
    `SELECT id, task_name, start_date, end_date, progress, status, extra
     FROM dr_daily_plans WHERE project_id=$1 AND end_date >= $2 AND start_date <= $2`,
    [projectId, today]
  );
  const allPlans = allPlansRes.rows.map(p => ({
    id: p.id, name: p.task_name, startDate: p.start_date, endDate: p.end_date,
    progress: p.progress, status: p.status, owner: p.extra?.owner || ''
  }));
  const urgent = allPlans.filter(p => {
    const daysLeft = daysBetween(today, p.endDate);
    const progNum = parseInt(String(p.progress || '0').replace('%', '')) || 0;
    return daysLeft >= 0 && daysLeft <= 2 && progNum < 50;
  });
  if (urgent.length > 0) {
    reminders.push({
      type: 'progress_urgent',
      priority: 'high',
      title: `${urgent.length} 个计划临近截止但进度不足 50%`,
      plans: urgent.map(p => ({
        id: p.id, name: p.name, progress: p.progress, endDate: p.endDate,
        daysLeft: daysBetween(today, p.endDate)
      })),
      message: '可能需要加班或调整计划。'
    });
  }

  // === 规则 4：协调超期 ===
  const overdueIssuesRes = await query(
    `SELECT id, title, area_id, priority, created_date, owner
     FROM dr_issues WHERE project_id=$1 AND status != 'closed' AND created_date <= $2`,
    [projectId, daysAgoStr(3)]
  );
  const overdueIssues = overdueIssuesRes.rows.filter(i => daysBetween(i.created_date, today) > 3);
  if (overdueIssues.length > 0) {
    reminders.push({
      type: 'issue_overdue',
      priority: 'medium',
      title: `${overdueIssues.length} 个协调超期未关闭`,
      issues: overdueIssues.map(i => ({
        id: i.id, title: i.title, area: i.area_id, priority: i.priority,
        daysOver: daysBetween(i.created_date, today)
      })),
      message: '需要推进或关闭。'
    });
  }

  // === 规则 5：ECC 超期 ===
  const overdueEccRes = await query(
    `SELECT id, title, area_id, status, discovered_date
     FROM dr_ecc_items WHERE project_id=$1 AND status != 'closed' AND discovered_date <= $2`,
    [projectId, daysAgoStr(7)]
  );
  const overdueEcc = overdueEccRes.rows;
  if (overdueEcc.length > 0) {
    reminders.push({
      type: 'ecc_overdue',
      priority: 'medium',
      title: `${overdueEcc.length} 个 ECC 销项超期未关闭`,
      items: overdueEcc.map(e => ({
        id: e.id, title: e.title, area: e.area_id,
        daysOver: daysBetween(e.discovered_date, today)
      })),
      message: '需要尽快处理。'
    });
  }

  // === 规则 6：周五下午提醒生成周报 ===
  const dayOfWeek = new Date(today).getDay();
  if (dayOfWeek === 5 && hour >= 15) {
    reminders.push({
      type: 'weekly_report',
      priority: 'low',
      title: '今天周五，需要生成本周周报吗？',
      message: '打开周报预览界面。',
      suggestedActions: ['open_weekly_report']
    });
  }

  // === 规则 7：下班提醒（17:30 后但今日事件未确认）===
  if (hour >= 17 && (17 !== hour || new Date().getMinutes() >= 30)) {
    const unconfirmed = ctx.today.events.filter(e => e.status !== 'confirmed');
    if (unconfirmed.length > 0) {
      reminders.push({
        type: 'unconfirmed_events',
        priority: 'medium',
        title: `今日还有 ${unconfirmed.length} 条事件未确认`,
        count: unconfirmed.length,
        message: '下班前请确认。',
        suggestedActions: ['confirm_all_today']
      });
    }
  }

  return reminders;
}

function daysAgoStr(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

/**
 * 把提醒转成 LLM 友好的消息
 */
export async function generateProactiveMessages(reminders) {
  if (reminders.length === 0) return [];
  const prompt = `你是【百草园城市更新项目】的 AI 值班经理。
请基于以下巡检发现，为每条生成一条友好、专业的主动提醒消息（中文，1-2 句，可用 emoji）。

## 巡检结果
${JSON.stringify(reminders, null, 2)}

## 输出格式（严格 JSON 数组，不要其他内容）
[
  { "type": "<reminder.type>", "message": "<消息文本>" }
]`;
  // 这里简化处理：直接基于 reminder 生成简单消息
  // 实际生产可以调 LLM 生成更自然的消息
  return reminders.map(r => ({
    type: r.type,
    priority: r.priority,
    message: formatReminderMessage(r)
  }));
}

function formatReminderMessage(r) {
  switch (r.type) {
    case 'unreported_plans':
      return `🤖 早上好！今日有 ${r.plans.length} 个计划还未填报：${r.plans.slice(0, 3).map(p => p.name).join('、')}${r.plans.length > 3 ? ' 等' : ''}。需要我帮你开始填报吗？`;
    case 'attendance_missing':
      return `📋 今日有 ${r.managers.length} 人未签到：${r.managers.slice(0, 3).map(m => m.name).join('、')}${r.managers.length > 3 ? ' 等' : ''}。`;
    case 'progress_urgent':
      return `⚠️ ${r.plans.length} 个计划临近截止但进度不足 50%：${r.plans.slice(0, 3).map(p => p.name).join('、')}。需要协调吗？`;
    case 'issue_overdue':
      return `🔴 ${r.issues.length} 个协调超期未关闭：${r.issues.slice(0, 3).map(i => i.title).join('、')}。需要推进吗？`;
    case 'ecc_overdue':
      return `🔧 ${r.items.length} 个 ECC 销项超期：${r.items.slice(0, 3).map(i => i.title).join('、')}。`;
    case 'weekly_report':
      return `📊 今天周五，需要生成本周周报吗？`;
    case 'unconfirmed_events':
      return `📝 今日还有 ${r.count} 条事件未确认，下班前请处理。`;
    default:
      return r.title;
  }
}
