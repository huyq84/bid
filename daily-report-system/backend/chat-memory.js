// chat-memory.js - 短期对话记忆
// 记录本轮对话中的查询/动作历史，避免重复操作

/**
 * 创建新的短期记忆
 */
export function createMemory() {
  return {
    queryHistory: [],    // { tool, params, resultCount, timestamp }
    actionHistory: [],   // { type, targetId, timestamp }
    userPreferences: [], // { key, value, timestamp }
    lastQueryDate: null,
    lastActionSummary: null
  };
}

/**
 * 记录一次工具查询
 */
export function recordQuery(memory, toolName, params, resultCount) {
  memory.queryHistory.push({
    tool: toolName,
    params,
    resultCount,
    timestamp: Date.now()
  });
  // 保留最近 20 条查询记录
  if (memory.queryHistory.length > 20) {
    memory.queryHistory = memory.queryHistory.slice(-20);
  }
}

/**
 * 记录一次写入操作
 */
export function recordAction(memory, actionType, targetId) {
  memory.actionHistory.push({
    type: actionType,
    targetId,
    timestamp: Date.now()
  });
  if (memory.actionHistory.length > 20) {
    memory.actionHistory = memory.actionHistory.slice(-20);
  }
}

/**
 * 记录用户偏好
 */
export function recordPreference(memory, key, value) {
  // 去重
  const idx = memory.userPreferences.findIndex(p => p.key === key);
  if (idx >= 0) {
    memory.userPreferences[idx] = { key, value, timestamp: Date.now() };
  } else {
    memory.userPreferences.push({ key, value, timestamp: Date.now() });
  }
}

/**
 * 检查是否最近查过某个 ID（避免重复查询）
 */
export function wasRecentlyQueried(memory, id) {
  return memory.queryHistory.some(q => {
    if (q.tool === 'queryEvents' && q.params.ids) {
      return Array.isArray(q.params.ids) && q.params.ids.includes(id);
    }
    return false;
  });
}

/**
 * 检查是否最近执行过相同操作（避免重复录入）
 */
export function wasRecentlyExecuted(memory, actionType, targetId) {
  return memory.actionHistory.some(a => {
    if (a.type === actionType && a.targetId === targetId) {
      // 5 分钟内重复
      return (Date.now() - a.timestamp) < 5 * 60 * 1000;
    }
    return false;
  });
}

/**
 * 生成 memory 摘要（用于注入 system prompt）
 */
export function getMemorySummary(memory) {
  const parts = [];

  if (memory.queryHistory.length > 0) {
    const recentQueries = memory.queryHistory.slice(-3);
    const querySummary = recentQueries.map(q => {
      const count = q.resultCount ?? '?';
      return `${q.tool}(resultCount=${count})`;
    }).join(', ');
    parts.push(`最近查询: ${querySummary}`);
  }

  if (memory.actionHistory.length > 0) {
    const recentActions = memory.actionHistory.slice(-3);
    const actionSummary = recentActions.map(a => {
      const id = a.targetId ? `(${a.targetId})` : '';
      return `${a.type}${id}`;
    }).join(', ');
    parts.push(`最近操作: ${actionSummary}`);
  }

  if (memory.userPreferences.length > 0) {
    const prefs = memory.userPreferences.map(p => `${p.key}=${p.value}`).join(', ');
    parts.push(`用户偏好: ${prefs}`);
  }

  return parts.length > 0 ? `## 对话记忆\n${parts.join('\n')}` : '';
}

/**
 * 清除过期记录（超过 30 分钟的查询）
 */
export function cleanExpired(memory) {
  const cutoff = Date.now() - 30 * 60 * 1000;
  memory.queryHistory = memory.queryHistory.filter(q => q.timestamp > cutoff);
  memory.actionHistory = memory.actionHistory.filter(a => a.timestamp > cutoff);
}
