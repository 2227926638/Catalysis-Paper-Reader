from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from ai_service import call_openrouter_api

router = APIRouter()

class ChatRequest(BaseModel):
    message: str
    context: Optional[str] = None

class ChatResponse(BaseModel):
    message: str
    error: Optional[str] = None

@router.post("/chat", response_model=ChatResponse)
async def chat_with_ai(request: ChatRequest):
    """处理AI聊天请求"""
    try:
        # 构建消息格式
        messages = [
            {"role": "system", "content": "你是一个专业的科研文献助手，可以回答关于科研文献、材料科学和化学工程的问题。"}, 
            {"role": "user", "content": request.message}
        ]
        
        # 如果有上下文，添加到消息中
        if request.context:
            messages.insert(1, {"role": "assistant", "content": request.context})
        
        # 调用OpenRouter API
        response_data = call_openrouter_api(messages)
        
        # 提取回复内容
        if response_data and "choices" in response_data and len(response_data["choices"]) > 0:
            ai_message = response_data["choices"][0]["message"]["content"]
            return ChatResponse(message=ai_message)
        else:
            return ChatResponse(message="抱歉，我无法生成回复。", error="API返回数据格式错误")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))