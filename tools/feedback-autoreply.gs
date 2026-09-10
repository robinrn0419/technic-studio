/**
 * TrunnionLab 建議自動回覆
 * ─────────────────────────────────────────────────────────────
 * 跑在 trunnionlab.tw@gmail.com。對方在建議表單留了 Email 時，寄一封感謝信給他。
 * 免費，不用 Web3Forms Pro。
 *
 * 有兩條路，選一條（或都留著）：
 *
 *  A. 立刻回（建議）——「部署成 Web App」
 *     網站送出建議時會直接打這支腳本，幾秒內就寄出感謝信。
 *     1. https://script.google.com → 新增專案 → 貼上整份 → 存檔
 *     2. 右上「部署」→「新增部署作業」→ 類型選「網頁應用程式」
 *          執行身分：我（trunnionlab.tw@gmail.com）
 *          誰可以存取：所有人
 *        → 部署 → 授權（跳「未驗證」就 進階 → 前往…（不安全）→ 允許）
 *     3. 複製那個 .../exec 網址，貼到 index.html 的 AUTOREPLY_URL
 *     4. index.html 的 AUTOREPLY_TOKEN 要跟這裡的 SHARED_TOKEN 一致（已對好）
 *     這條路走通了就不需要下面 B 的觸發條件。
 *
 *  B. 定時回（備援 / 或懶得部署 Web App）——「時間觸發」
 *     1~2 同上（貼上、存檔）
 *     3. 左側時鐘圖示 → 新增觸發條件：函式 autoReply、時間驅動、
 *        分鐘計時器、每 1 分鐘（最快就是 1 分鐘）
 *     4. 先手動跑一次 autoReply 完成授權
 */

// ─── 設定 ────────────────────────────────────────────────────
var MY_ADDRESS      = 'trunnionlab.tw@gmail.com';  // 這個帳號自己的信箱
var SHARED_TOKEN    = 'tl_f276f5ae134abd5a6e786ca9'; // 要跟 index.html 的 AUTOREPLY_TOKEN 一致
var GMAIL_ONLY      = false;                       // true = 只回覆 @gmail.com
var DAILY_CAP       = 40;                          // 一天最多寄幾封（防濫用）

var SUBJECT_MATCH   = 'TrunnionLab 使用者建議';    // B 方案用：Web3Forms 送來的信件主旨
var PROCESSED_LABEL = 'tl-autoreplied';
var LOOKBACK_DAYS   = 3;

var REPLY_SUBJECT = '收到你的建議了 — TrunnionLab';

var REPLY_BODY =
  '你好，\n\n' +
  '謝謝你花時間寫這封建議。\n\n' +
  'TrunnionLab 是我一個人做的專案，沒有團隊、沒有客服。每一封建議我都會親自看完，這封也不例外。\n\n' +
  '如果你回報的是問題，我會先確認能不能重現；如果是想要的功能或零件，我會評估可行性再排進去。不是每一項都做得到，但每一項我都會認真想過。有進展的話我會再回信給你。\n\n' +
  '這個工具能長成現在的樣子，靠的就是有人願意告訴我哪裡不對。謝謝你成為其中一個。\n\n' +
  'Robin\n' +
  'TrunnionLab · 科技零件工作台\n' +
  'https://robinrn0419.github.io/technic-studio/\n\n' +
  '（這封是自動回覆，確認你的建議已經送達。回信我會看到。）';
// ────────────────────────────────────────────────────────────

/* ═══ A：Web App —— 網站送出建議時直接打這裡，立刻回 ═══ */
function doPost(e) {
  var out = ContentService.createTextOutput('ok');
  try {
    var p = (e && e.parameter) || {};
    if (p.token !== SHARED_TOKEN) return out;              // 擋掉隨手打的
    if (!sendThanks(pickEmail(p.email), 'webapp')) return out;
  } catch (err) { console.error(err); }
  return out;
}

/* ═══ B：定時掃信箱 —— 備援，或不想部署 Web App 時用 ═══ */
function autoReply() {
  var label = GmailApp.getUserLabelByName(PROCESSED_LABEL) ||
              GmailApp.createLabel(PROCESSED_LABEL);
  var query = 'subject:("' + SUBJECT_MATCH + '") newer_than:' + LOOKBACK_DAYS +
              'd -label:' + PROCESSED_LABEL;

  GmailApp.search(query, 0, 50).forEach(function (thread) {
    try {
      if (thread.getMessageCount() > 1) { thread.addLabel(label); return; }
      var msg = thread.getMessages()[0];
      var to  = pickEmail(msg.getReplyTo());
      if (sameEmail(to, msg.getFrom()) || /web3forms|noreply|no-reply|notifications?@/i.test(to)) to = '';
      sendThanks(to, 'poll');
      thread.addLabel(label);
    } catch (err) { console.error(err); }
  });
}

/* ═══ 共用：寄感謝信（含防重複、每日上限） ═══ */
function sendThanks(to, src) {
  if (!to || to.toLowerCase() === MY_ADDRESS.toLowerCase()) return false;
  if (GMAIL_ONLY && !/@gmail\.com$/i.test(to)) return false;

  var cache = CacheService.getScriptCache();
  var ckey  = 'sent:' + to.toLowerCase();
  if (cache.get(ckey)) return false;                       // 10 分鐘內同一信箱不重寄

  var props = PropertiesService.getScriptProperties();
  var dkey  = 'count:' + new Date().toISOString().slice(0, 10);
  var n = Number(props.getProperty(dkey) || 0);
  if (n >= DAILY_CAP) { console.warn('daily cap hit'); return false; }

  GmailApp.sendEmail(to, REPLY_SUBJECT, REPLY_BODY, { name: 'Robin', replyTo: MY_ADDRESS });
  cache.put(ckey, '1', 600);
  props.setProperty(dkey, String(n + 1));
  console.log('replied ' + to + ' (' + src + ')');
  return true;
}

// 從 "名字 <a@b.com>" 或 "a@b.com" 取出乾淨的信箱
function pickEmail(s) {
  if (!s) return '';
  var m = String(s).match(/[^\s<>"]+@[^\s<>"]+\.[^\s<>"]+/);
  return m ? m[0].replace(/[.,;>]+$/, '') : '';
}
function sameEmail(a, b) {
  return pickEmail(a) !== '' && pickEmail(a).toLowerCase() === pickEmail(b).toLowerCase();
}
