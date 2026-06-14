// 관리자 모드 '경로' 도구 패널.
// 경로(파란선)는 점들을 이은 폴리라인이다. 활성 경로를 고른 뒤 모델 위에서
// C 로 점을 이어 찍으면 선이 그려진다. 변경은 부모(MapPage)의 routesDraft 에
// 즉시 반영되고, [저장]을 누르면 백엔드 routes.json 에 기록된다.

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

const inputStyle = {
  width: '100%', boxSizing: 'border-box', padding: '7px 9px', marginTop: 3,
  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 5, color: '#e2e8f0', fontSize: 12, fontFamily: 'inherit',
};

export default function RoutePanel({
  adminTool, setAdminTool, floorId, routes, editingIdx,
  onSelect, onNewRoute, onUpdate, onDelete, onDeleteLastPoint, onSave, saveStatus,
}) {
  const editing = editingIdx != null ? routes[editingIdx] : null;

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
        <div style={{ fontSize: 14, fontWeight: 700, color: '#facc15' }}>🛣️ 경로 편집</div>
        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4, lineHeight: 1.5 }}>
          {floorId
            ? <>활성 경로에 <b style={{ color: '#facc15' }}>[ C ]</b> = 점 이어 찍기 · 경로 클릭 = 선택</>
            : '먼저 왼쪽에서 층을 선택하세요'}
        </div>
        <div style={{ fontSize: 10, color: '#64748b', marginTop: 6, lineHeight: 1.5 }}>
          🎥 카메라: <b>WASD</b> 이동 · <b>휠버튼 드래그</b> 회전 · <b>휠 스크롤</b> 전후 · <b>Space/Ctrl</b> 상하
        </div>
      </div>

      <div style={{ padding: '8px 12px 0' }}>
        <button onClick={onNewRoute} disabled={!floorId} style={{
          width: '100%', padding: '8px 0', fontSize: 12, fontWeight: 700,
          cursor: floorId ? 'pointer' : 'not-allowed', borderRadius: 6, border: 'none',
          background: floorId ? 'rgba(59,130,246,0.25)' : 'rgba(255,255,255,0.05)',
          color: floorId ? '#bfdbfe' : '#64748b',
        }}>+ 새 경로</button>
      </div>

      {/* 경로 목록 */}
      <div style={{ flex: '1 1 auto', minHeight: 80, overflowY: 'auto', padding: '8px 12px' }}>
        {routes.length === 0 ? (
          <div style={{ color: '#64748b', padding: '12px 0', textAlign: 'center', fontSize: 12 }}>
            경로 없음 — '새 경로'로 시작하세요
          </div>
        ) : routes.map((r, i) => (
          <div key={i}
            onClick={() => onSelect(i)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
              padding: '8px 10px', marginBottom: 4, borderRadius: 6, fontSize: 12,
              background: i === editingIdx ? 'rgba(250, 204, 21, 0.15)' : 'rgba(255,255,255,0.04)',
              border: '1px solid ' + (i === editingIdx ? 'rgba(250,204,21,0.55)' : 'transparent'),
            }}>
            <span style={{ color: '#64748b', width: 22 }}>#{i + 1}</span>
            <span style={{ flex: 1, fontWeight: 600 }}>{r.name || '(이름 없음)'}</span>
            <span style={{ color: '#64748b' }}>{(r.path || []).length}점</span>
            <button onClick={(e) => { e.stopPropagation(); onDelete(i); }} style={{
              background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 14,
            }}>✕</button>
          </div>
        ))}
      </div>

      {/* 선택한 경로 편집 */}
      {editing && (
        <div style={{
          padding: 14, borderTop: '1px solid rgba(255,255,255,0.08)',
          background: 'rgba(2,6,23,0.5)',
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#facc15', marginBottom: 8 }}>
            #{editingIdx + 1} 경로 편집 · 점 {(editing.path || []).length}개
          </div>
          <div style={{ marginBottom: 9 }}>
            <label style={{ fontSize: 11, color: '#94a3b8' }}>경로 이름</label>
            <input
              value={editing.name || ''}
              onChange={(e) => onUpdate(editingIdx, { name: e.target.value })}
              style={inputStyle}
            />
          </div>
          <button
            onClick={onDeleteLastPoint}
            disabled={!(editing.path || []).length}
            style={{
              width: '100%', padding: '8px 0', fontSize: 12, fontWeight: 700,
              borderRadius: 6, border: '1px solid rgba(239,68,68,0.4)',
              background: 'rgba(239,68,68,0.12)', color: '#fca5a5',
              cursor: (editing.path || []).length ? 'pointer' : 'not-allowed',
            }}
          >↩ 마지막 점 삭제</button>
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
          저장 시 routes.json 에 기록 · 이전 파일은 _backups/ 에 자동 백업
        </div>
      </div>
    </div>
  );
}
