/* fx.js — מטבעות ושער הדולר.
   השער נמשך מהרשת כשיש חיבור, נשמר מקומית, ותמיד ברור מתי הוא עודכן. */
window.FX = (function () {

  const CURRENCIES = {
    ILS: { code: 'ILS', sign: '₪', name: 'שקל',  names: ['שקל', 'שקלים', 'ש"ח', 'שח', '₪', 'ils'] },
    USD: { code: 'USD', sign: '$', name: 'דולר', names: ['דולר', 'דולרים', '$', 'usd'] }
  };

  // מקורות חינמיים ללא מפתח; אם הראשון נופל מנסים את השני
  const SOURCES = [
    {
      url: 'https://api.frankfurter.app/latest?from=USD&to=ILS',
      read: d => d && d.rates && d.rates.ILS
    },
    {
      url: 'https://open.er-api.com/v6/latest/USD',
      read: d => d && d.rates && d.rates.ILS
    }
  ];

  const FALLBACK = 3.7;   // ברירת מחדל סבירה עד שיימשך שער אמיתי

  function state() { return Store.get().fx || {}; }

  /** השער הנוכחי: כמה שקלים בדולר אחד */
  function rate() {
    const f = state();
    return f.usdIls || FALLBACK;
  }

  function info() {
    const f = state();
    return {
      rate: rate(),
      at: f.at || null,
      manual: !!f.manual,
      known: !!f.usdIls,
      ageHours: f.at ? Math.round((Date.now() - new Date(f.at).getTime()) / 3600000) : null
    };
  }

  function setRate(value, manual) {
    const s = Store.get();
    s.fx = { usdIls: value, at: new Date().toISOString(), manual: !!manual };
    Store.save();
    return s.fx;
  }

  /** משיכת שער עדכני. נכשלת בשקט — נשארים עם השער השמור. */
  async function refresh(force) {
    const f = state();
    if (f.manual && !force) return info();          // שער ידני גובר
    if (!force && f.at && (Date.now() - new Date(f.at).getTime()) < 6 * 3600000) return info();

    for (const src of SOURCES) {
      try {
        const res = await fetch(src.url, { cache: 'no-store' });
        if (!res.ok) continue;
        const val = src.read(await res.json());
        if (val && val > 0.5 && val < 20) { setRate(val, false); return info(); }
      } catch (e) { /* אין רשת — ממשיכים עם מה שיש */ }
    }
    return info();
  }

  /* ---------- המרות ---------- */

  function toILS(amount, currency) {
    return currency === 'USD' ? amount * rate() : amount;
  }

  function fromILS(amount, currency) {
    return currency === 'USD' ? amount / rate() : amount;
  }

  function convert(amount, from, to) {
    if (from === to) return amount;
    return fromILS(toILS(amount, from), to);
  }

  /** פורמט בעל מטבע: 1,234 ₪ או $1,234 */
  function money(amount, currency, opts = {}) {
    const c = CURRENCIES[currency] || CURRENCIES.ILS;
    const v = Math.round(Number(amount) || 0);
    const s = Math.abs(v).toLocaleString('he-IL');
    const sign = v < 0 ? '-' : (opts.plus && v > 0 ? '+' : '');
    return c.code === 'USD' ? sign + c.sign + s : sign + s + ' ' + c.sign;
  }

  /** זיהוי מטבע שהוזכר בטקסט */
  function detect(text) {
    const t = String(text).toLowerCase();
    for (const key of Object.keys(CURRENCIES)) {
      for (const n of CURRENCIES[key].names) {
        if (new RegExp('(?:^|\\s|\\d)[בהו]?' + n.replace(/[$]/g, '\\$') + '(?:\\s|$|[,.?!])', 'i').test(t))
          return key;
      }
    }
    return null;
  }

  /** המטבע של חשבון מסוים */
  function accountCurrency(kind) {
    const s = Store.get();
    return (s.currencies && s.currencies[kind]) || 'ILS';
  }

  function setAccountCurrency(kind, code) {
    const s = Store.get();
    s.currencies = s.currencies || {};
    s.currencies[kind] = code;
    Store.save();
  }

  /** תיאור קצר של מקור השער, להצגה למשתמש */
  function rateNote() {
    const i = info();
    if (i.manual) return 'שער ידני שהזנת: ' + i.rate.toFixed(3);
    if (!i.at) return 'שער משוער: ' + i.rate.toFixed(3) + ' (עוד לא נמשך שער עדכני)';
    if (i.ageHours < 24) return 'שער: ' + i.rate.toFixed(3) + ' — עודכן היום';
    return 'שער: ' + i.rate.toFixed(3) + ' — עודכן לפני ' + Math.round(i.ageHours / 24) + ' ימים';
  }

  return {
    CURRENCIES, rate, info, setRate, refresh,
    toILS, fromILS, convert, money, detect,
    accountCurrency, setAccountCurrency, rateNote
  };
})();
