// 관리자 모드 'splat' 도구 패널.
// 현재 층의 3D 스플랫을 골라 위치·회전·크기를 인터랙티브 편집.
// gizmo 모드는 이동/회전/크기 토글, T/R/S 키로도 전환.
// 변경은 부모(MapPage)의 splatsDraft 에 즉시 반영되고, [저장]을 누르면
// 백엔드 floors.json 의 splats 키만 병합 저장된다.

import { useEffect } from 'react';

const TOOLS = [
  { key: 'marker', label: '마커' },
  { key: 'route', label: '경로' },
  { key: 'splat', label: '스플랫' },
];

const SAVE_LABEL = {
  idle: '💾 백엔드에 저장',
  saving: '저장 중…',
  saved: '✓ 저장됨',
  error: '✕ 저장 실패 (백엔드 확인)',
};

// 키보드 단축키는 1/2/3 사용 — R/S 는 FlyController(WASD/R-hold)와 충돌해서 회피
const MODES = [
  { key: 'translate', label: '이동 (1)' },
  { key: 'rotate', label: '회전 (2)' },
  { key: 'scale', label: '크기 (3)' },
];

const inputStyle = {
  width: '100%', boxSizing: 'border-box', padding: '6px 8px', marginTop: 3,
  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 5, color: '#e2e8f0', fontSize: 12, fontFamily: 'monospace',
};

function NumberInput({ value, onChange, step = 0.05 }) {
  return (
    <input
      type="number" step={step}
      value={Number.isFinite(value) ? value : 0}
      onChange={(e) => onChange(Number(e.target.value))}
      style={inputStyle}
    />
  );
}

export default function SplatPanel({
  adminTool, setAdminTool, floorId, splats, editingIdx,
  transformMode, setTransformMode,
  onSelect, onUpdate, onAdd, onDelete, onSave, saveStatus,
}) {
  const editing = editingIdx != null ? splats[editingIdx] : null;

  const updateConfig = (patch) => {
    if (editing == null) return;
    onUpdate(editingIdx, {
      ...editing,
      splatConfig: { ...editing.splatConfig, ...patch },
    });
  };

  const updateAxis = (key, axis, val) => {
    const arr = editing?.splatConfig?.[key] || [0, 0, 0];
    const next = [...arr];
    next[axis] = val;
    updateConfig({ [key]: next });
  };

  // 키보드 단축키: 1/2/3 모드 전환 + 현재 모드에 따라 화살표/PgUp/PgDn 으로 미세 조정.
  // Shift = 5배 빠르게, Alt = 1/5 미세. R/S 는 FlyController 와 겹쳐 회피.
  useEffect(() => {
    const handler = (e) => {
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      // 모드 전환
      if (e.key === '1') { setTransformMode('translate'); return; }
      if (e.key === '2') { setTransformMode('rotate'); return; }
      if (e.key === '3') { setTransformMode('scale'); return; }

      if (editing == null) return;

      // 스텝 크기: 기본 + Shift(×5) / Alt(÷5)
      const stepBase = transformMode === 'translate' ? 0.1
        : transformMode === 'rotate' ? 0.05
        : 0.02;
      const mult = e.shiftKey ? 5 : e.altKey ? 0.2 : 1;
      const step = stepBase * mult;

      const bumpAxis = (key, axis, sign) => {
        const arr = editing.splatConfig?.[key] || [0, 0, 0];
        updateAxis(key, axis, +(arr[axis] + sign * step).toFixed(3));
      };

      let consumed = true;
      if (transformMode === 'translate') {
        // ←→ x , ↑↓ z(앞뒤, ↑=카메라 앞쪽이라 -z), PgUp/PgDn y
        if (e.key === 'ArrowLeft') bumpAxis('position', 0, -1);
        else if (e.key === 'ArrowRight') bumpAxis('position', 0, +1);
        else if (e.key === 'ArrowUp') bumpAxis('position', 2, -1);
        else if (e.key === 'ArrowDown') bumpAxis('position', 2, +1);
        else if (e.key === 'PageUp') bumpAxis('position', 1, +1);
        else if (e.key === 'PageDown') bumpAxis('position', 1, -1);
        else consumed = false;
      } else if (transformMode === 'rotate') {
        // ←→ Y(요), ↑↓ X(피치), PgUp/PgDn Z(롤)
        if (e.key === 'ArrowLeft') bumpAxis('rotation', 1, -1);
        else if (e.key === 'ArrowRight') bumpAxis('rotation', 1, +1);
        else if (e.key === 'ArrowUp') bumpAxis('rotation', 0, -1);
        else if (e.key === 'ArrowDown') bumpAxis('rotation', 0, +1);
        else if (e.key === 'PageUp') bumpAxis('rotation', 2, +1);
        else if (e.key === 'PageDown') bumpAxis('rotation', 2, -1);
        else consumed = false;
      } else {
        // scale: ↑/+ 크게, ↓/- 작게
        const cur = editing.splatConfig?.scale ?? 1;
        if (e.key === 'ArrowUp' || e.key === '+' || e.key === '=') {
          updateConfig({ scale: +(cur + step).toFixed(3) });
        } else if (e.key === 'ArrowDown' || e.key === '-' || e.key === '_') {
          updateConfig({ scale: Math.max(0.001, +(cur - step).toFixed(3)) });
        } else consumed = false;
      }
      if (consumed) e.preventDefault();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [editing, editingIdx, transformMode, setTransformMode, onUpdate]);  // eslint-disable-line react-hooks/exhaustive-deps

  const pos = editing?.splatConfig?.position || [0, 0, 0];
  const rot = editing?.splatConfig?.rotation || [0, 0, 0];
  const scale = editing?.splatConfig?.scale ?? 1;

  return (
    <div style={{
      position: 'absolute', top: 90, right: 20, bottom: 20, zIndex: 200, width: 380,
      display: 'flex', flexDirection: 'column',
      background: 'rgba(15, 23, 42, 0.95)', backdropFilter: 'blur(8px)',
      border: '1px solid rgba(129, 140, 248, 0.4)', borderRadius: 12,
      color: '#e2e8f0', fontFamily: 'system-ui, sans-serif',
      boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
    }}>
      {/* 도구 선택 */}
      <div style={{ display: 'flex', gap: 6, padding: 10 }}>
        {TOOLS.map((t) => (
          <button key={t.key} onClick={() => setAdminTool(t.key)} style={{
            flex: 1, padding: '8px 0', fontSize: 12, fontWeight: 700, cursor: 'pointer',
            borderRadius: 6, border: 'none',
            background: adminTool === t.key ? '#3b82f6' : 'rgba(255,255,255,0.05)',
            color: adminTool === t.key ? 'white' : '#94a3b8',
          }}>{t.label}</button>
        ))}
      </div>

      <div style={{ padding: '4px 16px 12px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#facc15' }}>✨ 스플랫 편집</div>
        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4, lineHeight: 1.5 }}>
          {floorId
            ? <>스플랫을 골라 <b style={{ color: '#facc15' }}>3D gizmo</b>로 드래그하거나 아래 값 직접 입력</>
            : '먼저 왼쪽에서 층을 선택하세요'}
        </div>
        <div style={{ fontSize: 10, color: '#64748b', marginTop: 6, lineHeight: 1.5 }}>
          모드: <b>1</b> 이동 · <b>2</b> 회전 · <b>3</b> 크기<br/>
          미세조정: <b>←↑↓→</b> · <b>PgUp/PgDn</b> = Y축 · <b>Shift</b>×5 · <b>Alt</b>÷5
        </div>
      </div>

      {/* 모드 토글 (선택된 스플랫이 있을 때만 의미 있음) */}
      <div style={{ display: 'flex', gap: 4, padding: '10px 12px 4px' }}>
        {MODES.map((m) => (
          <button key={m.key} onClick={() => setTransformMode(m.key)} disabled={editing == null} style={{
            flex: 1, padding: '7px 0', fontSize: 11, fontWeight: 700,
            cursor: editing == null ? 'not-allowed' : 'pointer',
            opacity: editing == null ? 0.45 : 1,
            borderRadius: 5, border: 'none',
            background: transformMode === m.key ? '#10b981' : 'rgba(255,255,255,0.06)',
            color: transformMode === m.key ? 'white' : '#94a3b8',
          }}>{m.label}</button>
        ))}
      </div>

      {/* 새 스플랫 추가 */}
      {onAdd && floorId && (
        <div style={{ padding: '6px 12px 0' }}>
          <button
            onClick={() => {
              const url = window.prompt(
                '스플랫 URL (예: /assets/ai/splats/man.splat)',
                '/assets/ai/splats/',
              );
              if (url && url.trim()) onAdd(url.trim());
            }}
            style={{
              width: '100%', padding: '8px 0', fontSize: 12, fontWeight: 700,
              cursor: 'pointer', border: '1px dashed rgba(129,140,248,0.55)',
              borderRadius: 6, background: 'rgba(129,140,248,0.08)', color: '#a5b4fc',
            }}
          >
            + 새 스플랫 추가
          </button>
        </div>
      )}

      {/* 현재 층 스플랫 목록 */}
      <div style={{ flex: '1 1 auto', minHeight: 90, overflowY: 'auto', padding: '8px 12px' }}>
        {splats.length === 0 ? (
          <div style={{ color: '#64748b', padding: '12px 0', textAlign: 'center', fontSize: 12 }}>
            이 층에 스플랫 없음 — 위 "+ 새 스플랫 추가"로 등록
          </div>
        ) : splats.map((sp, i) => {
          const name = sp.splatUrl?.split('/').pop() || `splat ${i + 1}`;
          return (
            <div key={i}
              onClick={() => onSelect(i)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
                padding: '8px 10px', marginBottom: 4, borderRadius: 6, fontSize: 12,
                background: i === editingIdx ? 'rgba(250, 204, 21, 0.15)' : 'rgba(255,255,255,0.04)',
                border: '1px solid ' + (i === editingIdx ? 'rgba(250,204,21,0.55)' : 'transparent'),
              }}>
              <span style={{ color: '#64748b', width: 22 }}>#{i + 1}</span>
              <span style={{ flex: 1, fontWeight: 600, fontFamily: 'monospace', fontSize: 11 }}>
                ✨ {name}
              </span>
              {onDelete && (
                <button onClick={(e) => { e.stopPropagation(); onDelete(i); }} style={{
                  background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 14,
                }}>✕</button>
              )}
            </div>
          );
        })}
      </div>

      {/* 선택한 스플랫 숫자 편집 */}
      {editing && (
        <div style={{
          padding: 14, borderTop: '1px solid rgba(255,255,255,0.08)',
          background: 'rgba(2,6,23,0.5)',
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#facc15', marginBottom: 8 }}>
            #{editingIdx + 1} 변환값
          </div>

          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4, marginBottom: 4 }}>위치 (m)</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 8 }}>
            <NumberInput value={pos[0]} onChange={(v) => updateAxis('position', 0, v)} />
            <NumberInput value={pos[1]} onChange={(v) => updateAxis('position', 1, v)} />
            <NumberInput value={pos[2]} onChange={(v) => updateAxis('position', 2, v)} />
          </div>

          <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>회전 (rad)</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 8 }}>
            <NumberInput value={rot[0]} onChange={(v) => updateAxis('rotation', 0, v)} step={0.01} />
            <NumberInput value={rot[1]} onChange={(v) => updateAxis('rotation', 1, v)} step={0.01} />
            <NumberInput value={rot[2]} onChange={(v) => updateAxis('rotation', 2, v)} step={0.01} />
          </div>

          <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>크기</div>
          <NumberInput value={scale} onChange={(v) => updateConfig({ scale: v })} step={0.01} />
        </div>
      )}

      {/* 저장 */}
      <div style={{ padding: 10 }}>
        <button
          onClick={onSave}
          disabled={saveStatus === 'saving'}
          style={{
            width: '100%', padding: '11px 0', fontSize: 13, fontWeight: 700,
            cursor: saveStatus === 'saving' ? 'wait' : 'pointer',
            border: 'none', borderRadius: 6, color: 'white',
            background: saveStatus === 'saved' ? '#10b981'
              : saveStatus === 'error' ? '#ef4444' : '#3b82f6',
          }}
        >
          {SAVE_LABEL[saveStatus] || SAVE_LABEL.idle}
        </button>
        <div style={{ fontSize: 10, color: '#64748b', marginTop: 6, textAlign: 'center' }}>
          저장 시 floors.json 의 splats 만 갱신 · 이전 파일은 _backups/ 에 자동 백업
        </div>
      </div>
    </div>
  );
}
