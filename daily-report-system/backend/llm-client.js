// ============================================================
// llm-client.js - MiniMax LLM 客户端
// 协议：Anthropic 兼容（baseUrl 形如 https://xxx/anthropic/v1）
//   - 端点：POST /v1/messages
//   - 鉴权：x-api-key header + anthropic-version
//   - 请求：{model, system, messages, max_tokens, temperature}
//   - 响应：{content: [{type: 'text', text: '...'}], ...}
// ============================================================

import { executeTool, TOOLS as REGISTERED_TOOLS } from './llm-tools.js';
import { createMemory, getMemorySummary, recordQuery, recordAction } from './chat-memory.js';

export class MinMaxClient {
  constructor(config) {
    this.apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl || '').replace(/\/+$/, ''); // 去尾斜杠
    this.model = config.model;
    this.maxTokens = config.maxTokens || 4096;
    this.temperature = config.temperature ?? 0.5;
    this.groupId = config.groupId;
    this.timeoutMs = 30000; // 30 秒超时
    // provider 类型：anthropic（MiniMax 等）或 openai（大多数第三方兼容平台）
    this.provider = (config.provider || 'anthropic').toLowerCase();
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
    // Anthropic 专用端点
    if (this.provider === 'anthropic') {
      return this._chatOnceAnthropic({ system, messages, maxTokens, temperature });
    }
    // OpenAI 兼容端点
    return this._chatOnceOpenAI({ system, messages, maxTokens, temperature });
  }

  async _chatOnceAnthropic({ system, messages, maxTokens, temperature }) {
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

    const content = data.content || [];
    const reply = content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('\n')
      .trim();

    if (!reply) {
      console.warn('[LLM] 响应:', JSON.stringify(data).slice(0, 500));
      return null;
    }
    return reply;
  }

  async _chatOnceOpenAI({ system, messages, maxTokens, temperature }) {
    const url = this.baseUrl.endsWith('/v1')
      ? `${this.baseUrl}/chat/completions`
      : `${this.baseUrl}/v1/chat/completions`;

    const body = {
      model: this.model,
      max_tokens: maxTokens || this.maxTokens,
      temperature: temperature ?? this.temperature,
      messages: messages
    };

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + this.apiKey
    };

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

    const choice = data?.choices?.[0]?.message;
    if (!choice) return null;
    return choice.content || '';
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

  // ==================== 解析 LLM 声明的剩余任务 ====================
  _extractRemainingItems(text) {
    if (!text) return null;
    const match = text.match(/<!--\s*REMAINING:\s*(\{[\s\S]*?\})\s*-->/);
    if (!match) return null;
    try {
      return JSON.parse(match[1].trim());
    } catch {
      return null;
    }
  }

  // ==================== ReAct 循环对话 ====================
  async chatWithContext({ message, history = [], contextText = '', permLevel = 'confirm', maxIters, projectId, date }) {
    const pi = projectId || 'baicaoyuan';
    const dt = date || new Date().toISOString().slice(0, 10);

    const permHint = permLevel === 'allow'
      ? '当前权限=直接操作：所有操作（含敏感操作）都会被自动执行，不需要用户授权。但注意：仍需在回复末尾输出 actions JSON 代码块，否则操作不会被执行。'
      : permLevel === 'strict'
      ? '当前权限=禁止危险操作：敏感操作（update/delete/close 等）会被拒绝。只生成安全操作。'
      : '当前权限=需授权：敏感操作需要用户点击 ✅ 授权卡片才执行。请列出待授权操作告知用户。';

    let systemMsg = `你是施工日报系统的 AI 助手，**替代人工录入、查询、修改、删除**所有计划/事件/协调/ECC/签到/图纸深化等业务数据。

【剩余任务声明规则】当所有工具调用完成（没有更多 tool_use）时，必须判断是否还有未完成任务。在回复末尾追加一段声明，系统不会显示给用户：
- 还有任务未完成：\`<!-- REMAINING: {"hasMore":true,"remainingItems":["任务A","任务B"]} -->\`
- 全部完成：\`<!-- REMAINING: {"hasMore":false} -->\`
这个声明根据你的判断来写，不依赖任何外部数据。如果你不知道自己是否还有任务，那就输出 hasMore=false。

# 🔴 硬规则（违反任意一条 = 任务失败）

1. **必须用 tool_use 调用工具**。在文字里说"已创建/已删除/已更新"≠ 真的执行了。只有 \`tool_use\` 块才是真的。
2. **禁止"用 markdown 表格假装在调工具"**。你说"已创建 P123"但实际没调 createPlan → 用户看不到 → 任务失败。
3. **禁止编造 ID**。"已创建/已删除"必须在回复里引用 tool_result 返回的**真实 ID**（如 P1781831xxxxxx、E1781xxxxxxx、I007 等）。编造 ID（如 P1、P2、test）→ 任务失败。
4. **禁止"问问题而不动手"**。用户说"建一条计划"，即使你缺字段（负责人、工种），也**直接调 createPlan 工具**，可选字段留空让系统接受。**不要在文字里反问**——工友之间不互相推诿。
4a. **关联计划时，字段会自动补全**。createEvent 传了 planId 后，后端会自动从该计划补全 taskName/areaId/owner/buildingNo/floorNo/progress/laborRequirements——你不必再手动查 queryPlans。只需告诉用户"完成""100%"等状态改变即可。如果你明确知道不同值（如换负责人），才显式传入覆盖。
4c. **持续执行直到完成，不要中途停**。用户说"完成所有计划/补齐所有事件"这类任务时：调完 comparePlansVsActuals / getStats / queryPlans 后看到 pending（未完成计划）> 0，**必须接着调 createEvent 把它们逐个完成**。每完成一个再调一次 comparePlansVsActuals 看是否还有 pending，直到 pending.length === 0 才算完成。**不要只调一次诊断工具就停**——这会被视为"未完成任务"，系统会强制你继续。
4b. **需要自查/复查时，直接调 query 工具**。不要说"我先查一下"、"需要确认"等文字——直接调 queryPlans/queryEvents 等工具拿到真实数据，基于结果继续操作。
5. **缺必填字段时**才反问：必填字段 = taskName（建 plan）/ type+taskName（建 event）/ title（建 issue）。其它字段缺失都直接留空。
6. **删除/批量删除必须先 dryRun=true**。先告诉用户"将删除 N 条"，再调 dryRun=false + forceDelete=true。
7. **禁止承认"做不到"**。你拥有 createPlan / updatePlan / deletePlan / deletePlansByQuery / createEvent / createIssue / updateIssue / deleteIssue / closeIssue / deleteEvent / deleteEventsByQuery / createECC / closeECC / deleteECC / createDrawing / createAttendance / createArea / deleteArea / createStandardTrade / deleteStandardTrade / createManagement / createGanttItem / createMilestone / updateWeeklyLabor / createConstructionZone 等 30+ 工具。**绝大多数任务你都能做。**

# 🛠 工作流程

1. **理解用户意图**（1 句话总结）→ **调对应工具** → **基于工具结果回复**
2. 不知道怎么做？**先调 query 工具**（queryEvents / queryPlans / queryIssues / queryECC / queryGantt / queryMilestone / queryAreas / queryWorkers / queryProjects）查清楚再做
3. 写入数据：safe 工具（createEvent / createPlan / createIssue / createECC / createDrawing / createAttendance）直接调；sensitive 工具（updateXxx / deleteXxx / closeXxx）先 dryRun=true 预览，确认后 dryRun=false
4. 涉及多个操作（如"建计划 + 录今日完成"）→ **一轮调多个 tool_use**，不要拆成多轮

# 📋 工具清单（按类别）${_toolsListText()}

# 🔁 典型场景示例

- 用户问"今天完成的工作都完善吗" → 调 comparePlansVsActuals
- 用户问"今天做了啥" → 调 queryEvents(date=今天)
- 用户问"今日计划有什么" → 调 queryPlans(date=今天)
- 用户说"木工完成大堂龙骨 80%" → 直接调 createEvent(type='progress', taskName='大堂龙骨', progress='80%', laborRequirements=[{trade:'木工',count:N}])
- 用户说"建一条屋面防水计划" → 直接调 createPlan(taskName='屋面防水', ...)，缺字段留空不反问
- 用户说"把 P1781831xxxxxx 改成 90%" → 先调 queryPlans 确认 ID，再调 updatePlan(planId, progress='90%', dryRun=false)
- 用户说"删掉今天的草稿事件" → 调 deleteEventsByQuery(date=今天, status='draft', dryRun=true) → 调 deleteEventsByQuery(dryRun=false, forceDelete=true)
- 用户说"删掉刚才那条计划" → 调 deletePlan(planId='刚创的 ID', dryRun=true) → 调 deletePlan(dryRun=false)
- 用户说"删掉 2026-06-19 所有王伟负责的计划" → 调 deletePlansByQuery(date='2026-06-19', owner='王伟', dryRun=true) → 调 deletePlansByQuery(dryRun=false, forceDelete=true)
- 用户说"录一条油漆工 3 人 + 小工 2 人的完成事件" → 直接调 createEvent(laborRequirements=[{trade:'油漆工',count:3},{trade:'小工',count:2}])
- 用户说"关掉协调 I007" → 调 updateIssue(issueId='I007', status='closed', dryRun=true) → dryRun=false

# 🔐 权限

${permHint}

# 📊 项目数据

${contextText}

# 📝 字段约定

始终用驼峰：taskName, areaId, laborRequirements, completionType, buildingNo, floorNo, headcount, proposeDept, cooperateDept, planId, eventId, issueId, confirmConditions

ID 字段（eventId/issueId/planId/eccId/managerId）**严禁编造**——必须先调 query 工具拿到真实 ID
区域 ID（areaId）必须从"项目数据 → 项目区域"列表中选；找不到就置空 areaId 并填 areaName
不要输出任何图片引用，用纯文本或 Markdown 表格
**回复内容里不要有思考过程**，思考过程不输出给用户。回复要说人话，像工友之间交流一样自然。

# 🈶 中文输出规范（重要）

**JSON actions 中的字段值**：保持**英文枚举 / 代码风格**（如 type='progress'、status='draft'、source='chat'、priority='high'），方便程序解析。

**对用户说话的文本内容（reply）必须用中文**：
- 类型名称：progress→进度, material→材料, safety→安全, coordination→协调, attendance→考勤, drawing→图纸深化
- 状态名称：draft→草稿/待确认, confirmed→已确认, active→进行中, completed→已完成, paused→已暂停, cancelled→已取消, open→待处理, in_progress→处理中, closed→已闭环
- 来源：voice→语音, photo→拍照, manual→手动, chat→AI 对话, auto→自动
- 完成类型：planned→计划内, unplanned→计划外
- 区域 / 工人名字：直接用 reference.areas / reference.workers / 项目数据 中已给出的中文名称
- ID 字段（planId/eventId/issueId 等）：可在中文表述中保留（用户能直接定位）；不要在中文文本里堆英文 enum

**反例**：不要写"已创建 type=progress 事件 E007，status=draft，source=chat"
**正例**：写"已创建【大堂龙骨】进度事件（事件编号 E007，草稿状态，AI 对话录入）"
`;

    const messages = this._buildMessages(history, message);
    // 根据 provider 选择正确的工具 schema 格式
    const nativeTools = this.provider === 'anthropic'
      ? this._getNativeTools()
      : this._getOpenAITools();

    // ✅ 短期对话记忆
    const memory = createMemory();

    // ✅ 长期记忆 — 注入摘要到 system prompt
    import('./long-term-memory.js').then(async m => {
      const summary = await m.getMemorySummary(pi);
      if (summary) systemMsg += '\n\n' + summary;
    }).catch(() => {});

    // ReAct 循环
    const reactMaxIters = (maxIters || 10);
    const mutateActions = [];  // ✅ 收集 mutate 工具产生的 actions（confirm 模式下的待授权 + allow 模式下的已执行）
    let lastAssistantText = '';  // ✅ 保存最后一次伴随 tool_use 的文本，循环耗尽时作为回复

    for (let i = 0; i < reactMaxIters; i++) {

      // 注入 memory summary（每轮可能更新）
      const memSummary = getMemorySummary(memory);
      if (memSummary) systemMsg += '\n\n' + memSummary;

      const body = await this._call(systemMsg, messages, { tools: nativeTools, temperature: 0.2 });
      const content = Array.isArray(body?.content) ? body.content : [];
      if (content.length === 0) return { reply: '抱歉，暂时无法处理，请重试。', actions: [], toolsCalled: 0, memory };

      // 1) ✅ 优先用原生 tool_use 协议
      const toolUseBlocks = content.filter(b => b.type === 'tool_use');
      if (toolUseBlocks.length > 0) {
        // ✅ 保存本次伴随 tool_use 的文本，循环耗尽时作为最终回复
        lastAssistantText = content.find(b => b.type === 'text')?.text || '';
        // 把 assistant 的回复追加到消息（按 provider 切换格式）
        if (this.provider === 'openai') {
          const textBlock = content.find(b => b.type === 'text');
          const msg = { role: 'assistant', content: textBlock?.text || '' };
          const toolBlocks = content.filter(b => b.type === 'tool_use');
          if (toolBlocks.length > 0) {
            msg.tool_calls = toolBlocks.map(tb => ({
              id: tb.id, type: 'function',
              function: { name: tb.name, arguments: JSON.stringify(tb.input) }
            }));
          }
          messages.push(msg);
        } else {
          messages.push({ role: 'assistant', content });
        }

        // 依次执行每个 tool_use，把结果作为 tool_result 回灌
        const toolResults = [];
        for (const toolUse of toolUseBlocks) {
          try {
            const result = await executeTool(
              toolUse.name,
              toolUse.input || {},
              { projectId: pi, date: dt, permLevel }  // ✅ 把 permLevel 传给工具
            );
            // ✅ 如果 mutate 工具返回了 pendingAction（如 confirm 模式），收集起来
            if (result?.pendingAction) {
              mutateActions.push({ ...result.pendingAction, _source: 'tool' });
            } else if (result?.ok && toolUse.name.match(/^(create|update|close|delete|batch)/)) {
              // ✅ mutate 工具成功执行（allow 模式），把它的 action 也收集起来（让前端能记录）
              mutateActions.push({ type: toolUse.name, data: toolUse.input, _source: 'tool', _result: result });
            }
            // ✅ 记录到短期记忆
            const resultCount = Array.isArray(result) ? result.length :
              (result?.data?.deletedCount || result?.data?.count || 0);
            recordQuery(memory, toolUse.name, toolUse.input, resultCount);
            if (toolUse.name.match(/^(create|update|close|delete)/)) {
              recordAction(memory, toolUse.name, result?.eventId || result?.issueId || result?.data?.id || toolUse.input?.eventId || toolUse.input?.issueId);
            }
            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: typeof result === 'string' ? result : JSON.stringify(result, null, 2)
            });
          } catch (e) {
            const recovery = this._classifyError(e);
            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              is_error: true,
              content: `${e.message}\n\n[恢复建议] ${recovery}`
            });
          }
        }
        // tool_results 按 provider 格式追加
        if (this.provider === 'openai') {
          for (const tr of toolResults) {
            messages.push({ role: 'tool', tool_call_id: tr.tool_use_id, content: tr.content });
          }
        } else {
          messages.push({ role: 'user', content: toolResults });
        }
        continue;  // 进入下一轮，让 LLM 继续思考
      }

      // 2) 没有 tool_use，检查是否需要继续
      const text = content.find(b => b.type === 'text')?.text || '';
      if (!text) {
        return { reply: '抱歉，暂时无法处理，请重试。', actions: mutateActions, toolsCalled: 0, memory };
      }

      // 3) 兼容路径：LLM 可能输出 ```json {"actions":[...]} ``` 块（MiniMax-M3 训练倾向）
      //    把它解析后并入 mutateActions
      const legacyActions = this._extractActions(text);
      // ✅ 合并：mutate 工具产生的 actions + LLM 输出 JSON 块里的 actions
      const allActions = [...mutateActions, ...legacyActions];
      const replyClean = text.replace(/```json[\s\S]*?```/, '').replace(/<!--\s*REMAINING:\s*\{[\s\S]*?\}\s*-->/g, '').trim();
      const remaining = this._extractRemainingItems(text);
      const hasMore = remaining?.hasMore === true;
      const remainingItems = remaining?.remainingItems || [];

      // ✅ 关键修复：如果 LLM 没有输出 tool_use 但有剩余任务（hasMore=true 或 text 中有未完成语义），
      // 不要把纯文本当最终回复，而是把 text 作为 user 消息回灌，强制 LLM 继续执行工具
      const unfinishedKeywords = /继续|处理|完成|剩下|剩余|复查|确认|检查|先查|等一下|稍等|还需要|还没|不做|不能|无法|做不到|查一次|查一下|看看|核实|验证|再查|重新查|解释|失败|不存在|错误|报错|情况|对比|共\d|项|条|未完成|缺失|待处理|差异|差距|不对|少了|还有|只需|需要做/;

      // 判断是否有 tool_use 被执行过（检查 messages 中是否有 tool_result）
      const hasExecutedTools = messages.some(m =>
        Array.isArray(m.content) && m.content.some(c => c.type === 'tool_result')
      );

      // ✅ 新增：检测 comparePlansVsActuals 等诊断工具的输出，发现有未完成/缺失项就强制续轮
      let hasDiagnosticUnfinished = false;
      for (let mi = messages.length - 1; mi >= 0; mi--) {
        const m = messages[mi];
        if (!Array.isArray(m.content)) continue;
        for (const c of m.content) {
          if (c.type !== 'tool_result') continue;
          const toolName = (() => {
            for (let pi = mi - 1; pi >= 0; pi--) {
              const pm = messages[pi];
              if (!Array.isArray(pm.content)) continue;
              const tu = pm.content.find(b => b.type === 'tool_use' && b.id === c.tool_use_id);
              if (tu) return tu.name;
            }
            return null;
          })();
          if (toolName === 'comparePlansVsActuals' || toolName === 'getStats' || toolName === 'queryPlans') {
            try {
              const parsed = typeof c.content === 'string' ? JSON.parse(c.content) : c.content;
              const pendingN = Array.isArray(parsed?.pending) ? parsed.pending.length : 0;
              const missingN = Array.isArray(parsed?.missing) ? parsed.missing.length : 0;
              const eventCount = parsed?.eventCount || parsed?.eventSummary?.total || 0;
              if (pendingN > 0 || missingN > 0) {
                hasDiagnosticUnfinished = true;
              }
            } catch {}
          }
          // 任何 tool_result 只检查最近的一个
          if (hasDiagnosticUnfinished) break;
        }
        if (hasDiagnosticUnfinished) break;
      }

      const shouldContinue = (hasMore || remainingItems.length > 0 || unfinishedKeywords.test(text) || hasDiagnosticUnfinished) && hasExecutedTools;

      if (shouldContinue) {
        // 把 LLM 的纯文本作为 user 消息回灌，让它继续执行工具
        messages.push({ role: 'user', content: `请继续执行工具调用完成剩余任务。不要只用文字描述，必须实际调用工具。${hasDiagnosticUnfinished ? '检测到还有未完成的计划/事件，请立即调用 createEvent / createPlan 等工具处理。' : ''}` });
        continue;  // 进入下一轮 ReAct 循环
      }

      // 真正完成：返回最终回复
      const reply = allActions.length > 0 ? replyClean : text.replace(/<!--\s*REMAINING:\s*\{[\s\S]*?\}\s*-->/g, '').trim();
      return { reply, actions: allActions, toolsCalled: 0, memory, hasMore, remainingItems };
    }

    // ✅ 保存长期偏好（异步，不阻塞返回）
    this.saveLongTermMemory(projectId, memory);

    // 循环耗尽（maxIters），用最后一次伴随 tool_use 的文本作为回复
    // 如果没记录到文本，轻量询问 LLM
    let wrapUpText = lastAssistantText;
    if (!wrapUpText) {
      try {
        const wrapBody = await this._call(systemMsg, messages, { temperature: 0.2 });
        const wrapContent = Array.isArray(wrapBody?.content) ? wrapBody.content : [];
        wrapUpText = wrapContent.find(b => b.type === 'text')?.text || '';
      } catch {}
    }
    const remaining = this._extractRemainingItems(wrapUpText);
    const hasMore = remaining?.hasMore === true;
    const remainingItems = remaining?.remainingItems || [];
    const finalReply = (wrapUpText || (hasMore
      ? `还有 ${remainingItems.length} 项待处理。`
      : '已处理完成。')).replace(/<!--\s*REMAINING:\s*\{[\s\S]*?\}\s*-->/g, '').trim();
    return { reply: finalReply, actions: mutateActions, toolsCalled: 0, memory, hasMore, remainingItems };
  }

  async saveLongTermMemory(projectId, memory) {
  try {
    const m = await import('./long-term-memory.js');
    await m.initMemoryTable();
    await m.saveLongTermPrefs(projectId, memory);
  } catch (e) {
    console.warn('[long-term-memory] save failed:', e.message);
  }
}

async recordEvaluation(sessionId, lastMessage, reply, actionsTaken, toolsCalled) {
  try {
    const e = await import('./evaluation.js');
    await e.initEvalTable();
    const hallucination = e.detectHallucination(reply, actionsTaken > 0 ? [] : null, []);
    await e.recordEvaluation(sessionId, 'baicaoyuan', {
      message: lastMessage,
      reply,
      actionsTaken,
      toolsCalled,
      hallucinationDetected: hallucination
    });
  } catch (e) {
    console.warn('[evaluation] record failed:', e.message);
  }
}

  // ✅ 把所有工具转成 Anthropic 原生 tool_use schema
  // 自动从 llm-tools.js 的 TOOLS 生成——加工具只需在 llm-tools.js 加一次，schema 自动同步
  _getNativeTools() {
    return REGISTERED_TOOLS.map(tool => _toAnthropicSchema(tool));
  }

  // ✅ 把所有工具转成 OpenAI function_call schema
  _getOpenAITools() {
    return REGISTERED_TOOLS.map(tool => _toOpenAISchema(tool));
  }

  // ✅ 错误分类：给 LLM 恢复建议
  _classifyError(e) {
    const msg = e.message || '';
    if (msg.includes('不存在') || msg.includes('not found')) {
      return '该 ID 已被删除或你查到的 ID 已过期。请重新调用 query 工具获取最新 ID 列表。';
    }
    if (msg.includes('权限') || msg.includes('permission')) {
      return '该操作需要更高级别权限。告诉用户当前权限不足，建议换个方式。';
    }
    if (msg.includes('UNIQUE') || msg.includes('duplicate')) {
      return '数据重复。请改用 update 而不是 create，或调整参数避免冲突。';
    }
    if (msg.includes('network') || msg.includes('timeout') || msg.includes('aborted')) {
      return '网络/超时问题。请稍后重试，或改用其他信息继续。';
    }
    if (msg.includes('batchDelete')) {
      return 'batchDelete 至少需要一个筛选条件。检查 params 是否有 timeFrom/timeTo/status/type/planId/areaId/taskNameContains/ids 之一。';
    }
    return '请检查参数是否正确，或换一种方式完成。';
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

  async _call(system, messages, options = {}) {
    const { tools, temperature } = options;
    let lastErr;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        if (attempt > 0) await new Promise(r => setTimeout(r, 1000 * attempt));
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);
        const body = {
          model: this.model,
          messages,
          max_tokens: this.maxTokens,
          temperature: temperature ?? this.temperature
        };
        // Anthropic 格式：带 system 字段 + anthropic-version header
        if (this.provider === 'anthropic') {
          body.system = system;
        }
        // OpenAI 格式：system 注入 messages 开头（用副本避免 Mutation）
        if (this.provider === 'openai') {
          const msgs = [{ role: 'system', content: system }, ...messages];
          body.messages = msgs;
        }
        // ✅ 工具 schema（调用方已按 provider 选好了格式）
        if (tools && tools.length > 0) {
          body.tools = tools;
        }
        const apiUrl = this.provider === 'anthropic'
          ? (this.baseUrl.endsWith('/v1') ? `${this.baseUrl}/messages` : `${this.baseUrl}/v1/messages`)
          : (this.baseUrl.endsWith('/v1') ? `${this.baseUrl}/chat/completions` : `${this.baseUrl}/v1/chat/completions`);
        const headers = { 'Content-Type': 'application/json' };
        if (this.provider === 'anthropic') {
          headers['x-api-key'] = this.apiKey;
          headers['anthropic-version'] = '2023-06-01';
        } else {
          headers['Authorization'] = 'Bearer ' + this.apiKey;
        }
        const res = await fetch(apiUrl, {
          method: 'POST',
          headers,
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
        // ✅ Anthropic: {content: [{type:'text'|'tool_use', text, id, name, input}], ...}
        // ✅ OpenAI: {choices: [{message: {role:'assistant', content, tool_calls: [{id, type, function:{name, arguments}}]}}]}
        if (this.provider === 'anthropic') {
          const content = Array.isArray(data?.content) ? data.content : [];
          if (content.length > 0) return data;
          lastErr = new Error('空响应');
          continue;
        }
        // OpenAI 格式
        const choice = data?.choices?.[0]?.message;
        if (choice) {
          const parts = this._openaiToAnthropic(choice);
          // 即使 content/工具为空也兜底：强行用 choice.content 当 text
          if (parts.content.length === 0 && typeof choice.content === 'string' && choice.content.trim()) {
            parts.content.push({ type: 'text', text: choice.content });
          }
          return { content: parts.content };
        }
        lastErr = new Error('空响应');
        console.warn('[LLM] OpenAI 响应无 choices:', JSON.stringify(data).slice(0, 300));
        continue;
      } catch (e) {
        lastErr = e;
        if (e.name === 'AbortError') break;
      }
    }
    throw lastErr || new Error('LLM 调用失败');
  }

  // 把 OpenAI tool_call 转成 Anthropic 格式，统一下游处理逻辑
  _openaiToAnthropic(choice) {
    const parts = [];
    if (choice.content) {
      parts.push({ type: 'text', text: choice.content });
    }
    if (choice.tool_calls) {
      for (const tc of choice.tool_calls) {
        const fn = tc.function;
        let input = {};
        try { input = JSON.parse(fn.arguments); } catch {}
        parts.push({
          type: 'tool_use',
          id: tc.id || ('call_' + Math.random().toString(36).slice(2, 10)),
          name: fn.name,
          input
        });
      }
    }
    return { content: parts };
  }
}

// ============================================================
// 把 llm-tools.js 的工具定义转成 Anthropic 原生 tool_use schema
// ============================================================
//
// 设计要点：
// 1. llm-tools.js 里每个 tool 的 params 是 { name: '描述文本' }
// 2. 描述里包含"必填" → 进 required 数组
// 3. 描述里包含管道符 | 分隔的枚举值 → 转成 enum
// 4. 描述里包含"列表"/"数组" → type: array
// 5. 根据 isMutate / requiresConfirm 在 description 前加危险标记
//
// 这样未来在 llm-tools.js 加工具，Anthropic schema 自动同步，
// 不需要手写两遍。
function _toAnthropicSchema(tool) {
  const properties = {};
  const required = [];

  // 标记：mutate / sensitive
  const tags = [];
  if (tool.isMutate) {
    if (tool.requiresConfirm) tags.push('⚠️ 敏感操作');
    else tags.push('✅ 安全操作');
  } else {
    tags.push('查询');
  }

  for (const [name, rawDesc] of Object.entries(tool.params || {})) {
    const desc = String(rawDesc);
    const prop = { description: desc };

    // 1) enum 检测：description 里有 | 分隔的 enum 值（且不是 markdown 表格里的 |）
    const enumMatch = desc.match(/\b([a-zA-Z\u4e00-\u9fa5]+(?:\|[a-zA-Z\u4e00-\u9fa5]+){1,})\b/);
    if (enumMatch) {
      const candidates = enumMatch[1].split('|');
      // 只在看起来像枚举（2-6 个，< 12 字符）时采纳
      if (candidates.length >= 2 && candidates.length <= 6 && candidates.every(s => s.length <= 10)) {
        prop.enum = candidates;
        prop.type = 'string';
      } else {
        prop.type = 'string';
      }
    }
    // 2) array 检测
    else if (/列表|数组|\[\{/.test(desc)) {
      prop.type = 'array';
      // 数组里有对象 schema 时尽量给一个
      if (/\{.*trade.*count|\{.*weekStart.*tradeId/.test(desc)) {
        prop.items = { type: 'object' };
      } else if (/\[.*?\]/.test(desc)) {
        // 看起来像 string[] 形式
        prop.items = { type: 'string' };
      } else {
        prop.items = { type: 'string' };
      }
    }
    // 3) 数字检测（最少/最多/编号/天数/排序号等关键词）
    else if (/限制|最多|人数|天数|数量|编号|排序|工日|人数|次数|进度%/.test(desc) && !/^.{0,3}$/.test(desc)) {
      // 注意：progress 描述含"进度%"但 progress 是数字还是 string 不确定，先保持 string
      // 因为实际 handler 里 progress: data.progress 没强转
      if (/^\d+%?$/.test(desc.trim()) || desc.includes('数量') || desc.includes('天数') || desc.includes('工日') || desc.includes('编号') || desc.includes('排序')) {
        prop.type = 'number';
      } else {
        prop.type = 'string';
      }
    }
    // 4) boolean（dryRun）
    else if (name === 'dryRun' || name === 'forceDelete' || name === 'present') {
      prop.type = 'boolean';
    }
    // 5) 默认 string
    else {
      prop.type = 'string';
    }

    properties[name] = prop;
    if (desc.includes('必填')) required.push(name);
  }

  return {
    name: tool.name,
    description: `[${tags.join(' | ')}] ${tool.description}`,
    input_schema: {
      type: 'object',
      properties,
      ...(required.length > 0 ? { required } : {})
    }
  };
}

// 把 llm-tools.js 的工具定义转成 OpenAI function_call schema
function _toOpenAISchema(tool) {
  const properties = {};
  const required = [];

  const tags = [];
  if (tool.isMutate) {
    if (tool.requiresConfirm) tags.push('⚠️ 敏感操作');
    else tags.push('✅ 安全操作');
  } else {
    tags.push('查询');
  }

  for (const [name, rawDesc] of Object.entries(tool.params || {})) {
    const desc = String(rawDesc);
    const prop = { description: desc };

    const enumMatch = desc.match(/\b([a-zA-Z\u4e00-\u9fa5]+(?:\|[a-zA-Z\u4e00-\u9fa5]+){1,})\b/);
    if (enumMatch) {
      const candidates = enumMatch[1].split('|');
      if (candidates.length >= 2 && candidates.length <= 6 && candidates.every(s => s.length <= 10)) {
        prop.enum = candidates;
        prop.type = 'string';
      } else {
        prop.type = 'string';
      }
    } else if (/列表|数组|\[\{/.test(desc)) {
      prop.type = 'array';
      if (/\{.*trade.*count|\{.*weekStart.*tradeId/.test(desc)) {
        prop.items = { type: 'object' };
      } else {
        prop.items = { type: 'string' };
      }
    } else if (/限制|最多|人数|天数|数量|编号|排序|工日|次数|进度%/.test(desc) && !/^.{0,3}$/.test(desc)) {
      if (/^\d+%?$/.test(desc.trim()) || desc.includes('数量') || desc.includes('天数') || desc.includes('工日') || desc.includes('编号') || desc.includes('排序')) {
        prop.type = 'number';
      } else {
        prop.type = 'string';
      }
    } else if (name === 'dryRun' || name === 'forceDelete' || name === 'present') {
      prop.type = 'boolean';
    } else {
      prop.type = 'string';
    }

    properties[name] = prop;
    if (desc.includes('必填')) required.push(name);
  }

  return {
    type: 'function',
    function: {
      name: tool.name,
      description: `[${tags.join(' | ')}] ${tool.description}`,
      parameters: {
        type: 'object',
        properties,
        ...(required.length > 0 ? { required } : {})
      }
    }
  };
}
// 把 TOOLS 转成 systemMsg 里的"可用工具"清单文本
// ============================================================
//
// 按 isMutate/requiresConfirm 自动分组，确保 LLM 看到的工具清单
// 跟 native tool_use schema 是同一份真相。
//
// 分组：
//   1) 查询类（只读，无需授权）
//   2) 安全写入（requiresConfirm=false，permLevel=allow/confirm 都直接调）
//   3) 敏感写入（requiresConfirm=true，permLevel=confirm 走授权卡片；strict 禁止）
function _toolsListText() {
  const queries = REGISTERED_TOOLS.filter(t => !t.isMutate);
  const safeMutates = REGISTERED_TOOLS.filter(t => t.isMutate && !t.requiresConfirm);
  const sensitiveMutates = REGISTERED_TOOLS.filter(t => t.isMutate && t.requiresConfirm);

  const lines = [];

  lines.push(`\n- **查询类（${queries.length} 个）**：`);
  for (const t of queries) {
    lines.push(`  - ${t.name}: ${t.description.split(/[。.]/)[0]}`);
  }

  lines.push(`\n- **安全写入（${safeMutates.length} 个，全部支持 dryRun；permLevel=allow/confirm 都直接调，strict 仍走授权）**：`);
  for (const t of safeMutates) {
    lines.push(`  - ${t.name}: ${t.description.split(/[。.]/)[0]}（**直接调用**）`);
  }

  lines.push(`\n- **敏感写入（${sensitiveMutates.length} 个，全部支持 dryRun；permLevel=confirm 走 ✅ 授权卡片，strict 禁止）**：`);
  for (const t of sensitiveMutates) {
    lines.push(`  - ${t.name}: ${t.description.split(/[。.]/)[0]}（sensitive，先 dryRun 后真做）`);
  }

  return lines.join('\n');
}
