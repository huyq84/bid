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
  
  document.getElementById('eventTimeline').innerHTML = `
    <div class="timeline-line"></div>
    ${sorted.map(event => `
      <div class="event-row">
        <div class="event-dot ${event.status === 'draft' ? 'draft' : ''}"></div>
        <div class="event-item" onclick="openEventDetail('${event.id}')">
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
      </div>
    `).join('')}
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
// 今日计划卡片
// ============================================================
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
    const laborList = plan.laborRequirements || plan.laborSchedule || [];
    const totalWorkers = laborList.reduce((sum, l) => sum + (l.count || 0), 0);
    const typeMeta = M.TYPE_META[plan.eventType] || { icon: '📋', label: '计划', color: '#64748b' };
    const displayProcess = plan.process || plan.description || '施工计划';

    html += `
      <div style="background:#f8fafc; border-radius:6px; padding:10px; margin-bottom:8px; border-left:3px solid ${typeMeta.color};">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
          <span style="font-size:12px; font-weight:600; color:#334155;">${typeMeta.icon} ${displayProcess}</span>
          <span style="font-size:10px; padding:1px 6px; background:${typeMeta.color}; color:#fff; border-radius:4px;">${plan.status === 'completed' ? '已完成' : '进行中'}</span>
        </div>
        
        ${plan.buildingNo || plan.floorNo ? `
          <div style="font-size:11px; color:#64748b; margin-bottom:4px;">
            🏗️ ${plan.buildingNo || ''}${plan.floorNo ? ' · ' + plan.floorNo : ''}
          </div>
        ` : ''}
        
        ${plan.owner ? `
          <div style="font-size:11px; color:#64748b; margin-bottom:4px;">
            👤 负责人：${plan.owner}
          </div>
        ` : ''}
        
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
        
        ${plan.progress ? `
          <div style="font-size:11px; color:#00adef;">
            📊 当前进度：${plan.progress}
          </div>
        ` : ''}
        
        ${plan.description && !plan.process ? `
          <div style="font-size:11px; color:#64748b; margin-top:4px; padding-top:4px; border-top:1px dashed #e2e8f0;">
            ${plan.description}
          </div>
        ` : ''}
        
        <div style="display:flex; gap:4px; margin-top:6px; padding-top:6px; border-top:1px solid #e2e8f0;">
          <button class="btn btn-ghost btn-sm" onclick="editDailyPlan('${plan.id}')" style="font-size:10px; padding:2px 8px;">✏️ 编辑</button>
          <button class="btn btn-ghost btn-sm" onclick="deleteDailyPlan('${plan.id}')" style="font-size:10px; padding:2px 8px; color:#ef4444;">🗑 删除</button>
        </div>
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
    eventType,
    status,
    buildingNo,
    floorNo,
    area,
    process,
    owner,
    progress: progress || '0%',
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
  document.getElementById('dp-event-type').value = plan.eventType || 'progress';
  document.getElementById('dp-status').value = plan.status || 'active';
  document.getElementById('dp-building-no').value = plan.buildingNo || '';
  document.getElementById('dp-floor-no').value = plan.floorNo || '';
  renderAreaSelect('dp-area');
  document.getElementById('dp-area').value = plan.area || '';
  document.getElementById('dp-process').value = plan.process || '';
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
      progress: document.getElementById('vp-progress').value,
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
  const progress = document.getElementById('pp-progress').value;
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

  closeModal('modalPhoto');
  renderFilteredEvents();
  updateCalendar();
  renderStats();
  showToast('照片事件已保存', 'success');
}

// ============================================================
// 手动录入
// ============================================================
function openManualInput() {
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
    html += `<option value="${plan.id}">📋 ${plan.process}${plan.buildingNo ? ' · ' + plan.buildingNo : ''}${plan.floorNo ? ' · ' + plan.floorNo : ''}</option>`;
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
    // 自动填充计划数据到表单
    if (plan.buildingNo) {
      document.getElementById('m-building-no').value = plan.buildingNo;
    }
    if (plan.floorNo) {
      document.getElementById('m-floor-no').value = plan.floorNo;
    }
    if (plan.area) {
      document.getElementById('m-area').value = plan.area;
    }
    if (plan.process) {
      document.getElementById('m-process').value = plan.process;
    }
    if (plan.owner) {
      document.getElementById('m-owner').value = plan.owner;
    }
    if (plan.eventType) {
      document.getElementById('m-type').value = plan.eventType;
      renderManualForm(); // 重新渲染动态表单
    }
    
    // 根据计划自动设置完成类型
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
  const process = document.getElementById('m-process').value;
  const mainOwner = document.getElementById('m-owner').value;
  
  let payload = {};
  switch(type) {
    case 'progress':
      payload = {
        taskName: document.getElementById('m-task').value,
        owner: mainOwner || document.getElementById('m-owner-field').value,
        progress: document.getElementById('m-progress').value,
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
    process,
    owner: mainOwner,
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
// 周报数据映射预览（原型）
// ============================================================
function openWeeklyReportMapping() {
  closeModal('modalWeekly');
  showModal('modalWeeklyMapping');
  // 默认显示 04 页面
  renderMappingPage04();
}

function switchMappingTab(page) {
  document.querySelectorAll('.mapping-tab').forEach(t => t.classList.remove('active'));
  document.querySelector(`.mapping-tab[data-page="${page}"]`).classList.add('active');
  if (page === '04') renderMappingPage04();
  else if (page === '05') renderMappingPage05();
  else if (page === '12') renderMappingPage12();
}

function getWeekRange() {
  const today = new Date(M.TODAY);
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
    <div style="margin-bottom:12px; font-size:13px; color:#64748b;">
      数据源：本周 ${weekStart} ~ ${weekEnd} 已确认的进度事件
      <span style="margin-left:12px; font-weight:600; color:#0f172a;">共 ${rows.length} 行</span>
    </div>
    <table class="mapping-table" style="width:100%; border-collapse:collapse; font-size:13px;">
      <thead>
        <tr style="background:#00adef; color:#fff;">
          <th style="padding:8px; border:1px solid #ccc; width:50px;">序号</th>
          <th style="padding:8px; border:1px solid #ccc;">计划事项及完成情况</th>
          <th style="padding:8px; border:1px solid #ccc; width:100px;">责任人</th>
        </tr>
      </thead>
      <tbody>`;
  rows.forEach(r => {
    if (r.type === 'header') {
      html += `
        <tr style="background:#e0f2fe;">
          <td style="padding:6px 8px; border:1px solid #ccc; text-align:center; font-weight:600; color:#006494;"></td>
          <td style="padding:6px 8px; border:1px solid #ccc; font-weight:600; color:#006494;" colspan="2">${r.text}</td>
        </tr>`;
    } else {
      const bg = r.seq % 2 === 0 ? '#f8fafc' : '#fff';
      html += `
        <tr style="background:${bg};">
          <td style="padding:6px 8px; border:1px solid #ccc; text-align:center;">${r.seq}</td>
          <td style="padding:6px 8px; border:1px solid #ccc;">${r.text}</td>
          <td style="padding:6px 8px; border:1px solid #ccc; text-align:center;">${r.owner}</td>
        </tr>`;
    }
  });
  html += `</tbody></table>`;
  document.getElementById('mappingContent').innerHTML = html;
}

function renderMappingPage05() {
  const { weekStart, weekEnd } = getWeekRange();
  const photos = M.getPage05Photos(currentProjectId, weekStart, weekEnd);

  if (photos.length === 0) {
    document.getElementById('mappingContent').innerHTML = `
      <div style="text-align:center; padding:40px 0; color:#94a3b8;">
        <div style="font-size:40px;">📷</div>
        <p style="margin-top:12px;">本周（${weekStart} ~ ${weekEnd}）暂无照片数据</p>
        <p style="font-size:12px; margin-top:4px;">请先在日报中通过拍照录入</p>
      </div>`;
    return;
  }

  let html = `
    <div style="margin-bottom:12px; font-size:13px; color:#64748b;">
      数据源：本周 ${weekStart} ~ ${weekEnd} 事件中的照片
      <span style="margin-left:12px; font-weight:600; color:#0f172a;">共 ${photos.length} 张</span>
    </div>
    <div style="display:grid; grid-template-columns:repeat(${Math.min(photos.length, 3)}, 1fr); gap:12px;">`;
  photos.forEach(p => {
    html += `
      <div style="border:1px solid #e2e8f0; border-radius:6px; overflow:hidden;">
        <div style="background:#f1f5f9; height:120px; display:flex; align-items:center; justify-content:center; color:#94a3b8; font-size:12px;">
          📷 ${p.id}（Mock 图片占位）
        </div>
        <div style="padding:6px 10px; font-size:12px; color:#475569;">
          <div style="font-weight:600;">${p.caption}</div>
          <div style="color:#94a3b8;">区域：${p.area} | 类型：${M.TYPE_META[p.eventType]?.label || p.eventType}</div>
        </div>
      </div>`;
  });
  html += `</div>`;
  document.getElementById('mappingContent').innerHTML = html;
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
    <table class="mapping-table" style="width:100%; border-collapse:collapse; font-size:13px;">
      <thead>
        <tr style="background:#0ea5e9; color:#fff;">
          <th style="padding:8px; border:1px solid #166534; width:50px;">序号</th>
          <th style="padding:8px; border:1px solid #166534;">需协调事宜</th>
          <th style="padding:8px; border:1px solid #166534; width:100px;">提出部门</th>
          <th style="padding:8px; border:1px solid #166534; width:100px;">配合部门</th>
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
        <tr style="background:${bg};">
          <td style="padding:8px; border:1px solid #166534; text-align:center;">${item.seq}</td>
          <td style="padding:8px; border:1px solid #166534;">${item.issue}</td>
          <td style="padding:8px; border:1px solid #166534; text-align:center;">${item.proposeDept}</td>
          <td style="padding:8px; border:1px solid #166534; text-align:center;">${item.cooperateDept}</td>
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

// 在原有 DOMContentLoaded 之后启动健康检查
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    checkBackendHealth();
    setInterval(checkBackendHealth, 30000);
  }, 500);
});