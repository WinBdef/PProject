import React from 'react';

const Sidebar = ({ floorRows, roofPins, selectedMapId, onMapSelect, onEntranceJump }) => (
  <div className="floor-scroll-viewport" style={{ position: 'relative', overflowY: 'auto', overflowX: 'hidden' }}>
    <div className="building-3d-scene" style={{ pointerEvents: 'none' }}> {/* 🌟 장면 전체는 일단 클릭 무시 */}
      <div className="building-3d-wrapper" style={{ pointerEvents: 'auto' }}> {/* 🌟 실제 건물만 다시 클릭 허용 */}
        
        {roofPins && (
          <div className="roof-plate">
            {roofPins.map((pin, idx) => (
              <div key={idx} className={`roof-pin ${pin.type}`}>
                <span>{pin.label}</span>
              </div>
            ))}
          </div>
        )}
  
        {floorRows.map((row, idx) => (
          <React.Fragment key={idx}>
            {row.isGround && <div className="ground-platform"><span>Ground Level</span></div>}
            <div className={`floor-3d-row ${row.type}`}>
              {(row.zones || [row]).map((zone) => (
                <div 
                  key={zone.mapId} 
                  // 🌟 zone.disabled가 true면 'disabled' 클래스를 추가해서 회색빛으로 만듦
                  className={`floor-3d-box ${selectedMapId === zone.mapId ? 'active' : ''} ${zone.disabled ? 'disabled' : ''}`} 
                  onClick={() => onMapSelect(zone.mapId)}
                  style={zone.disabled ? { opacity: 0.5, cursor: 'not-allowed' } : {}} // 시각적 효과 추가
                >
                  <div className="face front">
                    <span className="box-text">
                      <strong>{zone.floor}</strong>
                      {zone.sub && <span className="sub-text">{zone.sub}</span>}
                    </span>
                  </div>
                  <div className="face back" />
                  <div className="face right" />
                  <div className="face left" />
                  <div className="face top" />
                  <div className="face bottom" />
                  
                  {/* 준비 안 된 층은 출입구 버튼도 안 보이게 처리 */}
                  {!zone.disabled && zone.entrances?.map(ent => (
                    <div 
                      key={ent} 
                      className={`entrance-floater ${ent}`} 
                      onClick={(e) => { 
                        e.stopPropagation(); 
                        onEntranceJump(zone, ent); 
                      }}
                    >
                      IN
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </React.Fragment>
        ))}
        
        <div className="building-base-shadow"></div>
      </div>
    </div>
  </div>
);

export default Sidebar;