@echo off
echo ====================================
echo 百草园周报 PDF 生成服务
echo ====================================
echo.

cd /d "%~dp0"

echo 检查 Node.js 是否已安装...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 未检测到 Node.js，请先安装 Node.js
    echo 下载地址: https://nodejs.org/
    pause
    exit /b 1
)

echo Node.js 版本:
node --version
echo.

if not exist "node_modules\" (
    echo 首次运行，正在安装依赖...
    echo 这可能需要几分钟，请耐心等待...
    echo.
    npm install
    if %errorlevel% neq 0 (
        echo [错误] 依赖安装失败
        pause
        exit /b 1
    )
    echo.
    echo 依赖安装完成！
    echo.
)

echo 启动服务...
echo.
node server.js

pause
