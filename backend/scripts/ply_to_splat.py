#!/usr/bin/env python3
"""
Gaussian Splatting .ply -> drei <Splat> 호환 .splat 변환기.
알고리즘은 antimatter15/splat 의 convert.py 와 동일 (MIT).

설치 (한 번만):
    pip install numpy plyfile

사용:
    python backend/scripts/ply_to_splat.py front/public/assets/ai/splats/2a-1.ply
    # → 같은 폴더에 2a-1.splat 생성

여러 개 한 번에:
    for f in front/public/assets/ai/splats/*.ply; do
        python backend/scripts/ply_to_splat.py "$f"
    done

메모: 150MB ply 한 개당 보통 8~10GB 메모리 잠깐 쓰고 결과는 10~15MB .splat.
"""
import os
import sys

try:
    import numpy as np
    from plyfile import PlyData
except ImportError:
    print("의존성 없음. 먼저 실행:")
    print("    pip install numpy plyfile")
    sys.exit(1)


def main():
    if len(sys.argv) < 2:
        print("사용: python ply_to_splat.py input.ply [output.splat] [--max N]")
        print("  --max N : 알파 큰 순으로 N개 점만 남김 (모바일 메모리 보호용)")
        sys.exit(1)

    inp = sys.argv[1]
    # --max 옵션 파싱 (위치 무관)
    max_points = None
    args = []
    i = 2
    while i < len(sys.argv):
        if sys.argv[i] == '--max' and i + 1 < len(sys.argv):
            max_points = int(sys.argv[i + 1])
            i += 2
        else:
            args.append(sys.argv[i])
            i += 1
    out = args[0] if args else os.path.splitext(inp)[0] + '.splat'

    print(f"읽는 중: {inp}")
    ply = PlyData.read(inp)
    v = ply['vertex']
    n = len(v)
    print(f"점 개수: {n:,}")

    SH_C0 = 0.28209479177387814

    pos = np.column_stack([v['x'], v['y'], v['z']]).astype(np.float32)
    scale = np.exp(np.column_stack([v['scale_0'], v['scale_1'], v['scale_2']])).astype(np.float32)

    opacity = np.asarray(v['opacity'], dtype=np.float32)
    alpha = 1.0 / (1.0 + np.exp(-opacity))

    color_r = np.clip(0.5 + SH_C0 * np.asarray(v['f_dc_0']), 0, 1)
    color_g = np.clip(0.5 + SH_C0 * np.asarray(v['f_dc_1']), 0, 1)
    color_b = np.clip(0.5 + SH_C0 * np.asarray(v['f_dc_2']), 0, 1)
    color = np.column_stack([color_r, color_g, color_b, alpha])
    color8 = np.clip(color * 255, 0, 255).astype(np.uint8)

    rot = np.column_stack([v['rot_0'], v['rot_1'], v['rot_2'], v['rot_3']]).astype(np.float32)
    rot_norm = rot / np.maximum(np.linalg.norm(rot, axis=1, keepdims=True), 1e-10)
    rot8 = np.clip(rot_norm * 128 + 128, 0, 255).astype(np.uint8)

    # alpha 큰 순서로 정렬 — splat 포맷은 앞쪽이 먼저 렌더링됨
    order = np.argsort(-alpha)
    if max_points is not None and max_points < n:
        order = order[:max_points]
        print(f"  → 다운샘플: {n:,} → {len(order):,} (알파 큰 순)")

    n_out = len(order)
    # 각 점 32바이트: pos(12) + scale(12) + rgba(4) + rot(4)
    rowsize = 12 + 12 + 4 + 4
    buf = bytearray(n_out * rowsize)

    print("변환 중...")
    for out_idx, i in enumerate(order):
        off = out_idx * rowsize
        buf[off:off + 12] = pos[i].tobytes()
        buf[off + 12:off + 24] = scale[i].tobytes()
        buf[off + 24:off + 28] = bytes(color8[i])
        buf[off + 28:off + 32] = bytes(rot8[i])
        if out_idx % 200000 == 0 and out_idx > 0:
            print(f"  {out_idx:,} / {n_out:,}")

    print(f"쓰는 중: {out}")
    with open(out, 'wb') as f:
        f.write(buf)
    print(f"완료 — {os.path.getsize(out):,} 바이트 ({os.path.getsize(out)/1024/1024:.1f} MB)")


if __name__ == '__main__':
    main()
