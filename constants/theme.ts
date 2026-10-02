// constants/theme.ts  –  Neumorphism (Soft UI) Theme

export const LIGHT_THEME = {
  bg:        '#E8ECF0',
  surface:   '#E8ECF0',
  card:      '#F0F4F8',
  border:    '#D1D9E6',
  shadowDark:  '#BFC8D6',
  shadowLight: '#FFFFFF',
  accent:    '#4A90D9',
  accentDim: '#D6E4F4',
  muted:     '#A0ABBF',
  textDim:   '#8A96A8',
  text:      '#2D3748',
  textSub:   '#4A5568',
  water:     '#29B6F6',
  protein:   '#F5A623',
  calories:  '#E05C5C',
  green:     '#5BB98C',
  greenDim:  '#D2F0E4',
  red:       '#E05C5C',
  redDim:    '#FAD5D5',
  yellow:    '#F5C842',
  purple:    '#8C6FD6',
  orange:    '#F5A623',
  teal:      '#36B8C8',
  mg: {
    Chest:        '#E05C5C', 'Upper Back': '#4A90D9', 'Lower Back': '#2563B0',
    Shoulders:    '#8C6FD6', Biceps:      '#5BB98C', Triceps:     '#36B8C8',
    Legs:         '#F5A623', Core:        '#F07850', Forearms:    '#A07860',
    Rest:         '#A0ABBF',
    // Legacy alias kept for old data
    Back:         '#4A90D9',
  } as Record<string, string>,
  mgDark: {
    Chest:        '#FAD5D5', 'Upper Back': '#D6E4F4', 'Lower Back': '#BFDBFE',
    Shoulders:    '#E4DAFA', Biceps:      '#D2F0E4', Triceps:     '#D0F2F6',
    Legs:         '#FDE8C8', Core:        '#FAE0D4', Forearms:    '#EEE0D8',
    Rest:         '#DDE2EA', Back:        '#D6E4F4',
  } as Record<string, string>,
};

export const DARK_THEME = {
  // Pure AMOLED Pitch Black
  bg:        '#000000',
  surface:   '#000000',
  // Deep OLED elevated card surface with high-contrast subtle depth
  card:      '#0D0D11',
  // Razor-sharp modern OLED border
  border:    '#1E1E26',
  shadowDark:  '#000000',
  shadowLight: '#14141A',
  // Luminous accents optimized for pure black OLED displays
  accent:    '#3B82F6',
  accentDim: '#0F2342',
  muted:     '#71717A',
  textDim:   '#A1A1AA',
  text:      '#FFFFFF',
  textSub:   '#D4D4D8',
  water:     '#38BDF8',
  protein:   '#F59E0B',
  calories:  '#EF4444',
  green:     '#10B981',
  greenDim:  '#06281E',
  red:       '#EF4444',
  redDim:    '#2E0D0D',
  yellow:    '#FBBF24',
  purple:    '#A855F7',
  orange:    '#FB923C',
  teal:      '#14B8A6',
  mg: {
    Chest:        '#EF4444', 'Upper Back': '#3B82F6', 'Lower Back': '#2563EB',
    Shoulders:    '#A855F7', Biceps:      '#10B981', Triceps:     '#06B6D4',
    Legs:         '#F59E0B', Core:        '#F97316', Forearms:    '#B45309',
    Rest:         '#71717A', Back:        '#3B82F6',
  } as Record<string, string>,
  mgDark: {
    Chest:        '#2E0D0D', 'Upper Back': '#0F2342', 'Lower Back': '#0A1B33',
    Shoulders:    '#250E3A', Biceps:      '#06281E', Triceps:     '#05252E',
    Legs:         '#2C1A04', Core:        '#2E1205', Forearms:    '#241104',
    Rest:         '#14141A', Back:        '#0F2342',
  } as Record<string, string>,
};

// Default export keeps backward compat (light theme)
export const C = LIGHT_THEME;

export type Theme = typeof LIGHT_THEME;


// ── Neumorphic Shadow Helpers ──────────────────────────────────────
// Use these in your StyleSheet for the characteristic soft-shadow look.
export const NEU = {
  // Raised element (casts shadows outward)
  raised: {
    shadowColor:   '#BFC8D6',
    shadowOffset:  { width: 6, height: 6 },
    shadowOpacity: 1,
    shadowRadius:  10,
    elevation:     6,
  },
  // The "highlight" layer is added as a separate white-shadow layer
  // (iOS only supports one shadow; use borderColor tricks on Android)
  highlight: {
    shadowColor:   '#FFFFFF',
    shadowOffset:  { width: -6, height: -6 },
    shadowOpacity: 1,
    shadowRadius:  10,
  },
  // Inset / pressed state  (achieved via inner borders on RN)
  pressed: {
    shadowColor:   '#BFC8D6',
    shadowOffset:  { width: 4, height: 4 },
    shadowOpacity: 0.6,
    shadowRadius:  6,
    elevation:     2,
  },
};

export const MUSCLE_GROUPS = ['Chest','Upper Back','Lower Back','Shoulders','Biceps','Triceps','Legs','Core','Forearms'];
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
  { name:'Bench Press',    muscle:'Chest',     color:'#E05C5C', icon:'dumbbell', family: 'MaterialCommunityIcons' },
  { name:'Squat',          muscle:'Legs',      color:'#F5A623', icon:'weight-lifter', family: 'MaterialCommunityIcons' },
  { name:'Deadlift',       muscle:'Back',      color:'#4A90D9', icon:'barbell-outline', family: 'Ionicons' },
  { name:'Overhead Press', muscle:'Shoulders', color:'#8C6FD6', icon:'arrow-up-circle-outline', family: 'Ionicons' },
  { name:'Pull Up',        muscle:'Back',      color:'#36B8C8', icon:'arrow-up-outline', family: 'Ionicons' },
  { name:'Muscle Up',      muscle:'Back',      color:'#F07850', icon:'flash-outline', family: 'Ionicons' },
  { name:'Barbell Row',    muscle:'Back',      color:'#5BB98C', icon:'swap-vertical-outline', family: 'Ionicons' },
  { name:'Dip',            muscle:'Chest',     color:'#F5C842', icon:'arrow-down-outline', family: 'Ionicons' },
];
