/* app.js — חיבור הצ'אט, הטאבים והפעולות */
(function () {

  const chatLog = document.getElementById('chatLog');
  const form = document.getElementById('composer');
  const input = document.getElementById('chatInput');
  const toastEl = document.getElementById('toast');

  let pendingReset = false;

  /* ---------------- הודעות ---------------- */

  function bubble(role, html, persist = true) {
    const div = U.el('div', 'msg ' + role, html);
    chatLog.appendChild(div);
    chatLog.scrollTop = chatLog.scrollHeight;
    if (persist) Store.pushChat(role, html);
    return div;
  }

  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => toastEl.classList.remove('show'), 2200);
  }

  /* ---------------- שליחה ---------------- */

  function send(text) {
    text = String(text || '').trim();
    if (!text) return;

    bubble('me', U.esc(text));
    input.value = '';

    let reply;
    // אישור איפוס
    if (pendingReset) {
      pendingReset = false;
      if (/^(אני מאשר איפוס|כן|מאשר|בטוח)/.test(text.trim())) {
        Store.reset();
        chatLog.innerHTML = '';
        Render.all();
        bubble('bot', '🧹 הכל אופס. בוא נתחיל מחדש — כמה המשכורת שלך?');
        chips();
        return;
      }
      reply = 'האיפוס בוטל. שום דבר לא נמחק.';
      bubble('bot', reply);
      chips();
      return;
    }

    try {
      reply = Engine.handle(text);
    } catch (e) {
      console.error(e);
      reply = '😵 משהו השתבש בעיבוד ההודעה. נסה לנסח אחרת.';
    }

    if (/⚠️ איפוס מלא/.test(reply)) pendingReset = true;

    bubble('bot', reply);
    Render.all();
    chips();
  }

  form.addEventListener('submit', e => {
    e.preventDefault();
    send(input.value);
  });

  /* ---------------- צ'יפים דינמיים ---------------- */

  function chips() {
    const s = Store.get();
    const box = document.getElementById('quickChips');
    const list = [];

    if (!s.profile.salary) list.push('המשכורת שלי 12000');
    if (!s.cards.length) list.push('כרטיס ויזה מסגרת 10000');
    if (!Object.keys(s.allocations).length) list.push('להפריש 1000 לחיסכון');
    if (!s.goals.length) list.push('לחסוך לרכב 15000 ב־4 חודשים');
    if (!Object.keys(s.limits).length) list.push('הגבלה למסעדות 800');
    list.push('מה המצב?');
    if (s.transactions.length) list.push('כמה הוצאתי על מזון?');
    list.push('עזרה');

    box.innerHTML = list.slice(0, 5)
      .map(t => '<button class="chip" type="button">' + U.esc(t) + '</button>').join('');
    box.querySelectorAll('.chip').forEach(c => {
      c.addEventListener('click', () => send(c.textContent));
    });
  }

  /* ---------------- טאבים ---------------- */

  document.getElementById('tabs').addEventListener('click', e => {
    const btn = e.target.closest('.tab');
    if (!btn) return;
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t === btn));
    document.querySelectorAll('.view').forEach(v => {
      v.classList.toggle('active', v.id === 'view-' + btn.dataset.view);
    });
    Render.all();
  });

  /* ---------------- מחיקות מהרשימות ---------------- */

  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-del-tx],[data-del-card],[data-del-debt],[data-del-goal]');
    if (!btn) return;
    const d = btn.dataset;

    if (d.delTx) {
      Store.snapshot('מחיקת עסקה');
      const t = Store.removeTx(d.delTx);
      if (t) toast('נמחקה עסקה על ' + U.money(t.amount));
    } else if (d.delCard) {
      if (!confirm('למחוק את הכרטיס? החיובים יישארו רשומים ללא שיוך.')) return;
      Store.snapshot('מחיקת כרטיס');
      Store.removeCard(d.delCard);
      toast('הכרטיס נמחק');
    } else if (d.delDebt) {
      if (!confirm('למחוק את החוב?')) return;
      Store.snapshot('מחיקת חוב');
      Store.removeDebt(d.delDebt);
      toast('החוב נמחק');
    } else if (d.delGoal) {
      if (!confirm('למחוק את יעד החיסכון?')) return;
      Store.snapshot('מחיקת יעד');
      Store.removeGoal(d.delGoal);
      toast('היעד נמחק');
    }
    Render.all();
  });

  document.getElementById('txFilter').addEventListener('change', Render.transactions);

  /* ---------------- גיבוי / שחזור / איפוס ---------------- */

  document.getElementById('btnExport').addEventListener('click', () => {
    const data = JSON.stringify(Store.get(), null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'budget-' + U.todayISO() + '.json';
    a.click();
    URL.revokeObjectURL(a.href);
    toast('הגיבוי ירד למחשב');
  });

  document.getElementById('btnImport').addEventListener('click', () => {
    document.getElementById('fileInput').click();
  });

  document.getElementById('fileInput').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        Store.replace(JSON.parse(reader.result));
        renderChatHistory();
        Render.all();
        chips();
        toast('הנתונים שוחזרו');
      } catch (err) {
        toast('הקובץ לא תקין');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  document.getElementById('btnReset').addEventListener('click', () => {
    if (!confirm('למחוק את כל הנתונים ולהתחיל מחדש?')) return;
    Store.reset();
    chatLog.innerHTML = '';
    Render.all();
    greet();
    chips();
    toast('הכל אופס');
  });

  /* ---------------- אתחול ---------------- */

  function renderChatHistory() {
    chatLog.innerHTML = '';
    Store.get().chat.forEach(m => bubble(m.role, m.html, false));
  }

  function greet() {
    const s = Store.get();
    if (s.profile.salary) {
      bubble('bot', '👋 שלום שוב!<br>' + Engine.HANDLERS.report());
    } else {
      bubble('bot',
        '<span class="m-title">👋 היי, אני מנהל התקציב שלך</span>'
        + 'פשוט תכתוב לי כאן כל דבר — כמה הוצאת, כמה המשכורת, אילו כרטיסים וחובות יש לך — ואני אסדר את התמונה המלאה.'
        + '<hr>בוא נתחיל: <b>כמה המשכורת החודשית שלך?</b>'
        + '<br><span class="muted">אפשר לכתוב פשוט «המשכורת שלי 12000». בכל שלב אפשר לכתוב «עזרה».</span>');
    }
  }

  function init() {
    const s = Store.get();
    if (s.chat.length) {
      renderChatHistory();
      // סיכום מצב עדכני בכניסה מחדש
      bubble('bot', '📅 ' + U.niceDate(U.todayISO()) + ' · ' + U.monthLabel(U.currentMonth())
        + '<hr>' + Engine.HANDLERS.report(), false);
    } else {
      greet();
    }
    Render.all();
    chips();
    input.focus();

    const plan = Store.monthlyPlan();
    document.getElementById('topbarSubtitle').textContent =
      s.profile.salary ? 'פנוי החודש: ' + U.money(plan.free) : 'כותבים בצ\'אט — הכל מסתדר לבד';
  }

  init();

  // עדכון הכותרת אחרי כל פעולה
  const origAll = Render.all;
  Render.all = function () {
    origAll();
    const s = Store.get();
    const plan = Store.monthlyPlan();
    document.getElementById('topbarSubtitle').textContent =
      s.profile.salary ? 'פנוי החודש: ' + U.money(plan.free) : 'כותבים בצ\'אט — הכל מסתדר לבד';
  };
})();
