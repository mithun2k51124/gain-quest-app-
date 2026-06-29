import * as SQLite from 'expo-sqlite';

type DbRunResult = {
  changes: number;
  lastInsertRowId: number;
};

type DbLike = {
  execSync: (source: string) => void;
  runSync: (source: string, params?: any[]) => DbRunResult;
  getFirstSync: <T>(source: string, params?: any[]) => T | null;
  getAllSync: <T>(source: string, params?: any[]) => T[];
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
    DROP TABLE IF EXISTS settings;
    DROP TABLE IF EXISTS goals;
    DROP TABLE IF EXISTS daily_logs;
    DROP TABLE IF EXISTS food_log;
    DROP TABLE IF EXISTS water_log;
    DROP TABLE IF EXISTS workout_plans;
    DROP TABLE IF EXISTS workout_plan_exercises;
    DROP TABLE IF EXISTS workout_sessions;
    DROP TABLE IF EXISTS exercise_logs;
    DROP TABLE IF EXISTS personal_records;
    DROP TABLE IF EXISTS pr_history;
    DROP TABLE IF EXISTS weight_history;
    DROP TABLE IF EXISTS muscle_tracker;
    DROP TABLE IF EXISTS streaks;
  `);
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
  `);

  const goalCount = db.getFirstSync<{ c: number }>('SELECT COUNT(*) as c FROM goals');
  if (!goalCount || goalCount.c === 0) {
    db.execSync(`
      INSERT INTO goals (water_goal, protein_goal, calorie_goal, weight_goal, creatine_dose)
      VALUES (3.0, 120.0, 2800, 75.0, 5.0);
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
    ('dark_mode', 'true'),
    ('name', 'Athlete'),
    ('weight_unit', 'kg');
  `);
}

export function todayStr(): string {
  return new Date().toISOString().split('T')[0];
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
    water_goal: 3,
    protein_goal: 120,
    calorie_goal: 2800,
    weight_goal: 75,
    creatine_dose: 5,
  };
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

export interface WorkoutSession {
  id: number;
  session_date: string;
  muscle_groups: string;
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

export function getExerciseHistory(exerciseName: string, limit = 20): ExerciseLog[] {
  return getDb().getAllSync<ExerciseLog>(
    'SELECT * FROM exercise_logs WHERE exercise_name=? ORDER BY session_date ASC LIMIT ?',
    [exerciseName, limit]
  );
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

function checkAndUpdatePR(
  db: DbLike,
  exerciseName: string,
  recordDate: string,
  sets: number,
  reps: number,
  weight: number,
  unit: string
): void {
  const oneRepMax = calculate1RM(weight, reps);
  const existing = db.getFirstSync<PR>('SELECT * FROM personal_records WHERE exercise_name=?', [exerciseName]);
  if (!existing || oneRepMax > existing.one_rep_max) {
    if (existing) {
      db.runSync(
        `INSERT INTO pr_history
         (exercise_name, record_date, sets, reps, weight, unit, one_rep_max)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          existing.exercise_name,
          existing.record_date,
          existing.sets,
          existing.reps,
          existing.weight,
          existing.unit,
          existing.one_rep_max,
        ]
      );
    }

    db.runSync(
      `INSERT OR REPLACE INTO personal_records
       (exercise_name, record_date, sets, reps, weight, unit, one_rep_max)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [exerciseName, recordDate, sets, reps, weight, unit, oneRepMax]
    );
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
  const new1RM = calculate1RM(weight, reps);
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

export function getStreak(): Streak {
  return getDb().getFirstSync<Streak>('SELECT * FROM streaks WHERE streak_type=?', ['workout']) ||
  {
    id: 1,
    streak_type: 'workout',
    current_streak: 0,
    longest_streak: 0,
  };
}

export function updateStreak(): void {
  const db = getDb();
  const rows = db.getAllSync<{ log_date: string }>(
    'SELECT log_date FROM daily_logs WHERE workout_completed=1 ORDER BY log_date DESC'
  );
  if (!rows.length) return;

  const today = new Date();
  let current = 0;
  for (let i = 0; i < rows.length; i++) {
    const expected = new Date(today);
    expected.setDate(today.getDate() - i);

    const expStr = expected.toISOString().split('T')[0];

    if (rows[i].log_date === expStr) current++;
    else break;
  }

  const existing = getStreak();
  const longest = Math.max(existing.longest_streak, current);

  db.runSync('UPDATE streaks SET current_streak=?, longest_streak=?, last_updated=? WHERE streak_type=?', [
    current,
    longest,
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
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay() + 1);

  const ws = weekStart.toISOString().split('T')[0];

  const q = (sql: string) => (db.getFirstSync<{ c: number }>(sql, [ws])?.c) ?? 0;

  return {
    workouts: q('SELECT COUNT(*) as c FROM daily_logs WHERE log_date>=? AND workout_completed=1'),
    waterSuccess: q('SELECT COUNT(*) as c FROM daily_logs WHERE log_date>=? AND water_goal_reached=1'),
    proteinSuccess: q('SELECT COUNT(*) as c FROM daily_logs WHERE log_date>=? AND protein_goal_reached=1'),
    creatineTaken: q('SELECT COUNT(*) as c FROM daily_logs WHERE log_date>=? AND creatine_taken=1'),
    daysElapsed: now.getDay() || 7,
  };
}

export function getLastNDaysLogs(n = 30): DailyLog[] {
  const start = new Date();
  start.setDate(start.getDate() - n);
  const s = start.toISOString().split('T')[0];

  return getDb().getAllSync<DailyLog>('SELECT * FROM daily_logs WHERE log_date>=? ORDER BY log_date ASC', [s]);
}