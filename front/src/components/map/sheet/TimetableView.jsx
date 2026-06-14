const DAYS = ['월', '화', '수', '목', '금'];

// 현재 요일/교시 (백엔드 status 산정과 같은 매핑: 9시=1교시, hour-8)
function nowDayPeriod() {
  const now = new Date();
  const day = ['일', '월', '화', '수', '목', '금', '토'][now.getDay()];
  return { day, period: now.getHours() - 8 };
}

// 강의실 시간표 뷰: 헤더 + 요일 탭 + 스케줄 리스트 + 길찾기 버튼.
const TimetableView = ({ roomData, selectedDay, onDaySelect, onClose, onStartWayfinding }) => {
  const { day: todayDay, period: nowPeriod } = nowDayPeriod();
  const isLive = (s) => selectedDay === todayDay && s.period === nowPeriod;
  // period 오름차순 정렬. period 없는 (이상 데이터)는 뒤로.
  const sorted = [...(roomData.all_schedule?.[selectedDay] || [])]
    .sort((a, b) => (a.period ?? 99) - (b.period ?? 99));

  return (
  <div style={{
    display: 'flex', flexDirection: 'column', flex: 1,
    padding: '0 20px', overflow: 'hidden',
  }}>
    <div className="sheet-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
      <div>
        <div style={{
          background: '#3b82f6', color: 'white', padding: '4px 10px',
          borderRadius: '6px', display: 'inline-block',
          fontSize: '0.85rem', fontWeight: '800',
        }}>
          {roomData.roomName}
        </div>
        <h2 style={{ margin: '8px 0 0 0', color: 'white', fontSize: '1.4rem' }}>
          {roomData.description || '정보 없음'}
        </h2>
      </div>
      <button
        onClick={onClose}
        style={{
          background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white',
          width: '32px', height: '32px', borderRadius: '50%', cursor: 'pointer',
          fontSize: '1.2rem', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >✕</button>
    </div>

    <div className="day-tabs" style={{ display: 'flex', gap: '8px', margin: '20px 0 10px 0', flexShrink: 0 }}>
      {DAYS.map(d => (
        <button
          key={d}
          onClick={() => onDaySelect(d)}
          style={{
            flex: 1, padding: '10px 0', borderRadius: '8px', border: 'none',
            background: selectedDay === d ? '#3b82f6' : 'rgba(255,255,255,0.08)',
            color: selectedDay === d ? 'white' : '#94a3b8',
            fontWeight: 'bold', cursor: 'pointer', transition: 'all 0.2s',
          }}
        >{d}</button>
      ))}
    </div>

    <div className="sheet-body" style={{ flex: 1, overflowY: 'auto', paddingRight: '5px', scrollbarWidth: 'none' }}>
      <div className="schedule-container" style={{ display: 'flex', flexDirection: 'column', gap: '10px', paddingBottom: '10px' }}>
        {sorted.length > 0 ? (
          sorted.map((s, i) => {
            const live = isLive(s);
            return (
              <div key={i} className={`schedule-item${live ? ' live' : ''}`} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '16px',
                background: live
                  ? 'linear-gradient(135deg, rgba(239,68,68,0.22) 0%, rgba(239,68,68,0.08) 100%)'
                  : 'rgba(255,255,255,0.05)',
                borderRadius: '12px',
                borderLeft: `${live ? 6 : 4}px solid ${live ? '#ef4444' : '#818cf8'}`,
                boxShadow: live ? '0 0 18px rgba(239,68,68,0.35)' : 'none',
                transform: live ? 'scale(1.015)' : 'scale(1)',
                transition: 'transform 0.2s, box-shadow 0.2s',
              }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{
                    color: live ? '#fca5a5' : '#a5b4fc',
                    fontSize: '0.8rem', marginBottom: '4px', fontWeight: 'bold',
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}>
                    {s.time_text}
                    {live && (
                      <span className="live-badge" style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        background: '#ef4444', color: 'white',
                        padding: '2px 8px', borderRadius: 999,
                        fontSize: '0.62rem', fontWeight: 800, letterSpacing: 0.6,
                      }}>
                        <span className="live-dot" style={{
                          width: 6, height: 6, borderRadius: '50%', background: 'white',
                        }} />
                        지금 진행 중
                      </span>
                    )}
                  </div>
                  <div style={{
                    color: 'white',
                    fontSize: live ? '1.05rem' : '1rem',
                    fontWeight: live ? 700 : 500,
                  }}>
                    {s.subject}
                  </div>
                </div>
                <div style={{
                  color: live ? '#fecaca' : '#94a3b8',
                  fontSize: '0.9rem', fontWeight: live ? 600 : 400,
                }}>{s.prof} 교수</div>
              </div>
            );
          })
        ) : (
          <div style={{
            color: '#64748b', textAlign: 'center', padding: '30px 0',
            background: 'rgba(255,255,255,0.03)', borderRadius: '12px',
          }}>
            해당 요일은 예정된 수업이 없습니다.
          </div>
        )}
      </div>
    </div>

    <div style={{ padding: '15px 0', flexShrink: 0, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
      <button
        className="btn-wayfinding"
        style={{
          width: '100%', padding: '15px', background: '#3b82f6',
          color: 'white', border: 'none', borderRadius: '12px',
          fontSize: '1.05rem', fontWeight: 'bold', cursor: 'pointer',
          display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px',
          boxShadow: '0 4px 15px rgba(59, 130, 246, 0.4)',
        }}
        onClick={onStartWayfinding}
      >
        <span>🧭</span> 길찾기 시작
      </button>
    </div>
  </div>
  );
};

export default TimetableView;
