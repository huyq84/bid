// platform/js/sections/s09_plan.js
// 09 下周周计划 - 固定型 single, 数据源 pages_data['09'].rows
// v5.2 - 标题行 + 双表头 + 7 天日期 + 21 行 4 area 组 + 按钮矩阵
window.Sections = window.Sections || {};
window.Sections["09"] = {
  title: "下周周计划",
  _activeTab: "ai",
  _drafts: [],

  // 7 天日期: 优先用 pages_data['09'].dates (用户手动改过的), 否则从 period.start 算
  // 星期从日期本身反推 (date.getDay()), 跟位置解耦 —— 用户改一个日期, 整周 shift
  _calcDates(report) {
    const pd = report.pages_data && report.pages_data['09'];
    const override = pd && Array.isArray(pd.dates) ? pd.dates : null;
    const startStr = report && report.period && report.period.start;
    const WKS = ['日','一','二','三','四','五','六'];   // getDay: 0=日, 1=一, ..., 6=六
    const isoFromDate = (d) => d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    const parseIso = (iso) => { const p = iso.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); };
    const wkFromIso = (iso) => WKS[parseIso(iso).getDay()];
    const mdFromIso = (iso) => {
      const d = parseIso(iso);
      return (d.getMonth()+1) + '月' + d.getDate() + '日';
    };

    if (!startStr) {
      const d = new Date();
      const out = [];
      for (let i = 0; i < 7; i++) {
        const x = new Date(d);
        x.setDate(d.getDate() + i);
        const iso = (override && override[i]) || isoFromDate(x);
        out.push({ wk: wkFromIso(iso), md: mdFromIso(iso), iso: iso });
      }
      return out;
    }
    const parts = startStr.split('-');
    const base = new Date(+parts[0], +parts[1] - 1, +parts[2]);
    const out = [];
    for (let i = 0; i < 7; i++) {
      const x = new Date(base);
      x.setDate(base.getDate() + i);
      const iso = (override && override[i]) || isoFromDate(x);
      out.push({ wk: wkFromIso(iso), md: mdFromIso(iso), iso: iso });
    }
    return out;
  },

  // 计算每个 area 占据多少行 (用于 area 列 rowspan)
  _areaSpans(rows) {
    const map = [];
    let cur = null, cnt = 0;
    rows.forEach((p, i) => {
      if (p.area !== cur) {
        if (cur) map.push({ area: cur, count: cnt });
        cur = p.area;
        cnt = 1;
      } else {
        cnt++;
      }
    });
    if (cur) map.push({ area: cur, count: cnt });
    return map;
  },

  render(report) {
    const pd = report.pages_data && report.pages_data['09'];
    const rows = (pd && pd.rows) || [];
    const dates = this._calcDates(report);
    const spans = this._areaSpans(rows);

    // 渲染行
    let spanIdx = 0;
    let rowSpanLeft = 0;
    const trs = rows.map((p, i) => {
      const isManual = !!p.manual_mode;
      // 算 area 单元: 首行用 rowspan, 其余不渲染
      // 区域名可编辑(点击 input 直接改, 改名同步到该 area 组所有行)
      // 右侧 × 按钮: 删整个 area 组(弹确认)
      let areaCell = '';
      if (rowSpanLeft === 0 && spanIdx < spans.length) {
        const sp = spans[spanIdx];
        if (sp.count > 0) {
          const aSafe = (sp.area || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;');
          // v5.27: 单元格字号调小一号 (text-xs 12px → text-[10px] 10px), 跟 04/08/0301 一致
          areaCell = '<td class="border border-emerald-800/40 px-1 py-1 text-center text-[10px] font-semibold bg-blue-50 align-middle" rowspan="' + sp.count + '">' +
            '<div class="flex flex-col items-center justify-center gap-1 h-full">' +
              '<input class="s09-area-input w-full text-center bg-transparent border-b border-blue-300 focus:outline-none focus:border-blue-600" ' +
                'value="' + aSafe + '" data-original="' + aSafe + '" ' +
                'onchange="App.s09UpdateArea(this)" ' +
                'onkeydown="if(event.key===\'Enter\'){event.preventDefault();this.blur();} if(event.key===\'Escape\'){event.preventDefault();this.value=this.defaultValue;this.blur();}" ' +
                'title="点击改区域名 (Enter 保存 / Esc 取消)">' +
              '<button type="button" class="text-rose-400 hover:text-rose-600 text-[10px] leading-none" ' +
                'data-area="' + aSafe + '" onclick="App.s09DeleteArea(this)" ' +
                'title="删除该区域及 ' + sp.count + ' 行">× 删区域</button>' +
            '</div>' +
          '</td>';
          rowSpanLeft = sp.count - 1;
          spanIdx++;
        }
      } else {
        rowSpanLeft--;
      }

      const cellsHtml = p.progress.map((s, k) => {
        const isFill = s === 'fill';
        const disabledCls = isManual ? 'opacity-30 pointer-events-none' : 'cursor-pointer hover:bg-blue-100';
        return '<td class="border border-emerald-800/40 p-0">' +
          '<div class="progress-cell ' + disabledCls + ' ' + (isFill ? 'is-fill' : '') + '" ' +
               'data-row="' + i + '" data-col="' + k + '" ' +
               'onclick="App.s09ToggleCell(' + i + ', ' + k + ')">' +
            (isFill ? '<div class="progress-fill"></div>' : '') +
          '</div>' +
        '</td>';
      }).join('');

      const daysCell = isManual
        ? '<input class="form-input form-input-sm text-center" type="number" min="0" max="7" value="' + (p.days || 0) + '" onchange="App.s09UpdateDays(' + i + ', this.value)">'
        : // v5.27: 工作天数 text-sm 14px → text-xs 12px (自动统计时, 跟表内其他单元一致)
          '<span class="text-xs font-bold text-slate-700">' + ((p.progress || []).filter(s => s === 'fill').length) + '</span>';

      // 劳动力 = labor + headcount
      const laborVal = (p.labor || '') + (p.headcount ? (p.headcount + '人') : '');

      let html = '' +
        '<tr>' +
          // v5.27: 单元格字号调小一号 (text-xs 12px → text-[10px] 10px)
          '<td class="border border-emerald-800/40 px-1 py-1 text-center text-[10px] text-slate-500">' + (i + 1) + '</td>' +
          areaCell +
          '<td class="border border-emerald-800/40 px-2 py-1 text-[10px]">' +
            '<textarea class="form-input form-input-sm s04-task-area" rows="1" onchange="App.s09Update(' + i + ", 'task', this.value)\">" + (p.task || '') + '</textarea>' +
          '</td>' +
          '<td class="border border-emerald-800/40 p-0 text-center">' + daysCell + '</td>' +
          cellsHtml +
          '<td class="border border-emerald-800/40 px-1 py-0.5 text-[10px]">' +
            '<div class="flex flex-col gap-0.5">' +
              '<input class="form-input form-input-sm text-center" value="' + (p.labor || '').replace(/"/g, '&quot;') + '" onchange="App.s09Update(' + i + ", 'labor', this.value)\" placeholder=\"工种\">" +
              '<input class="form-input form-input-sm text-center" type="number" min="0" value="' + (p.headcount || '') + '" onchange="App.s09Update(' + i + ", 'headcount', this.value)\" placeholder=\"人数\" title=\"人数\">" +
            '</div>' +
          '</td>' +
          '<td class="border border-emerald-800/40 px-1 py-1 text-center text-[10px]">' +
            '<input class="form-input form-input-sm text-center" value="' + (p.material || '').replace(/"/g, '&quot;') + '" onchange="App.s09Update(' + i + ", 'material', this.value)\">" +
          '</td>' +
          '<td class="border border-emerald-800/40 px-1 text-center">' +
            '<div class="flex flex-col items-center gap-0.5">' +
              '<label class="inline-flex items-center cursor-pointer" title="手动模式">' +
                '<input type="checkbox" ' + (isManual ? 'checked' : '') + ' onchange="App.s09ToggleManual(' + i + ', this.checked)" class="sr-only peer">' +
                '<div class="w-7 h-3.5 bg-slate-200 rounded-full peer peer-checked:bg-blue-600 relative transition">' +
                  '<div class="absolute top-0.5 left-0.5 w-2.5 h-2.5 bg-white rounded-full transition peer-checked:translate-x-3.5"></div>' +
                '</div>' +
              '</label>' +
              '<button type="button" class="text-rose-400 hover:text-rose-600 text-xs" onclick="App.s09Remove(' + i + ')" title="删除该行">×</button>' +
            '</div>' +
          '</td>' +
        '</tr>';

      // v5.3: 每个 area 组的最后一行后插入 "在本区域新增一行" 按钮行
      //   rowSpanLeft === 0 表示这是当前组的最后一行 (组内单行时 sp.count=1 也是同样情况)
      //   spans[spanIdx - 1] 是刚渲染完的组
      if (rowSpanLeft === 0 && spans[spanIdx - 1]) {
        const finishedArea = spans[spanIdx - 1].area || '未命名';
        html += '' +
          '<tr class="bg-slate-50/50 hover:bg-slate-100/70">' +
            '<td colspan="' + (4 + 7 + 3) + '" class="border-b border-emerald-800/30 px-2 py-1.5 text-center text-[10px]">' +
              '<button type="button" onclick="App.s09AddRowInArea(\'' + finishedArea.replace(/'/g, "\\'") + '\')" class="text-blue-600 hover:text-blue-800 hover:underline">' +
                '+ 在 ' + finishedArea + ' 新增一行' +
              '</button>' +
            '</td>' +
          '</tr>';
      }
      return html;
    }).join('');

    // 表头 (1 行): 序号/区域/工作内容/工作天数 + 7 个 (周X + 短日期 MM-DD) 紧凑单元 + 劳动力/材料/×
    // 标题行在 table 外面, thead 紧凑单行, 整体 sticky
    // 短日期 "5-18" 用 wrapper::before 自定义渲染, 底下是真 <input type="date">, 点击直接触发原生 picker
    //   (input 透明盖在 wrapper 上, 浏览器内部存 YYYY-MM-DD, 视觉走 ::before 的 "5-18")
    const mdShort = (iso) => {
      const p = iso.split('-');
      return +p[1] + '-' + +p[2];   // "5-18" (去前导 0)
    };
    const dayCols = dates.map((d, i) =>
      '<th class="border border-emerald-800/40 px-0 py-0.5 text-center bg-blue-500 text-white s09-th-sticky" data-date-col="' + i + '">' +
        '<div class="s09-wk leading-none">周' + d.wk + '</div>' +
        '<span class="s09-date-wrap" data-display="' + mdShort(d.iso) + '" title="周' + d.wk + ' · ' + d.md + ' · 点击改日期">' +
          '<input type="date" id="s09-date-input-' + i + '" class="s09-date-input" value="' + d.iso + '" onchange="App.s09UpdateDate(' + i + ', this.value)" aria-label="周' + d.wk + '日期">' +
        '</span>' +
      '</th>'
    ).join('');

    return '' +
      '<div class="section-card">' +
        '<div class="section-header s09-section-sticky">' +
          '<div>' +
            '<div class="section-title">下周周计划</div>' +
            '<div class="text-xs text-slate-500 mt-1">' + rows.length + ' 行 · ' + spans.length + ' 个区域分组 · 工作天数自动统计 · 日期可改</div>' +
          '</div>' +
          '<div class="flex gap-2">' +
            '<button type="button" onclick="App.s09AiPlan()" class="btn-ai text-xs">🤖 AI 智能排</button>' +
            '<button type="button" onclick="App.s09ResetDates()" class="btn-ghost text-xs" title="清空自定义日期, 回到从报告周期起算">↺ 重置日期</button>' +
            '<button type="button" onclick="App.s09AddArea()" class="btn-ghost text-xs">+ 新增区域</button>' +
          '</div>' +
        '</div>' +
        '<div class="section-body">' +
          // 标题行 (在表格外, 也做 sticky: 排在 thead 之上, top:0; thead 退到 top:34px 避免覆盖)
          '<div class="border border-emerald-800/60 border-b-0 rounded-t-lg px-2 py-1.5 text-center text-sm font-bold bg-white s09-title-sticky">北京清尚—食堂/南北塔健身房/北塔高管层/南北塔咖啡厅精装周工作计划</div>' +
          // 滚动容器 (只滚动 tbody; thead 由 sticky 固定)
          '<div class="border border-emerald-800/60 border-t-0 rounded-b-lg shadow-sm bg-white s09-table-scroll">' +
            // v5.27: 表格字号 text-xs (12px) → text-[10px] (10px), 跟 04/08/0301 一致
            '<table class="w-full border-collapse text-[10px] s09-table" style="min-width:810px">' +
              '<colgroup>' +
                '<col style="width:30px">' +                          // 序号
                '<col style="width:70px">' +                         // 区域
                '<col style="width:170px">' +                        // 工作内容
                '<col style="width:50px">' +                         // 工作天数
                dates.map(() => '<col style="width:42px">').join('') + // 周一~周日
                '<col style="width:80px">' +                         // 劳动力需求 (工种 + 人数 上下)
                '<col style="width:80px">' +                         // 材料准备
                '<col style="width:36px">' +                         // ×
              '</colgroup>' +
              '<thead>' +
                // 紧凑单行: 星期与日期选在同一个 th 内, 永远贴在一起
                '<tr class="bg-blue-500 text-white s09-th-sticky-row">' +
                  '<th class="border border-emerald-800/60 px-1 py-1.5 text-center s09-th-sticky">序号</th>' +
                  '<th class="border border-emerald-800/60 px-1 py-1.5 text-center s09-th-sticky">区域</th>' +
                  '<th class="border border-emerald-800/60 px-1 py-1.5 text-center s09-th-sticky">工作内容</th>' +
                  '<th class="border border-emerald-800/60 px-1 py-1.5 text-center s09-th-sticky">工作天数</th>' +
                  dayCols +
                  '<th class="border border-emerald-800/60 px-1 py-1.5 text-center s09-th-sticky">劳动力<br/>需求</th>' +
                  '<th class="border border-emerald-800/60 px-1 py-1.5 text-center s09-th-sticky">材料准备</th>' +
                  '<th class="border border-emerald-800/60 px-1 py-1.5 text-center s09-th-sticky"></th>' +
                '</tr>' +
              '</thead>' +
              '<tbody>' + (trs || '<tr><td colspan="' + (4 + 7 + 3) + '" class="p-6 text-center text-slate-400">暂无数据, 点击右上"新增一行"</td></tr>') + '</tbody>' +
            '</table>' +
          '</div>' +
        '</div>' +
      '</div>';
  },

  // 渲染后让所有 task textarea 自动撑高 (复用 s04-task-area 的 CSS)
  initFilter() {
    const tas = document.querySelectorAll('.s04-task-area');
    tas.forEach(ta => {
      const autoSize = () => { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; };
      autoSize();
      ta.addEventListener('input', autoSize);
    });
  }
};
