import React, { useState, useRef, useEffect } from 'react';
import { Typography, Card, Upload, Button, List, Tag, Space, Progress, Divider, Empty, Modal, Radio, message } from 'antd';
import { InboxOutlined, FileTextOutlined, FileWordOutlined, DeleteOutlined, EyeOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { useAppContext } from '../context/AppContext';
import { uploadApi } from '../services/api';
import FilePreview from '../components/FilePreview';
import { RobotOutlined } from '@ant-design/icons';
import AIChat from '../components/AIChat';

const { Title, Paragraph, Text } = Typography;
const { Dragger } = Upload;

/**
 * 文献上传页面组件
 * 负责处理文件上传和分类管理
 */
const UploadPage = () => {
  // 状态管理
  const [uploading, setUploading] = useState(false);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewFile, setPreviewFile] = useState(null);
  const [dropdownVisible, setDropdownVisible] = useState(false);
  const [aiChatVisible, setAiChatVisible] = useState(false);
  
  // 使用全局Context
  const { uploadedFiles, uploadCategory, updateUploadedFiles, updateUploadCategory } = useAppContext();
  const fileList = uploadedFiles;
  
  // 引用
  const dropdownRef = useRef(null);
  
  // 点击外部区域关闭下拉菜单
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target) && 
          !event.target.closest('button[value="其他"]')) {
        setDropdownVisible(false);
      }
    }
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [dropdownRef]);

  /**
   * 文件上传配置
   */
  const uploadProps = {
    name: 'file',
    multiple: true,
    action: `${process.env.REACT_APP_API_URL}/api/upload`,
    accept: '.pdf,.docx,.doc',
    fileList: fileList,
    onChange(info) {
      // 更新文件列表
      const newFileList = [...info.fileList];
      
      // 更新文件状态
      newFileList.forEach(file => {
        if (file.response) {
          file.url = file.response.url;
          file.document_id = file.response.document_id; // 保存document_id
          console.log('文件上传响应:', file.response); // 添加日志
        }
        // 添加文件类型标记
        if (file.name.endsWith('.pdf')) {
          file.fileType = 'PDF';
        } else if (file.name.endsWith('.docx') || file.name.endsWith('.doc')) {
          file.fileType = 'Word';
        }
      });
      
      // 使用Context更新文件列表
      updateUploadedFiles(newFileList);
      
      // 处理上传状态变化
      const status = info.file.status;
      if (status === 'uploading') {
        setUploading(true);
      } else if (status === 'done') {
        setUploading(false);
        message.success(`${info.file.name} 上传成功`);
      } else if (status === 'error') {
        setUploading(false);
        message.error(`${info.file.name} 上传失败`);
      }
    },
    onDrop(e) {
      console.log('拖拽上传文件:', e.dataTransfer.files);
    },
    // 开发环境下模拟上传
    customRequest({ file, onSuccess, onError, onProgress }) {
      try {
        // 使用uploadApi进行文件上传
        uploadApi.uploadFile(file, uploadCategory)
          .then(response => {
            // 将后端返回的id转换为document_id并保存到file对象
            file.document_id = parseInt(response.id);
            onSuccess({document_id: file.document_id});
          })
          .catch(error => {
            onError(error);
          });
      
        // 返回上传取消函数
        return {
          abort() {
            // 由于使用axios，这里不需要特别的中止逻辑
            console.log('Upload aborted');
          }
        };
      } catch (error) {
        onError(error);
      }
    },
    progress: {
      strokeColor: {
        '0%': '#108ee9',
        '100%': '#87d068',
      },
      size: 3,
      format: percent => `${parseFloat(percent.toFixed(2))}%`,
    },
  };

  /**
   * 处理文件预览
   */
  const handlePreview = (file) => {
    setPreviewFile(file);
    setPreviewVisible(true);
    // 如果是本地预览，不需要调用API
    if (file.originFileObj) {
      return;
    }
    // 如果需要从服务器获取预览内容
    if (file.response && file.response.document_id) {
      uploadApi.getFilePreview(file.response.document_id)
        .then(response => {
          // 处理预览内容
        })
        .catch(error => {
          // 忽略404错误，因为使用本地预览
          if (error.response && error.response.status !== 404) {
            message.error('获取预览内容失败');
          }
        });
    }
  };
  
  /**
   * 关闭预览模态框
   */
  const closePreview = () => {
    setPreviewVisible(false);
    setPreviewFile(null);
  };
  
  /**
   * 处理文献分析
   */
  const handleAnalysis = async (file) => {
    try {
      console.log('准备分析文件:', file);
      
      // 检查文件状态
      if (file.status !== 'done') {
        message.error('请等待文件上传完成后再进行分析');
        return;
      }
      
      // 获取文档ID
      const documentId = file.response?.document_id;
      if (!documentId) {
        message.error('无法获取文档ID，请重新上传文件');
        return;
      }
      
      console.log('使用文档ID进行分析:', documentId);
      
      // 更新文件状态为分析中
      const newFileList = fileList.map(item => {
        if (item.uid === file.uid) {
          return { ...item, analyzing: true, status: 'processing' };
        }
        return item;
      });
      updateUploadedFiles(newFileList);
      
      // 保存文件到本地存储，确保在页面跳转后仍能保留文件信息
      localStorage.setItem('uploadedFiles', JSON.stringify(newFileList));
      
      // 发送分析请求
      let response;
      try {
        response = await uploadApi.analyzeDocument(documentId);
        console.log('分析响应:', response);
        
        // 验证响应结构
        if (!response) {
          throw new Error('分析请求未返回任何响应');
        }

        // 检查是否已经在分析中
        if (response?.data?.detail?.includes('已经开始分析') || 
            response?.message?.includes('文档正在分析中')) {
          message.info(`文献 ${file.name} 正在分析中，请稍候查看结果`);
          return;
        }
      } catch (error) {
        // 如果错误是因为文献已经在分析中，显示友好提示
        if (error.response?.data?.detail?.includes('已经开始分析') || 
            error.message?.includes('文档正在分析中')) {
          message.info(`文献 ${file.name} 正在分析中，请稍候查看结果`);
          return;
        }
        throw error;
      }
      
      if (!response || typeof response !== 'object') {
        throw new Error('分析请求返回了无效的响应');
      }
      
      if (response.success) {
        message.success('文献分析已开始，请稍后在分析页面查看结果');
        
        // 检查analysis_id是否存在
        if (!response.analysis_id) {
          console.warn('分析响应缺少analysis_id字段');
        }
        
        // 更新文件状态为已分析
        const updatedFileList = fileList.map(item => {
          if (item.uid === file.uid) {
            return { 
              ...item, 
              analyzing: false,
              status: 'analyzed',
              analysis_id: response.analysis_id || null
            };
          }
          return item;
        });
        updateUploadedFiles(updatedFileList);
      } else {
        // 检查是否有错误信息
        const errorMsg = response.message || '分析请求未返回预期的响应';
        throw new Error(errorMsg);
      }
      
    } catch (error) {
      console.error('分析请求详细错误:', error);
      message.error(error.response?.data?.message || '分析请求失败，请稍后重试');
      
      // 恢复文件状态
      const failedFileList = fileList.map(item => {
        if (item.uid === file.uid) {
          return { ...item, analyzing: false, status: 'error' };
        }
        return item;
      });
      updateUploadedFiles(failedFileList);
    }
  };

  /**
   * 处理文件删除
   */
  const handleRemove = (file) => {
    const index = fileList.indexOf(file);
    const newFileList = fileList.slice();
    newFileList.splice(index, 1);
    updateUploadedFiles(newFileList);
  };

  /**
   * 处理批量上传
   */
  const handleBatchUpload = () => {
    if (fileList.length === 0) {
      message.warning('请先选择要上传的文件');
      return;
    }
    
    setUploading(true);
    
    // 模拟上传过程
    setTimeout(() => {
      setUploading(false);
      // 更新文件状态为已上传
      const newFileList = fileList.map(file => ({
        ...file,
        status: 'done',
        percent: 100,
        document_id: file.response?.document_id || `doc_${Date.now()}_${file.uid}` // 确保有document_id
      }));
      updateUploadedFiles(newFileList);
      message.success('所有文件上传成功');
    }, 2000);
  };

  /**
   * 渲染文件列表
   */
  const renderFileList = () => {
    if (fileList.length === 0) {
      return <Empty description="暂无上传文件" />;
    }

    return (
      <List
        itemLayout="horizontal"
        dataSource={fileList}
        renderItem={file => (
          <List.Item
            actions={[
              <Button 
                type="text" 
                icon={<EyeOutlined />} 
                onClick={() => handlePreview(file)}
              >预览</Button>,
              <Button 
                type="text" 
                danger 
                icon={<DeleteOutlined />} 
                onClick={() => handleRemove(file)}
              >删除</Button>,
              <Button 
                type="text" 
                icon={<FileTextOutlined />} 
                onClick={() => handleAnalysis(file)}
              >分析</Button>
            ]}
          >
            <List.Item.Meta
              avatar={file.fileType === 'PDF' ? <FileTextOutlined style={{ fontSize: 24, color: '#1890ff' }} /> : <FileWordOutlined style={{ fontSize: 24, color: '#52c41a' }} />}
              title={file.name}
              description={
                <Space direction="vertical" size={0}>
                  <Space>
                    <Tag color={file.fileType === 'PDF' ? 'blue' : 'green'}>{file.fileType}</Tag>
                    <Tag color="purple">{uploadCategory}</Tag>
                    {file.status === 'done' && <Tag icon={<CheckCircleOutlined />} color="success">已上传</Tag>}
                    {file.status === 'uploading' && <Tag color="processing">上传中</Tag>}
                    {file.status === 'error' && <Tag color="error">上传失败</Tag>}
                  </Space>
                  {file.status === 'uploading' && (
                    <Progress percent={file.percent || 0} size="small" status="active" />
                  )}
                </Space>
              }
            />
          </List.Item>
        )}
      />
    );
  };

  /**
   * 渲染文件预览模态框
   */
  const renderPreviewModal = () => {
    return (
      <Modal
        title="文件预览"
        open={previewVisible}
        onCancel={closePreview}
        footer={null}
        width={800}
        destroyOnClose={true}
        styles={{ body: { padding: '24px' } }}
      >
        {previewFile && (
          <div className="file-preview">
            <h3>{previewFile.name}</h3>
            <p>文件类型: {previewFile.fileType}</p>
            <p>上传时间: {new Date().toLocaleString()}</p>
            <p>分类: {uploadCategory}</p>
            <Divider />
            <FilePreview file={previewFile} onClose={closePreview} />
          </div>
        )}
      </Modal>
    );
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <Title level={2} style={{ margin: 0 }}>文献上传</Title>
        <Button
          type="primary"
          icon={<RobotOutlined />}
          onClick={() => setAiChatVisible(true)}
        >
          AI助手
        </Button>
      </div>
      <AIChat visible={aiChatVisible} onClose={() => setAiChatVisible(false)} />
      <Typography>
        <Paragraph>
          支持批量上传PDF和Word格式的科研文献，系统将自动分析并提取关键信息。支持滚轮连续阅读预览文件。
        </Paragraph>
      </Typography>

      <Card title="催化反应分类" style={{ marginBottom: 16 }}>
        <div style={{ position: 'relative' }}>
          <Radio.Group value={uploadCategory} onChange={e => {
            if (e.target.value !== '其他') {
              updateUploadCategory(e.target.value);
              setDropdownVisible(false);
            }
          }}>
            <Radio.Button value="合成氨">合成氨</Radio.Button>
            <Radio.Button value="乙炔加氢">乙炔加氢</Radio.Button>
            <Radio.Button value="一氧化碳氧化">一氧化碳氧化</Radio.Button>
            <Radio.Button value="甲醇合成">甲醇合成</Radio.Button>
            <Radio.Button value="烯烃聚合">烯烃聚合</Radio.Button>
            <Radio.Button value="其他" onClick={(e) => {
              e.preventDefault();
              setDropdownVisible(!dropdownVisible);
            }}>其他</Radio.Button>
          </Radio.Group>
          
          {dropdownVisible && (
            <div 
              ref={dropdownRef}
              style={{ 
                position: 'absolute', 
                backgroundColor: '#fff', 
                boxShadow: '0 2px 8px rgba(0,0,0,0.15)', 
                zIndex: 1000,
                borderRadius: '4px',
                marginTop: '8px',
                padding: '8px 0',
                width: '180px'
              }}
            >
              <div style={{ padding: '8px 12px', cursor: 'pointer', hover: { backgroundColor: '#f5f5f5' } }} 
                onClick={() => {
                  updateUploadCategory('石油催化裂化');
                  setDropdownVisible(false);
                }}>
                石油催化裂化
              </div>
              <div style={{ padding: '8px 12px', cursor: 'pointer' }} 
                onClick={() => {
                  updateUploadCategory('加氢脱硫');
                  setDropdownVisible(false);
                }}>
                加氢脱硫
              </div>
              <div style={{ padding: '8px 12px', cursor: 'pointer' }} 
                onClick={() => {
                  updateUploadCategory('氧化脱氢');
                  setDropdownVisible(false);
                }}>
                氧化脱氢
              </div>
              <div style={{ padding: '8px 12px', cursor: 'pointer' }} 
                onClick={() => {
                  updateUploadCategory('费托合成');
                  setDropdownVisible(false);
                }}>
                费托合成
              </div>
              <div style={{ padding: '8px 12px', cursor: 'pointer' }} 
                onClick={() => {
                  updateUploadCategory('选择性催化还原');
                  setDropdownVisible(false);
                }}>
                选择性催化还原
              </div>
              <div style={{ padding: '8px 12px', cursor: 'pointer' }} 
                onClick={() => {
                  updateUploadCategory('其他反应');
                  setDropdownVisible(false);
                }}>
                其他反应
              </div>
            </div>
          )}
        </div>
      </Card>

      <Card title="上传文件" style={{ marginBottom: 16 }}>
        <Dragger {...uploadProps} style={{ marginBottom: 16 }}>
          <p className="ant-upload-drag-icon">
            <InboxOutlined />
          </p>
          <p className="ant-upload-text">点击或拖拽文件到此区域上传</p>
          <p className="ant-upload-hint">
            支持单个或批量上传PDF、Word格式的文献文件
          </p>
        </Dragger>
        <div style={{ marginTop: 16, textAlign: 'right' }}>
          <Button 
            type="primary" 
            onClick={handleBatchUpload} 
            loading={uploading}
            disabled={fileList.length === 0}
          >
            开始上传
          </Button>
        </div>
      </Card>

      <Card title="已上传文件">
        {renderFileList()}
      </Card>

      {renderPreviewModal()}
    </div>
  );
};

export default UploadPage;