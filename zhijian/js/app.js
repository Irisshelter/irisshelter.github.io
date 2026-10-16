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
    sourceText: ""   // 原始简历文本
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
  function renderReport() {
    const p = state.profile, r = state.result;
    const best = r.targetJob || r.jobs[0];

    // 候选人卡
    $("#candidateCard").innerHTML = `
      <div class="candidate-avatar">${escapeHtml(p.name[0] || "求")}</div>
      <div>
        <div class="candidate-name">${escapeHtml(p.name)}</div>
        <div class="candidate-meta">${escapeHtml(p.education)} · 识别技能 ${p.skills.length} 项 · 简历约 ${p.wordCount} 字</div>
      </div>
      <div class="candidate-spacer"></div>
      <span class="tag tag-purple"><i class="dot"></i>目标岗位：${escapeHtml(best.name)}</span>
      <span class="tag tag-green"><i class="dot"></i>竞争力评级：${r.level}</span>`;

    // KPI
    const kpis = [
      { label: "综合匹配度", val: r.overall, sub: `超过 ${r.rank}% 的同岗位求职者`, cls: "up" },
      { label: "技能覆盖", val: `${best.matched.length} / ${Object.keys(best.skills).length}`, sub: "覆盖目标岗位要求技能", cls: "plain" },
      { label: "缺失技能", val: best.gapCount, sub: best.gapCount ? "建议优先补齐" : "无缺失，保持优势", cls: best.gapCount ? "warn" : "up" },
      { label: "可投递岗位", val: r.jobs.filter(j => j.score >= 60).length, sub: "匹配度 ≥ 60%", cls: "plain" }
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

    // 缺失技能
    $("#gapList").innerHTML = r.gapsByJob.length
      ? r.gapsByJob.map((g, i) => `
          <div class="gap-row">
            <span class="rank-badge rank-${Math.min(4, g.rank)}">${g.rank}</span>
            <span class="gap-name">${escapeHtml(g.name)}</span>
            <span class="gap-spacer"></span>
            <span class="gap-level ${g.level}">${g.label}</span>
          </div>`).join("")
      : `<div class="gap-row"><span class="gap-name" style="color:var(--green-deep)">技能全面覆盖目标岗位要求，继续保持！</span></div>`;

    // 投递建议（前 5）
    $("#jobList").innerHTML = r.jobs.slice(0, 5).map(j => {
      const cls = j.score >= 75 ? "mb-green" : "mb-amber";
      return `
        <div class="job-row">
          <span class="match-badge ${cls}">${j.score}%</span>
          <div class="job-info">
            <div class="job-name">${escapeHtml(j.name)}</div>
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
        renderRadar();
        renderGauge();
      } else {
        svgRadar();
        svgGauge();
      }
      const apiEl = document.querySelector("#apiStatus .status-text");
      if (apiEl) apiEl.textContent = ok ? "可视化引擎就绪" : "轻量图表模式";
    });
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

  const BRAND = "#635BFF";
  const BRAND2 = "#8B5CF6";
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
        axisName: { color: "#0F172A", fontSize: 12 },
        splitLine: { lineStyle: { color: "#E8EAF0" } },
        splitArea: { areaStyle: { color: ["#FFFFFF", "#F8F8FC"] } },
        axisLine: { lineStyle: { color: "#E8EAF0" } }
      },
      series: [{
        type: "radar",
        symbolSize: 5,
        data: [
          {
            value: dims.map(d => d.req),
            name: "岗位要求",
            lineStyle: { color: "#B4B9F5", width: 1.5, type: "dashed" },
            itemStyle: { color: "#B4B9F5" },
            areaStyle: { color: "rgba(180,185,245,0.12)" }
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
                  { offset: 0, color: "rgba(99,91,255,0.45)" },
                  { offset: 1, color: "rgba(139,92,246,0.30)" }
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
        axisLine: { lineStyle: { width: 18, color: [[1, "#EEEEF3"]] } },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: { show: false },
        pointer: { show: false },
        anchor: { show: false },
        title: { show: true, offsetCenter: [0, "34%"], fontSize: 13, color: "#64748B" },
        detail: {
          valueAnimation: true,
          offsetCenter: [0, "-6%"],
          fontSize: 46, fontWeight: 600, color: "#0F172A",
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
      grid += `<polygon points="${ring(R * k / 4)}" fill="${k % 2 ? "#FFFFFF" : "#F8F8FC"}" stroke="#E8EAF0" stroke-width="1"/>`;
    }
    const axes = dims.map((_, i) => {
      const [x, y] = pt(i, R);
      return `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#E8EAF0" stroke-width="1"/>`;
    }).join("");
    const labels = dims.map((d, i) => {
      const [x, y] = pt(i, R + 24);
      return `<text x="${x.toFixed(1)}" y="${(y + 4).toFixed(1)}" text-anchor="middle" font-size="12.5" fill="#0F172A" font-weight="500">${escapeHtml(d.dim)}</text>`;
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
      <circle cx="280" cy="140" r="${r}" stroke="#EEEEF3" stroke-width="18" fill="none"/>
      <circle cx="280" cy="140" r="${r}" stroke="url(#svgGaugeGrad)" stroke-width="18" fill="none"
        stroke-linecap="round" stroke-dasharray="${dash.toFixed(1)} ${c.toFixed(1)}"
        transform="rotate(-90 280 140)" style="transition:stroke-dasharray 1s ease"/>
      <text x="280" y="148" text-anchor="middle" font-size="46" font-weight="600" fill="#0F172A"
        font-family="Inter,system-ui" style="letter-spacing:-1px">${score}</text>
      <text x="280" y="178" text-anchor="middle" font-size="13" fill="#64748B">综合匹配分</text>
    </svg>`;
  }

  function svgMarketBars(containerId, items, unit) {
    const el = document.getElementById(containerId);
    if (!el) return;
    const max = Math.max(...items.map(i => i.value));
    el.innerHTML = `<div style="padding:12px 8px;display:flex;flex-direction:column;gap:11px;height:100%;justify-content:center">` +
      items.map(it => `
        <div style="display:flex;align-items:center;gap:12px">
          <span style="width:86px;font-size:12.5px;color:#0F172A;flex-shrink:0;text-align:right">${escapeHtml(it.name)}</span>
          <span style="flex:1;height:14px;background:#F1F2F5;border-radius:7px;overflow:hidden">
            <span style="display:block;height:100%;width:${(it.value / max * 100).toFixed(1)}%;border-radius:7px;background:linear-gradient(90deg,#635BFF,#8B5CF6)"></span>
          </span>
          <span style="width:44px;font-size:12.5px;color:#64748B;font-variant-numeric:tabular-nums">${it.value}${unit}</span>
        </div>`).join("") + `</div>`;
  }

  function svgTrend() {
    const el = document.getElementById("trendChart");
    if (!el) return;
    const W = 900, H = 300, padL = 46, padB = 34, padT = 20;
    const all = MARKET_TREND.series.flatMap(s => s.data);
    const max = Math.max(...all) * 1.1, min = Math.min(...all) * 0.85;
    const x = (i) => padL + i * (W - padL - 20) / (MARKET_TREND.months.length - 1);
    const y = (v) => padT + (H - padT - padB) * (1 - (v - min) / (max - min));
    const colors = [BRAND, "#10B981", "#F59E0B", "#94A3B8"];
    const lines = MARKET_TREND.series.map((s, si) => {
      const pts = s.data.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
      return `<polyline points="${pts}" fill="none" stroke="${colors[si]}" stroke-width="${si === 0 ? 3 : 1.6}" stroke-linejoin="round"/>
        ${s.data.map((v, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="${si === 0 ? 4 : 2.5}" fill="${colors[si]}"/>`).join("")}`;
    }).join("");
    const labels = MARKET_TREND.months.map((m, i) =>
      `<text x="${x(i).toFixed(1)}" y="${H - 10}" text-anchor="middle" font-size="12" fill="#64748B">${m}</text>`).join("");
    const legend = MARKET_TREND.series.map((s, si) =>
      `<span style="display:inline-flex;align-items:center;gap:5px"><i style="width:8px;height:8px;border-radius:50%;background:${colors[si]}"></i>${s.name}</span>`).join("");
    el.innerHTML = `<div style="text-align:right;padding:0 8px 4px;font-size:12px;color:#64748B;display:flex;gap:16px;justify-content:flex-end">${legend}</div>
      <svg viewBox="0 0 ${W} ${H}" width="100%" height="calc(100% - 24px)" preserveAspectRatio="xMidYMid meet">${lines}${labels}</svg>`;
  }

  function renderMarketFallback() {
    svgTrend();
    svgMarketBars("skillChart", SKILL_HEAT, "%");
    svgMarketBars("salaryChart", SALARY_DIST.map(s => ({ name: s.range, value: s.value })), "%");
  }

  function renderMarket() {
    ensureECharts().then(ok => {
      echartsReady = ok;
      chartLibLoaded = true;
      if (ok) { renderTrend(); renderSkillHeat(); renderSalary(); }
      else renderMarketFallback();
    });
  }
  function renderTrend() {
    const trend = getChart("trendChart");
    if (!trend) return;
    trend.setOption({
        tooltip: { trigger: "axis" },
        legend: { top: 0, right: 0, textStyle: { color: "#64748B" } },
        grid: { left: 40, right: 16, top: 36, bottom: 28 },
        xAxis: { type: "category", data: MARKET_TREND.months, axisLine: { lineStyle: { color: "#E8EAF0" } }, axisLabel: { color: "#64748B" } },
        yAxis: { type: "value", splitLine: { lineStyle: { color: "#F1F2F5" } }, axisLabel: { color: "#94A3B8" } },
        series: MARKET_TREND.series.map((s, i) => ({
          name: s.name, type: "line", smooth: true, data: s.data,
          lineStyle: { width: i === 0 ? 3 : 1.8 },
          itemStyle: { color: [BRAND, "#10B981", "#F59E0B", "#94A3B8"][i] },
          symbolSize: i === 0 ? 7 : 4
        }))
      });
  }

  function renderSkillHeat() {
    const skill = getChart("skillChart");
    if (!skill) return;
    skill.setOption({
        tooltip: {},
        grid: { left: 80, right: 40, top: 10, bottom: 24 },
        xAxis: { type: "value", max: 100, splitLine: { show: false }, axisLabel: { show: false } },
        yAxis: {
          type: "category", data: SKILL_HEAT.map(s => s.name).reverse(),
          axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: "#0F172A", fontSize: 12 }
        },
        series: [{
          type: "bar", barWidth: 14,
          data: SKILL_HEAT.map(s => s.value).reverse(),
          itemStyle: {
            borderRadius: 7,
            color: {
              type: "linear", x: 0, y: 0, x2: 1, y2: 0,
              colorStops: [{ offset: 0, color: BRAND }, { offset: 1, color: BRAND2 }]
            }
          },
          label: { show: true, position: "right", color: "#64748B", formatter: "{c}%" }
        }]
      });
  }

  function renderSalary() {
    const salary = getChart("salaryChart");
    if (!salary) return;
    salary.setOption({
        tooltip: { trigger: "axis" },
        grid: { left: 40, right: 16, top: 20, bottom: 28 },
        xAxis: { type: "category", data: SALARY_DIST.map(s => s.range), axisLine: { lineStyle: { color: "#E8EAF0" } }, axisLabel: { color: "#64748B" } },
        yAxis: { type: "value", splitLine: { lineStyle: { color: "#F1F2F5" } }, axisLabel: { color: "#94A3B8" } },
        series: [{
          type: "bar", barWidth: 26, data: SALARY_DIST.map(s => s.value),
          itemStyle: { borderRadius: [7, 7, 0, 0], color: BRAND },
          label: { show: true, position: "top", color: "#64748B", formatter: "{c}%" }
        }]
      });
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
      `<tr><td>${j.name}</td><td>${j.city}</td><td>${j.salary}</td><td><b>${j.score}%</b></td></tr>`).join("");
    const html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>知简诊断报告 · ${escapeHtml(p.name)}</title>
<style>body{font-family:system-ui,"PingFang SC","Microsoft YaHei";max-width:760px;margin:40px auto;padding:0 24px;color:#0F172A;line-height:1.7}
h1{font-size:26px;border-bottom:3px solid #635BFF;padding-bottom:12px}.tag{display:inline-block;background:#F1F0FF;color:#635BFF;border-radius:14px;padding:3px 14px;font-size:13px;font-weight:600;margin-right:8px}
table{width:100%;border-collapse:collapse;margin:16px 0}td,th{border:1px solid #E8EAF0;padding:10px 12px;text-align:left;font-size:14px}th{background:#F7F8FA}
.kpi{display:flex;gap:16px;margin:20px 0}.kpi div{flex:1;background:#F7F8FA;border-radius:12px;padding:16px;text-align:center}.kpi b{font-size:28px;color:#635BFF}
.footer{margin-top:32px;color:#94A3B8;font-size:12px;text-align:center}</style></head><body>
<h1>知简 · 简历智能诊断报告</h1>
<p><span class="tag">${escapeHtml(p.name)}</span><span class="tag">评级 ${r.level}</span><span class="tag">匹配分 ${r.overall}</span></p>
<p style="color:#64748B">${escapeHtml(p.education)} · 识别技能：${escapeHtml(p.skills.join("、") || "无")}</p>
<div class="kpi">
  <div><b>${r.overall}</b><br>综合匹配分</div>
  <div><b>${best.matched.length}/${Object.keys(best.skills).length}</b><br>技能覆盖</div>
  <div><b>${best.gapCount}</b><br>缺失技能</div>
  <div><b>${r.rank}%</b><br>超过同岗求职者</div>
</div>
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

  window.__escapeHtml = escapeHtml;

  /* ---------------- 初始化 ---------------- */
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
