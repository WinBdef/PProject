import { useState } from 'react';
import { useBottomSheet } from '../../../hooks/useBottomSheet';
import EntranceSelectView from '../sheet/EntranceSelectView';

// 교직원실(office) 마커 클릭 시 뜨는 정보 시트.
// 강의실(TimetableSheet) 과 달리 시간표가 없으므로 roomName + description 만 표시.
// 길찾기는 강의실과 동일하게 EntranceSelectView 재사용 — 입구 선택 시 onWayfindingStart 호출.
const SHEET_HEIGHT_INFO = 36;
const SHEET_HEIGHT_ENTRANCE = 65;

const OfficeInfoSheet = ({ roomData, onClose, onWayfindingStart, entranceList = [] }) => {
  const [view, setView] = useState('info');
  const sheet = useBottomSheet({ initialHeight: SHEET_HEIGHT_INFO, onClose });
  const desc = (roomData?.description || '').trim();
  // 모바일 detect — 인라인 스타일 사이즈 분기용 (회전 시 갱신은 안 됨, acceptable)
  const m = typeof window !== 'undefined' && window.matchMedia('(max-width: 600px)').matches;

  const goToEntrance = () => {
    setView('entrance');
    sheet.setSheetHeight(SHEET_HEIGHT_ENTRANCE);
  };
  const backToInfo = () => {
    setView('info');
    sheet.setSheetHeight(SHEET_HEIGHT_INFO);
  };

  return (
    <div
      className="timetable-sheet"
      style={{
        position: 'absolute', bottom: 0, left: 0, width: '100%',
        background: 'rgba(15, 20, 35, 0.96)', backdropFilter: 'blur(24px)',
        borderTopLeftRadius: '24px', borderTopRightRadius: '24px',
        borderTop: '1px solid rgba(99, 130, 246, 0.25)', zIndex: 2000000,
        boxShadow: '0 -16px 50px rgba(0,0,0,0.6), 0 -2px 0 rgba(59,130,246,0.15) inset',
        display: 'flex', flexDirection: 'column',
        height: `${sheet.sheetHeight}vh`,
        transition: sheet.isDragging ? 'none' : 'height 0.4s cubic-bezier(0.2, 0.8, 0.2, 1)',
        touchAction: 'none',
        overflow: 'hidden',
      }}
    >
      {/* 드래그 핸들 */}
      <div
        style={{
          width: '100%', height: '36px', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          cursor: 'grab', flexShrink: 0,
        }}
        onTouchStart={sheet.onTouchStart}
        onTouchMove={sheet.onTouchMove}
        onTouchEnd={() => sheet.onTouchEnd(view === 'entrance' ? SHEET_HEIGHT_ENTRANCE : SHEET_HEIGHT_INFO)}
      >
        <div style={{
          width: '46px', height: '5px',
          background: 'rgba(255,255,255,0.25)', borderRadius: '3px',
        }} />
      </div>

      {view === 'entrance' ? (
        <EntranceSelectView
          entranceList={entranceList}
          onBack={backToInfo}
          onSelect={onWayfindingStart}
        />
      ) : (
        <>
          {/* 헤더: 그라데이션 + 아이콘 + 이름 + 칩 + 닫기 */}
          <div style={{
            position: 'relative',
            padding: m ? '4px 16px 12px' : '6px 24px 18px',
            background: 'linear-gradient(135deg, rgba(59,130,246,0.18) 0%, rgba(99,102,241,0.10) 60%, transparent 100%)',
            borderBottom: '1px solid rgba(255,255,255,0.07)',
          }}>
            <button
              onClick={onClose}
              style={{
                position: 'absolute', top: 8, right: m ? 12 : 16,
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: 'rgba(255,255,255,0.7)',
                width: m ? 26 : 32, height: m ? 26 : 32, borderRadius: '50%',
                fontSize: m ? '0.85rem' : '1rem', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'background 0.15s, color 0.15s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.14)'; e.currentTarget.style.color = 'white'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = 'rgba(255,255,255,0.7)'; }}
            >✕</button>

            <div style={{ display: 'flex', alignItems: 'center', gap: m ? 10 : 14, paddingRight: m ? 34 : 44 }}>
              <div style={{
                width: m ? 36 : 48, height: m ? 36 : 48, flexShrink: 0,
                borderRadius: m ? 10 : 14,
                background: 'linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: m ? 18 : 24,
                boxShadow: '0 6px 16px rgba(59,130,246,0.45), 0 0 0 1px rgba(255,255,255,0.08) inset',
              }}>
                💼
              </div>

              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{
                  display: 'inline-block',
                  padding: m ? '1px 7px' : '2px 9px', marginBottom: m ? 3 : 5,
                  background: 'rgba(59,130,246,0.18)',
                  border: '1px solid rgba(59,130,246,0.4)',
                  borderRadius: 999,
                  fontSize: m ? 8.5 : 10.5, fontWeight: 700, letterSpacing: 0.4,
                  color: '#93c5fd', textTransform: 'uppercase',
                }}>
                  교직원실
                </div>
                <h3 style={{
                  margin: 0, color: 'white',
                  fontSize: m ? '1rem' : '1.25rem', fontWeight: 700, letterSpacing: -0.2,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {roomData?.roomName || '교직원실'}
                </h3>
              </div>
            </div>
          </div>

          {/* 본문: 좌측 컬러바 + description 카드 */}
          <div style={{
            padding: m ? '12px 16px 10px' : '20px 24px 16px', overflowY: 'auto', flex: 1,
          }}>
            <div style={{
              position: 'relative',
              padding: m ? '10px 12px 10px 14px' : '16px 16px 16px 20px',
              background: 'rgba(255,255,255,0.035)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: m ? 9 : 12,
              color: 'rgba(255,255,255,0.88)',
              fontSize: m ? '0.78rem' : '0.95rem', lineHeight: 1.6,
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>
              <div style={{
                position: 'absolute', left: 0, top: 12, bottom: 12, width: 3,
                background: 'linear-gradient(180deg, #3b82f6, #6366f1)',
                borderRadius: 2,
              }} />
              {desc || (
                <span style={{ color: 'rgba(255,255,255,0.42)', fontStyle: 'italic' }}>
                  등록된 설명이 없습니다.
                </span>
              )}
            </div>
          </div>

          {/* 길찾기 버튼 — 강의실과 동일한 UX */}
          {onWayfindingStart && entranceList.length > 0 && (
            <div style={{ padding: m ? '8px 16px 12px' : '12px 24px 18px', flexShrink: 0, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <button
                onClick={goToEntrance}
                style={{
                  width: '100%', padding: m ? '10px' : '14px', cursor: 'pointer',
                  background: 'linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)',
                  color: 'white', border: 'none', borderRadius: m ? 10 : 12,
                  fontSize: m ? '0.85rem' : '1.02rem', fontWeight: 700,
                  display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8,
                  boxShadow: '0 6px 18px rgba(59,130,246,0.4)',
                }}
              >
                <span>🧭</span> 길찾기 시작
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default OfficeInfoSheet;
