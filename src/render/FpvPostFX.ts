import * as THREE from 'three';
import type { PostFxParams } from '@/data/postfx';

/**
 * 합성 셰이더 — 이 게임의 정체성.
 *
 * 3버퍼(현재/이전/합성) 위에서 돈다 (07 문서 2.1). 프리즈·코덱 잔상·모션블러가
 * 전부 `tPrev` 에 의존하므로 **단일 패스로 바꾸면 현장감의 핵심이 사라진다.**
 *
 * 파라미터는 `uP` 배열 하나로 밀어 넣는다 — 개발 빌드의 튜닝 패널이
 * 유니폼 선언을 건드리지 않고 슬라이더만으로 전부 조작할 수 있게 하기 위함.
 */

/** uP 배열 인덱스. 셰이더 주석과 이 표가 어긋나면 화면이 조용히 틀어진다. */
const P_INDEX = {
  grain: 0, scan: 1, vign: 2, chroma: 3, blockAmt: 4, blockRate: 5, ghost: 6,
  freezeAmt: 7, jitter: 8, rolling: 9, jello: 10, motionSmear: 11, dropRate: 12,
  contrast: 13, distort: 14, mblur: 15,
} as const;

export interface PostFxUniforms {
  tCur: THREE.IUniform<THREE.Texture | null>;
  tPrev: THREE.IUniform<THREE.Texture | null>;
  uTime: THREE.IUniform<number>;
  uSignal: THREE.IUniform<number>;
  /** 0 흑백 / 1 주간 컬러 / 2 열화상 */
  uThermal: THREE.IUniform<number>;
  uDead: THREE.IUniform<number>;
  /** 발작적 붕괴 강도 (0~1) */
  uBurst: THREE.IUniform<number>;
  uFreeze: THREE.IUniform<number>;
  uShake: THREE.IUniform<THREE.Vector2>;
  uJello: THREE.IUniform<number>;
  uMotion: THREE.IUniform<number>;
  uP: THREE.IUniform<Float32Array>;
}

export function createPostFxMaterial(): THREE.ShaderMaterial {
  const uniforms: PostFxUniforms = {
    tCur: { value: null },
    tPrev: { value: null },
    uTime: { value: 0 },
    uSignal: { value: 1 },
    uThermal: { value: 0 },
    uDead: { value: 0 },
    uBurst: { value: 0 },
    uFreeze: { value: 0 },
    uShake: { value: new THREE.Vector2() },
    uJello: { value: 0 },
    uMotion: { value: 0 },
    uP: { value: new Float32Array(16) },
  };

  return new THREE.ShaderMaterial({
    uniforms: uniforms as unknown as Record<string, THREE.IUniform>,
    vertexShader: VERT,
    fragmentShader: FRAG,
    depthTest: false,
    depthWrite: false,
  });
}

/** 튜닝 파라미터를 셰이더 배열로 민다. */
export function pushParams(material: THREE.ShaderMaterial, p: PostFxParams): void {
  const a = material.uniforms.uP.value as Float32Array;
  for (const [key, index] of Object.entries(P_INDEX)) {
    a[index] = p[key as keyof PostFxParams];
  }
}

const VERT = /* glsl */ `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const FRAG = /* glsl */ `
precision mediump float;
uniform sampler2D tCur, tPrev;
uniform float uTime, uSignal, uThermal, uDead, uBurst, uFreeze, uJello, uMotion;
uniform vec2 uShake;
uniform float uP[16];
varying vec2 vUv;
// uP: 0 grain, 1 scan, 2 vign, 3 chroma, 4 blockAmt, 5 blockRate, 6 ghost,
//     7 freezeAmt, 8 jitter, 9 rolling, 10 jello, 11 motionSmear, 12 dropRate,
//     13 contrast, 14 distort, 15 mblur
float rand(vec2 c){ return fract(sin(dot(c, vec2(12.9898,78.233))) * 43758.5453); }

void main(){
  float bad = clamp((1.0-uSignal) + uBurst*0.85, 0.0, 1.4);

  // ── 초광각 렌즈 배럴 왜곡 ──
  // ⚠️ SVG 오버레이는 이것의 역변환을 적용해야 마커가 표적에 붙는다 (07 문서 2.4).
  vec2 cc = vUv-0.5;
  float r2 = dot(cc,cc);
  vec2 uv = 0.5 + cc*(1.0 + uP[14]*r2);
  if(uv.x<0.0||uv.x>1.0||uv.y<0.0||uv.y>1.0){ gl_FragColor=vec4(0.0,0.0,0.0,1.0); return; }

  // ── 젤로(모터 진동): 행마다 좌우로 미세하게 휘어짐 ──
  uv.x += sin(uv.y*38.0 + uTime*46.0) * 0.0016 * uP[10] * uJello;
  // ── 급기동 밀림 ──
  uv += uShake * (0.5 + 0.5*uP[11]);

  // ── 라인 지터 (아날로그) ──
  float ln = rand(vec2(floor(uv.y*270.0), floor(uTime*22.0)));
  uv.x += (ln-0.5) * (0.0010 + 0.016*bad) * uP[8];

  // ── 수평 드롭아웃 (한 줄 통째로 밀림) ──
  float drow = step(0.988 - 0.06*bad*uP[12], rand(vec2(floor(uv.y*70.0), floor(uTime*11.0))));
  uv.x += drow * (rand(vec2(floor(uTime*11.0),3.0))-0.5) * 0.16 * uP[12];

  // ── 매크로블록: 블록 단위 오프셋 + 양자화 (06 문서 1.3 — 요즘 드론 영상의 질감) ──
  vec2 bs = vec2(60.0, 34.0);
  vec2 blk = floor(uv*bs);
  float bt = floor(uTime*uP[5]);
  float bn = rand(blk + bt);
  float blockHit = step(1.0 - (0.04 + 0.42*bad)*uP[4], bn);
  vec2 uvBlk = uv + (vec2(rand(blk+bt+1.7), rand(blk+bt+3.3))-0.5)*vec2(0.055,0.014);
  uvBlk = (floor(uvBlk*bs)+0.5)/bs;
  uv = mix(uv, uvBlk, blockHit);

  // ── 샘플: 프리즈면 이전 프레임 유지 ──
  vec3 cur  = texture2D(tCur , uv).rgb;
  vec3 prev = texture2D(tPrev, uv).rgb;
  vec3 c = mix(cur, prev, uFreeze * uP[7]);
  // ── 모션블러: 속도에 비례해 이전 프레임과 혼합 ──
  c = mix(c, prev, uMotion * uP[15] * (1.0-uFreeze));

  // ── 코덱 잔상: 블록 맞은 곳은 이전 프레임 픽셀이 남음 (P프레임 특성) ──
  float ghostHit = step(1.0 - (0.03+0.30*bad)*uP[6], rand(blk + bt + 7.7));
  c = mix(c, texture2D(tPrev, (floor(vUv*bs)+0.5)/bs).rgb, ghostHit*0.85);

  // ── 색수차 / 크로마 밴딩 ──
  if(uP[3] > 0.01){
    float off = (0.0012 + 0.006*bad) * uP[3];
    c.r = texture2D(tCur, uv + vec2(off,0.0)).r;
    c.b = texture2D(tCur, uv - vec2(off,0.0)).b;
  }

  float lum = dot(c, vec3(0.299,0.587,0.114));
  lum = clamp((lum-0.5)*uP[13]+0.5, 0.0, 1.0);
  vec3 col;
  if(uThermal>1.5){
    // 열화상 — 4단 구조는 머티리얼 스왑이 만들고, 여기서는 감마·백열만 얹는다
    float h = clamp(pow(lum,0.85)*1.18,0.0,1.0);
    col = vec3(h) + vec3(0.06,0.03,0.0)*smoothstep(0.82,1.0,h);
  } else if(uThermal>0.5){
    // 주간 컬러 — 채도 45%, 저대비, 하이라이트 뭉갬 (06 문서 1.2)
    vec3 sat = mix(vec3(lum), c, 0.45);
    sat = (sat-0.5)*uP[13]*0.92+0.5;
    sat = mix(sat, vec3(1.0)-((vec3(1.0)-sat)*(vec3(1.0)-sat)), 0.18);
    col = sat * vec3(1.02,1.0,0.95) + vec3(0.035,0.04,0.03);
  } else {
    // 아날로그 흑백 (녹색 인광)
    col = vec3(lum) * vec3(0.80,1.0,0.84);
  }

  // ── 그레인 ──
  float n = rand(uv*vec2(640.,360.) + uTime*37.0);
  col += (n-0.5) * (uP[0] + 0.45*bad);
  // ── 주사선 ──
  col *= 1.0 - uP[1]*abs(sin(vUv.y*270.0*3.14159));
  // ── 롤링 밴드 ──
  col += smoothstep(0.0,0.035, abs(fract(vUv.y - uTime*0.07)-0.5)-0.465) * uP[9];
  // ── 비네팅 ──
  vec2 d = vUv-0.5; col *= 1.0 - dot(d,d)*uP[2];
  // ── 신호 완전 두절 ──
  col = mix(col, vec3(n)*0.85, uDead);
  gl_FragColor = vec4(col,1.0);
}
`;
