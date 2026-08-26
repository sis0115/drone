// Three.js 씬 생성 코드가 Node 에서 돌게 하는 최소 DOM 스텁.
// 캔버스 2D 는 프로시저럴 텍스처가 쓰므로 **실제로 픽셀을 담는** 스텁이 필요하다
// (createImageData/putImageData 가 no-op 이면 텍스처 생성이 조용히 깨진다).
export function installDomStubs() {
  const ctx2d = () => ({
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
    putImageData() {}, clearRect() {}, beginPath() {}, moveTo() {}, lineTo() {},
    quadraticCurveTo() {}, stroke() {}, fill() {}, fillRect() {}, ellipse() {}, arc() {},
    strokeRect() {}, closePath() {}, save() {}, restore() {}, translate() {}, rotate() {},
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
    set lineCap(v) {}, get lineCap() { return 'butt'; },
    set strokeStyle(v) {}, get strokeStyle() { return '#000'; },
    set fillStyle(v) {}, get fillStyle() { return '#000'; },
    set lineWidth(v) {}, get lineWidth() { return 1; },
  });

  const el = () => ({
    style: {}, dataset: {}, innerHTML: '', textContent: '', value: '',
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    appendChild() {}, addEventListener() {}, removeEventListener() {},
    setAttribute() {}, getAttribute: () => null,
    querySelector: () => el(), querySelectorAll: () => [],
  });

  const store = {};
  globalThis.document = {
    createElement: (t) => (t === 'canvas' ? { width: 0, height: 0, getContext: ctx2d } : el()),
    createElementNS: () => el(),
    getElementById: (id) => (store[id] ??= el()),
    querySelector: () => el(),
    querySelectorAll: () => [],
    documentElement: el(),
  };
  globalThis.window ??= globalThis;
  globalThis.innerWidth = 1280;
  globalThis.innerHeight = 720;
  globalThis.addEventListener ??= () => {};
  globalThis.requestAnimationFrame ??= () => 0;
  globalThis.performance ??= { now: () => 0 };
}
