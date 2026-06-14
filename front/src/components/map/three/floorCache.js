import { useGLTF } from '@react-three/drei';

// 로드된 층 GLB 의 scene 을 url 로 추적한다.
// 층을 떠날 때 그 층의 GPU 리소스(지오메트리·텍스처)를 해제하기 위함.
// (특히 8K 텍스처는 층당 메모리가 커서, 안 내리면 몇 층만 둘러봐도 브라우저가 뻗는다)
const loadedScenes = new Map();

// FloorModel 이 scene 을 로드하면 등록한다.
export function registerFloorScene(url, scene) {
  if (url && scene) loadedScenes.set(url, scene);
}

// scene 의 지오메트리·텍스처를 GPU 에서 dispose. 헬퍼 — 외부 노출 안 함.
function disposeScene(scene) {
  scene.traverse((obj) => {
    obj.geometry?.dispose();
    const materials = Array.isArray(obj.material)
      ? obj.material
      : obj.material ? [obj.material] : [];
    for (const mat of materials) {
      for (const key in mat) {
        const value = mat[key];
        if (value && value.isTexture) value.dispose();
      }
      mat.dispose();
    }
  });
}

// 한 층을 메모리에서 내린다: 지오메트리·텍스처(GPU 리소스) 해제 + useGLTF 캐시 제거.
//
// ⚠️ 반드시 "지금 화면에 렌더 중이 아닌" url 에만 호출할 것.
//    렌더 중인 url 을 clear 하면 그 컴포넌트가 즉시 재로딩 → 무한 루프가 난다
//    (작업일지 4번 참고). 그래서 MapPage 가 "직전 층"에만 이 함수를 호출한다.
export function unloadFloor(url) {
  if (!url) return;
  const scene = loadedScenes.get(url);
  if (scene) {
    disposeScene(scene);
    loadedScenes.delete(url);
  }
  // useGLTF 전역 캐시에서 제거 → 다음 방문 시 새로 로드(.glb 는 브라우저 캐시에 남아 빠름)
  useGLTF.clear(url);
}

// 등록된 모든 층을 해제. MapPage 를 떠날 때(unmount) 사용.
// 같은 세션에서 여러 건물·층을 둘러본 뒤 GPU 메모리가 누적되어 흰화면이 나는 걸 막는다.
export function unloadAll() {
  for (const [url, scene] of loadedScenes.entries()) {
    disposeScene(scene);
    useGLTF.clear(url);
  }
  loadedScenes.clear();
}

// keepUrl 한 층만 살리고 나머지를 전부 해제. 길찾기 종료 후 호출해
// 출발층·자매구역 같은 잔여 GLB 를 즉시 메모리에서 비운다.
export function unloadAllExcept(keepUrl) {
  for (const [url, scene] of loadedScenes.entries()) {
    if (url === keepUrl) continue;
    disposeScene(scene);
    useGLTF.clear(url);
    loadedScenes.delete(url);
  }
}
