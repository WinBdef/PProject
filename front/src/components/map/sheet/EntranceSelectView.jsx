// 길찾기 시작 전 출발 입구를 고르는 가로 스크롤 뷰.
// 카드 크기 결정: 모바일(<=600px)에선 130×180, 데스크탑은 160×220
const isMobileViewport = () =>
  typeof window !== 'undefined' && window.matchMedia('(max-width: 600px)').matches;

const EntranceCard = ({ entrance, onSelect }) => {
  const mobile = isMobileViewport();
  return (
  <div
    onClick={() => onSelect(entrance)}
    style={{
      flex: mobile ? '0 0 130px' : '0 0 160px',
      height: mobile ? '180px' : '220px',
      background: 'rgba(255,255,255,0.05)',
      border: '1px solid rgba(255,255,255,0.1)', borderRadius: '14px',
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden', cursor: 'pointer', position: 'relative',
    }}
  >
    {entrance.img ? (
      <img
        src={entrance.img}
        alt={entrance.name}
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        onError={(e) => {
          e.target.style.display = 'none';
          e.target.parentElement.style.backgroundColor = '#334155';
        }}
      />
    ) : (
      // 사진 미등록 → 빈 네모(placeholder). 나중에 img 채우면 자동 표시.
      <div style={{ width: '100%', height: '100%', background: '#334155' }} />
    )}
    <div style={{
      position: 'absolute', bottom: 0, left: 0, width: '100%',
      padding: mobile ? '14px 8px 10px 8px' : '20px 10px 15px 10px',
      background: 'linear-gradient(to top, rgba(0,0,0,0.95), transparent)',
      textAlign: 'center', fontWeight: 'bold',
      fontSize: mobile ? '0.82rem' : '0.95rem', color: '#fff',
    }}>
      {entrance.name}
    </div>
  </div>
  );
};

// entranceList 를 floor 필드 기준 그룹화 (입력 순서 보존).
// floor 없으면 '' 키 = 헤더 없이 한 줄 (타 건물 호환).
const groupByFloor = (list) => {
  const order = [];
  const map = {};
  list.forEach((e) => {
    const key = e.floor || '';
    if (!(key in map)) { map[key] = []; order.push(key); }
    map[key].push(e);
  });
  return order.map((k) => [k, map[k]]);
};

const EntranceSelectView = ({ entranceList, onBack, onSelect }) => (
  <div className="entrance-select-view" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: '0 20px 20px 20px' }}>
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: '20px', flexShrink: 0 }}>
      <button
        onClick={onBack}
        style={{
          background: 'none', border: 'none', color: '#ccc',
          fontSize: '1.5rem', cursor: 'pointer', paddingRight: '15px',
        }}
      >←</button>
      <div>
        <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 'bold', color: 'white' }}>
          어디서 출발하시나요?
        </h2>
        <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: '#818cf8' }}>
          가장 가까운 입구를 선택해주세요
        </p>
      </div>
    </div>

    {/* hidden 플래그 = sister 전환용 내부 진입점 — 사용자 선택 UI 에선 제외 */}
    {/* floor 필드 있으면 'PH층'/'2층' 그룹 헤더로 구분, 없으면 한 줄 */}
    <div style={{
      flex: 1, minHeight: 0, overflowY: 'auto',
      // 부모 시트의 touchAction:'none'(드래그 리사이즈용)이 터치 스크롤을 막으므로
      // 여기서 세로 스크롤(pan-y)을 다시 허용. WebkitOverflowScrolling: iOS 관성 스크롤.
      touchAction: 'pan-y', WebkitOverflowScrolling: 'touch',
    }}>
      {groupByFloor(entranceList.filter(e => !e.hidden)).map(([floorLabel, ents]) => (
        <div key={floorLabel || 'default'} style={{ marginBottom: '16px' }}>
          {floorLabel && (
            <div style={{
              color: '#cbd5e1', fontSize: '0.95rem', fontWeight: 700, margin: '0 0 8px 2px',
            }}>{floorLabel}</div>
          )}
          <div style={{
            display: 'flex', gap: '15px', overflowX: 'auto',
            paddingBottom: '8px', scrollbarWidth: 'none', msOverflowStyle: 'none',
            touchAction: 'pan-x',
          }}>
            {ents.map(ent => <EntranceCard key={ent.id} entrance={ent} onSelect={onSelect} />)}
            <div style={{ width: '10px', flexShrink: 0 }} />
          </div>
        </div>
      ))}
    </div>
  </div>
);

export default EntranceSelectView;
