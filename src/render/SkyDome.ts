import * as THREE from 'three';

/** 하늘돔 — 수직 그라데이션 1콜. 열화상에서 하늘은 거의 순흑이므로 별도 처리한다(T6). */
export function createSkyDome(): THREE.Mesh {
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
  return new THREE.Mesh(new THREE.SphereGeometry(1000, 16, 10), material);
}
