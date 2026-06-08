// platform/js/preview_export.js
// 预览端 PDF 导出 v5
// 核心思路: 捕获 body，onclone 中强制 body 为零偏移容器，同时用 canvas 修复 clip-path
(function (global) {
  'use strict';

  var EXPORT_PAGES = ['01', '02', '03', '0301', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
  var PAGE_W = 1280;
  var PAGE_H = 720;

  function toast(msg, type) {
    var c = document.getElementById('toast-container');
    if (!c) {
      c = document.createElement('div');
      c.id = 'toast-container';
      c.style.cssText = 'position:fixed;top:20px;right:20px;z-index:9999;';
      document.body.appendChild(c);
    }
    var d = document.createElement('div');
    var bg = type === 'error' ? '#ef4444' : (type === 'success' ? '#10b981' : '#2563eb');
    d.style.cssText = 'background:' + bg + ';color:#fff;padding:10px 16px;border-radius:6px;margin-bottom:8px;font-size:13px;box-shadow:0 4px 12px rgba(0,0,0,.2);white-space:nowrap;';
    d.textContent = msg;
    c.appendChild(d);
    setTimeout(function () { d.style.opacity = '0'; d.style.transition = 'opacity .3s'; }, 3000);
    setTimeout(function () { d.remove(); }, 3400);
  }

  async function exportPDF() {
    var period = '';
    try {
      period = global.PreviewData && typeof PreviewData.resolvePeriod === 'function'
        ? PreviewData.resolvePeriod()
        : (new URLSearchParams(location.search).get('period') || '');
    } catch (e) {}

    toast('开始导出 PDF...', 'info');

    var frame = document.getElementById('page-frame');
    if (!frame) { toast('找不到预览框架', 'error'); return; }

    var currentPageId = frame.getAttribute('data-current-page') || '01';
    var originalSrc = 'preview_pages/' + currentPageId + '.html' + (period ? '?period=' + encodeURIComponent(period) : '');

    await loadDependencies();

    try {
      var jsPDF = window.jspdf.jsPDF;
      var html2canvas = window.html2canvas;
      var pdf = new jsPDF({ orientation: 'landscape', unit: 'px', format: [PAGE_W, PAGE_H], compress: true });
      var pdf = new jsPDF({ orientation: 'landscape', unit: 'px', format: [PAGE_W, PAGE_H], compress: true });

      for (var i = 0; i < EXPORT_PAGES.length; i++) {
        var pageId = EXPORT_PAGES[i];
        toast('处理 ' + (i + 1) + '/' + EXPORT_PAGES.length + ': ' + pageId, 'info');

        var pageUrl = 'preview_pages/' + pageId + '.html' + (period ? '?period=' + encodeURIComponent(period) : '');
        await navigateToPage(frame, pageUrl);

        if (global.PreviewData && typeof PreviewData.bindPage === 'function') {
          try { PreviewData.bindPage(frame, pageId, period); } catch (e) {}
        }

        // 等待页面渲染完成：CSS加载 + 图片加载 + 布局稳定
        await wait(pageId === '05' || pageId === '04' ? 1500 : 1000);
        
        // 等待图片加载完成
        await waitForImages(frame.contentDocument);

        var iframeDoc = frame.contentDocument;
        if (!iframeDoc) {
          toast('无法访问页面内容: ' + pageId, 'error');
          continue;
        }

        // 使用 iframe 的 contentWindow 尺寸进行精确捕获
        var canvas = await html2canvas(iframeDoc.body, {
          width: PAGE_W,
          height: PAGE_H,
          windowWidth: PAGE_W,
          windowHeight: PAGE_H,
          x: 0,
          y: 0,
          scrollX: 0,
          scrollY: 0,
          scale: 1.5,
          backgroundColor: '#ffffff',
          useCORS: true,
          allowTaint: true,
          imageTimeout: 20000,
          logging: false,
          foreignObjectRendering: false,
          onclone: function (clonedDoc) {
            // 修复字体向下偏移：大幅度调整
            var allElements = clonedDoc.querySelectorAll('*');
            for (var i = 0; i < allElements.length; i++) {
              var el = allElements[i];
              var cs = clonedDoc.defaultView.getComputedStyle(el);
              
              if (el.textContent && el.textContent.trim()) {
                // 大幅减小 line-height（6px）
                var lh = cs.lineHeight;
                if (lh && lh !== 'normal') {
                  if (lh.indexOf('px') > -1) {
                    var lhNum = parseFloat(lh);
                    el.style.lineHeight = Math.max(1, lhNum - 6) + 'px';
                  } else {
                    el.style.lineHeight = 'calc(' + lh + ' - 6px)';
                  }
                }
                
                // 大幅调整 padding（6px）
                var pt = cs.paddingTop;
                if (pt && pt.indexOf('px') > -1) {
                  var ptNum = parseFloat(pt);
                  if (ptNum >= 6) {
                    el.style.paddingTop = (ptNum - 6) + 'px';
                    el.style.paddingBottom = (parseFloat(cs.paddingBottom || '0') + 6) + 'px';
                  } else if (ptNum > 0) {
                    el.style.paddingTop = '0px';
                    el.style.paddingBottom = (parseFloat(cs.paddingBottom || '0') + ptNum) + 'px';
                  }
                }
                
                // 表格单元格特殊处理
                if (el.tagName === 'TD' || el.tagName === 'TH') {
                  var hasRowspan = el.hasAttribute('rowspan') && parseInt(el.getAttribute('rowspan')) > 1;
                  
                  if (hasRowspan) {
                    el.style.verticalAlign = 'middle';
                  } else {
                    el.style.verticalAlign = 'top';
                  }
                }
              }
            }

            // 修复 clip-path
            fixClipPathsInClone(clonedDoc);
          }
        });

        var imgData = canvas.toDataURL('image/jpeg', 0.95);
        if (i > 0) pdf.addPage([PAGE_W, PAGE_H], 'landscape');
        pdf.addImage(imgData, 'JPEG', 0, 0, PAGE_W, PAGE_H);
      }

      // 恢复原页面
      await navigateToPage(frame, originalSrc);
      if (global.PreviewData && typeof PreviewData.bindPage === 'function') {
        try { PreviewData.bindPage(frame, currentPageId, period); } catch (e) {}
      }

      var reportDate = '';
      if (global.PreviewData && typeof PreviewData.loadReport === 'function') {
        var report = PreviewData.loadReport(period);
        if (report && report.period && report.period.report_date) reportDate = report.period.report_date;
      }
      var fname = '百草园-清尚-周报' + (reportDate || period || '') + '.pdf';
      pdf.save(fname);
      toast('导出完成: ' + fname, 'success');

    } catch (err) {
      console.error(err);
      toast('导出失败: ' + (err.message || err), 'error');
    }
  }

  function navigateToPage(frame, url) {
    return new Promise(function (resolve) {
      frame.onload = function () { frame.onload = null; setTimeout(resolve, 600); };
      frame.src = url;
      setTimeout(resolve, 8000);
    });
  }

  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function waitForImages(doc) {
    return new Promise(function (resolve) {
      var images = doc.querySelectorAll('img');
      if (images.length === 0) { resolve(); return; }
      var loaded = 0;
      var total = images.length;
      function checkComplete() {
        loaded++;
        if (loaded >= total) resolve();
      }
      images.forEach(function (img) {
        if (img.complete && img.naturalHeight !== 0) {
          checkComplete();
        } else {
          img.onload = checkComplete;
          img.onerror = checkComplete;
        }
      });
      setTimeout(resolve, 5000); // 5秒超时
    });
  }

  // ============================================================
  //  onclone 中修复 clip-path:
  //  用 getComputedStyle 遍历所有元素 (支持 class/inline 定义)
  //  对 polygon 型 clip-path，用 canvas 元素替换，html2canvas 可渲染 canvas
  // ============================================================

  function fixClipPathsInClone(clonedDoc) {
    var all = clonedDoc.querySelectorAll('*');
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      try { var cp = getComputedStyle(el).clipPath; } catch (e) { continue; }
      if (!cp || cp === 'none') continue;

      var match = cp.match(/polygon\(([^)]+)\)/i);
      if (!match) continue;

      var rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;

      var bg = getComputedStyle(el).backgroundColor;
      if (!bg || bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') bg = '#37a3eb';

      // 找到定位上下文，计算相对于它的坐标
      var posCtx = findPositionedAncestor(el);
      var relTop, relLeft;
      if (posCtx) {
        var pr = posCtx.getBoundingClientRect();
        relTop = rect.top - pr.top;
        relLeft = rect.left - pr.left;
      } else {
        relTop = rect.top;
        relLeft = rect.left;
      }

      var cv = clonedDoc.createElement('canvas');
      cv.width = rect.width;
      cv.height = rect.height;
      cv.style.cssText =
        'position:absolute;' +
        'top:' + relTop + 'px;' +
        'left:' + relLeft + 'px;' +
        'width:' + rect.width + 'px;' +
        'height:' + rect.height + 'px;' +
        'z-index:100;pointer-events:none;';

      var ctx = cv.getContext('2d');
      ctx.fillStyle = bg;
      var pts = parsePolygonPoints(match[1], rect.width, rect.height);
      ctx.beginPath();
      for (var j = 0; j < pts.length; j++) {
        if (j === 0) ctx.moveTo(pts[j].x, pts[j].y);
        else ctx.lineTo(pts[j].x, pts[j].y);
      }
      ctx.closePath();
      ctx.fill();

      // 在 clone 中隐藏原元素，canvas 顶替
      el.style.clipPath = 'none';
      el.style.visibility = 'hidden';
      (posCtx || el.parentNode).appendChild(cv);
    }
  }

  function findPositionedAncestor(el) {
    var p = el.parentElement;
    while (p) {
      var pos = getComputedStyle(p).position;
      if (pos === 'relative' || pos === 'absolute' || pos === 'fixed' || pos === 'sticky') return p;
      p = p.parentElement;
    }
    return null;
  }

  function parsePolygonPoints(str, w, h) {
    var pts = [];
    var pairs = str.split(/,/);
    for (var i = 0; i < pairs.length; i++) {
      var xy = pairs[i].trim().split(/\s+/);
      if (xy.length >= 2) pts.push({ x: parseLen(xy[0], w), y: parseLen(xy[1], h) });
    }
    return pts;
  }

  function parseLen(v, max) {
    if (v.indexOf('%') !== -1) return (parseFloat(v) / 100) * max;
    return parseFloat(v);
  }

  function loadDependencies() {
    return new Promise(function (resolve) {
      var loaded = 0, total = 2;
      function checkDone() { loaded++; if (loaded >= total) resolve(); }

      if (window.jspdf && window.jspdf.jsPDF) checkDone();
      else {
        var s1 = document.createElement('script');
        s1.src = 'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js';
        s1.onload = checkDone; s1.onerror = checkDone;
        document.head.appendChild(s1);
      }

      if (window.html2canvas) checkDone();
      else {
        var s2 = document.createElement('script');
        s2.src = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
        s2.onload = checkDone; s2.onerror = checkDone;
        document.head.appendChild(s2);
      }

      setTimeout(resolve, 5000);
    });
  }

  global.PreviewExport = { exportPDF: exportPDF };
})(window);
