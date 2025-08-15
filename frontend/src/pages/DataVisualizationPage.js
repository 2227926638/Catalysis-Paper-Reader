import React, { useState, useEffect } from 'react';
import { Typography, Card, Select, Button, Table, Spin, Empty, message, Space, Row, Col } from 'antd';
import { BarChartOutlined, LineChartOutlined, DotChartOutlined, RobotOutlined } from '@ant-design/icons';
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
    const [selectedDocumentId, setSelectedDocumentId] = useState('');
    const [, setAnalysisData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [tableData, setTableData] = useState([]);
    const [chartData, setChartData] = useState([]);
    const [xColumn, setXColumn] = useState('');
    const [yColumn, setYColumn] = useState('');
    const [availableColumns, setAvailableColumns] = useState([]);
    const [chartType, setChartType] = useState('line');
    const [aiChatVisible, setAiChatVisible] = useState(false);

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

    // 处理文档选择
    const handleDocumentChange = async (docId) => {
        setSelectedDocumentId(docId);
        setAnalysisData(null);
        setTableData([]);
        setChartData([]);
        setXColumn('');
        setYColumn('');
        setAvailableColumns([]);

        if (docId) {
            setLoading(true);
            try {
                const response = await getAnalysisResult(docId);
                const rawAiResponse = response.raw_ai_response;
                let parsedAiResponse = null;
                try {
                    parsedAiResponse = JSON.parse(rawAiResponse);
                } catch (parseError) {
                    console.error('Error parsing AI response JSON:', parseError);
                    message.error('无法解析AI响应数据');
                    setLoading(false);
                    return;
                }
                setAnalysisData(parsedAiResponse);
                if (parsedAiResponse) {
                    extractTableData(parsedAiResponse);
                } else {
                    setTableData([]);
                    setChartData([]);
                }
            } catch (err) {
                console.error('Error fetching analysis result:', err);
                message.error('无法获取分析结果或解析AI响应');
            } finally {
                setLoading(false);
            }
        }
    };

    // 从AI响应中提取表格数据
    const extractTableData = (data) => {
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
            message.warning('AI响应中未找到活性数据，请检查数据格式');
            setAvailableColumns([]);
            setTableData([]);
            setChartData([]);
            return;
        }
        const lines = activityData.split('\n').filter(line => line.trim() !== '');
        
        if (lines.length < 2) {
            message.warning('催化活性数据格式不正确或数据不足');
            setAvailableColumns([]);
            setTableData([]);
            setChartData([]);
            return;
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
            message.warning('未找到有效的表格数据');
            setAvailableColumns([]);
            setTableData([]);
            setChartData([]);
            return;
        }

        // 解析表头
        let headers = lines[headerLineIndex].split('|').map(h => h.trim()).filter(h => h !== '');
        if (headers.length === 0) {
            message.error('表头解析失败');
            setAvailableColumns([]);
            setTableData([]);
            setChartData([]);
            return;
        }

        // 动态生成列定义
        const dynamicCols = headers.map(header => ({ id: header, label: header }));
        setAvailableColumns(dynamicCols);

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

        console.log('提取的数据:', extractedData);
        setTableData(extractedData);
        setChartData(extractedData);
    };

    // 生成图表数据
    const generateChartData = () => {
        if (!chartData.length || !xColumn || !yColumn) return [];

        switch (chartType) {
            case 'line':
                return [{
                    x: chartData.map(row => row[xColumn]),
                    y: chartData.map(row => parseFloat(row[yColumn]) || 0),
                    type: 'scatter',
                    mode: 'lines+markers',
                    name: `${yColumn} vs ${xColumn}`,
                    line: { color: '#1890ff', width: 2 },
                    marker: { color: '#1890ff', size: 6 }
                }];
            case 'scatter':
                return [{
                    x: chartData.map(row => row[xColumn]),
                    y: chartData.map(row => parseFloat(row[yColumn]) || 0),
                    type: 'scatter',
                    mode: 'markers',
                    name: `${yColumn} vs ${xColumn}`,
                    marker: { color: '#52c41a', size: 8 }
                }];
            case 'bar':
                return [{
                    x: chartData.map(row => row[xColumn]),
                    y: chartData.map(row => parseFloat(row[yColumn]) || 0),
                    type: 'bar',
                    name: `${yColumn} vs ${xColumn}`,
                    marker: { color: '#fa8c16' }
                }];
            default:
                return [];
        }
    };

    // 生成表格列定义
    const generateTableColumns = () => {
        return availableColumns.map(col => ({
            title: col.label,
            dataIndex: col.id,
            key: col.id,
            ellipsis: true
        }));
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
                选择已分析的文献，系统将自动提取催化活性数据并生成可视化图表。
            </Paragraph>

            <Card title="文献选择" style={{ marginBottom: 16 }}>
                <Select
                    placeholder="请选择一份文献"
                    style={{ width: '100%' }}
                    value={selectedDocumentId}
                    onChange={handleDocumentChange}
                    loading={loading}
                >
                    {documents.map(doc => (
                        <Option key={doc.id} value={doc.id}>
                            {doc.filename || doc.name || `文档 ${doc.id}`}
                        </Option>
                    ))}
                </Select>
            </Card>

            {loading && (
                <Card>
                    <div style={{ textAlign: 'center', padding: '50px 0' }}>
                        <Spin size="large" />
                        <div style={{ marginTop: 16 }}>正在加载分析数据...</div>
                    </div>
                </Card>
            )}

            {tableData.length > 0 && (
                <Card title="提取数据表格" style={{ marginBottom: 16 }}>
                    <Table
                        columns={generateTableColumns()}
                        dataSource={tableData}
                        pagination={{ pageSize: 10 }}
                        scroll={{ x: 'max-content' }}
                        size="middle"
                    />
                </Card>
            )}

            {chartData.length > 0 && (
                <Card title="数据可视化图表">
                    <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
                        <Col xs={24} sm={8}>
                            <Space direction="vertical" style={{ width: '100%' }}>
                                <span>X轴数据：</span>
                                <Select
                                    placeholder="选择X轴数据"
                                    style={{ width: '100%' }}
                                    value={xColumn}
                                    onChange={setXColumn}
                                >
                                    {availableColumns.map(col => (
                                        <Option key={col.id} value={col.id}>{col.label}</Option>
                                    ))}
                                </Select>
                            </Space>
                        </Col>
                        <Col xs={24} sm={8}>
                            <Space direction="vertical" style={{ width: '100%' }}>
                                <span>Y轴数据：</span>
                                <Select
                                    placeholder="选择Y轴数据"
                                    style={{ width: '100%' }}
                                    value={yColumn}
                                    onChange={setYColumn}
                                >
                                    {availableColumns.map(col => (
                                        <Option key={col.id} value={col.id}>{col.label}</Option>
                                    ))}
                                </Select>
                            </Space>
                        </Col>
                        <Col xs={24} sm={8}>
                            <Space direction="vertical" style={{ width: '100%' }}>
                                <span>图表类型：</span>
                                <Select
                                    value={chartType}
                                    onChange={setChartType}
                                    style={{ width: '100%' }}
                                >
                                    <Option value="line">
                                        <LineChartOutlined /> 折线图
                                    </Option>
                                    <Option value="scatter">
                                        <DotChartOutlined /> 散点图
                                    </Option>
                                    <Option value="bar">
                                        <BarChartOutlined /> 柱状图
                                    </Option>
                                </Select>
                            </Space>
                        </Col>
                    </Row>

                    {xColumn && yColumn && (
                        <div style={{ height: '500px', border: '1px solid #f0f0f0', borderRadius: '6px', padding: '16px' }}>
                            <Plot
                                data={generateChartData()}
                                layout={{
                                    title: {
                                        text: `${yColumn} vs ${xColumn}`,
                                        font: { size: 16 }
                                    },
                                    xaxis: {
                                        title: {
                                            text: xColumn,
                                            font: { size: 14 }
                                        },
                                        showgrid: true,
                                        gridcolor: '#e0e0e0',
                                        zeroline: false
                                    },
                                    yaxis: {
                                        title: {
                                            text: yColumn,
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
                                        bgcolor: 'rgba(255,255,255,0.8)',
                                        bordercolor: '#cccccc',
                                        borderwidth: 1
                                    },
                                    margin: { l: 60, r: 60, t: 60, b: 60 }
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
                    )}

                    {(!xColumn || !yColumn) && (
                        <Empty
                            description="请选择X轴和Y轴数据以生成图表"
                            style={{ padding: '50px 0' }}
                        />
                    )}
                </Card>
            )}

            {!loading && !tableData.length && selectedDocumentId && (
                <Card>
                    <Empty
                        description="该文献暂无可用的催化活性数据"
                        style={{ padding: '50px 0' }}
                    />
                </Card>
            )}

            {!selectedDocumentId && (
                <Card>
                    <Empty
                        description="请选择一份文献开始数据可视化"
                        style={{ padding: '50px 0' }}
                    />
                </Card>
            )}

            <AIChat visible={aiChatVisible} onClose={() => setAiChatVisible(false)} />
        </div>
    );
};

export default DataVisualizationPage;