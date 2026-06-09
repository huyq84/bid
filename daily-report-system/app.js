// ============================================================
// 主应用逻辑
// ============================================================

let M = window.MockData;
let currentProjectId = localStorage.getItem('current_project_id') || 'baicaoyuan';
let currentFilter = 'all';
let selectedEventId = null;
let currentCalendarDate = new Date();
let selectedDates = [];
let multiSelectMode = false;
let laborRowCount = 1;
let areaRowCount = 1;

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
  
  document.getElementById('eventTimeline').innerHTML = sorted.map(event => `
    <div class="event-item ${event.status === 'draft' ? 'draft' : ''}" 
         onclick="openEventDetail('${event.id}')">
      <div class="event-head">
        <span class="event-time">${event.time}</span>
        <span class="event-type-badge" style="background:${M.TYPE_META[event.type].color};">
          ${M.TYPE_META[event.type].icon} ${M.TYPE_META[event.type].label}
        </span>
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
  `).join('');
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
  
  document.getElementById('eventTimeline').innerHTML = sorted.map(event => `
    <div class="event-item ${event.status === 'draft' ? 'draft' : ''}" 
         onclick="openEventDetail('${event.id}')">
      <div class="event-head">
        <span class="event-date" style="font-size:10px; color:#64748b; margin-right:6px;">${event.date}</span>
        <span class="event-time">${event.time}</span>
        <span class="event-type-badge" style="background:${M.TYPE_META[event.type].color};">
          ${M.TYPE_META[event.type].icon} ${M.TYPE_META[event.type].label}
        </span>
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
  `).join('');
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

function deleteEvent(eventId) {
  if (!confirm('确定要删除这个事件吗？')) return;
  const index = M.EVENTS.findIndex(e => e.id === eventId);
  if (index > -1) {
    M.EVENTS.splice(index, 1);
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
  event.payload.progress = document.getElementById('edit-progress').value;
  event.payload.headcount = parseInt(document.getElementById('edit-headcount').value) || 0;
  event.note = document.getElementById('edit-note').value;
  
  closeModal('modalEventEdit');
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
    
    let className = 'calendar-day';
    if (isToday) className += ' today';
    if (isSelected) className += ' selected';
    
    let statusDots = '';
    if (confirmedCount > 0 || draftCount > 0) {
      statusDots = '<div class="calendar-dots">';
      if (confirmedCount > 0) {
        statusDots += `<span class="calendar-dot confirmed">✓${confirmedCount}</span>`;
      }
      if (draftCount > 0) {
        statusDots += `<span class="calendar-dot draft">○${draftCount}</span>`;
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
// 今日计划卡片
// ============================================================
function renderDailyPlanCard() {
  const todayPlan = (M.PLANS[currentProjectId] || []).find(p => p.date === M.TODAY);
  
  if (!todayPlan) {
    document.getElementById('dailyPlanCard').innerHTML = `
      <div style="text-align:center; padding:12px; color:#94a3b8;">
        <div style="font-size:24px; margin-bottom:4px;">�</div>
        <div style="font-size:12px;">暂无今日计划</div>
      </div>
    `;
    return;
  }
  
  const totalWorkers = todayPlan.laborSchedule?.reduce((sum, l) => sum + l.count, 0) || 0;
  
  document.getElementById('dailyPlanCard').innerHTML = `
    ${todayPlan.description ? `<div style="font-size:13px; color:#334155; margin-bottom:10px;">${todayPlan.description}</div>` : ''}
    ${todayPlan.laborSchedule?.length > 0 ? `
      <div style="margin-bottom:8px;">
        <div style="font-size:11px; color:#64748b; margin-bottom:3px;">👷 出勤：${totalWorkers}人</div>
        <div style="display:flex; flex-wrap:wrap; gap:4px;">
          ${todayPlan.laborSchedule.map(l => `<span style="font-size:11px; padding:2px 6px; background:#f1f5f9; border-radius:4px;">${l.laborType}: ${l.count}人</span>`).join('')}
        </div>
      </div>
    ` : ''}
    ${todayPlan.areaTargets?.length > 0 ? `
      <div>
        <div style="font-size:11px; color:#64748b; margin-bottom:3px;">📍 区域目标</div>
        <div style="display:grid; gap:2px;">
          ${todayPlan.areaTargets.map(t => `
            <div style="font-size:12px; padding:4px 8px; background:#f0f9ff; border-radius:4px;">
              ${getAreaName(t.areaId)} · ${t.taskName} · ${t.targetProgress}
            </div>
          `).join('')}
        </div>
      </div>
    ` : ''}
  `;
}

// ============================================================
// 表单操作
// ============================================================
function populateAreaSelects() {
  // 用 getProjectAreas() 替代 M.AREAS（支持用户新增区域）
  const areas = getProjectAreas();
  const html = '<option value="">请选择区域</option>' +
    areas.map(a => `<option value="${a.id}">${a.name}${a.custom ? ' ★' : ''}</option>`).join('');

  document.querySelectorAll('select[id$="-area"], select[id*="area-"]').forEach(el => {
    const current = el.value;
    el.innerHTML = html;
    if (current && areas.find(a => a.id === current)) {
      el.value = current;
    }
  });
}

// ============================================================
// 日计划表单
// ============================================================
function openDailyPlanForm() {
  laborRowCount = 1;
  areaRowCount = 1;
  document.getElementById('dp-date').value = M.TODAY;
  document.getElementById('dp-description').value = '';
  document.getElementById('laborRows').innerHTML = `
    <div class="form-row labor-row">
      <div class="form-group">
        <label class="form-label">工种</label>
        <input class="form-input" type="text" id="labor-type-0" placeholder="如：木工">
      </div>
      <div class="form-group">
        <label class="form-label">人数</label>
        <input class="form-input" type="number" id="labor-count-0" value="0" min="0">
      </div>
      <button class="btn btn-danger btn-sm" onclick="removeLaborRow(0)" style="margin-top:24px;">✕</button>
    </div>
  `;
  document.getElementById('areaTargetRows').innerHTML = `
    <div class="form-row area-row">
      <div class="form-group">
        <label class="form-label">区域</label>
        <select class="form-select" id="area-target-area-0">
          ${(M.AREAS[currentProjectId] || []).map(a => `<option value="${a.id}">${a.name}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">任务名称</label>
        <input class="form-input" type="text" id="area-target-task-0" placeholder="任务名称">
      </div>
      <div class="form-group">
        <label class="form-label">目标进度</label>
        <input class="form-input" type="text" id="area-target-progress-0" placeholder="如：80%">
      </div>
      <button class="btn btn-danger btn-sm" onclick="removeAreaRow(0)" style="margin-top:24px;">✕</button>
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
  const date = document.getElementById('dp-date').value;
  const description = document.getElementById('dp-description').value;
  
  const laborSchedule = [];
  document.querySelectorAll('.labor-row').forEach((row, index) => {
    const type = document.getElementById(`labor-type-${index}`)?.value;
    const count = parseInt(document.getElementById(`labor-count-${index}`)?.value) || 0;
    if (type && count > 0) {
      laborSchedule.push({ laborType: type, count });
    }
  });
  
  const areaTargets = [];
  document.querySelectorAll('.area-row').forEach((row, index) => {
    const areaId = document.getElementById(`area-target-area-${index}`)?.value;
    const taskName = document.getElementById(`area-target-task-${index}`)?.value;
    const targetProgress = document.getElementById(`area-target-progress-${index}`)?.value;
    if (areaId && taskName) {
      areaTargets.push({ areaId, taskName, targetProgress: targetProgress || '0%' });
    }
  });
  
  if (!date) {
    showToast('请选择日期', 'error');
    return;
  }
  
  const plan = {
    id: `PLAN${String(Date.now()).slice(-3)}`,
    projectId: currentProjectId,
    date,
    description,
    laborSchedule,
    areaTargets,
    createdAt: new Date().toISOString()
  };
  
  if (!M.PLANS[currentProjectId]) {
    M.PLANS[currentProjectId] = [];
  }
  M.PLANS[currentProjectId].unshift(plan);
  
  closeModal('modalDailyPlan');
  renderDailyPlanCard();
  showToast('日计划已保存', 'success');
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
  // 持久化
  try {
    const saved = localStorage.getItem('customAreas');
    if (saved) {
      const parsed = JSON.parse(saved);
      for (const [pid, areas] of Object.entries(parsed)) {
        customAreas[pid] = areas.map(a => ({ ...a, custom: true }));
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
function addCustomArea(selectId) {
  const name = prompt('请输入新区域名称（如：VIP 接待室）：');
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
function removeArea(areaId) {
  if (!confirm(`确定删除区域 "${findAreaById(areaId)?.name || areaId}"？`)) return;
  if (!customAreas[currentProjectId]) return;
  const area = customAreas[currentProjectId].find(a => a.id === areaId);
  if (area && !area.custom) {
    showToast('预置区域不能删除', 'error');
    return;
  }
  customAreas[currentProjectId] = customAreas[currentProjectId].filter(a => a.id !== areaId);
  saveCustomAreas();
  refreshAreaSelectors();
  showToast('区域已删除', 'success');
}

// 重命名区域
function renameArea(areaId) {
  const area = findAreaById(areaId);
  if (!area) return;
  const newName = prompt('修改区域名称：', area.name);
  if (!newName || !newName.trim() || newName === area.name) return;
  if (findAreaByName(newName.trim())) {
    showToast(`"${newName}" 已存在`, 'error');
    return;
  }
  area.name = newName.trim();
  saveCustomAreas();
  refreshAreaSelectors();
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

  const selectedDate = selectedDates.length > 0 ? selectedDates[0] : todayStr;
  document.getElementById('voiceDate').value = selectedDate;

  document.getElementById('voiceText').value = '';
  document.getElementById('voiceParsePreview').style.display = 'none';
  document.getElementById('voiceSaveBtn').disabled = true;
  document.getElementById('recordingBtn').classList.remove('recording');
  document.getElementById('recordingHint').textContent = '点击麦克风开始录音';
  document.getElementById('vp-area-hint').style.display = 'none';
  // 清空调试日志
  clearVoiceDebug();
  // 关键：填充区域选项
  renderAreaOptions('vp-area', '');
  showModal('modalVoice');
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

// 调试日志收集
let voiceDebugLog = [];
// 暴露到 window（方便测试 + 控制台调试）
if (typeof window !== 'undefined') window.voiceDebugLog = voiceDebugLog;

function logVoiceDebug(stage, data) {
  const entry = { time: new Date().toISOString().slice(11, 19), stage, data };
  voiceDebugLog.push(entry);
  // 重新同步到 window（保持引用一致）
  if (typeof window !== 'undefined') window.voiceDebugLog = voiceDebugLog;
  // 同步到控制台
  const tag = '🎤[voice]';
  if (data instanceof Error) {
    console.error(tag, stage, data);
  } else {
    console.log(tag, stage, data);
  }
  // 同步刷新调试面板（如果存在）
  renderVoiceDebugPanel();
}

function renderVoiceDebugPanel() {
  const panel = document.getElementById('voiceDebugPanel');
  if (!panel) return;
  if (voiceDebugLog.length === 0) {
    panel.style.display = 'none';
    return;
  }
  panel.style.display = 'block';
  const html = voiceDebugLog.map((e, i) => {
    const dataStr = typeof e.data === 'object' 
      ? JSON.stringify(e.data, null, 2) 
      : String(e.data);
    return `<div style="border-bottom:1px solid #e2e8f0; padding:6px 0;">
      <div style="font-size:10px; color:#94a3b8;">#${i+1} · ${e.time} · ${e.stage}</div>
      <pre style="margin:4px 0 0 0; font-size:10px; color:#0f172a; white-space:pre-wrap; word-break:break-all; max-height:200px; overflow-y:auto;">${dataStr.replace(/</g, '&lt;')}</pre>
    </div>`;
  }).join('');
  document.getElementById('voiceDebugLog').innerHTML = html;
  // 自动滚动到底部
  const log = document.getElementById('voiceDebugLog');
  if (log) log.scrollTop = log.scrollHeight;
}

function clearVoiceDebug() {
  voiceDebugLog = [];
  if (typeof window !== 'undefined') window.voiceDebugLog = voiceDebugLog;
  renderVoiceDebugPanel();
}

function copyVoiceDebug() {
  const text = voiceDebugLog.map(e => `[${e.time}] ${e.stage}\n${JSON.stringify(e.data, null, 2)}`).join('\n\n');

  // 优先用现代 API
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      showToast('日志已复制到剪贴板', 'success');
    }).catch(() => fallbackCopy(text));
  } else {
    fallbackCopy(text);
  }
}

function fallbackCopy(text) {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    showToast(ok ? '日志已复制' : '复制失败，请手动选择', ok ? 'success' : 'error');
  } catch (e) {
    showToast('复制失败：' + e.message, 'error');
  }
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

  logVoiceDebug('📤 发起 LLM 请求', {
    url: API_BASE + '/parse-voice',
    method: 'POST',
    body: requestBody
  });

  const t0 = Date.now();
  try {
    const r = await fetch(API_BASE + '/parse-voice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });
    logVoiceDebug('📥 收到 HTTP 响应', {
      status: r.status,
      ok: r.ok,
      headers: Object.fromEntries(r.headers.entries())
    });

    if (!r.ok) throw new Error('HTTP ' + r.status);
    const parsed = await r.json();
    logVoiceDebug('✅ LLM 返回结果（耗时 ' + (Date.now() - t0) + 'ms）', parsed);

    applyVoiceParseResult(parsed);
    if (hint) hint.textContent = `🤖 LLM 真实 · ${parsed.latencyMs || 0}ms · 来源 ${parsed.source}`;
    logVoiceDebug('🎯 已应用到表单', {
      type: document.getElementById('vp-type').value,
      areaId: document.getElementById('vp-area').value,
      task: document.getElementById('vp-task').value,
      owner: document.getElementById('vp-owner').value,
      progress: document.getElementById('vp-progress').value,
      headcount: document.getElementById('vp-headcount').value
    });
  } catch (e) {
    logVoiceDebug('❌ LLM 调用失败，降级到 mock', {
      error: e.message,
      stack: e.stack
    });
    // 降级到本地 mock
    const parsed = M.mockParseVoice(text, currentProjectId);
    logVoiceDebug('⚙️ Mock fallback 结果', parsed);
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
function showAreaConfirmDialog(areaName) {
  const existingMatch = findAreaByName(areaName);
  if (existingMatch) {
    renderAreaOptions('vp-area', existingMatch.id);
    return;
  }
  // 重建 select：标出"建议新增"项
  const select = document.getElementById('vp-area');
  if (!select) return;
  const areas = getProjectAreas();
  select.innerHTML =
    '<option value="">请选择区域</option>' +
    `<option value="__NEW__" style="background:#fef3c7; color:#92400e;">＋ 新增 "${areaName}"</option>` +
    areas.map(a => `<option value="${a.id}">${a.name}</option>`).join('');

  // 提示文字
  const hint = document.getElementById('vp-area-hint');
  if (hint) {
    hint.style.display = 'block';
    hint.innerHTML = `💡 LLM 识别到新区域 <strong>"${areaName}"</strong>。请选择：
      <button class="btn btn-sm btn-primary" style="margin-left:6px;" onclick="confirmAddNewArea('${areaName.replace(/'/g, "\\'")}', 'vp-area')">➕ 添加为新区域</button>
      <button class="btn btn-sm btn-ghost" onclick="dismissNewAreaHint()">忽略（从已有选）</button>
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

function dismissNewAreaHint() {
  renderAreaOptions('vp-area', '');
  const hint = document.getElementById('vp-area-hint');
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
    time: new Date().toTimeString().slice(0, 5),
    type: type,
    areaId: areaId,
    payload: {
      taskName: document.getElementById('vp-task').value,
      owner: document.getElementById('vp-owner').value,
      progress: document.getElementById('vp-progress').value,
      headcount: parseInt(document.getElementById('vp-headcount').value) || 0
    },
    submitter: '张明',
    source: 'voice',
    confidence: parseFloat(document.getElementById('vp-confidence').textContent) / 100 || 0.85,
    status: 'draft',
    voiceText: text,
    note: ''
  };
  
  M.EVENTS.unshift(event);
  
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
  document.getElementById('photoDropZone').style.display = 'block';
  document.getElementById('photoSaveBtn').disabled = true;
  showModal('modalPhoto');
}

function mockUploadPhoto() {
  document.getElementById('photoDropZone').style.display = 'none';
  document.getElementById('photoPreviewArea').style.display = 'block';
  
  const parsed = M.mockParsePhoto();
  document.getElementById('pp-area').textContent = getAreaName(parsed.areaId);
  document.getElementById('pp-caption').textContent = parsed.caption;
  document.getElementById('pp-confidence').textContent = `${(parsed.confidence * 100).toFixed(0)}%`;
  
  document.getElementById('photoSaveBtn').disabled = false;
}

function savePhotoEvent() {
  const type = document.getElementById('pp-type').value;
  const areaId = document.getElementById('pp-area-select').value;
  const note = document.getElementById('pp-note').value;
  // 用选中日期而非固定 M.TODAY，这样新事件归到用户当前查看的日期
  const eventDate = selectedDates.length > 0 ? selectedDates[0] : M.TODAY;

  const event = {
    id: `E${String(Date.now()).slice(-3)}`,
    projectId: currentProjectId,
    date: eventDate,
    time: new Date().toTimeString().slice(0, 5),
    type,
    areaId,
    payload: {
      checkType: type === 'safety' ? '日常巡检' : '进度记录',
      result: '正常'
    },
    submitter: '张明',
    source: 'photo',
    confidence: 0.85,
    status: 'draft',
    photos: [{ id: `P${String(Date.now()).slice(-3)}`, caption: '现场照片', area: areaId }],
    note
  };
  
  M.EVENTS.unshift(event);

  closeModal('modalPhoto');
  renderFilteredEvents();
  renderStats();
  if (typeof updateCalendar === 'function') updateCalendar();
  showToast('照片事件已保存', 'success');
}

// ============================================================
// 手动录入
// ============================================================
function openManualInput() {
  renderManualForm();
  showModal('modalManual');
}

function renderManualForm() {
  const type = document.getElementById('m-type').value;
  
  let html = '';
  switch(type) {
    case 'progress':
      html = `
        <div class="form-group">
          <label class="form-label">任务名称 <span class="req">*</span></label>
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
        <div class="form-group">
          <label class="form-label">人数</label>
          <input class="form-input" type="number" id="m-headcount" value="0" min="0">
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
  
  let payload = {};
  switch(type) {
    case 'progress':
      payload = {
        taskName: document.getElementById('m-task').value,
        progress: document.getElementById('m-progress').value,
        owner: document.getElementById('m-owner').value,
        headcount: parseInt(document.getElementById('m-headcount').value) || 0
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
    date: selectedDates.length > 0 ? selectedDates[0] : M.TODAY,
    time: time || new Date().toTimeString().slice(0, 5),
    type,
    areaId,
    payload,
    submitter: '张明',
    source: 'manual',
    confidence: 1.0,
    status: 'draft',
    note: document.getElementById('m-note').value
  };
  
  M.EVENTS.unshift(event);

  closeModal('modalManual');
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
const API_BASE = 'http://localhost:3001/api';
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
    dot.title = '后端未启动（localhost:3001）';
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

// 在原有 DOMContentLoaded 之后启动健康检查
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    checkBackendHealth();
    setInterval(checkBackendHealth, 30000);
  }, 500);
});