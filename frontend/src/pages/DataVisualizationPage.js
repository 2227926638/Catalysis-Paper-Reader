import React, { useState, useEffect, useRef } from 'react';
import { Container, Typography, Box, Select, MenuItem, FormControl, InputLabel, Button, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, CircularProgress, Alert } from '@mui/material';
import Plot from 'react-plotly.js';
import { getDocuments, getAnalysisResult } from '../services/api';

const DataVisualizationPage = () => {
    const [documents, setDocuments] = useState([]);
    const [selectedDocumentId, setSelectedDocumentId] = useState('');
    const [analysisData, setAnalysisData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [tableData, setTableData] = useState([]);
    const [chartData, setChartData] = useState([]);
    const [xColumn, setXColumn] = useState('');
    const [yColumn, setYColumn] = useState('');
    const [availableColumns, setAvailableColumns] = useState([]); // 用于动态生成X/Y轴选项
    const [chartType, setChartType] = useState('line'); // 新增状态：图表类型，默认为折线图

    // columns 定义保留，但实际下拉列表将由 availableColumns 动态生成
    const staticColumnsDefinition = [
        { id: 'catalystName', label: '催化剂名称' },
        { id: 'activityValue', label: '活性数值' },
        { id: 'unit', label: '单位' },
        { id: 'testTemperature', label: '测试温度' },
        { id: 'testPressure', label: '测试压力' },
        // 可以根据需要添加更多可能的列定义，或者完全依赖动态生成的列
    ];

    useEffect(() => {
        const fetchDocuments = async () => {
            try {
                const response = await getDocuments();
                // 校验响应数据是否为数组，并且数组元素是否包含必要的字段 (id 和 filename/name)
                if (response && Array.isArray(response) && response.every(doc => doc && typeof doc.id !== 'undefined' && (typeof doc.filename !== 'undefined' || typeof doc.name !== 'undefined'))) {
                    // 如果存在 name 但不存在 filename，则将 name 赋值给 filename 以统一
                    const standardizedData = response.map(doc => {
                        if (typeof doc.filename === 'undefined' && typeof doc.name !== 'undefined') {
                            return { ...doc, filename: doc.name };
                        }
                        return doc;
                    });
                    setDocuments(standardizedData);
                } else {
                    console.error('Invalid data format received from getDocuments API:', response);
                    setError('获取文献列表失败：数据格式不正确。');
                    setDocuments([]); // 设置为空数组以避免渲染错误
                }
            } catch (err) {
                console.error('Error fetching documents:', err);
                setError('无法获取文献列表。');
            }
        };
        fetchDocuments();
    }, []);

    const handleDocumentChange = async (event) => {
        const docId = event.target.value;
        setSelectedDocumentId(docId);
        setAnalysisData(null);
        setTableData([]);
        setChartData([]);
        setXColumn('');
        setYColumn('');
        setError('');

        if (docId) {
            setLoading(true);
            try {
                const response = await getAnalysisResult(docId);
                // raw_ai_response 已经是字符串，不需要再次解析
                const rawAiResponse = response.raw_ai_response; 
                let parsedAiResponse = null;
                try {
                    parsedAiResponse = JSON.parse(rawAiResponse);
                } catch (parseError) {
                    console.error('Error parsing AI response JSON:', parseError);
                    setError('无法解析AI响应数据。');
                    setLoading(false);
                    return;
                }
                setAnalysisData(parsedAiResponse);
                if (parsedAiResponse) {
                    extractTableData(parsedAiResponse);
                } else {
                    // 如果 parsedAiResponse 为 null，则清空表格和图表数据，并可能显示错误
                    setTableData([]);
                    setChartData([]);
                    // setError('AI响应数据为空或解析失败。'); // 错误已在JSON解析中处理
                }
            } catch (err) {
                console.error('Error fetching analysis result:', err);
                setError('无法获取分析结果或解析AI响应。');
            } finally {
                setLoading(false);
            }
        }
    };

    const extractTableData = (aiResponse) => {
        let markdownTable = aiResponse?.activity_data_markdown;

        // 检查 activity_data_markdown 是否为对象，如果是，则尝试提取其中的 markdown 字符串
        if (typeof markdownTable === 'object' && markdownTable !== null) {
            // 尝试常见的键名，如 'table', 'markdown', 'content'
            if (typeof markdownTable.table === 'string') {
                markdownTable = markdownTable.table;
            } else if (typeof markdownTable.markdown === 'string') {
                markdownTable = markdownTable.markdown;
            } else if (typeof markdownTable.content === 'string') {
                markdownTable = markdownTable.content;
            } else {
                // 如果没有找到已知的键，记录错误并返回
                console.warn('activity_data_markdown is an object, but does not contain a known key for the markdown string (tried table, markdown, content):', markdownTable);
                setError('AI响应中的Markdown数据格式不正确 (对象内部未找到表格字符串)。');
                setTableData([]);
                setChartData([]);
                setAvailableColumns([]);
                return;
            }
        } else if (typeof markdownTable !== 'string') {
            // 如果不是对象也不是字符串，则格式无效
            console.warn('Missing or invalid markdown table in AI response (expected string or object with known key at aiResponse.activity_data_markdown):', aiResponse);
            setError('AI响应中未找到或Markdown数据格式无效。');
            setTableData([]);
            setChartData([]);
            setAvailableColumns([]);
            return;
        }

        // 至此，markdownTable 应该是字符串了
        if (!markdownTable) { // 再次检查以防万一
            console.warn('Markdown table string is empty after attempting to resolve from object:', aiResponse);
            setError('AI响应中Markdown表格数据为空。');
            setTableData([]);
            setChartData([]);
            setAvailableColumns([]);
            return;
        }
        if (markdownTable) {
            const lines = markdownTable.split('\n').filter(line => line.trim() !== '');
            if (lines.length < 2) {
                setError('AI响应中Markdown表格数据不足。');
                return;
            }
            // 确保至少有表头和分隔线
            if (lines.length >= 2) {
                const headerLine = lines[0];
                const dataLines = lines.slice(2); // Skip header and separator line

                // 移除split('|')产生的首尾空字符串（如果存在），并trim每个表头
                let headers = headerLine.split('|').map(h => h.trim());
                if (headers.length > 0 && headers[0] === '') {
                    headers = headers.slice(1);
                }
                if (headers.length > 0 && headers[headers.length - 1] === '') {
                    headers = headers.slice(0, -1);
                }
                console.log('Parsed headers:', headers); // 调试信息
                
                if (headers.length === 0 || headers.every(h => h === '')) {
                    setError('AI响应中Markdown表格的表头为空或无效。');
                    setAvailableColumns([]);
                    setTableData([]); // 清空表格数据
                    setChartData([]); // 清空图表数据
                    return;
                }
                // 更新可用列选项，用于图表X/Y轴选择
                const dynamicCols = headers.map(header => ({ id: header, label: header }));
                setAvailableColumns(dynamicCols);
                console.log('Updated availableColumns state:', dynamicCols); // 调试信息

                const extractedData = dataLines.map((line, lineIndex) => {
                    // 移除split('|')产生的首尾空字符串（如果存在），并trim每个值，保留空字符串作为空单元格
                    let values = line.split('|').map(v => v.trim());
                    if (values.length > 0 && values[0] === '') {
                        values = values.slice(1);
                    }
                    if (values.length > 0 && values[values.length - 1] === '') {
                        values = values.slice(0, -1);
                    }
                    console.log(`Line ${lineIndex + 1} parsed values:`, values); // 调试信息

                    // 如果整行都是空的（例如只有 | | ），则跳过
                    if (values.every(v => v === '')) {
                        console.warn('Skipping entirely empty data line:', line);
                        return null;
                    }
                    const row = {};
                    headers.forEach((header, index) => {
                        // 确保即使values中没有对应的值，也会为header创建属性并设为空字符串
                        const value = (values && index < values.length) ? values[index] : ''; 
                        // 尝试将可能是数值的列转换为数字，如果失败则保留为字符串
                        const numericHeaders = ['活性数值', '测试温度', '测试压力']; // 根据实际情况调整
                        if (numericHeaders.includes(header)) {
                            const numVal = parseFloat(value);
                            row[header] = isNaN(numVal) ? value : numVal; // 如果转换失败，保留原字符串
                        } else {
                            row[header] = value;
                        }
                    });
                    console.log(`Line ${lineIndex + 1} constructed row:`, row); // 调试信息
                    return row;
                }).filter(row => row !== null);
                console.log('Final extracted table data:', extractedData); // 调试信息
                setTableData(extractedData);
                setChartData(extractedData);
            } else {
                setError('AI响应中未找到有效的Markdown表格数据。');
            }
        } else {
            setError('AI响应中未找到催化剂性能数据或Markdown表格。');
        }
    };

    // 计算相关系数的辅助函数
    const calculateCorrelation = (x, y) => {
        const n = Math.min(x.length, y.length);
        if (n < 2) return 0;
        
        const xSlice = x.slice(0, n);
        const ySlice = y.slice(0, n);
        
        const meanX = xSlice.reduce((sum, val) => sum + val, 0) / n;
        const meanY = ySlice.reduce((sum, val) => sum + val, 0) / n;
        
        let numerator = 0;
        let sumXSquared = 0;
        let sumYSquared = 0;
        
        for (let i = 0; i < n; i++) {
            const deltaX = xSlice[i] - meanX;
            const deltaY = ySlice[i] - meanY;
            numerator += deltaX * deltaY;
            sumXSquared += deltaX * deltaX;
            sumYSquared += deltaY * deltaY;
        }
        
        const denominator = Math.sqrt(sumXSquared * sumYSquared);
        return denominator === 0 ? 0 : numerator / denominator;
    };

    const handleGenerateChart = () => {
        if (chartType === 'heatmap' || chartType === 'pairplot') {
            // 热力图和成对关系图不需要选择X/Y轴
            setError('');
            return;
        }
        if (!xColumn || !yColumn) {
            setError('请选择X轴和Y轴的数据列。');
            return;
        }
        setError('');
        // chartData is already set from tableData, no need to re-set here
    };

    return (
        <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
            <Typography variant="h4" component="h1" gutterBottom>
                数据可视化
            </Typography>

            <Box sx={{ mb: 3 }}>
                <FormControl fullWidth>
                    <InputLabel id="document-select-label">选择文献</InputLabel>
                    <Select
                        labelId="document-select-label"
                        id="document-select"
                        value={selectedDocumentId}
                        label="选择文献"
                        onChange={handleDocumentChange}
                    >
                        <MenuItem value="">请选择一份文献</MenuItem>
                        {documents.map((doc) => (
                            <MenuItem key={doc.id} value={doc.id}>
                                {doc.filename}
                            </MenuItem>
                        ))}
                    </Select>
                </FormControl>
            </Box>

            {loading && <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}><CircularProgress /></Box>}
            {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}

            {tableData.length > 0 && (
                <Box sx={{ mt: 4 }}>
                    <Typography variant="h5" gutterBottom>提取数据表格</Typography>
                    <TableContainer component={Paper}>
                        <Table sx={{ minWidth: 650 }} aria-label="simple table">
                            <TableHead>
                                <TableRow>
                                    {console.log('Rendering TableHead with availableColumns:', availableColumns)} {/* 调试信息 */}
                                    {availableColumns.map((column) => (
                                        <TableCell key={column.id}>{column.label}</TableCell>
                                    ))}
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {tableData.map((row, index) => (
                                    <TableRow key={index}>
                                        {/* 使用 availableColumns 来确保列的顺序和数量与表头一致 */}
                                        {availableColumns.map((column) => (
                                            <TableCell key={column.id}>{row[column.id] !== undefined ? row[column.id] : ''}</TableCell>
                                        ))}
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </Box>
            )}

            {chartData.length > 0 && (
                <Box sx={{ mt: 4 }}>
                    <Typography variant="h5" gutterBottom>数据图表</Typography>
                    <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
                        <FormControl sx={{ minWidth: 120 }}>
                            <InputLabel id="x-axis-select-label">X轴</InputLabel>
                            <Select
                                labelId="x-axis-select-label"
                                id="x-axis-select"
                                value={xColumn}
                                label="X轴"
                                onChange={(e) => setXColumn(e.target.value)}
                            >
                                <MenuItem value="">选择X轴</MenuItem>
                                {availableColumns.map((column) => (
                                    <MenuItem key={column.id} value={column.id}>
                                        {column.label}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                        <FormControl sx={{ minWidth: 120 }}>
                            <InputLabel id="y-axis-select-label">Y轴</InputLabel>
                            <Select
                                labelId="y-axis-select-label"
                                id="y-axis-select"
                                value={yColumn}
                                label="Y轴"
                                onChange={(e) => setYColumn(e.target.value)}
                            >
                                <MenuItem value="">选择Y轴</MenuItem>
                                {availableColumns.map((column) => (
                                    <MenuItem key={column.id} value={column.id}>
                                        {column.label}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                        <FormControl sx={{ minWidth: 120 }}>
                            <InputLabel id="chart-type-select-label">图表类型</InputLabel>
                            <Select
                                labelId="chart-type-select-label"
                                id="chart-type-select"
                                value={chartType}
                                label="图表类型"
                                onChange={(e) => setChartType(e.target.value)}
                            >
                                <MenuItem value="line">折线图</MenuItem>
                                <MenuItem value="scatter">散点图</MenuItem>
                                <MenuItem value="bar">柱状图</MenuItem>
                                <MenuItem value="heatmap">热力图</MenuItem>
                                <MenuItem value="pairplot">成对关系图</MenuItem>
                            </Select>
                        </FormControl>
                        <Button variant="contained" onClick={handleGenerateChart}>生成图表</Button>
                    </Box>

                    {((xColumn && yColumn) || chartType === 'heatmap' || chartType === 'pairplot') && (
                        <Paper sx={{ p: 2, display: 'flex', flexDirection: 'column', height: chartType === 'pairplot' ? 800 : 500 }}>
                            <Plot
                                data={(() => {
                                    // 根据图表类型生成不同的数据配置
                                    switch (chartType) {
                                        case 'line':
                                            return [{
                                                x: chartData.map(row => row[xColumn]),
                                                y: chartData.map(row => row[yColumn]),
                                                text: chartData.map(row => row['催化剂名称'] || ''),
                                                type: 'scatter',
                                                mode: 'lines+markers+text',
                                                marker: {
                                                    color: '#8884d8',
                                                    size: 8,
                                                    line: {
                                                        color: '#ffffff',
                                                        width: 1
                                                    }
                                                },
                                                line: {
                                                    color: '#8884d8',
                                                    width: 2
                                                },
                                                textposition: 'top center',
                                                textfont: {
                                                    size: 10,
                                                    color: '#333'
                                                },
                                                name: '数据点',
                                                hovertemplate: `<b>%{text}</b><br>` +
                                                              `${availableColumns.find(col => col.id === xColumn)?.label || xColumn}: %{x}<br>` +
                                                              `${availableColumns.find(col => col.id === yColumn)?.label || yColumn}: %{y}<br>` +
                                                              '<extra></extra>'
                                            }];
                                        case 'scatter':
                                            return [{
                                                x: chartData.map(row => row[xColumn]),
                                                y: chartData.map(row => row[yColumn]),
                                                text: chartData.map(row => row['催化剂名称'] || ''),
                                                type: 'scatter',
                                                mode: 'markers+text',
                                                marker: {
                                                    color: '#8884d8',
                                                    size: 8,
                                                    line: {
                                                        color: '#ffffff',
                                                        width: 1
                                                    }
                                                },
                                                textposition: 'top center',
                                                textfont: {
                                                    size: 10,
                                                    color: '#333'
                                                },
                                                name: '数据点',
                                                hovertemplate: `<b>%{text}</b><br>` +
                                                              `${availableColumns.find(col => col.id === xColumn)?.label || xColumn}: %{x}<br>` +
                                                              `${availableColumns.find(col => col.id === yColumn)?.label || yColumn}: %{y}<br>` +
                                                              '<extra></extra>'
                                            }];
                                        case 'bar':
                                            return [{
                                                x: chartData.map(row => row[xColumn]),
                                                y: chartData.map(row => row[yColumn]),
                                                text: chartData.map(row => row['催化剂名称'] || ''),
                                                type: 'bar',
                                                marker: {
                                                    color: '#8884d8',
                                                    line: {
                                                        color: '#ffffff',
                                                        width: 1
                                                    }
                                                },
                                                textposition: 'outside',
                                                textfont: {
                                                    size: 10,
                                                    color: '#333'
                                                },
                                                name: '数据',
                                                hovertemplate: `<b>%{text}</b><br>` +
                                                              `${availableColumns.find(col => col.id === xColumn)?.label || xColumn}: %{x}<br>` +
                                                              `${availableColumns.find(col => col.id === yColumn)?.label || yColumn}: %{y}<br>` +
                                                              '<extra></extra>'
                                            }];
                                        case 'heatmap':
                                            // 为热力图创建数据矩阵
                                            const numericColumns = availableColumns.filter(col => {
                                                return chartData.some(row => !isNaN(parseFloat(row[col.id])));
                                            });
                                            const correlationMatrix = [];
                                            const labels = numericColumns.map(col => col.label);
                                            
                                            numericColumns.forEach((colX, i) => {
                                                const row = [];
                                                numericColumns.forEach((colY, j) => {
                                                    const xValues = chartData.map(row => parseFloat(row[colX.id])).filter(val => !isNaN(val));
                                                    const yValues = chartData.map(row => parseFloat(row[colY.id])).filter(val => !isNaN(val));
                                                    
                                                    if (xValues.length > 1 && yValues.length > 1) {
                                                        // 计算相关系数
                                                        const correlation = calculateCorrelation(xValues, yValues);
                                                        row.push(correlation);
                                                    } else {
                                                        row.push(0);
                                                    }
                                                });
                                                correlationMatrix.push(row);
                                            });
                                            
                                            return [{
                                                z: correlationMatrix,
                                                x: labels,
                                                y: labels,
                                                type: 'heatmap',
                                                colorscale: 'RdBu',
                                                zmid: 0,
                                                showscale: true,
                                                hovertemplate: '%{y} vs %{x}<br>相关系数: %{z:.3f}<extra></extra>'
                                            }];
                                        case 'pairplot':
                                             // 成对关系图：显示所有数值列之间的散点图
                                             const numericCols = availableColumns.filter(col => {
                                                 return chartData.some(row => !isNaN(parseFloat(row[col.id])));
                                             }).slice(0, 3); // 限制最多3列以避免图表过于复杂
                                             
                                             const pairplotData = [];
                                             let traceIndex = 0;
                                             numericCols.forEach((colX, i) => {
                                                 numericCols.forEach((colY, j) => {
                                                     if (i !== j) {
                                                         const row = Math.floor(traceIndex / (numericCols.length - 1)) + 1;
                                                         const col = (traceIndex % (numericCols.length - 1)) + 1;
                                                         pairplotData.push({
                                                             x: chartData.map(row => parseFloat(row[colX.id])),
                                                             y: chartData.map(row => parseFloat(row[colY.id])),
                                                             text: chartData.map(row => row['催化剂名称'] || ''),
                                                             type: 'scatter',
                                                             mode: 'markers',
                                                             marker: {
                                                                 color: `hsl(${(traceIndex * 60) % 360}, 70%, 50%)`,
                                                                 size: 6,
                                                                 opacity: 0.7
                                                             },
                                                             name: `${colY.label} vs ${colX.label}`,
                                                             showlegend: false,
                                                             hovertemplate: `<b>%{text}</b><br>` +
                                                                           `${colX.label}: %{x}<br>` +
                                                                           `${colY.label}: %{y}<br>` +
                                                                           '<extra></extra>'
                                                         });
                                                         traceIndex++;
                                                     }
                                                 });
                                             });
                                             return pairplotData;
                                        default:
                                            return [{
                                                x: chartData.map(row => row[xColumn]),
                                                y: chartData.map(row => row[yColumn]),
                                                text: chartData.map(row => row['催化剂名称'] || ''),
                                                type: 'scatter',
                                                mode: 'markers+text',
                                                marker: {
                                                    color: '#8884d8',
                                                    size: 8
                                                },
                                                name: '数据点'
                                            }];
                                    }
                                })()}
                                layout={(() => {
                                    // 根据图表类型生成不同的布局配置
                                    const baseLayout = {
                                        plot_bgcolor: '#ffffff',
                                        paper_bgcolor: '#ffffff',
                                        margin: {
                                            l: 60,
                                            r: 30,
                                            t: 60,
                                            b: 60
                                        },
                                        hovermode: 'closest'
                                    };
                                    
                                    switch (chartType) {
                                        case 'heatmap':
                                            return {
                                                ...baseLayout,
                                                title: {
                                                    text: '数据相关性热力图',
                                                    font: { size: 16 }
                                                },
                                                xaxis: {
                                                    title: '变量',
                                                    side: 'bottom'
                                                },
                                                yaxis: {
                                                    title: '变量',
                                                    autorange: 'reversed'
                                                },
                                                showlegend: false
                                            };
                                        case 'pairplot':
                                             return {
                                                 ...baseLayout,
                                                 title: {
                                                     text: '成对关系图 - 数值变量间的关系',
                                                     font: { size: 16 }
                                                 },
                                                 showlegend: false,
                                                 xaxis: {
                                                     title: '综合数值变量',
                                                     showgrid: true,
                                                     gridcolor: '#e0e0e0'
                                                 },
                                                 yaxis: {
                                                     title: '综合数值变量',
                                                     showgrid: true,
                                                     gridcolor: '#e0e0e0'
                                                 }
                                             };
                                        default:
                                            return {
                                                ...baseLayout,
                                                title: {
                                                    text: chartType === 'bar' ? 
                                                        `${availableColumns.find(col => col.id === yColumn)?.label || yColumn} 柱状图` :
                                                        `${availableColumns.find(col => col.id === yColumn)?.label || yColumn} vs ${availableColumns.find(col => col.id === xColumn)?.label || xColumn}`,
                                                    font: { size: 16 }
                                                },
                                                xaxis: {
                                                    title: {
                                                        text: availableColumns.find(col => col.id === xColumn)?.label || xColumn,
                                                        font: { size: 14 }
                                                    },
                                                    showgrid: true,
                                                    gridcolor: '#e0e0e0',
                                                    zeroline: false
                                                },
                                                yaxis: {
                                                    title: {
                                                        text: availableColumns.find(col => col.id === yColumn)?.label || yColumn,
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
                                                }
                                            };
                                    }
                                })()}
                                config={{
                                    displayModeBar: true,
                                    displaylogo: false,
                                    modeBarButtonsToRemove: ['pan2d', 'lasso2d', 'select2d'],
                                    responsive: true
                                }}
                                style={{ width: '100%', height: '100%' }}
                            />
                        </Paper>
                    )}
                </Box>
            )}
        </Container>
    );
};

export default DataVisualizationPage;