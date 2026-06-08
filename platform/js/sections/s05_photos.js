// platform/js/sections/s05_photos.js
// 05 工作现场 - 重复型 repeatable, repeatBy = area
// v5.2 - 数据反推 + 随手拍照片池选用
window.Sections = window.Sections || {};
window.Sections["05"] = {
  title: "上周工作现场",

  materialize(report) {
    const photos = report.site_photos || [];
    const groups = {};
    photos.forEach(p => {
      const k = p.area || '未分类';
      if (!groups[k]) groups[k] = [];
      groups[k].push(p);
    });
    return Object.entries(groups).map(([area, ps]) => ({
      id: `05-${slugify(area)}`,
      keyValue: area,
      data: ps
    }));
  },

  render(report) {
    const instances = this.materialize(report);
    if (instances.length === 0) {
      return '' +
        '<div class="section-card">' +
          '<div class="section-header">' +
            '<div>' +
              '<div class="section-title">' + this.title + '</div>' +
              '<div class="text-xs text-slate-500 mt-1">暂无照片, 请上传或从随手拍选用</div>' +
            '</div>' +
            '<div class="flex gap-2">' +
              '<button class="btn-primary" onclick="App.s05AddInstance()">+ 新增区域</button>' +
              '<button class="btn-ai" onclick="App.s05FromCapture()">📸 从随手拍选用</button>' +
            '</div>' +
          '</div>' +
        '</div>';
    }
    let html = '';
    instances.forEach((inst, i) => {
      html += this.renderInstance(inst, i);
    });
    html += '<div class="mt-3 flex gap-2">' +
      '<button class="btn-primary text-sm" onclick="App.s05AddInstance()">+ 新增区域</button>' +
      '<button class="btn-ai text-sm" onclick="App.s05FromCapture()">📸 从随手拍选用</button>' +
    '</div>';
    return html;
  },

  renderInstance(inst, idx) {
    // v5.3: 取消 6 张上限, 渲染全部已上传照片 + 末尾 1 个 "+" 新增槽
    //   - 有 url: 图 + 说明 + ×
    //   - 空槽: 上传占位 (AddInstance 留下的空占位 / 末尾新增)
    // s05UploadSlot 对超出 data.length 的 slot 走 push 分支, 天然支持末尾追加
    const slots = [];
    const data = inst.data;
    for (let i = 0; i <= data.length; i++) {
      const p = data[i];
      if (p && p.url) {
        const src = p.url || (p.blob ? URL.createObjectURL(p.blob) : '');
        const caption = p.caption || ('照片 ' + (i + 1));
        slots.push(
          '<div class="border border-slate-300 rounded overflow-hidden aspect-video bg-slate-100 relative group">' +
            '<img src="' + src + '" class="w-full h-full object-cover">' +
            '<div class="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent text-white text-xs p-2 pt-4">' +
              '<input class="w-full bg-transparent text-white text-xs placeholder-white/60 focus:outline-none focus:bg-black/40 rounded px-1" value="' + (caption || '').replace(/"/g, '&quot;') + '" placeholder="照片说明" onchange="App.s05UpdateCaption(' + idx + ', ' + i + ', this.value)">' +
            '</div>' +
            '<button type="button" onclick="App.s05RemovePhoto(' + idx + ', ' + i + ')" class="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 text-xs opacity-0 group-hover:opacity-100 flex items-center justify-center hover:bg-red-600" title="删除">×</button>' +
          '</div>'
        );
      } else {
        const isTrailing = (i === data.length);
        slots.push(
          '<div onclick="App.s05UploadSlot(' + idx + ', ' + i + ')" class="border-2 border-dashed ' + (isTrailing ? 'border-blue-300 bg-blue-50/30' : 'border-slate-300 bg-slate-50') + ' rounded aspect-video flex flex-col items-center justify-center text-slate-400 hover:border-blue-400 hover:text-blue-500 cursor-pointer">' +
            '<span class="text-2xl">+</span>' +
            '<span class="text-[10px] mt-1">' + (isTrailing ? '新增照片' : '点击上传') + '</span>' +
          '</div>'
        );
      }
    }
    return '' +
      '<div class="instance-card mb-4" data-instance-id="' + inst.id + '">' +
        '<div class="instance-header">' +
          '<span class="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-700">区域: ' + inst.keyValue + '</span>' +
          '<span class="text-xs text-slate-400">' + inst.data.length + ' 张 · 对应 1 张 PPT 页</span>' +
          '<div class="flex items-center gap-1 ml-auto">' +
            '<button type="button" onclick="App.s05AddInstance(\'' + (inst.keyValue || '').replace(/'/g, "\\'") + '\')" class="text-xs px-2 py-1 rounded border border-slate-300 text-slate-600 hover:bg-white hover:border-blue-400">+ 新增区域</button>' +
            '<button type="button" onclick="App.s05DelInstance(' + idx + ')" class="text-xs px-2 py-1 rounded border border-rose-300 text-rose-500 hover:bg-rose-50">删除该区域</button>' +
          '</div>' +
        '</div>' +
        '<div class="grid grid-cols-3 gap-3">' + slots.join('') + '</div>' +
      '</div>';
  }
};
