# 安全配置指南

## ⚠️ 重要安全提醒

本项目使用DeepSeek API，需要配置API密钥。为了保护您的API密钥安全，请务必遵循以下步骤：

## 🔧 配置步骤

### 1. 复制环境变量模板
```bash
cp backend/.env.example backend/.env
```

### 2. 编辑 .env 文件
打开 `backend/.env` 文件，将 `YOUR_DEEPSEEK_API_KEY` 替换为您的实际API密钥：

```env
OPENAI_API_KEY=sk-your-actual-deepseek-api-key-here
```

### 3. 获取DeepSeek API密钥
1. 访问 [DeepSeek平台](https://platform.deepseek.com/)
2. 注册/登录账户
3. 在API密钥管理页面创建新的API密钥
4. 复制密钥并粘贴到 `.env` 文件中

## 🛡️ 安全最佳实践

### ✅ 应该做的：
- 将 `.env` 文件添加到 `.gitignore`（已配置）
- 定期轮换API密钥
- 不要在代码中硬编码API密钥
- 不要将 `.env` 文件提交到版本控制系统

### ❌ 不应该做的：
- 不要在公开的代码仓库中暴露API密钥
- 不要在聊天记录、邮件或其他地方分享API密钥
- 不要将API密钥写在代码注释中

## 🚨 如果API密钥泄露了怎么办？

1. **立即撤销泄露的API密钥**
   - 登录DeepSeek平台
   - 删除或禁用泄露的API密钥

2. **生成新的API密钥**
   - 创建新的API密钥
   - 更新本地 `.env` 文件

3. **检查使用情况**
   - 查看API使用记录，确认是否有异常调用
   - 如有异常，联系DeepSeek客服

## 📝 注意事项

- 本项目的 `.gitignore` 文件已配置忽略 `.env` 文件
- 请使用 `.env.example` 作为模板，不要直接修改此文件
- 如果您是项目贡献者，请确保不要提交包含真实API密钥的文件

## 🔗 相关链接

- [DeepSeek官网](https://www.deepseek.com/)
- [DeepSeek API文档](https://platform.deepseek.com/api-docs/)
- [API密钥管理](https://platform.deepseek.com/api_keys)