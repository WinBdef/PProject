import { useState, useEffect } from 'react';

const MOBILE_BREAKPOINT = 768;
const LAYOUT_MOBILE = { radiusX: 160, radiusZ: 140 };
const LAYOUT_DESKTOP = { radiusX: 320, radiusZ: 220 };

// Home 캐러셀의 반지름을 화면 너비에 맞춰 결정.
export const useResponsiveLayout = () => {
  const [layout, setLayout] = useState(LAYOUT_DESKTOP);

  useEffect(() => {
    const update = () => {
      setLayout(window.innerWidth < MOBILE_BREAKPOINT ? LAYOUT_MOBILE : LAYOUT_DESKTOP);
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  return layout;
};
