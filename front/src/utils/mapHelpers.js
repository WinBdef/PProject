import * as THREE from 'three';
import { NAV_EYE_LEVEL } from '../components/map/three/constants';

// 선분(a-b) 위에서 점(p)과 가장 가까운 좌표를 찾는 수학 공식
function closestPointOnSegment(p, a, b) {
  const ab = new THREE.Vector3().subVectors(b, a);
  const ap = new THREE.Vector3().subVectors(p, a);
  let t = ap.dot(ab) / ab.lengthSq();
  t = Math.max(0, Math.min(1, t)); // 0~1 사이로 가두기 (선분 밖으로 안 나가게)
  return new THREE.Vector3().copy(a).add(ab.multiplyScalar(t));
}

// routes 배열 전체를 뒤져서 가장 가까운 선분 위 좌표 반환
export const findNearestPointOnPaths = (pos, routes) => {
  if (!routes || routes.length === 0) return pos;
  
  let closest = null;
  let minDist = Infinity;

  routes.forEach(route => {
    const path = route.path;
    for (let i = 0; i < path.length - 1; i++) {
      // y값은 0으로 무시하고 x, z(평면) 기준으로만 계산
      const a = new THREE.Vector3(path[i][0], 0, path[i][2]);
      const b = new THREE.Vector3(path[i + 1][0], 0, path[i + 1][2]);
      const p = new THREE.Vector3(pos.x, 0, pos.z);
      
      const pt = closestPointOnSegment(p, a, b);
      const d = pt.distanceTo(p);
      
      if (d < minDist) {
        minDist = d;
        closest = pt;
      }
    }
  });

  // 원래 카메라의 y(높이)는 그대로 유지하고 x, z만 파란선 좌표로 교체
  return closest ? new THREE.Vector3(closest.x, pos.y, closest.z) : pos;
};

// 카메라 경로(route)의 실제 3D 길이(m). useNavigationState 와 PathLine 양쪽에서 사용.
export const calculateRouteDistance = (route) => {
  if (!route || route.length < 2) return 0;
  let dist = 0;
  for (let i = 0; i < route.length - 1; i++) {
    const dx = route[i].pos[0] - route[i + 1].pos[0];
    const dy = route[i].pos[1] - route[i + 1].pos[1];
    const dz = route[i].pos[2] - route[i + 1].pos[2];
    dist += Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
  return dist;
};

// 경로(route)의 점 배열을 길찾기용 카메라 패스([{pos,lookAt}])로 변환.
// - pos    = 각 점을 눈높이(NAV_EYE_LEVEL)로 (경로 점의 y 는 무시)
// - lookAt = 다음 점 방향(= 진행 방향). 마지막 점은 직전 구간 방향을 연장.
// → 경로만 그리면 길찾기 카메라가 되므로 camera_paths 노드를 손수 안 찍어도 됨.
export const routeToNavPath = (path) => {
  if (!path || path.length < 2) return [];
  const pts = path.map((p) => (Array.isArray(p) ? p : [p.x, p.y, p.z]));
  return pts.map((p, i) => {
    let target;
    if (i < pts.length - 1) {
      target = pts[i + 1];
    } else {
      const prev = pts[i - 1];
      target = [p[0] + (p[0] - prev[0]), p[1], p[2] + (p[2] - prev[2])];
    }
    return {
      pos: [p[0], NAV_EYE_LEVEL, p[2]],
      lookAt: [target[0], NAV_EYE_LEVEL, target[2]],
    };
  });
};