// utils/geminiParser.ts
// 100% Free On-Device & Open-Web Assistant for workouts, nutrition logging, and fitness Q&A.
// Zero API keys required!

import { ParsedExercise, ParseResult, parseWorkoutText } from './workoutParser';

// ── Types ─────────────────────────────────────────────────────────────────────
export interface ParsedFoodItem {
  food_name: string;
  protein: number;
  calories: number;
}

export interface AIWorkoutResult {
  intent: 'workout';
  exercises: ParsedExercise[];
  raw: string;
  confidence: 'high' | 'medium' | 'low';
  error?: string;
}

export interface AINutritionResult {
  intent: 'nutrition';
  items: ParsedFoodItem[];
  totalProtein: number;
  totalCalories: number;
  raw: string;
  confidence: 'high' | 'medium' | 'low';
  error?: string;
}

export interface AIChatResult {
  intent: 'chat';
  answer: string;
  topic?: string;
  raw: string;
  confidence: 'high' | 'medium' | 'low';
  error?: string;
}

export type AIUnifiedResult = AIWorkoutResult | AINutritionResult | AIChatResult;

// ── Muscle group resolver ─────────────────────────────────────────────────────
const MUSCLE_MAP: Record<string, string> = {
  'bench press': 'Chest', 'incline bench press': 'Chest', 'decline bench press': 'Chest',
  'dumbbell fly': 'Chest', 'push up': 'Chest', 'cable crossover': 'Chest', 'pec deck': 'Chest',
  'chest dip': 'Chest', 'close grip bench press': 'Chest', 'chest press': 'Chest',
  'squat': 'Legs', 'front squat': 'Legs', 'hack squat': 'Legs', 'leg press': 'Legs',
  'lunges': 'Legs', 'leg curl': 'Legs', 'leg extension': 'Legs', 'calf raise': 'Legs',
  'bulgarian split squat': 'Legs', 'romanian deadlift': 'Legs', 'rdl': 'Legs',
  'deadlift': 'Back', 'bent over row': 'Back', 'pull up': 'Back', 'chin up': 'Back',
  'lat pulldown': 'Back', 'seated cable row': 'Back', 'face pull': 'Back',
  'shrugs': 'Back', 'muscle up': 'Back', 'dead hang': 'Back', 'barbell row': 'Back',
  'overhead press': 'Shoulders', 'lateral raise': 'Shoulders', 'rear delt fly': 'Shoulders',
  'upright row': 'Shoulders', 'arnold press': 'Shoulders', 'shoulder press': 'Shoulders',
  'barbell curl': 'Biceps', 'dumbbell curl': 'Biceps', 'hammer curl': 'Biceps',
  'preacher curl': 'Biceps', 'spider curl': 'Biceps', 'incline dumbbell curl': 'Biceps',
  'concentration curl': 'Biceps', 'bicep curl': 'Biceps',
  'tricep pushdown': 'Triceps', 'skull crusher': 'Triceps', 'tricep dip': 'Triceps',
  'overhead tricep extension': 'Triceps', 'close grip bench': 'Triceps', 'tricep extension': 'Triceps',
  'plank': 'Core', 'crunch': 'Core', 'leg raise': 'Core', 'russian twist': 'Core',
  'ab wheel rollout': 'Core', 'hollow body': 'Core', 'sit up': 'Core',
};

function resolveMuscle(exerciseName: string, suggested?: string): string {
  if (suggested && ['Chest', 'Back', 'Legs', 'Shoulders', 'Biceps', 'Triceps', 'Core'].includes(suggested)) {
    return suggested;
  }
  const lower = exerciseName.toLowerCase().trim();
  if (MUSCLE_MAP[lower]) return MUSCLE_MAP[lower];
  for (const [key, muscle] of Object.entries(MUSCLE_MAP)) {
    if (lower.includes(key) || key.includes(lower)) return muscle;
  }
  return 'Other';
}

function capitalizeWords(name: string): string {
  return name.trim().replace(/\b\w/g, c => c.toUpperCase());
}


// ── Common staple foods dictionary for 100% Free On-Device Nutrition Logging ──
interface StapleFoodInfo {
  cal: number;
  prot: number;
  per100g?: boolean;
  unitName?: string;
  defaultGrams?: number;
}

const STAPLE_NUTRITION: Record<string, StapleFoodInfo> = {
  // Eggs
  'egg': { cal: 72, prot: 6.3, unitName: 'egg' },
  'eggs': { cal: 72, prot: 6.3, unitName: 'eggs' },
  'boiled egg': { cal: 78, prot: 6.3, unitName: 'egg' },
  'boiled eggs': { cal: 78, prot: 6.3, unitName: 'eggs' },
  'egg white': { cal: 17, prot: 3.6, unitName: 'egg white' },
  'egg whites': { cal: 17, prot: 3.6, unitName: 'egg whites' },
  'scrambled egg': { cal: 95, prot: 6.5, unitName: 'egg' },
  'scrambled eggs': { cal: 95, prot: 6.5, unitName: 'eggs' },
  'omelette': { cal: 154, prot: 11, unitName: 'serving' },

  // Meat & Poultry
  'chicken': { cal: 165, prot: 31, per100g: true, unitName: '100g', defaultGrams: 150 },
  'chicken breast': { cal: 165, prot: 31, per100g: true, unitName: '100g', defaultGrams: 150 },
  'chicken thigh': { cal: 209, prot: 26, per100g: true, unitName: '100g', defaultGrams: 150 },
  'turkey': { cal: 145, prot: 30, per100g: true, unitName: '100g', defaultGrams: 150 },
  'beef': { cal: 250, prot: 26, per100g: true, unitName: '100g', defaultGrams: 150 },
  'ground beef': { cal: 250, prot: 26, per100g: true, unitName: '100g', defaultGrams: 150 },
  'steak': { cal: 271, prot: 26, per100g: true, unitName: '100g', defaultGrams: 200 },
  'salmon': { cal: 208, prot: 20, per100g: true, unitName: '100g', defaultGrams: 150 },
  'tuna': { cal: 132, prot: 28, per100g: true, unitName: '100g', defaultGrams: 120 },
  'fish': { cal: 130, prot: 22, per100g: true, unitName: '100g', defaultGrams: 150 },

  // Dairy & Vegetarian Protein
  'paneer': { cal: 265, prot: 18.3, per100g: true, unitName: '100g', defaultGrams: 100 },
  'cottage cheese': { cal: 98, prot: 11, per100g: true, unitName: '100g', defaultGrams: 150 },
  'tofu': { cal: 76, prot: 8, per100g: true, unitName: '100g', defaultGrams: 100 },
  'whey': { cal: 120, prot: 24, unitName: 'scoop' },
  'whey protein': { cal: 120, prot: 24, unitName: 'scoop' },
  'protein shake': { cal: 150, prot: 25, unitName: 'shake' },
  'protein powder': { cal: 120, prot: 24, unitName: 'scoop' },
  'milk': { cal: 150, prot: 8, unitName: 'cup (250ml)' },
  'yogurt': { cal: 120, prot: 10, unitName: 'cup' },
  'greek yogurt': { cal: 100, prot: 17, unitName: 'cup' },
  'curd': { cal: 98, prot: 11, unitName: 'cup' },
  'cheese': { cal: 110, prot: 7, unitName: 'slice' },

  // Grains & Carbs
  'rice': { cal: 130, prot: 2.7, per100g: true, unitName: '100g cooked', defaultGrams: 150 },
  'white rice': { cal: 130, prot: 2.7, per100g: true, unitName: '100g cooked', defaultGrams: 150 },
  'brown rice': { cal: 111, prot: 2.6, per100g: true, unitName: '100g cooked', defaultGrams: 150 },
  'oats': { cal: 150, prot: 5, unitName: 'bowl (40g dry)' },
  'oatmeal': { cal: 150, prot: 5, unitName: 'bowl' },
  'bread': { cal: 80, prot: 3, unitName: 'slice' },
  'toast': { cal: 80, prot: 3, unitName: 'slice' },
  'roti': { cal: 85, prot: 3, unitName: 'roti' },
  'chapati': { cal: 85, prot: 3, unitName: 'chapati' },
  'dal': { cal: 150, prot: 9, unitName: 'bowl' },
  'lentils': { cal: 150, prot: 9, unitName: 'bowl' },
  'pasta': { cal: 200, prot: 7, unitName: 'bowl' },
  'potato': { cal: 160, prot: 4, unitName: 'medium potato' },
  'sweet potato': { cal: 112, prot: 2, unitName: 'medium potato' },

  // Fruits, Spreads & Snacks
  'banana': { cal: 105, prot: 1.3, unitName: 'banana' },
  'bananas': { cal: 105, prot: 1.3, unitName: 'bananas' },
  'apple': { cal: 95, prot: 0.5, unitName: 'apple' },
  'apples': { cal: 95, prot: 0.5, unitName: 'apples' },
  'peanut butter': { cal: 95, prot: 4, unitName: 'tbsp' },
  'almonds': { cal: 160, prot: 6, unitName: 'handful (28g)' },
  'nuts': { cal: 160, prot: 5, unitName: 'handful' },
  'pizza': { cal: 280, prot: 12, unitName: 'slice' },
  'burger': { cal: 450, prot: 20, unitName: 'burger' },
  'sandwich': { cal: 320, prot: 15, unitName: 'sandwich' },
};

/**
 * Extract nutrition data without an API key using on-device rules + public internet lookup
 */
async function parseNutritionFree(raw: string): Promise<AINutritionResult | null> {
  const lower = raw.toLowerCase().trim();

  // Check if user spoke specific protein or calories (e.g. "30g protein", "500 cals")
  let userProt: number | null = null;
  let userCals: number | null = null;

  const protMatch = lower.match(/(\d+(?:\.\d+)?)\s*(?:g|grams)?\s*(?:of\s*)?protein/i);
  if (protMatch) userProt = parseFloat(protMatch[1]);

  const calMatch = lower.match(/(\d+)\s*(?:kcal|cals|calories)/i);
  if (calMatch) userCals = parseInt(calMatch[1], 10);

  // Split into individual food segments
  const segments = lower
    .replace(/^i\s+(?:ate|had|eaten|have|drank|logged)\s+/i, '')
    .replace(/^(?:ate|had|drank|logged|eating|have)\s+/i, '')
    .split(/\s*(?:,\s*(?:and\s*)?|and\s+|\+\s*|\bthen\s+)/);

  const items: ParsedFoodItem[] = [];

  for (let seg of segments) {
    seg = seg.trim();
    if (!seg) continue;

    // Detect quantity e.g. "2 eggs", "200g chicken", "3 slices bread", "1 scoop whey"
    let qty = 1;
    let customGrams: number | null = null;

    const gramsMatch = seg.match(/(\d+(?:\.\d+)?)\s*(?:g|grams)\b/i);
    if (gramsMatch) {
      customGrams = parseFloat(gramsMatch[1]);
    }

    const qtyMatch = seg.match(/^(\d+(?:\.\d+)?)\s+/);
    if (qtyMatch && !customGrams) {
      qty = parseFloat(qtyMatch[1]);
    } else {
      // Word numbers
      if (/\b(?:two|a couple)\b/i.test(seg)) qty = 2;
      else if (/\bthree\b/i.test(seg)) qty = 3;
      else if (/\bfour\b/i.test(seg)) qty = 4;
      else if (/\bfive\b/i.test(seg)) qty = 5;
    }

    // Match against staple food table
    let matched = false;
    for (const [key, info] of Object.entries(STAPLE_NUTRITION)) {
      if (seg.includes(key)) {
        let cal = 0;
        let prot = 0;
        let displayName = '';

        if (info.per100g) {
          const grams = customGrams || (qty > 1 ? qty * 100 : info.defaultGrams || 100);
          cal = Math.round((info.cal * grams) / 100);
          prot = Number(((info.prot * grams) / 100).toFixed(1));
          displayName = `${capitalizeWords(key)} (${grams}g)`;
        } else {
          cal = Math.round(info.cal * qty);
          prot = Number((info.prot * qty).toFixed(1));
          displayName = `${qty > 1 ? qty + ' ' : ''}${capitalizeWords(info.unitName || key)}`;
        }

        items.push({
          food_name: displayName,
          protein: prot,
          calories: cal,
        });
        matched = true;
        break;
      }
    }

    // If not in staple dictionary, try fetching free public internet food lookup
    if (!matched) {
      const cleanTerm = seg
        .replace(/\d+(?:\.\d+)?\s*(?:g|grams|kg|ml)?/gi, '')
        .replace(/cup|bowl|slice|scoop|piece|handful/gi, '')
        .trim();

      if (cleanTerm.length >= 2) {
        try {
          const controller = new AbortController();
          const tId = setTimeout(() => controller.abort(), 4000);
          const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(cleanTerm)}&search_simple=1&action=process&json=1`;
          const res = await fetch(url, {
            headers: { 'User-Agent': 'GainQuest - Mobile - 1.0' },
            signal: controller.signal,
          });
          clearTimeout(tId);

          if (res.ok) {
            const data = await res.json();
            const product = data.products?.[0];
            if (product && product.nutriments) {
              const kcal100 = Number(product.nutriments['energy-kcal_100g'] ?? product.nutriments['energy-kcal'] ?? 100);
              const prot100 = Number(product.nutriments.proteins_100g ?? product.nutriments.proteins ?? 5);
              const portionGrams = customGrams || 100;

              items.push({
                food_name: `${capitalizeWords(product.product_name || cleanTerm)} (${portionGrams}g)`,
                protein: Number(((prot100 * portionGrams) / 100).toFixed(1)),
                calories: Math.round((kcal100 * portionGrams) / 100),
              });
              matched = true;
            }
          }
        } catch (_) {}
      }

      if (!matched && cleanTerm.length >= 2) {
        // Fallback generic estimate
        items.push({
          food_name: capitalizeWords(cleanTerm),
          protein: 5,
          calories: 150,
        });
      }
    }
  }

  // If user provided exact totals, override or distribute them
  if (items.length > 0) {
    if (userProt !== null && items.length === 1) {
      items[0].protein = userProt;
    }
    if (userCals !== null && items.length === 1) {
      items[0].calories = userCals;
    }

    const totalProtein = userProt !== null ? userProt : Number(items.reduce((s, i) => s + i.protein, 0).toFixed(1));
    const totalCalories = userCals !== null ? userCals : items.reduce((s, i) => s + i.calories, 0);

    return {
      intent: 'nutrition',
      items,
      totalProtein,
      totalCalories,
      raw,
      confidence: 'high',
    };
  }

  return null;
}

/**
 * Live internet Q&A using DuckDuckGo Instant Answer API + Wikipedia API with auto-correction & intro extraction (100% free, zero API key required).
 */
async function fetchLiveAnswer(query: string): Promise<{ answer: string; topic: string } | null> {
  // Normalize query: remove conversational prefixes to isolate core search topic
  const clean = query
    .replace(/^(what is the best way to|what is the best|what is the proper way to|how to do a|how to do|how do i do a|how do i do|how do i|how can i|best way to do a|best way to|best way for|ways to do|proper way to do a|proper way to|what is a|what are|what is|tell me about|explain|guide for|tips on|tips for|how much|how many)\s+/i, '')
    .replace(/[?!.]+$/, '')
    .trim();

  // 1. Wikipedia Search API with Auto-Suggestion & Intro Extraction
  try {
    async function searchWiki(term: string) {
      try {
        const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(term)}&srinfo=suggestion&format=json&origin=*&srlimit=6`;
        const res = await fetch(url, { headers: { 'User-Agent': 'GainQuestFitness/1.0 (fitness assistant)' } });
        if (!res.ok) return { hits: [] as any[], suggestion: null as string | null };
        const d = await res.json();
        return { hits: (d.query?.search || []) as any[], suggestion: (d.query?.searchinfo?.suggestion || null) as string | null };
      } catch {
        return { hits: [] as any[], suggestion: null as string | null };
      }
    }

    let { hits, suggestion } = await searchWiki(clean || query);
    let allHits: any[] = [];
    if (suggestion) {
      const sugRes = await searchWiki(suggestion);
      allHits.push(...sugRes.hits);
    }
    allHits.push(...hits);

    if (allHits.length === 0 && clean !== query) {
      const rawRes = await searchWiki(query);
      if (rawRes.suggestion) {
        const rawSug = await searchWiki(rawRes.suggestion);
        allHits.push(...rawSug.hits);
      }
      allHits.push(...rawRes.hits);
    }

    const fitnessKeywords = ['exercise', 'muscle', 'strength', 'training', 'bodybuilding', 'fitness', 'weight', 'nutrition', 'diet', 'protein', 'food', 'supplement', 'workout', 'movement', 'sport', 'health', 'calisthenics', 'lift', 'physique'];
    const penalizeList = ['album', 'song', 'band', 'film', 'movie', 'novel', 'series', 'politician', 'language', 'village', 'commune', 'county', 'railway', 'station', 'discography', 'episode'];

    function scoreHit(h: any) {
      let score = 0;
      const t = (h.title || '').toLowerCase();
      const s = (h.snippet || '').toLowerCase();
      const c = (clean || query).toLowerCase();

      if (t === c) score += 60;
      if (suggestion && t === suggestion.toLowerCase()) score += 60;
      if (c.split(/\s+/).every(w => t.includes(w))) score += 30;

      for (const kw of fitnessKeywords) {
        if (t.includes(kw)) score += 15;
        if (s.includes(kw)) score += 5;
      }
      for (const p of penalizeList) {
        if (t.includes(`(${p})`) || t.includes(p)) score -= 40;
      }
      return score;
    }

    const seen = new Set<number>();
    const unique: any[] = [];
    for (const h of allHits) {
      if (!seen.has(h.pageid)) {
        seen.add(h.pageid);
        unique.push(h);
      }
    }
    unique.sort((a, b) => scoreHit(b) - scoreHit(a));

    for (const h of unique.slice(0, 4)) {
      // Try explaintext intro API
      try {
        const extUrl = `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&exintro=1&titles=${encodeURIComponent(h.title)}&format=json&origin=*`;
        const extRes = await fetch(extUrl, { headers: { 'User-Agent': 'GainQuestFitness/1.0 (fitness assistant)' } });
        if (extRes.ok) {
          const data = await extRes.json();
          const pages = data.query?.pages || {};
          const pId = Object.keys(pages)[0];
          if (pId && pId !== '-1') {
            const extract = (pages[pId]?.extract || '').trim();
            if (extract.length > 50 && !extract.toLowerCase().includes('may refer to:')) {
              return {
                topic: pages[pId].title || h.title,
                answer: extract,
              };
            }
          }
        }
      } catch (_) {}

      // Fallback to Wikipedia REST summary API
      try {
        const sumUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(h.title)}`;
        const sumRes = await fetch(sumUrl, { headers: { 'User-Agent': 'GainQuestFitness/1.0 (fitness assistant)' } });
        if (sumRes.ok) {
          const sum = await sumRes.json();
          if (sum.type !== 'disambiguation' && sum.extract && sum.extract.trim().length > 50) {
            return {
              topic: sum.title || h.title,
              answer: sum.extract.trim(),
            };
          }
        }
      } catch (_) {}
    }
  } catch (_) {}

  // 2. DuckDuckGo Instant Answer API Fallback
  try {
    const controller = new AbortController();
    const tId = setTimeout(() => controller.abort(), 4000);
    const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(clean || query)}&format=json&no_html=1&skip_disambig=1`;
    const res = await fetch(ddgUrl, { signal: controller.signal });
    clearTimeout(tId);

    if (res.ok) {
      const data = await res.json();
      if (data.AbstractText && data.AbstractText.trim().length > 40) {
        return {
          topic: data.Heading || clean || query,
          answer: data.AbstractText.trim() + (data.AbstractSource ? ` (Source: ${data.AbstractSource})` : ''),
        };
      }
      if (data.Answer && data.Answer.trim().length > 10) {
        return {
          topic: data.Heading || clean || query,
          answer: data.Answer.trim(),
        };
      }
    }
  } catch (_) {}

  return null;
}

/**
 * Curated Evidence-Based Fitness Q&A Knowledge Engine (instant, offline)
 */
function getFitnessLocalAnswer(raw: string): AIChatResult | null {
  const lower = raw.toLowerCase().trim();

  // ── Pull-ups & Chin-ups ───────────────────────────────────────────────────
  if (
    lower.includes('pull up') || lower.includes('pullup') || lower.includes('pull-up') ||
    lower.includes('pyll up') || lower.includes('pyllup') || lower.includes('chin up') || lower.includes('chinup')
  ) {
    return {
      intent: 'chat',
      topic: 'Pull-Up Technique & Progression',
      answer: 'The best way to do a pull-up:\n\n1. Setup: Grip the bar with an overhand grip slightly wider than shoulder-width.\n2. Engage: Start from a full dead hang. Pull your shoulder blades down and back (scapular depression) before bending your elbows.\n3. Pull: Drive your elbows down and back toward your ribs, lifting your chest toward the bar until your chin clears it.\n4. Lower: Control the descent over 2–3 seconds back to a dead hang.\n\nProgression to your first pull-up:\n• Dead hangs (3 sets of 20–30s to build grip & shoulder stability)\n• Scapular pull-ups (3 sets of 8–10 reps)\n• Negative pull-ups (jump to the top, lower slowly for 4–5s, 3x5 reps)\n• Band-assisted pull-ups or Lat Pulldowns to build foundational pulling strength.',
      raw,
      confidence: 'high',
    };
  }

  // ── Push-ups ──────────────────────────────────────────────────────────────
  if (lower.includes('push up') || lower.includes('pushup') || lower.includes('push-up')) {
    return {
      intent: 'chat',
      topic: 'Push-Up Form & Technique',
      answer: 'Proper push-up technique:\n\n1. Setup: Hands slightly wider than shoulder-width, fingers spread, body in a rigid straight line (plank position).\n2. Elbow Path: Keep your elbows at a 45-degree angle to your torso (avoid flaring elbows out at 90 degrees).\n3. Depth: Lower your chest until it is about an inch from the floor, keeping your glutes and abs squeezed tight.\n4. Press: Push the floor away through your palms to full lockout, spreading your shoulder blades at the top.\n\nProgression: Incline push-ups (hands on bench/wall) → Knee push-ups → Standard push-ups → Deficit or weighted push-ups.',
      raw,
      confidence: 'high',
    };
  }

  // ── Bench Press ───────────────────────────────────────────────────────────
  if (lower.includes('bench press') || lower.includes('chest press')) {
    return {
      intent: 'chat',
      topic: 'Bench Press Technique',
      answer: 'Key cues for a safe, strong bench press:\n\n1. Setup: Eyes directly under the barbell, plant feet firmly into the floor.\n2. Arch & Retract: Pull your shoulder blades back and down into the bench to protect your rotator cuffs and create a solid base.\n3. Grip: Grip the bar slightly wider than shoulder-width, wrapping thumbs around.\n4. Descent: Unrack and lower the bar in a slight arc to your lower chest/sternum, keeping elbows tucked at ~45–75 degrees.\n5. Press: Drive your feet into the floor (leg drive) and push the bar up and slightly back toward your face to lock out over your shoulders.',
      raw,
      confidence: 'high',
    };
  }

  // ── Squats ────────────────────────────────────────────────────────────────
  if (lower.includes('squat') || lower.includes('squats') || lower.includes('squatting')) {
    return {
      intent: 'chat',
      topic: 'Squat Form & Depth',
      answer: 'Mastering the squat:\n\n1. Stance: Feet shoulder-width apart with toes pointed slightly outward (15–30 degrees).\n2. Brace: Take a deep diaphragmatic breath into your belly and brace your core like preparing for a punch.\n3. Descent: Break simultaneously at your hips and knees. Push your knees out in line with your toes.\n4. Depth: Squat down until your hip crease drops below the top of your knees (parallel or below).\n5. Ascent: Drive through your midfoot, keeping your chest proud and spine neutral as you return to standing.',
      raw,
      confidence: 'high',
    };
  }

  // ── Deadlifts ─────────────────────────────────────────────────────────────
  if (lower.includes('deadlift') || lower.includes('dead lift') || lower.includes('rdl')) {
    return {
      intent: 'chat',
      topic: 'Deadlift Mechanics',
      answer: 'Deadlift setup & execution:\n\n1. Setup: Stand with feet hip-width apart. The barbell should cut your feet in half directly over the midfoot (about 1 inch from shins).\n2. Hinge: Push your hips back and bend forward with a neutral spine until your hands reach the bar outside your legs.\n3. Wedge: Pull your shins forward to touch the bar without moving it. Engage your lats by squeezing imaginary oranges in your armpits.\n4. Lift: Take the slack out of the bar, brace hard, and push the floor away through your midfoot. Stand tall by squeezing your glutes at the top without hyperextending your lower back.',
      raw,
      confidence: 'high',
    };
  }

  // ── Shoulder Press / OHP ──────────────────────────────────────────────────
  if (lower.includes('shoulder press') || lower.includes('overhead press') || lower.includes('military press') || lower.includes('ohp')) {
    return {
      intent: 'chat',
      topic: 'Overhead Press (OHP)',
      answer: 'How to overhead press with power:\n\n1. Grip: Place hands just outside shoulders with forearms vertical under the bar.\n2. Base: Squeeze your glutes, thighs, and abs tight to create a rigid pillar.\n3. Bar Path: Tilt your head slightly back as you press the bar straight up in a vertical line close to your nose.\n4. Lockout: Once the bar clears your forehead, push your head through the "window" and shrug your traps slightly to lock out directly over your midfoot.',
      raw,
      confidence: 'high',
    };
  }

  // ── Biceps & Arms ─────────────────────────────────────────────────────────
  if (lower.includes('bicep') || lower.includes('biceps') || lower.includes('curls') || lower.includes('bigger arms')) {
    return {
      intent: 'chat',
      topic: 'Bicep Development & Arm Growth',
      answer: 'For bigger, fuller biceps:\n\n1. Emphasize both heads: Incline dumbbell curls stretch the long head for the peak, while preacher curls overload the short head for width.\n2. Add Hammer Curls: Works the brachialis muscle beneath the biceps, pushing the bicep up for more thickness.\n3. Technique: Keep your elbows pinned at your sides—do not swing your hips or use momentum. Control the lowering phase (eccentric) for 2–3 seconds on every rep.\n4. Volume: Aim for 10–14 hard working sets per week in the 8–15 rep range.',
      raw,
      confidence: 'high',
    };
  }

  // ── Triceps & Dips ────────────────────────────────────────────────────────
  if (lower.includes('tricep') || lower.includes('triceps') || lower.includes('dip') || lower.includes('dips')) {
    return {
      intent: 'chat',
      topic: 'Tricep Training',
      answer: 'The triceps make up about 60% of your upper arm volume! Train all 3 heads:\n\n1. Long Head: Overhead extensions (dumbbell or cable) give a deep stretch behind the head.\n2. Lateral Head: Cable rope pushdowns and straight-bar pushdowns for that outer horseshoe look.\n3. Medial Head: Close-grip bench press and parallel bar dips.\n4. Form Tip: Lock your upper arms in place and fully extend your elbows on each rep to achieve a peak contraction.',
      raw,
      confidence: 'high',
    };
  }

  // ── Back & Rows ───────────────────────────────────────────────────────────
  if (lower.includes('back exercise') || lower.includes('barbell row') || lower.includes('lat pulldown') || lower.includes('wider back')) {
    return {
      intent: 'chat',
      topic: 'Back Width & Thickness',
      answer: 'Building a V-taper back:\n\n1. For Width (Lats): Vertical pulling movements—Overhand Pull-ups, Neutral-Grip Chin-ups, and Lat Pulldowns. Focus on pulling your elbows straight down into your back pockets.\n2. For Thickness (Rhomboids & Traps): Horizontal pulling—Chest-Supported Rows, Barbell Rows, and Cable Rows. Squeeze your shoulder blades together at the peak.\n3. Mind-Muscle Connection: Use a thumbless "hook grip" or lifting straps to take your forearms out of the movement and isolate the back.',
      raw,
      confidence: 'high',
    };
  }

  // ── Abs & Six Pack ────────────────────────────────────────────────────────
  if (lower.includes('abs') || lower.includes('six pack') || lower.includes('belly fat') || lower.includes('core workout')) {
    return {
      intent: 'chat',
      topic: 'Six Pack Abs & Core',
      answer: 'Visible abs are built in the gym and revealed in the kitchen:\n\n1. Caloric Deficit: You cannot spot-reduce belly fat. To reveal your abs, maintain a 300–500 calorie deficit until your body fat is around 10–14% (for men) or 18–22% (for women).\n2. Progressive Overload on Core: Train your abs like any other muscle with weights! The best exercises are:\n• Hanging Leg Raises (hip flexors + lower rectus abdominis)\n• Kneeling Cable Crunches (progressive resistance on upper abs)\n• Ab Wheel Rollouts (anti-extension and deep core stability)\n3. Frequency: 2–3 sessions per week with 3–4 sets of 10–15 reps.',
      raw,
      confidence: 'high',
    };
  }

  // ── Posture & Rounded Shoulders ───────────────────────────────────────────
  if (lower.includes('rounded shoulder') || lower.includes('posture') || lower.includes('forward head')) {
    return {
      intent: 'chat',
      topic: 'Fixing Rounded Shoulders & Posture',
      answer: 'Rounded shoulders occur when chest/anterior delts are tight and upper back/rear delts are weak. Fix them with:\n\n1. Strengthen Weak Muscles:\n• Face Pulls (3x15 reps with external rotation at the finish)\n• Band Pull-Aparts (3x20 reps daily)\n• Prone Y-T-W raises to activate lower/mid traps\n2. Stretch Tight Muscles:\n• Doorway chest stretch (hold 30s each side)\n• Thoracic spine foam rolling\n3. Daily Cue: Think "tall spine, shoulders back and down, ribs down" throughout the day.',
      raw,
      confidence: 'high',
    };
  }

  // ── Progressive Overload ──────────────────────────────────────────────────
  if (lower.includes('progressive overload')) {
    return {
      intent: 'chat',
      topic: 'Progressive Overload',
      answer: 'Progressive overload means systematically increasing the demands on your musculoskeletal system over time to continually gain muscle and strength. You can apply it by:\n\n1. Adding small weight increments (1.25–2.5kg)\n2. Adding 1–2 extra reps with the same weight\n3. Improving form, tempo, and range of motion\n4. Doing an additional set or reducing rest time slightly\n\nAlways log your workouts and aim to beat your previous session by at least one rep or small load increase.',
      raw,
      confidence: 'high',
    };
  }

  // ── Protein Intake ────────────────────────────────────────────────────────
  if (lower.includes('how much protein') || lower.includes('protein intake') || lower.includes('daily protein') || lower.includes('whey protein')) {
    return {
      intent: 'chat',
      topic: 'Protein Intake Guide',
      answer: 'For optimal muscle building and recovery:\n\n• Daily Target: Consume 1.6 to 2.2 grams of protein per kilogram of body weight (0.7–1.0g per pound). If cutting on a steep deficit, aim closer to 2.4g/kg to preserve lean mass.\n• Meal Distribution: Spread protein across 3 to 5 meals with 25–45g per meal to repeatedly trigger muscle protein synthesis.\n• Whey vs Food: Whole foods (chicken, eggs, beef, fish, Greek yogurt, paneer, tofu) should form your base. Whey protein is a fast-digesting, convenient supplement ideal post-workout or between meals.',
      raw,
      confidence: 'high',
    };
  }

  // ── Creatine ──────────────────────────────────────────────────────────────
  if (lower.includes('creatine')) {
    return {
      intent: 'chat',
      topic: 'Creatine Monohydrate Guide',
      answer: 'Everything you need to know about Creatine:\n\n• Dosage: Take 3 to 5 grams of pure creatine monohydrate every day.\n• Timing: Any time of day is fine—consistency is what matters to keep cellular stores saturated.\n• Loading Phase: A 20g/day loading phase for 5–7 days is optional; taking 3–5g daily achieves the exact same saturation in 3–4 weeks without stomach upset.\n• Mechanism: Boosts intramuscular phosphocreatine, helping regenerate ATP (cellular energy) for greater explosive strength, power, and muscle volume.\n• Water: Drink plenty of water (3–4L/day) as creatine draws water into muscle cells (cellular hydration).',
      raw,
      confidence: 'high',
    };
  }

  // ── Rest Intervals ────────────────────────────────────────────────────────
  if (lower.includes('rest between') || lower.includes('rest period') || lower.includes('how long rest')) {
    return {
      intent: 'chat',
      topic: 'Rest Intervals',
      answer: 'Optimal rest times between sets:\n\n• Heavy Compound Lifts (Squats, Deadlifts, Bench, OHP): 2 to 3.5 minutes. Full central nervous system and ATP recovery lets you lift maximum weight with peak mechanical tension.\n• Isolation Exercises (Curls, Lateral Raises, Pushdowns, Calves): 60 to 90 seconds. Allows adequate recovery without wasting session time.\n• Don\'t rush sets: Rushing reduces the weight or reps you can perform on subsequent sets, reducing total productive volume.',
      raw,
      confidence: 'high',
    };
  }

  // ── Rep Ranges ────────────────────────────────────────────────────────────
  if (lower.includes('rep range') || lower.includes('how many reps') || lower.includes('hypertrophy reps')) {
    return {
      intent: 'chat',
      topic: 'Rep Ranges for Hypertrophy',
      answer: 'Rep ranges for muscle and strength:\n\n• Muscle Hypertrophy (Growth): 6 to 12 reps is the sweet spot balancing mechanical tension and muscle fatigue.\n• Maximum Strength: 1 to 5 reps with 80–90%+ of 1RM.\n• Muscular Endurance / Pump: 12 to 20 reps.\n\nKey Rule: Muscle growth is similar across 6–30 reps as long as each set is taken within 1 to 2 reps in reserve (RIR) of muscular failure.',
      raw,
      confidence: 'high',
    };
  }

  // ── Pre-Workout Nutrition & Caffeine ───────────────────────────────────────
  if (lower.includes('pre workout') || lower.includes('before workout') || lower.includes('caffeine')) {
    return {
      intent: 'chat',
      topic: 'Pre-Workout Fuel & Caffeine',
      answer: 'How to maximize your pre-workout energy:\n\n• 2 Hours Prior: Eat a solid meal with complex carbs and 20–35g protein (e.g. oatmeal with whey, chicken and rice, or eggs and toast).\n• 30 Mins Prior: Fast-digesting simple carbs (banana, dates, honey, rice cakes) for rapid glycogen.\n• Caffeine: 150–300mg (or 3–6mg/kg) 30–45 minutes before training increases focus, power output, and delays fatigue.\n• Hydration: Drink 500ml of water with a pinch of salt for optimal muscle pumps and muscle contraction.',
      raw,
      confidence: 'high',
    };
  }

  // ── Cutting / Fat Loss ────────────────────────────────────────────────────
  if (lower.includes('cut') || lower.includes('fat loss') || lower.includes('lose fat') || lower.includes('deficit')) {
    return {
      intent: 'chat',
      topic: 'Fat Loss & Cutting Strategy',
      answer: 'Preserving muscle while dropping fat:\n\n1. Deficit: Eat 300 to 500 calories below maintenance (aim to lose 0.5–1.0% of body weight per week).\n2. Protein: Keep protein high (2.0–2.4g/kg) to prevent muscle breakdown.\n3. Training: Continue lifting heavy with progressive overload—do NOT switch to "light weights for high reps."\n4. Cardio: Use low-intensity steady-state cardio (8,000–10,000 daily steps) to increase energy expenditure without taxing recovery.',
      raw,
      confidence: 'high',
    };
  }

  // ── Bulking / Mass ────────────────────────────────────────────────────────
  if (lower.includes('bulk') || lower.includes('build muscle') || lower.includes('gain mass')) {
    return {
      intent: 'chat',
      topic: 'Lean Bulking Strategy',
      answer: 'Building maximum muscle with minimal fat gain:\n\n1. Surplus: Maintain a modest surplus of 250 to 350 calories above maintenance.\n2. Rate of Gain: Aim to gain 0.25–0.5kg (0.5–1 lb) per month for intermediate lifters (up to 1kg/month for beginners).\n3. Fuel: Prioritize complex carbs (rice, oats, potatoes, pasta) around your workout windows to power hard training sessions.\n4. Don\'t "dirty bulk": Excessive calories do not accelerate muscle synthesis—they only store as adipose tissue.',
      raw,
      confidence: 'high',
    };
  }

  // ── Sleep & Recovery ──────────────────────────────────────────────────────
  if (lower.includes('sleep') || lower.includes('recovery') || lower.includes('rest day')) {
    return {
      intent: 'chat',
      topic: 'Sleep & Muscle Recovery',
      answer: 'Sleep is when your body actually builds muscle:\n\n• Target: 7 to 9 hours of quality sleep every night.\n• Growth Hormone: The majority of daily human growth hormone (HGH) and testosterone pulse during deep slow-wave sleep.\n• Recovery Impact: Sleeping less than 6 hours can reduce muscle protein synthesis by up to 18% and increase cortisol (muscle breakdown).\n• Rest Days: Take 1 to 2 rest days per week to allow your central nervous system, tendons, and joints to recover.',
      raw,
      confidence: 'high',
    };
  }

  // ── Soreness / DOMS ───────────────────────────────────────────────────────
  if (lower.includes('sore') || lower.includes('soreness') || lower.includes('doms')) {
    return {
      intent: 'chat',
      topic: 'DOMS & Muscle Soreness',
      answer: 'Dealing with Delayed Onset Muscle Soreness (DOMS):\n\n• What it is: Microscopic tears and inflammation in muscle fibers, typically peaking 24–48 hours after introducing new exercises or heavy eccentrics.\n• Myth: Extreme soreness does NOT correlate with more muscle growth.\n• How to recover: Light active recovery (walking, gentle cycling), hydration, 2g/kg protein, and 8 hours of sleep.\n• Can you workout sore? Yes, as long as it\'s a different muscle group. For the sore muscle, wait until tenderness subsides to maintain good form.',
      raw,
      confidence: 'high',
    };
  }

  // ── Hydration ─────────────────────────────────────────────────────────────
  if (lower.includes('water') || lower.includes('hydration')) {
    return {
      intent: 'chat',
      topic: 'Hydration for Fitness',
      answer: 'Hydration directly impacts strength and endurance:\n\n• Daily intake: Aim for 3 to 4 liters (about 1 gallon) of water daily, plus 500ml–1L during intense training sessions.\n• Performance loss: Even a 2% drop in body water can reduce strength by 10% and significantly impair endurance.\n• Electrolytes: Add a pinch of sodium or an electrolyte packet when sweating heavily to prevent cramps and maintain muscle cell volumization.',
      raw,
      confidence: 'high',
    };
  }

  // ── Deload ────────────────────────────────────────────────────────────────
  if (lower.includes('deload') || lower.includes('overtrain') || lower.includes('fatigue')) {
    return {
      intent: 'chat',
      topic: 'Deload & Fatigue Management',
      answer: 'Every 6 to 8 weeks of intense training, take a deload week:\n\n• How to deload: Cut total sets in half (50% volume) and drop weights by 10–20%.\n• Why: Dissipates accumulated systemic and joint fatigue while maintaining neural adaptations.\n• When: When your motivation drops, joints ache, or your strength plateaus over multiple consecutive sessions.',
      raw,
      confidence: 'high',
    };
  }

  // ── Exercise Selection & Recommendations ──────────────────────────────────
  if (
    lower.includes('kind of exercise') || lower.includes('exercises are better') ||
    lower.includes('best exercise') || lower.includes('which exercise') ||
    lower.includes('exercise recommendation') || lower.includes('good exercise')
  ) {
    if (lower.includes('chest')) {
      return {
        intent: 'chat',
        topic: 'Best Chest Exercises',
        answer: 'Top exercises for building a strong, defined chest:\n\n1. Flat Barbell or Dumbbell Bench Press: The king of chest builders for overall mass and mechanical tension.\n2. Incline Dumbbell Press: Overloads the clavicular (upper) chest for a fuller, lifted look.\n3. Weighted Dips: Hits the lower pectorals and sternal head with heavy loaded stretch.\n4. Cable Crossover / Pec Deck Flyes: Provides continuous tension at the contracted peak.\n\nRoutine Tip: Do 1 heavy compound press (3–4 sets of 6–8 reps), 1 incline press (3 sets of 8–10 reps), and 1 cable fly (3 sets of 12–15 reps).',
        raw,
        confidence: 'high',
      };
    }

    if (lower.includes('back')) {
      return {
        intent: 'chat',
        topic: 'Best Back Exercises',
        answer: 'Top exercises for back width and thickness:\n\n1. Pull-Ups / Chin-Ups: The ultimate bodyweight exercise for lat width and V-taper.\n2. Barbell Bent-Over Row: Builds total back thickness, rhomboids, and lower traps.\n3. Lat Pulldown: Great for focusing on lat engagement with controlled eccentrics.\n4. Chest-Supported Dumbbell Row: Eliminates lower back strain to maximally isolate the upper back.\n5. Face Pulls: Essential for rear deltoids, posture, and rotator cuff health.',
        raw,
        confidence: 'high',
      };
    }

    if (lower.includes('leg') || lower.includes('quad') || lower.includes('hamstring')) {
      return {
        intent: 'chat',
        topic: 'Best Leg Exercises',
        answer: 'Top exercises for complete lower body development:\n\n1. Barbell Back Squat: The gold standard for quad, glute, and overall leg strength.\n2. Romanian Deadlift (RDL): Builds powerful hamstrings and glutes through hip hinge.\n3. Bulgarian Split Squat: Fixes strength imbalances and triggers massive quad/glute hypertrophy.\n4. Leg Press: High-volume quad loading with zero spinal compression.\n5. Standing or Seated Calf Raises: Full stretch and squeeze for calf growth.',
        raw,
        confidence: 'high',
      };
    }

    return {
      intent: 'chat',
      topic: 'Exercise Selection Guide',
      answer: 'The most effective exercises for muscle growth and strength are compound multi-joint movements:\n\n1. Upper Body Essentials:\n• Push: Barbell Bench Press, Incline Dumbbell Press, Overhead Press, Dips\n• Pull: Pull-Ups, Barbell Bent-Over Rows, Lat Pulldowns, Face Pulls\n\n2. Lower Body Essentials:\n• Quads & Glutes: Barbell Squats, Leg Press, Bulgarian Split Squats\n• Posterior Chain: Romanian Deadlifts (RDL), Hamstring Curls\n\n3. Core & Arms:\n• Incline Bicep Curls, Tricep Rope Pushdowns, Hanging Leg Raises\n\nGeneral Rule: Start workouts with 1–2 heavy compound exercises when energy is highest, then finish with 2–3 targeted isolation movements.',
      raw,
      confidence: 'high',
    };
  }

  return null;
}

/**
 * Unified Zero-API Processing Engine
 */
async function processWithFreeEngine(raw: string): Promise<AIUnifiedResult> {
  const lower = raw.toLowerCase().trim();

  // Check if query is conversational / question (should NOT be parsed as workout log)
  const isQuestion =
    lower.startsWith('what') || lower.startsWith('how') || lower.startsWith('why') ||
    lower.startsWith('which') || lower.startsWith('should') || lower.startsWith('is ') ||
    lower.startsWith('can ') || lower.startsWith('do ') || lower.startsWith('tell me') ||
    lower.startsWith('explain') || lower.includes('?') || lower.includes('better') ||
    lower.includes('recommend') || lower.includes('best exercises') || lower.includes('kind of exercise') ||
    lower.includes('difference between');

  // 1. Try Workout Parsing First (only if NOT a question)
  if (!isQuestion) {
    const workout = parseWorkoutText(raw);
    if (workout.exercises.length > 0 && workout.exercises.some(e => e.muscleGroup !== 'Other' || e.sets > 1 || e.reps > 0 || e.weight > 0)) {
      return {
        intent: 'workout',
        exercises: workout.exercises,
        raw,
        confidence: workout.confidence,
      };
    }
  }

  // 2. Try Nutrition Parsing
  const foodKeywords = [
    'ate', 'eat', 'eaten', 'having', 'food', 'meal', 'egg', 'eggs', 'chicken',
    'rice', 'bread', 'oats', 'oatmeal', 'protein', 'calories', 'kcal', 'shake',
    'banana', 'apple', 'milk', 'breakfast', 'lunch', 'dinner', 'pizza', 'burger',
    'pasta', 'paneer', 'whey', 'snack', 'drank', 'drink', 'curd', 'yogurt'
  ];

  if (foodKeywords.some(k => lower.includes(k))) {
    const nutritionRes = await parseNutritionFree(raw);
    if (nutritionRes && nutritionRes.items.length > 0) {
      return nutritionRes;
    }
  }

  // 3. Check local curated fitness Q&A library first (instant, offline)
  const local = getFitnessLocalAnswer(raw);
  if (local) return local;

  // 4. Fetch live answer from the internet (DuckDuckGo → Wikipedia)
  try {
    const live = await fetchLiveAnswer(raw);
    if (live) {
      return {
        intent: 'chat',
        topic: live.topic,
        answer: live.answer,
        raw,
        confidence: 'high',
      };
    }
  } catch (_) {}

  // 5. Final fallback
  return {
    intent: 'chat',
    topic: 'GainQuest AI Coach',
    answer: `I searched for "${raw}" online but couldn't retrieve an answer right now. Try rephrasing your question, or check your internet connection. You can also log a workout (e.g. "bench press 100kg 3x8") or food (e.g. "ate 3 eggs and oatmeal").`,
    raw,
    confidence: 'low',
  };
}

// ── Unified Query Engine (100% Free - Zero API Key Required) ──────────────────
export async function queryFitnessAI(inputText: string): Promise<AIUnifiedResult> {
  const raw = inputText.trim();
  return await processWithFreeEngine(raw);
}

// ── Backwards compatibility helper ───────────────────────────────────────────
export async function parseWithGemini(transcript: string): Promise<ParseResult> {
  const res = await queryFitnessAI(transcript);
  if (res.intent === 'workout') {
    return {
      exercises: res.exercises,
      raw: res.raw,
      confidence: res.confidence,
      error: res.error,
    };
  }
  return {
    exercises: [],
    raw: transcript,
    confidence: 'low',
    error: res.intent === 'nutrition' ? 'Nutrition logged' : 'Chat response received',
  };
}
