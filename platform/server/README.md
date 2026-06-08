# 百草园周报 PDF 生成服务

## 功能特点

- ✅ **100% 还原预览效果**：使用 Puppeteer（真实 Chrome 引擎）渲染
- ✅ **无字体偏移问题**：完美复刻浏览器显示效果
- ✅ **一键下载**：无需用户手动选择"另存为PDF"
- ✅ **自动命名**：根据报告周期自动生成文件名
- ✅ **高清渲染**：2倍设备像素比，图片清晰

## 安装步骤

### 1. 安装 Node.js

确保已安装 Node.js（建议 v16 或更高版本）

检查版本：
```bash
node --version
npm --version
```

### 2. 安装依赖

在 `server` 目录下运行：
```bash
cd server
npm install
```

首次安装会自动下载 Chromium（约 300MB），请耐心等待。

### 3. 启动服务

```bash
npm start
```

或者使用开发模式（自动重启）：
```bash
npm run dev
```

## 使用方法

### 1. 启动服务后，访问：

```
http://localhost:3001/preview.html
```

### 2. 点击"导出 PDF（推荐）"按钮

系统会自动：
- 在服务器端渲染所有页面
- 生成高清 PDF
- 自动下载到本地

## API 接口

### POST /api/export-pdf

生成 PDF 文件

**请求体：**
```json
{
  "period": "2026-W22"
}
```

**响应：**
- Content-Type: application/pdf
- 直接返回 PDF 文件流

**示例（curl）：**
```bash
curl -X POST http://localhost:3001/api/export-pdf \
  -H "Content-Type: application/json" \
  -d '{"period":"2026-W22"}' \
  --output report.pdf
```

### GET /api/health

健康检查

**响应：**
```json
{
  "status": "ok",
  "service": "百草园周报 PDF 生成服务"
}
```

## 配置

### 修改端口

编辑 `server.js`，修改：
```javascript
const PORT = process.env.PORT || 3001;
```

或通过环境变量：
```bash
PORT=8080 npm start
```

### 性能优化

如果生成速度慢，可以调整：

1. **减少等待时间**（server.js 第 91 行）：
```javascript
await page.waitForTimeout(1000); // 从 2000 改为 1000
```

2. **禁用高清渲染**（server.js 第 30 行）：
```javascript
deviceScaleFactor: 1 // 从 2 改为 1
```

## 故障排除

### Puppeteer 安装失败

如果在中国大陆，可能需要设置镜像：

```bash
npm config set puppeteer_download_host=https://npmmirror.com/mirrors
npm install
```

### 端口被占用

更改 PORT 环境变量或修改 server.js 中的端口号。

### PDF 生成超时

增加超时时间（server.js）：
```javascript
waitUntil: 'networkidle0',
timeout: 120000 // 增加到 120 秒
```

## 部署到生产环境

### 使用 PM2

```bash
npm install -g pm2
pm2 start server.js --name weekly-report-pdf
pm2 save
```

### 使用 Docker

创建 `Dockerfile`：
```dockerfile
FROM node:18-slim

# 安装 Chromium 依赖
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf \
    --no-install-recommends

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

EXPOSE 3001
CMD ["npm", "start"]
```

构建并运行：
```bash
docker build -t weekly-report-pdf .
docker run -p 3001:3001 weekly-report-pdf
```

## 技术栈

- **Express.js**：Web 服务器
- **Puppeteer**：无头浏览器，PDF 生成
- **CORS**：跨域支持
