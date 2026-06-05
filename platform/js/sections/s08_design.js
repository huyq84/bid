// platform/js/sections/s08_design.js
window.Sections = window.Sections || {};
window.Sections["08"] = {
  title: "上周图纸深化",
  _activeTab: "form",
  _drafts: [],
  render(report) {
    const items = report.design_deepen.map((d, i) => `
      <tr>
        <td class="text-center text-slate-500">${d.seq}</td>
        <td><input class="form-input" value="${d.task.replace(/<br>/g, ' ')}" onchange="App.updateDesign(${i},'task',this.value)"></td>
        <td><select class="form-select" onchange="App.updateDesign(${i},'owner',this.value)">
          ${["侯 帅","李 欢","乔志广","徐诗怡","李永旺"].map(o => `<option ${d.owner === o ? 'selected' : ''}>${o}</option>`).join("")}
        </select></td>
        <td class="text-center">
          <span class="text-xs px-2 py-0.5 rounded ${d.status === '已完成' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}">${d.status}</span>
        </td>
        <td class="text-center"><button class="text-xs text-red-500 hover:underline" onclick="App.removeDesign(${i})">删除</button></td>
      </tr>
    `).join("");

    const drafts = this._drafts;
    const draftBlock = drafts.length ? `
      <div class="mt-3 border border-blue-200 rounded p-2 bg-blue-50/50 text-xs">
        <div class="flex justify-between mb-1">
          <span class="font-medium text-blue-800">🤖 AI 草稿 (${drafts.length})</span>
          <div class="flex gap-2">
            <button class="text-blue-600 hover:underline" onclick="App.s08AcceptAll()">全部接受</button>
            <button class="text-slate-500 hover:underline" onclick="App.s08ClearDrafts()">丢弃</button>
          </div>
        </div>
        ${drafts.map((d, i) => `
          <div class="flex items-center gap-2 py-1">
            <span class="flex-1">${d.task}</span>
            <span class="text-slate-500">${d.owner}</span>
            <span class="px-1.5 rounded ${d.status === '已完成' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}">${d.status}</span>
            <button class="text-blue-600 hover:underline" onclick="App.s08AcceptDraft(${i})">✓</button>
          </div>
        `).join("")}
      </div>` : '';

    const tab = (k, label, icon) => `<div class="input-tab ${this._activeTab === k ? 'active' : ''}" onclick="App.activateS08Tab('${k}')">${icon} ${label}</div>`;

    return `
    <div class="section-card">
      <div class="section-header">
        <div>
          <div class="section-title">${this.title} — 2.14 图纸深化情况</div>
          <div class="text-xs text-slate-500 mt-1">已录入 ${report.design_deepen.length} 条</div>
        </div>
      </div>
      <div class="section-body">
        <div class="input-tabs">
          ${tab('voice', '语音', '🎤')}
          ${tab('paste', '粘贴', '📋')}
          ${tab('form', '表单', '✍️')}
        </div>
        <div id="s08-input-panel">
          ${this._activeTab === 'paste' ? `
            <textarea id="s08-paste-text" class="form-input" rows="3" placeholder="粘贴设计任务描述..."></textarea>
            <div class="flex justify-end mt-2"><button class="btn-ai" onclick="App.s08ExtractPaste()">🤖 AI 抽取</button></div>
          ` : this._activeTab === 'voice' ? `
            <div class="flex items-center gap-3 p-3 bg-slate-50 rounded">
              <button class="btn-ai" onclick="App.s08StartVoice()">🎤 录音</button>
              <span id="s08-voice-status" class="text-xs text-slate-500">未开始</span>
            </div>
            <div id="s08-voice-text" class="hidden mt-2 p-2 border border-slate-200 rounded text-sm bg-white"></div>
          ` : `
            <div class="grid grid-cols-12 gap-2">
              <div class="col-span-1"><label class="form-label">序号</label><input id="s08-seq" class="form-input text-center" type="number" value="${report.design_deepen.length + 1}"></div>
              <div class="col-span-7"><label class="form-label">计划事项</label><input id="s08-task" class="form-input" placeholder="事项描述"></div>
              <div class="col-span-2"><label class="form-label">责任人</label><select id="s08-owner" class="form-select">
                ${["侯 帅","李 欢","乔志广","徐诗怡","李永旺"].map(o => `<option>${o}</option>`).join("")}
              </select></div>
              <div class="col-span-2"><label class="form-label">完成情况</label><select id="s08-status" class="form-select">
                <option>进行中</option><option>已完成</option>
              </select></div>
              <div class="col-span-12 flex justify-end"><button class="btn-primary" onclick="App.s08AddForm()">+ 加入</button></div>
            </div>
          `}
        </div>
        ${draftBlock}
        <div class="mt-4">
          <table class="dt-table text-xs">
            <thead><tr><th class="w-10">序号</th><th>计划事项</th><th class="w-24">责任人</th><th class="w-20">完成情况</th><th class="w-14">操作</th></tr></thead>
            <tbody>${items}</tbody>
          </table>
        </div>
      </div>
    </div>
    `;
  }
};
