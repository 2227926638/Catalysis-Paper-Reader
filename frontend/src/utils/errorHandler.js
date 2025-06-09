/**
 * 错误处理工具模块
 * 提供统一的错误处理函数和错误消息格式化
 */
import { message } from 'antd';

/**
 * 处理API错误
 * @param {Error} error - 错误对象
 * @param {string} customMessage - 自定义错误消息
 * @returns {string} 格式化后的错误消息
 */
export const handleApiError = (error, customMessage = '请求失败，请稍后重试') => {
  // Add check for error being null or undefined
  if (!error) {
    console.error('Received null or undefined error object.');
    message.error(customMessage);
    return customMessage;
  }

  let errorMessage = customMessage;
  
  if (error.response) {
    // 服务器返回错误状态码
    const status = error.response.status;
    const data = error.response.data;
    
    if (status === 404) {
      errorMessage = '请求的资源不存在';
    } else if (status === 400) {
      // 处理400错误，通常是客户端请求错误
      errorMessage = data.detail || '请求参数错误';
    } else if (status === 500) {
      errorMessage = '服务器内部错误，请稍后重试';
    } else if (status === 504) {
      errorMessage = '服务器响应超时，请稍后重试';
    } else if (data && data.detail) {
      errorMessage = data.detail;
    } else if (data && data.message) {
      errorMessage = data.message;
    }
    
    console.error('API错误响应:', status, data);
  } else if (error.request) {
    // 请求发送但没有收到响应
    errorMessage = '无法连接到服务器，请检查网络连接或稍后重试';
    console.error('未收到服务器响应:', error.request);
    
    // 检查是否是超时错误
    if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
      errorMessage = '请求超时，服务器可能正在处理大文件，请稍后查看结果';
    }
  } else {
    // 请求配置出错
    // Add check for error and error.message before accessing
    errorMessage = `请求配置错误: ${error && error.message ? error.message : '未知错误'}`;
    console.error('请求配置错误:', error);
  }
  
  // 显示错误消息
  message.error(errorMessage);
  
  return errorMessage;
};

/**
 * 处理文件操作错误
 * @param {Error} error - 错误对象
 * @param {string} operation - 操作类型（上传、预览、分析等）
 * @returns {string} 格式化后的错误消息
 */
export const handleFileError = (error, operation = '操作') => {
  const errorMessage = `文件${operation}失败: ${error.message || '未知错误'}`;
  message.error(errorMessage);
  console.error(`文件${operation}错误:`, error);
  return errorMessage;
};

/**
 * 处理表单验证错误
 * @param {Object} errors - 表单验证错误对象
 * @returns {string} 格式化后的错误消息
 */
export const handleFormError = (errors) => {
  const errorMessage = '表单验证失败，请检查输入';
  message.error(errorMessage);
  console.error('表单验证错误:', errors);
  return errorMessage;
};