// platform/js/sections/s02_toc.js
window.Sections = window.Sections || {};
window.Sections["02"] = {
  title: "目录",
  render(report) {
    // 只列 5 个章，封面/目录/0301 都不进目录
    const tocGroups = window.Store.GROUPS.filter(g => g.toc);
    return `
    <div class="section-card">
      <div class="section-header">
        <div>
          <div class="section-title">${this.title}</div>
          <div class="text-xs text-slate-500 mt-1">基于 5 个章自动生成（封面/目录/0301 不显示）</div>
        </div>
        <span class="text-xs text-slate-400">无需填报</span>
      </div>
      <div class="section-body space-y-2">
        ${tocGroups.map((g, i) => `
          <div class="flex items-center gap-3 p-3 hover:bg-slate-50 rounded">
            <div class="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-sm font-medium">${i+1}</div>
            <div class="flex-1">
              <div class="text-sm font-medium text-slate-900">${g.title}</div>
              <div class="text-xs text-slate-500 mt-0.5">${Store.getPagesByGroup(g.id).map(p => p.id).join(' / ')}</div>
            </div>
          </div>
        `).join("")}
      </div>
    </div>
    `;
  }
};
