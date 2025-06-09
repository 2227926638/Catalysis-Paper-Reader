/**
 * WebSocket服务
 * 用于与后端建立WebSocket连接，接收实时分析进度更新
 */

// 获取API基础URL
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';
// 正确替换协议部分，确保只替换URL开头的协议
// WebSocket连接应该使用根路径，而不是包含/api的路径
// 解析API_URL以确保我们只使用主机名和端口部分
let baseUrl;
try {
  // 尝试使用URL API解析URL
  const apiUrl = new URL(API_URL);
  baseUrl = `${apiUrl.protocol}//${apiUrl.host}`;
} catch (e) {
  // 如果URL解析失败，使用正则表达式提取主机部分
  baseUrl = API_URL.replace(/(\/api.*$|\/+$)/, '');
}

// 将HTTP协议替换为WS协议
const WS_URL = baseUrl.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:');

class WebSocketService {
  constructor() {
    this.socket = null;
    this.isConnected = false;
    this.documentId = null;
    this.onProgressUpdate = null;
    this.onError = null;
    this.apiBaseUrl = API_URL;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectTimeout = null;
    this.heartbeatInterval = null;
    this.heartbeatTimeout = null;
    this.lastHeartbeatResponse = null;
    this.heartbeatIntervalTime = 60000; // 60秒发送一次心跳
    this.heartbeatTimeoutTime = 180000; // 180秒内没有响应则认为连接断开
    this.isManuallyDisconnected = false; // 新增标志，用于控制自动重连
  }

  /**
   * 连接到文档分析进度WebSocket
   * @param {number} documentId - 文档ID
   * @param {Function} onProgressUpdate - 进度更新回调函数
   * @param {Function} onError - 错误处理回调函数
   */
  connect(documentId, onProgressUpdate, onError) {
    // 验证文档ID的有效性
    if (!documentId || (typeof documentId !== 'number' && typeof documentId !== 'string') || 
        (typeof documentId === 'string' && documentId.trim() === '') ||
        (typeof documentId === 'number' && (isNaN(documentId) || !isFinite(documentId)))) {
      console.error('无效的文档ID:', documentId);
      if (onError) {
        onError('无效的文档ID，无法建立WebSocket连接');
      }
      return;
    }
    
    // 无论何种情况，如果存在旧的socket，先断开它
    // 传入true表示这是connect内部的逻辑断开，区别于用户或外部组件主动调用disconnect
    if (this.socket) {
      console.log(`WebSocketService: connect() called with existing socket for docId ${this.documentId}. Disconnecting it first (internal call).`);
      this.disconnect(true); 
    }

    this.documentId = documentId;
    this.onProgressUpdate = onProgressUpdate;
    this.onError = onError;
    this.isManuallyDisconnected = false; // 确保每次尝试连接时，重置手动断开标志

    try {
      // 创建WebSocket连接
      // 确保使用正确的WebSocket URL，不包含任何可能的API路径
      // 修正：使用完整的URL路径
      const wsUrl = `${WS_URL}/ws/analysis/${documentId}`;
      console.log(`尝试连接WebSocket: ${wsUrl}`);
      this.socket = new WebSocket(wsUrl);
      
      // 记录实际连接的URL，用于调试
      console.log(`完整请求头:`, this.socket?.url);

      // 连接打开时的处理
      this.socket.onopen = () => {
        console.log(`WebSocket连接已建立: 文档ID ${documentId}`);
        this.isConnected = true;
        
        // 启动心跳机制
        this.startHeartbeat();
      };

      // 接收消息的处理
      this.socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          // 处理进度更新
          // 添加节流机制，限制 onProgressUpdate 的调用频率
          if (this.onProgressUpdate) {
            // 简单的节流实现：每100毫秒最多调用一次 onProgressUpdate
            if (!this._throttleTimeout) {
              this._throttleTimeout = setTimeout(() => {
                this.onProgressUpdate(data);
                this._throttleTimeout = null;
              }, 100);
            }
          }
        } catch (error) {
          console.error('解析WebSocket消息时出错:', error);
          if (this.onError) {
            this.onError('接收进度更新时出错');
          }
        }
      };

      // 连接关闭时的处理
      this.socket.onclose = (event) => {
        console.log(`WebSocket连接已关闭: 文档ID ${documentId}, 关闭代码: ${event.code}, 原因: ${event.reason || '无'}`);
        this.isConnected = false;
        this.socket = null;
        // 仅在非手动断开时调用外部onError
        if (!this.isManuallyDisconnected && this.onError) {
          this.onError('WebSocket连接已断开，请刷新页面重试');
        }
        // this.isConnected = false; // 已在上面设置

        // 清理现有定时器
        if (this.reconnectTimeout) {
          clearTimeout(this.reconnectTimeout);
          this.reconnectTimeout = null;
        }

        // 针对特定错误码的特殊处理
        if (event.code === 1005 || event.code === 4001) {
          console.error(`连接异常终止(${event.code})，可能原因：文档不存在或会话过期`);
          if (this.onError) {
            this.onError(`连接异常终止(错误代码:${event.code})，原因：${event.reason || '文档不存在或会话过期'}，请重新启动分析任务`);
          }
          // 重置重连尝试次数，防止继续尝试重连一个不存在的文档
          this.reconnectAttempts = this.maxReconnectAttempts;
          return;
        }

        // 智能重连策略，仅在非手动断开时执行
        if (!this.isManuallyDisconnected) {
          const baseDelay = Math.min(3000 * Math.pow(2, this.reconnectAttempts), 30000);
          const jitter = Math.random() * 1000;
          
          if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectTimeout = setTimeout(() => {
              console.log(`智能重连尝试 (${++this.reconnectAttempts}/${this.maxReconnectAttempts}) for documentId ${this.documentId}`);
              // 使用保存的this.documentId, this.onProgressUpdate, this.onError进行重连
              // 确保回调函数仍然有效
              if (this.documentId && typeof this.onProgressUpdate === 'function' && typeof this.onError === 'function') {
                 this.connect(this.documentId, this.onProgressUpdate, this.onError);
              } else {
                console.error('WebSocketService: Cannot auto-reconnect due to missing documentId or invalid callbacks.');
              }
            }, baseDelay + jitter);
          } else {
            console.error(`已达到最大重试次数(${this.maxReconnectAttempts}) for documentId ${this.documentId}`);
            if (this.onError) {
              this.onError('连接持续异常，请检查网络后刷新页面');
            }
          }
        } else {
          console.log('WebSocketService: Manual disconnect detected in onclose, skipping auto-reconnect.');
          this.isManuallyDisconnected = false; // 重置标志，以便下次非手动断开时可以重连
        }
      };

      // 连接错误时的处理
      this.socket.onerror = (event) => { // 将参数名从 error 改为 event
        console.error('WebSocket连接错误事件:', event); // 修改日志信息
        // 尝试打印更多错误详情
        if (event && event.message) {
            console.error('WebSocket错误消息:', event.message);
        }
        if (event && event.error) {
            console.error('WebSocket错误对象:', event.error);
        }

        // 提供更详细的错误信息，使用与连接相同的URL
        const wsUrl = `${WS_URL}/ws/analysis/${documentId}`;
        const errorMessage = `WebSocket连接错误: 无法连接到 ${wsUrl}，可能原因：
1. 后端服务未启动或不可访问
2. 网络连接问题
3. 文档ID(${documentId})可能无效
请检查后端服务状态并刷新页面重试`;
        console.error(errorMessage);
        if (this.onError) {
          this.onError(errorMessage);
        }

        // 尝试重新连接
        this.reconnect();
      };
    } catch (error) {
      console.error('创建WebSocket连接时出错:', error);
      if (this.onError) {
        this.onError('创建WebSocket连接时出错');
      }
    }
  }

  /**
   * 启动心跳机制
   */
  startHeartbeat() {
    // 清理现有的心跳定时器
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    if (this.heartbeatTimeout) {
      clearTimeout(this.heartbeatTimeout);
    }
    
    // 设置心跳间隔
    this.heartbeatInterval = setInterval(() => {
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        console.log('发送心跳信号...');
        this.socket.send(JSON.stringify({ type: 'heartbeat', timestamp: new Date().getTime() }));
        
        // 设置心跳超时检测
        this.heartbeatTimeout = setTimeout(() => {
          console.error('心跳超时，连接可能已断开');
          // 尝试重新连接
          this.reconnect();
        }, this.heartbeatTimeoutTime);
      }
    }, this.heartbeatIntervalTime);
  }
  
  /**
   * 重新连接
   */
  reconnect() {
    if (!this.documentId || !this.onProgressUpdate) return;
    
    // 先断开当前连接
    this.disconnect(true);
    
    // 尝试重新连接
    console.log('尝试重新连接...');
    this.connect(this.documentId, this.onProgressUpdate, this.onError);
  }
  
  /**
   * 断开WebSocket连接
   * @param {boolean} isReconnecting - 是否是为了重新连接而断开
   */
  disconnect(internalCall = false) { // Renamed parameter for clarity, default false means external/manual call
    console.log(`WebSocketService: disconnect() called. internalCall: ${internalCall}, currentDocId: ${this.documentId}`);
    if (!internalCall) { // 如果是外部（手动）调用disconnect
      this.isManuallyDisconnected = true;
    }
    // 清理所有定时器
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
      console.log('已清理重连定时器');
    }
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
      console.log('已清理心跳间隔定时器');
    }
    if (this.heartbeatTimeout) {
      clearTimeout(this.heartbeatTimeout);
      this.heartbeatTimeout = null;
      console.log('已清理心跳超时定时器');
    }

    // 保存当前状态，用于日志记录
    const currentDocumentId = this.documentId;
    const currentReadyState = this.socket?.readyState;

    if (this.socket) {
      try {
        // 在关闭前检查连接状态
        if (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING) {
          console.log(`正在关闭WebSocket连接，当前状态: ${this.socket.readyState}`);
          this.socket.close(1000, internalCall ? '内部逻辑断开' : '客户端主动断开连接');
        } else {
          console.log(`WebSocket已经处于关闭状态，当前状态: ${this.socket.readyState}`);
        }
      } catch (error) {
        console.error('关闭WebSocket连接时出错:', error);
      } finally {
        this.socket = null;
      }
    }

    // 重置所有状态
    this.isConnected = false;
    // 对于 documentId, onProgressUpdate, onError，仅在非内部调用（即手动断开）时重置
    // 因为内部调用（如 connect 或 reconnect 内部的 disconnect）后通常会立即用相同的回调重新连接
    if (!internalCall) {
        this.documentId = null;
        this.onProgressUpdate = null; // 清除回调，避免旧回调被意外触发
        this.onError = null;        // 清除回调
    }
    this.lastHeartbeatResponse = null;
    this.reconnectAttempts = 0;
    console.log(`WebSocket连接已完全断开，状态已重置。之前的文档ID: ${currentDocumentId}, 连接状态: ${currentReadyState}, internalCall: ${internalCall}`);
  }

  /**
   * 获取连接状态
   * @returns {boolean} 连接状态
   */
  getConnectionStatus() {
    return this.isConnected;
  }

  /**
   * 重新启动文档分析
   * 通过HTTP POST请求触发后端分析
   * @param {number} documentId - 文档ID
   */
  async restartAnalysis(documentId) {
    console.log(`尝试通过HTTP POST重新启动文档 ${documentId} 的分析`);

    // 使用fetch API发送POST请求到后端的分析接口
    // 修正：调用新的重新分析接口
    const url = `${this.apiBaseUrl}/api/documents/${documentId}/reanalyze`;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
          // 如果需要认证，可以在这里添加Authorization头
        }
      });

      if (!response.ok) {
        // 处理非2xx响应
        const errorData = await response.json();
        console.error(`重新启动分析失败: ${response.status} ${response.statusText}`, errorData);
        if (this.onError) {
          this.onError(`重新启动分析失败: ${errorData.detail || response.statusText}`);
        }
        return;
      }

      // 处理成功响应
      const successData = await response.json();
      console.log(`重新启动分析请求成功:`, successData);
      // 成功触发分析后，WebSocket连接（如果已断开）应该会自动尝试重连并接收进度更新
      // 如果连接已存在，它会继续接收更新

    } catch (error) {
      console.error('发送重新启动分析请求时出错:', error);
      if (this.onError) {
        this.onError(`发送重新启动分析请求时出错: ${error.message}`);
      }
    }
  }
}

// 创建单例实例
const websocketService = new WebSocketService();

export default websocketService;