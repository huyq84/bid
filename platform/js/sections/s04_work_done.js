// platform/js/sections/s04_work_done.js
// 04 上周完成 - 重复型版式, repeatBy = area
// v5.3 - 主行 + 内嵌子表 (主行共享责任人/截止, 子项 = 内容 + 完成度)
window.Sections = window.Sections || {};
window.Sections["04"] = {
  title: "上周工作完成情况",
  _activeTab: "paste",
  _drafts: [],

  // 2.1 数据反推: 从 report.work_done 数组 groupBy area
  // v5.3: work_done 是嵌套结构, 主行 = { area, owner, deadline, items: [{ task, progress }] }
  materialize(report) {
    let rows = report.work_done || [];
    // 兜底: 旧 shape (task 在顶层) -> 走 Store.migrateWorkDone
    if (rows.length && !Array.isArray(rows[0].items) && typeof Store !== 'undefined' && Store.migrateWorkDone) {
      rows = Store.migrateWorkDone(rows);
    }
    const groups = {};
    rows.forEach(r => {
      const k = r.area || '未分类';
      if (!groups[k]) groups[k] = [];
      groups[k].push(r);
    });
    return Object.entries(groups).map(([area, rs]) => ({
      id: '04-' + slugify(area),
      keyValue: area,
      data: rs
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
              '<div class="text-xs text-slate-500 mt-1">暂无数据, 请新增事项组</div>' +
            '</div>' +
            '<button class="btn-primary" onclick="App.s04AddEmpty()">+ 新增事项组</button>' +
          '</div>' +
        '</div>';
    }
    let html = '';
    instances.forEach((inst, i) => {
      html += this.renderInstance(inst, i);
    });
    return html;
  },

  renderInstance(inst, idx) {
    // v5.3: 列 = 序号 | 计划事项及完成情况 (嵌套子表) | 责任人 | 截止 | 操作
    // 责任人/截止 主行共享; 子表 = 内容 + 完成度
    const headerCols = '' +
      '<th class="w-14 py-2 border-r border-emerald-800">序号</th>' +
      '<th class="py-2 px-4 border-r border-emerald-800">计划事项及完成情况</th>' +
      '<th class="w-32 py-2 text-center border-r border-emerald-800">责任人</th>' +
      '<th class="w-32 py-2 text-center border-r border-emerald-800">截止</th>' +
      '<th class="w-10 py-2 text-center" title="删除该事项组"></th>';

    const cellCls = 'border-b border-r border-emerald-800/40 px-2 py-1.5 align-top';

    const rowsHtml = inst.data.map((mainRow, mi) => {
      // 跳过旧 shape 的 header rows (迁移残留)
      if (mainRow.is_header) return '';
      const seq = mi + 1;
      const rowCls = (seq % 2 === 1) ? 'bg-blue-50/40' : 'bg-slate-50/40';
      return this._renderMainRow(inst, idx, mainRow, mi, seq, rowCls, cellCls);
    }).join('');

    // 计数: 只算非 header 的主行
    const realRowCount = inst.data.filter(r => !r.is_header).length;

    return '' +
      '<div class="instance-card" data-instance-id="' + inst.id + '">' +
        '<div class="instance-header">' +
          '<span class="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-700">区域: ' + inst.keyValue + '</span>' +
          '<span class="text-xs text-slate-400">' + realRowCount + ' 个事项组 · 对应 1 张 PPT 页</span>' +
          '<div class="flex items-center gap-1 ml-auto">' +
            '<button type="button" onclick="App.s04AddRow(' + idx + ')" class="text-xs px-2 py-1 rounded border border-slate-300 text-slate-600 hover:bg-white hover:border-blue-400">+ 事项组</button>' +
            '<button type="button" onclick="App.s04AddInstance(\'' + (inst.keyValue || '').replace(/'/g, "\\'") + '\')" class="text-xs px-2 py-1 rounded border border-slate-300 text-slate-600 hover:bg-white hover:border-blue-400">+ 新增区域</button>' +
          '</div>' +
        '</div>' +
        '<div class="border border-emerald-800/60 rounded-lg overflow-hidden shadow-sm bg-white/90">' +
          // v5.26: 主表字号 text-sm (14px) → text-xs (12px), 跟 08/0301 一致
          '<table class="w-full border-collapse text-xs s04-table">' +
            '<colgroup>' +
              '<col style="width: 56px"><col><col style="width: 128px"><col style="width: 128px"><col style="width: 40px">' +
            '</colgroup>' +
            '<thead><tr class="bg-blue-500 text-white">' + headerCols + '</tr></thead>' +
            '<tbody>' + rowsHtml + '</tbody>' +
          '</table>' +
        '</div>' +
      '</div>';
  },

  // 单个主行: 序号 | 嵌套子表 (内容 + 完成度 + ×) | 责任人 | 截止 | ×
  _renderMainRow(inst, idx, mainRow, mi, seq, rowCls, cellCls) {
    const items = Array.isArray(mainRow.items) ? mainRow.items : [];

    // 子表: 每条 = 内容 textarea (自动换行+撑高) | 完成度 select (小一号) | ×, 末尾 + 添加子项
    const subItemRows = items.map((item, ii) =>
      '<tr class="s04-item-row" data-mi="' + mi + '" data-ii="' + ii + '">' +
        '<td class="px-2 py-1.5 border-r border-slate-200">' +
          '<textarea class="form-input form-input-sm s04-task-area s04-subtask" rows="1" placeholder="事项内容..." onchange="App.s04UpdateItem(' + idx + ', ' + mi + ', ' + ii + ", 'task', this.value)\">" + (item.task || '') + '</textarea>' +
        '</td>' +
        '<td class="px-1 py-1 border-r border-slate-200 w-16 text-center">' +
          '<select class="form-select form-select-sm s04-progress" onchange="App.s04UpdateItem(' + idx + ', ' + mi + ', ' + ii + ", 'progress', this.value)\">" +
            ['0%', '25%', '50%', '75%', '100%'].map(p =>
              '<option ' + (item.progress === p ? 'selected' : '') + '>' + p + '</option>'
            ).join('') +
          '</select>' +
        '</td>' +
        '<td class="px-1 py-1 w-7 text-center">' +
          '<button type="button" class="text-rose-400 hover:text-rose-600 text-xs" onclick="App.s04RemoveItem(' + idx + ', ' + mi + ', ' + ii + ')" title="删除该子项">×</button>' +
        '</td>' +
      '</tr>'
    ).join('');

    const addItemRow = '<tr class="s04-add-item-row bg-slate-50/50">' +
      '<td colspan="3" class="px-2 py-1.5">' +
        '<button type="button" class="text-xs text-blue-600 hover:text-blue-800 hover:underline" onclick="App.s04AddItem(' + idx + ', ' + mi + ')">+ 添加子项</button>' +
      '</td>' +
    '</tr>';

    // v5.26: 子表字号 text-xs (12px) → text-[10px] (10px), 跟主表 12px 形成层级
    const subTable = '<table class="w-full border-collapse text-[10px] s04-subtable">' +
      '<tbody>' + subItemRows + addItemRow + '</tbody>' +
    '</table>';

    // 整行 (含主行操作)
    return '<tr class="' + rowCls + '" data-mi="' + mi + '">' +
      '<td class="' + cellCls + ' text-center">' + seq + '</td>' +
      '<td class="' + cellCls + ' p-0">' + subTable + '</td>' +
      '<td class="' + cellCls + ' text-center">' +
        '<select class="form-select form-select-sm" onchange="App.s04UpdateMainRow(' + idx + ', ' + mi + ", 'owner', this.value)\">" +
          ['', '侯 帅', '王 健', '陈 冲', '王亚广', '鲍永春', '袁永超', '李 欢', '乔志广', '徐诗怡', '李水旺', '李永旺'].map(o =>
            '<option ' + (mainRow.owner === o ? 'selected' : '') + '>' + o + '</option>'
          ).join('') +
        '</select>' +
      '</td>' +
      '<td class="' + cellCls + ' text-center">' +
        '<input class="form-input form-input-sm text-center" type="date" value="' + (mainRow.deadline || '') + '" onchange="App.s04UpdateMainRow(' + idx + ', ' + mi + ", 'deadline', this.value)\">" +
      '</td>' +
      '<td class="' + cellCls + ' text-center">' +
        '<button type="button" class="text-rose-400 hover:text-rose-600 text-xs" onclick="App.s04RemoveMainRow(' + idx + ', ' + mi + ')" title="删除该事项组">×</button>' +
      '</td>' +
    '</tr>';
  },

  // 子表 textarea 自动撑高 (事项内容可换行)
  initFilter: function () {
    const tas = document.querySelectorAll('.s04-subtask');
    tas.forEach(function (ta) {
      function autoSize() {
        ta.style.height = 'auto';
        ta.style.height = ta.scrollHeight + 'px';
      }
      autoSize();
      ta.addEventListener('input', autoSize);
    });
  }
};

// slugify: 中文 → 拼音首字母查表, 查不到 fallback 到 area-N
function slugify(s) {
  if (!s) return 'empty';
  const table = {
    '高管区':'gaoguan', '高管层':'gaoguan', '食堂区':'shitang', '食堂':'shitang',
    '北塔咖啡厅':'beita-kafeiting', '北咖啡厅':'beita-kafeiting',
    '南塔咖啡厅':'nanta-kafeiting', '南塔眼睛咖啡厅':'nanta-kafeiting',
    '南塔健身房':'nanta-jianshen', '北塔健身房':'beita-jianshen',
    '健身房':'janshen', '南门卫室':'nanmenweishi'
  };
  return table[s] || ('area-' + simpleHash(s));
}
function simpleHash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h) + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h).toString(36);
}
