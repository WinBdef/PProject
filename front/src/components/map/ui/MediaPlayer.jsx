// 길찾기 진행 상황을 표시하는 유튜브 스타일 미디어 플레이어.
// useNavigationState 가 반환한 값들을 거의 그대로 받음.

// mapId → 층 라벨: 비전 'V_3F'→'3F', AI '2F_A'→'2F'.
// 비전 mapId 는 '건물_층'(V_3F) 이라 split('_')[0] 가 'V' 로 잡혀
// "출발: V 구역" 처럼 떠서, ElevatorOverlay 와 동일하게 층 부분을 골라낸다.
const floorLabel = (id) => {
  if (!id) return '';
  const p = id.split('_');
  return p[0] === 'V' ? p[1] : p[0];
};

const STEP_LABELS = {
  moving_to_elevator: (plan) => `출발: ${floorLabel(plan.startMapId)} 구역`,
  elevator_ride: (plan) => (plan?.isSection
    ? `${plan.sectionEntryName} 쪽으로 이동 중...`
    : plan?.sectionSuffix
    ? `${floorLabel(plan.suffixSisterMapId)} 구역 통해 이동 중...`
    : '엘리베이터 이동 중...'),
  moving_to_bridge: () => `구름다리 진입 중...`,
  bridge_cross: () => `구름다리 통과 중...`,
  finished: () => `목적지 도착 완료`,
  moving_to_dest: (plan) => `도착: ${floorLabel(plan.destMapId)} 구역`,
};

const MediaPlayer = ({
  navStep, navPlan, isPlaying, isScrubbing,
  sliderValue, tooltipText, p1, p2,
  onClose, onTogglePlay,
  onScrubChange, onScrubStart, onScrubEnd,
  onJumpToChapter,
}) => {
  const titleFn = STEP_LABELS[navStep] || (() => '');
  const title = titleFn(navPlan);

  return (
    <div className="media-player-container">
      <div className="media-player-header">
        <span className="media-title">{title}</span>
        <button className="btn-close-player" onClick={onClose}>✕</button>
      </div>

      <div className="media-controls-row">
        <button className="btn-play-pause" onClick={onTogglePlay}>{isPlaying ? '⏸' : '▶'}</button>

        <div
          className={`media-scrubber-wrapper ${isScrubbing ? 'scrubbing' : ''}`}
          style={{ '--progress': `${sliderValue}%` }}
        >
          <div className="scrubber-bg" />

          <div className="yt-chapter-node" style={{ left: '0%' }} onClick={() => onJumpToChapter('start')}>
            <div className={`yt-node-dot ${sliderValue >= 0 ? 'active' : ''}`} />
          </div>
          <div className="yt-chapter-node" style={{ left: `${p1}%` }} onClick={() => onJumpToChapter('elevator')}>
            <div className={`yt-node-dot ${sliderValue >= p1 ? 'active' : ''}`} />
          </div>
          <div className="yt-chapter-node" style={{ left: `${p1 + p2}%` }} onClick={() => onJumpToChapter('dest')}>
            <div className={`yt-node-dot ${sliderValue >= p1 + p2 ? 'active' : ''}`} />
          </div>

          <div className="scrubber-fill" style={{ width: `${sliderValue}%` }} />
          <div className="scrubber-tooltip">{tooltipText}</div>

          <input
            type="range" min="0" max="100" step="0.1"
            value={sliderValue}
            onChange={(e) => onScrubChange(parseFloat(e.target.value))}
            onPointerDown={onScrubStart}
            onPointerUp={onScrubEnd}
            onPointerLeave={onScrubEnd}
            className="scrubber-input"
          />
        </div>
      </div>
    </div>
  );
};

export default MediaPlayer;
