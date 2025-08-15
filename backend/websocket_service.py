# -*- coding: utf-8 -*-
from fastapi import WebSocket, WebSocketDisconnect
import json
import time
import asyncio
from datetime import datetime
import logging
from typing import Dict, List, Callable, Optional

# 配置日志记录器
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 分析进度管理类
class AnalysisProgressManager:
    def __init__(self):
        # 存储所有活跃的WebSocket连接
        self.active_connections: Dict[int, List[WebSocket]] = {}
        # 存储每个文档的分析进度
        self.analysis_progress: Dict[int, Dict] = {}
        # 存储正在进行的分析任务
        self.analysis_tasks: Dict[int, asyncio.Task] = {}
        # 分析项目列表
        self.analysis_items = [
            "文献标题",
            "作者列表",
            "发表期刊/会议",
            "发表年份",
            "摘要",
            "关键词",
            "催化反应类型",
            "活性数据",
            "催化剂制备方法",
            "表征手段及结论",
            "主要founded发现",
            "结论",
            "实验价值与启示"
        ]
        # 每个项目的超时时间（秒）
        self.item_timeout = 10
    
    async def connect(self, websocket: WebSocket, document_id: int):
        """建立新的WebSocket连接"""
        logger.info(f"[WebSocket连接] 开始处理文档ID:{document_id}的连接请求")
        try:
            # 注意：websocket现在应该已经在main.py中被接受，这里不需要再次接受
            # 不再尝试接受连接，避免出现WebSocket已接受错误
            logger.info(f"[WebSocket连接] 文档ID:{document_id}的连接处理中")
            
            if document_id not in self.active_connections:
                self.active_connections[document_id] = []
            self.active_connections[document_id].append(websocket)
            logger.info(f"[WebSocket连接] 文档ID:{document_id}的连接已添加到活跃连接列表，当前连接数:{len(self.active_connections[document_id])}")
            
            # 发送连接确认消息
            try:
                await websocket.send_json({"type": "connection_established", "document_id": document_id})
                logger.info(f"[WebSocket连接] 已发送连接确认消息到文档ID:{document_id}")
            except Exception as e:
                logger.error(f"[WebSocket错误] 发送连接确认消息失败: {str(e)}")
            
            # 如果已有进度信息，立即发送给新连接的客户端
            if document_id in self.analysis_progress:
                logger.info(f"[WebSocket连接] 向文档ID:{document_id}的新连接发送现有进度信息")
                await websocket.send_json(self.analysis_progress[document_id])
            else:
                # 初始化进度信息并发送
                logger.info(f"[WebSocket连接] 文档ID:{document_id}没有进度信息，初始化并发送")
                progress = self.init_progress(document_id)
                await websocket.send_json(progress)
                
                # 注意：不再在这里自动启动分析任务，因为分析任务应该在文献上传时就已经启动
            
            # 处理心跳消息
            last_heartbeat = time.time()
            while True:
                try:
                    data = await asyncio.wait_for(websocket.receive_json(), timeout=30)
                    if data.get('type') == 'heartbeat':
                        last_heartbeat = time.time()
                        await websocket.send_json({'type': 'heartbeat_response', 'timestamp': datetime.now().isoformat()})
                        logger.info(f"[WebSocket心跳] 文档ID:{document_id}收到心跳并已响应")
                    elif data.get('type') == 'restart_analysis':
                        # 处理重新启动分析的请求
                        logger.info(f"[WebSocket消息] 文档ID:{document_id}请求重新启动分析")
                        try:
                            # 重置进度
                            self.init_progress(document_id)
                            # 发送初始进度
                            await websocket.send_json(self.analysis_progress[document_id])
                            
                            # 如果存在旧的分析任务，先取消它
                            if document_id in self.analysis_tasks:
                                old_task = self.analysis_tasks[document_id]
                                if not old_task.done():
                                    old_task.cancel()
                                    await asyncio.sleep(1)  # 等待任务取消
                                del self.analysis_tasks[document_id]
                            
                            # 启动新的分析任务
                            success = await self.start_analysis(document_id)
                            
                            # 返回确认消息
                            await websocket.send_json({
                                'type': 'restart_response', 
                                'success': success,
                                'message': '分析任务已重新启动' if success else '启动分析任务失败'
                            })
                        except Exception as e:
                            error_msg = f"重启分析任务失败: {str(e)}"
                            logger.error(f"[WebSocket错误] {error_msg}")
                            await websocket.send_json({
                                'type': 'restart_response', 
                                'success': False, 
                                'message': error_msg
                            })
                            # 更新进度状态为错误
                            if document_id in self.analysis_progress:
                                self.analysis_progress[document_id]['status'] = 'error'
                                await self.broadcast_progress(document_id, self.analysis_progress[document_id])
                    elif time.time() - last_heartbeat > 180:
                        logger.warning(f"[WebSocket心跳] 文档ID:{document_id}心跳超时(>180s)，准备断开连接")
                        raise WebSocketDisconnect()
                    else:
                        # 处理其他类型的消息
                        logger.info(f"[WebSocket消息] 文档ID:{document_id}收到未知类型消息: {data}")
                except asyncio.TimeoutError:
                    if time.time() - last_heartbeat > 180:
                        logger.warning(f"[WebSocket心跳] 文档ID:{document_id}接收消息超时且心跳超时(>180s)，准备断开连接")
                        raise WebSocketDisconnect()
                    logger.debug(f"[WebSocket心跳] 文档ID:{document_id}接收消息超时，但心跳仍在有效期内，继续等待")
        except WebSocketDisconnect:
            logger.info(f"[WebSocket断开] 文档ID:{document_id}的WebSocket连接已断开")
            self.disconnect(websocket, document_id)
        except Exception as e:
            logger.error(f"[WebSocket错误] 处理文档ID:{document_id}的WebSocket消息时出错: {str(e)}")
            self.disconnect(websocket, document_id)
    
    def disconnect(self, websocket: WebSocket, document_id: int):
        """断开WebSocket连接"""
        try:
            if not isinstance(document_id, int):
                logger.error(f"无效的文档ID类型: {type(document_id)}，值: {document_id}")
                return

            logger.info(f"尝试断开文档 {document_id} 的连接，当前活跃连接: {self.active_connections}")
            
            if document_id in self.active_connections:
                if websocket in self.active_connections[document_id]:
                    self.active_connections[document_id].remove(websocket)
                    logger.info(f"成功移除文档 {document_id} 的WebSocket连接")
                
                if not self.active_connections[document_id]:
                    del self.active_connections[document_id]
                    logger.info(f"文档 {document_id} 的所有连接已移除")
            else:
                logger.warning(f"尝试断开不存在的文档ID连接: {document_id}")
        except Exception as e:
            logger.error(f"断开连接时发生异常: {str(e)}", exc_info=True)
    
    async def broadcast_progress(self, document_id: int, progress_data: Dict):
        """向所有连接到特定文档的客户端广播进度信息"""
        logger.info(f"[广播开始] 文档ID:{document_id} 客户端数:{len(self.active_connections.get(document_id, []))}")
        if document_id in self.active_connections:
            # 更新进度信息
            self.analysis_progress[document_id] = progress_data
            
            # 广播给所有连接的客户端
            for idx, connection in enumerate(self.active_connections[document_id]):
                try:
                    logger.debug(f"[广播进度] 文档ID:{document_id} 正在发送给第{idx+1}个客户端")
                    await connection.send_json(progress_data)
                except Exception as e:
                    logger.error(f"发送进度更新时出错: {str(e)}")
        logger.info(f"[广播完成] 文档ID:{document_id} 状态:{progress_data.get('status')} 当前进度:{progress_data.get('overall_progress')}%")
    
    def init_progress(self, document_id: int):
        """初始化文档的分析进度"""
        logger.info(f"[进度初始化] 开始初始化文档ID:{document_id}")
        self.analysis_progress[document_id] = {
            "document_id": document_id,
            "current_item": self.analysis_items[0] if self.analysis_items else None,
            "current_item_index": 0,
            "total_items": len(self.analysis_items),
            "completed_items": [],
            "skipped_items": [],
            "overall_progress": 0,
            "status": "processing"
        }
        logger.info(f"[进度初始化完成] 文档ID:{document_id} 总项目数:{len(self.analysis_items)}")
        return self.analysis_progress[document_id]
    
    def update_progress(self, document_id: int, item_name: str, status: str = "completed"):
        """更新特定项目的分析进度"""
        logger.info(f"[进度更新] 文档ID:{document_id} 正在处理项目: {item_name} 状态: {status}")
        if document_id not in self.analysis_progress:
            logger.info(f"[进度初始化] 为文档ID:{document_id} 创建新进度记录")
            self.init_progress(document_id)
        
        progress = self.analysis_progress[document_id]
        
        # 更新已完成或已跳过的项目
        if status == "completed":
            progress["completed_items"].append(item_name)
        elif status == "skipped":
            progress["skipped_items"].append(item_name)
        
        # 计算总体进度百分比
        total = progress["total_items"]
        completed = len(progress["completed_items"]) + len(progress["skipped_items"])
        progress["overall_progress"] = int((completed / total) * 100) if total > 0 else 0
        print(f"[进度统计] 文档ID:{document_id} 总进度: {progress['overall_progress']}% 已完成项目: {len(progress['completed_items'])} 跳过项目: {len(progress['skipped_items'])}")
        
        # 更新当前正在分析的项目
        current_index = progress["current_item_index"]
        if current_index < len(self.analysis_items) - 1:
            progress["current_item_index"] = current_index + 1
            progress["current_item"] = self.analysis_items[current_index + 1]
        else:
            # 所有项目已处理完成
            progress["current_item"] = None
            progress["status"] = "completed"
        
        return progress
    
    async def start_analysis(self, document_id: int):
        """启动文档分析任务"""
        print(f"[分析启动] 开始启动文档ID:{document_id}的分析任务")
        
        # 避免循环导入
        from models import Document, SessionLocal
        
        # 获取文档信息
        db = SessionLocal()
        print(f"[分析启动] 成功创建数据库会话")
        try:
            document = db.query(Document).filter(Document.id == document_id).first()
            if document:
                # 取消已有的任务（如果存在）
                if document_id in self.analysis_tasks and not self.analysis_tasks[document_id].done():
                    print(f"[分析启动] 取消文档ID:{document_id}的现有分析任务")
                    self.analysis_tasks[document_id].cancel()
                
                try:
                    # 导入分析函数
                    from main import analyze_document_with_ai
                    print(f"[分析启动] 成功导入analyze_document_with_ai函数")
                    
                    # 创建任务完成回调
                    def task_done_callback(task):
                        try:
                            exception = task.exception()
                            if exception:
                                print(f"[分析任务] 文档ID:{document_id}的分析任务出错: {str(exception)}")
                                if document_id in self.analysis_progress:
                                    self.analysis_progress[document_id]['status'] = 'error'
                            else:
                                print(f"[分析任务] 文档ID:{document_id}的分析任务已完成")
                                if document_id in self.analysis_progress:
                                    self.analysis_progress[document_id]['status'] = 'completed'
                        except asyncio.CancelledError:
                            print(f"[分析任务] 文档ID:{document_id}的分析任务被取消")
                        except Exception as e:
                            print(f"[分析任务] 处理任务回调时出错: {str(e)}")
                    
                    # 创建并启动新任务
                    task = asyncio.create_task(analyze_document_with_ai(document.path, document_id, db))
                    task.add_done_callback(task_done_callback)
                    self.analysis_tasks[document_id] = task
                    print(f"[分析启动] 已启动文档ID:{document_id}的分析任务")
                    return True
                except Exception as e:
                    print(f"[分析启动] 创建分析任务时出错: {str(e)}")
                    return False
            else:
                print(f"[分析启动] 文档ID:{document_id}不存在，无法启动分析")
                return False
        except Exception as e:
            print(f"[分析启动] 启动分析任务时出错: {str(e)}")
            return False
        finally:
            if db:
                db.close()
    
    def get_progress(self, document_id: int):
        """获取文档的当前分析进度"""
        if document_id not in self.analysis_progress:
            return self.init_progress(document_id)
        return self.analysis_progress[document_id]

# 创建全局实例
progress_manager = AnalysisProgressManager()