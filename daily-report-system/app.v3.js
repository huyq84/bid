// ============================================================
// 主应用逻辑
// ============================================================

let M = window.MockData;

// 记录已知在 DB 中不存在的事件 ID（幽灵事件），持久化到 localStorage 避免跨页面加载复活
const _ghostEventIds = new Set();
try {
  const saved = JSON.parse(localStorage.getItem('daily_ghost_ids') || '[]');
  saved.forEach(id => _ghostEventIds.add(id));
} catch {}
function _persistGhostIds() {
  try { localStorage.setItem('daily_ghost_ids', JSON.stringify([..._ghostEventIds])); } catch {}
}

// 从后端 API 加载真实数据，失败时静默回退到 MockData
async function loadDataFromAPI() {
  try {
    const res = await fetch('http://localhost:3010/api/data/all');
    if (!res.ok) return;
    const data = await res.json();
    if (!data || !data.PROJECTS) return;

    // 快照本地照片（后端可能因 ON CONFLICT 不更新 photos 字段，导致刷新后丢失）
    const localPhotosByEventId = new Map();
    const collectPhotos = (events) => {
      if (!events) return;
      for (const ev of events) {
        if (ev.photos && ev.photos.length > 0 && ev.photos.some(p => p.data)) {
          localPhotosByEventId.set(ev.id, ev.photos);
        }
      }
    };
    collectPhotos(M.EVENTS);
    collectPhotos(M.HISTORY_EVENTS);

    // 覆盖 MockData 的各属性
    M.PROJECTS = data.PROJECTS;
    M.AREAS = data.AREAS;
    M.WORKERS = data.WORKERS;
    M.MANAGEMENT_TEAM = data.MANAGEMENT_TEAM;
    // 就地替换而非赋值, 保持 mock-data.js 内 module-level EVENTS 引用同步
    // 保留本地未确认（draft）的事件：后端不会返回本地刚填的（因为没等异步同步完成）
    const localEventIds = new Set(M.EVENTS.map(e => e.id));
    const apiEventIds = new Set(data.EVENTS.map(e => e.id));
    // 本地有但后端没有的（通常是本地刚 saveUnifiedEvent 后，异步 fetch 还没完成前刷新）
    const localOnlyEvents = M.EVENTS.filter(e => !apiEventIds.has(e.id) && !_ghostEventIds.has(e.id));
    M.EVENTS.length = 0;
    M.EVENTS.push(...data.EVENTS, ...localOnlyEvents);
    M.HISTORY_EVENTS.length = 0; M.HISTORY_EVENTS.push(...data.HISTORY_EVENTS);
    M.ISSUES = data.ISSUES;

    // 合并：API 事件无照片但本地有 → 恢复本地照片
    const mergePhotos = (events) => {
      if (!events) return;
      for (const ev of events) {
        if ((!ev.photos || ev.photos.length === 0) && localPhotosByEventId.has(ev.id)) {
          ev.photos = localPhotosByEventId.get(ev.id);
        }
      }
    };
    mergePhotos(M.EVENTS);
    mergePhotos(M.HISTORY_EVENTS);
    // 持久化合并后的数据到 localStorage
    if (M.saveEventsToStorage) {
      try { M.saveEventsToStorage(); } catch {}
    }
    
    // 确保所有数据都同步到 localStorage
    try { 
      localStorage.setItem('daily_events', JSON.stringify(M.EVENTS)); 
    } catch(e) { console.warn('[localStorage] 写事件失败:', e.message); }
    try { 
      localStorage.setItem('daily_plans', JSON.stringify(M.PLANS)); 
    } catch(e) { console.warn('[localStorage] 写计划失败:', e.message); }
    try { 
      localStorage.setItem('daily_issues', JSON.stringify(M.ISSUES || [])); 
    } catch(e) { console.warn('[localStorage] 写协调失败:', e.message); }

    // 深度合并 PLANS（API + 本地，按 id 去重，API 版本优先）
    if (data.PLANS && Object.keys(data.PLANS).length > 0) {
      for (const pid of Object.keys(data.PLANS)) {
        if (!M.PLANS[pid]) M.PLANS[pid] = [];
        const existingIds = new Set(M.PLANS[pid].map(p => p.id));
        // 先把 API 计划按 id 索引，本地已有同 id 的用 API 版本覆盖（以远端为准）
        for (const apiPlan of data.PLANS[pid]) {
          const idx = M.PLANS[pid].findIndex(p => p.id === apiPlan.id);
          if (idx > -1) M.PLANS[pid][idx] = apiPlan;
          else M.PLANS[pid].push(apiPlan);
          existingIds.add(apiPlan.id);
        }
        // 保留本地独有的计划（API 没返回的，但本地有）
        //（M.PLANS[pid] 中未被覆盖的本地项保持不变）
      }
    }
    // 同步 PLANS 到 localStorage（让 getPlansForProject 等 mock-data.js 函数能读到最新数据）—— 仅首次加载
    if (M._initialLoadDone !== true) {
      try { localStorage.setItem('daily_plans', JSON.stringify(M.PLANS)); } catch(e) { console.warn('[localStorage] 写计划失败:', e.message); }
    }

    // ECC / 图纸深化 / 甘特 / 施工段
    M.ECC_ITEMS = data.ECC_ITEMS || [];
    M.DRAWING_DEEPENINGS = data.DRAWING_DEEPENINGS || [];
    M.WEEKLY_GANTT_ITEMS = data.WEEKLY_GANTT_ITEMS || [];
    M.CONSTRUCTION_ZONE_SCHEDULES = data.CONSTRUCTION_ZONE_SCHEDULES || [];

    // 里程碑
    M.MILESTONES = data.MILESTONES || {};
    M.MILESTONE_PLANS = data.MILESTONE_PLANS || {};

    // 签到
    M.DAILY_ATTENDANCE = data.DAILY_ATTENDANCE || {};

    // 标准工种模板（周报 06 表头，DB 管理）
    M.STANDARD_TRADES = data.STANDARD_TRADES || [];

    // 固定模板模式下录入的本周/下周人数（按 project/week/trade 存）
    M.WEEKLY_LABOR_DATA = data.WEEKLY_LABOR_DATA || [];

    // ECC 手动汇总（按项目一条）
    M.ECC_SUMMARIES = data.ECC_SUMMARIES || {};

    // 标记首次加载完成，切换项目时不再写 localStorage
    M._initialLoadDone = true;

    // 重写保存方法：先同步写 localStorage（防刷新丢）→ 再异步同步到后端
    M.saveEventsToStorage = async function() {
      // 1. 立即写 localStorage（同步操作，瞬间完成）
      try { localStorage.setItem('daily_events', JSON.stringify(M.EVENTS)); } catch(e) { console.warn('[localStorage] 写事件失败:', e.message); }
      // 2. 异步同步到后端 API
      for (const ev of M.EVENTS) {
        try {
          await fetch('http://localhost:3010/api/events', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(ev)
          });
        } catch {}
      }
    };

    M.savePlansToStorage = async function() {
      // 1. 立即写 localStorage
      try { localStorage.setItem('daily_plans', JSON.stringify(M.PLANS)); } catch(e) { console.warn('[localStorage] 写计划失败:', e.message); }
      // 2. 异步同步到后端
      const STD_FIELDS = new Set(['id','projectId','date','startDate','endDate','description','taskName','progress','status','laborSchedule','laborRequirements','areaTargets','createdAt','updatedAt']);
      for (const projectId of Object.keys(M.PLANS)) {
        for (const p of M.PLANS[projectId]) {
          const extra = {};
          for (const k of Object.keys(p)) { if (!STD_FIELDS.has(k)) extra[k] = p[k]; }
          try {
            await fetch('http://localhost:3010/api/plans', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                id: p.id,
                projectId: p.projectId || projectId,
                date: p.date || p.startDate || null,
                startDate: p.startDate,
                endDate: p.endDate,
                description: p.description || p.taskName || '',
                taskName: p.taskName,
                progress: p.progress || '0%',
                status: p.status || 'active',
                laborSchedule: p.laborRequirements || p.laborSchedule || [],
                areaTargets: p.areaTargets || [],
                totalManDays: p.totalManDays || 0,
                extra,
                createdAt: p.createdAt,
                updatedAt: new Date().toISOString()
              })
            });
          } catch {}
        }
      }
    };

    // 协调事宜：先同步写 localStorage → 异步同步到后端 dr_issues 表
    M.saveIssuesToStorage = async function() {
      try { localStorage.setItem('daily_issues', JSON.stringify(M.ISSUES)); } catch(e) { console.warn('[localStorage] 写协调失败:', e.message); }
      for (const iss of M.ISSUES) {
        try {
          await fetch('http://localhost:3010/api/issues', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: iss.id,
              projectId: iss.projectId,
              type: iss.type,
              title: iss.title,
              areaId: iss.areaId || null,
              priority: iss.priority || 'medium',
              status: iss.status || 'open',
              createdDate: iss.createdDate || null,
              deadline: iss.deadline || null,
              owner: iss.owner || null,
              description: iss.description || null,
              resolution: iss.resolution || '',
              photos: iss.photos || [],
              closedDate: iss.closedDate || null,
              proposeDept: iss.proposeDept || null,
              cooperateDept: iss.cooperateDept || null
            })
          });
        } catch {}
      }
    };

    console.log('[数据] 已从 PostgreSQL 加载', data.PROJECTS.map(p => p.name).join(', '));
  } catch (e) {
    console.log('[数据] 后端 API 不可达，使用 MockData');
  }
}
function fixProgress(v) { if (!v) return v; v = String(v); return v.includes('%') ? v : v + '%'; }
let currentProjectId = localStorage.getItem('current_project_id') || 'baicaoyuan';
let currentFilter = 'all';
let selectedEventId = null;
let currentCalendarDate = new Date();
let selectedDates = [];
let multiSelectMode = false;
let laborRowCount = 1;
let areaRowCount = 1;
let editingPlanId = null;

// ============================================================
// 自定义对话框
// ============================================================
let confirmResolve = null;
let promptResolve = null;

// 显示确认对话框
function showConfirm(message, title = '确认操作', icon = '⚠️') {
  return new Promise((resolve) => {
    confirmResolve = resolve;
    document.getElementById('confirmIcon').textContent = icon;
    document.getElementById('confirmTitle').textContent = title;
    document.getElementById('confirmMessage').textContent = message;
    document.getElementById('confirmDialog').style.display = 'flex';
  });
}

// 隐藏确认对话框
function hideConfirm(result) {
  document.getElementById('confirmDialog').style.display = 'none';
  if (confirmResolve) {
    confirmResolve(result);
    confirmResolve = null;
  }
}

// 显示输入对话框
function showPrompt(title, defaultValue = '') {
  return new Promise((resolve) => {
    promptResolve = resolve;
    document.getElementById('promptTitle').textContent = title;
    document.getElementById('promptInput').value = defaultValue;
    document.getElementById('promptDialog').style.display = 'flex';
    document.getElementById('promptInput').focus();
  });
}

// 隐藏输入对话框
function hidePrompt(result) {
  document.getElementById('promptDialog').style.display = 'none';
  if (promptResolve) {
    promptResolve(result);
    promptResolve = null;
  }
}

// 初始化对话框事件
document.addEventListener('DOMContentLoaded', () => {
  // 确认对话框按钮
  document.getElementById('confirmOk').onclick = () => hideConfirm(true);
  document.getElementById('confirmCancel').onclick = () => hideConfirm(false);
  document.getElementById('confirmDialog').onclick = (e) => {
    if (e.target.id === 'confirmDialog') hideConfirm(false);
  };
  
  // 输入对话框按钮
  document.getElementById('promptOk').onclick = () => {
    const value = document.getElementById('promptInput').value;
    hidePrompt(value);
  };
  document.getElementById('promptCancel').onclick = () => hidePrompt(null);
  document.getElementById('promptDialog').onclick = (e) => {
    if (e.target.id === 'promptDialog') hidePrompt(null);
  };
  document.getElementById('promptInput').onkeydown = (e) => {
    if (e.key === 'Enter') {
      const value = document.getElementById('promptInput').value;
      hidePrompt(value);
    } else if (e.key === 'Escape') {
      hidePrompt(null);
    }
  };
});

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', async () => {
  try {
    await loadDataFromAPI();
    
    // 合并 localStorage 本地独有事件
    try {
      const stored = localStorage.getItem('daily_events');
      if (stored && stored.length < 500000) { // 避免解析超大 localStorage
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const backendIds = new Set(M.EVENTS.map(e => e.id));
          const localOnly = parsed.filter(e => !backendIds.has(e.id));
          if (localOnly.length > 0) {
            M.EVENTS.push(...localOnly);
          }
        }
      }
    } catch(e) { /* ignore */ }
    
    initCustomAreas();
    initProject();
    initCalendarWithToday();
    renderProjectInfo();
    renderIssues();
    renderStats();
    populateAreaSelects();
    renderDailyPlanCard();
  } catch(e) {
    console.error('[Init] 初始化失败:', e);
    document.getElementById('backendLabel').textContent = '加载失败';
    document.getElementById('backendDot').style.background = '#ef4444';
  }
});

function initCalendarWithToday() {
  const today = new Date();
  currentCalendarDate = new Date(today.getFullYear(), today.getMonth(), 1);
  const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  selectedDates = [todayStr];
  updateCalendar();
  updateHeaderDate();
  renderFilteredEvents();
}

// ============================================================
// 项目切换
// ============================================================
function initProject() {
  const project = M.PROJECTS.find(p => p.id === currentProjectId);
  document.getElementById('projectName').textContent = project?.name || '未选择项目';
  updateHeaderDate();
}

function updateHeaderDate() {
  let dateText = '';
  let weekText = '';
  
  if (selectedDates.length === 0) {
    dateText = '全部日报';
    weekText = '已选择 0 天';
  } else if (selectedDates.length === 1) {
    const date = new Date(selectedDates[0]);
    dateText = `${formatDate(selectedDates[0])} 日报`;
    weekText = getWeekInfo(date);
  } else {
    const sortedDates = [...selectedDates].sort();
    const firstDate = new Date(sortedDates[0]);
    const lastDate = new Date(sortedDates[sortedDates.length - 1]);
    dateText = `${formatDate(sortedDates[0])} ~ ${formatDate(sortedDates[sortedDates.length - 1])}`;
    weekText = `已选择 ${selectedDates.length} 天`;
  }
  
  const dateLabel = document.getElementById('todayDateLabel');
  const weekInfo = document.getElementById('weekInfo');
  if (dateLabel) dateLabel.textContent = dateText;
  if (weekInfo) weekInfo.textContent = weekText;
}

function openProjectSwitcher() {
  const el = document.getElementById('projectDropdown');
  if (el.style.display !== 'none') { el.style.display = 'none'; return; }
  const pill = document.getElementById('projectPill');
  const rect = pill.getBoundingClientRect();
  el.innerHTML = M.PROJECTS.map(p => {
    const active = p.id === currentProjectId;
    return '<div style="padding:14px 16px;border-bottom:1px solid #e2e8f0;cursor:pointer;transition:background 0.12s;' +
      (active ? 'background:#eff8ff;border-left:3px solid #00adef;' : '') + '" ' +
      'onclick="switchProject(\'' + p.id + '\')" ' +
      'onmouseenter="this.style.background=\'#f8fafc\'" onmouseleave="this.style.background=\'' + (active ? '#eff8ff' : '') + '\'">' +
      '<div style="font-weight:600;color:#0f172a;">' + p.name + '</div>' +
      '<div style="font-size:12px;color:#64748b;margin-top:2px;">' + p.client + ' · ' + p.location + '</div>' +
      '</div>';
  }).join('');
  el.style.display = 'block';
  el.style.top = (rect.bottom + 6) + 'px';
  el.style.left = Math.max(8, rect.right - 340) + 'px';
}

document.addEventListener('click', function(e) {
  const dd = document.getElementById('projectDropdown');
  if (dd.style.display === 'none') return;
  const pill = document.getElementById('projectPill');
  if (pill.contains(e.target) || dd.contains(e.target)) return;
  dd.style.display = 'none';
});

function getChatHistory() {
  if (_activeSessionId && _messageCache[_activeSessionId]) return _messageCache[_activeSessionId];
  return [];
}

function switchProject(projectId) {
  const prevPid = currentProjectId;
  currentProjectId = projectId;
  localStorage.setItem('current_project_id', projectId);
  // 同步 mock-data.js 的 CURRENT_PROJECT_ID（确保签到/节点等按项目隔离）
  try { M.setCurrentProjectId && M.setCurrentProjectId(projectId); } catch {}
  // 重置 milestone 缓存，使下次打开时从 M.MILESTONE_PLANS[新项目] 重新读取
  try { M.resetMilestoneCache && M.resetMilestoneCache(); } catch {}
  document.getElementById('projectDropdown').style.display = 'none';
  // 切换后从 API 拉取新项目的数据
  loadDataFromAPI().then(() => {
    initProject();
    renderProjectInfo();
    renderIssues();
    renderStats();
    populateAreaSelects();
    updateCalendar();
    renderFilteredEvents();
    renderDailyPlanCard();
    loadPage03Photo();
  });
  // 更新聊天标题栏的项目名称
  updateChatProjectLabel();
  // 在聊天消息中追加切换提示（如果已打开过该项目的对话则不重复追加）
  const projName = getCurrentProjectName();
  setTimeout(() => {
    const h = getChatHistory();
    if (h.length === 0) {
      appendChatMessage('ai-message-system', '🔄 已切换到 **' + projName + '**，有什么要记录的？');
    }
    // 更新徽章为当前项目未读数
    updateChatBadge();
  }, 100);
}

// ============================================================
// 事件渲染
// ============================================================
function renderTodayEvents() {
  const events = M.EVENTS.filter(e => e.projectId === currentProjectId);
  const filtered = currentFilter === 'all' 
    ? events 
    : events.filter(e => e.type === currentFilter);
  
  const sorted = [...filtered].sort((a, b) => a.time.localeCompare(b.time));
  
  document.getElementById('eventTimeline').innerHTML = `
    <div class="timeline-line"></div>
    ${sorted.map(event => {
    const completionBadge = event.completionType === 'unplanned' 
      ? '<span class="event-completion-badge unplanned">📌 计划外</span>' 
      : (event.completionType === 'planned' && event.planId 
        ? `<span class="event-completion-badge planned">✅ 计划内</span>` 
        : '');
    
    return `
      <div class="event-row">
        <div class="event-dot ${event.status === 'draft' ? 'draft' : ''}"></div>
        <div class="event-item" onclick="openEventDetail('${event.id}')">
          <div class="event-head">
            <span class="event-time">${event.time}</span>
            <span class="event-type-badge" style="background:${M.TYPE_META[event.type].color};">
              ${M.TYPE_META[event.type].icon} ${M.TYPE_META[event.type].label}
            </span>
            ${completionBadge}
            <span class="event-area">${getAreaName(event.areaId)}</span>
            <span class="event-source">${M.SOURCE_META[event.source]?.icon || '⚙️'}</span>
            <span class="event-status-badge ${event.status}">${event.status === 'draft' ? '草稿' : '已确认'}</span>
          </div>
          <div class="event-body">${renderEventContent(event)}</div>
          ${event.voiceText ? `<div class="event-voice">${event.voiceText}</div>` : ''}
          ${event.photos && event.photos.length > 0 ? renderPhotos(event.photos) : ''}
          <div class="event-actions">
            <button class="btn btn-sm btn-ghost" onclick="event.stopPropagation(); confirmEvent('${event.id}')">
              ${event.status === 'draft' ? '✅ 确认' : '🔄 撤回'}
            </button>
            <button class="btn btn-sm btn-ghost" onclick="event.stopPropagation(); openEventDetail('${event.id}')">
              查看详情
            </button>
            ${event.status !== 'confirmed' ? `<button class="btn btn-sm btn-danger" onclick="event.stopPropagation(); deleteEvent('${event.id}')">
              删除
            </button>` : ''}
            ${event.status !== 'confirmed' ? `<button class="btn btn-sm btn-ghost" onclick="event.stopPropagation(); editEventDirect('${event.id}')">
              ✏️ 编辑
            </button>` : ''}
          </div>
        </div>
      </div>
    `;
  }).join('')}
  `;
}

function renderFilteredEvents() {
  const allEvents = [...M.EVENTS, ...M.HISTORY_EVENTS];
  
  let filtered = allEvents.filter(e => e.projectId === currentProjectId);
  
  if (selectedDates.length > 0) {
    filtered = filtered.filter(e => selectedDates.includes(e.date));
  }
  
  if (currentFilter !== 'all') {
    filtered = filtered.filter(e => e.type === currentFilter);
  }
  
  const sorted = [...filtered].sort((a, b) => {
    const dateCompare = b.date.localeCompare(a.date);
    if (dateCompare !== 0) return dateCompare;
    return a.time.localeCompare(b.time);
  });
  
  if (sorted.length === 0) {
    document.getElementById('eventTimeline').innerHTML = `
      <div style="text-align:center; padding:30px; color:#94a3b8;">
        <div style="font-size:24px; margin-bottom:8px;">📭</div>
        <div>暂无日报数据</div>
        <div style="font-size:12px; margin-top:4px;">${selectedDates.length > 0 ? '当前选中 ' + selectedDates.length + ' 个日期' : '请在日历中选择日期'}</div>
      </div>
    `;
    return;
  }
  
  // 按 planId 分组（同计划多次填报合并）
  const planGroups = {}; const standalone = [];
  sorted.forEach(e => {
    if (e.planId) { if (!planGroups[e.planId]) planGroups[e.planId] = []; planGroups[e.planId].push(e); }
    else standalone.push(e);
  });
  // 合并后的渲染顺序：取每组最早事件的时间排序
  const merged = [];
  Object.values(planGroups).forEach(group => {
    group.sort((a, b) => a.time.localeCompare(b.time));
    const first = group[0]; const last = group[group.length - 1];
    const planName = group[0].payload.taskName || '进度更新';
    merged.push({
      _isGroup: true, _events: group,
      id: first.id, date: first.date, time: first.time,
      type: first.type, areaId: first.areaId, status: 'confirmed',
      displayTime: group.length > 1 ? `${first.time}~${last.time}` : first.time,
      displayCount: group.length,
      planId: first.planId
    });
  });
  const allItems = [...merged, ...standalone].sort((a, b) => {
    const dc = b.date.localeCompare(a.date); if (dc !== 0) return dc;
    return a.time.localeCompare(b.time);
  });

  document.getElementById('eventTimeline').innerHTML = `
    <div class="timeline-line"></div>
    ${allItems.map(item => {
      if (item._isGroup) {
        const group = item._events;
        const plan = (M.PLANS[currentProjectId] || []).find(p => p.id === item.planId);
        return `
      <div class="event-row">
        <div class="event-dot"></div>
        <div class="event-item event-plan-group" style="border-left:3px solid #00adef;">
          <div class="event-head">
            <span class="event-date" style="font-size:10px; color:#64748b; margin-right:6px;">${item.date}</span>
            <span class="event-time">${item.displayTime}</span>
            <span class="event-type-badge" style="background:${M.TYPE_META[item.type].color};">
              ${M.TYPE_META[item.type].icon} ${M.TYPE_META[item.type].label}
            </span>
            <span class="event-area">${getAreaName(item.areaId)}</span>
            <span style="font-size:10px; color:#00adef;">🔄 ${item.displayCount}次填报</span>
          </div>
          <div class="event-body">
            ${group.map((e, i) => {
              return `
              <div style="display:flex; align-items:center; gap:6px; padding:4px 0;${i > 0 ? ' border-top:1px dashed #e2e8f0;' : ''};flex-wrap:wrap;">
                <span style="font-size:10px; color:#94a3b8; min-width:40px;">${e.time}</span>
                <div style="flex:1; min-width:80px;">
                  <span style="font-size:12px; font-weight:500;">${group.length > 1 ? '→ ' : ''}${e.payload.progress || '-'}</span>
                  ${e.payload.owner ? `<span style="font-size:10px; color:#64748b; margin-left:4px;">${e.payload.owner}</span>` : ''}
                </div>
                <span style="font-size:9px; padding:1px 4px; border-radius:3px; background:${e.status === 'draft' ? '#fef3c7' : '#d1fae5'}; color:${e.status === 'draft' ? '#92400e' : '#065f46'};">${e.status === 'draft' ? '草稿' : '已确认'}</span>
                <button class="btn btn-sm btn-ghost" onclick="event.stopPropagation(); confirmEvent('${e.id}')" style="font-size:9px; padding:1px 6px;">${e.status === 'draft' ? '✅ 确认' : '🔄 撤回'}</button>
                ${e.status !== 'confirmed' ? `<button class="btn btn-sm btn-ghost" onclick="event.stopPropagation(); editEventDirect('${e.id}')" style="font-size:9px; padding:1px 6px;">✏️ 编辑</button>` : ''}
                <button class="btn btn-sm btn-ghost" onclick="event.stopPropagation(); openEventDetail('${e.id}')" style="font-size:9px; padding:1px 6px;">查看详情</button>
                ${e.status !== 'confirmed' ? `<button class="btn btn-sm btn-danger" onclick="event.stopPropagation(); deleteEvent('${e.id}')" style="font-size:9px; padding:1px 6px;">删除</button>` : ''}
              </div>`;
            }).join('')}
          </div>
          <div class="event-actions">
            <button class="btn btn-sm btn-primary" onclick="event.stopPropagation(); openManualInput('${item.planId}')" style="font-size:10px; padding:2px 8px;">+ 继续填报</button>
            ${group.some(e => e.status === 'draft') ? `<button class="btn btn-sm btn-ghost" onclick="event.stopPropagation(); confirmAllPlanEvents('${item.planId}')" style="font-size:10px; padding:2px 8px;">✅ 全部确认</button>` : ''}
          </div>
        </div>
      </div>`;
      }
      return `
      <div class="event-row">
        <div class="event-dot ${item.status === 'draft' ? 'draft' : ''}"></div>
        <div class="event-item" onclick="openEventDetail('${item.id}')">
          <div class="event-head">
            <span class="event-date" style="font-size:10px; color:#64748b; margin-right:6px;">${item.date}</span>
            <span class="event-time">${item.time}</span>
            <span class="event-type-badge" style="background:${M.TYPE_META[item.type].color};">
              ${M.TYPE_META[item.type].icon} ${M.TYPE_META[item.type].label}
            </span>
            <span class="event-area">${getAreaName(item.areaId)}</span>
            <span class="event-source">${M.SOURCE_META[item.source]?.icon || '⚙️'}</span>
            <span class="event-status-badge ${item.status}">${item.status === 'draft' ? '草稿' : '已确认'}</span>
          </div>
          <div class="event-body">${renderEventContent(item)}</div>
          ${item.voiceText ? `<div class="event-voice">${item.voiceText}</div>` : ''}
          ${item.photos && item.photos.length > 0 ? renderPhotos(item.photos) : ''}
          <div class="event-actions">
            <button class="btn btn-sm btn-ghost" onclick="event.stopPropagation(); confirmEvent('${item.id}')">
              ${item.status === 'draft' ? '✅ 确认' : '🔄 撤回'}
            </button>
            ${item.status !== 'confirmed' ? `<button class="btn btn-sm btn-ghost" onclick="event.stopPropagation(); editEventDirect('${item.id}')">
              ✏️ 编辑
            </button>` : ''}
            <button class="btn btn-sm btn-ghost" onclick="event.stopPropagation(); openEventDetail('${item.id}')">
              查看详情
            </button>
            ${item.status !== 'confirmed' ? `<button class="btn btn-sm btn-danger" onclick="event.stopPropagation(); deleteEvent('${item.id}')">
              删除
            </button>` : ''}
          </div>
        </div>
      </div>`;
    }).join('')}
  `;
}

function renderEventContent(event) {
  const payload = event.payload || {};
  switch(event.type) {
    case 'progress':
      return `<strong>${payload.taskName || '进度更新'}</strong>：${payload.progress || '-'}，${payload.owner ? `负责人 ${payload.owner}` : ''}`;
    case 'material':
      return `<strong>${payload.materialName || '材料'}</strong> ${payload.action || '处理'}：${payload.quantity || 0} ${payload.unit || '件'}，规格：${payload.spec || '-'}`;
    case 'safety':
      const issues = payload.issues?.length > 0 ? `<br>⚠️ ${payload.issues.join('；')}` : '';
      return `<strong>${payload.checkType || '安全检查'}</strong>：${payload.result || '检查完成'}${issues}`;
    case 'coordination':
      return `<strong>${payload.topic || '协调事项'}</strong>：${payload.summary || payload.status || '-'}`;
    case 'attendance':
      return `<strong>考勤打卡</strong>：${payload.headcount || 0} 人到岗${payload.laborStats ? `<br>${formatLaborStats(payload.laborStats)}` : ''}`;
    case 'drawing':
      const drawStatus = payload.status || '进行中';
      const drawStatusColor = drawStatus === '已完成' ? '#059669' : '#6366f1';
      return `<strong>${payload.taskName || '图纸深化'}</strong>：${payload.owner ? `责任人 ${payload.owner}` : ''} <span style="display:inline-block;padding:1px 6px;background:${drawStatusColor};color:#fff;border-radius:3px;font-size:10px;margin-left:4px;">${drawStatus}</span>`;
    default:
      return JSON.stringify(payload);
  }
}

function renderPhotos(photos) {
  return `
    <div class="event-photo">
      ${photos.map((p, i) => {
        if (p.data) {
          return `<div class="photo-thumb" style="cursor:zoom-in;padding:0;" onclick="event.stopPropagation();openPhotoLightbox('${p.id}')">
            <img src="${p.data}" style="width:100%;height:100%;object-fit:cover;display:block;" />
            <div class="cap">${p.caption || '图片'}</div>
          </div>`;
        }
        return `<div class="photo-thumb">📷<div class="cap">${p.caption || '图片'}</div></div>`;
      }).join('')}
    </div>
  `;
}

window.openPhotoLightbox = function(photoId) {
  // 从所有事件中找
  const allEvents = [...M.EVENTS, ...M.HISTORY_EVENTS];
  let photo = null;
  for (const e of allEvents) {
    const found = (e.photos || []).find(p => p.id === photoId);
    if (found) { photo = found; break; }
  }
  if (!photo || !photo.data) { showToast('图片数据不存在', 'warning'); return; }
  window._showLightbox(photo.data, photo.caption || '现场照片');
};

// 查找已存在事件中是否有相同 base64 的照片（用于查重）
function findDuplicatePhoto(base64Data) {
  if (!base64Data) return null;
  const allEvents = [...M.EVENTS, ...M.HISTORY_EVENTS];
  for (const ev of allEvents) {
    for (const p of (ev.photos || [])) {
      if (p.data && p.data === base64Data) {
        return {
          eventId: ev.id,
          date: ev.date,
          time: ev.time,
          type: ev.type,
          status: ev.status,
          taskName: ev.payload?.taskName || ev.payload?.process || '-',
          owner: ev.payload?.owner || '-',
          photoCaption: p.caption || ''
        };
      }
    }
  }
  return null;
}

// ============================================================
// 多张照片上传向导（每张 = 一条独立事件）
// ============================================================
let _photoWizard = null; // { queue: [{data, file}], index, savedCount }

window.openPhotoLightboxSrc = function(src, caption) {
  if (!src) return;
  window._showLightbox(src, caption || '现场照片');
};

window._showLightbox = function(src, caption) {
  document.getElementById('photoLightboxImg').src = src;
  document.getElementById('photoLightboxCaption').textContent = caption;
  showModal('photoLightbox');
};

window.closePhotoLightbox = function() {
  closeModal('photoLightbox');
  document.getElementById('photoLightboxImg').src = '';
};

function formatLaborStats(stats) {
  return Object.entries(stats).map(([type, count]) => `${type}: ${count}人`).join('，');
}

function getAreaName(areaId) {
  const areas = M.AREAS[currentProjectId] || [];
  return areas.find(a => a.id === areaId)?.name || areaId;
}

function confirmAllPlanEvents(planId) {
  M.EVENTS.forEach(e => { if (e.planId === planId && e.status === 'draft') e.status = 'confirmed'; });
  if (M.saveEventsToStorage) M.saveEventsToStorage();
  renderFilteredEvents();
  renderStats();
  showToast('已全部确认', 'success');
}

// ============================================================
// 统计渲染
// ============================================================
function renderStats() {
  // 统计当前选中日期范围内的事件（尊重日历选择）
  const dates = selectedDates.length > 0 ? selectedDates : null;
  const events = M.EVENTS.filter(e => {
    if (e.projectId !== currentProjectId) return false;
    if (dates && !dates.includes(e.date)) return false;
    return true;
  });
  const el = (id) => document.getElementById(id);
  if (el('statProgress')) el('statProgress').textContent = events.filter(e => e.type === 'progress').length;
  if (el('statMaterial')) el('statMaterial').textContent = events.filter(e => e.type === 'material').length;
  if (el('statSafety')) el('statSafety').textContent = events.filter(e => e.type === 'safety').length;
  if (el('statCoordination')) el('statCoordination').textContent = events.filter(e => e.type === 'coordination').length;
}

// ============================================================
// 项目信息
// ============================================================
function renderProjectInfo() {
  const project = M.PROJECTS.find(p => p.id === currentProjectId);
  const areas = M.AREAS[currentProjectId] || [];
  const milestones = M.MILESTONES[currentProjectId] || [];
  const completedMilestones = milestones.filter(m => m.status === 'completed').length;
  const body = document.getElementById('projectInfoBody');
  if (!body) return;  // 卡片已移除

  body.innerHTML = `
    <div style="display:grid; gap:6px;">
      <div style="display:flex; justify-content:space-between;">
        <span style="font-size:10px; color:#64748b;">区域</span>
        <span style="font-size:11px; font-weight:500;">${areas.length} 个</span>
      </div>
      <div style="display:flex; justify-content:space-between;">
        <span style="font-size:10px; color:#64748b;">里程碑</span>
        <span style="font-size:11px; font-weight:500;">${completedMilestones}/${milestones.length}</span>
      </div>
      <div style="height:4px; background:#e2e8f0; border-radius:2px; overflow:hidden;">
        <div style="height:100%; background:#00adef; width:${milestones.length > 0 ? (completedMilestones/milestones.length*100) : 0}%;"></div>
      </div>
    </div>
  `;
}

// ============================================================
// 月报（按月聚合日报/周报数据，输出月报初稿）
// ============================================================
function openMonthlyReport() {
  showToast('月报功能开发中…', 'info');
}

// ============================================================
// 协调事宜
// ============================================================
function renderIssues() {
  const issues = M.ISSUES.filter(i => i.projectId === currentProjectId && i.type === 'coordination' && i.status !== 'closed');
  if (issues.length === 0) {
    document.getElementById('issueList').innerHTML = `<div style="text-align:center; padding:20px; color:#94a3b8; font-size:12px;">暂无协调事宜</div>`;
    return;
  }
  let html = `<table style="width:100%; border-collapse:collapse; font-size:12px;">
    <thead>
      <tr style="background:#0ea5e9; color:#fff;">
        <th style="padding:6px 4px; border:1px solid #bae6fd; width:32px;">序号</th>
        <th style="padding:6px 4px; border:1px solid #bae6fd;">需协调事宜</th>
        <th style="padding:6px 4px; border:1px solid #bae6fd; width:90px;">提出部门</th>
        <th style="padding:6px 4px; border:1px solid #bae6fd; width:90px;">配合部门</th>
        <th style="padding:6px 4px; border:1px solid #bae6fd; width:60px;">操作</th>
      </tr>
    </thead>
    <tbody>`;
  issues.forEach((issue, i) => {
    const bg = i % 2 === 0 ? '#dbeafe' : '#eff6ff';
    html += `<tr style="background:${bg};">
      <td style="padding:6px 4px; border:1px solid #bae6fd; text-align:center;">${i+1}</td>
      <td style="padding:6px 4px; border:1px solid #bae6fd;">${issue.title || '—'}</td>
      <td style="padding:6px 4px; border:1px solid #bae6fd; text-align:center;">${issue.proposeDept || '—'}</td>
      <td style="padding:6px 4px; border:1px solid #bae6fd; text-align:center;">${issue.cooperateDept || '—'}</td>
      <td style="padding:6px 4px; border:1px solid #bae6fd; text-align:center;">
        <button style="background:none;border:none;color:#0ea5e9;cursor:pointer;font-size:11px;padding:0 4px;" onclick="event.stopPropagation();openIssueDetail('${issue.id}')">编辑</button>
        <button style="background:none;border:none;color:#dc2626;cursor:pointer;font-size:11px;padding:0 4px;" onclick="event.stopPropagation();closeIssue('${issue.id}')">闭环</button>
      </td>
    </tr>`;
  });
  html += `</tbody></table>`;
  document.getElementById('issueList').innerHTML = html;
}

async function closeIssue(issueId) {
  const issue = M.ISSUES.find(i => i.id === issueId);
  if (!issue) return;
  if (!(await showConfirm(`确定将「${issue.title}」标记为已闭环？`, '闭环协调', '✅'))) return;
  issue.status = 'closed';
  renderIssues();
  showToast('已闭环', 'success');
  if (M.saveIssuesToStorage) {
    try { await M.saveIssuesToStorage(); } catch(e) { console.warn('[协调] 同步后端失败:', e.message); }
  }
}

// ============================================================
// 事件操作
// ============================================================
function confirmEvent(eventId) {
  const event = M.EVENTS.find(e => e.id === eventId);
  if (event) {
    event.status = event.status === 'draft' ? 'confirmed' : 'draft';
    if (M.saveEventsToStorage) M.saveEventsToStorage();
    renderFilteredEvents();
    renderStats();
    if (typeof updateCalendar === 'function') updateCalendar();
    showToast(event.status === 'confirmed' ? '已确认事件' : '已撤回确认', 'success');
  }
}

function confirmTodayReport() {
  // 只确认当前选中日期范围内的草稿（而不是所有项目的草稿）
  const dates = selectedDates.length > 0 ? selectedDates : [M.TODAY];
  const beforeDrafts = M.EVENTS.filter(e =>
    e.projectId === currentProjectId &&
    dates.includes(e.date) &&
    e.status === 'draft'
  ).length;
  M.EVENTS.filter(e =>
    e.projectId === currentProjectId &&
    dates.includes(e.date) &&
    e.status === 'draft'
  ).forEach(e => {
    e.status = 'confirmed';
  });
  if (M.saveEventsToStorage) M.saveEventsToStorage();
  renderFilteredEvents();
  renderStats();
  if (typeof updateCalendar === 'function') updateCalendar();
  showToast(beforeDrafts > 0
    ? `已确认 ${beforeDrafts} 个草稿事件`
    : '当前日期没有草稿事件', 'success');
}

async function deleteEvent(eventId) {
  const confirmed = await showConfirm('确定要删除这个事件吗？', '删除事件', '🗑️');
  if (!confirmed) return;
  const index = M.EVENTS.findIndex(e => e.id === eventId);
  if (index === -1) return;
  const ev = M.EVENTS[index];
  M.EVENTS.splice(index, 1);
  // 同步到后端（如连接可用）
  try {
    await fetch('http://localhost:3010/api/events/' + eventId, { method: 'DELETE' });
  } catch { /* 后端不可达时只删本地 */ }
  // 如果是图纸深化事件，级联删除 DRAWING_DEEPENINGS
  if (ev && ev.type === 'drawing') {
    const dd = M.DRAWING_DEEPENINGS && M.DRAWING_DEEPENINGS.find(d => d.eventId === eventId);
    if (dd) {
      M.DRAWING_DEEPENINGS = M.DRAWING_DEEPENINGS.filter(d => d.eventId !== eventId);
      try {
        await fetch('http://localhost:3010/api/drawing-deepenings/' + encodeURIComponent(dd.id), { method: 'DELETE' });
      } catch (err) { console.warn('[图纸深化] 删除后端失败:', err); }
    }
  }
  if (M.saveEventsToStorage) M.saveEventsToStorage();
  renderFilteredEvents();
  renderStats();
  if (typeof updateCalendar === 'function') updateCalendar();
  showToast('已删除事件', 'info');
}

function openEventDetail(eventId) {
  const event = M.EVENTS.find(e => e.id === eventId);
  if (!event) return;

  selectedEventId = eventId;
  const meta = M.TYPE_META[event.type] || { icon: '📌', label: event.type, color: '#94a3b8' };
  document.getElementById('eventDetailTitle').textContent = `${meta.icon} ${meta.label}详情`;

  const plan = (M.PLANS[currentProjectId] || []).find(p => p.id === event.planId);
  const planName = plan ? (plan.taskName || plan.process) : (event.payload?.taskName || '');
  const p = event.payload || {};
  const rowKV = (label, val) => val ? `<div><div style="font-size:11px;color:#64748b;">${label}</div><div style="font-weight:500;font-size:13px;">${val}</div></div>` : '';

  let typeFields = '';
  switch (event.type) {
    case 'progress':
      typeFields = `
        <div class="form-row">
          ${rowKV('工序/任务名称', planName || p.taskName)}
          ${rowKV('进度', p.progress)}
          ${rowKV('负责人', p.owner)}
        </div>
        ${(p.laborRequirements && p.laborRequirements.length) ? `<div>${rowKV('工种', p.laborRequirements.map(l => `${l.trade}:${l.count || 0}人`).join('，'))}</div>` : ''}
        ${p.description ? `<div>${rowKV('描述', p.description)}</div>` : ''}
      `;
      break;
    case 'material':
      typeFields = `
        <div class="form-row">
          ${rowKV('材料名称', p.materialName)}
          ${rowKV('规格', p.spec)}
          ${rowKV('数量', p.quantity ? p.quantity + (p.unit || '') : '')}
          ${rowKV('操作', p.action)}
        </div>
        ${p.description ? `<div>${rowKV('描述', p.description)}</div>` : ''}
      `;
      break;
    case 'safety':
      typeFields = `
        <div class="form-row">
          ${rowKV('检查类型', p.checkType)}
          ${rowKV('检查结果', p.result)}
        </div>
        ${p.issues && p.issues.length ? `<div>${rowKV('问题', p.issues.join('；'))}</div>` : ''}
        ${p.description ? `<div>${rowKV('描述', p.description)}</div>` : ''}
      `;
      break;
    case 'coordination':
      typeFields = `
        <div class="form-row">
          ${rowKV('协调主题', p.topic)}
          ${rowKV('参与方', (p.parties || []).join('、'))}
          ${rowKV('结论', p.summary)}
        </div>
        ${p.description ? `<div>${rowKV('描述', p.description)}</div>` : ''}
      `;
      break;
    case 'issue':
      typeFields = `
        <div class="form-row">
          ${rowKV('任务名称', p.taskName)}
          ${rowKV('负责人', p.owner)}
        </div>
        ${p.description ? `<div>${rowKV('描述', p.description)}</div>` : ''}
      `;
      break;
    case 'attendance':
      typeFields = `
        <div class="form-row">
          ${rowKV('应到人数', p.headcount)}
          ${rowKV('状态', p.status)}
        </div>
        ${p.description ? `<div>${rowKV('描述', p.description)}</div>` : ''}
      `;
      break;
    case 'drawing':
      typeFields = `
        <div class="form-row">
          ${rowKV('深化任务', p.taskName)}
          ${rowKV('责任人', p.owner)}
          ${rowKV('完成情况', p.status || '进行中')}
        </div>
        ${p.relatedMilestone ? `<div>${rowKV('关联节点', p.relatedMilestone)}</div>` : ''}
        ${p.description ? `<div>${rowKV('描述', p.description)}</div>` : ''}
      `;
      break;
  }

  document.getElementById('eventDetailBody').innerHTML = `
    <div style="display:grid; gap:12px;">
      <div class="form-row">
        ${rowKV('类型', `${meta.icon} ${meta.label}`)}
        ${rowKV('日期', event.date)}
        ${rowKV('时间', event.time)}
      </div>
      ${event.planId ? `<div class="form-row">
        ${rowKV('关联计划', planName || '-')}
        ${rowKV('完成类型', event.completionType === 'unplanned' ? '📌 计划外' : '✅ 计划内')}
      </div>` : ''}
      <div class="form-row">
        ${rowKV('所属区域', getAreaName(event.areaId))}
        ${rowKV('楼号/施工段', event.buildingNo)}
        ${rowKV('层号', event.floorNo)}
      </div>
      ${typeFields}
      <div class="form-row">
        ${rowKV('来源', M.SOURCE_META[event.source]?.label || '手动')}
        ${rowKV('可信度', event.confidence ? (event.confidence * 100).toFixed(0) + '%' : '—')}
        ${rowKV('状态', event.status === 'confirmed' ? '✅ 已确认' : '📝 草稿')}
      </div>
      ${event.voiceText ? `<div><div style="font-size:11px;color:#64748b;">语音原文</div><div style="font-size:13px;font-style:italic;color:#64748b;background:#f8fafc;padding:8px;border-radius:4px;">${event.voiceText}</div></div>` : ''}
      ${event.photos && event.photos.length > 0 ? `<div>
        <div style="font-size:11px;color:#64748b;margin-bottom:6px;">现场照片（${event.photos.length} 张）</div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;">
          ${event.photos.map(p => p.data
            ? `<div style="cursor:zoom-in;aspect-ratio:1/1;border-radius:4px;overflow:hidden;background:#f1f5f9;position:relative;" onclick="openPhotoLightbox('${p.id}')">
                <img src="${p.data}" style="width:100%;height:100%;object-fit:cover;display:block;" />
                <div style="position:absolute;left:0;right:0;bottom:0;padding:3px 6px;background:linear-gradient(transparent,rgba(0,0,0,0.65));color:#fff;font-size:10px;line-height:1.3;">${p.caption || '现场照片'}</div>
              </div>`
            : `<div style="aspect-ratio:1/1;border-radius:4px;background:#f1f5f9;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:24px;">📷</div>`).join('')}
        </div>
      </div>` : ''}
      ${event.note ? `<div>${rowKV('备注', event.note)}</div>` : ''}
    </div>
  `;
  document.getElementById('eventDetailConfirmBtn').textContent = event.status === 'draft' ? '✅ 确认事件' : '🔄 撤回确认';
  showModal('modalEventDetail');
}

function confirmEventFromDetail() {
  confirmEvent(selectedEventId);
  closeModal('modalEventDetail');
}

function editEventDirect(eventId) {
  selectedEventId = eventId;
  openEventEdit();
}

function openEventEdit() {
  const event = M.EVENTS.find(e => e.id === selectedEventId);
  if (!event) return;
  const p = event.payload || {};

  // 填充公共字段
  document.getElementById('edit-type').value = event.type;
  document.getElementById('edit-date').value = event.date;
  document.getElementById('edit-time').value = event.time;
  document.getElementById('edit-building-no').value = event.buildingNo || '';
  document.getElementById('edit-floor-no').value = event.floorNo || '';
  document.getElementById('edit-note').value = event.note || '';

  // 关联计划 + 完成类型
  const planSelect = document.getElementById('edit-plan');
  const dayPlans = (M.PLANS[currentProjectId] || []).filter(pp =>
    pp.status !== 'cancelled' && (
      (pp.startDate && pp.endDate && pp.startDate <= event.date && pp.endDate >= event.date) ||
      pp.date === event.date
    )
  );
  planSelect.innerHTML = '<option value="">无（计划外工作）</option>' +
    dayPlans.map(pp => `<option value="${pp.id}">📋 ${pp.taskName || pp.process}${pp.buildingNo ? ' · ' + pp.buildingNo : ''}${pp.floorNo ? ' · ' + pp.floorNo : ''}</option>`).join('');
  planSelect.value = event.planId || '';
  planSelect.onchange = () => onEditPlanChange(planSelect.value);
  document.getElementById('edit-completion-type').value = event.completionType || (event.planId ? 'planned' : 'unplanned');

  // 区域下拉（包含预置区域 + 自定义区域）
  const areaSelect = document.getElementById('edit-area');
  const areas = getProjectAreas();
  areaSelect.innerHTML = '<option value="">请选择区域</option>' +
    areas.map(a => `<option value="${a.id}">${a.name}${a.custom ? ' ★' : ''}</option>`).join('');
  areaSelect.value = event.areaId || '';

  // 动态字段（按类型）
  renderEditForm(event.type, p);
  renderEditPhotos(event.photos || []);
  
  // 过滤编辑界面字段（按类型）
  const modal = document.getElementById('modalEventEdit');
  modal.querySelectorAll('[data-dp-show]').forEach(el => {
    const allowed = el.getAttribute('data-dp-show').split(',').map(s => s.trim());
    el.style.display = allowed.includes(event.type) ? '' : 'none';
  });
  
  // 已确认的事件，保存按钮置灰
  if (event.status === 'confirmed') {
    const saveBtn = modal.querySelector('.modal-footer .btn-primary');
    if (saveBtn) saveBtn.disabled = true;
    saveBtn.title = '已确认，不可编辑';
  }

  closeModal('modalEventDetail');
  showModal('modalEventEdit');
}

function renderEditForm(type, p) {
  const wrap = document.getElementById('editDynamicForm');
  // 渲染工种编辑行（progress 类型专用）
  const tradeRow = (l, i) => `
    <div class="form-row" style="display:grid;grid-template-columns:2fr 1fr auto;gap:8px;align-items:end;margin-bottom:6px;">
      <div class="form-group" style="margin:0;">
        <label class="form-label" style="font-size:11px;">工种 ${i+1}</label>
        <input class="form-input" type="text" id="edit-trade-${i}" value="${(l.trade||'').replace(/"/g,'&quot;')}" placeholder="如：木工">
      </div>
      <div class="form-group" style="margin:0;">
        <label class="form-label" style="font-size:11px;">人数</label>
        <input class="form-input" type="number" id="edit-trade-count-${i}" value="${l.count||''}" min="0" placeholder="0">
      </div>
      <button type="button" class="btn btn-xs btn-ghost" onclick="this.parentElement.remove();" style="margin-bottom:2px;">✕</button>
    </div>`;

  let html = '';
  switch (type) {
    case 'progress':
      const labor = p.laborRequirements || [];
      html = `
        <div class="form-row" style="display:grid;grid-template-columns:2fr 1fr 1fr;gap:10px;">
          <div class="form-group">
            <label class="form-label">工序/任务名称 <span class="req">*</span></label>
            <input class="form-input" type="text" id="edit-task" value="${(p.taskName||'').replace(/"/g,'&quot;')}">
          </div>
          <div class="form-group">
            <label class="form-label">进度</label>
            <input class="form-input" type="text" id="edit-progress" value="${(p.progress||'').replace(/"/g,'&quot;')}" placeholder="如：50%">
          </div>
          <div class="form-group">
            <label class="form-label">负责人</label>
            <input class="form-input" type="text" id="edit-owner" value="${(p.owner||'').replace(/"/g,'&quot;')}">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">工种明细 <span style="font-size:10px;color:#94a3b8;">（可加多行，每行 1 个工种）</span></label>
          <div id="edit-trades-list">${labor.map((l, i) => tradeRow(l, i)).join('')}</div>
          <button type="button" class="btn btn-xs btn-outline" onclick="addEditTradeRow()" style="margin-top:4px;">➕ 添加工种</button>
        </div>
        <div class="form-group">
          <label class="form-label">描述</label>
          <input class="form-input" type="text" id="edit-description" value="${(p.description||'').replace(/"/g,'&quot;')}" placeholder="描述信息">
        </div>`;
      break;
    case 'material':
      html = `
        <div class="form-row" style="display:grid;grid-template-columns:2fr 1fr 1fr 1fr 1fr;gap:10px;">
          <div class="form-group">
            <label class="form-label">材料名称 <span class="req">*</span></label>
            <input class="form-input" type="text" id="edit-material" value="${(p.materialName||'').replace(/"/g,'&quot;')}">
          </div>
          <div class="form-group">
            <label class="form-label">规格</label>
            <input class="form-input" type="text" id="edit-spec" value="${(p.spec||'').replace(/"/g,'&quot;')}">
          </div>
          <div class="form-group">
            <label class="form-label">数量</label>
            <input class="form-input" type="number" id="edit-quantity" value="${p.quantity||''}" min="0">
          </div>
          <div class="form-group">
            <label class="form-label">单位</label>
            <input class="form-input" type="text" id="edit-unit" value="${(p.unit||'件').replace(/"/g,'&quot;')}">
          </div>
          <div class="form-group">
            <label class="form-label">操作</label>
            <select class="form-select" id="edit-action">
              <option value="进场" ${p.action==='进场'?'selected':''}>进场</option>
              <option value="退场" ${p.action==='退场'?'selected':''}>退场</option>
              <option value="使用" ${p.action==='使用'?'selected':''}>使用</option>
            </select>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">描述</label>
          <textarea class="form-textarea" id="edit-description" rows="2">${(p.description||'').replace(/</g,'&lt;')}</textarea>
        </div>`;
      break;
    case 'safety':
      html = `
        <div class="form-row" style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          <div class="form-group">
            <label class="form-label">检查类型</label>
            <input class="form-input" type="text" id="edit-checktype" value="${(p.checkType||'').replace(/"/g,'&quot;')}">
          </div>
          <div class="form-group">
            <label class="form-label">检查结果</label>
            <input class="form-input" type="text" id="edit-result" value="${(p.result||'正常').replace(/"/g,'&quot;')}">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">问题（用分号分隔）</label>
          <input class="form-input" type="text" id="edit-issues" value="${((p.issues||[]).join('；')).replace(/"/g,'&quot;')}">
        </div>
        <div class="form-group">
          <label class="form-label">描述</label>
          <textarea class="form-textarea" id="edit-description" rows="2">${(p.description||'').replace(/</g,'&lt;')}</textarea>
        </div>`;
      break;
    case 'coordination':
      html = `
        <div class="form-group">
          <label class="form-label">协调主题 <span class="req">*</span></label>
          <input class="form-input" type="text" id="edit-topic" value="${(p.topic||'').replace(/"/g,'&quot;')}">
        </div>
        <div class="form-group">
          <label class="form-label">参与方（用分号分隔）</label>
          <input class="form-input" type="text" id="edit-parties" value="${((p.parties||[]).join('；')).replace(/"/g,'&quot;')}">
        </div>
        <div class="form-group">
          <label class="form-label">协调结论</label>
          <textarea class="form-textarea" id="edit-summary" rows="2">${(p.summary||'').replace(/</g,'&lt;')}</textarea>
        </div>
        <div class="form-group">
          <label class="form-label">描述</label>
          <textarea class="form-textarea" id="edit-description" rows="2">${(p.description||'').replace(/</g,'&lt;')}</textarea>
        </div>`;
      break;
    case 'issue':
      html = `
        <div class="form-row" style="display:grid;grid-template-columns:2fr 1fr;gap:10px;">
          <div class="form-group">
            <label class="form-label">任务名称 <span class="req">*</span></label>
            <input class="form-input" type="text" id="edit-task" value="${(p.taskName||'').replace(/"/g,'&quot;')}">
          </div>
          <div class="form-group">
            <label class="form-label">负责人</label>
            <input class="form-input" type="text" id="edit-owner" value="${(p.owner||'').replace(/"/g,'&quot;')}">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">描述</label>
          <textarea class="form-textarea" id="edit-description" rows="2">${(p.description||'').replace(/</g,'&lt;')}</textarea>
        </div>`;
      break;
    case 'attendance':
      html = `
        <div class="form-row" style="display:grid;grid-template-columns:1fr 2fr;gap:10px;">
          <div class="form-group">
            <label class="form-label">应到人数 <span class="req">*</span></label>
            <input class="form-input" type="number" id="edit-att-count" value="${p.headcount||''}" min="0">
          </div>
          <div class="form-group">
            <label class="form-label">签到状态</label>
            <input class="form-input" type="text" id="edit-att-status" value="${(p.status||'正常').replace(/"/g,'&quot;')}">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">描述</label>
          <textarea class="form-textarea" id="edit-description" rows="2">${(p.description||'').replace(/</g,'&lt;')}</textarea>
        </div>`;
      break;
    case 'drawing':
      html = `
        <div class="form-group">
          <label class="form-label">计划事项 <span class="req">*</span></label>
          <textarea class="form-textarea" id="edit-task" rows="2">${(p.taskName||'').replace(/</g,'&lt;')}</textarea>
        </div>
        <div class="form-row" style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          <div class="form-group">
            <label class="form-label">负责人</label>
            <input class="form-input" type="text" id="edit-owner" value="${(p.owner||'').replace(/"/g,'&quot;')}">
          </div>
          <div class="form-group">
            <label class="form-label">当前进度</label>
            <input class="form-input" type="text" id="edit-progress" value="${(p.progress||'').replace(/"/g,'&quot;')}" placeholder="如：50%">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">描述</label>
          <textarea class="form-textarea" id="edit-description" rows="2">${(p.description||'').replace(/</g,'&lt;')}</textarea>
        </div>`;
      break;
  }
  wrap.innerHTML = html;
}

function renderEditPhotos(photos) {
  const sec = document.getElementById('editPhotosSection');
  if (!sec) return;
  if (!photos || photos.length === 0) { sec.innerHTML = ''; return; }
  sec.innerHTML = `
    <div class="form-group">
      <label class="form-label">现场照片（${photos.length} 张）<span style="font-size:10px;color:#f59e0b;background:#fffbeb;padding:1px 6px;border-radius:8px;margin-left:6px;">关闭"报表显示"则周报 05 不展示该照片标签</span></label>
      <div id="edit-photos-list" style="display:flex;flex-direction:column;gap:6px;">
        ${photos.map((p, i) => {
          const showCap = p.showInReport !== false;
          const cap = (p.caption || '').replace(/</g,'&lt;');
          return `
          <div class="edit-photo-row" data-photo-id="${p.id}" style="display:grid;grid-template-columns:60px 1fr auto auto;gap:8px;align-items:center;padding:6px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;">
            <div style="width:60px;height:60px;border-radius:4px;overflow:hidden;background:#fff;flex-shrink:0;border:1px solid #e2e8f0;">
              ${p.data ? `<img src="${p.data}" style="width:100%;height:100%;object-fit:cover;display:block;cursor:zoom-in;" onclick="openPhotoLightbox('${p.id}')" />` : '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:18px;">📷</div>'}
            </div>
            <div style="display:flex;flex-direction:column;gap:4px;min-width:0;">
              <input class="form-input" type="text" id="edit-photo-caption-${i}" value="${cap}" placeholder="照片描述/标签" style="font-size:12px;padding:3px 6px;">
              <label style="display:flex;align-items:center;gap:4px;font-size:11px;color:#475569;cursor:pointer;">
                <input type="checkbox" id="edit-photo-show-${i}" ${showCap ? 'checked' : ''} onchange="document.getElementById('edit-photo-row-${i}').style.opacity = this.checked ? '1' : '0.55'">
                <span>在周报 05 中显示标签</span>
              </label>
            </div>
            <div id="edit-photo-row-${i}" style="opacity:${showCap ? '1' : '0.55'};"></div>
            <button type="button" class="btn btn-xs btn-ghost" onclick="removeEditPhoto('${p.id}')" style="font-size:11px;padding:2px 6px;" title="删除照片">🗑</button>
          </div>`;
        }).join('')}
      </div>
    </div>`;
}

window.removeEditPhoto = function(photoId) {
  const row = document.querySelector(`.edit-photo-row[data-photo-id="${photoId}"]`);
  if (row) row.remove();
};

window.addEditTradeRow = function() {
  const list = document.getElementById('edit-trades-list');
  if (!list) return;
  const i = list.children.length;
  const row = document.createElement('div');
  row.style.cssText = 'display:grid;grid-template-columns:2fr 1fr auto;gap:8px;align-items:end;margin-bottom:6px;';
  row.innerHTML = `
    <div class="form-group" style="margin:0;">
      <label class="form-label" style="font-size:11px;">工种 ${i+1}</label>
      <input class="form-input" type="text" id="edit-trade-${i}" placeholder="如：木工">
    </div>
    <div class="form-group" style="margin:0;">
      <label class="form-label" style="font-size:11px;">人数</label>
      <input class="form-input" type="number" id="edit-trade-count-${i}" min="0" placeholder="0">
    </div>
    <button type="button" class="btn btn-xs btn-ghost" onclick="this.parentElement.remove();" style="margin-bottom:2px;">✕</button>`;
  list.appendChild(row);
};

function saveEventEdit() {
  const event = M.EVENTS.find(e => e.id === selectedEventId);
  if (!event) return;

  // 已确认事件不可编辑
  if (event.status === 'confirmed') {
    showToast('已确认事件不可编辑', 'warning');
    return;
  }

  const type = document.getElementById('edit-type').value;
  const date = document.getElementById('edit-date').value;
  const time = document.getElementById('edit-time').value;
  const areaId = document.getElementById('edit-area').value;
  const planId = document.getElementById('edit-plan').value;
  const completionType = document.getElementById('edit-completion-type').value;
  const buildingNo = document.getElementById('edit-building-no').value;
  const floorNo = document.getElementById('edit-floor-no').value;
  const note = document.getElementById('edit-note').value;

  if (!date || !time || (!areaId && type !== 'drawing')) {
    showToast('请填写日期/时间/区域', 'error');
    return;
  }

  event.type = type;
  event.date = date;
  event.time = time;
  event.areaId = areaId;
  event.planId = planId || undefined;
  event.completionType = planId ? completionType : undefined;
  event.buildingNo = buildingNo || undefined;
  event.floorNo = floorNo || undefined;
  event.note = note;
  event.payload = event.payload || {};

  // 按类型读动态字段
  switch (type) {
    case 'progress':
      event.payload.taskName = document.getElementById('edit-task')?.value || '';
      event.payload.progress = fixProgress(document.getElementById('edit-progress')?.value || '');
      event.payload.owner = document.getElementById('edit-owner')?.value || '';
      // 收集工种行
      const tradeList = document.getElementById('edit-trades-list');
      const laborRequirements = [];
      if (tradeList) {
        Array.from(tradeList.children).forEach(row => {
          const trade = row.querySelector('input[id^="edit-trade-"]:not([id$="-count"])')?.value;
          const cnt = parseInt(row.querySelector('input[id^="edit-trade-"][id$="-count-"], input[id^="edit-trade-count-"]')?.value) || 0;
          if (trade && trade.trim()) laborRequirements.push({ trade: trade.trim(), count: cnt });
        });
      }
      event.payload.laborRequirements = laborRequirements.length > 0 ? laborRequirements : undefined;
      event.payload.laborStats = laborRequirements.length > 0
        ? laborRequirements.reduce((acc, l) => { acc[l.trade] = (acc[l.trade] || 0) + l.count; return acc; }, {})
        : undefined;
      event.payload.headcount = laborRequirements.reduce((s, l) => s + l.count, 0);
      event.payload.description = document.getElementById('edit-description')?.value || '';
      break;
    case 'material':
      event.payload.materialName = document.getElementById('edit-material')?.value || '';
      event.payload.spec = document.getElementById('edit-spec')?.value || '';
      event.payload.quantity = parseInt(document.getElementById('edit-quantity')?.value) || 0;
      event.payload.unit = document.getElementById('edit-unit')?.value || '件';
      event.payload.action = document.getElementById('edit-action')?.value || '进场';
      event.payload.description = document.getElementById('edit-description')?.value || '';
      break;
    case 'safety':
      event.payload.checkType = document.getElementById('edit-checktype')?.value || '';
      event.payload.result = document.getElementById('edit-result')?.value || '正常';
      event.payload.issues = (document.getElementById('edit-issues')?.value || '').split(/[；;]/).map(s=>s.trim()).filter(Boolean);
      event.payload.description = document.getElementById('edit-description')?.value || '';
      break;
    case 'coordination':
      event.payload.topic = document.getElementById('edit-topic')?.value || '';
      event.payload.parties = (document.getElementById('edit-parties')?.value || '').split(/[；;]/).map(s=>s.trim()).filter(Boolean);
      event.payload.summary = document.getElementById('edit-summary')?.value || '';
      event.payload.description = document.getElementById('edit-description')?.value || '';
      break;
    case 'issue':
      event.payload.taskName = document.getElementById('edit-task')?.value || '';
      event.payload.owner = document.getElementById('edit-owner')?.value || '';
      event.payload.description = document.getElementById('edit-description')?.value || '';
      break;
    case 'attendance':
      event.payload.headcount = parseInt(document.getElementById('edit-att-count')?.value) || 0;
      event.payload.status = document.getElementById('edit-att-status')?.value || '正常';
      event.payload.description = document.getElementById('edit-description')?.value || '';
      break;
    case 'drawing':
      event.payload.taskName = document.getElementById('edit-task')?.value || '';
      event.payload.owner = document.getElementById('edit-owner')?.value || '';
      event.payload.progress = document.getElementById('edit-progress')?.value || '';
      event.payload.description = document.getElementById('edit-description')?.value || '';
      break;
  }

  // 图纸深化事件：同步到 DRAWING_DEEPENINGS
  if (type === 'drawing') {
    if (typeof M.DRAWING_DEEPENINGS === 'undefined') M.DRAWING_DEEPENINGS = [];
    const existing = M.DRAWING_DEEPENINGS.find(d => d.eventId === event.id);
    if (existing) {
      existing.task = event.payload.taskName || '';
      existing.owner = event.payload.owner || '';
      existing.progress = event.payload.progress || '';
      existing.areaId = areaId || null;
      existing.planId = event.planId || null;
    } else {
      M.DRAWING_DEEPENINGS.push({
        id: 'DD-E' + event.id,
        projectId: currentProjectId,
        task: event.payload.taskName || '',
        owner: event.payload.owner || '',
        progress: event.payload.progress || '',
        areaId: areaId || null,
        planId: event.planId || null,
        eventId: event.id,
        createdDate: event.date
      });
    }
  }

  // 同步照片（caption + showInReport），并删除用户移除的照片
  if (event.photos && event.photos.length > 0) {
    const kept = [];
    const photoRows = document.querySelectorAll('.edit-photo-row');
    const oldToNew = new Map();
    photoRows.forEach((row, i) => {
      const id = row.dataset.photoId;
      const capEl = document.getElementById(`edit-photo-caption-${i}`);
      const showEl = document.getElementById(`edit-photo-show-${i}`);
      const orig = event.photos.find(p => p.id === id);
      if (!orig) return;
      orig.caption = capEl ? capEl.value.trim() : orig.caption;
      orig.showInReport = showEl ? showEl.checked : true;
      kept.push(orig);
      oldToNew.set(id, orig);
    });
    event.photos = kept;
  }

  // 同步关联计划
  if (event.planId) {
    const plans = M.PLANS[currentProjectId] || [];
    const plan = plans.find(p => p.id === event.planId);
    if (plan) {
      if (event.payload.taskName) plan.taskName = event.payload.taskName;
      if (event.payload.progress) plan.progress = event.payload.progress;
    }
  }
  if (M.savePlansToStorage) M.savePlansToStorage();
  if (M.saveEventsToStorage) M.saveEventsToStorage();
  closeModal('modalEventEdit');
  renderDailyPlanCard();
  renderFilteredEvents();
  renderStats();
  if (typeof updateCalendar === 'function') updateCalendar();
  showToast('事件已保存', 'success');
}

// 编辑界面：选择关联计划后自动填充
let _editPrevPlanId = '';

function onEditPlanChange(planId) {
  const event = M.EVENTS.find(e => e.id === selectedEventId);
  if (!event) return;

  // 检查已有数据
  const hasData = (document.getElementById('edit-task')?.value || '') ||
    (document.getElementById('edit-progress')?.value || '') ||
    (document.getElementById('edit-owner')?.value || '') ||
    (document.getElementById('edit-building-no')?.value || '') ||
    (document.getElementById('edit-floor-no')?.value || '') ||
    (document.getElementById('edit-area')?.value || '');

  // 已有数据且切换了计划，提示确认
  if (hasData && planId !== _editPrevPlanId && _editPrevPlanId !== undefined) {
    const msg = planId ? '切换计划将覆盖已填写数据，是否继续？' : '取消关联计划将清空已填写数据，是否继续？';
    showConfirm(msg, '切换关联计划', '🔄').then(proceed => {
      if (proceed) {
        doEditPlanChange(planId);
      } else {
        // 恢复旧值
        const sel = document.getElementById('edit-plan');
        if (sel) sel.value = _editPrevPlanId;
      }
    });
    return;
  }
  doEditPlanChange(planId);
}

function doEditPlanChange(planId) {
  _editPrevPlanId = planId;
  // 完成类型
  document.getElementById('edit-completion-type').value = planId ? 'planned' : 'unplanned';

  if (!planId) return;

  const projectPlans = M.PLANS[currentProjectId] || [];
  const plan = projectPlans.find(p => p.id === planId);
  if (!plan) return;

  // 工具函数：有值就同步
  const setVal = (id, val) => {
    if (val === undefined || val === null) return;
    const el = document.getElementById(id);
    if (el) el.value = val;
  };
  const setText = (id, val) => {
    if (val === undefined || val === null) return;
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  // 1. 同步事件类型（如果当前类型与计划不匹配，自动切换并重渲染表单）
  const planType = plan.type || plan.eventType;
  if (planType && document.getElementById('edit-type').value !== planType) {
    document.getElementById('edit-type').value = planType;
    const event = M.EVENTS.find(e => e.id === selectedEventId);
    if (event) {
      event.type = planType;
      renderEditForm(planType, event.payload || {});
      // 重新应用 type 过滤显示
      const modal = document.getElementById('modalEventEdit');
      modal.querySelectorAll('[data-dp-show]').forEach(el => {
        const allowed = el.getAttribute('data-dp-show').split(',').map(s => s.trim());
        el.style.display = allowed.includes(planType) ? '' : 'none';
      });
    }
  }

  // 2. 同步公共字段（日期、时间、地点、备注）
  setVal('edit-date', plan.startDate || plan.date);
  setVal('edit-building-no', plan.buildingNo);
  setVal('edit-floor-no', plan.floorNo);
  setVal('edit-area', plan.areaId || plan.area);
  setVal('edit-note', plan.description || plan.safetyNotes);

  // 3. 按类型同步专属字段
  const currentType = document.getElementById('edit-type').value;
  const taskName = plan.taskName || plan.process;
  const planPayload = plan.payload || {};

  if (currentType === 'progress') {
    // 进度事件：任务、进度、负责人、工种明细
    setVal('edit-task', taskName);
    setVal('edit-progress', plan.progress);
    setVal('edit-owner', plan.owner);
    setVal('edit-description', plan.description);
    // 同步工种行
    const laborList = plan.laborRequirements || plan.laborSchedule || [];
    const tradeListEl = document.getElementById('edit-trades-list');
    if (tradeListEl) {
      tradeListEl.innerHTML = '';
      laborList.forEach((l, i) => {
        const row = document.createElement('div');
        row.style.cssText = 'display:grid;grid-template-columns:2fr 1fr auto;gap:8px;align-items:end;margin-bottom:6px;';
        row.innerHTML = `
          <div class="form-group" style="margin:0;">
            <label class="form-label" style="font-size:11px;">工种 ${i+1}</label>
            <input class="form-input" type="text" id="edit-trade-${i}" value="${(l.trade||'').replace(/"/g,'&quot;')}" placeholder="如：木工">
          </div>
          <div class="form-group" style="margin:0;">
            <label class="form-label" style="font-size:11px;">人数</label>
            <input class="form-input" type="number" id="edit-trade-count-${i}" value="${l.count||''}" min="0" placeholder="0">
          </div>
          <button type="button" class="btn btn-xs btn-ghost" onclick="this.parentElement.remove();" style="margin-bottom:2px;">✕</button>
        `;
        tradeListEl.appendChild(row);
      });
    }
  } else if (currentType === 'material') {
    // 材料事件
    setVal('edit-material', planPayload.materialName || taskName);
    setVal('edit-spec', planPayload.spec);
    setVal('edit-quantity', planPayload.quantity);
    setVal('edit-unit', planPayload.unit);
    setVal('edit-action', planPayload.action || '进场');
    setVal('edit-description', plan.description);
  } else if (currentType === 'safety') {
    // 安全事件
    setVal('edit-checktype', planPayload.checkType || '日常安全巡检');
    setVal('edit-result', planPayload.result || '正常');
    setVal('edit-issues', Array.isArray(planPayload.issues) ? planPayload.issues.join('；') : '');
    setVal('edit-description', plan.description);
  } else if (currentType === 'coordination') {
    // 协调事件
    setVal('edit-topic', planPayload.topic || taskName);
    setVal('edit-parties', Array.isArray(planPayload.parties) ? planPayload.parties.join('；') : '');
    setVal('edit-summary', planPayload.summary);
    setVal('edit-description', plan.description);
  } else if (currentType === 'issue') {
    // 问题事件
    setVal('edit-task', taskName);
    setVal('edit-owner', plan.owner);
    setVal('edit-description', plan.description);
  } else if (currentType === 'attendance') {
    // 考勤事件
    setVal('edit-att-count', planPayload.headcount || plan.totalManDays);
    setVal('edit-att-status', planPayload.status || '正常');
    setVal('edit-description', plan.description);
  } else if (currentType === 'drawing') {
    // 图纸深化事件
    setVal('edit-task', taskName);
    setVal('edit-owner', plan.owner);
    setVal('edit-progress', plan.progress);
    setVal('edit-description', plan.description);
  }

  showToast('已自动填充计划数据', 'success');
}

// ============================================================
// 筛选
// ============================================================
function filterEvents(filter, el) {
  currentFilter = filter;
  document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  renderFilteredEvents();
}

// ============================================================
// 日历功能
// ============================================================
function initCalendar() {
  updateCalendar();
}

function updateCalendar() {
  const year = currentCalendarDate.getFullYear();
  const month = currentCalendarDate.getMonth();
  document.getElementById('calendarMonthLabel').textContent = `${year}年${month + 1}月`;
  
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDay = firstDay.getDay();
  const totalDays = lastDay.getDate();
  
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  
  const allEvents = [...M.EVENTS, ...M.HISTORY_EVENTS];
  
  // 获取项目的所有计划
  const projectPlans = M.PLANS[currentProjectId] || [];
  
  let html = `
    <div class="calendar-weekday">日</div>
    <div class="calendar-weekday">一</div>
    <div class="calendar-weekday">二</div>
    <div class="calendar-weekday">三</div>
    <div class="calendar-weekday">四</div>
    <div class="calendar-weekday">五</div>
    <div class="calendar-weekday">六</div>
  `;
  
  // 填充空格子（月初空白）
  for (let i = 0; i < startDay; i++) {
    html += '<div class="calendar-day empty"></div>';
  }
  
  // 填充日期格子
  for (let day = 1; day <= totalDays; day++) {
    const dateStr = `${year}-${String(month+1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dayEvents = allEvents.filter(e => e.projectId === currentProjectId && e.date === dateStr);
    const draftCount = dayEvents.filter(e => e.status === 'draft').length;
    const confirmedCount = dayEvents.filter(e => e.status === 'confirmed').length;
    const isToday = dateStr === todayStr;
    const isSelected = selectedDates.includes(dateStr);
    
    // 检查是否有计划覆盖此日期
    const hasPlan = projectPlans.some(p => {
      if (!p.startDate || !p.endDate || p.status === 'cancelled') return false;
      return p.startDate <= dateStr && p.endDate >= dateStr;
    });
    
    // 计算当天的计划数量
    const planCount = projectPlans.filter(p => {
      if (!p.startDate || !p.endDate || p.status === 'cancelled') return false;
      return p.startDate <= dateStr && p.endDate >= dateStr;
    }).length;
    
    let className = 'calendar-day';
    if (isToday) className += ' today';
    if (isSelected) className += ' selected';
    if (hasPlan) className += ' has-plan';
    
    let statusDots = '';
    if (confirmedCount > 0 || draftCount > 0 || planCount > 0) {
      statusDots = '<div class="calendar-dots">';
      if (confirmedCount > 0) {
        statusDots += `<span class="calendar-dot confirmed">✓${confirmedCount}</span>`;
      }
      if (draftCount > 0) {
        statusDots += `<span class="calendar-dot draft">○${draftCount}</span>`;
      }
      if (planCount > 0) {
        statusDots += `<span class="calendar-dot plan">📋${planCount}</span>`;
      }
      statusDots += '</div>';
    }
    
    html += `
      <div class="${className}" onclick="toggleCalendarDate('${dateStr}', event)">
        ${day}
        ${statusDots}
      </div>
    `;
  }
  
  document.getElementById('calendarGrid').innerHTML = html;
}

function changeCalendarMonth(delta) {
  currentCalendarDate = new Date(currentCalendarDate.getFullYear(), currentCalendarDate.getMonth() + delta, 1);
  updateCalendar();
}

function toggleCalendarDate(dateStr, event) {
  event.preventDefault();

  if (multiSelectMode) {
    const index = selectedDates.indexOf(dateStr);
    if (index > -1) {
      selectedDates.splice(index, 1);
    } else {
      selectedDates.push(dateStr);
    }
  } else {
    selectedDates = [dateStr];
  }

  updateCalendar();
  updateHeaderDate();
  renderFilteredEvents();
  renderDailyPlanCard();
}

function toggleMultiSelect() {
  multiSelectMode = !multiSelectMode;
  if (multiSelectMode) {
    showToast('已开启多选模式', 'success');
  } else {
    if (selectedDates.length > 1) {
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      selectedDates = selectedDates.includes(todayStr) ? [todayStr] : [selectedDates[0]];
      updateCalendar();
      updateHeaderDate();
      renderFilteredEvents();
      renderDailyPlanCard();
    }
    showToast('已切换为单选模式', 'info');
  }
}

function selectAllDatesInMonth() {
  const year = currentCalendarDate.getFullYear();
  const month = currentCalendarDate.getMonth();
  const lastDay = new Date(year, month + 1, 0).getDate();

  for (let day = 1; day <= lastDay; day++) {
    const dateStr = `${year}-${String(month+1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (!selectedDates.includes(dateStr)) {
      selectedDates.push(dateStr);
    }
  }

  updateCalendar();
  updateHeaderDate();
  renderFilteredEvents();
  renderDailyPlanCard();
  showToast('已全选本月所有日期', 'success');
}

function clearAllDates() {
  selectedDates = [];
  updateCalendar();
  updateHeaderDate();
  renderFilteredEvents();
  renderDailyPlanCard();
  showToast('已清除所有选中日期', 'info');
}

function selectAllReportedDates() {
  const allEvents = [...M.EVENTS, ...M.HISTORY_EVENTS];
  const projectEvents = allEvents.filter(e => e.projectId === currentProjectId);
  const reportedDates = [...new Set(projectEvents.map(e => e.date))];

  selectedDates = reportedDates;

  const firstDate = new Date(Math.min(...reportedDates.map(d => new Date(d))));
  currentCalendarDate = new Date(firstDate.getFullYear(), firstDate.getMonth(), 1);

  updateCalendar();
  updateHeaderDate();
  renderFilteredEvents();
  renderDailyPlanCard();
  showToast(`已选中所有有日报的日期（共 ${reportedDates.length} 天）`, 'success');
}

function goToToday() {
  const today = new Date();
  currentCalendarDate = new Date(today.getFullYear(), today.getMonth(), 1);
  const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  selectedDates = [todayStr];
  updateCalendar();
  updateHeaderDate();
  renderFilteredEvents();
  renderDailyPlanCard();
  showToast('已定位到今天', 'success');
}

// ============================================================
// 今日计划卡片（可展开/收起）
// ============================================================
let planCardCollapsed = {};

function togglePlanCard(id) {
  planCardCollapsed[id] = !planCardCollapsed[id];
  renderDailyPlanCard();
}

function renderDailyPlanCard() {
  // 多选时：展示所有选中日期上的计划（具体日期集合，非连续区间）；单选/无选时：只展示当日计划
  const isMulti = selectedDates && selectedDates.length > 1;
  const daySet = isMulti ? new Set(selectedDates) : null;
  const titleEl = document.getElementById('dailyPlanTitle');
  if (titleEl) {
    if (isMulti) {
      const sorted = [...selectedDates].sort();
      const fmtMD = s => s.replace(/^\d{4}-/, '').replace(/-/g, '.');
      titleEl.textContent = sorted.length > 5
        ? `多日计划（${sorted.length} 天）`
        : `多日计划（${sorted.map(fmtMD).join('、')}）`;
    } else {
      titleEl.textContent = '今日计划';
    }
  }
  const todayPlans = (M.PLANS[currentProjectId] || []).filter(p => {
    if (p.status === 'cancelled') return false;
    if (isMulti) {
      // 计划与任一选中日相交（具体日期集合，不是连续区间）
      if (p.startDate && p.endDate) {
        for (const d of selectedDates) if (d >= p.startDate && d <= p.endDate) return true;
        return false;
      }
      if (p.date) return daySet.has(p.date);
      return false;
    }
    const today = selectedDates && selectedDates.length > 0 ? selectedDates[0] : M.TODAY;
    if (p.startDate && p.endDate) return p.startDate <= today && p.endDate >= today;
    if (p.date) return p.date === today;
    return false;
  });

  if (!todayPlans || todayPlans.length === 0) {
    document.getElementById('dailyPlanCard').innerHTML = `
      <div style="text-align:center; padding:12px; color:#94a3b8;">
        <div style="font-size:24px; margin-bottom:4px;">📋</div>
        <div style="font-size:12px;">${isMulti ? '所选日期内暂无计划' : '暂无今日计划'}</div>
      </div>
    `;
    return;
  }

  // 统计口径切换：人数（默认） / 工日
  const unit = localStorage.getItem(`page06_unit_${currentProjectId}`) || 'people';

  let html = '';

  todayPlans.forEach(plan => {
    if (planCardCollapsed[plan.id] === undefined) planCardCollapsed[plan.id] = true;
    const collapsed = planCardCollapsed[plan.id];
    const laborList = plan.laborRequirements || plan.laborSchedule || [];
    const totalWorkers = laborList.reduce((sum, l) => sum + (l.count || 0), 0);
    // 计划总工日 = sum(count) × plan天数；如果 plan.totalManDays 已存则用存值
    const planStart = plan.startDate || plan.date;
    const planEnd = plan.endDate || plan.startDate || plan.date;
    const planDays = (planStart && planEnd) ? (Math.round((new Date(planEnd) - new Date(planStart)) / 86400000) + 1) : 0;
    const planManDays = Number(plan.totalManDays) || (totalWorkers * planDays);
    const typeMeta = M.TYPE_META[plan.type || plan.eventType] || { icon: '📋', label: '计划', color: '#64748b' };
    const displayProcess = plan.taskName || plan.process || plan.description || '施工计划';
    const location = [plan.buildingNo, plan.floorNo].filter(Boolean).join(' · ');
    // 区间日期展示：startDate~endDate、date、或空
    const fmtMD = (s) => s ? s.replace(/^\d{4}-/, '').replace(/-/g, '.') : '';
    let dateRange = '';
    if (plan.startDate && plan.endDate && plan.startDate !== plan.endDate) {
      dateRange = `${fmtMD(plan.startDate)} ~ ${fmtMD(plan.endDate)}`;
    } else if (plan.startDate || plan.endDate) {
      dateRange = fmtMD(plan.startDate || plan.endDate);
    } else if (plan.date) {
      dateRange = fmtMD(plan.date);
    }
    // 获取关联完成记录（多选时仅取区间内的事件）
    const planEvents = M.EVENTS.filter(e => {
      if (e.planId !== plan.id) return false;
      if (isMulti) return selectedDates.includes(e.date);
      return true;
    });

    html += `
      <div style="background:#f8fafc; border-radius:6px; padding:10px; margin-bottom:8px; border-left:3px solid ${typeMeta.color};">
        <!-- 标题行：始终可见 -->
        <div style="display:flex; align-items:center; gap:6px; cursor:pointer; user-select:none;" onclick="togglePlanCard('${plan.id}')">
          <span style="font-size:10px; color:#94a3b8; transition:transform .2s;">${collapsed ? '▶' : '▼'}</span>
          <span style="font-size:12px; font-weight:600; color:#334155; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${typeMeta.icon} ${displayProcess}</span>
          ${dateRange ? `<span style="font-size:10px; color:#475569; white-space:nowrap; background:#e2e8f0;padding:1px 6px;border-radius:8px;">📅 ${dateRange}</span>` : ''}
          ${location ? `<span style="font-size:10px; color:#64748b; white-space:nowrap;"> 🏗️ ${location}</span>` : ''}
          ${plan.progress ? `<span style="font-size:10px; color:#00adef; white-space:nowrap;"> 📊 ${plan.progress}</span>` : ''}
          <div style="flex:1;"></div>
          <span style="font-size:10px;color:#7c3aed;background:#ede9fe;padding:1px 6px;border-radius:8px;white-space:nowrap;">⚙ ${planManDays} 工日</span>
          ${(()=>{const p=parseInt(String(plan.progress||'0').replace('%',''));if(p>100)return '<span style="font-size:10px;padding:1px 6px;background:#f59e0b;color:#fff;border-radius:4px;white-space:nowrap;">🏆 超额完成</span>';if(plan.status==='completed'||p>=100)return '<span style="font-size:10px;padding:1px 6px;background:'+typeMeta.color+';color:#fff;border-radius:4px;white-space:nowrap;">已完成</span>';return '<span style="font-size:10px;padding:1px 6px;background:'+typeMeta.color+';color:#fff;border-radius:4px;white-space:nowrap;">进行中</span>';})()}
        </div>
        
        ${!collapsed ? `
        <!-- 展开详情 -->
        <div style="margin-top:8px; padding-top:8px; border-top:1px solid #e2e8f0;">
          ${plan.owner ? `<div style="font-size:11px; color:#64748b; margin-bottom:4px;">👤 负责人：${plan.owner}</div>` : ''}
          ${totalWorkers > 0 ? `
            <div style="margin-bottom:4px;">
              <div style="font-size:10px; color:#64748b; margin-bottom:2px;">👷 出勤：${totalWorkers}人</div>
              <div style="display:flex; flex-wrap:wrap; gap:3px;">
                ${laborList.map(l => {
                  const trade = l.trade || l.laborType;
                  return `<span style="font-size:10px; padding:1px 4px; background:#fff; border-radius:3px;">${trade}: ${l.count}人</span>`;
                }).join('')}
              </div>
            </div>
          ` : ''}
          ${plan.description && !plan.taskName && !plan.process ? `
            <div style="font-size:11px; color:#64748b; padding-top:4px; border-top:1px dashed #e2e8f0;">${plan.description}</div>
          ` : ''}
        </div>
        
        <!-- 填报记录 -->
        ${planEvents.length > 0 ? `
          <div style="margin-top:6px; padding-top:6px; border-top:1px dashed #d1d5db;">
            <div style="font-size:10px; color:#94a3b8; margin-bottom:4px;">📋 ${isMulti ? '多日报填报' : '今日填报'}（${planEvents.length}次）</div>
            ${planEvents.slice(-5).reverse().map(e => `
              <div style="display:flex; justify-content:space-between; font-size:11px; color:#475569; padding:2px 0;">
                <span style="color:#94a3b8;">${e.time || ''}</span>
                <span>${e.payload.progress ? '→ ' + e.payload.progress : ''}</span>
              </div>
            `).join('')}
          </div>
        ` : ''}
        
        <!-- 操作按钮 -->
        <div style="display:flex; gap:4px; margin-top:6px; padding-top:6px; border-top:1px solid #e2e8f0;">
          <button class="btn btn-ghost btn-sm" onclick="editDailyPlan('${plan.id}')" style="font-size:10px; padding:2px 8px;">✏️ 编辑</button>
          <button class="btn btn-ghost btn-sm" onclick="deleteDailyPlan('${plan.id}')" style="font-size:10px; padding:2px 8px; color:#ef4444;">🗑 删除</button>
        </div>
        ` : ''}
      </div>
    `;
  });

  document.getElementById('dailyPlanCard').innerHTML = html;
}

// 更新日历计划标记
function updateCalendarPlanMarks() {
  updateCalendar();
}

let _zoneImages = [];

function previewZoneImages(event) {
  const files = Array.from(event.target.files);
  _zoneImages = [];
  if (files.length === 0) { document.getElementById('dp-zone-images-preview').style.display = 'none'; return; }
  let loaded = 0;
  files.forEach(file => {
    const reader = new FileReader();
    reader.onload = e => {
      _zoneImages.push({ name: file.name, dataUrl: e.target.result });
      loaded++;
      if (loaded === files.length) renderZoneImagePreviews();
    };
    reader.readAsDataURL(file);
  });
}

function renderZoneImagePreviews() {
  const container = document.getElementById('dp-zone-images-preview');
  container.innerHTML = _zoneImages.map((img, i) =>
    `<div style="border:1px solid #e2e8f0;border-radius:4px;overflow:hidden;background:#f8fafc;position:relative;">
      <button onclick="removeZoneImage(${i})" style="position:absolute;top:2px;right:2px;width:18px;height:18px;border:none;border-radius:50%;background:#ef4444;color:#fff;font-size:10px;cursor:pointer;line-height:18px;text-align:center;padding:0;z-index:1;">✕</button>
      <div style="height:90px;display:flex;align-items:center;justify-content:center;background:#f1f5f9;overflow:hidden;">
        <img src="${img.dataUrl}" style="max-width:100%;max-height:90px;object-fit:contain;">
      </div>
      <div style="padding:3px 6px;font-size:10px;color:#334155;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;border-top:1px solid #e2e8f0;">${img.name}</div>
    </div>`
  ).join('');
  container.style.display = 'grid';
  container.style.gridTemplateColumns = 'repeat(auto-fill,minmax(120px,1fr))';
}

function removeZoneImage(index) {
  _zoneImages.splice(index, 1);
  if (_zoneImages.length === 0) { document.getElementById('dp-zone-images-preview').style.display = 'none'; document.getElementById('dp-zone-images').value = ''; }
  else renderZoneImagePreviews();
}

// ============================================================
// 表单操作
// ============================================================
function renderAreaSelect(selectId) {
  const areas = getProjectAreas();
  const html = '<option value="">请选择区域</option>' +
    areas.map(a => `<option value="${a.id}">${a.name}${a.custom ? ' ★' : ''}</option>`).join('') +
    '<option value="_custom">其他（自定义）</option>';
  
  const select = document.getElementById(selectId);
  if (select) {
    select.innerHTML = html;
  }
}

function populateAreaSelects() {
  // 用 getProjectAreas() 替代 M.AREAS（支持用户新增区域）
  const areas = getProjectAreas();
  const html = '<option value="">请选择区域</option>' +
    areas.map(a => `<option value="${a.id}">${a.name}${a.custom ? ' ★' : ''}</option>`).join('') +
    '<option value="_custom">其他（自定义）</option>';

  document.querySelectorAll('select[id$="-area"], select[id*="area-"]').forEach(el => {
    const current = el.value;
    el.innerHTML = html;
    if (current && areas.find(a => a.id === current)) {
      el.value = current;
    }
  });
  
  // 隐藏所有自定义输入框
  document.querySelectorAll('.custom-area-input').forEach(input => {
    input.style.display = 'none';
  });
}

// ============================================================
// 工日/人数联动辅助
// ============================================================

// 计算 plan 总工日 = sum(count) * totalDays
function _calcPlanManDays(plan) {
  const startDate = plan.startDate || plan.date;
  const endDate = plan.endDate || plan.startDate || plan.date;
  if (!startDate || !endDate) return 0;
  const totalDays = Math.round((new Date(endDate) - new Date(startDate)) / 86400000) + 1;
  const list = plan.laborRequirements || plan.laborSchedule || [];
  const totalCount = list.reduce((s, l) => s + (Number(l.count) || 0), 0);
  return totalCount * totalDays;
}

// 根据新工日反向同步各工种人数
// totalManDays: 新的总工日；按现有 count 占比分配
function _syncPlanCountsByManDays(plan, newTotalManDays) {
  const list = plan.laborRequirements || plan.laborSchedule || [];
  const startDate = plan.startDate || plan.date;
  const endDate = plan.endDate || plan.startDate || plan.date;
  if (!startDate || !endDate || list.length === 0) return plan;
  const totalDays = Math.round((new Date(endDate) - new Date(startDate)) / 86400000) + 1;
  if (totalDays <= 0) return plan;
  const oldTotal = list.reduce((s, l) => s + (Number(l.count) || 0), 0);
  if (oldTotal <= 0) {
    // 没有老人数则按平均分配
    const each = newTotalManDays / totalDays / list.length;
    list.forEach(l => { l.count = Math.max(0, Math.round(each * 10) / 10); });
    return plan;
  }
  list.forEach(l => {
    const ratio = (Number(l.count) || 0) / oldTotal;
    l.count = Math.round((newTotalManDays / totalDays) * ratio * 10) / 10;
    if (l.count < 0) l.count = 0;
  });
  return plan;
}


function openDailyPlanForm() {
  editingPlanId = null;
  laborRowCount = 1;
  areaRowCount = 1;
  
  // 恢复模态框标题和按钮文字
  document.querySelector('#modalDailyPlan .modal-title').textContent = '📋 新建日计划';
  document.querySelector('#modalDailyPlan .modal-footer .btn-primary').textContent = '保存计划';
  
  // 设置默认日期为今天
  const today = M.TODAY;
  document.getElementById('dp-start-date').value = today;
  document.getElementById('dp-end-date').value = today;
  
  // 清空其他字段
  document.getElementById('dp-event-type').value = 'progress';
  document.getElementById('dp-status').value = 'active';
  document.getElementById('dp-building-no').value = '';
  document.getElementById('dp-floor-no').value = '';
  document.getElementById('dp-process').value = '';
  document.getElementById('dp-owner').value = '';
  document.getElementById('dp-progress').value = '';
  document.getElementById('dp-materials').value = '';
  document.getElementById('dp-machinery').value = '';
  document.getElementById('dp-safety-notes').value = '';
  document.getElementById('dp-description').value = '';
  _zoneImages = [];
  document.getElementById('dp-zone-images-preview').style.display = 'none';
  document.getElementById('dp-zone-images-preview').innerHTML = '';
  document.getElementById('dp-zone-images').value = '';
  
  // 渲染区域选择
  renderAreaSelect('dp-area');
  
  // 初始化工种行
  document.getElementById('laborRows').innerHTML = `
    <div class="form-row labor-row">
      <div class="form-group" style="flex:2;">
        <label class="form-label">工种</label>
        <input class="form-input" type="text" id="labor-type-0" placeholder="如：木工、钢筋工" oninput="recalcPlanManDays()">
      </div>
      <div class="form-group" style="flex:1;">
        <label class="form-label">人数</label>
        <input class="form-input" type="number" id="labor-count-0" value="0" min="0" oninput="recalcPlanManDays()">
      </div>
      <div class="form-group" style="flex:1;">
        <label class="form-label">工日</label>
        <input class="form-input dp-labor-mandays" type="number" id="labor-mandays-0" value="0" min="0" step="0.5" onchange="onLaborManDayChanged()">
      </div>
      <button class="btn btn-danger btn-sm" onclick="removeLaborRow(0)" style="margin-top:24px;">✕</button>
    </div>
  `;
  
  showModal('modalDailyPlan');
  filterPlanFormByType();
}

// 根据 dp-event-type 切换日计划表单字段的可见性。
// HTML 约定：需要在某些 type 下隐藏的 .form-section / .form-group 加 data-dp-show="type1,type2,..."。
// 隐藏时清空内部 input/textarea 值，避免脏数据被保存。
function filterPlanFormByType() {
  const typeEl = document.getElementById('dp-event-type');
  if (!typeEl) return;
  const type = typeEl.value;
  document.querySelectorAll('#modalDailyPlan [data-dp-show]').forEach(el => {
    const allowed = el.getAttribute('data-dp-show').split(',').map(s => s.trim());
    const visible = allowed.includes(type);
    el.style.display = visible ? '' : 'none';
    if (!visible) {
      el.querySelectorAll('input, textarea').forEach(inp => {
        if (inp.type === 'checkbox' || inp.type === 'radio') return;
        if (inp.readOnly) return;
        inp.value = '';
      });
    }
  });
  // 图纸深化：修改字段名称语义
  const isDrawing = type === 'drawing';
  const processLabel = document.getElementById('dp-process-label');
  if (processLabel) {
    if (isDrawing) {
      processLabel.innerHTML = '计划事项 <span class="req">*</span>';
    } else {
      processLabel.innerHTML = '工序 <span class="req">*</span>';
    }
  }
  const sectionTitle = document.getElementById('dp-form-title');
  if (sectionTitle) {
    sectionTitle.textContent = isDrawing ? '图纸深化' : '工序信息';
  }
}

// 日报手动录入表单字段过滤（与 filterPlanFormByType 平行）
function filterManualFormByType() {
  const typeEl = document.getElementById('m-type');
  if (!typeEl) return;
  const type = typeEl.value;
  const modal = document.getElementById('modalManual');
  if (!modal) return;
  modal.querySelectorAll('[data-dp-show]').forEach(el => {
    const allowed = el.getAttribute('data-dp-show').split(',').map(s => s.trim());
    const visible = allowed.includes(type);
    el.style.display = visible ? '' : 'none';
    if (!visible) {
      el.querySelectorAll('input, textarea, select').forEach(inp => {
        if (inp.type === 'checkbox' || inp.type === 'radio') return;
        inp.value = '';
      });
    }
  });
}

function addLaborRow() {
  const html = `
    <div class="form-row labor-row">
      <div class="form-group" style="flex:2;">
        <label class="form-label">工种</label>
        <input class="form-input" type="text" id="labor-type-${laborRowCount}" placeholder="如：木工" oninput="recalcPlanManDays()">
      </div>
      <div class="form-group" style="flex:1;">
        <label class="form-label">人数</label>
        <input class="form-input" type="number" id="labor-count-${laborRowCount}" value="0" min="0" oninput="recalcPlanManDays()">
      </div>
      <div class="form-group" style="flex:1;">
        <label class="form-label">工日</label>
        <input class="form-input dp-labor-mandays" type="number" id="labor-mandays-${laborRowCount}" value="0" min="0" step="0.5" onchange="onLaborManDayChanged()">
      </div>
      <button class="btn btn-danger btn-sm" onclick="removeLaborRow(${laborRowCount})" style="margin-top:24px;">✕</button>
    </div>
  `;
  document.getElementById('laborRows').insertAdjacentHTML('beforeend', html);
  laborRowCount++;
}

function removeLaborRow(index) {
  const rows = document.querySelectorAll('.labor-row');
  if (rows.length > 1) {
    rows[index].remove();
  }
}

function addAreaRow() {
  const html = `
    <div class="form-row area-row">
      <div class="form-group">
        <label class="form-label">区域</label>
        <select class="form-select" id="area-target-area-${areaRowCount}">
          ${(M.AREAS[currentProjectId] || []).map(a => `<option value="${a.id}">${a.name}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">任务名称</label>
        <input class="form-input" type="text" id="area-target-task-${areaRowCount}" placeholder="任务名称">
      </div>
      <div class="form-group">
        <label class="form-label">目标进度</label>
        <input class="form-input" type="text" id="area-target-progress-${areaRowCount}" placeholder="如：80%">
      </div>
      <button class="btn btn-danger btn-sm" onclick="removeAreaRow(${areaRowCount})" style="margin-top:24px;">✕</button>
    </div>
  `;
  document.getElementById('areaTargetRows').innerHTML += html;
  areaRowCount++;
}

function removeAreaRow(index) {
  const rows = document.querySelectorAll('.area-row');
  if (rows.length > 1) {
    rows[index].remove();
  }
}

function recalcPlanManDays() {
  const startDate = document.getElementById('dp-start-date').value;
  const endDate = document.getElementById('dp-end-date').value;
  if (!startDate || !endDate) return;
  const totalDays = Math.round((new Date(endDate) - new Date(startDate)) / 86400000) + 1;
  let totalManDays = 0;
  document.querySelectorAll('.labor-row').forEach((row, index) => {
    const countEl = document.getElementById(`labor-count-${index}`);
    const mandaysEl = document.getElementById(`labor-mandays-${index}`);
    const count = parseInt(countEl?.value) || 0;
    if (mandaysEl && document.activeElement !== mandaysEl) {
      const autoMandays = count * Math.max(totalDays, 1);
      mandaysEl.value = autoMandays;
    }
    const rowMandays = parseFloat(mandaysEl?.value) || 0;
    totalManDays += rowMandays;
  });
  const el = document.getElementById('dp-man-days');
  if (el && document.activeElement !== el) el.value = totalManDays;
}

function onLaborManDayChanged() {
  const startDate = document.getElementById('dp-start-date').value;
  const endDate = document.getElementById('dp-end-date').value;
  if (!startDate || !endDate) return;
  const totalDays = Math.round((new Date(endDate) - new Date(startDate)) / 86400000) + 1;
  if (totalDays <= 0) return;
  document.querySelectorAll('.labor-row').forEach((row, index) => {
    const mandaysEl = document.getElementById(`labor-mandays-${index}`);
    const countEl = document.getElementById(`labor-count-${index}`);
    const rowMandays = parseFloat(mandaysEl?.value) || 0;
    if (countEl) countEl.value = Math.max(0, Math.round(rowMandays / Math.max(totalDays, 1) * 10) / 10);
  });
  // 重新汇总总工日
  recalcPlanManDays();
}

function onPlanManDaysChanged() {
  const el = document.getElementById('dp-man-days');
  if (!el) return;
  const newTotal = Number(el.value) || 0;
  const rows = Array.from(document.querySelectorAll('.labor-row'));
  if (rows.length === 0) return;
  const oldMandays = rows.map((_, i) => parseFloat(document.getElementById(`labor-mandays-${i}`)?.value) || 0);
  const oldTotalMandays = oldMandays.reduce((s, x) => s + x, 0);
  const startDate = document.getElementById('dp-start-date').value;
  const endDate = document.getElementById('dp-end-date').value;
  const totalDays = Math.round((new Date(endDate) - new Date(startDate)) / 86400000) + 1;
  if (totalDays <= 0) return;
  rows.forEach((row, i) => {
    const mandaysEl = document.getElementById(`labor-mandays-${i}`);
    const countEl = document.getElementById(`labor-count-${i}`);
    if (oldTotalMandays > 0) {
      const ratio = oldMandays[i] / oldTotalMandays;
      const newMandays = newTotal * ratio;
      if (mandaysEl) mandaysEl.value = Math.round(newMandays * 10) / 10;
    } else {
      const each = newTotal / rows.length;
      if (mandaysEl) mandaysEl.value = each;
    }
    const rowMandays = parseFloat(mandaysEl?.value) || 0;
    if (countEl) countEl.value = Math.max(0, Math.round(rowMandays / Math.max(totalDays, 1) * 10) / 10);
  });
}

function saveDailyPlan() {
  console.log('[日计划] saveDailyPlan 开始', { editingPlanId, projectId: currentProjectId });
  const startDate = document.getElementById('dp-start-date').value;
  const endDate = document.getElementById('dp-end-date').value;
  const eventType = document.getElementById('dp-event-type').value;
  const status = document.getElementById('dp-status').value;
  const buildingNo = document.getElementById('dp-building-no').value;
  const floorNo = document.getElementById('dp-floor-no').value;
  const area = document.getElementById('dp-area').value;
  const process = document.getElementById('dp-process').value;
  const owner = document.getElementById('dp-owner').value;
  const progress = document.getElementById('dp-progress').value;
  const materials = document.getElementById('dp-materials').value;
  const machinery = document.getElementById('dp-machinery').value;
  const safetyNotes = document.getElementById('dp-safety-notes').value;
  const description = document.getElementById('dp-description').value;
  const zoneImages = _zoneImages.length > 0 ? _zoneImages.map(z => ({ name: z.name, dataUrl: z.dataUrl })) : [];
  const totalManDaysEl = document.getElementById('dp-man-days');
  const totalManDays = totalManDaysEl ? Number(totalManDaysEl.value) || 0 : 0;

  const laborRequirements = [];
  document.querySelectorAll('.labor-row').forEach((row, index) => {
    const type = document.getElementById(`labor-type-${index}`)?.value;
    const count = parseInt(document.getElementById(`labor-count-${index}`)?.value) || 0;
    const mandays = parseFloat(document.getElementById(`labor-mandays-${index}`)?.value) || 0;
    if (type && count > 0) {
      laborRequirements.push({ trade: type, count, manDays: mandays });
    }
  });

  if (!startDate || !endDate) {
    showToast('请选择日期范围', 'error');
    return;
  }
  // coordination / attendance 不需要工序；其他 type 必填
  const needsProcess = !['coordination', 'attendance'].includes(eventType);
  if (needsProcess && !process) {
    showToast('请填写工序', 'error');
    return;
  }

  const plan = {
    projectId: currentProjectId,
    startDate,
    endDate,
    type: eventType,
    status,
    buildingNo,
    floorNo,
    areaId: area,
    taskName: process,
    owner,
    progress: fixProgress(progress) || '0%',
    status: parseInt(String(fixProgress(progress)).replace('%','')) >= 100 ? 'completed' : status,
    laborRequirements,
    totalManDays,
    materials: materials ? materials.split('\n').filter(m => m.trim()) : [],
    machinery: machinery ? machinery.split('\n').filter(m => m.trim()) : [],
    safetyNotes,
    description,
    zoneImages
  };
  
  if (!M.PLANS[currentProjectId]) {
    console.log('[日计划] 初始化项目计划数组', currentProjectId);
    M.PLANS[currentProjectId] = [];
  }
  
  console.log('[日计划] 保存前长度:', M.PLANS[currentProjectId].length);
  
  if (editingPlanId) {
    const idx = M.PLANS[currentProjectId].findIndex(p => p.id === editingPlanId);
    if (idx > -1) {
      const existing = M.PLANS[currentProjectId][idx];
      plan.id = editingPlanId;
      plan.createdAt = existing.createdAt;
      plan.updatedAt = new Date().toISOString();
      M.PLANS[currentProjectId][idx] = plan;
    }
    editingPlanId = null;
    document.querySelector('#modalDailyPlan .modal-title').textContent = '📋 新建日计划';
    document.querySelector('#modalDailyPlan .modal-footer .btn-primary').textContent = '保存计划';
    // 同步关联事件
    M.EVENTS.forEach(e => {
      if (e.planId === plan.id) {
        if (plan.taskName) e.payload.taskName = plan.taskName;
        if (plan.progress) e.payload.progress = plan.progress;
        if (plan.areaId) e.areaId = plan.areaId;
      }
    });
    if (M.savePlansToStorage) M.savePlansToStorage();
    if (M.saveEventsToStorage) M.saveEventsToStorage();
    renderFilteredEvents();
    showToast('日计划已更新', 'success');
  } else {
    plan.id = `PLAN${String(Date.now()).slice(-3)}`;
    plan.createdAt = new Date().toISOString();
    plan.updatedAt = plan.createdAt;
    M.PLANS[currentProjectId].unshift(plan);
    // 限制 localStorage 大小，只保留最近 100 条
    if (M.PLANS[currentProjectId].length > 100) {
      M.PLANS[currentProjectId] = M.PLANS[currentProjectId].slice(0, 100);
    }
    showToast('日计划已保存', 'success');
  }
  
  console.log('[日计划] 保存后长度:', M.PLANS[currentProjectId].length, '计划ID:', plan.id);
  
  if (M.savePlansToStorage) M.savePlansToStorage();
  try { localStorage.setItem('daily_plans', JSON.stringify(M.PLANS)); } catch(e) { console.warn('[localStorage] 写计划失败:', e.message); }
  
  updateCalendarPlanMarks();
  closeModal('modalDailyPlan');
  renderDailyPlanCard();
}

function editDailyPlan(planId) {
  const plan = (M.PLANS[currentProjectId] || []).find(p => p.id === planId);
  if (!plan) {
    showToast('计划未找到', 'error');
    return;
  }
  
  editingPlanId = planId;
  
  document.getElementById('dp-start-date').value = plan.startDate || plan.date || M.TODAY;
  document.getElementById('dp-end-date').value = plan.endDate || plan.date || M.TODAY;
  document.getElementById('dp-event-type').value = plan.type || plan.eventType || 'progress';
  document.getElementById('dp-status').value = plan.status || 'active';
  document.getElementById('dp-building-no').value = plan.buildingNo || '';
  document.getElementById('dp-floor-no').value = plan.floorNo || '';
  renderAreaSelect('dp-area');
  document.getElementById('dp-area').value = plan.areaId || plan.area || '';
  document.getElementById('dp-process').value = plan.taskName || plan.process || '';
  document.getElementById('dp-owner').value = plan.owner || '';
  document.getElementById('dp-progress').value = plan.progress || '';
  document.getElementById('dp-materials').value = (plan.materials || []).join('\n');
  document.getElementById('dp-machinery').value = (plan.machinery || []).join('\n');
  document.getElementById('dp-safety-notes').value = plan.safetyNotes || '';
  document.getElementById('dp-description').value = plan.description || '';
  _zoneImages = (plan.zoneImages || []).map(z => ({ name: z.name, dataUrl: z.dataUrl }));
  if (_zoneImages.length > 0) renderZoneImagePreviews();
  else document.getElementById('dp-zone-images-preview').style.display = 'none';
  document.getElementById('dp-zone-images').value = '';
  // 总工日：用户存的值优先，没存则用 sum(count)*天数
  const computedManDays = (() => {
    const start = plan.startDate || plan.date;
    const end = plan.endDate || plan.startDate || plan.date;
    if (!start || !end) return 0;
    const totalDays = Math.round((new Date(end) - new Date(start)) / 86400000) + 1;
    const list = plan.laborRequirements || plan.laborSchedule || [];
    const totalCount = list.reduce((s, l) => s + (Number(l.count) || 0), 0);
    return totalCount * Math.max(totalDays, 1);
  })();
  const mdEl = document.getElementById('dp-man-days');
  if (mdEl) mdEl.value = plan.totalManDays || computedManDays;

  const laborList = plan.laborRequirements || plan.laborSchedule || [];
  if (laborList.length > 0) {
    laborRowCount = laborList.length;
    // 工日自动计算：count × plan天数；若 l.manDays 已存则用存值
    const planStartForMd = plan.startDate || plan.date;
    const planEndForMd = plan.endDate || plan.startDate || plan.date;
    const planDaysForMd = (planStartForMd && planEndForMd)
      ? Math.max(1, Math.round((new Date(planEndForMd) - new Date(planStartForMd)) / 86400000) + 1)
      : 1;
    document.getElementById('laborRows').innerHTML = laborList.map((l, i) => {
      const trade = l.trade || l.laborType;
      const count = l.count || 0;
      const mandays = (l.manDays != null && l.manDays !== '') ? l.manDays : (count * planDaysForMd);
      return `
        <div class="form-row labor-row">
          <div class="form-group" style="flex:2;">
            <label class="form-label">工种</label>
            <input class="form-input" type="text" id="labor-type-${i}" value="${trade || ''}" placeholder="如：木工" oninput="recalcPlanManDays()">
          </div>
          <div class="form-group" style="flex:1;">
            <label class="form-label">人数</label>
            <input class="form-input" type="number" id="labor-count-${i}" value="${count}" min="0" oninput="recalcPlanManDays()">
          </div>
          <div class="form-group" style="flex:1;">
            <label class="form-label">工日</label>
            <input class="form-input dp-labor-mandays" type="number" id="labor-mandays-${i}" value="${mandays}" min="0" step="0.5" onchange="onLaborManDayChanged()">
          </div>
          <button class="btn btn-danger btn-sm" onclick="removeLaborRow(${i})" style="margin-top:24px;">✕</button>
        </div>
      `;
    }).join('');
  } else {
    document.getElementById('laborRows').innerHTML = `
      <div class="form-row labor-row">
        <div class="form-group" style="flex:2;">
          <label class="form-label">工种</label>
          <input class="form-input" type="text" id="labor-type-0" placeholder="如：木工、钢筋工" oninput="recalcPlanManDays()">
        </div>
        <div class="form-group" style="flex:1;">
          <label class="form-label">人数</label>
          <input class="form-input" type="number" id="labor-count-0" value="0" min="0" oninput="recalcPlanManDays()">
        </div>
        <div class="form-group" style="flex:1;">
          <label class="form-label">工日</label>
          <input class="form-input dp-labor-mandays" type="number" id="labor-mandays-0" value="0" min="0" step="0.5" onchange="onLaborManDayChanged()">
        </div>
        <button class="btn btn-danger btn-sm" onclick="removeLaborRow(0)" style="margin-top:24px;">✕</button>
      </div>
    `;
    laborRowCount = 1;
  }
  
  document.querySelector('#modalDailyPlan .modal-title').textContent = '✏️ 编辑日计划';
  document.querySelector('#modalDailyPlan .modal-footer .btn-primary').textContent = '更新计划';

  showModal('modalDailyPlan');
  filterPlanFormByType();
}

async function deleteDailyPlan(planId) {
  const confirmed = await showConfirm('确定要删除此计划吗？', '删除计划', '🗑');
  if (!confirmed) return;
  
  const plans = M.PLANS[currentProjectId] || [];
  const idx = plans.findIndex(p => p.id === planId);
  if (idx > -1) {
    plans.splice(idx, 1);
    localStorage.setItem('daily_plans', JSON.stringify(M.PLANS));
    renderDailyPlanCard();
    showToast('计划已删除', 'success');
  }
}

// ============================================================
// 区域管理（可编辑：增删改）
// ============================================================

// 区域列表（可写）
let customAreas = {};  // { projectId: [{id, name}, ...] }

// 初始化区域列表：从 M.AREAS 加载到可写 customAreas
function initCustomAreas() {
  if (!M.AREAS) return;
  for (const [pid, areas] of Object.entries(M.AREAS)) {
    if (!customAreas[pid]) {
      customAreas[pid] = areas.map(a => ({ ...a, custom: false }));
    }
  }
  // 持久化：合并保存的自定义区域（不覆盖预置区域）
  try {
    const saved = localStorage.getItem('customAreas');
    if (saved) {
      const parsed = JSON.parse(saved);
      for (const [pid, savedAreas] of Object.entries(parsed)) {
        if (!customAreas[pid]) {
          customAreas[pid] = [];
        }
        // 合并自定义区域（去重）
        const existingIds = new Set(customAreas[pid].map(a => a.id));
        for (const area of savedAreas) {
          if (!existingIds.has(area.id)) {
            customAreas[pid].push({ ...area, custom: true });
          }
        }
      }
    }
  } catch (e) { /* ignore */ }
  // 暴露给 mock-data.js 的 getPage05Photos/getPage04Data 等函数做区域名查找
  if (window.MockData) window.MockData.customAreas = customAreas;
}
function saveCustomAreas() {
  try {
    const toSave = {};
    for (const [pid, areas] of Object.entries(customAreas)) {
      toSave[pid] = areas.filter(a => a.custom);
    }
    localStorage.setItem('customAreas', JSON.stringify(toSave));
  } catch (e) { /* ignore */ }
}

// 获取当前项目所有区域（合并 mock + 用户新增）
function getProjectAreas() {
  return customAreas[currentProjectId] || [];
}

// 查找区域（按 id）
function findAreaById(areaId) {
  const areas = getProjectAreas();
  return areas.find(a => a.id === areaId);
}

// 查找区域（按名称模糊匹配）
function findAreaByName(name) {
  if (!name) return null;
  const areas = getProjectAreas();
  const lower = name.toLowerCase();
  return areas.find(a => a.name === name || a.name.includes(name) || name.includes(a.name));
}

// 渲染区域 select 控件
function renderAreaOptions(selectId, selectedId = '') {
  const select = document.getElementById(selectId);
  if (!select) return;
  const areas = getProjectAreas();
  select.innerHTML = '<option value="">请选择区域</option>' +
    areas.map(a => `<option value="${a.id}" ${a.id === selectedId ? 'selected' : ''}>${a.name}${a.custom ? ' ★' : ''}</option>`).join('');
}

// 在指定 select 上方增加新区域（弹输入）
async function addCustomArea(selectId) {
  const name = await showPrompt('请输入新区域名称（如：VIP 接待室）：');
  if (!name || !name.trim()) return;
  const areas = getProjectAreas();
  // 检查是否已存在
  if (findAreaByName(name.trim())) {
    showToast(`"${name}" 已存在`, 'error');
    return;
  }
  // 自动生成 ID：取大写首字母
  let newId = name.trim().replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase() || 'A';
  // 避免重复
  let suffix = 0;
  let baseId = newId;
  while (areas.find(a => a.id === newId)) {
    suffix++;
    newId = baseId + suffix;
  }
  const newArea = { id: newId, name: name.trim(), custom: true };
  if (!customAreas[currentProjectId]) customAreas[currentProjectId] = [];
  customAreas[currentProjectId].push(newArea);
  saveCustomAreas();
  renderAreaOptions(selectId, newId);
  // 同步到后端
  fetch('http://localhost:3010/api/areas', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId: currentProjectId, id: newId, name: name.trim() })
  }).catch(err => console.warn('[自定义区域] 保存失败:', err));
  showToast(`已新增区域：${name}（ID: ${newId}）`, 'success');
}

// 删除区域
async function removeArea(areaId) {
  const areaName = findAreaById(areaId)?.name || areaId;
  const confirmed = await showConfirm(`确定删除区域 "${areaName}"？`, '删除区域', '🗑️');
  if (!confirmed) return;
  if (!customAreas[currentProjectId]) return;
  const area = customAreas[currentProjectId].find(a => a.id === areaId);
  if (area && !area.custom) {
    showToast('预置区域不能删除', 'error');
    return;
  }
  customAreas[currentProjectId] = customAreas[currentProjectId].filter(a => a.id !== areaId);
  saveCustomAreas();
  // 同步删除后端
  fetch('http://localhost:3010/api/areas/' + encodeURIComponent(currentProjectId) + '/' + encodeURIComponent(areaId), { method: 'DELETE' })
    .catch(err => console.warn('[自定义区域] 删除失败:', err));
  refreshAreaSelectors();
  renderAreasList();  // 刷新区域管理弹窗列表
  showToast('区域已删除', 'success');
}

// 重命名区域
async function renameArea(areaId) {
  const area = findAreaById(areaId);
  if (!area) return;
  const newName = await showPrompt('修改区域名称：', area.name);
  if (!newName || !newName.trim() || newName === area.name) return;
  if (findAreaByName(newName.trim())) {
    showToast(`"${newName}" 已存在`, 'error');
    return;
  }
  area.name = newName.trim();
  saveCustomAreas();
  refreshAreaSelectors();
  renderAreasList();  // 刷新区域管理弹窗列表
  showToast('区域已重命名', 'success');
}

// 刷新所有 select 的区域选项（用于删除/重命名后）
function refreshAreaSelectors() {
  // 语音录入
  if (document.getElementById('vp-area')) {
    const cur = document.getElementById('vp-area').value;
    renderAreaOptions('vp-area', cur);
  }
  // 拍照录入
  if (document.getElementById('pp-area-select')) {
    const cur = document.getElementById('pp-area-select').value;
    const areas = getProjectAreas();
    const sel = document.getElementById('pp-area-select');
    sel.innerHTML = '<option value="">请选择区域</option>' +
      areas.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
    sel.value = cur;
  }
  // 统一录入
  if (document.getElementById('m-area')) {
    const cur = document.getElementById('m-area').value;
    renderAreaOptions('m-area', cur);
  }
  if (document.getElementById('m-area-hint')) {
    document.getElementById('m-area-hint').style.display = 'none';
  }
}

// 打开区域管理弹窗
function manageAreas() {
  showModal('modalAreas');
  renderAreasList();
}

function renderAreasList() {
  const projectName = M.PROJECTS.find(p => p.id === currentProjectId)?.name || currentProjectId;
  document.getElementById('areasProjectName').textContent = `项目：${projectName}`;
  const areas = getProjectAreas();
  const container = document.getElementById('areasListContainer');
  if (areas.length === 0) {
    container.innerHTML = '<div style="padding:20px; text-align:center; color:#94a3b8;">暂无区域</div>';
    return;
  }
  container.innerHTML = areas.map(a => `
    <div style="display:flex; align-items:center; gap:6px; padding:6px 10px; border-bottom:1px solid #f1f5f9;">
      <span style="flex:0 0 60px; font-family:monospace; font-size:11px; color:#64748b;">${a.id}</span>
      <span style="flex:1; font-size:12px;">${a.name}${a.custom ? ' <span style="color:#f59e0b; font-size:10px;">★自定义</span>' : ' <span style="color:#94a3b8; font-size:10px;">预置</span>'}</span>
      <button class="btn btn-sm btn-ghost" onclick="renameArea('${a.id}')" title="重命名">✏️</button>
      ${a.custom ? `<button class="btn btn-sm btn-danger" onclick="removeArea('${a.id}')" title="删除">🗑</button>` : ''}
    </div>
  `).join('');
}

// 从管理界面添加
function addAreaFromManager() {
  const name = document.getElementById('newAreaName').value.trim();
  const customId = document.getElementById('newAreaId').value.trim().toUpperCase();
  if (!name) {
    showToast('请输入区域名称', 'error');
    return;
  }
  if (findAreaByName(name)) {
    showToast(`"${name}" 已存在`, 'error');
    return;
  }
  const areas = getProjectAreas();
  let newId = customId || name.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase() || 'A';
  let suffix = 0;
  let baseId = newId;
  while (areas.find(a => a.id === newId)) {
    suffix++;
    newId = baseId + suffix;
  }
  const newArea = { id: newId, name, custom: true };
  if (!customAreas[currentProjectId]) customAreas[currentProjectId] = [];
  customAreas[currentProjectId].push(newArea);
  saveCustomAreas();
  renderAreasList();
  refreshAreaSelectors();
  document.getElementById('newAreaName').value = '';
  document.getElementById('newAreaId').value = '';
  showToast(`已新增：${name}（${newId}）`, 'success');
}

// ============================================================
// 语音录入
// ============================================================
function openVoiceInput() {
  openUnifiedInput('voice');
}

function toggleRecording() {
  const btn = document.getElementById('recordingBtn');
  const hint = document.getElementById('recordingHint');

  if (btn.classList.contains('recording')) {
    btn.classList.remove('recording');
    hint.textContent = '点击麦克风开始录音';
    mockRecordingComplete();
  } else {
    btn.classList.add('recording');
    hint.textContent = '录音中... 说"停止"或点击结束';
    setTimeout(() => {
      if (btn.classList.contains('recording')) {
        toggleRecording();
      }
    }, 2500);
  }
}

function mockRecordingComplete() {
  const mockTexts = [
    '员工餐厅区天花吊顶龙骨安装，张师傅带了两个人在做，进度到 80%',
    '高管办公区墙面基层处理完成 50%，王师傅负责',
    '多功能厅日常安全巡检，一切正常',
    '商业展示区临时用电有点问题，需要整改',
    'VIP 接待室墙面找平开始施工，李师傅带一人'
  ];

  const randomText = mockTexts[Math.floor(Math.random() * mockTexts.length)];
  document.getElementById('voiceText').value = randomText;

  parseVoiceText(randomText);
}

// 核心：解析语音（调 LLM 真实接口，失败降级 mock）
async function parseVoiceText(text) {
  if (!text || !text.trim()) return;
  const hint = document.getElementById('recordingHint');
  if (hint) hint.textContent = '⏳ AI 正在解析...';

  const areas = getProjectAreas();
  const areasPayload = areas.map(a => ({ id: a.id, name: a.name }));
  const plans = M.PLANS[currentProjectId] || [];

  const requestBody = {
    text: text,
    projectId: currentProjectId,
    areas: areasPayload,
    plans: plans.map(p => ({ id: p.id, taskName: p.taskName, areaId: p.areaId, buildingNo: p.buildingNo, floorNo: p.floorNo, progress: p.progress }))
  };

  const t0 = Date.now();
  try {
    const r = await fetch(API_BASE + '/parse-voice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    if (!r.ok) throw new Error('HTTP ' + r.status);
    const parsed = await r.json();

    applyVoiceParseResult(parsed);
    if (hint) hint.textContent = `🤖 LLM 真实 · ${parsed.latencyMs || 0}ms · 来源 ${parsed.source}`;
  } catch (e) {
    if (hint) hint.textContent = `❌ LLM 连接失败（${e.message}），请手动填写`;
    showToast('LLM 解析失败：' + e.message, 'error');
  }
}

// 把解析结果填到表单
function applyVoiceParseResult(parsed) {
  document.getElementById('vp-type').value = parsed.type || 'progress';
  document.getElementById('vp-task').value = parsed.payload?.taskName || '';
  document.getElementById('vp-owner').value = parsed.payload?.owner || '';
  document.getElementById('vp-progress').value = parsed.payload?.progress || '';
  document.getElementById('vp-headcount').value = parsed.payload?.headcount || '';
  document.getElementById('vp-caption').value = parsed.caption || parsed.payload?.caption || '';
  document.getElementById('vp-confidence').textContent = `${((parsed.confidence || 0) * 100).toFixed(0)}%`;
  document.getElementById('vp-planId').value = parsed.planId || '';

  // 关键：处理 LLM 识别出的"区域"——可能是名字（"VIP 接待室"）也可能是 ID（"A1"）
  const areaRef = parsed.areaId || parsed.areaName || '';
  handleParsedArea(areaRef);

  document.getElementById('voiceParsePreview').style.display = 'block';
  document.getElementById('voiceSaveBtn').disabled = false;
}

// 智能处理 LLM 识别出的区域
// 可能：1) 是已有 ID  2) 是已有名字  3) 是新名字（询问添加）  4) 未知
function handleParsedArea(areaRef) {
  const hint = document.getElementById('vp-area-hint');
  // 先按 ID 查
  let area = findAreaById(areaRef);
  if (area) {
    renderAreaOptions('vp-area', area.id);
    if (hint) { hint.style.display = 'none'; }
    return;
  }
  // 按名字查
  area = findAreaByName(areaRef);
  if (area) {
    renderAreaOptions('vp-area', area.id);
    if (hint) { hint.style.display = 'none'; }
    return;
  }
  // 都查不到 → 视为新区域
  if (!areaRef || !areaRef.trim()) {
    renderAreaOptions('vp-area', '');
    if (hint) { hint.style.display = 'none'; }
    return;
  }
  // 询问用户
  showAreaConfirmDialog(areaRef);
}

// 弹询问："LLM 识别到新区域 [VIP 接待室]，要添加吗？"
function showAreaConfirmDialog(areaName, selectId = 'vp-area') {
  const hintId = `${selectId}-hint`;
  const existingMatch = findAreaByName(areaName);
  if (existingMatch) {
    renderAreaOptions(selectId, existingMatch.id);
    return;
  }
  // 重建 select：标出"建议新增"项
  const select = document.getElementById(selectId);
  if (!select) return;
  const areas = getProjectAreas();
  select.innerHTML =
    '<option value="">请选择区域</option>' +
    `<option value="__NEW__" style="background:#fef3c7; color:#92400e;">＋ 新增 "${areaName}"</option>` +
    areas.map(a => `<option value="${a.id}">${a.name}</option>`).join('');

  // 提示文字
  const hint = document.getElementById(hintId);
  if (hint) {
    hint.style.display = 'block';
    hint.innerHTML = `💡 LLM 识别到新区域 <strong>"${areaName}"</strong>。请选择：
      <button class="btn btn-sm btn-primary" style="margin-left:6px;" onclick="confirmAddNewArea('${areaName.replace(/'/g, "\\'")}', '${selectId}')">➕ 添加为新区域</button>
      <button class="btn btn-sm btn-ghost" onclick="dismissNewAreaHint('${selectId}')">忽略（从已有选）</button>
    `;
  }
}

// 确认添加新区域
function confirmAddNewArea(name, selectId) {
  const areas = getProjectAreas();
  let newId = name.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase() || 'A';
  let suffix = 0;
  let baseId = newId;
  while (areas.find(a => a.id === newId)) {
    suffix++;
    newId = baseId + suffix;
  }
  const newArea = { id: newId, name, custom: true };
  if (!customAreas[currentProjectId]) customAreas[currentProjectId] = [];
  customAreas[currentProjectId].push(newArea);
  saveCustomAreas();
  renderAreaOptions(selectId, newId);
  const hint = document.getElementById(`${selectId}-hint`);
  if (hint) hint.style.display = 'none';
  showToast(`已新增区域：${name}（${newId}）`, 'success');
}

function dismissNewAreaHint(selectId = 'vp-area') {
  renderAreaOptions(selectId, '');
  const hint = document.getElementById(`${selectId}-hint`);
  if (hint) hint.style.display = 'none';
}

// 重新识别（用现有文本再次调 LLM）
async function reparseVoiceText() {
  const text = document.getElementById('voiceText').value;
  if (!text.trim()) {
    showToast('请先输入或录制语音内容', 'error');
    return;
  }
  await parseVoiceText(text);
  showToast('已重新识别', 'success');
}

function saveVoiceEvent() {
  const text = document.getElementById('voiceText').value;
  const date = document.getElementById('voiceDate').value;
  const time = document.getElementById('voiceTime').value;
  
  if (!date) {
    showToast('请选择日期', 'error');
    return;
  }
  
  const type = document.getElementById('vp-type').value;
  const areaId = document.getElementById('vp-area').value;
  
  if (!type || !areaId) {
    showToast('请填写事件类型和区域', 'error');
    return;
  }
  
  const event = {
    id: `E${String(Date.now()).slice(-3)}`,
    projectId: currentProjectId,
    date: date,
    time: time || new Date().toTimeString().slice(0, 5),
    type: type,
    areaId: areaId,
    planId: document.getElementById('vp-planId').value || undefined,
    payload: {
      taskName: document.getElementById('vp-task').value,
      owner: document.getElementById('vp-owner').value,
      progress: fixProgress(document.getElementById('vp-progress').value),
      headcount: parseInt(document.getElementById('vp-headcount').value) || 0,
      caption: document.getElementById('vp-caption').value
    },
    submitter: '张明',
    source: 'voice',
    confidence: parseFloat(document.getElementById('vp-confidence').textContent) / 100 || 0.85,
    status: 'draft',
    voiceText: text,
    note: document.getElementById('vp-note').value
  };
  
  M.EVENTS.unshift(event);
  if (M.saveEventsToStorage) M.saveEventsToStorage();
  
  closeModal('modalVoice');
  renderFilteredEvents();
  updateCalendar();
  renderStats();
  showToast('语音事件已保存', 'success');
}

// ============================================================
// 拍照录入（旧版重定向到统一录入）
// ============================================================
function openPhotoInput() {
  openUnifiedInput('photo');
}

function showPhotoOptions() {
  document.getElementById('photoOptionsMenu').style.display = 'block';
}

function closePhotoOptions() {
  document.getElementById('photoOptionsMenu').style.display = 'none';
}

function doCapture() {
  closePhotoOptions();
  document.getElementById('photoCaptureInput').click();
}

function doSelect() {
  closePhotoOptions();
  document.getElementById('photoFileInput').click();
}

function doRetake() {
  document.getElementById('photoPreviewArea').style.display = 'none';
  document.getElementById('photoUploadZone').style.display = 'block';
  document.getElementById('photoPreviewImg').src = '';
  document.getElementById('photoFileInput').value = '';
  document.getElementById('photoCaptureInput').value = '';
  document.getElementById('pp-voice-text').value = '';
  document.getElementById('photoSaveBtn').disabled = true;
}

// 拍照界面的语音录音功能
let photoVoiceRecording = false;

function togglePhotoVoiceRecording() {
  const btn = document.getElementById('photoVoiceBtn');
  const hint = document.getElementById('photoVoiceHint');

  if (photoVoiceRecording) {
    btn.classList.remove('recording');
    hint.textContent = '点击录音';
    photoVoiceRecording = false;
    mockPhotoVoiceRecordingComplete();
  } else {
    btn.classList.add('recording');
    hint.textContent = '录音中... 点击停止';
    photoVoiceRecording = true;
    setTimeout(() => {
      if (photoVoiceRecording) {
        togglePhotoVoiceRecording();
      }
    }, 3000);
  }
}

function mockPhotoVoiceRecordingComplete() {
  const mockTexts = [
    '这是员工餐厅的天花吊顶，龙骨已经安装完成',
    '高管办公区墙面基层处理，进度大概一半',
    '多功能厅安全检查，灭火器需要更换',
    '商业展示区地面铺设，大理石材料进场',
    'VIP接待室电路改造，电工师傅在施工'
  ];
  const randomText = mockTexts[Math.floor(Math.random() * mockTexts.length)];
  const currentText = document.getElementById('pp-voice-text').value;
  document.getElementById('pp-voice-text').value = currentText ? currentText + ' ' + randomText : randomText;
  
  // 自动触发解析
  setTimeout(() => {
    parseVoiceText();
  }, 500);
}

// 单独解析拍照界面的语音文本内容
async function parseVoiceTextForPhoto() {
  const voiceText = document.getElementById('pp-voice-text').value.trim();
  if (!voiceText) {
    showToast('请先输入语音描述', 'warning');
    return;
  }
  
  const hint = document.getElementById('pp-hint');
  if (hint) {
    hint.textContent = '⏳ 正在解析语音内容...';
  }
  
  const plans = M.PLANS[currentProjectId] || [];
  try {
    const response = await fetch(API_BASE + '/parse-photo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        caption: voiceText,
        projectId: currentProjectId,
        areas: getProjectAreas() || [],
        type: 'text_only',
        plans: plans.map(p => ({ id: p.id, taskName: p.taskName, areaId: p.areaId, buildingNo: p.buildingNo, floorNo: p.floorNo, progress: p.progress }))
      })
    }).catch(error => {
      throw new Error('网络错误: ' + error.message);
    });
    
    if (!response.ok) {
      throw new Error('HTTP ' + response.status);
    }
    
    const result = await response.json();
    
    document.getElementById('pp-type').value = result.type || 'progress';
    document.getElementById('pp-area').value = result.areaId || '';
    document.getElementById('pp-task').value = result.taskHint || result.payload?.taskName || '';
    document.getElementById('pp-owner').value = result.payload?.owner || '';
    document.getElementById('pp-progress').value = result.payload?.progress || '';
    document.getElementById('pp-headcount').value = result.payload?.headcount || '';
    document.getElementById('pp-planId').value = result.planId || '';
    if (!document.getElementById('pp-caption').value) {
      document.getElementById('pp-caption').value = result.caption || voiceText;
    }
    document.getElementById('pp-confidence').textContent = `${(result.confidence * 100).toFixed(0)}%`;
    if (hint) hint.textContent = result.source === 'llm' 
      ? `🤖 LLM 解析完成` 
      : `⚙️ Mock 模式`;
    
    // 处理识别到的新区域
    if (result.areaName && !result.areaId) {
      showAreaConfirmDialog(result.areaName, 'pp-area');
    }
    
    showToast('语音内容解析完成', 'success');
    
  } catch (error) {
    console.error('语音解析失败:', error);
    if (hint) hint.textContent = `❌ LLM 连接失败（${error.message}），请手动填写`;
    showToast('LLM 解析失败：' + error.message, 'error');
  }
  
  document.getElementById('photoSaveBtn').disabled = false;
}

// 逐字显示文本动画
function typeText(element, text, speed = 30) {
  return new Promise((resolve) => {
    if (element.tagName === 'TEXTAREA' || element.tagName === 'INPUT') {
      element.value = '';
    } else {
      element.textContent = '';
    }
    let index = 0;
    const interval = setInterval(() => {
      if (index < text.length) {
        if (element.tagName === 'TEXTAREA' || element.tagName === 'INPUT') {
          element.value += text[index];
        } else {
          element.textContent += text[index];
        }
        index++;
      } else {
        clearInterval(interval);
        resolve();
      }
    }, speed);
  });
}

// 内容优化函数
let originalVoiceText = '';
async function optimizeVoiceText() {
  const textarea = document.getElementById('pp-voice-text');
  const hint = document.getElementById('optimizeHint');
  const optimizeBtn = document.getElementById('optimizeBtn');
  const voiceText = textarea.value.trim();
  
  if (!voiceText) {
    showToast('请先输入文本内容', 'warning');
    return;
  }
  
  // 保存原始内容
  if (originalVoiceText !== voiceText) {
    originalVoiceText = voiceText;
  }
  
  // 显示优化中状态
  optimizeBtn.disabled = true;
  optimizeBtn.innerHTML = '⏳ 优化中...';
  hint.textContent = '正在优化文本内容...';
  hint.style.display = 'block';
  
  // 添加柔光过渡动画
  textarea.classList.add('textarea-animating');
  
  // 创建扫描线效果 - 创建在textarea上方
  const wrapper = document.createElement('div');
  wrapper.className = 'animation-wrapper';
  wrapper.style.width = textarea.offsetWidth + 'px';
  wrapper.style.height = textarea.offsetHeight + 'px';
  wrapper.style.top = textarea.offsetTop + 'px';
  wrapper.style.left = textarea.offsetLeft + 'px';
  
  const scanLine = document.createElement('div');
  scanLine.className = 'scan-line';
  scanLine.style.height = textarea.offsetHeight + 'px';
  
  const parent = textarea.parentElement;
  parent.style.position = 'relative';
  parent.appendChild(wrapper);
  wrapper.appendChild(scanLine);
  
  try {
    // 等待扫描动画完成（1秒）
    await new Promise(r => setTimeout(r, 1000));
    
    // 移除扫描线和包装器
    wrapper.remove();
    
    // 旧文字淡化效果
    textarea.classList.add('textarea-fading');
    
    await new Promise(r => setTimeout(r, 400));
    
    // 调用后端优化接口
    const response = await fetch(API_BASE + '/optimize-text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: voiceText,
        projectId: currentProjectId
      })
    });
    
    const result = await response.json();
    
    if (result.optimizedText) {
      // 清除淡化动画，添加优化完成动画
      textarea.classList.remove('textarea-fading');
      textarea.classList.add('textarea-optimized');
      
      // 逐字显示效果
      await typeText(textarea, result.optimizedText, 35);
      
      hint.innerHTML = `✨ 优化完成！<a href="#" onclick="restoreOriginalText()" style="color:#00adef; text-decoration:underline;">点击恢复原文</a>`;
      hint.style.display = 'block';
      showToast('文本内容已优化', 'success');
    } else {
      textarea.classList.remove('textarea-fading');
      hint.textContent = '优化失败，保持原内容';
      setTimeout(() => { hint.style.display = 'none'; }, 3000);
    }
    
  } catch (error) {
    console.error('文本优化失败:', error);
    textarea.classList.remove('textarea-fading');
    
    // 降级到本地mock优化
    const optimized = mockOptimizeText(voiceText);
    const optimizedText = optimized.optimizedText || optimized;
    
    // 逐字显示效果
    await typeText(textarea, optimizedText, 35);
    
    hint.innerHTML = `✨ 本地优化完成！<a href="#" onclick="restoreOriginalText()" style="color:#00adef; text-decoration:underline;">点击恢复原文</a>`;
    hint.style.display = 'block';
    showToast('文本优化完成（本地模式）', 'success');
  } finally {
    // 清除动画类
    textarea.classList.remove('textarea-animating', 'textarea-fading', 'textarea-optimized');
    optimizeBtn.disabled = false;
    optimizeBtn.innerHTML = '✨ 内容优化';
  }
}

// 恢复原始文本
function restoreOriginalText() {
  const textarea = document.getElementById('pp-voice-text');
  const hint = document.getElementById('optimizeHint');
  
  if (originalVoiceText) {
    textarea.value = originalVoiceText;
    hint.textContent = '已恢复原文';
    setTimeout(() => { hint.style.display = 'none'; }, 2000);
  }
}

// 清空语音文本
function clearVoiceText() {
  document.getElementById('pp-voice-text').value = '';
  originalVoiceText = '';
  document.getElementById('optimizeHint').style.display = 'none';
}

// 语音录入界面的内容优化函数
let originalVoiceTextForVoice = '';
async function optimizeVoiceTextForVoice() {
  const textarea = document.getElementById('voiceText');
  const hint = document.getElementById('voiceOptimizeHint');
  const optimizeBtn = document.getElementById('voiceOptimizeBtn');
  const voiceText = textarea.value.trim();
  
  if (!voiceText) {
    showToast('请先输入文本内容', 'warning');
    return;
  }
  
  // 保存原始内容
  if (originalVoiceTextForVoice !== voiceText) {
    originalVoiceTextForVoice = voiceText;
  }
  
  // 显示优化中状态
  optimizeBtn.disabled = true;
  optimizeBtn.innerHTML = '⏳ 优化中...';
  hint.textContent = '正在优化文本内容...';
  hint.style.display = 'block';
  
  // 添加柔光过渡动画
  textarea.classList.add('textarea-animating');
  
  // 创建扫描线效果 - 创建在textarea上方
  const wrapper = document.createElement('div');
  wrapper.className = 'animation-wrapper';
  wrapper.style.width = textarea.offsetWidth + 'px';
  wrapper.style.height = textarea.offsetHeight + 'px';
  wrapper.style.top = textarea.offsetTop + 'px';
  wrapper.style.left = textarea.offsetLeft + 'px';
  
  const scanLine = document.createElement('div');
  scanLine.className = 'scan-line';
  scanLine.style.height = textarea.offsetHeight + 'px';
  
  const parent = textarea.parentElement;
  parent.style.position = 'relative';
  parent.appendChild(wrapper);
  wrapper.appendChild(scanLine);
  
  try {
    // 等待扫描动画完成（1秒）
    await new Promise(r => setTimeout(r, 1000));
    
    // 移除扫描线和包装器
    wrapper.remove();
    
    // 旧文字淡化效果
    textarea.classList.add('textarea-fading');
    
    await new Promise(r => setTimeout(r, 400));
    
    // 调用后端优化接口
    const response = await fetch(API_BASE + '/optimize-text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: voiceText,
        projectId: currentProjectId
      })
    });
    
    const result = await response.json();
    
    if (result.optimizedText) {
      // 清除淡化动画，添加优化完成动画
      textarea.classList.remove('textarea-fading');
      textarea.classList.add('textarea-optimized');
      
      // 逐字显示效果
      await typeText(textarea, result.optimizedText, 35);
      
      hint.innerHTML = `✨ 优化完成！<a href="#" onclick="restoreOriginalTextForVoice()" style="color:#00adef; text-decoration:underline;">点击恢复原文</a>`;
      hint.style.display = 'block';
      showToast('文本内容已优化', 'success');
    } else {
      textarea.classList.remove('textarea-fading');
      hint.textContent = '优化失败，保持原内容';
      setTimeout(() => { hint.style.display = 'none'; }, 3000);
    }
    
  } catch (error) {
    console.error('文本优化失败:', error);
    textarea.classList.remove('textarea-fading');
    
    // 降级到本地mock优化
    const optimized = mockOptimizeText(voiceText);
    const optimizedText = optimized.optimizedText || optimized;
    
    // 逐字显示效果
    await typeText(textarea, optimizedText, 35);
    
    hint.innerHTML = `✨ 本地优化完成！<a href="#" onclick="restoreOriginalTextForVoice()" style="color:#00adef; text-decoration:underline;">点击恢复原文</a>`;
    hint.style.display = 'block';
    showToast('文本优化完成（本地模式）', 'success');
  } finally {
    // 清除动画类
    textarea.classList.remove('textarea-animating', 'textarea-fading', 'textarea-optimized');
    optimizeBtn.disabled = false;
    optimizeBtn.innerHTML = '✨ 内容优化';
  }
}

// 恢复语音录入界面的原始文本
function restoreOriginalTextForVoice() {
  const textarea = document.getElementById('voiceText');
  const hint = document.getElementById('voiceOptimizeHint');
  
  if (originalVoiceTextForVoice) {
    textarea.value = originalVoiceTextForVoice;
    hint.textContent = '已恢复原文';
    setTimeout(() => { hint.style.display = 'none'; }, 2000);
  }
}

// Mock文本优化（本地降级 — 无 LLM 时直接返回原文）
function mockOptimizeText(text) {
  return text;
}

function handlePhotoUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  // 验证文件类型
  if (!file.type.startsWith('image/')) {
    showToast('请选择图片文件', 'error');
    return;
  }

  // 隐藏选择菜单
  closePhotoOptions();

  // 显示预览
  const reader = new FileReader();
  reader.onload = function(e) {
    const previewUrl = e.target.result;
    document.getElementById('photoPreviewImg').src = previewUrl;
    document.getElementById('vlm-photo').src = previewUrl;
    document.getElementById('photoUploadZone').style.display = 'none';
    document.getElementById('photoPreviewArea').style.display = 'block';
    // 立即显示 VLM 可视化（照片 + 动画同框）
    const vlmVis = document.getElementById('vlm-visualization');
    if (vlmVis) vlmVis.style.display = 'block';
    const simple = document.getElementById('simple-preview');
    if (simple) simple.style.display = 'none';
    showVLMVisualization();
    const hint = document.getElementById('pp-hint');
    if (hint) hint.textContent = '⏳ AI 正在识别...';

    // 上传到后端进行 AI 识别
    uploadAndParsePhoto(file);
  };
  reader.readAsDataURL(file);

  // 清空 input 值，允许重复选择同一文件
  event.target.value = '';
}

// VLM注意力热力图可视化动画
let vlmAnimationRunning = false;
let vlmAnimationFrame = null;
let vlmTokens = ['施工', '区域', '任务', '进度', '材料', '安全'];
let currentTokenIndex = 0;
let heatSpots = [];

function showVLMVisualization() {
  const vlmVis = document.getElementById('vlm-visualization');
  const simplePreview = document.getElementById('simple-preview');
  
  vlmVis.style.display = 'block';
  simplePreview.style.display = 'none';
  
  // 初始化网格
  initAttentionGrid();
  
  // 初始化粒子流
  initParticleFlow();
  
  // 开始动画
  vlmAnimationRunning = true;
  currentTokenIndex = 0;
  startVLMAnimation();
}

function initAttentionGrid() {
  const gridContainer = document.getElementById('attention-grid');
  gridContainer.innerHTML = '';
  
  const gridSize = 4; // 4x4网格
  const cellWidth = 100 / gridSize;
  const cellHeight = 100 / gridSize;
  
  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      const cell = document.createElement('div');
      cell.className = 'attention-grid-cell';
      cell.style.left = `${col * cellWidth}%`;
      cell.style.top = `${row * cellHeight}%`;
      cell.style.width = `${cellWidth}%`;
      cell.style.height = `${cellHeight}%`;
      gridContainer.appendChild(cell);
    }
  }
}

function initParticleFlow() {
  const flowContainer = document.getElementById('particle-flow');
  flowContainer.innerHTML = '';
  
  // 添加数据流线条
  const line = document.createElement('div');
  line.className = 'flow-line';
  line.style.width = '100%';
  line.style.top = '50%';
  line.style.transform = 'translateY(-50%)';
  flowContainer.appendChild(line);
  
  // 添加粒子
  for (let i = 0; i < 5; i++) {
    const particle = document.createElement('div');
    particle.className = 'particle';
    particle.style.top = '50%';
    particle.style.transform = 'translateY(-50%)';
    particle.style.animationDelay = `${i * 0.4}s`;
    flowContainer.appendChild(particle);
  }
}

function startVLMAnimation() {
  if (!vlmAnimationRunning) return;
  
  // 更新提问文本
  const questionEl = document.getElementById('vlm-question');
  questionEl.textContent = `识别: "${vlmTokens[currentTokenIndex]}"...`;
  
  // 更新热力图
  updateHeatMap(currentTokenIndex);
  
  // 更新网格激活状态
  updateGridActivation(currentTokenIndex);
  
  // 切换到下一个token
  currentTokenIndex = (currentTokenIndex + 1) % vlmTokens.length;
  
  // 继续动画
  vlmAnimationFrame = setTimeout(startVLMAnimation, 1500);
}

function updateHeatMap(tokenIndex) {
  const heatContainer = document.getElementById('heat-spots');
  
  // 清除旧的热力点
  while (heatContainer.firstChild) {
    heatContainer.removeChild(heatContainer.firstChild);
  }
  
  // 生成新的热力点（基于token位置）
  const positions = [
    { x: 25, y: 25 }, { x: 75, y: 25 },
    { x: 25, y: 75 }, { x: 75, y: 75 },
    { x: 50, y: 50 }
  ];
  
  positions.forEach((pos, index) => {
    // 根据注意力权重计算颜色（暖色高注意力，冷色低注意力）
    const baseWeight = 0.3 + Math.sin(tokenIndex * 0.8 + index * 0.5) * 0.3;
    const weight = Math.min(1, Math.max(0.1, baseWeight));
    
    const spot = document.createElement('div');
    spot.className = 'heat-spot';
    
    // 暖色（红橙）= 高注意力，冷色（蓝紫）= 低注意力
    const hue = weight > 0.6 ? 
      (10 + (1 - weight) * 20) :  // 红橙色范围
      (220 + (1 - weight) * 60);  // 蓝紫色范围
    
    spot.style.left = `${pos.x}%`;
    spot.style.top = `${pos.y}%`;
    spot.style.width = `${20 + weight * 30}%`;
    spot.style.height = `${20 + weight * 30}%`;
    spot.style.transform = 'translate(-50%, -50%)';
    spot.style.background = `hsla(${hue}, 80%, ${50 + weight * 20}%, ${0.3 + weight * 0.3})`;
    spot.style.boxShadow = `0 0 ${20 + weight * 20}px hsla(${hue}, 80%, 60%, ${0.3 + weight * 0.4})`;
    
    heatContainer.appendChild(spot);
  });
}

function updateGridActivation(tokenIndex) {
  const cells = document.querySelectorAll('.attention-grid-cell');
  cells.forEach((cell, index) => {
    // 根据token和cell位置计算激活状态
    const activation = Math.sin(tokenIndex * 0.5 + index * 0.3) * 0.5 + 0.5;
    cell.style.opacity = 0.3 + activation * 0.7;
    cell.style.borderColor = activation > 0.5 ? 
      'rgba(249, 115, 22, 0.4)' : 'rgba(0, 173, 239, 0.2)';
    cell.style.background = activation > 0.5 ? 
      'rgba(249, 115, 22, 0.08)' : 'rgba(0, 173, 239, 0.03)';
  });
}

function hideVLMVisualization() {
  vlmAnimationRunning = false;
  if (vlmAnimationFrame) {
    clearTimeout(vlmAnimationFrame);
    vlmAnimationFrame = null;
  }
  
  const vlmVis = document.getElementById('vlm-visualization');
  const simplePreview = document.getElementById('simple-preview');
  
  vlmVis.style.display = 'none';
  simplePreview.style.display = 'block';
}

async function uploadAndParsePhoto(file) {
  const hint = document.getElementById('pp-hint');
  if (hint) {
    hint.textContent = '⏳ AI 正在识别...';
  }
  
  try {
    // 将文件转换为 base64
    const base64Data = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    
    // 获取语音辅助描述
    const voiceText = document.getElementById('pp-voice-text').value.trim();
    
    const response = await fetch(API_BASE + '/parse-photo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageBase64: base64Data,
        caption: voiceText,  // 将语音文本作为caption发送
        projectId: currentProjectId,
        areas: getProjectAreas() || [],
        type: 'photo'
      })
    }).catch(error => {
      throw new Error('网络错误: ' + error.message);
    });
    
    if (!response.ok) {
      throw new Error('HTTP ' + response.status);
    }
    
    const result = await response.json();
    
    document.getElementById('pp-type').value = result.type || 'progress';
    document.getElementById('pp-area').value = result.areaId || '';
    document.getElementById('pp-task').value = result.taskHint || result.payload?.taskName || '';
    document.getElementById('pp-owner').value = result.payload?.owner || '';
    document.getElementById('pp-progress').value = result.payload?.progress || '';
    document.getElementById('pp-headcount').value = result.payload?.headcount || '';
    document.getElementById('pp-caption').value = result.caption || '';
    document.getElementById('pp-confidence').textContent = `${(result.confidence * 100).toFixed(0)}%`;
    if (hint) hint.textContent = result.source === 'llm' 
      ? `🤖 LLM 真实识别 · ${(result.latencyMs || 0)}ms` 
      : `⚙️ Mock 模式`;
    
    // 处理识别到的新区域
    if (result.areaName && !result.areaId) {
      showAreaConfirmDialog(result.areaName, 'pp-area');
    }
    
  } catch (error) {
    console.error('照片识别失败:', error);
    if (hint) hint.textContent = `❌ LLM 连接失败（${error.message}），请手动填写`;
    showToast('LLM 解析失败：' + error.message, 'error');
  }
  
  // 识别完成，隐藏VLM可视化动画
  hideVLMVisualization();
  
  populateAreaSelects('pp-area');
  document.getElementById('photoSaveBtn').disabled = false;
}

async function reparsePhoto() {
  const previewImg = document.getElementById('photoPreviewImg');
  if (!previewImg.src) {
    showToast('请先上传照片', 'warning');
    return;
  }
  
  const hint = document.getElementById('pp-hint');
  if (hint) hint.textContent = '⏳ AI 正在重新识别...';
  
  // 重新显示VLM可视化动画
  showVLMVisualization();
  
  const base64Data = previewImg.src.split(',')[1];
  
  // 获取语音辅助描述
  const voiceText = document.getElementById('pp-voice-text').value.trim();
  
  try {
    const response = await fetch(API_BASE + '/parse-photo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageBase64: base64Data,
        caption: voiceText,  // 将语音文本作为caption发送
        projectId: currentProjectId,
        areas: getProjectAreas() || [],
        type: 'photo'
      })
    }).catch(error => {
      throw new Error('网络错误: ' + error.message);
    });
    
    if (!response.ok) {
      throw new Error('HTTP ' + response.status);
    }
    
    const result = await response.json();
    
    document.getElementById('pp-type').value = result.type || 'progress';
    document.getElementById('pp-area').value = result.areaId || '';
    document.getElementById('pp-task').value = result.taskHint || result.payload?.taskName || '';
    document.getElementById('pp-owner').value = result.payload?.owner || '';
    document.getElementById('pp-progress').value = result.payload?.progress || '';
    document.getElementById('pp-headcount').value = result.payload?.headcount || '';
    document.getElementById('pp-caption').value = result.caption || '';
    document.getElementById('pp-confidence').textContent = `${(result.confidence * 100).toFixed(0)}%`;
    if (hint) hint.textContent = result.source === 'llm' 
      ? `🤖 LLM 重新识别成功 · ${(result.latencyMs || 0)}ms` 
      : `⚙️ Mock 模式`;
    showToast('重新识别完成', 'success');
    
    // 处理识别到的新区域
    if (result.areaName && !result.areaId) {
      showAreaConfirmDialog(result.areaName, 'pp-area');
    }
    
  } catch (error) {
    console.error('重新识别失败:', error);
    if (hint) hint.textContent = `❌ LLM 连接失败（${error.message}），请手动填写`;
    showToast('LLM 重新识别失败：' + error.message, 'error');
  }
  
  // 识别完成，隐藏VLM可视化动画
  hideVLMVisualization();
  
  populateAreaSelects('pp-area');
  document.getElementById('photoSaveBtn').disabled = false;
}

function savePhotoEvent() {
  const type = document.getElementById('pp-type').value;
  const areaId = document.getElementById('pp-area').value;
  const note = document.getElementById('pp-note').value;
  
  if (!areaId) {
    showToast('请选择区域', 'error');
    return;
  }
  
  // 获取日期：优先使用表单中的日期，否则使用选中日期，最后使用今天
  const formDate = document.getElementById('pp-date').value;
  const formTime = document.getElementById('pp-time').value;
  const eventDate = formDate || (selectedDates.length > 0 ? selectedDates[0] : M.TODAY);
  
  // 获取表单字段
  const taskName = document.getElementById('pp-task').value;
  const owner = document.getElementById('pp-owner').value;
  const progress = fixProgress(document.getElementById('pp-progress').value);
  const headcount = parseInt(document.getElementById('pp-headcount').value) || 0;
  const caption = document.getElementById('pp-caption').value;

  const event = {
    id: `E${String(Date.now()).slice(-3)}`,
    projectId: currentProjectId,
    date: eventDate,
    time: formTime || new Date().toTimeString().slice(0, 5),
    type,
    areaId,
    planId: document.getElementById('pp-planId').value || undefined,
    payload: {
      taskName: taskName || caption || '拍照记录',
      owner,
      progress,
      headcount,
      description: caption,
      result: '正常'
    },
    submitter: '张明',
    source: 'photo',
    confidence: parseFloat(document.getElementById('pp-confidence').textContent) / 100 || 0.85,
    status: 'draft',
    photos: [{ id: `P${String(Date.now()).slice(-3)}`, caption: caption || '现场照片', area: areaId }],
    note
  };
  
  M.EVENTS.unshift(event);
  if (M.saveEventsToStorage) M.saveEventsToStorage();

  closeModal('modalPhoto');
  renderFilteredEvents();
  updateCalendar();
  renderStats();
  showToast('照片事件已保存', 'success');
}

// ============================================================
// 统一录入（替换语音/拍照/手动三个独立模态）
// ============================================================

let _unifiedMode = 'manual'; // 'manual' | 'voice' | 'photo'

function openUnifiedInput(mode = 'manual', planId) {
  _unifiedMode = mode;
  _prevPlanId = '';

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  const nowStr = `${String(today.getHours()).padStart(2,'0')}:${String(today.getMinutes()).padStart(2,'0')}`;
  const defaultDate = selectedDates.length > 0 ? selectedDates[0] : todayStr;

  document.getElementById('m-date').value = defaultDate;
  document.getElementById('m-time').value = nowStr;
  // 如果指定了 planId，从计划推断事件类型
  if (planId) {
    const projectPlans = (M.PLANS && M.PLANS[currentProjectId]) || [];
    const plan = projectPlans.find(p => p.id === planId);
    if (plan && plan.type) {
      document.getElementById('m-type').value = plan.type;
    } else {
      document.getElementById('m-type').value = 'progress';
    }
  } else {
    document.getElementById('m-type').value = 'progress';
  }
  document.getElementById('m-note').value = '';
  if (document.getElementById('m-building-no')) document.getElementById('m-building-no').value = '';
  if (document.getElementById('m-floor-no')) document.getElementById('m-floor-no').value = '';

  // 清空共享文本区
  document.getElementById('uSharedText').value = '';
  _originalSharedText = '';
  document.getElementById('uOptimizeHint').style.display = 'none';
  setSharedTextMode(mode);

  // 重置语音/拍照区
  document.getElementById('unifiedVoiceSection').style.display = 'none';
  document.getElementById('unifiedPhotoSection').style.display = 'none';
  document.getElementById('uConfidenceRow').style.display = 'none';

  // 清空照片预览残留
  if (typeof vlmAnimationRunning !== 'undefined' && vlmAnimationRunning) hideVLMVisualization();
  if (document.getElementById('uPhotoUploadZone')) document.getElementById('uPhotoUploadZone').style.display = 'block';
  if (document.getElementById('uPhotoPreviewArea')) document.getElementById('uPhotoPreviewArea').style.display = 'none';
  if (document.getElementById('uPhotoPreviewImg')) document.getElementById('uPhotoPreviewImg').src = '';
  if (document.getElementById('vlm-photo')) document.getElementById('vlm-photo').src = '';
  window._uPhotoBase64 = null;
  if (document.getElementById('uPhotoCaption')) document.getElementById('uPhotoCaption').value = '';
  if (document.getElementById('uPhotoShowInReport')) document.getElementById('uPhotoShowInReport').checked = true;
  if (document.getElementById('uPhotoParseHint')) document.getElementById('uPhotoParseHint').textContent = '';
  document.getElementById('uVoiceToggleBtn').classList.remove('btn-primary');
  document.getElementById('uVoiceToggleBtn').classList.add('btn-outline');
  document.getElementById('uPhotoToggleBtn').classList.remove('btn-primary');
  document.getElementById('uPhotoToggleBtn').classList.add('btn-outline');

  // 根据 mode 展开对应输入区
  if (mode === 'voice') {
    document.getElementById('unifiedVoiceSection').style.display = 'block';
    document.getElementById('uVoiceToggleBtn').classList.remove('btn-outline');
    document.getElementById('uVoiceToggleBtn').classList.add('btn-primary');
  } else if (mode === 'photo') {
    document.getElementById('unifiedPhotoSection').style.display = 'block';
    document.getElementById('uPhotoToggleBtn').classList.remove('btn-outline');
    document.getElementById('uPhotoToggleBtn').classList.add('btn-primary');
  }

  // 渲染计划列表和动态表单
  renderPlanSelect(defaultDate);
  renderManualForm();
  renderAreaOptions('m-area', '');

  if (planId) {
    document.getElementById('m-plan').value = planId;
    onPlanSelect(planId);
  } else {
    document.getElementById('m-completion-type').value = 'unplanned';
  }

  showModal('modalManual');
}

function toggleUnifiedVoiceSection() {
  const section = document.getElementById('unifiedVoiceSection');
  const btn = document.getElementById('uVoiceToggleBtn');
  const photoSection = document.getElementById('unifiedPhotoSection');
  const photoBtn = document.getElementById('uPhotoToggleBtn');
  const isHidden = section.style.display === 'none';
  section.style.display = isHidden ? 'block' : 'none';
  btn.classList.toggle('btn-primary', isHidden);
  btn.classList.toggle('btn-outline', !isHidden);
  if (isHidden) {
    photoSection.style.display = 'none';
    photoBtn.classList.remove('btn-primary');
    photoBtn.classList.add('btn-outline');
    setSharedTextMode('voice');
  } else {
    setSharedTextMode('manual');
  }
}

function toggleUnifiedPhotoSection() {
  const section = document.getElementById('unifiedPhotoSection');
  const btn = document.getElementById('uPhotoToggleBtn');
  const voiceSection = document.getElementById('unifiedVoiceSection');
  const voiceBtn = document.getElementById('uVoiceToggleBtn');
  const isHidden = section.style.display === 'none';
  section.style.display = isHidden ? 'block' : 'none';
  btn.classList.toggle('btn-primary', isHidden);
  btn.classList.toggle('btn-outline', !isHidden);
  if (isHidden) {
    voiceSection.style.display = 'none';
    voiceBtn.classList.remove('btn-primary');
    voiceBtn.classList.add('btn-outline');
    setSharedTextMode('photo');
  } else {
    setSharedTextMode('manual');
  }
}

function toggleUnifiedRecording() {
  const btn = document.getElementById('uRecordingBtn');
  const hint = document.getElementById('uRecordingHint');
  if (btn.classList.contains('recording')) {
    btn.classList.remove('recording');
    hint.textContent = '点击麦克风开始录音';
    mockUnifiedRecordingComplete();
  } else {
    btn.classList.add('recording');
    hint.textContent = '录音中... 说"停止"或点击结束';
    setTimeout(() => {
      if (btn.classList.contains('recording')) toggleUnifiedRecording();
    }, 2500);
  }
}

function mockUnifiedRecordingComplete() {
  const texts = [
    '员工餐厅区天花吊顶龙骨安装，张师傅带了两个人在做，进度到 80%',
    '高管办公区墙面基层处理完成 50%，王师傅负责',
    '多功能厅日常安全巡检，一切正常',
    '商业展示区临时用电有点问题，需要整改',
    'VIP 接待室墙面找平开始施工，李师傅带一人'
  ];
  document.getElementById('uSharedText').value = texts[Math.floor(Math.random() * texts.length)];
  setSharedTextMode('voice');
}

function setSharedTextMode(mode) {
  const ta = document.getElementById('uSharedText');
  if (mode === 'voice') {
    ta.placeholder = '语音识别结果在此，可修改后点击「解析」结构化';
  } else if (mode === 'photo') {
    ta.placeholder = '图片识别结果在此，可修改后点击「解析」结构化';
  } else {
    ta.placeholder = '直接输入文字，点击「解析」结构化，或「优化」润色';
  }
}

// 统一文本解析（调 LLM 语音解析接口，降级 mock）
async function parseUnifiedSharedText() {
  const text = document.getElementById('uSharedText').value.trim();
  if (!text) { showToast('请输入文本内容', 'warning'); return; }

  // 判断来源模式
  const isPhoto = _unifiedMode === 'photo' || document.getElementById('unifiedPhotoSection').style.display === 'block';
  const sourceMode = isPhoto ? 'photo' : 'voice';

  const textarea = document.getElementById('uSharedText');
  const parent = textarea.parentElement;
  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;overflow:hidden;pointer-events:none;';
  const scanLine = document.createElement('div');
  scanLine.className = 'scan-line';
  scanLine.style.height = textarea.offsetHeight + 'px';
  parent.style.position = 'relative';
  parent.appendChild(wrapper);
  wrapper.appendChild(scanLine);

  await new Promise(r => setTimeout(r, 800));
  wrapper.remove();
  textarea.classList.add('textarea-fading');

  const areas = getProjectAreas();
  const plans = M.PLANS[currentProjectId] || [];
  const workers = M.WORKERS || [];
  let parsed;
  try {
    const endpoint = isPhoto ? '/parse-photo' : '/parse-voice';
    const body = isPhoto
      ? { caption: text, projectId: currentProjectId, areas: areas.map(a => ({ id: a.id, name: a.name })), plans: plans.map(p => ({ id: p.id, taskName: p.taskName, areaId: p.areaId, buildingNo: p.buildingNo, floorNo: p.floorNo, progress: p.progress })), type: 'text_only' }
      : { text, projectId: currentProjectId, areas: areas.map(a => ({ id: a.id, name: a.name })), plans: plans.map(p => ({ id: p.id, taskName: p.taskName, areaId: p.areaId, buildingNo: p.buildingNo, floorNo: p.floorNo, progress: p.progress })) };
    const r = await fetch(API_BASE + endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    parsed = await r.json();
  } catch (e) {
    textarea.classList.remove('textarea-fading');
    showToast('LLM 解析失败：' + e.message, 'error');
    return;
  }

  textarea.classList.remove('textarea-fading');
  textarea.classList.add('textarea-optimized');
  const summary = buildParseSummary(parsed);
  if (summary) {
    _originalSharedText = text;
    await typeText(textarea, summary, 30);
  }
  applyUnifiedParseResult(parsed, sourceMode);
  showToast('解析完成，已填充下方表单', 'success');
}

function buildParseSummary(parsed) {
  const parts = [];
  if (parsed.type) parts.push('类型:' + parsed.type);
  if (parsed.areaName) parts.push('区域:' + parsed.areaName);
  if (parsed.buildingNo) parts.push(parsed.buildingNo);
  if (parsed.floorNo) parts.push(parsed.floorNo);
  if (parsed.completionType === 'unplanned') parts.push('计划外');
  if (parsed.payload?.taskName) parts.push(parsed.payload.taskName);
  if (parsed.payload?.progress) parts.push('进度' + parsed.payload.progress);
  if (parsed.payload?.owner) parts.push('负责人' + parsed.payload.owner);
  if (parsed.laborRequirements && parsed.laborRequirements.length > 0) {
    parts.push(parsed.laborRequirements.map(r => r.trade + r.count + '人').join('、'));
  }
  return parts.length > 0 ? parts.join('，') : '';
}

// 统一优化（带扫描线 + 逐字动画）
let _originalSharedText = '';

async function optimizeUnifiedSharedText() {
  const textarea = document.getElementById('uSharedText');
  const hint = document.getElementById('uOptimizeHint');
  const optimizeBtn = document.getElementById('uOptimizeBtn');
  const voiceText = textarea.value.trim();

  if (!voiceText) { showToast('请先输入文本内容', 'warning'); return; }

  if (_originalSharedText !== voiceText) _originalSharedText = voiceText;

  optimizeBtn.disabled = true;
  optimizeBtn.innerHTML = '⏳ 优化中...';
  hint.textContent = '正在优化文本内容...';
  hint.style.display = 'block';
  textarea.classList.add('textarea-animating');

  // 扫描线动画
  const parent = textarea.parentElement;
  const wrapper = document.createElement('div');
  wrapper.className = 'animation-wrapper';
  wrapper.style.width = textarea.offsetWidth + 'px';
  wrapper.style.height = textarea.offsetHeight + 'px';
  const scanLine = document.createElement('div');
  scanLine.className = 'scan-line';
  scanLine.style.height = textarea.offsetHeight + 'px';
  parent.style.position = 'relative';
  parent.appendChild(wrapper);
  wrapper.appendChild(scanLine);

  try {
    await new Promise(r => setTimeout(r, 1000));
    wrapper.remove();
    textarea.classList.add('textarea-fading');
    await new Promise(r => setTimeout(r, 400));

    const areas = getProjectAreas();
    const plans = M.PLANS[currentProjectId] || [];
    const response = await fetch(API_BASE + '/optimize-text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: voiceText,
        projectId: currentProjectId,
        areas: areas.map(a => ({ id: a.id, name: a.name })),
        plans: plans.map(p => ({ id: p.id, taskName: p.taskName, process: p.process }))
      })
    });

    if (response.ok) {
      const result = await response.json();
      if (result.optimizedText) {
        textarea.classList.remove('textarea-fading');
        textarea.classList.add('textarea-optimized');
        await typeText(textarea, result.optimizedText, 35);
        hint.innerHTML = `✨ 优化完成！<a href="#" onclick="restoreUnifiedOriginalText()" style="color:#00adef;text-decoration:underline;">点击恢复原文</a>`;
        showToast('文本已优化', 'success');
      } else {
        textarea.classList.remove('textarea-fading');
        hint.textContent = '优化失败，保持原内容';
        setTimeout(() => { hint.style.display = 'none'; }, 3000);
      }
    } else {
      throw new Error('HTTP ' + response.status);
    }
  } catch {
    textarea.classList.remove('textarea-fading');
    const optimized = mockOptimizeText(voiceText);
    const optimizedText = optimized.optimizedText || optimized;
    await typeText(textarea, optimizedText, 35);
    hint.innerHTML = `✨ 本地优化完成！<a href="#" onclick="restoreUnifiedOriginalText()" style="color:#00adef;text-decoration:underline;">点击恢复原文</a>`;
    showToast('文本优化完成（本地模式）', 'success');
  }

  textarea.classList.remove('textarea-animating', 'textarea-fading', 'textarea-optimized');
  optimizeBtn.disabled = false;
  optimizeBtn.innerHTML = '✨ 优化';
  hint.style.display = 'block';

  // 弹出信息补全窗
  setTimeout(() => showOptimizationPopup(), 600);
}

function showOptimizationPopup() {
  const type = document.getElementById('m-type').value;
  const expected = getExpectedFields(type);
  const plans = M.PLANS[currentProjectId] || [];
  const hasPlanField = expected.includes('m-plan');
  const planSelected = document.getElementById('m-plan')?.value;
  const showPlanPicker = hasPlanField && !planSelected && plans.length > 0;

  // 收集所有劳动力行（动态行，工种/人数）
  const laborRows = [];
  document.querySelectorAll('[id^="m-labor-type-"]').forEach(tEl => {
    const idx = tEl.id.replace('m-labor-type-', '');
    const cEl = document.getElementById('m-labor-count-' + idx);
    if (cEl) laborRows.push({ idx, type: tEl, count: cEl });
  });
  const hasLabor = laborRows.length > 0;

  // 检查是否有任何字段缺失或可选计划，都没有则跳过
  const anyMissing = expected.some(id => {
    const el = document.getElementById(id);
    if (!el) return false;
    if (el.type === 'select-one') return !el.value || !el.querySelector('option:checked')?.value;
    return !el.value;
  });
  const laborMissing = laborRows.some(r => !r.type.value.trim());
  if (!anyMissing && !showPlanPicker && !laborMissing) return;

  const overlay = document.createElement('div');
  overlay.className = 'opt-popup-overlay';
  let html = `<div class="opt-popup">
    <h3>📋 信息补全</h3>
    <p style="font-size:13px;color:#64748b;margin:-8px 0 16px;">请确认或补充以下信息</p>`;

  if (showPlanPicker) {
    html += `<div class="opt-popup-row">
      <label>关联今日计划（点击选择，自动填充下方字段）</label>
      <div id="opt-plan-list">`;
    plans.forEach((p, i) => {
      const task = p.taskName || p.process || '未命名任务';
      const area = p.areaId || p.area || '';
      const loc = [p.buildingNo, p.floorNo].filter(Boolean).join(' ');
      html += `<div class="opt-plan-card" data-plan-id="${p.id}" onclick="selectOptPlan(this,'${p.id}')">
        <span class="checkmark">✓</span>
        <div class="opt-plan-card-title">${task}</div>
        <div class="opt-plan-card-detail">${[loc, area, '进度' + (p.progress || '0%')].filter(Boolean).join(' | ')}</div>
      </div>`;
    });
    html += `</div>`;
  }

  // 渲染所有预期字段（包含已有值的，方便计划填充后看到）
  expected.forEach(id => {
    if (id === 'm-plan') return; // plan 用卡片选择
    const el = document.getElementById(id);
    if (!el) return;
    const curVal = el.value;
    const FIELD_LABELS = {
      'm-task': '工序/任务名称', 'm-owner': '负责人', 'm-progress': '进度', 'm-headcount': '人数',
      'm-area': '所属区域', 'm-building-no': '楼号/施工段', 'm-floor-no': '层号',
      'm-material': '材料名称', 'm-spec': '规格', 'm-quantity': '数量', 'm-unit': '单位', 'm-action': '操作',
      'm-checktype': '检查类型', 'm-result': '检查结果', 'm-issues': '问题（用分号分隔）',
      'm-topic': '协调主题', 'm-parties': '参与方（用分号分隔）', 'm-summary': '协调结论',
      'm-att-count': '应到人数', 'm-att-status': '签到状态'
    };
    const label = el?.previousElementSibling?.textContent || FIELD_LABELS[id] || id.replace('m-', '').replace(/-/g, ' ');
    const inputId = 'opt-fill-' + id;
    const isEmpty = el.type === 'select-one' ? (!curVal || !el.querySelector('option:checked')?.value) : !curVal;
    const borderStyle = isEmpty ? 'border-color:#ef4444;' : '';

    if (id === 'm-area') {
      const areas = getProjectAreas();
      html += `<div class="opt-popup-row"><label>${label}${isEmpty ? ' <span style="color:#ef4444;">（未填）</span>' : ''}</label>
        <select id="${inputId}" style="${borderStyle}"><option value="">— 请选择 —</option>
        ${areas.map(a => `<option value="${a.id}" ${a.id === curVal ? 'selected' : ''}>${a.name}</option>`).join('')}</select></div>`;
    } else if (id === 'm-owner' && M.WORKERS?.length) {
      html += `<div class="opt-popup-row"><label>${label}${isEmpty ? ' <span style="color:#ef4444;">（未填）</span>' : ''}</label>
        <input id="${inputId}" list="opt-worker-list" placeholder="输入或选择负责人" value="${curVal}" style="${borderStyle}">
        <datalist id="opt-worker-list">${M.WORKERS.map(w => `<option value="${w.name}">`).join('')}</datalist></div>`;
    } else {
      html += `<div class="opt-popup-row"><label>${label}${isEmpty ? ' <span style="color:#ef4444;">（未填）</span>' : ''}</label>
        <input id="${inputId}" placeholder="请输入${label}" value="${curVal}" style="${borderStyle}"></div>`;
    }
  });

  // 劳动力行（工种 + 人数），所有已有行都列出
  if (hasLabor) {
    const laborMissingCnt = laborRows.filter(r => !r.type.value.trim()).length;
    html += `<div class="opt-popup-row" style="display:block;">
      <label>劳动力（工种 / 人数）${laborMissingCnt > 0 ? ` <span style="color:#ef4444;">（${laborMissingCnt} 个工种未填）</span>` : ''}</label>
      <div style="display:flex;flex-direction:column;gap:6px;">`;
    laborRows.forEach(r => {
      const tradeVal = r.type.value || '';
      const countVal = r.count.value || 0;
      const isEmpty = !tradeVal.trim();
      const borderStyle = isEmpty ? 'border-color:#ef4444;' : '';
      html += `<div style="display:flex;gap:6px;align-items:center;">
        <input class="form-input" id="opt-fill-${r.type.id}" placeholder="工种（如：木工）" value="${tradeVal}" style="flex:1;${borderStyle}" list="opt-trade-list-${r.idx}">
        <input class="form-input" type="number" id="opt-fill-${r.count.id}" min="0" value="${countVal}" style="width:70px;">
        <datalist id="opt-trade-list-${r.idx}">${(M.STANDARD_TRADES || []).map(t => `<option value="${t.tradeName}">`).join('')}</datalist>
      </div>`;
    });
    html += `</div></div>`;
  }

  // 劳动力预览（计划选中后显示）
  html += `<div class="opt-popup-row" id="opt-labor-row" style="display:none;">
    <label>劳动力</label>
    <span id="opt-labor-preview" style="font-size:13px;color:#0f172a;"></span>
  </div>`;

  html += `<div class="opt-popup-actions">
    <button class="btn btn-outline" onclick="this.closest('.opt-popup-overlay').remove()">跳过</button>
    <button class="btn btn-primary" onclick="confirmOptFill(this)">✓ 确认补全</button>
  </div></div>`;

  overlay.innerHTML = html;
  document.body.appendChild(overlay);
}

// 选择计划卡片 → 填充弹窗内的控件
window.selectOptPlan = function(el, planId) {
  document.querySelectorAll('.opt-plan-card').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  const plans = M.PLANS[currentProjectId] || [];
  const plan = plans.find(p => p.id === planId);
  if (!plan) return;

  // 存入选中的计划 ID，确认时再写入表单
  el.closest('.opt-popup').dataset.selectedPlan = planId;

  // 填充弹窗内的控件
  const fill = (fieldId, val) => {
    const input = document.getElementById('opt-fill-' + fieldId);
    if (input && val) input.value = val;
  };
  fill('m-building-no', plan.buildingNo);
  fill('m-floor-no', plan.floorNo);
  fill('m-area', plan.areaId || plan.area);
  fill('m-owner', plan.owner);
  fill('m-task', plan.taskName || plan.process);
  fill('m-progress', plan.progress);

  // 劳动力：显示弹窗内劳动力预览
  const laborList = plan.laborRequirements || plan.laborSchedule || [];
  const laborRow = document.getElementById('opt-labor-row');
  const laborPreview = document.getElementById('opt-labor-preview');
  if (laborRow && laborPreview) {
    if (laborList.length > 0) {
      laborPreview.textContent = laborList.map(l => (l.trade || l.laborType || '') + (l.count || 0) + '人').filter(Boolean).join('、');
      laborRow.style.display = 'block';
    } else {
      laborRow.style.display = 'none';
    }
  }
};

// 确认补全：把用户在弹窗中填写的内容同步到表单和文本框
window.confirmOptFill = function(btn) {
  const overlay = btn.closest('.opt-popup-overlay');
  const popup = overlay.querySelector('.opt-popup');

  // 1. 处理选中的计划
  const planId = popup.dataset.selectedPlan;
  if (planId) {
    const plans = M.PLANS[currentProjectId] || [];
    const plan = plans.find(p => p.id === planId);
    if (plan) {
      doPlanSelect(planId);
      // 计划内的劳动力
    let laborList = plan.laborRequirements || plan.laborSchedule || [];
    if (typeof laborList === 'string') try { laborList = JSON.parse(laborList); } catch (_) { laborList = []; }
    if (!Array.isArray(laborList)) laborList = [];
      if (laborList.length > 0) {
        window._mPlanLabor = laborList;
        renderManualLaborRows(laborList, plan);
      }
    }
  }

  // 2. 同步弹窗中所有字段到表单
  overlay.querySelectorAll('[id^="opt-fill-"]').forEach(input => {
    const fieldId = input.id.replace('opt-fill-', '');
    const val = input.value.trim();
    const target = document.getElementById(fieldId);
    if (!target) return;
    if (val) {
      if (target.tagName === 'SELECT') {
        const opt = target.querySelector(`option[value="${val}"]`);
        if (opt) target.value = val;
      } else {
        target.value = val;
      }
      highlightField(fieldId);
    }
  });

  // 3. 如果关联了计划，触发 diff 检测
  if (planId) {
    checkManualLaborDiff();
    checkAllFieldDiffs();
  }

  // 4. 重新构建优化文本
  rebuildOptimizedText();
  overlay.remove();
};

function rebuildOptimizedText() {
  const textarea = document.getElementById('uSharedText');
  const parts = [];
  const type = document.getElementById('m-type').value;
  const fields = {
    buildingNo: document.getElementById('m-building-no')?.value,
    floorNo: document.getElementById('m-floor-no')?.value,
    taskName: document.getElementById('m-task')?.value,
    owner: document.getElementById('m-owner')?.value,
    progress: document.getElementById('m-progress')?.value
  };
  if (fields.buildingNo) parts.push(fields.buildingNo);
  if (fields.floorNo) parts.push(fields.floorNo);
  if (fields.taskName) parts.push(fields.taskName);
  if (fields.owner) parts.push('负责人' + fields.owner);
  if (fields.progress) parts.push('进度' + fields.progress);
  const laborRows = document.querySelectorAll('#m-labor-rows .labor-row');
  const labor = [];
  laborRows.forEach((r, i) => {
    const t = document.getElementById('m-labor-type-' + i);
    const c = document.getElementById('m-labor-count-' + i);
    if (t && c && t.value.trim()) labor.push(t.value.trim() + c.value + '人');
  });
  if (labor.length > 0) parts.push(labor.join('、'));
  const planId = document.getElementById('m-plan')?.value;
  if (planId) parts.unshift('计划内');
  textarea.value = parts.length > 0 ? parts.join('，') : textarea.value;
}

function restoreUnifiedOriginalText() {
  const textarea = document.getElementById('uSharedText');
  const hint = document.getElementById('uOptimizeHint');
  if (_originalSharedText) {
    textarea.value = _originalSharedText;
    hint.textContent = '已恢复原文';
    setTimeout(() => { hint.style.display = 'none'; }, 2000);
  }
}

function clearUnifiedSharedText() {
  document.getElementById('uSharedText').value = '';
  _originalSharedText = '';
}

function highlightField(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove('field-highlight', 'field-unmatched');
  void el.offsetWidth;
  el.classList.add('field-highlight');
  setTimeout(() => el.classList.remove('field-highlight'), 700);
}

function highlightFieldUnmatched(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove('field-highlight', 'field-unmatched', 'field-unmatched-pulse');
  void el.offsetWidth;
  el.classList.add('field-unmatched', 'field-unmatched-pulse');
  // 5s 后停止脉冲动画，但保留红框提示色（提示色一直保留直到用户输入数据）
  setTimeout(() => el.classList.remove('field-unmatched-pulse'), 5000);
  // 用户开始输入即清除提示色
  if (!el.dataset._unmatchedListenerBound) {
    el.dataset._unmatchedListenerBound = '1';
    const clear = () => {
      el.classList.remove('field-unmatched', 'field-unmatched-pulse');
      el.removeEventListener('input', clear);
      el.removeEventListener('change', clear);
      delete el.dataset._unmatchedListenerBound;
    };
    el.addEventListener('input', clear);
    el.addEventListener('change', clear);
  }
}

function getExpectedFields(type) {
  const map = {
    progress: ['m-task', 'm-owner', 'm-progress', 'm-building-no', 'm-floor-no', 'm-area', 'm-plan'],
    material: ['m-material', 'm-spec', 'm-quantity', 'm-unit'],
    safety: ['m-checktype', 'm-result'],
    coordination: ['m-topic', 'm-parties', 'm-summary'],
    attendance: ['m-att-count', 'm-att-status'],
    issue: ['m-task', 'm-owner']
  };
  return map[type] || [];
}

function applyUnifiedParseResult(parsed, sourceMode) {
  if (sourceMode) _unifiedMode = sourceMode;
  document.getElementById('m-type').value = parsed.type || 'progress';
  highlightField('m-type');
  renderManualForm();

  const delayed = [];

  // --- 完成类型、施工位置、劳动力 ---
  if (parsed.completionType && ['planned', 'unplanned'].includes(parsed.completionType)) {
    document.getElementById('m-completion-type').value = parsed.completionType;
    highlightField('m-completion-type');
  }
  if (parsed.buildingNo) {
    document.getElementById('m-building-no').value = parsed.buildingNo;
    highlightField('m-building-no');
  }
  if (parsed.floorNo) {
    document.getElementById('m-floor-no').value = parsed.floorNo;
    highlightField('m-floor-no');
  }

  // 劳动力列表
  if (parsed.laborRequirements && Array.isArray(parsed.laborRequirements) && parsed.laborRequirements.length > 0) {
    renderManualLaborRows(parsed.laborRequirements, null);
  }

  // --- 原有字段 ---
  if (parsed.payload?.taskName) {
    const el = document.getElementById('m-task');
    if (el) { el.value = parsed.payload.taskName; highlightField('m-task'); }
  }
  if (parsed.payload?.owner) {
    const el = document.getElementById('m-owner');
    if (el) { el.value = parsed.payload.owner; highlightField('m-owner'); }
  }
  if (parsed.payload?.progress) {
    const el = document.getElementById('m-progress');
    if (el) { el.value = parsed.payload.progress; highlightField('m-progress'); }
  }
  if (parsed.payload?.headcount) {
    const hc = parseInt(parsed.payload.headcount) || 0;
    const el = document.getElementById('m-labor-count-0');
    if (el && !parsed.laborRequirements) { el.value = hc; highlightField('m-labor-count-0'); }
  }
  if (parsed.caption || parsed.payload?.caption) {
    const el = document.getElementById('m-caption');
    if (el) { el.value = parsed.caption || parsed.payload?.caption; highlightField('m-caption'); }
    // 同步到照片描述框（可编辑）+ 开关默认开
    const capEl = document.getElementById('uPhotoCaption');
    if (capEl) capEl.value = parsed.caption || parsed.payload?.caption;
    const showEl = document.getElementById('uPhotoShowInReport');
    if (showEl) showEl.checked = true;
  }

  // 显示置信度
  const conf = document.getElementById('u-confidence');
  const confRow = document.getElementById('uConfidenceRow');
  if (conf && confRow) {
    conf.textContent = `${((parsed.confidence || 0) * 100).toFixed(0)}%`;
    confRow.style.display = 'flex';
  }

  // 处理区域
  const areaRef = parsed.areaId || parsed.areaName || '';
  if (areaRef) {
    let area = findAreaById(areaRef) || findAreaByName(areaRef);
    if (area) {
      renderAreaOptions('m-area', area.id);
      highlightField('m-area');
    } else {
      showAreaConfirmDialog(areaRef, 'm-area');
    }
  }

  // 处理关联计划
  if (parsed.planId) {
    const el = document.getElementById('m-plan');
    if (el) {
      const option = el.querySelector(`option[value="${parsed.planId}"]`);
      if (option) {
        el.value = parsed.planId;
        _prevPlanId = parsed.planId;
        highlightField('m-plan');
      }
    }
    // 设置计划劳动力数据，触发 diff 检测
    const projectPlans = M.PLANS[currentProjectId] || [];
    const plan = projectPlans.find(p => p.id === parsed.planId);
    if (plan) {
      const planLabor = plan.laborRequirements || plan.laborSchedule || [];
      window._mPlanLabor = planLabor;
    }
  } else {
    window._mPlanLabor = null;
  }
  checkManualLaborDiff();
  checkAllFieldDiffs();

  // 标记未匹配的字段（15秒红色脉冲提醒）
  const expected = getExpectedFields(document.getElementById('m-type').value);
  let firstUnmatched = null;
  expected.forEach(id => {
    const el = document.getElementById(id);
    if (el && !el.value && el.type !== 'select-one') {
      highlightFieldUnmatched(id);
      if (!firstUnmatched) firstUnmatched = el;
    } else if (el && !el.value && el.type === 'select-one' && !el.querySelector('option:checked')?.value) {
      highlightFieldUnmatched(id);
      if (!firstUnmatched) firstUnmatched = el;
    }
  });
  // 劳动力行空值检测（动态生成的工种行）
  const firstLaborType = document.getElementById('m-labor-type-0');
  if (firstLaborType && !firstLaborType.value.trim()) {
    highlightFieldUnmatched('m-labor-type-0');
    if (!firstUnmatched) firstUnmatched = firstLaborType;
  }
  // 自动滚动到第一个未匹配字段
  if (firstUnmatched) {
    setTimeout(() => firstUnmatched.scrollIntoView({ behavior: 'smooth', block: 'center' }), 200);
  }
}

// 字段与计划对比
const _fieldPlanMap = {
  'm-task': ['taskName', 'process'],
  'm-progress': ['progress'],
  'm-owner': ['owner'],
  'm-building-no': ['buildingNo'],
  'm-floor-no': ['floorNo'],
  'm-area': ['areaId', 'area']
};

function clearFieldDiffWarnings() {
  document.querySelectorAll('.field-diff-warning').forEach(el => el.remove());
  for (const fieldId of Object.keys(_fieldPlanMap)) {
    const el = document.getElementById(fieldId);
    if (el) el.style.borderColor = '';
  }
}

function showFieldDiffWarning(fieldId, planValue) {
  const el = document.getElementById(fieldId);
  if (!el) return;
  let warn = el.parentElement.querySelector('.field-diff-warning');
  if (!warn) {
    warn = document.createElement('span');
    warn.className = 'field-diff-warning';
    el.parentNode.insertBefore(warn, el.nextSibling);
  }
  warn.textContent = '⚠ 计划要求：' + planValue;
  el.style.borderColor = '#fca5a5';
}

function checkAllFieldDiffs() {
  clearFieldDiffWarnings();
  const planId = document.getElementById('m-plan').value;
  if (!planId) return;
  const plans = M.PLANS[currentProjectId] || [];
  const plan = plans.find(p => p.id === planId);
  if (!plan) return;
  for (const [fieldId, planKeys] of Object.entries(_fieldPlanMap)) {
    const el = document.getElementById(fieldId);
    if (!el) continue;
    const currentVal = el.value;
    let planVal = '';
    for (const key of planKeys) {
      const v = plan[key];
      if (v) { planVal = String(v); break; }
    }
    if (planVal && currentVal && currentVal !== planVal) {
      showFieldDiffWarning(fieldId, planVal);
    }
  }
}

// 完成类型切换：有计划→无计划时询问清除
async function onCompletionTypeChange() {
  const newVal = document.getElementById('m-completion-type').value;
  const planId = document.getElementById('m-plan').value;

  if (newVal === 'unplanned' && planId) {
    // 有计划→无计划：询问是否清空
    const hasData = document.getElementById('m-building-no').value ||
      document.getElementById('m-task')?.value ||
      document.getElementById('m-owner')?.value ||
      document.getElementById('m-progress')?.value;
    if (hasData) {
      const keep = await showConfirm('切换为「计划外」将清除已填充的计划数据，是否保留？', '切换完成类型', '🔄');
      if (!keep) {
        document.getElementById('m-building-no').value = '';
        document.getElementById('m-floor-no').value = '';
        document.getElementById('m-area').value = '';
        document.getElementById('m-plan').value = '';
        if (document.getElementById('m-task')) document.getElementById('m-task').value = '';
        if (document.getElementById('m-owner')) document.getElementById('m-owner').value = '';
        if (document.getElementById('m-progress')) document.getElementById('m-progress').value = '';
        if (document.getElementById('m-caption')) document.getElementById('m-caption').value = '';
        window._mPlanLabor = null;
        const lr = document.getElementById('m-labor-rows');
        if (lr) lr.innerHTML = `<div class="form-row labor-row"><div class="form-group"><label class="form-label">工种</label><input class="form-input" type="text" id="m-labor-type-0" placeholder="如：木工" oninput="checkManualLaborDiff()"></div><div class="form-group"><label class="form-label">人数</label><input class="form-input" type="number" id="m-labor-count-0" value="0" min="0" oninput="checkManualLaborDiff()"></div><button class="btn btn-danger btn-sm" onclick="removeManualLaborRow(0)" style="margin-top:24px;">✕</button></div>`;
        window._mlr = 1;
        clearFieldDiffWarnings();
      }
    }
    // 无论保留还是清空，选中的计划都要解除
    document.getElementById('m-plan').value = '';
    _prevPlanId = '';
    window._mPlanLabor = null;
    clearFieldDiffWarnings();
  } else if (newVal === 'planned' && !planId) {
    // 无计划→有计划：提示先选计划，回退到 unplanned
    showToast('请先选择关联计划', 'warning');
    document.getElementById('m-completion-type').value = 'unplanned';
    return;
  }
}

// 统一拍照处理
function fillSharedTextFromParseResult(parsed) {
  const parts = [];
  if (parsed.completionType === 'unplanned') parts.push('计划外');
  if (parsed.buildingNo) parts.push(parsed.buildingNo);
  if (parsed.floorNo) parts.push(parsed.floorNo);
  if (parsed.payload?.taskName) parts.push(parsed.payload.taskName);
  if (parsed.payload?.progress) parts.push('进度' + parsed.payload.progress);
  if (parsed.payload?.owner) parts.push('负责人' + parsed.payload.owner);
  if (parsed.payload?.headcount) parts.push(parsed.payload.headcount + '人');
  if (parsed.laborRequirements && parsed.laborRequirements.length > 0) {
    parts.push(parsed.laborRequirements.map(r => r.trade + r.count + '人').join('、'));
  }
  if (parsed.caption) parts.push(parsed.caption);
  if (parts.length) {
    document.getElementById('uSharedText').value = parts.join('，');
    setSharedTextMode('photo');
  }
}

// 粘贴截图支持
function handleSharedTextPaste(e) {
  const items = (e.clipboardData || e.originalEvent.clipboardData).items;
  let imageFile = null;
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      imageFile = item.getAsFile();
      break;
    }
  }
  if (!imageFile) return; // 不是图片，走正常粘贴
  e.preventDefault();

  // 切换到拍照模式
  const voiceSection = document.getElementById('unifiedVoiceSection');
  const photoSection = document.getElementById('unifiedPhotoSection');
  const voiceBtn = document.getElementById('uVoiceToggleBtn');
  const photoBtn = document.getElementById('uPhotoToggleBtn');
  voiceSection.style.display = 'none';
  voiceBtn.classList.remove('btn-primary');
  voiceBtn.classList.add('btn-outline');
  photoSection.style.display = 'block';
  photoBtn.classList.remove('btn-outline');
  photoBtn.classList.add('btn-primary');

  // 清除预览残留
  if (vlmAnimationRunning) hideVLMVisualization();
  document.getElementById('uPhotoUploadZone').style.display = 'block';
  document.getElementById('uPhotoPreviewArea').style.display = 'none';
  document.getElementById('uPhotoPreviewImg').src = '';
  document.getElementById('vlm-photo').src = '';
  window._uPhotoBase64 = null;

  // 用粘贴的图片对象构造一个 fake event 走统一上传流程
  const fakeEvent = { target: { files: [imageFile] } };
  handleUnifiedPhotoUpload(fakeEvent);
}

function handleUnifiedPhotoUpload(event) {
  const files = Array.from(event.target.files || []);
  if (files.length === 0) return;
  // 清空 input 值，允许重复选择同一文件
  if (event.target.tagName === 'INPUT') event.target.value = '';

  const valid = files.filter(f => f.type.startsWith('image/'));
  if (valid.length === 0) { showToast('请选择图片文件', 'error'); return; }
  if (valid.length > 1) {
    startPhotoWizard(valid);
    return;
  }
  handleUnifiedSinglePhotoUpload(valid[0]);
}

function handleUnifiedSinglePhotoUpload(file) {
  const reader = new FileReader();
  reader.onload = function(e) {
    const previewUrl = e.target.result;
    // 设置 VLM 和普通预览的图片
    document.getElementById('vlm-photo').src = previewUrl;
    const previewImg = document.getElementById('uPhotoPreviewImg');
    previewImg.src = previewUrl;
    previewImg.style.cursor = 'zoom-in';
    previewImg.setAttribute('onclick', `openPhotoLightboxSrc('${previewUrl}', '拍照预览')`);
    window._uPhotoBase64 = previewUrl;

    document.getElementById('uPhotoUploadZone').style.display = 'none';
    document.getElementById('uPhotoPreviewArea').style.display = 'block';
    document.getElementById('uPhotoWizardPanel').style.display = 'none';

    // 立即显示 VLM 可视化（照片在左，动画在右；照片 = vlm-photo，立刻可见）
    const vlmVis = document.getElementById('vlm-visualization');
    if (vlmVis) vlmVis.style.display = 'block';
    const simple = document.getElementById('simple-preview');
    if (simple) simple.style.display = 'none';
    // 启动注意力热力图 + Transformer 动画
    showVLMVisualization();
    const hint = document.getElementById('uPhotoParseHint');
    if (hint) hint.textContent = '⏳ AI 正在识别...';

    // 上传并解析
    uploadUnifiedPhoto(file);
  };
  reader.readAsDataURL(file);
}

// ============================================================
// 多张照片上传向导：每张照片 = 1 条独立事件
// ============================================================
function _readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

async function startPhotoWizard(files) {
  const validFiles = files.filter(f => f.type.startsWith('image/'));
  if (validFiles.length === 0) { showToast('请选择图片文件', 'error'); return; }

  _photoWizard = { queue: [], index: 0, savedCount: 0 };

  // 立即显示预览区 + 向导面板（给用户即时反馈，再读文件）
  document.getElementById('uPhotoUploadZone').style.display = 'none';
  document.getElementById('uPhotoPreviewArea').style.display = 'block';
  document.getElementById('uPhotoWizardPanel').style.display = 'block';
  const viz = document.getElementById('vlm-visualization');
  if (viz) viz.style.display = 'none';
  const simple = document.getElementById('simple-preview');
  if (simple) simple.style.display = 'block';
  const mainImg = document.getElementById('uPhotoPreviewImg');
  mainImg.removeAttribute('src');
  mainImg.style.display = 'none';
  const hint = document.getElementById('uPhotoParseHint');
  if (hint) hint.textContent = `⏳ 正在加载 0/${validFiles.length} 张照片...`;
  document.getElementById('uPhotoWizardCounter').textContent =
    `📷 第 0 / ${validFiles.length} 张（加载中）`;

  // 并行读取所有文件（总时间 = max 而非 sum）
  const readPromises = validFiles.map((file) => _readFileAsDataURL(file).then(data => ({ data, file })).catch(() => null));
  // 每读完一张就即时更新缩略图条与主图
  let loaded = 0;
  const onOneLoaded = (result) => {
    if (!result) return;
    _photoWizard.queue.push(result);
    loaded++;
    // 主图：第 1 张时立即显示
    if (loaded === 1) {
      mainImg.src = result.data;
      mainImg.style.display = 'block';
      mainImg.style.cursor = 'zoom-in';
      mainImg.onclick = () => openPhotoLightboxSrc(result.data, '拍照预览');
    }
    // 缩略图条
    _renderWizardStrip();
    document.getElementById('uPhotoWizardCounter').textContent =
      `📷 加载中 ${loaded}/${validFiles.length} 张`;
    if (hint) hint.textContent = loaded < validFiles.length
      ? `⏳ 正在加载 ${loaded}/${validFiles.length} 张照片...`
      : '✅ 加载完成';
  };
  // 用 Promise.all 跟踪完成
  const allResults = await Promise.all(readPromises);
  for (const r of allResults) onOneLoaded(r);

  if (_photoWizard.queue.length === 0) { showToast('没有有效的图片', 'warning'); return; }

  // 全部加载完，进入正常向导流程
  renderPhotoWizardStep();
}

function _renderWizardStrip() {
  if (!_photoWizard) return;
  const strip = document.getElementById('uPhotoWizardStrip');
  if (!strip) return;
  strip.innerHTML = _photoWizard.queue.map((q, i) => {
    let borderColor = '#e2e8f0';
    let badge = '';
    if (i < _photoWizard.index) { borderColor = '#16a34a'; badge = '<span style="position:absolute;top:-4px;right:-4px;background:#16a34a;color:#fff;border-radius:50%;width:14px;height:14px;font-size:9px;display:flex;align-items:center;justify-content:center;">✓</span>'; }
    else if (i === _photoWizard.index) { borderColor = '#00adef'; badge = '<span style="position:absolute;top:-4px;right:-4px;background:#00adef;color:#fff;border-radius:50%;width:14px;height:14px;font-size:9px;display:flex;align-items:center;justify-content:center;">●</span>'; }
    return `<div style="position:relative;width:48px;height:48px;border-radius:6px;overflow:hidden;border:2px solid ${borderColor};flex-shrink:0;cursor:${i < _photoWizard.index ? 'zoom-in' : 'default'};" onclick="${i < _photoWizard.index ? `openPhotoLightboxSrc('${q.data}', '已保存照片')` : ''}">
      <img src="${q.data}" style="width:100%;height:100%;object-fit:cover;display:block;" />
      ${badge}
    </div>`;
  }).join('');
}

function _clearWizardFormFields() {
  // 清空字段（保留 m-date / m-time 沿用初始设定）
  if (document.getElementById('m-task')) document.getElementById('m-task').value = '';
  if (document.getElementById('m-owner')) document.getElementById('m-owner').value = '';
  if (document.getElementById('m-progress')) document.getElementById('m-progress').value = '';
  if (document.getElementById('m-headcount')) document.getElementById('m-headcount').value = '';
  if (document.getElementById('m-area')) document.getElementById('m-area').value = '';
  if (document.getElementById('m-building-no')) document.getElementById('m-building-no').value = '';
  if (document.getElementById('m-floor-no')) document.getElementById('m-floor-no').value = '';
  if (document.getElementById('m-plan')) document.getElementById('m-plan').value = '';
  if (document.getElementById('m-note')) document.getElementById('m-note').value = '';
  if (document.getElementById('uPhotoParseHint')) document.getElementById('uPhotoParseHint').textContent = '';
}

function renderPhotoWizardStep() {
  if (!_photoWizard) return;
  const cur = _photoWizard.queue[_photoWizard.index];
  const isLast = _photoWizard.index === _photoWizard.queue.length - 1;

  // 更新主图
  const previewImg = document.getElementById('uPhotoPreviewImg');
  previewImg.src = cur.data;
  previewImg.style.cursor = 'zoom-in';
  previewImg.onclick = () => openPhotoLightboxSrc(cur.data, `第 ${_photoWizard.index + 1} 张预览`);
  window._uPhotoBase64 = cur.data;
  if (document.getElementById('vlm-photo')) document.getElementById('vlm-photo').src = cur.data;
  // 重置照片描述 + 报表显示开关（待 LLM 解析后回填）
  if (document.getElementById('uPhotoCaption')) document.getElementById('uPhotoCaption').value = '';
  if (document.getElementById('uPhotoShowInReport')) document.getElementById('uPhotoShowInReport').checked = true;

  // 计数器
  document.getElementById('uPhotoWizardCounter').textContent =
    `📷 第 ${_photoWizard.index + 1} / ${_photoWizard.queue.length} 张`;
  document.getElementById('uPhotoWizardSavedBadge').textContent =
    _photoWizard.savedCount > 0 ? `已保存 ${_photoWizard.savedCount} 条` : '';

  // 缩略图条（复用 _renderWizardStrip）
  _renderWizardStrip();

  // 按钮文案
  const saveBtn = document.getElementById('uPhotoWizardSaveBtn');
  saveBtn.textContent = isLast ? '✅ 完成' : '📥 保存并继续下一张 →';

  // 清空字段（不继承上次的值）
  _clearWizardFormFields();

  // 触发 LLM 解析当前图（不再显示 VLM 动画，让大照片立即可见）
  uploadUnifiedPhoto(cur.file);
}

async function savePhotoWizardAndNext() {
  if (!_photoWizard) return;
  const cur = _photoWizard.queue[_photoWizard.index];

  // 查重
  const dup = findDuplicatePhoto(cur.data);
  if (dup) {
    const dupType = M.TYPE_META[dup.type];
    const msg =
      `⚠️ 这张照片与已存在的事件重复：\n\n` +
      `📅 ${dup.date} ${dup.time}\n` +
      `📋 ${dupType?.icon || ''} ${dupType?.label || dup.type}\n` +
      `🏷 ${dup.taskName}\n` +
      `👷 ${dup.owner}\n` +
      `📊 状态：${dup.status === 'confirmed' ? '已确认' : '草稿'}\n\n` +
      `是否仍要保存为新事件？`;
    const ok = await showConfirm(msg, '⚠️ 重复照片', '⚠️');
    if (!ok) return; // 用户取消 → 留在当前照片
  }

  // 更新时间字段为当前保存时间
  const now = new Date();
  const nowStr = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  document.getElementById('m-time').value = nowStr;
  window._uPhotoBase64 = cur.data;
  _unifiedMode = 'photo';

  // 保存事件（不关弹窗，让 wizard 继续）
  const lenBefore = M.EVENTS.length;
  saveUnifiedEvent({ skipCloseModal: true });
  if (M.EVENTS.length === lenBefore) return; // 保存失败（缺字段等），留在当前照片

  _photoWizard.savedCount++;

  // 推进
  if (_photoWizard.index < _photoWizard.queue.length - 1) {
    _photoWizard.index++;
    renderPhotoWizardStep();
  } else {
    finishPhotoWizard();
  }
}

function skipPhotoWizard() {
  if (!_photoWizard) return;
  showToast('已跳过当前照片', 'info');
  if (_photoWizard.index < _photoWizard.queue.length - 1) {
    _photoWizard.index++;
    renderPhotoWizardStep();
  } else {
    finishPhotoWizard();
  }
}

function cancelPhotoWizard() {
  if (!_photoWizard) return;
  const saved = _photoWizard.savedCount;
  _photoWizard = null;
  _closeWizardAndReset();
  showToast(`已取消，已保存 ${saved} 条事件`, 'info');
}

function finishPhotoWizard() {
  if (!_photoWizard) return;
  const saved = _photoWizard.savedCount;
  const total = _photoWizard.queue.length;
  _photoWizard = null;
  _closeWizardAndReset();
  showToast(`批量上传完成：保存 ${saved}/${total} 条事件`, 'success');
}

function _closeWizardAndReset() {
  closeModal('modalManual');
  // 重置照片区
  document.getElementById('uPhotoUploadZone').style.display = 'block';
  document.getElementById('uPhotoPreviewArea').style.display = 'none';
  document.getElementById('uPhotoWizardPanel').style.display = 'none';
  document.getElementById('uPhotoPreviewImg').src = '';
  document.getElementById('vlm-photo').src = '';
  document.getElementById('uPhotoParseHint').textContent = '';
  window._uPhotoBase64 = null;
  if (document.getElementById('uPhotoCaption')) document.getElementById('uPhotoCaption').value = '';
  if (document.getElementById('uPhotoShowInReport')) document.getElementById('uPhotoShowInReport').checked = true;
  // 刷新时间线
  renderFilteredEvents();
  renderStats();
  if (typeof updateCalendar === 'function') updateCalendar();
}

async function uploadUnifiedPhoto(file) {
  _unifiedMode = 'photo';
  const hint = document.getElementById('uPhotoParseHint');
  if (hint) hint.textContent = '⏳ AI 正在识别...';

  try {
    // 将文件转为 base64（不含 data: 前缀）
    const base64Data = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result.split(',')[1]);
      r.onerror = reject;
      r.readAsDataURL(file);
    });

    const response = await fetch(API_BASE + '/parse-photo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageBase64: base64Data,
        caption: '',
        projectId: currentProjectId,
        areas: getProjectAreas() || [],
        type: 'photo'
      })
    });

    if (!response.ok) throw new Error('HTTP ' + response.status);
    const result = await response.json();
    applyUnifiedParseResult(result, 'photo');
    // 把识别结果写入共享文本框
    fillSharedTextFromParseResult(result);
    if (hint) hint.textContent = result.source === 'llm'
      ? `🤖 LLM 真实识别 · ${result.latencyMs || 0}ms`
      : `⚙️ Mock 模式`;

  } catch (error) {
    console.error('照片识别失败:', error);
    if (hint) hint.textContent = '❌ LLM 连接失败（' + error.message + '），请手动填写';
    showToast('LLM 照片识别失败：' + error.message, 'error');
  }

  // 识别完成，隐藏 VLM 动画
  hideVLMVisualization();

  // 识别完成后，自动检查缺失字段 → 弹出优化补全窗口
  setTimeout(() => {
    try { showOptimizationPopup(); } catch (e) { console.warn('[auto-opt-popup]', e); }
  }, 400);
}

function clearUnifiedPhoto() {
  if (vlmAnimationRunning) hideVLMVisualization();
  document.getElementById('uPhotoUploadZone').style.display = 'block';
  document.getElementById('uPhotoPreviewArea').style.display = 'none';
  document.getElementById('uPhotoPreviewImg').src = '';
  document.getElementById('vlm-photo').src = '';
  window._uPhotoBase64 = null;
  // 重置照片描述 + 报表显示开关
  if (document.getElementById('uPhotoCaption')) document.getElementById('uPhotoCaption').value = '';
  if (document.getElementById('uPhotoShowInReport')) document.getElementById('uPhotoShowInReport').checked = true;
}

// 统一保存
function saveUnifiedEvent(opts = {}) {
  const type = document.getElementById('m-type').value;
  const time = document.getElementById('m-time').value;
  const areaId = document.getElementById('m-area').value;
  const planId = document.getElementById('m-plan').value;
  const completionType = document.getElementById('m-completion-type').value;
  const formDate = document.getElementById('m-date').value;
  const eventDate = formDate || (selectedDates.length > 0 ? selectedDates[0] : M.TODAY);
  const buildingNo = document.getElementById('m-building-no').value;
  const floorNo = document.getElementById('m-floor-no').value;
  const mainOwner = document.getElementById('m-owner') ? document.getElementById('m-owner').value : '';

  if (!areaId && type !== 'drawing') { showToast('请选择区域', 'error'); return; }
  if (!eventDate) { showToast('请选择日期', 'error'); return; }

  let payload = {};
  switch(type) {
    case 'progress':
      const laborRows = document.querySelectorAll('#m-labor-rows .labor-row');
      const laborStats = {};
      let totalHeadcount = 0;
      laborRows.forEach((r, i) => {
        const t = document.getElementById('m-labor-type-' + i);
        const c = document.getElementById('m-labor-count-' + i);
        if (t && c && t.value.trim()) {
          laborStats[t.value.trim()] = parseInt(c.value) || 0;
          totalHeadcount += parseInt(c.value) || 0;
        }
      });
      const laborRequirements = [];
      laborRows.forEach((r, i) => {
        const t = document.getElementById('m-labor-type-' + i);
        const c = document.getElementById('m-labor-count-' + i);
        if (t && c && t.value.trim()) {
          laborRequirements.push({ trade: t.value.trim(), count: parseInt(c.value) || 0 });
        }
      });
      payload = {
        taskName: document.getElementById('m-task') ? document.getElementById('m-task').value : '',
        owner: mainOwner,
        progress: fixProgress(document.getElementById('m-progress') ? document.getElementById('m-progress').value : ''),
        headcount: totalHeadcount,
        laborStats: Object.keys(laborStats).length > 0 ? laborStats : undefined,
        laborRequirements: laborRequirements.length > 0 ? laborRequirements : undefined,
        description: document.getElementById('m-caption') ? document.getElementById('m-caption').value : ''
      };
      break;
    case 'material':
      payload = {
        materialName: document.getElementById('m-material') ? document.getElementById('m-material').value : '',
        spec: document.getElementById('m-spec') ? document.getElementById('m-spec').value : '',
        quantity: parseInt(document.getElementById('m-quantity') ? document.getElementById('m-quantity').value : 0) || 0,
        unit: document.getElementById('m-unit') ? document.getElementById('m-unit').value : '件',
        action: document.getElementById('m-action') ? document.getElementById('m-action').value : '进场'
      };
      break;
    case 'safety':
      const issues = document.getElementById('m-issues') ? document.getElementById('m-issues').value.split(';').map(s => s.trim()).filter(Boolean) : [];
      payload = {
        checkType: document.getElementById('m-checktype') ? document.getElementById('m-checktype').value : '',
        result: document.getElementById('m-result') ? document.getElementById('m-result').value : '正常',
        issues
      };
      break;
    case 'coordination':
      payload = {
        topic: document.getElementById('m-topic') ? document.getElementById('m-topic').value : '',
        parties: document.getElementById('m-parties') ? document.getElementById('m-parties').value.split(';').map(s => s.trim()).filter(Boolean) : [],
        summary: document.getElementById('m-summary') ? document.getElementById('m-summary').value : '',
        status: '已协调'
      };
      break;
    case 'issue':
      payload = {
        taskName: document.getElementById('m-task') ? document.getElementById('m-task').value : '',
        owner: mainOwner,
        progress: '',
        headcount: 0,
        description: document.getElementById('m-caption') ? document.getElementById('m-caption').value : ''
      };
      break;
    case 'attendance':
      payload = {
        headcount: parseInt(document.getElementById('m-att-count') ? document.getElementById('m-att-count').value : 0) || 0,
        status: document.getElementById('m-att-status') ? document.getElementById('m-att-status').value : '正常'
      };
      break;
    case 'drawing':
      payload = {
        taskName: document.getElementById('m-task') ? document.getElementById('m-task').value : '',
        owner: mainOwner,
        progress: document.getElementById('m-progress') ? document.getElementById('m-progress').value : '',
        description: document.getElementById('m-caption') ? document.getElementById('m-caption').value : ''
      };
      break;
  }

  const event = {
    id: `E${String(Date.now()).slice(-3)}`,
    projectId: currentProjectId,
    date: eventDate,
    time: time || new Date().toTimeString().slice(0, 5),
    type,
    areaId,
    planId: planId || undefined,
    completionType: planId ? completionType : undefined,
    buildingNo: buildingNo || undefined,
    floorNo: floorNo || undefined,
    owner: mainOwner || undefined,
    payload,
    submitter: '张明',
    source: _unifiedMode,
    confidence: _unifiedMode === 'manual' ? 1.0 : (parseFloat(document.getElementById('u-confidence') ? document.getElementById('u-confidence').textContent : '0') / 100 || 0.85),
    status: 'draft',
    note: document.getElementById('m-note').value
  };

  // 添加照片数据（仅拍照模式）
  if (_unifiedMode === 'photo' && window._uPhotoBase64) {
    const photoCaption = document.getElementById('uPhotoCaption')?.value?.trim()
      || payload.description || '现场照片';
    const showInReport = document.getElementById('uPhotoShowInReport')
      ? document.getElementById('uPhotoShowInReport').checked !== false
      : true;
    event.photos = [{ 
      id: `P${String(Date.now()).slice(-3)}`, 
      caption: photoCaption, 
      area: areaId, 
      data: window._uPhotoBase64,
      showInReport
    }];
  }

  // 添加原始文本（语音/拍照模式）
  if (_unifiedMode !== 'manual') {
    event.rawText = document.getElementById('uSharedText').value;
  }

  M.EVENTS.unshift(event);

  // 图纸深化事件：同步写入 DRAWING_DEEPENINGS（双写以兼容既有 8 条 seed 数据的展示逻辑）
  if (type === 'drawing') {
    if (typeof M.DRAWING_DEEPENINGS === 'undefined') M.DRAWING_DEEPENINGS = [];
    const exists = M.DRAWING_DEEPENINGS.find(d => d.eventId === event.id);
    const record = {
      id: exists ? exists.id : ('DD-E' + event.id),
      projectId: currentProjectId,
      task: payload.taskName || '',
      owner: payload.owner || '',
      progress: payload.progress || '',
      areaId: areaId || null,
      planId: planId || null,
      eventId: event.id,
      createdDate: eventDate
    };
    if (exists) Object.assign(exists, record);
    else M.DRAWING_DEEPENINGS.push(record);
    // 同步到后端
    fetch('http://localhost:3010/api/drawing-deepenings', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(record)
    }).catch(err => console.warn('[图纸深化] 保存失败:', err));
  }

  // 同步关联计划
  if (planId) {
    const plans = M.PLANS[currentProjectId] || [];
    const plan = plans.find(p => p.id === planId);
    if (plan) {
      if (payload.taskName) plan.taskName = payload.taskName;
      if (payload.progress) plan.progress = payload.progress;
    }
  }
  if (M.savePlansToStorage) M.savePlansToStorage();
  if (M.saveEventsToStorage) M.saveEventsToStorage();

  if (!opts.skipCloseModal) closeModal('modalManual');
  renderDailyPlanCard();
  renderFilteredEvents();
  renderStats();
  if (typeof updateCalendar === 'function') updateCalendar();
  showToast('事件已保存', 'success');
}

// ============================================================
// 手动录入（旧版重定向到统一录入）
// ============================================================
function openManualInput(planId) {
  openUnifiedInput('manual', planId);
}

// 渲染计划选择列表
function renderPlanSelect(dateStr) {
  const typeEl = document.getElementById('m-type');
  const eventType = typeEl ? typeEl.value : 'progress';
  const projectPlans = M.PLANS[currentProjectId] || [];
  
  const dayPlans = projectPlans.filter(p => {
    if (p.status === 'cancelled') return false;
    if (p.startDate && p.endDate) return p.startDate <= dateStr && p.endDate >= dateStr;
    if (p.date) return p.date === dateStr;
    return false;
  });
  
  const filteredPlans = dayPlans.filter(p => {
    const planType = p.type || 'progress';
    return planType === eventType;
  });
  
  let html = '<option value="">无（计划外工作）</option>';
  filteredPlans.forEach(plan => {
    html += `<option value="${plan.id}">📋 ${plan.taskName || plan.process}${plan.buildingNo ? ' · ' + plan.buildingNo : ''}${plan.floorNo ? ' · ' + plan.floorNo : ''}</option>`;
  });
  
  document.getElementById('m-plan').innerHTML = html;
}

// 选择计划后自动填充数据
let _prevPlanId = '';

function onPlanSelect(planId) {
  const hasData = document.getElementById('m-building-no').value ||
    document.getElementById('m-area').value ||
    (document.getElementById('m-task') && document.getElementById('m-task').value) ||
    (document.getElementById('m-owner') && document.getElementById('m-owner').value) ||
    (document.getElementById('m-progress') && document.getElementById('m-progress').value);

  // 如果已有数据且切换了计划，询问确认
  if (hasData && planId !== _prevPlanId && _prevPlanId !== undefined) {
    const msg = planId ? '切换计划将覆盖已填写数据，是否继续？' : '取消关联计划将清空已填写数据，是否继续？';
    showConfirm(msg, '切换关联计划', '🔄').then(proceed => {
      if (proceed) {
        doPlanSelect(planId);
      } else {
        // 恢复旧值
        document.getElementById('m-plan').value = _prevPlanId;
      }
    });
    return;
  }
  doPlanSelect(planId);
}

function doPlanSelect(planId) {
  _prevPlanId = planId;
  clearFieldDiffWarnings();
  if (!planId) {
    document.getElementById('m-completion-type').value = 'unplanned';
    document.getElementById('m-labor-warning').style.display = 'none';
    window._mPlanLabor = null;
    return;
  }
  
  // 有关联计划 → 完成类型自动设为计划内
  document.getElementById('m-completion-type').value = 'planned';

  const projectPlans = M.PLANS[currentProjectId] || [];
  const plan = projectPlans.find(p => p.id === planId);
  
  if (plan) {
    const planType = plan.type || plan.eventType;
    if (planType) {
      document.getElementById('m-type').value = planType;
      renderManualForm();
    }
    if (plan.buildingNo) document.getElementById('m-building-no').value = plan.buildingNo;
    if (plan.floorNo) document.getElementById('m-floor-no').value = plan.floorNo;
    if (plan.areaId || plan.area) document.getElementById('m-area').value = plan.areaId || plan.area;
    if (plan.owner) { const el = document.getElementById('m-owner'); if (el) el.value = plan.owner; }
    const taskName = plan.taskName || plan.process;
    if (taskName) { const el = document.getElementById('m-task'); if (el) el.value = taskName; }
    if (plan.progress) { const el = document.getElementById('m-progress'); if (el) el.value = plan.progress; }
    const laborList = plan.laborRequirements || plan.laborSchedule || [];
    window._mPlanLabor = laborList;
    renderManualLaborRows(laborList, plan);
    document.getElementById('m-completion-type').value = 'planned';
    checkAllFieldDiffs();
    showToast('已自动填充计划数据', 'success');
  }
}

function renderManualLaborRows(laborList, plan) {
  const container = document.getElementById('m-labor-rows');
  if (!container) return;
  if (!laborList || laborList.length === 0) {
    container.innerHTML = `<div class="form-row labor-row">
      <div class="form-group"><label class="form-label">工种</label><input class="form-input" type="text" id="m-labor-type-0" placeholder="如：木工" oninput="checkManualLaborDiff()"></div>
      <div class="form-group"><label class="form-label">人数</label><input class="form-input" type="number" id="m-labor-count-0" value="0" min="0" oninput="checkManualLaborDiff()"></div>
      <button class="btn btn-danger btn-sm" onclick="removeManualLaborRow(0)" style="margin-top:24px;">✕</button>
    </div>`;
    window._mlr = 1;
    return;
  }
  container.innerHTML = laborList.map((l, i) => `<div class="form-row labor-row">
    <div class="form-group"><label class="form-label">工种</label><input class="form-input" type="text" id="m-labor-type-${i}" value="${(l.trade||l.laborType||'')}" placeholder="如：木工" oninput="checkManualLaborDiff()"></div>
    <div class="form-group"><label class="form-label">人数</label><input class="form-input" type="number" id="m-labor-count-${i}" value="${l.count || 0}" min="0" oninput="checkManualLaborDiff()"></div>
    <button class="btn btn-danger btn-sm" onclick="removeManualLaborRow(${i})" style="margin-top:24px;">✕</button>
  </div>`).join('');
  window._mlr = laborList.length;
  checkManualLaborDiff();
}

// 删除某行劳动力，删除后重新编号所有后续行的 id，并同步 _mlr 计数
function removeManualLaborRow(index) {
  const container = document.getElementById('m-labor-rows');
  if (!container) return;
  const rows = container.querySelectorAll('.labor-row');
  if (rows.length <= 1) {
    // 至少保留一行：清空内容而不是删除
    const typeEl = document.getElementById('m-labor-type-0');
    const countEl = document.getElementById('m-labor-count-0');
    if (typeEl) typeEl.value = '';
    if (countEl) countEl.value = 0;
    showToast('至少保留一行，已清空该行内容', 'info');
    checkManualLaborDiff();
    return;
  }
  rows[index].remove();
  // 重新给剩余行编号 id（m-labor-type-X, m-labor-count-X）
  const remaining = container.querySelectorAll('.labor-row');
  remaining.forEach((row, i) => {
    const t = row.querySelector('input[id^="m-labor-type-"]');
    const c = row.querySelector('input[id^="m-labor-count-"]');
    const btn = row.querySelector('button[onclick*="removeManualLaborRow"]');
    if (t) t.id = 'm-labor-type-' + i;
    if (c) c.id = 'm-labor-count-' + i;
    if (btn) btn.setAttribute('onclick', `removeManualLaborRow(${i})`);
  });
  window._mlr = remaining.length;
  checkManualLaborDiff();
}

function addManualLaborRow() {
  const container = document.getElementById('m-labor-rows');
  if (!container) return;
  const idx = window._mlr || container.querySelectorAll('.labor-row').length;
  container.insertAdjacentHTML('beforeend', `<div class="form-row labor-row">
    <div class="form-group"><label class="form-label">工种</label><input class="form-input" type="text" id="m-labor-type-${idx}" placeholder="如：木工" oninput="checkManualLaborDiff()"></div>
    <div class="form-group"><label class="form-label">人数</label><input class="form-input" type="number" id="m-labor-count-${idx}" value="0" min="0" oninput="checkManualLaborDiff()"></div>
    <button class="btn btn-danger btn-sm" onclick="removeManualLaborRow(${idx})" style="margin-top:24px;">✕</button>
  </div>`);
  window._mlr = idx + 1;
  checkManualLaborDiff();
}

function checkManualLaborDiff() {
  const warn = document.getElementById('m-labor-warning');
  const planId = document.getElementById('m-plan').value;
  if (!warn || !planId) { if (warn) warn.style.display = 'none'; return; }
  const plan = window._mPlanLabor;
  const rows = document.querySelectorAll('#m-labor-rows .labor-row');
  let diff = false;
  const currentMap = {};
  rows.forEach((r, i) => {
    const t = document.getElementById('m-labor-type-' + i);
    const c = document.getElementById('m-labor-count-' + i);
    if (t && c && t.value.trim()) currentMap[t.value.trim()] = parseInt(c.value) || 0;
  });
  // 检查计划内的工种是否有变动
  for (const item of plan) {
    const trade = item.trade || item.laborType;
    if (!trade) continue;
    if (currentMap[trade] !== (item.count || 0)) { diff = true; break; }
  }
  // 检查是否有计划外新增的工种
  if (!diff) {
    for (const trade of Object.keys(currentMap)) {
      if (!plan.some(l => (l.trade||l.laborType) === trade)) { diff = true; break; }
    }
  }
  if (diff) {
    const details = plan.map(l => `${l.trade||l.laborType||''}${l.count}人`).filter(Boolean).join('、');
    warn.innerHTML = `⚠ 计划要求：${details}`;
    warn.style.display = 'inline-flex';
  } else {
    warn.style.display = 'none';
  }
}

function checkManualProgressOver100() {
  const tag = document.getElementById('m-progress-tag');
  if (!tag) return;
  const v = document.getElementById('m-progress').value.replace('%','');
  const num = parseInt(v);
  if (num > 100) {
    tag.innerHTML = '<span style="font-size:12px;">⚠️</span> 超过100%，将标为超额完成';
    tag.style.background = 'linear-gradient(135deg,#fef2f2,#fee2e2)';
    tag.style.borderColor = '#fecaca';
    tag.style.color = '#dc2626';
  } else {
    tag.innerHTML = '<span style="font-size:12px;">📌</span> 填总计划进度';
    tag.style.background = 'linear-gradient(135deg,#fef9c3,#fef3c7)';
    tag.style.borderColor = '#fde68a';
    tag.style.color = '#92400e';
  }
}

function checkDpProgressOver100() {
  const warn = document.getElementById('dp-progress-warn');
  if (!warn) return;
  const v = document.getElementById('dp-progress').value.replace('%','');
  const num = parseInt(v);
  warn.style.display = num > 100 ? 'inline' : 'none';
}

function renderManualForm() {
  const type = document.getElementById('m-type').value;
  
  let html = '';
  switch(type) {
    case 'progress':
      html = `
        <div class="form-group">
          <label class="form-label">工序/任务名称 <span class="req">*</span></label>
          <input class="form-input" type="text" id="m-task" placeholder="如：墙面基层处理">
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">进度 <span class="req">*</span>
              <span id="m-progress-tag" style="display:inline-flex;align-items:center;gap:4px;margin-left:6px;padding:2px 8px;font-size:10px;font-weight:400;color:#92400e;background:linear-gradient(135deg,#fef9c3,#fef3c7);border:1px solid #fde68a;border-radius:3px;transform:rotate(-1deg);box-shadow:1px 1px 3px rgba(0,0,0,0.08);">
                <span style="font-size:12px;">📌</span> 填总计划进度
              </span>
            </label>
            <input class="form-input" type="text" id="m-progress" placeholder="如：80%" oninput="checkManualProgressOver100()">
          </div>
          <div class="form-group">
            <label class="form-label">负责人</label>
            <input class="form-input" type="text" id="m-owner" placeholder="如：张师傅">
          </div>
        </div>
        <div style="margin:8px 0 4px;font-size:12px;font-weight:600;color:#334155;display:flex;align-items:center;gap:8px;">
          <span>🧑‍🏭 劳动力</span>
          <span id="m-labor-warning" style="display:none;font-size:10px;padding:2px 8px;border-radius:4px;background:#fef2f2;color:#dc2626;border:1px solid #fecaca;"></span>
        </div>
        <div id="m-labor-rows">
          <div class="form-row labor-row">
            <div class="form-group"><label class="form-label">工种</label><input class="form-input" type="text" id="m-labor-type-0" placeholder="如：木工" oninput="checkManualLaborDiff()"></div>
            <div class="form-group"><label class="form-label">人数</label><input class="form-input" type="number" id="m-labor-count-0" value="0" min="0" oninput="checkManualLaborDiff()"></div>
            <button class="btn btn-danger btn-sm" onclick="removeManualLaborRow(0)" style="margin-top:24px;">✕</button>
          </div>
        </div>
        <button class="btn btn-ghost btn-sm" onclick="addManualLaborRow()" style="margin:4px 0 8px;font-size:11px;padding:2px 10px;">+ 添加工种</button>
        <div class="form-group">
          <label class="form-label">描述</label>
          <input class="form-input" type="text" id="m-caption" placeholder="描述信息">
        </div>
      `;
      break;
    case 'material':
      html = `
        <div class="form-group">
          <label class="form-label">材料名称 <span class="req">*</span></label>
          <input class="form-input" type="text" id="m-material" placeholder="如：轻钢龙骨">
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">规格</label>
            <input class="form-input" type="text" id="m-spec" placeholder="如：50 系列">
          </div>
          <div class="form-group">
            <label class="form-label">数量 <span class="req">*</span></label>
            <input class="form-input" type="number" id="m-quantity" value="0" min="0">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">单位</label>
            <input class="form-input" type="text" id="m-unit" value="件">
          </div>
          <div class="form-group">
            <label class="form-label">操作类型</label>
            <select class="form-select" id="m-action">
              <option value="进场">进场</option>
              <option value="领用">领用</option>
              <option value="损耗">损耗</option>
            </select>
          </div>
        </div>
      `;
      break;
    case 'safety':
      html = `
        <div class="form-group">
          <label class="form-label">检查类型 <span class="req">*</span></label>
          <select class="form-select" id="m-checktype">
            <option value="日常安全巡检">日常安全巡检</option>
            <option value="隐患排查">隐患排查</option>
            <option value="专项检查">专项检查</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">检查结果 <span class="req">*</span></label>
          <select class="form-select" id="m-result">
            <option value="正常">正常</option>
            <option value="发现隐患">发现隐患</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">隐患描述（如有）</label>
          <textarea class="form-textarea" id="m-issues" rows="2" placeholder="多条用分号分隔"></textarea>
        </div>
      `;
      break;
    case 'coordination':
      html = `
        <div class="form-group">
          <label class="form-label">协调主题 <span class="req">*</span></label>
          <input class="form-input" type="text" id="m-topic" placeholder="如：天花高度调整">
        </div>
        <div class="form-group">
          <label class="form-label">参与方</label>
          <input class="form-input" type="text" id="m-parties" placeholder="甲方代表; 设计院">
        </div>
        <div class="form-group">
          <label class="form-label">协调结果</label>
          <textarea class="form-textarea" id="m-summary" rows="2" placeholder="协调结果摘要"></textarea>
        </div>
      `;
      break;
    case 'issue':
      html = `
        <div class="form-group">
          <label class="form-label">问题描述 <span class="req">*</span></label>
          <input class="form-input" type="text" id="m-task" placeholder="如：临时用电线路不规范">
        </div>
        <div class="form-group">
          <label class="form-label">负责人</label>
          <input class="form-input" type="text" id="m-owner" placeholder="如：王工">
        </div>
        <div class="form-group">
          <label class="form-label">详细说明</label>
          <textarea class="form-textarea" id="m-caption" rows="2" placeholder="问题详情及处理建议"></textarea>
        </div>
      `;
      break;
    case 'attendance':
      html = `
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">出勤人数 <span class="req">*</span></label>
            <input class="form-input" type="number" id="m-att-count" value="0" min="0">
          </div>
          <div class="form-group">
            <label class="form-label">出勤状态</label>
            <select class="form-select" id="m-att-status">
              <option value="正常">正常</option>
              <option value="迟到">有迟到</option>
              <option value="早退">有早退</option>
            </select>
          </div>
        </div>
      `;
      break;
    case 'drawing':
      html = `
        <div class="form-group">
          <label class="form-label">计划事项 <span class="req">*</span></label>
          <textarea class="form-textarea" id="m-task" rows="2" placeholder="如：1-2号咖啡厅样板段策划整理"></textarea>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">负责人</label>
            <input class="form-input" type="text" id="m-owner" placeholder="如：李欢">
          </div>
          <div class="form-group">
            <label class="form-label">当前进度</label>
            <input class="form-input" type="text" id="m-progress" placeholder="如：50%">
          </div>
        </div>
      `;
      break;
  }
  
  document.getElementById('manualDynamicForm').innerHTML = html;
  // 先保存 m-plan 选中值（filterManualFormByType 会清空被隐藏的 select）
  const _savedPlanId = document.getElementById('m-plan')?.value;
  filterManualFormByType();
  renderPlanSelect(M.TODAY);
  if (_savedPlanId) document.getElementById('m-plan').value = _savedPlanId;
}

function saveManualEvent() {
  saveUnifiedEvent();
}

// ============================================================
// 协调事宜表单
// ============================================================
let _editingIssueId = null;

function openIssueForm(issueId) {
  _editingIssueId = issueId || null;
  document.getElementById('i-title').value = '';
  document.getElementById('i-propose').value = '';
  document.getElementById('i-cooperate').value = '';
  document.getElementById('i-priority').value = 'medium';
  document.getElementById('i-deadline').value = '';
  document.getElementById('i-description').value = '';
  document.getElementById('i-resolution').value = '';
  document.getElementById('i-resolution-group').style.display = 'none';
  document.querySelector('#modalIssue .modal-title').textContent = _editingIssueId ? '🤝 编辑协调' : '🤝 新建协调';
  document.querySelector('#modalIssue .modal-footer .btn-primary').textContent = '保存';
  if (_editingIssueId) {
    const issue = M.ISSUES.find(i => i.id === _editingIssueId);
    if (issue) {
      document.getElementById('i-title').value = issue.title || '';
      document.getElementById('i-propose').value = issue.proposeDept || '';
      document.getElementById('i-cooperate').value = issue.cooperateDept || '';
      document.getElementById('i-priority').value = issue.priority || 'medium';
      document.getElementById('i-deadline').value = issue.deadline || '';
      document.getElementById('i-description').value = issue.description || '';
      document.getElementById('i-resolution').value = issue.resolution || '';
      if (issue.resolution) document.getElementById('i-resolution-group').style.display = '';
    }
  }
  showModal('modalIssue');
}

async function saveIssue() {
  const title = document.getElementById('i-title').value.trim();
  const proposeDept = document.getElementById('i-propose').value.trim();
  const cooperateDept = document.getElementById('i-cooperate').value.trim();
  const priority = document.getElementById('i-priority').value;
  const deadline = document.getElementById('i-deadline').value;
  const description = document.getElementById('i-description').value.trim();
  const resolution = document.getElementById('i-resolution').value.trim();

  if (!title || !proposeDept || !cooperateDept) {
    showToast('请填写必填字段', 'error');
    return;
  }

  const isEdit = !!_editingIssueId;
  if (isEdit) {
    const issue = M.ISSUES.find(i => i.id === _editingIssueId);
    if (issue) {
      issue.title = title;
      issue.proposeDept = proposeDept;
      issue.cooperateDept = cooperateDept;
      issue.priority = priority;
      issue.deadline = deadline;
      issue.description = description;
      issue.resolution = resolution;
      issue.updatedAt = new Date().toISOString();
    }
  } else {
    const issue = {
      id: `I${String(Date.now()).slice(-3)}`,
      projectId: currentProjectId,
      type: 'coordination',
      title,
      proposeDept,
      cooperateDept,
      priority: priority || 'medium',
      deadline: deadline || null,
      description: description || '',
      resolution: resolution || '',
      status: 'open',
      createdDate: M.TODAY
    };
    M.ISSUES.unshift(issue);
  }

  _editingIssueId = null;
  closeModal('modalIssue');
  renderIssues();
  showToast(isEdit ? '已更新' : '协调已创建', 'success');

  // 同步到 PostgreSQL（dr_issues 表）
  if (M.saveIssuesToStorage) {
    try { await M.saveIssuesToStorage(); } catch(e) { console.warn('[协调] 同步后端失败:', e.message); }
  }
}

function openIssueDetail(issueId) {
  openIssueForm(issueId);
}

// ============================================================
// ECC 销项管理
// ============================================================
function openEccEditor() {
  document.getElementById('eccFilterStatus').value = 'all';
  switchEccTab('summary');
  renderEccList();
  const mode = localStorage.getItem(`ecc_summary_mode_${currentProjectId}`) || 'auto';
  setEccSummaryMode(mode, false);
  showModal('modalEcc');
}

function switchEccTab(tab) {
  const entryTab = document.getElementById('eccTabEntry');
  const sumTab = document.getElementById('eccTabSummary');
  const entryPanel = document.getElementById('eccEntryPanel');
  const sumPanel = document.getElementById('eccSummaryPanel');
  if (tab === 'summary') {
    entryTab.classList.remove('active');
    sumTab.classList.add('active');
    entryPanel.style.display = 'none';
    sumPanel.style.display = 'flex';
    renderEccSummary();
  } else {
    sumTab.classList.remove('active');
    entryTab.classList.add('active');
    sumPanel.style.display = 'none';
    entryPanel.style.display = 'flex';
    renderEccList();
  }
}

function setEccSummaryMode(mode, rerender = true) {
  localStorage.setItem(`ecc_summary_mode_${currentProjectId}`, mode);
  const radio = document.querySelector(`input[name="eccSummaryMode"][value="${mode}"]`);
  if (radio) radio.checked = true;
  const hint = document.getElementById('eccSummaryModeHint');
  if (hint) {
    hint.textContent = mode === 'auto'
      ? '📊 自动从录入的 ECC 列表实时汇总'
      : '✏️ 手动输入汇总值，与录入数据无关';
  }
  if (rerender) renderEccSummary();
}

function renderEccSummary() {
  const mode = localStorage.getItem(`ecc_summary_mode_${currentProjectId}`) || 'auto';
  const box = document.getElementById('eccSummaryContent');
  if (!box) return;
  const auto = _calcEccAutoSummary();
  if (mode === 'auto') {
    box.innerHTML = _renderEccAutoSummary(auto);
  } else {
    const manual = _loadEccManualSummary();
    box.innerHTML = _renderEccManualSummary(manual, auto);
  }
}

function _calcEccAutoSummary() {
  const items = (M.ECC_ITEMS || []).filter(e => e.projectId === currentProjectId && e.id !== 'ECC099');
  const total = items.length;
  const closed = items.filter(e => e.status === 'closed').length;
  const closing = items.filter(e => e.status === 'closing').length;
  const open = items.filter(e => e.status === 'open').length;
  const rate = total > 0 ? ((closed / total) * 100).toFixed(2) + '%' : '—';
  return { total, closed, closing, open, rate };
}

function _loadEccManualSummary() {
  if (!M.ECC_SUMMARIES) M.ECC_SUMMARIES = {};
  const cur = M.ECC_SUMMARIES[currentProjectId] || { total: 0, closed: 0, closing: 0, open: 0, rate: '—', photos: [] };
  if (!cur.photos) cur.photos = [];
  return cur;
}

function _renderEccPhotoGrid(photos) {
  const list = photos || [];
  const imgs = list.map((p, i) => `
    <div style="position:relative;aspect-ratio:1;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:4px;overflow:hidden;">
      <img src="${p}" style="width:100%;height:100%;object-fit:cover;cursor:zoom-in;" onclick="enlargeEccSummaryPhoto(${i})">
      <button onclick="removeEccSummaryPhoto(${i})" style="position:absolute;top:2px;right:2px;background:rgba(0,0,0,0.6);color:#fff;border:none;border-radius:50%;width:20px;height:20px;cursor:pointer;font-size:11px;line-height:1;">✕</button>
    </div>
  `).join('');
  return `<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;padding:10px 14px;">${
    list.length === 0
      ? '<div style="grid-column:1/-1;text-align:center;color:#94a3b8;font-size:12px;padding:12px;">暂无汇总照片，点击右上方"📷 上传"添加</div>'
      : imgs
  }</div>`;
}

function _renderEccPhotoToolbar() {
  return `<div style="padding:8px 14px;background:#f8fafc;border-top:1px solid #e2e8f0;display:flex;align-items:center;gap:8px;">
    <input type="file" id="ecc-summary-photo-input" accept="image/*" multiple style="display:none" onchange="handleEccSummaryPhotoUpload(event)">
    <button type="button" class="btn btn-sm btn-secondary" onclick="document.getElementById('ecc-summary-photo-input').click()">📷 上传图片</button>
    <span style="font-size:11px;color:#94a3b8;">汇总照片，与数据源无关</span>
    <span id="eccSummaryPhotoCount" style="margin-left:auto;font-size:11px;color:#94a3b8;"></span>
  </div>`;
}

function _renderEccAutoSummary(s) {
  const photos = _loadEccManualSummary().photos || [];
  return `
    <div style="background:#fff;border:1px solid #cbd5e1;border-radius:6px;overflow:hidden;box-shadow:0 2px 6px rgba(0,0,0,0.05);">
      <div style="padding:10px 14px;background:#f1f5f9;border-bottom:1px solid #e2e8f0;font-size:13px;font-weight:600;color:#475569;">📊 自动汇总（实时来自录入数据）</div>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <thead>
          <tr style="background:#fff;">
            <th style="padding:10px;border-right:1px solid #cbd5e1;border-bottom:2px solid #cbd5e1;width:80px;">序号</th>
            <th style="padding:10px;border-right:1px solid #cbd5e1;border-bottom:2px solid #cbd5e1;">问题总数</th>
            <th style="padding:10px;border-right:1px solid #cbd5e1;border-bottom:2px solid #cbd5e1;">已关闭</th>
            <th style="padding:10px;border-right:1px solid #cbd5e1;border-bottom:2px solid #cbd5e1;">流程关闭中</th>
            <th style="padding:10px;border-right:1px solid #cbd5e1;border-bottom:2px solid #cbd5e1;">未关闭</th>
            <th style="padding:10px;border-bottom:2px solid #cbd5e1;">关闭率</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="padding:10px;border-right:1px solid #cbd5e1;border-bottom:1px solid #cbd5e1;text-align:center;">1</td>
            <td style="padding:10px;border-right:1px solid #cbd5e1;border-bottom:1px solid #cbd5e1;text-align:center;font-weight:700;font-size:18px;color:#0ea5e9;">${s.total}</td>
            <td style="padding:10px;border-right:1px solid #cbd5e1;border-bottom:1px solid #cbd5e1;text-align:center;font-weight:700;font-size:18px;color:#059669;">${s.closed}</td>
            <td style="padding:10px;border-right:1px solid #cbd5e1;border-bottom:1px solid #cbd5e1;text-align:center;font-weight:700;font-size:18px;color:#f59e0b;">${s.closing}</td>
            <td style="padding:10px;border-right:1px solid #cbd5e1;border-bottom:1px solid #cbd5e1;text-align:center;font-weight:700;font-size:18px;color:#ef4444;">${s.open}</td>
            <td style="padding:10px;border-bottom:1px solid #cbd5e1;text-align:center;font-weight:700;font-size:18px;color:#059669;">${s.rate}</td>
          </tr>
        </tbody>
      </table>
      ${_renderEccPhotoGrid(photos)}
      ${_renderEccPhotoToolbar()}
    </div>
    <div style="margin-top:8px;padding:8px 12px;background:#fef3c7;border-left:3px solid #f59e0b;border-radius:4px;font-size:12px;color:#78350f;">
      💡 提示：录入 TAB 修改 ECC 后，汇总数字会立即更新。汇总照片可随时上传，保存后周报 07 即可展示。
    </div>`;
}

function _renderEccManualSummary(m, auto) {
  return `
    <div style="background:#fff;border:1px solid #cbd5e1;border-radius:6px;overflow:hidden;box-shadow:0 2px 6px rgba(0,0,0,0.05);">
      <div style="padding:10px 14px;background:#f1f5f9;border-bottom:1px solid #e2e8f0;font-size:13px;font-weight:600;color:#475569;display:flex;align-items:center;gap:8px;">
        ✏️ 手动汇总
        <span style="font-size:11px;color:#94a3b8;font-weight:400;">（自动值参考：总数 ${auto.total} / 已关闭 ${auto.closed}）</span>
        <button class="btn btn-xs btn-secondary" onclick="fillEccManualFromAuto()" style="margin-left:auto;">📥 填入自动值</button>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <thead>
          <tr style="background:#fff;">
            <th style="padding:10px;border-right:1px solid #cbd5e1;border-bottom:2px solid #cbd5e1;width:80px;">序号</th>
            <th style="padding:10px;border-right:1px solid #cbd5e1;border-bottom:2px solid #cbd5e1;">问题总数</th>
            <th style="padding:10px;border-right:1px solid #cbd5e1;border-bottom:2px solid #cbd5e1;">已关闭</th>
            <th style="padding:10px;border-right:1px solid #cbd5e1;border-bottom:2px solid #cbd5e1;">流程关闭中</th>
            <th style="padding:10px;border-right:1px solid #cbd5e1;border-bottom:2px solid #cbd5e1;">未关闭</th>
            <th style="padding:10px;border-bottom:2px solid #cbd5e1;">关闭率</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="padding:10px;border-right:1px solid #cbd5e1;border-bottom:1px solid #cbd5e1;text-align:center;">1</td>
            <td style="padding:6px;border-right:1px solid #cbd5e1;border-bottom:1px solid #cbd5e1;"><input class="form-input ecc-sum-input" type="number" id="eccSumTotal" value="${m.total || 0}" min="0" oninput="recalcEccSummaryRate()"></td>
            <td style="padding:6px;border-right:1px solid #cbd5e1;border-bottom:1px solid #cbd5e1;"><input class="form-input ecc-sum-input" type="number" id="eccSumClosed" value="${m.closed || 0}" min="0" oninput="recalcEccSummaryRate()"></td>
            <td style="padding:6px;border-right:1px solid #cbd5e1;border-bottom:1px solid #cbd5e1;"><input class="form-input ecc-sum-input" type="number" id="eccSumClosing" value="${m.closing || 0}" min="0" oninput="recalcEccSummaryRate()"></td>
            <td style="padding:6px;border-right:1px solid #cbd5e1;border-bottom:1px solid #cbd5e1;"><input class="form-input ecc-sum-input" type="number" id="eccSumOpen" value="${m.open || 0}" min="0" oninput="recalcEccSummaryRate()"></td>
            <td style="padding:10px;border-bottom:1px solid #cbd5e1;text-align:center;font-weight:700;font-size:18px;color:#059669;" id="eccSumRate">${m.rate || '—'}</td>
          </tr>
        </tbody>
      </table>
      ${_renderEccPhotoGrid(m.photos || [])}
      ${_renderEccPhotoToolbar()}
      <div style="padding:10px 14px;background:#f8fafc;border-top:1px solid #e2e8f0;display:flex;justify-content:flex-end;gap:8px;">
        <button class="btn btn-sm btn-ghost" onclick="resetEccManualSummary()">重置</button>
        <button class="btn btn-sm btn-primary" onclick="saveEccManualSummary()">💾 保存手动值</button>
      </div>
    </div>
    <div style="margin-top:8px;padding:8px 12px;background:#dbeafe;border-left:3px solid #0ea5e9;border-radius:4px;font-size:12px;color:#0c4a6e;">
      💡 手动保存后，周报 07 ECC 销项页将优先使用这里的值（数字 + 汇总照片），不受录入数据变化影响。
    </div>`;
}

function handleEccSummaryPhotoUpload(ev) {
  const files = Array.from(ev.target.files || []);
  ev.target.value = '';
  const MAX = 5 * 1024 * 1024;
  const promises = files.map(f => new Promise((resolve, reject) => {
    if (f.size > MAX) return reject(new Error(`${f.name} 超过 5MB`));
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('读取失败'));
    reader.readAsDataURL(f);
  }));
  Promise.all(promises).then(datas => {
    const cur = _loadEccManualSummary();
    cur.photos = (cur.photos || []).concat(datas);
    if (!M.ECC_SUMMARIES[currentProjectId]) M.ECC_SUMMARIES[currentProjectId] = cur;
    M.ECC_SUMMARIES[currentProjectId].photos = cur.photos;
    renderEccSummary();
    showToast(`已添加 ${datas.length} 张照片`, 'success');
  }).catch(err => showToast(err.message, 'error'));
}

function removeEccSummaryPhoto(idx) {
  const cur = _loadEccManualSummary();
  cur.photos.splice(idx, 1);
  if (!M.ECC_SUMMARIES[currentProjectId]) M.ECC_SUMMARIES[currentProjectId] = cur;
  M.ECC_SUMMARIES[currentProjectId].photos = cur.photos;
  renderEccSummary();
}

function enlargeEccSummaryPhoto(idx) {
  const photos = _loadEccManualSummary().photos || [];
  const overlay = document.getElementById('photoEnlargeOverlay');
  document.getElementById('photoEnlargeImg').src = photos[idx];
  overlay.style.display = 'flex';
}

function fillEccManualFromAuto() {
  const a = _calcEccAutoSummary();
  document.getElementById('eccSumTotal').value = a.total;
  document.getElementById('eccSumClosed').value = a.closed;
  document.getElementById('eccSumClosing').value = a.closing;
  document.getElementById('eccSumOpen').value = a.open;
  recalcEccSummaryRate();
  showToast('已填入自动值', 'success');
}

function recalcEccSummaryRate() {
  const total = Number(document.getElementById('eccSumTotal').value) || 0;
  const closed = Number(document.getElementById('eccSumClosed').value) || 0;
  const rate = total > 0 ? ((closed / total) * 100).toFixed(2) + '%' : '—';
  document.getElementById('eccSumRate').textContent = rate;
}

function resetEccManualSummary() {
  if (!M.ECC_SUMMARIES) M.ECC_SUMMARIES = {};
  delete M.ECC_SUMMARIES[currentProjectId];
  renderEccSummary();
  showToast('已重置', 'info');
}

async function saveEccManualSummary() {
  if (!M.ECC_SUMMARIES) M.ECC_SUMMARIES = {};
  const cur = M.ECC_SUMMARIES[currentProjectId] || { photos: [] };
  const item = {
    total: Number(document.getElementById('eccSumTotal').value) || 0,
    closed: Number(document.getElementById('eccSumClosed').value) || 0,
    closing: Number(document.getElementById('eccSumClosing').value) || 0,
    open: Number(document.getElementById('eccSumOpen').value) || 0,
    rate: document.getElementById('eccSumRate').textContent,
    photos: cur.photos || []
  };
  M.ECC_SUMMARIES[currentProjectId] = item;
  try {
    await fetch('http://localhost:3010/api/ecc-summary', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: currentProjectId, ...item })
    });
    showToast('手动汇总已保存', 'success');
  } catch (e) {
    showToast('已保存到本地，后端同步失败：' + e.message, 'error');
  }
}

function _eccFiltered() {
  const filter = document.getElementById('eccFilterStatus')?.value || 'all';
  const all = (M.ECC_ITEMS || []).filter(e => e.projectId === currentProjectId && e.id !== 'ECC099');
  if (filter === 'all') return all;
  return all.filter(e => e.status === filter);
}

function _eccStatusLabel(s) {
  return { open: '未关闭', closing: '流程关闭中', closed: '已关闭' }[s] || s;
}

function _eccStatusColor(s) {
  return { open: '#ef4444', closing: '#f59e0b', closed: '#059669' }[s] || '#64748b';
}

function _eccAreaName(areaId) {
  const a = (M.AREAS[currentProjectId] || []).find(x => x.id === areaId);
  return a ? a.name : (areaId || '—');
}

function renderEccList() {
  const items = _eccFiltered();
  const container = document.getElementById('eccListContainer');
  if (items.length === 0) {
    container.innerHTML = '<div style="text-align:center;padding:40px;color:#94a3b8;font-size:13px;">暂无 ECC 销项数据，点击右上「+ 新增 ECC」开始录入</div>';
    return;
  }
  container.innerHTML = `
    <table style="width:100%;border-collapse:collapse;font-size:12px;">
      <thead>
        <tr style="background:#f1f5f9;color:#475569;position:sticky;top:0;z-index:2;box-shadow:0 1px 0 #cbd5e1;">
          <th style="padding:6px 8px;border:1px solid #e2e8f0;width:50px;text-align:center;">序</th>
          <th style="padding:6px 8px;border:1px solid #e2e8f0;">问题描述</th>
          <th style="padding:6px 8px;border:1px solid #e2e8f0;width:90px;">区域</th>
          <th style="padding:6px 8px;border:1px solid #e2e8f0;width:90px;">发现日</th>
          <th style="padding:6px 8px;border:1px solid #e2e8f0;width:90px;">关闭日</th>
          <th style="padding:6px 8px;border:1px solid #e2e8f0;width:80px;">状态</th>
          <th style="padding:6px 8px;border:1px solid #e2e8f0;width:70px;">照片</th>
          <th style="padding:6px 8px;border:1px solid #e2e8f0;width:110px;text-align:center;">操作</th>
        </tr>
      </thead>
      <tbody>
        ${items.map((e, i) => {
          const photoCount = (e.photos || []).length;
          return `
          <tr data-ecc-id="${e.id}">
            <td style="padding:6px 8px;border:1px solid #e2e8f0;text-align:center;">${i + 1}</td>
            <td style="padding:6px 8px;border:1px solid #e2e8f0;">${escapeHtml(e.title || '')}</td>
            <td style="padding:6px 8px;border:1px solid #e2e8f0;">${escapeHtml(_eccAreaName(e.areaId))}</td>
            <td style="padding:6px 8px;border:1px solid #e2e8f0;">${e.discoveredDate || '—'}</td>
            <td style="padding:6px 8px;border:1px solid #e2e8f0;">${e.closedDate || '—'}</td>
            <td style="padding:6px 8px;border:1px solid #e2e8f0;color:${_eccStatusColor(e.status)};font-weight:600;">${_eccStatusLabel(e.status)}</td>
            <td style="padding:6px 8px;border:1px solid #e2e8f0;text-align:center;">${photoCount > 0 ? `📷 ${photoCount}` : '—'}</td>
            <td style="padding:6px 8px;border:1px solid #e2e8f0;text-align:center;">
              <button class="btn btn-xs btn-ghost" onclick="openEccItemForm('${e.id}')" style="color:#0ea5e9;">✏️</button>
              <button class="btn btn-xs btn-ghost" onclick="deleteEccItem('${e.id}')" style="color:#ef4444;">🗑</button>
            </td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>`;
}

function openEccItemForm(id) {
  const areaSel = document.getElementById('ecc-area');
  areaSel.innerHTML = '<option value="">— 请选择 —</option>' +
    (M.AREAS[currentProjectId] || []).map(a => `<option value="${a.id}">${escapeHtml(a.name)}</option>`).join('');
  document.getElementById('eccFormTitle').textContent = id ? '编辑 ECC' : '新增 ECC';
  _eccFormPhotos = [];
  renderEccPhotoPreview();
  if (id) {
    const e = (M.ECC_ITEMS || []).find(x => x.id === id);
    if (!e) { showToast('未找到 ECC 记录', 'error'); return; }
    document.getElementById('ecc-id').value = e.id;
    document.getElementById('ecc-title').value = e.title || '';
    document.getElementById('ecc-area').value = e.areaId || '';
    document.getElementById('ecc-status').value = e.status || 'open';
    document.getElementById('ecc-discovered-date').value = e.discoveredDate || '';
    document.getElementById('ecc-closed-date').value = e.closedDate || '';
    _eccFormPhotos = (e.photos || []).slice();
    renderEccPhotoPreview();
  } else {
    document.getElementById('ecc-id').value = '';
    document.getElementById('ecc-title').value = '';
    document.getElementById('ecc-area').value = '';
    document.getElementById('ecc-status').value = 'open';
    document.getElementById('ecc-discovered-date').value = M.TODAY;
    document.getElementById('ecc-closed-date').value = '';
  }
  showModal('modalEccItem');
}

function closeEccItemForm() {
  closeModal('modalEccItem');
  _eccFormPhotos = [];
}

let _eccFormPhotos = [];

function handleEccPhotoUpload(ev) {
  const files = Array.from(ev.target.files || []);
  ev.target.value = '';
  const MAX = 5 * 1024 * 1024;
  const promises = files.map(f => new Promise((resolve, reject) => {
    if (f.size > MAX) return reject(new Error(`${f.name} 超过 5MB`));
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('读取失败'));
    reader.readAsDataURL(f);
  }));
  Promise.all(promises).then(datas => {
    datas.forEach(d => _eccFormPhotos.push(d));
    renderEccPhotoPreview();
  }).catch(err => showToast(err.message, 'error'));
}

function renderEccPhotoPreview() {
  const box = document.getElementById('ecc-photo-preview');
  if (!_eccFormPhotos.length) {
    box.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:#94a3b8;font-size:12px;padding:16px;">暂无照片</div>';
    return;
  }
  box.innerHTML = _eccFormPhotos.map((p, i) => `
    <div style="position:relative;aspect-ratio:1;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:4px;overflow:hidden;">
      <img src="${p}" style="width:100%;height:100%;object-fit:cover;cursor:zoom-in;" onclick="enlargeEccPhoto(${i})">
      <button onclick="removeEccFormPhoto(${i})" style="position:absolute;top:2px;right:2px;background:rgba(0,0,0,0.6);color:#fff;border:none;border-radius:50%;width:20px;height:20px;cursor:pointer;font-size:11px;line-height:1;">✕</button>
    </div>
  `).join('');
}

function removeEccFormPhoto(idx) {
  _eccFormPhotos.splice(idx, 1);
  renderEccPhotoPreview();
}

function enlargeEccPhoto(idx) {
  const overlay = document.getElementById('photoEnlargeOverlay');
  document.getElementById('photoEnlargeImg').src = _eccFormPhotos[idx];
  overlay.style.display = 'flex';
}

async function saveEccItem() {
  const title = document.getElementById('ecc-title').value.trim();
  if (!title) { showToast('请填写问题描述', 'error'); return; }
  const status = document.getElementById('ecc-status').value;
  const discoveredDate = document.getElementById('ecc-discovered-date').value;
  let closedDate = document.getElementById('ecc-closed-date').value;
  if (status === 'closed' && !closedDate) closedDate = M.TODAY;
  if (status !== 'closed') closedDate = '';
  const id = document.getElementById('ecc-id').value || `ECC${String(Date.now()).slice(-6)}`;
  const item = {
    id,
    projectId: currentProjectId,
    title,
    areaId: document.getElementById('ecc-area').value,
    discoveredDate,
    status,
    closedDate,
    photos: _eccFormPhotos.slice()
  };
  // 写内存
  if (!M.ECC_ITEMS) M.ECC_ITEMS = [];
  const idx = M.ECC_ITEMS.findIndex(e => e.id === id);
  if (idx > -1) M.ECC_ITEMS[idx] = item;
  else M.ECC_ITEMS.unshift(item);
  // 同步到后端
  try {
    const r = await fetch('http://localhost:3010/api/ecc-items', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item)
    });
    if (!r.ok) throw new Error('保存失败');
    showToast(idx > -1 ? 'ECC 已更新' : 'ECC 已创建', 'success');
  } catch (e) {
    showToast('已保存到本地，但后端同步失败：' + e.message, 'error');
  }
  renderEccList();
  closeEccItemForm();
}

async function deleteEccItem(id) {
  const confirmed = await showConfirm('确定删除此 ECC 销项？', '删除 ECC', '🗑');
  if (!confirmed) return;
  if (!M.ECC_ITEMS) M.ECC_ITEMS = [];
  M.ECC_ITEMS = M.ECC_ITEMS.filter(e => e.id !== id);
  try {
    await fetch(`http://localhost:3010/api/ecc-items/${currentProjectId}/${id}`, { method: 'DELETE' });
    showToast('已删除', 'success');
  } catch (e) {
    showToast('已从本地删除，后端同步失败：' + e.message, 'error');
  }
  renderEccList();
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ============================================================
// 周报生成
// ============================================================
async function openWeeklyReport() {
  const today = new Date(M.TODAY);
  const dayOfWeek = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  
  const weekStart = formatDateObj(monday);
  const weekEnd = formatDateObj(sunday);
  
  let report = null;
  try {
    const r = await fetch('http://localhost:3010/api/aggregate-weekly', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId: currentProjectId,
        projectName: M.PROJECTS.find(p => p.id === currentProjectId)?.name || currentProjectId,
        client: M.PROJECTS.find(p => p.id === currentProjectId)?.client || '',
        weekStart, weekEnd,
        events: M.EVENTS,
        issues: M.ISSUES,
        areas: M.AREAS[currentProjectId] || []
      })
    });
    if (r.ok) report = await r.json();
  } catch (e) {
    console.warn('周报聚合 LLM 失败:', e.message);
  }

  if (!report) {
    document.getElementById('weeklyReportContent').innerHTML = `<div style="padding:40px;text-align:center;color:#ef4444;font-size:14px;">❌ 周报聚合需要 LLM 服务，当前不可用（请检查后端连接）</div>`;
    showModal('modalWeekly');
    return;
  }

  const rpt = report;
  
  let html = `
    <div style="margin-bottom:20px; padding-bottom:16px; border-bottom:1px solid #e2e8f0;">
      <div style="font-size:18px; font-weight:600; color:#0f172a; margin-bottom:4px;">${rpt.projectName || M.PROJECTS.find(p => p.id === currentProjectId)?.name || ''}</div>
      <div style="font-size:13px; color:#64748b;">${rpt.client || ''} · ${rpt.weekRange || weekStart + ' ~ ' + weekEnd}</div>
    </div>
    
    <div class="weekly-section">
      <div class="weekly-section-title">一、本周概述</div>
      <div class="weekly-section-content">${rpt.overview || '暂无数据'}</div>
    </div>
    
    <div class="weekly-section">
      <div class="weekly-section-title">二、区域进度</div>
      <div style="padding:0 14px;">
        ${(rpt.progressByArea || []).map(area => `
          <div class="weekly-area-card">
            <div class="weekly-area-name">📍 ${area.areaName}</div>
            <div class="weekly-area-tasks">负责人：${area.manager}<br>${area.tasks}</div>
          </div>
        `).join('')}
      </div>
    </div>
    
    <div class="weekly-section">
      <div class="weekly-section-title">三、专项事项</div>
      <div class="weekly-section-content">
        总事项数：${(rpt.issuesSummary || {}).total || 0} 项<br>
        待处理：${(rpt.issuesSummary || {}).open || 0} 项 | 处理中：${(rpt.issuesSummary || {}).inProgress || 0} 项 | 已闭环：${(rpt.issuesSummary || {}).closed || 0} 项<br>
        <div style="margin-top:8px; white-space:pre-wrap; font-size:13px; color:#475569;">${(rpt.issuesSummary || {}).details || ''}</div>
      </div>
    </div>

    <div class="weekly-section">
      <div class="weekly-section-title">四、协调事宜（未闭环）</div>
      <div style="padding:0 14px;">
        ${rpt.coordinationIssues && rpt.coordinationIssues.length > 0 ? `
        <table style="width:100%; border-collapse:collapse; font-size:12px; border:1px solid #bae6fd;">
          <thead>
            <tr style="background:#0ea5e9; color:#fff;">
              <th style="padding:6px; border:1px solid #bae6fd; width:40px;">序号</th>
              <th style="padding:6px; border:1px solid #bae6fd;">需协调事宜</th>
              <th style="padding:6px; border:1px solid #bae6fd; width:110px;">提出部门</th>
              <th style="padding:6px; border:1px solid #bae6fd; width:110px;">配合部门</th>
            </tr>
          </thead>
          <tbody>
            ${rpt.coordinationIssues.map((c, i) => `
            <tr style="background:${i % 2 === 0 ? '#dbeafe' : '#eff6ff'};">
              <td style="padding:6px; border:1px solid #bae6fd; text-align:center;">${c.seq}</td>
              <td style="padding:6px; border:1px solid #bae6fd;">${c.title || '—'}</td>
              <td style="padding:6px; border:1px solid #bae6fd; text-align:center;">${c.proposeDept}</td>
              <td style="padding:6px; border:1px solid #bae6fd; text-align:center;">${c.cooperateDept}</td>
            </tr>`).join('')}
          </tbody>
        </table>
        ` : `<div style="text-align:center; padding:20px; color:#94a3b8; font-size:13px;">本周无未闭环的协调事宜</div>`}
      </div>
    </div>

    <div class="weekly-section">
      <div class="weekly-section-title">五、安全与材料</div>
      <div class="weekly-section-content">
        🔍 安全巡检：${(rpt.safetyStats || {}).checkCount || 0} 次（发现隐患 ${(rpt.safetyStats || {}).issueCount || 0} 项）<br>
        📦 材料进场：${(rpt.materialStats || {}).inboundCount || 0} 批次
      </div>
    </div>
    
    <div class="weekly-section">
      <div class="weekly-section-title">六、下周计划</div>
      <div class="weekly-section-content" style="list-style-type:decimal; padding-left:20px;">
        ${(rpt.nextWeekPlan || []).map((item, i) => `<li>${item}</li>`).join('')}
      </div>
    </div>
    
    <div style="margin-top:20px; padding-top:16px; border-top:1px dashed #cbd5e1; text-align:right; font-size:12px; color:#94a3b8;">
      生成时间：${new Date().toLocaleString('zh-CN')} | ${rpt.source === 'llm' ? 'LLM 生成' : '公式生成'}
    </div>
  `;
  
  document.getElementById('weeklyReportContent').innerHTML = html;
  showModal('modalWeekly');
}

function exportWeeklyReport() {
  showToast('周报已导出到周报系统', 'success');
  closeModal('modalWeekly');
}

// ============================================================
// 周报数据映射预览（原型）
// ============================================================
function openWeeklyReportMapping() {
  closeModal('modalWeekly');
  showModal('modalWeeklyMapping');
  // 初始化日期输入为当天
  const input = document.getElementById('reportDateInput');
  if (input) {
    _reportDate = M.TODAY;
    input.value = M.TODAY;
    _updateWeekRangeDisplay();
  }
  // 初始化区间选择器（默认当前周）
  const rs = document.getElementById('reportRangeStart');
  const re = document.getElementById('reportRangeEnd');
  const wr = getWeekRange();
  if (rs) { _reportRangeStart = wr.weekStart; rs.value = wr.weekStart; }
  if (re) { _reportRangeEnd = wr.weekEnd; re.value = wr.weekEnd; }
  _updateReportRangeDisplay();
  _applyTemplate();
  switchMappingTab('01');
}

const PAGE_HEADERS = {
  '02':   { title:'目录/Contents',        subtitle:'',                 pad:100 },
  '03':   { title:'一、组织架构',          subtitle:'到岗管理人员名单', pad:122 },
  '04':   { title:'项目重要节点一览表',    subtitle:'项目重要节点',     pad:125 },
  '05':   { title:'二、上周工作完成情况',  subtitle:'2.1 上周重要工作完成', pad:130 },
  '06':   { title:'二、上周工作',          subtitle:'2.2 高管层现场工作', pad:130 },
  '07':   { title:'二、上周工作',          subtitle:'2.12 现场工作：人员统计', pad:130 },
  '08':   { title:'二、上周工作',          subtitle:'2.13 ECC销项情况', pad:130 },
  '09':   { title:'二、上周工作',          subtitle:'2.14 图纸深化情况', pad:130 },
  '10':   { title:'三、下周计划',          subtitle:'3.1 周工作计划', pad:130 },
  '11':   { title:'四、工作计划',          subtitle:'', pad:130 },
  '12':   { title:'五、协调事宜',          subtitle:'5.1 协调事宜', pad:130 }
};

function switchMappingTab(page) {
  document.getElementById('pageFloatingControls').innerHTML = '';
  document.querySelectorAll('#reportPageNav button[data-page]').forEach(t => t.classList.remove('active'));
  const btn = document.querySelector(`#reportPageNav button[data-page="${page}"]`);
  if (btn) btn.classList.add('active');
  const map = {
    '01': renderMappingPage01,
    '02': renderMappingPage02,
    '03': renderMappingPage03,
    '04': renderMappingPage0301,
    '05': renderMappingPage04,
    '06': renderMappingPage05,
    '07': renderMappingPage06,
    '08': renderMappingPage07,
    '09': renderMappingPage08,
    '10': renderMappingPage09,
    '11': renderMappingPage10,
    '12': renderMappingPage12
  };
  (map[page] || renderMappingPage04)();

  // 为页面 02-12 套上模版边框 + 标题 + 副标题
  if (page !== '01' && page !== undefined) {
    const el = document.getElementById('mappingContent');
    const hc = _getHeaderColor();
    const bg = _getBgCss();
    const noBg = bg === 'none' ? ' no-bg' : '';
    const bgStyle = bg === 'none' ? '' : `background:${bg};`;
    const ph = PAGE_HEADERS[page];
    const pad = ph ? ph.pad : 80;
    const titleHtml = ph && ph.title
      ? `<div style="position:absolute;top:20px;left:72px;font-size:30px;font-weight:700;color:${hc};z-index:2;letter-spacing:2px;">${ph.title}</div>`
      : '';
    // 04 重要节点分页按钮嵌入副标题右侧（attendance-toggle-bar 使打印时隐藏）
    const is0301Split = page === '04' && _milestonePages.length > 1;
    const totalP = _milestonePages.length;
    let subBtnHtml = is0301Split
      ? `<div class="attendance-toggle-bar" style="position:absolute;top:82px;left:365px;height:38px;line-height:38px;z-index:3;display:flex;align-items:center;gap:4px;">
          ${_milestonePage > 0 ? `<button style="background:rgba(255,255,255,0.85);color:#374151;border:1px solid #d1d5db;border-radius:4px;padding:1px 10px;cursor:pointer;font-size:12px;font-weight:600;" onclick="_milestonePage=${_milestonePage-1};switchMappingTab('04')">← 前页</button>` : ''}
          <span style="color:#1f2937;font-size:12px;font-weight:600;">${_milestonePage+1}/${totalP}</span>
          ${_milestonePage < totalP - 1 ? `<button style="background:rgba(255,255,255,0.85);color:#374151;border:1px solid #d1d5db;border-radius:4px;padding:1px 10px;cursor:pointer;font-size:12px;font-weight:600;" onclick="_milestonePage=${_milestonePage+1};switchMappingTab('04')">后页 →</button>` : ''}
        </div>`
      : '';
    // 05 工作完成分页按钮（沿用重要节点模板）
    const is04Split = page === '05' && _page04Pages.length > 1;
    const totalP04 = _page04Pages.length;
    if (is04Split) {
      subBtnHtml = `<div class="attendance-toggle-bar" style="position:absolute;top:82px;left:365px;height:38px;line-height:38px;z-index:3;display:flex;align-items:center;gap:4px;">
          ${_page04Page > 0 ? `<button style="background:rgba(255,255,255,0.85);color:#374151;border:1px solid #d1d5db;border-radius:4px;padding:1px 10px;cursor:pointer;font-size:12px;font-weight:600;" onclick="_page04Page=${_page04Page-1};switchMappingTab('05')">← 前页</button>` : ''}
          <span style="color:#1f2937;font-size:12px;font-weight:600;">${_page04Page+1}/${totalP04}</span>
          ${_page04Page < totalP04 - 1 ? `<button style="background:rgba(255,255,255,0.85);color:#374151;border:1px solid #d1d5db;border-radius:4px;padding:1px 10px;cursor:pointer;font-size:12px;font-weight:600;" onclick="_page04Page=${_page04Page+1};switchMappingTab('05')">后页 →</button>` : ''}
        </div>`;
    }
    // 06 现场照片分页按钮（沿用重要节点模板）
    const is05Split = page === '06' && _page05Pages.length > 1;
    const totalP05 = _page05Pages.length;
    if (is05Split) {
      subBtnHtml = `<div class="attendance-toggle-bar" style="position:absolute;top:82px;left:365px;height:38px;line-height:38px;z-index:3;display:flex;align-items:center;gap:4px;">
          ${_page05Page > 0 ? `<button style="background:rgba(255,255,255,0.85);color:#374151;border:1px solid #d1d5db;border-radius:4px;padding:1px 10px;cursor:pointer;font-size:12px;font-weight:600;" onclick="_page05Page=${_page05Page-1};switchMappingTab('06')">← 前页</button>` : ''}
          <span style="color:#1f2937;font-size:12px;font-weight:600;">${_page05Page+1}/${totalP05}</span>
          ${_page05Page < totalP05 - 1 ? `<button style="background:rgba(255,255,255,0.85);color:#374151;border:1px solid #d1d5db;border-radius:4px;padding:1px 10px;cursor:pointer;font-size:12px;font-weight:600;" onclick="_page05Page=${_page05Page+1};switchMappingTab('06')">后页 →</button>` : ''}
        </div>`;
    }
    // 10 分页按钮：按楼栋/施工段 sub-page 切换（每 section 2 个 sub-page：图、表交替）
    const sections10 = (M.getPageSectionsData(currentProjectId) || []);
    const is10Split = page === '11' && sections10.length > 0;
    const totalP10 = sections10.length * 2;
    if (is10Split) {
      subBtnHtml += `<div class="attendance-toggle-bar" style="position:absolute;top:82px;left:520px;height:38px;line-height:38px;z-index:3;display:flex;align-items:center;gap:4px;">
          ${_page10Page > 0 ? `<button style="background:rgba(255,255,255,0.85);color:#374151;border:1px solid #d1d5db;border-radius:4px;padding:1px 10px;cursor:pointer;font-size:12px;font-weight:600;" onclick="_page10Page=${_page10Page-1};switchMappingTab('11')">← 前页</button>` : ''}
          <span style="color:#1f2937;font-size:12px;font-weight:600;">${_page10Page+1}/${totalP10}</span>
          ${_page10Page < totalP10 - 1 ? `<button style="background:rgba(255,255,255,0.85);color:#374151;border:1px solid #d1d5db;border-radius:4px;padding:1px 10px;cursor:pointer;font-size:12px;font-weight:600;" onclick="_page10Page=${_page10Page+1};switchMappingTab('11')">后页 →</button>` : ''}
        </div>`;
    }
    const subHtml = ph && ph.subtitle
      ? `<div style="position:absolute;top:82px;left:72px;width:285px;height:38px;background:linear-gradient(to right,#facc15,#f43f5e);z-index:2;border-radius:0 2px 2px 0;"></div>
         <div style="position:absolute;top:82px;left:72px;height:38px;line-height:38px;padding-left:12px;color:#fff;font-size:16px;font-weight:700;z-index:3;letter-spacing:1px;">${ph.subtitle}</div>
         ${subBtnHtml}`
      : '';
    el.innerHTML = `<div class="report-page-frame${noBg}" style="width:1280px;height:720px;position:relative;overflow:hidden;${bgStyle}">
      <div class="report-page-header" style="position:absolute;top:0;left:0;right:0;height:75px;z-index:1;">
        <div class="trapezoid" style="position:absolute;top:23px;left:0;width:58px;height:52px;background:${hc};clip-path:polygon(0 0,60% 0,100% 100%,0 100%);"></div>
        <div class="header-line" style="position:absolute;top:75px;left:72px;right:0;height:3px;background:${hc};"></div>
      </div>
      ${titleHtml}
      ${subHtml}
      <div class="report-page-content" style="width:1280px;height:720px;padding:${pad}px 30px 20px;box-sizing:border-box;overflow:hidden;">${el.innerHTML}</div>
    </div>`;
  }
}

function getWeekRange(dateStr) {
  if (_reportRangeStart && _reportRangeEnd) {
    return { weekStart: _reportRangeStart, weekEnd: _reportRangeEnd };
  }
  const base = dateStr || _reportDate || M.TODAY;
  const today = new Date(base);
  const dayOfWeek = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return {
    weekStart: formatDateObj(monday),
    weekEnd: formatDateObj(sunday)
  };
}

function renderEmptyPage(msg) {
  document.getElementById('mappingContent').innerHTML = `
    <div style="text-align:center; padding:40px 0; color:#94a3b8; font-size:14px;">${msg}</div>`;
}

function renderMappingPage01() {
  const data = M.getPage01Data(currentProjectId, _reportDate || null);
  if (!data) { renderEmptyPage('暂无项目数据'); return; }
  const hc = _getHeaderColor();
  const bg = _getBgCss();
  const el = document.getElementById('mappingContent');
  el.style.background = bg;
  // 恢复 .frame-content 的固定 720 高度（避免被 06 页设置的 height:auto 污染）
  el.style.height = '720px';
  el.style.minHeight = '';
  el.style.overflow = 'hidden';
  el.innerHTML = `
<div style="width:100%;height:100%;background:${bg};display:flex;flex-direction:column;font-family:'Microsoft YaHei','PingFang SC',sans-serif;">
  <header style="padding:32px 0 0 48px;flex-shrink:0;">
    <div style="display:flex;align-items:center;gap:16px;">
      <h1 style="color:#0081cc;font-size:24px;font-weight:700;letter-spacing:0.2em;margin:0;">中建三局集团（深圳）有限公司</h1>
      <div style="flex:1;height:16px;background:${hc};margin-top:4px;"></div>
    </div>
  </header>
  <section style="flex:1;display:flex;align-items:center;justify-content:center;">
    <div style="width:100%;background:${hc};padding:64px 48px;position:relative;overflow:hidden;display:flex;flex-direction:column;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(0,0,0,0.15);">
      <div style="position:absolute;inset:0;background:linear-gradient(to right,transparent,rgba(255,255,255,0.08),transparent);"></div>
      <div style="position:relative;z-index:10;text-align:center;">
        <h2 style="color:#fff;font-size:60px;font-weight:700;letter-spacing:0.2em;margin:0 0 16px;text-shadow:0 2px 4px rgba(0,0,0,0.3);">${data.name}</h2>
        <h3 style="color:#facc15;font-size:60px;font-weight:700;letter-spacing:0.2em;margin:0;text-shadow:0 2px 4px rgba(0,0,0,0.3);">工作周报</h3>
      </div>
      <div style="position:absolute;bottom:24px;right:48px;z-index:10;text-align:right;">
        <p style="color:#fff;font-size:20px;font-weight:700;margin:0 0 4px;"><span style="color:#facc15;">汇报单位：</span><span style="color:#facc15;">${data.reporter}</span></p>
        <p style="color:#facc15;font-size:20px;font-weight:700;letter-spacing:0.05em;margin:0;">${data.dateLabel}</p>
      </div>
    </div>
  </section>
  <footer style="padding:0 48px 32px 0;flex-shrink:0;">
    <div style="display:flex;align-items:flex-end;justify-content:space-between;">
      <div style="width:66%;height:16px;background:${hc};margin-bottom:8px;"></div>
      <div style="text-align:right;">
        <p style="color:#005596;font-size:30px;font-weight:900;font-style:italic;letter-spacing:-0.05em;margin:0;font-family:'Kaiti','STKaiti',serif;">敢為天下先 永遠争第一</p>
      </div>
    </div>
  </footer>
</div>`;
}

function renderMappingPage02() {
  const chapters = [
    { num: '第一章', name: '组织架构' },
    { num: '第二章', name: '上周工作' },
    { num: '第三章', name: '下周计划' },
    { num: '第四章', name: '工作计划' },
    { num: '第五章', name: '协调事宜' }
  ];
  document.getElementById('mappingContent').innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;padding-top:20px;">
      <div style="font-size:48px;font-weight:700;color:#00a2ff;letter-spacing:8px;margin-bottom:32px;">目录</div>
      <div style="display:flex; flex-direction:column; gap:14px; width:100%; max-width:520px;">
        ${chapters.map((ch,i) => `
          <div style="display:flex; align-items:center;">
            <div style="clip-path:polygon(17% 0%,83% 0%,100% 50%,83% 100%,17% 100%,0% 50%); width:80px; height:48px; background:#00a2ff; display:flex; align-items:center; justify-content:center; color:#fff; font-weight:700; font-size:18px; z-index:10; box-shadow:0 4px 6px -1px rgba(0,0,0,0.1);">${i+1}</div>
            <div style="flex:1; height:44px; background:#f5f5f3; margin-left:-12px; padding-left:28px; display:flex; align-items:center; border-radius:2px; font-size:18px; font-weight:600; box-shadow:0 4px 15px rgba(0,0,0,0.15);">
              <span style="color:#00a2ff;margin-right:12px;">${ch.num}</span>
              <span style="color:#374151;">${ch.name}</span>
            </div>
          </div>
        `).join('')}
      </div>
    </div>`;
}

function renderMappingPage03() {
  const fc = document.getElementById('pageFloatingControls');
  const { weekStart, weekEnd } = getWeekRange();
  const stats = M.getWeekAttendanceStats(weekStart, weekEnd);
  const hasAbsent = stats.some(s => !s.fullAttendance);

  fc.innerHTML = '';

  const showReason = hasAbsent && _attendanceMode === 'actual';
  const absentCount = stats.filter(s => !s.fullAttendance).length;
  const toggleBtns = hasAbsent ? `
    <span style="color:#f59e0b;font-size:11px;font-weight:500;">⚠️ ${absentCount}人未满勤</span>
    <button style="background:${_attendanceMode==='full'?'#2563eb':'#fff'};color:${_attendanceMode==='full'?'#fff':'#374151'};border:1px solid ${_attendanceMode==='full'?'#2563eb':'#d1d5db'};border-radius:4px;padding:2px 8px;cursor:pointer;font-size:11px;" onclick="_attendanceMode='full';switchMappingTab('03')">按满勤统计</button>
    <button style="background:${_attendanceMode==='actual'?'#2563eb':'#fff'};color:${_attendanceMode==='actual'?'#fff':'#374151'};border:1px solid ${_attendanceMode==='actual'?'#2563eb':'#d1d5db'};border-radius:4px;padding:2px 8px;cursor:pointer;font-size:11px;" onclick="_attendanceMode='actual';switchMappingTab('03')">按实际出勤</button>` : '';
  const photoInner = _s03Photo
    ? `<img src="${_s03Photo}" style="width:100%;height:100%;object-fit:contain;">`
    : '<div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;color:#94a3b8;font-size:13px;">🖼️ 项目现场</div>';

  document.getElementById('mappingContent').innerHTML = `
    <div style="display:grid;grid-template-columns:7fr 5fr;gap:24px;height:100%;">
      <div style="border:1px solid #d1d5db;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);display:flex;flex-direction:column;">
        <div style="display:flex;justify-content:flex-end;align-items:center;padding:4px 10px;background:#f3f4f6;border-bottom:1px solid #d1d5db;flex-shrink:0;min-height:24px;">
          <div class="attendance-toggle-bar" style="display:flex;align-items:center;gap:6px;">${toggleBtns}</div>
        </div>
        <div style="flex:1;overflow-y:auto;padding-top:4px;">
        <table style="width:100%;border-collapse:collapse;font-size:11px;">
          <thead>
            <tr style="background:#f3f4f6;position:sticky;top:0;z-index:1;">
              <th style="padding:4px;border-right:1px solid #d1d5db;text-align:center;width:32px;">序号</th>
              <th style="padding:4px;border-right:1px solid #d1d5db;text-align:center;">职务</th>
              <th style="padding:4px;border-right:1px solid #d1d5db;text-align:center;width:60px;">姓名</th>
              <th style="padding:4px;border-right:1px solid #d1d5db;text-align:center;width:95px;">联系电话</th>
              <th style="padding:4px;border-right:1px solid #d1d5db;text-align:center;width:65px;">是否到岗</th>
              <th style="padding:4px;text-align:center;width:80px;${showReason?'':'display:none'}">未到岗原因</th>
            </tr>
          </thead>
          <tbody>
            ${stats.map((s, i) => {
              const showPresent = _attendanceMode === 'full' || s.fullAttendance;
              const absentDays = s.totalDays - s.presentDays;
              const rowBg = i % 2 === 0 ? '#fff' : '#f9fafb';
              return `
              <tr style="background:${rowBg};">
                <td style="padding:2.5px 4px;border-right:1px solid #d1d5db;border-bottom:1px solid #e5e7eb;text-align:center;">${i+1}</td>
                <td style="padding:2.5px 4px;border-right:1px solid #d1d5db;border-bottom:1px solid #e5e7eb;">${s.position}</td>
                <td style="padding:2.5px 4px;border-right:1px solid #d1d5db;border-bottom:1px solid #e5e7eb;text-align:center;font-weight:600;">${s.name}</td>
                <td style="padding:2.5px 4px;border-right:1px solid #d1d5db;border-bottom:1px solid #e5e7eb;text-align:center;">${s.phone}</td>
                <td style="padding:2.5px 4px;border-right:1px solid #d1d5db;border-bottom:1px solid #e5e7eb;text-align:center;">
                  <span style="background:${showPresent?'#d1fae5':'#fef3c7'};color:${showPresent?'#065f46':'#92400e'};padding:1px 6px;border-radius:3px;font-size:10px;">${showPresent?'已到岗':'未到岗'}</span>
                </td>
                <td style="padding:2.5px 4px;border-bottom:1px solid #e5e7eb;text-align:center;font-size:10px;${showReason?'':'display:none'}">
                  ${showPresent ? '<span style="color:#9ca3af;">—</span>' : `<span style="color:#92400e;">${s.absentReasons.length ? s.absentReasons.join('、') : '缺勤 '+absentDays+' 天'}</span>`}
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;">
        <div style="flex:1;border-radius:12px;overflow:hidden;border:4px solid #fff;box-shadow:0 4px 16px rgba(0,0,0,0.15);background:#f1f5f9;display:flex;align-items:center;justify-content:center;overflow:hidden;">${photoInner}</div>
        <div style="background:linear-gradient(90deg,#ffb84d,#ff4d4d);color:#fff;font-size:18px;font-weight:700;letter-spacing:2px;padding:6px 16px;border-radius:4px;text-align:center;box-shadow:0 2px 6px rgba(0,0,0,0.1);">${_s03PhotoCaption}</div>
      </div>
    </div>`;
}

// ============================================================
// 重要节点编辑
// ============================================================

let _milestoneData = null;

function openMilestoneEditor() {
  _milestoneData = M.getMilestoneData();
  _renderMilestoneEditor();
  showModal('modalMilestone');
}

function _sanitize(str) {
  return (str || '').replace(/'/g, "\\'").replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function _renderMilestoneEditor() {
  const { months, rows } = _milestoneData;
  const body = document.getElementById('milestoneEditorBody');
  body.querySelector('#cellZoomEditor').style.display = 'none';
  body.querySelector('#cellTooltip').style.display = 'none';
  let html = `<div style="font-size:11px;color:#64748b;margin-bottom:8px;">${months.length} 个月份列 · ${rows.length} 行</div>
    <table style="width:100%;border-collapse:collapse;font-size:11px;table-layout:fixed;">
      <colgroup><col style="width:80px"><col style="width:70px">${months.map(() => '<col>').join('')}</colgroup>
      <thead>
        <tr style="background:#3b82f6;color:#fff;">
          <th style="padding:4px;border:1px solid #94a3b8;text-align:center;">专业</th>
          <th style="padding:4px;border:1px solid #94a3b8;text-align:center;">节点</th>
          ${months.map((m, mi) => `
            <th style="padding:3px;border:1px solid #94a3b8;text-align:center;font-weight:400;position:relative;">
              <span class="s0301-month-lbl" data-idx="${mi}" title="点击修改月份" style="cursor:pointer;">${m}</span>
              <button onclick="s0301DelMonth(${mi})" style="position:absolute;top:1px;right:2px;background:none;border:none;color:rgba(255,255,255,0.7);cursor:pointer;font-size:10px;" title="删除该列">×</button>
            </th>`).join('')}
        </tr>
      </thead>
      <tbody>${rows.map((r, ri) => {
        const catRows = rows.filter(rr => rr.major === r.major);
        const firstIdx = rows.indexOf(catRows[0]);
        const rowspan = catRows.length;
        const majorEsc = _sanitize(r.major);
        const rowEsc = _sanitize(r.row);
        const majorCell = ri === firstIdx
          ? `<td style="text-align:center;vertical-align:middle;background:#cbd5e1;font-weight:600;border:1px solid #94a3b8;" rowspan="${rowspan}">
               <div style="display:flex;flex-direction:column;align-items:center;gap:2px;">
                 <span class="s0301-major-lbl" data-major="${majorEsc}" title="点击修改专业名" style="cursor:pointer;">${r.major}</span>
                 <button onclick="s0301DelMajor('${majorEsc}')" style="background:#ef4444;color:#fff;border:none;border-radius:3px;padding:1px 6px;cursor:pointer;font-size:10px;">×</button>
               </div>
             </td>`
          : '';
        const rowBg = r.rowType === 'key' ? '#f1f5f9' : '#fefce8';
        return `<tr>${majorCell}
          <td style="text-align:center;background:${rowBg};font-weight:600;border:1px solid #94a3b8;font-size:11px;">
            <div style="display:flex;align-items:center;gap:2px;justify-content:center;">
              <span class="s0301-row-lbl" data-major="${majorEsc}" data-row="${rowEsc}" title="点击修改行名" style="cursor:pointer;">${r.row}</span>
              <button onclick="s0301DelRow('${majorEsc}','${rowEsc}')" style="background:none;border:none;color:#ef4444;cursor:pointer;font-size:12px;" title="删除该行">×</button>
            </div>
          </td>
          ${months.map(mk => {
            const val = r[mk] || '';
            const escapedVal = _sanitize(val);
            return `<td style="border:1px solid #94a3b8;padding:2px;background:rgba(255,255,255,0.8);">
              <textarea class="s0301-cell-ta" data-ri="${ri}" data-mk="${mk}" style="width:100%;border:none;resize:none;font-size:10px;background:transparent;min-height:32px;overflow:hidden;" ondblclick="openCellZoom(${ri},'${mk}')" onfocus="showCellTooltip(this)" onblur="hideCellTooltip()" oninput="autoResizeTA(this);_milestoneData.rows[${ri}]['${mk}']=this.value">${escapedVal}</textarea>
            </td>`;
          }).join('')}
        </tr>`;
      }).join('')}</tbody>
    </table>`;
  body.innerHTML = html + body.querySelector('#cellZoomEditor').outerHTML + body.querySelector('#cellTooltip').outerHTML;

  // 绑定修改月份标签
  body.querySelectorAll('.s0301-month-lbl').forEach(el => {
    el.onclick = async function() {
      const idx = parseInt(this.dataset.idx, 10);
      const newVal = await showPrompt('修改月份标签（如 2026.6）：', _milestoneData.months[idx]);
      if (!newVal || !newVal.trim()) return;
      const oldKey = _milestoneData.months[idx];
      const newKey = newVal.trim();
      if (oldKey === newKey) return;
      _milestoneData.months[idx] = newKey;
      _milestoneData.rows.forEach(r => { r[newKey] = r[oldKey]; delete r[oldKey]; });
      _renderMilestoneEditor();
    };
  });
  // 绑定修改专业名
  body.querySelectorAll('.s0301-major-lbl').forEach(el => {
    el.onclick = async function() {
      const old = this.dataset.major;
      const newVal = await showPrompt('修改专业名称：', old);
      if (!newVal || !newVal.trim() || newVal.trim() === old) return;
      _milestoneData.rows.forEach(r => { if (r.major === old) r.major = newVal.trim(); });
      _renderMilestoneEditor();
    };
  });
  // 绑定修改行名
  body.querySelectorAll('.s0301-row-lbl').forEach(el => {
    el.onclick = async function() {
      const major = this.dataset.major;
      const old = this.dataset.row;
      const newVal = await showPrompt('修改行名称：', old);
      if (!newVal || !newVal.trim() || newVal.trim() === old) return;
      _milestoneData.rows.forEach(r => { if (r.major === major && r.row === old) r.row = newVal.trim(); });
      _renderMilestoneEditor();
    };
  });
}

function autoResizeTA(el) {
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}

function showCellTooltip(el) {
  if (el.scrollHeight <= el.clientHeight && el.value.length < 50) return;
  const tooltip = document.getElementById('cellTooltip');
  tooltip.textContent = el.value || '(空)';
  const rect = el.getBoundingClientRect();
  const bodyRect = document.getElementById('milestoneEditorBody').getBoundingClientRect();
  tooltip.style.left = (rect.left - bodyRect.left) + 'px';
  tooltip.style.top = (rect.bottom - bodyRect.top + 4) + 'px';
  tooltip.style.display = 'block';
}

function hideCellTooltip() {
  setTimeout(() => { document.getElementById('cellTooltip').style.display = 'none'; }, 200);
}

let _cellZoomCallback = null;

function openCellZoom(ri, mk) {
  const editor = document.getElementById('cellZoomEditor');
  document.getElementById('cellZoomLabel').textContent = `编辑内容 - ${mk}`;
  const ta = document.getElementById('cellZoomTextarea');
  ta.value = _milestoneData.rows[ri][mk] || '';
  ta.style.height = '120px';
  _cellZoomCallback = function(val) { _milestoneData.rows[ri][mk] = val; };
  editor.style.display = 'block';
  ta.focus();
}

function closeCellZoom() {
  document.getElementById('cellZoomEditor').style.display = 'none';
  _cellZoomCallback = null;
}

function saveCellZoom() {
  if (_cellZoomCallback) _cellZoomCallback(document.getElementById('cellZoomTextarea').value);
  closeCellZoom();
  _renderMilestoneEditor();
}

async function s0301AddMajor() {
  const name = await showPrompt('输入新专业名称（如：精装）');
  if (!name || !name.trim()) return;
  _milestoneData.rows.push({ major: name.trim(), row: '关键节点', rowType: 'key' });
  _milestoneData.rows.push({ major: name.trim(), row: '次要节点', rowType: 'sub' });
  _milestoneData.months.forEach(mk => {
    _milestoneData.rows[_milestoneData.rows.length-2][mk] = '';
    _milestoneData.rows[_milestoneData.rows.length-1][mk] = '';
  });
  _renderMilestoneEditor();
}

async function s0301DelMajor(major) {
  const ok = await showConfirm(`删除专业「${major}」及其所有行？`, '删除专业', '🗑️');
  if (!ok) return;
  _milestoneData.rows = _milestoneData.rows.filter(r => r.major !== major);
  _renderMilestoneEditor();
}

function s0301AddMonth() {
  const last = _milestoneData.months[_milestoneData.months.length - 1] || `${new Date().getFullYear()}.${new Date().getMonth()+1}`;
  const parts = last.split('.');
  let y = parseInt(parts[0], 10), m = parseInt(parts[1], 10) + 1;
  if (m > 12) { m = 1; y++; }
  const newMonth = `${y}.${m}`;
  _milestoneData.months.push(newMonth);
  _milestoneData.rows.forEach(r => { r[newMonth] = ''; });
  _renderMilestoneEditor();
}

async function s0301DelMonth(idx) {
  const mk = _milestoneData.months[idx];
  const ok = await showConfirm(`删除月份列「${mk}」？`, '删除列', '🗑️');
  if (!ok) return;
  _milestoneData.months.splice(idx, 1);
  _milestoneData.rows.forEach(r => delete r[mk]);
  _renderMilestoneEditor();
}

async function s0301DelRow(major, row) {
  const ok = await showConfirm(`删除行「${row}」？`, '删除行', '🗑️');
  if (!ok) return;
  _milestoneData.rows = _milestoneData.rows.filter(r => !(r.major === major && r.row === row));
  _renderMilestoneEditor();
}

function s0301Save() {
  // 告知 mock-data.js 当前的 projectId（saveMilestoneData 会用其写 dr_milestone_plans）
  try { window.MOCK_CURRENT_PROJECT = currentProjectId; } catch {}
  M.saveMilestoneData(_milestoneData);
  const activeBtn = document.querySelector('#reportPageNav button.active[data-page]');
  if (activeBtn && activeBtn.dataset.page === '04') switchMappingTab('04');
  showToast('里程碑已保存到后端', 'success');
}

function _smartWrap(text) {
  if (!text) return '';
  const lines = text.split('\n');
  return lines.map(line => {
    const raw = line.replace(/<[^>]+>/g, '').trim();
    if (!raw) return line;
    const len = raw.length;
    if (len <= 35) return line;
    // 找标点断点：从 28-34 字之间找 ，、；：。！？
    let breakAt = -1;
    for (let i = 34; i >= 28; i--) {
      const ch = raw[i];
      if (ch && '，、；：。！？；：'.includes(ch)) { breakAt = i + 1; break; }
    }
    if (breakAt < 0) {
      // 没标点就找空格或数字后
      for (let i = 34; i >= 28; i--) {
        const ch = raw[i];
        if (ch === ' ' || ch === '\t') { breakAt = i + 1; break; }
        if (i < len - 1 && /\d/.test(ch) && !/\d/.test(raw[i+1])) { breakAt = i + 1; break; }
      }
    }
    if (breakAt > 0 && breakAt < len) {
      const head = raw.slice(0, breakAt);
      const tail = raw.slice(breakAt);
      return head + '\n' + tail;
    }
    return line;
  }).join('\n');
}

let _milestonePage = 0;
let _milestonePages = []; // [{html, months}]

let _page04Page = 0;
let _page04Pages = []; // [[row, row, ...], ...]

let _page05Page = 0;
let _page05Pages = []; // [[photo, photo, ...], ...]
let _page05Subtitle = '2.2 高管层现场工作'; // 动态：本周涉及区域

let _page10Page = 0;  // 10 按楼栋/施工段排序的 sub-page 索引

function _estimateTextWidth(text, fontSize) {
  if (!text) return 0;
  let w = 0;
  for (const ch of text) {
    w += ch.charCodeAt(0) > 127 ? fontSize * 1.15 : fontSize * 0.65;
  }
  return w + 12;
}

function _calcColWidths(monthList, categories, catNames) {
  const availWidth = 1280 - 60 - 70 - 65;
  const colWidths = {};
  monthList.forEach(m => {
    let maxW = 0;
    catNames.forEach(cat => {
      const c = categories[cat];
      if (c.keyNodes && c.keyNodes[m]) maxW = Math.max(maxW, _estimateTextWidth(c.keyNodes[m], 11));
      if (c.subNodes && c.subNodes[m]) {
        c.subNodes[m].forEach(t => maxW = Math.max(maxW, _estimateTextWidth(t, 10)));
      }
    });
    colWidths[m] = Math.min(Math.max(maxW, 60), availWidth / monthList.length * 2.0);
  });
  const totalEst = Object.values(colWidths).reduce((a, b) => a + b, 0);
  if (totalEst > 0) {
    monthList.forEach(m => { colWidths[m] = Math.round(colWidths[m] / totalEst * availWidth); });
  }
  return colWidths;
}

function _estimateTableHeight(monthList, categories, catNames, colWidths) {
  let h = 32;
  catNames.forEach(cat => {
    const c = categories[cat];
    const hasSub = Object.keys(c.subNodes || {}).length > 0;

    let maxKeyLines = 0;
    monthList.forEach(m => {
      const val = (c.keyNodes && c.keyNodes[m]) || '';
      if (val) {
        const tw = _estimateTextWidth(val, 11);
        const cw = colWidths[m] || 100;
        maxKeyLines = Math.max(maxKeyLines, Math.ceil(tw / cw));
      }
    });
    h += Math.max(maxKeyLines * 19 + 8, 28);

    if (hasSub) {
      let maxSubLines = 0;
      monthList.forEach(m => {
        const items = (c.subNodes && c.subNodes[m]) || [];
        if (items.length === 0) return;
        const cw = colWidths[m] || 100;
        let lines = 0;
        items.forEach(t => {
          const tw = _estimateTextWidth(t, 10);
          lines += Math.ceil(tw / cw);
        });
        maxSubLines = Math.max(maxSubLines, lines);
      });
      h += Math.max(maxSubLines * 19 + 8, 25);
    }
  });
  return Math.round(h * 1.2);
}

function _gen0301Table(year, monthList, categories, catNames, colWidths) {
  const monthLabels = monthList.map(m => `\u2009${year}. ${m}\u2009`);
  const colgroup = `<colgroup><col style="width:70px"><col style="width:65px">${monthList.map(m => `<col style="width:${colWidths[m]}px">`).join('')}</colgroup>`;
  const thead = `<thead><tr style="background:#3b82f6;color:#fff;">
    <th style="padding:6px;border:1px solid #94a3b8;width:70px;text-align:center;">专业</th>
    <th style="padding:6px;border:1px solid #94a3b8;width:65px;text-align:center;">节点</th>
    ${monthLabels.map(l => `<th style="padding:6px;border:1px solid #94a3b8;text-align:center;font-weight:400;padding-left:10px;padding-right:10px;">${l}</th>`).join('')}
  </tr></thead>`;
  const tbody = catNames.map(cat => {
    const c = categories[cat];
    const keyMonths = c.keyNodes || {};
    const subMonths = c.subNodes || {};
    const hasSub = Object.keys(subMonths).length > 0;
    const rowspan = hasSub ? 2 : 1;
    const catCell = `<td style="text-align:center;vertical-align:middle;background:#cbd5e1;font-weight:600;border:1px solid #94a3b8;font-size:12px;" rowspan="${rowspan}">${cat}</td>`;
    const keyCells = monthList.map(m => {
      const val = keyMonths[m];
      return `<td style="border:1px solid #94a3b8;padding:4px;vertical-align:top;background:rgba(255,255,255,0.8);font-size:11px;white-space:pre-wrap;">${val || '\u00A0'}</td>`;
    }).join('');
    const keyRow = `<tr>${catCell}<td style="text-align:center;background:#f1f5f9;font-weight:600;border:1px solid #94a3b8;font-size:11px;">关键节点</td>${keyCells}</tr>`;
    if (!hasSub) return keyRow;
    const subCells = monthList.map(m => {
      const items = subMonths[m];
      return `<td style="border:1px solid #94a3b8;padding:4px;vertical-align:top;background:rgba(255,255,255,0.8);font-size:10px;line-height:1.7;white-space:pre-wrap;">${items ? items.join('<br>') : '\u00A0'}</td>`;
    }).join('');
    return keyRow + `<tr><td style="text-align:center;background:#f1f5f9;font-weight:600;border:1px solid #94a3b8;font-size:11px;">次要节点</td>${subCells}</tr>`;
  }).join('');
  return `<table style="width:100%;border-collapse:collapse;font-size:11px;table-layout:fixed;">${colgroup}${thead}<tbody>${tbody}</tbody></table>`;
}

function renderMappingPage0301() {
  const data = M.getPage0301Data(currentProjectId);
  const el = document.getElementById('mappingContent');
  if (!data || !data.categories) { el.innerHTML = '<div style="padding:40px;text-align:center;color:#94a3b8;">暂无节点数据</div>'; _milestonePages = []; return; }

  const { year, months, categories } = data;
  const catNames = Object.keys(categories);
  const availHeight = 720 - 125 - 20;

  _milestonePages = [];

  // 辅助：将 (月份子集, 专业子集) 拆成不超高的一组页面
  function addPages(monthList, cats, catKeys) {
    const cw = _calcColWidths(monthList, cats, catKeys);
    const h = _estimateTableHeight(monthList, cats, catKeys, cw);
    if (h <= availHeight) {
      _milestonePages.push({ html: _gen0301Table(year, monthList, cats, catKeys, cw) });
      return;
    }
    // 先高度（切专业）
    if (catKeys.length > 1) {
      catKeys.forEach(k => {
        const m = {}; m[k] = cats[k];
        addPages(monthList, m, [k]);
      });
      return;
    }
    // 再宽度（切月份）
    if (monthList.length > 1) {
      const mid = Math.ceil(monthList.length / 2);
      addPages(monthList.slice(0, mid), cats, catKeys);
      addPages(monthList.slice(mid), cats, catKeys);
      return;
    }
    // 最后兜底：1专业 × 1月份，不可能超高
    _milestonePages.push({ html: _gen0301Table(year, monthList, cats, catKeys, cw) });
  }

  addPages(months, categories, catNames);

  if (_milestonePage >= _milestonePages.length) _milestonePage = 0;
  el.innerHTML = _milestonePages[_milestonePage] ? _milestonePages[_milestonePage].html : '<div style="padding:40px;text-align:center;color:#94a3b8;">暂无数据</div>';
}

function _renderPage04Table(rows) {
  let html = `
    <div style="background:rgba(255,255,255,0.9);border-radius:8px;overflow:hidden;box-shadow:0 4px 6px -1px rgba(0,0,0,0.1);border:1px solid #005e00;">
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr style="background:#00a2ff;color:#fff;">
            <th style="padding:8px;border-right:1px solid #005e00;width:64px;">序号</th>
            <th style="padding:8px 16px;border-right:1px solid #005e00;text-align:left;">计划事项及完成情况</th>
            <th style="padding:8px;border-right:1px solid #005e00;width:144px;">责任人</th>
          </tr>
        </thead>
        <tbody>`;
  rows.forEach(r => {
    if (r.type === 'header') {
      html += `
        <tr style="background:#e0f2fe;">
          <td style="padding:6px 8px;border-right:1px solid #005e00;border-bottom:1px solid #005e00;text-align:center;font-weight:600;color:#006494;"></td>
          <td style="padding:6px 16px;border-right:1px solid #005e00;border-bottom:1px solid #005e00;font-weight:600;color:#006494;" colspan="2">${r.text}</td>
        </tr>`;
    } else {
      const bg = r.seq % 2 === 0 ? '#e7f0ff' : '#cbe0ff';
      html += `
        <tr style="background:${bg};">
          <td style="padding:6px 8px;border-right:1px solid #005e00;border-bottom:1px solid #005e00;text-align:center;">${r.seq}</td>
          <td style="padding:6px 16px;border-right:1px solid #005e00;border-bottom:1px solid #005e00;">${r.text}</td>
          <td style="padding:6px;border-right:1px solid #005e00;border-bottom:1px solid #005e00;text-align:center;">${r.owner}</td>
        </tr>`;
    }
  });
  html += `</tbody></table></div>`;
  return html;
}

function renderMappingPage04() {
  const { weekStart, weekEnd } = getWeekRange();
  const allRows = M.getPage04Data(currentProjectId, weekStart, weekEnd);

  if (allRows.length === 0) {
    document.getElementById('mappingContent').innerHTML = `
      <div style="text-align:center; padding:40px 0; color:#94a3b8;">
        <div style="font-size:40px;">📋</div>
        <p style="margin-top:12px;">本周（${weekStart} ~ ${weekEnd}）暂无已确认的进度事件</p>
        <p style="font-size:12px; margin-top:4px;">请先在日报中录入并确认事件</p>
      </div>`;
    _page04Pages = [];
    return;
  }

  // 每页最多放 12 行（header + detail 混合计数）
  const ROWS_PER_PAGE = 12;
  _page04Pages = [];
  for (let i = 0; i < allRows.length; i += ROWS_PER_PAGE) {
    _page04Pages.push(allRows.slice(i, i + ROWS_PER_PAGE));
  }
  if (_page04Page >= _page04Pages.length) _page04Page = 0;

  document.getElementById('mappingContent').innerHTML = _renderPage04Table(_page04Pages[_page04Page]);
}

function _renderPage05Grid(photos) {
  if (!photos || photos.length === 0) return '';
  const count = photos.length;
  // 自适应列数：1→1, 2→2, 3→3, 4→2 (2x2 平衡), 5→3 (3+2), 6→3 (3x2)
  let cols;
  if (count <= 1) cols = 1;
  else if (count === 2) cols = 2;
  else if (count === 4) cols = 2;
  else cols = Math.min(count, 3);  // 3, 5, 6 张都用 3 列
  const capRatio = count === 1 ? 0.35 : (count <= 3 ? 0.4 : 0.32);  // 1张图说明多占些
  const html = `<div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:8px;height:100%;align-content:center;justify-items:stretch;">`;
  let inner = '';
  for (const p of photos) {
    const showCap = p.showInReport !== false;
    const capHtml = showCap
      ? `<div style="flex-shrink:0;padding:5px 8px;font-size:11px;color:#0f172a;line-height:1.35;background:#fff;border-top:1px solid #e2e8f0;max-height:60px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;">${p.caption || '现场照片'}</div>`
      : '';
    const body = p.data
      ? `<img src="${p.data}" style="max-width:100%;max-height:100%;object-fit:contain;display:block;" />`
      : `<div style="display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:12px;">🖼️ 暂无图片</div>`;
    inner += `
      <div style="display:flex;flex-direction:column;border:1px solid #ccc;background:#fff;overflow:hidden;max-width:100%;max-height:100%;">
        <div style="flex:1 1 auto;min-height:0;display:flex;align-items:center;justify-content:center;background:#f8fafc;overflow:hidden;padding:2px;">
          ${body}
        </div>
        ${capHtml}
      </div>`;
  }
  return html + inner + `</div>`;
}

function renderMappingPage05() {
  const { weekStart, weekEnd } = getWeekRange();
  const result = M.getPage05Photos(currentProjectId, weekStart, weekEnd, 9999);
  const allItems = result.items;

  // 按区域聚合照片
  const byArea = {};  // { areaName: [photoObj, ...] }
  let curArea = null;
  for (const it of allItems) {
    if (it.type === 'header') { curArea = it.text; byArea[curArea] = []; }
    else if (curArea) byArea[curArea].push(it);
  }
  const areaNames = Object.keys(byArea);
  // 每个区域 = 1 个 sub-page（不再有"界面其它位置"的区域内容）
  _page05Pages = areaNames.map(name => byArea[name]);
  if (_page05Page >= _page05Pages.length) _page05Page = 0;

  // 副标题 = 当前 sub-page 的区域名
  const curSubtitle = areaNames[_page05Page] || '本周暂无照片';
  if (typeof PAGE_HEADERS !== 'undefined') {
    if (!PAGE_HEADERS['05']) PAGE_HEADERS['05'] = {};
    PAGE_HEADERS['05'].subtitle = curSubtitle;
  }

  if (allItems.length === 0) {
    document.getElementById('mappingContent').innerHTML = `
      <div style="text-align:center; padding:40px 0; color:#94a3b8;">
        <div style="font-size:40px;">📷</div>
        <p style="margin-top:12px;">本周（${weekStart} ~ ${weekEnd}）暂无照片数据</p>
        <p style="font-size:12px; margin-top:4px;">请先在日报中通过拍照录入</p>
      </div>`;
    _page05Pages = [];
    if (typeof PAGE_HEADERS !== 'undefined' && PAGE_HEADERS['05']) PAGE_HEADERS['05'].subtitle = '本周暂无照片';
    return;
  }

  document.getElementById('mappingContent').innerHTML = _renderPage05Grid(_page05Pages[_page05Page]);
}

function renderMappingPage06() {
  const { weekStart, weekEnd } = getWeekRange();
  const mode = localStorage.getItem(`page06_mode_${currentProjectId}`) || 'dynamic';
  const displayField = localStorage.getItem(`page06_displayField_${currentProjectId}`) || 'tradeName';
  const unit = localStorage.getItem(`page06_unit_${currentProjectId}`) || 'people';
  const rows = M.getPage06Data(currentProjectId, weekStart, weekEnd, mode, displayField, unit);
  const thisLabel = unit === 'manDays' ? '本周工日' : '本周人数';
  const nextLabel = unit === 'manDays' ? '下周工日' : '下周人数';
  const photos = M.PAGE06_PHOTOS || [];
  console.log('[Page06] render, currentProjectId:', currentProjectId, 'photos:', photos.length);
  const photoCards = photos.map(p => {
    const cardHtml = '<div style="border:1px solid #e2e8f0;border-radius:4px;overflow:hidden;background:#f8fafb;min-height:120px;">' +
      '<div style="width:100%;height:120px;overflow:hidden;background:#f1f5f9;display:flex;align-items:center;justify-content:center;cursor:pointer;" onclick="enlargePage06Photo(\'' + p.id + '\')">' +
      '<img src="' + p.src + '" style="width:100%;height:100%;object-fit:contain;"></div>' +
      '<div style="padding:4px;font-size:11px;color:#64748b;">' + (p.caption || '无说明') +
      (p.tradeId ? '<br><span style="color:#00adef;">' + p.tradeId + '</span>' : '') + '</div></div>';
    return cardHtml;
  }).join('');
  const photoPanel = photos.length > 0 ? '<div style="margin-top:16px;background:#fff;border:1px solid #d1d5db;border-radius:4px;padding:12px;">' +
    '<div style="font-size:13px;font-weight:600;color:#374151;margin-bottom:8px;">📷 现场照片（共 ' + photos.length + ' 张）</div>' +
    '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px;">' + photoCards + '</div></div>' : '';
  const plansCount = (M.getPlansForProject ? M.getPlansForProject(currentProjectId) : []).length;
  console.log('[Page06] currentProjectId:', currentProjectId, 'plans count:', plansCount, 'photos:', photos.length);
  const hasPhotos = photos.length > 0;
  const leftCol = hasPhotos ? '<div style="flex:1;display:flex;flex-direction:column;gap:16px;min-width:0;">' +
    '<div style="background:#fff;padding:8px;border:1px solid #d1d5db;border-radius:2px;flex:1;display:flex;align-items:center;justify-content:center;overflow:hidden;min-height:0;">' +
    '<img src="' + photos[0].src + '" style="width:100%;height:100%;object-fit:contain;cursor:pointer;" onclick="enlargePage06Photo(\'' + photos[0].id + '\')">' +
    '</div>' +
    '<div style="background:#48a0f8;color:#fff;padding:8px 24px;text-align:center;font-size:14px;font-weight:700;width:fit-content;margin:0 auto;border-radius:0;">' +
    (photos[0].caption || '无说明') + '</div></div>' : '';
  const gap = hasPhotos ? '<div style="width:24px;flex-shrink:0;"></div>' : '';
  const containerStyle = hasPhotos ? 'display:flex;gap:0;height:100%;' : 'display:block;height:100%;';
  const tableContainerStyle = hasPhotos ? 'flex:1;display:flex;flex-direction:column;gap:12px;min-width:0;' : 'display:flex;flex-direction:column;gap:12px;';
  const fullHtml = '<div style="' + containerStyle + '">' + leftCol + gap +
    '<div style="' + tableContainerStyle + '">' +
    '<div style="background:#fff;border:1px solid #005e00;border-radius:4px;overflow:hidden;box-shadow:0 2px 6px rgba(0,0,0,0.06);flex:1;">' +
    '<table style="width:100%;border-collapse:collapse;font-size:12px;"><thead><tr style="background:#00a2ff;color:#fff;">' +
    '<th style="padding:6px;border-right:1px solid #005e00;border-bottom:2px solid #005e00;width:36px;">序号</th>' +
    '<th style="padding:6px;border-right:1px solid #005e00;border-bottom:2px solid #005e00;">工种</th>' +
    '<th style="padding:6px;border-right:1px solid #005e00;border-bottom:2px solid #005e00;width:72px;">' + thisLabel + '</th>' +
    '<th style="padding:6px;border-bottom:2px solid #005e00;width:72px;">' + nextLabel + '</th></tr></thead><tbody>' +
    rows.map((r,i) => {
      const isTotal = r.trade === '合计';
      const bg = isTotal ? 'rgba(0,162,255,0.1)' : (i%2===0?'#cbe0ff':'#e7f0ff');
      const fw = isTotal ? '700' : '400';
      return '<tr style="background:' + bg + ';">' +
        '<td style="padding:4px;border-right:1px solid #005e00;border-bottom:1px solid #005e00;text-align:center;font-weight:' + fw + ';">' + r.seq + '</td>' +
        '<td style="padding:4px;border-right:1px solid #005e00;border-bottom:1px solid #005e00;text-align:center;font-weight:' + fw + ';">' + r.trade + '</td>' +
        '<td style="padding:4px;border-right:1px solid #005e00;border-bottom:1px solid #005e00;text-align:center;">' + r.thisWeek + '</td>' +
        '<td style="padding:4px;border-bottom:1px solid #005e00;text-align:center;">' + r.nextWeek + '</td></tr>';
    }).join('') + '</tbody></table></div>' +
    '<div style="background:#48a0f8;color:#fff;padding:6px 20px;text-align:center;font-size:13px;font-weight:700;width:fit-content;margin:0 auto;border-radius:0;">全部人员在场情况</div>' +
    '</div></div>' + photoPanel;
  console.log('[Page06] photoPanel.length:', photoPanel.length, 'fullHtml.length:', fullHtml.length);
  const el = document.getElementById('mappingContent');
  el.style.overflow = 'auto';
  el.style.height = 'auto';
  el.style.minHeight = '720px';
  el.innerHTML = fullHtml;
  console.log('[Page06] children:', el.children.length, 'all divs:', el.querySelectorAll('div').length);
}

// 切换 06 页数据源模式（按项目保存）
window.setPage06Mode = function(mode) {
  const key = `page06_mode_${currentProjectId}`;
  localStorage.setItem(key, mode);
  renderMappingPage06();
};

// 打开标准工种管理（嵌入到签到弹窗的"工人管理" Tab）
window.openStandardTradesManager = async function() {
  showModal('modalAttendance');
  switchAttendanceTab('workers');
  await renderStandardTradesList();
};

// 工人管理 tab 关闭后刷新周报 06
const _origCloseModal = window.closeModal;
window.closeModal = function(modalId) {
  if (typeof _origCloseModal === 'function') _origCloseModal(modalId);
  if (modalId === 'modalAttendance') {
    // 关闭签到弹窗后，如果当前在 06 页面，刷新它（应用最新数据）
    setTimeout(() => {
      const nav = document.querySelector('#reportPageNav button.active[data-page="06"]');
      if (nav) renderMappingPage06();
    }, 100);
  }
};

// 切换签到弹窗内的 Tab（attendance | workers）
window.switchAttendanceTab = function(tab) {
  ['attendance', 'workers'].forEach(t => {
    const btn = document.getElementById(`attTabBtn-${t}`);
    const content = document.getElementById(`attTabContent-${t}`);
    if (!btn || !content) return;
    if (t === tab) {
      btn.style.background = '#fff';
      btn.style.color = '#00adef';
      btn.style.borderBottom = '2px solid #00adef';
      content.style.display = 'block';
    } else {
      btn.style.background = 'transparent';
      btn.style.color = '#64748b';
      btn.style.borderBottom = '2px solid transparent';
      content.style.display = 'none';
    }
  });
  // 切换底部按钮
  const saveBtn = document.getElementById('attendanceFooterSave');
  const doneBtn = document.getElementById('attendanceFooterDone');
  const title = document.getElementById('attendanceModalTitle');
  if (tab === 'workers') {
    if (saveBtn) saveBtn.style.display = 'none';
    if (doneBtn) doneBtn.style.display = '';
    if (title) title.textContent = '👷 工人管理（标准工种模板）';
    // 关键：切到 workers tab 时立即渲染列表（避免空表）
    renderStandardTradesList();
  } else {
    if (saveBtn) saveBtn.style.display = '';
    if (doneBtn) doneBtn.style.display = 'none';
    if (title) title.textContent = '✓ 管理人员签到';
  }
};

// 渲染标准工种列表
async function renderStandardTradesList() {
  const listEl = document.getElementById('standardTradesList');
  if (!listEl) return;
  // 优先用内存 M.STANDARD_TRADES，否则从 API 拉
  let trades = M.STANDARD_TRADES || [];
  if (trades.length === 0) {
    try {
      const r = await fetch('http://localhost:3010/api/standard-trades');
      trades = await r.json();
      M.STANDARD_TRADES = trades;
    } catch (e) { console.warn('[标准工种] 拉取失败:', e); }
  }
  if (trades.length === 0) {
    listEl.innerHTML = `<div style="text-align:center;padding:20px;color:#94a3b8;">暂无数据，请点击「+ 新增工种」添加</div>`;
    return;
  }
  // 取出当前周 (weekStart) 的本周/下周手工数据
  const { weekStart } = getWeekRange();
  const manualMap = {};
  (M.WEEKLY_LABOR_DATA || []).forEach(w => {
    if (w.projectId === currentProjectId && w.weekStart === weekStart) {
      manualMap[w.tradeId] = { thisWeek: w.thisWeekCount || 0, nextWeek: w.nextWeekCount || 0 };
    }
  });
  // 当前模式
  const mode = localStorage.getItem(`page06_mode_${currentProjectId}`) || 'dynamic';
  const showLaborInputs = (mode === 'fixed');

  // 同步按钮样式
  const fixedBtn = document.getElementById('attWorkerModeBtn-fixed');
  const dynBtn = document.getElementById('attWorkerModeBtn-dynamic');
  const hint = document.getElementById('attWorkerModeHint');
  if (fixedBtn) {
    fixedBtn.style.background = showLaborInputs ? '#00adef' : '#fff';
    fixedBtn.style.color = showLaborInputs ? '#fff' : '#475569';
    fixedBtn.style.borderColor = showLaborInputs ? '#0081cc' : '#cbd5e1';
  }
  if (dynBtn) {
    dynBtn.style.background = !showLaborInputs ? '#00adef' : '#fff';
    dynBtn.style.color = !showLaborInputs ? '#fff' : '#475569';
    dynBtn.style.borderColor = !showLaborInputs ? '#0081cc' : '#cbd5e1';
  }
  if (hint) {
    hint.textContent = showLaborInputs
      ? '使用「固定模板」：在下方「本周人数」「下周人数」手工录入，周报 06 直接显示该数据'
      : '使用「动态获取」：周报 06 自动从已确认的施工进度事件 + 下周计划汇总';
  }

  // 显示字段切换（仅动态模式）
  const displayFieldRow = document.getElementById('attDisplayFieldRow');
  const displayField = localStorage.getItem(`page06_displayField_${currentProjectId}`) || 'tradeName';
  const isMapFromDisplay = !showLaborInputs && displayField === 'mapFrom';
  if (displayFieldRow) {
    displayFieldRow.style.display = showLaborInputs ? 'none' : 'flex';
  }
  // 同步显示字段按钮样式
  const dfTradeBtn = document.getElementById('attDisplayFieldBtn-tradeName');
  const dfMapBtn = document.getElementById('attDisplayFieldBtn-mapFrom');
  if (dfTradeBtn) {
    const active = !isMapFromDisplay;
    dfTradeBtn.style.background = active ? '#00adef' : '#fff';
    dfTradeBtn.style.color = active ? '#fff' : '#475569';
    dfTradeBtn.style.borderColor = active ? '#0081cc' : '#cbd5e1';
  }
  if (dfMapBtn) {
    dfMapBtn.style.background = isMapFromDisplay ? '#00adef' : '#fff';
    dfMapBtn.style.color = isMapFromDisplay ? '#fff' : '#475569';
    dfMapBtn.style.borderColor = isMapFromDisplay ? '#0081cc' : '#cbd5e1';
  }

  listEl.innerHTML = `
    <table style="width:100%;border-collapse:collapse;font-size:12px;">
      <thead>
        <tr style="background:#f1f5f9;">
          <th style="padding:6px;border:1px solid #e2e8f0;width:40px;">序</th>
          <th style="padding:6px;border:1px solid #e2e8f0;">${isMapFromDisplay ? '映射来源名称' : '工种名称'}</th>
          ${showLaborInputs ? '' : '<th style="padding:6px;border:1px solid #e2e8f0;">映射来源</th>'}
          ${showLaborInputs ? '<th style="padding:6px;border:1px solid #e2e8f0;width:60px;">本周人数</th><th style="padding:6px;border:1px solid #e2e8f0;width:60px;">下周人数</th>' : ''}
          <th style="padding:6px;border:1px solid #e2e8f0;width:60px;">排序</th>
          <th style="padding:6px;border:1px solid #e2e8f0;width:130px;">操作</th>
        </tr>
      </thead>
      <tbody>
        ${trades.map((t, i) => {
          const manual = manualMap[t.id] || { thisWeek: 0, nextWeek: 0 };
          const nameVal = isMapFromDisplay ? (t.mapFrom||'') : (t.tradeName||'');
          return `
          <tr data-trade-id="${t.id}">
            <td style="padding:4px;border:1px solid #e2e8f0;text-align:center;">${t.sortOrder || i + 1}</td>
            <td style="padding:4px;border:1px solid #e2e8f0;"><input class="form-input" data-field="${isMapFromDisplay ? 'mapFrom' : 'tradeName'}" value="${nameVal.replace(/"/g,'&quot;')}" style="width:100%;font-size:12px;padding:2px 6px;"></td>
            ${showLaborInputs ? '' : `<td style="padding:4px;border:1px solid #e2e8f0;"><input class="form-input" data-field="${isMapFromDisplay ? 'tradeName' : 'mapFrom'}" value="${(isMapFromDisplay ? t.tradeName||'' : t.mapFrom||'').replace(/"/g,'&quot;')}" placeholder="可空" style="width:100%;font-size:12px;padding:2px 6px;"></td>`}
            ${showLaborInputs ? `
              <td style="padding:4px;border:1px solid #e2e8f0;text-align:center;"><input class="form-input" type="number" data-field="thisWeek" data-trade-id="${t.id}" value="${manual.thisWeek}" min="0" style="width:100%;font-size:12px;padding:2px 6px;text-align:center;"></td>
              <td style="padding:4px;border:1px solid #e2e8f0;text-align:center;"><input class="form-input" type="number" data-field="nextWeek" data-trade-id="${t.id}" value="${manual.nextWeek}" min="0" style="width:100%;font-size:12px;padding:2px 6px;text-align:center;"></td>
            ` : ''}
            <td style="padding:4px;border:1px solid #e2e8f0;text-align:center;"><input class="form-input" type="number" data-field="sortOrder" value="${t.sortOrder || i + 1}" style="width:100%;font-size:12px;padding:2px 6px;"></td>
            <td style="padding:4px;border:1px solid #e2e8f0;text-align:center;">
              <button class="btn btn-xs btn-ghost" onclick="saveStandardTrade(${t.id})" style="font-size:10px;padding:2px 6px;color:#059669;">💾</button>
              <button class="btn btn-xs btn-ghost" onclick="deleteStandardTrade(${t.id})" style="font-size:10px;padding:2px 6px;color:#ef4444;">🗑</button>
            </td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  `;
  // 渲染照片网格
  renderPage06PhotoGrid();
}

// 切换工人管理数据源模式（与周报 06 共用 localStorage key）
window.setWorkersMode = function(mode) {
  localStorage.setItem(`page06_mode_${currentProjectId}`, mode);
  renderStandardTradesList();
};

// 切换周报 06 显示字段（模板名称 / 映射来源名称）
window.setPage06DisplayField = function(field) {
  localStorage.setItem(`page06_displayField_${currentProjectId}`, field);
  renderStandardTradesList();
  renderMappingPage06();
};

// 切换周报 06 统计口径（人数 / 工日）
window.setPage06Unit = function(unit) {
  localStorage.setItem(`page06_unit_${currentProjectId}`, unit);
  // 同步按钮样式
  const btnP = document.getElementById('planUnitBtn-people');
  const btnM = document.getElementById('planUnitBtn-manDays');
  if (btnP) {
    const active = (unit === 'people');
    btnP.style.background = active ? '#00adef' : '#fff';
    btnP.style.color = active ? '#fff' : '#475569';
    btnP.style.borderColor = active ? '#0081cc' : '#cbd5e1';
  }
  if (btnM) {
    const active = (unit === 'manDays');
    btnM.style.background = active ? '#00adef' : '#fff';
    btnM.style.color = active ? '#fff' : '#475569';
    btnM.style.borderColor = active ? '#0081cc' : '#cbd5e1';
  }
  renderDailyPlanCard();
  renderMappingPage06();
};

// 保存本周/下周人数到 DB
window.saveWeeklyLaborData = async function() {
  const { weekStart } = getWeekRange();
  const rows = [];
  document.querySelectorAll('#standardTradesList tr[data-trade-id]').forEach(tr => {
    const tid = tr.dataset.tradeId;
    if (!tid) return;
    const thisEl = tr.querySelector('[data-field="thisWeek"]');
    const nextEl = tr.querySelector('[data-field="nextWeek"]');
    if (thisEl || nextEl) {
      rows.push({
        projectId: currentProjectId,
        weekStart,
        tradeId: parseInt(tid),
        thisWeekCount: parseInt(thisEl?.value) || 0,
        nextWeekCount: parseInt(nextEl?.value) || 0
      });
    }
  });
  if (rows.length === 0) {
    showToast('请先切到「固定模板」模式录入数据', 'info');
    return;
  }
  try {
    await fetch('http://localhost:3010/api/weekly-labor', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows })
    });
    // 更新内存 M.WEEKLY_LABOR_DATA
    const weekData = (M.WEEKLY_LABOR_DATA || []).filter(w => !(w.projectId === currentProjectId && w.weekStart === weekStart));
    M.WEEKLY_LABOR_DATA = [...weekData, ...rows];
    showToast(`已保存 ${rows.length} 条本周/下周人数（项目：${currentProjectId}，周：${weekStart}）`, 'success');
  } catch (e) {
    showToast('保存失败：' + e.message, 'error');
  }
};

window.addStandardTradeRow = async function() {
  const trades = M.STANDARD_TRADES || [];
  const newSort = (trades.length > 0 ? Math.max(...trades.map(t => t.sortOrder || 0)) : 0) + 1;
  try {
    const r = await fetch('http://localhost:3010/api/standard-trades', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: null, tradeName: '新工种', mapFrom: '', sortOrder: newSort })
    });
    const result = await r.json();
    M.STANDARD_TRADES = [...trades, { id: result.id, projectId: null, tradeName: '新工种', mapFrom: '', sortOrder: newSort }];
    await renderStandardTradesList();
  } catch (e) { showToast('新增失败：' + e.message, 'error'); }
};

window.saveStandardTrade = async function(id) {
  const row = document.querySelector(`#standardTradesList tr[data-trade-id="${id}"]`);
  if (!row) return;
  const tradeName = row.querySelector('[data-field="tradeName"]').value.trim();
  const mapFrom = row.querySelector('[data-field="mapFrom"]').value.trim();
  const sortOrder = parseInt(row.querySelector('[data-field="sortOrder"]').value) || 0;
  if (!tradeName) { showToast('工种名称不能为空', 'error'); return; }
  try {
    await fetch('http://localhost:3010/api/standard-trades', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, tradeName, mapFrom, sortOrder })
    });
    // 更新内存
    const trades = M.STANDARD_TRADES || [];
    const idx = trades.findIndex(t => t.id === id);
    if (idx > -1) trades[idx] = { ...trades[idx], tradeName, mapFrom, sortOrder };
    showToast('已保存', 'success');
  } catch (e) { showToast('保存失败：' + e.message, 'error'); }
};

window.deleteStandardTrade = async function(id) {
  const confirmed = await showConfirm('确定删除此工种？', '删除工种', '🗑️');
  if (!confirmed) return;
  try {
    await fetch(`http://localhost:3010/api/standard-trades/${id}`, { method: 'DELETE' });
    M.STANDARD_TRADES = (M.STANDARD_TRADES || []).filter(t => t.id !== id);
    await renderStandardTradesList();
    showToast('已删除', 'success');
  } catch (e) { showToast('删除失败：' + e.message, 'error'); }
};

function renderMappingPage07() {
  const stats = M.getPage07Data(currentProjectId);
  const items = (M.ECC_ITEMS || []).filter(e => e.projectId === currentProjectId && e.id !== 'ECC099');
  // 各 ECC 录入的照片
  const itemPhotos = items.flatMap(e => (e.photos || []).map(src => ({ src, title: e.title, type: 'item' })));
  // 汇总照片（来自 ECC_SUMMARIES）
  const summaryPhotos = ((M.ECC_SUMMARIES || {})[currentProjectId] || {}).photos || [];
  const summaryTagged = summaryPhotos.map(src => ({ src, title: '汇总照片', type: 'summary' }));
  const allPhotos = itemPhotos.concat(summaryTagged);
  const photoBlock = allPhotos.length > 0
    ? `<div style="background:#fff;border:1px solid #005e00;border-radius:4px;overflow:hidden;">
        <div style="padding:6px 10px;background:#f1f5f9;font-size:12px;color:#475569;font-weight:600;border-bottom:1px solid #005e00;">
          📷 ECC 销项照片（${itemPhotos.length} 张录入 + ${summaryPhotos.length} 张汇总，共 ${allPhotos.length} 张）
        </div>
        <div style="padding:4px;display:grid;grid-template-columns:repeat(${Math.min(allPhotos.length, 4)}, 1fr);gap:4px;">
          ${allPhotos.slice(0, 16).map(p => `<div style="height:422px;overflow:hidden;background:#f8fafb;border:1px solid #e2e8f0;border-radius:2px;display:flex;align-items:center;justify-content:center;">
            <img src="${p.src}" style="max-width:100%;max-height:calc(100% - 2mm);object-fit:contain;cursor:zoom-in;" onclick="enlargePage07Photo('${p.src}','${(p.title || '').replace(/'/g, '')}')">
          </div>`).join('')}
        </div>
      </div>`
    : `<div style="background:#fff;border:1px dashed #cbd5e1;border-radius:4px;height:160px;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:13px;">🖼️ 暂无 ECC 销项照片（请在快速录入 → ECC 中上传）</div>`;
  document.getElementById('mappingContent').innerHTML = `
    <div style="font-size:18px;font-weight:700;color:#000;text-align:center;margin-bottom:16px;">北京清尚ECC质量整改统计表</div>
    <div style="background:#fff;border:1px solid #005e00;border-radius:4px;overflow:hidden;box-shadow:0 2px 6px rgba(0,0,0,0.06);margin-bottom:12px;">
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <thead>
          <tr style="background:#fff;">
            <th style="padding:8px 4px;border-right:1px solid #005e00;border-bottom:2px solid #005e00;text-align:center;font-weight:700;">序号</th>
            <th style="padding:8px 4px;border-right:1px solid #005e00;border-bottom:2px solid #005e00;text-align:center;font-weight:700;">问题总数</th>
            <th style="padding:8px 4px;border-right:1px solid #005e00;border-bottom:2px solid #005e00;text-align:center;font-weight:700;">已关闭</th>
            <th style="padding:8px 4px;border-right:1px solid #005e00;border-bottom:2px solid #005e00;text-align:center;font-weight:700;">流程关闭中</th>
            <th style="padding:8px 4px;border-right:1px solid #005e00;border-bottom:2px solid #005e00;text-align:center;font-weight:700;">未关闭</th>
            <th style="padding:8px 4px;border-bottom:2px solid #005e00;text-align:center;font-weight:700;">关闭率</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="padding:8px;border-right:1px solid #005e00;border-bottom:1px solid #005e00;text-align:center;">1</td>
            <td style="padding:8px;border-right:1px solid #005e00;border-bottom:1px solid #005e00;text-align:center;font-weight:700;">${stats.total}</td>
            <td style="padding:8px;border-right:1px solid #005e00;border-bottom:1px solid #005e00;text-align:center;font-weight:700;">${stats.closed}</td>
            <td style="padding:8px;border-right:1px solid #005e00;border-bottom:1px solid #005e00;text-align:center;font-weight:700;">${stats.closing}</td>
            <td style="padding:8px;border-right:1px solid #005e00;border-bottom:1px solid #005e00;text-align:center;font-weight:700;">${stats.open}</td>
            <td style="padding:8px;border-bottom:1px solid #005e00;text-align:center;font-weight:700;color:#059669;">${stats.rate}</td>
          </tr>
        </tbody>
      </table>
    </div>
    ${photoBlock}`;
}

function enlargePage07Photo(src, caption) {
  const overlay = document.getElementById('photoEnlargeOverlay');
  document.getElementById('photoEnlargeImg').src = src;
  overlay.style.display = 'flex';
}

function renderMappingPage08() {
  const rows = M.getPage08Data(currentProjectId);
  document.getElementById('mappingContent').innerHTML = `
    <div style="background:#fff;border:1px solid #005e00;border-radius:4px;overflow:hidden;box-shadow:0 2px 6px rgba(0,0,0,0.06);">
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr style="background:#00a2ff;color:#fff;">
            <th style="padding:6px;border-right:1px solid #005e00;border-bottom:2px solid #005e00;width:10%;">序号</th>
            <th style="padding:6px;border-right:1px solid #005e00;border-bottom:2px solid #005e00;width:60%;">计划事项</th>
            <th style="padding:6px;border-right:1px solid #005e00;border-bottom:2px solid #005e00;width:15%;">责任人</th>
            <th style="padding:6px;border-bottom:2px solid #005e00;width:15%;">当前进度</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((r,i) => {
            const bg = i%2===0?'#cbe0ff':'#e7f0ff';
            const progress = r.progress || r.status || '—';
            const progressColor = progress === '已完成' || progress === '100%' ? '#059669' : (progress === '—' ? '#94a3b8' : '#d97706');
            return `<tr style="background:${bg};">
              <td style="padding:6px;border-right:1px solid #005e00;border-bottom:1px solid #005e00;text-align:center;">${r.seq}</td>
              <td style="padding:6px;border-right:1px solid #005e00;border-bottom:1px solid #005e00;">${r.task}</td>
              <td style="padding:6px;border-right:1px solid #005e00;border-bottom:1px solid #005e00;text-align:center;">${r.owner}</td>
              <td style="padding:6px;border-bottom:1px solid #005e00;text-align:center;font-weight:600;color:${progressColor};">${progress}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
}

function renderMappingPage09() {
  // 根据周报区间计算"下周"周一~周日
  const dayLabels = ['周一','周二','周三','周四','周五','周六','周日'];
  let mondayStr, sundayStr, monday;
  if (_reportRangeEnd) {
    const nextMon = new Date(_reportRangeEnd);
    nextMon.setDate(nextMon.getDate() + 1); // _reportRangeEnd 是周日，+1 = 下周一
    const nextSun = new Date(nextMon);
    nextSun.setDate(nextMon.getDate() + 6);
    const fmt = (dt) => `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
    mondayStr = fmt(nextMon);
    sundayStr = fmt(nextSun);
    monday = nextMon;
  } else {
    const nextMonday = new Date();
    nextMonday.setDate(nextMonday.getDate() + ((1 + 7 - nextMonday.getDay()) % 7 || 7));
    const wr = typeof getWeekRangeForDate === 'function'
      ? getWeekRangeForDate(nextMonday.toISOString().slice(0, 10))
      : (() => {
          const d = new Date(nextMonday);
          const day = d.getDay();
          const diff = day === 0 ? -6 : 1 - day;
          const m = new Date(d);
          m.setDate(d.getDate() + diff);
          const s = new Date(m);
          s.setDate(m.getDate() + 6);
          const f = (dt) => `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
          return { weekStart: f(m), weekEnd: f(s) };
        })();
    mondayStr = wr.weekStart;
    sundayStr = wr.weekEnd;
    monday = new Date(mondayStr);
  }

  const items = M.getPage09Data(currentProjectId, mondayStr, sundayStr);
  if (items.length === 0) {
    document.getElementById('mappingContent').innerHTML = '<div style="text-align:center;padding:40px;color:#94a3b8;">暂无下周计划数据，请先在日计划中创建下周计划</div>';
    return;
  }
  const areas = [...new Set(items.map(i => i.area))];
  const dateLabels = dayLabels.map((_, i) => {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    return (d.getMonth() + 1) + '月' + d.getDate() + '日';
  });
  let html = `
    <div style="overflow-x:auto;">
    <table style="width:100%;border-collapse:collapse;font-size:10px;border:1px solid #005e00;background:#fff;">
      <thead>
        <tr>
          <th colspan="13" style="font-size:13px;background:#fff;border:1px solid #005e00;padding:4px;color:#000;">北京清尚—食堂/南北塔健身房/北塔高管层/南北塔咖啡厅精装周工作计划</th>
        </tr>
        <tr>
          <th rowspan="2" style="border:1px solid #005e00;padding:2px;background:#fff;width:26px;font-weight:700;font-size:10px;">序<br/>号</th>
          <th rowspan="2" style="border:1px solid #005e00;padding:2px;background:#fff;width:45px;font-weight:700;font-size:10px;">区域</th>
          <th rowspan="2" style="border:1px solid #005e00;padding:2px;background:#fff;min-width:120px;font-weight:700;font-size:10px;">工作内容</th>
          <th rowspan="2" style="border:1px solid #005e00;padding:2px;background:#fff;width:32px;font-weight:700;font-size:9px;writing-mode:vertical-rl;text-orientation:mixed;">工作天数</th>
          ${dayLabels.map(d => `<th style="border:1px solid #005e00;padding:2px;background:#fff;width:36px;font-weight:700;font-size:9px;">${d}</th>`).join('')}
          <th rowspan="2" style="border:1px solid #005e00;padding:2px;background:#fff;width:60px;font-weight:700;font-size:9px;">劳动力需求</th>
          <th rowspan="2" style="border:1px solid #005e00;padding:2px;background:#fff;width:50px;font-weight:700;font-size:9px;">材料准备</th>
        </tr>
        <tr>
          ${dateLabels.map(d => `<th style="border:1px solid #005e00;padding:2px;background:#fff;font-weight:700;font-size:9px;">${d}</th>`).join('')}
        </tr>
      </thead>
      <tbody>`;
  areas.forEach(area => {
    const areaItems = items.filter(i => i.area === area);
    areaItems.forEach((item, idx) => {
      const isFirst = idx === 0;
      html += `<tr>
        <td style="border:1px solid #005e00;padding:2px;text-align:center;">${item.seq}</td>
        ${isFirst ? `<td style="border:1px solid #005e00;padding:2px;text-align:center;background:#00a2ff;color:#fff;font-weight:700;font-size:10px;" rowspan="${areaItems.length}">${area}</td>` : ''}
        <td style="border:1px solid #005e00;padding:2px;">${item.task}</td>
        <td style="border:1px solid #005e00;padding:2px;text-align:center;">${item.durationDays}</td>
        ${(item.schedule || []).map(active =>
          `<td style="border:1px solid #005e00;padding:0;width:36px;height:18px;background:${active ? '#00b0f0' : '#fff'};"></td>`
        ).join('')}
        <td style="border:1px solid #005e00;padding:2px;text-align:center;">${item.labor}</td>
        <td style="border:1px solid #005e00;padding:2px;text-align:center;">${item.material}</td>
      </tr>`;
    });
  });
  html += `</tbody></table></div>`;
  document.getElementById('mappingContent').innerHTML = html;
}

// 表格标题按当前周报日期取年月："26年5月施工进度计划跟踪表"
function _getScheduleTableTitle() {
  const base = _reportDate || (typeof M !== 'undefined' && M.TODAY) || '';
  if (!base) return '施工进度计划跟踪表';
  const m = base.match(/^(\d{4})-(\d{1,2})/);
  if (!m) return '施工进度计划跟踪表';
  return `${m[1].slice(2)}年${parseInt(m[2])}月施工进度计划跟踪表`;
}

function renderMappingPage10() {
  const sections = M.getPageSectionsData(currentProjectId);
  if (sections.length === 0) {
    document.getElementById('mappingContent').innerHTML = '<div style="text-align:center;padding:40px;color:#94a3b8;">暂无数据</div>';
    return;
  }
  // 2N sub-pages：偶数下标 = 施工段划分（图片），奇数下标 = 施工计划（表格）
  const totalSubs = sections.length * 2;
  if (_page10Page >= totalSubs) _page10Page = 0;
  const sectionIdx = Math.floor(_page10Page / 2);
  const isImage = _page10Page % 2 === 0;
  const sec = sections[sectionIdx];
  const sectionNum = sectionIdx + 1;
  if (typeof PAGE_HEADERS !== 'undefined') {
    if (!PAGE_HEADERS['11']) PAGE_HEADERS['11'] = {};
    PAGE_HEADERS['11'].subtitle = `4.${sectionNum} ${sec.name} ${isImage ? '施工段划分' : '施工计划'}`;
  }

  if (isImage) {
    const validImages = (sec.items || []).filter(it => it.image);
    let body;
    if (validImages.length > 0) {
      const count = validImages.length;
      // 列数：单图 1 列（铺满），2-3 张用 2 列（更宽更大），4+ 张用 3 列
      let cols;
      if (count <= 1) cols = 1;
      else if (count <= 3) cols = 2;
      else if (count === 4) cols = 2;
      else cols = Math.min(count, 3);
      const imgs = validImages.map(p =>
        `<div style="border:1px solid #ccc;background:#fff;overflow:hidden;display:flex;flex-direction:column;height:100%;">
          <div style="flex:1;min-height:0;display:flex;align-items:center;justify-content:center;background:#f8fafc;overflow:hidden;padding:6px;">
            <img src="${(p.image.startsWith('data:') ? p.image : p.image)}" style="max-width:100%;max-height:100%;object-fit:contain;display:block;">
          </div>
          <div style="padding:4px 8px;font-size:12px;color:#0f172a;background:#fff;border-top:1px solid #e2e8f0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex-shrink:0;">${p.label || '现场照片'}</div>
        </div>`
      ).join('');
      body = `<div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:16px;height:100%;padding:12px;">${imgs}</div>`;
    } else {
      body = `<div style="text-align:center;padding:80px 20px;color:#94a3b8;">暂无施工段图片</div>`;
    }
    document.getElementById('mappingContent').innerHTML = `<div style="height:100%;padding-top:8px;">${body}</div>`;
  } else {
    const floorHeaders = sec.floorHeaders || [
      { name: '一层', color: '#f4b084' },
      { name: '二层', color: '#a9d08e' }
    ];
    let body;
    if ((sec.rows || []).length === 0) {
      body = `<div style="text-align:center;padding:80px 20px;color:#94a3b8;">暂无施工计划</div>`;
    } else {
      let header1 = `<th colspan="4" style="border:1px solid #999;padding:4px;background:#f2f2f2;font-size:14px;text-align:center;">${_getScheduleTableTitle()}</th>`;
      header1 += floorHeaders.map(f => `<th colspan="3" style="border:1px solid #999;padding:4px;text-align:center;font-size:10px;background:${f.color};color:#000;">${f.name}</th>`).join('');
      let header2 = `<th style="border:1px solid #999;padding:2px;width:28px;">序号</th>`;
      header2 += `<th style="border:1px solid #999;padding:2px;width:36px;">楼栋</th>`;
      header2 += `<th style="border:1px solid #999;padding:2px;width:36px;">部位</th>`;
      header2 += `<th style="border:1px solid #999;padding:2px;">工序</th>`;
      header2 += floorHeaders.flatMap(() => ['开始时间','完成时间','日历天']).map(h => `<th style="border:1px solid #999;padding:2px;width:42px;">${h}</th>`).join('');
      const rows = sec.rows.map((item, i) => {
        const bg = i % 2 === 0 ? '#f8fafc' : '#fff';
        const highlight = (i === 4 || i === 8) ? 'background:#ffff00;font-weight:700;' : '';
        return `<tr style="background:${bg};">
          <td style="border:1px solid #999;padding:2px;text-align:center;">${i+1}</td>
          <td style="border:1px solid #999;padding:2px;text-align:center;">${item.building}</td>
          <td style="border:1px solid #999;padding:2px;text-align:center;">${item.location}</td>
          <td style="border:1px solid #999;padding:2px;${highlight}">${item.process}</td>
          ${item.floors.flatMap(f => [
            `<td style="border:1px solid #999;padding:2px;text-align:center;">${f.startDate}</td>`,
            `<td style="border:1px solid #999;padding:2px;text-align:center;">${f.endDate}</td>`,
            `<td style="border:1px solid #999;padding:2px;text-align:center;">${f.days}</td>`
          ]).join('')}
        </tr>`;
      }).join('');
      body = `<div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;font-size:10px;border:1px solid #999;">
          <thead>
            <tr>${header1}</tr>
            <tr>${header2}</tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
    }
    document.getElementById('mappingContent').innerHTML = `<div style="height:100%;padding-top:8px;">${body}</div>`;
  }
}

function renderMappingPage12() {
  const items = M.getPage12Data(currentProjectId, true);
  const { weekStart, weekEnd } = getWeekRange();

  let html = `
    <div style="margin-bottom:12px; font-size:13px; color:#64748b;">
      数据源：协调事宜登记（未闭环）
      <span style="margin-left:12px; font-weight:600; color:#0f172a;">${items.length} 项未闭环</span>
      <span style="margin-left:8px; font-size:12px; color:#94a3b8;">（共 ${M.ISSUES.filter(i => i.projectId === currentProjectId && i.type === 'coordination').length} 项）</span>
    </div>
    <table style="width:100%; border-collapse:collapse; border:1px solid #166534;">
      <thead>
        <tr style="background:#0ea5e9; color:#fff;">
          <th style="padding:0; border:1px solid #166534; width:65px; height:85px; text-align:center; font-size:18px; font-weight:700; letter-spacing:1px;">序号</th>
          <th style="padding:0; border:1px solid #166534; height:85px; text-align:center; font-size:18px; font-weight:700; letter-spacing:1px;">需协调事宜</th>
          <th style="padding:0; border:1px solid #166534; width:130px; height:85px; text-align:center; font-size:18px; font-weight:700; letter-spacing:1px;">提出部门</th>
          <th style="padding:0; border:1px solid #166534; width:130px; height:85px; text-align:center; font-size:18px; font-weight:700; letter-spacing:1px;">配合部门</th>
        </tr>
      </thead>
      <tbody>`;
  if (items.length === 0) {
    html += `
      <tr>
        <td style="padding:30px; border:1px solid #166534; text-align:center; color:#94a3b8;" colspan="4">
          暂无未闭环的协调事项
        </td>
      </tr>`;
  } else {
    items.forEach((item, i) => {
      const bg = i % 2 === 0 ? '#dbeafe' : '#eff6ff';
      html += `
        <tr style="background:${bg}; height:40px;">
          <td style="padding:6px; border:1px solid #166534; text-align:center;">${item.seq}</td>
          <td style="padding:6px; border:1px solid #166534;">${item.issue}</td>
          <td style="padding:6px; border:1px solid #166534; text-align:center;">${item.proposeDept}</td>
          <td style="padding:6px; border:1px solid #166534; text-align:center;">${item.cooperateDept}</td>
        </tr>`;
    });
  }
  html += `</tbody></table>`;
  document.getElementById('mappingContent').innerHTML = html;
}

// ============================================================
// 工具函数
// ============================================================
function formatDate(dateStr) {
  const date = new Date(dateStr);
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

function formatDateObj(date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function getWeekInfo(date) {
  const dayOfWeek = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][date.getDay()];
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `${month}月${day}日 ${dayOfWeek}`;
}

// ============================================================
// 模态框操作
// ============================================================
function showModal(modalId) {
  document.getElementById(modalId).classList.add('show');
}

function closeModal(modalId) {
  document.getElementById(modalId).classList.remove('show');
}

// ============================================================
// Toast 提示
// ============================================================
function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast ${type}`;
  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
  }, 2500);
}

// ============================================================
// LLM 集成（追加 - 不影响原有逻辑）
// ============================================================
const API_BASE = 'http://localhost:3010/api' ;
let lastSource = 'mock';
let lastLatencyMs = 0;
let backendOnline = false;
let llmConfigured = false;

// 后端健康检查（页面加载时 + 30 秒轮询）
async function checkBackendHealth() {
  const dot = document.getElementById('backendDot');
  const label = document.getElementById('backendLabel');
  if (!dot || !label) return;
  try {
    const r = await fetch(API_BASE + '/health', { cache: 'no-store' });
    if (!r.ok) throw new Error('status ' + r.status);
    const data = await r.json();
    backendOnline = true;
    llmConfigured = data.llm.configured;
    if (data.llm.configured) {
      dot.style.background = '#10b981';
      label.textContent = '🤖 LLM 真实';
      dot.title = `后端在线 · ${data.llm.baseUrl} · ${data.llm.model}`;
    } else {
      dot.style.background = '#f59e0b';
      label.textContent = '⚙️ 后端在线';
      dot.title = '后端在线 · 未配置 API Key，将走 mock';
    }
  } catch (e) {
    backendOnline = false;
    llmConfigured = false;
    dot.style.background = '#ef4444';
    label.textContent = '❌ 后端离线';
    dot.title = '后端未启动（localhost:3010）';
  }
}

// LLM 设置页
async function openLLMSettings() {
  showModal('modalLLM');
  const body = document.getElementById('llmConfigBody');
  body.innerHTML = '<div style="text-align:center; padding:20px; color:#94a3b8;">加载中...</div>';

  try {
    const r = await fetch(API_BASE + '/llm/config');
    if (!r.ok) throw new Error('status ' + r.status);
    const cfg = await r.json();

    const statusBadge = cfg.configured
      ? '<span style="background:#d1fae5; color:#065f46; padding:3px 10px; border-radius:999px; font-size:12px;">✅ LLM 已配置</span>'
      : '<span style="background:#fef3c7; color:#92400e; padding:3px 10px; border-radius:999px; font-size:12px;">⚠️ LLM 未配置</span>';

    body.innerHTML = `
      <div style="display:flex; align-items:center; gap:10px; margin-bottom:14px;">
        <div style="font-size:18px; font-weight:600;">${cfg.provider}</div>
        ${statusBadge}
      </div>
      <div style="background:#f8fafc; border-radius:8px; padding:14px; font-size:13px; line-height:1.9;">
        <div><strong style="color:#475569;">Base URL：</strong> <code style="background:#e0f2fe; padding:2px 6px; border-radius:4px;">${cfg.baseUrl || '未设置'}</code></div>
        <div><strong style="color:#475569;">Model：</strong> <code style="background:#e0f2fe; padding:2px 6px; border-radius:4px;">${cfg.model || '未设置'}</code></div>
        <div><strong style="color:#475569;">Group ID：</strong> ${cfg.groupId || '-'}</div>
        <div><strong style="color:#475569;">API Key：</strong> <code style="background:#fef3c7; padding:2px 6px; border-radius:4px;">${cfg.apiKeyMasked || '未设置'}</code></div>
        <div><strong style="color:#475569;">Max Tokens：</strong> ${cfg.maxTokens}</div>
        <div><strong style="color:#475569;">Temperature：</strong> ${cfg.temperature}</div>
      </div>
      <div style="margin-top:14px; background:#fffbeb; border:1px solid #fde68a; border-radius:6px; padding:10px 12px; font-size:12px; color:#92400e; line-height:1.6;">
        💡 <strong>配置来源</strong>：后端从 <code>daily-report-system/.env</code> 读取 <code>MINIMAX_*</code> 环境变量。<br>
        如需修改，编辑 <code>.env</code> 后重启后端服务（<code>backend/start.bat</code>）。
      </div>
      <div id="llmTestResult" style="margin-top:14px; display:none;"></div>
    `;
  } catch (e) {
    body.innerHTML = `
      <div style="text-align:center; padding:30px 0; color:#ef4444;">
        <div style="font-size:36px;">❌</div>
        <div style="margin-top:10px; font-size:14px;">无法连接后端服务</div>
        <div style="font-size:12px; color:#94a3b8; margin-top:4px;">${e.message}</div>
        <div style="font-size:12px; color:#94a3b8; margin-top:10px;">请确认后端已启动：<br><code>cd backend && node server.js</code></div>
      </div>
    `;
  }
}

async function testLLMConnection() {
  const resultDiv = document.getElementById('llmTestResult');
  resultDiv.style.display = 'block';
  resultDiv.innerHTML = '<div style="text-align:center; color:#64748b; padding:14px;">⏳ 正在测试连接...</div>';

  try {
    const r = await fetch(API_BASE + '/llm/test', { method: 'POST' });
    const data = await r.json();
    if (!data.success) throw new Error(data.error || '未知错误');

    resultDiv.innerHTML = `
      <div style="background:#d1fae5; border:1px solid #10b981; border-radius:6px; padding:12px;">
        <div style="font-size:14px; color:#065f46; font-weight:600;">✅ 连接成功</div>
        <div style="font-size:12px; color:#065f46; margin-top:6px; line-height:1.7;">
          模型：<code>${data.model}</code><br>
          响应：<code>${data.reply}</code><br>
          延迟：<strong>${data.latencyMs}ms</strong>
        </div>
      </div>
    `;
    showToast(`✅ LLM 连接成功 · ${data.latencyMs}ms`, 'success');
  } catch (e) {
    resultDiv.innerHTML = `
      <div style="background:#fee2e2; border:1px solid #ef4444; border-radius:6px; padding:12px;">
        <div style="font-size:14px; color:#991b1b; font-weight:600;">❌ 连接失败</div>
        <div style="font-size:12px; color:#991b1b; margin-top:6px;">${e.message}</div>
        <div style="font-size:11px; color:#7f1d1d; margin-top:6px;">系统将自动降级到 mock 模式运行</div>
      </div>
    `;
    showToast('❌ LLM 连接失败', 'error');
  }
}

// ============================================================
// 周报模版 / 导出 / 打印功能
// ============================================================

const _REPORT_PAGES = ['01','02','03','04','05','06','07','08','09','10','11','12'];

const TEMPLATES = {
  cscec:  { name:'中建三局集团', headerColor:'#37a3eb', bg:'背景.png', projectId:'baicaoyuan' },
  bcy:    { name:'百草园·清尚',   headerColor:'#059669', bg:'背景.png', projectId:'baicaoyuan' },
  generic:{ name:'通用周报',      headerColor:'#6366f1', bg:'',           projectId:'baicaoyuan' }
};

let currentTemplate = 'cscec';
let showBackground = true;
let customBgUrl = '';       // 用户上传的自定义背景图 URL
let _reportDate = '';       // 用户设定的周报日期（空=使用当天）
let _reportRangeStart = ''; // 周报数据区间起始（空=使用周范围）
let _reportRangeEnd = '';   // 周报数据区间结束
let _attendanceMode = 'full'; // 'full'=按满勤 'actual'=按实际出勤
let _s03Photo = '';   // 管理人员合影照片 dataURL
let _s03PhotoCaption = '管理人员合影';

// 周报 06 照片持久化（使用 PostgreSQL）
async function _loadPage06Photos() {
  await loadPage06Photos();
}

function _pageFn(page) {
  const m = {
    '01':renderMappingPage01,'02':renderMappingPage02,'03':renderMappingPage03,
    '04':renderMappingPage0301,'05':renderMappingPage04,'06':renderMappingPage05,
    '07':renderMappingPage06,'08':renderMappingPage07,'09':renderMappingPage08,
    '10':renderMappingPage09,'11':renderMappingPage10,'12':renderMappingPage12
  };
  return m[page];
}

function _pageTitle(page) {
  const t = {'01':'工程概况','02':'本周完成工作','03':'下周计划','04':'重要节点',
  '05':'时间轴·生产周报','06':'现场照片','07':'施工人员统计','08':'ECC销项',
  '09':'图纸深化','10':'生产进度曲线','11':'施工段划分与计划','12':'协调事宜'};
  return t[page] || page;
}

function _getBgCss() {
  if (!showBackground) return 'none';
  const url = customBgUrl || TEMPLATES[currentTemplate].bg;
  return url ? `url('${url}') center/cover no-repeat` : 'none';
}

function _getHeaderColor() {
  return TEMPLATES[currentTemplate].headerColor;
}

function _buildAllPagesHTML() {
  const el = document.getElementById('mappingContent');
  const cur = document.querySelector('#reportPageNav button.active[data-page]');
  const bg = _getBgCss();
  const hc = _getHeaderColor();
  const noBg = bg === 'none' ? ' no-bg' : '';
  let html = '';
  const { weekStart, weekEnd } = getWeekRange();
  const weekLabel = weekStart && weekEnd ? weekStart.replace(/-/g,'.')+' ~ '+weekEnd.replace(/-/g,'.') : '';
  _REPORT_PAGES.forEach(p => {
    const fn = _pageFn(p);
    if (!fn) { console.log('[BuildPage] skip', p, 'no fn'); return; }
    try { fn(); } catch(e) { console.log('[BuildPage] error', p, e.message); return; }
    console.log('[BuildPage] rendered', p, 'content length:', el.innerHTML.length);
    if (p === '01') {
      html += `<div class="report-page-frame${noBg}" style="page-break-after:always;">${el.innerHTML}</div>`;
    } else {
      html += _pageWrapHTML(p, el.innerHTML, hc, noBg, weekLabel);
    }
    // 04（原 0301）续页（多组月份/专业）
    if (p === '04' && _milestonePages.length > 1) {
      for (let pi = 1; pi < _milestonePages.length; pi++) {
        html += _pageWrapHTML(p, _milestonePages[pi].html, hc, noBg, weekLabel);
      }
    }
    // 05（原 04）续页（每页 12 行）
    if (p === '05' && _page04Pages.length > 1) {
      for (let pi = 1; pi < _page04Pages.length; pi++) {
        html += _pageWrapHTML(p, _renderPage04Table(_page04Pages[pi]), hc, noBg, weekLabel);
      }
    }
    // 06（原 05）续页（每页 6 张照片）
    if (p === '06' && _page05Pages.length > 1) {
      for (let pi = 1; pi < _page05Pages.length; pi++) {
        html += _pageWrapHTML(p, _renderPage05Grid(_page05Pages[pi]), hc, noBg, weekLabel);
      }
    }
  });
  if (cur) cur.click();
  return html;
}

function _pageWrapHTML(page, content, hc, noBg, weekLabel) {
  const title = _pageTitle(page);
  const ph = typeof PAGE_HEADERS !== 'undefined' ? PAGE_HEADERS[page] : null;
  const sub = ph && ph.subtitle ? ph.subtitle : '';
  const pad = ph && ph.pad ? ph.pad : 80;
  const subBar = sub
    ? `<div style="position:absolute;top:82px;left:72px;width:285px;height:38px;background:linear-gradient(to right,#facc15,#f43f5e);z-index:2;border-radius:0 2px 2px 0;"></div>
       <div style="position:absolute;top:82px;left:72px;height:38px;line-height:38px;padding-left:12px;color:#fff;font-size:16px;font-weight:700;z-index:3;letter-spacing:1px;">${sub}</div>`
    : '';
  const wkLabel = weekLabel
    ? `<div class="header-subtitle" style="position:absolute;top:46px;left:80px;font-size:11px;color:#64748b;white-space:nowrap;">${weekLabel}</div>`
    : '';
  return `<div class="report-page-frame${noBg}">
    <div class="report-page-header">
      <div class="trapezoid" style="background:${hc};"></div>
      <div class="header-line" style="background:${hc};"></div>
      <div class="header-title" style="color:${hc};">${title}</div>
      ${wkLabel}
    </div>
    ${subBar}
    <div class="report-page-content" style="padding:${pad}px 30px 20px;">${content}</div>
  </div>`;
}

function _getStyleText() {
  let css = '';
  try {
    for (const s of document.styleSheets) {
      try { const r = s.cssRules || s.rules; if (r) for (const c of r) css += c.cssText; } catch (_) {}
    }
  } catch (_) {}
  return css;
}

function printReport() {
  const pages = _buildAllPagesHTML();
  const hc = _getHeaderColor();
  console.log('[Print] pages.length:', pages.length, 'frames:', (pages.match(/report-page-frame/g) || []).length);
  if (!pages || pages.trim().length < 50) { alert('周报内容为空，请先录入数据'); return; }

  const baseUrl = window.location.href.substring(0, window.location.href.lastIndexOf('/') + 1);
  const bgUrl = customBgUrl || TEMPLATES[currentTemplate].bg;
  const bgCss = bgUrl ? `background:url('${baseUrl}${bgUrl}') center/cover no-repeat;` : '';
  // 用隐藏 iframe 打印，避免浏览器页眉/页脚显示 URL 和标题
  var iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.left = '-9999px';
  iframe.style.top = '0';
  iframe.style.width = '1280px';
  iframe.style.height = '720px';
  iframe.style.border = 'none';
  document.body.appendChild(iframe);
  var iframeDoc = iframe.contentWindow.document;
  iframeDoc.open();
  iframeDoc.write('<!DOCTYPE html><html><head><meta charset="UTF-8">'
    + '<style>'
    + '@page { size:1280px 720px; margin:0; }'
    + 'body { margin:0; padding:0; background:#fff; font-family:"Microsoft YaHei","PingFang SC",sans-serif; }'
    + '.report-page-frame { width:1280px; height:720px; position:relative; overflow:hidden; margin:0; page-break-after:always; ' + bgCss + ' }'
    + '.report-page-frame.no-bg { background:none !important; background-color:#fff !important; }'
    + '.report-page-frame:last-child { page-break-after:auto; }'
    + '.report-page-header { position:absolute; top:0; left:0; right:0; height:75px; z-index:1; }'
    + '.report-page-header .trapezoid { position:absolute; top:23px; left:0; width:58px; height:52px; background:' + hc + '; clip-path:polygon(0 0,60% 0,100% 100%,0 100%); }'
    + '.report-page-header .header-line { position:absolute; top:75px; left:72px; right:0; height:3px; background:' + hc + '; }'
    + '.report-page-header .header-title { position:absolute; top:20px; left:80px; font-size:18px; font-weight:700; color:' + hc + '; white-space:nowrap; }'
    + '.report-page-content { width:1280px; height:720px; box-sizing:border-box; overflow:hidden; }'
    + '</style></head><body>' + pages + '</body></html>');
  iframeDoc.close();

  let printed = false;
  let attempts = 0;
  const maxAttempts = 20;

  function tryPrint() {
    if (printed) return;
    attempts++;
    try {
      var doc = iframe.contentWindow.document;
      var frames = doc.querySelectorAll('.report-page-frame');
      var allImages = doc.querySelectorAll('img');
      var imgsLoaded = true;
      allImages.forEach(function (img) {
        if (!img.complete || img.naturalHeight === 0) imgsLoaded = false;
      });
      console.log('[Print] attempt', attempts, 'frames:', frames.length, 'images loaded:', imgsLoaded);
      if (frames.length >= 12 && imgsLoaded || attempts >= maxAttempts) {
        printed = true;
        setTimeout(function () { iframe.contentWindow.focus(); iframe.contentWindow.print(); }, 500);
        return;
      }
    } catch (e) {
      console.log('[Print] attempt error', attempts, e.message);
    }
    setTimeout(tryPrint, 500);
  }
  setTimeout(tryPrint, 300);

  window.addEventListener('afterprint', function () {
    try { if (iframe && iframe.parentNode) iframe.parentNode.removeChild(iframe); } catch (_) {}
  }, { once: true });
}

function exportReportPDF() {
  const pages = _buildAllPagesHTML();
  if (!pages || pages.trim().length < 50) { alert('周报内容为空，请先录入数据'); return; }

  var toast = function (msg, type) {
    var d = document.createElement('div');
    d.style.cssText = 'background:' + (type === 'error' ? '#ef4444' : '#2563eb') + ';color:#fff;padding:10px 16px;border-radius:6px;margin-bottom:8px;font-size:13px;box-shadow:0 4px 12px rgba(0,0,0,.2);white-space:nowrap;';
    d.textContent = msg;
    var c = document.getElementById('toast') || document.body;
    c.appendChild(d);
    setTimeout(function () { d.style.opacity = '0'; d.style.transition = 'opacity .3s'; }, 3000);
    setTimeout(function () { d.remove(); }, 3400);
  };

  toast('开始导出 PDF...', 'info');

  var loadLib = function (url, check) {
    return new Promise(function (resolve) {
      if (check()) { resolve(); return; }
      var s = document.createElement('script');
      s.src = url;
      s.onload = resolve;
      s.onerror = resolve;
      document.head.appendChild(s);
      setTimeout(resolve, 5000);
    });
  };

  Promise.all([
    loadLib('https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js', function () { return window.jspdf && window.jspdf.jsPDF; }),
    loadLib('https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js', function () { return window.html2canvas; })
  ]).then(function () {
    var container = document.createElement('div');
    container.id = '_exportPages';
    container.innerHTML = pages;
    container.style.cssText = 'position:fixed;left:-9999px;top:0;width:1280px;background:#fff;z-index:-1;';
    document.body.appendChild(container);

    var frames = container.querySelectorAll('.report-page-frame');
    var pdf = new window.jspdf.jsPDF({ orientation: 'landscape', unit: 'px', format: [1280, 720], compress: true });
    var idx = 0;

    function captureNext() {
      if (idx >= frames.length) {
        pdf.save('百草园-清尚-周报.pdf');
        container.remove();
        toast('导出完成', 'success');
        return;
      }
      toast('处理 ' + (idx + 1) + '/' + frames.length, 'info');
      window.html2canvas(frames[idx], {
        width: 1280, height: 720,
        scale: 1.5, backgroundColor: '#ffffff',
        useCORS: true, allowTaint: true,
        imageTimeout: 20000, logging: false,
        foreignObjectRendering: false,
        onclone: function (clonedDoc) {
          var all = clonedDoc.querySelectorAll('*');
          for (var i = 0; i < all.length; i++) {
            var el = all[i];
            if (!el.textContent || !el.textContent.trim()) continue;
            var cs = clonedDoc.defaultView.getComputedStyle(el);
            var lh = cs.lineHeight;
            if (lh && lh !== 'normal' && lh.indexOf('px') > -1) {
              el.style.lineHeight = Math.max(1, parseFloat(lh) - 6) + 'px';
            }
            var pt = cs.paddingTop;
            if (pt && pt.indexOf('px') > -1 && parseFloat(pt) >= 4) {
              el.style.paddingTop = (parseFloat(pt) - 4) + 'px';
            }
          }
          // fix clip-path
          var all2 = clonedDoc.querySelectorAll('*');
          for (var j = 0; j < all2.length; j++) {
            var e = all2[j];
            try { var cp = clonedDoc.defaultView.getComputedStyle(e).clipPath; } catch (ex) { continue; }
            if (!cp || cp === 'none') continue;
            var m = cp.match(/polygon\(([^)]+)\)/i);
            if (!m) continue;
            var r = e.getBoundingClientRect();
            if (r.width <= 0 || r.height <= 0) continue;
            var bg = clonedDoc.defaultView.getComputedStyle(e).backgroundColor;
            if (!bg || bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') bg = '#37a3eb';
            var parent = e.parentElement;
            while (parent && clonedDoc.defaultView.getComputedStyle(parent).position === 'static') parent = parent.parentElement;
            if (!parent) parent = e.parentElement;
            var pr = parent.getBoundingClientRect();
            var cv = clonedDoc.createElement('canvas');
            cv.width = r.width;
            cv.height = r.height;
            cv.style.cssText = 'position:absolute;top:' + (r.top - pr.top) + 'px;left:' + (r.left - pr.left) + 'px;width:' + r.width + 'px;height:' + r.height + 'px;z-index:100;pointer-events:none;';
            var ctx = cv.getContext('2d');
            ctx.fillStyle = bg;
            var pairs = m[1].split(',');
            ctx.beginPath();
            for (var k = 0; k < pairs.length; k++) {
              var xy = pairs[k].trim().split(/\s+/);
              var x = xy[0].indexOf('%') > -1 ? (parseFloat(xy[0]) / 100) * r.width : parseFloat(xy[0]);
              var y = xy[1].indexOf('%') > -1 ? (parseFloat(xy[1]) / 100) * r.height : parseFloat(xy[1]);
              if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            }
            ctx.closePath();
            ctx.fill();
            e.style.clipPath = 'none';
            e.style.visibility = 'hidden';
            parent.appendChild(cv);
          }
        }
      }).then(function (canvas) {
        var imgData = canvas.toDataURL('image/jpeg', 0.95);
        if (idx > 0) pdf.addPage([1280, 720], 'landscape');
        pdf.addImage(imgData, 'JPEG', 0, 0, 1280, 720);
        idx++;
        setTimeout(captureNext, 200);
      }).catch(function (err) {
        toast('页面 ' + (idx + 1) + ' 失败: ' + (err.message || err), 'error');
        idx++;
        setTimeout(captureNext, 200);
      });
    }

    setTimeout(function () {
      var imgs = container.querySelectorAll('img');
      var total = imgs.length;
      var loaded = 0;
      function startCapture() { captureNext(); }
      if (total === 0) { startCapture(); return; }
      imgs.forEach(function (img) {
        if (img.complete && img.naturalHeight > 0) { loaded++; if (loaded >= total) startCapture(); }
        else { img.onload = img.onerror = function () { loaded++; if (loaded >= total) startCapture(); }; }
      });
      setTimeout(startCapture, 5000);
    }, 100);
  });
}

// ============================================================
// 每日签到
// ============================================================

function openAttendanceInput() {
  const dateInput = document.getElementById('attendanceDate');
  dateInput.value = M.TODAY;
  renderAttendanceList();
  _refreshAttendancePhotoUI();
  // 每次打开都从后端拉取最新照片（保证多端/刷新后一致）
  loadPage03Photo();
  showModal('modalAttendance');
}

// 渲染管理人员签到表格（与模板列一致：序号/职务/姓名/联系电话/是否到岗）
function renderAttendanceList() {
  const list = document.getElementById('attendanceList');
  const date = document.getElementById('attendanceDate').value || M.TODAY;
  const records = M.getAttendanceForDate(date);
  const mgrs = M.MANAGEMENT_TEAM;

  let html = `
    <table style="width:100%;border-collapse:collapse;font-size:12px;">
      <thead style="position:sticky;top:0;background:#f1f5f9;z-index:1;">
        <tr style="color:#475569;font-weight:600;">
          <th style="width:42px;padding:6px 4px;border-bottom:1px solid #e2e8f0;border-right:1px solid #e2e8f0;">序号</th>
          <th style="padding:6px 4px;border-bottom:1px solid #e2e8f0;border-right:1px solid #e2e8f0;">职务</th>
          <th style="padding:6px 4px;border-bottom:1px solid #e2e8f0;border-right:1px solid #e2e8f0;">姓名</th>
          <th style="padding:6px 4px;border-bottom:1px solid #e2e8f0;border-right:1px solid #e2e8f0;">联系电话</th>
          <th style="width:90px;padding:6px 4px;border-bottom:1px solid #e2e8f0;border-right:1px solid #e2e8f0;">是否到岗</th>
          <th style="padding:6px 4px;border-bottom:1px solid #e2e8f0;border-right:1px solid #e2e8f0;">未到岗说明</th>
          <th style="width:64px;padding:6px 4px;border-bottom:1px solid #e2e8f0;">操作</th>
        </tr>
      </thead>
      <tbody>
  `;
  mgrs.forEach((m, i) => {
    const r = records[m.id] || { present: true, reason: '' };
    const present = r.present;
    const reason = r.reason || '';
    html += `
      <tr style="background:${i%2===0?'#fff':'#f9fafb'};">
        <td style="padding:4px;border-bottom:1px solid #f1f5f9;border-right:1px solid #f1f5f9;text-align:center;color:#94a3b8;">${i+1}</td>
        <td style="padding:2px 4px;border-bottom:1px solid #f1f5f9;border-right:1px solid #f1f5f9;"><input class="att-cell" data-id="${m.id}" data-field="position" value="${(m.position||'').replace(/"/g,'&quot;')}" style="width:100%;border:1px solid transparent;background:transparent;padding:2px 4px;font-size:12px;border-radius:3px;" onblur="updateManagementField('${m.id}','position',this.value);this.style.background='transparent';this.style.border='1px solid transparent';" onfocus="this.style.background='#fff';this.style.border='1px solid #00adef';"></td>
        <td style="padding:2px 4px;border-bottom:1px solid #f1f5f9;border-right:1px solid #f1f5f9;"><input class="att-cell" data-id="${m.id}" data-field="name" value="${(m.name||'').replace(/"/g,'&quot;')}" style="width:100%;border:1px solid transparent;background:transparent;padding:2px 4px;font-size:12px;border-radius:3px;" onblur="updateManagementField('${m.id}','name',this.value);this.style.background='transparent';this.style.border='1px solid transparent';" onfocus="this.style.background='#fff';this.style.border='1px solid #00adef';"></td>
        <td style="padding:2px 4px;border-bottom:1px solid #f1f5f9;border-right:1px solid #f1f5f9;"><input class="att-cell" data-id="${m.id}" data-field="phone" value="${(m.phone||'').replace(/"/g,'&quot;')}" style="width:100%;border:1px solid transparent;background:transparent;padding:2px 4px;font-size:12px;border-radius:3px;" onfocus="this.style.background='#fff';this.style.border='1px solid #00adef';" onblur="updateManagementField('${m.id}','phone',this.value);this.style.background='transparent';this.style.border='1px solid transparent';"></td>
        <td style="padding:4px;border-bottom:1px solid #f1f5f9;border-right:1px solid #f1f5f9;text-align:center;">
          <input type="checkbox" class="attendance-cb" value="${m.id}" ${present?'checked':''} onchange="updateAttendancePresent('${m.id}',this.checked)">
        </td>
        <td style="padding:2px 4px;border-bottom:1px solid #f1f5f9;border-right:1px solid #f1f5f9;">
          ${present
            ? '<span style="font-size:10px;color:#94a3b8;">—</span>'
            : `<input class="attendance-reason" data-id="${m.id}" value="${(reason||'').replace(/"/g,'&quot;')}" placeholder="如：事假 / 病假 / 出差 / 调休" style="width:100%;border:1px solid #fbbf24;background:#fffbeb;padding:2px 6px;font-size:12px;border-radius:3px;color:#92400e;" oninput="updateAttendanceReason('${m.id}',this.value)">`}
        </td>
        <td style="padding:4px;border-bottom:1px solid #f1f5f9;text-align:center;">
          <button class="btn btn-xs btn-ghost" onclick="removeManagementRow('${m.id}')" style="font-size:10px;padding:1px 6px;color:#ef4444;" title="删除">🗑</button>
        </td>
      </tr>
    `;
  });
  html += `</tbody></table>`;
  list.innerHTML = html;
  _refreshAttendanceCount();
}

// 刷新"在岗 N / 总 N"
function _refreshAttendanceCount() {
  const date = document.getElementById('attendanceDate').value || M.TODAY;
  const records = M.getAttendanceForDate(date);
  const total = M.MANAGEMENT_TEAM.length;
  const present = M.MANAGEMENT_TEAM.filter(m => (records[m.id] || { present: true }).present).length;
  const el1 = document.getElementById('attPresentCount');
  const el2 = document.getElementById('attTotalCount');
  if (el1) el1.textContent = present;
  if (el2) el2.textContent = total;
}

// 编辑管理人员字段（职务/姓名/电话）
async function updateManagementField(id, field, value) {
  const m = M.MANAGEMENT_TEAM.find(x => x.id === id);
  if (!m) return;
  m[field] = value;
  try {
    await fetch('http://localhost:3010/api/management-team', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, position: m.position, name: m.name, phone: m.phone })
    });
  } catch { /* 离线不报错 */ }
}

// 新增一行管理人员
async function addManagementRow() {
  // 生成唯一 id：MGRxx（找最大编号 +1）
  const nums = M.MANAGEMENT_TEAM
    .map(m => parseInt(String(m.id).replace(/^MGR/i, ''), 10))
    .filter(n => !isNaN(n));
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  const id = 'MGR' + String(next).padStart(2, '0');
  const mgr = { id, position: '', name: '', phone: '' };
  M.MANAGEMENT_TEAM.push(mgr);
  try {
    await fetch('http://localhost:3010/api/management-team', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mgr)
    });
  } catch { /* 离线不报错 */ }
  renderAttendanceList();
  showToast('已新增管理人员，请填写职务/姓名/电话', 'success');
}

// 删除一行管理人员
async function removeManagementRow(id) {
  const m = M.MANAGEMENT_TEAM.find(x => x.id === id);
  if (!m) return;
  const ok = await showConfirm(`确定删除「${m.name || id}」？该人员的签到记录也会被清除。`, '删除管理人员', '🗑');
  if (!ok) return;
  M.MANAGEMENT_TEAM = M.MANAGEMENT_TEAM.filter(x => x.id !== id);
  // 同步清掉该 id 在所有日期的签到记录
  Object.keys(M.DAILY_ATTENDANCE || {}).forEach(d => {
    if (M.DAILY_ATTENDANCE[d]) delete M.DAILY_ATTENDANCE[d][id];
  });
  try {
    await fetch('http://localhost:3010/api/management-team/' + encodeURIComponent(id), { method: 'DELETE' });
  } catch { /* 离线不报错 */ }
  renderAttendanceList();
  showToast('已删除', 'info');
}

// 更新某管理人员某日期的"是否到岗"（立即影响计数和预览）
function updateAttendancePresent(id, present) {
  const date = document.getElementById('attendanceDate').value || M.TODAY;
  const records = M.getAttendanceForDate(date);
  records[id] = { present, reason: records[id]?.reason || '' };
  _refreshAttendanceCount();
  // 切换到"未到岗"后，刷新该行以显示说明输入框
  const row = document.querySelector(`#attendanceList input.attendance-cb[value="${id}"]`)?.closest('tr');
  if (row) {
    const reasonCell = row.children[5]; // 「未到岗说明」列
    if (reasonCell) {
      if (present) {
        reasonCell.innerHTML = '<span style="font-size:10px;color:#94a3b8;">—</span>';
      } else {
        const cur = records[id]?.reason || '';
        reasonCell.innerHTML = `<input class="attendance-reason" data-id="${id}" value="${(cur||'').replace(/"/g,'&quot;')}" placeholder="如：事假 / 病假 / 出差 / 调休" style="width:100%;border:1px solid #fbbf24;background:#fffbeb;padding:2px 6px;font-size:12px;border-radius:3px;color:#92400e;" oninput="updateAttendanceReason('${id}',this.value)" autofocus>`;
        const input = reasonCell.querySelector('input');
        if (input) { input.focus(); }
      }
    }
  }
  // 立即同步到后端（防抖，多次切换合并一次请求）
  _saveAttendanceDebounced(date);
}

function updateAttendanceReason(id, reason) {
  const date = document.getElementById('attendanceDate').value || M.TODAY;
  const records = M.getAttendanceForDate(date);
  records[id] = { present: records[id]?.present ?? false, reason };
  // 防抖保存
  _saveAttendanceDebounced(date);
}

// 防抖保存：300ms 内多次变更合并为一次 POST
let _attSaveTimer = null;
let _attSaveLatestDate = null;
function _saveAttendanceDebounced(date) {
  _attSaveLatestDate = date;
  if (_attSaveTimer) clearTimeout(_attSaveTimer);
  _attSaveTimer = setTimeout(() => {
    const d = _attSaveLatestDate;
    _attSaveTimer = null;
    _saveAttendanceToBackend(d);
    // 同步刷新周报 03 预览：若当前正在显示 03，则用 switchMappingTab 走完整包装（带标题/色条）
    const cur = document.querySelector('#reportPageNav button.active[data-page]');
    if (cur && cur.dataset.page === '03' && typeof switchMappingTab === 'function') {
      switchMappingTab('03');
    }
  }, 300);
}

async function _saveAttendanceToBackend(date) {
  const records = M.getAttendanceForDate(date);
  try {
    await fetch('http://localhost:3010/api/attendance', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, projectId: currentProjectId, records })
    });
  } catch (err) { console.warn('[签到] 保存失败:', err); }
}

function _refreshAttendancePhotoUI() {
  const preview = document.getElementById('attPhotoPreview');
  const caption = document.getElementById('attPhotoCaption');
  const enlargeBtn = document.getElementById('attPhotoEnlargeBtn');
  const clearBtn = document.getElementById('attPhotoClearBtn');
  if (!preview) return;

  if (_s03Photo) {
    preview.innerHTML = `<img src="${_s03Photo}" style="width:100%;height:100%;object-fit:contain;cursor:pointer;" onclick="enlargeAttendancePhoto()">`;
    preview.style.border = '2px solid #2563eb';
    caption.value = _s03PhotoCaption || '管理人员合影';
    caption.style.display = '';
    enlargeBtn.style.display = '';
    clearBtn.style.display = '';
  } else {
    preview.innerHTML = '暂无照片';
    preview.style.border = '2px dashed #d1d5db';
    caption.style.display = 'none';
    enlargeBtn.style.display = 'none';
    clearBtn.style.display = 'none';
  }
}

function uploadAttendancePhoto(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async function(e) {
    _s03Photo = e.target.result;
    _s03PhotoCaption = document.getElementById('attPhotoCaption').value || '管理人员合影';
    _refreshAttendancePhotoUI();
    // 若当前正在 03 预览页，用 switchMappingTab 走完整包装，避免丢失标题/色条
    const cur = document.querySelector('#reportPageNav button.active[data-page]');
    if (cur && cur.dataset.page === '03' && typeof switchMappingTab === 'function') {
      switchMappingTab('03');
    }
    // 持久化到后端（每项目一张）
    try {
      await fetch('http://localhost:3010/api/page03-photo', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: currentProjectId, src: _s03Photo, caption: _s03PhotoCaption })
      });
    } catch (err) { console.warn('[签到照片] 保存失败:', err); }
  };
  reader.readAsDataURL(file);
  input.value = '';
}

function clearAttendancePhoto() {
  _s03Photo = '';
  _s03PhotoCaption = '管理人员合影';
  _refreshAttendancePhotoUI();
  const cur = document.querySelector('#reportPageNav button.active[data-page]');
  if (cur && cur.dataset.page === '03' && typeof switchMappingTab === 'function') {
    switchMappingTab('03');
  }
  // 同步删除后端
  fetch('http://localhost:3010/api/page03-photo/' + encodeURIComponent(currentProjectId), { method: 'DELETE' })
    .catch(err => console.warn('[签到照片] 删除失败:', err));
}

// 加载当前项目的签到合影
async function loadPage03Photo() {
  try {
    const r = await fetch('http://localhost:3010/api/page03-photo/' + encodeURIComponent(currentProjectId));
    const data = await r.json();
    if (data && data.src) {
      _s03Photo = data.src;
      _s03PhotoCaption = data.caption || '管理人员合影';
    } else {
      _s03Photo = '';
      _s03PhotoCaption = '管理人员合影';
    }
    if (typeof _refreshAttendancePhotoUI === 'function') _refreshAttendancePhotoUI();
    // 若当前正在 03 预览页，用 switchMappingTab 走完整包装，避免丢失标题/色条
    const cur = document.querySelector('#reportPageNav button.active[data-page]');
    if (cur && cur.dataset.page === '03' && typeof switchMappingTab === 'function') {
      switchMappingTab('03');
    }
  } catch (e) { console.warn('[签到照片] 加载失败:', e); }
}

function enlargeAttendancePhoto() {
  if (!_s03Photo) return;
  const img = document.getElementById('photoEnlargeImg');
  const overlay = document.getElementById('photoEnlargeOverlay');
  if (img && overlay) {
    img.src = _s03Photo;
    overlay.style.display = 'flex';
  }
}

function toggleAttendanceReason(cb) {
  // 兼容旧调用：当前不再使用「缺勤原因」内联编辑，但保留空实现以免外部调用报错
}

// ============================================================
// 周报 06 照片管理
// ============================================================

function _genId() { return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

async function loadPage06Photos() {
  try {
    const r = await fetch(`http://localhost:3010/api/page06-photos/${currentProjectId}`);
    const photos = await r.json();
    M.PAGE06_PHOTOS = photos.map(p => ({ id: p.id, src: p.src, caption: p.caption || '', tradeId: p.trade_id || '' }));
  } catch (e) { console.warn('[Page06 照片] 加载失败:', e); }
}

async function uploadPage06Photo(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async function(e) {
    console.log('[Page06 Upload] before: currentProjectId=', currentProjectId, 'photos before push:', (M.PAGE06_PHOTOS || []).length);
    const id = _genId();
    const photo = { id, src: e.target.result, caption: '', tradeId: '' };
    M.PAGE06_PHOTOS = M.PAGE06_PHOTOS || [];
    M.PAGE06_PHOTOS.push(photo);
    console.log('[Page06 Upload] after push, photos:', M.PAGE06_PHOTOS.length);
    renderPage06PhotoGrid();
    renderMappingPage06();
    // 保存到 DB
    try {
      await fetch('http://localhost:3010/api/page06-photos', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, projectId: currentProjectId, src: e.target.result, caption: '', tradeId: '' })
      });
    } catch (err) { console.warn('[Page06 照片] 保存失败:', err); }
  };
  reader.readAsDataURL(file);
  input.value = '';
}

function renderPage06PhotoGrid() {
  const grid = document.getElementById('page06PhotoGrid');
  const count = document.getElementById('page06PhotoCount');
  if (!grid) return;
  const photos = M.PAGE06_PHOTOS || [];
  if (count) count.textContent = `共 ${photos.length} 张照片`;
  if (photos.length === 0) {
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:16px;color:#94a3b8;font-size:11px;">暂无照片，点击上方「上传图片」添加</div>';
    return;
  }
  const areas = getProjectAreas(currentProjectId);
  const tradeOptions = areas.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
  grid.innerHTML = photos.map(p => `
    <div style="border:1px solid #e2e8f0;border-radius:4px;overflow:hidden;background:#f8fafb;">
      <div style="width:100%;height:80px;overflow:hidden;background:#f1f5f9;display:flex;align-items:center;justify-content:center;cursor:pointer;" onclick="enlargePage06Photo('${p.id}')">
        <img src="${p.src}" style="width:100%;height:100%;object-fit:contain;">
      </div>
      <div style="padding:4px;">
        <input class="form-input" type="text" value="${(p.caption||'').replace(/"/g,'&quot;')}" placeholder="照片说明" style="width:100%;font-size:10px;padding:2px 4px;margin-bottom:2px;" onchange="updatePage06Photo('${p.id}','caption',this.value)">
        <select style="width:100%;font-size:10px;padding:1px 4px;margin-bottom:2px;border:1px solid #d1d5db;border-radius:2px;" onchange="updatePage06Photo('${p.id}','tradeId',this.value)">
          <option value="">-- 选择工种 --</option>
          ${tradeOptions}
        </select>
        <button class="btn btn-xs btn-ghost" onclick="removePage06Photo('${p.id}')" style="font-size:9px;padding:1px 4px;color:#ef4444;">🗑 删除</button>
      </div>
    </div>
  `).join('');
}

async function removePage06Photo(id) {
  M.PAGE06_PHOTOS = (M.PAGE06_PHOTOS || []).filter(p => p.id !== id);
  renderPage06PhotoGrid();
  renderMappingPage06();
  try {
    await fetch(`http://localhost:3010/api/page06-photos/${currentProjectId}/${id}`, { method: 'DELETE' });
  } catch (e) { console.warn('[Page06 照片] 删除失败:', e); }
}

function updatePage06Photo(id, field, value) {
  const photo = (M.PAGE06_PHOTOS || []).find(p => p.id === id);
  if (photo) photo[field] = value;
  // 保存到 DB
  const p = M.PAGE06_PHOTOS.find(x => x.id === id);
  if (p) {
    fetch('http://localhost:3010/api/page06-photos', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: p.id, projectId: currentProjectId, src: p.src, caption: p.caption || '', tradeId: p.tradeId || '' })
    }).catch(e => console.warn('[Page06 照片] 更新失败:', e));
  }
}

function enlargePage06Photo(id) {
  const photo = (M.PAGE06_PHOTOS || []).find(p => p.id === id);
  if (!photo) return;
  const overlay = document.getElementById('page06PhotoEnlargeOverlay');
  const img = document.getElementById('page06PhotoEnlargeImg');
  const caption = document.getElementById('page06PhotoEnlargeCaption');
  if (overlay && img) {
    img.src = photo.src;
    overlay.style.display = 'flex';
    if (caption) {
      caption.textContent = photo.caption || '';
      caption.style.display = '';
    }
  }
}

function setAllAttendance(checked) {
  document.querySelectorAll('#attendanceList .attendance-cb').forEach(cb => {
    cb.checked = checked;
    updateAttendancePresent(cb.value, checked);
  });
}

async function saveAttendance() {
  const date = document.getElementById('attendanceDate').value;
  const records = {};
  document.querySelectorAll('#attendanceList .attendance-cb').forEach(cb => {
    const prev = M.getAttendanceForDate(date)[cb.value] || {};
    records[cb.value] = { present: cb.checked, reason: prev.reason || '' };
  });
  M.setAttendanceForDate(date, records);
  // 持久化到后端
  try {
    await fetch('http://localhost:3010/api/attendance', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, projectId: currentProjectId, records })
    });
  } catch { /* 离线不报错 */ }
  closeModal('modalAttendance');
  showToast(`📅 ${date} 签到记录已保存`, 'success');
}

// ============================================================
// 模版切换 / 背景控制
// ============================================================

function _applyTemplate() {
  const modal = document.getElementById('modalWeeklyMapping');
  modal.dataset.template = currentTemplate;
  // 同步 nav 背景按钮文本
  const bgBtn = document.getElementById('navBgBtn');
  if (bgBtn) bgBtn.textContent = showBackground ? '☑ 背景' : '□ 背景';
}

function switchTemplate(id) {
  currentTemplate = id;
  const newProjectId = TEMPLATES[id].projectId;
  if (newProjectId && newProjectId !== currentProjectId) {
    switchProject(newProjectId);
  }
  _applyTemplate();
  const cur = document.querySelector('#reportPageNav button.active[data-page]');
  if (cur) switchMappingTab(cur.dataset.page);
  showToast(`已切换至「${TEMPLATES[id].name}」模版`, 'success');
}

function toggleBackground() {
  showBackground = !showBackground;
  const cb = document.getElementById('showBgCheckbox');
  if (cb) cb.checked = showBackground;
  _applyTemplate();
  const cur = document.querySelector('#reportPageNav button.active[data-page]');
  if (cur) switchMappingTab(cur.dataset.page);
}

function changeBackground(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(ev) {
    customBgUrl = ev.target.result;
    showBackground = true;
    document.getElementById('showBgCheckbox').checked = true;
    _applyTemplate();
    const cur = document.querySelector('#reportPageNav button.active[data-page]');
    if (cur) switchMappingTab(cur.dataset.page);
    showToast('背景图已更换', 'success');
  };
  reader.readAsDataURL(file);
  e.target.value = '';
}

function _updateWeekRangeDisplay() {
  const span = document.getElementById('weekRangeDisplay');
  if (!span) return;
  const wr = getWeekRange();
  span.textContent = `（${wr.weekStart} ~ ${wr.weekEnd}）`;
}

function setReportDate(dateStr) {
  _reportDate = dateStr;
  _updateWeekRangeDisplay();
  const cur = document.querySelector('#reportPageNav button.active[data-page]');
  if (cur) switchMappingTab(cur.dataset.page);
}

function _updateReportRangeDisplay() {
  const span = document.getElementById('reportRangeDisplay');
  if (!span) return;
  if (_reportRangeStart && _reportRangeEnd) {
    span.textContent = `${_reportRangeStart} ~ ${_reportRangeEnd}`;
  } else {
    span.textContent = '（使用本周范围）';
  }
}

function setReportRange() {
  const rs = document.getElementById('reportRangeStart');
  const re = document.getElementById('reportRangeEnd');
  _reportRangeStart = rs ? rs.value : '';
  _reportRangeEnd = re ? re.value : '';
  _updateReportRangeDisplay();
  const cur = document.querySelector('#reportPageNav button.active[data-page]');
  if (cur) switchMappingTab(cur.dataset.page);
}

// 在原有 DOMContentLoaded 之后启动健康检查
document.addEventListener('DOMContentLoaded', () => {
  _loadPage06Photos();
  loadPage03Photo();
  // 初始化 page06 unit 按钮高亮
  const initUnit = localStorage.getItem(`page06_unit_${currentProjectId}`) || 'people';
  if (typeof setPage06Unit === 'function') setPage06Unit(initUnit);
  setTimeout(() => {
    checkBackendHealth();
    setInterval(checkBackendHealth, 30000);
  }, 500);
  // 初始化聊天输入框 Enter 键
  const chatInput = document.getElementById('aiChatInput');
  if (chatInput) {
    chatInput.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); }
    });
  }
});

// ============================================================
// 浮动 AI 聊天 — 会话管理 + Markdown 渲染
// ============================================================

// ------ 状态 ------
let _sessionsByProject = {};   // { projectId: [ {id, name, ...}, ... ] }
let _activeSessionId = null;
let _messageCache = {};        // { sessionId: [ {role, content}, ... ] }

// WebSocket
let _ws = null;
let _unreadRemindersByProject = {};

function getUnreadCount(pid) { return _unreadRemindersByProject[pid] || 0; }
function setUnreadCount(pid, n) { _unreadRemindersByProject[pid] = n; }
function getCurrentUnreadCount() {
  return getUnreadCount(typeof currentProjectId !== 'undefined' ? currentProjectId : 'baicaoyuan');
}

// ------ WebSocket ------
function initChatWebSocket() {
  try {
    const wsUrl = 'ws://' + location.hostname + ':3010/ws/chat';
    _ws = new WebSocket(wsUrl);
    _ws.onopen = () => console.log('[WS] 已连接');
    _ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'reminders' && msg.reminders) handleProactiveReminders(msg.reminders);
      } catch (err) { console.warn('[WS] 解析失败:', err); }
    };
    _ws.onclose = () => { console.log('[WS] 断开，3 秒后重连'); setTimeout(initChatWebSocket, 3000); };
    _ws.onerror = (e) => console.warn('[WS] 错误:', e);
  } catch (e) { console.warn('[WS] 初始化失败:', e); }
}

function handleProactiveReminders(reminders) {
  if (!reminders || !reminders.length) return;
  const pid = typeof currentProjectId !== 'undefined' ? currentProjectId : 'baicaoyuan';
  reminders.forEach(r => {
    const rPid = r.projectId || 'baicaoyuan';
    setUnreadCount(rPid, getUnreadCount(rPid) + 1);
    if (r.projectId === pid) {
      appendChatMessage('ai-proactive', r.message);
    }
  });
  updateChatBadge();
}

function updateChatBadge() {
  const badge = document.getElementById('aiChatBadge');
  if (!badge) return;
  const n = getCurrentUnreadCount();
  badge.textContent = n > 99 ? '99+' : n;
  badge.style.display = n > 0 ? 'flex' : 'none';
}

// ------ 会话加载 ------
async function loadSessions(pid) {
  try {
    const res = await fetch('http://localhost:3010/api/chat/sessions?projectId=' + encodeURIComponent(pid));
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const sessions = await res.json();
    _sessionsByProject[pid] = sessions;
    return sessions;
  } catch (e) {
    console.warn('[chat] 加载会话失败:', e.message);
    _sessionsByProject[pid] = [];
    return [];
  }
}

async function ensureSession(pid) {
  const sessions = _sessionsByProject[pid] || await loadSessions(pid);
  if (sessions.length > 0) {
    _activeSessionId = sessions[0].id;
    return sessions[0].id;
  }
  // 无会话则自动创建
  return await createNewSession(pid, '默认对话');
}

async function createNewSession(pid, name) {
  try {
    const res = await fetch('http://localhost:3010/api/chat/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: pid, name: name || '新对话' })
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const session = await res.json();
    if (!_sessionsByProject[pid]) _sessionsByProject[pid] = [];
    _sessionsByProject[pid].unshift(session);
    _activeSessionId = session.id;
    populateSessionSelect(pid);
    document.getElementById('aiChatSessionSelect').value = session.id;
    // 清空消息区
    document.getElementById('aiChatMessages').innerHTML = '';
    appendChatMessage('ai-message-system', '🆕 新对话已创建，有什么要记录的？');
    updateChatBadge();
    return session.id;
  } catch (e) {
    console.error('[chat] 创建会话失败:', e);
    appendChatMessage('system', '⚠️ 创建对话失败: ' + e.message);
    return null;
  }
}

async function deleteSession(sessionId) {
  try {
    const res = await fetch('http://localhost:3010/api/chat/sessions/' + encodeURIComponent(sessionId), { method: 'DELETE' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const pid = typeof currentProjectId !== 'undefined' ? currentProjectId : 'baicaoyuan';
    _sessionsByProject[pid] = (_sessionsByProject[pid] || []).filter(s => s.id !== sessionId);
    delete _messageCache[sessionId];
    // 切换到下一个或新建
    if (_activeSessionId === sessionId) {
      const sessions = _sessionsByProject[pid];
      if (sessions.length > 0) {
        await switchSession(sessions[0].id);
      } else {
        await createNewSession(pid, '默认对话');
      }
    }
  } catch (e) {
    console.error('[chat] 删除会话失败:', e);
    appendChatMessage('system', '⚠️ 删除失败: ' + e.message);
  }
}

async function renameSession(sessionId, name) {
  try {
    await fetch('http://localhost:3010/api/chat/sessions/' + encodeURIComponent(sessionId), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    const pid = typeof currentProjectId !== 'undefined' ? currentProjectId : 'baicaoyuan';
    const sessions = _sessionsByProject[pid] || [];
    const s = sessions.find(s => s.id === sessionId);
    if (s) s.name = name;
    populateSessionSelect(pid);
  } catch (e) {
    console.error('[chat] 重命名失败:', e);
    appendChatMessage('system', '⚠️ 重命名失败: ' + e.message);
  }
}

// ------ 会话切换 ------
async function switchSession(sessionId) {
  if (_activeSessionId === sessionId) return;
  if (!sessionId) return;
  _activeSessionId = sessionId;
  document.getElementById('aiChatSessionSelect').value = sessionId;
  // 从 DB 加载消息
  const container = document.getElementById('aiChatMessages');
  container.innerHTML = '';
  try {
    const res = await fetch('http://localhost:3010/api/chat/sessions/' + encodeURIComponent(sessionId) + '/messages');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const messages = await res.json();
    _messageCache[sessionId] = messages.map(m => ({ id: m.id, role: m.role, content: m.content }));
    for (const m of messages) {
      appendChatMessage(m.role === 'user' ? 'user' : 'system', m.content, true, m.id);
    }
    scrollChatToBottom();
  } catch (e) {
    console.warn('[chat] 加载消息失败:', e.message);
    _messageCache[sessionId] = [];
  }
  if (!container.children.length) {
    appendChatMessage('ai-message-system', '💬 之前的对话记录已清空，开始新的对话吧！', true, null);
  }
  updateChatBadge();
}

function populateSessionSelect(pid) {
  const sel = document.getElementById('aiChatSessionSelect');
  if (!sel) return;
  const sessions = _sessionsByProject[pid] || [];
  sel.innerHTML = sessions.map(s => '<option value="' + s.id + '">' + _escapeHtml(s.name || '对话') + '</option>').join('');
  if (_activeSessionId) sel.value = _activeSessionId;
}

// ------ 会话 UI 操作 ------
function onSessionSelect(sessionId) {
  if (sessionId && sessionId !== _activeSessionId) {
    switchSession(sessionId);
  }
}

function createNewClicked() {
  const pid = typeof currentProjectId !== 'undefined' ? currentProjectId : 'baicaoyuan';
  createNewSession(pid);
}

function toggleSessionMenu() {
  const menu = document.getElementById('aiChatSessionMenu');
  if (!menu) return;
  const shown = menu.style.display !== 'none';
  menu.style.display = shown ? 'none' : 'block';
  if (!shown) {
    const close = (e) => { menu.style.display = 'none'; document.removeEventListener('click', close); };
    setTimeout(() => document.addEventListener('click', close), 10);
  }
}

async function renameCurrentSession() {
  document.getElementById('aiChatSessionMenu').style.display = 'none';
  const sessions = _sessionsByProject[typeof currentProjectId !== 'undefined' ? currentProjectId : 'baicaoyuan'] || [];
  const s = sessions.find(x => x.id === _activeSessionId);
  if (!s) return;
  const name = await showPrompt('请输入新名称：', s.name);
  if (name && name.trim() && name !== s.name) {
    renameSession(_activeSessionId, name.trim());
  }
}

async function deleteCurrentSession() {
  document.getElementById('aiChatSessionMenu').style.display = 'none';
  if (!_activeSessionId) return;
  if (await showConfirm('确定删除当前对话？此操作不可恢复。', '删除对话', '🗑️')) {
    deleteSession(_activeSessionId);
  }
}

// ------ 消息操作（清空/删除/编辑/复制）------
async function clearChatMessages() {
  const menu = document.getElementById('aiChatSessionMenu');
  if (menu) menu.style.display = 'none';
  if (!_activeSessionId) return;
  if (!(await showConfirm('确定清空当前对话的所有消息吗？', '清空对话', '🗑️'))) return;
  const container = document.getElementById('aiChatMessages');
  if (container) container.innerHTML = '';
  _messageCache[_activeSessionId] = [];
  try {
    await fetch('http://localhost:3010/api/chat/sessions/' + encodeURIComponent(_activeSessionId) + '/messages', { method: 'DELETE' });
  } catch (e) { console.warn('[chat] 清空失败:', e); }
  appendChatMessage('ai-message-system', '🗑️ 当前对话已清空', true, null);
}

async function deleteChatMessage(btn) {
  const msgEl = btn?.closest('.ai-message');
  if (!msgEl) return;
  const msgId = msgEl.getAttribute('data-msg-id');
  if (!msgId) { msgEl.remove(); return; }
  if (!(await showConfirm('确定删除这条消息吗？', '删除消息', '🗑️'))) return;
  if (_messageCache[_activeSessionId]) {
    _messageCache[_activeSessionId] = _messageCache[_activeSessionId].filter(m => m.id !== msgId);
  }
  msgEl.remove();
  try {
    await fetch('http://localhost:3010/api/chat/messages/' + encodeURIComponent(msgId), { method: 'DELETE' });
  } catch (e) { console.warn('[chat] 删除消息失败:', e); }
}

function editChatMessage(btn) {
  const msgEl = btn?.closest('.ai-message');
  if (!msgEl) return;
  const msgId = msgEl.getAttribute('data-msg-id');
  const msgContent = msgEl.getAttribute('data-msg-content');
  if (!msgContent) return;
  const input = document.getElementById('aiChatInput');
  if (!input) return;
  input.value = msgContent;
  input.setAttribute('data-edit-msg', msgId || '');
  input.focus();
  const sendBtn = document.getElementById('aiChatSendBtn');
  if (sendBtn) sendBtn.textContent = '✏️';
}

function copyChatMessage(btn) {
  const msgEl = btn?.closest('.ai-message');
  if (!msgEl) return;
  const bubble = msgEl.querySelector('.ai-message-bubble');
  if (!bubble) return;
  // 克隆 bubble 排除操作按钮，避免把 📋✏️✕ 复制到剪贴板
  const clone = bubble.cloneNode(true);
  const actions = clone.querySelector('.ai-message-actions');
  if (actions) actions.remove();
  const text = clone.textContent || clone.innerText || '';
  if (!text.trim()) return;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text.trim()).catch(() => {});
  } else {
    const ta = document.createElement('textarea');
    ta.value = text.trim();
    ta.style.position = 'fixed'; ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch(e) {}
    document.body.removeChild(ta);
  }
}
// ------ 消息发送 ------
function toggleChat() {
  const w = document.getElementById('aiChatWidget');
  if (!w) return;
  const expanded = w.classList.contains('expanded');
  w.classList.toggle('expanded');
  if (!expanded) {
    // 展开状态
    const pid = typeof currentProjectId !== 'undefined' ? currentProjectId : 'baicaoyuan';
    setUnreadCount(pid, 0);
    updateChatBadge();
    // 加载会话
    loadSessions(pid).then(() => {
      populateSessionSelect(pid);
      if (!_activeSessionId || !_sessionsByProject[pid]?.some(s => s.id === _activeSessionId)) {
        const sessions = _sessionsByProject[pid] || [];
        if (sessions.length > 0) {
          switchSession(sessions[0].id);
        } else {
          createNewSession(pid, '默认对话');
        }
      }
    });
    setTimeout(() => { document.getElementById('aiChatInput')?.focus(); }, 400);
  }
}

async function sendChatMessage() {
  const input = document.getElementById('aiChatInput');
  let text = input?.value.trim();
  // 如果正在编辑消息，从 data-edit-msg 获取真正的内容
  const editMsgId = input?.getAttribute('data-edit-msg');
  if (editMsgId) {
    text = input?.value.trim();
    if (!text) return;
    input.removeAttribute('data-edit-msg');
    document.getElementById('aiChatSendBtn').textContent = '➤';
    // 删除旧消息
    const oldEl = document.querySelector(`.ai-message[data-msg-id="${editMsgId}"]`);
    if (oldEl) {
      const oldContent = oldEl.getAttribute('data-msg-content') || '';
      oldEl.remove();
      _messageCache[_activeSessionId] = (_messageCache[_activeSessionId] || []).filter(m => m.id !== editMsgId);
      fetch('http://localhost:3010/api/chat/messages/' + encodeURIComponent(editMsgId), { method: 'DELETE' }).catch(()=>{});
    }
  }
  if (!text || !_activeSessionId) return;
  input.value = '';
  document.getElementById('aiChatSendBtn').disabled = true;

  // 自然语言授权：用户说"确认/继续/执行/好/可以/是"时自动触发所有待授权卡片
  if (/^(确认|继续|执行|好的|可以|是|嗯|对|授权|同意|批准|好|行|干|做|来吧)/i.test(text)) {
    const cards = document.querySelectorAll('.ai-auth-btn-confirm:not(:disabled)');
    if (cards.length > 0) {
      appendChatMessage('user', text, false, null);
      if (!_messageCache[_activeSessionId]) _messageCache[_activeSessionId] = [];
      _messageCache[_activeSessionId].push({ id: null, role: 'user', content: text });
      saveMsgToDB(_activeSessionId, 'user', text);
      cards.forEach(btn => authorizeAction(btn));
      return;
    }
  }

  // 1. 保存并显示用户消息
  const savedId = await saveMsgToDB(_activeSessionId, 'user', text);
  if (!_messageCache[_activeSessionId]) _messageCache[_activeSessionId] = [];
  _messageCache[_activeSessionId].push({ id: savedId, role: 'user', content: text });
  appendChatMessage('user', text, false, savedId);

  showChatTyping();
  _callChatLLM(text);
}

async function saveMsgToDB(sessionId, role, content) {
  try {
    const res = await fetch('http://localhost:3010/api/chat/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, role, content })
    });
    const data = await res.json();
    return data.id || null;
  } catch (e) {
    console.warn('[chat] 保存消息失败:', e.message);
    return null;
  }
}

async function _callChatLLM(text) {
  const pid = typeof currentProjectId !== 'undefined' ? currentProjectId : 'baicaoyuan';
  const history = (_messageCache[_activeSessionId] || []).slice(-10).map(m => ({ role: m.role, content: m.content }));
  try {
    const res = await fetch('http://localhost:3010/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: text,
        history,
        projectId: pid,
        date: typeof M !== 'undefined' && M.TODAY ? M.TODAY : '',
        sessionId: _activeSessionId
      })
    });
    if (!res.ok) throw new Error('Network error');
    const data = await res.json();
    hideChatTyping();

    if (data.reply) {
      const savedId = await saveMsgToDB(_activeSessionId, 'assistant', data.reply);
      _messageCache[_activeSessionId].push({ id: savedId, role: 'assistant', content: data.reply });
      
      // === 流式加载特效 ===
      const container = document.getElementById('aiChatMessages');
      if (container) {
        const div = document.createElement('div');
        if (savedId) div.setAttribute('data-msg-id', savedId);
        div.setAttribute('data-msg-content', data.reply);
        div.className = 'ai-message ai-message-system';
        div.innerHTML = '<div class="ai-message-avatar"><img src="assets/avatar-construction-girl.png" style="width:100%;height:100%;border-radius:50%;object-fit:cover;"></div><div class="ai-message-bubble"></div>' +
          '<div class="ai-message-actions">' +
            '<button class="ai-message-action-btn" onclick="copyChatMessage(this)" title="复制">📋</button>' +
            '<button class="ai-message-action-btn ai-msg-del" onclick="deleteChatMessage(this)" title="删除">✕</button>' +
          '</div>';
        container.appendChild(div);
        
        const bubble = div.querySelector('.ai-message-bubble');
        const rendered = renderMarkdownInline(data.reply);
        _streamTextToBubble(bubble, rendered);
      }
    }

    // 自动执行结果（安全操作）
    if (data.results && data.results.length > 0) {
      data.results.forEach(r => {
        appendChatMessage('system', (r.ok ? '✅ ' : '❌ ') + (r.message || r.error || '执行'), false, null);
      });
      // 预删除本地事件，避免 loadDataFromAPI 的 localOnlyEvents 把已删事件加回来
      // 即使删除失败（DB 中不存在，幽灵事件）也清理本地
      data.results.forEach(r => {
          if (r.action.type === 'deleteEvent' && r.action.data?.eventId) {
            const errNoRow = !r.ok && /未找到/.test(r.error || '');
            if (r.ok || errNoRow) {
              _ghostEventIds.add(r.action.data.eventId);
              _persistGhostIds();
              const idx = M.EVENTS.findIndex(e => e.id === r.action.data.eventId);
              if (idx >= 0) M.EVENTS.splice(idx, 1);
            }
        }
        if (r.action.type === 'batchDelete' && Array.isArray(r.data?.deletedIds) && r.data.deletedIds.length > 0) {
          r.data.deletedIds.forEach(id => _ghostEventIds.add(id));
          _persistGhostIds();
          const ids = new Set(r.data.deletedIds);
          for (let i = M.EVENTS.length - 1; i >= 0; i--) {
            if (ids.has(M.EVENTS[i].id)) M.EVENTS.splice(i, 1);
          }
        }
      });
      // 有成功执行或已清理幽灵事件就刷新
      const needRefresh = data.results.some(r => {
        if (r.ok) return true;
        if (r.action.type === 'deleteEvent' && /未找到/.test(r.error || '')) return true;
        if (r.action.type === 'batchDelete' && r.ok) return true;
        if (r.action.type === 'deleteEventsByQuery' && r.ok) return true;
        if (r.action.type === 'updatePlan' && r.ok) return true;
        if (r.action.type === 'updateIssue' && r.ok) return true;
        if (r.action.type === 'closeIssue' && r.ok) return true;
        return false;
      });
      if (needRefresh) {
        _refreshAfterChat(data.results.filter(r => r.ok || (r.action.type === 'deleteEvent' && /未找到/.test(r.error || '')) || (r.action.type === 'batchDelete' && r.ok) || (r.action.type === 'deleteEventsByQuery' && r.ok)).map(r => r.action.type));
      }
    } else if (data.actions && data.actions.length > 0) {
      data.actions.forEach(a => executeChatAction(a));
    }

    // 待授权操作（敏感操作）
    if (data.pendingActions && data.pendingActions.length > 0) {
      data.pendingActions.forEach(pa => {
        appendPendingActionCard(pa);
      });
    }
  } catch (e) {
    hideChatTyping();
    _mockChatReplyLocal(text);
  }
}

// 渲染待授权操作卡片
function appendPendingActionCard(pa) {
  const container = document.getElementById('aiChatMessages');
  if (!container) return;
  const div = document.createElement('div');
  div.className = 'ai-message ai-message-system';
  div.innerHTML =
    '<div class="ai-message-avatar"><img src="assets/avatar-construction-girl.png" style="width:100%;height:100%;border-radius:50%;object-fit:cover;"></div>' +
    '<div class="ai-message-bubble" style="border:1px solid rgba(245,158,11,0.3);background:rgba(245,158,11,0.06);">' +
    '  <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;color:#fbbf24;font-weight:600;font-size:13px;">🔒 需要授权</div>' +
    '  <div style="font-size:13px;color:#e2e8f0;margin-bottom:8px;">' + _escapeHtml(pa.summary || '操作') + '</div>' +
    '  <div style="display:flex;gap:6px;">' +
    '    <button class="ai-auth-btn ai-auth-btn-confirm" data-paid="' + pa.id + '" onclick="authorizeAction(this)">✅ 授权执行</button>' +
    '    <button class="ai-auth-btn ai-auth-btn-cancel" data-paid="' + pa.id + '" onclick="rejectAction(this)">✕ 取消</button>' +
    '  </div>' +
    '</div>';
  container.appendChild(div);
  scrollChatToBottom();
}

// 授权执行
async function authorizeAction(btn) {
  const paid = btn?.getAttribute('data-paid');
  if (!paid) return;
  btn.disabled = true; btn.textContent = '⏳ 执行中...';
  try {
    const res = await fetch('http://localhost:3010/api/chat/authorize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pendingId: paid })
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    // 替换卡片为结果
    const card = btn.closest('.ai-message');
    if (card) {
      const msg = data.result?.message || '✅ 已执行';
      card.querySelector('.ai-message-bubble').innerHTML =
        '<div style="color:#4ade80;font-weight:600;font-size:13px;">✅ 已授权执行</div>' +
        '<div style="font-size:13px;color:#e2e8f0;margin-top:4px;">' + _escapeHtml(msg) + '</div>';
    }
    // 刷新数据
    // 直接从本地 M.EVENTS/M.ISSUES 同步，避免 loadDataFromAPI 的保护逻辑或时序问题
    const act = data.action || {};
    if (act.type === 'deleteEvent' && act.data?.eventId) {
      _ghostEventIds.add(act.data.eventId);
      _persistGhostIds();
      const filtered = (M.EVENTS || []).filter(e => e.id !== act.data.eventId);
      M.EVENTS.length = 0; M.EVENTS.push(...filtered);
      renderFilteredEvents(); renderStats(); updateCalendar(); renderDailyPlanCard();
      await _refreshAfterChat(['deleteEvent']);
    } else if (act.type === 'batchDelete') {
      // 收集要移除的 ID：先用原 action 的显式 ids，否则用后端返回的 deletedIds，否则用全部条件
      const idsToRemove = new Set();
      if (Array.isArray(act.data?.ids)) act.data.ids.forEach(id => idsToRemove.add(id));
      if (Array.isArray(data.result?.deletedIds)) data.result.deletedIds.forEach(id => idsToRemove.add(id));
      if (idsToRemove.size > 0) {
        idsToRemove.forEach(id => _ghostEventIds.add(id));
        _persistGhostIds();
        const filtered = (M.EVENTS || []).filter(e => !idsToRemove.has(e.id));
        M.EVENTS.length = 0; M.EVENTS.push(...filtered);
        renderFilteredEvents(); renderStats(); updateCalendar(); renderDailyPlanCard();
      }
      await _refreshAfterChat(['batchDelete']);
    } else if ((act.type === 'deleteIssue' || act.type === 'closeIssue') && act.data?.issueId) {
      M.ISSUES = (M.ISSUES || []).filter(i => i.id !== act.data.issueId);
      renderIssues();
      await _refreshAfterChat([act.type]);
    } else if (act.type === 'updateEvent' && act.data?.eventId) {
      const ev = (M.EVENTS || []).find(e => e.id === act.data.eventId);
      if (ev) {
        if (act.data.taskName) ev.payload.taskName = act.data.taskName;
        if (act.data.owner) ev.payload.owner = act.data.owner;
        if (act.data.progress) ev.payload.progress = act.data.progress;
        if (act.data.headcount) ev.payload.headcount = act.data.headcount;
        if (act.data.note) ev.payload.description = act.data.note;
        if (act.data.type) ev.type = act.data.type;
        if (act.data.status) ev.status = act.data.status;
      }
      await _refreshAfterChat([act.type]);
    } else {
      await _refreshAfterChat([act.type || 'updateEvent']);
    }
  } catch (e) {
    const card = btn.closest('.ai-message');
    if (card) {
      const bubble = card.querySelector('.ai-message-bubble');
      if (bubble) bubble.innerHTML += '<div style="color:#ef4444;font-size:12px;margin-top:4px;">❌ 授权失败: ' + _escapeHtml(e.message) + '</div>';
    }
    btn.disabled = false; btn.textContent = '✅ 重试';
  }
}

// 取消
async function rejectAction(btn) {
  const paid = btn?.getAttribute('data-paid');
  if (!paid) return;
  try {
    await fetch('http://localhost:3010/api/chat/reject', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pendingId: paid })
    });
  } catch {}
  const card = btn.closest('.ai-message');
  if (card) {
    card.querySelector('.ai-message-bubble').innerHTML =
      '<div style="color:#94a3b8;font-size:13px;">⏭️ 已取消</div>';
  }
}

// 离线 mock 回复 — 不模拟任何操作，仅提示连接失败
async function _mockChatReplyLocal(text) {
  const reply = '⚠️ 无法连接后端服务，请确认后端已启动（http://localhost:3010）。LLM 功能暂不可用。';
  const savedId = await saveMsgToDB(_activeSessionId, 'assistant', reply);
  if (!_messageCache[_activeSessionId]) _messageCache[_activeSessionId] = [];
  _messageCache[_activeSessionId].push({ id: savedId, role: 'assistant', content: reply });
  appendChatMessage('system', reply, false, savedId);
}

// ------ 生命周期 ------
(function initChatSystem() {
  const pid = typeof currentProjectId !== 'undefined' ? currentProjectId : 'baicaoyuan';
  initChatWebSocket();
  updateChatProjectLabel();
  // 预加载会话
  loadSessions(pid);
})();

function getCurrentProjectName() {
  try {
    const proj = M.PROJECTS.find(p => p.id === currentProjectId);
    return proj ? proj.name : currentProjectId;
  } catch { return currentProjectId || '未知项目'; }
}

function updateChatProjectLabel() {
  const el = document.getElementById('aiChatProjectLabel');
  if (el) el.textContent = getCurrentProjectName();
}

async function triggerInspection() {
  try {
    appendChatMessage('ai-proactive', '🔔 正在巡检...');
    const res = await fetch('http://localhost:3010/api/chat/inspect', { method: 'POST' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    appendChatMessage('ai-proactive', '✅ 巡检完成，结果已通过徽章通知');
  } catch (e) {
    appendChatMessage('ai-proactive', '❌ 巡检失败: ' + e.message);
  }
}

// ------ 浮窗拖拽（不变）------
(function initChatDrag() {
  const widget = document.getElementById('aiChatWidget');
  const btn = document.getElementById('aiChatBtn');
  if (!widget || !btn) return;
  let startX, startY, startRight, startBottom, moved = false, dragging = false;
  const DRAG_THRESHOLD = 5;
  function getXY(e) { return e.touches ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : { x: e.clientX, y: e.clientY }; }
  function onStart(e) {
    const p = getXY(e); startX = p.x; startY = p.y;
    const rect = widget.getBoundingClientRect();
    startRight = window.innerWidth - rect.right; startBottom = window.innerHeight - rect.bottom;
    moved = false; dragging = false;
  }
  function onMove(e) {
    if (startX == null) return;
    const p = getXY(e); const dx = p.x - startX, dy = p.y - startY;
    if (!moved && Math.hypot(dx, dy) > DRAG_THRESHOLD) {
      moved = true; dragging = true;
      widget.classList.add('dragging');
      widget.style.transition = 'none';
      const rect = widget.getBoundingClientRect();
      widget.style.left = rect.left + 'px'; widget.style.top = rect.top + 'px';
      widget.style.right = 'auto'; widget.style.bottom = 'auto';
    }
    if (moved) {
      e.preventDefault();
      widget.style.left = (parseFloat(widget.style.left) + dx) + 'px';
      widget.style.top = (parseFloat(widget.style.top) + dy) + 'px';
      startX = p.x; startY = p.y;
    }
  }
  function onEnd() {
    if (dragging) {
      widget.classList.remove('dragging');
      widget.style.transition = '';
      const rect = widget.getBoundingClientRect();
      const snapRight = window.innerWidth - rect.right < rect.left;
      if (snapRight) { widget.style.left = 'auto'; widget.style.right = '24px'; widget.style.top = rect.top + 'px'; }
      else { widget.style.right = 'auto'; widget.style.left = '24px'; widget.style.top = rect.top + 'px'; }
      const r2 = widget.getBoundingClientRect();
      if (r2.top < 0) widget.style.top = '8px';
      if (r2.bottom > window.innerHeight) widget.style.top = (window.innerHeight - r2.height - 8) + 'px';
      setTimeout(() => { dragging = false; }, 50);
    }
    startX = startY = null;
  }
  btn.addEventListener('mousedown', onStart);
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onEnd);
  btn.addEventListener('touchstart', onStart, { passive: true });
  document.addEventListener('touchmove', onMove, { passive: false });
  document.addEventListener('touchend', onEnd);
  btn.addEventListener('click', function(e) { if (moved) { e.stopPropagation(); e.preventDefault(); moved = false; } }, true);
})();

// 面板拖拽
(function initPanelDrag() {
  const panel = document.getElementById('aiChatPanel');
  if (!panel) return;
  const header = panel.querySelector('.ai-chat-header');
  if (!header) return;
  let startX, startY, startLeft, startTop, moved = false;
  const DRAG_THRESHOLD = 5;
  function getXY(e) { return e.touches ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : { x: e.clientX, y: e.clientY }; }
  function onStart(e) {
    if (e.target.closest('.ai-chat-close')) return;
    const p = getXY(e); startX = p.x; startY = p.y;
    const rect = panel.getBoundingClientRect();
    panel.style.left = rect.left + 'px'; panel.style.top = rect.top + 'px';
    panel.style.right = 'auto'; panel.style.bottom = 'auto';
    startLeft = rect.left; startTop = rect.top; moved = false;
  }
  function onMove(e) {
    if (startX == null) return;
    const p = getXY(e); const dx = p.x - startX, dy = p.y - startY;
    if (!moved && Math.hypot(dx, dy) > DRAG_THRESHOLD) { moved = true; panel.classList.add('dragging'); }
    if (moved) {
      e.preventDefault();
      let newLeft = startLeft + dx, newTop = startTop + dy;
      const rect = panel.getBoundingClientRect();
      newLeft = Math.max(0, Math.min(window.innerWidth - rect.width, newLeft));
      newTop = Math.max(0, Math.min(window.innerHeight - rect.height, newTop));
      panel.style.left = newLeft + 'px'; panel.style.top = newTop + 'px';
    }
  }
  function onEnd() {
    if (moved) { panel.classList.remove('dragging'); setTimeout(() => { moved = false; }, 50); }
    startX = startY = null;
  }
  header.addEventListener('mousedown', onStart);
  document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onEnd);
  header.addEventListener('touchstart', onStart, { passive: true });
  document.addEventListener('touchmove', onMove, { passive: false }); document.addEventListener('touchend', onEnd);
  header.addEventListener('click', function(e) { if (moved) { e.stopPropagation(); e.preventDefault(); } }, true);
})();

// ------ 聊天消息刷新 ------
async function _refreshAfterChat(actionTypes) {
  const types = new Set(actionTypes);
  try {
    if (types.has('createEvent') || types.has('updateEvent') || types.has('deleteEvent') || types.has('batchDelete') || types.has('deleteEventsByQuery')) {
      if (typeof loadDataFromAPI === 'function') { 
        await loadDataFromAPI(); 
        if (typeof renderFilteredEvents === 'function') renderFilteredEvents(); 
        if (typeof renderStats === 'function') renderStats(); 
        if (typeof updateCalendar === 'function') updateCalendar(); 
        if (typeof renderDailyPlanCard === 'function') renderDailyPlanCard(); 
        // 确保数据同步到 localStorage
        try { localStorage.setItem('daily_events', JSON.stringify(M.EVENTS)); } catch(e) {}
      }
    }
    if (types.has('createIssue') || types.has('updateIssue') || types.has('closeIssue') || types.has('deleteIssue')) {
      if (typeof loadDataFromAPI === 'function') { 
        await loadDataFromAPI(); 
        if (typeof renderIssues === 'function') renderIssues(); 
        if (typeof renderDailyPlanCard === 'function') renderDailyPlanCard(); 
        // 确保数据同步到 localStorage
        try { localStorage.setItem('daily_issues', JSON.stringify(M.ISSUES || [])); } catch(e) {}
      }
    }
    if (types.has('createAttendance')) { 
      if (typeof loadDataFromAPI === 'function') await loadDataFromAPI(); 
    }
    if (types.has('createDrawing')) { 
      if (typeof loadDataFromAPI === 'function') await loadDataFromAPI(); 
    }
    if (types.has('updatePlan')) {
      if (typeof loadDataFromAPI === 'function') { 
        await loadDataFromAPI(); 
        if (typeof renderDailyPlanCard === 'function') renderDailyPlanCard(); 
        // 确保数据同步到 localStorage
        try { localStorage.setItem('daily_plans', JSON.stringify(M.PLANS)); } catch(e) {}
      }
    }
  } catch (e) { console.warn('[chat] 刷新数据失败:', e); }
}

// ------ Markdown 渲染 + 消息显示 ------
function appendChatMessage(role, content, skipCache, msgId) {
  const container = document.getElementById('aiChatMessages');
  if (!container) return;
  const div = document.createElement('div');
  if (msgId) div.setAttribute('data-msg-id', msgId);
  if (content) div.setAttribute('data-msg-content', content);
  const rendered = renderMarkdownInline(content);
  const actionsHtml = msgId ? '<div class="ai-message-actions">' +
    '<button class="ai-message-action-btn" onclick="copyChatMessage(this)" title="复制">📋</button>' +
    (role === 'user' ? '<button class="ai-message-action-btn" onclick="editChatMessage(this)" title="编辑">✏️</button>' : '') +
    '<button class="ai-message-action-btn ai-msg-del" onclick="deleteChatMessage(this)" title="删除">✕</button>' +
  '</div>' : '';
  if (role === 'user') {
    div.className = 'ai-message user';
    div.innerHTML = '<div class="ai-message-avatar">👤</div><div class="ai-message-bubble">' + rendered + actionsHtml + '</div>';
  } else if (role === 'ai-proactive') {
    div.className = 'ai-message ai-proactive';
    div.innerHTML = '<div class="ai-message-bubble" style="background:transparent;padding:0;">' + rendered + '</div>';
  } else {
    div.className = 'ai-message ai-message-system';
    div.innerHTML = '<div class="ai-message-avatar"><img src="assets/avatar-construction-girl.png" style="width:100%;height:100%;border-radius:50%;object-fit:cover;"></div><div class="ai-message-bubble">' + rendered + actionsHtml + '</div>';
  }
  container.appendChild(div);
  // 保险：元素入 DOM 后检查 <table> 前是否有 <br>，有则清理（防御外部修改）
  const bubble = div.querySelector('.ai-message-bubble');
  if (bubble && bubble.innerHTML.includes('<table')) {
    const before = bubble.innerHTML.substring(0, bubble.innerHTML.indexOf('<table'));
    if ((before.match(/<br>/g) || []).length > 0) {
      console.log('[br-guard] found ' + (before.match(/<br>/g) || []).length + ' br before table, cleaning');
      bubble.innerHTML = bubble.innerHTML.replace(/(?:<br\s*\/?>\s*)+(?=<table)/gi, '');
    }
  }
  scrollChatToBottom();
  // 渲染 mermaid
  renderMermaidDiagrams();
}

// ===== AI 文字流式加载淡入渐变特效 =====
// 将 HTML 文本按可见字符拆分，每个字符带延迟动画，HTML 标签原样保留
// 特殊处理：表格 <table>...</table> 内的内容不做逐字动画，直接整体渲染
function _streamTextToBubble(bubbleEl, htmlText) {
  if (!bubbleEl || !htmlText) return Promise.resolve();
  
  // 如果包含表格，表格部分直接渲染，其余部分走流式
  const tableRegex = /(<table[\s\S]*?<\/table>)/g;
  const hasTable = tableRegex.test(htmlText);
  
  if (hasTable) {
    // 有表格：先流式渲染非表格部分，然后一次性插入表格
    const parts = htmlText.split(tableRegex);
    // parts[0] = 表前文本, parts[1] = 表1, parts[2] = 表间文本, ...
    const tableParts = [];
    const nonTableParts = [];
    
    for (let i = 0; i < parts.length; i++) {
      if (parts[i].startsWith('<table')) {
        tableParts.push({ index: i, html: parts[i] });
      } else {
        nonTableParts.push({ index: i, html: parts[i] });
      }
    }
    
    // 先流式渲染所有非表格部分
    const nonTableHtml = nonTableParts.map(p => p.html).join('');
    
    if (nonTableHtml.trim()) {
      _streamPlainHtml(bubbleEl, nonTableHtml);
    }
    
    // 表格直接插入（不做逐字动画）
    const frag = document.createDocumentFragment();
    tableParts.forEach(tp => {
      const span = document.createElement('span');
      span.innerHTML = tp.html;
      span.style.animation = 'none';
      span.style.opacity = '1';
      frag.appendChild(span);
    });
    bubbleEl.appendChild(frag);
    
    scrollChatToBottom();
    bubbleEl.classList.add('ai-bubble-done');
    return Promise.resolve();
  }
  
  // 无表格：走正常流式动画
  _streamPlainHtml(bubbleEl, htmlText);
}

// 纯 HTML 流式展开（不含表格），HTML 标签原样保留，文本逐字动画
function _streamPlainHtml(bubbleEl, htmlText) {
  if (!bubbleEl || !htmlText) return;
  
  // 解析 HTML：拆分为 tag 和 text 两部分
  const tokens = [];
  let i = 0;
  while (i < htmlText.length) {
    if (htmlText[i] === '<') {
      // HTML 标签
      const end = htmlText.indexOf('>', i);
      if (end !== -1) {
        tokens.push({ type: 'tag', html: htmlText.substring(i, end + 1) });
        i = end + 1;
        continue;
      }
    }
    // 普通文本字符（可能是转义实体如 &lt; &gt; &amp; 等）
    tokens.push({ type: 'text', char: htmlText[i] });
    i++;
  }
  
  const totalTokens = tokens.length;
  const baseDelay = 10; // ms per token
  const maxDelay = 28;  // cap delay
  
  bubbleEl.classList.add('ai-bubble-stream', 'streaming');
  
  // 插入光标
  const cursor = document.createElement('span');
  cursor.className = 'ai-typing-cursor';
  bubbleEl.appendChild(cursor);
  
  let resolved = 0;
  
  tokens.forEach((token, idx) => {
    const delay = Math.min(baseDelay * idx, maxDelay * Math.floor(idx / 5));
    
    setTimeout(() => {
      if (token.type === 'tag') {
        // HTML 标签立即插入，不做动画
        const span = document.createElement('span');
        span.innerHTML = token.html;
        span.style.animation = 'none';
        span.style.opacity = '1';
        bubbleEl.insertBefore(span, cursor);
      } else {
        // 文本字符带淡入动画
        const span = document.createElement('span');
        span.className = 'ai-char-span' + (token.char === ' ' ? ' space' : '');
        span.textContent = token.char;
        span.style.setProperty('--delay', delay + 'ms');
        bubbleEl.insertBefore(span, cursor);
        
        resolved++;
        if (resolved >= totalTokens) {
          // 全部完成
          setTimeout(() => {
            if (cursor.parentNode) cursor.remove();
            bubbleEl.classList.remove('streaming');
            bubbleEl.classList.add('ai-bubble-done');
          }, 200);
        }
      }
      
      // 自动滚动到底部
      scrollChatToBottom();
    }, delay);
  });
  
  // 安全超时兜底
  const safeTimeout = Math.max(totalTokens * maxDelay + 500, 2000);
  setTimeout(() => {
    if (cursor.parentNode) cursor.remove();
    bubbleEl.classList.remove('streaming');
    bubbleEl.classList.add('ai-bubble-done');
  }, safeTimeout);
}

// 直接渲染（无特效），用于非 AI 消息或回退
function _renderStaticBubble(bubbleEl, text) {
  if (!bubbleEl) return;
  bubbleEl.innerHTML = _escapeHtml(text);
}

function renderMarkdownInline(text) {
  if (!text) return '';
  console.log('[br-input] text length:', text.length, 'has|:', text.includes('|'), 'newlines:', (text.match(/\n/g)||[]).length, 'sample:', JSON.stringify(text.slice(0,100)));
  let html = _escapeHtml(text);

  // 1. 提取代码块 / mermaid
  const codeBlocks = [];
  const mermaidBlocks = [];
  html = html.replace(/```mermaid\n([\s\S]*?)```/g, function(_, code) {
    const idx = mermaidBlocks.length;
    mermaidBlocks.push(code.trim());
    return '%%MERMAID_' + idx + '%%';
  });
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, function(_, lang, code) {
    const idx = codeBlocks.length;
    codeBlocks.push({ lang, code: code.trim() });
    return '%%CODEBLOCK_' + idx + '%%';
  });

  // 2. 逐行处理 block 元素
  const lines = html.split('\n');
  const out = [];
  let inTable = false;
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    const isTableRow = /^\|.+\|$/.test(line);

    // 关闭 table
    if (inTable && !isTableRow) {
      out[out.length - 1] += '</tbody></table>';
      inTable = false;
    }

    // 标题
    const hm = line.match(/^(#{1,4})\s+(.+)/);
    if (hm) {
      const sizes = { 1: '15px', 2: '14px', 3: '13px', 4: '12px' };
      line = '<div style="font-size:' + (sizes[hm[1].length] || '13px') + ';font-weight:700;color:#f1f5f9;margin:10px 0 4px 0;">' + hm[2] + '</div>';
    }
    // 表格行
    else if (isTableRow) {
      if (/^\|[\s\-:]+\|$/.test(line)) continue; // 分隔行跳过
      // 空行（全是 | | | ）→ 跳过
      const rawCells = line.split('|').filter(c => c.trim() !== '');
      if (rawCells.length === 0) continue;
      if (!inTable) {
        line = '<table style="width:100%;border-collapse:collapse;margin:6px 0;font-size:12px;"><tbody>';
        inTable = true;
      } else {
        line = '';
      }
      // 直接使用 rawCells，不要用 line.split('|')（line 可能被清空）
      line += '<tr>' + rawCells.map(c => '<td style="border:1px solid rgba(255,255,255,0.1);padding:4px 8px;text-align:left;">' + c.trim() + '</td>').join('') + '</tr>';
    }
    // 分割线
    else if (/^---+$/.test(line)) {
      line = '<hr style="border:none;border-top:1px solid rgba(255,255,255,0.1);margin:8px 0;">';
    }
    // 无序列表
    else if (/^[-*]\s+(.+)/.test(line)) {
      line = '<li style="margin:2px 0 2px 16px;">' + line.replace(/^[-*]\s+/, '') + '</li>';
    }
    out.push(line);
  }
  if (inTable) out[out.length - 1] += '</tbody></table>';
  html = out.join('\n');

  // 3. 行内（先于代码块恢复，避免格式化代码内容）
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  // 图片 ![alt](url) — 如果 LLM 违规发送，自动移除
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '');
  // 链接 [text](url)
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

  // 4. 恢复代码块
  html = html.replace(/%%CODEBLOCK_(\d+)%%/g, function(_, idx) {
    const b = codeBlocks[parseInt(idx)];
    return '<pre><code class="language-' + _escapeHtml(b.lang) + '">' + b.code + '</code></pre>';
  });
  html = html.replace(/%%MERMAID_(\d+)%%/g, function(_, idx) {
    return '<div class="mermaid">' + mermaidBlocks[parseInt(idx)] + '</div>';
  });

  // 5. 换行，再去除块级元素旁的冗余 <br>
  html = html.replace(/\n/g, '<br>');
  html = html.replace(/<\/div>\s*<br>/g, '</div>');
  html = html.replace(/<\/li>\s*<br>/g, '</li>');
  html = html.replace(/<\/table>\s*<br>/g, '</table>');
  html = html.replace(/<br>\s*<li /g, '<li ');
  html = html.replace(/<br>\s*<div /g, '<div ');
  html = html.replace(/<br>\s*<hr /g, '<hr ');
  html = html.replace(/(?:<br>\s*)+<table/g, function(m) {
    console.log('[br-regex] matched ' + (m.match(/<br>/g)||[]).length + ' br: ' + JSON.stringify(m.slice(-30)));
    return '<table';
  });
  html = html.replace(/(<br\s*\/?>\s*){2,}/g, '<br>');

  // 6. 清理空表格和坏图片
  // 只删真正空的（没有 tr 子元素的）
  html = html.replace(/<table[^>]*>\s*<\/table>/g, '');
  // 清理空 img（alt 和 src 都为空）
  html = html.replace(/<img[^>]*alt=["\s]*["\s][^>]*src=["\s]*["\s][^>]*\/?>/gi, '');

  return html;
}

function renderMermaidDiagrams() {
  if (typeof mermaid === 'undefined') return;
  document.querySelectorAll('.mermaid:not([data-processed])').forEach(el => {
    el.setAttribute('data-processed', '1');
    try {
      mermaid.parse(el.textContent);
      mermaid.init(undefined, el);
    } catch (e) {
      console.warn('[mermaid] 渲染失败:', e);
      el.innerHTML = '<pre style="color:#f59e0b;font-size:12px;">⚠️ 流程图渲染失败: ' + _escapeHtml(e.message || '') + '</pre>';
    }
  });
}

// ------ 辅助函数 ------
function showChatTyping() {
  const container = document.getElementById('aiChatMessages');
  if (!container) return;
  const existing = document.getElementById('aiChatTyping');
  if (existing) return;
  const div = document.createElement('div');
  div.id = 'aiChatTyping'; div.className = 'ai-typing';
  div.innerHTML = '<div class="ai-typing-dot"></div><div class="ai-typing-dot"></div><div class="ai-typing-dot"></div>';
  container.appendChild(div);
  scrollChatToBottom();
}

function hideChatTyping() {
  const el = document.getElementById('aiChatTyping');
  if (el) el.remove();
  document.getElementById('aiChatSendBtn').disabled = false;
}

function scrollChatToBottom() {
  const container = document.getElementById('aiChatMessages');
  if (container) container.scrollTop = container.scrollHeight;
}

function quickChatAction(text) {
  const input = document.getElementById('aiChatInput');
  if (input) { input.value = text; if (!_activeSessionId) { const pid = typeof currentProjectId !== 'undefined' ? currentProjectId : 'baicaoyuan'; createNewSession(pid, '快捷对话'); } sendChatMessage(); }
}

function executeChatAction(action) {
  if (!action || !action.type) return;
  switch (action.type) {
    case 'openWeeklyReport': if (typeof openWeeklyReport === 'function') { closeModal('modalWeeklyMapping'); openWeeklyReport(); } break;
    case 'createIssue':
      if (action.data && typeof saveIssue === 'function') {
        const titleEl = document.getElementById('i-title');
        const proposeEl = document.getElementById('i-propose');
        const cooperateEl = document.getElementById('i-cooperate');
        if (titleEl) titleEl.value = action.data.title || '';
        if (proposeEl) proposeEl.value = action.data.proposeDept || '';
        if (cooperateEl) cooperateEl.value = action.data.cooperateDept || '';
        saveIssue();
      }
      break;
    case 'createEvent': if (action.data) createEventFromChat(action.data); break;
  }
}

function createEventFromChat(data) {
  if (typeof M === 'undefined' || !M.EVENTS) return;
  const projectId = typeof currentProjectId !== 'undefined' ? currentProjectId : 'baicaoyuan';
  const today = M.TODAY || new Date().toISOString().slice(0, 10);
  const ev = { id: 'E' + String(Date.now()).slice(-3), projectId, date: today, time: new Date().toTimeString().slice(0, 5), type: data.type || 'progress', areaId: data.areaId || null, planId: data.planId || undefined, payload: { taskName: data.taskName || '', owner: data.owner || '', progress: typeof data.progress === 'string' ? data.progress : (data.progress != null ? data.progress + '%' : ''), headcount: data.headcount || 0, description: data.note || '' }, submitter: '张明', source: 'chat', confidence: 0.9, status: 'draft', note: data.note || '' };
  M.EVENTS.unshift(ev);
  if (M.saveEventsToStorage) M.saveEventsToStorage();
  if (typeof renderFilteredEvents === 'function') renderFilteredEvents();
  if (typeof renderDailyPlanCard === 'function') renderDailyPlanCard();
  if (typeof renderStats === 'function') renderStats();
  if (typeof updateCalendar === 'function') updateCalendar();
  appendChatMessage('system', '✅ 日报事件已保存！\n' + (data.taskName ? '• 任务：' + data.taskName + '\n' : '') + (data.owner ? '• 负责人：' + data.owner + '\n' : '') + (data.progress ? '• 进度：' + data.progress + '\n' : '') + (data.headcount ? '• 人数：' + data.headcount + '人' : ''));
  // 同步到后端 DB（静默，不阻塞 UI）
  fetch('http://localhost:3010/api/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ev) }).catch(function(){});
}

async function handleChatPhoto(input) {
  const file = input?.files?.[0];
  if (!file) return;
  input.value = '';
  appendChatMessage('user', '📷 [上传照片中...]');
  showChatTyping();
  try {
    const reader = new FileReader();
    const base64 = await new Promise((resolve, reject) => { reader.onload = () => resolve(reader.result.split(',')[1]); reader.onerror = reject; reader.readAsDataURL(file); });
    const projectId = typeof currentProjectId !== 'undefined' ? currentProjectId : 'baicaoyuan';
    const areas = typeof M !== 'undefined' && M.AREAS ? M.AREAS[projectId] || [] : [];
    const plans = typeof M !== 'undefined' && M.PLANS ? M.PLANS[projectId] || [] : [];
    const res = await fetch('http://localhost:3010/api/parse-photo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64: base64, caption: '', projectId, areas, plans })
    });
    hideChatTyping();
    if (!res.ok) throw new Error('解析照片失败');
    const result = await res.json();
    const data = result || {};
    createEventFromChat({ type: data.type || 'progress', areaId: data.areaId || null, taskName: data.payload?.taskName || data.taskHint || '拍照记录', owner: data.payload?.owner || '', progress: data.payload?.progress || '', headcount: data.payload?.headcount || 0, note: data.caption || '' });
    appendChatMessage('system', '📸 照片已解析并保存为日报事件。');
  } catch (e) {
    hideChatTyping();
    appendChatMessage('system', '⚠️ 照片解析失败：' + e.message + '，已降级为普通记录。');
    createEventFromChat({ type: 'progress', taskName: file.name || '拍照记录', note: '照片上传记录' });
  }
}

let _chatRecognition = null;
let _chatRecogRunning = false;
function toggleChatVoice() {
  const btn = document.getElementById('aiChatVoiceBtn');
  if (!btn) return;
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { appendChatMessage('system', '⚠️ 当前浏览器不支持语音识别，请使用 Chrome。'); return; }
  if (_chatRecogRunning) {
    if (_chatRecognition) { _chatRecognition.abort(); _chatRecognition = null; }
    _chatRecogRunning = false; btn.classList.remove('recording'); btn.textContent = '🎤'; return;
  }
  _chatRecognition = new SR();
  _chatRecognition.lang = 'zh-CN';
  _chatRecognition.continuous = false;
  _chatRecognition.interimResults = true;
  _chatRecognition.onresult = function(e) {
    const input = document.getElementById('aiChatInput');
    if (input) input.value = e.results[e.results.length - 1][0].transcript;
  };
  _chatRecognition.onend = function() {
    _chatRecogRunning = false; btn.classList.remove('recording'); btn.textContent = '🎤';
    const input = document.getElementById('aiChatInput');
    if (input && input.value.trim()) { if (!_activeSessionId) { const pid = typeof currentProjectId !== 'undefined' ? currentProjectId : 'baicaoyuan'; createNewSession(pid, '语音对话'); } sendChatMessage(); }
  };
  _chatRecognition.onerror = function(e) {
    _chatRecogRunning = false; btn.classList.remove('recording'); btn.textContent = '🎤';
    if (e.error !== 'aborted') appendChatMessage('system', '⚠️ 语音识别出错：' + e.error);
  };
  _chatRecogRunning = true; btn.classList.add('recording'); btn.textContent = '⏺';
  _chatRecognition.start();
}

function _escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

// ============== 系统设置 ==============
let _settingsCache = { llm_permission: { level: 'confirm' }, inspection_times: { times: ['08:30', '13:00', '17:30'], interval: 60 } };

async function loadSettings() {
  try {
    const res = await fetch('http://localhost:3010/api/settings');
    if (res.ok) _settingsCache = await res.json();
  } catch {}
  return _settingsCache;
}

function openSettings() {
  loadSettings().then(s => {
    _settingsCache = s;
    const perm = s.llm_permission?.level || 'confirm';
    document.querySelectorAll('input[name="llmPermission"]').forEach(el => { el.checked = el.value === perm; });
    renderInspectionTimes(s.inspection_times?.times || ['08:30', '13:00', '17:30']);
    const intervalSel = document.getElementById('inspectionInterval');
    if (intervalSel) intervalSel.value = String(s.inspection_times?.interval || 60);
    showModal('modalSettings');
  });
}

function renderInspectionTimes(times) {
  const list = document.getElementById('inspectionTimesList');
  if (!list) return;
  list.innerHTML = times.map((t, i) =>
    '<span class="settings-time-chip">' + t +
    '<span class="remove" onclick="removeInspectionTime(' + i + ')">✕</span></span>'
  ).join('');
  list._times = times;
}

function removeInspectionTime(idx) {
  const list = document.getElementById('inspectionTimesList');
  if (!list || !list._times) return;
  list._times.splice(idx, 1);
  renderInspectionTimes(list._times);
}

function addInspectionTime() {
  const list = document.getElementById('inspectionTimesList');
  if (!list || !list._times) return;
  const now = new Date();
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  list._times.push(h + ':' + m);
  list._times.sort();
  renderInspectionTimes(list._times);
}

function onPermissionChange() {}
function onInspectionChange() {}
let _audioCtx = null;
async function _ensureAudioCtx() {
  if (!_audioCtx) {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    _audioCtx = new Ctor();
  }
  if (_audioCtx.state === 'suspended') await _audioCtx.resume();
  return _audioCtx;
}
document.addEventListener('click', () => { if (!_audioCtx) { const Ctor = window.AudioContext || window.webkitAudioContext; if (Ctor) _audioCtx = new Ctor(); } }, { once: true });

async function saveSettings() {
  const permEl = document.querySelector('input[name="llmPermission"]:checked');
  const permLevel = permEl?.value || 'confirm';
  const list = document.getElementById('inspectionTimesList');
  const interval = parseInt(document.getElementById('inspectionInterval')?.value || '60');
  const payload = {
    llm_permission: { level: permLevel },
    inspection_times: { times: list?._times || ['08:30', '13:00', '17:30'], interval }
  };
  try {
    const res = await fetch('http://localhost:3010/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    await fetch('http://localhost:3010/api/settings/inspection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ times: list?._times || ['08:30', '13:00', '17:30'], interval })
    });
    _settingsCache = payload;
    showToast('设置已保存', 'success');
    closeModal('modalSettings');
  } catch (e) {
    showToast('保存失败: ' + e.message, 'error');
  }
}