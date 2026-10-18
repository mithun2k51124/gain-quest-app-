// utils/loadFeedback.ts — the 👍 / 👎 a user gives an exercise on the Log tab, and the weight it
// sets for next time. Stored per exercise name in the settings table.
import { getSetting, setSetting, todayStr } from '../db/database';

export type Vote = 'up' | 'down';

export interface LoadFeedback {
  vote: Vote;
  kg: number;     // the weight to use next session
  date: string;   // YYYY-MM-DD the feedback was given
}

const KEY = 'load_feedback';

function readAll(): Record<string, LoadFeedback> {
  try { return JSON.parse(getSetting(KEY, '{}')) ?? {}; } catch { return {}; }
}

export function getLoadFeedback(exercise: string): LoadFeedback | null {
  return readAll()[exercise] ?? null;
}

export function saveLoadFeedback(exercise: string, vote: Vote, kg: number): LoadFeedback {
  const all = readAll();
  const fb = { vote, kg, date: todayStr() };
  all[exercise] = fb;
  setSetting(KEY, JSON.stringify(all));
  return fb;
}
