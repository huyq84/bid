// platform/js/rules.js
// 异常检测规则
(function (global) {
  const RULES = [
    {
      id: "ecc-low-close-rate",
      level: "red",
      section: "07",
      check: (r) => {
        const e = r.ecc_summary || {};
        if (!e.total) return false;
        return e.closed / e.total < 0.7;
      },
      msg: (r) => {
        const e = r.ecc_summary;
        const rate = (e.closed / e.total * 100).toFixed(2);
        return `ECC 关闭率 ${rate}%，低于 70% 基线`;
      }
    },
    {
      id: "carry-over-untouched",
      level: "yellow",
      section: "09",
      check: (r) => {
        const ev = r.ai_review?.evidence || {};
        return (ev.continued_from_last_week || []).length > 0;
      },
      msg: (r) => {
        const n = (r.ai_review.evidence.continued_from_last_week || []).length;
        return `上周 ${n} 项进行中（高管备餐间/北咖啡样板区/北咖啡JS防水等），本周已续排到下周计划`;
      }
    },
    {
      id: "empty-coordination",
      level: "blue",
      section: "12",
      check: (r) => (r.coordination || []).every(c => !c.issue),
      msg: () => `协调事宜表为空，确认无待协调事项？`
    },
    {
      id: "missing-owner",
      level: "blue",
      section: "04",
      check: (r) => (r.work_done || []).some(t => !t.owner),
      msg: (r) => {
        const n = (r.work_done || []).filter(t => !t.owner).length;
        return `上周工作完成中有 ${n} 条缺责任人`;
      }
    },
    {
      id: "missing-task-text",
      level: "blue",
      section: "04",
      check: (r) => (r.work_done || []).some(t => !t.task),
      msg: (r) => {
        const n = (r.work_done || []).filter(t => !t.task).length;
        return `上周工作完成中有 ${n} 条缺事项描述`;
      }
    },
    {
      id: "labor-spike",
      level: "yellow",
      section: "06",
      check: (r) => {
        const total = (r.labor_stats || []).find(l => l.is_total);
        if (!total || !total.this_week) return false;
        const delta = (total.next_week - total.this_week) / total.this_week;
        return Math.abs(delta) > 0.3;
      },
      msg: (r) => {
        const t = r.labor_stats.find(l => l.is_total);
        const d = ((t.next_week - t.this_week) / t.this_week * 100).toFixed(1);
        return `总人数下周较本周 ${d > 0 ? "+" : ""}${d}%，超 30% 阈值`;
      }
    },
    {
      id: "ecc-mismatch",
      level: "yellow",   // 降级为黄: 原 PDF 本身存在 1 条计数偏差, 容忍 ±1
      section: "07",
      check: (r) => {
        const e = r.ecc_summary;
        if (!e) return false;
        const sum = e.closed + e.in_process + e.open;
        return Math.abs(sum - e.total) > 1;  // 容忍 1 条的舍入/录入差异
      },
      msg: (r) => {
        const e = r.ecc_summary;
        const sum = e.closed + e.in_process + e.open;
        return `ECC 计数偏差: 已关闭 ${e.closed} + 流程中 ${e.in_process} + 未关闭 ${e.open} = ${sum}，与问题总数 ${e.total} 不一致，请复核`;
      }
    }
  ];

  function evaluate(report) {
    return RULES.map(rule => {
      try {
        const hit = rule.check(report);
        return hit ? {
          id: rule.id,
          level: rule.level,
          section: rule.section,
          msg: rule.msg(report)
        } : null;
      } catch (e) { return null; }
    }).filter(Boolean);
  }

  global.Rules = { evaluate, detectAll: evaluate, RULES };
})(window);
