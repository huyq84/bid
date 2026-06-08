// platform/js/preview_data.js
// preview 端数据绑定: 父页直接改 iframe.contentDocument, preview_pages/*.html 保持零 JS 侵入
// v1 范围: 01 封面 / 03 名单 / 12 协调事宜 (3 个 single 页)
(function (global) {
  'use strict';

  function toast(msg, type) {
    if (typeof global._toast === 'function') {
      global._toast(msg, type || 'info');
    } else {
      try { console.log('[PreviewData]', msg); } catch (e) {}
    }
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function dash(v) {
    if (v == null || v === '') return '—';
    return v;
  }

  // 把 '2026-05-18' 变成 '2026.05.18', 失败原样返回
  function fmtDate(s) {
    if (!s) return '—';
    var m = String(s).match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (!m) return s;
    return m[1] + '.' + String(+m[2]).toString().padStart(2, '0') + '.' + String(+m[3]).toString().padStart(2, '0');
  }

  // 解析当前期: URL > bcy_current_period > DEFAULT_PERIODS[0]
  function resolvePeriod() {
    var url = '';
    try { url = new URLSearchParams(global.location.search).get('period') || ''; } catch (e) {}
    if (url) return url;

    try {
      var cur = global.localStorage.getItem('bcy_current_period');
      if (cur) return cur;
    } catch (e) {}

    var defaults = (global.Store && global.Store.DEFAULT_PERIODS) || ['2026-W18'];
    return defaults[0];
  }

  function loadReport(period) {
    if (!global.Store || typeof global.Store.load !== 'function') return null;
    try { return global.Store.load(period); } catch (e) { return null; }
  }

  function getDoc(iframeEl) {
    try {
      var d = iframeEl && iframeEl.contentDocument;
      if (!d) throw new Error('no contentDocument');
      return d;
    } catch (e) {
      throw new Error('BindError: cannot access iframe contentDocument (need http://, not file://)');
    }
  }

  function waitForLoad(iframeEl, cb) {
    // v5.32: 轮询时锁住 contentDocument URL + readyState=complete + body,
    // 且 URL 必须与 src 末尾的 id 匹配 (防切页时旧 doc 误判 complete)
    var lastSrc = iframeEl.src;
    var tries = 0;
    (function poll() {
      var doc = iframeEl.contentDocument;
      if (doc && doc.readyState === 'complete' && doc.body && doc.URL && doc.URL.indexOf(lastSrc.split('/').pop()) >= 0) {
        cb();
        return;
      }
      if (++tries > 300) { cb(); return; }  // 3s 兜底
      setTimeout(poll, 10);
    })();
  }

  // ---- 工具: 按 data-bind / data-bind-rows 替换 ----

  function applyBinds(doc, mapping) {
    if (!doc || !mapping) return;
    Object.keys(mapping).forEach(function (key) {
      var sel = '[data-bind="' + key + '"]';
      var nodes = doc.querySelectorAll(sel);
      for (var i = 0; i < nodes.length; i++) {
        nodes[i].textContent = mapping[key] == null ? '—' : mapping[key];
      }
    });
  }

  // 全量重建 tbody: 用第一个 data-row-template 克隆出 N 行, 每行调用 rowBuilder(tr, rowData, idx)
  function rebuildRows(tbody, rows, rowBuilder) {
    if (!tbody) return;
    var tpl = tbody.querySelector('[data-row-template="true"]');
    if (!tpl) {
      // 找不到模板: 清空 tbody 留一行占位
      tbody.innerHTML = '<tr><td colspan="4" class="text-center text-gray-400 py-4">暂无数据</td></tr>';
      return;
    }
    // 清掉模板属性
    tpl.removeAttribute('data-row-template');
    var tplHtml = tpl.outerHTML;
    tbody.innerHTML = '';
    if (!rows || rows.length === 0) {
      var emptyTr = document.createElement('tr');
      var ncols = tpl.querySelectorAll('td').length || 4;
      emptyTr.innerHTML = '<td colspan="' + ncols + '" class="text-center text-gray-400 py-6">暂无数据, 请在填报端录入</td>';
      tbody.appendChild(emptyTr);
      return;
    }
    rows.forEach(function (r, i) {
      var tr = document.createElement('tr');
      tr.innerHTML = tplHtml;
      // 移除新行上残留的 data-row-template
      var innerTpl = tr.querySelector('[data-row-template="true"]');
      if (innerTpl) innerTpl.removeAttribute('data-row-template');
      if (typeof rowBuilder === 'function') rowBuilder(tr, r, i);
      tbody.appendChild(tr);
    });
  }

  function setImgSrc(el, dataUrl) {
    if (!el) return;
    if (!dataUrl) { el.src = ''; return; }
    // 白名单 base64 png/jpg/webp
    if (/^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/.test(dataUrl)) {
      el.src = dataUrl;
    } else {
      el.src = '';
    }
  }

  // ---- 3 个 binder ----

  function bind01(doc, report) {
    var proj = (report && report.project) || {};
    var period = (report && report.period) || {};
    var cover = (report && report.ui_config && report.ui_config.cover) || {};
    // v5.31: cover 字段历史值反 (title=项目名, subtitle=工作周报), 兼容老数据自动 swap
    var coverTitle = cover.title, coverSubtitle = cover.subtitle;
    if (coverTitle === '百草园城市更新项目' && coverSubtitle === '工作周报') {
      coverTitle = '工作周报'; coverSubtitle = '百草园城市更新项目';
    }
    applyBinds(doc, {
      'project.general_contractor': dash(proj.general_contractor),
      'project.name': dash(proj.name),
      'cover.title': coverTitle || '工作周报',
      'cover.subtitle': coverSubtitle,
      'project.subcontractor': dash(proj.subcontractor),
      'period.report_date_fmt': fmtDate(period.report_date)
    });
  }

  function bind03(doc, report) {
    var pages = (report && report.pages_data) || {};
    var rows = (pages['03'] && pages['03'].rows) || [];
    var uiCfg = (report && report.ui_config) || {};

    // 是否存在未到岗人员：若全部到岗，则不显示"未到岗原因"列
    var hasAbsent = false;
    for (var idx = 0; idx < rows.length; idx++) {
      if (!rows[idx].present) { hasAbsent = true; break; }
    }

    // 表头：根据是否存在未到岗人员，决定显示/隐藏 reason 列
    var thead = doc.querySelector('[data-bind-rows="roster"]');
    if (thead) {
      var table = thead.closest('table');
      if (table) {
        var thRow = table.querySelector('thead tr');
        if (thRow) {
          var ths = thRow.querySelectorAll('th');
          if (ths[ths.length - 1]) ths[ths.length - 1].style.display = hasAbsent ? '' : 'none';
        }
      }
    }

    var tbody = doc.querySelector('[data-bind-rows="roster"]');
    rebuildRows(tbody, rows, function (tr, r, i) {
      var tds = tr.querySelectorAll('td');
      // 顺序: seq / role / name / phone / present / reason
      if (tds[0]) tds[0].textContent = (r.seq != null ? r.seq : (i + 1));
      if (tds[1]) tds[1].textContent = dash(r.role);
      if (tds[2]) tds[2].textContent = dash(r.name);
      if (tds[3]) tds[3].textContent = dash(r.phone);
      if (tds[4]) {
        if (r.present) {
          tds[4].textContent = '已到岗';
          tds[4].className = 'py-0.5 border-r border-gray-200 text-center text-emerald-700 font-medium';
        } else {
          tds[4].textContent = '未到岗';
          tds[4].className = 'py-0.5 border-r border-gray-200 text-center text-amber-700 font-medium';
        }
      }
      if (tds[5]) {
        if (!hasAbsent) {
          tds[5].style.display = 'none';
        } else {
          if (!r.present && r.reason) {
            tds[5].textContent = r.reason;
            tds[5].className = 'py-0.5 text-left pl-2 text-amber-900 bg-amber-50';
          } else {
            tds[5].textContent = '—';
            tds[5].className = 'py-0.5 text-left pl-2 text-gray-400';
          }
        }
      }
      if (r.present && r.delta === 'leave') {
        tr.classList.add('line-through', 'text-gray-400');
      } else if (r.present && r.delta === 'new') {
        tr.classList.add('font-semibold', 'text-blue-700');
      } else if (i % 2 === 1) {
        tr.classList.add('bg-gray-50');
      }
      tr.classList.add('hover:bg-blue-50');
    });

    var imgEl = doc.querySelector('[data-bind="s03_photo"]');
    if (imgEl) setImgSrc(imgEl, uiCfg.s03_photo || '');

    var capNodes = doc.querySelectorAll('[data-bind="s03_photo_caption"]');
    capNodes.forEach(function (n) { n.textContent = uiCfg.s03_photo_caption || '百瑞达工坊办公室'; });
  }

  function bind12(doc, report) {
    var pages = (report && report.pages_data) || {};
    var rows = (pages['12'] && pages['12'].rows) || [];
    var tbody = doc.querySelector('[data-bind-rows="coordination"]');
    rebuildRows(tbody, rows, function (tr, r, i) {
      var tds = tr.querySelectorAll('td');
      // 顺序: seq / issue / proposer / cooperator
      if (tds[0]) tds[0].textContent = (r.seq != null ? r.seq : (i + 1));
      if (tds[1]) tds[1].textContent = dash(r.issue);
      if (tds[2]) tds[2].textContent = dash(r.proposer);
      if (tds[3]) tds[3].textContent = dash(r.cooperator);
    });
  }

  // ---- 入口 ----

  function bindPage(iframeEl, pageId, period) {
    if (!iframeEl) return;
    period = period || resolvePeriod();
    var report = loadReport(period);

    waitForLoad(iframeEl, function () {
      var doc;
      try { doc = getDoc(iframeEl); }
      catch (e) { toast(e.message, 'error'); return; }

      if (!report) {
        toast('当前期 ' + period + ' 暂无数据, 显示占位', 'warn');
        try {
          // 数据缺失时: 01 显示默认硬编码 (不动); 03/12 显示"暂无数据"占位
          if (pageId === '03' || pageId === '12') {
            var sel = pageId === '03' ? '[data-bind-rows="roster"]' : '[data-bind-rows="coordination"]';
            var tb = doc.querySelector(sel);
            // 空数据场景: 03 默认 5 列 (不显示原因列, 也同步隐藏表头末列)
            if (pageId === '03' && tb) {
              var tbl03 = tb.closest('table');
              if (tbl03) {
                var lastTh = tbl03.querySelector('thead tr th:last-child');
                if (lastTh) lastTh.style.display = 'none';
              }
            }
            if (tb) tb.innerHTML = '<tr><td colspan="' + (pageId === '03' ? '5' : '5') + '" class="text-center text-gray-400 py-6">当前期 ' + escapeHtml(period) + ' 暂无数据, 请在填报端录入</td></tr>';
          }
        } catch (e) {}
        return;
      }

      try {
        switch (pageId) {
          case '01': bind01(doc, report); break;
          case '03': bind03(doc, report); break;
          case '12': bind12(doc, report); break;
          default:
            // 未实现的页 (02/0301/04-11/14) 保持原硬编码, 不报错
            return;
        }
      } catch (e) {
        toast('绑定 ' + pageId + ' 失败: ' + (e && e.message || e), 'error');
      }
    });
  }

  function populatePeriodSel(currentPeriod) {
    var sel = document.getElementById('period-sel');
    if (!sel) return;
    var periods = [];
    if (global.Store && typeof global.Store.getPeriods === 'function') {
      try { periods = global.Store.getPeriods() || []; } catch (e) {}
    }
    if (!periods.length) periods = (global.Store && global.Store.DEFAULT_PERIODS) || ['2026-W18'];
    sel.innerHTML = periods.map(function (p) {
      return '<option value="' + escapeHtml(p) + '"' + (p === currentPeriod ? ' selected' : '') + '>' + escapeHtml(p) + '</option>';
    }).join('');
    sel.onchange = function () {
      var v = sel.value;
      global.location.search = '?period=' + encodeURIComponent(v);
    };
  }

  function init() {
    var period = resolvePeriod();
    populatePeriodSel(period);
    var frame = document.getElementById('page-frame');
    if (frame) bindPage(frame, currentActiveId(), period);
  }

  // 当前激活的页 ID (从 nav 按钮 .active 取)
  function currentActiveId() {
    var btn = document.querySelector('.page-nav button.active');
    return btn ? btn.dataset.id : '01';
  }

  function installDebug() {
    global.PreviewData = API;
    global._previewData = API;
  }

  var API = {
    resolvePeriod: resolvePeriod,
    loadReport: loadReport,
    getDoc: getDoc,
    waitForLoad: waitForLoad,
    setText: function (el, v) { if (el) el.textContent = v == null ? '—' : v; },
    setImgSrc: setImgSrc,
    rebuildRows: rebuildRows,
    applyBinds: applyBinds,
    fmtDate: fmtDate,
    bind01: bind01,
    bind03: bind03,
    bind12: bind12,
    bindPage: bindPage,
    populatePeriodSel: populatePeriodSel,
    init: init,
    installDebug: installDebug
  };

  installDebug();
})(window);
