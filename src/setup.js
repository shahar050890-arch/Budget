/* setup.js — אשף ההקמה בשימוש ראשון.
   מוביל את המשתמש שלב־שלב ואומר בדיוק מה לכתוב בכל שלב. */
window.Setup = (function () {

  const M = U.money;

  /**
   * כל שלב מגדיר: מה שואלים, איזה פורמט לכתוב, ומה עושים עם התשובה.
   * `apply` מקבל את הטקסט ואת המספר שזוהה, ומחזיר תיאור קצר של מה שנקלט
   * (או null אם התשובה לא התאימה ויש לשאול שוב).
   */
  const STEPS = [
    {
      key: 'salary',
      icon: '💰',
      title: 'המשכורת',
      ask: 'כמה נכנס לך לחשבון בכל חודש, נטו?',
      format: 'המשכורת שלי 12000',
      skippable: false,
      apply(text, num) {
        if (num == null) return null;
        Store.get().profile.salary = num;
        const day = (text.match(/(?:ב|ל)?(\d{1,2})\s*(?:לחודש|בחודש)/) || [])[1];
        if (day && Number(day) <= 31 && Number(day) !== num) Store.get().profile.salaryDay = Number(day);
        Store.save();
        return 'משכורת חודשית: ' + M(num);
      }
    },
    {
      key: 'salaryDay',
      icon: '📅',
      title: 'מתי נכנסת המשכורת',
      ask: 'באיזה תאריך המשכורת נכנסת לחשבון בכל חודש?',
      format: 'המשכורת נכנסת ב-10 לחודש',
      skippable: true,
      skipNote: 'אם זה משתנה, כתוב <b>דלג</b>.',
      advise() {
        return 'ברוב המקומות המשכורת נכנסת בין ה-1 ל-10 לחודש.'
          + '<br>זה חשוב לי כדי לחשב כמה נשאר לך <b>ליום עד המשכורת הבאה</b> '
          + 'ולא סתם עד סוף החודש הקלנדרי — זה האופק האמיתי.';
      },
      apply(text, num) {
        if (num == null || num < 1 || num > 31) return null;
        Store.get().profile.salaryDay = num;
        Store.save();
        const days = Store.daysToSalary();
        return 'המשכורת נכנסת ב-' + num + ' לחודש'
          + (days != null ? ' — הבאה בעוד ' + days + ' ימים' : '');
      }
    },
    {
      key: 'checking',
      icon: '🏛️',
      title: 'עובר ושב',
      ask: 'כמה כסף יש לך <b>כרגע</b> בעובר ושב?',
      format: 'יש לי בעובר ושב 8000',
      skippable: true,
      skipNote: 'אם אין לך כרגע, כתוב <b>0</b> או <b>דלג</b>.',
      apply(text, num) {
        if (num == null) return null;
        Store.setBalance('checking', num);
        return 'עובר ושב: ' + M(num);
      }
    },
    {
      key: 'cash',
      icon: '💵',
      title: 'מזומן',
      ask: 'כמה כסף <b>מזומן</b> יש לך בארנק?',
      format: 'יש לי במזומן 500',
      skippable: true,
      skipNote: 'אם אתה לא מחזיק מזומן, כתוב <b>דלג</b>.',
      apply(text, num) {
        if (num == null) return null;
        Store.setBalance('cash', num);
        return 'מזומן: ' + M(num);
      }
    },
    {
      key: 'savings',
      icon: '🐖',
      title: 'חיסכון',
      ask: 'כמה כסף יש לך <b>כרגע</b> בחיסכון?',
      format: 'יש לי בחיסכון 20000',
      skippable: true,
      skipNote: 'אם אין לך חיסכון עדיין, כתוב <b>0</b> או <b>דלג</b>.',
      apply(text, num) {
        if (num == null) return null;
        Store.setBalance('savings', num);
        return 'חיסכון: ' + M(num);
      }
    },
    {
      key: 'stocks',
      icon: '📈',
      title: 'מניות',
      ask: 'כמה כסף יש לך <b>כרגע</b> במניות והשקעות?<br>'
        + 'אם התיק שלך בדולרים — פשוט כתוב «דולר» וזה יישמר ככה.',
      format: 'יש לי במניות 15000',
      altFormat: 'או בדולרים: יש לי במניות 4000 דולר',
      skippable: true,
      skipNote: 'אם אתה לא משקיע בשוק ההון, כתוב <b>0</b> או <b>דלג</b>.',
      apply(text, num) {
        if (num == null) return null;
        const cur = FX.detect(text);
        if (cur) FX.setAccountCurrency('stocks', cur);
        Store.setBalance('stocks', num);
        const c = FX.accountCurrency('stocks');
        return 'מניות: ' + FX.money(num, c)
          + (c === 'USD' ? ' (' + M(FX.toILS(num, 'USD')) + ' לפי השער הנוכחי)' : '');
      }
    },
    {
      key: 'allocSavings',
      icon: '🐖',
      title: 'הפרשה לחיסכון',
      ask: 'כמה אתה רוצה להפריש לחיסכון בכל חודש?<br>'
        + 'אפשר <b>סכום קבוע</b> או <b>אחוז מהמשכורת</b> — מה שנוח לך.',
      format: 'להפריש 1000 לחיסכון',
      altFormat: 'או באחוזים: 10% לחיסכון',
      skippable: true,
      advise() {
        const salary = Store.get().profile.salary || 0;
        const debtLoad = Store.debtMonthly();
        const cushion = Store.get().balances.checking + Store.get().balances.savings;
        const burn = Store.monthlyBurn();
        let pctRec = 10, why = 'זה הכלל המקובל — 10% מההכנסה לחיסכון.';

        if (debtLoad > salary * 0.3) {
          pctRec = 5;
          why = 'ההחזרים שלך גבוהים (' + U.pct(debtLoad, salary) + '% מההכנסה), '
            + 'אז עדיף להתחיל נמוך ולהפנות את העודף לסגירת החוב.';
        } else if (burn && cushion < burn * 3) {
          pctRec = 15;
          why = 'כרית הביטחון שלך מכסה פחות מ-3 חודשי הוצאות, '
            + 'אז שווה להאיץ עד שתגיע ל-' + M(burn * 3) + '.';
        }
        const amt = Math.round(salary * pctRec / 100 / 50) * 50;
        return '<b>ההמלצה שלי: ' + M(amt) + ' בחודש</b> (' + pctRec + '% מהמשכורת).'
          + '<br>' + why
          + '<br><span class="muted">לאשר? כתוב <b>להפריש ' + U.num(amt) + ' לחיסכון</b>. '
          + 'או כל סכום אחר שנוח לך.</span>';
      },
      apply(text, num) {
        const pct = (text.match(/(\d+(?:\.\d+)?)\s*(?:%|אחוז)/) || [])[1];
        if (pct != null) {
          Store.setAllocation('savings', parseFloat(pct), true);
          return parseFloat(pct) + '% מהמשכורת לחיסכון = ' + M(Store.allocAmount('savings')) + ' בחודש';
        }
        if (num == null) return null;
        Store.setAllocation('savings', num, false);
        return M(num) + ' לחיסכון בכל חודש';
      }
    },
    {
      key: 'allocStocks',
      icon: '📈',
      title: 'הפרשה למניות',
      ask: 'וכמה למניות והשקעות בכל חודש?',
      format: 'להפריש 500 למניות',
      altFormat: 'או באחוזים: 5% למניות',
      skippable: true,
      advise() {
        const salary = Store.get().profile.salary || 0;
        const sav = Store.allocAmount('savings');
        const free = salary - sav - Store.debtMonthly();
        const amt = Math.max(0, Math.round(Math.min(salary * 0.05, free * 0.4) / 50) * 50);
        if (amt <= 0)
          return '<b>ההמלצה שלי: לדלג בינתיים.</b>'
            + '<br>אחרי ההוצאות והחיסכון לא נשאר מספיק כדי להשקיע בלי לחץ. '
            + 'עדיף לבסס קודם כרית ביטחון.'
            + '<br><span class="muted">כתוב <b>דלג</b>, ותמיד אפשר להוסיף אחר כך.</span>';
        return '<b>ההמלצה שלי: ' + M(amt) + ' בחודש</b> (' + U.pct(amt, salary) + '% מהמשכורת).'
          + '<br>השקעה היא כסף שאתה לא נוגע בו שנים, אז הסכום צריך להיות כזה '
          + 'שלא יחסר לך אם השוק יירד.'
          + '<br><span class="muted">לאשר? כתוב <b>להפריש ' + U.num(amt) + ' למניות</b>.</span>';
      },
      apply(text, num) {
        const pct = (text.match(/(\d+(?:\.\d+)?)\s*(?:%|אחוז)/) || [])[1];
        if (pct != null) {
          Store.setAllocation('stocks', parseFloat(pct), true);
          return parseFloat(pct) + '% מהמשכורת למניות = ' + M(Store.allocAmount('stocks')) + ' בחודש';
        }
        if (num == null) return null;
        Store.setAllocation('stocks', num, false);
        return M(num) + ' למניות בכל חודש';
      }
    },
    {
      key: 'standing',
      icon: '🔁',
      title: 'הוראות קבע',
      ask: 'יש לך תשלומים שיורדים אוטומטית בכל חודש?<br>'
        + 'שכר דירה, ארנונה, ביטוח, חדר כושר, מנויים.',
      format: 'הוראת קבע שכר דירה 4200 ב-1 לחודש',
      altFormat: 'אפשר להוסיף עוד אחת אחרי כל תשובה — כתוב «דלג» כשסיימת.',
      skippable: true,
      skipNote: 'אם אין לך — כתוב <b>אין</b>.',
      repeatable: true,
      advise() {
        return '<b>מה נחשב הוראת קבע?</b> כל דבר שיורד לך בלי שתעשה כלום:'
          + '<ul><li>שכר דירה או משכנתא</li><li>ארנונה, חשמל, מים, גז</li>'
          + '<li>סלולר ואינטרנט</li><li>ביטוחים</li>'
          + '<li>חדר כושר, נטפליקס, ספוטיפיי</li></ul>'
          + '<span class="muted">אלה בדרך כלל החלק הגדול של החודש, ולכן שווה להזין אותם.</span>';
      },
      apply(text, num) {
        if (num == null) return null;
        const p = Parser.parse(text.replace(/^/, 'הוראת קבע '));
        if (p.intent !== 'standingOrder' || !p.name) return null;
        const so = Store.addStandingOrder(p.name, p.amount, p.day, p.category);
        return U.esc(so.name) + ' — ' + M(so.amount) + ' בכל ' + so.day + ' לחודש'
          + ' <span class="muted">(סה"כ ' + M(Store.standingTotal()) + ' בחודש)</span>';
      }
    },
    {
      key: 'cards',
      icon: '💳',
      title: 'כרטיסי אשראי',
      ask: 'אילו כרטיסים יש לך?<br>'
        + 'ציין <b>קרדיט</b> או <b>דביט</b>, את המסגרת, ו<b>באיזה תאריך יורד החיוב</b>.',
      format: 'כרטיס ויזה קרדיט מסגרת 10000 חיוב ב-10',
      altFormat: 'או: כרטיס מקס דביט מסגרת 5000 · אפשר להוסיף עוד אחרי כל תשובה',
      repeatable: true,
      skippable: true,
      skipNote: 'אפשר להוסיף עוד כרטיסים אחר כך, בכל שלב.',
      apply(text, num) {
        if (num == null) return null;
        const kind = Parser.detectCardKind(text);
        const name = Parser.detectCardName(text) || (kind === 'debit' ? 'דביט' : 'אשראי');
        const billing = (text.match(/(?:חיוב|נגבה|מחויב)\s*(?:ב|ה)?(\d{1,2})/) || [])[1];
        const c = Store.upsertCard(name, num, billing ? Number(billing) : null, kind);
        return 'כרטיס ' + U.esc(c.name) + ' (' + (c.kind === 'debit' ? 'דביט' : 'קרדיט')
          + ') עם מסגרת ' + M(c.limit)
          + (c.kind !== 'debit' ? ', חיוב ב-' + c.billingDay + ' לחודש' : '');
      }
    },
    {
      key: 'debts',
      icon: '🏦',
      title: 'חובות',
      ask: 'יש לך חובות או הלוואות?',
      format: 'הלוואה 20000 בריבית 8% החזר 800 בחודש',
      skippable: true,
      skipNote: 'אם אין לך חובות — כתוב <b>אין</b>. מצוין 🎉',
      apply(text, num) {
        if (num == null) return null;
        const p = Parser.parse(text);
        if (p.intent !== 'debt') return null;
        const d = Store.upsertDebt(p.name, p.amount, p.monthly);
        if (p.interest != null) { d.interest = p.interest; Store.save(); }
        return U.esc(d.name) + ': ' + M(d.amount)
          + (d.monthly ? ', החזר ' + M(d.monthly) + ' בחודש' : '');
      }
    },
    {
      key: 'goal',
      icon: '🎯',
      title: 'יעד חיסכון',
      ask: 'יש משהו שאתה רוצה לחסוך אליו?',
      format: 'לחסוך לרכב 15000 ב-4 חודשים',
      skippable: true,
      skipNote: 'אפשר להוסיף יעדים בכל רגע. כתוב <b>דלג</b> כדי לסיים.',
      apply(text, num) {
        const p = Parser.parse(text);
        if (p.intent !== 'goal') return null;
        const g = Store.addGoal(p.name, p.target, p.months);
        const st = Store.goalStatus(g);
        return U.esc(g.name) + ': ' + M(g.target) + ' ב-' + g.months + ' חודשים — ' + M(st.need) + ' בחודש';
      }
    }
  ];

  function step() { return STEPS[Store.get().setup.step] || null; }

  function isSkip(text) {
    return /^(דלג|דילוג|אין|אין לי|לא|לא רוצה|בלי|skip|המשך|הלאה|אחר כך|סיימתי|זהו)$/i.test(String(text).trim());
  }

  function isBack(text) {
    return /^(אחורה|חזור|חזרה|קודם|השאלה הקודמת|הקודם|תחזור|back|טעיתי)$/i.test(String(text).trim());
  }

  function isAskAdvice(text) {
    return /(מה אתה ממליץ|מה ממליץ|תמליץ|המלצה|מה כדאי|לא יודע|לא בטוח|תחליט אתה|מה נכון|עזור לי|תעזור)/i
      .test(String(text).trim());
  }

  /** מה שכבר נאסף — מוצג בכל שלב כדי שיהיה ברור איפה אנחנו */
  function soFar() {
    const s = Store.get();
    const parts = [];
    if (s.profile.salary) parts.push('💰 ' + M(s.profile.salary));
    if (s.profile.salaryDay) parts.push('📅 ' + s.profile.salaryDay);
    if (s.declared.checking) parts.push('🏛️ ' + M(s.balances.checking));
    if (s.declared.cash) parts.push('💵 ' + M(s.balances.cash));
    if (s.declared.savings) parts.push('🐖 ' + M(s.balances.savings));
    if (s.declared.stocks) parts.push('📈 ' + M(s.balances.stocks));
    if (Store.allocAmount('savings')) parts.push('→🐖 ' + M(Store.allocAmount('savings')));
    if (Store.allocAmount('stocks')) parts.push('→📈 ' + M(Store.allocAmount('stocks')));
    if (s.standing.length) parts.push('🔁 ' + M(Store.standingTotal()));
    if (s.cards.length) parts.push('💳 ' + s.cards.length);
    if (s.debts.length) parts.push('🏦 ' + M(Store.totalDebt()));
    return parts.length ? '<hr><span class="muted">עד כה: ' + parts.join(' · ') + '</span>' : '';
  }

  /** ההודעה שמציגה שלב: מה שואלים + בדיוק מה לכתוב */
  function prompt(st) {
    const idx = STEPS.indexOf(st) + 1;
    const opts = [];
    if (idx > 1) opts.push('<b>אחורה</b> לשאלה הקודמת');
    if (st.advise) opts.push('<b>מה אתה ממליץ?</b> ואגיד לך מה הייתי עושה');
    if (st.skippable) opts.push('<b>דלג</b>');

    return '<span class="m-title">' + st.icon + ' שלב ' + idx + ' מתוך ' + STEPS.length + ' — ' + st.title + '</span>'
      + st.ask
      + '<hr><span class="muted">כתוב בדיוק ככה:</span><br>'
      + '<b>' + st.format + '</b>'
      + (st.altFormat ? '<br><span class="muted">' + st.altFormat + '</span>' : '')
      + (st.skipNote ? '<br><span class="muted">' + st.skipNote + '</span>' : '')
      + (opts.length ? '<hr><span class="muted">אפשר גם: ' + opts.join(' · ') + '</span>' : '')
      + soFar();
  }

  /** ההודעה הראשונה שהמשתמש רואי אי־פעם */
  function intro() {
    return '<span class="m-title">👋 היי, אני מנהל התקציב שלך</span>'
      + 'לפני שנתחיל, אני צריך להכיר את המצב שלך. אשאל אותך ' + STEPS.length + ' שאלות קצרות '
      + 'ואגיד בכל שלב בדיוק מה לכתוב — פשוט תעתיק ותחליף את המספר.'
      + '<hr><span class="muted">בכל שלב אפשר: <b>דלג</b> לדלג · <b>אחורה</b> לחזור לשאלה הקודמת · '
      + '<b>מה אתה ממליץ?</b> כדי שאגיד לך מה הייתי עושה.</span>';
  }

  function start() {
    return intro() + '<hr><hr>' + prompt(STEPS[0]);
  }

  /** סיכום מלא בסוף האשף */
  function finish() {
    const s = Store.get();
    s.setup.done = true;
    Store.markMonthSeen();
    Store.save();

    // הוראות קבע שהתאריך שלהן כבר עבר החודש נרשמות מיד,
    // כדי שהתמונה בסוף האשף תהיה נכונה ולא תתעדכן רק בפתיחה הבאה
    const postedNow = Store.postDueStandingOrders();

    const plan = Store.monthlyPlan();
    let html = '<span class="m-title">🎉 סיימנו — הכול מוכן</span>';

    if (postedNow.length) {
      html += '<span class="muted">רשמתי כבר ' + postedNow.length + ' הוראות קבע שמועדן עבר החודש ('
        + M(postedNow.reduce((a, x) => a + x.order.amount, 0)) + ').</span><hr>';
    }

    html += '<b>מה שיש לך עכשיו</b><ul>'
      + Store.ACCOUNT_KINDS.filter(k => s.declared[k]).map(k => {
        const NAMES = { checking: ['🏛️','עובר ושב'], cash: ['💵','מזומן'], savings: ['🐖','חיסכון'], stocks: ['📈','מניות'] };
        const cur = FX.accountCurrency(k);
        return '<li>' + NAMES[k][0] + ' ' + NAMES[k][1] + ': ' + FX.money(s.balances[k], cur)
          + (cur === 'USD' ? ' (' + M(FX.toILS(s.balances[k], 'USD')) + ')' : '') + '</li>';
      }).join('')
      + '</ul>'
      + 'הון נקי: <b>' + M(Store.netWorth()) + '</b>';

    html += '<hr><b>התוכנית החודשית</b><ul>'
      + '<li>נכנס: ' + M(plan.income) + '</li>'
      + (plan.standing ? '<li>הוראות קבע: ' + M(Store.standingTotal()) + '</li>' : '')
      + (plan.debts ? '<li>החזרי חובות: ' + M(plan.debts) + '</li>' : '')
      + (plan.savings ? '<li>לחיסכון: ' + M(plan.savings) + '</li>' : '')
      + (plan.stocks ? '<li>למניות: ' + M(plan.stocks) + '</li>' : '')
      + (plan.goals ? '<li>ליעדים: ' + M(plan.goals) + '</li>' : '')
      + '<li><b>נשאר לחיות ממנו: ' + M(plan.free) + '</b>'
      + (plan.daysLeft ? ' — ' + M(plan.dailyPace) + ' ליום' : '') + '</li>'
      + '</ul>';

    html += '<hr><b>מהיום, פשוט תכתוב לי כל הוצאה</b><ul>'
      + '<li>קניתי קפה 28</li>'
      + '<li>שילמתי 350 בסופר בויזה</li>'
      + '<li>הוצאתי 500 מהחיסכון על מתנה</li></ul>'
      + '<span class="muted">ואם תרצה להתייעץ: «אני יכול לקנות טלוויזיה ב-3000?» או «מה אתה ממליץ?»</span>';

    return html;
  }

  /** עיבוד תשובה לשלב הנוכחי */
  function handle(raw) {
    const s = Store.get();
    const st = step();
    if (!st) return finish();

    const text = Parser.normalize(raw);

    // בקשה לצאת מהאשף
    if (/^(בטל הכל|עצור|תפסיק|סיימתי|מספיק|לא עכשיו)$/i.test(text.trim())) {
      s.setup.done = true;
      Store.markMonthSeen();
      Store.save();
      return '<span class="m-title">בסדר, יצאנו מההקמה</span>'
        + 'אפשר להשלים פרטים מתי שתרצה — פשוט תכתוב לי.'
        + '<br><span class="muted">לרשימת הפקודות: «עזרה»</span>';
    }

    // חזרה אחורה
    if (isBack(text)) {
      if (s.setup.step === 0)
        return '<span class="m-title">אנחנו בשאלה הראשונה</span>אין לאן לחזור.<hr>' + prompt(st);
      s.setup.step--;
      Store.save();
      const prev = step();
      return '<span class="m-title">↩️ חזרנו אחורה</span>'
        + '<span class="muted">מה שכתבת קודם יוחלף בתשובה החדשה.</span><hr><hr>' + prompt(prev);
    }

    // בקשת המלצה — לא מקדמת שלב
    if (isAskAdvice(text)) {
      const tip = st.advise ? st.advise()
        : 'בשאלה הזו אין לי המלצה — היא תלויה רק בנתונים שלך.'
          + '<br><span class="muted">אם לא רלוונטי, פשוט כתוב <b>דלג</b>.</span>';
      return '<span class="m-title">💡 ההמלצה שלי</span>' + tip + '<hr><hr>' + prompt(st);
    }

    let result = null;
    if (isSkip(text)) {
      if (!st.skippable) {
        return '<span class="m-title">🙏 את השאלה הזו אני חייב</span>'
          + 'בלי זה לא אוכל לחשב לך כלום.<hr>' + prompt(st);
      }
      result = null;
    } else {
      const nums = Parser.findNumbers(text);
      const num = nums.length ? Math.max(...nums.map(n => n.value)) : null;
      Store.snapshot('הקמה: ' + st.title);
      result = st.apply(text, num);

      if (result === null && !isSkip(text)) {
        return '<span class="m-title">🤔 לא הצלחתי לקרוא את זה</span>'
          + 'צריך שיהיה מספר בהודעה.<hr>' + prompt(st);
      }
    }

    // שלב חוזר (כמו הוראות קבע) — נשארים בו עד שכותבים "דלג"
    if (st.repeatable && result) {
      Store.save();
      return '<span class="m-title">✅ נקלט</span>' + result
        + '<hr><b>יש עוד אחת?</b> כתוב אותה באותו פורמט, או <b>דלג</b> כדי להמשיך.'
        + soFar();
    }

    s.setup.step++;
    Store.save();

    const next = step();
    const ack = result
      ? '<span class="m-title">✅ נקלט</span>' + result
      : '<span class="m-title">⏭️ דילגנו</span><span class="muted">אפשר להוסיף את זה אחר כך.</span>';

    return next ? ack + '<hr><hr>' + prompt(next) : ack + '<hr><hr>' + finish();
  }

  return { STEPS, start, handle, prompt, finish, step, isBack, isAskAdvice, soFar };
})();
