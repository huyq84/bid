// platform/js/sections/s0301_milestones.js
// 0301 项目重要节点一览表 - 固定型 single
// v5.2 - 月份列可动态增删
window.Sections = window.Sections || {};
window.Sections["0301"] = {
  title: "项目重要节点",

  // 6 个月表头: 从 report.period.start 算 (含本月 + 后 5 个月)
  _calcMonths: function (report) {
    const startStr = report && report.period && report.period.start;
    let baseYear, baseMonth;
    if (startStr) {
      const parts = startStr.split('-');
      baseYear = parseInt(parts[0], 10);
      baseMonth = parseInt(parts[1], 10);  // 1-12
    } else {
      const d = new Date();
      baseYear = d.getFullYear();
      baseMonth = d.getMonth() + 1;
    }
    const months = [];
    for (let i = 0; i < 6; i++) {
      const m = ((baseMonth - 1 + i) % 12) + 1;
      const y = baseYear + Math.floor((baseMonth - 1 + i) / 12);
      months.push(y + '.' + m);
    }
    return months;
  },

  // 取当前生效的月份列表 (优先 pages_data['0301'].months, 否则自动算)
  _getMonths: function (report) {
    const pd = report.pages_data && report.pages_data['0301'];
    if (pd && Array.isArray(pd.months) && pd.months.length) return pd.months;
    return this._calcMonths(report);
  },

  // 月份标签转 next-month (用于 "+ 新增月份" 默认)
  _nextMonthLabel: function (lastLabel) {
    const m = String(lastLabel || '').match(/^(\d+)\.(\d+)$/);
    if (!m) {
      const d = new Date();
      return d.getFullYear() + '.' + (d.getMonth() + 1);
    }
    let y = +m[1], mo = +m[2] + 1;
    if (mo > 12) { mo = 1; y++; }
    return y + '.' + mo;
  },

  _nl2br: function (s) {
    if (!s) return '';
    return String(s).replace(/\n/g, '<br/>');
  },

  render(report) {
    const pd = (report.pages_data && report.pages_data['0301']) || { rows: [] };
    const list = pd.rows || [];
    const months = this._getMonths(report);

    // 月份表头: 名字 + 悬浮 × 按钮
    const headCols = months.map((m, mi) =>
      '<th class="border border-blue-700/50 px-2 py-1.5 text-center text-white font-medium bg-blue-500 relative group" data-month-col="' + mi + '">' +
        '<div class="flex items-center justify-center gap-1">' +
          '<span class="s0301-month-label" data-month-key="' + m + '">' + m + '</span>' +
          '<button type="button" class="opacity-60 hover:opacity-100 text-white text-[10px] leading-none" onclick="App.s0301EditMonth(' + mi + ')" title="改月份标签">✎</button>' +
          '<button type="button" class="opacity-60 hover:opacity-100 text-rose-200 hover:text-white text-xs leading-none" onclick="App.s0301DelMonth(' + mi + ')" title="删除该月列">×</button>' +
        '</div>' +
      '</th>'
    ).join('');

    // 按 major 分组
    const groups = {};
    list.forEach(r => {
      const k = r.major || '未分类';
      if (!groups[k]) groups[k] = { rows: [] };
      groups[k].rows.push(r);
    });
    const majorKeys = Object.keys(groups);

    // 固定行 (不能删) - 必须按此顺序排在前面
    const FIXED_ROWS = ['关键节点', '次要节点'];

    const rowsHtml = majorKeys.map((major, gi) => {
      const rs = groups[major].rows;
      // 固定行: 关键 + 次要 (若 data 中缺, 用占位 row obj, 但不写入 store)
      const keyRow = rs.find(r => r.row === '关键节点') || { major: major, row: '关键节点', __ghost: true };
      const subRow = rs.find(r => r.row === '次要节点') || { major: major, row: '次要节点', __ghost: true };
      // 额外行 (非固定的, 按用户添加顺序)
      const customRows = rs.filter(r => r.row && !FIXED_ROWS.includes(r.row));

      // 顺序: 关键 / 次要 / custom 1 / custom 2 / ...
      const orderedRows = [keyRow, subRow, ...customRows];
      const rowspan = orderedRows.length;
      const majorEscaped = (major || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
      const majorCell =
        '<td class="border border-slate-300 px-2 py-2 text-center text-[10px] font-semibold bg-slate-200 align-middle" rowspan="' + rowspan + '">' +
          '<div class="flex flex-col items-center justify-center gap-1">' +
            '<div class="flex items-center gap-1">' +
              '<span>' + (major || '') + '</span>' +
              '<button type="button" onclick="App.s0301DelMajor(\'' + majorEscaped + '\')" class="text-rose-400 hover:text-rose-600 text-[10px]" title="删除该专业">×</button>' +
            '</div>' +
            '<button type="button" onclick="App.s0301AddRow(\'' + majorEscaped + '\')" class="text-[10px] px-1.5 py-0.5 rounded border border-slate-300 text-slate-600 hover:bg-white hover:border-blue-400 leading-none" title="在该专业下新增一行">+ 行</button>' +
          '</div>' +
        '</td>';

      // 行 label 单元格: 固定行 + 自定义行都支持点击编辑 + ×删除
      // 视觉上: 固定行 bg-slate-100, 自定义行 bg-amber-50 (区分用)
      const labelCell = (r) => {
        const isFixed = FIXED_ROWS.includes(r.row);
        const rowEscaped = (r.row || '').replace(/"/g, '&quot;').replace(/'/g, "\\'");
        const bgCls = isFixed ? 'bg-slate-100' : 'bg-amber-50';
        const hoverCls = isFixed ? 'hover:bg-slate-200' : 'hover:bg-amber-100';
        const tip = isFixed ? '点击改行名 (默认行, 可改)' : '点击改行名';
        return '<td class="border border-slate-300 px-1 py-1 text-center text-[10px] font-semibold ' + bgCls + ' w-24">' +
          '<div class="flex items-center justify-center gap-0.5">' +
            '<span class="s0301-row-label cursor-pointer ' + hoverCls + ' rounded px-1" onclick="App.s0301EditRow(\'' + majorEscaped + '\', \'' + rowEscaped + '\')" title="' + tip + '">' + (r.row || '') + '</span>' +
            '<button type="button" onclick="App.s0301DelRow(\'' + majorEscaped + '\', \'' + rowEscaped + '\')" class="text-rose-400 hover:text-rose-600 text-xs leading-none" title="删除该行">×</button>' +
          '</div>' +
        '</td>';
      };

      // 行 cell 月份渲染
      const renderCells = (r) => months.map(mo =>
        '<td class="border border-slate-300 px-1 py-1 text-[10px] bg-white/60 align-top">' +
          '<div class="s0301-cell" contenteditable="true" data-row-major="' + majorEscaped + '" data-row-type="' + (r.row || '').replace(/"/g, '&quot;') + '" data-month="' + mo + '">' +
            this._nl2br(r[mo]) +
          '</div>' +
        '</td>'
      ).join('');

      // 第一行带 majorCell (rowspan), 其余不渲染
      const trs = orderedRows.map((r, ri) => {
        if (ri === 0) {
          return '<tr>' + majorCell + labelCell(r) + renderCells(r) + '</tr>';
        }
        return '<tr>' + labelCell(r) + renderCells(r) + '</tr>';
      }).join('');

      return trs;
    }).join('');

    return '<div class="section-card">' +
      '<div class="section-header">' +
        '<div>' +
          '<div class="section-title">' + this.title + '一览表</div>' +
          '<div class="text-xs text-slate-500 mt-1">当前 ' + months.length + ' 个月份列 · 列头 ✎改标签 ×删除列 · 专业内 +行 / 行名 / ×行</div>' +
        '</div>' +
        '<div class="flex items-center gap-1">' +
          '<button type="button" onclick="App.s0301AddMonth()" class="text-xs px-2 py-1 rounded border border-blue-300 text-blue-700 hover:bg-blue-50" title="在末尾新增 1 个月份列">+ 新增月份</button>' +
          '<button type="button" onclick="App.s0301AddMajor()" class="text-xs px-2 py-1 rounded border border-slate-300 text-slate-600 hover:bg-white hover:border-blue-400">+ 新增专业</button>' +
        '</div>' +
      '</div>' +
      '<div class="section-body">' +
        '<div class="overflow-auto border border-slate-300 rounded-lg shadow-sm max-h-[560px] s0301-table-scroll">' +
          // v5.25: 节点表格字号调小一号 (text-xs 12px → text-[10px] 10px), 跟 08 一致
          '<table class="w-full text-[10px] border-collapse">' +
            '<colgroup>' +
              '<col style="width: 80px"><col style="width: 80px">' + months.map(() => '<col>').join('') +
            '</colgroup>' +
            '<thead><tr>' +
              '<th colspan="2" class="border border-blue-700/50 px-2 py-1.5 text-center text-white font-medium bg-blue-500">专业 / 时间</th>' +
              headCols +
            '</tr></thead>' +
            '<tbody>' + (rowsHtml || '<tr><td colspan="' + (2 + months.length) + '" class="p-6 text-center text-slate-400">暂无数据, 点击右上"新增专业"</td></tr>') + '</tbody>' +
          '</table>' +
        '</div>' +
      '</div>' +
    '</div>';
  },

  initFilter: function () {
    const cells = document.querySelectorAll('.s0301-cell');
    cells.forEach(cell => {
      cell.addEventListener('blur', function () {
        const major = cell.getAttribute('data-row-major');
        const rType = cell.getAttribute('data-row-type');
        const month = cell.getAttribute('data-month');
        const text = cell.innerText.replace(/\r\n/g, '\n').trim();
        if (typeof App !== 'undefined' && App.s0301UpdateCell) {
          App.s0301UpdateCell(major, rType, month, text);
        }
      });
      cell.addEventListener('focus', function () {
        if (cell.textContent.trim() === '') {
          cell.setAttribute('data-empty', '1');
        } else {
          cell.removeAttribute('data-empty');
        }
      });
    });
  }
};
