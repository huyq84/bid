<script setup>
import { ref } from 'vue'
import DailyForm from './components/DailyForm.vue'
import ReportPreview from './components/ReportPreview.vue'

const tab = ref('preview')
</script>

<template>
<div class="app">
 <nav class="nav">
 <button :class="{active: tab==='preview'}" @click="tab='preview'">周报预览</button>
 <button :class="{active: tab==='daily'}" @click="tab='daily'">日报填报</button>
 </nav>
 <main>
 <ReportPreview v-if="tab==='preview'"/>
 <DailyForm v-else/>
 </main>
</div>
</template>

<style>
.app { min-height:100vh; background:#fafafa; }
.nav { display:flex; gap:4px; padding:8px; background:#16213e; }
.nav button { padding:8px16px; background:#37a3eb; color:#fff; border:none; border-radius:4px; cursor:pointer; }
.nav button.active { background:#f43f5e; color:#1a1a2e; font-weight:bold; }
main { padding:16px; }
</style>
