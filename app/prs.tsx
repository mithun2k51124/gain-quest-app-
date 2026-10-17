// app/prs.tsx — Personal Records: summary dashboard, pinned lifts, editable PR entries
import React, { useCallback, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl,
  TextInput, Modal, FlatList, KeyboardAvoidingView, Platform, useWindowDimensions,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Path, Line, Defs, LinearGradient, Stop, G } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import {
  getAllPRs, getAllExerciseNames, getAllPREntries, addPREntry, updatePREntry, deletePREntry,
  starPRExercise, unstarPRExercise, getStarredPRExercises,
  getCustomExercises, addCustomExercise, todayStr, toDateStr,
  PR, PREntry, CustomExercise, ExerciseKind,
} from '../db/database';
import { useTheme } from '../contexts/ThemeContext';
import { useCustomAlert } from '../contexts/AlertContext';
import { EXERCISE_LIBRARY, BODYWEIGHT_EXERCISES } from '../constants/theme';
import { WheelPicker } from '../components/WheelPicker';
import { ExerciseGuideButton } from '../components/ExerciseGuide';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MUSCLES = Object.keys(EXERCISE_LIBRARY);
const HIT = { top: 10, bottom: 10, left: 10, right: 10 };

// Library exercise → muscle group (first group wins for duplicates like Hammer Curl)
const LIB_MUSCLE: Record<string, string> = {};
Object.entries(EXERCISE_LIBRARY).forEach(([muscle, list]) =>
  list.forEach(ex => { if (!LIB_MUSCLE[ex]) LIB_MUSCLE[ex] = muscle; })
);

function calc1RM(weight: number, reps: number): number {
  return reps <= 1 ? weight : weight * (1 + reps / 30);
}
const fmtKg = (n: number) => String(Math.round(n * 10) / 10);
function fmtDate(s: string): string {
  const d = new Date(s + 'T00:00:00');
  if (isNaN(d.getTime())) return s;
  const yr = d.getFullYear() === new Date().getFullYear() ? '' : ` '${String(d.getFullYear()).slice(2)}`;
  return `${MONTHS[d.getMonth()]} ${d.getDate()}${yr}`;
}
// Wheel values: weight in whole kg 0–500, reps 1–200
const KG_ITEMS = Array.from({ length: 501 }, (_, i) => String(i));
const REP_ITEMS = Array.from({ length: 200 }, (_, i) => String(i + 1));
const clampReps = (n: number) => Math.min(200, Math.max(1, Math.round(n)));

function shiftDate(s: string, days: number): string {
  const d = new Date(s + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return toDateStr(d);
}

// ── Charts ───────────────────────────────────────────────────────────────────

/** Small sparkline for pinned cards. */
function Sparkline({ values, color, width, height, id, bg }: {
  values: number[]; color: string; width: number; height: number; id: string; bg: string;
}) {
  if (!values.length) return <View style={{ width, height }} />;
  const pad = 4;
  const min = Math.min(...values), max = Math.max(...values);
  const pts = values.map((v, i) => ({
    x: values.length === 1 ? width / 2 : pad + (i * (width - pad * 2)) / (values.length - 1),
    y: max === min ? height / 2 : pad + (1 - (v - min) / (max - min)) * (height - pad * 2),
  }));
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1];
  const area = `${line} L${last.x.toFixed(1)},${height} L${pts[0].x.toFixed(1)},${height} Z`;
  return (
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity={0.3} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      {values.length > 1 && <Path d={area} fill={`url(#${id})`} />}
      {values.length > 1 && (
        <Path d={line} stroke={color} strokeWidth={2.2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      )}
      <Circle cx={last.x} cy={last.y} r={3.5} fill={color} stroke={bg} strokeWidth={2} />
    </Svg>
  );
}

/** Interactive progress chart: touch or drag to inspect any entry. */
function EntryChart({ values, dates, bestIdx, selected, onSelect, color, width, height, C }: {
  values: number[]; dates: string[]; bestIdx: number; selected: number;
  onSelect: (i: number) => void; color: string; width: number; height: number; C: any;
}) {
  const padX = 14, padY = 14;
  const min = Math.min(...values), max = Math.max(...values);
  const pts = values.map((v, i) => ({
    x: values.length === 1 ? width / 2 : padX + (i * (width - padX * 2)) / (values.length - 1),
    y: max === min ? height / 2 : padY + (1 - (v - min) / (max - min)) * (height - padY * 2),
  }));
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const area = `${line} L${pts[pts.length - 1].x.toFixed(1)},${height} L${pts[0].x.toFixed(1)},${height} Z`;
  const sel = pts[selected];

  const pick = (x: number) => {
    let nearest = 0;
    pts.forEach((p, i) => { if (Math.abs(p.x - x) < Math.abs(pts[nearest].x - x)) nearest = i; });
    if (nearest !== selected) onSelect(nearest);
  };
  const mid = Math.floor((dates.length - 1) / 2);

  return (
    <View>
      <View
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderTerminationRequest={() => false}
        onResponderGrant={e => pick(e.nativeEvent.locationX)}
        onResponderMove={e => pick(e.nativeEvent.locationX)}
      >
        <Svg width={width} height={height}>
          <Defs>
            <LinearGradient id="entryArea" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={color} stopOpacity={0.28} />
              <Stop offset="1" stopColor={color} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          {pts.length > 1 && <Path d={area} fill="url(#entryArea)" />}
          {sel && <Line x1={sel.x} y1={0} x2={sel.x} y2={height} stroke={C.muted} strokeWidth={1} strokeDasharray="3,4" />}
          {pts.length > 1 && (
            <Path d={line} stroke={color} strokeWidth={2.4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          )}
          {pts.map((p, i) => (
            <Circle key={i} cx={p.x} cy={p.y}
              r={i === selected ? 7 : i === bestIdx ? 5 : 3.5}
              fill={i === bestIdx ? C.yellow : color}
              stroke={C.bg} strokeWidth={i === selected ? 3 : 2} />
          ))}
        </Svg>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6, paddingHorizontal: 4 }}>
        <Text style={{ fontSize: 10, color: C.muted, fontWeight: '700' }}>{fmtDate(dates[0])}</Text>
        {dates.length > 2 && <Text style={{ fontSize: 10, color: C.muted, fontWeight: '700' }}>{fmtDate(dates[mid])}</Text>}
        {dates.length > 1 && <Text style={{ fontSize: 10, color: C.muted, fontWeight: '700' }}>{fmtDate(dates[dates.length - 1])}</Text>}
      </View>
    </View>
  );
}

function Donut({ segments, size, stroke, track, children }: {
  segments: { key: string; value: number; color: string }[];
  size: number; stroke: number; track: string; children?: React.ReactNode;
}) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const total = segments.reduce((s, x) => s + x.value, 0);
  const arcs = segments.reduce<{ key: string; color: string; len: number; offset: number }[]>((acc, seg) => {
    const offset = acc.length ? acc[acc.length - 1].offset + acc[acc.length - 1].len : 0;
    return [...acc, { key: seg.key, color: seg.color, len: total ? (seg.value / total) * circ : 0, offset }];
  }, []);
  const gap = arcs.length > 1 ? 3 : 0;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={stroke} fill="none" />
        <G rotation={-90} origin={`${size / 2}, ${size / 2}`}>
          {arcs.map(a => (
            <Circle key={a.key} cx={size / 2} cy={size / 2} r={r} stroke={a.color} strokeWidth={stroke} fill="none"
              strokeDasharray={`${Math.max(a.len - gap, 0.5)} ${circ}`} strokeDashoffset={-a.offset} />
          ))}
        </G>
      </Svg>
      {children}
    </View>
  );
}

// ── Screen ───────────────────────────────────────────────────────────────────

type LogStep = 'pick' | 'create' | 'form';

export default function PRScreen() {
  const { showAlert } = useCustomAlert();
  const { C } = useTheme();
  const { width: SW } = useWindowDimensions();
  const styles = makeStyles(C);

  const [prs, setPrs]         = useState<PR[]>([]);
  const [entries, setEntries] = useState<PREntry[]>([]);
  const [pinned, setPinned]   = useState<string[]>([]);
  const [custom, setCustom]   = useState<CustomExercise[]>([]);
  const [logged, setLogged]   = useState<string[]>([]);
  const [query, setQuery]     = useState('');
  const [refresh, setRefresh] = useState(false);

  // Detail sheet
  const [detailEx, setDetailEx]   = useState<string | null>(null);
  const [selIdx, setSelIdx]       = useState(0);
  const [celebrate, setCelebrate] = useState<string | null>(null);

  // Log / edit sheet
  const [logOpen, setLogOpen]       = useState(false);
  const [step, setStep]             = useState<LogStep>('pick');
  const [editId, setEditId]         = useState<number | null>(null);
  const [pickSearch, setPickSearch] = useState('');
  const [logEx, setLogEx]           = useState('');
  const [newName, setNewName]       = useState('');
  const [newMuscle, setNewMuscle]   = useState(MUSCLES[0]);
  const [newKind, setNewKind]       = useState<ExerciseKind>('weight');
  const [date, setDate]             = useState(todayStr());
  const [weightKg, setWeightKg]     = useState(20);
  const [reps, setReps]             = useState(5);
  const [wheelKey, setWheelKey]     = useState(0); // remount wheels so they open at the prefilled value
  const [typing, setTyping]         = useState(false);
  const [weightText, setWeightText] = useState('');
  const [repsText, setRepsText]     = useState('');

  const load = useCallback(() => {
    setPrs(getAllPRs());
    setEntries(getAllPREntries());
    setPinned(getStarredPRExercises());
    setCustom(getCustomExercises());
    setLogged(getAllExerciseNames());
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  const onRefresh = () => { setRefresh(true); load(); setRefresh(false); };

  // ── Lookups ──
  const prMap = useMemo(() => Object.fromEntries(prs.map(p => [p.exercise_name, p])), [prs]);
  const customMap = useMemo(() => Object.fromEntries(custom.map(c => [c.name, c])), [custom]);
  const entriesByEx = useMemo(() => {
    const m: Record<string, PREntry[]> = {};
    entries.forEach(e => { (m[e.exercise_name] ??= []).push(e); });
    return m;
  }, [entries]);

  const muscleOf = (name: string) => customMap[name]?.muscle_group ?? LIB_MUSCLE[name] ?? 'Other';
  const colorOf = (name: string) => C.mg[muscleOf(name)] ?? C.muted;
  const repsOnly = (name: string) =>
    customMap[name] ? customMap[name].kind === 'reps' : BODYWEIGHT_EXERCISES.includes(name);
  const score = (name: string, w: number, r: number) => (repsOnly(name) ? r : calc1RM(w, r));
  const liftText = (name: string, w: number, r: number) => (repsOnly(name) ? `${r} reps` : `${fmtKg(w)} kg × ${r}`);
  const scoreText = (name: string, s: number) => (repsOnly(name) ? `${s} reps` : `e1RM ${fmtKg(s)}`);

  /** Big number + small suffix, e.g. "100" + " kg × 5" or "15" + " reps". */
  const BigLift = ({ name, w, r, size }: { name: string; w: number; r: number; size: number }) => (
    <Text style={{ fontSize: size, fontWeight: '800', color: C.text }}>
      {repsOnly(name) ? r : fmtKg(w)}
      <Text style={{ fontSize: Math.round(size * 0.48), color: C.muted, fontWeight: '700' }}>
        {repsOnly(name) ? ' reps' : ` kg × ${r}`}
      </Text>
    </Text>
  );

  const PinButton = ({ name, size = 34 }: { name: string; size?: number }) => {
    const on = pinned.includes(name);
    return (
      <TouchableOpacity onPress={() => togglePin(name)} hitSlop={HIT} activeOpacity={0.8}
        style={{
          width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center',
          backgroundColor: on ? C.accent : C.accent + '14', borderWidth: 1, borderColor: on ? C.accent : C.accent + '45',
        }}>
        <Ionicons name={on ? 'pin' : 'pin-outline'} size={Math.round(size * 0.52)} color={on ? '#fff' : C.accent} />
      </TouchableOpacity>
    );
  };

  // Every exercise the user can pick: lifts with a PR first, then everything else A–Z
  const allExercises = useMemo(() => {
    const names = new Set<string>([
      ...Object.values(EXERCISE_LIBRARY).flat(), ...custom.map(c => c.name), ...logged, ...prs.map(p => p.exercise_name),
    ]);
    return [...names].sort((a, b) => (prMap[a] ? 0 : 1) - (prMap[b] ? 0 : 1) || a.localeCompare(b));
  }, [custom, logged, prs, prMap]);

  const pinnedPRs = pinned.map(n => prMap[n]).filter(Boolean) as PR[];
  // Most recently logged first: the newest entry id per lift (ids grow with every save)
  const sortedPRs = useMemo(() => {
    const lastLogged = (name: string) => Math.max(0, ...(entriesByEx[name] ?? []).map(e => e.id));
    return [...prs].sort((a, b) => lastLogged(b.exercise_name) - lastLogged(a.exercise_name));
  }, [prs, entriesByEx]);
  const q = query.trim().toLowerCase();
  const searchResults = q ? sortedPRs.filter(p => p.exercise_name.toLowerCase().includes(q)) : sortedPRs;

  // PRs broken = entries that beat an earlier best for the same lift
  const broken = useMemo(() => {
    const thisMonth = todayStr().slice(0, 7);
    const lm = new Date(); lm.setDate(1); lm.setMonth(lm.getMonth() - 1);
    const lastMonth = toDateStr(lm).slice(0, 7);
    let now = 0, prev = 0;
    Object.entries(entriesByEx).forEach(([name, list]) => {
      let best = -Infinity;
      list.forEach(e => {
        const s = score(name, e.weight, e.reps);
        if (best > -Infinity && s > best) {
          if (e.entry_date.startsWith(thisMonth)) now++;
          else if (e.entry_date.startsWith(lastMonth)) prev++;
        }
        best = Math.max(best, s);
      });
    });
    return { now, prev };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entriesByEx, customMap]);

  // Donut: lifts per muscle group (top 4 + More)
  const muscleSegments = useMemo(() => {
    const counts: Record<string, number> = {};
    prs.forEach(p => { const m = muscleOf(p.exercise_name); counts[m] = (counts[m] ?? 0) + 1; });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const segs = sorted.slice(0, 4).map(([m, n]) => ({ key: m, value: n, color: C.mg[m] ?? C.muted }));
    const rest = sorted.slice(4).reduce((s, [, n]) => s + n, 0);
    if (rest) segs.push({ key: 'More', value: rest, color: C.muted });
    return segs;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prs, customMap, C]);

  const togglePin = (name: string) => {
    if (pinned.includes(name)) unstarPRExercise(name); else starPRExercise(name);
    setPinned(getStarredPRExercises());
  };

  // ── Detail ──
  const openDetail = (name: string, celebration: string | null = null) => {
    setSelIdx(Number.MAX_SAFE_INTEGER); // clamped below → newest entry
    setCelebrate(celebration);
    setDetailEx(name);
  };
  const detailPR = detailEx ? prMap[detailEx] : undefined;
  const detailEntries = detailEx ? entriesByEx[detailEx] ?? [] : [];
  const detailScores = detailEntries.map(e => score(detailEx!, e.weight, e.reps));
  const detailBestIdx = detailScores.reduce((bi, s, i) => (s > detailScores[bi] ? i : bi), 0);
  const sel = Math.min(selIdx, detailEntries.length - 1);
  const selEntry = detailEntries[sel];

  // ── Log / edit flow ──
  // Manual entry: typed values apply immediately; switching back re-centres the wheels on them
  const toggleTyping = () => {
    if (!typing) { setWeightText(fmtKg(weightKg)); setRepsText(String(reps)); }
    else { setWeightKg(w => Math.round(w)); setWheelKey(k => k + 1); } // the wheel is whole kg
    setTyping(t => !t);
  };
  const onWeightText = (t: string) => {
    setWeightText(t);
    const v = parseFloat(t.replace(',', '.'));
    if (!isNaN(v) && v >= 0) setWeightKg(Math.min(500, v));
  };
  const onRepsText = (t: string) => {
    setRepsText(t.replace(/[^0-9]/g, ''));
    const v = parseInt(t, 10);
    if (!isNaN(v) && v > 0) setReps(clampReps(v));
  };

  /** Start the wheels at the current best, so beating it is a small scroll away. */
  const chooseExercise = (name: string, kindOverride?: ExerciseKind) => {
    const pr = prMap[name];
    const reps0 = (kindOverride ?? (repsOnly(name) ? 'reps' : 'weight')) === 'reps' ? 10 : 5;
    setLogEx(name);
    setWeightKg(pr && pr.weight > 0 ? Math.min(500, Math.round(pr.weight)) : 20);
    setReps(clampReps(pr ? pr.reps : reps0));
    setWheelKey(k => k + 1);
    setStep('form');
  };

  const openLog = (exercise?: string, search = '') => {
    setEditId(null); setDate(todayStr()); setTyping(false);
    setNewName(''); setNewMuscle(MUSCLES[0]); setNewKind('weight');
    setPickSearch(search);
    if (exercise) chooseExercise(exercise); else setStep('pick');
    setDetailEx(null);
    setLogOpen(true);
  };
  const openEdit = (e: PREntry) => {
    setEditId(e.id); setLogEx(e.exercise_name); setDate(e.entry_date);
    setWeightKg(e.weight); setReps(clampReps(e.reps));
    // An older decimal weight (e.g. 102.5) can't sit on the whole-kg wheel, so open it in Type mode
    const decimal = !Number.isInteger(e.weight);
    setTyping(decimal);
    if (decimal) { setWeightText(fmtKg(e.weight)); setRepsText(String(clampReps(e.reps))); }
    setWheelKey(k => k + 1);
    setStep('form');
    setDetailEx(null);
    setLogOpen(true);
  };
  const closeLog = (returnTo?: string, celebration: string | null = null) => {
    setLogOpen(false);
    const back = returnTo ?? (editId != null ? logEx : undefined);
    if (back) setTimeout(() => openDetail(back, celebration), 250);
  };

  const pickMatches = useMemo(() => {
    const s = pickSearch.trim().toLowerCase();
    return s ? allExercises.filter(e => e.toLowerCase().includes(s)) : allExercises;
  }, [allExercises, pickSearch]);
  const canCreate = pickSearch.trim().length > 0 &&
    !allExercises.some(e => e.toLowerCase() === pickSearch.trim().toLowerCase());

  const createExercise = () => {
    const name = newName.trim().replace(/\s+/g, ' ');
    if (!name) { showAlert('Name needed', 'Give your exercise a name.'); return; }
    const existing = allExercises.find(e => e.toLowerCase() === name.toLowerCase());
    if (!existing) { addCustomExercise(name, newMuscle, newKind); setCustom(getCustomExercises()); }
    chooseExercise(existing ?? name, existing ? undefined : newKind);
  };

  const isReps = repsOnly(logEx);
  const w = isReps ? 0 : weightKg;
  const r = reps;
  const valid = (isReps || w > 0) && r > 0;
  const newScore = valid ? score(logEx, w, r) : 0;
  // Best of the other entries — the one being edited doesn't compete with itself
  const otherBest = (entriesByEx[logEx] ?? [])
    .filter(e => e.id !== editId)
    .reduce((b, e) => Math.max(b, score(logEx, e.weight, e.reps)), -Infinity);
  const hasBest = otherBest > -Infinity;
  const isNewPR = valid && (!hasBest || newScore > otherBest);
  const unitTxt = (n: number) => (isReps ? `${n} reps` : `${fmtKg(n)} kg`);

  const save = () => {
    if (!valid) { showAlert('Check your numbers', isReps ? 'Enter at least 1 rep.' : 'Enter a weight and at least 1 rep.'); return; }
    if (editId != null) {
      updatePREntry(editId, date, w, r);
    } else {
      addPREntry(logEx, date, w, r);
    }
    load();
    const msg = isNewPR && hasBest ? `New PR!  ▲ ${unitTxt(newScore - otherBest)}` : isNewPR && editId == null ? 'First PR logged!' : null;
    closeLog(logEx, msg);
  };

  const remove = () => {
    if (editId == null) return;
    showAlert('Delete entry?', `Remove this ${logEx} entry from ${fmtDate(date)}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => {
        deletePREntry(editId);
        load();
        const left = (entriesByEx[logEx] ?? []).filter(e => e.id !== editId).length;
        setLogOpen(false);
        if (left) setTimeout(() => openDetail(logEx), 250);
      } },
    ]);
  };

  const today = todayStr();

  // ── Rows ──
  const RecordRow = ({ pr }: { pr: PR }) => (
    <TouchableOpacity style={styles.row} onPress={() => openDetail(pr.exercise_name)} activeOpacity={0.75}>
      <View style={[styles.rowBar, { backgroundColor: colorOf(pr.exercise_name) }]} />
      <View style={{ flex: 1 }}>
        <Text style={styles.rowName} numberOfLines={1}>{pr.exercise_name}</Text>
        <Text style={styles.rowMeta}>
          {muscleOf(pr.exercise_name)} · {(entriesByEx[pr.exercise_name] ?? []).length} entries
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end', marginRight: 12 }}>
        <BigLift name={pr.exercise_name} w={pr.weight} r={pr.reps} size={16} />
        <Text style={styles.rowMeta}>{fmtDate(pr.record_date)}</Text>
      </View>
      <PinButton name={pr.exercise_name} size={34} />
    </TouchableOpacity>
  );

  const pinW = (SW - 32 - 10) / 2;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Personal Records</Text>
          <Text style={styles.subtitle}>{prs.length} lifts · {pinnedPRs.length} pinned</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={() => openLog()} activeOpacity={0.85}>
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={styles.addBtnTxt}>Log PR</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refresh} onRefresh={onRefresh} tintColor={C.accent} />}
      >
        <View style={styles.search}>
          <Ionicons name="search" size={17} color={C.muted} />
          <TextInput
            style={styles.searchInput} value={query} onChangeText={setQuery}
            placeholder="Search your records" placeholderTextColor={C.muted}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')} hitSlop={HIT}>
              <Ionicons name="close-circle" size={18} color={C.muted} />
            </TouchableOpacity>
          )}
        </View>

        {prs.length === 0 ? (
          <View style={[styles.card, styles.empty]}>
            <View style={styles.emptyIcon}><Ionicons name="trophy" size={28} color={C.yellow} /></View>
            <Text style={styles.emptyTitle}>No PRs yet</Text>
            <Text style={styles.emptySub}>Log your best lift to start your record board.</Text>
            <TouchableOpacity style={styles.primaryBtn} onPress={() => openLog()} activeOpacity={0.85}>
              <Text style={styles.primaryTxt}>Log your first PR</Text>
            </TouchableOpacity>
          </View>
        ) : q ? (
          <>
            <Text style={styles.section}>Results</Text>
            {searchResults.length ? (
              <View style={{ gap: 8 }}>{searchResults.map(pr => <RecordRow key={pr.exercise_name} pr={pr} />)}</View>
            ) : (
              <View style={[styles.card, styles.empty]}>
                <Text style={styles.emptySub}>No record for "{query.trim()}"</Text>
                <TouchableOpacity style={styles.primaryBtn} onPress={() => openLog(undefined, query.trim())} activeOpacity={0.85}>
                  <Text style={styles.primaryTxt}>Log a PR for "{query.trim()}"</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        ) : (
          <>
            {/* Summary */}
            <View style={styles.card}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Donut segments={muscleSegments} size={92} stroke={11} track={C.border}>
                  <Text style={styles.donutNum}>{prs.length}</Text>
                  <Text style={styles.donutLbl}>lifts</Text>
                </Donut>
                <View style={{ flex: 1, marginLeft: 18, gap: 7 }}>
                  {muscleSegments.map(s => (
                    <View key={s.key} style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <View style={[styles.dot, { backgroundColor: s.color }]} />
                      <Text style={styles.legendTxt} numberOfLines={1}>{s.key}</Text>
                      <Text style={styles.legendNum}>{s.value}</Text>
                    </View>
                  ))}
                </View>
              </View>
              <View style={styles.divider} />
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={styles.brokenIcon}><Ionicons name="trophy" size={18} color={C.yellow} /></View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.brokenNum}>{broken.now}</Text>
                  <Text style={styles.brokenLbl}>PRs broken this month</Text>
                </View>
                <View style={styles.lastMonth}>
                  <Text style={styles.lastMonthTxt}>Last month {broken.prev}</Text>
                </View>
              </View>
            </View>

            {/* Pinned */}
            <Text style={styles.section}>Pinned</Text>
            {pinnedPRs.length === 0 ? (
              <View style={styles.pinHint}>
                <Ionicons name="pin" size={18} color={C.accent} />
                <Text style={styles.pinHintTxt}>Tap the pin on any record to keep it here.</Text>
              </View>
            ) : (
              <View style={styles.pinGrid}>
                {pinnedPRs.map((pr, i) => {
                  const name = pr.exercise_name;
                  const list = entriesByEx[name] ?? [];
                  const scores = list.map(e => score(name, e.weight, e.reps));
                  const gain = scores.length > 1 ? Math.max(...scores) - scores[0] : 0;
                  return (
                    <TouchableOpacity key={name} style={[styles.pinCard, { width: pinW }]}
                      onPress={() => openDetail(name)} activeOpacity={0.8}>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <View style={[styles.dot, { backgroundColor: colorOf(name) }]} />
                        <Text style={styles.pinMuscle} numberOfLines={1}>{muscleOf(name)}</Text>
                        <PinButton name={name} size={30} />
                      </View>
                      <Text style={styles.pinName} numberOfLines={1}>{name}</Text>
                      <BigLift name={name} w={pr.weight} r={pr.reps} size={22} />
                      <View style={{ marginVertical: 8 }}>
                        <Sparkline values={scores} color={colorOf(name)} width={pinW - 28} height={34} id={`pin${i}`} bg={C.card} />
                      </View>
                      <Text style={styles.rowMeta}>
                        {repsOnly(name) ? `${list.length} entries` : `e1RM ${fmtKg(pr.one_rep_max)}`}
                        {gain > 0 && (
                          <Text style={{ color: C.green, fontWeight: '800' }}>
                            {'  '}▲ {repsOnly(name) ? `${gain} reps` : fmtKg(gain)}
                          </Text>
                        )}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* All */}
            <Text style={styles.section}>All records</Text>
            <View style={{ gap: 8 }}>{sortedPRs.map(pr => <RecordRow key={pr.exercise_name} pr={pr} />)}</View>
          </>
        )}
      </ScrollView>

      {/* ── Detail sheet ── */}
      <Modal visible={!!detailEx} transparent animationType="slide" onRequestClose={() => setDetailEx(null)}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setDetailEx(null)}>
          <TouchableOpacity activeOpacity={1} style={[styles.sheet, { maxHeight: '90%' }]} onPress={e => e.stopPropagation()}>
            <View style={styles.handle} />
            {detailEx && detailPR && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sheetTitle}>{detailEx}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                      <View style={[styles.dot, { backgroundColor: colorOf(detailEx) }]} />
                      <Text style={[styles.rowMeta, { marginTop: 0, marginRight: 10 }]}>{muscleOf(detailEx)} · {repsOnly(detailEx) ? 'Reps' : 'Weight × reps'}</Text>
                      <ExerciseGuideButton name={detailEx} color={colorOf(detailEx)} variant="pill" />
                    </View>
                  </View>
                  <TouchableOpacity onPress={() => togglePin(detailEx)} activeOpacity={0.85}
                    style={[styles.pinPill, pinned.includes(detailEx) && { backgroundColor: C.accent, borderColor: C.accent }]}>
                    <Ionicons name={pinned.includes(detailEx) ? 'pin' : 'pin-outline'} size={18}
                      color={pinned.includes(detailEx) ? '#fff' : C.accent} />
                    <Text style={[styles.pinPillTxt, pinned.includes(detailEx) && { color: '#fff' }]}>
                      {pinned.includes(detailEx) ? 'Pinned' : 'Pin'}
                    </Text>
                  </TouchableOpacity>
                </View>

                {celebrate && (
                  <View style={styles.celebrate}>
                    <Ionicons name="trophy" size={18} color={C.green} />
                    <Text style={styles.celebrateTxt}>{celebrate}</Text>
                  </View>
                )}

                <View style={styles.bestRow}>
                  <View>
                    <Text style={styles.cardLabel}>Best</Text>
                    <BigLift name={detailEx} w={detailPR.weight} r={detailPR.reps} size={28} />
                    <Text style={styles.rowMeta}>Set {fmtDate(detailPR.record_date)}</Text>
                  </View>
                  {!repsOnly(detailEx) && (
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={styles.cardLabel}>Est. 1RM</Text>
                      <Text style={[styles.bestNum, { color: C.accent }]}>
                        {fmtKg(detailPR.one_rep_max)}<Text style={styles.bestUnit}> kg</Text>
                      </Text>
                    </View>
                  )}
                </View>

                {/* Progress chart */}
                <View style={styles.chartBox}>
                  {selEntry && (
                    <View style={styles.chartTip}>
                      <Text style={styles.chartTipDate}>{fmtDate(selEntry.entry_date)}</Text>
                      <Text style={styles.chartTipVal}>{liftText(detailEx, selEntry.weight, selEntry.reps)}</Text>
                      {!repsOnly(detailEx) && (
                        <Text style={styles.chartTipSub}>{scoreText(detailEx, detailScores[sel] ?? 0)}</Text>
                      )}
                      {sel === detailBestIdx && <View style={styles.bestTag}><Text style={styles.bestTagTxt}>PR</Text></View>}
                    </View>
                  )}
                  {detailEntries.length > 1 ? (
                    <EntryChart
                      values={detailScores} dates={detailEntries.map(e => e.entry_date)}
                      bestIdx={detailBestIdx} selected={sel} onSelect={setSelIdx}
                      color={colorOf(detailEx)} width={SW - 40 - 26} height={140} C={C}
                    />
                  ) : (
                    <Text style={[styles.emptySub, { marginVertical: 26 }]}>Add another entry to see your progress line.</Text>
                  )}
                </View>
                {detailEntries.length > 1 && <Text style={styles.chartHint}>Touch or drag the chart to see each entry</Text>}

                {/* Entries */}
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 18, marginBottom: 4 }}>
                  <Text style={[styles.cardLabel, { flex: 1 }]}>Entries ({detailEntries.length})</Text>
                  <Text style={styles.rowMeta}>Tap to edit</Text>
                </View>
                {[...detailEntries].map((e, i) => ({ e, i })).reverse().map(({ e, i }) => (
                  <TouchableOpacity key={e.id} style={[styles.histRow, i === sel && { backgroundColor: C.accent + '10' }]}
                    onPress={() => openEdit(e)} activeOpacity={0.7}>
                    <Text style={styles.histDate}>{fmtDate(e.entry_date)}</Text>
                    <Text style={styles.histLift}>{liftText(detailEx, e.weight, e.reps)}</Text>
                    {i === detailBestIdx && <View style={[styles.bestTag, { marginRight: 8 }]}><Text style={styles.bestTagTxt}>PR</Text></View>}
                    <Ionicons name="create-outline" size={18} color={C.muted} />
                  </TouchableOpacity>
                ))}

                <TouchableOpacity style={[styles.primaryBtn, { alignSelf: 'stretch', marginTop: 18 }]}
                  onPress={() => openLog(detailEx)} activeOpacity={0.85}>
                  <Ionicons name="add" size={18} color="#fff" />
                  <Text style={styles.primaryTxt}>Add entry</Text>
                </TouchableOpacity>
              </ScrollView>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ── Log / edit sheet ── */}
      <Modal visible={logOpen} transparent animationType="slide" onRequestClose={() => closeLog()}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => closeLog()}>
            <TouchableOpacity activeOpacity={1} onPress={e => e.stopPropagation()}
              style={[styles.sheet, step === 'pick' && { height: '85%' }]}>
              <View style={styles.handle} />

              {step === 'pick' && (
                <View style={{ flex: 1 }}>
                  <Text style={[styles.sheetTitle, { marginBottom: 12 }]}>Choose exercise</Text>
                  <View style={[styles.search, { marginBottom: 8 }]}>
                    <Ionicons name="search" size={17} color={C.muted} />
                    <TextInput style={styles.searchInput} value={pickSearch} onChangeText={setPickSearch}
                      placeholder="Search or type a new exercise" placeholderTextColor={C.muted} autoFocus />
                    {pickSearch.length > 0 && (
                      <TouchableOpacity onPress={() => setPickSearch('')} hitSlop={HIT}>
                        <Ionicons name="close-circle" size={18} color={C.muted} />
                      </TouchableOpacity>
                    )}
                  </View>
                  <FlatList
                    data={pickMatches}
                    keyExtractor={item => item}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                    ListHeaderComponent={
                      <TouchableOpacity style={styles.createRow} activeOpacity={0.8}
                        onPress={() => { setNewName(pickSearch.trim()); setStep('create'); }}>
                        <View style={styles.createIcon}><Ionicons name="add" size={18} color={C.accent} /></View>
                        <Text style={styles.createTxt} numberOfLines={1}>
                          {canCreate ? `Create "${pickSearch.trim()}"` : 'Create your own exercise'}
                        </Text>
                      </TouchableOpacity>
                    }
                    renderItem={({ item }) => {
                      const pr = prMap[item];
                      return (
                        <TouchableOpacity style={styles.pickRow} activeOpacity={0.7}
                          onPress={() => chooseExercise(item)}>
                          <View style={[styles.dot, { backgroundColor: colorOf(item) }]} />
                          <Text style={styles.pickTxt} numberOfLines={1}>{item}</Text>
                          {pr ? <Text style={styles.pickBest}>{liftText(item, pr.weight, pr.reps)}</Text>
                              : repsOnly(item) && <Text style={styles.pickBest}>reps</Text>}
                          <ExerciseGuideButton name={item} color={colorOf(item)} />
                        </TouchableOpacity>
                      );
                    }}
                  />
                </View>
              )}

              {step === 'create' && (
                <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                  <View style={styles.sheetHead}>
                    <TouchableOpacity onPress={() => setStep('pick')} hitSlop={HIT} style={styles.iconBtn}>
                      <Ionicons name="arrow-back" size={18} color={C.text} />
                    </TouchableOpacity>
                    <Text style={[styles.sheetTitle, { marginLeft: 10 }]}>New exercise</Text>
                  </View>
                  <Text style={styles.label}>Name</Text>
                  <TextInput style={styles.input} value={newName} onChangeText={setNewName} autoFocus
                    placeholder="e.g. Weighted Pull Up" placeholderTextColor={C.muted} autoCapitalize="words" />
                  <Text style={styles.label}>Measured by</Text>
                  <View style={styles.segment}>
                    {([['weight', 'Weight × reps', 'barbell-outline'], ['reps', 'Reps only', 'body-outline']] as const).map(([k, lbl, icon]) => {
                      const on = newKind === k;
                      return (
                        <TouchableOpacity key={k} onPress={() => setNewKind(k)} activeOpacity={0.85}
                          style={[styles.segBtn, on && { backgroundColor: C.accent }]}>
                          <Ionicons name={icon} size={16} color={on ? '#fff' : C.muted} />
                          <Text style={[styles.segTxt, on && { color: '#fff' }]}>{lbl}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <Text style={styles.label}>Muscle group</Text>
                  <View style={styles.chips}>
                    {MUSCLES.map(m => {
                      const on = newMuscle === m;
                      const mc = C.mg[m] ?? C.accent;
                      return (
                        <TouchableOpacity key={m} onPress={() => setNewMuscle(m)} activeOpacity={0.8}
                          style={[styles.chip, on && { backgroundColor: mc + '22', borderColor: mc }]}>
                          <View style={[styles.dot, { backgroundColor: mc }]} />
                          <Text style={[styles.chipTxt, on && { color: C.text }]}>{m}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <TouchableOpacity style={[styles.primaryBtn, { alignSelf: 'stretch', marginTop: 20 }]} onPress={createExercise} activeOpacity={0.85}>
                    <Text style={styles.primaryTxt}>Continue</Text>
                  </TouchableOpacity>
                </ScrollView>
              )}

              {step === 'form' && (
                <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                  <View style={styles.sheetHead}>
                    <Text style={[styles.sheetTitle, { flex: 1 }]}>{editId != null ? 'Edit entry' : 'Log PR'}</Text>
                    {editId != null && (
                      <TouchableOpacity onPress={remove} hitSlop={HIT} style={[styles.iconBtn, { borderColor: C.red + '55' }]}>
                        <Ionicons name="trash-outline" size={18} color={C.red} />
                      </TouchableOpacity>
                    )}
                  </View>

                  <TouchableOpacity style={styles.exPill} disabled={editId != null}
                    onPress={() => setStep('pick')} activeOpacity={0.8}>
                    <View style={[styles.dot, { backgroundColor: colorOf(logEx) }]} />
                    <Text style={styles.exPillTxt} numberOfLines={1}>{logEx}</Text>
                    {editId == null && <Text style={styles.exPillChange}>Change</Text>}
                  </TouchableOpacity>

                  <Text style={styles.label}>Date</Text>
                  <View style={styles.dateRow}>
                    <TouchableOpacity onPress={() => setDate(shiftDate(date, -1))} hitSlop={HIT} style={styles.stepBtn}>
                      <Ionicons name="chevron-back" size={18} color={C.text} />
                    </TouchableOpacity>
                    <TouchableOpacity style={{ flex: 1 }} onPress={() => setDate(today)} activeOpacity={0.7}>
                      <Text style={styles.dateTxt}>{date === today ? `Today, ${fmtDate(date)}` : fmtDate(date)}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setDate(shiftDate(date, 1))} disabled={date >= today} hitSlop={HIT}
                      style={[styles.stepBtn, date >= today && { opacity: 0.3 }]}>
                      <Ionicons name="chevron-forward" size={18} color={C.text} />
                    </TouchableOpacity>
                  </View>

                  <View style={styles.wheelHead}>
                    <Text style={[styles.label, { marginTop: 0, marginBottom: 0, flex: 1 }]}>
                      {isReps ? 'Max reps' : 'Weight × reps'}
                    </Text>
                    <TouchableOpacity style={styles.modePill} onPress={toggleTyping} hitSlop={HIT} activeOpacity={0.8}>
                      <Ionicons name={typing ? 'options-outline' : 'keypad-outline'} size={14} color={C.accent} />
                      <Text style={styles.modePillTxt}>{typing ? 'Wheel' : 'Type'}</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.wheelCard}>
                    {typing ? (
                      <>
                        {!isReps && (
                          <>
                            <TextInput style={styles.typeInput} value={weightText} onChangeText={onWeightText}
                              keyboardType="decimal-pad" maxLength={6} selectTextOnFocus autoFocus placeholder="0" placeholderTextColor={C.muted} />
                            <Text style={styles.wheelUnit}>kg</Text>
                            <Text style={styles.wheelTimes}>×</Text>
                          </>
                        )}
                        <TextInput style={styles.typeInput} value={repsText} onChangeText={onRepsText}
                          keyboardType="number-pad" maxLength={3} selectTextOnFocus autoFocus={isReps} placeholder="0" placeholderTextColor={C.muted} />
                        <Text style={styles.wheelUnit}>reps</Text>
                      </>
                    ) : (
                      <>
                        {!isReps && (
                          <>
                            <WheelPicker key={`kg-${wheelKey}`} items={KG_ITEMS} width={66}
                              index={Math.round(weightKg)} onChange={setWeightKg} />
                            <Text style={styles.wheelUnit}>kg</Text>
                            <Text style={styles.wheelTimes}>×</Text>
                          </>
                        )}
                        <WheelPicker key={`rp-${wheelKey}`} items={REP_ITEMS} width={isReps ? 80 : 52}
                          index={reps - 1} onChange={i => setReps(i + 1)} />
                        <Text style={styles.wheelUnit}>reps</Text>
                      </>
                    )}
                  </View>

                  <View style={[styles.preview, isNewPR && { borderColor: C.green + '66', backgroundColor: C.green + '14' }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cardLabel}>{isReps ? 'Reps' : 'Estimated 1RM'}</Text>
                      <Text style={[styles.previewNum, isNewPR && { color: C.green }]}>{valid ? unitTxt(newScore) : '—'}</Text>
                    </View>
                    <Text style={[styles.previewNote, isNewPR && { color: C.green }]}>
                      {!valid ? (hasBest ? `Best: ${unitTxt(otherBest)}` : 'First entry for this lift')
                        : !hasBest ? 'First PR!'
                        : isNewPR ? `▲ ${unitTxt(newScore - otherBest)}  New PR!`
                        : `Best is ${unitTxt(otherBest)}`}
                    </Text>
                  </View>

                  <TouchableOpacity style={[styles.primaryBtn, { alignSelf: 'stretch', marginTop: 16 }, !valid && { opacity: 0.5 }]}
                    onPress={save} activeOpacity={0.85}>
                    <Ionicons name={editId != null ? 'checkmark' : 'trophy'} size={16} color="#fff" />
                    <Text style={styles.primaryTxt}>{editId != null ? 'Save changes' : 'Save entry'}</Text>
                  </TouchableOpacity>
                </ScrollView>
              )}
            </TouchableOpacity>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

function makeStyles(C: any) {
  return StyleSheet.create({
    safe:        { flex: 1, backgroundColor: C.bg },
    header:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 10, paddingBottom: 12 },
    title:       { fontSize: 24, fontWeight: '800', color: C.text, letterSpacing: -0.3 },
    subtitle:    { fontSize: 12, color: C.muted, marginTop: 2, fontWeight: '600' },
    addBtn:      { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.accent, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10 },
    addBtnTxt:   { color: '#fff', fontWeight: '800', fontSize: 13 },
    scroll:      { paddingHorizontal: 16, paddingBottom: 120 },

    search:      { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.card, borderRadius: 14, paddingHorizontal: 12, borderWidth: 1, borderColor: C.border, marginBottom: 14 },
    searchInput: { flex: 1, paddingVertical: 11, fontSize: 14, color: C.text, fontWeight: '600' },

    card:        { backgroundColor: C.card, borderRadius: 20, padding: 16, borderWidth: 1, borderColor: C.border },
    cardLabel:   { fontSize: 11, fontWeight: '800', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.7 },
    divider:     { height: 1, backgroundColor: C.border, marginVertical: 14 },
    section:     { fontSize: 12, fontWeight: '800', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 22, marginBottom: 10 },

    donutNum:    { fontSize: 22, fontWeight: '800', color: C.text },
    donutLbl:    { fontSize: 10, color: C.muted, fontWeight: '700', marginTop: -2 },
    dot:         { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
    legendTxt:   { flex: 1, fontSize: 13, color: C.textSub, fontWeight: '600' },
    legendNum:   { fontSize: 13, color: C.text, fontWeight: '800' },
    brokenIcon:  { width: 40, height: 40, borderRadius: 13, backgroundColor: C.yellow + '22', alignItems: 'center', justifyContent: 'center' },
    brokenNum:   { fontSize: 22, fontWeight: '800', color: C.text, lineHeight: 26 },
    brokenLbl:   { fontSize: 12, color: C.muted, fontWeight: '700' },
    lastMonth:   { backgroundColor: C.bg, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: C.border },
    lastMonthTxt:{ fontSize: 11, color: C.muted, fontWeight: '700' },

    pinHint:     { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderStyle: 'dashed', borderColor: C.accent + '55', borderRadius: 16, padding: 14 },
    pinHintTxt:  { fontSize: 13, color: C.textSub, fontWeight: '600', flex: 1 },
    pinGrid:     { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    pinCard:     { backgroundColor: C.card, borderRadius: 18, padding: 14, borderWidth: 1, borderColor: C.border },
    pinMuscle:   { flex: 1, fontSize: 11, color: C.muted, fontWeight: '700' },
    pinName:     { fontSize: 14, color: C.text, fontWeight: '800', marginTop: 8, marginBottom: 2 },
    pinPill:     { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20, borderWidth: 1, borderColor: C.accent + '55', backgroundColor: C.accent + '14' },
    pinPillTxt:  { fontSize: 13, fontWeight: '800', color: C.accent },

    row:         { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: 16, paddingVertical: 12, paddingRight: 12, paddingLeft: 14, borderWidth: 1, borderColor: C.border },
    rowBar:      { width: 4, height: 30, borderRadius: 2, marginRight: 12 },
    rowName:     { fontSize: 14, fontWeight: '700', color: C.text },
    rowMeta:     { fontSize: 11, color: C.muted, fontWeight: '600', marginTop: 2 },

    empty:       { alignItems: 'center', paddingVertical: 30 },
    emptyIcon:   { width: 56, height: 56, borderRadius: 18, backgroundColor: C.yellow + '22', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
    emptyTitle:  { fontSize: 17, fontWeight: '800', color: C.text },
    emptySub:    { fontSize: 13, color: C.muted, textAlign: 'center', marginTop: 4, lineHeight: 19 },
    primaryBtn:  { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: C.accent, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 20, marginTop: 16 },
    primaryTxt:  { color: '#fff', fontWeight: '800', fontSize: 15 },

    overlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
    sheet:       { backgroundColor: C.card, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: 32, borderWidth: 1, borderColor: C.border },
    handle:      { width: 40, height: 5, backgroundColor: C.border, borderRadius: 3, alignSelf: 'center', marginBottom: 16 },
    sheetHead:   { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
    sheetTitle:  { fontSize: 20, fontWeight: '800', color: C.text },
    iconBtn:     { width: 36, height: 36, borderRadius: 12, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border },

    celebrate:   { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.green + '18', borderColor: C.green + '55', borderWidth: 1, borderRadius: 14, padding: 12, marginTop: 14 },
    celebrateTxt:{ fontSize: 14, fontWeight: '800', color: C.green },
    bestRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 16 },
    bestNum:     { fontSize: 28, fontWeight: '800', color: C.text, marginTop: 2 },
    bestUnit:    { fontSize: 13, color: C.muted, fontWeight: '700' },
    chartBox:    { backgroundColor: C.bg, borderRadius: 16, padding: 12, marginTop: 16, borderWidth: 1, borderColor: C.border },
    chartTip:    { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8, paddingHorizontal: 2 },
    chartTipDate:{ fontSize: 12, fontWeight: '800', color: C.muted },
    chartTipVal: { fontSize: 15, fontWeight: '800', color: C.text },
    chartTipSub: { fontSize: 12, fontWeight: '700', color: C.accent },
    chartHint:   { fontSize: 11, color: C.muted, textAlign: 'center', marginTop: 6, fontWeight: '600' },
    bestTag:     { backgroundColor: C.yellow + '26', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 },
    bestTagTxt:  { fontSize: 10, fontWeight: '800', color: C.yellow },
    histRow:     { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 6, borderRadius: 10, borderBottomWidth: 1, borderBottomColor: C.border },
    histDate:    { width: 76, fontSize: 13, color: C.muted, fontWeight: '600' },
    histLift:    { flex: 1, fontSize: 14, color: C.text, fontWeight: '700' },

    createRow:   { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, marginBottom: 4 },
    createIcon:  { width: 30, height: 30, borderRadius: 10, backgroundColor: C.accentDim, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
    createTxt:   { flex: 1, fontSize: 14, color: C.accent, fontWeight: '800' },
    pickRow:     { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: C.border },
    pickTxt:     { flex: 1, fontSize: 15, color: C.text, fontWeight: '600' },
    pickBest:    { fontSize: 12, color: C.muted, fontWeight: '700' },

    label:       { fontSize: 11, fontWeight: '800', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 14, marginBottom: 6 },
    input:       { backgroundColor: C.bg, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 13, fontSize: 16, fontWeight: '700', color: C.text, borderWidth: 1, borderColor: C.border },
    segment:     { flexDirection: 'row', backgroundColor: C.bg, borderRadius: 14, padding: 4, borderWidth: 1, borderColor: C.border },
    segBtn:      { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10 },
    segTxt:      { fontSize: 13, fontWeight: '800', color: C.muted },
    chips:       { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: C.border, backgroundColor: C.bg },
    chipTxt:     { fontSize: 13, color: C.muted, fontWeight: '700' },

    exPill:      { flexDirection: 'row', alignItems: 'center', backgroundColor: C.bg, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 13, borderWidth: 1, borderColor: C.border },
    exPillTxt:   { flex: 1, fontSize: 15, fontWeight: '800', color: C.text },
    exPillChange:{ fontSize: 12, fontWeight: '800', color: C.accent },
    dateRow:     { flexDirection: 'row', alignItems: 'center', backgroundColor: C.bg, borderRadius: 14, borderWidth: 1, borderColor: C.border, paddingHorizontal: 6, paddingVertical: 8 },
    dateTxt:     { textAlign: 'center', fontSize: 15, fontWeight: '800', color: C.text },
    stepBtn:     { width: 32, height: 32, borderRadius: 10, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' },
    wheelHead:   { flexDirection: 'row', alignItems: 'center', marginTop: 14, marginBottom: 6 },
    modePill:    { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, backgroundColor: C.accent + '14', borderWidth: 1, borderColor: C.accent + '40' },
    modePillTxt: { fontSize: 12, fontWeight: '800', color: C.accent },
    wheelCard:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2, height: 116, backgroundColor: C.bg, borderRadius: 16, borderWidth: 1, borderColor: C.border },
    wheelUnit:   { fontSize: 13, fontWeight: '800', color: C.muted, marginLeft: 2 },
    wheelTimes:  { fontSize: 16, fontWeight: '800', color: C.muted, marginHorizontal: 8 },
    typeInput:   { minWidth: 70, textAlign: 'center', fontSize: 22, fontWeight: '800', color: C.text, backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.accent + '55', paddingVertical: 8, paddingHorizontal: 10 },
    preview:     { flexDirection: 'row', alignItems: 'center', backgroundColor: C.bg, borderRadius: 16, padding: 14, marginTop: 16, borderWidth: 1, borderColor: C.border },
    previewNum:  { fontSize: 22, fontWeight: '800', color: C.text, marginTop: 2 },
    previewNote: { fontSize: 12, fontWeight: '800', color: C.muted, textAlign: 'right', maxWidth: '55%' },
  });
}
