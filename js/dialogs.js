// 自訂對話框（取代 prompt/confirm）——
// sandbox 化的 iframe 會封鎖 prompt/confirm 並靜靜回傳 null，所以一律走頁面內的對話框。
const el=id=>document.getElementById(id);

export const Ask=(function(){
  let done=null;
  const wrap=()=>el('askWrap');
  function close(v){const w=wrap();w.classList.remove('on');
    const f=done;done=null;if(f)f(v);}
  let numFields=null;
  function readNums(){
    const out={};
    numFields.forEach(f=>{
      const v=parseFloat(el('askNum_'+f.key).value);
      out[f.key]=(isNaN(v)?f.def:Math.max(f.min,Math.min(f.max,v)));
    });
    return out;
  }
  function open(o){
    return new Promise(res=>{
      done=res;
      el('askTitle').textContent=o.title||'';
      el('askBody').textContent=o.body||'';
      const lab=el('askLab'), inp=el('askInput'), nums=el('askNums');
      if(o.fields){
        lab.style.display='none';inp.style.display='none';
        numFields=o.fields;nums.style.display='';nums.innerHTML='';
        o.fields.forEach(f=>{
          const row=document.createElement('div');row.className='numRow';
          row.innerHTML='<label for="askNum_'+f.key+'">'+f.label+'</label>'+
            '<input id="askNum_'+f.key+'" type="number" value="'+f.def+
            '" min="'+f.min+'" max="'+f.max+'" step="'+(f.step||1)+'">';
          nums.appendChild(row);
        });
      } else if(o.input){
        nums.style.display='none';numFields=null;
        lab.style.display='';inp.style.display='';
        lab.textContent=o.label||'名稱';inp.value=o.value||'';
      } else {
        nums.style.display='none';numFields=null;
        lab.style.display='none';inp.style.display='none';
      }
      el('askYes').textContent=o.yes||'確定';
      el('askYes').className=o.danger?'':'ink';
      wrap().classList.add('on');
      if(o.input)setTimeout(()=>{inp.focus();inp.select();},40);
      if(o.fields)setTimeout(()=>{const first=el('askNum_'+o.fields[0].key);
        if(first){first.focus();first.select();}},40);
    });
  }
  function confirmVal(){
    if(numFields)return readNums();
    return el('askInput').style.display==='none' ? true : el('askInput').value;
  }
  el('askNo').onclick=()=>close(null);
  el('askYes').onclick=()=>close(confirmVal());
  el('askInput').addEventListener('keydown',e=>{
    if(e.key==='Enter'){e.preventDefault();close(el('askInput').value);}
    if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close(null);}
  });
  el('askNums').addEventListener('keydown',e=>{
    if(e.key==='Enter'){e.preventDefault();close(readNums());}
    if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close(null);}
  });
  wrap().addEventListener('mousedown',e=>{if(e.target===wrap())close(null);});
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'&&wrap().classList.contains('on')){
      e.stopPropagation();close(null);}
  },true);
  return {
    text:(title,label,value)=>open({title,label,value,input:true}),
    confirm:(title,body,yes)=>open({title,body,yes,danger:true}),
    numbers:(title,fields)=>open({title,fields})
  };
})();
