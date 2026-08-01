/* בדיקות לוגיקה ללא דפדפן */
const fs = require('fs');
const path = require('path').join(__dirname, '..', 'src') + '/';

// סביבת דפדפן מינימלית
const store = {};
global.localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; }
};
global.window = global;

['util.js', 'store.js', 'parser.js', 'engine.js'].forEach(f => {
  eval(fs.readFileSync(path + f, 'utf8'));
});

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  ✔ ' + name); }
  else { fail++; console.log('  ✘ ' + name + (extra ? '  →  ' + extra : '')); }
}

function p(t) { return Parser.parse(t); }

console.log('\n== ניתוח שפה ==');
let r = p('המשכורת שלי 12000');
check('משכורת', r.intent === 'salary' && r.amount === 12000, JSON.stringify(r));

r = p('אני מרוויח 15,500 ש"ח בחודש');
check('משכורת עם פסיק', r.intent === 'salary' && r.amount === 15500, JSON.stringify(r));

r = p('קניתי קפה ב-28 שקל');
check('הוצאה בסיסית', r.intent === 'expense' && r.amount === 28 && r.category === 'מסעדות', JSON.stringify(r));

r = p('שילמתי 350 בסופר');
check('קטגוריית מזון', r.intent === 'expense' && r.amount === 350 && r.category === 'מזון', JSON.stringify(r));

r = p('אתמול דלק 300');
check('תאריך אתמול + תחבורה', r.intent === 'expense' && r.category === 'תחבורה' && r.date !== U.todayISO(), JSON.stringify(r));

r = p('שילמתי 200 בויזה על נטפליקס');
check('זיהוי כרטיס', r.intent === 'expense' && r.cardName === 'ויזה' && r.category === 'בילויים', JSON.stringify(r));

r = p('כרטיס ויזה מסגרת 10000 חיוב ב10');
check('הגדרת כרטיס', r.intent === 'card' && r.limit === 10000 && r.billingDay === 10, JSON.stringify(r));

r = p('יש לי הלוואה 20000 החזר 800 בחודש');
check('חוב', r.intent === 'debt' && r.amount === 20000 && r.monthly === 800, JSON.stringify(r));

r = p('אני רוצה לחסוך לרכב שעולה 15000 היעד ארבעה חודשים');
check('יעד במילים', r.intent === 'goal' && r.target === 15000 && r.months === 4 && r.name === 'רכב', JSON.stringify(r));

r = p('לחסוך לטיול ליפן 20000 ב-8 חודשים');
check('יעד עם ספרות', r.intent === 'goal' && r.target === 20000 && r.months === 8, JSON.stringify(r));

r = p('אני רוצה לחסוך לחתונה 60000 תוך שנה');
check('יעד "שנה"', r.intent === 'goal' && r.months === 12, JSON.stringify(r));

r = p('להפריש 1000 לחיסכון');
check('הפרשה קבועה', r.intent === 'allocation' && r.kind === 'savings' && r.value === 1000, JSON.stringify(r));

r = p('10 אחוז למניות');
check('הפרשה באחוזים', r.intent === 'allocation' && r.kind === 'stocks' && r.isPercent && r.value === 10, JSON.stringify(r));

r = p('הגבלה למסעדות 800');
check('הגבלה חודשית', r.intent === 'limit' && r.category === 'מסעדות' && r.amount === 800, JSON.stringify(r));

r = p('קיבלתי בונוס 3000');
check('הכנסה חד־פעמית', r.intent === 'income' && r.amount === 3000, JSON.stringify(r));

r = p('הפקדתי 3750 לרכב');
check('הפקדה ליעד', r.intent === 'goalDeposit' && r.amount === 3750 && r.name === 'רכב', JSON.stringify(r));

r = p('מה המצב?');
check('דוח', r.intent === 'report', JSON.stringify(r));

r = p('כמה הוצאתי על מזון?');
check('שאילתה', r.intent === 'query' && r.category === 'מזון', JSON.stringify(r));

r = p('עזרה');
check('עזרה', r.intent === 'help', JSON.stringify(r));

r = p('בטל');
check('ביטול', r.intent === 'undo', JSON.stringify(r));

r = p('5k על ביטוח');
check('קיצור k', r.intent === 'expense' && r.amount === 5000, JSON.stringify(r));

console.log('\n== זרימה מלאה ==');
Engine.handle('המשכורת שלי 12000');
check('משכורת נשמרה', Store.get().profile.salary === 12000);

Engine.handle('כרטיס ויזה מסגרת 10000');
check('כרטיס נוצר', Store.get().cards.length === 1 && Store.get().cards[0].limit === 10000);

Engine.handle('שילמתי 350 בסופר בויזה');
const tx = Store.get().transactions[0];
check('עסקה שויכה לכרטיס', tx.cardId === Store.get().cards[0].id, JSON.stringify(tx));
check('ניצול מסגרת', Store.cardUsed(Store.get().cards[0].id) === 350);

Engine.handle('יש לי הלוואה 20000 החזר 800 בחודש');
check('חוב נשמר', Store.totalDebt() === 20000 && Store.debtMonthly() === 800);

Engine.handle('להפריש 1000 לחיסכון');
check('הפרשה נשמרה', Store.allocAmount('savings') === 1000);

Engine.handle('10 אחוז למניות');
check('אחוז מחושב', Store.allocAmount('stocks') === 1200, Store.allocAmount('stocks'));

Engine.handle('אני רוצה לחסוך לרכב שעולה 15000 היעד ארבעה חודשים');
const g = Store.get().goals[0];
check('יעד נוצר', g && g.target === 15000 && g.months === 4, JSON.stringify(g));
check('הפרשה נדרשת ליעד', Store.goalMonthlyNeed(g) === 3750, Store.goalMonthlyNeed(g));

let plan = Store.monthlyPlan();
// 12000 - 350 הוצאות - 800 חוב - 1000 חיסכון - 1200 מניות - 3750 יעד = 4900
check('חישוב פנוי', plan.free === 4900, JSON.stringify(plan));

const freeBeforeDeposit = Store.monthlyPlan().free;
Engine.handle('הפקדתי 3750 לרכב');
check('הפקדה ליעד', Store.get().goals[0].saved === 3750);
check('התקדמות', Store.goalStatus(Store.get().goals[0]).progress === 25);
check('אין ספירה כפולה של הפקדה ליעד',
  Store.monthlyPlan().free === freeBeforeDeposit,
  freeBeforeDeposit + ' → ' + Store.monthlyPlan().free);
check('ההפקדה סגרה את חובת החודש',
  Store.goalStatus(Store.get().goals[0]).remainingThisMonth === 0);

const freeBeforeDebtPay = Store.monthlyPlan().free;
Engine.handle('שילמתי 800 על ההלוואה');
check('אין ספירה כפולה של החזר חוב',
  Store.monthlyPlan().free === freeBeforeDebtPay,
  freeBeforeDebtPay + ' → ' + Store.monthlyPlan().free);
Engine.handle('בטל');

Engine.handle('הגבלה למסעדות 800');
Engine.handle('קניתי פיצה 900');
check('חריגה מהגבלה', Store.categorySpent('מסעדות') === 900);
const reply = Engine.handle('קניתי פיצה 10');
check('אזהרת חריגה בתשובה', /עברת את ההגבלה/.test(reply), reply.slice(0, 120));

Engine.handle('שילמתי 800 על ההלוואה');
check('החזר חוב הפחית יתרה', Store.totalDebt() === 19200, Store.totalDebt());

const before = Store.get().transactions.length;
Engine.handle('בטל');
check('ביטול החזיר מצב', Store.get().transactions.length === before - 1 || Store.totalDebt() === 20000, Store.totalDebt());

console.log('\n== סיכום ==');
console.log(pass + ' עברו, ' + fail + ' נכשלו\n');
process.exit(fail ? 1 : 0);
