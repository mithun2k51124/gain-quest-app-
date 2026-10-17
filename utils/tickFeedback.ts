// utils/tickFeedback.ts — light haptic tick for scroll wheels
import * as Haptics from 'expo-haptics';
import { logError } from './logError';

const MIN_GAP_MS = 32; // fast flicks: cap at ~30 ticks/s so it stays a tick, not a buzz

let lastTick = 0;

/** Call once per number the wheel passes. */
export function tick(): void {
  const now = Date.now();
  if (now - lastTick < MIN_GAP_MS) return;
  lastTick = now;
  Haptics.selectionAsync().catch(e => logError('tickHaptic', e));
}
