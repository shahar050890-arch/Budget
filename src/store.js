/* store.js — מצב האפליקציה, שמירה מקומית וחישובים נגזרים */
window.Store = (function () {

  const KEY = 'budget-chat-app:v1';

  const EMPTY = {
    version: 1,
    profile: { salary: 0, salaryDay: 10 },
    balances: { checking: 0, savings: 0, stocks: 0 },  // יתרות בפועל
    declared: {},       // אילו יתרות המשתמש הגדיר בפועל {checking:true,...}
    transactions: [],   // {id,type:'expense'|'income',amount,category,note,date,cardId,goalId,toSavings,toStocks}
    cards: [],          // {id,name,limit,billingDay,kind:'credit'|'debit'}
    debts: [],          // {id,name,amount,monthly,interest}
    goals: [],          // {id,name,target,saved,deadline,months,createdAt,done}
    limits: {},         // {category: amount}
    customCategories: [], // קטגוריות שהמשתמש המציא: [{name, icon, flex}]
    events: [],         // אירועים לעקוב אחריהם: [{id,name,budget,startDate,closed}]
    pendingAsk: null,   // שאלה פתוחה שממתינה לתשובה, למשל על מה הייתה ההעברה
    allocations: {},    // {savings|stocks: {kind:'fixed'|'percent', value}}
    chat: [],           // {role:'me'|'bot', html, ts}
    setup: { step: 0, done: false },  // אשף ההקמה בשימוש ראשון
    lastMonthSeen: null,              // לזיהוי מעבר חודש
    history: []         // ל־undo: [{label, snapshot}]
  };

  let state = load();

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return clone(EMPTY);
      const parsed = JSON.parse(raw);
      return Object.assign(clone(EMPTY), parsed);
    } catch (e) {
      console.warn('שחזור נכשל, מתחילים מחדש', e);
      return clone(EMPTY);
    }
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      console.warn('שמירה נכשלה', e);
    }
  }

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function get() { return state; }

  function reset() {
    state = clone(EMPTY);
    save();
  }

  function replace(next) {
    state = Object.assign(clone(EMPTY), next);
    save();
  }

  /** צילום מצב לפני שינוי — מאפשר «בטל» */
  function snapshot(label) {
    const snap = clone(state);
    delete snap.history;
    state.history.push({ label, snapshot: snap });
    if (state.history.length > 30) state.history.shift();
  }

  function undo() {
    const last = state.history.pop();
    if (!last) return null;
    const chat = state.chat;      // לא מבטלים את הצ'אט עצמו
    const history = state.history;
    state = Object.assign(clone(EMPTY), last.snapshot);
    state.chat = chat;
    state.history = history;
    save();
    return last.label;
  }

  /* ================= חישובים נגזרים ================= */

  function txOfMonth(mKey = U.currentMonth()) {
    return state.transactions.filter(t => U.monthKey(t.date) === mKey);
  }

  function monthIncome(mKey = U.currentMonth()) {
    const logged = txOfMonth(mKey)
      .filter(t => t.type === 'income')
      .reduce((s, t) => s + t.amount, 0);
    // המשכורת הקבועה נספרת אם לא נרשמה הכנסה בפועל החודש
    return logged > 0 ? logged : (state.profile.salary || 0);
  }

  function monthExpense(mKey = U.currentMonth()) {
    return txOfMonth(mKey)
      .filter(t => t.type === 'expense')
      .reduce((s, t) => s + t.amount, 0);
  }

  /** סכום הוצאות לפי קטגוריה בחודש */
  function byCategory(mKey = U.currentMonth()) {
    const map = {};
    txOfMonth(mKey).filter(t => t.type === 'expense').forEach(t => {
      map[t.category] = (map[t.category] || 0) + t.amount;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }

  function categorySpent(cat, mKey = U.currentMonth()) {
    return txOfMonth(mKey)
      .filter(t => t.type === 'expense' && t.category === cat)
      .reduce((s, t) => s + t.amount, 0);
  }

  /** ניצול מסגרת של כרטיס — סכום החיובים שנרשמו עליו החודש */
  function cardUsed(cardId, mKey = U.currentMonth()) {
    return txOfMonth(mKey)
      .filter(t => t.type === 'expense' && t.cardId === cardId)
      .reduce((s, t) => s + t.amount, 0);
  }

  function totalCardLimit() {
    return state.cards.reduce((s, c) => s + (c.limit || 0), 0);
  }

  function totalCardUsed(mKey = U.currentMonth()) {
    return state.cards.reduce((s, c) => s + cardUsed(c.id, mKey), 0);
  }

  function totalDebt() {
    return state.debts.reduce((s, d) => s + (d.amount || 0), 0);
  }

  function debtMonthly() {
    return state.debts.reduce((s, d) => s + (d.monthly || 0), 0);
  }

  function debtPaid(debtId, mKey = U.currentMonth()) {
    return txOfMonth(mKey)
      .filter(t => t.debtId === debtId)
      .reduce((s, t) => s + t.amount, 0);
  }

  /** יתרת ההחזרים שעוד לא שולמו החודש — כדי לא לספור תשלום פעמיים */
  function debtRemainingThisMonth() {
    return state.debts.reduce(
      (s, d) => s + Math.max(0, (d.monthly || 0) - debtPaid(d.id)), 0);
  }

  /** הפרשה חודשית בפועל (קבוע או אחוז מהמשכורת) */
  function allocAmount(kind) {
    const a = state.allocations[kind];
    if (!a) return 0;
    if (a.kind === 'percent') return Math.round((monthIncome() * a.value) / 100);
    return a.value || 0;
  }

  function totalAllocations() {
    return Object.keys(state.allocations).reduce((s, k) => s + allocAmount(k), 0);
  }

  /**
   * כמה עוד צריך להפריש החודש לכל היעדים הפעילים.
   * הפקדה שכבר בוצעה החודש נרשמה כתנועה בפועל — לכן היא מנוכה מהדרישה
   * ולא נספרת פעמיים מול הכסף הפנוי.
   */
  function goalsMonthly() {
    return activeGoals().reduce((s, g) => s + goalRemainingThisMonth(g), 0);
  }

  function activeGoals() {
    return state.goals.filter(g => !g.done && g.saved < g.target);
  }

  function goalMonthlyNeed(g) {
    const left = Math.max(0, g.target - g.saved);
    const months = Math.max(1, U.monthsUntil(g.deadline));
    return Math.ceil(left / months);
  }

  function goalDeposited(goalId, mKey = U.currentMonth()) {
    return txOfMonth(mKey)
      .filter(t => t.goalId === goalId)
      .reduce((s, t) => s + t.amount, 0);
  }

  function goalRemainingThisMonth(g) {
    return Math.max(0, goalMonthlyNeed(g) - goalDeposited(g.id));
  }

  function goalStatus(g) {
    const left = Math.max(0, g.target - g.saved);
    const months = Math.max(1, U.monthsUntil(g.deadline));
    const need = Math.ceil(left / months);
    const paid = goalDeposited(g.id);
    return {
      left, months, need, paid,
      remainingThisMonth: Math.max(0, need - paid),
      progress: U.pct(g.saved, g.target),
      done: g.saved >= g.target
    };
  }

  /**
   * התמונה החודשית המלאה — הלב של האפליקציה.
   * פנוי = הכנסות − הוצאות בפועל − התחייבויות שטרם שולמו (חובות, הפרשות, יעדים)
   */
  function monthlyPlan(mKey = U.currentMonth()) {
    const income = monthIncome(mKey);
    const spent = monthExpense(mKey);
    const debts = debtRemainingThisMonth();
    const savings = allocAmount('savings');
    const stocks = allocAmount('stocks');
    const goals = goalsMonthly();
    const committed = debts + savings + stocks + goals;
    const free = income - spent - committed;
    const daysLeft = mKey === U.currentMonth() ? U.daysLeftInMonth() : 0;

    return {
      month: mKey, income, spent, debts, savings, stocks, goals, committed, free,
      daysLeft,
      dailyPace: daysLeft > 0 ? Math.floor(free / daysLeft) : free,
      spentPct: U.pct(spent, income || 1)
    };
  }

  /** ממוצע הוצאה חודשי על סמך החודשים שנרשמו */
  function avgMonthlyExpense() {
    const months = {};
    state.transactions.filter(t => t.type === 'expense')
      .forEach(t => { const k = U.monthKey(t.date); months[k] = (months[k] || 0) + t.amount; });
    const vals = Object.values(months);
    if (!vals.length) return 0;
    return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
  }

  /** כמה חודשים מלאים של הוצאות נרשמו (החודש הנוכחי לא נחשב מלא) */
  function monthsRecorded() {
    const set = new Set(state.transactions.filter(t => t.type === 'expense').map(t => U.monthKey(t.date)));
    set.delete(U.currentMonth());
    return set.size;
  }

  /**
   * קצב השריפה החודשי — הבסיס לחישוב כרית הביטחון.
   * חודש-חודשיים של נתונים חלקיים נותנים ממוצע נמוך בטעות ומנפחים את
   * כרית הביטחון, ולכן עד שנצבר היסטוריה אמיתית משתמשים באומדן שמרני
   * מתוך ההכנסה.
   */
  function monthlyBurn() {
    const avg = avgMonthlyExpense();
    if (monthsRecorded() >= 2) return avg;
    const income = monthIncome();
    const estimate = income ? Math.round(income * 0.7) : 0;
    return Math.max(avg, estimate);
  }

  function burnIsEstimated() {
    return monthsRecorded() < 2;
  }

  /** שיעור החיסכון: כמה מההכנסה הולך לחיסכון, מניות ויעדים */
  function savingsRate() {
    const income = monthIncome();
    if (!income) return 0;
    return U.pct(totalAllocations() + goalsMonthly(), income);
  }

  /**
   * אבחון מצב פיננסי — הבסיס לייעוץ בצ'אט.
   * מחזיר רשימת ממצאים ממוינים לפי חומרה, וציון 0–100.
   */
  function health() {
    const plan = monthlyPlan();
    const income = plan.income;
    const issues = [];   // {level:'bad'|'warn'|'good', text, fix}
    let score = 100;

    if (!income) {
      return { score: null, issues: [{ level: 'warn', text: 'עוד לא הגדרת משכורת, אז אין לי בסיס להשוואה.', fix: 'כתוב «המשכורת שלי 12000».' }], plan };
    }

    // 1. תזרים חודשי
    if (plan.free < 0) {
      score -= 35;
      issues.push({ level: 'bad', text: 'אתה בגירעון חודשי של ' + U.money(-plan.free) + '.', fix: 'צריך לקצץ בהוצאות או להקטין הפרשות.' });
    } else if (income && plan.free < income * 0.05) {
      score -= 15;
      issues.push({ level: 'warn', text: 'העודף החודשי דק מאוד — ' + U.money(plan.free) + ' בלבד.', fix: 'כל הוצאה לא צפויה תוציא אותך מאיזון.' });
    }

    // 2. עומס חובות
    const dm = debtMonthly();
    if (dm > income * 0.35) {
      score -= 25;
      issues.push({ level: 'bad', text: 'החזרי החובות הם ' + U.pct(dm, income) + '% מההכנסה — מעל הסף הבריא של 35%.', fix: 'עדיף למחזר או לאחד הלוואות.' });
    } else if (dm > income * 0.2) {
      score -= 10;
      issues.push({ level: 'warn', text: 'החזרי החובות הם ' + U.pct(dm, income) + '% מההכנסה.', fix: 'שווה לסגור קודם את החוב היקר ביותר.' });
    }

    // 3. שיעור חיסכון
    const sr = savingsRate();
    if (sr === 0) {
      score -= 20;
      issues.push({ level: 'warn', text: 'אתה לא מפריש כלום לחיסכון.', fix: 'התחל אפילו מ-5% — «להפריש ' + U.num(Math.round(income * 0.05 / 50) * 50) + ' לחיסכון».' });
    } else if (sr < 10) {
      score -= 8;
      issues.push({ level: 'warn', text: 'שיעור החיסכון שלך הוא ' + sr + '% — מתחת ל-10% המקובלים.', fix: 'נסה להעלות בהדרגה.' });
    } else {
      issues.push({ level: 'good', text: 'שיעור חיסכון של ' + sr + '% — יפה מאוד.', fix: '' });
    }

    // 4. כרית ביטחון
    if (hasBalances()) {
      const avg = monthlyBurn();
      const cushion = state.balances.checking + state.balances.savings;
      const months = avg ? (cushion / avg) : 0;
      if (months < 1) {
        score -= 20;
        issues.push({ level: 'bad', text: 'כרית הביטחון שלך מכסה פחות מחודש הוצאות.', fix: 'היעד הראשון צריך להיות 3 חודשי הוצאות — ' + U.money(avg * 3) + '.' });
      } else if (months < 3) {
        score -= 10;
        issues.push({ level: 'warn', text: 'כרית הביטחון מכסה ' + months.toFixed(1) + ' חודשי הוצאות.', fix: 'כדאי להגיע ל-3 חודשים לפחות (' + U.money(avg * 3) + ').' });
      } else {
        issues.push({ level: 'good', text: 'כרית ביטחון של ' + months.toFixed(1) + ' חודשי הוצאות — מצוין.', fix: '' });
      }
    }

    // 5. ניצול אשראי
    const limit = totalCardLimit();
    if (limit) {
      const util = U.pct(totalCardUsed(), limit);
      if (util > 75) {
        score -= 12;
        issues.push({ level: 'bad', text: 'ניצול מסגרות האשראי עומד על ' + util + '%.', fix: 'ניצול גבוה פוגע בדירוג האשראי.' });
      }
    }

    // 6. חריגות מהגבלות
    Object.keys(state.limits).forEach(cat => {
      const spent = categorySpent(cat);
      if (spent > state.limits[cat]) {
        score -= 5;
        issues.push({ level: 'warn', text: 'חריגה ב' + cat + ': ' + U.money(spent) + ' מתוך ' + U.money(state.limits[cat]) + '.', fix: 'זה ' + U.money(spent - state.limits[cat]) + ' מעל התקציב.' });
      }
    });

    const order = { bad: 0, warn: 1, good: 2 };
    issues.sort((a, b) => order[a.level] - order[b.level]);
    return { score: U.clamp(Math.round(score), 0, 100), issues, plan };
  }

  /**
   * סיכום חודש: כמה נכנס, כמה יצא, ומה השתנה מול החודש שלפניו.
   * זה מה שמאפשר לומר "כאן אתה מוציא הכי הרבה, וכאן אפשר לוותר".
   */
  function monthReview(mKey = U.prevMonth()) {
    const prev = U.prevMonth(mKey);
    const income = monthIncome(mKey);
    const spent = monthExpense(mKey);
    const cats = byCategory(mKey);
    const prevCats = Object.fromEntries(byCategory(prev));

    const rows = cats.map(([name, amount]) => {
      const before = prevCats[name] || 0;
      return {
        name, amount, before,
        delta: amount - before,
        share: U.pct(amount, spent || 1),
        flex: Parser.isFlexible(name)
      };
    });

    const flex = rows.filter(r => r.flex);
    const flexTotal = flex.reduce((s, r) => s + r.amount, 0);
    const grew = rows.filter(r => r.before > 0 && r.delta > 0).sort((a, b) => b.delta - a.delta);

    return {
      month: mKey, prev, income, spent, rows,
      saved: income - spent,
      flex, flexTotal,
      flexShare: U.pct(flexTotal, spent || 1),
      grew,
      hasPrev: Object.keys(prevCats).length > 0,
      // כמה אפשר לחסוך בקיצוץ שליש מההוצאות הגמישות
      cutPotential: Math.round(flexTotal / 3 / 10) * 10
    };
  }

  /** האם עברנו לחודש חדש מאז הפעם הקודמת שנפתחה האפליקציה */
  function isNewMonth() {
    return state.lastMonthSeen !== null && state.lastMonthSeen !== U.currentMonth();
  }

  function markMonthSeen() {
    state.lastMonthSeen = U.currentMonth();
    save();
  }

  /* ================= מוטציות ================= */

  /**
   * החלת תנועה על היתרות בפועל. dir=1 להחלה, dir=-1 לביטול.
   * חיוב אשראי לא יורד מהעו"ש עכשיו — הוא יירד ביום החיוב, ולכן נספר
   * בנפרד כ"חיוב צפוי" (ראו pendingCardCharges).
   */
  function applyBalance(t, dir) {
    const b = state.balances;
    if (t.type === 'transfer') {
      b[t.from] -= dir * t.amount;
      b[t.to] += dir * t.amount;
      return;
    }
    // הפקדה: כסף שנכנס לחשבון בלי להיות הכנסה של החודש
    if (t.type === 'deposit') { b[t.to] += dir * t.amount; return; }
    // סליקת אשראי: הכסף עוזב את העו"ש עבור הוצאות שכבר נרשמו
    if (t.type === 'settlement') { b.checking -= dir * t.amount; return; }
    if (t.type === 'income') { b[t.dest || 'checking'] += dir * t.amount; return; }

    // תשלום בכרטיס: דביט יורד מהעו"ש מיד, קרדיט ממתין לחיוב החודשי.
    // onCard מסמן תשלום בכרטיס שעדיין לא נבחר איזה — גם הוא לא יורד עכשיו.
    if (t.cardId || t.onCard) {
      if (t.debit) b.checking -= dir * t.amount;
      return;
    }

    b[t.source || 'checking'] -= dir * t.amount;
    if (t.goalId || t.toSavings) b.savings += dir * t.amount;
    if (t.toStocks) b.stocks += dir * t.amount;
  }

  function addTx(tx) {
    const t = Object.assign({ id: U.uid(), date: U.todayISO(), category: 'כללי', cardId: null }, tx);
    state.transactions.unshift(t);
    applyBalance(t, 1);
    save();
    return t;
  }

  function removeTx(id) {
    const i = state.transactions.findIndex(t => t.id === id);
    if (i < 0) return null;
    const [t] = state.transactions.splice(i, 1);
    applyBalance(t, -1);
    save();
    return t;
  }

  /** העברה בין חשבונות — לא הוצאה, רק הזזת כסף */
  function addTransfer(from, to, amount, note) {
    const t = {
      id: U.uid(), type: 'transfer', from, to, amount,
      note: note || 'העברה', date: U.todayISO(), category: 'העברה'
    };
    state.transactions.unshift(t);
    applyBalance(t, 1);
    save();
    return t;
  }

  /** הפקדה לחשבון — מגדילה יתרה, אינה הכנסה חודשית ואינה הוצאה */
  function addDeposit(to, amount, note) {
    const t = {
      id: U.uid(), type: 'deposit', to, amount,
      note: note || 'הפקדה', date: U.todayISO(), category: 'הפקדה'
    };
    state.transactions.unshift(t);
    state.declared[to] = true;
    applyBalance(t, 1);
    save();
    return t;
  }

  /* ---------- אירועים ---------- */

  function addEvent(name, budget) {
    const e = {
      id: U.uid(), name, budget: budget || 0,
      startDate: U.todayISO(), closed: false
    };
    state.events.push(e);
    save();
    return e;
  }

  function findEvent(name) {
    if (!name) return null;
    const n = String(name).trim();
    return state.events.find(e => e.name === n)
      || state.events.find(e => e.name.includes(n) || n.includes(e.name)) || null;
  }

  function openEvents() {
    return state.events.filter(e => !e.closed);
  }

  /** כל ההוצאות ששויכו לאירוע, בכל החודשים */
  function eventTx(eventId) {
    return state.transactions.filter(t => t.eventId === eventId && t.type === 'expense');
  }

  function eventTotal(eventId) {
    return eventTx(eventId).reduce((s, t) => s + t.amount, 0);
  }

  function eventStatus(e) {
    const spent = eventTotal(e.id);
    const list = eventTx(e.id);
    const byCat = {};
    list.forEach(t => { byCat[t.category] = (byCat[t.category] || 0) + t.amount; });
    return {
      spent, count: list.length,
      categories: Object.entries(byCat).sort((a, b) => b[1] - a[1]),
      budget: e.budget,
      left: e.budget ? e.budget - spent : null,
      progress: e.budget ? U.pct(spent, e.budget) : null,
      over: e.budget ? spent > e.budget : false,
      days: Math.max(1, Math.round((new Date(U.todayISO()) - new Date(e.startDate)) / 86400000) + 1)
    };
  }

  function closeEvent(id) {
    const e = state.events.find(x => x.id === id);
    if (e) { e.closed = true; e.endDate = U.todayISO(); save(); }
    return e;
  }

  function removeEvent(id) {
    state.events = state.events.filter(e => e.id !== id);
    state.transactions.forEach(t => { if (t.eventId === id) t.eventId = null; });
    save();
  }

  /* ---------- סליקת אשראי ---------- */

  /**
   * חיובי קרדיט שנרשמו על הכרטיס, בכל החודשים.
   * חיובי דביט לא נספרים — הם כבר ירדו מהעו"ש ביום הקנייה.
   */
  function cardChargesAllTime(cardId) {
    return state.transactions
      .filter(t => t.type === 'expense' && t.cardId === cardId && !t.debit)
      .reduce((s, t) => s + t.amount, 0);
  }

  /** כמה כבר ירד בפועל מהעו"ש עבור הכרטיס */
  function cardSettled(cardId) {
    return state.transactions
      .filter(t => t.type === 'settlement' && t.cardId === cardId)
      .reduce((s, t) => s + t.amount, 0);
  }

  /** יתרת החוב הפתוחה לכרטיס — מה שנרשם ועוד לא ירד */
  function cardOutstanding(cardId) {
    return Math.max(0, cardChargesAllTime(cardId) - cardSettled(cardId));
  }

  /**
   * ירידת חיוב האשראי מהעו"ש. ההוצאות עצמן כבר נרשמו ביום הקנייה,
   * ולכן זו אינה הוצאה חדשה — רק הכסף שעוזב את החשבון.
   */
  function addSettlement(cardId, amount, note) {
    const t = {
      id: U.uid(), type: 'settlement', cardId, amount,
      note: note || 'חיוב אשראי', date: U.todayISO(), category: 'אשראי'
    };
    state.transactions.unshift(t);
    applyBalance(t, 1);
    save();
    return t;
  }

  /**
   * שיוך תנועה לכרטיס אחרי שנרשמה — למשל אחרי שהמשתמש ענה מאיזה כרטיס שילם.
   * מבטל את השפעת התנועה על היתרות ומחיל אותה מחדש לפי סוג הכרטיס.
   */
  function setTxCard(txId, cardId) {
    const t = state.transactions.find(x => x.id === txId);
    if (!t) return null;
    const card = state.cards.find(c => c.id === cardId);
    if (!card) return null;

    applyBalance(t, -1);
    t.cardId = card.id;
    t.onCard = true;
    t.debit = card.kind === 'debit';
    applyBalance(t, 1);
    save();
    return t;
  }

  function removeCustomCategory(name) {
    const had = state.customCategories.some(c => c.name === name);
    state.customCategories = state.customCategories.filter(c => c.name !== name);
    delete state.limits[name];
    save();
    return had;
  }

  /* ---------- יתרות והון ---------- */

  function setBalance(kind, amount) {
    state.balances[kind] = amount;
    state.declared[kind] = true;
    save();
  }

  function hasBalances() {
    return Object.keys(state.declared).length > 0;
  }

  /** חיובי אשראי שנרשמו וטרם ירדו מהעו"ש, על פני כל החודשים */
  function pendingCardCharges() {
    return state.cards.reduce((s, c) => s + cardOutstanding(c.id), 0);
  }

  function totalAssets() {
    const b = state.balances;
    return b.checking + b.savings + b.stocks;
  }

  /** הון נקי = נכסים − חובות − חיובי אשראי שטרם ירדו */
  function netWorth() {
    return totalAssets() - totalDebt() - pendingCardCharges();
  }

  /** כמה זמין באמת להוצאה עכשיו: עו"ש פחות מה שכבר מיועד */
  function liquidNow() {
    return state.balances.checking - pendingCardCharges();
  }

  function findCard(name) {
    if (!name) return null;
    const n = String(name).trim();
    return state.cards.find(c => c.name === n)
      || state.cards.find(c => c.name.includes(n) || n.includes(c.name))
      || null;
  }

  function upsertCard(name, limit, billingDay, kind) {
    let c = findCard(name);
    if (c) {
      if (limit != null) c.limit = limit;
      if (billingDay != null) c.billingDay = billingDay;
      if (kind) c.kind = kind;
    } else {
      c = {
        id: U.uid(), name, limit: limit || 0,
        billingDay: billingDay || 10,
        kind: kind || 'credit'      // ברירת המחדל בישראל היא כרטיס קרדיט
      };
      state.cards.push(c);
    }
    save();
    return c;
  }

  function creditCards() { return state.cards.filter(c => c.kind !== 'debit'); }
  function debitCards() { return state.cards.filter(c => c.kind === 'debit'); }
  function hasBothCardKinds() { return creditCards().length > 0 && debitCards().length > 0; }

  function removeCard(id) {
    state.cards = state.cards.filter(c => c.id !== id);
    state.transactions.forEach(t => { if (t.cardId === id) t.cardId = null; });
    save();
  }

  function findDebt(name) {
    if (!name) return null;
    const n = String(name).trim();
    return state.debts.find(d => d.name === n)
      || state.debts.find(d => d.name.includes(n) || n.includes(d.name)) || null;
  }

  function upsertDebt(name, amount, monthly) {
    let d = findDebt(name);
    if (d) {
      if (amount != null) d.amount = amount;
      if (monthly != null) d.monthly = monthly;
    } else {
      d = { id: U.uid(), name, amount: amount || 0, monthly: monthly || 0 };
      state.debts.push(d);
    }
    save();
    return d;
  }

  function removeDebt(id) {
    state.debts = state.debts.filter(d => d.id !== id);
    save();
  }

  function findGoal(name) {
    if (!name) return null;
    const n = String(name).trim();
    return state.goals.find(g => g.name === n)
      || state.goals.find(g => g.name.includes(n) || n.includes(g.name)) || null;
  }

  function addGoal(name, target, months) {
    const g = {
      id: U.uid(), name, target, saved: 0, months,
      deadline: U.deadlineFromMonths(months),
      createdAt: U.todayISO(), done: false
    };
    state.goals.push(g);
    save();
    return g;
  }

  function removeGoal(id) {
    state.goals = state.goals.filter(g => g.id !== id);
    save();
  }

  /**
   * קטגוריה שהמשתמש המציא — נשמרת ומזוהה מכאן ואילך.
   * ברירת המחדל היא "גמישה": כשמישהו פותח קטגוריה במיוחד כדי לעקוב אחריה,
   * זו כמעט תמיד הוצאה שהוא שוקל לצמצם ולא הוצאה חיונית.
   */
  function addCustomCategory(name, icon, flex) {
    const exists = state.customCategories.some(c => c.name === name);
    if (!exists) state.customCategories.push({
      name, icon: icon || '🏷️', flex: flex !== false
    });
    save();
    return name;
  }

  function setLimit(cat, amount) {
    if (amount === 0) delete state.limits[cat];
    else state.limits[cat] = amount;
    save();
  }

  function setAllocation(kind, value, isPercent) {
    if (!value) delete state.allocations[kind];
    else state.allocations[kind] = { kind: isPercent ? 'percent' : 'fixed', value };
    save();
  }

  function pushChat(role, html) {
    state.chat.push({ role, html, ts: Date.now() });
    if (state.chat.length > 300) state.chat.shift();
    save();
  }

  return {
    get, save, reset, replace, snapshot, undo,
    txOfMonth, monthIncome, monthExpense, byCategory, categorySpent,
    cardUsed, totalCardLimit, totalCardUsed, totalDebt, debtMonthly, debtPaid, debtRemainingThisMonth,
    allocAmount, totalAllocations, goalsMonthly, activeGoals, goalMonthlyNeed,
    goalDeposited, goalRemainingThisMonth, goalStatus,
    monthlyPlan, avgMonthlyExpense, monthlyBurn, burnIsEstimated, monthsRecorded,
    addTx, removeTx,
    setBalance, hasBalances, pendingCardCharges, totalAssets, netWorth, liquidNow,
    savingsRate, health, monthReview, isNewMonth, markMonthSeen, addTransfer, addDeposit,
    findCard, upsertCard, removeCard, creditCards, debitCards, hasBothCardKinds,
    findDebt, upsertDebt, removeDebt,
    findGoal, addGoal, removeGoal,
    setLimit, setAllocation, pushChat, addCustomCategory, removeCustomCategory,
    addEvent, findEvent, openEvents, eventTx, eventTotal, eventStatus, closeEvent, removeEvent,
    cardChargesAllTime, cardSettled, cardOutstanding, addSettlement, setTxCard
  };
})();
