// 测试 ES Module 读取
import fs from 'fs';

const MODELS_FILE = 'D:\\hyq\\cjs\\zb\\daily-report-system\\custom-models.json';
console.log('文件存在:', fs.existsSync(MODELS_FILE));
console.log('内容:', fs.readFileSync(MODELS_FILE, 'utf-8').substring(0, 300));
