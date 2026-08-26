import * as THREE from 'three';

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
      cTop: { value: new THREE.Color(0x4d7ea8) },
      cHor: { value: new THREE.Color(0xb9c6c2) },
    },
    vertexShader: /* glsl */ `
      varying float h;
      void main(){ h = normalize(position).y; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 cTop, cHor;
      varying float h;
      void main(){ float k = smoothstep(-0.03, 0.42, h); gl_FragColor = vec4(mix(cHor, cTop, k), 1.); }
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
