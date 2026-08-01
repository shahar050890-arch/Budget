/* engine.js — ביצוע הפעולה שנותחה והפקת התשובה למשתמש */
window.Engine = (function () {

  const M = U.money;

  function b(x) { return '<span class="num">' + x + '</span>'; }
  function ok(x) { return '<span class="num good">' + x + '</span>'; }
  function bad(x) { return '<span class="num bad">' + x + '</span>'; }
  function warn(x) { return '<span class="num warn">' + x + '</span>'; }

  /** מריץ הודעה של המשתמש ומחזיר HTML לתשובה */
  function handle(raw) {
    const s = Store.get();
    // כל עוד אשף ההקמה פעיל, ההודעה נקראת בהקשר של השלב הנוכחי
    if (!s.setup.done) return Setup.handle(raw);

    lastInput = String(raw || '');
    turn++;

    // תשובה לשאלה שנשארה פתוחה
    if (s.pendingAsk && s.pendingAsk.type === 'category') {
      const answered = answerCategory(raw);
      if (answered) return answered;
    }
    if (s.pendingAsk && s.pendingAsk.type === 'card') {
      const answered = answerCard(raw);
      if (answered) return answered;
    }
    if (s.pendingAsk && s.pendingAsk.type === 'payment') {
      const answered = answerPayment(raw);
      if (answered) return answered;
    }
    if (s.pendingAsk && s.pendingAsk.type === 'deleteChoice') {
      const answered = answerDeleteChoice(raw);
      if (answered) return answered;
    }
    if (s.pendingAsk && s.pendingAsk.type === 'standingSource') {
      const answered = answerStandingSource(raw);
      if (answered) return answered;
    }

    const p = Parser.parse(raw);
    const fn = HANDLERS[p.intent] || HANDLERS.unknown;
    return fn(p, raw);
  }

  /* ================= ניסוח ================= */

  let lastInput = '';
  let turn = 0;   // מונה הודעות — מסובב את הניסוחים

  /**
   * בוחר ניסוח מתוך כמה חלופות, מתחלף מהודעה להודעה —
   * כדי שאותה פעולה לא תחזיר בדיוק את אותו משפט כל פעם.
   */
  function say(options) {
    return options[turn % options.length];
  }

  /** מצטט בחזרה את מה שהמשתמש כתב, כדי שיראה שנקרא */
  function echo(text) {
    const t = String(text || '').trim();
    if (!t) return '';
    const short = t.length > 60 ? t.slice(0, 58) + '…' : t;
    return '<span class="muted">קראתי: «' + U.esc(short) + '»</span><br>';
  }

  /** תגובה אנושית לגודל ההוצאה ביחס להכנסה */
  function reaction(amount) {
    const income = Store.monthIncome();
    if (!income) return '';
    const share = amount / income;
    if (share >= 0.25) return say(['זו הוצאה גדולה. ', 'סכום רציני. ', 'זה נתח משמעותי מהחודש. ']);
    if (share >= 0.08) return say(['הוצאה לא קטנה. ', 'סכום בינוני. ', '']);
    return '';
  }

  /**
   * המשתמש עונה על "על מה הייתה ההעברה?" — משייך את התשובה לתנועה שנשמרה.
   * מחזיר null אם התשובה נראית כמו פעולה חדשה ולא כמו תשובה.
   */
  function answerCategory(raw) {
    const s = Store.get();
    const text = Parser.normalize(raw);
    // הודעה עם סכום היא פעולה חדשה, לא תשובה על הקודמת
    if (Parser.findNumbers(text).length) { s.pendingAsk = null; Store.save(); return null; }

    const tx = s.transactions.find(t => t.id === s.pendingAsk.txId);
    s.pendingAsk = null;
    if (!tx) { Store.save(); return null; }

    if (/^(לא|לא יודע|לא משנה|עזוב|דלג|לא חשוב)$/i.test(text.trim())) {
      Store.save();
      return '<span class="m-title">בסדר</span>השארתי את זה תחת «כללי». אפשר לשנות אחר כך.';
    }

    const cat = Parser.explicitCategory(text);
    const known = cat !== 'כללי';
    const name = known ? cat : Parser.tidyThing(text);
    if (!name) { Store.save(); return null; }

    // נושא שלא מוכר — נפתחת עבורו קטגוריה
    if (!known) Store.addCustomCategory(name, Parser.guessIcon(name));

    tx.category = name;
    if (!tx.note || tx.note === 'כללי') tx.note = name;
    Store.save();

    let html = '<span class="m-title">✅ שייכתי</span>'
      + M(tx.amount) + ' → ' + Parser.categoryIcon(name) + ' <b>' + U.esc(name) + '</b>'
      + (tx.method ? ' <span class="tag">' + U.esc(tx.method) + '</span>' : '');
    if (!known) html += '<br><span class="muted">פתחתי קטגוריה חדשה בשם הזה.</span>';
    html += limitWarning(name);
    return html;
  }

  /**
   * האם צריך לשאול איך שולם. לא שואלים כשכבר ברור: כרטיס בשם,
   * מזומן, משיכה מחשבון אחר, הוראת קבע, או כשהמשתמש כיבה את השאלה.
   */
  function needsPaymentAsk(p) {
    const s = Store.get();
    if (s.settings && s.settings.askPayment === false) return false;
    if (!s.cards.length) return false;
    if (p.cardName || p.cardAmbiguous) return false;
    if (p.method) return p.method === 'ביט' || p.method === 'פייבוקס';  // ביט יורד דרך האשראי
    if (p.source && p.source !== 'checking') return false;
    return true;
  }

  function paymentOptions() {
    const s = Store.get();
    return '<ul>'
      + s.cards.map(c => '<li>💳 <b>' + U.esc(c.name) + '</b> — ' + kindLabel(c) + '</li>').join('')
      + '<li>💵 <b>מזומן</b></li>'
      + '<li>🏛️ <b>העברה</b> — ישירות מהעו"ש</li>'
      + '</ul>';
  }

  /** תשובה על "איך שילמת?" */
  function answerPayment(raw) {
    const s = Store.get();
    const text = Parser.normalize(raw);
    if (Parser.findNumbers(text).length) { s.pendingAsk = null; Store.save(); return null; }

    const txId = s.pendingAsk.txId;
    const tx = s.transactions.find(t => t.id === txId);
    if (!tx) { s.pendingAsk = null; Store.save(); return null; }

    // מזומן
    if (/^(מזומן|קאש|במזומן|ארנק)/.test(text.trim())) {
      s.pendingAsk = null;
      Store.setTxSource(txId, 'cash');
      Store.save();
      return '<span class="m-title">💵 שילמת במזומן</span>'
        + M(tx.amount) + ' ירדו מהמזומן.'
        + (s.declared.cash ? '<br>נשאר במזומן: ' + b(M(s.balances.cash)) : '')
        + balancesLine();
    }

    // העברה ישירה מהעו"ש
    if (/^(העברה|עו"ש|עוש|מהחשבון|בנק|העברה בנקאית|חשבון)/.test(text.trim())) {
      s.pendingAsk = null;
      Store.setTxSource(txId, 'checking');
      Store.save();
      return '<span class="m-title">🏛️ ירד מהעו"ש</span>'
        + M(tx.amount) + ' ירדו ישירות מהחשבון.' + balancesLine();
    }

    // כרטיס
    const card = Store.findCard(Parser.detectCardName(text) || Parser.tidyThing(text));
    if (card) {
      s.pendingAsk = null;
      Store.setTxCard(txId, card.id);
      Store.save();
      let html = '<span class="m-title">💳 ' + U.esc(card.name) + '</span>'
        + M(tx.amount) + ' <span class="tag">' + kindLabel(card) + '</span>'
        + '<hr>' + (card.kind === 'debit'
          ? '⚡ ירד מהעו"ש מיד.'
          : '🕐 ייגבה בחיוב של ' + card.billingDay + ' לחודש.');
      html += cardWarning(card);
      return html + balancesLine();
    }

    return '<span class="m-title">🤔 לא זיהיתי</span>איך שילמת?' + paymentOptions();
  }

  /** מבצע את המחיקה ומדווח בדיוק מה בוטל ומה חזר */
  function doDelete(tx) {
    const s = Store.get();
    Store.snapshot('מחיקת תנועה');

    const goal = tx.goalId ? s.goals.find(g => g.id === tx.goalId) : null;
    const debt = tx.debtId ? s.debts.find(d => d.id === tx.debtId) : null;
    const so = tx.standingId ? s.standing.find(o => o.id === tx.standingId) : null;
    const card = tx.cardId ? s.cards.find(c => c.id === tx.cardId) : null;

    Store.deleteTx(tx.id);

    const kind = tx.type === 'income' ? 'ההכנסה'
      : tx.type === 'settlement' ? 'חיוב האשראי'
        : tx.type === 'deposit' ? 'ההפקדה' : 'ההוצאה';

    let html = '<span class="m-title">🗑️ ' + kind + ' נמחקה</span>'
      + '<b>' + M(tx.amount) + '</b> · ' + U.esc(tx.note || tx.category)
      + ' <span class="muted">(' + U.niceDate(tx.date) + ')</span>';

    const back = [];
    if (goal) back.push('הנצבר ב«' + U.esc(goal.name) + '» חזר ל־' + M(goal.saved));
    if (debt) back.push('יתרת «' + U.esc(debt.name) + '» חזרה ל־' + M(debt.amount));
    if (so) back.push('הוראת הקבע «' + U.esc(so.name) + '» לא תירשם שוב החודש');
    if (card) back.push('החיוב הוסר מ־' + U.esc(card.name));

    html += '<hr>' + (back.length
      ? '<b>מה שהוחזר:</b><ul>' + back.map(x => '<li>' + x + '</li>').join('') + '</ul>'
      : 'היתרות עודכנו בהתאם.');

    const plan = Store.monthlyPlan();
    html += 'פנוי החודש: ' + (plan.free >= 0 ? ok(M(plan.free)) : bad(M(plan.free))) + '.';
    html += balancesLine();
    html += '<br><span class="muted">טעות? כתוב <b>בטל</b> ואחזיר.</span>';
    return html;
  }

  function recentList(list) {
    if (!list.length) return '';
    return '<b>התנועות האחרונות:</b><ul>'
      + list.map(t => '<li>' + M(t.amount) + ' · ' + U.esc(t.note || t.category)
        + ' <span class="muted">(' + U.niceDate(t.date) + ')</span></li>').join('')
      + '</ul>';
  }

  /** תשובה על "איזו למחוק?" — מספר ברשימה, סכום, או "הכל" */
  function answerDeleteChoice(raw) {
    const s = Store.get();
    const ids = s.pendingAsk.ids || [];
    const text = Parser.normalize(raw).trim();

    if (/^(הכל|הכול|כולן|כולם|את כולן)$/.test(text)) {
      s.pendingAsk = null;
      Store.snapshot('מחיקת תנועות');
      let total = 0, n = 0;
      ids.forEach(id => {
        const t = s.transactions.find(x => x.id === id);
        if (t) { total += t.amount; n++; Store.deleteTx(id); }
      });
      Store.save();
      return '<span class="m-title">🗑️ נמחקו ' + n + ' תנועות</span>'
        + 'סה"כ ' + b(M(total)) + ' הוחזרו.' + balancesLine()
        + '<br><span class="muted">טעות? כתוב <b>בטל</b>.</span>';
    }

    const nums = Parser.findNumbers(text);
    if (nums.length) {
      const v = nums[0].value;
      // מספר קטן = מיקום ברשימה; אחרת מתייחסים אליו כסכום
      let tx = (v >= 1 && v <= ids.length && Number.isInteger(v))
        ? s.transactions.find(x => x.id === ids[v - 1])
        : null;
      if (!tx) tx = s.transactions.find(x => ids.includes(x.id) && x.amount === v);
      if (tx) { s.pendingAsk = null; Store.save(); return doDelete(tx); }
    }

    if (/^(בטל|לא|עזוב|שכח|ביטול)$/.test(text)) {
      s.pendingAsk = null; Store.save();
      return 'בסדר, לא מחקתי כלום.';
    }

    return '<span class="m-title">🤔 לא הבנתי איזו</span>'
      + 'תכתוב את המספר ברשימה (1 עד ' + ids.length + '), את הסכום, או «הכל».';
  }

  function standingSourceOptions() {
    const s = Store.get();
    return '<ul>'
      + s.cards.map(c => '<li>💳 <b>' + U.esc(c.name) + '</b> — ' + kindLabel(c) + '</li>').join('')
      + '<li>🏛️ <b>מהחשבון</b> — יורד ישירות מהעו"ש</li>'
      + '</ul>';
  }

  /** תשובה על "מאיפה הוראת הקבע יורדת?" */
  function answerStandingSource(raw) {
    const s = Store.get();
    const so = s.standing.find(o => o.id === s.pendingAsk.soId);
    if (!so) { s.pendingAsk = null; Store.save(); return null; }

    const text = Parser.normalize(raw).trim();

    if (/^(מהחשבון|חשבון|עו"ש|עוש|ישירות|בנק|מהבנק|העברה)/.test(text)) {
      s.pendingAsk = null;
      Store.setStandingSource(so.id, 'checking', null);
      return standingSourceDone(so, null);
    }

    const card = Store.findCard(Parser.detectCardName(text) || Parser.tidyThing(text));
    if (card) {
      s.pendingAsk = null;
      Store.setStandingSource(so.id, 'card', card.id);
      return standingSourceDone(so, card);
    }

    return '<span class="m-title">🤔 לא זיהיתי</span>מאיפה ' + U.esc(so.name) + ' יורד?'
      + standingSourceOptions();
  }

  function standingSourceDone(so, card) {
    const s = Store.get();

    // אם חיוב של החודש כבר נרשם קודם, מעבירים אותו למקור הנכון
    const existing = s.transactions.find(t => t.standingId === so.id
      && U.monthKey(t.date) === U.currentMonth());
    if (existing) {
      if (card) Store.setTxCard(existing.id, card.id);
      else Store.setTxSource(existing.id, 'checking');
    }

    // עכשיו כשידוע מאיפה — אפשר לרשום את החיוב אם מועדו כבר עבר
    const posted = Store.postDueStandingOrders();

    let html = '<span class="m-title">✅ נקבע</span>'
      + '🔁 <b>' + U.esc(so.name) + '</b> — ' + M(so.amount) + ' בכל ' + so.day + ' לחודש';

    html += '<hr>' + (card
      ? '💳 יירד דרך <b>' + U.esc(card.name) + '</b>'
        + (card.kind === 'debit'
          ? ' — דביט, כלומר יורד מהעו"ש ביום החיוב.'
          : ' — קרדיט, כלומר ייצבר לחיוב של ' + card.billingDay + ' לחודש ולא יירד בנפרד.')
      : '🏛️ יירד <b>ישירות מהעו"ש</b> ב-' + so.day + ' לחודש.');

    const plan = Store.monthlyPlan();
    html += '<hr>סה"כ הוראות קבע: ' + b(M(Store.standingTotal())) + ' בחודש';
    const fromAcc = Store.standingFromAccount();
    if (fromAcc !== Store.standingRemaining()) {
      html += '<br><span class="muted">מזה ' + M(fromAcc) + ' יורדים מהחשבון והשאר דרך האשראי.</span>';
    }
    if (posted.length) {
      html += '<br><span class="muted">התאריך כבר עבר החודש, אז רשמתי את החיוב עכשיו.</span>';
    }
    html += '<br>פנוי החודש: ' + (plan.free >= 0 ? ok(M(plan.free)) : bad(M(plan.free))) + '.';
    return html;
  }

  function kindLabel(c) {
    return c.kind === 'debit' ? '⚡ דביט' : '🕐 קרדיט';
  }

  /** המשתמש עונה מאיזה כרטיס שילם — משייך את התנועה ומעדכן יתרות */
  function answerCard(raw) {
    const s = Store.get();
    const text = Parser.normalize(raw);
    if (Parser.findNumbers(text).length) { s.pendingAsk = null; Store.save(); return null; }

    const txId = s.pendingAsk.txId;
    const card = Store.findCard(Parser.detectCardName(text) || Parser.tidyThing(text));
    if (!card) {
      return '<span class="m-title">🤔 לא זיהיתי את הכרטיס</span>'
        + 'הכרטיסים שלך: ' + s.cards.map(c => '<b>' + U.esc(c.name) + '</b>').join(', ') + '.'
        + '<br><span class="muted">תכתוב את השם המדויק, או «לא משנה» כדי להשאיר בלי שיוך.</span>';
    }

    s.pendingAsk = null;
    const tx = Store.setTxCard(txId, card.id);
    if (!tx) { Store.save(); return null; }

    let html = '<span class="m-title">✅ שייכתי לכרטיס</span>'
      + M(tx.amount) + ' → 💳 <b>' + U.esc(card.name) + '</b> <span class="tag">' + kindLabel(card) + '</span>';

    html += '<hr>' + (card.kind === 'debit'
      ? '⚡ דביט — הכסף כבר ירד מהעו"ש.'
      : '🕐 קרדיט — ייגבה בחיוב של ' + card.billingDay + ' לחודש הבא.');

    html += cardWarning(card);
    return html + balancesLine();
  }

  /**
   * הפירוט של חשבון — אותו מבנה לשלושתם: תנועה החודש, מה מיועד,
   * ומה זה אומר. עו"ש, חיסכון ומניות מקבלים יחס זהה.
   */
  function accountDetail(kind) {
    const s = Store.get();
    const mv = Store.accountMovement(kind);
    const bal = s.balances[kind];
    let html = '';

    if (mv.in || mv.out) {
      html += '<hr>החודש: ' + ok('+' + M(mv.in)) + ' נכנס · ' + bad('-' + M(mv.out)) + ' יצא'
        + ' · נטו ' + (mv.net >= 0 ? ok('+' + M(mv.net)) : bad(M(mv.net)));
    } else {
      html += '<hr><span class="muted">לא הייתה תנועה בחשבון הזה החודש.</span>';
    }

    if (kind === 'checking') {
      const pend = Store.pendingCardCharges();
      const so = Store.standingRemaining();
      if (pend || so) {
        html += '<hr><b>מיועד כבר:</b>'
          + (pend ? '<br>💳 חיובי אשראי — ' + warn(M(pend)) : '')
          + (so ? '<br>🔁 הוראות קבע — ' + warn(M(so)) : '');
        const real = bal - pend - so;
        html += '<br>זמין באמת: ' + (real >= 0 ? ok(M(real)) : bad(M(real)));
      }
      const burn = Store.monthlyBurn();
      if (burn) html += '<hr><span class="muted">מכסה ' + (bal / burn).toFixed(1) + ' חודשי הוצאות.</span>';
    }

    if (kind === 'savings') {
      const alloc = Store.allocAmount('savings');
      if (alloc) html += '<hr>מופרשים לכאן ' + b(M(alloc)) + ' בכל חודש.';
      const goals = Store.activeGoals();
      if (goals.length) {
        const need = goals.reduce((a, g) => a + Math.max(0, g.target - g.saved), 0);
        html += '<hr><b>מיועד ליעדים:</b><ul>'
          + goals.map(g => '<li>' + U.esc(g.name) + ' — ' + M(g.saved) + ' מתוך ' + M(g.target) + '</li>').join('')
          + '</ul>'
          + 'סה"כ עוד חסר ליעדים: ' + b(M(need)) + '.';
      }
      const burn = Store.monthlyBurn();
      if (burn) html += '<hr><span class="muted">לבד, מכסה ' + (bal / burn).toFixed(1) + ' חודשי הוצאות.</span>';
    }

    if (kind === 'stocks') {
      const alloc = Store.allocAmount('stocks');
      if (alloc) {
        html += '<hr>מופרשים לכאן ' + b(M(alloc)) + ' בכל חודש';
        html += ' — ' + b(M(alloc * 12)) + ' בשנה.';
      }
      const assets = Store.totalAssets();
      if (assets) html += '<hr>' + b(U.pct(bal, assets) + '%') + ' מהנכסים שלך נמצאים בשוק ההון.';
      html += '<br><span class="muted">הסכום כאן הוא מה שהזנת. אם השווי השתנה, עדכן: «יש לי במניות ' + U.num(bal) + '».</span>';
    }

    return html;
  }

  /** שורת יתרות מצטברת — מוצגת אחרי כל תנועה */
  function balancesLine() {
    const s = Store.get();
    if (!Store.hasBalances()) return '';
    const ICONS = { checking: '🏛️', cash: '💵', savings: '🐖', stocks: '📈' };
    const parts = Store.ACCOUNT_KINDS.filter(k => s.declared[k])
      .map(k => ICONS[k] + ' ' + FX.money(s.balances[k], FX.accountCurrency(k)));
    return '<hr><span class="muted">היתרות שלך: ' + parts.join(' · ') + '</span>';
  }

  /* ================= טקסטים משותפים ================= */

  function afterExpenseAdvice(plan) {
    const parts = [];
    if (plan.free < 0) {
      parts.push('⚠️ חרגת מהתקציב ב־' + bad(M(Math.abs(plan.free))) + ' החודש.');
    } else if (plan.daysLeft > 0) {
      parts.push('נשאר לך ' + ok(M(plan.free)) + ' ל־' + plan.daysLeft + ' ימים — ' + b(M(plan.dailyPace)) + ' ליום.');
    } else {
      parts.push('נשאר לך ' + ok(M(plan.free)) + '.');
    }
    return parts.join(' ');
  }

  function limitWarning(category) {
    const s = Store.get();
    const limit = s.limits[category];
    if (!limit) return '';
    const spent = Store.categorySpent(category);
    const p = U.pct(spent, limit);
    if (spent > limit)
      return '<hr>🚨 עברת את ההגבלה ל' + U.esc(category) + ': ' + bad(M(spent)) + ' מתוך ' + M(limit) + ' (חריגה של ' + M(spent - limit) + ').';
    if (p >= 80)
      return '<hr>⚠️ קרוב להגבלה ב' + U.esc(category) + ': ' + warn(M(spent)) + ' מתוך ' + M(limit) + ' (' + p + '%).';
    return '<hr>' + U.esc(category) + ': ' + b(M(spent)) + ' מתוך ' + M(limit) + ' (' + p + '%). נשאר ' + M(limit - spent) + '.';
  }

  /** תמונת ההון: נכסים, התחייבויות והשורה התחתונה */
  function netWorthBlock() {
    const s = Store.get();
    const b_ = s.balances;
    const pend = Store.pendingCardCharges();
    const debt = Store.totalDebt();
    const net = Store.netWorth();

    const NAMES = {
      checking: ['🏛️', 'עובר ושב'], cash: ['💵', 'מזומן'],
      savings: ['🐖', 'חיסכון'], stocks: ['📈', 'מניות']
    };
    let html = '<ul>'
      + Store.ACCOUNT_KINDS.filter(k => s.declared[k]).map(k => {
        const cur = FX.accountCurrency(k);
        return '<li>' + NAMES[k][0] + ' ' + NAMES[k][1] + ': ' + b(FX.money(b_[k], cur))
          + (cur === 'USD' ? ' <span class="muted">(' + U.money(FX.toILS(b_[k], 'USD')) + ')</span>' : '')
          + '</li>';
      }).join('')
      + '</ul>'
      + 'סה"כ נכסים: ' + ok(M(Store.totalAssets()));

    if (debt) html += '<br>פחות חובות: ' + bad('-' + M(debt));
    if (pend) html += '<br>פחות חיובי אשראי צפויים: ' + bad('-' + M(pend));
    if (debt || pend) html += '<hr><b>הון נקי: ' + (net >= 0 ? ok(M(net)) : bad(M(net))) + '</b>';

    const burn = Store.monthlyBurn();
    if (burn && s.declared.checking) {
      const cushion = b_.checking + (s.declared.savings ? b_.savings : 0);
      const months = cushion / burn;
      html += '<br><span class="muted">כרית הביטחון מכסה ' + months.toFixed(1) + ' חודשי הוצאות '
        + (months >= 3 ? '— מצוין.' : '— היעד המקובל הוא 3.')
        + (Store.burnIsEstimated() ? ' לפי אומדן, עד שייצברו נתונים של חודשיים.' : '')
        + '</span>';
    }
    return html;
  }

  /** סיכום אירוע: כמה יצא, על מה, ומול התקציב אם הוגדר */
  function eventReport(e, closing) {
    const st = Store.eventStatus(e);
    if (!st.count)
      return '<span class="m-title">🎉 ' + U.esc(e.name) + '</span>'
        + 'עוד לא נרשמו הוצאות לאירוע הזה.'
        + '<br><span class="muted">כתוב למשל «קניתי עוגה 180 ל' + U.esc(e.name) + '».</span>';

    let html = (closing ? '' : '<span class="m-title">🎉 ' + U.esc(e.name) + '</span>')
      + 'סה"כ יצא: <b>' + M(st.spent) + '</b> ב־' + st.count + ' הוצאות, על פני ' + st.days + ' ימים.';

    if (st.budget) {
      html += '<hr>מול תקציב של ' + M(st.budget) + ': ';
      html += st.over
        ? '🚨 חריגה של ' + bad(M(-st.left)) + ' (' + st.progress + '%)'
        : 'נשאר ' + ok(M(st.left)) + ' (' + st.progress + '% נוצלו)';
    }

    html += '<hr><b>על מה:</b><ul>'
      + st.categories.map(([c, v]) =>
        '<li>' + Parser.categoryIcon(c) + ' ' + U.esc(c) + ' — ' + M(v)
        + ' <span class="muted">(' + U.pct(v, st.spent) + '%)</span></li>').join('')
      + '</ul>';

    const list = Store.eventTx(e.id).slice(0, 5);
    if (list.length) {
      html += '<span class="muted">' + list.map(t => U.esc(t.note) + ' ' + M(t.amount)).join(' · ') + '</span>';
    }

    if (closing) {
      const income = Store.monthIncome();
      if (income) html += '<hr>זה ' + b(U.pct(st.spent, income) + '%') + ' מהכנסה חודשית.';
    }
    return html;
  }

  function cardWarning(card) {
    if (!card || !card.limit) return '';
    const used = Store.cardUsed(card.id);
    const p = U.pct(used, card.limit);
    if (used > card.limit)
      return '<hr>🚨 חרגת ממסגרת ' + U.esc(card.name) + ': ' + bad(M(used)) + ' מתוך ' + M(card.limit) + '.';
    if (p >= 75)
      return '<hr>⚠️ ' + U.esc(card.name) + ': נוצלו ' + warn(M(used)) + ' מתוך ' + M(card.limit) + ' (' + p + '%). פנוי במסגרת: ' + M(card.limit - used) + '.';
    return '<hr>💳 ' + U.esc(card.name) + ': ' + b(M(used)) + ' מתוך ' + M(card.limit) + ' (' + p + '%).';
  }

  /* ================= מטפלים ================= */

  const HANDLERS = {

    /* ---------- הוצאה ---------- */
    expense(p) {
      Store.snapshot('הוצאה');
      const card = p.cardName ? Store.findCard(p.cardName) : null;
      // כשעוד לא ידוע איך שולם, התנועה מוחזקת ולא נוגעת ביתרות
      // עד שתגיע התשובה — אחרת היינו מורידים מהעו"ש ומתקנים אחר כך.
      const willAsk = needsPaymentAsk(p);
      const onCard = !!card || p.cardAmbiguous || willAsk;
      const source = onCard ? null : (p.source || 'checking');
      const tx = Store.addTx({
        type: 'expense',
        amount: p.amount,
        category: p.category,
        note: p.note,
        date: p.date,
        source: source,
        method: p.method || null,
        eventId: p.eventId || null,
        cardId: card ? card.id : null,
        onCard: onCard || null,
        debit: card ? card.kind === 'debit' : null
      });

      const A = Parser.ACCOUNTS;
      const plan = Store.monthlyPlan();
      let html = '<span class="m-title">' + say(['✅ רשמתי', '✅ נרשם', '👌 נקלט', '✅ אצלי']) + '</span>'
        + echo(lastInput)
        + bad('-' + M(tx.amount)) + ' · ' + Parser.categoryIcon(tx.category) + ' ' + U.esc(tx.category)
        + (tx.note && tx.note !== tx.category ? ' · ' + U.esc(tx.note) : '')
        + (card ? ' <span class="tag">' + U.esc(card.name) + '</span>' : '')
        + (p.method ? ' <span class="tag">' + U.esc(p.method) + '</span>' : '')
        + (p.eventName ? ' <span class="tag">🎉 ' + U.esc(p.eventName) + '</span>' : '')
        + (source && source !== 'checking' ? ' <span class="tag">' + A[source].icon + ' מה' + A[source].label + '</span>' : '')
        + (tx.date !== U.todayISO() ? ' <span class="tag">' + U.niceDate(tx.date) + '</span>' : '');

      // לא נאמר איך שולם — שואלים (ניתן לכיבוי)
      if (willAsk) {
        Store.get().pendingAsk = { type: 'payment', txId: tx.id };
        Store.save();
        return html + '<hr><b>איך שילמת?</b>' + paymentOptions()
          + '<br><span class="muted">לא רוצה שאשאל בכל פעם? כתוב <b>אל תשאל על כל הוצאה</b>.</span>';
      }

      // שילם בכרטיס בלי לומר באיזה, ויש יותר מאחד — שואלים
      if (p.cardAmbiguous) {
        Store.get().pendingAsk = { type: 'card', txId: tx.id };
        Store.save();
        return html + '<hr><b>מאיזה כרטיס שילמת?</b><ul>'
          + Store.get().cards.map(c =>
            '<li><b>' + U.esc(c.name) + '</b> — ' + kindLabel(c)
            + (c.kind === 'debit' ? ' (יורד מיד)' : ' (ייגבה ב-' + c.billingDay + ' לחודש)') + '</li>').join('')
          + '</ul><span class="muted">תכתוב את שם הכרטיס ואשייך אותו.</span>';
      }

      // העברה בביט/פייבוקס בלי הקשר — שואלים על מה, ומחכים לתשובה
      if (p.needsCategory) {
        Store.get().pendingAsk = { type: 'category', txId: tx.id };
        Store.save();
        return html + '<hr><b>על מה הייתה ההעברה?</b>'
          + '<br><span class="muted">תכתוב מילה אחת ואשייך אותה — למשל «מתנה», «אוכל», «שכר דירה».</span>';
      }

      // סיכום ריצה של האירוע
      if (p.eventId) {
        const ev = Store.get().events.find(x => x.id === p.eventId);
        const st = Store.eventStatus(ev);
        html += '<hr>🎉 <b>' + U.esc(ev.name) + '</b>: ' + b(M(st.spent)) + ' עד כה';
        if (st.budget) {
          html += ' מתוך ' + M(st.budget);
          html += st.over ? ' — ' + bad('חריגה של ' + M(-st.left)) : ' · נשאר ' + ok(M(st.left));
        }
      }

      // משיכה מחיסכון או ממניות — שווה לומר מה זה עשה ליתרה שם
      if (source && source !== 'checking' && Store.get().declared[source]) {
        html += '<hr>' + A[source].icon + ' נשאר ב' + A[source].label + ': '
          + b(M(Store.get().balances[source]));
        if (source === 'savings') {
          const goals = Store.activeGoals();
          if (goals.length) html += '<br><span class="muted">שים לב שזה אותו כסף שמיועד ל' + U.esc(goals[0].name) + '.</span>';
        }
      }

      if (card) {
        html += '<hr>' + (card.kind === 'debit'
          ? '⚡ דביט — הכסף ירד מהעו"ש מיד.'
          : '🕐 קרדיט — זה לא ירד עכשיו. ייגבה בחיוב של ' + card.billingDay + ' לחודש הבא.');
      }

      html += '<hr>' + reaction(tx.amount) + afterExpenseAdvice(plan);
      html += limitWarning(tx.category);
      if (card) html += cardWarning(card);
      html += balancesLine();
      return html;
    },

    /* ---------- הכנסה ---------- */
    income(p) {
      Store.snapshot('הכנסה');
      const tx = Store.addTx({ type: 'income', amount: p.amount, category: 'הכנסה', note: p.note, date: p.date });
      const plan = Store.monthlyPlan();
      return '<span class="m-title">' + say(['💰 יפה, נרשמה הכנסה', '💰 נכנס כסף', '💰 רשמתי את ההכנסה']) + '</span>'
        + echo(lastInput)
        + ok('+' + M(tx.amount)) + ' · ' + U.esc(tx.note)
        + '<hr>סה"כ הכנסות החודש: ' + b(M(plan.income)) + '. פנוי כעת: ' + ok(M(plan.free)) + '.';
    },

    /* ---------- משכורת ---------- */
    salary(p) {
      const s = Store.get();
      const old = s.profile.salary || 0;
      const changed = old > 0 && old !== p.amount;

      // צילום המצב לפני, כדי להראות בדיוק מה השתנה בעקבות המשכורת
      const beforePlan = Store.monthlyPlan();
      const beforeAlloc = {
        savings: Store.allocAmount('savings'),
        stocks: Store.allocAmount('stocks')
      };

      Store.snapshot('משכורת');
      s.profile.salary = p.amount;
      if (p.salaryDay) s.profile.salaryDay = p.salaryDay;
      Store.save();

      const plan = Store.monthlyPlan();
      const diff = p.amount - old;

      let html = '<span class="m-title">🧾 ' + (changed ? 'המשכורת עודכנה' : 'המשכורת נקלטה') + '</span>';

      if (changed) {
        html += M(old) + ' → <b>' + M(p.amount) + '</b> '
          + (diff > 0 ? ok('(+' + M(diff) + ')') : bad('(' + M(diff) + ')'));
      } else {
        html += 'משכורת חודשית: ' + ok(M(p.amount));
      }
      if (p.salaryDay) html += '<br>נכנסת ב-' + p.salaryDay + ' לחודש.';

      // הצעת חלוקה ראשונית אם עוד אין הפרשות
      if (!Object.keys(s.allocations).length) {
        const sav = Math.round(p.amount * 0.10 / 50) * 50;
        const stk = Math.round(p.amount * 0.05 / 50) * 50;
        html += '<hr>הצעה להתחלה (כלל 10/5): להפריש ' + b(M(sav)) + ' לחיסכון ו־' + b(M(stk)) + ' למניות בכל חודש.'
          + '<br><span class="muted">רוצה? כתוב לי: «להפריש ' + U.num(sav) + ' לחיסכון»</span>';
        return html;
      }

      if (!changed) {
        html += '<hr>פנוי החודש אחרי כל ההתחייבויות: ' + ok(M(plan.free)) + '.';
        return html;
      }

      // --- מה השתנה בעקבות המשכורת ---
      html += '<hr><b>מה השתנה בעקבות זה:</b><ul>';

      Object.keys(s.allocations).forEach(k => {
        const a = s.allocations[k];
        if (a.kind !== 'percent') return;
        const now = Store.allocAmount(k);
        const was = beforeAlloc[k];
        if (now === was) return;
        const name = k === 'stocks' ? 'מניות' : 'חיסכון';
        html += '<li>ההפרשה ל' + name + ' (' + a.value + '%) — '
          + M(was) + ' → <b>' + M(now) + '</b></li>';
      });

      html += '<li>פנוי החודש — ' + M(beforePlan.free) + ' → <b>'
        + (plan.free >= 0 ? ok(M(plan.free)) : bad(M(plan.free))) + '</b></li>';

      if (plan.daysLeft) {
        html += '<li>קצב יומי — ' + M(beforePlan.dailyPace) + ' → <b>' + M(plan.dailyPace) + '</b> ליום'
          + (plan.paceHorizon === 'salary' ? ' עד המשכורת הבאה' : '') + '</li>';
      }
      html += '</ul>';

      // הפרשות קבועות בסכום — לא מתעדכנות לבד, וזה שווה לומר
      const fixed = Object.keys(s.allocations).filter(k => s.allocations[k].kind !== 'percent');
      if (fixed.length) {
        html += '<span class="muted">ההפרשות שהגדרת בסכום קבוע ('
          + fixed.map(k => k === 'stocks' ? 'מניות' : 'חיסכון').join(', ')
          + ') לא השתנו. אם תרצה שיזוזו עם המשכורת — הגדר אותן באחוזים.</span>';
      }

      // יעדי חיסכון — האם עדיין ריאליים
      const goals = Store.activeGoals();
      if (goals.length) {
        const need = Store.goalsMonthly();
        html += '<hr>' + (plan.free < 0
          ? '🚨 עם המשכורת החדשה אתה בגירעון של ' + bad(M(-plan.free))
            + ' — היעדים שלך כבר לא מכוסים.'
          : need > plan.free + need
            ? '⚠️ היעדים נעשו הדוקים יותר.'
            : '✅ היעדים עדיין מכוסים — ' + M(need) + ' בחודש מתוך ' + M(plan.free + need) + ' פנויים.');
      }

      const sr = Store.savingsRate();
      if (sr) html += '<hr>שיעור החיסכון שלך עכשיו: ' + b(sr + '%') + ' מההכנסה.';

      return html;
    },

    /* ---------- כרטיס אשראי ---------- */
    card(p) {
      Store.snapshot('כרטיס');
      const existed = !!Store.findCard(p.name);
      const c = Store.upsertCard(p.name, p.limit, p.billingDay, p.kind);
      const s = Store.get();
      const totalLimit = Store.totalCardLimit();

      let html = '<span class="m-title">💳 ' + (existed ? 'הכרטיס עודכן' : 'כרטיס נוסף') + '</span>'
        + U.esc(c.name) + ' <span class="tag">' + kindLabel(c) + '</span>'
        + (c.limit ? ' · מסגרת ' + b(M(c.limit)) : '')
        + (c.kind !== 'debit' && c.billingDay ? ' · חיוב ב־' + c.billingDay + ' לחודש' : '');

      html += '<hr>' + (c.kind === 'debit'
        ? '⚡ <b>דביט</b> — כל קנייה יורדת מהעו"ש מיד, באותו חודש.'
        : '🕐 <b>קרדיט</b> — הקניות נצברות כחוב פתוח ויורדות בחיוב המרוכז בחודש הבא.');

      if (!p.kind && !existed) {
        html += '<br><span class="muted">הנחתי קרדיט. אם זה דביט, כתוב «' + U.esc(c.name) + ' דביט».</span>';
      }

      html += '<hr>סה"כ מסגרות: ' + b(M(totalLimit)) + ' על פני ' + s.cards.length + ' כרטיסים.';
      const salary = Store.monthIncome();
      if (salary && totalLimit > salary * 2) {
        html += '<br>⚠️ סך המסגרות גבוה פי ' + (totalLimit / salary).toFixed(1) + ' מההכנסה החודשית — שווה לשמור על ניצול נמוך.';
      }
      html += '<br><span class="muted">מעכשיו אפשר לכתוב «שילמתי 200 ב' + U.esc(c.name) + '» והחיוב ייזקף לכרטיס.</span>';
      return html;
    },

    deleteCard(p) {
      const c = Store.findCard(p.name);
      if (!c) return '<span class="m-title">🤔 לא מצאתי כרטיס כזה</span>נסה שם מדויק יותר.';
      Store.snapshot('מחיקת כרטיס');
      Store.removeCard(c.id);
      return '🗑️ הכרטיס <b>' + U.esc(c.name) + '</b> נמחק.';
    },

    /* ---------- חובות ---------- */
    debt(p) {
      Store.snapshot('חוב');
      const existed = !!Store.findDebt(p.name);
      const d = Store.upsertDebt(p.name, p.amount, p.monthly);
      if (p.interest != null) { d.interest = p.interest; Store.save(); }
      const total = Store.totalDebt();
      const monthly = Store.debtMonthly();
      const income = Store.monthIncome();

      let html = '<span class="m-title">🏦 ' + (existed ? 'החוב עודכן' : 'חוב נרשם') + '</span>'
        + U.esc(d.name) + ' · יתרה ' + bad(M(d.amount))
        + (d.monthly ? ' · החזר חודשי ' + b(M(d.monthly)) : '')
        + (d.interest != null ? ' · ריבית ' + b(d.interest + '%') : '');

      html += '<hr>סה"כ חובות: ' + bad(M(total));
      if (monthly) html += ' · החזרים חודשיים: ' + b(M(monthly));

      if (d.monthly && d.amount) {
        const months = Math.ceil(d.amount / d.monthly);
        html += '<br>בקצב הזה החוב הזה ייסגר בעוד ' + b(months) + ' חודשים (' + U.monthLabel(U.addMonths(U.currentMonth(), months)) + ').';
      } else if (d.amount && !d.monthly) {
        html += '<br><span class="muted">כמה אתה מחזיר בחודש? כתוב «החזר ' + U.esc(d.name) + ' 500 בחודש».</span>';
      }
      if (income && monthly > income * 0.35) {
        html += '<br>⚠️ ההחזרים החודשיים הם ' + U.pct(monthly, income) + '% מההכנסה — מעל 35% זה עומס גבוה.';
      }
      return html;
    },

    debtPayment(p) {
      const d = Store.findDebt(p.name) || Store.get().debts[0];
      if (!d) return '<span class="m-title">🤔 אין חוב רשום</span>קודם ספר לי: «יש לי הלוואה 20000 החזר 800».';
      Store.snapshot('תשלום חוב');
      d.amount = Math.max(0, d.amount - p.amount);
      Store.addTx({ type: 'expense', amount: p.amount, category: 'חובות', note: 'החזר ' + d.name, debtId: d.id });
      Store.save();

      let html = '<span class="m-title">✅ ההחזר נרשם</span>'
        + 'שולמו ' + b(M(p.amount)) + ' על ' + U.esc(d.name) + '. יתרה: ' + (d.amount ? bad(M(d.amount)) : ok('0 ₪'));
      if (d.amount === 0) html += '<br>🎉 החוב הזה נסגר. כל הכבוד!';
      else if (d.monthly) html += '<br>נותרו כ־' + b(Math.ceil(d.amount / d.monthly)) + ' תשלומים.';
      return html;
    },

    deleteDebt(p) {
      const d = Store.findDebt(p.name);
      if (!d) return '<span class="m-title">🤔 לא מצאתי חוב כזה</span>';
      Store.snapshot('מחיקת חוב');
      Store.removeDebt(d.id);
      return '🗑️ החוב <b>' + U.esc(d.name) + '</b> נמחק.';
    },

    /* ---------- יעד חיסכון ---------- */
    goal(p) {
      Store.snapshot('יעד');
      const existing = Store.findGoal(p.name);
      if (existing) {
        existing.target = p.target;
        existing.months = p.months;
        existing.deadline = U.deadlineFromMonths(p.months);
        Store.save();
      }
      const g = existing || Store.addGoal(p.name, p.target, p.months);
      const st = Store.goalStatus(g);
      const plan = Store.monthlyPlan();
      const income = plan.income;
      // פנוי לפני היעד הזה
      const freeBefore = plan.free + st.need;

      let html = '<span class="m-title">🎯 תוכנית חיסכון ל' + U.esc(g.name) + '</span>';
      html += '<ul>'
        + '<li>יעד: ' + b(M(g.target)) + '</li>'
        + '<li>טווח: ' + b(g.months) + ' חודשים (עד ' + U.monthLabel(U.monthKey(g.deadline)) + ')</li>'
        + '<li>הפרשה נדרשת: ' + ok(M(st.need)) + ' בכל חודש</li>'
        + (income ? '<li>זה ' + b(U.pct(st.need, income) + '%') + ' מההכנסה החודשית</li>' : '')
        + '</ul>';

      // בדיקת היתכנות
      if (income) {
        if (st.need > freeBefore && freeBefore > 0) {
          const realistic = Math.ceil(g.target / freeBefore);
          html += '<hr>⚠️ לפי המצב הנוכחי פנויים לך ' + warn(M(freeBefore)) + ' בחודש, פחות מהנדרש.'
            + '<br>אפשרויות: להאריך ל־' + b(realistic) + ' חודשים (' + M(Math.ceil(g.target / realistic)) + ' לחודש), '
            + 'להוריד את היעד ל־' + b(M(freeBefore * g.months)) + ', או לקצץ בהוצאות.';
        } else if (freeBefore <= 0) {
          html += '<hr>🚨 כרגע אין לך עודף חודשי פנוי. צריך קודם לצמצם הוצאות או להגדיל הכנסה.';
        } else {
          html += '<hr>✅ זה אפשרי. אחרי ההפרשה יישארו לך ' + ok(M(freeBefore - st.need)) + ' פנויים בחודש.';
        }
      }

      // אבני דרך
      const marks = [];
      for (let i = 1; i <= Math.min(g.months, 4); i++) {
        marks.push(U.monthLabel(U.addMonths(U.currentMonth(), i)) + ': ' + M(st.need * i));
      }
      if (marks.length > 1) html += '<hr><span class="muted">אבני דרך — ' + marks.join(' · ') + '</span>';
      html += '<br><span class="muted">כשתפקיד, כתוב: «הפקדתי ' + U.num(st.need) + ' ל' + U.esc(g.name) + '».</span>';
      return html;
    },

    goalDeposit(p) {
      const g = Store.findGoal(p.name);
      if (!g) return '<span class="m-title">🤔 אין יעד בשם הזה</span>אפשר לפתוח אחד: «לחסוך ל' + U.esc(p.name || 'רכב') + ' 15000 ב־4 חודשים».';
      Store.snapshot('הפקדה ליעד');
      g.saved += p.amount;
      Store.addTx({ type: 'expense', amount: p.amount, category: 'חיסכון', note: 'הפקדה ל' + g.name, goalId: g.id });
      if (g.saved >= g.target) g.done = true;
      Store.save();

      const st = Store.goalStatus(g);
      let html = '<span class="m-title">🏦 ההפקדה נרשמה</span>'
        + ok('+' + M(p.amount)) + ' ל' + U.esc(g.name)
        + '<hr>נצבר: ' + b(M(g.saved)) + ' מתוך ' + M(g.target) + ' (' + st.progress + '%)';

      if (g.done) {
        html += '<br>🎉 הגעת ליעד! אפשר לקנות את ' + U.esc(g.name) + '.';
      } else {
        html += '<br>נשארו ' + b(M(st.left)) + ' ב־' + st.months + ' חודשים — ' + b(M(st.need)) + ' לחודש.';
        html += st.remainingThisMonth === 0
          ? '<br>✅ השלמת את ההפקדה של החודש. אתה בלוח הזמנים.'
          : '<br>להשלמת החודש נותרו עוד ' + warn(M(st.remainingThisMonth)) + '.';
      }
      return html;
    },

    deleteGoal(p) {
      const g = Store.findGoal(p.name);
      if (!g) return '<span class="m-title">🤔 לא מצאתי יעד כזה</span>';
      Store.snapshot('מחיקת יעד');
      Store.removeGoal(g.id);
      return '🗑️ היעד <b>' + U.esc(g.name) + '</b> נמחק.';
    },

    /* ---------- הפרשות קבועות ---------- */
    allocation(p) {
      Store.snapshot('הפרשה');
      Store.setAllocation(p.kind, p.value, p.isPercent);
      const label = p.kind === 'stocks' ? 'מניות והשקעות' : 'חיסכון';
      const emoji = p.kind === 'stocks' ? '📈' : '🐖';
      const amt = Store.allocAmount(p.kind);
      const plan = Store.monthlyPlan();

      let html = '<span class="m-title">' + emoji + ' הפרשה חודשית ל' + label + '</span>'
        + (p.isPercent
          ? b(p.value + '%') + ' מההכנסה = ' + ok(M(amt)) + ' בחודש'
          : ok(M(amt)) + ' בכל חודש');

      html += '<hr>סה"כ הפרשות חודשיות: ' + b(M(Store.totalAllocations()))
        + ' · נשאר פנוי: ' + (plan.free >= 0 ? ok(M(plan.free)) : bad(M(plan.free)));

      if (plan.free < 0) html += '<br>⚠️ ההפרשה הזו מכניסה אותך למינוס חודשי. שקול סכום נמוך יותר.';
      else if (plan.income) html += '<br>שיעור החיסכון שלך: ' + b(U.pct(Store.totalAllocations() + Store.goalsMonthly(), plan.income) + '%') + ' מההכנסה.';
      return html;
    },

    /* ---------- מחיקת הוצאה ---------- */
    deleteExpense(p) {
      const s = Store.get();
      const all = s.transactions.filter(t => t.type !== 'transfer');
      if (!all.length)
        return '<span class="m-title">אין מה למחוק</span>לא רשומות אצלי תנועות.';

      // "תמחק את ההוצאה האחרונה" — הכי נפוץ, ולכן ישיר
      if (p.last && p.amount == null && !p.text) return doDelete(all[0]);

      const matches = Store.findExpenses({ amount: p.amount, text: p.text });

      if (!matches.length) {
        let html = '<span class="m-title">🤔 לא מצאתי תנועה כזו</span>';
        if (p.amount != null) html += 'אין אצלי תנועה על ' + M(p.amount) + '.';
        else if (p.text) html += 'לא מצאתי משהו שמתאים ל«' + U.esc(p.text) + '».';
        html += '<hr>' + recentList(all.slice(0, 4))
          + '<span class="muted">אפשר לכתוב «תמחק את ההוצאה האחרונה» או «תמחק את ההוצאה של ' + U.num(all[0].amount) + '».</span>';
        return html;
      }

      if (matches.length === 1) return doDelete(matches[0]);

      // כמה מועמדים — שואלים במקום לנחש
      s.pendingAsk = { type: 'deleteChoice', ids: matches.map(t => t.id) };
      Store.save();
      return '<span class="m-title">🤔 מצאתי ' + matches.length + ' תנועות מתאימות</span>'
        + 'איזו למחוק?<ol>'
        + matches.map(t => '<li><b>' + M(t.amount) + '</b> · ' + U.esc(t.note || t.category)
          + ' <span class="muted">(' + U.niceDate(t.date) + ')</span></li>').join('')
        + '</ol><span class="muted">תכתוב את המספר ברשימה, או «הכל» כדי למחוק את כולן.</span>';
    },

    /* ---------- הגדרת השאלה על אמצעי תשלום ---------- */
    askPayment(p) {
      const s = Store.get();
      s.settings = s.settings || {};
      s.settings.askPayment = p.on;
      Store.save();
      return p.on
        ? '<span class="m-title">✅ אשאל בכל הוצאה</span>'
          + 'מעכשיו אחרי כל הוצאה אשאל איך שילמת — כרטיס, מזומן או העברה.'
        : '<span class="m-title">👌 לא אשאל יותר</span>'
          + 'הוצאה בלי ציון אמצעי תשלום תיזקף לעו"ש.'
          + '<br><span class="muted">אפשר תמיד לציין בעצמך: «קניתי קפה 28 בויזה».</span>'
          + '<br><span class="muted">להחזיר: «תשאל על כל הוצאה».</span>';
    },

    /* ---------- עלייה או ירידה בערך ---------- */
    growth(p) {
      const s = Store.get();
      const LABEL = {
        checking: ['🏛️', 'עובר ושב'], cash: ['💵', 'מזומן'],
        savings: ['🐖', 'החיסכון'], stocks: ['📈', 'תיק המניות']
      };
      const [ico, label] = LABEL[p.kind];

      if (!s.declared[p.kind])
        return '<span class="m-title">🤔 אין לי סכום התחלתי</span>'
          + 'כדי לחשב עלייה באחוזים אני צריך לדעת כמה יש שם.'
          + '<br><span class="muted">כתוב קודם «יש לי ב' + label.replace(/^ה/, '') + ' 15000».</span>';

      Store.snapshot('שינוי ערך');
      const r = Store.applyGrowth(p.kind, p.pct);
      const cur = FX.accountCurrency(p.kind);
      const up = r.gain >= 0;

      let html = '<span class="m-title">' + (up ? '📈' : '📉') + ' ' + label + ' '
        + (up ? 'עלה' : 'ירד') + ' ב-' + Math.abs(p.pct) + '%</span>'
        + FX.money(r.before, cur) + ' → <b>' + FX.money(r.after, cur) + '</b>'
        + '<hr>' + (up ? ok('+' + FX.money(r.gain, cur)) : bad(FX.money(r.gain, cur)))
        + (cur === 'USD' ? ' <span class="muted">(' + M(FX.toILS(Math.abs(r.gain), 'USD')) + ')</span>' : '');

      const assets = Store.totalAssets();
      html += '<hr>סה"כ נכסים: ' + b(M(assets))
        + '<br>הון נקי: ' + (Store.netWorth() >= 0 ? ok(M(Store.netWorth())) : bad(M(Store.netWorth())));

      // הרווח מול ההפרשה החודשית — נותן פרופורציה
      const alloc = Store.allocAmount(p.kind === 'stocks' ? 'stocks' : 'savings');
      if (alloc && up) {
        const months = r.gain / alloc;
        html += '<hr><span class="muted">הרווח הזה שווה ל-' + months.toFixed(1)
          + ' חודשי הפרשה (' + M(FX.toILS(alloc, FX.accountCurrency(p.kind))) + ' בחודש).</span>';
      }

      html += '<br><span class="muted">זה שינוי בשווי הנכס, לא כסף שנכנס — '
        + 'הוא לא נספר כהכנסה של החודש.</span>';
      return html + balancesLine();
    },

    /* ---------- מטבע ושער הדולר ---------- */
    fxRate() {
      const i = FX.info();
      let html = '<span class="m-title">💵 שער הדולר</span>'
        + '<b>1 $ = ' + i.rate.toFixed(3) + ' ₪</b>'
        + '<hr><span class="muted">' + FX.rateNote() + '</span>';
      if (!i.known)
        html += '<br><span class="muted">עוד לא הצלחתי למשוך שער מהרשת. '
          + 'אפשר להזין ידנית: «הדולר 3.72».</span>';
      html += '<hr>דוגמאות: 100$ = ' + U.num(FX.toILS(100, 'USD')) + ' ₪ · '
        + '1,000 ₪ = $' + U.num(FX.fromILS(1000, 'USD'));
      return html;
    },

    fxSet(p) {
      Store.snapshot('שער דולר');
      FX.setRate(p.rate, true);
      return '<span class="m-title">💵 השער עודכן ידנית</span>'
        + '<b>1 $ = ' + p.rate.toFixed(3) + ' ₪</b>'
        + '<hr><span class="muted">מעכשיו זה השער שאשתמש בו. '
        + 'לחזרה לשער אוטומטי מהרשת: «תמשוך שער עדכני».</span>';
    },

    fxConvert(p) {
      const res = FX.convert(p.amount, p.from, p.to);
      return '<span class="m-title">🔄 המרה</span>'
        + '<b>' + FX.money(p.amount, p.from) + ' = ' + FX.money(res, p.to) + '</b>'
        + '<hr><span class="muted">' + FX.rateNote() + '</span>';
    },

    setCurrency(p) {
      Store.snapshot('מטבע');
      const label = { checking: 'עובר ושב', cash: 'מזומן', savings: 'חיסכון', stocks: 'מניות' };

      if (p.all || !p.kind) {
        Store.ACCOUNT_KINDS.forEach(k => FX.setAccountCurrency(k, p.code));
        return '<span class="m-title">💱 כל החשבונות ' + (p.code === 'USD' ? 'בדולרים' : 'בשקלים') + '</span>'
          + '<span class="muted">ההון הכולל עדיין מחושב בשקלים, לפי ' + FX.rateNote() + '.</span>';
      }

      FX.setAccountCurrency(p.kind, p.code);
      const bal = Store.get().balances[p.kind];
      return '<span class="m-title">💱 ' + label[p.kind] + ' ' + (p.code === 'USD' ? 'בדולרים' : 'בשקלים') + '</span>'
        + 'היתרה כעת: <b>' + FX.money(bal, p.code) + '</b>'
        + (p.code === 'USD' ? ' = ' + U.money(FX.toILS(bal, 'USD')) : '')
        + '<hr><span class="muted">הסכום עצמו לא הומר — רק המטבע שבו הוא מוצג ונספר. '
        + 'אם הוא היה רשום בשקלים, עדכן אותו: «יש לי ב' + label[p.kind] + ' <סכום> דולר».</span>'
        + '<br><span class="muted">' + FX.rateNote() + '</span>';
    },

    /* ---------- הוראות קבע ---------- */
    standingOrder(p) {
      if (!p.name)
        return '<span class="m-title">איך לקרוא להוראת הקבע?</span>'
          + 'כתוב למשל: <b>הוראת קבע ארנונה 400 ב-15 לחודש</b>';

      Store.snapshot('הוראת קבע');
      const existed = !!Store.findStandingOrder(p.name);
      const so = Store.addStandingOrder(p.name, p.amount, p.day, p.category, p.months);
      const posted = Store.standingPosted(so.id);
      const left = Store.standingMonthsLeft(so);

      let html = '<span class="m-title">🔁 ' + (existed ? 'הוראת הקבע עודכנה' : 'נוספה הוראת קבע') + '</span>'
        + Parser.categoryIcon(so.name) + ' <b>' + U.esc(so.name) + '</b> — ' + b(M(so.amount))
        + ' בכל <b>' + so.day + '</b> לחודש';

      if (so.months) {
        html += '<br>למשך <b>' + so.months + '</b> חודשים — עד '
          + U.monthLabel(Store.standingLastMonth(so))
          + ' <span class="muted">(נשארו ' + left + ')</span>'
          + '<br>סה"כ לאורך התקופה: ' + b(M(so.amount * so.months)) + '.';
      } else {
        html += '<br><span class="muted">ללא תאריך סיום — תיזכר בכל חודש. '
          + 'למשך מוגבל: «' + U.esc(so.name) + ' למשך 12 חודשים».</span>';
      }

      html += '<br><span class="muted">« ' + U.esc(so.name) + ' » נרשם כנושא בפני עצמו, '
        + 'כך שההוצאה תופיע בשמו ולא תיבלע בקטגוריה כללית.</span>';

      if (!p.day) html += '<br><span class="muted">לא ציינת תאריך, אז שמתי את ה-1 לחודש. '
        + 'לשינוי: «' + U.esc(so.name) + ' ב-10 לחודש».</span>';

      const total = Store.standingTotal();
      const income = Store.monthIncome();
      html += '<hr>סה"כ הוראות קבע: ' + b(M(total)) + ' בחודש'
        + (income ? ' — ' + U.pct(total, income) + '% מההכנסה' : '') + '.';

      // אם עוד נשאל מאיפה זה יורד, אין לרשום את החיוב עכשיו — אחרת
      // הוא ייזקף לעו"ש וייאלץ לעבור מקום מיד אחר כך
      const willAskSource = !existed && Store.get().cards.length
        && !p.cardName && !p.fromAccount;

      if (posted) {
        html += '<br>החיוב של החודש כבר נרשם.';
      } else if (so.day <= U.dayOfMonth() && !willAskSource) {
        html += '<br>התאריך כבר עבר החודש — ארשום את החיוב עכשיו.';
        const list = Store.postDueStandingOrders();
        if (list.length) html += ' ✅ נרשמו ' + list.length + ' חיובים.';
      } else if (so.day > U.dayOfMonth()) {
        html += '<br>יירד בעוד ' + b(so.day - U.dayOfMonth()) + ' ימים.';
      }

      // הכרטיס צוין כבר בשורה — אין מה לשאול
      const namedCard = p.cardName ? Store.findCard(p.cardName) : null;
      if (namedCard || p.fromAccount) {
        Store.setStandingSource(so.id, namedCard ? 'card' : 'checking', namedCard ? namedCard.id : null);
        return html + '<hr>' + (namedCard
          ? '💳 יירד דרך <b>' + U.esc(namedCard.name) + '</b> — ' + kindLabel(namedCard)
          : '🏛️ יירד ישירות מהעו"ש.');
      }

      // מאיפה זה יורד — משנה אם זה נוגע בעו"ש עכשיו או נכנס לחיוב האשראי
      if (!existed && Store.get().cards.length) {
        Store.get().pendingAsk = { type: 'standingSource', soId: so.id };
        Store.save();
        return html + '<hr><b>מאיפה זה יורד?</b>' + standingSourceOptions()
          + '<br><span class="muted">אם זה מהאשראי, החיוב ייכנס לחיוב החודשי של הכרטיס '
          + 'ולא יירד מהעו"ש בנפרד.</span>';
      }

      const plan = Store.monthlyPlan();
      html += '<hr>פנוי אחרי כל ההתחייבויות: '
        + (plan.free >= 0 ? ok(M(plan.free)) : bad(M(plan.free))) + '.';
      if (plan.free < 0) html += '<br>⚠️ ההוראות הקבועות שלך גדולות ממה שנשאר.';
      return html;
    },

    standingList() {
      const list = Store.activeStandingOrders();
      if (!list.length)
        return '<span class="m-title">🔁 אין הוראות קבע</span>'
          + 'אפשר להוסיף: <b>הוראת קבע ארנונה 400 ב-15 לחודש</b>'
          + '<br><span class="muted">כל מה שיורד לך אוטומטית — שכר דירה, ביטוח, חדר כושר, מנויים.</span>';

      const sorted = list.slice().sort((a, b) => a.day - b.day);
      const today = U.dayOfMonth();

      let html = '<span class="m-title">🔁 הוראות הקבע שלך</span><ul>'
        + sorted.map(o => {
          const done = Store.standingPosted(o.id);
          const mark = done ? '✅' : o.day <= today ? '⏳' : '🕐';
          const left = Store.standingMonthsLeft(o);
          return '<li>' + mark + ' <b>' + U.esc(o.name) + '</b> — ' + M(o.amount)
            + ' ב-' + o.day + ' לחודש'
            + (done ? ' <span class="muted">(ירד)</span>'
              : o.day > today ? ' <span class="muted">(בעוד ' + (o.day - today) + ' ימים)</span>'
                : ' <span class="muted">(ממתין)</span>')
            + (left != null ? ' <span class="pill">עוד ' + left + ' חודשים</span>' : '')
            + '</li>';
        }).join('') + '</ul>';

      const total = Store.standingTotal();
      const left = Store.standingRemaining();
      const income = Store.monthIncome();
      html += '<hr>סה"כ ' + b(M(total)) + ' בחודש'
        + (income ? ' (' + U.pct(total, income) + '% מההכנסה)' : '')
        + (left ? '<br>עוד לא ירדו החודש: ' + warn(M(left)) : '<br>הכול כבר ירד החודש. ✅');

      const ended = Store.endedStandingOrders();
      if (ended.length) {
        html += '<hr><span class="muted">הסתיימו: '
          + ended.map(o => U.esc(o.name) + ' (' + M(o.amount) + ')').join(' · ') + '</span>';
      }
      return html;
    },

    standingDelete(p) {
      const so = Store.findStandingOrder(p.name);
      if (!so) return '<span class="m-title">לא מצאתי הוראת קבע כזו</span>'
        + 'הקיימות: ' + (Store.activeStandingOrders().map(o => U.esc(o.name)).join(', ') || 'אין') + '.';
      Store.snapshot('מחיקת הוראת קבע');
      Store.removeStandingOrder(so.id);
      return '🗑️ הוראת הקבע <b>' + U.esc(so.name) + '</b> (' + M(so.amount) + ') בוטלה.'
        + '<br><span class="muted">חיובים שכבר נרשמו נשארו בעסקאות.</span>';
    },

    /* ---------- יום החיוב של הכרטיס ---------- */
    billingDay(p) {
      const s = Store.get();
      if (!s.cards.length)
        return '<span class="m-title">אין כרטיסים רשומים</span>כתוב «כרטיס ויזה קרדיט מסגרת 10000».';

      const card = (p.cardName && Store.findCard(p.cardName)) || Store.creditCards()[0] || s.cards[0];
      if (card.kind === 'debit')
        return '<span class="m-title">🤔 ' + U.esc(card.name) + ' הוא דביט</span>'
          + 'בדביט אין יום חיוב — כל קנייה יורדת מיד.';

      Store.snapshot('יום חיוב');
      card.billingDay = p.day;
      Store.save();

      const out = Store.cardOutstanding(card.id);
      const days = Store.daysToBilling(card);

      let html = '<span class="m-title">📅 עודכן יום החיוב</span>'
        + '💳 <b>' + U.esc(card.name) + '</b> ייגבה בכל <b>' + p.day + '</b> לחודש.';

      html += '<hr>החיוב הבא: ' + U.niceDate(Store.nextBillingDate(card))
        + (days === 0 ? ' — <b>היום</b>' : ' (בעוד ' + b(days) + ' ימים)');
      html += '<br>צפוי לרדת: ' + (out ? b(M(out)) : ok('0 ₪'))
        + (out ? ' <span class="muted">לפי מה שנרשם עד עכשיו</span>' : '');

      if (s.cards.length > 1) {
        html += '<hr><span class="muted">מועדי החיוב שלך: '
          + Store.creditCards().map(c => U.esc(c.name) + ' ב-' + c.billingDay).join(' · ')
          + '</span>';
      }
      return html;
    },

    /* ---------- אירועים ---------- */
    eventNew(p) {
      if (!p.name)
        return '<span class="m-title">🎉 איך לקרוא לאירוע?</span>'
          + 'כתוב למשל: <b>אירוע חדש יום הולדת לשירה</b>'
          + '<br><span class="muted">ואפשר גם עם תקציב: «אירוע חדש יום הולדת לשירה תקציב 2000».</span>';

      const existing = Store.findEvent(p.name);
      if (existing && !existing.closed)
        return '<span class="m-title">כבר יש אירוע כזה</span>'
          + '«' + U.esc(existing.name) + '» כבר פתוח, עם ' + b(M(Store.eventTotal(existing.id))) + ' עד כה.';

      Store.snapshot('אירוע');
      const e = Store.addEvent(p.name, p.budget);

      let html = '<span class="m-title">🎉 נפתח אירוע: ' + U.esc(e.name) + '</span>'
        + (e.budget ? 'תקציב: ' + b(M(e.budget)) : 'בלי תקציב מוגדר — רק מעקב.');

      html += '<hr>מעכשיו כל הוצאה שתזכיר בה «' + U.esc(e.name) + '» תיספר לאירוע:'
        + '<ul><li>קניתי עוגה 180 ל' + U.esc(e.name) + '</li>'
        + '<li>שילמתי 400 על מתנה ל' + U.esc(e.name) + '</li></ul>'
        + '<span class="muted">לסיכום בכל רגע: «כמה הוצאתי על ' + U.esc(e.name) + '». לסיום: «סגור אירוע ' + U.esc(e.name) + '».</span>';
      return html;
    },

    eventQuery(p) {
      const e = p.name ? Store.findEvent(p.name) : (Store.openEvents()[0] || null);
      if (!e) {
        const open = Store.openEvents();
        if (!open.length)
          return '<span class="m-title">אין אירועים פתוחים</span>'
            + 'אפשר לפתוח אחד: <b>אירוע חדש יום הולדת לשירה</b>';
        return '<span class="m-title">🎉 האירועים שלך</span><ul>'
          + open.map(x => '<li>' + U.esc(x.name) + ' — ' + M(Store.eventTotal(x.id)) + '</li>').join('')
          + '</ul>';
      }
      return eventReport(e);
    },

    eventClose(p) {
      const e = Store.findEvent(p.name) || Store.openEvents()[0];
      if (!e) return '<span class="m-title">לא מצאתי אירוע כזה</span>';
      Store.snapshot('סגירת אירוע');
      Store.closeEvent(e.id);
      return '<span class="m-title">🏁 האירוע נסגר: ' + U.esc(e.name) + '</span>'
        + eventReport(e, true);
    },

    eventDelete(p) {
      const e = Store.findEvent(p.name);
      if (!e) return '<span class="m-title">לא מצאתי אירוע כזה</span>';
      Store.snapshot('מחיקת אירוע');
      Store.removeEvent(e.id);
      return '🗑️ האירוע <b>' + U.esc(e.name) + '</b> נמחק. ההוצאות עצמן נשארו רשומות.';
    },

    /* ---------- ניהול קטגוריות ---------- */
    categoryNew(p) {
      if (!p.name)
        return '<span class="m-title">איך לקרוא לקטגוריה?</span>'
          + 'כתוב למשל: <b>תפתח קטגוריה סיגריות</b>';

      const known = Parser.CATEGORIES.some(c => c.name === p.name);
      if (known)
        return '<span class="m-title">הקטגוריה כבר קיימת</span>'
          + Parser.categoryIcon(p.name) + ' <b>' + U.esc(p.name) + '</b> היא קטגוריה מובנית — אפשר להשתמש בה מיד.';

      Store.snapshot('קטגוריה חדשה');
      Store.addCustomCategory(p.name, Parser.guessIcon(p.name));
      if (p.amount) Store.setLimit(p.name, p.amount);

      return '<span class="m-title">' + Parser.categoryIcon(p.name) + ' נפתחה קטגוריה: ' + U.esc(p.name) + '</span>'
        + (p.amount ? 'עם הגבלה חודשית של ' + b(M(p.amount)) + '.<hr>' : '')
        + 'כל הוצאה שתזכיר את המילה הזו תיכנס לכאן אוטומטית.'
        + '<br><span class="muted">להגבלה: «הגבלה ל' + U.esc(p.name) + ' 500». למחיקה: «תמחק קטגוריה ' + U.esc(p.name) + '».</span>';
    },

    categoryDelete(p) {
      if (!p.name) return '<span class="m-title">איזו קטגוריה למחוק?</span>כתוב «תמחק קטגוריה סיגריות».';

      if (Parser.CATEGORIES.some(c => c.name === p.name))
        return '<span class="m-title">אי אפשר למחוק קטגוריה מובנית</span>'
          + '«' + U.esc(p.name) + '» היא חלק מהרשימה הקבועה. אפשר להסיר ממנה הגבלה: «הגבלה ל' + U.esc(p.name) + ' 0».';

      Store.snapshot('מחיקת קטגוריה');
      const had = Store.removeCustomCategory(p.name);
      if (!had) return '<span class="m-title">לא מצאתי קטגוריה כזו</span>לא קיימת קטגוריה בשם «' + U.esc(p.name) + '».';

      return '🗑️ הקטגוריה <b>' + U.esc(p.name) + '</b> נמחקה, וגם ההגבלה שלה.'
        + '<br><span class="muted">הוצאות שכבר נרשמו בה נשארו — הן פשוט לא ייקלטו לשם יותר.</span>';
    },

    /* ---------- ירידת חיוב אשראי ---------- */
    cardSettlement(p) {
      const s = Store.get();
      if (!s.cards.length)
        return '<span class="m-title">אין כרטיסים רשומים</span>'
          + 'קודם ספר לי: «כרטיס ויזה מסגרת 10000».';

      const card = (p.cardName && Store.findCard(p.cardName)) || Store.creditCards()[0] || s.cards[0];
      if (card.kind === 'debit')
        return '<span class="m-title">🤔 ' + U.esc(card.name) + ' הוא כרטיס דביט</span>'
          + 'בדביט אין חיוב חודשי מרוכז — כל קנייה כבר ירדה מהעו"ש ביום שקנית.'
          + '<br><span class="muted">אם הכרטיס בעצם קרדיט, כתוב «' + U.esc(card.name) + ' קרדיט».</span>';
      Store.snapshot('חיוב אשראי');
      const beforeChk = s.balances.checking;
      const outBefore = Store.cardOutstanding(card.id);
      Store.addSettlement(card.id, p.amount,
        'חיוב ' + card.name + (p.prevMonth ? ' — חודש קודם' : ''));

      let html = '<span class="m-title">💳 חיוב האשראי ירד</span>'
        + bad('-' + M(p.amount)) + ' · ' + U.esc(card.name)
        + (p.prevMonth ? ' <span class="tag">חודש קודם</span>' : '');

      html += '<hr><span class="muted">זו לא הוצאה חדשה — הקניות עצמן כבר נרשמו ביום שקנית. '
        + 'זה רק הכסף שעוזב עכשיו את החשבון.</span>';

      html += '<hr>🏛️ עובר ושב: ' + M(beforeChk) + ' → <b>' + M(s.balances.checking) + '</b>';

      const outAfter = Store.cardOutstanding(card.id);
      if (outBefore > 0) {
        html += '<br>יתרת חיובים פתוחה ב' + U.esc(card.name) + ': '
          + M(outBefore) + ' → ' + (outAfter ? b(M(outAfter)) : ok('0 ₪'));
        if (p.amount > outBefore) {
          html += '<br>⚠️ החיוב גדול מהסכום שרשמתי כפתוח. כנראה יש קניות שלא נרשמו — '
            + 'ההפרש הוא ' + warn(M(p.amount - outBefore)) + '.';
        }
      }
      if (s.balances.checking < 0)
        html += '<br>🚨 החיוב הכניס את העו"ש למינוס.';

      return html + balancesLine();
    },

    /* ---------- הפקדה לחשבון ---------- */
    deposit(p) {
      Store.snapshot('הפקדה');
      const A = Parser.ACCOUNTS;
      const before = Store.get().balances[p.to];
      Store.addDeposit(p.to, p.amount, p.note || (p.cash ? 'הפקדה במזומן' : 'הפקדה'));
      const after = Store.get().balances[p.to];

      let html = '<span class="m-title">💵 ההפקדה נרשמה</span>'
        + ok('+' + M(p.amount)) + ' ל' + A[p.to].label
        + (p.cash ? ' <span class="tag">מזומן</span>' : '')
        + '<hr>' + A[p.to].icon + ' ' + A[p.to].label + ': '
        + M(before) + ' → <b>' + M(after) + '</b>';

      html += '<br><span class="muted">רשמתי את זה כתוספת ליתרה בלבד. '
        + 'אם זו הכנסה חדשה שצריכה להיכנס לתקציב החודש — כתוב «קיבלתי ' + U.num(p.amount) + '».</span>';
      return html + balancesLine();
    },

    /* ---------- הגבלה חודשית ---------- */
    limit(p) {
      Store.snapshot('הגבלה');

      // נושא שהמשתמש המציא — נרשם כקטגוריה חדשה ויזוהה מכאן ואילך
      if (p.isNew) Store.addCustomCategory(p.category, Parser.guessIcon(p.category));

      Store.setLimit(p.category, p.amount);
      const spent = Store.categorySpent(p.category);
      const icon = Parser.categoryIcon(p.category);

      let html = '<span class="m-title">🎚️ הוגדרה הגבלה חודשית</span>'
        + icon + ' <b>' + U.esc(p.category) + '</b>: עד ' + b(M(p.amount)) + ' בחודש';

      if (p.isNew) {
        html += '<br><span class="muted">« ' + U.esc(p.category) + ' » היא קטגוריה חדשה שפתחתי עכשיו. '
          + 'מעכשיו כל פעם שתכתוב את המילה הזו, ההוצאה תיכנס לשם אוטומטית.</span>';
      }
      html += '<hr>הוצאת עד כה החודש: ' + b(M(spent)) + ' (' + U.pct(spent, p.amount) + '%).';
      if (spent > p.amount) html += '<br>🚨 כבר חרגת ב־' + bad(M(spent - p.amount)) + '.';
      else {
        const left = p.amount - spent;
        const days = U.daysLeftInMonth();
        html += '<br>נשאר ' + ok(M(left)) + ' — כ־' + b(M(Math.floor(left / Math.max(1, days)))) + ' ליום עד סוף החודש.';
      }
      return html;
    },

    /* ---------- שאילתה ---------- */
    query(p) {
      const cat = p.category;
      const spent = Store.categorySpent(cat);
      const prev = Store.categorySpent(cat, U.prevMonth());
      const limit = Store.get().limits[cat];
      let html = '<span class="m-title">' + Parser.categoryIcon(cat) + ' ' + U.esc(cat) + ' — ' + U.monthLabel(U.currentMonth()) + '</span>'
        + 'הוצאת ' + b(M(spent));
      if (limit) html += ' מתוך הגבלה של ' + M(limit) + ' (' + U.pct(spent, limit) + '%)';
      if (prev) {
        const diff = spent - prev;
        html += '<br>בחודש שעבר: ' + M(prev) + ' — ' + (diff > 0 ? bad('+' + M(diff)) : ok(M(diff))) + ' לעומת אז.';
      }
      const list = Store.txOfMonth().filter(t => t.type === 'expense' && t.category === cat).slice(0, 5);
      if (list.length) {
        html += '<hr><ul>' + list.map(t => '<li>' + U.niceDate(t.date) + ' · ' + U.esc(t.note) + ' — ' + M(t.amount) + '</li>').join('') + '</ul>';
      }
      return html;
    },

    /* ---------- דוח מצב ---------- */
    report() {
      const plan = Store.monthlyPlan();
      const s = Store.get();
      const cats = Store.byCategory().slice(0, 5);

      let html = '<span class="m-title">📊 תמונת מצב — ' + U.monthLabel(plan.month) + '</span>';
      html += '<ul>'
        + '<li>הכנסות: ' + ok(M(plan.income)) + '</li>'
        + '<li>הוצאות: ' + bad(M(plan.spent)) + ' (' + plan.spentPct + '% מההכנסה)</li>'
        + (plan.debts ? '<li>החזרי חובות: ' + b(M(plan.debts)) + '</li>' : '')
        + (plan.savings ? '<li>חיסכון: ' + b(M(plan.savings)) + '</li>' : '')
        + (plan.stocks ? '<li>מניות: ' + b(M(plan.stocks)) + '</li>' : '')
        + (plan.goals ? '<li>יעדי חיסכון: ' + b(M(plan.goals)) + '</li>' : '')
        + (plan.standing ? '<li>הוראות קבע שטרם ירדו: ' + b(M(plan.standing)) + '</li>' : '')
        + '<li><b>פנוי: ' + (plan.free >= 0 ? ok(M(plan.free)) : bad(M(plan.free))) + '</b>'
        + (plan.daysLeft ? ' · ' + M(plan.dailyPace) + ' ליום ל־' + plan.daysLeft + ' ימים' : '') + '</li>'
        + '</ul>';

      if (cats.length) {
        html += '<hr><b>לאן הלך הכסף:</b><ul>'
          + cats.map(([c, v]) => '<li>' + Parser.categoryIcon(c) + ' ' + U.esc(c) + ' — ' + M(v)
            + (s.limits[c] ? ' <span class="muted">(מתוך ' + M(s.limits[c]) + ')</span>' : '') + '</li>').join('')
          + '</ul>';
      }

      if (Store.hasBalances()) {
        html += '<hr><b>הכסף שיש לך עכשיו:</b>'
          + (s.declared.checking ? '<br>🏛️ עו"ש ' + b(M(s.balances.checking)) : '')
          + (s.declared.savings ? ' · 🐖 חיסכון ' + b(M(s.balances.savings)) : '')
          + (s.declared.stocks ? ' · 📈 מניות ' + b(M(s.balances.stocks)) : '')
          + '<br>הון נקי: ' + (Store.netWorth() >= 0 ? ok(M(Store.netWorth())) : bad(M(Store.netWorth())));
      }

      const bills = Store.upcomingBills();
      if (bills.length) {
        html += '<hr><b>חיובי אשראי צפויים:</b><ul>'
          + bills.map(x => '<li>💳 ' + U.esc(x.card.name) + ' — ' + b(M(x.amount))
            + ' ב-' + x.card.billingDay + ' לחודש'
            + (x.days === 0 ? ' <b>(היום)</b>' : ' (בעוד ' + x.days + ' ימים)') + '</li>').join('')
          + '</ul>';
      } else if (s.cards.length) {
        html += '<hr><b>אשראי:</b> נוצלו ' + b(M(Store.totalCardUsed())) + ' מתוך ' + M(Store.totalCardLimit()) + ' מסגרת.';
      }

      const so = Store.activeStandingOrders();
      if (so.length) {
        html += '<hr><b>הוראות קבע:</b> ' + b(M(Store.standingTotal())) + ' בחודש על פני '
          + so.length + ' חיובים.';
        const upcoming = Store.upcomingStandingOrders();
        if (upcoming.length) {
          html += '<br><span class="muted">עוד לפניך: '
            + upcoming.slice(0, 4).map(o => U.esc(o.name) + ' ' + M(o.amount) + ' ב-' + o.day).join(' · ')
            + '</span>';
        }
      }
      if (s.debts.length) {
        html += '<br><b>חובות:</b> ' + bad(M(Store.totalDebt())) + ' · החזר חודשי ' + M(Store.debtMonthly()) + '.';
      }
      const goals = Store.activeGoals();
      if (goals.length) {
        html += '<hr><b>יעדים:</b><ul>' + goals.map(g => {
          const st = Store.goalStatus(g);
          return '<li>' + U.esc(g.name) + ' — ' + M(g.saved) + '/' + M(g.target)
            + ' (' + st.progress + '%) · ' + M(st.need) + ' לחודש · ' + st.months + ' חודשים</li>';
        }).join('') + '</ul>';
      }
      if (!s.transactions.length && !s.profile.salary) {
        html += '<hr><span class="muted">עוד לא סיפרת לי כלום. התחל מ־«המשכורת שלי 12000».</span>';
      }
      return html;
    },

    /* ---------- יתרות בפועל ---------- */
    balance(p) {
      Store.snapshot('יתרה');
      if (p.currency) FX.setAccountCurrency(p.kind, p.currency);
      Store.setBalance(p.kind, p.amount);
      const LABEL = {
        checking: ['🏛️', 'עובר ושב'], cash: ['💵', 'מזומן'],
        savings: ['🐖', 'חיסכון'], stocks: ['📈', 'תיק המניות']
      };
      const [ico, label] = LABEL[p.kind];
      const s = Store.get();

      const cur = FX.accountCurrency(p.kind);
      let html = '<span class="m-title">' + ico + ' עודכנה היתרה</span>'
        + label + ': ' + b(FX.money(p.amount, cur))
        + (cur === 'USD' ? ' <span class="muted">(' + U.money(FX.toILS(p.amount, 'USD')) + ')</span>' : '');

      const missing = Store.ACCOUNT_KINDS.filter(k => !s.declared[k]);
      if (missing.length) {
        const names = { checking: 'עובר ושב', cash: 'מזומן', savings: 'חיסכון', stocks: 'מניות' };
        html += '<hr><span class="muted">חסר לי עוד: ' + missing.map(k => names[k]).join(', ')
          + '. כתוב למשל «יש לי בחיסכון 20000».</span>';
      } else {
        html += '<hr>' + netWorthBlock();
      }
      return html;
    },

    netWorth() {
      if (!Store.hasBalances())
        return '<span class="m-title">🤷 עוד לא סיפרת לי כמה כסף יש לך</span>'
          + 'כתוב לי שלושה דברים:<ul>'
          + '<li>יש לי בעובר ושב 8000</li>'
          + '<li>יש לי בחיסכון 20000</li>'
          + '<li>יש לי במניות 15000</li></ul>'
          + '<span class="muted">ואז אוכל להראות לך את ההון הנקי ולעקוב אחריו.</span>';
      return '<span class="m-title">💎 ההון שלך</span>' + netWorthBlock()
        + '<hr><span class="muted">לפירוט חשבון בודד: «כמה יש לי בחיסכון».</span>';
    },

    balanceQuery(p) {
      const s = Store.get();
      const LABEL = {
        checking: ['🏛️', 'עובר ושב'], cash: ['💵', 'מזומן'],
        savings: ['🐖', 'חיסכון'], stocks: ['📈', 'תיק המניות']
      };
      const [ico, label] = LABEL[p.kind];
      if (!s.declared[p.kind])
        return '<span class="m-title">🤷 אין לי את הנתון הזה</span>כתוב לי «יש לי ב' + label + ' 5000».';

      const cur2 = FX.accountCurrency(p.kind);
      let html = '<span class="m-title">' + ico + ' ' + label + '</span>'
        + b(FX.money(s.balances[p.kind], cur2))
        + (cur2 === 'USD' ? ' <span class="muted">= ' + U.money(FX.toILS(s.balances[p.kind], 'USD')) + '</span>' : '');
      html += accountDetail(p.kind);
      return html;
    },

    /* ---------- "אני יכול להרשות לעצמי?" ---------- */
    afford(p) {
      const plan = Store.monthlyPlan();
      const s = Store.get();
      const amt = p.amount;
      const what = p.what && p.what.length > 1 ? p.what : 'הדבר הזה';
      const freeAfter = plan.free - amt;
      const liquid = Store.liquidNow();
      const hasCash = s.declared.checking;

      let verdict, color, reason = [];

      if (hasCash && amt > liquid) {
        verdict = '❌ לא, לא עכשיו';
        color = 'bad';
        reason.push('זמין לך בעו"ש ' + bad(M(liquid)) + ' בלבד (אחרי חיובי אשראי צפויים), וזה פחות מ־' + M(amt) + '.');
      } else if (freeAfter < 0) {
        verdict = '❌ לא כדאי';
        color = 'bad';
        reason.push('זה מוציא אותך מהתקציב החודשי ב־' + bad(M(-freeAfter)) + '.');
        const goals = Store.activeGoals();
        if (goals.length) reason.push('כדי לעמוד בזה תצטרך לוותר על ההפרשה ל' + U.esc(goals[0].name) + ' החודש.');
      } else if (plan.income && freeAfter < plan.income * 0.05) {
        verdict = '⚠️ אפשר, אבל בקושי';
        color = 'warn';
        reason.push('יישארו לך ' + warn(M(freeAfter)) + ' בלבד עד סוף החודש.');
        reason.push('כל הוצאה לא צפויה תכניס אותך למינוס.');
      } else {
        verdict = '✅ כן, אתה יכול';
        color = 'good';
        reason.push('אחרי הקנייה יישארו לך ' + ok(M(freeAfter)) + ' פנויים החודש.');
      }

      let html = '<span class="m-title">' + verdict + '</span>'
        + U.esc(what) + ' ב־' + b(M(amt)) + '<hr>' + reason.join('<br>');

      // ההשלכה על היעדים
      const goals = Store.activeGoals();
      if (goals.length && freeAfter >= 0) {
        const g = goals[0];
        const st = Store.goalStatus(g);
        if (amt >= st.need) {
          const delay = Math.ceil(amt / st.need);
          html += '<hr>💡 לשם ההשוואה: הסכום הזה שווה ל־' + b(delay) + ' חודשי הפרשה ל' + U.esc(g.name) + '.';
        }
      }

      if (plan.daysLeft > 0 && freeAfter >= 0) {
        html += '<br><span class="muted">קצב יומי אחרי הקנייה: ' + M(Math.floor(freeAfter / plan.daysLeft)) + ' ליום ל־' + plan.daysLeft + ' ימים.</span>';
      }
      return html;
    },

    /* ---------- ייעוץ ---------- */
    advice() {
      const h = Store.health();
      if (h.score === null)
        return '<span class="m-title">🤝 בוא נתחיל</span>' + h.issues[0].text + '<br>' + h.issues[0].fix;

      const emoji = h.score >= 80 ? '💪' : h.score >= 60 ? '🙂' : h.score >= 40 ? '😐' : '🚨';
      const label = h.score >= 80 ? 'מצוין' : h.score >= 60 ? 'סביר' : h.score >= 40 ? 'דורש תשומת לב' : 'בעייתי';

      let html = '<span class="m-title">' + emoji + ' המצב שלך: ' + label + ' (' + h.score + '/100)</span>';

      const bads = h.issues.filter(i => i.level === 'bad');
      const warns = h.issues.filter(i => i.level === 'warn');
      const goods = h.issues.filter(i => i.level === 'good');

      if (bads.length) {
        html += '<hr><b>🚨 מה שדורש טיפול עכשיו</b><ul>'
          + bads.map(i => '<li>' + i.text + (i.fix ? ' <span class="muted">' + i.fix + '</span>' : '') + '</li>').join('')
          + '</ul>';
      }
      if (warns.length) {
        html += (bads.length ? '' : '<hr>') + '<b>⚠️ שווה לשים לב</b><ul>'
          + warns.map(i => '<li>' + i.text + (i.fix ? ' <span class="muted">' + i.fix + '</span>' : '') + '</li>').join('')
          + '</ul>';
      }
      if (goods.length) {
        html += '<b>✅ מה שעובד טוב</b><ul>'
          + goods.map(i => '<li>' + i.text + '</li>').join('') + '</ul>';
      }

      // המלצה קונקרטית: הקטגוריה הכי גדולה שאפשר לקצץ בה
      const cats = Store.byCategory().filter(([c]) => c !== 'חיסכון' && c !== 'חובות');
      if (cats.length) {
        const [topCat, topVal] = cats[0];
        const cut = Math.round(topVal * 0.2 / 10) * 10;
        html += '<hr><b>💡 הצעד הכי משתלם עכשיו</b><br>'
          + 'ההוצאה הגדולה שלך היא ' + Parser.categoryIcon(topCat) + ' <b>' + U.esc(topCat) + '</b> — ' + b(M(topVal)) + ' החודש.'
          + '<br>קיצוץ של 20% שם משחרר ' + ok(M(cut)) + ' בחודש, שזה ' + b(M(cut * 12)) + ' בשנה.'
          + (Store.get().limits[topCat] ? '' : '<br><span class="muted">רוצה שאשמור על זה? כתוב «הגבלה ל' + U.esc(topCat) + ' ' + U.num(topVal - cut) + '».</span>');
      }
      return html;
    },

    /* ---------- חוב מול חיסכון ---------- */
    debtVsSave() {
      const s = Store.get();
      if (!s.debts.length)
        return '<span class="m-title">🎉 אין לך חובות</span>אז השאלה לא רלוונטית — כל שקל פנוי יכול ללכת לחיסכון או להשקעה.'
          + '<br><span class="muted">הסדר המקובל: קודם כרית ביטחון של 3 חודשי הוצאות, ורק אחר כך השקעות.</span>';

      const withRate = s.debts.filter(d => d.interest != null);
      const worst = withRate.sort((a, b) => b.interest - a.interest)[0];

      let html = '<span class="m-title">⚖️ חוב או חיסכון?</span>';

      if (worst) {
        if (worst.interest >= 6) {
          html += 'בחוב שלך «' + U.esc(worst.name) + '» יש ריבית של ' + bad(worst.interest + '%') + '.'
            + '<hr>✅ <b>קודם החוב.</b> ריבית של ' + worst.interest + '% היא תשואה ודאית שאתה "מרוויח" בכל שקל שאתה מחזיר — '
            + 'שוק המניות נותן בממוצע 7%-10% אבל בלי שום ודאות.';
        } else {
          html += 'בחוב שלך «' + U.esc(worst.name) + '» יש ריבית של ' + ok(worst.interest + '%') + ' — נמוכה יחסית.'
            + '<hr>✅ <b>אפשר במקביל.</b> החזר מינימלי על החוב, והשאר לחיסכון והשקעה. '
            + 'בריבית נמוכה מ-6% ההשקעה בדרך כלל מנצחת לאורך זמן.';
        }
      } else {
        html += 'כלל האצבע: <b>ריבית מעל 6% — קודם לסגור את החוב. מתחת לזה — אפשר במקביל.</b>'
          + '<hr><span class="muted">אני לא יודע מה הריבית שלך. כתוב לי «הלוואה בריבית 8%» ואוכל לענות מדויק.</span>';
      }

      const dm = Store.debtMonthly();
      const income = Store.monthIncome();
      html += '<hr>המצב שלך: חוב כולל ' + bad(M(Store.totalDebt()))
        + (dm ? ', החזר חודשי ' + M(dm) + (income ? ' (' + U.pct(dm, income) + '% מההכנסה)' : '') : '');

      if (Store.hasBalances()) {
        const cushion = s.balances.checking + s.balances.savings;
        const avg = Store.monthlyBurn();
        if (avg && cushion < avg * 3) {
          html += '<br>⚠️ אבל לפני הכול — כרית הביטחון שלך קטנה מ-3 חודשי הוצאות. '
            + 'אל תרוקן אותה כדי לסגור חוב, אחרת תחזור לאשראי בהפתעה הראשונה.';
        }
      }
      return html;
    },

    /* ---------- העברה בין חשבונות ---------- */
    transfer(p) {
      Store.snapshot('העברה');
      const A = Parser.ACCOUNTS;
      Store.addTransfer(p.from, p.to, p.amount);
      return '<span class="m-title">🔁 הכסף הועבר</span>'
        + b(M(p.amount)) + ' מ' + A[p.from].label + ' ל' + A[p.to].label
        + '<hr><span class="muted">זו לא הוצאה — הכסף רק עבר מקום, והתקציב החודשי לא הושפע.</span>'
        + balancesLine();
    },

    /* ---------- "אותו דבר" ---------- */
    sameAsBefore() {
      const s = Store.get();
      const plan = Store.monthlyPlan();
      if (!s.profile.salary)
        return '<span class="m-title">🤔 אין לי מה להשאיר</span>עוד לא הגדרת משכורת. כתוב «המשכורת שלי 12000».';

      return '<span class="m-title">👌 בסדר, משאיר הכול כמו שהיה</span>'
        + '<ul><li>משכורת: ' + b(M(s.profile.salary)) + '</li>'
        + (plan.savings ? '<li>לחיסכון: ' + b(M(plan.savings)) + '</li>' : '')
        + (plan.stocks ? '<li>למניות: ' + b(M(plan.stocks)) + '</li>' : '')
        + (plan.goals ? '<li>ליעדים: ' + b(M(plan.goals)) + '</li>' : '')
        + '</ul>'
        + 'נשאר לך החודש: ' + (plan.free >= 0 ? ok(M(plan.free)) : bad(M(plan.free)))
        + (plan.daysLeft ? ' — ' + M(plan.dailyPace) + ' ליום.' : '.');
    },

    /* ---------- סיכום החודש שעבר ---------- */
    monthReview() {
      const rv = Store.monthReview();
      if (!rv.spent)
        return '<span class="m-title">📭 אין נתונים על ' + U.monthLabel(rv.month) + '</span>'
          + 'לא רשמת הוצאות בחודש הזה, אז אין מה לסכם.'
          + '<br><span class="muted">אחרי חודש שלם של רישום אוכל להראות לך בדיוק לאן הכסף הולך.</span>';

      let html = '<span class="m-title">📅 סיכום ' + U.monthLabel(rv.month) + '</span>'
        + '<ul><li>נכנס: ' + ok(M(rv.income)) + '</li>'
        + '<li>יצא: ' + bad(M(rv.spent)) + '</li>'
        + '<li><b>נשאר: ' + (rv.saved >= 0 ? ok(M(rv.saved)) : bad(M(rv.saved))) + '</b></li></ul>';

      html += '<hr><b>לאן הלך הכסף</b><ul>'
        + rv.rows.slice(0, 6).map(r => {
          const trend = !rv.hasPrev || !r.before ? ''
            : r.delta > 0 ? ' <span class="bad">▲ ' + M(r.delta) + '</span>'
              : r.delta < 0 ? ' <span class="good">▼ ' + M(-r.delta) + '</span>' : '';
          return '<li>' + Parser.categoryIcon(r.name) + ' ' + U.esc(r.name) + ' — ' + b(M(r.amount))
            + ' <span class="muted">(' + r.share + '%)</span>' + trend + '</li>';
        }).join('') + '</ul>';

      if (rv.flexTotal) {
        html += '<hr><b>💡 איפה אפשר לוותר</b><br>'
          + 'מתוך ' + M(rv.spent) + ' שהוצאת, ' + warn(M(rv.flexTotal)) + ' (' + rv.flexShare + '%) '
          + 'הלכו לדברים שאפשר לצמצם בלי לפגוע בחיים:<ul>'
          + rv.flex.slice(0, 4).map(r => '<li>' + Parser.categoryIcon(r.name) + ' ' + U.esc(r.name) + ' — ' + M(r.amount) + '</li>').join('')
          + '</ul>'
          + 'קיצוץ שליש שם = ' + ok(M(rv.cutPotential)) + ' בחודש, ' + b(M(rv.cutPotential * 12)) + ' בשנה.';

        const top = rv.flex[0];
        if (top) {
          const cap = Math.round(top.amount * 0.7 / 10) * 10;
          html += '<br><span class="muted">רוצה שאשמור עליך? כתוב «הגבלה ל' + U.esc(top.name) + ' ' + U.num(cap) + '».</span>';
        }
      } else {
        html += '<hr>✅ כל ההוצאות שלך היו בקטגוריות חיוניות — אין כאן שומן לחתוך.';
      }

      if (rv.grew.length) {
        const g = rv.grew[0];
        html += '<hr>📈 העלייה הגדולה ביותר מול ' + U.monthLabel(rv.prev) + ': '
          + Parser.categoryIcon(g.name) + ' <b>' + U.esc(g.name) + '</b> — עלה ב־' + bad(M(g.delta)) + '.';
      }
      return html;
    },

    /* ---------- מערכת ---------- */
    undo() {
      const label = Store.undo();
      if (!label) return '↩️ אין מה לבטל.';
      return '↩️ הפעולה האחרונה (' + U.esc(label) + ') בוטלה.';
    },

    reset() {
      return '<span class="m-title">⚠️ איפוס מלא</span>זה ימחק את כל הנתונים — עסקאות, כרטיסים, חובות ויעדים.'
        + '<br>לאישור כתוב: <b>אני מאשר איפוס</b>';
    },

    help() {
      return '<span class="m-title">👋 ככה מדברים איתי</span>'
        + '<b>הכנסות</b><ul>'
        + '<li>המשכורת שלי 12000</li>'
        + '<li>קיבלתי בונוס 3000</li></ul>'
        + '<b>הוצאות</b><ul>'
        + '<li>קניתי קפה 28 <span class="muted">— או «חמישים שקל» במילים</span></li>'
        + '<li>שילמתי 350 בסופר בויזה</li>'
        + '<li>אתמול דלק 300</li></ul>'
        + '<b>אשראי וחובות</b><ul>'
        + '<li>כרטיס ויזה מסגרת 10000 חיוב ב־10</li>'
        + '<li>יש לי הלוואה 20000 החזר 800 בחודש</li>'
        + '<li>שילמתי 800 על ההלוואה</li></ul>'
        + '<b>הגבלות והפרשות</b><ul>'
        + '<li>הגבלה למסעדות 800</li>'
        + '<li>להפריש 1000 לחיסכון</li>'
        + '<li>10 אחוז למניות</li></ul>'
        + '<b>יעדים</b><ul>'
        + '<li>אני רוצה לחסוך לרכב שעולה 15000 ב־4 חודשים</li>'
        + '<li>הפקדתי 3750 לרכב</li></ul>'
        + '<b>הוראות קבע ומועדי חיוב</b><ul>'
        + '<li>הוראת קבע ארנונה 400 ב-15 לחודש</li>'
        + '<li>הוראות קבע <span class="muted">— לראות את כולן</span></li>'
        + '<li>תמחק הוראת קבע ארנונה</li>'
        + '<li>ויזה חיוב ב-2 לחודש <span class="muted">— לשנות מתי האשראי יורד</span></li></ul>'
        + '<b>תשואה וריבית</b><ul>'
        + '<li>המניות עלו ב-8.5 אחוז</li>'
        + '<li>החיסכון עלה ב-2%</li>'
        + '<li>המניות ירדו ב-3%</li></ul>'
        + '<b>דולרים והמרה</b><ul>'
        + '<li>אני רוצה שהמניות יהיו בדולרים</li>'
        + '<li>כמה זה 500 דולר</li>'
        + '<li>מה שער הדולר?</li>'
        + '<li>הדולר 3.72 <span class="muted">— שער ידני</span></li></ul>'
        + '<b>כמה כסף יש לי</b><ul>'
        + '<li>יש לי בעובר ושב 8000</li>'
        + '<li>יש לי במזומן 500</li>'
        + '<li>יש לי בחיסכון 20000</li>'
        + '<li>יש לי במניות 15000</li>'
        + '<li>כמה ההון שלי?</li></ul>'
        + '<b>להתייעץ איתי</b><ul>'
        + '<li>אני יכול לקנות טלוויזיה ב-3000? <span class="muted">— עונה כן או לא</span></li>'
        + '<li>מה אתה ממליץ? · איך אני עומד?</li>'
        + '<li>עדיף להחזיר את החוב או לחסוך?</li>'
        + '<li>איפה אני מבזבז הכי הרבה?</li></ul>'
        + '<b>מחיקה ותיקון</b><ul>'
        + '<li>תמחק את ההוצאה האחרונה</li>'
        + '<li>תמחק את ההוצאה של 250</li>'
        + '<li>תמחק את הקפה</li>'
        + '<li>בטל <span class="muted">— מבטל את הפעולה האחרונה</span></li></ul>'
        + '<b>שאלות</b><ul>'
        + '<li>מה המצב? · כמה הוצאתי על מזון? · בטל</li></ul>';
    },

    unknown(p) {
      const s = Store.get();

      if (!s.profile.salary)
        return '<span class="m-title">🤔 לא בטוח שהבנתי</span>בוא נתחיל מהבסיס — כמה המשכורת שלך? כתוב למשל «המשכורת שלי 12000».'
          + '<br><span class="muted">לרשימת כל הפקודות: «עזרה»</span>';

      // שאלה שלא זוהתה — לפחות לכוון לשאלות שכן אפשר לשאול
      if (/\?|האם|כמה|מה |למה|איך|מתי|כדאי|עדיף|יכול/.test(p.text || '')) {
        return '<span class="m-title">🤔 לא הבנתי בדיוק מה שאלת</span>'
          + echo(lastInput)
          + 'אבל אפשר לשאול אותי דברים כאלה:<ul>'
          + '<li>אני יכול לקנות אוזניות ב-800?</li>'
          + '<li>מה אתה ממליץ לי?</li>'
          + '<li>כמה יש לי בעובר ושב?</li>'
          + '<li>עדיף להחזיר את החוב או לחסוך?</li>'
          + '<li>כמה הוצאתי על מזון?</li></ul>';
      }

      return '<span class="m-title">🤔 לא מצאתי כאן סכום</span>'
        + echo(lastInput)
        + 'אני עובד על זיהוי מילים וסכומים, אז כמעט תמיד צריך מספר בהודעה — למשל «קניתי פיצה 60».'
        + '<br><span class="muted">לרשימת כל מה שאני מבין: «עזרה»</span>';
    }
  };

  /**
   * פתיחת חודש חדש: סיכום החודש שהסתיים, ואז השאלות החוזרות —
   * מה המשכורת החודש, וכמה מפרישים לחיסכון ולהשקעות.
   */
  function monthlyCheckIn() {
    const s = Store.get();
    const rv = Store.monthReview();

    let html = '<span class="m-title">🗓️ חודש חדש — ' + U.monthLabel(U.currentMonth()) + '</span>';

    if (rv.spent) {
      html += 'קודם כול, ככה נראה ' + U.monthLabel(rv.month) + ':<ul>'
        + '<li>נכנס ' + ok(M(rv.income)) + ', יצא ' + bad(M(rv.spent))
        + ', נשאר ' + (rv.saved >= 0 ? ok(M(rv.saved)) : bad(M(rv.saved))) + '</li>';
      if (rv.rows.length) {
        const top = rv.rows[0];
        html += '<li>הכי הרבה הוצאת על ' + Parser.categoryIcon(top.name) + ' <b>' + U.esc(top.name)
          + '</b> — ' + M(top.amount) + ' (' + top.share + '%)</li>';
      }
      if (rv.flexTotal) {
        html += '<li>' + warn(M(rv.flexTotal)) + ' הלכו לדברים שאפשר לצמצם — '
          + 'קיצוץ שליש שם משחרר ' + ok(M(rv.cutPotential)) + ' בחודש</li>';
      }
      html += '</ul><span class="muted">לפירוט מלא: «סיכום החודש שעבר».</span><hr>';
    }

    html += '<b>עכשיו בוא נכוון את החודש הזה:</b>'
      + '<ol>'
      + '<li>כמה נכנס לך החודש? <b>המשכורת שלי ' + U.num(s.profile.salary || 12000) + '</b></li>'
      + '<li>כמה לחיסכון? <b>להפריש ' + U.num(Store.allocAmount('savings') || 1000) + ' לחיסכון</b>'
      + ' <span class="muted">(או באחוזים: 10% לחיסכון)</span></li>'
      + '<li>כמה למניות? <b>להפריש ' + U.num(Store.allocAmount('stocks') || 500) + ' למניות</b></li>'
      + '</ol>'
      + '<span class="muted">אם שום דבר לא השתנה — כתוב <b>אותו דבר</b> ואשאיר הכול כמו שהיה.</span>';

    const so = Store.activeStandingOrders();
    if (so.length) {
      html += '<hr>🔁 <b>הוראות הקבע שיירדו החודש:</b> ' + M(Store.standingTotal())
        + '<br><span class="muted">'
        + so.slice().sort((a, b) => a.day - b.day)
          .map(o => U.esc(o.name) + ' ' + M(o.amount) + ' ב-' + o.day).join(' · ')
        + '</span>';
    }
    const bills = Store.upcomingBills();
    if (bills.length) {
      html += '<br>💳 <b>חיוב אשראי:</b> '
        + bills.map(x => U.esc(x.card.name) + ' ' + M(x.amount) + ' ב-' + x.card.billingDay).join(' · ');
    }

    return html;
  }

  /** דיווח על הוראות קבע שנרשמו אוטומטית עם פתיחת האפליקציה */
  function standingPostedNotice(posted) {
    if (!posted.length) return null;
    const total = posted.reduce((s, x) => s + x.order.amount, 0);
    const plan = Store.monthlyPlan();
    return '<span class="m-title">🔁 נרשמו הוראות הקבע של החודש</span>'
      + '<ul>' + posted.map(x =>
        '<li>' + Parser.categoryIcon(x.order.category) + ' ' + U.esc(x.order.name)
        + ' — ' + M(x.order.amount) + ' <span class="muted">(ב-' + x.order.day + ' לחודש)</span></li>').join('')
      + '</ul>'
      + 'סה"כ ' + bad('-' + M(total)) + '.'
      + '<hr>נשאר פנוי: ' + (plan.free >= 0 ? ok(M(plan.free)) : bad(M(plan.free))) + '.';
  }

  /** תזכורת על חיוב אשראי שיורד היום או מחר */
  function billingReminder() {
    const soon = Store.upcomingBills().filter(x => x.days <= 1);
    if (!soon.length) return null;
    return '<span class="m-title">💳 חיוב אשראי מתקרב</span>'
      + soon.map(x => '<b>' + U.esc(x.card.name) + '</b> — ' + b(M(x.amount))
        + (x.days === 0 ? ' יורד <b>היום</b>' : ' יורד <b>מחר</b>')).join('<br>')
      + '<hr><span class="muted">כשזה יירד, כתוב לי «ירד חיוב ' + U.esc(soon[0].card.name) + ' ' + U.num(soon[0].amount) + '».</span>';
  }

  return { handle, HANDLERS, monthlyCheckIn, balancesLine, standingPostedNotice, billingReminder };
})();
