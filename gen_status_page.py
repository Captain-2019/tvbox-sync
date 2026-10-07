#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
生成手机端状态面板 out/status.html
手机浏览器打开 http://<手机IP>:8848/ 即可查看源状态、复制配置地址
"""
import json
import os
import time

BASE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(BASE, "out")

TPL = """<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>TVBox 源状态</title>
<style>
  :root{--bg:#f5f6f8;--card:#fff;--line:#e6e8eb;--txt:#1f2328;--sub:#6b7280;
        --ok:#16a34a;--bad:#dc2626;--warn:#d97706;--accent:#2563eb}
  *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
  body{margin:0;background:var(--bg);color:var(--txt);
       font:15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;
       padding:16px 14px 40px}
  h1{font-size:19px;margin:0 0 4px}
  .sub{color:var(--sub);font-size:13px;margin-bottom:16px}
  .card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px;margin-bottom:12px}
  .grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}
  .k{font-size:12px;color:var(--sub)}
  .v{font-size:22px;font-weight:650;margin-top:2px}
  .addr{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:13px;
        background:#f0f4fb;border:1px solid #d6e0f5;border-radius:8px;padding:10px;
        word-break:break-all;color:var(--accent)}
  button{width:100%;margin-top:10px;padding:11px;border:0;border-radius:9px;background:var(--accent);
         color:#fff;font-size:15px;font-weight:600;cursor:pointer}
  button:active{opacity:.75}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th,td{text-align:left;padding:8px 6px;border-bottom:1px solid var(--line)}
  th{color:var(--sub);font-weight:500;font-size:12px}
  .dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px;vertical-align:middle}
  .on{background:var(--ok)} .off{background:var(--bad)}
  .pill{display:inline-block;padding:1px 7px;border-radius:99px;font-size:11px;
        background:#eef2f7;color:var(--sub)}
  .err{color:var(--bad);font-size:11px;max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  a{color:var(--accent)}
</style>
</head>
<body>
<h1>TVBox 源状态</h1>
<div class="sub">最近更新：__UPDATED__</div>

<div class="card">
  <div class="grid">
    <div><div class="k">可用源</div><div class="v">__ALIVE__/__SOURCES__</div></div>
    <div><div class="k">聚合站点</div><div class="v">__SITES__</div></div>
    <div><div class="k">直播源</div><div class="v">__LIVES__</div></div>
    <div><div class="k">下一次更新</div><div class="v" style="font-size:15px">__NEXT__</div></div>
  </div>
</div>

<div class="card">
  <div class="k" style="margin-bottom:6px">电视端「配置地址」填这个</div>
  <div class="addr" id="u">__URL__</div>
  <button onclick="cp()">复制地址</button>
  <div style="margin-top:8px"><a href="/tvbox.json" target="_blank">查看 tvbox.json →</a></div>
</div>

<div class="card">
  <table>
    <thead><tr><th>源</th><th>状态</th><th>速度</th><th>站点</th><th>健康</th></tr></thead>
    <tbody>
__ROWS__
    </tbody>
  </table>
</div>

<div class="card">
  <div class="k">采用顺序（分数高=快且全，排最前）</div>
  <div style="margin-top:6px">__USED__</div>
</div>

<script>
function cp(){
  var t=document.getElementById('u').textContent.trim();
  navigator.clipboard.writeText(t).then(function(){
    var b=document.querySelector('button');var o=b.textContent;
    b.textContent='已复制 ✓';setTimeout(function(){b.textContent=o},1600);
  });
}
</script>
</body>
</html>
"""


def build():
    with open(os.path.join(OUT, "status.json"), "r", encoding="utf-8") as f:
        d = json.load(f)

    t = d["totals"]
    rows = []
    for s in sorted(d["sources"], key=lambda x: -x["score"]):
        cls = "on" if s["ok"] else "off"
        state = '<span class="dot %s"></span>%s' % (cls, "活" if s["ok"] else "死")
        ms = "%dms" % s["ms"] if s["ok"] else "—"
        health = "%d/%d" % (s["alive"], s["probed"]) if s["probed"] else "—"
        score = '<span class="pill">%.1f</span>' % s["score"] if s["ok"] else ""
        err = '<div class="err" title="%s">%s</div>' % (s["err"], s["err"][:24]) if not s["ok"] else ""
        rows.append(
            "<tr><td><b>%s</b>%s</td><td>%s</td><td>%s</td><td>%d</td><td>%s %s</td></tr>"
            % (s["name"], err, state, ms, s["sites"], health, score)
        )

    nxt = time.strftime("%H:%M", time.localtime(time.time() + 6 * 3600))
    # 从 status.json 拿本机 IP 由脚本在写入时替换
    url = d.get("local_url", "http://<手机IP>:8848/tvbox.json")

    html = (TPL.replace("__UPDATED__", d["updated_at"])
                .replace("__ALIVE__", str(t["alive_sources"]))
                .replace("__SOURCES__", str(t["sources"]))
                .replace("__SITES__", str(t["sites"]))
                .replace("__LIVES__", str(t["lives"]))
                .replace("__NEXT__", nxt)
                .replace("__URL__", url)
                .replace("__ROWS__", "\n".join(rows))
                .replace("__USED__", "、".join(d.get("used_sources") or []) or "无"))
    with open(os.path.join(OUT, "status.html"), "w", encoding="utf-8") as f:
        f.write(html)
    return os.path.join(OUT, "status.html")


if __name__ == "__main__":
    print(build())