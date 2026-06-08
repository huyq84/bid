// platform/js/sections/s02_toc.js
// 02 目录 - 六边形徽章 + 长条样式 (对齐原版 02目录.html 设计) + 点击跳转
window.Sections = window.Sections || {};
window.Sections["02"] = {
  title: "目录",

  // 从 report.nav_tree 提取所有一级章 (chapter, 非封尾)
  // 每章: { id, name, prefix, children: [{ page_id, name, prefix, is_closing }] }
  _collectChapters: function (navTree) {
    var chapters = [];
    if (!Array.isArray(navTree)) return chapters;
    for (var i = 0; i < navTree.length; i++) {
      var node = navTree[i];
      if (node.type !== 'chapter' || node.is_closing) continue;
      var pageNodes = [];
      function collect(n) {
        if (!n) return;
        if (n.type === 'page' && !n.is_closing) {
          pageNodes.push({
            page_id: n.page_id || '',
            name: n.name || '',
            prefix: n.prefix || ''
          });
        }
        if (n.children && n.children.length) {
          for (var k = 0; k < n.children.length; k++) collect(n.children[k]);
        }
      }
      collect(node);
      chapters.push({
        id: node.id,
        name: node.name || '',
        prefix: node.prefix || '',
        children: pageNodes
      });
    }
    return chapters;
  },

  _formatChildrenLabel: function (chapter) {
    if (!chapter.children || !chapter.children.length) return '';
    var parts = [];
    for (var i = 0; i < chapter.children.length; i++) {
      var c = chapter.children[i];
      var label = c.prefix ? (c.prefix + ' ' + c.name) : c.name;
      if (label) parts.push(label);
    }
    return parts.join(' / ');
  },

  // 单个章节行 HTML (六边形徽章 + 长条 + 子页内嵌)
  _renderChapterRow: function (chapter, index, isFirst) {
    var hasPages = chapter.children && chapter.children.length > 0;
    var firstPageId = hasPages ? chapter.children[0].page_id : '';
    var displayTitle = (chapter.prefix ? chapter.prefix + ' ' : '') + chapter.name;

    var rowCls = 'toc-row flex items-stretch gap-0 cursor-pointer rounded-md transition-all';
    var actionAttrs = '';
    if (hasPages && firstPageId) {
      actionAttrs = ' onclick="App.gotoSection(\'' + firstPageId + '\')"';
    } else {
      rowCls += ' opacity-50 cursor-not-allowed';
    }
    // 章节主行
    var html = '';
    html += '<div class="' + rowCls + '"' + actionAttrs + ' title="' + (hasPages ? '点击跳转至 ' + chapter.name : '该章暂无子页') + '">';
    // 六边形徽章 (蓝色填充, 白色数字)
    html += '<div class="toc-hexagon flex items-center justify-center text-white font-bold text-lg shrink-0" style="background:#00a2ff;clip-path:polygon(25% 0%,75% 0%,100% 50%,75% 100%,25% 100%,0% 50%);width:56px;height:48px;box-shadow:0 4px 6px -1px rgba(0,0,0,0.1);">' + (index + 1) + '</div>';
    // 长条 (浅灰底, 章节前缀 + 名字, hover 变蓝边)
    html += '<div class="toc-bar flex-1 flex items-center px-4 ml-[-12px] pl-8 bg-slate-50 hover:bg-blue-50 rounded-r-md border-l-0 transition-colors" style="min-height:44px;box-shadow:0 4px 15px rgba(0,0,0,0.08);">';
    if (chapter.prefix) {
      html += '<span class="toc-chapter-prefix text-base font-semibold text-blue-600 mr-3">' + chapter.prefix + '</span>';
    }
    html += '<span class="toc-name text-base font-semibold text-slate-700 flex-1">' + (chapter.name || '(未命名)') + '</span>';
    if (hasPages) {
      html += '<span class="toc-page-count text-xs text-slate-400 mr-2">' + chapter.children.length + ' 页</span>';
      html += '<span class="toc-arrow text-slate-300 group-hover:text-blue-500" style="font-size:18px;">→</span>';
    }
    html += '</div>';
    html += '</div>';

    // 子页链接列表 (每个子页可点击跳转)
    if (hasPages) {
      html += '<div class="toc-subpages ml-[68px] mt-1 mb-2 pl-2 border-l-2 border-slate-100">';
      for (var i = 0; i < chapter.children.length; i++) {
        var sub = chapter.children[i];
        var subLabel = (sub.prefix ? sub.prefix + ' ' : '') + sub.name;
        html += '<div class="toc-subpage flex items-center gap-1.5 py-1 px-2 rounded text-xs text-slate-600 hover:bg-blue-50 hover:text-blue-700 cursor-pointer transition-colors" onclick="App.gotoSection(\'' + sub.page_id + '\')" title="跳转至 ' + (sub.name || '') + '">';
        html += '<span class="toc-subpage-prefix text-slate-400 font-mono">' + (sub.prefix || '') + '</span>';
        html += '<span class="flex-1 truncate">' + (sub.name || '(未命名)') + '</span>';
        html += '<span class="text-slate-300 text-xs">→</span>';
        html += '</div>';
      }
      html += '</div>';
    }
    return html;
  },

  render: function (report) {
    var allTocGroups = this._collectChapters(report && report.nav_tree);

    // 读 filter (默认全选)
    var visibleGroupIds;
    try {
      var saved = JSON.parse(localStorage.getItem('bcy_toc_filter'));
      if (Array.isArray(saved)) {
        var currentIds = allTocGroups.map(function (g) { return g.id; });
        visibleGroupIds = currentIds.filter(function (id) { return saved.indexOf(id) >= 0; });
        if (visibleGroupIds.length === 0) visibleGroupIds = currentIds;
      } else {
        visibleGroupIds = allTocGroups.map(function (g) { return g.id; });
      }
    } catch (e) {
      visibleGroupIds = allTocGroups.map(function (g) { return g.id; });
    }
    var visibleGroups = allTocGroups.filter(function (g) { return visibleGroupIds.indexOf(g.id) >= 0; });

    // ===== 自定义下拉多选框 =====
    var filterHtml = '';
    filterHtml += '<div class="mb-4 p-3 bg-gradient-to-r from-slate-50 to-white border border-slate-200 rounded-lg">';
    filterHtml += '<div class="flex items-center justify-between gap-2 mb-2">';
    filterHtml += '<div class="flex items-center gap-2 text-sm">';
    filterHtml += '<span class="inline-block w-4 h-4 bg-blue-600" style="clip-path: polygon(0 0, 100% 0, 75% 100%, 0 100%);"></span>';
    filterHtml += '<span class="font-medium text-slate-700">下拉选择要显示的章节</span>';
    filterHtml += '<span class="text-xs px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded">多选</span>';
    filterHtml += '<span class="text-xs text-slate-500">(<span id="toc-selected-count">' + visibleGroups.length + '</span> / ' + allTocGroups.length + ')</span>';
    filterHtml += '</div>';
    filterHtml += '<div class="flex items-center gap-1">';
    filterHtml += '<button type="button" id="toc-btn-all" class="text-xs px-2 py-1 rounded border border-slate-300 text-slate-600 hover:bg-white hover:border-blue-400">全选</button>';
    filterHtml += '<button type="button" id="toc-btn-none" class="text-xs px-2 py-1 rounded border border-slate-300 text-slate-600 hover:bg-white hover:border-blue-400">清空</button>';
    filterHtml += '</div>';
    filterHtml += '</div>';

    // 隐藏的原生 select (作 fallback / 数据载体, 但默认隐藏)
    filterHtml += '<select id="toc-group-filter" multiple class="hidden">';
    for (var gi = 0; gi < allTocGroups.length; gi++) {
      var g = allTocGroups[gi];
      var sel = visibleGroupIds.indexOf(g.id) >= 0 ? ' selected' : '';
      filterHtml += '<option value="' + g.id + '"' + sel + '>' + g.name + '</option>';
    }
    filterHtml += '</select>';

    // 自定义下拉按钮 (默认收起)
    filterHtml += '<div class="relative" id="toc-dropdown-root">';
    filterHtml += '<button type="button" id="toc-dropdown-btn" class="w-full px-3 py-2.5 border border-slate-300 rounded-md bg-white text-left flex items-center justify-between hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400">';
    filterHtml += '<span id="toc-dropdown-label" class="text-sm text-slate-700 truncate">点击选择要显示的章节...</span>';
    filterHtml += '<svg id="toc-dropdown-arrow" class="w-4 h-4 text-slate-400 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>';
    filterHtml += '</button>';
    filterHtml += '<div id="toc-dropdown-panel" class="hidden absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-md shadow-lg max-h-72 overflow-hidden flex flex-col">';
    filterHtml += '<div class="p-2 border-b border-slate-100 bg-slate-50">';
    filterHtml += '<input type="text" id="toc-dropdown-search" placeholder="搜索章节..." class="w-full px-2 py-1.5 text-sm border border-slate-200 rounded focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200">';
    filterHtml += '</div>';
    filterHtml += '<div id="toc-dropdown-options" class="overflow-auto py-1">';
    for (var oi = 0; oi < allTocGroups.length; oi++) {
      var og = allTocGroups[oi];
      var isChecked = visibleGroupIds.indexOf(og.id) >= 0;
      var displayTitle = (og.prefix ? og.prefix + ' ' : '') + og.name;
      filterHtml += '<label class="toc-dropdown-item flex items-center gap-2 px-3 py-2 hover:bg-blue-50 cursor-pointer" data-value="' + og.id + '" data-title="' + displayTitle + '">';
      filterHtml += '<input type="checkbox" value="' + og.id + '" class="toc-dropdown-cb rounded text-blue-600 focus:ring-blue-500"' + (isChecked ? ' checked' : '') + '>';
      filterHtml += '<span class="text-sm text-slate-700 flex-1">' + displayTitle + '</span>';
      filterHtml += '<svg class="toc-dropdown-check w-4 h-4 text-blue-600' + (isChecked ? '' : ' hidden') + '" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>';
      filterHtml += '</label>';
    }
    filterHtml += '</div>';
    filterHtml += '</div>';
    filterHtml += '</div>';

    filterHtml += '<p class="text-xs text-slate-400 mt-1.5">提示: 章节行可点击跳转 · 子页列表也可点 · 下拉多选控制显示哪些章节</p>';
    filterHtml += '</div>';

    // 目录列表 (六边形徽章 + 长条 + 子页列表)
    var tocHtml = '';
    if (visibleGroups.length === 0) {
      tocHtml = '<div class="text-xs text-slate-400 text-center py-6">未选择任何一级节点</div>';
    } else {
      for (var ti = 0; ti < visibleGroups.length; ti++) {
        tocHtml += '<div class="toc-group">';
        tocHtml += this._renderChapterRow(visibleGroups[ti], ti, ti === 0);
        tocHtml += '</div>';
      }
    }

    var body = '';
    body += '<div class="section-card">';
    body += '<div class="section-header">';
    body += '<div>';
    body += '<div class="section-title">' + this.title + '</div>';
    body += '<div class="text-xs text-slate-500 mt-1">点击章节行或子页可跳转 · 通过下拉多选框控制显示</div>';
    body += '</div>';
    body += '<span class="text-xs text-slate-400">无需填报</span>';
    body += '</div>';
    body += '<div class="section-body space-y-1">';
    body += filterHtml;
    body += '<div id="toc-visible-list" class="space-y-1">' + tocHtml + '</div>';
    body += '</div>';
    body += '</div>';
    return body;
  },

  // 初始化: 绑定下拉多选框事件
  initFilter: function () {
    var root = document.getElementById('toc-dropdown-root');
    if (!root) return;
    // rerender 后重新绑定, 先清掉旧监听 (通过克隆替换)
    var newRoot = root.cloneNode(true);
    root.parentNode.replaceChild(newRoot, root);
    root = newRoot;

    var btn = document.getElementById('toc-dropdown-btn');
    var panel = document.getElementById('toc-dropdown-panel');
    var arrow = document.getElementById('toc-dropdown-arrow');
    var label = document.getElementById('toc-dropdown-label');
    var search = document.getElementById('toc-dropdown-search');
    var optionsEl = document.getElementById('toc-dropdown-options');
    var checkboxes = optionsEl ? optionsEl.querySelectorAll('.toc-dropdown-cb') : [];
    var items = optionsEl ? optionsEl.querySelectorAll('.toc-dropdown-item') : [];

    // 打开/关闭下拉
    function toggle(open) {
      var willOpen = (open === undefined) ? panel.classList.contains('hidden') : open;
      if (willOpen) {
        panel.classList.remove('hidden');
        arrow.style.transform = 'rotate(180deg)';
        if (search) { setTimeout(function () { search.focus(); }, 0); }
      } else {
        panel.classList.add('hidden');
        arrow.style.transform = 'rotate(0deg)';
        if (search) search.value = '';
        filterItems('');
      }
    }
    if (btn) btn.addEventListener('click', function (e) { e.stopPropagation(); toggle(); });
    if (panel) panel.addEventListener('click', function (e) { e.stopPropagation(); });
    document.addEventListener('click', function () { toggle(false); });

    // 搜索过滤
    function filterItems(q) {
      q = (q || '').toLowerCase().trim();
      for (var i = 0; i < items.length; i++) {
        var title = (items[i].getAttribute('data-title') || '').toLowerCase();
        items[i].style.display = (!q || title.indexOf(q) >= 0) ? '' : 'none';
      }
    }
    if (search) search.addEventListener('input', function () { filterItems(this.value); });

    // 局部更新: 章节列表 (不重建整个 section, 避免下拉面板关闭)
    function refreshVisibleList(ids) {
      var listEl = document.getElementById('toc-visible-list');
      if (!listEl) return;
      var self = window.Sections["02"];
      var allChapters = self._collectChapters(
        (window._report && window._report()) ? window._report().nav_tree : null
      );
      var visGroups = allChapters.filter(function (g) {
        return ids.indexOf(g.id) >= 0;
      });
      var html = '';
      if (visGroups.length === 0) {
        html = '<div class="text-xs text-slate-400 text-center py-6">未选择任何一级节点</div>';
      } else {
        for (var ti = 0; ti < visGroups.length; ti++) {
          html += '<div class="toc-group">';
          html += self._renderChapterRow(visGroups[ti], ti, ti === 0);
          html += '</div>';
        }
      }
      listEl.innerHTML = html;
    }

    // 同步 UI: 按钮上的标签 + 计数 + 隐藏的原生 select
    function syncUi() {
      var selectedTitles = [];
      var count = 0;
      var ids = [];
      for (var i = 0; i < checkboxes.length; i++) {
        var cb = checkboxes[i];
        var item = cb.closest('.toc-dropdown-item');
        var checkIcon = item ? item.querySelector('.toc-dropdown-check') : null;
        if (cb.checked) {
          count++;
          ids.push(cb.value);
          selectedTitles.push(item ? item.getAttribute('data-title') : cb.value);
          if (checkIcon) checkIcon.classList.remove('hidden');
        } else {
          if (checkIcon) checkIcon.classList.add('hidden');
        }
      }
      if (label) {
        label.textContent = count === 0
          ? '点击选择要显示的章节...'
          : selectedTitles.join('、');
        label.className = count === 0
          ? 'text-sm text-slate-400 truncate'
          : 'text-sm text-slate-700 truncate';
      }
      var counter = document.getElementById('toc-selected-count');
      if (counter) counter.textContent = count;

      // 同步到隐藏 select (兼容旧 API)
      var sel = document.getElementById('toc-group-filter');
      if (sel) {
        for (var j = 0; j < sel.options.length; j++) {
          sel.options[j].selected = ids.indexOf(sel.options[j].value) >= 0;
        }
      }
      // 存 localStorage
      try { localStorage.setItem('bcy_toc_filter', JSON.stringify(ids)); } catch (e) {}

      // 局部刷新下方章节列表, 不触发整 section rerender (避免下拉面板关闭)
      refreshVisibleList(ids);
    }

    // 绑定 checkbox 变化
    for (var k = 0; k < checkboxes.length; k++) {
      checkboxes[k].addEventListener('change', function () {
        syncUi();
      });
    }

    // 全选 / 清空
    var btnAll = document.getElementById('toc-btn-all');
    var btnNone = document.getElementById('toc-btn-none');
    if (btnAll) btnAll.addEventListener('click', function () {
      for (var i = 0; i < checkboxes.length; i++) checkboxes[i].checked = true;
      syncUi();
    });
    if (btnNone) btnNone.addEventListener('click', function () {
      for (var i = 0; i < checkboxes.length; i++) checkboxes[i].checked = false;
      syncUi();
    });

    // 初始同步
    syncUi();
  },

  // 全选 (外部按钮 onclick 桥接)
  selectAll: function () {
    var btn = document.getElementById('toc-btn-all');
    if (btn) btn.click();
  },

  // 清空 (外部按钮 onclick 桥接)
  selectNone: function () {
    var btn = document.getElementById('toc-btn-none');
    if (btn) btn.click();
  },

  // 兼容旧 API
  applyFilter: function () {
    // 现在的逻辑直接由 checkbox change 触发, 留作 noop
  }
};
