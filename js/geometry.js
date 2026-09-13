// 零件幾何：孔位/樑輪廓/側孔布林切割等純幾何計算，加上零件目錄資料（DEFS/CATS/...）。
// 這裡刻意保留 cbDia()/cbDep() 直接讀 DOM（#cbd/#cbh）——它們是全站唯一、穩定的公差輸入框，
// 不值得為了讓這個模組"看起來更純"而把值一路穿參數傳過來，那樣改動面更大、風險更高。
const el=id=>document.getElementById(id);

// sideCut()/partPieces() 需要的可變狀態，透過 setter 從 main.js 同步——
// 這兩個是主程式控制流程（是否已載入 manifold-3d、restore() 時要不要先跳過側孔）
// 借用到的旗標，本模組不負責決定它們何時改變。
let MF=null;
export function setMF(w){MF=w;}
let SKIP_CUTS=false;
export function setSkipCuts(v){SKIP_CUTS=v;}

/* ── 真實尺寸（mm） ── */
const MOD=8, TH=7.8, R=3.9, HOLE=4.85;

/* ── 零件定義 ──────────────────────────────────────────
   bar = {xs:[孔的位置], rot:繞原點旋轉, off:[平移]}
   sockets 成對（2i = +面, 2i+1 = -面），一對 = 一個孔
   th = 樑厚（薄樑為一半）                                */
function defFrom(bars,th,name,cat){
  const holes=[],seen={};
  bars.forEach(b=>{
    const c=Math.cos(b.rot||0),si=Math.sin(b.rot||0);
    const ox=(b.off&&b.off[0])||0, oy=(b.off&&b.off[1])||0;
    b.xs.forEach(x=>{
      if(b.noface&&b.noface.some(v=>Math.abs(v-x)<0.01))return;  // 此處是橫孔，不開直孔
      if(b.pins&&b.pins.some(v=>Math.abs(v-x)<0.01))return;     // 此處是公頭，不開孔
      const px=x*c+ox, py=x*si+oy, k=px.toFixed(2)+','+py.toFixed(2);
      if(seen[k])return; seen[k]=1; holes.push([px,py]);
    });
  });
  const sockets=[],keys=[];
  holes.forEach(h=>{
    keys.push(h[0].toFixed(2)+','+h[1].toFixed(2));
    sockets.push({pos:[h[0],h[1], th/2],axis:[0,0, 1]});
    sockets.push({pos:[h[0],h[1],-th/2],axis:[0,0,-1]});
  });
  // 公頭插銷：從兩個扁平面各凸出一根，插進別的零件的孔
  bars.forEach(b=>{
    if(!b.pins)return;
    const c=Math.cos(b.rot||0),si=Math.sin(b.rot||0);
    const ox=(b.off&&b.off[0])||0, oy=(b.off&&b.off[1])||0;
    b.pins.forEach(px0=>{
      const px=px0*c+ox, py=px0*si+oy;
      keys.push('P'+px.toFixed(2)+','+py.toFixed(2));
      sockets.push({pos:[px,py, th/2],axis:[0,0, 1],male:true});
      sockets.push({pos:[px,py,-th/2],axis:[0,0,-1],male:true});
    });
  });
  // 側向凸銷：從樑的側邊（寬度方向）水平伸出
  bars.forEach(b=>{
    if(!b.spins)return;
    const c=Math.cos(b.rot||0),si=Math.sin(b.rot||0);
    const ox=(b.off&&b.off[0])||0, oy=(b.off&&b.off[1])||0;
    b.spins.forEach(sp=>{
      const lx=sp.x, ly=sp.s*R;
      const px=lx*c-ly*si+ox, py=lx*si+ly*c+oy;
      const axv=[-sp.s*si, sp.s*c, 0];
      keys.push('Q'+px.toFixed(2)+','+py.toFixed(2));
      sockets.push({pos:[px,py,0],axis:axv,male:true});
      sockets.push({pos:[px,py,0],axis:axv,male:true});   // 佔位配對
    });
  });
  // 側孔：孔軸沿樑的寬度方向（垂直於扁平面），兩個開口在 y = ±R
  bars.forEach(b=>{
    if(!b.side)return;
    const c=Math.cos(b.rot||0),si=Math.sin(b.rot||0);
    const ox=(b.off&&b.off[0])||0, oy=(b.off&&b.off[1])||0;
    b.side.forEach(sx=>{
      [1,-1].forEach(sgn=>{
        const lx=sx, ly=sgn*R;
        const px=lx*c-ly*si+ox, py=lx*si+ly*c+oy;
        const ax=-sgn*si, ay=sgn*c;
        if(sgn>0)keys.push('S'+px.toFixed(2)+','+py.toFixed(2));
        sockets.push({pos:[px,py,0],axis:[ax,ay,0]});
      });
    });
  });
  return {kind:'beam',bars:bars,th:th,sockets:sockets,holeKeys:keys,
          name:name,cat:cat,col:CAT_COL[cat]||0xf2c11c};
}
const span=n=>{const L=(n-1)*MOD,a=[];for(let i=0;i<n;i++)a.push(i*MOD-L/2);return a;};
const from0=n=>{const a=[];for(let i=0;i<n;i++)a.push(i*MOD);return a;};
const DEG=d=>d*Math.PI/180;

const CAT_COL={'直樑':0xf2c11c,'薄樑':0x9ba0a6,'直角樑':0xef7c1e,
  'T 樑':0x4d5157,'彎樑':0xc4281c,'框架':0x2f7bbf,'軸孔樑':0x5b8f3e,
  '凸銷樑':0x8d8f94,'弧形板':0x2f9e8f};
const DEFS={};
// ── 以下皆為正版實際存在的零件，括號為官方零件編號 ──
// 厚直樑
const BEAMS=[[2,'43857'],[3,'32523'],[4,''],[5,'32316'],[7,'32524'],
             [9,'40490'],[11,'32525'],[13,'41239'],[15,'32278']];
// 薄樑（半厚）
const THINS=[[2,'41677'],[3,'6632'],[4,'32449'],[5,'32017'],[6,'32063'],[7,'32065']];
// 直角樑 90°
const L90=[[4,2,'32140'],[5,3,'32526']];
// 薄的直角樑
const L90T=[[3,3,'32056']];
// T 樑
const TEE=[[3,3,'60484']];
// 彎樑：樂高只有一種角度，兩臂夾角 126.87°（官方名稱寫 53.13°，指的是偏離直線的角度）
const BENT=[[4,4,'32348'],[6,4,'6629'],[7,3,'32271']];
const BEND=126.87;

const nm=(t,pn)=>pn?(t+' · '+pn):t;
BEAMS.forEach(q=>DEFS['beam'+q[0]]=defFrom([{xs:span(q[0]),rot:0}],TH,
  nm(q[0]+' 孔',q[1]),'直樑'));
THINS.forEach(q=>DEFS['thin'+q[0]]=defFrom([{xs:span(q[0]),rot:0}],TH/2,
  nm('薄 '+q[0]+' 孔',q[1]),'薄樑'));
L90.forEach(q=>DEFS['L'+q[0]+'_'+q[1]]=defFrom(
  [{xs:from0(q[0]),rot:0},{xs:from0(q[1]),rot:DEG(90)}],TH,
  nm(q[0]+'×'+q[1]+' 直角',q[2]),'直角樑'));
// 8×8 彎樑（角度見下方 BEND8）＋吊在轉角下方的 3 孔橫樑。
// 參數由淨空搜尋決定：橫樑吊出 21mm、兩端各外伸 4mm（外伸段不開孔，
// 供細撐接著），細撐半寬 0.9mm、落在兩臂距轉角 20mm 的非孔位置。
// 如此 18 個孔的孔緣都留有 ≥0.5mm 淨空，且每個孔都能插滿樂高插銷。
(function(){
  const N=8, BL=2*MOD, EXT=4, J=20, W=0.9;
  // 兩臂夾角。改這一個數字即可，下面的 T 與 SD 都由它算出來。
  // 每顆超音波感測器朝外偏 (180-BEND8)/2 度。
  const BEND8=157.5;
  const th=DEG(BEND8), half=th/2;
  // 橫樑吊出距離：讓橫樑端點與臂軸維持 13.4mm 淨距（沿用原設計）
  const T=(13.4+(BL/2+EXT)*Math.cos(half))/Math.sin(half);
  const bx=Math.cos(half), by=Math.sin(half);
  const dx=Math.sin(half), dy=-Math.cos(half);
  const h0=[T*bx-(BL/2)*dx, T*by-(BL/2)*dy];      // 橫樑第一個孔
  const at=t=>[h0[0]+t*dx, h0[1]+t*dy];
  const tipA=at(BL+EXT), tipB=at(-EXT);
  // 超音波感測器：兩臂各一顆，孔距 48mm（6 格），以橫孔固定。
  // 為了讓兩顆本體靠近，整組往轉角內移到 SD=5.5mm（脫離 8mm 格點）。
  // 連帶必須刪掉轉角孔（兩臂共用、且已無用）與 x=48 的正面孔
  // （否則與內移後的側孔只剩 0.45mm 材料）。
  // 角度越尖，兩顆感測器的內側孔越靠近，孔就得往外退。
  // 下表由淨空掃描逐角度求得：每一格都經實測，兩內孔之間至少留 0.90mm 材料。
  // 可用範圍 90°~160°；再尖下去外側孔就會超出臂端。
  const SD_TABLE=[[90,7.85], [92.5,7.65], [95,7.5], [97.5,7.3], [100,7.1], [102.5,6.95], [105,6.8], [107.5,6.6], [110,6.5], [112.5,6.3], [115,6.2], [117.5,6.05], [120,5.9], [122.5,5.8], [125,5.7], [127.5,5.55], [130,5.4], [132.5,5.3], [135,5.2], [137.5,5.1], [140,5], [142.5,4.9], [145,4.8], [147.5,4.7], [150,4.6], [152.5,4.5], [155,4.4], [157.5,4.3], [160,4.2]];
  const SD=(function(a){
    if(a<=SD_TABLE[0][0])return SD_TABLE[0][1];
    const last=SD_TABLE[SD_TABLE.length-1];
    if(a>=last[0])return last[1];
    for(let i=1;i<SD_TABLE.length;i++)
      if(a<=SD_TABLE[i][0])return SD_TABLE[i-1][1];   // 取較保守的一側
    return last[1];
  })(BEND8);
  const sideIdx=[SD, SD+6*MOD];                   // 側孔：x=5.5 與 53.5
  const armXs=[...new Set([0,SD,2*MOD,3*MOD,4*MOD,5*MOD,6*MOD,SD+6*MOD,(N-1)*MOD])]
                .sort((a,b)=>a-b);
  const armSolid=[0,6*MOD,(N-1)*MOD].concat(sideIdx);   // 填實：轉角、x=48、臂端
  const strut=(P,Q)=>{const L=Math.hypot(Q[0]-P[0],Q[1]-P[1]);
    return {xs:[0,L],rot:Math.atan2(Q[1]-P[1],Q[0]-P[0]),off:[P[0],P[1]],
            rw:W,noface:[0,L]};};
  DEFS['B8_8b']=defFrom([
    {xs:armXs,rot:0,  side:sideIdx,noface:armSolid},
    {xs:armXs,rot:th, side:sideIdx,noface:armSolid},
    {xs:[-EXT,0,MOD,BL,BL+EXT],rot:Math.atan2(dy,dx),off:h0,
     noface:[-EXT,BL+EXT]},                        // 橫樑：3 孔＋兩端外伸段
    strut(tipA,[J,0]),
    strut(tipB,[J*Math.cos(th),J*Math.sin(th)])
  ],TH,'8×8 彎樑 '+BEND8+'° · 轉角橫樑 · 自製','彎樑');
})();
L90T.forEach(q=>DEFS['Lt'+q[0]+'_'+q[1]]=defFrom(
  [{xs:from0(q[0]),rot:0},{xs:from0(q[1]),rot:DEG(90)}],TH/2,
  nm('薄 '+q[0]+'×'+q[1]+' 直角',q[2]),'直角樑'));
TEE.forEach(q=>DEFS['T'+q[0]+'_'+q[1]]=defFrom(
  [{xs:span(q[0]),rot:0},{xs:from0(q[1]),rot:DEG(90)}],TH,
  nm(q[0]+'×'+q[1]+' T 形',q[2]),'T 樑'));
BENT.forEach(q=>DEFS['B'+q[0]+'_'+q[1]]=defFrom(
  [{xs:from0(q[0]),rot:0},{xs:from0(q[1]),rot:DEG(BEND)}],TH,
  nm(q[0]+'×'+q[1]+' 彎樑',q[2]),'彎樑'));

// 框架（中央開口）
// 前兩款是一般科技系列；後三款是 SPIKE Prime 導入的框架
const FRAMES=[[7,5,'64179'],[11,5,'64178'],
              [11,7,'39794'],[13,7,''],[15,11,'']];
FRAMES.forEach(q=>{
  const L=q[0],W=q[1];
  // 依 LDraw 官方幾何：每一邊的孔是「一直一橫」交替，正中央為橫孔（側孔）。
  // sideAt() 回傳該邊上屬於橫孔的位置；其餘為一般的直孔。
  // 從角落起算：角落是直孔，緊鄰的下一個一定是橫孔，之後直橫交替。
  // 兩端各自往內數，因此不論邊長奇偶，角落旁邊必定是橫孔。
  const sideAt=n=>{
    const out=[];
    if(n<=5){                            // 5 格邊：角落以外全是橫孔
      for(let i=1;i<n-1;i++) out.push(i*MOD);
      return out;
    }
    for(let i=1;i<n-1;i++){
      const d=Math.min(i,n-1-i);         // 到最近角落的距離
      if(d%2===1) out.push(i*MOD);       // 距角落 1、3、5… 為橫孔
    }
    return out;
  };
  const sL=sideAt(L), sW=sideAt(W);
  // 交替之後，直孔的位置要從面孔清單裡排除，否則同一點會有兩個孔
  const faceAt=(n,sd)=>from0(n).filter(x=>!sd.some(v=>Math.abs(v-x)<0.01));
  DEFS['F'+L+'_'+W]=defFrom([
    {xs:from0(L),rot:0,off:[0,0],           side:sL, noface:sL},
    {xs:from0(L),rot:0,off:[0,(W-1)*MOD],   side:sL, noface:sL},
    {xs:from0(W),rot:DEG(90),off:[0,0],         side:sW, noface:sW},
    {xs:from0(W),rot:DEG(90),off:[(L-1)*MOD,0], side:sW, noface:sW}
  ],TH,nm(W+'×'+L+' 框架',q[2]),'框架');
});
// 兩端為十字軸孔的薄樑
DEFS['ax5']=defFrom([{xs:span(5),rot:0,ax:[-16,16]}],TH/2,
  nm('薄 5 孔 · 兩端軸孔','11478'),'軸孔樑');

// 直 3 格 · 四凸銷（65489）：本體是橫置塊——三個孔全是橫向，
// 四根凸銷從兩端的正反面凸出，與孔垂直
DEFS['snap3']=defFrom([{xs:span(3),rot:0,
  side:[-MOD,0,MOD],noface:[-MOD,0,MOD],pins:[-MOD,MOD]}],TH,
  '直 3 格 · 四凸銷 · 65489','凸銷樑');
// 直角 3×3 · 四凸銷（49130／55615）：一般 L 樑本體（孔皆為正面孔），
// 四根凸銷從兩個外側邊緣水平伸出——各臂在轉角格與末端格各一根
DEFS['snapL']=defFrom([
  {xs:from0(3),rot:0,      spins:[{x:0,s:-1},{x:2*MOD,s:-1}]},
  {xs:from0(3),rot:DEG(90),spins:[{x:0,s: 1},{x:2*MOD,s: 1}]}],TH,
  '直角 3×3 · 四凸銷 · 49130','凸銷樑');

// 弧形板：四分之一圓柱的實心楔形（像滑板 quarter-pipe）——背面是直立的平面，
// 孔位開在背面（一段標準樑孔位，立起來貼齊背面、一半embed進實心楔形裡讓匯出時
// 真正融成一體，一半露在外面給其他零件接）；底面平放；弧面連接兩者。
// 尺寸是連續可調的，不能像其他零件一樣在載入時窮舉——半徑/長度由使用者輸入，
// 動態組出 defKey、動態註冊 DEFS 條目，之後就是一個貨真價實的普通零件。
function arcPlateDef(radius,len){
  const n=Math.max(2,Math.round(len/MOD)+1);
  const dz=Math.max(6,Math.min(radius*0.4,radius-8));   // 孔位在背面上的高度
  const base=defFrom([{xs:span(n),rot:0}],TH,'','');
  // 把樑「立起來」當背面孔位：原本攤平 XY（孔軸 Z）→ 攤平 XZ（孔軸 -Y），
  // 即 rotateX(90°) 的座標映射 (x,y,z)→(x,-z,y)，再沿 Z 平移 dz 到指定高度。
  const sockets=base.sockets.map(s=>({pos:[s.pos[0],-s.pos[2],s.pos[1]+dz],
    axis:[s.axis[0],-s.axis[2],s.axis[1]]}));
  return {kind:'beam',bars:base.bars,th:TH,sockets:sockets,holeKeys:base.holeKeys,
    name:'弧形板 · R'+radius+' · '+len+' mm',cat:'弧形板',col:CAT_COL['弧形板'],
    arcParams:{radius:radius,len:len,dz:dz,n:n}};
}
DEFS['arcPlate']=arcPlateDef(80,64);   // 目錄示範條目，僅供抽屜列表/縮圖使用
function buildArcKey(radius,len){
  return 'arc_R'+radius.toFixed(1)+'_L'+len.toFixed(1);
}
function ensureArcDef(key){
  if(DEFS[key])return key;
  const m=/^arc_R([\d.]+)_L([\d.]+)$/.exec(key);
  if(m)DEFS[key]=arcPlateDef(parseFloat(m[1]),parseFloat(m[2]));
  return key;
}

const CATS=['直樑','薄樑','直角樑','T 樑','彎樑','框架','軸孔樑','凸銷樑','弧形板'];
const KEYS_BY_CAT={};
CATS.forEach(c=>KEYS_BY_CAT[c]=Object.keys(DEFS).filter(k=>DEFS[k].cat===c));

/* ── 零件縮圖：墨線圖鑑風 ── */
function thumb(key){
  const d=DEFS[key];
  const S=0.72,pad=R+2,PIN_OD_T=4.7;
  let x0=1e9,x1=-1e9,y0=1e9,y1=-1e9;
  const bars=d.bars.map(b=>{
    const c=Math.cos(b.rot||0),si=Math.sin(b.rot||0);
    const ox=(b.off&&b.off[0])||0,oy=(b.off&&b.off[1])||0;
    const a=Math.min.apply(null,b.xs),z=Math.max.apply(null,b.xs);
    const q={rw:b.rw,x1:a*c+ox,y1:a*si+oy,x2:z*c+ox,y2:z*si+oy,
             holes:b.xs.map(x=>[x*c+ox,x*si+oy])};
    [[q.x1,q.y1],[q.x2,q.y2]].forEach(w=>{
      x0=Math.min(x0,w[0]);x1=Math.max(x1,w[0]);
      y0=Math.min(y0,w[1]);y1=Math.max(y1,w[1]);});
    return q;});
  const vx=x0-pad,vy=y0-pad,vw=(x1-x0)+pad*2,vh=(y1-y0)+pad*2;
  const FILL='#'+(d.col||0xf2c11c).toString(16).padStart(6,'0');
  const seg=(b,col,w)=>'<line x1="'+b.x1+'" y1="'+b.y1+'" x2="'+b.x2+'" y2="'+b.y2+
      '" stroke="'+col+'" stroke-width="'+w+'" stroke-linecap="round"/>';
  let g='';
  bars.forEach(b=>{g+=seg(b,FILL,2*(b.rw||R));});
  bars.forEach((b,bi)=>{
    const bar=d.bars[bi]||{};
    const ax=bar.ax||[];
    const nf=bar.noface||[], sd=bar.side||[];
    const c=Math.cos(bar.rot||0),si=Math.sin(bar.rot||0);
    // 側孔：畫成貫穿樑寬的細縫
    sd.forEach(sx=>{
      const px=sx*c+((bar.off&&bar.off[0])||0), py=sx*si+((bar.off&&bar.off[1])||0);
      const dx=-si*R, dy=c*R;
      g+='<line x1="'+(px-dx)+'" y1="'+(py-dy)+'" x2="'+(px+dx)+'" y2="'+(py+dy)+
         '" stroke="#1e2024" stroke-width="'+(HOLE*0.5)+'"/>';
    });
    // 面凸銷：兩端外圈
    (bar.pins||[]).forEach(pxx=>{
      const px=pxx*c+((bar.off&&bar.off[0])||0), py=pxx*si+((bar.off&&bar.off[1])||0);
      g+='<circle cx="'+px+'" cy="'+py+'" r="'+(PIN_OD_T/2)+
         '" fill="none" stroke="#1e2024" stroke-width="1.1"/>';
    });
    // 側向凸銷：從側邊伸出的短棒
    (bar.spins||[]).forEach(sp=>{
      const lx=sp.x, ly=sp.s*R;
      const px=lx*c-ly*si+((bar.off&&bar.off[0])||0);
      const py=lx*si+ly*c+((bar.off&&bar.off[1])||0);
      const ex=px+(-sp.s*si)*6, ey=py+(sp.s*c)*6;
      g+='<line x1="'+px+'" y1="'+py+'" x2="'+ex+'" y2="'+ey+
         '" stroke="'+FILL+'" stroke-width="'+PIN_OD_T+'" stroke-linecap="round"/>';
    });
    b.holes.forEach((h,hi)=>{
      if(nf.some(v=>Math.abs(v-bar.xs[hi])<0.01))return;   // 此處無面孔
      const isAx=ax.some(v=>Math.abs(v-bar.xs[hi])<0.01);
      if(isAx){
        const e=AXW/2,t=AXS/2;
        g+='<path d="M'+(h[0]-e)+' '+(h[1]-t)+'h'+(e-t)+'v'+(-(e-t))+'h'+(2*t)+
           'v'+(e-t)+'h'+(e-t)+'v'+(2*t)+'h'+(-(e-t))+'v'+(e-t)+'h'+(-2*t)+
           'v'+(-(e-t))+'h'+(-(e-t))+'z" fill="#1e2024"/>';
      } else {
        g+='<circle cx="'+h[0]+'" cy="'+h[1]+'" r="'+(HOLE/2)+'" fill="#1e2024"/>';
      }
    });});
  return '<svg width="'+(vw*S).toFixed(1)+'" height="'+(vh*S).toFixed(1)+
    '" viewBox="'+vx+' '+vy+' '+vw+' '+vh+'">'+g+'</svg>';
}

/* ── 幾何 ─────────────────────────────────────────────
   一根樑 = 一個封閉實體（watertight）：
   上下蓋帶孔 + 外側壁 + 階梯狀孔內壁（沉孔／主孔／沉孔）
   不用疊片，因此沒有內部重合面，匯出的 STL 不會破        */
function cbDia(){const v=parseFloat((el('cbd')||{}).value);return isNaN(v)?6.10:v;}
function cbDep(){const v=parseFloat((el('cbh')||{}).value);return isNaN(v)?0.80:v;}

const CSEG=28, HSEG=24;
// 膠囊外框，逆時針
function barContour(xs,rw){
  const RW=(rw===undefined||rw===null)?R:rw;
  const a=Math.min.apply(null,xs), b=Math.max.apply(null,xs), P=[];
  for(let i=0;i<=CSEG;i++){const t=-Math.PI/2+i/CSEG*Math.PI;
    P.push(new THREE.Vector2(b+RW*Math.cos(t), RW*Math.sin(t)));}
  for(let i=0;i<=CSEG;i++){const t=Math.PI/2+i/CSEG*Math.PI;
    P.push(new THREE.Vector2(a+RW*Math.cos(t), RW*Math.sin(t)));}
  return P;
}
// 孔環，順時針（孔的內壁法線要朝軸心）
function ring(cx,r){
  const P=[];
  for(let i=0;i<HSEG;i++){const t=-i/HSEG*Math.PI*2;
    P.push(new THREE.Vector2(cx+r*Math.cos(t), r*Math.sin(t)));}
  return P;
}
// 十字軸孔：across = 對邊全長，slot = 十字臂寬。同樣順時針
const AXW=5.0, AXS=2.0;
function cross(cx,across,slot){
  const e=across/2, t=slot/2;
  const ccw=[[e,t],[t,t],[t,e],[-t,e],[-t,t],[-e,t],
             [-e,-t],[-t,-t],[-t,-e],[t,-e],[t,-t],[e,-t]];
  const P=[];
  for(let i=ccw.length-1;i>=0;i--)P.push(new THREE.Vector2(cx+ccw[i][0],ccw[i][1]));
  return P;
}
function pushWall(T,pts,zb,zt){
  const n=pts.length;
  for(let i=0;i<n;i++){
    const p0=pts[i], p1=pts[(i+1)%n];
    T.push(p0.x,p0.y,zb, p1.x,p1.y,zb, p1.x,p1.y,zt);
    T.push(p0.x,p0.y,zb, p1.x,p1.y,zt, p0.x,p0.y,zt);
  }
}
// 環狀肩部；up=true 表示朝 +Z
function pushRing(T,inner,outer,z,up){
  const n=inner.length;
  for(let i=0;i<n;i++){
    const a=inner[i],b=outer[i],c=outer[(i+1)%n],d=inner[(i+1)%n];
    if(up){ T.push(a.x,a.y,z, c.x,c.y,z, b.x,b.y,z);
            T.push(a.x,a.y,z, d.x,d.y,z, c.x,c.y,z); }
    else  { T.push(a.x,a.y,z, b.x,b.y,z, c.x,c.y,z);
            T.push(a.x,a.y,z, c.x,c.y,z, d.x,d.y,z); }
  }
}
// 每個孔的規格：hd 主孔徑、cd 沉孔徑、ch 沉孔深（0 表示直孔）
function holeKeyAt(b,x){
  const c=Math.cos(b.rot||0),si=Math.sin(b.rot||0);
  const ox=(b.off&&b.off[0])||0, oy=(b.off&&b.off[1])||0;
  return (x*c+ox).toFixed(2)+','+(x*si+oy).toFixed(2);
}
function holeSpec(xs,hd,th,ax,bar,modes){
  const ch=Math.min(cbDep(),th/2-0.3);
  const comp=hd-HOLE;
  const AX=()=>({axle:true,aw:AXW+comp,as:AXS+comp,hd:hd,cd:0,ch:0});
  return xs.map(x=>{
    if(bar&&bar.noface&&bar.noface.some(v=>Math.abs(v-x)<0.01))
      return {solid:true,hd:hd,cd:0,ch:0};   // 這個位置改成橫孔，直孔不挖
    const m=(bar&&modes)?modes[holeKeyAt(bar,x)]:null;
    if(m==='solid'||m==='pfill')return {solid:true,hd:hd,cd:0,ch:0};
    if(m==='cross')return AX();
    if(m==='round')return {hd:hd,cd:cbDia(),ch:ch};
    const isAx=ax&&ax.some(v=>Math.abs(v-x)<0.01);
    return isAx ? AX() : {hd:hd,cd:cbDia(),ch:ch};
  });
}
function clampSpec(xs,spec,RWC){
  // 只有「真的有孔」的位置才參與最小間距計算；
  // 填實與外伸段不是孔，不該把沉孔壓小（曾造成沉孔整根消失）
  const hx=xs.filter((x,i)=>!spec[i].solid).sort((a,b)=>a-b);
  let minGap=1e9;
  for(let i=1;i<hx.length;i++)minGap=Math.min(minGap,Math.abs(hx[i]-hx[i-1]));
  spec.forEach(sp=>{
    if(sp.axle){sp.ch=0;return;}
    if(sp.ch>0.05){
      sp.cd=Math.min(sp.cd, hx.length>1?minGap-0.8:1e9, 2*(RWC||R)-1.0);
      if(!(sp.cd>sp.hd+0.01))sp.ch=0;
    } else sp.ch=0;
  });
  return spec;
}
function barSolidSpec(xs,spec,th,rw){
  clampSpec(xs,spec,rw);
  const zb=-th/2, zt=th/2;
  const contour=barContour(xs,rw);
  const idx=[],holes=[];
  xs.forEach((x,k)=>{
    if(spec[k].solid)return;              // 填實：這個孔不挖
    idx.push(k);
    holes.push(spec[k].axle ? cross(x,spec[k].aw,spec[k].as)
                            : ring(x, spec[k].ch>0 ? spec[k].cd/2 : spec[k].hd/2));
  });
  const faces=THREE.ShapeUtils.triangulateShape(contour,holes);
  let verts=contour.slice();
  holes.forEach(h=>{verts=verts.concat(h);});
  const T=[];
  faces.forEach(f=>{
    const A=verts[f[0]],B=verts[f[1]],C=verts[f[2]];
    T.push(A.x,A.y,zt, B.x,B.y,zt, C.x,C.y,zt);   // 上蓋
    T.push(A.x,A.y,zb, C.x,C.y,zb, B.x,B.y,zb);   // 下蓋，反向
  });
  pushWall(T,contour,zb,zt);                       // 外壁
  idx.forEach((k,j)=>{
    const x=xs[k],sp=spec[k],outer=holes[j];
    if(sp.ch>0){
      const inner=ring(x,sp.hd/2);
      pushWall(T,outer,zb,zb+sp.ch);               // 下沉孔
      pushRing(T,inner,outer,zb+sp.ch,false);      // 下肩部
      pushWall(T,inner,zb+sp.ch,zt-sp.ch);         // 主孔
      pushRing(T,inner,outer,zt-sp.ch,true);       // 上肩部
      pushWall(T,outer,zt-sp.ch,zt);               // 上沉孔
    } else {
      pushWall(T,outer,zb,zt);
    }
  });
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(T,3));
  g.computeVertexNormals();
  return g;
}
function barSolid(xs,hd,th,ax,bar,modes,rw){
  return barSolidSpec(xs,holeSpec(xs,hd,th,ax,bar,modes),th,rw);
}
// 把側孔真的挖穿。零件幾何是靜態的，所以只在建立網格時算一次
// 側孔（橫孔）挖除。
// cuts 是「零件座標系」的清單，因此一個孔會挖穿零件裡所有的樑，
// 而不是只挖它自己那根 —— 轉角處兩臂互相重疊時這點是必要的。
function sideCut(geo,cuts,r,th,rot,off){
  if(!MF||!cuts||!cuts.length)return geo;
  try{
    const ct=Math.cos(-rot), st=Math.sin(-rot);
    const oxb=(off&&off[0])||0, oyb=(off&&off[1])||0;
    const toLocal=(x,y)=>{const dx=x-oxb, dy=y-oyb;
      return [dx*ct-dy*st, dx*st+dy*ct];};
    let sol=toSolid(MF,trisOf(geo,new THREE.Matrix4()));
    cuts.forEach(c=>{
      const deg=(c.ang-rot)*180/Math.PI;
      const P=toLocal(c.x,c.y);
      let cut=MF.Manifold.cylinder(2*R+8,r,r,28,true)
        .rotate([90,0,0]).rotate([0,0,deg]).translate([P[0],P[1],0]);
      if(c.cb){
        c.cb.forEach(q=>{
          const Q=toLocal(q[0],q[1]);
          const cb=MF.Manifold.cylinder(c.ch+0.01,c.cd/2,c.cd/2,28,true)
            .rotate([90,0,0]).rotate([0,0,deg]).translate([Q[0],Q[1],0]);
          const u=MF.Manifold.union(cut,cb);cut.delete();cb.delete();cut=u;
        });
      }
      const nx=MF.Manifold.difference(sol,cut);
      sol.delete();cut.delete();sol=nx;
    });
    const tris=solidToTris(sol);sol.delete();
    const pos=[];
    tris.forEach(t=>t.forEach(v=>pos.push(v.x,v.y,v.z)));
    const g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
    g.computeVertexNormals();
    return g;
  }catch(e){console.warn('sideCut 失敗',e);return geo;}
}
// 把每根樑的 side 清單換算成零件座標系的挖除描述
function sideCutList(bars,th,holeD){
  const out=[];
  bars.forEach(b=>{
    if(!b.side||!b.side.length)return;
    const rw=b.rw||R;
    const cd=Math.min(cbDia(), th-1.2);
    const ch=Math.min(cbDep(), rw-0.6);
    const useCb=(ch>0.05 && cd>holeD+0.01);   // 沉孔必須比主孔大才有意義
    const ro=b.rot||0, c=Math.cos(ro), sn=Math.sin(ro);
    const ox=(b.off&&b.off[0])||0, oy=(b.off&&b.off[1])||0;
    const toPart=(x,y)=>[ox+x*c-y*sn, oy+x*sn+y*c];
    b.side.forEach(sx=>{
      const P=toPart(sx,0);
      const o={x:P[0],y:P[1],ang:ro,cd:cd,ch:ch};
      if(useCb)o.cb=[toPart(sx,rw-ch/2), toPart(sx,-(rw-ch/2))];
      out.push(o);
    });
  });
  return out;
}
// 公頭插銷：從樑的兩個面各凸出一根，尺寸比孔略小
const PIN_OD=4.72, PIN_LEN=7.8;
function pinPieces(bar,th,comp){
  const out=[], r=(PIN_OD-(comp||0))/2;
  (bar.pins||[]).forEach(x=>{
    [1,-1].forEach(sg=>{
      const g=new THREE.CylinderGeometry(r,r,PIN_LEN,20);
      g.rotateX(Math.PI/2);
      g.translate(x,0,sg*(th/2+PIN_LEN/2));
      out.push(g);
    });
  });
  return out;
}
function partPieces(p,holeD,grow){
  const brace=(p.kind==='brace');
  const th=(brace?TH:(DEFS[p.defKey].th||TH))+(grow||0);
  const bars=brace?[{xs:[-p.span/2,p.span/2],rot:0}]:DEFS[p.defKey].bars;
  const arc=!brace&&DEFS[p.defKey].arcParams;
  if(arc){
    // 背面孔位薄片：先照普通樑生成（攤平 XY、孔軸 Z），再立起來（rotateX 90°）
    // 貼到背面、沿 Z 抬到 dz 高度——跟 arcPlateDef() 算 sockets 用的是同一個映射，
    // 一半 embed 進楔形實心裡（匯出時真正融合），一半露在外面給其他零件接。
    const b=bars[0];
    const tab=barSolid(b.xs,holeD,th,b.ax,b,p.hmode,b.rw);
    tab.rotateX(Math.PI/2); tab.translate(0,0,arc.dz);
    const out=[{geo:tab,mat:new THREE.Matrix4()},
               {geo:arcWedgeGeo(arc.radius,arc.len),mat:new THREE.Matrix4()}];
    // 安裝片跟楔形主體之間加兩根斜撐（仿自製彎樑 B8_8b 那種轉角斜撐的作法），
    // 避免安裝片只靠一小段融合面懸空、受力容易被扳斷。
    const rw=b.rw||R, tabHalf=Math.max(rw+2,((arc.n-1)*MOD)/2-(rw+3));
    const bz=Math.max(2, arc.dz*0.35);   // 越靠近底部材料越厚，往下撐比較安全
    [-1,1].forEach(sg=>{
      const ex=sg*tabHalf;
      out.push({geo:strutBetween([ex,-th/2+1,arc.dz],[ex,2,bz],1.3),
                 mat:new THREE.Matrix4()});
    });
    return out;
  }
  const out=[];
  const cuts=sideCutList(bars,th,holeD);
  const main=bars.map(b=>{
    let g=barSolid(b.xs,holeD,th,b.ax,b,p.hmode,b.rw);
    if(cuts.length&&!SKIP_CUTS)g=sideCut(g,cuts,holeD/2,th,b.rot||0,b.off);
    // 旋轉與位移直接寫進頂點，不經過物件層的矩陣分解
    const rot=b.rot||0, ox=(b.off&&b.off[0])||0, oy=(b.off&&b.off[1])||0;
    const place=gg=>{ if(rot)gg.rotateZ(rot); if(ox||oy)gg.translate(ox,oy,0); return gg; };
    place(g);
    pinPieces(b,th,holeD-HOLE).forEach(pg=>
      out.push({geo:place(pg), mat:new THREE.Matrix4()}));
    return {geo:g, mat:new THREE.Matrix4()};
  });
  return main.concat(out);
}
// 兩點之間的斜撐圓桿（仿自製彎樑 B8_8b 的 strut() 手法，只是那邊是攤平 XY 的膠囊樑，
// 這裡兩個端點可以在任意 3D 方向，所以直接生成一根圓柱再轉到瞄準方向）
function strutBetween(A,B,rStrut){
  const dx=B[0]-A[0], dy=B[1]-A[1], dz=B[2]-A[2];
  const len=Math.max(0.5,Math.hypot(dx,dy,dz));
  const g=new THREE.CylinderGeometry(rStrut,rStrut,len,10);
  const dir=new THREE.Vector3(dx,dy,dz).normalize();
  const q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),dir);
  g.applyQuaternion(q);
  g.translate((A[0]+B[0])/2,(A[1]+B[1])/2,(A[2]+B[2])/2);
  return g;
}
// 實心楔形，凹面朝內（像溜滑梯/quarter-pipe 的騎乘面）：局部座標 X=長度方向（沿此排孔）、
// Y=深度（0=背面...radius=前緣）、Z=高度（0=底面...radius=背面頂端）。背板（Y=0）跟底面
// （Z=0）都是完整的一整條邊；剖面是「整個正方形挖掉以遠角 (radius,radius) 為圓心的四分之一
// 圓」——弧面從 (radius,0) 凹向原點、彎到 (0,radius)，原點那個直角本身仍是實心。
// 頂端（背板最高處）切掉一小塊平面（cut），不留一條印不出來的刀鋒薄邊。
// 跟 barSolidSpec 同一套手法（2D 剖面三角化當封蓋、繞外框生成側壁），只是擠出方向換成 X。
function arcWedgeGeo(radius,len){
  const cut=Math.min(radius*0.08,5);
  const tEnd=Math.PI+Math.asin(Math.min(1,cut/radius));
  const N=Math.max(8,Math.min(48,Math.ceil(radius/4)));
  const half=len/2;
  const prof=[new THREE.Vector2(0,0)];
  for(let i=0;i<=N;i++){const t=Math.PI*1.5-i/N*(Math.PI*1.5-tEnd);
    prof.push(new THREE.Vector2(radius+radius*Math.cos(t), radius+radius*Math.sin(t)));}
  prof.push(new THREE.Vector2(0, radius+radius*Math.sin(tEnd)));   // 頂端小平面
  const faces=THREE.ShapeUtils.triangulateShape(prof,[]);
  const T=[];
  faces.forEach(f=>{
    const A=prof[f[0]],B=prof[f[1]],C=prof[f[2]];
    T.push(-half,A.x,A.y, -half,C.x,C.y, -half,B.x,B.y);   // X=-half 封蓋
    T.push( half,A.x,A.y,  half,B.x,B.y,  half,C.x,C.y);   // X=+half 封蓋
  });
  for(let i=0;i<prof.length;i++){
    const p0=prof[i], p1=prof[(i+1)%prof.length];
    T.push(-half,p0.x,p0.y,  half,p0.x,p0.y,  half,p1.x,p1.y);
    T.push(-half,p0.x,p0.y,  half,p1.x,p1.y,  -half,p1.x,p1.y);
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(T,3));
  g.computeVertexNormals();
  return g;
}

const SHORT={'直樑':'直','薄樑':'薄','直角樑':'L','T 樑':'T','彎樑':'彎','框架':'框','軸孔樑':'軸','凸銷樑':'銷','弧形板':'弧'};

export {MOD,TH,R,HOLE,DEFS,CATS,KEYS_BY_CAT,CAT_COL,SHORT,
  cbDia,cbDep,thumb,barSolid,barSolidSpec,sideCutList,partPieces,
  arcPlateDef,arcWedgeGeo,buildArcKey,ensureArcDef};
