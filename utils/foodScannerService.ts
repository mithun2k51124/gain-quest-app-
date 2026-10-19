// utils/foodScannerService.ts — where food data comes from, none of it needing an API key: the
// built-in list of everyday foods (works offline), Open Food Facts for barcodes and packaged products
// (free and open), and nutrition labels read on the phone itself with ML Kit. Also the portion maths
// the search and the scanner share, and the name a food is logged under.
import { Platform } from 'react-native';
import TextRecognition from '@react-native-ml-kit/text-recognition';
import { getSetting, setSetting } from '../db/database';
import { CommonFood } from '../constants/foods';
import { readNutritionLabel, splitIngredients, allergensFrom, notesFrom, LabelReading, LabelMacros } from './nutritionLabel';

export interface Macros { kcal: number; protein: number; carbs: number; fat: number }

export interface FoodItem {
  name: string;
  brand?: string;
  per100?: Macros;              // per 100 g (or 100 ml)
  perServing?: Macros;          // per serving, when the source prints it
  servingGrams?: number;        // grams (or ml) in one serving
  servingUnit: string;          // 'roti', 'scoop', 'serving'
  servingText?: string;         // as printed: '1 scoop (32 g)'
  unit: 'g' | 'ml';
  source: 'common' | 'online' | 'barcode' | 'label' | 'manual';
  barcode?: string;
  image?: string;
  approx?: boolean;             // a home-made dish: varies with the recipe
  hasNutrition: boolean;
  ingredients?: string[];
  allergens?: string[];
  notes?: string[];
  label?: { found: number; confidence: LabelReading['confidence']; kcalFromMacros: boolean; servingsPerPack?: number };
}

export type PortionMode = 'servings' | 'grams';
export interface Portion extends Macros { grams?: number; servings?: number; text: string }

const ZERO: Macros = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
const scale = (m: Macros, f: number): Macros => ({ kcal: m.kcal * f, protein: m.protein * f, carbs: m.carbs * f, fat: m.fat * f });
const r1 = (n: number) => Math.round(n * 10) / 10;
const tidy = (m: Macros): Macros => ({ kcal: Math.round(m.kcal), protein: r1(m.protein), carbs: r1(m.carbs), fat: r1(m.fat) });
export const fmtNum = (n: number) => String(r1(n)).replace(/\.0$/, '');

/** '2 rotis', '1 scoop', '3 tbsp' */
export function unitName(unit: string, n: number): string {
  if (n === 1 || /^(tbsp|tsp|g|ml)$/.test(unit) || / /.test(unit)) return unit;
  return /(s|sh|ch|x)$/.test(unit) ? `${unit}es` : `${unit}s`;
}

/** Macros per serving and per 100 g, each worked out from the other when only one is known. */
export function servingMacros(item: FoodItem): Macros | undefined {
  return item.perServing ?? (item.per100 && item.servingGrams ? scale(item.per100, item.servingGrams / 100) : undefined);
}
export function per100Macros(item: FoodItem): Macros | undefined {
  return item.per100 ?? (item.perServing && item.servingGrams ? scale(item.perServing, 100 / item.servingGrams) : undefined);
}
/** Can this food be weighed in grams? (Needs per-100 g values, or a serving with known grams.) */
export const canWeigh = (item: FoodItem) => !!per100Macros(item);
export const canServe = (item: FoodItem) => !!servingMacros(item);

export function portionOf(item: FoodItem, amount: number, mode: PortionMode): Portion {
  const a = Math.max(0, isFinite(amount) ? amount : 0);
  if (mode === 'servings' && canServe(item)) {
    const grams = item.servingGrams ? a * item.servingGrams : undefined;
    return {
      ...tidy(scale(servingMacros(item)!, a)), grams, servings: a,
      text: `${fmtNum(a)} ${unitName(item.servingUnit, a)}${grams ? `, ${Math.round(grams)} ${item.unit}` : ''}`,
    };
  }
  const base = per100Macros(item);
  return { ...tidy(base ? scale(base, a / 100) : ZERO), grams: a, text: `${Math.round(a)} ${item.unit}` };
}

/** What goes in the food log: 'Paneer · 100 g', 'Roti (chapati) · 2 rotis, 80 g' */
export const logName = (name: string, p: Portion) => `${name.trim() || 'Food'} · ${p.text}`;

// ─── The built-in list ───────────────────────────────────────────────────────
export function fromCommon(f: CommonFood): FoodItem {
  return {
    name: f.name, per100: f.per100, servingGrams: f.serving.grams, servingUnit: f.serving.unit,
    unit: /^(milk \(|orange juice|sweet lassi|buttermilk|coffee|black coffee|tea with|coconut water|soft drink|beer)/i.test(f.name) ? 'ml' : 'g',
    source: 'common', approx: f.approx, hasNutrition: true,
  };
}

/** Typed in by hand: the values are for the amount eaten. */
export function manualItem(name: string, grams: number, m: Macros): FoodItem {
  const g = grams > 0 ? grams : 0;
  return {
    name, perServing: m, servingGrams: g || undefined, servingUnit: 'serving',
    per100: g ? scale(m, 100 / g) : undefined, unit: 'g', source: 'manual', hasNutrition: true,
  };
}

// ─── Open Food Facts ─────────────────────────────────────────────────────────
const UA = { 'User-Agent': 'GainQuest-Mobile/1.1 (offline fitness tracker)' };
const FIELDS = 'code,product_name,product_name_en,generic_name,brands,serving_size,serving_quantity,quantity,nutriments,ingredients_text_en,ingredients_text,allergens_tags,image_front_small_url';
const UNIT_WORDS = ['scoop', 'bar', 'biscuit', 'cookie', 'slice', 'cup', 'tbsp', 'tsp', 'piece', 'pack', 'sachet', 'bottle', 'can', 'pouch', 'egg'];

async function getJson(url: string, ms: number, signal?: AbortSignal): Promise<any | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener('abort', onAbort);
  try {
    const res = await fetch(url, { headers: UA, signal: ctrl.signal });
    // An unknown barcode is a 404 that still carries an answer ({ status: 0 }); null means no answer
    return res.ok || res.status === 404 ? await res.json() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

const num = (v: any) => (v === undefined || v === null || v === '' || isNaN(Number(v)) ? undefined : Number(v));

function macrosFrom(n: any, suffix: '_100g' | '_serving'): Macros | undefined {
  const kj = num(n[`energy-kj${suffix}`]) ?? num(n[`energy${suffix}`]);
  const kcal = num(n[`energy-kcal${suffix}`]) ?? (kj !== undefined ? kj / 4.184 : undefined);
  const protein = num(n[`proteins${suffix}`]);
  const carbs = num(n[`carbohydrates${suffix}`]);
  const fat = num(n[`fat${suffix}`]);
  if ([kcal, protein, carbs, fat].every(v => v === undefined)) return undefined;
  const m = { kcal: kcal ?? 0, protein: protein ?? 0, carbs: carbs ?? 0, fat: fat ?? 0 };
  // Energy left out but the macros are there: 4 / 4 / 9 kcal per gram
  if (kcal === undefined) m.kcal = m.protein * 4 + m.carbs * 4 + m.fat * 9;
  return tidy(m);
}

const ALLERGEN_TAGS: Record<string, string> = {
  milk: 'Milk', gluten: 'Gluten', soybeans: 'Soy', peanuts: 'Peanuts', nuts: 'Tree nuts', eggs: 'Egg',
  fish: 'Fish', crustaceans: 'Shellfish', molluscs: 'Shellfish', 'sesame-seeds': 'Sesame', mustard: 'Mustard',
};

function fromProduct(p: any, source: 'barcode' | 'online'): FoodItem | null {
  const name = (p.product_name || p.product_name_en || p.generic_name || '').trim();
  // A scanned product with no name is still that product (the name can be typed in); a nameless
  // search result is no use in a list
  if (!name && source === 'online') return null;
  const n = p.nutriments || {};
  const per100 = macrosFrom(n, '_100g');
  const perServing = macrosFrom(n, '_serving');
  const servingText: string = (p.serving_size || '').trim();
  const sq = num(p.serving_quantity);
  const sm = servingText.match(/(\d+(?:[.,]\d+)?)\s*(g|gm|ml)\b/i);
  const servingGrams = sq && sq > 0 ? sq : sm ? parseFloat(sm[1].replace(',', '.')) : undefined;
  const servingUnit = UNIT_WORDS.find(u => new RegExp(`\\b${u}s?\\b`, 'i').test(servingText)) ?? 'serving';
  const ingredients = splitIngredients(p.ingredients_text_en || p.ingredients_text || '');
  const tagged = ((p.allergens_tags || []) as string[]).map(t => ALLERGEN_TAGS[t.replace(/^[a-z]{2}:/, '')]).filter(Boolean);
  return {
    name,
    brand: (p.brands || '').split(',')[0].trim() || undefined,
    per100, perServing,
    servingGrams: servingGrams && servingGrams > 0 && servingGrams <= 2000 ? servingGrams : undefined,
    servingUnit, servingText: servingText || undefined,
    unit: /\bml\b|\d\s*l\b|litre|liter/i.test(`${p.quantity || ''} ${servingText}`) ? 'ml' : 'g',
    source, barcode: p.code, image: p.image_front_small_url || undefined,
    hasNutrition: !!(per100 || perServing),
    ingredients: ingredients.length ? ingredients : undefined,
    allergens: [...new Set([...tagged, ...allergensFrom(ingredients)])],
    notes: notesFrom(ingredients),
  };
}

/** Barcodes already looked up (or corrected by hand) are kept on the phone. */
const cacheKey = (code: string) => `food_bc2_${code}`;

export function rememberBarcode(item: FoodItem): void {
  if (!item.barcode) return;
  try { setSetting(cacheKey(item.barcode), JSON.stringify(item)); } catch {}
}

function cached(code: string): FoodItem | null {
  try {
    const raw = getSetting(cacheKey(code), '');
    if (raw) return JSON.parse(raw);
    // Saved by an older version of the scanner
    const old = getSetting(`food_barcode_${code}`, '');
    if (old) {
      const o = JSON.parse(old);
      const m = (k: string): Macros | undefined => o[`calories${k}`] !== undefined
        ? tidy({ kcal: o[`calories${k}`] || 0, protein: o[`protein${k}`] || 0, carbs: o[`carbs${k}`] || 0, fat: o[`fat${k}`] || 0 }) : undefined;
      return {
        name: o.name, brand: o.brand, per100: m('Per100g'), perServing: m('PerServing'), servingGrams: o.servingSizeGrams,
        servingUnit: o.servingUnitName || 'serving', servingText: o.rawServingText, unit: 'g', source: 'barcode',
        barcode: code, hasNutrition: o.hasNutritionData !== false,
      };
    }
  } catch {}
  return null;
}

/**
 * A product by its barcode: the phone's copy first, then Open Food Facts. null = not on Open Food
 * Facts; throws when Open Food Facts couldn't be reached (offline), so the two can be told apart.
 */
export async function fetchFoodByBarcode(barcode: string): Promise<FoodItem | null> {
  const code = barcode.trim().replace(/\D/g, '');
  if (!code) return null;
  const hit = cached(code);
  if (hit) return hit;
  const data = await getJson(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=${FIELDS}`, 9000);
  if (!data) throw new Error('Open Food Facts unreachable');
  const p = data.status === 1 || data.product ? data.product : null;
  if (!p) return null;
  const item = fromProduct({ ...p, code }, 'barcode');
  // Only complete products are kept: one without values may get them on Open Food Facts later
  // (values typed in by hand are kept when the food is added)
  if (item?.hasNutrition) rememberBarcode(item);
  return item;
}

/**
 * Packaged products matching a search, from Open Food Facts (only ones with nutrition values).
 * null means Open Food Facts couldn't be reached (offline), [] that nothing matched.
 */
export async function searchFoodsOnline(query: string, signal?: AbortSignal): Promise<FoodItem[] | null> {
  const q = query.trim();
  if (q.length < 2) return [];
  const enc = encodeURIComponent(q);
  // The search service is quick; the classic search is the fallback
  const fast = await getJson(`https://search.openfoodfacts.org/search?q=${enc}&page_size=30&fields=${FIELDS}`, 8000, signal);
  let products: any[] = fast?.hits ?? [];
  let reached = !!fast;
  if (!products.length && !signal?.aborted) {
    const classic = await getJson(`https://world.openfoodfacts.org/cgi/search.pl?search_terms=${enc}&search_simple=1&action=process&json=1&page_size=30&fields=${FIELDS}`, 9000, signal);
    products = classic?.products ?? [];
    reached = reached || !!classic;
  }
  if (!reached) return null;
  const seen = new Set<string>();
  const out: FoodItem[] = [];
  for (const p of products) {
    const item = fromProduct(p, 'online');
    if (!item || !item.hasNutrition) continue;
    const key = `${item.name.toLowerCase()}|${(item.brand || '').toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= 20) break;
  }
  return out;
}

// ─── Nutrition labels, read on the phone ─────────────────────────────────────
const MACRO_KEYS = ['kcal', 'protein', 'carbs', 'fat'] as const;
const toMacros = (m?: LabelMacros): Macros | undefined => (m && MACRO_KEYS.some(k => m[k] !== undefined)
  ? { kcal: m.kcal ?? 0, protein: m.protein ?? 0, carbs: m.carbs ?? 0, fat: m.fat ?? 0 } : undefined);

/** Reads a photo of a nutrition label: macros per 100 g and per serving, serving size, ingredients. */
export async function readLabelPhoto(uri: string): Promise<{ item: FoodItem; reading: LabelReading }> {
  const path = Platform.OS === 'android' && !/^(file|content):\/\//.test(uri) ? `file://${uri}` : uri;
  const ocr = await TextRecognition.recognize(path);
  const reading = readNutritionLabel(ocr as any);
  const item: FoodItem = {
    name: reading.name ?? '',
    per100: toMacros(reading.per100),
    perServing: toMacros(reading.perServing),
    servingGrams: reading.servingGrams,
    servingUnit: reading.servingUnit ?? 'serving',
    servingText: reading.servingText,
    unit: reading.unit,
    source: 'label',
    hasNutrition: reading.found > 0,
    ingredients: reading.ingredients.length ? reading.ingredients : undefined,
    allergens: reading.allergens,
    notes: reading.notes,
    label: { found: reading.found, confidence: reading.confidence, kcalFromMacros: reading.kcalFromMacros, servingsPerPack: reading.servingsPerPack },
  };
  return { item, reading };
}
