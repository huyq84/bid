// ============================================================
// llm-client.js - MiniMax LLM 客户端
// 协议：Anthropic 兼容（baseUrl 形如 https://xxx/anthropic/v1）
//   - 端点：POST /v1/messages
//   - 鉴权：x-api-key header + anthropic-version
//   - 请求：{model, system, messages, max_tokens, temperature}
//   - 响应：{content: [{type: 'text', text: '...'}], ...}
// ============================================================

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
  // 输入: { text, projectId, areas, workers }
  // 输出: { type, areaId, payload: { taskName, progress, owner, headcount, status }, confidence }
  async parseVoice({ text, projectId, areas = [], workers = [] }) {
    const system = `你是一个施工现场日报系统的结构化解析助手。
你的任务：把施工人员口述的日报内容解析成结构化数据。

【严格输出 JSON 规则】只输出一个 JSON 对象，不要输出 JSON 以外的任何内容（包括 \`\`\` 标记、说明、思考过程）。

【区域识别规则】这是最重要的：
1. 优先从【区域列表】里选最匹配的，输出 \`areaId\`
2. 如果口述里出现的区域名称在【区域列表】里找不到（例如 "VIP 接待室" 列表里没有），则：
   - 仍然输出 \`areaId\`，但设为空字符串 ""
   - 同时输出 \`areaName\`，把识别出的新区域名填进去
3. 如果完全没提到区域，areaId 和 areaName 都留空

【输出格式】
{
  "type": "progress" | "material" | "safety" | "coordination" | "attendance",
  "areaId": "区域ID（从列表选，找不到则空字符串）",
  "areaName": "如果识别到列表外的区域名，填这里；否则空字符串",
  "payload": {
    "taskName": "任务名称（简洁，3-12 字）",
    "owner": "负责人姓名（必须从工人列表里选，无法确定留空）",
    "progress": "进度百分比（格式：80%），无法提取留空",
    "headcount": 人数（整数，无法提取填 0）,
    "status": "进行中" | "已完成" | "未开始" | "暂停"
  },
  "confidence": 0~1 之间的数字
}

【注意事项】
- 工人名字用全名（如 "张师傅" → 直接保留 "张师傅"）
- 进度只取整数百分比
- 不要捏造区域或工人`;

    const userMsg = `【项目】${projectId}
【区域列表】
${areas.map(a => `- ${a.id}: ${a.name} (${a.floor || ''}, 负责人 ${a.manager || ''})`).join('\n')}

【工人列表】
${workers.map(w => `- ${w.id}: ${w.name} (${w.role}, ${w.team})`).join('\n')}

【口述内容】
${text}

请输出 JSON：`;

    const raw = await this.chat({ system, messages: [{ role: 'user', content: userMsg }], temperature: 0.3 });

    return this._parseJsonSafe(raw, text, projectId, areas, workers, 'voice');
  }

  // 业务封装 2: 照片解析
  // 输入: { imageBase64, caption, projectId, areas, type }
  // 输出: { areaId, areaName, caption, taskHint, confidence, payload }
  async parsePhoto({ imageBase64, caption, projectId, areas = [], type = 'progress' }) {
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

【输出格式】
{
  "areaId": "区域ID（从列表选，找不到则空字符串）",
  "areaName": "如果识别到列表外的区域名，填这里；否则空字符串",
  "caption": "照片描述（10-30 字，说明看到什么）",
  "taskHint": "推测的施工任务（如天花吊顶龙骨安装）",
  "workType": "木工" | "电工" | "瓦工" | "油漆工" | "焊工" | "其他",
  "payload": {
    "taskName": "任务名称",
    "owner": "负责人姓名（从描述中提取）",
    "progress": "进度百分比（如50%）",
    "headcount": 人数（整数）
  },
  "confidence": 0~1
}`;

    // 构建消息内容：包含图片（如果有）和文字描述
    const userContent = [];
    
    // 添加文字提示
    let textMsg = `【项目】${projectId}\n`;
    textMsg += `【区域列表】\n${areas.map(a => `- ${a.id}: ${a.name}`).join('\n')}\n\n`;
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

  // 文本优化
  async optimizeText({ text, projectId }) {
    const system = `你是一个专业的施工日报文本优化助手。请对用户输入的文本进行专业优化处理：

优化规则：
1. 语言专业化：将口语化表达转换为专业施工术语
2. 表达规范化：统一用词，确保语法正确
3. 结构清晰化：优化句子结构，增强逻辑连贯性
4. 删除冗余：移除不必要的语气词和重复内容
5. 添加专业术语：适当添加施工领域专业词汇

请直接输出优化后的文本，不要输出其他内容。`;

    const userMsg = `请优化以下文本，使其更专业、规范：

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
}
