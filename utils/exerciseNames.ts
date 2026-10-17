// utils/exerciseNames.ts — matches exercise names however they were typed, spoken or stored
// ("Lateral Raises", "triceps push-down", "Pull-ups"...) to one canonical library name.
// Pure (no React / DB) so it can be tested on its own.

// Common alternative names → GainQuest's original exercise names (see legacyExerciseNames)
export const EXERCISE_ALIASES: Record<string, string> = {
  'pushdown': 'Tricep Pushdown',
  'push down': 'Tricep Pushdown',
  'cable pushdown': 'Tricep Pushdown',
  'rope pushdown': 'Tricep Pushdown',
  'tricep rope pushdown': 'Tricep Pushdown',
  'tricep push down': 'Tricep Pushdown',
  'tricep extension': 'Overhead Tricep Extension',
  'overhead extension': 'Overhead Tricep Extension',
  'tricep kickback': 'Cable Kickback',
  'kickback': 'Cable Kickback',
  'skullcrusher': 'Skull Crusher',
  'dip': 'Tricep Dip',
  'side lateral raise': 'Lateral Raise',
  'dumbbell lateral raise': 'Lateral Raise',
  'side raise': 'Lateral Raise',
  'lat raise': 'Lateral Raise',
  'shoulder press': 'Dumbbell Shoulder Press',
  'military press': 'Overhead Press',
  'ohp': 'Overhead Press',
  'bicep curl': 'Dumbbell Curl',
  'curl': 'Barbell Curl',
  'chest fly': 'Dumbbell Fly',
  'chest press': 'Bench Press',
  'barbell bench press': 'Bench Press',
  'flat bench press': 'Bench Press',
  'back squat': 'Squat',
  'barbell squat': 'Squat',
  'barbell row': 'Bent Over Row',
  'row': 'Bent Over Row',
  'cable row': 'Seated Cable Row',
  'pulldown': 'Lat Pulldown',
  'rdl': 'Romanian Deadlift',
  'farmer walk': "Farmer's Walk",
  'farmers walk': "Farmer's Walk",
  'ab wheel': 'Ab Wheel Rollout',
  'rear delt raise': 'Rear Delt Fly',
};

// Word-level spellings that mean the same thing
const WORD_SYNONYMS: Record<string, string> = {
  pullup: 'pull up', pushup: 'push up', chinup: 'chin up', situp: 'sit up', muscleup: 'muscle up',
  db: 'dumbbell', bb: 'barbell', flye: 'fly', crusher: 'crusher', ext: 'extension',
};

function singular(w: string): string {
  if (w.length <= 2 || w.endsWith('ss')) return w;                 // press, cross
  if (w.endsWith('ies')) return w.slice(0, -3) + 'y';               // flies → fly
  if (w.endsWith('s')) return w.slice(0, -1);                       // raises → raise, triceps → tricep
  return w;
}

/** Lowercase, drop punctuation, singular words, unify spellings: "Triceps Push-Downs" → "tricep push down". */
export function normalizeExerciseName(name: string): string {
  return name
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map(w => WORD_SYNONYMS[singular(w)] ?? singular(w))
    .join(' ')
    .replace(/\bpush down\b/, 'pushdown');
}

/**
 * Builds a lookup that maps any spelling to one of `canonicalNames` (or null).
 * `aliases` maps extra names (any spelling) to canonical names; exact names always win.
 */
export function makeCanonicalizer(
  canonicalNames: string[], aliases: Record<string, string> = EXERCISE_ALIASES
): (name: string) => string | null {
  const known = new Set(canonicalNames);
  const index = new Map<string, string>();
  for (const n of canonicalNames) {
    const key = normalizeExerciseName(n);
    if (!index.has(key)) index.set(key, n);
  }
  for (const [alias, target] of Object.entries(aliases)) {
    const key = normalizeExerciseName(alias);
    if (!index.has(key) && known.has(target)) index.set(key, target);
  }
  return (name: string) => index.get(normalizeExerciseName(name)) ?? null;
}
