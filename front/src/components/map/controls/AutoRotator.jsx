import { useFrame } from '@react-three/fiber';

const AutoRotator = ({ isEnabled, controlsRef }) => {
  useFrame((state, delta) => {
    // 사용자가 조작 중이거나(hasInteracted) 1인칭 모드(isWalking)가 아닐 때만 회전
    if (isEnabled && controlsRef.current) {
      // 0.2는 회전 속도입니다. 숫자를 높이면 더 빨리 돕니다.
      controlsRef.current.azimuthAngle += 0.2 * delta;
    }
  });

  return null;
};

export default AutoRotator;