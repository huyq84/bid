const express = require('express');
const fs = require('fs');
const path = require('path');
function log(m) { fs.appendFileSync('/tmp/zhibiao-test2.log', new Date().toISOString() + ' ' + m + '\n'); }
log('start');
log('require express ok');
const { aggregate } = require('./src/aggregate');
log('aggregate loaded, type=' + typeof aggregate);
const app = express();
log('express app created');
app.use(express.json());
log('json middleware added');
app.get('/h', (req, res) => { log('/h called'); res.json({ok:true}); });
log('GET /h registered');
app.post('/g', (req, res) => { log('/g called'); res.json({ok:true}); });
log('POST /g registered');
app.listen(3013, '0.0.0.0', () => log('started3013'));
log('listen called');
