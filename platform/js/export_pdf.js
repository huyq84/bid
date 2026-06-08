// platform/js/export_pdf.js
// jsPDF + html2canvas 拼 PDF
// v5.2 - 跨实例自然分页, 跨页表头重复
(function (global) {
  function loadJsPDF() {
    return new Promise((resolve, reject) => {
      if (window.jspdf) return resolve(window.jspdf);
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js';
      s.onload = () => resolve(window.jspdf);
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }
  function loadHtml2Canvas() {
    return new Promise((resolve, reject) => {
      if (window.html2canvas) return resolve(window.html2canvas);
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
      s.onload = () => resolve(window.html2canvas);
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  // 5.2 导出主函数
  async function exportPDF(report) {
    const { jsPDF } = await loadJsPDF();
    const html2canvas = await loadHtml2Canvas();

    // 5.2.1 实例化所有版式
    const instances = [];
    (report.nav_tree || []).forEach(node => walkNode(node, instances, report));

    // 5.2.2 准备一个隐藏的全量渲染容器
    const container = document.createElement('div');
    container.id = 'pdf-render-root';
    container.style.cssText = 'position:fixed; left:-100000px; top:0; width:1280px; background:#fff;';
    document.body.appendChild(container);

    // 5.2.3 每个实例画 1 个 1280x720 div
    instances.forEach(inst => {
      const div = document.createElement('div');
      div.style.cssText = 'width:1280px; height:720px; position:relative; background:#fff; overflow:hidden; page-break-after:always;';
      div.innerHTML = inst.html;
      container.appendChild(div);
    });

    // 5.2.4 转 PDF
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'px', format: [1280, 720], compress: true });
    const divs = container.querySelectorAll(':scope > div');
    for (let i = 0; i < divs.length; i++) {
      const canvas = await html2canvas(divs[i], { width: 1280, height: 720, scale: 1, backgroundColor: '#fff' });
      const img = canvas.toDataURL('image/jpeg', 0.85);
      if (i > 0) pdf.addPage([1280, 720], 'landscape');
      pdf.addImage(img, 'JPEG', 0, 0, 1280, 720, undefined, 'FAST');
    }
    document.body.removeChild(container);

    // 5.2.5 命名 + 下载
    const period = report.period || {};
    const fname = '百草园-清尚-周报' + (period.report_date || 'YYYY.M.DD') + '.pdf';
    pdf.save(fname);
  }

  // 5.3 递归遍历 nav_tree
  function walkNode(node, instances, report) {
    if (node.type === 'page' && node.page_id) {
      if (report.pages_data && report.pages_data[node.page_id]) {
        const data = report.pages_data[node.page_id];
        if (data.type === 'single') {
          instances.push({
            id: node.page_id,
            subTitle: NavTree.subTitle(node),
            html: renderPageHTML(node, data)
          });
        } else if (data.type === 'repeatable') {
          const insts = materializeInstances(node.page_id, data, report);
          insts.forEach(inst => {
            instances.push({
              id: inst.id,
              subTitle: NavTree.subTitle(node, inst),
              html: renderPageHTML(node, { ...data, currentInstance: inst })
            });
          });
        } else if (data.type === 'free' || data.is_closing) {
          // 封尾: 也算 1 个实例
          instances.push({
            id: node.page_id,
            subTitle: NavTree.subTitle(node),
            html: renderPageHTML(node, data)
          });
        }
      }
    }
    if (node.children) node.children.forEach(c => walkNode(c, instances, report));
  }

  function materializeInstances(pageId, data, report) {
    const sec = window.Sections && window.Sections[pageId];
    if (sec && sec.materialize) {
      return sec.materialize(report);
    }
    return [];
  }

  function renderPageHTML(node, data) {
    const sec = window.Sections && window.Sections[node.page_id];
    let bodyHtml = '';
    if (sec && sec.render) {
      bodyHtml = sec.render(window.__report || {});
    }
    return '<div style="position:absolute; top:0; left:0; right:0; bottom:0; background:linear-gradient(135deg, #0a1f3a, #0f3460); font-family: Noto Sans SC, Microsoft YaHei, sans-serif; color: #fff; padding: 0;">' +
      '<div style="position:absolute; top:23px; left:0; width:58px; height:52px; background:#37a3eb; clip-path:polygon(0 0, 60% 0, 100% 100%, 0 100%);"></div>' +
      '<div style="position:absolute; top:75px; left:72px; right:0; height:3px; background:#37a3eb;"></div>' +
      '<h1 style="position:absolute; top:21px; left:72px; font-size:32px; font-weight:700; color:#37a3eb; margin:0; letter-spacing:2px;">' + (node.name || '') + '</h1>' +
      (node.prefix ? '<div style="position:absolute; top:78.5px; left:72px; padding:6px 18px; background:linear-gradient(to right, #facc15, #f43f5e); color:#fff; font-size:18px; font-weight:700;">' + node.prefix + '</div>' : '') +
      '<div style="position:absolute; top:140px; left:72px; right:72px; bottom:40px; overflow:auto;">' + bodyHtml + '</div>' +
      '</div>';
  }

  global.ExportPDF = { exportPDF };
})(window);
