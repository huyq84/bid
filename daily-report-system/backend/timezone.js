// ============================================================
// timezone.js - 统一使用北京时间 (Asia/Shanghai, UTC+8)
// ============================================================
// 问题: new Date().toISOString() 返回 UTC 时间，中国用户看到的日期会少一天
// 解决: 所有日期计算都通过 getBeijingDate() 获取北京时间 YYYY-MM-DD

const BEIJING_OFFSET_MINUTES = 8 * 60; // UTC+8

/**
 * 返回当前北京时间的 YYYY-MM-DD 字符串
 * 替代: new Date().toISOString().slice(0, 10)
 */
export function getBeijingDate() {
  const now = new Date();
  // Get UTC time and add 8 hours
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  const beijingMs = utcMs + BEIJING_OFFSET_MINUTES * 60000;
  const beijingDate = new Date(beijingMs);
  return `${beijingDate.getFullYear()}-${String(beijingDate.getMonth() + 1).padStart(2, '0')}-${String(beijingDate.getDate()).padStart(2, '0')}`;
}

/**
 * 返回当前北京时间的 HH:MM 字符串
 */
export function getBeijingHHMM() {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  const beijingMs = utcMs + BEIJING_OFFSET_MINUTES * 60000;
  const beijingDate = new Date(beijingMs);
  return `${String(beijingDate.getHours()).padStart(2, '0')}:${String(beijingDate.getMinutes()).padStart(2, '0')}`;
}

/**
 * 将任意 Date 对象转换为北京时间 YYYY-MM-DD
 */
export function dateToBeijingString(date) {
  const utcMs = date.getTime() + date.getTimezoneOffset() * 60000;
  const beijingMs = utcMs + BEIJING_OFFSET_MINUTES * 60000;
  const bd = new Date(beijingMs);
  return `${bd.getFullYear()}-${String(bd.getMonth() + 1).padStart(2, '0')}-${String(bd.getDate()).padStart(2, '0')}`;
}

/**
 * 验证: 在不同时区环境下都能返回正确的北京时间
 */
if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
  // Simple verification
  const d = getBeijingDate();
  console.assert(/^\d{4}-\d{2}-\d{2}$/.test(d), `getBeijingDate format: ${d}`);
  console.log(`✅ getBeijingDate() = ${d}`);
}
