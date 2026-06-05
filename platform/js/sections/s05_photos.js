// platform/js/sections/s05_photos.js
window.Sections = window.Sections || {};
window.Sections["05"] = {
  title: "上周工作现场",
  render(report) {
    const photos = report.site_photos["高管层"] || [];
    return `
    <div class="section-card">
      <div class="section-header">
        <div>
          <div class="section-title">${this.title} — 2.2 高管层现场工作</div>
          <div class="text-xs text-slate-500 mt-1">已上传 ${photos.length} 张照片 · AI 自动按区域分组</div>
        </div>
        <div class="flex gap-2">
          <button class="btn-ai text-xs" onclick="App.aiGroupPhotos()">🤖 AI 分组</button>
          <button class="btn-primary text-xs" onclick="App.uploadPhotos()">📷 上传照片</button>
        </div>
      </div>
      <div class="section-body">
        <div class="grid grid-cols-3 gap-3">
          ${photos.map((p, i) => `
            <div class="border border-slate-200 rounded overflow-hidden aspect-video bg-slate-100 flex items-center justify-center text-xs text-slate-400">
              [照片 ${i+1}]<br>${p.split('/').pop()}
            </div>
          `).join("")}
        </div>
        <p class="text-xs text-slate-400 mt-3">💡 原 PDF 中的 6 张实景图将被原样插入到预览页</p>
      </div>
    </div>
    `;
  }
};
