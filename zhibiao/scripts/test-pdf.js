//独立测试截图
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
 const html = fs.readFileSync('/tmp/pdf-test/out/zhibiao-rendered.html', 'utf-8');
 const browser = await chromium.launch({
 args: ['--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--font-render-hinting=none']
 });
 const ctx = await browser.newContext({ viewport: { width:1280, height:720 } });
 const page = await ctx.newPage();
 page.on('console', m => console.log('[browser]', m.type(), m.text()));
 await page.route('**/*', (route) => {
 const u = route.request().url();
 if (u.startsWith('file://')) return route.continue();
 return route.abort();
 });
 console.log('goto...');
 await page.goto('file:///tmp/pdf-test/out/zhibiao-rendered.html', { waitUntil: 'commit', timeout:15000 });
 console.log('fonts.ready hack...');
 await page.evaluate(() => { document.fonts.ready = Promise.resolve(); });
 await page.waitForTimeout(3000);
 console.log('first shot...');
 const el = await page.$('#page01');
 if (!el) { console.log('no el page01'); await browser.close(); return; }
 try {
 await el.screenshot({ path: '/tmp/pdf-test/out/test-p01.png', timeout:20000, animations:'disabled' });
 console.log('p01 ok', fs.statSync('/tmp/pdf-test/out/test-p01.png').size);
 } catch (e) {
 console.log('p01 fail:', e.message.slice(0,200));
 }
 await browser.close();
})();
