import React, { useState, useRef } from 'react';

const Joystick = ({ onMove }) => {
  const containerRef = useRef(null);
  const knobRef = useRef(null);
  const [active, setActive] = useState(false);

  const update = (clientX, clientY) => {
    if (!containerRef.current || !knobRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    let dx = clientX - centerX; 
    let dy = clientY - centerY;
    const max = rect.width / 2 - 20;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > max) {
      const angle = Math.atan2(dy, dx);
      dx = Math.cos(angle) * max;
      dy = Math.sin(angle) * max;
    }
    knobRef.current.style.transform = `translate(${dx}px, ${dy}px)`;
    onMove({ x: dx / max, y: -(dy / max) });
  };

  return (
    <div style={{ position: 'absolute', bottom: '60px', left: '50%', transform: 'translateX(-50%)', width: '120px', height: '120px', zIndex: 10000, touchAction: 'none' }}
      onPointerDown={(e) => { setActive(true); update(e.clientX, e.clientY); }}
      onPointerMove={(e) => { if (active) update(e.clientX, e.clientY); }}
      onPointerUp={() => { setActive(false); onMove({ x: 0, y: 0 }); knobRef.current.style.transform = 'translate(0,0)'; }}
    >
      <div ref={containerRef} style={{ width: '100%', height: '100%', borderRadius: '50%', background: 'rgba(255, 255, 255, 0.2)', border: '2px solid rgba(255, 255, 255, 0.4)', position: 'relative' }}>
        <div ref={knobRef} style={{ position: 'absolute', top: '50%', left: '50%', width: '50px', height: '50px', borderRadius: '50%', background: '#fff', marginTop: '-25px', marginLeft: '-25px' }} />
      </div>
    </div>
  );
};

export default Joystick;