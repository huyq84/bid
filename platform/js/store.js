// platform/js/store.js
// v5.2 数据 store - nav_tree + pages_data + 跨期复制
(function (global) {
  const KEY_PREFIX = 'bcy_report_';
  const PERIOD_KEY = 'bcy_periods';
  const CUSTOM_PERIODS_KEY = 'bcy_report_custom_periods';
  const BASE_PERIOD_KEY = 'bcy_base_period';
  const DEFAULT_PERIODS = ['2026-W18', '2026-W19', '2026-W20', '2026-W21', '2026-W22'];
  const DEFAULT_CUSTOM = {
    // label = 自定义周的"第N周"显示名, 由用户控制 (支持断周)
    '2026-W18': { start: '2026-04-28', end: '2026-05-04', report_date: '2026-05-05', label: '第1周' },
    '2026-W19': { start: '2026-05-05', end: '2026-05-11', report_date: '2026-05-12', label: '第2周' },
    '2026-W20': { start: '2026-05-11', end: '2026-05-17', report_date: '2026-05-18', label: '第3周' },
    '2026-W21': { start: '2026-05-18', end: '2026-05-24', report_date: '2026-05-25', label: '第4周' },
    '2026-W22': { start: '2026-05-25', end: '2026-05-31', report_date: '2026-06-01', label: '第5周' }
  };

  // 把 Date 对象格式化为本地日期字符串 (YYYY-MM-DD)
  // 避免 toISOString() 在 UTC+ 时区偏 1 天的 bug
  function toLocalDateStr(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  // 03 名单页职务字典 - 录入时 datalist 建议项, 覆盖常见岗位
  const DEFAULT_ROLES = [
    '项目经理',
    '项目技术负责人兼深化设计负责人',
    '项目副经理',
    '项目总工',
    '计划经理',
    '生产经理(软装)',
    '生产经理(精装)',
    '生产经理(机电)',
    '深化设计经理(软装)',
    '深化设计经理(精装)',
    '深化设计(软装)',
    '深化设计(精装)',
    '深化设计(机电)',
    '成本经理(软装/精装)',
    '商务经理(软装/精装)',
    '预算员(软装/精装)',
    '电气预算员(软装/精装)',
    '质量经理(软装)',
    '质量经理(精装)',
    '安全经理(软装)',
    '安全经理(精装)',
    '资料员',
    '材料员(软装/精装)',
    '施工员',
    '安全员',
    '测量员',
    '试验员',
    '机械员',
    '劳务员'
  ];

  // 默认 nav_tree (v5 13 章节 + 封尾预留)
  function defaultNavTree() {
    return [
      { id: 'n01', type: 'page', page_id: '01', name: '封面', prefix: null, manual_prefix: false, children: [] },
      { id: 'n02', type: 'page', page_id: '02', name: '目录', prefix: null, manual_prefix: false, children: [] },
      { id: 'n03', type: 'chapter', name: '组织架构', prefix: null, manual_prefix: false, children: [
        { id: 'n0301', type: 'page', page_id: '03', name: '到岗管理人员', prefix: null, manual_prefix: false, children: [] }
      ]},
      { id: 'n04', type: 'page', page_id: '0301', name: '重要节点', prefix: null, manual_prefix: false, children: [] },
      { id: 'n05', type: 'chapter', name: '上周工作', prefix: null, manual_prefix: false, children: [
        { id: 'n0501', type: 'page', page_id: '04', name: '上周重要工作完成', prefix: null, manual_prefix: false, children: [] },
        { id: 'n0502', type: 'page', page_id: '05', name: '工作现场', prefix: null, manual_prefix: false, children: [] },
        { id: 'n0503', type: 'page', page_id: '06', name: '人员统计', prefix: null, manual_prefix: false, children: [] },
        { id: 'n0504', type: 'page', page_id: '07', name: 'ECC 销项', prefix: null, manual_prefix: false, children: [] },
        { id: 'n0505', type: 'page', page_id: '08', name: '图纸深化', prefix: null, manual_prefix: false, children: [] }
      ]},
      { id: 'n06', type: 'chapter', name: '下周计划', prefix: null, manual_prefix: false, children: [
        { id: 'n0601', type: 'page', page_id: '09', name: '周工作计划', prefix: null, manual_prefix: false, children: [] }
      ]},
      { id: 'n07', type: 'chapter', name: '工作计划', prefix: null, manual_prefix: false, children: [
        // v5.16: 4.1 施工段划分 合并到 4.2 施工段计划, 不再单独成节
        // v5.17: 改名 "施工段划分与计划", 侧边栏显示 4.1 施工段划分与计划 (renumber 自动算 4.1)
        { id: 'n0702', type: 'page', page_id: '11', name: '施工段划分与计划', prefix: null, manual_prefix: false, children: [] }
      ]},
      { id: 'n08', type: 'chapter', name: '协调事宜', prefix: null, manual_prefix: false, children: [
        { id: 'n0801', type: 'page', page_id: '12', name: '协调事宜', prefix: null, manual_prefix: false, children: [] }
      ]},
      { id: 'n09', type: 'page', page_id: '14', name: '封尾', prefix: null, manual_prefix: false, is_closing: true, default_template: '感谢阅读本报告, 如有疑问请与清尚项目部联系。', children: [] }
    ];
  }

  function defaultPagesData() {
    return {
      '01': { type: 'single', fields: { report_id: '', report_date: '', project_name: '百草园城市更新项目' } },
      '02': { type: 'auto' },
      '03': { type: 'single', table: 'roster', rows: [
        { seq:1,  role: '项目经理',                              name: '侯 帅',   phone: '13051103313', present: true, delta: 'carry' },
        { seq:2,  role: '项目技术负责人兼深化设计负责人',         name: '王 健',   phone: '13818589201', present: true, delta: 'carry' },
        { seq:3,  role: '计划经理',                               name: '陈 冲',   phone: '13651007882', present: true, delta: 'carry' },
        { seq:4,  role: '生产经理(软装)',                          name: '王亚广',   phone: '15910813359', present: true, delta: 'carry' },
        { seq:5,  role: '生产经理(精装)',                          name: '鲍永春',   phone: '13382510829', present: true, delta: 'carry' },
        { seq:6,  role: '生产经理(机电)',                          name: '袁永超',   phone: '18900125480', present: true, delta: 'carry' },
        { seq:7,  role: '深化设计经理(软装)',                       name: '李 欢',   phone: '17310298646', present: true, delta: 'carry' },
        { seq:8,  role: '深化设计(软装)',                           name: '乔志广',   phone: '13939996372', present: true, delta: 'carry' },
        { seq:9,  role: '深化设计(软装)',                           name: '李水旺',   phone: '18310163008', present: true, delta: 'carry' },
        { seq:10, role: '深化设计(软装)',                           name: '赵晨星',   phone: '15011544879', present: true, delta: 'carry' },
        { seq:11, role: '深化设计(软装)',                           name: '龙 方',   phone: '13974050351', present: true, delta: 'carry' },
        { seq:12, role: '深化设计经理(精装)',                       name: '徐诗怡',   phone: '18013705168', present: true, delta: 'carry' },
        { seq:13, role: '深化设计(机电)',                           name: '苏 尧',   phone: '13141422281', present: true, delta: 'carry' },
        { seq:14, role: '成本经理(软装/精装)',                      name: '郭建欣',   phone: '15600173618', present: true, delta: 'carry' },
        { seq:15, role: '商务经理(软装/精装)',                      name: '薛智臣',   phone: '18810013805', present: true, delta: 'carry' },
        { seq:16, role: '预算员(软装/精装)',                        name: '王 迪',   phone: '15726644536', present: true, delta: 'carry' },
        { seq:17, role: '电气预算员(软装/精装)',                    name: '邓明伟',   phone: '19937244723', present: true, delta: 'carry' },
        { seq:18, role: '质量经理(软装)',                           name: '周建忠',   phone: '13636535828', present: true, delta: 'carry' },
        { seq:19, role: '质量经理(精装)',                           name: '李欣霖',   phone: '17631518331', present: true, delta: 'carry' },
        { seq:20, role: '安全经理(软装)',                           name: '孙攀岳',   phone: '18501166924', present: true, delta: 'carry' },
        { seq:21, role: '安全经理(精装)',                           name: '赵国显',   phone: '18516217962', present: true, delta: 'carry' },
        { seq:22, role: '资料员',                                  name: '蔡丽华',   phone: '18600371133', present: true, delta: 'carry' },
        { seq:23, role: '材料员(软装/精装)',                        name: '肖自政',   phone: '15093960151', present: true, delta: 'carry' }
      ]},
      '0301': { type: 'single', table: 'milestones', rows: [
        { major: '软装(清尚)', row: '关键节点', '2026.3':'', '2026.4':'', '2026.5':'', '2026.6':'', '2026.7':'食堂、健身房、南塔咖啡厅完工', '2026.8':'北塔高管区完工' },
        { major: '软装(清尚)', row: '次要节点', '2026.3':'高管墙面基层', '2026.4':'', '2026.5':'食堂/健身/咖啡评审', '2026.6':'', '2026.7':'', '2026.8':'' }
      ]},
      '0301_meta': { /* 表头月份由 report.period.start 动态算, 不存 rows */ },
      '04': { type: 'repeatable', repeatBy: 'area' },
      '05': { type: 'repeatable', repeatBy: 'area' },
      '06': { type: 'single', table: 'labor_stats', rows: [
        { seq:1,  type: '5S小队',         this_week: 15, next_week: 16 },
        { seq:2,  type: '电工',           this_week: 5,  next_week: 5 },
        { seq:3,  type: '电焊工',         this_week: 13, next_week: 13 },
        { seq:4,  type: '工长',           this_week: 8,  next_week: 8 },
        { seq:5,  type: '库管',           this_week: 1,  next_week: 1 },
        { seq:6,  type: '临电专员',       this_week: 1,  next_week: 1 },
        { seq:7,  type: '木工',           this_week: 87, next_week: 90 },
        { seq:8,  type: '水工',           this_week: 35, next_week: 35 },
        { seq:9,  type: '瓦工',           this_week: 14, next_week: 14 },
        { seq:10, type: '普工',           this_week: 22, next_week: 22 },
        { seq:11, type: '油工',           this_week: 10, next_week: 14 },
        { seq:12, type: '防水工',         this_week: 2,  next_week: 2 },
        { seq:13, type: '管理人员',       this_week: 23, next_week: 23 },
        { seq:14, type: '室内电梯司机',   this_week: 2,  next_week: 2 },
        { is_total: true, type: '合计',    this_week: 238, next_week: 246 }
      ]},
      '07': { type: 'single', data: { total: 110, closed: 101, in_process: 1, open: 9, image: '' } },
      '08': { type: 'single', table: 'design_deepen', rows: [
        { task: '1-2号咖啡厅样板段策划整理', owner: '李 欢', status: '已完成' },
        { task: '与设计碰1~2号咖啡厅图纸问题', owner: '李 欢', status: '进行中' },
        { task: '1、负一层二层档口修改方案调整图纸\n2、二层立面修改方案调整图纸', owner: '乔志广', status: '已完成' },
        { task: '1、负一层~二层节点图和负一层、二层立面图修改方案调整图纸\n2、负一层二层幕墙处理带盒节点调整\n3、食堂设计变更事项整理', owner: '乔志广', status: '进行中' },
        { task: '1、对接旋转楼梯图纸\n2、岩板弧角及线条打样\n3、对接木饰面清单清单', owner: '徐诗怡', status: '已完成' },
        { task: '打样', owner: '徐诗怡', status: '进行中' },
        { task: '3号咖啡厅图纸深化完成已和业主确认签字', owner: '李永旺', status: '已完成' },
        { task: '4号咖啡厅图纸根据设计意见和样板评审意见进行调整。', owner: '李永旺', status: '进行中' }
      ]},
      '09': { type: 'single', table: 'next_week_plan', rows: [
        { area: '高管层', task: '高管二层西走廊景观池施工', progress: ['fill','fill','fill','fill','fill','fill','fill'], manual_mode: false, days: 7, labor: '焊工', headcount: 2, material: '已到场' },
        { area: '高管层', task: '高管一二层公区天花造型吊顶', progress: ['fill','fill','fill','fill','fill','fill','fill'], manual_mode: false, days: 7, labor: '木工', headcount: 4, material: '已到场' },
        { area: '高管层', task: '高管二层公区造型封板', progress: ['fill','fill','fill','fill','fill','fill','fill'], manual_mode: false, days: 7, labor: '木工', headcount: 6, material: '已到场' },
        { area: '高管层', task: '高管一层房间内地暖施工', progress: ['fill','fill','fill','fill','fill','fill','fill'], manual_mode: false, days: 7, labor: '瓦工', headcount: 3, material: '已到场' },
        { area: '高管层', task: '高管一层房间内天花封板', progress: ['empty','empty','fill','fill','fill','fill','fill'], manual_mode: false, days: 5, labor: '木工', headcount: 4, material: '已到场' },
        { area: '高管层', task: '高管备餐间及后勤区域铝扣板吊顶', progress: ['empty','empty','empty','fill','fill','fill','fill'], manual_mode: false, days: 4, labor: '木工', headcount: 2, material: '已到场' },
        { area: '高管层', task: '高管二层公区地暖区域防水', progress: ['fill','fill','fill','fill','fill','fill','fill'], manual_mode: false, days: 7, labor: '瓦工', headcount: 2, material: '已到场' },
        { area: '食堂区', task: '二层天花吊顶及封板', progress: ['fill','fill','fill','fill','fill','fill','fill'], manual_mode: false, days: 7, labor: '木工', headcount: 8, material: '已到场' },
        { area: '食堂区', task: '二层天花照明穿线', progress: ['fill','fill','fill','fill','fill','fill','fill'], manual_mode: false, days: 7, labor: '电工', headcount: 4, material: '已到场' },
        { area: '食堂区', task: '一层天花腻子', progress: ['fill','fill','fill','fill','fill','fill','fill'], manual_mode: false, days: 7, labor: '油工', headcount: 6, material: '已到场' },
        { area: '食堂区', task: '地下室天花吊顶', progress: ['fill','fill','fill','fill','fill','fill','fill'], manual_mode: false, days: 7, labor: '木工', headcount: 30, material: '已到场' },
        { area: '食堂区', task: '地下室天花照明配管', progress: ['fill','fill','fill','fill','fill','fill','fill'], manual_mode: false, days: 7, labor: '电工', headcount: 14, material: '已到场' },
        { area: '南塔健身房', task: '南健身房天花吊顶', progress: ['fill','fill','fill','fill','fill','fill','fill'], manual_mode: false, days: 7, labor: '木工', headcount: 2, material: '已到场' },
        { area: '南塔健身房', task: '墙地面岩板铺贴', progress: ['fill','fill','fill','fill','fill','fill','fill'], manual_mode: false, days: 7, labor: '瓦工', headcount: 8, material: '已到场' },
        { area: '南塔咖啡厅', task: '墙面封板', progress: ['fill','fill','fill','fill','fill','fill','fill'], manual_mode: false, days: 7, labor: '木工', headcount: 2, material: '已到场' },
        { area: '南塔咖啡厅', task: '天花机电布管', progress: ['fill','fill','fill','fill','fill','fill','fill'], manual_mode: false, days: 7, labor: '电工', headcount: 4, material: '已到场' },
        { area: '南塔咖啡厅', task: '天花吊顶龙骨排布', progress: ['fill','fill','fill','fill','fill','fill','fill'], manual_mode: false, days: 7, labor: '木工', headcount: 8, material: '已到场' },
        { area: '南塔咖啡厅', task: '墙面钢架焊接', progress: ['fill','fill','fill','fill','fill','fill','fill'], manual_mode: false, days: 7, labor: '焊工', headcount: 2, material: '已到场' },
        { area: '北塔咖啡厅', task: '操作间地面回填', progress: ['empty','empty','empty','empty','fill','fill','fill'], manual_mode: false, days: 3, labor: '瓦工', headcount: 2, material: '已到场' },
        { area: '北塔咖啡厅', task: '操作间地面JS防水施工', progress: ['fill','fill','fill','fill','empty','empty','empty'], manual_mode: false, days: 4, labor: '防水', headcount: 2, material: '已到场' },
        { area: '北塔咖啡厅', task: '样板区隔墙龙骨施工', progress: ['fill','fill','fill','fill','fill','fill','fill'], manual_mode: false, days: 7, labor: '木工', headcount: 4, material: '已到场' }
      ]},
      '11': { type: 'single', table: 'construction_plan', title: '26年5月施工进度计划跟踪表',
        // v5.11: 每区域一张表, 旧结构 rows:[{building, part, step, ...}] 改为 areas:[{area, steps:[{building, part, step, ...}]}]
        // v5.12: cells 中 start/end 改 ISO 日期 (YYYY-MM-DD), days 留空 (渲染时 s11ComputeDays 自动算)
        // v5.14: sections 从顶层 pd.sections 移到每个 area.sections (各区域独立, 每张表自己的层)
        // v5.15: 楼栋/施工段、部位、工序 3 个基础列改 per-area 配置 (name + key), 表头可改可删, 数据从 step[col.key] 读
        // v5.16: 4.1 施工段划分 合并进来, 每 area 加 photos:[] 字段 (楼层划分图), 顶部 [+ 新增区域] 在 4.1 之前是不变的
        areas: [
          { area: '食堂',
            photos: [],
            baseColumns: [
              { name: '楼栋/施工段', key: 'building' },
              { name: '部位',       key: 'part' },
              { name: '工序',       key: 'step' }
            ],
            sections: [
              { name: '一层' },
              { name: '二层' },
              { name: 'B1层(1)' },
              { name: 'B1层(2)' }
            ],
            steps: [
              { building:'食堂', seq:1, part:'墙面', step:'基层钢架（含墙面配管）',
                cells:['2026-05-05','2026-05-15','','2026-05-16','2026-05-31','','2026-04-30','2026-05-15','','2026-05-31','2026-06-20',''] },
              { building:'食堂', seq:2, part:'墙面', step:'墙柱面基层封板',
                cells:['2026-05-16','2026-05-23','','','','','2026-05-16','2026-05-23','','','',''] },
              { building:'食堂', seq:3, part:'墙面', step:'墙柱饰面材料深化下单',
                cells:['2026-05-15','2026-06-04','','2026-05-25','2026-06-14','','2026-05-15','2026-06-04','','2026-05-25','2026-06-14',''] },
              { building:'食堂', seq:4, part:'墙面', step:'',
                cells: new Array(12).fill('') },
              { building:'食堂', seq:5, part:'天花', step:'1专业管线移交',
                cells:['2026-03-20','2026-03-20','','2026-04-20','2026-04-20','','2026-04-30','2026-04-30','','2026-04-30','2026-04-30',''] },
              { building:'食堂', seq:6, part:'天花', step:'2转换钢架造型龙骨及风管定位',
                cells:['2026-03-21','2026-04-15','','2026-04-21','2026-05-11','','2026-05-01','2026-05-21','','2026-05-11','2026-05-31',''] },
              { building:'食堂', seq:7, part:'天花', step:'3龙骨安装、风管追位、其它机电末端定位',
                cells:['2026-04-08','2026-04-28','','2026-05-01','2026-05-26','','2026-05-11','2026-06-05','','2026-05-21','2026-06-15',''] },
              { building:'食堂', seq:8, part:'天花', step:'4天花末端追位',
                cells:['2026-04-18','2026-05-08','','2026-05-11','2026-05-31','','2026-05-26','2026-06-15','','','',''] },
              { building:'食堂', seq:9, part:'天花', step:'5联合隐蔽验收',
                cells:['2026-05-08','2026-05-15','','','','','','','','','',''], highlight: ['0','1','2'] },
              { building:'食堂', seq:10, part:'天花', step:'6天花封板',
                cells:['2026-05-16','2026-05-31','','','','','','','','','',''] },
              { building:'食堂', seq:11, part:'天花', step:'7天花腻子基层及底漆施工（断灰尘）',
                cells:['2026-05-23','2026-06-22','','','','','','','','','',''] }
            ]
          }
        ]
      },
      '12': { type: 'single', table: 'coordination', rows: [
        { issue: '', proposer: '', cooperator: '' },
        { issue: '', proposer: '', cooperator: '' },
        { issue: '', proposer: '', cooperator: '' },
        { issue: '', proposer: '', cooperator: '' },
        { issue: '', proposer: '', cooperator: '' },
        { issue: '', proposer: '', cooperator: '' },
        { issue: '', proposer: '', cooperator: '' },
        { issue: '', proposer: '', cooperator: '' }
      ]},
      '14': { type: 'free', is_closing: true, content: '感谢阅读本报告, 如有疑问请与清尚项目部联系。' }
    };
  }

  // v5.2 → v5.3 数据迁移: 04 work_done 旧 shape (扁平) → 新 shape (嵌套 items)
  // 旧: [{ area, task, progress, owner, deadline, is_header?, source? }]
  // 新: [{ area, owner, deadline, items: [{ task, progress }] }]
  function migrateWorkDone(old) {
    if (!Array.isArray(old)) return [];
    if (old.length === 0) return [];
    // 已经是新 shape: 第一个元素有 items 数组
    if (Array.isArray(old[0].items)) return old;
    // 旧 shape: 每条都包成主行, 单个 item
    return old.map(t => ({
      area: t.area || '未分类',
      owner: t.owner || '',
      deadline: t.deadline || '',
      items: t.is_header ? [] : [{ task: t.task || '', progress: t.progress || '0%' }],
      is_header: !!t.is_header
    }));
  }

  // 默认 04/05/10/11 的数据 (示例)
  // v5.3: work_done 主行 + items 嵌套
  function defaultWorkDone() {
    return [
      { area: '高管区', owner: '鲍永春', deadline: '2026-05-17', items: [
        { task: '一层高管办公室龙骨吊顶完成', progress: '100%' },
        { task: '二层房间内地暖盘管完成', progress: '100%' },
        { task: '一层西侧走道龙骨吊顶', progress: '80%' },
        { task: '一层北侧走道龙骨吊顶', progress: '80%' },
        { task: '一/二层墙面钢架及龙骨基层', progress: '90%' },
        { task: '首二层后勤区域地面砖铺贴', progress: '90%' },
        { task: '二层焊帘帘盒', progress: '60%' },
        { task: '首二层地暖房间防水', progress: '100%' },
        { task: '首二层地暖房间回填', progress: '100%' }
      ]}
    ];
  }
  function defaultSitePhotos() {
    return [
      { area: '高管区', url: '', caption: '一层吊顶完成' },
      { area: '高管区', url: '', caption: '地暖盘管' },
      { area: '食堂区', url: '', caption: '墙面钢架' },
      { area: '北塔咖啡厅', url: '', caption: 'JS防水' }
    ];
  }
  function defaultConstructionSections() {
    return [
      { area: '食堂区', floor: '一层', url: '', caption: '食堂一层施工段', cells: ['5/10', '5/15', '5', '5/16', '5/20', '4', '', '', '', '', '', ''] },
      { area: '食堂区', floor: '二层', url: '', caption: '食堂二层施工段', cells: ['5/12', '5/18', '6', '5/19', '5/24', '5', '', '', '', '', '', ''] },
      { area: '食堂区', floor: 'B1层', url: '', caption: '食堂B1层施工段', cells: ['5/15', '5/22', '7', '5/23', '5/30', '7', '', '', '', '', '', ''] }
    ];
  }
  function defaultNextWeekPlan() {
    return [
      { area: '高管区', task: '高管二层西走廊景观池施工', progress: ['fill','fill','fill','fill','fill','fill','fill'], manual_mode: false, days: 7, labor: '焊工', headcount: 2, material: '已到场' },
      { area: '高管区', task: '一层墙面饰面', progress: ['fill','fill','fill','empty','empty','empty','empty'], manual_mode: false, days: 3, labor: '油工', headcount: 4, material: '涂料已到' }
    ];
  }

  function seed(period, prevReport) {
    const custom = DEFAULT_CUSTOM[period] || { start: '', end: '', report_date: '' };
    const wk = period.split('-W')[1];
    const r = {
      report_id: 'BCY-' + period,
      period: { week_no: +wk, start: custom.start, end: custom.end, report_date: custom.report_date },
      project: { id: 'baicaoyuan', name: '百草园城市更新项目', general_contractor: '中建三局集团(深圳)有限公司', subcontractor: '北京清尚' },
      ui_config: {
        template_version: 'baicaoyuan-2026-v5',
        bg_image: '../背景.png',
        cover: { title: '工作周报', subtitle: '百草园城市更新项目' },
        brand: { primary: '#00adef', accent: '#37a3eb', warning: '#facc15' },
        prefix_format: { level1: '第{N}章', level2: '{N}.{M}' }
      },
      submitter: { org: '清尚', user_id: 'hou_s', role: '填报人' },
      receiver: { org: '中建三局', user_id: '—', role: '阅读人' },
      nav_tree: defaultNavTree(),
      pages_data: defaultPagesData(),
      work_done: defaultWorkDone(),
      site_photos: defaultSitePhotos(),
      construction_sections: defaultConstructionSections(),
      next_week_plan: defaultNextWeekPlan(),
      ai_review: { auto_generated: true, generated_at: new Date().toISOString(), anomalies: [], evidence: {} },
      submitter_actions: [],
      reviewer_actions: []
    };
    // 跨期复制 (简化: 进度归零, 任务文本继承)
    // 封面/报送信息跨期继承 (不重置)
    if (prevReport && prevReport.project) r.project = { ...prevReport.project };
    if (prevReport && prevReport.submitter) r.submitter = { ...prevReport.submitter };
    if (prevReport && prevReport.receiver) r.receiver = { ...prevReport.receiver };
    if (prevReport && prevReport.work_done) {
      // v5.3: 跨期复制全量 (不重置 progress), 走 migrateWorkDone 兜底 (旧 shape → 新 shape)
      r.work_done = migrateWorkDone(prevReport.work_done);
    }
    if (prevReport && prevReport.pages_data && prevReport.pages_data['03'] && prevReport.pages_data['03'].rows) {
      r.pages_data['03'].rows = prevReport.pages_data['03'].rows.map(p => ({ ...p, present: false, delta: 'carry' }));
    }
    if (prevReport && prevReport.labor_stats) {
      // 旧 next_week -> 新 this_week
      r.pages_data['06'].rows = prevReport.pages_data['06'].rows.map(s => {
        if (s.is_total) return s;
        return { ...s, this_week: s.next_week, next_week: 0 };
      });
    }
    // 计算 nav_tree prefix
    NavTree.renumber(r.nav_tree);
    save(r, period);
    return r;
  }

  function load(period) {
    const key = KEY_PREFIX + period;
    const s = localStorage.getItem(key);
    if (s) {
      const stored = JSON.parse(s);
      // 兜底 nav_tree
      if (!stored.nav_tree) stored.nav_tree = defaultNavTree();
      if (!stored.pages_data) stored.pages_data = defaultPagesData();
      // 兜底: 旧版 03 roster 只有 6 行 -> 用 defaultPagesData 重新填充并 save
      const roster = stored.pages_data['03'] && stored.pages_data['03'].rows;
      if (!roster || roster.length < 20) {
        const fresh = defaultPagesData();
        stored.pages_data['03'] = fresh['03'];
        save(stored, period);
      }
      // 兜底: 旧版 04 work_done 只有 6 条且无 header -> 用 defaultWorkDone 补
      if (stored.work_done && stored.work_done.length < 10 && !stored.work_done.some(r => r.is_header)) {
        stored.work_done = defaultWorkDone();
        save(stored, period);
      }
      // v5.2 → v5.3 迁移: 04 work_done 旧 shape → 新 shape (嵌套 items)
      if (Array.isArray(stored.work_done) && stored.work_done.length > 0 && !Array.isArray(stored.work_done[0].items)) {
        stored.work_done = migrateWorkDone(stored.work_done);
        save(stored, period);
      }
      // 兜底: 缺 11/12/14 pages_data -> 从 defaultPagesData 补 (10 已合并到 11, v5.16 迁移处理, 不再补 10)
      const need11 = !stored.pages_data['11'] || !Array.isArray(stored.pages_data['11'].areas) || !stored.pages_data['11'].areas.length;
      const need12 = !stored.pages_data['12'] || !stored.pages_data['12'].rows;
      const need14 = !stored.pages_data['14'];
      if (need11 || need12 || need14) {
        const fresh = defaultPagesData();
        if (need11) stored.pages_data['11'] = fresh['11'];
        if (need12) stored.pages_data['12'] = fresh['12'];
        if (need14) stored.pages_data['14'] = fresh['14'];
        save(stored, period);
      }
      // v5.7 迁移: 10 旧 rows 用 floor 字段, 改名为 area (与 05 工作现场对齐)
      if (stored.pages_data['10'] && Array.isArray(stored.pages_data['10'].rows)) {
        let changed = false;
        stored.pages_data['10'].rows.forEach(r => {
          if (r && r.floor !== undefined && r.area === undefined) {
            r.area = r.floor;
            delete r.floor;
            changed = true;
          }
        });
        if (changed) save(stored, period);
      }
      // v5.9 迁移: 10 旧 rows 用 { area, url, caption } 平铺结构, 改为 { area, photos: [{url,caption}] } 多图结构
      if (stored.pages_data['10'] && Array.isArray(stored.pages_data['10'].rows)) {
        let changed = false;
        stored.pages_data['10'].rows.forEach(r => {
          if (r && !Array.isArray(r.photos)) {
            r.photos = (r.url !== undefined || r.caption !== undefined)
              ? [{ url: r.url || '', caption: r.caption || '' }]
              : [];
            delete r.url;
            delete r.caption;
            changed = true;
          }
        });
        if (changed) save(stored, period);
      }
      // v5.11 迁移: 11 旧 rows:[{building, part, step, cells, highlight}] 平铺结构
      //   改为 areas:[{area, steps:[{building, part, step, cells, highlight}]}] 分组结构 (按 building 分组, 1 区域=1 表)
      //   保留每行的 building 字段 (按区域名分组后, 楼栋默认=区域名, 也可单行覆盖, 例如一个区域跨多楼栋)
      if (stored.pages_data['11'] && Array.isArray(stored.pages_data['11'].rows) && !Array.isArray(stored.pages_data['11'].areas)) {
        const areaMap = new Map();
        stored.pages_data['11'].rows.forEach(r => {
          if (!r) return;
          const a = r.building || '未命名';
          if (!areaMap.has(a)) areaMap.set(a, []);
          // 保留 building 字段 (缺省时回填为区域名, 确保每行都有楼栋值)
          areaMap.get(a).push({ ...r, building: r.building || a });
        });
        stored.pages_data['11'].areas = Array.from(areaMap.entries()).map(([area, steps]) => ({ area, steps }));
        delete stored.pages_data['11'].rows;
        save(stored, period);
      }
      // v5.12 迁移: 11 cells 旧 MM/DD 字符串 (e.g. '5/5') 改为 ISO (YYYY-MM-DD), 用 period 的年份
      //   索引 0,1,3,4,6,7,... 是 start/end → 转 ISO; 索引 2,5,8,... 是 days → 清空 (改自动计算)
      if (stored.pages_data['11'] && Array.isArray(stored.pages_data['11'].areas)) {
        const year = (stored.period && stored.period.start) ? new Date(stored.period.start).getFullYear() : 2026;
        let changed = false;
        stored.pages_data['11'].areas.forEach(area => {
          (area.steps || []).forEach(step => {
            step.cells = step.cells || [];
            for (let k = 0; k < step.cells.length; k++) {
              const v = step.cells[k];
              if (typeof v !== 'string') continue;
              if (k % 3 === 2) {
                // days cell: 清空 (改自动计算)
                if (v !== '') { step.cells[k] = ''; changed = true; }
              } else {
                // start/end cell: 试匹配 MM/DD 转 ISO
                const m = v.match(/^(\d{1,2})\/(\d{1,2})$/);
                if (m) {
                  const mm = m[1].padStart(2, '0');
                  const dd = m[2].padStart(2, '0');
                  step.cells[k] = year + '-' + mm + '-' + dd;
                  changed = true;
                }
              }
            }
          });
        });
        if (changed) save(stored, period);
      }
      // v5.14 迁移: 11 sections 从顶层 pd.sections 移到每个 area.sections (各区域独立)
      //   旧: { sections: [{name,...}], areas: [{area, steps: [...]}] }
      //   新: { areas: [{area, sections: [{name,...}], steps: [...]}] }
      //   - 顶层有 sections, area 没 sections → 把顶层 sections 复制进每个 area
      //   - 顶层 sections 移完之后删掉
      if (stored.pages_data['11'] && Array.isArray(stored.pages_data['11'].areas)) {
        const pd11 = stored.pages_data['11'];
        const globalSections = Array.isArray(pd11.sections) ? pd11.sections : null;
        let changed = false;
        pd11.areas.forEach(area => {
          if (!Array.isArray(area.sections)) {
            // 各区域独立: 默认给一个空数组; 旧数据有全局 sections 的话, 复制一份
            area.sections = globalSections ? globalSections.map(s => ({ name: s.name || '' })) : [];
            changed = true;
          }
        });
        if (pd11.sections !== undefined) {
          delete pd11.sections;
          changed = true;
        }
        if (changed) save(stored, period);
      }
      // v5.15 迁移: 11 给每个 area 补 baseColumns (楼栋/施工段、部位、工序), 数据已经在 step.building/part/step 里, 无需迁移
      // v5.16 扩展: 顺手也补 photos:[] (4.1 合并进来, 每 area 持有自己的楼层划分图)
      if (stored.pages_data['11'] && Array.isArray(stored.pages_data['11'].areas)) {
        let changed = false;
        const defaultBase = [
          { name: '楼栋/施工段', key: 'building' },
          { name: '部位',       key: 'part' },
          { name: '工序',       key: 'step' }
        ];
        stored.pages_data['11'].areas.forEach(area => {
          if (!Array.isArray(area.baseColumns)) {
            // 用 default 浅拷贝, 避免共享引用
            area.baseColumns = defaultBase.map(c => ({ ...c }));
            changed = true;
          }
          if (!Array.isArray(area.photos)) {
            area.photos = [];
            changed = true;
          }
        });
        if (changed) save(stored, period);
      }
      // v5.16 迁移: 4.1 施工段划分 合并到 4.2 施工段计划
      //   旧: pages_data['10'].rows = [{area, photos:[{url,caption,name}]}]
      //   新: pages_data['11'].areas[*].photos (按 area 名匹配, 旧 s10 删掉)
      //   匹配规则: 精确相等; 匹配不上则 warn + skip (旧版可能 s10 行是"食堂一层", s11 区域是"食堂", 这种情况让用户重新上传)
      if (stored.pages_data['10'] && Array.isArray(stored.pages_data['10'].rows)) {
        const s10Rows = stored.pages_data['10'].rows;
        const s11Areas = (stored.pages_data['11'] && Array.isArray(stored.pages_data['11'].areas))
          ? stored.pages_data['11'].areas : null;
        if (s11Areas) {
          let changed = false;
          s10Rows.forEach(s10Row => {
            if (!s10Row || !s10Row.area || !Array.isArray(s10Row.photos) || s10Row.photos.length === 0) return;
            const match = s11Areas.find(a => a.area === s10Row.area);
            if (match) {
              // 目标 area 还没图, 才覆盖; 已有图则保留 (避免覆盖用户的更新)
              if (!Array.isArray(match.photos) || match.photos.length === 0) {
                match.photos = s10Row.photos.map(p => ({ ...p }));
                changed = true;
              }
            } else {
              // 精确名不匹配, log 一行让用户自查 (开发期)
              try { console.warn('[v5.16] s10.area="' + s10Row.area + '" 在 s11 里找不到匹配区域, 跳过迁移'); } catch (e) {}
            }
          });
          // 旧 s10 删掉 (合并后不再使用)
          delete stored.pages_data['10'];
          changed = true;
          if (changed) save(stored, period);
        }
      }
      // v5.17 迁移: 侧边栏 nav_tree 清理
      //   1) 删 n0701 (旧 4.1 施工段划分) —— pages_data['10'] 已经被 v5.16 删了, 这个节点悬空
      //   2) 找 page_id='11' 的节点, 如果 name 还是 "施工段计划", 改名为 "施工段划分与计划"
      if (Array.isArray(stored.nav_tree)) {
        let navChanged = false;
        const renameId11 = (node) => {
          if (!node) return;
          if (node.page_id === '11' && node.name === '施工段计划') {
            node.name = '施工段划分与计划';
            navChanged = true;
          }
          if (Array.isArray(node.children)) node.children.forEach(renameId11);
        };
        // 1) 删 n0701
        const beforeLen = stored.nav_tree.length;
        stored.nav_tree = stored.nav_tree.filter(n => !(n && n.id === 'n0701' && n.page_id === '10'));
        if (stored.nav_tree.length !== beforeLen) navChanged = true;
        // 2) 改名 page_id=11
        stored.nav_tree.forEach(renameId11);
        if (navChanged) save(stored, period);
      }
      // 兜底: 旧版 09 next_week_plan 在 report.next_week_plan (没在 pages_data['09'].rows)
      if ((!stored.pages_data['09'] || !stored.pages_data['09'].rows || !stored.pages_data['09'].rows.length) && stored.next_week_plan && stored.next_week_plan.length) {
        stored.pages_data['09'] = { type: 'single', table: 'next_week_plan', rows: stored.next_week_plan };
        save(stored, period);
      }
      // 兜底: 缺 n01/n02 (封面/目录) 自动补
      if (!stored.nav_tree.find(n => n.id === 'n01')) {
        stored.nav_tree.unshift({ id: 'n01', type: 'page', page_id: '01', name: '封面', prefix: null, manual_prefix: false, children: [] });
      }
      if (!stored.nav_tree.find(n => n.id === 'n02')) {
        const n01Idx = stored.nav_tree.findIndex(n => n.id === 'n01');
        const newArr = [...stored.nav_tree];
        newArr.splice(n01Idx + 1, 0, { id: 'n02', type: 'page', page_id: '02', name: '目录', prefix: null, manual_prefix: false, children: [] });
        stored.nav_tree = newArr;
      }
      // 迁移: 旧结构 n0301 在 n03.children + pageId='0301' -> 改 pageId='03' (到岗管理人员)
      const oldMiles = stored.nav_tree.find(n => n.id === 'n03' && n.children && n.children.find(c => c.id === 'n0301' && c.page_id === '0301'));
      if (oldMiles) {
        // 改 n0301.page_id = '03' (到岗管理人员)
        const n0301 = oldMiles.children.find(c => c.id === 'n0301');
        if (n0301) {
          n0301.page_id = '03';
          n0301.name = '到岗管理人员';
        }
        // 插入独立 n04 = 重要节点 (pageId='0301')
        const n03Idx = stored.nav_tree.findIndex(n => n.id === 'n03');
        stored.nav_tree.splice(n03Idx + 1, 0, { id: 'n04', type: 'page', page_id: '0301', name: '重要节点', prefix: null, manual_prefix: false, children: [] });
        // 后面节点 id +1 (n04 上周 -> n05, n05 下周 -> n06, n06 协调 -> n07, n07 封尾 -> n08)
        for (let i = 0; i < stored.nav_tree.length; i++) {
          const n = stored.nav_tree[i];
          if (n.id === 'n05' || n.id === 'n06' || n.id === 'n07' || n.id === 'n08') {
            // 转 n0X -> n0(X+1) 已经在数组里, 但 children 里 n0401-n0405 也要 n0501-n0505, n0501-n0503 -> n0601-n0603, n0601 -> n0701
            n.id = n.id.replace(/n0(\d)/, 'n0' + (parseInt(n.id[2]) + 1));
            if (n.children) {
              n.children = n.children.map(c => ({
                ...c,
                id: c.id.replace(/n0(\d{2,})/, (m, num) => 'n0' + (parseInt(num) + (parseInt(num) < 100 ? 1 : (parseInt(n.id[2]) - 4)) ))
              }));
            }
          }
        }
        // 上面 children id 转得乱, 直接重置整个 nav_tree 为 defaultNavTree (保留用户自定义的 name/prefix)
        // 简单: 全部用 defaultNavTree 替换 (用户改的 name 会丢)
        stored.nav_tree = defaultNavTree();
      }
      NavTree.renumber(stored.nav_tree);
      return stored;
    }
    // 找上一期
    const all = getPeriods();
    const idx = all.indexOf(period);
    let prev = null;
    if (idx > 0) prev = load(all[idx - 1]);
    return seed(period, prev);
  }

  function save(r, period) {
    const p = period || _currentPeriod;
    const key = KEY_PREFIX + p;
    localStorage.setItem(key, JSON.stringify(r));
  }

  function getPeriods() {
    // 启动时迁移: v3 时代的 bcy_report_periods -> v5 bcy_periods
    try {
      const old = localStorage.getItem('bcy_report_periods');
      if (old) {
        const oldArr = JSON.parse(old);
        const cur = JSON.parse(localStorage.getItem(PERIOD_KEY) || '[]');
        const merged = Array.from(new Set([...cur, ...oldArr])).sort();
        localStorage.setItem(PERIOD_KEY, JSON.stringify(merged));
        localStorage.removeItem('bcy_report_periods');
        return merged;
      }
    } catch (e) {}
    try {
      const s = localStorage.getItem(PERIOD_KEY);
      if (s) return JSON.parse(s);
    } catch (e) {}
    localStorage.setItem(PERIOD_KEY, JSON.stringify(DEFAULT_PERIODS));
    return DEFAULT_PERIODS;
  }
  function setCurrentPeriod(p) {
    global._currentPeriod = p;
  }
  function getCustomPeriods() {
    // 合并: DEFAULT_CUSTOM 作默认, 用 localStorage 里的 user 改动覆盖 (字段级)
    // 支持断周: 用户的 label 自管, 不被 DEFAULT 重置
    const ls = localStorage.getItem('bcy_custom_periods')
            || localStorage.getItem('bcy_report_custom_periods');
    if (!ls) return DEFAULT_CUSTOM;
    try {
      const userEdits = JSON.parse(ls);
      const merged = {};
      const allKeys = new Set([...Object.keys(DEFAULT_CUSTOM), ...Object.keys(userEdits)]);
      for (const k of allKeys) {
        if (DEFAULT_CUSTOM[k] && userEdits[k]) {
          merged[k] = { ...DEFAULT_CUSTOM[k], ...userEdits[k] };
        } else if (userEdits[k]) {
          merged[k] = userEdits[k];
        } else {
          merged[k] = DEFAULT_CUSTOM[k];
        }
      }
      return merged;
    } catch (e) { return DEFAULT_CUSTOM; }
  }
  // 取项目基准周 (开工周 = 第1周), 用户可在"周报列表/设为基准"改
  function getBasePeriod() {
    return localStorage.getItem(BASE_PERIOD_KEY) || '2026-W18';
  }
  function setBasePeriod(period) {
    localStorage.setItem(BASE_PERIOD_KEY, period);
  }
function getPeriodInfo(period, format) {
    format = format || 'custom';
    const custom = getCustomPeriods();
    if (custom[period]) {
      const c = custom[period];
      const nextDay = new Date(c.end);
      nextDay.setDate(nextDay.getDate() + 1);
      const week = parseInt(period.match(/W(\d+)/)[1]);
      const year = parseInt(period.match(/(\d+)-W/)[1]);
      // label 按 format 算 (标准周 = 永远 ISO, 自定义周 = 永远 c.label)
      // 标准周模式: 直接按 ISO 算, 不读 c.label (用户改过也忽略)
      // 自定义周模式: 用 c.label (DEFAULT 硬编码或用户改的)
      let label;
      if (format === 'standard') {
        label = year + '年第' + week + '周';
      } else {
        label = c.label || ('第' + week + '周');
      }
      return {
        year, week, label,
        start: c.start, end: c.end,
        report_date: toLocalDateStr(nextDay)
      };
    }
    const match = period.match(/(\d+)-W(\d+)/);
    if (!match) return null;
    const year = parseInt(match[1]);
    const week = parseInt(match[2]);
    const jan1 = new Date(year, 0, 1);
    const daysOffset = (week - 1) * 7 - jan1.getDay() + 1;
    const monday = new Date(year, 0, 1 + daysOffset);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const nextDay = new Date(sunday);
    nextDay.setDate(sunday.getDate() + 1);
    // 没 c.label 时按 format 算 (用户加了 W24 之类没在 DEFAULT_CUSTOM 里的)
    const label = format === 'custom'
      ? ('第' + week + '周')
      : (year + '年第' + week + '周');
    return {
      year, week, label,
      start: toLocalDateStr(monday),
      end: toLocalDateStr(sunday),
      report_date: nextDay.toISOString().split('T')[0]
    };
  }
  function getReportList(format) {
    const periods = getPeriods();
    return periods.map(p => {
      const info = getPeriodInfo(p, format);
      const key = KEY_PREFIX + p;
      try {
        const s = localStorage.getItem(key);
        if (s) {
          const report = JSON.parse(s);
          return {
            period: p,
            report_id: report.report_id,
            report_date: info ? info.report_date : (report.period && report.period.report_date),
            is_filled: (report.work_done || []).length > 0
          };
        }
      } catch (e) {}
      return { period: p, report_id: null, report_date: info ? info.report_date : null, is_filled: false };
    });
  }
  function reset() { localStorage.clear(); }
  function addPeriod(period, customInfo) {
    const periods = getPeriods();
    if (!periods.includes(period)) {
      periods.push(period);
      periods.sort();
      localStorage.setItem(PERIOD_KEY, JSON.stringify(periods));
    }
    if (customInfo) {
      const customPeriods = getCustomPeriods();
      customPeriods[period] = customInfo;
      localStorage.setItem(CUSTOM_PERIODS_KEY, JSON.stringify(customPeriods));
    }
    return periods;
  }

  // 章节 / 页面 元数据 (从 v3 还原)
  const GROUPS = [
    { id: 'g_cover',    title: '封面',           chapter: null,            toc: false, pageId: '01'   },
    { id: 'g_toc',      title: '目录',           chapter: null,            toc: false, pageId: '02'   },
    { id: 'g_ch1',      title: '第一章 组织架构', chapter: '一、组织架构',   toc: true,  pageId: '03'   },
    { id: 'g_miles',    title: '项目重要节点一览表', chapter: null,        toc: false, pageId: '0301' },
    { id: 'g_ch2',      title: '第二章 上周工作', chapter: '二、上周工作',   toc: true,  pageId: '04'   },
    { id: 'g_ch3',      title: '第三章 下周计划', chapter: '三、下周计划',   toc: true,  pageId: '09'   },
    { id: 'g_ch4',      title: '第四章 工作计划', chapter: '四、工作计划',   toc: true,  pageId: '11'   },
    { id: 'g_ch5',      title: '第五章 协调事宜', chapter: '五、协调事宜',   toc: true,  pageId: '12'   },
  ];
  
  const PAGES = [
    { id: '01',   title: '封面',                 group: 'g_cover', ai: false, hasInput: false, headerTitle: '' },
    { id: '02',   title: '目录',                 group: 'g_toc',   ai: false, hasInput: false, headerTitle: '目录/Contents' },
    { id: '03',   title: '到岗管理人员名单',     group: 'g_ch1',   ai: false, hasInput: true,  headerTitle: '一、组织架构' },
    { id: '0301', title: '项目重要节点一览表',   group: 'g_miles', ai: false, hasInput: false, headerTitle: '项目重要节点一览表' },
    { id: '04',   title: '上周重要工作完成',     group: 'g_ch2',   ai: true,  hasInput: true,  headerTitle: '二、上周工作' },
    { id: '05',   title: '高管层现场工作',       group: 'g_ch2',   ai: true,  hasInput: true,  headerTitle: '二、上周工作' },
    { id: '06',   title: '现场工作:人员统计',    group: 'g_ch2',   ai: true,  hasInput: true,  headerTitle: '二、上周工作' },
    { id: '07',   title: 'ECC 销项情况',        group: 'g_ch2',   ai: true,  hasInput: true,  headerTitle: '二、上周工作' },
    { id: '08',   title: '图纸深化情况',          group: 'g_ch2',   ai: true,  hasInput: true,  headerTitle: '二、上周工作' },
    { id: '09',   title: '周工作计划',            group: 'g_ch3',   ai: true,  hasInput: true,  headerTitle: '三、下周计划' },
    // v5.16: 施工段划分 (id 10) 已合并到施工段计划 (id 11), 不再单独成节
    // v5.17: 改名 "施工段划分与计划" (合并后的统一标题)
    { id: '11',   title: '施工段划分与计划',      group: 'g_ch4',   ai: true,  hasInput: true,  headerTitle: '四、工作计划' },
    { id: '12',   title: '协调事宜',              group: 'g_ch5',   ai: false, hasInput: true,  headerTitle: '五、协调事宜' },
  ];
  
  function getGroupById(gid) { return GROUPS.find(g => g.id === gid); }
  function getPagesByGroup(gid) { return PAGES.filter(p => p.group === gid); }
  function getPagesByIds(ids) { return PAGES.filter(p => ids.includes(p.id)); }
  
  global.Store = { load,
    toLocalDateStr, save, seed, getPeriods, setCurrentPeriod, getCustomPeriods, getReportList, getPeriodInfo, getBasePeriod, setBasePeriod, addPeriod, reset, defaultNavTree, defaultPagesData,
    GROUPS, PAGES, getGroupById, getPagesByGroup, getPagesByIds,
    DEFAULT_ROLES, migrateWorkDone };
})(typeof window !== 'undefined' ? window : globalThis);
