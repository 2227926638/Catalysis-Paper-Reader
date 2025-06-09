from typing import List, Dict
import os
import json
import requests
import re
from dotenv import load_dotenv
from logger_config import main_logger as logger, ai_response_logger

# 指定环境变量文件路径
env_path = os.path.join(os.path.dirname(__file__), '.env')

# 检查.env文件是否存在
if not os.path.exists(env_path):
    print(f"❌ 环境变量文件 {env_path} 不存在")
    exit(1)

# 加载环境变量
with open(env_path, 'r', encoding='utf-8') as f:
    load_dotenv(stream=f)

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

# 获取其他AI服务配置
OPENAI_SERVICE_TYPE = os.getenv("OPENAI_SERVICE_TYPE")
OPENAI_TEMPERATURE = float(os.getenv("OPENAI_TEMPERATURE", "0.7"))

def call_openrouter_api(messages: List[Dict[str, str]]) -> Dict:
    """调用OpenRouter API进行对话"""
    try:
        # 规范化API端点URL
        if not OPENAI_API_ENDPOINT.endswith('/'):
            OPENAI_API_ENDPOINT_NORMALIZED = OPENAI_API_ENDPOINT + '/'
        else:
            OPENAI_API_ENDPOINT_NORMALIZED = OPENAI_API_ENDPOINT
        
        # 构建完整请求URL
        api_url = f"{OPENAI_API_ENDPOINT_NORMALIZED}chat/completions"
        
        # 创建请求payload
        payload = {
            "model": OPENAI_SERVICE_TYPE,
            "messages": messages,
            "temperature": OPENAI_TEMPERATURE,
            "stream": False
        }
        
        # 修改请求部分
        response = requests.post(
            url=api_url,
            headers={
                "Authorization": f"Bearer {OPENAI_API_KEY}",
                "Content-Type": "application/json",
                "HTTP-Referer": "http://localhost:3000",
                "X-Title": "Literature Analysis Tool",
                "User-Agent": "Literature Analysis Tool/1.0.0"
            },
            json=payload,
            timeout=30
        )
        
        # Add response status check
        if response.status_code != 200:
            print(f"\n❌ API Error: {response.status_code}")
            print(f"Response: {response.text}")
            raise requests.exceptions.RequestException(f"API返回错误状态码: {response.status_code}")
            
        # 添加响应编码设置
        response.encoding = 'utf-8'
        response.raise_for_status()
        
        return response.json()
    
    except requests.exceptions.RequestException as e:
        logger.error(f"Request failed: {type(e).__name__} - {str(e)}", exc_info=True)
        # 打印更详细的错误信息，帮助诊断是否是 requests 库内部问题
        if hasattr(e, 'request') and e.request:
            logger.error(f"Request details: Method={e.request.method}, URL={e.request.url}")
        if hasattr(e, 'response') and e.response is not None:
            logger.error(f"Response details: Status={e.response.status_code}, Body={e.response.text[:500]}")
        raise
    except Exception as e:
        logger.error(f"API call failed: {type(e).__name__} - {str(e)}", exc_info=True)
        raise

def analyze_document_content(document_content: str) -> Dict:
    """分析文档内容并返回结构化结果，通过两次AI调用分离活性数据。"""
    logger.info("开始执行 ai_service.analyze_document_content (两步调用)")
    
    # 初始化最终结果
    final_result = {}
    activity_data_markdown_part = ""

    # --- 第一次AI调用：获取除活性数据外的所有信息 --- 
    try:
        logger.info("准备第一次AI调用：提取通用信息")
        prompt_general_info = f"""
        请分析以下科研文献，提取除活性数据之外的关键信息：
        1. 文献标题
        2. 作者列表
        3. 发表期刊/会议
        4. 发表年份
        5. 摘要
        6. 关键词
        7. 催化剂制备方法
        8. 表征手段及结论
        9. 主要founded发现
        10. 结论
        11. 实验价值与启示：你是一名从事热催化的研究者，这篇文献对你在催化剂的理解上，以及催化剂制备法上，以及表征手段上有哪些启示，你在这其中学到了什么，输出一段条理清晰的文字
        请以纯粹的JSON格式返回结果，不包含任何额外的文本、解释或Markdown代码块（例如 ```json ）。结果必须是一个有效的JSON对象，包含以上所有字段。对于催化剂制备法、表征手段及结论、结论和实验价值与启示，请尽可能详细提取并结构化。

文献内容：
        {document_content}
        """
        messages_general = [
            {"role": "system", "content": "You are a professional chemistry literature analysis assistant"},
            {"role": "user", "content": prompt_general_info}
        ]
        
        response_general = call_openrouter_api(messages_general)
        logger.info(f"第一次AI调用完成. AI原始响应 (通用信息): {json.dumps(response_general, ensure_ascii=False)}")
        ai_response_logger.info(f"Raw AI Response (General Info): {json.dumps(response_general, ensure_ascii=False)}")

        general_content = response_general["choices"][0]["message"]["content"]
        
        # 解析第一次调用的JSON结果
        parsed_general_json = None
        json_match_markdown_general = re.search(r'```json\s*([\s\S]*?)\s*```', general_content)
        if json_match_markdown_general:
            parsed_general_json_str = json_match_markdown_general.group(1)
            try:
                parsed_general_json = json.loads(parsed_general_json_str)
            except json.JSONDecodeError as e:
                logger.warning(f"解析第一次调用Markdown代码块中JSON失败: {e}")
        
        if parsed_general_json is None:
            json_match_regex_general = re.search(r'\{.*\}', general_content, re.DOTALL)
            if json_match_regex_general:
                try:
                    parsed_general_json = json.loads(json_match_regex_general.group(0))
                except json.JSONDecodeError as e:
                    logger.warning(f"解析第一次调用Regex匹配JSON失败: {e}")

        if parsed_general_json is None:
            try:
                parsed_general_json = json.loads(general_content)
            except json.JSONDecodeError as e:
                logger.error(f"直接解析第一次调用内容为JSON失败: {e}. 内容: {general_content[:200]}...")
                raise Exception("第一次AI响应 (通用信息) 解析失败")

        if not isinstance(parsed_general_json, dict):
            logger.error(f"第一次AI响应 (通用信息) 解析结果不是字典: {parsed_general_json}")
            raise Exception("第一次AI响应 (通用信息) 解析结果不是预期的字典格式")
        
        final_result.update(parsed_general_json)
        logger.info("第一次AI调用 (通用信息) 解析成功并合并到结果中.")

    except Exception as e:
        logger.error(f"第一次AI调用或解析过程中发生错误: {str(e)}", exc_info=True)
        # 如果第一次调用失败，我们可能仍希望尝试第二次调用，或者直接抛出异常
        # 这里选择继续尝试第二次调用，但最终结果可能不完整
        # 或者，可以取消注释下一行以在第一次失败时立即失败：
        # raise

    # --- 第二次AI调用：专门提取活性数据 --- 
    try:
        logger.info("准备第二次AI调用：提取活性数据")
        prompt_activity_data = f"""
        请分析以下科研文献，专门提取“活性数据”。你需要严格按照以下格式输出两次活性数据：

        1.  **JSON格式的活性数据**：首先，请提供一个独立的、完整的JSON结构（可以是一个JSON对象，其中包含一个名为 '活性数据' 的数组，或者直接是一个JSON数组），专门包含这些活性数据。确保此JSON结构可以被程序直接解析。

        2.  **Markdown格式的活性数据表格**：接着，请提供一个独立的Markdown表格，详细列出活性数据，包括但不限于催化剂名称、活性数值、单位、测试温度、测试压力、主要结果和备注。
        关于"活性数值"列：
        - 仅填写文本中明确给出的具体数值。如果活性数据是模糊描述（例如“低于A催化剂”、“高于B催化剂”、“没有明确数值”等），请将"活性数值"列留空。

        关于"备注"列：
        - 如果"活性数值"列因模糊描述而留空，请将该模糊描述或相关说明详细填写在"备注"列中。
        - 对于有明确"活性数值"的行，"备注"列可以留空或填写其他相关补充信息。

        请确保表格数据准确、完整，并严格遵循上述规则。请确保Markdown表格的每一行（包括表头和分隔线）都以 `|` 开始和结束，例如：
            ```
            | 列1 |
            |---|
            | 值1 |
            ```

        请确保JSON结构和Markdown表格是严格分开的，并且都是完整和准确的。

文献内容：
        {document_content}
        """
        messages_activity = [
            {"role": "system", "content": "You are a professional chemistry literature analysis assistant"},
            {"role": "user", "content": prompt_activity_data}
        ]

        response_activity = call_openrouter_api(messages_activity)
        logger.info(f"第二次AI调用完成. AI原始响应 (活性数据): {json.dumps(response_activity, ensure_ascii=False)}")
        ai_response_logger.info(f"Raw AI Response (Activity Data): {json.dumps(response_activity, ensure_ascii=False)}")

        activity_full_content = response_activity["choices"][0]["message"]["content"]
        
        parsed_activity_json_data = None
        activity_data_markdown_part = ""

        # 优先尝试提取JSON部分
        json_match_markdown_activity = re.search(r'```json\s*([\s\S]*?)\s*```', activity_full_content)
        if json_match_markdown_activity:
            parsed_activity_json_str = json_match_markdown_activity.group(1)
            try:
                temp_json = json.loads(parsed_activity_json_str)
                if '活性数据' in temp_json and isinstance(temp_json['活性数据'], list):
                    parsed_activity_json_data = temp_json['活性数据']
                elif isinstance(temp_json, list): # 如果直接返回数组
                     parsed_activity_json_data = temp_json
                # 成功解析JSON后，尝试提取剩余的Markdown部分
                activity_data_markdown_part = activity_full_content.replace(json_match_markdown_activity.group(0), '').strip()
            except json.JSONDecodeError as e:
                logger.warning(f"解析第二次调用Markdown代码块中JSON失败: {e}")
        
        # 如果没有从 ```json ``` 中提取到，尝试直接从内容中匹配JSON对象或数组
        if parsed_activity_json_data is None:
            json_match_regex_activity = re.search(r'\{.*\}', activity_full_content, re.DOTALL) # 匹配整个对象
            if json_match_regex_activity:
                try:
                    temp_json = json.loads(json_match_regex_activity.group(0))
                    if '活性数据' in temp_json and isinstance(temp_json['活性数据'], list):
                        parsed_activity_json_data = temp_json['活性数据']
                    elif isinstance(temp_json, list): # 如果直接返回数组
                        parsed_activity_json_data = temp_json
                    # 成功解析JSON后，尝试提取剩余的Markdown部分
                    activity_data_markdown_part = activity_full_content.replace(json_match_regex_activity.group(0), '').strip()
                except json.JSONDecodeError as e:
                    logger.warning(f"解析第二次调用Regex匹配JSON失败: {e}")
            else: # 尝试匹配JSON数组
                json_array_match_activity = re.search(r'\[.*\]', activity_full_content, re.DOTALL)
                if json_array_match_activity:
                    try:
                        parsed_activity_json_data = json.loads(json_array_match_activity.group(0))
                        # 成功解析JSON后，尝试提取剩余的Markdown部分
                        activity_data_markdown_part = activity_full_content.replace(json_array_match_activity.group(0), '').strip()
                    except json.JSONDecodeError as e:
                         logger.warning(f"解析第二次调用Regex匹配JSON数组失败: {e}")

        # 如果JSON部分未成功提取，则将整个内容视为Markdown
        if parsed_activity_json_data is None:
            # 尝试从完整内容中提取Markdown表格，即使JSON提取失败
            markdown_table_match_direct = re.search(r'\n\s*\|.*\|\s*\n\s*\|\s*[-]+\s*\|.*\n([\s\S]*?)(?=\n\s*[^|]|$)', activity_full_content)
            if markdown_table_match_direct:
                activity_data_markdown_part = markdown_table_match_direct.group(0).strip()
            else:
                activity_data_markdown_part = activity_full_content.strip()
            logger.warning("未能从AI响应中提取JSON部分，将整个响应视为Markdown，或尝试直接提取Markdown表格。")
        else:
            # 如果JSON提取成功，activity_data_markdown_part 已经是JSON之后的部分
            # 再次尝试从这部分中提取Markdown表格
            markdown_table_match_after_json = re.search(r'\n\s*\|.*\|\s*\n\s*\|\s*[-]+\s*\|.*\n([\s\S]*?)(?=\n\s*[^|]|$)', activity_data_markdown_part)
            if markdown_table_match_after_json:
                activity_data_markdown_part = markdown_table_match_after_json.group(0).strip()
            # 如果没有匹配到，则 activity_data_markdown_part 保持原样 (JSON之后的所有内容)
            # 这可能意味着AI没有严格按照JSON后跟Markdown表格的格式输出

        logger.info(f"第二次调用分离后的JSON部分（前200字符）：{str(parsed_activity_json_data)[:200]}...")
        logger.info(f"第二次调用分离后的Markdown部分（前200字符）：{activity_data_markdown_part[:200]}...")

        if parsed_activity_json_data is not None and isinstance(parsed_activity_json_data, list):
            final_result['活性数据'] = parsed_activity_json_data
            logger.info("第二次AI调用 (活性数据 JSON) 解析成功并合并到结果中.")
        else:
            logger.warning("第二次AI调用未能成功解析出活性数据的JSON数组部分，将使用空列表。")
            final_result.setdefault('活性数据', []) # 确保字段存在

    except Exception as e:
        logger.error(f"第二次AI调用或解析过程中发生错误: {str(e)}", exc_info=True)
        final_result.setdefault('活性数据', []) # 即使失败，也确保字段存在
        # activity_data_markdown_part 保持其在尝试提取时的值

    # 将Markdown部分添加到最终结果中
    final_result['activity_data_markdown'] = activity_data_markdown_part

    logger.info(f"AI响应最终解析后的结构化结果: {json.dumps(final_result, ensure_ascii=False)}")
    return final_result