import React from 'react';
import { Outlet } from 'react-router-dom';
import './MainLayout.css';

const MainLayout = () => {
  return (
    <div className="layout-container">
      {/* 상단 헤더 (모든 페이지 공통) */}
      <header className="top-header">
        <div className="brand-logo">🏫 Gachon 3D Map</div>
      </header>

      {/* 페이지 콘텐츠 */}
      <main className="content-body">
        <Outlet />
      </main>

      {/* 하단 바 없음 (Home에서 개별적으로 처리) */}
    </div>
  );
};

export default MainLayout;