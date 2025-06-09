import React, { useState, useRef, useEffect } from 'react';
import { Input, Button, List, Avatar, Card, Typography, Spin, Modal } from 'antd';
import { SendOutlined, RobotOutlined, UserOutlined, LoadingOutlined } from '@ant-design/icons';

import { handleApiError } from '../utils/errorHandler';
import { saveChatMessages, getChatMessages, clearChatMessages } from '../services/storageService';
import { chatWithAI } from '../services/api';

const { Text } = Typography;

const AIChat = ({ visible, onClose }) => {
  const [messages, setMessages] = useState(getChatMessages());
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);

  // 自动滚动到最新消息
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
    saveChatMessages(messages);
  }, [messages]);

  useEffect(() => {
    if (!visible) return;
    scrollToBottom();
  }, [visible]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      clearChatMessages();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  // 发送消息
  const handleSend = async () => {
    if (!inputValue.trim()) return;

    const userMessage = {
      type: 'user',
      content: inputValue.trim(),
      timestamp: new Date().toISOString(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setLoading(true);

    try {
      // 调用AI对话接口
      const response = await chatWithAI(userMessage.content);
      
      const aiMessage = {
        type: 'ai',
        content: response.message,
        timestamp: new Date().toISOString(),
      };

      setMessages(prev => [...prev, aiMessage]);
    } catch (error) {
      handleApiError(error, 'AI回复失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={visible}
      onCancel={onClose}
      footer={null}
      width={600}
      styles={{ body: { padding: 0, height: '70vh' } }}
    >
      <Card
      title={
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <RobotOutlined style={{ marginRight: 8 }} />
          <span>AI助手</span>
        </div>
      }
      style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
      bodyStyle={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '12px' }}
    >
      <div style={{ flex: 1, overflowY: 'auto', marginBottom: '12px' }}>
        <List
          itemLayout="horizontal"
          dataSource={messages}
          renderItem={message => (
            <List.Item style={{
              padding: '8px 0',
              justifyContent: message.type === 'user' ? 'flex-end' : 'flex-start'
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'flex-start',
                flexDirection: message.type === 'user' ? 'row-reverse' : 'row',
                maxWidth: '80%'
              }}>
                <Avatar
                  icon={message.type === 'user' ? <UserOutlined /> : <RobotOutlined />}
                  style={{
                    backgroundColor: message.type === 'user' ? '#1890ff' : '#52c41a',
                    margin: message.type === 'user' ? '0 0 0 8px' : '0 8px 0 0',
                    borderRadius: '50%',
                    width: '36px',
                    height: '36px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}
                />
                <div style={{
                  backgroundColor: message.type === 'user' ? '#e6f7ff' : '#f6ffed',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  wordBreak: 'break-word'
                }}>
                  <Text>{message.content}</Text>
                </div>
              </div>
            </List.Item>
          )}
        />
        <div ref={messagesEndRef} />
      </div>
      <div style={{ display: 'flex', gap: '8px' }}>
        <Input
          placeholder="输入您的问题..."
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          onPressEnter={handleSend}
          disabled={loading}
        />
        <Button
          type="primary"
          icon={loading ? <LoadingOutlined /> : <SendOutlined />}
          onClick={handleSend}
          disabled={loading || !inputValue.trim()}
        />
      </div>
    </Card>
    </Modal>
  );
};

export default AIChat;