// ============================================================
// llm-client.js - MiniMax LLM 客户端
// 协议：Anthropic 兼容（baseUrl 形如 https://xxx/anthropic/v1）
//   - 端点：POST /v1/messages
//   - 鉴权：x-api-key header + anthropic-version
//   - 请求：{model, system, messages, max_tokens, temperature}
//   - 响应：{content: [{type: 'text', text: '...'}], ...}
// ============================================================

import { executeTool } from './llm-tools.js';
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

    let systemMsg = `你是施工日报系统的 AI 助手。**最重要：你必须用 tool_use 调用工具，不要只在文字里描述"已完成"。** 文字描述不等于实际执行——只有调工具才有效。

## 核心原则
- 不确定用户意图时，**先用工具查数据**，不要假设用户要录入
- "今天完成的工作"、"做了啥"、"有哪些"等是查询，不是录入
- 用户提到具体任务+进度/人数时才是录入（如"木工完成大堂龙骨 80%"）
- 先思考再行动：**宁可多查一步，不要贸然操作**

## ✅ 工具调用协议（**必须严格遵守**）
**你拥有 native tool_use 能力**——直接调用系统提供的工具，不要输出文本 JSON 块来"模拟"工具调用。

**工作流程：**
1. 需要数据时，**直接调用对应的工具**（如 queryEvents / queryPlans / queryIssues / getStats / comparePlansVsActuals）
2. 拿到工具返回结果后，**基于真实数据**回复用户
3. 需要写入数据时：
   - **安全操作**（创建事件 createEvent、创建协调 createIssue）：直接调用对应的 mutate 工具
   - **敏感操作**（修改 updateEvent/updateIssue/updatePlan、关闭 closeIssue、删除 deleteEventsByQuery）：
     - 如果**用户已明确指令**（如"把 E123 改成 90%"、"删掉今天木工的所有事件"、"关掉 I007"）：**直接调 mutate 工具的 dryRun=false 执行**（前提：permLevel=allow；如果 permLevel=confirm 会被系统拦截走待授权卡片，不用担心）
     - 如果**用户描述模糊**（如"看看那条事件能不能改"）：先 dryRun=true 预览，让用户确认
4. 不要在文本里输出 \`\`\`json {"tool":"..."} \`\`\` 这种"老格式"——这会被系统忽略

**⚠️ 关于 confirm 模式**：当 permLevel=confirm 时，敏感操作必须**直接调用 mutate 工具的 dryRun=false**——系统会自动把 action 推为"待授权卡片"（pendingActions），前端会显示 ✅ 按钮让用户点击。**不要在 confirm 模式下"等用户在文字里确认"——必须调工具！** 文字确认不等于系统授权。

## 可用工具（通过 native tool_use 调用）
- **查询类（5 个）**：
  - queryEvents: 查询日报事件（按日期/类型/区域/状态/任务名）
  - queryPlans: 查询施工计划
  - queryIssues: 查询协调事项
  - getStats: 统计摘要
  - comparePlansVsActuals: 计划 vs 实际对比

- **写入类（6 个，全部支持 dryRun）**：
  - createEvent: 创建日报事件（safe，**直接调用**）
  - createIssue: 创建协调事项（safe，**直接调用**）
  - updateEvent: 修改事件（sensitive，先 dryRun 后真做）
  - updateIssue: 修改协调（sensitive，先 dryRun 后真做）
  - closeIssue: 关闭协调（sensitive，先 dryRun 后真做）
  - updatePlan: 完善计划（sensitive，先 dryRun 后真做）
  - deleteEventsByQuery: 按条件批量删除（sensitive，先 dryRun 后真做）

工具用法示例：
- 用户问"今天完成的工作都完善吗" → 调 comparePlansVsActuals 查对比数据
- 用户问"今天做了啥" → 调 queryEvents 查今日事件
- 用户问"今日计划有什么" → 调 queryPlans 查今日计划
- 用户说"木工完成80%" → 直接调 createEvent（safe，不需要 dryRun）
- 用户说"把 E123 改成 90%" → 先调 queryEvents 验证 ID 真实存在，再调 updateEvent(dryRun=true)，告诉用户，确认后调 updateEvent(dryRun=false)
- 用户说"删掉今天的草稿" → 先调 deleteEventsByQuery(dryRun=true) 列出匹配项，确认后调 deleteEventsByQuery(dryRun=false, forceDelete=true)

## 权限
${permHint}

## 项目数据
${contextText}

## 字段约定
始终用驼峰：taskName, areaId, laborRequirements, completionType, buildingNo, floorNo, headcount, proposeDept, cooperateDept, planId, eventId, issueId

## 决策规则
- **缺必填字段时反问用户**（如没说明 taskName，反问"请问要记录什么任务？"）
- **可选字段缺失直接留空**，不反问
- **ID 字段**（eventId/issueId/planId）**严禁编造**——必须先调 query 工具拿到真实 ID
- **区域 ID**（areaId）必须从项目数据的"项目区域"列表中选；找不到就置空 areaId 并填 areaName
- 不要输出任何图片引用，用纯文本或 Markdown 表格
- **回复内容里不要有思考过程**，思考过程不输出给用户。回复要说人话，像工友之间交流一样自然。
`;

    const messages = this._buildMessages(history, message);
    const nativeTools = this._getNativeTools();  // ✅ 原生 tool_use schema

    // ✅ 短期对话记忆
    const memory = createMemory();

    // ✅ 长期记忆 — 注入摘要到 system prompt
    import('./long-term-memory.js').then(async m => {
      const summary = await m.getMemorySummary(pi);
      if (summary) systemMsg += '\n\n' + summary;
    }).catch(() => {});

    // ReAct 循环
    const maxIters = 6;
    const mutateActions = [];  // ✅ 收集 mutate 工具产生的 actions（confirm 模式下的待授权 + allow 模式下的已执行）
    for (let i = 0; i < maxIters; i++) {
      // 注入 memory summary（每轮可能更新）
      const memSummary = getMemorySummary(memory);
      if (memSummary) systemMsg += '\n\n' + memSummary;

      const body = await this._call(systemMsg, messages, { tools: nativeTools, temperature: 0.2 });
      const content = body?.content || [];
      if (content.length === 0) return { reply: '抱歉，暂时无法处理，请重试。', actions: [], toolsCalled: 0, memory };

      // 1) ✅ 优先用原生 tool_use 协议
      const toolUseBlocks = content.filter(b => b.type === 'tool_use');
      if (toolUseBlocks.length > 0) {
        // 把 assistant 的完整 content 数组（包含 text 和 tool_use）追加到消息
        messages.push({ role: 'assistant', content });

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
            } else if (result?.ok && result?.data?.id && toolUse.name.match(/^(create|update|close)/)) {
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
        messages.push({ role: 'user', content: toolResults });
        continue;  // 进入下一轮，让 LLM 继续思考
      }

      // 2) 没有 tool_use，取 text 作为最终回复
      const text = content.find(b => b.type === 'text')?.text || '';
      if (!text) {
        return { reply: '抱歉，暂时无法处理，请重试。', actions: mutateActions, toolsCalled: 0, memory };
      }

      // 3) 兼容路径：LLM 可能输出 ```json {"actions":[...]} ``` 块（MiniMax-M3 训练倾向）
      //    把它解析后并入 mutateActions
      const legacyActions = this._extractActions(text);
      // ✅ 合并：mutate 工具产生的 actions + LLM 输出 JSON 块里的 actions
      const allActions = [...mutateActions, ...legacyActions];
      const reply = allActions.length > 0 ? text.replace(/```json[\s\S]*?```/, '').trim() : text;
      return { reply, actions: allActions, toolsCalled: 0, memory };
    }

    // ✅ 保存长期偏好（异步，不阻塞返回）
    this.saveLongTermMemory(projectId, memory);
    
    // ✅ 评估闭环 — 自动检测幻觉并记录
    this.recordEvaluation(sessionId, lastMessage, reply, mutateActions.length, toolsCalled);

    return { reply, actions: allActions, toolsCalled, memory };
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
  // 5 个查询 + 6 个写入
  _getNativeTools() {
    return [
      // ============ 查询工具 ============
      {
        name: 'queryEvents',
        description: '查询施工日报事件。可按日期、类型、区域、状态、任务名模糊筛选。返回事件列表（含 id/time/type/taskName/progress/owner/areaId/planId）。',
        input_schema: {
          type: 'object',
          properties: {
            date: { type: 'string', description: 'YYYY-MM-DD 格式日期，不传默认今日' },
            type: { type: 'string', enum: ['progress', 'material', 'safety', 'coordination', 'attendance', 'issue', 'drawing'] },
            areaId: { type: 'string', description: '区域 ID（从项目数据中的 areas 列表选取）' },
            taskNameContains: { type: 'string', description: '任务名关键词，模糊匹配' },
            status: { type: 'string', enum: ['draft', 'confirmed'] },
            limit: { type: 'number', description: '最多返回条数，默认 50' }
          }
        }
      },
      {
        name: 'queryPlans',
        description: '查询施工计划（dr_daily_plans）。返回今日处于起止区间内的计划列表。',
        input_schema: {
          type: 'object',
          properties: {
            date: { type: 'string', description: 'YYYY-MM-DD 格式日期，不传默认今日' },
            status: { type: 'string', enum: ['active', 'completed', 'paused'] },
            areaId: { type: 'string' }
          }
        }
      },
      {
        name: 'queryIssues',
        description: '查询协调事项（dr_issues）。默认只返回未关闭的。',
        input_schema: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['open', 'in_progress', 'closed'] },
            type: { type: 'string' },
            areaId: { type: 'string' }
          }
        }
      },
      {
        name: 'getStats',
        description: '获取指定日期的统计摘要（计划数、事件数、完成率等）。',
        input_schema: {
          type: 'object',
          properties: {
            date: { type: 'string', description: 'YYYY-MM-DD 格式日期' }
          }
        }
      },
      {
        name: 'comparePlansVsActuals',
        description: '对比指定日期的计划 vs 实际完成情况，返回已完成/未完成/计划外完成三类。',
        input_schema: {
          type: 'object',
          properties: {
            date: { type: 'string', description: 'YYYY-MM-DD 格式日期' }
          }
        }
      },

      // ============ 写入工具（mutate）============
      {
        name: 'createEvent',
        description: '创建一条施工日报事件。type + taskName 必填。⚠️ 警告：安全操作，会直接写入数据库。areaId/planId/owner/progress/headcount 等可选。',
        input_schema: {
          type: 'object',
          required: ['type', 'taskName'],
          properties: {
            dryRun: { type: 'boolean', description: 'true=只返回将创建的数据，不真写库' },
            type: { type: 'string', enum: ['progress', 'material', 'safety', 'coordination', 'attendance', 'issue', 'drawing'] },
            taskName: { type: 'string', description: '任务名（必填）' },
            areaId: { type: 'string' },
            planId: { type: 'string', description: '⚠️ 必须从 queryPlans 返回的 ID 中选，不要编造' },
            owner: { type: 'string' },
            progress: { type: 'string' },
            headcount: { type: 'number' },
            laborRequirements: { type: 'array', items: { type: 'object' } },
            completionType: { type: 'string', enum: ['planned', 'unplanned'] },
            buildingNo: { type: 'string' },
            floorNo: { type: 'string' },
            note: { type: 'string' }
          }
        }
      },
      {
        name: 'createIssue',
        description: '创建一条协调事项。title 必填。⚠️ 警告：安全操作，会直接写入数据库。',
        input_schema: {
          type: 'object',
          required: ['title'],
          properties: {
            dryRun: { type: 'boolean' },
            title: { type: 'string', description: '标题（必填）' },
            type: { type: 'string' },
            areaId: { type: 'string' },
            priority: { type: 'string', enum: ['low', 'medium', 'high'] },
            proposeDept: { type: 'string' },
            cooperateDept: { type: 'string' },
            owner: { type: 'string' },
            description: { type: 'string' }
          }
        }
      },
      {
        name: 'updateEvent',
        description: '修改一条日报事件。eventId 必填（必须从 queryEvents 拿真实 ID）。⚠️ 敏感操作：permLevel=allow 直接执行；permLevel=confirm 返回待授权；permLevel=strict 拒绝。',
        input_schema: {
          type: 'object',
          required: ['eventId'],
          properties: {
            dryRun: { type: 'boolean' },
            eventId: { type: 'string', description: '事件 ID（必填，必须真实存在）' },
            taskName: { type: 'string' },
            owner: { type: 'string' },
            progress: { type: 'string' },
            headcount: { type: 'number' },
            laborRequirements: { type: 'array' },
            type: { type: 'string' },
            status: { type: 'string', enum: ['draft', 'confirmed'] },
            areaId: { type: 'string' },
            completionType: { type: 'string', enum: ['planned', 'unplanned'] },
            buildingNo: { type: 'string' },
            floorNo: { type: 'string' }
          }
        }
      },
      {
        name: 'updateIssue',
        description: '修改协调事项。issueId 必填（必须从 queryIssues 拿真实 ID）。⚠️ 敏感操作。',
        input_schema: {
          type: 'object',
          required: ['issueId'],
          properties: {
            dryRun: { type: 'boolean' },
            issueId: { type: 'string', description: '协调 ID（必填）' },
            title: { type: 'string' },
            status: { type: 'string', enum: ['open', 'in_progress', 'closed'] },
            priority: { type: 'string', enum: ['low', 'medium', 'high'] },
            owner: { type: 'string' },
            description: { type: 'string' }
          }
        }
      },
      {
        name: 'closeIssue',
        description: '关闭协调事项。issueId 必填。⚠️ 敏感操作。',
        input_schema: {
          type: 'object',
          required: ['issueId'],
          properties: {
            dryRun: { type: 'boolean' },
            issueId: { type: 'string', description: '协调 ID（必填）' }
          }
        }
      },
      {
        name: 'updatePlan',
        description: '完善计划字段。planId 必填（必须从 queryPlans 拿真实 ID）。⚠️ 敏感操作。',
        input_schema: {
          type: 'object',
          required: ['planId'],
          properties: {
            dryRun: { type: 'boolean' },
            planId: { type: 'string', description: '计划 ID（必填）' },
            areaId: { type: 'string' },
            areaName: { type: 'string' },
            owner: { type: 'string' },
            progress: { type: 'string' },
            buildingNo: { type: 'string' },
            floorNo: { type: 'string' },
            laborRequirements: { type: 'array' },
            taskName: { type: 'string' },
            status: { type: 'string', enum: ['active', 'completed', 'paused'] }
          }
        }
      },
      {
        name: 'deleteEventsByQuery',
        description: '⚠️ 危险操作！按条件批量删除事件。date 必填，必须至少给一个其他条件。先 dryRun=true 看会删哪些，确认后 dryRun=false + forceDelete=true 真删。',
        input_schema: {
          type: 'object',
          required: ['date'],
          properties: {
            dryRun: { type: 'boolean', description: 'true=只列出会删什么' },
            forceDelete: { type: 'boolean', description: 'true=真删（需要 dryRun=false）' },
            date: { type: 'string', description: 'YYYY-MM-DD 必填' },
            timeFrom: { type: 'string', description: 'HH:MM' },
            timeTo: { type: 'string', description: 'HH:MM' },
            status: { type: 'string', enum: ['draft', 'confirmed'] },
            type: { type: 'string' },
            planId: { type: 'string' },
            areaId: { type: 'string' },
            taskNameContains: { type: 'string' },
            ids: { type: 'array', items: { type: 'string' }, description: '显式 eventId 列表' },
            confirmConditions: { type: 'string', description: '中文描述"要删什么"，给用户看' }
          }
        }
      }
    ];
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
          system,
          messages,
          max_tokens: this.maxTokens,
          temperature: temperature ?? this.temperature
        };
        if (this.groupId) body.metadata = { group_id: this.groupId };
        // ✅ 原生 Anthropic tool_use 协议
        if (tools && tools.length > 0) {
          body.tools = tools;
        }
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
        // ✅ 接受 text 块 或 tool_use 块（不再要求必须有 text）
        const content = data?.content || [];
        if (content.length > 0) return data;
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
