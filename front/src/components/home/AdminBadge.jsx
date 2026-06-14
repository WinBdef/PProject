// 우측 상단에 고정 표시되는 "관리자 권한 해제" 버튼. 권한 있을 때만 렌더.
const AdminBadge = ({ onLogout }) => (
  <button
    onClick={onLogout}
    style={{
      // 우상단 튜토리얼 '?' 버튼(top 16px, 42px)과 안 겹치게 그 아래로 내림
      position: 'fixed', top: 'calc(70px + env(safe-area-inset-top))',
      right: 'calc(16px + env(safe-area-inset-right))', zIndex: 100,
      padding: '8px 16px', background: 'rgba(239, 68, 68, 0.9)',
      color: 'white', border: '1px solid #f87171', borderRadius: '8px',
      fontWeight: 'bold', cursor: 'pointer',
      boxShadow: '0 4px 6px rgba(0,0,0,0.3)', backdropFilter: 'blur(4px)',
    }}
  >
    🔒 관리자 권한 해제
  </button>
);

export default AdminBadge;
