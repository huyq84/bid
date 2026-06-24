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

// 确保所有新连接使用 UTF-8 编码
pool.on('connect', (client) => {
  client.query("SET client_encoding TO 'UTF8'").catch(() => {});
});

export async function query(text, params) {
  const result = await pool.query(text, params);
  return result;
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
  type TEXT,
  labor_schedule JSONB DEFAULT '[]',
  area_targets JSONB DEFAULT '[]',
  total_man_days INTEGER DEFAULT 0,
  process TEXT,
  owner TEXT,
  building_no TEXT,
  floor_no TEXT,
  materials JSONB DEFAULT '[]',
  machinery JSONB DEFAULT '[]',
  safety_notes TEXT,
  zone_images JSONB DEFAULT '[]',
  area_id TEXT,
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
  plan_id TEXT,
  payload JSONB DEFAULT '{}',
  submitter TEXT DEFAULT '张明',
  source TEXT DEFAULT 'manual',
  confidence REAL DEFAULT 1.0,
  status TEXT DEFAULT 'draft',
  voice_text TEXT,
  photos JSONB DEFAULT '[]',
  note TEXT DEFAULT ''
);
ALTER TABLE dr_events ADD COLUMN IF NOT EXISTS plan_id TEXT;
ALTER TABLE dr_events ADD COLUMN IF NOT EXISTS completion_type TEXT;
ALTER TABLE dr_events ADD COLUMN IF NOT EXISTS building_no TEXT;
ALTER TABLE dr_events ADD COLUMN IF NOT EXISTS floor_no TEXT;
ALTER TABLE dr_events ADD COLUMN IF NOT EXISTS owner TEXT;
ALTER TABLE dr_events ADD COLUMN IF NOT EXISTS task_name TEXT;

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
  closed_date TEXT,
  photos JSONB DEFAULT '[]'::jsonb
);

-- ECC 手动汇总（按项目一条）
CREATE TABLE IF NOT EXISTS dr_ecc_summaries (
  project_id TEXT PRIMARY KEY REFERENCES dr_projects(id) ON DELETE CASCADE,
  total INTEGER DEFAULT 0,
  closed INTEGER DEFAULT 0,
  closing INTEGER DEFAULT 0,
  open INTEGER DEFAULT 0,
  rate TEXT DEFAULT '—',
  photos JSONB DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 图纸深化
CREATE TABLE IF NOT EXISTS dr_drawing_deepenings (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES dr_projects(id) ON DELETE CASCADE,
  task TEXT,
  owner TEXT,
  status TEXT DEFAULT '进行中',
  progress TEXT DEFAULT '',
  plan_id TEXT,
  event_id TEXT,
  area_id TEXT,
  created_date TEXT
);
ALTER TABLE dr_drawing_deepenings ADD COLUMN IF NOT EXISTS progress TEXT DEFAULT '';
ALTER TABLE dr_drawing_deepenings ADD COLUMN IF NOT EXISTS plan_id TEXT;
ALTER TABLE dr_drawing_deepenings ADD COLUMN IF NOT EXISTS event_id TEXT;
ALTER TABLE dr_drawing_deepenings ADD COLUMN IF NOT EXISTS area_id TEXT;
ALTER TABLE dr_drawing_deepenings ADD COLUMN IF NOT EXISTS created_date TEXT;

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
  project_id TEXT,
  manager_id TEXT REFERENCES dr_management_team(id) ON DELETE CASCADE,
  present BOOLEAN DEFAULT false,
  reason TEXT DEFAULT ''
);
-- 兼容旧表（无 project_id 列）自动添加
ALTER TABLE dr_daily_attendance ADD COLUMN IF NOT EXISTS project_id TEXT;
-- 旧记录没有 project_id，给默认项目 'baicaoyuan'
UPDATE dr_daily_attendance SET project_id = 'baicaoyuan' WHERE project_id IS NULL;
-- 删除旧主键（如果存在）
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dr_daily_attendance_pkey') THEN
    ALTER TABLE dr_daily_attendance DROP CONSTRAINT dr_daily_attendance_pkey;
  END IF;
END$$;
-- 添加新主键
ALTER TABLE dr_daily_attendance ADD CONSTRAINT dr_daily_attendance_pkey PRIMARY KEY (date, project_id, manager_id);

-- 标准工种模板（周报 07 人员统计表头，project_id 为 null 表示全局共享）
CREATE TABLE IF NOT EXISTS dr_standard_trades (
  id SERIAL PRIMARY KEY,
  project_id TEXT,
  trade_name TEXT NOT NULL,
  map_from TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 周报 07 手工录入的本周/下周人数（固定模板模式下使用）
CREATE TABLE IF NOT EXISTS dr_weekly_labor_data (
  id SERIAL PRIMARY KEY,
  project_id TEXT NOT NULL,
  week_start TEXT NOT NULL,
  trade_id INTEGER NOT NULL REFERENCES dr_standard_trades(id) ON DELETE CASCADE,
  this_week_count INTEGER DEFAULT 0,
  next_week_count INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(project_id, week_start, trade_id)
);

-- 周报 07 现场照片
CREATE TABLE IF NOT EXISTS dr_page06_photos (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  src TEXT NOT NULL,
  caption TEXT DEFAULT '',
  trade_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 周报 03 签到照片（每项目一张管理人员合影）
CREATE TABLE IF NOT EXISTS dr_page03_photo (
  project_id TEXT PRIMARY KEY REFERENCES dr_projects(id) ON DELETE CASCADE,
  src TEXT NOT NULL,
  caption TEXT DEFAULT '管理人员合影',
  updated_at TEXT
);

-- 事件类型管理（自定义类型持久化到 DB）
CREATE TABLE IF NOT EXISTS dr_event_types (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#64748b',
  icon TEXT NOT NULL DEFAULT '📋',
  custom INTEGER NOT NULL DEFAULT 1,
  hidden INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 预置事件类型种子（custom=0 表示预置，始终保证存在）
-- hidden=0 确保种子数据插入时不被隐藏
-- ⚠️ 注意：如果用户删除了预置类型（hidden=1），种子数据不会重置 hidden
INSERT INTO dr_event_types (id, label, color, icon, custom, hidden, sort_order)
VALUES
  ('progress', '施工进度', '#00adef', '🏗️', 0, 0, 1),
  ('material', '材料进场', '#f59e0b', '📦', 0, 0, 2),
  ('safety', '安全检查', '#ef4444', '🛡️', 0, 0, 3),
  ('coordination', '协调事项', '#8b5cf6', '🤝', 0, 0, 4),
  ('attendance', '人员签到', '#10b981', '✅', 0, 0, 5),
  ('drawing', '图纸深化', '#0ea5e9', '📐', 0, 0, 6)
ON CONFLICT (id) DO UPDATE SET
  label = CASE WHEN dr_event_types.hidden = 0 THEN EXCLUDED.label ELSE dr_event_types.label END,
  color = CASE WHEN dr_event_types.hidden = 0 THEN EXCLUDED.color ELSE dr_event_types.color END,
  icon = CASE WHEN dr_event_types.hidden = 0 THEN EXCLUDED.icon ELSE dr_event_types.icon END,
  custom = CASE WHEN dr_event_types.hidden = 0 THEN EXCLUDED.custom ELSE dr_event_types.custom END,
  hidden = CASE WHEN dr_event_types.hidden = 0 THEN EXCLUDED.hidden ELSE dr_event_types.hidden END,
  sort_order = CASE WHEN dr_event_types.hidden = 0 THEN EXCLUDED.sort_order ELSE dr_event_types.sort_order END,
  updated_at = CASE WHEN dr_event_types.hidden = 0 THEN NOW() ELSE dr_event_types.updated_at END;

-- 系统设置（key-value）
CREATE TABLE IF NOT EXISTS dr_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 会话管理
CREATE TABLE IF NOT EXISTS dr_sessions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL DEFAULT 'baicaoyuan',
  name TEXT NOT NULL DEFAULT '新对话',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dr_session_messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES dr_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
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
  { id: 'MGR01', position: '项目经理',                              name: '侯帅',   phone: '13051103313' },
  { id: 'MGR02', position: '项目技术负责人兼深化设计负责人',          name: '王健',   phone: '13818589201' },
  { id: 'MGR03', position: '计划经理',                              name: '陈冲',   phone: '13651007882' },
  { id: 'MGR04', position: '生产经理（软装）',                       name: '王亚广', phone: '15910813359' },
  { id: 'MGR05', position: '生产经理（精装）',                       name: '鲍永春', phone: '13382510829' },
  { id: 'MGR06', position: '生产经理（机电）',                       name: '袁永超', phone: '18900125480' },
  { id: 'MGR07', position: '深化设计经理（软装）',                   name: '李欢',   phone: '17310298646' },
  { id: 'MGR08', position: '深化设计（软装）',                       name: '乔志广', phone: '13939996372' },
  { id: 'MGR09', position: '深化设计（软装）',                       name: '李水旺', phone: '18310163008' },
  { id: 'MGR10', position: '深化设计（软装）',                       name: '赵晨星', phone: '15011544879' },
  { id: 'MGR11', position: '深化设计（软装）',                       name: '龙方',   phone: '13974050351' },
  { id: 'MGR12', position: '深化设计经理（精装）',                   name: '徐诗怡', phone: '18013705168' },
  { id: 'MGR13', position: '深化设计（机电）',                       name: '苏尧',   phone: '13141422281' },
  { id: 'MGR14', position: '成本经理（软装/精装）',                  name: '郭建欣', phone: '15600173618' },
  { id: 'MGR15', position: '商务经理（软装/精装）',                  name: '薛智臣', phone: '18810013805' },
  { id: 'MGR16', position: '预算员（软装/精装）',                    name: '王迪',   phone: '15726644536' },
  { id: 'MGR17', position: '电气预算员（软装/精装）',                name: '邓明伟', phone: '19937244723' },
  { id: 'MGR18', position: '质量经理（软装）',                       name: '周建忠', phone: '13636535828' },
  { id: 'MGR19', position: '质量经理（精装）',                       name: '李欣霖', phone: '17631518331' },
  { id: 'MGR20', position: '安全经理（软装）',                       name: '孙攀岳', phone: '18501166924' },
  { id: 'MGR21', position: '安全经理（精装）',                       name: '赵国显', phone: '18516217962' },
  { id: 'MGR22', position: '资料员',                                name: '蔡丽华', phone: '18600371133' },
  { id: 'MGR23', position: '材料员（软装/精装）',                    name: '肖自政', phone: '15093960151' },
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

// 标准工种模板（周报 07 人员统计表头，project_id 为 null 表示全局共享）
const SEED_STANDARD_TRADES = [
  { trade_name: '5S小队',   map_from: '普工' },
  { trade_name: '电工',     map_from: '电工' },
  { trade_name: '电焊工',   map_from: '焊工' },
  { trade_name: '工长',     map_from: null },
  { trade_name: '库管',     map_from: null },
  { trade_name: '临电专员', map_from: null },
  { trade_name: '木工',     map_from: '木工' },
  { trade_name: '水工',     map_from: '水电工' },
  { trade_name: '瓦工',     map_from: '瓦工' },
  { trade_name: '普工',     map_from: null },
  { trade_name: '油工',     map_from: '油漆工' },
  { trade_name: '防水工',   map_from: null },
  { trade_name: '管理人员', map_from: null },
  { trade_name: '室内电梯司机', map_from: null }
];

// 自动创建数据库（若不存在）
async function ensureDatabaseExists() {
  const targetDb = process.env.DB_NAME || 'weekly_report';
  try {
    // 试探：是否能连上目标库
    await pool.query('SELECT 1');
    return; // 库存在，正常返回
  } catch (e) {
    // 3D000 = invalid catalog name（数据库不存在）
    if (e.code !== '3D000') throw e;
  }

  // 库不存在 → 连默认 postgres 库来创建
  console.log(`[DB] 目标数据库 "${targetDb}" 不存在，尝试自动创建...`);
  const adminPool = new pg.Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: 'postgres',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '123456',
  });
  try {
    await adminPool.query(`CREATE DATABASE "${targetDb}" ENCODING 'UTF8' LC_COLLATE 'zh_CN.UTF-8' LC_CTYPE 'zh_CN.UTF-8' TEMPLATE template0`);
    console.log(`[DB] 目标数据库 "${targetDb}" 创建成功`);
  } catch (createErr) {
    // 42P04 = duplicate_database（其他进程/请求刚创建了）
    if (createErr.code !== '42P04') {
      console.error(`[DB] 创建数据库失败（需要 CREATEDB 权限）: ${createErr.message}`);
      throw createErr;
    }
    console.log(`[DB] 目标数据库 "${targetDb}" 已存在（其他进程）`);
  } finally {
    await adminPool.end();
  }

  // 等 pool 的连接缓存清掉，下次 query 时它会用新库重连
}

export async function initDatabase() {
  // 1. 确保目标数据库存在（不存在则自动创建）
  await ensureDatabaseExists();

  // Create tables
  await pool.query(SCHEMA_SQL);
  // 给旧表加 extra 列
  try { await pool.query('ALTER TABLE dr_daily_plans ADD COLUMN IF NOT EXISTS extra JSONB DEFAULT \'{}\''); } catch {}; // skip on older PG
  try { await pool.query('ALTER TABLE dr_daily_plans ADD COLUMN IF NOT EXISTS total_man_days INTEGER DEFAULT 0'); } catch {};
  // 给计划表加 process/owner/buildingNo/floorNo 列
  try { await pool.query("ALTER TABLE dr_daily_plans ADD COLUMN IF NOT EXISTS process TEXT"); } catch {};
  try { await pool.query("ALTER TABLE dr_daily_plans ADD COLUMN IF NOT EXISTS owner TEXT"); } catch {};
  try { await pool.query("ALTER TABLE dr_daily_plans ADD COLUMN IF NOT EXISTS building_no TEXT"); } catch {};
  try { await pool.query("ALTER TABLE dr_daily_plans ADD COLUMN IF NOT EXISTS floor_no TEXT"); } catch {};
  try { await pool.query("ALTER TABLE dr_daily_plans ADD COLUMN IF NOT EXISTS type TEXT"); } catch {};
  try { await pool.query("ALTER TABLE dr_daily_plans ADD COLUMN IF NOT EXISTS materials JSONB DEFAULT '[]'"); } catch {};
  try { await pool.query("ALTER TABLE dr_daily_plans ADD COLUMN IF NOT EXISTS machinery JSONB DEFAULT '[]'"); } catch {};
  try { await pool.query("ALTER TABLE dr_daily_plans ADD COLUMN IF NOT EXISTS safety_notes TEXT"); } catch {};
  try { await pool.query("ALTER TABLE dr_daily_plans ADD COLUMN IF NOT EXISTS zone_images JSONB DEFAULT '[]'"); } catch {};
  try { await pool.query("ALTER TABLE dr_daily_plans ADD COLUMN IF NOT EXISTS area_id TEXT"); } catch {};
  // 给旧 ECC 表加 photos 列
  try { await pool.query('ALTER TABLE dr_ecc_items ADD COLUMN IF NOT EXISTS photos JSONB DEFAULT \'[]\'::jsonb'); } catch {};
  // 给旧 ECC 汇总表加 photos 列
  try { await pool.query('ALTER TABLE dr_ecc_summaries ADD COLUMN IF NOT EXISTS photos JSONB DEFAULT \'[]\'::jsonb'); } catch {};

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
      `INSERT INTO dr_management_team (id, position, name, phone) VALUES ($1,$2,$3,$4) ON CONFLICT (id) DO UPDATE SET position=$2, name=$3, phone=$4`,
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

  // Seed milestone plans (禁用：避免后端重启时把用户已清空的数据重新插回)
  // 如需重新 seed，手动执行 seed_all.mjs

  // Seed standard trades (项目内标准工种模板，project_id 为 null 表示全局默认)
  const { rows: stCount } = await pool.query('SELECT COUNT(*) AS cnt FROM dr_standard_trades');
  if (parseInt(stCount[0].cnt) === 0) {
    for (let i = 0; i < SEED_STANDARD_TRADES.length; i++) {
      const t = SEED_STANDARD_TRADES[i];
      await pool.query(
        `INSERT INTO dr_standard_trades (project_id, trade_name, map_from, sort_order) VALUES (NULL, $1, $2, $3)`,
        [t.trade_name, t.map_from, i + 1]
      );
    }
  }
  // 聊天会话
  await pool.query(`
    CREATE TABLE IF NOT EXISTS dr_chat_sessions (
      id TEXT PRIMARY KEY,
      project_id TEXT REFERENCES dr_projects(id) ON DELETE CASCADE,
      name TEXT NOT NULL DEFAULT '新对话',
      created_at TEXT NOT NULL DEFAULT (NOW()),
      updated_at TEXT NOT NULL DEFAULT (NOW())
    )
  `);
  // 聊天消息
  await pool.query(`
    CREATE TABLE IF NOT EXISTS dr_chat_messages (
      id TEXT PRIMARY KEY,
      session_id TEXT REFERENCES dr_chat_sessions(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (NOW())
    )
  `);
  // 索引
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_chat_sessions_project ON dr_chat_sessions(project_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON dr_chat_messages(session_id, created_at)`);
}

export async function getDbStats() {
  const tables = ['dr_projects', 'dr_areas', 'dr_workers', 'dr_management_team', 'dr_milestones', 'dr_milestone_plans', 'dr_daily_plans', 'dr_events', 'dr_issues', 'dr_ecc_items', 'dr_drawing_deepenings', 'dr_weekly_gantt_items', 'dr_construction_zone_schedules', 'dr_daily_attendance', 'dr_standard_trades', 'dr_weekly_labor_data', 'dr_page06_photos', 'dr_ecc_summaries', 'dr_page03_photo', 'dr_chat_sessions', 'dr_chat_messages'];
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
