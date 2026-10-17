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
    const lines = jobs.map((j, i) => {
      const comps = (j.companies || []).slice(0, 2).map(c => c.name).join("、");
      return `${i + 1}. <span class="hl">${j.name}</span>（${j.city} · ${j.salary}）— 匹配度 ${j.score}%${j.isStretch ? "，<b>冲刺岗</b>" : ""}${comps ? "，可投：<span class='hl'>" + comps + "</span>" : ""}`;
    }).join("\n");
    return `根据你的多维诊断，全部岗位已按匹配度排序，最推荐这三个：\n${lines}\n\n建议：岗位没有「冲刺岗」标记的才是你现阶段最稳的；带标记的也可以投，但需要先补齐学历/院校/项目背书。具体企业和投递链接，到「数据市场」页看完整清单。`;
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
    const jobs = ctx.result ? ctx.result.jobs.slice(0, 5) : [];
    if (!jobs.length) return "请先完成简历诊断，我再结合你的硬门槛和技能给出现实薪资参考。";
    const lines = jobs.map(j => `· ${j.name}：${j.salary}（匹配 ${j.score}%${j.isStretch ? "，冲刺岗" : ""}）`).join("\n");
    return `结合你的院校/学历/技能，全部岗位薪资区间如下（适配度见旁）：\n${lines}\n\n提醒：10K 以上岗位普遍卡 985/211 或硕士，冲刺岗需要更强背书；先拿一个匹配岗积累经验更重要。`;
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
    // 基于真实招聘数据（6362 家全方向企业）给出市场概况
    let total = 0, totalG = 0, totalM = 0, totalW = 0;
    if (typeof REAL_COMPANIES !== "undefined") {
      total = REAL_COMPANIES.length;
      REAL_COMPANIES.forEach(c => {
        const t = c.type || "";
        if (t.includes("国企") || t.includes("事业")) totalG++;
        else if (t.includes("外企") || t.includes("合资")) totalW++;
        else totalM++;
      });
    }
    return `当前招聘市场概况（基于真实秋招/春招数据，共 <span class="hl">${total}</span> 家企业）：\n· 国企 ${totalG} 家 · 民企 ${totalM} 家 · 外企 ${totalW} 家\n· 覆盖数据、产品、运营、开发、设计、财务、人力、市场等全方向岗位\n· 具体可投企业与薪资，请切换上方目标岗位查看「数据市场」板块的实时匹配\n\n结论：岗位方向与对口企业会随你的简历和目标岗位动态变化，切换岗位即可看到对应企业清单。`;
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
    const top3 = r.jobs.slice(0, 3).map(j => `${j.name}[${j.score}%${j.isStretch ? "·冲刺岗" : ""}]`).join("、");
    const dims = r.dimensions;
    const gates = r.gates && r.gates.length ? r.gates.join("；") : "无硬门槛问题";
    // 企业投递清单（每个岗位列出前 2 家 + 类型）
    const companyLines = r.jobs.slice(0, 4).map(j => {
      const comps = (j.companies || []).slice(0, 2).map(c => `${c.name}(${c.type}·${c.status})`).join("、");
      return `  ${j.name}：${comps || "暂无公开企业"}`;
    }).join("\n");
    return [
      "你是「知简」的求职顾问 Agent，为一位应届生提供简历诊断与求职建议。回答要专业、具体、真诚，不要过度夸奖，要指出真实短板。",
      "以下是该用户的简历多维诊断数据（真实可信，回答请以此为准）：",
      `- 姓名：${p.name}`,
      `- 教育：${p.education}（${p.schoolTier || "未知"}）`,
      `- 学历：${p.degree || "未识别"}`,
      `- 证书：${(p.certs || []).join("、") || "无"}`,
      `- 识别技能：${p.skills.join("、") || "未识别"}`,
      `- 综合匹配分：${r.overall}，竞争力评级：${r.level}，约超过 ${r.rank}% 同岗位求职者`,
      `- 目标岗位：${best.name}（${best.city} · ${best.salary}）`,
      `- 岗位匹配 Top3：${top3}`,
      `- 技能缺口：${gaps}`,
      `- 六维得分：技能匹配${dims.skills}、学历院校${dims.school}、项目${dims.project}、实习${dims.intern}、证书${dims.cert}、潜力${dims.potential}`,
      `- 硬门槛体检：${gates}`,
      `- 可投企业清单（部分）：\n${companyLines}`,
      "回答要求：优先基于以上数据给建议；可结合常见求职经验补充；用中文，简洁分点；不要把用户捧上天，诚实指出差距（尤其是学历院校、硬门槛、技能缺口）和可执行动作。用户问企业/投递时，优先引用上面「可投企业清单」里的企业名与类型。"
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
