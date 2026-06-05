// platform/js/sections/s06_labor.js
window.Sections = window.Sections || {};
window.Sections["06"] = {
  title: "上周人员统计",
  render(report) {
    const rows = report.labor_stats.map((l, i) => `
      <tr class="${l.is_total ? 'bg-blue-50 font-medium' : (i % 2 ? 'bg-slate-50' : '')}">
        <td class="text-center text-slate-500">${l.is_total ? '15' : l.seq || i+1}</td>
        <td>${l.type || '合计'}</td>
        <td class="text-center">
          <input class="form-input text-center" type="number" value="${l.this_week}" onchange="App.updateLabor(${i},'this_week',+this.value)">
        </td>
        <td class="text-center">
          <input class="form-input text-center" type="number" value="${l.next_week}" onchange="App.updateLabor(${i},'next_week',+this.value)">
        </td>
        <td class="text-center text-xs">
          ${l.is_total ? '' : (() => {
            const d = l.this_week ? ((l.next_week - l.this_week) / l.this_week * 100).toFixed(1) : 0;
            const cls = Math.abs(d) > 30 ? 'text-amber-600' : (d > 0 ? 'text-emerald-600' : d < 0 ? 'text-red-600' : 'text-slate-400');
            return `<span class="${cls}">${d > 0 ? '+' : ''}${d}%</span>`;
          })()}
        </td>
      </tr>
    `).join("");
    const total = report.labor_stats.find(l => l.is_total);
    return `
    <div class="section-card">
      <div class="section-header">
        <div>
          <div class="section-title">${this.title} — 2.12 现场工作：人员统计</div>
          <div class="text-xs text-slate-500 mt-1">本周合计 ${total?.this_week} · 下周计划 ${total?.next_week}</div>
        </div>
        <div class="flex gap-2">
          <button class="btn-ai text-xs" onclick="App.aiRecomputeLabor()">🤖 AI 重算合计</button>
        </div>
      </div>
      <div class="section-body">
        <table class="dt-table">
          <thead>
            <tr>
              <th class="w-12">序号</th>
              <th>工种</th>
              <th class="w-28">本周人数</th>
              <th class="w-28">下周人数</th>
              <th class="w-24">环比</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
    `;
  }
};
