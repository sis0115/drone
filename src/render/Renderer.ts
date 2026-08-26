import * as THREE from 'three';
import { RT_W, RT_H, CAMERA, VIDEO_PRESETS, type VideoQuality } from '@/data/render';
import { createPostFxMaterial, pushParams, type PostFxUniforms } from './FpvPostFX';
import { DEFAULT, type PostFxParams } from '@/data/postfx';

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
  /**
   * 씬은 밖에서 만들어 넣는다 — SceneBuilder 가 렌더러에 의존하지 않게 하기 위함.
   * 화면이 바뀌면 통째로 교체된다 (인게임 ↔ 메뉴).
   */
  scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;

  private rtA: THREE.WebGLRenderTarget;
  private rtPrev: THREE.WebGLRenderTarget;
  private readonly copyQuad: THREE.Mesh;
  private readonly copyScene = new THREE.Scene();
  private readonly composite: THREE.Mesh;
  private readonly compositeScene = new THREE.Scene();
  private readonly quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly postMaterial: THREE.ShaderMaterial;
  /**
   * 셰이더에 마지막으로 밀어 넣은 튜닝 파라미터.
   * 표적 오버레이가 **여기서 왜곡 계수를 읽어야** 셰이더와 어긋나지 않는다 (07 문서 2.4).
   */
  private currentParams: PostFxParams = DEFAULT;

  /** true인 프레임에는 rtPrev를 갱신하지 않는다 = 프레임 프리즈. */
  freeze = false;

  // 씬 패스의 실측치. renderer.info 는 render() 호출마다 리셋되므로
  // 마지막에 읽으면 합성 쿼드(1콜)만 잡힌다 — 예산 판정이 무의미해진다.
  private sceneCalls = 0;
  private sceneTriangles = 0;

  constructor(canvas: HTMLCanvasElement, scene?: THREE.Scene) {
    this.scene = scene ?? new THREE.Scene();

    /*
     * ⚠️ 색 관리를 끈다 — 프로토타입(r128) 거동을 재현하기 위함.
     *
     * r155+ 는 ColorManagement 가 기본 활성이라 머티리얼 색이 sRGB→선형으로 변환된다.
     * 그런데 우리 파이프라인은 씬을 RT 에 선형으로 그린 뒤 **원시 ShaderMaterial** 로 합성하는데,
     * 원시 셰이더에는 three 가 출력 변환을 주입해 주지 않는다. 결과적으로 선형 값이
     * sRGB 로 해석되어 화면이 통째로 어두워진다(실측).
     *
     * 검증된 기준 화면은 프로토타입이므로 지금은 r128 거동에 맞춘다.
     * 정식 선형 워크플로로 가려면 후처리 튜닝 파라미터를 다시 잡아야 하므로,
     * 화면 감성 파라미터 확정과 함께 결정할 일이다 (02 문서 8장).
     */
    THREE.ColorManagement.enabled = false;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setPixelRatio(1); // 내부 해상도가 고정이므로 DPR 스케일은 쓰지 않는다.
    this.renderer.setSize(canvas.clientWidth || RT_W, canvas.clientHeight || RT_H, false);

    this.camera = new THREE.PerspectiveCamera(CAMERA.FOV, RT_W / RT_H, CAMERA.NEAR, CAMERA.FAR);

    this.rtA = this.makeTarget(RT_W, RT_H, true);
    this.rtPrev = this.makeTarget(RT_W, RT_H, false);

    this.postMaterial = createPostFxMaterial();
    this.postMaterial.uniforms.tCur.value = this.rtA.texture;
    this.postMaterial.uniforms.tPrev.value = this.rtPrev.texture;
    pushParams(this.postMaterial, DEFAULT);

    const quad = new THREE.PlaneGeometry(2, 2);
    this.composite = new THREE.Mesh(quad, this.postMaterial);
    this.compositeScene.add(this.composite);

    this.copyQuad = new THREE.Mesh(
      quad,
      new THREE.MeshBasicMaterial({ map: this.rtA.texture, depthTest: false, depthWrite: false }),
    );
    this.copyScene.add(this.copyQuad);
  }

  resize(width: number, height: number): void {
    // 내부 RT는 프리셋 고정. 바뀌는 것은 업스케일 대상인 캔버스뿐이다.
    this.renderer.setSize(width, height, false);
  }

  private makeTarget(w: number, h: number, depth: boolean): THREE.WebGLRenderTarget {
    return new THREE.WebGLRenderTarget(w, h, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: depth,
      stencilBuffer: false,
    });
  }

  /**
   * 내부 렌더 해상도 전환 (아트 패스 3). 3버퍼를 다시 만들고 텍스처를 다시 물린다.
   * 종횡비(16:9)는 프리셋이 보장하므로 카메라는 그대로다.
   */
  setVideoQuality(quality: VideoQuality): void {
    const { w, h } = VIDEO_PRESETS[quality];
    if (this.rtA.width === w) return;
    this.rtA.dispose();
    this.rtPrev.dispose();
    this.rtA = this.makeTarget(w, h, true);
    this.rtPrev = this.makeTarget(w, h, false);
    this.postMaterial.uniforms.tCur.value = this.rtA.texture;
    this.postMaterial.uniforms.tPrev.value = this.rtPrev.texture;
    (this.copyQuad.material as THREE.MeshBasicMaterial).map = this.rtA.texture;
  }

  /** 셰이더 유니폼 직접 접근. 비행·신호·모드가 매 프레임 여기에 쓴다. */
  get uniforms(): PostFxUniforms {
    return this.postMaterial.uniforms as unknown as PostFxUniforms;
  }

  /** 튜닝 파라미터 반영 (개발 빌드의 튜닝 패널이 호출). */
  setParams(params: PostFxParams): void {
    this.currentParams = params;
    pushParams(this.postMaterial, params);
  }

  /** 셰이더가 실제로 쓰고 있는 파라미터. 오버레이 좌표 보정이 이걸 읽는다. */
  get params(): Readonly<PostFxParams> {
    return this.currentParams;
  }

  render(time: number, signalQuality: number): void {
    this.uniforms.uTime.value = time;
    this.uniforms.uSignal.value = signalQuality;

    this.renderer.setRenderTarget(this.rtA);
    this.renderer.render(this.scene, this.camera);
    this.sceneCalls = this.renderer.info.render.calls;
    this.sceneTriangles = this.renderer.info.render.triangles;

    if (!this.freeze) {
      this.renderer.setRenderTarget(this.rtPrev);
      this.renderer.render(this.copyScene, this.quadCamera);
    }

    this.renderer.setRenderTarget(null);
    this.renderer.render(this.compositeScene, this.quadCamera);
  }

  /** 씬 패스 실측 드로우콜·삼각형 (합성 패스 제외). 성능 예산 판정 기준. */
  get info(): { calls: number; triangles: number } {
    return { calls: this.sceneCalls, triangles: this.sceneTriangles };
  }

  dispose(): void {
    this.rtA.dispose();
    this.rtPrev.dispose();
    this.renderer.dispose();
  }
}

