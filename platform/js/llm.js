// platform/js/llm.js
// v5.2 LLM mock - 6 个 AI 章节的 extract* 函数
(function (global) {
  const wait = ms => new Promise(r => setTimeout(r, ms));

  const AREA_DICT = ['高管区', '食堂区', '北塔咖啡厅', '南塔咖啡厅', '南塔健身房', '北塔健身房'];
  const OWNER_DICT = ['侯 帅', '王 健', '陈 冲', '王亚广', '鲍永春', '袁永超', '李 欢', '乔志广', '李永旺', '徐诗怡', '苏 尧'];
  const PROGRESS_DICT = ['0%', '25%', '50%', '75%', '100%'];

  function pickArea(text) {
    for (const a of AREA_DICT) if (text.includes(a.replace('区', '')) || text.includes(a)) return a;
    if (text.includes('高管') || text.includes('高管层')) return '高管区';
    if (text.includes('食堂')) return '食堂区';
    if (text.includes('咖啡')) return '北塔咖啡厅';
    if (text.includes('健身')) return '南塔健身房';
    return '高管区';
  }
  function pickOwner(text) {
    for (const o of OWNER_DICT) if (text.includes(o.replace(/\s/g, '')) || text.includes(o)) return o;
    return '鲍永春';
  }
  function pickProgress(text) {
    const m = text.match(/(\d{1,3})\s*[%％]/);
    if (m) {
      const v = parseInt(m[1]);
      const nearest = PROGRESS_DICT.map(p => parseInt(p)).sort((a, b) => Math.abs(a - v) - Math.abs(b - v))[0];
      return nearest + '%';
    }
    if (text.includes('完成') || text.includes('结束')) return '100%';
    if (text.includes('一半') || text.includes('过半')) return '50%';
    if (text.includes('开始') || text.includes('启动')) return '0%';
    if (text.includes('80') || text.includes('八成')) return '75%';
    if (text.includes('60') || text.includes('六成')) return '50%';
    return '100%';
  }
  function pickDeadline(text) {
    const m = text.match(/(\d{1,2})[月\.\-\/](\d{1,2})/);
    if (m) {
      return `2026-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
    }
    return '2026-05-24';
  }
  function confidence(field, value, text) {
    // mock: 字段值越具体置信度越高
    if (!value) return 0.3;
    if (text.includes(value)) return 0.95;
    if (text.includes(value.charAt(0))) return 0.8;
    return 0.6;
  }

  // 04: 上周工作完成 (v5.3: 按 (area, owner, deadline) 分组, 返回主行 + items 嵌套结构)
  async function extractWorkDone(input) {
    await wait(600);
    const sentences = input.split(/[。\n,;]/).filter(s => s.trim().length > 3);
    // 1) 先按句拆分, 提取每句的 (area, owner, deadline, task, progress)
    const items = sentences.map(s => {
      const area = pickArea(s);
      const owner = pickOwner(s);
      const progress = pickProgress(s);
      const deadline = pickDeadline(s);
      const task = s.trim().substring(0, 50);
      return { area, owner, deadline, task, progress };
    });
    // 2) 按 (area, owner, deadline) 分组 → 主行
    const groups = {};
    items.forEach(it => {
      const key = it.area + '|' + it.owner + '|' + it.deadline;
      if (!groups[key]) {
        groups[key] = { area: it.area, owner: it.owner, deadline: it.deadline, items: [], source: 'paste' };
      }
      groups[key].items.push({ task: it.task, progress: it.progress });
    });
    // 3) 加 _confidence
    return Object.values(groups).map(g => ({
      ...g,
      _confidence: 0.7 + Math.random() * 0.25
    }));
  }

  // 06: 人员统计
  async function extractLabor(input) {
    await wait(500);
    return AREA_DICT.map((a, i) => ({
      type: a + '工人',
      this_week: 10 + Math.floor(Math.random() * 30),
      next_week: 10 + Math.floor(Math.random() * 30),
      _confidence: 0.6 + Math.random() * 0.3
    }));
  }

  // 07: ECC 销项 (mock OCR)
  async function extractECC(input) {
    await wait(700);
    const total = 100 + Math.floor(Math.random() * 30);
    const closed = Math.floor(total * (0.7 + Math.random() * 0.25));
    return [{ total, closed, in_process: Math.floor(Math.random() * 5), open: total - closed, _confidence: 0.85 }];
  }

  // 08: 图纸深化
  async function extractDesign(input) {
    await wait(500);
    const sentences = input.split(/[。\n,;]/).filter(s => s.trim().length > 3);
    return sentences.map(s => ({
      task: s.trim().substring(0, 50),
      owner: pickOwner(s),
      status: s.includes('完成') ? '已完成' : s.includes('打样') ? '打样' : '进行中',
      _confidence: 0.7 + Math.random() * 0.25
    }));
  }

  // 09: 下周周计划 (AI 排甘特)
  async function planNextWeek(input) {
    await wait(900);
    const lines = input.split(/[。\n,;]/).filter(s => s.trim().length > 3);
    return lines.map(s => {
      const days = 1 + Math.floor(Math.random() * 7);
      const progress = ['empty','empty','empty','empty','empty','empty','empty'];
      for (let i = 0; i < days; i++) progress[i] = 'fill';
      return {
        area: pickArea(s),
        task: s.trim().substring(0, 50),
        progress,
        manual_mode: false,
        days,
        labor: pickOwner(s),
        headcount: 2 + Math.floor(Math.random() * 5),
        material: '已到场',
        source: 'paste',
        _confidence: 0.6 + Math.random() * 0.3
      };
    });
  }

  // 11: 续排
  async function extendSchedule(input) {
    await wait(800);
    return (input || []).map(s => ({
      ...s,
      cells: s.cells.map(c => c ? '' : c),  // 清空
      _confidence: 0.7
    }));
  }

  // 5: 照片分组
  async function groupPhotos(photos) {
    await wait(400);
    return photos.map(p => ({
      ...p,
      area: pickArea(p.caption || ''),
      _confidence: 0.5 + Math.random() * 0.3
    }));
  }

  global.LLM = {
    extractWorkDone, extractLabor, extractECC, extractDesign,
    planNextWeek, extendSchedule, groupPhotos
  };
})(window);
