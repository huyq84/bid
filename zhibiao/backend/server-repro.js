//最小复现：完全跟 server.js一样，除了只跑 GET
const express = require('express');
const fs = require('fs');
function log(m){fs.appendFileSync('/tmp/repro.log',new Date().toISOString()+' '+m+'\n');}
log('start');
const app = express();
log('app');
app.get('/h',(req,res)=>{log('/h enter');res.json({ok:true});log('/h exit');});
log('route registered');
app.listen(3014,'0.0.0.0',()=>log('started'));
log('after listen');
