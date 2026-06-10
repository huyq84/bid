const { renderPdf } = require('./src/pdf-render');
const { aggregate } = require('./src/aggregate');
const fs = require('fs');
const path = require('path');

(async () => {
 const raw = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/daily-mock.json'), 'utf-8'));
 const facts = aggregate(raw);
 console.error('[runner] generating PDF for week', facts.week.id);
 const out = '/mnt/d/hyq/cjs/zb/zhibiao/output/' + facts.week.id + '.pdf';
 fs.mkdirSync(path.dirname(out), { recursive: true });
 const sz = await renderPdf(facts, out);
 console.error('[runner] done, size=', sz);
 process.exit(0);
})();
