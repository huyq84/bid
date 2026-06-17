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
    const [projects, areas, workers, team, milestones, milestonePlans, plans, events, issues, eccItems, drawings, gantt, zones, attendance, standardTrades, weeklyLabor, page06Photos, eccSummaries] = await Promise.all([
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
      query('SELECT * FROM dr_standard_trades ORDER BY project_id NULLS FIRST, sort_order'),
      query('SELECT * FROM dr_weekly_labor_data ORDER BY week_start, trade_id'),
      query('SELECT * FROM dr_page06_photos ORDER BY created_at'),
      query('SELECT * FROM dr_ecc_summaries'),
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
        totalManDays: p.total_man_days || 0,
        createdAt: p.created_at, updatedAt: p.updated_at,
        ...(p.extra || {}),
      });
    }

    // Build ATTENDANCE object (按 project_id 隔离)
    const attObj = {};
    for (const a of attendance.rows) {
      const pid = a.project_id || 'baicaoyuan';
      if (!attObj[pid]) attObj[pid] = {};
      if (!attObj[pid][a.date]) attObj[pid][a.date] = {};
      attObj[pid][a.date][a.manager_id] = { present: a.present, reason: a.reason || '' };
    }

    // Build today + history events
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const todayEvents = [];
    const historyEvents = [];
    for (const e of events.rows) {
      const ev = {
        id: e.id, projectId: e.project_id, date: e.date, time: e.time,
        type: e.type, areaId: e.area_id, planId: e.plan_id || undefined,
        payload: e.payload || {},
        submitter: e.submitter, source: e.source, confidence: e.confidence,
        status: e.status, voiceText: e.voice_text, photos: e.photos || [],
        note: e.note,
        ...(e.completion_type ? { completionType: e.completion_type } : {}),
        ...(e.building_no ? { buildingNo: e.building_no } : {}),
        ...(e.floor_no ? { floorNo: e.floor_no } : {}),
        ...(e.owner ? { owner: e.owner } : {}),
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
        photos: e.photos || [],
      })),
      DRAWING_DEEPENINGS: drawings.rows.map(d => ({
        id: d.id, projectId: d.project_id, task: d.task, owner: d.owner, status: d.status,
        progress: d.progress || '',
        planId: d.plan_id || null,
        eventId: d.event_id || null,
        areaId: d.area_id || null,
        createdDate: d.created_date || null
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
      STANDARD_TRADES: standardTrades.rows.map(s => ({
        id: s.id, projectId: s.project_id, tradeName: s.trade_name,
        mapFrom: s.map_from, sortOrder: s.sort_order,
      })),
      WEEKLY_LABOR_DATA: weeklyLabor.rows.map(w => ({
        id: w.id, projectId: w.project_id, weekStart: w.week_start,
        tradeId: w.trade_id, thisWeekCount: w.this_week_count || 0,
        nextWeekCount: w.next_week_count || 0, updatedAt: w.updated_at
      })),
      PAGE06_PHOTOS: page06Photos.rows.map(p => ({
        id: p.id, projectId: p.project_id, src: p.src,
        caption: p.caption || '', tradeId: p.trade_id,
      })),
      ECC_SUMMARIES: eccSummaries.rows.reduce((acc, r) => {
        acc[r.project_id] = {
          total: r.total || 0, closed: r.closed || 0,
          closing: r.closing || 0, open: r.open || 0,
          rate: r.rate || '—',
          photos: r.photos || [],
          updatedAt: r.updated_at
        };
        return acc;
      }, {}),
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
    const { id, projectId, date, time, type, areaId, planId, payload, submitter, source, confidence, status, voiceText, photos, note, completionType, buildingNo, floorNo, owner } = req.body;
    await query(
      `INSERT INTO dr_events (id, project_id, date, time, type, area_id, plan_id, payload, submitter, source, confidence, status, voice_text, photos, note, completion_type, building_no, floor_no, owner)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12,$13,$14::jsonb,$15,$16,$17,$18,$19) ON CONFLICT (id) DO UPDATE
       SET project_id=$2, date=$3, time=$4, type=$5, area_id=$6, plan_id=$7, payload=$8::jsonb, submitter=$9, source=$10, confidence=$11, status=$12, voice_text=$13, photos=$14::jsonb, note=$15, completion_type=$16, building_no=$17, floor_no=$18, owner=$19`,
      [id || `E${Date.now()}`, projectId, date, time, type, areaId, planId || null, JSON.stringify(payload || {}), submitter || '张明', source || 'manual', confidence || 1.0, status || 'draft', voiceText || null, JSON.stringify(photos || []), note || '', completionType || null, buildingNo || null, floorNo || null, owner || null]
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

// ==================== AREAS CRUD (含自定义区域) ====================
router.post('/api/areas', async (req, res) => {
  try {
    const { projectId, id, name, floor, manager } = req.body;
    if (!projectId || !id) return res.status(400).json({ error: 'projectId/id required' });
    await query(
      `INSERT INTO dr_areas (project_id, id, name, floor, manager) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (project_id, id) DO UPDATE SET name=$3, floor=$4, manager=$5`,
      [projectId, id, name || '', floor || '', manager || '']
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/api/areas/:projectId/:id', async (req, res) => {
  try {
    await query('DELETE FROM dr_areas WHERE project_id=$1 AND id=$2', [req.params.projectId, req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== PLANS CRUD ====================
router.post('/api/plans', async (req, res) => {
  try {
    const { id, projectId, date, startDate, endDate, description, taskName, progress, status, laborSchedule, areaTargets, totalManDays, extra, createdAt, updatedAt } = req.body;
    await query(
      `INSERT INTO dr_daily_plans (id, project_id, date, start_date, end_date, description, task_name, progress, status, labor_schedule, area_targets, total_man_days, extra, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12,$13::jsonb,$14,$15) ON CONFLICT (id) DO UPDATE
       SET project_id=$2, date=$3, start_date=$4, end_date=$5, description=$6, task_name=$7, progress=$8, status=$9, labor_schedule=$10::jsonb, area_targets=$11::jsonb, total_man_days=$12, extra=$13::jsonb, updated_at=$15`,
      [id, projectId, date || null, startDate, endDate, description, taskName, progress || '0%', status || 'active', JSON.stringify(laborSchedule || []), JSON.stringify(areaTargets || []), totalManDays || 0, JSON.stringify(extra || {}), createdAt || new Date().toISOString(), updatedAt || new Date().toISOString()]
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

// ==================== DRAWING DEEPENINGS CRUD ====================
router.post('/api/drawing-deepenings', async (req, res) => {
  try {
    const { id, projectId, task, owner, status, progress, planId, eventId, areaId, createdDate } = req.body;
    await query(
      `INSERT INTO dr_drawing_deepenings (id, project_id, task, owner, status, progress, plan_id, event_id, area_id, created_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (id) DO UPDATE
       SET project_id=$2, task=$3, owner=$4, status=$5, progress=$6, plan_id=$7, event_id=$8, area_id=$9, created_date=$10`,
      [id, projectId, task, owner, status || '进行中', progress || '', planId || null, eventId || null, areaId || null, createdDate || null]
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/api/drawing-deepenings/:id', async (req, res) => {
  try {
    await query('DELETE FROM dr_drawing_deepenings WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== STANDARD TRADES CRUD ====================
// 周报 06 人员统计的标准工种模板表头
router.get('/api/standard-trades', async (req, res) => {
  try {
    const { projectId } = req.query;
    let rows;
    if (projectId) {
      // 优先项目专属 + 全局默认
      const r = await query(
        `SELECT * FROM dr_standard_trades WHERE project_id=$1 OR project_id IS NULL ORDER BY project_id NULLS FIRST, sort_order`,
        [projectId]
      );
      rows = r.rows;
    } else {
      const r = await query('SELECT * FROM dr_standard_trades ORDER BY project_id NULLS FIRST, sort_order');
      rows = r.rows;
    }
    res.json(rows.map(r => ({
      id: r.id, projectId: r.project_id, tradeName: r.trade_name,
      mapFrom: r.map_from, sortOrder: r.sort_order, createdAt: r.created_at
    })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/api/standard-trades', async (req, res) => {
  try {
    const { id, projectId, tradeName, mapFrom, sortOrder } = req.body;
    if (id) {
      // 更新
      await query(
        `UPDATE dr_standard_trades SET trade_name=$1, map_from=$2, sort_order=$3 WHERE id=$4`,
        [tradeName, mapFrom || null, sortOrder || 0, id]
      );
      res.json({ ok: true, id });
    } else {
      // 新增
      const r = await query(
        `INSERT INTO dr_standard_trades (project_id, trade_name, map_from, sort_order) VALUES ($1, $2, $3, $4) RETURNING id`,
        [projectId || null, tradeName, mapFrom || null, sortOrder || 0]
      );
      res.json({ ok: true, id: r.rows[0].id });
    }
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/api/standard-trades/:id', async (req, res) => {
  try {
    await query('DELETE FROM dr_standard_trades WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== WEEKLY LABOR DATA (固定模板) ====================
// 按 (project_id, week_start, trade_id) 存手工录入的本周/下周人数
router.get('/api/weekly-labor', async (req, res) => {
  try {
    const { projectId, weekStart } = req.query;
    if (!projectId || !weekStart) return res.json([]);
    const r = await query(
      `SELECT * FROM dr_weekly_labor_data WHERE project_id=$1 AND week_start=$2 ORDER BY trade_id`,
      [projectId, weekStart]
    );
    res.json(r.rows.map(row => ({
      id: row.id, projectId: row.project_id, weekStart: row.week_start,
      tradeId: row.trade_id, thisWeekCount: row.this_week_count || 0,
      nextWeekCount: row.next_week_count || 0, updatedAt: row.updated_at
    })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 批量 upsert
router.post('/api/weekly-labor', async (req, res) => {
  try {
    const { rows } = req.body;  // [{ projectId, weekStart, tradeId, thisWeekCount, nextWeekCount }]
    if (!Array.isArray(rows)) return res.status(400).json({ error: 'rows must be array' });
    for (const r of rows) {
      if (!r.projectId || !r.weekStart || !r.tradeId) continue;
      await query(
        `INSERT INTO dr_weekly_labor_data (project_id, week_start, trade_id, this_week_count, next_week_count, updated_at)
         VALUES ($1,$2,$3,$4,$5, now())
         ON CONFLICT (project_id, week_start, trade_id) DO UPDATE
         SET this_week_count=$4, next_week_count=$5, updated_at=now()`,
        [r.projectId, r.weekStart, parseInt(r.tradeId), parseInt(r.thisWeekCount)||0, parseInt(r.nextWeekCount)||0]
      );
    }
    res.json({ ok: true, count: rows.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/api/weekly-labor/:projectId/:weekStart/:tradeId', async (req, res) => {
  try {
    await query(
      'DELETE FROM dr_weekly_labor_data WHERE project_id=$1 AND week_start=$2 AND trade_id=$3',
      [req.params.projectId, req.params.weekStart, req.params.tradeId]
    );
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

// ==================== MANAGEMENT TEAM CRUD ====================
router.post('/api/management-team', async (req, res) => {
  try {
    const { id, position, name, phone } = req.body;
    await query(
      `INSERT INTO dr_management_team (id, position, name, phone) VALUES ($1,$2,$3,$4)
       ON CONFLICT (id) DO UPDATE SET position=$2, name=$3, phone=$4`,
      [id, position || '', name || '', phone || '']
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/api/management-team/:id', async (req, res) => {
  try {
    await query('DELETE FROM dr_daily_attendance WHERE manager_id=$1', [req.params.id]);
    await query('DELETE FROM dr_management_team WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== ATTENDANCE CRUD ====================
router.post('/api/attendance', async (req, res) => {
  try {
    const { date, projectId, records } = req.body; // records = { managerId: { present, reason } }
    for (const [managerId, rec] of Object.entries(records)) {
      await query(
        `INSERT INTO dr_daily_attendance (date, project_id, manager_id, present, reason) VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (date, project_id, manager_id) DO UPDATE SET present=$4, reason=$5`,
        [date, projectId || 'baicaoyuan', managerId, rec.present, rec.reason || '']
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

router.post('/api/milestone-plans/clear/:projectId', async (req, res) => {
  try {
    await query('DELETE FROM dr_milestone_plans WHERE project_id=$1', [req.params.projectId]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== PAGE 06 PHOTOS CRUD ====================
router.get('/api/page06-photos/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params;
    const result = await query(
      'SELECT * FROM dr_page06_photos WHERE project_id=$1 ORDER BY created_at',
      [projectId]
    );
    res.json(result.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/api/page06-photos', async (req, res) => {
  try {
    const { id, projectId, src, caption, tradeId } = req.body;
    await query(
      'INSERT INTO dr_page06_photos (id, project_id, src, caption, trade_id) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO UPDATE SET src=$3, caption=$4, trade_id=$5, created_at=now()',
      [id, projectId, src, caption || '', tradeId || null]
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/api/page06-photos/:projectId/:id', async (req, res) => {
  try {
    await query(
      'DELETE FROM dr_page06_photos WHERE project_id=$1 AND id=$2',
      [req.params.projectId, req.params.id]
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== PAGE 03 PHOTO (签到合影) ====================
router.get('/api/page03-photo/:projectId', async (req, res) => {
  try {
    const r = await query('SELECT * FROM dr_page03_photo WHERE project_id=$1', [req.params.projectId]);
    res.json(r.rows[0] || null);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/api/page03-photo', async (req, res) => {
  try {
    const { projectId, src, caption } = req.body;
    await query(
      `INSERT INTO dr_page03_photo (project_id, src, caption, updated_at) VALUES ($1, $2, $3, $4)
       ON CONFLICT (project_id) DO UPDATE SET src=$2, caption=$3, updated_at=$4`,
      [projectId, src, caption || '管理人员合影', new Date().toISOString()]
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/api/page03-photo/:projectId', async (req, res) => {
  try {
    await query('DELETE FROM dr_page03_photo WHERE project_id=$1', [req.params.projectId]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== ECC ITEMS CRUD ====================
router.post('/api/ecc-items', async (req, res) => {
  try {
    const { id, projectId, title, areaId, discoveredDate, status, closedDate, photos } = req.body;
    await query(
      `INSERT INTO dr_ecc_items (id, project_id, title, area_id, discovered_date, status, closed_date, photos)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
       ON CONFLICT (id) DO UPDATE
       SET title=$3, area_id=$4, discovered_date=$5, status=$6, closed_date=$7, photos=$8::jsonb`,
      [id, projectId, title, areaId, discoveredDate, status || 'open', closedDate || null, JSON.stringify(photos || [])]
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/api/ecc-items/:projectId/:id', async (req, res) => {
  try {
    await query(
      'DELETE FROM dr_ecc_items WHERE project_id=$1 AND id=$2',
      [req.params.projectId, req.params.id]
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== ECC SUMMARY (手动汇总) ====================
router.post('/api/ecc-summary', async (req, res) => {
  try {
    const { projectId, total, closed, closing, open, rate, photos } = req.body;
    if (!projectId) return res.status(400).json({ error: 'projectId required' });
    await query(
      `INSERT INTO dr_ecc_summaries (project_id, total, closed, closing, open, rate, photos, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb, now())
       ON CONFLICT (project_id) DO UPDATE
       SET total=$2, closed=$3, closing=$4, open=$5, rate=$6, photos=$7::jsonb, updated_at=now()`,
      [projectId, parseInt(total)||0, parseInt(closed)||0, parseInt(closing)||0, parseInt(open)||0, rate || '—', JSON.stringify(photos || [])]
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/api/ecc-summary/:projectId', async (req, res) => {
  try {
    await query('DELETE FROM dr_ecc_summaries WHERE project_id=$1', [req.params.projectId]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== 聊天会话 CRUD ====================
router.get('/api/chat/sessions', async (req, res) => {
  try {
    const { projectId } = req.query;
    if (!projectId) return res.status(400).json({ error: 'projectId required' });
    const result = await query('SELECT id, project_id, name, created_at, updated_at FROM dr_chat_sessions WHERE project_id=$1 ORDER BY updated_at DESC', [projectId]);
    res.json(result.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/api/chat/sessions', async (req, res) => {
  try {
    const { projectId, name } = req.body;
    if (!projectId) return res.status(400).json({ error: 'projectId required' });
    const id = 'cs_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    await query('INSERT INTO dr_chat_sessions (id, project_id, name) VALUES ($1,$2,$3)', [id, projectId, name || '新对话']);
    res.json({ id, project_id: projectId, name: name || '新对话' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/api/chat/sessions/:id', async (req, res) => {
  try {
    const { name } = req.body;
    await query('UPDATE dr_chat_sessions SET name=$1, updated_at=NOW() WHERE id=$2', [name, req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/api/chat/sessions/:id', async (req, res) => {
  try {
    await query('DELETE FROM dr_chat_messages WHERE session_id=$1', [req.params.id]);
    await query('DELETE FROM dr_chat_sessions WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/api/chat/sessions/:id/messages', async (req, res) => {
  try {
    const result = await query('SELECT id, role, content, created_at FROM dr_chat_messages WHERE session_id=$1 ORDER BY created_at', [req.params.id]);
    res.json(result.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/api/chat/messages', async (req, res) => {
  try {
    const { sessionId, role, content } = req.body;
    if (!sessionId || !role || !content) return res.status(400).json({ error: 'sessionId, role, content required' });
    const id = 'cm_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    await query('INSERT INTO dr_chat_messages (id, session_id, role, content) VALUES ($1,$2,$3,$4)', [id, sessionId, role, content]);
    await query('UPDATE dr_chat_sessions SET updated_at=NOW() WHERE id=$1', [sessionId]);
    res.json({ ok: true, id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== 系统设置 ====================
router.get('/api/settings', async (req, res) => {
  try {
    const result = await query('SELECT key, value FROM dr_settings ORDER BY key');
    const settings = {};
    result.rows.forEach(r => { settings[r.key] = r.value; });
    res.json(settings);
  } catch (e) {
    // DB 不可用时返回默认值
    res.json(getDefaultSettings());
  }
});

router.post('/api/settings', async (req, res) => {
  try {
    const entries = req.body; // { key: value, ... }
    for (const [key, value] of Object.entries(entries)) {
      await query(
        `INSERT INTO dr_settings (key, value, updated_at) VALUES ($1, $2::jsonb, NOW())
         ON CONFLICT (key) DO UPDATE SET value = $2::jsonb, updated_at = NOW()`,
        [key, JSON.stringify(value)]
      );
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

function getDefaultSettings() {
  return {
    llm_permission: { level: 'confirm' },
    inspection_times: { times: ['08:30', '13:00', '17:30'], interval: 60 }
  };
}

export default router;
