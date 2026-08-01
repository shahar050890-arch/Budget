/* util.js — עזרי פורמט, תאריכים ומזהים */
window.U = (function () {

  const CURRENCY = '₪';

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  /** 1234.5 -> "1,235 ₪" */
  function money(n, opts = {}) {
    const v = Math.round(Number(n) || 0);
    const s = Math.abs(v).toLocaleString('he-IL');
    const sign = v < 0 ? '-' : (opts.plus && v > 0 ? '+' : '');
    return sign + s + ' ' + CURRENCY;
  }

  function num(n) {
    return Math.round(Number(n) || 0).toLocaleString('he-IL');
  }

  function pct(part, whole) {
    if (!whole) return 0;
    return Math.round((part / whole) * 100);
  }

  /* ---------- תאריכים ---------- */

  function todayISO() {
    return toISO(new Date());
  }

  function toISO(d) {
    const p = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  function monthKey(iso) {
    return String(iso).slice(0, 7); // YYYY-MM
  }

  function currentMonth() {
    return monthKey(todayISO());
  }

  function prevMonth(key = currentMonth()) {
    const [y, m] = key.split('-').map(Number);
    const d = new Date(y, m - 2, 1);
    return monthKey(toISO(d));
  }

  function addMonths(key, k) {
    const [y, m] = key.split('-').map(Number);
    const d = new Date(y, m - 1 + k, 1);
    return monthKey(toISO(d));
  }

  const MONTH_NAMES = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];

  function monthLabel(key) {
    const [y, m] = key.split('-').map(Number);
    return MONTH_NAMES[m - 1] + ' ' + y;
  }

  function daysInMonth(key = currentMonth()) {
    const [y, m] = key.split('-').map(Number);
    return new Date(y, m, 0).getDate();
  }

  function daysLeftInMonth() {
    const d = new Date();
    return daysInMonth() - d.getDate() + 1;
  }

  function dayOfMonth() {
    return new Date().getDate();
  }

  /** "2026-08-01" -> "1 באוגוסט" ; היום/אתמול כשרלוונטי */
  function niceDate(iso) {
    if (iso === todayISO()) return 'היום';
    const y = new Date();
    y.setDate(y.getDate() - 1);
    if (iso === toISO(y)) return 'אתמול';
    const [yy, mm, dd] = iso.split('-').map(Number);
    const base = Number(dd) + ' ב' + MONTH_NAMES[mm - 1];
    return yy === new Date().getFullYear() ? base : base + ' ' + yy;
  }

  /** מספר החודשים שנותרו עד תאריך היעד (לפחות 1) */
  function monthsUntil(iso) {
    const now = new Date();
    const t = new Date(iso + 'T00:00:00');
    const months = (t.getFullYear() - now.getFullYear()) * 12 + (t.getMonth() - now.getMonth());
    // אם היום בחודש כבר עבר את יום היעד, החודש הנוכחי כבר לא נחשב
    return Math.max(1, months - (t.getDate() < now.getDate() ? 1 : 0));
  }

  function deadlineFromMonths(months) {
    const d = new Date();
    d.setMonth(d.getMonth() + Number(months || 0));
    return toISO(d);
  }

  /* ---------- DOM ---------- */

  function el(tag, cls, html) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function clamp(n, lo, hi) {
    return Math.min(hi, Math.max(lo, n));
  }

  return {
    CURRENCY, uid, money, num, pct,
    todayISO, toISO, monthKey, currentMonth, prevMonth, addMonths,
    monthLabel, daysInMonth, daysLeftInMonth, dayOfMonth, niceDate,
    monthsUntil, deadlineFromMonths, MONTH_NAMES,
    el, esc, clamp
  };
})();
