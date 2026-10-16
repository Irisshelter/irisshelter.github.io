/* ============================================================
 * parser.js — 简历解析引擎
 * 输入：简历纯文本
 * 输出：结构化档案 { name, education, skills[], projects, internships, raw }
 * 策略：规则引擎（正则 + 技能词表归并），后续可替换为 LLM 抽取
 * ============================================================ */

const ResumeParser = {

  /**
   * 解析简历文本为结构化档案
   * @param {string} text 简历纯文本
   * @returns {{name:string, education:string, skills:string[], skillScores:Object, projects:number, internships:number, wordCount:number}}
   */
  parse(text) {
    const clean = (text || "").replace(/\r/g, "").trim();
    return {
      name: this.extractName(clean),
      education: this.extractEducation(clean),
      intent: this.extractIntent(clean),
      skills: this.extractSkills(clean),
      skillScores: this.extractSkillScores(clean),
      projects: this.countSections(clean, ["项目经历", "项目经验", "项目："]),
      internships: this.countSections(clean, ["实习", "工作经验", "工作经历"]),
      wordCount: clean.replace(/\s/g, "").length
    };
  },

  /** 抽取求职意向：「求职意向：XXX」 */
  extractIntent(text) {
    const m = text.match(/求职意向[:：]?\s*([^\n，,。;；]{2,20})/);
    return m ? m[1].trim() : "";
  },

  /** 抽取姓名：匹配「姓名：X」或首行 2-4 个汉字 */
  extractName(text) {
    let m = text.match(/姓名[:：]\s*([\u4e00-\u9fa5]{2,4})/);
    if (m) return m[1];
    const firstLine = text.split("\n").map(s => s.trim()).find(s => s.length > 0) || "";
    m = firstLine.match(/^([\u4e00-\u9fa5]{2,4})(?![：:课程大学])/);
    if (m && !/大学|学院|简历|求职/.test(m[1])) return m[1];
    return "求职者";
  },

  /** 抽取教育背景：学校 + 专业 + 学历（先剔除校名，避免误吞） */
  extractEducation(text) {
    const school = text.match(/([\u4e00-\u9fa5]{4,16}(?:大学|学院|学校))/);
    let rest = text;
    if (school) rest = text.replace(school[1], "");
    const major = rest.match(/([\u4e00-\u9fa5]{2,10}?(?:工程|科学|技术|管理|经济|统计|数学))(?![\u4e00-\u9fa5]*?(?:大学|学院))/);
    const degree = /本科|学士/.test(text) ? "本科" : (/硕士|研究生/.test(text) ? "硕士" : (/大专|专科/.test(text) ? "大专" : ""));
    const parts = [];
    if (school) parts.push(school[1]);
    if (major) parts.push(major[1] + (degree ? "（" + degree + "）" : ""));
    return parts.join(" · ") || "未识别教育信息";
  },

  /** 技能归一化：命中词表则映射到标准技能名 */
  extractSkills(text) {
    const lower = text.toLowerCase();
    const found = [];
    for (const [std, aliases] of Object.entries(SKILL_LEXICON)) {
      if (aliases.some(a => lower.includes(a.toLowerCase()))) found.push(std);
    }
    return found;
  },

  /**
   * 技能熟练度评分（0-100）
   * 规则：出现次数越多 + 出现在"熟练/精通"上下文中 → 分越高
   */
  extractSkillScores(text) {
    const lower = text.toLowerCase();
    const scores = {};
    for (const [std, aliases] of Object.entries(SKILL_LEXICON)) {
      let hits = 0, expert = false;
      for (const a of aliases) {
        const al = a.toLowerCase();
        let idx = 0;
        while ((idx = lower.indexOf(al, idx)) !== -1) {
          hits++;
          const ctx = lower.slice(Math.max(0, idx - 8), idx);
          if (/熟练|精通|熟悉|掌握|良好/.test(ctx)) expert = true;
          idx += al.length;
        }
      }
      if (hits > 0) {
        scores[std] = Math.min(95, 40 + hits * 8 + (expert ? 20 : 0));
      }
    }
    return scores;
  },

  /** 统计指定章节下的大致条目数（按「▪/-/•/数字.」列表符或换行段估算） */
  countSections(text, headers) {
    for (const h of headers) {
      const idx = text.indexOf(h);
      if (idx === -1) continue;
      const seg = text.slice(idx, idx + 800);
      const bullets = seg.match(/(?:^|\n)\s*(?:▪|•|-|·|\d+[.、])/g);
      if (bullets && bullets.length) return bullets.length;
      return 1;
    }
    return 0;
  }
};

if (typeof module !== "undefined" && module.exports) module.exports = { ResumeParser };
