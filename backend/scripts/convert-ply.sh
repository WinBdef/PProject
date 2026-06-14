#!/bin/bash
# .ply -> .splat 변환 헬퍼.
# 첫 실행 시 /tmp/splat-venv 에 numpy/plyfile 설치 후 모든 .ply 를 변환.
set -e

VENV=/tmp/splat-venv
if [ ! -x "$VENV/bin/python" ]; then
  echo "==> venv 만들고 의존성 설치 (1회)"
  python3 -m venv "$VENV"
  "$VENV/bin/pip" install numpy plyfile -q
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONV="$SCRIPT_DIR/ply_to_splat.py"

# 인자 없으면 front/public/assets/*/splats/*.ply 전부 변환
if [ $# -eq 0 ]; then
  ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
  for f in "$ROOT"/front/public/assets/*/splats/*.ply; do
    [ -e "$f" ] || continue
    echo "==> $f"
    "$VENV/bin/python" "$CONV" "$f"
  done
else
  for f in "$@"; do
    echo "==> $f"
    "$VENV/bin/python" "$CONV" "$f"
  done
fi
echo "✅ 끝. 생성된 .splat 확인:"
ls -lh "$(cd "$SCRIPT_DIR/../.." && pwd)"/front/public/assets/*/splats/*.splat 2>/dev/null | tail -10
