// PDF渲染管线
//1. 占位符替换
//2. Playwright setContent（避开 file:// WSL卡死）
//3.逐页 element.screenshot
//4. pdf-lib拼接
//模板里图片已经是 inline SVG data URI，不需额外加载

const { chromium } = require('playwright');
const { PDFDocument } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

function resolveTemplatePath() {
 const tmpPath = '/tmp/zhibiao-template/report.html';
 if (fs.existsSync(tmpPath)) return tmpPath;
 return path.resolve(__dirname, '../../templates/baicaoyuan/report.html');
}
const TEMPLATE_PATH = resolveTemplatePath();

function renderTemplate(html, facts) {
 function get(obj, p) {
 return p.split('.').reduce((o, k) => (o == null ? '' : o[k]), obj);
 }
 return html.replace(/\{\{([^}]+)\}\}/g, (_, key) => {
 const key2 = key.trim();
 const v = get(facts, key2);
 return v == null || v === '' ? '' : String(v);
 });
}

function injectFacts(html, facts) {
 const script = `\n<script>\nwindow.__FACTS__ = ${JSON.stringify(facts)};\n</script>\n`;
 return html.replace('</head>', script + '</head>');
}

function patchStyle(html) {
 const css = `
<style>
.h1cover { font-size:56px; font-weight:700; color: #fff; letter-spacing:0.2em; text-shadow:02px4px rgba(0,0,0,0.3); }
.h2cover { font-size:56px; font-weight:700; color: #facc15; letter-spacing:0.2em; text-shadow:02px4px rgba(0,0,0,0.3); }
.company { font-size:24px; font-weight:700; color: #0081cc; letter-spacing:0.2em; }
.report-meta { font-size:18px; font-weight:700; color: #fff; }
.report-meta .accent { color: #facc15; }
</style>
`;
 return html.replace('</head>', css + '</head>');
}

async function renderPdf(facts, outPath) {
 console.error('[pdf] loading template from', TEMPLATE_PATH);
 let html = fs.readFileSync(TEMPLATE_PATH, 'utf-8');
 html = patchStyle(html);
 html = injectFacts(html, facts);
 html = renderTemplate(html, facts);
 console.error('[pdf] html size:', html.length, 'bytes');

 console.error('[pdf] launching chromium...');
 const browser = await chromium.launch({
 args: ['--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--font-render-hinting=none']
 });
 const ctx = await browser.newContext({
 viewport: { width:1280, height:720 },
 deviceScaleFactor:1
 });
 const page = await ctx.newPage();
 //禁用非 file://之外的所有请求（避免字体/外链）
 await page.route('**/*', (route) => {
 const u = route.request().url();
 if (u.startsWith('file://') || u.startsWith('data:') || u.startsWith('about:')) return route.continue();
 return route.abort();
 });

 console.error('[pdf] setContent...');
 await page.setContent(html, { waitUntil: 'commit', timeout:30000 });
 await page.evaluate(() => { document.fonts.ready = Promise.resolve(); });
 await page.waitForTimeout(2500);

 const pageIds = [
 'page01','page02','page03','page0301','page04','page05','page06',
 'page07','page08','page09','page10','page11','page12'
 ];
 const screenshots = [];
 for (const id of pageIds) {
 const shotPath = `/tmp/pdf-test/out/${id}.png`;
 try {
 await page.evaluate((pid) => {
 document.querySelectorAll('.page-wrapper').forEach(p => { p.style.display='none'; });
 const el = document.getElementById(pid);
 if (el) el.style.display='block';
 }, id);
 await page.waitForTimeout(80);
 const el = await page.$('#' + id);
 if (!el) { console.error('[pdf] skip', id); continue; }
 await el.screenshot({ path: shotPath, timeout:15000, animations:'disabled' });
 const sz = fs.statSync(shotPath).size;
 console.error('[pdf]', id, 'shot', sz, 'bytes');
 screenshots.push(shotPath);
 } catch (e) {
 console.error('[pdf]', id, 'FAIL:', e.message.slice(0,200));
 }
 }
 await browser.close();

 if (screenshots.length ===0) throw new Error('no screenshots');
 console.error('[pdf] building PDF from', screenshots.length, 'shots...');
 const pdf = await PDFDocument.create();
 for (const sp of screenshots) {
 const png = fs.readFileSync(sp);
 const img = await pdf.embedPng(png);
 const page = pdf.addPage([841.89,595.28]);
 page.drawImage(img, { x:0, y:0, width:841.89, height:595.28 });
 }
 const bytes = await pdf.save();
 fs.writeFileSync(outPath, bytes);
 console.error('[pdf] written', outPath, bytes.length, 'bytes');
 return bytes.length;
}

module.exports = { renderPdf, renderTemplate };
