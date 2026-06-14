import { useState } from 'react';
import { useBottomSheet } from '../../../hooks/useBottomSheet';
import TimetableView from '../sheet/TimetableView';
import EntranceSelectView from '../sheet/EntranceSelectView';

// 강의실 클릭 시 올라오는 바텀 시트. 시간표 ↔ 입구 선택 뷰를 전환.
const TimetableSheet = ({ roomData, selectedDay, onDaySelect, onClose, onWayfindingStart, entranceList }) => {
  const [view, setView] = useState('timetable');

  const sheet = useBottomSheet({
    initialHeight: 45,
    onClose,
  });

  const goToEntrance = () => {
    setView('entrance');
    sheet.setSheetHeight(65);
  };

  const backToTimetable = () => {
    setView('timetable');
    sheet.setSheetHeight(45);
  };

  return (
    <div
      className="timetable-sheet"
      style={{
        position: 'absolute', bottom: 0, left: 0, width: '100%',
        background: 'rgba(20, 25, 40, 0.95)', backdropFilter: 'blur(20px)',
        borderTopLeftRadius: '20px', borderTopRightRadius: '20px',
        borderTop: '1px solid rgba(255,255,255,0.1)', zIndex: 2000000,
        boxShadow: '0 -10px 40px rgba(0,0,0,0.5)',
        display: 'flex', flexDirection: 'column',
        height: `${sheet.sheetHeight}vh`,
        transition: sheet.isDragging ? 'none' : 'height 0.4s cubic-bezier(0.2, 0.8, 0.2, 1)',
        touchAction: 'none',
      }}
    >
      {/* 드래그 핸들 */}
      <div
        style={{
          width: '100%', height: '40px', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          cursor: 'grab', flexShrink: 0,
        }}
        onTouchStart={sheet.onTouchStart}
        onTouchMove={sheet.onTouchMove}
        onTouchEnd={() => sheet.onTouchEnd(view === 'entrance' ? 65 : 45)}
      >
        <div style={{ width: '50px', height: '5px', background: 'rgba(255,255,255,0.3)', borderRadius: '3px' }} />
      </div>

      {view === 'timetable' ? (
        <TimetableView
          roomData={roomData}
          selectedDay={selectedDay}
          onDaySelect={onDaySelect}
          onClose={onClose}
          onStartWayfinding={goToEntrance}
        />
      ) : (
        <EntranceSelectView
          entranceList={entranceList}
          onBack={backToTimetable}
          onSelect={(ent) => { onWayfindingStart(ent); onClose(); }}
        />
      )}
    </div>
  );
};

export default TimetableSheet;
