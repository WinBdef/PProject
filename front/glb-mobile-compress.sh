#!/bin/bash
# 데스크탑용 GLB → 모바일용 압축 GLB 변환 헬퍼.
# 메시 50% 다운샘플 + 텍스처 512×512 + Draco 재압축 → 보통 1/4 크기.
#
# 사용:
#   bash front/glb-mobile-compress.sh
#     → front/public/assets/*/models/*.glb 전부 변환
#     → 결과는 같은 폴더에 *_m.glb 로 저장
set -e

GLTF="npx -y @gltf-transform/cli"

compress_one() {
  local src="$1"
  local base="${src%.glb}"
  local dst="${base}_m.glb"

  # 이미 _m.glb 면 skip (반복 호출 방지)
  if [[ "$base" == *_m ]]; then return 0; fi

  echo "==> $src"
  local tmp1="$(mktemp -u).glb"
  local tmp2="$(mktemp -u).glb"

  # mesh 그대로 (Draco 가 잘 압축해 ratio 영향 작음) + texture 1024 + Draco 재압축.
  # 이전엔 ratio 0.5 + texture 512 였는데 화질 손실 크고 결과 크기는 거의 같았음.
  $GLTF resize "$src" "$tmp1" --width 1024 --height 1024 >/dev/null 2>&1
  $GLTF draco "$tmp1" "$dst" >/dev/null 2>&1
  rm -f "$tmp1" "$tmp2"

  local before=$(du -h "$src" | cut -f1)
  local after=$(du -h "$dst" | cut -f1)
  echo "    ${before} → ${after}  ($(basename "$dst"))"
}

# front/public/assets/*/models/*.glb 전부 (단 _m.glb 제외)
ROOT="$(cd "$(dirname "$0")/public/assets" && pwd)"
for glb in "$ROOT"/*/models/*.glb; do
  [[ "$glb" == *_m.glb ]] && continue
  compress_one "$glb"
done
echo "✅ 끝"
