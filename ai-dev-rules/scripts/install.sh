#!/bin/sh
# macOS／Linux 用的入口：檢查有沒有 PowerShell 7（pwsh），有就把參數原封不動交給 install.ps1
# 用法和 install.ps1 一樣，例如：
#   sh scripts/install.sh              預覽，不寫入
#   sh scripts/install.sh -Apply       真的安裝
#   sh scripts/install.sh -Tool claude -Apply
set -e
HERE=$(cd "$(dirname "$0")" && pwd)
if ! command -v pwsh >/dev/null 2>&1; then
  echo "找不到 pwsh（PowerShell 7）。先安裝一次："
  echo "  brew install powershell"
  echo "沒有 Homebrew：到 https://github.com/PowerShell/PowerShell/releases 下載 .pkg"
  exit 1
fi
exec pwsh -NoProfile -File "$HERE/install.ps1" "$@"
