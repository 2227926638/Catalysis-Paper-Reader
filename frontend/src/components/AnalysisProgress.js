import React, { useState, useEffect, useRef } from 'react';
import { Modal, Progress, Steps, Tag, Typography, Button, Space, Alert } from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined, LoadingOutlined, WarningOutlined } from '@ant-design/icons';
import websocketService from '../services/websocketService';
import { analysisApi } from '../services/api';
import { handleApiError } from '../utils/errorHandler';

const { Text } = Typography;
const { Step } = Steps;

/**
 * 文献分析进度组件
 * 显示文献分析的实时进度和状态
 */
const AnalysisProgress = ({ documentId, visible, onClose, onRetry }) => {
  // 状态管理
  const [progress, setProgress] = useState({
    document_id: documentId,
    current_item: null,
    current_item_index: 0,
    total_items: 11, // Updated from 9 to 11
    completed_items: [],
    skipped_items: [],
    overall_progress: 0,
    status: 'processing'
  });
  const [error, setError] = useState(null);

  // 连接WebSocket并接收进度更新
  useEffect(() => {
    let isComponentMounted = true;
    
    // 处理进度更新
    const handleProgressUpdate = (data) => {
      if (isComponentMounted) {
        setProgress(data);
        
        // 如果分析完成或出错，不再自动关闭WebSocket连接
        // 保持连接以便接收后续更新
      }
    };

    // 处理错误
    const handleError = (errorMsg) => {
      if (isComponentMounted) {
        setError(errorMsg);
      }
    };

    if (visible && documentId) { // 仅在弹窗可见且有documentId时操作
      console.log(`AnalysisProgress: useEffect - visible is true, documentId is ${documentId}.`);
      // 检查是否已经连接到正确的文档ID
      if (websocketService.isConnected && websocketService.documentId === documentId) {
        console.log(`AnalysisProgress: WebSocket already connected to documentId ${documentId}. No action needed.`);
        // 如果已经连接到正确的文档，并且状态是活跃的，则不需要做任何事情
        // 如果需要，可以在这里触发一次强制的进度获取或UI更新
      } else {
        // 如果未连接，或连接到错误的文档ID，则执行连接逻辑
        console.log(`AnalysisProgress: WebSocket not connected or connected to a different document. Attempting to connect/reconnect to ${documentId}.`);
        // 先断开可能存在的旧连接 (如果连接到其他文档ID，或者socket存在但isConnected为false)
        if (websocketService.socket) { // 检查socket对象是否存在，而不仅仅是isConnected
          console.log(`AnalysisProgress: Disconnecting existing WebSocket (if any) before connecting to ${documentId}.`);
          websocketService.disconnect(true); // 传入true表示内部调用，避免触发外部错误和自动重连
        }
        // 添加一个小的延迟，确保disconnect操作有足够时间完成
        setTimeout(() => {
          if (isComponentMounted && visible) { // 再次检查组件是否挂载和可见
              console.log(`AnalysisProgress: Connecting WebSocket for documentId ${documentId} after potential disconnect.`);
              websocketService.connect(documentId, handleProgressUpdate, handleError);
          }
        }, 100); // 增加延迟到100ms，给disconnect更充分的时间
      }
    } else if (!visible && websocketService.isConnected && websocketService.documentId === documentId) {
      // 如果弹窗不可见，但仍有针对此documentId的连接，则断开它
      // 这确保了当用户关闭进度弹窗时，相关的WebSocket连接也会被关闭，除非有其他地方需要它
      // 注意：如果希望WebSocket在后台持续运行直到分析完成，则不应在此处断开
      // 根据当前需求（重试时能正确重连），此处暂时注释掉，因为之前的逻辑是保持连接
      // console.log(`AnalysisProgress: visible is false. Disconnecting WebSocket for documentId ${documentId}.`);
      // websocketService.disconnect(); 
    }
    
    // 组件卸载时不断开连接，保持WebSocket连接状态
    // 这样即使用户离开分析进度页面，WebSocket仍然保持连接

    // 组件卸载时只标记组件已卸载，但不断开WebSocket连接
    return () => {
      isComponentMounted = false;
      console.log('组件卸载，但保持WebSocket连接');
      // 不再调用websocketService.disconnect()，保持连接状态
    };
  }, [visible, documentId]);

  // 获取分析项目的状态图标
  const getItemStatusIcon = (item) => {
    if (!progress?.completed_items || !progress?.skipped_items) {
      return null;
    }
    if (progress.completed_items.includes(item)) {
      return <CheckCircleOutlined style={{ color: '#52c41a' }} />;
    } else if (progress.skipped_items.includes(item)) {
      return <WarningOutlined style={{ color: '#faad14' }} />;
    } else if (item === progress.current_item) {
      return <LoadingOutlined style={{ color: '#1890ff' }} />;
    }
    return null;
  };

  const getItemStatus = (item) => {
    if (!progress?.completed_items || !progress?.skipped_items) {
      return 'wait';
    }
    if (progress.completed_items.includes(item)) {
      return 'finish';
    } else if (progress.skipped_items.includes(item)) {
      return 'warning';
    } else if (item === progress.current_item) {
      return 'process';
    }
    return 'wait';
  };

  const analysisItems = [
    "文献标题",
    "作者列表",
    "发表期刊/会议",
    "发表年份",
    "摘要",
    "关键词",
    "活性数据",
    "催化剂制备方法",
    "表征方法及表征结果",
    "结论",
    "实验价值与启示：你是一名从事热催化的研究者，这篇文献对你在催化剂的理解上，以及催化剂制备方法上，以及表征手段上有哪些启示，你在这其中学到了什么，输出一段条理清晰的文字",
    "请以JSON格式返回结果，包含以上所有字段。对于活性数据、催化剂制备法、结论和实验价值与启示，请尽可能详细提取并结构化。"
  ];

  // 获取进度条状态
  const getProgressStatus = () => {
    switch (progress.status) {
      case 'completed':
        return 'success';
      case 'error':
        return 'exception';
      default:
        return 'active';
    }
  };

  // 获取状态标签
  const getStatusTag = () => {
    switch (progress.status) {
      case 'completed':
        return <Tag icon={<CheckCircleOutlined />} color="success">分析完成</Tag>;
      case 'error':
        return <Tag icon={<CloseCircleOutlined />} color="error">分析出错</Tag>;
      default:
        return <Tag icon={<LoadingOutlined />} color="processing">分析中</Tag>;
    }
  };

  return (
    <Modal
      title="文献分析进度"
      open={visible}
      onCancel={onClose}
      footer={[
        <React.Fragment key="footer-buttons">
          <Button key="close" onClick={onClose}>
            关闭
          </Button>
          <Button 
            key="retry" 
            type="primary" 
            onClick={() => {
              onRetry();
              onClose();
            }}
          >
            重试
          </Button>
        </React.Fragment>
      ]}
      width={600}
      styles={{ body: { padding: '24px' } }}
    >
      {error && (
        <Alert
          message="连接错误"
          description={error}
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

      <Space direction="vertical" style={{ width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <Text strong>总体进度：</Text>
          {getStatusTag()}
        </div>

        <Progress
          percent={progress.overall_progress}
          status={getProgressStatus()}
          strokeColor={{
            '0%': '#108ee9',
            '100%': '#87d068',
          }}
        />

        <div style={{ marginTop: 24 }}>
          <Text strong>分析项目：</Text>
          <Steps
            direction="vertical"
            size="small"
            current={progress.current_item_index}
            style={{ marginTop: 16 }}
          >
            {analysisItems.map((item, index) => (
              <Step
                key={`${item}_${index}`}
                title={item}
                status={getItemStatus(item)}
                icon={getItemStatusIcon(item)}
                description={
                  progress?.skipped_items?.includes(item) ? 
                  <Text type="warning">已跳过（未找到相关内容或分析超时）</Text> : 
                  null
                }
              />
            ))}
          </Steps>
        </div>
      </Space>
    </Modal>
  );
};

export default AnalysisProgress;