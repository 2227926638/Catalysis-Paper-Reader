import os
from dotenv import load_dotenv
import json
import requests

# 指定环境变量文件路径
env_path = os.path.join(os.path.dirname(__file__), '.env')

# 检查.env文件是否存在
if not os.path.exists(env_path):
    print(f"❌ 环境变量文件 {env_path} 不存在")
    exit(1)

# 加载环境变量
with open(env_path, 'r', encoding='utf-8') as f:
    load_dotenv(stream=f)

# 创建请求payload
payload = {
    "model": os.getenv("OPENAI_SERVICE_TYPE"),
    "messages": [
        {"role": "system", "content": "You are a professional chemistry literature analysis assistant"},
        {"role": "user", "content": "Please analyze the core content of this literature in Chinese"}
    ],
    "temperature": float(os.getenv("OPENAI_TEMPERATURE", 0.7)),
    "stream": False  # Add this line
}

try:
    # 添加环境变量校验
    OPENAI_API_ENDPOINT = os.getenv('OPENAI_API_ENDPOINT')
    if not OPENAI_API_ENDPOINT:
        print("❌ OPENAI_API_ENDPOINT 未配置")
        exit(1)
    
    # 获取API密钥
    OPENAI_API_KEY = os.getenv('OPENAI_API_KEY')
    if not OPENAI_API_KEY:
        print("❌ OPENAI_API_KEY 未配置")
        exit(1)
    
    # 规范化API端点URL
    if not OPENAI_API_ENDPOINT.endswith('/'):
        OPENAI_API_ENDPOINT += '/'
    
    # 构建完整请求URL
    api_url = f"{OPENAI_API_ENDPOINT}chat/completions"
    
    # 修改请求部分
    response = requests.post(
        url=api_url,
        headers={
            "Authorization": f"Bearer {os.getenv('OPENAI_API_KEY')}",
            "Content-Type": "application/json",
            "HTTP-Referer": "http://localhost:3000",
            "X-Title": "Literature Analysis Tool",
            "User-Agent": "Literature Analysis Tool/1.0.0"  # Add User-Agent
        },
        json=payload,
        timeout=30
    )
    
    # Add response status check
    if response.status_code != 200:
        print(f"\n❌ API Error: {response.status_code}")
        print(f"Response: {response.text}")
        exit(1)
        
    # 添加响应编码设置
    response.encoding = 'utf-8'
    response.raise_for_status()
    
    result = response.json()
    print("\n✅ AI test successful! Response:")  # 修改为英文
    print(json.dumps(result, indent=2, ensure_ascii=False))

except requests.exceptions.RequestException as e:
    print(f"\n❌ Request failed: {str(e)}")  # 修改为英文
except Exception as e:
    print(f"\n❌ Test failed: {str(e)}")  # 修改为英文