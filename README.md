# 催化文献分析与总结Web应用

## 项目概述

这是一个专门用于催化领域科研文献分析的Web应用程序，支持批量处理PDF格式文献，通过AI技术自动提取催化活性数据、表征手段、催化剂制备方法等关键信息，并提供数据可视化、智能聊天分析等功能。

## 功能特点

- **文献上传与管理**：支持批量上传PDF格式文献，自动分类管理
- **AI智能分析**：自动提取催化活性数据、表征手段、催化剂制备方法等关键信息
- **数据可视化**：将活性数据按不同x轴生成折线图、散点图、柱状图等
- **智能聊天助手**：内嵌AI聊天功能，辅助科研探索和文献分析
- **实时分析进度**：WebSocket实时跟踪文献分析进度
- **多文献对比**：支持选择多篇文献进行数据对比分析

## 技术栈

### 前端
- React.js 18.2.0
- Ant Design 5.12.1
- React Router DOM 6.20.1
- Plotly.js 3.0.1（数据可视化）
- PDF.js（PDF文档处理）
- Axios（HTTP客户端）
- WebSocket（实时通信）

### 后端
- Python FastAPI 0.104.1
- SQLite数据库（SQLAlchemy 2.0.23）
- Uvicorn 0.24.0（ASGI服务器）
- OpenAI API（AI分析）
- HuggingFace Hub（AI模型集成）
- PyPDF2（PDF文档处理）
- WebSocket（实时通信）

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
├── frontend/                    # 前端React应用
│   ├── public/                 # 静态资源
│   │   ├── index.html         # 主页面模板
│   │   ├── manifest.json      # PWA配置
│   │   └── pdf.worker.js      # PDF.js工作线程
│   ├── src/                   # 源代码
│   │   ├── components/        # 可复用组件
│   │   ├── pages/            # 页面组件
│   │   ├── services/         # API服务
│   │   ├── context/          # React Context
│   │   └── utils/            # 工具函数
│   ├── package.json          # 前端依赖配置
│   └── package-lock.json     # 依赖锁定文件
├── backend/                    # 后端FastAPI应用
│   ├── main.py               # 主应用入口
│   ├── models.py             # 数据模型
│   ├── ai_service.py         # AI分析服务
│   ├── ai_chat.py            # AI聊天服务
│   ├── document_processor.py # 文档处理服务
│   ├── websocket_service.py  # WebSocket服务
│   ├── logger_config.py      # 日志配置
│   ├── init_db.py           # 数据库初始化
│   ├── create_dirs.py       # 目录创建脚本
│   ├── requirements.txt     # Python依赖
│   ├── uploads/             # 上传文件存储（运行时创建）
│   ├── results/             # 分析结果存储（运行时创建）
│   └── literature_analysis.db # SQLite数据库（运行时创建）
├── start.bat                  # 一键启动脚本
├── .gitignore                # Git忽略文件配置
└── README.md                 # 项目说明文档
```

## 主要功能模块

### 1. 文献上传页面
- 支持拖拽上传PDF文档
- 文件预览和管理功能
- 批量上传处理
- 上传进度实时显示

### 2. 文献分析页面
- 文档列表展示和筛选
- AI智能分析结果展示
- 实时分析进度跟踪
- 详细分析结果查看

### 3. 数据可视化页面
- 选择已分析文献
- 催化活性数据表格展示
- 多种图表类型（折线图、散点图、柱状图）
- 可配置图表轴和数据源
- 多文献数据对比分析

### 4. AI聊天助手
- 基于文献内容的智能问答
- 科研探索辅助功能
- 实时对话交互

## AI分析能力

本应用专门针对催化领域文献进行优化，能够自动提取：

- **催化活性数据**：转化率、选择性、产率等关键数据
- **表征手段及结论**：XRD、SEM、TEM、XPS等表征结果
- **催化剂制备方法**：合成路线、制备条件、处理工艺
- **实验条件**：反应温度、压力、时间等参数
- **材料信息**：催化剂组成、载体、助剂等
- **主要发现**：重要结论和创新点
- **实验价值与启示**：研究意义和应用前景

## 环境要求

- Node.js 16+
- Python 3.8+
- 现代浏览器（Chrome、Firefox、Safari、Edge）
- OpenAI API密钥（用于AI分析功能）

## 注意事项

1. 首次启动时会自动安装依赖，请耐心等待
2. 需要配置OpenAI API密钥才能使用AI分析功能
3. 如遇端口冲突，前端会自动切换到可用端口
4. 建议使用start.bat脚本启动以获得最佳体验
5. 上传的PDF文件和分析结果会保存在本地，请注意数据安全

## 开发状态

当前版本：v1.0.0

已实现功能：
- ✅ PDF文档上传与存储
- ✅ AI文档智能分析
- ✅ 催化活性数据可视化
- ✅ 实时聊天分析助手
- ✅ WebSocket实时通信
- ✅ 多文献数据对比
- ✅ 响应式UI设计

## 许可证

本项目采用MIT许可证，详见LICENSE文件。

## 贡献

欢迎提交Issue和Pull Request来改进本项目。

## 联系方式

如有问题或建议，请通过GitHub Issues联系我们。
