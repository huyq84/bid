const {query} = require('./db');
(async () => {
  let r = await query('SELECT id, project_id, time, payload FROM dr_events WHERE project_id IS NULL LIMIT 5');
  console.log('NULL project_id events:', r.rows.length);
  r = await query('SELECT id, project_id, time, payload FROM dr_events WHERE project_id = $1 LIMIT 5', ['baicaoyuan']);
  console.log('baicaoyuan events:', r.rows.length);
  r = await query('SELECT DISTINCT project_id FROM dr_events');
  console.log('Distinct project_ids:', r.rows.map(x => x.project_id));
})();
