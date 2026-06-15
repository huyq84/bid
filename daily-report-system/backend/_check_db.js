const {query} = require('./db');
(async () => {
  let r = await query("SELECT column_name FROM information_schema.columns WHERE table_name='dr_daily_plans'");
  console.log('dr_daily_plans columns:', r.rows.map(c => c.column_name));
  r = await query("SELECT column_name FROM information_schema.columns WHERE table_name='dr_events'");
  console.log('dr_events columns:', r.rows.map(c => c.column_name));
  r = await query('SELECT id, plan_id, type, source FROM dr_events ORDER BY id DESC LIMIT 10');
  console.log('Events:', JSON.stringify(r.rows, null, 2));
  r = await query('SELECT id, type, task_name, date, progress FROM dr_daily_plans ORDER BY date');
  console.log('Plans:', JSON.stringify(r.rows, null, 2));
  process.exit(0);
})();
