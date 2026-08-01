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

['util.js', 'store.js', 'parser.js', 'setup.js', 'engine.js'].forEach(f => {
  eval(fs.readFileSync(path + f, 'utf8'));
});

// רוב הבדיקות עוסקות במצב שאחרי ההקמה; האשף עצמו נבדק בסוף.
Store.get().setup.done = true;

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

console.log('\n== יתרות והון ==');
r = p('יש לי בעובר ושב 8000');
check('יתרת עו"ש', r.intent === 'balance' && r.kind === 'checking' && r.amount === 8000, JSON.stringify(r));

r = p('יש לי בחיסכון 20000');
check('יתרת חיסכון', r.intent === 'balance' && r.kind === 'savings', JSON.stringify(r));

r = p('יש לי במניות 15000');
check('יתרת מניות', r.intent === 'balance' && r.kind === 'stocks', JSON.stringify(r));

r = p('להפריש 1000 לחיסכון');
check('הפרשה לא מתבלבלת עם יתרה', r.intent === 'allocation', JSON.stringify(r));

r = p('כמה יש לי בעובר ושב?');
check('שאילתת יתרה', r.intent === 'balanceQuery' && r.kind === 'checking', JSON.stringify(r));

r = p('כמה ההון שלי?');
check('שאילתת הון', r.intent === 'netWorth', JSON.stringify(r));

Engine.handle('יש לי בעובר ושב 8000');
Engine.handle('יש לי בחיסכון 20000');
Engine.handle('יש לי במניות 15000');
check('היתרות נשמרו', Store.totalAssets() === 43000, Store.totalAssets());
check('הון נקי מנכה חובות',
  Store.netWorth() === 43000 - Store.totalDebt() - Store.pendingCardCharges(),
  Store.netWorth());

const cashBefore = Store.get().balances.checking;
Engine.handle('קניתי לחם 20');
check('הוצאה במזומן מורידה מהעו"ש',
  Store.get().balances.checking === cashBefore - 20, Store.get().balances.checking);

const cashBeforeCard = Store.get().balances.checking;
Engine.handle('שילמתי 500 בויזה על בגדים');
check('חיוב אשראי לא יורד מהעו"ש מיד',
  Store.get().balances.checking === cashBeforeCard, Store.get().balances.checking);
check('אבל נספר כחיוב צפוי', Store.pendingCardCharges() >= 500, Store.pendingCardCharges());

const savBefore = Store.get().balances.savings;
const chkBefore = Store.get().balances.checking;
Engine.handle('הפקדתי 1000 לרכב');
check('הפקדה ליעד מעבירה מעו"ש לחיסכון',
  Store.get().balances.savings === savBefore + 1000 &&
  Store.get().balances.checking === chkBefore - 1000,
  Store.get().balances.checking + '/' + Store.get().balances.savings);

Engine.handle('בטל');
check('ביטול מחזיר גם את היתרות',
  Store.get().balances.savings === savBefore && Store.get().balances.checking === chkBefore,
  Store.get().balances.checking + '/' + Store.get().balances.savings);

console.log('\n== שאלות וייעוץ ==');
r = p('אני יכול לקנות טלוויזיה ב-3000?');
check('שאלת כן/לא', r.intent === 'afford' && r.amount === 3000, JSON.stringify(r));

r = p('כדאי לי לקנות אוזניות ב-800?');
check('"כדאי לי" גם עובד', r.intent === 'afford' && r.amount === 800, JSON.stringify(r));

r = p('מה אתה ממליץ?');
check('בקשת ייעוץ', r.intent === 'advice', JSON.stringify(r));

r = p('איפה אני מבזבז הכי הרבה?');
check('שאלת בזבוז', r.intent === 'advice', JSON.stringify(r));

r = p('עדיף להחזיר את החוב או לחסוך?');
check('חוב מול חיסכון', r.intent === 'debtVsSave', JSON.stringify(r));

r = p('יש לי הלוואה 30000 בריבית 8% החזר 900 בחודש');
check('ריבית נקלטת', r.intent === 'debt' && r.interest === 8, JSON.stringify(r));
check('הריבית לא מבלבלת את ההחזר', r.monthly === 900, JSON.stringify(r));
check('שם החוב לא בולע את הריבית', r.name === 'הלוואה', JSON.stringify(r.name));

// תשובה חיובית: קנייה קטנה שנכנסת בתקציב
let ans = Engine.handle('אני יכול לקנות אוזניות ב-100?');
check('קנייה קטנה → כן', /✅ כן/.test(ans), ans.slice(0, 90));

// תשובה שלילית: קנייה מעל הכסף שיש בעו"ש
ans = Engine.handle('אני יכול לקנות רכב ב-90000?');
check('קנייה ענקית → לא', /❌/.test(ans), ans.slice(0, 90));

ans = Engine.handle('מה אתה ממליץ?');
check('הייעוץ מחזיר ציון', /\d+\/100/.test(ans), ans.slice(0, 90));
check('הייעוץ נותן צעד קונקרטי', /הצעד הכי משתלם/.test(ans));

ans = Engine.handle('עדיף להחזיר את החוב או לחסוך?');
check('ייעוץ חוב מתייחס לריבית', /ריבית/.test(ans), ans.slice(0, 90));

r = p('אני יכול לקנות טלוויזיה ב-3000?');
check('שם הפריט נקי מפיסוק', r.what === 'טלוויזיה', JSON.stringify(r.what));

// כרית ביטחון לא מנופחת כשיש חודש אחד דליל בלבד
check('קצב שריפה מוערך כשאין היסטוריה',
  Store.burnIsEstimated() && Store.monthlyBurn() >= Store.monthIncome() * 0.5,
  Store.monthlyBurn() + ' (חודשים שנרשמו: ' + Store.monthsRecorded() + ')');

const h = Store.health();
check('ציון בריאות בטווח', h.score >= 0 && h.score <= 100, h.score);
check('יש ממצאים', Array.isArray(h.issues) && h.issues.length > 0);

console.log('\n== הוצאה מחשבון ספציפי ==');
r = p('הוצאתי 500 מהחיסכון על מתנה');
check('הוצאה מהחיסכון', r.intent === 'expense' && r.source === 'savings' && r.amount === 500, JSON.stringify(r));

r = p('קניתי מצלמה 2000 מהמניות');
check('הוצאה מהמניות', r.intent === 'expense' && r.source === 'stocks', JSON.stringify(r));

r = p('קניתי קפה 28');
check('ברירת מחדל היא עו"ש', r.intent === 'expense' && r.source === 'checking', JSON.stringify(r));

r = p('העברתי 2000 מהחיסכון לעובר ושב');
check('העברה בין חשבונות', r.intent === 'transfer' && r.from === 'savings' && r.to === 'checking' && r.amount === 2000, JSON.stringify(r));

const sav0 = Store.get().balances.savings;
const chk0 = Store.get().balances.checking;
Engine.handle('הוצאתי 500 מהחיסכון על מתנה');
check('הכסף יצא מהחיסכון ולא מהעו"ש',
  Store.get().balances.savings === sav0 - 500 && Store.get().balances.checking === chk0,
  Store.get().balances.savings + '/' + Store.get().balances.checking);

const preTransfer = { s: Store.get().balances.savings, c: Store.get().balances.checking };
const spentBefore = Store.monthExpense();
Engine.handle('העברתי 1000 מהחיסכון לעובר ושב');
check('העברה מזיזה כסף בין החשבונות',
  Store.get().balances.savings === preTransfer.s - 1000 && Store.get().balances.checking === preTransfer.c + 1000,
  Store.get().balances.savings + '/' + Store.get().balances.checking);
check('העברה אינה הוצאה', Store.monthExpense() === spentBefore, Store.monthExpense());

console.log('\n== סיכום חודשי ==');
r = p('סיכום החודש שעבר');
check('בקשת סיכום', r.intent === 'monthReview', JSON.stringify(r));

r = p('אותו דבר');
check('"אותו דבר"', r.intent === 'sameAsBefore', JSON.stringify(r));

check('קטגוריות גמישות מסומנות',
  Parser.isFlexible('מסעדות') && Parser.isFlexible('בילויים') && !Parser.isFlexible('דיור'));

// בונים היסטוריה לחודש שעבר ובודקים שהסיכום מזהה איפה אפשר לוותר
const prevMonth = U.prevMonth();
[['מסעדות', 1200], ['בילויים', 800], ['דיור', 4000], ['מזון', 1500]].forEach(([cat, amt]) => {
  Store.get().transactions.push({
    id: U.uid(), type: 'expense', amount: amt, category: cat,
    note: cat, date: prevMonth + '-15', source: 'checking'
  });
});
Store.save();

const rv = Store.monthReview();
check('הסיכום מזהה הוצאה גדולה', rv.rows[0].name === 'דיור' && rv.rows[0].amount === 4000, JSON.stringify(rv.rows[0]));
check('מחשב הוצאות גמישות', rv.flexTotal === 2000, rv.flexTotal);
check('מציע פוטנציאל קיצוץ', rv.cutPotential > 0 && rv.cutPotential < rv.flexTotal, rv.cutPotential);

ans = Engine.handle('סיכום החודש שעבר');
check('הסיכום מציג איפה לוותר', /איפה אפשר לוותר/.test(ans), ans.slice(0, 100));
check('הסיכום מציע הגבלה', /הגבלה ל/.test(ans));

ans = Engine.monthlyCheckIn();
check('פתיחת חודש שואלת על המשכורת', /המשכורת שלי/.test(ans), ans.slice(0, 100));
check('פתיחת חודש שואלת על חיסכון והשקעות',
  /לחיסכון/.test(ans) && /למניות/.test(ans));
check('פתיחת חודש מציגה סיכום קודם', /הכי הרבה הוצאת/.test(ans));

console.log('\n== אשף ההקמה ==');
Store.reset();
check('אשף פעיל בהתחלה', Store.get().setup.done === false);
check('פתיחה מסבירה מה לכתוב', /כתוב בדיוק ככה/.test(Setup.start()));

const script = [
  ['12000', 'salary'],
  ['יש לי בעובר ושב 8000', 'checking'],
  ['יש לי בחיסכון 20000', 'savings'],
  ['דלג', 'stocks'],
  ['10% לחיסכון', 'allocSavings'],
  ['דלג', 'allocStocks'],
  ['כרטיס ויזה מסגרת 10000', 'cards'],
  ['אין', 'debts'],
  ['לחסוך לרכב 15000 ב-4 חודשים', 'goal']
];
script.forEach(([msg]) => Engine.handle(msg));

check('האשף הסתיים', Store.get().setup.done === true);
check('משכורת נקלטה באשף', Store.get().profile.salary === 12000);
check('עו"ש נקלט באשף', Store.get().balances.checking === 8000);
check('חיסכון נקלט באשף', Store.get().balances.savings === 20000);
check('דילוג לא מגדיר מניות', !Store.get().declared.stocks);
check('הפרשה באחוזים דרך האשף',
  Store.get().allocations.savings.kind === 'percent' && Store.allocAmount('savings') === 1200,
  JSON.stringify(Store.get().allocations.savings));
check('כרטיס נקלט באשף', Store.get().cards.length === 1 && Store.get().cards[0].limit === 10000);
check('אין חובות אחרי דילוג', Store.get().debts.length === 0);
check('יעד נקלט באשף', Store.get().goals.length === 1 && Store.get().goals[0].target === 15000);

// אחרי האשף, הודעה רגילה מטופלת כרגיל
ans = Engine.handle('קניתי קפה 28');
check('אחרי האשף חוזרים לזרימה רגילה', /נרשמה הוצאה/.test(ans), ans.slice(0, 60));
check('היתרה המצטברת מוצגת', /היתרות שלך/.test(ans));

// שלב חובה לא ניתן לדילוג
Store.reset();
ans = Engine.handle('דלג');
check('שלב חובה לא מדלג', /את השאלה הזו אני חייב/.test(ans), ans.slice(0, 80));
check('נשארנו באותו שלב', Store.get().setup.step === 0);

ans = Engine.handle('בלה בלה');
check('קלט בלי מספר מבקש שוב', /לא הצלחתי לקרוא/.test(ans), ans.slice(0, 80));

console.log('\n== סיכום ==');
console.log(pass + ' עברו, ' + fail + ' נכשלו\n');
process.exit(fail ? 1 : 0);
