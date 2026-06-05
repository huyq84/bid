// platform/js/llm.js
// Mock LLM 服务: 模拟 "语音/文字/附件 → 结构化数据" 抽取
(function (global) {
  // 工具函数: 模拟异步
  const wait = (ms) => new Promise(r => setTimeout(r, ms));

  // 词典
  const AREA_DICT = ["高管区","食堂区","南塔健身房","北塔健身房","南塔咖啡厅","北咖啡厅","南塔咖啡厅"];
  const OWNER_DICT = [
    "侯 帅","王 健","陈 冲","王亚广","鲍永春","袁永超",
    "李 欢","乔志广","李水旺","赵晨星","龙 方","徐诗怡","苏 尧",
    "郭建欣","薛智臣","王 迪","邓明伟","周建忠","李欣霖","孙攀岳",
    "赵国显","蔡丽华","肖自政"
  ];
  const PROGRESS_DICT = ["0%","25%","50%","75%","100%"];

  function pickArea(text) {
    for (const a of AREA_DICT) if (text.includes(a.replace("区","")) || text.includes(a)) return a;
    if (text.includes("高管") || text.includes("高管层")) return "高管区";
    if (text.includes("食堂")) return "食堂区";
    if (text.includes("咖啡")) return "南塔咖啡厅";
    if (text.includes("健身")) return "南塔健身房";
    return "高管区";
  }
  function pickOwner(text) {
    for (const o of OWNER_DICT) if (text.includes(o.replace(/\s/g,"")) || text.includes(o)) return o;
    return "鲍永春";
  }
  function pickProgress(text) {
    const m = text.match(/(\d{1,3})\s*[%％]/);
    if (m) {
      const v = parseInt(m[1]);
      const nearest = PROGRESS_DICT.map(p => parseInt(p)).sort((a,b) => Math.abs(a-v)-Math.abs(b-v))[0];
      return nearest + "%";
    }
    if (text.includes("完成") || text.includes("结束")) return "100%";
    if (text.includes("一半") || text.includes("过半")) return "50%";
    if (text.includes("开始") || text.includes("启动")) return "0%";
    if (text.includes("80") || text.includes("八成")) return "75%";
    if (text.includes("60") || text.includes("六成")) return "50%";
    return "100%";
  }
  function pickDeadline(text) {
    const m = text.match(/(\d{1,2})[月\.\-\/](\d{1,2})/);
    if (m) {
      const y = "2026-";
      const mm = m[1].padStart(2,"0");
      const dd = m[2].padStart(2,"0");
      return `${y}${mm}-${dd}`;
    }
    return "2026-05-24";
  }

  // 04: 上周工作完成 - 从自然语言抽取任务列表
  async function extractWorkDone(input) {
    await wait(800);
    // 简单切句 (中文句号/逗号/换行)
    const sentences = input.split(/[。；\n;]/).map(s => s.trim()).filter(s => s.length > 4);
    return sentences.map((s, i) => ({
      area: pickArea(s),
      task: s.replace(/^\d+[\.\、]\s*/, "").replace(/[,，。；;]/g, "").slice(0, 30),
      progress: pickProgress(s),
      owner: pickOwner(s),
      deadline: pickDeadline(s),
      _confidence: Mock.Random.float(0.7, 0.99).toFixed(2),
      _source: "llm"
    }));
  }

  // 09: 下周周计划 - 生成甘特草稿
  async function draftNextWeekPlan(input, lastWeek) {
    await wait(1200);
    const sentences = input.split(/[。；\n;]/).map(s => s.trim()).filter(s => s.length > 3);
    const items = sentences.length ? sentences : [
      "继续食堂二层天花封板",
      "高管一层地暖施工",
      "南塔咖啡厅天花龙骨排布"
    ];
    return items.slice(0, 15).map((s, i) => {
      const days = 5 + (i % 3);
      const progress = Array.from({length: 7}, (_, k) => k < days ? "fill" : "empty");
      return {
        seq: (lastWeek?.length || 0) + i + 1,
        area: pickArea(s),
        task: s.replace(/^\d+[\.\、]\s*/, "").slice(0, 28),
        days: days,
        progress: progress,
        labor: ["焊工2人","木工4人","瓦工3人","电工4人","油工6人","防水2人"][i % 6],
        material: Mock.Random.pick(["已到场","待到场","已下单"]),
        _confidence: Mock.Random.float(0.7, 0.99).toFixed(2)
      };
    });
  }

  // 08: 图纸深化抽取
  async function extractDesignDeepen(input) {
    await wait(700);
    const sentences = input.split(/[。；\n;]/).map(s => s.trim()).filter(s => s.length > 4);
    return sentences.map((s, i) => ({
      task: s.replace(/^\d+[\.\、]\s*/, "").slice(0, 60),
      owner: pickOwner(s),
      status: s.includes("完") || s.includes("签") ? "已完成" : "进行中"
    }));
  }

  // 06: 人员统计 - 从花名册+签到生成
  async function computeLabor(roster, manualAdjust) {
    await wait(500);
    // mock: 沿用 seed, 微调
    return roster;  // v1 不重算
  }

  // 附件解析 mock: 假装是个 PDF/Excel
  async function parseAttachment(file) {
    await wait(1500);
    if (!file) return [];
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    if (ext === "pdf" || ext === "docx" || ext === "doc") {
      // 返回工作完成 4-7 条
      return [
        {area:"高管区",task:"一层高管办公室龙骨吊顶",progress:"100%",owner:"鲍永春",deadline:"2026-05-15"},
        {area:"高管区",task:"二层房间内地暖盘管",progress:"100%",owner:"鲍永春",deadline:"2026-05-15"},
        {area:"食堂区",task:"一层天花腻子",progress:"70%",owner:"王亚广",deadline:"2026-05-20"},
        {area:"食堂区",task:"地下室天花吊顶",progress:"40%",owner:"鲍永春",deadline:"2026-05-25"},
        {area:"南塔咖啡厅",task:"天花吊顶龙骨排布",progress:"30%",owner:"乔志广",deadline:"2026-05-22"}
      ];
    }
    if (ext === "xlsx" || ext === "xls" || ext === "csv") {
      return [
        {type:"5S小队",this_week:15,next_week:16},
        {type:"电工",this_week:5,next_week:5},
        {type:"木工",this_week:87,next_week:90}
      ];
    }
    if (["png","jpg","jpeg"].includes(ext)) {
      // 图片附件视为 ECC 截图
      return {type:"ecc_screenshot", file};
    }
    return [];
  }

  // 语音输入 mock: 调用浏览器 Web Speech API 真实识别; 没有则 mock 一段
  async function speechToText() {
    if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) {
      await wait(1500);
      return Mock.Random.pick([
        "本周食堂天花腻子完工 100%，下周一做面漆。鲍永春负责。一层高管办公室龙骨吊顶完成 100%，李欢负责。",
        "高管备餐间铝扣板吊顶完成 50%，木工 2 人在做，5 月 22 号完成。北塔咖啡样板区隔墙龙骨施工中，木工 4 人。",
        "这周完成了地下室天花吊顶，木工 30 人连续作业 7 天。下周继续做地下室天花照明配管，电工 14 人。"
      ]);
    }
    return new Promise((resolve) => {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      const r = new SR();
      r.lang = "zh-CN";
      r.continuous = false;
      r.interimResults = false;
      r.onresult = (e) => resolve(e.results[0][0].transcript);
      r.onerror = () => resolve("");
      r.onend = () => resolve("");
      r.start();
    });
  }

  global.LLM = { extractWorkDone, draftNextWeekPlan, extractDesignDeepen, computeLabor, parseAttachment, speechToText };
})(window);
