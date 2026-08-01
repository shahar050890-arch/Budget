/* engine.js — ביצוע הפעולה שנותחה והפקת התשובה למשתמש */
window.Engine = (function () {

  const M = U.money;

  function b(x) { return '<span class="num">' + x + '</span>'; }
  function ok(x) { return '<span class="num good">' + x + '</span>'; }
  function bad(x) { return '<span class="num bad">' + x + '</span>'; }
  function warn(x) { return '<span class="num warn">' + x + '</span>'; }

  /** מריץ הודעה של המשתמש ומחזיר HTML לתשובה */
  function handle(raw) {
    const p = Parser.parse(raw);
    const fn = HANDLERS[p.intent] || HANDLERS.unknown;
    return fn(p, raw);
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
      const tx = Store.addTx({
        type: 'expense',
        amount: p.amount,
        category: p.category,
        note: p.note,
        date: p.date,
        cardId: card ? card.id : null
      });

      const plan = Store.monthlyPlan();
      let html = '<span class="m-title">✅ נרשמה הוצאה</span>'
        + bad('-' + M(tx.amount)) + ' · ' + Parser.categoryIcon(tx.category) + ' ' + U.esc(tx.category)
        + (tx.note && tx.note !== tx.category ? ' · ' + U.esc(tx.note) : '')
        + (card ? ' <span class="tag">' + U.esc(card.name) + '</span>' : '')
        + (tx.date !== U.todayISO() ? ' <span class="tag">' + U.niceDate(tx.date) + '</span>' : '');

      html += '<hr>' + afterExpenseAdvice(plan);
      html += limitWarning(tx.category);
      if (card) html += cardWarning(card);
      return html;
    },

    /* ---------- הכנסה ---------- */
    income(p) {
      Store.snapshot('הכנסה');
      const tx = Store.addTx({ type: 'income', amount: p.amount, category: 'הכנסה', note: p.note, date: p.date });
      const plan = Store.monthlyPlan();
      return '<span class="m-title">💰 נרשמה הכנסה</span>'
        + ok('+' + M(tx.amount)) + ' · ' + U.esc(tx.note)
        + '<hr>סה"כ הכנסות החודש: ' + b(M(plan.income)) + '. פנוי כעת: ' + ok(M(plan.free)) + '.';
    },

    /* ---------- משכורת ---------- */
    salary(p) {
      Store.snapshot('משכורת');
      const s = Store.get();
      s.profile.salary = p.amount;
      if (p.salaryDay) s.profile.salaryDay = p.salaryDay;
      Store.save();

      const plan = Store.monthlyPlan();
      let html = '<span class="m-title">🧾 המשכורת נקלטה</span>'
        + 'משכורת חודשית: ' + ok(M(p.amount))
        + (p.salaryDay ? ' (נכנסת ב־' + p.salaryDay + ' לחודש)' : '');

      // הצעת חלוקה ראשונית אם עוד אין הפרשות
      if (!Object.keys(s.allocations).length) {
        const sav = Math.round(p.amount * 0.10 / 50) * 50;
        const stk = Math.round(p.amount * 0.05 / 50) * 50;
        html += '<hr>הצעה להתחלה (כלל 10/5): להפריש ' + b(M(sav)) + ' לחיסכון ו־' + b(M(stk)) + ' למניות בכל חודש.'
          + '<br><span class="muted">רוצה? כתוב לי: «להפריש ' + U.num(sav) + ' לחיסכון»</span>';
      } else {
        html += '<hr>פנוי החודש אחרי כל ההתחייבויות: ' + ok(M(plan.free)) + '.';
      }
      return html;
    },

    /* ---------- כרטיס אשראי ---------- */
    card(p) {
      Store.snapshot('כרטיס');
      const existed = !!Store.findCard(p.name);
      const c = Store.upsertCard(p.name, p.limit, p.billingDay);
      const s = Store.get();
      const totalLimit = Store.totalCardLimit();

      let html = '<span class="m-title">💳 ' + (existed ? 'הכרטיס עודכן' : 'כרטיס נוסף') + '</span>'
        + U.esc(c.name) + ' · מסגרת ' + b(M(c.limit))
        + (c.billingDay ? ' · חיוב ב־' + c.billingDay + ' לחודש' : '');

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
      const total = Store.totalDebt();
      const monthly = Store.debtMonthly();
      const income = Store.monthIncome();

      let html = '<span class="m-title">🏦 ' + (existed ? 'החוב עודכן' : 'חוב נרשם') + '</span>'
        + U.esc(d.name) + ' · יתרה ' + bad(M(d.amount))
        + (d.monthly ? ' · החזר חודשי ' + b(M(d.monthly)) : '');

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

    /* ---------- הגבלה חודשית ---------- */
    limit(p) {
      Store.snapshot('הגבלה');
      Store.setLimit(p.category, p.amount);
      const spent = Store.categorySpent(p.category);
      const icon = Parser.categoryIcon(p.category);

      let html = '<span class="m-title">🎚️ הוגדרה הגבלה חודשית</span>'
        + icon + ' ' + U.esc(p.category) + ': עד ' + b(M(p.amount)) + ' בחודש';
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
        + '<li><b>פנוי: ' + (plan.free >= 0 ? ok(M(plan.free)) : bad(M(plan.free))) + '</b>'
        + (plan.daysLeft ? ' · ' + M(plan.dailyPace) + ' ליום ל־' + plan.daysLeft + ' ימים' : '') + '</li>'
        + '</ul>';

      if (cats.length) {
        html += '<hr><b>לאן הלך הכסף:</b><ul>'
          + cats.map(([c, v]) => '<li>' + Parser.categoryIcon(c) + ' ' + U.esc(c) + ' — ' + M(v)
            + (s.limits[c] ? ' <span class="muted">(מתוך ' + M(s.limits[c]) + ')</span>' : '') + '</li>').join('')
          + '</ul>';
      }

      if (s.cards.length) {
        html += '<hr><b>אשראי:</b> נוצלו ' + b(M(Store.totalCardUsed())) + ' מתוך ' + M(Store.totalCardLimit()) + ' מסגרת.';
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
        + '<li>קניתי קפה 28</li>'
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
        + '<b>שאלות</b><ul>'
        + '<li>מה המצב? · כמה הוצאתי על מזון? · בטל</li></ul>';
    },

    unknown(p) {
      const s = Store.get();
      if (!s.profile.salary)
        return '<span class="m-title">🤔 לא בטוח שהבנתי</span>בוא נתחיל מהבסיס — כמה המשכורת שלך? כתוב למשל «המשכורת שלי 12000».'
          + '<br><span class="muted">לרשימת כל הפקודות: «עזרה»</span>';
      return '<span class="m-title">🤔 לא הבנתי את זה</span>נסה לכלול סכום, למשל «קניתי פיצה 60».'
        + '<br><span class="muted">לרשימת כל הפקודות: «עזרה»</span>';
    }
  };

  return { handle, HANDLERS };
})();
