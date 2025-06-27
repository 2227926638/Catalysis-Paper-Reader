import React, { useState, useEffect, useRef } from 'react';
import { Container, Typography, Box, Select, MenuItem, FormControl, InputLabel, Button, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, CircularProgress, Alert, Chip, Checkbox, ListItemText, OutlinedInput, SelectChangeEvent } from '@mui/material';
import Plot from 'react-plotly.js';
import { getDocuments, getAnalysisResult } from '../services/api';

const DataVisualizationPage = () => {
    const [documents, setDocuments] = useState([]);
    const [selectedDocumentIds, setSelectedDocumentIds] = useState([]); // 改为数组支持多选
    const [analysisData, setAnalysisData] = useState({}); // 改为对象存储多个文献的数据
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [tableData, setTableData] = useState([]);
    const [chartData, setChartData] = useState([]);
    const [xColumn, setXColumn] = useState('');
    const [yColumn, setYColumn] = useState('');
    const [availableColumns, setAvailableColumns] = useState([]); // 用于动态生成X/Y轴选项
    const [chartType, setChartType] = useState('line'); // 新增状态：图表类型，默认为折线图
    const [isSelectAll, setIsSelectAll] = useState(false); // 全选状态

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

    // 处理多选文档变化
    const handleDocumentChange = async (event) => {
        const value = event.target.value;
        const rawSelectedIds = typeof value === 'string' ? value.split(',') : value;
        
        // 过滤掉undefined、null和空字符串等无效值
        const selectedIds = rawSelectedIds.filter(id => id !== undefined && id !== null && id !== '');
        
        setSelectedDocumentIds(selectedIds);
        setError('');
        
        // 如果没有选择任何文档，清空数据
        if (selectedIds.length === 0) {
            setAnalysisData({});
            setTableData([]);
            setChartData([]);
            setXColumn('');
            setYColumn('');
            setAvailableColumns([]);
            setIsSelectAll(false);
            return;
        }
        
        // 更新全选状态
        setIsSelectAll(selectedIds.length === documents.length);
        
        // 批量获取分析数据
        await fetchMultipleAnalysisData(selectedIds);
    };
    
    // 批量获取多个文献的分析数据
    const fetchMultipleAnalysisData = async (docIds) => {
        setLoading(true);
        const newAnalysisData = {};
        const errors = [];
        
        try {
            // 并行获取所有选中文献的数据
            const promises = docIds.map(async (docId) => {
                try {
                    const response = await getAnalysisResult(docId);
                    const rawAiResponse = response.raw_ai_response;
                    let parsedAiResponse = null;
                    
                    try {
                        parsedAiResponse = JSON.parse(rawAiResponse);
                    } catch (parseError) {
                        console.error(`Error parsing AI response JSON for doc ${docId}:`, parseError);
                        errors.push(`文献 ${documents.find(d => d.id === docId)?.filename || docId} 数据解析失败`);
                        return null;
                    }
                    
                    return { docId, data: parsedAiResponse };
                } catch (err) {
                    console.error(`Error fetching analysis result for doc ${docId}:`, err);
                    errors.push(`文献 ${documents.find(d => d.id === docId)?.filename || docId} 数据获取失败`);
                    return null;
                }
            });
            
            const results = await Promise.all(promises);
            
            // 处理成功获取的数据
            results.forEach(result => {
                if (result && result.data) {
                    newAnalysisData[result.docId] = result.data;
                }
            });
            
            setAnalysisData(newAnalysisData);
            
            // 显示错误信息（如果有）
            if (errors.length > 0) {
                setError(`部分文献数据获取失败：${errors.join('、')}`);
            }
            
            // 合并所有文献的表格数据
            if (Object.keys(newAnalysisData).length > 0) {
                extractCombinedTableData(newAnalysisData);
            } else {
                setTableData([]);
                setChartData([]);
                setAvailableColumns([]);
            }
            
        } catch (err) {
            console.error('Error in batch fetching:', err);
            setError('批量获取分析结果时发生错误。');
        } finally {
            setLoading(false);
        }
    };
    
    // 处理全选/取消全选
    const handleSelectAll = () => {
        if (isSelectAll) {
            // 取消全选
            setSelectedDocumentIds([]);
            setIsSelectAll(false);
            setAnalysisData({});
            setTableData([]);
            setChartData([]);
            setXColumn('');
            setYColumn('');
            setAvailableColumns([]);
            setError(''); // 清空错误状态
        } else {
            // 全选
            const allIds = documents.map(doc => doc.id);
            setSelectedDocumentIds(allIds);
            setIsSelectAll(true);
            fetchMultipleAnalysisData(allIds);
        }
    };

    // 合并多个文献的表格数据
    const extractCombinedTableData = (multipleAnalysisData) => {
        const allTableData = [];
        const allHeaders = new Set();
        
        // 遍历所有文献数据
        Object.entries(multipleAnalysisData).forEach(([docId, aiResponse]) => {
            const docInfo = documents.find(doc => doc.id === docId);
            const docName = docInfo?.filename || `文献${docId}`;
            
            const extractedData = extractSingleDocumentData(aiResponse, docName);
            if (extractedData && extractedData.length > 0) {
                allTableData.push(...extractedData);
                // 收集所有可能的列名
                extractedData.forEach(row => {
                    Object.keys(row).forEach(key => allHeaders.add(key));
                });
            }
        });
        
        // 更新可用列选项
        const dynamicCols = Array.from(allHeaders).map(header => ({ id: header, label: header }));
        setAvailableColumns(dynamicCols);
        
        // 确保所有行都有相同的列结构
        const normalizedData = allTableData.map(row => {
            const normalizedRow = {};
            allHeaders.forEach(header => {
                normalizedRow[header] = row[header] || '';
            });
            return normalizedRow;
        });
        
        setTableData(normalizedData);
        setChartData(normalizedData);
        
        console.log('Combined table data:', normalizedData);
        console.log('Available columns:', dynamicCols);
    };
    
    // 提取单个文献的数据（重构原extractTableData函数）
    const extractSingleDocumentData = (aiResponse, docName) => {
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
                return [];
            }
        } else if (typeof markdownTable !== 'string') {
            // 如果不是对象也不是字符串，则格式无效
            console.warn('Missing or invalid markdown table in AI response (expected string or object with known key at aiResponse.activity_data_markdown):', aiResponse);
            return [];
        }

        // 至此，markdownTable 应该是字符串了
        if (!markdownTable) { // 再次检查以防万一
            console.warn('Markdown table string is empty after attempting to resolve from object:', aiResponse);
            return [];
        }
        if (markdownTable) {
            const lines = markdownTable.split('\n').filter(line => line.trim() !== '');
            if (lines.length < 2) {
                console.warn('AI响应中Markdown表格数据不足。');
                return [];
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
                console.log('Parsed headers for', docName, ':', headers); // 调试信息
                
                if (headers.length === 0 || headers.every(h => h === '')) {
                    console.warn('AI响应中Markdown表格的表头为空或无效。');
                    return [];
                }
                
                // 添加文献来源列
                if (!headers.includes('文献来源')) {
                    headers.push('文献来源');
                }

                const extractedData = dataLines.map((line, lineIndex) => {
                    // 移除split('|')产生的首尾空字符串（如果存在），并trim每个值，保留空字符串作为空单元格
                    let values = line.split('|').map(v => v.trim());
                    if (values.length > 0 && values[0] === '') {
                        values = values.slice(1);
                    }
                    if (values.length > 0 && values[values.length - 1] === '') {
                        values = values.slice(0, -1);
                    }
                    console.log(`${docName} Line ${lineIndex + 1} parsed values:`, values); // 调试信息

                    // 如果整行都是空的（例如只有 | | ），则跳过
                    if (values.every(v => v === '')) {
                        console.warn('Skipping entirely empty data line:', line);
                        return null;
                    }
                    const row = {};
                    headers.forEach((header, index) => {
                        if (header === '文献来源') {
                            // 为文献来源列设置值
                            row[header] = docName;
                        } else {
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
                        }
                    });
                    console.log(`${docName} Line ${lineIndex + 1} constructed row:`, row); // 调试信息
                    return row;
                }).filter(row => row !== null);
                console.log(`Final extracted table data for ${docName}:`, extractedData); // 调试信息
                return extractedData;
            } else {
                console.warn('AI响应中未找到有效的Markdown表格数据。');
                return [];
            }
        } else {
            console.warn('AI响应中未找到催化剂性能数据或Markdown表格。');
            return [];
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
                    <InputLabel id="document-select-label">选择文献（支持多选）</InputLabel>
                    <Select
                        labelId="document-select-label"
                        id="document-select"
                        multiple
                        value={selectedDocumentIds}
                        onChange={handleDocumentChange}
                        input={<OutlinedInput label="选择文献（支持多选）" />}
                        renderValue={(selected) => (
                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                                {selected.map((value) => {
                                    const doc = documents.find(d => d.id === value);
                                    return (
                                        <Chip 
                                            key={value} 
                                            label={doc?.filename || `文献${value}`} 
                                            size="small"
                                            sx={{ maxWidth: 200 }}
                                        />
                                    );
                                })}
                            </Box>
                        )}
                        MenuProps={{
                            PaperProps: {
                                style: {
                                    maxHeight: 400,
                                    width: 300,
                                },
                            },
                        }}
                    >
                        {/* 全选选项 */}
                        <MenuItem 
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleSelectAll();
                            }}
                            sx={{ '&:hover': { backgroundColor: 'action.hover' } }}
                        >
                            <Checkbox
                                checked={isSelectAll}
                                indeterminate={selectedDocumentIds.length > 0 && selectedDocumentIds.length < documents.length}
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    handleSelectAll();
                                }}
                            />
                            <ListItemText 
                                primary={isSelectAll ? "取消全选" : "全选"} 
                                secondary={`共 ${documents.length} 篇文献`}
                            />
                        </MenuItem>
                        {/* 分隔线 */}
                        <MenuItem disabled sx={{ borderTop: 1, borderColor: 'divider', mt: 1, pt: 1 }}>
                            <Typography variant="caption" color="text.secondary">
                                选择具体文献：
                            </Typography>
                        </MenuItem>
                        {/* 文献列表 */}
                        {documents.map((doc) => (
                            <MenuItem key={doc.id} value={doc.id}>
                                <Checkbox checked={selectedDocumentIds.indexOf(doc.id) > -1} />
                                <ListItemText 
                                    primary={doc.filename}
                                    primaryTypographyProps={{
                                        style: {
                                            whiteSpace: 'nowrap',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            maxWidth: 200
                                        }
                                    }}
                                />
                            </MenuItem>
                        ))}
                    </Select>
                </FormControl>
                
                {/* 选中文献数量提示 */}
                {selectedDocumentIds.length > 0 && (
                    <Box sx={{ mt: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="body2" color="text.secondary">
                            已选择 {selectedDocumentIds.length} 篇文献
                        </Typography>
                        {selectedDocumentIds.length > 5 && (
                            <Typography variant="caption" color="warning.main">
                                （数据较多，图表加载可能较慢）
                            </Typography>
                        )}
                    </Box>
                )}
            </Box>

            {loading && <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}><CircularProgress /></Box>}
            {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}

            {tableData.length > 0 && (
                <Box sx={{ mt: 4 }}>
                    <Typography variant="h5" gutterBottom>
                        提取数据表格 {selectedDocumentIds.length > 1 && `（合并 ${selectedDocumentIds.length} 篇文献数据）`}
                    </Typography>
                    <TableContainer component={Paper} sx={{ maxHeight: 400 }}>
                        <Table sx={{ minWidth: 650 }} stickyHeader aria-label="simple table">
                            <TableHead>
                                <TableRow>
                                    {availableColumns.map((column) => (
                                        <TableCell 
                                            key={column.id}
                                            sx={{
                                                backgroundColor: column.id === '文献来源' ? 'primary.light' : 'inherit',
                                                color: column.id === '文献来源' ? 'primary.contrastText' : 'inherit',
                                                fontWeight: column.id === '文献来源' ? 'bold' : 'normal'
                                            }}
                                        >
                                            {column.label}
                                        </TableCell>
                                    ))}
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {tableData.map((row, index) => (
                                    <TableRow key={index} hover>
                                        {/* 使用 availableColumns 来确保列的顺序和数量与表头一致 */}
                                        {availableColumns.map((column) => (
                                            <TableCell 
                                                key={column.id}
                                                sx={{
                                                    backgroundColor: column.id === '文献来源' ? 'grey.50' : 'inherit',
                                                    fontWeight: column.id === '文献来源' ? 'medium' : 'normal'
                                                }}
                                            >
                                                {column.id === '文献来源' ? (
                                                    <Typography variant="body2" color="primary">
                                                        {row[column.id] !== undefined && (typeof row[column.id] === 'string' || typeof row[column.id] === 'number') ? row[column.id] : ''}
                                                    </Typography>
                                                ) : (
                                                    typeof row[column.id] === 'number' ? 
                                                        (row[column.id] !== undefined ? row[column.id].toFixed(3) : '') : 
                                                        (row[column.id] !== undefined && (typeof row[column.id] === 'string' || typeof row[column.id] === 'number') ? row[column.id] : '')
                                                )}
                                            </TableCell>
                                        ))}
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                    
                    {/* 数据统计信息 */}
                    <Box sx={{ mt: 2, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                        <Typography variant="body2" color="text.secondary">
                            总计 {tableData.length} 条数据记录
                        </Typography>
                        {selectedDocumentIds.length > 1 && (
                            <Typography variant="body2" color="primary">
                                来自 {selectedDocumentIds.length} 篇文献
                            </Typography>
                        )}
                    </Box>
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
                                        case 'scatter':
                                        case 'bar':
                                            // 如果是多文献数据，按文献来源分组
                                            if (selectedDocumentIds.length > 1 && chartData.some(row => row['文献来源'])) {
                                                const groupedData = {};
                                                const colors = [
                                                    '#8884d8', '#82ca9d', '#ffc658', '#ff7c7c',
                                                    '#8dd1e1', '#d084d0', '#ffb347', '#87d068'
                                                ];
                                                
                                                // 按文献来源分组数据
                                                chartData.forEach(row => {
                                                    const source = row['文献来源'] || '未知来源';
                                                    if (!groupedData[source]) {
                                                        groupedData[source] = [];
                                                    }
                                                    if (row[xColumn] !== undefined && row[yColumn] !== undefined &&
                                                        !isNaN(parseFloat(row[xColumn])) && !isNaN(parseFloat(row[yColumn]))) {
                                                        groupedData[source].push(row);
                                                    }
                                                });
                                                
                                                // 为每个文献创建一个数据系列
                                                return Object.keys(groupedData).map((source, index) => {
                                                    const data = groupedData[source];
                                                    if (data.length === 0) return null;
                                                    
                                                    const baseConfig = {
                                                        x: data.map(row => row[xColumn]),
                                                        y: data.map(row => row[yColumn]),
                                                        text: data.map(row => row['催化剂名称'] || ''),
                                                        name: source,
                                                        hovertemplate: `<b>%{text}</b><br>` +
                                                                       `文献: ${source}<br>` +
                                                                       `${availableColumns.find(col => col.id === xColumn)?.label || xColumn}: %{x}<br>` +
                                                                       `${availableColumns.find(col => col.id === yColumn)?.label || yColumn}: %{y}<br>` +
                                                                       '<extra></extra>'
                                                    };
                                                    
                                                    if (chartType === 'line') {
                                                        return {
                                                            ...baseConfig,
                                                            type: 'scatter',
                                                            mode: 'lines+markers+text',
                                                            marker: {
                                                                color: colors[index % colors.length],
                                                                size: 8,
                                                                line: { color: '#ffffff', width: 1 }
                                                            },
                                                            line: {
                                                                color: colors[index % colors.length],
                                                                width: 2
                                                            },
                                                            textposition: 'top center',
                                                            textfont: { size: 10, color: '#333' }
                                                        };
                                                    } else if (chartType === 'scatter') {
                                                        return {
                                                            ...baseConfig,
                                                            type: 'scatter',
                                                            mode: 'markers+text',
                                                            marker: {
                                                                color: colors[index % colors.length],
                                                                size: 8,
                                                                line: { color: '#ffffff', width: 1 }
                                                            },
                                                            textposition: 'top center',
                                                            textfont: { size: 10, color: '#333' }
                                                        };
                                                    } else { // bar
                                                        return {
                                                            ...baseConfig,
                                                            type: 'bar',
                                                            marker: {
                                                                color: colors[index % colors.length],
                                                                line: { color: '#ffffff', width: 1 }
                                                            },
                                                            textposition: 'outside',
                                                            textfont: { size: 10, color: '#333' }
                                                        };
                                                    }
                                                }).filter(series => series !== null);
                                            } else {
                                                // 单文献数据处理逻辑
                                                const baseConfig = {
                                                    x: chartData.map(row => row[xColumn]),
                                                    y: chartData.map(row => row[yColumn]),
                                                    text: chartData.map(row => row['催化剂名称'] || ''),
                                                    name: selectedDocumentIds.length === 1 ? 
                                                        documents.find(doc => doc.id === selectedDocumentIds[0])?.filename || '数据点' :
                                                        '数据点',
                                                    hovertemplate: `<b>%{text}</b><br>` +
                                                                  `${availableColumns.find(col => col.id === xColumn)?.label || xColumn}: %{x}<br>` +
                                                                  `${availableColumns.find(col => col.id === yColumn)?.label || yColumn}: %{y}<br>` +
                                                                  '<extra></extra>'
                                                };
                                                
                                                if (chartType === 'line') {
                                                    return [{
                                                        ...baseConfig,
                                                        type: 'scatter',
                                                        mode: 'lines+markers+text',
                                                        marker: {
                                                            color: '#8884d8',
                                                            size: 8,
                                                            line: { color: '#ffffff', width: 1 }
                                                        },
                                                        line: { color: '#8884d8', width: 2 },
                                                        textposition: 'top center',
                                                        textfont: { size: 10, color: '#333' }
                                                    }];
                                                } else if (chartType === 'scatter') {
                                                    return [{
                                                        ...baseConfig,
                                                        type: 'scatter',
                                                        mode: 'markers+text',
                                                        marker: {
                                                            color: '#8884d8',
                                                            size: 8,
                                                            line: { color: '#ffffff', width: 1 }
                                                        },
                                                        textposition: 'top center',
                                                        textfont: { size: 10, color: '#333' }
                                                    }];
                                                } else { // bar
                                                    return [{
                                                        ...baseConfig,
                                                        type: 'bar',
                                                        marker: {
                                                            color: '#8884d8',
                                                            line: { color: '#ffffff', width: 1 }
                                                        },
                                                        textposition: 'outside',
                                                        textfont: { size: 10, color: '#333' }
                                                    }];
                                                }
                                            }
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
                                            // 动态生成图表标题
                                            const chartTitle = (() => {
                                                const yLabel = availableColumns.find(col => col.id === yColumn)?.label || yColumn;
                                                const xLabel = availableColumns.find(col => col.id === xColumn)?.label || xColumn;
                                                
                                                if (chartType === 'bar') {
                                                    return selectedDocumentIds.length > 1 ? 
                                                        `${yLabel} 柱状图 (${selectedDocumentIds.length}篇文献对比)` :
                                                        `${yLabel} 柱状图`;
                                                } else {
                                                    return selectedDocumentIds.length > 1 ? 
                                                        `${yLabel} vs ${xLabel} (${selectedDocumentIds.length}篇文献对比)` :
                                                        `${yLabel} vs ${xLabel}`;
                                                }
                                            })();
                                            
                                            return {
                                                ...baseLayout,
                                                title: {
                                                    text: chartTitle,
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
                                                showlegend: selectedDocumentIds.length > 1,
                                                legend: selectedDocumentIds.length > 1 ? {
                                                    orientation: 'v',
                                                    x: 1.02,
                                                    y: 1,
                                                    bgcolor: 'rgba(255,255,255,0.9)',
                                                    bordercolor: '#cccccc',
                                                    borderwidth: 1,
                                                    font: { size: 12 }
                                                } : undefined,
                                                margin: selectedDocumentIds.length > 1 ? 
                                                    { l: 60, r: 120, t: 80, b: 60 } : 
                                                    { l: 60, r: 30, t: 60, b: 60 }
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