// platform/js/preview_export_server.js
// 使用后端 Puppeteer 生成 PDF，100% 还原预览效果
(function (global) {
  'use strict';

  var progressOverlay = null;
  var progressBar = null;
  var progressSteps = null;

  function showProgress() {
    // 创建进度遮罩
    progressOverlay = document.createElement('div');
    progressOverlay.className = 'progress-overlay';
    progressOverlay.innerHTML = `
      <div class="progress-content">
        <div class="progress-spinner"></div>
        <div class="progress-title">正在生成 PDF</div>
        <div class="progress-desc">请稍候，正在处理中...</div>
        <div class="progress-bar-container">
          <div class="progress-bar" id="pdf-progress-bar" style="width: 0%"></div>
        </div>
        <div class="progress-steps" id="pdf-progress-steps">
          <span id="pdf-progress-percent">0%</span> - <span id="pdf-progress-text">准备中...</span>
        </div>
      </div>
    `;
    document.body.appendChild(progressOverlay);
    
    progressBar = document.getElementById('pdf-progress-bar');
    progressSteps = document.getElementById('pdf-progress-steps');
  }

  function updateProgress(percent, step) {
    if (progressBar) {
      progressBar.style.width = percent + '%';
    }
    if (progressSteps) {
      var percentEl = document.getElementById('pdf-progress-percent');
      var textEl = document.getElementById('pdf-progress-text');
      if (percentEl) percentEl.textContent = Math.round(percent) + '%';
      if (textEl && step) textEl.textContent = step;
    }
  }

  function hideProgress() {
    if (progressOverlay) {
      progressOverlay.remove();
      progressOverlay = null;
      progressBar = null;
      progressSteps = null;
    }
  }

  function toast(msg, type) {
    var c = document.getElementById('toast-container');
    if (!c) {
      c = document.createElement('div');
      c.id = 'toast-container';
      c.style.cssText = 'position:fixed;top:20px;right:20px;z-index:10000;';
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

    // 显示进度动画
    showProgress();
    updateProgress(5, '准备中...');

    try {
      // 短暂延迟让进度动画显示
      await new Promise(resolve => setTimeout(resolve, 100));
      
      updateProgress(15, '正在连接服务器...');
      
      // 调用后端 API
      var apiUrl = '/api/export-pdf';
      
      updateProgress(25, '服务器已响应，开始渲染...');
      
      var response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ period: period })
      });

      if (!response.ok) {
        var errorData = await response.json();
        throw new Error(errorData.message || 'PDF 生成失败');
      }

      updateProgress(60, '正在渲染 13 个页面...');

      // 获取 PDF 文件
      var blob = await response.blob();
      
      updateProgress(85, '渲染完成，正在生成 PDF...');
      
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // 获取文件名
      var reportDate = '';
      try {
        if (global.PreviewData && typeof PreviewData.loadReport === 'function') {
          var report = PreviewData.loadReport(period);
          if (report && report.period && report.period.report_date) {
            reportDate = report.period.report_date;
          }
        }
      } catch (e) {}
      
      var filename = '百草园-清尚-周报' + (reportDate || period || '') + '.pdf';

      updateProgress(95, '准备下载文件...');

      // 创建下载链接
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      
      // 清理
      setTimeout(function() {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 100);

      updateProgress(100, '完成！');
      
      setTimeout(function() {
        hideProgress();
        toast('PDF 导出成功: ' + filename, 'success');
      }, 800);

    } catch (err) {
      console.error('[PDF导出] 错误:', err);
      hideProgress();
      toast('PDF 导出失败: ' + (err.message || err), 'error');
    }
  }

  global.PreviewExportServer = { exportPDF: exportPDF };
})(window);
