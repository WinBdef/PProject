import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

// 🌟 유저님이 제공해주신 완벽한 수학 공식 + 교차로 연장(Extension) 트릭
function closestPointOnSegmentWithExtension(p, a, b, extension = 1.0) {
  const ab = new THREE.Vector3().subVectors(b, a);
  const abLen = ab.length();
  
  // 선분 길이가 0인 에러 데이터 방지
  if (abLen === 0) return a.clone(); 
  
  const ap = new THREE.Vector3().subVectors(p, a);
  let t = ap.dot(ab) / (abLen * abLen);
  
  // 🌟 핵심 해결: 0과 1로 꽉 닫아버리지 않고, extension(1미터) 만큼 앞뒤 허용 범위를 열어줍니다!
  // 이렇게 하면 어긋난 교차로에서도 수학적으로 선이 겹치게 되어 부드럽게 환승됩니다.
  const tExt = extension / abLen; 
  t = Math.max(-tExt, Math.min(1 + tExt, t)); 
  
  return new THREE.Vector3().copy(a).add(ab.multiplyScalar(t));
}

export default function HumanWalk({ isEnabled, joystickRef, controlsRef, routes, speedMultiplier = 1 }) {
  const { camera } = useThree();

  useFrame((state, delta) => {
    if (!isEnabled || !controlsRef.current || !routes || routes.length === 0) return;
    
    const input = joystickRef.current;
    if (Math.abs(input.x) < 0.01 && Math.abs(input.y) < 0.01) return;

    // 현재 위치와 바라보는 시점(Target) 가져오기
    const currentPos = new THREE.Vector3();
    controlsRef.current.getPosition(currentPos);
    
    const currentTarget = new THREE.Vector3();
    controlsRef.current.getTarget(currentTarget);

    // 🌟 시선 벡터 유지 (화면 팍 튀는 현상 방지용)
    const lookOffset = new THREE.Vector3().subVectors(currentTarget, currentPos);
    const camForward = new THREE.Vector3(lookOffset.x, 0, lookOffset.z).normalize();
    const camRight = new THREE.Vector3().crossVectors(camForward, camera.up).normalize();

    // 조이스틱 이동 (기본 4.5, 사용자 배속 토글로 ×0.5 ~ ×2 가능)
    const WALK_SPEED = 4.5;
    const moveVec = new THREE.Vector3()
      .addScaledVector(camForward, input.y)
      .addScaledVector(camRight, input.x)
      .multiplyScalar(WALK_SPEED * speedMultiplier * delta);

    // 1. 유저가 이동하고 싶어 하는 평면 좌표 (Y축 무시)
    const flatDesired = new THREE.Vector3(currentPos.x + moveVec.x, 1.2, currentPos.z + moveVec.z);

    let closestPoint = null;
    let minDistSq = Infinity;

    // 2. 전체 경로를 뒤져서 "가장 가까운 연장된 파란 선" 위로 100% 강제 스냅(Snap)
    routes.forEach(route => {
      const path = route.path;
      if (!path || path.length < 2) return;
      
      for (let i = 0; i < path.length - 1; i++) {
        // 배열 형식[x, y, z]과 객체 형식{x, y, z} 모두 안전하게 파싱
        const a = new THREE.Vector3(path[i].x ?? path[i][0], 0, path[i].z ?? path[i][2]);
        const b = new THREE.Vector3(path[i+1].x ?? path[i+1][0], 0, path[i+1].z ?? path[i+1][2]);
        
        // 교차로 연결 마법이 들어간 함수 호출
        const pt = closestPointOnSegmentWithExtension(flatDesired, a, b, 1.0);
        const dSq = pt.distanceToSquared(flatDesired);
        
        if (dSq < minDistSq) {
          minDistSq = dSq;
          closestPoint = pt;
        }
      }
    });

    if (!closestPoint) return;

    // 3. 찾아낸 선 위의 좌표로 내 몸을 옮기고, 시선은 그대로 유지
    const newTarget = closestPoint.clone().add(lookOffset);

    // 4. 엔진에 적용 (false를 주어 애니메이션 충돌 완전 차단)
    controlsRef.current.setPosition(closestPoint.x, currentPos.y, closestPoint.z, false);
    controlsRef.current.setTarget(newTarget.x, currentTarget.y, newTarget.z, false);
  });

  return null;
}