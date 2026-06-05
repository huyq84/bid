// platform/js/sections/s12_coord.js
window.Sections = window.Sections || {};
window.Sections["12"] = {
  title: "协调事宜",
  render(report) {
    const rows = report.coordination.map((c, i) => `
      <tr>
        <td class="text-center text-slate-500">${c.seq}</td>
        <td><input class="form-input" value="${c.issue || ''}" onchange="App.updateCoord(${i},'issue',this.value)" placeholder="待协调事项"></td>
        <td><input class="form-input" value="${c.proposer || ''}" onchange="App.updateCoord(${i},'proposer',this.value)" placeholder="提出部门"></td>
        <td><input class="form-input" value="${c.cooperator || ''}" onchange="App.updateCoord(${i},'cooperator',this.value)" placeholder="配合部门"></td>
      </tr>
    `).join("");
    return `
    <div class="section-card">
      <div class="section-header">
        <div>
          <div class="section-title">${this.title} — 5.1 协调事宜</div>
          <div class="text-xs text-slate-500 mt-1">${report.coordination.filter(c => c.issue).length} / ${report.coordination.length} 条已填</div>
        </div>
        <button class="btn-primary text-xs" onclick="App.addCoord()">+ 新增</button>
      </div>
      <div class="section-body">
        <table class="dt-table">
          <thead>
            <tr><th class="w-12">序号</th><th>需协调事宜</th><th class="w-32">提出部门</th><th class="w-32">配合部门</th></tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
    `;
  }
};
