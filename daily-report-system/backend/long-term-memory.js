// long-term-memory.js - 长期记忆管理
// 持久化到 dr_memory 表，跨会话保留项目偏好和历史决策
import { query } from './db.js';

const TABLE = 'dr_memory';

/**
 * 初始化记忆表（幂等）
 */
export async function initMemoryTable() {
  try {
    await query(`CREATE TABLE IF NOT EXISTS ${TABLE} (
      id SERIAL PRIMARY KEY,
      project_id TEXT NOT NULL,
      memory_key TEXT NOT NULL,
      memory_value JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(project_id, memory_key)
    )`);
  } catch (e) {
    console.warn('[long-term-memory] init failed:', e.message);
  }
}

/**
 * 保存一条记忆
 */
export async function saveMemory(projectId, key, value) {
  try {
    await query(
      `INSERT INTO ${TABLE} (project_id, memory_key, memory_value, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (project_id, memory_key)
       DO UPDATE SET memory_value = EXCLUDED.memory_value, updated_at = NOW()`,
      [projectId, key, JSON.stringify(value)]
    );
  } catch (e) {
    console.warn('[long-term-memory] save failed:', e.message);
  }
}

/**
 * 读取一条记忆
 */
export async function getMemory(projectId, key) {
  try {
    const r = await query(
      `SELECT memory_value FROM ${TABLE} WHERE project_id=$1 AND memory_key=$2`,
      [projectId, key]
    );
    return r.rows[0]?.memory_value || null;
  } catch {
    return null;
  }
}

/**
 * 读取项目所有记忆
 */
export async function getAllMemories(projectId) {
  try {
    const r = await query(
      `SELECT memory_key, memory_value FROM ${TABLE} WHERE project_id=$1 ORDER BY updated_at DESC`,
      [projectId]
    );
    const result = {};
    for (const row of r.rows) {
      try {
        result[row.memory_key] = JSON.parse(row.memory_value);
      } catch {
        result[row.memory_key] = row.memory_value;
      }
    }
    return result;
  } catch {
    return {};
  }
}

/**
 * 从短期记忆中提取需要持久化的偏好
 * 调用时机：对话结束时
 */
export function extractLongTermPrefs(shortTermMemory) {
  const prefs = {};
  
  // 从 userPreferences 提取
  if (shortTermMemory?.userPreferences) {
    for (const p of shortTermMemory.userPreferences) {
      prefs[p.key] = p.value;
    }
  }
  
  // 从 queryHistory 推断常用查询
  if (shortTermMemory?.queryHistory) {
    const recentQueries = shortTermMemory.queryHistory.slice(-10);
    const queryTypes = {};
    for (const q of recentQueries) {
      queryTypes[q.tool] = (queryTypes[q.tool] || 0) + 1;
    }
    prefs.recentQueries = queryTypes;
  }
  
  // 从 actionHistory 推断常用操作
  if (shortTermMemory?.actionHistory) {
    const recentActions = shortTermMemory.actionHistory.slice(-10);
    const actionCounts = {};
    for (const a of recentActions) {
      actionCounts[a.type] = (actionCounts[a.type] || 0) + 1;
    }
    prefs.recentActions = actionCounts;
  }
  
  return prefs;
}

/**
 * 保存长期偏好（从短期记忆提取）
 */
export async function saveLongTermPrefs(projectId, shortTermMemory) {
  const prefs = extractLongTermPrefs(shortTermMemory);
  if (Object.keys(prefs).length === 0) return;
  
  // 保存为整体偏好
  await saveMemory(projectId, 'preferences', prefs);
  
  // 单独保存常用查询
  if (prefs.recentQueries) {
    await saveMemory(projectId, 'common_queries', prefs.recentQueries);
  }
  
  // 单独保存常用操作
  if (prefs.recentActions) {
    await saveMemory(projectId, 'common_actions', prefs.recentActions);
  }
}

/**
 * 生成记忆摘要（用于注入 system prompt）
 */
export async function getMemorySummary(projectId) {
  const memories = await getAllMemories(projectId);
  const parts = [];
  
  // 偏好
  if (memories.preferences) {
    const p = memories.preferences;
    if (p.commonAreas) {
      parts.push(`常用区域: ${p.commonAreas.join(', ')}`);
    }
    if (p.commonWorkers) {
      parts.push(`常用人员: ${p.commonWorkers.join(', ')}`);
    }
    if (p.preferredFormat) {
      parts.push(`回复格式偏好: ${p.preferredFormat}`);
    }
  }
  
  // 常见查询
  if (memories.common_queries) {
    const qs = Object.entries(memories.common_queries)
      .filter(([, v]) => v >= 3)  // 只展示高频查询
      .map(([k, v]) => `${k}(${v}次)`)
      .join(', ');
    if (qs) parts.push(`常用查询: ${qs}`);
  }
  
  // 常见操作
  if (memories.common_actions) {
    const as = Object.entries(memories.common_actions)
      .filter(([, v]) => v >= 3)  // 只展示高频操作
      .map(([k, v]) => `${k}(${v}次)`)
      .join(', ');
    if (as) parts.push(`常用操作: ${as}`);
  }
  
  // 纠错历史（用户纠正过 LLM 的错误）
  if (memories.corrections) {
    const corrections = memories.corrections.slice(-5);
    const corrText = corrections.map(c => {
      if (typeof c === 'string') return c;
      return `${c.action || 'unknown'}: ${c.note}`;
    }).join('; ');
    if (corrText) parts.push(`纠错历史: ${corrText}`);
  }
  
  // 项目档案
  if (memories.project_profile) {
    const pp = memories.project_profile;
    const parts2 = [];
    if (pp.name) parts2.push(`名称: ${pp.name}`);
    if (pp.location) parts2.push(`位置: ${pp.location}`);
    if (pp.contact) parts2.push(`联系人: ${pp.contact}`);
    if (parts2.length > 0) {
      parts.push(`项目档案: ${parts2.join(', ')}`);
    }
  }
  
  return parts.length > 0 ? `## 长期记忆\n${parts.join('\n')}` : '';
}

/**
 * 记录一次纠错（用户纠正了 LLM 的错误）
 */
export async function recordCorrection(projectId, action, note) {
  try {
    const corrections = await getMemory(projectId, 'corrections') || [];
    corrections.push({ action, note, timestamp: Date.now() });
    // 保留最近 50 条
    if (corrections.length > 50) corrections.splice(0, corrections.length - 50);
    await saveMemory(projectId, 'corrections', corrections);
  } catch (e) {
    console.warn('[long-term-memory] correction save failed:', e.message);
  }
}

/**
 * 添加项目档案
 */
export async function setProjectProfile(projectId, profile) {
  await saveMemory(projectId, 'project_profile', profile);
}

/**
 * 清除项目所有记忆
 */
export async function clearAllMemory(projectId) {
  try {
    await query(`DELETE FROM ${TABLE} WHERE project_id=$1`, [projectId]);
  } catch (e) {
    console.warn('[long-term-memory] clear failed:', e.message);
  }
}
