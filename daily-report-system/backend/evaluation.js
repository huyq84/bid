// evaluation.js - 评估闭环
// 记录每次对话的质量指标，用于后续优化
import { query } from './db.js';

const TABLE = 'dr_evaluations';

/**
 * 初始化评估表
 */
export async function initEvalTable() {
  try {
    await query(`CREATE TABLE IF NOT EXISTS ${TABLE} (
      id SERIAL PRIMARY KEY,
      session_id TEXT,
      project_id TEXT NOT NULL,
      message TEXT NOT NULL,
      reply TEXT,
      actions_taken INTEGER DEFAULT 0,
      tools_called INTEGER DEFAULT 0,
      hallucination_detected BOOLEAN DEFAULT FALSE,
      hallucination_details TEXT,
      user_feedback TEXT,  -- 'good' | 'bad' | 'neutral'
      score INTEGER,       -- 0-100
      created_at TIMESTAMP DEFAULT NOW()
    )`);
  } catch (e) {
    console.warn('[evaluation] init failed:', e.message);
  }
}

/**
 * 记录一次对话评估
 */
export async function recordEvaluation(sessionId, projectId, opts = {}) {
  try {
    await query(
      `INSERT INTO ${TABLE} (session_id, project_id, message, reply, actions_taken, 
       tools_called, hallucination_detected, hallucination_details, user_feedback, score)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        sessionId,
        projectId,
        opts.message || '',
        opts.reply ? (opts.reply.length > 500 ? opts.reply.slice(0, 500) : opts.reply) : null,
        opts.actionsTaken || 0,
        opts.toolsCalled || 0,
        opts.hallucinationDetected || false,
        opts.hallucinationDetails || null,
        opts.userFeedback || null,
        opts.score || null
      ]
    );
  } catch (e) {
    console.warn('[evaluation] record failed:', e.message);
  }
}

/**
 * 自动检测幻觉（基于 actions/results 分析）
 * 如果 LLM 声称做了某事但 actions/results 为空，标记为幻觉
 */
export function detectHallucination(reply, actions, results) {
  if (!reply || !actions || actions.length === 0) return false;
  
  // 如果 reply 包含"已记录"/"已完成"/"已删除"等词但 actions 为空
  const actionWords = ['已记录', '已完成', '已删除', '已更新', '已创建', '搞定', '完成'];
  for (const word of actionWords) {
    if (reply.includes(word) && actions.length === 0) {
      return true;
    }
  }
  return false;
}

/**
 * 获取项目评估统计
 */
export async function getEvalStats(projectId, days = 7) {
  try {
    const r = await query(
      `SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN hallucination_detected THEN 1 ELSE 0 END) as hallucinations,
        AVG(score) as avg_score,
        SUM(CASE WHEN user_feedback = 'good' THEN 1 ELSE 0 END) as good_feedback,
        SUM(CASE WHEN user_feedback = 'bad' THEN 1 ELSE 0 END) as bad_feedback
       FROM ${TABLE} 
       WHERE project_id=$1 AND created_at >= NOW() - INTERVAL '${days} days'`,
      [projectId]
    );
    return r.rows[0] || {};
  } catch {
    return {};
  }
}
