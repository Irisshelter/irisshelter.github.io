#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
知简 · 全量招聘数据解析脚本（通用化版）

从《27届秋招春招实习汇总表.xlsx》解析出【全方向】招聘数据，
不再预先锁定"数据类"方向，而是保留每家企业原始的「校招岗位」原文，
供前端在用户提交简历后【动态匹配】对口企业。

输出：
  data/real_jobs.json   —— 全量企业（含 jobs 岗位原文数组 + 归一化字段）
  data/real_companies.js —— 内联进 data.js 的 JS 数组
  js/data.js            —— 自动替换 REAL_COMPANIES 占位内容

与原 sync.py 的区别：
  1. 不丢弃岗位原文，保留完整 jobs 数组
  2. 不再只过滤"数据类"方向，全方向保留
  3. 按公司聚合时，合并同一公司的多个岗位
"""

import os, re, json
import openpyxl
from collections import Counter

XLSX_PATH = os.environ.get(
    "XLSX_PATH",
    r"C:/Users/Iris/WorkBuddy/2026-10-13-11-26-59/27届秋招春招实习汇总表.xlsx",
)


def norm_nature(n):
    n = str(n or "").strip()
    if any(k in n for k in ["国企", "央企", "央国企", "银行", "事业", "社会机构"]):
        return "国企/事业"
    if any(k in n for k in ["外企", "合资", "港澳台", "外资"]):
        return "外企/合资"
    return "民企"


def norm_degree(d):
    d = str(d or "").strip().replace(" ", "")
    if "硕士" in d or "博士" in d:
        return "硕士起"
    if "大专" in d or "专科" in d:
        return "大专起"
    if "本科" in d:
        return "本科起"
    if "不限" in d:
        return "不限"
    return "本科起"


def estimate_size(company):
    big_kw = ["中国移动", "中国电信", "中国联通", "腾讯", "字节", "阿里", "华为",
              "京东", "美团", "网易", "百度", "快手", "小米", "拼多多", "招商银行",
              "平安", "中信", "广发", "工商", "建设", "农业", "中国银行", "比亚迪",
              "联想", "海尔", "美的", "格力", "顺丰", "360", "海康", "大疆", "中兴",
              "中国铁路", "中石油", "中石化", "国家电网", "南方电网", "中建", "中铁",
              "中国电子", "中国电科", "中国船舶", "中国兵器", "中国航空", "三峡"]
    return "大厂" if any(k in company for k in big_kw) else "中厂"


def split_jobs(raw):
    """把「校招岗位」原文拆成独立岗位列表。
    原文可能是换行分隔的多个岗位，也可能是逗号/顿号分隔。
    """
    if not raw:
        return []
    s = str(raw)
    # 先按换行拆
    parts = re.split(r"[\n\r]+", s)
    out = []
    for p in parts:
        p = p.strip()
        if not p:
            continue
        # 再按逗号/顿号/分号拆（但要保留含逗号的完整岗位名，如"数据分析师，初级"）
        # 这里只对明显是并列枚举的情况拆分
        for seg in re.split(r"[、；;]", p):
            seg = seg.strip()
            if seg and len(seg) <= 40:
                out.append(seg)
    # 去重、去空
    seen = set()
    res = []
    for j in out:
        if j not in seen:
            seen.add(j)
            res.append(j)
    return res


def main():
    if not os.path.exists(XLSX_PATH):
        print(f"⚠ 找不到数据文件: {XLSX_PATH}")
        return

    wb = openpyxl.load_workbook(XLSX_PATH, read_only=True, data_only=True)
    ws = wb["秋招汇总表"]
    header = None
    raw_rows = []
    for i, row in enumerate(ws.iter_rows(values_only=True)):
        if i == 0:
            header = list(row)
            continue
        raw_rows.append(dict(zip(header, row)))
    print(f"✅ 读取 {len(raw_rows)} 条原始记录")

    # 按公司聚合
    companies = {}
    for r in raw_rows:
        company = str(r.get("公司名称") or "").strip()
        link = str(r.get("投递链接") or "").strip()
        if not company:
            continue
        if not link.startswith("http"):
            continue

        jobs = split_jobs(r.get("校招岗位"))
        degree = norm_degree(r.get("学历"))
        nature = norm_nature(r.get("企业性质"))

        key = company
        if key not in companies:
            companies[key] = {
                "company": company,
                "nature": nature,
                "link": link,
                "degree": degree,
                "deadline": str(r.get("网申截止") or "").strip() or "尽快投递",
                "city": str(r.get("工作地点") or "").strip(),
                "industry": str(r.get("公司行业") or "").strip(),
                "jobs": jobs,
                "tags": [],
            }
        else:
            c = companies[key]
            # 合并岗位
            for j in jobs:
                if j not in c["jobs"]:
                    c["jobs"].append(j)
            # 学历取更宽松的（有本科起就降为本科起）
            if c["degree"] == "硕士起" and degree == "本科起":
                c["degree"] = "本科起"

        # 标签提取
        remark = str(r.get("备注") or "")
        tags = []
        if "可转正" in remark:
            tags.append("可转正")
        if "大厂" in remark or "品牌" in remark:
            tags.append("大厂")
        for t in tags:
            if t not in companies[key]["tags"]:
                companies[key]["tags"].append(t)

    out = []
    for c in companies.values():
        # 过滤掉没有岗位信息的企业
        if not c["jobs"]:
            continue
        out.append({
            "company": c["company"],
            "nature": c["nature"],
            "link": c["link"],
            "degree": c["degree"],
            "deadline": c["deadline"],
            "city": c["city"],
            "industry": c["industry"],
            "jobs": c["jobs"],
            "tags": c["tags"],
        })

    # 排序：国企优先，大厂优先
    def score(o):
        s = 0
        if o["nature"] == "国企/事业":
            s += 100
        if "大厂" in o["tags"]:
            s += 50
        return -s
    out.sort(key=score)

    here = os.path.dirname(os.path.abspath(__file__))
    # 1) real_jobs.json
    with open(os.path.join(here, "real_jobs.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)

    # 2) real_companies.js（内联进 data.js）
    comps = [{
        "name": o["company"],
        "type": "国企" if "国企" in o["nature"] else ("外企" if "外企" in o["nature"] else "民企"),
        "size": estimate_size(o["company"]),
        "status": "在招",
        "link": o["link"],
        "jobs": o["jobs"],
        "degree": o["degree"],
        "city": o["city"],
        "industry": o["industry"],
        "tags": o["tags"],
        "deadline": o["deadline"],
    } for o in out]
    js = "const REAL_COMPANIES = " + json.dumps(comps, ensure_ascii=False, indent=1) + ";"
    with open(os.path.join(here, "real_companies.js"), "w", encoding="utf-8") as f:
        f.write(js)

    # 3) 替换 js/data.js 里的 REAL_COMPANIES 数组
    data_js_path = os.path.join(here, "..", "js", "data.js")
    with open(data_js_path, "r", encoding="utf-8") as f:
        data_js = f.read()
    m = re.search(r"const REAL_COMPANIES = \[.*?\];", data_js, re.S)
    if m:
        data_js = data_js[:m.start()] + js + data_js[m.end():]
        with open(data_js_path, "w", encoding="utf-8") as f:
            f.write(data_js)

    c = Counter(o["nature"] for o in out)
    print(f"✅ 生成 {len(out)} 家企业（含岗位原文，全方向）")
    print(f"   国企/事业 {c.get('国企/事业',0)} · 民企 {c.get('民企',0)} · 外企 {c.get('外企/合资',0)}")
    total_jobs = sum(len(o["jobs"]) for o in out)
    print(f"   岗位条目总数：{total_jobs}")
    print("✅ 已更新 data/real_jobs.json、data/real_companies.js、js/data.js")


if __name__ == "__main__":
    main()
