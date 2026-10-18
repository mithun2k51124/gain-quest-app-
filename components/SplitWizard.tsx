// components/SplitWizard.tsx — a few quick questions → a personalised weekly split.
// Asks experience, time, days and rest days, then where the user trains and what equipment they
// have, a quick strength check (with bodyweight, for starting weights) and which technique lifts
// they've done. Plans run in blocks of a few weeks; when a block ends, a short re-test builds the
// next block with fresh exercises.
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView, AppState, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { useCustomAlert } from '../contexts/AlertContext';
import { getSetting, setSetting, replaceWeeklyPlan, todayStr, getLatestWeight } from '../db/database';
import {
  generateSplit, defaultRestDays, exercisesPerSession, strengthDefaults, skillOptions, blockProgress,
  RECOMMENDED_DAYS, WEEK_ORDER, DAY_NAMES, PUSH_OPTIONS, PULL_OPTIONS, SQUAT_OPTIONS,
  ROTATE_OPTIONS, DEFAULT_ROTATE_WEEKS, DEFAULT_BODYWEIGHT_KG,
  Level, SplitAnswers, StrengthAnswers, PlannedDay, ExerciseChoice,
} from '../utils/splitGenerator';
import {
  EquipmentAnswers, EquipmentId, Place, EQUIPMENT_LABEL, MORE_ITEMS, GYM_GROUPS, HOME_GROUPS, GYM_ALL,
  DUMBBELL_KG, KETTLEBELL_KG, PLATES_KG, ownedItems, countAvailable,
} from '../constants/equipment';
import { SkillKey, SKILL_LABEL } from '../constants/exercisePools';
import { ExerciseGuideButton } from './ExerciseGuide';
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

type StepKey = 'level' | 'place' | 'equipment' | 'strength' | 'skills' | 'minutes' | 'days' | 'rest' | 'plan';
type Icon = keyof typeof Ionicons.glyphMap;

const SETTING_KEY = 'split_config';
const HIT = { top: 10, bottom: 10, left: 10, right: 10 };
const LEVELS: { key: Level; title: string; sub: string; icon: string }[] = [
  { key: 'beginner', title: 'Beginner', sub: 'New to lifting or under 1 year', icon: 'leaf-outline' },
  { key: 'intermediate', title: 'Intermediate', sub: '1–3 years of consistent training', icon: 'trending-up-outline' },
  { key: 'advanced', title: 'Pro', sub: '3+ years, comfortable with heavy lifts', icon: 'flame-outline' },
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
// At home, unticking an item also clears its follow-up answers
const DEPENDENTS: Partial<Record<EquipmentId, EquipmentId[]>> = {
  barbell: ['rack', 'ez_bar'], bench: ['adj_bench'], kettlebell: ['kettlebell_pair'],
};
const PLURAL = new Set<EquipmentId>(['dumbbells', 'bands', 'dip_bars', 'rings', 'machines', 'cardio']);
// Muscle-group chips in the planner use 'Upper Back'; the exercise library uses 'Back'
const toPlannerGroup = (m: string) => (m === 'Back' ? 'Upper Back' : m);
const kg = (list: number[]) => list.map((v, i) => `${v}${i === list.length - 1 ? '+' : ''} kg`);
/** A typed bodyweight in kg, or undefined if it isn't a believable number. */
const parseBodyweight = (s: string) => {
  const n = parseFloat(s.replace(',', '.'));
  return n >= 30 && n <= 250 ? n : undefined;
};
/** Starting value for the bodyweight box: the latest logged weight, else what's on file. */
function knownBodyweight(cfg: SplitConfig | null): string {
  let n: number | null | undefined = null;
  try { n = getLatestWeight(); } catch (e) { logError('splitBodyweight', e); }
  n = n || cfg?.bodyweightKg || parseFloat(getSetting('body_weight', '')) || undefined;
  return n ? String(Math.round(n * 10) / 10) : '';
}

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
  const [step, setStep] = useState(0);
  const [nextBlock, setNextBlock] = useState(false);
  const [level, setLevel] = useState<Level>('beginner');
  const [equipment, setEquipment] = useState<EquipmentAnswers>({ place: 'gym', items: [] });
  const [showMore, setShowMore] = useState(false);
  const [bodyweight, setBodyweight] = useState('');
  const [strength, setStrength] = useState<StrengthAnswers>(strengthDefaults('beginner'));
  const [strengthSet, setStrengthSet] = useState(false);
  const [skills, setSkills] = useState<SkillKey[]>([]);
  const [minutes, setMinutes] = useState(60);
  const [days, setDays] = useState(3);
  const [restDays, setRestDays] = useState<number[]>(defaultRestDays(3));
  const [rotateWeeks, setRotateWeeks] = useState(DEFAULT_ROTATE_WEEKS);
  const [block, setBlock] = useState(0);
  const [openDays, setOpenDays] = useState<Set<number>>(new Set());
  const [swaps, setSwaps] = useState<Record<string, number>>({});

  // Start from the current split's answers when changing it or starting its next block
  useEffect(() => {
    if (!visible) return;
    const cfg = getSplitConfig();
    const next = mode === 'next' && !!cfg?.equipment;
    const lvl = cfg?.level ?? level;
    setStep(0);
    setOpenDays(new Set());
    setShowMore(false);
    setNextBlock(next);
    setBlock(next ? (cfg?.block ?? 0) + 1 : 0);
    if (cfg) {
      setLevel(cfg.level); setMinutes(cfg.minutes); setDays(cfg.daysPerWeek); setRestDays(cfg.restDays);
      setRotateWeeks(cfg.rotateWeeks ?? DEFAULT_ROTATE_WEEKS);
      setSkills(cfg.skills ?? []);
    } else {
      // First-time setup: don't carry over answers from a wizard that was closed halfway
      setSkills([]);
      setRotateWeeks(DEFAULT_ROTATE_WEEKS);
    }
    // A new split starts with nothing ticked. Splits saved before the equipment questions meant a
    // full gym, so changing one starts from everything ticked.
    setEquipment(cfg ? cfg.equipment ?? { place: 'gym', items: [...GYM_ALL] } : { place: 'gym', items: [] });
    setStrength(cfg?.strength ?? strengthDefaults(lvl));
    setStrengthSet(!!cfg?.strength);
    setBodyweight(knownBodyweight(cfg));
  }, [visible]);

  const owned = useMemo(() => ownedItems(equipment), [equipment]);
  const hasBar = owned.has('pullup_bar');
  const available = useMemo(() => countAvailable(equipment), [equipment]);
  const skillOpts = useMemo(
    () => skillOptions({ level, minutes, daysPerWeek: days, restDays, equipment, strength }),
    [level, equipment, strength]
  );
  const flow: StepKey[] = nextBlock
    ? ['strength', 'plan']
    : [
      'level', 'minutes', 'days', 'rest', 'place',
      ...(equipment.place !== 'bodyweight' ? ['equipment' as const] : []),
      'strength',
      ...(skillOpts.length ? ['skills' as const] : []),
      'plan',
    ];
  const last = flow.length - 1;
  const key = flow[Math.min(step, last)];

  const needRest = 7 - days;
  const restOk = restDays.length === needRest;
  const bodyweightKg = parseBodyweight(bodyweight);
  const plan = useMemo(
    () => generateSplit({ level, minutes, daysPerWeek: days, restDays, equipment, strength, skills, block, bodyweightKg }),
    [level, minutes, days, restDays, equipment, strength, skills, block, bodyweightKg]
  );
  useEffect(() => setSwaps({}), [plan]);

  const chooseLevel = (l: Level) => {
    setLevel(l);
    if (!strengthSet) setStrength(strengthDefaults(l));
  };
  const chooseDays = (d: number) => { setDays(d); setRestDays(defaultRestDays(d)); };
  const toggleRest = (d: number) =>
    setRestDays(r => (r.includes(d) ? r.filter(x => x !== d) : [...r, d]));
  const setStrengthKey = (k: keyof StrengthAnswers, v: number) => {
    setStrength(s => ({ ...s, [k]: v }));
    setStrengthSet(true);
  };
  const toggleSkill = (s: SkillKey) =>
    setSkills(cur => (cur.includes(s) ? cur.filter(x => x !== s) : [...cur, s]));

  // ── Equipment answers ──
  const has = (id: EquipmentId) => equipment.items.includes(id);
  // Nothing is assumed: a gym or home user ticks what they have on the next step
  const choosePlace = (p: Place) =>
    setEquipment(e => (e.place === p ? e : { place: p, items: [] }));
  const selectAllGym = () => setEquipment(e => ({ ...e, items: [...GYM_ALL] }));
  const clearItems = () => setEquipment(e => ({ ...e, items: [] }));
  const setItem = (id: EquipmentId, on: boolean) =>
    setEquipment(e => ({
      ...e,
      items: on ? (e.items.includes(id) ? e.items : [...e.items, id]) : e.items.filter(x => x !== id),
    }));
  const toggleItem = (id: EquipmentId) =>
    setEquipment(e => {
      const home = e.place === 'home';
      if (e.items.includes(id)) {
        // In a gym, racks, EZ bars and bench types are their own ticks, so only one item goes
        const drop = new Set<EquipmentId>([id, ...(home ? DEPENDENTS[id] ?? [] : id === 'kettlebell' ? ['kettlebell_pair' as const] : [])]);
        return { ...e, items: e.items.filter(x => !drop.has(x)) };
      }
      // Home weights start from a typical answer; gyms have the full range (so more than one kettlebell)
      const added: EquipmentId[] = e.place === 'gym' && id === 'kettlebell' ? [id, 'kettlebell_pair'] : [id];
      return {
        ...e,
        items: [...e.items, ...added.filter(x => !e.items.includes(x))],
        dumbbellMaxKg: home && id === 'dumbbells' ? e.dumbbellMaxKg ?? 10 : e.dumbbellMaxKg,
        kettlebellMaxKg: home && id === 'kettlebell' ? e.kettlebellMaxKg ?? 12 : e.kettlebellMaxKg,
        plateTotalKg: home && id === 'barbell' ? e.plateTotalKg ?? 50 : e.plateTotalKg,
      };
    });

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

  const canNext = key !== 'rest' || restOk;
  const toggleOpenDay = (weekday: number) =>
    setOpenDays(cur => {
      const next = new Set(cur);
      next.has(weekday) ? next.delete(weekday) : next.add(weekday);
      return next;
    });

  const apply = () => {
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
        level, minutes, daysPerWeek: days, restDays, equipment, strength, skills, block, bodyweightKg,
        rotateWeeks, blockStart: todayStr(), name: plan.name, prescription: plan.prescription, targets,
      };
      setSetting(SETTING_KEY, JSON.stringify(cfg));
      onApplied();
      onClose();
    };
    showAlert(nextBlock ? 'Start the new block?' : 'Use this plan?',
      'This replaces the exercises in your weekly planner. Your workout history and PRs are not affected.', [
        { text: 'Cancel', style: 'cancel' },
        { text: nextBlock ? 'Start block' : 'Use plan', onPress: doApply },
      ]);
  };

  const Option = ({ on, onPress, children }: { on: boolean; onPress: () => void; children: React.ReactNode }) => (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85}
      style={[styles.option, on && { borderColor: C.accent, backgroundColor: C.accent + '14' }]}>
      {children}
    </TouchableOpacity>
  );

  const chip = (k: string, label: string, on: boolean, onPress: () => void) => (
    <TouchableOpacity key={k} onPress={onPress} activeOpacity={0.85} style={[styles.chip, on && styles.chipOn]}>
      {on && <Ionicons name="checkmark" size={13} color={C.accent} />}
      <Text style={[styles.chipTxt, on && { color: C.accent }]}>{label}</Text>
    </TouchableOpacity>
  );

  /** A labelled row of single-choice buttons. */
  const choiceRow = (label: string, options: string[], value: number, onChange: (i: number) => void) => (
    <View key={label}>
      <Text style={styles.rowLbl}>{label}</Text>
      <View style={styles.seg}>
        {options.map((o, i) => (
          <TouchableOpacity key={o} onPress={() => onChange(i)} activeOpacity={0.85}
            style={[styles.segBtn, value === i && styles.chipOn]}>
            <Text style={[styles.segTxt, value === i && { color: C.accent }]}>{o}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  const followUps = equipment.place === 'home' ? [
    has('dumbbells') && choiceRow('Heaviest dumbbell', kg(DUMBBELL_KG), DUMBBELL_KG.indexOf(equipment.dumbbellMaxKg ?? -1),
      i => setEquipment(e => ({ ...e, dumbbellMaxKg: DUMBBELL_KG[i] }))),
    has('kettlebell') && choiceRow('How many kettlebells?', ['1', '2 or more'], has('kettlebell_pair') ? 1 : 0,
      i => setItem('kettlebell_pair', i === 1)),
    has('kettlebell') && choiceRow('Heaviest kettlebell', kg(KETTLEBELL_KG), KETTLEBELL_KG.indexOf(equipment.kettlebellMaxKg ?? -1),
      i => setEquipment(e => ({ ...e, kettlebellMaxKg: KETTLEBELL_KG[i] }))),
    has('barbell') && choiceRow('Squat rack or stands?', ['Yes', 'No'], has('rack') ? 0 : 1, i => setItem('rack', i === 0)),
    has('barbell') && choiceRow('Plates in total', ['≤20 kg', '≤50 kg', '≤100 kg', '100+ kg'], PLATES_KG.indexOf(equipment.plateTotalKg ?? -1),
      i => setEquipment(e => ({ ...e, plateTotalKg: PLATES_KG[i] }))),
    has('barbell') && choiceRow('EZ curl bar too?', ['Yes', 'No'], has('ez_bar') ? 0 : 1, i => setItem('ez_bar', i === 0)),
    has('bench') && choiceRow('Bench type', ['Flat', 'Adjustable'], has('adj_bench') ? 1 : 0, i => setItem('adj_bench', i === 1)),
  ].filter(Boolean) : [];

  const nextLabel = step === last ? (nextBlock ? 'Start this block' : 'Use this plan')
    : step === last - 1 ? (nextBlock ? 'Show new exercises' : 'Build my split') : 'Next';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} onPress={e => e.stopPropagation()} style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.topRow}>
            <View style={styles.dots}>
              {flow.map((_, i) => (
                <View key={i} style={[styles.dot, i <= step && { backgroundColor: C.accent, width: i === step ? 18 : 6 }]} />
              ))}
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={HIT}>
              <Ionicons name="close" size={20} color={C.muted} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} style={{ flexGrow: 0 }}>
            {key === 'level' && (
              <>
                <Text style={styles.q}>What's your experience?</Text>
                <Text style={styles.qSub}>Sets the exercises, volume and rep ranges.</Text>
                {LEVELS.map(l => (
                  <Option key={l.key} on={level === l.key} onPress={() => chooseLevel(l.key)}>
                    <View style={[styles.optIcon, { backgroundColor: C.accent + '1A' }]}>
                      <Ionicons name={l.icon as any} size={18} color={C.accent} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.optTitle}>{l.title}</Text>
                      <Text style={styles.optSub}>{l.sub}</Text>
                    </View>
                    {level === l.key && <Ionicons name="checkmark-circle" size={20} color={C.accent} />}
                  </Option>
                ))}
              </>
            )}

            {key === 'place' && (
              <>
                <Text style={styles.q}>Where do you work out?</Text>
                <Text style={styles.qSub}>Your plan only uses exercises you can do with what you have.</Text>
                {PLACES.map(p => (
                  <Option key={p.key} on={equipment.place === p.key} onPress={() => choosePlace(p.key)}>
                    <View style={[styles.optIcon, { backgroundColor: C.accent + '1A' }]}>
                      <Ionicons name={p.icon} size={18} color={C.accent} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.optTitle}>{p.title}</Text>
                      <Text style={styles.optSub}>{p.sub}</Text>
                    </View>
                    {equipment.place === p.key && <Ionicons name="checkmark-circle" size={20} color={C.accent} />}
                  </Option>
                ))}
                {equipment.place === 'bodyweight' && (
                  <Text style={styles.hint}>{available} exercises need no equipment</Text>
                )}
              </>
            )}

            {key === 'equipment' && (
              <>
                <Text style={styles.q}>What equipment do you have?</Text>
                <Text style={styles.qSub}>
                  {equipment.place === 'gym'
                    ? 'Tick everything your gym has. Your plan only uses exercises you can do there.'
                    : 'Tick what you have at home. Your plan only uses exercises you can do with it.'}
                </Text>
                {equipment.place === 'gym' && (
                  <View style={styles.bulkRow}>
                    <TouchableOpacity onPress={selectAllGym} hitSlop={HIT} style={styles.bulkBtn}>
                      <Ionicons name="checkmark-done-outline" size={14} color={C.accent} />
                      <Text style={styles.linkTxt}>Select all</Text>
                    </TouchableOpacity>
                    {equipment.items.length > 0 && (
                      <TouchableOpacity onPress={clearItems} hitSlop={HIT} style={styles.bulkBtn}>
                        <Ionicons name="close-circle-outline" size={14} color={C.muted} />
                        <Text style={[styles.linkTxt, { color: C.muted }]}>Clear</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
                {(equipment.place === 'gym' ? GYM_GROUPS : HOME_GROUPS).map((g, gi) => (
                  <View key={g.title} style={styles.group}>
                    <Text style={styles.groupTitle}>{g.title}</Text>
                    <View style={styles.chips}>
                      {g.items.map(id => chip(id, EQUIPMENT_LABEL[id], has(id), () => toggleItem(id)))}
                    </View>
                    {/* Home weights: how heavy, and what goes with them */}
                    {gi === 0 && followUps.length > 0 && <View style={styles.followBox}>{followUps}</View>}
                  </View>
                ))}
                {equipment.place === 'home' && (
                  <>
                    <TouchableOpacity onPress={() => setShowMore(m => !m)} style={styles.moreBtn} hitSlop={HIT}>
                      <Text style={styles.moreTxt}>{showMore ? 'Fewer options' : 'More equipment'}</Text>
                      <Ionicons name={showMore ? 'chevron-up' : 'chevron-down'} size={14} color={C.accent} />
                    </TouchableOpacity>
                    {showMore && (
                      <View style={[styles.chips, { marginTop: 10 }]}>
                        {MORE_ITEMS.map(id => chip(id, EQUIPMENT_LABEL[id], has(id), () => toggleItem(id)))}
                      </View>
                    )}
                  </>
                )}
                <Text style={[styles.hint, !equipment.items.length && { color: C.orange }]}>
                  {equipment.items.length
                    ? `${available} exercises fit your equipment`
                    : 'Nothing ticked yet — your plan will be bodyweight only'}
                </Text>
              </>
            )}

            {key === 'strength' && (
              <>
                <Text style={styles.q}>{nextBlock ? 'Quick re-test' : 'Quick strength check'}</Text>
                <Text style={styles.qSub}>
                  {nextBlock
                    ? 'Got stronger? Update these and the new block picks harder versions.'
                    : 'Picks the right version of each exercise. A rough guess is fine.'}
                </Text>
                <View style={{ gap: 14 }}>
                  {choiceRow('Push-ups in a row', PUSH_OPTIONS, strength.push, v => setStrengthKey('push', v))}
                  {hasBar && choiceRow('Pull-ups in a row', PULL_OPTIONS, strength.pull, v => setStrengthKey('pull', v))}
                  {choiceRow('Bodyweight squats in a row', SQUAT_OPTIONS, strength.squat, v => setStrengthKey('squat', v))}
                  <View>
                    <Text style={styles.rowLbl}>Your bodyweight</Text>
                    <View style={styles.bwRow}>
                      <TextInput
                        style={styles.bwInput}
                        value={bodyweight}
                        onChangeText={setBodyweight}
                        keyboardType="decimal-pad"
                        placeholder={String(DEFAULT_BODYWEIGHT_KG)}
                        placeholderTextColor={C.muted}
                        maxLength={5}
                      />
                      <Text style={styles.bwUnit}>kg</Text>
                    </View>
                    <Text style={styles.bwHint}>
                      {bodyweightKg
                        ? 'Used to suggest your starting weights.'
                        : `Used to suggest your starting weights. Leave it empty and we'll assume ${DEFAULT_BODYWEIGHT_KG} kg.`}
                    </Text>
                  </View>
                </View>
              </>
            )}

            {key === 'skills' && (
              <>
                <Text style={styles.q}>Done any of these before?</Text>
                <Text style={styles.qSub}>Your first block sticks to moves you know. New ones come in from block 2.</Text>
                <View style={styles.chips}>
                  {skillOpts.map(s => chip(s, SKILL_LABEL[s], skills.includes(s), () => toggleSkill(s)))}
                </View>
                <Text style={styles.hint}>None of them? Just tap Next.</Text>
              </>
            )}

            {key === 'minutes' && (
              <>
                <Text style={styles.q}>How long per workout?</Text>
                <Text style={styles.qSub}>Including a short warm-up.</Text>
                <View style={styles.grid}>
                  {MINUTES.map(m => (
                    <TouchableOpacity key={m} onPress={() => setMinutes(m)} activeOpacity={0.85}
                      style={[styles.bigChip, minutes === m && { borderColor: C.accent, backgroundColor: C.accent + '14' }]}>
                      <Text style={[styles.bigChipNum, minutes === m && { color: C.accent }]}>{m}</Text>
                      <Text style={styles.bigChipUnit}>min</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={styles.hint}>≈ {exercisesPerSession(level, minutes)} exercises per session</Text>
              </>
            )}

            {key === 'days' && (
              <>
                <Text style={styles.q}>Days per week?</Text>
                <Text style={styles.qSub}>Pick what you can stick to — consistency beats everything.</Text>
                <View style={styles.grid}>
                  {DAYS.map(d => (
                    <TouchableOpacity key={d} onPress={() => chooseDays(d)} activeOpacity={0.85}
                      style={[styles.bigChip, days === d && { borderColor: C.accent, backgroundColor: C.accent + '14' }]}>
                      <Text style={[styles.bigChipNum, days === d && { color: C.accent }]}>{d}</Text>
                      <Text style={styles.bigChipUnit}>days</Text>
                      {RECOMMENDED_DAYS[level] === d && <View style={styles.recDot} />}
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={styles.hint}>
                  <Text style={{ color: C.green }}>●</Text> Recommended for {LEVELS.find(l => l.key === level)!.title.toLowerCase()}s: {RECOMMENDED_DAYS[level]} days
                </Text>
              </>
            )}

            {key === 'rest' && (
              <>
                <Text style={styles.q}>Which are your rest days?</Text>
                <Text style={styles.qSub}>
                  Pick {needRest} {needRest === 1 ? 'day' : 'days'} off. Tap a day to switch it between training and rest.
                </Text>
                <View style={styles.legend}>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: C.accent }]} />
                    <Text style={styles.legendTxt}>Blue = training day</Text>
                  </View>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: C.border }]} />
                    <Text style={styles.legendTxt}>Grey = rest day</Text>
                  </View>
                </View>
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
                <Text style={[styles.hint, !restOk && { color: C.orange }]}>
                  {restOk
                    ? `Looks good: ${days} training days, ${needRest} rest ${needRest === 1 ? 'day' : 'days'}`
                    : `${restDays.length} of ${needRest} rest days selected`}
                </Text>
              </>
            )}

            {key === 'plan' && (
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
                    Starting weights are a first guess from your strength check and bodyweight. Barbell weights
                    include the 20 kg bar. If the top of the rep range feels easy, add weight next session.
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
                  {choiceRow('New exercises every', ROTATE_OPTIONS.map(w => `${w} week${w === 1 ? '' : 's'}`),
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

          <View style={styles.footer}>
            {step > 0 && (
              <TouchableOpacity onPress={() => setStep(s => s - 1)} style={styles.backBtn} activeOpacity={0.8}>
                <Text style={styles.backTxt}>Back</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={() => (step < last ? setStep(s => s + 1) : apply())}
              disabled={!canNext} activeOpacity={0.85}
              style={[styles.nextBtn, !canNext && { opacity: 0.4 }]}>
              <Text style={styles.nextTxt}>{nextLabel}</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
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
        <View style={[styles.optIcon, { backgroundColor: C.accent + '1A', width: 44, height: 44, borderRadius: 14 }]}>
          <Ionicons name="sparkles-outline" size={20} color={C.accent} />
        </View>
        <View style={{ flex: 1, marginHorizontal: 12 }}>
          <Text style={styles.optTitle}>Build your split</Text>
          <Text style={styles.optSub}>A few quick questions → a plan built around your equipment</Text>
        </View>
        <View style={styles.startPill}><Text style={styles.startTxt}>Start</Text></View>
      </TouchableOpacity>
    );
  }

  const levelName = LEVELS.find(l => l.key === config.level)?.title ?? '';
  const isRest = (d: number) => (plans.find(p => p.day_of_week === DAY_NAMES[d])?.muscle_groups ?? 'Rest') === 'Rest';
  const weeks = config.rotateWeeks ?? DEFAULT_ROTATE_WEEKS;
  const progress = blockProgress(config.blockStart, weeks);
  const blockNo = (config.block ?? 0) + 1;

  return (
    <View style={styles.card}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          <Text style={styles.kicker}>Your split</Text>
          <Text style={[styles.planName, { fontSize: 20 }]}>{config.name}</Text>
          <Text style={styles.optSub}>
            {levelName} · {config.daysPerWeek} days · {config.minutes} min
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
          <Ionicons name="sparkles-outline" size={18} color={C.accent} />
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
    topRow:    { flexDirection: 'row', alignItems: 'center', marginBottom: 18 },
    dots:      { flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center' },
    dot:       { width: 6, height: 6, borderRadius: 3, backgroundColor: C.border },
    q:         { fontSize: 22, fontWeight: '800', color: C.text },
    qSub:      { fontSize: 13, color: C.muted, fontWeight: '600', marginTop: 4, marginBottom: 16, lineHeight: 19 },
    option:    { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, borderWidth: 1, borderColor: C.border, backgroundColor: C.bg, marginBottom: 10 },
    optIcon:   { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    optTitle:  { fontSize: 15, fontWeight: '800', color: C.text },
    optSub:    { fontSize: 12, color: C.muted, fontWeight: '600', marginTop: 2 },
    chips:     { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip:      { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: C.border, backgroundColor: C.bg },
    chipOn:    { borderColor: C.accent, backgroundColor: C.accent + '14' },
    chipTxt:   { fontSize: 13, fontWeight: '700', color: C.textSub },
    followBox: { marginTop: 12, padding: 12, borderRadius: 16, borderWidth: 1, borderColor: C.border, backgroundColor: C.bg, gap: 12 },
    rowLbl:    { fontSize: 12, fontWeight: '800', color: C.muted, marginBottom: 6 },
    seg:       { flexDirection: 'row', gap: 6 },
    segBtn:    { flex: 1, paddingVertical: 9, borderRadius: 10, borderWidth: 1, borderColor: C.border, backgroundColor: C.card, alignItems: 'center' },
    segTxt:    { fontSize: 12, fontWeight: '800', color: C.textSub },
    moreBtn:   { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 14, alignSelf: 'flex-start' },
    moreTxt:   { fontSize: 13, fontWeight: '800', color: C.accent },
    note:      { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 10 },
    noteTxt:   { flex: 1, fontSize: 12, fontWeight: '600', color: C.textSub, lineHeight: 17 },
    swapBtn:   { marginLeft: 8, padding: 2 },
    grid:      { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    bigChip:   { width: 76, height: 76, borderRadius: 18, borderWidth: 1, borderColor: C.border, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' },
    bigChipNum:{ fontSize: 24, fontWeight: '800', color: C.text },
    bigChipUnit: { fontSize: 11, fontWeight: '700', color: C.muted },
    recDot:    { position: 'absolute', top: 8, right: 8, width: 7, height: 7, borderRadius: 4, backgroundColor: C.green },
    hint:      { fontSize: 12, color: C.muted, fontWeight: '700', marginTop: 14 },
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
    // Strength step
    bwRow:     { flexDirection: 'row', alignItems: 'center', gap: 8 },
    bwInput:   { width: 96, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10, borderWidth: 1, borderColor: C.border, backgroundColor: C.card, color: C.text, fontSize: 15, fontWeight: '800' },
    bwUnit:    { fontSize: 13, fontWeight: '800', color: C.muted },
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
    footer:    { flexDirection: 'row', gap: 10, marginTop: 16 },
    backBtn:   { paddingHorizontal: 20, paddingVertical: 14, borderRadius: 14, borderWidth: 1, borderColor: C.border },
    backTxt:   { fontSize: 15, fontWeight: '700', color: C.muted },
    nextBtn:   { flex: 1, backgroundColor: C.accent, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
    nextTxt:   { color: '#fff', fontWeight: '800', fontSize: 15 },
  });
}
