const express = require('express');
const fs = require('fs');
function log(m) { fs.appendFileSync('/tmp/zhibiao-min.log', new Date().toISOString() + ' ' + m + '\n'); }
log('min loaded');
const app = express();
app.use(express.json());
app.get('/h', (req, res) => { log('/h'); res.json({ok:true}); });
app.post('/g', async (req, res) => {
 log('/g enter');
 //不调 renderPdf
 res.json({ok:true});
 log('/g done');
});
app.listen(3012, '0.0.0.0', () => log('started3012'));
