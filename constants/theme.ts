// constants/theme.ts

export const C = {
  bg:       '#0A0E1A',
  surface:  '#111827',
  card:     '#161C2A',
  border:   '#1E2538',
  accent:   '#7C3AED',
  accentDim:'#4A148C',
  muted:    '#3A4558',
  text:     '#FFFFFF',
  textSub:  '#8B9BAE',
  textDim:  '#4A5568',

  water:    '#29B6F6',
  protein:  '#FFA726',
  calories: '#EF5350',
  green:    '#4CAF50',
  greenDim: '#1B5E20',
  red:      '#F44336',
  redDim:   '#B71C1C',
  yellow:   '#FFD700',
  purple:   '#9C27B0',
  orange:   '#FF9800',
  teal:     '#00BCD4',

  mg: {
    Chest:     '#E91E63',
    Back:      '#2196F3',
    Shoulders: '#9C27B0',
    Biceps:    '#4CAF50',
    Triceps:   '#00BCD4',
    Legs:      '#FF9800',
    Core:      '#FF5722',
    Forearms:  '#795548',
    Rest:      '#374151',
  } as Record<string,string>,

  mgDark: {
    Chest:     '#3B0A1F',
    Back:      '#0A1F3B',
    Shoulders: '#2A0A3B',
    Biceps:    '#0A2B0A',
    Triceps:   '#002B2B',
    Legs:      '#3B1F00',
    Core:      '#3B0F00',
    Forearms:  '#1C0F08',
    Rest:      '#1A1F2E',
  } as Record<string,string>,
};

export const MUSCLE_GROUPS = ['Chest','Back','Shoulders','Biceps','Triceps','Legs','Core','Forearms'];
export const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];

export const EXERCISE_LIBRARY: Record<string, string[]> = {
  Chest:     ['Bench Press','Incline Bench Press','Decline Bench Press','Dumbbell Fly','Incline Dumbbell Press','Cable Crossover','Push Up','Chest Dip','Pec Deck'],
  Back:      ['Deadlift','Pull Up','Chin Up','Bent Over Row','Seated Cable Row','Lat Pulldown','Single Arm Dumbbell Row','T-Bar Row','Face Pull','Muscle Up'],
  Shoulders: ['Overhead Press','Dumbbell Shoulder Press','Arnold Press','Lateral Raise','Front Raise','Rear Delt Fly','Upright Row','Shrugs','Cable Lateral Raise'],
  Biceps:    ['Barbell Curl','Dumbbell Curl','Hammer Curl','Incline Dumbbell Curl','Concentration Curl','Cable Curl','Preacher Curl','Spider Curl','Reverse Curl'],
  Triceps:   ['Tricep Dip','Close Grip Bench Press','Skull Crusher','Tricep Pushdown','Overhead Tricep Extension','Cable Kickback','Diamond Push Up'],
  Legs:      ['Squat','Front Squat','Leg Press','Romanian Deadlift','Leg Curl','Leg Extension','Bulgarian Split Squat','Lunges','Calf Raise','Hack Squat'],
  Core:      ['Plank','Crunch','Sit Up','Leg Raise','Russian Twist','Cable Crunch','Ab Wheel Rollout','Hanging Leg Raise','Dragon Flag'],
  Forearms:  ["Wrist Curl","Reverse Wrist Curl","Farmer's Walk","Plate Pinch","Hammer Curl","Wrist Roller","Dead Hang"],
};

export const FOOD_DB: Record<string, [number, number]> = {
  'Chicken Breast (100g)':   [31, 165],
  'Chicken Thigh (100g)':    [26, 209],
  'Grilled Salmon (100g)':   [25, 208],
  'Tuna (can, 100g)':        [30, 116],
  'Eggs (2 large)':          [13, 156],
  'Egg Whites (100g)':       [11,  52],
  'Greek Yogurt (200g)':     [20, 130],
  'Cottage Cheese (100g)':   [11,  98],
  'Milk (250ml)':            [ 8, 149],
  'Whey Protein Shake':      [25, 130],
  'Casein Protein Shake':    [24, 120],
  'Beef (lean, 100g)':       [26, 215],
  'Tofu (100g)':             [ 8,  76],
  'Lentils (100g cooked)':   [ 9, 116],
  'Oats (100g dry)':         [17, 389],
  'Brown Rice (100g cooked)':[3,  123],
  'White Rice (100g cooked)':[3,  130],
  'Sweet Potato (100g)':     [ 2,  86],
  'Banana':                  [ 1,  89],
  'Peanut Butter (2 tbsp)':  [ 8, 190],
  'Protein Bar':             [20, 220],
  'Almonds (30g)':           [ 6, 173],
};

export const WATER_OPTIONS = [
  { label: 'Sip  (100 ml)',      ml: 100 },
  { label: 'Small  (150 ml)',    ml: 150 },
  { label: 'Glass  (250 ml)',    ml: 250 },
  { label: 'Large  (400 ml)',    ml: 400 },
  { label: 'Bottle  (500 ml)',   ml: 500 },
  { label: '750 ml',             ml: 750 },
  { label: '1 Litre',            ml: 1000 },
  { label: '1.5 Litres',         ml: 1500 },
  { label: '2 Litres',           ml: 2000 },
];

export const FEATURED_EXERCISES = [
  { name:'Bench Press',    muscle:'Chest',     color:'#E91E63', icon:'💪' },
  { name:'Squat',          muscle:'Legs',      color:'#FF9800', icon:'🦵' },
  { name:'Deadlift',       muscle:'Back',      color:'#2196F3', icon:'🏋️' },
  { name:'Overhead Press', muscle:'Shoulders', color:'#9C27B0', icon:'🏔️' },
  { name:'Pull Up',        muscle:'Back',      color:'#00BCD4', icon:'🔝' },
  { name:'Muscle Up',      muscle:'Back',      color:'#FF5722', icon:'⚡' },
  { name:'Barbell Row',    muscle:'Back',      color:'#4CAF50', icon:'↕️' },
  { name:'Dip',            muscle:'Chest',     color:'#FFC107', icon:'⬇️' },
];
