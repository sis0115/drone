import { defineConfig, loadEnv } from 'vite';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { devApiPlugin } from './api/_lib/devServer';

/**
 * 빌드 스탬프. 폰에서 프리뷰를 열었을 때 HUD 우하단에 찍혀,
 * 지금 보고 있는 화면이 어느 커밋인지 확인할 수 있다.
 * Vercel 은 VERCEL_GIT_COMMIT_SHA 를 주고, 로컬에서는 git 에서 직접 읽는다.
 */
function buildId(): string {
  const fromVercel = process.env.VERCEL_GIT_COMMIT_SHA;
  if (fromVercel) return fromVercel.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return 'dev';
  }
}

// 개발 빌드 전용 기능(튜닝 패널 등)은 import.meta.env.DEV 로 분기한다.
export default defineConfig(({ mode }) => {
  // .env 의 DATABASE_URL 을 process.env 로 올린다 — dev-api 미들웨어가 읽는다.
  // Vite 는 VITE_ 접두사만 클라이언트에 노출하므로 DB 문자열이 번들에 들어갈 일은 없다.
  const env = loadEnv(mode, process.cwd(), '');
  if (env.DATABASE_URL && !process.env.DATABASE_URL) {
    process.env.DATABASE_URL = env.DATABASE_URL;
  }

  return {
    // 로컬 dev/preview 에서 api/ 함수를 마운트한다. Vercel 에서는 플랫폼이 대신한다.
    plugins: [devApiPlugin()],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    define: {
      __BUILD_ID__: JSON.stringify(buildId()),
      __BUILD_BRANCH__: JSON.stringify(
        process.env.VERCEL_GIT_COMMIT_REF ?? process.env.GITHUB_REF_NAME ?? 'local',
      ),
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
  };
});
