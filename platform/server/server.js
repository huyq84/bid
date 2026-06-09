// server.js - 百草园周报 PDF 生成服务
const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3010;

// 中间件
app.use(cors());
app.use(express.json());

// 静态文件服务（服务前端页面）
app.use(express.static(path.join(__dirname, '..')));

// PDF 生成 API
app.post('/api/export-pdf', async (req, res) => {
  let browser = null;
  
  try {
    const { period } = req.body;
    console.log(`[PDF生成] 开始生成 PDF，周期: ${period || '默认'}`);
    
    // 启动浏览器
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-web-security'
      ]
    });
    
    const page = await browser.newPage();
    
    // 设置视口
    await page.setViewport({ 
      width: 1280, 
      height: 720,
      deviceScaleFactor: 2 // 高清渲染
    });
    
    // 构建 URL
    const baseUrl = `http://localhost:${PORT}`;
    const pages = ['01', '02', '03', '0301', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
    
    // 创建一个包含所有页面的临时 HTML
    const periodParam = period ? `?period=${encodeURIComponent(period)}` : '';
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>百草园-清尚-周报${period || ''}</title>
  <style>
    @page {
      size: 1280px 720px;
      margin: 0;
    }
    body {
      margin: 0;
      padding: 0;
    }
    .page-container {
      width: 1280px;
      height: 720px;
      page-break-after: always;
      position: relative;
      overflow: hidden;
    }
    .page-container:last-child {
      page-break-after: auto;
    }
    iframe {
      width: 1280px;
      height: 720px;
      border: none;
      display: block;
    }
  </style>
</head>
<body>
${pages.map(pageId => `
  <div class="page-container">
    <iframe src="${baseUrl}/preview_pages/${pageId}.html${periodParam}"></iframe>
  </div>
`).join('\n')}
</body>
</html>
    `;
    
    // 设置 HTML 内容
    await page.setContent(htmlContent, { 
      waitUntil: 'networkidle0',
      timeout: 60000 
    });
    
    // 等待所有 iframe 加载完成
    await page.waitForFunction(() => {
      const iframes = document.querySelectorAll('iframe');
      return Array.from(iframes).every(iframe => {
        try {
          return iframe.contentDocument && iframe.contentDocument.readyState === 'complete';
        } catch (e) {
          return false;
        }
      });
    }, { timeout: 60000 });
    
    // 额外等待确保渲染完成
    await page.waitForTimeout(2000);
    
    console.log('[PDF生成] 页面加载完成，开始生成 PDF');
    
    // 生成 PDF
    const pdf = await page.pdf({
      width: '1280px',
      height: '720px',
      printBackground: true,
      preferCSSPageSize: true
    });
    
    await browser.close();
    browser = null;
    
    console.log('[PDF生成] PDF 生成成功');
    
    // 获取报告日期
    let reportDate = period || '';
    
    // 返回 PDF
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent('百草园-清尚-周报' + reportDate + '.pdf')}"`);
    res.send(pdf);
    
  } catch (error) {
    console.error('[PDF生成] 错误:', error);
    
    if (browser) {
      await browser.close();
    }
    
    res.status(500).json({
      error: 'PDF 生成失败',
      message: error.message
    });
  }
});

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: '百草园周报 PDF 生成服务' });
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║  百草园周报 PDF 生成服务已启动                             ║
║                                                            ║
║  服务地址: http://localhost:${PORT}                          ║
║  预览页面: http://localhost:${PORT}/preview.html             ║
║  API 端点: http://localhost:${PORT}/api/export-pdf           ║
║                                                            ║
║  按 Ctrl+C 停止服务                                        ║
╚════════════════════════════════════════════════════════════╝
  `);
});
