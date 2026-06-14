import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // 외부 터널(Cloudflare/ngrok 등)에서 들어오는 임의 호스트를 허용.
    // dev 서버 한정이라 보안 영향 없음. true = 모든 호스트 허용.
    allowedHosts: true,
    proxy: {
      // 학내 활동/출석 API (별도 서버)
      '/api/user-info/attendance': {
        target: 'http://138.2.124.21:9005',
        changeOrigin: true, secure: false,
      },
      '/api/user-info': {
        target: 'http://138.2.124.21:9007',
        changeOrigin: true, secure: false,
      },
      '/v1/auth': {
        target: 'http://138.2.124.21:9007',
        changeOrigin: true, secure: false,
      },
      // 졸작 자체 백엔드 — 프론트는 상대경로로 호출하고 이 proxy 가 받아서 전달.
      // 외부 백엔드를 쓰고 싶으면 front/.env.local 에 VITE_API_BASE 를 박을 것.
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true, secure: false,
      },
    },
  },
});
