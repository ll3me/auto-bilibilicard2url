// index.js (支持小程序卡片 + 可配置的文本分享)

const WebSocket = require('ws');
const axios = require('axios'); // 确保已安装 axios
const config = require('./config');

let ws;
const reconnectInterval = 5000;

// 模拟浏览器的 User-Agent，防止被屏蔽
const axiosHeaders = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36'
};

/**
 * 清理URL的查询参数和哈希
 * @param {string} url 原始URL
 * @returns {string} 清理后的URL
 */
function removeUrlParams(url) {
  try {
    const urlObj = new URL(url);
    return `${urlObj.origin}${urlObj.pathname}`;
  } catch (error) {
    return url.split('?')[0].split('#')[0];
  }
}

/**
 * 随机延迟
 * @param {number} min 最小毫秒数
 * @param {number} max 最大毫秒数
 * @returns {Promise<void>}
 */
function waitRandom(min, max) {
  const delay = Math.random() * (max - min) + min;
  return new Promise(resolve => {
    setTimeout(resolve, delay);
  });
}

/**
 * 访问URL并提取BV号
 * @param {string} url (b23.tv 短链接或小程序原始链接)
 * @returns {Promise<string|null|'IS_MEDIA'>} 成功则返回BV号, 失败则返回null, 识别为番剧则返回 'IS_MEDIA'
 */
async function getBvFromUrl(url) {
  try {
    console.log(`BV模式: 正在解析 ${url}`);
    const response = await axios.get(url, {
      headers: axiosHeaders,
      timeout: 5000 // 5秒超时
    });

    const finalUrl = response.request.res.responseUrl;

    // --- 【修改点 1: 检查是否是番剧或影视】 ---
    if (finalUrl.includes('/ss/') || finalUrl.includes('/md/') || finalUrl.includes('/bangumi/')) {
      console.log(`🟡 识别为番剧/影视链接，跳过回复: ${finalUrl}`);
      return 'IS_MEDIA'; // 使用一个特殊标记表示是番剧
    }
    // --- 【修改点 1 结束】 ---

    const bvMatch = finalUrl.match(/\/video\/(BV[a-zA-Z0-9]+)/);

    if (bvMatch && bvMatch[1]) {
      const bvId = bvMatch[1];
      console.log(`✅ BV号提取成功: ${bvId}`);
      return bvId;
    } else {
      console.warn(`⚠️ 未能在最终URL中找到BV号: ${finalUrl}`);
      return null;
    }
  } catch (error) {
    console.error(`❌ 解析BV号时发生错误: ${error.message}`);
    return null;
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

  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data.toString());

      // 1. 基础过滤
      if (message.post_type !== 'message' || message.message_type !== 'group' || !config.enabledGroups.includes(message.group_id.toString())) {
        return;
      }

      let rawUrl = null;
      let source = null;      // '小程序' 或 '分享文本'
      let needsParamRemoval = false;

      // 2. 检查B站小程序卡片 (模式一)
      const jsonMessageSegment = message.message.find(segment => segment.type === 'json');
      if (jsonMessageSegment) {
        const jsonData = JSON.parse(jsonMessageSegment.data.data);
        const isBiliApp = jsonData.meta?.detail_1?.appid === '1109937557';
        if (isBiliApp) {
          rawUrl = jsonData.meta.detail_1.qqdocurl;
          source = '小程序';
          needsParamRemoval = true;
        }
      }

      // 3. 检查B站分享文本 (模式二)
      if (!rawUrl && config.bilibili.enableShareTextParser) {
        const textContent = message.message
          .filter(seg => seg.type === 'text')
          .map(seg => seg.data.text)
          .join('');

        if (textContent.includes('哔哩哔哩')) {
          const textMatch = textContent.match(/(https:\/\/b23\.tv\/[a-zA-Z0-9]+)/);
          if (textMatch && textMatch[1]) {
            rawUrl = textMatch[1];
            source = '分享文本';
            needsParamRemoval = false;
          }
        }
      }

      // 4. 未命中, 退出
      if (!rawUrl) {
        return;
      }

      // --- 5. [核心修改] 回复处理 ---
      const shortUrl = needsParamRemoval ? removeUrlParams(rawUrl) : rawUrl;
      console.log(`[群: ${message.group_id}] 检测到B站${source}, 提取到短链接: ${shortUrl}`);

      let finalMessage = null;
      let bvId = null;

      // 5.1 尝试获取BV号 (如果BV模式开启)
      if (config.bilibili.enableBVMode) {
        bvId = await getBvFromUrl(shortUrl);
        
        // --- 【修改点 2: 处理番剧跳过】 ---
        if (bvId === 'IS_MEDIA') {
          // 识别为番剧/影视，直接跳出处理，不回复
          return;
        }
        // --- 【修改点 2 结束】 ---
      }

      // 5.2 构建回复消息
      if (bvId) {
        // --- BV号获取成功 ---
        const bvText = config.bilibili.bvAppendFormat.replace('{bv}', bvId);

        if (source === '分享文本' && config.bilibili.textShareReplyMode === 'bv_only') {
          // [您的新需求] 模式二 + bv_only 模式 = 仅回复BV
          finalMessage = bvText.trim(); // .trim() 移除 " [BV: ...]" 的前导空格
        } else {
          // 模式一 (小程序) 或 模式二 (link_with_bv 模式)
          finalMessage = config.bilibili.replyPrefix + shortUrl + bvText;
        }
      } else {
        // --- BV号获取失败 (或BV模式关闭) ---
        // 统一回复 "前缀 + 短链接"
        finalMessage = config.bilibili.replyPrefix + shortUrl;
      }

      // 5.3 发送回复
      const reply = {
        action: 'send_group_msg',
        params: {
          group_id: message.group_id,
          message: finalMessage,
        },
      };

      await waitRandom(1000, 1500);
      ws.send(JSON.stringify(reply));
      console.log(`🚀 回复已发送: ${finalMessage}`);

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
console.log('Bilibili 链接解析服务已启动 (支持小程序+文本)，正在等待消息...');