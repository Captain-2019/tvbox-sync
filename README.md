# TVBox 源自动同步服务

手机端跑一个小服务，自动聚合全网 TVBox 源、验活、择优、合并成一份配置；
电视端 TVBox 只填一个固定地址，以后源失效了由手机自动补上，电视不用管。

## 原理

```
                 每 6 小时自动跑
[多个上游源] ──► tvbox_sync.py ──► 验活+打分+去重 ──► out/tvbox.json
  影视仓单仓                                          （唯一稳定入口）
  影视仓4K            ↑                                      │
  高天流云            │ 每6h                                 ↓
  欧歌/饭太硬     自动更新                              [小米电视]
                    (手机常驻)                  配置地址=http://192.168.x.x:8848/tvbox.json
```

关键点：**电视只认一个地址**。上游换域名、源失效、被删库，都由手机端吸收，电视端配置永远不用改。

## 一、手机端部署（Termux）

装 Termux（Play 商店版本已停更，务必用 **F-Droid 版**，否则装不了插件）：

```bash
# 1. 更新并安装 python
pkg update && pkg install python -y

# 2. 把 tvbox-sync 整个目录传到手机，例如 /sdcard/tvbox-sync
cd /sdcard/tvbox-sync

# 3. 启动
bash start.sh
```

启动后会打印你的地址：

```
  电视端填这个地址：
    http://192.168.1.23:8848/tvbox.json
  状态面板：  http://192.168.1.23:8848/
```

### 开机自启

1. Termux 里执行 `pkg install termux-boot -y`
2. 新建 `~/.termux/boot/start-tvbox.sh`：

```bash
#!/data/data/com.termux/files/usr/bin/bash
sleep 20            # 等手机联网
cd /sdcard/tvbox-sync
python3 tvbox_sync.py serve --port 8848
```

3. `chmod +x ~/.termux/boot/start-tvbox.sh`
4. 手机重启后自动拉起

### 防止被系统杀掉（重要）

国产 ROM 都会杀后台。三选一，**建议都做**：

- 设置 → 应用管理 → Termux → 电池优化 → 选「无限制」
- 设置里允许 Termux 自启动、后台运行、省流量
- 电脑连一次 USB 执行（可选，一次性）：
  ```
  adb shell dumpsys deviceidle whitelist +com.termux
  ```

---

## 二、电视端配置

小米电视打开 TVBox → **设置** → **配置地址** → 粘贴手机地址 → 确定。

建议用**多地址竖线分隔**，多写几个自家地址兜底（部分版本支持）：

```
http://192.168.1.23:8848/tvbox.json
```

> 电视和手机要在同一个 WiFi 下。若电视连的是同一路由，手机开热点给电视也行，此时地址变成手机热点 IP（通常是 `192.168.43.1`）。

**IP 变了怎么办**：在路由器里给手机做 IP 绑定（DHCP 静态分配），或用下面的小米电视绑定域名。更省事的做法见第四节的云端方案。

---

## 三、自定义源

编辑 `sources.json`，`urls` 按优先级排，第一个成功就用它，失败自动降级到下一个：

```json
{
  "id": "my_source",
  "name": "我的源",
  "urls": [
    "https://example.com/tvbox.json",
    "https://gh-proxy.com/https://example.com/tvbox.json"
  ]
}
```

改完在手机执行 `python3 tvbox_sync.py update` 立即生效。

**发现源加不进去？** 大概率是路径错了。用这条命令查仓库真实文件名（注意中文名要 URL 编码）：

```bash
curl -s "https://data.jsdelivr.com/v1/package/gh/<用户名>/<仓库>@main/flat" | head -c 3000
```

## 常用命令

```bash
python3 tvbox_sync.py update          # 立刻采集一次
python3 tvbox_sync.py serve           # 采集 + 起服务（默认 6 小时一轮）
python3 tvbox_sync.py serve --interval 3600    # 改成 1 小时
python3 tvbox_sync.py serve --port 9000       # 换端口
```

手机浏览器打开 `http://<手机IP>:8848/` 有一个状态面板，能看到每个源的死活、速度、站点数和健康度，点一下直接复制地址。

---

## 四、进阶：云端方案（手机不开机也能用）

如果你不想让手机一直亮着（或者电视经常不连手机热点），把执行位置挪到云上。
**推荐做法：GitHub Actions + Pages**，本目录已提供现成的工作流文件，照着做约 10 分钟：

```bash
# 仓库必须设为 Public，新建后按结构上传文件即可
git init && git remote add origin https://github.com/Captain-2019/tvbox-sync.git
git add . && git commit -m "init" && git push -u origin main
```

然后：Settings → Pages → Source 选 GitHub Actions → Actions 里手动 Run workflow 一次。
完成后电视端填 `https://Captain-2019.github.io/tvbox-sync/tvbox.json`。

**完整图文步骤、cron 频率修改、404 排查、国内访问加速，都见 [`CLOUD_DEPLOY.md`](CLOUD_DEPLOY.md)。**

其他备选：
- **家里 NAS / 软路由 / 树莓派**：和手机方案完全同一套代码，把 `serve` 配成开机自启即可，24 小时内网在线
- **手机只做采集、定时推云端**：Termux 加一条 crontab，`update` 之后 `git push`，由 Pages 承担分发

---

## 五、常见问题

**Q：能不能把找源和筛选直接放在电视上跑？用 USB 连电脑帮我配置？**

两件事都做不到，原因不在操作而在系统限制：

- **电视跑不了脚本。** 小米电视是 Android TV 定制系统，没有 Termux / Python / bash，应用商店受管控装不了这些。即使把脚本文件塞进电视，**没有运行时去执行它**，等于放了个没插电的电器。
- **USB 连不上调试通道。** USB 供电时设备走文件传输协议（MTP），**不暴露 ADB 接口**；小米电视出于安全设计基本无法进入 USB 调试模式，很多型号开发者选项里该开关是灰的。所以无法远程推文件、下指令。

真正想达到的效果（电视端不用管、源自动更新）请用上面第一或第四节 —— 要么手机常驻，要么挪到云端，脚本始终跑在手机/NAS/GitHub 上，而不是电视。

**Q：电视提示「配置地址无效」？**
按顺序排查：手机服务还在跑吗（浏览器能打开状态面板吗）→ IP 对不对 → 电视和手机同网段吗 → 部分版本不支持 `http://` 明文，试试手机端开热点。用云端方案则检查是不是把 `.../tvbox-sync` 后面的 `tvbox.json` 漏写了。

**Q：能填多个配置地址吗？**
新版 TVBox 支持竖线 `|` 分隔多个地址做自动 fallback：
```
http://192.168.1.23:8848/tvbox.json|https://你的CDN/tvbox.json
```

**Q：为什么收集到的站有些点不开？**
聚合器只能验活到「接口能响应」，具体某个影视站是否可解析要看它自己有没有被关停。面板里的「健康」列显示抽样存活数，健康度低的源排序会自动靠后。

**Q：接口被反爬返回挑战页？**
脚本已处理：自动剔除 `//` 注释、兼容未转义控制字符、清洗 JSONP 包裹。若某源仍被拦，在 `sources.json` 里给它换个镜像地址。

---

## 安全提示

这套方案只做两件事：抓取公开 JSON 配置、合并后本地 HTTP 服务。**不上传任何数据、不劫持请求、不改流量**。但 TVBox 类聚合源的内容来源杂、版权状况不明，仅供个人家庭观看，请勿用于商业或公开分发。上游第三方仓库的内容不由本项目保证。