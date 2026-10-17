#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
知简 · 真实招聘数据同步脚本（飞书多维表格开放 API）

用途：
  从飞书多维表格（27 届秋招/春招/实习汇总表）拉取最新招聘数据，
  清洗后生成 data/real_jobs.json 与 data/real_companies.js，
  供知简前端加载，实现"今天和明天的数据不同"。

前置条件：
  1. 在飞书开放平台 https://open.feishu.cn 创建自建应用，开通
     多维表格读写权限，拿到 App ID / App Secret。
  2. 将应用授权到目标多维表格（app_token = 表格 URL 里的 base id）。
  3. 本脚本只读，不改动你的飞书表格。

用法：
  设置环境变量后运行：
    export FEISHU_APP_ID="cli_xxx"
    export FEISHU_APP_SECRET="xxx"
    export FEISHU_APP_TOKEN="FBysbrfNWa22l7s6a2scDsfEnTf"
    export FEISHU_TABLE_ID="tblPA2KMUBFbcATH"   # 目标数据表
    python sync.py

输出：
  data/real_jobs.json      —— 清洗后的 JSON（机器可读）
  data/real_companies.js   —— 内联进 data.js 的 JS 数组
  js/data.js               —— 自动替换 REAL_COMPANIES 占位内容
"""
import os, re, json, urllib.request, urllib.parse
from collections import Counter

APP_ID = os.environ.get("FEISHU_APP_ID", "")
APP_SECRET = os.environ.get("FEISHU_APP_SECRET", "")
APP_TOKEN = os.environ.get("FEISHU_APP_TOKEN", "")
TABLE_ID = os.environ.get("FEISHU_TABLE_ID", "")

BASE = "https://open.feishu.cn/open-apis"


def get_token():
    url = BASE + "/auth/v3/tenant_access_token/internal"
    body = json.dumps({"app_id": APP_ID, "app_secret": APP_SECRET}).encode()
    req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"})
    r = json.load(urllib.request.urlopen(req))
    if r.get("code") != 0:
        raise RuntimeError(f"获取 token 失败: {r}")
    return r["tenant_access_token"]


def fetch_records(token, page_token=None):
    """分页拉取多维表格记录（最多 500 条/页）"""
    url = BASE + f"/bitable/v1/apps/{APP_TOKEN}/tables/{TABLE_ID}/records"
    params = {"page_size": 500}
    if page_token:
        params["page_token"] = page_token
    url += "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    r = json.load(urllib.request.urlopen(req))
    if r.get("code") != 0:
        raise RuntimeError(f"拉取记录失败: {r}")
    return r


def norm_nature(n):
    n = str(n or "").strip()
    if any(k in n for k in ["国企", "央企", "银行", "事业", "社会机构"]):
        return "国企/事业"
    if any(k in n for k in ["外企", "合资", "港澳台"]):
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


DIR_KW = [
    ("数据分析", "数据分析"), ("数据分析师", "数据分析"),
    ("商业分析", "商业分析"), ("经营分析", "经营分析"),
    ("风险分析", "风险分析"), ("策略分析", "策略分析"),
    ("数据挖掘", "数据挖掘"),
    ("数据开发", "数据开发"), ("数据仓库", "数据开发"),
    ("数仓", "数据开发"), ("数据工程", "数据开发"), ("ETL", "数据开发"),
    ("大数据", "大数据"), ("数据运营", "数据运营"),
    ("BI", "BI"), ("报表", "BI"),
]


def extract_dirs(job):
    j = str(job or "")
    dirs = []
    for kw, label in DIR_KW:
        if kw in j and label not in dirs:
            dirs.append(label)
    return dirs


def estimate_size(company):
    big_kw = ["中国移动", "中国电信", "中国联通", "腾讯", "字节", "阿里", "华为",
              "京东", "美团", "网易", "百度", "快手", "小米", "拼多多", "招商银行",
              "平安", "中信", "广发", "工商", "建设", "农业", "中国银行", "比亚迪",
              "联想", "海尔", "美的", "格力", "顺丰", "360", "海康", "大疆", "中兴"]
    return "大厂" if any(k in company for k in big_kw) else "中厂"


def process(raw_fields):
    """把飞书记录字段映射成标准结构，返回 dict 或 None"""
    # 飞书多维表格的字段名可能带前缀，这里按常见字段名兜底匹配
    def pick(*keys):
        for k in keys:
            for fk, fv in raw_fields.items():
                if fk == k and fv:
                    if isinstance(fv, list):  # 飞书文本字段是 [{text:...}]
                        return "".join(x.get("text", "") for x in fv if isinstance(x, dict))
                    if isinstance(fv, str):
                        return fv
        return ""

    job = pick("校招岗位", "岗位", "职位")
    company = pick("公司名称", "公司", "企业")
    link = pick("投递链接", "链接")
    if not job or not company:
        return None
    dirs = extract_dirs(job)
    if not dirs:
        return None
    if not link.startswith("http"):
        return None
    return {
        "company": company,
        "job": job[:80],
        "dirs": dirs[:6],
        "nature": norm_nature(pick("企业性质", "性质")),
        "degree": norm_degree(pick("学历")),
        "city": pick("工作地点", "地点", "城市")[:40],
        "industry": pick("公司行业", "行业")[:20],
        "deadline": pick("网申截止", "截止") or "尽快投递",
        "link": link,
        "tags": [t for t in ["可转正", "大厂"] if t in pick("备注", "标签")],
    }


def main():
    if not all([APP_ID, APP_SECRET, APP_TOKEN, TABLE_ID]):
        print("⚠ 请先设置环境变量 FEISHU_APP_ID / FEISHU_APP_SECRET / FEISHU_APP_TOKEN / FEISHU_TABLE_ID")
        print("详见 data/sync.md")
        return

    token = get_token()
    print("✅ 已获取飞书 tenant_access_token")

    records = []
    page_token = None
    while True:
        r = fetch_records(token, page_token)
        items = r.get("data", {}).get("items", [])
        records.extend(items)
        if not r.get("data", {}).get("has_more"):
            break
        page_token = r["data"]["page_token"]
    print(f"✅ 拉取 {len(records)} 条记录")

    # 按公司聚合
    companies = {}
    for item in records:
        fields = item.get("fields", {})
        obj = process(fields)
        if not obj:
            continue
        key = obj["company"]
        if key not in companies:
            companies[key] = obj
        else:
            c = companies[key]
            for d in obj["dirs"]:
                if d not in c["dirs"]:
                    c["dirs"].append(d)
            if c["degree"] == "硕士起" and obj["degree"] == "本科起":
                c["degree"] = "本科起"
            for t in obj["tags"]:
                if t not in c["tags"]:
                    c["tags"].append(t)

    out = []
    for c in companies.values():
        out.append({
            "company": c["company"], "nature": c["nature"], "link": c["link"],
            "degree": c["degree"], "deadline": c["deadline"], "city": c["city"],
            "industry": c["industry"], "dirs": c["dirs"], "tags": c["tags"],
        })

    def score(o):
        s = 0
        if any(d in o["dirs"] for d in ["数据分析", "商业分析", "BI", "数据运营", "经营分析"]):
            s += 100
        if any(d in o["dirs"] for d in ["数据开发", "大数据", "数据挖掘"]):
            s += 50
        if o["nature"] == "国企/事业":
            s += 20
        if "大厂" in o["tags"]:
            s += 10
        return -s
    out.sort(key=score)

    here = os.path.dirname(os.path.abspath(__file__))
    # 1) real_jobs.json
    jobs_path = os.path.join(here, "real_jobs.json")
    with open(jobs_path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)

    # 2) real_companies.js
    comps = [{
        "name": o["company"], "type": "国企" if "国企" in o["nature"] else ("外企" if "外企" in o["nature"] else "民企"),
        "size": estimate_size(o["company"]), "status": "在招", "link": o["link"],
        "dirs": o["dirs"], "degree": o["degree"], "city": o["city"],
        "industry": o["industry"], "tags": o["tags"], "deadline": o["deadline"],
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
    print(f"✅ 生成 {len(out)} 家企业 | 国企/事业 {c.get('国企/事业',0)} · 民企 {c.get('民企',0)} · 外企 {c.get('外企/合资',0)}")
    print("✅ 已更新 data/real_jobs.json、data/real_companies.js、js/data.js")


if __name__ == "__main__":
    main()
