// utils/workoutParser.ts
// Natural language → structured workout log parser
import { EXERCISE_LIBRARY } from '../constants/theme';

export interface ParsedExercise {
  exercise: string;
  muscleGroup: string;
  sets: number;
  reps: number;
  weight: number;
  unit: 'kg' | 'lbs';
}

export interface ParseResult {
  exercises: ParsedExercise[];
  raw: string;
  confidence: 'high' | 'medium' | 'low';
  error?: string;
}

// Flat map: exercise name (lowercase) → muscle group
const EXERCISE_MAP: Record<string, string> = {};
for (const [muscle, exercises] of Object.entries(EXERCISE_LIBRARY)) {
  for (const ex of exercises) {
    EXERCISE_MAP[ex.toLowerCase()] = muscle;
  }
}

// Aliases for common spoken variations
const ALIASES: Record<string, string> = {
  'bench':            'Bench Press',
  'bp':               'Bench Press',
  'incline bench':    'Incline Bench Press',
  'decline bench':    'Decline Bench Press',
  'squat':            'Squat',
  'squats':           'Squat',
  'deadlift':         'Deadlift',
  'deadlifts':        'Deadlift',
  'dl':               'Deadlift',
  'ohp':              'Overhead Press',
  'overhead press':   'Overhead Press',
  'shoulder press':   'Overhead Press',
  'pullup':           'Pull Up',
  'pull up':          'Pull Up',
  'pull-up':          'Pull Up',
  'pullups':          'Pull Up',
  'chinup':           'Chin Up',
  'chin up':          'Chin Up',
  'row':              'Bent Over Row',
  'barbell row':      'Bent Over Row',
  'bent over row':    'Bent Over Row',
  'lat pulldown':     'Lat Pulldown',
  'cable row':        'Seated Cable Row',
  'curl':             'Barbell Curl',
  'curls':            'Barbell Curl',
  'barbell curl':     'Barbell Curl',
  'dumbbell curl':    'Dumbbell Curl',
  'hammer curl':      'Hammer Curl',
  'hammer curls':     'Hammer Curl',
  'tricep pushdown':  'Tricep Pushdown',
  'pushdown':         'Tricep Pushdown',
  'skull crusher':    'Skull Crusher',
  'skull crushers':   'Skull Crusher',
  'dip':              'Tricep Dip',
  'dips':             'Tricep Dip',
  'chest dip':        'Chest Dip',
  'leg press':        'Leg Press',
  'rdl':              'Romanian Deadlift',
  'romanian deadlift':'Romanian Deadlift',
  'lunges':           'Lunges',
  'lunge':            'Lunges',
  'leg curl':         'Leg Curl',
  'leg extension':    'Leg Extension',
  'calf raise':       'Calf Raise',
  'calf raises':      'Calf Raise',
  'plank':            'Plank',
  'crunch':           'Crunch',
  'crunches':         'Crunch',
  'lateral raise':    'Lateral Raise',
  'lateral raises':   'Lateral Raise',
  'lat raise':        'Lateral Raise',
  'shrug':            'Shrugs',
  'shrugs':           'Shrugs',
  'muscle up':        'Muscle Up',
  'muscle ups':       'Muscle Up',
  'face pull':        'Face Pull',
  'face pulls':       'Face Pull',
  'fly':              'Dumbbell Fly',
  'flies':            'Dumbbell Fly',
  'flyes':            'Dumbbell Fly',
  'chest fly':        'Dumbbell Fly',
  'push up':          'Push Up',
  'push ups':         'Push Up',
  'pushup':           'Push Up',
  'pushups':          'Push Up',
  'ab wheel':         'Ab Wheel Rollout',
  'leg raise':        'Leg Raise',
  'leg raises':       'Leg Raise',
  'russian twist':    'Russian Twist',
  'russian twists':   'Russian Twist',
  'farmers walk':     "Farmer's Walk",
  "farmer's walk":    "Farmer's Walk",
  'dead hang':        'Dead Hang',
  'arnold press':     'Arnold Press',
  'front squat':      'Front Squat',
  'bulgarian':        'Bulgarian Split Squat',
  'bulgarian split squat': 'Bulgarian Split Squat',
  'hack squat':       'Hack Squat',
  'close grip':       'Close Grip Bench Press',
  'close grip bench': 'Close Grip Bench Press',
  'cable crossover':  'Cable Crossover',
  'pec deck':         'Pec Deck',
  'preacher curl':    'Preacher Curl',
  'spider curl':      'Spider Curl',
  'incline curl':     'Incline Dumbbell Curl',
  'concentration curl':'Concentration Curl',
  'upright row':      'Upright Row',
  'rear delt fly':    'Rear Delt Fly',
  'overhead extension':'Overhead Tricep Extension',
};

function resolveExercise(raw: string): { name: string; muscle: string } | null {
  const lower = raw.trim().toLowerCase();

  // Direct alias lookup
  if (ALIASES[lower]) {
    const name = ALIASES[lower];
    const muscle = EXERCISE_MAP[name.toLowerCase()] || 'Other';
    return { name, muscle };
  }

  // Fuzzy match against exercise library
  for (const [ex, muscle] of Object.entries(EXERCISE_MAP)) {
    if (lower.includes(ex) || ex.includes(lower)) {
      // find canonical name
      const canonical = Object.entries(EXERCISE_LIBRARY).find(([, exs]) =>
        exs.some(e => e.toLowerCase() === ex)
      );
      return { name: canonical ? canonical[1].find(e => e.toLowerCase() === ex) || raw : raw, muscle };
    }
  }

  // Partial alias match
  for (const [alias, name] of Object.entries(ALIASES)) {
    if (lower.includes(alias)) {
      const muscle = EXERCISE_MAP[name.toLowerCase()] || 'Other';
      return { name, muscle };
    }
  }

  // Fall back to the raw text, capitalized, muscle = Other
  return {
    name: raw.trim().replace(/\b\w/g, c => c.toUpperCase()),
    muscle: 'Other',
  };
}

// Number word map
const WORD_NUMS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20,
};

function parseNum(s: string): number | null {
  const t = s.trim().toLowerCase();
  if (WORD_NUMS[t] !== undefined) return WORD_NUMS[t];
  const n = parseFloat(t.replace(',', '.'));
  return isNaN(n) ? null : n;
}

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/\bkilograms?\b/g, 'kg')
    .replace(/\bkilos?\b/g, 'kg')
    .replace(/\bpounds?\b/g, 'lbs')
    .replace(/\brepetitions?\b/g, 'reps')
    .replace(/\bset\b/g, 'sets')
    .replace(/\bof\b/g, ' ')
    .replace(/\bat\b/g, ' ')
    .replace(/\bwith\b/g, ' ')
    .replace(/\busing\b/g, ' ')
    .replace(/\bfor\b/g, ' ')
    .replace(/\band\b/g, ' ')
    .replace(/\bdid\b/g, ' ')
    .replace(/\bjust\b/g, ' ')
    .replace(/\bi\b/g, ' ')
    .replace(/\btoday\b/g, ' ')
    .replace(/\bsome\b/g, ' ')
    .replace(/\ba\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseWorkoutText(input: string): ParseResult {
  const raw = input.trim();
  if (!raw) return { exercises: [], raw, confidence: 'low', error: 'No input provided' };

  const normalized = normalizeText(raw);

  // ── Pattern 1: "<sets> sets [of] <exercise> [of/at/with] <weight> [kg/lbs] [x <reps> reps]"
  // ── Pattern 2: "<exercise> <weight> kg <sets> sets <reps> reps"
  // ── Pattern 3: "<sets> x <reps> <exercise> <weight> kg"

  const exercises: ParsedExercise[] = [];

  // Split on conjunctions that separate different exercises
  const segments = normalized.split(/\s*(?:,\s*(?:and\s*)?|;\s*|then\s+)/);

  for (const seg of segments) {
    const s = seg.trim();
    if (!s) continue;

    let sets: number | null = null;
    let reps: number | null = null;
    let weight: number | null = null;
    let unit: 'kg' | 'lbs' = 'kg';
    let exerciseRaw = '';

    // Extract weight + unit
    const weightMatch = s.match(/(\d+(?:\.\d+)?)\s*(kg|lbs)/);
    if (weightMatch) {
      weight = parseFloat(weightMatch[1]);
      unit = weightMatch[2] as 'kg' | 'lbs';
    }

    // Extract sets: "N sets" or "N x"
    const setsMatch = s.match(/(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+sets/i)
      || s.match(/(\d+)\s*[xX×]\s*\d+/);
    if (setsMatch) sets = parseNum(setsMatch[1]);

    // Extract reps: "N reps" or "xN"
    const repsMatch = s.match(/(\d+)\s*reps?/i)
      || s.match(/[xX×]\s*(\d+)/);
    if (repsMatch) reps = parseNum(repsMatch[1]);

    // Extract "NxM" pattern (sets x reps)
    const sxrMatch = s.match(/(\d+)\s*[xX×]\s*(\d+)/);
    if (sxrMatch && !sets && !reps) {
      sets = parseInt(sxrMatch[1]);
      reps = parseInt(sxrMatch[2]);
    }

    // Guess exercise: remove numbers, units, sets/reps words
    exerciseRaw = s
      .replace(/\d+(?:\.\d+)?\s*(kg|lbs)/gi, '')
      .replace(/\d+\s*sets?/gi, '')
      .replace(/\d+\s*reps?/gi, '')
      .replace(/\d+\s*[xX×]\s*\d*/gi, '')
      .replace(/[xX×]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!exerciseRaw) continue;

    const resolved = resolveExercise(exerciseRaw);
    if (!resolved) continue;

    exercises.push({
      exercise: resolved.name,
      muscleGroup: resolved.muscle,
      sets: sets ?? 1,   // Never invent sets — default 1 if not mentioned
      reps: reps ?? 0,   // Never invent reps — default 0 if not mentioned
      weight: weight ?? 0,
      unit,
    });
  }

  if (exercises.length === 0) {
    return { exercises: [], raw, confidence: 'low', error: 'Could not parse any exercises. Try: "3 sets bench press 100kg 5 reps"' };
  }

  const hasWeight = exercises.every(e => e.weight > 0);
  const confidence = hasWeight && exercises.length > 0 ? 'high' : 'medium';

  return { exercises, raw, confidence };
}
