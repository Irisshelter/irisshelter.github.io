/* 功能级冒烟测试：加载 data/parser/scoring，用示例简历跑完整链路 */
const fs = require("fs");
const vm = require("vm");

const ctx = { module: { exports: {} }, console };
vm.createContext(ctx);
for (const f of ["js/data.js", "js/parser.js", "js/scoring.js"]) {
  vm.runInContext(fs.readFileSync(f, "utf8"), ctx, { filename: f });
}

const profile = vm.runInContext("ResumeParser.parse(DEMO_RESUME)", ctx);
console.log("=== 解析结果 ===");
console.log("姓名:", profile.name);
console.log("教育:", profile.education);
console.log("技能:", profile.skills.join(", "));
console.log("技能得分:", JSON.stringify(profile.skillScores));
console.log("项目条目:", profile.projects, "| 实习条目:", profile.internships, "| 字数:", profile.wordCount);

const result = vm.runInContext("Scoring.analyze(_p)", Object.assign(ctx, { _p: profile }));
console.log("\n=== 诊断结果 ===");
console.log("综合匹配分:", result.overall, "| 评级:", result.level, "| 超过:", result.rank + "%");
console.log("Top3 岗位:");
result.jobs.slice(0, 3).forEach(j =>
  console.log(`  ${j.name} [${j.city} ${j.salary}] 匹配 ${j.score}% | 命中: ${j.matched.join("/")} | 缺失: ${j.missing.join("/") || "无"}`));
console.log("缺失技能诊断:", result.gapsByJob.map(g => `${g.rank}.${g.name}(${g.label})`).join(" ") || "无");
console.log("雷达维度:", result.radarData.map(d => `${d.dim}:你${d.mine}/要求${d.req}`).join("  "));

// 边界测试：空简历 / 乱文本
const empty = vm.runInContext("ResumeParser.parse('太短了')", ctx);
console.log("\n=== 边界测试（短文本）===");
console.log("姓名:", empty.name, "| 技能数:", empty.skills.length, "| 不应报错: OK");
console.log("\nALL TESTS PASSED");
