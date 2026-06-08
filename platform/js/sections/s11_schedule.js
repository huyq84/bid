// platform/js/sections/s11_schedule.js
// 11 施工段计划 - 固定型 single, 数据源 pages_data['11']
// v5.11 - 每区域一张表 (instance-card pattern, 仿 s10 + s09 spacer)
//   1 区域 = 1 instance-card, header 含可编辑区域徽章 + 副标 + [删除该区域]
//   body 放 1 张表 (施工段 group + 工序行) + tfoot [+ 新增工序]
//   顶部 section-header 末尾 [+ 新增区域] 按钮
// v5.12 - 开始/完成时间改日期选择器 (月日显示, 不显年), 日历天改自动计算 (end - start)
// v5.14 - 层 sections 从全局 pd.sections 改为 per-area (area.sections), thead 末尾 [+] 加层
// v5.15 - 楼栋/施工段、部位、工序 3 列改为 per-area 配置 (area.baseColumns, 各区域独立可改可删),
//         表头 input 改 contenteditable (文字超出列宽自动换行)
//
// 共用工具 (顶层函数, app.js 也能引用, 避免循环依赖):
//   s11FormatDate(iso)     ISO 字符串 → "5/15"
//   s11ComputeDays(s, e)   两个 ISO 字符串 → 差值天, 缺一返回 ''
//   s11SectionColor(i)     施工段表头底色, 索引 → hex (支持任意段数, 越界用灰)
window.Sections = window.Sections || {};

function s11FormatDate(iso) {
  if (!iso) return '';
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return String(iso);
  return parseInt(m[2], 10) + '/' + parseInt(m[3], 10);
}
function s11ComputeDays(start, end) {
  if (!start || !end) return '';
  const s = new Date(start);
  const e = new Date(end);
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return '';
  const diff = Math.round((e - s) / 86400000);
  return diff > 0 ? diff : '';
}
function s11SectionColor(i) {
  const colors = ['#f4b084', '#a9d08e', '#9dc3e6', '#9dc3e6', '#9dc3e6', '#fcd34d', '#c4b5fd', '#fda4af'];
  return colors[i] || '#cbd5e1';
}
window.Sections["11"] = {
  title: "施工段划分与计划",  // v5.17: 合并 4.1 后的统一标题

  _data(report) {
    const pd = report.pages_data && report.pages_data['11'];
    return pd || { title: '26年5月施工进度计划跟踪表', areas: [] };
  },

  render(report) {
    const d = this._data(report);
    const areas = d.areas || [];
    const title = d.title || '26年5月施工进度计划跟踪表';

    const totalSteps = areas.reduce((sum, a) => sum + (a.steps || []).length, 0);
    const totalSections = areas.reduce((sum, a) => sum + ((a.sections || []).length), 0);
    const totalPhotos = areas.reduce((sum, a) => sum + ((a.photos || []).length), 0);

    // 顶部 section-card
    let html = '' +
      '<div class="section-card">' +
        '<div class="section-header">' +
          '<div>' +
            // 标题 (可编辑 input, 替代原 table 内的标题行)
            '<input class="text-base font-semibold text-slate-900 bg-transparent border-none focus:outline-none w-full" value="' + title.replace(/"/g, '&quot;') + '" onchange="App.s11UpdateTitle(this.value)">' +
            // v5.16: 副标加上"X 张图"统计 (4.1 合并进来)
            '<div class="text-xs text-slate-500 mt-1">' + totalSteps + ' 行工序 · ' + areas.length + ' 个区域 · ' + totalSections + ' 层(各区域独立) · ' + totalPhotos + ' 张划分图 · 黄色高亮=关键节点</div>' +
          '</div>' +
          '<div class="flex items-center gap-1">' +
            // v5.14: 顶部只有 [+ 新增区域] (层在每张表内 thead 末尾 [+] 新增, 各区域独立)
            '<button type="button" onclick="App.s11AddArea()" class="btn-primary text-xs">+ 新增区域</button>' +
            '<button type="button" onclick="App.s11AiExtend()" class="btn-ai text-xs">🤖 AI 续排</button>' +
          '</div>' +
        '</div>' +
        '<div class="section-body">';

    if (areas.length === 0) {
      html += '<div class="text-center text-slate-400 py-8 text-sm">暂无区域, 点击右上"新增区域"</div>';
    } else {
      areas.forEach((a, ai) => {
        html += this.renderArea(a, ai);
      });
    }

    html += '</div></div>' +
      // v5.16: 全局隐藏 file input (4.1 合并进来, 多 area 共享 1 个 input, targetArea/targetCol 写在 dataset)
      '<input type="file" id="s11-slot-input" accept="image/*" class="hidden" onchange="App.s11HandlePhotoUpload(this)">';
    return html;
  },

  // 1 个 instance-card = 1 区域 (内含 1 张表)
  //   columns: 序号 / 楼栋 / 部位 / 工序 / 层 × N (per-area, 各区域独立) / [+]
  //   - 楼栋: 每行独立可填, 默认=区域名, 留空也可 (用于一个区域跨多楼栋的场景)
  //   - 层: 每行 3 列 (开始/完成/日历天), 层名可编辑, × 删, thead 末尾 [+] 加新层
  //   tfoot: [+ 新增工序] 按钮 (仿 s09 spacer row, 留在表内)
  //   v5.14: sections 改 per-area (area.sections), 顶层不再有全局 sections
  renderArea(area, ai) {
    const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const areaSafe = esc(area.area);
    const steps = area.steps || [];
    const sections = area.sections || [];  // v5.14: per-area
    const photos = area.photos || [];      // v5.16: per-area 楼层划分图 (合并 4.1 进来)
    const baseColumns = area.baseColumns || [  // v5.15: per-area 基础列 (楼栋/施工段、部位、工序)
      { name: '楼栋/施工段', key: 'building' },
      { name: '部位',       key: 'part' },
      { name: '工序',       key: 'step' }
    ];
    // 列宽: 默认 key 给宽一点的, 未知 key 兜底 60px
    const baseColWidth = (c) => {
      if (c.key === 'building') return 80;
      if (c.key === 'part')     return 60;
      if (c.key === 'step')     return 200;
      return 60;
    };
    const totalCols = 1 + baseColumns.length + sections.length * 3 + 1;  // 序号 + 基础列 + 层×3 + [+] 末列

    // v5.16: 楼层划分图 image wall (合并 4.1 进来, 跟原 s10 样式一致: grid grid-cols-3 + 16:9 缩略图 + caption overlay + × 按钮)
    const photoSlots = [];
    for (let j = 0; j <= photos.length; j++) {
      const p = photos[j];
      if (p && p.url) {
        const caption = p.caption || ('图片 ' + (j + 1));
        const captionAttr = esc(caption);
        const nameAttr = esc(p.name);
        photoSlots.push(
          '<div class="border border-slate-300 rounded overflow-hidden aspect-video bg-slate-100 relative group">' +
            // v5.17: 图片可点击 → 灯箱全屏查看
            '<img src="' + p.url + '" class="w-full h-full object-cover cursor-zoom-in" onclick="App.s11ViewPhoto(' + ai + ', ' + j + ')" title="点击查看大图">' +
            '<div class="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent text-white text-xs p-2 pt-4">' +
              '<input class="w-full bg-transparent text-white text-xs placeholder-white/60 focus:outline-none focus:bg-black/40 rounded px-1" ' +
                'value="' + captionAttr + '" ' +
                (nameAttr ? 'title="原文件名: ' + nameAttr + '" ' : '') +
                'placeholder="楼层说明" onchange="App.s11UpdatePhotoCaption(' + ai + ', ' + j + ', this.value)">' +
            '</div>' +
            '<button type="button" onclick="App.s11UploadPhoto(' + ai + ', ' + j + ')" class="absolute top-1 left-1 bg-blue-500 text-white rounded px-1.5 py-0.5 text-[10px] opacity-0 group-hover:opacity-100 hover:bg-blue-600" title="替换图片">📷</button>' +
            '<button type="button" onclick="App.s11RemovePhoto(' + ai + ', ' + j + ')" class="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 text-xs opacity-0 group-hover:opacity-100 flex items-center justify-center hover:bg-red-600" title="删除">×</button>' +
          '</div>'
        );
      } else {
        const isTrailing = (j === photos.length);
        photoSlots.push(
          '<div onclick="App.s11UploadPhoto(' + ai + ', ' + j + ')" class="border-2 border-dashed ' + (isTrailing ? 'border-blue-300 bg-blue-50/30' : 'border-slate-300 bg-slate-50') + ' rounded aspect-video flex flex-col items-center justify-center text-slate-400 hover:border-blue-400 hover:text-blue-500 cursor-pointer">' +
            '<span class="text-2xl">+</span>' +
            '<span class="text-[10px] mt-1">' + (isTrailing ? '添加楼层图' : '点击上传') + '</span>' +
          '</div>'
        );
      }
    }

    // v5.15: 第一层表头 = 可编辑基础列名 + × 删除按钮 (各区域独立, 跟 layers 同款 contenteditable, 文字超长自动换行)
    const baseColHeaderCells = baseColumns.map((c, ci) =>
      '<th class="border border-slate-400 px-1 py-1 text-center" rowspan="2" style="width:' + baseColWidth(c) + 'px">' +
        '<div class="flex items-center justify-center gap-1">' +
          '<div contenteditable="plaintext-only" class="s11-section-name" data-area="' + ai + '" data-bcol="' + ci + '" ' +
            'data-original="' + esc(c.name) + '" data-placeholder="列名" ' +
            'onblur="App.s11UpdateBaseColName(this, ' + ai + ', ' + ci + ')" ' +
            'onkeydown="if(event.key===\'Enter\'){event.preventDefault();this.blur();} if(event.key===\'Escape\'){event.preventDefault();this.innerText=this.dataset.original;this.blur();}" ' +
            'title="点击改列名 (Enter 保存 / Esc 取消)">' + esc(c.name) + '</div>' +
          '<button type="button" onclick="App.s11RemoveBaseCol(' + ai + ', ' + ci + ')" class="text-rose-700 hover:text-rose-900 opacity-60 hover:opacity-100 text-base leading-none px-1" title="删除该列 (会清空本区域所有工序在该列的数据)">×</button>' +
        '</div>' +
      '</th>'
    ).join('');

    // v5.14: 第一层表头 = 可编辑层名 + × 删除按钮 (各区域独立, contenteditable, 文字超长自动换行)
    const sectionHeaderCells = sections.map((s, i) =>
      // v5.27: 层表头 text-xs 12px → text-[10px] 10px, 跟其他表格一致
      '<th class="border border-slate-400 px-1 py-1 text-center text-[10px] font-bold" colspan="3" style="background:' + s11SectionColor(i) + '">' +
        '<div class="flex items-center justify-center gap-1">' +
          '<div contenteditable="plaintext-only" class="s11-section-name" data-area="' + ai + '" data-section="' + i + '" ' +
            'data-original="' + esc(s.name) + '" data-placeholder="层名" ' +
            'onblur="App.s11UpdateSectionName(this, ' + ai + ', ' + i + ')" ' +
            'onkeydown="if(event.key===\'Enter\'){event.preventDefault();this.blur();} if(event.key===\'Escape\'){event.preventDefault();this.innerText=this.dataset.original;this.blur();}" ' +
            'title="点击改层名 (Enter 保存 / Esc 取消)">' + esc(s.name) + '</div>' +
          '<button type="button" onclick="App.s11RemoveSection(' + ai + ', ' + i + ')" class="text-rose-700 hover:text-rose-900 opacity-60 hover:opacity-100 text-base leading-none px-1" title="删除该层 (会清空本区域所有工序在此层的 3 列)">×</button>' +
        '</div>' +
      '</th>'
    ).join('');

    // v5.14: thead 末尾 [+] 单元格 (rowspan=2, 给本 area 加新层)
    const addSectionCell = '<th class="border border-slate-400 px-1 py-1 text-center bg-slate-50" rowspan="2" style="width:32px">' +
      '<button type="button" onclick="App.s11AddSection(' + ai + ')" class="text-blue-600 hover:text-blue-800 hover:underline text-base leading-none font-bold" title="新增层 (本区域独立)">+</button>' +
    '</th>';

    // 第二层表头: start / end / days × N
    const subHeaderCells = sections.map(() =>
      '<th class="border border-slate-400 px-1 py-1 text-center text-[11px]">开始时间</th>' +
      '<th class="border border-slate-400 px-1 py-1 text-center text-[11px]">完成时间</th>' +
      '<th class="border border-slate-400 px-1 py-1 text-center text-[11px]">日历天</th>'
    ).join('');

    // v5.27: 单元格字号 text-xs 12px → text-[10px] 10px
    const cellCls = 'border border-slate-400 px-1 py-1 text-center text-[10px]';
    const cellClsLast = 'border border-slate-300';  // 末列 [+] 占位 (数据行不渲染 +, 留空)

    // 数据行
    let trs = '';
    if (steps.length === 0) {
      trs = '<tr><td colspan="' + totalCols + '" class="p-4 text-center text-slate-400 text-[10px]">' + (sections.length === 0 ? '本区域无层, 点击表头 [+] 新增层' : '暂无工序, 点击底部"新增工序"') + '</td></tr>';
    } else {
      steps.forEach((r, ri) => {
        // v5.12: 按 (start, end, days) 三元组渲染, 取代旧的"一格一输入"模式
        //   - start/end: HTML5 date picker, 显示月日 (M/D, 无年), 内部存 ISO
        //   - days: 静态, 渲染时 s11ComputeDays(start, end) 自动算
        let cellsHtml = '';
        for (let si = 0; si < sections.length; si++) {
          const startIdx = si * 3;
          const endIdx = startIdx + 1;
          const daysIdx = startIdx + 2;
          const startIso = r.cells[startIdx] || '';
          const endIso = r.cells[endIdx] || '';
          const days = s11ComputeDays(startIso, endIso);
          const isStartHl = r.highlight && r.highlight.includes(String(startIdx));
          const isEndHl = r.highlight && r.highlight.includes(String(endIdx));
          const isDaysHl = r.highlight && r.highlight.includes(String(daysIdx));
          // 开始时间
          cellsHtml += '<td class="' + cellCls + '">' +
            '<span class="s11-date-wrap' + (isStartHl ? ' is-highlight' : '') + '" data-display="' + s11FormatDate(startIso) + '">' +
              '<input type="date" class="s11-date-input" value="' + startIso + '" onchange="App.s11UpdateDate(this, ' + ai + ', ' + ri + ', ' + startIdx + ')">' +
            '</span>' +
          '</td>';
          // 完成时间
          cellsHtml += '<td class="' + cellCls + '">' +
            '<span class="s11-date-wrap' + (isEndHl ? ' is-highlight' : '') + '" data-display="' + s11FormatDate(endIso) + '">' +
              '<input type="date" class="s11-date-input" value="' + endIso + '" onchange="App.s11UpdateDate(this, ' + ai + ', ' + ri + ', ' + endIdx + ')">' +
            '</span>' +
          '</td>';
          // 日历天 (静态, 自动计算, 不可编辑)
          cellsHtml += '<td class="' + cellCls + ' s11-days-cell' + (isDaysHl ? ' is-highlight' : '') + '" data-cell-idx="' + daysIdx + '">' + days + '</td>';
        }
        // v5.18: 基础列数据 cell 改 contenteditable div (input 单行截字, 改 div 才能超宽自动换行)
        //   - 楼栋/施工段、部位、工序 都允许超长换行
        //   - Enter 保存, Esc 取消, Shift+Enter 换行
        //   - 楼栋列 placeholder = 区域名 (跟 input 时代一致)
        const baseColCells = baseColumns.map((c) => {
          const isStep = c.key === 'step';
          const isBuilding = c.key === 'building';
          const tdClass = cellCls + (isStep ? ' text-left' : '');
          const cellClass = 's11-cell-edit' + (isStep ? ' text-left' : ' text-center');
          const defaultVal = isBuilding ? (area.area || '') : '';
          const value = esc(r[c.key] != null ? r[c.key] : defaultVal);
          const placeholder = isBuilding ? esc(area.area) : '点击输入';
          return '<td class="' + tdClass + '">' +
            '<div contenteditable="plaintext-only" class="' + cellClass + '" ' +
              'data-row="' + ri + '" data-key="' + c.key + '" ' +
              'data-original="' + value + '" data-placeholder="' + placeholder + '" ' +
              'onblur="App.s11UpdateField(' + ai + ', ' + ri + ", '" + c.key + "', this.innerText)\" " +
              'onkeydown="if(event.key===\'Enter\' && !event.shiftKey){event.preventDefault();this.blur();} if(event.key===\'Escape\'){event.preventDefault();this.innerText=this.dataset.original;this.blur();}" ' +
              'title="点击编辑 (Enter 保存 / Shift+Enter 换行 / Esc 取消)">' + value + '</div>' +
          '</td>';
        }).join('');
        trs += '' +
          '<tr>' +
            // 序号 按区域单独 1,2,3... 计数 (ri 是该 area 内行索引, 不混全局 seq)
            '<td class="' + cellCls + '">' + (ri + 1) + '</td>' +
            baseColCells +
            cellsHtml +
            // 末列 [+] 占位 (数据行不渲染 +, 留空)
            '<td class="' + cellClsLast + '"></td>' +
          '</tr>';
      });
    }

    return '' +
      '<div class="instance-card mb-4" data-instance-id="s11-' + ai + '">' +
        '<div class="instance-header">' +
          // 区域徽章 (可编辑 input, 跟 s10 完全一致)
          '<input class="s10-area-input" ' +
            'value="' + areaSafe + '" data-original="' + areaSafe + '" data-area="' + ai + '" ' +
            'onchange="App.s11UpdateArea(this)" ' +
            'onkeydown="if(event.key===\'Enter\'){event.preventDefault();this.blur();} if(event.key===\'Escape\'){event.preventDefault();this.value=this.defaultValue;this.blur();}" ' +
            'placeholder="区域名" title="点击改区域名 (Enter 保存 / Esc 取消)">' +
          // 副标 (v5.16: 加 "X 张图" 计数)
          '<span class="text-xs text-slate-400">' + steps.length + ' 行工序 · ' + baseColumns.length + ' 列 · ' + sections.length + ' 层 · ' + photos.length + ' 张图</span>' +
          // 右侧按钮 (v5.23: 删除按钮左侧加 [+ 新增区域], 用户在区域卡内就能直接加新区域, 不用滚回顶部)
          '<div class="ml-auto flex items-center gap-1">' +
            '<button type="button" onclick="App.s11AddArea()" class="text-[10px] px-2 py-1 rounded border border-blue-300 text-blue-600 hover:bg-blue-50">+ 新增区域</button>' +
            '<button type="button" onclick="App.s11RemoveArea(' + ai + ')" class="text-[10px] px-2 py-1 rounded border border-rose-300 text-rose-500 hover:bg-rose-50">删除该区域</button>' +
          '</div>' +
        '</div>' +
        // v5.16: 楼层划分图 image wall (在 instance-header 和 表之间)
        '<div class="px-3 pt-3 pb-2">' +
          '<div class="text-xs text-slate-500 mb-2 font-medium">楼层划分图 · ' + photos.length + ' 张</div>' +
          '<div class="grid grid-cols-3 gap-3">' + photoSlots.join('') + '</div>' +
        '</div>' +
        // 表 (v5.11: 横向可滚, 避免 4 基础列 + 多层 + [+] 超出容器)
        //   v5.20: 加竖向滚动 (max-height, overflow-y), 区域多工序时表内自滚
        //   v5.27: 表格字号 text-xs 12px → text-[10px] 10px, 跟 04/08/0301/09 一致
        '<div class="s11-table-scroll border border-slate-400 rounded shadow-sm bg-white mx-3 mb-3">' +
          '<table class="s11-table w-full border-collapse text-[10px]" style="table-layout: fixed; min-width: 480px;">' +
            '<colgroup>' +
              '<col style="width:36px">' +
              baseColumns.map(c => '<col style="width:' + baseColWidth(c) + 'px">').join('') +
              sections.map(() => '<col style="width:50px"><col style="width:50px"><col style="width:32px">').join('') +
              '<col style="width:32px">' +  // 末列 [+]
            '</colgroup>' +
            '<thead>' +
              '<tr>' +
                '<th class="border border-slate-400 px-2 py-1.5 text-center" rowspan="2" style="width:36px">序号</th>' +
                baseColHeaderCells +
                sectionHeaderCells +
                addSectionCell +
              '</tr>' +
              (sections.length > 0 ? '<tr>' + subHeaderCells + '</tr>' : '') +
            '</thead>' +
            '<tbody>' + trs + '</tbody>' +
            '<tfoot>' +
              '<tr class="bg-slate-50/70 hover:bg-slate-100">' +
                '<td colspan="' + totalCols + '" class="border-t border-slate-300 px-2 py-1.5 text-center text-xs">' +
                  '<button type="button" onclick="App.s11AddRowInArea(' + ai + ')" class="text-blue-600 hover:text-blue-800 hover:underline">' +
                    '+ 新增工序' +
                  '</button>' +
                '</td>' +
              '</tr>' +
            '</tfoot>' +
          '</table>' +
        '</div>' +
      '</div>';
  },

  initFilter() {
    // 没有特殊初始化
  }
};
