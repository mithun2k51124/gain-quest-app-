// constants/startingLoads.ts — how heavy to start each weighted exercise in a generated plan.
// Each entry is the implement and a beginner's working weight for ~10 reps as a fraction of
// bodyweight. The generator scales it by experience and the strength check, rounds it to weights
// that exist (dumbbell steps, kettlebell sizes, a 20 kg bar...) and caps it at the heaviest
// weights a home user has. The numbers are deliberately conservative: it's a first-session guess,
// easy to go up from.
//
// Implements:
//   barbell  total weight including a 20 kg bar      ez     total including a 10 kg EZ bar
//   smith    total on a Smith machine                db     per hand, one dumbbell in each
//   db1      one dumbbell held in both hands         kb     one kettlebell
//   kb2      per hand, a kettlebell in each          stack  cable or machine weight stack
//   sled     plate-loaded machine (leg press...)     plate  one weight plate
//   medball  medicine ball                           added  extra weight on a bodyweight move
//   bw       bodyweight (machine or station, no weight to pick)

export type LoadType =
  | 'barbell' | 'ez' | 'smith' | 'db' | 'db1' | 'kb' | 'kb2' | 'stack' | 'sled'
  | 'plate' | 'medball' | 'added' | 'bw';

export const LOADS: Record<string, [LoadType, number]> = {
  // Squat
  'Barbell Full Squat': ['barbell', 0.5],
  'Front Barbell Squat': ['barbell', 0.4],
  'Hack Squat': ['sled', 0.4],
  'Leg Press': ['sled', 0.9],
  'Goblet Squat': ['kb', 0.17],
  'Smith Machine Squat': ['smith', 0.45],
  'Dumbbell Squat': ['db', 0.1],
  'Front Squats With Two Kettlebells': ['kb2', 0.12],
  'Plie Dumbbell Squat': ['db1', 0.17],
  // Lunge
  'Split Squat with Dumbbells': ['db', 0.07],
  'Dumbbell Lunges': ['db', 0.07],
  'Barbell Lunge': ['barbell', 0.3],
  'Dumbbell Rear Lunge': ['db', 0.07],
  'Dumbbell Step Ups': ['db', 0.06],
  'Smith Single-Leg Split Squat': ['smith', 0.25],
  'Barbell Walking Lunge': ['barbell', 0.3],
  'Lunge Pass Through': ['kb', 0.12],
  'Kettlebell Pistol Squat': ['kb', 0.1],
  // Hinge
  'Barbell Deadlift': ['barbell', 0.7],
  'Romanian Deadlift': ['barbell', 0.5],
  'Stiff-Legged Dumbbell Deadlift': ['db', 0.12],
  'One-Arm Kettlebell Swings': ['kb', 0.2],
  'Sumo Deadlift': ['barbell', 0.7],
  'Hyperextensions (Back Extensions)': ['bw', 0],
  'Cable Deadlifts': ['stack', 0.5],
  'Pull Through': ['stack', 0.3],
  'Leverage Deadlift': ['sled', 0.6],
  'Kettlebell One-Legged Deadlift': ['kb', 0.12],
  'Good Morning': ['barbell', 0.3],
  'Smith Machine Stiff-Legged Deadlift': ['smith', 0.45],
  // Glutes
  'Barbell Hip Thrust': ['barbell', 0.6],
  'Barbell Glute Bridge': ['barbell', 0.5],
  'Smith Machine Hip Raise': ['smith', 0.5],
  'One-Legged Cable Kickback': ['stack', 0.07],
  'Thigh Abductor': ['stack', 0.4],
  // Hamstrings and quads
  'Lying Leg Curls': ['stack', 0.3],
  'Seated Leg Curl': ['stack', 0.3],
  'Standing Leg Curl': ['stack', 0.15],
  'Glute Ham Raise': ['bw', 0],
  'Leg Extensions': ['stack', 0.35],
  'Single-Leg Leg Extension': ['stack', 0.17],
  // Calves
  'Standing Calf Raises': ['stack', 0.7],
  'Seated Calf Raise': ['stack', 0.35],
  'Calf Press On The Leg Press Machine': ['sled', 0.9],
  'Smith Machine Calf Raise': ['smith', 0.7],
  'Standing Dumbbell Calf Raise': ['db', 0.15],
  'Standing Barbell Calf Raise': ['barbell', 0.6],
  'Dumbbell Seated One-Leg Calf Raise': ['db1', 0.15],
  // Chest
  'Barbell Bench Press - Medium Grip': ['barbell', 0.45],
  'Dumbbell Bench Press': ['db', 0.14],
  'Machine Bench Press': ['stack', 0.4],
  'Leverage Chest Press': ['sled', 0.4],
  'Smith Machine Bench Press': ['smith', 0.4],
  'Cable Chest Press': ['stack', 0.3],
  'Dumbbell Bench Press with Neutral Grip': ['db', 0.14],
  'Dumbbell Floor Press': ['db', 0.13],
  'Alternating Floor Press': ['kb2', 0.12],
  'One-Arm Kettlebell Floor Press': ['kb', 0.15],
  'Barbell Incline Bench Press - Medium Grip': ['barbell', 0.4],
  'Incline Dumbbell Press': ['db', 0.12],
  'Leverage Incline Chest Press': ['sled', 0.35],
  'Hammer Grip Incline DB Bench Press': ['db', 0.12],
  'Smith Machine Incline Bench Press': ['smith', 0.35],
  'Incline Cable Chest Press': ['stack', 0.25],
  'Incline Dumbbell Bench With Palms Facing In': ['db', 0.12],
  'Cable Crossover': ['stack', 0.08],
  'Incline Dumbbell Flyes': ['db', 0.06],
  'Butterfly': ['stack', 0.3],
  'Dumbbell Flyes': ['db', 0.07],
  'Low Cable Crossover': ['stack', 0.06],
  'Flat Bench Cable Flyes': ['stack', 0.07],
  'Svend Press': ['plate', 0.07],
  // Shoulders
  'Standing Military Press': ['barbell', 0.3],
  'Dumbbell Shoulder Press': ['db', 0.1],
  'Machine Shoulder (Military) Press': ['stack', 0.3],
  'Arnold Dumbbell Press': ['db', 0.08],
  'Seated Dumbbell Press': ['db', 0.1],
  'Leverage Shoulder Press': ['sled', 0.3],
  'Barbell Shoulder Press': ['barbell', 0.3],
  'Smith Machine Overhead Shoulder Press': ['smith', 0.28],
  'Standing Dumbbell Press': ['db', 0.09],
  'Standing Palms-In Dumbbell Press': ['db', 0.09],
  'Two-Arm Kettlebell Military Press': ['kb2', 0.1],
  'Alternating Kettlebell Press': ['kb2', 0.1],
  'Kettlebell Arnold Press': ['kb', 0.1],
  'Kettlebell Seated Press': ['kb', 0.1],
  'Cable Shoulder Press': ['stack', 0.2],
  'Side Lateral Raise': ['db', 0.04],
  'Cable Seated Lateral Raise': ['stack', 0.04],
  'Seated Side Lateral Raise': ['db', 0.04],
  'One-Arm Incline Lateral Raise': ['db', 0.035],
  'Face Pull': ['stack', 0.2],
  'Reverse Machine Flyes': ['stack', 0.25],
  'Seated Bent-Over Rear Delt Raise': ['db', 0.04],
  'Reverse Flyes': ['db', 0.04],
  'Cable Rear Delt Fly': ['stack', 0.05],
  'Bent Over Dumbbell Rear Delt Raise With Head On Bench': ['db', 0.04],
  // Back
  'Bent Over Barbell Row': ['barbell', 0.4],
  'Seated Cable Rows': ['stack', 0.45],
  'One-Arm Dumbbell Row': ['db', 0.17],
  'Leverage Iso Row': ['sled', 0.4],
  'T-Bar Row with Handle': ['barbell', 0.35],
  'Dumbbell Incline Row': ['db', 0.14],
  'Bent Over Two-Dumbbell Row': ['db', 0.13],
  'Seated One-arm Cable Pulley Rows': ['stack', 0.22],
  'Smith Machine Bent Over Row': ['smith', 0.35],
  'One-Arm Kettlebell Row': ['kb', 0.17],
  'Two-Arm Kettlebell Row': ['kb2', 0.13],
  'Alternating Renegade Row': ['kb2', 0.1],
  'Inverted Row': ['bw', 0],
  'Wide-Grip Lat Pulldown': ['stack', 0.5],
  'Close-Grip Front Lat Pulldown': ['stack', 0.5],
  'V-Bar Pulldown': ['stack', 0.5],
  'Leverage High Row': ['sled', 0.45],
  'Underhand Cable Pulldowns': ['stack', 0.5],
  'Weighted Pull Ups': ['added', 0.05],
  'One Arm Lat Pulldown': ['stack', 0.22],
  'Straight-Arm Pulldown': ['stack', 0.25],
  // Biceps
  'Barbell Curl': ['barbell', 0.25],
  'Dumbbell Bicep Curl': ['db', 0.08],
  'Hammer Curls': ['db', 0.09],
  'Incline Dumbbell Curl': ['db', 0.07],
  'EZ-Bar Curl': ['ez', 0.22],
  'Preacher Curl': ['ez', 0.18],
  'Standing Biceps Cable Curl': ['stack', 0.25],
  'Cable Hammer Curls - Rope Attachment': ['stack', 0.25],
  'Machine Bicep Curl': ['stack', 0.25],
  'Machine Preacher Curls': ['stack', 0.22],
  'Concentration Curls': ['db', 0.07],
  'Zottman Curl': ['db', 0.07],
  'Close-Grip EZ-Bar Curl with Band': ['ez', 0.18],
  // Triceps
  'Triceps Pushdown': ['stack', 0.3],
  'EZ-Bar Skullcrusher': ['ez', 0.17],
  'Close-Grip Barbell Bench Press': ['barbell', 0.4],
  'Standing Dumbbell Triceps Extension': ['db1', 0.12],
  'Triceps Pushdown - Rope Attachment': ['stack', 0.25],
  'Cable Rope Overhead Triceps Extension': ['stack', 0.22],
  'Lying Triceps Press': ['ez', 0.17],
  'Lying Dumbbell Tricep Extension': ['db', 0.05],
  'Machine Triceps Extension': ['stack', 0.3],
  'Dip Machine': ['stack', 0.5],
  'Seated Triceps Press': ['db1', 0.12],
  'Tricep Dumbbell Kickback': ['db', 0.04],
  // Core
  'Cable Crunch': ['stack', 0.35],
  'Pallof Press': ['stack', 0.12],
  'Standing Cable Wood Chop': ['stack', 0.15],
  'Weighted Crunches': ['medball', 0.06],
  'Ab Crunch Machine': ['stack', 0.3],
};

// Weights that exist for implements that only come in fixed sizes
export const KETTLEBELL_SIZES = [4, 6, 8, 10, 12, 14, 16, 20, 24, 28, 32];
export const PLATE_SIZES = [1.25, 2.5, 5, 10, 15, 20];
export const MEDBALL_SIZES = [2, 3, 4, 5, 6, 8, 10];
export const BAR_KG = 20;
export const EZ_BAR_KG = 10;
export const SMITH_MIN_KG = 15;
