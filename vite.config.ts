import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// 개발 빌드 전용 기능(튜닝 패널 등)은 import.meta.env.DEV 로 분기한다.
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    host: true,
    port: 5173,
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    // 저사양 폰 대응: 청크 경고 임계를 낮게 두어 번들 비대화를 조기에 인지한다.
    chunkSizeWarningLimit: 700,
  },
});
