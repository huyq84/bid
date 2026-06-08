// platform/js/sections/s12_coord.js
// 12 协调事宜 - 固定型 single, 数据源 pages_data['12'].rows
// v5.2 - 4 列 (序号/需协调/提出/配合) + 85px 高表头
window.Sections = window.Sections || {};
window.Sections["12"] = {
  title: "协调事宜",

  _rows(report) {
    const pd = report.pages_data && report.pages_data['12'];
    return (pd && pd.rows) || [];
  },

  render(report) {
    const rows = this._rows(report);
    const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const trs = rows.map((c, i) => {
      const rowCls = i % 2 === 0 ? 'bg-blue-50' : 'bg-blue-100/60';
      // v5.28: 提出/配合部门 改 contenteditable div, 部门名长就自动换行 (跟 11 单元一致)
      //   Enter 保存, Esc 取消还原, onblur 落盘
      const proposerCell = '<div contenteditable="plaintext-only" class="s12-dept-cell text-center" ' +
        'data-row="' + i + '" data-field="proposer" data-original="' + esc(c.proposer) + '" data-placeholder="提出部门" ' +
        'onblur="App.s12Update(' + i + ", 'proposer', this.innerText)\" " +
        'onkeydown="if(event.key===\'Enter\'){event.preventDefault();this.blur();} if(event.key===\'Escape\'){event.preventDefault();this.innerText=this.dataset.original;this.blur();}" ' +
        'title="点击编辑 (Enter 保存 / Esc 取消)">' + esc(c.proposer) + '</div>';
      const cooperatorCell = '<div contenteditable="plaintext-only" class="s12-dept-cell text-center" ' +
        'data-row="' + i + '" data-field="cooperator" data-original="' + esc(c.cooperator) + '" data-placeholder="配合部门" ' +
        'onblur="App.s12Update(' + i + ", 'cooperator', this.innerText)\" " +
        'onkeydown="if(event.key===\'Enter\'){event.preventDefault();this.blur();} if(event.key===\'Escape\'){event.preventDefault();this.innerText=this.dataset.original;this.blur();}" ' +
        'title="点击编辑 (Enter 保存 / Esc 取消)">' + esc(c.cooperator) + '</div>';
      return '' +
        '<tr class="' + rowCls + '">' +
          // v5.27: 单元格字号 text-sm 14px → text-[10px] 10px, 跟 04/08/09 一致
          '<td class="border border-emerald-800/60 px-2 py-1 text-center text-[10px]">' + (i + 1) + '</td>' +
          '<td class="border border-emerald-800/60 p-1 text-[10px]">' +
            '<textarea class="form-input form-input-sm s04-task-area" rows="1" placeholder="需协调事宜" onchange="App.s12Update(' + i + ", 'issue', this.value)\">" + (c.issue || '') + '</textarea>' +
          '</td>' +
          // v5.28: 部门列改 contenteditable, 部门名长自动换行
          '<td class="border border-emerald-800/60 p-1">' + proposerCell + '</td>' +
          '<td class="border border-emerald-800/60 p-1">' + cooperatorCell + '</td>' +
          '<td class="border border-emerald-800/60 p-1 text-center">' +
            '<button type="button" class="text-rose-400 hover:text-rose-600 text-xs" onclick="App.s12Remove(' + i + ')" title="删除该行">×</button>' +
          '</td>' +
        '</tr>';
    }).join('');

    return '' +
      '<div class="section-card">' +
        '<div class="section-header">' +
          '<div>' +
            '<div class="section-title">协调事宜</div>' +
            '<div class="text-xs text-slate-500 mt-1">' + rows.length + ' 行 · 4 列 · 表头高 85px</div>' +
          '</div>' +
          '<div class="flex items-center gap-1">' +
            '<button type="button" onclick="App.s12Add()" class="btn-primary text-xs">+ 新增一行</button>' +
          '</div>' +
        '</div>' +
        '<div class="section-body">' +
          '<div class="border border-emerald-800 rounded-lg overflow-hidden shadow-sm bg-white">' +
            // v5.27: 加 s12-table class, CSS 收表内 input/select 字号
            '<table class="w-full border-collapse s12-table">' +
              '<colgroup>' +
                '<col style="width:60px"><col><col style="width:130px"><col style="width:130px"><col style="width:36px">' +
              '</colgroup>' +
              // v5.27: 表头字号 text-base 16px → text-xs 12px (跟 04/08 一致)
              '<thead><tr style="height:85px">' +
                '<th class="border border-emerald-800/60 bg-sky-500 text-white px-2 py-2 text-center text-xs font-bold tracking-wider">序号</th>' +
                '<th class="border border-emerald-800/60 bg-sky-500 text-white px-2 py-2 text-center text-xs font-bold tracking-wider">需协调事宜</th>' +
                '<th class="border border-emerald-800/60 bg-sky-500 text-white px-2 py-2 text-center text-xs font-bold tracking-wider">提出部门</th>' +
                '<th class="border border-emerald-800/60 bg-sky-500 text-white px-2 py-2 text-center text-xs font-bold tracking-wider">配合部门</th>' +
                '<th class="border border-emerald-800/60 bg-sky-500 text-white px-2 py-2 text-center text-xs font-bold" title="操作"></th>' +
              '</tr></thead>' +
              '<tbody>' + (trs || '<tr><td colspan="5" class="p-6 text-center text-slate-400">暂无数据, 点击右上"新增一行"</td></tr>') + '</tbody>' +
            '</table>' +
          '</div>' +
        '</div>' +
      '</div>';
  },

  // 渲染后让 textarea 自动撑高
  initFilter() {
    const tas = document.querySelectorAll('.s12-task-area, .s04-task-area, .s08-task-area');
    tas.forEach(ta => {
      const autoSize = () => { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; };
      autoSize();
      ta.addEventListener('input', autoSize);
    });
  }
};
