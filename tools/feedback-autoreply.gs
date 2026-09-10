/**
 * TrunnionLab 建議自動回覆
 * ─────────────────────────────────────────────────────────────
 * 跑在 trunnionlab.tw@gmail.com 這個帳號上。每次執行：找出 Web3Forms
 * 送來、還沒回過的建議信，只要對方有留 Email，就寄一封感謝信給他。
 * 完全免費，不用 Web3Forms Pro。
 *
 * 安裝（約 5 分鐘，用 trunnionlab.tw@gmail.com 登入做）：
 *  1. 打開 https://script.google.com  →  「新增專案」
 *  2. 把整份貼進去，蓋掉原本的內容，按存檔（Ctrl+S）
 *  3. 上方函式選 autoReply  →  按 ▶ 執行一次  →  跳出授權就按「允許」
 *     （會要求 Gmail 權限，因為它要幫你收信、寄信）
 *  4. 左側時鐘圖示「觸發條件」 →  右下「新增觸發條件」：
 *       函式：autoReply
 *       事件來源：時間驅動  →  分鐘計時器  →  每 15 分鐘
 *     存檔。完成。
 *
 * 之後想改回覆內容，回來改 REPLY_SUBJECT / REPLY_BODY 存檔即可。
 */

// ─── 設定 ────────────────────────────────────────────────────
var SUBJECT_MATCH   = 'TrunnionLab 使用者建議';    // 要跟網站程式碼裡送出的 subject 一字不差
var MY_ADDRESS      = 'trunnionlab.tw@gmail.com';  // 這個帳號自己的信箱
var PROCESSED_LABEL = 'tl-autoreplied';            // 回過的信會貼這個標籤，避免重複寄
var LOOKBACK_DAYS   = 3;                           // 只看最近幾天的信
var GMAIL_ONLY      = false;                       // true = 只回覆 @gmail.com；false = 任何 Email 都回

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

function autoReply() {
  var label = GmailApp.getUserLabelByName(PROCESSED_LABEL) ||
              GmailApp.createLabel(PROCESSED_LABEL);

  var query = 'subject:("' + SUBJECT_MATCH + '") newer_than:' + LOOKBACK_DAYS +
              'd -label:' + PROCESSED_LABEL;
  var threads = GmailApp.search(query, 0, 50);

  threads.forEach(function (thread) {
    try {
      // 已經有人（你）回過了 → 不要再自動回，只貼標籤
      if (thread.getMessageCount() > 1) { thread.addLabel(label); return; }

      var msg = thread.getMessages()[0];          // Web3Forms 通知信
      var to  = pickEmail(msg.getReplyTo());      // 對方留的 Email 會在 Reply-To

      var bad = !to ||
                to.toLowerCase() === MY_ADDRESS.toLowerCase() ||
                sameEmail(to, msg.getFrom()) ||
                /web3forms|noreply|no-reply|notifications?@/i.test(to);

      if (bad || (GMAIL_ONLY && !/@gmail\.com$/i.test(to))) {
        thread.addLabel(label);                   // 沒留 Email，跳過
        return;
      }

      GmailApp.sendEmail(to, REPLY_SUBJECT, REPLY_BODY, {
        name: 'Robin',
        replyTo: MY_ADDRESS
      });
      thread.addLabel(label);
    } catch (e) {
      console.error(e);                           // 這封不貼標籤，下次再試
    }
  });
}

// 從 "名字 <a@b.com>" 或 "a@b.com" 取出乾淨的信箱
function pickEmail(s) {
  if (!s) return '';
  var m = String(s).match(/[^\s<>"]+@[^\s<>"]+\.[^\s<>"]+/);
  return m ? m[0].replace(/[.,;>]+$/, '') : '';
}

function sameEmail(a, b) {
  return pickEmail(a).toLowerCase() === pickEmail(b).toLowerCase() && pickEmail(a) !== '';
}
