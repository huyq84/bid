// platform/js/sections/s03_roster.js
window.Sections = window.Sections || {};
window.Sections["03"] = {
  title: "组织架构 — 到岗管理人员名单",
  render(report) {
    const items = report.roster.map((p, i) => `
      <tr>
        <td class="text-center text-slate-500">${p.seq}</td>
        <td>${p.role}</td>
        <td>
          <input class="form-input" value="${p.name}" onchange="App.updateRoster(${i},'name',this.value)">
        </td>
        <td>
          <input class="form-input" value="${p.phone}" onchange="App.updateRoster(${i},'phone',this.value)">
        </td>
        <td class="text-center">
          <label class="inline-flex items-center gap-1 cursor-pointer">
            <input type="checkbox" ${p.present ? "checked" : ""} onchange="App.updateRoster(${i},'present',this.checked)">
            <span class="${p.present ? 'text-emerald-600' : 'text-slate-400'} text-xs">${p.present ? '已到岗' : '未到岗'}</span>
          </label>
        </td>
        <td class="text-center">
          <span class="text-xs px-1.5 py-0.5 rounded ${p.delta === 'new' ? 'bg-emerald-100 text-emerald-700' : p.delta === 'leave' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-500'}">${p.delta === 'new' ? '新增' : p.delta === 'leave' ? '离职' : '在册'}</span>
        </td>
        <td class="text-center">
          <button class="text-xs text-red-500 hover:underline" onclick="App.markLeave(${i})">标记离职</button>
        </td>
      </tr>
    `).join("");
    return `
    <div class="section-card">
      <div class="section-header">
        <div>
          <div class="section-title">${this.title}</div>
          <div class="text-xs text-slate-500 mt-1">花名册 ${report.roster.filter(p => p.delta !== 'leave').length} 人 / 已到岗 ${report.roster.filter(p => p.present && p.delta !== 'leave').length} 人</div>
        </div>
        <div class="flex gap-2">
          <button class="btn-ghost text-xs" onclick="App.importRoster()">📋 从花名册导入</button>
          <button class="btn-ai text-xs" onclick="App.aiRosterDiff()">🔍 AI 比对上周</button>
          <button class="btn-primary text-xs" onclick="App.addRoster()">+ 新增人员</button>
        </div>
      </div>
      <div class="section-body">
        <table class="dt-table">
          <thead>
            <tr>
              <th class="w-12">序号</th>
              <th>职务</th>
              <th>姓名</th>
              <th>联系电话</th>
              <th class="w-28">是否到岗</th>
              <th class="w-16">状态</th>
              <th class="w-20">操作</th>
            </tr>
          </thead>
          <tbody>${items}</tbody>
        </table>
      </div>
    </div>
    `;
  }
};
