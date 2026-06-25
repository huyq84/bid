const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8088;
const ROOT_DIR = 'D:\\hyq\\cjs\\zb\\daily-report-system';

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
};

http.createServer((req, res) => {
  let urlPath = req.url.split('?')[0]; // Remove query params
  if (urlPath === '/') urlPath = '/index.html';
  
  const filePath = path.join(ROOT_DIR, urlPath);
  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      console.error(`[404] ${req.method} ${req.url} -> ${filePath}`);
      res.writeHead(404);
      res.end('Not Found');
      return;
    }
    console.log(`[200] ${req.method} ${req.url}`);
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}).listen(PORT, '0.0.0.0', () => {
  console.log(`Frontend server running at http://localhost:${PORT}`);
  console.log(`ROOT_DIR: ${ROOT_DIR}`);
});
