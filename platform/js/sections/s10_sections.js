// platform/js/sections/s10_sections.js
window.Sections = window.Sections || {};
window.Sections["10"] = {
  title: "施工段划分",
  _uploads: null,   // 用户上传的图片(对象URL)
  render(report) {
    const imgs = this._uploads || report.construction_sections;
    const labels = report.construction_section_labels;
    return `
    <div class="section-card">
      <div class="section-header">
        <div>
          <div class="section-title">${this.title} — 4.1 食堂区施工段划分图</div>
          <div class="text-xs text-slate-500 mt-1">每周上传新楼层图</div>
        </div>
        <div class="flex gap-2">
          <button class="btn-ai text-xs" onclick="App.enterAnnotateMode()">✏️ 进入标注模式</button>
          <button class="btn-primary text-xs" onclick="App.uploadFloorPlans()">📤 上传新楼层图</button>
        </div>
      </div>
      <div class="section-body">
        <div class="grid grid-cols-3 gap-3">
          ${imgs.map((p, i) => `
            <div class="flex flex-col border border-slate-200 rounded overflow-hidden">
              <div class="floor-annot-wrap flex-1 bg-slate-50 flex items-center justify-center text-xs text-slate-400 aspect-video" data-floor-idx="${i}">
                <img src="${p}" alt="楼层图 ${i+1}" class="max-w-full max-h-full object-contain" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';">
                <span style="display:none">[楼层图占位 ${i+1}]<br>${(p || '').split('/').pop()}</span>
              </div>
              <div class="text-center text-sm font-medium text-slate-700 py-1.5 border-t border-slate-200">${labels[i] || '楼层 '+(i+1)}</div>
            </div>
          `).join("")}
        </div>
        <p class="text-xs text-slate-400 mt-3">💡 标注模式：在楼层图上点击放置编号气泡（1-9），可拖动。退出标注模式后保存。</p>
      </div>
    </div>
    `;
  }
};
