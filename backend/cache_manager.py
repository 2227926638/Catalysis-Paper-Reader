import os
import json
from datetime import datetime
from typing import Optional, Dict

class CacheManager:
    """缓存管理器，用于管理文档处理后的文本缓存"""
    
    def __init__(self):
        # 缓存目录路径
        self.cache_dir = os.path.join(os.path.dirname(__file__), 'cache')
        # 确保缓存目录存在
        os.makedirs(self.cache_dir, exist_ok=True)
    
    def generate_cache_filename(self, document_id: int) -> str:
        """生成缓存文件名
        
        Args:
            document_id: 文档ID
            
        Returns:
            str: 缓存文件名
        """
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        return f"{document_id}_{timestamp}.json"
    
    def save_to_cache(self, document_id: int, original_file_path: str, processed_text: str) -> Optional[str]:
        print(f"开始保存文档 {document_id} 的缓存")
        print(f"缓存目录：{self.cache_dir}")
        
        try:
            # 确保缓存目录存在
            if not os.path.exists(self.cache_dir):
                print(f"创建缓存目录：{self.cache_dir}")
                os.makedirs(self.cache_dir)
            
            cache_filename = self.generate_cache_filename(document_id)
            cache_file_path = os.path.join(self.cache_dir, cache_filename)
            print(f"缓存文件路径：{cache_file_path}")
            
            # 准备缓存数据
            cache_data = {
                'document_id': document_id,
                'original_file_path': original_file_path,
                'processed_text': processed_text,
                'created_at': datetime.now().isoformat()
            }
            
            # 写入缓存文件
            print(f"正在写入缓存文件...")
            with open(cache_file_path, 'w', encoding='utf-8') as f:
                json.dump(cache_data, f, ensure_ascii=False, indent=2)
            
            print(f"缓存文件保存成功：{cache_filename}")
            return cache_file_path
        except Exception as e:
            print(f"保存缓存文件时出错: {str(e)}")
            print(f"错误类型: {type(e).__name__}")
            return None

    def get_from_cache(self, document_id: int) -> Optional[Dict]:
        print(f"尝试获取文档 {document_id} 的缓存")
        print(f"缓存目录：{self.cache_dir}")
        
        try:
            # 检查缓存目录是否存在
            if not os.path.exists(self.cache_dir):
                print("缓存目录不存在")
                return None
            
            # 获取所有与该文档ID相关的缓存文件
            cache_files = [f for f in os.listdir(self.cache_dir) 
                         if f.startswith(f"{document_id}_") and f.endswith('.json')]
            
            if not cache_files:
                print(f"未找到文档 {document_id} 的缓存文件")
                return None
            
            # 获取最新的缓存文件
            latest_cache = sorted(cache_files)[-1]
            cache_file_path = os.path.join(self.cache_dir, latest_cache)
            print(f"找到最新的缓存文件：{latest_cache}")
            
            # 读取缓存文件
            print("正在读取缓存文件...")
            with open(cache_file_path, 'r', encoding='utf-8') as f:
                cache_data = json.load(f)
            
            print(f"成功读取缓存文件")
            return cache_data
        except Exception as e:
            print(f"读取缓存文件时出错: {str(e)}")
            print(f"错误类型: {type(e).__name__}")
            return None
    
    def clear_old_caches(self, max_age_days: int = 7):
        """清理旧的缓存文件
        
        Args:
            max_age_days: 缓存文件最大保留天数
        """
        try:
            current_time = datetime.now()
            for filename in os.listdir(self.cache_dir):
                file_path = os.path.join(self.cache_dir, filename)
                file_modified_time = datetime.fromtimestamp(os.path.getmtime(file_path))
                age_days = (current_time - file_modified_time).days
                
                if age_days > max_age_days:
                    os.remove(file_path)
                    print(f"已删除过期缓存文件: {filename}")
        except Exception as e:
            print(f"清理缓存文件时出错: {str(e)}")