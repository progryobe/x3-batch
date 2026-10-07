#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
if [ ! -x .venv/bin/python ]; then
  echo '初回セットアップ: Python 3.11〜3.13 が必要です。'
  python3 -c 'import sys; assert (3,11)<=sys.version_info[:2]<=(3,13), "Python 3.11〜3.13 を使ってください"'
  python3 -m venv .venv
fi
.venv/bin/python -m pip install -r requirements.txt
exec .venv/bin/python run.py
