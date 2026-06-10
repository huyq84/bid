// ============================================================
// Mock 数据 - 日报到周报 LLM 聚合系统
// 说明：所有数据都是浏览器内存里的假数据，刷新页面会重置
// ============================================================

// 当前选中项目（在 localStorage 里持久化）
let CURRENT_PROJECT_ID = localStorage.getItem('current_project_id') || 'baicaoyuan';

// ============================================================
// 1. 档案库 - 项目
// ============================================================
const PROJECTS = [
  {
    id: 'baicaoyuan',
    name: '百草园城市更新项目',
    client: '中建三局集团（深圳）有限公司',
    location: '深圳·南山',
    color: '#00adef',
    enabledFields: ['areas', 'tasks', 'photos', 'labor_stats', 'milestones']
  },
  {
    id: 'lvcheng-riverside',
    name: '绿城·滨江壹号',
    client: '绿城中国',
    location: '杭州·钱塘',
    color: '#10b981',
    enabledFields: ['areas', 'tasks', 'photos', 'labor_stats']
  },
  {
    id: 'vanke-metropolis',
    name: '万科·都会',
    client: '万科地产',
    location: '广州·天河',
    color: '#f59e0b',
    enabledFields: ['areas', 'tasks', 'photos', 'labor_stats', 'milestones']
  }
];

// ============================================================
// 2. 档案库 - 区域（每个项目有自己的区域划分）
// ============================================================
const AREAS = {
  baicaoyuan: [
    { id: 'A1', name: '高管办公区', floor: '1F-3F', manager: '张明' },
    { id: 'A2', name: '员工餐厅区', floor: '1F', manager: '李华' },
    { id: 'A3', name: '多功能厅',    floor: 'B1',     manager: '王强' },
    { id: 'A4', name: '商业展示区',  floor: '1F-2F', manager: '陈芳' }
  ],
  'lvcheng-riverside': [
    { id: 'B1', name: 'A 户型样板间', floor: '12F', manager: '赵刚' },
    { id: 'B2', name: '公区精装区',  floor: '1F-3F', manager: '孙丽' }
  ],
  'vanke-metropolis': [
    { id: 'C1', name: '首层大堂',   floor: '1F',   manager: '周伟' },
    { id: 'C2', name: '电梯厅精装', floor: '1F-18F', manager: '吴敏' }
  ]
};

// ============================================================
// 3. 档案库 - 工人
// ============================================================
const WORKERS = [
  { id: 'W001', name: '张师傅',     role: '木工',   team: 'A 班',   phone: '138****1234' },
  { id: 'W002', name: '李师傅',     role: '电工',   team: 'A 班',   phone: '138****2345' },
  { id: 'W003', name: '王师傅',     role: '瓦工',   team: 'B 班',   phone: '138****3456' },
  { id: 'W004', name: '赵师傅',     role: '油漆工', team: 'A 班',   phone: '138****4567' },
  { id: 'W005', name: '孙师傅',     role: '焊工',   team: 'B 班',   phone: '138****5678' },
  { id: 'W006', name: '钱师傅',     role: '吊顶工', team: 'C 班',   phone: '138****6789' },
  { id: 'W007', name: '周师傅',     role: '水电工', team: 'C 班',   phone: '138****7890' }
];

// ============================================================
// 4. 里程碑/重要节点
// ============================================================
const MILESTONES = {
  baicaoyuan: [
    { id: 'M001', name: '精装修进场', targetDate: '2026-05-01', actualDate: '2026-05-01', status: 'completed', progress: 100 },
    { id: 'M002', name: '天花吊顶完成', targetDate: '2026-06-15', actualDate: null, status: 'in_progress', progress: 75 },
    { id: 'M003', name: '墙面基层完成', targetDate: '2026-06-20', actualDate: null, status: 'in_progress', progress: 50 },
    { id: 'M004', name: '精装验收', targetDate: '2026-07-15', actualDate: null, status: 'pending', progress: 0 }
  ],
  'lvcheng-riverside': [
    { id: 'M001', name: '样板间进场', targetDate: '2026-05-15', actualDate: '2026-05-15', status: 'completed', progress: 100 },
    { id: 'M002', name: '样板间完成', targetDate: '2026-06-30', actualDate: null, status: 'in_progress', progress: 60 }
  ],
  'vanke-metropolis': [
    { id: 'M001', name: '大堂精装启动', targetDate: '2026-06-01', actualDate: '2026-06-01', status: 'completed', progress: 100 },
    { id: 'M002', name: '电梯厅完成', targetDate: '2026-07-10', actualDate: null, status: 'in_progress', progress: 30 }
  ]
};

// ============================================================
// 5. 日计划数据
// ============================================================
const PLANS = {
  baicaoyuan: [
    {
      id: 'PLAN001',
      projectId: 'baicaoyuan',
      date: '2026-06-05',
      description: '今日继续推进各区域精装施工',
      laborSchedule: [
        { laborType: '木工', count: 5 },
        { laborType: '电工', count: 3 },
        { laborType: '吊顶工', count: 2 },
        { laborType: '油漆工', count: 2 }
      ],
      areaTargets: [
        { areaId: 'A1', taskName: '墙面基层处理', targetProgress: '60%' },
        { areaId: 'A2', taskName: '天花吊顶龙骨', targetProgress: '85%' },
        { areaId: 'A3', taskName: '地面找平', targetProgress: '40%' }
      ],
      createdAt: '2026-06-05T07:00:00Z'
    },
    {
      id: 'PLAN002',
      projectId: 'baicaoyuan',
      date: '2026-06-04',
      description: '推进天花吊顶和墙面施工',
      laborSchedule: [
        { laborType: '木工', count: 4 },
        { laborType: '电工', count: 2 },
        { laborType: '吊顶工', count: 3 }
      ],
      areaTargets: [
        { areaId: 'A1', taskName: '墙面基层处理', targetProgress: '50%' },
        { areaId: 'A2', taskName: '天花吊顶龙骨', targetProgress: '75%' }
      ],
      createdAt: '2026-06-04T07:00:00Z'
    },
    {
      id: 'PLAN003',
      projectId: 'baicaoyuan',
      date: '2026-06-03',
      description: '各区域正常施工',
      laborSchedule: [
        { laborType: '木工', count: 6 },
        { laborType: '电工', count: 3 },
        { laborType: '瓦工', count: 2 }
      ],
      areaTargets: [
        { areaId: 'A1', taskName: '墙面基层处理', targetProgress: '40%' },
        { areaId: 'A4', taskName: '石材干挂', targetProgress: '30%' }
      ],
      createdAt: '2026-06-03T07:00:00Z'
    }
  ],
  'lvcheng-riverside': [],
  'vanke-metropolis': []
};

// ============================================================
// 6. 事件流（今天的日报核心数据）
// 字段说明：
//   type: progress / material / safety / coordination / attendance
//   source: voice / photo / manual / auto
//   confidence: LLM 识别的可信度（0-1），手动录入为 1
//   status: draft / confirmed
// ============================================================
const today = new Date();
const TODAY = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

// 今天的事件流
const EVENTS = [
  // 上午 - 班前考勤
  {
    id: 'E001',
    projectId: 'baicaoyuan',
    date: TODAY,
    time: '07:55',
    type: 'attendance',
    areaId: 'A2',
    payload: {
      workers: ['W001', 'W002', 'W006', 'W007'],
      headcount: 4,
      laborStats: { '木工': 1, '电工': 1, '吊顶工': 1, '水电工': 1 }
    },
    submitter: '李华',
    source: 'auto',
    confidence: 0.95,
    status: 'confirmed',
    note: '班前考勤打卡'
  },

  // 上午 - 进度事件
  {
    id: 'E002',
    projectId: 'baicaoyuan',
    date: TODAY,
    time: '09:30',
    type: 'progress',
    areaId: 'A2',
    payload: {
      taskName: '天花吊顶龙骨安装',
      progress: '80%',
      status: '进行中',
      owner: '张师傅',
      headcount: 2
    },
    submitter: '李华',
    source: 'voice',
    confidence: 0.88,
    status: 'draft',
    voiceText: '员工餐厅区天花吊顶龙骨安装，张师傅带了两个人在做，进度到 80% 了，今天接着搞',
    note: ''
  },
  {
    id: 'E003',
    projectId: 'baicaoyuan',
    date: TODAY,
    time: '10:15',
    type: 'progress',
    areaId: 'A1',
    payload: {
      taskName: '墙面基层处理',
      progress: '50%',
      status: '进行中',
      owner: '王师傅',
      headcount: 3
    },
    submitter: '张明',
    source: 'photo',
    confidence: 0.82,
    status: 'draft',
    voiceText: '',
    photos: [
      { id: 'P001', caption: '高管区墙面基层处理现场', area: 'A1' }
    ],
    note: 'AI 自动识别为"墙面基层处理"，已确认'
  },

  // 中午 - 材料
  {
    id: 'E004',
    projectId: 'baicaoyuan',
    date: TODAY,
    time: '11:30',
    type: 'material',
    areaId: 'A2',
    payload: {
      materialName: '轻钢龙骨',
      spec: '50 系列',
      quantity: 120,
      unit: '根',
      action: '进场',
      supplier: '某建材有限公司'
    },
    submitter: '李华',
    source: 'manual',
    confidence: 1.0,
    status: 'confirmed',
    note: ''
  },

  // 下午 - 安全
  {
    id: 'E005',
    projectId: 'baicaoyuan',
    date: TODAY,
    time: '14:00',
    type: 'safety',
    areaId: 'A3',
    payload: {
      checkType: '日常安全巡检',
      result: '正常',
      issues: []
    },
    submitter: '王强',
    source: 'photo',
    confidence: 0.90,
    status: 'draft',
    photos: [
      { id: 'P002', caption: '多功能厅巡检现场', area: 'A3' }
    ],
    note: ''
  },
  {
    id: 'E006',
    projectId: 'baicaoyuan',
    date: TODAY,
    time: '15:20',
    type: 'safety',
    areaId: 'A4',
    payload: {
      checkType: '隐患排查',
      result: '发现隐患',
      issues: ['商业展示区临时用电未规范布线', '部分灭火器超期未检']
    },
    submitter: '陈芳',
    source: 'manual',
    confidence: 1.0,
    status: 'draft',
    photos: [
      { id: 'P003', caption: '临时用电不规范', area: 'A4' }
    ],
    note: '已派单整改'
  },

  // 下午 - 协调
  {
    id: 'E007',
    projectId: 'baicaoyuan',
    date: TODAY,
    time: '16:00',
    type: 'coordination',
    areaId: 'A1',
    payload: {
      topic: '高管办公区天花高度调整',
      parties: ['甲方代表', '设计院', '项目部'],
      summary: '原设计天花高度 2.8m，甲方要求调整为 2.9m，已达成一致意见',
      status: '已协调'
    },
    submitter: '张明',
    source: 'voice',
    confidence: 0.92,
    status: 'draft',
    voiceText: '今天下午跟甲方、设计院碰了一下，高管区天花高度从 2 米 8 调到 2 米 9，已经达成一致',
    note: ''
  }
];

// 历史事件（用于日历展示）
const HISTORY_EVENTS = [
  // 6月4日
  { id: 'H001', projectId: 'baicaoyuan', date: '2026-06-04', time: '08:00', type: 'attendance', status: 'confirmed', payload: { headcount: 8 } },
  { id: 'H002', projectId: 'baicaoyuan', date: '2026-06-04', time: '09:30', type: 'progress', status: 'confirmed', payload: { taskName: '墙面基层', progress: '45%' } },
  { id: 'H003', projectId: 'baicaoyuan', date: '2026-06-04', time: '14:00', type: 'safety', status: 'confirmed', payload: { checkType: '巡检', result: '正常' } },
  
  // 6月3日
  { id: 'H004', projectId: 'baicaoyuan', date: '2026-06-03', time: '08:00', type: 'attendance', status: 'confirmed', payload: { headcount: 10 } },
  { id: 'H005', projectId: 'baicaoyuan', date: '2026-06-03', time: '10:00', type: 'material', status: 'confirmed', payload: { materialName: '石膏板', quantity: 200 } },
  
  // 6月2日
  { id: 'H006', projectId: 'baicaoyuan', date: '2026-06-02', time: '08:00', type: 'attendance', status: 'confirmed', payload: { headcount: 9 } },
  { id: 'H007', projectId: 'baicaoyuan', date: '2026-06-02', time: '15:00', type: 'coordination', status: 'draft', payload: { topic: '材料协调' } },
  
  // 6月1日
  { id: 'H008', projectId: 'baicaoyuan', date: '2026-06-01', time: '08:00', type: 'attendance', status: 'confirmed', payload: { headcount: 8 } },
  
  // 5月31日
  { id: 'H009', projectId: 'baicaoyuan', date: '2026-05-31', time: '08:00', type: 'attendance', status: 'confirmed', payload: { headcount: 7 } },
  { id: 'H010', projectId: 'baicaoyuan', date: '2026-05-31', time: '11:00', type: 'progress', status: 'confirmed', payload: { taskName: '吊顶准备', progress: '10%' } },
  
  // 5月30日
  { id: 'H011', projectId: 'baicaoyuan', date: '2026-05-30', time: '08:00', type: 'attendance', status: 'confirmed', payload: { headcount: 6 } },
  
  // 5月29日
  { id: 'H012', projectId: 'baicaoyuan', date: '2026-05-29', time: '08:00', type: 'attendance', status: 'confirmed', payload: { headcount: 8 } },
  { id: 'H013', projectId: 'baicaoyuan', date: '2026-05-29', time: '14:00', type: 'safety', status: 'draft', payload: { checkType: '隐患排查', result: '发现隐患' } }
];

// ============================================================
// 7. 事项台账（跨日跟踪）
// ============================================================
const ISSUES = [
  {
    id: 'I001',
    projectId: 'baicaoyuan',
    type: 'quality',
    title: '员工餐厅区天花平整度不达标',
    areaId: 'A2',
    priority: 'high',
    status: 'in_progress',
    createdDate: '2026-06-02',
    deadline: '2026-06-08',
    owner: '张师傅',
    description: '天花吊顶局部平整度偏差 5mm，超过规范要求',
    resolution: '',
    photos: []
  },
  {
    id: 'I002',
    projectId: 'baicaoyuan',
    type: 'safety',
    title: '商业展示区临时用电不规范',
    areaId: 'A4',
    priority: 'high',
    status: 'open',
    createdDate: TODAY,
    deadline: '2026-06-07',
    owner: '陈芳',
    description: '临时用电未规范布线，存在安全隐患',
    resolution: '',
    photos: ['P003']
  },
  {
    id: 'I003',
    projectId: 'baicaoyuan',
    type: 'coordination',
    title: '石材供货周期确认',
    areaId: 'A4',
    priority: 'medium',
    status: 'closed',
    createdDate: '2026-05-28',
    deadline: '2026-06-05',
    owner: '陈芳',
    description: '与石材供应商确认大板到货时间',
    resolution: '确认 6 月 10 日到场',
    closedDate: '2026-06-03',
    photos: []
  },
  {
    id: 'I004',
    projectId: 'baicaoyuan',
    type: 'ecc',
    title: 'ECC 销项：餐厅区灯具定位偏差',
    areaId: 'A2',
    priority: 'medium',
    status: 'in_progress',
    createdDate: '2026-06-01',
    deadline: '2026-06-10',
    owner: '李华',
    description: '餐厅区筒灯位置与精装图偏差 30mm',
    resolution: '',
    photos: []
  }
];

// ============================================================
// 8. 工具函数
// ============================================================

// 类型显示配置
const TYPE_META = {
  progress:    { label: '进度',   color: '#00adef', icon: '🔨', bgClass: 'type-progress' },
  material:    { label: '材料',   color: '#f59e0b', icon: '📦', bgClass: 'type-material' },
  safety:      { label: '安全',   color: '#ef4444', icon: '🛡', bgClass: 'type-safety' },
  coordination:{ label: '协调',   color: '#8b5cf6', icon: '🤝', bgClass: 'type-coordination' },
  attendance:  { label: '考勤',   color: '#10b981', icon: '👥', bgClass: 'type-attendance' }
};

const ISSUE_TYPE_META = {
  quality:       { label: '质量整改', color: '#f59e0b' },
  safety:        { label: '安全隐患', color: '#ef4444' },
  coordination:  { label: '协调事项', color: '#8b5cf6' },
  ecc:           { label: 'ECC 专项', color: '#06b6d4' },
  change:        { label: '工程变更', color: '#a855f7' },
  visa:          { label: '现场签证', color: '#ec4899' }
};

const PRIORITY_META = {
  high:   { label: '紧急', color: '#ef4444' },
  medium: { label: '中等', color: '#f59e0b' },
  low:    { label: '一般', color: '#6b7280' }
};

const ISSUE_STATUS_META = {
  open:        { label: '待处理', color: '#6b7280' },
  in_progress: { label: '处理中', color: '#3b82f6' },
  closed:      { label: '已闭环', color: '#10b981' }
};

const MILESTONE_STATUS_META = {
  pending:      { label: '未开始', color: '#6b7280' },
  in_progress: { label: '进行中', color: '#3b82f6' },
  completed:    { label: '已完成', color: '#10b981' }
};

// 来源显示
const SOURCE_META = {
  voice:  { label: '语音', icon: '🎤' },
  photo:  { label: '拍照', icon: '📷' },
  manual: { label: '手动', icon: '✏️' },
  auto:   { label: '自动', icon: '⚙️' }
};

// ============================================================
// 9. Mock LLM 解析（规则化）
// ============================================================

// 模拟"语音 → 结构化"
function mockParseVoice(text, projectId) {
  const result = {
    type: 'progress',
    areaId: AREAS[projectId]?.[0]?.id || 'A1',
    payload: {
      taskName: '',
      progress: '',
      status: '进行中',
      owner: '',
      headcount: 0
    },
    confidence: 0.85
  };

  // 简单规则化解析
  // 提取区域
  for (const area of (AREAS[projectId] || [])) {
    if (text.includes(area.name) || text.includes(area.id)) {
      result.areaId = area.id;
      break;
    }
  }

  // 提取工种 / 负责人
  const workerMatch = WORKERS.find(w => text.includes(w.name));
  if (workerMatch) {
    result.payload.owner = workerMatch.name;
  }

  // 提取人数（独立于负责人，支持多种表达方式）
  const countMatch = text.match(/(\d+)\s*[人个名位]/);
  if (countMatch) {
    result.payload.headcount = parseInt(countMatch[1]);
  } else if (text.includes('一人') || text.includes('一个人') || text.includes('一位')) {
    result.payload.headcount = 1;
  } else if (text.includes('两人') || text.includes('两个人') || text.includes('两位')) {
    result.payload.headcount = 2;
  } else if (text.includes('三人') || text.includes('三个人') || text.includes('三位')) {
    result.payload.headcount = 3;
  } else if (text.includes('几个人') || text.includes('几人')) {
    result.payload.headcount = Math.floor(Math.random() * 3) + 2; // 2-4人
  } else if (result.payload.owner) {
    // 如果有负责人但没提取到人数，默认给1人
    result.payload.headcount = 1;
  }

  // 提取进度百分比
  const progressMatch = text.match(/(\d+)\s*[%％]/);
  if (progressMatch) {
    result.payload.progress = progressMatch[1] + '%';
  }

  // 提取任务名（简化：取第一个"做"字后面的名词短语）
  const taskMatch = text.match(/(?:做|搞|完成|施工|进行)([\u4e00-\u9fa5]{3,12})/);
  if (taskMatch) {
    result.payload.taskName = taskMatch[1];
  } else {
    // 默认任务名
    result.payload.taskName = '常规施工任务';
  }

  return result;
}

// 模拟"照片 → 元数据"
function mockParsePhoto(caption, areas = AREAS[CURRENT_PROJECT_ID] || []) {
  let taskHint = '施工任务';
  let owner = '';
  let progress = '';
  let headcount = 0;
  let areaId = '';
  let areaName = '';
  
  if (caption) {
    // 提取进度
    const progressMatch = caption.match(/(\d+)\s*[%％]/);
    if (progressMatch) {
      progress = progressMatch[1] + '%';
    }
    
    // 提取人数
    const countMatch = caption.match(/(\d+)\s*[人个]/);
    if (countMatch) {
      headcount = parseInt(countMatch[1]);
    }
    
    // 提取任务关键词
    const taskKeywords = ['天花', '吊顶', '墙面', '地面', '电路', '水电', '木工', '油漆', '贴砖'];
    for (const kw of taskKeywords) {
      if (caption.includes(kw)) {
        taskHint = kw + '施工';
        break;
      }
    }
    
    // 智能匹配区域：从caption中查找区域名称
    if (areas && areas.length > 0) {
      for (const area of areas) {
        if (caption.includes(area.name)) {
          areaId = area.id;
          break;
        }
      }
    }
    
    // 如果没有匹配到已存在的区域，尝试提取新区域名
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
  }
  
  // 如果没有识别到区域，使用第一个区域作为默认
  if (!areaId && areas && areas.length > 0) {
    areaId = areas[0].id;
  }
  
  return {
    areaId: areaId || 'A1',
    areaName,
    caption: 'AI 自动生成描述：' + (caption || '施工现场'),
    taskHint,
    workType: '其他',
    payload: {
      taskName: taskHint,
      owner,
      progress,
      headcount
    },
    confidence: 0.80
  };
}

// 模拟"周报聚合"
function mockAggregateWeekly(projectId, weekStart, weekEnd) {
  const project = PROJECTS.find(p => p.id === projectId);
  const areas = AREAS[projectId] || [];
  const allEvents = [...EVENTS, ...HISTORY_EVENTS];
  const weekEvents = allEvents.filter(e => e.projectId === projectId && e.date >= weekStart && e.date <= weekEnd);
  const weekIssues = ISSUES.filter(i => i.projectId === projectId);

  return {
    projectName: project.name,
    client: project.client,
    weekRange: `${weekStart} ~ ${weekEnd}`,
    overview: `本周（${weekStart} ~ ${weekEnd}）${project.name} 持续推进精装施工。累计完成 ${weekEvents.filter(e => e.type === 'progress').length} 项进度任务，处理 ${weekIssues.length} 项专项事项。整体施工有序，质量、安全可控。`,
    progressByArea: areas.map(area => {
      const areaEvents = weekEvents.filter(e => e.areaId === area.id && e.type === 'progress');
      return {
        areaName: area.name,
        manager: area.manager,
        tasks: areaEvents.map(e => `${e.payload.taskName || '进度更新'}（${e.payload.progress || '-'}）`).join('；') || '本周无新进度'
      };
    }),
    issuesSummary: {
      total: weekIssues.length,
      open: weekIssues.filter(i => i.status === 'open').length,
      inProgress: weekIssues.filter(i => i.status === 'in_progress').length,
      closed: weekIssues.filter(i => i.status === 'closed').length,
      details: weekIssues.map(i => `【${ISSUE_TYPE_META[i.type].label}】${i.title}（${ISSUE_STATUS_META[i.status].label}）`).join('\n')
    },
    safetyStats: {
      checkCount: weekEvents.filter(e => e.type === 'safety').length,
      issueCount: weekEvents.filter(e => e.type === 'safety' && e.payload?.issues?.length > 0).length
    },
    materialStats: {
      inboundCount: weekEvents.filter(e => e.type === 'material' && e.payload?.action === '进场').length
    },
    nextWeekPlan: [
      '继续推进各区域精装收尾工作',
      '完成本周遗留事项整改闭环',
      '协调石材、灯具等关键材料进场',
      '组织竣工预验收准备'
    ],
    generatedAt: new Date().toISOString()
  };
}

// 获取指定日期的日报数据
function getDailyEvents(date, projectId) {
  const todayEvents = EVENTS.filter(e => e.projectId === projectId && e.date === date);
  const historyEvents = HISTORY_EVENTS.filter(e => e.projectId === projectId && e.date === date);
  return [...todayEvents, ...historyEvents];
}

// 获取月度统计
function getMonthlyStats(year, month, projectId) {
  const allEvents = [...EVENTS, ...HISTORY_EVENTS];
  const monthEvents = allEvents.filter(e => {
    const d = new Date(e.date);
    return e.projectId === projectId && d.getFullYear() === year && d.getMonth() === month;
  });
  
  const datesWithReports = new Set(monthEvents.map(e => e.date));
  const completedCount = monthEvents.filter(e => e.status === 'confirmed').length;
  const draftCount = monthEvents.filter(e => e.status === 'draft').length;
  
  return {
    totalDaysWithReports: datesWithReports.size,
    totalEvents: monthEvents.length,
    completedEvents: completedCount,
    draftEvents: draftCount,
    progressCount: monthEvents.filter(e => e.type === 'progress').length,
    safetyCount: monthEvents.filter(e => e.type === 'safety').length,
    materialCount: monthEvents.filter(e => e.type === 'material').length,
    coordinationCount: monthEvents.filter(e => e.type === 'coordination').length,
    attendanceCount: monthEvents.filter(e => e.type === 'attendance').length
  };
}

// 暴露到全局
window.MockData = {
  PROJECTS, AREAS, WORKERS, MILESTONES, PLANS, EVENTS, HISTORY_EVENTS, ISSUES, TODAY,
  TYPE_META, ISSUE_TYPE_META, PRIORITY_META, ISSUE_STATUS_META, MILESTONE_STATUS_META, SOURCE_META,
  mockParseVoice, mockParsePhoto, mockAggregateWeekly, getDailyEvents, getMonthlyStats
};