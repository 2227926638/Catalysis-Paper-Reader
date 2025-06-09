import React, { useState, useRef, useEffect } from 'react';
import { Spin, Empty, Button, message } from 'antd';
import { LeftOutlined, RightOutlined } from '@ant-design/icons';
import * as pdfjsLib from 'pdfjs-dist';
import mammoth from 'mammoth';

// 设置PDF.js worker路径
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.js';

/**
 * 文件预览组件
 * 支持PDF和Word文档预览，实现滚轮连续阅读
 */
const FilePreview = ({ file, onClose }) => {
  // 状态管理
  const [loading, setLoading] = useState(false);
  const [content, setContent] = useState(null);
  const [numPages, setNumPages] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1.5);
  const [scrollMode, setScrollMode] = useState(true); // 默认开启滚动模式
  
  // 引用
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const pdfDocRef = useRef(null);
  
  /**
   * 组件挂载时加载文件
   */
  useEffect(() => {
    if (file) {
      loadFile();
    }
    
    return () => {
      // 清理资源
      if (content && content.url) {
        URL.revokeObjectURL(content.url);
      }
    };
  }, [file]);
  
  /**
   * 监听滚轮事件，实现连续阅读
   */
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !scrollMode || !content || content.type !== 'pdf') return;
    
    const handleWheel = (e) => {
      if (!pdfDocRef.current) return;
      
      // 防止默认滚动行为
      e.preventDefault();
      
      // 根据滚轮方向决定是向上还是向下翻页
      if (e.deltaY > 0 && pageNumber < numPages) {
        // 向下滚动，显示下一页
        setPageNumber(prev => Math.min(prev + 1, numPages));
      } else if (e.deltaY < 0 && pageNumber > 1) {
        // 向上滚动，显示上一页
        setPageNumber(prev => Math.max(prev - 1, 1));
      }
    };
    
    container.addEventListener('wheel', handleWheel, { passive: false });
    
    return () => {
      container.removeEventListener('wheel', handleWheel);
    };
  }, [pageNumber, numPages, scrollMode, content]);
  
  /**
   * 当页码变化时渲染PDF页面
   */
  useEffect(() => {
    if (content && content.type === 'pdf' && pdfDocRef.current) {
      renderPage(pdfDocRef.current, pageNumber);
    }
  }, [pageNumber, scale]);
  
  /**
   * 加载文件内容
   */
  const loadFile = async () => {
    setLoading(true);
    setContent(null);
    setNumPages(null);
    setPageNumber(1);
    
    let fileUrl;
    
    try {
      // 使用API服务获取文件
      const { uploadApi } = await import('../services/api');
      const documentId = file.response?.document_id || file.document_id;
      
      // 增加更严格的文档ID验证
      if (!documentId) {
        throw new Error('文档ID不存在，请确保文档已正确上传');
      }
      
      if (typeof documentId !== 'number' && typeof documentId !== 'string') {
        throw new Error('无效的文档ID格式');
      }
      
      // 检查ID是否为空字符串或无效值
      if (typeof documentId === 'string' && documentId.trim() === '') {
        throw new Error('文档ID不能为空字符串');
      }
      
      // 检查ID是否为有效数字
      if (typeof documentId === 'number' && (isNaN(documentId) || !isFinite(documentId))) {
        throw new Error('无效的文档ID数值');
      }
      
      // 从API获取文件预览内容
      const fileBlob = await uploadApi.getFilePreview(documentId);
      fileUrl = URL.createObjectURL(fileBlob);
      
      // 根据文件类型处理预览内容
      if (file.fileType === 'PDF') {
        // 使用PDF.js加载PDF文件
        const loadingTask = pdfjsLib.getDocument(fileUrl);
        const pdf = await loadingTask.promise;
        setNumPages(pdf.numPages);
        pdfDocRef.current = pdf;
        
        // 设置预览内容
        setContent({ type: 'pdf', pdf, url: fileUrl });
        
        // 渲染第一页
        await renderPage(pdf, 1);
      } else if (file.fileType === 'Word') {
        // Word文件需要转换为HTML
        const arrayBuffer = await fileBlob.arrayBuffer();
        const result = await mammoth.convertToHtml({ arrayBuffer });
        setContent({ type: 'word', html: result.value });
      } else {
        throw new Error('不支持的文件类型');
      }
    } catch (error) {
      console.error('获取文件预览失败:', error);
      message.error(error.message || '获取文件预览失败，请稍后重试');
      if (fileUrl) {
        URL.revokeObjectURL(fileUrl);
      }
    } finally {
      setLoading(false);
    }
  };
  
  /**
   * 渲染PDF页面
   */
  const renderPage = async (pdf, pageNum) => {
    if (!canvasRef.current) return;
    
    try {
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale });
      
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      canvas.height = viewport.height;
      canvas.width = viewport.width;
      
      const renderContext = {
        canvasContext: context,
        viewport: viewport
      };
      
      await page.render(renderContext).promise;
    } catch (error) {
      console.error('渲染PDF页面失败:', error);
      message.error('渲染PDF页面失败');
    }
  };
  
  /**
   * 处理PDF页面切换
   */
  const changePage = (offset) => {
    const newPageNumber = Math.min(Math.max(pageNumber + offset, 1), numPages);
    setPageNumber(newPageNumber);
  };
  
  /**
   * 切换滚动模式
   */
  const toggleScrollMode = () => {
    setScrollMode(!scrollMode);
    message.info(scrollMode ? '已关闭滚轮连续阅读' : '已开启滚轮连续阅读');
  };
  
  /**
   * 调整缩放比例
   */
  const adjustScale = (delta) => {
    setScale(prevScale => {
      const newScale = prevScale + delta;
      return Math.min(Math.max(newScale, 0.5), 3); // 限制缩放范围在0.5到3之间
    });
  };

  return (
    <div ref={containerRef} className="file-preview-container" style={{ minHeight: 400 }}>
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 400 }}>
          <Spin>
            <div style={{ padding: '50px', textAlign: 'center' }}>加载预览中...</div>
          </Spin>
        </div>
      ) : content ? (
        <>
          {content.type === 'pdf' ? (
            <div>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
                <canvas ref={canvasRef} style={{ border: '1px solid #d9d9d9' }} />
              </div>
              {numPages && (
                <div style={{ textAlign: 'center', marginTop: 10 }}>
                  <Button 
                    disabled={pageNumber <= 1} 
                    onClick={() => changePage(-1)}
                    style={{ marginRight: 10 }}
                    icon={<LeftOutlined />}
                  >
                    上一页
                  </Button>
                  <span>第 {pageNumber} 页，共 {numPages} 页</span>
                  <Button 
                    disabled={pageNumber >= numPages} 
                    onClick={() => changePage(1)}
                    style={{ marginLeft: 10 }}
                    icon={<RightOutlined />}
                  >
                    下一页
                  </Button>
                  <Button 
                    onClick={toggleScrollMode}
                    style={{ marginLeft: 10 }}
                    type={scrollMode ? 'primary' : 'default'}
                  >
                    {scrollMode ? '滚轮阅读：开' : '滚轮阅读：关'}
                  </Button>
                  <Button 
                    onClick={() => adjustScale(0.1)}
                    style={{ marginLeft: 10 }}
                  >
                    放大
                  </Button>
                  <Button 
                    onClick={() => adjustScale(-0.1)}
                    style={{ marginLeft: 10 }}
                  >
                    缩小
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div 
              className="word-preview" 
              dangerouslySetInnerHTML={{ __html: content.html }}
              style={{ padding: '0 20px', maxHeight: 600, overflowY: 'auto', border: '1px solid #d9d9d9', borderRadius: '4px' }}
            />
          )}
        </>
      ) : (
        <Empty description="无法预览此文件" />
      )}
    </div>
  );
};

export default FilePreview;