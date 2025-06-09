import React, { createContext, useState, useContext, useEffect } from 'react';

// 创建Context
const AppContext = createContext();

/**
 * 应用全局状态管理Provider
 * 负责管理跨页面共享的状态
 */
export const AppProvider = ({ children }) => {
  // 上传的文件列表状态
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [uploadCategory, setUploadCategory] = useState('合成氨');
  
  // 从localStorage加载状态
  useEffect(() => {
    const savedFiles = localStorage.getItem('uploadedFiles');
    const savedCategory = localStorage.getItem('uploadCategory');
    
    if (savedFiles) {
      try {
        setUploadedFiles(JSON.parse(savedFiles));
      } catch (error) {
        console.error('解析保存的文件列表失败:', error);
      }
    }
    
    if (savedCategory) {
      setUploadCategory(savedCategory);
    }
  }, []);
  
  // 保存状态到localStorage
  useEffect(() => {
    localStorage.setItem('uploadedFiles', JSON.stringify(uploadedFiles));
  }, [uploadedFiles]);
  
  useEffect(() => {
    localStorage.setItem('uploadCategory', uploadCategory);
  }, [uploadCategory]);
  
  // 更新上传文件列表
  const updateUploadedFiles = (files) => {
    setUploadedFiles(files);
  };
  
  // 更新上传分类
  const updateUploadCategory = (category) => {
    setUploadCategory(category);
  };
  
  // 添加单个文件到列表
  const addUploadedFile = (file) => {
    setUploadedFiles(prev => [...prev, file]);
  };
  
  // 从列表中移除文件
  const removeUploadedFile = (fileId) => {
    setUploadedFiles(prev => prev.filter(file => file.uid !== fileId));
  };
  
  // 清空文件列表
  const clearUploadedFiles = () => {
    setUploadedFiles([]);
  };
  
  // 提供的Context值
  const contextValue = {
    uploadedFiles,
    uploadCategory,
    updateUploadedFiles,
    updateUploadCategory,
    addUploadedFile,
    removeUploadedFile,
    clearUploadedFiles
  };
  
  return (
    <AppContext.Provider value={contextValue}>
      {children}
    </AppContext.Provider>
  );
};

// 自定义Hook，用于在组件中访问Context
export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext必须在AppProvider内部使用');
  }
  return context;
};