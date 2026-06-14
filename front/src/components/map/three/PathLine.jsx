import { useState } from 'react';
import { Line } from '@react-three/drei';

// 경로(route)를 두 겹의 Line 으로 그림.
// - 투명한 굵은 Line: 클릭 히트박스 확대 (40px)
// - 채색된 Line: 실제 보이는 경로 (호버 시 노랑)
export function PathLine({ points, routeData, onClick }) {
  const [hovered, setHovered] = useState(false);
  // 점이 2개 미만이면 선을 만들 수 없음 — drei <Line> 가 에러로 죽으므로 렌더 생략.
  // (관리자 모드에서 만든 빈 경로/점 1개짜리 경로가 여기로 들어올 수 있음)
  if (!points || points.length < 2) return null;
  const lineColor = hovered ? '#fbbf24' : '#3b82f6';
  // 파란선 높이를 y=0.2 로 고정 — route 점들의 들쭉날쭉한 y(0.3·1.0 등) 대신 일정 높이로 평탄화.
  // 바닥 위 0.2 라 z-fighting 없고 벽엔 정상적으로 가려짐.
  const flat = points.map((p) => (Array.isArray(p) ? [p[0], 0.2, p[2]] : [p.x, 0.2, p.z]));
  return (
    <group
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
      onClick={(e) => { e.stopPropagation(); onClick(e.point, routeData); }}
      style={{ cursor: 'pointer' }}
    >
      <Line points={flat} color="white" lineWidth={40} opacity={0} transparent />
      <Line points={flat} color={lineColor} lineWidth={hovered ? 8 : 6} opacity={0.8} transparent />
    </group>
  );
}
