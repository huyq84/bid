// platform/js/app.js
// 主应用入口
(function (global) {
  let currentSection = "01";
  let report = null;
  let _periods = [];
  let _currentPeriod = "2026-W20";
  let _periodInterval = 7;
  let _periodCount = 4;

  // ====== 工具 ======
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }
  function toLocalDateString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  function setField(path, val) {
    const parts = path.split(".");
    let o = report;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!o[parts[i]]) o[parts[i]] = {};
      o = o[parts[i]];
    }
    o[parts[parts.length - 1]] = val;
    Store.save(report, _currentPeriod);
  }
  function getField(path) {
    return path.split(".").reduce((o, k) => o && o[k], report);
  }
  function updateField(field, value) {
    setField(field, value);
    
    const parts = field.split('.');
    if (parts[0] === 'period' && (parts[1] === 'start' || parts[1] === 'end')) {
      const customPeriods = Store.getCustomPeriods();
      if (!customPeriods[_currentPeriod]) {
        customPeriods[_currentPeriod] = {};
      }
      customPeriods[_currentPeriod][parts[1]] = value;
      localStorage.setItem('bcy_report_custom_periods', JSON.stringify(customPeriods));
    }
    
    rerender();
  }
  function toast(msg, type) {
    const el = document.createElement("div");
    el.className = "toast " + (type || "");
    el.textContent = msg;
    $("#toast-container").appendChild(el);
    setTimeout(() => el.remove(), 2500);
  }
  function rerender() {
    renderPeriodSelector();
    renderNav();
    renderAnomalies();
    renderSection();
  }
  function changePeriod(period) {
    _currentPeriod = period;
    Store.setCurrentPeriod(period);
    report = Store.load(period);
    rerender();
    toast(`已切换到 ${period}`, "success");
  }
  function renderPeriodSelector() {
    const periods = Store.getPeriods();
    const reportList = Store.getReportList();
    const currentIndex = periods.indexOf(_currentPeriod);
    
    let selectorHtml = `
      <div class="flex items-center gap-3">
        <select id="period-select" onchange="App.changePeriod(this.value)" class="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-1.5 focus:ring-blue-500">
    `;
    periods.forEach(p => {
      const info = Store.getPeriodInfo(p);
      const isCurrent = p === _currentPeriod;
      const reportInfo = reportList.find(r => r.period === p);
      const filledBadge = reportInfo?.is_filled ? ' ✓' : '';
      selectorHtml += `<option value="${p}" ${isCurrent ? 'selected' : ''}>${info?.label || p}${filledBadge}</option>`;
    });
    selectorHtml += `
        </select>
        <div class="text-xs text-gray-500">
          ${currentIndex + 1} / ${periods.length} 期
        </div>
        <button onclick="App.showReportList()" class="text-xs px-2 py-1 bg-blue-100 text-blue-600 rounded-md hover:bg-blue-200 transition-colors">
          📋 周报列表
        </button>
      </div>
    `;
    $("#period-selector").innerHTML = selectorHtml;
  }
  function renderNav() {
    const nav = $("#section-nav");
    nav.innerHTML = Store.GROUPS.map(g => {
      const pages = Store.getPagesByGroup(g.id);
      const single = pages.length === 1;
      if (single) {
        const p = pages[0];
        const filled = countFilled(p.id);
        const total = countTotal(p.id);
        const need = total ? filled < total : false;
        const aiBadge = p.ai ? '<span class="text-[10px] bg-blue-100 text-blue-600 px-1 rounded ml-1">AI</span>' : '';
        return `
          <div class="section-nav-item ${currentSection === p.id ? 'active' : ''}" data-id="${p.id}" onclick="App.goto('${p.id}')">
            <span class="truncate flex-1">${g.title}</span>
            ${aiBadge}
            ${need ? '<span class="badge bg-amber-100 text-amber-700">●</span>' : '<span class="badge bg-emerald-100 text-emerald-700">✓</span>'}
          </div>`;
      }
      const expanded = _expandedGroups.has(g.id);
      const completed = pages.filter(p => countFilled(p.id) >= countTotal(p.id)).length;
      const need = completed < pages.length;
      const aiBadge = pages.some(p => p.ai) ? '<span class="text-[10px] bg-blue-100 text-blue-600 px-1 rounded ml-1">AI</span>' : '';
      return `
        <div class="section-nav-group">
          <div class="section-nav-group-header" onclick="App.toggleGroup('${g.id}')">
            <span class="toggle-icon ${expanded ? 'expanded' : 'collapsed'}">▾</span>
            <span class="truncate flex-1">${g.title}</span>
            ${aiBadge}
            ${need ? '<span class="badge bg-amber-100 text-amber-700">●</span>' : '<span class="badge bg-emerald-100 text-emerald-700">✓</span>'}
          </div>
          <div class="section-nav-children ${expanded ? 'expanded' : ''}">
            ${pages.map(p => {
              const pf = countFilled(p.id);
              const pt = countTotal(p.id);
              const pneed = pt ? pf < pt : false;
              return `
                <div class="section-nav-item sub ${currentSection === p.id ? 'active' : ''}" data-id="${p.id}" onclick="App.goto('${p.id}')">
                  <span class="text-xs text-gray-400 mr-1">${p.id}</span>
                  <span class="truncate">${p.title}</span>
                  ${pneed ? '<span class="badge bg-amber-100 text-amber-700">●</span>' : '<span class="badge bg-emerald-100 text-emerald-700">✓</span>'}
                </div>`;
            }).join("")}
          </div>
        </div>`;
    }).join("");
    setTimeout(() => {
      document.querySelectorAll('.section-nav-children.expanded').forEach(el => {
        el.style.maxHeight = el.scrollHeight + 'px';
      });
    }, 50);
  }
  function toggleGroup(gid) {
    const el = document.querySelector(`.section-nav-group:has(.section-nav-group-header[onclick*="${gid}"]) .section-nav-children`);
    const icon = document.querySelector(`.section-nav-group:has(.section-nav-group-header[onclick*="${gid}"]) .toggle-icon`);
    if (!el) return;
    if (_expandedGroups.has(gid)) {
      _expandedGroups.delete(gid);
      el.style.maxHeight = '0';
      icon.classList.remove('expanded');
      icon.classList.add('collapsed');
    } else {
      _expandedGroups.add(gid);
      el.style.maxHeight = el.scrollHeight + 'px';
      icon.classList.remove('collapsed');
      icon.classList.add('expanded');
    }
  }
  function countFilled(pageId) {
    const page = Store.PAGES.find(p => p.id === pageId);
    if (!page) return 0;
    switch(pageId) {
      case "03": return report.roster?.filter(r => r.name).length || 0;
      case "04": return report.work_done?.filter(w => w.task).length || 0;
      case "05": return report.executive_work?.filter(w => w.task).length || 0;
      case "06": return report.labor_stats?.length > 0 ? 1 : 0;
      case "07": return report.ecc_items?.filter(e => e.seq).length || 0;
      case "08": return report.design_items?.filter(d => d.item).length || 0;
      case "09": return report.plan_items?.filter(p => p.task).length || 0;
      case "10": return report.schedule_items?.filter(s => s.seq).length || 0;
      case "12": return report.coordination?.filter(c => c.content).length || 0;
      default: return 1;
    }
  }
  function countTotal(pageId) {
    const page = Store.PAGES.find(p => p.id === pageId);
    if (!page) return 0;
    switch(pageId) {
      case "03": return 23;
      case "04": return 10;
      case "05": return 4;
      case "06": return 1;
      case "07": return report.ecc_items?.length || 11;
      case "08": return 8;
      case "09": return 21;
      case "10": return report.schedule_items?.length || 11;
      case "12": return 8;
      default: return 1;
    }
  }
  function renderAnomalies() {
    const anomalies = Rules.detectAll(report);
    report.ai_review = report.ai_review || {};
    report.ai_review.anomalies = anomalies;
    report.ai_review.generated_at = new Date().toISOString();
    const banner = $("#anomaly-banner");
    if (!anomalies.length) {
      banner.innerHTML = `
        <div class="mb-4 p-3 rounded-md border border-emerald-200 bg-emerald-50 flex items-center gap-2">
          <span class="text-emerald-600 text-lg">✓</span>
          <span class="text-sm text-emerald-800">AI 已全量出报告，${report.ai_review.evidence?.continued_from_last_week?.length || 0} 项上周未完已续排。无异常，可直接导出。</span>
        </div>`;
      return;
    }
    const grouped = { red: [], yellow: [], blue: [] };
    anomalies.forEach(a => grouped[a.level].push(a));
    const levelLabel = { red: "🔴 阻塞", yellow: "🟡 建议", blue: "🔵 提示" };
    banner.innerHTML = `
      <div class="mb-4 space-y-2">
        ${Object.entries(grouped).filter(([_, arr]) => arr.length).map(([lvl, arr]) => `
          <div>
            <div class="text-xs font-medium text-slate-600 mb-1">${levelLabel[lvl]} (${arr.length})</div>
            ${arr.map(a => `
              <div class="anomaly-card ${lvl} mb-1">
                <span class="level">${lvl.toUpperCase()}</span>
                <div class="flex-1 text-sm text-slate-800">${escapeHtml(a.msg)}</div>
                <button class="text-xs text-blue-600 hover:underline" onclick="App.goto('${a.section}')">→ 查看</button>
              </div>`).join("")}
          </div>`).join("")}
      </div>`;
  }
  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
  function renderSection() {
    const sec = Sections[currentSection];
    if (!sec) return;
    $("#section-content").innerHTML = sec.render(report);
  }
  function goto(id) {
    currentSection = id;
    const page = Store.PAGES.find(p => p.id === id);
    if (page && page.group) {
      _expandedGroups.add(page.group);
    }
    rerender();
    document.getElementById("section-content").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // ====== 初始化 ======
  let _expandedGroups = new Set(['g_ch2', 'g_ch4']);
  function init() {
    report = Store.load(_currentPeriod);
    initPeriods();
    renderNav();
    renderAnomalies();
    renderSection();
    $("#btn-preview").addEventListener("click", openPreview);
    $("#btn-rebuild-ai").addEventListener("click", rebuildAI);
    toast("平台已加载 · W20 周报就绪", "success");
  }
  document.addEventListener("DOMContentLoaded", init);

  // ====== 周期管理 ======
  function initPeriods() {
    _periods = Store.getPeriods();
    renderPeriodSelector();
  }
  function showReportList() {
    const reportList = Store.getReportList();
    let html = `
      <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" id="report-list-overlay" onclick="this.remove()">
        <div class="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4" onclick="event.stopPropagation()">
          <div class="flex items-center justify-between px-6 py-4 border-b">
            <h3 class="font-semibold text-gray-800">📋 周报列表</h3>
            <div class="flex items-center gap-3">
              <span id="batch-select-info" class="text-xs text-gray-500 hidden">已选择 <span id="selected-count">0</span> 项</span>
              <button id="batch-delete-btn" onclick="App.batchDeleteReports()" class="text-xs px-3 py-1 bg-red-100 text-red-600 rounded-md hover:bg-red-200 transition-colors hidden">
                🗑 批量删除
              </button>
              <button onclick="document.getElementById('report-list-overlay').remove()" class="text-gray-400 hover:text-gray-600">✕</button>
            </div>
          </div>
          <div class="max-h-80 overflow-y-auto">
            <div class="px-6 py-2 border-b border-gray-100">
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" id="select-all" onchange="App.toggleSelectAll(this.checked)" class="rounded border-gray-300 text-blue-600">
                <span class="text-xs text-gray-500">全选</span>
              </label>
            </div>
            ${reportList.map((r, i) => {
              const info = Store.getPeriodInfo(r.period);
              const isCurrent = r.period === _currentPeriod;
              const isBasePeriod = r.period === (localStorage.getItem('bcy_base_period') || '2026-W20');
              return `
                <div class="flex items-center gap-3 px-6 py-3 hover:bg-gray-50 cursor-pointer transition-colors ${isCurrent ? 'bg-blue-50' : ''}">
                  <input type="checkbox" class="period-checkbox rounded border-gray-300 text-blue-600" 
                         value="${r.period}" ${isCurrent ? 'disabled' : ''} onchange="App.updateBatchSelectInfo()">
                  <div onclick="App.changePeriod('${r.period}'); document.getElementById('report-list-overlay').remove()" class="flex-1">
                    <div class="font-medium text-gray-800">${info?.label || r.period}</div>
                    <div class="text-xs text-gray-500">${info?.start || ''} ~ ${info?.end || ''}</div>
                  </div>
                  <div class="flex items-center gap-1">
                    ${r.is_filled ? '<span class="text-green-500">✓</span>' : '<span class="text-gray-300">○</span>'}
                    ${isCurrent ? '<span class="text-xs px-2 py-0.5 bg-blue-100 text-blue-600 rounded">当前</span>' : ''}
                    <span class="text-xs px-2 py-0.5 ${isBasePeriod ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-500'} rounded">${isBasePeriod ? '基准' : ''}</span>
                    <button onclick="event.stopPropagation(); App.renameReport('${r.period}')" class="text-xs px-2 py-1 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded">编辑名称</button>
                    <button onclick="event.stopPropagation(); App.editPeriodDates('${r.period}')" class="text-xs px-2 py-1 text-gray-500 hover:text-green-600 hover:bg-green-50 rounded">编辑日期</button>
                    <button onclick="event.stopPropagation(); App.setAsBasePeriod('${r.period}')" class="text-xs px-2 py-1 text-gray-500 hover:text-yellow-600 hover:bg-yellow-50 rounded">设为基准</button>
                    ${!isCurrent ? `<button onclick="event.stopPropagation(); App.deleteReport('${r.period}')" class="text-xs px-2 py-1 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded">删除</button>` : ''}
                  </div>
                </div>
              `;
            }).join("")}
          </div>
          <div class="px-6 py-3 border-t flex justify-end gap-2">
            <button onclick="App.showGeneratePeriodsDialog();" class="text-sm px-4 py-2 bg-purple-100 text-purple-600 rounded-lg hover:bg-purple-200 transition-colors">
              ⚡ 生成周期
            </button>
            <button onclick="document.getElementById('report-list-overlay').remove()" class="text-sm px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors">
              取消
            </button>
            <button onclick="App.addNewPeriod(); document.getElementById('report-list-overlay').remove()" class="text-sm px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
              + 新建周报
            </button>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
  }
  function toggleSelectAll(checked) {
    const checkboxes = document.querySelectorAll('.period-checkbox:not(:disabled)');
    checkboxes.forEach(cb => cb.checked = checked);
    updateBatchSelectInfo();
  }
  function updateBatchSelectInfo() {
    const checkedBoxes = document.querySelectorAll('.period-checkbox:checked');
    const count = checkedBoxes.length;
    const infoEl = document.getElementById('batch-select-info');
    const btnEl = document.getElementById('batch-delete-btn');
    const countEl = document.getElementById('selected-count');
    
    if (count > 0) {
      infoEl.classList.remove('hidden');
      btnEl.classList.remove('hidden');
      countEl.textContent = count;
    } else {
      infoEl.classList.add('hidden');
      btnEl.classList.add('hidden');
    }
  }
  function batchDeleteReports() {
    const checkedBoxes = document.querySelectorAll('.period-checkbox:checked');
    const periods = Array.from(checkedBoxes).map(cb => cb.value);
    
    if (periods.length === 0) {
      toast("请先选择要删除的周报", "error");
      return;
    }
    
    const confirmHtml = `
      <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" id="batch-delete-confirm">
        <div class="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4" onclick="event.stopPropagation()">
          <div class="flex flex-col items-center p-6">
            <div class="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mb-4">
              <span class="text-3xl">🗑️</span>
            </div>
            <h3 class="text-lg font-semibold text-gray-800 mb-2">批量删除确认</h3>
            <p class="text-sm text-gray-600 text-center mb-6">
              确定要删除选中的 <span class="font-medium">${periods.length}</span> 个周报吗？<br/>
              此操作不可恢复，所有数据将被永久删除。
            </p>
            <div class="flex gap-3 w-full">
              <button onclick="document.getElementById('batch-delete-confirm').remove()" class="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors">
                取消
              </button>
              <button onclick="App.confirmBatchDelete()" class="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors">
                确认删除
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', confirmHtml);
  }
  function confirmBatchDelete() {
    const checkedBoxes = document.querySelectorAll('.period-checkbox:checked');
    const periods = Array.from(checkedBoxes).map(cb => cb.value);
    
    let deletedCount = 0;
    const allPeriods = Store.getPeriods();
    const newPeriods = allPeriods.filter(p => {
      if (periods.includes(p)) {
        localStorage.removeItem("bcy_report_" + p);
        deletedCount++;
        return false;
      }
      return true;
    });
    localStorage.setItem("bcy_report_periods", JSON.stringify(newPeriods));
    
    document.getElementById('batch-delete-confirm').remove();
    if (document.getElementById('report-list-overlay')) {
      document.getElementById('report-list-overlay').remove();
    }
    toast(`已成功删除 ${deletedCount} 个周报`, "success");
    rerender();
  }
  function deleteReport(period) {
    if (period === _currentPeriod) {
      toast("不能删除当前正在编辑的周报", "error");
      return;
    }
    const info = Store.getPeriodInfo(period);
    const confirmHtml = `
      <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" id="delete-confirm-overlay">
        <div class="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4" onclick="event.stopPropagation()">
          <div class="flex flex-col items-center p-6">
            <div class="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mb-4">
              <span class="text-3xl">⚠️</span>
            </div>
            <h3 class="text-lg font-semibold text-gray-800 mb-2">确认删除</h3>
            <p class="text-sm text-gray-600 text-center mb-6">
              确定要删除周报 <span class="font-medium">${info?.label || period}</span> 吗？<br/>
              此操作不可恢复，所有数据将被永久删除。
            </p>
            <div class="flex gap-3 w-full">
              <button onclick="document.getElementById('delete-confirm-overlay').remove()" class="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors">
                取消
              </button>
              <button onclick="App.confirmDeleteReport('${period}')" class="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors">
                确认删除
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', confirmHtml);
  }
  function confirmDeleteReport(period) {
    const periods = Store.getPeriods();
    const newPeriods = periods.filter(p => p !== period);
    localStorage.setItem("bcy_report_periods", JSON.stringify(newPeriods));
    localStorage.removeItem("bcy_report_" + period);
    document.getElementById('delete-confirm-overlay').remove();
    if (document.getElementById('report-list-overlay')) {
      document.getElementById('report-list-overlay').remove();
    }
    toast(`周报 ${period} 已删除`, "success");
    rerender();
  }
  function renameReport(period) {
    const info = Store.getPeriodInfo(period);
    const renameHtml = `
      <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" id="rename-overlay">
        <div class="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4" onclick="event.stopPropagation()">
          <div class="p-6">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-lg font-semibold text-gray-800">重命名周报</h3>
              <button onclick="document.getElementById('rename-overlay').remove()" class="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div class="space-y-3">
              <label class="block text-sm font-medium text-gray-600">周报名称</label>
              <input type="text" id="rename-input" value="${info?.label || period}" class="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="请输入周报名称">
            </div>
            <div class="flex gap-3 mt-6">
              <button onclick="document.getElementById('rename-overlay').remove()" class="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors">
                取消
              </button>
              <button onclick="App.confirmRenameReport('${period}')" class="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                保存
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', renameHtml);
    setTimeout(() => {
      document.getElementById('rename-input').focus();
    }, 100);
  }
  function confirmRenameReport(period) {
    const newName = document.getElementById('rename-input').value.trim();
    if (!newName) {
      toast("请输入周报名称", "error");
      return;
    }
    const customPeriods = Store.getCustomPeriods();
    if (customPeriods[period]) {
      customPeriods[period].label = newName;
      localStorage.setItem('bcy_report_custom_periods', JSON.stringify(customPeriods));
    }
    document.getElementById('rename-overlay').remove();
    toast(`周报已重命名为：${newName}`, "success");
    rerender();
  }
  function editPeriodDates(period) {
    const info = Store.getPeriodInfo(period);
    const editHtml = `
      <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" id="edit-dates-overlay">
        <div class="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4" onclick="event.stopPropagation()">
          <div class="p-6">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-lg font-semibold text-gray-800">编辑周期日期</h3>
              <button onclick="document.getElementById('edit-dates-overlay').remove()" class="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div class="space-y-4">
              <div>
                <label class="block text-sm font-medium text-gray-600 mb-1">开始日期</label>
                <input type="date" id="edit-start-date" value="${info?.start || ''}" class="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-600 mb-1">结束日期</label>
                <input type="date" id="edit-end-date" value="${info?.end || ''}" class="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
              </div>
            </div>
            <div class="flex gap-3 mt-6">
              <button onclick="document.getElementById('edit-dates-overlay').remove()" class="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors">
                取消
              </button>
              <button onclick="App.confirmEditDates('${period}')" class="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                保存
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', editHtml);
  }
  function confirmEditDates(period) {
    const startDate = document.getElementById('edit-start-date').value;
    const endDate = document.getElementById('edit-end-date').value;
    
    if (!startDate || !endDate) {
      toast("请填写完整的日期", "error");
      return;
    }
    
    if (startDate > endDate) {
      toast("开始日期不能大于结束日期", "error");
      return;
    }
    
    const customPeriods = Store.getCustomPeriods();
    if (!customPeriods[period]) {
      customPeriods[period] = {};
    }
    customPeriods[period].start = startDate;
    customPeriods[period].end = endDate;
    localStorage.setItem('bcy_report_custom_periods', JSON.stringify(customPeriods));
    
    document.getElementById('edit-dates-overlay').remove();
    toast("周期日期已更新", "success");
    rerender();
  }
  function setAsBasePeriod(period) {
    localStorage.setItem('bcy_base_period', period);
    toast(`已将 ${period} 设为基准周期`, "success");
    rerender();
  }
  function showGeneratePeriodsDialog() {
    const basePeriod = localStorage.getItem('bcy_base_period') || '2026-W20';
    const baseInfo = Store.getPeriodInfo(basePeriod);
    
    const dialogHtml = `
      <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" id="generate-periods-overlay">
        <div class="bg-white rounded-xl shadow-xl w-full max-w-md mx-4" onclick="event.stopPropagation()">
          <div class="p-6">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-lg font-semibold text-gray-800">⚡ 生成周期</h3>
              <button onclick="document.getElementById('generate-periods-overlay').remove()" class="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div class="space-y-4">
              <div class="bg-purple-50 rounded-md p-3">
                <div class="text-xs font-medium text-purple-700 mb-2">📅 基准周期</div>
                <div class="text-sm text-gray-700">${baseInfo?.label || basePeriod} (${baseInfo?.start || ''} ~ ${baseInfo?.end || ''})</div>
              </div>
              
              <div>
                <label class="block text-sm font-medium text-gray-600 mb-1">第1周开始日期</label>
                <input type="date" id="gen-week1-start" value="${baseInfo?.start || '2026-05-12'}" 
                       class="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500">
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-600 mb-1">第1周结束日期</label>
                <input type="date" id="gen-week1-end" value="${baseInfo?.end || '2026-05-18'}" 
                       class="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500">
              </div>
              
              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label class="block text-sm font-medium text-gray-600 mb-1">🔄 周期间隔</label>
                  <select id="gen-period-interval" class="w-full px-3 py-2 border border-gray-200 rounded-lg">
                    <option value="7">7天（每周）</option>
                    <option value="14">14天（双周）</option>
                  </select>
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-600 mb-1">📋 生成期数</label>
                  <select id="gen-period-count" class="w-full px-3 py-2 border border-gray-200 rounded-lg">
                    <option value="4">4期（1个月）</option>
                    <option value="8">8期（2个月）</option>
                    <option value="12">12期（3个月）</option>
                  </select>
                </div>
              </div>
            </div>
            <div class="flex gap-3 mt-6">
              <button onclick="document.getElementById('generate-periods-overlay').remove()" class="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors">
                取消
              </button>
              <button onclick="App.executeGenerateFromDialog()" class="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors">
                开始生成
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', dialogHtml);
  }
  function executeGenerateFromDialog() {
    const week1Start = document.getElementById('gen-week1-start')?.value;
    const week1End = document.getElementById('gen-week1-end')?.value;
    const interval = parseInt(document.getElementById('gen-period-interval')?.value || '7');
    const count = parseInt(document.getElementById('gen-period-count')?.value || '4');
    
    if (!week1Start || !week1End) {
      toast("请设置第1周的开始和结束日期", "error");
      return;
    }
    
    localStorage.setItem('bcy_week1_config', JSON.stringify({
      start: week1Start,
      end: week1End
    }));
    
    const startDate = new Date(week1Start);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(week1End);
    endDate.setHours(0, 0, 0, 0);
    const periodDuration = (endDate - startDate) / (1000 * 60 * 60 * 24);
    
    const newPeriods = [];
    for (let i = 0; i < count; i++) {
      const periodStart = new Date(startDate);
      periodStart.setDate(startDate.getDate() + (i * interval));
      const periodEnd = new Date(periodStart);
      periodEnd.setDate(periodStart.getDate() + periodDuration);
      
      const year = periodStart.getFullYear();
      const weekNum = getWeekNumber(periodStart);
      const periodKey = `${year}-W${String(weekNum).padStart(2, '0')}`;
      
      newPeriods.push({
        key: periodKey,
        weekNum,
        start: toLocalDateString(periodStart),
        end: toLocalDateString(periodEnd),
        label: `第${weekNum}周`
      });
    }

    document.getElementById('generate-periods-overlay').remove();
    document.getElementById('report-list-overlay').remove();
    
    const existingPeriods = Store.getPeriods();
    const customPeriods = Store.getCustomPeriods();
    const conflicts = [];
    
    newPeriods.forEach(newP => {
      if (existingPeriods.includes(newP.key)) {
        const existing = customPeriods[newP.key];
        if (existing && (existing.start !== newP.start || existing.end !== newP.end)) {
          conflicts.push({
            newPeriod: newP,
            existing: existing
          });
        }
      }
    });
    
    if (conflicts.length > 0) {
      showConflictDialog(conflicts, newPeriods);
    } else {
      executeGeneratePeriods(newPeriods, existingPeriods, customPeriods);
    }
  }
  function addNewPeriod() {
    const periods = Store.getPeriods();
    const lastPeriod = periods[periods.length - 1];
    const match = lastPeriod.match(/(\d+)-W(\d+)/);
    if (!match) {
      toast("无法解析周期格式", "error");
      return;
    }
    
    const lastPeriodInfo = Store.getPeriodInfo(lastPeriod);
    const interval = 7;
    
    const startDate = new Date(lastPeriodInfo.end);
    startDate.setDate(startDate.getDate() + 1);
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + interval - 1);
    
    let year = parseInt(match[1]);
    let week = parseInt(match[2]) + 1;
    if (week > 52) {
      year++;
      week = 1;
    }
    const newPeriod = `${year}-W${String(week).padStart(2, '0')}`;
    
    Store.addPeriod(newPeriod, {
      start: toLocalDateString(startDate),
      end: toLocalDateString(endDate),
      label: `第${week}周`
    });
    
    changePeriod(newPeriod);
    toast(`已创建新周报 ${newPeriod}`, "success");
  }
  function toggleAutoFillPeriod(enabled) {
    Sections["01"]._autoFillEnabled = enabled;
    rerender();
    if (enabled) {
      toast("已开启自动填充周期", "success");
    }
  }
  function updatePeriodInterval(value) {
    _periodInterval = parseInt(value);
    toast(`周期间隔已设置为 ${_periodInterval} 天`, "success");
  }
  function updatePeriodCount(value) {
    _periodCount = parseInt(value);
    toast(`预填充期数已设置为 ${_periodCount} 期`, "success");
  }
  function generatePeriods() {
    const week1Start = document.getElementById('week1-start')?.value;
    const week1End = document.getElementById('week1-end')?.value;
    const interval = parseInt(document.getElementById('period-interval')?.value || '7');
    const count = parseInt(document.getElementById('period-count')?.value || '4');
    
    if (!week1Start || !week1End) {
      toast("请设置第1周的开始和结束日期", "error");
      return;
    }
    
    localStorage.setItem('bcy_week1_config', JSON.stringify({
      start: week1Start,
      end: week1End
    }));
    
    const startDate = new Date(week1Start);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(week1End);
    endDate.setHours(0, 0, 0, 0);
    const periodDuration = (endDate - startDate) / (1000 * 60 * 60 * 24);
    
    const newPeriods = [];
    for (let i = 0; i < count; i++) {
      const periodStart = new Date(startDate);
      periodStart.setDate(startDate.getDate() + (i * interval));
      const periodEnd = new Date(periodStart);
      periodEnd.setDate(periodStart.getDate() + periodDuration);
      
      const year = periodStart.getFullYear();
      const weekNum = getWeekNumber(periodStart);
      const periodKey = `${year}-W${String(weekNum).padStart(2, '0')}`;
      
      newPeriods.push({
        key: periodKey,
        weekNum,
        start: toLocalDateString(periodStart),
        end: toLocalDateString(periodEnd),
        label: `第${weekNum}周`
      });
    }

    const existingPeriods = Store.getPeriods();
    const customPeriods = Store.getCustomPeriods();
    const conflicts = [];
    
    newPeriods.forEach(newP => {
      if (existingPeriods.includes(newP.key)) {
        const existing = customPeriods[newP.key];
        if (existing && (existing.start !== newP.start || existing.end !== newP.end)) {
          conflicts.push({
            newPeriod: newP,
            existing: existing
          });
        }
      }
    });
    
    if (conflicts.length > 0) {
      showConflictDialog(conflicts, newPeriods);
      return;
    }
    
    executeGeneratePeriods(newPeriods, existingPeriods, customPeriods);
  }
  
  function executeGeneratePeriods(newPeriods, existingPeriods, customPeriods) {
    let generatedCount = 0;
    let updatedCount = 0;
    
    newPeriods.forEach(p => {
      const exists = existingPeriods.includes(p.key);
      
      if (!exists) {
        Store.addPeriod(p.key, { start: p.start, end: p.end, label: p.label });
        generatedCount++;
      } else {
        customPeriods[p.key] = { start: p.start, end: p.end, label: p.label };
        updatedCount++;
      }
    });
    
    if (updatedCount > 0) {
      localStorage.setItem('bcy_report_custom_periods', JSON.stringify(customPeriods));
    }
    
    rerender();
    
    if (generatedCount > 0 && updatedCount > 0) {
      toast(`已生成 ${generatedCount} 个新周期，更新 ${updatedCount} 个现有周期`, "success");
    } else if (generatedCount > 0) {
      toast(`已生成 ${generatedCount} 个新周期`, "success");
    } else if (updatedCount > 0) {
      toast(`已更新 ${updatedCount} 个现有周期的日期配置`, "success");
    } else {
      toast("没有需要生成或更新的周期", "info");
    }
  }
  
  function showConflictDialog(conflicts, newPeriods) {
    let conflictHtml = '';
    conflicts.forEach((c, i) => {
      conflictHtml += `
        <div class="border-b border-gray-100 py-3 last:border-0">
          <div class="text-sm font-medium text-gray-800 mb-1">${c.newPeriod.label}</div>
          <div class="flex items-center gap-4 text-xs">
            <span class="text-gray-500">
              <span class="text-red-500">新设置:</span> ${c.newPeriod.start} ~ ${c.newPeriod.end}
            </span>
            <span class="text-gray-400">→</span>
            <span class="text-gray-500">
              <span class="text-green-500">已存在:</span> ${c.existing.start} ~ ${c.existing.end}
            </span>
          </div>
        </div>
      `;
    });
    
    const html = `
      <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" id="conflict-dialog">
        <div class="bg-white rounded-xl shadow-xl w-full max-w-md mx-4" onclick="event.stopPropagation()">
          <div class="flex items-center justify-between px-6 py-4 border-b">
            <h3 class="font-semibold text-gray-800">⚠️ 周期冲突</h3>
            <button onclick="document.getElementById('conflict-dialog').remove()" class="text-gray-400 hover:text-gray-600">✕</button>
          </div>
          <div class="p-6">
            <p class="text-sm text-gray-600 mb-4">
              检测到 <span class="font-medium">${conflicts.length}</span> 个周期与现有配置冲突，请问如何处理？
            </p>
            <div class="mb-6">
              ${conflictHtml}
            </div>
            <div class="space-y-2">
              <button onclick="App.handleConflict('overwrite')" class="w-full px-4 py-2.5 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors">
                🔄 以新设置为准（覆盖现有）
              </button>
              <button onclick="App.handleConflict('keep')" class="w-full px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors">
                ✋ 保留现有配置
              </button>
              <button onclick="App.handleConflict('both')" class="w-full px-4 py-2.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors">
                📊 两者均保留（创建新版本）
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
    window._pendingPeriods = newPeriods;
  }
  
  function handleConflict(action) {
    const newPeriods = window._pendingPeriods || [];
    const existingPeriods = Store.getPeriods();
    const customPeriods = Store.getCustomPeriods();
    
    document.getElementById('conflict-dialog').remove();
    delete window._pendingPeriods;
    
    let generatedCount = 0;
    let updatedCount = 0;
    
    newPeriods.forEach(p => {
      const exists = existingPeriods.includes(p.key);
      
      if (action === 'overwrite') {
        if (!exists) {
          Store.addPeriod(p.key, { start: p.start, end: p.end, label: p.label });
          generatedCount++;
        } else {
          customPeriods[p.key] = { start: p.start, end: p.end, label: p.label };
          updatedCount++;
        }
      } else if (action === 'keep') {
        if (!exists) {
          Store.addPeriod(p.key, { start: p.start, end: p.end, label: p.label });
          generatedCount++;
        }
      } else if (action === 'both') {
        let version = 1;
        let newKey = p.key;
        while (existingPeriods.includes(newKey)) {
          newKey = `${p.key}-v${version}`;
          version++;
        }
        Store.addPeriod(newKey, { start: p.start, end: p.end, label: `${p.label} (v${version})` });
        generatedCount++;
      }
    });
    
    if (action !== 'both' && updatedCount > 0) {
      localStorage.setItem('bcy_report_custom_periods', JSON.stringify(customPeriods));
    }
    
    rerender();
    
    if (action === 'overwrite') {
      toast(`已生成 ${generatedCount} 个新周期，覆盖 ${updatedCount} 个现有周期`, "success");
    } else if (action === 'keep') {
      toast(`已生成 ${generatedCount} 个新周期，跳过 ${newPeriods.length - generatedCount} 个已存在的周期`, "success");
    } else if (action === 'both') {
      toast(`已创建 ${generatedCount} 个新周期版本`, "success");
    }
  }
  
  function getWeekNumber(date) {
    const startOfYear = new Date(date.getFullYear(), 0, 1);
    const days = Math.floor((date - startOfYear) / (1000 * 60 * 60 * 24));
    return Math.ceil((days + startOfYear.getDay() + 1) / 7);
  }
  function autoFillPeriod() {
    const reportDate = new Date(report.period.report_date);
    if (isNaN(reportDate.getTime())) {
      toast("请先选择周报日期", "error");
      return;
    }
    const dayOfWeek = reportDate.getDay();
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const monday = new Date(reportDate);
    monday.setDate(reportDate.getDate() - daysToMonday);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    report.period.start = toLocalDateString(monday);
    report.period.end = toLocalDateString(sunday);
    Store.save(report, _currentPeriod);
    rerender();
    toast(`✅ 周期已自动填充: ${report.period.start} ~ ${report.period.end}`, "success");
  }
  function openPreview() {
    window.open("preview.html", "_blank");
  }
  function rebuildAI() {
    toast("🤖 AI 正在重新分析数据...", "success");
    renderAnomalies();
    toast("🤖 AI 草稿已重新生成", "success");
  }

  // ====== 花名册管理 ======
  function updateRoster(index, field, value) {
    report.roster[index][field] = value;
    Store.save(report, _currentPeriod);
  }
  function markLeave(index) {
    report.roster[index].delta = 'leave';
    report.roster[index].present = false;
    Store.save(report, _currentPeriod);
    rerender();
    toast("已标记离职", "success");
  }
  function addRoster() {
    const newItem = {
      seq: report.roster.length + 1,
      name: '',
      role: '',
      phone: '',
      present: true,
      delta: 'new'
    };
    report.roster.push(newItem);
    Store.save(report, _currentPeriod);
    rerender();
  }
  function importRoster() {
    toast("从花名册导入功能开发中", "info");
  }
  function aiRosterDiff() {
    toast("AI 比对上周花名册功能开发中", "info");
  }

  // ====== 工作完成管理 ======
  function updateWorkDone(index, field, value) {
    report.work_done[index][field] = value;
    Store.save(report, _currentPeriod);
  }
  function removeWorkDone(index) {
    report.work_done.splice(index, 1);
    report.work_done.forEach((t, i) => t.seq = i + 1);
    Store.save(report, _currentPeriod);
    rerender();
  }
  function addWorkDone() {
    const newItem = {
      seq: report.work_done.length + 1,
      area: '',
      task: '',
      progress: '0%',
      owner: '',
      deadline: '',
      source: 'form'
    };
    report.work_done.push(newItem);
    Store.save(report, _currentPeriod);
    rerender();
  }
  function s04ImportFromLastWeek() {
    toast("续排上周未完功能开发中", "info");
  }
  function activateS04Tab(tab) {
    Sections["04"]._activeTab = tab;
    rerender();
  }
  function s04StartVoice() {
    toast("语音录入功能开发中", "info");
  }
  function s04ExtractPaste() {
    toast("AI 抽取功能开发中", "info");
  }
  function s04AcceptDraft(index) {
    const draft = Sections["04"]._drafts[index];
    if (draft) {
      report.work_done.push({ ...draft, seq: report.work_done.length + 1 });
      Sections["04"]._drafts.splice(index, 1);
      Store.save(report, _currentPeriod);
      rerender();
    }
  }
  function s04AcceptAllDrafts() {
    Sections["04"]._drafts.forEach(draft => {
      report.work_done.push({ ...draft, seq: report.work_done.length + 1 });
    });
    Sections["04"]._drafts = [];
    Store.save(report, _currentPeriod);
    rerender();
    toast("已接受所有草稿", "success");
  }
  function s04ClearDrafts() {
    Sections["04"]._drafts = [];
    rerender();
    toast("已清空草稿", "info");
  }
  function s04AddFormRow() {
    const area = document.getElementById('s04-form-area')?.value || '';
    const task = document.getElementById('s04-form-task')?.value || '';
    const progress = document.getElementById('s04-form-progress')?.value || '0%';
    const owner = document.getElementById('s04-form-owner')?.value || '';
    const deadline = document.getElementById('s04-form-deadline')?.value || '';
    if (!task) {
      toast("请填写事项", "error");
      return;
    }
    report.work_done.push({
      seq: report.work_done.length + 1,
      area,
      task,
      progress,
      owner,
      deadline,
      source: 'form'
    });
    Store.save(report, _currentPeriod);
    document.getElementById('s04-form-task').value = '';
    rerender();
  }
  function s04PickFile() {
    document.getElementById('s04-file-input')?.click();
  }
  function s04HandleFile(file) {
    if (file) {
      document.getElementById('s04-file-name').textContent = `已选择: ${file.name}`;
      toast("文件上传功能开发中", "info");
    }
  }

  // ====== 照片管理 ======
  function uploadPhotos() {
    toast("照片上传功能开发中", "info");
  }
  function aiGroupPhotos() {
    toast("AI 照片分组功能开发中", "info");
  }

  // ====== 劳动力管理 ======
  function updateLabor(index, field, value) {
    report.labor_stats[index][field] = value;
    Store.save(report, _currentPeriod);
  }
  function aiRecomputeLabor() {
    toast("AI 重新计算劳动力功能开发中", "info");
  }

  // ====== ECC管理 ======
  function updateEcc(index, field, value) {
    report.ecc_items[index][field] = value;
    Store.save(report, _currentPeriod);
  }
  function aiParseEccScreenshot() {
    toast("AI 解析 ECC 截图功能开发中", "info");
  }
  function uploadEccScreenshot() {
    toast("上传 ECC 截图功能开发中", "info");
  }

  // ====== 图纸深化管理 ======
  function updateDesign(index, field, value) {
    report.design_items[index][field] = value;
    Store.save(report, _currentPeriod);
  }
  function removeDesign(index) {
    report.design_items.splice(index, 1);
    Store.save(report, _currentPeriod);
    rerender();
  }

  // ====== 图纸深化 AI ======
  function activateS08Tab(tab) {
    Sections["08"]._activeTab = tab;
    rerender();
  }
  function s08StartVoice() {
    toast("语音录入功能开发中", "info");
  }
  function s08ExtractPaste() {
    toast("AI 抽取功能开发中", "info");
  }
  function s08AcceptDraft(index) {
    const draft = Sections["08"]._drafts[index];
    if (draft) {
      report.design_items.push({ ...draft });
      Sections["08"]._drafts.splice(index, 1);
      Store.save(report, _currentPeriod);
      rerender();
    }
  }
  function s08AcceptAll() {
    Sections["08"]._drafts.forEach(draft => {
      report.design_items.push({ ...draft });
    });
    Sections["08"]._drafts = [];
    Store.save(report, _currentPeriod);
    rerender();
  }
  function s08ClearDrafts() {
    Sections["08"]._drafts = [];
    rerender();
  }
  function s08AddForm() {
    toast("添加图纸功能开发中", "info");
  }

  // ====== 下周计划管理 ======
  function activateS09Tab(tab) {
    Sections["09"]._activeTab = tab;
    rerender();
  }
  function s09AIDraft() {
    toast("AI 生成计划草稿功能开发中", "info");
  }
  function s09StartVoice() {
    toast("语音录入功能开发中", "info");
  }
  function s09ExtractPaste() {
    toast("AI 抽取功能开发中", "info");
  }
  function s09AcceptDraft(index) {
    const draft = Sections["09"]._drafts[index];
    if (draft) {
      report.plan_items.push({ ...draft });
      Sections["09"]._drafts.splice(index, 1);
      Store.save(report, _currentPeriod);
      rerender();
    }
  }
  function s09AcceptAll() {
    Sections["09"]._drafts.forEach(draft => {
      report.plan_items.push({ ...draft });
    });
    Sections["09"]._drafts = [];
    Store.save(report, _currentPeriod);
    rerender();
  }
  function s09ClearDrafts() {
    Sections["09"]._drafts = [];
    rerender();
  }
  function updatePlan(index, field, value) {
    report.plan_items[index][field] = value;
    Store.save(report, _currentPeriod);
  }
  function updatePlanDays(index, days) {
    report.plan_items[index].days = days;
    Store.save(report, _currentPeriod);
    rerender();
  }
  function togglePlanCell(index, dayIndex) {
    const days = report.plan_items[index].days || [];
    const idx = days.indexOf(dayIndex);
    if (idx > -1) {
      days.splice(idx, 1);
    } else {
      days.push(dayIndex);
      days.sort((a, b) => a - b);
    }
    report.plan_items[index].days = days;
    Store.save(report, _currentPeriod);
    rerender();
  }
  function removePlan(index) {
    report.plan_items.splice(index, 1);
    Store.save(report, _currentPeriod);
    rerender();
  }

  // ====== 施工进度管理 ======
  function uploadFloorPlans() {
    toast("上传楼层平面图功能开发中", "info");
  }
  function enterAnnotateMode() {
    toast("标注模式功能开发中", "info");
  }
  function aiExtendSchedule() {
    toast("AI 扩展进度计划功能开发中", "info");
  }

  // ====== 协调事宜管理 ======
  function updateCoord(index, field, value) {
    report.coordination[index][field] = value;
    Store.save(report, _currentPeriod);
  }
  function addCoord() {
    report.coordination.push({
      content: '',
      owner: '',
      deadline: '',
      status: 'pending'
    });
    Store.save(report, _currentPeriod);
    rerender();
  }

  // ====== 导出 App 全局 ======
  global.App = {
    goto, toggleGroup, autoFillPeriod,
    changePeriod, showReportList, addNewPeriod, deleteReport, confirmDeleteReport, renameReport, confirmRenameReport,
    editPeriodDates, confirmEditDates, setAsBasePeriod,
    showGeneratePeriodsDialog, executeGenerateFromDialog,
    toggleSelectAll, updateBatchSelectInfo, batchDeleteReports, confirmBatchDelete,
    toggleAutoFillPeriod, updatePeriodInterval, updatePeriodCount, generatePeriods, handleConflict,
    updateField, updateRoster, markLeave, addRoster, importRoster, aiRosterDiff,
    updateWorkDone, removeWorkDone, addWorkDone, s04ImportFromLastWeek,
    activateS04Tab, s04StartVoice, s04ExtractPaste, s04AcceptDraft, s04AcceptAllDrafts, s04ClearDrafts, s04AddFormRow, s04PickFile, s04HandleFile,
    uploadPhotos, aiGroupPhotos,
    updateLabor, aiRecomputeLabor,
    updateEcc, aiParseEccScreenshot, uploadEccScreenshot,
    updateDesign, removeDesign,
    activateS08Tab, s08StartVoice, s08ExtractPaste, s08AcceptDraft, s08AcceptAll, s08ClearDrafts, s08AddForm,
    activateS09Tab, s09AIDraft, s09StartVoice, s09ExtractPaste, s09AcceptDraft, s09AcceptAll, s09ClearDrafts,
    updatePlan, updatePlanDays, togglePlanCell, removePlan,
    uploadFloorPlans, enterAnnotateMode, aiExtendSchedule,
    updateCoord, addCoord,
    rebuildAI
  };
})(window);