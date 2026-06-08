// platform/js/rules.js
// v5.3 异常检测规则 (7+2 条) - work_done 嵌套 items flatten 后判断
(function (global) {
  // 摊平 work_done (主行 + items) 为单条记录数组
  // 旧 shape (扁平) 也兼容: 每条当作一个 item
  function flattenWorkDone(workDone) {
    if (!Array.isArray(workDone)) return [];
    const out = [];
    workDone.forEach((mr) => {
      if (Array.isArray(mr.items)) {
        mr.items.forEach(it => {
          out.push({
            area: mr.area,
            owner: mr.owner,
            deadline: mr.deadline,
            task: it.task,
            progress: it.progress
          });
        });
      } else {
        // 旧 shape 兜底
        out.push({
          area: mr.area,
          owner: mr.owner,
          deadline: mr.deadline,
          task: mr.task,
          progress: mr.progress
        });
      }
    });
    return out;
  }

  const RULES = [
    {
      id: 'ecc-low-close-rate',
      level: 'red',
      section: '07',
      check: r => {
        const e = r.ecc_summary || r.pages_data?.['07']?.data;
        if (!e || !e.total) return false;
        return e.closed / e.total < 0.7;
      },
      msg: r => {
        const e = r.ecc_summary || r.pages_data?.['07']?.data;
        const rate = (e.closed / e.total * 100).toFixed(2);
        return `ECC 关闭率 ${rate}%, 低于 70% 基线`;
      }
    },
    {
      id: 'ecc-mismatch',
      level: 'yellow',
      section: '07',
      check: r => {
        const e = r.ecc_summary || r.pages_data?.['07']?.data;
        if (!e) return false;
        const sum = (e.closed || 0) + (e.in_process || 0) + (e.open || 0);
        return Math.abs(sum - (e.total || 0)) > 1;
      },
      msg: r => {
        const e = r.ecc_summary || r.pages_data?.['07']?.data;
        const sum = (e.closed || 0) + (e.in_process || 0) + (e.open || 0);
        return `ECC 计数偏差: 已关闭 ${e.closed} + 流程中 ${e.in_process} + 未关闭 ${e.open} = ${sum}, 与问题总数 ${e.total} 不一致, 请复核`;
      }
    },
    {
      id: 'carry-over-untouched',
      level: 'yellow',
      section: '09',
      // v5 修正: 上周 progress<100% 任务 ∩ 本期 09 计划不含此任务 = 报黄
      // v5.2 简化: 算 progress<100% 任务数, 与 09 中"未完成项"对照
      // v5.3: flatten 新嵌套 shape 后再判断
      check: r => {
        if (!r.work_done) return false;
        const flat = flattenWorkDone(r.work_done);
        const incomplete = flat.filter(t => t.progress && t.progress !== '100%' && t.progress !== '0%');
        if (incomplete.length === 0) return false;
        const plan = r.pages_data?.['09']?.rows || r.next_week_plan || [];
        const planTasks = plan.map(p => p.task || '');
        const untouched = incomplete.filter(t => !planTasks.some(pt => pt.includes(t.task) || t.task.includes(pt)));
        return untouched.length > 0;
      },
      msg: r => {
        const flat = flattenWorkDone(r.work_done || []);
        const incomplete = flat.filter(t => t.progress && t.progress !== '100%' && t.progress !== '0%');
        const plan = r.pages_data?.['09']?.rows || r.next_week_plan || [];
        const planTasks = plan.map(p => p.task || '');
        const untouched = incomplete.filter(t => !planTasks.some(pt => pt.includes(t.task) || t.task.includes(pt)));
        return `上期 ${incomplete.length} 项进行中, 本周 09 计划未续排: ${untouched.map(t => t.task).slice(0, 3).join('; ')}`;
      }
    },
    {
      id: 'labor-spike',
      level: 'yellow',
      section: '06',
      check: r => {
        const stats = r.labor_stats || (r.pages_data && r.pages_data['06'] && r.pages_data['06'].rows) || [];
        const t = stats.find(s => s.is_total);
        if (!t || !t.this_week) return false;
        const delta = (t.next_week - t.this_week) / t.this_week;
        return Math.abs(delta) > 0.3;
      },
      msg: r => {
        const stats = r.labor_stats || (r.pages_data && r.pages_data['06'] && r.pages_data['06'].rows) || [];
        const t = stats.find(s => s.is_total);
        const d = ((t.next_week - t.this_week) / t.this_week * 100).toFixed(1);
        return `总人数下周较本周 ${d > 0 ? '+' : ''}${d}%, 超 30% 阈值`;
      }
    },
    {
      id: 'empty-coordination',
      level: 'blue',
      section: '12',
      check: r => {
        const c = r.coordination || (r.pages_data && r.pages_data['12'] && r.pages_data['12'].rows) || [];
        return c.every(x => !x.issue);
      },
      msg: () => '协调事宜表为空, 确认无待协调事项?'
    },
    {
      id: 'missing-owner',
      level: 'blue',
      section: '04',
      // v5.3: 责任人挂在主行上, 检查主行
      check: r => (r.work_done || []).some(mr => !mr.owner),
      msg: r => {
        const n = (r.work_done || []).filter(mr => !mr.owner).length;
        return `上周工作完成中有 ${n} 个事项组缺责任人`;
      }
    },
    {
      id: 'missing-task-text',
      level: 'blue',
      section: '04',
      // v5.3: 事项内容在 items 里, flatten 后判断
      check: r => flattenWorkDone(r.work_done).some(t => !t.task),
      msg: r => {
        const n = flattenWorkDone(r.work_done).filter(t => !t.task).length;
        return `上周工作完成中有 ${n} 个子项缺事项描述`;
      }
    },
    // v5 新增
    {
      id: 'field-missing-required',
      level: 'blue',
      section: '03',
      check: r => {
        const roster = r.roster || (r.pages_data && r.pages_data['03'] && r.pages_data['03'].rows) || [];
        return roster.some(p => p.role === '项目经理' && (!p.name || !p.phone));
      },
      msg: () => '项目经理姓名/电话缺失'
    }
  ];

  function evaluate(report) {
    return RULES.map(rule => {
      try {
        const hit = rule.check(report);
        return hit ? { id: rule.id, level: rule.level, section: rule.section, msg: rule.msg(report) } : null;
      } catch (e) { console.error('Rule error', rule.id, e); return null; }
    }).filter(Boolean);
  }

  global.Rules = { evaluate, detectAll: evaluate, RULES };
})(window);
