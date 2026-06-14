// 관리자 모드 '마커' 도구 패널.
// 모델 위에서 C 키로 마커를 즉시 만들고, 목록이나 3D에서 마커를 골라
// 강의실 정보를 바로 편집·삭제한다. 변경은 부모(MapPage)의 markersDraft 에
// 즉시 반영되고, [저장]을 누르면 백엔드 markers.json 에 기록된다.

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

// 마커 종류 (강의실 / 교직원실 / 화장실 / 비상구 / 엘리베이터 / 구역 진입)
// 교직원실 = 교수실·행정실 같은 강의실 외 사무공간 — 파란 구체로 표시.
// 구역 진입 = sister 전환용 내부 진입점 (관리자 모드에서만 보임) — 회색 구체.
const KINDS = [
  ['room', '강의실'], ['office', '교직원실'],
  ['toilet', '화장실'], ['exit', '비상구'], ['elevator', '엘리베이터'],
  ['section_entry', '구역 진입'],
];

const inputStyle = {
  width: '100%', boxSizing: 'border-box', padding: '7px 9px', marginTop: 3,
  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 5, color: '#e2e8f0', fontSize: 12, fontFamily: 'inherit',
};

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 9 }}>
      <label style={{ fontSize: 11, color: '#94a3b8' }}>{label}</label>
      {children}
    </div>
  );
}

export default function MarkerPanel({
  adminTool, setAdminTool, floorId, markers, editingIdx,
  onSelect, onUpdate, onDelete, onSave, saveStatus,
}) {
  const editing = editingIdx != null ? markers[editingIdx] : null;

  return (
    <div style={{
      position: 'absolute', top: 90, right: 20, bottom: 20, zIndex: 200, width: 380,
      display: 'flex', flexDirection: 'column',
      background: 'rgba(15, 23, 42, 0.95)', backdropFilter: 'blur(8px)',
      border: '1px solid rgba(129, 140, 248, 0.4)', borderRadius: 12,
      color: '#e2e8f0', fontFamily: 'system-ui, sans-serif',
      boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
    }}>
      {/* 도구 선택 (마커 / 경로 / 카메라) */}
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
        <div style={{ fontSize: 14, fontWeight: 700, color: '#facc15' }}>🛠️ 마커 편집</div>
        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4, lineHeight: 1.5 }}>
          {floorId
            ? <>모델 위 <b style={{ color: '#facc15' }}>[ C ]</b> = 생성 · 클릭 = 편집 · <b style={{ color: '#facc15' }}>드래그 = 위치 이동</b></>
            : '먼저 왼쪽에서 층을 선택하세요'}
        </div>
        <div style={{ fontSize: 10, color: '#64748b', marginTop: 6, lineHeight: 1.5 }}>
          🎥 카메라: <b>WASD</b> 이동 · <b>R 홀드 + 마우스 이동</b> 또는 <b>휠버튼 드래그</b> 회전 · <b>휠 스크롤</b> 전후 · <b>Space/Ctrl</b> 상하
        </div>
      </div>

      {/* 현재 층 마커 목록 */}
      <div style={{ flex: '1 1 auto', minHeight: 90, overflowY: 'auto', padding: '8px 12px' }}>
        {markers.length === 0 ? (
          <div style={{ color: '#64748b', padding: '12px 0', textAlign: 'center', fontSize: 12 }}>
            이 층에 마커 없음 — C 키로 추가하세요
          </div>
        ) : markers.map((m, i) => (
          <div key={i}
            onClick={() => onSelect(i)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
              padding: '8px 10px', marginBottom: 4, borderRadius: 6, fontSize: 12,
              background: i === editingIdx ? 'rgba(250, 204, 21, 0.15)' : 'rgba(255,255,255,0.04)',
              border: '1px solid ' + (i === editingIdx ? 'rgba(250,204,21,0.55)' : 'transparent'),
            }}>
            <span style={{ color: '#64748b', width: 22 }}>#{i + 1}</span>
            <span style={{ flex: 1, fontWeight: 600 }}>
              {(m.kind === 'toilet' ? '🚻 '
                : m.kind === 'exit' ? '🚪 '
                : m.kind === 'elevator' ? '↕️ '
                : m.kind === 'office' ? '💼 '
                : '') + (m.roomName || '(이름 없음)')}
            </span>
            <button onClick={(e) => { e.stopPropagation(); onDelete(i); }} style={{
              background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 14,
            }}>✕</button>
          </div>
        ))}
      </div>

      {/* 선택한 마커 편집 폼 */}
      {editing && (
        <div style={{
          padding: 14, borderTop: '1px solid rgba(255,255,255,0.08)',
          background: 'rgba(2,6,23,0.5)',
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#facc15', marginBottom: 8 }}>
            #{editingIdx + 1} 마커 편집
          </div>
          <div style={{ marginBottom: 9 }}>
            <label style={{ fontSize: 11, color: '#94a3b8' }}>종류</label>
            <div style={{ display: 'flex', gap: 4, marginTop: 3 }}>
              {KINDS.map(([k, label]) => (
                <button key={k} onClick={() => {
                  const patch = { kind: k };
                  // 이름이 기본값이면 종류에 맞는 기본 이름으로 자동 설정
                  if (!editing.roomName || editing.roomName === '새 강의실') {
                    patch.roomName = k === 'toilet' ? '화장실'
                      : k === 'exit' ? '비상구'
                      : k === 'elevator' ? '엘리베이터'
                      : k === 'office' ? '교수실'
                      : k === 'section_entry' ? '구역 진입'
                      : '새 강의실';
                  }
                  onUpdate(editingIdx, patch);
                }} style={{
                  flex: 1, padding: '6px 0', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                  borderRadius: 5, border: 'none',
                  background: (editing.kind || 'room') === k ? '#3b82f6' : 'rgba(255,255,255,0.06)',
                  color: (editing.kind || 'room') === k ? 'white' : '#94a3b8',
                }}>{label}</button>
              ))}
            </div>
          </div>
          <Field label="이름">
            <input
              value={editing.roomName || ''}
              onChange={(e) => onUpdate(editingIdx, { roomName: e.target.value })}
              style={inputStyle}
            />
          </Field>
          <Field label="설명 (선택)">
            <textarea
              value={editing.description || ''}
              onChange={(e) => onUpdate(editingIdx, { description: e.target.value })}
              rows={2}
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </Field>
          <div style={{ fontSize: 11, color: '#64748b', fontFamily: 'monospace' }}>
            위치 [{(editing.position || []).map((n) => Number(n).toFixed(2)).join(', ')}]
          </div>
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
          저장 시 markers.json 에 기록 · 이전 파일은 _backups/ 에 자동 백업
        </div>
      </div>
    </div>
  );
}
