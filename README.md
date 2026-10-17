# GainQuest Mobile

An offline-first fitness tracker for Android (and iOS), built with React Native + Expo.
Track workouts, personal records, nutrition and habits — with an 873-exercise library,
a personalised split builder and smart reminders. No account needed; your data stays on
the device.

## Features

### Home
- Draggable widgets (hold to reorder): today's workout, overview, intake rings, week & habits, reminders
- Header shortcuts: **Exercise Library**, **Reminders bell** (bright when notifications are on), **Edit widgets**

### Exercise Library
- **873 exercises** with start/end photos, step-by-step instructions, muscles worked, equipment and level
- Grouped by muscle → movement type (Presses, Rows, Squats, Stretches, …), collapsible
- Search and equipment filters; tap any exercise for an animated two-photo preview

### Workouts
- **Split builder** — answer 4 questions (experience, minutes per session, days per week, rest days) and get a
  research-based weekly plan (Full Body, Upper/Lower, Push/Pull/Legs, hybrids) with sets × reps
- **Planner** — collapsible days with today first; add exercises with search across the whole library
- **Log** — log sets per exercise with a ▶ preview for each move; PR detection on every set
- **Muscles** recovery tracker and **History**

### Personal Records
- Every attempt saved as an editable entry; your best is recalculated automatically
- Interactive progress chart, "PRs broken this month", pinned lifts, search
- Bodyweight moves are tracked by reps; create your own exercises (weight × reps or reps only)
- Scroll-wheel input with a typing mode

### Tracker
- Water, food (search, barcode and nutrition-label scanning), creatine and daily habits

### Analytics
- Nutrition **Trends** chart — water / protein / calories, 7 or 30 days, touch any day to inspect
- Workout, progress-photo and body-weight views

### Reminders
- Your own reminders for water, protein, creatine, workouts or anything custom — multiple times a day, any minute, chosen days
- Smart: a reminder is skipped once that goal is done today; tapping a notification opens the matching section

### AI Workout Logger
- Floating button on every tab: type or speak "bench 100 for 5" and it logs the sets; also answers fitness questions

## Tech Stack

| Layer | Choice |
|-------|--------|
| Framework | React Native 0.86 + Expo SDK 57 (New Architecture, Hermes) |
| Navigation | Expo Router (file-based) + bottom tabs |
| Database | expo-sqlite (local SQLite) with versioned migrations |
| Charts | react-native-svg (custom charts) + victory-native |
| Notifications | expo-notifications (local only) |
| Other | expo-haptics, expo-speech-recognition, ML Kit text recognition, expo-camera, react-native-draggable-flatlist |

## Project Structure

```
gainquest-mobile/
├── app/                      # Screens (Expo Router)
│   ├── _layout.tsx           # Root: DB init, tabs, swipe navigation, notification taps
│   ├── index.tsx             # Home dashboard (draggable widgets)
│   ├── tracker.tsx           # Water, food, creatine, habits
│   ├── overall.tsx           # Overall rings
│   ├── workouts.tsx          # Split, Planner, Log, Muscles, History
│   ├── prs.tsx               # Personal records
│   ├── analytics.tsx         # Analytics & progress photos
│   └── settings.tsx          # Goals, profile, reset
├── components/               # ExerciseLibrary, ExerciseGuide, SplitWizard, Reminders,
│                             # NutritionTrend, WheelPicker, food scanner/search, AI logger, ui
├── constants/
│   ├── theme.ts              # Colours, muscle groups, food DB
│   ├── exerciseCatalog.ts    # Exercise library API (findExercise, EXERCISE_LIBRARY, ...)
│   ├── exerciseCatalog.json  # GENERATED — 873 exercises
│   ├── exerciseImages.ts     # GENERATED — preview image requires
│   └── legacyExerciseNames.ts# GENERATED — old app names → catalog names
├── db/database.ts            # SQLite schema, migrations and all data access
├── utils/                    # splitGenerator, reminders, exerciseNames, workout/food parsers
├── assets/exercises/         # GENERATED — 1,746 compact WebP previews (~16 MB)
└── android/                  # Native Android project
```

## Setup

### Prerequisites
- Node.js 18+ (the repo uses `legacy-peer-deps`, see `.npmrc`)
- For Android builds: JDK 17 and the Android SDK

### Run in development
```bash
npm install
npx expo start --go      # open in Expo Go (scan the QR code)
```
Expo Go can't run everything: **reminder notifications**, **nutrition-label scanning** (ML Kit) and possibly
**voice logging** need an installed build. The rest of the app works in Expo Go.

### Build for Android
The project contains a native `android/` folder, so builds run through Gradle:
```bash
cd android
./gradlew assembleRelease   # test APK → android/app/build/outputs/apk/release/
./gradlew bundleRelease     # Play Store AAB → android/app/build/outputs/bundle/release/
```
Release signing reads `GAINQUEST_RELEASE_*` properties (keystore file, alias, passwords).
Keep these out of version control — put them in `~/.gradle/gradle.properties` or environment variables.
Before each Play Store upload, increase `versionCode` in both `app.json` and `android/app/build.gradle`.

## Database

Local SQLite (`gainquest_v2.db`). Main tables:

- `settings`, `goals` — preferences and daily targets
- `daily_logs`, `food_log`, `water_log` — intake and habits per day
- `workout_plans`, `workout_plan_exercises` — weekly plan
- `workout_sessions`, `exercise_logs`, `muscle_tracker`, `streaks` — training history
- `pr_entries` (every attempt), `personal_records` (current best), `pr_history` (legacy), `starred_pr_exercises`
- `custom_exercises` — user-created exercises (weight × reps or reps only)
- `reminders` — reminder schedule
- `weight_history`, `progress_photos`

**Migrations:** `CREATE TABLE IF NOT EXISTS` never changes an existing table, so schema changes go in the
`MIGRATIONS` list in `db/database.ts`. Each runs once, in order, tracked by `PRAGMA user_version`.
Append new entries; never edit or reorder old ones.

## Key Design Decisions

- **Offline-first** — all data in on-device SQLite; no account. The internet is only used for food lookups
  (OpenFoodFacts) and the AI coach's web answers (DuckDuckGo / Wikipedia)
- **Local dates everywhere** — dates are stored as local `YYYY-MM-DD` (never UTC) so streaks and stats don't shift
- **PR scoring** — Epley e1RM = weight × (1 + reps / 30); bodyweight moves are scored by reps
- **Name-tolerant exercises** — "Lateral Raises", "triceps push-down" and old app names all resolve to one catalog exercise
- **Smart reminders** — notifications are scheduled 7 days ahead and refreshed when the app opens or closes

## Credits

- Exercise data and photos: [free-exercise-db](https://github.com/yuhonas/free-exercise-db) — public domain (Unlicense)
- Food data: [Open Food Facts](https://world.openfoodfacts.org)
