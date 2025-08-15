import React, { useState, useEffect } from 'react';
import { Typography, Card, Select, Button, Table, Spin, Empty, message, Space, Row, Col, Tag, ColorPicker, Divider, Tooltip } from 'antd';
import { BarChartOutlined, LineChartOutlined, DotChartOutlined, RobotOutlined, PlusOutlined, DeleteOutlined, SettingOutlined, EyeOutlined } from '@ant-design/icons';
import { motion, AnimatePresence } from 'framer-motion';
import { useSpring, animated } from 'react-spring';
import Plot from 'react-plotly.js';
import { getDocuments, getAnalysisResult } from '../services/api';
import AIChat from '../components/AIChat';

const { Title, Paragraph } = Typography;
const { Option } = Select;

/**
 * 数据可视化页面组件
 * 负责展示文献分析数据的图表可视化
 */
const DataVisualizationPage = () => {
    const [documents, setDocuments] = useState([]);
    const [selectedDocumentIds, setSelectedDocumentIds] = useState([]);
    const [analysisDataMap, setAnalysisDataMap] = useState(new Map());
    const [loading, setLoading] = useState(false);
    const [combinedTableData, setCombinedTableData] = useState([]);
    const [combinedChartData, setCombinedChartData] = useState([]);
    const [availableColumns, setAvailableColumns] = useState([]);
    const [charts, setCharts] = useState([{
        id: 'chart-1',
        xColumn: '',
        yColumn: '',
        chartType: 'line',
        title: '图表 1',
        documentStyles: {}, // 存储每个文献的样式配置
        showStylePanel: false // 控制样式面板显示
    }]);
    const [aiChatVisible, setAiChatVisible] = useState(false);

    // 数据类型识别函数
    const identifyDataType = (values) => {
        if (!values || values.length === 0) return 'text';
        
        const nonEmptyValues = values.filter(v => v !== null && v !== undefined && v !== '');
        if (nonEmptyValues.length === 0) return 'text';
        
        // 检查是否为数值型
        const numericValues = nonEmptyValues.filter(v => !isNaN(parseFloat(v)) && isFinite(v));
        if (numericValues.length / nonEmptyValues.length > 0.8) {
            return 'numeric';
        }
        
        // 检查是否为时间序列
        const dateValues = nonEmptyValues.filter(v => {
            const date = new Date(v);
            return !isNaN(date.getTime()) && v.toString().match(/\d{4}/);
        });
        if (dateValues.length / nonEmptyValues.length > 0.6) {
            return 'datetime';
        }
        
        // 检查是否为分类数据
        const uniqueValues = [...new Set(nonEmptyValues)];
        if (uniqueValues.length < nonEmptyValues.length * 0.5 && uniqueValues.length > 1) {
            return 'categorical';
        }
        
        return 'text';
    };
    
    // 智能轴选择推荐
    const getAxisRecommendations = (columns) => {
        const recommendations = {
            xAxis: [],
            yAxis: []
        };
        
        columns.forEach(col => {
            const values = combinedChartData.map(row => row[col.id]);
            const dataType = identifyDataType(values);
            
            switch (dataType) {
                case 'numeric':
                    recommendations.yAxis.push({ ...col, type: 'numeric', priority: 3 });
                    recommendations.xAxis.push({ ...col, type: 'numeric', priority: 2 });
                    break;
                case 'datetime':
                    recommendations.xAxis.push({ ...col, type: 'datetime', priority: 3 });
                    break;
                case 'categorical':
                    recommendations.xAxis.push({ ...col, type: 'categorical', priority: 2 });
                    break;
                default:
                    recommendations.xAxis.push({ ...col, type: 'text', priority: 1 });
            }
        });
        
        // 按优先级排序
        recommendations.xAxis.sort((a, b) => b.priority - a.priority);
        recommendations.yAxis.sort((a, b) => b.priority - a.priority);
        
        return recommendations;
    };

    // 获取文档列表
    useEffect(() => {
        const fetchDocuments = async () => {
            try {
                const response = await getDocuments();
                if (response && Array.isArray(response) && response.every(doc => doc && typeof doc.id !== 'undefined' && (typeof doc.filename !== 'undefined' || typeof doc.name !== 'undefined'))) {
                    const standardizedData = response.map(doc => {
                        if (typeof doc.filename === 'undefined' && typeof doc.name !== 'undefined') {
                            return { ...doc, filename: doc.name };
                        }
                        return doc;
                    });
                    setDocuments(standardizedData);
                } else {
                    console.error('Invalid data format received from getDocuments API:', response);
                    message.error('获取文献列表失败：数据格式不正确');
                    setDocuments([]);
                }
            } catch (err) {
                console.error('Error fetching documents:', err);
                message.error('无法获取文献列表');
            }
        };
        fetchDocuments();
    }, []);

    // 处理多文档选择
    const handleDocumentChange = async (docIds) => {
        setSelectedDocumentIds(docIds);
        
        if (docIds.length === 0) {
            setAnalysisDataMap(new Map());
            setCombinedTableData([]);
            setCombinedChartData([]);
            setAvailableColumns([]);
            return;
        }

        setLoading(true);
        const newAnalysisDataMap = new Map();
        
        try {
            // 并行获取所有选中文档的分析结果
            const promises = docIds.map(async (docId) => {
                try {
                    const response = await getAnalysisResult(docId);
                    const rawAiResponse = response.raw_ai_response;
                    const parsedAiResponse = JSON.parse(rawAiResponse);
                    return { docId, data: parsedAiResponse };
                } catch (error) {
                    console.error(`Error processing document ${docId}:`, error);
                    return { docId, data: null };
                }
            });
            
            const results = await Promise.all(promises);
            
            results.forEach(({ docId, data }) => {
                if (data) {
                    newAnalysisDataMap.set(docId, data);
                }
            });
            
            setAnalysisDataMap(newAnalysisDataMap);
            
            if (newAnalysisDataMap.size > 0) {
                combineMultipleDocumentData(newAnalysisDataMap);
            } else {
                setCombinedTableData([]);
                setCombinedChartData([]);
                setAvailableColumns([]);
            }
        } catch (err) {
            console.error('Error fetching analysis results:', err);
            message.error('无法获取分析结果');
        } finally {
            setLoading(false);
        }
    };

    // 合并多个文档的数据
    const combineMultipleDocumentData = (analysisDataMap) => {
        const allTableData = [];
        const columnSet = new Set();
        
        analysisDataMap.forEach((data, docId) => {
            const docName = documents.find(doc => doc.id === docId)?.filename || `文档${docId}`;
            const extractedData = extractSingleDocumentData(data, docName);
            
            if (extractedData.length > 0) {
                // 添加文档来源标识
                const dataWithSource = extractedData.map(row => ({
                    ...row,
                    '文档来源': docName,
                    '文档ID': docId
                }));
                
                allTableData.push(...dataWithSource);
                
                // 收集所有列名
                Object.keys(extractedData[0]).forEach(col => columnSet.add(col));
            }
        });
        
        // 添加元数据列
        columnSet.add('文档来源');
        columnSet.add('文档ID');
        
        const dynamicCols = Array.from(columnSet).map(header => ({ id: header, label: header }));
        setAvailableColumns(dynamicCols);
        setCombinedTableData(allTableData);
        setCombinedChartData(allTableData);
    };
    
    // 从单个文档AI响应中提取表格数据
    const extractSingleDocumentData = (data, docName = '') => {
        // 尝试从不同的字段中获取活性数据
        let activityData = null;
        
        // 优先查找催化活性数据字段
        if (data && data.催化活性数据) {
            activityData = data.催化活性数据;
        } else if (data && data.活性数据) {
            // 处理数组格式的活性数据
            if (Array.isArray(data.活性数据)) {
                // 将数组转换为markdown表格格式
                const arrayData = data.活性数据;
                if (arrayData.length > 0) {
                    const headers = Object.keys(arrayData[0]);
                    let markdownTable = '| ' + headers.join(' | ') + ' |\n';
                    markdownTable += '| ' + headers.map(() => '---').join(' | ') + ' |\n';
                    arrayData.forEach(row => {
                        const values = headers.map(header => row[header] || '');
                        markdownTable += '| ' + values.join(' | ') + ' |\n';
                    });
                    activityData = markdownTable;
                } else {
                    activityData = null;
                }
            } else {
                activityData = data.活性数据;
            }
        } else if (data && data.activity_data_markdown) {
            activityData = data.activity_data_markdown;
        }

        if (!activityData) {
            console.warn(`文档 ${docName} 中未找到活性数据`);
            return [];
        }
        const lines = activityData.split('\n').filter(line => line.trim() !== '');
        
        if (lines.length < 2) {
            console.warn(`文档 ${docName} 催化活性数据格式不正确或数据不足`);
            return [];
        }

        // 查找表头行和数据开始行
        let headerLineIndex = -1;
        let dataStartIndex = -1;
        
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes('|') && !lines[i].includes('---')) {
                headerLineIndex = i;
                // 数据行通常在表头的下一行，或者跳过分隔符行
                dataStartIndex = i + 1;
                if (dataStartIndex < lines.length && lines[dataStartIndex].includes('---')) {
                    dataStartIndex++;
                }
                break;
            }
        }

        if (headerLineIndex === -1 || dataStartIndex >= lines.length) {
            console.warn(`文档 ${docName} 未找到有效的表格数据`);
            return [];
        }

        // 解析表头
        let headers = lines[headerLineIndex].split('|').map(h => h.trim()).filter(h => h !== '');
        if (headers.length === 0) {
            console.error(`文档 ${docName} 表头解析失败`);
            return [];
        }

        // 解析数据行
        const dataLines = lines.slice(dataStartIndex);
        const extractedData = dataLines.map((line, lineIndex) => {
            let values = line.split('|').map(v => v.trim()).filter(v => v !== '');
            
            const rowData = {};
            headers.forEach((header, index) => {
                rowData[header] = values[index] || '';
            });
            return rowData;
        }).filter(row => Object.values(row).some(val => val !== ''));

        console.log(`文档 ${docName} 提取的数据:`, extractedData);
        return extractedData;
    };

    // 图表管理函数
    const addNewChart = () => {
        const newChart = {
            id: `chart-${Date.now()}`,
            xColumn: '',
            yColumn: '',
            chartType: 'line',
            title: `图表 ${charts.length + 1}`,
            documentStyles: {},
            showStylePanel: false
        };
        setCharts([...charts, newChart]);
    };
    
    const removeChart = (chartId) => {
        if (charts.length > 1) {
            setCharts(charts.filter(chart => chart.id !== chartId));
        }
    };
    
    const updateChart = (chartId, updates) => {
        setCharts(charts.map(chart => 
            chart.id === chartId ? { ...chart, ...updates } : chart
        ));
    };

    const toggleStylePanel = (chartId) => {
        setCharts(charts.map(chart => 
            chart.id === chartId 
                ? { ...chart, showStylePanel: !chart.showStylePanel }
                : chart
        ));
    };

    // 生成单个图表数据
    const generateChartData = (chart) => {
        if (!combinedChartData.length || !chart.xColumn || !chart.yColumn) return [];

        // 预定义颜色和形状
        const colors = ['#1890ff', '#52c41a', '#fa8c16', '#722ed1', '#eb2f96', '#13c2c2', '#f5222d', '#fa541c', '#fadb14', '#a0d911'];
        const symbols = ['circle', 'square', 'diamond', 'cross', 'triangle-up', 'triangle-down', 'star', 'hexagon', 'pentagon', 'octagon'];
        
        // 按文档来源分组数据
        const documentGroups = {};
        combinedChartData.forEach(row => {
            const docSource = row['文档来源'] || '未知文档';
            if (!documentGroups[docSource]) {
                documentGroups[docSource] = [];
            }
            documentGroups[docSource].push(row);
        });

        const traces = [];
        const documentNames = Object.keys(documentGroups);
        
        documentNames.forEach((docName, index) => {
            const docData = documentGroups[docName];
            // 使用图表配置的样式，如果没有配置则使用默认样式
            const defaultColor = colors[index % colors.length];
            const defaultSymbol = symbols[index % symbols.length];
            const docStyle = chart.documentStyles[docName] || {};
            const color = docStyle.color || defaultColor;
            const symbol = docStyle.symbol || defaultSymbol;
            
            const xData = docData.map(row => row[chart.xColumn]);
            const yData = docData.map(row => parseFloat(row[chart.yColumn]) || 0);
            
            switch (chart.chartType) {
                case 'line':
                    traces.push({
                        x: xData,
                        y: yData,
                        type: 'scatter',
                        mode: 'lines+markers',
                        name: docName,
                        line: { color, width: 2 },
                        marker: { 
                            color, 
                            size: 8,
                            symbol: symbol,
                            line: { width: 1, color: '#fff' }
                        }
                    });
                    break;
                case 'scatter':
                    traces.push({
                        x: xData,
                        y: yData,
                        type: 'scatter',
                        mode: 'markers',
                        name: docName,
                        marker: { 
                            color, 
                            size: 10,
                            symbol: symbol,
                            line: { width: 1, color: '#fff' }
                        }
                    });
                    break;
                case 'bar':
                    traces.push({
                        x: xData,
                        y: yData,
                        type: 'bar',
                        name: docName,
                        marker: { 
                            color,
                            opacity: 0.8,
                            line: { width: 1, color: '#fff' }
                        }
                    });
                    break;
                default:
                    break;
            }
        });
        
        return traces;
    };

    // 生成表格列定义
    const generateTableColumns = () => {
        return availableColumns.map(col => {
            const values = combinedChartData.map(row => row[col.id]);
            const dataType = identifyDataType(values);
            
            return {
                title: (
                    <span>
                        {col.label}
                        <Tag 
                            size="small" 
                            color={dataType === 'numeric' ? 'blue' : dataType === 'datetime' ? 'green' : dataType === 'categorical' ? 'orange' : 'default'}
                            style={{ marginLeft: 4 }}
                        >
                            {dataType === 'numeric' ? '数值' : dataType === 'datetime' ? '时间' : dataType === 'categorical' ? '分类' : '文本'}
                        </Tag>
                    </span>
                ),
                dataIndex: col.id,
                key: col.id,
                ellipsis: true,
                sorter: dataType === 'numeric' ? (a, b) => parseFloat(a[col.id]) - parseFloat(b[col.id]) : true
            };
        });
    };
    
    // 渲染轴选择器
    const renderAxisSelector = (chart, axis) => {
        const recommendations = getAxisRecommendations(availableColumns);
        const options = axis === 'x' ? recommendations.xAxis : recommendations.yAxis;
        
        return (
            <Select
                placeholder={`选择${axis.toUpperCase()}轴数据`}
                style={{ width: '100%' }}
                value={axis === 'x' ? chart.xColumn : chart.yColumn}
                onChange={(value) => updateChart(chart.id, { [axis + 'Column']: value })}
                optionLabelProp="label"
            >
                {options.map(col => (
                    <Option key={col.id} value={col.id} label={col.label}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span>{col.label}</span>
                            <Tag 
                                size="small" 
                                color={col.type === 'numeric' ? 'blue' : col.type === 'datetime' ? 'green' : col.type === 'categorical' ? 'orange' : 'default'}
                            >
                                {col.type === 'numeric' ? '数值' : col.type === 'datetime' ? '时间' : col.type === 'categorical' ? '分类' : '文本'}
                            </Tag>
                        </div>
                    </Option>
                ))}
            </Select>
        );
    };

    // 渲染样式配置面板
    const renderStylePanel = (chart) => {
        if (!combinedChartData.length) return null;
        
        // 获取所有文献名称
        const documentNames = [...new Set(combinedChartData.map(row => row['文档来源'] || '未知文档'))];
        const colors = ['#1890ff', '#52c41a', '#fa8c16', '#722ed1', '#eb2f96', '#13c2c2', '#f5222d', '#fa541c', '#fadb14', '#a0d911'];
        const symbols = [
            { value: 'circle', label: '圆形' },
            { value: 'square', label: '方形' },
            { value: 'diamond', label: '菱形' },
            { value: 'cross', label: '十字' },
            { value: 'triangle-up', label: '上三角' },
            { value: 'triangle-down', label: '下三角' },
            { value: 'star', label: '星形' },
            { value: 'hexagon', label: '六边形' },
            { value: 'pentagon', label: '五边形' },
            { value: 'octagon', label: '八边形' }
        ];
        
        return (
            <div style={{ 
                marginTop: 16, 
                padding: 20, 
                background: 'linear-gradient(135deg, #f6f9fc 0%, #f1f8ff 100%)', 
                borderRadius: 12,
                border: '1px solid #e6f7ff',
                boxShadow: '0 4px 12px rgba(24, 144, 255, 0.08)'
            }}>
                <div style={{ 
                    marginBottom: 16, 
                    fontWeight: 600,
                    fontSize: '16px',
                    color: '#1890ff',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8
                }}>
                    <SettingOutlined style={{ fontSize: '18px' }} /> 
                    样式配置
                </div>
                <Space direction="vertical" style={{ width: '100%' }} size="middle">
                    {documentNames.map((docName, index) => {
                        const defaultColor = colors[index % colors.length];
                        const defaultSymbol = symbols[index % symbols.length].value;
                        const currentStyle = chart.documentStyles[docName] || {};
                        
                        return (
                            <motion.div 
                                key={docName}
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: index * 0.1 }}
                                style={{ 
                                    padding: '16px', 
                                    border: '1px solid #e8f4fd', 
                                    borderRadius: '8px',
                                    background: 'white',
                                    boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                                    transition: 'all 0.3s ease'
                                }}
                            >
                                <div style={{ 
                                    marginBottom: 12, 
                                    fontWeight: 600,
                                    color: '#1890ff',
                                    fontSize: '14px',
                                    display: 'flex',
                                    alignItems: 'center'
                                }}>
                                    <div style={{
                                        width: '10px',
                                        height: '10px',
                                        borderRadius: '50%',
                                        background: currentStyle.color || defaultColor,
                                        marginRight: '10px',
                                        boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                                    }} />
                                    <Tooltip title={docName}>
                                        <span style={{ cursor: 'help' }}>
                                            {docName.length > 20 ? `${docName.substring(0, 20)}...` : docName}
                                        </span>
                                    </Tooltip>
                                </div>
                                <Row gutter={16} align="middle">
                                    <Col span={12}>
                                        <Space align="center" style={{ width: '100%' }}>
                                            <span style={{ fontWeight: 500, color: '#666', minWidth: '50px' }}>颜色：</span>
                                            <ColorPicker
                                                value={currentStyle.color || defaultColor}
                                                onChange={(color) => {
                                                    const newStyles = {
                                                        ...chart.documentStyles,
                                                        [docName]: {
                                                            ...currentStyle,
                                                            color: color.toHexString()
                                                        }
                                                    };
                                                    updateChart(chart.id, { documentStyles: newStyles });
                                                }}
                                                size="small"
                                                showText
                                                presets={[
                                                    {
                                                        label: '推荐颜色',
                                                        colors: colors
                                                    }
                                                ]}
                                            />
                                        </Space>
                                    </Col>
                                    <Col span={12}>
                                        <Space align="center" style={{ width: '100%' }}>
                                            <span style={{ fontWeight: 500, color: '#666', minWidth: '50px' }}>形状：</span>
                                            <Select
                                                value={currentStyle.symbol || defaultSymbol}
                                                onChange={(value) => {
                                                    const newStyles = {
                                                        ...chart.documentStyles,
                                                        [docName]: {
                                                            ...currentStyle,
                                                            symbol: value
                                                        }
                                                    };
                                                    updateChart(chart.id, { documentStyles: newStyles });
                                                }}
                                                style={{ width: '100%', minWidth: 100 }}
                                                size="small"
                                            >
                                                {symbols.map(symbol => (
                                                    <Option key={symbol.value} value={symbol.value}>
                                                        <Space>
                                                            <span style={{ 
                                                                fontSize: '14px',
                                                                color: currentStyle.color || defaultColor
                                                            }}>●</span>
                                                            {symbol.label}
                                                        </Space>
                                                    </Option>
                                                ))}
                                            </Select>
                                        </Space>
                                    </Col>
                                </Row>
                            </motion.div>
                        );
                    })}
                    
                    {documentNames.length === 0 && (
                        <div style={{
                            textAlign: 'center',
                            padding: '30px',
                            color: '#999',
                            fontStyle: 'italic',
                            background: 'white',
                            borderRadius: '8px',
                            border: '1px dashed #d9d9d9'
                        }}>
                            <EyeOutlined style={{ fontSize: '24px', marginBottom: '8px', display: 'block' }} />
                            暂无可配置的文献数据
                        </div>
                    )}
                </Space>
            </div>
        );
    };

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <Title level={2} style={{ margin: 0 }}>数据可视化</Title>
                <Button
                    type="primary"
                    icon={<RobotOutlined />}
                    onClick={() => setAiChatVisible(true)}
                >
                    AI助手
                </Button>
            </div>

            <Paragraph>
                选择已分析的文献进行数据可视化分析。支持多文献选择以进行跨文献对比分析。
            </Paragraph>

            <Card title="文献选择" style={{ marginBottom: 16 }}>
                <Space direction="vertical" style={{ width: '100%' }}>
                    <div>
                        <span style={{ marginRight: 8 }}>选择文献：</span>
                        <Tag color="blue">已选择 {selectedDocumentIds.length} 份文献</Tag>
                    </div>
                    <Select
                        mode="multiple"
                        placeholder="请选择一份或多份文献"
                        style={{ width: '100%' }}
                        value={selectedDocumentIds}
                        onChange={handleDocumentChange}
                        loading={loading}
                        maxTagCount="responsive"
                    >
                        {documents.map(doc => (
                            <Option key={doc.id} value={doc.id}>
                                {doc.filename || doc.name || `文档 ${doc.id}`}
                            </Option>
                        ))}
                    </Select>
                </Space>
            </Card>

            {loading && (
                <Card>
                    <div style={{ textAlign: 'center', padding: '50px 0' }}>
                        <Spin size="large" />
                        <div style={{ marginTop: 16 }}>正在加载分析数据...</div>
                    </div>
                </Card>
            )}

            {combinedTableData.length > 0 && (
                <Card title="合并数据表格" style={{ marginBottom: 16 }}>
                    <div style={{ marginBottom: 16 }}>
                        <Tag color="green">总计 {combinedTableData.length} 条数据</Tag>
                        <Tag color="blue">来自 {selectedDocumentIds.length} 份文献</Tag>
                    </div>
                    <Table
                        columns={generateTableColumns()}
                        dataSource={combinedTableData}
                        pagination={{ pageSize: 15, showSizeChanger: true, showQuickJumper: true }}
                        scroll={{ x: 'max-content' }}
                        size="middle"
                        rowKey={(record, index) => `${record['文档ID']}-${index}`}
                    />
                </Card>
            )}

            {combinedChartData.length > 0 && (
                <div>
                    <AnimatePresence>
                        {charts.map((chart, index) => (
                            <motion.div
                                key={chart.id}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -20 }}
                                transition={{ duration: 0.3 }}
                            >
                                <Card 
                                    title={
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={{ fontSize: '16px', fontWeight: 600 }}>{chart.title}</span>
                                            <Space>
                                                <Tooltip title="样式设置">
                                                    <Button 
                                                        type={chart.showStylePanel ? "primary" : "text"}
                                                        size="small"
                                                        icon={<SettingOutlined />}
                                                        onClick={() => toggleStylePanel(chart.id)}
                                                    />
                                                </Tooltip>
                                                {charts.length > 1 && (
                                                    <Tooltip title="删除图表">
                                                        <Button 
                                                            type="text" 
                                                            danger 
                                                            size="small"
                                                            icon={<DeleteOutlined />}
                                                            onClick={() => removeChart(chart.id)}
                                                        >
                                                            删除
                                                        </Button>
                                                    </Tooltip>
                                                )}
                                            </Space>
                                        </div>
                                    }
                                    style={{ 
                                        marginBottom: 16,
                                        borderRadius: '12px',
                                        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                                        border: '1px solid #f0f0f0'
                                    }}
                                    bodyStyle={{ padding: '20px' }}
                                >
                                    <motion.div
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        transition={{ delay: 0.1 }}
                                    >
                                        <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
                                            <Col xs={24} sm={8}>
                                                <Space direction="vertical" style={{ width: '100%' }}>
                                                    <span style={{ fontWeight: 500, color: '#666' }}>X轴数据：</span>
                                                    {renderAxisSelector(chart, 'x')}
                                                </Space>
                                            </Col>
                                            <Col xs={24} sm={8}>
                                                <Space direction="vertical" style={{ width: '100%' }}>
                                                    <span style={{ fontWeight: 500, color: '#666' }}>Y轴数据：</span>
                                                    {renderAxisSelector(chart, 'y')}
                                                </Space>
                                            </Col>
                                            <Col xs={24} sm={8}>
                                                <Space direction="vertical" style={{ width: '100%' }}>
                                                    <span style={{ fontWeight: 500, color: '#666' }}>图表类型：</span>
                                                    <Select
                                                        value={chart.chartType}
                                                        onChange={(value) => updateChart(chart.id, { chartType: value })}
                                                        style={{ width: '100%' }}
                                                        size="middle"
                                                    >
                                                        <Option value="line">
                                                            <Space><LineChartOutlined style={{ color: '#1890ff' }} /> 折线图</Space>
                                                        </Option>
                                                        <Option value="scatter">
                                                            <Space><DotChartOutlined style={{ color: '#52c41a' }} /> 散点图</Space>
                                                        </Option>
                                                        <Option value="bar">
                                                            <Space><BarChartOutlined style={{ color: '#fa8c16' }} /> 柱状图</Space>
                                                        </Option>
                                                    </Select>
                                                </Space>
                                            </Col>
                                        </Row>
                                    </motion.div>

                                    <AnimatePresence>
                                        {chart.showStylePanel && (
                                            <motion.div
                                                initial={{ opacity: 0, height: 0 }}
                                                animate={{ opacity: 1, height: 'auto' }}
                                                exit={{ opacity: 0, height: 0 }}
                                                transition={{ duration: 0.3 }}
                                            >
                                                {renderStylePanel(chart)}
                                            </motion.div>
                                        )}
                                    </AnimatePresence>

                                    <motion.div
                                        initial={{ opacity: 0, scale: 0.95 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        transition={{ delay: 0.3, duration: 0.4 }}
                                    >
                                        {chart.xColumn && chart.yColumn ? (
                                            <div style={{ 
                                                height: '500px', 
                                                border: '1px solid #f0f0f0', 
                                                borderRadius: '8px', 
                                                padding: '16px',
                                                background: '#fafafa'
                                            }}>
                                                <Plot
                                                    data={generateChartData(chart)}
                                                    layout={{
                                                        title: {
                                                            text: `${chart.yColumn} vs ${chart.xColumn}`,
                                                            font: { size: 16, family: 'Arial, sans-serif' }
                                                        },
                                                        xaxis: {
                                                            title: {
                                                                text: chart.xColumn,
                                                                font: { size: 14 }
                                                            },
                                                            showgrid: true,
                                                            gridcolor: '#e0e0e0',
                                                            zeroline: false
                                                        },
                                                        yaxis: {
                                                            title: {
                                                                text: chart.yColumn,
                                                                font: { size: 14 }
                                                            },
                                                            showgrid: true,
                                                            gridcolor: '#e0e0e0',
                                                            zeroline: false
                                                        },
                                                        showlegend: true,
                                                        legend: {
                                                            x: 1,
                                                            y: 1,
                                                            bgcolor: 'rgba(255,255,255,0.9)',
                                                            bordercolor: '#cccccc',
                                                            borderwidth: 1
                                                        },
                                                        margin: { l: 60, r: 60, t: 60, b: 60 },
                                                        plot_bgcolor: 'white',
                                                        paper_bgcolor: 'white'
                                                    }}
                                                    config={{
                                                        displayModeBar: true,
                                                        displaylogo: false,
                                                        modeBarButtonsToRemove: ['pan2d', 'lasso2d', 'select2d'],
                                                        responsive: true
                                                    }}
                                                    style={{ width: '100%', height: '100%' }}
                                                />
                                            </div>
                                        ) : (
                                            <div style={{
                                                padding: '60px 20px',
                                                textAlign: 'center',
                                                background: '#fafafa',
                                                borderRadius: '8px',
                                                border: '2px dashed #d9d9d9'
                                            }}>
                                                <Empty
                                                    description={
                                                        <span style={{ color: '#999', fontSize: '14px' }}>
                                                            请选择X轴和Y轴数据以生成图表
                                                        </span>
                                                    }
                                                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                                                />
                                            </div>
                                        )}
                                    </motion.div>
                                </Card>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                    
                    <motion.div
                         initial={{ opacity: 0, scale: 0.9 }}
                         animate={{ opacity: 1, scale: 1 }}
                         transition={{ duration: 0.3 }}
                     >
                         <Card style={{ 
                             marginBottom: 16, 
                             textAlign: 'center',
                             borderRadius: '12px',
                             border: '2px dashed #d9d9d9',
                             background: '#fafafa'
                         }}>
                             <Button 
                                 type="dashed" 
                                 icon={<PlusOutlined />} 
                                 onClick={addNewChart}
                                 style={{ 
                                     height: '80px', 
                                     fontSize: '16px',
                                     borderRadius: '8px',
                                     border: '2px dashed #1890ff',
                                     color: '#1890ff',
                                     fontWeight: 500
                                 }}
                                 size="large"
                             >
                                 添加新图表
                             </Button>
                         </Card>
                     </motion.div>
                </div>
            )}

            {combinedChartData.length === 0 && selectedDocumentIds.length > 0 && !loading && (
                <Card>
                    <Empty
                        description="所选文献暂无可用的数据进行可视化分析"
                        style={{ padding: '50px 0' }}
                    />
                </Card>
            )}

            {selectedDocumentIds.length === 0 && (
                <Card>
                    <Empty
                        description="请选择文献以开始数据可视化分析"
                        style={{ padding: '50px 0' }}
                    />
                </Card>
            )}

            <AIChat visible={aiChatVisible} onClose={() => setAiChatVisible(false)} />
        </div>
    );
};

export default DataVisualizationPage;