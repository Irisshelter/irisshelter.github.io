/* ============================================================
 * scoring.js — 岗位匹配打分引擎
 * 输入：结构化简历档案
 * 输出：综合匹配分、逐岗位匹配、缺失技能、投递建议
 * ============================================================ */

const Scoring = {

  /**
   * 核心入口
   * @param {Object} profile ResumeParser.parse 的输出
   * @returns {{overall:number, level:string, rank:number, jobs:Array, gapsByJob:Object, radarData:Object}}
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
    const overall = Math.round(this.compositeScore(profile, ranked, best));
    return {
      overall,
      level: this.grade(overall),
      rank: this.rankPercent(overall),
      jobs: ranked,
      targetJob: best,
      gapsByJob: this.gapAnalysis(profile, best),
      radarData: this.radarData(profile, best)
    };
  },

  /**
   * 逐岗位加权匹配：score = Σ(简历技能得分/100 × 权重) / Σ权重
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
      const score = Math.round(raw * 100);
      return {
        ...job,
        score,
        matched,
        missing,
        gapCount: missing.length
      };
    }).sort((a, b) => b.score - a.score);
  },

  /**
   * 综合匹配分 = 目标岗位分 × 0.7 + 整体Top3均分 × 0.3
   * 既反映"最优出路"，也反映整体适应性
   */
  compositeScore(profile, rankedJobs, bestJob) {
    if (!rankedJobs.length) return 0;
    const top3 = rankedJobs.slice(0, 3);
    const avgTop3 = top3.reduce((s, j) => s + j.score, 0) / top3.length;
    const anchor = (bestJob || rankedJobs[0]).score;
    return anchor * 0.7 + avgTop3 * 0.3;
  },

  grade(score) {
    if (score >= 90) return "A+";
    if (score >= 82) return "A";
    if (score >= 74) return "B+";
    if (score >= 65) return "B";
    if (score >= 55) return "C+";
    return "C";
  },

  /** 竞争力百分位（基于分数的模拟映射） */
  rankPercent(score) {
    return Math.max(5, Math.min(95, Math.round((score - 40) * 1.6)));
  },

  /**
   * 目标岗位的技能缺口诊断 = 缺失技能（未命中） + 薄弱技能（命中但得分 < 60）
   * 按岗位内技能权重降序排序
   */
  gapAnalysis(profile, bestJob) {
    if (!bestJob) return [];
    const userSkills = profile.skillScores || {};
    const gaps = [];
    for (const k of bestJob.missing) {
      const w = bestJob.skills[k] || 1;
      gaps.push(this.makeGap(k, w, true));
    }
    for (const k of bestJob.matched) {
      const s = userSkills[k] || 0;
      if (s < 60) {
        gaps.push(this.makeGap(k, bestJob.skills[k] || 1, false, true));
      }
    }
    gaps.sort((a, b) => b.weight - a.weight);
    return gaps.map((g, i) => ({ ...g, rank: i + 1 }));
  },

  makeGap(name, weight, missing, weak) {
    const level = weight >= 5 ? "high" : weight >= 3 ? "mid" : "low";
    const label = missing
      ? (level === "high" ? "高优先级" : level === "mid" ? "中优先级" : "低优先级")
      : "待提升";
    return { name, weight, level, label, missing, weak: !!weak };
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
