// platform/js/report_list.js
// 周报列表 modal + 配套操作 (从 v3 app.js 还原, v5.2 适配)
// 你调整过的版本: 含全选/批量删除/基准周期/编辑名称/编辑日期/生成周期/新建周报
(function (global) {
  // 1. showReportList - 主 modal
function showReportList() {
    // 读取/写入当前 label 格式 (standard | custom)
    let labelFormat = localStorage.getItem('bcy_label_format') || 'custom';
    const reportList = global.Store.getReportList(labelFormat);
    let html = `
      <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" id="report-list-overlay" onclick="this.remove()">
        <div class="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4" onclick="event.stopPropagation()">
          <div class="flex items-center justify-between px-6 py-4 border-b">
            <h3 class="font-semibold text-gray-800">📋 周报列表</h3>
            <div class="flex items-center gap-1 mr-2 px-1 py-0.5 rounded border border-slate-200 bg-slate-50">
              <button id="lbl-std" onclick="App.toggleLabelFormat('standard')" class="text-xs px-2 py-0.5 rounded ${labelFormat === 'standard' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'}">标准周</button>
              <button id="lbl-cus" onclick="App.toggleLabelFormat('custom')" class="text-xs px-2 py-0.5 rounded ${labelFormat === 'custom' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'}">自定义周</button>
            </div>
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
              const info = global.Store.getPeriodInfo(r.period, labelFormat);
              const isCurrent = r.period === window._currentPeriod_get();
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

  // 1.5 confirmBatchDelete - 确认批量删除
function confirmBatchDelete() {
    const checkedBoxes = document.querySelectorAll('.period-checkbox:checked');
    const periods = Array.from(checkedBoxes).map(cb => cb.value);
    
    let deletedCount = 0;
    const allPeriods = global.Store.getPeriods();
    const newPeriods = allPeriods.filter(p => {
      if (periods.includes(p)) {
        localStorage.removeItem("bcy_report_" + p);
        deletedCount++;
        return false;
      }
      return true;
    });
    localStorage.setItem("bcy_periods", JSON.stringify(newPeriods));
    
    document.getElementById('batch-delete-confirm').remove();
    if (document.getElementById('report-list-overlay')) {
      document.getElementById('report-list-overlay').remove();
      showReportList();
    }
    window._toast(`已成功删除 ${deletedCount} 个周报`, "success");
    window._rerender();
  }

  // 1.6 confirmDeleteReport - 确认删除单条
function confirmDeleteReport(period) {
    const periods = global.Store.getPeriods();
    const newPeriods = periods.filter(p => p !== period);
    localStorage.setItem("bcy_periods", JSON.stringify(newPeriods));
    localStorage.removeItem("bcy_report_" + period);
    document.getElementById('delete-confirm-overlay').remove();
    if (document.getElementById('report-list-overlay')) {
      document.getElementById('report-list-overlay').remove();
      showReportList();
    }
    window._toast(`周报 ${period} 已删除`, "success");
    window._rerender();
  }

  // 1.7 confirmRenameReport - 确认重命名
function confirmRenameReport(period) {
    const newName = document.getElementById('rename-input').value.trim();
    if (!newName) {
      window._toast("请输入周报名称", "error");
      return;
    }
    const customPeriods = global.Store.getCustomPeriods();
    if (customPeriods[period]) {
      customPeriods[period].label = newName;
      localStorage.setItem('bcy_report_custom_periods', JSON.stringify(customPeriods));
    }
    document.getElementById('rename-overlay').remove();
    // 周报列表 modal 还在 -> 实时刷新它
    if (document.getElementById('report-list-overlay')) {
      document.getElementById('report-list-overlay').remove();
      showReportList();
    }
    window._toast(`周报已重命名为：${newName}`, "success");
    window._rerender();
  }

  // 1.8 confirmEditDates - 确认编辑日期
function confirmEditDates(period) {
    const startDate = document.getElementById('edit-start-date').value;
    const endDate = document.getElementById('edit-end-date').value;
    
    if (!startDate || !endDate) {
      window._toast("请填写完整的日期", "error");
      return;
    }
    
    if (startDate > endDate) {
      window._toast("开始日期不能大于结束日期", "error");
      return;
    }
    
    const customPeriods = global.Store.getCustomPeriods();
    if (!customPeriods[period]) {
      customPeriods[period] = {};
    }
    customPeriods[period].start = startDate;
    customPeriods[period].end = endDate;
    localStorage.setItem('bcy_report_custom_periods', JSON.stringify(customPeriods));
    
    document.getElementById('edit-dates-overlay').remove();
    // 周报列表 modal 还在 -> 实时刷新它
    if (document.getElementById('report-list-overlay')) {
      document.getElementById('report-list-overlay').remove();
      showReportList();
    }
    window._toast("周期日期已更新", "success");
    window._rerender();
  }

  // 2. batchDeleteReports - 批量删除
function batchDeleteReports() {
    const checkedBoxes = document.querySelectorAll('.period-checkbox:checked');
    const periods = Array.from(checkedBoxes).map(cb => cb.value);
    
    if (periods.length === 0) {
      window._toast("请先选择要删除的周报", "error");
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

  // 3. toggleSelectAll - 全选
function toggleSelectAll(checked) {
    const checkboxes = document.querySelectorAll('.period-checkbox:not(:disabled)');
    checkboxes.forEach(cb => cb.checked = checked);
    updateBatchSelectInfo();
  }

  // 4. updateBatchSelectInfo - 更新选中数
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

  // 5. renameReport - 重命名周报
function renameReport(period) {
    const labelFormat = localStorage.getItem('bcy_label_format') || 'custom';
    const info = global.Store.getPeriodInfo(period, labelFormat);
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

  // 6. editPeriodDates - 编辑日期
function editPeriodDates(period) {
    const labelFormat = localStorage.getItem('bcy_label_format') || 'custom';
    const info = global.Store.getPeriodInfo(period, labelFormat);
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

  // 7. setAsBasePeriod - 设为基准
function setAsBasePeriod(period) {
    localStorage.setItem('bcy_base_period', period);
    window._toast(`已将 ${period} 设为基准周期`, "success");
    window._rerender();
  }

  // 7.5 toggleLabelFormat - 切换周报名称格式
  function toggleLabelFormat(format) {
    localStorage.setItem('bcy_label_format', format);
    document.getElementById('report-list-overlay').remove();
    showReportList();
  }

  // 8. deleteReport - 删除单条
function deleteReport(period) {
    const labelFormat = localStorage.getItem('bcy_label_format') || 'custom';
    if (period === window._currentPeriod_get()) {
      window._toast("不能删除当前正在编辑的周报", "error");
      return;
    }
    const info = global.Store.getPeriodInfo(period, labelFormat);
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

  // 9. showGeneratePeriodsDialog - 生成周期对话框
function showGeneratePeriodsDialog() {
    const labelFormat = localStorage.getItem('bcy_label_format') || 'custom';
    
    // 默认 start/end: 现有最后 W 的下一天 (避免跟现有 W 撞)
    const existingPeriods = global.Store.getPeriods();
    let defaultStart = '2026-05-12';
    let defaultEnd = '2026-05-18';
    if (existingPeriods.length > 0) {
      const sortedExisting = [...existingPeriods].sort();
      const lastKey = sortedExisting[sortedExisting.length - 1];
      const lastInfo = global.Store.getPeriodInfo(lastKey, labelFormat);
      if (lastInfo && lastInfo.end) {
        const d = new Date(lastInfo.end);
        d.setDate(d.getDate() + 1);
        defaultStart = global.Store.toLocalDateStr(d);
        const e = new Date(d);
        e.setDate(d.getDate() + 6);
        defaultEnd = global.Store.toLocalDateStr(e);
      }
    }
    
    const basePeriod = localStorage.getItem('bcy_base_period') || '2026-W20';
    const baseInfo = global.Store.getPeriodInfo(basePeriod, labelFormat);
    
    // 算"基准下一期": basePeriod.end + 1 天 起, 周期长度 = basePeriod 周期长度
    let baselineNextStart = '';
    let baselineNextEnd = '';
    if (baseInfo && baseInfo.end && baseInfo.start) {
      const s = new Date(baseInfo.end);
      s.setDate(s.getDate() + 1);
      baselineNextStart = global.Store.toLocalDateStr(s);
      const e = new Date(s);
      const dur = Math.round((new Date(baseInfo.end) - new Date(baseInfo.start)) / (1000*60*60*24));
      e.setDate(s.getDate() + dur);
      baselineNextEnd = global.Store.toLocalDateStr(e);
    }
    
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
                <div class="text-xs text-purple-600 mt-2">📌 建议下一期: ${baselineNextStart} ~ ${baselineNextEnd} <button onclick="document.getElementById('gen-week1-start').value='${baselineNextStart}'; document.getElementById('gen-week1-end').value='${baselineNextEnd}'; document.getElementById('gen-period-interval').value=${Math.round((new Date(baseInfo?.end) - new Date(baseInfo?.start))/(1000*60*60*24)) + 1}; App.updateGeneratePreviewFromOthers();" class="ml-1 px-1.5 py-0.5 bg-purple-200 hover:bg-purple-300 rounded text-purple-800 text-xs">↺ 一键应用</button></div>
              </div>
              
              <div>
                <label class="block text-sm font-medium text-gray-600 mb-1">开始日期 <span class="text-xs text-gray-400">(默认: 现有最后 W 的下一天)</span></label>
                <input type="date" id="gen-week1-start" value="${defaultStart}" onchange="App.updateGeneratePreviewFromStart()"
                       class="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500">
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-600 mb-1">结束日期</label>
                <input type="date" id="gen-week1-end" value="${defaultEnd}" onchange="App.updateGeneratePreviewFromEnd()"
                       class="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500">
              </div>
              
              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label class="block text-sm font-medium text-gray-600 mb-1">🔄 周期间隔 (天)</label>
                  <input type="number" id="gen-period-interval" value="7" min="1" oninput="App.updateGeneratePreviewFromDur()"
                         class="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                         placeholder="如 7=每周, 14=双周">
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-600 mb-1">📋 生成期数</label>
                  <input type="number" id="gen-period-count" value="4" min="1" max="100" oninput="App.updateGeneratePreviewFromOthers()"
                         class="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                         placeholder="如 4=4期">
                </div>
              </div>
              <div class="bg-gray-50 rounded-md p-3 text-xs text-gray-600">
                <span class="font-medium text-gray-700">📊 预览:</span> <span id="gen-preview-text">加载中...</span>
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
    // 存 baseline 到 window, 给 updateGeneratePreview 用
    window._genBaselineNextStart = baselineNextStart;
    window._genBaselineNextEnd = baselineNextEnd;
    setTimeout(updateGeneratePreview, 50);
  }

  // 9.5 updateGeneratePreview - 实时预览生成周期的范围
  function updateGeneratePreview() {
    // 4 字段联动:
    // 改 start -> end 自动 = start + 周期长度 - 1
    // 改 end -> 周期长度 = end - start + 1 (含首尾)
    // 改周期长度 -> end = start + 周期长度 - 1
    // 改 count -> 最后一期结束日期 (预览) 更新
    
    const startInput = document.getElementById('gen-week1-start');
    const endInput = document.getElementById('gen-week1-end');
    const durInput = document.getElementById('gen-period-interval');  // 周期长度 (id 保持)
    const countInput = document.getElementById('gen-period-count');
    
    if (!startInput || !endInput || !durInput) return;
    
    const t = document.getElementById('gen-preview-text');
    if (!t) return;
    
    const week1Start = startInput.value;
    const week1End = endInput.value;
    const durRaw = durInput.value;
    const countRaw = countInput?.value;
    const dur = parseInt(durRaw);  // 周期长度 (天)
    const count = parseInt(countRaw);
    
    if (!week1Start) {
      t.textContent = '请设置开始日期';
      return;
    }
    if (durRaw === '' || isNaN(dur) || dur < 1) {
      t.textContent = '周期长度必须 ≥ 1 天';
      return;
    }
    if (countRaw === '' || isNaN(count) || count < 1) {
      t.textContent = '生成期数必须 ≥ 1';
      return;
    }
    if (count > 100) {
      t.textContent = '生成期数 ≤ 100 (避免性能问题)';
      return;
    }
    
    // 联动 1: 改 start -> end = start + 周期长度 - 1
    if (window._genLastChanged === 'start') {
      const d = new Date(week1Start);
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() + dur - 1);
      endInput.value = global.Store.toLocalDateStr(d);
    }
    // 联动 2: 改 end -> 周期长度 = end - start + 1
    else if (window._genLastChanged === 'end') {
      if (week1End) {
        const s = new Date(week1Start);
        const e = new Date(week1End);
        s.setHours(0,0,0,0); e.setHours(0,0,0,0);
        const days = Math.round((e - s) / (1000*60*60*24)) + 1;
        if (days >= 1) durInput.value = days;
      }
    }
    // 联动 3: 改周期长度 -> end = start + 周期长度 - 1
    else if (window._genLastChanged === 'dur') {
      const d = new Date(week1Start);
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() + dur - 1);
      endInput.value = global.Store.toLocalDateStr(d);
    }
    window._genLastChanged = null;
    
    // 重读 end/dur (可能刚被联动改)
    const finalEnd = endInput.value;
    const finalDur = parseInt(durInput.value);
    if (!finalEnd) {
      t.textContent = '请设置开始/结束日期';
      return;
    }
    
    const startDate = new Date(week1Start);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(finalEnd);
    endDate.setHours(0, 0, 0, 0);
    const startEndDays = Math.round((endDate - startDate) / (1000*60*60*24));
    
    if (startEndDays < 0) {
      t.textContent = '结束日期必须 ≥ 开始日期';
      return;
    }
    
    // 最后一期结束日期 = startDate + (count-1) * 7 + finalDur 天
    // 注: 这里的"周期间隔"是 7 (每周一份), 不是用户输入
    // 简化: 每期 = 7 天 间隔 (4 周报场景)
    // 实际应该按用户填的间隔 -- 但用户用"周期长度"指代间隔
    // 这里假设: 每期 = finalDur 天, 每期间隔 = finalDur (即连续不间断)
    const lastStart = new Date(startDate);
    lastStart.setDate(startDate.getDate() + ((count - 1) * finalDur));
    const lastEnd = new Date(lastStart);
    lastEnd.setDate(lastStart.getDate() + finalDur - 1);
    
    const fmt = (d) => global.Store.toLocalDateStr(d);
    let baselineNote = '';
    if (window._genBaselineNextStart && window._genBaselineNextEnd) {
      if (fmt(startDate) === window._genBaselineNextStart && finalEnd === window._genBaselineNextEnd) {
        baselineNote = ' ✓ 与基准一致';
      } else {
        baselineNote = ' ⚠ 与基准不一致 (建议: ' + window._genBaselineNextStart + ' ~ ' + window._genBaselineNextEnd + ')';
      }
    }
    t.textContent = count + ' 期, 每期 ' + finalDur + ' 天; 从 ' + fmt(startDate) + ' 到 ' + fmt(lastEnd) + baselineNote;
  }
  
  // 标记哪个 input 刚改了
  function updateGeneratePreviewFromStart() { window._genLastChanged = 'start'; updateGeneratePreview(); }
  function updateGeneratePreviewFromEnd() { window._genLastChanged = 'end'; updateGeneratePreview(); }
  function updateGeneratePreviewFromOthers() { window._genLastChanged = 'other'; updateGeneratePreview(); }
  function updateGeneratePreviewFromDur() { window._genLastChanged = 'dur'; updateGeneratePreview(); }
  
  // 标记哪个 input 刚改了 (用于联动)
  function updateGeneratePreviewFromStart() { window._genLastChanged = 'start'; updateGeneratePreview(); }
  function updateGeneratePreviewFromEnd() { window._genLastChanged = 'end'; updateGeneratePreview(); }
  function updateGeneratePreviewFromOthers() { window._genLastChanged = 'other'; updateGeneratePreview(); }

  // 10. addNewPeriod - 新建周报
function addNewPeriod() {
    const labelFormat = localStorage.getItem('bcy_label_format') || 'custom';
    const periods = global.Store.getPeriods();
    // 取数组最后一项 (按时间顺序) -- period key ISO 周号, 与自定义 label 无关
    const lastPeriod = periods.length > 0 ? periods[periods.length - 1] : '2026-W18';
    const match = lastPeriod.match(/(\d+)-W(\d+)/);
    if (!match) {
      window._toast("无法解析周期格式", "error");
      return;
    }
    
    const lastPeriodInfo = global.Store.getPeriodInfo(lastPeriod, labelFormat);
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
    
    // 自定义周: 读 c.label 解析 N, 新建 = 第N+1周 (支持断周 + 不重编号)
    // 标准周: "2026年第N周"
    let label;
    if (labelFormat === 'custom') {
      const lastLabel = lastPeriodInfo.label || ('第' + match[2] + '周');
      const lm = lastLabel.match(/第\s*(\d+)\s*周/);
      const lastN = lm ? parseInt(lm[1]) : parseInt(match[2]);
      label = '第' + (lastN + 1) + '周';
    } else {
      label = year + '年第' + week + '周';
    }
    
    global.Store.addPeriod(newPeriod, {
      start: global.Store.toLocalDateStr(startDate),
      end: global.Store.toLocalDateStr(endDate),
      label: label
    });
    
    // 主动存一个空 report (从上一期继承, 不重置)
    const newReport = global.Store.load(newPeriod);
    if (newReport) {
      global.Store.save(newReport, newPeriod);
    }
    
    window._changePeriod(newPeriod);
    window._toast(`已创建新周报 ${newPeriod} (${label})`, "success");
  }

  // 11. executeGenerateFromDialog - 执行批量生成
function executeGenerateFromDialog() {
    const week1Start = document.getElementById('gen-week1-start')?.value;
    const week1End = document.getElementById('gen-week1-end')?.value;
    const interval = parseInt(document.getElementById('gen-period-interval')?.value || '7');
    const count = parseInt(document.getElementById('gen-period-count')?.value || '4');
    
    if (!week1Start || !week1End) {
      window._toast("请设置开始/结束日期", "error");
      return;
    }
    
    // 提前获取 store 数据 (避免 TDZ)
    const labelFormat = localStorage.getItem('bcy_label_format') || 'custom';
    const existingPeriods = global.Store.getPeriods();
    const customPeriods = global.Store.getCustomPeriods();
    
    // 与基准不一致 -> 自定义 confirm modal
    const baselineS = window._genBaselineNextStart;
    const baselineE = window._genBaselineNextEnd;
    if (baselineS && baselineE && (week1Start !== baselineS || week1End !== baselineE)) {
      // 暂存参数, 用户点按钮后继续
      window._pendingGenerateParams = { week1Start, week1End, interval, count, existingPeriods, customPeriods, labelFormat, baselineS, baselineE };
      showBaselineConfirmDialog();
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
    
    // 算 label 起点: 找现有 periods 最后一个 label 数字 N, 新生成从 N+1 起
    // (labelFormat/existingPeriods/customPeriods 已在函数顶部获取)
    let lastN = 0;
    if (labelFormat === 'custom') {
      for (const p of existingPeriods) {
        const lbl = customPeriods[p]?.label || '';
        const lm = lbl.match(/第\s*(\d+)\s*周/);
        if (lm) lastN = Math.max(lastN, parseInt(lm[1]));
      }
    }
    
    const newPeriods = [];
    for (let i = 0; i < count; i++) {
      const periodStart = new Date(startDate);
      periodStart.setDate(startDate.getDate() + (i * interval));
      const periodEnd = new Date(periodStart);
      periodEnd.setDate(periodStart.getDate() + periodDuration);
      
      // period key: 按 ISO 周号 (用于日期排序)
      const year = periodStart.getFullYear();
      const weekNum = getWeekNumber(periodStart);
      const periodKey = `${year}-W${String(weekNum).padStart(2, '0')}`;
      
      // label: 自定义周 = 累计 N+1+i; 标准周 = 2026年第N周
      let label;
      if (labelFormat === 'custom') {
        label = '第' + (lastN + 1 + i) + '周';
      } else {
        label = year + '年第' + weekNum + '周';
      }
      
      newPeriods.push({
        key: periodKey,
        weekNum,
        start: global.Store.toLocalDateStr(periodStart),
        end: global.Store.toLocalDateStr(periodEnd),
        label: label
      });
    }
    
    document.getElementById('generate-periods-overlay').remove();
    if (document.getElementById('report-list-overlay')) {
      document.getElementById('report-list-overlay').remove();
    }
    
    // 冲突检测: 日期范围重叠 (任何 1 天重叠 = 冲突)
    const conflicts = [];
    newPeriods.forEach(newP => {
      const newStart = new Date(newP.start).getTime();
      const newEnd = new Date(newP.end).getTime();
      
      existingPeriods.forEach(ep => {
        const ex = customPeriods[ep];
        if (!ex || !ex.start || !ex.end) return;
        const exStart = new Date(ex.start).getTime();
        const exEnd = new Date(ex.end).getTime();
        if (newStart <= exEnd && newEnd >= exStart) {
          // 同一个新期+现有期只记一次
          if (!conflicts.some(c => c.newPeriod.key === newP.key && c.existingPeriod === ep)) {
            conflicts.push({
              newPeriod: newP,
              existingPeriod: ep,
              existing: ex
            });
          }
        }
      });
    });
    
    // 重算 label: 冲突期用现有 label, 非冲突期跳过被冲突占的号续号
    if (labelFormat === 'custom' && conflicts.length > 0) {
      const conflictKeys = new Set(conflicts.map(c => c.newPeriod.key));
      let conflictBefore = 0;
      newPeriods.forEach((newP, i) => {
        if (conflictKeys.has(newP.key)) {
          const c = conflicts.find(c => c.newPeriod.key === newP.key);
          if (c && c.existing && c.existing.label) {
            newP.label = c.existing.label;
          }
          conflictBefore++;
        } else {
          newP.label = '第' + (lastN + 1 + i - conflictBefore) + '周';
        }
      });
    }
    
    if (conflicts.length > 0) {
      showConflictDialog(conflicts, newPeriods);
    } else {
      executeGeneratePeriods(newPeriods);
    }
  }

  // 11.5 executeGeneratePeriods - 无冲突时实际写入
function executeGeneratePeriods(newPeriods) {
    let generatedCount = 0;
    let updatedCount = 0;
    const customPeriods = global.Store.getCustomPeriods();
    
    newPeriods.forEach(p => {
      const existingArr = global.Store.getPeriods();
      const exists = existingArr.includes(p.key);
      
      if (!exists) {
        global.Store.addPeriod(p.key, { start: p.start, end: p.end, label: p.label });
        generatedCount++;
      } else {
        customPeriods[p.key] = { start: p.start, end: p.end, label: p.label };
        updatedCount++;
      }
    });
    
    if (updatedCount > 0) {
      localStorage.setItem('bcy_report_custom_periods', JSON.stringify(customPeriods));
    }
    
    window._rerender();
    
    if (generatedCount > 0 && updatedCount > 0) {
      window._toast(`已生成 ${generatedCount} 个新周期，更新 ${updatedCount} 个现有周期的日期`, "success");
    } else if (generatedCount > 0) {
      window._toast(`已生成 ${generatedCount} 个新周期`, "success");
    } else if (updatedCount > 0) {
      window._toast(`已更新 ${updatedCount} 个现有周期的日期`, "success");
    } else {
      window._toast("没有需要生成或更新的周期", "info");
    }
  }
  
  // 12. getWeekNumber - ISO week 计算
function getWeekNumber(date) {
    const startOfYear = new Date(date.getFullYear(), 0, 1);
    const days = Math.floor((date - startOfYear) / (1000 * 60 * 60 * 24));
    return Math.ceil((days + startOfYear.getDay() + 1) / 7);
  }

  // 13.5 showBaselineConfirmDialog - 基准不一致自定义确认弹窗
  function showBaselineConfirmDialog() {
    const p = window._pendingGenerateParams || {};
    const html = `
      <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" id="baseline-confirm-dialog">
        <div class="bg-white rounded-xl shadow-xl w-full max-w-md mx-4" onclick="event.stopPropagation()">
          <div class="flex items-center justify-between px-6 py-4 border-b">
            <h3 class="font-semibold text-gray-800">⚠️ 与基准周期不一致</h3>
            <button onclick="App.cancelBaselineConflict()" class="text-gray-400 hover:text-gray-600">✕</button>
          </div>
          <div class="p-6">
            <p class="text-sm text-gray-600 mb-4">新设置的周期与基准不一致, 请问如何处理?</p>
            <div class="space-y-2 mb-6">
              <div class="bg-red-50 rounded-md p-3 text-sm">
                <span class="text-red-600 font-medium">当前:</span> ${p.week1Start} ~ ${p.week1End}
              </div>
              <div class="bg-green-50 rounded-md p-3 text-sm">
                <span class="text-green-600 font-medium">基准建议:</span> ${p.baselineS} ~ ${p.baselineE}
              </div>
            </div>
            <div class="space-y-2">
              <button onclick="App.confirmBaselineConflict()" class="w-full px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                ✓ 仍按当前设置生成
              </button>
              <button onclick="App.useBaselineAndGenerate()" class="w-full px-4 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors">
                ↺ 改用基准建议
              </button>
              <button onclick="App.cancelBaselineConflict()" class="w-full px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors">
                ✕ 取消
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
  }
  
  function confirmBaselineConflict() {
    document.getElementById('baseline-confirm-dialog')?.remove();
    const p = window._pendingGenerateParams || {};
    delete window._pendingGenerateParams;
    _continueGenerateAfterBaseline(p);
  }
  
  function cancelBaselineConflict() {
    document.getElementById('baseline-confirm-dialog')?.remove();
    delete window._pendingGenerateParams;
    window._toast('已取消生成', 'info');
  }
  
  function useBaselineAndGenerate() {
    document.getElementById('baseline-confirm-dialog')?.remove();
    const p = window._pendingGenerateParams || {};
    delete window._pendingGenerateParams;
    p.week1Start = p.baselineS;
    p.week1End = p.baselineE;
    _continueGenerateAfterBaseline(p);
  }
  
  // 内部: 走完 generate 的剩余流程
  function _continueGenerateAfterBaseline(p) {
    if (!p || !p.week1Start) return;
    const { week1Start, week1End, interval, count, existingPeriods, customPeriods, labelFormat } = p;
    
    localStorage.setItem('bcy_week1_config', JSON.stringify({
      start: week1Start,
      end: week1End
    }));
    
    const startDate = new Date(week1Start);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(week1End);
    endDate.setHours(0, 0, 0, 0);
    const periodDuration = (endDate - startDate) / (1000 * 60 * 60 * 24);
    
    let lastN = 0;
    if (labelFormat === 'custom') {
      for (const pp of existingPeriods) {
        const lbl = customPeriods[pp]?.label || '';
        const lm = lbl.match(/第\s*(\d+)\s*周/);
        if (lm) lastN = Math.max(lastN, parseInt(lm[1]));
      }
    }
    
    const newPeriods = [];
    for (let i = 0; i < count; i++) {
      const periodStart = new Date(startDate);
      periodStart.setDate(startDate.getDate() + (i * interval));
      const periodEnd = new Date(periodStart);
      periodEnd.setDate(periodStart.getDate() + periodDuration);
      
      const year = periodStart.getFullYear();
      const weekNum = getWeekNumber(periodStart);
      const periodKey = year + '-W' + String(weekNum).padStart(2, '0');
      
      let label;
      if (labelFormat === 'custom') {
        label = '第' + (lastN + 1 + i) + '周';
      } else {
        label = year + '年第' + weekNum + '周';
      }
      
      newPeriods.push({
        key: periodKey,
        weekNum,
        start: global.Store.toLocalDateStr(periodStart),
        end: global.Store.toLocalDateStr(periodEnd),
        label: label
      });
    }
    
    document.getElementById('generate-periods-overlay')?.remove();
    if (document.getElementById('report-list-overlay')) {
      document.getElementById('report-list-overlay').remove();
    }
    
    const conflicts = [];
    newPeriods.forEach(newP => {
      const ns = new Date(newP.start).getTime();
      const ne = new Date(newP.end).getTime();
      existingPeriods.forEach(ep => {
        const ex = customPeriods[ep];
        if (!ex || !ex.start || !ex.end) return;
        const es = new Date(ex.start).getTime();
        const ee = new Date(ex.end).getTime();
        if (ns <= ee && ne >= es) {
          if (!conflicts.some(c => c.newPeriod.key === newP.key && c.existingPeriod === ep)) {
            conflicts.push({ newPeriod: newP, existingPeriod: ep, existing: ex });
          }
        }
      });
    });
    
    if (labelFormat === 'custom' && conflicts.length > 0) {
      const conflictKeys = new Set(conflicts.map(c => c.newPeriod.key));
      let cb = 0;
      newPeriods.forEach((newP, i) => {
        if (conflictKeys.has(newP.key)) {
          const c = conflicts.find(c => c.newPeriod.key === newP.key);
          if (c && c.existing && c.existing.label) newP.label = c.existing.label;
          cb++;
        } else {
          newP.label = '第' + (lastN + 1 + i - cb) + '周';
        }
      });
    }
    
    if (conflicts.length > 0) {
      showConflictDialog(conflicts, newPeriods);
    } else {
      executeGeneratePeriods(newPeriods);
    }
  }
  
  // 13. handleConflict - 处理生成冲突
function handleConflict(action) {
    const newPeriods = window._pendingPeriods || [];
    const existingPeriods = global.Store.getPeriods();
    const customPeriods = global.Store.getCustomPeriods();
    
    document.getElementById('conflict-dialog').remove();
    delete window._pendingPeriods;
    
    let generatedCount = 0;
    let updatedCount = 0;
    
    // 检测新期跟现有期日期范围是否重叠 (不用 key 存在判断, 因为新期 key 跟现有期一样也不一定日期重叠)
    function isOverlap(p) {
      const newStart = new Date(p.start).getTime();
      const newEnd = new Date(p.end).getTime();
      for (const ep of existingPeriods) {
        const ex = customPeriods[ep];
        if (!ex || !ex.start || !ex.end) continue;
        const exStart = new Date(ex.start).getTime();
        const exEnd = new Date(ex.end).getTime();
        if (newStart <= exEnd && newEnd >= exStart) return ep;
      }
      return null;
    }
    
    newPeriods.forEach(p => {
      const overlap = isOverlap(p);
      const exists = !!overlap;  // 兼容旧变量
      
      if (action === 'overwrite') {
        if (!exists) {
          global.Store.addPeriod(p.key, { start: p.start, end: p.end, label: p.label });
          generatedCount++;
        } else {
          // 覆盖: 用现有 key (因为 key 一样), 但日期用新的
          customPeriods[overlap] = { start: p.start, end: p.end, label: p.label };
          updatedCount++;
        }
      } else if (action === 'keep') {
        if (!exists) {
          global.Store.addPeriod(p.key, { start: p.start, end: p.end, label: p.label });
          generatedCount++;
        }
        // 跳过的什么都不做 (不再报 generatedCount)
      } else if (action === 'both') {
        let version = 1;
        let newKey = p.key;
        while (existingPeriods.includes(newKey)) {
          newKey = `${p.key}-v${version}`;
          version++;
        }
        global.Store.addPeriod(newKey, { start: p.start, end: p.end, label: `${p.label} (v${version})` });
        generatedCount++;
      }
    });
    
    if (action !== 'both' && updatedCount > 0) {
      localStorage.setItem('bcy_report_custom_periods', JSON.stringify(customPeriods));
    }
    
    window._rerender();
    
    if (action === 'overwrite') {
      window._toast(`已生成 ${generatedCount} 个新周期，覆盖 ${updatedCount} 个现有周期`, "success");
    } else if (action === 'keep') {
      window._toast(`已生成 ${generatedCount} 个新周期${newPeriods.length - generatedCount - updatedCount > 0 ? "，跳过 " + (newPeriods.length - generatedCount - updatedCount) + " 个与现有日期重叠的周期" : ""}`, "success");
    } else if (action === 'both') {
      window._toast(`已创建 ${generatedCount} 个新周期版本`, "success");
    }
  }

// 14. showConflictDialog - 显示冲突对话框
  function showConflictDialog(conflicts, newPeriods) {
    let conflictHtml = '';
    conflicts.forEach((c, i) => {
      // label 一样时合并 (避免"新: 第7周" + "已存在: 第7周"重复)
      // 不一样时分别显示
      const newLabel = c.newPeriod.label;
      const exLabel = c.existing.label || c.existingPeriod;
      const labelSame = newLabel === exLabel;
      const dateSame = c.newPeriod.start === c.existing.start && c.newPeriod.end === c.existing.end;
      
      let blockHtml;
      if (labelSame && dateSame) {
        // 完全重复
        blockHtml = `
          <div class="border-b border-gray-100 py-3 last:border-0">
            <div class="text-sm font-medium text-gray-800 mb-1">
              ${newLabel}
              <span class="text-gray-400 text-xs ml-1">(${c.newPeriod.key})</span>
              <span class="text-gray-400 text-xs ml-2">— 日期完全相同</span>
            </div>
          </div>
        `;
      } else if (labelSame) {
        // label 同, 日期不同
        blockHtml = `
          <div class="border-b border-gray-100 py-3 last:border-0">
            <div class="text-sm font-medium text-gray-800 mb-1">
              ${newLabel}
              <span class="text-gray-400 text-xs ml-1">(${c.newPeriod.key})</span>
            </div>
            <div class="flex items-center gap-4 text-xs">
              <span class="text-gray-500">
                <span class="text-red-500">新:</span> ${c.newPeriod.start} ~ ${c.newPeriod.end}
              </span>
              <span class="text-gray-400">↔</span>
              <span class="text-gray-500">
                <span class="text-green-500">已有:</span> ${c.existing.start} ~ ${c.existing.end}
              </span>
            </div>
          </div>
        `;
      } else {
        // label 不同 (例如 "新: 第8周" vs "现有: 第7周")
        blockHtml = `
          <div class="border-b border-gray-100 py-3 last:border-0">
            <div class="text-sm font-medium text-gray-800 mb-1">
              <span class="text-red-500">新:</span> ${newLabel}
              <span class="text-gray-400 text-xs ml-1">(${c.newPeriod.key})</span>
              <span class="text-gray-400 text-xs ml-2">vs</span>
              <span class="text-green-500 ml-1">已有:</span> ${exLabel}
              <span class="text-gray-400 text-xs ml-1">(${c.existingPeriod})</span>
            </div>
            <div class="flex items-center gap-4 text-xs">
              <span class="text-gray-500">
                <span class="text-red-500">新:</span> ${c.newPeriod.start} ~ ${c.newPeriod.end}
              </span>
              <span class="text-gray-400">↔</span>
              <span class="text-gray-500">
                <span class="text-green-500">已有:</span> ${c.existing.start} ~ ${c.existing.end}
              </span>
            </div>
          </div>
        `;
      }
      conflictHtml += blockHtml;
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

  // ====== 暴露到 global ======
  global.ReportList = {
    showReportList,
    batchDeleteReports,
    confirmBatchDelete,
    confirmDeleteReport,
    confirmRenameReport,
    confirmEditDates,
    toggleSelectAll,
    updateBatchSelectInfo,
    renameReport,
    editPeriodDates,
    setAsBasePeriod,
    deleteReport,
    showGeneratePeriodsDialog,
    confirmBaselineConflict,
    cancelBaselineConflict,
    useBaselineAndGenerate,
    showBaselineConfirmDialog,
    updateGeneratePreview,
    updateGeneratePreviewFromStart,
    updateGeneratePreviewFromEnd,
    updateGeneratePreviewFromOthers,
    updateGeneratePreviewFromDur,
    showConflictDialog,
    executeGenerateFromDialog,
    handleConflict,
    toggleLabelFormat,
    addNewPeriod
  };
})(typeof window !== 'undefined' ? window : globalThis);
