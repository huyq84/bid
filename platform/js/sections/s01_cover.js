// platform/js/sections/s01_cover.js
window.Sections = window.Sections || {};
window.Sections["01"] = {
  title: "封面信息",
  render(report) {
    return `
    <div class="space-y-4">
      <!-- 头部装饰卡片 -->
      <div class="bg-gradient-to-r from-blue-600 via-blue-700 to-blue-800 rounded-lg p-4 shadow-md">
        <div class="flex items-center justify-between">
          <div>
            <h2 class="text-xl font-bold text-white">📋 ${report.project.name}</h2>
            <p class="text-blue-200 text-xs mt-0.5">工作周报 · ${report.period.report_date}</p>
          </div>
          <div class="text-right">
            <div class="text-white font-bold text-lg">W${report.period.week_no}</div>
            <div class="text-blue-200 text-xs">第 ${report.period.week_no} 周</div>
          </div>
        </div>
      </div>

      <!-- 项目信息卡片 -->
      <div class="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
        <div class="bg-gray-50 px-4 py-2.5 border-b border-gray-100">
          <div class="flex items-center gap-2">
            <span class="w-6 h-6 rounded-md bg-blue-100 flex items-center justify-center">
              <svg class="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>
              </svg>
            </span>
            <h3 class="font-semibold text-gray-800 text-sm">项目信息</h3>
          </div>
        </div>
        <div class="p-4 grid grid-cols-4 gap-3">
          <div class="space-y-1">
            <label class="block text-xs font-medium text-gray-500">项目名称</label>
            <input class="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-md focus:ring-1.5 focus:ring-blue-500 focus:border-blue-500 transition-all"
              value="${report.project.name}" onchange="App.updateField('project.name', this.value)" placeholder="项目名称">
          </div>
          <div class="space-y-1">
            <label class="block text-xs font-medium text-gray-500">项目编号</label>
            <input class="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-md focus:ring-1.5 focus:ring-blue-500 focus:border-blue-500 transition-all"
              value="${report.project.id}" onchange="App.updateField('project.id', this.value)" placeholder="项目编号">
          </div>
          <div class="space-y-1">
            <label class="block text-xs font-medium text-gray-500">汇报单位</label>
            <input class="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-md focus:ring-1.5 focus:ring-blue-500 focus:border-blue-500 transition-all"
              value="${report.project.subcontractor}" onchange="App.updateField('project.subcontractor', this.value)" placeholder="汇报单位">
          </div>
          <div class="space-y-1">
            <label class="block text-xs font-medium text-gray-500">总包单位</label>
            <input class="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-md focus:ring-1.5 focus:ring-blue-500 focus:border-blue-500 transition-all"
              value="${report.project.general_contractor}" onchange="App.updateField('project.general_contractor', this.value)" placeholder="总包单位">
          </div>
        </div>
      </div>

      <!-- 报送信息卡片 -->
      <div class="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
        <div class="bg-green-50 px-4 py-2.5 border-b border-gray-100">
          <div class="flex items-center gap-2">
            <span class="w-6 h-6 rounded-md bg-green-100 flex items-center justify-center">
              <svg class="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
              </svg>
            </span>
            <h3 class="font-semibold text-gray-800 text-sm">报送信息</h3>
          </div>
        </div>
        <div class="p-4 grid grid-cols-3 gap-3">
          <div class="space-y-1">
            <label class="block text-xs font-medium text-gray-500">填报单位</label>
            <input class="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-md focus:ring-1.5 focus:ring-green-500 focus:border-green-500 transition-all"
              value="${report.submitter.org}" onchange="App.updateField('submitter.org', this.value)" placeholder="填报单位">
          </div>
          <div class="space-y-1">
            <label class="block text-xs font-medium text-gray-500">填报人</label>
            <input class="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-md focus:ring-1.5 focus:ring-green-500 focus:border-green-500 transition-all"
              value="${report.submitter.user_id}" onchange="App.updateField('submitter.user_id', this.value)" placeholder="填报人">
          </div>
          <div class="space-y-1">
            <label class="block text-xs font-medium text-gray-500">职务</label>
            <input class="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-md focus:ring-1.5 focus:ring-green-500 focus:border-green-500 transition-all"
              value="${report.submitter.role || ''}" onchange="App.updateField('submitter.role', this.value)" placeholder="职务">
          </div>
          <div class="space-y-1">
            <label class="block text-xs font-medium text-gray-500">接收单位</label>
            <input class="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-md focus:ring-1.5 focus:ring-green-500 focus:border-green-500 transition-all"
              value="${report.receiver.org}" onchange="App.updateField('receiver.org', this.value)" placeholder="接收单位">
          </div>
          <div class="space-y-1">
            <label class="block text-xs font-medium text-gray-500">接收人</label>
            <input class="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-md focus:ring-1.5 focus:ring-green-500 focus:border-green-500 transition-all"
              value="${report.receiver.user_id || '—'}" onchange="App.updateField('receiver.user_id', this.value)" placeholder="接收人">
          </div>
          <div class="space-y-1">
            <label class="block text-xs font-medium text-gray-500">职务</label>
            <input class="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-md focus:ring-1.5 focus:ring-green-500 focus:border-green-500 transition-all"
              value="${report.receiver.role}" onchange="App.updateField('receiver.role', this.value)" placeholder="职务">
          </div>
        </div>
      </div>

      <!-- 底部提示 -->
      <div class="flex items-center justify-between px-3 py-2 bg-blue-50 rounded-md text-xs">
        <div class="flex items-center gap-1.5">
          <span class="text-blue-600">💡</span>
          <span class="text-blue-700">封面信息将显示在周报首页</span>
        </div>
        <div class="text-blue-500">自动保存</div>
      </div>
    </div>
    `;
  }
};
