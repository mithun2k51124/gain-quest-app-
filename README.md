# GainQuest Mobile

An offline-first fitness tracker for Android (and iOS), built with React Native + Expo.
Track workouts, personal records, nutrition and habits — with an 873-exercise library,
a personalised split builder and smart reminders. No account needed; your data stays on
the device.

## Features

### Navigation
- Five tabs: **Home · Workouts · Tracker · PRs · Overall** (swipe between them in the same order)
- **Settings** opens from the gear at the top right of every screen; **Analytics** from the chart button on Home.
  Both have a back arrow that returns to where you came from

### Home
- Draggable widgets (hold to lift, drag to reorder): Today's Workout, Overview, Exercise Library,
  This Week & Habits, Intake Goals, Reminders. **Customize widgets** at the end of the list
- Today's workout counts as done only when every planned exercise has all its target sets logged (shows "3/7 done" until then)
- **This Week & Habits** — today's workout, water and protein tiles plus days hit this week
- **Intake Goals** — a large water panel with a Log button, plus protein and calorie tiles
- **Exercise Library** widget — three daily picks that open their guide, and a Browse button

### Exercise Library
- **873 exercises** with start/end photos, step-by-step instructions, muscles worked, equipment and level
- Grouped by muscle → movement type (Presses, Rows, Squats, Stretches, …), collapsible
- Search and equipment filters; tap any exercise for an animated two-photo preview

### Workouts
- **Split builder** — experience, session length, days, rest days, place (gym / home / bodyweight), an equipment
  checklist, a strength check and bodyweight. It builds a weekly plan (Full Body, Upper/Lower, Push/Pull/Legs, hybrids)
  with **sets × reps and a starting weight for every exercise**, rotating exercises every 1–4 weeks.
  Preview with collapsible days, swaps and guides before saving
- **Real weights only** — dumbbells 2, 2.5, 5, 7.5 … (2.5 kg steps), barbells and Smith machine in 5 kg steps
  (plates go on in pairs), machines in 5 kg steps, kettlebells / plates / balls in their real sizes
- **Planner** — collapsible days with today first and a **Start** button on today; add exercises from the whole library
- **Log** — each exercise shows today's goal, a looping preview and scroll wheels for reps and weight, set to the
  recommendation. **Start exercise** opens a full-screen set page: weight and reps, a large timer (or the exercise
  playing big with a small clock; an eye button keeps the preview on), **I'm done** logs the set, then optional
  👍 / 👎 suggests the next set one step heavier or lighter, or **Rest now** goes back. The set counter is fixed
  (Set 2 of 3) with **One more set** after the goal. "How did it feel?" on the card sets next session's weight
- Bodyweight moves log reps only (no weight box); PR detection on every set
- **Muscles** — all nine muscle groups with a recovery ring, status (ready, recovering, rest it, overdue), advice,
  a last-7-days strip and weekly / 4-week frequency, plus a "Today's call" of what to train and what to rest
- **History** — a day picker (arrows jump between workout days, a small month calendar) above a body map where each
  trained muscle is shaded red by sets (1–5+), with upper / lower body panels beside it, and that day's workout below

### Personal Records
- Every attempt saved as an editable entry; your best is recalculated automatically
- Records grouped by **body part → equipment** (barbell, dumbbells, machines & cables, kettlebells, bodyweight, bands);
  **View all** lists every logged exercise with how many PRs it has broken
- Interactive progress chart, "PRs broken this month", pinned lifts, search, a **Log a PR** card
- Bodyweight moves are tracked by reps; create your own exercises (weight × reps or reps only)
- Scroll-wheel input with a typing mode

### Tracker
- Water, food (search, barcode and nutrition-label scanning), creatine and daily habits (draggable sections)

### Overall
- Activity rings (choose what each ring shows from a button in the rings card), score and ring breakdown

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
├── components/               # ExerciseLibrary, ExerciseGuide, SplitWizard, SetSession, BodyAnatomy,
│                             # WorkoutCalendar, DragWidget, SettingsButton, HeaderBack, Reminders,
│                             # NutritionTrend, WheelPicker, food scanner/search, AI logger, ui
├── constants/
│   ├── theme.ts              # Colours, muscle groups, food DB
│   ├── equipment.ts          # Equipment checklist, what each exercise needs, weight steps
│   ├── exercisePools.ts      # Split builder exercise pools per movement
│   ├── startingLoads.ts      # Starting-weight table and real weight sizes
│   ├── exerciseCatalog.ts    # Exercise library API (findExercise, EXERCISE_LIBRARY, ...)
│   ├── exerciseCatalog.json  # GENERATED — 873 exercises
│   ├── exerciseImages.ts     # GENERATED — preview image requires
│   └── legacyExerciseNames.ts# GENERATED — old app names → catalog names
├── db/database.ts            # SQLite schema, migrations and all data access
├── utils/                    # splitGenerator, loadFeedback, swipeLock, reminders, exerciseNames, parsers
├── assets/exercises/         # GENERATED — 1,746 compact WebP previews (~16 MB)
├── assets/muscles/           # Muscle masks traced from body_front/back.png for the History body map
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

- `settings`, `goals` — preferences and daily targets (the split lives in `split_config`, weight feedback in
  `load_feedback`, widget order in `home_sections_order`)
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
- **Starting weights** — bodyweight × an exercise ratio × experience and strength factors, rounded to weights that
  exist and capped at a home user's heaviest equipment; 👍 / 👎 feedback then moves it a step at a time
- **Muscle recovery** — about 3 days for legs and lower back, 2 for chest, back, shoulders and arms, 1 for core and forearms
- **Widget dragging** — the tab swipe pauses while a widget is lifted (utils/swipeLock), so drags never turn into page changes
- **Name-tolerant exercises** — "Lateral Raises", "triceps push-down" and old app names all resolve to one catalog exercise
- **Smart reminders** — notifications are scheduled 7 days ahead and refreshed when the app opens or closes

## Credits

- Exercise data and photos: [free-exercise-db](https://github.com/yuhonas/free-exercise-db) — public domain (Unlicense)
- Food data: [Open Food Facts](https://world.openfoodfacts.org)
