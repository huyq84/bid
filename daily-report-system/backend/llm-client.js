// ============================================================
// llm-client.js - MiniMax LLM 客户端
// 协议：Anthropic 兼容（baseUrl 形如 https://xxx/anthropic/v1）
//   - 端点：POST /v1/messages
//   - 鉴权：x-api-key header + anthropic-version
//   - 请求：{model, system, messages, max_tokens, temperature}
//   - 响应：{content: [{type: 'text', text: '...'}], ...}
// ============================================================

import { executeTool, getToolDescriptions } from './llm-tools.js';

export class MinMaxClient {
  constructor(config) {
    this.apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl || '').replace(/\/+$/, ''); // 去尾斜杠
    this.model = config.model;
    this.maxTokens = config.maxTokens || 4096;
    this.temperature = config.temperature ?? 0.5;
    this.groupId = config.groupId;
    this.timeoutMs = 30000; // 30 秒超时
  }

  // 核心：调用 chat
  // params: { system, messages, maxTokens, temperature }
  // 自动处理：网络错误重试 2 次 + 空响应重试 2 次
  async chat({ system, messages, maxTokens, temperature }) {
    if (!this.apiKey) {
      throw new Error('MINIMAX_API_KEY 未设置');
    }
    if (!this.baseUrl) {
      throw new Error('MINIMAX_BASE_URL 未设置');
    }

    const maxAttempts = 3;
    let lastError = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const reply = await this._chatOnce({ system, messages, maxTokens, temperature });
        if (reply) return reply;  // 成功拿到内容

        // 空响应，重试（加随机扰动打破缓存）
        console.warn(`[LLM] 第 ${attempt} 次返回空内容${attempt < maxAttempts ? '，重试中...' : '，放弃'}`);
        lastError = new Error('LLM 连续返回空内容');
        if (attempt < maxAttempts) {
          await this._sleep(500 + Math.random() * 500);
          // 在最后一条 user 消息后加一个换行+空格打破缓存键
          if (messages.length > 0) {
            const last = messages[messages.length - 1];
            if (last.role === 'user') {
              last.content = last.content + '\n\n ';
            }
          }
        }
      } catch (e) {
        console.warn(`[LLM] 第 ${attempt} 次请求失败: ${e.message}`);
        lastError = e;
        if (attempt < maxAttempts) {
          await this._sleep(1000 + Math.random() * 1000);
        }
      }
    }
    throw lastError || new Error('LLM 调用失败');
  }

  // 单次请求
  async _chatOnce({ system, messages, maxTokens, temperature }) {
    const url = this.baseUrl.endsWith('/v1')
      ? `${this.baseUrl}/messages`
      : `${this.baseUrl}/v1/messages`;

    const body = {
      model: this.model,
      max_tokens: maxTokens || this.maxTokens,
      temperature: temperature ?? this.temperature,
      messages: messages
    };
    if (system) body.system = system;

    const headers = {
      'Content-Type': 'application/json',
      'x-api-key': this.apiKey,
      'anthropic-version': '2023-06-01'
    };
    if (this.groupId) {
      headers['X-Group-Id'] = this.groupId;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    let response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal
      });
    } catch (e) {
      clearTimeout(timeoutId);
      if (e.name === 'AbortError') {
        throw new Error(`LLM 请求超时（${this.timeoutMs / 1000}秒）`);
      }
      throw new Error(`LLM 网络错误: ${e.message}`);
    }
    clearTimeout(timeoutId);

    const text = await response.text();
    if (!response.ok) {
      throw new Error(`LLM 返回 ${response.status}: ${text.slice(0, 300)}`);
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      throw new Error(`LLM 响应不是 JSON: ${text.slice(0, 200)}`);
    }

    // 提取文本
    const content = data.content || [];
    const reply = content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('\n')
      .trim();

    if (!reply) {
      // 调试用：把整个响应吐出来
      console.warn('[LLM] 响应:', JSON.stringify(data).slice(0, 500));
      return null;  // 返回 null 让 chat() 决定是否重试
    }
    return reply;
  }

  _sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  // 业务封装 1: 语音文本解析
  async parseVoice({ text, projectId, areas = [], workers = [], plans = [] }) {
    const system = `你是一个施工现场日报系统的结构化解析助手。
你的任务：把施工人员口述的日报内容解析成结构化数据。

【严格输出 JSON 规则】只输出一个 JSON 对象，不要输出 JSON 以外的任何内容（包括 \`\`\` 标记、说明、思考过程）。

【区域识别规则】这是最重要的：
1. 优先从【区域列表】里选最匹配的，输出 \`areaId\`
2. 如果口述里出现的区域名称在【区域列表】里找不到（例如 "VIP 接待室" 列表里没有），则：
   - 仍然输出 \`areaId\`，但设为空字符串 ""
   - 同时输出 \`areaName\`，把识别出的新区域名填进去
3. 如果完全没提到区域，areaId 和 areaName 都留空

【计划匹配规则】从【计划列表】中匹配最符合的计划：
1. 根据口述中的任务名、区域、施工位置等与计划的任务名/区域进行匹配
2. 如果找到高度匹配的计划，输出对应的 \`planId\`
3. 如果无法匹配（计划外工作、描述不清晰等），\`planId\` 留空字符串
4. 绝不允许"凑数"：不确定时不要随便挑一个 ID

【输出格式】
{
  "type": "progress" | "material" | "safety" | "coordination" | "attendance" | "issue" | "drawing",
  "areaId": "区域ID（从列表选，找不到则空字符串）",
  "areaName": "如果识别到列表外的区域名，填这里；否则空字符串",
  "planId": "匹配的计划ID（从计划列表选，无法匹配则空字符串）",
  "completionType": "planned" | "unplanned",
  "buildingNo": "楼栋编号（如1号楼、2栋），无法提取留空",
  "floorNo": "楼层（如3层、5F），无法提取留空",
  "laborRequirements": [
    { "trade": "工种名称（如木工、电工）", "count": 人数（整数） }
  ],
  "payload": {
    "taskName": "任务名称（简洁，3-12 字）",
    "owner": "负责人姓名（优先从工人列表里选；如果口述中出现"负责人刘""张师傅负责"等明确姓名但不在列表中，也直接提取，不要留空）",
    "progress": "进度百分比（格式：80%），无法提取留空",
    "headcount": 总人数（各工种人数之和，不含负责人；可据laborRequirements求和，无法提取填 0）,
    "status": "进行中" | "已完成" | "未开始" | "暂停"
  },
  "confidence": 0~1 之间的数字
}

【注意事项】
- 工人名字用全名
- 进度只取整数百分比
- 不要捏造区域、工人或计划
- completionType：提到"计划内"或未说明 → "planned"；提到"计划外""新增""临时""突发" → "unplanned"
- laborRequirements：当 type 为 progress 时，尽可能提取工种×人数；无法提取则留空数组
- planId：只在明确匹配到计划列表中的某项时填写，不确定就留空
- owner：口述中常见"负责人XXX"或"XXX负责"句式，"负责人刘"中"刘"就是负责人姓名，提取"刘"即可
- type 选择规则：口述出现"图纸深化/深化设计/深化图/节点图/立面图/幕墙节点/打样/样板段/旋转楼梯/岩板/木饰面清单/弧角打样"等关键词 → "drawing"；口述提及"安全检查/隐患/安全帽"等 → "safety"；口述提及"材料进场/规格/数量" → "material"；口述是讨论性质"碰了一下/与XX沟通" → "coordination"；口述是考勤"几人到岗/打卡" → "attendance"；其他默认 "progress"`;

    let userMsg = `【项目】${projectId}
【区域列表】
${areas.map(a => `- ${a.id}: ${a.name} (${a.floor || ''}, 负责人 ${a.manager || ''})`).join('\n')}

【工人列表】
${workers.map(w => `- ${w.id}: ${w.name} (${w.role}, ${w.team})`).join('\n')}

【计划列表】
${plans.map(p => `- ${p.id}: ${p.taskName || p.process}（区域: ${p.areaId || p.area || '-'}, 楼栋: ${p.buildingNo || '-'}, 楼层: ${p.floorNo || '-'}, 进度: ${p.progress || '0%'}）`).join('\n')}

【口述内容】
${text}

请输出 JSON：`;

    const raw = await this.chat({ system, messages: [{ role: 'user', content: userMsg }], temperature: 0.3 });

    return this._parseJsonSafe(raw, text, projectId, areas, workers, 'voice');
  }

  // 业务封装 2: 照片解析
  async parsePhoto({ imageBase64, caption, projectId, areas = [], type = 'progress', plans = [] }) {
    const system = `你是施工现场照片识别助手。
根据照片内容和用户提供的语音/文字描述，判断照片所属区域、推测施工任务、负责人、进度等信息。

【严格输出 JSON 规则】只输出一个 JSON 对象，不要输出 JSON 以外的任何内容（包括 \`\`\` 标记）。

【区域识别规则】
1. 优先从【区域列表】里选最匹配的，输出 \`areaId\`
2. 如果照片/描述里的区域在【区域列表】里找不到，则：
   - \`areaId\` 设为空字符串 ""
   - 同时输出 \`areaName\`，把识别到的新区域名填进去
3. 如果完全无法判断区域，areaId 和 areaName 都留空
4. 绝不允许"凑数"：找不到匹配时不要随便挑一个 ID 充数

【计划匹配规则】从【计划列表】中匹配最符合的计划：
1. 根据任务名、区域、施工位置等与计划匹配
2. 如果找到高度匹配的计划，输出对应的 \`planId\`
3. 如果无法匹配，\`planId\` 留空字符串
4. 绝不允许"凑数"

【输出格式】
{
  "areaId": "区域ID（从列表选，找不到则空字符串）",
  "areaName": "如果识别到列表外的区域名，填这里；否则空字符串",
  "planId": "匹配的计划ID（无法匹配则空字符串）",
  "caption": "照片描述（10-30 字，说明看到什么）",
  "taskHint": "推测的施工任务（如天花吊顶龙骨安装）",
  "workType": "木工" | "电工" | "瓦工" | "油漆工" | "焊工" | "其他",
  "completionType": "planned" | "unplanned",
  "buildingNo": "楼栋编号（如1号楼），无法提取留空",
  "floorNo": "楼层（如3层），无法提取留空",
  "laborRequirements": [
    { "trade": "工种名称", "count": 人数 }
  ],
  "payload": {
    "taskName": "任务名称",
    "owner": "负责人姓名（从描述中提取，如"负责人刘"则提取"刘"）",
    "progress": "进度百分比（如50%）",
    "headcount": 人数（整数）
  },
  "confidence": 0~1
}`;

    // 构建消息内容
    const userContent = [];
    
    let textMsg = `【项目】${projectId}\n`;
    textMsg += `【区域列表】\n${areas.map(a => `- ${a.id}: ${a.name}`).join('\n')}\n\n`;
    textMsg += `【计划列表】\n${plans.map(p => `- ${p.id}: ${p.taskName || p.process}（区域: ${p.areaId || p.area || '-'}, 楼栋: ${p.buildingNo || '-'}, 楼层: ${p.floorNo || '-'}, 进度: ${p.progress || '0%'}）`).join('\n')}\n\n`;
    if (caption) {
      textMsg += `【用户语音/文字描述】\n${caption}\n\n`;
    } else {
      textMsg += `【用户语音/文字描述】\n（无，请根据图片内容推断）\n\n`;
    }
    textMsg += `请结合图片和描述，识别施工内容并输出 JSON：`;
    
    userContent.push({ type: 'text', text: textMsg });
    
    // 添加图片（如果有 base64 数据）
    if (imageBase64 && imageBase64.trim()) {
      userContent.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'image/jpeg',
          data: imageBase64.trim()
        }
      });
    }

    const raw = await this.chat({ system, messages: [{ role: 'user', content: userContent }], temperature: 0.3 });

    return this._parseJsonSafe(raw, caption || '', projectId, areas, [], 'photo');
  }

  // 业务封装 3: 周报聚合
  // 输入: { projectId, projectName, client, weekStart, weekEnd, events, issues, areas }
  // 输出: { overview, progressByArea, issuesSummary, safetyStats, materialStats, nextWeekPlan }
  async aggregateWeekly({ projectName, client, weekStart, weekEnd, events, issues, areas }) {
    const system = `你是施工周报智能聚合助手。
你的任务：把一周的日报事件和事项聚合成结构化周报初稿。

要求：
1. 数字必须保真（劳动力人数、进度百分比、ECC 编号等不能改）
2. 按区域汇总进度
3. 分类汇总事项（质量/安全/协调/ECC）
4. 生成下周计划（基于本周未完成事项和推进逻辑）

严格输出 JSON（不要输出其他内容）：
{
  "overview": "本周概述（150-300 字，涵盖整体推进、关键节点、突出问题）",
  "progressByArea": [
    { "areaName": "区域名", "manager": "负责人", "tasks": "本周任务摘要（80-150 字）" }
  ],
  "issuesSummary": {
    "total": 总数,
    "open": 待处理数,
    "inProgress": 处理中数,
    "closed": 已闭环数,
    "details": "事项清单（每条：类型+标题+状态）"
  },
  "safetyStats": {
    "checkCount": 安全检查次数,
    "issueCount": 隐患条数,
    "summary": "安全管理小节文字（50-100 字）"
  },
  "materialStats": {
    "inboundCount": 进场条数,
    "summary": "材料管理小节文字（50-100 字）"
  },
  "nextWeekPlan": ["计划1", "计划2", "计划3", "计划4"]
}`;

    // 简化事件数据传给 LLM
    const eventsCompact = events.map(e => {
      const area = areas.find(a => a.id === e.areaId);
      return {
        date: e.date, time: e.time,
        type: e.type, area: area?.name || e.areaId,
        payload: e.payload
      };
    });

    const issuesCompact = issues.map(i => {
      const area = areas.find(a => a.id === i.areaId);
      return {
        type: i.type, title: i.title, area: area?.name || i.areaId,
        status: i.status, owner: i.owner, deadline: i.deadline
      };
    });

    const userMsg = `【项目】${projectName}
【甲方】${client}
【周期】${weekStart} ~ ${weekEnd}

【本周事件（共 ${events.length} 条）】
${JSON.stringify(eventsCompact, null, 2)}

【本周事项（共 ${issues.length} 条）】
${JSON.stringify(issuesCompact, null, 2)}

请输出 JSON：`;

    const raw = await this.chat({ system, messages: [{ role: 'user', content: userMsg }], temperature: 0.5, maxTokens: 4096 });

    return this._parseJsonSafe(raw, '', '', areas, [], 'weekly');
  }

  // 文本优化（结构化补全）
  async optimizeText({ text, projectId, areas = [], plans = [] }) {
    const areaList = areas.map(a => a.name).join('、') || '无';
    const planList = plans.map(p => (p.taskName || p.process)).filter(Boolean).join('、') || '无';

    const system = `你是一个施工现场日报的文本结构化助手。
你的任务：把用户输入的杂乱日报内容，按以下维度整理成清晰的结构化文本，补全缺失的信息。

【结构化维度】
1. 施工位置：楼栋号（如1号楼）、楼层（如F1）、区域名称
2. 工序/任务：具体施工内容（如钢筋绑扎、天花吊顶安装）
3. 负责人：谁负责这项作业
4. 当前进度：百分比
5. 劳动力：工种×人数（如木工2人、电工1人）
6. 完成类型：计划内/计划外
7. 其他补充：照片描述、备注等

【优化规则】
1. 从输入中提取上述维度的信息，按固定格式输出
2. 输入中**缺失**的维度，用【待补充】明确标出
3. 输入中**有歧义**的信息，用【需确认】标出并说明问题
4. 语言专业化：口语→专业术语（搞→进行，弄好→完成）
5. 删除冗余：去掉语气词和重复内容
6. 格式统一：每个维度占一行，保持一致的顺序

【输出格式示例】
施工位置：1号楼 F1 东区住宅
工序：钢筋绑扎
负责人：刘
进度：90%
劳动力：木工2人、电工1人
完成类型：计划内
【待补充】无

如果缺失信息：
施工位置：【待补充】请填写楼栋和区域
工序：钢筋绑扎
负责人：【待补充】请填写负责人姓名
进度：90%
劳动力：木工2人
完成类型：【待补充】请确认是计划内还是计划外

【参考信息】
项目可用区域：${areaList}
项目可用计划：${planList}

请直接输出优化后的文本，不要输出其他内容。`;

    const userMsg = `请整理并补全以下日报内容：

${text}`;

    const raw = await this.chat({ system, messages: [{ role: 'user', content: userMsg }], temperature: 0.3, maxTokens: 1024 });

    return {
      optimizedText: raw.trim(),
      confidence: 0.9
    };
  }

  // 内部：JSON 安全解析（处理 LLM 可能夹带 markdown 代码块的情况）
  _parseJsonSafe(raw, fallbackText, projectId, areas, workers, kind) {
    // 去除 markdown 代码块包裹
    let cleaned = raw.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/, '');
    }
    // 提取第一个 { ... } 块
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) cleaned = match[0];

    try {
      const obj = JSON.parse(cleaned);
      // 校验必要字段
      if (kind === 'voice' || kind === 'photo') {
        // 严格校验 areaId：宁可让它为 null/nullish 走前端"新区域"询问，
        // 也不要被静默改写成 areas[0]，那样会掩盖 LLM 的"凑数"撒谎。
        //   1) LLM 没给 ID（包括空字符串、null）→ 保持 nullish
        //   2) LLM 给了 ID 但不在列表 → 置 null
        //   3) LLM 给了合法 ID，但 areaName 对不上（典型撒谎：ID=A1, areaName="VIP区"）→ 置 null
        //   4) areaId 已为合法 ID 且 areaName 匹配（或 areaName 为空）→ 保留
        const rawId = obj.areaId;
        const hasId = rawId && String(rawId).trim() !== '';
        const matched = hasId ? areas.find(a => a.id === rawId) : null;
        const nameConflict =
          obj.areaName && matched && obj.areaName !== matched.name;
        if (!matched || nameConflict) {
          obj.areaId = null;
        }
        if (!obj.payload) obj.payload = {};
        if (typeof obj.confidence !== 'number') obj.confidence = 0.8;
      }
      return obj;
    } catch (e) {
      throw new Error(`LLM 返回的不是合法 JSON: ${e.message}\n原文: ${raw.slice(0, 200)}`);
    }
  }

  // ==================== ReAct 循环对话 ====================
  async chatWithContext({ message, history = [], contextText = '', permLevel = 'confirm', projectId, date }) {
    const pi = projectId || 'baicaoyuan';
    const dt = date || new Date().toISOString().slice(0, 10);

    const permHint = permLevel === 'allow'
      ? '当前权限=直接操作：所有操作（含敏感操作）都会被自动执行，不需要用户授权。但注意：仍需在回复末尾输出 actions JSON 代码块，否则操作不会被执行。'
      : permLevel === 'strict'
      ? '当前权限=禁止危险操作：敏感操作（update/delete/close 等）会被拒绝。只生成安全操作。'
      : '当前权限=需授权：敏感操作需要用户点击 ✅ 授权卡片才执行。请列出待授权操作告知用户。';

    const systemMsg = `你是一个施工现场日报系统的 AI 工程助手。

## 核心原则
- 不确定用户意图时，**先用工具查数据**，不要假设用户要录入
- "今天完成的工作"、"做了啥"、"有哪些"等是查询，不是录入
- 用户提到具体任务+进度/人数时才是录入（如"木工完成大堂龙骨 80%"）
- 先思考再行动：**宁可多查一步，不要贸然操作**

## 可用工具（优先用工具查数据，再做决定）
${getToolDescriptions()}

工具用法示例：
- 用户问"今天完成的工作都完善吗" → 先调 comparePlansVsActuals 查对比数据，再回复
- 用户问"今天做了啥" → 先调 queryEvents 查今日事件，再回复
- 用户问"今日计划有什么" → 先调 queryPlans 查今日计划，再回复
- 用户说"木工完成80%" → 不需要查数据，直接生成 createEvent

## 可用操作（最终输出给用户的 actions）
安全操作（自动执行）：
- createEvent: 录入今日完成。data: { type(必填), taskName(必填), areaId, areaName, planId, owner, progress, headcount, laborRequirements, completionType(planned|unplanned), buildingNo, floorNo, note }
- createIssue: 录协调事宜。data: { title(必填), type, areaId, priority, proposeDept, cooperateDept, owner, description }
- createAttendance: 签到。data: { records: { managerId, present, reason } }
- confirmEvent: 确认事件。data: { eventId }

敏感操作（需授权）：
- updateEvent: data: { eventId(必填), taskName, owner, progress, headcount, laborRequirements, type, status, areaId, completionType, buildingNo, floorNo }
- deleteEvent: data: { eventId(必填) }
- batchDelete: data: { date(必填YYYY-MM-DD), 至少一个其他条件: timeFrom/timeTo/status/type/planId/areaId/taskNameContains/ids }
- updateIssue: data: { issueId(必填), title, status, priority, owner, description }
- closeIssue: data: { issueId(必填) }
- deleteIssue: data: { issueId(必填) }
- updatePlan: data: { planId(必填), areaId, areaName, owner, progress, buildingNo, floorNo, laborRequirements, taskName, status }

字段约定：始终用驼峰（taskName, areaId, laborRequirements, completionType, buildingNo, floorNo, headcount, proposeDept, cooperateDept）

## 项目数据
${contextText}

## 权限
${permHint}

## 回复格式（非常重要，请严格遵守）
**情况 1 — 需要查询数据时：** 只输出下面这一行 JSON，不要加其他文字：
{"tool":"工具名","params":{参数}}
示例：{"tool":"queryEvents","params":{"date":"2026-06-17"}}

**情况 2 — 已有足够信息回复用户时：** 直接输出回复内容（纯文本或 Markdown），可以任意包含【】「」"" 等符号。

**⚠️ 如果执行操作，必须在回复末尾附加 JSON 代码块，否则操作无效：**
\`\`\`json
{"actions":[{"type":"createEvent","data":{"taskName":"大堂龙骨","progress":"80%"}}]}
\`\`\`

**规则（必须遵守）：**
- 任何操作都必须在回复末尾输出 actions JSON 代码块
- **不能只描述操作而不输出 actions JSON**。只描述操作但不输出 JSON = 操作不会执行。系统只通过 JSON 代码块中的 actions 来执行操作，回复里的文字描述仅供用户阅读，不会触发任何实际操作。
- 一个回复可以包含多个 actions（如同时录木工+电工）
- actions 里不需要的字段不传
- 不需要操作时输出纯文本，不要 JSON 代码块
- 先调工具查数据，看到结果后再决定下一步
- 缺必填字段时反问用户（如没说明 taskName，反问"请问要记录什么任务？"）
- 可选字段缺失直接留空，不反问
- 不要输出任何图片引用，用纯文本或 Markdown 表格
- **回复内容里不要有思考过程**，思考过程不输出给用户。回复要说人话，像工友之间交流一样自然。
`;

    const messages = this._buildMessages(history, message);

    // ReAct 循环
    const maxIters = 6;
    for (let i = 0; i < maxIters; i++) {
      const body = await this._call(systemMsg, messages);
      const text = body?.content?.[0]?.text || '';
      if (!text) return { reply: '抱歉，暂时无法处理，请重试。', actions: [] };

      // 1) 尝试提取工具调用 JSON：{"tool":"xxx","params":{...}}
      const toolCall = this._extractToolCall(text);
      if (toolCall) {
        try {
          const result = await executeTool(toolCall.tool, toolCall.params || {}, { projectId: pi, date: dt });
          messages.push({ role: 'assistant', content: text });
          messages.push({ role: 'user', content: `工具 "${toolCall.tool}" 返回：\n${JSON.stringify(result, null, 2)}\n\n根据这个结果继续。` });
        } catch (e) {
          messages.push({ role: 'assistant', content: text });
          messages.push({ role: 'user', content: `工具 "${toolCall.tool}" 执行失败: ${e.message}。请跳过继续。` });
        }
        continue;
      }

      // 2) 最终回复：文本 + 可选的 actions JSON 块
      const actions = this._extractActions(text);
      const reply = actions.length > 0 ? text.replace(/```json[\s\S]*?```/, '').trim() : text;
      return { reply, actions };
    }

    return { reply: '抱歉，处理步骤太多无法完成，请简化问题。', actions: [] };
  }

  _buildMessages(history, userMessage) {
    const msgs = (history || []).map(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: typeof m.content === 'string' ? m.content : (m.content?.text || '')
    }));
    msgs.push({ role: 'user', content: userMessage });
    return msgs;
  }

  // 提取工具调用 JSON：{"tool":"xxx","params":{...}}
  _extractToolCall(text) {
    if (!text) return null;

    // 1) 尝试整个文本就是 JSON（标准情况）
    {
      let trimmed = text.trim();
      if (trimmed.startsWith('```')) {
        trimmed = trimmed.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/, '');
      }
      const fullMatch = trimmed.match(/^\{[\s\S]*\}$/);
      if (fullMatch) {
        try {
          const obj = JSON.parse(fullMatch[0]);
          if (obj && typeof obj.tool === 'string') {
            return { tool: obj.tool, params: obj.params || {} };
          }
        } catch {}
      }
    }

    // 2) 从文本中搜索 tool 相关 JSON（LLM 可能在中文前后缀中嵌入工具调用）
    {
      // 先找 ```json 或 ``` 包裹的块
      const codeMatch = text.match(/```(?:json)?\s*(\{[\s\S]*?"tool"[\s\S]*?\})\s*```/);
      if (codeMatch) {
        try {
          const obj = JSON.parse(codeMatch[1]);
          if (obj && typeof obj.tool === 'string') {
            return { tool: obj.tool, params: obj.params || {} };
          }
        } catch {}
      }
      // 逐行搜索 {"tool":"xxx",...} 形式的 JSON
      const lines = text.split('\n').filter(l => l.trim());
      for (const line of lines) {
        try {
          const obj = JSON.parse(line.trim());
          if (obj && typeof obj.tool === 'string') {
            return { tool: obj.tool, params: obj.params || {} };
          }
        } catch {}
      }
      // 全文搜索 {"tool" 开头的 JSON 子串（同一行内前有中文）
      const inlineMatch = text.match(/\{"tool"\s*:\s*"[^"]+"[\s\S]*?\}\s*/);
      if (inlineMatch) {
        try {
          const obj = JSON.parse(inlineMatch[0].trim());
          if (obj && typeof obj.tool === 'string') {
            return { tool: obj.tool, params: obj.params || {} };
          }
        } catch {}
      }
    }

    return null;
  }

  // 从回复文本中提取 ```json\n{...}\n``` 块里的 actions
  _extractActions(text) {
    if (!text) return [];
    const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (!match) return [];
    try {
      const parsed = JSON.parse(match[1].trim());
      return Array.isArray(parsed.actions) ? parsed.actions : [];
    } catch {
      return [];
    }
  }

  async _call(system, messages) {
    let lastErr;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        if (attempt > 0) await new Promise(r => setTimeout(r, 1000 * attempt));
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);
        const body = {
          model: this.model,
          system,
          messages,
          max_tokens: this.maxTokens,
          temperature: this.temperature
        };
        if (this.groupId) body.metadata = { group_id: this.groupId };
        const apiUrl = this.baseUrl.endsWith('/v1') ? `${this.baseUrl}/messages` : `${this.baseUrl}/v1/messages`;
        const res = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.apiKey,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify(body)
        });
        clearTimeout(timer);
        if (!res.ok) {
          const errText = await res.text().catch(() => '');
          lastErr = new Error(`HTTP ${res.status}: ${errText.slice(0, 200)}`);
          if (res.status < 500) break;
          continue;
        }
        const data = await res.json();
        const text = data?.content?.[0]?.text;
        if (text) return data;
        lastErr = new Error('空响应');
        continue;
      } catch (e) {
        lastErr = e;
        if (e.name === 'AbortError') break;
      }
    }
    throw lastErr || new Error('LLM 调用失败');
  }
}
