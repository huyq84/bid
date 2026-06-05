// platform/js/sections/s0301_milestones.js
window.Sections = window.Sections || {};
window.Sections["0301"] = {
  title: "项目重要节点一览表",
  render(report) {
    const months = ["2026.3","2026.4","2026.5","2026.6","2026.7","2026.8"];
    const head = `
      <tr class="bg-blue-600 text-white">
        <th colspan="2" class="border border-blue-700 px-2 py-1.5 text-center">专业/时间</th>
        ${months.map(m => `<th class="border border-blue-700 px-2 py-1.5 text-center">${m}</th>`).join("")}
      </tr>`;
    const body = report.milestones.map((row, ri) => {
      const isKey = row.row === "关键节点";
      return `
        <tr>
          ${ri === 0 ? `<td class="border border-slate-200 px-2 py-2 text-center align-middle bg-slate-200 text-xs font-medium" rowspan="2">软装<br/>(清尚)</td>` : ""}
          <td class="border border-slate-200 px-2 py-2 text-center ${isKey ? 'bg-slate-100' : 'bg-slate-100'} font-medium text-xs">${row.row}</td>
          ${months.map(m => `<td class="border border-slate-200 px-2 py-1.5 text-xs whitespace-pre-line ${isKey ? '' : 'bg-white'}">${(row[m] || '').replace(/\n/g, '<br>')}</td>`).join("")}
        </tr>`;
    }).join("");
    return `
    <div class="section-card">
      <div class="section-header">
        <div>
          <div class="section-title">${this.title}</div>
          <div class="text-xs text-slate-500 mt-1">独立页面 · 不属于任何章 · 不进入目录</div>
        </div>
        <span class="text-xs text-slate-400">仅季度更新</span>
      </div>
      <div class="section-body">
        <table class="dt-table text-xs" style="table-layout: fixed;">
          <thead>${head}</thead>
          <tbody>${body}</tbody>
        </table>
      </div>
    </div>
    `;
  }
};
