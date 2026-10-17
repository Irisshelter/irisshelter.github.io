# 飞书多维表格实时同步说明

知简的「数据市场」真实企业数据来自你的飞书多维表格《27 届秋招春招实习汇总表》。
当前版本用的是**静态快照**（已解析 587 家数据类企业），要让数据「今天和明天不同」，
需要接入飞书开放 API 实时拉取。

## 一、为什么现在不是实时的

飞书多维表格的链接需要**登录授权**才能读取。要实时拉取，需要走飞书开放平台的
**自建应用 + 多维表格 API**，拿到三样凭证。这三样是你飞书账号下的授权信息，我这边无法代办。

## 二、你需要准备的三样凭证

| 凭证 | 在哪拿 | 说明 |
|---|---|---|
| `FEISHU_APP_ID` | 飞书开放平台 → 自建应用 | 形如 `cli_xxxx` |
| `FEISHU_APP_SECRET` | 同上，应用凭证页 | 形如一串随机字符 |
| `FEISHU_APP_TOKEN` | 表格 URL 里的 base id | 你的表格是 `FBysbrfNWa22l7s6a2scDsfEnTf` |
| `FEISHU_TABLE_ID` | 表格里目标数据表的 id | 你的数据表是 `tblPA2KMUBFbcATH` |

> 获取 App ID / Secret 步骤：open.feishu.cn → 开发者后台 → 创建「企业自建应用」→
> 添加「多维表格」权限（`bitable:app:readonly`）→ 发布版本 → 把应用授权到你的表格。

## 三、运行同步

设置环境变量后运行脚本即可（脚本只读，不改你的表格）：

```bash
export FEISHU_APP_ID="cli_xxx"
export FEISHU_APP_SECRET="xxx"
export FEISHU_APP_TOKEN="FBysbrfNWa22l7s6a2scDsfEnTf"
export FEISHU_TABLE_ID="tblPA2KMUBFbcATH"
python data/sync.py
```

脚本会：
1. 用 tenant_access_token 分页拉取全部记录
2. 清洗（按公司聚合、方向归类、学历归一化、去重）
3. 生成 `data/real_jobs.json` + `data/real_companies.js`，并自动替换 `js/data.js` 里的真实企业数组

## 四、字段映射

飞书表格字段 → 知简数据结构：

| 飞书字段 | 知简字段 | 处理 |
|---|---|---|
| 公司名称 | company | 直接 |
| 校招岗位 | dirs | 关键词提取数据方向（数据分析/大数据/BI 等） |
| 企业性质 | type | 归一化为 国企/民企/外企 |
| 学历 | degree | 归一化为 本科起/硕士起 |
| 工作地点 | city | 直接 |
| 公司行业 | industry | 直接 |
| 投递链接 | link | 只保留 http 链接 |
| 网申截止 | deadline | 直接，空则"尽快投递" |
| 备注 | tags | 提取"可转正/大厂"标签 |

## 五、临时方案（不接 API 也能更新）

如果不方便接飞书 API，也可以手动更新：重新从飞书导出 xlsx，
放到项目里，然后告诉我，我用解析脚本（同 `sync.py` 的清洗逻辑）重新生成数据即可。
