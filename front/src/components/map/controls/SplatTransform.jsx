import { useRef, useEffect } from 'react';
import { TransformControls } from '@react-three/drei';

// 관리자 모드 'splat' 도구에서, 선택된 스플랫에 transform gizmo 부착.
// drei 의 <TransformControls> 는 자기 자식 객체를 직접 조작하므로,
// <group ref> 로 감싸 그 ref 를 object 로 넘기는 게 아니라 자식 mode 로 둔다.
// (object prop 으로 ref.current 를 넘기면 mount 시점 race 가 있어 부정확함)
//
// 변경 발생 시 group 의 position/rotation/scale 을 읽어 부모에 [x,y,z]/scalar 로 전달.
// 드래그 중에는 CameraControls 가 카메라 회전을 안 가로채도록 onDraggingChange 콜백.
export default function SplatTransform({ mode, position, rotation, scale, onChange, onDraggingChange, children }) {
  const groupRef = useRef();

  // 부모에서 prop 으로 새 값이 들어오면 그룹의 transform 갱신 (숫자 인풋 편집 반영)
  useEffect(() => {
    const g = groupRef.current;
    if (!g) return;
    if (position) g.position.set(position[0] || 0, position[1] || 0, position[2] || 0);
    if (rotation) g.rotation.set(rotation[0] || 0, rotation[1] || 0, rotation[2] || 0);
    const s = typeof scale === 'number' ? scale : 1;
    g.scale.set(s, s, s);
  }, [position, rotation, scale]);

  const handleChange = () => {
    const g = groupRef.current;
    if (!g || !onChange) return;
    onChange({
      position: [+g.position.x.toFixed(3), +g.position.y.toFixed(3), +g.position.z.toFixed(3)],
      rotation: [+g.rotation.x.toFixed(3), +g.rotation.y.toFixed(3), +g.rotation.z.toFixed(3)],
      scale: +g.scale.x.toFixed(3),
    });
  };

  return (
    <TransformControls
      mode={mode}
      size={0.7}
      onObjectChange={handleChange}
      onMouseDown={() => onDraggingChange?.(true)}
      onMouseUp={() => onDraggingChange?.(false)}
    >
      <group ref={groupRef}>
        {children}
      </group>
    </TransformControls>
  );
}
