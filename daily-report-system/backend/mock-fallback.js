// ============================================================
// mock-fallback.js - LLM 失败时的规则化降级方案
// 跟原 mock-data.js 里的逻辑保持一致，只是搬到了后端
// ============================================================

// 模拟"语音 → 结构化"
export function mockParseVoice(text, projectId, areas = [], workers = [], plans = []) {
  const result = {
    type: 'progress',
    areaId: areas[0]?.id || 'A1',
    completionType: 'planned',
    planId: '',
    buildingNo: '',
    floorNo: '',
    laborRequirements: [],
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

  // 匹配计划：按任务名关键字匹配
  for (const plan of plans) {
    const planTask = (plan.taskName || plan.process || '').toLowerCase();
    const textLower = text.toLowerCase();
    if (planTask && textLower.includes(planTask.slice(0, 4))) {
      result.planId = plan.id;
      break;
    }
  }

  // 提取工种 / 负责人
  const workerMatch = workers.find(w => text.includes(w.name));
  if (workerMatch) {
    result.payload.owner = workerMatch.name;
  }

  // 提取人数
  let headcount = 0;
  const countMatch = text.match(/(\d+)\s*[人个名位]/);
  if (countMatch) {
    headcount = parseInt(countMatch[1]);
    result.payload.headcount = headcount;
  } else if (text.includes('一人') || text.includes('一个人') || text.includes('一位')) {
    headcount = 1;
  } else if (text.includes('两人') || text.includes('两个人') || text.includes('两位')) {
    headcount = 2;
  } else if (text.includes('三人') || text.includes('三个人') || text.includes('三位')) {
    headcount = 3;
  } else if (text.includes('几个人') || text.includes('几人')) {
    headcount = Math.floor(Math.random() * 3) + 2;
  } else if (result.payload.owner) {
    headcount = 1;
  }
  result.payload.headcount = headcount;

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

  // 提取楼栋/楼层
  const buildingMatch = text.match(/(\d+[#栋号楼])/);
  if (buildingMatch) result.buildingNo = buildingMatch[1];
  const floorMatch = text.match(/(\d+[Ff层])/);
  if (floorMatch) result.floorNo = floorMatch[1];

  // 构建 laborRequirements
  const trades = ['木工', '泥工', '电工', '焊工', '油漆工', '水暖工', '钢筋工', '架子工'];
  const foundTrades = trades.filter(t => text.includes(t));
  if (foundTrades.length > 0 && headcount > 0) {
    result.laborRequirements = foundTrades.map(trade => ({
      trade,
      count: Math.max(1, Math.round(headcount / foundTrades.length))
    }));
  }

  if (text.includes('计划外') || text.includes('新增') || text.includes('临时') || text.includes('突发')) {
    result.completionType = 'unplanned';
    result.planId = '';
  }

  return result;
}

// 模拟"照片 → 元数据"
export function mockParsePhoto(caption, projectId, areas = [], type = 'progress', plans = []) {
  let taskHint = '施工任务';
  let owner = '';
  let progress = '';
  let headcount = 0;
  let areaId = '';
  let areaName = '';
  let buildingNo = '';
  let floorNo = '';
  let planId = '';

  if (caption) {
    const progressMatch = caption.match(/(\d+)\s*[%％]/);
    if (progressMatch) {
      progress = progressMatch[1] + '%';
    }

    const countMatch = caption.match(/(\d+)\s*[人个]/);
    if (countMatch) {
      headcount = parseInt(countMatch[1]);
    }

    const taskKeywords = ['天花', '吊顶', '墙面', '地面', '电路', '水电', '木工', '油漆', '贴砖'];
    for (const kw of taskKeywords) {
      if (caption.includes(kw)) {
        taskHint = kw + '施工';
        break;
      }
    }

    // 匹配计划
    for (const plan of plans) {
      const planTask = (plan.taskName || plan.process || '').toLowerCase();
      const capLower = caption.toLowerCase();
      if (planTask && capLower.includes(planTask.slice(0, 4))) {
        planId = plan.id;
        break;
      }
    }

    if (areas && areas.length > 0) {
      for (const area of areas) {
        const areaNameMatch = area.name;
        if (caption.includes(areaNameMatch)) {
          areaId = area.id;
          break;
        }
      }
    }

    if (!areaId && caption) {
      const areaKeywords = ['区域', '厅', '室', '区', '楼', '层', '车间', '仓库'];
      for (const kw of areaKeywords) {
        const regex = new RegExp(`([\\u4e00-\\u9fa5]+${kw})`);
        const match = caption.match(regex);
        if (match) {
          areaName = match[1];
          break;
        }
      }
    }

    const buildingMatch = caption.match(/(\d+[#栋号楼])/);
    if (buildingMatch) buildingNo = buildingMatch[1];
    const floorMatch = caption.match(/(\d+[Ff层])/);
    if (floorMatch) floorNo = floorMatch[1];
  }

  if (!areaId && areas && areas.length > 0) {
    areaId = areas[0].id;
  }

  return {
    areaId: areaId || 'A1',
    areaName,
    caption: 'AI 降级描述：' + (caption || '施工现场照片'),
    taskHint,
    workType: '其他',
    completionType: 'planned',
    planId,
    buildingNo,
    floorNo,
    laborRequirements: headcount > 0 ? [{ trade: taskHint.replace('施工', ''), count: headcount }] : [],
    payload: {
      taskName: taskHint,
      owner,
      progress,
      headcount
    },
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

// 模拟"文本优化"
export function mockOptimizeText(text) {
  const replacements = [
    [/(\d+)个?(\s+)?(人|名|位)/g, '$1人'],
    [/(\d+)%?(\s+)?(进度|完成|做了)/g, '进度$1%'],
    [/(\d+)层/g, '$1层楼'],
    [/(\d+)平米/g, '$1平方米'],
    [/(\d+)平方/g, '$1平方米'],
    [/(\d+)米/g, '$1米'],
    [/搞|弄|做/g, '进行'],
    [/弄好|搞好|做好/g, '完成'],
    [/在搞|在弄|在做/g, '正在进行'],
    [/已经|已/g, '已'],
    [/今天|今日/g, '今日'],
    [/明天/g, '明日'],
    [/刷墙|刮腻子/g, '墙面涂刷'],
    [/贴砖/g, '瓷砖铺贴'],
    [/吊顶|天花板/g, '吊顶施工'],
    [/水电|管线/g, '水电安装'],
    [/油漆/g, '油漆施工'],
    [/木工/g, '木工作业'],
    [/钢筋|绑扎/g, '钢筋绑扎'],
    [/混凝土|浇筑/g, '混凝土浇筑'],
    [/防水/g, '防水施工'],
    [/保温/g, '保温施工'],
    [/差不多|大概|左右/g, '约'],
    [/很快|马上/g, '即将'],
    [/好了|完了/g, '完成'],
    [/没好|没完成/g, '未完成'],
    [/这边|那边/g, '该区域'],
    [/楼上|楼下/g, '楼上区域|楼下区域'],
    [/然后|然后呢|然后就/g, ''],
    [/那个|那个什么/g, ''],
    [/呃|嗯|啊/g, ''],
    [/吧|嘛|呢/g, ''],
    [/。{2,}/g, '。'],
    [/，{2,}/g, '，'],
    [/！{2,}/g, '！'],
    [/\?{2,}/g, '？'],
  ];

  let result = text;
  for (const [pattern, replacement] of replacements) {
    result = result.replace(pattern, replacement);
  }

  if (!result.includes('施工') && !result.includes('作业') && !result.includes('安装')) {
    const taskKeywords = ['墙面', '地面', '吊顶', '水电', '油漆', '木工', '钢筋', '混凝土', '防水', '保温', '瓷砖'];
    for (const kw of taskKeywords) {
      if (result.includes(kw)) {
        result = result.replace(kw, kw + '施工');
        break;
      }
    }
  }

  result = result.replace(/\s+/g, ' ').trim();

  return {
    optimizedText: result,
    confidence: 0.85
  };
}
