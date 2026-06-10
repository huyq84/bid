const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { aggregate } = require('./src/aggregate');
//延迟 require playwright（只在 handler 用时加载）
function getRenderPdf() { return require('./src/pdf-render').renderPdf; }
log('aggregate loaded, type=' + typeof aggregate);

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

const DATA_FILE = path.join(__dirname, 'data/daily-mock.json');

// ============ LLM Provider 管理 ============
const LLM_FILE = path.join(__dirname, 'data/llm-providers.json');
if (!fs.existsSync(LLM_FILE)) fs.writeFileSync(LLM_FILE, JSON.stringify([], null,2));
app.get('/api/llm-providers', (req, res) => {
 const list = JSON.parse(fs.readFileSync(LLM_FILE, 'utf-8'));
 res.json(list.map(p => ({ ...p, api_key: p.api_key ? '***' + p.api_key.slice(-4) : '' })));
});
app.post('/api/llm-providers', (req, res) => {
 const list = JSON.parse(fs.readFileSync(LLM_FILE, 'utf-8'));
 const { name, base_url, api_key, default_model } = req.body;
 if (!name || !base_url) return res.status(400).json({ error: 'name 和 base_url必填' });
 const id = 'lp-' + Date.now();
 list.push({ id, name, base_url, api_key: api_key||'', default_model: default_model||'', models_cache:[], cache_ts:0, created_at: Date.now() });
 fs.writeFileSync(LLM_FILE, JSON.stringify(list, null,2));
 res.json({ id });
});
app.delete('/api/llm-providers/:id', (req, res) => {
 const list = JSON.parse(fs.readFileSync(LLM_FILE, 'utf-8'));
 const newList = list.filter(p => p.id !== req.params.id);
 fs.writeFileSync(LLM_FILE, JSON.stringify(newList, null,2));
 res.json({ ok: true });
});
app.post('/api/llm-providers/:id/fetch-models', async (req, res) => {
 const list = JSON.parse(fs.readFileSync(LLM_FILE, 'utf-8'));
 const idx = list.findIndex(p => p.id === req.params.id);
 if (idx <0) return res.status(404).json({ error: 'provider not found' });
 const p = list[idx];
 try {
 const url = p.base_url.replace(/\/$/,'') + '/models';
 const r = await fetch(url, { headers: { 'Authorization': 'Bearer ' + (p.api_key||'dummy') } });
 if (!r.ok) throw new Error('HTTP ' + r.status + ' (请检查 base_url 和 api_key)');
 const data = await r.json();
 const models = (data.data || data.models || []).map(m => typeof m === 'string' ? m : m.id);
 list[idx].models_cache = models;
 list[idx].cache_ts = Date.now();
 fs.writeFileSync(LLM_FILE, JSON.stringify(list, null,2));
 res.json({ models, cached_at: list[idx].cache_ts });
 } catch (e) {
 res.status(500).json({ error: e.message, hint: '检查网络/base_url/api_key，或手动填模型名' });
 }
});
app.post('/api/llm-providers/:id/test', async (req, res) => {
 const list = JSON.parse(fs.readFileSync(LLM_FILE, 'utf-8'));
 const p = list.find(x => x.id === req.params.id);
 if (!p) return res.status(404).json({ error: 'provider not found' });
 try {
 const url = p.base_url.replace(/\/$/,'') + '/chat/completions';
 const r = await fetch(url, {
 method: 'POST',
 headers: { 'Authorization': 'Bearer ' + p.api_key, 'Content-Type': 'application/json' },
 body: JSON.stringify({
 model: req.body.model || p.default_model || 'gpt-3.5-turbo',
 messages: [{ role: 'user', content: 'hi' }],
 max_tokens:5
 })
 });
 res.json({ status: r.status, ok: r.ok });
 } catch (e) { res.status(500).json({ error: e.message }); }
});
// ============8. 月报生成 ============
app.get('/api/monthly/data', (req, res) => {
 const m = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/monthly-mock.json'), 'utf-8'));
 res.json(m);
});
app.post('/api/monthly/generate', async (req, res) => {
 try {
 log('monthly generate');
 // 月报是文本汇总，简化版：生成 markdown文本
 const m = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/monthly-mock.json'), 'utf-8'));
 const md = `# ${m.month.title}\n\n## 月度概览\n- 本月完成工序 ${m.summary.completed_tasks}/${m.summary.total_tasks}（${m.summary.completion_rate}）\n-峰值在场 ${m.summary.total_workers_peak} 人\n- ECC销项 ${m.summary.ecc_closed}/${m.summary.ecc_total}（${m.summary.ecc_close_rate}）\n- 图纸深化 ${m.summary.drawings_completed}/${m.summary.drawings_total}\n\n##重要节点进展\n${m.monthly_milestones.map(x => `- ${x.major} · ${x.node}：${x.status}（${x.progress}）`).join('\n')}\n\n## 主要成果\n${m.key_achievements.map(x => `- ${x}`).join('\n')}\n\n## 下月计划\n${m.next_month_plan.map(x => `- ${x}`).join('\n')}\n`;
 const outDir = path.resolve(__dirname, '../output');
 fs.mkdirSync(outDir, { recursive: true });
 const outPath = path.join(outDir, `${m.month.id}.md`);
 fs.writeFileSync(outPath, md);
 res.json({ ok: true, md_path: outPath, month: m.month, summary: m.summary });
 } catch (e) { log('monthly err: ' + e.message); res.status(500).json({ error: e.message }); }
});

// ============7. 周报生成（核心） ============
function log(msg) {
 fs.appendFileSync('/tmp/zhibiao-server.log', new Date().toISOString() + ' ' + msg + '\n');
}
log('server.js loaded');

app.get('/api/health', (req, res) => {
 log('/health');
 res.json({ ok: true, ts: Date.now(), service: 'zhibiao-backend' });
});

// ============ 项目列表 ============
app.get('/api/projects', (req, res) => {
 const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
 res.json([{ id: raw.project.id, name: raw.project.name, company: raw.project.company }]);
});

// ============事实聚合 ============
app.post('/api/aggregate', (req, res) => {
 try {
 const raw = req.body.daily_data || JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
 const facts = aggregate(raw);
 res.json(facts);
 } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============ 日报提交 ============
const DAILY_FILE = path.join(__dirname, 'data/daily-submissions.json');
if (!fs.existsSync(DAILY_FILE)) fs.writeFileSync(DAILY_FILE, JSON.stringify([], null,2));
app.post('/api/daily/submit', (req, res) => {
 try {
 const subs = JSON.parse(fs.readFileSync(DAILY_FILE, 'utf-8'));
 const sub = {
 id: 'd-' + Date.now(),
 date: req.body.date,
 project: req.body.project || 'P001',
 reporter: req.body.reporter,
 tasks: req.body.tasks || [],
 workers: req.body.workers || [],
 notes: req.body.notes || '',
 submitted_at: Date.now()
 };
 subs.push(sub);
 fs.writeFileSync(DAILY_FILE, JSON.stringify(subs, null,2));
 log('daily submit: ' + sub.id + ' by ' + sub.reporter);
 res.json({ ok: true, id: sub.id });
 } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/daily/list', (req, res) => {
 try {
 const subs = JSON.parse(fs.readFileSync(DAILY_FILE, 'utf-8'));
 res.json(subs);
 } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/report/generate', async (req, res) => {
 log('enter generate, body=' + JSON.stringify(req.body).slice(0,200));
 try {
 const raw = req.body.daily_data || JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
 log('aggregating');
 const facts = aggregate(raw);
 log('aggregate done, week=' + facts.week.id);
 const outDir = path.resolve(__dirname, '../output');
 fs.mkdirSync(outDir, { recursive: true });
 const outPath = path.join(outDir, `${facts.week.id}.pdf`);
 log('rendering PDF to ' + outPath);
 await getRenderPdf()(facts, outPath);
 log('PDF done, sending response');
 res.json({ ok: true, pdf_path: outPath, week: facts.week, summary: facts.work_summary });
 log('response sent');
 } catch (e) {
 log('ERROR: ' + e.message);
 res.status(500).json({ error: e.message });
 }
});

const PORT =3010;
app.listen(PORT, '0.0.0.0', () => {
 log('started on ' + PORT);
});
