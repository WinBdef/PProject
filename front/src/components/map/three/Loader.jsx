import { useEffect } from 'react';
import { useProgress } from '@react-three/drei';

// 캔버스 밖 DOM overlay 로 그리는 로딩 스피너.
// 이전엔 drei <Html> 안에서 그렸는데 — fullscreen 옵션 줘도 r3f 좌표 트랜스폼 영향을
// 받아 카메라가 움직이면 스피너가 같이 미세하게 움직였음("로딩이 계속 움직인다").
// 순수 DOM(absolute) 으로 빼서 3D 와 완전 분리 → 화면 정중앙에 박힌 채로 회전만.
export function MapLoadingOverlay({ visible }) {
  if (!visible) return null;
  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 150,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      pointerEvents: 'none', background: 'rgba(15, 23, 42, 0.45)',
      backdropFilter: 'blur(2px)',
    }}>
      <div
        style={{
          width: 34, height: 34, border: '3px solid rgba(255,255,255,0.2)',
          borderTopColor: '#818cf8', borderRadius: '50%',
          animation: 'mapSpin 1s infinite linear',
        }}
      />
      <style>{`@keyframes mapSpin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// 모델 로딩 완료 여부를 부모로 콜백.
// progress 가 100이거나 active 가 false 이면 500ms 후 onLoadComplete(true) 알림.
export function LoadingReporter({ onLoadComplete }) {
  const { progress, active } = useProgress();
  useEffect(() => {
    if (!active || progress === 100) {
      const timer = setTimeout(() => onLoadComplete(true), 500);
      return () => clearTimeout(timer);
    }
    onLoadComplete(false);
  }, [progress, active, onLoadComplete]);
  return null;
}
