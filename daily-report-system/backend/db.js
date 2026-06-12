import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const pool = new pg.Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'weekly_report',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '123456',
});

export async function query(text, params) {
  return pool.query(text, params);
}

export async function getClient() {
  return pool.connect();
}

const SCHEMA_SQL = `
-- 项目
CREATE TABLE IF NOT EXISTS dr_projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  client TEXT,
  location TEXT,
  color TEXT DEFAULT '#00adef',
  enabled_fields JSONB DEFAULT '[]'
);

-- 区域
CREATE TABLE IF NOT EXISTS dr_areas (
  project_id TEXT REFERENCES dr_projects(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  name TEXT,
  floor TEXT,
  manager TEXT,
  PRIMARY KEY (project_id, id)
);

-- 工人
CREATE TABLE IF NOT EXISTS dr_workers (
  id TEXT PRIMARY KEY,
  name TEXT,
  role TEXT,
  team TEXT,
  phone TEXT
);

-- 管理团队
CREATE TABLE IF NOT EXISTS dr_management_team (
  id TEXT PRIMARY KEY,
  position TEXT,
  name TEXT NOT NULL,
  phone TEXT
);

-- 里程碑
CREATE TABLE IF NOT EXISTS dr_milestones (
  project_id TEXT REFERENCES dr_projects(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  name TEXT,
  target_date TEXT,
  actual_date TEXT,
  status TEXT DEFAULT 'pending',
  progress INTEGER DEFAULT 0,
  PRIMARY KEY (project_id, id)
);

-- 里程碑计划（0301 页）
CREATE TABLE IF NOT EXISTS dr_milestone_plans (
  project_id TEXT REFERENCES dr_projects(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  category TEXT,
  node_type TEXT,
  area_label TEXT,
  description TEXT,
  target_month INTEGER,
  year INTEGER DEFAULT 2026,
  sub_items JSONB DEFAULT '[]',
  PRIMARY KEY (project_id, id)
);

-- 日计划
CREATE TABLE IF NOT EXISTS dr_daily_plans (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES dr_projects(id) ON DELETE CASCADE,
  date TEXT,
  start_date TEXT,
  end_date TEXT,
  description TEXT,
  task_name TEXT,
  progress TEXT DEFAULT '0%',
  status TEXT DEFAULT 'active',
  labor_schedule JSONB DEFAULT '[]',
  area_targets JSONB DEFAULT '[]',
  extra JSONB DEFAULT '{}',
  created_at TEXT,
  updated_at TEXT
);

-- 日报事件（核心表）
CREATE TABLE IF NOT EXISTS dr_events (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES dr_projects(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  time TEXT,
  type TEXT NOT NULL,
  area_id TEXT,
  payload JSONB DEFAULT '{}',
  submitter TEXT DEFAULT '张明',
  source TEXT DEFAULT 'manual',
  confidence REAL DEFAULT 1.0,
  status TEXT DEFAULT 'draft',
  voice_text TEXT,
  photos JSONB DEFAULT '[]',
  note TEXT DEFAULT ''
);

-- 事项台账
CREATE TABLE IF NOT EXISTS dr_issues (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES dr_projects(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT,
  area_id TEXT,
  priority TEXT DEFAULT 'medium',
  status TEXT DEFAULT 'open',
  created_date TEXT,
  deadline TEXT,
  owner TEXT,
  description TEXT,
  resolution TEXT DEFAULT '',
  photos JSONB DEFAULT '[]',
  closed_date TEXT,
  propose_dept TEXT,
  cooperate_dept TEXT
);

-- ECC 专项
CREATE TABLE IF NOT EXISTS dr_ecc_items (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES dr_projects(id) ON DELETE CASCADE,
  title TEXT,
  area_id TEXT,
  discovered_date TEXT,
  status TEXT DEFAULT 'open',
  closed_date TEXT
);

-- 图纸深化
CREATE TABLE IF NOT EXISTS dr_drawing_deepenings (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES dr_projects(id) ON DELETE CASCADE,
  task TEXT,
  owner TEXT,
  status TEXT DEFAULT '进行中'
);

-- 周甘特项
CREATE TABLE IF NOT EXISTS dr_weekly_gantt_items (
  id TEXT PRIMARY KEY,
  area TEXT,
  area_order INTEGER DEFAULT 0,
  seq INTEGER DEFAULT 1,
  task TEXT,
  duration_days INTEGER DEFAULT 7,
  schedule JSONB DEFAULT '[]',
  labor TEXT DEFAULT '',
  material TEXT DEFAULT ''
);

-- 施工段计划
CREATE TABLE IF NOT EXISTS dr_construction_zone_schedules (
  id TEXT PRIMARY KEY,
  building TEXT,
  location TEXT,
  process TEXT,
  floors JSONB DEFAULT '[]'
);

-- 每日签到
CREATE TABLE IF NOT EXISTS dr_daily_attendance (
  date TEXT NOT NULL,
  manager_id TEXT REFERENCES dr_management_team(id) ON DELETE CASCADE,
  present BOOLEAN DEFAULT false,
  reason TEXT DEFAULT '',
  PRIMARY KEY (date, manager_id)
);
`;

// Seed data from mock-data.js
const SEED_PROJECTS = [
  { id: 'baicaoyuan', name: '百草园城市更新项目', client: '中建三局集团（深圳）有限公司', location: '深圳·南山', color: '#00adef', enabled_fields: JSON.stringify(['areas', 'tasks', 'photos', 'labor_stats', 'milestones']) },
  { id: 'lvcheng-riverside', name: '绿城·滨江壹号', client: '绿城中国', location: '杭州·滨江', color: '#10b981', enabled_fields: JSON.stringify(['areas', 'tasks', 'photos']) },
  { id: 'vanke-metropolis', name: '万科·大都会', client: '万科集团', location: '深圳·福田', color: '#8b5cf6', enabled_fields: JSON.stringify(['areas', 'tasks', 'photos']) },
];

const SEED_AREAS = {
  baicaoyuan: [
    { id: 'A1', name: '高管办公区', floor: '1F-3F', manager: '张明' },
    { id: 'A2', name: '员工餐厅区', floor: '1F-2F', manager: '王刚' },
    { id: 'A3', name: '南塔健身区', floor: '4F-5F', manager: '李明' },
    { id: 'A4', name: '大堂/接待区', floor: '1F', manager: '赵磊' },
  ],
  'lvcheng-riverside': [
    { id: 'B1', name: '东区住宅', floor: '1F-18F', manager: '刘伟' },
    { id: 'B2', name: '西区商业', floor: 'B1-3F', manager: '陈静' },
  ],
  'vanke-metropolis': [
    { id: 'C1', name: 'A 栋办公', floor: '1F-20F', manager: '黄丽' },
    { id: 'C2', name: 'B 栋公寓', floor: '1F-15F', manager: '周强' },
  ],
};

const SEED_WORKERS = [
  { id: 'W001', name: '张师傅', role: '木工', team: 'A 班', phone: '138****1234' },
  { id: 'W002', name: '李师傅', role: '电工', team: 'A 班', phone: '139****5678' },
  { id: 'W003', name: '王师傅', role: '吊顶工', team: 'B 班', phone: '137****9012' },
  { id: 'W004', name: '赵师傅', role: '水电工', team: 'B 班', phone: '136****3456' },
  { id: 'W005', name: '刘师傅', role: '油漆工', team: 'A 班', phone: '135****7890' },
  { id: 'W006', name: '陈师傅', role: '焊工', team: 'B 班', phone: '134****2345' },
  { id: 'W007', name: '吴师傅', role: '瓦工', team: 'A 班', phone: '133****6789' },
];

const SEED_MANAGEMENT_TEAM = [
  { id: 'MGR01', position: '项目经理', name: '侯帅', phone: '13051103313' },
  { id: 'MGR02', position: '项目执行经理', name: '孙浩东', phone: '17326846352' },
  { id: 'MGR03', position: '生产经理', name: '张金龙', phone: '17777777777' },
  { id: 'MGR04', position: '项目总工', name: '候辉景', phone: '13988888888' },
  { id: 'MGR05', position: '质量总监', name: '志国', phone: '18888888888' },
  { id: 'MGR06', position: '安全总监', name: '刑永胜', phone: '13788888888' },
  { id: 'MGR07', position: '商务经理', name: '雷恒', phone: '13588888888' },
  { id: 'MGR08', position: '物资经理', name: '刘浩', phone: '18788888888' },
  { id: 'MGR09', position: '深化设计', name: '蔡浩川', phone: '18988888888' },
  { id: 'MGR10', position: '资料员', name: '吴昊', phone: '18388888888' },
  { id: 'MGR11', position: 'BIM 工程师', name: '杨德安', phone: '15788888888' },
  { id: 'MGR12', position: '施工员', name: '刘闯', phone: '13288888888' },
  { id: 'MGR13', position: '精装施工员', name: '徐长林', phone: '17788888888' },
  { id: 'MGR14', position: '施工员', name: '程千', phone: '15288888888' },
  { id: 'MGR15', position: '施工员', name: '刘喜', phone: '18688888888' },
  { id: 'MGR16', position: '安全员', name: '董宝森', phone: '17688888888' },
  { id: 'MGR17', position: '质量员', name: '吴迪', phone: '18888888888' },
  { id: 'MGR18', position: '质量员', name: '张强', phone: '15688888888' },
  { id: 'MGR19', position: '材料员', name: '裴柯', phone: '13088888888' },
  { id: 'MGR20', position: '测量员', name: '党志高', phone: '15088888888' },
  { id: 'MGR21', position: '水电工程师', name: '王团结', phone: '17388888888' },
  { id: 'MGR22', position: '文员', name: '韩笑', phone: '13788888888' },
  { id: 'MGR23', position: '保安队长', name: '刘队', phone: '13488888888' },
];

const SEED_MILESTONES_BAICAOYUAN = [
  { project_id: 'baicaoyuan', id: 'M001', name: '精装修进场', target_date: '2026-05-01', actual_date: '2026-05-01', status: 'completed', progress: 100 },
  { project_id: 'baicaoyuan', id: 'M002', name: '基层施工过半', target_date: '2026-06-01', actual_date: '2026-06-03', status: 'completed', progress: 100 },
  { project_id: 'baicaoyuan', id: 'M003', name: '样板间进场', target_date: '2026-05-15', actual_date: '2026-05-15', status: 'completed', progress: 100 },
  { project_id: 'baicaoyuan', id: 'M004', name: '大堂精装启动', target_date: '2026-06-01', actual_date: '2026-06-01', status: 'completed', progress: 100 },
  { project_id: 'baicaoyuan', id: 'M005', name: '天花封板完成', target_date: '2026-07-01', actual_date: null, status: 'in_progress', progress: 75 },
  { project_id: 'baicaoyuan', id: 'M006', name: '墙面石材干挂', target_date: '2026-08-01', actual_date: null, status: 'in_progress', progress: 50 },
  { project_id: 'baicaoyuan', id: 'M007', name: '精装面层施工', target_date: '2026-09-01', actual_date: null, status: 'pending', progress: 0 },
  { project_id: 'baicaoyuan', id: 'M008', name: '竣工验收', target_date: '2026-10-15', actual_date: null, status: 'pending', progress: 0 },
];

const SEED_MILESTONE_PLANS_SOFT = [
  { project_id: 'baicaoyuan', id: 'MP001', category: '软装', node_type: '关键节点', area_label: null, description: '食堂、健身房、南塔咖啡厅完工', target_month: 7, year: 2026, sub_items: '[]' },
  { project_id: 'baicaoyuan', id: 'MP002', category: '软装', node_type: '关键节点', area_label: null, description: '北咖啡厅完工', target_month: 8, year: 2026, sub_items: '[]' },
  { project_id: 'baicaoyuan', id: 'MP003', category: '软装', node_type: '次要节点', area_label: null, description: null, target_month: null, year: 2026, sub_items: JSON.stringify([
    { seq: 1, label: '食堂', text: '墙柱面基层封板（5.30）410评审后方案调整导致工期延后需与总包重新协调施工计划', targetMonth: 5 },
    { seq: 2, label: '食堂', text: '天花吊顶龙骨安装', targetMonth: 6 },
    { seq: 3, label: '食堂', text: '墙地面石材干挂', targetMonth: 6 },
    { seq: 4, label: '食堂', text: '天花封板大面完成（7初）', targetMonth: 7 },
    { seq: 5, label: '食堂', text: '灯具末端安装', targetMonth: 7 },
    { seq: 6, label: '健身房', text: '墙柱面基层封板（6.10）', targetMonth: 6 },
    { seq: 7, label: '健身房', text: '天花吊顶龙骨、封板', targetMonth: 7 },
    { seq: 8, label: '南塔咖啡厅', text: '墙柱面基层封板（6.10）', targetMonth: 6 },
    { seq: 9, label: '南塔咖啡厅', text: '天花吊顶龙骨', targetMonth: 7 },
    { seq: 10, label: '南塔咖啡厅', text: '天花封板预计8月15日', targetMonth: 8 },
  ]) },
  { project_id: 'baicaoyuan', id: 'MP004', category: '软装', node_type: '关键节点', area_label: '北咖啡厅', description: '一层墙柱面基层封板（5.15），天花封板（7.15），灯具安装（8.15）', target_month: 5, year: 2026, sub_items: '[]' },
];

const SEED_MILESTONE_PLANS_HARD = [
  { project_id: 'baicaoyuan', id: 'MP005', category: '精装', node_type: '关键节点', area_label: null, description: '10F 大堂精装完成', target_month: 6, year: 2026, sub_items: '[]' },
  { project_id: 'baicaoyuan', id: 'MP006', category: '精装', node_type: '次要节点', area_label: null, description: null, target_month: null, year: 2026, sub_items: JSON.stringify([
    { seq: 1, label: '10F 大堂', text: '墙面石材干挂', targetMonth: 5 },
    { seq: 2, label: '10F 大堂', text: '地面铺贴', targetMonth: 6 },
    { seq: 3, label: '10F 大堂', text: '天棚吊顶', targetMonth: 6 },
    { seq: 4, label: 'B1 电梯厅', text: '墙面干挂（5.25）', targetMonth: 5 },
    { seq: 5, label: 'B1 电梯厅', text: '地面铺贴（6.15）', targetMonth: 6 },
  ]) },
  { project_id: 'baicaoyuan', id: 'MP007', category: '精装', node_type: '关键节点', area_label: '大堂', description: '前台背景墙基层、面层施工', target_month: 7, year: 2026, sub_items: '[]' },
  { project_id: 'baicaoyuan', id: 'MP008', category: '精装', node_type: '关键节点', area_label: '电梯厅', description: '标准层电梯厅精装施工', target_month: 8, year: 2026, sub_items: '[]' },
];

export async function initDatabase() {
  // Create tables
  await pool.query(SCHEMA_SQL);
  // 给旧表加 extra 列
  try { await pool.query('ALTER TABLE dr_daily_plans ADD COLUMN IF NOT EXISTS extra JSONB DEFAULT \'{}\''); } catch {}; // skip on older PG

  // Seed projects
  for (const p of SEED_PROJECTS) {
    await pool.query(
      `INSERT INTO dr_projects (id, name, client, location, color, enabled_fields) VALUES ($1,$2,$3,$4,$5,$6::jsonb) ON CONFLICT (id) DO NOTHING`,
      [p.id, p.name, p.client, p.location, p.color, p.enabled_fields]
    );
  }

  // Seed areas
  for (const [pid, areas] of Object.entries(SEED_AREAS)) {
    for (const a of areas) {
      await pool.query(
        `INSERT INTO dr_areas (project_id, id, name, floor, manager) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (project_id, id) DO NOTHING`,
        [pid, a.id, a.name, a.floor, a.manager]
      );
    }
  }

  // Seed workers
  for (const w of SEED_WORKERS) {
    await pool.query(
      `INSERT INTO dr_workers (id, name, role, team, phone) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO NOTHING`,
      [w.id, w.name, w.role, w.team, w.phone]
    );
  }

  // Seed management team
  for (const m of SEED_MANAGEMENT_TEAM) {
    await pool.query(
      `INSERT INTO dr_management_team (id, position, name, phone) VALUES ($1,$2,$3,$4) ON CONFLICT (id) DO NOTHING`,
      [m.id, m.position, m.name, m.phone]
    );
  }

  // Seed milestones
  for (const m of SEED_MILESTONES_BAICAOYUAN) {
    await pool.query(
      `INSERT INTO dr_milestones (project_id, id, name, target_date, actual_date, status, progress) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (project_id, id) DO NOTHING`,
      [m.project_id, m.id, m.name, m.target_date, m.actual_date, m.status, m.progress]
    );
  }

  // Seed milestone plans
  const allPlans = [...SEED_MILESTONE_PLANS_SOFT, ...SEED_MILESTONE_PLANS_HARD];
  for (const mp of allPlans) {
    await pool.query(
      `INSERT INTO dr_milestone_plans (project_id, id, category, node_type, area_label, description, target_month, year, sub_items) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb) ON CONFLICT (project_id, id) DO NOTHING`,
      [mp.project_id, mp.id, mp.category, mp.node_type, mp.area_label, mp.description, mp.target_month, mp.year, mp.sub_items]
    );
  }
}

export async function getDbStats() {
  const tables = ['dr_projects', 'dr_areas', 'dr_workers', 'dr_management_team', 'dr_milestones', 'dr_milestone_plans', 'dr_daily_plans', 'dr_events', 'dr_issues', 'dr_ecc_items', 'dr_drawing_deepenings', 'dr_weekly_gantt_items', 'dr_construction_zone_schedules', 'dr_daily_attendance'];
  const stats = {};
  for (const t of tables) {
    try {
      const r = await pool.query(`SELECT COUNT(*) AS cnt FROM ${t}`);
      stats[t] = parseInt(r.rows[0].cnt);
    } catch { stats[t] = -1; }
  }
  return stats;
}

export default pool;
