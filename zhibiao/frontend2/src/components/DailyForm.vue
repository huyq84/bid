<script setup>
import { ref, computed, onMounted } from 'vue'

const today = new Date().toISOString().slice(0,10)
const projects = ref([])

async function loadProjects() {
 try {
 const r = await fetch('/api/projects')
 if (r.ok) projects.value = await r.json()
 } catch (e) {}
}

const form = ref({
 date: today,
 project_id: 'P001',
 reporter: '',
 weather: '晴',
 temperature: '',
 shift: '白班',
})

//工序列表（多条）
const tasks = ref([
 { name: '', specialty: '软装', area: '', owner: '', progress:0, status: '进行中', note: '', photos: [] }
])

//工种在场人数（多个）
const workers = ref([
 { specialty: '软装', type: '木工', count:0, peak_count:0 }
])

//协调事项（多条）
const coordinations = ref([
 { issue: '', from_dept: '', to_dept: '', urgency: '中', note: '' }
])

//问题/整改上报
const issues = ref([])
const newIssue = ref({ type: '质量问题', desc: '', location: '', owner: '', photo: null })

const submitting = ref(false)
const lastResult = ref(null)
const activeTab = ref('tasks') // tasks / workers / coord / issues / photos

const specialtyOptions = ['软装', '精装', '机电', '幕墙', '土建', '钢结构', '其他']
const workerTypes = ['木工','瓦工','电工','水工','油工','焊工','普工','管理人员','小工','临电','防水','材料员','资料员','其他']
const weatherOptions = ['晴','阴','雨','雪','雾','高温','低温']
const urgencyOptions = ['低','中','高','紧急']

function addTask() { tasks.value.push({ name: '', specialty: '软装', area: '', owner: '', progress:0, status: '进行中', note: '', photos: [] }) }
function delTask(i) { if (tasks.value.length >1) tasks.value.splice(i,1) }

function addWorker() { workers.value.push({ specialty: '软装', type: '木工', count:0, peak_count:0 }) }
function delWorker(i) { if (workers.value.length >1) workers.value.splice(i,1) }

function addCoord() { coordinations.value.push({ issue: '', from_dept: '', to_dept: '', urgency: '中', note: '' }) }
function delCoord(i) { if (coordinations.value.length >1) coordinations.value.splice(i,1) }

function addIssue() {
 if (!newIssue.value.desc.trim()) { alert('请填写问题描述'); return }
 issues.value.push({ ...newIssue.value, id: 'iss-' + Date.now() })
 newIssue.value = { type: '质量问题', desc: '', location: '', owner: '', photo: null }
}
function delIssue(i) { issues.value.splice(i,1) }

//拍照上传（移动端 input capture）
function handlePhoto(taskIdx, e) {
 const files = e.target.files
 if (!files) return
 for (const f of files) {
 const reader = new FileReader()
 reader.onload = () => { tasks.value[taskIdx].photos.push(reader.result) }
 reader.readAsDataURL(f)
 }
}

const totalProgress = computed(() => {
 if (tasks.value.length ===0) return0
 return Math.round(tasks.value.reduce((s,t) => s + (Number(t.progress)||0),0) / tasks.value.length)
})
const totalWorkers = computed(() => workers.value.reduce((s,w) => s + (Number(w.count)||0),0))

//校验必填
const canSubmit = computed(() => {
 return form.value.reporter.trim() && form.value.project_id && tasks.value.every(t => t.name.trim() && t.area.trim())
})

async function submit() {
 if (!canSubmit.value) { alert('请补全必填项：填报人、项目、每条工序的名称和部位'); return }
 submitting.value = true
 lastResult.value = null
 try {
 const payload = { ...form.value, tasks: tasks.value, workers: workers.value, coordinations: coordinations.value, issues: issues.value }
 const r = await fetch('/api/daily/submit', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify(payload)
 })
 const data = await r.json()
 lastResult.value = data
 if (data.ok) {
 //滚动到结果
 setTimeout(() => {
 const el = document.querySelector('.result')
 if (el) el.scrollIntoView({ behavior: 'smooth' })
 },100)
 }
 } catch (e) {
 lastResult.value = { error: e.message }
 }
 submitting.value = false
}

onMounted(loadProjects)
</script>

<template>
<div class="page">
<h1>📋 日报填报</h1>
<div class="subtitle">百草园城市更新项目 · 北京清尚</div>

<!-- ============基础信息 ============ -->
<section class="card">
 <h2>📅 基本信息</h2>
 <div class="grid2">
 <div class="field">
 <label>日期 <span class="required">*</span></label>
 <input v-model="form.date" type="date"/>
 </div>
 <div class="field">
 <label>项目 <span class="required">*</span></label>
 <select v-model="form.project_id">
 <option v-for="p in projects" :key="p.id" :value="p.id">{{ p.name }}</option>
 <option v-if="projects.length ===0" value="P001">百草园城市更新项目</option>
 </select>
 </div>
 <div class="field">
 <label>填报人 <span class="required">*</span></label>
 <input v-model="form.reporter" placeholder="姓名"/>
 </div>
 <div class="field">
 <label>班次</label>
 <select v-model="form.shift">
 <option>白班</option><option>夜班</option>
 </select>
 </div>
 <div class="field">
 <label>天气</label>
 <select v-model="form.weather">
 <option v-for="w in weatherOptions" :key="w" :value="w">{{ w }}</option>
 </select>
 </div>
 <div class="field">
 <label>温度</label>
 <input v-model="form.temperature" placeholder="如25℃"/>
 </div>
 </div>
</section>

<!-- ============工序列表 ============ -->
<section class="card">
 <h2>🔨今日完成工序 <span class="badge">{{ tasks.length }}项</span></h2>
 <div v-for="(t, i) in tasks" :key="i" class="task-item">
 <div class="task-header">
 <span class="task-no">#{{ i+1 }}</span>
 <button class="del-btn" @click="delTask(i)" v-if="tasks.length >1">删除</button>
 </div>
 <div class="grid2">
 <div class="field">
 <label>工序名称 <span class="required">*</span></label>
 <input v-model="t.name" placeholder="如：一层天花封板"/>
 </div>
 <div class="field">
 <label>所属部位 <span class="required">*</span></label>
 <input v-model="t.area" placeholder="如：高管层 /食堂一层 / 北塔"/>
 </div>
 <div class="field">
 <label>专业</label>
 <select v-model="t.specialty">
 <option v-for="s in specialtyOptions" :key="s" :value="s">{{ s }}</option>
 </select>
 </div>
 <div class="field">
 <label>责任人</label>
 <input v-model="t.owner" placeholder="姓名"/>
 </div>
 <div class="field">
 <label>完成进度</label>
 <div class="progress-row">
 <input v-model.number="t.progress" type="range" min="0" max="100" step="5"/>
 <span class="progress-val">{{ t.progress }}%</span>
 </div>
 </div>
 <div class="field">
 <label>状态</label>
 <select v-model="t.status">
 <option>未开始</option><option>进行中</option><option>已完成</option><option>暂停</option>
 </select>
 </div>
 </div>
 <div class="field">
 <label>备注</label>
 <textarea v-model="t.note" rows="2" placeholder="特殊情况说明..."/>
 </div>
 <!--拍照 -->
 <div class="photo-area">
 <label class="photo-btn">
 📷 添加现场照片（可多张）
 <input type="file" accept="image/*" capture="environment" multiple
 @change="handlePhoto(i,$event)" style="display:none"/>
 </label>
 <div v-if="t.photos.length" class="photo-list">
 <div v-for="(p, pi) in t.photos" :key="pi" class="photo-thumb">
 <img :src="p"/>
 <button class="del-photo" @click="t.photos.splice(pi,1)">×</button>
 </div>
 </div>
 </div>
 </div>
 <button class="add-btn" @click="addTask">+加工序</button>
</section>

<!-- ============ 工种人数 ============ -->
<section class="card">
 <h2>👷 在场工种 <span class="badge">共 {{ totalWorkers }} 人</span></h2>
 <div v-for="(w, i) in workers" :key="i" class="worker-item">
 <div class="grid3">
 <div class="field">
 <label>专业</label>
 <select v-model="w.specialty">
 <option v-for="s in specialtyOptions" :key="s" :value="s">{{ s }}</option>
 </select>
 </div>
 <div class="field">
 <label>工种</label>
 <select v-model="w.type">
 <option v-for="t in workerTypes" :key="t" :value="t">{{ t }}</option>
 </select>
 </div>
 <div class="field">
 <label>在场人数</label>
 <input v-model.number="w.count" type="number" min="0" placeholder="0"/>
 </div>
 </div>
 <button class="del-btn small" @click="delWorker(i)" v-if="workers.length >1">删除</button>
 </div>
 <button class="add-btn" @click="addWorker">+加工种</button>
</section>

<!-- ============协调事项 ============ -->
<section class="card">
 <h2>🤝协调事项 <span class="badge">{{ coordinations.length }}项</span></h2>
 <div v-for="(c, i) in coordinations" :key="i" class="coord-item">
 <div class="field">
 <label>需协调事宜 <span class="required">*</span></label>
 <textarea v-model="c.issue" rows="2" placeholder="如：北塔幕墙封闭进度影响高管区施工"/>
 </div>
 <div class="grid3">
 <div class="field">
 <label>提出部门</label>
 <input v-model="c.from_dept" placeholder="如：软装施工"/>
 </div>
 <div class="field">
 <label>配合部门</label>
 <input v-model="c.to_dept" placeholder="如：幕墙分包"/>
 </div>
 <div class="field">
 <label>紧急程度</label>
 <select v-model="c.urgency">
 <option v-for="u in urgencyOptions" :key="u" :value="u">{{ u }}</option>
 </select>
 </div>
 </div>
 <button class="del-btn small" @click="delCoord(i)" v-if="coordinations.length >1">删除</button>
 </div>
 <button class="add-btn" @click="addCoord">+ 加协调事项</button>
</section>

<!-- ============ 问题/整改 ============ -->
<section class="card">
 <h2>⚠️ 问题与整改 <span class="badge">{{ issues.length }}项</span></h2>
 <div class="issue-input">
 <div class="grid2">
 <div class="field">
 <label>类型</label>
 <select v-model="newIssue.type">
 <option>质量问题</option><option>安全问题</option><option>进度问题</option><option>协调问题</option><option>其他</option>
 </select>
 </div>
 <div class="field">
 <label>位置</label>
 <input v-model="newIssue.location" placeholder="如：食堂二层西侧"/>
 </div>
 </div>
 <div class="field">
 <label>问题描述 <span class="required">*</span></label>
 <textarea v-model="newIssue.desc" rows="2" placeholder="如：天花腻子局部起鼓，需返工"/>
 </div>
 <div class="field">
 <label>整改责任人</label>
 <input v-model="newIssue.owner" placeholder="姓名"/>
 </div>
 <button class="add-btn" @click="addIssue">+ 加入问题台账</button>
 </div>
 <div v-if="issues.length" class="issue-list">
 <div v-for="(iss, i) in issues" :key="iss.id" class="issue-row">
 <span class="issue-type">{{ iss.type }}</span>
 <span class="issue-loc">{{ iss.location }}</span>
 <span class="issue-desc">{{ iss.desc }}</span>
 <button class="del-btn small" @click="delIssue(i)">×</button>
 </div>
 </div>
</section>

<!-- ============提交 ============ -->
<section class="card summary">
 <h2>📊今日概览</h2>
 <div class="summary-row">
 <div class="summary-item">
 <div class="big">{{ tasks.length }}</div>
 <div class="small">工序项</div>
 </div>
 <div class="summary-item">
 <div class="big">{{ totalProgress }}%</div>
 <div class="small">平均进度</div>
 </div>
 <div class="summary-item">
 <div class="big">{{ totalWorkers }}</div>
 <div class="small">在场人数</div>
 </div>
 <div class="summary-item">
 <div class="big">{{ issues.length }}</div>
 <div class="small">问题数</div>
 </div>
 </div>
 <button class="submit-btn" @click="submit" :disabled="submitting || !canSubmit">
 {{ submitting ? '提交中...' : '✓提交日报' }}
 </button>
 <div v-if="!canSubmit" class="hint">请先填写带 * 的必填项</div>
</section>

<!-- ============提交结果 ============ -->
<div v-if="lastResult" class="result">
 <h3 v-if="lastResult.ok">✅提交成功</h3>
 <h3 v-else>❌提交失败</h3>
 <pre>{{ JSON.stringify(lastResult, null,2) }}</pre>
 <router-link to="/preview" v-if="lastResult.ok" class="link-btn">查看周报预览 →</router-link>
</div>
</div>
</template>

<style scoped>
.page { padding:16px; max-width:480px; margin:0 auto; background:#f5f7fa; min-height:100vh; }
h1 { color:#0081cc; margin:004px; font-size:22px; }
.subtitle { color:#666; font-size:13px; margin-bottom:16px; }
h2 { color:#16213e; margin:004px; font-size:16px; display:flex; align-items:center; gap:8px; }
.badge { background:#0081cc; color:#fff; font-size:11px; padding:2px8px; border-radius:10px; font-weight:normal; }
.card { background:#fff; padding:16px; margin:12px0; border-radius:8px; box-shadow:01px3px rgba(0,0,0,0.05); }
.grid2 { display:grid; grid-template-columns:1fr1fr; gap:8px; }
.grid3 { display:grid; grid-template-columns:1fr1fr1fr; gap:8px; }
.field { display:flex; flex-direction:column; gap:4px; margin:8px0; }
.field label { font-size:12px; color:#666; }
.required { color:#f43f5e; }
input, select, textarea { padding:8px10px; border:1px solid #ddd; border-radius:6px; font-size:14px; background:#fafafa; }
input:focus, select:focus, textarea:focus { outline:none; border-color:#0081cc; background:#fff; }
textarea { resize:vertical; font-family:inherit; }

.task-item, .worker-item, .coord-item { padding:12px; background:#fafbfc; border-radius:6px; margin:12px0; border:1px solid #e8e8e8; position:relative; }
.task-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; }
.task-no { font-weight:bold; color:#0081cc; font-size:14px; }
.del-btn { background:none; border:none; color:#999; font-size:13px; padding:4px8px; cursor:pointer; }
.del-btn.small { font-size:12px; }
.del-btn:hover { color:#f43f5e; }
.del-photo { position:absolute; top:4px; right:4px; background:rgba(0,0,0,0.6); color:#fff; border:none; width:22px; height:22px; border-radius:11px; cursor:pointer; }
.add-btn { background:#f0f7fc; color:#0081cc; border:1px dashed #0081cc; padding:8px; border-radius:6px; width:100%; margin-top:8px; cursor:pointer; font-size:14px; }
.add-btn:hover { background:#0081cc; color:#fff; }
.submit-btn { background:linear-gradient(135deg,#0081cc,#2563eb); color:#fff; padding:14px; border:none; border-radius:8px; width:100%; font-size:16px; font-weight:bold; margin-top:12px; cursor:pointer; box-shadow:02px6px rgba(0,129,204,0.3); }
.submit-btn:disabled { background:#ccc; box-shadow:none; cursor:not-allowed; }
.hint { color:#f43f5e; font-size:12px; text-align:center; margin-top:8px; }
.progress-row { display:flex; align-items:center; gap:8px; }
.progress-row input[type=range] { flex:1; }
.progress-val { font-weight:bold; color:#0081cc; min-width:42px; }

.photo-area { margin-top:8px; }
.photo-btn { display:inline-block; background:#f0f7fc; color:#0081cc; padding:6px12px; border-radius:6px; font-size:12px; cursor:pointer; border:1px solid #cce4f6; }
.photo-list { display:flex; gap:8px; flex-wrap:wrap; margin-top:8px; }
.photo-thumb { position:relative; width:80px; height:80px; }
.photo-thumb img { width:100%; height:100%; object-fit:cover; border-radius:4px; }

.issue-input { background:#fff8f5; padding:12px; border-radius:6px; border:1px solid #ffe0d4; }
.issue-list { margin-top:8px; }
.issue-row { display:flex; gap:8px; align-items:center; padding:6px; background:#fff; border-radius:4px; margin:4px0; font-size:13px; }
.issue-type { background:#f43f5e; color:#fff; padding:2px6px; border-radius:4px; font-size:11px; }
.issue-loc { color:#888; font-size:11px; }
.issue-desc { flex:1; }

.summary { background:linear-gradient(135deg,#0081cc0%,#16213e100%); color:#fff; }
.summary h2 { color:#fff; }
.summary-row { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; margin:12px0; }
.summary-item { text-align:center; background:rgba(255,255,255,0.1); padding:12px8px; border-radius:6px; }
.summary-item .big { font-size:22px; font-weight:bold; color:#facc15; }
.summary-item .small { font-size:11px; color:#fff; opacity:0.8; }

.result { margin-top:16px; padding:16px; background:#e8f5e9; border-radius:8px; }
.result h3 { margin:008px; color:#2e7d32; }
.result pre { font-size:11px; background:rgba(0,0,0,0.05); padding:8px; border-radius:4px; overflow:auto; }
.link-btn { display:inline-block; margin-top:8px; padding:8px16px; background:#0081cc; color:#fff; border-radius:6px; text-decoration:none; }
</style>
