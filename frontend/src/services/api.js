import axios from 'axios';
// 导入错误处理工具
import { handleApiError } from '../utils/errorHandler';

// 创建axios实例，设置基础URL和默认配置
// 在开发环境中使用相对路径，让代理配置生效
const API_URL = process.env.NODE_ENV === 'development' ? '' : (process.env.REACT_APP_API_URL || 'http://localhost:8000');
// 正确替换协议部分，确保只替换URL开头的协议
const WS_URL = (process.env.REACT_APP_API_URL || 'http://localhost:8000').replace(/^http:/, 'ws:').replace(/^https:/, 'wss:');

const api = axios.create({
  baseURL: API_URL ? API_URL : '',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json'
  }
});

// 请求拦截器
api.interceptors.request.use(
  config => {
    // 可以在这里添加认证信息等
    return config;
  },
  error => {
    return Promise.reject(error);
  }
);

// 响应拦截器
api.interceptors.response.use(
  response => {
    return response.data;
  },
  error => {
    // 使用统一错误处理
    handleApiError(error);
    return Promise.reject(error);
  }
);

// 文件上传相关API
const uploadApi = {
  uploadFile: (file, category) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('category', category);
    
    return api.post('/api/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });
  },
  
  /**
   * 获取文件预览
   * @param {string} fileId - 文件ID
   * @returns {Promise}
   */
  getFilePreview: (document_id) => {
    return api.get(`/api/download/${document_id}`, {
      responseType: 'blob'
    });
  },
  
  /**
   * 分析文献
   * @param {number} documentId - 文档ID
   * @returns {Promise}
   */
  analyzeDocument: (documentId) => {
    return api.post(`/api/analyze/${documentId}`);
  }
};

// 文献分析相关API
export const getDocuments = () => {
  return api.get('/api/documents');
};

export const deleteDocument = (documentId) => {
  return api.delete(`/api/documents/${documentId}`);
};

export const getAnalysisResult = (documentId) => {
  return api.get(`/api/analysis/${documentId}`);
};

export const getAnalysisProgress = (documentId) => {
  return api.get(`/api/analysis/progress/${documentId}`);
};

export const chatWithAI = async (message) => {
  try {
    const response = await fetch(`${API_URL}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message }),
    });
    
    if (!response.ok) {
    throw new Error(`AI聊天请求失败: ${response.status}`);
  }
  
  return await response.json();
} catch (error) {
  handleApiError(error, 'AI聊天请求失败');
  throw error;
}
};

export { uploadApi };