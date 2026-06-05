// platform/js/sections/s11_schedule.js
window.Sections = window.Sections || {};
window.Sections["11"] = {
  title: "施工段计划",
  render(report) {
    const sched = report.section_schedule;
    const head = `
      <tr class="bg-slate-100">
        <th rowspan="2" class="border border-slate-200 px-2 py-1.5">序号</th>
        <th rowspan="2" class="border border-slate-200 px-2 py-1.5">楼栋</th>
        <th rowspan="2" class="border border-slate-200 px-2 py-1.5">部位</th>
        <th rowspan="2" class="border border-slate-200 px-2 py-1.5">工序</th>
        <th colspan="3" class="border border-slate-200 px-2 py-1.5 bg-orange-200">一层</th>
        <th colspan="3" class="border border-slate-200 px-2 py-1.5 bg-green-200">二层</th>
        <th colspan="3" class="border border-slate-200 px-2 py-1.5 bg-blue-200">B1层（1）</th>
        <th colspan="3" class="border border-slate-200 px-2 py-1.5 bg-blue-200">B1层（2）</th>
      </tr>
      <tr>
        ${[0,1,2,3].map(() => `
          <th class="border border-slate-200 px-1 py-1 text-xs">开始</th>
          <th class="border border-slate-200 px-1 py-1 text-xs">完成</th>
          <th class="border border-slate-200 px-1 py-1 text-xs">天</th>
        `).join("")}
      </tr>
    `;
    const body = sched.map((r, i) => {
      const cells = r.cells.map((c, k) => `<td class="border border-slate-200 px-1 py-1 text-center text-xs ${r.highlight ? 'bg-yellow-300 font-bold' : ''}">${c}</td>`).join("");
      return `
        <tr>
          <td class="border border-slate-200 px-2 py-1 text-center text-xs">${r.seq}</td>
          <td class="border border-slate-200 px-2 py-1 text-center text-xs">${r.building}</td>
          <td class="border border-slate-200 px-2 py-1 text-center text-xs">${r.part}</td>
          <td class="border border-slate-200 px-2 py-1 text-xs">${r.step}</td>
          ${cells}
        </tr>
      `;
    }).join("");
    return `
    <div class="section-card">
      <div class="section-header">
        <div>
          <div class="section-title">${this.title} — 4.1 食堂区5月份施工计划</div>
          <div class="text-xs text-slate-500 mt-1">${sched.length} 道工序 · 黄底为关键移交节点</div>
        </div>
        <button class="btn-ai text-xs" onclick="App.aiExtendSchedule()">🤖 AI 续排 6 月</button>
      </div>
      <div class="section-body overflow-x-auto">
        <table class="dt-table text-xs" style="min-width: 1000px;">
          <thead>${head}</thead>
          <tbody>${body}</tbody>
        </table>
      </div>
    </div>
    `;
  }
};
