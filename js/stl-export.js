// STL 序列化 + manifold-3d（WASM）布林聯集——純幾何/二進位處理，不碰 parts 狀態或 DOM 輸入，
// 只有 dl() 真的操作 DOM（觸發下載）。main.js 也拿這裡的 dl() 給 JSON 存檔用，同一份實作。
import {setMF} from './geometry.js';
const V3=(x,y,z)=>new THREE.Vector3(x,y,z);

export function dl(blob,name){
  const u=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),4000);
}

export function trisOf(geo,mat){
  const g=geo.index?geo.toNonIndexed():geo,pos=g.attributes.position,out=[];
  const a=V3(),b=V3(),c=V3();
  for(let i=0;i<pos.count;i+=3){
    a.fromBufferAttribute(pos,i).applyMatrix4(mat);
    b.fromBufferAttribute(pos,i+1).applyMatrix4(mat);
    c.fromBufferAttribute(pos,i+2).applyMatrix4(mat);
    out.push([a.clone(),b.clone(),c.clone()]);}
  return out;}

export function writeSTL(tris,name){
  const buf=new ArrayBuffer(84+tris.length*50),dv=new DataView(buf);
  dv.setUint32(80,tris.length,true);
  let o=84;const n=V3(),ab=V3(),ac=V3();
  tris.forEach(t=>{
    ab.subVectors(t[1],t[0]);ac.subVectors(t[2],t[0]);
    n.crossVectors(ab,ac).normalize();
    dv.setFloat32(o,n.x,true);dv.setFloat32(o+4,n.y,true);dv.setFloat32(o+8,n.z,true);o+=12;
    t.forEach(v=>{dv.setFloat32(o,v.x,true);dv.setFloat32(o+4,v.y,true);dv.setFloat32(o+8,v.z,true);o+=12;});
    dv.setUint16(o,0,true);o+=2;});
  dl(new Blob([buf],{type:'model/stl'}),name);}

// 水密檢查：每條有向邊只能出現一次，且必須有反向邊配對
export function auditTris(tris){
  const K=v=>v.x.toFixed(3)+','+v.y.toFixed(3)+','+v.z.toFixed(3);
  const m=new Map(); let deg=0;
  tris.forEach(t=>{
    for(let e=0;e<3;e++){
      const a=K(t[e]),b=K(t[(e+1)%3]);
      if(a===b){deg++;continue;}
      const k=a+'>'+b; m.set(k,(m.get(k)||0)+1);
    }});
  let open=0,dup=0;
  m.forEach((c,k)=>{
    if(c>1)dup++;
    const i=k.indexOf('>');
    if(!m.has(k.slice(i+1)+'>'+k.slice(0,i)))open++;});
  return {tri:tris.length,open:open,dup:dup,deg:deg};
}

/* ── 布林聯集：manifold-3d（WASM） ────────────────────
   零件之間的交界要真的融成一體，只能靠布林運算。
   第一次匯出時才載入，載不到就退回「多個重疊實體」。   */
let MF=null,mfPending=null;
export function getMF(){return MF;}
export function loadManifold(){
  if(MF)return Promise.resolve(MF);
  if(mfPending)return mfPending;
  mfPending=import('https://cdn.jsdelivr.net/npm/manifold-3d@2.3.1/manifold.js')
    .then(m=>m.default())
    .then(w=>{w.setup();MF=w;setMF(w);return w;});
  return mfPending;
}

// 三角形湯 → 共用頂點的索引網格（布林運算的前提）
function indexTris(tris){
  const map=new Map(),verts=[],idx=[];
  const K=v=>Math.round(v.x*1e4)+','+Math.round(v.y*1e4)+','+Math.round(v.z*1e4);
  tris.forEach(t=>t.forEach(v=>{
    const k=K(v);let i=map.get(k);
    if(i===undefined){i=verts.length/3;map.set(k,i);verts.push(v.x,v.y,v.z);}
    idx.push(i);}));
  return {vertProperties:new Float32Array(verts),triVerts:new Uint32Array(idx)};
}
function toSolid(w,tris){
  const d=indexTris(tris);
  const mesh=new w.Mesh({numProp:3,vertProperties:d.vertProperties,triVerts:d.triVerts});
  mesh.merge();
  return new w.Manifold(mesh);
}
function solidToTris(m){
  const mesh=m.getMesh(),vp=mesh.vertProperties,tv=mesh.triVerts,np=mesh.numProp||3,out=[];
  for(let i=0;i<tv.length;i+=3){
    const t=[];
    for(let k=0;k<3;k++){const b=tv[i+k]*np;t.push(V3(vp[b],vp[b+1],vp[b+2]));}
    out.push(t);}
  return out;
}
export function unionTris(w,groups){
  const solids=groups.map(g=>toSolid(w,g));
  let u;
  try{
    u=solids.length===1?solids[0]:w.Manifold.union(solids);
    const out=solidToTris(u);
    return out;
  } finally {
    solids.forEach(sd=>{ if(sd!==u){try{sd.delete();}catch(e){}} });
    if(u){try{u.delete();}catch(e){}}
  }
}
