// 自訂對話框（取代 prompt/confirm）——
// sandbox 化的 iframe 會封鎖 prompt/confirm 並靜靜回傳 null，所以一律走頁面內的對話框。
const el=id=>document.getElementById(id);

export const Ask=(function(){
  let done=null;
  const wrap=()=>el('askWrap');
  function close(v){const w=wrap();w.classList.remove('on');
    const f=done;done=null;if(f)f(v);}
  function open(o){
    return new Promise(res=>{
      done=res;
      el('askTitle').textContent=o.title||'';
      el('askBody').textContent=o.body||'';
      const lab=el('askLab'), inp=el('askInput');
      if(o.input){lab.style.display='';inp.style.display='';
        lab.textContent=o.label||'名稱';inp.value=o.value||'';}
      else {lab.style.display='none';inp.style.display='none';}
      el('askYes').textContent=o.yes||'確定';
      el('askYes').className=o.danger?'':'ink';
      wrap().classList.add('on');
      if(o.input)setTimeout(()=>{inp.focus();inp.select();},40);
    });
  }
  el('askNo').onclick=()=>close(null);
  el('askYes').onclick=()=>close(el('askInput').style.display==='none'
    ? true : el('askInput').value);
  el('askInput').addEventListener('keydown',e=>{
    if(e.key==='Enter'){e.preventDefault();close(el('askInput').value);}
    if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close(null);}
  });
  wrap().addEventListener('mousedown',e=>{if(e.target===wrap())close(null);});
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'&&wrap().classList.contains('on')){
      e.stopPropagation();close(null);}
  },true);
  return {
    text:(title,label,value)=>open({title,label,value,input:true}),
    confirm:(title,body,yes)=>open({title,body,yes,danger:true})
  };
})();
