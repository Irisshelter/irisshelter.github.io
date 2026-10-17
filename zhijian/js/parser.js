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
    const school = this.extractSchoolInfo(clean);
    return {
      name: this.extractName(clean),
      education: this.extractEducation(clean),
      intent: this.extractIntent(clean),
      skills: this.extractSkills(clean),
      skillScores: this.extractSkillScores(clean),
      projects: this.countSections(clean, ["项目经历", "项目经验", "项目："]),
      internships: this.countSections(clean, ["实习", "工作经验", "工作经历"]),
      // 新增：院校/学历/证书/硬门槛维度
      school: school.school,
      schoolLevel: school.level,   // 5=985 4=211 3=双一流/普通本科 2=专科 1=未知
      schoolTier: school.tier,     // "985" | "211" | "双一流" | "普通本科" | "专科" | "未知"
      degree: this.extractDegree(clean),          // "硕士"|"本科"|"大专"|""
      degreeLevel: this.degreeToLevel(clean),     // 5=硕士 4=本科 3=大专 1=未知
      certs: this.extractCerts(clean),
      projectRichness: this.scoreProjectRichness(clean),
      internRichness: this.scoreInternRichness(clean),
      wordCount: clean.replace(/\s/g, "").length
    };
  },

  /** 抽取院校与层级 */
  extractSchoolInfo(text) {
    const schoolMatch = text.match(/([\u4e00-\u9fa5]{4,16}(?:大学|学院|学校))/);
    const school = schoolMatch ? schoolMatch[1] : "";
    let level = 1, tier = "未知";
    if (school) {
      if (SCHOOL_TIERS["985"].some(s => school.includes(s))) { level = 5; tier = "985"; }
      else if (SCHOOL_TIERS["211"].some(s => school.includes(s))) { level = 4; tier = "211"; }
      else if (SCHOOL_TIERS["双一流"].some(s => school.includes(s))) { level = 3; tier = "双一流"; }
      else if (/大学|学院/.test(school)) { level = 3; tier = "普通本科"; }
    }
    return { school, level, tier };
  },

  /** 抽取最高学历 */
  extractDegree(text) {
    if (/博士|博士研究生/.test(text)) return "博士";
    if (/硕士|研究生/.test(text)) return "硕士";
    if (/本科|学士/.test(text)) return "本科";
    if (/大专|专科/.test(text)) return "大专";
    return "";
  },

  degreeToLevel(text) {
    if (/博士/.test(text)) return 6;
    if (/硕士|研究生/.test(text)) return 5;
    if (/本科|学士/.test(text)) return 4;
    if (/大专|专科/.test(text)) return 3;
    return 1;
  },

  /** 抽取证书 */
  extractCerts(text) {
    const lower = text.toLowerCase();
    const found = [];
    for (const c of CERT_LIBRARY) {
      if (c.aliases.some(a => lower.includes(a.toLowerCase()))) found.push(c.name);
    }
    return found;
  },

  /** 项目含金量信号：数量 + 是否含技术栈/成果量化词 */
  scoreProjectRichness(text) {
    const projCount = this.countSections(text, ["项目经历", "项目经验", "项目："]);
    if (!projCount) return 0;
    const hasTech = /(hadoop|spark|python|sql|hive|mysql|echarts|机器学习|深度学习|爬虫|pandas|tensorflow|pytorch)/i.test(text);
    const hasResult = /(提升|优化|降低|增长|效率|准确率|万条|万级|%|\d+\.\d+|获奖|立项)/.test(text);
    let score = Math.min(3, projCount); // 数量 1-3
    if (hasTech) score += 2;            // 有硬技术栈
    if (hasResult) score += 2;          // 有成果量化
    return Math.min(10, score);
  },

  /** 实习含金量：数量 + 是否相关岗位 + 时长信号 */
  scoreInternRichness(text) {
    const count = this.countSections(text, ["实习", "工作经验", "工作经历"]);
    if (!count) return 0;
    const related = /(数据|分析|运营|开发|报表|etl|bi|数据库)/i.test(text);
    let score = Math.min(3, count);
    if (related) score += 3;
    return Math.min(10, score);
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
        // 收紧打分：命中 1-2 次为「了解」，多次 + 熟练语境才到「熟练」，避免虚高
        scores[std] = Math.min(88, 25 + hits * 6 + (expert ? 15 : 0));
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
