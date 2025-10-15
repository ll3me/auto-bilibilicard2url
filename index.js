// index.js (支持可配置的BV模式)

const WebSocket = require('ws');
const axios = require('axios'); // 引入 axios
const config = require('./config');

let ws;
const reconnectInterval = 5000;

// 清理URL参数的函数，保持不变
function removeUrlParams(url) {
  try {
    const urlObj = new URL(url);
    return `${urlObj.origin}${urlObj.pathname}`;
  } catch (error) {
    return url.split('?')[0].split('#')[0];
  }
}

// 随机延迟函数，保持不变
function waitRandom(min, max) {
  const delay = Math.random() * (max - min) + min;
  return new Promise(resolve => {
    setTimeout(resolve, delay);
  });
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

  // 将消息处理函数标记为 async 以便使用 await
  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data.toString());

      if (message.post_type !== 'message' || message.message_type !== 'group' || !config.enabledGroups.includes(message.group_id.toString())) {
        return;
      }

      const jsonMessageSegment = message.message.find(segment => segment.type === 'json');
      if (!jsonMessageSegment) {
        return;
      }

      const jsonData = JSON.parse(jsonMessageSegment.data.data);
      const isBiliApp = jsonData.meta?.detail_1?.appid === '1109937557';

      if (isBiliApp) {
        const rawUrl = jsonData.meta.detail_1.qqdocurl;
        if (!rawUrl) return;

        const shortUrl = removeUrlParams(rawUrl);
        console.log(`[群: ${message.group_id}] 检测到B站小程序, 提取到短链接: ${shortUrl}`);

        let finalMessage = config.bilibili.replyPrefix + shortUrl;

        // [核心功能] 检查BV模式是否开启
        if (config.bilibili.enableBVMode) {
          try {
            console.log(`BV模式已开启, 正在解析: ${shortUrl}`);
            // 访问短链接获取重定向后的最终URL
            const response = await axios.get(shortUrl, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36'
              },
              timeout: 5000 // 5秒超时
            });

            const finalUrl = response.request.res.responseUrl;
            // 使用正则表达式从最终URL中提取BV号
            const bvMatch = finalUrl.match(/\/video\/(BV[a-zA-Z0-9]+)/);

            if (bvMatch && bvMatch[1]) {
              const bvId = bvMatch[1];
              console.log(`✅ BV号提取成功: ${bvId}`);
              const appendText = config.bilibili.bvAppendFormat.replace('{bv}', bvId);
              finalMessage += appendText;
            } else {
              console.warn(`⚠️ 未能在最终URL中找到BV号: ${finalUrl}`);
            }
          } catch (error) {
            console.error(`❌ 解析BV号时发生错误: ${error.message}`);
            // 如果解析失败，finalMessage 保持原样，机器人仍然会回复短链接
          }
        }

        // 构建回复消息
        const reply = {
          action: 'send_group_msg',
          params: {
            group_id: message.group_id,
            message: finalMessage,
          },
        };

        // 等待随机延迟后发送
        await waitRandom(1000, 1500);
        ws.send(JSON.stringify(reply));
        console.log(`🚀 回复已发送: ${finalMessage}`);
      }
    } catch (error) {
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
console.log('Bilibili 短链接提取服务已启动 (支持BV模式)，正在等待消息...');