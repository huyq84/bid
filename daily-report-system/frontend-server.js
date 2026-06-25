// ============================================================
// frontend-server.js - 前端静态文件服务 + /api 反向代理
// 作用：
//   1. 静态托管 index.html / app.v3.js / styles.css 等
//   2. 把 /api/* 代理到 3010 后端（解决局域网访问问题）
//   3. 把 /ws 升级为 WebSocket 代理（聊天实时功能）
// ============================================================
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const os = require('os');

const PORT = 8088;
const BACKEND_PORT = 3010;
const ROOT_DIR = __dirname;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

// ============================================================
// 工具：收集局域网 IP，启动时打印给用户
// ============================================================
function getLanIps() {
  const interfaces = os.networkInterfaces();
  const ips = [];
  Object.values(interfaces).forEach(list => {
    list.forEach(info => {
      if (info.family === 'IPv4' && !info.internal) ips.push(info.address);
    });
  });
  return ips;
}

// ============================================================
// 工具：代理 HTTP 请求到后端
// ============================================================
function proxyHttp(req, res) {
  const opts = {
    hostname: '127.0.0.1',
    port: BACKEND_PORT,
    path: req.url,
    method: req.method,
    headers: { ...req.headers, host: `127.0.0.1:${BACKEND_PORT}` }
  };
  const proxyReq = http.request(opts, proxyRes => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });
  proxyReq.on('error', err => {
    console.error(`[proxy] 后端 ${req.url} 失败:`, err.message);
    res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: '后端不可达', detail: err.message }));
  });
  req.pipe(proxyReq);
}

// ============================================================
// 主服务器
// ============================================================
const server = http.createServer((req, res) => {
  // 1) /api/* 反向代理到后端 3010
  if (req.url.startsWith('/api/') || req.url === '/api') {
    return proxyHttp(req, res);
  }

  // 2) 静态文件
  const parsedUrl = url.parse(req.url, true);
  let decodedUrl = decodeURIComponent(parsedUrl.pathname);
  let filePath = path.join(ROOT_DIR, decodedUrl === '/' || decodedUrl === '' ? '/index.html' : decodedUrl);

  // 防目录穿越
  if (!filePath.startsWith(ROOT_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
});

// ============================================================
// WebSocket 代理（/ws → 3010）— 聊天/巡检实时推送
// 用 ws 库做协议级转发
// ============================================================
let WebSocketServer;
try {
  WebSocketServer = require('ws').WebSocketServer;
} catch (e) {
  console.warn('[警告] 未安装 ws，跳过 WebSocket 代理（聊天实时功能可能受限）');
}

if (WebSocketServer) {
  const wss = new WebSocketServer({ noServer: true });
  server.on('upgrade', (req, socket, head) => {
    if (req.url === '/ws' || req.url.startsWith('/ws?')) {
      wss.handleUpgrade(req, socket, head, client => {
        const backend = new (require('ws'))(`ws://127.0.0.1:${BACKEND_PORT}${req.url}`);
        client.on('message', msg => backend.send(msg));
        backend.on('message', msg => client.send(msg));
        client.on('close', () => backend.close());
        backend.on('close', () => client.close());
        client.on('error', () => backend.close());
        backend.on('error', () => client.close());
      });
    } else {
      socket.destroy();
    }
  });
}

// 修复：在 background 模式下 stdin 关闭会导致 Node 进程退出
// 显式 pause 掉 stdin 并 unref，让进程完全脱离父进程控制
if (process.stdin) {
  process.stdin.pause();
  process.stdin.unref && process.stdin.unref();
}
if (process.stdout && process.stdout.unref) {
  process.stdout.unref();
}
if (process.stderr && process.stderr.unref) {
  process.stderr.unref();
}

server.listen(PORT, '0.0.0.0', () => {
  const lanIps = getLanIps();
  console.log(`\n========================================`);
  console.log(`  前端服务已启动 (含 /api 反向代理)`);
  console.log(`  本机访问: http://localhost:${PORT}`);
  console.log(`  局域网访问地址：`);
  if (lanIps.length > 0) {
    lanIps.forEach(ip => console.log(`    http://${ip}:${PORT}`));
  } else {
    console.log(`    未检测到局域网网卡`);
  }
  console.log(`  后端代理: /api/* → 127.0.0.1:${BACKEND_PORT}`);
  console.log(`========================================\n`);
});
