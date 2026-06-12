// ============================================================
// 主应用逻辑
// ============================================================

let M = window.MockData;
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
document.addEventListener('DOMContentLoaded', () => {
  initCustomAreas();  // 先加载用户自定义区域
  initProject();
  initCalendarWithToday();
  renderProjectInfo();
  renderIssues();
  renderStats();
  populateAreaSelects();
  renderDailyPlanCard();
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
  
  document.getElementById('todayDateLabel').textContent = dateText;
  document.getElementById('weekInfo').textContent = weekText;
}

function openProjectSwitcher() {
  const html = M.PROJECTS.map(p => `
    <div style="padding:12px; border-bottom:1px solid #e2e8f0; cursor:pointer; transition:background 0.15s;" 
         onclick="switchProject('${p.id}')" 
         ${p.id === currentProjectId ? 'style="background:#f0f9ff; border-left:3px solid #00adef;"' : ''}>
      <div style="font-weight:600; color:#0f172a;">${p.name}</div>
      <div style="font-size:12px; color:#64748b; margin-top:2px;">${p.client} · ${p.location}</div>
    </div>
  `).join('');
  document.getElementById('projectSwitcherBody').innerHTML = html;
  showModal('modalProject');
}

function switchProject(projectId) {
  currentProjectId = projectId;
  localStorage.setItem('current_project_id', projectId);
  closeModal('modalProject');
  initProject();
  renderProjectInfo();
  renderIssues();
  renderStats();
  populateAreaSelects();
  updateCalendar();
  renderFilteredEvents();
  renderDailyPlanCard();
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
            <button class="btn btn-sm btn-danger" onclick="event.stopPropagation(); deleteEvent('${event.id}')">
              删除
            </button>
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
  const merged = [];
  Object.values(planGroups).forEach(group => {
    group.sort((a, b) => a.time.localeCompare(b.time));
    const first = group[0]; const last = group[group.length - 1];
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
              <div style="display:flex; align-items:center; gap:6px; padding:4px 0;${i > 0 ? ' border-top:1px dashed #e2e8f0;' : ''};">
                <span style="font-size:10px; color:#94a3b8; min-width:40px;">${e.time}</span>
                <div style="flex:1;">
                  <span style="font-size:12px; font-weight:500;">${group.length > 1 ? '→ ' : ''}${e.payload.progress || '-'}</span>
                  ${e.payload.owner ? `<span style="font-size:10px; color:#64748b; margin-left:4px;">${e.payload.owner}</span>` : ''}
                </div>
                <span style="font-size:9px; padding:1px 4px; border-radius:3px; background:${e.status === 'draft' ? '#fef3c7' : '#d1fae5'}; color:${e.status === 'draft' ? '#92400e' : '#065f46'};">${e.status === 'draft' ? '草稿' : '已确认'}</span>
                <button class="btn btn-sm btn-ghost" onclick="event.stopPropagation(); confirmEvent('${e.id}')" style="font-size:9px; padding:1px 6px;">${e.status === 'draft' ? '✅ 确认' : '🔄 撤回'}</button>
                <button class="btn btn-sm btn-ghost" onclick="event.stopPropagation(); editEventDirect('${e.id}')" style="font-size:9px; padding:1px 6px;">✏️ 编辑</button>
                <button class="btn btn-sm btn-ghost" onclick="event.stopPropagation(); openEventDetail('${e.id}')" style="font-size:9px; padding:1px 6px;">查看详情</button>
                <button class="btn btn-sm btn-danger" onclick="event.stopPropagation(); deleteEvent('${e.id}')" style="font-size:9px; padding:1px 6px;">删除</button>
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
            <button class="btn btn-sm btn-ghost" onclick="event.stopPropagation(); editEventDirect('${item.id}')">
              ✏️ 编辑
            </button>
            <button class="btn btn-sm btn-ghost" onclick="event.stopPropagation(); openEventDetail('${item.id}')">
              查看详情
            </button>
            <button class="btn btn-sm btn-danger" onclick="event.stopPropagation(); deleteEvent('${item.id}')">
              删除
            </button>
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
    default:
      return JSON.stringify(payload);
  }
}

function renderPhotos(photos) {
  return `
    <div class="event-photo">
      ${photos.map(p => `<div class="photo-thumb">📷<div class="cap">${p.caption || '图片'}</div></div>`).join('')}
    </div>
  `;
}

function formatLaborStats(stats) {
  return Object.entries(stats).map(([type, count]) => `${type}: ${count}人`).join('，');
}

function getAreaName(areaId) {
  const areas = M.AREAS[currentProjectId] || [];
  return areas.find(a => a.id === areaId)?.name || areaId;
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
  document.getElementById('statProgress').textContent = events.filter(e => e.type === 'progress').length;
  document.getElementById('statMaterial').textContent = events.filter(e => e.type === 'material').length;
  document.getElementById('statSafety').textContent = events.filter(e => e.type === 'safety').length;
  document.getElementById('statCoordination').textContent = events.filter(e => e.type === 'coordination').length;
}

// ============================================================
// 项目信息
// ============================================================
function renderProjectInfo() {
  const project = M.PROJECTS.find(p => p.id === currentProjectId);
  const areas = M.AREAS[currentProjectId] || [];
  const milestones = M.MILESTONES[currentProjectId] || [];
  const completedMilestones = milestones.filter(m => m.status === 'completed').length;
  
  document.getElementById('projectInfoBody').innerHTML = `
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
// 事项台账
// ============================================================
function renderIssues() {
  const issues = M.ISSUES.filter(i => i.projectId === currentProjectId && i.status !== 'closed');
  document.getElementById('issueList').innerHTML = issues.length > 0 ? issues.map(issue => `
    <div class="issue-row" onclick="openIssueDetail('${issue.id}')">
      <div class="issue-priority" style="background:${M.PRIORITY_META[issue.priority].color}"></div>
      <div class="issue-info">
        <div class="issue-title">${issue.title}</div>
        <div class="issue-meta">${M.ISSUE_TYPE_META[issue.type].label} · ${getAreaName(issue.areaId)} · ${issue.owner}</div>
      </div>
      <div class="issue-status" style="background:${M.ISSUE_STATUS_META[issue.status].color}20; color:${M.ISSUE_STATUS_META[issue.status].color};">
        ${M.ISSUE_STATUS_META[issue.status].label}
      </div>
    </div>
  `).join('') : `<div style="text-align:center; padding:20px; color:#94a3b8;">暂无跟踪事项</div>`;
}

// ============================================================
// 事件操作
// ============================================================
function confirmAllPlanEvents(planId) {
  M.EVENTS.forEach(e => { if (e.planId === planId && e.status === 'draft') e.status = 'confirmed'; });
  if (M.saveEventsToStorage) M.saveEventsToStorage();
  renderFilteredEvents();
  renderStats();
  showToast('已全部确认', 'success');
}

function confirmEvent(eventId) {
  const event = M.EVENTS.find(e => e.id === eventId);
  if (event) {
    event.status = event.status === 'draft' ? 'confirmed' : 'draft';
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
  if (index > -1) {
    M.EVENTS.splice(index, 1);
    if (M.saveEventsToStorage) M.saveEventsToStorage();
    renderFilteredEvents();
    renderStats();
    if (typeof updateCalendar === 'function') updateCalendar();
    showToast('已删除事件', 'info');
  }
}

function openEventDetail(eventId) {
  const event = M.EVENTS.find(e => e.id === eventId);
  if (!event) return;
  
  selectedEventId = eventId;
  document.getElementById('eventDetailTitle').textContent = `${M.TYPE_META[event.type].icon} ${M.TYPE_META[event.type].label}详情`;
  document.getElementById('eventDetailBody').innerHTML = `
    <div style="display:grid; gap:12px;">
      <div class="form-row">
        <div>
          <div style="font-size:12px; color:#64748b;">时间</div>
          <div style="font-weight:500;">${event.date} ${event.time}</div>
        </div>
        <div>
          <div style="font-size:12px; color:#64748b;">区域</div>
          <div style="font-weight:500;">${getAreaName(event.areaId)}</div>
        </div>
      </div>
      <div class="form-row">
        <div>
          <div style="font-size:12px; color:#64748b;">来源</div>
          <div style="font-weight:500;">${M.SOURCE_META[event.source]?.label || '自动'}</div>
        </div>
        <div>
          <div style="font-size:12px; color:#64748b;">可信度</div>
          <div style="font-weight:500;">${(event.confidence * 100).toFixed(0)}%</div>
        </div>
      </div>
      <div>
        <div style="font-size:12px; color:#64748b;">内容</div>
        <div style="font-size:14px; line-height:1.6;">${renderEventContent(event)}</div>
      </div>
      ${event.voiceText ? `<div><div style="font-size:12px; color:#64748b;">语音原文</div><div style="font-size:13px; font-style:italic; color:#64748b; background:#f8fafc; padding:8px; border-radius:4px;">${event.voiceText}</div></div>` : ''}
      ${event.note ? `<div><div style="font-size:12px; color:#64748b;">备注</div><div style="font-size:13px;">${event.note}</div></div>` : ''}
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
  
  document.getElementById('edit-date').value = event.date;
  document.getElementById('edit-time').value = event.time;
  document.getElementById('edit-area').value = event.areaId;
  document.getElementById('edit-task').value = event.payload?.taskName || '';
  document.getElementById('edit-owner').value = event.payload?.owner || '';
  document.getElementById('edit-progress').value = event.payload?.progress || '';
  document.getElementById('edit-headcount').value = event.payload?.headcount || '';
  document.getElementById('edit-note').value = event.note || '';
  
  closeModal('modalEventDetail');
  showModal('modalEventEdit');
}

function saveEventEdit() {
  const event = M.EVENTS.find(e => e.id === selectedEventId);
  if (!event) return;
  
  const date = document.getElementById('edit-date').value;
  const time = document.getElementById('edit-time').value;
  const areaId = document.getElementById('edit-area').value;
  
  if (!date || !time || !areaId) {
    showToast('请填写必填字段', 'error');
    return;
  }
  
  event.date = date;
  event.time = time;
  event.areaId = areaId;
  event.payload = event.payload || {};
  event.payload.taskName = document.getElementById('edit-task').value;
  event.payload.owner = document.getElementById('edit-owner').value;
  event.payload.progress = fixProgress(document.getElementById('edit-progress').value);
  event.payload.headcount = parseInt(document.getElementById('edit-headcount').value) || 0;
  event.note = document.getElementById('edit-note').value;
  
  // 同步关联计划
  if (event.planId) {
    const plans = M.PLANS[currentProjectId] || [];
    const plan = plans.find(p => p.id === event.planId);
    if (plan) {
      if (event.payload.taskName) plan.taskName = event.payload.taskName;
      if (event.payload.progress) plan.progress = event.payload.progress;
    }
  }
  if (M.saveEventsToStorage) M.saveEventsToStorage();
  closeModal('modalEventEdit');
  renderDailyPlanCard();
  renderFilteredEvents();
  updateCalendar();
  renderStats();
  showToast('事件已更新', 'success');
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
  showToast('已全选本月所有日期', 'success');
}

function clearAllDates() {
  selectedDates = [];
  updateCalendar();
  updateHeaderDate();
  renderFilteredEvents();
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
  const today = M.TODAY;
  const todayPlans = (M.PLANS[currentProjectId] || []).filter(p => {
    if (p.status === 'cancelled') return false;
    if (p.startDate && p.endDate) return p.startDate <= today && p.endDate >= today;
    if (p.date) return p.date === today;
    return false;
  });

  if (!todayPlans || todayPlans.length === 0) {
    document.getElementById('dailyPlanCard').innerHTML = `
      <div style="text-align:center; padding:12px; color:#94a3b8;">
        <div style="font-size:24px; margin-bottom:4px;">📋</div>
        <div style="font-size:12px;">暂无今日计划</div>
      </div>
    `;
    return;
  }

  let html = '';

  todayPlans.forEach(plan => {
    if (planCardCollapsed[plan.id] === undefined) planCardCollapsed[plan.id] = true;
    const collapsed = planCardCollapsed[plan.id];
    const laborList = plan.laborRequirements || plan.laborSchedule || [];
    const totalWorkers = laborList.reduce((sum, l) => sum + (l.count || 0), 0);
    const typeMeta = M.TYPE_META[plan.type || plan.eventType] || { icon: '📋', label: '计划', color: '#64748b' };
    const displayProcess = plan.taskName || plan.process || plan.description || '施工计划';
    const location = [plan.buildingNo, plan.floorNo].filter(Boolean).join(' · ');
    const planEvents = M.EVENTS.filter(e => e.planId === plan.id);

    html += `
      <div style="background:#f8fafc; border-radius:6px; padding:10px; margin-bottom:8px; border-left:3px solid ${typeMeta.color};">
        <div style="display:flex; align-items:center; gap:6px; cursor:pointer; user-select:none;" onclick="togglePlanCard('${plan.id}')">
          <span style="font-size:10px; color:#94a3b8; transition:transform .2s;">${collapsed ? '▶' : '▼'}</span>
          <span style="font-size:12px; font-weight:600; color:#334155; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${typeMeta.icon} ${displayProcess}</span>
          ${location ? `<span style="font-size:10px; color:#64748b; white-space:nowrap;"> 🏗️ ${location}</span>` : ''}
          ${plan.progress ? `<span style="font-size:10px; color:#00adef; white-space:nowrap;"> 📊 ${plan.progress}</span>` : ''}
          <div style="flex:1;"></div>
          <span style="font-size:10px; padding:1px 6px; background:${typeMeta.color}; color:#fff; border-radius:4px; white-space:nowrap;">${plan.status === 'completed' ? '已完成' : '进行中'}</span>
        </div>
        
        ${!collapsed ? `
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
        
        ${planEvents.length > 0 ? `
          <div style="margin-top:6px; padding-top:6px; border-top:1px dashed #d1d5db;">
            <div style="font-size:10px; color:#94a3b8; margin-bottom:4px;">📋 今日填报（${planEvents.length}次）</div>
            ${planEvents.slice(-5).reverse().map(e => `
              <div style="display:flex; justify-content:space-between; font-size:11px; color:#475569; padding:2px 0;">
                <span style="color:#94a3b8;">${e.time || ''}</span>
                <span>${e.payload.progress ? '→ ' + e.payload.progress : ''}</span>
              </div>
            `).join('')}
          </div>
        ` : ''}
        
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
// 日计划表单
// ============================================================
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
  
  // 渲染区域选择
  renderAreaSelect('dp-area');
  
  // 初始化工种行
  document.getElementById('laborRows').innerHTML = `
    <div class="form-row labor-row">
      <div class="form-group">
        <label class="form-label">工种</label>
        <input class="form-input" type="text" id="labor-type-0" placeholder="如：木工、钢筋工">
      </div>
      <div class="form-group">
        <label class="form-label">人数</label>
        <input class="form-input" type="number" id="labor-count-0" value="0" min="0">
      </div>
      <button class="btn btn-danger btn-sm" onclick="removeLaborRow(0)" style="margin-top:24px;">✕</button>
    </div>
  `;
  
  showModal('modalDailyPlan');
}

function addLaborRow() {
  const html = `
    <div class="form-row labor-row">
      <div class="form-group">
        <label class="form-label">工种</label>
        <input class="form-input" type="text" id="labor-type-${laborRowCount}" placeholder="如：木工">
      </div>
      <div class="form-group">
        <label class="form-label">人数</label>
        <input class="form-input" type="number" id="labor-count-${laborRowCount}" value="0" min="0">
      </div>
      <button class="btn btn-danger btn-sm" onclick="removeLaborRow(${laborRowCount})" style="margin-top:24px;">✕</button>
    </div>
  `;
  document.getElementById('laborRows').innerHTML += html;
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
  
  const laborRequirements = [];
  document.querySelectorAll('.labor-row').forEach((row, index) => {
    const type = document.getElementById(`labor-type-${index}`)?.value;
    const count = parseInt(document.getElementById(`labor-count-${index}`)?.value) || 0;
    if (type && count > 0) {
      laborRequirements.push({ trade: type, count });
    }
  });
  
  if (!startDate || !endDate) {
    showToast('请选择日期范围', 'error');
    return;
  }
  if (!process) {
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
    laborRequirements,
    materials: materials ? materials.split('\n').filter(m => m.trim()) : [],
    machinery: machinery ? machinery.split('\n').filter(m => m.trim()) : [],
    safetyNotes,
    description
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
    if (M.saveEventsToStorage) M.saveEventsToStorage();
    renderFilteredEvents();
    showToast('日计划已更新', 'success');
  } else {
    plan.id = `PLAN${String(Date.now()).slice(-3)}`;
    plan.createdAt = new Date().toISOString();
    plan.updatedAt = plan.createdAt;
    M.PLANS[currentProjectId].unshift(plan);
    showToast('日计划已保存', 'success');
  }
  
  console.log('[日计划] 保存后长度:', M.PLANS[currentProjectId].length, '计划ID:', plan.id);
  
  localStorage.setItem('daily_plans', JSON.stringify(M.PLANS));
  
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
  
  const laborList = plan.laborRequirements || plan.laborSchedule || [];
  if (laborList.length > 0) {
    laborRowCount = laborList.length;
    document.getElementById('laborRows').innerHTML = laborList.map((l, i) => {
      const trade = l.trade || l.laborType;
      return `
        <div class="form-row labor-row">
          <div class="form-group">
            <label class="form-label">工种</label>
            <input class="form-input" type="text" id="labor-type-${i}" value="${trade || ''}" placeholder="如：木工">
          </div>
          <div class="form-group">
            <label class="form-label">人数</label>
            <input class="form-input" type="number" id="labor-count-${i}" value="${l.count || 0}" min="0">
          </div>
          <button class="btn btn-danger btn-sm" onclick="removeLaborRow(${i})" style="margin-top:24px;">✕</button>
        </div>
      `;
    }).join('');
  } else {
    document.getElementById('laborRows').innerHTML = `
      <div class="form-row labor-row">
        <div class="form-group">
          <label class="form-label">工种</label>
          <input class="form-input" type="text" id="labor-type-0" placeholder="如：木工、钢筋工">
        </div>
        <div class="form-group">
          <label class="form-label">人数</label>
          <input class="form-input" type="number" id="labor-count-0" value="0" min="0">
        </div>
        <button class="btn btn-danger btn-sm" onclick="removeLaborRow(0)" style="margin-top:24px;">✕</button>
      </div>
    `;
    laborRowCount = 1;
  }
  
  document.querySelector('#modalDailyPlan .modal-title').textContent = '✏️ 编辑日计划';
  document.querySelector('#modalDailyPlan .modal-footer .btn-primary').textContent = '更新计划';
  
  showModal('modalDailyPlan');
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
  // 手动录入
  if (document.getElementById('m-area')) {
    const cur = document.getElementById('m-area').value;
    const areas = getProjectAreas();
    const sel = document.getElementById('m-area');
    sel.innerHTML = '<option value="">请选择区域</option>' +
      areas.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
    sel.value = cur;
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
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const nowStr = `${String(today.getHours()).padStart(2, '0')}:${String(today.getMinutes()).padStart(2, '0')}`;

  const selectedDate = selectedDates.length > 0 ? selectedDates[0] : todayStr;
  document.getElementById('voiceDate').value = selectedDate;
  document.getElementById('voiceTime').value = nowStr;

  document.getElementById('voiceText').value = '';
  document.getElementById('voiceParsePreview').style.display = 'block';
  document.getElementById('voiceSaveBtn').disabled = false;
  document.getElementById('recordingBtn').classList.remove('recording');
  document.getElementById('recordingHint').textContent = '点击麦克风开始录音';
  document.getElementById('vp-area-hint').style.display = 'none';
  showModal('modalVoice');
  // 关键：填充区域选项
  renderAreaOptions('vp-area', '');
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

  const requestBody = {
    text: text,
    projectId: currentProjectId,
    areas: areasPayload
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
    // 降级到本地 mock
    const parsed = M.mockParseVoice(text, currentProjectId);
    applyVoiceParseResult(parsed);
    if (hint) hint.textContent = `⚙️ Mock 模式（LLM 离线）· ${e.message}`;
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
  document.getElementById('vp-area-hint').style.display = 'none';
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
// 拍照录入
// ============================================================
function openPhotoInput() {
  document.getElementById('photoPreviewArea').style.display = 'none';
  document.getElementById('photoUploadZone').style.display = 'block';
  document.getElementById('photoOptionsMenu').style.display = 'none';
  document.getElementById('photoSaveBtn').disabled = true;
  document.getElementById('photoFileInput').value = '';
  document.getElementById('photoCaptureInput').value = '';
  
  // 初始化日期和时间字段：优先使用选中日期，否则使用今天和当前时间
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const nowStr = `${String(today.getHours()).padStart(2, '0')}:${String(today.getMinutes()).padStart(2, '0')}`;
  const selectedDate = selectedDates.length > 0 ? selectedDates[0] : todayStr;
  document.getElementById('pp-date').value = selectedDate;
  document.getElementById('pp-time').value = nowStr;
  
  // 初始化区域选项
  renderAreaOptions('pp-area', '');
  
  showModal('modalPhoto');
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
  
  try {
    const response = await fetch(API_BASE + '/parse-photo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        caption: voiceText,
        projectId: currentProjectId,
        areas: getProjectAreas() || [],
        type: 'text_only'
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
    // 降级到 mock
    const parsed = M.mockParsePhoto(voiceText, M.AREAS[currentProjectId] || []);
    document.getElementById('pp-type').value = parsed.type || 'progress';
    document.getElementById('pp-area').value = parsed.areaId || '';
    document.getElementById('pp-task').value = parsed.taskHint || parsed.payload?.taskName || '';
    document.getElementById('pp-owner').value = parsed.payload?.owner || '';
    document.getElementById('pp-progress').value = parsed.payload?.progress || '';
    document.getElementById('pp-headcount').value = parsed.payload?.headcount || '';
    if (!document.getElementById('pp-caption').value) {
      document.getElementById('pp-caption').value = parsed.caption || voiceText;
    }
    document.getElementById('pp-confidence').textContent = `${(parsed.confidence * 100).toFixed(0)}%`;
    if (hint) hint.textContent = `⚙️ Mock 模式`;
    showToast('语音解析失败，使用模拟数据', 'warning');
    
    // 处理识别到的新区域
    if (parsed.areaName && !parsed.areaId) {
      showAreaConfirmDialog(parsed.areaName, 'pp-area');
    }
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

// Mock文本优化（本地降级）
function mockOptimizeText(text) {
  // 专业词汇替换
  const replacements = [
    // 施工术语优化
    [/(\d+)个?(\s+)?(人|名|位)/g, '$1人'],
    [/(\d+)%?(\s+)?(进度|完成|做了)/g, '进度$1%'],
    [/(\d+)层/g, '$1层楼'],
    [/(\d+)平米/g, '$1平方米'],
    [/(\d+)平方/g, '$1平方米'],
    [/(\d+)米/g, '$1米'],
    
    // 规范化表达
    [/搞|弄|做/g, '进行'],
    [/弄好|搞好|做好/g, '完成'],
    [/在搞|在弄|在做/g, '正在进行'],
    [/已经|已/g, '已'],
    [/今天|今日/g, '今日'],
    [/明天/g, '明日'],
    
    // 施工任务优化
    [/刷墙|刮腻子/g, '墙面涂刷'],
    [/贴砖/g, '瓷砖铺贴'],
    [/吊顶|天花板/g, '吊顶施工'],
    [/水电|管线/g, '水电安装'],
    [/油漆/g, '油漆施工'],
    [/木工/g, '木工作业'],
    [/钢筋|绑扎/g, '钢筋绑扎'],
    [/混凝土|浇筑/g, '混凝土浇筑'],
    [/防水/g, '防水施工'],
    [/保温/g, '保温施工'],
    
    // 状态描述优化
    [/差不多|大概|左右/g, '约'],
    [/很快|马上/g, '即将'],
    [/好了|完了/g, '完成'],
    [/没好|没完成/g, '未完成'],
    
    // 地点描述优化
    [/这边|那边/g, '该区域'],
    [/楼上|楼下/g, '楼上区域|楼下区域'],
    
    // 清理冗余词
    [/然后|然后呢|然后就/g, ''],
    [/那个|那个什么/g, ''],
    [/呃|嗯|啊/g, ''],
    [/吧|嘛|呢/g, ''],
    
    // 标点规范化
    [/。{2,}/g, '。'],
    [/，{2,}/g, '，'],
    [/！{2,}/g, '！'],
    [/\?{2,}/g, '？'],
  ];
  
  let result = text;
  for (const [pattern, replacement] of replacements) {
    result = result.replace(pattern, replacement);
  }
  
  // 添加专业术语
  if (!result.includes('施工') && !result.includes('作业') && !result.includes('安装')) {
    // 检查是否包含任务关键词
    const taskKeywords = ['墙面', '地面', '吊顶', '水电', '油漆', '木工', '钢筋', '混凝土', '防水', '保温', '瓷砖'];
    for (const kw of taskKeywords) {
      if (result.includes(kw)) {
        result = result.replace(kw, kw + '施工');
        break;
      }
    }
  }
  
  // 去除首尾空格和多余空格
  result = result.replace(/\s+/g, ' ').trim();
  
  return result;
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
    
    // 显示VLM可视化动画
    showVLMVisualization();
    
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
    // 降级到 mock
    const voiceText = document.getElementById('pp-voice-text').value.trim();
    const parsed = M.mockParsePhoto(voiceText, M.AREAS[currentProjectId] || []);
    document.getElementById('pp-type').value = parsed.type || 'progress';
    document.getElementById('pp-area').value = parsed.areaId || '';
    document.getElementById('pp-task').value = parsed.taskHint || parsed.payload?.taskName || '';
    document.getElementById('pp-owner').value = parsed.payload?.owner || '';
    document.getElementById('pp-progress').value = parsed.payload?.progress || '';
    document.getElementById('pp-headcount').value = parsed.payload?.headcount || '';
    document.getElementById('pp-caption').value = parsed.caption || '';
    document.getElementById('pp-confidence').textContent = `${(parsed.confidence * 100).toFixed(0)}%`;
    if (hint) hint.textContent = `⚙️ Mock 模式（LLM 不可用）`;
    
    // 处理识别到的新区域
    if (parsed.areaName && !parsed.areaId) {
      showAreaConfirmDialog(parsed.areaName, 'pp-area');
    }
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
    // 降级到 mock
    const parsed = M.mockParsePhoto();
    document.getElementById('pp-type').value = parsed.type || 'progress';
    document.getElementById('pp-area').value = parsed.areaId || '';
    document.getElementById('pp-task').value = parsed.taskHint || '';
    document.getElementById('pp-owner').value = '';
    document.getElementById('pp-progress').value = '';
    document.getElementById('pp-headcount').value = '';
    document.getElementById('pp-caption').value = parsed.caption || '';
    document.getElementById('pp-confidence').textContent = `${(parsed.confidence * 100).toFixed(0)}%`;
    if (hint) hint.textContent = `⚙️ Mock 模式`;
    showToast('重新识别失败，使用模拟数据', 'warning');
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
// 手动录入
// ============================================================
function openManualInput(planId) {
  // 设置默认日期和时间：优先选中日期，否则今天；时间为当前时间
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const nowStr = `${String(today.getHours()).padStart(2, '0')}:${String(today.getMinutes()).padStart(2, '0')}`;
  
  const defaultDate = selectedDates.length > 0 ? selectedDates[0] : todayStr;
  document.getElementById('m-date').value = defaultDate;
  document.getElementById('m-time').value = nowStr;
  
  // 渲染当天的计划列表
  renderPlanSelect(defaultDate);
  
  // 默认完成类型为计划内
  document.getElementById('m-completion-type').value = 'planned';
  
  renderManualForm();
  populateAreaSelects('m-area');
  
  if (planId) {
    document.getElementById('m-plan').value = planId;
    onPlanSelect(planId);
  }
  
  showModal('modalManual');
}

// 渲染计划选择列表
function renderPlanSelect(dateStr) {
  const projectPlans = M.PLANS[currentProjectId] || [];
  
  // 筛选出当天有效的计划
  const dayPlans = projectPlans.filter(p => {
    if (p.status === 'cancelled') return false;
    if (p.startDate && p.endDate) return p.startDate <= dateStr && p.endDate >= dateStr;
    if (p.date) return p.date === dateStr;
    return false;
  });
  
  let html = '<option value="">无（计划外工作）</option>';
  dayPlans.forEach(plan => {
    html += `<option value="${plan.id}">📋 ${plan.taskName || plan.process}${plan.buildingNo ? ' · ' + plan.buildingNo : ''}${plan.floorNo ? ' · ' + plan.floorNo : ''}</option>`;
  });
  
  document.getElementById('m-plan').innerHTML = html;
}

// 选择计划后自动填充数据
function onPlanSelect(planId) {
  if (!planId) {
    // 选择"无"，清空自动填充的数据，完成类型设为计划外
    document.getElementById('m-completion-type').value = 'unplanned';
    return;
  }
  
  // 找到对应的计划
  const projectPlans = M.PLANS[currentProjectId] || [];
  const plan = projectPlans.find(p => p.id === planId);
  
  if (plan) {
    // 先设置类型，动态表单渲染后才能填充进度/人数
    const planType = plan.type || plan.eventType;
    if (planType) {
      document.getElementById('m-type').value = planType;
      renderManualForm();
    }
    // 填充基础字段
    if (plan.buildingNo) document.getElementById('m-building-no').value = plan.buildingNo;
    if (plan.floorNo) document.getElementById('m-floor-no').value = plan.floorNo;
    if (plan.areaId || plan.area) document.getElementById('m-area').value = plan.areaId || plan.area;
    if (plan.owner) document.getElementById('m-owner').value = plan.owner;
    // 填充动态表单字段（需在 renderManualForm 之后）
    const taskName = plan.taskName || plan.process;
    if (taskName) document.getElementById('m-task').value = taskName;
    if (plan.progress) document.getElementById('m-progress').value = plan.progress;
    const laborList = plan.laborRequirements || plan.laborSchedule || [];
    const totalWorkers = laborList.reduce((sum, l) => sum + (l.count || 0), 0);
    if (totalWorkers > 0 && document.getElementById('m-headcount')) {
      document.getElementById('m-headcount').value = totalWorkers;
    }
    document.getElementById('m-completion-type').value = 'planned';
    showToast('已自动填充计划数据', 'success');
  }
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
            <label class="form-label">进度 <span class="req">*</span></label>
            <input class="form-input" type="text" id="m-progress" placeholder="如：80%">
          </div>
          <div class="form-group">
            <label class="form-label">负责人</label>
            <input class="form-input" type="text" id="m-owner" placeholder="如：张师傅">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">人数</label>
            <input class="form-input" type="number" id="m-headcount" value="0" min="0">
          </div>
          <div class="form-group">
            <label class="form-label">描述</label>
            <input class="form-input" type="text" id="m-caption" placeholder="描述信息">
          </div>
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
  }
  
  document.getElementById('manualDynamicForm').innerHTML = html;
}

function saveManualEvent() {
  const type = document.getElementById('m-type').value;
  const time = document.getElementById('m-time').value;
  const areaId = document.getElementById('m-area').value;
  const planId = document.getElementById('m-plan').value;
  const completionType = document.getElementById('m-completion-type').value;
  
  // 获取日期：优先使用表单中的日期，否则使用选中日期，最后使用今天
  const formDate = document.getElementById('m-date').value;
  const eventDate = formDate || (selectedDates.length > 0 ? selectedDates[0] : M.TODAY);
  
  // 获取新增字段
  const buildingNo = document.getElementById('m-building-no').value;
  const floorNo = document.getElementById('m-floor-no').value;
  const mainOwner = document.getElementById('m-owner').value;
  
  let payload = {};
  switch(type) {
    case 'progress':
      payload = {
        taskName: document.getElementById('m-task').value,
        owner: mainOwner || document.getElementById('m-owner-field').value,
        progress: fixProgress(document.getElementById('m-progress').value),
        headcount: parseInt(document.getElementById('m-headcount').value) || 0,
        description: document.getElementById('m-caption').value
      };
      break;
    case 'material':
      payload = {
        materialName: document.getElementById('m-material').value,
        spec: document.getElementById('m-spec').value,
        quantity: parseInt(document.getElementById('m-quantity').value) || 0,
        unit: document.getElementById('m-unit').value,
        action: document.getElementById('m-action').value
      };
      break;
    case 'safety':
      const issues = document.getElementById('m-issues').value.split(';').map(s => s.trim()).filter(Boolean);
      payload = {
        checkType: document.getElementById('m-checktype').value,
        result: document.getElementById('m-result').value,
        issues
      };
      break;
    case 'coordination':
      payload = {
        topic: document.getElementById('m-topic').value,
        parties: document.getElementById('m-parties').value.split(';').map(s => s.trim()).filter(Boolean),
        summary: document.getElementById('m-summary').value,
        status: '已协调'
      };
      break;
    case 'attendance':
      payload = {
        headcount: parseInt(document.getElementById('m-att-count').value) || 0,
        status: document.getElementById('m-att-status').value
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
    planId,
    completionType,
    buildingNo,
    floorNo,
    owner: mainOwner,
    payload,
    submitter: '张明',
    source: 'manual',
    confidence: 1.0,
    status: 'draft',
    note: document.getElementById('m-note').value
  };
  
  M.EVENTS.unshift(event);
  // 同步关联计划
  if (planId) {
    const plans = M.PLANS[currentProjectId] || [];
    const plan = plans.find(p => p.id === planId);
    if (plan) {
      if (payload.taskName) plan.taskName = payload.taskName;
      if (payload.progress) plan.progress = payload.progress;
    }
  }
  if (M.saveEventsToStorage) M.saveEventsToStorage();

  closeModal('modalManual');
  renderDailyPlanCard();
  renderFilteredEvents();
  renderStats();
  if (typeof updateCalendar === 'function') updateCalendar();
  showToast('事件已保存', 'success');
}

// ============================================================
// 事项台账表单
// ============================================================
function openIssueForm() {
  document.getElementById('i-title').value = '';
  document.getElementById('i-owner').value = '';
  document.getElementById('i-deadline').value = '';
  document.getElementById('i-description').value = '';
  showModal('modalIssue');
}

function saveIssue() {
  const issue = {
    id: `I${String(Date.now()).slice(-3)}`,
    projectId: currentProjectId,
    type: document.getElementById('i-type').value,
    priority: document.getElementById('i-priority').value,
    title: document.getElementById('i-title').value,
    areaId: document.getElementById('i-area').value,
    owner: document.getElementById('i-owner').value,
    deadline: document.getElementById('i-deadline').value,
    description: document.getElementById('i-description').value,
    status: 'open',
    createdDate: M.TODAY,
    resolution: '',
    photos: []
  };
  
  if (!issue.title || !issue.areaId || !issue.owner || !issue.deadline || !issue.description) {
    showToast('请填写必填字段', 'error');
    return;
  }
  
  M.ISSUES.unshift(issue);
  
  closeModal('modalIssue');
  renderIssues();
  showToast('事项已创建', 'success');
}

function openIssueDetail(issueId) {
  const issue = M.ISSUES.find(i => i.id === issueId);
  if (!issue) return;
  
  showToast(`查看事项: ${issue.title}`, 'info');
}

// ============================================================
// 周报生成
// ============================================================
function openWeeklyReport() {
  const today = new Date(M.TODAY);
  const dayOfWeek = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  
  const weekStart = formatDateObj(monday);
  const weekEnd = formatDateObj(sunday);
  
  const report = M.mockAggregateWeekly(currentProjectId, weekStart, weekEnd);
  
  let html = `
    <div style="margin-bottom:20px; padding-bottom:16px; border-bottom:1px solid #e2e8f0;">
      <div style="font-size:18px; font-weight:600; color:#0f172a; margin-bottom:4px;">${report.projectName}</div>
      <div style="font-size:13px; color:#64748b;">${report.client} · ${report.weekRange}</div>
    </div>
    
    <div class="weekly-section">
      <div class="weekly-section-title">一、本周概述</div>
      <div class="weekly-section-content">${report.overview}</div>
    </div>
    
    <div class="weekly-section">
      <div class="weekly-section-title">二、区域进度</div>
      <div style="padding:0 14px;">
        ${report.progressByArea.map(area => `
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
        总事项数：${report.issuesSummary.total} 项<br>
        待处理：${report.issuesSummary.open} 项 | 处理中：${report.issuesSummary.inProgress} 项 | 已闭环：${report.issuesSummary.closed} 项<br>
        <div style="margin-top:8px; white-space:pre-wrap; font-size:13px; color:#475569;">${report.issuesSummary.details}</div>
      </div>
    </div>
    
    <div class="weekly-section">
      <div class="weekly-section-title">四、安全与材料</div>
      <div class="weekly-section-content">
        🔍 安全巡检：${report.safetyStats.checkCount} 次（发现隐患 ${report.safetyStats.issueCount} 项）<br>
        📦 材料进场：${report.materialStats.inboundCount} 批次
      </div>
    </div>
    
    <div class="weekly-section">
      <div class="weekly-section-title">五、下周计划</div>
      <div class="weekly-section-content" style="list-style-type:decimal; padding-left:20px;">
        ${report.nextWeekPlan.map((item, i) => `<li>${item}</li>`).join('')}
      </div>
    </div>
    
    <div style="margin-top:20px; padding-top:16px; border-top:1px dashed #cbd5e1; text-align:right; font-size:12px; color:#94a3b8;">
      生成时间：${new Date().toLocaleString('zh-CN')} | Mock 模式
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
  '03':   { title:'一、组织架构',          subtitle:'到岗管理人员名单', pad:130 },
  '0301': { title:'项目重要节点一览表',    subtitle:'项目重要节点',     pad:125 },
  '04':   { title:'二、上周工作完成情况',  subtitle:'2.1 上周重要工作完成', pad:130 },
  '05':   { title:'二、上周工作',          subtitle:'2.2 高管层现场工作', pad:130 },
  '06':   { title:'二、上周工作',          subtitle:'2.12 现场工作：人员统计', pad:130 },
  '07':   { title:'二、上周工作',          subtitle:'2.13 ECC销项情况', pad:130 },
  '08':   { title:'二、上周工作',          subtitle:'2.14 图纸深化情况', pad:130 },
  '09':   { title:'三、下周计划',          subtitle:'3.1 周工作计划', pad:130 },
  '10':   { title:'四、工作计划',          subtitle:'4.1 食堂区施工段划分图', pad:130 },
  '11':   { title:'四、工作计划',          subtitle:'4.1 食堂区5月份施工计划', pad:130 },
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
    '0301': renderMappingPage0301,
    '04': renderMappingPage04,
    '05': renderMappingPage05,
    '06': renderMappingPage06,
    '07': renderMappingPage07,
    '08': renderMappingPage08,
    '09': renderMappingPage09,
    '10': renderMappingPage10,
    '11': renderMappingPage11,
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
    // 0301 分页按钮嵌入副标题右侧（attendance-toggle-bar 使打印时隐藏）
    const is0301Split = page === '0301' && _milestonePages.length > 1;
    const totalP = _milestonePages.length;
    const subBtnHtml = is0301Split
      ? `<div class="attendance-toggle-bar" style="position:absolute;top:82px;left:365px;height:38px;line-height:38px;z-index:3;display:flex;align-items:center;gap:4px;">
          ${_milestonePage > 0 ? `<button style="background:rgba(255,255,255,0.85);color:#374151;border:1px solid #d1d5db;border-radius:4px;padding:1px 10px;cursor:pointer;font-size:12px;font-weight:600;" onclick="_milestonePage=${_milestonePage-1};switchMappingTab('0301')">← 前页</button>` : ''}
          <span style="color:#1f2937;font-size:12px;font-weight:600;">${_milestonePage+1}/${totalP}</span>
          ${_milestonePage < totalP - 1 ? `<button style="background:rgba(255,255,255,0.85);color:#374151;border:1px solid #d1d5db;border-radius:4px;padding:1px 10px;cursor:pointer;font-size:12px;font-weight:600;" onclick="_milestonePage=${_milestonePage+1};switchMappingTab('0301')">后页 →</button>` : ''}
        </div>`
      : '';
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
  const bgStyle = bg !== 'none' ? bg : 'linear-gradient(135deg,#f0f4f8,#e2e8f0)';
  const el = document.getElementById('mappingContent');
  el.style.background = '';
  el.innerHTML = `
<div style="width:100%;height:100%;background:${bgStyle};display:flex;flex-direction:column;font-family:'Microsoft YaHei','PingFang SC',sans-serif;">
  <header style="padding:32px 48px 0;flex-shrink:0;">
    <div style="display:flex;align-items:center;gap:16px;">
      <h1 style="color:#0081cc;font-size:24px;font-weight:700;letter-spacing:0.2em;margin:0;">中建三局集团（深圳）有限公司</h1>
      <div style="flex:1;height:16px;background:${hc};margin-top:4px;"></div>
    </div>
  </header>
  <section style="flex:1;display:flex;align-items:center;justify-content:center;padding:0 48px;">
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
  <footer style="padding:0 48px 32px;flex-shrink:0;">
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
    <button style="background:${_attendanceMode==='full'?'#2563eb':'#fff'};color:${_attendanceMode==='full'?'#fff':'#374151'};border:1px solid ${_attendanceMode==='full'?'#2563eb':'#d1d5db'};border-radius:4px;padding:2px 8px;cursor:pointer;font-size:11px;" onclick="_attendanceMode='full';renderMappingPage03()">按满勤统计</button>
    <button style="background:${_attendanceMode==='actual'?'#2563eb':'#fff'};color:${_attendanceMode==='actual'?'#fff':'#374151'};border:1px solid ${_attendanceMode==='actual'?'#2563eb':'#d1d5db'};border-radius:4px;padding:2px 8px;cursor:pointer;font-size:11px;" onclick="_attendanceMode='actual';renderMappingPage03()">按实际出勤</button>` : '';
  const photoInner = _s03Photo
    ? `<img src="${_s03Photo}" style="width:100%;height:100%;object-fit:contain;">`
    : '<div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;color:#94a3b8;font-size:13px;">🖼️ 项目现场</div>';

  document.getElementById('mappingContent').innerHTML = `
    <div style="display:grid;grid-template-columns:7fr 5fr;gap:24px;height:100%;">
      <div style="border:1px solid #d1d5db;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <div style="display:flex;justify-content:space-between;align-items:center;padding:5px 10px;background:#f3f4f6;border-bottom:1px solid #d1d5db;">
          <span style="font-weight:600;font-size:12px;">到岗管理人员名单</span>
          <div class="attendance-toggle-bar" style="display:flex;align-items:center;gap:6px;">${toggleBtns}</div>
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:11px;">
          <thead>
            <tr style="background:#f3f4f6;">
              <th style="padding:5px;border-right:1px solid #d1d5db;text-align:center;width:32px;">序号</th>
              <th style="padding:5px;border-right:1px solid #d1d5db;text-align:center;">职务</th>
              <th style="padding:5px;border-right:1px solid #d1d5db;text-align:center;width:60px;">姓名</th>
              <th style="padding:5px;border-right:1px solid #d1d5db;text-align:center;width:95px;">联系电话</th>
              <th style="padding:5px;border-right:1px solid #d1d5db;text-align:center;width:65px;">是否到岗</th>
              <th style="padding:5px;text-align:center;width:80px;${showReason?'':'display:none'}">未到岗原因</th>
            </tr>
          </thead>
          <tbody>
            ${stats.map((s, i) => {
              const showPresent = _attendanceMode === 'full' || s.fullAttendance;
              const absentDays = s.totalDays - s.presentDays;
              const rowBg = i % 2 === 0 ? '#fff' : '#f9fafb';
              return `
              <tr style="background:${rowBg};">
                <td style="padding:4px;border-right:1px solid #d1d5db;border-bottom:1px solid #e5e7eb;text-align:center;">${i+1}</td>
                <td style="padding:4px;border-right:1px solid #d1d5db;border-bottom:1px solid #e5e7eb;">${s.position}</td>
                <td style="padding:4px;border-right:1px solid #d1d5db;border-bottom:1px solid #e5e7eb;text-align:center;font-weight:600;">${s.name}</td>
                <td style="padding:4px;border-right:1px solid #d1d5db;border-bottom:1px solid #e5e7eb;text-align:center;">${s.phone}</td>
                <td style="padding:4px;border-right:1px solid #d1d5db;border-bottom:1px solid #e5e7eb;text-align:center;">
                  <span style="background:${showPresent?'#d1fae5':'#fef3c7'};color:${showPresent?'#065f46':'#92400e'};padding:1px 6px;border-radius:3px;font-size:10px;">${showPresent?'已到岗':'未到岗'}</span>
                </td>
                <td style="padding:4px;border-bottom:1px solid #e5e7eb;text-align:center;font-size:10px;${showReason?'':'display:none'}">
                  ${showPresent ? '<span style="color:#9ca3af;">—</span>' : `<span style="color:#92400e;">${s.absentReasons.length ? s.absentReasons.join('、') : '缺勤 '+absentDays+' 天'}</span>`}
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
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
  M.saveMilestoneData(_milestoneData);
  const activeBtn = document.querySelector('#reportPageNav button.active[data-page]');
  if (activeBtn && activeBtn.dataset.page === '0301') switchMappingTab('0301');
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

function renderMappingPage04() {
  const { weekStart, weekEnd } = getWeekRange();
  const rows = M.getPage04Data(currentProjectId, weekStart, weekEnd);

  if (rows.length === 0) {
    document.getElementById('mappingContent').innerHTML = `
      <div style="text-align:center; padding:40px 0; color:#94a3b8;">
        <div style="font-size:40px;">📋</div>
        <p style="margin-top:12px;">本周（${weekStart} ~ ${weekEnd}）暂无已确认的进度事件</p>
        <p style="font-size:12px; margin-top:4px;">请先在日报中录入并确认事件</p>
      </div>`;
    return;
  }

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
  document.getElementById('mappingContent').innerHTML = html;
}

function renderMappingPage05() {
  const { weekStart, weekEnd } = getWeekRange();
  const photos = M.getPage05Photos(currentProjectId, weekStart, weekEnd);
  const count = Math.min(photos.length, 6);

  if (count === 0) {
    document.getElementById('mappingContent').innerHTML = `
      <div style="text-align:center; padding:40px 0; color:#94a3b8;">
        <div style="font-size:40px;">📷</div>
        <p style="margin-top:12px;">本周（${weekStart} ~ ${weekEnd}）暂无照片数据</p>
        <p style="font-size:12px; margin-top:4px;">请先在日报中通过拍照录入</p>
      </div>`;
    return;
  }

  const cols = Math.min(count, 3);
  let html = `<div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:12px;height:100%;">`;
  for (let i = 0; i < count; i++) {
    const p = photos[i];
    html += `
      <div style="border:1px solid #ccc;overflow:hidden;background:#fff;">
        <div style="height:100%;display:flex;align-items:center;justify-content:center;background:#f1f5f9;color:#94a3b8;font-size:12px;min-height:140px;">
          🖼️ ${p.caption || '现场照片'}
        </div>
      </div>`;
  }
  html += `</div>`;
  document.getElementById('mappingContent').innerHTML = html;
}

function renderMappingPage06() {
  const { weekStart, weekEnd } = getWeekRange();
  const rows = M.getPage06Data(currentProjectId, weekStart, weekEnd);
  const s06photo = M.S06_PHOTO || { src: '', caption: '防高坠专项安全会' };
  document.getElementById('mappingContent').innerHTML = `
    <div style="display:flex;gap:24px;height:100%;">
      <div style="flex:1;display:flex;flex-direction:column;gap:16px;">
        <div style="background:#fff;padding:8px;border:1px solid #d1d5db;border-radius:2px;flex:1;display:flex;align-items:center;justify-content:center;overflow:hidden;">
          <div style="width:100%;aspect-ratio:4/3;background:#f1f5f9;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:13px;">
            🖼️ ${s06photo.src || '施工现场'}
          </div>
        </div>
        <div style="background:#48a0f8;color:#fff;padding:8px 24px;text-align:center;font-size:14px;font-weight:700;width:fit-content;margin:0 auto;border-radius:0;">
          ${s06photo.caption}
        </div>
      </div>
      <div style="flex:1;display:flex;flex-direction:column;gap:12px;">
        <div style="background:#fff;border:1px solid #005e00;border-radius:4px;overflow:hidden;box-shadow:0 2px 6px rgba(0,0,0,0.06);flex:1;">
          <table style="width:100%;border-collapse:collapse;font-size:12px;">
            <thead>
              <tr style="background:#00a2ff;color:#fff;">
                <th style="padding:6px;border-right:1px solid #005e00;border-bottom:2px solid #005e00;width:36px;">序号</th>
                <th style="padding:6px;border-right:1px solid #005e00;border-bottom:2px solid #005e00;">工种</th>
                <th style="padding:6px;border-right:1px solid #005e00;border-bottom:2px solid #005e00;width:72px;">本周人数</th>
                <th style="padding:6px;border-bottom:2px solid #005e00;width:72px;">下周人数</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map((r,i) => {
                const isTotal = r.trade === '合计';
                const bg = isTotal ? 'rgba(0,162,255,0.1)' : (i%2===0?'#cbe0ff':'#e7f0ff');
                const fw = isTotal ? '700' : '400';
                return `<tr style="background:${bg};">
                  <td style="padding:4px;border-right:1px solid #005e00;border-bottom:1px solid #005e00;text-align:center;font-weight:${fw};">${r.seq}</td>
                  <td style="padding:4px;border-right:1px solid #005e00;border-bottom:1px solid #005e00;text-align:center;font-weight:${fw};">${r.trade}</td>
                  <td style="padding:4px;border-right:1px solid #005e00;border-bottom:1px solid #005e00;text-align:center;">${r.thisWeek}</td>
                  <td style="padding:4px;border-bottom:1px solid #005e00;text-align:center;">${r.nextWeek}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
        <div style="background:#48a0f8;color:#fff;padding:6px 20px;text-align:center;font-size:13px;font-weight:700;width:fit-content;margin:0 auto;border-radius:0;">
          全部人员在场情况
        </div>
      </div>
    </div>`;
}

function renderMappingPage07() {
  const stats = M.getPage07Data(currentProjectId);
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
    <div style="background:#fff;border:1px solid #005e00;border-radius:4px;height:320px;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:13px;overflow:hidden;">
      🖼️ ECC 销项截图（../../07上周工作ECC.png）
    </div>`;
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
            <th style="padding:6px;border-bottom:2px solid #005e00;width:15%;">完成情况</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((r,i) => {
            const bg = i%2===0?'#cbe0ff':'#e7f0ff';
            const statusColor = r.status === '已完成' ? '#059669' : '#d97706';
            return `<tr style="background:${bg};">
              <td style="padding:6px;border-right:1px solid #005e00;border-bottom:1px solid #005e00;text-align:center;">${r.seq}</td>
              <td style="padding:6px;border-right:1px solid #005e00;border-bottom:1px solid #005e00;">${r.task}</td>
              <td style="padding:6px;border-right:1px solid #005e00;border-bottom:1px solid #005e00;text-align:center;">${r.owner}</td>
              <td style="padding:6px;border-bottom:1px solid #005e00;text-align:center;font-weight:600;color:${statusColor};">${r.status}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
}

function renderMappingPage09() {
  const items = M.getPage09Data();
  const areas = [...new Set(items.map(i => i.area))];
  const dayLabels = ['周一','周二','周三','周四','周五','周六','周日'];
  const wr = getWeekRange();
  const monday = new Date(wr.weekStart);
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
          <th rowspan="2" style="border:1px solid #005e00;padding:2px;background:#fff;font-weight:700;font-size:10px;">工作内容</th>
          <th rowspan="2" style="border:1px solid #005e00;padding:2px;background:#fff;width:32px;font-weight:700;font-size:9px;writing-mode:vertical-rl;text-orientation:mixed;">工作天数</th>
          ${dayLabels.map(d => `<th style="border:1px solid #005e00;padding:2px;background:#fff;width:22px;font-weight:700;font-size:9px;">${d}</th>`).join('')}
          <th rowspan="2" style="border:1px solid #005e00;padding:2px;background:#fff;width:45px;font-weight:700;font-size:9px;writing-mode:vertical-rl;text-orientation:mixed;">劳动力需求</th>
          <th rowspan="2" style="border:1px solid #005e00;padding:2px;background:#fff;width:40px;font-weight:700;font-size:9px;writing-mode:vertical-rl;text-orientation:mixed;">材料准备</th>
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
          `<td style="border:1px solid #005e00;padding:0;width:22px;height:18px;background:${active ? '#00b0f0' : '#fff'};"></td>`
        ).join('')}
        <td style="border:1px solid #005e00;padding:2px;text-align:center;">${item.labor}</td>
        <td style="border:1px solid #005e00;padding:2px;text-align:center;">${item.material}</td>
      </tr>`;
    });
  });
  html += `</tbody></table></div>`;
  document.getElementById('mappingContent').innerHTML = html;
}

function renderMappingPage10() {
  const items = M.getPage10Data();
  const cols = Math.min(items.length, 3);
  document.getElementById('mappingContent').innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:20px;height:100%;padding-top:12px;">
      ${items.map(item => `
        <div style="display:flex;flex-direction:column;align-items:center;">
          <div style="width:100%;flex:1;background:#fff;border:1px solid #d1d5db;display:flex;align-items:center;justify-content:center;overflow:hidden;font-size:13px;color:#9ca3af;min-height:220px;">
            🖼️ ${item.image}
          </div>
          <div style="margin-top:12px;font-size:18px;font-weight:700;color:#000;">${item.label}</div>
        </div>
      `).join('')}
    </div>`;
}

function renderMappingPage11() {
  const items = M.getPage11Data();
  const floorHeaders = [
    { name: '一层', color: '#f4b084' },
    { name: '二层', color: '#a9d08e' },
    { name: 'B1层（1）', color: '#9dc3e6' },
    { name: 'B1层（2）', color: '#9dc3e6' }
  ];
  document.getElementById('mappingContent').innerHTML = `
    <div style="overflow-x:auto;">
    <table style="width:100%;border-collapse:collapse;font-size:10px;border:1px solid #999;">
      <thead>
        <tr>
          <th colspan="4" style="border:1px solid #999;padding:4px;background:#f2f2f2;font-size:14px;text-align:center;">26年5月施工进度计划跟踪表</th>
          ${floorHeaders.map(f => `<th colspan="3" style="border:1px solid #999;padding:4px;text-align:center;font-size:10px;background:${f.color};color:#000;">${f.name}</th>`).join('')}
        </tr>
        <tr>
          <th style="border:1px solid #999;padding:2px;width:28px;">序号</th>
          <th style="border:1px solid #999;padding:2px;width:36px;">楼栋</th>
          <th style="border:1px solid #999;padding:2px;width:36px;">部位</th>
          <th style="border:1px solid #999;padding:2px;">工序</th>
          ${floorHeaders.flatMap(() => ['开始时间','完成时间','日历天']).map(h => `<th style="border:1px solid #999;padding:2px;width:42px;">${h}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${items.map((item, i) => {
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
        }).join('')}
      </tbody>
    </table></div>`;
}

function renderMappingPage12() {
  const items = M.getPage12Data(currentProjectId, true);
  const { weekStart, weekEnd } = getWeekRange();

  let html = `
    <div style="margin-bottom:12px; font-size:13px; color:#64748b;">
      数据源：事项台账中的协调类型
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

const _REPORT_PAGES = ['01','02','03','0301','04','05','06','07','08','09','10','11','12'];

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

function _pageFn(page) {
  const m = {
    '01':renderMappingPage01,'02':renderMappingPage02,'03':renderMappingPage03,
    '0301':renderMappingPage0301,'04':renderMappingPage04,'05':renderMappingPage05,
    '06':renderMappingPage06,'07':renderMappingPage07,'08':renderMappingPage08,
    '09':renderMappingPage09,'10':renderMappingPage10,'11':renderMappingPage11,'12':renderMappingPage12
  };
  return m[page];
}

function _pageTitle(page) {
  const t = {'01':'工程概况','02':'本周完成工作','03':'下周计划','0301':'重要节点',
  '04':'时间轴·生产周报','05':'现场照片','06':'施工人员统计','07':'ECC销项',
  '08':'图纸深化','09':'生产进度曲线','10':'材料进场','11':'施工段计划','12':'协调事宜'};
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
  _REPORT_PAGES.forEach(p => {
    const fn = _pageFn(p);
    if (!fn) return;
    fn();
    if (p === '01') {
      html += `<div class="report-page-frame${noBg}" style="background:none;page-break-after:always;">${el.innerHTML}</div>`;
    } else {
      html += `<div class="report-page-frame${noBg}">
        <div class="report-page-header">
          <div class="trapezoid" style="background:${hc};"></div>
          <div class="header-line" style="background:${hc};"></div>
        </div>
        <div class="report-page-content">${el.innerHTML}</div>
      </div>`;
    }
    // 0301 续页（多组月份/专业）
    if (p === '0301' && _milestonePages.length > 1) {
      for (let pi = 1; pi < _milestonePages.length; pi++) {
        html += `<div class="report-page-frame${noBg}">
          <div class="report-page-header">
            <div class="trapezoid" style="background:${hc};"></div>
            <div class="header-line" style="background:${hc};"></div>
          </div>
          <div class="report-page-content">${_milestonePages[pi].html}</div>
        </div>`;
      }
    }
  });
  if (cur) cur.click();
  return html;
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
  const styles = _getStyleText();
  const hc = _getHeaderColor();
  const bg = _getBgCss();
  const baseUrl = window.location.href.substring(0, window.location.href.lastIndexOf('/') + 1);
  const bgUrl = customBgUrl || TEMPLATES[currentTemplate].bg;
  const absBg = bgUrl ? baseUrl + bgUrl : '';
  const w = window.open('', '_blank', 'width=1280,height=720');
  w.document.write(`<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>中建三局集团周报</title>
<base href="${baseUrl}">
<style>${styles}
  @page { size:1280px 720px; margin:0; }
  body { margin:0; padding:0; background:#fff; }
  .report-page-frame { width:1280px; height:720px; position:relative; overflow:hidden; margin:0; page-break-after:always; }
  .report-page-frame.no-bg { background:#fff !important; }
  .report-page-frame:last-child { page-break-after:auto; }
  .report-page-header { position:absolute; top:0; left:0; right:0; height:75px; z-index:1; }
  .report-page-header .trapezoid { position:absolute; top:23px; left:0; width:58px; height:52px;
    background:${hc}; clip-path:polygon(0 0,60% 0,100% 100%,0 100%); }
  .report-page-header .header-line { position:absolute; top:75px; left:72px; right:0; height:3px;
    background:${hc}; }
  .report-page-content { width:1280px; height:720px; padding:80px 30px 20px; box-sizing:border-box; overflow:hidden; }
  .modal-header,.modal-footer,.mapping-tab,.page-nav,.export-bar,#weeklyMappingTabs,#toast,.floating-control{display:none!important}
<\/style></head><body>${pages}
<script>window.onload=function(){setTimeout(function(){window.print();window.close();},500)};<\/script>
</body></html>`);
  w.document.close();
}

function exportReportPDF() {
  printReport();
}

// ============================================================
// 每日签到
// ============================================================

function openAttendanceInput() {
  const dateInput = document.getElementById('attendanceDate');
  dateInput.value = M.TODAY;

  const list = document.getElementById('attendanceList');
  const records = M.getAttendanceForDate(M.TODAY);
  const mgrs = M.MANAGEMENT_TEAM;

  list.innerHTML = mgrs.map((m, i) => {
    const r = records[m.id] || { present: true, reason: '' };
    return `<div style="display:flex;align-items:center;gap:6px;padding:4px 10px;${i%2===0?'background:#f9fafb;':''}">
      <input type="checkbox" class="attendance-cb" value="${m.id}" ${r.present?'checked':''} onchange="toggleAttendanceReason(this)">
      <span style="font-size:13px;min-width:140px;font-weight:500;">${m.name}</span>
      <span style="font-size:11px;color:#64748b;flex:1;">${m.position}</span>
      <input type="text" class="attendance-reason" data-id="${m.id}" value="${r.reason}" placeholder="缺勤原因" style="display:${r.present?'none':'inline'};width:130px;font-size:11px;border:1px solid #d1d5db;border-radius:3px;padding:2px 6px;">
    </div>`;
  }).join('');

  _refreshAttendancePhotoUI();
  showModal('modalAttendance');
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
  reader.onload = function(e) {
    _s03Photo = e.target.result;
    _s03PhotoCaption = document.getElementById('attPhotoCaption').value || '管理人员合影';
    _refreshAttendancePhotoUI();
    renderMappingPage03();
  };
  reader.readAsDataURL(file);
  input.value = '';
}

function clearAttendancePhoto() {
  _s03Photo = '';
  _s03PhotoCaption = '管理人员合影';
  _refreshAttendancePhotoUI();
  renderMappingPage03();
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
  const reasonInput = cb.closest('div').querySelector('.attendance-reason');
  if (reasonInput) reasonInput.style.display = cb.checked ? 'none' : 'inline';
}

function setAllAttendance(checked) {
  document.querySelectorAll('#attendanceList .attendance-cb').forEach(cb => {
    cb.checked = checked;
    toggleAttendanceReason(cb);
  });
}

function saveAttendance() {
  const date = document.getElementById('attendanceDate').value;
  const records = {};
  document.querySelectorAll('#attendanceList .attendance-cb').forEach(cb => {
    const reasonInput = cb.closest('div').querySelector('.attendance-reason');
    records[cb.value] = { present: cb.checked, reason: reasonInput ? reasonInput.value : '' };
  });
  M.setAttendanceForDate(date, records);
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
  setTimeout(() => {
    checkBackendHealth();
    setInterval(checkBackendHealth, 30000);
  }, 500);
});