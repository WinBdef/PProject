// 메인 화면에서 ❓ 버튼으로 여는 사용법 모달.
// 각 단계는 한 줄 설명 + 스크린샷. 이미지 파일이 아직 없으면 placeholder 표시.
// 이미지 추가 위치: front/public/assets/tutorial/step-<번호>.jpg

import { useState, useEffect } from 'react';

const STEPS = [
  {
    title: '1. 건물 선택',
    image: '/assets/tutorial/step-1.jpg',
    body: '메인 화면 가운데 카드에서 둘러볼 건물을 골라 클릭합니다. 좌우로 드래그해서 다른 건물을 볼 수 있어요.',
  },
  {
    title: '2. 층 선택',
    image: '/assets/tutorial/step-2.jpg',
    body: '왼쪽 사이드바에서 보고 싶은 층을 누르세요. 회색으로 표시된 층은 아직 준비 중입니다.',
  },
  {
    title: '3. 확대해서 보기',
    image: '/assets/tutorial/step-3.jpg',
    body: '우측 상단 ⤢ 버튼으로 전체화면으로 키우면 마커를 누르거나 길찾기를 시작할 수 있어요.',
  },
  {
    title: '4. 강의실 시간표',
    image: '/assets/tutorial/step-4.jpg',
    body: '강의실(노란/빨간 원)을 누르면 그 강의실의 요일별 시간표가 아래에서 올라옵니다. 빨간색은 지금 수업 중인 강의실.',
  },
  {
    title: '5. 길찾기 시작',
    image: '/assets/tutorial/step-5.jpg',
    body: '시간표 시트에서 강의실을 고른 뒤 🧭 길찾기 버튼을 누르면, 건물 출입구부터 강의실까지 카메라가 자동으로 안내합니다.',
  },
];

const overlayStyle = {
  position: 'fixed', inset: 0, zIndex: 10000,
  background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
};
const cardStyle = {
  width: 'min(560px, 100%)', maxHeight: '90vh',
  background: 'rgba(15, 23, 42, 0.97)',
  border: '1px solid rgba(129, 140, 248, 0.4)', borderRadius: 14,
  color: '#e2e8f0', fontFamily: 'system-ui, sans-serif',
  display: 'flex', flexDirection: 'column',
  boxShadow: '0 25px 60px rgba(0,0,0,0.55)',
};
const headerStyle = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.08)',
};
const imgWrapStyle = {
  position: 'relative', width: '100%', aspectRatio: '4 / 3',
  background: 'rgba(255,255,255,0.04)', display: 'flex',
  alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  borderBottom: '1px solid rgba(255,255,255,0.06)',
};
const placeholderStyle = {
  color: '#64748b', fontSize: 13, textAlign: 'center', padding: 24, lineHeight: 1.6,
};
const navBtn = (active) => ({
  padding: '10px 16px', fontSize: 13, fontWeight: 700,
  cursor: active ? 'pointer' : 'not-allowed',
  background: active ? '#3b82f6' : 'rgba(255,255,255,0.05)',
  color: active ? 'white' : '#64748b',
  border: 'none', borderRadius: 8,
});

export default function TutorialModal({ onClose }) {
  const [idx, setIdx] = useState(0);
  const [imgFailed, setImgFailed] = useState(false);
  const step = STEPS[idx];

  useEffect(() => { setImgFailed(false); }, [idx]);

  // ESC 닫기, 좌/우 키 이동
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight' && idx < STEPS.length - 1) setIdx(idx + 1);
      else if (e.key === 'ArrowLeft' && idx > 0) setIdx(idx - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [idx, onClose]);

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={cardStyle} onClick={(e) => e.stopPropagation()}>
        <div style={headerStyle}>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#facc15' }}>📖 사용법</div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: '#94a3b8',
            fontSize: 20, cursor: 'pointer', padding: 4,
          }}>✕</button>
        </div>

        <div style={imgWrapStyle}>
          {imgFailed ? (
            <div style={placeholderStyle}>
              📷 사진 준비 중<br/>
              <span style={{ fontSize: 11, color: '#475569' }}>
                {step.image}
              </span>
            </div>
          ) : (
            <img
              src={step.image}
              alt={step.title}
              onError={() => setImgFailed(true)}
              // contain: 비율 제각각인 스크린샷이 잘리지 않고 전체가 다 보이게 (여백은 어두운 배경)
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />
          )}
        </div>

        <div style={{ padding: '16px 20px' }}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>
            {step.title}
          </div>
          <div style={{ fontSize: 13, color: '#cbd5e1', lineHeight: 1.65 }}>
            {step.body}
          </div>
        </div>

        {/* 진행 도트 + 좌우 버튼 */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 18px 18px',
        }}>
          <button onClick={() => setIdx(idx - 1)} disabled={idx === 0} style={navBtn(idx > 0)}>← 이전</button>
          <div style={{ display: 'flex', gap: 6 }}>
            {STEPS.map((_, i) => (
              <span key={i} style={{
                width: 8, height: 8, borderRadius: 999,
                background: i === idx ? '#facc15' : 'rgba(255,255,255,0.18)',
              }} />
            ))}
          </div>
          {idx < STEPS.length - 1 ? (
            <button onClick={() => setIdx(idx + 1)} style={navBtn(true)}>다음 →</button>
          ) : (
            <button onClick={onClose} style={{ ...navBtn(true), background: '#10b981' }}>완료 ✓</button>
          )}
        </div>
      </div>
    </div>
  );
}
