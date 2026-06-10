// 测试背景图渲染
const {chromium} = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
 const templatePath = '/mnt/d/hyq/cjs/zb/zhibiao/templates/baicaoyuan/report.html';
 const html = fs.readFileSync(templatePath, 'utf-8');
 // setContent 不能直接加载 file://相对路径图片，需要 inline 或用 base URL
 //改成 data: URL 让图片也走 file://，或用临时目录 file://
 const tmpDir = '/tmp/pdf-test/out/template-test';
 fs.mkdirSync(tmpDir, { recursive: true });
 fs.writeFileSync(tmpDir + '/report.html', html);
 //把背景图也复制到 tmpDir 的相对位置
 fs.mkdirSync(tmpDir + '/assets/bg', { recursive: true });
 const srcDir = '/mnt/d/hyq/cjs/zb/zhibiao/templates/baicaoyuan';
 const bgFiles = ['07上周工作ECC.png','10下周计划施工段划分-食堂一层.png','10下周计划施工段划分-食堂二层.png','10下周计划施工段划分-食堂B1层.png','cover.png'];
 for (const f of bgFiles) fs.copyFileSync(srcDir + '/assets/bg/' + f, tmpDir + '/assets/bg/' + f);

 const browser = await chromium.launch({args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--font-render-hinting=none']});
 const ctx = await browser.newContext({viewport:{width:1280,height:720},deviceScaleFactor:1});
 const page = await ctx.newPage();
 await page.route('**/*', (route) => {
 const u = route.request().url();
 if (u.startsWith('file://') || u.startsWith('data:')) return route.continue();
 return route.abort();
 });
 console.log('goto...');
 // setContent 不能加载相对路径图片，必须内联成 data URI
 //改成读取图片 base64 inline
 function toDataURI(p) { return 'data:image/png;base64,' + fs.readFileSync(p).toString('base64'); }
 let html2 = html;
 //替换 assets/bg/xxx.png 为 data URI
 for (const f of bgFiles) {
 const uri = toDataURI(tmpDir + '/assets/bg/' + f);
 html2 = html2.split('assets/bg/' + f).join(uri);
 }
 await page.setContent(html2, {waitUntil:'commit', timeout:15000});
 await page.evaluate(() => { document.fonts.ready = Promise.resolve(); });
 await page.waitForTimeout(3000);
 const el = await page.$('#page01');
 const t0 = Date.now();
 await el.screenshot({path:'/tmp/pdf-test/out/test-bg-p01.png', timeout:30000, animations:'disabled'});
 console.log('shot in', Date.now()-t0, 'ms, size:', fs.statSync('/tmp/pdf-test/out/test-bg-p01.png').size);
 await browser.close();
})();
