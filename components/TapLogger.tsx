// components/TapLogger.tsx — log a workout with taps only (no voice, no typing).
// 1. Tap a muscle on the body (each group has a labelled bubble).
// 2. Pick an exercise: recommended ones first (today's plan, what you did lately, popular moves
//    that fit your equipment), then every exercise for that muscle. The search icon finds any.
// 3. Set sets, reps and weight with steppers and scroll wheels, rename it if you like, and add it.
// Everything added is saved together as one workout (PRs are checked as usual).
import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList, TextInput, Image, ScrollView, useWindowDimensions,
} from 'react-native';
import Animated, { FadeIn, FadeInRight, FadeInLeft } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../contexts/ThemeContext';
import {
  getWorkoutPlanExercises, getExerciseLogsSince, getLastExerciseLog, isRepsOnly, addCustomExercise,
  logWorkoutSession, updateDailyLog, updateStreak, toDateStr, todayStr,
} from '../db/database';
import { EXERCISE_CATALOG, CatalogExercise, findExercise, catalogName } from '../constants/exerciseCatalog';
import { POOLS, PatternKey } from '../constants/exercisePools';
import { ownedItems, canDo, loadTypeOf } from '../constants/equipment';
import { closestOnLadder, KETTLEBELL_SIZES, PLATE_SIZES } from '../constants/startingLoads';
import { getSplitConfig } from './SplitWizard';
import { BodyMap, BodySide } from './BodyMap';
import { WheelPicker } from './WheelPicker';
import { LoopingThumb } from './ExerciseGuide';

export interface TapEntry {
  name: string;
  muscle: string;      // body group: Chest, Upper Back, Lower Back, ...
  sets: number;
  reps: number;
  weight: number;      // kg; 0 for bodyweight moves
  repsOnly: boolean;
}

type View_ = 'body' | 'quick' | 'list';
type Tag = 'plan' | 'recent' | 'popular';

const HIT = { top: 10, bottom: 10, left: 10, right: 10 };
const REP_ITEMS = Array.from({ length: 51 }, (_, i) => String(i));   // 0 … 50
const TAG_LABEL: Record<Tag, string> = { plan: "Today's plan", recent: 'Done lately', popular: 'Popular' };
const TAG_ICON: Record<Tag, keyof typeof Ionicons.glyphMap> = { plan: 'calendar', recent: 'time', popular: 'star' };

// Exercises worth suggesting for each body group, from the split builder's curated pools
const GROUP_PATTERNS: Record<string, PatternKey[]> = {
  Chest: ['hPush', 'inclinePush', 'chestFly'],
  Shoulders: ['vPush', 'lateral', 'rearDelt'],
  Biceps: ['biceps'],
  Triceps: ['triceps'],
  Core: ['core'],
  Legs: ['squat', 'hinge', 'lunge', 'glute', 'hamCurl', 'quadIso', 'calf'],
  'Upper Back': ['vPull', 'hPull'],
  'Lower Back': ['hinge'],
  Forearms: [],
};

// Finer filters inside the big groups, by the exercise's main muscle
const SUBGROUPS: Record<string, { label: string; muscle: string }[]> = {
  Legs: [
    { label: 'Quads', muscle: 'quadriceps' }, { label: 'Hamstrings', muscle: 'hamstrings' },
    { label: 'Glutes', muscle: 'glutes' }, { label: 'Calves', muscle: 'calves' },
  ],
  'Upper Back': [{ label: 'Lats', muscle: 'lats' }, { label: 'Mid back', muscle: 'middle back' }, { label: 'Traps', muscle: 'traps' }],
};

const isLowerBack = (e: CatalogExercise) => e.primary.includes('lower back');
// Lifting first, stretches last
const CATEGORY_RANK: Record<string, number> = { Strength: 0, Powerlifting: 0, 'Olympic Weightlifting': 1, Strongman: 1, Plyometrics: 2, Cardio: 3, Stretching: 4 };

/** The body group an exercise is logged under. */
export function bodyGroupOf(name: string, fallback = 'Chest'): string {
  const e = findExercise(name);
  if (!e) return fallback === 'Back' ? 'Upper Back' : fallback;
  if (e.group === 'Back') return isLowerBack(e) ? 'Lower Back' : 'Upper Back';
  return e.group;
}

function exercisesFor(group: string): CatalogExercise[] {
  const list = group === 'Upper Back' ? EXERCISE_CATALOG.filter(e => e.group === 'Back' && !isLowerBack(e))
    : group === 'Lower Back' ? EXERCISE_CATALOG.filter(isLowerBack)
    : EXERCISE_CATALOG.filter(e => e.group === group);
  return list.slice().sort((a, b) =>
    (CATEGORY_RANK[a.category] ?? 2) - (CATEGORY_RANK[b.category] ?? 2) || a.name.localeCompare(b.name));
}

const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return toDateStr(d); };
const dayName = () => new Date().toLocaleDateString('en-US', { weekday: 'long' });

// Exercises added but not saved yet outlive the sheet, so closing it by accident loses nothing
let unsaved: { date: string; entries: TapEntry[] } = { date: '', entries: [] };

/** Suggestions for a muscle: today's plan, then what was done lately, then popular moves that fit the equipment. */
function recommendedFor(group: string, owned: Set<string>): { e: CatalogExercise; tag: Tag }[] {
  const inGroup = (n: string, logged?: string) => bodyGroupOf(n, logged) === group;
  const out = new Map<string, Tag>();
  getWorkoutPlanExercises(dayName()).forEach(p => {
    if (inGroup(p.exercise_name, p.muscle_group)) out.set(p.exercise_name, 'plan');
  });
  getExerciseLogsSince(daysAgo(30)).slice().reverse().forEach(l => {
    if (!out.has(l.exercise_name) && inGroup(l.exercise_name, l.muscle_group)) out.set(l.exercise_name, 'recent');
  });
  // Popular: the top of each curated pool in turn, so the suggestions cover the whole muscle
  const pools = (GROUP_PATTERNS[group] ?? []).map(p => POOLS[p].filter(c => canDo(c.name, owned) && inGroup(c.name)));
  for (let i = 0; out.size < 10 && pools.some(p => p.length > i); i++) {
    pools.forEach(p => { if (p[i] && out.size < 10 && !out.has(p[i].name)) out.set(p[i].name, 'popular'); });
  }
  const list = [...out].map(([n, tag]) => ({ e: findExercise(n)!, tag })).filter(x => !!x.e).slice(0, 10);
  // A muscle without curated moves (forearms) still gets a few to pick from
  if (list.length === 0) exercisesFor(group).slice(0, 6).forEach(e => list.push({ e, tag: 'popular' }));
  return list;
}

/** A new, empty entry: nothing is guessed, the user sets every number. */
function blankEntry(muscle: string, name = ''): TapEntry {
  return { name, muscle, sets: 1, reps: 0, weight: 0, repsOnly: name ? isRepsOnly(name) : false };
}

export function TapLogger({ onSaved }: { onSaved: (entries: TapEntry[]) => void }) {
  const { C } = useTheme();
  const styles = makeStyles(C);
  const { height: winH } = useWindowDimensions();
  const [view, setView] = useState<View_>('body');
  const [side, setSide] = useState<BodySide>('front');
  const [group, setGroup] = useState<string | null>(null);
  const [sub, setSub] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  const [cart, setCartState] = useState<TapEntry[]>(() => (unsaved.date === todayStr() ? unsaved.entries : []));
  const setCart = (update: (c: TapEntry[]) => TapEntry[]) =>
    setCartState(c => {
      const next = update(c);
      unsaved = { date: todayStr(), entries: next };
      return next;
    });
  const [editing, setEditing] = useState<{ entry: TapEntry; index: number | null } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    cart.forEach(e => { c[e.muscle] = (c[e.muscle] ?? 0) + 1; });
    return c;
  }, [cart]);

  // What the user has, from their split (no split = a full gym)
  const owned = useMemo(() => ownedItems(getSplitConfig()?.equipment), []);

  const recommended = useMemo(() => (group ? recommendedFor(group, owned) : []), [group, owned]);

  const all = useMemo(() => (group ? exercisesFor(group) : []), [group]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q) {
      return EXERCISE_CATALOG.filter(e => e.name.toLowerCase().includes(q) || (e.equipment ?? '').toLowerCase().includes(q))
        .sort((a, b) => Number(!a.name.toLowerCase().startsWith(q)) - Number(!b.name.toLowerCase().startsWith(q))
          || (CATEGORY_RANK[a.category] ?? 2) - (CATEGORY_RANK[b.category] ?? 2) || a.name.localeCompare(b.name))
        .slice(0, 80);
    }
    return sub ? all.filter(e => e.primary.includes(sub)) : all;
  }, [query, sub, all]);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(t => (t === msg ? null : t)), 1800);
  };

  // Tapping a muscle opens the quick-add view straight away: the top suggestion is already
  // picked with its sets, reps and weight, ready to adjust and add
  const pickGroup = (g: string) => {
    Haptics.selectionAsync().catch(() => {});
    setGroup(g);
    setSub(null);
    setQuery('');
    setSearching(false);
    setEditing({ entry: blankEntry(g), index: null });
    // A beat to see the muscle light up first
    setTimeout(() => setView('quick'), 180);
  };

  /** Picked from a suggestion, the full list or search: back to quick-add with it. */
  const startEntry = (e: CatalogExercise) => {
    Haptics.selectionAsync().catch(() => {});
    const muscle = query.trim() || !group ? bodyGroupOf(e.name, e.group) : group;
    setGroup(muscle);
    setEditing({ entry: blankEntry(muscle, e.name), index: null });
    setQuery('');
    setSearching(false);
    setView('quick');
  };

  const editCartItem = (i: number) => {
    setEditing({ entry: cart[i], index: i });
    setGroup(cart[i].muscle);
    setView('quick');
  };

  const commitEntry = (entry: TapEntry, index: number | null) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setCart(c => (index === null ? [...c, entry] : c.map((x, i) => (i === index ? entry : x))));
    flash(`${index === null ? 'Added' : 'Updated'} ${entry.name}`);
    setEditing(null);
    setView('body');
  };

  const removeCartItem = (i: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setCart(c => c.filter((_, j) => j !== i));
  };

  const save = () => {
    if (!cart.length) return;
    const today = todayStr();
    const groups = [...new Set(cart.map(e => e.muscle))].join(',');
    logWorkoutSession(today, groups, 'Logged by tap', cart.map(e => ({
      exercise: e.name, muscleGroup: e.muscle, sets: e.sets, reps: e.reps, weight: e.repsOnly ? 0 : e.weight, unit: 'kg',
    })));
    updateDailyLog(today, { workout_completed: 1 });
    updateStreak();
    onSaved(cart);
    setCart(() => []);
  };

  // ── Views ──
  if (view === 'quick' && group && editing) {
    const color = C.mg[group] ?? C.accent;
    const isUpdate = editing.index !== null;
    return (
      <Animated.View entering={FadeInRight.duration(220)}>
        <View style={styles.listHead}>
          <TouchableOpacity onPress={() => { setEditing(null); setView('body'); }} hitSlop={HIT} style={styles.iconBtn}
            accessibilityLabel="Back to the body">
            <Ionicons name="chevron-back" size={20} color={C.text} />
          </TouchableOpacity>
          <View style={[styles.groupDot, { backgroundColor: color }]} />
          <Text style={styles.listTitle}>{isUpdate ? 'Edit exercise' : group}</Text>
          <TouchableOpacity onPress={() => { setSearching(true); setView('list'); }} hitSlop={HIT}
            style={[styles.iconBtn, { marginLeft: 'auto' }]} accessibilityLabel="Search exercises">
            <Ionicons name="search" size={18} color={C.accent} />
          </TouchableOpacity>
        </View>

        {/* Name, sets, reps and weight first; suggestions are one tap away and only fill the name */}
        <EntryEditor key={`${editing.entry.name}-${editing.index}`} initial={editing.entry} isUpdate={isUpdate} embedded
          suggestions={isUpdate ? [] : recommended}
          onMore={isUpdate ? undefined : () => { setSearching(false); setView('list'); }}
          onCancel={() => { setEditing(null); setView('body'); }}
          onDone={entry => commitEntry(entry, editing.index)} />
      </Animated.View>
    );
  }

  if (view === 'list') {
    // No group = opened from the body view's search button
    const color = group ? C.mg[group] ?? C.accent : C.accent;
    const subs = group ? SUBGROUPS[group] : undefined;
    const showSearch = searching || !!query || !group;
    const header = (
      <View>
        {!query && recommended.length > 0 && (
          <>
            <Text style={styles.kicker}>RECOMMENDED</Text>
            {recommended.map(({ e, tag }) => (
              <ExerciseRow key={`r-${e.name}`} e={e} color={color} tag={tag} onPress={() => startEntry(e)} />
            ))}
          </>
        )}
        {!query && subs && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.subRow}>
            {[{ label: 'All', muscle: '' }, ...subs].map(s => {
              const on = (sub ?? '') === s.muscle;
              return (
                <TouchableOpacity key={s.label} onPress={() => setSub(s.muscle || null)} activeOpacity={0.8}
                  style={[styles.subChip, on && { backgroundColor: color, borderColor: color }]}>
                  <Text style={[styles.subTxt, on && { color: '#fff' }]}>{s.label}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}
        {(query || group) && (
          <Text style={styles.kicker}>
            {query ? `${filtered.length} RESULT${filtered.length === 1 ? '' : 'S'}` : `ALL ${group!.toUpperCase()} · ${filtered.length}`}
          </Text>
        )}
      </View>
    );
    return (
      <Animated.View entering={FadeInRight.duration(220)} style={styles.listWrap}>
        <View style={styles.listHead}>
          <TouchableOpacity onPress={() => { setView(group && editing ? 'quick' : 'body'); setQuery(''); setSearching(false); }}
            hitSlop={HIT} style={styles.iconBtn}>
            <Ionicons name="chevron-back" size={20} color={C.text} />
          </TouchableOpacity>
          {showSearch ? (
            <Animated.View entering={FadeIn.duration(160)} style={styles.searchBox}>
              <Ionicons name="search" size={15} color={C.muted} />
              <TextInput value={query} onChangeText={setQuery} autoFocus placeholder="Search every exercise"
                placeholderTextColor={C.muted} style={styles.searchInput} returnKeyType="search" />
              <TouchableOpacity onPress={() => { setQuery(''); setSearching(false); if (!group) setView('body'); else if (editing) setView('quick'); }} hitSlop={HIT}>
                <Ionicons name="close-circle" size={17} color={C.muted} />
              </TouchableOpacity>
            </Animated.View>
          ) : (
            <>
              <View style={[styles.groupDot, { backgroundColor: color }]} />
              <Text style={styles.listTitle}>{group ?? 'Search'}</Text>
              <TouchableOpacity onPress={() => setSearching(true)} hitSlop={HIT} style={[styles.iconBtn, { marginLeft: 'auto' }]}
                accessibilityLabel="Search exercises">
                <Ionicons name="search" size={19} color={C.accent} />
              </TouchableOpacity>
            </>
          )}
        </View>
        <FlatList
          data={filtered}
          keyExtractor={e => e.name}
          ListHeaderComponent={header}
          renderItem={({ item }) => <ExerciseRow e={item} color={C.mg[bodyGroupOf(item.name, item.group)] ?? color} onPress={() => startEntry(item)} />}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={12}
          windowSize={7}
          style={styles.list}
          ListEmptyComponent={
            <Text style={styles.empty}>{query ? `No exercises match "${query}"` : 'Type a name or a piece of equipment'}</Text>
          }
        />
      </Animated.View>
    );
  }

  // Body view
  return (
    <Animated.View entering={FadeInLeft.duration(200)}>
      <View style={styles.bodyHead}>
        <Text style={styles.bodyHint}>Tap a muscle to log what you did</Text>
        <TouchableOpacity onPress={() => { setGroup(null); setEditing(null); setQuery(''); setSearching(true); setView('list'); }}
          hitSlop={HIT} style={[styles.iconBtn, { marginRight: 8 }]} accessibilityLabel="Search exercises">
          <Ionicons name="search" size={17} color={C.accent} />
        </TouchableOpacity>
        <View style={styles.sideToggle}>
          {(['front', 'back'] as BodySide[]).map(s => (
            <TouchableOpacity key={s} onPress={() => setSide(s)} activeOpacity={0.85}
              style={[styles.sideBtn, side === s && { backgroundColor: C.accent }]}>
              <Text style={[styles.sideTxt, side === s && { color: '#fff' }]}>{s === 'front' ? 'Front' : 'Back'}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      {/* Smaller on short screens (and when a workout list sits below), so Save stays in view */}
      <BodyMap side={side} selected={group} counts={counts} onPick={pickGroup}
        maxHeight={Math.min(340, winH * (cart.length ? 0.34 : 0.42))} />

      {toast && (
        <Animated.View entering={FadeIn.duration(160)} style={styles.toast}>
          <Ionicons name="checkmark-circle" size={15} color={C.green} />
          <Text style={styles.toastTxt} numberOfLines={1}>{toast}</Text>
        </Animated.View>
      )}

      {cart.length > 0 && (
        <View style={styles.cartWrap}>
          <Text style={styles.kicker}>THIS WORKOUT · TAP TO EDIT</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {cart.map((e, i) => {
              const col = C.mg[e.muscle] ?? C.accent;
              return (
                <TouchableOpacity key={`${e.name}-${i}`} onPress={() => editCartItem(i)} activeOpacity={0.85}
                  style={[styles.cartChip, { borderColor: col + '66', backgroundColor: col + '12' }]}>
                  <View style={{ maxWidth: 150 }}>
                    <Text style={styles.cartName} numberOfLines={1}>{e.name}</Text>
                    <Text style={[styles.cartSets, { color: col }]}>
                      {e.sets} × {e.reps}{e.repsOnly ? ' reps' : ` · ${e.weight} kg`}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => removeCartItem(i)} hitSlop={HIT} accessibilityLabel={`Remove ${e.name}`}>
                    <Ionicons name="close-circle" size={18} color={C.muted} />
                  </TouchableOpacity>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <TouchableOpacity onPress={save} activeOpacity={0.85} style={styles.saveBtn}>
            <Ionicons name="checkmark-circle" size={19} color="#fff" />
            <Text style={styles.saveTxt}>
              Save workout · {cart.length} exercise{cart.length === 1 ? '' : 's'}, {cart.reduce((n, e) => n + e.sets, 0)} sets
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </Animated.View>
  );
}

function ExerciseRow({ e, color, tag, onPress }: { e: CatalogExercise; color: string; tag?: Tag; onPress: () => void }) {
  const { C } = useTheme();
  const styles = makeStyles(C);
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={styles.exRow}>
      {e.images[0] ? <Image source={e.images[0]} style={styles.exThumb} resizeMode="cover" />
        : <View style={[styles.exThumb, { alignItems: 'center', justifyContent: 'center', backgroundColor: color + '22' }]}>
            <Ionicons name="barbell-outline" size={18} color={color} />
          </View>}
      <View style={{ flex: 1 }}>
        <Text style={styles.exName} numberOfLines={2}>{e.name}</Text>
        <View style={styles.exMeta}>
          {tag && (
            <View style={[styles.tag, { backgroundColor: color + '1A' }]}>
              <Ionicons name={TAG_ICON[tag]} size={10} color={color} />
              <Text style={[styles.tagTxt, { color }]}>{TAG_LABEL[tag]}</Text>
            </View>
          )}
          <Text style={styles.exSub} numberOfLines={1}>{[e.equipment, e.level].filter(Boolean).join(' · ')}</Text>
        </View>
      </View>
      <Ionicons name="add-circle" size={24} color={color} />
    </TouchableOpacity>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sets, reps, weight and name for one exercise
// ─────────────────────────────────────────────────────────────────────────────

const range = (from: number, to: number, step: number) =>
  Array.from({ length: Math.round((to - from) / step) + 1 }, (_, i) => +(from + i * step).toFixed(2));
const ANY_WEIGHT = range(0, 300, 0.5);

/**
 * The weights the wheel offers, from 0, in steps that exist for that kind of exercise: half-kilo
 * steps for dumbbells, 1.25 kg for barbells (the smallest pair of plates), real kettlebell and
 * plate sizes, 1 kg for machines; any half kilo for exercises of your own.
 */
function tapLadder(name: string): number[] {
  const known = name.trim() ? catalogName(name.trim()) : null;
  if (!known) return ANY_WEIGHT;
  switch (loadTypeOf(known)) {
    case 'db': case 'db1': return range(0, 60, 0.5);
    case 'kb': case 'kb2': return [0, ...KETTLEBELL_SIZES, 36, 40, 48];
    case 'barbell': case 'ez': case 'smith': return range(0, 300, 1.25);
    case 'stack': case 'sled': return range(0, 300, 1);
    case 'plate': return [0, ...PLATE_SIZES];
    case 'medball': return range(0, 12, 1);
    case 'added': return range(0, 100, 1.25);
    default: return ANY_WEIGHT;
  }
}

function EntryEditor({ initial, isUpdate, embedded, suggestions = [], onMore, onCancel, onDone }: {
  initial: TapEntry; isUpdate: boolean; embedded?: boolean;
  suggestions?: { e: CatalogExercise; tag: Tag }[]; onMore?: () => void;
  onCancel: () => void; onDone: (e: TapEntry) => void;
}) {
  const { C } = useTheme();
  const styles = makeStyles(C);
  // Nothing is filled in for you: the name comes from you (typed or a suggestion), then the numbers
  const [name, setName] = useState(initial.name);
  const [sets, setSets] = useState(initial.sets);
  const [reps, setReps] = useState(initial.reps);
  const trimmed = name.trim();
  const repsOnly = useMemo(() => (trimmed ? isRepsOnly(catalogName(trimmed) ?? trimmed) : false), [trimmed]);
  const steps = useMemo(() => tapLadder(trimmed), [trimmed]);
  const [kg, setKg] = useState(() => closestOnLadder(initial.weight, steps));
  // A different kind of exercise has different weight steps: keep the nearest
  useEffect(() => { setKg(k => closestOnLadder(k, steps)); }, [steps]);
  const color = C.mg[initial.muscle] ?? C.accent;
  const photos = trimmed ? findExercise(trimmed)?.images : undefined;
  const last = useMemo(() => (trimmed ? getLastExerciseLog(catalogName(trimmed) ?? trimmed) : null), [trimmed]);
  const ready = !!trimmed && reps > 0;

  const done = () => {
    if (!ready) return;
    const finalName = catalogName(trimmed) ?? trimmed.replace(/\s+/g, ' ');
    // A name of your own is remembered as a custom exercise, so PRs score it the same way
    if (!catalogName(finalName)) addCustomExercise(finalName, initial.muscle, repsOnly ? 'reps' : 'weight');
    onDone({ ...initial, name: finalName, sets, reps, weight: repsOnly ? 0 : kg, repsOnly });
  };

  const step = (d: number) => {
    Haptics.selectionAsync().catch(() => {});
    setSets(s => Math.min(12, Math.max(1, s + d)));
  };

  return (
    <Animated.View entering={FadeInRight.duration(220)}>
      {!embedded && (
        <View style={styles.listHead}>
          <TouchableOpacity onPress={onCancel} hitSlop={HIT} style={styles.iconBtn}>
            <Ionicons name="chevron-back" size={20} color={C.text} />
          </TouchableOpacity>
          <Text style={styles.listTitle}>{isUpdate ? 'Edit exercise' : 'Add exercise'}</Text>
        </View>
      )}

      {/* Name: type anything, or tap a suggestion */}
      <View style={[styles.editCard, { borderColor: trimmed ? color + '88' : C.border }]}>
        {photos && photos.length > 0 ? (
          <View style={styles.editPhoto}><LoopingThumb images={photos} width={72} height={48} /></View>
        ) : (
          <View style={[styles.editPhoto, styles.noPhoto, { backgroundColor: color + '18' }]}>
            <Ionicons name="barbell-outline" size={20} color={color} />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <TextInput value={name} onChangeText={setName} placeholder="Exercise name" placeholderTextColor={C.muted}
            style={[styles.nameInput, { borderColor: trimmed ? color : C.border }]} maxLength={60} returnKeyType="done" />
          <Text style={[styles.editMuscle, { color }]}>{initial.muscle.toUpperCase()}</Text>
          {last && (
            <Text style={styles.lastTxt}>
              Last time: {last.sets} × {last.reps}{last.weight > 0 ? ` @ ${last.weight} kg` : ''}
            </Text>
          )}
        </View>
      </View>

      {suggestions.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.recRow}
          keyboardShouldPersistTaps="handled">
          {suggestions.map(({ e, tag }) => {
            const on = e.name === trimmed;
            return (
              <TouchableOpacity key={e.name} onPress={() => { Haptics.selectionAsync().catch(() => {}); setName(e.name); }}
                activeOpacity={0.85} style={[styles.recChip, on && { borderColor: color, backgroundColor: color + '18' }]}>
                {e.images[0] && <Image source={e.images[0]} style={styles.recThumb} resizeMode="cover" />}
                <View style={{ flexShrink: 1 }}>
                  <Text style={[styles.recName, on && { color }]} numberOfLines={2}>{e.name}</Text>
                  <Text style={[styles.recTag, { color }]}>{TAG_LABEL[tag]}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
          {onMore && (
            <TouchableOpacity onPress={onMore} activeOpacity={0.85} style={[styles.recChip, styles.recMore]}>
              <Ionicons name="list" size={18} color={C.accent} />
              <Text style={[styles.recName, { color: C.accent }]}>All {initial.muscle.toLowerCase()}{'\n'}exercises</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      )}

      <View style={styles.dials}>
        <View style={styles.dial}>
          <Text style={styles.dialLbl}>Sets</Text>
          <View style={styles.stepper}>
            <TouchableOpacity onPress={() => step(-1)} style={styles.stepBtn} hitSlop={HIT} accessibilityLabel="Fewer sets">
              <Ionicons name="remove" size={18} color={C.text} />
            </TouchableOpacity>
            <Text style={styles.stepVal}>{sets}</Text>
            <TouchableOpacity onPress={() => step(1)} style={styles.stepBtn} hitSlop={HIT} accessibilityLabel="More sets">
              <Ionicons name="add" size={18} color={C.text} />
            </TouchableOpacity>
          </View>
        </View>
        <View style={styles.dial}>
          <Text style={styles.dialLbl}>Reps</Text>
          <WheelPicker items={REP_ITEMS} width={64} index={reps} onChange={setReps} />
        </View>
        {repsOnly ? (
          <View style={styles.dial}>
            <Text style={styles.dialLbl}>Weight</Text>
            <View style={styles.bwBox}>
              <Ionicons name="body-outline" size={18} color={color} />
              <Text style={styles.bwTxt}>Bodyweight</Text>
            </View>
          </View>
        ) : (
          <View style={[styles.dial, { flex: 1.25 }]}>
            <Text style={styles.dialLbl}>Weight (kg)</Text>
            <WheelPicker key={`${steps.length}-${steps[1]}`} items={steps.map(String)} width={84}
              index={Math.max(0, steps.indexOf(kg))} onChange={i => setKg(steps[i])} />
          </View>
        )}
      </View>

      <Text style={[styles.summary, !ready && { color: C.muted }]}>
        {!trimmed ? 'Name the exercise or pick one above'
          : reps === 0 ? 'Scroll the reps to how many you did'
          : `${sets} set${sets === 1 ? '' : 's'} of ${reps} rep${reps === 1 ? '' : 's'}${repsOnly ? '' : ` with ${kg} kg`}`}
      </Text>
      <TouchableOpacity onPress={done} disabled={!ready} activeOpacity={0.85}
        style={[styles.saveBtn, { backgroundColor: color }, !ready && { opacity: 0.4 }]}>
        <Ionicons name={isUpdate ? 'checkmark-circle' : 'add-circle'} size={19} color="#fff" />
        <Text style={styles.saveTxt}>{isUpdate ? 'Update' : 'Add to workout'}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

function makeStyles(C: any) {
  return StyleSheet.create({
    bodyHead:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
    bodyHint:   { flex: 1, fontSize: 13, fontWeight: '700', color: C.muted },
    sideToggle: { flexDirection: 'row', backgroundColor: C.bg, borderRadius: 12, padding: 3, borderWidth: 1, borderColor: C.border },
    sideBtn:    { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 9 },
    sideTxt:    { fontSize: 12, fontWeight: '800', color: C.muted },
    toast:      { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'center', marginTop: 8, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, backgroundColor: C.green + '1A', maxWidth: '90%' },
    toastTxt:   { fontSize: 12, fontWeight: '800', color: C.green, flexShrink: 1 },
    cartWrap:   { marginTop: 12 },
    cartChip:   { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 14, borderWidth: 1 },
    cartName:   { fontSize: 12, fontWeight: '800', color: C.text },
    cartSets:   { fontSize: 11, fontWeight: '800', marginTop: 1 },
    saveBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.green, borderRadius: 16, paddingVertical: 14, marginTop: 12 },
    saveTxt:    { color: '#fff', fontWeight: '800', fontSize: 14 },
    kicker:     { fontSize: 10, fontWeight: '800', color: C.muted, letterSpacing: 0.7, marginBottom: 8, marginTop: 6 },

    listWrap:   {},
    listHead:   { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
    iconBtn:    { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg, borderWidth: 1, borderColor: C.border },
    groupDot:   { width: 10, height: 10, borderRadius: 5 },
    listTitle:  { fontSize: 17, fontWeight: '800', color: C.text },
    searchBox:  { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, height: 38, borderRadius: 12, borderWidth: 1, borderColor: C.accent + '66', backgroundColor: C.bg },
    searchInput:{ flex: 1, fontSize: 14, fontWeight: '600', color: C.text, paddingVertical: 0 },
    list:       { maxHeight: 430 },
    subRow:     { gap: 6, paddingVertical: 4, marginTop: 6 },
    recRow:     { gap: 8, paddingBottom: 10 },
    recChip:    { width: 150, flexDirection: 'row', alignItems: 'center', gap: 8, padding: 6, borderRadius: 14, borderWidth: 1.5, borderColor: C.border, backgroundColor: C.bg },
    recThumb:   { width: 40, height: 34, borderRadius: 8 },
    recName:    { fontSize: 11, fontWeight: '800', color: C.text },
    recTag:     { fontSize: 9, fontWeight: '800', marginTop: 2 },
    recMore:    { width: 118, justifyContent: 'center', borderStyle: 'dashed', borderColor: C.accent + '88' },
    subChip:    { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, borderWidth: 1, borderColor: C.border, backgroundColor: C.bg },
    subTxt:     { fontSize: 12, fontWeight: '800', color: C.textSub },
    empty:      { fontSize: 13, fontWeight: '600', color: C.muted, textAlign: 'center', paddingVertical: 24 },
    exRow:      { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.border + '99' },
    exThumb:    { width: 52, height: 40, borderRadius: 10, backgroundColor: C.border + '55' },
    exName:     { fontSize: 13, fontWeight: '800', color: C.text },
    exMeta:     { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
    exSub:      { fontSize: 11, fontWeight: '600', color: C.muted, flexShrink: 1, textTransform: 'capitalize' },
    tag:        { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
    tagTxt:     { fontSize: 10, fontWeight: '800' },

    editCard:   { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 18, borderWidth: 1, backgroundColor: C.bg },
    editPhoto:  { borderRadius: 12, overflow: 'hidden' },
    nameRow:    { flexDirection: 'row', alignItems: 'center', gap: 6 },
    nameInput:  { fontSize: 15, fontWeight: '800', color: C.text, borderBottomWidth: 1.5, paddingVertical: 3, paddingHorizontal: 0 },
    noPhoto:    { width: 72, height: 48, alignItems: 'center', justifyContent: 'center' },
    editName:   { fontSize: 15, fontWeight: '800', color: C.text, flexShrink: 1 },
    renameRow:  { flexDirection: 'row', alignItems: 'center', gap: 6 },
    renameInput:{ flex: 1, fontSize: 15, fontWeight: '700', color: C.text, borderBottomWidth: 1.5, paddingVertical: 2 },
    editMuscle: { fontSize: 11, fontWeight: '800', marginTop: 3, letterSpacing: 0.5 },
    lastTxt:    { fontSize: 11, fontWeight: '600', color: C.muted, marginTop: 3 },
    dials:      { flexDirection: 'row', gap: 8, marginTop: 14, backgroundColor: C.bg, borderRadius: 18, borderWidth: 1, borderColor: C.border, paddingVertical: 10 },
    dial:       { flex: 1, alignItems: 'center' },
    dialLbl:    { fontSize: 11, fontWeight: '800', color: C.muted, marginBottom: 4, letterSpacing: 0.4 },
    stepper:    { flexDirection: 'row', alignItems: 'center', gap: 8, height: 102 },
    stepBtn:    { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: C.card, borderWidth: 1, borderColor: C.border },
    stepVal:    { fontSize: 24, fontWeight: '900', color: C.text, minWidth: 26, textAlign: 'center', fontVariant: ['tabular-nums'] },
    bwBox:      { height: 102, alignItems: 'center', justifyContent: 'center', gap: 4 },
    bwTxt:      { fontSize: 12, fontWeight: '800', color: C.textSub },
    summary:    { fontSize: 13, fontWeight: '700', color: C.textSub, textAlign: 'center', marginTop: 12 },
  });
}
