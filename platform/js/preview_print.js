// platform/js/preview_print.js
// 使用浏览器原生打印功能，100%还原预览效果
(function (global) {
  'use strict';

  var EXPORT_PAGES = ['01', '02', '03', '0301', '04', '05', '06', '07', '08', '09', '10', '11', '12'];

  function printPDF() {
    // 添加打印样式
    if (!document.getElementById('print-styles')) {
      var style = document.createElement('style');
      style.id = 'print-styles';
      style.textContent = `
        @media print {
          @page {
            size: 1280px 720px;
            margin: 0;
          }
          body {
            margin: 0;
            padding: 0;
          }
          .page-nav, .spacer, .export-bar {
            display: none !important;
          }
          .frame-wrap {
            width: 1280px;
            height: 720px;
            margin: 0;
            box-shadow: none;
            border-radius: 0;
            page-break-after: always;
          }
          .frame-wrap:last-child {
            page-break-after: auto;
          }
          iframe {
            width: 1280px;
            height: 720px;
          }
        }
      `;
      document.head.appendChild(style);
    }

    // 隐藏原有iframe
    var originalFrame = document.getElementById('page-frame');
    var originalFrameWrap = document.getElementById('frame-wrap');
    if (originalFrameWrap) {
      originalFrameWrap.style.display = 'none';
    }

    // 创建打印容器
    var printContainer = document.createElement('div');
    printContainer.id = 'print-container';
    printContainer.style.display = 'none';
    document.body.appendChild(printContainer);

    // 获取周期参数
    var period = '';
    try {
      period = global.PreviewData && typeof PreviewData.resolvePeriod === 'function'
        ? PreviewData.resolvePeriod()
        : (new URLSearchParams(location.search).get('period') || '');
    } catch (e) {}

    // 为每个页面创建iframe
    var loadedCount = 0;
    EXPORT_PAGES.forEach(function(pageId) {
      var wrapper = document.createElement('div');
      wrapper.className = 'frame-wrap';
      wrapper.style.cssText = 'width:1280px;height:720px;margin:0;padding:0;';
      
      var iframe = document.createElement('iframe');
      var pageUrl = 'preview_pages/' + pageId + '.html' + (period ? '?period=' + encodeURIComponent(period) : '');
      iframe.src = pageUrl;
      iframe.style.cssText = 'border:0;width:1280px;height:720px;display:block;';
      
      iframe.onload = function() {
        loadedCount++;
        if (loadedCount === EXPORT_PAGES.length) {
          // 所有页面加载完成，显示打印容器并打印
          printContainer.style.display = 'block';
          
          setTimeout(function() {
            // 尝试设置打印对话框的标题（仅部分浏览器支持）
            var reportDate = '';
            try {
              if (global.PreviewData && typeof PreviewData.loadReport === 'function') {
                var report = PreviewData.loadReport(period);
                if (report && report.period && report.period.report_date) {
                  reportDate = report.period.report_date;
                }
              }
            } catch(e) {}
            
            // 临时修改页面标题，影响打印对话框的默认文件名
            var originalTitle = document.title;
            document.title = '百草园-清尚-周报' + (reportDate || period || '');
            
            setTimeout(function() {
              window.print();
              
              // 恢复标题
              document.title = originalTitle;
              
              // 打印完成后清理
              setTimeout(function() {
                printContainer.remove();
                if (originalFrameWrap) {
                  originalFrameWrap.style.display = '';
                }
              }, 1000);
            }, 300);
          }, 500);
        }
      };
      
      wrapper.appendChild(iframe);
      printContainer.appendChild(wrapper);
    });
  }

  global.PreviewPrint = { printPDF: printPDF };
})(window);
