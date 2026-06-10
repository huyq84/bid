//事实聚合引擎 - 把日报数据聚合成7 类事实表
// 输入：原始日报数组
// 输出：模板可直接消费的 facts 对象

function aggregate(rawWeek) {
 const facts = {};

 //1. 项目元信息
 facts.project = rawWeek.project;
 facts.week = rawWeek.week;

 //2.人员到岗事实表
 facts.staff = rawWeek.staff.map(s => ({
 no: s.no, role: s.role, name: s.name, phone: s.phone,
 present: s.present ? '已到岗' : '未到岗'
 }));
 facts.staff_summary = {
 total: rawWeek.staff.length,
 present: rawWeek.staff.filter(s => s.present).length,
 absent: rawWeek.staff.filter(s => !s.present).length
 };

 //3.重要节点事实表（按专业 × 月份矩阵）
 facts.milestones = rawWeek.milestones;

 //4. 工作完成事实表
 facts.work_done = rawWeek.work_done;
 const totalTasks = rawWeek.work_done.length;
 const completedTasks = rawWeek.work_done.filter(t => t.progress === '100%').length;
 facts.work_summary = {
 total: totalTasks,
 completed: completedTasks,
 completion_rate: totalTasks >0 ? Math.round(completedTasks *100 / totalTasks) + '%' : '0%'
 };

 //5. 工种人数事实表
 facts.workers = rawWeek.workers;
 facts.workers_total_this_week = rawWeek.workers.reduce((s, w) => s + w.this_week,0);
 facts.workers_total_next_week = rawWeek.workers.reduce((s, w) => s + w.next_week,0);

 //6.整改销项事实表
 facts.ecc = rawWeek.ecc;

 //7. 图纸深化事实表
 facts.drawings = rawWeek.drawings;
 facts.drawings_summary = {
 total: rawWeek.drawings.length,
 completed: rawWeek.drawings.filter(d => d.status === '已完成').length,
 in_progress: rawWeek.drawings.filter(d => d.status === '进行中').length
 };

 //8. 下周计划事实表
 facts.next_week_plan = rawWeek.next_week_plan;

 //9. 施工段计划事实表
 facts.construction_segments = rawWeek.construction_segments;

 //10.协调事宜事实表
 facts.coordinations = rawWeek.coordinations;

 return facts;
}

module.exports = { aggregate };
