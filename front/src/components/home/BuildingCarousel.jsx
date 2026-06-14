// 가천대 건물 카드들을 원형 캐러셀로 굴리는 컴포넌트.
// 회전·드래그·스냅 로직은 useCarousel 훅에 위임.
const BuildingCard = ({ item, transform, zIndex, opacity, isFront, isAnimating, onEnter }) => (
  <div
    className={`card ${isFront ? 'front-glow' : ''}`}
    style={{
      transform, zIndex, opacity,
      transition: isAnimating
        ? 'transform 0.6s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.6s'
        : 'none',
      backgroundImage: `url(${item.img})`,
    }}
  >
    <div className="card-overlay">
      <div className="card-content">
        <h2>{item.name}</h2>
        <button className="btn-enter" onClick={() => item.isReady && onEnter(item)}>
          {item.isReady ? '입장하기' : '준비 중...'}
        </button>
      </div>
    </div>
  </div>
);

const BuildingCarousel = ({ buildings, layout, carousel, onEnter }) => {
  const { rotation, anglePerCard, isAnimating, onStart, onMove, onEnd } = carousel;

  return (
    <div
      className="stage"
      onMouseDown={(e) => onStart(e.clientX)}
      onMouseMove={(e) => onMove(e.clientX)}
      onMouseUp={onEnd}
      onMouseLeave={onEnd}
      onTouchStart={(e) => onStart(e.touches[0].clientX)}
      onTouchMove={(e) => onMove(e.touches[0].clientX)}
      onTouchEnd={onEnd}
    >
      {buildings.map((item, index) => {
        const theta = (rotation + index * anglePerCard) * (Math.PI / 180);
        const x = layout.radiusX * Math.sin(theta);
        const z = layout.radiusZ * Math.cos(theta);
        const scale = (z + layout.radiusZ * 2.5) / (layout.radiusZ * 3.5);

        return (
          <BuildingCard
            key={item.id}
            item={item}
            transform={`translate3d(${x}px, 0, ${z}px) scale(${scale})`}
            zIndex={Math.round(z + layout.radiusZ)}
            opacity={Math.max(0.4, (z + layout.radiusZ * 1.5) / (layout.radiusZ * 2.5))}
            isFront={scale > 0.95}
            isAnimating={isAnimating}
            onEnter={onEnter}
          />
        );
      })}
    </div>
  );
};

export default BuildingCarousel;
