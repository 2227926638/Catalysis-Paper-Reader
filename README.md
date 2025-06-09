# 文献分析与总结Web应用

## 项目概述

这是一个基于Web的应用程序，用于批量处理科研文献（PDF、Word格式），通过AI技术提取特定信息，并提供数据可视化、文献总结和专业分析功能。

## 功能特点

- 支持批量上传PDF、Word格式文献
- 文献分类管理（按主题、日期、作者等）
- AI自动提取关键信息（实验数据、研究方法、材料性能参数等）
- 数据可视化（时间趋势图、性能对比图等）
- 文献综合分析（对比分析、趋势报告、研究热点识别）
- 分析报告导出（PDF、Word、Excel等格式）

## 技术栈

### 前端
- React.js
- Ant Design
- PDF.js & mammoth.js（文档处理）
- ECharts（数据可视化）

### 后端
- Python FastAPI
- PostgreSQL
- Elasticsearch
- AI模型集成

## 安装与运行

### 前端服务
```bash
# 进入前端目录
cd frontend

# 安装依赖
npm install

# 启动开发服务器
npm start
```

## 项目结构

```
/
├── public/                 # 静态资源
├── src/                    # 源代码
│   ├── components/         # 组件
│   ├── pages/              # 页面
│   ├── services/           # API服务
│   ├── utils/              # 工具函数
│   ├── App.js              # 应用入口
│   └── index.js            # 主入口
└── package.json            # 项目配置
```

## 开发阶段

当前处于MVP（最小可行产品）阶段，实现基础功能：
- 基础文献上传与管理
- 简单AI文本分析功能
- 基础数据表格展示
- 简单可视化图表