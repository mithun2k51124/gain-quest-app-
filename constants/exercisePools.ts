// constants/exercisePools.ts — curated exercise choices for each slot of a generated plan.
// Each pool is ordered best-first for a well-equipped lifter; the generator keeps only what the
// user can do (equipment, strength, level, lifts done before) and rotates through the top picks.
//
// Strength scales (answers from the wizard's strength check):
//   push  0 = no push-ups, 1 = 1–5, 2 = 6–15, 3 = 16–30, 4 = 30+
//   pull  0 = no pull-ups, 1 = 1–3, 2 = 4–8, 3 = 9+
//   squat 0 = under 10 bodyweight squats, 1 = 10–25, 2 = 25–50, 3 = 50+
// A candidate's push/pull/squat value is both its difficulty on that scale and the minimum
// the user needs. Versions far below the user's level are treated as too easy.

export type Level = 'beginner' | 'intermediate' | 'advanced';

export type PatternKey =
  | 'squat' | 'lunge' | 'hinge' | 'glute' | 'hamCurl' | 'quadIso' | 'calf'
  | 'hPush' | 'inclinePush' | 'chestFly' | 'vPush' | 'lateral' | 'rearDelt'
  | 'hPull' | 'vPull' | 'biceps' | 'triceps' | 'core';

/** Technique lifts the wizard asks about ("done any of these before?"). */
export type SkillKey =
  | 'bbSquat' | 'deadlift' | 'bench' | 'ohp' | 'kbSwing' | 'kbClean'
  | 'dips' | 'hangingRaise' | 'hspu' | 'plyo';

export const SKILL_ORDER: SkillKey[] = [
  'bbSquat', 'deadlift', 'bench', 'ohp', 'kbSwing', 'kbClean', 'dips', 'hangingRaise', 'hspu', 'plyo',
];

export const SKILL_LABEL: Record<SkillKey, string> = {
  bbSquat: 'Barbell squat', deadlift: 'Deadlift', bench: 'Bench press', ohp: 'Overhead press',
  kbSwing: 'Kettlebell swing', kbClean: 'Kettlebell clean & press', dips: 'Dips',
  hangingRaise: 'Hanging leg raise', hspu: 'Handstand push-up', plyo: 'Jump training',
};

export interface Candidate {
  name: string;          // exact catalog name
  skill?: SkillKey;      // technique lift, gated by the "done before" answers
  push?: number;         // bodyweight difficulty on the push-up scale
  pull?: number;         // ... on the pull-up scale
  squat?: number;        // ... on the squat scale
  uni?: boolean;         // single-leg / single-arm: preferred when weights are light
  easy?: boolean;        // beginner-friendly: preferred for beginners
  min?: Level;           // lowest experience level that gets it
  reps?: string;         // fixed target (holds, assisted reps)
}

export const PATTERNS: Record<PatternKey, { muscle: string; compound: boolean; lower?: boolean }> = {
  squat:       { muscle: 'Legs', compound: true, lower: true },
  lunge:       { muscle: 'Legs', compound: true, lower: true },
  hinge:       { muscle: 'Legs', compound: true, lower: true },
  glute:       { muscle: 'Legs', compound: false, lower: true },
  hamCurl:     { muscle: 'Legs', compound: false, lower: true },
  quadIso:     { muscle: 'Legs', compound: false, lower: true },
  calf:        { muscle: 'Legs', compound: false, lower: true },
  hPush:       { muscle: 'Chest', compound: true },
  inclinePush: { muscle: 'Chest', compound: true },
  chestFly:    { muscle: 'Chest', compound: false },
  vPush:       { muscle: 'Shoulders', compound: true },
  lateral:     { muscle: 'Shoulders', compound: false },
  rearDelt:    { muscle: 'Shoulders', compound: false },
  hPull:       { muscle: 'Back', compound: true },
  vPull:       { muscle: 'Back', compound: true },
  biceps:      { muscle: 'Biceps', compound: false },
  triceps:     { muscle: 'Triceps', compound: false },
  core:        { muscle: 'Core', compound: false },
};

export const POOLS: Record<PatternKey, Candidate[]> = {
  squat: [
    { name: 'Barbell Full Squat', skill: 'bbSquat' },
    { name: 'Hack Squat', easy: true },
    { name: 'Leg Press', easy: true },
    { name: 'Front Barbell Squat', skill: 'bbSquat', min: 'intermediate' },
    { name: 'Goblet Squat', easy: true },
    { name: 'Smith Machine Squat', easy: true },
    { name: 'Dumbbell Squat', easy: true },
    { name: 'Front Squats With Two Kettlebells', skill: 'kbClean' },
    { name: 'Plie Dumbbell Squat', easy: true },
    { name: 'Squats - With Bands', easy: true },
    { name: 'Freehand Jump Squat', skill: 'plyo', squat: 2 },
    { name: 'Bodyweight Squat', squat: 0, easy: true },
  ],
  lunge: [
    { name: 'Split Squat with Dumbbells', uni: true },
    { name: 'Dumbbell Lunges', uni: true },
    { name: 'Barbell Lunge', uni: true, min: 'intermediate' },
    { name: 'Dumbbell Rear Lunge', uni: true, easy: true },
    { name: 'Dumbbell Step Ups', uni: true, easy: true },
    { name: 'Smith Single-Leg Split Squat', uni: true },
    { name: 'Barbell Walking Lunge', uni: true, min: 'intermediate' },
    { name: 'Lunge Pass Through', uni: true },
    { name: 'Kettlebell Pistol Squat', uni: true, squat: 3, min: 'advanced' },
    { name: 'Suspended Split Squat', uni: true, squat: 2 },
    { name: 'Split Jump', uni: true, skill: 'plyo', squat: 2 },
    { name: 'Bodyweight Walking Lunge', uni: true, squat: 1, easy: true },
    { name: 'Step-up with Knee Raise', uni: true, squat: 1, easy: true },
  ],
  hinge: [
    { name: 'Barbell Deadlift', skill: 'deadlift' },
    { name: 'Romanian Deadlift' },
    { name: 'Stiff-Legged Dumbbell Deadlift', easy: true },
    { name: 'One-Arm Kettlebell Swings', skill: 'kbSwing' },
    { name: 'Sumo Deadlift', skill: 'deadlift', min: 'intermediate' },
    { name: 'Hyperextensions (Back Extensions)', easy: true },
    { name: 'Cable Deadlifts', easy: true },
    { name: 'Pull Through', easy: true },
    { name: 'Leverage Deadlift', easy: true },
    { name: 'Kettlebell One-Legged Deadlift', uni: true },
    { name: 'Good Morning', min: 'intermediate' },
    { name: 'Smith Machine Stiff-Legged Deadlift' },
    { name: 'Band Good Morning', easy: true },
    { name: 'Single Leg Glute Bridge', uni: true, squat: 1 },
    { name: 'Superman', easy: true, reps: '10–15' },
  ],
  glute: [
    { name: 'Barbell Hip Thrust' },
    { name: 'Barbell Glute Bridge' },
    { name: 'Smith Machine Hip Raise' },
    { name: 'One-Legged Cable Kickback', uni: true },
    { name: 'Physioball Hip Bridge', easy: true },
    { name: 'Single Leg Glute Bridge', uni: true, squat: 1 },
    { name: 'Thigh Abductor', easy: true },
    { name: 'Butt Lift (Bridge)', squat: 0, easy: true },
    { name: 'Glute Kickback', easy: true },
  ],
  hamCurl: [
    { name: 'Lying Leg Curls', easy: true },
    { name: 'Seated Leg Curl', easy: true },
    { name: 'Standing Leg Curl', easy: true },
    { name: 'Glute Ham Raise', min: 'intermediate' },
    { name: 'Ball Leg Curl', easy: true },
    { name: 'Seated Band Hamstring Curl', easy: true },
    { name: 'Floor Glute-Ham Raise', squat: 3, min: 'advanced' },
    { name: 'Platform Hamstring Slides', squat: 1 },
  ],
  quadIso: [
    { name: 'Leg Extensions', easy: true },
    { name: 'Single-Leg Leg Extension', uni: true },
  ],
  calf: [
    { name: 'Standing Calf Raises', easy: true },
    { name: 'Seated Calf Raise', easy: true },
    { name: 'Calf Press On The Leg Press Machine' },
    { name: 'Smith Machine Calf Raise' },
    { name: 'Standing Dumbbell Calf Raise', easy: true },
    { name: 'Standing Barbell Calf Raise' },
    { name: 'Dumbbell Seated One-Leg Calf Raise', uni: true },
    { name: 'Calf Raises - With Bands', easy: true },
  ],
  hPush: [
    { name: 'Barbell Bench Press - Medium Grip', skill: 'bench' },
    { name: 'Dumbbell Bench Press', easy: true },
    { name: 'Machine Bench Press', easy: true },
    { name: 'Leverage Chest Press', easy: true },
    { name: 'Dips - Chest Version', skill: 'dips' },
    { name: 'Smith Machine Bench Press' },
    { name: 'Cable Chest Press', easy: true },
    { name: 'Dumbbell Bench Press with Neutral Grip' },
    { name: 'Dumbbell Floor Press', easy: true },
    { name: 'Alternating Floor Press' },
    { name: 'One-Arm Kettlebell Floor Press', uni: true },
    { name: 'Bench Press - With Bands' },
    // Bodyweight versions, hardest first (the strength check filters out what's too hard)
    { name: 'Single-Arm Push-Up', push: 4, min: 'advanced' },
    { name: 'Clock Push-Up', push: 3 },
    { name: 'Plyo Push-up', push: 3, skill: 'plyo' },
    { name: 'Push-Ups With Feet On An Exercise Ball', push: 3 },
    { name: 'Suspended Push-Up', push: 2 },
    { name: 'Push Up to Side Plank', push: 2 },
    { name: 'Pushups', push: 1, easy: true },
    { name: 'Push-Up Wide', push: 1 },
    { name: 'Incline Push-Up', push: 0, easy: true, reps: '6–12' },
  ],
  inclinePush: [
    { name: 'Barbell Incline Bench Press - Medium Grip', skill: 'bench' },
    { name: 'Incline Dumbbell Press', easy: true },
    { name: 'Leverage Incline Chest Press', easy: true },
    { name: 'Hammer Grip Incline DB Bench Press' },
    { name: 'Smith Machine Incline Bench Press' },
    { name: 'Incline Cable Chest Press', easy: true },
    { name: 'Incline Dumbbell Bench With Palms Facing In' },
    { name: 'Decline Push-Up', push: 2 },
    { name: 'Push-Ups With Feet Elevated', push: 2 },
  ],
  chestFly: [
    { name: 'Cable Crossover' },
    { name: 'Incline Dumbbell Flyes' },
    { name: 'Butterfly', easy: true },
    { name: 'Dumbbell Flyes' },
    { name: 'Low Cable Crossover' },
    { name: 'Flat Bench Cable Flyes' },
    { name: 'Cross Over - With Bands', easy: true },
    { name: 'Svend Press', easy: true },
  ],
  vPush: [
    { name: 'Standing Military Press', skill: 'ohp' },
    { name: 'Dumbbell Shoulder Press', easy: true },
    { name: 'Machine Shoulder (Military) Press', easy: true },
    { name: 'Arnold Dumbbell Press' },
    { name: 'Seated Dumbbell Press', easy: true },
    { name: 'Leverage Shoulder Press', easy: true },
    { name: 'Barbell Shoulder Press', skill: 'ohp' },
    { name: 'Smith Machine Overhead Shoulder Press' },
    { name: 'Standing Dumbbell Press', easy: true },
    { name: 'Standing Palms-In Dumbbell Press' },
    { name: 'Two-Arm Kettlebell Military Press', skill: 'kbClean' },
    { name: 'Alternating Kettlebell Press', skill: 'kbClean' },
    { name: 'Kettlebell Arnold Press', skill: 'kbClean' },
    { name: 'Kettlebell Seated Press', skill: 'kbClean' },
    { name: 'Cable Shoulder Press' },
    { name: 'Shoulder Press - With Bands', easy: true },
    { name: 'Handstand Push-Ups', skill: 'hspu', push: 3 },
    { name: 'Decline Push-Up', push: 2 },
  ],
  lateral: [
    { name: 'Side Lateral Raise', easy: true },
    { name: 'Cable Seated Lateral Raise' },
    { name: 'Seated Side Lateral Raise', easy: true },
    { name: 'One-Arm Incline Lateral Raise' },
    { name: 'Lateral Raise - With Bands', easy: true },
  ],
  rearDelt: [
    { name: 'Face Pull' },
    { name: 'Reverse Machine Flyes', easy: true },
    { name: 'Seated Bent-Over Rear Delt Raise', easy: true },
    { name: 'Reverse Flyes' },
    { name: 'Cable Rear Delt Fly' },
    { name: 'Bent Over Dumbbell Rear Delt Raise With Head On Bench' },
    { name: 'Band Pull Apart', easy: true },
    { name: 'Back Flyes - With Bands' },
  ],
  hPull: [
    { name: 'Bent Over Barbell Row' },
    { name: 'Seated Cable Rows', easy: true },
    { name: 'One-Arm Dumbbell Row', uni: true, easy: true },
    { name: 'Leverage Iso Row', easy: true },
    { name: 'T-Bar Row with Handle' },
    { name: 'Dumbbell Incline Row', easy: true },
    { name: 'Bent Over Two-Dumbbell Row' },
    { name: 'Seated One-arm Cable Pulley Rows', uni: true },
    { name: 'Smith Machine Bent Over Row' },
    { name: 'One-Arm Kettlebell Row', uni: true },
    { name: 'Two-Arm Kettlebell Row' },
    { name: 'Alternating Renegade Row', push: 2 },
    { name: 'Inverted Row', pull: 0 },
    { name: 'Suspended Row', pull: 0, easy: true },
    { name: 'Inverted Row with Straps', pull: 0 },
  ],
  vPull: [
    { name: 'Pullups', pull: 2 },
    { name: 'Wide-Grip Lat Pulldown', easy: true },
    { name: 'Chin-Up', pull: 1 },
    { name: 'Close-Grip Front Lat Pulldown', easy: true },
    { name: 'V-Bar Pulldown', easy: true },
    { name: 'Leverage High Row', easy: true },
    { name: 'Underhand Cable Pulldowns' },
    { name: 'Weighted Pull Ups', pull: 3, min: 'intermediate' },
    { name: 'Mixed Grip Chin', pull: 2 },
    { name: 'One Arm Lat Pulldown', uni: true },
    { name: 'Band Assisted Pull-Up', pull: 0, easy: true, reps: '5–8' },
    { name: 'Scapular Pull-Up', pull: 0, easy: true, reps: '8–12' },
    { name: 'Straight-Arm Pulldown' },
  ],
  biceps: [
    { name: 'Barbell Curl' },
    { name: 'Dumbbell Bicep Curl', easy: true },
    { name: 'Hammer Curls', easy: true },
    { name: 'Incline Dumbbell Curl' },
    { name: 'EZ-Bar Curl', easy: true },
    { name: 'Preacher Curl' },
    { name: 'Standing Biceps Cable Curl', easy: true },
    { name: 'Cable Hammer Curls - Rope Attachment' },
    { name: 'Machine Bicep Curl', easy: true },
    { name: 'Machine Preacher Curls' },
    { name: 'Concentration Curls', uni: true },
    { name: 'Zottman Curl' },
    { name: 'Close-Grip EZ-Bar Curl with Band' },
    { name: 'Chin-Up', pull: 1 },
  ],
  triceps: [
    { name: 'Triceps Pushdown', easy: true },
    { name: 'EZ-Bar Skullcrusher' },
    { name: 'Close-Grip Barbell Bench Press', skill: 'bench' },
    { name: 'Standing Dumbbell Triceps Extension', easy: true },
    { name: 'Triceps Pushdown - Rope Attachment', easy: true },
    { name: 'Cable Rope Overhead Triceps Extension' },
    { name: 'Dips - Triceps Version', skill: 'dips' },
    { name: 'Lying Triceps Press' },
    { name: 'Lying Dumbbell Tricep Extension' },
    { name: 'Machine Triceps Extension', easy: true },
    { name: 'Dip Machine', easy: true },
    { name: 'Seated Triceps Press' },
    { name: 'Tricep Dumbbell Kickback', easy: true },
    { name: 'Band Skull Crusher' },
    { name: 'Speed Band Overhead Triceps' },
    { name: 'Push-Ups - Close Triceps Position', push: 2 },
    { name: 'Bench Dips', push: 1, easy: true },
  ],
  core: [
    { name: 'Hanging Leg Raise', skill: 'hangingRaise' },
    { name: 'Cable Crunch' },
    { name: 'Plank', easy: true, reps: '30–60 s' },
    { name: 'Ab Roller', min: 'intermediate' },
    { name: 'Pallof Press', easy: true },
    { name: 'Russian Twist' },
    { name: 'Knee/Hip Raise On Parallel Bars', easy: true },
    { name: 'Dead Bug', easy: true },
    { name: 'Reverse Crunch', easy: true },
    { name: 'Standing Cable Wood Chop' },
    { name: 'Exercise Ball Pull-In' },
    { name: 'Exercise Ball Crunch', easy: true },
    { name: 'Weighted Crunches' },
    { name: 'Suspended Fallout', min: 'intermediate' },
    { name: 'Side Bridge', easy: true, reps: '20–40 s each side' },
    { name: 'Crunches', easy: true },
    { name: 'Mountain Climbers', reps: '30–45 s' },
    { name: 'Leg Pull-In', easy: true },
    { name: 'Air Bike' },
    { name: 'Jackknife Sit-Up', min: 'intermediate' },
    { name: 'Tuck Crunch' },
    { name: 'Cross-Body Crunch' },
    { name: 'Decline Crunch' },
    { name: 'Ab Crunch Machine', easy: true },
  ],
};
