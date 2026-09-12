// 「怎麼開始」教學區塊的展開／收合狀態——
// 第一次來的人預設展開；已經有專案的人預設收起，之後照他自己按過的狀態記住。
const el=id=>document.getElementById(id);
const K='trunnionlab:howto', sec=el('howto'), bar=el('howtoBar');
const read=()=>{try{return localStorage.getItem(K);}catch(e){return null;}};
const write=v=>{try{localStorage.setItem(K,v);}catch(e){}};
function apply(open){
  sec.classList.toggle('fold',!open);
  bar.setAttribute('aria-expanded',open?'true':'false');
}
export function syncHowto(hasProjects){
  if(!sec||!bar)return;
  const saved=read();
  apply(saved===null ? !hasProjects : saved==='open');
}
if(sec&&bar)bar.onclick=()=>{
  const open=sec.classList.contains('fold');
  apply(open);write(open?'open':'shut');
};
