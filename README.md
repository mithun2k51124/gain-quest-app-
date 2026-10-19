# GainQuest Mobile

An offline-first fitness tracker for Android (and iOS), built with React Native + Expo.
Track workouts, personal records, nutrition and habits — with an 873-exercise library,
a personalised split builder and smart reminders. No account needed; your data stays on
the device.

## Features

### Navigation
- Five tabs: **Home · Workouts · Tracker · PRs · Overall** (swipe between them in the same order). Each tab has its
  own colour and cell; a tinted pill glides to the tab you pick while its icon hops and ripples (with a haptic tick)
- **Settings** opens from the gear at the top right of every screen (it turns like a tuning wheel); **Analytics** from
  the chart button on Home (its bars grow), next to the reminders bell (it rings). Both have a back arrow
- **Pull down** at the top of any screen to reload it: a puck drops in with a ring that fills as you pull, spins while
  it reloads and turns into a green check

### Home
- Draggable widgets: hold one to lift it, drag it over another to swap places, let go to drop it. While it's lifted
  the rest of the board frosts over (real blur on Android 12+ / iOS) with a name tag on each widget and a dashed slot
  where it will land. **Customize widgets** at the end of the list
- Today's workout counts as done only when every planned exercise has all its target sets logged (shows "3/7 done" until then)
- Small looping animations keep the board alive: the streak fire flickers, today's dumbbell keeps doing reps, the
  library's book turns its pages and "Build your split" stacks coloured blocks
- **Overview** — workout streak with this week's training days, plus today's workout, supplements and body weight
- **Today's Habits** — workout, water and protein, each with a battery in its own colour (purple, blue, amber) and
  just the count beside it (workout 1/3, water 1.5/3 L, protein 60/120 g)
- **Intake Goals** — a large water panel with a Log button, plus protein and calorie tiles; its goals sheet saves as you
  change a value
- **Exercise Library** widget — three picks that change every time the app is opened (a shuffled deck, so none
  repeats until all have been shown), each opening its guide, and a Browse button

### Exercise Library
- **873 exercises** with start/end photos, step-by-step instructions, muscles worked, equipment and level
- Grouped by muscle → movement type (Presses, Rows, Squats, Stretches, …), collapsible
- Search and equipment filters; tap any exercise for an animated two-photo preview

### Workouts
- **Section bar** — Planner (blue), Log (purple), Muscles (orange) and History (red), built like the bottom bar: a
  tinted pill glides and stretches to the section you pick, the icon fills in, hops and ripples, and the section slides
  in from the side you moved to
- **Split builder** — five short screens: about you (experience, goal, sex), your week (days, session length, rest
  days), where you train, your equipment (photo cards, tap ⓘ to see what an item is) and a strength check with your
  bodyweight. Nothing is pre-selected and every question must be answered. It builds a weekly plan (Full Body,
  Upper/Lower, Push/Pull/Legs, hybrids) with **sets × reps and a starting weight for every exercise** (scaled by
  bodyweight, experience, strength, goal, sex and age), rotating exercises every 1–4 weeks.
  Preview with collapsible days, swaps and guides before saving
- **Real weights only** — dumbbells 2, 2.5, 5, 7.5 … (2.5 kg steps), barbells and Smith machine in 5 kg steps
  (plates go on in pairs), machines in 5 kg steps, kettlebells / plates / balls in their real sizes
- **Planner** — collapsible days with today first and a **Start** button on today. Everything saves as you go (no Save
  button): muscle groups the moment they're tapped, the plan name once you stop typing. The exercise picker ticks what's
  already planned; each tap adds or removes an exercise straight away
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
- Water, food, supplements and daily habits (draggable sections); the **Scan** button's beam keeps sweeping
- **Add food** — one search box over ~140 everyday foods (built in, offline, typo-tolerant: "panner", "chapati",
  "dahi" all work, with real portions like 1 roti = 40 g) and packaged products from Open Food Facts; recent foods
  re-add with one tap; or **Type it in** (energy left empty is worked out from the macros). Picking a food slides up a
  portion editor: servings or grams with steppers and quick picks, live calories / protein / carbs / fat and % of your
  goal, and editable values. Each food is logged the moment it's added; the tray at the bottom takes one back out
- **Scan food** — **Barcode** looks the product up on Open Food Facts as soon as it's in the frame (or type the code);
  **Nutrition label** reads a photo of the table on the phone: energy, protein, carbs and fat per 100 g and per
  serving, the serving size, servings per pack, ingredients, allergens and notes like added sugar. It then says how
  sure it is and opens the values for checking when something couldn't be read. A barcode whose values you fill in
  scans correctly next time. No API keys: Open Food Facts is free and the label is read offline (ML Kit)
- **Supplements** — your own list (name, dose, colour), ticked off once a day, each with an optional reminder at one
  or more times on chosen days (skipped once it's taken)

### Overall
- Activity rings (choose what each ring shows from a button in the rings card), score and ring breakdown

### Settings
- Daily goals save the moment one is picked: no Save button

### Analytics
- Nutrition **Trends** chart — water / protein / calories, 7 or 30 days, touch any day to inspect
- Workout, progress-photo and body-weight views

### Reminders
- Your own reminders for water, protein, supplements, workouts or anything custom — multiple times a day, any minute, chosen days
- Smart: a reminder is skipped once that goal is done today; tapping a notification opens the matching section

### Log It (floating button on every tab)
- **Tap** — a body map with a labelled bubble for each muscle group. Tap one, pick an exercise (recommended first:
  today's plan, what you did lately, popular moves that fit your equipment; then every exercise for that muscle, with
  sub-filters like quads / hamstrings and a search), set sets, reps and kilos with steppers and scroll wheels, rename
  it if you like, and save the whole workout. No voice or typing needed
- **Voice / Type** — say or type "bench 100 for 5" and it logs the sets; also answers fitness questions

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
│   ├── tracker.tsx           # Water, food, supplements, habits
│   ├── overall.tsx           # Overall rings
│   ├── workouts.tsx          # Split, Planner, Log, Muscles, History
│   ├── prs.tsx               # Personal records
│   ├── analytics.tsx         # Analytics & progress photos
│   └── settings.tsx          # Goals, profile, reset
├── components/               # ExerciseLibrary, ExerciseGuide, SplitWizard, SetSession, BodyAnatomy,
│                             # WorkoutCalendar, DragWidget (widget board), PullToRefresh, AnimatedTabBar,
│                             # HeaderIconButton, SettingsButton, HeaderBack, Reminders, Supplements,
│                             # HomeOverview, BodyMap + TapLogger (Log It's body map), NutritionTrend,
│                             # WheelPicker, AI logger, ui; FoodSearchModal + FoodScannerModal share
│                             # FoodPortion (rows, portion editor) and PillSwitch; SegmentTabs (Workouts'
│                             # section bar); looping icons: FireIcon, DumbbellIcon, BookIcon,
│                             # SplitBuildIcon, ScanIcon; BatteryMeter
├── constants/
│   ├── theme.ts              # Colours (incl. carbs / fat), muscle groups
│   ├── foods.ts              # ~140 everyday foods per 100 g with real portions, and their search
│   ├── equipment.ts          # Equipment checklist, what each exercise needs, weight steps
│   ├── exercisePools.ts      # Split builder exercise pools per movement
│   ├── startingLoads.ts      # Starting-weight table and real weight sizes
│   ├── exerciseCatalog.ts    # Exercise library API (findExercise, EXERCISE_LIBRARY, ...)
│   ├── exerciseCatalog.json  # GENERATED — 873 exercises
│   ├── exerciseImages.ts     # GENERATED — preview image requires
│   └── legacyExerciseNames.ts# GENERATED — old app names → catalog names
├── db/database.ts            # SQLite schema, migrations and all data access
├── utils/                    # splitGenerator, loadFeedback, swipeLock, reminders, exerciseNames, parsers,
│                             # foodScannerService (Open Food Facts, portions), nutritionLabel (label reader)
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
- `daily_logs`, `food_log`, `water_log` — intake and habits per day (food_log also feeds Add food's Recent list)
- `workout_plans`, `workout_plan_exercises` — weekly plan
- `workout_sessions`, `exercise_logs`, `muscle_tracker`, `streaks` — training history
- `pr_entries` (every attempt), `personal_records` (current best), `pr_history` (legacy), `starred_pr_exercises`
- `custom_exercises` — user-created exercises (weight × reps or reps only)
- `reminders` — reminder schedule (`ref_id` = the supplement a supplement reminder is for)
- `supplements`, `supplement_logs` — the user's supplements and the days each was taken
- `weight_history`, `progress_photos`

**Migrations:** `CREATE TABLE IF NOT EXISTS` never changes an existing table, so schema changes go in the
`MIGRATIONS` list in `db/database.ts`. Each runs once, in order, tracked by `PRAGMA user_version`.
Append new entries; never edit or reorder old ones.

## Key Design Decisions

- **Offline-first** — all data in on-device SQLite; no account, no API keys. The internet is only used for food
  lookups (Open Food Facts: barcodes and packaged products, looked-up barcodes cached on the phone) and the AI coach's
  web answers (DuckDuckGo / Wikipedia). Everyday foods and nutrition labels work offline
- **Reading nutrition labels** — ML Kit returns a table column by column, so `utils/nutritionLabel.ts` rebuilds the
  rows from where each word sits (straightening a tilted photo first), finds the column headings (per 100 g, per
  serving, %RDA), then reads each row: kJ vs kcal, decimal commas, "1 650", "O" for 0 and "g" read as "9" are handled.
  Columns that came out swapped are caught (per 100 g can't hold more than 100 g of nutrients), a missing serving size
  is worked out from the two columns, and energy that couldn't be read comes from the macros (4 / 4 / 9 kcal per gram)
- **No save buttons** — goals, plan names and muscle groups save as they change; foods log as they're added
- **Local dates everywhere** — dates are stored as local `YYYY-MM-DD` (never UTC) so streaks and stats don't shift
- **PR scoring** — Epley e1RM = weight × (1 + reps / 30); bodyweight moves are scored by reps
- **Starting weights** — bodyweight × an exercise ratio × experience, strength, goal, sex and age factors, rounded to
  weights that exist and capped at a home user's heaviest equipment; 👍 / 👎 feedback then moves it a step at a time.
  Ratios come from novice strength standards (strengthlevel.com) taken to a 10-rep weight (NSCA %1RM table) and
  then set a little light; women start at ~62% (upper body) / ~72% (lower body) of the male ratio
- **Muscle recovery** — about 3 days for legs and lower back, 2 for chest, back, shoulders and arms, 1 for core and forearms
- **Widget dragging** — widgets are absolutely positioned from a shared order and measured heights, so the lift, the
  swaps and the drop all run on the UI thread and committing the new order can't flicker. The lift is a long-press Pan
  (a quick tap still reaches the buttons inside a widget; scrolling or a sideways swipe cancels it) and the tab swipe
  pauses while a widget is lifted (utils/swipeLock)
- **Pull to refresh** — a Pan around each screen's scroll view that only activates at the top on a downward pull, so
  scrolling, the tab swipe and widget drags are untouched; the reload runs a frame after release
- **Name-tolerant exercises** — "Lateral Raises", "triceps push-down" and old app names all resolve to one catalog exercise
- **Smart reminders** — notifications are scheduled 7 days ahead and refreshed when the app opens or closes

## Credits

- Exercise data and photos: [free-exercise-db](https://github.com/yuhonas/free-exercise-db) — public domain (Unlicense).
  The split builder's equipment pictures are photos from the same set
- Food data: [Open Food Facts](https://world.openfoodfacts.org); everyday food values from USDA FoodData Central
  (home-style Indian dishes are typical recipes and marked approximate)
