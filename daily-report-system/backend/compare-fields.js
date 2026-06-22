// compare-fields.js - 前后端字段一致性对比分析
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ============ 1. 读取后端文件 ============
const dbSchema = readFileSync(join(__dirname, 'db-schema.sql'), 'utf-8');
const chatActions = readFileSync(join(__dirname, 'chat-actions.js'), 'utf-8');
const llmTools = readFileSync(join(__dirname, 'llm-tools.js'), 'utf-8');
const llmClient = readFileSync(join(__dirname, 'llm-client.js'), 'utf-8');
const frontendHtml = readFileSync(join(__dirname, '..', 'index.html'), 'utf-8');
const appV3Js = readFileSync(join(__dirname, '..', 'app.v3.js'), 'utf-8');

// ============ 2. 解析数据库表结构 ============
function extractTables(sql) {
  const tables = {};
  const tableRegex = /CREATE TABLE (\w+) \((.*?)\);/gs;
  let match;
  while ((match = tableRegex.exec(sql)) !== null) {
    const tableName = match[1];
    const cols = [];
    const colRegex = /(\w+)\s+(\w+(?:\(\d+\))?)(?:\s+NOT\s+NULL)?(?:\s+DEFAULT\s+(.+?))?$/gm;
    let colMatch;
    while ((colMatch = colRegex.exec(match[2])) !== null) {
      cols.push({
        name: colMatch[1],
        type: colMatch[2],
        nullable: !colMatch[0].includes('NOT NULL'),
        default: colMatch[3]?.trim()
      });
    }
    tables[tableName] = cols;
  }
  return tables;
}

const tables = extractTables(dbSchema);
console.log('=== 数据库表结构 ===');
for (const [name, cols] of Object.entries(tables)) {
  console.log(`\n  ${name}:`);
  for (const c of cols) {
    console.log(`    ${c.name} ${c.type}${c.nullable ? ' NULL' : ' NOT NULL'}${c.default ? ' DEFAULT ' + c.default : ''}`);
  }
}

// ============ 3. 提取前端表单字段 ============
function extractFormFields(html, js) {
  const fields = {};
  
  // 从 HTML 中提取 form input/select/textarea 的 name 和 label
  const inputRegex = /<label[^>]*>([^<]*)<\/label>\s*<[^>]*(?:id|data-field|name)="([^"]+)"[^>]*>/gi;
  const nameRegex = /name="([^"]+)"/gi;
  
  // 查找所有表单相关元素
  const formElements = [];
  
  // 从 HTML 提取
  const htmlLabelRegex = /<label[^>]*>(.*?)<\/label>/gi;
  const htmlInputRegex = /<(?:input|select|textarea)[^>]*(?:id|name)="([^"]+)"/gi;
  
  // 从 JS 提取字段名
  const jsFieldNames = [];
  const jsFieldRegex = /(?:form\[|formData\.|form\.|\.value|\.checked|\.textContent|\.innerHTML)[\s]*['"`]([^"'`\]]+)['"`]/gi;
  let jm;
  while ((jm = jsFieldRegex.exec(js)) !== null) {
    jsFieldNames.push(jm[1]);
  }
  
  // 从 JS 提取 payload 结构
  const payloadKeys = [];
  const payloadRegex = /payload\s*(?:=|->>|push|append)\s*\{([^}]+)\}/g;
  let pm;
  while ((pm = payloadRegex.exec(js)) !== null) {
    const keys = pm[1].split(',').map(k => k.trim().split(':')[0]?.trim()).filter(Boolean);
    payloadKeys.push(...keys);
  }
  
  // 从 JS 提取 data-field 属性值
  const dataFieldRegex = /data-field="([^"]+)"/g;
  let df;
  const dataFields = [];
  while ((df = dataFieldRegex.exec(html)) !== null) {
    dataFields.push(df[1]);
  }
  
  // 从 JS 提取 appendRow 的参数
  const appendRowRegex = /appendRow\s*\(\s*\[([^\]]+)\]/g;
  let ar;
  const appendRows = [];
  while ((ar = appendRowRegex.exec(js)) !== null) {
    const args = ar[1].split(',').map(a => a.trim().replace(/['"]/g, '')).filter(Boolean);
    appendRows.push(args);
  }
  
  // 从 JS 提取 columnDefs
  const columnDefRegex = /columnDefs:\s*\[([\s\S]*?)\]/;
  const colDefMatch = columnDefRegex.exec(js);
  let columns = [];
  if (colDefMatch) {
    const colBlock = colDefMatch[1];
    const colRegex = /data:\s*'([^']+)'/g;
    let cm;
    while ((cm = colRegex.exec(colBlock)) !== null) {
      columns.push(cm[1]);
    }
  }
  
  return {
    dataFields,
    jsFieldNames: [...new Set(jsFieldNames)],
    payloadKeys: [...new Set(payloadKeys)],
    appendRows,
    columns
  };
}

const frontendFields = extractFormFields(frontendHtml, appV3Js);
console.log('\n\n=== 前端字段提取 ===');
console.log('data-field:', frontendFields.dataFields);
console.log('JS 字段名:', frontendFields.jsFieldNames.slice(0, 30));
console.log('payload 键:', frontendFields.payloadKeys.slice(0, 20));
console.log('appendRow 参数:', frontendFields.appendRows.map(r => r.slice(0, 10)));
console.log('columnDefs:', frontendFields.columns);

// ============ 4. 提取后端 handler 使用的字段 ============
function extractHandlerFields(source, funcName) {
  // 查找函数定义中的参数和解构
  const funcRegex = new RegExp(`${funcName}\\s*\\([^)]*\\)\\s*{`, 's');
  const match = funcRegex.exec(source);
  if (!match) return [];
  
  const funcBody = source.substring(match.index, Math.min(match.index + 2000, source.length));
  
  // 提取 data.xxx 和 data.yyy
  const fieldRefs = [];
  const refRegex = /data\.(?:(\w+)|\[(?:'([^']+)'|"([^"]+)")\])/g;
  let rm;
  while ((rm = refRegex.exec(funcBody)) !== null) {
    fieldRefs.push(rm[1] || rm[2] || rm[3]);
  }
  
  return [...new Set(fieldRefs)];
}

console.log('\n\n=== 后端 handler 字段使用 ===');
const handlers = [
  'createEvent', 'updateEvent', 'batchDelete', 'confirmEvent',
  'createIssue', 'updateIssue', 'closeIssue', 'updatePlan'
];
for (const handler of handlers) {
  const fields = extractHandlerFields(chatActions, handler);
  if (fields.length > 0) {
    console.log(`\n  ${handler}: ${fields.join(', ')}`);
  }
}

// ============ 5. 提取工具 schema 的输入字段 ============
console.log('\n\n=== 工具 schema 输入字段 ===');
const toolInputRegex = /name:\s*'(\w+)'[\s\S]*?properties:\s*\{([^}]+(?:\{[^}]+\}[^}]*)*)\}/g;
let tm;
while ((tm = toolInputRegex.exec(llmTools)) !== null) {
  // 跳过 query 工具
  if (tm[1].startsWith('query')) continue;
  console.log(`\n  ${tm[1]}:`);
  const propRegex = /(\w+):/g;
  let pm2;
  while ((pm2 = propRegex.exec(tm[2])) !== null) {
    console.log(`    - ${pm2[1]}`);
  }
}

console.log('\n\n=== 分析完成 ===');
