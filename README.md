# GainQuest Mobile 🏋️

A complete mobile port of GainQuest desktop fitness tracker, built with React Native + Expo.

## Tech Stack

| Layer | Choice |
|-------|--------|
| Framework | React Native + Expo SDK 51 |
| Navigation | Expo Router v3 (file-based) + Bottom Tabs |
| Database | expo-sqlite (local SQLite — same schema as desktop) |
| Charts | victory-native |
| Icons | @expo/vector-icons (Ionicons) |
| State | React useState + useFocusEffect (no extra lib needed) |

## Project Structure

```
gainquest-mobile/
├── app/
│   ├── _layout.tsx      # Root layout — DB init + Bottom Tab Navigator
│   ├── index.tsx        # Dashboard screen
│   ├── tracker.tsx      # Daily Tracker (water, food, creatine, habits)
│   ├── workouts.tsx     # Workouts (planner, muscle tracker, logger, history)
│   ├── prs.tsx          # Personal Records + progression charts
│   ├── analytics.tsx    # Analytics (weight, nutrition, workout charts)
│   └── settings.tsx     # Settings (goals via dropdowns)
├── components/
│   └── ui.tsx           # Shared components (Card, Ring, Btn, Toggle, etc.)
├── constants/
│   └── theme.ts         # Colours, exercise library, food DB
├── db/
│   └── database.ts      # Complete SQLite layer (mirrors desktop database.py)
├── package.json
├── app.json
├── babel.config.js
└── tsconfig.json
```

## Setup & Run

### Prerequisites
- Node.js 18+
- Expo CLI: `npm install -g expo-cli`
- Expo Go app on your phone (iOS or Android)

### Steps

```bash
# 1. Navigate to project
cd gainquest-mobile

# 2. Install dependencies
npm install

# 3. Start the dev server
npx expo start

# 4. Scan QR code with Expo Go on your phone
```

### Build for production

```bash
# Install EAS CLI
npm install -g eas-cli
eas login

# Configure (first time only)
eas build:configure

# Build Android APK
eas build --platform android --profile preview

# Build iOS (requires Apple Developer account)
eas build --platform ios
```

## Features

### Dashboard
- Hero stat cards (weight, streak, creatine, workout)
- Animated macro rings (water, protein, calories)
- Weekly quick stats
- Habits checklist
- Reminders panel
- Today's scheduled workout

### Daily Tracker
- Water intake with quick buttons + full picker
- Nutrition log with 20+ pre-loaded foods
- Custom food entry
- Creatine big-button toggle
- Daily habits with toggle switches

### Workouts
- **Planner tab** — Weekly schedule with muscle group pill selectors
- **Muscle Tracker** — Recovery status with colour-coded urgency
- **Log Workout** — Session logger with dropdown exercise selection + PR detection popup
- **History** — All past sessions with exercise details

### Personal Records
- Featured lifts (Bench Press, Squat, Deadlift, OHP, Pull Up, Muscle Up, etc.)
- Always shown even with no data — goal-oriented
- Progression chart with e1RM using Epley formula
- PR highlighted in gold with 🏆

### Analytics
- 30-day consistency bars (water, protein, workout, creatine)
- Muscle frequency chart
- Weight trend chart with goal line
- Protein & calorie bar charts
- Workout completion chart

### Settings
- All goals via picker modals (no typing)
- Dark mode toggle
- About info

## Database Schema

Identical to the Python desktop app's `database.py`:

- `settings` — key/value preferences
- `goals` — daily targets
- `daily_logs` — per-day intake and habits
- `food_log` — food entries with macros
- `water_log` — water intake events
- `workout_plans` — weekly schedule
- `workout_sessions` — gym sessions
- `exercise_logs` — sets/reps/weight per exercise
- `personal_records` — current PR per exercise
- `pr_history` — all previous PRs
- `weight_history` — daily body weight
- `muscle_tracker` — last trained date per muscle
- `streaks` — workout streaks

## Key Design Decisions

- **Dark mode first** — matches desktop app aesthetic
- **No typing for selections** — all dropdowns/pickers, only weight needs typing
- **Local only** — zero internet dependency, SQLite stays on device
- **Epley formula** — e1RM = weight × (1 + reps/30) for PR tracking
- **Focus refresh** — each tab reloads data when navigated to
