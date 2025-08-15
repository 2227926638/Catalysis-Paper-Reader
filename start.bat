@echo off
setlocal
set PIP_NO_CACHE_DIR=1
set PIP_INDEX_URL=https://pypi.tuna.tsinghua.edu.cn/simple
echo ========================================
echo      文献分析与总结Web应用 v0.1.0
echo ========================================
echo 正在启动服务，请稍候...
echo.

echo [1/3] 启动后端服务 (端口: 8000)...
start "后端服务" cmd /k "cd /d "%~dp0backend" && set PYO3_USE_ABI3_FORWARD_COMPATIBILITY=1 && python -m pip install -r requirements.txt --no-cache-dir --index-url https://pypi.tuna.tsinghua.edu.cn/simple --use-pep517 && echo 后端服务启动中... && python main.py"

echo [2/3] 等待后端服务初始化...
timeout /t 5

echo [3/3] 启动前端服务 (端口: 3002)...
start "前端服务" cmd /k "cd /d "%~dp0frontend" && npm install --prefer-offline --no-audit && echo 前端服务启动中... && npm start"

echo.
echo ========================================
echo 启动完成！服务信息：
echo - 前端应用: http://localhost:3002
echo - 后端API: http://localhost:8000
echo - API文档: http://localhost:8000/docs
echo ========================================
echo.
echo 注意事项：
echo 1. 如遇端口冲突，前端会自动切换端口
echo 2. 首次启动需要安装依赖，请耐心等待
echo 3. 两个服务窗口请保持打开状态
echo.
echo 正在打开浏览器...
timeout /t 3
start http://localhost:3002