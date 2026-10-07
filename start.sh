#!/data/data/com.termux/files/usr/bin/bash
# ===========================================================
# TVBox 源同步服务 —— 手机端一键启动（Termux 环境）
# 用法：  bash start.sh
# 开机自启：termux-boot 目录放一份 start_boot.sh，见 README
# ===========================================================
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

echo ">>> 检查 termux-api（可选）"
command -v termux-wake-lock >/dev/null 2>&1 && termux-wake-lock 2>/dev/null || true

# 关闭电池优化，防止系统杀掉后台服务（需 root，失败不影响）
if command -v termux-wake-lock >/dev/null 2>&1; then
  echo ">>> 已申请 wakelock，屏幕关闭也能持续运行"
fi

# 关掉 Android 对本应用的省电限制（adb 一次性授权，可选）
if command -v adb >/dev/null 2>&1; then
  echo ">>> 提示：如服务被杀，在电脑执行一次 adb 放行省电限制"
fi

PY=python3
command -v $PY >/dev/null 2>&1 || PY=python

echo ">>> 启动服务（首次会先采集一次，约 10~30 秒）"
exec $PY tvbox_sync.py serve --port 8848 --interval 21600