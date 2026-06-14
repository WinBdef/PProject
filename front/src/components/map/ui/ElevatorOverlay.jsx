// 길찾기 cinematic 동안 화면 전체를 가리는 검은 풀스크린 오버레이.
// navStep 에 따라 메시지 구분: 맵 로딩 / 엘베 이동 / 구역 전환 / 구름다리 통과.
const STEP_TITLE = {
  preparing: '맵 로딩 중...',
  elevator_ride: '엘리베이터 이동 중...',
  bridge_cross: '구름다리 통과 중...',
};

const ElevatorOverlay = ({ navStep, startMapId, destMapId, sectionLabel, fromLabel }) => {
  // isSection / sectionSuffix 케이스는 elevator_ride 라도 cinematic 의미가 다름 → 메시지 override
  let message = STEP_TITLE[navStep] || '준비 중...';
  if (navStep === 'elevator_ride' && sectionLabel) {
    message = `${sectionLabel} 중...`;
  }

  // mapId → 층 라벨: 비전 'V_1F'→'1F', AI '2F_A'→'2F'
  const floorOf = (id) => { if (!id) return ''; const p = id.split('_'); return p[0] === 'V' ? p[1] : p[0]; };
  // 출발 층 표시: PH 출발이면 'PH', 아니면 mapId 의 층 부분
  const fromFloor = fromLabel || floorOf(startMapId);
  const toFloor = floorOf(destMapId);
  // 층 인디케이터: 엘베 이동 단계에서, PH 출발(fromLabel)이거나 출발↔도착 층이 다를 때만
  const showFloors = navStep === 'elevator_ride' && !sectionLabel
    && fromFloor && toFloor && (fromLabel || fromFloor !== toFloor);
  // PH(옥상)→아래층은 내려가므로 ▼, 일반 환승은 ▲
  const arrow = fromLabel ? '▼' : '▲';

  return (
    <div className="elevator-overlay">
      <div className="elevator-panel">
        {showFloors && (
          <div className="floor-indicator">
            <span>{fromFloor}</span>
            <span className="arrow">{arrow}</span>
            <span>{toFloor}</span>
          </div>
        )}
        <p>{message}</p>
      </div>
    </div>
  );
};

export default ElevatorOverlay;
