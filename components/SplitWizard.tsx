// components/SplitWizard.tsx — a few quick questions → a personalised weekly split.
// Five short screens: about you (experience, goal, sex), your week (days, session length, rest
// days), where you train, what equipment you have (with photos), and a strength check with your
// bodyweight. Nothing is pre-selected and every question needs an answer before Next works.
// Plans run in blocks of a few weeks; when a block ends, a short re-test builds the next block
// with fresh exercises.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView, AppState, TextInput, Image, Animated,
  useWindowDimensions, Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../contexts/ThemeContext';
import { useCustomAlert } from '../contexts/AlertContext';
import { getSetting, setSetting, replaceWeeklyPlan, todayStr, getLatestWeight } from '../db/database';
import {
  generateSplit, defaultRestDays, exercisesPerSession, blockProgress,
  RECOMMENDED_DAYS, WEEK_ORDER, DAY_NAMES, PUSH_OPTIONS, PULL_OPTIONS, SQUAT_OPTIONS,
  ROTATE_OPTIONS, DEFAULT_ROTATE_WEEKS,
  Level, Goal, Sex, SplitAnswers, StrengthAnswers, PlannedDay, ExerciseChoice,
} from '../utils/splitGenerator';
import {
  EquipmentAnswers, EquipmentId, Place, EQUIPMENT_LABEL, EQUIPMENT_INFO, MORE_ITEMS, GYM_GROUPS, HOME_GROUPS,
  GYM_ALL, DUMBBELL_KG, KETTLEBELL_KG, PLATES_KG, ownedItems, countAvailable,
} from '../constants/equipment';
import { SkillKey, SKILL_LABEL } from '../constants/exercisePools';
import { findExercise } from '../constants/exerciseCatalog';
import { ExerciseGuideButton, LoopingThumb } from './ExerciseGuide';
import { SplitBuildIcon } from './SplitBuildIcon';
import { logError } from '../utils/logError';

/** What the split builder set for one exercise on one day. */
export interface ExerciseTarget {
  sets: number;
  reps: string;
  load?: string;   // starting weight, e.g. '10 kg each' or 'Bodyweight'
  kg?: number;     // the number in load, when there is one
}

export interface SplitConfig extends SplitAnswers {
  name: string;
  prescription: string;
  blockStart?: string;              // local YYYY-MM-DD the current block started
  rotateWeeks?: number;             // new exercises every N weeks
  targets?: Record<string, ExerciseTarget>;  // targetKey(day, exercise) → sets, reps, starting weight
  doses?: Record<string, string>;   // older splits: '3 × 8–12' by targetKey or by exercise name
}

// The same exercise can get a different target on different days, so targets are stored per day
const targetKey = (day: string, exercise: string) => `${day}|${exercise}`;

/** What the split builder set for an exercise on a planner day ('Monday'), if anything. */
export function targetFor(cfg: SplitConfig | null, day: string, exercise: string): ExerciseTarget | null {
  const t = cfg?.targets?.[targetKey(day, exercise)];
  if (t) return t;
  // Splits saved before starting weights only stored sets × reps
  const dose = cfg?.doses?.[targetKey(day, exercise)] ?? cfg?.doses?.[exercise];
  const m = dose?.match(/^(\d+) × (.+)$/);
  return m ? { sets: Number(m[1]), reps: m[2] } : null;
}

/** The same target at a different weight ('10 kg each' → '7.5 kg each'), e.g. after a 👎. */
export function withKg(t: ExerciseTarget, kg: number): ExerciseTarget {
  return { ...t, kg, load: t.load?.replace(/[\d.]+ kg/, `${kg} kg`) ?? `${kg} kg` };
}

/** Timed targets ('30–60 s', '20–40 s each side') are holds, not reps. */
const isTimed = (reps: string) => /\d s\b/.test(reps);

/** '3 sets × 8–12 reps', or '3 sets × 30–60 s' for holds */
export function setsRepsText(t: { sets: number; reps: string }): string {
  return `${t.sets} sets × ${t.reps}${isTimed(t.reps) ? '' : ' reps'}`;
}

/** '3 sets × 8–12 reps · 10 kg each' */
export function targetText(t: ExerciseTarget): string {
  return `${setsRepsText(t)}${t.load ? ` · ${t.load}` : ''}`;
}

/** The target in plain words: 'Do 3 sets of 8–12 reps with 10 kg in each hand.' */
export function targetSentence(t: ExerciseTarget): string {
  if (isTimed(t.reps)) return `Hold for ${t.reps}, ${t.sets} times, resting between each.`;
  const load = t.load ?? '';
  let using = '';
  if (t.kg !== undefined) {
    using = load.endsWith(' each') ? ` with ${t.kg} kg in each hand`
      : load.startsWith('+') ? ` with ${t.kg} kg added`
      : load.endsWith(' plate') ? ` holding a ${t.kg} kg plate`
      : load.endsWith(' ball') ? ` with a ${t.kg} kg ball`
      : ` with ${t.kg} kg`;
  } else if (/band$/i.test(load)) {
    using = ` with a ${load.toLowerCase()}`;
  }
  return `Do ${t.sets} sets of ${t.reps} reps${using}.`;
}

type StepKey = 'you' | 'schedule' | 'place' | 'equipment' | 'strength' | 'plan';
type Icon = keyof typeof Ionicons.glyphMap;

const SETTING_KEY = 'split_config';
const HIT = { top: 10, bottom: 10, left: 10, right: 10 };
const LEVELS: { key: Level; title: string; sub: string; icon: Icon }[] = [
  { key: 'beginner', title: 'Beginner', sub: 'New to lifting, or under a year of regular training', icon: 'leaf-outline' },
  { key: 'intermediate', title: 'Intermediate', sub: '1–3 years of consistent training', icon: 'trending-up-outline' },
  { key: 'advanced', title: 'Pro', sub: '3+ years, comfortable with heavy lifts', icon: 'flame-outline' },
];
const GOALS: { key: Goal; title: string; sub: string; icon: Icon }[] = [
  { key: 'muscle', title: 'Build muscle', sub: 'Moderate weights, 8–12 reps', icon: 'body-outline' },
  { key: 'strength', title: 'Get stronger', sub: 'Heavier weights, fewer reps, longer rests', icon: 'barbell-outline' },
  { key: 'fitness', title: 'Stay fit & lean', sub: 'Lighter weights, more reps, short rests', icon: 'heart-outline' },
];
const SEXES: { key: Sex; title: string }[] = [
  { key: 'male', title: 'Male' }, { key: 'female', title: 'Female' }, { key: 'unspecified', title: 'Rather not say' },
];
const PLACES: { key: Place; title: string; sub: string; icon: Icon }[] = [
  { key: 'gym', title: 'Gym', sub: 'Next, tick what your gym has', icon: 'barbell-outline' },
  { key: 'home', title: 'Home', sub: 'Next, tick what you have at home', icon: 'home-outline' },
  { key: 'bodyweight', title: 'No equipment', sub: 'Bodyweight only, anywhere', icon: 'body-outline' },
];
const PLACE_LABEL: Record<Place, string> = { gym: 'Gym', home: 'Home', bodyweight: 'Bodyweight' };
const MINUTES = [30, 45, 60, 75, 90];
const DAYS = [2, 3, 4, 5, 6];
const LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const BARBELL_SKILLS: SkillKey[] = ['bbSquat', 'deadlift', 'bench', 'ohp'];
const KB_SKILLS: SkillKey[] = ['kbSwing', 'kbClean'];
const PLURAL = new Set<EquipmentId>(['dumbbells', 'bands', 'dip_bars', 'rings', 'machines', 'cardio']);
// Muscle-group chips in the planner use 'Upper Back'; the exercise library uses 'Back'
const toPlannerGroup = (m: string) => (m === 'Back' ? 'Upper Back' : m);
const kg = (list: number[]) => list.map((v, i) => `${v}${i === list.length - 1 ? '+' : ''} kg`);
/** A typed bodyweight in kg, or undefined if it isn't a believable number. */
const parseBodyweight = (s: string) => {
  const n = parseFloat(s.replace(',', '.'));
  return n >= 30 && n <= 250 ? n : undefined;
};
/** The latest logged bodyweight, else the profile's, offered as a one-tap answer. */
function knownBodyweight(cfg: SplitConfig | null): number | undefined {
  let n: number | null | undefined = null;
  try { n = getLatestWeight(); } catch (e) { logError('splitBodyweight', e); }
  n = n || cfg?.bodyweightKg || parseFloat(getSetting('body_weight', '')) || undefined;
  return n ? Math.round(n * 10) / 10 : undefined;
}
const profileAge = () => {
  const n = parseInt(getSetting('age', ''), 10);
  return n > 0 ? n : undefined;
};

/** 'a pull-up bar', 'an exercise ball', 'dumbbells' */
function itemPhrase(id: EquipmentId): string {
  const label = EQUIPMENT_LABEL[id].replace(/^[A-Z](?=[a-z])/, c => c.toLowerCase());
  if (PLURAL.has(id)) return label;
  return /^[aeiou]/i.test(label) ? `an ${label}` : `a ${label}`;
}

/** 'Barbell squat, deadlift and bench press' */
function listText(labels: string[]): string {
  const shown = labels.slice(0, 3).map((l, i) => (i === 0 ? l : l.charAt(0).toLowerCase() + l.slice(1)));
  if (labels.length > 3) shown.push(`${labels.length - 3} more`);
  return shown.length > 1 ? `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}` : shown[0];
}

export function getSplitConfig(): SplitConfig | null {
  try {
    const raw = getSetting(SETTING_KEY, '');
    return raw ? (JSON.parse(raw) as SplitConfig) : null;
  } catch (e) {
    logError('splitConfig', e);
    return null;
  }
}

// Answers to the home follow-up questions; nothing is assumed until it's answered
interface HomeFollowUps {
  dumbbellMax?: number;
  kettlebells?: 1 | 2;
  kettlebellMax?: number;
  rack?: boolean;
  plates?: number;
  ezBar?: boolean;
  adjustable?: boolean;
}
type StrengthPicks = { push: number | null; pull: number | null; squat: number | null };
const NO_STRENGTH: StrengthPicks = { push: null, pull: null, squat: null };

/**
 * mode 'setup' asks everything and starts block 1.
 * mode 'next' re-tests strength and builds the next block (falls back to setup for splits made
 * before the equipment questions existed).
 */
export function SplitWizard({ visible, mode = 'setup', onClose, onApplied }: {
  visible: boolean; mode?: 'setup' | 'next'; onClose: () => void; onApplied: () => void;
}) {
  const { C } = useTheme();
  const styles = makeStyles(C);
  const { showAlert } = useCustomAlert();
  const { width: winW } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const [step, setStep] = useState(0);
  const [nextBlock, setNextBlock] = useState(false);
  const [prev, setPrev] = useState<SplitConfig | null>(null);   // the split being replaced, for hints
  // About you
  const [level, setLevel] = useState<Level | null>(null);
  const [goal, setGoal] = useState<Goal | null>(null);
  const [sex, setSex] = useState<Sex | null>(null);
  // Your week
  const [days, setDays] = useState<number | null>(null);
  const [minutes, setMinutes] = useState<number | null>(null);
  const [restDays, setRestDays] = useState<number[]>([]);
  // Where and with what
  const [place, setPlace] = useState<Place | null>(null);
  const [items, setItems] = useState<EquipmentId[]>([]);
  const [home, setHome] = useState<HomeFollowUps>({});
  const [showMore, setShowMore] = useState(false);
  const [preview, setPreview] = useState<EquipmentId | null>(null);
  // Strength
  const [strength, setStrength] = useState<StrengthPicks>(NO_STRENGTH);
  const [barbellExp, setBarbellExp] = useState<boolean | null>(null);
  const [kbExp, setKbExp] = useState<boolean | null>(null);
  const [bodyweight, setBodyweight] = useState('');
  const [lastWeight, setLastWeight] = useState<number | undefined>(undefined);
  // Plan
  const [rotateWeeks, setRotateWeeks] = useState(DEFAULT_ROTATE_WEEKS);
  const [block, setBlock] = useState(0);
  const [openDays, setOpenDays] = useState<Set<number>>(new Set());
  const [swaps, setSwaps] = useState<Record<string, number>>({});
  // Unanswered questions are pointed out after a Next that couldn't go on
  const [tried, setTried] = useState(false);
  const shake = useMemo(() => new Animated.Value(0), []);

  // Each opening starts clean: answers are given, never pre-selected. Starting the next block keeps
  // the setup answers and only re-tests strength.
  useEffect(() => {
    if (!visible) return;
    const cfg = getSplitConfig();
    const next = mode === 'next' && !!cfg?.equipment;
    setPrev(cfg);
    setStep(0);
    setTried(false);
    setOpenDays(new Set());
    setShowMore(false);
    setPreview(null);
    setNextBlock(next);
    setBlock(next ? (cfg?.block ?? 0) + 1 : 0);
    setStrength(NO_STRENGTH);
    setBodyweight('');
    setLastWeight(knownBodyweight(cfg));
    setRotateWeeks(cfg?.rotateWeeks ?? DEFAULT_ROTATE_WEEKS);
    if (next && cfg) {
      setLevel(cfg.level); setGoal(cfg.goal ?? null); setSex(cfg.sex ?? null);
      setMinutes(cfg.minutes); setDays(cfg.daysPerWeek); setRestDays(cfg.restDays);
      setPlace(cfg.equipment!.place); setItems(cfg.equipment!.items);
      setHome({
        dumbbellMax: cfg.equipment!.dumbbellMaxKg, kettlebellMax: cfg.equipment!.kettlebellMaxKg,
        plates: cfg.equipment!.plateTotalKg,
      });
      const known = new Set(cfg.skills ?? []);
      setBarbellExp(BARBELL_SKILLS.some(s => known.has(s)));
      setKbExp(KB_SKILLS.some(s => known.has(s)));
    } else {
      setLevel(null); setGoal(null); setSex(null);
      setMinutes(null); setDays(null); setRestDays([]);
      setPlace(null); setItems([]); setHome({});
      setBarbellExp(null); setKbExp(null);
    }
  }, [visible]);

  // ── The equipment answers, as the generator reads them ──
  const equipment: EquipmentAnswers = useMemo(() => {
    if (!place || place === 'bodyweight') return { place: place ?? 'bodyweight', items: [] };
    if (place === 'gym' || nextBlock) {
      return { place, items, dumbbellMaxKg: home.dumbbellMax, kettlebellMaxKg: home.kettlebellMax, plateTotalKg: home.plates };
    }
    // At home, racks, EZ bars, a second kettlebell and bench type are follow-up answers
    const has = (id: EquipmentId) => items.includes(id);
    const extra: EquipmentId[] = [
      ...(has('barbell') && home.rack ? ['rack' as const] : []),
      ...(has('barbell') && home.ezBar ? ['ez_bar' as const] : []),
      ...(has('bench') && home.adjustable ? ['adj_bench' as const] : []),
      ...(has('kettlebell') && home.kettlebells === 2 ? ['kettlebell_pair' as const] : []),
    ];
    return {
      place, items: [...items, ...extra],
      dumbbellMaxKg: has('dumbbells') ? home.dumbbellMax : undefined,
      kettlebellMaxKg: has('kettlebell') ? home.kettlebellMax : undefined,
      plateTotalKg: has('barbell') ? home.plates : undefined,
    };
  }, [place, items, home, nextBlock]);

  const owned = useMemo(() => ownedItems(equipment), [equipment]);
  const available = useMemo(() => countAvailable(equipment), [equipment]);
  const hasBar = owned.has('pullup_bar');
  const askBarbell = !nextBlock && owned.has('barbell');
  const askKettlebell = !nextBlock && owned.has('kettlebell');

  // Older splits without the newer "about you" answers ask them again before the next block
  const needYou = nextBlock && (!prev?.goal || !prev?.sex);
  const flow: StepKey[] = nextBlock
    ? [...(needYou ? ['you' as const] : []), 'strength', 'plan']
    : ['you', 'schedule', 'place', ...(place && place !== 'bodyweight' ? ['equipment' as const] : []), 'strength', 'plan'];
  const last = flow.length - 1;
  const key = flow[Math.min(step, last)];

  const needRest = days ? 7 - days : 0;
  const restOk = days !== null && restDays.length === needRest;
  const bodyweightKg = parseBodyweight(bodyweight);

  // ── What's still unanswered on each step ──
  const homeMissing = (): string[] => {
    if (place !== 'home') return [];
    const has = (id: EquipmentId) => items.includes(id);
    const out: string[] = [];
    if (has('dumbbells') && home.dumbbellMax === undefined) out.push('dumbbellMax');
    if (has('kettlebell') && home.kettlebells === undefined) out.push('kettlebells');
    if (has('kettlebell') && home.kettlebellMax === undefined) out.push('kettlebellMax');
    if (has('barbell') && home.rack === undefined) out.push('rack');
    if (has('barbell') && home.plates === undefined) out.push('plates');
    if (has('barbell') && home.ezBar === undefined) out.push('ezBar');
    if (has('bench') && home.adjustable === undefined) out.push('adjustable');
    return out;
  };
  const missing: string[] = (() => {
    switch (key) {
      case 'you': return [!level && 'level', !goal && 'goal', !sex && 'sex'].filter(Boolean) as string[];
      case 'schedule': return [!days && 'days', !minutes && 'minutes', days && !restOk && 'rest'].filter(Boolean) as string[];
      case 'place': return place ? [] : ['place'];
      case 'equipment': return [...(items.length ? [] : ['items']), ...homeMissing()];
      case 'strength': return [
        strength.push === null && 'push',
        hasBar && strength.pull === null && 'pull',
        strength.squat === null && 'squat',
        askBarbell && barbellExp === null && 'barbellExp',
        askKettlebell && kbExp === null && 'kbExp',
        !bodyweightKg && 'bodyweight',
      ].filter(Boolean) as string[];
      default: return [];
    }
  })();
  const isMissing = (q: string) => tried && missing.includes(q);

  // ── The plan (only built once every answer is in) ──
  const answers: SplitAnswers | null = level && goal && sex && days && minutes && restOk && place
    && strength.push !== null && strength.squat !== null && bodyweightKg
    ? {
      level, goal, sex, minutes, daysPerWeek: days, restDays, equipment, block, bodyweightKg, age: profileAge(),
      strength: { push: strength.push, pull: hasBar ? strength.pull ?? 0 : 0, squat: strength.squat },
      skills: nextBlock
        ? prev?.skills ?? []
        : [...(askBarbell && barbellExp ? BARBELL_SKILLS : []), ...(askKettlebell && kbExp ? KB_SKILLS : [])],
    }
    : null;
  const plan = useMemo(() => (answers ? generateSplit(answers) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(answers)]);
  useEffect(() => setSwaps({}), [plan]);
  // Each step starts at its top
  useEffect(() => { scrollRef.current?.scrollTo({ y: 0, animated: false }); }, [step]);

  // ── Answer handlers ──
  const chooseDays = (d: number) => { setDays(d); setRestDays(defaultRestDays(d)); };
  const toggleRest = (d: number) =>
    setRestDays(r => (r.includes(d) ? r.filter(x => x !== d) : [...r, d]));
  const pickStrength = (k: keyof StrengthPicks, v: number) => setStrength(s => ({ ...s, [k]: v }));
  const choosePlace = (p: Place) => {
    if (p === place) return;
    setPlace(p); setItems([]); setHome({}); setShowMore(false);
    setBarbellExp(null); setKbExp(null);
  };
  const toggleItem = (id: EquipmentId) => {
    Haptics.selectionAsync().catch(() => {});
    setItems(cur => {
      if (cur.includes(id)) {
        // In a gym a kettlebell means a range of them, so the pair goes with it
        return cur.filter(x => x !== id && !(place === 'gym' && id === 'kettlebell' && x === 'kettlebell_pair'));
      }
      return [...cur, id, ...(place === 'gym' && id === 'kettlebell' && !cur.includes('kettlebell_pair') ? ['kettlebell_pair' as const] : [])];
    });
    // Unticking at home clears that item's follow-up answers, so they're asked again
    if (place === 'home' && items.includes(id)) {
      setHome(h => {
        const n = { ...h };
        if (id === 'dumbbells') delete n.dumbbellMax;
        if (id === 'kettlebell') { delete n.kettlebells; delete n.kettlebellMax; }
        if (id === 'barbell') { delete n.rack; delete n.plates; delete n.ezBar; }
        if (id === 'bench') delete n.adjustable;
        return n;
      });
    }
    if (id === 'barbell') setBarbellExp(null);
    if (id === 'kettlebell') setKbExp(null);
  };
  const selectAllGym = () => { setItems([...GYM_ALL]); Haptics.selectionAsync().catch(() => {}); };
  const clearItems = () => { setItems([]); setBarbellExp(null); setKbExp(null); };

  // ── Swapping exercises in the preview ──
  const shown = (d: PlannedDay, i: number): ExerciseChoice => {
    const opts = [d.exercises[i], ...d.exercises[i].alternatives];
    return opts[(swaps[`${d.weekday}:${i}`] ?? 0) % opts.length];
  };
  const swap = (d: PlannedDay, i: number) => {
    const k = `${d.weekday}:${i}`;
    const opts = [d.exercises[i], ...d.exercises[i].alternatives];
    const taken = new Set(d.exercises.map((_, j) => (j === i ? '' : shown(d, j).name)));
    let next = swaps[k] ?? 0;
    for (let n = 0; n < opts.length; n++) {
      next = (next + 1) % opts.length;
      if (!taken.has(opts[next].name)) break;
    }
    setSwaps(s => ({ ...s, [k]: next }));
  };
  const toggleOpenDay = (weekday: number) =>
    setOpenDays(cur => {
      const next = new Set(cur);
      next.has(weekday) ? next.delete(weekday) : next.add(weekday);
      return next;
    });

  const apply = () => {
    if (!plan || !answers) return;
    const doApply = () => {
      const finalDays = plan.days.map(d => ({ day: d, picks: d.exercises.map((_, i) => shown(d, i)) }));
      replaceWeeklyPlan(finalDays.map(({ day, picks }) => ({
        dayOfWeek: day.dayName,
        planName: day.title,
        muscleGroups: day.rest ? 'Rest' : [...new Set(picks.map(e => toPlannerGroup(e.muscle)))].join(','),
        exercises: picks.map(e => ({ name: e.name, muscle: e.muscle })),
      })));
      const targets: Record<string, ExerciseTarget> = {};
      for (const { day, picks } of finalDays) {
        for (const e of picks) targets[targetKey(day.dayName, e.name)] = { sets: e.sets, reps: e.reps, load: e.load, kg: e.kg };
      }
      const cfg: SplitConfig = {
        ...answers, rotateWeeks, blockStart: todayStr(), name: plan.name, prescription: plan.prescription, targets,
      };
      setSetting(SETTING_KEY, JSON.stringify(cfg));
      // The bodyweight answer is the best guess we have for the profile too
      if (bodyweightKg) setSetting('body_weight', String(bodyweightKg));
      onApplied();
      onClose();
    };
    showAlert(nextBlock ? 'Start the new block?' : 'Use this plan?',
      'This replaces the exercises in your weekly planner. Your workout history and PRs are not affected.', [
        { text: 'Cancel', style: 'cancel' },
        { text: nextBlock ? 'Start block' : 'Use plan', onPress: doApply },
      ]);
  };

  const goNext = () => {
    if (missing.length) {
      setTried(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      Animated.sequence([
        Animated.timing(shake, { toValue: 8, duration: 50, useNativeDriver: true }),
        Animated.timing(shake, { toValue: -8, duration: 60, useNativeDriver: true }),
        Animated.timing(shake, { toValue: 5, duration: 55, useNativeDriver: true }),
        Animated.timing(shake, { toValue: 0, duration: 50, useNativeDriver: true }),
      ]).start();
      return;
    }
    setTried(false);
    if (step < last) setStep(s => s + 1);
    else apply();
  };
  const goBack = () => { setTried(false); setStep(s => s - 1); };

  // ── Building blocks ──
  const qLabel = (text: string, q: string) => (
    <View style={styles.qLabelRow}>
      <Text style={[styles.rowLbl, isMissing(q) && { color: C.orange }]}>{text}</Text>
      {isMissing(q) && <Text style={styles.required}>Pick one</Text>}
    </View>
  );

  const option = (k: string, on: boolean, onPress: () => void, icon: Icon, title: string, sub: string, q: string) => (
    <TouchableOpacity key={k} onPress={onPress} activeOpacity={0.85}
      style={[styles.option, on && { borderColor: C.accent, backgroundColor: C.accent + '14' },
        isMissing(q) && { borderColor: C.orange + '88' }]}>
      <View style={[styles.optIcon, { backgroundColor: C.accent + '1A' }]}>
        <Ionicons name={icon} size={18} color={C.accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.optTitle}>{title}</Text>
        <Text style={styles.optSub}>{sub}</Text>
      </View>
      <Ionicons name={on ? 'checkmark-circle' : 'ellipse-outline'} size={20} color={on ? C.accent : C.border} />
    </TouchableOpacity>
  );

  /** A labelled row of single-choice buttons; value -1 = not answered yet. */
  const choiceRow = (label: string, q: string, options: string[], value: number, onChange: (i: number) => void, hint?: string) => (
    <View key={q}>
      {qLabel(label, q)}
      <View style={styles.seg}>
        {options.map((o, i) => (
          <TouchableOpacity key={o} onPress={() => { Haptics.selectionAsync().catch(() => {}); onChange(i); }} activeOpacity={0.85}
            style={[styles.segBtn, value === i && styles.chipOn, isMissing(q) && value < 0 && { borderColor: C.orange + '88' }]}>
            <Text style={[styles.segTxt, value === i && { color: C.accent }]}>{o}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {!!hint && <Text style={styles.lastTime}>{hint}</Text>}
    </View>
  );
  const yesNo = (label: string, q: string, value: boolean | undefined | null, onChange: (v: boolean) => void, hint?: string) =>
    choiceRow(label, q, ['Yes', 'No'], value === true ? 0 : value === false ? 1 : -1, i => onChange(i === 0), hint);

  const has = (id: EquipmentId) => items.includes(id);
  const followUps = place === 'home' ? [
    has('dumbbells') && choiceRow('Heaviest dumbbell you have', 'dumbbellMax', kg(DUMBBELL_KG),
      home.dumbbellMax === undefined ? -1 : DUMBBELL_KG.indexOf(home.dumbbellMax),
      i => setHome(h => ({ ...h, dumbbellMax: DUMBBELL_KG[i] }))),
    has('kettlebell') && choiceRow('How many kettlebells?', 'kettlebells', ['1', '2 or more'],
      home.kettlebells === undefined ? -1 : home.kettlebells - 1, i => setHome(h => ({ ...h, kettlebells: (i + 1) as 1 | 2 }))),
    has('kettlebell') && choiceRow('Heaviest kettlebell', 'kettlebellMax', kg(KETTLEBELL_KG),
      home.kettlebellMax === undefined ? -1 : KETTLEBELL_KG.indexOf(home.kettlebellMax),
      i => setHome(h => ({ ...h, kettlebellMax: KETTLEBELL_KG[i] }))),
    has('barbell') && yesNo('Squat rack or stands?', 'rack', home.rack, v => setHome(h => ({ ...h, rack: v }))),
    has('barbell') && choiceRow('Plates in total', 'plates', ['≤20 kg', '≤50 kg', '≤100 kg', '100+ kg'],
      home.plates === undefined ? -1 : PLATES_KG.indexOf(home.plates), i => setHome(h => ({ ...h, plates: PLATES_KG[i] }))),
    has('barbell') && yesNo('EZ curl bar too?', 'ezBar', home.ezBar, v => setHome(h => ({ ...h, ezBar: v }))),
    has('bench') && choiceRow('Bench type', 'adjustable', ['Flat', 'Adjustable'],
      home.adjustable === undefined ? -1 : home.adjustable ? 1 : 0, i => setHome(h => ({ ...h, adjustable: i === 1 }))),
  ].filter(Boolean) : [];

  const equipCard = (id: EquipmentId) => {
    const on = has(id);
    const info = EQUIPMENT_INFO[id];
    const photo = info ? findExercise(info.photo)?.images[0] : undefined;
    return (
      <TouchableOpacity key={id} onPress={() => toggleItem(id)} onLongPress={() => setPreview(id)} activeOpacity={0.85}
        style={[styles.eqCard, on && { borderColor: C.accent, backgroundColor: C.accent + '12' },
          isMissing('items') && { borderColor: C.orange + '66' }]}
        accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={EQUIPMENT_LABEL[id]}>
        <View style={styles.eqPhotoWrap}>
          {photo ? <Image source={photo} style={styles.eqPhoto} resizeMode="cover" />
            : <View style={[styles.eqPhoto, { alignItems: 'center', justifyContent: 'center' }]}><Ionicons name="barbell-outline" size={22} color={C.muted} /></View>}
          {on && <View style={[styles.eqShade, { backgroundColor: C.accent + '33' }]} />}
          <View style={[styles.eqCheck, on ? { backgroundColor: C.accent, borderColor: C.accent } : { backgroundColor: 'rgba(0,0,0,0.35)', borderColor: '#ffffffAA' }]}>
            {on && <Ionicons name="checkmark" size={12} color="#fff" />}
          </View>
          {info && (
            <TouchableOpacity onPress={() => setPreview(id)} hitSlop={HIT} style={styles.eqInfo} accessibilityLabel={`What is ${EQUIPMENT_LABEL[id]}?`}>
              <Ionicons name="information" size={12} color="#fff" />
            </TouchableOpacity>
          )}
        </View>
        <Text style={[styles.eqLabel, on && { color: C.accent }]} numberOfLines={2}>{EQUIPMENT_LABEL[id]}</Text>
      </TouchableOpacity>
    );
  };

  const nextLabel = step === last ? (nextBlock ? 'Start this block' : 'Use this plan')
    : step === last - 1 ? (nextBlock ? 'Show new exercises' : 'Build my split') : 'Next';
  const lastStrength = prev?.strength;
  const previewInfo = preview ? EQUIPMENT_INFO[preview] : undefined;
  const previewPhotos = previewInfo ? findExercise(previewInfo.photo)?.images : undefined;
  // The photo fills the card: screen minus the overlay's and the card's padding
  const photoW = Math.min(300, winW - 48 - 36);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {/* The backdrop is its own layer, so it never competes with the sheet's scrolling */}
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.sheet, { paddingBottom: 24 + insets.bottom }]}>
          <View style={styles.handle} />
          <View style={styles.topRow}>
            <View style={styles.dots}>
              {flow.map((_, i) => (
                <View key={i} style={[styles.dot, i <= step && { backgroundColor: C.accent, width: i === step ? 18 : 6 }]} />
              ))}
            </View>
            <Text style={styles.stepCount}>{Math.min(step + 1, flow.length)} of {flow.length}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={HIT}>
              <Ionicons name="close" size={20} color={C.muted} />
            </TouchableOpacity>
          </View>

          {/* flexShrink lets the questions scroll inside the sheet instead of pushing Next off screen */}
          <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false} style={{ flexGrow: 0, flexShrink: 1 }}
            contentContainerStyle={{ paddingBottom: 12 }} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
            {key === 'you' && (
              <>
                <Text style={styles.q}>About you</Text>
                <Text style={styles.qSub}>Three quick taps. They set your exercises, sets, reps and starting weights.</Text>
                {qLabel('Your experience', 'level')}
                {LEVELS.map(l => option(l.key, level === l.key, () => setLevel(l.key), l.icon, l.title, l.sub, 'level'))}
                <View style={{ height: 6 }} />
                {qLabel('Your main goal', 'goal')}
                {GOALS.map(g => option(g.key, goal === g.key, () => setGoal(g.key), g.icon, g.title, g.sub, 'goal'))}
                <View style={{ height: 6 }} />
                {choiceRow('Sex (only used for starting weights)', 'sex', SEXES.map(s => s.title),
                  SEXES.findIndex(s => s.key === sex), i => setSex(SEXES[i].key))}
              </>
            )}

            {key === 'schedule' && (
              <>
                <Text style={styles.q}>Your week</Text>
                <Text style={styles.qSub}>Pick what you can stick to. Consistency beats everything.</Text>
                {qLabel('Days per week', 'days')}
                <View style={styles.grid}>
                  {DAYS.map(d => (
                    <TouchableOpacity key={d} onPress={() => chooseDays(d)} activeOpacity={0.85}
                      style={[styles.bigChip, days === d && { borderColor: C.accent, backgroundColor: C.accent + '14' },
                        isMissing('days') && { borderColor: C.orange + '88' }]}>
                      <Text style={[styles.bigChipNum, days === d && { color: C.accent }]}>{d}</Text>
                      <Text style={styles.bigChipUnit}>days</Text>
                      {level && RECOMMENDED_DAYS[level] === d && <View style={styles.recDot} />}
                    </TouchableOpacity>
                  ))}
                </View>
                {level && (
                  <Text style={styles.hintSmall}>
                    <Text style={{ color: C.green }}>●</Text> Recommended for {LEVELS.find(l => l.key === level)!.title.toLowerCase()}s: {RECOMMENDED_DAYS[level]} days
                  </Text>
                )}

                <View style={{ height: 16 }} />
                {qLabel('Time per workout', 'minutes')}
                <View style={styles.grid}>
                  {MINUTES.map(m => (
                    <TouchableOpacity key={m} onPress={() => setMinutes(m)} activeOpacity={0.85}
                      style={[styles.bigChip, minutes === m && { borderColor: C.accent, backgroundColor: C.accent + '14' },
                        isMissing('minutes') && { borderColor: C.orange + '88' }]}>
                      <Text style={[styles.bigChipNum, minutes === m && { color: C.accent }]}>{m}</Text>
                      <Text style={styles.bigChipUnit}>min</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {minutes && level && (
                  <Text style={styles.hintSmall}>≈ {exercisesPerSession(level, minutes, goal ?? 'muscle')} exercises per session, warm-up included</Text>
                )}

                {days && (
                  <>
                    <View style={{ height: 16 }} />
                    {qLabel(`Rest days · pick ${needRest}`, 'rest')}
                    <Text style={styles.restHelp}>We spread them out for you. Tap a day to switch it.</Text>
                    <View style={styles.week}>
                      {WEEK_ORDER.map(d => {
                        const rest = restDays.includes(d);
                        return (
                          <TouchableOpacity key={d} onPress={() => toggleRest(d)} activeOpacity={0.8} style={styles.weekCol}>
                            <View style={[styles.weekDay, rest ? { backgroundColor: C.border } : { backgroundColor: C.accent }]}>
                              <Text style={[styles.weekLetter, { color: rest ? C.muted : '#fff' }]}>{LETTERS[d]}</Text>
                            </View>
                            <Ionicons name={rest ? 'moon-outline' : 'barbell-outline'} size={14} color={rest ? C.muted : C.accent} />
                            <Text style={[styles.weekLbl, { color: rest ? C.muted : C.accent }]}>{rest ? 'Rest' : 'Train'}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                    <Text style={[styles.hintSmall, !restOk && { color: C.orange }]}>
                      {restOk
                        ? `${days} training days, ${needRest} rest ${needRest === 1 ? 'day' : 'days'}`
                        : `${restDays.length} of ${needRest} rest days picked`}
                    </Text>
                  </>
                )}
              </>
            )}

            {key === 'place' && (
              <>
                <Text style={styles.q}>Where do you work out?</Text>
                <Text style={styles.qSub}>Your plan only uses exercises you can do there.</Text>
                {PLACES.map(p => option(p.key, place === p.key, () => choosePlace(p.key), p.icon, p.title, p.sub, 'place'))}
                {place === 'bodyweight' && (
                  <Text style={styles.hint}>{available} exercises need no equipment</Text>
                )}
              </>
            )}

            {key === 'equipment' && (
              <>
                <Text style={styles.q}>What equipment do you have?</Text>
                <Text style={styles.qSub}>
                  {place === 'gym' ? 'Tick everything your gym has.' : 'Tick what you have at home.'} Not sure what
                  something is? Tap <Ionicons name="information-circle" size={13} color={C.accent} /> for a photo.
                </Text>
                {place === 'gym' && (
                  <View style={styles.bulkRow}>
                    <TouchableOpacity onPress={selectAllGym} hitSlop={HIT} style={styles.bulkBtn}>
                      <Ionicons name="checkmark-done-outline" size={14} color={C.accent} />
                      <Text style={styles.linkTxt}>Select all</Text>
                    </TouchableOpacity>
                    {items.length > 0 && (
                      <TouchableOpacity onPress={clearItems} hitSlop={HIT} style={styles.bulkBtn}>
                        <Ionicons name="close-circle-outline" size={14} color={C.muted} />
                        <Text style={[styles.linkTxt, { color: C.muted }]}>Clear</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
                {(place === 'gym' ? GYM_GROUPS : HOME_GROUPS).map((g, gi) => (
                  <View key={g.title} style={styles.group}>
                    <Text style={styles.groupTitle}>{g.title}</Text>
                    <View style={styles.eqGrid}>{g.items.map(equipCard)}</View>
                    {/* Home weights: how heavy, and what goes with them */}
                    {gi === 0 && followUps.length > 0 && <View style={styles.followBox}>{followUps}</View>}
                  </View>
                ))}
                {place === 'home' && (
                  <>
                    <TouchableOpacity onPress={() => setShowMore(m => !m)} style={styles.moreBtn} hitSlop={HIT}>
                      <Text style={styles.moreTxt}>{showMore ? 'Fewer options' : 'Gym machines at home?'}</Text>
                      <Ionicons name={showMore ? 'chevron-up' : 'chevron-down'} size={14} color={C.accent} />
                    </TouchableOpacity>
                    {showMore && <View style={[styles.eqGrid, { marginTop: 10 }]}>{MORE_ITEMS.map(equipCard)}</View>}
                  </>
                )}
                <Text style={[styles.hint, isMissing('items') && { color: C.orange }]}>
                  {items.length
                    ? `${available} exercises fit your equipment`
                    : isMissing('items') ? 'Tick at least one item, or go back and pick "No equipment"'
                      : 'Nothing ticked yet'}
                </Text>
              </>
            )}

            {key === 'strength' && (
              <>
                <Text style={styles.q}>{nextBlock ? 'Quick re-test' : 'Quick strength check'}</Text>
                <Text style={styles.qSub}>
                  {nextBlock
                    ? 'Got stronger? Your answers pick harder versions and new starting weights.'
                    : 'Picks the right version of each exercise and your starting weights. A rough guess is fine.'}
                </Text>
                <View style={{ gap: 14 }}>
                  {choiceRow('Push-ups in a row', 'push', PUSH_OPTIONS, strength.push ?? -1, v => pickStrength('push', v),
                    lastStrength && nextBlock ? `Last time: ${PUSH_OPTIONS[lastStrength.push]}` : undefined)}
                  {hasBar && choiceRow('Pull-ups in a row', 'pull', PULL_OPTIONS, strength.pull ?? -1, v => pickStrength('pull', v),
                    lastStrength && nextBlock ? `Last time: ${PULL_OPTIONS[lastStrength.pull]}` : undefined)}
                  {choiceRow('Bodyweight squats in a row', 'squat', SQUAT_OPTIONS, strength.squat ?? -1, v => pickStrength('squat', v),
                    lastStrength && nextBlock ? `Last time: ${SQUAT_OPTIONS[lastStrength.squat]}` : undefined)}
                  {askBarbell && yesNo('Done barbell squats, bench or deadlifts before?', 'barbellExp', barbellExp, setBarbellExp,
                    barbellExp === false ? 'No problem: you start with simpler versions and learn them from block 2.' : undefined)}
                  {askKettlebell && yesNo('Used kettlebells before (swings, cleans)?', 'kbExp', kbExp, setKbExp)}
                  <View>
                    {qLabel('Your bodyweight', 'bodyweight')}
                    <View style={styles.bwRow}>
                      <TextInput
                        style={[styles.bwInput, isMissing('bodyweight') && { borderColor: C.orange }]}
                        value={bodyweight}
                        onChangeText={setBodyweight}
                        keyboardType="decimal-pad"
                        placeholder="e.g. 72"
                        placeholderTextColor={C.muted}
                        maxLength={5}
                      />
                      <Text style={styles.bwUnit}>kg</Text>
                      {lastWeight !== undefined && parseBodyweight(bodyweight) !== lastWeight && (
                        <TouchableOpacity onPress={() => setBodyweight(String(lastWeight))} activeOpacity={0.8} style={styles.bwChip}>
                          <Ionicons name="scale-outline" size={13} color={C.accent} />
                          <Text style={styles.bwChipTxt}>Use {lastWeight} kg</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                    <Text style={[styles.bwHint, bodyweight !== '' && !bodyweightKg && { color: C.orange }]}>
                      {bodyweight !== '' && !bodyweightKg ? 'Enter a weight between 30 and 250 kg.' : 'Used to work out your starting weights.'}
                    </Text>
                  </View>
                </View>
              </>
            )}

            {key === 'plan' && plan && (
              <>
                <Text style={styles.kicker}>{nextBlock ? `Your split · block ${block + 1}` : 'Your split'}</Text>
                <Text style={styles.planName}>{plan.name}</Text>
                <Text style={styles.qSub}>{plan.summary} Picked from {plan.available} exercises that fit your equipment.</Text>

                {/* The week at a glance; tapping a training day opens it below */}
                <View style={styles.strip}>
                  <View style={styles.week}>
                    {plan.days.map(d => (
                      <TouchableOpacity key={d.weekday} disabled={d.rest} onPress={() => setOpenDays(s => new Set(s).add(d.weekday))}
                        activeOpacity={0.8} style={styles.weekCol}>
                        <View style={[styles.miniDay, d.rest ? { backgroundColor: C.border } : { backgroundColor: C.accent, borderColor: C.accent }]}>
                          <Text style={[styles.miniLetter, { color: d.rest ? C.muted : '#fff' }]}>{LETTERS[d.weekday]}</Text>
                        </View>
                        <Ionicons name={d.rest ? 'moon-outline' : 'barbell-outline'} size={12} color={d.rest ? C.muted : C.accent} />
                      </TouchableOpacity>
                    ))}
                  </View>
                  <View style={[styles.legend, { marginTop: 10, marginBottom: 0 }]}>
                    <View style={styles.legendItem}>
                      <View style={[styles.legendDot, { backgroundColor: C.accent }]} />
                      <Text style={styles.legendTxt}>Training</Text>
                    </View>
                    <View style={styles.legendItem}>
                      <View style={[styles.legendDot, { backgroundColor: C.border }]} />
                      <Text style={styles.legendTxt}>Rest</Text>
                    </View>
                  </View>
                </View>

                <View style={styles.rx}>
                  <Ionicons name="repeat-outline" size={16} color={C.accent} />
                  <Text style={styles.rxTxt}>{plan.prescription}</Text>
                </View>
                <View style={styles.rx}>
                  <Ionicons name="barbell-outline" size={16} color={C.accent} />
                  <Text style={styles.rxTxt}>
                    Starting weights come from your bodyweight, experience, strength check and goal, set a little
                    light so the first session ends 2–3 reps short of failure. Barbell weights include the 20 kg bar.
                    If the top of the rep range feels easy, add weight next session.
                  </Text>
                </View>
                {plan.laterSkills.length > 0 && (
                  <View style={styles.note}>
                    <Ionicons name="time-outline" size={15} color={C.accent} />
                    <Text style={styles.noteTxt}>
                      {listText(plan.laterSkills.map(s => SKILL_LABEL[s]))} {plan.laterSkills.length === 1 ? 'comes' : 'come'} in
                      from block 2, once you've built a base.
                    </Text>
                  </View>
                )}
                {plan.gaps.map(g => (
                  <View key={g.muscle} style={styles.note}>
                    <Ionicons name="alert-circle-outline" size={15} color={C.orange} />
                    <Text style={styles.noteTxt}>
                      No {g.muscle.toLowerCase()} exercises fit your equipment yet
                      {g.suggestion ? ` — ${itemPhrase(g.suggestion)} would add them.` : '.'}
                    </Text>
                  </View>
                ))}
                {nextBlock && (
                  <View style={styles.note}>
                    <Ionicons name="sparkles-outline" size={15} color={C.accent} />
                    <Text style={styles.noteTxt}>
                      {block % 2 === 1
                        ? 'New accessory exercises this block. Main lifts you already train stay so you can keep adding weight; they change next block.'
                        : 'Main lifts and accessories both change this block.'}
                    </Text>
                  </View>
                )}
                <View style={{ marginTop: 4, marginBottom: 18 }}>
                  {choiceRow('New exercises every', 'rotate', ROTATE_OPTIONS.map(w => `${w} week${w === 1 ? '' : 's'}`),
                    ROTATE_OPTIONS.indexOf(rotateWeeks), i => setRotateWeeks(ROTATE_OPTIONS[i]))}
                </View>

                <Text style={styles.groupTitle}>Your week · tap a day to see its exercises</Text>
                {plan.days.map(d => {
                  if (d.rest) {
                    return (
                      <View key={d.weekday} style={[styles.dayCard, styles.restCard]}>
                        <View style={[styles.dayBadge, { backgroundColor: C.border }]}>
                          <Text style={[styles.dayBadgeTxt, { color: C.muted }]}>{DAY_NAMES[d.weekday].slice(0, 3)}</Text>
                        </View>
                        <Text style={[styles.dayTitle, { color: C.muted, flex: 1 }]}>Rest day</Text>
                        <Ionicons name="moon-outline" size={16} color={C.muted} />
                      </View>
                    );
                  }
                  const open = openDays.has(d.weekday);
                  const picks = d.exercises.map((_, i) => shown(d, i));
                  const muscles = [...new Set(picks.map(e => e.muscle))];
                  return (
                    <View key={d.weekday} style={[styles.dayCard, open && { borderColor: C.accent + '66' }]}>
                      <TouchableOpacity onPress={() => toggleOpenDay(d.weekday)} activeOpacity={0.75} style={styles.dayHead}>
                        <View style={[styles.dayBadge, { backgroundColor: C.accent + '1A' }]}>
                          <Text style={[styles.dayBadgeTxt, { color: C.accent }]}>{DAY_NAMES[d.weekday].slice(0, 3)}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.dayTitle}>{d.title}</Text>
                          <Text style={styles.daySub} numberOfLines={1}>
                            {picks.length} exercises · {muscles.slice(0, 3).join(', ')}{muscles.length > 3 ? ` +${muscles.length - 3}` : ''}
                          </Text>
                        </View>
                        <View style={styles.chevron}>
                          <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={C.accent} />
                        </View>
                      </TouchableOpacity>
                      {open && (
                        <View style={styles.exList}>
                          {picks.map((e, i) => {
                            const color = C.mg[e.muscle] ?? C.accent;
                            return (
                              <View key={`${d.weekday}:${i}`} style={[styles.exRow, i > 0 && styles.exRowDivider]}>
                                <View style={[styles.exIndex, { backgroundColor: color + '22' }]}>
                                  <Text style={[styles.exIndexTxt, { color }]}>{i + 1}</Text>
                                </View>
                                <View style={{ flex: 1 }}>
                                  <Text style={styles.exName} numberOfLines={2}>{e.name}</Text>
                                  <View style={styles.tags}>
                                    <View style={styles.tag}>
                                      <Ionicons name="repeat-outline" size={11} color={C.textSub} />
                                      <Text style={styles.tagTxt}>{setsRepsText(e)}</Text>
                                    </View>
                                    <View style={[styles.tag, { backgroundColor: C.accent + '14', borderColor: C.accent + '40' }]}>
                                      <Ionicons name={e.kg !== undefined ? 'barbell-outline' : 'body-outline'} size={11} color={C.accent} />
                                      <Text style={[styles.tagTxt, { color: C.accent }]}>{e.load}</Text>
                                    </View>
                                  </View>
                                </View>
                                {d.exercises[i].alternatives.length > 0 && (
                                  <TouchableOpacity onPress={() => swap(d, i)} hitSlop={HIT} style={styles.swapBtn}>
                                    <Ionicons name="swap-horizontal" size={16} color={C.accent} />
                                  </TouchableOpacity>
                                )}
                                <ExerciseGuideButton name={e.name} color={color} />
                              </View>
                            );
                          })}
                        </View>
                      )}
                    </View>
                  );
                })}
                <Text style={styles.hint}>
                  <Ionicons name="swap-horizontal" size={12} color={C.muted} /> swaps an exercise for another that fits ·
                  <Ionicons name="play" size={11} color={C.muted} /> shows how to do it
                </Text>
              </>
            )}
          </ScrollView>

          {tried && missing.length > 0 && (
            <View style={styles.missingBar}>
              <Ionicons name="alert-circle" size={15} color={C.orange} />
              <Text style={styles.missingTxt}>
                {missing.length === 1 ? 'One question still needs an answer' : `${missing.length} questions still need an answer`}
              </Text>
            </View>
          )}
          <View style={styles.footer}>
            {step > 0 && (
              <TouchableOpacity onPress={goBack} style={styles.backBtn} activeOpacity={0.8}>
                <Text style={styles.backTxt}>Back</Text>
              </TouchableOpacity>
            )}
            <Animated.View style={{ flex: 1, transform: [{ translateX: shake }] }}>
              <TouchableOpacity onPress={goNext} activeOpacity={0.85}
                style={[styles.nextBtn, missing.length > 0 && { opacity: 0.55 }]}>
                <Text style={styles.nextTxt}>{nextLabel}</Text>
              </TouchableOpacity>
            </Animated.View>
          </View>
        </View>
      </View>

      {/* What a piece of equipment looks like */}
      <Modal visible={!!preview} transparent animationType="fade" onRequestClose={() => setPreview(null)}>
        <TouchableOpacity style={styles.previewOverlay} activeOpacity={1} onPress={() => setPreview(null)}>
          {preview && previewInfo && (
            <TouchableOpacity activeOpacity={1} onPress={e => e.stopPropagation()} style={styles.previewCard}>
              {previewPhotos && previewPhotos.length > 0 && (
                <View style={[styles.previewPhoto, { width: photoW, height: Math.round(photoW * 2 / 3) }]}>
                  <LoopingThumb images={previewPhotos} width={photoW} height={Math.round(photoW * 2 / 3)} />
                </View>
              )}
              <Text style={styles.previewTitle}>{EQUIPMENT_LABEL[preview]}</Text>
              <Text style={styles.previewAbout}>{previewInfo.about}</Text>
              <TouchableOpacity onPress={() => { toggleItem(preview); setPreview(null); }} activeOpacity={0.85}
                style={[styles.previewBtn, has(preview) && { backgroundColor: C.bg, borderWidth: 1, borderColor: C.border }]}>
                <Ionicons name={has(preview) ? 'close-circle-outline' : 'checkmark-circle'} size={18} color={has(preview) ? C.muted : '#fff'} />
                <Text style={[styles.previewBtnTxt, has(preview) && { color: C.muted }]}>{has(preview) ? "I don't have it" : 'I have this'}</Text>
              </TouchableOpacity>
              <Text style={styles.previewCredit}>Photo: free-exercise-db (public domain)</Text>
            </TouchableOpacity>
          )}
        </TouchableOpacity>
      </Modal>
    </Modal>
  );
}

/** Planner header card: the current split at a glance, or a prompt to build one. */
export function SplitCard({ config, plans, onOpen, onNewBlock }: {
  config: SplitConfig | null;
  plans: { day_of_week: string; muscle_groups: string }[];
  onOpen: () => void;
  onNewBlock: () => void;
}) {
  const { C } = useTheme();
  const styles = makeStyles(C);
  // Re-render when the app comes back to the foreground, so the block week, the
  // "Time for new exercises" banner and today's highlight stay current across days
  const [, setResumedAt] = useState(0);
  useEffect(() => {
    const sub = AppState.addEventListener('change', s => { if (s === 'active') setResumedAt(Date.now()); });
    return () => sub.remove();
  }, []);
  const todayIdx = new Date().getDay();

  if (!config) {
    return (
      <TouchableOpacity onPress={onOpen} activeOpacity={0.85} style={[styles.card, { flexDirection: 'row', alignItems: 'center' }]}>
        <View style={[styles.optIcon, { backgroundColor: C.accent + '1A', width: 48, height: 48, borderRadius: 15 }]}>
          <SplitBuildIcon size={30} />
        </View>
        <View style={{ flex: 1, marginHorizontal: 12 }}>
          <Text style={styles.optTitle}>Build your split</Text>
          <Text style={styles.optSub}>A few quick questions → a plan built around you and your equipment</Text>
        </View>
        <View style={styles.startPill}><Text style={styles.startTxt}>Start</Text></View>
      </TouchableOpacity>
    );
  }

  const levelName = LEVELS.find(l => l.key === config.level)?.title ?? '';
  const goalName = GOALS.find(g => g.key === config.goal)?.title;
  const isRest = (d: number) => (plans.find(p => p.day_of_week === DAY_NAMES[d])?.muscle_groups ?? 'Rest') === 'Rest';
  const weeks = config.rotateWeeks ?? DEFAULT_ROTATE_WEEKS;
  const progress = blockProgress(config.blockStart, weeks);
  const blockNo = (config.block ?? 0) + 1;

  return (
    <View style={styles.card}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        <View style={[styles.optIcon, { backgroundColor: C.accent + '1A', width: 44, height: 44, borderRadius: 14, marginRight: 12 }]}>
          <SplitBuildIcon size={26} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.kicker}>Your split</Text>
          <Text style={[styles.planName, { fontSize: 20 }]}>{config.name}</Text>
          <Text style={styles.optSub}>
            {levelName}{goalName ? ` · ${goalName}` : ''} · {config.daysPerWeek} days · {config.minutes} min
            {config.equipment ? ` · ${PLACE_LABEL[config.equipment.place]}` : ''}
          </Text>
        </View>
        <TouchableOpacity onPress={onOpen} activeOpacity={0.8} style={styles.changePill}>
          <Ionicons name="options-outline" size={14} color={C.accent} />
          <Text style={styles.changeTxt}>Change</Text>
        </TouchableOpacity>
      </View>
      {/* Splits saved before blocks existed have no start date: still offer "New exercises" */}
      {!progress?.due && (
        <View style={styles.blockRow}>
          <Text style={styles.blockTxt}>
            Block {blockNo}{progress ? ` · week ${progress.week} of ${weeks}` : ''}
          </Text>
          <TouchableOpacity onPress={onNewBlock} hitSlop={HIT}>
            <Text style={styles.linkTxt}>New exercises</Text>
          </TouchableOpacity>
        </View>
      )}
      {progress?.due && (
        <TouchableOpacity onPress={onNewBlock} activeOpacity={0.85} style={styles.dueBanner}>
          <SplitBuildIcon size={24} />
          <View style={{ flex: 1 }}>
            <Text style={styles.dueTitle}>Time for new exercises</Text>
            <Text style={styles.optSub}>Block {blockNo} is done. A quick re-test sets up the next one.</Text>
          </View>
          <View style={styles.startPill}><Text style={styles.startTxt}>Start</Text></View>
        </TouchableOpacity>
      )}
      <View style={[styles.week, { marginTop: 14 }]}>
        {WEEK_ORDER.map(d => {
          const rest = isRest(d);
          const today = d === todayIdx;
          return (
            <View key={d} style={styles.weekCol}>
              <View style={[styles.miniDay, rest ? { backgroundColor: C.bg } : { backgroundColor: C.accent + '26' },
                today && { borderColor: C.accent, borderWidth: 2 }]}>
                <Text style={[styles.miniLetter, { color: rest ? C.muted : C.accent }]}>{LETTERS[d]}</Text>
              </View>
              <View style={[styles.miniDot, { backgroundColor: rest ? 'transparent' : C.accent }]} />
            </View>
          );
        })}
      </View>
    </View>
  );
}

function makeStyles(C: any) {
  return StyleSheet.create({
    card:      { backgroundColor: C.card, borderRadius: 20, padding: 16, borderWidth: 1, borderColor: C.border, marginBottom: 6 },
    startPill: { backgroundColor: C.accent, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 9 },
    startTxt:  { color: '#fff', fontWeight: '800', fontSize: 13 },
    changePill:{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, backgroundColor: C.accent + '14', borderWidth: 1, borderColor: C.accent + '40' },
    changeTxt: { fontSize: 12, fontWeight: '800', color: C.accent },
    blockRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
    blockTxt:  { fontSize: 12, fontWeight: '700', color: C.muted },
    linkTxt:   { fontSize: 12, fontWeight: '800', color: C.accent },
    dueBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12, padding: 12, borderRadius: 16, backgroundColor: C.accent + '14', borderWidth: 1, borderColor: C.accent + '40' },
    dueTitle:  { fontSize: 14, fontWeight: '800', color: C.text },
    miniDay:   { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border },
    miniLetter:{ fontSize: 13, fontWeight: '800' },
    miniDot:   { width: 4, height: 4, borderRadius: 2 },
    overlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
    sheet:     { backgroundColor: C.card, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: 24, maxHeight: '92%', borderWidth: 1, borderColor: C.border },
    handle:    { width: 40, height: 5, backgroundColor: C.border, borderRadius: 3, alignSelf: 'center', marginBottom: 14 },
    topRow:    { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 18 },
    dots:      { flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center' },
    dot:       { width: 6, height: 6, borderRadius: 3, backgroundColor: C.border },
    stepCount: { fontSize: 11, fontWeight: '800', color: C.muted },
    q:         { fontSize: 22, fontWeight: '800', color: C.text },
    qSub:      { fontSize: 13, color: C.muted, fontWeight: '600', marginTop: 4, marginBottom: 16, lineHeight: 19 },
    qLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
    required:  { fontSize: 11, fontWeight: '800', color: C.orange },
    option:    { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 16, borderWidth: 1, borderColor: C.border, backgroundColor: C.bg, marginBottom: 8 },
    optIcon:   { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    optTitle:  { fontSize: 15, fontWeight: '800', color: C.text },
    optSub:    { fontSize: 12, color: C.muted, fontWeight: '600', marginTop: 2 },
    chips:     { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chipOn:    { borderColor: C.accent, backgroundColor: C.accent + '14' },
    followBox: { marginTop: 12, padding: 12, borderRadius: 16, borderWidth: 1, borderColor: C.border, backgroundColor: C.bg, gap: 12 },
    rowLbl:    { fontSize: 12, fontWeight: '800', color: C.muted, flex: 1 },
    seg:       { flexDirection: 'row', gap: 6 },
    segBtn:    { flex: 1, paddingVertical: 9, borderRadius: 10, borderWidth: 1, borderColor: C.border, backgroundColor: C.card, alignItems: 'center' },
    segTxt:    { fontSize: 12, fontWeight: '800', color: C.textSub },
    lastTime:  { fontSize: 11, fontWeight: '600', color: C.muted, marginTop: 5 },
    moreBtn:   { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 14, alignSelf: 'flex-start' },
    moreTxt:   { fontSize: 13, fontWeight: '800', color: C.accent },
    note:      { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 10 },
    noteTxt:   { flex: 1, fontSize: 12, fontWeight: '600', color: C.textSub, lineHeight: 17 },
    swapBtn:   { marginLeft: 8, padding: 2 },
    grid:      { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    bigChip:   { width: 58, height: 62, borderRadius: 16, borderWidth: 1, borderColor: C.border, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' },
    bigChipNum:{ fontSize: 22, fontWeight: '800', color: C.text },
    bigChipUnit: { fontSize: 11, fontWeight: '700', color: C.muted },
    recDot:    { position: 'absolute', top: 7, right: 7, width: 7, height: 7, borderRadius: 4, backgroundColor: C.green },
    hint:      { fontSize: 12, color: C.muted, fontWeight: '700', marginTop: 14 },
    hintSmall: { fontSize: 12, color: C.muted, fontWeight: '700', marginTop: 8 },
    restHelp:  { fontSize: 12, color: C.muted, fontWeight: '600', marginBottom: 10 },
    week:      { flexDirection: 'row', justifyContent: 'space-between' },
    weekCol:   { alignItems: 'center', gap: 6 },
    weekDay:   { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
    weekLetter:{ fontSize: 14, fontWeight: '800' },
    weekLbl:   { fontSize: 10, fontWeight: '800' },
    kicker:    { fontSize: 11, fontWeight: '800', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.7 },
    planName:  { fontSize: 26, fontWeight: '800', color: C.accent, marginTop: 2 },
    rx:        { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.bg, borderRadius: 12, padding: 10, marginBottom: 12, borderWidth: 1, borderColor: C.border },
    rxTxt:     { flex: 1, fontSize: 12, fontWeight: '700', color: C.textSub },
    // Equipment step
    bulkRow:   { flexDirection: 'row', gap: 18, marginBottom: 4 },
    bulkBtn:   { flexDirection: 'row', alignItems: 'center', gap: 4 },
    group:     { marginTop: 14 },
    groupTitle:{ fontSize: 12, fontWeight: '800', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 },
    eqGrid:    { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    eqCard:    { width: '31.5%', borderRadius: 14, borderWidth: 1.5, borderColor: C.border, backgroundColor: C.bg, overflow: 'hidden' },
    eqPhotoWrap: { width: '100%', aspectRatio: 1.45 },
    eqPhoto:   { width: '100%', height: '100%', backgroundColor: C.border + '55' },
    eqShade:   { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
    eqCheck:   { position: 'absolute', top: 5, right: 5, width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
    eqInfo:    { position: 'absolute', top: 5, left: 5, width: 20, height: 20, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
    eqLabel:   { fontSize: 11, fontWeight: '800', color: C.textSub, textAlign: 'center', paddingHorizontal: 4, paddingVertical: 6, minHeight: 34 },
    // Strength step
    bwRow:     { flexDirection: 'row', alignItems: 'center', gap: 8 },
    bwInput:   { width: 96, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10, borderWidth: 1, borderColor: C.border, backgroundColor: C.card, color: C.text, fontSize: 15, fontWeight: '800' },
    bwUnit:    { fontSize: 13, fontWeight: '800', color: C.muted },
    bwChip:    { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 'auto', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 12, backgroundColor: C.accent + '14', borderWidth: 1, borderColor: C.accent + '40' },
    bwChipTxt: { fontSize: 12, fontWeight: '800', color: C.accent },
    bwHint:    { fontSize: 11, fontWeight: '600', color: C.muted, marginTop: 6 },
    // Rest days and the plan's week strip
    legend:    { flexDirection: 'row', justifyContent: 'center', gap: 18, marginBottom: 14 },
    legendItem:{ flexDirection: 'row', alignItems: 'center', gap: 6 },
    legendDot: { width: 12, height: 12, borderRadius: 6 },
    legendTxt: { fontSize: 12, fontWeight: '700', color: C.textSub },
    strip:     { backgroundColor: C.bg, borderRadius: 16, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: C.border },
    // Plan days
    dayCard:   { backgroundColor: C.bg, borderRadius: 16, borderWidth: 1, borderColor: C.border, marginBottom: 8, overflow: 'hidden' },
    restCard:  { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 8, opacity: 0.7 },
    dayHead:   { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
    dayBadge:  { width: 44, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    dayBadgeTxt: { fontSize: 12, fontWeight: '800' },
    dayTitle:  { fontSize: 15, fontWeight: '800', color: C.text },
    daySub:    { fontSize: 12, fontWeight: '600', color: C.muted, marginTop: 2 },
    chevron:   { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: C.accent + '14' },
    exList:    { borderTopWidth: 1, borderTopColor: C.border, paddingHorizontal: 12 },
    exRow:     { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
    exRowDivider: { borderTopWidth: 1, borderTopColor: C.border + '99' },
    exIndex:   { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    exIndexTxt:{ fontSize: 11, fontWeight: '800' },
    exName:    { fontSize: 14, fontWeight: '700', color: C.text },
    tags:      { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 5 },
    tag:       { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1, borderColor: C.border, backgroundColor: C.card },
    tagTxt:    { fontSize: 11, fontWeight: '800', color: C.textSub },
    missingBar:{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, backgroundColor: C.orange + '18' },
    missingTxt:{ fontSize: 12, fontWeight: '800', color: C.orange },
    footer:    { flexDirection: 'row', gap: 10, marginTop: 12 },
    backBtn:   { paddingHorizontal: 20, paddingVertical: 14, borderRadius: 14, borderWidth: 1, borderColor: C.border },
    backTxt:   { fontSize: 15, fontWeight: '700', color: C.muted },
    nextBtn:   { backgroundColor: C.accent, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
    nextTxt:   { color: '#fff', fontWeight: '800', fontSize: 15 },
    // Equipment preview
    previewOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center', padding: 24 },
    previewCard:    { width: '100%', maxWidth: 340, backgroundColor: C.card, borderRadius: 24, padding: 18, alignItems: 'center', borderWidth: 1, borderColor: C.border },
    previewPhoto:   { borderRadius: 16, overflow: 'hidden', marginBottom: 14 },
    previewTitle:   { fontSize: 19, fontWeight: '800', color: C.text },
    previewAbout:   { fontSize: 13, fontWeight: '600', color: C.textSub, textAlign: 'center', marginTop: 6, lineHeight: 19 },
    previewBtn:     { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16, paddingVertical: 12, paddingHorizontal: 20, borderRadius: 14, backgroundColor: C.accent, alignSelf: 'stretch', justifyContent: 'center' },
    previewBtnTxt:  { fontSize: 14, fontWeight: '800', color: '#fff' },
    previewCredit:  { fontSize: 10, fontWeight: '600', color: C.muted, marginTop: 10 },
  });
}
