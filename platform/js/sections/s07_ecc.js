// platform/js/sections/s07_ecc.js
window.Sections = window.Sections || {};
window.Sections["07"] = {
  title: "上周 ECC 销项",
  render(report) {
    const e = report.ecc_summary;
    const valid = (e.closed + e.in_process + e.open) === e.total;
    return `
    <div class="section-card">
      <div class="section-header">
        <div>
          <div class="section-title">${this.title} — 2.13 ECC 销项情况</div>
          <div class="text-xs text-slate-500 mt-1">${valid ? '✅ 计数校验通过' : '⚠️ 计数异常'}</div>
        </div>
        <div class="flex gap-2">
          <button class="btn-ai text-xs" onclick="App.aiParseEccScreenshot()">🤖 OCR 截图</button>
          <button class="btn-ghost text-xs" onclick="App.uploadEccScreenshot()">📷 上传截图</button>
        </div>
      </div>
      <div class="section-body grid grid-cols-2 gap-4">
        <table class="dt-table">
          <thead>
            <tr><th class="w-12">序号</th><th>问题总数</th><th>已关闭</th><th>流程中</th><th>未关闭</th><th>关闭率</th></tr>
          </thead>
          <tbody>
            <tr>
              <td class="text-center">1</td>
              <td><input class="form-input text-center" type="number" value="${e.total}" onchange="App.updateEcc('total',+this.value)"></td>
              <td><input class="form-input text-center" type="number" value="${e.closed}" onchange="App.updateEcc('closed',+this.value)"></td>
              <td><input class="form-input text-center" type="number" value="${e.in_process}" onchange="App.updateEcc('in_process',+this.value)"></td>
              <td><input class="form-input text-center" type="number" value="${e.open}" onchange="App.updateEcc('open',+this.value)"></td>
              <td class="text-center font-medium">${e.close_rate}</td>
            </tr>
          </tbody>
        </table>
        <div class="border border-slate-200 rounded overflow-hidden aspect-video bg-slate-100 flex items-center justify-center text-xs text-slate-400">
          [ECC 截图]<br>${(report.ecc_screenshot || '').split('/').pop() || '未上传'}
        </div>
      </div>
    </div>
    `;
  }
};
