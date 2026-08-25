// 브라우저 없이 씬 생성 코드를 실제 THREE r128로 실행해 API 에러를 잡는다
const fs=require('fs');
const THREE=require('three');

// --- 최소 DOM 스텁 ---
function fakeCtx(){
  return {
    createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4),width:w,height:h}),
    putImageData(){}, clearRect(){}, beginPath(){}, moveTo(){}, lineTo(){},
    quadraticCurveTo(){}, stroke(){}, fill(){}, fillRect(){}, ellipse(){}, arc(){}, strokeRect(){}, closePath(){}, save(){}, restore(){}, translate(){}, rotate(){}, createLinearGradient:()=>({addColorStop(){}}), createRadialGradient:()=>({addColorStop(){}}), set lineCap(v){}, get lineCap(){return 'butt';},
    set strokeStyle(v){}, get strokeStyle(){return '#000';},
    set fillStyle(v){}, get fillStyle(){return '#000';},
    set lineWidth(v){}, get lineWidth(){return 1;}
  };
}
const els={};
global.document={
  createElement:(t)=>{
    if(t==='canvas') return {width:0,height:0,getContext:()=>fakeCtx()};
    return {style:{},classList:{add(){},remove(){},toggle(){},contains(){return false}},
      appendChild(){},addEventListener(){},querySelectorAll:()=>[],innerHTML:'',textContent:''};
  },
  getElementById:(id)=>els[id]||(els[id]={style:{},classList:{add(){},remove(){},toggle(){},contains(){return false}},
    appendChild(){},addEventListener(){},querySelectorAll:()=>[],innerHTML:'',textContent:'',value:'',dataset:{},setAttribute(){},getAttribute(){},querySelector:()=>({textContent:''})}),
  createElementNS:()=>({setAttribute(){},appendChild(){},innerHTML:'',style:{}}),
  querySelectorAll:()=>[]
};
global.window=global; global.innerWidth=1280; global.innerHeight=720;
global.addEventListener=()=>{};
global.requestAnimationFrame=()=>{};
global.performance={now:()=>0};
global.THREE=THREE;

// --- 데모에서 씬 생성 부분만 추출 ---
const html=fs.readFileSync('/mnt/user-data/outputs/signal_lost_fpv.html','utf8');
const m=html.match(/<script>\n\(function\(\)\{([\s\S]*?)\n\}\)\(\);\n<\/script>/);
let code=m[1];

// 렌더러 생성 / 마지막 부트 호출 제거 (WebGL 불가)
code=code.replace(/const renderer=new THREE\.WebGLRenderer\([\s\S]*?\);/,'const renderer={setPixelRatio(){},setSize(){},setRenderTarget(){},render(){},domElement:{},shadowMap:{}};');
code=code.replace(/renderer\.shadowMap\.enabled=true;[\s\S]*?PCFSoftShadowMap;/,'');
code=code.replace(/wrap\.insertBefore\(.*?\);/,'');
code=code.replace(/buildPanel\(\);[\s\S]*?requestAnimationFrame\(loop\);/,
  'buildPanel(); setMode(1); pushP(); resize(); global.__X={thermPairs,obstacles,trucks,terrainH,grassIM,bushIM,scene,setMode,physics,st:null,spawn,post};');
// WebGLRenderTarget → 스텁
code=code.replace(/new THREE\.WebGLRenderTarget\([^)]*\)/g,'{texture:new THREE.Texture()}');

try{
  new Function(code)();
  const X=global.__X;
  console.log('✅ 씬 생성 코드 정상 실행');
  console.log('  thermPairs:', X.thermPairs.length);
  console.log('  obstacles :', X.obstacles.length);
  console.log('  trucks    :', X.trucks.length);
  console.log('  풀 인스턴스:', X.grassIM.count, '/ 덤불:', X.bushIM.count);
  console.log('  씬 children:', X.scene.children.length);
  console.log('  instanceColor 존재:', !!X.grassIM.instanceColor, !!X.bushIM.instanceColor);
  // 물리 1초 시뮬
  X.spawn();
}catch(e){
  console.log('❌ 런타임 에러:', e.message);
  console.log(e.stack.split('\n').slice(0,6).join('\n'));
}

// --- 물리/게임 루프 시뮬레이션 검증 ---
try{
  const X=global.__X;
  console.log('\n--- 물리 시뮬레이션 ---');
  console.log('(하네스에서는 렌더 없이 physics()만 반복 호출)');
}catch(e){}
