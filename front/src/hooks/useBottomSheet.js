import { useState, useRef } from 'react';

// 모바일 바텀 시트 높이(vh)를 터치 드래그로 조절.
// 임계값을 넘으면 자동으로 확장/축소/닫힘.
export const useBottomSheet = ({
  initialHeight = 45,
  maxHeight = 95,
  expandThreshold = 65,
  closeThreshold = 25,
  expandedHeight = 85,
  onClose,
} = {}) => {
  const [sheetHeight, setSheetHeight] = useState(initialHeight);
  const [isDragging, setIsDragging] = useState(false);
  const startY = useRef(0);
  const startHeight = useRef(0);

  const onTouchStart = (e) => {
    setIsDragging(true);
    startY.current = e.touches[0].clientY;
    startHeight.current = sheetHeight;
  };

  const onTouchMove = (e) => {
    const deltaY = startY.current - e.touches[0].clientY;
    const deltaVh = (deltaY / window.innerHeight) * 100;
    const next = startHeight.current + deltaVh;
    if (next >= 0 && next <= maxHeight) setSheetHeight(next);
  };

  const onTouchEnd = (restingHeight = initialHeight) => {
    setIsDragging(false);
    if (sheetHeight > expandThreshold) setSheetHeight(expandedHeight);
    else if (sheetHeight < closeThreshold) onClose?.();
    else setSheetHeight(restingHeight);
  };

  return { sheetHeight, setSheetHeight, isDragging, onTouchStart, onTouchMove, onTouchEnd };
};
