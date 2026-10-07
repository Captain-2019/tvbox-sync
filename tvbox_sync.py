#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
TVBox 配置聚合器  tvbox_sync.py

作用：
  1) 定时拉取多个上游 TVBox/影视仓 配置接口
  2) 清洗脏 JSON（BOM / 注释 / 尾逗号 / 控制字符）
  3) 验活 + 打分（速度、站点数、可用率）并按分数排序
  4) 合并输出一份干净的 tvbox.json + 直播源
  5) 起一个 HTTP 服务，手机/电视填一个固定地址即可自动同步

用法：
  python3 tvbox_sync.py update     # 只跑一次采集更新
  python3 tvbox_sync.py serve      # 采集 + 启动 HTTP 服务（常驻，推荐）
  python3 tvbox_sync.py check      # 只验活，看哪些源能用

只依赖 Python 标准库，无需 pip install。
"""

import os
import re
import sys
import json
import time
import socket
import argparse
import threading
import urllib.parse
import urllib.request
import urllib.error
from concurrent.futures import ThreadPoolExecutor, as_completed
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

# ======================= 配置区 =======================
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(BASE_DIR, "out")
SOURCES_FILE = os.path.join(BASE_DIR, "sources.json")

PORT = 8848                  # 服务端口
UPDATE_INTERVAL = 6 * 3600   # 采集间隔（秒），默认 6 小时
FETCH_TIMEOUT = 12           # 单个接口拉取超时
PROBE_TIMEOUT = 8            # 抽样验活超时
PROBE_PER_SOURCE = 3         # 每个源抽样验活的站点数

UA = "Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36"
# ========================================================


def log(msg):
    print("[%s] %s" % (time.strftime("%H:%M:%S"), msg), flush=True)


# ---------------- URL 处理：中文域名转 punycode ----------------
def normalize_url(url):
    url = (url or "").strip().strip("'\"")
    if not url:
        return ""
    if not re.match(r"^https?://", url, re.I):
        url = "http://" + url
    try:
        p = urllib.parse.urlsplit(url)
        host = p.hostname or ""
        # 关键：urllib 不像 requests 会自动 punycode，中文域名必须手动转
        try:
            host.encode("ascii")
        except UnicodeEncodeError:
            host = host.encode("idna").decode("ascii")
            url = urllib.parse.urlunsplit((p.scheme, host, p.path, p.query, p.fragment))
    except Exception:
        return url
    return url


# ---------------- HTTP 拉取 ----------------
def http_get(url, timeout=FETCH_TIMEOUT, binary=False):
    """返回 (ok, data_bytes_or_str, err, elapsed_ms)"""
    t0 = time.time()
    req = urllib.request.Request(url, headers={
        "User-Agent": UA,
        "Accept": "*/*",
        "Accept-Language": "zh-CN,zh;q=0.9",
    })
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read()
            ms = int((time.time() - t0) * 1000)
            if binary:
                return True, raw, "", ms
            for enc in ("utf-8", "gbk", "gb18030", "utf-8-sig"):
                try:
                    return True, raw.decode(enc), "", ms
                except UnicodeDecodeError:
                    continue
            return True, raw.decode("utf-8", "replace"), "", ms
    except urllib.error.HTTPError as e:
        return False, "", "HTTP %d" % e.code, int((time.time() - t0) * 1000)
    except Exception as e:
        return False, "", type(e).__name__ + ": " + str(e)[:80], int((time.time() - t0) * 1000)


# ---------------- 脏 JSON 清洗 ----------------
_CTRL = dict.fromkeys(range(0x00, 0x20), " ")


def clean_json_text(text):
    if text is None:
        return None
    text = text.replace("\ufeff", "").strip()
    # 去掉 JSONP 包裹
    m = re.match(r"^[^({\[]*\((.*)\)[^)}\]]*$", text, re.S)
    if m:
        text = m.group(1).strip()
    # 去 BOM / 不可见控制字符
    text = text.translate(_CTRL)
    # 去 // 行注释（避开 URL 里的 //）
    text = re.sub(r"(^|\s)//[^\n\r]*", r"\1", text)
    # 去 /* */ 块注释
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
    # 去对象/数组结尾多余的逗号
    text = re.sub(r",\s*([}\]])", r"\1", text)
    return text.strip()


def parse_config(text):
    """解析上游配置，兼容 纯config / 包裹在 sites 的情况"""
    text = clean_json_text(text)
    if not text:
        return None
    for attempt in (text, text.replace("\n", "")):
        try:
            obj = json.loads(attempt)
            break
        except Exception:
            obj = None
    if obj is None:
        # 极端情况：截取最外层大括号重试
        s = text.find("{")
        e = text.rfind("}")
        if s >= 0 and e > s:
            try:
                obj = json.loads(text[s:e + 1])
            except Exception:
                return None
    if obj is None:
        return None
    if isinstance(obj, list):
        return {"sites": obj}
    if not isinstance(obj, dict):
        return None
    # 少数接口返回 {"data": {...}} 结构
    if "sites" not in obj and isinstance(obj.get("data"), (dict, list)):
        return parse_config(json.dumps(obj["data"], ensure_ascii=False))
    if "sites" not in obj and "lives" not in obj and "parses" not in obj:
        return None
    return obj


# ---------------- 单个源：拉取 + 验活 + 打分 ----------------
def probe_site(site, timeout=PROBE_TIMEOUT):
    """对一个 TVBox 站点 api 做抽样验证。
    CMS 型接口（api: xxx/cms）需要带参数，直接 GET 探活不准，
    这里采用保守策略：能取到内容且不是明确的 404 就算活。"""
    api = str(site.get("api", "") or "")
    if not api:
        return False, "no-api"
    if api.startswith("csp_"):
        return True, "csp"          # 本地 jar 解析，无需网络探测
    if api.startswith("assets://") or api.startswith("file://") or api.startswith("clan://"):
        return True, "local"
    if "://" not in api:
        return True, "raw"          # 采集类接口，通常返回 m3u/txt 文本

    base = api.split("$$$")[0].split("?")[0]
    ok, _, err, ms = http_get(base, timeout=timeout)
    return ok, ("%dms" % ms if ok else err[:40])


def fetch_source(src, verbose=False):
    name = src.get("name", "unnamed")
    result = {
        "id": src.get("id", name),
        "name": name,
        "urls": src.get("urls", []),
        "ok": False, "ms": 0, "sites": 0, "lives": 0, "parses": 0,
        "alive": 0, "probed": 0, "score": 0,
        "used_url": "", "err": "", "ts": int(time.time()),
        "config": None,
    }
    if not result["urls"]:
        result["err"] = "no url configured"
        return result

    last_err = ""
    for url in src["urls"]:
        url = normalize_url(url)
        ok, data, err, ms = http_get(url)
        cfg = parse_config(data) if ok else None
        if cfg:
            sites = cfg.get("sites") or []
            if not isinstance(sites, list) or len(sites) == 0:
                cfg = None
                err = "empty sites"
        if cfg:
            result.update(ok=True, ms=ms, config=cfg, used_url=url, err="",
                          sites=len(cfg.get("sites") or []),
                          lives=len(cfg.get("lives") or []),
                          parses=len(cfg.get("parses") or []))
            if verbose:
                log("  [%s] OK %dms sites=%d" % (name, ms, result["sites"]))
            return result
        last_err = err or "invalid json"
        if verbose:
            log("  [%s] FAIL %s -> %s" % (name, url[:60], last_err))
    result["err"] = last_err
    return result


def score_result(r):
    """打分：可用的源排在前面；同可用时，快+站点多的优先"""
    if not r["ok"]:
        r["score"] = -1
        return r
    alive_ratio = (r["alive"] / r["probed"]) if r["probed"] else 1.0
    speed = max(0.0, 1.0 - r["ms"] / 3000.0)        # 3s 以外记 0 分
    volume = min(r["sites"] / 60.0, 1.0)
    r["score"] = round(alive_ratio * 60 + speed * 20 + volume * 20, 2)
    return r


# ---------------- 合并 ----------------
def merge_configs(results):
    sites, lives, parses, flags = [], [], [], []
    seen_site, seen_live, seen_parse = set(), set(), set()
    used_names, skipped = [], []

    ranked = sorted([r for r in results if r["ok"] and r["config"]],
                    key=lambda x: -x["score"])

    for r in ranked:
        cfg = r["config"]
        n0 = len(sites)
        for s in cfg.get("sites") or []:
            if not isinstance(s, dict):
                continue
            key = str(s.get("key") or s.get("name") or "")
            if not key:
                continue
            # 冲突改名，避免 TVBox 里同名覆盖
            if key in seen_site:
                key2 = "%s@%s" % (key, r["id"])
                if key2 in seen_site:
                    continue
                s = dict(s)
                s["key"] = key2
                key = key2
            seen_site.add(key)
            sites.append(s)
        for lv in cfg.get("lives") or []:
            sig = json.dumps(lv, sort_keys=True, ensure_ascii=False)
            if sig not in seen_live:
                seen_live.add(sig)
                lives.append(lv)
        for pa in cfg.get("parses") or []:
            sig = json.dumps(pa, sort_keys=True, ensure_ascii=False)
            if sig not in seen_parse:
                seen_parse.add(sig)
                parses.append(pa)
        for fl in cfg.get("flags") or []:
            if fl not in flags:
                flags.append(fl)
        if len(sites) > n0:
            used_names.append(r["name"])
        else:
            skipped.append(r["name"])

    merged = {
        "wallpaper": "https://picsum.photos/1280/720",
        "sites": sites,
        "lives": lives,
        "parses": parses,
        "flags": flags,
    }
    return merged, used_names, skipped


# ---------------- 输出 ----------------
def write_out(merged, results, used_names):
    os.makedirs(OUT_DIR, exist_ok=True)
    tvbox_path = os.path.join(OUT_DIR, "tvbox.json")
    with open(tvbox_path, "w", encoding="utf-8") as f:
        json.dump(merged, f, ensure_ascii=False, indent=1)

    # 直播源导出（部分播放器用 m3u）
    live_path = os.path.join(OUT_DIR, "live.json")
    with open(live_path, "w", encoding="utf-8") as f:
        json.dump(merged.get("lives", []), f, ensure_ascii=False, indent=1)

    status = {
        "updated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        "totals": {
            "sources": len(results),
            "alive_sources": len([r for r in results if r["ok"]]),
            "sites": len(merged.get("sites", [])),
            "lives": len(merged.get("lives", [])),
        },
        "used_sources": used_names,
        "sources": [{k: v for k, v in r.items() if k != "config"} for r in results],
    }
    # 状态面板写入本机地址，方便手机直接复制
    try:
        status["local_url"] = "http://%s:%d/tvbox.json" % (lan_ip(), PORT)
    except Exception:
        pass
    with open(os.path.join(OUT_DIR, "status.json"), "w", encoding="utf-8") as f:
        json.dump(status, f, ensure_ascii=False, indent=1)

    # 生成手机端状态面板
    try:
        import gen_status_page
        gen_status_page.build()
    except Exception as e:
        log("状态页生成失败(不影响主功能): %s" % e)

    return tvbox_path, status


# ---------------- 采集主流程 ----------------
def run_update(verbose=True):
    with open(SOURCES_FILE, "r", encoding="utf-8") as f:
        conf = json.load(f)
    sources = conf.get("sources", [])

    log("开始采集 %d 个配置源 ..." % len(sources))
    results = []
    with ThreadPoolExecutor(max_workers=8) as ex:
        futs = {ex.submit(fetch_source, s, verbose): s for s in sources}
        for fu in as_completed(futs):
            r = fu.result()
            results.append(r)

    # 抽样验活（只对拉取成功的源做，限制总数别把手机跑挂）
    todo = [r for r in results if r["ok"]][:12]
    def probe_job(r):
        sites = (r["config"].get("sites") or [])[:PROBE_PER_SOURCE]
        alive = 0
        for s in sites:
            ok, _ = probe_site(s)
            alive += 1 if ok else 0
        r["probed"] = len(sites)
        r["alive"] = alive
        return score_result(r)

    if todo:
        log("抽样验活 %d 个源 ..." % len(todo))
        with ThreadPoolExecutor(max_workers=8) as ex:
            list(ex.map(probe_job, todo))
    for r in results:
        score_result(r)

    results.sort(key=lambda x: -x["score"])
    merged, used, skipped = merge_configs(results)
    path, status = write_out(merged, results, used)

    log("采集完成: 可用源 %d/%d, 站点 %d, 直播 %d"
        % (status["totals"]["alive_sources"], status["totals"]["sources"],
           status["totals"]["sites"], status["totals"]["lives"]))
    log("采用: %s" % ("、".join(used) if used else "无"))
    if skipped:
        log("跳过(重复/无有效站点): %s" % "、".join(skipped))
    log("输出: %s" % path)
    return status


# ---------------- HTTP 服务 ----------------
def lan_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=OUT_DIR, **kw)

    def end_headers(self):
        # 关键：禁用缓存，保证电视每次启动都拿到最新配置
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        self.send_header("Access-Control-Allow-Origin", "*")
        super().end_headers()

    def log_message(self, fmt, *args):
        if "200" in (args[1] if len(args) > 1 else ""):
            log("HTTP <- %s" % (args[0] if args else ""))

    def do_GET(self):
        if self.path.rstrip("/") in ("", "/index.html"):
            self.path = "/status.html"
            return SimpleHTTPRequestHandler.do_GET(self)
        return SimpleHTTPRequestHandler.do_GET(self)


def serve(interval=UPDATE_INTERVAL, port=PORT):
    # 先跑一次，保证服务起来就有内容
    threading.Thread(target=run_update, daemon=True).start()

    def loop():
        while True:
            time.sleep(interval)
            try:
                run_update()
            except Exception as e:
                log("采集出错: %s" % e)

    threading.Thread(target=loop, daemon=True).start()

    ip = lan_ip()
    srv = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    log("=" * 52)
    log("  TVBox 配置服务已启动")
    log("  电视端填这个地址：")
    log("    http://%s:%d/tvbox.json" % (ip, port))
    log("  状态面板：  http://%s:%d/" % (ip, port))
    log("  每 %d 小时自动更新一次" % (interval // 3600))
    log("  电脑连同一 WiFi 即可访问；手机开热点时用手机 IP")
    log("=" * 52)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        log("已停止")


# ---------------- CLI ----------------
def main():
    ap = argparse.ArgumentParser(description="TVBox 配置聚合器")
    ap.add_argument("cmd", choices=["update", "serve", "check"], nargs="?", default="update")
    ap.add_argument("--port", type=int, default=PORT)
    ap.add_argument("--interval", type=int, default=UPDATE_INTERVAL,
                    help="更新间隔(秒)，默认 21600 = 6 小时")
    args = ap.parse_args()

    if args.cmd == "update":
        run_update()
    elif args.cmd == "check":
        run_update(verbose=True)
    elif args.cmd == "serve":
        serve(interval=args.interval, port=args.port)


if __name__ == "__main__":
    main()