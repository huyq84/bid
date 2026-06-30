// inspection-engine.js - 巡检规则引擎
// 检查今日/本周数据，发现问题返回提醒
import { query } from './db.js';
import { buildChatContext } from './chat-context.js';
import { getBeijingDate, dateToBeijingString } from './timezone.js';

function daysBetween(a, b) {
  const d1 = new Date(a);
  const d2 = new Date(b);
  return Math.floor((d2 - d1) / 86400000);
}

function todayStr() {
  return getBeijingDate();
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
  // 配置：reportHourThreshold = 最早提醒的小时(默认10)，可配置为 8-12
  const REPORT_HOUR_THRESHOLD = 10;
  const todayEventAreaIds = new Set(ctx.today.events.map(e => e.area).filter(Boolean));
  const todayEventPlanIds = new Set(ctx.today.events.map(e => e.planId).filter(Boolean));
  const unReportedPlans = ctx.today.plans.filter(p =>
    !todayEventPlanIds.has(p.id) && !todayEventAreaIds.has(p.areas?.[0])
  );
  if (unReportedPlans.length > 0 && hour >= REPORT_HOUR_THRESHOLD) {
    reminders.push({
      type: 'unreported_plans',
      priority: 'high',
      title: `今日有 ${unReportedPlans.length} 个计划还未填报事件`,
      plans: unReportedPlans.map(p => ({ id: p.id, name: p.taskName, area: p.areaId, owner: p.owner })),
      message: '这些计划今天需要记录事件。',
      suggestedActions: unReportedPlans.slice(0, 3).map(p => p.id)
    });
  }

  // === 规则 2：管理人员到岗检查 ===
  // 签到方式：① attendance 类型事件（headcount > 0 表示有人到岗）
  //          ② 前端也可通过 createAttendance action 单独签到（存到 dr_attendance 表）
  if (hour >= 9) {
    const allMgrs = ctx.reference.managementTeam;
    // 如果没有管理人员数据，跳过签到检查避免误报
    if (allMgrs.length === 0) {
      // 管理团队为空，可能是初始化阶段，不报缺勤
    } else {
      // 从 attendance 事件统计到岗人数（attendance 事件的 payload.headcount 表示到岗人数）
      const attEvents = ctx.today.events.filter(e => e.type === 'attendance');
      const totalHeadcount = attEvents.reduce((sum, e) => sum + (e.payload?.headcount || 0), 0);
      
      // 如果今天已经有考勤记录（headcount > 0），说明有人到岗
      // 但 attendance 事件不区分具体哪位管理人员，所以改用"到岗人数"作为参考
      // 如果有 headcount >= 管理团队的 50%，认为基本到岗
      const presentRatio = totalHeadcount / Math.max(allMgrs.length, 1);
      
      if (presentRatio < 0.5 && totalHeadcount < allMgrs.length) {
        // 到岗人数不足，发出提醒（不点名具体谁没到，因为 attendance 事件不记录 managerId）
        reminders.push({
          type: 'attendance_missing',
          priority: 'low',
          title: `今日考勤记录到岗 ${totalHeadcount} 人，建议确认管理人员到岗情况`,
          headcount: totalHeadcount,
          managerCount: allMgrs.length,
          message: '需要确认一下管理人员到岗情况吗？',
          suggestedActions: ['check_attendance']
        });
      }
    }
  }

  // === 规则 3：计划进度异常（临近截止但进度低）===
  // 配置：thresholds.days = 临近截止天数(默认2), threshold.progress = 进度百分比(默认50)
  const DAYS_THRESHOLD = 2;
  const PROGRESS_THRESHOLD = 50;
  // 单独查询所有 active 计划（排除已完成的）
  const allPlansRes = await query(
    `SELECT id, task_name, start_date, end_date, progress, status, extra
     FROM dr_daily_plans WHERE project_id=$1 AND end_date >= $2 AND start_date <= $2 AND status != 'completed'`,
    [projectId, today]
  );
  const allPlans = allPlansRes.rows.map(p => ({
    id: p.id, name: p.task_name, startDate: p.start_date, endDate: p.end_date,
    progress: p.progress, status: p.status, owner: p.extra?.owner || ''
  }));
  const urgent = allPlans.filter(p => {
    const daysLeft = daysBetween(today, p.endDate);
    const progNum = parseInt(String(p.progress || '0').replace('%', '')) || 0;
    // 只报告真正紧急的：剩余天数在阈值内且进度低于阈值
    return daysLeft >= 0 && daysLeft <= DAYS_THRESHOLD && progNum < PROGRESS_THRESHOLD;
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

  // === 规则 6：周五下午 + 周六上午提醒生成周报 ===
  const dayOfWeek = new Date(today).getDay();
  // 周五 15:00 后 或 周六 12:00 前
  const isFridayAfternoon = dayOfWeek === 5 && hour >= 15;
  const isSaturdayMorning = dayOfWeek === 6 && hour < 12;
  if (isFridayAfternoon || isSaturdayMorning) {
    reminders.push({
      type: 'weekly_report',
      priority: 'low',
      title: '今天' + (isSaturdayMorning ? '周六' : '周五') + '，需要生成本周周报吗？',
      message: '打开周报预览界面。',
      isSaturday: isSaturdayMorning
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
  return dateToBeijingString(d);
}

/**
 * 把提醒转成 LLM 友好的消息
 * 当前使用硬编码模板保证稳定性和速度；
 * 未来如需 LLM 智能生成，可在此处接入 LLM 调用。
 */
export async function generateProactiveMessages(reminders) {
  if (reminders.length === 0) return [];
  return reminders.map(r => ({
    type: r.type,
    priority: r.priority,
    message: formatReminderMessage(r)
  }));
}

function formatReminderMessage(r) {
  const hour = new Date().getHours();
  let greeting;
  if (hour < 6) greeting = '夜深了';
  else if (hour < 9) greeting = '早上好';
  else if (hour < 12) greeting = '上午好';
  else if (hour < 13) greeting = '中午好';
  else if (hour < 18) greeting = '下午好';
  else if (hour < 22) greeting = '晚上好';
  else greeting = '夜深了';
  switch (r.type) {
    case 'unreported_plans':
      return `🤖 ${greeting}！今日有 ${r.plans.length} 个计划还未填报：${r.plans.slice(0, 3).map(p => p.name).join('、')}${r.plans.length > 3 ? ' 等' : ''}。需要我帮你开始填报吗？`;
    case 'attendance_missing':
      return `📋 今日考勤到岗 ${r.headcount || 0} 人，建议确认管理人员到岗情况。`;
    case 'progress_urgent':
      return `⚠️ ${r.plans.length} 个计划临近截止但进度不足 50%：${r.plans.slice(0, 3).map(p => p.name).join('、')}。需要协调吗？`;
    case 'issue_overdue':
      return `🔴 ${r.issues.length} 个协调超期未关闭：${r.issues.slice(0, 3).map(i => i.title).join('、')}。需要推进吗？`;
    case 'ecc_overdue':
      return `🔧 ${r.items.length} 个 ECC 销项超期：${r.items.slice(0, 3).map(i => i.title).join('、')}。`;
    case 'weekly_report':
      return `📊 今天${r.isSaturday ? '周六' : '周五'}，需要生成本周周报吗？`;
    case 'unconfirmed_events':
      return `📝 今日还有 ${r.count} 条事件未确认，下班前请处理。`;
    default:
      return r.title;
  }
}
