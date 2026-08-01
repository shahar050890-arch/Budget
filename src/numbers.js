/* numbers.js — קריאת מספרים שכתובים במילים בעברית.
   "חמישים שקל" → 50 · "אלף מאתיים" → 1200 · "שלוש מאות וחמישים" → 350 */
window.HebNum = (function () {

  const ONES = {
    'אחד': 1, 'אחת': 1, 'שניים': 2, 'שתיים': 2, 'שני': 2, 'שתי': 2,
    'שלושה': 3, 'שלוש': 3, 'שלשה': 3, 'ארבעה': 4, 'ארבע': 4,
    'חמישה': 5, 'חמש': 5, 'חמשה': 5, 'שישה': 6, 'שש': 6, 'ששה': 6,
    'שבעה': 7, 'שבע': 7, 'שמונה': 8, 'שמונת': 8, 'תשעה': 9, 'תשע': 9
  };

  const TENS = {
    'עשר': 10, 'עשרה': 10, 'עשרים': 20, 'שלושים': 30, 'שלשים': 30,
    'ארבעים': 40, 'חמישים': 50, 'חמשים': 50, 'שישים': 60, 'ששים': 60,
    'שבעים': 70, 'שמונים': 80, 'תשעים': 90
  };

  const HUNDREDS = { 'מאה': 100, 'מאתיים': 200, 'מאתים': 200 };
  const SCALE = { 'אלף': 1000, 'אלפים': 1000, 'אלפיים': 2000, 'אלפים': 1000, 'מיליון': 1000000 };

  /** כל המילים שיכולות להשתתף במספר */
  function isNumWord(w) {
    return ONES[w] != null || TENS[w] != null || HUNDREDS[w] != null
      || SCALE[w] != null || w === 'מאות' || w === 'ו';
  }

  function normWord(w) {
    // "וחמישים" → "חמישים"; "ושלוש מאות" → "שלוש מאות"
    const bare = w.replace(/^ו/, '');
    if (isNumWord(bare)) return bare;
    return w;
  }

  /**
   * ממיר רצף מילים למספר.
   * מחזיר null אם הרצף אינו מספר תקין.
   */
  function fromWords(words) {
    let total = 0, current = 0, seen = false;

    for (let i = 0; i < words.length; i++) {
      const w = normWord(words[i]);
      if (w === 'ו' || w === '') continue;

      if (HUNDREDS[w] != null) { current += HUNDREDS[w]; seen = true; continue; }

      if (w === 'מאות') {
        // "שלוש מאות" — היחידה שלפני מוכפלת ב-100
        current = (current || 1) * 100;
        seen = true;
        continue;
      }

      if (SCALE[w] != null) {
        const mult = SCALE[w];
        if (w === 'אלפיים') { total += 2000; current = 0; }
        else { total += (current || 1) * mult; current = 0; }
        seen = true;
        continue;
      }

      if (TENS[w] != null) { current += TENS[w]; seen = true; continue; }
      if (ONES[w] != null) { current += ONES[w]; seen = true; continue; }

      return null;   // מילה שאינה חלק ממספר
    }

    return seen ? total + current : null;
  }

  /**
   * מאתר את רצף מילות המספר הארוך ביותר בטקסט.
   * מחזיר {value, start, end, raw} או null.
   */
  function find(text) {
    const tokens = [];
    const re = /[֐-׿"']+/g;
    let m;
    while ((m = re.exec(text))) tokens.push({ w: m[0], start: m.index, end: m.index + m[0].length });

    let best = null;
    for (let i = 0; i < tokens.length; i++) {
      if (!isNumWord(normWord(tokens[i].w))) continue;
      // מרחיבים כל עוד המילים ממשיכות להיות חלק מהמספר
      for (let j = tokens.length; j > i; j--) {
        const slice = tokens.slice(i, j);
        if (!slice.every(t => isNumWord(normWord(t.w)))) continue;
        const val = fromWords(slice.map(t => t.w));
        if (val == null || val === 0) continue;
        const span = j - i;
        if (!best || span > best.span || (span === best.span && val > best.value)) {
          best = {
            value: val, span,
            start: slice[0].start,
            end: slice[slice.length - 1].end,
            raw: text.slice(slice[0].start, slice[slice.length - 1].end)
          };
        }
        break;   // הרצף הארוך ביותר מנקודה זו
      }
    }
    return best;
  }

  return { find, fromWords, isNumWord, ONES, TENS, HUNDREDS, SCALE };
})();
