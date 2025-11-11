// config.js

module.exports = {
  // NapCat WebSocket 服务配置
  napcat: {
    url: 'ws://localhost:3001/ws', // 例如: 'ws://127.0.0.1:3001/ws'
    accessToken: '',           // 如果 napcat 配置了访问令牌，请填写
  },

  // 需要开启此功能的群聊 GroupID 列表
  enabledGroups: [
    '123456789', // 替换为你的目标群号
  ],

  // Bilibili 相关功能配置
  bilibili: {
    enableShareTextParser: true,
    // 是否开启BV模式。
    // true: 会访问短链接获取BV号，并附加到回复末尾。示例: "...b23.tv/xxxxx [BV: BV1xx4xx1xx]"
    // false: 仅回复清理后的 b23.tv 短链接。
    enableBVMode: true,
    textShareReplyMode: 'bv_only',
    // 回复消息的前缀
    replyPrefix: '链接：',

    // BV号附加格式, {bv} 会被替换为实际的BV号
    bvAppendFormat: '\n视频BV号：{bv}'
  }
};