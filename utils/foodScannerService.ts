// utils/foodScannerService.ts
// 100% Free Internet Barcode Lookup (Open Food Facts - No API Key Needed) + Local SQLite Cache
// & Nutrition Label OCR (On-Device ML Kit - No API Key Needed)

import { Platform } from 'react-native';
import TextRecognition from '@react-native-ml-kit/text-recognition';
import { getSetting, setSetting } from '../db/database';

export interface ScannedFoodItem {
  name: string;
  brand?: string;
  caloriesPer100g: number;
  proteinPer100g: number;
  carbsPer100g?: number;
  fatPer100g?: number;
  caloriesPerServing?: number;
  proteinPerServing?: number;
  carbsPerServing?: number;
  fatPerServing?: number;
  servingSizeGrams?: number;
  servingUnitName?: string;
  source: 'barcode' | 'ai_label' | 'manual';
  barcode?: string;
  rawServingText?: string;
  hasNutritionData?: boolean;
}

export interface CalculatedMacros {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  grams: number;
  servingCount?: number;
  mode: 'grams' | 'servings';
}

/**
 * Get cached food item from local SQLite storage
 */
export function getCachedFood(barcode: string): ScannedFoodItem | null {
  try {
    const raw = getSetting(`food_barcode_${barcode.trim()}`, '');
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (_) {}
  return null;
}

/**
 * Cache food item in local SQLite storage
 */
export function saveFoodToCache(item: ScannedFoodItem): void {
  if (!item.barcode) return;
  try {
    setSetting(`food_barcode_${item.barcode.trim()}`, JSON.stringify(item));
  } catch (_) {}
}

/**
 * Fetch nutritional information from the public internet (Open Food Facts) with local cache fallback.
 * Zero API keys or subscriptions required - uses standard HTTPS fetch.
 */
export async function fetchFoodByBarcode(barcode: string): Promise<ScannedFoodItem | null> {
  const cleanCode = barcode.trim();
  if (!cleanCode) return null;

  // 1. Check local offline cache first
  const cached = getCachedFood(cleanCode);
  if (cached) {
    return cached;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 9000);

    let product: any = null;

    // 1. Try Open Food Facts API v2 via direct HTTPS fetch
    try {
      const urlV2 = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(cleanCode)}.json`;
      const response = await fetch(urlV2, {
        headers: {
          'User-Agent': 'GainQuestApp - Mobile - Version 1.0',
        },
        signal: controller.signal,
      });

      if (response.ok) {
        const data = await response.json();
        if (data && (data.status === 1 || data.product)) {
          product = data.product;
        }
      }
    } catch (_) {}

    // 2. Fallback to Open Food Facts API v0 if v2 didn't return
    if (!product) {
      try {
        const urlV0 = `https://world.openfoodfacts.org/api/v0/product/${encodeURIComponent(cleanCode)}.json`;
        const responseV0 = await fetch(urlV0, {
          headers: {
            'User-Agent': 'GainQuestApp - Mobile - Version 1.0',
          },
          signal: controller.signal,
        });

        if (responseV0.ok) {
          const dataV0 = await responseV0.json();
          if (dataV0 && (dataV0.status === 1 || dataV0.product)) {
            product = dataV0.product;
          }
        }
      } catch (_) {}
    }

    clearTimeout(timeoutId);

    if (!product) {
      return null;
    }
    const nutriments = product.nutriments || {};

    const name =
      product.product_name ||
      product.product_name_en ||
      product.generic_name ||
      product.brands ||
      'Scanned Food Item';

    const brand = product.brands || product.brand_owner || undefined;

    // Check if nutriments actually contain any nutritional fields in the database
    const hasNutrimentsInDb = Object.keys(nutriments).some(
      k => k.includes('energy') || k.includes('protein') || k.includes('carb') || k.includes('fat')
    );

    // Serving size extraction
    let servingGrams: number | undefined = Number(product.serving_quantity) || undefined;
    const servingStr: string = product.serving_size || '';
    let servingUnitName = 'serving';

    if (servingStr) {
      const matchGrams = servingStr.match(/(\d+(?:\.\d+)?)\s*(?:g|ml|gram|grams)/i);
      if (matchGrams) {
        servingGrams = parseFloat(matchGrams[1]);
      }
      if (/scoop/i.test(servingStr)) servingUnitName = 'scoop';
      else if (/bar/i.test(servingStr)) servingUnitName = 'bar';
      else if (/bottle|can/i.test(servingStr)) servingUnitName = 'bottle';
      else if (/biscuit|cookie/i.test(servingStr)) servingUnitName = 'biscuit';
      else if (/pack|packet/i.test(servingStr)) servingUnitName = 'pack';
      else if (/cup|mug/i.test(servingStr)) servingUnitName = 'cup';
      else if (/tsp|teaspoon/i.test(servingStr)) servingUnitName = 'tsp';
      else if (/tbsp|tablespoon/i.test(servingStr)) servingUnitName = 'tbsp';
    }

    // Smart default serving size if not in database
    if (!servingGrams) {
      if (/coffee|instant coffee|espresso/i.test(name)) {
        servingGrams = 2; // Standard 2g serving for instant coffee
        servingUnitName = 'tsp';
      } else if (/tea\b/i.test(name)) {
        servingGrams = 2;
        servingUnitName = 'cup';
      }
    }

    // Energy / Calories (per 100g)
    let calories100g = Number(nutriments['energy-kcal_100g']);
    if (isNaN(calories100g) || calories100g === undefined) {
      calories100g = Number(nutriments['energy-kcal_value']);
    }
    if (isNaN(calories100g) || calories100g === undefined) {
      calories100g = Number(nutriments['energy-kcal']);
    }
    if (isNaN(calories100g) || calories100g === undefined) {
      // Check if general energy is kcal or kJ
      if (nutriments['energy_unit'] === 'kcal') {
        calories100g = Number(nutriments['energy_100g'] ?? nutriments['energy_value'] ?? nutriments['energy']);
      } else {
        const kj = Number(nutriments['energy-kj_100g'] ?? nutriments['energy_100g'] ?? nutriments['energy_value'] ?? nutriments['energy']) || 0;
        calories100g = kj > 0 ? Math.round(kj / 4.184) : 0;
      }
    }
    calories100g = Math.max(0, Math.round(calories100g || 0));

    // Energy / Calories (per serving)
    let caloriesServing = Number(nutriments['energy-kcal_serving']);
    if (isNaN(caloriesServing) || caloriesServing === undefined) {
      const kjServing = Number(nutriments['energy-kj_serving'] ?? nutriments['energy_serving']) || 0;
      caloriesServing = kjServing > 0 ? Math.round(kjServing / 4.184) : 0;
    }
    caloriesServing = Math.max(0, Math.round(caloriesServing || 0));

    // Protein
    let protein100g = Number(nutriments['proteins_100g'] ?? nutriments['proteins_value'] ?? nutriments['proteins'] ?? 0);
    protein100g = Math.max(0, isNaN(protein100g) ? 0 : protein100g);

    let proteinServing = Number(nutriments['proteins_serving'] ?? 0);
    proteinServing = Math.max(0, isNaN(proteinServing) ? 0 : proteinServing);

    // Carbs
    let carbs100g = Number(nutriments['carbohydrates_100g'] ?? nutriments['carbohydrates_value'] ?? nutriments['carbohydrates'] ?? 0);
    carbs100g = Math.max(0, isNaN(carbs100g) ? 0 : carbs100g);
    let carbsServing = Number(nutriments['carbohydrates_serving'] ?? 0);
    carbsServing = Math.max(0, isNaN(carbsServing) ? 0 : carbsServing);

    // Fat
    let fat100g = Number(nutriments['fat_100g'] ?? nutriments['fat_value'] ?? nutriments['fat'] ?? 0);
    fat100g = Math.max(0, isNaN(fat100g) ? 0 : fat100g);
    let fatServing = Number(nutriments['fat_serving'] ?? 0);
    fatServing = Math.max(0, isNaN(fatServing) ? 0 : fatServing);

    // Cross-derivation if 100g is 0 but serving exists
    if (servingGrams && servingGrams > 0) {
      if (calories100g === 0 && caloriesServing > 0) {
        calories100g = Math.round((caloriesServing / servingGrams) * 100);
      }
      if (protein100g === 0 && proteinServing > 0) {
        protein100g = Number(((proteinServing / servingGrams) * 100).toFixed(1));
      }
      if (carbs100g === 0 && carbsServing > 0) {
        carbs100g = Number(((carbsServing / servingGrams) * 100).toFixed(1));
      }
      if (fat100g === 0 && fatServing > 0) {
        fat100g = Number(((fatServing / servingGrams) * 100).toFixed(1));
      }

      // Conversely, derive serving values if 100g exists but serving is missing
      if (caloriesServing === 0 && calories100g > 0) {
        caloriesServing = Math.round((calories100g * servingGrams) / 100);
      }
      if (proteinServing === 0 && protein100g > 0) {
        proteinServing = Number(((protein100g * servingGrams) / 100).toFixed(1));
      }
      if (carbsServing === 0 && carbs100g > 0) {
        carbsServing = Number(((carbs100g * servingGrams) / 100).toFixed(1));
      }
      if (fatServing === 0 && fat100g > 0) {
        fatServing = Number(((fat100g * servingGrams) / 100).toFixed(1));
      }
    }

    const item: ScannedFoodItem = {
      name,
      brand,
      caloriesPer100g: calories100g,
      proteinPer100g: Number(protein100g.toFixed(1)),
      carbsPer100g: Number(carbs100g.toFixed(1)),
      fatPer100g: Number(fat100g.toFixed(1)),
      caloriesPerServing: caloriesServing > 0 ? caloriesServing : undefined,
      proteinPerServing: proteinServing > 0 ? Number(proteinServing.toFixed(1)) : undefined,
      carbsPerServing: carbsServing > 0 ? Number(carbsServing.toFixed(1)) : undefined,
      fatPerServing: fatServing > 0 ? Number(fatServing.toFixed(1)) : undefined,
      servingSizeGrams: servingGrams || 30,
      servingUnitName,
      source: 'barcode',
      barcode: cleanCode,
      rawServingText: servingStr || undefined,
      hasNutritionData: hasNutrimentsInDb,
    };

    // Save to local cache
    saveFoodToCache(item);

    return item;
  } catch (error) {
    console.error('Error fetching Open Food Facts barcode:', error);
    return null;
  }
}

/**
 * Parse a nutrition label completely ON-DEVICE using Google ML Kit (Zero API key required!)
 */
export async function parseNutritionLabelOnDevice(
  imageUri: string
): Promise<ScannedFoodItem> {
  try {
    const cleanUri =
      Platform.OS === 'android' && !imageUri.startsWith('file://') && !imageUri.startsWith('content://')
        ? `file://${imageUri}`
        : imageUri;

    const result = await TextRecognition.recognize(cleanUri);
    const fullText = result.text || '';
    const lines = fullText.split('\n').map(l => l.trim()).filter(Boolean);

    let calories = 0;
    let protein = 0;
    let carbs = 0;
    let fat = 0;
    let servingSizeGrams = 30;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const nextLine = i + 1 < lines.length ? lines[i + 1] : '';
      const combined = `${line} ${nextLine}`;

      // 1. Calories / Energy
      if (calories === 0) {
        const calMatch =
          line.match(/(?:energy|calories|calorie|kcal)\D{0,15}?(\d{2,4})\s*(?:kcal|cal)?/i) ||
          combined.match(/(?:energy|calories|calorie|kcal)\D{0,15}?(\d{2,4})\s*(?:kcal|cal)?/i);
        if (calMatch) {
          const val = parseInt(calMatch[1], 10);
          if (val >= 10 && val <= 1000) {
            calories = val;
          }
        }
      }

      // 2. Protein
      if (protein === 0) {
        const protMatch =
          line.match(/(?:protein|proteins|prot)\D{0,15}?(\d+(?:\.\d+)?)\s*g?/i) ||
          combined.match(/(?:protein|proteins|prot)\D{0,15}?(\d+(?:\.\d+)?)\s*g?/i);
        if (protMatch) {
          const val = parseFloat(protMatch[1]);
          if (val >= 0 && val <= 100) {
            protein = Number(val.toFixed(1));
          }
        }
      }

      // 3. Carbs
      if (carbs === 0) {
        const carbMatch =
          line.match(/(?:carbohydrate|carbohydrates|total carb|carbs)\D{0,15}?(\d+(?:\.\d+)?)\s*g?/i) ||
          combined.match(/(?:carbohydrate|carbohydrates|total carb|carbs)\D{0,15}?(\d+(?:\.\d+)?)\s*g?/i);
        if (carbMatch) {
          const val = parseFloat(carbMatch[1]);
          if (val >= 0 && val <= 100) {
            carbs = Number(val.toFixed(1));
          }
        }
      }

      // 4. Fat
      if (fat === 0) {
        const fatMatch =
          line.match(/(?:total fat|fat|lipids)\D{0,15}?(\d+(?:\.\d+)?)\s*g?/i) ||
          combined.match(/(?:total fat|fat|lipids)\D{0,15}?(\d+(?:\.\d+)?)\s*g?/i);
        if (fatMatch) {
          const val = parseFloat(fatMatch[1]);
          if (val >= 0 && val <= 100) {
            fat = Number(val.toFixed(1));
          }
        }
      }

      // 5. Serving size
      const servMatch = line.match(/(?:serving size|per serving|portion)\D{0,15}?(\d+(?:\.\d+)?)\s*(?:g|gram)/i);
      if (servMatch) {
        const sVal = parseFloat(servMatch[1]);
        if (sVal > 0 && sVal <= 500) {
          servingSizeGrams = Math.round(sVal);
        }
      }
    }

    // Extract product name
    let detectedName = 'Nutrition Label Item';
    for (const l of lines) {
      if (l.length >= 3 && l.length <= 35 && !/nutrition|facts|information|typical|values|per 100|ingredients|declaration/i.test(l)) {
        detectedName = l;
        break;
      }
    }

    return {
      name: detectedName,
      caloriesPer100g: calories,
      proteinPer100g: protein,
      carbsPer100g: carbs,
      fatPer100g: fat,
      caloriesPerServing: calories > 0 ? Math.round((calories * servingSizeGrams) / 100) : undefined,
      proteinPerServing: protein > 0 ? Number(((protein * servingSizeGrams) / 100).toFixed(1)) : undefined,
      servingSizeGrams,
      source: 'ai_label',
    };
  } catch (err: any) {
    console.error('On-device OCR error:', err);
    throw new Error('Could not read nutrition text on this photo. Please hold steady and align clearly.');
  }
}

/**
 * Calculate dynamic macros based on grams OR serving count
 */
export function calculatePortionMacros(
  item: ScannedFoodItem,
  portionValue: number,
  mode: 'grams' | 'servings' = 'grams'
): CalculatedMacros {
  const servingGrams = item.servingSizeGrams || 30;

  if (mode === 'servings') {
    const servings = Math.max(0.1, isNaN(portionValue) ? 1 : portionValue);
    const totalGrams = Math.round(servings * servingGrams);
    const baseCalServ = item.caloriesPerServing ?? Math.round((item.caloriesPer100g * servingGrams) / 100);
    const baseProtServ = item.proteinPerServing ?? Number(((item.proteinPer100g * servingGrams) / 100).toFixed(1));
    const baseCarbServ = item.carbsPerServing ?? Number((((item.carbsPer100g || 0) * servingGrams) / 100).toFixed(1));
    const baseFatServ = item.fatPerServing ?? Number((((item.fatPer100g || 0) * servingGrams) / 100).toFixed(1));

    return {
      calories: Math.round(baseCalServ * servings),
      protein: Number((baseProtServ * servings).toFixed(1)),
      carbs: Number((baseCarbServ * servings).toFixed(1)),
      fat: Number((baseFatServ * servings).toFixed(1)),
      grams: totalGrams,
      servingCount: servings,
      mode: 'servings',
    };
  }

  // mode === 'grams'
  const safeGrams = Math.max(1, isNaN(portionValue) ? 30 : portionValue);
  const factor = safeGrams / 100;

  return {
    calories: Math.round(item.caloriesPer100g * factor),
    protein: Number((item.proteinPer100g * factor).toFixed(1)),
    carbs: Number(((item.carbsPer100g || 0) * factor).toFixed(1)),
    fat: Number(((item.fatPer100g || 0) * factor).toFixed(1)),
    grams: safeGrams,
    servingCount: Number((safeGrams / servingGrams).toFixed(2)),
    mode: 'grams',
  };
}

/**
 * Search foods from Open Food Facts open-web database (100% free, zero API key)
 */
export async function searchFoodOnline(query: string): Promise<ScannedFoodItem[]> {
  const clean = query.trim();
  if (!clean || clean.length < 2) return [];

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(clean)}&search_simple=1&action=process&json=1&page_size=25`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'GainQuest-Mobile/1.0 (contact: mobile-app)' },
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) return [];

    const data = await res.json();
    const products = data.products || [];

    const results: ScannedFoodItem[] = [];

    for (const p of products) {
      const name = p.product_name || p.product_name_en;
      if (!name || name.trim().length === 0) continue;

      const n = p.nutriments || {};
      const kcal100 = Number(n['energy-kcal_100g'] ?? n['energy-kcal'] ?? 0);
      const prot100 = Number(n.proteins_100g ?? n.proteins ?? 0);
      const carbs100 = Number(n.carbohydrates_100g ?? n.carbohydrates ?? 0);
      const fat100 = Number(n.fat_100g ?? n.fat ?? 0);

      // Serving calculation
      let servingGrams = 100;
      if (typeof p.serving_quantity === 'number' && p.serving_quantity > 0) {
        servingGrams = p.serving_quantity;
      } else if (p.serving_size) {
        const match = String(p.serving_size).match(/(\d+(?:\.\d+)?)\s*(?:g|ml)/i);
        if (match) servingGrams = parseFloat(match[1]);
      }

      const hasNutrition = (kcal100 > 0 || prot100 > 0 || carbs100 > 0 || fat100 > 0);

      results.push({
        name: name.trim(),
        brand: p.brands ? p.brands.trim() : undefined,
        barcode: p.code,
        caloriesPer100g: Math.round(kcal100),
        proteinPer100g: Number(prot100.toFixed(1)),
        carbsPer100g: Number(carbs100.toFixed(1)),
        fatPer100g: Number(fat100.toFixed(1)),
        servingSizeGrams: servingGrams,
        caloriesPerServing: n['energy-kcal_serving'] ? Math.round(Number(n['energy-kcal_serving'])) : (hasNutrition ? Math.round((kcal100 * servingGrams) / 100) : undefined),
        proteinPerServing: n.proteins_serving ? Number(Number(n.proteins_serving).toFixed(1)) : (hasNutrition ? Number(((prot100 * servingGrams) / 100).toFixed(1)) : undefined),
        carbsPerServing: n.carbohydrates_serving ? Number(Number(n.carbohydrates_serving).toFixed(1)) : (hasNutrition ? Number(((carbs100 * servingGrams) / 100).toFixed(1)) : undefined),
        fatPerServing: n.fat_serving ? Number(Number(n.fat_serving).toFixed(1)) : (hasNutrition ? Number(((fat100 * servingGrams) / 100).toFixed(1)) : undefined),
        source: 'barcode',
        hasNutritionData: hasNutrition,
      });
    }

    return results;
  } catch (err) {
    console.warn('Food search failed:', err);
    return [];
  }
}

