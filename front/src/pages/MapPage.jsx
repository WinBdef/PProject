import { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

import MapViewer from '../components/map/MapViewer';
import Sidebar from '../components/map/ui/Sidebar';
import MapControls from '../components/map/ui/MapControls';
import TimetableSheet from '../components/map/ui/TimetableSheet';
import OfficeInfoSheet from '../components/map/ui/OfficeInfoSheet';
import ElevatorOverlay from '../components/map/ui/ElevatorOverlay';
import MediaPlayer from '../components/map/ui/MediaPlayer';
import MarkerPanel from '../components/map/ui/MarkerPanel';
import RoutePanel from '../components/map/ui/RoutePanel';
import SplatPanel from '../components/map/ui/SplatPanel';

import { useAdminAuth } from '../hooks/useAdminAuth';
import { useBuildingData } from '../hooks/useBuildingData';
import { useNavigationState } from '../hooks/useNavigationState';
import { apiUrl, mobileModelUrl, mobileSplatUrl } from '../utils/api';
import { unloadFloor, unloadAll, unloadAllExcept } from '../components/map/three/floorCache';

import './MapPage.css';

const MapPage = () => {
  const { buildingId } = useParams();
  const navigate = useNavigate();
  const mapViewerRef = useRef(null);
  const prevModelUrlRef = useRef(null);

  const [selectedMapId, setSelectedMapId] = useState(null);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [selectedDay, setSelectedDay] = useState('월');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showRoutes, setShowRoutes] = useState(false);
  const [adminMode, setAdminMode] = useState(false);
  const [adminTool, setAdminTool] = useState('marker');     // 관리자 도구: marker/route/splat
  const [markersDraft, setMarkersDraft] = useState(null);   // 편집 중인 마커 사본 (층별)
  const [editingMarkerIdx, setEditingMarkerIdx] = useState(null);
  const [saveStatus, setSaveStatus] = useState('idle');     // idle/saving/saved/error
  const [routesDraft, setRoutesDraft] = useState(null);     // 편집 중인 경로 사본 (층별)
  const [editingRouteIdx, setEditingRouteIdx] = useState(null);
  const [splatsDraft, setSplatsDraft] = useState(null);     // 편집 중인 스플랫 사본 (층별)
  const [editingSplatIdx, setEditingSplatIdx] = useState(null);
  const [transformMode, setTransformMode] = useState('translate'); // translate/rotate/scale

  const { isAdmin } = useAdminAuth({ notifyOnExpire: true });
  const { data } = useBuildingData(buildingId);
  const nav = useNavigationState(data, selectedMapId, setSelectedMapId, setIsFullscreen);

  // data 가 로드되면 편집용 마커 사본을 만든다 (이후 모든 마커 편집은 이 사본에서)
  useEffect(() => {
    if (data) {
      setMarkersDraft(data.markers || {});
      setRoutesDraft(data.routes || {});
      setSplatsDraft(data.splats || {});
    }
  }, [data]);

  // 관리자 모드를 끄거나 층을 바꾸면 편집 중이던 마커·경로·스플랫 선택을 해제
  useEffect(() => {
    setEditingMarkerIdx(null);
    setEditingRouteIdx(null);
    setEditingSplatIdx(null);
  }, [adminMode, selectedMapId]);

  // 층을 옮기면 직전 층 GLB 를 메모리에서 내린다(GPU 리소스 해제).
  // 8K 텍스처는 층당 메모리가 커서, 안 하면 몇 층만 둘러봐도 브라우저가 뻗음.
  // "직전 층"(이미 화면에서 내려간 url)에만 적용 → 재로딩 루프 위험 없음.
  useEffect(() => {
    const url = data?.models?.[selectedMapId];
    const prev = prevModelUrlRef.current;
    prevModelUrlRef.current = url;
    if (prev && prev !== url) unloadFloor(prev);
  }, [selectedMapId, data]);

  // 길찾기가 끝나거나(idle/finished) 다른 단계로 들어가면, 지금 보이는 층 외에
  // 남아있는 모든 GLB 를 정리. 자매구역 prefetch·출발층 잔여를 즉시 회수해 VRAM 압박 해소.
  useEffect(() => {
    if (nav.navStep !== 'finished' && nav.navStep !== 'idle') return;
    const currentUrl = data?.models?.[selectedMapId];
    unloadAllExcept(currentUrl);
  }, [nav.navStep, selectedMapId, data]);

  // 모바일 OOM 안전망 — 주기적(30초) + 탭 백그라운드→복귀 시 사용 안 하는 GLB 정리.
  // 기존 nav.navStep / selectedMapId useEffect 로 잡히지 않는 누수(drei <Splat>
  // 내부 캐시, useGLTF.preload 한 prefetch 잔재 등) 마저 청소하는 안전망.
  useEffect(() => {
    const cleanup = () => {
      const url = data?.models?.[selectedMapId];
      if (url) unloadAllExcept(url);
    };
    const interval = setInterval(cleanup, 30000);
    const onVisible = () => { if (!document.hidden) cleanup(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [data, selectedMapId]);

  // MapPage 를 떠날 때(다른 페이지 이동·다른 건물 전환) 등록된 모든 층 정리.
  // 같은 세션에서 여러 건물 둘러본 뒤 GPU 메모리가 누적돼 흰화면이 나는 걸 막는다.
  useEffect(() => () => unloadAll(), []);

  const markersByFloor = markersDraft || data?.markers || {};
  const currentMarkers = markersByFloor[selectedMapId] || [];

  const setFloorMarkers = (arr) =>
    setMarkersDraft({ ...markersByFloor, [selectedMapId]: arr });

  // 모델 위에서 C 키 → 그 자리에 마커 즉시 생성 + 편집 상태로
  const handleAddMarker = (pos) => {
    if (!selectedMapId) return;
    const next = [...currentMarkers, {
      position: [pos[0], 0.6, pos[2]],
      kind: 'room',
      status: 'empty', roomName: '새 강의실', description: '', schedule: [],
    }];
    setFloorMarkers(next);
    setEditingMarkerIdx(next.length - 1);
  };

  const handleUpdateMarker = (idx, patch) =>
    setFloorMarkers(currentMarkers.map((m, i) => (i === idx ? { ...m, ...patch } : m)));

  const handleDeleteMarker = (idx) => {
    setFloorMarkers(currentMarkers.filter((_, i) => i !== idx));
    setEditingMarkerIdx(null);
  };

  // 마커를 3D 에서 드래그할 때 호출 — 새 X·Z 로 위치 갱신 (Y 높이는 유지)
  const handleMarkerMove = (idx, x, z) => {
    const m = currentMarkers[idx];
    if (!m) return;
    const y = m.position?.[1] ?? 0.6;
    handleUpdateMarker(idx, { position: [Number(x.toFixed(2)), y, Number(z.toFixed(2))] });
  };

  // --- 경로(파란선) 편집 ---
  const routesByFloor = routesDraft || data?.routes || {};
  const currentRoutes = routesByFloor[selectedMapId] || [];

  const setFloorRoutes = (arr) =>
    setRoutesDraft({ ...routesByFloor, [selectedMapId]: arr });

  const handleNewRoute = () => {
    if (!selectedMapId) return;
    const next = [...currentRoutes, { name: `새 경로 ${currentRoutes.length + 1}`, path: [] }];
    setFloorRoutes(next);
    setEditingRouteIdx(next.length - 1);
  };

  const handleUpdateRoute = (idx, patch) =>
    setFloorRoutes(currentRoutes.map((r, i) => (i === idx ? { ...r, ...patch } : r)));

  const handleDeleteRoute = (idx) => {
    setFloorRoutes(currentRoutes.filter((_, i) => i !== idx));
    setEditingRouteIdx(null);
  };

  // C 키 → 활성 경로에 점 추가. 활성 경로가 없으면 새 경로를 만들어 거기에 추가.
  const handleAddRoutePoint = (pos) => {
    if (!selectedMapId) return;
    const pt = [Number(pos[0].toFixed(2)), Number(pos[1].toFixed(2)), Number(pos[2].toFixed(2))];
    let routes = currentRoutes;
    let idx = editingRouteIdx;
    if (idx === null || idx === undefined || !routes[idx]) {
      idx = routes.length;
      routes = [...routes, { name: `새 경로 ${idx + 1}`, path: [] }];
    }
    setFloorRoutes(routes.map((r, i) =>
      i === idx ? { ...r, path: [...(r.path || []), pt] } : r,
    ));
    setEditingRouteIdx(idx);
  };

  const handleDeleteLastRoutePoint = () => {
    if (editingRouteIdx === null) return;
    const r = currentRoutes[editingRouteIdx];
    if (!r || !(r.path || []).length) return;
    handleUpdateRoute(editingRouteIdx, { path: r.path.slice(0, -1) });
  };

  const handleSaveRoutes = async () => {
    setSaveStatus('saving');
    try {
      const res = await fetch(apiUrl(`/api/building/${buildingId}/routes`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(routesByFloor),
      });
      if (!res.ok) throw new Error('save failed');
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch {
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  };

  // --- 스플랫(3DGS) 편집 ---
  const splatsByFloor = splatsDraft || data?.splats || {};
  const currentSplats = splatsByFloor[selectedMapId] || [];

  const setFloorSplats = (arr) =>
    setSplatsDraft({ ...splatsByFloor, [selectedMapId]: arr });

  // 3D gizmo 드래그 또는 패널 숫자 입력 → 해당 splat 의 splatConfig 갱신
  const handleSplatUpdate = (idx, next) =>
    setFloorSplats(currentSplats.map((sp, i) => (i === idx ? next : sp)));

  const handleSplatTransform = (idx, t) => {
    const sp = currentSplats[idx];
    if (!sp) return;
    handleSplatUpdate(idx, { ...sp, splatConfig: { ...sp.splatConfig, ...t } });
  };

  const handleSplatDelete = (idx) => {
    setFloorSplats(currentSplats.filter((_, i) => i !== idx));
    setEditingSplatIdx(null);
  };

  const handleSplatAdd = (splatUrl) => {
    if (!selectedMapId) return;
    const next = [...currentSplats, {
      splatUrl,
      splatConfig: { position: [0, 0, 0], rotation: [0, 0, 0], scale: 1 },
    }];
    setFloorSplats(next);
    setEditingSplatIdx(next.length - 1);
  };

  const handleSaveSplats = async () => {
    setSaveStatus('saving');
    try {
      const res = await fetch(apiUrl(`/api/building/${buildingId}/splats`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(splatsByFloor),
      });
      if (!res.ok) throw new Error('save failed');
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch {
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  };

  // C 키 동작은 도구에 따라 다름: 마커=마커 생성, 경로=경로 점 추가.
  // (스플랫 도구는 C 캡처 안 씀 — gizmo / 키보드로 직접 조작)
  const handleAdminCapture = (pos) => {
    if (adminTool === 'marker') handleAddMarker(pos);
    else if (adminTool === 'route') handleAddRoutePoint(pos);
  };

  // 마커 클릭: 관리자 모드면 편집, 아니면 시간표 열기
  const handleMarkerClick = (marker, idx) => {
    if (adminMode) {
      setAdminTool('marker');
      setEditingMarkerIdx(idx);
    } else if (!marker.kind || marker.kind === 'room' || marker.kind === 'office') {
      // 강의실(room/legacy)·교직원실(office) 클릭 시 시트 오픈. 후자는 시간표 없이 설명만.
      // 화장실/비상구/엘리베이터는 시트 자체가 의미 없어 그대로 건너뜀.
      setSelectedRoom(marker);
    }
  };

  const handleSaveMarkers = async () => {
    setSaveStatus('saving');
    try {
      const res = await fetch(apiUrl(`/api/building/${buildingId}/markers`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(markersByFloor),
      });
      if (!res.ok) throw new Error('save failed');
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch {
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  };

  const handleMapSelect = (mapId) => {
    if (!data) return;
    const floor = data.floorRows?.find(f => f.mapId === mapId);
    if (floor?.disabled) {
      alert(`${floor.floor}층은 현재 준비 중입니다.`);
      return;
    }
    setSelectedMapId(mapId);
  };

  // 나침나 클릭: 길찾기 강제 종료 → 다음 프레임에 카메라 리셋 (CameraControls 활성화 대기)
  const handleCompassClick = () => {
    nav.cancel();
    setTimeout(() => {
      const didReset = mapViewerRef.current?.handleCompassAction();
      if (!didReset) setShowRoutes(prev => !prev);
    }, 10);
  };

  // 축소 시에도 같은 패턴: 풀스크린 끄고 길찾기 종료한 뒤 다음 프레임에 탑뷰 복귀
  const handleShrink = () => {
    setIsFullscreen(false);
    setShowRoutes(false);
    nav.cancel();
    setTimeout(() => mapViewerRef.current?.resetToTopView(), 10);
  };

  const handleStartWayfinding = (entrance) => {
    setSelectedRoom(null);
    nav.startWayfinding(entrance, selectedRoom);
  };

  const togglePlayPause = () => {
    if (nav.navStep === 'finished') nav.restart();
    else nav.setIsPlaying(!nav.isPlaying);
  };

  if (!data) return <div className="loading">로딩 중...</div>;

  const hasNav = nav.navStep !== 'idle' && nav.navPlan.startMapId && nav.navPlan.destMapId;

  return (
    <div className="map-page-container">
      <div className="map-header" style={{ pointerEvents: 'none', position: 'relative', zIndex: 100 }}>
        <button className="btn-back" style={{ pointerEvents: 'auto' }} onClick={() => navigate(-1)}>←</button>
        <div className="header-info" style={{ pointerEvents: 'auto' }}>
          <h1>{data.name}</h1>
          <p>{data.info}</p>
        </div>
      </div>

      <Sidebar
        floorRows={data.floorRows || []}
        roofPins={data.roofPins}
        selectedMapId={selectedMapId}
        onMapSelect={handleMapSelect}
        onEntranceJump={(zone) => { setSelectedMapId(zone.mapId); setIsFullscreen(true); }}
      />

      <div className="map-viewport">
        {selectedMapId && data.models?.[selectedMapId] ? (
          <div className={`map-content active ${isFullscreen ? 'fullscreen' : ''}`}>
            {nav.showElevatorUI && (
              <ElevatorOverlay
                navStep={nav.navStep}
                startMapId={nav.navPlan.startMapId}
                destMapId={nav.navPlan.destMapId}
                sectionLabel={
                  nav.navPlan.isElevatorEntry ? null  // PH는 'PH ▼ X층' 층 인디케이터 사용
                  : nav.navPlan.isSection ? `${nav.navPlan.sectionEntryName} 쪽으로 이동`
                  : nav.navPlan.sectionSuffix ? `${nav.navPlan.suffixSisterMapId?.replace('_', '-')} 통해 이동`
                  : null
                }
                fromLabel={nav.navPlan.isElevatorEntry ? 'PH' : null}
              />
            )}

            <MapControls
              hasAdmin={isAdmin}
              adminMode={adminMode}
              setAdminMode={setAdminMode}
              isFullscreen={isFullscreen}
              onToggleFullscreen={() => setIsFullscreen(true)}
              onShrinkFullscreen={handleShrink}
              showRoutes={showRoutes}
              onNavAction={handleCompassClick}
              isWalking={nav.isNavigatingSequence}
            />

            <MapViewer
              ref={mapViewerRef}
              modelUrl={mobileModelUrl(data.models[selectedMapId])}
              routes={currentRoutes}
              markers={currentMarkers}
              splats={currentSplats.map((sp) => ({ ...sp, splatUrl: mobileSplatUrl(sp.splatUrl) }))}
              hideSplats={new URLSearchParams(window.location.search).has('nosplat')}
              splatEditMode={adminMode && adminTool === 'splat'}
              editingSplatIdx={adminMode && adminTool === 'splat' ? editingSplatIdx : null}
              transformMode={transformMode}
              onSplatTransform={handleSplatTransform}
              onSplatSelect={setEditingSplatIdx}
              cameraPosition={data.cameraPosition || [25, 20, 25]}
              fitView={data.fitViews?.[selectedMapId]}
              showRoutes={showRoutes}
              adminMode={adminMode}
              onMarkerClick={handleMarkerClick}
              onAdminCapture={handleAdminCapture}
              editingMarkerIdx={adminMode && adminTool === 'marker' ? editingMarkerIdx : null}
              onMarkerMove={handleMarkerMove}
              markerEditMode={adminMode && adminTool === 'marker'}
              routeEditMode={adminMode && adminTool === 'route'}
              editingRouteIdx={editingRouteIdx}
              onRouteSelect={setEditingRouteIdx}
              navRoute={nav.currentNavRoute}
              initialNavPose={nav.initialNavPose}
              onNavComplete={nav.handleNavComplete}
              isNavigatingSequence={nav.isNavigatingSequence}
              isNavFinished={nav.isNavFinished}
              onLoadComplete={nav.setIsMapLoaded}
              isFullscreen={isFullscreen}
              onNavProgress={nav.setFloorProgress}
              seekState={nav.seekState}
              isPlaying={nav.isPlaying}
              navSpeed={nav.navSpeed}
              onNavSpeedChange={nav.setNavSpeed}
            />
          </div>
        ) : (
          <div className="map-placeholder"><p>층을 선택하세요</p></div>
        )}
      </div>

      {hasNav && (
        <MediaPlayer
          navStep={nav.navStep}
          navPlan={nav.navPlan}
          isPlaying={nav.isPlaying}
          isScrubbing={nav.isScrubbing}
          sliderValue={nav.sliderValue}
          tooltipText={nav.tooltipText}
          p1={nav.p1}
          p2={nav.p2}
          onClose={handleCompassClick}
          onTogglePlay={togglePlayPause}
          onScrubChange={nav.handleScrubChange}
          onScrubStart={() => { nav.setIsPlaying(false); nav.setIsScrubbing(true); }}
          onScrubEnd={nav.handleScrubEnd}
          onJumpToChapter={nav.jumpToChapter}
        />
      )}

      {selectedRoom && (
        selectedRoom.kind === 'office' ? (
          <OfficeInfoSheet
            roomData={selectedRoom}
            onClose={() => setSelectedRoom(null)}
            onWayfindingStart={handleStartWayfinding}
            entranceList={data.entranceList || []}
          />
        ) : (
          <TimetableSheet
            roomData={selectedRoom}
            selectedDay={selectedDay}
            onDaySelect={setSelectedDay}
            onClose={() => setSelectedRoom(null)}
            onWayfindingStart={handleStartWayfinding}
            entranceList={data.entranceList || []}
          />
        )
      )}

      {/* 관리자 도구 패널은 풀스크린(확대) 상태에서만 표시 — 작은 화면에선 캔버스가 좁아 편집이 어려움 */}
      {adminMode && isFullscreen && (adminTool === 'marker' ? (
        <MarkerPanel
          adminTool={adminTool}
          setAdminTool={setAdminTool}
          floorId={selectedMapId}
          markers={currentMarkers}
          editingIdx={editingMarkerIdx}
          onSelect={setEditingMarkerIdx}
          onUpdate={handleUpdateMarker}
          onDelete={handleDeleteMarker}
          onSave={handleSaveMarkers}
          saveStatus={saveStatus}
        />
      ) : adminTool === 'route' ? (
        <RoutePanel
          adminTool={adminTool}
          setAdminTool={setAdminTool}
          floorId={selectedMapId}
          routes={currentRoutes}
          editingIdx={editingRouteIdx}
          onSelect={setEditingRouteIdx}
          onNewRoute={handleNewRoute}
          onUpdate={handleUpdateRoute}
          onDelete={handleDeleteRoute}
          onDeleteLastPoint={handleDeleteLastRoutePoint}
          onSave={handleSaveRoutes}
          saveStatus={saveStatus}
        />
      ) : adminTool === 'splat' ? (
        <SplatPanel
          adminTool={adminTool}
          setAdminTool={setAdminTool}
          floorId={selectedMapId}
          splats={currentSplats}
          editingIdx={editingSplatIdx}
          transformMode={transformMode}
          setTransformMode={setTransformMode}
          onSelect={setEditingSplatIdx}
          onUpdate={handleSplatUpdate}
          onAdd={handleSplatAdd}
          onDelete={handleSplatDelete}
          onSave={handleSaveSplats}
          saveStatus={saveStatus}
        />
      ) : null)}
    </div>
  );
};

export default MapPage;
