// platform/js/sections/s07_ecc.js
// 07 ECC 销项 - 固定型 single, 数据源 pages_data['07'].data
// v5.2 - 单行统计表 + 380px 截图区
window.Sections = window.Sections || {};
window.Sections["07"] = {
  title: "ECC 销项",

  _data(report) {
    const pd = report.pages_data && report.pages_data['07'];
    return (pd && pd.data) || { total: 0, closed: 0, in_process: 0, open: 0, image: '' };
  },

  render(report) {
    const e = this._data(report);
    const rate = e.total > 0 ? (e.closed / e.total * 100).toFixed(2) : '0.00';

    const imageBlock = e.image
      ? '<div class="border border-emerald-800/60 rounded overflow-hidden bg-white relative group" style="height:380px">' +
          '<img src="' + e.image + '" class="w-full h-full object-contain">' +
          '<button type="button" onclick="App.s07ClearImage()" class="absolute top-2 right-2 bg-red-500 text-white rounded-full w-6 h-6 text-xs opacity-0 group-hover:opacity-100 flex items-center justify-center hover:bg-red-600" title="删除截图">×</button>' +
        '</div>'
      : '<div onclick="document.getElementById(\'s07-image-input\').click()" class="border-2 border-dashed border-slate-300 rounded flex flex-col items-center justify-center text-slate-400 hover:border-blue-400 hover:text-blue-500 cursor-pointer bg-slate-50" style="height:380px">' +
          '<span class="text-4xl mb-2">📊</span>' +
          '<span class="text-sm">点击上传 ECC 质量整改情况截图</span>' +
          '<span class="text-[10px] text-slate-400 mt-1">支持 JPG/PNG, 建议 1280×720</span>' +
        '</div>';
    const imageInput = '<input type="file" id="s07-image-input" accept="image/*" class="hidden" onchange="App.s07UploadImage(this)">';

    return '' +
      '<div class="section-card">' +
        '<div class="section-header">' +
          '<div>' +
            '<div class="section-title">北京清尚 ECC 质量整改统计表</div>' +
            '<div class="text-xs text-slate-500 mt-1">关闭率 <span class="font-bold text-blue-600">' + rate + '%</span> · 截图作为佐证材料</div>' +
          '</div>' +
          '<div class="flex items-center gap-1">' +
            '<button type="button" onclick="App.s07AiParse()" class="btn-ai text-xs">🤖 AI 解析截图</button>' +
          '</div>' +
        '</div>' +
        '<div class="section-body">' +
          // 单行 5 列表 (序号 / 问题总数 / 已关闭 / 流程关闭中 / 未关闭 / 关闭率 = 6 列)
          '<div class="border border-emerald-800/60 rounded-lg overflow-hidden shadow-sm bg-white mb-3">' +
            // v5.27: 表格字号 text-sm (14px) → text-xs (12px), 跟 04/08/0301 一致
            '<table class="w-full border-collapse text-xs s07-table">' +
              '<colgroup><col style="width:60px"><col><col><col><col><col style="width:90px"></colgroup>' +
              '<thead><tr class="bg-blue-500 text-white">' +
                '<th class="border border-emerald-800/60 px-2 py-2 text-center">序号</th>' +
                '<th class="border border-emerald-800/60 px-2 py-2 text-center">问题总数</th>' +
                '<th class="border border-emerald-800/60 px-2 py-2 text-center">已关闭</th>' +
                '<th class="border border-emerald-800/60 px-2 py-2 text-center">流程关闭中</th>' +
                '<th class="border border-emerald-800/60 px-2 py-2 text-center">未关闭</th>' +
                '<th class="border border-emerald-800/60 px-2 py-2 text-center">关闭率</th>' +
              '</tr></thead>' +
              '<tbody><tr class="bg-blue-50/50">' +
                '<td class="border border-emerald-800/40 px-2 py-2 text-center">1</td>' +
                '<td class="border border-emerald-800/40 p-0 text-center"><input class="form-input form-input-sm text-center text-base font-bold" type="number" min="0" value="' + (e.total || 0) + '" onchange="App.s07Update(\'total\', +this.value)"></td>' +
                '<td class="border border-emerald-800/40 p-0 text-center"><input class="form-input form-input-sm text-center text-base font-bold text-emerald-600" type="number" min="0" value="' + (e.closed || 0) + '" onchange="App.s07Update(\'closed\', +this.value)"></td>' +
                '<td class="border border-emerald-800/40 p-0 text-center"><input class="form-input form-input-sm text-center text-base font-bold text-amber-600" type="number" min="0" value="' + (e.in_process || 0) + '" onchange="App.s07Update(\'in_process\', +this.value)"></td>' +
                '<td class="border border-emerald-800/40 p-0 text-center"><input class="form-input form-input-sm text-center text-base font-bold text-rose-600" type="number" min="0" value="' + (e.open || 0) + '" onchange="App.s07Update(\'open\', +this.value)"></td>' +
                '<td class="border border-emerald-800/40 px-2 py-2 text-center font-bold text-blue-700">' + rate + '%</td>' +
              '</tr></tbody>' +
            '</table>' +
          '</div>' +
          imageBlock +
        '</div>' +
      '</div>' +
      imageInput;
  }
};
