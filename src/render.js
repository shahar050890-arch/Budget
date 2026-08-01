/* render.js — ציור המסכים מתוך המצב */
window.Render = (function () {

  const M = U.money;

  function empty(msg) {
    return '<div class="empty">' + msg + '</div>';
  }

  function barClass(p) {
    if (p >= 100) return 'bad';
    if (p >= 80) return 'warn';
    return 'good';
  }

  /* ---------------- KPI ---------------- */

  function dashboard() {
    const plan = Store.monthlyPlan();
    const s = Store.get();

    const free = document.getElementById('kpiFree');
    free.textContent = M(plan.free);
    free.className = 'kpi-value ' + (plan.free < 0 ? 'bad' : plan.free < plan.income * 0.1 ? 'warn' : 'good');
    document.getElementById('kpiFreeSub').textContent =
      plan.daysLeft ? 'ל־' + plan.daysLeft + ' ימים שנותרו' : 'סוף החודש';
    const usedPct = U.clamp(U.pct(plan.spent + plan.committed, plan.income || 1), 0, 100);
    const fb = document.getElementById('kpiFreeBar');
    fb.style.width = usedPct + '%';
    fb.className = 'bar-fill ' + barClass(usedPct);

    document.getElementById('kpiIncome').textContent = M(plan.income);
    document.getElementById('kpiIncomeSub').textContent =
      s.profile.salary ? 'משכורת: ' + M(s.profile.salary) : 'עוד לא הוגדרה משכורת';

    document.getElementById('kpiExpense').textContent = M(plan.spent);
    document.getElementById('kpiExpenseSub').textContent =
      plan.income ? plan.spentPct + '% מההכנסה' : Store.txOfMonth().length + ' עסקאות';

    const daily = document.getElementById('kpiDaily');
    daily.textContent = M(plan.dailyPace);
    daily.className = 'kpi-value ' + (plan.dailyPace < 0 ? 'bad' : '');
    document.getElementById('kpiDailySub').textContent =
      plan.dailyPace < 0 ? 'חריגה — כדאי לבלום' : 'כדי לסיים את החודש באיזון';

    document.getElementById('breakdownMonth').textContent = U.monthLabel(plan.month);
    balances();
    breakdown();
    limits();
    planList(plan);
  }

  /** משבצות החשבונות — כל חשבון בגודל זהה ובאותה רמת פירוט */
  function balances() {
    const box = document.getElementById('balancesList');
    const s = Store.get();
    if (!Store.hasBalances()) {
      box.innerHTML = empty('עוד לא סיפרת לי כמה כסף יש לך.<br>«יש לי בעובר ושב 8000» · «יש לי במזומן 500»<br>«יש לי בחיסכון 20000» · «יש לי במניות 15000»');
      return;
    }

    const META = {
      checking: ['🏛️', 'עובר ושב'], cash: ['💵', 'מזומן'],
      savings: ['🐖', 'חיסכון'], stocks: ['📈', 'מניות']
    };
    const kinds = Store.ACCOUNT_KINDS.filter(k => s.declared[k]);
    const assets = Store.totalAssets();

    let html = '<div class="acc-grid">' + kinds.map(k => {
      const [ico, label] = META[k];
      const cur = FX.accountCurrency(k);
      const v = s.balances[k];
      const mv = Store.accountMovement(k);
      const move = mv.net > 0 ? '<span class="up">▲ ' + M(mv.net) + '</span>'
        : mv.net < 0 ? '<span class="down">▼ ' + M(-mv.net) + '</span>'
          : '<span class="muted">ללא שינוי</span>';
      return '<div class="acc-tile ' + k + '">'
        + '<div class="acc-head"><span class="acc-ico">' + ico + '</span>' + label + '</div>'
        + '<div class="acc-value' + (v < 0 ? ' bad' : '') + '">' + FX.money(v, cur) + '</div>'
        + (cur === 'USD' ? '<div class="acc-alt">= ' + M(FX.toILS(v, 'USD')) + '</div>' : '')
        + '<div class="acc-move">החודש ' + move + '</div>'
        + '<div class="acc-note">' + (assets ? U.pct(Store.balanceILS(k), assets) + '% מהנכסים' : '') + '</div>'
        + '</div>';
    }).join('') + '</div>';

    const pend = Store.pendingCardCharges();
    const debt = Store.totalDebt();
    if (pend || debt) {
      html += '<div style="margin-top:14px">'
        + (pend ? liability('💳', 'חיובי אשראי צפויים', pend) : '')
        + (debt ? liability('🏦', 'חובות והלוואות', debt) : '')
        + '</div>';
    }

    const net = Store.netWorth();
    html += '<div class="acc-total"><span>💎 הון נקי — נכסים פחות התחייבויות</span>'
      + '<b class="' + (net >= 0 ? 'good' : 'bad') + '">' + M(net) + '</b></div>';

    const usd = kinds.some(k => FX.accountCurrency(k) === 'USD');
    if (usd) html += '<div class="acc-note">' + FX.rateNote() + '</div>';

    box.innerHTML = html;
  }

  function liability(ico, label, val) {
    return '<div class="row"><div class="row-ico">' + ico + '</div>'
      + '<div class="row-main"><div class="row-title">' + label + '</div></div>'
      + '<div class="row-amt bad">-' + M(val) + '</div></div>';
  }

  /**
   * גרף ההוצאות לפי קטגוריה — עמודות אופקיות ממוינות מהגדול לקטן.
   * סדרה אחת בגוון אחד: האורך הוא הנתון. חריגה מהגבלה מסומנת בקו סף
   * ובתווית עם אייקון, ולא בצבע העמודה — כדי שהמשמעות לא תישען על צבע בלבד.
   */
  function breakdown() {
    const box = document.getElementById('breakdown');
    const cats = Store.byCategory();
    if (!cats.length) {
      box.innerHTML = empty('אין עדיין הוצאות החודש.<br>כתוב בצ\'אט «קניתי קפה 28» וזה יופיע כאן בגרף.');
      return;
    }

    const total = cats.reduce((s, c) => s + c[1], 0);
    const max = cats[0][1];                       // הקטגוריה הגדולה קובעת את הסקאלה
    const limits = Store.get().limits;

    let html = '<div class="viz">';

    html += cats.map(([cat, val]) => {
      const limit = limits[cat];
      const over = limit && val > limit;
      // הסקאלה נמתחת עד הגדול מבין ההוצאה וההגבלה, כדי שקו הסף תמיד ייכנס
      const scale = Math.max(max, limit || 0);
      const w = U.clamp((val / scale) * 100, 1.5, 100);
      const limitPos = limit ? U.clamp((limit / scale) * 100, 0, 100) : null;

      return '<div class="viz-row">'
        + '<div class="viz-name">' + Parser.categoryIcon(cat) + '<span>' + U.esc(cat) + '</span>'
        + (over ? '<span class="viz-flag">⚠ מעל ההגבלה</span>' : '') + '</div>'
        + '<div class="viz-val">' + M(val) + ' · ' + U.pct(val, total) + '%'
        + (limit ? ' <span class="muted">מתוך ' + M(limit) + '</span>' : '') + '</div>'
        + '<div class="viz-track">'
        + '<div class="viz-bar" style="width:' + w + '%"></div>'
        + (limitPos != null
          ? '<div class="viz-limit" style="inset-inline-start:' + limitPos + '%" title="הגבלה: ' + M(limit) + '"></div>'
          : '')
        + '</div>'
        + '</div>';
    }).join('');

    // חלוקה לחיוני מול גמיש — כמה מההוצאה בכלל ניתן לצמצם
    const flexTotal = cats.filter(([c]) => Parser.isFlexible(c)).reduce((s, c) => s + c[1], 0);
    const essTotal = total - flexTotal;
    if (flexTotal && essTotal) {
      html += '<div class="viz-foot" style="display:block">'
        + '<div class="viz-split">'
        + '<i class="ess" style="width:' + U.pct(essTotal, total) + '%"></i>'
        + '<i class="flx" style="width:' + U.pct(flexTotal, total) + '%"></i>'
        + '</div>'
        + '<div class="viz-key">'
        + '<span><i></i>חיוני <b>' + M(essTotal) + '</b> (' + U.pct(essTotal, total) + '%)</span>'
        + '<span><i class="soft"></i>ניתן לצמצום <b>' + M(flexTotal) + '</b> (' + U.pct(flexTotal, total) + '%)</span>'
        + '</div></div>';
    } else {
      html += '<div class="viz-foot"><span>סה"כ החודש</span><b style="color:var(--text)">' + M(total) + '</b></div>';
    }

    html += '</div>';
    box.innerHTML = html;
  }

  function limits() {
    const box = document.getElementById('limitsList');
    const lim = Store.get().limits;
    const keys = Object.keys(lim);
    if (!keys.length) { box.innerHTML = empty('לא הוגדרו הגבלות.<br>«הגבלה למסעדות 800»'); return; }
    box.innerHTML = keys.map(cat => {
      const spent = Store.categorySpent(cat);
      const p = U.pct(spent, lim[cat]);
      const left = lim[cat] - spent;
      return '<div class="block">'
        + '<div class="block-head"><strong>' + Parser.categoryIcon(cat) + ' ' + U.esc(cat) + '</strong>'
        + '<span>' + M(spent) + ' / ' + M(lim[cat]) + '</span></div>'
        + '<div class="bar"><div class="bar-fill ' + barClass(p) + '" style="width:' + U.clamp(p, 2, 100) + '%"></div></div>'
        + '<div class="row-sub">' + (left >= 0 ? 'נשאר ' + M(left) : '🚨 חריגה של ' + M(-left))
        + ' · ' + p + '%</div>'
        + '</div>';
    }).join('');
  }

  function planList(plan) {
    const box = document.getElementById('planList');
    const rows = [
      ['💰', 'הכנסות', plan.income, 'good'],
      ['🛍️', 'הוצאות שנרשמו', -plan.spent, 'bad'],
      ['🏦', 'החזרי חובות', -plan.debts, 'bad'],
      ['🐖', 'הפרשה לחיסכון', -plan.savings, 'bad'],
      ['📈', 'הפרשה למניות', -plan.stocks, 'bad'],
      ['🎯', 'יעדי חיסכון', -plan.goals, 'bad'],
      ['🔁', 'הוראות קבע שטרם ירדו', -plan.standing, 'bad']
    ].filter(r => r[2] !== 0);

    if (!rows.length) { box.innerHTML = empty('אין עדיין נתונים לתוכנית.'); return; }

    box.innerHTML = rows.map(([ico, label, val, cls]) =>
      '<div class="row"><div class="row-ico">' + ico + '</div>'
      + '<div class="row-main"><div class="row-title">' + label + '</div></div>'
      + '<div class="row-amt ' + (val >= 0 ? 'good' : 'bad') + '">' + M(val, { plus: true }) + '</div></div>'
    ).join('')
      + '<div class="row"><div class="row-ico">🧮</div>'
      + '<div class="row-main"><div class="row-title">נשאר פנוי</div>'
      + '<div class="row-sub">' + (plan.daysLeft ? M(plan.dailyPace) + ' ליום ל־' + plan.daysLeft + ' ימים' : 'סוף החודש') + '</div></div>'
      + '<div class="row-amt ' + (plan.free >= 0 ? 'good' : 'bad') + '">' + M(plan.free) + '</div></div>';
  }

  /* ---------------- עסקאות ---------------- */

  /** פס הוראות הקבע: מה ירד החודש, מה עוד לפניך, ומתי */
  function standing() {
    const box = document.getElementById('standingList');
    const list = Store.activeStandingOrders();
    if (!list.length) {
      box.innerHTML = empty('אין הוראות קבע.<br>«הוראת קבע ארנונה 400 ב-15 לחודש»<br>שכר דירה, ביטוח, מנויים — כל מה שיורד לבד.');
      return;
    }
    const today = U.dayOfMonth();
    const sorted = list.slice().sort((a, b) => a.day - b.day);

    box.innerHTML = '<div class="so-strip">'
      + sorted.map(o => {
        const done = Store.standingPosted(o.id);
        const due = !done && o.day <= today;
        const cls = done ? ' done' : due ? ' due' : '';
        const left = Store.standingMonthsLeft(o);
        return '<div class="so-item' + cls + '" title="' + U.esc(o.name) + ' — ' + M(o.amount) + '">'
          + '<div class="so-day">' + (done ? '✅' : due ? '⏳' : '🕐') + ' ' + o.day + ' לחודש</div>'
          + '<div class="so-name">' + Parser.categoryIcon(o.name) + ' ' + U.esc(o.name) + '</div>'
          + '<div class="so-amt">' + M(o.amount) + '</div>'
          + '<div class="so-day">' + (o.cardId
            ? '💳 ' + U.esc((Store.get().cards.find(c => c.id === o.cardId) || {}).name || 'אשראי')
            : '🏛️ מהחשבון') + '</div>'
          + (left != null ? '<div class="so-day">עוד ' + left + ' חודשים</div>' : '')
          + '</div>';
      }).join('')
      + '</div>'
      + '<div class="so-foot">'
      + '<span>סה"כ בחודש <b>' + M(Store.standingTotal()) + '</b></span>'
      + '<span>' + (Store.standingRemaining()
        ? 'טרם ירדו <b>' + M(Store.standingRemaining()) + '</b>'
        : 'הכול ירד החודש ✅') + '</span>'
      + '<span>חוזרות אוטומטית בכל חודש</span>'
      + '</div>';
  }

  function transactions() {
    const box = document.getElementById('txList');
    const filter = document.getElementById('txFilter').value;
    let list = Store.get().transactions;
    if (filter === 'month') list = Store.txOfMonth();
    else if (filter === 'prev') list = Store.txOfMonth(U.prevMonth());

    if (!list.length) { box.innerHTML = empty('אין עסקאות להצגה.'); return; }

    const sorted = list.slice().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    let html = '', lastDate = null;
    for (const t of sorted) {
      if (t.date !== lastDate) {
        const dayTotal = sorted.filter(x => x.date === t.date && x.type === 'expense')
          .reduce((s, x) => s + x.amount, 0);
        html += '<div class="date-sep">' + U.niceDate(t.date) + (dayTotal ? ' · ' + M(dayTotal) : '') + '</div>';
        lastDate = t.date;
      }
      const card = t.cardId ? Store.get().cards.find(c => c.id === t.cardId) : null;
      const A = Parser.ACCOUNTS;
      const isTransfer = t.type === 'transfer';
      const isDeposit = t.type === 'deposit';
      const isSettle = t.type === 'settlement';
      const isGrowth = t.type === 'growth';
      const ev = t.eventId ? Store.get().events.find(x => x.id === t.eventId) : null;
      const sub = isGrowth
        ? (A[t.account] ? A[t.account].label : t.account) + ' · שינוי בשווי'
        : isTransfer
        ? A[t.from].label + ' ← ' + A[t.to].label
        : isDeposit
          ? 'הפקדה ל' + A[t.to].label
          : isSettle
            ? 'ירידת חיוב' + (card ? ' · ' + U.esc(card.name) : '')
            : U.esc(t.category)
            + (card ? ' · ' + U.esc(card.name) : '')
            + (t.standingId ? ' · 🔁 הוראת קבע' : '')
            + (t.debit ? ' · ⚡ דביט' : t.onCard && t.cardId ? ' · 🕐 קרדיט' : '')
            + (t.method ? ' · ' + U.esc(t.method) : '')
            + (ev ? ' · 🎉 ' + U.esc(ev.name) : '')
            + (t.source && t.source !== 'checking' ? ' · מה' + A[t.source].label : '');

      html += '<div class="row">'
        + '<div class="row-ico">' + (isGrowth ? (t.gain >= 0 ? '📈' : '📉')
          : isTransfer ? '🔁' : isDeposit ? '💵' : isSettle ? '💳'
            : t.type === 'income' ? '💰' : Parser.categoryIcon(t.category)) + '</div>'
        + '<div class="row-main">'
        + '<div class="row-title">' + U.esc(t.note || t.category) + '</div>'
        + '<div class="row-sub">' + sub + '</div>'
        + '</div>'
        + '<div class="row-amt ' + (isGrowth ? (t.gain >= 0 ? 'good' : 'bad')
          : isTransfer ? '' : isDeposit || t.type === 'income' ? 'good' : 'bad') + '">'
        + (isGrowth ? (t.gain >= 0 ? '+' : '-')
          : isTransfer ? '' : isDeposit || t.type === 'income' ? '+' : '-') + M(t.amount) + '</div>'
        + '<button class="row-del" data-del-tx="' + t.id + '" title="מחק">✕</button>'
        + '</div>';
    }
    box.innerHTML = html;
  }

  /* ---------------- כרטיסים וחובות ---------------- */

  function cards() {
    const box = document.getElementById('cardsList');
    const list = Store.get().cards;
    if (!list.length) { box.innerHTML = empty('לא הוגדרו כרטיסים.<br>«כרטיס ויזה מסגרת 10000»'); return; }
    box.innerHTML = list.map(c => {
      const debit = c.kind === 'debit';
      const used = Store.cardUsed(c.id);
      const out = Store.cardOutstanding(c.id);
      const p = c.limit ? U.pct(debit ? used : out, c.limit) : 0;
      return '<div class="block">'
        + '<div class="block-head"><strong>💳 ' + U.esc(c.name)
        + ' <span class="pill">' + (debit ? '⚡ דביט' : '🕐 קרדיט') + '</span></strong>'
        + '<span>' + M(debit ? used : out) + ' / ' + M(c.limit)
        + ' <button class="row-del" data-del-card="' + c.id + '">✕</button></span></div>'
        + '<div class="bar"><div class="bar-fill ' + barClass(p) + '" style="width:' + U.clamp(p, 2, 100) + '%"></div></div>'
        + '<div class="row-sub">'
        + (debit
          ? 'הוצא החודש ' + M(used) + ' — יורד מהעו"ש מיד'
          : 'חוב פתוח ' + M(out) + ' · פנוי במסגרת ' + M(Math.max(0, c.limit - out)) + ' · ' + p + '% ניצול'
            + (c.billingDay ? ' · ייגבה ב־' + c.billingDay + ' לחודש' : ''))
        + '</div>'
        + '</div>';
    }).join('');
  }

  function debts() {
    const box = document.getElementById('debtsList');
    const list = Store.get().debts;
    if (!list.length) { box.innerHTML = empty('אין חובות רשומים 🎉<br>«יש לי הלוואה 20000 החזר 800»'); return; }
    const total = Store.totalDebt();
    box.innerHTML = list.map(d => {
      const months = d.monthly ? Math.ceil(d.amount / d.monthly) : null;
      return '<div class="block">'
        + '<div class="block-head"><strong>🏦 ' + U.esc(d.name) + '</strong>'
        + '<span>' + M(d.amount) + ' <button class="row-del" data-del-debt="' + d.id + '">✕</button></span></div>'
        + '<div class="bar"><div class="bar-fill bad" style="width:' + U.clamp(U.pct(d.amount, total), 2, 100) + '%"></div></div>'
        + '<div class="row-sub">' + (d.monthly ? 'החזר ' + M(d.monthly) + ' בחודש · ייסגר בעוד ' + months + ' חודשים' : 'לא הוגדר החזר חודשי') + '</div>'
        + '</div>';
    }).join('')
      + '<div class="row"><div class="row-ico">Σ</div><div class="row-main"><div class="row-title">סה"כ חובות</div>'
      + '<div class="row-sub">החזר חודשי כולל: ' + M(Store.debtMonthly()) + '</div></div>'
      + '<div class="row-amt bad">' + M(total) + '</div></div>';
  }

  /* ---------------- יעדים והפרשות ---------------- */

  /* ---------------- גרף חודשי ---------------- */

  let selectedMonth = null;

  /**
   * הוצאות לפי חודש — עמודות בסדר כרונולוגי, סדרה אחת בגוון אחד.
   * הגובה הוא הנתון; החודש הנוכחי מסומן בשקיפות כי הוא עוד לא הסתיים.
   */
  function months() {
    const box = document.getElementById('monthsChart');
    const data = Store.monthlyTotals(12);

    if (!data.some(m => m.spent)) {
      box.innerHTML = empty('אין עדיין נתונים להצגה.<br>אחרי חודש של רישום יופיע כאן גרף שמשווה בין החודשים.');
      document.getElementById('monthDetail').innerHTML = '';
      return;
    }

    const max = Math.max(...data.map(m => m.spent), 1);
    if (!selectedMonth || !data.some(m => m.key === selectedMonth)) {
      selectedMonth = data[data.length - 1].key;
    }

    box.innerHTML = '<div class="mchart">'
      + data.map(m => {
        const h = Math.max(3, Math.round((m.spent / max) * 130));
        return '<button class="mcol' + (m.key === selectedMonth ? ' sel' : '')
          + (m.isCurrent ? ' now' : '') + '" data-month="' + m.key + '"'
          + ' title="' + U.esc(m.label) + ' — ' + M(m.spent) + '">'
          + '<span class="mcol-val">' + (m.spent ? U.num(Math.round(m.spent / 100) / 10) + 'k' : '—') + '</span>'
          + '<span class="mcol-bar" style="height:' + h + 'px"></span>'
          + '<span class="mcol-name">' + m.short + '</span>'
          + '</button>';
      }).join('')
      + '</div>';

    const withData = data.filter(m => m.spent && !m.isCurrent);
    const avg = withData.length ? Math.round(withData.reduce((s, m) => s + m.spent, 0) / withData.length) : 0;
    const peak = data.reduce((a, m) => (m.spent > (a ? a.spent : 0) ? m : a), null);

    box.innerHTML += '<div class="mchart-foot">'
      + (avg ? '<span>ממוצע חודשי <b>' + M(avg) + '</b></span>' : '')
      + (peak && peak.spent ? '<span>הכי גבוה: <b>' + peak.short + '</b> ' + M(peak.spent) + '</span>' : '')
      + '<span>' + data.length + ' חודשים</span>'
      + '</div>';

    box.querySelectorAll('.mcol').forEach(btn =>
      btn.addEventListener('click', () => { selectedMonth = btn.dataset.month; months(); }));

    monthDetail(selectedMonth);
  }

  /** הפירוט המלא של החודש שנבחר בגרף */
  function monthDetail(mKey) {
    const box = document.getElementById('monthDetail');
    const d = Store.monthDetail(mKey);
    const prev = Store.monthDetail(U.prevMonth(mKey));

    const diff = prev.spent ? d.spent - prev.spent : null;
    const trend = diff == null ? ''
      : diff > 0 ? '<span class="pill bad">▲ ' + M(diff) + ' מהחודש הקודם</span>'
        : diff < 0 ? '<span class="pill good">▼ ' + M(-diff) + ' מהחודש הקודם</span>'
          : '<span class="pill">ללא שינוי</span>';

    let html = '<div class="card"><div class="card-head"><h2>' + U.esc(d.label) + '</h2>' + trend + '</div>';

    html += '<div class="grid" style="margin-bottom:14px">'
      + kpi('נכנס', M(d.income), 'good')
      + kpi('יצא', M(d.spent), 'bad')
      + kpi('נשאר', M(d.saved), d.saved >= 0 ? 'good' : 'bad')
      + kpi('ממוצע ליום', M(d.avgPerDay), '')
      + '</div>';

    if (!d.count) {
      html += empty('לא נרשמו הוצאות בחודש הזה.') + '</div>';
      box.innerHTML = html;
      return;
    }

    html += '<div class="viz">' + d.categories.map(([cat, val]) => {
      const w = U.clamp((val / d.categories[0][1]) * 100, 1.5, 100);
      return '<div class="viz-row">'
        + '<div class="viz-name">' + Parser.categoryIcon(cat) + '<span>' + U.esc(cat) + '</span></div>'
        + '<div class="viz-val">' + M(val) + ' · ' + U.pct(val, d.spent) + '%</div>'
        + '<div class="viz-track"><div class="viz-bar" style="width:' + w + '%"></div></div>'
        + '</div>';
    }).join('') + '</div>';

    html += '<div class="so-foot">'
      + '<span>' + d.count + ' הוצאות</span>'
      + (d.standingCount ? '<span>🔁 הוראות קבע <b>' + M(d.standingTotal) + '</b></span>' : '')
      + (d.flex ? '<span>ניתן לצמצום <b>' + M(d.flex) + '</b></span>' : '')
      + '</div>';

    if (d.biggest.length) {
      html += '<div style="margin-top:14px"><div class="date-sep">ההוצאות הגדולות</div>'
        + d.biggest.map(t => '<div class="row">'
          + '<div class="row-ico">' + Parser.categoryIcon(t.category) + '</div>'
          + '<div class="row-main"><div class="row-title">' + U.esc(t.note || t.category) + '</div>'
          + '<div class="row-sub">' + U.niceDate(t.date) + ' · ' + U.esc(t.category)
          + (t.standingId ? ' · 🔁 הוראת קבע' : '') + '</div></div>'
          + '<div class="row-amt bad">-' + M(t.amount) + '</div></div>').join('')
        + '</div>';
    }

    html += '</div>';
    box.innerHTML = html;
  }

  function kpi(label, value, cls) {
    return '<div class="card kpi-card"><span class="kpi-label">' + label + '</span>'
      + '<strong class="kpi-value ' + cls + '" style="font-size:20px">' + value + '</strong></div>';
  }

  function events() {
    const box = document.getElementById('eventsList');
    const list = Store.get().events;
    if (!list.length) {
      box.innerHTML = empty('אין אירועים.<br>«אירוע חדש יום הולדת לשירה תקציב 2000»<br>ואז כל הוצאה שתזכיר את שם האירוע תיספר אליו.');
      return;
    }
    const sorted = list.slice().sort((a, b) => (a.closed === b.closed ? 0 : a.closed ? 1 : -1));
    box.innerHTML = sorted.map(e => {
      const st = Store.eventStatus(e);
      const pct = st.budget ? U.clamp(st.progress, 2, 100) : 100;
      return '<div class="block">'
        + '<div class="block-head"><strong>' + (e.closed ? '🏁' : '🎉') + ' ' + U.esc(e.name)
        + (e.closed ? ' <span class="pill">נסגר</span>' : '') + '</strong>'
        + '<span>' + M(st.spent) + (st.budget ? ' / ' + M(st.budget) : '')
        + ' <button class="row-del" data-del-event="' + e.id + '">✕</button></span></div>'
        + '<div class="bar"><div class="bar-fill ' + (st.budget ? barClass(st.progress) : '')
        + '" style="width:' + pct + '%"></div></div>'
        + '<div class="row-sub">' + st.count + ' הוצאות · מ-' + U.niceDate(e.startDate)
        + (st.budget ? (st.over ? ' · 🚨 חריגה של ' + M(-st.left) : ' · נשאר ' + M(st.left)) : '')
        + '</div>'
        + (st.categories.length
          ? '<div class="row-sub">' + st.categories.slice(0, 4).map(([c, v]) =>
            Parser.categoryIcon(c) + ' ' + U.esc(c) + ' ' + M(v)).join(' · ') + '</div>'
          : '')
        + '</div>';
    }).join('');
  }

  function goals() {
    const box = document.getElementById('goalsList');
    const list = Store.get().goals;
    if (!list.length) { box.innerHTML = empty('אין יעדי חיסכון.<br>«אני רוצה לחסוך לרכב 15000 ב־4 חודשים»'); return; }
    box.innerHTML = list.map(g => {
      const st = Store.goalStatus(g);
      return '<div class="block">'
        + '<div class="block-head"><strong>🎯 ' + U.esc(g.name) + '</strong>'
        + '<span>' + M(g.saved) + ' / ' + M(g.target)
        + ' <button class="row-del" data-del-goal="' + g.id + '">✕</button></span></div>'
        + '<div class="bar"><div class="bar-fill ' + (st.done ? 'good' : '') + '" style="width:' + U.clamp(st.progress, 2, 100) + '%"></div></div>'
        + '<div class="row-sub">'
        + (st.done
          ? '🎉 היעד הושג!'
          : 'נשאר ' + M(st.left) + ' · ' + M(st.need) + ' לחודש · ' + st.months + ' חודשים (עד ' + U.monthLabel(U.monthKey(g.deadline)) + ')'
            + (st.paid ? ' · הופקד החודש ' + M(st.paid) : ''))
        + ' · ' + st.progress + '%</div>'
        + '</div>';
    }).join('');
  }

  function allocations() {
    const box = document.getElementById('allocList');
    const a = Store.get().allocations;
    const keys = Object.keys(a);
    const income = Store.monthIncome();
    if (!keys.length) { box.innerHTML = empty('לא הוגדרו הפרשות קבועות.<br>«להפריש 1000 לחיסכון» · «10% למניות»'); return; }
    const LABEL = { savings: ['🐖', 'חיסכון'], stocks: ['📈', 'מניות והשקעות'] };
    box.innerHTML = keys.map(k => {
      const [ico, label] = LABEL[k] || ['💠', k];
      const amt = Store.allocAmount(k);
      return '<div class="row"><div class="row-ico">' + ico + '</div>'
        + '<div class="row-main"><div class="row-title">' + label + '</div>'
        + '<div class="row-sub">' + (a[k].kind === 'percent' ? a[k].value + '% מההכנסה' : 'סכום קבוע')
        + (income ? ' · ' + U.pct(amt, income) + '% מההכנסה' : '') + '</div></div>'
        + '<div class="row-amt">' + M(amt) + '</div></div>';
    }).join('')
      + '<div class="row"><div class="row-ico">Σ</div>'
      + '<div class="row-main"><div class="row-title">סה"כ הפרשות + יעדים</div>'
      + '<div class="row-sub">' + (income ? U.pct(Store.totalAllocations() + Store.goalsMonthly(), income) + '% מההכנסה החודשית' : '') + '</div></div>'
      + '<div class="row-amt good">' + M(Store.totalAllocations() + Store.goalsMonthly()) + '</div></div>';
  }

  function all() {
    dashboard();
    standing();
    months();
    transactions();
    events();
    cards();
    debts();
    goals();
    allocations();
  }

  return { all, dashboard, balances, standing, months, monthDetail, transactions, events, cards, debts, goals, allocations };
})();
