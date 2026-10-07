#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [ "$(uname -s)" != Darwin ]; then echo 'macOS上で実行してください。'; exit 1; fi
if [ "$(uname -m)" != arm64 ]; then echo 'Apple Siliconのネイティブターミナルで実行してください。'; exit 1; fi
.venv/bin/python -c 'import platform; assert platform.machine()=="arm64", "arm64 Python が必要です"'
.venv/bin/python -m pip install -r requirements.txt pyinstaller==6.19.0
.venv/bin/python -m unittest discover -s tests -v
.venv/bin/python scripts/collect_licenses.py
.venv/bin/python -m PyInstaller --noconfirm --clean --windowed --onedir \
  --name 'X3 Batch' --osx-bundle-identifier local.x3batch.app --target-arch arm64 \
  --add-data 'licenses:licenses' --add-data 'LICENSE:.' --add-data 'NOTICE.md:.' \
  run.py
echo '完成: dist/X3 Batch.app'
