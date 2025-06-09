/**
 * 本地存储服务
 * 管理本地数据的存储和清理
 */

// AI聊天记录的存储键名
const CHAT_MESSAGES_KEY = 'ai_chat_messages';

/**
 * 保存聊天记录到本地存储
 * @param {Array} messages 聊天消息数组
 */
export const saveChatMessages = (messages) => {
  try {
    localStorage.setItem(CHAT_MESSAGES_KEY, JSON.stringify(messages));
  } catch (error) {
    console.error('保存聊天记录失败:', error);
  }
};

/**
 * 从本地存储获取聊天记录
 * @returns {Array} 聊天消息数组
 */
export const getChatMessages = () => {
  try {
    const messages = localStorage.getItem(CHAT_MESSAGES_KEY);
    return messages ? JSON.parse(messages) : [];
  } catch (error) {
    console.error('获取聊天记录失败:', error);
    return [];
  }
};

/**
 * 清除本地存储的聊天记录
 */
export const clearChatMessages = () => {
  try {
    localStorage.removeItem(CHAT_MESSAGES_KEY);
  } catch (error) {
    console.error('清除聊天记录失败:', error);
  }
};