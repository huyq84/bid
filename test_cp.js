
const fs = require('fs');
const vm = require('vm');
const sandbox = {
  console: console,
  document: { addEventListener: () => {}, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], createElement: () => ({}), body: { insertAdjacentHTML: () => {} } },
  setTimeout: setTimeout, clearTimeout: clearTimeout,
  indexedDB: undefined, navigator: { mediaDevices: undefined },
  localStorage: { _data: {}, getItem(k) { return this._data[k] || null; }, setItem(k, v) { this._data[k] = v; }, removeItem(k) { delete this._data[k]; }, clear() { this._data = {}; } }
};
sandbox.window = sandbox;
sandbox.global = sandbox;
vm.createContext(sandbox);

const files = [
  'platform/js/nav_tree.js', 'platform/js/report_list.js', 'platform/js/store.js',
  'platform/js/llm.js', 'platform/js/rules.js',
  'platform/js/sections/s03_roster.js', 'platform/js/sections/s0301_milestones.js',
  'platform/js/sections/s04_work_done.js', 'platform/js/sections/s05_photos.js',
  'platform/js/sections/s06_labor.js', 'platform/js/sections/s07_ecc.js',
  'platform/js/sections/s08_design.js', 'platform/js/sections/s09_plan.js',
  'platform/js/sections/s10_sections.js', 'platform/js/sections/s11_schedule.js',
  'platform/js/sections/s12_coord.js',
  'platform/js/modules/capture.js', 'platform/js/export_pdf.js', 'platform/js/app.js',
];
for (const f of files) {
  try { vm.runInContext(fs.readFileSync(f, 'utf-8'), sandbox, { filename: f }); }
  catch (e) { console.log('FAIL:', f, e.message); }
}
console.log('---');
console.log('window._changePeriod:', typeof sandbox.window._changePeriod);
console.log('window._toast:', typeof sandbox.window._toast);
console.log('window._rerender:', typeof sandbox.window._rerender);
console.log('window._currentPeriod_get:', typeof sandbox.window._currentPeriod_get);
console.log('global.ReportList:', typeof sandbox.global.ReportList);
console.log('ReportList.addNewPeriod:', typeof (sandbox.global.ReportList && sandbox.global.ReportList.addNewPeriod));

// 模拟 addNewPeriod 调用
try {
  sandbox.global.ReportList.addNewPeriod();
} catch (e) {
  console.log('addNewPeriod err:', e.message);
}
