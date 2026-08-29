import * as THREE from 'three';
import { DAYLIGHT } from '@/data/atmosphere';

/**
 * 하늘돔 — 수직 그라데이션 1콜. 열화상에서 하늘은 거의 순흑이므로 별도 처리한다(T6).
 *
 * `world/` 에 있다 — 렌더러가 아니라 **씬의 오브젝트**이기 때문이다.
 * `render/` 에 두면 world → render 의존이 생겨 헤드리스 씬 검사가 깨진다.
 */
export interface SkyDome {
  mesh: THREE.Mesh;
  /** 카메라 모드에 따라 하늘색을 갈아 끼운다 (열화상에서 하늘은 거의 순흑). */
  setColors(top: number, horizon: number): void;
}

export function createSkyDome(): SkyDome {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      cTop: { value: new THREE.Color(DAYLIGHT.skyTop) },
      cHor: { value: new THREE.Color(DAYLIGHT.skyHorizon) },
      // 태양 방향 — SceneBuilder 의 DirectionalLight(-70,100,50)와 같은 쪽.
      // 흐린 날의 해는 원반이 아니라 **구름 뒤의 밝은 자리**다. 그 자리가 있어야
      // 하늘이 "회색 판"에서 "빛이 어디선가 오는 하늘"이 된다.
      uSun: { value: new THREE.Vector3(-70, 100, 50).normalize() },
    },
    vertexShader: /* glsl */ `
      varying float h;
      varying vec3 vDir;
      void main(){
        vec3 n = normalize(position);
        h = n.y; vDir = n;
        gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.);
      }
    `,
    // 아트 패스 3: 민짜 그라데이션 하늘 → 흐린 구름층 (실사화).
    // 구름은 열화상 전환 때 cTop 이 순흑이 되면 자동으로 함께 죽는다 — 명도에 곱하므로.
    fragmentShader: /* glsl */ `
      uniform vec3 cTop, cHor;
      uniform vec3 uSun;
      varying float h;
      varying vec3 vDir;
      float hash21(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      float vnoise(vec2 p){
        vec2 i = floor(p), f = fract(p);
        vec2 u = f*f*(3.0-2.0*f);
        return mix(mix(hash21(i), hash21(i+vec2(1,0)), u.x),
                   mix(hash21(i+vec2(0,1)), hash21(i+vec2(1,1)), u.x), u.y);
      }
      float fbm(vec2 p){
        float v = 0.0, a = 0.5;
        for(int k=0;k<4;k++){ v += vnoise(p)*a; p *= 2.07; a *= 0.5; }
        return v;
      }
      void main(){
        float k = smoothstep(-0.03, 0.42, h);
        vec3 base = mix(cHor, cTop, k);
        // 하늘 평면 투영 좌표 — 천정 근처 특이점은 분모 하한으로 막는다
        vec2 uv = vDir.xz / max(vDir.y, 0.06);
        float band = smoothstep(0.02, 0.28, h);

        /**
         * 구름 두 겹 (아트 패스 4). 한 겹짜리는 밝기만 흔들려 **평면 무늬**로 읽혔다.
         * - 낮은 층: 크고 느린 덩어리. 밑면이 어둡다 — 이 그늘이 두께를 만든다.
         * - 높은 층: 잘고 결이 선 권운. 위로 갈수록 드러난다.
         */
        float low = fbm(uv * 0.62 + 4.0) - fbm(uv * 1.7 + 31.7) * 0.3;
        float high = fbm(uv * 2.6 - 12.0);
        float lowShade = (low - 0.36) * 0.62;              // 밝은 마루 / 어두운 밑면 양방향
        float highVeil = max(0.0, high - 0.52) * 0.34 * smoothstep(0.12, 0.5, h);
        float cloud = (lowShade + highVeil) * band;

        /**
         * 해가 있는 자리 — 흐린 하늘이라 **넓고 흐릿한 밝음**이다.
         * 곱으로 얹는다: 열화상에서 cTop 이 순흑이 되면 이것도 같이 죽어야 한다.
         */
        float sd = max(dot(vDir, uSun), 0.0);
        float glow = pow(sd, 2.6) * 0.20 + pow(sd, 14.0) * 0.22;

        // 지평선 헤이즈 — 아래로 갈수록 대기가 두꺼워 뿌옇게 뜬다
        float haze = (1.0 - smoothstep(-0.02, 0.3, h)) * 0.09;

        gl_FragColor = vec4(base * (1.0 + cloud + glow + haze), 1.);
      }
    `,
    side: THREE.BackSide,
    fog: false,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1000, 16, 10), material);
  return {
    mesh,
    setColors(top, horizon) {
      (material.uniforms.cTop.value as THREE.Color).setHex(top);
      (material.uniforms.cHor.value as THREE.Color).setHex(horizon);
    },
  };
}
