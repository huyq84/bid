// platform/js/sections/s09_plan.js
window.Sections = window.Sections || {};
window.Sections["09"] = {
  title: "下周周计划",
  _activeTab: "ai",
  _drafts: [],
  render(report) {
    const plan = report.next_week_plan;
    const items = plan.map((p, i) => `
      <tr>
        <td class="text-center text-slate-500">${p.seq}</td>
        <td>
          <span class="text-xs px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">${p.area}</span>
        </td>
        <td><input class="form-input" value="${p.task}" onchange="App.updatePlan(${i},'task',this.value)"></td>
        <td class="text-center"><input class="form-input text-center" type="number" value="${p.days}" onchange="App.updatePlanDays(${i},+this.value)"></td>
        ${p.progress.map((s, k) => `
          <td class="p-0">
            <div class="progress-cell cursor-pointer" onclick="App.togglePlanCell(${i},${k})">
              <div class="progress-fill ${s === 'fill' ? '' : 'hidden'}"></div>
            </div>
          </td>
        `).join("")}
        <td><input class="form-input" value="${p.labor}" onchange="App.updatePlan(${i},'labor',this.value)"></td>
        <td><input class="form-input" value="${p.material}" onchange="App.updatePlan(${i},'material',this.value)"></td>
        <td class="text-center"><button class="text-xs text-red-500 hover:underline" onclick="App.removePlan(${i})">×</button></td>
      </tr>
    `).join("");

    const drafts = this._drafts;
    const draftBlock = drafts.length ? `
      <div class="mt-3 border border-blue-200 rounded p-2 bg-blue-50/50">
        <div class="flex justify-between mb-1 text-xs">
          <span class="font-medium text-blue-800">🤖 AI 续排草稿 (${drafts.length} 条)</span>
          <div class="flex gap-2">
            <button class="text-blue-600 hover:underline" onclick="App.s09AcceptAll()">全部接受</button>
            <button class="text-slate-500 hover:underline" onclick="App.s09ClearDrafts()">丢弃</button>
          </div>
        </div>
        <table class="dt-table text-xs">
          <thead><tr><th>区域</th><th>事项</th><th>天数</th><th>周一周二周三周四周五周六周日</th><th>人力</th><th>材料</th><th></th></tr></thead>
          <tbody>
            ${drafts.map((d, i) => `
              <tr>
                <td>${d.area}</td>
                <td>${d.task}</td>
                <td class="text-center">${d.days}</td>
                <td>
                  <div class="flex gap-px">
                    ${d.progress.map(p => `<div class="progress-cell w-4 h-4"><div class="progress-fill ${p==='fill'?'':'hidden'}"></div></div>`).join("")}
                  </div>
                </td>
                <td>${d.labor}</td>
                <td>${d.material}</td>
                <td><button class="text-blue-600 hover:underline" onclick="App.s09AcceptDraft(${i})">✓</button></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>` : '';

    const tab = (k, label, icon) => `<div class="input-tab ${this._activeTab === k ? 'active' : ''}" onclick="App.activateS09Tab('${k}')">${icon} ${label}</div>`;

    return `
    <div class="section-card">
      <div class="section-header">
        <div>
          <div class="section-title">${this.title} — 3.1 周工作计划</div>
          <div class="text-xs text-slate-500 mt-1">已排 ${plan.length} 条 · AI 自动续排上周未完</div>
        </div>
        <div class="flex gap-2">
          <button class="btn-ai text-xs" onclick="App.s09AIDraft()">🤖 AI 智能排甘特</button>
        </div>
      </div>
      <div class="section-body">
        <div class="input-tabs">
          ${tab('ai', 'AI 续排', '🤖')}
          ${tab('voice', '语音补充', '🎤')}
          ${tab('paste', '粘贴补充', '📋')}
        </div>
        <div id="s09-input-panel">
          ${this._activeTab === 'voice' ? `
            <div class="flex items-center gap-3 p-3 bg-slate-50 rounded">
              <button class="btn-ai" onclick="App.s09StartVoice()">🎤 录音</button>
              <span id="s09-voice-status" class="text-xs text-slate-500">未开始</span>
            </div>
            <div id="s09-voice-text" class="hidden mt-2 p-2 border border-slate-200 rounded text-sm bg-white"></div>
          ` : this._activeTab === 'paste' ? `
            <textarea id="s09-paste-text" class="form-input" rows="3" placeholder="下周要做的工序..."></textarea>
            <div class="flex justify-end mt-2"><button class="btn-ai" onclick="App.s09ExtractPaste()">🤖 AI 抽取</button></div>
          ` : `
            <div class="text-xs text-slate-500 p-3 bg-slate-50 rounded">
              🤖 点击右上角「AI 智能排甘特」按钮，AI 将基于"上周未完"+"本周新增"自动排布 7 天进度
            </div>
          `}
        </div>
        ${draftBlock}
        <div class="mt-4 overflow-x-auto">
          <table class="dt-table text-xs" style="min-width: 1100px;">
            <thead>
              <tr>
                <th class="w-10" rowspan="2">序号</th>
                <th class="w-24" rowspan="2">区域</th>
                <th class="w-40" rowspan="2">工作内容</th>
                <th class="w-12" rowspan="2">天数</th>
                <th class="w-12">周一</th>
                <th class="w-12">周二</th>
                <th class="w-12">周三</th>
                <th class="w-12">周四</th>
                <th class="w-12">周五</th>
                <th class="w-12">周六</th>
                <th class="w-12">周日</th>
                <th class="w-24" rowspan="2">劳动力</th>
                <th class="w-20" rowspan="2">材料</th>
                <th class="w-12" rowspan="2"></th>
              </tr>
              <tr>
                <th class="text-[10px] text-slate-500">5月18日</th>
                <th class="text-[10px] text-slate-500">5月19日</th>
                <th class="text-[10px] text-slate-500">5月20日</th>
                <th class="text-[10px] text-slate-500">5月21日</th>
                <th class="text-[10px] text-slate-500">5月22日</th>
                <th class="text-[10px] text-slate-500">5月23日</th>
                <th class="text-[10px] text-slate-500">5月24日</th>
              </tr>
            </thead>
            <tbody>${items}</tbody>
          </table>
        </div>
      </div>
    </div>
    `;
  }
};
