// index.js (仅提取 b23.tv 链接的最终版)

const WebSocket = require('ws');
const config = require('./config');

let ws;
const reconnectInterval = 5000;

function removeUrlParams(url) {
  try {
    const urlObj = new URL(url);
    // 返回 protocol + host + pathname
    return `${urlObj.origin}${urlObj.pathname}`;
  } catch (error) {
    // 如果 URL 解析失败，尝试简单处理
    return url.split('?')[0].split('#')[0];
  }
}

function connectToNapCat() {
  console.log('正在尝试连接到 NapCat WebSocket 服务...');

  const headers = {};
  if (config.napcat.accessToken) {
    headers['Authorization'] = `Bearer ${config.napcat.accessToken}`;
  }

  ws = new WebSocket(config.napcat.url, { headers });

  ws.on('open', () => {
    console.log('✅ 成功连接到 NapCat WebSocket 服务！');
  });

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());

      // 过滤非指定群聊的消息
      if (message.post_type !== 'message' || message.message_type !== 'group' || !config.enabledGroups.includes(message.group_id.toString())) {
        return;
      }

      // 寻找 JSON 类型的消息段
      const jsonMessageSegment = message.message.find(segment => segment.type === 'json');
      if (!jsonMessageSegment) {
        return;
      }

      const jsonData = JSON.parse(jsonMessageSegment.data.data);
      
      // 使用 appid 作为唯一的、最可靠的判断依据
      const isBiliApp = jsonData.meta?.detail_1?.appid === '1109937557';

      if (isBiliApp) {
        // 直接从 JSON 数据中提取 b23.tv 短链接
        const shortUrl = removeUrlParams(jsonData.meta.detail_1.qqdocurl);

        if (shortUrl) {
            console.log(`[群: ${message.group_id}] 检测到B站小程序, 提取到短链接: ${shortUrl}`);

            // 构建回复消息
            const reply = {
              action: 'send_group_msg',
              params: {
                group_id: message.group_id,
                message: '对应的视频链接是： ' + shortUrl, // 直接回复短链接
              },
            };
    
            ws.send(JSON.stringify(reply));
            console.log('🚀 回复已发送！');
        }
      }
    } catch (error) {
      // 仅在解析JSON等核心流程出错时打印日志，忽略无关错误
      console.error('处理消息时发生错误:', error);
    }
  });

  ws.on('close', (code, reason) => {
    console.log(`与 NapCat 的连接已断开。代码: ${code}, 原因: ${reason.toString()}`);
    console.log(`将在 ${reconnectInterval / 1000} 秒后尝试重新连接...`);
    setTimeout(connectToNapCat, reconnectInterval);
  });

  ws.on('error', (error) => {
    console.error('WebSocket 发生错误:', error.message);
  });
}

// 启动连接
connectToNapCat();
console.log('Bilibili 短链接提取服务已启动，正在等待消息...');