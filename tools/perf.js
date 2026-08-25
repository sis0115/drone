const fs=require('fs');const THREE=require('three');
const path=require('path');
// 프로토타입 경로는 리포지토리 기준으로 해석한다 (핸드오프 당시의 절대경로 대체).
const PROTOTYPE=process.env.SLFPV_PROTOTYPE||path.join(__dirname,'..','prototype','signal_lost_fpv.html');
function fakeCtx(){return{createRadialGradient:()=>({addColorStop(){}}),createLinearGradient:()=>({addColorStop(){}}),createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4),width:w,height:h}),
 putImageData(){},clearRect(){},beginPath(){},moveTo(){},lineTo(){},quadraticCurveTo(){},stroke(){},
 fill(){},fillRect(){},ellipse(){},arc(){},strokeRect(){},closePath(){},save(){},restore(){},
 set strokeStyle(v){},get strokeStyle(){return'#000'},set fillStyle(v){},get fillStyle(){return'#000'},
 set lineWidth(v){},get lineWidth(){return 1},set lineCap(v){},get lineCap(){return'butt'}};}
const els={};
global.document={createElement:t=>t==='canvas'?{width:0,height:0,getContext:()=>fakeCtx()}:
 {style:{},classList:{add(){},remove(){},toggle(){},contains(){return false}},appendChild(){},
  addEventListener(){},querySelectorAll:()=>[],innerHTML:'',textContent:''},
 getElementById:id=>els[id]||(els[id]={style:{},classList:{add(){},remove(){},toggle(){},contains(){return false}},
  appendChild(){},addEventListener(){},querySelectorAll:()=>[],innerHTML:'',textContent:'',value:'',dataset:{},
  setAttribute(){},getAttribute(){}}),
 createElementNS:()=>({setAttribute(){},appendChild(){},innerHTML:'',style:{}}),querySelectorAll:()=>[]};
global.window=global;global.innerWidth=1280;global.innerHeight=720;
global.addEventListener=()=>{};global.requestAnimationFrame=()=>{};global.performance={now:()=>0};
global.THREE=THREE;
const html=fs.readFileSync(PROTOTYPE,'utf8');
let code=html.match(/<script>\n\(function\(\)\{([\s\S]*?)\n\}\)\(\);\n<\/script>/)[1];
code=code.replace(/const renderer=new THREE\.WebGLRenderer\([\s\S]*?\);/,'const renderer={setPixelRatio(){},setSize(){},setRenderTarget(){},render(){},domElement:{},shadowMap:{}};');
code=code.replace(/renderer\.shadowMap\.enabled=true;[\s\S]*?PCFSoftShadowMap;/,'');
code=code.replace(/wrap\.insertBefore\(.*?\);/,'');
code=code.replace(/new THREE\.WebGLRenderTarget\([^)]*\)/g,'{texture:new THREE.Texture()}');
code=code.replace(/buildPanel\(\);[\s\S]*?requestAnimationFrame\(loop\);/,'global.__S=scene;');
new Function(code)();
const scene=global.__S;
let dc=0,tri=0,inst=0;
scene.traverse(o=>{
  if(o.isInstancedMesh){dc++;inst+=o.count;
    const g=o.geometry;const t=(g.index?g.index.count:g.attributes.position.count)/3;
    tri+=t*o.count;}
  else if(o.isMesh){dc++;const g=o.geometry;
    tri+=(g.index?g.index.count:g.attributes.position.count)/3;}
  else if(o.isLine||o.isLineSegments){dc++;}
});
console.log('드로우콜   : '+dc+'   (예산 <120 → '+(dc<120?'✅ 통과':'⚠ 초과')+')');
console.log('삼각형     : '+(tri/1000).toFixed(0)+'k');
console.log('인스턴스 총: '+inst.toLocaleString());
console.log('씬 오브젝트: '+scene.children.length);
// npm run verify 가 예산 초과를 실패로 잡도록 종료 코드를 세운다.
if(dc>=120){process.exitCode=1;}
