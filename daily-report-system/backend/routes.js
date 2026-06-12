import { Router } from 'express';
import { query, initDatabase, getDbStats } from './db.js';

const router = Router();

// ==================== 启动 ====================
let initialized = false;

// ==================== GET /api/db/init ====================
router.get('/api/db/init', async (req, res) => {
  try {
    await initDatabase();
    initialized = true;
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ==================== GET /api/db/stats ====================
router.get('/api/db/stats', async (req, res) => {
  try {
    if (!initialized) await initDatabase();
    res.json(await getDbStats());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ==================== 全量加载 ====================
router.get('/api/data/all', async (req, res) => {
  try {
    if (!initialized) await initDatabase();
    const [projects, areas, workers, team, milestones, milestonePlans, plans, events, issues, eccItems, drawings, gantt, zones, attendance] = await Promise.all([
      query('SELECT * FROM dr_projects ORDER BY id'),
      query('SELECT * FROM dr_areas ORDER BY project_id, id'),
      query('SELECT * FROM dr_workers ORDER BY id'),
      query('SELECT * FROM dr_management_team ORDER BY id'),
      query('SELECT * FROM dr_milestones ORDER BY project_id, id'),
      query('SELECT * FROM dr_milestone_plans ORDER BY project_id, id'),
      query('SELECT * FROM dr_daily_plans ORDER BY created_at DESC'),
      query('SELECT * FROM dr_events ORDER BY date DESC, time DESC'),
      query('SELECT * FROM dr_issues ORDER BY created_date DESC'),
      query('SELECT * FROM dr_ecc_items ORDER BY id'),
      query('SELECT * FROM dr_drawing_deepenings ORDER BY id'),
      query('SELECT * FROM dr_weekly_gantt_items ORDER BY area_order, seq'),
      query('SELECT * FROM dr_construction_zone_schedules ORDER BY id'),
      query('SELECT * FROM dr_daily_attendance ORDER BY date, manager_id'),
    ]);

    // Build AREAS object (keyed by projectId)
    const areasObj = {};
    for (const a of areas.rows) {
      if (!areasObj[a.project_id]) areasObj[a.project_id] = [];
      areasObj[a.project_id].push({ id: a.id, name: a.name, floor: a.floor, manager: a.manager });
    }

    // Build MILESTONES object
    const milestonesObj = {};
    for (const m of milestones.rows) {
      if (!milestonesObj[m.project_id]) milestonesObj[m.project_id] = [];
      milestonesObj[m.project_id].push({ id: m.id, name: m.name, targetDate: m.target_date, actualDate: m.actual_date, status: m.status, progress: m.progress });
    }

    // Build MILESTONE_PLANS object
    const mpObj = {};
    for (const mp of milestonePlans.rows) {
      if (!mpObj[mp.project_id]) mpObj[mp.project_id] = [];
      const item = { id: mp.id, category: mp.category, nodeType: mp.node_type, areaLabel: mp.area_label, description: mp.description };
      if (mp.target_month !== null) item.targetMonth = mp.target_month;
      if (mp.year) item.year = mp.year;
      if (mp.sub_items && mp.sub_items.length > 0) item.subItems = mp.sub_items;
      mpObj[mp.project_id].push(item);
    }

    // Build PLANS object
    const plansObj = {};
    for (const p of plans.rows) {
      if (!plansObj[p.project_id]) plansObj[p.project_id] = [];
      plansObj[p.project_id].push({
        id: p.id, projectId: p.project_id, date: p.date,
        startDate: p.start_date, endDate: p.end_date,
        description: p.description, taskName: p.task_name,
        progress: p.progress, status: p.status,
        laborSchedule: p.labor_schedule || [], areaTargets: p.area_targets || [],
        createdAt: p.created_at, updatedAt: p.updated_at,
        ...(p.extra || {}),
      });
    }

    // Build ATTENDANCE object
    const attObj = {};
    for (const a of attendance.rows) {
      if (!attObj[a.date]) attObj[a.date] = {};
      attObj[a.date][a.manager_id] = { present: a.present, reason: a.reason || '' };
    }

    // Build today + history events
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const todayEvents = [];
    const historyEvents = [];
    for (const e of events.rows) {
      const ev = {
        id: e.id, projectId: e.project_id, date: e.date, time: e.time,
        type: e.type, areaId: e.area_id, payload: e.payload || {},
        submitter: e.submitter, source: e.source, confidence: e.confidence,
        status: e.status, voiceText: e.voice_text, photos: e.photos || [],
        note: e.note,
      };
      if (e.date === todayStr) todayEvents.push(ev);
      else historyEvents.push(ev);
    }

    res.json({
      PROJECTS: projects.rows.map(p => ({
        id: p.id, name: p.name, client: p.client, location: p.location,
        color: p.color, enabledFields: p.enabled_fields || [],
      })),
      AREAS: areasObj,
      WORKERS: workers.rows.map(w => ({ id: w.id, name: w.name, role: w.role, team: w.team, phone: w.phone })),
      MANAGEMENT_TEAM: team.rows.map(m => ({ id: m.id, position: m.position, name: m.name, phone: m.phone })),
      MILESTONES: milestonesObj,
      MILESTONE_PLANS: mpObj,
      PLANS: plansObj,
      EVENTS: todayEvents,
      HISTORY_EVENTS: historyEvents,
      ISSUES: issues.rows.map(i => ({
        id: i.id, projectId: i.project_id, type: i.type, title: i.title,
        areaId: i.area_id, priority: i.priority, status: i.status,
        createdDate: i.created_date, deadline: i.deadline, owner: i.owner,
        description: i.description, resolution: i.resolution || '',
        photos: i.photos || [], closedDate: i.closed_date,
        proposeDept: i.propose_dept, cooperateDept: i.cooperate_dept,
      })),
      ECC_ITEMS: eccItems.rows.map(e => ({
        id: e.id, projectId: e.project_id, title: e.title, areaId: e.area_id,
        discoveredDate: e.discovered_date, status: e.status, closedDate: e.closed_date,
      })),
      DRAWING_DEEPENINGS: drawings.rows.map(d => ({
        id: d.id, projectId: d.project_id, task: d.task, owner: d.owner, status: d.status,
      })),
      WEEKLY_GANTT_ITEMS: gantt.rows.map(g => ({
        id: g.id, area: g.area, areaOrder: g.area_order, seq: g.seq, task: g.task,
        durationDays: g.duration_days, schedule: g.schedule || [],
        labor: g.labor, material: g.material,
      })),
      CONSTRUCTION_ZONE_SCHEDULES: zones.rows.map(z => ({
        id: z.id, building: z.building, location: z.location, process: z.process,
        floors: z.floors || [],
      })),
      DAILY_ATTENDANCE: attObj,
    });
  } catch (e) {
    console.error('[API] /api/data/all error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ==================== EVENTS CRUD ====================
router.get('/api/events', async (req, res) => {
  try {
    const r = await query('SELECT * FROM dr_events ORDER BY date DESC, time DESC');
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/api/events', async (req, res) => {
  try {
    const { id, projectId, date, time, type, areaId, payload, submitter, source, confidence, status, voiceText, photos, note } = req.body;
    await query(
      `INSERT INTO dr_events (id, project_id, date, time, type, area_id, payload, submitter, source, confidence, status, voice_text, photos, note)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$12,$13::jsonb,$14) ON CONFLICT (id) DO UPDATE SET payload=$7::jsonb, status=$11, note=$14`,
      [id || `E${Date.now()}`, projectId, date, time, type, areaId, JSON.stringify(payload || {}), submitter || '张明', source || 'manual', confidence || 1.0, status || 'draft', voiceText || null, JSON.stringify(photos || []), note || '']
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/api/events/:id', async (req, res) => {
  try {
    const { payload, status, note } = req.body;
    await query('UPDATE dr_events SET payload=$1::jsonb, status=$2, note=$3 WHERE id=$4',
      [JSON.stringify(payload || {}), status, note || '', req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/api/events/:id', async (req, res) => {
  try {
    await query('DELETE FROM dr_events WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== PLANS CRUD ====================
router.post('/api/plans', async (req, res) => {
  try {
    const { id, projectId, date, startDate, endDate, description, taskName, progress, status, laborSchedule, areaTargets, extra, createdAt, updatedAt } = req.body;
    await query(
      `INSERT INTO dr_daily_plans (id, project_id, date, start_date, end_date, description, task_name, progress, status, labor_schedule, area_targets, extra, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12::jsonb,$13,$14) ON CONFLICT (id) DO UPDATE
       SET project_id=$2, date=$3, start_date=$4, end_date=$5, description=$6, task_name=$7, progress=$8, status=$9, labor_schedule=$10::jsonb, area_targets=$11::jsonb, extra=$12::jsonb, updated_at=$14`,
      [id, projectId, date || null, startDate, endDate, description, taskName, progress || '0%', status || 'active', JSON.stringify(laborSchedule || []), JSON.stringify(areaTargets || []), JSON.stringify(extra || {}), createdAt || new Date().toISOString(), updatedAt || new Date().toISOString()]
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/api/plans/:id', async (req, res) => {
  try {
    await query('DELETE FROM dr_daily_plans WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== ISSUES CRUD ====================
router.post('/api/issues', async (req, res) => {
  try {
    const { id, projectId, type, title, areaId, priority, status, createdDate, deadline, owner, description, resolution, photos, closedDate, proposeDept, cooperateDept } = req.body;
    await query(
      `INSERT INTO dr_issues (id, project_id, type, title, area_id, priority, status, created_date, deadline, owner, description, resolution, photos, closed_date, propose_dept, cooperate_dept)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,$15,$16) ON CONFLICT (id) DO UPDATE
       SET type=$3, title=$4, priority=$6, status=$7, owner=$10, description=$11, resolution=$12, photos=$13::jsonb, closed_date=$14, propose_dept=$15, cooperate_dept=$16`,
      [id, projectId, type, title, areaId, priority || 'medium', status || 'open', createdDate, deadline, owner, description, resolution || '', JSON.stringify(photos || []), closedDate || null, proposeDept || null, cooperateDept || null]
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/api/issues/:id', async (req, res) => {
  try {
    await query('DELETE FROM dr_issues WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== ATTENDANCE CRUD ====================
router.post('/api/attendance', async (req, res) => {
  try {
    const { date, records } = req.body; // records = { managerId: { present, reason } }
    for (const [managerId, rec] of Object.entries(records)) {
      await query(
        `INSERT INTO dr_daily_attendance (date, manager_id, present, reason) VALUES ($1,$2,$3,$4)
         ON CONFLICT (date, manager_id) DO UPDATE SET present=$3, reason=$4`,
        [date, managerId, rec.present, rec.reason || '']
      );
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== MILESTONE DATA ====================
router.get('/api/milestone-plans/:projectId', async (req, res) => {
  try {
    const r = await query('SELECT * FROM dr_milestone_plans WHERE project_id=$1 ORDER BY id', [req.params.projectId]);
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/api/milestone-plans', async (req, res) => {
  try {
    const { projectId, id, category, nodeType, areaLabel, description, targetMonth, year, subItems } = req.body;
    await query(
      `INSERT INTO dr_milestone_plans (project_id, id, category, node_type, area_label, description, target_month, year, sub_items)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb) ON CONFLICT (project_id, id) DO UPDATE
       SET category=$3, node_type=$4, area_label=$5, description=$6, target_month=$7, year=$8, sub_items=$9::jsonb`,
      [projectId, id, category, nodeType, areaLabel, description, targetMonth, year || 2026, JSON.stringify(subItems || [])]
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/api/milestone-plans/:projectId/:id', async (req, res) => {
  try {
    await query('DELETE FROM dr_milestone_plans WHERE project_id=$1 AND id=$2', [req.params.projectId, req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
