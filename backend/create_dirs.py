import os

# 获取当前脚本所在目录的绝对路径
script_dir = os.path.dirname(os.path.abspath(__file__))

# 创建必要的目录（使用绝对路径）
uploads_dir = os.path.join(script_dir, "uploads")
results_dir = os.path.join(script_dir, "results")

os.makedirs(uploads_dir, exist_ok=True)
os.makedirs(results_dir, exist_ok=True)

# 初始化数据库表结构
from models import Base, engine
Base.metadata.create_all(bind=engine)

print("目录创建成功！")
print(f"当前工作目录: {os.getcwd()}")
print(f"uploads目录路径: {uploads_dir}")
print(f"results目录路径: {results_dir}")