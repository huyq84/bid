// ============================================================
// mock-fallback.js - LLM 失败时的规则化降级方案
// 跟原 mock-data.js 里的逻辑保持一致，只是搬到了后端
// ============================================================

// 模拟"语音 → 结构化"
export function mockParseVoice(text, projectId, areas = [], workers = []) {
  const result = {
    type: 'progress',
    areaId: areas[0]?.id || 'A1',
    payload: {
      taskName: '',
      progress: '',
      status: '进行中',
      owner: '',
      headcount: 0
    },
    confidence: 0.75
  };

  // 提取区域
  for (const area of areas) {
    if (text.includes(area.name) || text.includes(area.id)) {
      result.areaId = area.id;
      break;
    }
  }

  // 提取工种 / 负责人
  const workerMatch = workers.find(w => text.includes(w.name));
  if (workerMatch) {
    result.payload.owner = workerMatch.name;
    result.payload.headcount = Math.max(1, Math.floor(Math.random() * 4) + 1);
  }

  // 提取进度百分比
  const progressMatch = text.match(/(\d+)\s*[%％]/);
  if (progressMatch) {
    result.payload.progress = progressMatch[1] + '%';
  }

  // 提取任务名
  const taskMatch = text.match(/(?:做|搞|完成|施工|进行)([\u4e00-\u9fa5]{3,12})/);
  if (taskMatch) {
    result.payload.taskName = taskMatch[1];
  } else {
    result.payload.taskName = '常规施工任务';
  }

  return result;
}

// 模拟"照片 → 元数据"
export function mockParsePhoto(caption, projectId, areas = [], type = 'progress') {
  return {
    areaId: areas[0]?.id || 'A1',
    caption: 'AI 降级描述：' + (caption || '施工现场照片'),
    taskHint: '降级推断任务',
    workType: '其他',
    confidence: 0.6
  };
}

// 模拟"周报聚合"
export function mockAggregateWeekly({ projectName, client, weekStart, weekEnd, events = [], issues = [], areas = [] }) {
  const weekEvents = events.filter(e => e.date >= weekStart && e.date <= weekEnd);
  const weekIssues = issues.filter(i => i.createdDate >= weekStart && i.createdDate <= weekEnd);

  return {
    overview: `本周（${weekStart} ~ ${weekEnd}）${projectName} 持续推进精装施工。累计完成 ${weekEvents.filter(e => e.type === 'progress').length} 项进度任务，处理 ${weekIssues.length} 项专项事项。整体施工有序，质量、安全可控。`,
    progressByArea: areas.map(area => {
      const areaEvents = weekEvents.filter(e => e.areaId === area.id && e.type === 'progress');
      return {
        areaName: area.name,
        manager: area.manager,
        tasks: areaEvents.map(e => `${e.payload.taskName}（${e.payload.progress}）`).join('；') || '本周无新进度'
      };
    }),
    issuesSummary: {
      total: weekIssues.length,
      open: weekIssues.filter(i => i.status === 'open').length,
      inProgress: weekIssues.filter(i => i.status === 'in_progress').length,
      closed: weekIssues.filter(i => i.status === 'closed').length,
      details: weekIssues.map(i => `【${i.type}】${i.title}（${i.status}）`).join('\n')
    },
    safetyStats: {
      checkCount: weekEvents.filter(e => e.type === 'safety').length,
      issueCount: weekEvents.filter(e => e.type === 'safety' && e.payload.issues?.length > 0).length,
      summary: `本周开展安全检查 ${weekEvents.filter(e => e.type === 'safety').length} 次，整体安全可控。`
    },
    materialStats: {
      inboundCount: weekEvents.filter(e => e.type === 'material' && e.payload.action === '进场').length,
      summary: `本周共完成材料进场 ${weekEvents.filter(e => e.type === 'material' && e.payload.action === '进场').length} 项。`
    },
    nextWeekPlan: [
      '继续推进各区域精装收尾工作',
      '完成本周遗留事项整改闭环',
      '协调石材、灯具等关键材料进场',
      '组织竣工预验收准备'
    ]
  };
}
