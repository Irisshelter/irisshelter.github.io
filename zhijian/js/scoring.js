/* ============================================================
 * scoring.js — 多维岗位匹配打分引擎（v2.0）
 * 输入：结构化简历档案
 * 输出：综合匹配分、分维度得分、硬门槛筛选、逐岗位匹配、缺口诊断
 *
 * 核心升级：不再只看技能，而是模拟 HR 真实筛选逻辑，纳入
 * ① 技能匹配  ② 学历院校  ③ 项目/实习含金量  ④ 证书
 * ⑤ 岗位硬门槛（学历/院校卡线）——不达标则岗位直接标记"冲刺岗"
 * ============================================================ */

const Scoring = {

  /**
   * 核心入口
   * @param {Object} profile ResumeParser.parse 的输出
   * @returns {Object} 完整诊断结果
   */
  analyze(profile) {
    const ranked = this.rankJobs(profile);
    const top = ranked[0];
    // 意向优先：简历写明求职意向时，若意向岗位分数接近榜首（差距 ≤ 8），
    // 以意向岗位作为「目标岗位」驱动缺口诊断与雷达图
    let best = top;
    if (profile.intent) {
      const want = ranked.find(j => {
        const base = j.name.replace(/（.*?）|\(.*?\)/g, "");
        return profile.intent.includes(base.slice(0, 4));
      });
      if (want && want.score >= top.score - 8) best = want;
    }
    const dims = this.dimensionScore(profile, best);
    const overall = Math.round(this.compositeScore(profile, ranked, best, dims));
    return {
      overall,
      level: this.grade(overall),
      rank: this.rankPercent(overall),
      jobs: ranked,
      targetJob: best,
      dimensions: dims,                    // 六维得分明细
      gates: this.gateAnalysis(profile, best),
      gapsByJob: this.gapAnalysis(profile, best),
      radarData: this.radarData(profile, best)
    };
  },

  /**
   * 针对指定岗位重新计算「目标岗位相关」的诊断维度
   * 用于用户切换目标岗位后，重新生成该岗位的匹配度/缺口/雷达/门槛
   * @param {Object} profile 简历档案
   * @param {string} jobId 岗位 id
   * @returns {{dimensions, gates, gapsByJob, radarData}}
   */
  recomputeForJob(profile, jobId) {
    const ranked = this.rankJobs(profile);
    const job = ranked.find(j => j.id === jobId) || ranked[0];
    const dimensions = this.dimensionScore(profile, job);
    const overall = Math.round(this.compositeScore(profile, ranked, job, dimensions));
    return {
      dimensions,
      gates: this.gateAnalysis(profile, job),
      gapsByJob: this.gapAnalysis(profile, job),
      radarData: this.radarData(profile, job),
      overall,
      level: this.grade(overall),
      rank: this.rankPercent(overall)
    };
  },

  /**
   * 逐岗位匹配：技能匹配分 + 硬门槛修正
   * 硬门槛不达标的岗位，技能分再高也做"冲刺岗"标记
   */
  rankJobs(profile) {
    const userSkills = profile.skillScores || {};
    return JOB_LIBRARY.map(job => {
      const keys = Object.keys(job.skills);
      let got = 0, total = 0;
      const matched = [], missing = [];
      for (const k of keys) {
        const w = job.skills[k];
        total += w;
        if (userSkills[k] !== undefined) {
          got += (userSkills[k] / 100) * w;
          matched.push(k);
        } else {
          missing.push(k);
        }
      }
      const raw = total > 0 ? got / total : 0;
      let score = Math.round(raw * 100);

      // 硬门槛检查：只作为"冲刺岗"标签提示，不再压低/封顶匹配分
      // 理由：岗位应全部列出供用户参考投递，适配度标注在旁即可，
      // 不能把不完全适配的岗位排除掉，否则用户无岗可投、无数据可参考。
      const gate = JOB_HARD_GATE[job.id];
      const gatePass = this.checkGate(profile, gate);
      return {
        ...job,
        score,
        matched,
        missing,
        gapCount: missing.length,
        gate: gatePass,   // { pass, reasons[] }
        isStretch: !gatePass.pass, // 是否"冲刺岗"（仅提示，不参与排除）
        companies: (typeof getRealCompaniesForJob !== "undefined" ? getRealCompaniesForJob(job.id, 12) : []) // 关联真实企业投递清单
      };
    }).sort((a, b) => b.score - a.score);
  },

  /** 硬门槛检查 */
  checkGate(profile, gate) {
    if (!gate) return { pass: true, reasons: [] };
    const reasons = [];
    const dl = profile.degreeLevel || 1;
    if (dl < gate.eduMin) {
      reasons.push(`学历要求${this.eduName(gate.eduMin)}起步，当前${profile.degree || "未识别"}`);
    }
    const sl = profile.schoolLevel || 1;
    if (gate.schoolLevel >= 5 && sl < 5) {
      reasons.push("该岗位普遍卡 985/211 或硕士院校背景");
    }
    return { pass: reasons.length === 0, reasons };
  },

  eduName(level) {
    return { 6: "博士", 5: "硕士", 4: "本科", 3: "大专" }[level] || "不限";
  },

  /**
   * 六维能力得分（0-100）
   * 权重模拟 HR 关注点：硬门槛与技能权重最高
   */
  dimensionScore(profile, bestJob) {
    const skills = this.skillDim(profile, bestJob);
    const school = this.schoolDim(profile);
    const project = this.projectDim(profile);
    const intern = this.internDim(profile);
    const cert = this.certDim(profile);
    const potential = this.potentialDim(profile);
    return { skills, school, project, intern, cert, potential };
  },

  /** 技能维度：目标岗位加权覆盖 */
  skillDim(profile, bestJob) {
    if (!bestJob) return 0;
    return bestJob.score;
  },

  /** 院校维度：院校层级 + 学历 */
  schoolDim(profile) {
    const tierScore = { 5: 95, 4: 82, 3: 62, 2: 40, 1: 30 }[profile.schoolLevel] || 30;
    const degBonus = { 6: 5, 5: 10, 4: 0, 3: -15 }[profile.degreeLevel] || 0;
    return Math.max(5, Math.min(98, tierScore + degBonus));
  },

  /** 项目维度：项目含金量（0-10 映射到 0-100） */
  projectDim(profile) {
    return Math.min(100, (profile.projectRichness || 0) * 10);
  },

  /** 实习维度 */
  internDim(profile) {
    return Math.min(100, (profile.internRichness || 0) * 10);
  },

  /** 证书维度 */
  certDim(profile) {
    const certs = profile.certs || [];
    if (!certs.length) return 20;
    const highValue = certs.filter(c => /六级|软考|数据分析师认证/.test(c)).length;
    const base = Math.min(80, certs.length * 25);
    return Math.min(100, base + highValue * 15);
  },

  /** 潜力维度：技能广度 + 表达完整度 */
  potentialDim(profile) {
    const breadth = (profile.skills || []).length;
    const word = profile.wordCount || 0;
    let score = Math.min(60, breadth * 7);
    if (word >= 200) score += 20;
    else if (word >= 100) score += 10;
    if ((profile.certs || []).length) score += 10;
    return Math.min(100, score);
  },

  /**
   * 综合匹配分 = 目标岗位分 × 0.4 + 六维均分 × 0.4 + Top3 均分 × 0.2
   * 让"能投什么"与"整体素质"共同决定总分，避免纯技能虚高
   */
  compositeScore(profile, rankedJobs, bestJob, dims) {
    if (!rankedJobs.length) return 0;
    const top3 = rankedJobs.slice(0, 3);
    const avgTop3 = top3.reduce((s, j) => s + j.score, 0) / top3.length;
    const anchor = (bestJob || rankedJobs[0]).score;
    const dimVals = Object.values(dims);
    const dimAvg = dimVals.reduce((s, v) => s + v, 0) / dimVals.length;
    return anchor * 0.4 + dimAvg * 0.4 + avgTop3 * 0.2;
  },

  grade(score) {
    if (score >= 90) return "A+";
    if (score >= 82) return "A";
    if (score >= 74) return "B+";
    if (score >= 65) return "B";
    if (score >= 55) return "C+";
    return "C";
  },

  /** 竞争力百分位（基于分数的模拟映射，多维后整体偏低属正常） */
  rankPercent(score) {
    return Math.max(3, Math.min(92, Math.round((score - 35) * 1.55)));
  },

  /** 硬门槛诊断（面向目标岗位） */
  gateAnalysis(profile, bestJob) {
    if (!bestJob) return [];
    return bestJob.gate ? bestJob.gate.reasons : [];
  },

  /**
   * 目标岗位的全面缺口诊断（三维）：
   * ① 技能缺口：缺失技能（未命中）+ 薄弱技能（命中但得分 < 60）
   * ② 硬门槛短板：学历/院校/证书未达标项
   * ③ 经历短板：项目/实习数量或含金量不足
   * 每条附带可执行建议，按优先级排序
   */
  gapAnalysis(profile, bestJob) {
    if (!bestJob) return [];
    const userSkills = profile.skillScores || {};
    const gaps = [];

    // ① 技能缺口
    for (const k of bestJob.missing) {
      const w = bestJob.skills[k] || 1;
      gaps.push(this.makeGap("skill", k, w, true));
    }
    for (const k of bestJob.matched) {
      const s = userSkills[k] || 0;
      if (s < 60) {
        gaps.push(this.makeGap("skill", k, bestJob.skills[k] || 1, false, true));
      }
    }

    // ② 硬门槛短板（院校/学历/证书）
    const gate = bestJob.gate || { pass: true, reasons: [] };
    if (gate.reasons && gate.reasons.length) {
      gate.reasons.forEach((reason, idx) => {
        gaps.push(this.makeGap("gate", "硬门槛", 5 - idx, false, false, reason));
      });
    }
    if ((profile.certs || []).length === 0) {
      gaps.push(this.makeGap("gate", "证书", 2, false, false, "无证书，建议考取英语四级/软考等基础证书"));
    }

    // ③ 经历短板（项目/实习）
    const proj = profile.projects || 0;
    const intern = profile.internships || 0;
    if (proj < 2) {
      gaps.push(this.makeGap("exp", "项目经历", proj === 0 ? 5 : 4, false, false,
        proj === 0 ? "无项目经历，建议补 2 个数据分析实战项目" : "项目数量偏少，建议补充 1-2 个高质量项目"));
    }
    if (intern < 1) {
      gaps.push(this.makeGap("exp", "实习经历", 4, false, false, "无实习经历，建议争取一段数据分析相关实习"));
    }

    // 排序：优先级（weight 高优先，skill > gate > exp）
    const catOrder = { skill: 0, gate: 1, exp: 2 };
    gaps.sort((a, b) => (b.weight - a.weight) || (catOrder[a.cat] - catOrder[b.cat]));
    return gaps.map((g, i) => ({ ...g, rank: i + 1 }));
  },

  makeGap(cat, name, weight, missing, weak, tip) {
    const level = weight >= 5 ? "high" : weight >= 3 ? "mid" : "low";
    let label;
    if (cat === "gate") label = "硬门槛";
    else if (cat === "exp") label = "经历短板";
    else label = missing
      ? (level === "high" ? "高优先级" : level === "mid" ? "中优先级" : "低优先级")
      : "待提升";
    return { cat, name, weight, level, label, missing: !!missing, weak: !!weak, tip: tip || "" };
  },

  /** 雷达图数据：你的技能得分 vs 目标岗位要求 */
  radarData(profile, bestJob) {
    const userSkills = profile.skillScores || {};
    const dims = RADAR_DIMENSIONS.map(dim => {
      const mine = userSkills[dim] !== undefined ? userSkills[dim] : 0;
      const req = bestJob && bestJob.skills[dim]
        ? Math.min(95, bestJob.skills[dim] * 18)
        : 25;
      return { dim, mine, req };
    });
    return dims;
  }
};

if (typeof module !== "undefined" && module.exports) module.exports = { Scoring };
