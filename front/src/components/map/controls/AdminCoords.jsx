import { useState, useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';

// 관리자 모드 ON 시 마우스 호버 위치 좌표를 실시간 표시 + 키 'C' 로 캡처.
// onCapture(pos: [x, y, z]) : 부모(MapPage)가 받아서 캡처 리스트에 추가.
//
// 격자/축/자체 sphere 는 시각 보조용이지 raycast 대상이 아님.
// 이들의 raycast 를 무력화해서 좌표가 모델 메쉬 표면만 따라가게 함 (격자 스냅 방지).
const disableRaycast = (obj) => {
  if (obj) obj.raycast = () => null;
};

export default function AdminCoords({ isEnabled, onCapture }) {
  const { raycaster, mouse, camera, scene } = useThree();
  const [coords, setCoords] = useState({ x: 0, y: 0, z: 0 });
  const pointRef = useRef(new THREE.Vector3());
  const gridRef = useRef();
  const axesRef = useRef();
  const sphereRef = useRef();

  useEffect(() => {
    disableRaycast(gridRef.current);
    disableRaycast(axesRef.current);
    disableRaycast(sphereRef.current);
  }, [isEnabled]);

  const camDirRef = useRef(new THREE.Vector3());
  const worldNormalRef = useRef(new THREE.Vector3());

  useFrame(() => {
    if (!isEnabled) return;
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(scene.children, true);
    if (intersects.length === 0) return;

    // 외벽 normal 이 안쪽으로 향한 모델에서, 카메라 레이가 외벽을 통과해 내부 면을 hit
    // 하는 문제가 있음. "카메라를 향한 면" (face normal · camera dir < 0) 만 우선 채택.
    camera.getWorldDirection(camDirRef.current);
    let chosen = null;
    for (const hit of intersects) {
      if (!hit.face) continue;
      worldNormalRef.current
        .copy(hit.face.normal)
        .transformDirection(hit.object.matrixWorld)
        .normalize();
      if (worldNormalRef.current.dot(camDirRef.current) < 0) {
        chosen = hit;
        break;
      }
    }
    // 카메라 향한 면을 못 찾으면 (normal 이 거꾸로 export 된 메시 등) 첫 hit 로 폴백
    const best = chosen || intersects[0];
    const p = best.point;
    pointRef.current.copy(p);
    setCoords({ x: p.x.toFixed(2), y: p.y.toFixed(2), z: p.z.toFixed(2) });
  });

  // 키 'C' 로 현재 호버 좌표 캡처. 좌/우 클릭은 카메라 회전·패닝과 충돌해서 안 씀.
  useEffect(() => {
    if (!isEnabled || !onCapture) return;
    const handler = (e) => {
      // input/textarea 안에서 입력 중이면 무시
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'c' || e.key === 'C') {
        const p = pointRef.current;
        onCapture([+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)]);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isEnabled, onCapture]);

  if (!isEnabled) return null;

  return (
    <group>
      {/* 격자 3배 확대 (100→300). gridHelper 는 LineSegments 1개라 커져도 렉 무관 */}
      <gridHelper ref={gridRef} args={[300, 300, 0xff0000, 0x444444]} position={[0, 0.01, 0]} />
      <axesHelper ref={axesRef} args={[10]} />
      <mesh ref={sphereRef} position={[pointRef.current.x, pointRef.current.y, pointRef.current.z]}>
        <sphereGeometry args={[0.1, 16, 16]} />
        <meshBasicMaterial color="yellow" />
        <Html
          distanceFactor={10}
          position={[0.2, 0.2, 0]}
          // pointerEvents:none — 좌표 HUD 는 표시 전용. 안 끄면 캔버스 위 DOM
          // 오버레이라 마커 드래그 등 포인터 조작을 가로챈다.
          style={{ transition: 'none', pointerEvents: 'none' }}
        >
          <div style={{
            background: 'rgba(0,0,0,0.9)', color: '#facc15', padding: '12px 20px',
            borderRadius: '10px', fontSize: '20px', fontWeight: '900', border: '3px solid #facc15',
            whiteSpace: 'nowrap', pointerEvents: 'none', fontFamily: 'monospace',
            transform: 'translate(10px, -100%)',
          }}>
            <div style={{ color: '#ff4444' }}>X: {coords.x}</div>
            <div style={{ color: '#44ff44' }}>Y: {coords.y}</div>
            <div style={{ color: '#4444ff' }}>Z: {coords.z}</div>
            <div style={{ color: '#aaa', fontSize: 12, marginTop: 6 }}>
              [ C ] 키로 캡처
            </div>
          </div>
        </Html>
      </mesh>
    </group>
  );
}
