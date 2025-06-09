# 数据库初始化脚本
import os
import sys

# 获取当前脚本所在目录的绝对路径
script_dir = os.path.dirname(os.path.abspath(__file__))

# 创建必要的目录（使用绝对路径）
uploads_dir = os.path.join(script_dir, "uploads")
results_dir = os.path.join(script_dir, "results")

os.makedirs(uploads_dir, exist_ok=True)
os.makedirs(results_dir, exist_ok=True)

# 初始化数据库表结构
from models import Base, engine, create_tables

# 确保数据库表被创建
create_tables()

print("数据库初始化成功！")
print(f"当前工作目录: {os.getcwd()}")
print(f"脚本目录: {script_dir}")
print(f"uploads目录路径: {uploads_dir}")
print(f"results目录路径: {results_dir}")

# 返回成功状态码
sys.exit(0)