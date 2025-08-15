import React from 'react';
import { Routes, Route, Link } from 'react-router-dom';
import { Layout, Menu, Typography } from 'antd';
import { UploadOutlined, FileTextOutlined, BarChartOutlined } from '@ant-design/icons';
import './App.css';

// 导入页面组件
import UploadPage from './pages/UploadPage';
import AnalysisPage from './pages/AnalysisPage';
import DataVisualizationPage from './pages/DataVisualizationPage';

// 导入Context Provider
import { AppProvider } from './context/AppContext';
// Import ErrorBoundary component
import ErrorBoundary from './components/ErrorBoundary';

const { Header, Content, Footer, Sider } = Layout;
const { Title } = Typography;

/**
 * 应用主组件
 * 负责整体布局和路由管理
 */
function App() {
  return (
    <AppProvider>
      <Layout style={{ minHeight: '100vh' }}>
        {/* 侧边栏导航 */}
        <Sider width={250} theme="light" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>
          <div style={{ height: '64px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Title level={3} style={{ margin: 0, color: '#1890ff' }}>文献分析工具</Title>
          </div>
          <Menu
            mode="inline"
            defaultSelectedKeys={['1']}
            style={{ borderRight: 0 }}
            items={[
              {
                key: '1',
                icon: <UploadOutlined />,
                label: <Link to="/">文献上传</Link>,
              },
              {
                key: '2',
                icon: <FileTextOutlined />,
                label: <Link to="/analysis">文献分析</Link>,
              },
              {
                key: '3',
                icon: <BarChartOutlined />,
                label: <Link to="/visualization">数据可视化</Link>,
              },
            ]}
          />
        </Sider>
        
        {/* 主内容区域 */}
        <Layout>
          <Content style={{ margin: '24px 16px', padding: 24, minHeight: 280 }}>
            <Routes>
              <Route path="/" element={<UploadPage />} />
              <Route path="/analysis" element={<AnalysisPage />} />
              {/* Wrap VisualizationPage with ErrorBoundary */}
              <Route path="/visualization" element={<ErrorBoundary><DataVisualizationPage /></ErrorBoundary>} />
            </Routes>
          </Content>
          <Footer style={{ textAlign: 'center' }}>
            文献分析工具 ©{new Date().getFullYear()} 由React + FastAPI提供技术支持
          </Footer>
        </Layout>
      </Layout>
    </AppProvider>
  );
}

export default App;