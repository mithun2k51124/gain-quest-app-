// utils/nutritionLabel.ts â€” turns the text ML Kit reads off a nutrition label into numbers: energy,
// protein, carbs and fat per 100 g and per serving, the serving size, the ingredients and allergens.
// A label is a table and OCR hands its columns back as separate blocks, so the rows are rebuilt from
// where each word sits on the photo (straightened first when the photo is tilted) before anything is
// read. Plain TypeScript with no React Native imports, so it can be tested on its own.

export interface OcrFrame { left: number; top: number; width: number; height: number }
export interface OcrPoint { x: number; y: number }
export interface OcrElement { text: string; frame?: OcrFrame; cornerPoints?: readonly OcrPoint[] }
export interface OcrLine { text: string; frame?: OcrFrame; cornerPoints?: readonly OcrPoint[]; elements?: OcrElement[] }
export interface OcrBlock { text: string; frame?: OcrFrame; lines: OcrLine[] }
export interface OcrResult { text: string; blocks: OcrBlock[] }

export interface LabelMacros { kcal?: number; protein?: number; carbs?: number; fat?: number; sugar?: number; fibre?: number }
type Key = keyof LabelMacros;

export interface LabelReading {
  per100?: LabelMacros;        // per 100 g (or 100 ml)
  perServing?: LabelMacros;
  servingGrams?: number;
  servingText?: string;        // as printed, e.g. '1 scoop (32 g)'
  servingUnit?: string;        // 'scoop', 'biscuit'
  servingsPerPack?: number;
  unit: 'g' | 'ml';
  name?: string;
  ingredients: string[];
  allergens: string[];
  notes: string[];             // 'Added sugar', 'Palm oil', 'Sweetener'
  found: number;               // how many of energy, protein, carbs and fat were read
  kcalFromMacros: boolean;     // energy wasn't printed (or legible): worked out from the macros
  confidence: 'high' | 'medium' | 'low';
}

const MACROS: Key[] = ['kcal', 'protein', 'carbs', 'fat'];

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const round1 = (n: number) => Math.round(n * 10) / 10;

// â”€â”€â”€ Words on the photo â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
interface Tok { text: string; x0: number; x1: number; y: number; h: number }

/** Ingredient lists and allergy statements are paragraphs, not table rows. */
function isParagraph(block: OcrBlock): boolean {
  const t = block.text;
  if (/^\s*(ingredients?|contains|allergen|may contain)/i.test(t)) return true;
  const letters = (t.match(/[a-z]/gi) || []).length;
  const digits = (t.match(/\d/g) || []).length;
  const commas = (t.match(/,/g) || []).length;
  return commas >= 4 && digits < letters * 0.12 && !/\b(protein|energy|carbohydrate|calories)\b/i.test(t);
}

/** The text's slope on the photo (radians), from the lines' corner points. */
function textAngle(blocks: OcrBlock[]): number {
  const angles: number[] = [];
  for (const b of blocks) for (const l of b.lines) {
    const p = l.cornerPoints;
    if (!p || p.length < 4) continue;
    const w = Math.hypot(p[1].x - p[0].x, p[1].y - p[0].y);
    const h = Math.hypot(p[3].x - p[0].x, p[3].y - p[0].y);
    if (w < h * 2) continue;   // short words give shaky angles
    angles.push(Math.atan2(p[1].y - p[0].y, p[1].x - p[0].x));
  }
  return median(angles);
}

function tokensOf(blocks: OcrBlock[], angle: number): Tok[] {
  const cos = Math.cos(angle), sin = Math.sin(angle);
  // Turn the photo back by its slope so each row of the table is level
  const level = (x: number, y: number) => ({ x: x * cos + y * sin, y: -x * sin + y * cos });
  const out: Tok[] = [];
  const push = (text: string, frame?: OcrFrame, pts?: readonly OcrPoint[]) => {
    if (!text.trim()) return;
    let cx: number, cy: number, w: number, h: number;
    if (pts && pts.length >= 4) {
      cx = (pts[0].x + pts[1].x + pts[2].x + pts[3].x) / 4;
      cy = (pts[0].y + pts[1].y + pts[2].y + pts[3].y) / 4;
      w = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      h = Math.hypot(pts[3].x - pts[0].x, pts[3].y - pts[0].y);
    } else if (frame) {
      cx = frame.left + frame.width / 2; cy = frame.top + frame.height / 2; w = frame.width; h = frame.height;
    } else return;
    const c = level(cx, cy);
    out.push({ text: text.trim(), x0: c.x - w / 2, x1: c.x + w / 2, y: c.y, h: Math.max(1, h) });
  };
  for (const b of blocks) {
    if (isParagraph(b)) continue;
    for (const l of b.lines) {
      const els = (l.elements || []).filter(e => e.frame || e.cornerPoints);
      if (els.length) { els.forEach(e => push(e.text, e.frame, e.cornerPoints)); continue; }
      if (!l.frame) continue;
      // No word boxes: share the line's width out between its words
      const words = l.text.split(/\s+/).filter(Boolean);
      const total = words.reduce((n, w) => n + w.length + 1, 0);
      let at = 0;
      for (const w of words) {
        const left = l.frame.left + (at / total) * l.frame.width;
        push(w, { left, top: l.frame.top, width: (w.length / total) * l.frame.width, height: l.frame.height });
        at += w.length + 1;
      }
    }
  }
  return out;
}

/** Words at the same height are one row of the table, read left to right. */
function rowsOf(tokens: Tok[]): Tok[][] {
  const H = median(tokens.map(t => t.h)) || 10;
  const sorted = [...tokens].sort((a, b) => a.y - b.y);
  const rows: { y: number; toks: Tok[] }[] = [];
  for (const t of sorted) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(t.y - row.y) <= H * 0.6) {
      row.toks.push(t);
      row.y = row.toks.reduce((n, k) => n + k.y, 0) / row.toks.length;
    } else rows.push({ y: t.y, toks: [t] });
  }
  return rows.map(r => r.toks.sort((a, b) => a.x0 - b.x0));
}

// â”€â”€â”€ Numbers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
interface Val { v: number; raw: string; unit: string; x: number }

/** Common OCR slips inside numbers: O for 0, a decimal comma, a thousands comma. */
function cleanNumberText(s: string): string {
  return s
    .replace(/(\d)[oO]/g, (_, d) => d + '0')
    .replace(/[oO](?=[\d.,]\d)/g, '0')
    .replace(/(\d),(\d{3})(?!\d)/g, '$1$2')
    .replace(/(\d),(\d)/g, '$1.$2');
}

const UNIT_ONLY = /^\(?(kcal|kj|cal|calories|g|gm|gms|grams?|mg|mcg|Âµg|ug|ml|%)\)?[.,:;]?$/i;
const NUM = /(\d+(?:\.\d+)?)\s*(kcal|kj|cal|mcg|Âµg|ug|mg|gms|gm|g|ml|%)?/gi;

function unitOf(u: string): string {
  const l = u.toLowerCase();
  if (l === 'calories' || l === 'cal') return 'kcal';
  if (l === 'gm' || l === 'gms' || l === 'gram' || l === 'grams') return 'g';
  if (l === 'Âµg' || l === 'ug') return 'mcg';
  return l;
}

/** '1 650 kJ': a thousands group printed with a space comes back as two words; put them together. */
function joinThousands(toks: Tok[]): Tok[] {
  const out: Tok[] = [];
  for (const t of toks) {
    const prev = out[out.length - 1];
    if (prev && /^\d{1,3}$/.test(prev.text) && /^\d{3}(?!\d)/.test(t.text) && t.x0 - prev.x1 < Math.max(prev.h, t.h) * 0.6) {
      out[out.length - 1] = { ...prev, text: prev.text + t.text, x1: t.x1 };
    } else out.push(t);
  }
  return out;
}

function valuesIn(toks: Tok[]): Val[] {
  const out: Val[] = [];
  for (const t of toks) {
    const unitOnly = t.text.match(UNIT_ONLY);
    if (unitOnly) {
      const last = out[out.length - 1];
      if (last && !last.unit) last.unit = unitOf(unitOnly[1]);
      continue;
    }
    const text = cleanNumberText(t.text);
    const found: Val[] = [];
    NUM.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = NUM.exec(text))) found.push({ v: parseFloat(m[1]), raw: m[1], unit: m[2] ? unitOf(m[2]) : '', x: 0 });
    // '1550kJ/370kcal' is two values in one word: spread them across its width
    found.forEach((f, i) => { f.x = t.x0 + ((i + 0.5) / found.length) * (t.x1 - t.x0); });
    out.push(...found);
  }
  return out;
}

// â”€â”€â”€ What each row is â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
type RowKey = Key | 'energy-kj';

function nutrientOf(label: string): RowKey | null {
  const l = label.toLowerCase().replace(/[^a-z% ]+/g, ' ').replace(/\s+/g, ' ').trim();
  // Only the start of the row names it: 'Ingredients: â€¦sugarâ€¦' isn't the sugar row
  const head = l.split(' ').slice(0, 4).join(' ');
  if (!head) return null;
  if (/\b(saturat|trans|mono|poly|unsat|cholesterol|sodium|salt|potassium|calcium|iron|vitamin)/.test(head)) return null;
  if (/from fat|of which/.test(head)) return null;
  if (/^(total )?(ener|calor|kcal\b|cal\b)/.test(head)) {
    return /\bkj\b/.test(head) && !/kcal|calor/.test(head) ? 'energy-kj' : 'kcal';
  }
  if (/^(total )?prote/.test(head) || /^prot\b/.test(head)) return 'protein';
  if (/^(total )?(carb|glucides)/.test(head)) return 'carbs';
  if (/^(total )?(fat|fats|lipid|lipids)\b/.test(head) || /^fat total/.test(head)) return 'fat';
  if (/^(total )?sugars?\b/.test(head)) return 'sugar';
  if (/^(dietary )?fib(re|er)/.test(head)) return 'fibre';
  return null;
}

const hasLetters = (s: string) => /[a-z]{3,}/i.test(s.replace(/kcal|kj|cal|mg|g\b|ml/gi, ''));

interface Column { kind: '100' | 'serv' | 'pct'; x: number }

/** The table's column headings: per 100 g, per serving, % of daily value. */
function headerColumns(rows: Tok[][]): { cols: Column[]; servGrams?: number } {
  const center = (ts: Tok[]) => (ts[0].x0 + ts[ts.length - 1].x1) / 2;
  const found: { row: number; cols: Column[]; servGrams?: number }[] = [];
  rows.forEach((row, r) => {
    const words = row.map(t => t.text.toLowerCase().replace(/[()*:,]/g, ''));
    if (words.some(w => w.length > 3 && nutrientOf(w))) return;
    const cols: Column[] = [];
    let servGrams: number | undefined;
    const add = (c: Column) => { if (!cols.some(k => k.kind === c.kind)) cols.push(c); };
    for (let i = 0; i < row.length; i++) {
      const w = words[i], prev = words[i - 1] ?? '', next = words[i + 1] ?? '';
      // '100g', '100 g', 'per 100g', '100ml'
      if (/^(per)?100(g|gm|ml)?$/.test(w.replace('/', '')) && (/\d(g|gm|ml)$/.test(w) || /^(g|gm|ml|grams?)$/.test(next) || prev === 'per')) {
        add({ kind: '100', x: center([row[prev === 'per' ? i - 1 : i], row[/^(g|gm|ml|grams?)$/.test(next) ? i + 1 : i]]) });
        continue;
      }
      // 'per 30 g' heads a serving column
      const n = w.match(/^(\d+(?:\.\d+)?)(g|gm|ml)?$/);
      if (prev === 'per' && n && parseFloat(n[1]) !== 100 && (n[2] || /^(g|gm|ml)$/.test(next))) {
        servGrams = parseFloat(n[1]);
        add({ kind: 'serv', x: center([row[i]]) });
        continue;
      }
      // 'per serve', 'per serving' â€” not 'serving size' or 'servings per pack'
      if (/^(serving|serve|portion|scoop|sachet)s?$/.test(w) && next !== 'size' && next !== 'per'
        && (prev === 'per' || prev === '/' || cols.some(c => c.kind === '100'))) {
        add({ kind: 'serv', x: center([row[prev === 'per' ? i - 1 : i], row[i]]) });
        continue;
      }
      if (/^%|^(rda|gda|dv|ri)$|^daily$/.test(w)) add({ kind: 'pct', x: center([row[i]]) });
    }
    if (cols.length) found.push({ row: r, cols, servGrams });
  });
  if (!found.length) return { cols: [] };
  // The heading row is the one with the most headings; a heading wrapped onto a nearby row joins it
  const best = [...found].sort((a, b) => b.cols.length - a.cols.length)[0];
  const cols = [...best.cols];
  let servGrams = best.servGrams;
  for (const f of found) {
    if (f === best || Math.abs(f.row - best.row) > 2) continue;
    for (const c of f.cols) if (!cols.some(k => k.kind === c.kind)) cols.push(c);
    servGrams = servGrams ?? f.servGrams;
  }
  return { cols, servGrams };
}

// â”€â”€â”€ Serving size, ingredients, allergens â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const UNIT_NAMES = ['scoop', 'bar', 'biscuit', 'cookie', 'slice', 'cup', 'tbsp', 'tsp', 'piece', 'pack', 'sachet', 'bottle', 'can', 'pouch', 'tablet', 'stick'];
const G = String.raw`(\d+(?:\.\d+)?)\s*(?:g|gm|gms|grams?|ml)\b`;
// Up to n characters of the same line (a wrapped amount on the next line counts: 'Serving size\n1 scoop')
const SPAN = (n: number) => String.raw`(?:[^;:.\n]|\.(?=\d)|\n(?=\s*[\d(])){0,${n}}?`;

function servingFrom(text: string) {
  // Lines stay apart: a serving size never runs on into the next row
  const t = cleanNumberText(text.replace(/[ \t]+/g, ' '));
  // In each pattern group 1 is the text as printed and group 2 the grams
  const tries = [
    new RegExp(String.raw`serv(?:ing|e)\s*size\s*[:\-]?\s*(${SPAN(40)}${G}\s*\)?)`, 'i'),                  // Serving size 2/3 cup (55g)
    new RegExp(String.raw`per\s*(?:serving|serve|portion)\s*\(?\s*((?:(?!per\b)[^);:\n]){0,30}?${G})`, 'i'), // Per serve (25 g)
    new RegExp(String.raw`\b(1\s*(?:${UNIT_NAMES.join('|')}|serving)s?\s*\(?\s*=?\s*${G})`, 'i'),         // 1 scoop (32 g)
    new RegExp(String.raw`(${G}\s*(?:per\s*)?serv(?:ing|e)\b)`, 'i'),                                    // 30 g serving
  ];
  let grams: number | undefined;
  let printed: string | undefined;
  for (const re of tries) {
    const m = t.match(re);
    const g = m ? parseFloat(m[2]) : NaN;
    if (g > 0 && g <= 1000) { grams = g; printed = m![1].trim().replace(/^[:\-\s]+/, ''); break; }
  }
  if (!grams) {
    // 'per 30 g', a column heading that isn't per 100 g
    const re = new RegExp(String.raw`per\s+(${G})`, 'gi');
    let m: RegExpExecArray | null;
    while ((m = re.exec(t))) {
      const g = parseFloat(m[2]);
      if (g !== 100 && g > 0 && g <= 1000) { grams = g; printed = m[1]; break; }
    }
  }
  const src = (printed || '').toLowerCase();
  const unit = UNIT_NAMES.find(u => new RegExp(`\\b${u}s?\\b`).test(src));
  const perPack = t.match(/(\d+(?:\.\d+)?)\s*servings?\s*(?:per|in a|in each)\s*(?:pack|container|package|bag|box|jar|bottle)/i)
    || t.match(/servings?\s*per\s*(?:pack|container|package|bag|box|jar|bottle)\s*[:\-]?\s*(?:about|approx\.?)?\s*(\d+(?:\.\d+)?)/i)
    || t.match(/no\.?\s*of\s*serv(?:ings|es)\s*[:\-]?\s*(?:about|approx\.?)?\s*(\d+(?:\.\d+)?)/i);
  return { grams, printed, unit, perPack: perPack ? parseFloat(perPack[1]) : undefined };
}

const STOP = /\b(allergen|allergy|contains|may contain|nutrition|nutritional|storage|store (in|at)|keep in|best before|use by|mfd|manufactured|marketed|packed|net (wt|weight|quantity|qty)|batch|mrp|fssai|customer care|directions|serving suggestion|per 100)\b/i;

function ingredientsFrom(text: string): string[] {
  const m = text.match(/ingredients?\s*[:\-â€“]?\s*/i);
  if (!m || m.index === undefined) return [];
  let body = text.slice(m.index + m[0].length);
  const stop = body.search(STOP);
  if (stop > 0) body = body.slice(0, stop);
  return splitIngredients(body);
}

/** 'Wheat flour (Maida), Sugar, Oil (Palm)' â†’ one entry per ingredient, brackets kept together. */
export function splitIngredients(list: string): string[] {
  const body = list.replace(/\s+/g, ' ').trim();
  const parts: string[] = [];
  let depth = 0, cur = '';
  for (const ch of body) {
    if (ch === '(' || ch === '[') depth++;
    if (ch === ')' || ch === ']') depth = Math.max(0, depth - 1);
    if ((ch === ',' || ch === ';') && depth === 0) { parts.push(cur); cur = ''; } else cur += ch;
  }
  parts.push(cur);
  return parts
    .map(p => p.trim().replace(/^[.:\-\s]+|[.\s]+$/g, '').replace(/\s+/g, ' '))
    .filter(p => p.length >= 2 && /[a-z]/i.test(p) && p.length <= 80)
    .slice(0, 30)
    .map(p => p.charAt(0).toUpperCase() + p.slice(1));
}

const ALLERGENS: [string, RegExp][] = [
  ['Milk', /\b(milk|whey|casein|caseinate|lactose|cream|cheese|butter|ghee|curd|yogh?urt|paneer)\b/i],
  ['Gluten', /\b(wheat|maida|atta|barley|rye|gluten|semolina|sooji|suji|rava|spelt)\b/i],
  ['Soy', /\b(soy|soya|soybeans?)\b/i],
  ['Peanuts', /\b(peanuts?|groundnuts?)\b/i],
  ['Tree nuts', /\b(almonds?|cashews?|walnuts?|hazelnuts?|pistachios?|pecans?|macadamia|tree nuts?|nuts)\b/i],
  ['Egg', /\b(eggs?|albumin)\b/i],
  ['Fish', /\b(fish|anchov(y|ies)|tuna|salmon)\b/i],
  ['Shellfish', /\b(shrimps?|prawns?|crabs?|lobsters?|crustaceans?)\b/i],
  ['Sesame', /\b(sesame|til)\b/i],
  ['Mustard', /\bmustard\b/i],
];

export function allergensFrom(ingredients: string[], text = ''): string[] {
  const contains = (text.match(/(?:contains|allergen[a-z ]*?)\s*[:\-]\s*([^.\n]*)/i) || [])[1] || '';
  // 'peanut butter' and 'cocoa butter' aren't dairy
  const src = `${ingredients.join(', ')}, ${contains}`.replace(/\b(peanut|cocoa|shea|nut|seed)\s+butter\b/gi, '$1 spread');
  return ALLERGENS.filter(([, re]) => re.test(src)).map(([name]) => name);
}

export function notesFrom(ingredients: string[]): string[] {
  const src = ingredients.join(', ');
  const notes: string[] = [];
  if (/\b(sugar|glucose|fructose|dextrose|sucrose|invert|corn syrup|jaggery|honey|maltodextrin)\b/i.test(src)) notes.push('Added sugar');
  if (/\bpalm(olein| oil|\b)/i.test(src)) notes.push('Palm oil');
  if (/\b(sucralose|aspartame|acesulfame|stevia|saccharin|steviol|erythritol)\b/i.test(src)) notes.push('Sweetener');
  return notes;
}

/** The label's biggest line that isn't a heading: often the product name. */
function nameFrom(blocks: OcrBlock[]): string | undefined {
  const lines = blocks.flatMap(b => b.lines).filter(l => l.frame);
  if (lines.length < 3) return undefined;
  const H = median(lines.map(l => l.frame!.height));
  const best = lines
    .filter(l => l.frame!.height >= H * 1.5 && /[a-z]{3,}/i.test(l.text) && l.text.length <= 40)
    .filter(l => (l.text.match(/\d/g) || []).length <= l.text.length * 0.3)
    .filter(l => !/nutrition|information|facts|ingredient|serving|per\s*100|energy|protein|calorie|typical|values|amount|daily/i.test(l.text))
    .sort((a, b) => b.frame!.height - a.frame!.height)[0];
  return best ? best.text.trim().replace(/\s+/g, ' ') : undefined;
}

// â”€â”€â”€ Rows â†’ numbers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
interface RowRead { key: RowKey; vals: Val[]; unitHint: string }

function readRows(rows: Tok[][]): RowRead[] {
  const out: (RowRead & { labelOnly: boolean; valuesOnly: boolean })[] = [];
  for (const row of rows) {
    // 'B12' and 'Omega3' are words, not values
    const firstNum = row.findIndex(t => /\d/.test(t.text) && !/^[a-z]+\d+$/i.test(t.text.replace(/[()]/g, '')));
    const label = (firstNum < 0 ? row : row.slice(0, firstNum)).map(t => t.text).join(' ');
    const key = nutrientOf(label);
    const vals = firstNum < 0 ? [] : valuesIn(joinThousands(row.slice(firstNum)));
    const unitHint = (label.match(/\((kcal|kj|g|mg|ml)\)/i) || [])[1]?.toLowerCase() ?? '';
    out.push({ key: key!, vals, unitHint, labelOnly: !!key && !vals.length, valuesOnly: !key && !!vals.length && !hasLetters(label) });
  }
  // A label whose numbers landed on the next row (or the row before) gets them back
  for (let i = 0; i < out.length; i++) {
    const r = out[i];
    if (!r.labelOnly) continue;
    const next = out[i + 1], prev = out[i - 1];
    const from = next?.valuesOnly ? next : prev?.valuesOnly ? prev : null;
    if (from) { r.vals = from.vals; from.vals = []; from.valuesOnly = false; }
  }
  return out.filter(r => r.key && r.vals.length).map(({ key, vals, unitHint }) => ({ key, vals, unitHint }));
}

/** Without word positions (or when they told us less): read the plain text line by line. */
function readLines(text: string): RowRead[] {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const out: RowRead[] = [];
  lines.forEach((line, i) => {
    const m = line.match(/^([^\d]*)(.*)$/)!;
    const key = nutrientOf(m[1]);
    if (!key) return;
    let rest = m[2];
    if (!/\d/.test(rest) && lines[i + 1] && !nutrientOf(lines[i + 1].replace(/\d.*$/, ''))) rest = lines[i + 1];
    const vals = valuesIn(rest.split(/\s+/).map((w, j) => ({ text: w, x0: j, x1: j + 1, y: 0, h: 1 })));
    const unitHint = (m[1].match(/\((kcal|kj|g|mg|ml)\)/i) || [])[1]?.toLowerCase() ?? '';
    if (vals.length) out.push({ key, vals, unitHint });
  });
  return out;
}

/** Splits one row's numbers between the per-100 g column (a) and the per-serving column (b). */
function columnsFor(r: RowRead, cols: Column[], order: ('100' | 'serv')[], hasKj: boolean): { a?: Val; b?: Val; fromKj?: boolean } {
  let vals = r.vals.filter(v => v.unit !== '%' && v.unit !== 'mg' && v.unit !== 'mcg');
  const pct = cols.find(c => c.kind === 'pct');
  const c100 = cols.find(c => c.kind === '100');
  const cServ = cols.find(c => c.kind === 'serv');
  const valueCols = (c100 ? 1 : 0) + (cServ ? 1 : 0) || (order.length > 1 ? 2 : 1);
  if (pct && vals.length > valueCols) {
    // More numbers than value columns: the ones under the % column are daily-value percentages
    if (c100 || cServ) {
      vals = vals.filter(v => [c100, cServ].some(c => c && Math.abs(v.x - c.x) <= Math.abs(v.x - pct.x)));
    } else {
      const drop = [...vals].sort((p, q) => Math.abs(p.x - pct.x) - Math.abs(q.x - pct.x)).slice(0, vals.length - valueCols);
      vals = vals.filter(v => !drop.includes(v));
    }
  }
  let fromKj = false;
  if (r.key === 'kcal' || r.key === 'energy-kj') {
    // What each bare number is: the row's own unit ('Energy (kJ)'), or unknown
    const rowUnit = r.key === 'energy-kj' || r.unitHint === 'kj' ? 'kj' : r.unitHint === 'kcal' ? 'kcal' : '';
    vals = vals.map(v => (v.unit || !rowUnit ? v : { ...v, unit: rowUnit }));
    if (hasKj && vals.length >= 2 && vals.every(v => !v.unit)) {
      // Bare numbers in kJ-then-kcal pairs (one ~4.2Ã— the next): keep the kcal of each pair
      const pairs: Val[] = [];
      for (let i = 0; i + 1 < vals.length; i++) {
        const ratio = vals[i].v / Math.max(0.01, vals[i + 1].v);
        if (ratio > 3.9 && ratio < 4.5) { pairs.push(vals[i + 1]); i++; }
      }
      if (pairs.length) vals = pairs;
    }
    const kcal = vals.filter(v => v.unit === 'kcal' || !v.unit);
    fromKj = !kcal.length;
    vals = kcal.length ? kcal : vals.filter(v => v.unit === 'kj').map(v => ({ ...v, v: v.v / 4.184, unit: 'kcal' }));
  }
  if (!vals.length) return {};
  if (c100 && cServ) {
    let a: Val | undefined, b: Val | undefined;
    for (const v of vals) {
      if (Math.abs(v.x - c100.x) <= Math.abs(v.x - cServ.x)) a = a ?? v; else b = b ?? v;
    }
    return { a, b, fromKj };
  }
  if (vals.length === 1) return order[0] === '100' ? { a: vals[0], fromKj } : { b: vals[0], fromKj };
  return order[0] === '100' ? { a: vals[0], b: vals[1], fromKj } : { a: vals[1], b: vals[0], fromKj };
}

/** 'g' read as '9' turns 10g into 109: an impossible number that ends in 9 loses it. */
function plausible(key: Key, val: Val, limit: number): number | undefined {
  if (val.v <= limit) return val.v;
  if (key !== 'kcal' && !val.unit && val.raw.endsWith('9') && val.raw.length > 1) {
    const fixed = parseFloat(val.raw.slice(0, -1));
    if (!isNaN(fixed) && fixed <= limit) return fixed;
  }
  return undefined;
}

/** Can these be per-100 g values? Protein, carbs and fat can't weigh more than the 100 g. */
const fitsPer100 = (m: LabelMacros) =>
  (m.protein ?? 0) + (m.carbs ?? 0) + (m.fat ?? 0) <= 102 && (m.kcal ?? 0) <= 950;

export function readNutritionLabel(ocr: OcrResult): LabelReading {
  const text = ocr.text || ocr.blocks.map(b => b.text).join('\n');
  const angle = textAngle(ocr.blocks);
  const rows = rowsOf(tokensOf(ocr.blocks, Math.abs(angle) > 0.008 ? angle : 0));
  let head = headerColumns(rows);
  let reads = readRows(rows);
  const byLines = readLines(text);
  const keysIn = (rs: RowRead[]) => new Set(rs.map(r => (r.key === 'energy-kj' ? 'kcal' : r.key))).size;
  if (keysIn(byLines) > keysIn(reads)) { reads = byLines; head = { cols: [], servGrams: head.servGrams }; }

  // The rows read across the table, so 'Serving size' sits next to its '(55 g)'; the raw OCR text
  // goes column by column. Search the rows first.
  const rowText = rows.map(r => r.map(t => t.text).join(' ')).join('\n');
  let serving = servingFrom(rows.length ? rowText : text);
  if (!serving.grams && rows.length) {
    const raw = servingFrom(text);
    serving = { ...raw, unit: raw.unit ?? serving.unit, perPack: serving.perPack ?? raw.perPack };
  }
  const flat = (rows.length ? rowText : text).toLowerCase().replace(/\s+/g, ' ');
  const hasKj = /\bkj\b/.test(flat);
  const at100 = flat.search(/per\s*100\s*(g|gm|ml)|100\s*(g|gm|ml)\b/);
  const atServ = flat.search(/per\s*(serving|serve|portion)|amount per serving|per\s*\d+(\.\d+)?\s*(g|gm|ml)\s*serv/);
  const printedGrams = serving.grams ?? head.servGrams;
  const twoColumns = reads.some(r => r.vals.filter(v => v.unit !== '%' && v.unit !== 'mg').length >= 2);
  // Which column comes first when the headings' positions are unknown. One column is per 100 g when
  // the label says so, otherwise per serving when there's a serving size (US style)
  const order: ('100' | 'serv')[] = twoColumns
    ? (atServ >= 0 && at100 >= 0 && atServ < at100 ? ['serv', '100'] : ['100', 'serv'])
    : at100 >= 0 ? ['100'] : atServ >= 0 || printedGrams ? ['serv'] : ['100'];

  let per100: LabelMacros = {};
  let perServ: LabelMacros = {};
  let energyFromKj = false;
  for (const r of reads) {
    const key: Key = r.key === 'energy-kj' ? 'kcal' : r.key;
    // The first row wins (total fat, then saturates), but a kcal row beats energy worked out from kJ
    const taken = per100[key] !== undefined || perServ[key] !== undefined;
    if (taken && !(key === 'kcal' && energyFromKj)) continue;
    const { a, b, fromKj } = columnsFor(r, head.cols, order, hasKj);
    if (taken && fromKj) continue;
    if (key === 'kcal') { if (taken) { delete per100.kcal; delete perServ.kcal; } energyFromKj = !!fromKj; }
    if (a) { const v = plausible(key, a, key === 'kcal' ? 950 : 100); if (v !== undefined) per100[key] = round1(v); }
    if (b) { const v = plausible(key, b, key === 'kcal' ? 5000 : printedGrams ?? 500); if (v !== undefined) perServ[key] = round1(v); }
  }

  // The columns came out the wrong way round: per 100 g can't hold more than 100 g of nutrients,
  // and per serving = per 100 g Ã— serving / 100
  const both = Object.keys(per100).length > 0 && Object.keys(perServ).length > 0;
  if (both) {
    const fit = (p: LabelMacros, s: LabelMacros) => MACROS.filter(k => p[k] && s[k])
      .reduce((n, k) => n + Math.abs(Math.log(((s[k]! / p[k]!) * 100) / printedGrams!)), 0);
    const swap = (!fitsPer100(per100) && fitsPer100(perServ))
      || (!!printedGrams && fitsPer100(perServ) && fit(perServ, per100) + 0.05 < fit(per100, perServ));
    if (swap) [per100, perServ] = [perServ, per100];
  } else if (Object.keys(per100).length && !fitsPer100(per100)) {
    // A single column that can't be per 100 g is per serving
    [per100, perServ] = [{}, per100];
  }

  // No printed serving size but both columns: their ratio is the serving
  let grams = printedGrams;
  if (!grams) {
    const ratios = MACROS.filter(k => (per100[k] ?? 0) > 0 && (perServ[k] ?? 0) > 0).map(k => (perServ[k]! / per100[k]!) * 100);
    if (ratios.length) grams = Math.round(median(ratios));
  }

  // Fill each column from the other with the serving size
  if (grams) {
    for (const k of Object.keys({ ...per100, ...perServ }) as Key[]) {
      if (per100[k] === undefined && perServ[k] !== undefined) per100[k] = round1((perServ[k]! / grams) * 100);
      if (perServ[k] === undefined && per100[k] !== undefined) perServ[k] = round1((per100[k]! * grams) / 100);
    }
  }

  // Energy missing or unreadable: 4 kcal per gram of protein and carbs, 9 per gram of fat
  let kcalFromMacros = false;
  for (const col of [per100, perServ]) {
    if (col.kcal === undefined && col.protein !== undefined && col.carbs !== undefined && col.fat !== undefined) {
      col.kcal = col.protein * 4 + col.carbs * 4 + col.fat * 9;
      kcalFromMacros = true;
    }
    if (col.kcal !== undefined) col.kcal = Math.round(col.kcal);
  }

  const has100 = Object.keys(per100).length > 0;
  const hasServ = Object.keys(perServ).length > 0;
  const ref = has100 ? per100 : perServ;
  const found = Math.max(0, MACROS.filter(k => ref[k] !== undefined).length - (kcalFromMacros ? 1 : 0));
  // Energy should roughly match the macros when everything was read
  const consistent = ref.kcal !== undefined && ref.protein !== undefined && ref.carbs !== undefined && ref.fat !== undefined
    && Math.abs(ref.kcal - (ref.protein * 4 + ref.carbs * 4 + ref.fat * 9)) <= Math.max(25, ref.kcal * 0.2);
  const ingredients = ingredientsFrom(text);
  return {
    per100: has100 ? per100 : undefined,
    perServing: hasServ ? perServ : undefined,
    servingGrams: grams,
    servingText: serving.printed,
    servingUnit: serving.unit,
    servingsPerPack: serving.perPack,
    unit: /per\s*100\s*ml|100\s*ml\b/i.test(text) ? 'ml' : 'g',
    name: nameFrom(ocr.blocks),
    ingredients,
    allergens: allergensFrom(ingredients, text),
    notes: notesFrom(ingredients),
    found,
    kcalFromMacros,
    confidence: found >= 4 && consistent ? 'high' : found >= 3 ? 'medium' : 'low',
  };
}
