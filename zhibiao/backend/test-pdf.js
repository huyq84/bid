const {chromium} = require('playwright');
const fs = require('fs');
(async()=>{
const browser=await chromium.launch({args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage']});
const ctx=await browser.newContext({viewport:{width:1280,height:720}});
const page=await ctx.newPage();
await page.route('**/*',r=>{ if(r.request().url().startsWith('file://')) r.continue(); else r.abort(); });
//直接 setContent，不走 file://
const html = fs.readFileSync('/tmp/pdf-test/out/report-nobg.html','utf-8');
const start = Date.now();
await page.setContent(html, {waitUntil:'commit', timeout:15000});
await page.evaluate(()=>{document.fonts.ready=Promise.resolve();});
await page.waitForTimeout(2000);
console.log('content loaded in', Date.now()-start, 'ms');
const el=await page.$('#page01');
if (!el) { console.log('no el page01'); await browser.close(); return; }
const t0 = Date.now();
await el.screenshot({path:'/tmp/pdf-test/out/nobg-p01.png',timeout:20000,animations:'disabled'});
console.log('shot in', Date.now()-t0, 'ms, size:', fs.statSync('/tmp/pdf-test/out/nobg-p01.png').size);
await browser.close();
})();
