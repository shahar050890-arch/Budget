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
      key: 'checking',
      icon: '🏛️',
      title: 'עובר ושב',
      ask: 'כמה כסף יש לך <b>כרגע</b> בעובר ושב?',
      format: 'יש לי בעובר ושב 8000',
      skippable: false,
      apply(text, num) {
        if (num == null) return null;
        Store.setBalance('checking', num);
        return 'עובר ושב: ' + M(num);
      }
    },
    {
      key: 'savings',
      icon: '🐖',
      title: 'חיסכון',
      ask: 'כמה כסף צבור לך בחיסכון?',
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
      ask: 'כמה שווה תיק המניות וההשקעות שלך?',
      format: 'יש לי במניות 15000',
      skippable: true,
      skipNote: 'אם אתה לא משקיע בשוק ההון, כתוב <b>0</b> או <b>דלג</b>.',
      apply(text, num) {
        if (num == null) return null;
        Store.setBalance('stocks', num);
        return 'מניות: ' + M(num);
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
      key: 'cards',
      icon: '💳',
      title: 'כרטיסי אשראי',
      ask: 'אילו כרטיסים יש לך, ומה המסגרת של כל אחד?<br>'
        + 'ציין גם <b>קרדיט</b> (חיוב מרוכז בחודש הבא) או <b>דביט</b> (יורד מיד).',
      format: 'כרטיס ויזה קרדיט מסגרת 10000',
      altFormat: 'או: כרטיס מקס דביט מסגרת 5000',
      skippable: true,
      skipNote: 'אפשר להוסיף עוד כרטיסים אחר כך, בכל שלב.',
      apply(text, num) {
        if (num == null) return null;
        const kind = Parser.detectCardKind(text);
        const name = Parser.detectCardName(text) || (kind === 'debit' ? 'דביט' : 'אשראי');
        const billing = (text.match(/(?:חיוב|נגבה|מחויב)\s*(?:ב|ה)?(\d{1,2})/) || [])[1];
        const c = Store.upsertCard(name, num, billing ? Number(billing) : null, kind);
        return 'כרטיס ' + U.esc(c.name) + ' (' + (c.kind === 'debit' ? 'דביט' : 'קרדיט')
          + ') עם מסגרת ' + M(c.limit);
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
    return /^(דלג|דילוג|אין|אין לי|לא|לא רוצה|בלי|skip|המשך|הלאה|אחר כך)$/i.test(String(text).trim());
  }

  /** ההודעה שמציגה שלב: מה שואלים + בדיוק מה לכתוב */
  function prompt(st) {
    const idx = STEPS.indexOf(st) + 1;
    return '<span class="m-title">' + st.icon + ' שלב ' + idx + ' מתוך ' + STEPS.length + ' — ' + st.title + '</span>'
      + st.ask
      + '<hr><span class="muted">כתוב בדיוק ככה:</span><br>'
      + '<b>' + st.format + '</b>'
      + (st.altFormat ? '<br><span class="muted">' + st.altFormat + '</span>' : '')
      + (st.skipNote ? '<br><span class="muted">' + st.skipNote + '</span>'
        : st.skippable ? '<br><span class="muted">אפשר לכתוב <b>דלג</b>.</span>' : '');
  }

  /** ההודעה הראשונה שהמשתמש רואי אי־פעם */
  function intro() {
    return '<span class="m-title">👋 היי, אני מנהל התקציב שלך</span>'
      + 'לפני שנתחיל, אני צריך להכיר את המצב שלך. אשאל אותך ' + STEPS.length + ' שאלות קצרות '
      + 'ואגיד בכל שלב בדיוק מה לכתוב — פשוט תעתיק ותחליף את המספר.'
      + '<hr><span class="muted">אפשר לדלג על כל שאלה שלא רלוונטית, ולשנות הכול אחר כך.</span>';
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

    const plan = Store.monthlyPlan();
    let html = '<span class="m-title">🎉 סיימנו — הכול מוכן</span>';

    html += '<b>מה שיש לך עכשיו</b><ul>'
      + (s.declared.checking ? '<li>🏛️ עובר ושב: ' + M(s.balances.checking) + '</li>' : '')
      + (s.declared.savings ? '<li>🐖 חיסכון: ' + M(s.balances.savings) + '</li>' : '')
      + (s.declared.stocks ? '<li>📈 מניות: ' + M(s.balances.stocks) + '</li>' : '')
      + '</ul>'
      + 'הון נקי: <b>' + M(Store.netWorth()) + '</b>';

    html += '<hr><b>התוכנית החודשית</b><ul>'
      + '<li>נכנס: ' + M(plan.income) + '</li>'
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

    s.setup.step++;
    Store.save();

    const next = step();
    const ack = result
      ? '<span class="m-title">✅ נקלט</span>' + result
      : '<span class="m-title">⏭️ דילגנו</span><span class="muted">אפשר להוסיף את זה אחר כך.</span>';

    return next ? ack + '<hr><hr>' + prompt(next) : ack + '<hr><hr>' + finish();
  }

  return { STEPS, start, handle, prompt, finish, step };
})();
