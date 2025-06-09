# -*- coding: utf-8 -*-
import sys
import codecs
import os
import shutil
import json
import uuid
import asyncio
import time
import re
import requests
from datetime import datetime
from typing import List, Optional, Dict
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Depends, BackgroundTasks, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from dotenv import load_dotenv
from models import Document, Analysis, get_db, create_tables

from websocket_service import progress_manager
from ai_service import call_openrouter_api, analyze_document_content
from document_processor import DocumentProcessor
from logger_config import main_logger, ai_response_logger

# 创建FastAPI应用
app = FastAPI(title="文献分析工具API", description="用于文献上传、分析和数据可视化的API")

# 配置CORS和安全响应头中间件
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

# 导入AI聊天路由
from ai_chat import router as chat_router

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        # 添加安全响应头
        response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, proxy-revalidate'
        response.headers['X-Content-Type-Options'] = 'nosniff'
        return response

# 添加CORS中间件
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 在生产环境中应该限制为特定域名
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 添加安全响应头中间件
app.add_middleware(SecurityHeadersMiddleware)

# 注册AI聊天路由
app.include_router(chat_router, prefix="/api")

# 确保上传和结果目录存在
uploads_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "uploads")
results_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "results")
os.makedirs(uploads_dir, exist_ok=True)
os.makedirs(results_dir, exist_ok=True)

# 挂载静态文件目录
app.mount("/uploads", StaticFiles(directory=uploads_dir), name="uploads")
app.mount("/results", StaticFiles(directory=results_dir), name="results")

# 创建数据库表
create_tables()

# 工具函数：调用AI服务进行文献分析
# 导入所需的模块和变量
from websocket_service import progress_manager

async def analyze_document_with_ai(document_path: str, document_id: int):
    """使用AI服务分析文档内容，并实时更新分析进度"""
    db = None # 初始化db为None
    try:
        db = next(get_db()) # 在函数内部获取新的数据库会话
        main_logger.info(f"开始分析文档 {document_id}")
        # 获取分析项目列表
        analysis_items = progress_manager.analysis_items
        
        # 更新文档状态为处理中
        document = db.query(Document).filter(Document.id == document_id).first()
        if not document:
            main_logger.error(f"文档 {document_id} 不存在")
            raise Exception("文档不存在")
            
        # 提取文档内容
        main_logger.info(f"开始提取文档 {document_id} 的内容，路径：{document_path}")
        processor = DocumentProcessor()
        document_content = processor.process_document(document_path, document_id)
        
        # 如果文档内容提取失败
        if not document_content:
            main_logger.error(f"文档 {document_id} 内容提取失败")
            await progress_manager.broadcast_progress(document_id, {"status": "error", "error_message": "无法提取文档内容，请检查文件格式是否正确"})
            raise Exception("无法提取文档内容，请检查文件格式是否正确")
        
        # 检查文档内容长度
        if len(document_content) > 100000:  # 如果内容超过10万字符
            main_logger.warning(f"文档 {document_id} 内容过长: {len(document_content)} 字符，可能会影响分析效果")
        
        # 更新进度
        main_logger.info(f"文档 {document_id} 内容提取完成")
        progress_manager.update_progress(document_id, "文档内容提取完成", 20)
        document.status = "processing"
        db.commit()
        
        # 调用AI服务分析文档内容
        # 使用ai_service.py中的函数进行文档分析
        print(f"正在调用AI服务分析文档内容", flush=True)
        
        # 定义整体分析超时时间 (例如：10分钟)
        overall_analysis_timeout = progress_manager.overall_timeout if hasattr(progress_manager, 'overall_timeout') else 600 
        function_start_time = time.time() # 用于函数级别的超时

        try:
            # 更新进度
            progress_manager.update_progress(document_id, "正在调用AI服务分析文档", 30)
            await progress_manager.broadcast_progress(document_id, progress_manager.get_progress(document_id))
            
            # 使用ai_service.py中的函数进行文档分析
            # 在调用 analyze_document_content 前检查整体超时
            if time.time() - function_start_time > overall_analysis_timeout:
                main_logger.error(f"文档 {document_id} 整体分析超时（调用AI服务前）")
                await progress_manager.broadcast_progress(document_id, {"status": "error", "error_message": "整体分析超时，请稍后重试"})
                raise Exception("整体分析超时，请稍后重试")

            analysis_json = analyze_document_content(document_content)
            main_logger.info(f"文档 {document_id} AI分析完成")
            # 记录原始AI响应到日志文件
            ai_response_logger.info(f"Document ID: {document_id}, AI Response: {json.dumps(analysis_json, ensure_ascii=False)}")
        except Exception as e:
            main_logger.error(f"调用AI服务分析文档内容时出错: {str(e)}")
            await progress_manager.broadcast_progress(document_id, {"status": "error", "error_message": f"AI服务调用失败: {str(e)}"})            
            raise
        
        # 逐项分析并更新进度
        result_json = {}
        for item in analysis_items:
            main_logger.info(f"文档 {document_id} 正在处理分析项目: {item}")
            # 更新当前正在分析的项目
            progress = progress_manager.get_progress(document_id)
            progress["current_item"] = item
            await progress_manager.broadcast_progress(document_id, progress)
            
            # 模拟分析过程，设置超时时间
            start_time = time.time()
            timeout = progress_manager.item_timeout
            
            # 从AI响应中提取该项目的数据
            item_data = analysis_json.get(item, None)
            main_logger.info(f"文档 {document_id} 项目 {item} 的数据是否找到: {item_data is not None}")
            
            # 检查是否超时或未找到数据
            elapsed_time = time.time() - start_time
            if elapsed_time > timeout or item_data is None:
                # 项目分析超时或未找到数据，标记为跳过
                main_logger.warning(f"文档 {document_id} 项目 {item} 超时或未找到数据，标记为跳过")
                progress = progress_manager.update_progress(document_id, item, "skipped")
            else:
                # 项目分析成功，保存数据并更新进度
                main_logger.info(f"文档 {document_id} 项目 {item} 分析成功，保存数据")
                result_json[item] = item_data
                progress = progress_manager.update_progress(document_id, item, "completed")
            
            # 广播进度更新
            await progress_manager.broadcast_progress(document_id, progress)
            
            # 短暂延迟，模拟分析过程
            await asyncio.sleep(0.5)
        
        # 提取结构化数据
        title = result_json.get("文献标题", "")
        authors = json.dumps(result_json.get("作者列表", []), ensure_ascii=False)
        publication = result_json.get("发表期刊/会议", "")
        year = result_json.get("发表年份", "")
        abstract = result_json.get("摘要", "")
        keywords = json.dumps(result_json.get("关键词", []), ensure_ascii=False)
        
        # 保存分析结果
        analysis = Analysis(
            document_id=document_id,
            title=title,
            authors=authors,
            publication=publication,
            year=year,
            abstract=abstract,
            keywords=keywords,
            content=json.dumps(result_json, ensure_ascii=False, indent=2).encode('utf-8').decode('utf-8'),
            raw_ai_response=json.dumps(analysis_json, ensure_ascii=False, indent=2).encode('utf-8').decode('utf-8') # 保存原始AI响应
        )
        
        db.add(analysis)
        db.commit()
        
        # 更新文档状态
        document = db.query(Document).filter(Document.id == document_id).first()
        if document:
            document.status = "analyzed"
            db.commit()
        
        # 更新最终进度状态
        progress = progress_manager.get_progress(document_id)
        progress["status"] = "completed"
        progress["overall_progress"] = 100
        await progress_manager.broadcast_progress(document_id, progress)
        
        return True
    except Exception as e:
        print(f"分析文档时出错: {str(e)}", flush=True)
        # 更新文档状态为错误
        document = db.query(Document).filter(Document.id == document_id).first()
        if document:
            document.status = "error"
            db.commit()
        
        # 更新进度状态为错误
        progress = progress_manager.get_progress(document_id)
        progress["status"] = "error"
        progress["error_message"] = str(e)
        await progress_manager.broadcast_progress(document_id, progress)
        
        return False
    finally:
        if db: # 确保在函数结束时关闭数据库会话
            db.close()

# WebSocket路由
@app.websocket("/ws/analysis/{document_id}")
async def websocket_analysis_progress(websocket: WebSocket, document_id: int):
    db = None
    try:
        # 记录连接尝试
        print(f"[WebSocket] 连接请求 文档ID: {document_id} 来源IP: {websocket.client.host}")
        print(f"完整请求头: {dict(websocket.headers)}")
        print(f"客户端信息: {websocket.client}")
        
        # 先接受WebSocket连接，确保连接建立
        await websocket.accept()
        print(f"[WebSocket] 文档ID: {document_id} 连接已接受")
        
        # 查询数据库验证文档
        from models import Document, SessionLocal
        db = SessionLocal()
        document = db.query(Document).filter(Document.id == document_id).first()
        if not document:
            await websocket.close(code=4001, reason="文档不存在")
            print(f"[验证失败] 文档ID {document_id} 不存在")
            return

        # 直接调用progress_manager的connect方法处理WebSocket连接
        # 这个方法会处理心跳消息
        await progress_manager.connect(websocket, document_id)
        
        # 注意：connect方法内部已经包含了消息处理循环，不需要在这里再处理
        # 如果执行到这里，说明connect方法已经结束（可能是因为连接断开）
    
    except WebSocketDisconnect:
        print(f"[WebSocket断开] 文档ID: {document_id} 客户端主动断开连接")
    
    except Exception as e:
        print(f"[WebSocket错误] {str(e)}")
        try:
            if not websocket.client_state.disconnected:
                await websocket.accept()
                await websocket.close(code=1011, reason=f"服务器内部错误: {str(e)}")
        except Exception as close_error:
            print(f"[关闭连接错误] 尝试关闭WebSocket连接时出错: {str(close_error)}")
    
    finally:
        # 清理资源
        if db is not None:
            db.close()
        
        # 记录详细关闭原因
        close_code = websocket.close_code if hasattr(websocket, 'close_code') and websocket.close_code else 1006
        close_reason = websocket.close_reason if hasattr(websocket, 'close_reason') and websocket.close_reason else "未知原因"
        print(f"[连接关闭] 文档ID: {document_id} 关闭代码: {close_code} 原因: {close_reason}\n最后接收时间: {datetime.now().isoformat()}\n活跃连接数: {len(progress_manager.active_connections.get(document_id, []))}")
        
        # WebSocket连接的断开由progress_manager.connect内部处理


# API路由
@app.get("/")
async def read_root():
    return {"message": "文献分析工具API服务正在运行"}

@app.get("/api/analysis/progress/{document_id}")
async def get_analysis_progress(document_id: int):
    """获取文档分析进度"""
    progress = progress_manager.get_progress(document_id)
    return progress

@app.post("/api/upload")
async def upload_file(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    category: str = Form("未分类"),
    db: Session = Depends(get_db)
):
    """上传文献文件并保存到数据库"""
    try:
        # 检查文件类型
        if not (file.filename.endswith(".pdf") or file.filename.endswith(".docx") or file.filename.endswith(".doc")):
            raise HTTPException(status_code=400, detail="只支持PDF和Word文档格式")
        
        # 检查文件大小
        file_size = 0
        chunk_size = 1024 * 1024  # 1MB
        file.file.seek(0, 2)  # 移动到文件末尾
        file_size = file.file.tell()  # 获取文件大小
        file.file.seek(0)  # 重置文件指针
        
        # 如果文件过大，返回错误
        if file_size > 50 * 1024 * 1024:  # 50MB
            raise HTTPException(status_code=400, detail="文件大小超过限制（最大50MB）")
        
        # 生成唯一文件名
        file_extension = os.path.splitext(file.filename)[1]
        unique_filename = f"{uuid.uuid4()}{file_extension}"
        file_path = os.path.join(uploads_dir, unique_filename)
        
        # 保存文件
        try:
            with open(file_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
            main_logger.info(f"文件 {file.filename} 已保存到 {file_path}，大小: {file_size/1024/1024:.2f}MB")
        except Exception as e:
            main_logger.error(f"文件处理失败: {str(e)}")
            raise HTTPException(status_code=500, detail=f"文件处理失败: {str(e)}")
        
        # 确定文件类型
        if file.filename.endswith(".pdf"):
            file_type = "PDF"
        else:
            file_type = "Word"
        
        # 创建数据库记录
        document = Document(
            name=file.filename,
            type=file_type,
            path=file_path,
            category=category,
            status="uploaded"  # 先设置为已上传状态
        )
        
        db.add(document)
        db.commit()
        db.refresh(document)
        
        # 初始化分析进度，确保WebSocket可以立即获取进度信息
        progress_manager.init_progress(document.id)
        
        # 更新状态为处理中
        document.status = "processing"
        db.commit()
        
        # 在后台任务中分析文档
        try:
            background_tasks.add_task(analyze_document_with_ai, file_path, document.id)
            main_logger.info(f"已启动文档 {document.id} 的分析任务")
        except Exception as e:
            main_logger.error(f"启动分析任务失败: {str(e)}")
            document.status = "error"
            db.commit()
            raise HTTPException(status_code=500, detail=f"启动分析任务失败: {str(e)}")
        
        return {"id": document.id, "name": file.filename, "status": "processing"}
    
    except HTTPException as e:
        # 直接重新抛出HTTP异常
        raise
    except Exception as e:
        main_logger.error(f"文件上传失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"文件上传失败: {str(e)}")

@app.get("/api/documents")
async def get_documents(db: Session = Depends(get_db)):
    """获取所有已上传的文档"""
    documents = db.query(Document).all()
    return [doc.to_dict() for doc in documents]

@app.get("/api/documents/{document_id}")
async def get_document(document_id: int, db: Session = Depends(get_db)):
    """获取特定文档的详细信息"""
    document = db.query(Document).filter(Document.id == document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="文档不存在")
    return document.to_dict()

@app.get("/api/download/{document_id}")
async def download_document(document_id: int, db: Session = Depends(get_db)):
    """下载文档文件"""
    document = db.query(Document).filter(Document.id == document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="文档不存在")
    
    return FileResponse(path=document.path, filename=document.name, media_type="application/octet-stream")

@app.delete("/api/documents/{document_id}")
async def delete_document(document_id: int, db: Session = Depends(get_db)):
    """删除文档及其相关数据"""
    try:
        # 查找文档
        document = db.query(Document).filter(Document.id == document_id).first()
        if not document:
            raise HTTPException(status_code=404, detail="文档不存在")
        
        # 删除文件
        try:
            if os.path.exists(document.path):
                os.remove(document.path)
        except Exception as e:
            main_logger.error(f"删除文件失败: {str(e)}")
            raise HTTPException(status_code=500, detail=f"删除文件失败: {str(e)}")
        
        # 删除数据库记录（级联删除会自动删除相关的分析记录）
        db.delete(document)
        db.commit()
        
        return {"message": "文档已成功删除"}
    except HTTPException as e:
        raise e
    except Exception as e:
        main_logger.error(f"删除文档失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"删除文档失败: {str(e)}")

@app.post("/api/analyze/{document_id}")
async def analyze_document(
    document_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """手动触发文档分析"""
    document = db.query(Document).filter(Document.id == document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="文档不存在")
    
    # 检查文档是否已经在分析中
    if document.status == "processing":
        return {"message": "文档正在分析中", "document_id": document_id, "status": "processing"}
    
    # 更新状态为处理中
    document.status = "processing"
    db.commit()
    
    # 初始化分析进度
    progress_manager.init_progress(document.id)
    
    # 在后台任务中分析文档
    background_tasks.add_task(analyze_document_with_ai, document.path, document.id)
    
    return {"message": "文档分析已开始", "document_id": document_id}

@app.get("/api/analysis/{document_id}")
async def get_analysis(document_id: int, db: Session = Depends(get_db)):
    """获取文档的分析结果"""
    analysis = db.query(Analysis).filter(Analysis.document_id == document_id).first()
    if not analysis:
        raise HTTPException(status_code=404, detail="分析结果不存在")
    
    analysis_dict = analysis.to_dict()
    analysis_dict['raw_ai_response'] = analysis.raw_ai_response # 添加原始AI响应
    return analysis_dict

@app.post("/api/documents/{document_id}/reanalyze")
async def reanalyze_document(document_id: int, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """重新启动文档分析"""
    document = db.query(Document).filter(Document.id == document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="文档不存在")

    # 可以选择在这里更新文档状态为 processing
    # document.status = "processing"
    # db.commit()
    # db.refresh(document)

    # 触发后台分析任务
    background_tasks.add_task(analyze_document_with_ai, document.path, document.id)

    return {"message": "文档分析已重新启动", "document_id": document.id}

@app.get("/api/visualization/activity-data")
async def get_activity_data(db: Session = Depends(get_db)):
    """获取所有文献的活性数据，用于可视化"""
    analyses = db.query(Analysis).all()
    activity_data = []
    
    for analysis in analyses:
        try:
            content = json.loads(analysis.content) if analysis.content else {}
            if "活性数据" in content and content["活性数据"]:
                document = db.query(Document).filter(Document.id == analysis.document_id).first()
                if document:
                    activity_data.append({
                        "document_id": analysis.document_id,
                        "document_name": document.name,
                        "activity_data": content["活性数据"],
                        "year": analysis.year
                    })
        except Exception as e:
            print(f"处理活性数据时出错: {str(e)}", flush=True)
    
    return activity_data

@app.get("/api/visualization/catalyst-methods")
async def get_catalyst_methods(db: Session = Depends(get_db)):
    """获取所有文献的催化剂制备法，用于可视化"""
    analyses = db.query(Analysis).all()
    catalyst_methods = []
    
    for analysis in analyses:
        try:
            content = json.loads(analysis.content) if analysis.content else {}
            if "催化剂制备法" in content and content["催化剂制备法"]:
                document = db.query(Document).filter(Document.id == analysis.document_id).first()
                if document:
                    catalyst_methods.append({
                        "document_id": analysis.document_id,
                        "document_name": document.name,
                        "catalyst_method": content["催化剂制备法"],
                        "year": analysis.year
                    })
        except Exception as e:
            print(f"处理催化剂制备法时出错: {str(e)}", flush=True)
    
    return catalyst_methods

# 启动服务器
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="", port=8000, reload=True)
# 调试信息已注释掉