<script setup>
import { ref, onMounted } from 'vue'
const facts = ref(null)
const generating = ref(false)
const pdfInfo = ref(null)

async function loadFacts() {
 const r = await fetch('/api/aggregate', {
 method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}'
 })
 facts.value = await r.json()
}

async function generatePdf() {
 generating.value = true
 pdfInfo.value = null
 try {
 const r = await fetch('/api/report/generate', {
 method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}'
 })
 pdfInfo.value = await r.json()
 } catch (e) { pdfInfo.value = { error: e.message } }
 generating.value = false
}

onMounted(loadFacts)
</script>

<template>
<div class="page">
<h1>周报预览（百草园·北京清尚）</h1>

<div v-if="!facts" class="card">加载事实表中...</div>

<div v-else>
<div class="card meta">
 <div><b>{{ facts.project.name }}</b></div>
 <div>{{ facts.week.title }}（{{ facts.week.start_date }} ~ {{ facts.week.end_date }}）</div>
 <div>汇报单位：{{ facts.project.reporter }}</div>
</div>

<div class="card">
 <h3>组织架构</h3>
 <div>到岗 {{ facts.staff_summary.present }}/{{ facts.staff_summary.total }}，未到岗 {{ facts.staff_summary.absent }}</div>
</div>

<div class="card">
 <h3>上周工作完成</h3>
 <div>完成 {{ facts.work_summary.completed }}/{{ facts.work_summary.total }}（{{ facts.work_summary.completion_rate }}）</div>
 <table>
 <tr v-for="t in facts.work_done.slice(0,5)" :key="t.no">
 <td>{{ t.no }}</td><td>{{ t.task }}</td><td>{{ t.progress }}</td><td>{{ t.owner }}</td>
 </tr>
 </table>
</div>

<div class="card">
 <h3>人员统计</h3>
 <div>本周在场 {{ facts.workers_total_this_week }} 人</div>
</div>

<div class="card">
 <h3>ECC销项</h3>
 <div>总数 {{ facts.ecc.total }}，已关闭 {{ facts.ecc.closed }}，关闭率 {{ facts.ecc.close_rate }}</div>
</div>

<div class="card">
 <h3>图纸深化</h3>
 <div>已完成 {{ facts.drawings_summary.completed }}/{{ facts.drawings_summary.total }}</div>
</div>

<button class="primary" @click="generatePdf" :disabled="generating">
 {{ generating ? '生成中...' : '生成 PDF 周报' }}
</button>

<div v-if="pdfInfo" class="result">
 <div v-if="pdfInfo.ok">✓ PDF 已生成</div>
 <pre>{{ JSON.stringify(pdfInfo, null,2) }}</pre>
</div>
</div>
</div>
</template>

<style>
.page { padding:16px; max-width:720px; margin:0 auto; }
h1 { color:#0081cc; }
.card { background:#f5f5f5; padding:12px; margin:8px0; border-radius:6px; }
.card.meta { background:#e3f2fd; border-left:4px solid #0081cc; }
h3 { margin:004px; color:#16213e; }
table { border-collapse: collapse; margin-top:8px; font-size:13px; }
td { padding:4px8px; border-bottom:1px solid #ddd; }
button.primary { background:#0081cc; color:#fff; padding:12px24px; border:none; border-radius:4px; width:100%; font-size:16px; margin-top:16px; cursor:pointer; }
.result { margin-top:16px; padding:12px; background:#e8f5e9; border-radius:4px; font-size:12px; }
</style>
