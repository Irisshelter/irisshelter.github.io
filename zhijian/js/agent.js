/* ============================================================
 * agent.js — 知简 Agent 对话引擎
 * 基于诊断结果的意图识别 + 模板生成（可无缝替换为真实 LLM API）
 * 对外暴露：AgentEngine.reply(question, context) -> string
 * ============================================================ */

const AgentEngine = {

  /** 意图路由表：关键词 → 处理器 */
  intents: [
    { key: "job",      words: ["投什么", "岗位", "投递", "适合什么", "推荐岗位", "什么工作"] },
    { key: "gap",      words: ["缺", "短板", "差距", "不足", "提升", "补"] },
    { key: "score",    words: ["多少分", "匹配度", "评分", "水平", "竞争力", "排名"] },
    { key: "salary",   words: ["薪资", "工资", "钱", "待遇", "多少钱"] },
    { key: "plan",     words: ["计划", "规划", "怎么准备", "如何准备", "学习路线", "建议"] },
    { key: "market",   words: ["市场", "行情", "趋势", "前景", "好找吗", "竞争"] },
    { key: "hello",    words: ["你好", "hi", "hello", "在吗", "你是谁", "介绍"] }
  ],

  /**
   * 生成回复
   * @param {string} q 用户问题
   * @param {Object} ctx 诊断上下文 { profile, result }
   * @returns {string} 回复文本（支持简单 HTML：b/ul/li）
   */
  reply(q, ctx) {
    const text = (q || "").toLowerCase();
    const route = this.matchIntent(text);
    switch (route) {
      case "job":    return this.answerJobs(ctx);
      case "gap":    return this.answerGaps(ctx);
      case "score":  return this.answerScore(ctx);
      case "salary": return this.answerSalary(ctx);
      case "plan":   return this.answerPlan(ctx);
      case "market": return this.answerMarket(ctx);
      case "hello":  return this.answerHello();
      default:       return this.answerFallback(ctx);
    }
  },

  matchIntent(text) {
    for (const it of this.intents) {
      if (it.words.some(w => text.includes(w))) return it.key;
    }
    return null;
  },

  answerHello() {
    return "你好！我是知简 Agent，基于你的简历诊断结果为你服务。\n你可以问我：\n· 我最适合投什么岗位？\n· 我还缺哪些技能？\n· 帮我制定求职准备计划。";
  },

  answerJobs(ctx) {
    const jobs = ctx.result ? ctx.result.jobs.slice(0, 3) : [];
    if (!jobs.length) return "请先上传简历完成诊断，我才能给出针对性的岗位推荐。";
    const lines = jobs.map((j, i) =>
      `${i + 1}. <span class="hl">${j.name}</span>（${j.city} · ${j.salary}）— 匹配度 ${j.score}%，${j.notes}`
    ).join("\n");
    return `根据你的技能档案，我最推荐这三个岗位：\n${lines}\n\n建议优先投递第 1 个，同时观察第 2、3 个岗位的招聘节奏。`;
  },

  answerGaps(ctx) {
    const gaps = ctx.result ? ctx.result.gapsByJob : [];
    if (!gaps.length) return "目前没有识别到明显技能缺口，或者还没有完成诊断。";
    const lines = gaps.slice(0, 4).map(g =>
      `· <span class="hl">${g.name}</span>（${g.label}）— 岗位权重 ${g.weight}/5`
    ).join("\n");
    return `对照目标岗位 JD，你的技能缺口按优先级排列如下：\n${lines}\n\n我的建议：优先补「高优先级」项，它是匹配分提升最快的杠杆点。`;
  },

  answerScore(ctx) {
    if (!ctx.result) return "请先上传简历完成诊断。";
    const r = ctx.result;
    return `你的综合匹配分是 <span class="hl">${r.overall}</span>，竞争力评级 <span class="hl">${r.level}</span>，大约超过 ${r.rank}% 的同岗位求职者。\n\n这个分数说明：${r.overall >= 75 ? "你已具备核心技能盘，差距在深度与项目含金量上。" : "你处在入门阶段，先补齐岗位高频技能，分数会快速上涨。"}`;
  },

  answerSalary(ctx) {
    const jobs = ctx.result ? ctx.result.jobs.slice(0, 3) : [];
    if (!jobs.length) return "请先完成简历诊断，我再结合岗位给你薪资参考。";
    const lines = jobs.map(j => `· ${j.name}：${j.salary}`).join("\n");
    return `结合你的匹配岗位，薪资参考区间：\n${lines}\n\n注意：应届生第一份工作，成长空间比薪资高 1-2K 更重要。`;
  },

  answerPlan(ctx) {
    const gaps = ctx.result ? ctx.result.gapsByJob : [];
    const first = gaps[0] ? gaps[0].name : "SQL";
    const plans = {
      "SQL": "每天 1 道 SQL 真题（多表关联 + 窗口函数），两周可覆盖面试高频题型",
      "Python": "用 Pandas 重做你简历里的项目数据集，把过程写成 Notebook，面试能直接展示",
      "机器学习": "先用 scikit-learn 跑通回归 + 聚类各一个完整案例，重点讲清特征选择与评估指标",
      "可视化": "用 ECharts 把简历项目做成一个可交互的在线看板，链接放进简历，含金量立涨",
      "Excel": "重点练数据透视表 + VLOOKUP/XLOOKUP，配合一个业务对账场景案例"
    };
    const tip = plans[first] || "围绕目标岗位 JD 逐条对照，每条都准备一个可展示的案例";
    return `给你一个 4 周行动计划：\n· 第 1-2 周：专攻 <span class="hl">${first}</span> —— ${tip}\n· 第 3 周：把简历项目升级为「数据 + 结论」的 STAR 结构\n· 第 4 周：模拟面试 + 针对性投递 20 家\n\n核心原则：每学一项，就在简历里留下可验证的证据。`;
  },

  answerMarket() {
    return `当前数据类岗位市场概况（模拟样本）：\n· <span class="hl">数据分析师</span>需求最旺，近 6 个月发布量持续上涨\n· JD 中提及率最高的技能：SQL（87%）、Python（78%）、Excel（72%）\n· 应届生薪资集中在 8-12K 区间\n\n结论：SQL + Python 是入行硬通货，建议优先夯实。`;
  },

  answerFallback(ctx) {
    return "这个问题我可以从诊断数据出发来回答。你可以试试这样问我：\n· 我最适合投什么岗位？\n· 我的技能缺口有哪些？\n· 帮我制定 4 周求职计划\n· 数据类岗位薪资行情如何？";
  },

  /**
   * 构造 LLM 系统提示词：把诊断结果注入，让模型基于真实诊断数据回答
   * 注意：这里只放结构化数据，不塞用户原始敏感信息
   */
  buildSystemPrompt(ctx) {
    const p = ctx.profile;
    const r = ctx.result;
    if (!r) return "你是「知简」的求职顾问 Agent，专业、真诚、务实。请先引导用户上传简历完成诊断。";
    const best = r.targetJob || r.jobs[0];
    const gaps = r.gapsByJob.map(g => `${g.rank}.${g.name}(${g.label})`).join("、") || "无";
    const top3 = r.jobs.slice(0, 3).map(j => `${j.name}[${j.score}%]`).join("、");
    return [
      "你是「知简」的求职顾问 Agent，为一位应届生提供简历诊断与求职建议。回答要专业、具体、真诚，不要过度夸奖，要指出真实短板。",
      "以下是该用户的简历诊断数据（真实可信，回答请以此为准）：",
      `- 姓名：${p.name}`,
      `- 教育：${p.education}`,
      `- 识别技能：${p.skills.join("、") || "未识别"}`,
      `- 综合匹配分：${r.overall}，竞争力评级：${r.level}，约超过 ${r.rank}% 同岗位求职者`,
      `- 目标岗位：${best.name}（${best.city} · ${best.salary}）`,
      `- 岗位匹配 Top3：${top3}`,
      `- 技能缺口：${gaps}`,
      "回答要求：优先基于以上数据给建议；可结合常见求职经验补充；用中文，简洁分点；不要把用户捧上天，诚实指出差距和可执行动作。"
    ].join("\n");
  },

  /**
   * 用 LLM 生成回复（流式）
   * @param {object} cloud 已初始化的 WorkBuddy 云服务客户端
   * @param {string} question 用户问题
   * @param {object} ctx 诊断上下文
   * @param {Array} history 最近几轮 {role, content}
   * @param {function} onDelta 每收到一段文本回调（用于流式渲染）
   * @returns {Promise<string>} 完整回复文本
   */
  async replyLLM(cloud, question, ctx, history, onDelta) {
    const models = await cloud.llm.models.list();
    // 排除 auto/default 这类路由占位模型，优先选具体可用的模型
    const usable = models.filter(m => m.disabled !== true && !/^(auto|default)$/.test(m.id || ""));
    const model = usable[0] || models.find(m => m.disabled !== true);
    if (!model) throw new Error("no_available_model");
    const messages = [
      { role: "system", content: this.buildSystemPrompt(ctx) },
      ...(history || []).slice(-6),
      { role: "user", content: question }
    ];
    let full = "";
    for await (const chunk of cloud.llm.chat.completions.create({
      model: model.id,
      messages,
      stream: true,
      temperature: 0.7
    })) {
      const delta = chunk.choices && chunk.choices[0] && chunk.choices[0].delta;
      if (delta && delta.content) {
        full += delta.content;
        if (onDelta) onDelta(delta.content);
      }
    }
    return full;
  }
};

if (typeof module !== "undefined" && module.exports) module.exports = { AgentEngine };
