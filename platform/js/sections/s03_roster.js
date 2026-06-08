// platform/js/sections/s03_roster.js
// 03 组织架构 - 固定型 single
window.Sections = window.Sections || {};
window.Sections["03"] = {
  title: "到岗管理人员",

  // 取职务选项: DEFAULT_ROLES (内置字典) ∪ 当前 list 已有 role, 去重
  _ensureRoleDatalist: function () {
    const roleSet = {};
    const defaults = (window.Store && window.Store.DEFAULT_ROLES) || [];
    defaults.forEach(r => { roleSet[r] = 1; });
    const list = window._report && window._report() && window._report().pages_data
      && window._report().pages_data['03'] && window._report().pages_data['03'].rows;
    if (list) list.forEach(r => { if (r.role) roleSet[r.role] = 1; });
    return Object.keys(roleSet);
  },

  render(report) {
    const list = (report.pages_data && report.pages_data['03'] && report.pages_data['03'].rows) || [];
    const presentCount = list.filter(r => r.present).length;
    const roleOptions = this._ensureRoleDatalist();

    const rows = list.map((r, i) => {
      const zebra = (i % 2 === 1) ? 'bg-slate-50' : '';
      // 职务列: 自定义下拉 (点击展开 29 个建议 + 可手输)
      const currentRole = r.role || '';
      const roleInput = '<div class="relative s03-role-dd" data-idx="' + i + '">' +
        '<input class="form-input form-input-sm s03-role-input" data-idx="' + i + '" value="' + currentRole + '" placeholder="点击选择或手输职务" autocomplete="off">' +
        '<div class="s03-role-panel hidden absolute z-20 mt-1 left-0 w-full bg-white border border-slate-200 rounded-md shadow-lg max-h-60 overflow-y-auto">' +
          roleOptions.map(role => {
            const isSelected = role === currentRole;
            const baseCls = 's03-role-opt px-2 py-1 text-xs cursor-pointer flex items-center gap-1.5';
            const cls = isSelected
              ? baseCls + ' bg-blue-50 text-blue-700 font-medium border-l-2 border-blue-500'
              : baseCls + ' text-slate-700 hover:bg-blue-50';
            return '<div class="' + cls + '" data-value="' + role + '">' +
              (isSelected ? '<svg class="w-3 h-3 text-blue-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>' : '<span class="w-3 flex-shrink-0"></span>') +
              '<span>' + role + '</span>' +
            '</div>';
          }).join('') +
        '</div>' +
      '</div>';
      // 变化列: 已到岗 -> 在岗/新到/已离职 三态按钮; 未到岗 -> 可换行文本框
      let deltaCell;
      const reasonVal = (r.reason || '').replace(/"/g, '&quot;');
      if (r.present) {
        deltaCell = `<div class="inline-flex border border-slate-200 rounded overflow-hidden text-[11px] leading-none">
            <button type="button" data-delta="carry" onclick="App.s03SetDelta(${i}, 'carry')" class="px-1.5 py-1 ${(!r.delta || r.delta === 'carry') ? 'bg-slate-700 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}">在岗</button>
            <button type="button" data-delta="new" onclick="App.s03SetDelta(${i}, 'new')" class="px-1.5 py-1 border-l border-slate-200 ${r.delta === 'new' ? 'bg-emerald-500 text-white' : 'bg-white text-slate-600 hover:bg-emerald-50'}">新到</button>
            <button type="button" data-delta="leave" onclick="App.s03SetDelta(${i}, 'leave')" class="px-1.5 py-1 border-l border-slate-200 ${r.delta === 'leave' ? 'bg-rose-500 text-white' : 'bg-white text-slate-600 hover:bg-rose-50'}">已离职</button>
          </div>`;
      } else {
        deltaCell = `<textarea rows="2" class="w-full text-[11px] border border-amber-300 bg-amber-50 text-amber-900 rounded px-1.5 py-1 resize-y focus:outline-none focus:ring-2 focus:ring-amber-400" placeholder="请输入未到岗原因,例如:事假/病假/出差/调休等" onchange="App.s03Update(${i}, 'reason', this.value)">${r.reason || ''}</textarea>`;
      }
      return `
      <tr class="hover:bg-blue-50 ${zebra}">
        <td class="text-center text-slate-500">${r.seq || (i+1)}</td>
        <td>${roleInput}</td>
        <td><input class="form-input form-input-sm" value="${r.name || ''}" placeholder="姓名" onchange="App.s03Update(${i}, 'name', this.value)"></td>
        <td><input class="form-input form-input-sm" value="${r.phone || ''}" placeholder="电话" onchange="App.s03Update(${i}, 'phone', this.value)"></td>
        <td class="text-center">
          <input type="checkbox" ${r.present ? 'checked' : ''} onchange="App.s03Update(${i}, 'present', this.checked)">
        </td>
        <td class="text-center">
          ${deltaCell}
        </td>
      </tr>
    `;
    }).join('');

    // 右侧图片 + 标签
    const uiCfg = (report.ui_config = report.ui_config || {});
    const photoData = uiCfg.s03_photo || '';
    const photoCaption = uiCfg.s03_photo_caption || '百瑞达工坊办公室';
    const photoBoxInner = photoData
      ? '<img src="' + photoData + '" class="w-full h-full object-cover" alt="办公场景">'
      : '<div class="w-full h-full flex flex-col items-center justify-center text-slate-400">' +
          '<svg class="w-14 h-14 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/></svg>' +
          '<span class="text-xs">办公场景照片占位</span>' +
        '</div>';

    return `<div class="section-card">
      <div class="section-header">
        <div>
          <div class="section-title">${this.title}</div>
          <div class="text-xs text-slate-500 mt-1">${list.length} 人 · 到岗 ${presentCount} 人</div>
        </div>
        <div class="flex items-center gap-1">
          <button type="button" onclick="App.s03AddRow()" class="text-xs px-2 py-1 rounded border border-slate-300 text-slate-600 hover:bg-white hover:border-blue-400">+ 新增</button>
        </div>
      </div>
      <div class="section-body">
        <div class="grid grid-cols-12 gap-6">
          <!-- 左侧: 名单表 -->
          <div class="col-span-7">
            <div class="border border-slate-300 rounded-lg shadow-sm bg-white max-h-[480px] overflow-y-auto s03-table-scroll">
              <!-- v5.27: 表格字号 text-xs 12px → text-[10px] 10px, 跟 04/08/09 一致 -->
              <table class="w-full text-[10px] border-collapse table-fixed">
                <colgroup>
                  <col style="width: 40px"><col><col style="width: 80px"><col style="width: 120px"><col style="width: 50px"><col style="width: 180px">
                </colgroup>
                <thead class="bg-slate-100 text-slate-700 font-bold border-b border-slate-300 sticky top-0 z-10">
                  <tr>
                    <th class="py-1.5 px-1 border-r border-slate-300 text-center">序号</th>
                    <th class="py-1.5 px-1 border-r border-slate-300 text-center">职务</th>
                    <th class="py-1.5 px-1 border-r border-slate-300 text-center">姓名</th>
                    <th class="py-1.5 px-1 border-r border-slate-300 text-center">联系电话</th>
                    <th class="py-1.5 px-1 border-r border-slate-300 text-center">到岗</th>
                    <th class="py-1.5 px-1 text-center">变化</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-200">${rows}</tbody>
              </table>
            </div>
          </div>
          <!-- 右侧: 办公场景图 + 渐变标签 -->
          <div class="col-span-5 flex flex-col items-center justify-start pt-1">
            <div class="relative w-full max-w-md group">
              <div class="overflow-hidden rounded-xl border-4 border-white shadow-lg bg-slate-100" style="aspect-ratio: 4/3;">
                ${photoBoxInner}
              </div>
              <!-- hover 浮层: 换图 / 清除 -->
              <div class="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <label class="cursor-pointer text-[11px] px-2 py-1 rounded bg-white/90 text-slate-700 shadow hover:bg-white border border-slate-200">
                  ${photoData ? '换图' : '上传'}
                  <input type="file" accept="image/*" class="hidden" onchange="App.s03UploadPhoto(this)">
                </label>
                ${photoData ? '<button type="button" onclick="App.s03ClearPhoto()" class="text-[11px] px-2 py-1 rounded bg-white/90 text-rose-600 shadow hover:bg-white border border-slate-200">清除</button>' : ''}
              </div>
              <!-- 渐变标签: 可编辑 -->
              <div class="mt-4 w-[85%] mx-auto">
                <input type="text" class="w-full text-white text-center py-2 px-3 rounded-lg shadow-md font-bold text-sm tracking-widest border border-white/20 focus:outline-none focus:ring-2 focus:ring-white/60" style="background: linear-gradient(90deg, #ffb84d 0%, #ff4d4d 100%);" value="${photoCaption}" placeholder="场景标签" onchange="App.s03UpdateCaption(this.value)">
              </div>
            </div>
            <div class="text-[11px] text-slate-400 mt-7 text-center">hover 照片可换图 / 清除</div>
          </div>
        </div>
      </div>
    </div>`;
  },

  // 绑定每个职务下拉的点击 / 选项事件
  initFilter: function () {
    // 本地刷新某 dd 内所有 option 的高亮状态 (按当前 input.value)
    function refreshHighlight(dd) {
      const input = dd.querySelector('.s03-role-input');
      const panel = dd.querySelector('.s03-role-panel');
      if (!input || !panel) return;
      const cur = input.value;
      panel.querySelectorAll('.s03-role-opt').forEach(function (o) {
        const v = o.getAttribute('data-value') || '';
        const isSel = v === cur;
        o.className = 's03-role-opt px-2 py-1 text-xs cursor-pointer flex items-center gap-1.5 ' +
          (isSel
            ? 'bg-blue-50 text-blue-700 font-medium border-l-2 border-blue-500'
            : 'text-slate-700 hover:bg-blue-50');
        // 替换图标占位
        const iconWrap = o.querySelector('span, svg');
        if (iconWrap) {
          o.innerHTML = (isSel
            ? '<svg class="w-3 h-3 text-blue-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>'
            : '<span class="w-3 flex-shrink-0"></span>') +
            '<span>' + v + '</span>';
        }
      });
    }

    const dds = document.querySelectorAll('.s03-role-dd');
    dds.forEach(function (dd) {
      const idx = dd.getAttribute('data-idx');
      const input = dd.querySelector('.s03-role-input');
      const panel = dd.querySelector('.s03-role-panel');
      if (!input || !panel) return;

      // 点 input 展开
      input.addEventListener('focus', function () { panel.classList.remove('hidden'); });
      input.addEventListener('click', function (e) { e.stopPropagation(); panel.classList.remove('hidden'); });

      // 输入时过滤
      input.addEventListener('input', function () {
        const q = input.value.toLowerCase();
        panel.classList.remove('hidden');
        const opts = panel.querySelectorAll('.s03-role-opt');
        opts.forEach(function (o) {
          const v = (o.getAttribute('data-value') || '').toLowerCase();
          o.style.display = (!q || v.indexOf(q) >= 0) ? '' : 'none';
        });
      });

      // 选中某项 -> 关闭面板 + 写入数据 + rerender 触发高亮更新
      panel.querySelectorAll('.s03-role-opt').forEach(function (opt) {
        opt.addEventListener('click', function (e) {
          e.stopPropagation();
          const v = opt.getAttribute('data-value');
          input.value = v;
          panel.classList.add('hidden');
          if (typeof App !== 'undefined' && App.s03Update) App.s03Update(+idx, 'role', v);
          // 不重 render 时也即时高亮 (App.s03Update 内部会 rerender, 但保留兜底)
          refreshHighlight(dd);
        });
      });

      // 初始高亮 (render 已带, 这里冗余保护)
      refreshHighlight(dd);
    });

    // 点空白关闭所有面板
    document.addEventListener('click', function () {
      document.querySelectorAll('.s03-role-panel').forEach(function (p) { p.classList.add('hidden'); });
    });
  }
};
