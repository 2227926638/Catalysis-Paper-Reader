@echo off
setlocal
set PIP_NO_CACHE_DIR=1
set PIP_INDEX_URL=https://pypi.tuna.tsinghua.edu.cn/simple
echo 正在启动文章总结工具...

echo 1. 启动后端服务...
start cmd /k "cd /d "%~dp0backend" && set PYO3_USE_ABI3_FORWARD_COMPATIBILITY=1 && python -m pip install -r requirements.txt --no-cache-dir --index-url https://pypi.tuna.tsinghua.edu.cn/simple --use-pep517 && python -m uvicorn main:app --reload --port 8000"

echo 2. 等待后端服务启动...
timeout /t 3

echo 3. 启动前端服务...
start cmd /k "cd /d "%~dp0frontend" && npm install --prefer-offline --no-audit && set PORT=3002 && npm start"

echo 启动完成！请在浏览器中访问 http://localhost:3002
echo 如果浏览器没有自动打开，请手动访问上述地址

start http://localhost:3002