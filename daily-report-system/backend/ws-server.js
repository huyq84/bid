import { WebSocketServer } from 'ws';
import { query } from './db.js';

export function createWsServer(server) {
  const wss = new WebSocketServer({ server, path: '/ws/chat' });

  wss.on('connection', (ws) => {
    ws.on('error', () => {});
  });

  startInspectionScheduler(wss);
  return wss;
}

function startInspectionScheduler(wss) {
  const notifiedWindows = new Set();

  async function tick() {
    try {
      const settings = await getInspectionSettings();
      const now = new Date();
      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      const times = settings.times || ['08:30', '13:00', '17:30'];
      const interval = settings.interval || 60;
      const halfInterval = Math.floor(interval / 2);

      for (const t of times) {
        const [h, m] = t.split(':').map(Number);
        const targetMinutes = h * 60 + m;
        const windowStart = targetMinutes - halfInterval;
        const windowEnd = targetMinutes + halfInterval;
        const windowKey = t;

        if (currentMinutes >= windowStart && currentMinutes <= windowEnd) {
          if (!notifiedWindows.has(windowKey)) {
            notifiedWindows.add(windowKey);
            broadcast(wss, [{
              projectId: 'baicaoyuan',
              message: '🔔 ' + t + ' 巡检提醒：到时间进行巡检了，请查看现场情况。'
            }]);
          }
        } else {
          notifiedWindows.delete(windowKey);
        }
      }
    } catch (_) {}
  }

  tick();
  setInterval(tick, 30000);
}

async function getInspectionSettings() {
  try {
    const result = await query("SELECT value FROM dr_settings WHERE key='inspection_times'");
    if (result.rows.length) return result.rows[0].value;
  } catch (_) {}
  return { times: ['08:30', '13:00', '17:30'], interval: 60 };
}

function broadcast(wss, reminders) {
  const msg = JSON.stringify({ type: 'reminders', reminders });
  wss.clients.forEach(client => {
    if (client.readyState === 1) client.send(msg);
  });
}

export function broadcastInspection(wss) {
  broadcast(wss, [{
    projectId: 'baicaoyuan',
    message: '🔔 手动巡检提醒：请查看现场情况。'
  }]);
}
