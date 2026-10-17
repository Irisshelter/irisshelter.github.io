/* ============================================================
 * cloud-config.example.js — 配置模板（复制本文件为 cloud-config.js 并填入你自己的 Key）
 *
 * 使用说明：
 *   1. 复制本文件为 js/cloud-config.js
 *   2. 把 publishableKey 替换成你自己的 WorkBuddy 云服务 Key
 *   3. 没有 Key 也能正常使用（自动降级为规则引擎问答）
 *
 * 注意：cloud-config.js 已被 .gitignore 忽略，不会提交到公开仓库，
 *       避免你的 AI 调用额度被他人白嫖。
 * ============================================================ */
window.CLOUD_CONFIG = {
  endpoint: "https://zhijian-73232.app.workbuddy.host",
  oauthRelayBaseUrl: "https://www.workbuddy.cn/v2/as/genie-baas/oauth",
  publishableKey: "在此填入你的 publishableKey"
};
