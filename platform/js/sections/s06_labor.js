// platform/js/sections/s06_labor.js
// 06 人员统计 - 固定型 single, 数据源 pages_data['06'].rows
// v5.2 - 左侧照片 + "防高坠专项安全会" + 14 行表格
window.Sections = window.Sections || {};
window.Sections["06"] = {
  title: "人员统计",

  // 从 pages_data['06'].rows 取数据
  _rows(report) {
    const pd = report.pages_data && report.pages_data['06'];
    return (pd && pd.rows) || [];
  },

  render(report) {
    const rows = this._rows(report);
    const dataRows = rows.filter(r => !r.is_total);
    const total = rows.find(r => r.is_total) || { this_week: 0, next_week: 0 };

    // 左侧照片 (ui_config.s06_photo)
    const photo = (report.ui_config && report.ui_config.s06_photo) || '';
    const photoCaption = (report.ui_config && report.ui_config.s06_photo_caption) || '防高坠专项安全会';

    const photoBlock = photo
      ? '<div class="flex-1 min-h-0 border border-slate-300 rounded relative overflow-hidden group bg-white">' +
          '<img src="' + photo + '" class="w-full h-full object-cover">' +
          '<button type="button" onclick="App.s06ClearPhoto()" class="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 text-xs opacity-0 group-hover:opacity-100 flex items-center justify-center hover:bg-red-600" title="删除">×</button>' +
        '</div>'
      : '<div onclick="document.getElementById(\'s06-photo-input\').click()" class="flex-1 min-h-0 border-2 border-dashed border-slate-300 rounded flex flex-col items-center justify-center text-slate-400 hover:border-blue-400 hover:text-blue-500 cursor-pointer bg-slate-50">' +
          '<span class="text-2xl">📷</span>' +
          '<span class="text-[10px] mt-1">点击上传会议照片</span>' +
        '</div>';
    const photoInput = '<input type="file" id="s06-photo-input" accept="image/*" class="hidden" onchange="App.s06UploadPhoto(this)">';

    // v5.27: 单元格字号调小一号 (text-xs 12px → text-[10px] 10px), 跟 08/0301/04 一致
    const trs = dataRows.map((s, i) =>
      '<tr class="' + (i % 2 === 0 ? 'bg-blue-50' : 'bg-blue-100/50') + '">' +
        '<td class="border border-emerald-800/40 px-2 py-1.5 text-center text-[10px]">' + (i + 1) + '</td>' +
        '<td class="border border-emerald-800/40 p-0 text-center">' +
          '<input class="form-input form-input-sm text-center font-medium" value="' + (s.type || '').replace(/"/g, '&quot;') + '" placeholder="工种名" onchange="App.s06UpdateType(' + i + ', this.value)">' +
        '</td>' +
        '<td class="border border-emerald-800/40 p-0 text-center">' +
          '<input class="form-input form-input-sm text-center font-medium" type="number" min="0" value="' + (s.this_week || 0) + '" onchange="App.s06Update(' + i + ', \'this_week\', +this.value)">' +
        '</td>' +
        '<td class="border border-emerald-800/40 p-0 text-center">' +
          '<input class="form-input form-input-sm text-center font-medium" type="number" min="0" value="' + (s.next_week || 0) + '" onchange="App.s06Update(' + i + ', \'next_week\', +this.value)">' +
        '</td>' +
        '<td class="border border-emerald-800/40 text-center">' +
          '<button type="button" onclick="App.s06Remove(' + i + ')" class="text-rose-400 hover:text-rose-600 text-xs" title="删除该工种">×</button>' +
        '</td>' +
      '</tr>'
    ).join('');

    return '' +
      '<div class="section-card">' +
        '<div class="section-header">' +
          '<div>' +
            '<div class="section-title">' + this.title + '</div>' +
            '<div class="text-xs text-slate-500 mt-1">合计 本周 ' + total.this_week + ' / 下周 ' + total.next_week + ' 人 · ' + dataRows.length + ' 个工种</div>' +
          '</div>' +
          '<div class="flex items-center gap-1">' +
            '<button type="button" onclick="App.s06AiExtract()" class="btn-ai text-xs">🤖 AI 抽取</button>' +
            '<button type="button" onclick="App.s06Add()" class="btn-primary text-xs">+ 新增工种</button>' +
          '</div>' +
        '</div>' +
        '<div class="section-body">' +
          '<div class="flex gap-4 h-[480px]">' +
            // 左: 照片 + label
            '<div class="w-2/5 flex flex-col gap-2">' +
              photoBlock +
              '<input class="form-input text-center font-bold text-sm" style="background:#48a0f8;color:white;border-color:#48a0f8" value="' + photoCaption.replace(/"/g, '&quot;') + '" onchange="App.s06UpdateCaption(this.value)">' +
            '</div>' +
            // 右: 表格 + label
            '<div class="flex-1 flex flex-col gap-2 min-w-0">' +
              '<div class="border border-emerald-800/60 rounded-lg overflow-hidden shadow-sm bg-white/90 flex-1 min-h-0 flex flex-col">' +
                '<div class="overflow-auto flex-1 s06-table-scroll">' +
                  // v5.27: 表格字号 text-sm (14px) → text-xs (12px), 跟 04/08/0301 一致
                  '<table class="w-full border-collapse text-xs">' +
                    '<colgroup>' +
                      '<col style="width:40px"><col><col style="width:80px"><col style="width:80px"><col style="width:32px">' +
                    '</colgroup>' +
                    '<thead><tr class="bg-blue-500 text-white">' +
                      '<th class="border border-emerald-800/60 px-2 py-1.5 text-center">序号</th>' +
                      '<th class="border border-emerald-800/60 px-2 py-1.5 text-center">工种</th>' +
                      '<th class="border border-emerald-800/60 px-2 py-1.5 text-center">本周人数</th>' +
                      '<th class="border border-emerald-800/60 px-2 py-1.5 text-center">下周人数</th>' +
                      '<th class="border border-emerald-800/60 px-2 py-1.5 text-center" title="删除该工种"></th>' +
                    '</tr></thead>' +
                    '<tbody>' + trs + '</tbody>' +
                    '<tfoot><tr class="bg-amber-50 font-bold">' +
                      '<td class="border border-emerald-800/40 px-2 py-1.5 text-center">' + (dataRows.length + 1) + '</td>' +
                      '<td class="border border-emerald-800/40 px-2 py-1.5 text-center">合计</td>' +
                      '<td class="border border-emerald-800/40 px-2 py-1.5 text-center text-blue-700">' + total.this_week + '</td>' +
                      '<td class="border border-emerald-800/40 px-2 py-1.5 text-center text-blue-700">' + total.next_week + '</td>' +
                      '<td class="border border-emerald-800/40"></td>' +
                    '</tr></tfoot>' +
                  '</table>' +
                '</div>' +
              '</div>' +
              '<div class="text-center font-bold text-sm py-2 px-6 rounded" style="background:#48a0f8;color:white;width:fit-content;margin:0 auto">全部人员在场情况</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>' +
      photoInput;
  }
};
