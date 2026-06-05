// platform/js/store.js
// 报告数据 store. v1 用 localStorage, v2 切 PG JSONB
(function (global) {
  const KEY_PREFIX = "bcy_report_";
  const PERIOD_KEY = "bcy_report_periods";
  const CUSTOM_PERIODS_KEY = "bcy_report_custom_periods";
  
  // 当前支持的周期列表（可扩展）
  const DEFAULT_PERIODS = ["2026-W18", "2026-W19", "2026-W20", "2026-W21", "2026-W22"];
  
  // 默认自定义周期配置 - 每周7天（周一至周日）
  const DEFAULT_CUSTOM_PERIODS = {
    "2026-W18": { start: "2026-04-28", end: "2026-05-04", label: "第18周" },
    "2026-W19": { start: "2026-05-05", end: "2026-05-11", label: "第19周" },
    "2026-W20": { start: "2026-05-12", end: "2026-05-18", label: "第20周" },
    "2026-W21": { start: "2026-05-19", end: "2026-05-25", label: "第21周" },
    "2026-W22": { start: "2026-05-26", end: "2026-06-01", label: "第22周" }
  };

  // 获取所有周期
  function getPeriods() {
    try {
      const stored = localStorage.getItem(PERIOD_KEY);
      if (stored) return JSON.parse(stored);
    } catch (e) {}
    localStorage.setItem(PERIOD_KEY, JSON.stringify(DEFAULT_PERIODS));
    return DEFAULT_PERIODS;
  }
  
  // 添加新周期
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
  
  // 获取自定义周期配置
  function getCustomPeriods() {
    try {
      const stored = localStorage.getItem(CUSTOM_PERIODS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return parsed;
      }
    } catch (e) {}
    localStorage.setItem(CUSTOM_PERIODS_KEY, JSON.stringify(DEFAULT_CUSTOM_PERIODS));
    return { ...DEFAULT_CUSTOM_PERIODS };
  }
  
  // 获取周期详情（唯一的数据出口）
  function getPeriodInfo(period) {
    const customPeriods = getCustomPeriods();
    if (customPeriods[period]) {
      const custom = customPeriods[period];
      const nextDay = new Date(custom.end);
      nextDay.setDate(nextDay.getDate() + 1);
      return {
        year: parseInt(period.match(/(\d+)-W/)[1]),
        week: parseInt(period.match(/W(\d+)/)[1]),
        label: custom.label || period,
        start: custom.start,
        end: custom.end,
        report_date: nextDay.toISOString().split('T')[0]
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
    return {
      year,
      week,
      label: `${year}年第${week}周`,
      start: monday.toISOString().split('T')[0],
      end: sunday.toISOString().split('T')[0],
      report_date: nextDay.toISOString().split('T')[0]
    };
  }

  // 7 个平级组（不是树状结构, 封面/目录/0301 与 5 个章平级）
  const GROUPS = [
    { id: "g_cover",    title: "封面",              chapter: null,         toc: false, pageId: "01"   },
    { id: "g_toc",      title: "目录",              chapter: null,         toc: false, pageId: "02"   },
    { id: "g_ch1",      title: "第一章 组织架构",     chapter: "一、组织架构", toc: true,  pageId: "03"   },
    { id: "g_miles",    title: "项目重要节点一览表", chapter: null,         toc: false, pageId: "0301" },
    { id: "g_ch2",      title: "第二章 上周工作",     chapter: "二、上周工作", toc: true,  pageId: "04"   },
    { id: "g_ch3",      title: "第三章 下周计划",     chapter: "三、下周计划", toc: true,  pageId: "09"   },
    { id: "g_ch4",      title: "第四章 工作计划",     chapter: "四、工作计划", toc: true,  pageId: "10"   },
    { id: "g_ch5",      title: "第五章 协调事宜",     chapter: "五、协调事宜", toc: true,  pageId: "12"   },
  ];

  // 12 个分页（每个挂在某个组下）
  const PAGES = [
    { id: "01",   title: "封面",                 group: "g_cover", ai: false, hasInput: false, headerTitle: "" },
    { id: "02",   title: "目录",                 group: "g_toc",   ai: false, hasInput: false, headerTitle: "目录/Contents" },
    { id: "03",   title: "到岗管理人员名单",       group: "g_ch1",   ai: false, hasInput: true,  headerTitle: "一、组织架构" },
    { id: "0301", title: "项目重要节点一览表",     group: "g_miles", ai: false, hasInput: false, headerTitle: "项目重要节点一览表" },
    { id: "04",   title: "上周重要工作完成",       group: "g_ch2",   ai: true,  hasInput: true,  headerTitle: "二、上周工作" },
    { id: "05",   title: "高管层现场工作",         group: "g_ch2",   ai: true,  hasInput: true,  headerTitle: "二、上周工作" },
    { id: "06",   title: "现场工作：人员统计",     group: "g_ch2",   ai: true,  hasInput: true,  headerTitle: "二、上周工作" },
    { id: "07",   title: "ECC 销项情况",          group: "g_ch2",   ai: true,  hasInput: true,  headerTitle: "二、上周工作" },
    { id: "08",   title: "图纸深化情况",          group: "g_ch2",   ai: true,  hasInput: true,  headerTitle: "二、上周工作" },
    { id: "09",   title: "周工作计划",            group: "g_ch3",   ai: true,  hasInput: true,  headerTitle: "三、下周计划" },
    { id: "10",   title: "食堂区施工段划分图",     group: "g_ch4",   ai: false, hasInput: true,  headerTitle: "四、工作计划" },
    { id: "11",   title: "食堂区5月份施工计划",    group: "g_ch4",   ai: true,  hasInput: true,  headerTitle: "四、工作计划" },
    { id: "12",   title: "协调事宜",              group: "g_ch5",   ai: false, hasInput: true,  headerTitle: "五、协调事宜" },
  ];

  const SECTIONS = PAGES;

  function seed(period) {
    const p = period || "2026-W20";
    const periodInfo = getPeriodInfo(p);
    const weekNo = periodInfo ? periodInfo.week : 20;
    return {
      report_id: `BCY-${p}`,
      period: { 
        week_no: weekNo, 
        start: periodInfo ? periodInfo.start : "2026-05-12", 
        end: periodInfo ? periodInfo.end : "2026-05-18", 
        report_date: periodInfo ? periodInfo.report_date : "2026-05-19" 
      },
      project: {
        id: "baicaoyuan",
        name: "百草园城市更新项目",
        general_contractor: "中建三局集团（深圳）有限公司",
        subcontractor: "北京清尚"
      },
      ui_config: {
        template_version: "baicaoyuan-2026-v1",
        bg_image: "../背景.png",
        cover: { title: "百草园城市更新项目", subtitle: "工作周报" },
        brand: { primary: "#00adef", accent: "#37a3eb", warning: "#facc15" }
      },
      submitter: { org: "清尚", user_id: "hou_s", role: "填报人" },
      receiver:  { org: "中建三局", user_id: "—", role: "阅读人" },

      roster: [
        {seq:1,role:"项目经理",name:"侯 帅",phone:"13051103313",present:true,delta:"carry"},
        {seq:2,role:"项目技术负责人兼深化设计负责人",name:"王 健",phone:"13818589201",present:true,delta:"carry"},
        {seq:3,role:"计划经理",name:"陈 冲",phone:"13651007882",present:true,delta:"carry"},
        {seq:4,role:"生产经理（软装）",name:"王亚广",phone:"15910813359",present:true,delta:"carry"},
        {seq:5,role:"生产经理（精装）",name:"鲍永春",phone:"13382510829",present:true,delta:"carry"},
        {seq:6,role:"生产经理（机电）",name:"袁永超",phone:"18900125480",present:true,delta:"carry"},
        {seq:7,role:"深化设计经理（软装）",name:"李 欢",phone:"17310298646",present:true,delta:"carry"},
        {seq:8,role:"深化设计（软装）",name:"乔志广",phone:"13939996372",present:true,delta:"carry"},
        {seq:9,role:"深化设计（软装）",name:"李水旺",phone:"18310163008",present:true,delta:"carry"},
        {seq:10,role:"深化设计（软装）",name:"赵晨星",phone:"15011544879",present:true,delta:"carry"},
        {seq:11,role:"深化设计（软装）",name:"龙 方",phone:"13974050351",present:true,delta:"carry"},
        {seq:12,role:"深化设计经理（精装）",name:"徐诗怡",phone:"18013705168",present:true,delta:"carry"},
        {seq:13,role:"深化设计（机电）",name:"苏 尧",phone:"13141422281",present:true,delta:"carry"},
        {seq:14,role:"成本经理（软装/精装）",name:"郭建欣",phone:"15600173618",present:true,delta:"carry"},
        {seq:15,role:"商务经理（软装/精装）",name:"薛智臣",phone:"18810013805",present:true,delta:"carry"},
        {seq:16,role:"预算员（软装/精装）",name:"王 迪",phone:"15726644536",present:true,delta:"carry"},
        {seq:17,role:"电气预算员（软装/精装）",name:"邓明伟",phone:"19937244723",present:true,delta:"carry"},
        {seq:18,role:"质量经理（软装）",name:"周建忠",phone:"13636535828",present:true,delta:"carry"},
        {seq:19,role:"质量经理（精装）",name:"李欣霖",phone:"17631518331",present:true,delta:"carry"},
        {seq:20,role:"安全经理（软装）",name:"孙攀岳",phone:"18501166924",present:true,delta:"carry"},
        {seq:21,role:"安全经理（精装）",name:"赵国显",phone:"18516217962",present:true,delta:"carry"},
        {seq:22,role:"资料员",name:"蔡丽华",phone:"18600371133",present:true,delta:"carry"},
        {seq:23,role:"材料员（软装/精装）",name:"肖自政",phone:"15093960151",present:true,delta:"carry"}
      ],
      milestones: [
        {major:"软装(清尚)",row:"关键节点","2026.3":"","2026.4":"","2026.5":"","2026.6":"","2026.7":"食堂、健身房、南塔咖啡厅完工","2026.8":"北塔高管区完工"},
        {major:"软装(清尚)",row:"次要节点",
         "2026.3":"1、食堂：墙柱面基层封板（5.30）410评审后方案调整；\n2、高管：墙面基层施工（3.30）；\n3、健身房：墙柱面基层封板（5.30）410评审后方案调整；\n4、南塔咖啡厅：样板段评审（3.30）。",
         "2026.4":"1、食堂：天花封板（6.15）410评审后开始龙骨施工，2层430机电移交，B1层510机电移交；\n2、高管：吊顶造型及龙骨安装（4.30）；\n3、健身房：天花封板（6.15）三局机电支架影响吊顶龙骨安装，风管喷淋追位完成后可提前封板；\n4、南塔咖啡厅：天花封板（6.15）需幕墙封闭；\n5、北塔咖啡厅：基层钢架（6.30）待样板评审完后整体施工。",
         "2026.5":"1、食堂：地面混凝土浇筑（6.10）1层天花腻子基层完成后施工；\n2、高管：天花封板（6.30）需地暖施工完成后开始；\n3、健身房：地面石材铺贴（7.05）天花腻子基层完成后施工；\n4、南塔咖啡厅：墙面石材干挂（6.30）天花腻子施工完成开始；\n5、北塔咖啡厅：墙柱面基层封板；（7.15）待样板评审完后整体施工。",
         "2026.6":"1、食堂：墙柱面饰面板安装、地面石材铺贴（8.30）根据石材大板供应情况分楼层分区域施工；\n2、高管：地面面层施工（6.30）；\n3、健身房：运动PVC地板（8.10）；\n4、南塔咖啡厅：墙面木饰面安装（7.30）；\n5、北塔咖啡厅：天花封板（8.15）需根据幕墙封闭时间。",
         "2026.7":"1、食堂（9.30）；\n2、南北健身房（8.20）；\n3、南塔眼睛咖啡厅（8.30）；\n4、北塔咖啡厅：墙面石材干挂（8.30）。",
         "2026.8":"1、北塔高管区（8.30）\n2、北塔咖啡厅：墙面木饰面（9.30）"}
      ],
      work_done: [
        {area:"高管区",seq:1,task:"一层高管办公室龙骨吊顶",progress:"100%",owner:"鲍永春",deadline:"2026-05-15",source:"voice"},
        {area:"高管区",seq:2,task:"二层房间内地暖盘管",progress:"100%",owner:"鲍永春",deadline:"2026-05-15",source:"voice"},
        {area:"高管区",seq:3,task:"一层西侧走道龙骨吊顶",progress:"80%",owner:"鲍永春",deadline:"2026-05-17",source:"voice"},
        {area:"高管区",seq:4,task:"一层北侧走道龙骨吊顶",progress:"80%",owner:"鲍永春",deadline:"2026-05-17",source:"voice"},
        {area:"高管区",seq:5,task:"一层墙面钢架及龙骨基层",progress:"90%",owner:"鲍永春",deadline:"2026-05-17",source:"voice"},
        {area:"高管区",seq:6,task:"二层墙面钢架及龙骨基层",progress:"85%",owner:"鲍永春",deadline:"2026-05-17",source:"voice"},
        {area:"高管区",seq:7,task:"首二层后勤区域地面砖铺贴",progress:"90%",owner:"鲍永春",deadline:"2026-05-17",source:"voice"},
        {area:"高管区",seq:8,task:"二层焊帘帘盒",progress:"60%",owner:"鲍永春",deadline:"2026-05-17",source:"voice"},
        {area:"高管区",seq:9,task:"首二层地暖房间防水",progress:"100%",owner:"鲍永春",deadline:"2026-05-15",source:"voice"},
        {area:"高管区",seq:10,task:"首二层地暖房间回填 / 陶粒回填",progress:"100%/45%",owner:"鲍永春",deadline:"2026-05-17",source:"voice"},
      ],
      work_done_in_progress_last_week: [3, 4, 5, 6, 7, 8, 9, 10],
      site_photos: {
        "高管层": ["../05上周工作现场.png"]
      },
      labor_stats: [
        {type:"5S小队",this_week:15,next_week:16},
        {type:"电工",this_week:5,next_week:5},
        {type:"电焊工",this_week:13,next_week:13},
        {type:"工长",this_week:8,next_week:8},
        {type:"库管",this_week:1,next_week:1},
        {type:"临电专员",this_week:1,next_week:1},
        {type:"木工",this_week:87,next_week:90},
        {type:"水工",this_week:35,next_week:35},
        {type:"瓦工",this_week:14,next_week:14},
        {type:"普工",this_week:22,next_week:22},
        {type:"油工",this_week:10,next_week:14},
        {type:"防水工",this_week:2,next_week:2},
        {type:"管理人员",this_week:23,next_week:23},
        {type:"室内电梯司机",this_week:2,next_week:2},
        {is_total:true,this_week:238,next_week:246}
      ],
      ecc_summary: {total:110,closed:101,in_process:1,open:9,close_rate:"91.82%"},
      ecc_screenshot: "../07上周工作ECC.png",
      design_deepen: [
        {seq:1,task:"1-2号咖啡厅样板段策划整理",owner:"李 欢",status:"已完成"},
        {seq:2,task:"与设计碰1~2号咖啡厅图纸问题。",owner:"李 欢",status:"进行中"},
        {seq:3,task:"1、负一层二层档口修改方案调整图纸<br>2、二层立面修改方案调整图纸",owner:"乔志广",status:"已完成"},
        {seq:4,task:"1、负一层~二层节点图和负一层、二层立面图修改方案调整图纸<br>2、负一层二层幕墙处理带盒节点调整<br>3、食堂设计变更事项整理",owner:"乔志广",status:"进行中"},
        {seq:5,task:"1、对接旋转楼梯图纸<br>2、岩板弧角及线条打样<br>3、对接木饰面清单清单",owner:"徐诗怡",status:"已完成"},
        {seq:6,task:"打样",owner:"徐诗怡",status:"进行中"},
        {seq:7,task:"3号咖啡厅图纸深化完成已和业主确认签字",owner:"李永旺",status:"已完成"},
        {seq:8,task:"4号咖啡厅图纸根据设计意见和样板评审意见进行调整。",owner:"李永旺",status:"进行中"}
      ],
      next_week_plan: [
        {seq:1,area:"高管层",task:"高管二层西走廊景观池施工",days:7,progress:["fill","fill","fill","fill","fill","fill","fill"],labor:"焊工2人",material:"已到场"},
        {seq:2,area:"高管层",task:"高管一二层公区天花造型吊顶",days:7,progress:["fill","fill","fill","fill","fill","fill","fill"],labor:"木工4人",material:"已到场"},
        {seq:3,area:"高管层",task:"高管二层公区造型封板",days:7,progress:["fill","fill","fill","fill","fill","fill","fill"],labor:"木工6人",material:"已到场"},
        {seq:4,area:"高管层",task:"高管一层房间内地暖施工",days:7,progress:["fill","fill","fill","fill","fill","fill","fill"],labor:"瓦工3人",material:"已到场"},
        {seq:5,area:"高管层",task:"高管一层房间内天花封板",days:5,progress:["empty","empty","fill","fill","fill","fill","fill"],labor:"木工4人",material:"已到场"},
        {seq:6,area:"高管层",task:"高管备餐间及后勤区域铝扣板吊顶",days:4,progress:["empty","empty","empty","fill","fill","fill","fill"],labor:"木工2人",material:"已到场"},
        {seq:7,area:"高管层",task:"高管二层公区地暖区域防水",days:7,progress:["fill","fill","fill","fill","fill","fill","fill"],labor:"瓦工2人",material:"已到场"},
        {seq:8,area:"食堂区",task:"二层天花吊顶及封板",days:7,progress:["fill","fill","fill","fill","fill","fill","fill"],labor:"木工8人",material:"已到场"},
        {seq:9,area:"食堂区",task:"二层天花照明穿线",days:7,progress:["fill","fill","fill","fill","fill","fill","fill"],labor:"电工4人",material:"已到场"},
        {seq:10,area:"食堂区",task:"一层天花腻子",days:7,progress:["fill","fill","fill","fill","fill","fill","fill"],labor:"油工6人",material:"已到场"},
        {seq:11,area:"食堂区",task:"地下室天花吊顶",days:7,progress:["fill","fill","fill","fill","fill","fill","fill"],labor:"木工30人",material:"已到场"},
        {seq:12,area:"食堂区",task:"地下室天花照明配管",days:7,progress:["fill","fill","fill","fill","fill","fill","fill"],labor:"电工14人",material:"已到场"},
        {seq:13,area:"南塔健身房",task:"南健身房天花吊顶",days:7,progress:["fill","fill","fill","fill","fill","fill","fill"],labor:"木工2人",material:"已到场"},
        {seq:14,area:"南塔健身房",task:"墙地面岩板铺贴",days:7,progress:["fill","fill","fill","fill","fill","fill","fill"],labor:"瓦工8人",material:"已到场"},
        {seq:15,area:"南塔咖啡厅",task:"墙面封板",days:7,progress:["fill","fill","fill","fill","fill","fill","fill"],labor:"木工2人",material:"已到场"},
        {seq:16,area:"南塔咖啡厅",task:"天花机电布管",days:7,progress:["fill","fill","fill","fill","fill","fill","fill"],labor:"电工4人",material:"已到场"},
        {seq:17,area:"南塔咖啡厅",task:"天花吊顶龙骨排布",days:7,progress:["fill","fill","fill","fill","fill","fill","fill"],labor:"木工8人",material:"已到场"},
        {seq:18,area:"南塔咖啡厅",task:"墙面钢架焊接",days:7,progress:["fill","fill","fill","fill","fill","fill","fill"],labor:"焊工2人",material:"已到场"},
        {seq:19,area:"北咖啡厅",task:"操作间地面回填",days:3,progress:["empty","empty","empty","empty","fill","fill","fill"],labor:"瓦工2人",material:"已到场"},
        {seq:20,area:"北咖啡厅",task:"操作间地面JS防水施工",days:4,progress:["fill","fill","fill","fill","empty","empty","empty"],labor:"防水2人",material:"已到场"},
        {seq:21,area:"北咖啡厅",task:"样板区隔墙龙骨施工",days:7,progress:["fill","fill","fill","fill","fill","fill","fill"],labor:"木工4人",material:"已到场"}
      ],
      construction_sections: ["../10下周计划施工段划分-食堂一层.png", "../10下周计划施工段划分-食堂二层.png", "../10下周计划施工段划分-食堂B1层.png"],
      construction_section_labels: ["食堂一层","食堂二层","食堂B1层"],
      section_schedule: [
        {seq:1,building:"食堂",part:"墙面",step:"基层钢架（含墙面配管）",cells:["5/5","5/15","10","5/16","5/31","15","4/30","5/15","15","5/31","6/20","20"]},
        {seq:2,building:"食堂",part:"墙面",step:"墙柱面基层封板",cells:["5/16","5/23","7","","","","5/16","5/23","7","","",""]},
        {seq:3,building:"食堂",part:"墙面",step:"墙柱饰面材料深化下单",cells:["5/15","6/4","20","5/25","6/14","20","5/15","6/4","20","5/25","6/14","20"]},
        {seq:4,building:"食堂",part:"墙面",step:"",cells:["","","","","","","","","","","",""]},
        {seq:5,building:"食堂",part:"天花",step:"1专业管线移交",highlight:true,cells:["3/20","3/20","已移交","4/20","4/20","未移交","4/30","4/30","未移交","4/30","4/30","未移交"]},
        {seq:6,building:"食堂",part:"天花",step:"2转换钢架造型龙骨及风管定位",cells:["3/21","4/15","25","4/21","5/11","20","5/1","5/21","20","5/11","5/31","20"]},
        {seq:7,building:"食堂",part:"天花",step:"3龙骨安装、风管追位、其它机电末端定位",cells:["4/8","4/28","20","5/1","5/26","25","5/11","6/5","25","5/21","6/15","25"]},
        {seq:8,building:"食堂",part:"天花",step:"4天花末端追位",cells:["4/18","5/8","20","5/11","5/31","20","5/26","6/15","20","","",""]},
        {seq:9,building:"食堂",part:"天花",step:"5联合隐蔽验收",highlight:true,cells:["5/8","5/15","7","","","","","","","","",""]},
        {seq:10,building:"食堂",part:"天花",step:"6天花封板",cells:["5/16","5/31","15","","","","","","","","",""]},
        {seq:11,building:"食堂",part:"天花",step:"7天花腻子基层及底漆施工（断灰尘）",cells:["5/23","6/22","30","","","","","","","","",""]}
      ],
      coordination: [
        {seq:1,issue:"",proposer:"",cooperator:""},
        {seq:2,issue:"",proposer:"",cooperator:""},
        {seq:3,issue:"",proposer:"",cooperator:""},
        {seq:4,issue:"",proposer:"",cooperator:""},
        {seq:5,issue:"",proposer:"",cooperator:""},
        {seq:6,issue:"",proposer:"",cooperator:""},
        {seq:7,issue:"",proposer:"",cooperator:""},
        {seq:8,issue:"",proposer:"",cooperator:""}
      ],

      ai_review: {
        auto_generated: true,
        generated_at: "2026-05-18T10:00:00Z",
        anomalies: [],
        evidence: {}
      }
    };
  }

  let _currentPeriod = "2026-W20";
  
  function setCurrentPeriod(period) {
    _currentPeriod = period;
  }
  
  function getCurrentPeriod() {
    return _currentPeriod;
  }
  
  function load(period) {
    const p = period || _currentPeriod;
    const key = KEY_PREFIX + p;
    try {
      const s = localStorage.getItem(key);
      if (s) {
        const stored = JSON.parse(s);
        const periodInfo = getPeriodInfo(p);
        if (periodInfo) {
          stored.period.start = periodInfo.start;
          stored.period.end = periodInfo.end;
          stored.period.report_date = periodInfo.report_date;
          stored.period.week_no = periodInfo.week;
        }
        return stored;
      }
    } catch (e) {}
    const fresh = seed(p);
    save(fresh, p);
    return fresh;
  }
  
  function save(r, period) {
    const p = period || r.report_id?.split('-')[1] || _currentPeriod;
    const key = KEY_PREFIX + p;
    const periodInfo = getPeriodInfo(p);
    if (periodInfo) {
      r.period.start = periodInfo.start;
      r.period.end = periodInfo.end;
      r.period.report_date = periodInfo.report_date;
      r.period.week_no = periodInfo.week;
    }
    localStorage.setItem(key, JSON.stringify(r));
  }
  
  function reset(period) {
    const p = period || _currentPeriod;
    const key = KEY_PREFIX + p;
    localStorage.removeItem(key);
    return load(p);
  }
  
  function loadPeriodReport(period) {
    const key = KEY_PREFIX + period;
    try {
      const s = localStorage.getItem(key);
      if (s) return JSON.parse(s);
    } catch (e) {}
    return null;
  }
  
  function getReportList() {
    const periods = getPeriods();
    return periods.map(p => {
      const periodInfo = getPeriodInfo(p);
      const key = KEY_PREFIX + p;
      try {
        const s = localStorage.getItem(key);
        if (s) {
          const report = JSON.parse(s);
          return {
            period: p,
            report_id: report.report_id,
            report_date: periodInfo ? periodInfo.report_date : report.period.report_date,
            is_filled: report.work_done?.length > 0
          };
        }
      } catch (e) {}
      return {
        period: p,
        report_id: null,
        report_date: periodInfo ? periodInfo.report_date : null,
        is_filled: false
      };
    });
  }

  function getHeaderTitle(pageId) {
    const p = PAGES.find(x => x.id === pageId);
    return p ? p.headerTitle : "";
  }
  function getGroupById(gid) {
    return GROUPS.find(g => g.id === gid);
  }
  function getPagesByGroup(gid) {
    return PAGES.filter(p => p.group === gid);
  }

  global.Store = { 
    GROUPS, PAGES, SECTIONS, 
    PERIODS: DEFAULT_PERIODS,
    getPeriods, addPeriod, getPeriodInfo, getCustomPeriods,
    setCurrentPeriod, getCurrentPeriod,
    load, save, reset, loadPeriodReport, getReportList,
    seed, getHeaderTitle, getGroupById, getPagesByGroup 
  };
})(window);