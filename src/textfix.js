// Light, rule-based tidy-up for Latvian text (no AI, no external service).
// Fixes spacing, punctuation spacing, sentence capitals, the final full stop
// and quotation marks. It does not change words, so it can't introduce errors
// in names or Latvian word forms.

// Words after which a full stop doesn't end the sentence ("piem.", "utt.", "plkst.").
const ABBREVIATIONS = new Set([
  'piem', 'utt', 'u.c', 'u.tml', 't.i', 't.s', 't.sk', 'sk', 'apm', 'plkst', 'nr', 'g', 'gs', 'gad',
  'v', 'k', 'sv', 'pirms', 'kungs', 'kdz', 'tālr', 'ilg', 'min', 'sek', 'st', 'dz', 'iel', 'pag', 'nov',
  'mr', 'mrs', 'dr', 'prof', 'ing', 'u', 'p', 'm', 'km', 'kg', 'gr', 'eur',
]);

const isLetter = (ch) => /\p{L}/u.test(ch);

function capitalizeSentences(text) {
  const chars = [...text];
  let capNext = true; // start of text
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (capNext && isLetter(ch)) {
      chars[i] = ch.toLocaleUpperCase('lv');
      capNext = false;
      continue;
    }
    if (isLetter(ch) || /\d/.test(ch)) capNext = false;
    if (ch === '\n') {
      // a new paragraph starts a new sentence
      if (chars[i + 1] === '\n' || i === 0) capNext = true;
    }
    if (ch === '!' || ch === '?') {
      if (chars[i + 1] === ' ' || chars[i + 1] === '\n') capNext = true;
    }
    if (ch === '.' && (chars[i + 1] === ' ' || chars[i + 1] === '\n')) {
      // look at the token before the full stop
      let j = i - 1;
      while (j >= 0 && !/\s/.test(chars[j])) j--;
      const token = chars.slice(j + 1, i).join('').replace(/^[„"«(]+/, '').toLocaleLowerCase('lv');
      const isNumber = /^\d+$/.test(token); // "24. decembrī", "1. vietā"
      const isAbbrev = ABBREVIATIONS.has(token) || (token.length === 1 && isLetter(token));
      const isEllipsis = chars[i - 1] === '.';
      if (!isNumber && !isAbbrev && !isEllipsis) capNext = true;
    }
  }
  return chars.join('');
}

export function tidyLatvianText(input) {
  let t = String(input ?? '');
  t = t.replace(/\r\n?/g, '\n');
  t = t.replace(/[ \t ]+/g, ' '); // repeated spaces / tabs
  t = t
    .split('\n')
    .map((l) => l.trim())
    .join('\n');
  t = t.replace(/\n{3,}/g, '\n\n'); // at most one empty line between paragraphs
  t = t.replace(/(^|[\s(])"([^"\n]+?)"/g, '$1„$2”'); // "teksts" → „teksts”
  t = t.replace(/\s+([,.;:!?…])/g, '$1'); // no space before punctuation
  t = t.replace(/([,;:!?])(?=\p{L})/gu, '$1 '); // space after , ; : ! ?
  t = t.replace(/(\p{L}{3,})\.(?=\p{L}{3,})/gu, '$1. '); // "kupenā.tad" → "kupenā. tad" (not "u.c.")
  t = t.replace(/([”)])([.,;:!?])(?=\p{L})/gu, '$1$2 '); // „nāc ēst”.mēs → „nāc ēst”. Mēs
  t = t.replace(/,{2,}/g, ',');
  t = t.replace(/\.{4,}/g, '...');
  t = t.replace(/\(\s+/g, '(').replace(/\s+\)/g, ')');
  t = t.trim();
  t = capitalizeSentences(t);
  if (t && /[\p{L}\d)”]$/u.test(t)) t += '.'; // end with a full stop
  return t;
}
