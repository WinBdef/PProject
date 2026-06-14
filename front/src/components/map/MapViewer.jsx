import { Suspense, useRef, useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { useGLTF, CameraControls, Splat, Environment, Line } from '@react-three/drei';
import * as THREE from 'three';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';

import AdminCoords from './controls/AdminCoords';
import AutoRotator from './controls/AutoRotator';
import HumanWalk from './controls/HumanWalk';
import SplatTransform from './controls/SplatTransform';
import Joystick from './ui/Joystick';

import { MapLoadingOverlay, LoadingReporter } from './three/Loader';
import { PathLine } from './three/PathLine';
import { RoomMarker } from './three/RoomMarker';
import { NavAnimator } from './three/NavAnimator';
import { NAV_EYE_LEVEL } from './three/constants';
import { registerFloorScene } from './three/floorCache';

// three-mesh-bvh: raycast 가속.
// 관리자 모드는 매 프레임 모델에 raycast 하는데, 고밀도 GLB(수십만~수백만 삼각형)에
// 그대로 부딪히면 화면이 버벅인다. BVH 를 깔면 raycast 비용이 수십분의 1 로 준다.
THREE.Mesh.prototype.raycast = acceleratedRaycast;
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;

// 층 GLB 모델만 따로 떼어낸 컴포넌트.
// useGLTF 호출을 <Suspense> 안쪽 자식으로 격리하기 위함 — 이래야 층을 바꿀 때
// MapViewer 전체(캔버스·카메라·UI)가 suspend 되지 않고 이 컴포넌트만 suspend 되어
// 모델 자리에만 <Loader> 스피너가 뜬다. (예전엔 useGLTF 가 MapViewer 최상단에 있어
// 층을 누를 때마다 캔버스째 멈췄다 다시 그려졌다 → 그게 "렉"의 정체였음.)
function FloorModel({ url, buildBVH }) {
  // 층 언로드(GPU 메모리 해제)는 FloorModel 의 effect cleanup 이 아니라
  // MapPage 가 floorCache.unloadFloor() 로 처리한다 — 여기서 useGLTF.clear 를
  // 호출하면 clear→재로딩→재clear 무한 루프가 났었음(작업일지 4번).
  const { scene } = useGLTF(url);

  // 이 층 scene 을 url 로 캐시에 등록 → MapPage 가 층을 떠날 때 해제할 수 있게.
  useEffect(() => { registerFloorScene(url, scene); }, [url, scene]);

  // 관리자 모드일 때만 raycast 가속용 BVH 를 만든다 (일반 사용자는 매 프레임
  // raycast 가 없어 불필요). geometry 에 캐시되어 같은 층 재방문 시 재계산 안 함.
  useEffect(() => {
    if (!buildBVH) return;
    scene.traverse((obj) => {
      if (obj.isMesh && obj.geometry && !obj.geometry.boundsTree) {
        obj.geometry.computeBoundsTree();
      }
    });
  }, [scene, buildBVH]);

  return <primitive object={scene} />;
}

// 마커 드래그 중에만 마운트된다. 윈도우 포인터 이벤트를 받아 커서를
// 수평면(y=planeY)에 투영한 좌표로 onMove 를 호출 → 마커가 커서를 따라온다.
// (보이는 메쉬 대신 수학 평면을 써서 다른 물체에 가려도 정확히 동작)
function MarkerDragLayer({ planeY, onMove, onEnd }) {
  const { camera, gl } = useThree();
  const cbRef = useRef({ onMove, onEnd });
  cbRef.current = { onMove, onEnd };

  useEffect(() => {
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -planeY);
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const hit = new THREE.Vector3();

    const handleMove = (e) => {
      const rect = gl.domElement.getBoundingClientRect();
      ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      ray.setFromCamera(ndc, camera);
      if (ray.ray.intersectPlane(plane, hit)) cbRef.current.onMove(hit.x, hit.z);
    };
    const handleUp = () => cbRef.current.onEnd();

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
  }, [planeY, camera, gl]);

  return null;
}

// 관리자 모드 전용 자유 비행(Fly) 카메라.
// WASD = 수평 이동, Space = 위, Ctrl/Shift = 아래, 휠 스크롤 = 전후,
// 시점 회전: (1) R 키 홀드 + 마우스 이동 — 트랙패드·휠 클릭 안 되는 마우스용 대체경로
//           (2) 휠(가운데) 버튼 드래그 — 기존 방식
// 좌클릭은 마커·경로용으로 비워 둔다. 우클릭은 버그가 잦아 안 씀.
function FlyController() {
  const { camera, gl } = useThree();
  const keys = useRef({});
  // x/y === null 은 "활성 직후 첫 mousemove 가 기준점을 잡아야 함" 의미
  const look = useRef({ active: false, x: 0, y: 0 });

  useEffect(() => {
    const dom = gl.domElement;
    // 현재 시점 방향을 YXZ(요→피치) 순서 오일러로 다시 표현 — 1인칭 회전용
    camera.rotation.setFromQuaternion(camera.quaternion, 'YXZ');

    const isTyping = (e) => {
      const t = e.target?.tagName;
      return t === 'INPUT' || t === 'TEXTAREA';
    };
    const onKeyDown = (e) => {
      if (isTyping(e)) return;
      keys.current[e.code] = true;
      // R 누르면 회전 모드 진입. 기준점은 첫 mousemove 에서 세팅 (마우스 위치 모름).
      if (e.code === 'KeyR' && !look.current.active) {
        look.current = { active: true, x: null, y: null };
      }
    };
    const onKeyUp = (e) => {
      keys.current[e.code] = false;
      if (e.code === 'KeyR') look.current.active = false;
    };
    const onContextMenu = (e) => e.preventDefault();
    // 가운데 버튼 mousedown 기본 동작(Windows 자동 스크롤)을 차단
    const onMouseDown = (e) => { if (e.button === 1) e.preventDefault(); };
    // 휠(가운데) 버튼 드래그 = 시점 회전 (기존 방식)
    const onPointerDown = (e) => {
      if (e.button === 1) look.current = { active: true, x: e.clientX, y: e.clientY };
    };
    const onPointerMove = (e) => {
      if (!look.current.active) return;
      // R 홀드 진입 후 첫 무브: 기준점만 잡고 회전은 다음 프레임부터
      if (look.current.x === null) {
        look.current.x = e.clientX;
        look.current.y = e.clientY;
        return;
      }
      const dx = e.clientX - look.current.x;
      const dy = e.clientY - look.current.y;
      look.current.x = e.clientX;
      look.current.y = e.clientY;
      camera.rotation.y -= dx * 0.0025;
      camera.rotation.x -= dy * 0.0025;
      const limit = Math.PI / 2 - 0.02;
      camera.rotation.x = Math.max(-limit, Math.min(limit, camera.rotation.x));
    };
    // 휠 버튼 해제 시만 종료. R 키는 onKeyUp 에서 처리.
    const onPointerUp = (e) => { if (e.button === 1) look.current.active = false; };
    const onWheel = (e) => {
      e.preventDefault();
      const fwd = new THREE.Vector3();
      camera.getWorldDirection(fwd);
      camera.position.addScaledVector(fwd, -e.deltaY * 0.03);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    dom.addEventListener('contextmenu', onContextMenu);
    dom.addEventListener('mousedown', onMouseDown);
    dom.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    dom.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      dom.removeEventListener('contextmenu', onContextMenu);
      dom.removeEventListener('mousedown', onMouseDown);
      dom.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      dom.removeEventListener('wheel', onWheel);
    };
  }, [camera, gl]);

  useFrame((_, delta) => {
    const k = keys.current;
    const step = 16 * Math.min(delta, 0.1);
    const fwd = new THREE.Vector3();
    camera.getWorldDirection(fwd);
    const right = new THREE.Vector3().crossVectors(fwd, camera.up).normalize();
    if (k['KeyW']) camera.position.addScaledVector(fwd, step);
    if (k['KeyS']) camera.position.addScaledVector(fwd, -step);
    if (k['KeyD']) camera.position.addScaledVector(right, step);
    if (k['KeyA']) camera.position.addScaledVector(right, -step);
    if (k['Space']) camera.position.y += step;
    if (k['ControlLeft'] || k['ShiftLeft']) camera.position.y -= step;
  });

  return null;
}

// 관리자 '경로' 도구에서 한 경로를 편집 가능하게 그린다.
// 점이 2개 이상이면 폴리라인, 활성 경로는 노란색 + 각 점에 구체 표시.
// 그룹을 클릭하면 그 경로가 선택된다.
function EditableRoute({ route, active, onSelect }) {
  const path = (route.path || []).map((p) =>
    Array.isArray(p) ? p : [p.x, p.y, p.z]
  );
  const color = active ? '#facc15' : '#3b82f6';
  return (
    <group onClick={(e) => { e.stopPropagation(); onSelect(); }}>
      {/* depthTest=false — 바닥에 붙은 선이 시점에 따라 모델에 가려지는 것 방지 */}
      {path.length >= 2 && (
        <>
          <Line points={path} color="white" lineWidth={26} transparent opacity={0} depthTest={false} />
          <Line points={path} color={color} lineWidth={active ? 7 : 5} transparent opacity={0.9} depthTest={false} />
        </>
      )}
      {/* 경로 점: 마커 수준 크기(0.5) + depthTest 켜서 맵 뒤로 안 비침 */}
      {active && path.map((p, i) => (
        <mesh key={i} position={p}>
          <sphereGeometry args={[0.5, 16, 16]} />
          <meshBasicMaterial color="#facc15" />
        </mesh>
      ))}
    </group>
  );
}

// 마커 + 스플랫 bounding box 를 다 담는 카메라 위치/타깃 계산.
// (0,0)에서 멀리 떨어진 초기 cameraPosition 대신 층마다 실제 콘텐츠 분포에 맞게 fit.
// section_entry(관리자용 진입점)는 일반 사용자 fit에는 포함하지 않음.
function computeFitView(markers, splats) {
  const box = new THREE.Box3();
  let hasAny = false;

  (markers || []).forEach((m) => {
    if (!m || !m.position || m.kind === 'section_entry') return;
    box.expandByPoint(new THREE.Vector3(m.position[0], m.position[1], m.position[2]));
    hasAny = true;
  });
  // 스플랫도 fit 대상 — 마커와 떨어진 영역에 있어도 잘리지 않게.
  (splats || []).forEach((sp) => {
    const p = sp?.splatConfig?.position;
    if (!p) return;
    box.expandByPoint(new THREE.Vector3(p[0], p[1], p[2]));
    hasAny = true;
  });

  if (!hasAny) return null;
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const maxXZ = Math.max(size.x, size.z, 8); // 너무 작은 층은 최소 8m

  // viewport 비율 보정 — 모바일 풀스크린(세로) 에선 FOV 50° 수평이 좁아
  // 가로 방향이 화면에서 잘림. 다만 1/aspect 직선 부스트는 너무 멀어져 과함
  // (iPhone Pro Max aspect 0.46 → 2.17배 = 사용자가 "너무 멀다" 호소).
  // → sqrt 곡선 + 최대 1.35 캡 으로 완만하게.
  const aspect = typeof window !== 'undefined'
    ? (window.innerWidth || 1) / Math.max(1, window.innerHeight)
    : 1;
  const portraitBoost = aspect < 1
    ? Math.min(1.20, Math.sqrt(1.0 / Math.max(0.45, aspect)))
    : 1.0;

  const camDist = maxXZ * 0.82 * portraitBoost;
  const camHeight = maxXZ * 0.78 * portraitBoost;
  return {
    pos: [center.x + camDist * 0.7, center.y + camHeight, center.z + camDist * 0.7],
    look: [center.x, center.y, center.z],
  };
}

const MapViewer = forwardRef((props, ref) => {
  const {
    modelUrl, cameraPosition = [25, 20, 25], fitView, routes = [], markers = [], splats = [],
    showRoutes, adminMode, navRoute, onNavComplete, isNavigatingSequence,
    isNavFinished, onLoadComplete, isFullscreen,
    onNavProgress, seekState, isPlaying, navSpeed = 1, onNavSpeedChange,
    onMarkerClick, onAdminCapture, editingMarkerIdx,
    onMarkerMove, markerEditMode,
    routeEditMode, editingRouteIdx, onRouteSelect,
    splatEditMode, editingSplatIdx, transformMode = 'translate', onSplatTransform, onSplatSelect,
    hideSplats,
  } = props;

  const cameraRef = useRef();
  const joystickRef = useRef({ x: 0, y: 0 });

  const [isWalking, setIsWalking] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [draggingIdx, setDraggingIdx] = useState(null);
  // splat 지연 로드: GLB 로드 끝나고 800ms 뒤에 마운트. 같은 시점에 splat+GLB 가
  // 동시 로드되면 모바일 메모리 피크가 한 번에 터져 OOM 위험.
  // modelUrl 바뀔 때마다 false 로 리셋.
  const [splatsReady, setSplatsReady] = useState(false);
  // H 키로 splat 렌더 토글 (시점 그대로 GS on/off 비교 캡처용). fit 에는 영향 없음.
  const [splatHidden, setSplatHidden] = useState(false);
  // DOM overlay 로 그리는 로딩 인디케이터 표시 여부.
  // GLB 로드 시작 = true, 완료 신호 받으면 false.
  const [showLoadingOverlay, setShowLoadingOverlay] = useState(true);
  // 카메라 fit 은 (modelUrl, isFullscreen) 조합 당 1회만. markers/splats 가
  // 늦게 들어와 length 가 바뀌어도 다시 fit 안 함 — 초기 시점 뜬 후 갑자기 픽 움직이는 거 방지.
  const fitKeyRef = useRef(null);

  const isAutoMoving = (navRoute && navRoute.length > 0) || isNavigatingSequence;
  const showJoystick = isWalking && !isAutoMoving;

  useEffect(() => {
    if (!isFullscreen) { setIsWalking(false); setHasInteracted(false); }
  }, [isFullscreen]);

  useEffect(() => {
    if (!showRoutes) setIsWalking(false);
  }, [showRoutes]);

  // H 키: splat 렌더 토글 (시점 유지한 채 GS on/off — PSNR/SSIM 비교 캡처용)
  useEffect(() => {
    const onKey = (e) => {
      const t = e.target?.tagName;
      if (e.code === 'KeyH' && t !== 'INPUT' && t !== 'TEXTAREA') setSplatHidden((v) => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // 층 진입 시 마커+스플랫 bbox 기준 자동 fit (cameraPosition prop 의 fallback)
  const fitToMarkers = (smooth = true) => {
    if (!cameraRef.current) return false;
    // 데이터에 이 층 전용 시야(floors.json 의 fitViews[mapId])가 있으면 마커/스플랫 fit 보다 우선.
    // 마커 없는 층(예: 비전 1F)을 path 끝~끝이 한 화면에 들어오게 멀리서 잡을 때 사용.
    const fit = (fitView?.pos && fitView?.look)
      ? { pos: fitView.pos, look: fitView.look }
      : computeFitView(markers, splats);
    if (fit) {
      cameraRef.current.setLookAt(
        fit.pos[0], fit.pos[1], fit.pos[2],
        fit.look[0], fit.look[1], fit.look[2],
        smooth,
      );
    } else {
      cameraRef.current.setLookAt(
        cameraPosition[0], cameraPosition[1], cameraPosition[2], 0, 0, 0, smooth,
      );
    }
    return true;
  };

  useImperativeHandle(ref, () => ({
    // 나침반 클릭: 걷는 중/자동이동 중이면 강제 종료 후 탑뷰 복귀, 아니면 그냥 탑뷰
    handleCompassAction: () => {
      fitToMarkers(true);
      if (isWalking || isAutoMoving) {
        setIsWalking(false);
        return true;
      }
      return false;
    },
    resetToTopView: () => fitToMarkers(true),
  }));

  // 경로(파란선)를 클릭하면 그 지점으로 카메라를 1인칭 시점으로 이동시키고 워킹 모드로 전환
  const handlePathClick = (point, route) => {
    if (cameraRef.current) {
      const pts = route.path;
      let pathDir = new THREE.Vector3(0, 0, -1);

      if (pts && pts.length >= 2) {
        let minDistSq = Infinity;
        const flatPoint = new THREE.Vector3(point.x, 0, point.z);
        for (let i = 0; i < pts.length - 1; i++) {
          const p1 = new THREE.Vector3(pts[i].x ?? pts[i][0], 0, pts[i].z ?? pts[i][2]);
          const p2 = new THREE.Vector3(pts[i + 1].x ?? pts[i + 1][0], 0, pts[i + 1].z ?? pts[i + 1][2]);
          const line = new THREE.Line3(p1, p2);
          const closest = new THREE.Vector3();
          line.closestPointToPoint(flatPoint, true, closest);
          const d2 = flatPoint.distanceToSquared(closest);
          if (d2 < minDistSq) {
            minDistSq = d2;
            pathDir.subVectors(p2, p1).normalize();
          }
        }
      }

      cameraRef.current.setLookAt(
        point.x, NAV_EYE_LEVEL, point.z,
        point.x + pathDir.x * 0.01, NAV_EYE_LEVEL, point.z + pathDir.z * 0.01,
        true,
      );
    }
    setIsWalking(true);
    setHasInteracted(true);
  };

  // 관리자 마커 도구에서 마커를 누르면: 카메라를 잠그고 드래그를 시작하며 그 마커를 선택.
  const handleMarkerDown = (e, marker, idx) => {
    if (e.button !== 0) return;   // 좌클릭만 마커 드래그 (휠버튼은 카메라 회전용)
    e.stopPropagation();
    if (cameraRef.current) cameraRef.current.enabled = false;
    onMarkerClick(marker, idx);
    setDraggingIdx(idx);
  };

  // 층이 바뀌면(modelUrl 변경) '사용자가 카메라를 조작했음' 상태를 초기화한다.
  // 이게 없으면 한 층에서 카메라를 만져 자동회전을 멈춘 뒤 다른 층으로 가도
  // 그 멈춤 상태가 따라가서 새 층이 자동회전하지 않는다.
  // splatsReady 도 같이 리셋 — 새 층은 GLB 로드 후 다시 300ms 뒤에 splat 켬.
  useEffect(() => {
    setHasInteracted(false);
    setIsWalking(false);
    setSplatsReady(false);
    setShowLoadingOverlay(true);  // 새 층 = 다시 로딩 시작
    fitKeyRef.current = null;     // 새 층 → fit 다시 가능하게
  }, [modelUrl]);

  // 층 진입 시 마커+스플랫 bbox 기준으로 카메라 자동 fit.
  // GLB 로드와 markers prop 안정 후에 실행되도록 약간 delay.
  // 사용자가 이미 카메라 만진 경우엔 건너뜀 (의도된 시점 유지).
  useEffect(() => {
    if (!modelUrl) return;
    if ((markers?.length || 0) === 0 && (splats?.length || 0) === 0 && !fitView?.pos) return;
    if (hasInteracted) return;
    // (modelUrl, isFullscreen) 조합 당 1회만 — markers/splats length 가 늦게 도착해
    // 변하더라도 두 번째 fit 안 함. (사용자: "초기 좌표 뜬 뒤 갑자기 픽 움직임" 방지)
    const key = `${modelUrl}|${isFullscreen}`;
    if (fitKeyRef.current === key) return;
    const timer = setTimeout(() => {
      fitToMarkers(false);
      fitKeyRef.current = key;
    }, 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelUrl, markers.length, splats.length, hasInteracted, isFullscreen]);

  // 워킹 모드에서 보이는 속도 토글 — 0.5x → 1x → 1.5x → 2x 순환
  const cycleWalkSpeed = () => {
    if (!onNavSpeedChange) return;
    const steps = [0.5, 1, 1.5, 2];
    const idx = steps.indexOf(navSpeed);
    onNavSpeedChange(steps[(idx + 1) % steps.length]);
  };

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      {/* 캔버스 위 DOM overlay 로 그리는 로딩 스피너 — 3D/카메라와 완전 분리.
          drei <Html> 안에 있을 땐 카메라 움직일 때마다 미세하게 따라가던 문제 해결. */}
      <MapLoadingOverlay visible={showLoadingOverlay} />

      {showJoystick && <Joystick onMove={(val) => (joystickRef.current = val)} />}
      {showJoystick && (
        <button
          className="btn-nav-speed"
          onClick={cycleWalkSpeed}
          title={`이동 속도 (현재 ${navSpeed}x) — 클릭 시 0.5x→1x→1.5x→2x`}
        >
          {navSpeed}x
        </button>
      )}

      {/* Canvas key = modelUrl → 층 바뀔 때 캔버스 자체를 새로 마운트.
          drei <Splat>/useGLTF 내부 ArrayBuffer 캐시가 unmount 시 깔끔히 dispose 안 되는
          이슈가 있어, 캔버스째 갈아끼우면 WebGL context 와 함께 모든 GPU 리소스가
          강제 해제됨. trade-off: 층 전환 시 0.5초 정도 로딩 화면 노출. */}
      <Canvas
        key={modelUrl}
        dpr={typeof window !== 'undefined' && window.matchMedia('(max-width: 768px), (pointer: coarse)').matches ? 1 : [1, 2]}
        camera={{ fov: 50, position: cameraPosition }}
        gl={{ preserveDrawingBuffer: true, alpha: true, powerPreference: 'high-performance' }}
      >
        {/* GLB 로드 완료 신호 받으면 (a) DOM 스피너 끄고 (b) 800ms 뒤 splat 마운트.
            동시 메모리 피크 분산용 delay. */}
        <LoadingReporter
          onLoadComplete={(done) => {
            onLoadComplete?.(done);
            setShowLoadingOverlay(!done);
            if (done) setTimeout(() => setSplatsReady(true), 800);
          }}
        />
        <Suspense fallback={null}>
          {/* 건물 좌표를 보존하기 위해 Stage 대신 순정 조명 사용 */}
          <ambientLight intensity={0.8} />
          <directionalLight position={[10, 20, 10]} intensity={0.5} />
          <Environment preset="city" />

          <group>
            <FloorModel url={modelUrl} buildBVH={adminMode} />
            {/* splat 은 GLB 로드 끝나고 800ms 뒤에 마운트 (splatsReady).
                길찾기 중에도 splat 은 항상 보이게 — 사용자 요청 (메모리는 200K→100K 다운샘플 + delay 로 관리).
                splat 편집 모드(관리자)면 splatsReady 무시하고 즉시 켬. */}
            {/* hideSplats(=URL ?nosplat): fit 계산엔 splats 그대로 쓰되 렌더만 끔 → GS on/off 동일 시점 비교용 */}
            {(splatEditMode || splatsReady) && !hideSplats && !splatHidden && (() => {
              return splats.map((sp, idx) => {
              if (splatEditMode && editingSplatIdx === idx) {
                // 선택된 스플랫만 transform gizmo 부착. 자식 <Splat> 은 local(0,0,0)에
                // 두고 변환은 부모 group 이 담당 — 이중 적용 방지.
                return (
                  <SplatTransform
                    key={`edit-${idx}`}
                    mode={transformMode}
                    position={sp.splatConfig?.position}
                    rotation={sp.splatConfig?.rotation}
                    scale={sp.splatConfig?.scale}
                    onChange={(t) => onSplatTransform?.(idx, t)}
                  >
                    <Splat src={sp.splatUrl} />
                  </SplatTransform>
                );
              }
              return (
                <Splat
                  key={idx}
                  src={sp.splatUrl}
                  position={sp.splatConfig?.position}
                  rotation={sp.splatConfig?.rotation}
                  scale={sp.splatConfig?.scale}
                  onClick={splatEditMode && onSplatSelect
                    ? (e) => { e.stopPropagation(); onSplatSelect(idx); }
                    : undefined}
                />
              );
            });
            })()}
            {routeEditMode
              ? routes.map((rt, idx) => (
                  <EditableRoute
                    key={idx}
                    route={rt}
                    active={idx === editingRouteIdx}
                    onSelect={() => onRouteSelect(idx)}
                  />
                ))
              : showRoutes && !isAutoMoving && routes.map((rt, idx) => (
                  <PathLine key={idx} points={rt.path} routeData={rt} onClick={handlePathClick} />
                ))}
            {markers.map((m, idx) => {
              // section_entry 마커는 sister 전환용 내부 진입점 — 관리자 모드일 때만 표시
              if (m.kind === 'section_entry' && !adminMode) return null;
              return (
                <RoomMarker
                  key={idx}
                  position={m.position}
                  type={m.status}
                  info={m}
                  onClick={routeEditMode ? undefined : () => onMarkerClick(m, idx)}
                  onPointerDown={markerEditMode ? (e) => handleMarkerDown(e, m, idx) : undefined}
                  isEditing={editingMarkerIdx === idx}
                  // 1인칭(워킹/자동 길찾기) 중엔 라벨 숨김 — 카메라가 빠르게 이동·회전할 때
                  // 마커 라벨이 화면에서 휙휙 휘날려 "뒤 마커가 앞으로 옴" 으로 보이는 거 방지.
                  hideLabel={isAutoMoving || isWalking}
                />
              );
            })}
          </group>

          <AdminCoords isEnabled={adminMode} onCapture={onAdminCapture} />

          {navRoute && (
            // 자동 길찾기는 속도 1x 고정 — navSpeed 는 워킹 모드 전용.
            // 예전엔 길찾기 도중 navSpeed 가 바뀌면 카메라가 갑자기 빨라져서
            // 사용자가 멀미한다는 피드백이 있어서 분리.
            <NavAnimator
              route={navRoute}
              onComplete={onNavComplete}
              controlsRef={cameraRef}
              onProgress={onNavProgress}
              seekState={seekState}
              isPlaying={isPlaying}
              speedMultiplier={1}
            />
          )}

          <AutoRotator
            isEnabled={!adminMode && !isWalking && !hasInteracted && !isAutoMoving && !isNavFinished}
            controlsRef={cameraRef}
          />
          <HumanWalk
            isEnabled={showJoystick}
            joystickRef={joystickRef}
            controlsRef={cameraRef}
            routes={routes}
            speedMultiplier={navSpeed}
          />
        </Suspense>

        {/* 관리자 모드: 궤도형 CameraControls 대신 자유 비행 FlyController 사용.
            (둘 다 마운트하면 CameraControls.update 가 매 프레임 카메라를 되돌려 충돌함) */}
        {adminMode ? (
          <FlyController />
        ) : (
          <CameraControls
            ref={cameraRef}
            minPolarAngle={0}
            maxPolarAngle={Math.PI / 1.8}
            makeDefault
            autoRotate={false}
            enabled={!isNavigatingSequence && draggingIdx === null}
            minDistance={showJoystick ? 0.01 : 0}
            maxDistance={showJoystick ? 0.01 : Infinity}
            dollySpeed={isAutoMoving ? 0 : 1}
            truckSpeed={isAutoMoving ? 0 : 1}
            onStart={() => setHasInteracted(true)}
          />
        )}

        {draggingIdx !== null && (
          <MarkerDragLayer
            planeY={markers[draggingIdx]?.position?.[1] ?? 0.6}
            onMove={(x, z) => onMarkerMove(draggingIdx, x, z)}
            onEnd={() => setDraggingIdx(null)}
          />
        )}
      </Canvas>
    </div>
  );
});

export default MapViewer;
