// platform/js/nav_tree.js
// 左侧边栏可编辑树结构
// v5.2 - 数据反推 + 自动 prefix + 增/改/删/拖拽
(function (global) {
  const FORMAT = {
    level1: '第{N}章',
    level2: '{N}.{M}'
  };

  // 1.1 生成自动 prefix
  function autoPrefix(level, parentN, m) {
    if (level === 1) return FORMAT.level1.replace('{N}', parentN);
    if (level === 2) return FORMAT.level2.replace('{N}', parentN).replace('{M}', m);
    return '';
  }

  // 1.2 全树重算 prefix
  function renumber(tree) {
    let n1 = 0;
    tree.forEach(node => {
      if (node.type === 'chapter' && !node.is_closing) {
        n1++;
        if (!node.manual_prefix) node.prefix = autoPrefix(1, n1);
        // 子级
        let n2 = 0;
        node.children.forEach(child => {
          if (child.type === 'page' && !child.is_closing) {
            n2++;
            if (!child.manual_prefix) {
              child.prefix = autoPrefix(2, n1, n2);
              child.parent_prefix = node.prefix;
            }
          }
        });
      } else if (node.type === 'chapter' && node.is_closing) {
        // 封尾节点 prefix 留空
        node.prefix = null;
      } else if (node.type === 'page' && !node.is_closing) {
        // 顶层独立 page (如目录) prefix 留空
        node.prefix = null;
      }
    });
    return tree;
  }

  // 1.3 拼副标题 = prefix + 实例动态数据
  function subTitle(node, instance) {
    let s = node.prefix || '';
    if (instance && instance.keyValue) {
      s = s ? s + ' ' + instance.keyValue : instance.keyValue;
    }
    return s;
  }

  // 1.4 增 / 删 / 改 / 拖拽
  function addChapter(tree, name) {
    const id = 'n' + Date.now() + Math.floor(Math.random()*1000);
    const node = { id, type: 'chapter', name, prefix: null, manual_prefix: false, children: [] };
    tree.push(node);
    renumber(tree);
    return node;
  }
  function addPage(tree, parentId, name, page_id) {
    const parent = findNode(tree, parentId);
    if (!parent) return null;
    // 允许 chapter + page 都加子 page (支持多级嵌套)
    const id = 'n' + Date.now() + Math.floor(Math.random()*1000);
    const node = {
      id, type: 'page', name, page_id, prefix: null, manual_prefix: false,
      parent_prefix: parent.prefix, children: []
    };
    parent.children.push(node);
    renumber(tree);
    return node;
  }
  
  // 1.15 addSubChapter - 任意节点下加 chapter (支持多级嵌套)
  function addSubChapter(tree, parentId, name) {
    const parent = findNode(tree, parentId);
    if (!parent) return null;
    const id = 'n' + Date.now() + Math.floor(Math.random()*1000);
    const node = {
      id, type: 'chapter', name, prefix: null, manual_prefix: false, children: []
    };
    parent.children.push(node);
    renumber(tree);
    return node;
  }
  
  function rename(tree, id, newName) {
    const node = findNode(tree, id);
    if (node) node.name = newName;
    return node;
  }
  function setManualPrefix(tree, id, newPrefix) {
    const node = findNode(tree, id);
    if (node) {
      node.prefix = newPrefix;
      node.manual_prefix = true;
    }
    return node;
  }
  function clearManualPrefix(tree, id) {
    const node = findNode(tree, id);
    if (node) {
      node.manual_prefix = false;
      renumber(tree);
    }
    return node;
  }
  function removeNode(tree, id) {
    function walk(arr) {
      for (let i = 0; i < arr.length; i++) {
        if (arr[i].id === id) {
          arr.splice(i, 1);
          return true;
        }
        if (arr[i].children && walk(arr[i].children)) return true;
      }
      return false;
    }
    walk(tree);
    renumber(tree);
  }
  function moveNode(tree, draggedId, targetId, position) {
    // position: 'before' | 'after' | 'inside' (only for chapter parent)
    const dragged = findNode(tree, draggedId);
    if (!dragged) return;
    // 1. 从原位置摘下
    detach(tree, draggedId);
    // 2. 插到目标位置
    if (position === 'inside') {
      const target = findNode(tree, targetId);
      if (target && target.type === 'chapter') {
        target.children.push(dragged);
      } else {
        tree.push(dragged);  // fallback
      }
    } else {
      // 'before' / 'after' 插入到 target 的同级
      const siblings = siblingsOf(tree, targetId);
      const targetIdx = siblings.findIndex(n => n.id === targetId);
      if (targetIdx < 0) {
        tree.push(dragged);
      } else {
        const idx = position === 'before' ? targetIdx : targetIdx + 1;
        siblings.splice(idx, 0, dragged);
      }
    }
    renumber(tree);
  }
  function detach(tree, id) {
    function walk(arr) {
      for (let i = 0; i < arr.length; i++) {
        if (arr[i].id === id) {
          arr.splice(i, 1);
          return true;
        }
        if (arr[i].children && walk(arr[i].children)) return true;
      }
      return false;
    }
    walk(tree);
  }
  function siblingsOf(tree, id) {
    // 找节点的同级数组
    function walk(arr) {
      for (let i = 0; i < arr.length; i++) {
        if (arr[i].id === id) return arr;
        if (arr[i].children) {
          const r = walk(arr[i].children);
          if (r) return r;
        }
      }
      return null;
    }
    return walk(tree) || tree;
  }
  function findNode(tree, id) {
    function walk(arr) {
      for (let i = 0; i < arr.length; i++) {
        if (arr[i].id === id) return arr[i];
        if (arr[i].children) {
          const r = walk(arr[i].children);
          if (r) return r;
        }
      }
      return null;
    }
    return walk(tree);
  }

  // 1.5 渲染 HTML
  // 折叠状态: collapsed 节点 id 集合
  const _collapsed = new Set();
  
  function toggleCollapse(id) {
    if (_collapsed.has(id)) _collapsed.delete(id);
    else _collapsed.add(id);
    // 重新渲染 nav (用 App 暴露的 _renderNav)
    if (typeof window._renderNav === 'function') window._renderNav();
  }
  function isCollapsed(id) { return _collapsed.has(id); }
  
  function renderHTML(tree, opts) {
    opts = opts || {};
    const activeId = opts.activeId;
    const filter = opts.filter || { chapter: true, page: true, closing: false };
    function renderNode(node, depth) {
      // 应用 filter
      if (node.is_closing && !filter.closing) return '';
      if (node.type === 'chapter' && !filter.chapter) return '';
      if (node.type === 'page' && !node.is_closing && !filter.page) return '';
      const indent = depth * 16;
      const isActive = node.id === activeId;
      const prefixHtml = node.prefix
        ? `<span class="nav-prefix text-xs text-slate-400 mr-1">${node.prefix}</span>`
        : '';
      // 折叠箭头 (chapter 节点有 children 才显示)
      let collapseHtml = '';
      if (node.type === 'chapter' && node.children && node.children.length) {
        const collapsed = _collapsed.has(node.id);
        collapseHtml = `<span class="nav-collapse inline-block w-3 text-center text-slate-400 cursor-pointer select-none" onclick="NavTree.toggleCollapse('${node.id}')" title="${collapsed ? '展开' : '折叠'}">${collapsed ? '▶' : '▼'}</span>`;
      }
      
      // chapter 节点: +一级 (同级 chapter) +子 (子 page) + 展开/折叠
      // page 节点: +同级 (同级 page)
      let actionBtns = '';
      if (node.type === 'chapter') {
        actionBtns = `<button onclick="App.addSiblingChapter('${node.id}')" title="新增同级一级标题">+一级</button>`;
        actionBtns += `<button onclick="App.addSubPage('${node.id}')" title="新增子节点 (3.1, 3.2)">+子</button>`;
      } else {
        // page 节点: +同级
        actionBtns = `<button onclick="App.addSiblingPage('${node.id}')" title="新增同级二级节点">+同级</button>`;
      }
      
      // active 节点 actions 始终显示, 其他节点 hover 显示
      const actionsClass = isActive 
        ? 'nav-actions opacity-100' 
        : 'nav-actions opacity-0 hover:opacity-100';
      
      let html = `
        <div class="nav-node ${isActive ? 'active' : ''}"
             data-node-id="${node.id}"
             draggable="true"
             style="padding-left: ${indent}px">
          ${collapseHtml || '<span class="inline-block w-3 mr-1"></span>'}
          ${prefixHtml}
          <span class="nav-name">${node.name}</span>
          <div class="${actionsClass}">
            ${actionBtns}
            <button onclick="App.startRename('${node.id}')" title="改名">✏</button>
            <button onclick="App.startEditPrefix('${node.id}')" title="改前缀">#</button>
            <button onclick="App.confirmRemove('${node.id}')" title="删除">×</button>
          </div>
        </div>
      `;
      if (node.children && node.children.length && !_collapsed.has(node.id)) {
        node.children.forEach(c => {
          const childHtml = renderNode(c, depth + 1);
          if (childHtml) html += childHtml;
        });
      }
      return html;
    }
    let html = '';
    tree.forEach(n => { html += renderNode(n, 0); });
    return html;
  }

  // 1.6 全局导出
  global.NavTree = {
    renumber, subTitle,
    addChapter, addSubChapter, addPage, rename, setManualPrefix, clearManualPrefix,
    removeNode, moveNode, findNode,
    renderHTML, toggleCollapse, isCollapsed,
    FORMAT
  };
})(window);
