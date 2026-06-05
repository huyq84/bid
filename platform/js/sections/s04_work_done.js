// platform/js/sections/s04_work_done.js
window.Sections = window.Sections || {};
window.Sections["04"] = {
  title: "上周工作完成情况",
  _activeTab: "paste",   // voice | paste | form | file
  _drafts: [],          // AI 抽取的待确认草稿
  render(report) {
    const items = report.work_done.map((t, i) => `
      <tr>
        <td class="text-center text-slate-500">${t.seq}</td>
        <td>
          <span class="text-xs px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">${t.area}</span>
        </td>
        <td><input class="form-input" value="${t.task}" onchange="App.updateWorkDone(${i},'task',this.value)"></td>
        <td>
          <select class="form-select text-center" style="min-width: 90px;" onchange="App.updateWorkDone(${i},'progress',this.value)">
            ${["0%","25%","50%","75%","100%"].map(p => `<option ${t.progress.startsWith(p) ? 'selected' : ''}>${p}</option>`).join("")}
          </select>
        </td>
        <td>
          <select class="form-select" style="min-width: 120px;" onchange="App.updateWorkDone(${i},'owner',this.value)">
            ${["侯 帅","王 健","陈 冲","王亚广","鲍永春","袁永超","李 欢","乔志广","徐诗怡","李永旺"].map(o => `<option ${t.owner === o ? 'selected' : ''}>${o}</option>`).join("")}
          </select>
        </td>
        <td>
          <input class="form-input" type="date" value="${t.deadline || ''}" onchange="App.updateWorkDone(${i},'deadline',this.value)">
        </td>
        <td>
          <span class="text-xs px-1.5 py-0.5 rounded ${t.source === 'voice' ? 'bg-violet-100 text-violet-700' : t.source === 'paste' ? 'bg-emerald-100 text-emerald-700' : t.source === 'file' ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-slate-500'}">${t.source || 'form'}</span>
        </td>
        <td class="text-center">
          <button class="text-xs text-red-500 hover:underline" onclick="App.removeWorkDone(${i})">删除</button>
        </td>
      </tr>
    `).join("");

    const tab = (k, label, icon) => `
      <div class="input-tab ${this._activeTab === k ? 'active' : ''}" onclick="App.activateS04Tab('${k}')">${icon} ${label}</div>
    `;
    const drafts = this._drafts;
    const draftBlock = drafts.length ? `
      <div class="mt-4 border border-blue-200 rounded-md p-3 bg-blue-50/50">
        <div class="flex items-center justify-between mb-2">
          <div class="text-sm font-medium text-blue-800">🤖 AI 抽取草稿 (${drafts.length} 条)</div>
          <div class="flex gap-2">
            <button class="btn-primary text-xs" onclick="App.s04AcceptAllDrafts()">✓ 全部接受</button>
            <button class="btn-ghost text-xs" onclick="App.s04ClearDrafts()">丢弃</button>
          </div>
        </div>
        <table class="dt-table text-xs">
          <thead>
            <tr><th>区域</th><th>事项</th><th>完成度</th><th>责任人</th><th>截止</th><th>置信度</th><th></th></tr>
          </thead>
          <tbody>
            ${drafts.map((d, i) => `
              <tr>
                <td>${d.area}</td>
                <td>${d.task}</td>
                <td>${d.progress}</td>
                <td>${d.owner}</td>
                <td>${d.deadline || '-'}</td>
                <td><span class="text-xs px-1.5 py-0.5 rounded ${d._confidence > 0.85 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}">${(d._confidence * 100).toFixed(0)}%</span></td>
                <td><button class="text-xs text-blue-600 hover:underline" onclick="App.s04AcceptDraft(${i})">✓ 接受</button></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>` : '';

    return `
    <div class="section-card">
      <div class="section-header">
        <div>
          <div class="section-title">${this.title}</div>
          <div class="text-xs text-slate-500 mt-1">已录入 ${report.work_done.length} 条 · AI 主战场</div>
        </div>
        <div class="flex gap-2">
          <button class="btn-ghost text-xs" onclick="App.s04ImportFromLastWeek()">📅 续排上周未完</button>
          <button class="btn-primary text-xs" onclick="App.addWorkDone()">+ 手动新增</button>
        </div>
      </div>
      <div class="section-body">
        <div class="input-tabs">
          ${tab('voice', '语音录入', '🎤')}
          ${tab('paste', '粘贴文本', '📋')}
          ${tab('form',  '表单录入', '✍️')}
          ${tab('file',  '上传附件', '📎')}
        </div>

        <div id="s04-input-panel">
          ${this._renderInputPanel()}
        </div>

        ${draftBlock}

        <div class="mt-4">
          <div class="text-xs text-slate-500 mb-2">已确认事项</div>
          <table class="dt-table">
            <thead>
              <tr>
                <th class="w-12">序号</th>
                <th class="w-24">区域</th>
                <th>事项</th>
                <th style="width: 100px;">完成度</th>
                <th style="width: 130px;">责任人</th>
                <th style="width: 130px;">截止日期</th>
                <th class="w-20">来源</th>
                <th class="w-16">操作</th>
              </tr>
            </thead>
            <tbody>${items}</tbody>
          </table>
        </div>
      </div>
    </div>
    `;
  },
  _renderInputPanel() {
    if (this._activeTab === "voice") {
      return `
        <div class="flex items-center gap-3 p-3 bg-slate-50 rounded">
          <button class="btn-ai" id="s04-voice-btn" onclick="App.s04StartVoice()">🎤 开始录音</button>
          <span id="s04-voice-status" class="text-xs text-slate-500">未开始</span>
        </div>
        <div id="s04-voice-text" class="hidden mt-2 p-2 border border-slate-200 rounded text-sm min-h-[60px] bg-white"></div>
      `;
    }
    if (this._activeTab === "paste") {
      return `
        <textarea id="s04-paste-text" class="form-input" rows="4" placeholder="粘贴微信群聊天 / 手写便签 / 邮件片段... 例如：&#10;这周食堂一层天花腻子完成了 80%，李欢负责。南塔咖啡厅墙面封板做了 50%。"></textarea>
        <div class="flex justify-end mt-2">
          <button class="btn-ai" onclick="App.s04ExtractPaste()">🤖 AI 抽取</button>
        </div>
      `;
    }
    if (this._activeTab === "form") {
      return `
        <div class="grid grid-cols-12 gap-2">
          <div class="col-span-2"><label class="form-label">区域</label><select id="s04-form-area" class="form-select">${["高管区","食堂区","南塔健身房","北塔健身房","南塔咖啡厅","北咖啡厅"].map(a => `<option>${a}</option>`).join("")}</select></div>
          <div class="col-span-5"><label class="form-label">事项</label><input id="s04-form-task" class="form-input" placeholder="如：一层高管办公室龙骨吊顶"></div>
          <div class="col-span-1"><label class="form-label">完成度</label><select id="s04-form-progress" class="form-select">${["0%","25%","50%","75%","100%"].map(p => `<option>${p}</option>`).join("")}</select></div>
          <div class="col-span-2"><label class="form-label">责任人</label><select id="s04-form-owner" class="form-select">${["侯 帅","王 健","陈 冲","王亚广","鲍永春","袁永超","李 欢","乔志广","徐诗怡","李永旺"].map(o => `<option>${o}</option>`).join("")}</select></div>
          <div class="col-span-2"><label class="form-label">截止日期</label><input id="s04-form-deadline" type="date" class="form-input"></div>
          <div class="col-span-12 flex justify-end">
            <button class="btn-primary" onclick="App.s04AddFormRow()">+ 加入列表</button>
          </div>
        </div>
      `;
    }
    if (this._activeTab === "file") {
      return `
        <div class="upload-zone" id="s04-file-zone" onclick="App.s04PickFile()">
          📎 点击或拖拽 PDF / Word / Excel / 图片 到此处
          <input type="file" id="s04-file-input" class="hidden" accept=".pdf,.docx,.doc,.xlsx,.xls,.csv,.png,.jpg,.jpeg" onchange="App.s04HandleFile(this.files[0])">
        </div>
        <div id="s04-file-name" class="text-xs text-slate-500 mt-2"></div>
      `;
    }
    return '';
  }
};
