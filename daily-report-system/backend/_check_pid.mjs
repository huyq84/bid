import {query} from './db.js';
const r1 = await query('SELECT id, project_id, time FROM dr_events LIMIT 5');
console.log(JSON.stringify(r1.rows));
const r2 = await query('SELECT DISTINCT project_id FROM dr_events');
console.log('Distinct:', JSON.stringify(r2.rows.map(x=>x.project_id)));
const r3 = await query('SELECT COUNT(*) FROM dr_events WHERE project_id IS NULL');
console.log('NULL project_id count:', r3.rows[0].count);
const r4 = await query('SELECT COUNT(*) FROM dr_events WHERE project_id = $1', ['baicaoyuan']);
console.log('baicaoyuan count:', r4.rows[0].count);
