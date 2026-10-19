// utils/libraryPicks.ts — the Home Exercise Library widget's three picks.
// Each time the app is opened (a fresh start, or coming back after a while) it shows the next
// three from a shuffled deck of well-known exercises, so nothing repeats until the whole deck has
// been shown; then the deck is reshuffled. The deck is saved, so this carries across restarts.
import { AppState } from 'react-native';
import { getSetting, setSetting } from '../db/database';
import { POOLS } from '../constants/exercisePools';
import { findExercise } from '../constants/exerciseCatalog';
import { logError } from './logError';

const KEY = 'library_pick_deck';
const PER_OPEN = 3;
const AWAY_MS = 30_000;   // back from the background after this long counts as reopening

interface Deck { order: string[]; pos: number }

let current: string[] | null = null;
let listening = false;
let backgroundAt = 0;
const subscribers = new Set<(picks: string[]) => void>();

/** Every exercise the split builder uses that has photos: familiar, well-documented moves. */
function poolNames(): string[] {
  const names = new Set(Object.values(POOLS).flat().map(c => c.name));
  return [...names].filter(n => (findExercise(n)?.images.length ?? 0) > 0).sort();
}

function shuffled<T>(list: T[]): T[] {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function loadDeck(pool: string[]): Deck | null {
  try {
    const d = JSON.parse(getSetting(KEY, '')) as Deck;
    const inPool = new Set(pool);
    // A deck from an older exercise list starts over
    if (Array.isArray(d?.order) && d.order.length === pool.length && d.order.every(n => inPool.has(n))) return d;
  } catch { /* no deck yet */ }
  return null;
}

function draw(): string[] {
  try {
    const pool = poolNames();
    if (pool.length < PER_OPEN) return pool;
    let deck = loadDeck(pool);
    if (!deck || deck.pos + PER_OPEN > deck.order.length) {
      // A fresh shuffle puts the picks just shown at the back, so a new round never opens with them
      const lastShown = new Set(deck ? deck.order.slice(Math.max(0, deck.pos - PER_OPEN), deck.pos) : []);
      const order = shuffled(pool);
      deck = { order: [...order.filter(n => !lastShown.has(n)), ...order.filter(n => lastShown.has(n))], pos: 0 };
    }
    const picks = deck.order.slice(deck.pos, deck.pos + PER_OPEN);
    setSetting(KEY, JSON.stringify({ order: deck.order, pos: deck.pos + PER_OPEN }));
    return picks;
  } catch (e) {
    logError('libraryPicks', e);
    return poolNames().slice(0, PER_OPEN);
  }
}

function listen() {
  if (listening) return;
  listening = true;
  AppState.addEventListener('change', s => {
    if (s === 'background') backgroundAt = Date.now();
    else if (s === 'active' && backgroundAt && Date.now() - backgroundAt >= AWAY_MS) {
      backgroundAt = 0;
      current = draw();
      subscribers.forEach(cb => cb(current!));
    }
  });
}

/** This open's three picks (exercise names). */
export function currentPicks(): string[] {
  if (!current) current = draw();
  return current;
}

/** Called with new picks when the app is reopened from the background. */
export function subscribePicks(cb: (picks: string[]) => void): () => void {
  listen();
  subscribers.add(cb);
  return () => { subscribers.delete(cb); };
}
