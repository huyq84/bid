// platform/js/modules/capture.js
// 随手拍模块 - 独立功能模块, 侧边栏底部按钮调用
// v5.2 - getUserMedia + IndexedDB 离线存 + 相片水印
(function (global) {
  let mediaStream = null;
  let db = null;
  const DB_NAME = 'bcy_capture';
  const STORE = 'photos';

  // 4.1 IndexedDB 初始化
  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = e => {
        const d = e.target.result;
        if (!d.objectStoreNames.contains(STORE)) {
          d.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
        }
      };
      req.onsuccess = e => { db = e.target.result; resolve(db); };
      req.onerror = e => reject(e);
    });
  }

  // 4.2 打开拍照 UI (弹 modal)
  async function openCaptureModal() {
    if (!db) await openDB();
    const photoCount = await countPhotos();
    const modal = document.createElement('div');
    modal.id = 'capture-modal';
    modal.className = 'fixed inset-0 bg-black/70 z-50 flex items-center justify-center';
    modal.innerHTML = `
      <div class="bg-white rounded-lg shadow-2xl w-[900px] max-h-[90vh] overflow-hidden flex flex-col">
        <div class="flex items-center justify-between p-4 border-b">
          <div class="text-lg font-semibold">📷 随手拍</div>
          <button id="capture-close" class="text-slate-500 hover:text-slate-900 text-xl">✕</button>
        </div>
        <div class="flex-1 grid grid-cols-2 gap-4 p-4 overflow-hidden">
          <div class="bg-slate-900 rounded flex flex-col">
            <video id="capture-video" autoplay class="flex-1 w-full h-full object-contain" style="max-height:480px"></video>
            <div class="p-2 flex gap-2 bg-slate-800">
              <button id="capture-shoot" class="flex-1 bg-blue-600 text-white py-2 rounded font-medium">📸 拍摄</button>
              <button id="capture-toggle-cam" class="bg-slate-700 text-white px-3 py-2 rounded">🔄 切换</button>
            </div>
          </div>
          <div class="flex flex-col gap-2 overflow-hidden">
            <div class="text-sm font-medium text-slate-700">已拍照片 (${photoCount})</div>
            <div id="capture-list" class="flex-1 grid grid-cols-2 gap-2 overflow-auto"></div>
          </div>
        </div>
        <div class="border-t p-3 bg-slate-50">
          <div class="text-xs font-medium text-slate-700 mb-2">水印设置</div>
          <div class="flex gap-3 items-center text-xs flex-wrap">
            <label class="flex items-center gap-1"><input type="checkbox" id="wm-time" checked> 时间</label>
            <label class="flex items-center gap-1"><input type="checkbox" id="wm-project" checked> 项目</label>
            <label class="flex items-center gap-1"><input type="checkbox" id="wm-user"> 填报人</label>
            <label class="flex items-center gap-1"><input type="checkbox" id="wm-area"> 区域</label>
            <label class="flex items-center gap-1"><input type="checkbox" id="wm-note"> 备注</label>
            <span class="ml-3">位置:</span>
            <select id="wm-position" class="border rounded px-1">
              <option value="tl">左上</option><option value="tr" selected>右上</option>
              <option value="bl">左下</option><option value="br">右下</option>
              <option value="center">居中</option>
            </select>
            <span>字号:</span>
            <select id="wm-size" class="border rounded px-1">
              <option value="12">小</option><option value="16" selected>中</option>
              <option value="22">大</option>
            </select>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    // bind buttons (avoid inline onclick to keep CSP-friendly)
    document.getElementById('capture-close').onclick = closeModal;
    document.getElementById('capture-shoot').onclick = shoot;
    document.getElementById('capture-toggle-cam').onclick = toggleCamera;

    // 启动摄像头
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false
      });
      document.getElementById('capture-video').srcObject = mediaStream;
    } catch (e) {
      _toast('摄像头权限被拒绝或不可用: ' + e.message + ' · 可改用 "上传照片" 备用入口', 'error');
    }
    renderList();
  }

  function closeModal() {
    if (mediaStream) {
      mediaStream.getTracks().forEach(t => t.stop());
      mediaStream = null;
    }
    const m = document.getElementById('capture-modal');
    if (m) m.remove();
  }

  // 4.3 拍摄
  async function shoot() {
    const video = document.getElementById('capture-video');
    if (!video.videoWidth) {
      _toast('摄像头未就绪, 请先允许摄像头权限', 'error');
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);
    // 水印
    const wmEnabled = {
      time: document.getElementById('wm-time').checked,
      project: document.getElementById('wm-project').checked,
      user: document.getElementById('wm-user').checked,
      area: document.getElementById('wm-area').checked,
      note: document.getElementById('wm-note').checked
    };
    const wmPos = document.getElementById('wm-position').value;
    const wmSize = parseInt(document.getElementById('wm-size').value);
    if (Object.values(wmEnabled).some(v => v)) {
      burnWatermark(ctx, canvas.width, canvas.height, wmEnabled, wmPos, wmSize);
    }
    const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.85));
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).add({
        blob, taken_at: new Date().toISOString(),
        area: '', note: '', used_in_report: false
      });
      tx.oncomplete = resolve;
      tx.onerror = e => reject(e);
    });
    renderList();
  }

  function burnWatermark(ctx, w, h, enabled, pos, fontSize) {
    const lines = [];
    const now = new Date();
    if (enabled.time) lines.push('时间: ' + now.toLocaleString('zh-CN'));
    if (enabled.project) {
      const proj = (window.__report && window.__report.project && window.__report.project.name) || '百草园城市更新项目';
      lines.push('项目: ' + proj);
    }
    if (enabled.user) {
      const u = (window.__report && window.__report.submitter && window.__report.submitter.user_id) || '—';
      lines.push('填报人: ' + u);
    }
    if (enabled.area) lines.push('区域: (未填)');
    if (enabled.note) lines.push('备注: (无)');
    if (lines.length === 0) return;
    ctx.font = fontSize + 'px "Microsoft YaHei", sans-serif';
    ctx.lineWidth = 3;
    const lineH = fontSize * 1.4;
    const pad = 12;
    let maxW = 0;
    lines.forEach(l => { maxW = Math.max(maxW, ctx.measureText(l).width); });
    const blockW = maxW + pad * 2;
    const blockH = lines.length * lineH + pad;
    let x, y;
    if (pos === 'tl') { x = pad; y = pad; }
    else if (pos === 'tr') { x = w - blockW - pad; y = pad; }
    else if (pos === 'bl') { x = pad; y = h - blockH - pad; }
    else if (pos === 'br') { x = w - blockW - pad; y = h - blockH - pad; }
    else { x = (w - blockW) / 2; y = (h - blockH) / 2; }
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(x, y, blockW, blockH);
    ctx.fillStyle = 'rgba(255,255,255,0.98)';
    ctx.textBaseline = 'top';
    lines.forEach((l, i) => {
      ctx.fillText(l, x + pad, y + pad + i * lineH);
    });
  }

  async function toggleCamera() {
    if (!mediaStream) return;
    mediaStream.getTracks().forEach(t => t.stop());
    const cur = document.getElementById('capture-video').srcObject;
    const track = cur.getVideoTracks()[0];
    const facing = track && track.getSettings().facingMode === 'user' ? 'environment' : 'user';
    mediaStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing }, audio: false });
    document.getElementById('capture-video').srcObject = mediaStream;
  }

  async function countPhotos() {
    if (!db) return 0;
    return new Promise(r => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).count();
      req.onsuccess = () => r(req.result);
      req.onerror = () => r(0);
    });
  }

  async function renderList() {
    if (!db) return;
    const all = await new Promise(r => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => r(req.result);
      req.onerror = () => r([]);
    });
    all.sort((a, b) => b.id - a.id);
    const list = document.getElementById('capture-list');
    if (!list) return;
    list.innerHTML = all.map(p => `
      <div class="border rounded overflow-hidden bg-slate-50" data-pid="${p.id}">
        <img src="${URL.createObjectURL(p.blob)}" class="w-full h-24 object-cover">
        <div class="p-1 text-xs">
          <input class="w-full border rounded px-1" placeholder="区域" value="${p.area || ''}"
                 data-field="area" data-pid="${p.id}">
          <input class="w-full border rounded px-1 mt-1" placeholder="备注" value="${p.note || ''}"
                 data-field="note" data-pid="${p.id}">
          <button data-del="${p.id}" class="text-red-500 mt-1 text-xs">删除</button>
        </div>
      </div>
    `).join('');
    // 绑定事件
    list.querySelectorAll('input[data-field]').forEach(inp => {
      inp.onchange = () => updateField(+inp.dataset.pid, inp.dataset.field, inp.value);
    });
    list.querySelectorAll('button[data-del]').forEach(btn => {
      btn.onclick = () => del(+btn.dataset.del);
    });
  }

  function updateField(id, field, val) {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const req = store.get(id);
    req.onsuccess = () => {
      const p = req.result;
      if (p) {
        p[field] = val;
        store.put(p);
      }
    };
  }

  function del(id) {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = renderList;
  }

  // 4.4 5.18 周报时 05 实例页"📷 从随手拍选用"调用
  async function getPhotosByArea(area) {
    if (!db) await openDB();
    return new Promise(r => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => {
        const all = req.result;
        r(all.filter(p => p.area === area && !p.used_in_report));
      };
      req.onerror = () => r([]);
    });
  }
  async function markUsed(id) {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const req = store.get(id);
    req.onsuccess = () => {
      const p = req.result;
      if (p) {
        p.used_in_report = true;
        store.put(p);
      }
    };
  }

  global.Capture = {
    openCaptureModal, closeModal, shoot, toggleCamera,
    updateField, del, getPhotosByArea, markUsed
  };
})(window);
