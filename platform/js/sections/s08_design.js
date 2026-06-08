// platform/js/sections/s08_design.js
// 08 图纸深化 - 固定型 single, 数据源 pages_data['08'].rows
// v5.2 - 8 行交替色 (与 preview 一致)
window.Sections = window.Sections || {};
window.Sections["08"] = {
  title: "图纸深化",

  _rows(report) {
    const pd = report.pages_data && report.pages_data['08'];
    return (pd && pd.rows) || [];
  },

  // 责任人候选 (与 s04 一致, 包含 llm.js OWNER_DICT 里的 苏 尧)
  _owners: ['', '侯 帅', '王 健', '陈 冲', '王亚广', '鲍永春', '袁永超', '李 欢', '乔志广', '徐诗怡', '李水旺', '李永旺', '苏 尧'],
  _statuses: ['未开始', '进行中', '已完成', '打样'],

  render(report) {
    const rows = this._rows(report);
    const trs = rows.map((d, i) => {
      const rowCls = i % 2 === 0 ? 'bg-blue-100/60' : 'bg-blue-50';
      return '' +
        '<tr class="' + rowCls + '">' +
          // v5.24: 单元格字号调小一号 (text-xs → text-[10px]), 表内输入/选择由 CSS 收到 11px
          '<td class="border border-emerald-800/40 px-2 py-2 text-center text-[10px] font-semibold">' + (i + 1) + '</td>' +
          '<td class="border border-emerald-800/40 p-1 text-[10px]">' +
            '<textarea class="form-input form-input-sm s04-task-area" rows="1" onchange="App.s08Update(' + i + ", 'task', this.value)\">" + (d.task || '') + '</textarea>' +
          '</td>' +
          '<td class="border border-emerald-800/40 p-1">' +
            '<select class="form-select form-select-sm" onchange="App.s08Update(' + i + ", 'owner', this.value)\">" +
              this._owners.map(o =>
                '<option value="' + o.replace(/"/g, '&quot;') + '" ' + (d.owner === o ? 'selected' : '') + '>' + (o || '— 未指派') + '</option>'
              ).join('') +
            '</select>' +
          '</td>' +
          '<td class="border border-emerald-800/40 p-1">' +
            '<select class="form-select form-select-sm" onchange="App.s08Update(' + i + ", 'status', this.value)\">" +
              this._statuses.map(s =>
                '<option ' + (d.status === s ? 'selected' : '') + '>' + s + '</option>'
              ).join('') +
            '</select>' +
          '</td>' +
          '<td class="border border-emerald-800/40 px-1 text-center">' +
            '<button type="button" class="text-rose-400 hover:text-rose-600 text-xs" onclick="App.s08Remove(' + i + ')" title="删除">×</button>' +
          '</td>' +
        '</tr>';
    }).join('');

    return '' +
      '<div class="section-card">' +
        '<div class="section-header">' +
          '<div>' +
            '<div class="section-title">图纸深化情况</div>' +
            '<div class="text-xs text-slate-500 mt-1">' + rows.length + ' 行 · 蓝/浅蓝交替行色</div>' +
          '</div>' +
          '<div class="flex items-center gap-1">' +
            '<button type="button" onclick="App.s08AiExtract()" class="btn-ai text-xs">🤖 AI 抽取</button>' +
            '<button type="button" onclick="App.s08Add()" class="btn-primary text-xs">+ 新增一行</button>' +
          '</div>' +
        '</div>' +
        '<div class="section-body">' +
          '<div class="border border-emerald-800/60 rounded-lg overflow-hidden shadow-sm bg-white">' +
            // v5.24: 表格字号 text-sm (14px) → text-xs (12px), 跟单元格 10px 形成层级
            '<table class="w-full border-collapse text-xs s08-table">' +
              '<colgroup><col style="width:50px"><col><col style="width:120px"><col style="width:100px"><col style="width:40px"></colgroup>' +
              '<thead><tr class="bg-blue-500 text-white">' +
                '<th class="border border-emerald-800/60 px-2 py-1.5 text-center">序号</th>' +
                '<th class="border border-emerald-800/60 px-2 py-1.5 text-center">计划事项</th>' +
                '<th class="border border-emerald-800/60 px-2 py-1.5 text-center">责任人</th>' +
                '<th class="border border-emerald-800/60 px-2 py-1.5 text-center">完成情况</th>' +
                '<th class="border border-emerald-800/60 px-2 py-1.5 text-center" title="操作"></th>' +
              '</tr></thead>' +
              '<tbody>' + (trs || '<tr><td colspan="5" class="p-6 text-center text-slate-400">暂无数据, 点击右上"新增一行"</td></tr>') + '</tbody>' +
            '</table>' +
          '</div>' +
        '</div>' +
      '</div>';
  },

  // 渲染后, 让所有 task 文本框自动撑高
  initFilter() {
    const tas = document.querySelectorAll('.s08-task-area, .s04-task-area');
    tas.forEach(ta => {
      const autoSize = () => { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; };
      autoSize();
      ta.addEventListener('input', autoSize);
    });
  }
};
