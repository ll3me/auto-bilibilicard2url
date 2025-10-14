// config.js

module.exports = {
  // napcat WebSocket 服务地址
  // 如果 napcat 和此服务在同一台机器上，通常使用 localhost
  // 端口号请根据你的 napcat 配置进行修改
  napcat: {
    url: 'ws://127.0.0.1:3001/ws', // 例如: 'ws://127.0.0.1:3001/ws'
    accessToken: '',           // 如果 napcat 配置了访问令牌，请填写在此处
  },

  // 需要开启此功能的群聊 GroupID 列表
  // 请将您的目标群号填入此数组
  // 例如: ['12345678', '87654321']
  enabledGroups: [
    '12345678', // 替换为你的目标群号
  ],
};