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
// 3. 档案库 - 工人（一线劳务）
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
// 3b. 管理团队（周报 03 页·到岗管理人员名单）
// ============================================================
const MANAGEMENT_TEAM = [
  { id: 'MGR01', position: '项目经理',                              name: '侯帅',   phone: '13051103313', attendanceStatus: '已到岗' },
  { id: 'MGR02', position: '项目技术负责人兼深化设计负责人',          name: '王健',   phone: '13818589201', attendanceStatus: '已到岗' },
  { id: 'MGR03', position: '计划经理',                              name: '陈冲',   phone: '13651007882', attendanceStatus: '已到岗' },
  { id: 'MGR04', position: '生产经理（软装）',                       name: '王亚广', phone: '15910813359', attendanceStatus: '已到岗' },
  { id: 'MGR05', position: '生产经理（精装）',                       name: '鲍永春', phone: '13382510829', attendanceStatus: '已到岗' },
  { id: 'MGR06', position: '生产经理（机电）',                       name: '袁永超', phone: '18900125480', attendanceStatus: '已到岗' },
  { id: 'MGR07', position: '深化设计经理（软装）',                   name: '李欢',   phone: '17310298646', attendanceStatus: '已到岗' },
  { id: 'MGR08', position: '深化设计（软装）',                       name: '乔志广', phone: '13939996372', attendanceStatus: '已到岗' },
  { id: 'MGR09', position: '深化设计（软装）',                       name: '李水旺', phone: '18310163008', attendanceStatus: '已到岗' },
  { id: 'MGR10', position: '深化设计（软装）',                       name: '赵晨星', phone: '15011544879', attendanceStatus: '已到岗' },
  { id: 'MGR11', position: '深化设计（软装）',                       name: '龙方',   phone: '13974050351', attendanceStatus: '已到岗' },
  { id: 'MGR12', position: '深化设计经理（精装）',                   name: '徐诗怡', phone: '18013705168', attendanceStatus: '已到岗' },
  { id: 'MGR13', position: '深化设计（机电）',                       name: '苏尧',   phone: '13141422281', attendanceStatus: '已到岗' },
  { id: 'MGR14', position: '成本经理（软装/精装）',                  name: '郭建欣', phone: '15600173618', attendanceStatus: '已到岗' },
  { id: 'MGR15', position: '商务经理（软装/精装）',                  name: '薛智臣', phone: '18810013805', attendanceStatus: '已到岗' },
  { id: 'MGR16', position: '预算员（软装/精装）',                    name: '王迪',   phone: '15726644536', attendanceStatus: '已到岗' },
  { id: 'MGR17', position: '电气预算员（软装/精装）',                name: '邓明伟', phone: '19937244723', attendanceStatus: '已到岗' },
  { id: 'MGR18', position: '质量经理（软装）',                       name: '周建忠', phone: '13636535828', attendanceStatus: '已到岗' },
  { id: 'MGR19', position: '质量经理（精装）',                       name: '李欣霖', phone: '17631518331', attendanceStatus: '已到岗' },
  { id: 'MGR20', position: '安全经理（软装）',                       name: '孙攀岳', phone: '18501166924', attendanceStatus: '已到岗' },
  { id: 'MGR21', position: '安全经理（精装）',                       name: '赵国显', phone: '18516217962', attendanceStatus: '已到岗' },
  { id: 'MGR22', position: '资料员',                                name: '蔡丽华', phone: '18600371133', attendanceStatus: '已到岗' },
  { id: 'MGR23', position: '材料员（软装/精装）',                    name: '肖自政', phone: '15093960151', attendanceStatus: '已到岗' }
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
// 4b. 重要节点计划（周报 0301 页·表格用）
// ============================================================
const MILESTONE_PLANS = {
  baicaoyuan: [
    {
      id: 'MP001',
      category: '软装',   // '软装(清尚)' | '精装'
      nodeType: '关键节点',
      areaLabel: '食堂',
      description: '食堂、健身房、南塔咖啡厅完工',
      targetMonth: 7, year: 2026
    },
    {
      id: 'MP002',
      category: '软装',
      nodeType: '关键节点',
      areaLabel: '高管',
      description: '北塔高管区完工',
      targetMonth: 8, year: 2026
    },
    {
      id: 'MP003',
      category: '软装',
      nodeType: '次要节点',
      areaLabel: null,
      subItems: [
        { seq: 1, label: '食堂',          text: '墙柱面基层封板（5.30）410评审后方案调整导致工期延后需与总包重新协调施工计划', targetMonth: 5 },
        { seq: 2, label: '高管',          text: '墙面基层施工（3.30）', targetMonth: 3 },
        { seq: 3, label: '健身房',        text: '墙柱面基层封板（5.30）410评审后方案调整', targetMonth: 5 },
        { seq: 4, label: '南塔咖啡厅',    text: '样板段评审（3.30）', targetMonth: 3 }
      ]
    },
    {
      id: 'MP004',
      category: '软装',
      nodeType: '次要节点',
      areaLabel: null,
      subItems: [
        { seq: 1, label: '食堂',       text: '天花封板（6.15）410评审后开始龙骨施工', targetMonth: 6 },
        { seq: 2, label: '高管',       text: '吊顶造型及龙骨安装（4.30）', targetMonth: 4 },
        { seq: 3, label: '健身房',     text: '天花封板（6.15）三局机电支架影响吊顶龙骨安装', targetMonth: 6 },
        { seq: 4, label: '南塔咖啡厅', text: '天花封板（6.15）需幕墙封闭', targetMonth: 6 },
        { seq: 5, label: '北塔咖啡厅', text: '基层钢架（6.30）待样板评审后施工', targetMonth: 6 }
      ]
    },
    {
      id: 'MP005',
      category: '软装',
      nodeType: '次要节点',
      areaLabel: null,
      subItems: [
        { seq: 1, label: '食堂',       text: '地面混凝土浇筑（6.10）1层天花腻子基层后施工', targetMonth: 6 },
        { seq: 2, label: '高管',       text: '天花封板（6.30）需地暖施工后开始', targetMonth: 6 },
        { seq: 3, label: '健身房',     text: '地面石材铺贴（7.05）', targetMonth: 7 },
        { seq: 4, label: '南塔咖啡厅', text: '墙面石材干挂（6.30）', targetMonth: 6 },
        { seq: 5, label: '北塔咖啡厅', text: '墙柱面基层封板（7.15）', targetMonth: 7 }
      ]
    },
    {
      id: 'MP006',
      category: '软装',
      nodeType: '次要节点',
      areaLabel: null,
      subItems: [
        { seq: 1, label: '食堂',       text: '墙柱面饰面板安装、地面石材铺贴（8.30）', targetMonth: 8 },
        { seq: 2, label: '高管',       text: '地面面层施工（6.30）', targetMonth: 6 },
        { seq: 3, label: '健身房',     text: '运动PVC地板（8.10）', targetMonth: 8 },
        { seq: 4, label: '南塔咖啡厅', text: '墙面木饰面安装（7.30）', targetMonth: 7 },
        { seq: 5, label: '北塔咖啡厅', text: '天花封板（8.15）需根据幕墙封闭时间', targetMonth: 8 }
      ]
    },
    {
      id: 'MP007',
      category: '软装',
      nodeType: '次要节点',
      areaLabel: null,
      subItems: [
        { seq: 1, label: '食堂',       text: '食堂（9.30）', targetMonth: 9 },
        { seq: 2, label: '健身房',     text: '南北健身房（8.20）', targetMonth: 8 },
        { seq: 3, label: '南塔咖啡厅', text: '南塔咖啡厅（8.30）', targetMonth: 8 },
        { seq: 4, label: '北塔咖啡厅', text: '墙面石材干挂（8.30）', targetMonth: 8 }
      ]
    },
    {
      id: 'MP008',
      category: '软装',
      nodeType: '次要节点',
      areaLabel: null,
      subItems: [
        { seq: 1, label: '北塔高管区', text: '北塔高管区（8.30）', targetMonth: 8 },
        { seq: 2, label: '北塔咖啡厅', text: '北塔咖啡厅：墙面木饰面（9.30）', targetMonth: 9 }
      ]
    },
    {
      id: 'MP009',
      category: '精装',
      nodeType: '关键节点',
      areaLabel: null,
      description: '天花吊顶完成',
      targetMonth: 6, year: 2026
    },
    {
      id: 'MP010',
      category: '精装',
      nodeType: '关键节点',
      areaLabel: null,
      description: '墙面基层完成',
      targetMonth: 6, year: 2026
    },
    {
      id: 'MP011',
      category: '精装',
      nodeType: '关键节点',
      areaLabel: null,
      description: '精装验收',
      targetMonth: 7, year: 2026
    },
    {
      id: 'MP012',
      category: '精装',
      nodeType: '次要节点',
      areaLabel: null,
      subItems: [
        { seq: 1, label: '高管区',    text: '天花吊顶龙骨安装', targetMonth: 6 },
        { seq: 2, label: '员工餐厅',  text: '墙面基层封板', targetMonth: 6 },
        { seq: 3, label: '多功能厅',  text: '地面找平', targetMonth: 6 },
        { seq: 4, label: '高管区',    text: '天花封板', targetMonth: 7 },
        { seq: 5, label: '员工餐厅',  text: '墙面饰面板安装', targetMonth: 7 },
        { seq: 6, label: '商业展示区', text: '地面石材铺贴', targetMonth: 7 }
      ]
    }
  ]
};

// ============================================================
// 5. 日计划数据（localStorage 持久化）
// ============================================================
const DEFAULT_PLANS = {
  baicaoyuan: [
    {
      id: 'PLAN001',
      projectId: 'baicaoyuan',
      date: '2026-06-05',
      startDate: '2026-06-05',
      endDate: '2026-06-12',
      description: '今日继续推进各区域精装施工',
      taskName: '各区域精装施工',
      progress: '60%',
      status: 'active',
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
      startDate: '2026-06-04',
      endDate: '2026-06-12',
      description: '推进天花吊顶和墙面施工',
      taskName: '天花吊顶和墙面施工',
      progress: '50%',
      status: 'active',
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
      startDate: '2026-06-03',
      endDate: '2026-06-12',
      description: '各区域正常施工',
      taskName: '各区域正常施工',
      progress: '30%',
      status: 'active',
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
    },
    {
      id: 'PLAN004',
      projectId: 'baicaoyuan',
      date: '2026-06-13',
      startDate: '2026-06-13',
      endDate: '2026-06-19',
      description: '推进各区域精装收尾',
      taskName: '各区域精装收尾',
      progress: '70%',
      status: 'active',
      laborSchedule: [
        { laborType: '木工', count: 8 },
        { laborType: '电工', count: 4 },
        { laborType: '油漆工', count: 3 },
        { laborType: '瓦工', count: 2 }
      ],
      areaTargets: [
        { areaId: 'A1', taskName: '墙面面层', targetProgress: '80%' },
        { areaId: 'A3', taskName: '石材铺贴', targetProgress: '60%' }
      ],
      createdAt: '2026-06-13T07:00:00Z'
    },
    {
      id: 'PLAN005',
      projectId: 'baicaoyuan',
      date: '2026-06-15',
      startDate: '2026-06-15',
      endDate: '2026-06-21',
      description: '下阶段收尾和验收准备',
      taskName: '下阶段收尾和验收准备',
      progress: '0%',
      status: 'planned',
      laborSchedule: [
        { laborType: '木工', count: 6 },
        { laborType: '电工', count: 3 },
        { laborType: '油漆工', count: 4 },
        { laborType: '瓦工', count: 1 },
        { laborType: '水电工', count: 2 }
      ],
      areaTargets: [],
      createdAt: '2026-06-13T08:00:00Z'
    }
  ],
  'lvcheng-riverside': [],
  'vanke-metropolis': []
};

// 从 localStorage 读取，若不存在则使用默认值并写入
let PLANS;
try {
  const stored = localStorage.getItem('daily_plans');
  const SCHEMA_VERSION = 'v3';
  const storedVersion = localStorage.getItem('daily_plans_version');
  if (stored && storedVersion === SCHEMA_VERSION) {
    PLANS = JSON.parse(stored);
  } else {
    PLANS = JSON.parse(JSON.stringify(DEFAULT_PLANS));
    localStorage.setItem('daily_plans', JSON.stringify(PLANS));
    localStorage.setItem('daily_plans_version', SCHEMA_VERSION);
  }
} catch (e) {
  PLANS = JSON.parse(JSON.stringify(DEFAULT_PLANS));
}

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

// 今天的事件流（含 localStorage 持久化）
let EVENTS; try { const s = localStorage.getItem('daily_events'); EVENTS = s ? JSON.parse(s) : null; } catch(e) {}
const DEFAULT_EVENTS = [
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
    status: 'confirmed',
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
    status: 'confirmed',
    voiceText: '',
    photos: [
      { id: 'P001', caption: '高管区墙面基层处理现场', area: 'A1' }
    ],
    note: 'AI 自动识别为"墙面基层处理"，已确认'
  },
  {
    id: 'E008',
    projectId: 'baicaoyuan',
    date: TODAY,
    time: '11:00',
    type: 'progress',
    areaId: 'A1',
    payload: {
      taskName: '一层高管办公室龙骨吊顶',
      progress: '100%',
      status: '已完成',
      owner: '鲍永春',
      headcount: 4
    },
    submitter: '李华',
    source: 'manual',
    confidence: 1.0,
    status: 'confirmed',
    note: ''
  },
  {
    id: 'E009',
    projectId: 'baicaoyuan',
    date: TODAY,
    time: '11:30',
    type: 'progress',
    areaId: 'A1',
    payload: {
      taskName: '二层房间内地暖盘管',
      progress: '100%',
      status: '已完成',
      owner: '鲍永春',
      headcount: 3
    },
    submitter: '李华',
    source: 'manual',
    confidence: 1.0,
    status: 'confirmed',
    note: ''
  },
  {
    id: 'E010',
    projectId: 'baicaoyuan',
    date: TODAY,
    time: '13:00',
    type: 'progress',
    areaId: 'A1',
    payload: {
      taskName: '一层西侧走道龙骨吊顶',
      progress: '80%',
      status: '进行中',
      owner: '鲍永春',
      headcount: 2
    },
    submitter: '李华',
    source: 'manual',
    confidence: 1.0,
    status: 'confirmed',
    note: ''
  },
  {
    id: 'E011',
    projectId: 'baicaoyuan',
    date: TODAY,
    time: '13:30',
    type: 'progress',
    areaId: 'A1',
    payload: {
      taskName: '一层北侧走道龙骨吊顶',
      progress: '80%',
      status: '进行中',
      owner: '鲍永春',
      headcount: 2
    },
    submitter: '李华',
    source: 'manual',
    confidence: 1.0,
    status: 'confirmed',
    note: ''
  },
  {
    id: 'E012',
    projectId: 'baicaoyuan',
    date: TODAY,
    time: '14:30',
    type: 'progress',
    areaId: 'A1',
    payload: {
      taskName: '一二层墙面钢架及龙骨基层',
      progress: '85%',
      status: '进行中',
      owner: '鲍永春',
      headcount: 3
    },
    submitter: '李华',
    source: 'manual',
    confidence: 1.0,
    status: 'confirmed',
    note: ''
  },
  {
    id: 'E013',
    projectId: 'baicaoyuan',
    date: TODAY,
    time: '15:00',
    type: 'progress',
    areaId: 'A1',
    payload: {
      taskName: '首二层后勤区域地面砖铺贴',
      progress: '90%',
      status: '进行中',
      owner: '鲍永春',
      headcount: 4
    },
    submitter: '李华',
    source: 'manual',
    confidence: 1.0,
    status: 'confirmed',
    note: ''
  },
  {
    id: 'E014',
    projectId: 'baicaoyuan',
    date: TODAY,
    time: '15:30',
    type: 'progress',
    areaId: 'A1',
    payload: {
      taskName: '首二层地暖房间防水',
      progress: '100%',
      status: '已完成',
      owner: '鲍永春',
      headcount: 2
    },
    submitter: '李华',
    source: 'manual',
    confidence: 1.0,
    status: 'confirmed',
    note: ''
  },
  {
    id: 'E015',
    projectId: 'baicaoyuan',
    date: TODAY,
    time: '16:00',
    type: 'progress',
    areaId: 'A1',
    payload: {
      taskName: '首二层地暖房间回填',
      progress: '100%',
      status: '已完成',
      owner: '鲍永春',
      headcount: 3
    },
    submitter: '李华',
    source: 'manual',
    confidence: 1.0,
    status: 'confirmed',
    note: ''
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
if (!EVENTS) { EVENTS = DEFAULT_EVENTS.map(e => ({...e})); localStorage.setItem('daily_events', JSON.stringify(EVENTS)); }
function saveEventsToStorage() { try { localStorage.setItem('daily_events', JSON.stringify(EVENTS)); } catch(e) {} }
function savePlansToStorage() { try { localStorage.setItem('daily_plans', JSON.stringify(PLANS)); } catch(e) {} }

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
    photos: [],
    proposeDept: '清尚项目部',
    cooperateDept: '石材供应商'
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
  },
  {
    id: 'I005',
    projectId: 'baicaoyuan',
    type: 'coordination',
    title: '高管区暖通管线与吊顶标高冲突',
    areaId: 'A1',
    priority: 'high',
    status: 'in_progress',
    createdDate: '2026-06-03',
    deadline: '2026-06-12',
    owner: '鲍永春',
    description: '二层北侧走道暖通主管道标高低于吊顶设计标高，需协调三局机电调整',
    resolution: '',
    photos: [],
    proposeDept: '精装项目部',
    cooperateDept: '三局机电部'
  },
  {
    id: 'I006',
    projectId: 'baicaoyuan',
    type: 'coordination',
    title: '食堂区幕墙封闭时间需确认',
    areaId: 'A2',
    priority: 'high',
    status: 'open',
    createdDate: '2026-06-04',
    deadline: '2026-06-10',
    owner: '王亚广',
    description: '食堂区南立面幕墙尚未封闭，影响室内天花封板工序，需确认幕墙单位进场时间',
    resolution: '',
    photos: [],
    proposeDept: '精装项目部',
    cooperateDept: '幕墙单位、总包'
  },
  {
    id: 'I007',
    projectId: 'baicaoyuan',
    type: 'coordination',
    title: '南塔咖啡厅机电移交滞后',
    areaId: 'A3',
    priority: 'high',
    status: 'open',
    createdDate: '2026-06-02',
    deadline: '2026-06-15',
    owner: '袁永超',
    description: '南塔咖啡厅区域风管、喷淋追位未完成，精装吊顶无法封板',
    resolution: '',
    photos: [],
    proposeDept: '精装项目部',
    cooperateDept: '三局机电部、消防单位'
  },
  {
    id: 'I008',
    projectId: 'baicaoyuan',
    type: 'coordination',
    title: '北塔样板区石材大板供应',
    areaId: 'A1',
    priority: 'medium',
    status: 'in_progress',
    createdDate: '2026-05-30',
    deadline: '2026-06-08',
    owner: '陈芳',
    description: '北塔咖啡厅样板区所需石材大板供货周期45天，需协调供应商加急排产',
    resolution: '已联系供应商确认加急排产，预计6月15日前到场',
    photos: [],
    proposeDept: '清尚采购部',
    cooperateDept: '石材供应商、项目部'
  },
  {
    id: 'I009',
    projectId: 'baicaoyuan',
    type: 'coordination',
    title: '地暖施工与精装交叉作业面移交',
    areaId: 'A1',
    priority: 'medium',
    status: 'in_progress',
    createdDate: '2026-06-01',
    deadline: '2026-06-10',
    owner: '鲍永春',
    description: '高管区地暖施工完成后需移交精装进行地面面层施工，移交标准需各方确认',
    resolution: '',
    photos: [],
    proposeDept: '精装项目部',

  }
];

// ============================================================
// 7b. ECC 销项（周报 07 页）
// ============================================================
const ECC_ITEMS = [
  { id: 'ECC001', projectId: 'baicaoyuan', title: '餐厅区天花平整度偏差', areaId: 'A2', discoveredDate: '2026-04-10', status: 'closed', closedDate: '2026-05-15' },
  { id: 'ECC002', projectId: 'baicaoyuan', title: '高管办公区墙面石材色差', areaId: 'A1', discoveredDate: '2026-04-12', status: 'closed', closedDate: '2026-05-10' },
  { id: 'ECC003', projectId: 'baicaoyuan', title: '多功能厅地面空鼓', areaId: 'A3', discoveredDate: '2026-04-15', status: 'closed', closedDate: '2026-05-20' },
  { id: 'ECC004', projectId: 'baicaoyuan', title: '商业展示区灯具定位偏差', areaId: 'A4', discoveredDate: '2026-04-18', status: 'closed', closedDate: '2026-05-22' },
  { id: 'ECC005', projectId: 'baicaoyuan', title: '食堂区消防喷淋追位未完成', areaId: 'A2', discoveredDate: '2026-04-20', status: 'closed', closedDate: '2026-05-25' },
  { id: 'ECC006', projectId: 'baicaoyuan', title: '高管区地暖管间距不合规', areaId: 'A1', discoveredDate: '2026-04-22', status: 'closed', closedDate: '2026-05-18' },
  { id: 'ECC007', projectId: 'baicaoyuan', title: '南塔咖啡厅幕墙密封胶开裂', areaId: 'A3', discoveredDate: '2026-04-25', status: 'closed', closedDate: '2026-05-28' },
  { id: 'ECC008', projectId: 'baicaoyuan', title: '北塔咖啡厅基层龙骨间距超标', areaId: 'A1', discoveredDate: '2026-04-28', status: 'closed', closedDate: '2026-06-01' },
  { id: 'ECC009', projectId: 'baicaoyuan', title: '食堂B1层墙面基层返潮', areaId: 'A2', discoveredDate: '2026-05-05', status: 'closed', closedDate: '2026-06-03' },
  { id: 'ECC010', projectId: 'baicaoyuan', title: '高管区吊顶转换层焊接缺陷', areaId: 'A1', discoveredDate: '2026-05-08', status: 'closed', closedDate: '2026-06-05' },
  { id: 'ECC011', projectId: 'baicaoyuan', title: '南塔健身房岩板排版与图纸不符', areaId: 'A3', discoveredDate: '2026-05-10', status: 'closed', closedDate: '2026-06-06' },
  { id: 'ECC012', projectId: 'baicaoyuan', title: '食堂区电气配管未按图施工', areaId: 'A2', discoveredDate: '2026-05-12', status: 'closed', closedDate: '2026-06-07' },
  { id: 'ECC013', projectId: 'baicaoyuan', title: '高管办公区窗台板安装偏差', areaId: 'A1', discoveredDate: '2026-05-15', status: 'closing', closedDate: null },
  { id: 'ECC014', projectId: 'baicaoyuan', title: '多功能厅声学构造未按图施工', areaId: 'A3', discoveredDate: '2026-05-18', status: 'open', closedDate: null },
  { id: 'ECC015', projectId: 'baicaoyuan', title: '商业展示区金属收边条色差', areaId: 'A4', discoveredDate: '2026-05-20', status: 'open', closedDate: null },
  { id: 'ECC016', projectId: 'baicaoyuan', title: '食堂二层天花水平度超差', areaId: 'A2', discoveredDate: '2026-05-22', status: 'open', closedDate: null },
  { id: 'ECC017', projectId: 'baicaoyuan', title: '高管区木饰面纹理方向错误', areaId: 'A1', discoveredDate: '2026-05-25', status: 'open', closedDate: null },
  { id: 'ECC018', projectId: 'baicaoyuan', title: '南塔咖啡厅地面石材断裂', areaId: 'A3', discoveredDate: '2026-05-28', status: 'open', closedDate: null },
  { id: 'ECC019', projectId: 'baicaoyuan', title: '北塔咖啡厅隔墙龙骨间距过大', areaId: 'A1', discoveredDate: '2026-05-30', status: 'open', closedDate: null },
  { id: 'ECC020', projectId: 'baicaoyuan', title: '食堂B1层给水管压力测试不合格', areaId: 'A2', discoveredDate: '2026-06-01', status: 'open', closedDate: null },
  // 不计入总计的遗漏项（仅用于展示已关闭+流程中）
  { id: 'ECC099', projectId: 'baicaoyuan', title: '历史遗留项（不计入）', areaId: 'A4', discoveredDate: '2026-03-01', status: 'closing', closedDate: null },
];

// ============================================================
// 7c. 图纸深化（周报 08 页）
// ============================================================
const DRAWING_DEEPENINGS = [
  { id: 'DD001', projectId: 'baicaoyuan', task: '1-2号咖啡厅样板段策划整理',                owner: '李欢',   status: '已完成' },
  { id: 'DD002', projectId: 'baicaoyuan', task: '与设计沟通1~2号咖啡厅图纸问题',            owner: '李欢',   status: '进行中' },
  { id: 'DD003', projectId: 'baicaoyuan', task: '负一层二层档口修改方案调整图纸；二层立面修改方案调整图纸', owner: '乔志广', status: '已完成' },
  { id: 'DD004', projectId: 'baicaoyuan', task: '负一层~二层节点图和立面图修改/幕墙处理节点调整/食堂设计变更整理', owner: '乔志广', status: '进行中' },
  { id: 'DD005', projectId: 'baicaoyuan', task: '对接旋转楼梯图纸/岩板弧角打样/对接木饰面清单', owner: '徐诗怡', status: '已完成' },
  { id: 'DD006', projectId: 'baicaoyuan', task: '打样',                                      owner: '徐诗怡', status: '进行中' },
  { id: 'DD007', projectId: 'baicaoyuan', task: '3号咖啡厅图纸深化完成已和业主确认签字',    owner: '李水旺', status: '已完成' },
  { id: 'DD008', projectId: 'baicaoyuan', task: '4号咖啡厅图纸根据设计意见和样板评审意见进行调整', owner: '李水旺', status: '进行中' }
];

// ============================================================
// 7d. 周计划甘特图（周报 09 页）
// ============================================================
const WEEKLY_GANTT_ITEMS = [
  // 高管层
  { id: 'WG01', area: '高管层', areaOrder: 1, seq: 1, task: '高管二层西走廊景观池施工',     durationDays: 7, schedule: [1,1,1,1,1,1,1], labor: '焊工2人', material: '已到场' },
  { id: 'WG02', area: '高管层', areaOrder: 1, seq: 2, task: '高管一二层公区天花造型吊顶',   durationDays: 7, schedule: [1,1,1,1,1,1,1], labor: '木工4人', material: '已到场' },
  { id: 'WG03', area: '高管层', areaOrder: 1, seq: 3, task: '高管二层公区造型封板',         durationDays: 7, schedule: [1,1,1,1,1,1,1], labor: '木工6人', material: '已到场' },
  { id: 'WG04', area: '高管层', areaOrder: 1, seq: 4, task: '高管一层房间内地暖施工',       durationDays: 7, schedule: [1,1,1,1,1,1,1], labor: '瓦工3人', material: '已到场' },
  { id: 'WG05', area: '高管层', areaOrder: 1, seq: 5, task: '高管一层房间内天花封板',       durationDays: 5, schedule: [0,0,1,1,1,1,1], labor: '木工4人', material: '已到场' },
  { id: 'WG06', area: '高管层', areaOrder: 1, seq: 6, task: '高管备餐间及后勤区域铝扣板吊顶', durationDays: 4, schedule: [0,0,0,1,1,1,1], labor: '木工2人', material: '已到场' },
  { id: 'WG07', area: '高管层', areaOrder: 1, seq: 7, task: '高管二层公区地暖区域防水',     durationDays: 7, schedule: [1,1,1,1,1,1,1], labor: '瓦工2人', material: '已到场' },
  // 食堂区
  { id: 'WG08', area: '食堂区', areaOrder: 2, seq: 8, task: '二层天花吊顶及封板',           durationDays: 7, schedule: [1,1,1,1,1,1,1], labor: '木工8人', material: '已到场' },
  { id: 'WG09', area: '食堂区', areaOrder: 2, seq: 9, task: '二层天花照明穿线',             durationDays: 7, schedule: [1,1,1,1,1,1,1], labor: '电工4人', material: '已到场' },
  { id: 'WG10', area: '食堂区', areaOrder: 2, seq: 10, task: '一层天花腻子',                durationDays: 7, schedule: [1,1,1,1,1,1,1], labor: '油工6人', material: '已到场' },
  { id: 'WG11', area: '食堂区', areaOrder: 2, seq: 11, task: '地下室天花吊顶',              durationDays: 7, schedule: [1,1,1,1,1,1,1], labor: '木工30人', material: '已到场' },
  { id: 'WG12', area: '食堂区', areaOrder: 2, seq: 12, task: '地下室天花照明配管',          durationDays: 7, schedule: [1,1,1,1,1,1,1], labor: '电工14人', material: '已到场' },
  // 南塔健身房
  { id: 'WG13', area: '南塔健身房', areaOrder: 3, seq: 13, task: '南健身房天花吊顶',        durationDays: 7, schedule: [1,1,1,1,1,1,1], labor: '木工2人', material: '已到场' },
  { id: 'WG14', area: '南塔健身房', areaOrder: 3, seq: 14, task: '墙地面岩板铺贴',          durationDays: 7, schedule: [1,1,1,1,1,1,1], labor: '瓦工8人', material: '已到场' },
  // 南塔咖啡厅
  { id: 'WG15', area: '南塔咖啡厅', areaOrder: 4, seq: 15, task: '墙面封板',                durationDays: 7, schedule: [1,1,1,1,1,1,1], labor: '木工2人', material: '已到场' },
  { id: 'WG16', area: '南塔咖啡厅', areaOrder: 4, seq: 16, task: '天花机电布管',            durationDays: 7, schedule: [1,1,1,1,1,1,1], labor: '电工4人', material: '已到场' },
  { id: 'WG17', area: '南塔咖啡厅', areaOrder: 4, seq: 17, task: '天花吊顶龙骨排布',        durationDays: 7, schedule: [1,1,1,1,1,1,1], labor: '木工8人', material: '已到场' },
  { id: 'WG18', area: '南塔咖啡厅', areaOrder: 4, seq: 18, task: '墙面钢架焊接',            durationDays: 7, schedule: [1,1,1,1,1,1,1], labor: '焊工2人', material: '已到场' },
  // 北咖啡厅
  { id: 'WG19', area: '北咖啡厅', areaOrder: 5, seq: 19, task: '操作间地面回填',            durationDays: 3, schedule: [0,0,0,0,1,1,1], labor: '瓦工2人', material: '已到场' },
  { id: 'WG20', area: '北咖啡厅', areaOrder: 5, seq: 20, task: '操作间地面JS防水施工',      durationDays: 4, schedule: [1,1,1,1,0,0,0], labor: '防水2人', material: '已到场' },
  { id: 'WG21', area: '北咖啡厅', areaOrder: 5, seq: 21, task: '样板区隔墙龙骨施工',        durationDays: 7, schedule: [1,1,1,1,1,1,1], labor: '木工4人', material: '已到场' }
];

// ============================================================
// 7e. 施工段计划（周报 11 页）
// ============================================================
const CONSTRUCTION_ZONE_SCHEDULES = [
  { id: 'CZ01', building: '食堂', location: '墙面', process: '基层钢架（含墙面配管）',
    floors: [
      { floor: '一层',  startDate: '5/5',  endDate: '5/15',  days: 10 },
      { floor: '二层',  startDate: '5/16', endDate: '5/31',  days: 15 },
      { floor: 'B1(1)', startDate: '4/30', endDate: '5/15',  days: 15 },
      { floor: 'B1(2)', startDate: '5/31', endDate: '6/20',  days: 20 }
    ]},
  { id: 'CZ02', building: '食堂', location: '墙面', process: '墙柱面基层封板',
    floors: [
      { floor: '一层',  startDate: '5/16', endDate: '5/23',  days: 7 },
      { floor: '二层',  startDate: '',     endDate: '',      days: '' },
      { floor: 'B1(1)', startDate: '5/16', endDate: '5/23',  days: 7 },
      { floor: 'B1(2)', startDate: '',     endDate: '',      days: '' }
    ]},
  { id: 'CZ03', building: '食堂', location: '墙面', process: '墙柱饰面材料深化下单',
    floors: [
      { floor: '一层',  startDate: '5/15', endDate: '6/4',   days: 20 },
      { floor: '二层',  startDate: '5/25', endDate: '6/14',  days: 20 },
      { floor: 'B1(1)', startDate: '5/15', endDate: '6/4',   days: 20 },
      { floor: 'B1(2)', startDate: '5/25', endDate: '6/14',  days: 20 }
    ]},
  { id: 'CZ04', building: '食堂', location: '墙面', process: '墙柱面饰面板安装',
    floors: [
      { floor: '一层',  startDate: '', endDate: '', days: '' },
      { floor: '二层',  startDate: '', endDate: '', days: '' },
      { floor: 'B1(1)', startDate: '', endDate: '', days: '' },
      { floor: 'B1(2)', startDate: '', endDate: '', days: '' }
    ]},
  { id: 'CZ05', building: '食堂', location: '天花', process: '1专业管线移交',
    floors: [
      { floor: '一层',  startDate: '3/20', endDate: '3/20', days: '已移交' },
      { floor: '二层',  startDate: '4/20', endDate: '4/20', days: '未移交' },
      { floor: 'B1(1)', startDate: '4/30', endDate: '4/30', days: '未移交' },
      { floor: 'B1(2)', startDate: '4/30', endDate: '4/30', days: '未移交' }
    ]},
  { id: 'CZ06', building: '食堂', location: '天花', process: '2转换钢架造型龙骨及风管定位',
    floors: [
      { floor: '一层',  startDate: '3/21', endDate: '4/15', days: 25 },
      { floor: '二层',  startDate: '4/21', endDate: '5/11', days: 20 },
      { floor: 'B1(1)', startDate: '5/1',  endDate: '5/21', days: 20 },
      { floor: 'B1(2)', startDate: '5/11', endDate: '5/31', days: 20 }
    ]},
  { id: 'CZ07', building: '食堂', location: '天花', process: '3龙骨安装、风管追位、机电末端定位',
    floors: [
      { floor: '一层',  startDate: '4/8',  endDate: '4/28',  days: 20 },
      { floor: '二层',  startDate: '5/1',  endDate: '5/26',  days: 25 },
      { floor: 'B1(1)', startDate: '5/11', endDate: '6/5',   days: 25 },
      { floor: 'B1(2)', startDate: '5/21', endDate: '6/15',  days: 25 }
    ]},
  { id: 'CZ08', building: '食堂', location: '天花', process: '4天花末端追位',
    floors: [
      { floor: '一层',  startDate: '4/18', endDate: '5/8',  days: 20 },
      { floor: '二层',  startDate: '5/11', endDate: '5/31', days: 20 },
      { floor: 'B1(1)', startDate: '5/26', endDate: '6/15', days: 20 },
      { floor: 'B1(2)', startDate: '',     endDate: '',     days: '' }
    ]},
  { id: 'CZ09', building: '食堂', location: '天花', process: '5联合隐蔽验收',
    floors: [
      { floor: '一层',  startDate: '5/8',  endDate: '5/15',  days: 7 },
      { floor: '二层',  startDate: '',     endDate: '',      days: '' },
      { floor: 'B1(1)', startDate: '',     endDate: '',      days: '' },
      { floor: 'B1(2)', startDate: '',     endDate: '',      days: '' }
    ]},
  { id: 'CZ10', building: '食堂', location: '天花', process: '6天花封板',
    floors: [
      { floor: '一层',  startDate: '5/16', endDate: '5/31', days: 15 },
      { floor: '二层',  startDate: '',     endDate: '',     days: '' },
      { floor: 'B1(1)', startDate: '',     endDate: '',     days: '' },
      { floor: 'B1(2)', startDate: '',     endDate: '',     days: '' }
    ]},
  { id: 'CZ11', building: '食堂', location: '天花', process: '7天花腻子基层及底漆施工（断灰尘）',
    floors: [
      { floor: '一层',  startDate: '5/23', endDate: '6/22', days: 30 },
      { floor: '二层',  startDate: '',     endDate: '',     days: '' },
      { floor: 'B1(1)', startDate: '',     endDate: '',     days: '' },
      { floor: 'B1(2)', startDate: '',     endDate: '',     days: '' }
    ]}
];

// ============================================================
// 8. 工具函数
// ============================================================

// 类型显示配置
const TYPE_META = {
  progress:    { label: '进度',     color: '#00adef', icon: '🔨', bgClass: 'type-progress' },
  material:    { label: '材料',     color: '#f59e0b', icon: '📦', bgClass: 'type-material' },
  safety:      { label: '安全',     color: '#ef4444', icon: '🛡', bgClass: 'type-safety' },
  coordination:{ label: '协调',     color: '#8b5cf6', icon: '🤝', bgClass: 'type-coordination' },
  attendance:  { label: '考勤',     color: '#10b981', icon: '👥', bgClass: 'type-attendance' },
  drawing:     { label: '图纸深化', color: '#6366f1', icon: '📐', bgClass: 'type-drawing' }
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
function mockParseVoice(text, projectId, areas, workers, plans) {
  const result = {
    type: 'progress',
    areaId: (AREAS[projectId] || [])?.[0]?.id || 'A1',
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
    confidence: 0.85
  };

  // 图纸深化类型识别（优先于默认 progress）
  const drawingKeywords = ['图纸深化', '深化设计', '深化图', '节点图', '立面图', '幕墙节点', '打样', '样板段', '旋转楼梯', '岩板', '木饰面清单', '弧角打样'];
  if (drawingKeywords.some(kw => text.includes(kw))) {
    result.type = 'drawing';
    // 进度提取
    const progMatch = text.match(/(\d+%?)\s*进度/);
    if (progMatch) result.payload.progress = progMatch[1];
    // 复用任务提取
    const drawTaskMatch = text.match(/(图纸深化|深化)([\u4e00-\u9fa5、，；\s\d号-]{0,40})/);
    if (drawTaskMatch) result.payload.taskName = (drawTaskMatch[1] + (drawTaskMatch[2] || '')).trim().slice(0, 40);
    else {
      // 抓取包含图纸/打样/样板的整段描述
      const descMatch = text.match(/[\u4e00-\u9fa5、，；\d号-]{4,40}/);
      if (descMatch) result.payload.taskName = descMatch[0];
    }
  }

  // 提取区域
  for (const area of (AREAS[projectId] || [])) {
    if (text.includes(area.name) || text.includes(area.id)) {
      result.areaId = area.id;
      break;
    }
  }

  // 匹配计划
  const projectPlans = plans || PLANS[projectId] || [];
  for (const plan of projectPlans) {
    const planTask = (plan.taskName || plan.process || '').toLowerCase();
    const textLower = text.toLowerCase();
    if (planTask && textLower.includes(planTask.slice(0, 4))) {
      result.planId = plan.id;
      break;
    }
  }

  // 提取工种 / 负责人
  const workerMatch = WORKERS.find(w => text.includes(w.name));
  if (workerMatch) {
    result.payload.owner = workerMatch.name;
  }

  // 提取人数
  const countMatch = text.match(/(\d+)\s*[人个名位]/);
  let headcount = 0;
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

  // 提取工种信息构建 laborRequirements
  const trades = ['木工', '泥工', '电工', '焊工', '油漆工', '水暖工', '钢筋工', '架子工'];
  const foundTrades = trades.filter(t => text.includes(t));
  if (foundTrades.length > 0 && headcount > 0) {
    result.laborRequirements = foundTrades.map(trade => ({
      trade,
      count: Math.max(1, Math.round(headcount / foundTrades.length))
    }));
  }

  // completionType 判断
  if (text.includes('计划外') || text.includes('新增') || text.includes('临时') || text.includes('突发')) {
    result.completionType = 'unplanned';
    result.planId = '';
  }

  return result;
}

// 模拟"照片 → 元数据"
function mockParsePhoto(caption, areas = AREAS[CURRENT_PROJECT_ID] || [], plans = PLANS[CURRENT_PROJECT_ID] || []) {
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
    
    // 匹配计划
    for (const plan of plans) {
      const planTask = (plan.taskName || plan.process || '').toLowerCase();
      const capLower = caption.toLowerCase();
      if (planTask && capLower.includes(planTask.slice(0, 4))) {
        planId = plan.id;
        break;
      }
    }
    
    // 智能匹配区域
    if (areas && areas.length > 0) {
      for (const area of areas) {
        if (caption.includes(area.name)) {
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
    caption: 'AI 自动生成描述：' + (caption || '施工现场'),
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
    confidence: 0.80
  };
}

// 模拟"周报聚合"
function mockAggregateWeekly(projectId, weekStart, weekEnd) {
  // 关键：从 window.MockData 读取（init 时会被后端 /api/data/all 覆盖为 PostgreSQL 数据）
  // 不能用模块级 const（永远是 mock 默认值，刷新后不会更新）
  const MD = (typeof window !== 'undefined' && window.MockData) || {};
  const projects = MD.PROJECTS || PROJECTS;
  const areasMap = MD.AREAS || AREAS;
  const events = MD.EVENTS || EVENTS;
  const historyEvents = MD.HISTORY_EVENTS || HISTORY_EVENTS;
  const issues = MD.ISSUES || ISSUES;

  const project = projects.find(p => p.id === projectId);
  const areas = areasMap[projectId] || [];
  const allEvents = [...events, ...historyEvents];
  const weekEvents = allEvents.filter(e => e.projectId === projectId && e.date >= weekStart && e.date <= weekEnd);
  const weekIssues = issues.filter(i => i.projectId === projectId);
  const coordinationIssues = weekIssues.filter(i => i.type === 'coordination' && i.status !== 'closed');

  return {
    projectName: project.name,
    client: project.client,
    weekRange: `${weekStart} ~ ${weekEnd}`,
    overview: `本周（${weekStart} ~ ${weekEnd}）${project.name} 持续推进精装施工。累计完成 ${weekEvents.filter(e => e.type === 'progress').length} 项进度任务，处理 ${weekIssues.length} 项专项事项（含 ${coordinationIssues.length} 项协调事宜）。整体施工有序，质量、安全可控。`,
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
    coordinationIssues: coordinationIssues.map((i, idx) => ({
      seq: idx + 1,
      title: i.title,
      proposeDept: i.proposeDept || '—',
      cooperateDept: i.cooperateDept || '—'
    })),
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

// ============================================================
// 9. 周报数据映射（原型：日报 → 12 页周报）
// ============================================================

// --- 页面 04：上周工作完成情况 ---
// 从 EVENTS（progress 类型）聚合周报"工作完成"表格数据
function getPage04Data(projectId, weekStart, weekEnd) {
  // 关键：从 window.MockData 读取（init 时会被后端 /api/data/all 覆盖为 PostgreSQL 数据）
  const MD = (typeof window !== 'undefined' && window.MockData) || {};
  const events = MD.EVENTS || EVENTS;
  const historyEvents = MD.HISTORY_EVENTS || HISTORY_EVENTS;
  const allEvents = [...events, ...historyEvents];
  let weekEvents = allEvents.filter(e =>
    e.projectId === projectId &&
    e.type === 'progress' &&
    e.date >= weekStart && e.date <= weekEnd &&
    e.status === 'confirmed'
  );

  // 同一计划本周内多次填报 → 只保留最新一条（取本周最终状态）
  weekEvents.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const dedup = new Map();
  const noPlan = [];
  weekEvents.forEach(e => {
    if (e.planId) {
      const key = e.planId;
      dedup.set(key, e); // 排序后遍历，最后一条即最新，自动覆盖
    } else {
      noPlan.push(e);
    }
  });
  weekEvents = [...noPlan, ...dedup.values()];

  // 按区域分组
  const groups = {};
  weekEvents.forEach(e => {
    const key = e.areaId || '__unknown__';
    if (!groups[key]) groups[key] = [];
    groups[key].push(e);
  });

  const rows = [];
  let seq = 0;
  const AREAS_SRC = MD.AREAS || AREAS;
  Object.entries(groups).forEach(([areaId, events]) => {
    const area = (this && this.customAreas && this.customAreas[projectId] || []).find(a => a.id === areaId) || (AREAS_SRC[projectId] || []).find(a => a.id === areaId);
    const areaName = area ? area.name : areaId;
    // 区域 header 行
    rows.push({ type: 'header', text: `${areaName}：` });
    // 具体事项行
    events.forEach(e => {
      seq++;
      const task = e.payload?.taskName || e.payload?.topic || '(未命名)';
      const progress = e.payload?.progress || '';
      rows.push({
        type: 'detail',
        seq: seq,
        text: progress ? `${task}完成${progress}` : task,
        owner: e.payload?.owner || '—'
      });
    });
  });
  return rows;
}

// --- 页面 05：工作现场照片 ---
function getPage05Photos(projectId, weekStart, weekEnd, maxCount = 6) {
  // 关键：从 window.MockData 读取（init 时会被后端 /api/data/all 覆盖为 PostgreSQL 数据）
  const MD = (typeof window !== 'undefined' && window.MockData) || {};
  const events = MD.EVENTS || EVENTS;
  const historyEvents = MD.HISTORY_EVENTS || HISTORY_EVENTS;
  const allEvents = [...events, ...historyEvents];
  const weekEvents = allEvents.filter(e =>
    e.projectId === projectId &&
    e.date >= weekStart && e.date <= weekEnd &&
    e.status === 'confirmed'
  );
  // 按区域聚合照片
  const byArea = {};
  weekEvents.forEach(e => {
    const areaId = e.areaId || '__unknown__';
    (e.photos || []).forEach(p => {
      if (!byArea[areaId]) byArea[areaId] = [];
      byArea[areaId].push({
        id: p.id,
        caption: p.caption || '现场照片',
        area: p.area || e.areaId || '',
        eventType: e.type,
        eventId: e.id,
        date: e.date,
        data: p.data || '',
        showInReport: p.showInReport !== false
      });
    });
  });
  // 输出：混合 header + photo 行，page05 分页器可直接渲染
  const AREAS_SRC = MD.AREAS || AREAS;
  const areas = AREAS_SRC[projectId] || [];
  const items = [];
  let total = 0;
  Object.entries(byArea).forEach(([areaId, photos]) => {
    if (photos.length === 0) return;
    const area = (this && this.customAreas && this.customAreas[projectId] || []).find(a => a.id === areaId) || areas.find(a => a.id === areaId);
    const areaName = area ? area.name : (areaId === '__unknown__' ? '未分类' : areaId);
    items.push({ type: 'header', text: areaName, count: photos.length });
    photos.forEach(p => { items.push({ type: 'photo', ...p }); total++; });
  });
  return { items, total };
}

// --- 页面 01：封面 ---
function getPage01Data(projectId, dateOverride) {
  // 关键：从 window.MockData 读取（init 时会被后端 /api/data/all 覆盖为 PostgreSQL 数据）
  const MD = (typeof window !== 'undefined' && window.MockData) || {};
  const projects = MD.PROJECTS || PROJECTS;
  const proj = projects.find(p => p.id === projectId);
  if (!proj) return null;
  const baseDate = dateOverride || TODAY;
  const { weekStart, weekEnd } = getWeekRangeForDate(baseDate);
  const d = new Date(baseDate);
  const y = d.getFullYear(), m = d.getMonth() + 1, day = d.getDate();
  return {
    client: proj.client,
    name: proj.name,
    reporter: '北京清尚',
    dateLabel: `${y}.${m}.${day}`,
    weekLabel: `${weekStart.replace(/-/g, '.')} ~ ${weekEnd.replace(/-/g, '.')}`
  };
}

// --- 页面 03：管理人员 ---
function getPage03Data() {
  // 关键：从 window.MockData 读取（init 时会被后端 /api/data/all 覆盖为 PostgreSQL 数据）
  const MD = (typeof window !== 'undefined' && window.MockData) || {};
  const team = MD.MANAGEMENT_TEAM || MANAGEMENT_TEAM;
  return team.map((m, i) => ({
    seq: i + 1,
    position: m.position,
    name: m.name,
    phone: m.phone,
    attendance: m.attendanceStatus
  }));
}

// --- 页面 0301：重要节点（可编辑） ---

// 可编辑的里程碑数据（从 MILESTONE_PLANS 初始化）
let MILESTONE_DATA = null;

function initMilestoneData() {
  if (MILESTONE_DATA) return;
  const MD = (typeof window !== 'undefined' && window.MockData) || {};
  const projectId = CURRENT_PROJECT_ID;
  const apiPlans = (MD.MILESTONE_PLANS && MD.MILESTONE_PLANS[projectId]);
  const plans = Array.isArray(apiPlans) ? apiPlans : [];
  const monthSet = new Set();
  plans.forEach(p => {
    if (p.targetMonth) monthSet.add(p.targetMonth);
    (p.subItems || []).forEach(s => { if (s.targetMonth) monthSet.add(s.targetMonth); });
  });
  const months = [...monthSet].sort((a, b) => a - b);
  const year = (plans[0] && plans[0].year) || 2026;
  const monthKeys = months.map(m => `${year}.${m}`);
  const cats = {};
  plans.forEach(p => {
    if (!cats[p.category]) cats[p.category] = {};
    if (p.nodeType === '关键节点') {
      // targetMonth 为 0 的是空行占位，创建空 entry 保持专业存在
      if (p.targetMonth === 0) {
        cats[p.category]['关键节点'] = { rowType: 'key', cells: {} };
        return;
      }
      const val = (p.areaLabel || '') + ' ' + (p.description || '');
      if (!cats[p.category]['关键节点']) {
        cats[p.category]['关键节点'] = { rowType: 'key', cells: {} };
      }
      cats[p.category]['关键节点'].cells[`${year}.${p.targetMonth}`] = val.trim();
    } else if (p.nodeType === '次要节点') {
      // targetMonth 为 0 的是空行占位
      if (p.targetMonth === 0) {
        cats[p.category]['次要节点'] = { rowType: 'sub', cells: {} };
        return;
      }
      const items = (p.subItems || []).map(s => {
        if (s.label && s.text) return `${s.label}：${s.text}`;
        if (s.label) return s.label;
        if (s.text) return s.text;
        return '';
      }).filter(Boolean);
      // 次要节点可能没有 targetMonth，需要从 subItems 中收集
      const monthsForThisPlan = new Set();
      (p.subItems || []).forEach(s => { if (s.targetMonth) monthsForThisPlan.add(s.targetMonth); });
      if (p.targetMonth) monthsForThisPlan.add(p.targetMonth);
      monthsForThisPlan.forEach(tm => {
        const key = `${year}.${tm}`;
        cats[p.category]['次要节点'] = cats[p.category]['次要节点'] || { rowType: 'sub', cells: {} };
        cats[p.category]['次要节点'].cells[key] = (cats[p.category]['次要节点'].cells[key] || '') + items.join('\n');
      });
    }
  });
  const rows = [];
  Object.keys(cats).forEach(major => {
    Object.keys(cats[major]).forEach(row => {
      const entry = { major, row, rowType: cats[major][row].rowType };
      monthKeys.forEach(mk => { entry[mk] = cats[major][row].cells[mk] || ''; });
      rows.push(entry);
    });
  });
  MILESTONE_DATA = { months: monthKeys, rows };
}

function getMilestoneData() {
  initMilestoneData();
  return JSON.parse(JSON.stringify(MILESTONE_DATA));
}

function saveMilestoneData(data) {
  MILESTONE_DATA = data;
  try {
    const plans = _milestoneDataToPlans(data);
    const projectId = (typeof window !== 'undefined' && window.MOCK_CURRENT_PROJECT) || (typeof window !== 'undefined' && window.MockData && window.MockData.CURRENT_PROJECT_ID) || CURRENT_PROJECT_ID || (M && M.PROJECTS && M.PROJECTS[0] && M.PROJECTS[0].id);
    if (projectId) {
      const clearUrl = 'http://localhost:3010/api/milestone-plans/clear/' + encodeURIComponent(projectId);
      const xhr1 = new XMLHttpRequest();
      xhr1.open('POST', clearUrl, false);
      xhr1.send();
      if (xhr1.status !== 200) console.warn('[milestone] clear failed:', xhr1.status, xhr1.responseText);
    }
    for (const p of plans) {
      const xhr2 = new XMLHttpRequest();
      xhr2.open('POST', 'http://localhost:3010/api/milestone-plans', false);
      xhr2.setRequestHeader('Content-Type', 'application/json');
      xhr2.send(JSON.stringify(p));
      if (xhr2.status !== 200 && xhr2.status !== 201) console.warn('[milestone] save failed:', xhr2.status, xhr2.responseText);
    }
    // 同步更新内存中的 M.MILESTONE_PLANS，并重置 MILESTONE_DATA 使下次 initMilestoneData 重新读取
    if (projectId && M && M.MILESTONE_PLANS) {
      M.MILESTONE_PLANS[projectId] = plans;
    }
    MILESTONE_DATA = null;
  } catch (e) { console.warn('[milestone] 同步失败:', e); }
}

// 重置节点缓存（切换项目时调用）
function resetMilestoneCache() {
  MILESTONE_DATA = null;
}

// 设置当前项目 ID（切换项目时调用，同步模块变量 CURRENT_PROJECT_ID）
function setCurrentProjectId(pid) {
  CURRENT_PROJECT_ID = pid;
}

// MILESTONE_DATA → MILESTONE_PLANS 转换
// 输入：{ months: ['2026.5', '2026.6', ...], rows: [{ major, row, rowType, '2026.5': '...', '2026.6': '...' }] }
// 输出：[{ projectId, id, category, nodeType, areaLabel, description, targetMonth, year, subItems }]
function _milestoneDataToPlans(data) {
  if (!data || !data.rows) return [];
  const projectId = (typeof window !== 'undefined' && window.MOCK_CURRENT_PROJECT) || CURRENT_PROJECT_ID || (M && M.PROJECTS && M.PROJECTS[0] && M.PROJECTS[0].id) || 'baicaoyuan';
  const plans = [];
  const year = (data.months && data.months[0]) ? parseInt(String(data.months[0]).split('.')[0], 10) : 2026;
  data.rows.forEach((r, i) => {
    const id = 'MP' + String(900 + i).padStart(3, '0');
    // 收集该行所有月份的 cell
    const cellEntries = [];
    (data.months || []).forEach(mk => {
      const cellVal = r[mk];
      if (cellVal && String(cellVal).trim()) {
        const m = parseInt(String(mk).split('.')[1], 10);
        cellEntries.push({ month: m, value: String(cellVal) });
      }
    });
    if (r.rowType === 'key') {
      if (cellEntries.length === 0) {
        // 空行也生成一条占位 plan，否则新建专业不填内容就消失
        plans.push({
          projectId, id: id + 'K0', category: r.major, nodeType: '关键节点',
          areaLabel: '', description: '', targetMonth: 0, year, subItems: []
        });
      }
      cellEntries.forEach(e => {
        // value like "食堂 食堂、健身房完工" or just "食堂、健身房完工"
        const parts = e.value.split(/\s+/);
        const areaLabel = parts.length > 1 ? parts[0] : '';
        const desc = parts.length > 1 ? parts.slice(1).join(' ') : parts[0] || '';
        plans.push({
          projectId, id: id + 'K' + e.month, category: r.major, nodeType: '关键节点',
          areaLabel, description: desc, targetMonth: e.month, year, subItems: []
        });
      });
    } else {
      // 次要节点
      if (cellEntries.length === 0) {
        plans.push({
          projectId, id: id + 'S0', category: r.major, nodeType: '次要节点',
          areaLabel: '', description: '', targetMonth: 0, year, subItems: []
        });
      }
      const subItems = [];
      cellEntries.forEach(e => {
        e.value.split('\n').forEach(line => {
          const m = line.match(/^([^：:]+)[：:](.+)$/);
          if (m) subItems.push({ label: m[1].trim(), text: m[2].trim(), targetMonth: e.month });
          else if (line.trim()) subItems.push({ label: line.trim(), text: '', targetMonth: e.month });
        });
      });
      // 按月份分组
      const byMonth = {};
      subItems.forEach(si => { (byMonth[si.targetMonth] = byMonth[si.targetMonth] || []).push(si); });
      Object.keys(byMonth).forEach(m => {
        const mm = parseInt(m, 10);
        plans.push({
          projectId, id: id + 'S' + mm, category: r.major, nodeType: '次要节点',
          areaLabel: '', description: '', targetMonth: mm, year, subItems: byMonth[mm]
        });
      });
    }
  });
  return plans;
}

function getPage0301Data(projectId) {
  initMilestoneData();
  const { months, rows } = MILESTONE_DATA;
  // 转成渲染器需要的格式
  const cats = {};
  rows.forEach(r => {
    if (!cats[r.major]) cats[r.major] = { keyNodes: {}, subNodes: {} };
    months.forEach(mk => {
      const val = r[mk];
      if (!val) return;
      const mNum = parseInt(mk.split('.')[1], 10);
      if (r.rowType === 'key') {
        cats[r.major].keyNodes[mNum] = val;
      } else {
        if (!cats[r.major].subNodes[mNum]) cats[r.major].subNodes[mNum] = [];
        cats[r.major].subNodes[mNum].push(val);
      }
    });
  });
  const year = parseInt(months[0]?.split('.')[0] || '2026', 10);
  const monthNums = months.map(m => parseInt(m.split('.')[1], 10));
  return { year, months: monthNums, categories: cats };
}

// --- 页面 06：人员统计 ---
// 周报 06 表头兜底（DB 没数据时使用）
const DEFAULT_STANDARD_TRADES = [
  { tradeName: '5S小队',   mapFrom: '普工' },
  { tradeName: '电工',     mapFrom: '电工' },
  { tradeName: '电焊工',   mapFrom: '焊工' },
  { tradeName: '工长',     mapFrom: null },
  { tradeName: '库管',     mapFrom: null },
  { tradeName: '临电专员', mapFrom: null },
  { tradeName: '木工',     mapFrom: '木工' },
  { tradeName: '水工',     mapFrom: '水电工' },
  { tradeName: '瓦工',     mapFrom: '瓦工' },
  { tradeName: '普工',     mapFrom: null },
  { tradeName: '油工',     mapFrom: '油漆工' },
  { tradeName: '防水工',   mapFrom: null },
  { tradeName: '管理人员', mapFrom: null },
  { tradeName: '室内电梯司机', mapFrom: null }
];

function _guessTradeFromTaskName(taskName) {
  if (!taskName) return null;
  const map = [
    [/吊顶|天花|龙骨/, '木工'],
    [/墙面|找平|基层|面层|钢架/, '木工'],
    [/水电|穿线|配管|电气|电路|灯具|照明/, '水电工'],
    [/焊|钢筋/, '焊工'],
    [/油|涂料|漆/, '油漆工'],
    [/瓦|贴|石材/, '瓦工'],
    [/地暖|防水|保温/, '木工'],
    [/地砖|地面/, '瓦工'],
    [/砌|砖/, '瓦工']
  ];
  for (const [re, trade] of map) {
    if (re.test(taskName)) return trade;
  }
  return null;
}

function getPage06Data(projectId, weekStart, weekEnd, mode = 'fixed', displayField = 'tradeName', unit = 'people') {
  // 取表头：DB 优先，兜底 DEFAULT_STANDARD_TRADES（必须先解析，供数据归一化使用）
  const dbTrades = (this && this.STANDARD_TRADES && this.STANDARD_TRADES.length > 0)
    ? this.STANDARD_TRADES
    : DEFAULT_STANDARD_TRADES;
  const STANDARD_TRADES = dbTrades.map(t => ({
    id: t.id,
    trade: t.tradeName,
    mapFrom: t.mapFrom
  }));
  // 把任意工种名（mapFrom 或 tradeName 任一匹配）归一化到 mapFrom；
  // 若都不匹配（用户新增了非标准工种），原样保留。
  const findStandardKey = (raw) => {
    if (!raw) return raw;
    const t = STANDARD_TRADES.find(st => st.mapFrom === raw || st.trade === raw);
    return t && t.mapFrom ? t.mapFrom : raw;
  };

  // 本周人数：从已确认的施工进度事件汇总
  // 关键：从 window.MockData 读取（init 时会被后端 /api/data/all 覆盖为 PostgreSQL 数据）
  const MD = (typeof window !== 'undefined' && window.MockData) || {};
  const events = MD.EVENTS || EVENTS;
  const historyEvents = MD.HISTORY_EVENTS || HISTORY_EVENTS;
  const thisWeekTradeCounts = {};
  const weekEvents = [...events, ...historyEvents].filter(e =>
    e.projectId === projectId &&
    e.type === 'progress' &&
    e.status === 'confirmed' &&
    e.date >= weekStart && e.date <= weekEnd
  );
  weekEvents.forEach(e => {
    if (e.payload?.laborRequirements?.length) {
      e.payload.laborRequirements.forEach(item => {
        const trade = findStandardKey(item.trade || item.laborType);
        const count = item.count;
        if (trade && count) {
          thisWeekTradeCounts[trade] = (thisWeekTradeCounts[trade] || 0) + count;
        }
      });
    } else if (e.payload?.laborStats) {
      // attendance 事件的 laborStats: { '木工': 1, '电工': 1, ... }
      for (const rawTrade in e.payload.laborStats) {
        const count = e.payload.laborStats[rawTrade];
        const trade = findStandardKey(rawTrade);
        if (trade && count) {
          thisWeekTradeCounts[trade] = (thisWeekTradeCounts[trade] || 0) + count;
        }
      }
    } else {
      // progress 事件没有工种级数据时，根据 taskName 推测工种 + headcount
      const taskName = e.payload?.taskName || '';
      const hc = e.payload?.headcount || 0;
      const guessTrade = _guessTradeFromTaskName(taskName);
      if (guessTrade && hc) {
        const key = findStandardKey(guessTrade);
        thisWeekTradeCounts[key] = (thisWeekTradeCounts[key] || 0) + hc;
      }
    }
  });

  // 下周人数/工日：从下周区间的计划汇总
  // 口径：
  //   - people（默认）："下周期间在岗人头数"——一个 plan 只要在下周任一天活跃，完整计入 count
  //   - manDays："下周预计投入人·日"——按 plan 总工日 × overlapDays/totalDays 比例分摊
  const fmtDate = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const nextMon = new Date(weekEnd);
  nextMon.setDate(nextMon.getDate() + 1);
  const nextSun = new Date(nextMon);
  nextSun.setDate(nextMon.getDate() + 6);
  const nextStart = fmtDate(nextMon), nextEnd = fmtDate(nextSun);
  const plans = getPlansForProject(projectId);
  const dayDiff = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000) + 1;
  const nextWeekPlans = plans.filter(p => {
    const d = p.startDate || p.date;
    const de = p.endDate || p.startDate || p.date;
    if (!d || !de) return false;
    return d <= nextEnd && de >= nextStart;
  });
  const nextWeekTradeCounts = {};
  nextWeekPlans.forEach(p => {
    const planStart = p.startDate || p.date;
    const planEnd = p.endDate || p.startDate || p.date;
    if (!planStart) return;
    const list = p.laborRequirements || p.laborSchedule || [];
    if (unit === 'manDays') {
      // 工日：plan 总工日 × overlapDays / totalDays
      // 优先用 plan.totalManDays，没有则 sum(count) × totalDays 兜底
      const totalDays = dayDiff(planStart, planEnd);
      const overlapStart = planStart > nextStart ? planStart : nextStart;
      const overlapEnd = planEnd < nextEnd ? planEnd : nextEnd;
      const overlapDays = dayDiff(overlapStart, overlapEnd);
      if (overlapDays <= 0) return;
      const planTotalManDays = Number(p.totalManDays) || list.reduce((s, x) => s + (Number(x.count) || 0), 0) * totalDays;
      const ratio = overlapDays / totalDays;
      const alloc = planTotalManDays * ratio;
      // 按工种比例拆分（用各工种 count 占总 count 的比例分配工日）
      const totalCount = list.reduce((s, x) => s + (Number(x.count) || 0), 0) || 1;
      list.forEach(item => {
        const trade = findStandardKey(item.trade || item.laborType);
        const count = Number(item.count) || 0;
        if (trade && count) {
          const share = (count / totalCount) * alloc;
          nextWeekTradeCounts[trade] = (nextWeekTradeCounts[trade] || 0) + share;
        }
      });
    } else {
      // 人头：plan 在下周活跃，完整计入 count
      list.forEach(item => {
        const trade = findStandardKey(item.trade || item.laborType);
        const count = Number(item.count) || 0;
        if (trade && count) {
          nextWeekTradeCounts[trade] = (nextWeekTradeCounts[trade] || 0) + count;
        }
      });
    }
  });
  // STANDARD_TRADES 已在函数开头解析（供 findStandardKey 使用）

  // 固定模板模式：查 (projectId, weekStart, tradeId) 的手工录入
  const manualByTradeId = {};
  if (mode === 'fixed' && this && Array.isArray(this.WEEKLY_LABOR_DATA)) {
    this.WEEKLY_LABOR_DATA.forEach(w => {
      if (w.projectId === projectId && w.weekStart === weekStart) {
        manualByTradeId[w.tradeId] = { thisWeek: w.thisWeekCount || 0, nextWeek: w.nextWeekCount || 0 };
      }
    });
  }

  // 动态生成模式：只显示本周/下周有人数的工种（去 mapFrom 和 trade 都没数据的项）
  const usedTrades = (mode === 'dynamic')
    ? STANDARD_TRADES.filter(t => {
        const mapHit = t.mapFrom && ((thisWeekTradeCounts[t.mapFrom] || 0) > 0 || (nextWeekTradeCounts[t.mapFrom] || 0) > 0);
        const tradeHit = (thisWeekTradeCounts[t.trade] || 0) > 0 || (nextWeekTradeCounts[t.trade] || 0) > 0;
        return mapHit || tradeHit;
      })
    : STANDARD_TRADES;

  const rows = usedTrades.map((t, i) => {
    let thisCnt = 0, nextCnt = 0;
    if (mode === 'fixed' && t.id != null) {
      // 固定模板：使用手动录入
      thisCnt = (manualByTradeId[t.id] || {}).thisWeek || 0;
      nextCnt = (manualByTradeId[t.id] || {}).nextWeek || 0;
    } else {
      // 动态：从事件/计划汇总（mapFrom 优先，tradeName 兜底）
      const thisKey = t.mapFrom || t.trade;
      const nextKey = t.mapFrom || t.trade;
      thisCnt = thisKey ? (thisWeekTradeCounts[thisKey] || 0) : 0;
      nextCnt = nextKey ? (nextWeekTradeCounts[nextKey] || 0) : 0;
    }
    const tradeName = (displayField === 'mapFrom' && t.mapFrom) ? t.mapFrom : t.trade;
    const fmt = (v) => (unit === 'manDays' ? Math.round(v * 10) / 10 : v);
    return { seq: i + 1, trade: tradeName, thisWeek: thisCnt ? fmt(thisCnt) : '—', nextWeek: nextCnt ? fmt(nextCnt) : '—' };
  });
  const totalThis = rows.reduce((s, r) => s + (typeof r.thisWeek === 'number' ? r.thisWeek : 0), 0);
  const totalNext = rows.reduce((s, r) => s + (typeof r.nextWeek === 'number' ? r.nextWeek : 0), 0);
  const fmtTotal = (v) => (unit === 'manDays' ? Math.round(v * 10) / 10 : v);
  rows.push({ seq: rows.length + 1, trade: '合计', thisWeek: totalThis ? fmtTotal(totalThis) : '—', nextWeek: totalNext ? fmtTotal(totalNext) : '—' });
  return rows;
}

// --- 页面 07：ECC 销项 ---
function getPage07Data(projectId) {
  // 优先使用手动汇总（用户在 ECC 汇总 TAB 录入的）
  const manual = (this && this.ECC_SUMMARIES && this.ECC_SUMMARIES[projectId]) || null;
  if (manual && manual.total > 0) {
    return {
      total: manual.total,
      closed: manual.closed,
      closing: manual.closing,
      open: manual.open,
      rate: manual.rate
    };
  }
  // 兜底：从 ECC_ITEMS 自动汇总
  // 关键：从 window.MockData 读取（init 时会被后端 /api/data/all 覆盖为 PostgreSQL 数据）
  const MD = (typeof window !== 'undefined' && window.MockData) || {};
  const eccItems = MD.ECC_ITEMS || ECC_ITEMS;
  const items = eccItems.filter(e => e.projectId === projectId && e.id !== 'ECC099');
  const total = items.length;
  const closed = items.filter(e => e.status === 'closed').length;
  const closing = items.filter(e => e.status === 'closing').length;
  const open = items.filter(e => e.status === 'open').length;
  const rate = total > 0 ? ((closed / total) * 100).toFixed(2) + '%' : '—';
  return { total, closed, closing, open, rate };
}

// --- 页面 08：图纸深化 ---
// 数据源：DRAWING_DEEPENINGS（seed 静态条目，无 eventId）+ DRAWING_DEEPENINGS 同步条目（有 eventId）
// 兜底：type='drawing' 且未被双写同步的 EVENTS 条目也会展示。
// 合并规则：同一 planId 的多次填报合并为一条，taskName / owner / areaId 取最新一次，progress 取最新一次。
function getPage08Data(projectId) {
  // 关键：从 window.MockData 读取（init 时会被后端 /api/data/all 覆盖为 PostgreSQL 数据）
  const MD = (typeof window !== 'undefined' && window.MockData) || {};
  const allDd = (MD.DRAWING_DEEPENINGS || DRAWING_DEEPENINGS || [])
    .filter(d => d.projectId === projectId);
  const seed = allDd.filter(d => !d.eventId).map((d, i) => ({
    seq: i + 1,
    task: d.task,
    owner: d.owner,
    progress: d.progress || '',
    status: d.status,
    source: 'seed',
    eventId: null
  }));
  const syncedEventIds = new Set(allDd.filter(d => d.eventId).map(d => d.eventId));
  // 已同步的 EVENTS：按 planId 分组，取最后一条（按 createdDate）
  const synced = allDd.filter(d => d.eventId).map((d, i) => ({
    seq: seed.length + i + 1,
    task: d.task,
    owner: d.owner,
    progress: d.progress || '',
    status: d.status,
    source: 'event-synced',
    eventId: d.eventId,
    planId: d.planId || null,
    createdDate: d.createdDate || ''
  }));
  // 兜底：未被双写同步的 EVENTS
  const fromEvents = (MD.EVENTS || EVENTS || [])
    .filter(e => e.projectId === projectId && e.type === 'drawing' && e.status === 'confirmed' && !syncedEventIds.has(e.id))
    .map((e, i) => {
      const p = e.payload || {};
      return {
        seq: seed.length + synced.length + i + 1,
        task: p.taskName || '',
        owner: p.owner || e.owner || '',
        progress: p.progress || '',
        status: p.status || '进行中',
        source: 'event',
        eventId: e.id,
        planId: e.planId || null,
        createdDate: e.date || ''
      };
    });
  const all = [...seed, ...synced, ...fromEvents];
  // 按 planId 合并：同一 planId 多条时，取 createdDate 最新的一条
  const byPlan = new Map();
  for (const r of all) {
    if (r.planId) {
      const cur = byPlan.get(r.planId);
      if (!cur || (r.createdDate || '') > (cur.createdDate || '')) byPlan.set(r.planId, r);
    } else {
      byPlan.set('__no_plan_' + Math.random(), r);  // 保留无 planId 的
    }
  }
  // 重新编号
  return Array.from(byPlan.values()).map((r, i) => ({ ...r, seq: i + 1 }));
}

// --- 页面 09：周计划 ---
function getPage09Data(projectId, nextWeekStart, nextWeekEnd) {
  const pid = projectId || CURRENT_PROJECT_ID || 'baicaoyuan';
  // 关键：从 window.MockData 读取（init 时会被后端 /api/data/all 覆盖为 PostgreSQL 数据）
  const MD = (typeof window !== 'undefined' && window.MockData) || {};
  const PLANS_SRC = MD.PLANS || PLANS;
  const AREAS_SRC = MD.AREAS || AREAS;
  const plans = PLANS_SRC[pid] || [];
  const projectAreas = AREAS_SRC[pid] || [];
  const areaMap = {};
  projectAreas.forEach(a => { areaMap[a.id] = a.name; });

  // 下周日期范围（支持外部传入，不传则用系统时间 new Date() + 7天）
  let wr, nextMon, nextSun;
  if (nextWeekStart && nextWeekEnd) {
    wr = { weekStart: nextWeekStart, weekEnd: nextWeekEnd };
    nextMon = new Date(nextWeekStart);
    nextSun = new Date(nextWeekEnd);
  } else {
    const today = new Date();
    const nextWeek = new Date(today);
    nextWeek.setDate(today.getDate() + 7);
    wr = getWeekRangeForDate(nextWeek.toISOString().slice(0, 10));
    nextMon = new Date(wr.weekStart);
    nextSun = new Date(wr.weekEnd);
  }
  const fmt = (dt) => `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;

  // 过滤出下周有重叠的进度计划
  const relevantPlans = plans.filter(p => {
    if (p.status === 'cancelled') return false;
    if (p.type && p.type !== 'progress') return false;
    const s = p.startDate || p.date;
    const e = p.endDate || p.date;
    if (!s) return false;
    return s <= wr.weekEnd && e >= wr.weekStart;
  });

  if (relevantPlans.length === 0) return [];

  // 展开 areaTargets 为独立行
  const rows = [];
  relevantPlans.forEach(plan => {
    if (plan.areaTargets && plan.areaTargets.length > 0) {
      plan.areaTargets.forEach(at => {
        const areaName = areaMap[at.areaId] || at.areaId || '全区';
        rows.push({ planId: plan.id, area: areaName, task: at.taskName || plan.taskName, durationDays: 7, _s: plan.startDate || plan.date, _e: plan.endDate || plan.date });
      });
    } else {
      const areaName = areaMap[plan.areaId] || (plan.areaId ? plan.areaId : '全区');
      rows.push({ planId: plan.id, area: areaName, task: plan.taskName || '施工任务', durationDays: 7, _s: plan.startDate || plan.date, _e: plan.endDate || plan.date });
    }
  });

  // 按区域分组
  const areaGroups = {};
  rows.forEach(r => {
    if (!areaGroups[r.area]) areaGroups[r.area] = [];
    areaGroups[r.area].push(r);
  });

  // 排序：按区域顺序，再按计划日期
  const areaOrder = Object.keys(areaGroups).sort();
  let seq = 0;
  const result = [];
  areaOrder.forEach(area => {
    const group = areaGroups[area].sort((a, b) => (a._s || '').localeCompare(b._s || ''));
    group.forEach(r => {
      seq++;
      const s = new Date(r._s);
      const e = new Date(r._e);
      const schedule = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(nextMon);
        d.setDate(nextMon.getDate() + i);
        schedule.push(d >= s && d <= e ? 1 : 0);
      }
      // 计算工作天数
      const workDays = schedule.filter(Boolean).length;
      // 查找原始计划获取 labor
      const plan = plans.find(p => p.id === r.planId);
      const ls = plan && (plan.laborSchedule || plan.laborRequirements || []);
      const labor = ls.length > 0
        ? ls.map(l => (l.trade || l.laborType || '').trim() + (l.count ? l.count + '人' : '')).filter(Boolean).join('、')
        : '';
      const mat = plan && plan.materials;
      const material = mat && mat.length > 0 ? mat.join('；') : '待定';
      result.push({
        seq, area, task: r.task,
        durationDays: workDays || r.durationDays,
        schedule,
        labor: labor || '',
        material
      });
    });
  });

  return result;
}

// --- 页面 10：施工段划分 ---
const PAGE10_IMAGE_MAP = {
  '食堂一层': '../10下周计划施工段划分-食堂一层.png',
  '食堂二层': '../10下周计划施工段划分-食堂二层.png',
  '食堂B1层': '../10下周计划施工段划分-食堂B1层.png',
  '食堂': '../10下周计划施工段划分.png',
};
function _matchPage10Image(label, floors) {
  // 优先精确匹配
  if (PAGE10_IMAGE_MAP[label]) return PAGE10_IMAGE_MAP[label];
  // 尝试匹配 食堂+楼层
  for (const f of floors) {
    const key = label + f;
    if (PAGE10_IMAGE_MAP[key]) return PAGE10_IMAGE_MAP[key];
  }
  // 尝试匹配纯区域名
  for (const [k, v] of Object.entries(PAGE10_IMAGE_MAP)) {
    if (label.includes(k) || k.includes(label)) return v;
  }
  return '';
}
// --- 页面 10/11 共享：按楼栋/施工段分组 ---
// 返回按 section 排序的 sections，每 section 含 plans / images / rows（schedule 表格行）
// sections 用 localeCompare 'zh' 排序：中文 pinyin 序，食堂(shi) 排在前，1号楼(yi) 排在后
// YYYY-MM-DD → YYYY/M/D（去前导零）
function _formatDateYMD(s) {
  if (!s) return '';
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!m) return s;
  return `${m[1]}/${parseInt(m[2])}/${parseInt(m[3])}`;
}
function getPageSectionsData(projectId) {
  const pid = projectId || CURRENT_PROJECT_ID || 'baicaoyuan';
  // 关键：从 window.MockData 读取（init 时会被后端 /api/data/all 覆盖为 PostgreSQL 数据）
  const MD = (typeof window !== 'undefined' && window.MockData) || {};
  const PLANS_SRC = MD.PLANS || PLANS;
  const AREAS_SRC = MD.AREAS || AREAS;
  const plans = PLANS_SRC[pid] || [];
  const projectAreas = AREAS_SRC[pid] || [];
  const areaMap = {};
  projectAreas.forEach(a => { areaMap[a.id] = a.name; });

  // 按 buildingNo || areaName 分组
  const sectionMap = {};
  plans.forEach(p => {
    if (p.status === 'cancelled') return;
    if (p.type && p.type !== 'progress') return;
    const areaName = areaMap[p.areaId] || p.areaId || '全区';
    const key = p.buildingNo || areaName;
    if (!sectionMap[key]) sectionMap[key] = { name: key, plans: [], areaMap };
    sectionMap[key].plans.push(p);
  });

  return Object.values(sectionMap)
    .sort((a, b) => a.name.localeCompare(b.name, 'zh'))
    .map(sec => {
      // ---- page 10 内容：施工段图片 ----
      const images = [];
      sec.plans.forEach(p => (p.zoneImages || []).forEach(img => {
        if (!images.some(x => x.dataUrl === img.dataUrl)) images.push(img);
      }));
      if (images.length === 0) {
        const matched = _matchPage10Image(sec.name, []);
        if (matched) images.push({ name: matched, dataUrl: matched });
      }
      const imageItems = images.map(img => ({
        label: img.name || sec.name,
        image: img.dataUrl
      }));

      // ---- page 11 内容：施工进度计划跟踪行（按 areaId+taskName 分组） ----
      const activePlans = sec.plans.filter(p => p.taskName && p.type === 'progress');
      // 动态收集该 section 所有唯一楼层
      const floorSet = new Set();
      activePlans.forEach(p => { if (p.floorNo) floorSet.add(p.floorNo); });
      if (floorSet.size === 0) floorSet.add('一层');
      const floorOrder = ['B2层','B1层','一层','二层','三层','四层','五层','六层','七层','八层','九层','十层','十一层','十二层','十三层','十四层','十五层'];
      const sortedFloors = [...floorSet].sort((a,b) => {
        const ia = floorOrder.findIndex(o => a.startsWith(o));
        const ib = floorOrder.findIndex(o => b.startsWith(o));
        if (ia >= 0 && ib >= 0) return ia - ib;
        if (ia >= 0) return -1;
        if (ib >= 0) return 1;
        return a.localeCompare(b, 'zh');
      });
      const floorColors = ['#f4b084','#a9d08e','#9dc3e6','#e6b0aa','#d5a6e6','#a6d5e6','#f9d586','#b0e6b0','#e6a6c0','#a6e6e6','#c0a6e6','#e6c0a6'];
      const floorHeaders = sortedFloors.map((name,i) => ({ name, color: floorColors[i % floorColors.length] }));

      const groups = {};
      activePlans.forEach(p => {
        const gkey = (p.areaId || '') + '|' + p.taskName;
        if (!groups[gkey]) groups[gkey] = { building: p.buildingNo || sec.name, location: areaMap[p.areaId] || p.areaId || '', process: p.taskName, plans: [] };
        groups[gkey].plans.push(p);
      });

      const rows = Object.values(groups).map(g => {
        const floorData = {};
        floorHeaders.forEach(fh => { floorData[fh.name] = null; });
        g.plans.forEach(p => {
          const floor = p.floorNo || '一层';
          if (!floorData[floor]) {
            const s = p.startDate || p.date || '';
            const e = p.endDate || p.date || '';
            floorData[floor] = {
              floor,
              startDate: _formatDateYMD(s),
              endDate: _formatDateYMD(e),
              days: s && e ? Math.ceil((new Date(e) - new Date(s)) / 86400000) + 1 : ''
            };
          }
        });
        return {
          building: g.building,
          location: g.location,
          process: g.process,
          floors: floorHeaders.map(fh => floorData[fh.name] || { floor: fh.name, startDate: '', endDate: '', days: '' })
        };
      });

      return { name: sec.name, items: imageItems, rows, floorHeaders };
    });
}

// --- 页面 10：施工段划分（按楼栋/施工段分 sub-page）---
function getPage10Data(projectId) {
  return getPageSectionsData(projectId).map(sec => ({ section: sec.name, items: sec.items }));
}

// --- 页面 11：施工计划（按楼栋/施工段分 sub-page）---
function getPage11Data(projectId) {
  return getPageSectionsData(projectId).map(sec => ({ section: sec.name, items: sec.rows }));
}

// --- 页面 12：协调事宜 ---
function getPage12Data(projectId, onlyOpen = true) {
  // 关键：从 window.MockData 读取（init 时会被后端 /api/data/all 覆盖为 PostgreSQL 数据）
  const MD = (typeof window !== 'undefined' && window.MockData) || {};
  const issues = MD.ISSUES || ISSUES;
  let items = issues.filter(i =>
    i.projectId === projectId &&
    i.type === 'coordination'
  );
  if (onlyOpen) {
    items = items.filter(i => i.status !== 'closed');
  }
  return items.map((i, idx) => ({
    seq: idx + 1,
    issue: i.title,
    proposeDept: i.proposeDept || '—',
    cooperateDept: i.cooperateDept || '—'
  }));
}

// ============================================================
// 9a. 每日管理人员签到
// ============================================================

const DAILY_ATTENDANCE = {};

function _formatDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function _getDateList(weekStart, weekEnd) {
  const dates = [];
  let d = new Date(weekStart);
  const end = new Date(weekEnd);
  while (d <= end) {
    dates.push(_formatDate(d));
    d.setDate(d.getDate() + 1);
  }
  return dates;
}

// 预生成过去两周的出勤数据（含缺勤模拟）
(function _initMockAttendance() {
  const today = new Date();
  for (let i = -14; i <= 0; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    const dateStr = _formatDate(d);
    const rec = {};
    MANAGEMENT_TEAM.forEach(m => { rec[m.id] = { present: true, reason: '' }; });
    const dow = d.getDay();
    if (dow === 3 || dow === 4) { // 周三/四：计划经理缺席
      rec['MGR03'] = { present: false, reason: '事假' };
    }
    if (dow === 4 || dow === 5) { // 周四/五：预算员缺席
      rec['MGR16'] = { present: false, reason: '病假' };
    }
    DAILY_ATTENDANCE[dateStr] = rec;
  }
})();

function getAttendanceForDate(date) {
  // 始终用 window.MockData 上的最新引用（与签到界面/loadDataFromAPI 同步）
  const dataRoot = (typeof window !== 'undefined' && window.MockData) || {};
  const store = dataRoot.DAILY_ATTENDANCE || DAILY_ATTENDANCE;
  const team = dataRoot.MANAGEMENT_TEAM || MANAGEMENT_TEAM;
  const pid = CURRENT_PROJECT_ID;
  if (!store[pid]) store[pid] = {};
  if (!store[pid][date]) {
    const rec = {};
    team.forEach(m => { rec[m.id] = { present: true, reason: '' }; });
    store[pid][date] = rec;
  }
  return store[pid][date];
}

function setAttendanceForDate(date, records) {
  const store = (window.MockData && window.MockData.DAILY_ATTENDANCE) || DAILY_ATTENDANCE;
  const pid = CURRENT_PROJECT_ID;
  if (!store[pid]) store[pid] = {};
  store[pid][date] = records;
}

function getWeekAttendanceStats(weekStart, weekEnd) {
  const dates = _getDateList(weekStart, weekEnd);
  dates.forEach(d => getAttendanceForDate(d));
  // 始终用 window.MockData 上的最新引用（与签到界面/loadDataFromAPI/addManagementRow 同步）
  const dataRoot = (typeof window !== 'undefined' && window.MockData) || {};
  const team = dataRoot.MANAGEMENT_TEAM || MANAGEMENT_TEAM;
  const store = dataRoot.DAILY_ATTENDANCE || DAILY_ATTENDANCE;
  const pid = CURRENT_PROJECT_ID;
  const pidStore = store[pid] || {};
  return team.map(m => {
    const days = dates.map(d => (pidStore[d] && pidStore[d][m.id]) || { present: false, reason: '' });
    const presentDays = days.filter(d => d.present).length;
    const reasons = days.filter(d => !d.present && d.reason).map(d => d.reason);
    return {
      id: m.id, position: m.position, name: m.name, phone: m.phone,
      presentDays, totalDays: dates.length, fullAttendance: presentDays === dates.length,
      absentReasons: [...new Set(reasons)]
    };
  });
}

// ============================================================
// 10. 辅助函数
// ============================================================

function getWeekRangeForDate(dateStr) {
  const d = new Date(dateStr);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmt = (dt) => `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
  return { weekStart: fmt(monday), weekEnd: fmt(sunday) };
}

function getPlansForProject(projectId) {
  // 关键：优先从 window.MockData 读取（init 时会被后端 /api/data/all 覆盖为 PostgreSQL 数据）
  const MD = (typeof window !== 'undefined' && window.MockData) || {};
  if (MD.PLANS && MD.PLANS[projectId]) return MD.PLANS[projectId];
  const stored = localStorage.getItem('daily_plans');
  if (stored) {
    try {
      const all = JSON.parse(stored);
      return all[projectId] || [];
    } catch (e) {}
  }
  return DEFAULT_PLANS[projectId] || [];
}

// 暴露到全局
window.MockData = {
  PROJECTS, AREAS, WORKERS, MANAGEMENT_TEAM, MILESTONES, MILESTONE_PLANS, PLANS,
  EVENTS, HISTORY_EVENTS, ISSUES, ECC_ITEMS, DRAWING_DEEPENINGS, WEEKLY_GANTT_ITEMS,
  CONSTRUCTION_ZONE_SCHEDULES, TODAY,
  TYPE_META, ISSUE_TYPE_META, PRIORITY_META, ISSUE_STATUS_META, MILESTONE_STATUS_META, SOURCE_META,
  mockParseVoice, mockParsePhoto, mockAggregateWeekly, getDailyEvents, getMonthlyStats,
  getPage01Data, getPage03Data, getPage0301Data, getPage04Data, getPage05Photos,
  getPage06Data, getPage07Data, getPage08Data, getPage09Data, getPage10Data, getPage11Data, getPageSectionsData, getPage12Data,
  DAILY_ATTENDANCE, getAttendanceForDate, setAttendanceForDate, getWeekAttendanceStats,
  getMilestoneData, saveMilestoneData, resetMilestoneCache, setCurrentProjectId,
  saveEventsToStorage, savePlansToStorage
};