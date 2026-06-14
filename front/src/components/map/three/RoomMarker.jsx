import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';

// 마커 종류별 색·아이콘. room(강의실)은 status 색을 따로 쓰므로 여기 없음.
const MARKER_KINDS = {
  toilet: { color: '#38bdf8', icon: '🚻' },
  exit: { color: '#fb923c', icon: '🚪' },
  // 🛗(U+1F6D7)는 신규 이모지라 일부 시스템 폰트에 없어 깨짐 → 상하 화살표 사용
  elevator: { color: '#a78bfa', icon: '↕️' },
  // 교수실·행정실 같은 강의실 외 사무공간. 파란색으로 강의실(빨/초)과 시각적 구분.
  office: { color: '#3b82f6', icon: '💼' },
};

// 이모지를 캔버스에 그려 텍스처로 만든다.
// 3D 스프라이트에 입히면 일반 메시처럼 깊이검사를 받아 벽 뒤에선 가려진다.
function makeEmojiTexture(emoji) {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.font = `${Math.round(size * 0.78)}px serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(emoji, size / 2, size * 0.56);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// 강의실/사무실/화장실/비상구/엘리베이터 위치 마커.
// - 강의실(room): status 색(빨강·초록) 구체 + 이름 라벨 (시간표·상태가 있음)
// - 사무실(office, 교수실·행정실): 파란 구체 + 이름 라벨 (시간표 없음, 클릭해도 시트 안 열림)
// - 화장실·비상구·엘리베이터: 이모지 스프라이트 (3D 라서 벽에 가려짐)
export function RoomMarker({ position, type, info, onClick, onPointerDown, hideLabel, isEditing }) {
  const kindStyle = MARKER_KINDS[info?.kind];
  const isOffice = info?.kind === 'office';
  const isSectionEntry = info?.kind === 'section_entry';
  // 구체 색: 편집 중 노랑 / section_entry 회색 / office 파랑 / 그 외 강의실 status(빨/초)
  const color = isEditing ? '#facc15'
    : isSectionEntry ? '#94a3b8'
    : isOffice ? '#3b82f6'
    : type === 'occupied' ? '#ef4444'
    : '#4ade80';
  const markerRef = useRef();

  // 화장실·비상구·엘리베이터용 이모지 텍스처 (office 는 구체로 렌더하므로 skip).
  const emojiTex = useMemo(
    () => (kindStyle?.icon && !isOffice ? makeEmojiTexture(kindStyle.icon) : null),
    [kindStyle, isOffice],
  );
  useEffect(() => () => emojiTex?.dispose(), [emojiTex]);

  // 강의실/사무실 구체의 위아래 부유 애니메이션 (이모지 마커엔 markerRef 가 없어 자동 skip)
  useFrame(({ clock }) => {
    if (markerRef.current) {
      markerRef.current.position.y = position[1] + Math.sin(clock.elapsedTime * 3) * 0.1;
    }
  });

  // onClick 이 없으면(예: 경로 편집 모드) 핸들러 자체를 안 달아 r3f raycast
  // 대상에서 빠지게 → 마커가 경로 등 뒤 물체의 클릭을 가로채지 않는다.
  const clickHandler = onClick
    ? (e) => { e.stopPropagation(); onClick(info); }
    : undefined;

  // 모든 종류 공통: 클릭·드래그 히트박스 (투명 구체)
  const hitbox = (
    <mesh onClick={clickHandler} onPointerDown={onPointerDown}>
      <sphereGeometry args={[1.5, 16, 16]} />
      <meshBasicMaterial visible={false} />
    </mesh>
  );

  // 화장실·비상구·엘리베이터 → 이모지 스프라이트. office/section_entry 는 구체 렌더로 빠짐.
  if (kindStyle && !isOffice) {
    const s = isEditing ? 1.4 : 1.0;
    return (
      <group position={position}>
        {hitbox}
        <sprite scale={[s, s, 1]} position={[0, 0.8, 0]}>
          <spriteMaterial map={emojiTex} transparent depthWrite={false} toneMapped={false} />
        </sprite>
      </group>
    );
  }

  // 강의실 / 사무실 → 구체 + 이름 라벨
  return (
    <group position={position}>
      {hitbox}
      <mesh ref={markerRef} onClick={clickHandler} onPointerDown={onPointerDown}>
        <sphereGeometry args={[isEditing ? 0.7 : 0.5, 32, 32]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.6} />
      </mesh>

      {!hideLabel && (
        <Html position={[0, 1.2, 0]} center distanceFactor={10} style={{ pointerEvents: 'none' }}>
          <div style={{
            background: 'rgba(0,0,0,0.8)', color: 'white',
            padding: '8px 16px', borderRadius: '8px',
            fontSize: '0.9rem', fontWeight: 'bold',
            border: `1.5px solid ${color}`, whiteSpace: 'nowrap',
            boxShadow: '0 4px 10px rgba(0,0,0,0.4)',
          }}>
            {info.roomName}
          </div>
        </Html>
      )}
    </group>
  );
}
