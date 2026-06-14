import React from 'react';
// 길찾기/워킹 중에는 풀스크린 축소 버튼 숨김 — 그 동안엔 길찾기 종료(✕) 버튼만
// 보이게 해서 ✕가 두 개 보이는 헷갈림 제거.
const MapControls = ({ hasAdmin, adminMode, setAdminMode, isFullscreen, onToggleFullscreen, onShrinkFullscreen, isWalking, showRoutes, onNavAction }) => (
  // 풀스크린일 땐 .map-content.fullscreen 이 position:fixed 라 안전영역(노치) 패딩이
  // 부모로부터 상속 안 됨 → 여기서 직접 safe-area-inset 더해줘서 다이내믹 아일랜드 영역 회피.
  <div className="controls-group" style={{
    position: 'absolute',
    top: 'calc(60px + env(safe-area-inset-top))',
    right: 'calc(20px + env(safe-area-inset-right))',
    zIndex: 1000000,
    pointerEvents: 'auto',
  }}>
    {hasAdmin && <button className={`btn-icon ${adminMode ? 'active' : ''}`} style={{ color: adminMode ? 'yellow' : 'white', border: adminMode ? '1px solid yellow' : '' }} onClick={() => setAdminMode(!adminMode)}>🛠️</button>}
    {!isWalking && (
      <button className="btn-icon" onClick={isFullscreen ? onShrinkFullscreen : onToggleFullscreen}>{isFullscreen ? '✕' : '⤢'}</button>
    )}
    {isFullscreen && <button className={`btn-icon nav-btn ${showRoutes ? 'active' : ''}`} onClick={onNavAction}>{isWalking ? '✕' : '🧭'}</button>}
  </div>
);
export default MapControls;