/* parser.js — הבנת שפה חופשית בעברית והפיכתה לפעולה */
window.Parser = (function () {

  /* ---------------- קטגוריות ---------------- */

  const CATEGORIES = [
    { name: 'מזון',      icon: '🛒', words: ['סופר','סופרמרקט','מכולת','שופרסל','רמי לוי','ויקטורי','יינות ביתן','אושר עד','טיב טעם','קניות','אוכל','מזון','ירקות','פירות','בשר','לחם','חלב'] },
    { flex: true, name: 'מסעדות',    icon: '🍔', words: ['מסעדה','מסעדות','קפה','קפהשק','בית קפה','ארוחה','פיצה','המבורגר','בורגר','שווארמה','פלאפל','סושי','משלוח','וולט','תן ביס','wolt','מאפה','קרואסון','גלידה','בר','פאב','בירה'] },
    { name: 'תחבורה',    icon: '🚗', words: ['דלק','תדלוק','סולר','בנזין','אוטובוס','רכבת','מונית','גט','אובר','חניה','חנייה','כביש 6','נסיעה','רב קו','רב־קו','טסט','ביטוח רכב','מוסך','צמיגים','טיפול לרכב','אופנוע','קורקינט'] },
    { name: 'דיור',      icon: '🏠', words: ['שכר דירה','שכירות','משכנתא','ארנונה','ועד בית','חשמל','מים','גז','תיקון','אינסטלטור','חשמלאי','ריהוט','איקאה','כלי בית'] },
    { name: 'תקשורת',    icon: '📱', words: ['סלולר','סלולרי','פלאפון','טלפון','אינטרנט','סלקום','פרטנר','הוט','yes','יס','בזק','גולן','רמי לוי תקשורת','חבילת גלישה'] },
    { flex: true, name: 'בילויים',   icon: '🎬', words: ['סרט','קולנוע','הצגה','תיאטרון','הופעה','כרטיסים','נטפליקס','netflix','ספוטיפיי','spotify','דיסני','משחק','פלייסטיישן','גיימינג','מנוי','בילוי','טיול','חופשה','מלון','צימר','טיסה'] },
    { name: 'בריאות',    icon: '💊', words: ['רופא','רופאה','מרפאה','קופת חולים','כללית','מכבי','מאוחדת','לאומית','תרופות','בית מרקחת','סופר פארם','בדיקה','שיניים','שיננית','משקפיים','אופטיקה','ביטוח בריאות','פסיכולוג','פיזיותרפיה'] },
    { flex: true, name: 'ביגוד',     icon: '👕', words: ['בגדים','ביגוד','חולצה','מכנסיים','נעליים','סניקרס','זארה','קסטרו','fox','אופנה','תיק','מעיל','גרביים'] },
    { name: 'ילדים',     icon: '🧸', words: ['גן','גנון','צהרון','מעון','בייביסיטר','חוג','חוגים','בית ספר','ילד','ילדים','תינוק','חיתולים','טיטולים','צעצוע','צעצועים'] },
    { name: 'חינוך',     icon: '📚', words: ['לימודים','שכר לימוד','אוניברסיטה','מכללה','קורס','ספרים','ספר','השתלמות','שיעור פרטי'] },
    { flex: true, name: 'טיפוח',     icon: '💇', words: ['תספורת','מספרה','ספר','קוסמטיקה','איפור','ציפורניים','מניקור','פדיקור','ספא','עיסוי','חדר כושר','כושר','מכון כושר','חיטוב'] },
    { name: 'ביטוח',     icon: '🛡️', words: ['ביטוח','פוליסה','ביטוח לאומי','ביטוח דירה','ביטוח חיים'] },
    { flex: true, name: 'מתנות',     icon: '🎁', words: ['מתנה','מתנות','תרומה','צדקה','חתונה','בר מצווה','יום הולדת'] },
    { name: 'חיות',      icon: '🐶', words: ['כלב','חתול','וטרינר','אוכל לכלב','חיית מחמד','פטשופ'] },
    { name: 'עמלות',     icon: '🏦', words: ['עמלה','עמלות','ריבית','בנק','משיכה','דמי ניהול'] },
    { name: 'חובות',     icon: '📉', words: [] },
    { name: 'חיסכון',    icon: '🐖', words: [] },
    { name: 'כללי',      icon: '💳', words: [] }
  ];

  /** הקטגוריות שהמשתמש הוסיף בעצמו, אם יש */
  function customCats() {
    try { return (window.Store && Store.get().customCategories) || []; }
    catch (e) { return []; }
  }

  /** אייקון סביר לקטגוריה חדשה, לפי מילת המפתח */
  const ICON_GUESS = {
    'סיגריות':'🚬','עישון':'🚬','טבק':'🚬','אלכוהול':'🍷','יין':'🍷','בירה':'🍺',
    'קפה':'☕','ממתקים':'🍫','חטיפים':'🍿','משחקים':'🎮','ספורט':'⚽','אופניים':'🚲',
    'צמחים':'🪴','גינון':'🪴','ספרים':'📚','מוזיקה':'🎵','צילום':'📷','נסיעות':'✈️',
    'לוטו':'🎰','הימורים':'🎰','תרופות':'💊','קעקועים':'🖋️','תחביב':'🎨'
  };

  function guessIcon(name) {
    if (ICON_GUESS[name]) return ICON_GUESS[name];
    for (const k of Object.keys(ICON_GUESS)) if (name.includes(k)) return ICON_GUESS[k];
    return '🏷️';
  }

  /** קטגוריה שאפשר לצמצם בה בלי לפגוע בחיים החיוניים */
  function isFlexible(name) {
    const c = CATEGORIES.find(x => x.name === name);
    if (c) return !!c.flex;
    const cc = customCats().find(x => x.name === name);
    return !!(cc && cc.flex);
  }

  function categoryIcon(name) {
    const c = CATEGORIES.find(x => x.name === name);
    if (c) return c.icon;
    const cc = customCats().find(x => x.name === name);
    return cc ? cc.icon : '🏷️';
  }

  function detectCategory(text) {
    const t = ' ' + text + ' ';
    let best = null, bestLen = 0;
    // קטגוריות שהמשתמש הגדיר מקבלות עדיפות — הוא בחר אותן במפורש
    for (const c of customCats()) {
      if (t.includes(c.name) && c.name.length > bestLen) { best = c.name; bestLen = c.name.length; }
    }
    if (best) return best;
    for (const c of CATEGORIES) {
      for (const w of c.words) {
        if (t.includes(w) && w.length > bestLen) { best = c.name; bestLen = w.length; }
      }
    }
    return best || 'כללי';
  }

  /** מזהה קטגוריה שהוזכרה במפורש (לצורך הגבלות ושאילתות) */
  function explicitCategory(text) {
    for (const c of customCats()) if (text.includes(c.name)) return c.name;
    for (const c of CATEGORIES) if (text.includes(c.name)) return c.name;
    return detectCategory(text);
  }

  const SUBJECT_STOP = ['חודש','חודשי','חודשית','שקל','שקלים','ש"ח','שח','עצמי','לי','זה','הכל','חודשיים'];

  /**
   * הנושא של ההגבלה — גם כשהוא לא קטגוריה מוכרת.
   * "להגביל 1000 שקל לסיגריות" → "סיגריות"
   */
  function extractLimitSubject(text) {
    const known = CATEGORIES.find(c => text.includes(c.name));
    if (known) return known.name;
    const custom = customCats().find(c => text.includes(c.name));
    if (custom) return custom.name;

    // המילה שאחרי "ל"/"על"/"עבור" — לוקחים את האחרונה, היא בדרך כלל הנושא
    const matches = [...text.matchAll(/(?:\s|^)(?:ל|על|עבור)\s*([֐-׿]{3,})/g)]
      .map(m => m[1])
      .filter(w => !SUBJECT_STOP.includes(w) && !SUBJECT_STOP.includes(w.replace(/^ה/, '')));
    if (!matches.length) return null;
    return matches[matches.length - 1].replace(/^ה/, '');
  }

  /* ---------------- חשבונות ---------------- */

  const ACCOUNTS = {
    checking: { icon: '🏛️', label: 'עובר ושב', words: ['עובר ושב','עו"ש','עוש','חשבון הבנק','חשבון בנק','הבנק','החשבון','העו"ש','מזומן'] },
    savings:  { icon: '🐖', label: 'חיסכון',    words: ['חיסכון','חסכון','קרן החיסכון','קרן חיסכון','הפיקדון','פיקדון','החסכונות'] },
    stocks:   { icon: '📈', label: 'תיק המניות', words: ['מניות','תיק המניות','תיק מניות','ההשקעות','השקעות','הבורסה','בורסה','התיק'] }
  };

  /**
   * מאיזה חשבון יצא הכסף. מחפש רק צורות שמסמנות מקור ("מהחיסכון"),
   * כדי ש"קניתי מניות" לא ייחשב כמשיכה מתיק המניות.
   */
  function detectAccount(text, prefixes = ['מה', 'מ', 'דרך ה', 'מתוך ה', 'מתוך ']) {
    for (const key of Object.keys(ACCOUNTS)) {
      for (const w of ACCOUNTS[key].words) {
        for (const pre of prefixes) {
          const re = new RegExp('(?:^|\\s)' + escapeRe(pre + w.replace(/^ה/, '')) + '(?:\\s|$|[,.?!])');
          if (re.test(text)) return key;
        }
      }
    }
    return null;
  }

  /** יעד ההעברה: "לחיסכון", "לעו״ש", "למניות" */
  function detectTarget(text) {
    for (const key of Object.keys(ACCOUNTS)) {
      for (const w of ACCOUNTS[key].words) {
        const re = new RegExp('(?:^|\\s)ל' + escapeRe(w.replace(/^ה/, '')) + '(?:\\s|$|[,.?!])');
        if (re.test(text)) return key;
      }
    }
    return null;
  }

  /* ---------------- כרטיסי אשראי ---------------- */

  const CARD_BRANDS = ['ויזה','visa','מאסטרקארד','מאסטר','mastercard','ישראכרט','אמריקן אקספרס','אמקס','amex','כאל','cal','לאומי קארד','מקס','max','דיינרס','diners','פרימיום','זהב','דיגיטלי'];

  function detectCardName(text) {
    for (const b of CARD_BRANDS) {
      const re = new RegExp('(?:^|\\s|ב|ה)' + b + '(?:\\s|$|,|\\.)', 'i');
      if (re.test(text)) return b;
    }
    // "כרטיס X" — המילה שאחרי "כרטיס"
    const m = text.match(/כרטיס(?:\s+אשראי)?\s+(?:ה)?([֐-׿a-zA-Z"'׳״]{2,})/);
    if (m && !/מסגרת|אשראי/.test(m[1])) return m[1];
    return null;
  }

  /* ---------------- מספרים ---------------- */

  const WORD_NUM = {
    'אפס':0,'אחד':1,'אחת':1,'שניים':2,'שתיים':2,'שני':2,'שתי':2,'שלושה':3,'שלוש':3,
    'ארבעה':4,'ארבע':4,'חמישה':5,'חמש':5,'שישה':6,'שש':6,'שבעה':7,'שבע':7,
    'שמונה':8,'תשעה':9,'תשע':9,'עשרה':10,'עשר':10,'אחד עשר':11,'שנים עשר':12,'שניים עשר':12
  };

  function normalize(text) {
    return String(text)
      .replace(/[־–—]/g, '-')
      .replace(/[“”‘’]/g, '"')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /** כל המספרים בטקסט, לפי סדר הופעה: [{value, start, end}] */
  function findNumbers(text) {
    const out = [];
    const re = /(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(k|K|אלף|אלפים)?/g;
    let m;
    while ((m = re.exec(text))) {
      let v = parseFloat(m[1].replace(/,/g, ''));
      if (m[2]) v *= 1000;
      out.push({ value: v, start: m.index, end: m.index + m[0].length, raw: m[0] });
    }
    // מילות מספר עצמאיות
    if (/(^|\s)אלפיים(\s|$)/.test(text)) out.push({ value: 2000, start: text.indexOf('אלפיים'), end: text.indexOf('אלפיים') + 6, raw: 'אלפיים' });
    if (!out.length && /(^|\s)אלף(\s|$)/.test(text)) out.push({ value: 1000, start: text.indexOf('אלף'), end: text.indexOf('אלף') + 3, raw: 'אלף' });
    return out.sort((a, b) => a.start - b.start);
  }

  /** מספר החודשים שהוזכר: "4 חודשים", "בארבעה חודשים", "חצי שנה", "שנה" */
  function findMonths(text) {
    let m = text.match(/(\d+)\s*(?:חודשים|חודש|חו')/);
    if (m) return parseInt(m[1], 10);

    m = text.match(/(?:ב|תוך|במשך|עוד)?\s*([֐-׿]+)\s*(?:חודשים|חודש)/);
    if (m) {
      const w = m[1].replace(/^ב/, '');
      if (WORD_NUM[w] != null) return WORD_NUM[w];
    }
    if (/חצי\s*שנה/.test(text)) return 6;
    if (/שנתיים/.test(text)) return 24;
    if (/(\d+)\s*שנים/.test(text)) return parseInt(text.match(/(\d+)\s*שנים/)[1], 10) * 12;
    if (/(^|\s)שנה(\s|$)/.test(text)) return 12;
    return null;
  }

  function findPercent(text) {
    const m = text.match(/(\d+(?:\.\d+)?)\s*(?:%|אחוז(?:ים)?)/);
    return m ? parseFloat(m[1]) : null;
  }

  /* ---------------- ניקוי תיאור ---------------- */

  const STOP = ['קניתי','שילמתי','הוצאתי','שילמתי על','ב','בסך','של','על','את','ה','עוד','היום','אתמול','שקל','שקלים','ש"ח','שח','₪','נתתי','עלה','עלות','בערך','סהכ','סה"כ','לי','אני','לקחתי','הזמנתי','חייבתי','בכרטיס','כרטיס','אשראי','במזומן','מזומן','באשראי','העברה','ביט','bit','paybox','פייבוקס','רשמתי','תרשום','תוסיף','הוסף'];

  function cleanNote(text, extra = []) {
    let t = ' ' + text + ' ';
    // הסרת סכומים ומטבע
    t = t.replace(/\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?/g, ' ');
    t = t.replace(/[₪%]/g, ' ');
    const kill = STOP.concat(extra, CARD_BRANDS);
    kill.sort((a, b) => b.length - a.length).forEach(w => {
      if (!w) return;
      t = t.replace(new RegExp('(?:^|\\s)[בהלמו]?' + escapeRe(w) + '(?=\\s|$)', 'gi'), ' ');
    });
    t = t.replace(/\s+/g, ' ').trim();
    return t;
  }

  function escapeRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  /** ניקוי שם של דבר שנשאלה עליו שאלה: בלי פיסוק ובלי אותיות יחס תלושות */
  function tidyThing(s) {
    return String(s || '')
      .replace(/[?!.,;:"']/g, ' ')
      .replace(/-/g, ' ')
      .replace(/(^|\s)[בלהמושכ](\s|$)/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /* ---------------- תאריך ---------------- */

  function detectDate(text) {
    const d = new Date();
    if (/אתמול/.test(text)) { d.setDate(d.getDate() - 1); return U.toISO(d); }
    if (/שלשום/.test(text)) { d.setDate(d.getDate() - 2); return U.toISO(d); }
    const m = text.match(/(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?/);
    if (m) {
      let y = m[3] ? parseInt(m[3], 10) : d.getFullYear();
      if (y < 100) y += 2000;
      const dd = new Date(y, parseInt(m[2], 10) - 1, parseInt(m[1], 10));
      if (!isNaN(dd)) return U.toISO(dd);
    }
    return U.todayISO();
  }

  /* ---------------- שם יעד ---------------- */

  const GOAL_FILLER = ['שעולה','שעולים','עולה','עולים','שווה','בסך','של','במשך','תוך','היעד','יעד','מטרה','בעוד','עוד','לקנות','חדש','חדשה','כסף','בשביל','עבור','ל','תוכנית','תכנית','חיסכון','חסכון'];

  function extractGoalName(text) {
    let m = text.match(/(?:לחסוך|לחסך|חוסך|חסכון|חיסכון|לקנות|יעד|מטרה|תוכנית|תכנית)\s*(?:כסף\s*)?(?:ל|עבור|בשביל)\s*([֐-׿a-zA-Z"'׳״ ]+)/);
    if (!m) m = text.match(/(?:ל|עבור|בשביל)\s*([֐-׿]{3,})/);
    if (!m) return null;

    let words = m[1].trim().split(/\s+/);
    const out = [];
    for (const w of words) {
      const bare = w.replace(/^ה/, '');
      if (GOAL_FILLER.includes(w) || GOAL_FILLER.includes(bare)) break;
      if (/^\d/.test(w)) break;
      out.push(w);
      if (out.length === 3) break;
    }
    const name = out.join(' ').trim();
    if (!name || name.length < 2) return null;
    if (/^(חיסכון|חסכון|מניות|השקעות)$/.test(name)) return null;
    return name;
  }

  /* ================= המנתח הראשי ================= */

  function parse(raw) {
    const text = normalize(raw);
    const t = text.toLowerCase();
    const nums = findNumbers(text);
    // מאיזה חשבון יצא הכסף ולאן — נחוץ כבר עכשיו כדי ש"מהחיסכון"
    // לא ייקרא בטעות כהפרשה *אל* החיסכון
    const srcAccount = detectAccount(text);
    const dstAccount = detectTarget(text);
    const amount = nums.length ? nums[0].value : null;
    const maxNum = nums.length ? Math.max(...nums.map(n => n.value)) : null;

    /* --- פקודות מערכת --- */
    if (/^(עזרה|help|\?|מה אפשר|מה אתה יודע)/.test(t))
      return { intent: 'help' };

    /* --- יתרות בפועל --- */
    const balKind = /(עובר ושב|עו"ש|עוש|חשבון בנק|בבנק|בחשבון)/.test(t) ? 'checking'
      : /(תיק מניות|במניות|מניות|השקעות|בורסה)/.test(t) ? 'stocks'
        : /(בחיסכון|בחסכון|קרן חיסכון|פיקדון)/.test(t) ? 'savings' : null;

    if (balKind && amount != null && /(יש לי|נמצא|יתרה|מונח|צבור|שמור|יושב|נשאר|בערך|כרגע|עדכן|תעדכן)/.test(t)
      && !/(להפריש|מפריש|הפרשה|כל חודש|בחודש|אחוז|%)/.test(t)) {
      return { intent: 'balance', kind: balKind, amount: maxNum };
    }

    /* --- שאלת הון / יתרות --- */
    if (/(הון|שווי נטו|שווה לי|כמה יש לי בסך|סך הכל|סה"כ יש לי|כמה שווה|מאזן|נטו)/.test(t) && !nums.length)
      return { intent: 'netWorth' };

    if (/כמה יש לי/.test(t) && balKind && !nums.length)
      return { intent: 'balanceQuery', kind: balKind };

    /* --- "אני יכול להרשות לעצמי?" — שאלת כן/לא --- */
    if (/(יכול|אפשר|כדאי|מומלץ|שווה|נכון|מספיק)/.test(t) && amount != null
      && /(לקנות|להוציא|לבזבז|להרשות|לשלם|לקחת|להזמין|מספיק)/.test(t)) {
      return {
        intent: 'afford',
        amount: maxNum,
        what: tidyThing(cleanNote(text, ['יכול','אפשר','כדאי','מומלץ','שווה','נכון','מספיק','להרשות','לעצמי','לקנות','להוציא','לבזבז','לשלם','לקחת','להזמין','האם','לי','עכשיו','היום']))
      };
    }

    /* --- חוב מול חיסכון --- */
    if (/(חוב|הלוואה|מינוס)/.test(t) && /(לחסוך|חיסכון|להשקיע|מניות)/.test(t)
      && /(עדיף|כדאי|או|קודם|מה נכון|מה עדיף)/.test(t))
      return { intent: 'debtVsSave' };

    /* --- "אותו דבר" בפתיחת חודש --- */
    if (/^(אותו דבר|כמו קודם|כמו תמיד|בלי שינוי|אין שינוי|הכל אותו דבר|כרגיל|לא השתנה)/.test(t))
      return { intent: 'sameAsBefore' };

    /* --- סיכום החודש שעבר --- */
    if (/(סיכום החודש|סיכום חודשי|חודש שעבר|החודש שעבר|דוח חודשי|מה היה בחודש|איך היה החודש|סיכום של החודש)/.test(t))
      return { intent: 'monthReview' };

    /* --- ייעוץ כללי --- */
    if (/(תייעץ|להתייעץ|עצה|עצות|ממליץ|המלצה|המלצות|מה לעשות|מה כדאי|איך לחסוך|איך אני יכול לחסוך|תעזור לי|מה דעתך|איך אני עומד|אני בסדר|מה המצב שלי|תבדוק אותי|איפה אני מפסיד|איפה אני מבזבז|מה לצמצם)/.test(t))
      return { intent: 'advice' };

    if (/^(בטל|ביטול|undo|טעות|תבטל)/.test(t))
      return { intent: 'undo' };

    if (/^(איפוס|אפס|reset|תמחק הכל|מחק הכל)/.test(t))
      return { intent: 'reset' };

    if (/(דוח|דו"ח|סיכום|סטטוס|מצב|כמה נשאר|מה המצב|תמונת מצב|כמה יש לי)/.test(t) && !nums.length)
      return { intent: 'report' };

    /* --- שאילתה: כמה הוצאתי על X --- */
    if (/כמה\s+(?:הוצאתי|בזבזתי|שילמתי)/.test(t))
      return { intent: 'query', category: explicitCategory(text) };

    /* --- מחיקה --- */
    if (/^(תמחק|מחק|הסר|תסיר)/.test(t)) {
      if (/יעד|תוכנית|תכנית|חיסכון ל/.test(t)) return { intent: 'deleteGoal', name: extractGoalName(text) };
      if (/כרטיס|אשראי/.test(t)) return { intent: 'deleteCard', name: detectCardName(text) };
      if (/חוב|הלוואה/.test(t)) return { intent: 'deleteDebt', name: cleanNote(text, ['תמחק','מחק','חוב','הלוואה']) };
      return { intent: 'unknown', text };
    }

    /* --- משכורת ---
       "שכר דירה" ו"שכר לימוד" הן הוצאות ולא הכנסה, וגם משפט עם פועל של
       תשלום ("שילמתי שכר דירה") לעולם אינו הגדרת משכורת. */
    const salaryWord = /(משכורת|שכר|מרוויח|מרויח|הכנסה חודשית|משתכר)/.test(t)
      && !/(שכר דירה|שכר לימוד|שכר טרחה|שכירות)/.test(t)
      && !/(שילמתי|משלם|קניתי|הוצאתי|תשלום)/.test(t);
    if (salaryWord && amount != null && !/בונוס/.test(t)) {
      const day = (text.match(/(?:ב|ל)?(\d{1,2})\s*(?:לחודש|בחודש)/) || [])[1];
      return { intent: 'salary', amount: maxNum, salaryDay: day ? parseInt(day, 10) : null };
    }

    /* --- כרטיס אשראי (הגדרה) --- */
    if (/(מסגרת|כרטיס אשראי|יש לי כרטיס|תוסיף כרטיס|הוסף כרטיס)/.test(t) && !/שילמתי|קניתי|הוצאתי/.test(t)) {
      const limit = maxNum;
      const billing = (text.match(/(?:חיוב|נגבה|מחויב)\s*(?:ב|ה)?(\d{1,2})/) || [])[1];
      return {
        intent: 'card',
        name: detectCardName(text) || 'אשראי',
        limit: limit,
        billingDay: billing ? parseInt(billing, 10) : null
      };
    }

    /* --- חובות --- */
    if (/(חוב|חובות|הלוואה|הלוואות|מינוס|אוברדרפט)/.test(t) && amount != null) {
      const interestVal = (text.match(/ריבית\s*(?:של\s*)?(\d+(?:\.\d+)?)/) || [])[1];
      const monthly = (function () {
        const m = text.match(/(?:החזר|מחזיר|תשלום חודשי|כל חודש|בחודש)\s*(?:של\s*)?(\d[\d,]*)/);
        if (m) return parseFloat(m[1].replace(/,/g, ''));
        // אחרת: המספר הקטן ביותר, בלי אחוז הריבית ובלי גובה החוב עצמו
        const rest = nums.map(n => n.value)
          .filter(v => v !== maxNum && (interestVal == null || v !== parseFloat(interestVal)));
        return rest.length ? Math.min(...rest) : null;
      })();
      const interest = (function () {
        const m = text.match(/ריבית\s*(?:של\s*)?(\d+(?:\.\d+)?)\s*(?:%|אחוז)?/);
        return m ? parseFloat(m[1]) : null;
      })();
      const paying = /(שילמתי|החזרתי|הפחתתי)/.test(t);
      let name = cleanNote(text, ['חוב','חובות','הלוואה','הלוואות','יש','לי','החזר','מחזיר','תשלום','חודשי','כל','חודש','בחודש','מינוס','אוברדרפט','שילמתי','החזרתי','ריבית','אחוז','אחוזים','על']);
      if (!name) name = /מינוס|אוברדרפט/.test(t) ? 'מינוס בבנק' : 'הלוואה';
      return { intent: paying ? 'debtPayment' : 'debt', name, amount: maxNum, monthly, interest };
    }

    /* --- הפקדה לחשבון: "הפקדתי במזומן לחשבון 1000" --- */
    if (/(הפקדתי|הפקדה|הכנסתי|הפקדנו|שמתי|הוספתי|נכנס|קיבלתי|משכורת נכנסה)/.test(t)
      && amount != null && detectTarget(text) && !detectAccount(text)) {
      return {
        intent: 'deposit',
        to: detectTarget(text),
        amount: maxNum,
        cash: /מזומן/.test(t),
        note: tidyThing(cleanNote(text, ['הפקדתי','הפקדה','הכנסתי','הפקדנו','שמתי','הוספתי','נכנס','קיבלתי','חשבון','לחשבון','בנק']))
      };
    }

    /* --- הפקדה ליעד קיים --- */
    if (/(הפקדתי|הפקדה|שמתי בצד|העברתי לחיסכון|שמתי|חסכתי|הפרשתי)/.test(t) && amount != null) {
      const gname = extractGoalName(text);
      if (gname) return { intent: 'goalDeposit', name: gname, amount };
    }

    /* --- יעד חיסכון --- */
    const wantsGoal = /(לחסוך|לחסך|חוסך|יעד|מטרה|תוכנית חיסכון|תכנית חיסכון|רוצה לקנות)/.test(t);
    if (wantsGoal) {
      const gname = extractGoalName(text);
      const months = findMonths(text);
      if (gname && maxNum) {
        return { intent: 'goal', name: gname, target: maxNum, months: months || 12 };
      }
    }

    /* --- העברה בין חשבונות --- */
    if (amount != null && srcAccount && dstAccount && srcAccount !== dstAccount
      && /(העברתי|להעביר|תעביר|העבר|מעביר|משיכה|משכתי)/.test(t)) {
      return { intent: 'transfer', from: srcAccount, to: dstAccount, amount: maxNum };
    }

    /* --- הפרשות קבועות: חיסכון / מניות --- */
    const percent = findPercent(text);
    const isStocks = /(מניות|בורסה|השקעה|השקעות|קרן|אתפ|etf|s&p|סנופי)/.test(t);
    const isSavings = /(חיסכון|חסכון|לחסוך בצד|קופת גמל|פנסיה)/.test(t);
    if ((isStocks || isSavings) && (amount != null || percent != null) && !srcAccount) {
      return {
        intent: 'allocation',
        kind: isStocks ? 'stocks' : 'savings',
        value: percent != null ? percent : maxNum,
        isPercent: percent != null
      };
    }

    /* --- הגבלה חודשית --- */
    if (/(הגבלה|הגבל|מגבלה|תקרה|מקסימום|לא יותר מ|תגביל|להגביל|תקציב ל)/.test(t) && amount != null) {
      const subject = extractLimitSubject(text);
      const known = CATEGORIES.some(c => c.name === subject) || customCats().some(c => c.name === subject);
      return {
        intent: 'limit',
        category: subject || 'כללי',
        isNew: !!subject && !known,   // נושא חדש שהמשתמש המציא
        amount: maxNum
      };
    }

    /* --- הכנסה חד־פעמית --- */
    if (/(קיבלתי|נכנס לי|בונוס|החזר מס|מענק|הכנסה|רווח|מכרתי|החזירו לי|זיכוי)/.test(t) && amount != null) {
      return {
        intent: 'income',
        amount,
        note: cleanNote(text, ['קיבלתי','נכנס','לי','הכנסה','רווח','מכרתי','החזירו','זיכוי']) || 'הכנסה',
        date: detectDate(text)
      };
    }

    /* --- הוצאה (ברירת מחדל כשיש סכום) --- */
    if (amount != null) {
      const cardName = /(שילמתי|קניתי|הוצאתי|באשראי|בכרטיס)/.test(t) || detectCardName(text)
        ? detectCardName(text) : null;
      return {
        intent: 'expense',
        amount,
        category: detectCategory(text),
        note: cleanNote(text) || detectCategory(text),
        cardName,
        source: srcAccount || 'checking',   // מאיזה חשבון יצא הכסף
        date: detectDate(text)
      };
    }

    return { intent: 'unknown', text };
  }

  return { parse, CATEGORIES, categoryIcon, isFlexible, guessIcon, extractLimitSubject, ACCOUNTS, detectAccount, detectCategory, explicitCategory, normalize, findNumbers, findMonths, extractGoalName, detectCardName, cleanNote, tidyThing };
})();
