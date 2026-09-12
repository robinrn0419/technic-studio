import {toast} from './toast.js';
import {Ask} from './dialogs.js';
import {syncHowto} from './howto.js';
import './feedback.js';
import {MOD,TH,R,HOLE,DEFS,CATS,KEYS_BY_CAT,SHORT,cbDia,cbDep,thumb,barSolidSpec,partPieces,setSkipCuts} from './geometry.js';
import {dl,trisOf,writeSTL,auditTris,loadManifold,getMF,unionTris} from './stl-export.js';

(function(){
'use strict';
if(typeof THREE==='undefined'){
  showFail('three.js 沒載入','第一次開啟需要網路載入 3D 函式庫。連上網路後重新整理，之後會有快取。');
  return;
}
const V3=(x,y,z)=>new THREE.Vector3(x,y,z);
const Q=()=>new THREE.Quaternion();
const el=id=>document.getElementById(id);

/* ── 場景 ── */
const stage=el('stage');
const scene=new THREE.Scene();
scene.background=new THREE.Color(0x2b2d33);
const camera=new THREE.PerspectiveCamera(40,1,1,6000);
const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
stage.appendChild(renderer.domElement);
const cv=renderer.domElement;

scene.add(new THREE.HemisphereLight(0xffffff,0x3a3d44,0.85));
const k1=new THREE.DirectionalLight(0xffffff,0.75);k1.position.set(90,130,120);scene.add(k1);
const k2=new THREE.DirectionalLight(0xbdd0ea,0.25);k2.position.set(-110,-70,-60);scene.add(k2);
const grid=new THREE.GridHelper(MOD*40,40,0x4a4d55,0x363940);
grid.rotation.x=Math.PI/2;scene.add(grid);
const world=new THREE.Group();scene.add(world);
const markers=new THREE.Group();scene.add(markers);
const gizmo=new THREE.Group();gizmo.visible=false;scene.add(gizmo);

const SIDE={side:THREE.DoubleSide,roughness:.6};
const MATS={};
function matFor(c){if(!MATS[c])MATS[c]=new THREE.MeshStandardMaterial(Object.assign({color:c},SIDE));return MATS[c];}
const MAT_BRACE=new THREE.MeshStandardMaterial(Object.assign({color:0xd4d6d9},SIDE));
const MAT_SEL=new THREE.MeshStandardMaterial(Object.assign({color:0x4a80d9,emissive:0x4a80d9,emissiveIntensity:0.16},SIDE));
const MAT_GHOST=new THREE.MeshStandardMaterial(Object.assign(
  {color:0x6fa8f5,transparent:true,opacity:0.45,depthWrite:false},SIDE));
const MAT_GHOST_FREE=new THREE.MeshStandardMaterial(Object.assign(
  {color:0x8d8f94,transparent:true,opacity:0.28,depthWrite:false},SIDE));
const partMat=p=>p.pending?(p.link?MAT_GHOST:MAT_GHOST_FREE)
  :(p.kind==='brace'?MAT_BRACE:matFor(DEFS[p.defKey].col));

const REDUCE_MO=!!(window.matchMedia&&matchMedia('(prefers-reduced-motion:reduce)').matches);

/* ── 接合／放下的漣漪回饋（獨立網格，不碰零件狀態） ── */
const RING_GEO=new THREE.RingGeometry(0.72,1,48);
const DISC_GEO=new THREE.CircleGeometry(1,40);
const pulses=[];
function _ring(pos,axis,geo,o0,grow,dur,delay,col){
  const m=new THREE.Mesh(geo,new THREE.MeshBasicMaterial(
    {color:col||0x7ab0ff,transparent:true,opacity:0,side:THREE.DoubleSide,depthWrite:false}));
  m.position.copy(pos);
  if(axis)m.quaternion.setFromUnitVectors(V3(0,0,1),axis.clone().normalize());
  m.scale.setScalar(0.01); m.renderOrder=990; scene.add(m);
  pulses.push({m,t0:performance.now()+(delay||0),o0,grow,dur});
}
function pulseAt(pos,axis){
  if(REDUCE_MO||!pos)return;
  _ring(pos,axis,DISC_GEO,0.28,4,220,0,0x9fc6ff);      // 中心一閃
  _ring(pos,axis,RING_GEO,0.6,9,380,0,0x7ab0ff);       // 一圈回饋，就這樣，快速確實
}
function stepPulses(){
  const now=performance.now();
  for(let i=pulses.length-1;i>=0;i--){
    const a=pulses[i];
    if(now<a.t0)continue;
    const p=Math.min(1,(now-a.t0)/a.dur),e=1-Math.pow(1-p,3);
    a.m.scale.setScalar(1+e*a.grow);
    a.m.material.opacity=a.o0*(1-p);
    if(p>=1){scene.remove(a.m);a.m.material.dispose();pulses.splice(i,1);}
  }
}

/* ── 相機 ── */
const cam={theta:-0.92,phi:1.0,dist:210,target:V3()};
function applyCam(){
  const sp=Math.sin(cam.phi),cp=Math.cos(cam.phi);
  camera.position.set(cam.target.x+cam.dist*sp*Math.cos(cam.theta),
                      cam.target.y+cam.dist*sp*Math.sin(cam.theta),
                      cam.target.z+cam.dist*cp);
  camera.up.set(0,0,1);camera.lookAt(cam.target);
}
/* 相機補間：fitView / 視角切換用滑順過場，拖曳與滾輪維持即時 */
let camAnim=null;
function tweenCam(to,dur){
  if(REDUCE_MO){camAnim=null;cam.theta=to.theta;cam.phi=to.phi;cam.dist=to.dist;
    cam.target.copy(to.target);applyCam();return;}
  camAnim={a:{theta:cam.theta,phi:cam.phi,dist:cam.dist,target:cam.target.clone()},
           b:{theta:to.theta,phi:to.phi,dist:to.dist,target:to.target.clone()},
           t0:performance.now(),dur:dur||420};
}
function stepCam(){
  if(!camAnim)return;
  const p=Math.min(1,(performance.now()-camAnim.t0)/camAnim.dur);
  // easeInOutCubic：相機是畫面上的東西在動，不是進退場，兩頭都緩
  const e=p<0.5?4*p*p*p:1-Math.pow(-2*p+2,3)/2;
  const a=camAnim.a,b=camAnim.b;
  let dth=b.theta-a.theta; dth=((dth%(2*Math.PI))+3*Math.PI)%(2*Math.PI)-Math.PI;
  cam.theta=a.theta+dth*e;
  cam.phi=Math.max(0.02,Math.min(Math.PI-0.02,a.phi+(b.phi-a.phi)*e));
  cam.dist=Math.max(20,a.dist+(b.dist-a.dist)*e);
  cam.target.lerpVectors(a.target,b.target,e);
  applyCam();
  if(p>=1)camAnim=null;
}
const VIEWS={iso:[-0.92,1.0],top:[-Math.PI/2,0.02],front:[-Math.PI/2,Math.PI/2]};
function setView(k){const v=VIEWS[k];if(!v)return;
  tweenCam({theta:v[0],phi:v[1],dist:cam.dist,target:cam.target.clone()},380);
  document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('on',b.dataset.view===k));}
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>setView(b.dataset.view));

/* ── 狀態 ── */
let parts=[],nextId=1,selPart=null,sel=[],spawnN=0,hoverKey=null,step=Math.PI/4;
const used=new Set();
const byId=id=>parts.find(p=>p.id===id);
// 斜撐的兩個孔各有正反兩面：貼在母件上的那面被佔用，另一面可以接東西
function braceSockets(p){
  const h=(p.span||16)/2;
  return [{pos:[-h,0, TH/2],axis:[0,0, 1]},{pos:[-h,0,-TH/2],axis:[0,0,-1]},
          {pos:[ h,0, TH/2],axis:[0,0, 1]},{pos:[ h,0,-TH/2],axis:[0,0,-1]}];
}
const socketsOf=p=>(p.kind==='brace')?braceSockets(p):DEFS[p.defKey].sockets;
const nHoles=p=>socketsOf(p).length/2;
function partOfObj(o){while(o&&!o.userData.pid)o=o.parent;return o?byId(o.userData.pid):null;}
function rootOf(p){let o=p.obj;while(o.parent&&o.parent!==world)o=o.parent;return partOfObj(o);}
function jointOf(p){
  let o=p.obj;
  while(o&&o!==world){
    const q=o.userData.pid?byId(o.userData.pid):null;
    if(q&&q.link)return q;
    o=o.parent;}
  return rootOf(p);
}
function nameOf(p){return p.kind==='brace'?('斜撐 '+p.span.toFixed(1)+' mm'):DEFS[p.defKey].name;}
// 一個孔有正反兩面，一根長插銷可以兩邊各接一支樑 → 兩面都佔滿才算滿
const faceUsed=(p,i)=>used.has(p.id+':'+i)||contactFaces.has(p.id+':'+i);
const holeUsed=(p,h)=>faceUsed(p,2*h)&&faceUsed(p,2*h+1);
function holeMode(p,h){
  if(p.kind==='brace')return 'auto';
  const d=DEFS[p.defKey]; if(!d||!d.holeKeys)return 'auto';
  return (p.hmode&&p.hmode[d.holeKeys[h]])||'auto';
}
function setHoleMode(p,h,mode){
  const d=DEFS[p.defKey]; if(!d||!d.holeKeys)return;
  if(!p.hmode)p.hmode={};
  p.hmode[d.holeKeys[h]]=mode;
  buildMeshes(p);
}
const holeHalf=(p,h)=>faceUsed(p,2*h)||faceUsed(p,2*h+1);

/* 顯示用幾何只跟 (零件種類 · 孔型 · 跨距 · 沉孔尺寸 · 側孔是否已挖) 有關，
   跟位置/旋轉/接合無關。快取起來 —— 開專案時 restore 會對每個零件呼叫
   buildMeshes，若每次都重算，含側孔的零件會逐一跑 manifold 布林運算，
   幾個零件就卡好幾秒。快取後同樣的零件設定只算一次。 */
const GEO_CACHE=new Map();
let SKIP_CUTS=false;                          // restore 時先不挖側孔，之後再逐格補
function geoSig(p){
  return p.defKey+':'+(p.hmode?JSON.stringify(p.hmode):'')
       +'|'+cbDia().toFixed(2)+'|'+cbDep().toFixed(2)+'|'+((getMF()&&!SKIP_CUTS)?'m':'-');
}
function buildMeshes(p){
  p.obj.children.filter(o=>o.isMesh).forEach(o=>p.obj.remove(o));
  let pieces;
  if(p.kind==='brace'){                       // 斜撐跨距是連續值又便宜，不快取
    pieces=partPieces(p,HOLE);
  }else{
    const sig=geoSig(p);
    pieces=GEO_CACHE.get(sig);
    if(!pieces){
      pieces=partPieces(p,HOLE);
      GEO_CACHE.set(sig,pieces);
      if(GEO_CACHE.size>400){GEO_CACHE.delete(GEO_CACHE.keys().next().value);}
    }
  }
  pieces.forEach(pc=>p.obj.add(new THREE.Mesh(pc.geo,partMat(p))));
}
function socketWorld(p,idx){
  const s=socketsOf(p)[idx],q=p.obj.getWorldQuaternion(Q());
  return {pos:V3().fromArray(s.pos).applyMatrix4(p.obj.matrixWorld),
          axis:V3().fromArray(s.axis).applyQuaternion(q).normalize()};
}
// 一個孔 = 一根軸：中心點與軸向
function holeWorld(p,h){
  const a=socketWorld(p,2*h),b=socketWorld(p,2*h+1);
  return {pos:a.pos.clone().add(b.pos).multiplyScalar(0.5),axis:a.axis.clone(),
          plus:a,minus:b};
}
// 依「朝向哪一邊」挑貼合面
function isMale(p,h){
  const ss=socketsOf(p); const s=ss[2*h];
  return !!(s&&s.male);
}
function faceToward(p,h,dir){
  const w=holeWorld(p,h);
  let a = w.axis.dot(dir)>=0 ? 2*h : 2*h+1;
  if(faceUsed(p,a)&&!faceUsed(p,a^1)) a^=1;   // 那一面滿了就走另一面
  return a;
}

/* ── 歷程 ── */
let history=[],future=[];
function snapshot(){
  return JSON.stringify({nextId:nextId,spawnN:spawnN,parts:parts.map(p=>{
    const free=(p.obj.parent===world)&&!p.link;
    return {id:p.id,kind:p.kind,defKey:p.defKey,span:p.span||16,layer:p.layer||0,
      hmode:p.hmode?JSON.parse(JSON.stringify(p.hmode)):null,
      link:p.link?{hostId:p.link.hostId,hostSocket:p.link.hostSocket,
                   viaId:p.link.viaId,viaSocket:p.link.viaSocket,roll:p.link.roll}:null,
      aRef:p.aRef||null,bRef:p.bRef||null,
      pos:free?p.obj.position.toArray():null,
      rot:free?[p.obj.rotation.x,p.obj.rotation.y,p.obj.rotation.z]:null};})});
}
let histLock=false;
function popHistory(){ if(history.length)history.pop(); }
function pushHistory(){
  if(histLock)return;history.push(snapshot());if(history.length>60)history.shift();
  future.length=0;}                        // 新動作一出現，原本的「重做」就不再成立
let cutGen=0;
function restore(json){
  const s=JSON.parse(json);
  cutGen++;                                   // 取消上一份還沒補完的側孔工作
  while(world.children.length)world.remove(world.children[0]);
  parts=[];used.clear();
  SKIP_CUTS=true;setSkipCuts(true);           // 先用沒側孔的幾何把場景撐起來（快）
  try{
    s.parts.forEach(d=>{
      const p={id:d.id,kind:d.kind,defKey:d.defKey,obj:new THREE.Group(),link:null,
               span:d.span,aRef:d.aRef,bRef:d.bRef,layer:d.layer||0,
               hmode:d.hmode||null};
      p.obj.userData.pid=p.id;buildMeshes(p);world.add(p.obj);
      if(d.pos)p.obj.position.fromArray(d.pos);
      if(d.rot)p.obj.rotation.set(d.rot[0],d.rot[1],d.rot[2]);
      parts.push(p);});
  }finally{ SKIP_CUTS=false;setSkipCuts(false); }
  s.parts.forEach(d=>{if(d.link)byId(d.id).link=d.link;});
  parts.forEach(p=>{if(p.link)applyLink(p);});
  parts.forEach(p=>{
    if(p.link){used.add(p.link.hostId+':'+p.link.hostSocket);
               used.add(p.link.viaId+':'+p.link.viaSocket);}
    if(p.kind==='brace'){used.add(p.aRef.partId+':'+p.aRef.idx);
                         used.add(p.bRef.partId+':'+p.bRef.idx);
                         used.add(p.id+':1');used.add(p.id+':3');}});
  nextId=s.nextId;spawnN=s.spawnN;selPart=null;sel=[];
  SKIP_CUTS=true;setSkipCuts(true);           // syncPinFills 也走無側孔的快版
  try{ layout();refresh(); } finally { SKIP_CUTS=false;setSkipCuts(false); }
  cutSideHolesSoon();                         // 側孔一格補一個，不卡畫面
}
/* restore 之後（或 manifold 剛載好時）把含側孔的零件逐一重建，
   每格一個 requestAnimationFrame，讓瀏覽器有空檔畫面、不會凍住幾秒。
   幾何有快取，所以第二次開同一份專案時這一步幾乎瞬間完成。 */
function cutSideHolesSoon(){
  if(!getMF())return;                         // 模組還沒好；載好時會再呼叫一次
  const mine=cutGen, q=parts.filter(p=>p&&p.kind!=='brace');
  let i=0;
  (function step(){
    if(mine!==cutGen)return;                  // 已經開了別份專案
    if(i>=q.length){layout();scheduleMarkers();refresh();return;}
    const p=q[i++];
    if(parts.indexOf(p)>=0){buildMeshes(p);layout();}
    requestAnimationFrame(step);
  })();
}
function undo(){if(!history.length)return;
  future.push(snapshot());if(future.length>60)future.shift();
  restore(history.pop());refresh();}
function redo(){if(!future.length)return;
  history.push(snapshot());if(history.length>60)history.shift();
  restore(future.pop());refresh();}

/* ── 接合 ── */
function applyLink(root){
  const L=root.link,host=byId(L.hostId),via=byId(L.viaId);
  if(!host||!via)return;
  world.add(root.obj);
  root.obj.position.set(0,0,0);root.obj.quaternion.identity();
  root.obj.updateMatrixWorld(true);
  const rel=via.obj.matrixWorld.clone();
  const sA=socketsOf(host)[L.hostSocket],sB=socketsOf(via)[L.viaSocket];
  const childPos=V3().fromArray(sB.pos).applyMatrix4(rel);
  const childAxis=V3().fromArray(sB.axis)
    .applyQuaternion(Q().setFromRotationMatrix(rel)).normalize();
  const axisA=V3().fromArray(sA.axis).normalize();
  const q=Q().setFromAxisAngle(axisA,L.roll)
    .multiply(Q().setFromUnitVectors(childAxis,axisA.clone().negate()));
  host.obj.add(root.obj);
  root.obj.quaternion.copy(q);
  root.obj.position.copy(V3().fromArray(sA.pos)).sub(childPos.clone().applyQuaternion(q));
  root.obj.updateMatrixWorld(true);
}
function bestRoll(root,L){
  const host=byId(L.hostId),via=byId(L.viaId);
  if(!host||!via)return 0;
  const Qcur=root.obj.getWorldQuaternion(Q()),Qhost=host.obj.getWorldQuaternion(Q());
  const par=root.obj.parent,sp=root.obj.position.clone(),sq=root.obj.quaternion.clone();
  world.add(root.obj);
  root.obj.position.set(0,0,0);root.obj.quaternion.identity();
  root.obj.updateMatrixWorld(true);
  const rel=via.obj.matrixWorld.clone();
  const sB=socketsOf(via)[L.viaSocket];
  const childAxis=V3().fromArray(sB.axis)
    .applyQuaternion(Q().setFromRotationMatrix(rel)).normalize();
  const axisA=V3().fromArray(socketsOf(host)[L.hostSocket].axis).normalize();
  const q0=Q().setFromUnitVectors(childAxis,axisA.clone().negate());
  if(par)par.add(root.obj);
  root.obj.position.copy(sp);root.obj.quaternion.copy(sq);
  root.obj.updateMatrixWorld(true);
  const qd=Qhost.clone().invert().multiply(Qcur).multiply(q0.clone().invert());
  const th=2*Math.atan2(V3(qd.x,qd.y,qd.z).dot(axisA),qd.w);
  return isFinite(th)?th:0;
}
function asmSize(root){let n=0;parts.forEach(q=>{if(rootOf(q).id===root.id)n++;});return n;}
function doJoin(){
  if(sel.length!==2)return;
  let s0=sel[0], s1=sel[1];
  // 永遠搬零件數較少的那一邊，避免整個組合體被拉去遷就一根散件
  if(asmSize(rootOf(byId(s0.partId)))<asmSize(rootOf(byId(s1.partId)))){
    const t=s0;s0=s1;s1=t;
  }
  const pA=byId(s0.partId),pB=byId(s1.partId),rB=rootOf(pB);
  if(rootOf(pA).id===rB.id)return;
  const wA=holeWorld(pA,s0.hole),wB=holeWorld(pB,s1.hole);
  const dirAB=V3().subVectors(wB.pos,wA.pos);
  if(dirAB.lengthSq()<1e-6)dirAB.copy(wA.axis);
  pushHistory();
  rB.link={hostId:pA.id,hostSocket:faceToward(pA,s0.hole,dirAB),
           viaId:pB.id,viaSocket:faceToward(pB,s1.hole,dirAB.clone().negate()),roll:0};
  let r=bestRoll(rB,rB.link);
  if(step>0)r=Math.round(r/step)*step;
  rB.link.roll=r;
  used.add(rB.link.hostId+':'+rB.link.hostSocket);
  used.add(rB.link.viaId+':'+rB.link.viaSocket);
  applyLink(rB);selPart=rB.id;sel=[];layout();refresh();
  const wj=holeWorld(pA,s0.hole);pulseAt(wj.pos,wj.axis);
}
/* 連續接合：接完之後把選取移到新零件的下一個空孔，
   這樣可以「挑零件→挑零件→挑零件」一路接下去 */
function selectNextFreeHole(p){
  if(!p)return false;
  const n=nHoles(p);
  for(let h=0;h<n;h++){
    if(holeUsed(p,h))continue;
    if(holeMode(p,h)==='solid'||holeMode(p,h)==='pfill')continue;
    if(pinBusy.has(p.id+'#'+h))continue;
    sel=[{partId:p.id,hole:h}];refresh();return true;
  }
  return false;
}
function detach(p){
  const r=jointOf(p); if(!r||!r.link)return;
  pushHistory();
  used.delete(r.link.hostId+':'+r.link.hostSocket);
  used.delete(r.link.viaId+':'+r.link.viaSocket);
  r.link=null;
  const wp=r.obj.getWorldPosition(V3()),wq=r.obj.getWorldQuaternion(Q());
  world.add(r.obj);r.obj.position.copy(wp).add(V3(0,-30,0));r.obj.quaternion.copy(wq);
  r.layer=Math.round(r.obj.position.z/TH);
  layout();refresh();
}

/* ── 斜撐 ── */
function braceSolve(a,b){
  const A=byId(a.partId),B=byId(b.partId); if(!A||!B)return null;
  const wa=socketWorld(A,a.idx),wb=socketWorld(B,b.idx);
  const n=wa.axis.clone(),v=V3().subVectors(wb.pos,wa.pos);
  const off=v.dot(n),vp=v.clone().addScaledVector(n,-off);
  return {wa:wa,n:n,vp:vp,d:vp.length(),off:Math.abs(off),par:Math.abs(wa.axis.dot(wb.axis))};
}
function braceRefs(){
  const pA=byId(sel[0].partId),pB=byId(sel[1].partId);
  const wA=holeWorld(pA,sel[0].hole);
  const toCam=V3().subVectors(camera.position,wA.pos);
  const iA=faceToward(pA,sel[0].hole,toCam);
  const axA=socketWorld(pA,iA).axis;
  const iB=faceToward(pB,sel[1].hole,axA);
  return [{partId:pA.id,idx:iA},{partId:pB.id,idx:iB}];
}
function updateBrace(p){
  const s=braceSolve(p.aRef,p.bRef);
  if(!s||s.d<1){p.obj.visible=false;return;}
  p.obj.visible=true;
  const xd=s.vp.clone().normalize(),yd=V3().crossVectors(s.n,xd).normalize();
  p.obj.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xd,yd,s.n));
  p.obj.position.copy(s.wa.pos).addScaledVector(s.vp,0.5).addScaledVector(s.n,TH/2);
  if(Math.abs(s.d-p.span)>0.02){p.span=s.d;buildMeshes(p);}
  p.obj.updateMatrixWorld(true);
}
function addBrace(){
  if(sel.length!==2)return;
  pushHistory();
  const rf=braceRefs();
  const p={id:nextId++,kind:'brace',defKey:null,obj:new THREE.Group(),
           span:16,link:null,aRef:rf[0],bRef:rf[1],layer:0};
  p.obj.userData.pid=p.id;buildMeshes(p);world.add(p.obj);
  used.add(rf[0].partId+':'+rf[0].idx);used.add(rf[1].partId+':'+rf[1].idx);
  used.add(p.id+':1');used.add(p.id+':3');   // 斜撐貼在母件上的那兩面
  parts.push(p);selPart=p.id;sel=[];layout();refresh();
}

/* ── 放置預覽：零件跟著滑鼠，吸附到最近的孔，再點一下才確定 ── */
let ghost=null;            // 暫定零件的 id
let ghostSnap=null;        // 目前吸附到的孔 {partId,hole}
let ghostHole=null;        // 自動選出的對位孔（離游標最近）
let ghostFlip=false;       // 正反面：決定凸銷朝上或朝下
let ghostRoll=0;           // 繞軸角度，滾輪控制
let ghostEvt=null;         // 最後一次滑鼠事件，滾輪時重算用

// 零件上所有可以拿來對位的孔
function usableHoles(p){
  const out=[],n=nHoles(p);
  for(let i=0;i<n;i++) if(holeMode(p,i)!=='solid') out.push(i);
  return out.length?out:[0];
}
// 孔的朝向類型：正面孔/公頭沿樑的扁平面法線（軸向 z 分量大），側孔/側凸銷
// 沿樑寬度方向貫穿（軸向落在 xy 平面）。吸附配對時不能把這兩種混在一起比
// 距離——面孔跟側孔就算位置靠近，插入方向也完全不同，硬湊在一起只會讓
// 零件吸到一個朝向莫名其妙的地方。
function holeKind(p,h){
  const s=socketsOf(p)[2*h];
  return (s&&Math.abs(s.axis[2])>0.5)?'face':'side';
}

// 收集游標附近所有可用的空孔（含世界座標與孔的朝向類型）
function freeHolesNearRay(maxD2){
  const out=[];
  parts.forEach(q=>{
    if(q.pending||!q.obj.visible||q.kind==='brace')return;
    const n=nHoles(q);
    for(let h=0;h<n;h++){
      if(holeUsed(q,h))continue;
      const m=holeMode(q,h); if(m==='solid'||m==='pfill')continue;
      if(pinBusy.has(q.id+'#'+h))continue;
      const w=holeWorld(q,h);
      if(ray.ray.distanceSqToPoint(w.pos)<maxD2)
        out.push({partId:q.id,hole:h,pos:w.pos.clone(),kind:holeKind(q,h)});
    }
  });
  return out;
}
function updateGhost(e){
  const g=ghost?byId(ghost):null; if(!g)return;
  if(e){ghostEvt=e;setRay(e);} else if(ghostEvt){setRay(ghostEvt);} else return;

  // 吸附距離跟著鏡頭遠近縮放，維持大約固定的「螢幕感覺」而不是死的世界座標 mm——
  // 常見 3D/CAD 工具（Blender、ArcGIS 等）的 snap tolerance 都是用螢幕像素定義，
  // 不是固定世界距離；這裡沒有直接算螢幕投影，改用鏡頭距離近似：210mm 是預設
  // 鏡頭距離，15mm 吸附半徑是那個距離下調出來的手感基準，拉近鏡頭時吸附範圍跟著
  // 縮小、拉遠時跟著放大，避免「放大看零件時吸到很遠的孔」。
  const zoomK=cam.dist/210;
  const searchD2=Math.max(400,Math.min(10000,2500*zoomK*zoomK));
  const snapD2=Math.max(36,Math.min(900,225*zoomK*zoomK));

  const cand=freeHolesNearRay(searchD2);    // 候選孔搜尋半徑
  let tgt=null, pick=null;
  if(cand.length){
    // 側孔跟正面孔分開找游標正下方最近的那個，只在零件自己也有同類型的孔時
    // 才算數——避免零件身上一個正面孔硬去配旁邊零件一個側孔，兩者插入方向
    // 完全不同，湊在一起只會讓朝向亂跳。兩種都找得到就選離游標比較近的那個。
    const gHoles=usableHoles(g);
    const gKinds=new Set(gHoles.map(gh=>holeKind(g,gh)));
    const byKind={face:[],side:[]};
    cand.forEach(c=>{(byKind[c.kind]||byKind.face).push(c);});
    let ref=null,refD=Infinity;
    ['face','side'].forEach(kind=>{
      if(!gKinds.has(kind)||!byKind[kind].length)return;
      const r=byKind[kind].reduce((a,b)=>
        ray.ray.distanceSqToPoint(a.pos)<=ray.ray.distanceSqToPoint(b.pos)?a:b);
      const d=ray.ray.distanceSqToPoint(r.pos);
      if(d<refD){refD=d;ref=r;}
    });
    if(ref){
    const nrm=camera.getWorldDirection(V3()).clone();
    const pl=new THREE.Plane().setFromNormalAndCoplanarPoint(nrm,ref.pos);
    const hit=V3();
    if(ray.ray.intersectPlane(pl,hit)){
      if(g.link){g.link=null;world.add(g.obj);}
      g.obj.position.copy(hit);
      g.obj.quaternion.setFromAxisAngle(V3(0,0,1),ghostRoll);
      g.obj.updateMatrixWorld(true);
      // 吸附目標固定是 ref（游標正下方那個孔）——零件只挑自己「同類型」的孔
      // 去對齊 ref，不要整個零件、整片候選孔一起搜「全域最近的一對」。之前
      // 那樣搜，常常是零件上其他孔跟旁邊另一個候選孔剛好更近，於是吸到游標
      // 底下以外的孔，使用者完全猜不到會吸到哪裡。
      let bd=1e9;
      gHoles.forEach(gh=>{
        if(holeKind(g,gh)!==ref.kind)return;
        const d=holeWorld(g,gh).pos.distanceToSquared(ref.pos);
        if(d<bd){bd=d;pick=gh;}
      });
      tgt=ref;
      if(bd>snapD2){tgt=null;pick=null;}
    }
    }
  }
  if(tgt){
    ghostSnap=tgt;ghostHole=pick;
    const host=byId(tgt.partId);
    // 朝向鏡頭的方向固定用鏡頭本身的視線方向，不要用「這個孔的世界座標到鏡頭」
    // 算——後者每換一個孔位置就不一樣，即使兩個孔在同一支零件、同一個面上，
    // 算出來的方向也會有微小差異，靠近垂直視角時這個差異足以讓 dot product
    // 變號，導致吸附換孔的瞬間零件整個朝向跳一下。鏡頭視線方向對同一幀裡的
    // 每個孔都一樣，只有實際轉鏡頭才會變，手感穩定很多。
    const toCam=camera.getWorldDirection(V3()).negate();
    const via=faceToward(g,pick,toCam.clone().negate());
    g.link={hostId:host.id,hostSocket:faceToward(host,tgt.hole,toCam),
            viaId:g.id,
            viaSocket:ghostFlip?(via^1):via,     // 正反面：凸銷朝上或朝下
            roll:ghostRoll};
    applyLink(g);
    el('ghostvar').textContent='繞軸 '+Math.round(ghostRoll*180/Math.PI)+'°';
  } else {
    if(ghostSnap){ghostSnap=null;g.link=null;world.add(g.obj);}
    ghostHole=null;
    el('ghostvar').textContent='自由擺放　·　繞軸 '+
      Math.round(ghostRoll*180/Math.PI)+'°';
    // 沒有可吸附的孔：貼著 z=0 平面跟著滑鼠，滾輪一樣能轉
    const pl=new THREE.Plane(V3(0,0,1),0),hit=V3();
    if(ray.ray.intersectPlane(pl,hit))g.obj.position.copy(hit);
    g.obj.quaternion.setFromAxisAngle(V3(0,0,1),ghostRoll);
  }
  g.obj.children.forEach(o=>{if(o.isMesh)o.material=partMat(g);});
  layout();scheduleMarkers();
}
function startGhost(defKey){
  cancelGhost();
  pushHistory();
  const p={id:nextId++,kind:DEFS[defKey].kind,defKey:defKey,
           obj:new THREE.Group(),link:null,layer:0,pending:true};
  p.obj.userData.pid=p.id;buildMeshes(p);
  world.add(p.obj);parts.push(p);
  ghost=p.id;ghostSnap=null;ghostHole=null;ghostFlip=false;ghostRoll=0;ghostEvt=null;
  p.obj.children.forEach(o=>{if(o.isMesh)o.material=partMat(p);});
  el('ghosthint').classList.add('show');
  el('trash').classList.add('on');
  layout();refresh();
}
// 游標是否落在垃圾桶上
function overTrash(e){
  if(!e)return false;
  const t=el('trash'); if(!t.classList.contains('on'))return false;
  const r=t.getBoundingClientRect();
  return e.clientX>=r.left&&e.clientX<=r.right&&e.clientY>=r.top&&e.clientY<=r.bottom;
}
function trashHover(e){
  const t=el('trash');
  t.classList.toggle('open',overTrash(e));
}
function commitGhost(){
  const g=ghost?byId(ghost):null; if(!g)return false;
  g.pending=false;
  if(g.link){used.add(g.link.hostId+':'+g.link.hostSocket);
             used.add(g.link.viaId+':'+g.link.viaSocket);}
  else g.layer=Math.round(g.obj.position.z/TH);
  const hostLink=g.link&&byId(g.link.hostId);
  ghost=null;ghostSnap=null;selPart=g.id;sel=[];
  el('ghosthint').classList.remove('show');
  el('trash').classList.remove('on','open');
  if(parts.length===1)fitView();
  layout();refresh();
  if(hostLink){const s=socketWorld(g,g.link.viaSocket);pulseAt(s.pos,s.axis);}
  else pulseAt(g.obj.getWorldPosition(V3()),V3(0,0,1));
  return true;
}
function cancelGhost(){
  const g=ghost?byId(ghost):null;
  ghost=null;ghostSnap=null;
  el('ghosthint').classList.remove('show');
  el('trash').classList.remove('on','open');
  if(!g)return;
  const i=parts.indexOf(g); if(i>=0)parts.splice(i,1);
  if(g.obj.parent)g.obj.parent.remove(g.obj);
  popHistory();
  layout();refresh();
}

/* ── 新增／刪除 ── */
function addPart(defKey){
  pushHistory();
  const p={id:nextId++,kind:DEFS[defKey].kind,defKey:defKey,
           obj:new THREE.Group(),link:null,layer:0};
  p.obj.userData.pid=p.id;buildMeshes(p);
  const col=spawnN%4,row=Math.floor(spawnN/4);
  p.obj.position.set(col*40-56,-56-row*16,0);spawnN++;
  world.add(p.obj);parts.push(p);
  // 若目前正選著一個空孔，新零件直接接上去，省掉「生成→搬運→對位」
  const anchor=(sel.length===1)?sel[0]:null;
  if(anchor&&byId(anchor.partId)){
    const host=byId(anchor.partId);
    const hn=nHoles(p);
    let hh=0;                                  // 用新零件的第一個可用孔
    for(let i=0;i<hn;i++){ if(holeMode(p,i)!=='solid'){hh=i;break;} }
    sel=[anchor,{partId:p.id,hole:hh}];
    selPart=p.id;
    histLock=true; doJoin(); histLock=false;   // 已在本函式開頭記錄過一次
    selectNextFreeHole(p);                     // 準備好接下一片
    if(parts.length===1)fitView();
    return;
  }
  selPart=p.id;sel=[];
  layout();refresh();
  if(parts.length===1)fitView();
}
function removePart(id){
  const p=byId(id); if(!p)return;
  pushHistory();
  const kill=[];
  p.obj.traverse(o=>{if(o.userData.pid)kill.push(o.userData.pid);});
  parts.forEach(q=>{if(q.kind==='brace'&&
    (kill.indexOf(q.aRef.partId)>=0||kill.indexOf(q.bRef.partId)>=0)&&
    kill.indexOf(q.id)<0)kill.push(q.id);});
  kill.forEach(k=>{
    const q=byId(k); if(!q)return;
    if(q.kind==='brace'){used.delete(q.aRef.partId+':'+q.aRef.idx);
                         used.delete(q.bRef.partId+':'+q.bRef.idx);}
    if(q.link){used.delete(q.link.hostId+':'+q.link.hostSocket);
               used.delete(q.link.viaId+':'+q.link.viaSocket);}});
  if(p.obj.parent)p.obj.parent.remove(p.obj);
  kill.forEach(k=>{const q=byId(k);if(q&&q.obj.parent)q.obj.parent.remove(q.obj);});
  parts=parts.filter(q=>kill.indexOf(q.id)<0);
  selPart=null;sel=[];layout();refresh();
}
function layout(){
  scene.updateMatrixWorld(true);
  parts.filter(p=>p.kind==='brace').forEach(updateBrace);
  scene.updateMatrixWorld(true);
}

/* ── 孔的軸線標記 ── */
const axGeo=new THREE.CylinderGeometry(0.62,0.62,TH+4.4,10);axGeo.rotateX(Math.PI/2);
const hitGeo=new THREE.CylinderGeometry(2.7,2.7,TH+4.4,8);hitGeo.rotateX(Math.PI/2);
const M_AX=new THREE.MeshBasicMaterial({color:0xa9adb5,transparent:true,opacity:.55});
const M_AX_HI=new THREE.MeshBasicMaterial({color:0xffffff});
const M_AX_ON=new THREE.MeshBasicMaterial({color:0x4a80d9});
const M_AX_SOLID=new THREE.MeshBasicMaterial({color:0x6f7681,transparent:true,opacity:.35});
const M_AX_MALE=new THREE.MeshBasicMaterial({color:0xe0a13c,transparent:true,opacity:.75});
const M_HIT=new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false});
let mlist=[],hoverPartId=null;
// 只有「游標停在上面」或「已被選取」的零件才顯示孔軸，避免整個畫面都是線
function visibleParts(){
  const v=new Set();
  if(hoverPartId)v.add(hoverPartId);
  if(selPart)v.add(selPart);
  sel.forEach(x=>v.add(x.partId));
  return v;
}
/* ── 銷與孔的貼合掃描 ─────────────────────────────
   任何公銷的基準面貼合某個孔的開口（位置重合、方向相對），
   該孔即視為被銷佔據 → 幾何填實、不可再接。銷移開自動恢復。 */
let pinBusy=new Set(), contactFaces=new Set();
function syncPinFills(){
  pinBusy=new Set();contactFaces=new Set();
  const want=new Set(), soc=[];
  parts.forEach(p=>{
    if(!p.obj.visible||p.pending)return;
    const ss=socketsOf(p);
    for(let i=0;i<ss.length;i++)
      soc.push({id:p.id,i:i,male:!!ss[i].male,w:socketWorld(p,i)});
  });
  // 空間雜湊：只比對位置本來就相鄰的接點，避免所有接點兩兩比對
  const CELL=0.8, grid=new Map();
  const ck=(x,y,z)=>x+','+y+','+z;
  soc.forEach((e,idx)=>{
    e.cx=Math.round(e.w.pos.x/CELL);
    e.cy=Math.round(e.w.pos.y/CELL);
    e.cz=Math.round(e.w.pos.z/CELL);
    const k=ck(e.cx,e.cy,e.cz);
    let L=grid.get(k); if(!L){L=[];grid.set(k,L);}
    L.push(idx);
  });
  const pairUp=(A,B)=>{
    if(A.id===B.id)return;
    if(A.w.pos.distanceToSquared(B.w.pos)>0.36)return;   // 位置要重合
    if(A.w.axis.dot(B.w.axis)>-0.985)return;             // 方向要相對
    if(A.male&&!B.male){want.add(B.id+'#'+(B.i>>1));pinBusy.add(A.id+'#'+(A.i>>1));}
    else if(B.male&&!A.male){want.add(A.id+'#'+(A.i>>1));pinBusy.add(B.id+'#'+(B.i>>1));}
    else if(!A.male&&!B.male){                            // 孔對孔貼合：內側面互相咬合
      contactFaces.add(A.id+':'+A.i);contactFaces.add(B.id+':'+B.i);
    }
  };
  soc.forEach((A,ia)=>{
    for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(let dz=-1;dz<=1;dz++){
      const L=grid.get(ck(A.cx+dx,A.cy+dy,A.cz+dz)); if(!L)continue;
      for(const ib of L) if(ib>ia) pairUp(A,soc[ib]);
    }
  });
  parts.forEach(q=>{
    if(q.kind==='brace')return;
    const d=DEFS[q.defKey]; if(!d||!d.holeKeys)return;
    for(let h=0;h<d.holeKeys.length;h++){
      const key=q.id+'#'+h, m=holeMode(q,h);
      if(want.has(key)){
        if(m!=='pfill'&&m!=='solid'){
          if(!q.hmode)q.hmode={};
          q._pf=q._pf||{}; q._pf[h]=m;
          q.hmode[d.holeKeys[h]]='pfill';
          buildMeshes(q);
        }
      } else if(m==='pfill'){
        const prev=(q._pf&&q._pf[h])||'auto';
        if(prev==='auto'||prev==='pfill')delete q.hmode[d.holeKeys[h]];
        else q.hmode[d.holeKeys[h]]=prev;
        buildMeshes(q);
      }
    }
  });
}
let markDirty=false;
function scheduleMarkers(){markDirty=true;}
function rebuildMarkers(){
  while(markers.children.length)markers.remove(markers.children[0]);
  mlist=[];let free=0;
  const vis=visibleParts();
  parts.forEach(p=>{
    if(!p.obj.visible)return;
    const show=vis.has(p.id);
    for(let h=0;h<nHoles(p);h++){
      if(holeUsed(p,h))continue;
      if(holeMode(p,h)==='pfill')continue;      // 被銷佔據
      if(pinBusy.has(p.id+'#'+h))continue;      // 已插進孔裡的銷
      const isSolid=holeMode(p,h)==='solid';
      if(!isSolid)free++;                    // 填實的孔不計入可用接點
      if(!show)continue;
      const w=holeWorld(p,h),k=p.id+'#'+h;
      const male=isMale(p,h);
      const q=Q().setFromUnitVectors(V3(0,0,1),w.axis);
      const shaft=new THREE.Mesh(axGeo,M_AX);
      shaft.position.copy(w.pos);shaft.quaternion.copy(q);
      // 公頭的標記要凸出銷尖之外才看得到（孔的標記藏在洞裡即可）
      let base=[1,1,1];
      if(male)base=[1.3,1.3,2.5];
      if(holeHalf(p,h))base=[base[0]*0.55,base[1]*0.55,base[2]];
      const hit=new THREE.Mesh(hitGeo,M_HIT);
      hit.position.copy(w.pos);hit.quaternion.copy(q);
      hit.userData.hole={partId:p.id,hole:h};
      markers.add(shaft);markers.add(hit);
      if(male){                                    // 銷尖外側再放判定球，點銷尖即可選取
        [1,-1].forEach(sg=>{
          const h2=new THREE.Mesh(hitGeo,M_HIT);
          h2.position.copy(w.pos).addScaledVector(w.axis,sg*11);
          h2.userData.hole={partId:p.id,hole:h};
          markers.add(h2);
        });
      }
      mlist.push({key:k,ms:[shaft],solid:isSolid,male:male,base:base});
    }});
  paintMarkers();
  return free;
}
function paintMarkers(){
  mlist.forEach(m=>{
    const on=sel.some(x=>(x.partId+'#'+x.hole)===m.key);
    const hv=hoverKey===m.key;
    const mat=on?M_AX_ON:(hv?M_AX_HI:(m.solid?M_AX_SOLID:(m.male?M_AX_MALE:M_AX)));
    const k=m.solid&&!on&&!hv?0.6:1;
    const b=m.base||[1,1,1];
    m.ms.forEach(o=>{o.material=mat;
      o.scale.set((on||hv?2.1:1)*k*b[0],(on||hv?2.1:1)*k*b[1],(on?1.12:1)*b[2]);});
  });
}

/* ── 旋轉 Gizmo ─────────────────────────────────────────
   平常：零件旁三個小小的雙頭彎箭頭
   按住：展開成整圈刻度量角盤，拖到哪填到哪，旁邊跳角度   */
const GZ_COL={x:0xe05a50,y:0x7cb648,z:0x5590d9};
const gzAxis={};
let gzHover=null;

function mkArrow(){
  // 平面幾何（環帶 + 三角形），單向箭頭
  const g=new THREE.Group();
  const mat=new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.42,
    depthTest:false,side:THREE.DoubleSide});
  const A0=Math.PI*0.30, LEN=Math.PI*1.36, A1=A0+LEN, r=3.1, w=0.3;
  const arc=new THREE.Mesh(new THREE.RingGeometry(r-w,r+w,44,1,A0,LEN),mat);
  g.add(arc);
  const tri=new THREE.Shape();
  tri.moveTo(-0.2, 1.15); tri.lineTo(-0.2,-1.15); tri.lineTo(2.25,0);
  const head=new THREE.Mesh(new THREE.ShapeGeometry(tri),mat);
  head.position.set(r*Math.cos(A1), r*Math.sin(A1), 0);
  head.rotation.z=A1+Math.PI/2;          // 三角形朝切線方向
  g.add(head);
  g.children.forEach(o=>{o.renderOrder=999;o.raycast=function(){};});
  return {g:g,mat:mat};
}
function mkDial(col){
  const g=new THREE.Group();
  const lm=new THREE.LineBasicMaterial({color:col,transparent:true,opacity:.6,depthTest:false});
  const pts=[];
  for(let i=0;i<=120;i++){const a=i/120*Math.PI*2;pts.push(V3(Math.cos(a),Math.sin(a),0));}
  const ring=new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),lm);
  const tp=[];
  for(let i=0;i<24;i++){const a=i/24*Math.PI*2,r0=(i%6===0)?0.78:((i%3===0)?0.85:0.91);
    tp.push(V3(Math.cos(a)*r0,Math.sin(a)*r0,0),V3(Math.cos(a),Math.sin(a),0));}
  const ticks=new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(tp),lm);
  const fm=new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:.2,
    depthTest:false,side:THREE.DoubleSide});
  const fill=new THREE.Mesh(new THREE.RingGeometry(0,0.99,4,1,0,0.0001),fm);
  [ring,ticks,fill].forEach(o=>{o.renderOrder=997;o.raycast=function(){};g.add(o);});
  g.visible=false;
  return {g:g,lm:lm,fill:fill};
}
(function buildGizmo(){
  ['x','y','z'].forEach(a=>{
    const grp=new THREE.Group();
    if(a==='x')grp.rotation.y=Math.PI/2;      // 區域 +Z 對到整體 X
    if(a==='y')grp.rotation.x=-Math.PI/2;     // 區域 +Z 對到整體 Y
    const ar=mkArrow();
    const holder=new THREE.Group();holder.add(ar.g);
    const hit=new THREE.Mesh(new THREE.SphereGeometry(5.0,10,8),
      new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthTest:false,depthWrite:false}));
    hit.userData.gz=a;hit.renderOrder=999;holder.add(hit);
    const dl=mkDial(GZ_COL[a]);
    grp.add(holder);grp.add(dl.g);
    gizmo.add(grp);
    gzAxis[a]={grp:grp,holder:holder,mat:ar.mat,dial:dl};
  });
})();

// 零件本身在區域座標中的範圍（不含接在後面的東西）
function localExtent(p){
  if(p.kind==='brace')return {c:V3(0,0,0),e:V3(p.span/2+R,R,TH/2)};
  const d=DEFS[p.defKey];
  let x0=1e9,x1=-1e9,y0=1e9,y1=-1e9;
  d.bars.forEach(b=>{
    const co=Math.cos(b.rot||0),si=Math.sin(b.rot||0);
    const ox=(b.off&&b.off[0])||0,oy=(b.off&&b.off[1])||0;
    b.xs.forEach(x=>{const px=x*co+ox,py=x*si+oy;
      x0=Math.min(x0,px);x1=Math.max(x1,px);y0=Math.min(y0,py);y1=Math.max(y1,py);});});
  return {c:V3((x0+x1)/2,(y0+y1)/2,0),
          e:V3((x1-x0)/2+R,(y1-y0)/2+R,(d.th||TH)/2)};
}
function setFill(A,a0,ang){
  const st=(ang<0)?(a0+ang):a0, ln=Math.abs(ang);
  A.dial.fill.geometry.dispose();
  A.dial.fill.geometry=new THREE.RingGeometry(0,0.99,60,1,st,Math.max(ln,0.0001));
}
function updateGizmo(){
  const t=rotTarget();
  const dragging=!!(drag&&drag.mode==='gizmo');
  if(!t){ if(!dragging)gizmo.visible=false; return; }
  if(!dragging){
    gizmo.visible=true;
    const p=t.part, pad=7;
    if(t.kind==='free'){
      const ex=localExtent(p);
      gizmo.position.copy(ex.c.clone().applyMatrix4(p.obj.matrixWorld));
      gizmo.quaternion.copy(p.obj.getWorldQuaternion(Q()));
      ['x','y','z'].forEach(k=>gzAxis[k].grp.visible=true);
      const dz={x:ex.e.x+pad, y:ex.e.y+pad, z:ex.e.z+pad};
      const dr={x:Math.max(ex.e.y,ex.e.z)+pad+4,
                y:Math.max(ex.e.x,ex.e.z)+pad+4,
                z:Math.max(ex.e.x,ex.e.y)+pad+4};
      ['x','y','z'].forEach(k=>{
        gzAxis[k].holder.position.set(0,0,dz[k]);
        gzAxis[k].dial.g.position.set(0,0,dz[k]);   // 盤與箭頭同一個平面
        gzAxis[k].dial.g.scale.setScalar(dr[k]);
      });
    } else {
      const L=p.link,host=byId(L.hostId);
      if(!host){gizmo.visible=false;return;}
      const w=socketWorld(host,L.hostSocket);
      gizmo.position.copy(w.pos).addScaledVector(w.axis,TH*0.6);
      gizmo.quaternion.copy(Q().setFromUnitVectors(V3(0,0,1),w.axis));
      gzAxis.x.grp.visible=false;gzAxis.y.grp.visible=false;gzAxis.z.grp.visible=true;
      const ex=localExtent(p), rr=Math.max(15,Math.max(ex.e.x,ex.e.y)*0.65);
      gzAxis.z.holder.position.set(rr,0,0);        // 箭頭坐在盤緣上
      gzAxis.z.dial.g.position.set(0,0,0);
      gzAxis.z.dial.g.scale.setScalar(rr);
    }
  }
  ['x','y','z'].forEach(k=>{
    const A=gzAxis[k];
    const act=dragging?(drag.axisKey===k):(gzHover===k);
    A.dial.g.visible=act;
    A.holder.visible=dragging?false:true;
    A.mat.opacity=act?0.95:(gzHover?0.12:0.42);
  });
}

/* ── 互動 ── */
const ray=new THREE.Raycaster();
let drag=null,moved=0,pinch=null;
const dragPlane=new THREE.Plane();
function setRay(e){
  const r=cv.getBoundingClientRect();
  ray.setFromCamera(new THREE.Vector2(((e.clientX-r.left)/r.width)*2-1,
                                      -((e.clientY-r.top)/r.height)*2+1),camera);
}
function castAt(e){
  setRay(e);
  const gz=gizmo.visible?ray.intersectObjects(gizmo.children,true).filter(h=>h.object.userData.gz):[];
  const hs=ray.intersectObjects(markers.children,false).filter(h=>h.object.userData.hole);
  const ps=ray.intersectObjects(world.children,true);
  return {gz:gz,hs:hs,ps:ps};
}
const holeWins=(hs,ps)=>hs.length&&(!ps.length||hs[0].distance<ps[0].distance+2.0);

cv.addEventListener('dblclick',e=>{
  const c=castAt(e);
  if(c.ps.length){
    let o=c.ps[0].object;
    while(o&&!o.userData.pid)o=o.parent;
    if(o){selPart=rootOf(byId(o.userData.pid)).id;sel=[];refresh();}
  }
});

cv.addEventListener('pointerdown',e=>{
  camAnim=null;                                  // 動手就停下補間
  if(ghost!==null&&e.button===0){
    e.preventDefault();
    if(overTrash(e))cancelGhost(); else commitGhost();
    return;
  }
  cv.setPointerCapture(e.pointerId);moved=0;
  if(e.button===2||e.shiftKey){drag={mode:'pan',x:e.clientX,y:e.clientY};return;}
  const c=castAt(e);
  if(c.gz.length){
    const t=rotTarget();
    if(t){
      const a=c.gz[0].object.userData.gz;
      const axis=V3(a==='x'?1:0,a==='y'?1:0,a==='z'?1:0)
        .applyQuaternion(gizmo.getWorldQuaternion(Q())).normalize();
      const ctr=gzAxis[a].dial.g.getWorldPosition(V3());
      dragPlane.setFromNormalAndCoplanarPoint(axis,ctr);
      const hit=ray.ray.intersectPlane(dragPlane,V3());
      if(hit){
        pushHistory();
        const v0=V3().subVectors(hit,ctr).normalize();
        const gq=gzAxis[a].grp.getWorldQuaternion(Q());
        const bx=V3(1,0,0).applyQuaternion(gq),by=V3(0,1,0).applyQuaternion(gq);
        drag={mode:'gizmo',axis:axis,axisKey:a,ctr:ctr,v0:v0,
              a0:Math.atan2(v0.dot(by),v0.dot(bx)),
              t:t,qStart:t.kind==='free'?t.part.obj.quaternion.clone():null,
              rollStart:t.kind==='link'?t.part.link.roll:0,
              x:e.clientX,y:e.clientY};
        setFill(gzAxis[a],drag.a0,0);
        return;
      }
    }
  }
  if(!holeWins(c.hs,c.ps)&&c.ps.length){
    const p=partOfObj(c.ps[0].object),r=p?rootOf(p):null;
    if(r&&!r.link&&r.kind!=='brace'){
      dragPlane.setFromNormalAndCoplanarPoint(V3(0,0,1),r.obj.position.clone());
      const hit=ray.ray.intersectPlane(dragPlane,V3());
      if(hit){drag={mode:'move',root:r,off:V3().subVectors(r.obj.position,hit),
                    x:e.clientX,y:e.clientY,dirty:false};return;}
    }
  }
  drag={mode:'orbit',x:e.clientX,y:e.clientY};
});

cv.addEventListener('wheel',e=>{
  // 拖曳既有零件時：滾輪轉零件，不縮放視角
  if(drag&&drag.mode==='move'&&drag.root){
    e.preventDefault();e.stopImmediatePropagation();
    const st=(step>0?step:Math.PI/12);
    drag.root.obj.quaternion.premultiply(
      Q().setFromAxisAngle(V3(0,0,1),(e.deltaY>0?1:-1)*st));
    layout();scheduleMarkers();
    return;
  }
  if(ghost===null)return;                 // 沒在放置也沒在拖曳時，滾輪照常縮放
  e.preventDefault();e.stopImmediatePropagation();   // 放置中滾輪專門用來轉零件
  const st=(step>0?step:Math.PI/12);
  ghostRoll+=(e.deltaY>0?1:-1)*st;
  ghostSnap=null;                         // 強制重算
  updateGhost(null);
},{passive:false});

cv.addEventListener('pointermove',e=>{
  if(ghost!==null){updateGhost(e);trashHover(e);return;}
  if(!drag){
    const c=castAt(e);
    let k=null,hp=null;
    if(holeWins(c.hs,c.ps)){
      const hh=c.hs[0].object.userData.hole;
      k=hh.partId+'#'+hh.hole;hp=hh.partId;
    } else if(c.ps.length){
      const pp=partOfObj(c.ps[0].object);hp=pp?pp.id:null;
    }
    hoverKey=k;
    if(hp!==hoverPartId){hoverPartId=hp;scheduleMarkers();}
    else paintMarkers();
    gzHover=c.gz.length?c.gz[0].object.userData.gz:null;
    cv.style.cursor=c.gz.length?'grab':(k?'pointer':(c.ps.length?'grab':'default'));
    return;
  }
  const dx=e.clientX-drag.x,dy=e.clientY-drag.y;
  moved+=Math.abs(dx)+Math.abs(dy);
  if(drag.mode==='gizmo'){
    setRay(e);
    const hit=ray.ray.intersectPlane(dragPlane,V3());
    if(hit){
      const v1=V3().subVectors(hit,drag.ctr).normalize();
      let ang=Math.atan2(V3().crossVectors(drag.v0,v1).dot(drag.axis),drag.v0.dot(v1));
      if(step>0)ang=Math.round(ang/step)*step;
      if(drag.t.kind==='free'){
        drag.t.part.obj.quaternion.copy(Q().setFromAxisAngle(drag.axis,ang).multiply(drag.qStart));
      } else {
        drag.t.part.link.roll=drag.rollStart+ang;
        applyLink(drag.t.part);
      }
      setFill(gzAxis[drag.axisKey],drag.a0,ang);
      const bd=el('angBadge'),pv=drag.ctr.clone().project(camera);
      bd.style.display='block';
      bd.style.left=((pv.x*0.5+0.5)*innerWidth)+'px';
      bd.style.top=((-pv.y*0.5+0.5)*innerHeight)+'px';
      bd.textContent=(ang>0?'+':'')+Math.round(ang*180/Math.PI)+'°';
      layout();scheduleMarkers();syncSliders();
    }
    cv.style.cursor='grabbing';
  } else if(drag.mode==='move'){
    if(!drag.dirty){pushHistory();drag.dirty=true;}
    setRay(e);
    const hit=ray.ray.intersectPlane(dragPlane,V3());
    if(hit){
      const np=hit.clone().add(drag.off);
      if(el('gridsnap').checked){np.x=Math.round(np.x/MOD)*MOD;np.y=Math.round(np.y/MOD)*MOD;}
      np.z=(drag.root.layer||0)*TH;
      drag.root.obj.position.copy(np);layout();scheduleMarkers();
      el('trash').classList.add('on');trashHover(e);
    }
    cv.style.cursor='grabbing';
  } else if(drag.mode==='pan'){
    const s=cam.dist*0.0016;
    const right=V3().subVectors(camera.position,cam.target).cross(camera.up).normalize();
    const upv=V3().crossVectors(right,V3().subVectors(camera.position,cam.target)).normalize();
    cam.target.addScaledVector(right,dx*s).addScaledVector(upv,dy*s);applyCam();
  } else {
    cam.theta-=dx*0.008;
    cam.phi=Math.max(0.08,Math.min(Math.PI-0.08,cam.phi-dy*0.008));applyCam();
  }
  drag.x=e.clientX;drag.y=e.clientY;
});

cv.addEventListener('pointerup',e=>{
  if(drag&&drag.mode==='move'&&drag.root&&overTrash(e)){
    const id=drag.root.id;drag=null;
    el('trash').classList.remove('on','open');
    removePart(id);return;
  }
  if(ghost===null)el('trash').classList.remove('on','open');
  const wasGizmo=drag&&drag.mode==='gizmo';
  if(drag&&moved<6&&!wasGizmo)pick(e);
  drag=null;cv.style.cursor='default';
  gzHover=null;el('angBadge').style.display='none';
  if(wasGizmo)refresh();
});
cv.addEventListener('contextmenu',e=>e.preventDefault());
cv.addEventListener('wheel',e=>{e.preventDefault();camAnim=null;
  cam.dist=Math.max(25,Math.min(2000,cam.dist*(1+Math.sign(e.deltaY)*0.12)));applyCam();
},{passive:false});
cv.addEventListener('touchstart',e=>{if(e.touches.length===2){drag=null;camAnim=null;
  pinch=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,
                   e.touches[0].clientY-e.touches[1].clientY);}},{passive:true});
cv.addEventListener('touchmove',e=>{if(e.touches.length===2&&pinch){
  const d=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,
                     e.touches[0].clientY-e.touches[1].clientY);
  cam.dist=Math.max(25,Math.min(2000,cam.dist*pinch/d));pinch=d;applyCam();}},{passive:true});
cv.addEventListener('touchend',()=>{pinch=null;});
cv.addEventListener('pointerleave',()=>{
  if(drag)return;
  gzHover=null;
  if(hoverPartId!==null||hoverKey!==null){hoverPartId=null;hoverKey=null;scheduleMarkers();}
});

function pick(e){
  const c=castAt(e);
  if(holeWins(c.hs,c.ps)){
    const s=c.hs[0].object.userData.hole;
    const i=sel.findIndex(x=>x.partId===s.partId&&x.hole===s.hole);
    if(i>=0)sel.splice(i,1); else {sel.push(s);if(sel.length>2)sel.shift();}
    selPart=null;refresh();return;
  }
  if(c.ps.length){const p=partOfObj(c.ps[0].object);
    selPart=p?(selPart===p.id?null:p.id):null;sel=[];}
  else {selPart=null;sel=[];}
  refresh();
}
function resize(){
  const w=Math.max(1,stage.clientWidth),h=Math.max(1,stage.clientHeight);
  renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();
}
addEventListener('resize',resize);
if(window.ResizeObserver)new ResizeObserver(resize).observe(stage);

/* ── 零件庫：類別 → 零件 ── */
let curCat=CATS[0];
function buildCats(){
  const c=el('popCats');c.innerHTML='';
  CATS.forEach(cat=>{
    const n=KEYS_BY_CAT[cat].length; if(!n)return;
    const b=document.createElement('button');
    b.title=cat;
    b.innerHTML='<span class="t">'+(SHORT[cat]||cat)+'</span><span class="n">'+n+'</span>';
    b.className=(cat===curCat)?'on':'';
    b.onclick=()=>{curCat=cat;buildCats();buildList();openDock();};
    c.appendChild(b);});
  const sp=document.createElement('div');sp.className='sp';c.appendChild(sp);
  const pin=document.createElement('button');
  pin.className='pin'+(document.body.classList.contains('pinned')?' on':'');
  pin.title='釘選抽屜';
  pin.innerHTML='<svg width="15" height="15" viewBox="0 0 16 16" fill="none" '+
    'stroke="currentColor" stroke-width="1.4"><path d="M6 2h4l-.6 4 2.1 2.2H4.5L6.6 6z"/>'+
    '<path d="M8 8.2V14"/></svg>';
  pin.onclick=()=>{
    const on=document.body.classList.toggle('pinned');
    pin.classList.toggle('on',on);
    if(on)openDock();
    setTimeout(resize,300);
  };
  c.appendChild(pin);
}
function buildList(){
  const c=el('popList');c.innerHTML='';
  el('flyH').textContent=curCat+' · '+KEYS_BY_CAT[curCat].length+' 種';
  KEYS_BY_CAT[curCat].forEach(k=>{
    const b=document.createElement('button');b.className='prow';
    b.title=DEFS[k].name;
    b.innerHTML='<span class="lbl">'+DEFS[k].name+'</span>'+thumb(k);
    b.onclick=()=>startGhost(k);
    c.appendChild(b);});
}
// 自動開合
const dock=el('dock');let dockT=null;
function openDock(){clearTimeout(dockT);dock.classList.add('open');}
function closeDock(){
  if(document.body.classList.contains('pinned'))return;
  clearTimeout(dockT);
  dockT=setTimeout(()=>dock.classList.remove('open'),200);
}
dock.addEventListener('pointerenter',openDock);
dock.addEventListener('pointerleave',closeDock);
buildCats();buildList();

function closePops(){
  el('popTol').classList.remove('open');
  el('btnTol').classList.remove('on');
}
function togglePop(pop,btn){
  const open=pop.classList.contains('open');
  closePops();
  if(!open){pop.classList.add('open');btn.classList.add('on');}
}
el('btnTol').onclick=e=>{e.stopPropagation();togglePop(el('popTol'),el('btnTol'));};
document.addEventListener('pointerdown',e=>{
  if(e.target.closest('.pop')||e.target.closest('.chrome'))return;
  closePops();});

function rotTarget(){
  if(!selPart)return null;
  const p=byId(selPart); if(!p)return null;
  const j=jointOf(p); if(!j)return null;
  if(j.link)return {kind:'link',part:j};
  if(j.kind!=='brace')return {kind:'free',part:j};
  return null;
}
const deg360=r=>((Math.round(r*180/Math.PI)%360)+360)%360;
function syncSliders(){
  const t=rotTarget(); if(!t)return;
  if(t.kind==='link'){
    const d=deg360(t.part.link.roll);
    el('ang').value=d;el('angVal').textContent=d+'°';
  } else {
    ['x','y','z'].forEach(a=>{
      const d=deg360(t.part.obj.rotation[a]);
      el('ang'+a.toUpperCase()).value=d;
      el('val'+a.toUpperCase()).textContent=d+'°';});
  }
}

/* ── 選取零件的浮動面板：跟著零件在畫面上的位置 ── */
const selpanel=el('selpanel');
function placeSelPanel(){
  const p=selPart?byId(selPart):null, t=rotTarget();
  selpanel.classList.toggle('show',!!(p&&t));
}

function setStat(id,v){
  const el0=el(id),s=String(v);
  if(el0.textContent===s)return;
  el0.textContent=s;
  if(REDUCE_MO)return;
  el0.classList.remove('tick');void el0.offsetWidth;el0.classList.add('tick');
}
function refresh(){
  syncPinFills();
  parts.forEach(p=>{
    const on=p.id===selPart;
    p.obj.children.forEach(o=>{if(o.isMesh)
      o.material=on?MAT_SEL:partMat(p);});});
  const free=rebuildMarkers();
  setStat('cnt',parts.length);
  setStat('gcnt',world.children.length);
  setStat('scnt',free);
  el('empty').style.display=(parts.length&&!document.body.classList.contains('show-intro'))?'none':'flex';

  const p=selPart?byId(selPart):null, t=rotTarget();
  const rootSel=p?rootOf(p):null;
  el('selRoot').style.display=(p&&rootSel&&rootSel.id!==p.id)?'block':'none';
  const isLink=!!(t&&t.kind==='link'), isFree=!!(t&&t.kind==='free');
  el('selname').textContent=p?nameOf(p):'—';
  el('sellayer').textContent=isFree?('層 '+(t.part.layer||0)):(isLink?'已接合':'');
  el('jointBox').style.display=isLink?'block':'none';
  el('axisBox').style.display=isFree?'block':'none';
  syncSliders();
  el('detach').disabled=!isLink;
  el('flip').disabled=!isLink;
  el('side').disabled=!isLink;
  el('layerUp').disabled=!isFree;
  el('layerDown').disabled=!isFree;
  el('del').disabled=!selPart;
  placeSelPanel();

  const bar=el('actionbar'),msg=el('actionmsg');
  if(sel.length===2){
    bar.classList.add('show');
    const pA=byId(sel[0].partId),pB=byId(sel[1].partId);
    const anySolid=holeMode(pA,sel[0].hole)==='solid'||holeMode(pB,sel[1].hole)==='solid';
    const mA=isMale(pA,sel[0].hole), mB=isMale(pB,sel[1].hole);

    const same=rootOf(pA).id===rootOf(pB).id;
    const rf=braceRefs(),s=braceSolve(rf[0],rf[1]);
    let txt='';
    if(s){const m=s.d/MOD;
      txt='跨距 <b>'+s.d.toFixed(2)+'</b> mm　'+m.toFixed(2)+' 模距'+
        (Math.abs(m-Math.round(m))<0.03?'　正版樑接得上':'　只有客製件接得上');
      if(s.off>0.1)txt+='<br><span class="w">兩孔不同平面，差 '+s.off.toFixed(1)+' mm</span>';
      if(s.par<0.99)txt+='<br><span class="w">兩孔軸向不平行</span>';
      if(same)txt+='<br>同一組件，只能架斜撐';}
    if(anySolid)txt='<span class="w">選到的孔已填實，不能接合。先改回圓孔或十字孔。</span>';

    msg.innerHTML=txt;
    el('join').disabled=same||anySolid;
    el('brace').disabled=anySolid||mA||mB;   // 斜撐要靠孔定位，凸銷不行
  } else if(sel.length===1){
    bar.classList.add('show');
    const sp=byId(sel[0].partId);
    const md=sp?holeMode(sp,sel[0].hole):'auto';
    const nameOfMode={'cross':'十字孔','solid':'填實','round':'圓孔','auto':'預設'};
    msg.innerHTML='已選 1 根軸　再點第二根接合<br>或改變這個孔的型式（目前：'+
      nameOfMode[md]+'）';
    el('joinBtns').style.display='none';
    el('holeBtns').style.display=(sp&&sp.kind!=='brace')?'flex':'none';
    ['hmRound','hmCross','hmSolid'].forEach(b=>el(b).classList.remove('on'));
    if(md==='cross')el('hmCross').classList.add('on');
    else if(md==='solid')el('hmSolid').classList.add('on');
    else if(md==='round')el('hmRound').classList.add('on');
  } else bar.classList.remove('show');
  if(sel.length!==1){el('joinBtns').style.display='flex';el('holeBtns').style.display='none';}

  el('expFused').disabled=!parts.length;
  el('expParts').disabled=!parts.length;
  el('undo').disabled=history.length===0;
  el('redo').disabled=future.length===0;
}

/* ── 控制 ── */
let angDirty=false;
el('ang').oninput=()=>{
  const t=rotTarget(); if(!t||t.kind!=='link')return;
  let deg=parseFloat(el('ang').value);
  if(step>0)deg=Math.round(deg/(step*180/Math.PI))*(step*180/Math.PI);
  t.part.link.roll=deg*Math.PI/180;applyLink(t.part);
  el('angVal').textContent=Math.round(deg)+'°';
  layout();scheduleMarkers();
};
el('ang').onpointerdown=()=>{if(!angDirty){pushHistory();angDirty=true;}};
el('ang').onchange=()=>{angDirty=false;layout();refresh();};
['x','y','z'].forEach(a=>{
  const A=a.toUpperCase(),inp=el('ang'+A),out=el('val'+A);
  inp.oninput=()=>{
    const t=rotTarget(); if(!t||t.kind!=='free')return;
    let deg=parseFloat(inp.value);
    if(step>0)deg=Math.round(deg/(step*180/Math.PI))*(step*180/Math.PI);
    t.part.obj.rotation[a]=deg*Math.PI/180;
    out.textContent=Math.round(deg)+'°';
    layout();scheduleMarkers();};
  inp.onpointerdown=()=>{if(!angDirty){pushHistory();angDirty=true;}};
  inp.onchange=()=>{angDirty=false;layout();refresh();};
});
document.querySelectorAll('#stepSeg button').forEach(b=>b.onclick=()=>{
  document.querySelectorAll('#stepSeg button').forEach(x=>x.classList.remove('on'));
  b.classList.add('on');
  const d=parseFloat(b.dataset.step);
  step=d>0?d*Math.PI/180:0;});
function applyHoleMode(mode){
  if(sel.length!==1)return;
  const p=byId(sel[0].partId); if(!p||p.kind==='brace')return;
  if(isMale(p,sel[0].hole)){toast('這是凸銷，不能改成孔。',true);return;}
  pushHistory();
  setHoleMode(p,sel[0].hole,mode);
  layout();refresh();
}
el('hmRound').onclick=()=>applyHoleMode('round');
el('hmCross').onclick=()=>applyHoleMode('cross');
el('hmSolid').onclick=()=>applyHoleMode('solid');
el('selRoot').onclick=()=>{
  const p=selPart?byId(selPart):null; if(!p)return;
  selPart=rootOf(p).id;sel=[];refresh();
};
window.addEventListener('keydown',e=>{
  if(e.target&&/^(INPUT|TEXTAREA)$/.test(e.target.tagName))return;
  const k=e.key.toLowerCase();
  if(k==='d'&&selPart){                      // 複製目前零件
    const p=byId(selPart); if(p&&p.kind!=='brace'){e.preventDefault();addPart(p.defKey);}
  } else if(k==='f'&&ghost!==null){ ghostFlip=!ghostFlip;ghostSnap=null;updateGhost(null); }
  else if(k==='escape'){ if(ghost!==null)cancelGhost(); else {sel=[];refresh();} }
  else if(k==='n'&&selPart){                 // 跳到這個零件的下一個空孔
    e.preventDefault();selectNextFreeHole(byId(selPart));
  }
});
el('join').onclick=doJoin;
el('brace').onclick=addBrace;
el('detach').onclick=()=>{const t=rotTarget();if(t)detach(t.part);};
el('flip').onclick=()=>{
  const t=rotTarget(); if(!t||t.kind!=='link')return;
  pushHistory();const L=t.part.link;
  used.delete(L.viaId+':'+L.viaSocket);L.viaSocket^=1;used.add(L.viaId+':'+L.viaSocket);
  applyLink(t.part);layout();refresh();};
el('side').onclick=()=>{
  const t=rotTarget(); if(!t||t.kind!=='link')return;
  pushHistory();const L=t.part.link;
  used.delete(L.hostId+':'+L.hostSocket);L.hostSocket^=1;used.add(L.hostId+':'+L.hostSocket);
  applyLink(t.part);layout();refresh();};
function setLayer(d){
  const t=rotTarget(); if(!t||t.kind!=='free')return;
  pushHistory();t.part.layer=(t.part.layer||0)+d;
  t.part.obj.position.z=t.part.layer*TH;layout();refresh();}
el('layerUp').onclick=()=>setLayer(1);
el('layerDown').onclick=()=>setLayer(-1);
el('del').onclick=()=>removePart(selPart);
el('undo').onclick=undo;
el('redo').onclick=redo;
['cbd','cbh'].forEach(id=>{el(id).onchange=()=>{
  parts.forEach(buildMeshes);layout();refresh();};});

/* ── 公差測試件：一片上排一整列不同參數的孔 ── */
let sweepMode='comp';
document.querySelectorAll('#sweepSeg button').forEach(b=>b.onclick=()=>{
  document.querySelectorAll('#sweepSeg button').forEach(x=>x.classList.remove('on'));
  b.classList.add('on');sweepMode=b.dataset.sweep;});

el('genTest').onclick=()=>{
  const st=parseFloat(el('tStart').value), sp=parseFloat(el('tStep').value);
  const n=Math.max(2,Math.min(20,parseInt(el('tN').value,10)||6));
  if(isNaN(st)||isNaN(sp)){toast('起始值和級距要填數字。',true);return;}
  const th=TH, total=n+1, xs=[];
  for(let i=0;i<total;i++)xs.push(i*MOD-(total-1)*MOD/2);
  const spec=[{hd:2.6,cd:0,ch:0}];          // 方向記號：一個明顯較小的孔
  const vals=[];
  for(let i=0;i<n;i++){
    const v=st+sp*i; vals.push(v);
    if(sweepMode==='comp') spec.push({hd:HOLE+v, cd:cbDia(), ch:cbDep()});
    else                   spec.push({hd:holeD(), cd:cbDia(), ch:v});
  }
  const geo=barSolidSpec(xs,spec,th);
  const tris=trisOf(geo,new THREE.Matrix4());
  const a=auditTris(tris);
  if(a.open||a.dup||a.deg){
    toast('測試件幾何有問題（破口 '+a.open+'）。把級距或孔數調小再試。',true);return;}
  const tag=sweepMode==='comp'?'comp':'cbdepth';
  writeSTL(tris,'tolerance-'+tag+'-'+st.toFixed(2)+'to'+vals[n-1].toFixed(2)+'.stl');
  const label=sweepMode==='comp'?'主孔補償':'沉孔深度';
  toast('測試件已匯出 · '+n+' 個孔，平躺列印即可。\n'+
        '從記號小孔那端數起：\n'+
        vals.map((v,i)=>'　第 '+(i+1)+' 孔　'+label+' '+v.toFixed(2)+' mm').join('\n'));
};

function fitView(instant){
  let tgt=V3(), d=210;
  if(parts.length){
    const box=new THREE.Box3().setFromObject(world);
    tgt.copy(box.getCenter(V3()));
    d=Math.max(60,box.getSize(V3()).length()*1.8);
  }
  if(instant){camAnim=null;cam.target.copy(tgt);cam.dist=d;applyCam();return;}
  tweenCam({theta:cam.theta,phi:cam.phi,dist:d,target:tgt},420);}
el('fit').onclick=fitView;

addEventListener('keydown',e=>{
  if(/INPUT|TEXTAREA/.test((e.target.tagName||'')))return;
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){
    e.preventDefault();e.shiftKey?redo():undo();return;}
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){e.preventDefault();redo();return;}
  if(e.key==='Escape'){closePops();selPart=null;sel=[];refresh();}
  else if(e.key==='Delete'||e.key==='Backspace'){if(selPart){e.preventDefault();removePart(selPart);}}
  else if(e.key.toLowerCase()==='f'){if(ghost===null)fitView();}   // 放置零件時 F 專門用來翻面
  else if(e.key==='1')setView('iso');
  else if(e.key==='2')setView('top');
  else if(e.key==='3')setView('front');
});

/* ── 存讀檔 ── */
/* ── 存檔 ──
   檔案格式外面包一層信封，帶版本號與名稱；
   scene 內容就是 snapshot() 的原樣，之後接雲端可直接沿用。   */
const FILE_VER=1;
let docName='未命名';

function envelope(){
  return JSON.stringify({app:'trunnionlab',ver:FILE_VER,
    name:docName,savedAt:new Date().toISOString(),
    scene:JSON.parse(snapshot())});
}
// 舊檔（直接是 snapshot 內容）也讀得進來
function openEnvelope(txt){
  const o=JSON.parse(txt);
  if(o&&o.app==='trunnionlab'&&o.scene){
    if(o.ver>FILE_VER)throw new Error('這個檔案來自更新版本的網站');
    docName=o.name||'未命名';
    return JSON.stringify(o.scene);
  }
  if(o&&Array.isArray(o.parts))return txt;      // 舊格式
  throw new Error('看起來不是這個網站的檔案');
}
const safeName=n=>(n||'未命名').replace(/[\\/:*?"<>|]/g,'-').slice(0,60);
function setDocName(n){docName=n||'未命名';
  const t=el('docName'); if(t)t.textContent=docName;}

el('save').onclick=async()=>{
  const n=await Ask.text('下載這份設計','檔名',docName);
  if(n===null)return;
  setDocName(n.trim()||'未命名');
  saveLocal();
  dl(new Blob([envelope()],{type:'application/json'}),safeName(docName)+'.json');
  toast('已下載 '+safeName(docName)+'.json');
};
el('load').onclick=()=>el('file').click();
el('file').onchange=e=>{
  const f=e.target.files[0]; if(!f)return;
  const r=new FileReader();
  r.onload=()=>{try{const scene=openEnvelope(r.result);
                    saveLocal();                       // 先保住目前這份
                    docId=newId();                     // 匯入的檔案成為新專案
                    pushHistory();restore(scene);setDocName(docName);fitView();
                    saveLocal();toast('已匯入「'+docName+'」');
                    if(atHome)enterWorkbench(null);}
                catch(err){toast('讀檔失敗：'+err.message);}};
  r.readAsText(f);e.target.value='';};

/* ── 專案庫 ──
   目前存在瀏覽器裡；接上帳號後同一份列表會改由雲端提供，
   因此所有讀寫都集中在 Store 這一層，之後只要換掉它的實作。   */
const LocalStore=(function(){
  const IDX='trunnionlab:index', DOC=id=>'trunnionlab:doc:'+id,
        THUMB=id=>'trunnionlab:thumb:'+id, CUR='trunnionlab:current';
  const get=k=>{try{return localStorage.getItem(k);}catch(e){return null;}};
  const put=(k,v)=>{try{localStorage.setItem(k,v);return true;}catch(e){return false;}};
  const del=k=>{try{localStorage.removeItem(k);}catch(e){}};
  function index(){try{return JSON.parse(get(IDX)||'[]');}catch(e){return [];}}
  function writeIndex(a){put(IDX,JSON.stringify(a));}
  return {
    list(){return index().sort((x,y)=>(y.updated||'').localeCompare(x.updated||''));},
    read(id){return get(DOC(id));},
    thumb(id){return get(THUMB(id));},
    putThumb(id,thumb){if(thumb)put(THUMB(id),thumb);},   // 只換縮圖，不動索引時間
    write(id,name,body,nParts,thumb){
      if(!put(DOC(id),body))return false;
      if(thumb!==undefined&&thumb!==null)put(THUMB(id),thumb);
      const a=index(), i=a.findIndex(d=>d.id===id);
      const rec={id:id,name:name,updated:new Date().toISOString(),parts:nParts};
      if(i<0)a.push(rec); else a[i]=rec;
      writeIndex(a);return true;},
    remove(id){del(DOC(id));del(THUMB(id));writeIndex(index().filter(d=>d.id!==id));},
    rename(id,name){const a=index(),d=a.find(x=>x.id===id);
      if(d){d.name=name;writeIndex(a);}
      const body=get(DOC(id));
      if(body){try{const o=JSON.parse(body);o.name=name;put(DOC(id),JSON.stringify(o));}catch(e){}}},
    current(){return get(CUR);},
    setCurrent(id){put(CUR,id);}
  };
})();

/* 登入後同一份介面改由雲端提供。所有讀寫都走 Store 這個門面，
   _impl 指向 LocalStore（未登入）或 CloudStore（已登入）。 */
let _impl = LocalStore;
const Store = {
  list:()=>_impl.list(),
  read:(id)=>_impl.read(id),
  thumb:(id)=>_impl.thumb(id),
  write:(id,name,body,n,thumb)=>_impl.write(id,name,body,n,thumb),
  remove:(id)=>_impl.remove(id),
  rename:(id,name)=>_impl.rename(id,name),
  current:()=>_impl.current(),
  setCurrent:(id)=>_impl.setCurrent(id),
  isCloud:()=>_impl!==LocalStore
};

/* CloudStore：與 LocalStore 同介面，背後是 Firestore users/{uid}/projects。
   用 onSnapshot 在本地維持一份快取，讓其餘程式維持同步（非 async）。 */
const CloudStore=(function(){
  let uid=null, unsub=null, meta=[], body={}, thumbs={};
  function begin(u){
    uid=u; if(unsub)unsub();
    unsub=window.__cloud.watch(uid,rows=>{
      meta=rows.map(r=>({id:r.id,name:r.name,updated:r.updated,parts:r.parts||0}));
      body={}; thumbs={};
      rows.forEach(r=>{ body[r.id]=r.body; if(r.thumb)thumbs[r.id]=r.thumb; });
      if(typeof renderDocs==='function')renderDocs();
    });
  }
  function end(){ if(unsub)unsub(); unsub=null; uid=null; meta=[]; body={}; thumbs={}; }
  function save(id,name,b,n,thumb){
    const th = (thumb!==undefined&&thumb!==null) ? thumb : (thumbs[id]||null);
    const rec={id:id,name:name,updated:new Date().toISOString(),parts:n||0,body:b,thumb:th};
    const i=meta.findIndex(d=>d.id===id);
    const m={id:id,name:name,updated:rec.updated,parts:rec.parts};
    if(i<0)meta.push(m); else meta[i]=m;
    body[id]=b; if(th)thumbs[id]=th;
    window.__cloud.put(uid,id,rec).catch(e=>toast('雲端儲存失敗：'+(e&&e.message||e),true));
    return true;
  }
  return {
    _begin:begin, _end:end,
    list(){return meta.slice().sort((x,y)=>(y.updated||'').localeCompare(x.updated||''));},
    read(id){return body[id]||null;},
    thumb(id){return thumbs[id]||null;},
    write(id,name,b,n,thumb){return save(id,name,b,n,thumb);},
    remove(id){ meta=meta.filter(d=>d.id!==id); delete body[id]; delete thumbs[id];
      window.__cloud.del(uid,id).catch(e=>toast('雲端刪除失敗：'+(e&&e.message||e),true)); },
    rename(id,name){ const d=meta.find(x=>x.id===id); let b=body[id];
      if(b){try{const o=JSON.parse(b);o.name=name;b=JSON.stringify(o);}catch(e){}}
      save(id,name,b||body[id]||'{}',(d&&d.parts)||0); },
    current(){return null;},
    setCurrent(){}
  };
})();

const newId=()=>'d'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
let docId=null, saveTimer=null;

/* 目前這一格畫面截成縮圖：明確 render 一次再抓，免得 WebGL
   的繪圖緩衝已被清空。只在工作台、且場景有零件時才截。 */
function viewThumb(){
  if(atHome||!parts.length||typeof renderer==='undefined')return undefined;
  let box;
  try{ box=new THREE.Box3().setFromObject(world); }catch(e){ return undefined; }
  if(box.isEmpty())return undefined;
  const ctr=box.getCenter(V3()), r=Math.max(box.getSize(V3()).length()/2,4);
  const RW=512, RH=320, asp=RW/RH, W=256, H=160;
  const bg=scene.background, gV=grid.visible, mV=markers.visible,
        zV=gizmo.visible, ca=renderer.getClearAlpha();
  let url;
  try{
    // 去背：只留零件本身，拿掉底色、格線、孔軸與旋轉盤。
    // 用正投影相機（沒有透視變形），把外框剛好框進畫面，整個零件一定看得到。
    // 從斜上方看得到孔和厚度；零件較長的水平軸轉到畫面左右。
    const size=box.getSize(V3());
    const th=((size.x>=size.y)?-Math.PI/2:0)+0.32, ph=0.72;
    const sp=Math.sin(ph), cp=Math.cos(ph);
    const dir=V3(sp*Math.cos(th),sp*Math.sin(th),cp);
    scene.background=null;
    grid.visible=false; markers.visible=false; gizmo.visible=false;
    renderer.setPixelRatio(1); renderer.setClearAlpha(0); renderer.setSize(RW,RH,false);
    const src=renderer.domElement;

    const oc=new THREE.OrthographicCamera(-1,1,1,-1,0.01,r*40+1000);
    oc.up.set(0,0,1);
    oc.position.copy(ctr).addScaledVector(dir,r*6+50);
    oc.lookAt(ctr); oc.updateMatrixWorld();
    const rt=V3().setFromMatrixColumn(oc.matrixWorld,0);
    const upv=V3().setFromMatrixColumn(oc.matrixWorld,1);
    let hu=0,hv=0;
    for(let i=0;i<8;i++){
      const rel=V3((i&1)?box.max.x:box.min.x,(i&2)?box.max.y:box.min.y,(i&4)?box.max.z:box.min.z).sub(ctr);
      hu=Math.max(hu,Math.abs(rel.dot(rt))); hv=Math.max(hv,Math.abs(rel.dot(upv)));
    }
    hu/=0.9; hv/=0.9;                       // 四邊各留約 10% 空白
    if(hu/hv<asp) hu=hv*asp; else hv=hu/asp;
    oc.left=-hu; oc.right=hu; oc.top=hv; oc.bottom=-hv;
    oc.updateProjectionMatrix();
    renderer.render(scene,oc);

    const c=document.createElement('canvas'); c.width=W; c.height=H;
    const ctx=c.getContext('2d');
    ctx.drawImage(src,0,0,src.width,src.height,0,0,W,H);
    url=c.toDataURL('image/png');                 // PNG 保留透明背景
  }catch(e){ url=undefined; }
  finally{
    scene.background=bg; grid.visible=gV; markers.visible=mV; gizmo.visible=zV;
    renderer.setClearAlpha(ca);
    renderer.setPixelRatio(Math.min(devicePixelRatio,2));
    try{ resize(); }catch(e){}
    applyCam();
  }
  return url;
}
function saveLocal(){
  if(!docId)return;
  Store.write(docId,docName,envelope(),parts.length,viewThumb());
  Store.setCurrent(docId);
}
function scheduleSave(){clearTimeout(saveTimer);saveTimer=setTimeout(saveLocal,800);}
addEventListener('beforeunload',saveLocal);

/* 舊版縮圖是直接裁當下視窗，改成依模型大小取景後，
   把本機既有專案的縮圖在啟動時重截一次（每台裝置只做一次）。
   雲端專案不在這裡處理，各自下次開啟存檔時就會更新。 */
function migrateThumbs(){
  try{ if(localStorage.getItem('trunnionlab:thumbframe')==='10')return; }catch(e){}
  if(_impl!==LocalStore||!atHome||docId)return;   // 只在主頁、沒開專案時做；否則留待下次
  const list=LocalStore.list();
  const doneFlag=()=>{try{localStorage.setItem('trunnionlab:thumbframe','10');}catch(e){}};
  if(!list.length){ doneFlag(); return; }
  const keepName=docName;
  atHome=false;                             // 讓 viewThumb 願意截圖（docId 已確定是 null）
  try{
    list.forEach(m=>{
      const body=LocalStore.read(m.id); if(!body)return;
      try{
        restore(openEnvelope(body));
        const th=viewThumb();
        if(th)LocalStore.putThumb(m.id,th);
      }catch(e){}
    });
  }finally{
    try{ restore(JSON.stringify({nextId:1,spawnN:0,parts:[]})); }catch(e){}
    atHome=true; docName=keepName;
    doneFlag();
  }
}

function newDoc(name){
  saveLocal();
  docId=newId();setDocName(name||'未命名');
  pushHistory();restore(JSON.stringify({nextId:1,spawnN:0,parts:[]}));
  saveLocal();fitView();
}
function openDoc(id){
  saveLocal();
  const body=Store.read(id);
  if(!body){toast('找不到這個專案');return false;}
  try{const scene=openEnvelope(body);
      docId=id;pushHistory();restore(scene);setDocName(docName);
      Store.setCurrent(id);return true;}
  catch(err){toast('開啟失敗：'+err.message);return false;}
}

/* ── 專案面板 ── */
function fmtTime(iso){
  if(!iso)return '';
  const d=new Date(iso), n=new Date(), ms=n-d;
  if(ms<60000)return '剛剛';
  if(ms<3600000)return Math.floor(ms/60000)+' 分鐘前';
  if(d.toDateString()===n.toDateString())
    return '今天 '+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
  return (d.getMonth()+1)+'/'+d.getDate();
}
function renderDocs(){
  const box=el('dlList'), a=Store.list(), cnt=el('homeCount');
  syncHowto(a.length>0);
  if(cnt)cnt.textContent=a.length?String(a.length).padStart(2,'0')+' 份':'';
  if(!a.length){box.innerHTML='<p class="dlEmpty">還沒有任何專案。'+
    '按下方的「新專案」開始，或把之前存下的 JSON 檔匯入回來。</p>';return;}
  box.innerHTML='';
  a.forEach((d,i)=>{
    const row=document.createElement('div');
    row.className='dlRow'+(d.id===docId?' cur':'');
    row.innerHTML='<span class="dlIx"></span>'+
      '<div class="dlThumb"></div>'+
      '<div class="dlMain"><b></b><span></span></div>'+
      '<div class="dlAct">'+
      '<button data-a="rn">改名</button>'+
      '<button data-a="dl">下載</button>'+
      '<button data-a="rm">刪除</button></div>';
    row.querySelector('.dlIx').textContent=String(i+1).padStart(2,'0');
    const th=Store.thumb(d.id), tw=row.querySelector('.dlThumb');
    if(th){ const im=new Image(); im.alt=''; im.decoding='async'; im.src=th; tw.appendChild(im); }
    else { tw.classList.add('none'); }
    row.querySelector('b').textContent=d.name||'未命名';
    row.querySelector('.dlMain span').textContent=
      String(d.parts||0).padStart(2,'0')+' 零件   ·   '+fmtTime(d.updated)+
      (d.id===docId?'   ·   上次開啟':'');
    row.onclick=()=>enterWorkbench(d.id);
    row.querySelectorAll('.dlAct button').forEach(b=>b.onclick=ev=>{
      ev.stopPropagation();
      const act=b.dataset.a;
      if(act==='rn'){Ask.text('重新命名','名稱',d.name).then(n=>{
        if(n===null)return; Store.rename(d.id,n.trim()||'未命名');
        if(d.id===docId)setDocName(n.trim()||'未命名'); renderDocs();});}
      else if(act==='dl'){const body=Store.read(d.id);
        if(body)dl(new Blob([body],{type:'application/json'}),safeName(d.name)+'.json');}
      else if(act==='rm'){
        Ask.confirm('刪除「'+(d.name||'未命名')+'」',
                    '這份專案會從這台裝置移除，無法復原。','刪除').then(ok=>{
          if(!ok)return;
          Store.remove(d.id);
          if(d.id===docId)docId=null;
          renderDocs();});}
    });
    box.appendChild(row);
  });
}
/* ── 對話框 ──
   sandbox 化的 iframe 會封鎖 prompt/confirm 並靜靜回傳 null，
   所以一律走頁面內的對話框。   */

/* ── 主頁 ↔ 工作台 ── */
let atHome=true, _homeT=null, _introDone=false, introT0=null;
function showHome(){
  saveLocal();
  atHome=true;
  clearTimeout(_homeT);
  renderDocs();
  const home=el('home');
  if(!_introDone){                                    // hero 描繪只在第一次進站播，之後回主頁直接就位
    _introDone=true;home.classList.add('heroIntro');
    introT0=performance.now();                        // 用主迴圈檢查解除，不靠背景分頁會被延後的 setTimeout
  }
  home.classList.add('on');                           // 主頁淡入蓋住工作台
  _homeT=setTimeout(()=>document.body.classList.add('home'),300);  // 淡入完才收掉工作台
}
function enterWorkbench(id){
  if(id&&!openDoc(id))return;
  atHome=false;
  clearTimeout(_homeT);
  document.body.classList.remove('home');             // 工作台先現身
  el('home').classList.remove('on');                  // 主頁在它上面淡出
  resize();refresh();fitView(true);
}
el('btnDocs').onclick=showHome;
el('dlNew').onclick=async()=>{
  const n=await Ask.text('新專案','名稱','未命名');
  if(n===null)return; newDoc(n.trim()||'未命名'); enterWorkbench(null);};
el('dlImport').onclick=()=>el('file').click();

/* ── 帳號 ── */
function setAuthState(user){
  const n=el('acctName'), av=el('avatar'), b=el('btnAuth');
  if(user){
    n.innerHTML='已登入<b></b>';
    n.querySelector('b').textContent=user.name||user.email||'';
    if(user.photo){av.src=user.photo;av.style.display='block';}
    b.textContent='登出';
  }else{
    n.innerHTML='尚未登入<b>專案存在這台裝置</b>';
    av.style.display='none';av.removeAttribute('src');
    b.textContent='登入';
  }
}
let TL_USER=null;
async function cloudMigrate(){
  const mine=LocalStore.list();
  if(!mine.length)return;
  try{ if(localStorage.getItem('trunnionlab:migrated'))return; }catch(e){}
  const ok=await Ask.confirm('複製到你的帳號？',
    '這台裝置有 '+mine.length+' 個專案。要把它們複製到你的帳號，'+
    '之後在別的裝置也能開嗎？本地那份會保留。','複製');
  try{ localStorage.setItem('trunnionlab:migrated','1'); }catch(e){}
  if(!ok)return;
  let n=0;
  mine.forEach(m=>{ const b=LocalStore.read(m.id);
    if(b){ CloudStore.write(m.id,m.name,b,m.parts,LocalStore.thumb(m.id)); n++; } });
  toast('已複製 '+n+' 個專案到帳號。');
}
function onCloudAuth(user){
  TL_USER=user||null;
  if(user){
    setAuthState({name:user.displayName,email:user.email,photo:user.photoURL});
    CloudStore._begin(user.uid);
    _impl=CloudStore;
    setTimeout(cloudMigrate,1400);
  }else{
    CloudStore._end();
    _impl=LocalStore;
    setAuthState(null);
  }
  if(typeof renderDocs==='function')renderDocs();
}
el('btnAuth').onclick=()=>{
  if(!window.__cloud){ toast('雲端服務尚未載入，稍後再試。',true); return; }
  if(TL_USER){ window.__cloud.signOut(); return; }
  window.__cloud.signIn().catch(e=>{
    const c=e&&e.code;
    if(c==='auth/popup-closed-by-user'||c==='auth/cancelled-popup-request')return;
    if(c==='auth/unauthorized-domain'){ toast('這個網域還沒加進 Firebase 的授權清單。',true); return; }
    if(c==='auth/popup-blocked'){ toast('瀏覽器擋掉了登入彈窗，請允許後再試。',true); return; }
    toast('登入失敗：'+(e&&e.message||e),true);
  });
};

/* ── 說明 ──
   內容沿用工作台空狀態的那份，不另外複製一份文字。 */

el('btnGuide').onclick=()=>{
  el('guide').classList.add('on');
  el('guide').scrollTop=0;
};
el('guideClose').onclick=()=>el('guide').classList.remove('on');
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&el('guide').classList.contains('on')){
    e.stopPropagation();el('guide').classList.remove('on');}
},true);

/* 版本印記：用來確認打開的是不是最新版 */
const BUILD='2026.09.12g';
el('build').textContent='版本 '+BUILD;
console.log('TrunnionLab 版本 '+BUILD);
setAuthState(null);
if(window.__cloud){ window.__cloud.onAuth(onCloudAuth); }
else { window.__cloudReady=()=>window.__cloud.onAuth(onCloudAuth); }

/* ── STL ── */
const holeD=()=>{const v=parseFloat(el('comp').value);return HOLE+(isNaN(v)?0:v);};

function busy(on){
  el('expFused').disabled=on||!parts.length;
  el('expParts').disabled=on||!parts.length;
}

function auditAll(hd){
  const rows=[];let bad=0;
  parts.forEach(p=>{
    if(!p.obj.visible)return;
    partPieces(p,hd,0).forEach((pc,i)=>{
      const a=auditTris(trisOf(pc.geo,pc.mat));
      if(a.open||a.dup||a.deg){bad++;
        rows.push(nameOf(p)+(i?(' 第'+(i+1)+'段'):'')+
          ' — 破口 '+a.open+'，重複邊 '+a.dup+'，退化 '+a.deg);}
    });});
  return {bad:bad,rows:rows};
}
// 收集世界座標下的每個實體（微量互穿 0.02 mm，讓布林運算避開完全共平面）
function worldGroups(hd){
  const g=[];
  parts.forEach(p=>{if(!p.obj.visible)return;
    partPieces(p,hd,0.02).forEach(pc=>
      g.push(trisOf(pc.geo,p.obj.matrixWorld.clone().multiply(pc.mat))));});
  return g;
}
el('expFused').onclick=()=>{
  const hd=holeD(),rp=auditAll(hd);
  if(rp.bad){toast('先修好幾何再匯出 — 有 '+rp.bad+' 個實體不水密：\n'+
    rp.rows.slice(0,6).join('\n'),true);return;}
  const groups=worldGroups(hd);
  busy(true);toast('正在做布林聯集…第一次需要下載運算模組。');
  loadManifold().then(w=>{
    const tris=unionTris(w,groups);
    writeSTL(tris,'technic-fused.stl');
    busy(false);
    toast('融合完成 · '+groups.length+' 個實體聯集成單一封閉模型，'+
          tris.length.toLocaleString()+' 個三角形。接合處與斜撐重疊處已真正融為一體。');
  }).catch(err=>{
    // 退路：直接輸出重疊實體，交給切片軟體處理
    const tris=[];groups.forEach(g=>tris.push.apply(tris,g));
    writeSTL(tris,'technic-fused.stl');
    busy(false);
    toast('布林運算模組載入失敗，已改用重疊實體輸出（切片軟體仍可列印，但檢視器會看到交界）。\n'+
          '原因：'+(err&&err.message?err.message:err)+'\n'+
          '若是用 file:// 直接開啟，改用本機伺服器開啟即可，例如在檔案所在資料夾執行：python -m http.server',true);
  });};
el('expParts').onclick=()=>{
  const hd=holeD();
  const rp=auditAll(hd);
  toast(rp.bad
    ? ('有 '+rp.bad+' 個實體不水密：\n'+rp.rows.slice(0,6).join('\n'))
    : ('分件匯出 · 每個實體都通過水密檢查。'),
    rp.bad>0);
  parts.forEach((p,i)=>{if(!p.obj.visible)return;
    setTimeout(()=>{
      const tris=[];
      const gs=partPieces(p,hd,0).map(pc=>trisOf(pc.geo,pc.mat));
      const tag=p.kind==='brace'?'brace-'+p.span.toFixed(1)+'mm':p.defKey;
      const name=String(i+1).padStart(2,'0')+'-'+tag+'.stl';
      if(gs.length===1||!getMF()){ gs.forEach(g=>tris.push.apply(tris,g)); writeSTL(tris,name); }
      else { try{ writeSTL(unionTris(getMF(),gs),name); }
             catch(e){ gs.forEach(g=>tris.push.apply(tris,g)); writeSTL(tris,name); } }
    },i*350);});};

// 每次場景變動後排程自動保存（節流 800ms）
(function(){const _r=refresh;
  refresh=function(){_r.apply(this,arguments);
    if(typeof scheduleSave==='function')scheduleSave();};})();

resize();setView('iso');refresh();
showHome();
// 側孔需要布林運算，先在背景把模組載起來
loadManifold().then(()=>{
  cutSideHolesSoon();          // 若已開著專案，逐格把側孔補上，不凍畫面
  saveLocal();
}).catch(()=>{
  toast('布林模組載入失敗，側孔會暫時畫不出來（其餘功能不受影響）。',true);
}).finally(()=>{
  migrateThumbs();                 // 等側孔幾何就緒後再重截既有縮圖
  if(atHome&&typeof renderDocs==='function')renderDocs();
});
(function loop(){requestAnimationFrame(loop);
  // rAF 只在分頁真的在畫面上跑，用它來解除 .intro 不會被背景分頁的計時器節流卡住
  if(introT0!==null&&performance.now()-introT0>1400){introT0=null;el('home').classList.remove('heroIntro');}
  if(markDirty){markDirty=false;rebuildMarkers();}
  stepCam();stepPulses();updateGizmo();placeSelPanel();
  renderer.render(scene,camera);})();
})();
