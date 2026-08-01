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

r = p('שילמתי 3200 שכר דירה');
check('"שכר דירה" הוא הוצאה ולא משכורת',
  r.intent === 'expense' && r.category === 'דיור' && r.amount === 3200, JSON.stringify(r));

r = p('שילמתי 8000 שכר לימוד');
check('"שכר לימוד" הוא הוצאה', r.intent === 'expense', JSON.stringify(r));

r = p('קיבלתי משכורת 12000');
check('משכורת אמיתית עדיין נקלטת', r.intent === 'salary' && r.amount === 12000, JSON.stringify(r));

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

console.log('\n== קטגוריות חופשיות ==');
r = p('אני רוצה להגביל 1000 שקל לסיגריות');
check('נושא חופשי בהגבלה', r.intent === 'limit' && r.category === 'סיגריות' && r.amount === 1000 && r.isNew, JSON.stringify(r));

r = p('הגבלה למסעדות 800');
check('קטגוריה מוכרת לא מסומנת כחדשה', r.category === 'מסעדות' && !r.isNew, JSON.stringify(r));

ans = Engine.handle('אני רוצה להגביל 1000 שקל לסיגריות');
check('הקטגוריה נוצרה',
  Store.get().customCategories.some(c => c.name === 'סיגריות'),
  JSON.stringify(Store.get().customCategories));
check('ההגבלה נשמרה על הנושא', Store.get().limits['סיגריות'] === 1000);
check('התשובה מסבירה שזו קטגוריה חדשה', /קטגוריה חדשה/.test(ans));
check('אייקון מתאים נבחר', Parser.categoryIcon('סיגריות') === '🚬', Parser.categoryIcon('סיגריות'));

check('קטגוריה חדשה נחשבת ניתנת לצמצום', Parser.isFlexible('סיגריות'));

r = p('קניתי סיגריות 45');
check('הוצאה נכנסת לקטגוריה החדשה', r.intent === 'expense' && r.category === 'סיגריות', JSON.stringify(r));

Engine.handle('קניתי סיגריות 45');
check('נצבר בקטגוריה החדשה', Store.categorySpent('סיגריות') === 45, Store.categorySpent('סיגריות'));

console.log('\n== הפקדה לחשבון ==');
r = p('הפקדתי במזומן לחשבון 1000 שקל');
check('הפקדה לעו"ש', r.intent === 'deposit' && r.to === 'checking' && r.amount === 1000 && r.cash, JSON.stringify(r));

r = p('הפקדתי 3750 לרכב');
check('הפקדה ליעד עדיין עובדת', r.intent === 'goalDeposit' && r.name === 'רכב', JSON.stringify(r));

r = p('להפריש 1000 לחיסכון');
check('הפרשה קבועה לא הפכה להפקדה', r.intent === 'allocation', JSON.stringify(r));

const chkPre = Store.get().balances.checking;
const incomePre = Store.monthIncome();
const spentPre = Store.monthExpense();
Engine.handle('הפקדתי במזומן לחשבון 1000 שקל');
check('ההפקדה הגדילה את העו"ש',
  Store.get().balances.checking === chkPre + 1000, Store.get().balances.checking);
check('ההפקדה אינה הכנסה חודשית', Store.monthIncome() === incomePre, Store.monthIncome());
check('ההפקדה אינה הוצאה', Store.monthExpense() === spentPre, Store.monthExpense());

console.log('\n== ניסוח התשובות ==');
const a1 = Engine.handle('קניתי קפה 28');
check('התשובה מצטטת את מה שנכתב', /קראתי:/.test(a1) && /קניתי קפה 28/.test(a1), a1.slice(0, 90));
const a2 = Engine.handle('קניתי סנדוויץ 30');
check('הפתיח מתחלף בין הודעות',
  a1.slice(0, 40) !== a2.slice(0, 40), a1.slice(0, 30) + ' | ' + a2.slice(0, 30));
const a3 = Engine.handle('שילמתי 5000 על שיפוץ');
check('תגובה לסכום גדול', /(הוצאה גדולה|סכום רציני|נתח משמעותי)/.test(a3), a3.slice(0, 140));

console.log('\n== אירועים ==');
r = p('אירוע חדש יום הולדת לשירה תקציב 2000');
check('פתיחת אירוע', r.intent === 'eventNew' && r.name === 'יום הולדת לשירה' && r.budget === 2000, JSON.stringify(r));

Engine.handle('אירוע חדש יום הולדת לשירה תקציב 2000');
const ev = Store.get().events[0];
check('האירוע נשמר', ev && ev.name === 'יום הולדת לשירה' && ev.budget === 2000, JSON.stringify(ev));

r = p('קניתי עוגה 180 ליום הולדת לשירה');
check('הוצאה משויכת לאירוע', r.intent === 'expense' && r.eventId === ev.id, JSON.stringify(r));

Engine.handle('קניתי עוגה 180 ליום הולדת לשירה');
Engine.handle('שילמתי 400 על מתנה ליום הולדת לשירה');
Engine.handle('קניתי בלונים 120 ליום הולדת לשירה');
check('סכום האירוע מצטבר', Store.eventTotal(ev.id) === 700, Store.eventTotal(ev.id));
check('פילוח לפי קטגוריה באירוע', Store.eventStatus(ev).categories.length >= 2, JSON.stringify(Store.eventStatus(ev).categories));

ans = Engine.handle('כמה הוצאתי על יום הולדת לשירה');
check('שאילתת אירוע מחזירה סיכום', /700/.test(ans) && /יום הולדת/.test(ans), ans.slice(0, 120));
check('הסיכום מציג מול תקציב', /2,000/.test(ans), ans.slice(0, 200));

Engine.handle('קניתי אוכל 1500 ליום הולדת לשירה');
check('חריגה מתקציב האירוע', Store.eventStatus(ev).over === true);

ans = Engine.handle('סגור אירוע יום הולדת לשירה');
check('סגירת אירוע', Store.get().events[0].closed === true, ans.slice(0, 80));

r = p('קניתי משהו 50 ליום הולדת לשירה');
check('אירוע סגור לא קולט הוצאות', !r.eventId, JSON.stringify(r));

console.log('\n== העברות בביט ==');
r = p('העברתי בביט 500 שקל');
check('העברה בביט', r.intent === 'expense' && r.amount === 500 && r.method === 'ביט' && r.needsCategory, JSON.stringify(r));

r = p('העברתי בביט 500 על מתנה');
check('ביט עם קטגוריה', r.method === 'ביט' && r.category === 'מתנות' && !r.needsCategory, JSON.stringify(r));

r = p('שילמתי בפייבוקס 200 על אוכל');
check('פייבוקס', r.method === 'פייבוקס' && r.category === 'מזון', JSON.stringify(r));

ans = Engine.handle('העברתי בביט 500 שקל');
check('שואל על מה ההעברה', /על מה הייתה ההעברה/.test(ans), ans.slice(0, 150));
check('נשמרה שאלה פתוחה', Store.get().pendingAsk && Store.get().pendingAsk.type === 'category');

const spentBeforeAns = Store.monthExpense();
ans = Engine.handle('מתנה לחבר');
check('התשובה משייכת קטגוריה', /שייכתי/.test(ans) && /מתנות/.test(ans), ans.slice(0, 120));
check('השאלה נסגרה', !Store.get().pendingAsk);
check('לא נוצרה הוצאה כפולה', Store.monthExpense() === spentBeforeAns, Store.monthExpense());
check('התנועה עודכנה', Store.get().transactions.find(t => t.amount === 500 && t.method === 'ביט').category === 'מתנות');

console.log('\n== ניהול קטגוריות ==');
r = p('תפתח קטגוריה סיגריות');
check('פתיחת קטגוריה', r.intent === 'categoryNew' && r.name === 'סיגריות', JSON.stringify(r));

Engine.handle('תפתח קטגוריה אלכוהול');
check('הקטגוריה נוצרה', Store.get().customCategories.some(c => c.name === 'אלכוהול'));
check('אייקון מתאים', Parser.categoryIcon('אלכוהול') === '🍷', Parser.categoryIcon('אלכוהול'));

r = p('תמחק קטגוריה אלכוהול');
check('מחיקת קטגוריה', r.intent === 'categoryDelete' && r.name === 'אלכוהול', JSON.stringify(r));

Engine.handle('הגבלה לאלכוהול 300');
ans = Engine.handle('תמחק קטגוריה אלכוהול');
check('הקטגוריה נמחקה', !Store.get().customCategories.some(c => c.name === 'אלכוהול'));
check('גם ההגבלה נמחקה', !Store.get().limits['אלכוהול']);

ans = Engine.handle('תמחק קטגוריה מזון');
check('קטגוריה מובנית מוגנת', /אי אפשר למחוק/.test(ans), ans.slice(0, 80));

console.log('\n== ירידת חיוב אשראי ==');
r = p('ירדה הורדה מהאשראי 3000 מחודש שעבר');
check('זיהוי חיוב אשראי', r.intent === 'cardSettlement' && r.amount === 3000 && r.prevMonth, JSON.stringify(r));

r = p('נגבה חיוב ויזה 1200');
check('חיוב עם שם כרטיס', r.intent === 'cardSettlement' && r.cardName === 'ויזה', JSON.stringify(r));

const cardId = Store.get().cards[0].id;
const chkPreSettle = Store.get().balances.checking;
const spentPreSettle = Store.monthExpense();
const outPre = Store.cardOutstanding(cardId);
Engine.handle('ירד חיוב ויזה 300');
check('החיוב ירד מהעו"ש',
  Store.get().balances.checking === chkPreSettle - 300, Store.get().balances.checking);
check('החיוב אינו הוצאה חדשה', Store.monthExpense() === spentPreSettle, Store.monthExpense());
check('היתרה הפתוחה קטנה',
  Store.cardOutstanding(cardId) === Math.max(0, outPre - 300),
  outPre + ' → ' + Store.cardOutstanding(cardId));

ans = Engine.handle('ירד חיוב ויזה 99999');
check('מזהיר כשהחיוב גדול מהרשום', /גדול מהסכום שרשמתי/.test(ans), ans.slice(0, 200));

console.log('\n== קרדיט מול דביט ==');
Store.reset();
Store.get().setup.done = true;
Engine.handle('המשכורת שלי 12000');
Engine.handle('יש לי בעובר ושב 10000');

r = p('כרטיס ויזה קרדיט מסגרת 10000 חיוב ב10');
check('זיהוי קרדיט', r.intent === 'card' && r.kind === 'credit', JSON.stringify(r));

r = p('כרטיס מקס דביט מסגרת 5000');
check('זיהוי דביט', r.intent === 'card' && r.kind === 'debit', JSON.stringify(r));

Engine.handle('כרטיס ויזה קרדיט מסגרת 10000 חיוב ב10');
Engine.handle('כרטיס מקס דביט מסגרת 5000');
const credit = Store.findCard('ויזה');
const debit = Store.findCard('מקס');
check('הסוגים נשמרו', credit.kind === 'credit' && debit.kind === 'debit',
  credit.kind + '/' + debit.kind);
check('יש שני סוגים', Store.hasBothCardKinds());

// קנייה בדביט — יורדת מיד
let chkPre2 = Store.get().balances.checking;
Engine.handle('שילמתי 400 במקס על אוכל');
check('דביט יורד מהעו"ש מיד',
  Store.get().balances.checking === chkPre2 - 400, Store.get().balances.checking);
check('דביט לא יוצר חוב פתוח', Store.cardOutstanding(debit.id) === 0, Store.cardOutstanding(debit.id));

// קנייה בקרדיט — לא יורדת עכשיו
chkPre2 = Store.get().balances.checking;
ans = Engine.handle('שילמתי 700 בויזה על בגדים');
check('קרדיט לא יורד מהעו"ש',
  Store.get().balances.checking === chkPre2, Store.get().balances.checking);
check('קרדיט יוצר חוב פתוח', Store.cardOutstanding(credit.id) === 700, Store.cardOutstanding(credit.id));
check('התשובה מסבירה שזה ייגבה בחודש הבא', /ייגבה בחיוב/.test(ans), ans.slice(0, 250));

ans = Engine.handle('שילמתי 300 במקס על דלק');
check('התשובה על דביט מסבירה שירד מיד', /ירד מהעו"ש מיד/.test(ans), ans.slice(0, 250));

// שניהם נספרים כהוצאה של החודש
check('שתי הקניות נספרות כהוצאה', Store.monthExpense() === 1400, Store.monthExpense());

// חיוב חודשי — רק על הקרדיט
check('חיוב פתוח כולל רק קרדיט', Store.pendingCardCharges() === 700, Store.pendingCardCharges());

ans = Engine.handle('ירד חיוב מקס 300');
check('אין סליקה לכרטיס דביט', /הוא כרטיס דביט/.test(ans), ans.slice(0, 120));

chkPre2 = Store.get().balances.checking;
Engine.handle('ירד חיוב ויזה 700');
check('סליקת הקרדיט ירדה מהעו"ש',
  Store.get().balances.checking === chkPre2 - 700, Store.get().balances.checking);
check('החוב הפתוח נסגר', Store.cardOutstanding(credit.id) === 0);

console.log('\n== בחירת כרטיס כשיש כמה ==');
r = p('שילמתי 250 באשראי על מסעדה');
check('תשלום בכרטיס בלי לציין איזה', r.intent === 'expense' && r.cardAmbiguous, JSON.stringify(r));

chkPre2 = Store.get().balances.checking;
ans = Engine.handle('שילמתי 250 באשראי על מסעדה');
check('שואל מאיזה כרטיס', /מאיזה כרטיס שילמת/.test(ans), ans.slice(0, 160));
check('מציג את שני הכרטיסים', /ויזה/.test(ans) && /מקס/.test(ans));
check('לא ירד מהעו"ש עד שנדע', Store.get().balances.checking === chkPre2, Store.get().balances.checking);

const spentPreAns = Store.monthExpense();
ans = Engine.handle('מקס');
check('השיוך בוצע', /שייכתי לכרטיס/.test(ans), ans.slice(0, 120));
check('דביט — ירד עכשיו מהעו"ש',
  Store.get().balances.checking === chkPre2 - 250, Store.get().balances.checking);
check('לא נוצרה הוצאה כפולה', Store.monthExpense() === spentPreAns, Store.monthExpense());
check('התנועה שויכה', Store.get().transactions.find(t => t.amount === 250).cardId === debit.id);

// כרטיס יחיד — לא שואל
Store.reset();
Store.get().setup.done = true;
Engine.handle('המשכורת שלי 12000');
Engine.handle('כרטיס ויזה קרדיט מסגרת 10000');
r = p('שילמתי 250 באשראי על מסעדה');
check('כרטיס יחיד — בלי שאלה', !r.cardAmbiguous, JSON.stringify(r));

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
check('אחרי האשף חוזרים לזרימה רגילה', /רשמתי|נרשם|נקלט|אצלי/.test(ans), ans.slice(0, 60));
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
