# 部署状态：已完成 ✅

部署已全部完成，电视端可以直接用了。

## 电视端填这个地址

```
https://captain-2019.github.io/tvbox-sync/tvbox.json
```

国内访问慢的话换这个（走 jsDelivr CDN）：
```
https://cdn.jsdelivr.net/gh/Captain-2019/tvbox-sync@main/out/tvbox.json
```

电视端操作：TVBox → 设置 → 配置地址 → 粘贴 → 确定。

## 当前线上状态

| 项目 | 状态 |
|---|---|
| 仓库 | https://github.com/Captain-2019/tvbox-sync |
| Pages 源 | GitHub Actions（已切到正确模式） |
| 自动更新 | 每 6 小时一次，北京时间 01:17 / 07:17 / 13:17 / 19:17 |
| 聚合站点 | 268 个 |
| 直播源 | 8 组 |
| 解析器 | 34 个 |
| 源可用率 | 5/5 |

在线产物：
- `tvbox.json` — 电视订阅用
- `live.json` — 直播源
- `status.json` — 采集状态
- `status.html` — 可视化面板（浏览器打开）

---

## 以后怎么改源

改本地 `sources.json` 后推送：

```bash
cd D:/工作/workbudy/2026-10-07-08-43-46/tvbox-sync
# 编辑 sources.json
git add sources.json && git commit -m "update sources" && git push
```

或者直接在 GitHub 网页上编辑 `sources.json`，提交后自动触发一次运行。

想立刻看结果：Actions 页面 → Update TVBox config → Run workflow。

---

## 部署过程中踩的三个坑（已解决，供以后参考）

**1. Pages 源选错导致 404**
最初把 Pages 设成「Deploy from a branch」，它发布的是仓库根目录（渲染成 README 页面），而配置文件在 `out/` 下，所以 `/tvbox.json` 一直 404。
解决：把 Pages 源改成 **GitHub Actions**，由工作流的 `upload-pages-artifact` + `deploy-pages` 发布 `out/` 目录。

**2. GitHub 内置 Jekyll 模板会抢跑**
把源切到 GitHub Actions 后，GitHub 自动套用 `jekyll-build-pages` 模板跑了一次，只发布根目录，把正确产物覆盖了。
解决：**不要依赖 push 自动触发**（工作流里的 `push` 触发器已用 `paths-ignore` 排除 md 文件），改用 Actions 页面手动 Run workflow，或等定时任务。

**3. 国内代理对 github.com 主站不稳**
`git push` 多次 `CONNECT tunnel failed 502`，但 `api.github.com` 正常。
解决：改用 GitHub API（blob → tree → commit → ref 四步）推送，绕开 git 协议。本机 git 凭据已由 GCM 缓存（`PortableGit/mingw64/bin/git-credential-manager.exe`）。

---

## 排查

**想看源的死活**：浏览器打开 `https://captain-2019.github.io/tvbox-sync/status.html`

**Actions 报错**：`https://github.com/Captain-2019/tvbox-sync/actions` 点进失败的那次看日志

**想改成 1 小时一次**：编辑 `.github/workflows/update.yml` 的 cron，注意是 **UTC 时间**，北京 = UTC+8。改成 `*/60 * * * *` 是每小时的第 0 分钟，但 GitHub 有随机延迟，实际可能推后 5～10 分钟。