/* ============================================================
 * cloud-config.js — WorkBuddy 云服务公共配置（占位 Key）
 * 这是开源版使用的占位配置，不含真实 Key。
 * 若要启用 AI 大模型，请填写你自己的 publishableKey，
 * 或参考 js/cloud-config.example.js。
 * 未配置时，应用会自动降级为规则引擎问答，功能不受影响。
 * ============================================================ */
window.CLOUD_CONFIG = {
  endpoint: "https://zhijian-73232.app.workbuddy.host",
  oauthRelayBaseUrl: "https://www.workbuddy.cn/v2/as/genie-baas/oauth",
  publishableKey: "在此填入你的 publishableKey"
};
