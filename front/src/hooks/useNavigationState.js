import { useState, useEffect, useCallback, useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import { calculateRouteDistance, routeToNavPath } from '../utils/mapHelpers';
import { buildRouteGraph, findRoutePath } from '../utils/pathfinding';
import { mobileModelUrl } from '../utils/api';

// 길찾기 + 미디어 플레이어 상태를 한 군데서 관리.
// navStep 상태머신:
//   idle → preparing → moving_to_elevator → elevator_ride → moving_to_bridge?
//        → bridge_cross? → moving_to_dest → finished
// - 일반 층간 이동: preparing → moving_to_elevator → elevator_ride → moving_to_dest
// - sectionSuffix(예: 2F_A → 3F_B): 도착층 엘베가 안 닿으면 도착층 sister(3F_A) 거쳐 구름다리로 이동.
//   preparing → moving_to_elevator → elevator_ride(→sister) → moving_to_bridge(→구름다리)
//        → bridge_cross(→dest) → moving_to_dest
// - 카메라는 구름다리(bridge_cross) 외 모든 구간 routes 그래프 따라 연속 (스킵 금지).
const INITIAL_NAV_PLAN = {
  startMapId: null, startPos: null,
  destMapId: null, destPos: null,
  // 같은 층 다른 구역(2F_A↔2F_B) 전환 여부 + 도착 구역 진입 입구 정보
  isSection: false, sectionEntryPos: null, sectionEntryName: '',
  // PH(옥상 엘베) 출발 여부 — 오버레이를 'PH ▼ X층' 인디케이터로 표시
  isElevatorEntry: false,
  // 도착층 sister 거쳐 구름다리로 가기 (예: 2F-A 엘베→3F-A→구름다리→3F-B)
  // suffixSisterMapId: 도착층 sister (= 엘베 매칭되는 곳, 예: 3F-A)
  // suffixSisterBridgePos: 도착층 sister 의 구름다리 입구
  // suffixDestBridgePos: 도착층 의 구름다리 출구
  sectionSuffix: false, sectionSuffixLabel: '',
  suffixSisterMapId: null, suffixSisterBridgePos: null, suffixDestBridgePos: null,
};

const DEFAULT_PHASE_RATIOS = { start: 0.45, elev: 0.10, dest: 0.45 };

// 한 층에서 refPos 에 가장 가까운 엘리베이터 마커 위치를 찾는다.
function nearestElevator(data, mapId, refPos) {
  if (!refPos) return null;
  let best = null;
  let bd = Infinity;
  for (const m of data?.markers?.[mapId] || []) {
    if (m.kind !== 'elevator' || !m.position) continue;
    const dx = m.position[0] - refPos[0];
    const dz = m.position[2] - refPos[2];
    const d = dx * dx + dz * dz;
    if (d < bd) { bd = d; best = m.position; }
  }
  return best;
}

// 층간 이동 시 두 층에 모두 있는 같은 엘베(elevatorId 매칭) 선택.
// 출발점에서 가까운 후보 엘베의 ID 를 골라, 도착층에서도 같은 ID 마커를 씀
// (멀티-도어 엘베면 도착점에 가까운 문). 라벨 매칭이 없으면 nearestElevator 로 fallback.
function elevatorEnds(data, startMapId, destMapId, startPos, destPos) {
  if (!startPos || !destPos) return { startElev: null, destElev: null };
  const startEls = (data?.markers?.[startMapId] || []).filter(
    (m) => m.kind === 'elevator' && m.elevatorId && m.position,
  );
  const destEls = (data?.markers?.[destMapId] || []).filter(
    (m) => m.kind === 'elevator' && m.elevatorId && m.position,
  );
  const destIds = new Set(destEls.map((m) => m.elevatorId));
  const candidates = startEls.filter((m) => destIds.has(m.elevatorId));
  if (candidates.length === 0) {
    // 라벨 매칭 실패 → 각 층 독립적으로 가장 가까운 엘베 (다른 층 라벨 안 된 경우 fallback)
    return {
      startElev: nearestElevator(data, startMapId, startPos),
      destElev: nearestElevator(data, destMapId, destPos),
    };
  }
  // 경로망 위 실제 도보 길이로 후보를 평가 — 직선이 가까워도 경로가 없으면 큰
  // 우회가 됨. 사용자가 엘베 옆에 짧은 경로를 그려두면 자연스럽게 그 엘베가 선택됨.
  const pathLen = (graph, a, b) => {
    const p = findRoutePath(graph, a, b);
    if (!p) return Infinity;
    let l = 0;
    for (let i = 0; i < p.length - 1; i++) {
      l += Math.hypot(p[i][0] - p[i + 1][0], p[i][2] - p[i + 1][2]);
    }
    return l;
  };
  const startGraph = buildRouteGraph(data?.routes?.[startMapId] || []);
  let bestStart = null;
  let bd = Infinity;
  for (const m of candidates) {
    const d = pathLen(startGraph, startPos, m.position);
    if (d < bd) { bd = d; bestStart = m; }
  }
  if (!bestStart) bestStart = candidates[0];
  // 도착층에서 같은 ID 마커 중 경로망에 가장 가까운 것 — 엘베 옆에 짧은 경로를
  // 그려두면 그 마커로 자연스럽게 진입(예: 4F/5F/7F 3번 엘베 ↔ 새 경로 10).
  const destGraph = buildRouteGraph(data?.routes?.[destMapId] || []);
  let bestDest = null;
  let dd = Infinity;
  for (const m of destEls) {
    if (m.elevatorId !== bestStart.elevatorId) continue;
    let routeNodeDist = Infinity;
    for (const n of destGraph.nodes) {
      const d = Math.hypot(n[0] - m.position[0], n[2] - m.position[2]);
      if (d < routeNodeDist) routeNodeDist = d;
    }
    if (routeNodeDist < dd) { dd = routeNodeDist; bestDest = m; }
  }
  return {
    startElev: bestStart.position,
    destElev: bestDest ? bestDest.position : null,
  };
}

// 한 구역(mapId) 의 구름다리 입출구 좌표 — section_entry 마커 우선, entranceList hidden 폴백.
// 3F_A 의 구름다리 입구 / 3F_B 의 구름다리 출구 같이 sister 사이 점프 지점을 찾는데 쓰인다.
function findBridgePoint(data, mapId) {
  const m = (data?.markers?.[mapId] || []).find((mk) => mk.kind === 'section_entry');
  if (m?.position) return m.position;
  const ents = data?.entranceList || [];
  const e = ents.find((en) => en.mapId === mapId && (en.name || '').includes('중앙통로'));
  return e ? e.position : null;
}

// 출발 구역의 자매 구역 진입점 찾기.
// 1차: sister 구역의 kind=section_entry 마커 (사용자가 관리자 모드에서 찍은 좌표)
// 2차: 기존 entranceList 의 sister 구역 "중앙통로" 입구 (폴백)
function findSisterEntrance(data, startMapId) {
  const parts = startMapId.split('_');
  if (parts.length !== 2 || (parts[1] !== 'A' && parts[1] !== 'B')) return null;
  const sisterMapId = `${parts[0]}_${parts[1] === 'A' ? 'B' : 'A'}`;
  const sisterMarker = (data?.markers?.[sisterMapId] || []).find((m) => m.kind === 'section_entry');
  if (sisterMarker?.position) {
    return {
      mapId: sisterMapId,
      position: sisterMarker.position,
      name: sisterMarker.roomName || '구역 진입',
    };
  }
  const ents = data?.entranceList || [];
  return ents.find((e) => e.mapId === sisterMapId && (e.name || '').includes('중앙통로'))
    || ents.find((e) => e.mapId === sisterMapId)
    || null;
}

// 두 층 사이에 elevatorId 가 매칭되는 엘베가 있는지 (같은 ID 의 엘베가 양쪽 다 있는지).
function hasMatchingElevator(data, mapIdA, mapIdB) {
  const idsA = new Set(
    (data?.markers?.[mapIdA] || [])
      .filter((m) => m.kind === 'elevator' && m.elevatorId)
      .map((m) => m.elevatorId),
  );
  if (idsA.size === 0) return false;
  return (data?.markers?.[mapIdB] || []).some(
    (m) => m.kind === 'elevator' && m.elevatorId && idsA.has(m.elevatorId),
  );
}

// 한 층의 경로망 그래프에서 fromPos→toPos 최단경로를 길찾기 카메라 패스로 변환.
function segmentNavPath(data, mapId, fromPos, toPos) {
  if (!fromPos || !toPos) return null;
  const graph = buildRouteGraph(data?.routes?.[mapId] || []);
  const path = findRoutePath(graph, fromPos, toPos);
  if (!path || path.length < 2) return null;
  const nav = routeToNavPath(path);
  // 경로는 복도에서 끝남 — 마지막엔 그 자리에 선 채로 목적지(마커) 쪽으로
  // 고개만 돌린다. NavAnimator 가 직전 시점에서 부드럽게 회전 보간.
  const last = nav[nav.length - 1];
  last.lookAt = [toPos[0], last.pos[1], toPos[2]];
  return nav;
}

export const useNavigationState = (data, selectedMapId, setSelectedMapId, setIsFullscreen) => {
  const [navStep, setNavStep] = useState('idle');
  const [navPlan, setNavPlan] = useState(INITIAL_NAV_PLAN);
  const [showElevatorUI, setShowElevatorUI] = useState(false);
  const [isMapLoaded, setIsMapLoaded] = useState(false);

  const [floorProgress, setFloorProgress] = useState(0);
  const [phaseRatios, setPhaseRatios] = useState(DEFAULT_PHASE_RATIOS);

  const [isPlaying, setIsPlaying] = useState(true);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubValue, setScrubValue] = useState(null);
  const [seekState, setSeekState] = useState(null);
  // 1인칭 카메라 배속 (0.5x ~ 2x). MediaPlayer 의 속도 토글로 변경.
  const [navSpeed, setNavSpeed] = useState(1);

  // 출발/도착 거리에 비례해 챕터 비율 자동 계산
  useEffect(() => {
    if (!navPlan.startMapId || !navPlan.destMapId || !data) return;
    const sameFloor = navPlan.startMapId === navPlan.destMapId;
    let d1 = 0;
    let d2 = 10;
    if (sameFloor) {
      d2 = calculateRouteDistance(
        segmentNavPath(data, navPlan.destMapId, navPlan.startPos, navPlan.destPos),
      ) || 10;
    } else if (navPlan.isSection) {
      d2 = calculateRouteDistance(
        segmentNavPath(data, navPlan.destMapId, navPlan.sectionEntryPos, navPlan.destPos),
      ) || 10;
    } else {
      const elevDestMap = navPlan.sectionSuffix ? navPlan.suffixSisterMapId : navPlan.destMapId;
      const elevDestPos = navPlan.sectionSuffix ? navPlan.suffixSisterBridgePos : navPlan.destPos;
      const elev = elevatorEnds(data, navPlan.startMapId, elevDestMap, navPlan.startPos, elevDestPos);
      d1 = calculateRouteDistance(
        segmentNavPath(data, navPlan.startMapId, navPlan.startPos, elev.startElev),
      ) || 10;
      if (navPlan.sectionSuffix) {
        // sectionSuffix: 도착층 sister 의 엘베→구름다리 + dest 의 구름다리→호실
        const bridgeDist = calculateRouteDistance(
          segmentNavPath(data, navPlan.suffixSisterMapId, elev.destElev, navPlan.suffixSisterBridgePos),
        ) || 5;
        d1 += bridgeDist;  // moving_to_elevator + moving_to_bridge 를 start 챕터로 합산
        d2 = calculateRouteDistance(
          segmentNavPath(data, navPlan.destMapId, navPlan.suffixDestBridgePos, navPlan.destPos),
        ) || 10;
      } else {
        d2 = calculateRouteDistance(
          segmentNavPath(data, navPlan.destMapId, elev.destElev, navPlan.destPos),
        ) || 10;
      }
    }
    const elev = sameFloor ? 0 : Math.max(5, (d1 + d2) * 0.1);
    const total = d1 + elev + d2 || 1;
    setPhaseRatios({ start: d1 / total, elev: elev / total, dest: d2 / total });
  }, [navPlan, data]);

  // 출발 층 로딩 완료 대기 — isMapLoaded 가 될 때까지 'preparing' 에서 머뭄.
  // 로딩 완료 후 2초 컴파일 마진 → moving_to_elevator. 초반 렉 방지.
  // 그 시점에 검은 오버레이를 끄면 NavAnimator 가 동시에 카메라 잡아서 자연스러움.
  useEffect(() => {
    if (navStep !== 'preparing' || !isMapLoaded) return;
    if (!isPlaying || isScrubbing) return;
    const t = setTimeout(() => {
      setShowElevatorUI(false);
      setNavStep('moving_to_elevator');
    }, 2000);
    return () => clearTimeout(t);
  }, [navStep, isMapLoaded, isPlaying, isScrubbing]);

  // elevator_ride 가 끝나면 다음 단계 진입. 도착 화면이 어디인지에 따라 분기.
  // sectionSuffix 인 경우 elevator_ride 가 두 번 호출됨: 1) start→suffixSister, 2) suffixSister→dest(구름다리)
  useEffect(() => {
    if (navStep !== 'elevator_ride') return;
    const arrivedAtSister = navPlan.sectionSuffix && selectedMapId === navPlan.suffixSisterMapId;
    const arrivedAtDest = selectedMapId === navPlan.destMapId;
    if (!arrivedAtSister && !arrivedAtDest) return;
    // 구역 전환(isSection)은 도착 맵이 이미 로딩돼 있어 isMapLoaded 안 기다림. 그 외는 로딩 대기.
    if (!isMapLoaded && !navPlan.isSection) return;
    if (!isPlaying || isScrubbing) return;
    const timer = setTimeout(() => {
      setShowElevatorUI(false);
      setFloorProgress(0);
      // sister 도착이면 → moving_to_bridge (sister 의 엘베 → 구름다리 입구)
      // dest 도착이면 → moving_to_dest (dest 의 구름다리 출구 or sectionEntry → 호실)
      setNavStep(arrivedAtSister ? 'moving_to_bridge' : 'moving_to_dest');
    }, navPlan.isElevatorEntry ? 2000 : 1500);  // PH 출발은 'PH ▼ X층' 인디케이터를 ~2초
    return () => clearTimeout(timer);
  }, [isMapLoaded, navStep, selectedMapId, navPlan, isPlaying, isScrubbing]);

  // bridge_cross: 구름다리 점프 — 짧은 cinematic 후 dest 화면으로
  useEffect(() => {
    if (navStep !== 'bridge_cross') return;
    if (selectedMapId !== navPlan.destMapId) return;
    if (!isMapLoaded) return;
    if (!isPlaying || isScrubbing) return;
    const timer = setTimeout(() => {
      setShowElevatorUI(false);
      setFloorProgress(0);
      setNavStep('moving_to_dest');
    }, 800);
    return () => clearTimeout(timer);
  }, [isMapLoaded, navStep, selectedMapId, navPlan, isPlaying, isScrubbing]);

  const startWayfinding = useCallback((entrance, selectedRoom) => {
    if (!data || !selectedRoom) return;
    const destMapId = selectedMapId;

    const startMapId = entrance.mapId;
    const startPos = entrance.position;

    // 엘리베이터 출발지(PH): 옥상엔 엘베뿐 — 출발층 walk 없이 '엘리베이터 이동중'(elevator_ride)
    // 시네마틱 후, 목적지 층의 '같은 엘베(elevatorId 일치)'에서 내려 호실까지 걷는다.
    // → 구역전환(isSection) 흐름 재사용: 엘베이동 → 도착walk 2단계.
    const isElevatorEntry = entrance.elevatorId != null;
    let elevEntryPos = null;
    if (isElevatorEntry) {
      const destElevs = (data.markers?.[destMapId] || []).filter((m) => m.kind === 'elevator');
      // elevatorId 타입 혼용(마커=문자열 '1', entrance=숫자 1) 대비 String 비교
      const destElev = destElevs.find((m) => String(m.elevatorId) === String(entrance.elevatorId)) || destElevs[0];
      elevEntryPos = destElev?.position || null;
    }

    const sameFloor = !isElevatorEntry && startMapId === destMapId;
    // 구역 전환(isSection) = 같은 층의 A/B 자매 구역(2F_A↔2F_B) 또는 PH(엘베) 출발.
    // ★비전 mapId 는 'V_1F' 형태라 split('_')[0]='V' 로 모든 층이 같게 잡혀 오판됐음
    //   → 끝 구역 접미사가 _A/_B 인 경우(같은 floorBase)만 section 으로 판별.
    const zoneSuffix = (id) => id.slice(id.lastIndexOf('_') + 1);
    const floorBase = (id) => id.slice(0, id.lastIndexOf('_'));
    const isSection = isElevatorEntry
      || (!sameFloor && floorBase(startMapId) === floorBase(destMapId)
          && ['A', 'B'].includes(zoneSuffix(startMapId))
          && ['A', 'B'].includes(zoneSuffix(destMapId)));

    // 도착 진입 좌표 — PH=목적지층 엘베, 구역전환=section_entry 우선(entranceList 폴백)
    let sectionEntryPos = null;
    let sectionEntryName = '';
    if (isElevatorEntry) {
      sectionEntryPos = elevEntryPos || startPos;
      sectionEntryName = '엘리베이터';
    } else if (isSection) {
      const destSectionMarker = (data.markers?.[destMapId] || []).find((m) => m.kind === 'section_entry');
      if (destSectionMarker?.position) {
        sectionEntryPos = destSectionMarker.position;
        sectionEntryName = destSectionMarker.roomName || '도착 구역';
      } else {
        const ents = data.entranceList || [];
        const conn = ents.find((e) => e.mapId === destMapId && (e.name || '').includes('중앙통로'))
          || ents.find((e) => e.mapId === destMapId);
        sectionEntryPos = conn?.position || null;
        sectionEntryName = conn?.name || '도착 구역';
      }
    }

    // sectionSuffix: 도착층 엘베가 출발층과 매칭 안 되면 도착층 sister 거쳐서 구름다리로 이동
    // 예: 2F_A 엘베(id=1,2) → 3F_A(id=1,2) → 구름다리 → 3F_B(id=3, 매칭 X)
    let sectionSuffix = false;
    let sectionSuffixLabel = '';
    let suffixSisterMapId = null;
    let suffixSisterBridgePos = null;
    let suffixDestBridgePos = null;
    if (!sameFloor && !isSection && !hasMatchingElevator(data, startMapId, destMapId)) {
      const destSister = findSisterEntrance(data, destMapId);
      if (destSister && hasMatchingElevator(data, startMapId, destSister.mapId)) {
        sectionSuffix = true;
        sectionSuffixLabel = destSister.name;
        suffixSisterMapId = destSister.mapId;
        suffixSisterBridgePos = findBridgePoint(data, suffixSisterMapId); // 도착 sister 의 구름다리 입구
        suffixDestBridgePos = findBridgePoint(data, destMapId);            // 도착층 의 구름다리 출구
      }
    }

    setNavPlan({
      startMapId, startPos,
      destMapId, destPos: selectedRoom.position,
      isSection, isElevatorEntry, sectionEntryPos, sectionEntryName,
      sectionSuffix, sectionSuffixLabel,
      suffixSisterMapId, suffixSisterBridgePos, suffixDestBridgePos,
    });

    // 미리 로딩 — 출발층·도착층·sister 모두 백그라운드로 불러옴.
    // 모바일은 _m.glb (mesh 50%/texture 512 다운샘플) 자동 사용 — MapPage 와 일관.
    const preloadFloor = (mid) => {
      const url = mobileModelUrl(data?.models?.[mid]);
      if (url) useGLTF.preload(url);
    };
    preloadFloor(startMapId);
    preloadFloor(destMapId);
    if (suffixSisterMapId) preloadFloor(suffixSisterMapId);

    setIsFullscreen(true);
    setIsMapLoaded(false);
    setFloorProgress(0);
    setIsPlaying(true);

    if (isSection) {
      // 같은 층 다른 구역 — 즉시 도착 구역으로 전환 후 도착 구역 routes 따라 호실까지
      setSelectedMapId(destMapId);
      setIsMapLoaded(true);
      setShowElevatorUI(true);
      setTimeout(() => setNavStep('elevator_ride'), 500);
    } else if (sameFloor) {
      setSelectedMapId(startMapId);
      setIsMapLoaded(true);
      setShowElevatorUI(true);  // 같은 층도 짧게 검은 오버레이 → moving_to_dest 진입 시 NavAnimator 가 카메라 잡음
      setTimeout(() => {
        setShowElevatorUI(false);
        setNavStep('moving_to_dest');
      }, 500);
    } else {
      // 다른 층 — 일반 흐름이든 sectionSuffix든 출발층 routes → 엘베부터 시작
      // 길찾기 누르자마자 검은 오버레이 띄워서 의미 없는 맵 잠깐 보이는 것 방지
      setSelectedMapId(startMapId);
      setShowElevatorUI(true);
      setNavStep('preparing');
    }
  }, [data, selectedMapId, setSelectedMapId, setIsFullscreen]);

  const handleNavComplete = useCallback(() => {
    if (navStep === 'moving_to_elevator') {
      // 출발층 엘베 도달 → 엘베 cinematic + 도착 화면 전환
      // sectionSuffix 면 도착층 sister(예: 3F_A)로, 아니면 dest로
      // isMapLoaded=true 로 즉시 설정 — preload 된 GLB 가 Suspense 안 거치면 LoadingReporter 가 발화 안 함
      setNavStep('elevator_ride');
      setShowElevatorUI(true);
      setIsMapLoaded(true);
      setSelectedMapId(navPlan.sectionSuffix ? navPlan.suffixSisterMapId : navPlan.destMapId);
    } else if (navStep === 'moving_to_bridge') {
      // sister 의 구름다리 입구 도달 → 구름다리 점프 cinematic + dest 화면으로
      setNavStep('bridge_cross');
      setShowElevatorUI(true);
      setIsMapLoaded(true);
      setSelectedMapId(navPlan.destMapId);
    } else if (navStep === 'moving_to_dest') {
      setNavStep('finished');
      setIsPlaying(false);
    }
  }, [navStep, navPlan, setSelectedMapId]);

  // 강제 종료(나침반 클릭, 닫기 버튼)
  const cancel = useCallback(() => {
    setNavStep('idle');
    setIsPlaying(false);
  }, []);

  // finished 상태에서 처음부터 다시 재생. 현재 navPlan 을 재사용해 startWayfinding 의 핵심 로직만 반복.
  const restart = useCallback(() => {
    if (!navPlan.startMapId || !navPlan.destMapId) return;
    setIsMapLoaded(false);
    setFloorProgress(0);
    setIsPlaying(true);
    if (navPlan.isSection) {
      setSelectedMapId(navPlan.destMapId);
      setIsMapLoaded(true);
      setShowElevatorUI(true);
      setTimeout(() => setNavStep('elevator_ride'), 500);
    } else if (navPlan.startMapId === navPlan.destMapId) {
      setSelectedMapId(navPlan.startMapId);
      setIsMapLoaded(true);
      setTimeout(() => setNavStep('moving_to_dest'), 500);
    } else {
      setSelectedMapId(navPlan.startMapId);
      setNavStep('preparing');
    }
  }, [navPlan, setSelectedMapId]);

  // 현재 슬라이더 값 + 툴팁 텍스트 계산
  const p1 = phaseRatios.start * 100;
  const p2 = phaseRatios.elev * 100;
  const p3 = phaseRatios.dest * 100;

  let sliderValue = 0;
  if (isScrubbing && scrubValue !== null) sliderValue = scrubValue;
  else if (navStep === 'moving_to_elevator') {
    // sectionSuffix 면 moving_to_elevator + moving_to_bridge 가 start 챕터 공유 → 절반
    const ratio = navPlan.sectionSuffix ? 0.5 : 1;
    sliderValue = floorProgress * p1 * ratio;
  }
  else if (navStep === 'moving_to_bridge') {
    // start 챕터의 후반 절반 (sectionSuffix 한정)
    sliderValue = (p1 * 0.5) + (floorProgress * p1 * 0.5);
  }
  else if (navStep === 'elevator_ride' || navStep === 'bridge_cross') {
    sliderValue = p1 + (floorProgress * p2);
  }
  else if (navStep === 'moving_to_dest') sliderValue = p1 + p2 + (floorProgress * p3);
  else if (navStep === 'finished') sliderValue = 100;

  const tooltipText =
    sliderValue < p1 ? '출발 구역 이동 중'
    : sliderValue < p1 + p2 ? '엘리베이터 대기 중'
    : '도착 구역 이동 중';

  // 스크러빙: 슬라이더 값으로 현재 단계 점프.
  // 드래그 중에는 같은 navStep 안이면 즉시 카메라 반영 (유튜브 스타일 실시간 스크럽).
  // 다른 단계로 넘어가는 점프는 layer 변경/GLB 재로드가 필요해 부담 크므로
  // onScrubEnd 시점에 한 번만 처리.
  const handleScrubChange = (val) => {
    setScrubValue(val);
    setIsPlaying(false);

    const v = val / 100;
    const rStart = phaseRatios.start;
    const rElev = phaseRatios.elev;
    const rDest = phaseRatios.dest;

    if (v < rStart && navStep === 'moving_to_elevator') {
      // 출발 층 — 카메라 즉시 점프
      setSeekState({ progress: v / rStart, ts: Date.now() });
    } else if (v >= rStart && v < rStart + rElev && navStep === 'elevator_ride') {
      // 엘베 단계 — 카메라는 멈춰있고 floor progress 만 흐름
      setFloorProgress((v - rStart) / rElev);
    } else if (v >= rStart + rElev && navStep === 'moving_to_dest') {
      // 도착 층 — 카메라 즉시 점프
      setSeekState({ progress: (v - rStart - rElev) / rDest, ts: Date.now() });
    }
    // 단계가 다르면 슬라이더만 움직이고 카메라/floor 는 그대로 — onScrubEnd 에서 점프.
  };

  const handleScrubEnd = () => {
    if (scrubValue !== null) {
      const v = scrubValue / 100;
      const rStart = phaseRatios.start;
      const rElev = phaseRatios.elev;
      if (v < rStart) {
        if (selectedMapId !== navPlan.startMapId) {
          setSelectedMapId(navPlan.startMapId);
          setIsMapLoaded(false);
        }
        setNavStep('moving_to_elevator');
        setShowElevatorUI(false);
        setSeekState({ progress: v / rStart, ts: Date.now() });
      } else if (v < rStart + rElev) {
        setNavStep('elevator_ride');
        setShowElevatorUI(true);
        setFloorProgress((v - rStart) / rElev);
      } else {
        if (selectedMapId !== navPlan.destMapId) {
          setSelectedMapId(navPlan.destMapId);
          setIsMapLoaded(false);
        }
        setNavStep('moving_to_dest');
        setShowElevatorUI(false);
        setSeekState({ progress: (v - rStart - rElev) / phaseRatios.dest, ts: Date.now() });
      }
    }
    setIsScrubbing(false);
    setScrubValue(null);
  };

  const jumpToChapter = (step) => {
    setIsPlaying(false);
    if (navPlan.isSection) {
      // 구역 전환은 '전환'과 '도착' 두 구간뿐
      if (step === 'dest') {
        setSelectedMapId(navPlan.destMapId);
        setNavStep('moving_to_dest');
        setShowElevatorUI(false);
        setSeekState({ progress: 1, ts: Date.now() });
      } else {
        setSelectedMapId(navPlan.destMapId);
        setNavStep('elevator_ride');
        setShowElevatorUI(true);
      }
      return;
    }
    if (step === 'start') {
      setSelectedMapId(navPlan.startMapId);
      setNavStep('moving_to_elevator');
      setShowElevatorUI(false);
      setSeekState({ progress: 0, ts: Date.now() });
    } else if (step === 'elevator') {
      setSelectedMapId(navPlan.startMapId);
      setNavStep('moving_to_elevator');
      setShowElevatorUI(false);
      setSeekState({ progress: 1, ts: Date.now() });
    } else if (step === 'dest') {
      setSelectedMapId(navPlan.destMapId);
      setNavStep('moving_to_dest');
      setShowElevatorUI(false);
      setSeekState({ progress: 1, ts: Date.now() });
    }
  };

  // 현재 진행 중인 카메라 경로 — 경로망 그래프에서 최단경로를 산출.
  // (useMemo: 매 프레임 재계산·새 참조 생성을 막아 NavAnimator 가 흔들리지 않게)
  const { currentNavRoute, initialNavPose } = useMemo(() => {
    const sameFloor = navPlan.startMapId === navPlan.destMapId;
    let route = null;
    // 다층 이동: sectionSuffix 면 도착층 sister 까지 엘베 매칭, 아니면 dest 까지 직접 매칭
    const elevDestMap = navPlan.sectionSuffix ? navPlan.suffixSisterMapId : navPlan.destMapId;
    const elevDestPos = navPlan.sectionSuffix ? navPlan.suffixSisterBridgePos : navPlan.destPos;
    const elev = (sameFloor || navPlan.isSection) ? null
      : elevatorEnds(data, navPlan.startMapId, elevDestMap, navPlan.startPos, elevDestPos);

    if (navStep === 'moving_to_elevator' && !sameFloor && !navPlan.isSection) {
      // 출발 층: 입구 → 공통 엘베(출발층 마커)
      route = segmentNavPath(data, navPlan.startMapId, navPlan.startPos, elev?.startElev);
    } else if (navStep === 'moving_to_bridge') {
      // 도착층 sister 의 엘베 → 구름다리 입구
      route = segmentNavPath(data, navPlan.suffixSisterMapId, elev?.destElev, navPlan.suffixSisterBridgePos);
    } else if (navStep === 'moving_to_dest') {
      // 도착 층 출발점: 구역 전환=진입 입구 / 같은 층=입구 / sectionSuffix=구름다리 출구 / 일반=공통 엘베
      const from = navPlan.isSection ? navPlan.sectionEntryPos
        : sameFloor ? navPlan.startPos
        : navPlan.sectionSuffix ? navPlan.suffixDestBridgePos
        : elev?.destElev;
      route = segmentNavPath(data, navPlan.destMapId, from, navPlan.destPos);
    }
    const pose = route && route.length > 0
      ? { pos: route[0].pos, lookAt: route[0].lookAt }
      : null;
    return { currentNavRoute: route, initialNavPose: pose };
  }, [navStep, navPlan, data]);

  return {
    // 상태머신
    navStep, navPlan, showElevatorUI, isMapLoaded, setIsMapLoaded,
    // 진행률
    floorProgress, setFloorProgress, phaseRatios,
    // 플레이어
    isPlaying, setIsPlaying, isScrubbing, setIsScrubbing,
    navSpeed, setNavSpeed,
    // 슬라이더 표시값
    sliderValue, tooltipText, p1, p2, p3,
    // 액션
    startWayfinding, handleNavComplete, cancel, restart,
    handleScrubChange, handleScrubEnd, jumpToChapter,
    // 카메라 경로
    currentNavRoute, initialNavPose, seekState,
    // 파생 플래그
    isNavigatingSequence: navStep !== 'idle' && navStep !== 'finished',
    isNavFinished: navStep === 'finished',
  };
};
