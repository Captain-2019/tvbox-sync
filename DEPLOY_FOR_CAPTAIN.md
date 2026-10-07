# 给 Captain-2019 的部署清单

已把你的账号信息填好，仓库已初始化、文件已暂存。你只需要做两件事。

## 你的专属地址

```
https://Captain-2019.github.io/tvbox-sync/tvbox.json
```

国内慢的话用这个（走 CDN 缓存）：
```
https://cdn.jsdelivr.net/gh/Captain-2019/tvbox-sync@main/out/tvbox.json
```

---

## 第一步：在 GitHub 建仓库并推送（3 分钟）

浏览器打开这个页面：

```
https://github.com/new?name=tvbox-sync&description=TVBox%20source%20auto-sync&public=1
```

**关键：`Public` 一定要选中**（Private 的 Pages 需要付费）。

填完点 **Create repository**，然后在项目页面点绿色 **Code** 按钮 → 复制 HTTPS 地址。

回到本机执行：

```bash
cd D:/工作/workbudy/2026-10-07-08-43-46/tvbox-sync
git remote add origin https://github.com/Captain-2019/tvbox-sync.git
git commit -m "init: tvbox sync service"
git push -u origin main
```

推送时会要求登录，选用**浏览器打开授权**即可（不要选密码，GitHub 已不支持密码推送）。

---

## 第二步：开启 Pages（1 分钟）

推送成功后，打开：

```
https://github.com/Captain-2019/tvbox-sync/settings/pages
```

**Source** 下拉框选 **GitHub Actions** → 点 **Save**。

---

## 第三步：触发首次运行（2 分钟）

打开：

```
https://github.com/Captain-2019/tvbox-sync/actions
```

左侧选 **Update TVBox config** → 右侧 **Run workflow** → 等约 2 分钟出现绿色勾。

---

## 第四步：电视端验证

浏览器打开确认能拿到 JSON：

```
https://Captain-2019.github.io/tvbox-sync/tvbox.json
```

能看到 `{ "sites": ... }` 就成功了。

然后电视 → TVBox → 设置 → 配置地址 → 粘贴上面地址 → 确定。

---

## 可能遇到的坑

**Actions 报 `Resource not accessible by integration`**
去 `https://github.com/Captain-2019/tvbox-sync/settings/actions` 把 Workflow permissions 改成 **Read and write permissions**。

**Pages 打开是 404**
第一次运行要等 1～2 分钟构建缓存。若 10 分钟后仍 404，回 Actions 看红色报错的日志。

**Actions 页面根本没有定时任务**
GitHub 对**新建仓库的 schedule 有 15 分钟内不执行的延迟**，且公共仓库的定时任务偶尔会延迟 5～10 分钟。等一会儿或手动 Run 一次即可。

**git push 时提示 repository not found**
多半是仓库名打错了，确认是 `tvbox-sync`（全小写）。

---

## 之后怎么改源

改 `sources.json` 里的源列表，push 上去，Actions 会自动跑一次重新聚合。

```bash
# 编辑 sources.json 后
git add sources.json && git commit -m "update sources" && git push
```

想立刻看结果，Actions 里手动 Run workflow 一次。