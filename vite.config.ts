import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

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
export default defineConfig(() => {
  return {
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
