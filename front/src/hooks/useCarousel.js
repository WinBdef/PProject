import { useState, useRef } from 'react';

// 가천대 건물 카드들을 원형 캐러셀로 굴리기 위한 드래그+스냅 훅.
// 카드 개수에 맞춰 ANGLE_PER_CARD를 계산하고, 손가락 떼면 가장 가까운 카드로 스냅.
export const useCarousel = (itemCount) => {
  const [rotation, setRotation] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startRotation = useRef(0);

  const anglePerCard = itemCount > 0 ? 360 / itemCount : 0;

  const onStart = (clientX) => {
    if (itemCount === 0) return;
    isDragging.current = true;
    setIsAnimating(false);
    startX.current = clientX;
    startRotation.current = rotation;
  };

  const onMove = (clientX) => {
    if (!isDragging.current) return;
    setRotation(startRotation.current + (clientX - startX.current) * 0.5);
  };

  const onEnd = () => {
    if (!isDragging.current) return;
    isDragging.current = false;
    const snapped = Math.round(rotation / anglePerCard) * anglePerCard;
    setIsAnimating(true);
    setRotation(snapped);
  };

  return { rotation, isAnimating, anglePerCard, onStart, onMove, onEnd };
};
