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
        float cl = fbm(uv * 0.9) - fbm(uv * 2.3 + 31.7) * 0.35;
        // 지평선에서는 구름이 압축·소실되고 위로 갈수록 결이 드러난다
        float band = smoothstep(0.02, 0.28, h);
        float cloud = (cl - 0.32) * 0.5 * band;
        gl_FragColor = vec4(base * (1.0 + cloud), 1.);
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
