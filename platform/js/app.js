// platform/js/app.js
// v5.2 主入口
(function (global) {
  let currentSection = (function() {
    return localStorage.getItem('bcy_current_section') || '01';
  })();
  let report = null;
  let currentRole = 'submitter';  // submitter | reviewer
  let _currentPeriod = localStorage.getItem('bcy_current_period') || (function() {
  try {
    const all = Store.getPeriods();
    return all[all.length - 1] || '2026-W21';
  } catch (e) { return '2026-W21'; }
})();
  // 暴露内部变量到 window, 供 report_list.js 等跨文件引用
  window._currentPeriod_get = () => _currentPeriod;
  window._currentPeriod_set = (p) => { _currentPeriod = p; };

  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.from((r || document).querySelectorAll(s)); }
  function toast(msg, type) {
    const el = document.createElement('div');
    el.className = 'toast ' + (type || '');
    el.textContent = msg;
    $('#toast-container').appendChild(el);
    setTimeout(() => el.remove(), 2500);
  }
  function rerender() {
    renderPeriodSelector();
    renderNav();
    renderAnomalies();
    renderRole();
    renderSection();
    window.__report = report;
  }
  function changePeriod(p) {
    if (typeof localStorage !== 'undefined') localStorage.setItem('bcy_current_period', p);
    _currentPeriod = p;
    Store.setCurrentPeriod(p);
    report = Store.load(p);
    rerender();
    const lf = localStorage.getItem('bcy_label_format') || 'custom';
    const info = Store.getPeriodInfo(p, lf);
    const displayName = info?.label || p;
    toast('已切换到 ' + displayName, 'success');
  }
  // 找节点的父数组 (找不到返回 null)
  function findParentOfNode(tree, id, parent) {
    if (!parent) parent = null;
    for (const arr of [tree, ...getAllArrays(tree)]) {
      const idx = arr.findIndex(n => n.id === id);
      if (idx >= 0) return arr;
    }
    return null;
  }
  function getAllArrays(node) {
    const out = [];
    function walk(n) {
      if (n.children) {
        for (const c of n.children) {
          out.push(n.children);
          walk(c);
        }
      }
    }
    if (Array.isArray(node)) node.forEach(walk);
    else walk(node);
    return out;
  }
  
  // 自定义 prompt modal
  function promptModal(title, defaultValue, onConfirm, onCancel) {
    const overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-50';
    overlay.id = 'prompt-modal-overlay';
    overlay.onclick = () => { overlay.remove(); if (onCancel) onCancel(); };
    overlay.innerHTML = `
      <div class="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4" onclick="event.stopPropagation()">
        <div class="px-6 py-4 border-b"><h3 class="font-semibold text-gray-800">${title}</h3></div>
        <div class="p-6">
          <input type="text" id="prompt-modal-input" value="${(defaultValue || '').replace(/"/g, '&quot;')}"
                 class="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                 onkeydown="if(event.key==='Enter') document.getElementById('prompt-modal-ok').click();">
        </div>
        <div class="flex gap-3 px-6 pb-6">
          <button id="prompt-modal-cancel" class="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">取消</button>
          <button id="prompt-modal-ok" class="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">确定</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    const input = document.getElementById('prompt-modal-input');
    input.focus(); input.select();
    document.getElementById('prompt-modal-ok').onclick = () => {
      const v = input.value;
      overlay.remove();
      if (onConfirm) onConfirm(v);
    };
    document.getElementById('prompt-modal-cancel').onclick = () => {
      overlay.remove();
      if (onCancel) onCancel();
    };
  }
  
  // 自定义 confirm modal
  function confirmModal(title, message, onConfirm, onCancel) {
    const overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-50';
    overlay.id = 'confirm-modal-overlay';
    overlay.onclick = () => { overlay.remove(); if (onCancel) onCancel(); };
    overlay.innerHTML = `
      <div class="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4" onclick="event.stopPropagation()">
        <div class="px-6 py-4 border-b"><h3 class="font-semibold text-gray-800">${title}</h3></div>
        <div class="p-6 text-sm text-gray-700">${message}</div>
        <div class="flex gap-3 px-6 pb-6">
          <button id="confirm-modal-cancel" class="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">取消</button>
          <button id="confirm-modal-ok" class="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700">确定</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    document.getElementById('confirm-modal-ok').onclick = () => {
      overlay.remove();
      if (onConfirm) onConfirm();
    };
    document.getElementById('confirm-modal-cancel').onclick = () => {
      overlay.remove();
      if (onCancel) onCancel();
    };
  }

  // 图片灯箱: 全屏显示单张大图, 点击背景/×/按 Esc 关闭
  function imageModal(src, caption) {
    if (!src) return;
    // 防止重复打开
    if (document.getElementById('image-modal-overlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'image-modal-overlay';
    overlay.className = 'fixed inset-0 bg-black/85 flex items-center justify-center z-50 p-4';
    // caption 转义 (防 attribute 注入)
    const safeCaption = String(caption || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    overlay.innerHTML = `
      <button type="button" id="image-modal-close" class="absolute top-3 right-4 text-white/80 hover:text-white text-3xl leading-none" title="关闭 (Esc)">×</button>
      <img src="${src.replace(/"/g, '&quot;')}" class="max-w-[92vw] max-h-[88vh] object-contain shadow-2xl rounded" onclick="event.stopPropagation()">
      ${safeCaption ? '<div class="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/60 text-white text-sm px-3 py-1.5 rounded max-w-[80vw] text-center">' + safeCaption + '</div>' : ''}
    `;
    // 点 overlay 背景关闭 (点图片不关, 因为 stopPropagation)
    overlay.onclick = () => overlay.remove();
    document.body.appendChild(overlay);
    document.getElementById('image-modal-close').onclick = (e) => { e.stopPropagation(); overlay.remove(); };
    // Esc 键关闭
    const onKey = (e) => {
      if (e.key === 'Escape') {
        overlay.remove();
        document.removeEventListener('keydown', onKey);
      }
    };
    document.addEventListener('keydown', onKey);
  }
  
    function changeRole(role) {
    currentRole = role;
    rerender();
    toast('已切到 ' + (role === 'submitter' ? '填报人' : '复核人') + ' 视角', 'info');
  }
  function init() {
    if (global.ReportList) bindReportList();
    report = Store.load(_currentPeriod);
    setupPersistentFileInput();
    initSidebar();
    // 历史数据迁移: report 体积大时, 一次性把已有大照片重新压缩以释放配额
    // 同步先 rerender 让 UI 立等可用, 迁移在后台跑完 toast 通知
    rerender();
    try {
      const reportSize = new Blob([JSON.stringify(report)]).size;
      if (reportSize > 3 * 1024 * 1024) {
        toast('检测到本地存储较满, 正在后台压缩已有大照片...', 'info');
        migrateLargePhotos(report).then(n => {
          if (n > 0) {
            safeSave(report, _currentPeriod);
            const newSize = new Blob([JSON.stringify(report)]).size;
            toast('已压缩 ' + n + ' 张旧照片 · 存储 ' + (reportSize / 1024 / 1024).toFixed(2) + 'MB → ' + (newSize / 1024 / 1024).toFixed(2) + 'MB', 'success');
          }
        });
      }
    } catch (e) { /* 测量失败不影响主流程 */ }
    $('#btn-preview').addEventListener('click', openPreview);
    $('#btn-rebuild-ai').addEventListener('click', rebuildAI);
    $('#btn-capture').addEventListener('click', () => Capture.openCaptureModal());
    toast('平台已加载 · ' + _currentPeriod + ' 就绪', 'success');
  }

  // 把图片压成 dataURL: 缩到 maxDim, JPEG 重编码
  //   1MB PNG @3000x2000 → ~150-300KB JPEG @1600x1067 (压缩到 1/5~1/8)
  //   base64 写 localStorage 必须小, 不然 6+ 张就 QuotaExceededError
  //   接受 File / Blob (新上传) 或 dataURL 字符串 (迁移旧图)
  function compressImage(source, maxDim, quality) {
    maxDim = maxDim || 1600;
    quality = quality || 0.85;
    return new Promise((resolve, reject) => {
      const img = new Image();
      let objUrl = null;
      if (typeof source === 'string') {
        // 已是 dataURL, 直接用, 不需要 revoke
        img.src = source;
      } else {
        objUrl = URL.createObjectURL(source);
        img.src = objUrl;
      }
      img.onload = () => {
        if (objUrl) URL.revokeObjectURL(objUrl);
        let w = img.naturalWidth, h = img.naturalHeight;
        if (w > maxDim || h > maxDim) {
          if (w > h) { h = Math.round(h * maxDim / w); w = maxDim; }
          else       { w = Math.round(w * maxDim / h); h = maxDim; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        canvas.toBlob((blob) => {
          if (!blob) { reject(new Error('canvas.toBlob 返回空')); return; }
          const r = new FileReader();
          r.onload = () => resolve({ dataUrl: r.result, width: w, height: h, size: blob.size });
          r.onerror = () => reject(r.error);
          r.readAsDataURL(blob);
        }, 'image/jpeg', quality);
      };
      img.onerror = () => { if (objUrl) URL.revokeObjectURL(objUrl); reject(new Error('图片解码失败')); };
    });
  }

  // 一次性迁移: report 里所有 >200KB 的 dataURL 照片重新压一遍
  //   解决历史数据: 用户在我加 compressImage 之前上传的图都是裸 base64
  //   检测到 report 体积 > 3MB 时调用, 压完覆盖写回 + 存盘
  async function migrateLargePhotos(report) {
    const refs = [];
    (report.site_photos || []).forEach(p => { if (p && p.url) refs.push({ target: p, key: 'url' }); });
    if (report.ui_config && report.ui_config.s06_photo) {
      refs.push({ target: report.ui_config, key: 's06_photo' });
    }
    // 估算每个 ref 当前的 dataURL 长度
    const big = refs.filter(r => r.target[r.key] && r.target[r.key].length > 200 * 1024);
    if (big.length === 0) return 0;
    let n = 0;
    for (const r of big) {
      try {
        const { dataUrl } = await compressImage(r.target[r.key]);
        r.target[r.key] = dataUrl;
        n++;
      } catch (e) { /* 单张失败跳过, 不阻塞整体 */ }
    }
    return n;
  }

  // 兜底: Store.save 抛 QuotaExceededError 时给个明确提示, 不让流程静默崩
  function safeSave(r, period) {
    try {
      Store.save(r, period);
    } catch (e) {
      if (e && e.name === 'QuotaExceededError') {
        toast('本地存储已满, 请删除部分旧照片或控制台执行 Store.reset() 重置', 'error');
      } else {
        throw e;
      }
    }
  }

  // 常驻 hidden file input + 一次性 onchange
  //   之前 s05UploadSlot 每次 click 都新建一个 detached <input type=file> 再 .click(),
  // 侧边栏: 拖拽改宽度 + 折叠/展开, 状态存 localStorage
  //   - 展开态: 200-500px 自由拖, 默认 256px
  //   - 折叠态: 32px, 只剩 « / » 切换按钮, 拖右边手柄可直接展开
  //   - 状态键 bcy_sidebar: { w: number, c: boolean }
  const SIDEBAR_KEY = 'bcy_sidebar';
  let sidebarW = 256;
  let sidebarCollapsed = false;
  function initSidebar() {
    try {
      const saved = JSON.parse(localStorage.getItem(SIDEBAR_KEY) || '{}');
      if (typeof saved.w === 'number' && saved.w >= 200 && saved.w <= 500) sidebarW = saved.w;
      sidebarCollapsed = !!saved.c;
    } catch (e) { /* ignore */ }
    applySidebar();
    bindSidebarToggle();
    bindSidebarResize();
  }
  function applySidebar() {
    const aside = document.getElementById('sidebar');
    if (!aside) return;
    const w = sidebarCollapsed ? 32 : sidebarW;
    aside.style.width = w + 'px';
    aside.classList.toggle('sidebar-collapsed', sidebarCollapsed);
    const toggle = document.getElementById('sidebar-toggle');
    if (toggle) toggle.textContent = sidebarCollapsed ? '»' : '«';
    try { localStorage.setItem(SIDEBAR_KEY, JSON.stringify({ w: sidebarW, c: sidebarCollapsed })); } catch (e) { /* ignore */ }
  }
  function bindSidebarToggle() {
    const btn = document.getElementById('sidebar-toggle');
    if (!btn) return;
    btn.addEventListener('click', () => {
      sidebarCollapsed = !sidebarCollapsed;
      applySidebar();
    });
  }
  function bindSidebarResize() {
    const handle = document.getElementById('sidebar-resize-handle');
    const aside = document.getElementById('sidebar');
    if (!handle || !aside) return;
    let startX = 0, startW = 0;
    const onMove = (e) => {
      let w = startW + (e.clientX - startX);
      if (w < 200) w = 200;
      if (w > 500) w = 500;
      sidebarW = w;
      sidebarCollapsed = false;  // 拖出宽度 = 展开
      aside.style.width = w + 'px';
      aside.classList.remove('sidebar-collapsed');
      const toggle = document.getElementById('sidebar-toggle');
      if (toggle) toggle.textContent = '«';
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      handle.classList.remove('dragging');
      document.body.style.cursor = '';
      applySidebar();  // 落盘
    };
    handle.addEventListener('mousedown', (e) => {
      startX = e.clientX;
      startW = sidebarCollapsed ? 32 : sidebarW;
      handle.classList.add('dragging');
      document.body.style.cursor = 'col-resize';
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      e.preventDefault();
    });
  }

  //   部分浏览器 (尤其桌面 WebKit / 严格 Chromium 配置) 不响应 detached input 的文件对话框.
  //   改成初始化时挂一个到 body, onchange 走 dataset 里的 idx/slot.
  function setupPersistentFileInput() {
    const fi = document.createElement('input');
    fi.type = 'file';
    fi.accept = 'image/*';
    fi.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;opacity:0;';
    document.body.appendChild(fi);
    global._s05FileInput = fi;

    fi.addEventListener('change', (e) => {
      const idx = parseInt(fi.dataset.idx, 10);
      const slot = parseInt(fi.dataset.slot, 10);
      const file = e.target.files && e.target.files[0];
      if (!Number.isFinite(idx) || !Number.isFinite(slot)) return;
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) {
        toast('原图超过 5MB, 请先在系统图片工具里压一下再上传', 'error');
        return;
      }
      compressImage(file).then(({ dataUrl, width, height, size }) => {
        const insts = Sections['05'].materialize(report);
        const inst = insts[idx];
        if (!inst) { toast('目标区域不存在, 请刷新重试', 'error'); return; }
        const target = inst.data[slot] || { area: inst.keyValue, url: '', caption: '' };
        target.url = dataUrl;
        target.width = width;
        target.height = height;
        if (!inst.data[slot]) {
          report.site_photos = report.site_photos || [];
          report.site_photos.push(target);
        } else {
          const wd = report.site_photos || [];
          const wdIdx = wd.indexOf(inst.data[slot]);
          if (wdIdx >= 0) wd[wdIdx] = target;
        }
        safeSave(report, _currentPeriod); rerender();
        toast('已上传到 ' + inst.keyValue + ' · ' + width + 'x' + height + ' · ' + (size / 1024).toFixed(0) + 'KB', 'success');
      }).catch((err) => {
        toast('压缩失败: ' + (err && err.message ? err.message : err), 'error');
      });
    });
  }

  // ===== 桥接 ReportList =====
  // 不再自动覆盖 App 上的方法 (会覆盖掉我们手动加的 toggleLabelFormat 增强版)
  // 所有 ReportList 桥接都显式写在 App 对象里
  function bindReportList() {
    // 留空 - 桥接在 App 对象定义时显式完成
  }

  document.addEventListener('DOMContentLoaded', init);

  // ===== 渲染 =====
  function renderPeriodSelector() {
    const periods = Store.getPeriods();
    const sel = $('#period-select');
    if (!sel) return;
    // 用 getPeriodInfo 算 label (尊重用户当前的 standard/custom 模式)
    const labelFormat = localStorage.getItem('bcy_label_format') || 'custom';
    sel.innerHTML = periods.map(p => {
      const info = Store.getPeriodInfo(p, labelFormat);
      const displayLabel = info?.label || p;
      return `<option value="${p}" ${p === _currentPeriod ? 'selected' : ''}>${displayLabel}</option>`;
    }).join('');
    sel.onchange = () => changePeriod(sel.value);
  }
  function renderNav() {
    const nav = $('#section-nav');
    if (!nav || !report.nav_tree) return;
    // currentSection 是 page_id, 转成 node.id 给 renderHTML
    const activeNode = findNodeByPageId(report.nav_tree, currentSection);
    const activeId = activeNode ? activeNode.id : currentSection;
    const filter = (function() {
      try {
        return JSON.parse(localStorage.getItem('bcy_nav_filter') || 'null') || { chapter: true, page: true, closing: false };
      } catch(e) { return { chapter: true, page: true, closing: false }; }
    })();
    nav.innerHTML = NavTree.renderHTML(report.nav_tree, { activeId: activeId, filter: filter });
    // 绑定点击
    $$('.nav-node').forEach(el => {
      el.onclick = (e) => {
        if (e.target.closest('button')) return;
        const id = el.dataset.nodeId;
        const node = NavTree.findNode(report.nav_tree, id);
        if (node) {
          if (node.type === 'page' && node.page_id) {
            currentSection = node.page_id;
            if (typeof localStorage !== 'undefined') localStorage.setItem('bcy_current_section', currentSection);
            rerender();
          } else if (node.type === 'chapter' && node.children && node.children.length > 0) {
            // chapter 节点点击 -> 只展开/折叠 (不切 currentSection)
            if (typeof window._toggleCollapse === 'function') window._toggleCollapse(node.id);
            rerender();
          }
        }
      };
      // 拖拽
      el.ondragstart = (e) => {
        e.dataTransfer.setData('text/node-id', el.dataset.nodeId);
      };
      el.ondragover = (e) => e.preventDefault();
      el.ondrop = (e) => {
        e.preventDefault();
        const draggedId = e.dataTransfer.getData('text/node-id');
        const targetId = el.dataset.nodeId;
        if (draggedId === targetId) return;
        const rect = el.getBoundingClientRect();
        const pos = e.clientY < rect.top + rect.height / 3 ? 'before' :
                    e.clientY > rect.bottom - rect.height / 3 ? 'after' : 'inside';
        NavTree.moveNode(report.nav_tree, draggedId, targetId, pos);
        Store.save(report, _currentPeriod);
        rerender();
        toast('已移动节点, prefix 自动重排', 'success');
      };
    });
  }
  function renderAnomalies() {
    const anomalies = Rules.detectAll(report);
    report.ai_review = report.ai_review || {};
    report.ai_review.anomalies = anomalies;
    report.ai_review.generated_at = new Date().toISOString();
    const banner = $('#anomaly-banner');
    if (!banner) return;
    if (!anomalies.length) {
      banner.innerHTML = `<div class="mb-3 p-2 rounded border border-emerald-200 bg-emerald-50 text-sm text-emerald-800">✓ AI 已全量出报告, 无异常, 可直接导出</div>`;
      return;
    }
    const grouped = { red: [], yellow: [], blue: [] };
    anomalies.forEach(a => grouped[a.level].push(a));
    const label = { red: '🔴 阻塞', yellow: '🟡 警告', blue: '🔵 提示' };
    let html = '';
    ['red', 'yellow', 'blue'].forEach(lv => {
      if (grouped[lv].length) {
        html += `<div class="mb-2 p-2 rounded border border-${lv === 'red' ? 'red' : lv === 'yellow' ? 'amber' : 'sky'}-200 bg-${lv === 'red' ? 'red' : lv === 'yellow' ? 'amber' : 'sky'}-50 text-xs">
          <div class="font-medium mb-1">${label[lv]} (${grouped[lv].length})</div>
          ${grouped[lv].map(a => `<div>• ${a.msg} <button onclick="App.gotoSection('${a.section}')" class="text-blue-600 hover:underline">→ 跳转</button></div>`).join('')}
        </div>`;
      }
    });
    banner.innerHTML = html;
  }
  function renderRole() {
    const tog = $('#role-toggle');
    if (tog) {
      tog.innerHTML = `<button class="px-3 py-1 rounded ${currentRole === 'submitter' ? 'bg-blue-600 text-white' : 'bg-slate-200'}" onclick="App.changeRole('submitter')">填报人</button>
                       <button class="px-3 py-1 rounded ${currentRole === 'reviewer' ? 'bg-blue-600 text-white' : 'bg-slate-200'}" onclick="App.changeRole('reviewer')">复核人</button>`;
    }
  }
  function renderSection() {
    const content = $('#section-content');
    if (!content) return;
    const sec = window.Sections && window.Sections[currentSection];
    if (!sec) {
      content.innerHTML = `<div class="p-4 text-slate-500">章节 ${currentSection} 暂未实现</div>`;
      return;
    }
    const html = sec.render(report);
    // 渲染后调 init (让 Choices.js 接管 select)
    if (sec && typeof sec.initFilter === 'function') {
      setTimeout(() => { try { sec.initFilter(); } catch(e) { console.error('initFilter error', e); } }, 0);
    }
    if (currentRole === 'reviewer') {
      content.innerHTML = `<div class="bg-amber-50 border border-amber-200 p-2 rounded mb-2 text-xs">📋 复核人视角 (只读, 不允许编辑)</div>` + html;
      // 禁用所有 input/select/button, 同时冻住 contenteditable (s11 数据 cell / s11-section-name 等)
      setTimeout(() => {
        $$('#section-content input, #section-content select, #section-content button').forEach(el => {
          if (!el.dataset.reviewerAllowed) el.disabled = true;
        });
        $$('#section-content [contenteditable]').forEach(el => {
          if (!el.dataset.reviewerAllowed) el.setAttribute('contenteditable', 'false');
        });
      }, 0);
    } else {
      content.innerHTML = html;
    }
  }

  // ===== 操作 =====
  function openPreview() {
    window.open('preview.html?period=' + _currentPeriod, '_blank');
  }
  function rebuildAI() {
    toast('AI 草稿重新生成 (mock)', 'info');
    rerender();
  }
  function gotoSection(pageId) {
    const node = findNodeByPageId(report.nav_tree, pageId);
    if (node) {
      currentSection = pageId;
      if (typeof localStorage !== 'undefined') localStorage.setItem('bcy_current_section', currentSection);
      rerender();
    }
  }
  function findNodeByPageId(tree, pageId) {
    function walk(arr) {
      for (let i = 0; i < arr.length; i++) {
        if (arr[i].page_id === pageId) return arr[i];
        if (arr[i].children) {
          const r = walk(arr[i].children);
          if (r) return r;
        }
      }
      return null;
    }
    return walk(tree);
  }
  function exportPDF() {
    ExportPDF.exportPDF(report);
  }

  // ===== App 回调（章节编辑） =====
  const App = {
    // 04 (v5.3: 主行 + 内嵌 items)
    s04AddEmpty: () => {
      report.work_done = report.work_done || [];
      report.work_done.push({
        area: '新区域',
        owner: '',
        deadline: '',
        items: [{ task: '', progress: '0%' }]
      });
      Store.save(report, _currentPeriod); rerender();
    },
    // idx = area instance 序号, mi = 主行序号
    s04UpdateMainRow: (idx, mi, field, val) => {
      const insts = Sections['04'].materialize(report);
      const inst = insts[idx];
      if (!inst) return;
      const mainRow = inst.data[mi];
      if (!mainRow) return;
      mainRow[field] = val;
      const wd = report.work_done || [];
      const wdIdx = wd.indexOf(mainRow);
      if (wdIdx >= 0) wd[wdIdx][field] = val;
      Store.save(report, _currentPeriod);
    },
    s04RemoveMainRow: (idx, mi) => {
      const insts = Sections['04'].materialize(report);
      const inst = insts[idx];
      if (!inst) return;
      const mainRow = inst.data[mi];
      if (!mainRow) return;
      const wd = report.work_done || [];
      const wdIdx = wd.indexOf(mainRow);
      if (wdIdx >= 0) wd.splice(wdIdx, 1);
      Store.save(report, _currentPeriod); rerender();
    },
    // idx = area instance 序号, mi = 主行序号, ii = item 序号
    s04UpdateItem: (idx, mi, ii, field, val) => {
      const insts = Sections['04'].materialize(report);
      const inst = insts[idx];
      if (!inst) return;
      const mainRow = inst.data[mi];
      if (!mainRow || !Array.isArray(mainRow.items)) return;
      const item = mainRow.items[ii];
      if (!item) return;
      item[field] = val;
      Store.save(report, _currentPeriod);
    },
    s04AddItem: (idx, mi) => {
      const insts = Sections['04'].materialize(report);
      const inst = insts[idx];
      if (!inst) return;
      const mainRow = inst.data[mi];
      if (!mainRow) return;
      mainRow.items = Array.isArray(mainRow.items) ? mainRow.items : [];
      mainRow.items.push({ task: '', progress: '0%' });
      Store.save(report, _currentPeriod); rerender();
    },
    s04RemoveItem: (idx, mi, ii) => {
      const insts = Sections['04'].materialize(report);
      const inst = insts[idx];
      if (!inst) return;
      const mainRow = inst.data[mi];
      if (!mainRow || !Array.isArray(mainRow.items)) return;
      if (mainRow.items.length <= 1) {
        // 至少留 1 个 item (不删主行), 重置为空
        mainRow.items[0] = { task: '', progress: '0%' };
      } else {
        mainRow.items.splice(ii, 1);
      }
      Store.save(report, _currentPeriod); rerender();
    },
    s04AddRow: (idx) => {
      const insts = Sections['04'].materialize(report);
      const inst = insts[idx];
      if (!inst) return;
      report.work_done = report.work_done || [];
      report.work_done.push({
        area: inst.keyValue,
        owner: '',
        deadline: '',
        items: [{ task: '', progress: '0%' }]
      });
      Store.save(report, _currentPeriod); rerender();
    },
    s04AddInstance: (defaultArea) => {
      promptModal('新增区域', defaultArea || '食堂区', (name) => {
        if (!name || !name.trim()) return;
        name = name.trim();
        const wd = report.work_done || (report.work_done = []);
        if (wd.some(r => r.area === name)) {
          toast('该区域已存在', 'error');
          return;
        }
        wd.push({
          area: name,
          owner: '',
          deadline: '',
          items: [{ task: '', progress: '0%' }]
        });
        Store.save(report, _currentPeriod); rerender();
        toast('已新增区域 ' + name, 'success');
      });
    },
    // 05 工作现场
    // 仅触发常驻 file input, 真正的 onchange 在 setupPersistentFileInput() 里绑了一次
    s05UploadSlot: (idx, slot) => {
      const fi = global._s05FileInput;
      if (!fi) { toast('上传组件未就绪, 请刷新页面', 'error'); return; }
      fi.dataset.idx = idx;
      fi.dataset.slot = slot;
      fi.value = '';   // 重置, 允许连续选同一张图也能再次触发 change
      fi.click();
    },
    s05UpdateCaption: (idx, i, val) => {
      const insts = Sections['05'].materialize(report);
      const inst = insts[idx];
      if (!inst || !inst.data[i]) return;
      inst.data[i].caption = val;
      const wd = report.site_photos || [];
      const wdIdx = wd.indexOf(inst.data[i]);
      if (wdIdx >= 0) wd[wdIdx].caption = val;
      Store.save(report, _currentPeriod);
    },
    s05RemovePhoto: (idx, i) => {
      const insts = Sections['05'].materialize(report);
      const inst = insts[idx];
      if (!inst || !inst.data[i]) return;
      const wd = report.site_photos || [];
      const wdIdx = wd.indexOf(inst.data[i]);
      if (wdIdx >= 0) wd.splice(wdIdx, 1);
      Store.save(report, _currentPeriod); rerender();
    },
    s05AddInstance: (defaultArea) => {
      promptModal('新增区域', defaultArea || '', (name) => {
        if (!name || !name.trim()) return;
        report.site_photos = report.site_photos || [];
        if (report.site_photos.some(p => p.area === name.trim())) {
          toast('该区域已存在', 'error');
          return;
        }
        report.site_photos.push({ area: name.trim(), url: '', caption: '' });
        Store.save(report, _currentPeriod); rerender();
      });
    },
    s05DelInstance: (idx) => {
      const insts = Sections['05'].materialize(report);
      const inst = insts[idx];
      if (!inst) return;
      confirmModal('删除区域', '确定删除 "' + inst.keyValue + '" 下所有照片?', () => {
        report.site_photos = (report.site_photos || []).filter(p => p.area !== inst.keyValue);
        Store.save(report, _currentPeriod); rerender();
      });
    },
    s05FromCapture: async () => {
      try {
        const all = await Capture.getPhotosByArea('');
        if (!all || !all.length) {
          toast('随手拍池子暂无照片, 请先在底部"随手拍"添加', 'info');
          return;
        }
        // 让用户选 area
        const insts = Sections['05'].materialize(report);
        const areas = insts.length ? insts.map(i => i.keyValue) : [];
        const suggestion = areas[0] || '高管区';
        const hint = areas.length ? '已有区域: ' + areas.join(', ') : '暂无区域, 请输入';
        promptModal('分配随手拍照片到区域', suggestion, (area) => {
          if (!area || !area.trim()) return;
          const areaName = area.trim();
          const photo = all[0];
          report.site_photos = report.site_photos || [];
          const blob = photo.blob;
          if (!blob) { toast('照片数据缺失', 'error'); return; }
          // 顺手拍原图也是大图, 同样走 compressImage
          blob.size = blob.size || 1024;  // 兜底 (老 blob 可能没 size)
          const fakeFile = new File([blob], 'capture.jpg', { type: blob.type || 'image/jpeg' });
          compressImage(fakeFile).then(({ dataUrl, width, height, size }) => {
            report.site_photos.push({ area: areaName, url: dataUrl, caption: photo.caption || '', width, height });
            safeSave(report, _currentPeriod); rerender();
            toast('已从随手拍选用到 ' + areaName + ' · ' + (size / 1024).toFixed(0) + 'KB', 'success');
          }).catch((err) => {
            toast('压缩随手拍失败: ' + (err && err.message ? err.message : err), 'error');
          });
        });
        // 提示信息(可放标题)
        console.log('s05FromCapture hint:', hint);
      } catch (e) { toast('读取随手拍失败: ' + e.message, 'error'); }
    },
    // 06 人员统计
    s06Update: (i, field, val) => {
      const pd = report.pages_data && report.pages_data['06'];
      if (!pd || !pd.rows) return;
      const rows = pd.rows.filter(r => !r.is_total);
      const r = rows[i];
      if (!r) return;
      r[field] = +val;
      // 算合计
      const total = pd.rows.find(x => x.is_total);
      if (total) {
        total.this_week = pd.rows.filter(x => !x.is_total).reduce((a, x) => a + (+x.this_week || 0), 0);
        total.next_week = pd.rows.filter(x => !x.is_total).reduce((a, x) => a + (+x.next_week || 0), 0);
      }
      safeSave(report, _currentPeriod); rerender();
    },
    s06UpdateType: (i, val) => {
      const pd = report.pages_data && report.pages_data['06'];
      if (!pd || !pd.rows) return;
      const dataRows = pd.rows.filter(r => !r.is_total);
      const r = dataRows[i];
      if (!r) return;
      r.type = val;
      safeSave(report, _currentPeriod);
    },
    s06Add: () => {
      const pd = report.pages_data && report.pages_data['06'];
      if (!pd) return;
      pd.rows = pd.rows || [];
      const dataRows = pd.rows.filter(r => !r.is_total);
      const nextSeq = dataRows.length ? Math.max.apply(null, dataRows.map(r => r.seq || 0)) + 1 : 1;
      pd.rows.splice(pd.rows.length - 1, 0, { seq: nextSeq, type: '', this_week: 0, next_week: 0 });
      safeSave(report, _currentPeriod); rerender();
    },
    s06Remove: (i) => {
      const pd = report.pages_data && report.pages_data['06'];
      if (!pd || !pd.rows) return;
      const dataRows = pd.rows.filter(r => !r.is_total);
      const r = dataRows[i];
      if (!r) return;
      const idx = pd.rows.indexOf(r);
      if (idx >= 0) pd.rows.splice(idx, 1);
      // 重算合计
      const total = pd.rows.find(x => x.is_total);
      if (total) {
        total.this_week = pd.rows.filter(x => !x.is_total).reduce((a, x) => a + (+x.this_week || 0), 0);
        total.next_week = pd.rows.filter(x => !x.is_total).reduce((a, x) => a + (+x.next_week || 0), 0);
      }
      safeSave(report, _currentPeriod); rerender();
    },
    s06UploadPhoto: (input) => {
      const file = input && input.files && input.files[0];
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) { toast('原图超过 5MB, 请先压缩到 5MB 以内再上传', 'error'); input.value = ''; return; }
      compressImage(file).then(({ dataUrl, width, height, size }) => {
        report.ui_config = report.ui_config || {};
        report.ui_config.s06_photo = dataUrl;
        report.ui_config.s06_photo_w = width;
        report.ui_config.s06_photo_h = height;
        safeSave(report, _currentPeriod); rerender();
        toast('已上传会议照片 · ' + width + 'x' + height + ' · ' + (size / 1024).toFixed(0) + 'KB', 'success');
      }).catch((err) => {
        toast('压缩失败: ' + (err && err.message ? err.message : err), 'error');
      });
      input.value = '';  // 重置, 允许重传同一张
    },
    s06ClearPhoto: () => {
      if (!report.ui_config) return;
      delete report.ui_config.s06_photo;
      safeSave(report, _currentPeriod); rerender();
    },
    s06UpdateCaption: (val) => {
      report.ui_config = report.ui_config || {};
      report.ui_config.s06_photo_caption = val;
      safeSave(report, _currentPeriod);
    },
    s06AiExtract: () => toast('AI 抽取工种数据 mock', 'info'),
    // 07 ECC 销项
    s07Update: (field, val) => {
      const pd = report.pages_data && report.pages_data['07'];
      if (!pd) return;
      pd.data = pd.data || {};
      pd.data[field] = +val;
      Store.save(report, _currentPeriod); rerender();
    },
    s07UploadImage: (input) => {
      const file = input && input.files && input.files[0];
      if (!file) return;
      if (file.size > 2 * 1024 * 1024) { toast('图片超过 2MB', 'error'); input.value = ''; return; }
      const reader = new FileReader();
      reader.onload = (e) => {
        const pd = report.pages_data && report.pages_data['07'];
        if (!pd) return;
        pd.data = pd.data || {};
        pd.data.image = e.target.result;
        Store.save(report, _currentPeriod); rerender();
      };
      reader.readAsDataURL(file);
    },
    s07ClearImage: () => {
      const pd = report.pages_data && report.pages_data['07'];
      if (!pd || !pd.data) return;
      delete pd.data.image;
      Store.save(report, _currentPeriod); rerender();
    },
    s07AiParse: () => toast('AI 解析截图 mock', 'info'),
    // 08 图纸深化
    s08Update: (i, field, val) => {
      const pd = report.pages_data && report.pages_data['08'];
      if (pd && pd.rows && pd.rows[i]) {
        pd.rows[i][field] = val;
        Store.save(report, _currentPeriod);
      }
    },
    s08Add: () => {
      const pd = report.pages_data && report.pages_data['08'];
      if (!pd) return;
      pd.rows = pd.rows || [];
      pd.rows.push({ task: '', owner: '', status: '未开始' });
      Store.save(report, _currentPeriod); rerender();
    },
    s08Remove: (i) => {
      const pd = report.pages_data && report.pages_data['08'];
      if (pd && pd.rows) {
        pd.rows.splice(i, 1);
        Store.save(report, _currentPeriod); rerender();
      }
    },
    s08AiExtract: () => toast('AI 抽取 mock', 'info'),
    // 09 周计划
    s09AddRow: () => {
      const pd = report.pages_data && report.pages_data['09'];
      if (!pd) return;
      pd.rows = pd.rows || [];
      const lastArea = pd.rows.length ? pd.rows[pd.rows.length - 1].area : '';
      pd.rows.push({ area: lastArea, task: '', progress: ['empty','empty','empty','empty','empty','empty','empty'], manual_mode: false, days: 0, labor: '', headcount: '', material: '' });
      safeSave(report, _currentPeriod); rerender();
    },
    s09AddArea: () => {
      // 新增一个 area 分组: 弹输入框取名, 在末尾插入一行 (新 area 的首行)
      // 已存在的 area 名会提示用 "+ 新增一行" 续加 (否则会拆成两个不连续分组)
      const pd = report.pages_data && report.pages_data['09'];
      if (!pd) return;
      const existing = Array.from(new Set((pd.rows || []).map(r => r.area).filter(a => a && a.trim())));
      promptModal('新增区域', '', (name) => {
        if (!name || !name.trim()) return;
        const areaName = name.trim();
        if (existing.indexOf(areaName) >= 0) {
          toast('该区域已存在, 直接点"+ 新增一行"在 ' + areaName + ' 里加任务即可', 'info');
          return;
        }
        pd.rows = pd.rows || [];
        pd.rows.push({
          area: areaName,
          task: '',
          progress: ['empty','empty','empty','empty','empty','empty','empty'],
          manual_mode: false,
          days: 0,
          labor: '',
          headcount: '',
          material: ''
        });
        safeSave(report, _currentPeriod); rerender();
        toast('已新增区域 ' + areaName, 'success');
      });
    },
    s09AddRowInArea: (area) => {
      // 在指定 area 组的最后一行后面插入新行 (保持分组连续, 不会拆成两个不连续分组)
      // 找不到该 area 时, 兜底插到最前 (新分组)
      const pd = report.pages_data && report.pages_data['09'];
      if (!pd) return;
      pd.rows = pd.rows || [];
      let lastIdx = -1;
      for (let i = pd.rows.length - 1; i >= 0; i--) {
        if (pd.rows[i].area === area) { lastIdx = i; break; }
      }
      const insertAt = lastIdx + 1;  // -1 时变 0, 即插到最前
      const newRow = {
        area: area,
        task: '',
        progress: ['empty','empty','empty','empty','empty','empty','empty'],
        manual_mode: false,
        days: 0,
        labor: '',
        headcount: '',
        material: ''
      };
      pd.rows.splice(insertAt, 0, newRow);
      safeSave(report, _currentPeriod); rerender();
    },
    s09Update: (i, field, val) => {
      const pd = report.pages_data && report.pages_data['09'];
      if (pd && pd.rows && pd.rows[i]) {
        pd.rows[i][field] = val;
        safeSave(report, _currentPeriod);
      }
    },
    s09UpdateDays: (i, val) => {
      const pd = report.pages_data && report.pages_data['09'];
      if (pd && pd.rows && pd.rows[i]) {
        pd.rows[i].days = +val;
        safeSave(report, _currentPeriod); rerender();
      }
    },
    s09ToggleCell: (i, k) => {
      const pd = report.pages_data && report.pages_data['09'];
      if (!pd || !pd.rows || !pd.rows[i]) return;
      const row = pd.rows[i];
      if (row.manual_mode) return;
      row.progress[k] = row.progress[k] === 'fill' ? 'empty' : 'fill';
      safeSave(report, _currentPeriod); rerender();
    },
    s09ToggleManual: (i, checked) => {
      const pd = report.pages_data && report.pages_data['09'];
      if (!pd || !pd.rows || !pd.rows[i]) return;
      const row = pd.rows[i];
      if (checked) {
        const hasFill = row.progress.some(s => s === 'fill');
        if (hasFill) {
          confirmModal('开启手动模式', '开启后之前选择的进度格会清空, 改为手动输入天数. 确认开启?', () => {
            row.progress = ['empty','empty','empty','empty','empty','empty','empty'];
            row.manual_mode = true;
            safeSave(report, _currentPeriod); rerender();
            toast('已开启手动模式', 'success');
          }, () => {
            rerender();  // 用户取消, 还原 toggle
          });
          return;
        }
        row.manual_mode = true;
      } else {
        row.manual_mode = false;
      }
      safeSave(report, _currentPeriod); rerender();
    },
    s09Remove: (i) => {
      const pd = report.pages_data && report.pages_data['09'];
      if (pd && pd.rows) {
        pd.rows.splice(i, 1);
        safeSave(report, _currentPeriod); rerender();
      }
    },
    s09AiPlan: () => toast('AI 智能排 mock: 已生成草稿', 'info'),
    s09UpdateDate: (idx, iso) => {
      // 改一个日期 = 整周 shift: 用选中的日期反推 start = 选中日 - idx, 然后 7 天全部重算
      //   例: 选中 idx=2 (周三位置) = 2026/6/7 (周日) → start = 6/5 (周一) → 整周 6/5~6/11
      //   这样选完以后每列的"周X"都跟真实日期对得上
      const pd = report.pages_data && report.pages_data['09'];
      if (!pd) return;
      const parts = iso.split('-');
      const picked = new Date(+parts[0], +parts[1] - 1, +parts[2]);
      if (isNaN(picked.getTime())) return;
      const start = new Date(picked);
      start.setDate(picked.getDate() - idx);
      const isoOf = (d) => d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
      const newDates = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        newDates.push(isoOf(d));
      }
      pd.dates = newDates;
      safeSave(report, _currentPeriod); rerender();
    },
    s09ShowDatePicker: (idx) => {
      // 点短日期 label (5-18) 触发原生 date picker;
      // showPicker() 在 Chrome/Edge 支持, Firefox 退回 focus + click
      const input = document.getElementById('s09-date-input-' + idx);
      if (!input) return;
      if (typeof input.showPicker === 'function') {
        try { input.showPicker(); return; } catch (e) { /* fall through */ }
      }
      input.focus();
      try { input.click(); } catch (e) { /* noop */ }
    },
    s09ResetDates: () => {
      const pd = report.pages_data && report.pages_data['09'];
      if (!pd) return;
      pd.dates = null;  // 清掉 override, _calcDates 会自动从 period.start 重算
      safeSave(report, _currentPeriod); rerender();
      toast('已重置日期 (回到本周期起始日)', 'success');
    },
    s09UpdateArea: (input) => {
      // 改区域名: 同步更新该 area 组所有 row.area
      const pd = report.pages_data && report.pages_data['09'];
      if (!pd || !pd.rows) return;
      const oldName = input.dataset.original;
      const newName = input.value.trim();
      if (!newName) {
        toast('区域名不能为空', 'error');
        input.value = oldName;
        return;
      }
      if (newName === oldName) return;
      // 改名不能与其他 area 重名
      const others = new Set(pd.rows.map(r => r.area).filter(a => a && a !== oldName));
      if (others.has(newName)) {
        toast('区域名 "' + newName + '" 已存在', 'error');
        input.value = oldName;
        return;
      }
      let n = 0;
      pd.rows.forEach(r => { if (r.area === oldName) { r.area = newName; n++; } });
      safeSave(report, _currentPeriod); rerender();
      toast('已将 "' + oldName + '" 改名为 "' + newName + '" · ' + n + ' 行', 'success');
    },
    s09DeleteArea: (btn) => {
      // 删整个 area 组 (含所有 row.area === area 的行)
      const pd = report.pages_data && report.pages_data['09'];
      if (!pd || !pd.rows) return;
      const area = btn.dataset.area;
      const count = pd.rows.filter(r => r.area === area).length;
      if (count === 0) return;
      confirmModal('删除区域', '确定要删除区域 "' + area + '" 吗? 该区域下 ' + count + ' 行将一并删除 (不可恢复).', () => {
        pd.rows = pd.rows.filter(r => r.area !== area);
        safeSave(report, _currentPeriod); rerender();
        toast('已删除区域 ' + area + ' · ' + count + ' 行', 'success');
      });
    },
    // v5.16: 11 区域内的楼层划分图 (合并 4.1 进来), 数据模型 area.photos: [{url,caption,name}]
    //   原 s10Add / s10UpdateCaption / s10UploadSlot / s10RemovePhoto / s10HandleUpload 全部改 per-area (ai)
    //   隐藏 file input id 改为 s11-slot-input (s11 render 输出 1 个全局 input, 复用)
    s11AddPhoto: (ai) => {
      const pd = report.pages_data && report.pages_data['11'];
      const area = pd && pd.areas && pd.areas[ai];
      if (!area) return;
      area.photos = area.photos || [];
      const next = area.photos.length + 1;
      area.photos.push({ url: '', name: '', caption: '楼层' + next });
      Store.save(report, _currentPeriod); rerender();
    },
    s11UpdatePhotoCaption: (ai, j, val) => {
      const pd = report.pages_data && report.pages_data['11'];
      const area = pd && pd.areas && pd.areas[ai];
      if (area && area.photos && area.photos[j]) {
        area.photos[j].caption = val;
        Store.save(report, _currentPeriod);
      }
    },
    s11RemovePhoto: (ai, j) => {
      const pd = report.pages_data && report.pages_data['11'];
      const area = pd && pd.areas && pd.areas[ai];
      if (area && area.photos) {
        area.photos.splice(j, 1);
        Store.save(report, _currentPeriod); rerender();
      }
    },
    s11UploadPhoto: (ai, j) => {
      const input = document.getElementById('s11-slot-input');
      if (!input) return;
      input.dataset.targetArea = ai;
      input.dataset.targetCol = j;
      input.click();
    },
    s11HandlePhotoUpload: (input) => {
      const file = input && input.files && input.files[0];
      if (!file) return;
      if (file.size > 2 * 1024 * 1024) { toast('图片超过 2MB', 'error'); input.value = ''; return; }
      const ai = +input.dataset.targetArea;
      const j = +input.dataset.targetCol;
      const reader = new FileReader();
      reader.onload = (e) => {
        const pd = report.pages_data && report.pages_data['11'];
        const area = pd && pd.areas && pd.areas[ai];
        if (area) {
          area.photos = area.photos || [];
          // v5.10: caption 默认 = 原文件名 (无后缀), name 字段保留完整原文件名供 tooltip
          const nameNoExt = file.name.replace(/\.[^/.]+$/, '');
          const newPhoto = { url: e.target.result, name: file.name, caption: nameNoExt };
          if (j >= area.photos.length) {
            area.photos.push(newPhoto);  // 末尾新增
          } else {
            area.photos[j] = newPhoto;   // 替换现有
          }
          Store.save(report, _currentPeriod); rerender();
        }
      };
      reader.readAsDataURL(file);
      input.value = '';
    },
    // v5.17: 点图片缩略图打开灯箱 (全屏查看大图)
    s11ViewPhoto: (ai, j) => {
      const pd = report.pages_data && report.pages_data['11'];
      const area = pd && pd.areas && pd.areas[ai];
      const p = area && area.photos && area.photos[j];
      if (!p || !p.url) return;
      const caption = (area.area ? area.area + ' · ' : '') + (p.caption || p.name || '图片');
      imageModal(p.url, caption);
    },
    // 11 施工段计划 (v5.11: 每区域一张表, 数据 { areas: [{ area, steps: [{ seq, part, step, cells, highlight }] }] })
    // v5.12: 日期 cell 改 App.s11UpdateDate (本函数已无引用, 保留以防他处误用)
    s11UpdateField: (ai, ri, field, val) => {
      const pd = report.pages_data && report.pages_data['11'];
      const step = pd && pd.areas && pd.areas[ai] && pd.areas[ai].steps && pd.areas[ai].steps[ri];
      if (step) {
        step[field] = val;
        Store.save(report, _currentPeriod);
      }
    },
    s11UpdateTitle: (val) => {
      const pd = report.pages_data && report.pages_data['11'];
      if (!pd) return;
      pd.title = val;
      Store.save(report, _currentPeriod);
    },
    // v5.11: 改 area 名 (instance-card header 里的可编辑徽章)
    s11UpdateArea: (input) => {
      const ai = parseInt(input.dataset.area, 10);
      const pd = report.pages_data && report.pages_data['11'];
      if (pd && pd.areas && pd.areas[ai]) {
        pd.areas[ai].area = input.value;
        Store.save(report, _currentPeriod);
      }
    },
    // v5.11: 顶部 [+ 新增区域] = push 一个空 area (sections=[], steps=[]), 用户点表头 [+] 加层, 再点表底 [+ 新增工序] 加行
    // v5.14: 新 area 默认空 sections, 不复制其他 area 的层 (各区域独立)
    // v5.15: 新 area 默认带 3 个基础列 (楼栋/施工段、部位、工序), 各区域独立可改可删
    // v5.19: 新 area 默认带 1 层 "一层" (开始/完成/日历天), 新增后立刻能填, 不用再手动 [+]
    s11AddArea: () => {
      const pd = report.pages_data && report.pages_data['11'];
      if (!pd) return;
      pd.areas = pd.areas || [];
      const next = pd.areas.length + 1;
      pd.areas.push({
        area: '区域' + next,
        // v5.16: 每 area 持有自己的楼层划分图 (合并 4.1 进来)
        photos: [],
        baseColumns: [
          { name: '楼栋/施工段', key: 'building' },
          { name: '部位',       key: 'part' },
          { name: '工序',       key: 'step' }
        ],
        sections: [{ name: '一层' }],
        steps: []
      });
      Store.save(report, _currentPeriod); rerender();
    },
    // v5.11: 删整个 area (弹确认, 避免误删多行工序)
    s11RemoveArea: (ai) => {
      const pd = report.pages_data && report.pages_data['11'];
      if (!pd || !pd.areas || !pd.areas[ai]) return;
      const a = pd.areas[ai];
      const stepCount = (a.steps || []).length;
      const areaName = a.area || ('区域' + (ai + 1));
      const msg = '确定删除区域 "' + areaName + '" 吗? 该区域下 ' + stepCount + ' 行工序将一并删除 (不可恢复).';
      confirmModal('删除区域', msg, () => {
        pd.areas.splice(ai, 1);
        Store.save(report, _currentPeriod); rerender();
        toast('已删除区域 ' + areaName + ' · ' + stepCount + ' 行', 'success');
      });
    },
    // v5.11: 表内 [+ 新增工序] = 在该 area 的 steps 末尾追加新行 (序号按区域独立计算, 楼栋默认=区域名)
    s11AddRowInArea: (ai) => {
      const pd = report.pages_data && report.pages_data['11'];
      if (!pd || !pd.areas || !pd.areas[ai]) return;
      const a = pd.areas[ai];
      a.steps = a.steps || [];
      const sections = a.sections || [];  // v5.14: sections 是 per-area
      const cellCount = sections.length * 3;
      a.steps.push({ building: a.area || '', part: '', step: '', cells: new Array(cellCount).fill('') });
      Store.save(report, _currentPeriod); rerender();
    },
    // v5.12: 日期选择器 onchange
    //   1) 把 ISO 字符串写回 step.cells[k]
    //   2) 同步更新 .s11-date-wrap 的 data-display (让 M/D 文本立刻反映新值)
    //   3) 重算同施工段的 days, 改 s11-days-cell.textContent (不重渲整张表, 避免输入失焦)
    //   4) save
    s11UpdateDate: (input, ai, ri, k) => {
      const pd = report.pages_data && report.pages_data['11'];
      const step = pd && pd.areas && pd.areas[ai] && pd.areas[ai].steps && pd.areas[ai].steps[ri];
      if (!step) return;
      step.cells = step.cells || [];
      step.cells[k] = input.value;
      // 更新 data-display
      const wrap = input.closest('.s11-date-wrap');
      if (wrap) wrap.setAttribute('data-display', s11FormatDate(input.value));
      // 重算 days (同施工段内的 start + end)
      const sectionIdx = Math.floor(k / 3);
      const startIdx = sectionIdx * 3;
      const endIdx = startIdx + 1;
      const daysIdx = startIdx + 2;
      const startIso = step.cells[startIdx] || '';
      const endIso = step.cells[endIdx] || '';
      const days = s11ComputeDays(startIso, endIso);
      // 找同行的 days cell
      const tr = input.closest('tr');
      if (tr) {
        const daysCell = tr.querySelector('td[data-cell-idx="' + daysIdx + '"]');
        if (daysCell) daysCell.textContent = days;
      }
      Store.save(report, _currentPeriod);
    },
    // v5.14: 改层名 (thead 里的可编辑 contenteditable, 按 area 索引, 文字超长可换行)
    s11UpdateSectionName: (el, ai, si) => {
      const pd = report.pages_data && report.pages_data['11'];
      const area = pd && pd.areas && pd.areas[ai];
      if (area && area.sections && area.sections[si]) {
        const name = (el.innerText || el.textContent || '').trim();
        area.sections[si].name = name;
        Store.save(report, _currentPeriod);
      }
    },
    // v5.14: 删层 (弹确认, 只影响本 area 内所有工序在此层的 3 列)
    s11RemoveSection: (ai, si) => {
      const pd = report.pages_data && report.pages_data['11'];
      if (!pd || !pd.areas || !pd.areas[ai]) return;
      const area = pd.areas[ai];
      if (!area.sections || !area.sections[si]) return;
      const sec = area.sections[si];
      const secName = sec.name || ('层' + (si + 1));
      const totalRows = (area.steps || []).length;
      const startCellIdx = si * 3;
      confirmModal('删除层', '确定删除层 "' + secName + '" 吗? 本区域 ' + totalRows + ' 行工序在此层的 开始/完成/日历天 3 列将一并清空 (不可恢复).', () => {
        area.sections.splice(si, 1);
        (area.steps || []).forEach(step => {
          if (Array.isArray(step.cells)) {
            step.cells.splice(startCellIdx, 3);
          }
          // highlight 索引 >= startCellIdx 的要减 3 (跟着 cell 一起左移)
          if (Array.isArray(step.highlight)) {
            step.highlight = step.highlight.map(h => {
              const n = parseInt(h, 10);
              return (!isNaN(n) && n >= startCellIdx) ? String(n - 3) : h;
              });
          }
        });
        Store.save(report, _currentPeriod); rerender();
        toast('已删除层 ' + secName, 'success');
      });
    },
    // v5.14: thead 末尾 [+] = 给本 area 加一个新层, 本 area 每行追加 3 个空 cell
    s11AddSection: (ai) => {
      const pd = report.pages_data && report.pages_data['11'];
      if (!pd || !pd.areas || !pd.areas[ai]) return;
      const area = pd.areas[ai];
      area.sections = area.sections || [];
      const next = area.sections.length + 1;
      area.sections.push({ name: '层' + next });
      (area.steps || []).forEach(step => {
        step.cells = step.cells || [];
        step.cells.push('', '', '');
      });
      Store.save(report, _currentPeriod); rerender();
    },
    // v5.15: 改基础列名 (thead 里的可编辑 contenteditable, 按 area 索引, 文字超长可换行)
    s11UpdateBaseColName: (el, ai, ci) => {
      const pd = report.pages_data && report.pages_data['11'];
      const area = pd && pd.areas && pd.areas[ai];
      if (area && area.baseColumns && area.baseColumns[ci]) {
        const name = (el.innerText || el.textContent || '').trim();
        area.baseColumns[ci].name = name;
        Store.save(report, _currentPeriod);
      }
    },
    // v5.15: 删基础列 (弹确认, 只影响本 area 内所有工序在该列的数据)
    s11RemoveBaseCol: (ai, ci) => {
      const pd = report.pages_data && report.pages_data['11'];
      if (!pd || !pd.areas || !pd.areas[ai]) return;
      const area = pd.areas[ai];
      if (!area.baseColumns || !area.baseColumns[ci]) return;
      const col = area.baseColumns[ci];
      const colName = col.name || ('列' + (ci + 1));
      const colKey = col.key;
      const totalRows = (area.steps || []).length;
      confirmModal('删除列', '确定删除列 "' + colName + '" 吗? 本区域 ' + totalRows + ' 行工序在该列的数据将一并删除 (不可恢复).', () => {
        area.baseColumns.splice(ci, 1);
        (area.steps || []).forEach(step => {
          if (step && colKey in step) {
            delete step[colKey];
          }
        });
        Store.save(report, _currentPeriod); rerender();
        toast('已删除列 ' + colName, 'success');
      });
    },
    s11AiExtend: () => toast('AI 续排 mock', 'info'),
    // 12 协调事宜
    s12Update: (i, field, val) => {
      const pd = report.pages_data && report.pages_data['12'];
      if (pd && pd.rows && pd.rows[i]) {
        pd.rows[i][field] = val;
        Store.save(report, _currentPeriod);
      }
    },
    s12Add: () => {
      const pd = report.pages_data && report.pages_data['12'];
      if (!pd) return;
      pd.rows = pd.rows || [];
      pd.rows.push({ issue: '', proposer: '', cooperator: '' });
      Store.save(report, _currentPeriod); rerender();
    },
    s12Remove: (i) => {
      const pd = report.pages_data && report.pages_data['12'];
      if (pd && pd.rows) {
        pd.rows.splice(i, 1);
        Store.save(report, _currentPeriod); rerender();
      }
    },
    // 14 封尾
    s14Update: (val) => {
      const pd = report.pages_data && report.pages_data['14'];
      if (!pd) return;
      pd.content = val;
      Store.save(report, _currentPeriod);
    },
    // 03
    s03Update: (i, field, val) => {
      const rows = report.pages_data && report.pages_data['03'] && report.pages_data['03'].rows;
      if (rows && rows[i]) {
        rows[i][field] = val;
        Store.save(report, _currentPeriod); rerender();
      }
    },
    s03SetDelta: (i, val) => {
      const rows = report.pages_data && report.pages_data['03'] && report.pages_data['03'].rows;
      if (rows && rows[i]) {
        rows[i].delta = val;
        Store.save(report, _currentPeriod); rerender();
      }
    },
    s03AddRow: () => {
      const pd = report.pages_data && report.pages_data['03'];
      if (!pd) return;
      const rows = pd.rows || (pd.rows = []);
      const nextSeq = rows.length ? Math.max.apply(null, rows.map(r => r.seq || 0)) + 1 : 1;
      rows.push({ seq: nextSeq, role: '', name: '', phone: '', present: true, delta: 'new' });
      Store.save(report, _currentPeriod); rerender();
    },
    s03UploadPhoto: (input) => {
      const file = input && input.files && input.files[0];
      if (!file) return;
      if (file.size > 2 * 1024 * 1024) {
        toast('图片超过 2MB, 请压缩后再上传', 'error');
        input.value = '';
        return;
      }
      const reader = new FileReader();
      reader.onload = function (e) {
        report.ui_config = report.ui_config || {};
        report.ui_config.s03_photo = e.target.result;
        Store.save(report, _currentPeriod); rerender();
      };
      reader.readAsDataURL(file);
    },
    s03ClearPhoto: () => {
      if (!report.ui_config) return;
      delete report.ui_config.s03_photo;
      Store.save(report, _currentPeriod); rerender();
    },
    s03UpdateCaption: (val) => {
      report.ui_config = report.ui_config || {};
      report.ui_config.s03_photo_caption = val;
      Store.save(report, _currentPeriod);
    },
    // 0301 重要节点
    s0301UpdateCell: (major, rowType, month, text) => {
      const pd = report.pages_data && report.pages_data['0301'];
      if (!pd) return;
      const rows = pd.rows || (pd.rows = []);
      let r = rows.find(x => x.major === major && x.row === rowType);
      if (!r) {
        r = { major: major, row: rowType };
        rows.push(r);
      }
      r[month] = text;
      Store.save(report, _currentPeriod);
    },
    s0301AddMajor: () => {
      const pd = report.pages_data && report.pages_data['0301'];
      if (!pd) return;
      const rows = pd.rows || (pd.rows = []);
      const existingMajors = rows.map(r => r.major);
      let suggestion = '精装(清尚)';
      let n = 1;
      while (existingMajors.includes(suggestion)) {
        n++;
        suggestion = '精装(清尚) ' + n;
      }
      promptModal('新增专业', suggestion, (name) => {
        if (!name || !name.trim()) return;
        name = name.trim();
        if (rows.some(r => r.major === name)) {
          toast('专业已存在', 'error');
          return;
        }
        const months = (window.Sections['0301'] && window.Sections['0301']._getMonths) ? window.Sections['0301']._getMonths(report) : [];
        const baseRow = { major: name, row: '关键节点' };
        const subRow  = { major: name, row: '次要节点' };
        months.forEach(m => { baseRow[m] = ''; subRow[m] = ''; });
        rows.push(baseRow);
        rows.push(subRow);
        Store.save(report, _currentPeriod); rerender();
        toast('已新增专业 ' + name, 'success');
      });
    },
    s0301AddMonth: () => {
      const pd = report.pages_data && report.pages_data['0301'];
      if (!pd) return;
      const months = pd.months && pd.months.length ? pd.months : (window.Sections['0301'] ? window.Sections['0301']._getMonths(report) : []);
      if (!Array.isArray(pd.months)) pd.months = months.slice();
      const last = pd.months[pd.months.length - 1];
      const next = (window.Sections['0301'] ? window.Sections['0301']._nextMonthLabel(last) : '');
      promptModal('新增月份', next, (val) => {
        if (!val || !val.trim()) return;
        const m = val.trim();
        if (pd.months.includes(m)) {
          toast('该月份已存在', 'error');
          return;
        }
        pd.months.push(m);
        // 给所有行加这个 key
        (pd.rows || []).forEach(r => { if (!(m in r)) r[m] = ''; });
        Store.save(report, _currentPeriod); rerender();
        toast('已新增月份列 ' + m, 'success');
      });
    },
    s0301DelMonth: (idx) => {
      const pd = report.pages_data && report.pages_data['0301'];
      if (!pd) return;
      if (!Array.isArray(pd.months)) {
        pd.months = (window.Sections['0301'] ? window.Sections['0301']._getMonths(report) : []);
      }
      const m = pd.months[idx];
      if (!m) return;
      // 检查是否有内容
      const hasContent = (pd.rows || []).some(r => (r[m] || '').trim() !== '');
      const msg = hasContent
        ? '月份 "' + m + '" 列里有内容, 确认删除整列?'
        : '确认删除月份列 "' + m + '"?';
      confirmModal('删除月份列', msg, () => {
        pd.months.splice(idx, 1);
        (pd.rows || []).forEach(r => { delete r[m]; });
        Store.save(report, _currentPeriod); rerender();
        toast('已删除月份 ' + m, 'success');
      });
    },
    s0301EditMonth: (idx) => {
      const pd = report.pages_data && report.pages_data['0301'];
      if (!pd) return;
      if (!Array.isArray(pd.months)) {
        pd.months = (window.Sections['0301'] ? window.Sections['0301']._getMonths(report) : []);
      }
      const oldKey = pd.months[idx];
      if (!oldKey) return;
      promptModal('修改月份标签', oldKey, (val) => {
        if (!val || !val.trim()) return;
        const newKey = val.trim();
        if (newKey === oldKey) return;
        if (pd.months.includes(newKey)) {
          toast('该月份已存在', 'error');
          return;
        }
        pd.months[idx] = newKey;
        // 把所有行的 key 重命名
        (pd.rows || []).forEach(r => {
          if (oldKey in r) {
            r[newKey] = r[oldKey];
            delete r[oldKey];
          }
        });
        Store.save(report, _currentPeriod); rerender();
        toast('已修改月份 ' + oldKey + ' → ' + newKey, 'success');
      });
    },
    s0301AddRow: (major) => {
      const pd = report.pages_data && report.pages_data['0301'];
      if (!pd) return;
      pd.rows = pd.rows || [];
      // 找该 major 下最大自定义行序号, 提示用户填名字
      const existingLabels = pd.rows.filter(r => r.major === major).map(r => r.row || '');
      let suggestion = '其他节点';
      let n = 1;
      while (existingLabels.includes(suggestion)) {
        n++;
        suggestion = '其他节点 ' + n;
      }
      promptModal('为专业 "' + major + '" 新增一行', suggestion, (val) => {
        if (!val || !val.trim()) return;
        const label = val.trim();
        if (existingLabels.includes(label)) {
          toast('该行名已存在', 'error');
          return;
        }
        const months = pd.months && pd.months.length ? pd.months : (window.Sections['0301'] ? window.Sections['0301']._getMonths(report) : []);
        const newRow = { major: major, row: label };
        months.forEach(m => { newRow[m] = ''; });
        pd.rows.push(newRow);
        Store.save(report, _currentPeriod); rerender();
        toast('已新增行 "' + label + '"', 'success');
      });
    },
    s0301DelRow: (major, rowLabel) => {
      const pd = report.pages_data && report.pages_data['0301'];
      if (!pd || !pd.rows) return;
      const idx = pd.rows.findIndex(r => r.major === major && r.row === rowLabel);
      if (idx < 0) return;
      // 检查行是否有内容
      const months = pd.months && pd.months.length ? pd.months : (window.Sections['0301'] ? window.Sections['0301']._getMonths(report) : []);
      const hasContent = months.some(m => (pd.rows[idx][m] || '').trim() !== '');
      const isFixed = rowLabel === '关键节点' || rowLabel === '次要节点';
      const msg = (isFixed && hasContent)
        ? '"' + rowLabel + '" 行内有内容, 确认删除?'
        : '确认删除专业 "' + major + '" 的 "' + rowLabel + '" 行?';
      confirmModal(isFixed ? '删除固定行' : '删除行', msg, () => {
        pd.rows.splice(idx, 1);
        Store.save(report, _currentPeriod); rerender();
        toast('已删除行 "' + rowLabel + '"', 'success');
      });
    },
    s0301EditRow: (major, oldLabel) => {
      const pd = report.pages_data && report.pages_data['0301'];
      if (!pd || !pd.rows) return;
      const row = pd.rows.find(r => r.major === major && r.row === oldLabel);
      if (!row) return;
      promptModal('修改行名', oldLabel, (val) => {
        if (!val || !val.trim()) return;
        const newLabel = val.trim();
        if (newLabel === oldLabel) return;
        if (pd.rows.some(r => r.major === major && r.row === newLabel)) {
          toast('该行名已存在', 'error');
          return;
        }
        row.row = newLabel;
        Store.save(report, _currentPeriod); rerender();
        toast('已修改行名 "' + oldLabel + '" → "' + newLabel + '"', 'success');
      });
    },
    s0301DelMajor: (major) => {
      const pd = report.pages_data && report.pages_data['0301'];
      if (!pd || !pd.rows) return;
      const cnt = pd.rows.filter(r => r.major === major).length;
      const hasContent = pd.rows.some(r => r.major === major && Object.keys(r).some(k => k !== 'major' && k !== 'row' && (r[k] || '').trim() !== ''));
      const msg = hasContent
        ? '专业 "' + major + '" 下 ' + cnt + ' 行有内容, 确认全部删除?'
        : '确认删除专业 "' + major + '" 及其 ' + cnt + ' 行?';
      confirmModal('删除专业', msg, () => {
        pd.rows = pd.rows.filter(r => r.major !== major);
        Store.save(report, _currentPeriod); rerender();
        toast('已删除专业 ' + major, 'success');
      });
    },
    // 公共
    changePeriod, changeRole, gotoSection, exportPDF,
    openPreview, rebuildAI,
    // nav_tree
    addChapter: () => {
      promptModal('新一级标题', '', (name) => {
        if (name && name.trim()) {
          NavTree.addChapter(report.nav_tree, name.trim());
          Store.save(report, _currentPeriod); rerender();
          toast('已新增一级标题', 'success');
        }
      });
    },
    addSubPage: (parentId) => {
      const parent = NavTree.findNode(report.nav_tree, parentId);
      if (!parent) return;
      promptModal('新子页名称', '', (name) => {
        if (name && name.trim()) {
          const pageId = String(Date.now()).slice(-4);
          NavTree.addPage(report.nav_tree, parentId, name.trim(), pageId);
          Store.save(report, _currentPeriod); rerender();
          toast('已新增子页 ' + name.trim(), 'success');
        }
      });
    },
    addSiblingChapter: (siblingId) => {
      // 在 sibling 节点后加同级 chapter
      const node = NavTree.findNode(report.nav_tree, siblingId);
      if (!node) return;
      // 找 sibling 的 parent (或根)
      const parent = findParentOfNode(report.nav_tree, siblingId) || report.nav_tree;
      promptModal('新增同级章', '', (name) => {
        if (name && name.trim()) {
          const id = 'n' + Date.now() + Math.floor(Math.random()*1000);
          const newNode = { id, type: 'chapter', name: name.trim(), prefix: null, manual_prefix: false, children: [] };
          // 插入到 sibling 之后
          const idx = parent.findIndex(n => n.id === siblingId);
          if (idx < 0) parent.push(newNode);
          else parent.splice(idx + 1, 0, newNode);
          NavTree.renumber(report.nav_tree);
          Store.save(report, _currentPeriod); rerender();
          toast('已新增同级章 ' + name.trim(), 'success');
        }
      });
    },
    addSiblingPage: (siblingId) => {
      // 在 sibling page 节点后加同级 page (同一 chapter 下)
      const node = NavTree.findNode(report.nav_tree, siblingId);
      if (!node) return;
      const parent = findParentOfNode(report.nav_tree, siblingId);
      if (!parent) {
        toast('根级 page 不能加同级', 'error');
        return;
      }
      promptModal('新增同级页', '', (name) => {
        if (name && name.trim()) {
          const id = 'n' + Date.now() + Math.floor(Math.random()*1000);
          const pageId = String(Date.now()).slice(-4);
          const newNode = { id, type: 'page', name: name.trim(), page_id: pageId, prefix: null, manual_prefix: false, parent_prefix: null, children: [] };
          const idx = parent.findIndex(n => n.id === siblingId);
          if (idx < 0) parent.push(newNode);
          else parent.splice(idx + 1, 0, newNode);
          NavTree.renumber(report.nav_tree);
          Store.save(report, _currentPeriod); rerender();
          toast('已新增同级页 ' + name.trim(), 'success');
        }
      });
    },
    startRename: (id) => {
      const n = NavTree.findNode(report.nav_tree, id);
      if (!n) return;
      promptModal('重命名', n.name, (newName) => {
        if (newName && newName.trim()) {
          n.name = newName.trim();
          Store.save(report, _currentPeriod); rerender();
        }
      });
    },
    startEditPrefix: (id) => {
      const n = NavTree.findNode(report.nav_tree, id);
      if (!n) return;
      promptModal('改前缀 (留空 = 自动)', n.prefix || '', (p) => {
        if (p === '') NavTree.clearManualPrefix(report.nav_tree, id);
        else NavTree.setManualPrefix(report.nav_tree, id, p);
        Store.save(report, _currentPeriod); rerender();
      });
    },
    updateField: (path, value) => {
      // 改嵌套字段, e.g. 'project.name' -> report.project.name
      const keys = path.split('.');
      let obj = report;
      for (let i = 0; i < keys.length - 1; i++) {
        if (obj[keys[i]] === undefined) obj[keys[i]] = {};
        obj = obj[keys[i]];
      }
      obj[keys[keys.length - 1]] = value;
      Store.save(report, _currentPeriod);
    },
    confirmRemove: (id) => {
      const n = NavTree.findNode(report.nav_tree, id);
      if (!n) return;
      // 保护 01 02 03 0301 系统节点 (封面/目录/组织架构/重要节点) 不让删
      const protectedIds = ['n01', 'n02', 'n03', 'n0301'];
      if (protectedIds.includes(id) || (n.page_id && ['01','02','03','0301'].includes(n.page_id))) {
        toast('"' + n.name + '" 是系统固定节点, 不能删除', 'error');
        return;
      }
      const cnt = (n.children || []).length;
      const msg = cnt > 0 ? '此节点包含 ' + cnt + ' 个子节点, ' : '';
      confirmModal('删除节点', msg + '确定删除 "' + n.name + '"?', () => {
        NavTree.removeNode(report.nav_tree, id);
        Store.save(report, _currentPeriod); rerender();
        toast('已删除', 'success');
      });
    },
    // report_list 桥接 (供 dialog HTML onclick 调用)
    showReportList: () => ReportList.showReportList(),
    batchDeleteReports: () => ReportList.batchDeleteReports(),
    confirmBatchDelete: () => ReportList.confirmBatchDelete(),
    confirmDeleteReport: (period) => ReportList.confirmDeleteReport(period),
    confirmRenameReport: () => ReportList.confirmRenameReport(),
    confirmEditDates: () => ReportList.confirmEditDates(),
    toggleSelectAll: (checked) => ReportList.toggleSelectAll(checked),
    updateBatchSelectInfo: () => ReportList.updateBatchSelectInfo(),
    renameReport: (period) => ReportList.renameReport(period),
    editPeriodDates: (period) => ReportList.editPeriodDates(period),
    setAsBasePeriod: (period) => ReportList.setAsBasePeriod(period),
    deleteReport: (period) => ReportList.deleteReport(period),
    showGeneratePeriodsDialog: () => ReportList.showGeneratePeriodsDialog(),
    confirmBaselineConflict: () => ReportList.confirmBaselineConflict(),
    cancelBaselineConflict: () => ReportList.cancelBaselineConflict(),
    useBaselineAndGenerate: () => ReportList.useBaselineAndGenerate(),
    showBaselineConfirmDialog: () => ReportList.showBaselineConfirmDialog(),
    updateGeneratePreview: () => ReportList.updateGeneratePreview(),
    updateGeneratePreviewFromStart: () => ReportList.updateGeneratePreviewFromStart(),
    updateGeneratePreviewFromEnd: () => ReportList.updateGeneratePreviewFromEnd(),
    updateGeneratePreviewFromOthers: () => ReportList.updateGeneratePreviewFromOthers(),
    updateGeneratePreviewFromDur: () => ReportList.updateGeneratePreviewFromDur(),
    showConflictDialog: (conflicts, newPeriods) => ReportList.showConflictDialog(conflicts, newPeriods),
    executeGenerateFromDialog: () => ReportList.executeGenerateFromDialog(),
    handleConflict: (action) => ReportList.handleConflict(action),
    toggleLabelFormat: (format) => {
      // 切模式 + 重渲顶部 selector + 重开 modal
      localStorage.setItem('bcy_label_format', format);
      const overlay = document.getElementById('report-list-overlay');
      if (overlay) overlay.remove();
      ReportList.showReportList();
      // 顶部 selector: 调 renderPeriodSelector 重渲 (用 closure rerender)
      if (typeof rerender === 'function') rerender();
      // 双重保险: 调 window._rerender (如果有)
      if (typeof global._rerender === 'function') global._rerender();
    },
    addNewPeriod: () => {
      ReportList.addNewPeriod();
      if (typeof rerender === 'function') rerender();
      if (typeof global._rerender === 'function') global._rerender();
    },
    applyNavFilter: () => {
      // 读 3 个 checkbox 状态 -> 存 localStorage + rerender
      const f = {
        chapter: document.getElementById('filter-chapter') ? document.getElementById('filter-chapter').checked : true,
        page: document.getElementById('filter-page') ? document.getElementById('filter-page').checked : true,
        closing: document.getElementById('filter-closing') ? document.getElementById('filter-closing').checked : false
      };
      localStorage.setItem('bcy_nav_filter', JSON.stringify(f));
      if (typeof rerender === 'function') rerender();
    }
  };

  // 暴露内部辅助函数到 window, 供 report_list.js 等跨文件使用
  global._currentPeriod_get = () => _currentPeriod;
  global._currentPeriod_set = (p) => { _currentPeriod = p; };
  global._toast = toast;
  global._today = () => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  global._rerender = rerender;
  global._changePeriod = changePeriod;
  global._init = init;
  global._renderSection = renderSection;
  global._renderNav = renderNav;
  global._renderAnomalies = renderAnomalies;
  global._findNodeByPageId = findNodeByPageId;
  global._report = () => report;
  global.App = App;
  global.Store = Store;  // 由 store.js 注入
  global.Rules = Rules;  // 由 rules.js 注入
})(window);
