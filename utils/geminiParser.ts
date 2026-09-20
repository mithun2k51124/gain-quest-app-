// utils/geminiParser.ts
// Unified Gemini API assistant for workouts, nutrition logging, and fitness Q&A.

import { GoogleGenAI } from '@google/genai';
import { ParsedExercise, ParseResult, parseWorkoutText } from './workoutParser';

// ── API Key ───────────────────────────────────────────────────────────────────
const DEVELOPER_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY || '';
let _apiKey: string = DEVELOPER_KEY;

export function setGeminiApiKey(key: string) {
  _apiKey = key.trim() || DEVELOPER_KEY;
}

export function getGeminiApiKey(): string {
  return _apiKey;
}

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

// ── System Instruction ────────────────────────────────────────────────────────
const SYSTEM_INSTRUCTION = `You are GainQuest AI, an ultra-smart, all-in-one fitness, nutrition, and workout assistant.
Classify and process user inputs (spoken or typed) into one of three intents:

1. "workout": The user performed or logged physical exercises (e.g. "I did 3 sets bench press 100kg for 8 reps", "curled 15kg dumbbells 3x10", "ran 5k", "did 50 pushups", "squats 120kg 4 sets 6 reps").
2. "nutrition": The user ate, drank, or is logging food/meals/macros (e.g. "I had 3 scrambled eggs and 2 slices of toast", "ate 200g chicken breast and rice, about 45g protein and 500 cals", "drank a protein shake with 30g protein", "logged a bowl of oats with milk", "I ate pizza").
3. "chat": The user is asking a question, seeking advice, discussing fitness/diet/recovery/form, or chatting (e.g. "What should I eat before morning workouts?", "How do I increase bench press?", "What is progressive overload?", "Can I take creatine before bed?").

RULES FOR "workout":
- Return an array "exercises".
- If sets are NOT mentioned, default sets = 1.
- If reps are NOT mentioned, default reps = 0.
- If weight is NOT mentioned, default weight = 0.
- Unit defaults to "kg" unless "lbs" or "pounds" is specified.
- Standardize common exercise names (e.g. "bench" -> "Bench Press", "ohp" -> "Overhead Press", "squats" -> "Squat").
- Muscle group must be one of: Chest, Back, Legs, Shoulders, Biceps, Triceps, Core, Other.

RULES FOR "nutrition":
- Return an array "foods".
- Each item must have:
  * "food_name": short clean description with portion if given (e.g. "Scrambled Eggs (3 eggs)", "Chicken Breast (200g)")
  * "protein": grams of protein (number)
  * "calories": kcal (number)
- If the user provides calories or protein, use the user's values.
- If the user DOES NOT specify calories or protein, you MUST estimate realistic, standard nutritional values for that food and portion size!
- Return "totalProtein" and "totalCalories" as sums of the items.

RULES FOR "chat":
- Return "answer" with a concise, clear paragraph summary answer (1 punchy paragraph, 3 to 5 sentences max). Focus directly on the core answer and actionable advice.
- Return "topic" as a short title (e.g. "Progressive Overload", "Pre-Workout Nutrition", "Rest Intervals", "Muscle Growth").

RETURN ONLY A STRICT VALID JSON OBJECT matching ONE of these structures (no markdown backticks, no other text):

Structure 1 (workout):
{
  "intent": "workout",
  "exercises": [
    { "exercise": "Bench Press", "muscleGroup": "Chest", "sets": 3, "reps": 8, "weight": 100, "unit": "kg" }
  ]
}

Structure 2 (nutrition):
{
  "intent": "nutrition",
  "foods": [
    { "food_name": "Scrambled Eggs (3 eggs)", "protein": 18, "calories": 210 },
    { "food_name": "Whole Wheat Toast (2 slices)", "protein": 6, "calories": 160 }
  ],
  "totalProtein": 24,
  "totalCalories": 370
}

Structure 3 (chat):
{
  "intent": "chat",
  "answer": "Progressive overload is the foundational principle of gradually increasing the stimulus—such as weight, reps, or volume—placed on your muscles over time. By consistently challenging your muscles slightly beyond their previous capacity, you force your body to adapt by increasing strength and hypertrophy. You can apply it by adding 2.5kg to your lifts each week, performing an extra rep with the same weight, or shortening your rest periods.",
  "topic": "Progressive Overload"
}
`;

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

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms)
    ),
  ]);
}

// ── Unified Query Engine ──────────────────────────────────────────────────────
export async function queryFitnessAI(inputText: string): Promise<AIUnifiedResult> {
  const apiKey = _apiKey;
  const raw = inputText.trim();

  // Active production models for Gemini API
  const MODELS = ['gemini-3.6-flash', 'gemini-3.5-flash-lite'];

  if (!apiKey || apiKey.length < 20) {
    return {
      intent: 'chat',
      answer: 'Gemini AI key is not configured. Please ensure your key is valid.',
      topic: 'Setup',
      raw,
      confidence: 'low',
      error: 'NO_API_KEY',
    };
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    let responseText = '';
    let lastError: any = null;

    for (const model of MODELS) {
      try {
        const response = await withTimeout(
          ai.models.generateContent({
            model,
            config: {
              systemInstruction: SYSTEM_INSTRUCTION,
              temperature: 0.2,
              maxOutputTokens: 1024,
            },
            contents: `Process this input:\n"${raw}"`,
          }),
          9000
        );
        responseText = response.text?.trim() || '';
        if (responseText) break;
      } catch (e: any) {
        lastError = e;
      }
    }

    if (!responseText) {
      throw lastError || new Error('All Gemini models failed to respond');
    }

    const cleaned = responseText
      .replace(/```(?:json)?/gi, '')
      .replace(/```/g, '')
      .trim();

    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
      if (arrayMatch) {
        const parsedArr = JSON.parse(arrayMatch[0]);
        const exercises: ParsedExercise[] = parsedArr.map((item: any) => ({
          exercise: capitalizeWords(item.exercise || 'Exercise'),
          muscleGroup: resolveMuscle(item.exercise || ''),
          sets: Math.max(1, Math.round(Number(item.sets) || 1)),
          reps: Math.max(0, Math.round(Number(item.reps) || 0)),
          weight: Math.max(0, Number(item.weight) || 0),
          unit: (item.unit === 'lbs' ? 'lbs' : 'kg') as 'kg' | 'lbs',
        }));
        return { intent: 'workout', exercises, raw, confidence: 'high' };
      }
      throw new Error('Could not parse AI response JSON');
    }

    const data = JSON.parse(jsonMatch[0]);

    // ── Intent: Nutrition ──
    if (data.intent === 'nutrition' || (data.foods && Array.isArray(data.foods))) {
      const foodsRaw = Array.isArray(data.foods) ? data.foods : [];
      const items: ParsedFoodItem[] = foodsRaw.map((f: any) => ({
        food_name: capitalizeWords(f.food_name || f.name || 'Food Item'),
        protein: Math.max(0, Math.round(Number(f.protein) || 0)),
        calories: Math.max(0, Math.round(Number(f.calories) || 0)),
      }));

      const totalProtein = items.reduce((acc, cur) => acc + cur.protein, 0);
      const totalCalories = items.reduce((acc, cur) => acc + cur.calories, 0);

      return {
        intent: 'nutrition',
        items,
        totalProtein: Number(data.totalProtein) || totalProtein,
        totalCalories: Number(data.totalCalories) || totalCalories,
        raw,
        confidence: 'high',
      };
    }

    // ── Intent: Chat ──
    if (data.intent === 'chat' || (data.answer && !data.exercises)) {
      return {
        intent: 'chat',
        answer: String(data.answer || '').trim() || 'I am ready to help with your workouts and nutrition!',
        topic: data.topic || 'Fitness & Health',
        raw,
        confidence: 'high',
      };
    }

    // ── Intent: Workout ──
    const exercisesRaw = Array.isArray(data.exercises) ? data.exercises : [];
    if (exercisesRaw.length > 0) {
      const exercises: ParsedExercise[] = exercisesRaw.map((item: any) => ({
        exercise: capitalizeWords(item.exercise || 'Exercise'),
        muscleGroup: resolveMuscle(item.exercise || '', item.muscleGroup),
        sets: Math.max(1, Math.round(Number(item.sets) || 1)),
        reps: Math.max(0, Math.round(Number(item.reps) || 0)),
        weight: Math.max(0, Number(item.weight) || 0),
        unit: (item.unit === 'lbs' ? 'lbs' : 'kg') as 'kg' | 'lbs',
      }));

      return {
        intent: 'workout',
        exercises,
        raw,
        confidence: exercises.some(e => e.weight > 0) ? 'high' : 'medium',
      };
    }

    // If answer is present
    if (data.answer) {
      return {
        intent: 'chat',
        answer: data.answer,
        topic: data.topic || 'Fitness Advice',
        raw,
        confidence: 'medium',
      };
    }

    return {
      intent: 'chat',
      answer: "I couldn't quite catch that. You can tell me what workout you did, what food you ate, or ask any fitness question!",
      topic: 'Assistant',
      raw,
      confidence: 'low',
    };

  } catch (err: any) {
    // Intelligent fallback without misclassifying food/chat as workout
    const lower = raw.toLowerCase();

    // 1. Question / Chat check
    if (lower.includes('?') || lower.startsWith('how') || lower.startsWith('what') || lower.startsWith('why') || lower.startsWith('can i') || lower.startsWith('should i') || lower.startsWith('explain') || lower.startsWith('tell me')) {
      return {
        intent: 'chat',
        answer: "I encountered a network issue while answering your query. Please check your connection and try asking again.",
        topic: 'Fitness Q&A',
        raw,
        confidence: 'low',
        error: err?.message || String(err),
      };
    }

    // 2. Nutrition check
    const foodKeywords = ['ate', 'eat', 'eaten', 'having', 'food', 'meal', 'egg', 'eggs', 'chicken', 'rice', 'bread', 'oats', 'oatmeal', 'protein', 'calories', 'kcal', 'shake', 'banana', 'apple', 'milk', 'breakfast', 'lunch', 'dinner', 'pizza', 'burger'];
    if (foodKeywords.some(k => lower.includes(k))) {
      return {
        intent: 'nutrition',
        items: [{ food_name: capitalizeWords(raw), protein: 0, calories: 0 }],
        totalProtein: 0,
        totalCalories: 0,
        raw,
        confidence: 'low',
        error: 'Offline estimate unavailable — please adjust macros.',
      };
    }

    // 3. Workout regex only if it actually matches a recognized exercise
    const fallback = parseWorkoutText(raw);
    if (fallback.exercises.length > 0 && fallback.exercises[0].muscleGroup !== 'Other') {
      return {
        intent: 'workout',
        exercises: fallback.exercises,
        raw,
        confidence: 'medium',
      };
    }

    return {
      intent: 'chat',
      answer: "I am having trouble connecting right now. You can log workouts in the Workouts tab or food in the Tracker tab.",
      topic: 'Assistant',
      raw,
      confidence: 'low',
      error: err?.message || String(err),
    };
  }
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
