import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import AdminBadge from '../components/home/AdminBadge';
import BuildingCarousel from '../components/home/BuildingCarousel';
import TutorialModal from '../components/home/TutorialModal';

import { useAdminAuth } from '../hooks/useAdminAuth';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';
import { useCarousel } from '../hooks/useCarousel';
import { apiUrl } from '../utils/api';

import './Home.css';

const Home = () => {
  const navigate = useNavigate();
  const [buildings, setBuildings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isTutorialOpen, setIsTutorialOpen] = useState(false);

  const { isAdmin, promptLogin, logout } = useAdminAuth();
  const layout = useResponsiveLayout();
  const carousel = useCarousel(buildings.length);

  useEffect(() => {
    fetch(apiUrl('/api/buildings'))
      .then(res => res.json())
      .then(data => { setBuildings(data); setLoading(false); });
  }, []);

  if (loading) return <div className="home-loading">3D 월드 로딩 중...</div>;

  return (
    <div className="home-scene">
      {isAdmin && <AdminBadge onLogout={logout} />}

      {/* 사용법 모달 트리거 — 우측 상단 */}
      <button
        onClick={() => setIsTutorialOpen(true)}
        aria-label="사용법"
        style={{
          position: 'fixed',
          top: 'calc(16px + env(safe-area-inset-top))',
          right: 'calc(16px + env(safe-area-inset-right))',
          zIndex: 100,
          width: 42, height: 42, borderRadius: '50%',
          background: 'rgba(15, 23, 42, 0.78)', backdropFilter: 'blur(8px)',
          border: '1px solid rgba(255, 255, 255, 0.18)',
          color: '#facc15', fontSize: 20, fontWeight: 700, cursor: 'pointer',
          boxShadow: '0 4px 14px rgba(0,0,0,0.45)',
        }}
      >
        ?
      </button>

      <div className="intro-text">
        {/* 제목 클릭 = 관리자 인증 진입점 */}
        <h1 onClick={promptLogin} style={{ cursor: 'pointer' }}>가천대 실내 3D 지도</h1>
        <p>탐색할 건물을 선택해주세요</p>
      </div>

      <BuildingCarousel
        buildings={buildings}
        layout={layout}
        carousel={carousel}
        onEnter={(item) => navigate(`/map/${item.id}`)}
      />

      {isTutorialOpen && (
        <TutorialModal onClose={() => setIsTutorialOpen(false)} />
      )}
    </div>
  );
};

export default Home;
