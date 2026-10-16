/* ============================================================
 * data.js — 岗位知识库与技能词表
 * 数据来源：公开招聘平台公开 JD 与市场统计（抖音/拼多多校招、
 * 猎聘/智联公开岗位、200+ 初级数据分析岗 JD 技能频率统计）
 * 说明：本文件为「静态快照」数据，非实时抓取；薪资为 2026 年
 * 应届/初级岗位市场区间，供诊断参考。
 * ============================================================ */

/** 技能标准词表：将简历中的同义表述归并到标准技能名 */
const SKILL_LEXICON = {
  "SQL": ["sql", "mysql", "数据库", "oracle", "sqlserver", "postgresql", "多表关联", "查询优化"],
  "Python": ["python", "pandas", "numpy", "爬虫", "requests"],
  "Excel": ["excel", "数据透视表", "vlookup", "透视表", "wps表格"],
  "Hadoop": ["hadoop", "hdfs", "hive", "mapreduce", "分布式", "集群"],
  "Spark": ["spark", "pyspark", "spark sql", "spark mlib", "mllib", "大数据处理"],
  "可视化": ["echarts", "plotly", "tableau", "powerbi", "power bi", "finebi", "数据可视化", "bi", "前端", "图表"],
  "机器学习": ["机器学习", "回归", "聚类", "分类模型", "sklearn", "算法", "深度学习", "tensorflow", "pytorch"],
  "统计": ["统计", "假设检验", "ab测试", "a/b测试", "实验设计", "描述统计", "概率"],
  "Java": ["java", "j2ee", "spring"],
  "C++": ["c++", "cpp"],
  "前端开发": ["html", "css", "javascript", "vue", "react", "web前端", "小程序"],
  "数据清洗": ["数据清洗", "预处理", "etl", "数据采集", "数据校验", "数据标准化", "标注"]
};

/**
 * 岗位知识库（8 个数据类岗位）
 * weight 为该技能在匹配中的权重（5 最高），依据真实 JD 的技能要求排序
 * salary 为 2026 年广州/深圳应届·初级岗位市场区间
 */
const JOB_LIBRARY = [
  {
    id: "data-analyst",
    name: "数据分析师（初级）",
    city: "广州",
    salary: "8-12K",
    skills: { "SQL": 5, "Python": 4, "Excel": 4, "可视化": 3, "统计": 3, "数据清洗": 3 },
    notes: "SQL 为硬门槛，Python 与统计是加分项",
    hot: 92
  },
  {
    id: "data-ops",
    name: "数据运营专员",
    city: "深圳",
    salary: "9-13K",
    skills: { "Excel": 5, "SQL": 3, "可视化": 3, "统计": 2, "数据清洗": 2 },
    notes: "沟通表达与业务理解权重高",
    hot: 80
  },
  {
    id: "bi-engineer",
    name: "BI 报表工程师",
    city: "广州",
    salary: "9-13K",
    skills: { "SQL": 5, "可视化": 5, "数据清洗": 3, "Python": 2, "Excel": 2 },
    notes: "SQL + BI 工具（Tableau/FineBI）为核心",
    hot: 76
  },
  {
    id: "bigdata-dev",
    name: "大数据开发工程师",
    city: "深圳",
    salary: "18-25K",
    skills: { "Hadoop": 5, "Spark": 5, "SQL": 4, "Java": 3, "Python": 3 },
    notes: "应届高薪岗，需 Hadoop/Spark 项目经验",
    hot: 88
  },
  {
    id: "data-mining",
    name: "数据挖掘工程师",
    city: "广州",
    salary: "14-20K",
    skills: { "Python": 5, "机器学习": 5, "SQL": 4, "统计": 4, "Spark": 3 },
    notes: "算法能力要求高，机器学习为硬门槛",
    hot: 72
  },
  {
    id: "report-analyst",
    name: "业务报表专员",
    city: "佛山",
    salary: "5-8K",
    skills: { "Excel": 5, "SQL": 2, "可视化": 2, "数据清洗": 2 },
    notes: "门槛友好，适合起步积累经验",
    hot: 66
  },
  {
    id: "etl-engineer",
    name: "ETL 数据工程师",
    city: "广州",
    salary: "10-15K",
    skills: { "SQL": 5, "数据清洗": 5, "Python": 3, "Hadoop": 3 },
    notes: "数据清洗与 SQL 链路完整",
    hot: 74
  },
  {
    id: "product-analyst",
    name: "产品数据分析师",
    city: "深圳",
    salary: "12-16K",
    skills: { "SQL": 4, "统计": 4, "可视化": 3, "Python": 3, "Excel": 2 },
    notes: "A/B 测试与业务思维权重高",
    hot: 70
  }
];

/** 雷达图维度：取核心技能前 6 个标准技能 */
const RADAR_DIMENSIONS = ["SQL", "Python", "Excel", "Hadoop", "Spark", "可视化"];

/**
 * 岗位需求趋势（样本快照，非实时）
 * 数据岗需求方向参考：2026 年数据类岗位需求整体同比约 +22%，AI 推动数据平台需求上升
 */
const MARKET_TREND = {
  months: ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"],
  series: [
    { name: "数据分析师", data: [95, 90, 100, 97, 104, 110] },
    { name: "大数据开发", data: [78, 74, 82, 86, 90, 94] },
    { name: "数据挖掘", data: [50, 48, 52, 56, 60, 64] },
    { name: "BI 报表", data: [62, 60, 65, 68, 66, 70] }
  ]
};

/**
 * 技能需求热度（真实统计：200+ 初级数据分析岗 JD 技能出现频率）
 * 来源：Indeed/LinkedIn 初级数据分析岗招聘 JD 关键词统计
 */
const SKILL_HEAT = [
  { name: "SQL", value: 87 },
  { name: "Excel", value: 79 },
  { name: "可视化(BI)", value: 61 },
  { name: "Python", value: 54 },
  { name: "数据清洗", value: 48 },
  { name: "统计", value: 32 },
  { name: "机器学习", value: 28 },
  { name: "Hadoop", value: 22 }
];

/** 薪资分布（2026 年广州/深圳数据类初级岗位月薪区间占比 %，市场调研估算） */
const SALARY_DIST = [
  { range: "5-8K", value: 20 },
  { range: "8-10K", value: 27 },
  { range: "10-15K", value: 29 },
  { range: "15-20K", value: 16 },
  { range: "20K+", value: 8 }
];

/** 示例简历文本（一键演示用，取自真实校招简历结构） */
const DEMO_RESUME = `刘宗恒　求职意向：数据分析类
教育背景
广东工商职业技术大学　大数据工程技术（本科）　2023.09-2027.07
专业成绩排名前5%，连续两年获国家励志奖学金
主修课程：MySQL数据库、Python程序设计、Hadoop应用开发、数据采集与预处理、Web前端开发、数据可视化
项目经历
基于 Spark 的大数据分析实训项目（2026.06）
基于 Hadoop + Spark 完成全球地震数据（2.3万条）与 NBA 球员数据的全流程分析：使用 Pandas/PySpark 完成数据清洗与异常值处理，通过 Spark SQL 完成多维度统计分析，使用 ECharts/Plotly 输出可视化分析报告；
在 Ubuntu 环境独立完成 Hadoop 伪分布式与 Spark 集群部署。
基于 Hadoop HA 集群的分布式词频统计（2025.12）
构建 3 节点 Hadoop 高可用集群，配置 NameNode HA；上传文本至 HDFS 运行 MapReduce WordCount 任务。
实习经历
兴旺数据有限公司（国企）　数据处理实习生　2026.09 至今
负责数据收集、核对与汇总，完成数据清洗与格式标准化，累计处理数据3000+条；
使用 Excel 数据透视表完成多表关联核对，输出数据核对报表。
技能证书
熟练掌握 SQL（多表关联、聚合与分组查询）；熟练掌握 Excel（数据透视表、常用函数、图表）；
熟悉 Python（Pandas 数据清洗）；熟悉 Hadoop/HDFS 与 Spark SQL 的基本原理与使用；
会使用 ECharts 制作交互式图表；大学英语四级。`;
