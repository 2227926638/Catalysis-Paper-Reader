import React, { useState, useEffect } from 'react';
import { Typography, Card, Table, Tag, Space, Button, Tabs, Input, Select, Collapse, Spin, Empty, message, Tooltip, Row, Col, Modal, List } from 'antd';
import { FileTextOutlined, FileWordOutlined, DownloadOutlined, SearchOutlined, LineChartOutlined, RobotOutlined } from '@ant-design/icons';
import AnalysisProgress from '../components/AnalysisProgress';
import AIChat from '../components/AIChat';

import { handleApiError } from '../utils/errorHandler';
import websocketService from '../services/websocketService';
import { uploadApi, getAnalysisResult, getAnalysisProgress, getDocuments, deleteDocument } from '../services/api';

const { Title, Paragraph, Text } = Typography;
const { TabPane } = Tabs;
const { Option } = Select;
const { Panel } = Collapse;
const { Search } = Input;

/**
 * 文献分析页面组件
 * 负责展示文献分析结果和数据提取
 */
const AnalysisPage = () => {
  // 状态管理
  const [loading, setLoading] = useState(false);
  const [documents, setDocuments] = useState([]);
  const [selectedDocument, setSelectedDocument] = useState(null);
  const [analysisResults, setAnalysisResults] = useState(null);
  const [progressVisible, setProgressVisible] = useState(false);
  const [progressDocumentId, setProgressDocumentId] = useState(null);
  const [aiChatVisible, setAiChatVisible] = useState(false);
  const [activeKeys, setActiveKeys] = useState([]); // 将初始状态设置为空数组，使所有面板默认收起
  
  /**
   * 组件挂载时获取文档列表
   */
  useEffect(() => {
    fetchDocuments();
  }, []);

  /**
   * 从API获取已分析的文档列表
   */
  const fetchDocuments = async () => {
    try {
      setLoading(true);
      // 使用API服务模块获取数据
      const responseData = await getDocuments();
      // 校验响应数据是否为数组，并且数组元素是否包含必要的字段 (id 和 name/filename)
      if (Array.isArray(responseData) && responseData.every(doc => doc && typeof doc.id !== 'undefined' && (typeof doc.name !== 'undefined' || typeof doc.filename !== 'undefined'))) {
        // 如果存在 filename 但不存在 name，则将 filename 赋值给 name 以统一
        const standardizedData = responseData.map(doc => {
          if (typeof doc.name === 'undefined' && typeof doc.filename !== 'undefined') {
            return { ...doc, name: doc.filename };
          }
          return doc;
        });
        setDocuments(standardizedData);
      } else {
        console.error('Invalid data format received from getDocuments API:', responseData);
        message.error('获取文档列表失败：数据格式不正确。');
        setDocuments([]); // 设置为空数组以避免渲染错误
      }
      setLoading(false);
    } catch (error) {
      handleApiError(error, '获取文档列表失败');
      setLoading(false);
    }
  };

  /**
   * 处理文档选择，获取分析结果
   */
  const handleDocumentSelect = async (record) => {
    try {
      setSelectedDocument(record);
      setLoading(true);
      
      // 验证文档ID
      const documentId = record.id;
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
      
      // 使用API服务模块获取数据
      const data = await getAnalysisResult(documentId);

      // Parse the content field if it's a string
      if (data && typeof data.content === 'string') {
        try {
          data.content = JSON.parse(data.content);
        } catch (parseError) {
          console.error("Error parsing analysisResults.content:", parseError);
          // Handle parsing error, maybe set content to an empty object or null
          data.content = {};
        }
      }

      setAnalysisResults(data);
      console.log('AnalysisPage: Received analysis results:', data); // 添加日志输出
      console.log('AnalysisPage: Received analysis results content:', data?.content); // 添加content字段的日志输出
      setLoading(false);
    } catch (error) {
      handleApiError(error, '获取分析结果失败');
      setLoading(false);
    }
  };

  /**
   * 导出分析报告
   */
  const handleExportReport = () => {
    message.success('分析报告已导出');
  };

  /**
   * 查看分析进度
   */
  const handleViewProgress = (record) => {
    setProgressDocumentId(record.id);
    setProgressVisible(true);
  };

  /**
   * 关闭进度弹窗
   */
  const handleCloseProgress = () => {
    setProgressVisible(false);
  };

  /**
   * 删除文档
   */
  const handleDeleteDocument = (record) => {
    Modal.confirm({
      title: '确认删除',
      content: `确定要删除文献 ${record.name}?`,
      onOk: async () => {
        try {
          await deleteDocument(record.id);
          message.success('文献删除成功');
          fetchDocuments();
        } catch (error) {
          handleApiError(error, '删除文献失败');
        }
      }
    });
  };

  /**
   * 重试分析
   */
  const handleRetryAnalysis = async () => {
    try {
      setLoading(true);
      // 使用websocketService重新启动分析
      const response = await websocketService.restartAnalysis(progressDocumentId);
      if (response.success) {
        // websocketService.restartAnalysis 内部已经处理了断开连接的逻辑 (disconnect(true))
        // 因此这里不再需要显式调用 disconnect
        console.log('AnalysisPage: restartAnalysis successful. Proceeding to show progress.');

      // 短暂延迟后直接尝试连接，并打开进度弹窗
      // AnalysisProgress 内部的 useEffect 应该能处理好后续的UI更新
      setTimeout(() => {
        console.log(`AnalysisPage: handleRetryAnalysis - Attempting to connect WebSocket for documentId ${progressDocumentId} after retry.`);
        // AnalysisProgress 组件会处理 WebSocket 的连接，我们只需要确保它可见且 documentId 正确
        // websocketService.connect(progressDocumentId, /* handleProgressUpdate */ null, /* handleError */ null);
        // 上一行暂时注释，因为 AnalysisProgress 内部会调用 connect
        // 我们只需要确保 AnalysisProgress 组件被正确地重新渲染以触发其 useEffect
        setProgressDocumentId(progressDocumentId); // 确保ID正确传递
        setProgressVisible(true); // 打开进度弹窗，其useEffect会处理连接
        message.success('分析已重新启动，正在连接以获取进度...');
      }, 150); // 增加延迟到150ms，给disconnect更充分的时间

    } else {
      message.error(response.message || '重新启动分析失败');
    }
    setLoading(false);
  } catch (error) {
    handleApiError(error, '重新启动分析失败');
    setLoading(false);
  }
};

  /**
   * 重新分析文档
   */
  const handleRestartAnalysis = async (documentId) => {
    try {
      setLoading(true);
      // 使用websocketService重新启动分析
      const response = await websocketService.restartAnalysis(documentId);
      if (response.success) {
        message.success('分析已重新启动，正在连接以获取进度...');
        // 打开进度弹窗以显示重新分析的进度
        setProgressDocumentId(documentId);
        setProgressVisible(true);
      } else {
        message.error(response.message || '重新启动分析失败');
      }
      setLoading(false);
    } catch (error) {
      handleApiError(error, '重新启动分析失败');
      setLoading(false);
    }
  };

  // 表格列定义
  const columns = [
    {
      title: '文件名',
      dataIndex: 'name',
      key: 'name',
      width: '30%',
      render: (text, record) => (
        <Space>
          {record.type === 'PDF' ? <FileTextOutlined /> : <FileWordOutlined />}
          <a onClick={() => handleDocumentSelect(record)}>{text}</a>
        </Space>
      ),
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      width: '10%',
      align: 'center',
      render: type => (
        <Tag color={type === 'PDF' ? 'blue' : 'green'}>{type}</Tag>
      ),
    },
    {
      title: '上传时间',
      dataIndex: 'uploadTime',
      key: 'uploadTime',
      width: '15%',
      align: 'center',
    },
    {
      title: '分类',
      dataIndex: 'category',
      key: 'category',
      width: '15%',
      align: 'center',
      render: category => <Tag color="purple">{category}</Tag>,
    },
    {
      title: '状态',
      key: 'status',
      dataIndex: 'status',
      width: '15%',
      align: 'center',
      render: (status, record) => (
        <Space>
          <Tag color={status === 'analyzed' ? 'green' : status === 'processing' ? 'blue' : 'orange'}>
            {status === 'analyzed' ? '已分析' : status === 'processing' ? '处理中' : '未处理'}
          </Tag>
        </Space>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: '15%',
      align: 'center',
      render: (_, record) => (
        <Space size="middle">
          <Button
            type={record.status === 'analyzed' ? "primary" : "default"}
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              if (record.status === 'analyzed') {
                handleDocumentSelect(record);
              } else {
                setProgressDocumentId(record.id);
                setProgressVisible(true);
              }
            }}
          >
            查看分析
          </Button>
          {record.status === 'analyzed' && (
            <Button
              type="default"
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                handleRestartAnalysis(record.id);
              }}
            >
              重新分析
            </Button>
          )}
          <Button 
            type="text" 
            danger 
            size="small" 
            onClick={(e) => {
              e.stopPropagation();
              handleDeleteDocument(record);
            }}
          >
            删除
          </Button>
        </Space>
      ),
    },
  ];

  // 分析结果数据结构示例（仅用于参考，实际数据从API获取）
  /*
  const analysisResultExample = {
    title: '文献标题',
    authors: ['作者1', '作者2'],
    publication: '期刊名称',
    year: '发表年份',
    abstract: '摘要内容',
    keywords: ['关键词1', '关键词2'],
    content: {
      experimentalMethods: ['方法1', '方法2'],
      materials: [
        {
          name: '材料名称',
          type: '材料类型',
          properties: {
            '属性1': '值1',
            '属性2': '值2'
          }
        }
      ],
      conclusions: ['结论1', '结论2']
    }
  };
  */

  /**
   * 渲染分析结果
   */
  const renderAnalysisResults = () => {
    console.log('renderAnalysisResults: analysisResults', analysisResults);
    if (!selectedDocument) {
      return <Empty description="请选择文献查看分析结果" />;
    }
    
    if (selectedDocument.status !== 'analyzed' || !analysisResults) {
      return (
        <div style={{ textAlign: 'center', padding: '24px' }}>
          <Button 
            type="primary" 
            onClick={() => {
              setProgressDocumentId(selectedDocument.id);
              setProgressVisible(true);
            }}
          >
            查看分析进度
          </Button>
        </div>
      );
    }

    
  
    const renderFieldContent = (fieldValue) => {
      console.log('renderFieldContent input:', fieldValue); // DEBUG
      if (!fieldValue) return null;
      if (Array.isArray(fieldValue)) {
        if (fieldValue.length === 0) return null;
        const result = fieldValue.map((item, index) => {
          if (typeof item === 'object' && item !== null) {
            return <pre key={index}>{JSON.stringify(item, null, 2)}</pre>;
          }
          return <Paragraph key={index}>- {String(item)}</Paragraph>;
        });
        console.log('renderFieldContent output (array):', result); // DEBUG
        return result;
      }
      if (typeof fieldValue === 'string' && fieldValue.trim() !== '') {
        const result = <Paragraph>{fieldValue}</Paragraph>;
        console.log('renderFieldContent output (string):', result); // DEBUG
        return result;
      }
      if (typeof fieldValue === 'object' && fieldValue !== null && Object.keys(fieldValue).length > 0) {
        const result = <pre>{JSON.stringify(fieldValue, null, 2)}</pre>;
        console.log('renderFieldContent output (object):', result); // DEBUG
        return result;
      }
      console.log('renderFieldContent output (null):', null); // DEBUG
      return null;
    };



    const renderDetailedContent = (fieldValue) => {
      console.log('renderDetailedContent - Input fieldValue:', fieldValue, 'Type:', typeof fieldValue, 'IsArray:', Array.isArray(fieldValue)); // DEBUG log
      if (!fieldValue) {
        const result = <Text type="secondary">暂无数据</Text>;
        console.log('renderDetailedContent output (no data):', result); // DEBUG
        return result;
      }

      if (typeof fieldValue === 'string') {
        const paragraphs = fieldValue.replace(/\n\s*\n/g, '\n').split('\n');
        const result = paragraphs.map((paragraph, index) => (
          paragraph.trim() ? <Paragraph key={index}>{paragraph.trim()}</Paragraph> : null
        )).filter(p => p !== null);
        console.log('renderDetailedContent output (string):', result); // DEBUG
        return result.length > 0 ? result : <Text type="secondary">暂无数据</Text>; // 确保即使是空字符串也有提示
      }

      if (Array.isArray(fieldValue)) {
        if (fieldValue.length === 0) return <Text type="secondary">暂无数据</Text>;
        return (
          <List
            size="small"
            dataSource={fieldValue}
            renderItem={(item, index) => {
              // Ensure item is not null/undefined before accessing properties
              if (item === null || typeof item === 'undefined') {
                return null; // Or render a placeholder for null/undefined items
              }
              return (
                <List.Item key={index} style={{ borderBottom: 'none', padding: '4px 0' }}>
                  {typeof item === 'object' ? renderDetailedContent(item) : <Text>{String(item)}</Text>}
                </List.Item>
              );
            }}
          />
        );
      }

      if (typeof fieldValue === 'object' && fieldValue !== null) {
        const entries = Object.entries(fieldValue);
        if (entries.length === 0) return <Text type="secondary">暂无数据</Text>;
        return (
          <div style={{ paddingLeft: '0px' }}>
            {entries.map(([key, value], index) => (
              <div key={index} style={{ marginBottom: '8px' }}>
                <Text strong>{key}: </Text>
                {typeof value === 'object' && value !== null ? 
                  <div style={{ paddingLeft: '16px', marginTop: '4px' }}>{renderDetailedContent(value)}</div> : 
                  <Text>{String(value)}</Text>
                }
              </div>
            ))
          }
          </div>
        );
      }
      return <Text>{String(fieldValue)}</Text>;
    };







    const basicInfoContent = (
      <>
        <Paragraph><strong>文献标题:</strong> {analysisResults?.title}</Paragraph>
        <Paragraph><strong>作者:</strong> {Array.isArray(analysisResults?.authors) ? analysisResults.authors.join(', ') : analysisResults?.authors}</Paragraph>
        <Paragraph><strong>发表期刊/会议:</strong> {analysisResults?.publication}</Paragraph>
        <Paragraph><strong>发表年份:</strong> {analysisResults?.year}</Paragraph>
        <Paragraph><strong>摘要:</strong> {analysisResults?.abstract}</Paragraph>
        <Paragraph><strong>关键词:</strong> {Array.isArray(analysisResults?.keywords) ? analysisResults.keywords.join(', ') : analysisResults?.keywords}</Paragraph>
      </>
    );
    // 使用后端返回的中文键名访问数据
    // 使用后端返回的中文键名访问数据，从 analysisResults.content 对象获取
    const researchMethodsContent = renderDetailedContent(analysisResults?.content?.['表征手段及结论']);
    const extractedDataContent = renderDetailedContent(analysisResults?.content?.['数据']);
    const finalConclusionsContent = renderDetailedContent(analysisResults?.content?.['结论']);
    const materialsContent = Array.isArray(analysisResults?.content?.['材料']) && analysisResults.content?.['材料'].length > 0 ? analysisResults.content['材料'].map((material, index) => (
      <Card key={index} size="small" title={material?.['材料名称'] || `材料 ${index + 1}`} style={{ marginBottom: 16 }}>
        {Object.entries(material || {}).map(([key, value]) => {
          if (key === '材料名称') return null; // 使用中文键名
          return <p key={key}><strong>{key}:</strong> {typeof value === 'object' ? JSON.stringify(value) : String(value)}</p>;
        })}
      </Card>
    )) : null;
    // 更新渲染逻辑以使用新的详细内容渲染函数
    const activityDataContent = renderDetailedContent(analysisResults?.content?.['活性数据']);
    const catalystPreparationContent = renderDetailedContent(analysisResults?.content?.['催化剂制备方法']);
    const mainFindingsContent = renderDetailedContent(analysisResults?.content?.['主要founded发现']);
    const experimentalValueInsightsContent = renderDetailedContent(analysisResults?.content?.['实验价值与启示']);

    console.log('Processed finalConclusionsContent:', finalConclusionsContent); // DEBUG

    return (
      <Collapse activeKey={activeKeys} onChange={setActiveKeys} items={[
        {
          key: '1',
          label: '基本信息',
          children: basicInfoContent
        },
        researchMethodsContent && {
          key: '2',
          label: '表征手段及结论',
          children: researchMethodsContent
        },
        materialsContent && { // 添加材料面板
          key: '4',
          label: '材料',
          children: materialsContent
        },
        activityDataContent && { // 活性数据面板
          key: '5',
          label: '活性数据',
          children: activityDataContent
        },
        catalystPreparationContent && { // 催化剂制备方法面板
          key: '6',
          label: '催化剂制备方法',
          children: catalystPreparationContent
        },
        finalConclusionsContent && { // 文章结论面板
          key: '8',
          label: '文章结论',
          children: finalConclusionsContent
        },
        experimentalValueInsightsContent && { // 实验价值与启示面板
          key: '9',
          label: '实验价值与启示',
          children: experimentalValueInsightsContent
        }
      ].filter(Boolean)} />
    );
  };

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ marginBottom: 16 }}>
        <Row align="middle" justify="space-between">
          <Col>
            <Typography>
              <Title level={2} style={{ marginBottom: 8 }}>文献分析</Title>
              <Paragraph>
                查看已上传文献的AI分析结果，包括关键信息提取、数据整理和研究结论总结。
              </Paragraph>
            </Typography>
          </Col>
          <Col>
            <Button
              type="primary"
              icon={<RobotOutlined />}
              onClick={() => setAiChatVisible(true)}
              style={{ marginLeft: 16 }}
            >
              AI助手
            </Button>
          </Col>
        </Row>
      </div>

      <Card title="文献列表" style={{ marginBottom: 16 }}>
        <div style={{ marginBottom: 16 }}>
          <Space>
            <Search
              placeholder="搜索文献"
              allowClear
              style={{ width: 250 }}
              onSearch={() => {}}
            />
            <Select defaultValue="all" style={{ width: 150 }}>
              <Option value="all">全部分类</Option>
              <Option value="材料科学">材料科学</Option>
              <Option value="化学工程">化学工程</Option>
              <Option value="物理学">物理学</Option>
              <Option value="计算机科学">计算机科学</Option>
            </Select>
            <Button type="primary" icon={<SearchOutlined />}>筛选</Button>
          </Space>
        </div>
        <Table 
          columns={columns} 
          dataSource={documents} 
          loading={loading && !selectedDocument}
          rowKey="id"
        />
      </Card>

      <Card title="分析结果">
        {renderAnalysisResults()}
      </Card>

      {/* 分析进度弹窗 */}
      <AnalysisProgress 
        documentId={progressDocumentId}
        visible={progressVisible}
        onClose={handleCloseProgress}
        onRetry={handleRetryAnalysis}
      />
      <AIChat
        visible={aiChatVisible}
        onClose={() => setAiChatVisible(false)}
      />
    </div>
  );
};

export default AnalysisPage;