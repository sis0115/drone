import * as THREE from 'three';
import { RT_W, RT_H, CAMERA } from '@/data/render';

/**
 * 480×270 RenderTarget → 풀스크린 쿼드 합성.
 *
 * 3버퍼 구조(현재/이전/홀드)는 프레임 프리즈·코덱 잔상·모션블러가 전부 의존하는
 * 뼈대다 (07 문서 2.1). T1에서는 합성 셰이더가 패스스루지만 구조는 미리 세운다.
 *
 *   씬 → rtA
 *   rtA + rtPrev → 합성 셰이더 → 화면
 *   프리즈 아닐 때만 rtA → rtPrev 복사
 */
export class FpvRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;

  private readonly rtA: THREE.WebGLRenderTarget;
  private readonly rtPrev: THREE.WebGLRenderTarget;
  private readonly copyQuad: THREE.Mesh;
  private readonly copyScene = new THREE.Scene();
  private readonly composite: THREE.Mesh;
  private readonly compositeScene = new THREE.Scene();
  private readonly quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly uniforms: Record<string, THREE.IUniform>;

  /** true인 프레임에는 rtPrev를 갱신하지 않는다 = 프레임 프리즈. */
  freeze = false;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false });
    this.renderer.setPixelRatio(1); // 내부 해상도가 고정이므로 DPR 스케일은 쓰지 않는다.
    this.renderer.setSize(canvas.clientWidth || RT_W, canvas.clientHeight || RT_H, false);

    this.camera = new THREE.PerspectiveCamera(CAMERA.FOV, RT_W / RT_H, CAMERA.NEAR, CAMERA.FAR);

    const opts: THREE.RenderTargetOptions = {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: true,
      stencilBuffer: false,
    };
    this.rtA = new THREE.WebGLRenderTarget(RT_W, RT_H, opts);
    this.rtPrev = new THREE.WebGLRenderTarget(RT_W, RT_H, { ...opts, depthBuffer: false });

    this.uniforms = {
      tCur: { value: this.rtA.texture },
      tPrev: { value: this.rtPrev.texture },
      uTime: { value: 0 },
      uSignal: { value: 1 },
    };

    const quad = new THREE.PlaneGeometry(2, 2);
    this.composite = new THREE.Mesh(
      quad,
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        depthTest: false,
        depthWrite: false,
        vertexShader: VERT,
        fragmentShader: COMPOSITE_FRAG,
      }),
    );
    this.compositeScene.add(this.composite);

    this.copyQuad = new THREE.Mesh(
      quad,
      new THREE.MeshBasicMaterial({ map: this.rtA.texture, depthTest: false, depthWrite: false }),
    );
    this.copyScene.add(this.copyQuad);
  }

  resize(width: number, height: number): void {
    // 내부 RT는 480×270 고정. 바뀌는 것은 업스케일 대상인 캔버스뿐이다.
    this.renderer.setSize(width, height, false);
  }

  render(time: number, signalQuality: number): void {
    this.uniforms.uTime.value = time;
    this.uniforms.uSignal.value = signalQuality;

    this.renderer.setRenderTarget(this.rtA);
    this.renderer.render(this.scene, this.camera);

    if (!this.freeze) {
      this.renderer.setRenderTarget(this.rtPrev);
      this.renderer.render(this.copyScene, this.quadCamera);
    }

    this.renderer.setRenderTarget(null);
    this.renderer.render(this.compositeScene, this.quadCamera);
  }

  get info(): { calls: number; triangles: number } {
    const { render } = this.renderer.info;
    return { calls: render.calls, triangles: render.triangles };
  }

  dispose(): void {
    this.rtA.dispose();
    this.rtPrev.dispose();
    this.renderer.dispose();
  }
}

const VERT = /* glsl */ `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

// T1: 패스스루. T2에서 그레인·주사선·배럴 왜곡·매크로블록 등이 여기에 들어온다.
const COMPOSITE_FRAG = /* glsl */ `
precision mediump float;
uniform sampler2D tCur;
uniform sampler2D tPrev;
uniform float uSignal;
varying vec2 vUv;
void main(){
  vec3 cur = texture2D(tCur, vUv).rgb;
  gl_FragColor = vec4(cur, 1.0);
}
`;
