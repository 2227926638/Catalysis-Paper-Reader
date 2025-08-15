# 文献分析与总结Web应用

## 项目概述

这是一个基于Web的应用程序，用于批量处理科研文献（PDF格式），通过AI技术提取特定信息，并提供数据可视化、文献总结和专业分析功能。

## 功能特点

- 支持批量上传PDF格式文献
- 文献分类管理（按反应类型分类）
- AI自动提取关键信息（实验数据、研究方法、材料性能参数等）
- 数据可视化（折线图、散点图、柱状图等）
- 文献综合分析（AI聊天分析、数据表格展示）
- 实时分析进度跟踪

## 技术栈

### 前端
- React.js 18.2.0
- Ant Design 5.12.1
- React Router DOM 6.20.1
- Plotly.js 3.0.1（数据可视化）
- PDF.js（文档处理）
- Axios（HTTP客户端）

### 后端
- Python FastAPI 0.104.1
- SQLite数据库（SQLAlchemy 2.0.23）
- Uvicorn 0.24.0（ASGI服务器）
- AI模型集成
- 文档处理（PyPDF2）

## 快速启动

### 方式一：使用启动脚本（推荐）
```bash
# 双击运行start.bat文件，或在命令行中执行：
start.bat
```

### 方式二：手动启动

#### 启动后端服务
```bash
# 进入后端目录
cd backend

# 安装Python依赖
pip install -r requirements.txt

# 启动后端服务（端口8000）
python main.py
```

#### 启动前端服务
```bash
# 进入前端目录
cd frontend

# 安装依赖
npm install

# 启动开发服务器（端口3002或3003）
npm start
```

## 访问应用

- 前端应用：http://localhost:3002 或 http://localhost:3003
- 后端API：http://localhost:8000
- API文档：http://localhost:8000/docs

## 项目结构

```
文章总结工具/
├── frontend/               # 前端React应用
│   ├── public/            # 静态资源
│   ├── src/               # 源代码
│   │   ├── components/    # 可复用组件
│   │   ├── pages/         # 页面组件
│   │   ├── services/      # API服务
│   │   └── utils/         # 工具函数
│   └── package.json       # 前端依赖配置
├── backend/               # 后端FastAPI应用
│   ├── main.py           # 主应用入口
│   ├── models.py         # 数据模型
│   ├── ai_service.py     # AI服务
│   ├── document_processor.py # 文档处理
│   ├── requirements.txt  # Python依赖
│   ├── uploads/          # 上传文件存储
│   └── literature_analysis.db # SQLite数据库
├── start.bat             # 一键启动脚本
└── README.md             # 项目说明
```

## 环境要求

- Node.js 16+
- Python 3.8+
- 现代浏览器（Chrome、Firefox、Safari、Edge）