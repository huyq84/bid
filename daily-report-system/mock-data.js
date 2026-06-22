// ============================================================
// Mock 数据 - 日报到周报 LLM 聚合系统
// 说明：只有空数据结构和工具函数，真正的数据来自 PostgreSQL
// ============================================================

// 当前选中项目（在 localStorage 里持久化）
let CURRENT_PROJECT_ID = localStorage.getItem('current_project_id') || 'baicaoyuan';

// ============================================================
// 1. 空数据结构（API 会填充）
// ============================================================
const PROJECTS = [];
const AREAS = {};
const WORKERS = [];
const MANAGEMENT_TEAM = [];
const EVENTS = [];
const HISTORY_EVENTS = [];
const ISSUES = [];
const PLANS = {};
const MILESTONES = {};
const MILESTONE_PLANS = {};
const ECC_ITEMS = [];
const DRAWING_DEEPENINGS = [];
const WEEKLY_GANTT_ITEMS = [];
const CONSTRUCTION_ZONE_SCHEDULES = [];

// ============================================================
// 2. 元数据 / 枚举常量
// ============================================================
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

const SOURCE_META = {
  voice:  { label: '语音', icon: '🎤' },
  photo:  { label: '拍照', icon: '📷' },
  manual: { label: '手动', icon: '✏️' },
  auto:   { label: '自动', icon: '⚙️' },
  chat:   { label: 'AI 对话', icon: '🤖' }
};

// ============================================================
// 3. 日期工具
// ============================================================
const TODAY = (() => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
})();

function _formatDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function _formatDateYMD(s) {
  if (!s) return '';
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!m) return s;
  return `${m[1]}/${parseInt(m[2])}/${parseInt(m[3])}`;
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

// ============================================================
// 4. 日常数据获取
// ============================================================
function getDailyEvents(date, projectId) {
  const todayEvents = EVENTS.filter(e => e.projectId === projectId && e.date === date);
  const historyEvents = HISTORY_EVENTS.filter(e => e.projectId === projectId && e.date === date);
  return [...todayEvents, ...historyEvents];
}

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
// 5. 出勤签到
// ============================================================
const DAILY_ATTENDANCE = {};

function getAttendanceForDate(date) {
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
// 6. 辅助函数
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
  const MD = (typeof window !== 'undefined' && window.MockData) || {};
  if (MD.PLANS && MD.PLANS[projectId]) return MD.PLANS[projectId];
  const stored = localStorage.getItem('daily_plans');
  if (stored) {
    try {
      const all = JSON.parse(stored);
      return all[projectId] || [];
    } catch (e) {}
  }
  return [];
}

function setCurrentProjectId(pid) {
  CURRENT_PROJECT_ID = pid;
}

function saveEventsToStorage() { try { localStorage.setItem('daily_events', JSON.stringify(EVENTS)); } catch(e) {} }
function savePlansToStorage() { try { localStorage.setItem('daily_plans', JSON.stringify(PLANS)); } catch(e) {} }

// ============================================================
// 7. 周报数据映射
// ============================================================

// --- 页面 01：封面 ---
function getPage01Data(projectId, dateOverride) {
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

// --- 页面 0301：重要节点 ---
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
    if (projectId && M && M.MILESTONE_PLANS) {
      M.MILESTONE_PLANS[projectId] = plans;
    }
    MILESTONE_DATA = null;
  } catch (e) { console.warn('[milestone] 同步失败:', e); }
}

function resetMilestoneCache() {
  MILESTONE_DATA = null;
}

function _milestoneDataToPlans(data) {
  if (!data || !data.rows) return [];
  const projectId = (typeof window !== 'undefined' && window.MOCK_CURRENT_PROJECT) || CURRENT_PROJECT_ID || (M && M.PROJECTS && M.PROJECTS[0] && M.PROJECTS[0].id) || 'baicaoyuan';
  const plans = [];
  const year = (data.months && data.months[0]) ? parseInt(String(data.months[0]).split('.')[0], 10) : 2026;
  data.rows.forEach(r => {
    if (r.rowType === 'key') {
      const entry = { projectId, id: 'MP_' + Math.random().toString(36).slice(2, 8), category: r.major, nodeType: '关键节点', areaLabel: null, description: '', targetMonth: 0, year, subItems: [] };
      data.months.forEach(mk => {
        const val = r[mk];
        if (!val) return;
        const mNum = parseInt(mk.split('.')[1], 10);
        entry.description = val;
        entry.targetMonth = mNum;
      });
      if (!entry.description && entry.targetMonth === 0) return;
      plans.push(entry);
    } else {
      const subItems = [];
      let firstTargetMonth = 0;
      data.months.forEach(mk => {
        const val = r[mk];
        if (!val) return;
        const mNum = parseInt(mk.split('.')[1], 10);
        if (firstTargetMonth === 0) firstTargetMonth = mNum;
        const lines = val.split('\n').filter(Boolean);
        lines.forEach(line => {
          const colonIdx = line.indexOf('：');
          const label = colonIdx > 0 ? line.slice(0, colonIdx) : '';
          const text = colonIdx > 0 ? line.slice(colonIdx + 1) : line;
          if (!subItems.some(s => s.label === label && s.text === text)) {
            subItems.push({ seq: subItems.length + 1, label, text, targetMonth: mNum });
          }
        });
      });
      if (subItems.length > 0) {
        plans.push({ projectId, id: 'MP_' + Math.random().toString(36).slice(2, 8), category: r.major, nodeType: '次要节点', areaLabel: null, targetMonth: firstTargetMonth, year, subItems });
      }
    }
  });
  return plans;
}

function getPage0301Data(projectId) {
  initMilestoneData();
  const { months, rows } = MILESTONE_DATA;
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

// --- 页面 04：上周工作完成 ---
function getPage04Data(projectId, weekStart, weekEnd) {
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
  weekEvents.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const dedup = new Map();
  const noPlan = [];
  weekEvents.forEach(e => {
    if (e.planId) {
      const key = e.planId;
      dedup.set(key, e);
    } else {
      noPlan.push(e);
    }
  });
  weekEvents = [...noPlan, ...dedup.values()];
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
    rows.push({ type: 'header', text: `${areaName}：` });
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

// --- 页面 05：现场照片 ---
function getPage05Photos(projectId, weekStart, weekEnd, maxCount = 6) {
  const MD = (typeof window !== 'undefined' && window.MockData) || {};
  const events = MD.EVENTS || EVENTS;
  const historyEvents = MD.HISTORY_EVENTS || HISTORY_EVENTS;
  const allEvents = [...events, ...historyEvents];
  const weekEvents = allEvents.filter(e =>
    e.projectId === projectId &&
    e.date >= weekStart && e.date <= weekEnd &&
    e.status === 'confirmed'
  );
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

// --- 页面 06：人员统计 ---
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
  const dbTrades = (this && this.STANDARD_TRADES && this.STANDARD_TRADES.length > 0)
    ? this.STANDARD_TRADES
    : DEFAULT_STANDARD_TRADES;
  const STANDARD_TRADES = dbTrades.map(t => ({
    id: t.id,
    trade: t.tradeName,
    mapFrom: t.mapFrom
  }));
  const findStandardKey = (raw) => {
    if (!raw) return raw;
    const t = STANDARD_TRADES.find(st => st.mapFrom === raw || st.trade === raw);
    return t && t.mapFrom ? t.mapFrom : raw;
  };
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
      for (const rawTrade in e.payload.laborStats) {
        const count = e.payload.laborStats[rawTrade];
        const trade = findStandardKey(rawTrade);
        if (trade && count) {
          thisWeekTradeCounts[trade] = (thisWeekTradeCounts[trade] || 0) + count;
        }
      }
    } else {
      const taskName = e.payload?.taskName || '';
      const hc = e.payload?.headcount || 0;
      const guessTrade = _guessTradeFromTaskName(taskName);
      if (guessTrade && hc) {
        const key = findStandardKey(guessTrade);
        thisWeekTradeCounts[key] = (thisWeekTradeCounts[key] || 0) + hc;
      }
    }
  });
  const prevTradeCounts = {};
  const { weekStart: prevMon } = getWeekRangeForDate(new Date(new Date(weekStart).getTime() - 7 * 86400000).toISOString().slice(0, 10));
  const prevEnd = new Date(new Date(prevMon).getTime() + 6 * 86400000).toISOString().slice(0, 10);
  const prevWeekEvents = [...events, ...historyEvents].filter(e =>
    e.projectId === projectId &&
    e.type === 'progress' &&
    e.status === 'confirmed' &&
    e.date >= prevMon && e.date <= prevEnd
  );
  prevWeekEvents.forEach(e => {
    if (e.payload?.laborRequirements?.length) {
      e.payload.laborRequirements.forEach(item => {
        const trade = findStandardKey(item.trade || item.laborType);
        const count = item.count;
        if (trade && count) {
          prevTradeCounts[trade] = (prevTradeCounts[trade] || 0) + count;
        }
      });
    } else if (e.payload?.laborStats) {
      for (const rawTrade in e.payload.laborStats) {
        const count = e.payload.laborStats[rawTrade];
        const trade = findStandardKey(rawTrade);
        if (trade && count) {
          prevTradeCounts[trade] = (prevTradeCounts[trade] || 0) + count;
        }
      }
    } else {
      const taskName = e.payload?.taskName || '';
      const hc = e.payload?.headcount || 0;
      const guessTrade = _guessTradeFromTaskName(taskName);
      if (guessTrade && hc) {
        const key = findStandardKey(guessTrade);
        prevTradeCounts[key] = (prevTradeCounts[key] || 0) + hc;
      }
    }
  });
  const fields = STANDARD_TRADES.map(t => {
    const thisWeek = thisWeekTradeCounts[t.mapFrom || t.tradeName] || 0;
    const prevWeek = prevTradeCounts[t.mapFrom || t.tradeName] || 0;
    const diff = thisWeek - prevWeek;
    return { tradeName: t.tradeName, thisWeek, prevWeek, diff };
  });
  return fields;
}

// --- 页面 07：ECC ---
function getPage07Data(projectId) {
  const manual = (this && this.ECC_SUMMARIES && this.ECC_SUMMARIES[projectId]) || null;
  if (manual && manual.total > 0) {
    return { total: manual.total, closed: manual.closed, closing: manual.closing, open: manual.open, rate: manual.rate };
  }
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
function getPage08Data(projectId) {
  const MD = (typeof window !== 'undefined' && window.MockData) || {};
  const allDd = (MD.DRAWING_DEEPENINGS || DRAWING_DEEPENINGS || []).filter(d => d.projectId === projectId);
  const seed = allDd.filter(d => !d.eventId).map((d, i) => ({ seq: i + 1, task: d.task, owner: d.owner, progress: d.progress || '', status: d.status, source: 'seed', eventId: null }));
  const syncedEventIds = new Set(allDd.filter(d => d.eventId).map(d => d.eventId));
  const synced = allDd.filter(d => d.eventId).map((d, i) => ({ seq: seed.length + i + 1, task: d.task, owner: d.owner, progress: d.progress || '', status: d.status, source: 'event-synced', eventId: d.eventId, planId: d.planId || null, createdDate: d.createdDate || '' }));
  const fromEvents = (MD.EVENTS || EVENTS || []).filter(e => e.projectId === projectId && e.type === 'drawing' && e.status === 'confirmed' && !syncedEventIds.has(e.id)).map((e, i) => {
    const p = e.payload || {};
    return { seq: seed.length + synced.length + i + 1, task: p.taskName || '', owner: p.owner || e.owner || '', progress: p.progress || '', status: p.status || '进行中', source: 'event', eventId: e.id, planId: e.planId || null, createdDate: e.date || '' };
  });
  const all = [...seed, ...synced, ...fromEvents];
  const byPlan = new Map();
  for (const r of all) {
    if (r.planId) {
      const cur = byPlan.get(r.planId);
      if (!cur || (r.createdDate || '') > (cur.createdDate || '')) byPlan.set(r.planId, r);
    } else {
      byPlan.set('__no_plan_' + Math.random(), r);
    }
  }
  return Array.from(byPlan.values()).map((r, i) => ({ ...r, seq: i + 1 }));
}

// --- 页面 09：周计划 ---
function getPage09Data(projectId, nextWeekStart, nextWeekEnd) {
  const pid = projectId || CURRENT_PROJECT_ID || 'baicaoyuan';
  const MD = (typeof window !== 'undefined' && window.MockData) || {};
  const PLANS_SRC = MD.PLANS || PLANS;
  const AREAS_SRC = MD.AREAS || AREAS;
  const plans = PLANS_SRC[pid] || [];
  const projectAreas = AREAS_SRC[pid] || [];
  const areaMap = {};
  projectAreas.forEach(a => { areaMap[a.id] = a.name; });
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
  const relevantPlans = plans.filter(p => {
    if (p.status === 'cancelled') return false;
    if (p.type && p.type !== 'progress') return false;
    const s = p.startDate || p.date;
    const e = p.endDate || p.date;
    if (!s) return false;
    return s <= wr.weekEnd && e >= wr.weekStart;
  });
  if (relevantPlans.length === 0) return [];
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
  const areaGroups = {};
  rows.forEach(r => {
    if (!areaGroups[r.area]) areaGroups[r.area] = [];
    areaGroups[r.area].push(r);
  });
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
      const workDays = schedule.filter(Boolean).length;
      const plan = plans.find(p => p.id === r.planId);
      const ls = plan && (plan.laborSchedule || plan.laborRequirements || []);
      const labor = ls.length > 0 ? ls.map(l => (l.trade || l.laborType || '').trim() + (l.count ? l.count + '人' : '')).filter(Boolean).join('、') : '';
      const mat = plan && plan.materials;
      const material = mat && mat.length > 0 ? mat.join('；') : '待定';
      result.push({ seq, area, task: r.task, durationDays: workDays || r.durationDays, schedule, labor: labor || '', material });
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
  if (PAGE10_IMAGE_MAP[label]) return PAGE10_IMAGE_MAP[label];
  for (const f of floors) {
    const key = label + f;
    if (PAGE10_IMAGE_MAP[key]) return PAGE10_IMAGE_MAP[key];
  }
  for (const [k, v] of Object.entries(PAGE10_IMAGE_MAP)) {
    if (label.includes(k) || k.includes(label)) return v;
  }
  return '';
}

function getPageSectionsData(projectId) {
  const pid = projectId || CURRENT_PROJECT_ID || 'baicaoyuan';
  const MD = (typeof window !== 'undefined' && window.MockData) || {};
  const PLANS_SRC = MD.PLANS || PLANS;
  const AREAS_SRC = MD.AREAS || AREAS;
  const plans = PLANS_SRC[pid] || [];
  const projectAreas = AREAS_SRC[pid] || [];
  const areaMap = {};
  projectAreas.forEach(a => { areaMap[a.id] = a.name; });
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
      const images = [];
      sec.plans.forEach(p => (p.zoneImages || []).forEach(img => {
        if (!images.some(x => x.dataUrl === img.dataUrl)) images.push(img);
      }));
      if (images.length === 0) {
        const matched = _matchPage10Image(sec.name, []);
        if (matched) images.push({ name: matched, dataUrl: matched });
      }
      const imageItems = images.map(img => ({ label: img.name || sec.name, image: img.dataUrl }));
      const activePlans = sec.plans.filter(p => p.taskName && p.type === 'progress');
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
            floorData[floor] = { floor, startDate: _formatDateYMD(s), endDate: _formatDateYMD(e), days: s && e ? Math.ceil((new Date(e) - new Date(s)) / 86400000) + 1 : '' };
          }
        });
        return { building: g.building, location: g.location, process: g.process, floors: floorHeaders.map(fh => floorData[fh.name] || { floor: fh.name, startDate: '', endDate: '', days: '' }) };
      });
      return { name: sec.name, items: imageItems, rows, floorHeaders };
    });
}

function getPage10Data(projectId) {
  return getPageSectionsData(projectId).map(sec => ({ section: sec.name, items: sec.items }));
}

function getPage11Data(projectId) {
  return getPageSectionsData(projectId).map(sec => ({ section: sec.name, items: sec.rows }));
}

// --- 页面 12：协调事宜 ---
function getPage12Data(projectId, onlyOpen = true) {
  const MD = (typeof window !== 'undefined' && window.MockData) || {};
  const issues = MD.ISSUES || ISSUES;
  let items = issues.filter(i => i.projectId === projectId && i.type === 'coordination');
  if (onlyOpen) {
    items = items.filter(i => i.status !== 'closed');
  }
  return items.map((i, idx) => ({ seq: idx + 1, issue: i.title, proposeDept: i.proposeDept || '—', cooperateDept: i.cooperateDept || '—' }));
}

// ============================================================
// 8. 暴露到全局
// ============================================================
window.MockData = {
  PROJECTS, AREAS, WORKERS, MANAGEMENT_TEAM, MILESTONES, MILESTONE_PLANS, PLANS,
  EVENTS, HISTORY_EVENTS, ISSUES, ECC_ITEMS, DRAWING_DEEPENINGS, WEEKLY_GANTT_ITEMS,
  CONSTRUCTION_ZONE_SCHEDULES, TODAY,
  TYPE_META, ISSUE_TYPE_META, PRIORITY_META, ISSUE_STATUS_META, MILESTONE_STATUS_META, SOURCE_META,
  getDailyEvents, getMonthlyStats, getPlansForProject,
  getPage01Data, getPage03Data, getPage0301Data, getPage04Data, getPage05Photos,
  getPage06Data, getPage07Data, getPage08Data, getPage09Data, getPage10Data, getPage11Data, getPageSectionsData, getPage12Data,
  DAILY_ATTENDANCE, getAttendanceForDate, setAttendanceForDate, getWeekAttendanceStats,
  getMilestoneData, saveMilestoneData, resetMilestoneCache, setCurrentProjectId,
  saveEventsToStorage, savePlansToStorage,
  CURRENT_PROJECT_ID
};
