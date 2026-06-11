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
  { id: 'MGR01', position: '项目经理',                  name: '侯帅',   phone: '13051103313', attendanceStatus: '已到岗' },
  { id: 'MGR02', position: '项目技术负责人兼深化设计负责人', name: '王健',   phone: '13818589201', attendanceStatus: '已到岗' },
  { id: 'MGR03', position: '计划经理',                  name: '陈冲',   phone: '13651007882', attendanceStatus: '已到岗' },
  { id: 'MGR04', position: '生产经理（软装）',            name: '王亚广', phone: '15910813359', attendanceStatus: '已到岗' },
  { id: 'MGR05', position: '生产经理（精装）',            name: '鲍永春', phone: '13382510829', attendanceStatus: '已到岗' },
  { id: 'MGR06', position: '生产经理（机电）',            name: '袁永超', phone: '18900125480', attendanceStatus: '已到岗' },
  { id: 'MGR07', position: '深化设计经理（软装）',        name: '李欢',   phone: '17310298646', attendanceStatus: '已到岗' },
  { id: 'MGR08', position: '深化设计（软装）',            name: '乔志广', phone: '13939996372', attendanceStatus: '已到岗' },
  { id: 'MGR09', position: '深化设计（软装）',            name: '李水旺', phone: '18310163008', attendanceStatus: '已到岗' },
  { id: 'MGR10', position: '深化设计（软装）',            name: '赵晨星', phone: '15011544879', attendanceStatus: '已到岗' },
  { id: 'MGR11', position: '深化设计（软装）',            name: '龙方',   phone: '13974050351', attendanceStatus: '已到岗' },
  { id: 'MGR12', position: '深化设计经理（精装）',        name: '徐诗怡', phone: '18013705168', attendanceStatus: '已到岗' },
  { id: 'MGR13', position: '深化设计（机电）',            name: '苏尧',   phone: '13141422281', attendanceStatus: '已到岗' },
  { id: 'MGR14', position: '成本经理（软装/精装）',       name: '郭建欣', phone: '15600173618', attendanceStatus: '已到岗' },
  { id: 'MGR15', position: '商务经理（软装/精装）',       name: '薛智臣', phone: '18810013805', attendanceStatus: '已到岗' },
  { id: 'MGR16', position: '预算员（软装/精装）',         name: '王迪',   phone: '15726644536', attendanceStatus: '已到岗' },
  { id: 'MGR17', position: '电气预算员',                 name: '邓明伟', phone: '19937244723', attendanceStatus: '已到岗' },
  { id: 'MGR18', position: '质量经理（软装）',            name: '周建忠', phone: '13636535828', attendanceStatus: '已到岗' },
  { id: 'MGR19', position: '质量经理（精装）',            name: '李欣霖', phone: '17631518331', attendanceStatus: '已到岗' },
  { id: 'MGR20', position: '安全经理（软装）',            name: '孙攀岳', phone: '18501166924', attendanceStatus: '已到岗' },
  { id: 'MGR21', position: '安全经理（精装）',            name: '赵国显', phone: '18516217962', attendanceStatus: '已到岗' },
  { id: 'MGR22', position: '资料员',                    name: '蔡丽华', phone: '18600371133', attendanceStatus: '已到岗' },
  { id: 'MGR23', position: '材料员（软装/精装）',         name: '肖自政', phone: '15093960151', attendanceStatus: '已到岗' }
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

// 从 localStorage 读取，若不存在则使用默认值并写入
let PLANS;
try {
  const stored = localStorage.getItem('daily_plans');
  if (stored) {
    PLANS = JSON.parse(stored);
  } else {
    PLANS = JSON.parse(JSON.stringify(DEFAULT_PLANS));
    localStorage.setItem('daily_plans', JSON.stringify(PLANS));
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
    cooperateDept: '地暖单位、监理'
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

// ============================================================
// 9. 周报数据映射（原型：日报 → 12 页周报）
// ============================================================

// --- 页面 04：上周工作完成情况 ---
// 从 EVENTS（progress 类型）聚合周报"工作完成"表格数据
function getPage04Data(projectId, weekStart, weekEnd) {
  const allEvents = [...EVENTS, ...HISTORY_EVENTS];
  const weekEvents = allEvents.filter(e =>
    e.projectId === projectId &&
    e.type === 'progress' &&
    e.date >= weekStart && e.date <= weekEnd &&
    e.status === 'confirmed'
  );

  // 按区域分组
  const groups = {};
  weekEvents.forEach(e => {
    const key = e.areaId || '__unknown__';
    if (!groups[key]) groups[key] = [];
    groups[key].push(e);
  });

  const rows = [];
  let seq = 0;
  Object.entries(groups).forEach(([areaId, events]) => {
    const area = (AREAS[projectId] || []).find(a => a.id === areaId);
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
  const allEvents = [...EVENTS, ...HISTORY_EVENTS];
  const weekEvents = allEvents.filter(e =>
    e.projectId === projectId &&
    e.date >= weekStart && e.date <= weekEnd
  );
  const allPhotos = [];
  weekEvents.forEach(e => {
    (e.photos || []).forEach(p => {
      allPhotos.push({
        id: p.id,
        caption: p.caption || '现场照片',
        area: p.area || e.areaId || '',
        eventType: e.type,
        eventId: e.id
      });
    });
  });
  return allPhotos.slice(0, maxCount);
}

// --- 页面 01：封面 ---
function getPage01Data(projectId, dateOverride) {
  const proj = PROJECTS.find(p => p.id === projectId);
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
  return MANAGEMENT_TEAM.map((m, i) => ({
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
  const projectId = CURRENT_PROJECT_ID;
  const plans = MILESTONE_PLANS[projectId] || [];
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
      const val = (p.areaLabel || '') + ' ' + (p.description || '');
      cats[p.category]['关键节点'] = { rowType: 'key', cells: { [`${year}.${p.targetMonth}`]: val.trim() } };
    } else if (p.nodeType === '次要节点') {
      const key = `${year}.${p.targetMonth}`;
      const items = (p.subItems || []).map(s => `${s.label}：${s.text}`);
      cats[p.category]['次要节点'] = cats[p.category]['次要节点'] || { rowType: 'sub', cells: {} };
      cats[p.category]['次要节点'].cells[key] = (cats[p.category]['次要节点'].cells[key] || '') + items.join('\n');
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
function getPage06Data(projectId, weekStart, weekEnd) {
  const plans = getPlansForProject(projectId);
  const weekPlans = plans.filter(p => {
    if (p.startDate) return p.startDate >= weekStart && p.startDate <= weekEnd;
    if (p.date) return p.date >= weekStart && p.date <= weekEnd;
    return false;
  });
  const tradeCounts = {};
  weekPlans.forEach(p => {
    const list = p.laborRequirements || p.laborSchedule || [];
    list.forEach(item => {
      const trade = item.trade || item.laborType;
      const count = item.count;
      if (trade && count) {
        tradeCounts[trade] = (tradeCounts[trade] || 0) + count;
      }
    });
  });
  const STANDARD_TRADES = [
    { trade: '5S小队', mapFrom: '普工' },
    { trade: '电工', mapFrom: '电工' },
    { trade: '电焊工', mapFrom: '焊工' },
    { trade: '工长', mapFrom: null },
    { trade: '库管', mapFrom: null },
    { trade: '临电专员', mapFrom: null },
    { trade: '木工', mapFrom: '木工' },
    { trade: '水工', mapFrom: '水电工' },
    { trade: '瓦工', mapFrom: '瓦工' },
    { trade: '普工', mapFrom: null },
    { trade: '油工', mapFrom: '油漆工' },
    { trade: '防水工', mapFrom: null },
    { trade: '管理人员', mapFrom: null },
    { trade: '室内电梯司机', mapFrom: null }
  ];
  const rows = STANDARD_TRADES.map((t, i) => {
    const count = t.mapFrom ? (tradeCounts[t.mapFrom] || 0) : 0;
    return { seq: i + 1, trade: t.trade, thisWeek: count || '—', nextWeek: count || '—' };
  });
  const totalThis = rows.reduce((s, r) => s + (typeof r.thisWeek === 'number' ? r.thisWeek : 0), 0);
  const totalNext = rows.reduce((s, r) => s + (typeof r.nextWeek === 'number' ? r.nextWeek : 0), 0);
  rows.push({ seq: 15, trade: '合计', thisWeek: totalThis || '—', nextWeek: totalNext || '—' });
  return rows;
}

// --- 页面 07：ECC 销项 ---
function getPage07Data(projectId) {
  const items = ECC_ITEMS.filter(e => e.projectId === projectId && e.id !== 'ECC099');
  const total = items.length;
  const closed = items.filter(e => e.status === 'closed').length;
  const closing = items.filter(e => e.status === 'closing').length;
  const open = items.filter(e => e.status === 'open').length;
  const rate = total > 0 ? ((closed / total) * 100).toFixed(2) + '%' : '—';
  return { total, closed, closing, open, rate };
}

// --- 页面 08：图纸深化 ---
function getPage08Data(projectId) {
  return DRAWING_DEEPENINGS.filter(d => d.projectId === projectId).map((d, i) => ({
    seq: i + 1,
    task: d.task,
    owner: d.owner,
    status: d.status
  }));
}

// --- 页面 09：周计划 ---
function getPage09Data() {
  return WEEKLY_GANTT_ITEMS;
}

// --- 页面 10：施工段划分 ---
function getPage10Data() {
  return [
    { label: '食堂一层', image: '10下周计划施工段划分-食堂一层.png' },
    { label: '食堂二层', image: '10下周计划施工段划分-食堂二层.png' },
    { label: '食堂B1层', image: '10下周计划施工段划分-食堂B1层.png' }
  ];
}

// --- 页面 11：施工段计划 ---
function getPage11Data() {
  return CONSTRUCTION_ZONE_SCHEDULES;
}

// --- 页面 12：协调事宜 ---
function getPage12Data(projectId, onlyOpen = true) {
  let items = ISSUES.filter(i =>
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
  if (!DAILY_ATTENDANCE[date]) {
    const rec = {};
    MANAGEMENT_TEAM.forEach(m => { rec[m.id] = { present: true, reason: '' }; });
    DAILY_ATTENDANCE[date] = rec;
  }
  return DAILY_ATTENDANCE[date];
}

function setAttendanceForDate(date, records) {
  DAILY_ATTENDANCE[date] = records;
}

function getWeekAttendanceStats(weekStart, weekEnd) {
  const dates = _getDateList(weekStart, weekEnd);
  dates.forEach(d => getAttendanceForDate(d));
  return MANAGEMENT_TEAM.map(m => {
    const days = dates.map(d => DAILY_ATTENDANCE[d][m.id] || { present: false, reason: '' });
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
  getPage06Data, getPage07Data, getPage08Data, getPage09Data, getPage10Data, getPage11Data, getPage12Data,
  DAILY_ATTENDANCE, getAttendanceForDate, setAttendanceForDate, getWeekAttendanceStats,
  getMilestoneData, saveMilestoneData
};