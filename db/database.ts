import * as SQLite from 'expo-sqlite';
import { BODYWEIGHT_EXERCISES } from '../constants/theme';
import { isBodyweightExercise } from '../constants/equipment';
import { LEGACY_EXERCISE_NAMES } from '../constants/legacyExerciseNames';

type DbRunResult = {
  changes: number;
  lastInsertRowId: number;
};

type DbLike = {
  execSync: (source: string) => void;
  runSync: (source: string, params?: any[]) => DbRunResult;
  getFirstSync: <T>(source: string, params?: any[]) => T | null;
  getAllSync: <T>(source: string, params?: any[]) => T[];
  withTransactionSync: (task: () => void) => void;
};

let _db: DbLike | null = null;

function getDb(): DbLike {
  if (!_db) {
    // 🚀 FIX: Removed the dynamic require and used the top-level import
  _db = SQLite.openDatabaseSync('gainquest_v2.db') as unknown as DbLike;
  }
  return _db;
}

export function initializeDatabase(): void {
  const db = getDb();
  db.execSync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS goals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      water_goal REAL DEFAULT 3.0,
      protein_goal REAL DEFAULT 120.0,
      calorie_goal INTEGER DEFAULT 2800,
      weight_goal REAL DEFAULT 75.0,
      creatine_dose REAL DEFAULT 5.0,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS daily_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      log_date TEXT UNIQUE NOT NULL,
      water_intake REAL DEFAULT 0.0,
      protein_intake REAL DEFAULT 0.0,
      calorie_intake INTEGER DEFAULT 0,
      creatine_taken INTEGER DEFAULT 0,
      creatine_time TEXT,
      workout_completed INTEGER DEFAULT 0,
      water_goal_reached INTEGER DEFAULT 0,
      protein_goal_reached INTEGER DEFAULT 0,
      slept_well INTEGER DEFAULT 0,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS food_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      log_date TEXT NOT NULL,
      food_name TEXT NOT NULL,
      protein REAL DEFAULT 0.0,
      calories INTEGER DEFAULT 0,
      logged_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS water_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      log_date TEXT NOT NULL,
      amount_ml INTEGER NOT NULL,
      logged_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS workout_plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      day_of_week TEXT NOT NULL UNIQUE,
      plan_name TEXT NOT NULL,
      muscle_groups TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS workout_plan_exercises (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      day_of_week TEXT NOT NULL,
      exercise_name TEXT NOT NULL,
      muscle_group TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS workout_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_date TEXT NOT NULL,
      muscle_groups TEXT NOT NULL,
      duration_minutes INTEGER DEFAULT 0,
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS exercise_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      session_date TEXT NOT NULL,
      exercise_name TEXT NOT NULL,
      muscle_group TEXT,
      sets INTEGER DEFAULT 0,
      reps INTEGER DEFAULT 0,
      weight REAL DEFAULT 0.0,
      unit TEXT DEFAULT 'kg',
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS personal_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      exercise_name TEXT UNIQUE NOT NULL,
      record_date TEXT NOT NULL,
      sets INTEGER,
      reps INTEGER,
      weight REAL NOT NULL,
      unit TEXT DEFAULT 'kg',
      one_rep_max REAL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS pr_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      exercise_name TEXT NOT NULL,
      record_date TEXT NOT NULL,
      sets INTEGER,
      reps INTEGER,
      weight REAL NOT NULL,
      unit TEXT DEFAULT 'kg',
      one_rep_max REAL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS weight_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      record_date TEXT UNIQUE NOT NULL,
      weight REAL NOT NULL,
      unit TEXT DEFAULT 'kg',
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS muscle_tracker (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      muscle_group TEXT UNIQUE NOT NULL,
      last_trained TEXT,
      total_sessions INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS streaks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      streak_type TEXT NOT NULL,
      current_streak INTEGER DEFAULT 0,
      longest_streak INTEGER DEFAULT 0,
      last_updated TEXT
    );

    CREATE TABLE IF NOT EXISTS progress_photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      photo_date TEXT NOT NULL,
      uri TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS starred_pr_exercises (
      exercise_name TEXT PRIMARY KEY
    );
  `);

  runMigrations(db);

  const goalCount = db.getFirstSync<{ c: number }>('SELECT COUNT(*) as c FROM goals');
  if (!goalCount || goalCount.c === 0) {
    db.execSync(`
      INSERT INTO goals (water_goal, protein_goal, calorie_goal, weight_goal, creatine_dose)
      VALUES (0.0, 0.0, 0, 0.0, 0.0);
    `);
  }

  const planCount = db.getFirstSync<{ c: number }>('SELECT COUNT(*) as c FROM workout_plans');
  if (!planCount || planCount.c === 0) {
    db.execSync(`
      INSERT INTO workout_plans (day_of_week, plan_name, muscle_groups) VALUES
      ('Monday', 'Chest & Triceps', 'Chest,Triceps'),
      ('Tuesday', 'Back & Biceps', 'Back,Biceps'),
      ('Wednesday', 'Legs', 'Legs'),
      ('Thursday', 'Shoulders', 'Shoulders'),
      ('Friday', 'Full Pull', 'Back,Biceps,Shoulders'),
      ('Saturday', 'Full Push', 'Chest,Triceps,Shoulders'),
      ('Sunday', 'Rest Day', 'Rest');
    `);
  }

  const mgCount = db.getFirstSync<{ c: number }>('SELECT COUNT(*) as c FROM muscle_tracker');
  if (!mgCount || mgCount.c === 0) {
    db.execSync(`
      INSERT INTO muscle_tracker (muscle_group) VALUES
      ('Chest'), ('Back'), ('Legs'), ('Shoulders'), ('Biceps'), ('Triceps'), ('Core'), ('Forearms');
    `);
  }

  const stCount = db.getFirstSync<{ c: number }>('SELECT COUNT(*) as c FROM streaks');
  if (!stCount || stCount.c === 0) {
    db.execSync(`INSERT INTO streaks (streak_type) VALUES ('workout');`);
  }

  db.execSync(`
    INSERT OR IGNORE INTO settings (key, value) VALUES
    ('dark_mode', 'false'),
    ('name', ''),
    ('age', ''),
    ('body_weight', ''),
    ('weight_unit', 'kg'),
    ('onboarding_complete', 'false');
  `);
}

// ── Schema migrations ───────────────────────────────────────────────────────
// CREATE TABLE IF NOT EXISTS never changes an existing table, so every schema
// change after v1 must be appended here (never edit or reorder old entries).
// Each entry runs once, in order, and bumps PRAGMA user_version.
// Example: (db) => db.execSync('ALTER TABLE food_log ADD COLUMN carbs REAL DEFAULT 0'),
const MIGRATIONS: ((db: DbLike) => void)[] = [
  // v1: baseline schema created in initializeDatabase()
  () => {},
  // v2: user-created exercises, so custom lifts keep their muscle group
  (db) => db.execSync(`
    CREATE TABLE IF NOT EXISTS custom_exercises (
      name TEXT PRIMARY KEY COLLATE NOCASE,
      muscle_group TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `),
  // v3: every PR attempt is its own editable entry; custom exercises can be reps-only
  (db) => {
    db.execSync(`
      CREATE TABLE IF NOT EXISTS pr_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        exercise_name TEXT NOT NULL,
        entry_date TEXT NOT NULL,
        weight REAL NOT NULL DEFAULT 0,
        reps INTEGER NOT NULL DEFAULT 1,
        unit TEXT DEFAULT 'kg',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_pr_entries_exercise ON pr_entries (exercise_name, entry_date);
      INSERT INTO pr_entries (exercise_name, entry_date, weight, reps, unit)
        SELECT DISTINCT exercise_name, record_date, weight, COALESCE(reps, 1), COALESCE(unit, 'kg') FROM (
          SELECT exercise_name, record_date, weight, reps, unit FROM pr_history
          UNION ALL
          SELECT exercise_name, record_date, weight, reps, unit FROM personal_records
        ) ORDER BY record_date;
      ALTER TABLE custom_exercises ADD COLUMN kind TEXT NOT NULL DEFAULT 'weight';
    `);
    const names = db.getAllSync<{ exercise_name: string }>('SELECT DISTINCT exercise_name FROM pr_entries');
    names.forEach(n => syncPersonalRecord(db, n.exercise_name));
  },
  // v4: reminder schedule (notifications themselves are scheduled by utils/reminders.ts)
  (db) => db.execSync(`
    CREATE TABLE IF NOT EXISTS reminders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL,
      label TEXT NOT NULL,
      hour INTEGER NOT NULL,
      minute INTEGER NOT NULL,
      days TEXT NOT NULL DEFAULT '0123456',
      enabled INTEGER NOT NULL DEFAULT 1
    );
    INSERT INTO reminders (kind, label, hour, minute) VALUES
      ('creatine', 'Take creatine', 9, 0),
      ('water', 'Drink water', 11, 0),
      ('protein', 'Protein check', 13, 30),
      ('water', 'Drink water', 15, 0),
      ('workout', 'Workout time', 18, 0),
      ('water', 'Drink water', 20, 0);
  `),
  // v5: no suggested reminders — remove v4's starter set unless the user changed it
  (db) => db.execSync(`
    DELETE FROM reminders WHERE days = '0123456' AND enabled = 1 AND (
      (kind = 'creatine' AND label = 'Take creatine' AND hour = 9 AND minute = 0) OR
      (kind = 'water' AND label = 'Drink water' AND hour IN (11, 15, 20) AND minute = 0) OR
      (kind = 'protein' AND label = 'Protein check' AND hour = 13 AND minute = 30) OR
      (kind = 'workout' AND label = 'Workout time' AND hour = 18 AND minute = 0)
    );
  `),
  // v6: exercises now use free-exercise-db names — rename saved data from the old app names
  (db) => {
    for (const [oldName, newName] of Object.entries(LEGACY_EXERCISE_NAMES)) {
      for (const table of ['exercise_logs', 'workout_plan_exercises', 'pr_entries', 'pr_history']) {
        db.runSync(`UPDATE ${table} SET exercise_name=? WHERE exercise_name=?`, [newName, oldName]);
      }
      // Unique-keyed tables: rename unless the new name already exists, then drop leftovers
      db.runSync('UPDATE OR IGNORE starred_pr_exercises SET exercise_name=? WHERE exercise_name=?', [newName, oldName]);
      db.runSync('DELETE FROM starred_pr_exercises WHERE exercise_name=?', [oldName]);
      db.runSync('DELETE FROM personal_records WHERE exercise_name=?', [oldName]);
    }
    // personal_records is rebuilt from the (renamed) entries
    new Set(Object.values(LEGACY_EXERCISE_NAMES)).forEach(n => syncPersonalRecord(db, n));
  },
];

function runMigrations(db: DbLike): void {
  let version = db.getFirstSync<{ user_version: number }>('PRAGMA user_version')?.user_version ?? 0;
  while (version < MIGRATIONS.length) {
    const migrate = MIGRATIONS[version];
    const next = version + 1;
    db.withTransactionSync(() => {
      migrate(db);
      db.execSync(`PRAGMA user_version = ${next}`);
    });
    version = next;
  }
}

/** Local-time YYYY-MM-DD (never use toISOString for dates — it is UTC). */
export function toDateStr(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function todayStr(): string {
  return toDateStr(new Date());
}

function calculate1RM(weight: number, reps: number): number {
  if (reps === 1) return weight;
  return weight * (1 + reps / 30);
}

export interface Goals {
  id: number;
  water_goal: number;
  protein_goal: number;
  calorie_goal: number;
  weight_goal: number;
  creatine_dose: number;
}

export function getGoals(): Goals {
  return getDb().getFirstSync<Goals>('SELECT * FROM goals ORDER BY id DESC LIMIT 1') ||
  {
    id: 1,
    water_goal: 0,
    protein_goal: 0,
    calorie_goal: 0,
    weight_goal: 0,
    creatine_dose: 0,
  };
}

export function getOnboardingComplete(): boolean {
  const r = getDb().getFirstSync<{ value: string }>('SELECT value FROM settings WHERE key=?', ['onboarding_complete']);
  return r ? r.value === 'true' : false;
}

export function setOnboardingComplete(): void {
  getDb().runSync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['onboarding_complete', 'true']);
}

export function updateGoals(g: Partial<Goals>): void {
  const db = getDb();
  const cur = getGoals();
  const merged = { ...cur, ...g };

  db.runSync(
    `INSERT OR REPLACE INTO goals
     (id, water_goal, protein_goal, calorie_goal, weight_goal, creatine_dose, updated_at)
     VALUES (1, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    [merged.water_goal, merged.protein_goal, merged.calorie_goal, merged.weight_goal, merged.creatine_dose]
  );
}

export function getSetting(key: string, def = ''): string {
  const r = getDb().getFirstSync<{ value: string }>('SELECT value FROM settings WHERE key=?', [key]);
  return r ? r.value : def;
}

export function setSetting(key: string, value: string): void {
  getDb().runSync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value]);
}

export interface DailyLog {
  id: number;
  log_date: string;
  water_intake: number;
  protein_intake: number;
  calorie_intake: number;
  creatine_taken: number;
  creatine_time: string | null;
  workout_completed: number;
  water_goal_reached: number;
  protein_goal_reached: number;
  slept_well: number;
  notes: string | null;
}

export function getTodayLog(logDate?: string): DailyLog {
  const db = getDb();
  const d = logDate || todayStr();
  db.runSync('INSERT OR IGNORE INTO daily_logs (log_date) VALUES (?)', [d]);
  return db.getFirstSync<DailyLog>('SELECT * FROM daily_logs WHERE log_date=?', [d])!;
}

export function updateDailyLog(logDate: string, fields: Partial<DailyLog>): void {
  const db = getDb();
  db.runSync('INSERT OR IGNORE INTO daily_logs (log_date) VALUES (?)', [logDate]);

  const keys = Object.keys(fields);
  if (!keys.length) return;
  const sets = keys.map(k => `${k}=?`).join(',');
  db.runSync(`UPDATE daily_logs SET ${sets} WHERE log_date=?`, [...Object.values(fields), logDate]);
}

export function addWater(amountMl: number, logDate?: string): void {
  const db = getDb();
  const d = logDate || todayStr();
  db.runSync('INSERT INTO water_log (log_date, amount_ml) VALUES (?, ?)', [d, amountMl]);
  db.runSync('INSERT OR IGNORE INTO daily_logs (log_date) VALUES (?)', [d]);
  db.runSync('UPDATE daily_logs SET water_intake=water_intake+? WHERE log_date=?', [amountMl / 1000, d]);

  const goals = getGoals();
  const log = getTodayLog(d);
  updateDailyLog(d, { water_goal_reached: log.water_intake >= goals.water_goal ? 1 : 0 });
}

export function resetWater(logDate?: string): void {
  const db = getDb();
  const d = logDate || todayStr();
  db.runSync('DELETE FROM water_log WHERE log_date=?', [d]);
  db.runSync('UPDATE daily_logs SET water_intake=0, water_goal_reached=0 WHERE log_date=?', [d]);
}

export interface FoodEntry {
  id: number;
  log_date: string;
  food_name: string;
  protein: number;
  calories: number;
}

export function addFood(foodName: string, protein: number, calories: number, logDate?: string): void {
  const db = getDb();
  const d = logDate || todayStr();

  db.runSync('INSERT INTO food_log (log_date, food_name, protein, calories) VALUES (?, ?, ?, ?)', [
    d,
    foodName,
    protein,
    calories,
  ]);
  db.runSync('INSERT OR IGNORE INTO daily_logs (log_date) VALUES (?)', [d]);
  db.runSync(
    'UPDATE daily_logs SET protein_intake=protein_intake+?, calorie_intake=calorie_intake+? WHERE log_date=?',
    [protein, calories, d]
  );
  const goals = getGoals();
  const log = getTodayLog(d);
  updateDailyLog(d, { protein_goal_reached: log.protein_intake >= goals.protein_goal ? 1 : 0 });
}

export function getFoodLog(logDate?: string): FoodEntry[] {
  const d = logDate || todayStr();
  return getDb().getAllSync<FoodEntry>('SELECT * FROM food_log WHERE log_date=? ORDER BY logged_at ASC', [d]);
}

export function deleteFoodEntry(id: number): void {
  const db = getDb();
  const row = db.getFirstSync<FoodEntry>('SELECT * FROM food_log WHERE id=?', [id]);

  if (!row) return;

  db.runSync('DELETE FROM food_log WHERE id=?', [id]);
  db.runSync(
    'UPDATE daily_logs SET protein_intake=protein_intake-?, calorie_intake=calorie_intake-? WHERE log_date=?',
    [row.protein, row.calories, row.log_date]
  );
  const goals = getGoals();
  const log = getTodayLog(row.log_date);
  updateDailyLog(row.log_date, { protein_goal_reached: log.protein_intake >= goals.protein_goal ? 1 : 0 });
}

export function updateFoodEntry(id: number, foodName: string, protein: number, calories: number): void {
  const db = getDb();
  const row = db.getFirstSync<FoodEntry>('SELECT * FROM food_log WHERE id=?', [id]);
  if (!row) return;

  db.runSync('UPDATE food_log SET food_name=?, protein=?, calories=? WHERE id=?', [
    foodName,
    protein,
    calories,
    id,
  ]);
  const diffProt = protein - row.protein;
  const diffCals = calories - row.calories;
  db.runSync(
    'UPDATE daily_logs SET protein_intake=protein_intake+?, calorie_intake=calorie_intake+? WHERE log_date=?',
    [diffProt, diffCals, row.log_date]
  );
  const goals = getGoals();
  const log = getTodayLog(row.log_date);
  updateDailyLog(row.log_date, { protein_goal_reached: log.protein_intake >= goals.protein_goal ? 1 : 0 });
}

export function logCreatine(logDate?: string): void {
  const db = getDb();
  const d = logDate || todayStr();
  db.runSync('INSERT OR IGNORE INTO daily_logs (log_date) VALUES (?)', [d]);
  db.runSync('UPDATE daily_logs SET creatine_taken=1, creatine_time=? WHERE log_date=?', [
    new Date().toISOString(),
    d,
  ]);
}

export function unlogCreatine(logDate?: string): void {
  const d = logDate || todayStr();
  getDb().runSync('UPDATE daily_logs SET creatine_taken=0, creatine_time=NULL WHERE log_date=?', [d]);
}

export interface WorkoutPlan {
  id: number;
  day_of_week: string;
  plan_name: string;
  muscle_groups: string;
}

export interface WorkoutPlanExercise {
  id: number;
  day_of_week: string;
  exercise_name: string;
  muscle_group: string;
}

export function getWorkoutPlans(): WorkoutPlan[] {
  return getDb().getAllSync<WorkoutPlan>('SELECT * FROM workout_plans ORDER BY id');
}

export function getTodaysPlan(): WorkoutPlan | null {
  const day = new Date().toLocaleDateString('en-US', { weekday: 'long' });
  return getDb().getFirstSync<WorkoutPlan>('SELECT * FROM workout_plans WHERE day_of_week=?', [day]) || null;
}

export function updateWorkoutPlan(dayOfWeek: string, planName: string, muscleGroups: string): void {
  const db = getDb();
  const existing = db.getFirstSync<{ id: number }>('SELECT id FROM workout_plans WHERE day_of_week=?', [dayOfWeek]);
  if (existing) {
    db.runSync('UPDATE workout_plans SET plan_name=?, muscle_groups=? WHERE day_of_week=?', [
      planName || 'Workout',
      muscleGroups || 'Rest',
      dayOfWeek,
    ]);
  } else {
    db.runSync('INSERT INTO workout_plans (day_of_week, plan_name, muscle_groups) VALUES (?, ?, ?)', [
      dayOfWeek,
      planName || 'Workout',
      muscleGroups || 'Rest',
    ]);
  }
}

export function getWorkoutPlanExercises(dayOfWeek?: string): WorkoutPlanExercise[] {
  if (dayOfWeek) {
    return getDb().getAllSync<WorkoutPlanExercise>(
      'SELECT * FROM workout_plan_exercises WHERE day_of_week=? ORDER BY id',
      [dayOfWeek]
    );
  }

  return getDb().getAllSync<WorkoutPlanExercise>('SELECT * FROM workout_plan_exercises ORDER BY day_of_week, id');
}

export function addWorkoutPlanExercise(dayOfWeek: string, exerciseName: string, muscleGroup: string): void {
  getDb().runSync(
    'INSERT INTO workout_plan_exercises (day_of_week, exercise_name, muscle_group) VALUES (?, ?, ?)',
    [dayOfWeek, exerciseName, muscleGroup]
  );
}

export function deleteWorkoutPlanExercise(id: number): void {
  getDb().runSync('DELETE FROM workout_plan_exercises WHERE id=?', [id]);
}

export interface WeeklyPlanDay {
  dayOfWeek: string;
  planName: string;
  muscleGroups: string;                              // comma-separated, or 'Rest'
  exercises: { name: string; muscle: string }[];
}

/** Replace the whole weekly plan (names, muscle groups and exercises) in one transaction. */
export function replaceWeeklyPlan(days: WeeklyPlanDay[]): void {
  const db = getDb();
  db.withTransactionSync(() => {
    db.runSync('DELETE FROM workout_plan_exercises');
    for (const d of days) {
      updateWorkoutPlan(d.dayOfWeek, d.planName, d.muscleGroups);
      for (const ex of d.exercises) {
        db.runSync(
          'INSERT INTO workout_plan_exercises (day_of_week, exercise_name, muscle_group) VALUES (?, ?, ?)',
          [d.dayOfWeek, ex.name, ex.muscle]
        );
      }
    }
  });
}

export interface WorkoutSession {
  id: number;
  session_date: string;
  muscle_groups: string;
  duration_minutes?: number;
  notes: string | null;
}

export function createWorkoutSession(sessionDate: string, muscleGroups: string, notes = ''): number {
  const r = getDb().runSync('INSERT INTO workout_sessions (session_date, muscle_groups, notes) VALUES (?, ?, ?)', [
    sessionDate,
    muscleGroups,
    notes,
  ]);
  return r.lastInsertRowId;
}

export function getWorkoutSessions(limit = 30): WorkoutSession[] {
  return getDb().getAllSync<WorkoutSession>('SELECT * FROM workout_sessions ORDER BY session_date DESC LIMIT ?', [
    limit,
  ]);
}

export interface ExerciseLog {
  id: number;
  session_id: number;
  session_date: string;
  exercise_name: string;
  muscle_group: string;
  sets: number;
  reps: number;
  weight: number;
  unit: string;
}

export function logExercise(
  sessionId: number,
  sessionDate: string,
  exerciseName: string,
  muscleGroup: string,
  sets: number,
  reps: number,
  weight: number,
  unit = 'kg'
): void {
  const db = getDb();
  db.withTransactionSync(() => {
    insertExercise(db, sessionId, sessionDate, exerciseName, muscleGroup, sets, reps, weight, unit);
  });
}

export interface NewExercise {
  exercise: string;
  muscleGroup: string;
  sets: number;
  reps: number;
  weight: number;
  unit?: string;
}

/** Create a session and log all its exercises atomically. Returns the session id. */
export function logWorkoutSession(
  sessionDate: string,
  muscleGroups: string,
  notes: string,
  exercises: NewExercise[]
): number {
  const db = getDb();
  let sessionId = 0;
  db.withTransactionSync(() => {
    sessionId = createWorkoutSession(sessionDate, muscleGroups, notes);
    for (const ex of exercises) {
      insertExercise(db, sessionId, sessionDate, ex.exercise, ex.muscleGroup, ex.sets, ex.reps, ex.weight, ex.unit);
    }
  });
  return sessionId;
}

function insertExercise(
  db: DbLike,
  sessionId: number,
  sessionDate: string,
  exerciseName: string,
  muscleGroup: string,
  sets: number,
  reps: number,
  weight: number,
  unit = 'kg'
): void {
  db.runSync(
    `INSERT INTO exercise_logs
     (session_id, session_date, exercise_name, muscle_group, sets, reps, weight, unit)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [sessionId, sessionDate, exerciseName, muscleGroup, sets, reps, weight, unit]
  );
  db.runSync('INSERT OR IGNORE INTO muscle_tracker (muscle_group) VALUES (?)', [muscleGroup]);
  db.runSync('UPDATE muscle_tracker SET last_trained=?, total_sessions=total_sessions+1 WHERE muscle_group=?', [
    sessionDate,
    muscleGroup,
  ]);
  checkAndUpdatePR(db, exerciseName, sessionDate, sets, reps, weight, unit);
}

export function getSessionExercises(sessionId: number): ExerciseLog[] {
  return getDb().getAllSync<ExerciseLog>('SELECT * FROM exercise_logs WHERE session_id=? ORDER BY id', [sessionId]);
}

export function getExercisesForDate(date: string): ExerciseLog[] {
  return getDb().getAllSync<ExerciseLog>(
    'SELECT * FROM exercise_logs WHERE session_date=? ORDER BY id',
    [date]
  );
}

export function getExerciseHistory(exerciseName: string, limit = 20): ExerciseLog[] {
  return getDb().getAllSync<ExerciseLog>(
    'SELECT * FROM exercise_logs WHERE exercise_name=? ORDER BY session_date ASC LIMIT ?',
    [exerciseName, limit]
  );
}

// Unified progression history — merges exercise_logs, pr_history, and the
// current personal_record so manually-logged PRs appear in the chart.
export interface PRProgressionEntry {
  session_date: string;
  exercise_name: string;
  sets: number;
  reps: number;
  weight: number;
  unit: string;
}

export function getPRProgressionHistory(exerciseName: string): PRProgressionEntry[] {
  const db = getDb();

  // 1. Actual workout logs
  const fromLogs = db.getAllSync<PRProgressionEntry>(
    `SELECT session_date, exercise_name, sets, reps, weight, unit
     FROM exercise_logs WHERE exercise_name=? ORDER BY session_date ASC`,
    [exerciseName]
  );

  // 2. Archived PR history (manual + auto)
  const fromHistory = db.getAllSync<PRProgressionEntry>(
    `SELECT record_date AS session_date, exercise_name, sets, reps, weight, unit
     FROM pr_history WHERE exercise_name=? ORDER BY record_date ASC`,
    [exerciseName]
  );

  // 3. Current PR record
  const currentPR = db.getFirstSync<PRProgressionEntry>(
    `SELECT record_date AS session_date, exercise_name, sets, reps, weight, unit
     FROM personal_records WHERE exercise_name=?`,
    [exerciseName]
  );

  // Merge all sources, sort by date, then deduplicate by date+weight+reps
  const all: PRProgressionEntry[] = [...fromLogs, ...fromHistory];
  if (currentPR) all.push(currentPR);

  all.sort((a, b) => a.session_date.localeCompare(b.session_date));

  const seen = new Set<string>();
  return all.filter(e => {
    const key = `${e.session_date}-${e.weight}-${e.reps}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** The most recent weight logged for an exercise, if it was ever logged with one. */
export function getLastWeight(exerciseName: string): number | null {
  const r = getDb().getFirstSync<{ weight: number }>(
    'SELECT weight FROM exercise_logs WHERE exercise_name=? AND weight>0 ORDER BY session_date DESC, id DESC LIMIT 1',
    [exerciseName]
  );
  return r ? r.weight : null;
}

export function getAllExerciseNames(): string[] {
  return getDb()
    .getAllSync<{ exercise_name: string }>('SELECT DISTINCT exercise_name FROM exercise_logs ORDER BY exercise_name')
    .map((r: { exercise_name: string }) => r.exercise_name);
}

export interface PR {
  id: number;
  exercise_name: string;
  record_date: string;
  sets: number;
  reps: number;
  weight: number;
  unit: string;
  one_rep_max: number;
}

// ── PR scoring & entries ───────────────────────────────────────────────────
// personal_records holds the current best per exercise (one_rep_max = score);
// pr_entries holds every attempt and is the source of truth for it.

/** Reps-only lifts: built-in bodyweight moves, or custom exercises created as reps-only. */
export function isRepsOnly(exerciseName: string): boolean {
  const custom = getDb().getFirstSync<{ kind: string }>(
    'SELECT kind FROM custom_exercises WHERE name=?', [exerciseName]
  );
  return custom
    ? custom.kind === 'reps'
    : BODYWEIGHT_EXERCISES.includes(exerciseName) || isBodyweightExercise(exerciseName);
}

/** Comparable PR score: max reps for reps-only lifts, Epley e1RM otherwise. */
export function prScore(exerciseName: string, weight: number, reps: number): number {
  return isRepsOnly(exerciseName) ? reps : calculate1RM(weight, reps);
}

export interface PREntry {
  id: number;
  exercise_name: string;
  entry_date: string;
  weight: number;
  reps: number;
  unit: string;
}

/** Recompute the current best for one exercise from its entries. */
function syncPersonalRecord(db: DbLike, exerciseName: string): void {
  const entries = db.getAllSync<PREntry>(
    'SELECT * FROM pr_entries WHERE exercise_name=? ORDER BY entry_date, id', [exerciseName]
  );
  let best: PREntry | null = null;
  let bestScore = -Infinity;
  for (const e of entries) {
    const score = prScore(exerciseName, e.weight, e.reps);
    if (score > bestScore) { best = e; bestScore = score; }
  }
  if (!best) {
    db.runSync('DELETE FROM personal_records WHERE exercise_name=?', [exerciseName]);
    return;
  }
  db.runSync(
    `INSERT OR REPLACE INTO personal_records
     (exercise_name, record_date, sets, reps, weight, unit, one_rep_max)
     VALUES (?, ?, 1, ?, ?, ?, ?)`,
    [exerciseName, best.entry_date, best.reps, best.weight, best.unit, bestScore]
  );
}

export function getPREntries(exerciseName: string): PREntry[] {
  return getDb().getAllSync<PREntry>(
    'SELECT * FROM pr_entries WHERE exercise_name=? ORDER BY entry_date, id', [exerciseName]
  );
}

export function getAllPREntries(): PREntry[] {
  return getDb().getAllSync<PREntry>('SELECT * FROM pr_entries ORDER BY exercise_name, entry_date, id');
}

export function addPREntry(exerciseName: string, entryDate: string, weight: number, reps: number, unit = 'kg'): void {
  const db = getDb();
  db.withTransactionSync(() => {
    db.runSync(
      'INSERT INTO pr_entries (exercise_name, entry_date, weight, reps, unit) VALUES (?, ?, ?, ?, ?)',
      [exerciseName, entryDate, weight, reps, unit]
    );
    syncPersonalRecord(db, exerciseName);
  });
}

export function updatePREntry(id: number, entryDate: string, weight: number, reps: number): void {
  const db = getDb();
  const row = db.getFirstSync<PREntry>('SELECT * FROM pr_entries WHERE id=?', [id]);
  if (!row) return;
  db.withTransactionSync(() => {
    db.runSync('UPDATE pr_entries SET entry_date=?, weight=?, reps=? WHERE id=?', [entryDate, weight, reps, id]);
    syncPersonalRecord(db, row.exercise_name);
  });
}

export function deletePREntry(id: number): void {
  const db = getDb();
  const row = db.getFirstSync<PREntry>('SELECT * FROM pr_entries WHERE id=?', [id]);
  if (!row) return;
  db.withTransactionSync(() => {
    db.runSync('DELETE FROM pr_entries WHERE id=?', [id]);
    syncPersonalRecord(db, row.exercise_name);
  });
}

/** Called for every logged workout set: a set that beats the current best becomes a PR entry. */
function checkAndUpdatePR(
  db: DbLike,
  exerciseName: string,
  recordDate: string,
  sets: number,
  reps: number,
  weight: number,
  unit: string
): void {
  const score = prScore(exerciseName, weight, reps);
  const existing = db.getFirstSync<PR>('SELECT * FROM personal_records WHERE exercise_name=?', [exerciseName]);
  if (!existing || score > existing.one_rep_max) {
    db.runSync(
      'INSERT INTO pr_entries (exercise_name, entry_date, weight, reps, unit) VALUES (?, ?, ?, ?, ?)',
      [exerciseName, recordDate, weight, reps, unit]
    );
    syncPersonalRecord(db, exerciseName);
  }
}

export function checkPRForLog(
  exerciseName: string,
  sets: number,
  reps: number,
  weight: number
): {
  isNewPR: boolean;
  oldPR: PR | null;
  new1RM: number;
} {
  const new1RM = prScore(exerciseName, weight, reps);
  const existing = getDb().getFirstSync<PR>('SELECT * FROM personal_records WHERE exercise_name=?', [exerciseName]);

  return {
    isNewPR: !existing || new1RM > existing.one_rep_max,
    oldPR: existing || null,
    new1RM,
  };
}

export function getAllPRs(): PR[] {
  return getDb().getAllSync<PR>('SELECT * FROM personal_records ORDER BY exercise_name');
}

/** Star / unstar an exercise for the PR pinboard. */
export function starPRExercise(exerciseName: string): void {
  getDb().runSync('INSERT OR IGNORE INTO starred_pr_exercises (exercise_name) VALUES (?)', [exerciseName]);
}

export function unstarPRExercise(exerciseName: string): void {
  getDb().runSync('DELETE FROM starred_pr_exercises WHERE exercise_name=?', [exerciseName]);
}

export function getStarredPRExercises(): string[] {
  return getDb()
    .getAllSync<{ exercise_name: string }>('SELECT exercise_name FROM starred_pr_exercises ORDER BY exercise_name')
    .map(r => r.exercise_name);
}

export function isPRExerciseStarred(exerciseName: string): boolean {
  const r = getDb().getFirstSync<{ exercise_name: string }>(
    'SELECT exercise_name FROM starred_pr_exercises WHERE exercise_name=?',
    [exerciseName]
  );
  return !!r;
}

// ── Reminders ──────────────────────────────────────────────────────────────
export type ReminderKind = 'water' | 'protein' | 'creatine' | 'workout' | 'custom';

export interface Reminder {
  id: number;
  kind: ReminderKind;
  label: string;
  hour: number;
  minute: number;
  days: string;    // weekdays as getDay() digits, e.g. '0123456' = every day
  enabled: number;
}

export function getReminders(): Reminder[] {
  return getDb().getAllSync<Reminder>('SELECT * FROM reminders ORDER BY hour, minute, id');
}

export function addReminder(
  kind: ReminderKind, label: string, hour: number, minute: number, days = '0123456', enabled = 1
): number {
  return getDb().runSync(
    'INSERT INTO reminders (kind, label, hour, minute, days, enabled) VALUES (?, ?, ?, ?, ?, ?)',
    [kind, label, hour, minute, days, enabled]
  ).lastInsertRowId;
}

export function updateReminder(id: number, fields: Partial<Omit<Reminder, 'id'>>): void {
  const keys = Object.keys(fields);
  if (!keys.length) return;
  getDb().runSync(
    `UPDATE reminders SET ${keys.map(k => `${k}=?`).join(',')} WHERE id=?`,
    [...Object.values(fields), id]
  );
}

export function deleteReminder(id: number): void {
  getDb().runSync('DELETE FROM reminders WHERE id=?', [id]);
}

// ── Custom exercises ───────────────────────────────────────────────────────
export type ExerciseKind = 'weight' | 'reps';

export interface CustomExercise {
  name: string;
  muscle_group: string;
  kind: ExerciseKind;
}

export function getCustomExercises(): CustomExercise[] {
  return getDb().getAllSync<CustomExercise>('SELECT name, muscle_group, kind FROM custom_exercises ORDER BY name');
}

export function addCustomExercise(name: string, muscleGroup: string, kind: ExerciseKind = 'weight'): void {
  getDb().runSync(
    'INSERT OR REPLACE INTO custom_exercises (name, muscle_group, kind) VALUES (?, ?, ?)',
    [name, muscleGroup, kind]
  );
}

export interface WeightEntry {
  id: number;
  record_date: string;
  weight: number;
  unit: string;
}

export function logWeight(weight: number, recordDate?: string): void {
  const d = recordDate || todayStr();
  getDb().runSync('INSERT OR REPLACE INTO weight_history (record_date, weight) VALUES (?, ?)', [d, weight]);
}

export function getWeightHistory(days = 90): WeightEntry[] {
  return getDb()
    .getAllSync<WeightEntry>('SELECT * FROM weight_history ORDER BY record_date DESC LIMIT ?', [days])
    .reverse();
}

export function getLatestWeight(): number | null {
  const r = getDb().getFirstSync<{ weight: number }>('SELECT weight FROM weight_history ORDER BY record_date DESC LIMIT 1');
  return r ? r.weight : null;
}

export interface MuscleEntry {
  id: number;
  muscle_group: string;
  last_trained: string | null;
  total_sessions: number;
}

export function getMuscleTracker(): MuscleEntry[] {
  return getDb().getAllSync<MuscleEntry>('SELECT * FROM muscle_tracker ORDER BY muscle_group');
}

export interface Streak {
  id: number;
  streak_type: string;
  current_streak: number;
  longest_streak: number;
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Consecutive workout days ending today. Today only counts once trained (it
 * never breaks the streak while the day is still in progress), and days the
 * weekly plan marks as 'Rest' are skipped without breaking it.
 */
function computeCurrentStreak(db: DbLike): number {
  const rows = db.getAllSync<{ log_date: string }>(
    'SELECT log_date FROM daily_logs WHERE workout_completed=1 ORDER BY log_date ASC'
  );
  if (!rows.length) return 0;
  const done = new Set(rows.map(r => r.log_date));
  const earliest = rows[0].log_date;

  const restDays = new Set(
    db.getAllSync<{ day_of_week: string }>("SELECT day_of_week FROM workout_plans WHERE muscle_groups='Rest'")
      .map(r => r.day_of_week)
  );

  let current = 0;
  const cursor = new Date();
  if (done.has(toDateStr(cursor))) current++;
  for (;;) {
    cursor.setDate(cursor.getDate() - 1);
    const ds = toDateStr(cursor);
    if (ds < earliest) break;
    if (done.has(ds)) current++;
    else if (!restDays.has(DAY_NAMES[cursor.getDay()])) break;
  }
  return current;
}

export function getStreak(): Streak {
  const db = getDb();
  const stored = db.getFirstSync<Streak>('SELECT * FROM streaks WHERE streak_type=?', ['workout']) ||
  {
    id: 1,
    streak_type: 'workout',
    current_streak: 0,
    longest_streak: 0,
  };
  // Recompute on read so a missed day shows up without waiting for the next log
  const current = computeCurrentStreak(db);
  return { ...stored, current_streak: current, longest_streak: Math.max(stored.longest_streak, current) };
}

export function updateStreak(): void {
  const db = getDb();
  const { current_streak, longest_streak } = getStreak();

  db.runSync('UPDATE streaks SET current_streak=?, longest_streak=?, last_updated=? WHERE streak_type=?', [
    current_streak,
    longest_streak,
    todayStr(),
    'workout',
  ]);
}

export interface WeeklyStats {
  workouts: number;
  waterSuccess: number;
  proteinSuccess: number;
  creatineTaken: number;
  daysElapsed: number;
}

export function getWeeklyStats(): WeeklyStats {
  const db = getDb();
  const now = new Date();
  // Weeks start on Monday; on Sunday getDay() is 0, so go back 6 days, not forward 1
  const daysSinceMonday = (now.getDay() + 6) % 7;
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - daysSinceMonday);

  const ws = toDateStr(weekStart);

  const q = (sql: string) => (db.getFirstSync<{ c: number }>(sql, [ws])?.c) ?? 0;

  return {
    workouts: q('SELECT COUNT(*) as c FROM daily_logs WHERE log_date>=? AND workout_completed=1'),
    waterSuccess: q('SELECT COUNT(*) as c FROM daily_logs WHERE log_date>=? AND water_goal_reached=1'),
    proteinSuccess: q('SELECT COUNT(*) as c FROM daily_logs WHERE log_date>=? AND protein_goal_reached=1'),
    creatineTaken: q('SELECT COUNT(*) as c FROM daily_logs WHERE log_date>=? AND creatine_taken=1'),
    daysElapsed: daysSinceMonday + 1,
  };
}

export function getLastNDaysLogs(n = 30): DailyLog[] {
  const start = new Date();
  start.setDate(start.getDate() - n);
  const s = toDateStr(start);

  return getDb().getAllSync<DailyLog>('SELECT * FROM daily_logs WHERE log_date>=? ORDER BY log_date ASC', [s]);
}

export function resetDatabase(): void {
  const db = getDb();
  db.execSync(`
    DROP TABLE IF EXISTS daily_logs;
    DROP TABLE IF EXISTS food_log;
    DROP TABLE IF EXISTS water_log;
    DROP TABLE IF EXISTS workout_sessions;
    DROP TABLE IF EXISTS exercise_logs;
    DROP TABLE IF EXISTS personal_records;
    DROP TABLE IF EXISTS pr_history;
    DROP TABLE IF EXISTS weight_history;
    DROP TABLE IF EXISTS muscle_tracker;
    DROP TABLE IF EXISTS streaks;
    DROP TABLE IF EXISTS goals;
    DROP TABLE IF EXISTS workout_plans;
    DROP TABLE IF EXISTS workout_plan_exercises;
    DROP TABLE IF EXISTS settings;
    DROP TABLE IF EXISTS progress_photos;
    DROP TABLE IF EXISTS starred_pr_exercises;
    DROP TABLE IF EXISTS custom_exercises;
    DROP TABLE IF EXISTS pr_entries;
    DROP TABLE IF EXISTS reminders;
    PRAGMA user_version = 0;
  `);
  // user_version is reset so migrations re-apply on top of the fresh baseline tables
  initializeDatabase();
}

/** Every stored progress photo file, so callers can delete them alongside a reset. */
export function getAllProgressPhotoUris(): string[] {
  return getDb()
    .getAllSync<{ uri: string }>('SELECT uri FROM progress_photos')
    .map(r => r.uri);
}

// ── Progress Photos ────────────────────────────────────────────────────────
export type ProgressPhoto = {
  id: number;
  photo_date: string;
  uri: string;
  created_at: string;
};

export function addProgressPhoto(photo_date: string, uri: string): number {
  const db = getDb();
  const result = db.runSync(
    'INSERT INTO progress_photos (photo_date, uri) VALUES (?, ?)',
    [photo_date, uri]
  );
  return result.lastInsertRowId;
}

export function getProgressPhotos(photo_date: string): ProgressPhoto[] {
  const db = getDb();
  return db.getAllSync<ProgressPhoto>(
    'SELECT * FROM progress_photos WHERE photo_date = ? ORDER BY created_at ASC',
    [photo_date]
  );
}

export function getProgressPhotoDates(): string[] {
  const db = getDb();
  const rows = db.getAllSync<{ photo_date: string }>(
    'SELECT DISTINCT photo_date FROM progress_photos ORDER BY photo_date ASC'
  );
  return rows.map(r => r.photo_date);
}

export function deleteProgressPhoto(id: number, uri: string): void {
  const db = getDb();
  db.runSync('DELETE FROM progress_photos WHERE id = ?', [id]);
}

// ── Daily Date-Specific Queries for Workouts & Nutrition Analytics ────────────

export function getWorkoutSessionsForDate(date: string): WorkoutSession[] {
  return getDb().getAllSync<WorkoutSession>(
    'SELECT * FROM workout_sessions WHERE session_date=? ORDER BY id ASC',
    [date]
  );
}

export function getExerciseLogsForDate(date: string): ExerciseLog[] {
  return getDb().getAllSync<ExerciseLog>(
    'SELECT * FROM exercise_logs WHERE session_date=? ORDER BY id ASC',
    [date]
  );
}

export function getWorkoutDates(): string[] {
  const db = getDb();
  const rows = db.getAllSync<{ d: string }>(`
    SELECT DISTINCT session_date as d FROM workout_sessions
    UNION
    SELECT DISTINCT session_date as d FROM exercise_logs
    UNION
    SELECT DISTINCT log_date as d FROM daily_logs WHERE workout_completed = 1
    ORDER BY d ASC
  `);
  return rows.map(r => r.d).filter(Boolean);
}

export function getDailyLogForDate(date: string): DailyLog | null {
  return getDb().getFirstSync<DailyLog>('SELECT * FROM daily_logs WHERE log_date=?', [date]);
}

export interface WaterEntry {
  id: number;
  log_date: string;
  amount_ml: number;
  logged_at: string;
}

export function getWaterLog(logDate?: string): WaterEntry[] {
  const d = logDate || todayStr();
  return getDb().getAllSync<WaterEntry>(
    'SELECT * FROM water_log WHERE log_date=? ORDER BY logged_at ASC',
    [d]
  );
}

export function getNutritionDates(): string[] {
  const db = getDb();
  const rows = db.getAllSync<{ d: string }>(`
    SELECT DISTINCT log_date as d FROM daily_logs 
    WHERE protein_intake > 0 OR calorie_intake > 0 OR water_intake > 0 OR creatine_taken = 1
    UNION
    SELECT DISTINCT log_date as d FROM food_log
    UNION
    SELECT DISTINCT log_date as d FROM water_log
    ORDER BY d ASC
  `);
  return rows.map(r => r.d).filter(Boolean);
}