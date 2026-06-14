import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { NAV_SPEED } from './constants';

// 경로 양 끝(=엘베 진입·이탈, 입구·목적지)에서 카메라가 부드럽게 가/감속하는 시간(초).
// 진행률(%) 기반이 아닌 절대 시간 기반 — 짧은 경로든 긴 경로든 양 끝 동일하게 RAMP_SEC.
// 너무 길면 엘베 앞에서 답답하게 느려짐 → 1초로 짧게.
const RAMP_SEC = 1.0;

const FORWARD = new THREE.Vector3(0, 0, -1);

// 카메라를 정해진 route 위에서 부드럽게 움직이게 하는 컴포넌트.
// route 의 모든 세그먼트 거리를 미리 계산하고, NAV_SPEED * speedMultiplier 속도로 진행.
// 시작 후 RAMP_SEC 초·도착 RAMP_SEC 초 전부터는 점진 가속/감속이 자동 적용된다.
// seekState 가 오면 그 진행률(0~1)로 즉시 점프.
export function NavAnimator({
  route, onComplete, controlsRef, onProgress, seekState, isPlaying,
  speedMultiplier = 1,
}) {
  const hasCompleted = useRef(false);
  const [currentProgress, setCurrentProgress] = useState(0);
  const lastReportedProgress = useRef(0);
  const elapsedRef = useRef(0);

  // 경로 전체 길이와 각 세그먼트까지의 누적 거리
  const { totalDistance, cumulativeDistances } = useMemo(() => {
    if (!route || route.length < 2) return { totalDistance: 0, cumulativeDistances: [] };
    let total = 0;
    const cumDist = [0];
    for (let i = 0; i < route.length - 1; i++) {
      const p1 = new THREE.Vector3(route[i].pos[0], route[i].pos[1], route[i].pos[2]);
      const p2 = new THREE.Vector3(route[i + 1].pos[0], route[i + 1].pos[1], route[i + 1].pos[2]);
      total += p1.distanceTo(p2);
      cumDist.push(total);
    }
    return { totalDistance: total, cumulativeDistances: cumDist };
  }, [route]);

  // 경로가 바뀌면 진행률·경과시간 모두 초기화
  useEffect(() => {
    hasCompleted.current = false;
    setCurrentProgress(0);
    lastReportedProgress.current = 0;
    elapsedRef.current = 0;
  }, [route]);

  // 스크러빙 점프
  useEffect(() => {
    if (!seekState) return;
    if (seekState.progress < 0 || seekState.progress > 1) return;
    setCurrentProgress(seekState.progress);
    hasCompleted.current = false;
    lastReportedProgress.current = seekState.progress;
    // 점프 후엔 ramp 처음부터 다시 시작 (자연스러운 가속)
    elapsedRef.current = 0;
    onProgress?.(seekState.progress);
  }, [seekState, onProgress]);

  useFrame((_, delta) => {
    if (!route || !controlsRef.current || totalDistance === 0) return;

    let newProgress = currentProgress;

    if (isPlaying && !hasCompleted.current) {
      elapsedRef.current += delta;
      const nominalSpeed = NAV_SPEED * speedMultiplier;
      // 남은 시간 = 남은 거리 / 명목 속도. 끝 임박 감지용 (ramp 적용 전 추정치).
      const remainingTime = (1 - newProgress) * totalDistance / Math.max(nominalSpeed, 0.0001);
      // 시작 직후·도착 임박 RAMP_SEC 동안 가/감속. 최소 15% 속도 보장 — 안 그러면
      // 끝부분에서 속도가 0에 수렴해 onComplete 호출 안 되고 엘베 앞에서 정지함.
      const MIN_SPEED = 0.15;
      const rampMul = Math.max(
        MIN_SPEED,
        Math.min(
          Math.min(1, elapsedRef.current / RAMP_SEC),
          Math.max(0, Math.min(1, remainingTime / RAMP_SEC)),
        ),
      );
      newProgress += (delta * nominalSpeed * rampMul) / totalDistance;
      if (newProgress >= 1) {
        newProgress = 1;
        hasCompleted.current = true;
        onProgress?.(1);
        onComplete();
      }
      setCurrentProgress(newProgress);
    }

    // 진행률 1% 이상 변할 때만 부모로 보고
    if (
      Math.abs(newProgress - lastReportedProgress.current) > 0.01 ||
      newProgress === 1 || newProgress === 0
    ) {
      onProgress?.(newProgress);
      lastReportedProgress.current = newProgress;
    }

    // ramp 는 속도에 반영했으니 progress→거리 매핑은 그대로 비례
    const currentDist = newProgress * totalDistance;
    let segmentIndex = 0;
    for (let i = 0; i < cumulativeDistances.length - 1; i++) {
      if (currentDist <= cumulativeDistances[i + 1]) {
        segmentIndex = i;
        break;
      }
    }

    const distInSegment = currentDist - cumulativeDistances[segmentIndex];
    const segmentLength = cumulativeDistances[segmentIndex + 1] - cumulativeDistances[segmentIndex];
    const localProgress = segmentLength === 0 ? 1 : distInSegment / segmentLength;

    const p1 = route[segmentIndex];
    const p2 = route[segmentIndex + 1];

    const cx = THREE.MathUtils.lerp(p1.pos[0], p2.pos[0], localProgress);
    const cy = THREE.MathUtils.lerp(p1.pos[1], p2.pos[1], localProgress);
    const cz = THREE.MathUtils.lerp(p1.pos[2], p2.pos[2], localProgress);

    // 시선 방향을 quaternion slerp 로 보간 — lookAt 좌표 직선 보간이 코너에서 한 번에
    // 휙 도는 느낌을 주는 반면, 회전 보간은 호를 그리며 부드럽게 돈다.
    const buildDir = (n) => {
      const v = new THREE.Vector3(
        n.lookAt[0] - n.pos[0],
        n.lookAt[1] - n.pos[1],
        n.lookAt[2] - n.pos[2],
      );
      return v.lengthSq() < 1e-6 ? null : v.normalize();
    };
    const d1 = buildDir(p1);
    const d2 = buildDir(p2);

    let tx, ty, tz;
    if (d1 && d2) {
      const q1 = new THREE.Quaternion().setFromUnitVectors(FORWARD, d1);
      const q2 = new THREE.Quaternion().setFromUnitVectors(FORWARD, d2);
      const qInterp = q1.slerp(q2, localProgress);
      const dirInterp = FORWARD.clone().applyQuaternion(qInterp);
      tx = cx + dirInterp.x;
      ty = cy + dirInterp.y;
      tz = cz + dirInterp.z;
    } else {
      tx = THREE.MathUtils.lerp(p1.lookAt[0], p2.lookAt[0], localProgress);
      ty = THREE.MathUtils.lerp(p1.lookAt[1], p2.lookAt[1], localProgress);
      tz = THREE.MathUtils.lerp(p1.lookAt[2], p2.lookAt[2], localProgress);
    }

    controlsRef.current.setLookAt(cx, cy, cz, tx, ty, tz, false);
  });

  return null;
}
