// 一次性脚本：把 mock PLANS 写入 PostgreSQL
import { query, initDatabase } from './db.js';

const plans = [
  { id:'PLAN001', project_id:'baicaoyuan', date:'2026-06-05', start_date:'2026-06-05', end_date:'2026-06-12',
    description:'今日继续推进各区域精装施工', task_name:'各区域精装施工', progress:'60%', status:'active',
    labor_schedule:[{laborType:'木工',count:5},{laborType:'电工',count:3},{laborType:'吊顶工',count:2},{laborType:'油漆工',count:2}],
    area_targets:[{areaId:'A1',taskName:'墙面基层处理',targetProgress:'60%'},{areaId:'A2',taskName:'天花吊顶龙骨',targetProgress:'85%'},{areaId:'A3',taskName:'地面找平',targetProgress:'40%'}],
    extra:{} },
  { id:'PLAN002', project_id:'baicaoyuan', date:'2026-06-04', start_date:'2026-06-04', end_date:'2026-06-12',
    description:'推进天花吊顶和墙面施工', task_name:'天花吊顶和墙面施工', progress:'50%', status:'active',
    labor_schedule:[{laborType:'木工',count:4},{laborType:'电工',count:2},{laborType:'吊顶工',count:3}],
    area_targets:[{areaId:'A1',taskName:'墙面基层处理',targetProgress:'50%'},{areaId:'A2',taskName:'天花吊顶龙骨',targetProgress:'75%'}],
    extra:{} },
  { id:'PLAN003', project_id:'baicaoyuan', date:'2026-06-03', start_date:'2026-06-03', end_date:'2026-06-12',
    description:'各区域正常施工', task_name:'各区域正常施工', progress:'30%', status:'active',
    labor_schedule:[{laborType:'木工',count:6},{laborType:'电工',count:3},{laborType:'瓦工',count:2}],
    area_targets:[{areaId:'A1',taskName:'墙面基层处理',targetProgress:'40%'},{areaId:'A4',taskName:'石材干挂',targetProgress:'30%'}],
    extra:{} },
  { id:'PLAN004', project_id:'baicaoyuan', date:'2026-06-13', start_date:'2026-06-13', end_date:'2026-06-19',
    description:'推进各区域精装收尾', task_name:'各区域精装收尾', progress:'70%', status:'active',
    labor_schedule:[{laborType:'木工',count:8},{laborType:'电工',count:4},{laborType:'油漆工',count:3},{laborType:'瓦工',count:2}],
    area_targets:[{areaId:'A1',taskName:'墙面面层',targetProgress:'80%'},{areaId:'A3',taskName:'石材铺贴',targetProgress:'60%'}],
    extra:{} },
  { id:'PLAN005', project_id:'baicaoyuan', date:'2026-06-15', start_date:'2026-06-15', end_date:'2026-06-21',
    description:'下阶段收尾和验收准备', task_name:'下阶段收尾和验收准备', progress:'0%', status:'planned',
    labor_schedule:[{laborType:'木工',count:6},{laborType:'电工',count:3},{laborType:'油漆工',count:4},{laborType:'瓦工',count:1},{laborType:'水电工',count:2}],
    area_targets:[],
    extra:{} },
  // vanke-metropolis 也加一些
  { id:'PLAN101', project_id:'vanke-metropolis', date:'2026-06-13', start_date:'2026-06-13', end_date:'2026-06-19',
    description:'主体结构施工', task_name:'主体结构施工', progress:'50%', status:'active',
    labor_schedule:[{laborType:'木工',count:10},{laborType:'电工',count:5},{laborType:'瓦工',count:3}],
    area_targets:[{areaId:'A1',taskName:'墙体砌筑',targetProgress:'50%'}],
    extra:{} },
  { id:'PLAN102', project_id:'vanke-metropolis', date:'2026-06-15', start_date:'2026-06-15', end_date:'2026-06-21',
    description:'下阶段精装', task_name:'下阶段精装', progress:'0%', status:'planned',
    labor_schedule:[{laborType:'木工',count:5},{laborType:'电工',count:2},{laborType:'油漆工',count:2}],
    area_targets:[],
    extra:{} }
];

(async () => {
  await initDatabase();
  for (const p of plans) {
    await query(
      `INSERT INTO dr_daily_plans (id, project_id, date, start_date, end_date, description, task_name, progress, status, labor_schedule, area_targets, extra, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12::jsonb,now(),now())
       ON CONFLICT (id) DO UPDATE SET
         project_id=EXCLUDED.project_id, date=EXCLUDED.date, start_date=EXCLUDED.start_date, end_date=EXCLUDED.end_date,
         description=EXCLUDED.description, task_name=EXCLUDED.task_name, progress=EXCLUDED.progress, status=EXCLUDED.status,
         labor_schedule=EXCLUDED.labor_schedule, area_targets=EXCLUDED.area_targets, updated_at=now()`,
      [p.id, p.project_id, p.date, p.start_date, p.end_date, p.description, p.task_name, p.progress, p.status,
       JSON.stringify(p.labor_schedule), JSON.stringify(p.area_targets), JSON.stringify(p.extra)]
    );
    console.log('已写入:', p.id, p.project_id);
  }
  console.log('完成,共', plans.length, '条');
  process.exit(0);
})();
