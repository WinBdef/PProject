// 백엔드 base URL 한 곳에서 관리.
// 기본값은 빈 문자열 → 상대경로로 호출 → Vite dev proxy(/api) 가 받아서 백엔드로 전달.
// 외부 노출(ngrok 등) 시 같은 출처로 들어오므로 CORS / localhost 문제 없음.
// 배포 시 .env.production 같은 곳에 VITE_API_BASE 를 박으면 절대 URL 로 전환 가능.
export const API_BASE = import.meta.env.VITE_API_BASE || '';

export const apiUrl = (path) => `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;

// 모바일이면 .glb → _m.glb (mesh 50%·texture 512 다운샘플 버전).
// 모바일 ~1GB 페이지 한계 안에서 안정적으로 돌리기 위함.
// glb-mobile-compress.sh 로 생성한 파일이 같은 경로에 있어야 함.
export const isMobileDevice = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(max-width: 768px), (pointer: coarse)').matches;

export const mobileModelUrl = (url) => {
  if (!url || !isMobileDevice()) return url;
  return url.replace(/\.glb$/, '_m.glb');
};

// splat 도 같은 패턴 — .splat = 데스크탑 200K(6MB), _m.splat = 모바일 100K(3MB).
// 모바일 ~1GB 메모리 한계 안 들어가게 다운샘플.
export const mobileSplatUrl = (url) => {
  if (!url || !isMobileDevice()) return url;
  return url.replace(/\.splat$/, '_m.splat');
};
