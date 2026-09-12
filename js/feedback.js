// 「給作者建議」表單——送到 Web3Forms，收件信箱本身不會出現在原始碼裡，只有這把 key。
const el=id=>document.getElementById(id);
const W3F_KEY='b349d287-3541-4e76-b80e-dc4c630229d7';
// 對方有留 Email 時，立刻打一下這個 Apps Script Web App 讓它寄感謝信。
// 部署 tools/feedback-autoreply.gs 成 Web App 後，把 /exec 網址貼進 AUTOREPLY_URL。
// 空字串 = 沒設定，就退回「腳本定時掃信箱」那條路。
const AUTOREPLY_URL='https://script.google.com/macros/s/AKfycbzyDJWWo4AkbCSEb3Dea6ZYWiwctDFW9f1-8fslvy6H8yt0dqggY2pLQdCtJoaLeaOIBA/exec';
const AUTOREPLY_TOKEN='tl_f276f5ae134abd5a6e786ca9';
(function(){
  const btn=el('fbBtn'), wrap=el('fbWrap'), tx=el('fbText'), mail=el('fbMail'),
        cnt=el('fbCount'), meta=el('fbMeta'), note=el('fbNote'),
        send=el('fbSend'), honey=el('fbHoney');
  if(!btn)return;
  const open=()=>{wrap.classList.add('on');setTimeout(()=>tx.focus(),40);};
  const close=()=>{wrap.classList.remove('on');note.textContent='';note.className='';};
  btn.onclick=open;
  el('fbCancel').onclick=close;
  wrap.addEventListener('mousedown',e=>{if(e.target===wrap)close();});
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'&&wrap.classList.contains('on')){e.stopPropagation();close();}
  },true);
  const upd=()=>{const n=tx.value.length;cnt.textContent=n+' / 2000';
    meta.classList.toggle('over',n>=2000);};
  tx.addEventListener('input',upd);upd();

  send.onclick=async()=>{
    const body=tx.value.trim();
    if(body.length<5){note.className='err';note.textContent='再多寫一點吧';return;}
    if(honey.value){close();return;}                    // 機器人
    if(W3F_KEY.indexOf('PASTE_')===0){
      note.className='err';note.textContent='作者尚未設定收件金鑰';return;}
    send.disabled=true;note.className='';note.textContent='送出中…';
    try{
      const r=await fetch('https://api.web3forms.com/submit',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          access_key:W3F_KEY,
          subject:'TrunnionLab 使用者建議',
          from_name:'TrunnionLab',
          message:body,
          email:mail.value.trim()||undefined,
          screen:innerWidth+'×'+innerHeight,
          ua:navigator.userAgent
        })});
      const j=await r.json();
      if(j.success){
        const gave=mail.value.trim();
        note.className='ok';note.textContent='已送出，謝謝你';
        tx.value='';mail.value='';upd();setTimeout(close,1100);
        if(gave&&AUTOREPLY_URL)fetch(AUTOREPLY_URL,{method:'POST',mode:'no-cors',
          body:new URLSearchParams({token:AUTOREPLY_TOKEN,email:gave})}).catch(()=>{});
      }
      else{note.className='err';note.textContent='送出失敗：'+(j.message||'未知錯誤');}
    }catch(err){note.className='err';note.textContent='送出失敗，請檢查網路連線';}
    send.disabled=false;
  };

})();
