//极简 Express 测试，看 /api/foo 是否进入 handler
const express = require('express');
const fs = require('fs');
const app = express();
app.use(express.json());
function log(m) { fs.appendFileSync('/tmp/zhibiao-test.log', new Date().toISOString() + ' ' + m + '\n'); }
log('loaded');
app.get('/h', (req, res) => { log('/h called'); res.json({ok:true}); });
app.post('/g', async (req, res) => {
 log('/g enter');
 await new Promise(r => setTimeout(r,1000));
 log('/g done');
 res.json({ok:true,body:req.body});
});
app.listen(3011, '0.0.0.0', () => log('started'));
