// 共用的提示訊息（成功/失敗都走這個），純 DOM，沒有其他依賴。
export function toast(msg,bad){
  const t=document.getElementById('toast');t.textContent=msg;
  t.className=(bad?'bad ':'')+'show';
  clearTimeout(toast._t);toast._t=setTimeout(function(){t.classList.remove('show');},10000);
}
