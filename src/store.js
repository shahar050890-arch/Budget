/* store.js — מצב האפליקציה, שמירה מקומית וחישובים נגזרים */
window.Store = (function () {

  const KEY = 'budget-chat-app:v1';

  const EMPTY = {
    version: 1,
    profile: { salary: 0, salaryDay: 10 },
    transactions: [],   // {id,type:'expense'|'income',amount,category,note,date,cardId,goalId}
    cards: [],          // {id,name,limit,billingDay}
    debts: [],          // {id,name,amount,monthly}
    goals: [],          // {id,name,target,saved,deadline,months,createdAt,done}
    limits: {},         // {category: amount}
    allocations: {},    // {savings|stocks: {kind:'fixed'|'percent', value}}
    chat: [],           // {role:'me'|'bot', html, ts}
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

  /* ================= מוטציות ================= */

  function addTx(tx) {
    const t = Object.assign({ id: U.uid(), date: U.todayISO(), category: 'כללי', cardId: null }, tx);
    state.transactions.unshift(t);
    save();
    return t;
  }

  function removeTx(id) {
    const i = state.transactions.findIndex(t => t.id === id);
    if (i < 0) return null;
    const [t] = state.transactions.splice(i, 1);
    save();
    return t;
  }

  function findCard(name) {
    if (!name) return null;
    const n = String(name).trim();
    return state.cards.find(c => c.name === n)
      || state.cards.find(c => c.name.includes(n) || n.includes(c.name))
      || null;
  }

  function upsertCard(name, limit, billingDay) {
    let c = findCard(name);
    if (c) {
      if (limit != null) c.limit = limit;
      if (billingDay != null) c.billingDay = billingDay;
    } else {
      c = { id: U.uid(), name, limit: limit || 0, billingDay: billingDay || 10 };
      state.cards.push(c);
    }
    save();
    return c;
  }

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
    monthlyPlan, avgMonthlyExpense,
    addTx, removeTx,
    findCard, upsertCard, removeCard,
    findDebt, upsertDebt, removeDebt,
    findGoal, addGoal, removeGoal,
    setLimit, setAllocation, pushChat
  };
})();
