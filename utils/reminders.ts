// utils/reminders.ts — schedules local reminder notifications from the reminders table.
// Notifications are scheduled one-off for the next 7 days (not repeating) so each one can
// carry live progress and skip itself when that goal is already done today.
import type * as NotificationsModule from 'expo-notifications';
import { AppState, Platform } from 'react-native';
import {
  getReminders, getSetting, setSetting, getTodayLog, getGoals, getWorkoutPlans, getSupplements,
  getSupplementsTaken, reachedGoal, Reminder, ReminderKind, DailyLog, Goals, WorkoutPlan, Supplement,
} from '../db/database';
import { logError } from './logError';

// Loaded lazily: Expo Go (SDK 53+) lacks some native parts of expo-notifications and
// throws at import time, so reminders are simply unavailable there instead of crashing.
let Notifications: typeof NotificationsModule | null = null;
try {
  Notifications = require('expo-notifications');
} catch (e) {
  logError('expoNotificationsUnavailable', e);
}
export const notificationsAvailable = Notifications != null;

const CHANNEL_ID = 'reminders';
const ACCENT = '#3B82F6';
const DAYS_AHEAD = 7;
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const REMINDER_KINDS: Record<ReminderKind, { label: string; icon: string; colorKey: string }> = {
  water:      { label: 'Drink water',     icon: 'water',      colorKey: 'water' },
  protein:    { label: 'Protein check',   icon: 'restaurant', colorKey: 'protein' },
  supplement: { label: 'Take supplement', icon: 'leaf',       colorKey: 'teal' },
  workout:    { label: 'Workout time',    icon: 'barbell',    colorKey: 'purple' },
  custom:     { label: 'Reminder',        icon: 'notifications', colorKey: 'accent' },
};

/** Label of a supplement's reminders: 'Take Vitamin D'. */
export const supplementReminderLabel = (name: string) => `Take ${name}`;

export function remindersEnabled(): boolean {
  return notificationsAvailable && getSetting('reminders_enabled', 'false') === 'true';
}

export const REMINDERS_UNAVAILABLE_MSG =
  'Reminder notifications need the installed GainQuest app — they can\'t run inside Expo Go.';

/**
 * Whether today's goal behind this reminder is already done (so it's skipped).
 * `taken` = today's supplement log (getSupplementsTaken), for supplement reminders.
 */
export function isReminderDone(
  r: Pick<Reminder, 'kind' | 'ref_id'>, log: DailyLog, goals: Goals, taken: Record<number, string> = {}
): boolean {
  switch (r.kind) {
    case 'water':      return reachedGoal(log.water_intake, goals.water_goal);
    case 'protein':    return reachedGoal(log.protein_intake, goals.protein_goal);
    case 'supplement': return r.ref_id != null && !!taken[r.ref_id];
    case 'workout':    return !!log.workout_completed;
    default:           return false;
  }
}

function planFor(plans: WorkoutPlan[], weekday: number): WorkoutPlan | undefined {
  return plans.find(p => p.day_of_week === DAY_NAMES[weekday]);
}

/** Notification text, or null when this reminder shouldn't fire that day. */
function contentFor(
  r: Reminder, weekday: number, today: DailyLog | null, goals: Goals, plans: WorkoutPlan[],
  supplements: Map<number, Supplement>, taken: Record<number, string>
): { title: string; body: string } | null {
  if (today && isReminderDone(r, today, goals, taken)) return null;
  switch (r.kind) {
    case 'water': {
      const g = goals.water_goal;
      if (today && g > 0) return { title: r.label, body: `${today.water_intake.toFixed(1)} of ${g} L so far. Time for a glass.` };
      return { title: r.label, body: g > 0 ? `Aim for ${g} L today. Start with a glass.` : 'Time for a glass of water.' };
    }
    case 'protein': {
      const g = goals.protein_goal;
      if (today && g > 0) return { title: r.label, body: `${Math.round(today.protein_intake)} of ${g} g protein today.` };
      return { title: r.label, body: g > 0 ? `${g} g protein goal today.` : 'Get some protein in.' };
    }
    case 'supplement': {
      // A reminder left behind by a deleted supplement never fires
      const s = r.ref_id != null ? supplements.get(r.ref_id) : undefined;
      if (!s) return null;
      return { title: supplementReminderLabel(s.name), body: s.dose ? `${s.dose} · tap to tick it off.` : 'Tap to tick it off.' };
    }
    case 'workout': {
      const plan = planFor(plans, weekday);
      if (!plan || plan.muscle_groups === 'Rest') return null;
      return { title: r.label, body: `${plan.plan_name} today. Let's go.` };
    }
    default:
      return { title: r.label, body: 'GainQuest reminder' };
  }
}

async function doReschedule(): Promise<void> {
  if (!Notifications) return;
  await Notifications.cancelAllScheduledNotificationsAsync();
  if (!remindersEnabled()) return;
  const { granted } = await Notifications.getPermissionsAsync();
  if (!granted) return;

  const reminders = getReminders().filter(r => r.enabled);
  if (!reminders.length) return;
  const goals = getGoals();
  const plans = getWorkoutPlans();
  const todayLog = getTodayLog();
  const supplements = new Map(getSupplements().map(s => [s.id, s]));
  const takenToday = getSupplementsTaken();
  const now = Date.now();

  for (let d = 0; d < DAYS_AHEAD; d++) {
    const day = new Date();
    day.setDate(day.getDate() + d);
    const weekday = day.getDay();
    for (const r of reminders) {
      if (!r.days.includes(String(weekday))) continue;
      const fire = new Date(day.getFullYear(), day.getMonth(), day.getDate(), r.hour, r.minute, 0);
      if (fire.getTime() <= now + 30_000) continue;
      const content = contentFor(r, weekday, d === 0 ? todayLog : null, goals, plans, supplements, takenToday);
      if (!content) continue;
      await Notifications.scheduleNotificationAsync({
        content: { ...content, color: ACCENT, data: { kind: r.kind } },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: fire, channelId: CHANNEL_ID },
      });
    }
  }
}

let queue: Promise<void> = Promise.resolve();
/** Rebuild all scheduled notifications from the current reminders + today's progress. */
export function rescheduleReminders(): Promise<void> {
  queue = queue.then(doReschedule).catch(e => logError('rescheduleReminders', e));
  return queue;
}

/** Ask for permission and switch reminders on. Returns false if the user declined. */
export async function turnOnReminders(): Promise<boolean> {
  if (!Notifications) return false;
  const current = await Notifications.getPermissionsAsync();
  const { granted } = current.granted ? current : await Notifications.requestPermissionsAsync();
  if (!granted) return false;
  setSetting('reminders_enabled', 'true');
  await rescheduleReminders();
  return true;
}

export async function turnOffReminders(): Promise<void> {
  setSetting('reminders_enabled', 'false');
  await rescheduleReminders();
}

/**
 * Calls `onTap` with the reminder kind when the user taps one of our notifications —
 * including the tap that launched the app from closed. Returns an unsubscribe function.
 */
export function onReminderTap(onTap: (kind: ReminderKind) => void): () => void {
  if (!Notifications) return () => {};
  const N = Notifications;
  const handled = new Set<string>();
  const handle = (res: NotificationsModule.NotificationResponse | null) => {
    if (!res || res.actionIdentifier !== N.DEFAULT_ACTION_IDENTIFIER) return;
    const id = res.notification.request.identifier;
    if (handled.has(id)) return;
    handled.add(id);
    const kind = res.notification.request.content.data?.kind as ReminderKind | undefined;
    if (kind) onTap(kind);
    N.clearLastNotificationResponseAsync().catch(e => logError('clearNotificationResponse', e));
  };
  N.getLastNotificationResponseAsync().then(handle).catch(e => logError('lastNotificationResponse', e));
  const sub = N.addNotificationResponseReceivedListener(handle);
  return () => sub.remove();
}

let initialised = false;
/** Call once at startup (after the database is ready). */
export function initReminders(): void {
  if (initialised || !Notifications) return;
  initialised = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false,
    }),
  });
  if (Platform.OS === 'android') {
    Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Reminders',
      importance: Notifications.AndroidImportance.HIGH,
      lightColor: ACCENT,
      vibrationPattern: [0, 120],
      showBadge: false,
    }).catch(e => logError('reminderChannel', e));
  }
  rescheduleReminders();
  // Progress changes while the app is open (water logged, supplement taken...) — refresh on leave/return
  AppState.addEventListener('change', s => {
    if (s === 'background' || s === 'active') rescheduleReminders();
  });
}
