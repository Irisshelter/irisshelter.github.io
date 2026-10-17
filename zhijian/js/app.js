/* ============================================================
 * app.js — 知简主应用逻辑
 * 视图路由 / 文件读取 / 解析流程 / ECharts 可视化 / 对话交互
 * ============================================================ */

(function () {
  "use strict";

  /* ---------------- 全局状态 ---------------- */
  const state = {
    profile: null,   // 解析后的结构化简历档案
    result: null,    // 匹配打分结果
    sourceText: "",  // 原始简历文本
    targetJobId: null // 用户手动选择的目标岗位 id（null = 用引擎推荐）
  };

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  /* ---------------- 视图路由 ---------------- */
  const VIEW_META = {
    upload: { title: "工作台", sub: "上传简历开始诊断" },
    report: { title: "诊断报告", sub: "" },
    agent:  { title: "智能问答", sub: "基于诊断结果的 Agent 对话" },
    market: { title: "数据市场", sub: "岗位趋势与技能热度" },
    parsing:{ title: "解析中", sub: "Agent 工作流执行" }
  };

  function switchView(name) {
    $$(".view").forEach(v => v.classList.remove("active"));
    const target = $("#view-" + name);
    if (target) target.classList.add("active");
    $$(".nav-item").forEach(a => {
      a.classList.toggle("active", a.dataset.view === name || (name === "parsing" && a.dataset.view === "upload"));
    });
    const meta = VIEW_META[name] || VIEW_META.upload;
    $("#viewTitle").textContent = meta.title;
    $("#viewSub").textContent = name === "report" && state.result
      ? (state.profile.name + " · " + (state.result.targetJob ? state.result.targetJob.name : "数据分析岗"))
      : meta.sub;
  }

  /* ---------------- Toast ---------------- */
  function toast(msg) {
    const t = document.createElement("div");
    t.className = "toast";
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2600);
  }

  /* ---------------- 文件读取 ---------------- */
  const uploadZone = $("#uploadZone");
  const fileInput = $("#fileInput");
  const pasteArea = $("#pasteArea");
  const btnAnalyze = $("#btnAnalyze");

  uploadZone.addEventListener("click", () => fileInput.click());
  uploadZone.addEventListener("keydown", (e) => { if (e.key === "Enter") fileInput.click(); });
  fileInput.addEventListener("change", () => {
    if (fileInput.files.length) readFile(fileInput.files[0]);
  });

  ["dragover", "dragenter"].forEach(ev =>
    uploadZone.addEventListener(ev, (e) => { e.preventDefault(); uploadZone.classList.add("dragover"); })
  );
  ["dragleave", "drop"].forEach(ev =>
    uploadZone.addEventListener(ev, (e) => { e.preventDefault(); uploadZone.classList.remove("dragover"); })
  );
  uploadZone.addEventListener("drop", (e) => {
    if (e.dataTransfer.files.length) readFile(e.dataTransfer.files[0]);
  });

  function readFile(file) {
    const name = file.name.toLowerCase();
    if (name.endsWith(".docx")) {
      toast("检测到 .docx，正在提取文本……");
      readDocx(file).then(txt => {
        pasteArea.value = txt;
        btnAnalyze.disabled = txt.trim().length < 20;
        toast("已提取简历文本，请确认后点击「开始智能诊断」");
      }).catch(() => toast("该 docx 无法在浏览器直接解析，请复制内容粘贴到文本框"));
      return;
    }
    if (!/\.(txt|md|text)$/.test(name)) {
      toast("暂不支持该格式，请使用 .txt / .md 或直接粘贴文本");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      pasteArea.value = reader.result;
      btnAnalyze.disabled = pasteArea.value.trim().length < 20;
      toast("简历已载入，点击「开始智能诊断」");
    };
    reader.readAsText(file, "utf-8");
  }

  /** docx 文本提取：解压 word/document.xml 并剥离标签 */
  function readDocx(file) {
    return file.arrayBuffer().then(buf => {
      // 按需加载 JSZip（依赖 loadScript，见 ECharts 区块的统一定义）
      return loadScript("https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js").then(() => {
        return JSZip.loadAsync(buf).then(zip => {
          const doc = zip.file("word/document.xml");
          if (!doc) throw new Error("no document.xml");
          return doc.async("string").then(xml => {
            const paras = xml.split(/<\/w:p>/);
            const lines = paras.map(p => {
              const ts = p.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [];
              return ts.map(t => t.replace(/<[^>]+>/g, "")).join("");
            }).filter(s => s.trim());
            return lines.join("\n");
          });
        });
      });
    });
  }

  function loadScript(src) {
    return new Promise((ok, err) => {
      if (window.JSZip) return ok();
      const s = document.createElement("script");
      s.src = src; s.onload = ok; s.onerror = err;
      document.head.appendChild(s);
    });
  }

  pasteArea.addEventListener("input", () => {
    btnAnalyze.disabled = pasteArea.value.trim().length < 20;
  });

  /* ---------------- 示例简历 ---------------- */
  $("#btnDemo").addEventListener("click", () => {
    pasteArea.value = DEMO_RESUME;
    btnAnalyze.disabled = false;
    toast("已载入示例简历，点击「开始智能诊断」体验完整流程");
  });

  /* ---------------- 解析流程 ---------------- */
  btnAnalyze.addEventListener("click", () => {
    const text = pasteArea.value.trim();
    if (text.length < 20) return toast("简历内容太短，请补充至 20 字以上");
    state.sourceText = text;
    runParsingFlow(text);
  });

  function runParsingFlow(text) {
    switchView("parsing");
    state.targetJobId = null; // 重置目标岗位选择
    const steps = $$("#parsingSteps li");
    steps.forEach(li => { li.className = ""; });

    const timeline = [
      { step: "extract", ms: 650 },
      { step: "normalize", ms: 1250 },
      { step: "match", ms: 1850 },
      { step: "render", ms: 2400 }
    ];
    timeline.forEach(({ step, ms }) => {
      const li = document.querySelector(`#parsingSteps li[data-step="${step}"]`);
      setTimeout(() => { if (li) li.className = "doing"; }, ms - 550);
    });

    setTimeout(() => {
      state.profile = ResumeParser.parse(text);
      state.result = Scoring.analyze(state.profile);
    }, 900);

    timeline.forEach(({ step, ms }) => {
      setTimeout(() => {
        const li = document.querySelector(`#parsingSteps li[data-step="${step}"]`);
        if (li) li.className = "done";
      }, ms);
    });

    setTimeout(() => {
      switchView("report");
      $("#btnExport").disabled = false;
      try {
        renderReport();
      } catch (err) {
        console.error("报告渲染异常:", err);
        toast("报告生成遇到问题，部分内容可能缺失");
      }
    }, 2900);
  }

  /* ---------------- 报告渲染 ---------------- */
  /** 获取当前目标岗位（支持用户自定义切换） */
  function getTargetJob() {
    const r = state.result;
    if (!r || !r.jobs.length) return null;
    // 用户手动选择了目标岗位时，以用户选择为准
    if (state.targetJobId) {
      const found = r.jobs.find(j => j.id === state.targetJobId);
      if (found) return found;
    }
    // 否则退回引擎推荐的最佳岗位
    return r.targetJob || r.jobs[0];
  }

  function renderReport() {
    const p = state.profile, r = state.result;
    const best = getTargetJob();

    // 若用户手动选择了目标岗位（不同于引擎推荐），重新计算该岗位的诊断维度
    if (state.targetJobId && best.id === state.targetJobId) {
      const rec = Scoring.recomputeForJob(p, best.id);
      r.dimensions = rec.dimensions;
      r.gates = rec.gates;
      r.gapsByJob = rec.gapsByJob;
      r.radarData = rec.radarData;
      r.overall = rec.overall;
      r.level = rec.level;
      r.rank = rec.rank;
      state.result.targetJob = best;
    }

    // 候选人卡
    $("#candidateCard").innerHTML = `
      <div class="candidate-avatar">${escapeHtml(p.name[0] || "求")}</div>
      <div>
        <div class="candidate-name">${escapeHtml(p.name)}</div>
        <div class="candidate-meta">${escapeHtml(p.education)} · ${escapeHtml(p.schoolTier || "")} · 技能 ${p.skills.length} 项 · 简历约 ${p.wordCount} 字</div>
      </div>
      <div class="candidate-spacer"></div>
      <span class="tag tag-purple"><i class="dot"></i>目标岗位：${escapeHtml(best.name)}</span>
      <span class="tag tag-green"><i class="dot"></i>竞争力评级：${r.level}</span>`;

    // 目标岗位选择器
    renderTargetChips(best);

    // 硬门槛诊断卡
    renderGateCard(p, best, r);

    // KPI
    const kpis = [
      { label: "综合匹配度", val: r.overall, sub: `超过 ${r.rank}% 的同岗位求职者`, cls: "up" },
      { label: "技能覆盖", val: `${best.matched.length} / ${Object.keys(best.skills).length}`, sub: "覆盖目标岗位要求技能", cls: "plain" },
      { label: "缺失技能", val: best.gapCount, sub: best.gapCount ? "建议优先补齐" : "无缺失，保持优势", cls: best.gapCount ? "warn" : "up" },
      { label: "可投递岗位", val: r.jobs.length, sub: "全部岗位已列出，适配度见旁", cls: "plain" }
    ];
    $("#kpiRow").innerHTML = kpis.map(k => `
      <div class="card kpi-card">
        <div class="kpi-label">${k.label}</div>
        <div class="kpi-value">${k.val}</div>
        <div class="kpi-sub ${k.cls}">${k.sub}</div>
      </div>`).join("");

    // 匹配明细
    const detail = [
      { name: "硬技能匹配", pct: pctOf(best, best.matched), cls: "" },
      { name: "加权覆盖", pct: best.score, cls: "green" },
      { name: "技能深度", pct: depthScore(p), cls: "amber" }
    ];
    $("#matchDetail").innerHTML = detail.map(d => `
      <div class="match-row">
        <span class="match-name">${d.name}</span>
        <span class="match-track"><span class="match-fill ${d.cls}" style="width:0%" data-w="${d.pct}"></span></span>
        <span class="match-val">${d.pct}%</span>
      </div>`).join("");
    requestAnimationFrame(() => {
      $$("#matchDetail .match-fill").forEach(el => { el.style.width = el.dataset.w + "%"; });
    });

    // 缺失技能诊断（三维：技能缺口 + 硬门槛 + 经历短板，含建议）
    const gapCatLabel = { skill: "技能", gate: "门槛", exp: "经历" };
    const gapCatCls = { skill: "gap-cat-skill", gate: "gap-cat-gate", exp: "gap-cat-exp" };
    $("#gapList").innerHTML = r.gapsByJob.length
      ? r.gapsByJob.map((g) => `
          <div class="gap-row">
            <span class="rank-badge rank-${Math.min(4, g.rank)}">${g.rank}</span>
            <div class="gap-info">
              <div class="gap-top">
                <span class="gap-cat ${gapCatCls[g.cat] || "gap-cat-skill"}">${gapCatLabel[g.cat] || "技能"}</span>
                <span class="gap-name">${escapeHtml(g.name)}</span>
                <span class="gap-spacer"></span>
                <span class="gap-level ${g.level}">${g.label}</span>
              </div>
              ${g.tip ? `<div class="gap-tip">${escapeHtml(g.tip)}</div>` : ""}
            </div>
          </div>`).join("")
      : `<div class="gap-row"><span class="gap-name" style="color:var(--green-deep)">技能全面覆盖目标岗位要求，继续保持！</span></div>`;

    // 投递建议（全部岗位，适配度标注在旁）
    $("#jobList").innerHTML = r.jobs.map(j => {
      const cls = j.score >= 75 ? "mb-green" : (j.score >= 65 ? "mb-amber" : "mb-amber");
      return `
        <div class="job-row">
          <span class="match-badge ${cls}">${j.score}%</span>
          <div class="job-info">
            <div class="job-name">${escapeHtml(j.name)}${j.isStretch ? " <span class='stretch-tag'>冲刺岗</span>" : ""}</div>
            <div class="job-meta">${escapeHtml(j.city)} · ${escapeHtml(j.salary)} · ${escapeHtml(j.notes)}</div>
          </div>
        </div>`;
    }).join("");

    // 图表：优先 ECharts（多 CDN），失败降级为自绘 SVG
    renderCharts();

    // KPI 数字滚动动画
    animateNumbers();

    // Agent 侧栏
    renderAgentProfile();
  }

  /** 目标岗位选择器：chips 形式，点击切换目标岗位 */
  function renderTargetChips(best) {
    const el = $("#targetChips");
    if (!el || !state.result) return;
    const jobs = state.result.jobs;
    el.innerHTML = jobs.map(j => {
      const active = j.id === best.id;
      return `<button class="target-chip ${active ? "active" : ""}" data-job-id="${j.id}">
        <span class="target-chip-name">${escapeHtml(j.name)}</span>
        <span class="target-chip-score">${j.score}%</span>
        ${j.isStretch ? "<span class='target-chip-stretch'>冲刺</span>" : ""}
      </button>`;
    }).join("");

    // 点击切换目标岗位
    $$("#targetChips .target-chip").forEach(btn => {
      btn.addEventListener("click", () => {
        state.targetJobId = btn.dataset.jobId;
        // 重新渲染报告（目标岗位变化，匹配度/雷达/缺口/门槛都重算）
        renderReport();
        // 若市场页已有数据，同步刷新梯队推荐企业 + 摘要 + 全部可投企业表格（随目标岗位联动）
        if (!$("#marketContent").hidden) {
          renderTierCompanies();
          renderMarketSummary();
          // 联动：重置二次筛选 + 分页，让「全部可投企业」展示新目标岗位的初筛对口企业
          companyFilterState.cat = "";
          companyFilterState.kw = "";
          companyPage = 0;
          const catSel = document.getElementById("filterCat");
          if (catSel) catSel.value = "";
          const search = document.getElementById("companySearch");
          if (search) search.value = "";
          renderAllCompanies();
        }
        // 滚动到报告顶部，让用户看到变化
        window.scrollTo({ top: 0, behavior: "smooth" });
        toast("已切换到目标岗位：" + (state.result.jobs.find(j => j.id === state.targetJobId)?.name || ""));
      });
    });
  }

  /** 硬门槛诊断卡：让用户看清被 HR 卡在哪 */
  function renderGateCard(p, best, r) {
    const el = $("#gateCard");
    if (!el) return;
    const gate = best.gate;
    const reasons = r.gates || [];
    const pass = gate ? gate.pass : true;
    const chips = [
      { label: "院校", value: `${p.schoolTier || "未知"}`, ok: (p.schoolLevel || 1) >= 3 },
      { label: "学历", value: `${p.degree || "未识别"}`, ok: (p.degreeLevel || 1) >= 4 },
      { label: "证书", value: (p.certs || []).length ? `${p.certs.length} 项` : "无", ok: (p.certs || []).length > 0 },
      { label: "项目", value: `${p.projects || 0} 个`, ok: (p.projects || 0) >= 1 },
      { label: "实习", value: `${p.internships || 0} 段`, ok: (p.internships || 0) >= 1 }
    ];
    el.innerHTML = `
      <div class="card-head">
        <div><h3>硬门槛体检</h3><p class="card-sub">模拟 HR 初筛：学历院校、证书、经历是否踩线</p></div>
        <span class="tag ${pass ? "tag-green" : "tag-warn"}"><i class="dot"></i>${pass ? "门槛达标" : "存在风险"}</span>
      </div>
      <div class="gate-chips">${chips.map(c => `
        <div class="gate-chip ${c.ok ? "ok" : "risk"}">
          <span class="gate-chip-label">${c.label}</span>
          <span class="gate-chip-value">${escapeHtml(c.value)}</span>
        </div>`).join("")}
      </div>
      ${reasons.length ? `<div class="gate-notes">${reasons.map(r => `<div class="gate-note">⚠ ${escapeHtml(r)}</div>`).join("")}</div>` : ""}`;
  }

  /** KPI 数字从 0 缓动滚动到目标值（支持纯数字与「a / b」格式） */
  function animateNumbers() {
    $$("#kpiRow .kpi-value").forEach(el => {
      const text = el.textContent.trim();
      if (/^\d+\s*\/\s*\d+$/.test(text)) {
        const [a, b] = text.split("/").map(s => parseInt(s, 10));
        rollNumber(el, a, "/ " + b);
      } else if (/^\d+$/.test(text)) {
        rollNumber(el, parseInt(text, 10));
      }
    });
  }

  function rollNumber(el, target, suffix) {
    suffix = suffix || "";
    const dur = 900;
    const start = performance.now();
    function frame(now) {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = Math.round(eased * target) + suffix;
      if (t < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  function renderCharts() {
    ensureECharts().then(ok => {
      echartsReady = ok;
      chartLibLoaded = true;
      if (ok) {
        renderDimRadar();
        renderRadar();
        renderGauge();
      } else {
        svgDimRadar();
        svgRadar();
        svgGauge();
      }
      const apiEl = document.querySelector("#apiStatus .status-text");
      if (apiEl) apiEl.textContent = ok ? "可视化引擎就绪" : "轻量图表模式";
    });
  }

  /** 六维能力雷达：技能/院校/项目/实习/证书/潜力 */
  const DIM_LABELS = {
    skills: "技能匹配",
    school: "学历院校",
    project: "项目含金量",
    intern: "实习经历",
    cert: "证书",
    potential: "综合潜力"
  };

  function dimRadarData() {
    const dims = state.result.dimensions;
    return Object.keys(DIM_LABELS).map(k => ({
      dim: DIM_LABELS[k],
      mine: dims[k] || 0,
      target: 70 // 目标线：模拟合格线
    }));
  }

  function renderDimRadar() {
    const chart = getChart("dimRadarChart");
    if (!chart) return;
    const dims = dimRadarData();
    chart.setOption({
      color: [BRAND],
      tooltip: {},
      radar: {
        indicator: dims.map(d => ({ name: d.dim, max: 100 })),
        radius: "62%",
        splitNumber: 4,
        axisName: { color: "#9AA3B8", fontSize: 12 },
        splitLine: { lineStyle: { color: "rgba(255,255,255,.08)" } },
        splitArea: { areaStyle: { color: ["rgba(255,255,255,0)", "rgba(255,255,255,.03)"] } },
        axisLine: { lineStyle: { color: "rgba(255,255,255,.08)" } }
      },
      series: [{
        type: "radar",
        symbolSize: 5,
        data: [
          {
            value: dims.map(d => d.target),
            name: "合格线",
            lineStyle: { color: "rgba(154,163,184,.5)", width: 1.5, type: "dashed" },
            itemStyle: { color: "rgba(154,163,184,.5)" },
            areaStyle: { color: "rgba(154,163,184,.06)" }
          },
          {
            value: dims.map(d => d.mine),
            name: "你的得分",
            lineStyle: { color: BRAND, width: 2.5 },
            itemStyle: { color: BRAND },
            areaStyle: {
              color: {
                type: "linear", x: 0, y: 0, x2: 1, y2: 1,
                colorStops: [
                  { offset: 0, color: "rgba(124,108,255,0.5)" },
                  { offset: 1, color: "rgba(168,85,247,0.32)" }
                ]
              }
            }
          }
        ]
      }]
    });
  }

  function svgDimRadar() {
    const el = document.getElementById("dimRadarChart");
    if (!el) return;
    const dims = dimRadarData();
    const cx = 280, cy = 140, R = 92, N = dims.length;
    const pt = (i, r) => {
      const ang = -Math.PI / 2 + i * 2 * Math.PI / N;
      return [cx + r * Math.cos(ang), cy + r * Math.sin(ang)];
    };
    const ring = (r) => dims.map((_, i) => pt(i, r).map(v => v.toFixed(1)).join(",")).join(" ");
    const poly = (key) => dims.map((d, i) => pt(i, Math.max(4, d[key]) / 100 * R).map(v => v.toFixed(1)).join(",")).join(" ");
    let grid = "";
    for (let k = 1; k <= 4; k++) {
      grid += `<polygon points="${ring(R * k / 4)}" fill="${k % 2 ? "rgba(255,255,255,0)" : "rgba(255,255,255,.03)"}" stroke="rgba(255,255,255,.08)" stroke-width="1"/>`;
    }
    const axes = dims.map((_, i) => {
      const [x, y] = pt(i, R);
      return `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="rgba(255,255,255,.08)" stroke-width="1"/>`;
    }).join("");
    const labels = dims.map((d, i) => {
      const [x, y] = pt(i, R + 24);
      return `<text x="${x.toFixed(1)}" y="${(y + 4).toFixed(1)}" text-anchor="middle" font-size="12.5" fill="#9AA3B8" font-weight="500">${escapeHtml(d.dim)}</text>`;
    }).join("");
    el.innerHTML = `<svg viewBox="0 0 560 280" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
      <defs><linearGradient id="svgDimRadarGrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="rgba(99,91,255,.45)"/><stop offset="1" stop-color="rgba(139,92,246,.28)"/>
      </linearGradient></defs>
      ${grid}${axes}
      <polygon points="${poly("target")}" fill="rgba(180,185,245,.10)" stroke="#B4B9F5" stroke-width="1.5" stroke-dasharray="5 4"/>
      <polygon points="${poly("mine")}" fill="url(#svgDimRadarGrad)" stroke="#635BFF" stroke-width="2.5" stroke-linejoin="round"/>
      ${labels}</svg>`;
  }

  function pctOf(job, matched) {
    const keys = Object.keys(job.skills);
    const matchedW = matched.reduce((s, k) => s + (job.skills[k] || 0), 0);
    const totalW = keys.reduce((s, k) => s + job.skills[k], 0);
    return totalW ? Math.round(matchedW / totalW * 100) : 0;
  }

  function depthScore(p) {
    const scores = Object.values(p.skillScores || {});
    if (!scores.length) return 0;
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    return Math.round(avg);
  }

  /* ---------------- ECharts：多 CDN 加载 + SVG 降级 ---------------- */
  const ECHARTS_CDNS = [
    "https://cdn.jsdelivr.net/npm/echarts@5.5.0/dist/echarts.min.js",
    "https://unpkg.com/echarts@5.5.0/dist/echarts.min.js",
    "https://cdnjs.cloudflare.com/ajax/libs/echarts/5.5.0/echarts.min.js"
  ];

  /** 依次尝试 CDN；全部失败返回 false（图表降级为 SVG 渲染） */
  function ensureECharts(idx) {
    idx = idx || 0;
    if (window.echarts) return Promise.resolve(true);
    if (idx >= ECHARTS_CDNS.length) return Promise.resolve(false);
    return loadScript(ECHARTS_CDNS[idx])
      .then(() => window.echarts ? ensureECharts(ECHARTS_CDNS.length) : ensureECharts(idx + 1))
      .catch(() => ensureECharts(idx + 1));
  }

  const BRAND = "#7C6CFF";
  const BRAND2 = "#A855F7";
  const chartInstances = {};
  let echartsReady = false;   // 是否有 ECharts 可用
  let chartLibLoaded = false; // 是否已尝试加载

  function getChart(id) {
    if (!window.echarts) return null;
    const el = document.getElementById(id);
    if (!el) return null;
    if (!chartInstances[id]) chartInstances[id] = echarts.init(el);
    chartInstances[id].resize();
    return chartInstances[id];
  }

  function renderRadar() {
    const chart = getChart("radarChart");
    if (!chart) return;
    const dims = state.result.radarData;
    chart.setOption({
      color: [BRAND],
      tooltip: {},
      radar: {
        indicator: dims.map(d => ({ name: d.dim, max: 100 })),
        radius: "62%",
        splitNumber: 4,
        axisName: { color: "#9AA3B8", fontSize: 12 },
        splitLine: { lineStyle: { color: "rgba(255,255,255,.08)" } },
        splitArea: { areaStyle: { color: ["rgba(255,255,255,0)", "rgba(255,255,255,.03)"] } },
        axisLine: { lineStyle: { color: "rgba(255,255,255,.08)" } }
      },
      series: [{
        type: "radar",
        symbolSize: 5,
        data: [
          {
            value: dims.map(d => d.req),
            name: "岗位要求",
            lineStyle: { color: "rgba(154,163,184,.5)", width: 1.5, type: "dashed" },
            itemStyle: { color: "rgba(154,163,184,.5)" },
            areaStyle: { color: "rgba(154,163,184,.06)" }
          },
          {
            value: dims.map(d => d.mine),
            name: "你的技能",
            lineStyle: { color: BRAND, width: 2.5 },
            itemStyle: { color: BRAND },
            areaStyle: {
              color: {
                type: "linear", x: 0, y: 0, x2: 1, y2: 1,
                colorStops: [
                  { offset: 0, color: "rgba(124,108,255,0.5)" },
                  { offset: 1, color: "rgba(168,85,247,0.32)" }
                ]
              }
            }
          }
        ]
      }]
    });
  }

  function renderGauge() {
    const chart = getChart("gaugeChart");
    if (!chart) return;
    const score = state.result.overall;
    chart.setOption({
      series: [{
        type: "gauge",
        startAngle: 210, endAngle: -30,
        min: 0, max: 100,
        radius: "88%",
        progress: {
          show: true, width: 18,
          itemStyle: {
            color: {
              type: "linear", x: 0, y: 0, x2: 1, y2: 1,
              colorStops: [{ offset: 0, color: BRAND }, { offset: 1, color: BRAND2 }]
            }
          }
        },
        axisLine: { lineStyle: { width: 18, color: [[1, "rgba(255,255,255,.07)"]] } },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: { show: false },
        pointer: { show: false },
        anchor: { show: false },
        title: { show: true, offsetCenter: [0, "34%"], fontSize: 13, color: "#9AA3B8" },
        detail: {
          valueAnimation: true,
          offsetCenter: [0, "-6%"],
          fontSize: 46, fontWeight: 600, color: "#E8EAF2",
          fontFamily: "Inter, system-ui"
        },
        data: [{ value: score, name: "综合匹配分" }]
      }]
    });
  }

  /* ---------------- SVG 降级渲染（零依赖） ---------------- */

  function svgRadar() {
    const el = document.getElementById("radarChart");
    if (!el) return;
    const dims = state.result.radarData;
    const cx = 280, cy = 140, R = 92, N = dims.length;
    const pt = (i, r) => {
      const ang = -Math.PI / 2 + i * 2 * Math.PI / N;
      return [cx + r * Math.cos(ang), cy + r * Math.sin(ang)];
    };
    const ring = (r) => dims.map((_, i) => pt(i, r).map(v => v.toFixed(1)).join(",")).join(" ");
    const poly = (key) => dims.map((d, i) => pt(i, Math.max(4, d[key]) / 100 * R).map(v => v.toFixed(1)).join(",")).join(" ");
    let grid = "";
    for (let k = 1; k <= 4; k++) {
      grid += `<polygon points="${ring(R * k / 4)}" fill="${k % 2 ? "rgba(255,255,255,0)" : "rgba(255,255,255,.03)"}" stroke="rgba(255,255,255,.08)" stroke-width="1"/>`;
    }
    const axes = dims.map((_, i) => {
      const [x, y] = pt(i, R);
      return `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="rgba(255,255,255,.08)" stroke-width="1"/>`;
    }).join("");
    const labels = dims.map((d, i) => {
      const [x, y] = pt(i, R + 24);
      return `<text x="${x.toFixed(1)}" y="${(y + 4).toFixed(1)}" text-anchor="middle" font-size="12.5" fill="#9AA3B8" font-weight="500">${escapeHtml(d.dim)}</text>`;
    }).join("");
    el.innerHTML = `<svg viewBox="0 0 560 280" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
      <defs><linearGradient id="svgRadarGrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="rgba(99,91,255,.45)"/><stop offset="1" stop-color="rgba(139,92,246,.28)"/>
      </linearGradient></defs>
      ${grid}${axes}
      <polygon points="${poly("req")}" fill="rgba(180,185,245,.14)" stroke="#B4B9F5" stroke-width="1.5" stroke-dasharray="5 4"/>
      <polygon points="${poly("mine")}" fill="url(#svgRadarGrad)" stroke="#635BFF" stroke-width="2.5" stroke-linejoin="round"/>
      ${labels}</svg>`;
  }

  function svgGauge() {
    const el = document.getElementById("gaugeChart");
    if (!el) return;
    const score = state.result.overall;
    const r = 84, c = 2 * Math.PI * r;
    const dash = c * score / 100;
    el.innerHTML = `<svg viewBox="0 0 560 280" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
      <defs><linearGradient id="svgGaugeGrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#635BFF"/><stop offset="1" stop-color="#8B5CF6"/>
      </linearGradient></defs>
      <circle cx="280" cy="140" r="${r}" stroke="rgba(255,255,255,.07)" stroke-width="18" fill="none"/>
      <circle cx="280" cy="140" r="${r}" stroke="url(#svgGaugeGrad)" stroke-width="18" fill="none"
        stroke-linecap="round" stroke-dasharray="${dash.toFixed(1)} ${c.toFixed(1)}"
        transform="rotate(-90 280 140)" style="transition:stroke-dasharray 1s ease"/>
      <text x="280" y="148" text-anchor="middle" font-size="46" font-weight="600" fill="#E8EAF2"
        font-family="Inter,system-ui" style="letter-spacing:-1px">${score}</text>
      <text x="280" y="178" text-anchor="middle" font-size="13" fill="#9AA3B8">综合匹配分</text>
    </svg>`;
  }

  function renderMarket() {
    // 个性化行情：需要先有诊断结果
    if (!state.result) {
      $("#marketEmpty").hidden = false;
      $("#marketContent").hidden = true;
      return;
    }
    $("#marketEmpty").hidden = true;
    $("#marketContent").hidden = false;
    renderMarketSummary();
    renderMyCharts();
  }

  /** 市场顶部摘要卡 */
  function renderMarketSummary() {
    const r = state.result;
    const all = r.jobs;
    const steady = all.filter(j => !j.isStretch && j.score >= 65);
    const grow = all.filter(j => !j.isStretch && j.score >= 55 && j.score < 65);
    const stretch = all.filter(j => j.isStretch);
    const salaryList = all.map(j => salaryRange(j));
    const lowK = Math.min(...salaryList.map(s => s.low));
    const highK = Math.max(...salaryList.map(s => s.high));
    $("#marketSummary").innerHTML = `
      <div class="ms-item">
        <div class="ms-label">可投递岗位</div>
        <div class="ms-value">${all.length} 个</div>
        <div class="ms-sub">全部岗位已列出，适配度标注在旁</div>
      </div>
      <div class="ms-item">
        <div class="ms-label">现实薪资带</div>
        <div class="ms-value">${lowK}-${highK}K</div>
        <div class="ms-sub">稳健 ${steady.length} · 需补强 ${grow.length} · 冲刺 ${stretch.length}</div>
      </div>
      <div class="ms-item">
        <div class="ms-label">稳健可投</div>
        <div class="ms-value">${steady.length} 个</div>
        <div class="ms-sub">门槛达标，可直接投递</div>
      </div>
      <div class="ms-item">
        <div class="ms-label">综合竞争力</div>
        <div class="ms-value">${r.overall} 分</div>
        <div class="ms-sub">约超过 ${r.rank}% 同岗位求职者</div>
      </div>`;
  }

  /** 个性化图表渲染（ECharts + SVG 降级） */
  function renderMyCharts() {
    ensureECharts().then(ok => {
      if (ok) {
        renderMySalary();
        renderMyTier();
        renderMyGap();
      } else {
        svgMySalary();
        svgMyTier();
        svgMyGap();
      }
    });
    renderTierCompanies();
    renderAllCompanies();
  }

  /** 薪资区间：可投递岗位的薪资跨度 */
  function salaryRange(job) {
    const m = job.salary.match(/(\d+)-(\d+)/);
    if (m) return { low: +m[1], high: +m[2] };
    const s = parseInt(job.salary, 10);
    return { low: s || 0, high: s || 0 };
  }

  function renderMySalary() {
    const chart = getChart("mySalaryChart");
    if (!chart) return;
    const r = state.result;

    // 按匹配度从高到低排序，稳健(绿)在前、冲刺(橙)在后，逐岗位薪资带更易读
    const jobs = [...r.jobs].sort((a, b) => {
      if (a.isStretch !== b.isStretch) return a.isStretch ? 1 : -1;
      return b.score - a.score;
    });
    const cats = jobs.map(j => j.name.replace(/（.*?）/, "").replace(/[（(].*?[)）]/g, "").trim());

    // 薪资端点范围（用于坐标轴）
    const lows = jobs.map(j => salaryRange(j).low);
    const highs = jobs.map(j => salaryRange(j).high);
    const axisMax = Math.max(...highs, 30);

    // 中位数参考线
    const mid = Math.round((Math.min(...lows) + Math.max(...highs)) / 2);

    chart.setOption({
      tooltip: {
        trigger: "item",
        confine: true,
        backgroundColor: "rgba(23,27,46,.95)",
        borderColor: "rgba(255,255,255,.12)",
        textStyle: { color: "#E8EAF2", fontSize: 12 },
        formatter: function (p) {
          const j = jobs[p.dataIndex];
          const rg = salaryRange(j);
          return `${j.name}<br/>薪资带：<b>${rg.low}K - ${rg.high}K</b><br/>匹配度：${j.score}%${j.isStretch ? "<br/>⚠ 冲刺岗（硬门槛未达标）" : ""}`;
        }
      },
      grid: { left: 128, right: 70, top: 14, bottom: 28 },
      xAxis: {
        type: "value", min: 0, max: axisMax,
        splitLine: { lineStyle: { color: "rgba(255,255,255,.07)" } },
        axisLabel: { formatter: "{value}K", color: "#9AA3B8" },
        axisLine: { lineStyle: { color: "rgba(255,255,255,.1)" } }
      },
      yAxis: {
        type: "category", data: cats,
        axisLine: { show: false }, axisTick: { show: false },
        axisLabel: { color: "#E8EAF2", fontSize: 12, width: 118, overflow: "truncate" }
      },
      series: [{
        type: "custom",
        encode: { x: [0, 1], y: 2 },
        data: jobs.map((j, i) => {
          const rg = salaryRange(j);
          return [rg.low, rg.high, i];
        }),
        renderItem: function (params, api) {
          const i = api.value(2);
          const low = api.coord([api.value(0), i]);
          const high = api.coord([api.value(1), i]);
          const isStretch = jobs[i].isStretch;
          const color = isStretch ? "#F59E0B" : "#10B981";
          const barH = 16;
          const y = low[1] - barH / 2;
          const w = Math.max(10, high[0] - low[0]);
          return {
            type: "group",
            children: [
              // 背景轨道
              { type: "rect", shape: { x: api.coord([0, i])[0], y: y, width: api.coord([axisMax, 0])[0] - api.coord([0, 0])[0], height: barH, r: 8 }, style: { fill: "rgba(255,255,255,.05)" } },
              // 薪资带主体（带渐变感：两端圆角）
              { type: "rect", shape: { x: low[0], y: y, width: w, height: barH, r: 8 }, style: { fill: color, opacity: isStretch ? 0.75 : 0.92 } },
              // 起始点
              { type: "circle", shape: { cx: low[0], cy: low[1], r: 4 }, style: { fill: "#0B0E1A", stroke: color, lineWidth: 2 } },
              // 终点
              { type: "circle", shape: { cx: high[0], cy: high[1], r: 4 }, style: { fill: "#0B0E1A", stroke: color, lineWidth: 2 } },
              // 右侧数值标签
              { type: "text", style: { x: high[0] + 8, y: low[1] - 5, text: `${api.value(0)}-${api.value(1)}K`, fill: color, fontSize: 11, fontFamily: "monospace" } }
            ]
          };
        },
        // 中位数参考线
        markLine: {
          silent: true, symbol: "none",
          lineStyle: { color: "#7C6CFF", type: "dashed", width: 1 },
          label: { formatter: "中位 " + mid + "K", color: "#7C6CFF", fontSize: 11, position: "insideEndTop" },
          data: [{ xAxis: mid }]
        }
      }]
    });
  }

  function svgMySalary() {
    const el = document.getElementById("mySalaryChart");
    if (!el) return;
    const r = state.result;
    const jobs = [...r.jobs].sort((a, b) => {
      if (a.isStretch !== b.isStretch) return a.isStretch ? 1 : -1;
      return b.score - a.score;
    });
    const rows = jobs.slice(0, 10);
    const max = Math.max(...rows.map(j => salaryRange(j).high), 30);
    el.innerHTML = `<div style="padding:12px 8px;display:flex;flex-direction:column;gap:10px;height:100%;justify-content:center">` +
      rows.map(j => {
        const rg = salaryRange(j);
        const isStretch = j.isStretch;
        const color = isStretch ? "#F59E0B" : "#10B981";
        return `<div style="display:flex;align-items:center;gap:10px">
          <span style="width:118px;font-size:12px;color:#E8EAF2;flex-shrink:0;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(j.name.replace(/（.*?）/, ""))}${isStretch ? " ⚡" : ""}</span>
          <span style="flex:1;height:16px;background:rgba(255,255,255,.05);border-radius:8px;overflow:visible;position:relative">
            <span style="position:absolute;left:${(rg.low / max * 100).toFixed(1)}%;width:${Math.max(2, ((rg.high - rg.low) / max * 100)).toFixed(1)}%;height:100%;background:${color};opacity:${isStretch ? 0.75 : 0.92};border-radius:8px"></span>
          </span>
          <span style="width:60px;font-size:12px;color:${color};font-variant-numeric:tabular-nums;text-align:right">${rg.low}-${rg.high}K</span>
        </div>`;
      }).join("") + `</div>`;
  }

  /** 竞争梯队：稳健岗/冲刺岗/需补强 */
  function renderMyTier() {
    const chart = getChart("myTierChart");
    if (!chart) return;
    const r = state.result;
    const steady = r.jobs.filter(j => !j.isStretch && j.score >= 65).length;
    const grow = r.jobs.filter(j => !j.isStretch && j.score >= 55 && j.score < 65).length;
    const stretch = r.jobs.filter(j => j.isStretch).length;
    chart.setOption({
      tooltip: { trigger: "item" },
      legend: { bottom: 0, textStyle: { color: "#9AA3B8" } },
      series: [{
        type: "pie",
        radius: ["45%", "70%"],
        itemStyle: { borderRadius: 8, borderColor: "transparent", borderWidth: 2 },
        label: { show: true, formatter: "{b}\n{c}", color: "#E8EAF2" },
        data: [
          { name: "稳健岗", value: steady, itemStyle: { color: "#10B981" } },
          { name: "需补强", value: grow, itemStyle: { color: "#22D3EE" } },
          { name: "冲刺岗", value: stretch, itemStyle: { color: "#F59E0B" } }
        ]
      }]
    });
  }

  function svgMyTier() {
    const el = document.getElementById("myTierChart");
    if (!el) return;
    const r = state.result;
    const steady = r.jobs.filter(j => !j.isStretch && j.score >= 65).length;
    const grow = r.jobs.filter(j => !j.isStretch && j.score >= 55 && j.score < 65).length;
    const stretch = r.jobs.filter(j => j.isStretch).length;
    const total = Math.max(1, steady + grow + stretch);
    el.innerHTML = `<div style="padding:16px;display:flex;flex-direction:column;gap:14px;height:100%;justify-content:center">
      ${[
        { n: "稳健岗", v: steady, c: "#10B981" },
        { n: "需补强", v: grow, c: "#635BFF" },
        { n: "冲刺岗", v: stretch, c: "#F59E0B" }
      ].map(t => `
        <div style="display:flex;align-items:center;gap:10px">
          <span style="width:60px;font-size:12px;color:#E8EAF2">${t.n}</span>
          <span style="flex:1;height:14px;background:rgba(255,255,255,.07);border-radius:7px;overflow:hidden">
            <span style="display:block;height:100%;width:${(t.v / total * 100).toFixed(1)}%;background:${t.c};border-radius:7px"></span>
          </span>
          <span style="width:30px;font-size:12px;color:#9AA3B8;text-align:right">${t.v}</span>
        </div>`).join("")}
      <p style="font-size:12px;color:#9AA3B8;text-align:center">冲刺岗 = 硬门槛未达标，需学历/院校/项目背书提升</p></div>`;
  }

  /** 技能缺口对薪资影响 */
  function renderMyGap() {
    const chart = getChart("myGapChart");
    if (!chart) return;
    const r = state.result;
    const gaps = r.gapsByJob.slice(0, 5);
    if (!gaps.length) { chart.clear(); return; }
    chart.setOption({
      tooltip: {},
      grid: { left: 80, right: 40, top: 10, bottom: 24 },
      xAxis: { type: "value", max: 5, splitLine: { show: false }, axisLabel: { show: false } },
      yAxis: { type: "category", data: gaps.map(g => g.name).reverse(), axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: "#9AA3B8", fontSize: 12 } },
      series: [{
        type: "bar", barWidth: 14,
        data: gaps.map(g => g.weight).reverse(),
        itemStyle: { borderRadius: 7, color: BRAND2 },
        label: { show: true, position: "right", color: "#64748B", formatter: "权重{c}/5" }
      }]
    });
  }

  function svgMyGap() {
    const el = document.getElementById("myGapChart");
    if (!el) return;
    const r = state.result;
    const gaps = r.gapsByJob.slice(0, 5);
    const max = 5;
    el.innerHTML = `<div style="padding:12px 8px;display:flex;flex-direction:column;gap:11px;height:100%;justify-content:center">` +
      gaps.map(g => `
        <div style="display:flex;align-items:center;gap:12px">
          <span style="width:70px;font-size:12.5px;color:#E8EAF2;flex-shrink:0;text-align:right">${escapeHtml(g.name)}</span>
          <span style="flex:1;height:14px;background:rgba(255,255,255,.07);border-radius:7px;overflow:hidden">
            <span style="display:block;height:100%;width:${(g.weight / max * 100).toFixed(1)}%;border-radius:7px;background:linear-gradient(90deg,#8B5CF6,#A855F7)"></span>
          </span>
          <span style="width:44px;font-size:12.5px;color:#9AA3B8">${g.weight}/5</span>
        </div>`).join("") + `</div>`;
  }

  /** 企业类型徽章 class */
  function companyTypeCls(type) {
    if (!type) return "type-minqi";
    if (type.includes("国企") || type.includes("事业")) return "type-guoqi";
    if (type.includes("外企") || type.includes("合资")) return "type-waiqi";
    return "type-minqi";
  }

  /**
   * 提取企业的岗位标签（用于展示/筛选）
   * 数据字段已从 dirs 改为 jobs（岗位原文数组），这里统一读取，
   * 返回简短的方向标签（截断过长岗位名）。
   */
  function companyDirs(c) {
    const raw = (typeof getCompanyDirs !== "undefined" ? getCompanyDirs(c) : (c.jobs || c.dirs || []));
    return raw.map(j => String(j).replace(/[（(].*?[)）]/g, "").trim().slice(0, 12)).filter(Boolean);
  }

  /** 单个企业行的 HTML（含规模、类型、状态、链接） */
  function companyRowHtml(c) {
    const typeCls = companyTypeCls(c.type);
    const statusCls = c.status === "在招" ? "status-open" : "status-closed";
    const sizeCls = c.size === "大厂" ? "size-big" : c.size === "中厂" ? "size-mid" : "size-small";
    const linkHtml = c.link
      ? `<a class="company-link" href="${safeUrl(c.link)}" target="_blank" rel="noopener noreferrer">投递 ↗</a>`
      : `<span class="company-nolink">${c.status === "已截止" ? "已截止" : "暂无公开链接"}</span>`;
    return `<div class="company-row">
      <span class="company-name">${escapeHtml(c.name)}</span>
      <span class="company-size ${sizeCls}">${escapeHtml(c.size || "")}</span>
      <span class="company-type ${typeCls}">${escapeHtml(c.type)}</span>
      <span class="company-status ${statusCls}">${escapeHtml(c.status)}</span>
      ${linkHtml}
    </div>`;
  }

  /** 判断岗位所属梯队：稳健 / 补强 / 冲刺 */
  function tierOf(job) {
    if (job.isStretch) return "stretch";
    if (job.score >= 65) return "steady";
    return "grow";
  }

  /**
   * 梯队推荐企业：围绕当前「目标岗位」推荐对口企业，
   * 按稳健/补强/冲刺三梯队，横向滚轮蒙版展示（不占纵向空间）。
   * 切换目标岗位时自动更新。
   */
  function renderTierCompanies() {
    const el = document.getElementById("tierCompanies");
    if (!el || !state.result) return;
    const best = getTargetJob();
    const jobs = state.result.jobs;

    // 目标岗位的对口企业
    const targetCompanies = best.companies || [];
    // 按梯队分组岗位
    const tiers = { steady: [], grow: [], stretch: [] };
    jobs.forEach(j => { tiers[tierOf(j)].push(j); });

    const tierMeta = [
      { key: "steady", title: "稳健可投", sub: "门槛达标、匹配度高，优先投递", color: "var(--green)", dot: "dot-steady" },
      { key: "grow", title: "需补强", sub: "补齐少量技能即可冲刺", color: "#22D3EE", dot: "dot-grow" },
      { key: "stretch", title: "冲刺岗", sub: "硬门槛未达标，需学历/项目背书", color: "var(--amber)", dot: "dot-stretch" }
    ];

    // 目标岗位对口企业滚轮（置顶）
    const focusCarousel = `
      <div class="tier-focus">
        <div class="tier-focus-head">
          <span class="tier-focus-job">${escapeHtml(best.name)}</span>
          <span class="match-badge mb-amber">${best.score}%</span>
          <span class="tier-focus-note">当前目标岗位 · 对口企业 ${targetCompanies.length} 家</span>
        </div>
        <div class="tier-carousel">
          ${targetCompanies.map(c => companyCardHtml(c)).join("") || `<div class="company-empty">该岗位暂无公开对口企业</div>`}
        </div>
      </div>`;

    // 三梯队滚轮
    const tierBlocks = tierMeta.map(tm => {
      const tierJobs = tiers[tm.key];
      if (!tierJobs.length) return "";
      const seen = new Set();
      const companies = [];
      tierJobs.forEach(j => {
        (j.companies || []).forEach(c => {
          if (!seen.has(c.name)) { seen.add(c.name); companies.push({ ...c, _job: j.name }); }
        });
      });
      return `<div class="tier-block">
        <div class="tier-block-head">
          <span class="dot ${tm.dot}"></span>
          <span class="tier-block-title" style="color:${tm.color}">${tm.title}</span>
          <span class="tier-block-count">${tierJobs.length} 岗位 · ${companies.length} 家企业</span>
          <span class="tier-block-sub">${tm.sub}</span>
        </div>
        <div class="tier-carousel">
          ${companies.map(c => companyCardHtml(c)).join("") || `<div class="company-empty">暂无企业</div>`}
        </div>
      </div>`;
    }).join("");

    el.innerHTML = focusCarousel + tierBlocks;
  }

  /** 企业卡片（滚轮内使用，紧凑型） */
  function companyCardHtml(c) {
    const typeCls = companyTypeCls(c.type);
    const sizeCls = c.size === "大厂" ? "size-big" : c.size === "中厂" ? "size-mid" : "size-small";
    const dirs = companyDirs(c).slice(0, 3).map(d => `<span class="dir-chip">${escapeHtml(d)}</span>`).join("");
    const tags = (c.tags || []).map(t => `<span class="tag-mini">${escapeHtml(t)}</span>`).join("");
    return `<div class="company-card">
      <div class="company-card-top">
        <span class="company-name">${escapeHtml(c.name)}</span>
        <span class="company-type ${typeCls}">${escapeHtml(c.type)}</span>
        <span class="company-size ${sizeCls}">${escapeHtml(c.size || "")}</span>
      </div>
      <div class="company-card-dirs">${dirs}</div>
      <div class="company-card-meta">
        <span>${escapeHtml(c.degree || "本科起")}</span>
        <span>·</span>
        <span class="ellipsis">${escapeHtml((c.city || "").split(",")[0])}</span>
        ${tags}
      </div>
      <div class="company-card-foot">
        <span class="company-deadline">${escapeHtml(c.deadline || "尽快投递")}</span>
        ${c.link
          ? `<a class="company-link" href="${safeUrl(c.link)}" target="_blank" rel="noopener noreferrer">投递 ↗</a>`
          : `<span class="company-nolink">暂无链接</span>`}
      </div>
    </div>`;
  }

  /**
   * 全部可投企业：表格 + 全局筛选排序
   * 数据来自真实招聘数据 REAL_COMPANIES（不按岗位拆分，全局 587 家）
   */
  let companyFilterState = { kw: "", cat: "", nature: "", degree: "", city: "", sortKey: "name", sortAsc: true };
  const COMPANY_PAGE_SIZE = 50; // 每页企业数，避免一次渲染数千行导致卡顿
  let companyPage = 0;          // 当前页码

  /** 全部可投企业数据源：优先按当前目标岗位初筛对口企业；无目标岗位时回退到全量 */
  function allCompaniesData() {
    const best = getTargetJob();
    if (best && best.id && typeof getRealCompaniesForJob !== "undefined") {
      const list = getRealCompaniesForJob(best.id);
      if (list.length) return list;
    }
    // 回退：全部真实企业（按公司去重）
    const seen = new Set();
    const all = [];
    (typeof REAL_COMPANIES !== "undefined" ? REAL_COMPANIES : []).forEach(c => {
      if (!seen.has(c.name)) { seen.add(c.name); all.push(c); }
    });
    return all;
  }

  /** 岗位名 → 关键词（用于方向筛选时匹配企业岗位原文） */
  function jobNameToKeywords(jobName) {
    const job = (typeof JOB_LIBRARY !== "undefined" ? JOB_LIBRARY : []).find(j => j.name === jobName);
    if (job && typeof JOB_DIR_MAP !== "undefined" && JOB_DIR_MAP[job.id]) {
      return JOB_DIR_MAP[job.id];
    }
    return [jobName];
  }

  function renderAllCompanies() {
    const tbody = document.getElementById("companyTbody");
    if (!tbody) return;
    const all = allCompaniesData();

    // 初始化筛选器选项（首次）
    initFilterOptions(all);

    // 应用筛选
    const f = companyFilterState;
    const catKws = f.cat ? jobNameToKeywords(f.cat) : [];
    let list = all.filter(c => {
      const dirs = companyDirs(c);
      const rawJobs = (c.jobs || []).join(" ");
      if (f.kw) {
        const hay = (c.name + " " + dirs.join(" ") + " " + rawJobs + " " + (c.city || "") + " " + (c.industry || "")).toLowerCase();
        if (!hay.includes(f.kw.toLowerCase())) return false;
      }
      if (f.cat && !catKws.some(k => rawJobs.indexOf(k) !== -1)) return false;
      if (f.nature && c.type !== f.nature) return false;
      if (f.degree && (c.degree || "") !== f.degree) return false;
      if (f.city && !(c.city || "").includes(f.city)) return false;
      return true;
    });

    // 排序
    list = list.sort((a, b) => {
      const va = a[f.sortKey] || "", vb = b[f.sortKey] || "";
      const cmp = String(va).localeCompare(String(vb), "zh");
      return f.sortAsc ? cmp : -cmp;
    });

    // 分页：计算总页数并夹紧当前页
    const totalPages = Math.max(1, Math.ceil(list.length / COMPANY_PAGE_SIZE));
    if (companyPage >= totalPages) companyPage = totalPages - 1;
    if (companyPage < 0) companyPage = 0;
    const start = companyPage * COMPANY_PAGE_SIZE;
    const pageList = list.slice(start, start + COMPANY_PAGE_SIZE);

    // 渲染表格行（只渲染当前页）
    tbody.innerHTML = pageList.map(c => {
      const typeCls = companyTypeCls(c.type);
      const sizeCls = c.size === "大厂" ? "size-big" : c.size === "中厂" ? "size-mid" : "size-small";
      const dirs = companyDirs(c).slice(0, 4).map(d => `<span class="dir-chip">${escapeHtml(d)}</span>`).join("");
      return `<tr>
        <td class="td-company">
          <div class="td-company-name">${escapeHtml(c.name)}</div>
          <div class="td-company-sub">${escapeHtml(c.industry || "")} ${c.size ? `<span class="company-size ${sizeCls}">${escapeHtml(c.size)}</span>` : ""}</div>
        </td>
        <td class="td-dirs">${dirs}</td>
        <td><span class="company-type ${typeCls}">${escapeHtml(c.type)}</span></td>
        <td>${escapeHtml(c.degree || "本科起")}</td>
        <td class="td-city">${escapeHtml((c.city || "").split(",")[0])}</td>
        <td class="td-deadline">${escapeHtml(c.deadline || "尽快投递")}</td>
        <td class="td-link">${c.link
          ? `<a class="company-link" href="${safeUrl(c.link)}" target="_blank" rel="noopener noreferrer">投递 ↗</a>`
          : `<span class="company-nolink">—</span>`}</td>
      </tr>`;
    }).join("");

    // 空态
    const empty = document.getElementById("companyTableEmpty");
    if (empty) empty.hidden = list.length > 0;

    // 计数
    const countEl = document.getElementById("allCompanyCount");
    if (countEl) countEl.textContent = all.length;
    const shownEl = document.getElementById("companyShown");
    if (shownEl) shownEl.textContent = list.length;
    const totalEl = document.getElementById("companyTotal");
    if (totalEl) totalEl.textContent = all.length;

    // 翻页控件
    renderPagination(totalPages, list.length);
  }

  /** 渲染分页控件（上一页/页码/下一页） */
  function renderPagination(totalPages, total) {
    const wrap = document.getElementById("companyPagination");
    if (!wrap) return;
    if (totalPages <= 1) { wrap.innerHTML = ""; return; }
    const cur = companyPage + 1;
    let html = `<button class="page-btn" data-p="prev" ${companyPage <= 0 ? "disabled" : ""}>‹ 上一页</button>`;
    // 页码（最多展示 7 个，带省略号）
    const pages = [];
    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || Math.abs(i - cur) <= 2) pages.push(i);
    }
    let last = 0;
    pages.forEach(p => {
      if (last && p - last > 1) html += `<span class="page-ellipsis">…</span>`;
      html += `<button class="page-btn page-num ${p === cur ? "active" : ""}" data-p="${p}">${p}</button>`;
      last = p;
    });
    html += `<button class="page-btn" data-p="next" ${companyPage >= totalPages - 1 ? "disabled" : ""}>下一页 ›</button>`;
    html += `<span class="page-info">共 ${total} 家 · 第 ${cur}/${totalPages} 页</span>`;
    wrap.innerHTML = html;
  }

  /** 绑定翻页事件（委托） */
  function bindPagination() {
    const wrap = document.getElementById("companyPagination");
    if (!wrap) return;
    wrap.addEventListener("click", (e) => {
      const btn = e.target.closest(".page-btn");
      if (!btn || btn.disabled) return;
      const p = btn.dataset.p;
      const totalPages = Math.max(1, Math.ceil(allCompaniesData().length / COMPANY_PAGE_SIZE));
      if (p === "prev") companyPage = Math.max(0, companyPage - 1);
      else if (p === "next") companyPage = Math.min(totalPages - 1, companyPage + 1);
      else companyPage = parseInt(p, 10) - 1;
      renderAllCompanies();
      // 翻页后滚动到表格顶部
      const tableWrap = document.querySelector(".company-table-wrap");
      if (tableWrap) tableWrap.scrollTop = 0;
    });
  }

  function initFilterOptions(all) {
    // 方向选项：用岗位库的岗位名作为方向大类（20 个大方向），而非遍历 6362 家企业全部岗位
    const catSel = document.getElementById("filterCat");
    if (catSel && catSel.options.length <= 1) {
      const jobs = (typeof JOB_LIBRARY !== "undefined" ? JOB_LIBRARY : []);
      jobs.forEach(j => {
        const opt = document.createElement("option");
        opt.value = j.name; opt.textContent = j.name;
        catSel.appendChild(opt);
      });
    }
    // 城市选项
    const citySel = document.getElementById("filterCity");
    if (citySel && citySel.options.length <= 1) {
      const citySet = new Set();
      all.forEach(c => (c.city || "").split(",").forEach(x => { if (x.trim()) citySet.add(x.trim()); }));
      [...citySet].sort().forEach(ct => {
        const opt = document.createElement("option");
        opt.value = ct; opt.textContent = ct;
        citySel.appendChild(opt);
      });
    }
  }

  function bindCompanyFilters() {
    const search = document.getElementById("companySearch");
    if (search) search.addEventListener("input", () => { companyFilterState.kw = search.value.trim(); companyPage = 0; renderAllCompanies(); });
    const cat = document.getElementById("filterCat");
    if (cat) cat.addEventListener("change", () => { companyFilterState.cat = cat.value; companyPage = 0; renderAllCompanies(); });
    const nature = document.getElementById("filterNature");
    if (nature) nature.addEventListener("change", () => { companyFilterState.nature = nature.value; companyPage = 0; renderAllCompanies(); });
    const degree = document.getElementById("filterDegree");
    if (degree) degree.addEventListener("change", () => { companyFilterState.degree = degree.value; companyPage = 0; renderAllCompanies(); });
    const city = document.getElementById("filterCity");
    if (city) city.addEventListener("change", () => { companyFilterState.city = city.value; companyPage = 0; renderAllCompanies(); });
    // 表头排序
    document.querySelectorAll(".company-table th.sortable").forEach(th => {
      th.addEventListener("click", () => {
        const key = th.dataset.key;
        if (companyFilterState.sortKey === key) {
          companyFilterState.sortAsc = !companyFilterState.sortAsc;
        } else {
          companyFilterState.sortKey = key;
          companyFilterState.sortAsc = true;
        }
        companyPage = 0;
        renderAllCompanies();
      });
    });
    // 翻页
    bindPagination();
  }

  /* ---------------- 智能问答 ---------------- */
  const chatBody = $("#chatBody");
  const chatInput = $("#chatInput");
  const btnSend = $("#btnSend");

  const QUICK_QUESTIONS = [
    "我最适合投什么岗位？",
    "我的技能缺口有哪些？",
    "帮我制定 4 周求职计划",
    "数据类岗位薪资行情如何？",
    "我的综合竞争力怎么样？"
  ];

  function renderAgentProfile() {
    const el = $("#agentProfile");
    if (!state.result) {
      el.innerHTML = `<div class="profile-empty">完成简历诊断后，这里会显示你的核心指标，Agent 将基于它回答问题。</div>`;
      return;
    }
    const best = state.result.targetJob || state.result.jobs[0];
    el.innerHTML = `
      <div class="card-head" style="margin-bottom:10px"><h3>诊断速览</h3></div>
      <div class="profile-stat"><span>综合匹配分</span><b>${state.result.overall}</b></div>
      <div class="profile-stat"><span>竞争力评级</span><b>${state.result.level}</b></div>
      <div class="profile-stat"><span>最佳匹配</span><b>${escapeHtml(best.name)}</b></div>
      <div class="profile-stat"><span>缺失技能</span><b>${best.gapCount} 项</b></div>`;
  }

  function renderQuickList() {
    $("#quickList").innerHTML = QUICK_QUESTIONS.map(q =>
      `<button class="quick-item">${q}</button>`
    ).join("");
    $$(".quick-item").forEach(btn => {
      btn.addEventListener("click", () => send(btn.textContent));
    });
  }

  function addMsg(role, html) {
    const div = document.createElement("div");
    div.className = "msg " + role;
    div.innerHTML = `
      <div class="msg-avatar">${role === "agent" ? "知" : "我"}</div>
      <div class="msg-bubble">${html}</div>`;
    chatBody.appendChild(div);
    chatBody.scrollTop = chatBody.scrollHeight;
    return div;
  }

  /* ---- LLM 接入：初始化云服务客户端（免密钥中转） ---- */
  let cloud = null;
  let chatHistory = [];
  try {
    if (window.WorkBuddyCloud && window.CLOUD_CONFIG) {
      cloud = window.WorkBuddyCloud.createWorkBuddyCloud({
        endpoint: window.CLOUD_CONFIG.endpoint,
        oauthRelayBaseUrl: window.CLOUD_CONFIG.oauthRelayBaseUrl,
        publishableKey: window.CLOUD_CONFIG.publishableKey
      });
    }
  } catch (e) { cloud = null; }

  function setAgentStatus(text) {
    const el = document.querySelector("#apiStatus .status-text");
    if (el) el.textContent = text;
  }

  let agentGreeted = false;

  function greet() {
    if (agentGreeted) return;
    agentGreeted = true;
    addMsg("agent", cloud
      ? "你好！我是知简 Agent（已接入 AI 大模型）。我已经看过你的诊断报告，随时可以提问 —— 试试下面的快捷问题，或直接输入。"
      : "你好！我是知简 Agent。我已经看过你的诊断报告，随时可以提问 —— 试试下面的快捷问题，或直接输入。");
  }

  /* 每日 AI 调用上限（保护额度不被刷爆），按天重置 */
  const AI_DAILY_LIMIT = 50;
  function aiQuotaOk() {
    const key = "zhijian_ai_quota";
    try {
      const d = JSON.parse(localStorage.getItem(key) || "{}");
      const today = new Date().toISOString().slice(0, 10);
      if (d.date !== today) { d.date = today; d.count = 0; }
      if (d.count >= AI_DAILY_LIMIT) return false;
      d.count++;
      localStorage.setItem(key, JSON.stringify(d));
      return true;
    } catch (e) { return true; }
  }

  function send(text) {
    const q = (text || chatInput.value).trim();
    if (!q) return;
    chatInput.value = "";
    addMsg("user", escapeHtml(q));

    const typing = addMsg("agent", `<span class="typing-cursor"></span>`);
    const bubble = typing.querySelector(".msg-bubble");

    if (cloud && aiQuotaOk()) {
      sendLLM(q, bubble);
    } else {
      setTimeout(() => {
        const answer = AgentEngine.reply(q, state);
        typeOut(bubble, answer);
        if (cloud) toast("AI 问答今日额度已用尽，已自动切换为基础问答");
      }, 550);
    }
  }

  async function sendLLM(q, bubble) {
    try {
      let acc = "";
      await AgentEngine.replyLLM(cloud, q, state, chatHistory, (delta) => {
        acc += delta;
        bubble.textContent = acc;
        chatBody.scrollTop = chatBody.scrollHeight;
      });
      chatHistory.push({ role: "user", content: q });
      chatHistory.push({ role: "assistant", content: acc });
      if (chatHistory.length > 12) chatHistory = chatHistory.slice(-12);
      if (!acc) bubble.textContent = "（没有收到回复，请重试）";
    } catch (err) {
      console.warn("LLM 调用失败，降级规则引擎:", err && err.message);
      chatHistory = [];
      const answer = AgentEngine.reply(q, state);
      typeOut(bubble, answer);
    }
  }

  /** 打字机效果（保留内联 HTML） */
  function typeOut(el, html) {
    // 简单方案：按字符步进展示纯文本，最终替换为完整 HTML
    const plain = html.replace(/<[^>]+>/g, "");
    let i = 0;
    el.innerHTML = `<span class="typing-cursor"></span>`;
    const timer = setInterval(() => {
      i += 2;
      el.innerHTML = escapeHtml(plain.slice(0, i)) + `<span class="typing-cursor"></span>`;
      chatBody.scrollTop = chatBody.scrollHeight;
      if (i >= plain.length) {
        clearInterval(timer);
        el.innerHTML = html.replace(/\n/g, "<br>").replace(/· /g, "· ");
        chatBody.scrollTop = chatBody.scrollHeight;
      }
    }, 18);
  }

  btnSend.addEventListener("click", () => send());
  chatInput.addEventListener("keydown", (e) => { if (e.key === "Enter") send(); });

  /* ---------------- 导出报告 ---------------- */
  const exportModal = $("#exportModal");

  $("#btnExport").addEventListener("click", () => {
    if (!state.result) return;
    exportModal.hidden = false;
    $("#exportHint").textContent = "将下载一份包含诊断图表的独立 HTML 报告";
    $("#btnExportConfirm").disabled = false;
  });
  $("#btnExportCancel").addEventListener("click", () => { exportModal.hidden = true; });
  $("#btnExportConfirm").addEventListener("click", () => {
    exportModal.hidden = true;
    downloadReport();
  });

  function downloadReport() {
    const p = state.profile, r = state.result;
    const best = r.targetJob || r.jobs[0];
    const rows = r.jobs.slice(0, 5).map(j =>
      `<tr><td>${j.name}${j.isStretch ? "（冲刺岗）" : ""}</td><td>${j.city}</td><td>${j.salary}</td><td><b>${j.score}%</b></td></tr>`).join("");
    const gates = r.gates && r.gates.length ? r.gates.join("；") : "硬门槛达标";
    const html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>知简诊断报告 · ${escapeHtml(p.name)}</title>
<style>body{font-family:system-ui,"PingFang SC","Microsoft YaHei";max-width:760px;margin:40px auto;padding:0 24px;color:#0F172A;line-height:1.7}
h1{font-size:26px;border-bottom:3px solid #7C6CFF;padding-bottom:12px}.tag{display:inline-block;background:#F1F0FF;color:#7C6CFF;border-radius:14px;padding:3px 14px;font-size:13px;font-weight:600;margin-right:8px}
table{width:100%;border-collapse:collapse;margin:16px 0}td,th{border:1px solid #E8EAF0;padding:10px 12px;text-align:left;font-size:14px}th{background:#F7F8FA}
.kpi{display:flex;gap:16px;margin:20px 0}.kpi div{flex:1;background:#F7F8FA;border-radius:12px;padding:16px;text-align:center}.kpi b{font-size:28px;color:#7C6CFF}
.footer{margin-top:32px;color:#94A3B8;font-size:12px;text-align:center}</style></head><body>
<h1>知简 · 简历智能诊断报告</h1>
<p><span class="tag">${escapeHtml(p.name)}</span><span class="tag">评级 ${r.level}</span><span class="tag">匹配分 ${r.overall}</span></p>
<p style="color:#64748B">${escapeHtml(p.education)}（${escapeHtml(p.schoolTier || "未知")}）· 学历 ${escapeHtml(p.degree || "未识别")} · 证书：${escapeHtml((p.certs || []).join("、") || "无")}</p>
<div class="kpi">
  <div><b>${r.overall}</b><br>综合匹配分</div>
  <div><b>${best.matched.length}/${Object.keys(best.skills).length}</b><br>技能覆盖</div>
  <div><b>${best.gapCount}</b><br>缺失技能</div>
  <div><b>${r.rank}%</b><br>超过同岗求职者</div>
</div>
<h3>硬门槛体检</h3>
<p>${escapeHtml(gates)}</p>
<h3>六维能力得分</h3>
<p>技能匹配 ${r.dimensions.skills} · 学历院校 ${r.dimensions.school} · 项目 ${r.dimensions.project} · 实习 ${r.dimensions.intern} · 证书 ${r.dimensions.cert} · 潜力 ${r.dimensions.potential}</p>
<h3>缺失技能（按优先级）</h3>
<p>${r.gapsByJob.map(g => `${g.rank}. ${g.name}（${g.label}）`).join("<br>") || "无缺失"}</p>
<h3>岗位匹配推荐</h3>
<table><tr><th>岗位</th><th>城市</th><th>薪资</th><th>匹配度</th></tr>${rows}</table>
<p class="footer">本报告由「知简 · 简历智能诊断 Agent」生成 · ${new Date().toLocaleString("zh-CN")}</p>
</body></html>`;
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `知简诊断报告_${p.name}.html`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast("报告已下载");
  }

  /* ---------------- 工具 ---------------- */
  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  /** 安全链接校验：只允许 http/https 协议，防 javascript: 等 XSS 注入 */
  function safeUrl(url) {
    if (!url) return "";
    const u = String(url).trim();
    if (/^https?:\/\//i.test(u)) return u;
    return ""; // 非 http/https 一律拒绝
  }

  window.__escapeHtml = escapeHtml;

  /* ---------------- 初始化 ---------------- */
  // 抽屉切换：诊断速览 + 快捷提问
  const drawer = $("#agentDrawer");
  const btnToggleProfile = $("#btnToggleProfile");
  const drawerHandle = $("#drawerHandle");
  let drawerCollapsed = false;
  function toggleDrawer() {
    drawerCollapsed = !drawerCollapsed;
    drawer.classList.toggle("collapsed", drawerCollapsed);
  }
  if (btnToggleProfile) btnToggleProfile.addEventListener("click", toggleDrawer);
  if (drawerHandle) drawerHandle.addEventListener("click", toggleDrawer);

  // 全部企业表格：筛选与排序绑定
  bindCompanyFilters();

  $$(".nav-item").forEach(a => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      const v = a.dataset.view;
      if (v === "market") renderMarket();
      if (v === "agent") { renderAgentProfile(); renderQuickList(); greet(); }
      switchView(v);
    });
  });

  window.addEventListener("resize", () => {
    Object.values(chartInstances).forEach(c => c.resize());
  });

  if (cloud) setAgentStatus("AI 模型在线");
  switchView("upload");
})();
