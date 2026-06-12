import { initDatabase, query } from './db.js';

await initDatabase();

const today = new Date();
const TODAY = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

// === EVENTS ===
const EVENTS_DATA = [
  { id:'E001', date:TODAY, time:'07:55', type:'attendance', areaId:null,       submitter:'系统', source:'auto', status:'confirmed', payload:{workers:['W001','W002','W006','W007'],headcount:4,laborStats:{'木工':1,'电工':1,'吊顶工':1,'水电工':1}} },
  { id:'E002', date:TODAY, time:'08:30', type:'progress',  areaId:'A2',        submitter:'李华', source:'voice', status:'confirmed', payload:{taskName:'天花吊顶龙骨安装',progress:'80%',status:'进行中',owner:'张师傅',headcount:2}, voiceText:'员工餐厅区天花吊顶龙骨安装，张师傅带两个人在做，进度到80%' },
  { id:'E003', date:TODAY, time:'09:00', type:'progress',  areaId:'A1',        submitter:'李华', source:'voice', status:'confirmed', payload:{taskName:'墙面基层处理',progress:'60%',status:'进行中',owner:'李师傅',headcount:3}, voiceText:'高管办公区墙面基层处理，李师傅班3人，完成了60%' },
  { id:'E004', date:TODAY, time:'09:15', type:'material',  areaId:'A3',        submitter:'王刚', source:'manual', status:'confirmed', payload:{materialName:'轻钢龙骨',spec:'50 系列',quantity:120,unit:'根',action:'进场',supplier:'某建材有限公司'} },
  { id:'E005', date:TODAY, time:'10:00', type:'safety',    areaId:null,        submitter:'系统', source:'auto', status:'confirmed', payload:{checkType:'日常安全巡检',result:'发现隐患',issues:['商业展示区临时用电未规范布线','部分灭火器超期未检']} },
  { id:'E006', date:TODAY, time:'10:30', type:'coordination', areaId:'A1',     submitter:'赵磊', source:'manual', status:'confirmed', payload:{topic:'高管办公区天花高度调整',parties:['甲方代表','设计院','项目部'],summary:'原设计天花高度2.8m，甲方要求调整为2.9m，已达成一致意见',status:'已协调'} },
  { id:'E007', date:TODAY, time:'11:00', type:'progress',  areaId:'A4',        submitter:'李华', source:'voice', status:'confirmed', payload:{taskName:'大堂地面找平',progress:'45%',status:'进行中',owner:'王师傅',headcount:2} },
  { id:'E008', date:TODAY, time:'14:00', type:'material',  areaId:'A1',        submitter:'王刚', source:'manual', status:'confirmed', payload:{materialName:'石膏板',spec:'9.5mm',quantity:200,unit:'张',action:'进场',supplier:'某建材有限公司'} },
  { id:'E009', date:TODAY, time:'14:30', type:'safety',    areaId:null,        submitter:'系统', source:'auto', status:'confirmed', payload:{checkType:'隐患排查',result:'正常'} },
  { id:'E010', date:TODAY, time:'15:00', type:'progress',  areaId:'A3',        submitter:'李华', source:'manual', status:'draft',   payload:{taskName:'南塔健身区天花封板',progress:'30%',status:'进行中',owner:'赵师傅'} },
];

// === HISTORY EVENTS ===
const HISTORY_EVENTS = [
  { id:'EH01', date:'2026-06-11', time:'08:00', type:'attendance', payload:{headcount:6} },
  { id:'EH02', date:'2026-06-11', time:'09:00', type:'progress',   payload:{taskName:'墙面基层',progress:'45%'} },
  { id:'EH03', date:'2026-06-11', time:'10:00', type:'progress',   payload:{taskName:'天花龙骨',progress:'70%'} },
  { id:'EH04', date:'2026-06-10', time:'08:00', type:'attendance', payload:{headcount:5} },
  { id:'EH05', date:'2026-06-10', time:'09:30', type:'material',   payload:{materialName:'石膏板',quantity:200} },
  { id:'EH06', date:'2026-06-10', time:'14:00', type:'safety',     payload:{checkType:'巡检',result:'正常'} },
  { id:'EH07', date:'2026-06-09', time:'08:00', type:'attendance', payload:{headcount:7} },
  { id:'EH08', date:'2026-06-09', time:'09:00', type:'progress',   payload:{taskName:'地面找平',progress:'40%'} },
  { id:'EH09', date:'2026-06-09', time:'11:00', type:'coordination', payload:{topic:'材料协调'} },
  { id:'EH10', date:'2026-06-09', time:'15:00', type:'progress',   payload:{taskName:'大堂精装',progress:'55%'} },
  { id:'EH11', date:'2026-06-08', time:'08:00', type:'attendance', payload:{headcount:6} },
  { id:'EH12', date:'2026-06-08', time:'09:00', type:'progress',   payload:{taskName:'天花龙骨',progress:'60%'} },
];

for (const e of EVENTS_DATA) {
  await query(`INSERT INTO dr_events (id,project_id,date,time,type,area_id,payload,submitter,source,confidence,status,note) VALUES($1,'baicaoyuan',$2,$3,$4,$5,$6::jsonb,$7,$8,1.0,$9,'') ON CONFLICT (id) DO NOTHING`,
    [e.id, e.date, e.time, e.type, e.areaId, JSON.stringify(e.payload), e.submitter, e.source, e.status]);
}
for (const e of HISTORY_EVENTS) {
  await query(`INSERT INTO dr_events (id,project_id,date,time,type,payload,submitter,source,confidence,status,note) VALUES($1,'baicaoyuan',$2,$3,$4,$5::jsonb,'系统','auto',1.0,'confirmed','') ON CONFLICT (id) DO NOTHING`,
    [e.id, e.date, e.time, e.type, JSON.stringify(e.payload)]);
}
console.log(`  EVENTS: ${EVENTS_DATA.length + HISTORY_EVENTS.length} inserted`);

// === ISSUES ===
const ISSUES_DATA = [
  { id:'I001', type:'quality',     title:'员工餐厅区天花平整度不达标', areaId:'A2', priority:'high',   status:'in_progress', createdDate:'2026-06-02', deadline:'2026-06-08', owner:'张师傅', description:'天花吊顶局部平整度偏差5mm，超过规范要求', resolution:'', photos:[] },
  { id:'I002', type:'safety',      title:'商业展示区临时用电布线不规范', areaId:'A4', priority:'high',   status:'closed',      createdDate:'2026-06-01', deadline:'2026-06-05', owner:'董宝森', description:'临时用电线路未穿管敷设，存在安全隐患', resolution:'已完成整改，线路已穿管敷设', photos:['P003'], closedDate:'2026-06-03' },
  { id:'I003', type:'coordination',title:'高管办公区天花高度调整', areaId:'A1', priority:'medium', status:'closed',      createdDate:'2026-05-28', deadline:'2026-06-04', owner:'侯帅',   description:'甲方要求将高管区天花高度从2.8m调整为2.9m', resolution:'经各方协调确认，按甲方要求执行', closedDate:'2026-06-03', proposeDept:'清尚项目部', cooperateDept:'设计院' },
  { id:'I004', type:'coordination',title:'员工餐厅区墙体开洞位置确认', areaId:'A2', priority:'medium', status:'closed',      createdDate:'2026-05-28', deadline:'2026-06-05', owner:'张金龙', description:'厨房工艺改造需在隔墙上开洞，需总包确认结构安全', resolution:'总包已确认开洞位置及加固方案', closedDate:'2026-06-04', proposeDept:'清尚项目部', cooperateDept:'中建三局项目部' },
  { id:'I005', type:'quality',     title:'南塔健身区地面平整度', areaId:'A3', priority:'low',    status:'open',        createdDate:'2026-06-05', deadline:'2026-06-12', owner:'刘师傅', description:'自流平施工后局部区域平整度偏差3mm', resolution:'', photos:[] },
  { id:'I006', type:'coordination',title:'景观水池防水材料变更', areaId:'A1', priority:'high',   status:'in_progress', createdDate:'2026-06-03', deadline:'2026-06-10', owner:'侯帅',   description:'原设计JS防水涂料变更为聚氨酯防水涂料', resolution:'', proposeDept:'清尚项目部', cooperateDept:'材料供应商' },
  { id:'I007', type:'coordination',title:'北咖啡厅空调风口调整', areaId:null,  priority:'low',    status:'open',        createdDate:'2026-06-04', deadline:'2026-06-11', owner:'孙浩东', description:'空调风口位置与吊顶造型冲突，需设计确认调整方案', resolution:'', proposeDept:'清尚项目部', cooperateDept:'机电单位' },
  { id:'I008', type:'safety',      title:'部分灭火器超期未检', areaId:null,  priority:'high',   status:'in_progress', createdDate:'2026-06-05', deadline:'2026-06-09', owner:'董宝森', description:'5月份安全检查发现部分区域灭火器已过检验有效期', resolution:'已安排全部送检' },
  { id:'I009', type:'quality',     title:'大堂石材色差问题', areaId:'A4', priority:'medium', status:'in_progress', createdDate:'2026-06-05', deadline:'2026-06-12', owner:'张师傅', description:'大堂墙面干挂石材存在明显色差', resolution:'已联系供应商换货' },
];

for (const i of ISSUES_DATA) {
  await query(`INSERT INTO dr_issues (id,project_id,type,title,area_id,priority,status,created_date,deadline,owner,description,resolution,photos,closed_date,propose_dept,cooperate_dept) VALUES($1,'baicaoyuan',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14,$15) ON CONFLICT (id) DO NOTHING`,
    [i.id, i.type, i.title, i.areaId, i.priority, i.status, i.createdDate, i.deadline, i.owner, i.description, i.resolution, JSON.stringify(i.photos || []), i.closedDate || null, i.proposeDept || null, i.cooperateDept || null]);
}
console.log(`  ISSUES: ${ISSUES_DATA.length} inserted`);

// === ECC ITEMS ===
const ECC_DATA = [
  { id:'ECC001', title:'餐厅区天花平整度偏差', areaId:'A2', discoveredDate:'2026-04-10', status:'closed', closedDate:'2026-05-15' },
  { id:'ECC002', title:'高管办公区天花高度调整', areaId:'A1', discoveredDate:'2026-04-10', status:'closed', closedDate:'2026-05-20' },
  { id:'ECC003', title:'餐厅区墙体开洞确认', areaId:'A2', discoveredDate:'2026-04-15', status:'closed', closedDate:'2026-05-18' },
  { id:'ECC004', title:'景观水池防水变更', areaId:'A1', discoveredDate:'2026-04-20', status:'closed', closedDate:'2026-06-01' },
  { id:'ECC005', title:'南塔健身房排烟口调整', areaId:'A3', discoveredDate:'2026-04-25', status:'closed', closedDate:'2026-05-25' },
  { id:'ECC006', title:'大堂背景墙石材变更', areaId:'A4', discoveredDate:'2026-04-28', status:'closed', closedDate:'2026-05-30' },
  { id:'ECC007', title:'咖啡厅吧台位置调整', areaId:null, discoveredDate:'2026-05-05', status:'closed', closedDate:'2026-06-01' },
  { id:'ECC008', title:'北咖啡厅空调风口调整', areaId:null, discoveredDate:'2026-05-08', status:'closed', closedDate:'2026-06-02' },
  { id:'ECC009', title:'标准层电梯厅石材纹路', areaId:null, discoveredDate:'2026-05-10', status:'closing', closedDate:null },
  { id:'ECC010', title:'高管区墙面软包变更', areaId:'A1', discoveredDate:'2026-05-12', status:'closing', closedDate:null },
  { id:'ECC011', title:'员工餐厅区地面铺装调整', areaId:'A2', discoveredDate:'2026-05-15', status:'closing', closedDate:null },
  { id:'ECC012', title:'南塔健身房墙面材料变更', areaId:'A3', discoveredDate:'2026-05-18', status:'open', closedDate:null },
  { id:'ECC013', title:'大堂门套尺寸变更', areaId:'A4', discoveredDate:'2026-05-20', status:'open', closedDate:null },
  { id:'ECC014', title:'北咖啡厅地面标高调整', areaId:null, discoveredDate:'2026-05-22', status:'open', closedDate:null },
  { id:'ECC015', title:'高管区灯光控制系统变更', areaId:'A1', discoveredDate:'2026-05-25', status:'open', closedDate:null },
  { id:'ECC016', title:'南塔咖啡厅隔断调整', areaId:null, discoveredDate:'2026-05-28', status:'open', closedDate:null },
  { id:'ECC017', title:'食堂区排水沟位置变更', areaId:'A2', discoveredDate:'2026-06-01', status:'open', closedDate:null },
  { id:'ECC018', title:'健身房地面材料变更', areaId:'A3', discoveredDate:'2026-06-01', status:'open', closedDate:null },
  { id:'ECC019', title:'大堂接待台尺寸调整', areaId:'A4', discoveredDate:'2026-06-02', status:'open', closedDate:null },
  { id:'ECC020', title:'标准层电梯厅灯光设计变更', areaId:null, discoveredDate:'2026-06-03', status:'open', closedDate:null },
  { id:'ECC099', title:'历史遗留项（不计入）', areaId:null, discoveredDate:'2026-01-15', status:'open', closedDate:null },
];

for (const e of ECC_DATA) {
  await query(`INSERT INTO dr_ecc_items (id,project_id,title,area_id,discovered_date,status,closed_date) VALUES($1,'baicaoyuan',$2,$3,$4,$5,$6) ON CONFLICT (id) DO NOTHING`,
    [e.id, e.title, e.areaId, e.discoveredDate, e.status, e.closedDate]);
}
console.log(`  ECC_ITEMS: ${ECC_DATA.length} inserted`);

// === DRAWING DEEPENINGS ===
const DRAWING_DATA = [
  { id:'DD001', task:'1-2号咖啡厅样板段策划整理', owner:'李欢', status:'已完成' },
  { id:'DD002', task:'景观水池及花池大样图', owner:'李欢', status:'已完成' },
  { id:'DD003', task:'高管区背景墙排版图', owner:'李欢', status:'已完成' },
  { id:'DD004', task:'高管区灯具定位图', owner:'郭雪纯', status:'已完成' },
  { id:'DD005', task:'南塔咖啡厅吧台详图', owner:'郭雪纯', status:'已完成' },
  { id:'DD006', task:'商业展示区节点大样', owner:'郭雪纯', status:'已完成' },
  { id:'DD007', task:'商铺区域门窗深化图', owner:'李欢', status:'已完成' },
  { id:'DD008', task:'食堂区排水沟及地漏定位图', owner:'郭雪纯', status:'进行中' },
];

for (const d of DRAWING_DATA) {
  await query(`INSERT INTO dr_drawing_deepenings (id,project_id,task,owner,status) VALUES($1,'baicaoyuan',$2,$3,$4) ON CONFLICT (id) DO NOTHING`,
    [d.id, d.task, d.owner, d.status]);
}
console.log(`  DRAWING_DEEPENINGS: ${DRAWING_DATA.length} inserted`);

// === WEEKLY GANTT ITEMS ===
const GANTT_DATA = [
  { id:'WG01', area:'高管层', areaOrder:1, seq:1, task:'高管二层西走廊景观池施工', durationDays:7, schedule:[1,1,1,1,1,1,1], labor:'焊工2人', material:'已到场' },
  { id:'WG02', area:'高管层', areaOrder:1, seq:2, task:'高管一层墙面基层处理', durationDays:5, schedule:[1,1,1,1,1,0,0], labor:'木工3人', material:'已到场' },
  { id:'WG03', area:'高管层', areaOrder:1, seq:3, task:'高管一层天花吊顶龙骨', durationDays:7, schedule:[1,1,1,1,1,1,1], labor:'吊顶工2人', material:'已到场' },
  { id:'WG04', area:'食堂区', areaOrder:2, seq:1, task:'食堂墙面干挂石材', durationDays:7, schedule:[1,1,1,1,1,1,1], labor:'焊工2人,石工2人', material:'已到场' },
  { id:'WG05', area:'食堂区', areaOrder:2, seq:2, task:'食堂天花封板', durationDays:5, schedule:[1,1,1,1,1,0,0], labor:'吊顶工3人', material:'已到场' },
  { id:'WG06', area:'食堂区', areaOrder:2, seq:3, task:'食堂地面找平', durationDays:3, schedule:[1,1,1,0,0,0,0], labor:'瓦工2人', material:'已到场' },
  { id:'WG07', area:'南塔健身房', areaOrder:3, seq:1, task:'健身房墙面基层', durationDays:7, schedule:[1,1,1,1,1,1,1], labor:'木工3人', material:'已到场' },
  { id:'WG08', area:'南塔健身房', areaOrder:3, seq:2, task:'健身房天花龙骨', durationDays:5, schedule:[1,1,1,1,1,0,0], labor:'吊顶工2人', material:'已到场' },
  { id:'WG09', area:'南塔咖啡厅', areaOrder:4, seq:1, task:'咖啡厅墙面基层封板', durationDays:7, schedule:[1,1,1,1,1,1,1], labor:'木工2人', material:'已到场' },
  { id:'WG10', area:'南塔咖啡厅', areaOrder:4, seq:2, task:'咖啡厅天花龙骨', durationDays:5, schedule:[1,1,1,1,1,0,0], labor:'吊顶工2人', material:'已到场' },
  { id:'WG11', area:'北咖啡厅', areaOrder:5, seq:1, task:'北咖啡厅一层基层', durationDays:7, schedule:[1,1,1,1,1,1,1], labor:'木工3人', material:'部分到场' },
  { id:'WG12', area:'北咖啡厅', areaOrder:5, seq:2, task:'北咖啡厅天花龙骨', durationDays:5, schedule:[1,1,1,1,1,0,0], labor:'吊顶工2人', material:'待进场' },
  { id:'WG13', area:'北咖啡厅', areaOrder:5, seq:3, task:'北咖啡厅墙面干挂', durationDays:7, schedule:[0,0,0,0,0,1,1], labor:'焊工2人', material:'待进场' },
  { id:'WG14', area:'高管层', areaOrder:1, seq:4, task:'高管二层天花封板', durationDays:4, schedule:[0,0,1,1,1,1,0], labor:'吊顶工2人', material:'已到场' },
  { id:'WG15', area:'高管层', areaOrder:1, seq:5, task:'高管层电气配管', durationDays:7, schedule:[1,1,1,1,1,1,1], labor:'电工2人', material:'已到场' },
  { id:'WG16', area:'食堂区', areaOrder:2, seq:4, task:'食堂灯具安装', durationDays:3, schedule:[0,0,0,0,0,1,1], labor:'电工2人', material:'部分到场' },
  { id:'WG17', area:'南塔健身房', areaOrder:3, seq:3, task:'健身房电气配管', durationDays:5, schedule:[1,1,1,1,1,0,0], labor:'电工1人', material:'已到场' },
  { id:'WG18', area:'南塔咖啡厅', areaOrder:4, seq:3, task:'咖啡厅电气配管', durationDays:5, schedule:[1,1,1,1,1,0,0], labor:'电工1人', material:'已到场' },
  { id:'WG19', area:'北咖啡厅', areaOrder:5, seq:4, task:'北咖啡厅电气配管', durationDays:5, schedule:[0,0,0,0,0,1,1], labor:'电工1人', material:'待进场' },
  { id:'WG20', area:'高管层', areaOrder:1, seq:6, task:'高管区材料清理倒运', durationDays:2, schedule:[1,1,0,0,0,0,0], labor:'力工2人', material:'' },
  { id:'WG21', area:'南塔健身房', areaOrder:3, seq:4, task:'健身房材料清理', durationDays:1, schedule:[0,0,0,0,1,0,0], labor:'力工1人', material:'' },
];

for (const g of GANTT_DATA) {
  await query(`INSERT INTO dr_weekly_gantt_items (id,area,area_order,seq,task,duration_days,schedule,labor,material) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9) ON CONFLICT (id) DO NOTHING`,
    [g.id, g.area, g.areaOrder, g.seq, g.task, g.durationDays, JSON.stringify(g.schedule), g.labor, g.material]);
}
console.log(`  WEEKLY_GANTT_ITEMS: ${GANTT_DATA.length} inserted`);

// === CONSTRUCTION ZONE SCHEDULES ===
const CZ_DATA = [
  { id:'CZ01', building:'食堂', location:'墙面', process:'基层钢架（含墙面配管）', floors:[{floor:'一层',startDate:'5/5',endDate:'5/15',days:10},{floor:'二层',startDate:'5/5',endDate:'5/15',days:10},{floor:'B1(1)',startDate:'5/5',endDate:'5/15',days:10},{floor:'B1(2)',startDate:'5/5',endDate:'5/15',days:10}] },
  { id:'CZ02', building:'食堂', location:'墙面', process:'封板', floors:[{floor:'一层',startDate:'5/15',endDate:'5/25',days:10},{floor:'二层',startDate:'5/15',endDate:'5/25',days:10},{floor:'B1(1)',startDate:'5/15',endDate:'5/25',days:10},{floor:'B1(2)',startDate:'5/15',endDate:'5/25',days:10}] },
  { id:'CZ03', building:'食堂', location:'墙面', process:'干挂', floors:[{floor:'一层',startDate:'5/21',endDate:'6/5',days:15},{floor:'二层',startDate:'5/21',endDate:'6/5',days:15},{floor:'B1(1)',startDate:'5/21',endDate:'6/5',days:15},{floor:'B1(2)',startDate:'5/21',endDate:'6/5',days:15}] },
  { id:'CZ04', building:'食堂', location:'天花', process:'吊顶龙骨', floors:[{floor:'一层',startDate:'5/15',endDate:'5/28',days:13},{floor:'二层',startDate:'5/15',endDate:'5/28',days:13},{floor:'B1(1)',startDate:'5/15',endDate:'5/28',days:13},{floor:'B1(2)',startDate:'5/15',endDate:'5/28',days:13}] },
  { id:'CZ05', building:'食堂', location:'天花', process:'封板', floors:[{floor:'一层',startDate:'5/28',endDate:'6/5',days:8},{floor:'二层',startDate:'5/28',endDate:'6/5',days:8},{floor:'B1(1)',startDate:'5/28',endDate:'6/5',days:8},{floor:'B1(2)',startDate:'5/28',endDate:'6/5',days:8}] },
  { id:'CZ06', building:'南塔健身房', location:'墙面', process:'钢架（含配管）', floors:[{floor:'四层',startDate:'5/1',endDate:'5/15',days:15},{floor:'五层',startDate:'5/1',endDate:'5/15',days:15}] },
  { id:'CZ07', building:'南塔健身房', location:'墙面', process:'封板', floors:[{floor:'四层',startDate:'5/15',endDate:'5/25',days:10},{floor:'五层',startDate:'5/15',endDate:'5/25',days:10}] },
  { id:'CZ08', building:'南塔健身房', location:'天花', process:'吊顶龙骨', floors:[{floor:'四层',startDate:'5/15',endDate:'5/25',days:10},{floor:'五层',startDate:'5/15',endDate:'5/25',days:10}] },
  { id:'CZ09', building:'南塔健身房', location:'天花', process:'封板', floors:[{floor:'四层',startDate:'5/25',endDate:'6/5',days:10},{floor:'五层',startDate:'5/25',endDate:'6/5',days:10}] },
  { id:'CZ10', building:'南塔健身房', location:'墙面', process:'干挂', floors:[{floor:'四层',startDate:'5/25',endDate:'6/5',days:10},{floor:'五层',startDate:'5/25',endDate:'6/5',days:10}] },
  { id:'CZ11', building:'健身房', location:'地面', process:'找平', floors:[{floor:'四层',startDate:'6/1',endDate:'6/5',days:5},{floor:'五层',startDate:'6/1',endDate:'6/5',days:5}] },
];

for (const z of CZ_DATA) {
  await query(`INSERT INTO dr_construction_zone_schedules (id,building,location,process,floors) VALUES($1,$2,$3,$4,$5::jsonb) ON CONFLICT (id) DO NOTHING`,
    [z.id, z.building, z.location, z.process, JSON.stringify(z.floors)]);
}
console.log(`  CONSTRUCTION_ZONE_SCHEDULES: ${CZ_DATA.length} inserted`);

// === DAILY ATTENDANCE ===
const LAST_14 = [];
for (let i = 13; i >= 0; i--) {
  const d = new Date(today); d.setDate(d.getDate() - i);
  LAST_14.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`);
}

const ALL_MGR = ['MGR01','MGR02','MGR03','MGR04','MGR05','MGR06','MGR07','MGR08','MGR09','MGR10','MGR11','MGR12','MGR13','MGR14','MGR15','MGR16','MGR17','MGR18','MGR19','MGR20','MGR21','MGR22','MGR23'];
let attCount = 0;
for (const date of LAST_14) {
  const d = new Date(date);
  const day = d.getDay();
  if (day === 0 || day === 6) continue; // skip weekends
  for (const mgr of ALL_MGR) {
    const isPresent = !((mgr === 'MGR03' && (day === 3 || day === 4)) || (mgr === 'MGR16' && (day === 4 || day === 5)));
    await query(`INSERT INTO dr_daily_attendance (date,manager_id,present,reason) VALUES($1,$2,$3,$4) ON CONFLICT (date,manager_id) DO NOTHING`,
      [date, mgr, isPresent, isPresent ? '' : (mgr === 'MGR03' ? '事假' : '病假')]);
    attCount++;
  }
}
console.log(`  DAILY_ATTENDANCE: ${attCount} records`);

console.log('\n✅ 种子数据全部导入完成');
process.exit(0);
