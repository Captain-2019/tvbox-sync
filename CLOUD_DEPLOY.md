# 云端部署指南（手机不用开机）

如果你不想让手机一直亮着，或者电视经常连不上手机热点，用云端方案：
**GitHub 的服务器替你跑采集脚本**，电视从公网地址订阅，24 小时随时可用。

## 原理

```
GitHub Actions 每 6 小时 ──► 跑 tvbox_sync.py ──► 自动 commit ──► GitHub Pages
                                                                  │
                                                          tvbox.json（公网地址）
                                                                  ↓
                                                          小米电视 TVBox
```

配置更新后自动 commit，所以 Pages 地址**永远是最新版**，电视端不用管。

## 部署步骤（一次性，约 10 分钟）

### 1. 建仓库

打开 https://github.com/new，仓库名填 `tvbox-sync`（名字随意）。
**必须选 Public** —— GitHub 私有仓库的 Pages 需要付费套餐。

### 2. 上传文件

把本目录这几个文件按对应路径提交上去：

```
tvbox-sync/
├── sources.json              ← 源清单，你可以改
├── tvbox_sync.py
├── gen_status_page.py
└── .github/
    └── workflows/
        └── update.yml        ← 定时任务配置（已提供）
```

本地已有 git，直接推送最快：

```bash
cd tvbox-sync
git init
git remote add origin https://github.com/Captain-2019/tvbox-sync.git
git add .
git commit -m "init"
git push -u origin main
```

### 3. 开启 Pages

仓库 → **Settings** → 左侧 **Pages** → Source 下拉选 **GitHub Actions** → Save。

### 4. 首次运行

仓库 → **Actions** 标签页 → 左侧选 **Update TVBox config** → 右侧 **Run workflow**。

等待约 2 分钟，绿色勾即成功。

### 5. 电视端填写

访问验证：

```
https://Captain-2019.github.io/tvbox-sync/tvbox.json
```

能打开一段 JSON 就说明部署成功。然后在电视 TVBox 设置里填这个地址。

> **国内访问慢？** GitHub Pages 在国内时快时慢。两个办法：
> 1. 用 CDN 镜像前缀：`https://cdn.jsdelivr.net/gh/Captain-2019/tvbox-sync@main/out/tvbox.json`
> 2. 套代理：`https://gh-proxy.com/https://Captain-2019.github.io/tvbox-sync/tvbox.json`

## 定时频率在哪改

`.github/workflows/update.yml` 里的 cron：

```yaml
- cron: '17,23 5,11,17,23 * * *'
```

这是 **UTC 时间**。对应北京时间：`13:17 / 19:17 / 01:17 / 07:17`。
想改成每天凌晨 3 点跑一次：`- cron: '0 19 * * *'`（UTC 19:00 = 北京次日 3:00）。

## 排查

**Actions 显示黄色警告？** 仓库 Settings → Actions → General → Workflow permissions → 选 **Read and write permissions**。不选的话自动 commit 会失败（不过 Pages 部分仍可用，因为产物是直接上传的）。

**Pages 404？** 确认 Steps 7 开了 Pages；或把 workflow 里 `update` 和 `deploy` 合并成一步更省事。

**想改成 1 小时一次？** GitHub Actions 对公开仓库的 schedule 有最小间隔和随机延迟，实际可能延迟 5～10 分钟。想更实时就改 `sources.json` 里的源，加更多冗余源比提高频率更有用。

## 成本

GitHub Actions 对公开仓库**免费**，每月 2000 分钟额度。定时任务一天只跑 4 次，每次约 20 秒，一天的消耗不到 1 分钟，免费额度绰绰有余。