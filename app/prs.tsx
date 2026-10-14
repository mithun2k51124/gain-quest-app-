// app/prs.tsx — Personal Records Screen (Redesigned)
import React, { useCallback, useRef, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  RefreshControl, Dimensions, TextInput, Modal, FlatList, Animated,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { VictoryChart, VictoryScatter, VictoryAxis, VictoryArea, VictoryLabel } from 'victory-native';
import {
  getAllPRs, getAllExerciseNames,
  getPRProgressionHistory, logPRManually, getPRDates,
  getRecentPRHistory, getPRsForDate, todayStr,
  starPRExercise, unstarPRExercise, getStarredPRExercises,
  PR, PRProgressionEntry,
} from '../db/database';
import { Card, SectionHeader, EmptyState, Btn } from '../components/ui';
import { useTheme } from '../contexts/ThemeContext';
import { useCustomAlert } from '../contexts/AlertContext';
import { EXERCISE_LIBRARY, FEATURED_EXERCISES } from '../constants/theme';
import { Ionicons } from '@expo/vector-icons';

const { width: SW } = Dimensions.get('window');
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAY_LABELS = ['S','M','T','W','T','F','S'];
const MUSCLE_CATEGORIES = ['All', 'Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Legs', 'Core'] as const;
type MuscleCategory = typeof MUSCLE_CATEGORIES[number];

const EXERCISE_MUSCLE_MAP: Record<string, MuscleCategory> = {};
Object.entries(EXERCISE_LIBRARY).forEach(([muscle, exercises]) => {
  exercises.forEach(ex => {
    const cat = muscle === 'Back' ? 'Back' : muscle as MuscleCategory;
    EXERCISE_MUSCLE_MAP[ex] = cat;
  });
});

const RPE_OPTIONS = [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10];
const QUICK_EXERCISES = ['Bench Press', 'Squat', 'Deadlift', 'Overhead Press', 'Pull Up', 'Barbell Row', 'Dip'];

function calc1RM(weight: number, reps: number): number {
  return reps === 1 ? weight : weight * (1 + reps / 30);
}
function fmtDate(s: string): string {
  try { const d = new Date(s + 'T00:00:00'); return `${MONTHS[d.getMonth()]} ${d.getDate()}`; } catch { return s; }
}
function getBadge(oneRM: number): { label: string; color: string } | null {
  if (oneRM >= 200) return { label: '🏅 200kg Club', color: '#FBBF24' };
  if (oneRM >= 150) return { label: '💪 150kg Club', color: '#A855F7' };
  if (oneRM >= 100) return { label: '💯 100kg Club', color: '#3B82F6' };
  if (oneRM >= 80)  return { label: '🔥 Elite', color: '#EF4444' };
  if (oneRM >= 60)  return { label: '⚡ Advanced', color: '#F97316' };
  return null;
}

function TrophyChip({ label, color }: { label: string; color: string }) {
  const scale = useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, tension: 120, friction: 7 }).start();
  }, []);
  return (
    <Animated.View style={[{ transform: [{ scale }] }, { backgroundColor: color + '22', borderRadius: 20,
      paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: color + '55', marginTop: 4, alignSelf: 'flex-start' }]}>
      <Text style={{ fontSize: 11, fontWeight: '800', color }}>{label}</Text>
    </Animated.View>
  );
}

function PRCalendarStrip({ C, selectedDay, onSelectDay, prDates }: {
  C: any; selectedDay: string; onSelectDay: (d: string) => void; prDates: string[];
}) {
  const activeSet = new Set(prDates);
  const today = todayStr();
  const getWeekDays = (ds: string) => {
    try {
      const d = new Date(ds + 'T00:00:00'); const dow = d.getDay();
      return Array.from({ length: 7 }, (_, i) => { const nd = new Date(d); nd.setDate(d.getDate() + (i - dow)); return nd.toISOString().slice(0, 10); });
    } catch { return [ds]; }
  };
  const weekDays = getWeekDays(selectedDay);
  const shiftDay = (delta: number) => {
    try { const d = new Date(selectedDay + 'T00:00:00'); d.setDate(d.getDate() + delta); onSelectDay(d.toISOString().slice(0, 10)); } catch {}
  };
  return (
    <View style={{ backgroundColor: C.card, borderRadius: 20, marginBottom: 12, borderWidth: 1, borderColor: C.border, overflow: 'hidden' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 }}>
        <TouchableOpacity onPress={() => shiftDay(-7)} style={{ padding: 6 }}>
          <Ionicons name="chevron-back" size={18} color={C.muted} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => onSelectDay(today)} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <Ionicons name="trophy-outline" size={13} color={C.accent} />
          <Text style={{ fontSize: 13, fontWeight: '700', color: C.accent }}>{selectedDay === today ? 'Today' : fmtDate(selectedDay)}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => shiftDay(7)} style={{ padding: 6 }}>
          <Ionicons name="chevron-forward" size={18} color={C.muted} />
        </TouchableOpacity>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: 8, paddingBottom: 12 }}>
        {DAY_LABELS.map((lbl, i) => {
          const dd = weekDays[i]; if (!dd) return null;
          const isSel = dd === selectedDay, isToday = dd === today, has = activeSet.has(dd);
          return (
            <TouchableOpacity key={dd} onPress={() => onSelectDay(dd)}
              style={{ alignItems: 'center', paddingVertical: 6, paddingHorizontal: 4, borderRadius: 14, backgroundColor: isSel ? C.accent : 'transparent', minWidth: 38 }}>
              <Text style={{ fontSize: 10, fontWeight: '700', color: isSel ? '#fff' : i === 0 ? C.red : C.muted, marginBottom: 4 }}>{lbl}</Text>
              <View style={{ width: 28, height: 28, borderRadius: 14, borderWidth: has ? 2 : 1,
                borderColor: has ? C.yellow : isSel ? 'transparent' : C.border,
                backgroundColor: (has && !isSel) ? C.yellow + '22' : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                {has ? <Ionicons name="trophy" size={11} color={isSel ? '#fff' : C.yellow} />
                     : <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: (isToday && !isSel) ? C.accent : 'transparent' }} />}
              </View>
              <Text style={{ fontSize: 12, fontWeight: (isSel || isToday) ? '800' : '500', color: isSel ? '#fff' : isToday ? C.accent : C.textSub, marginTop: 3 }}>
                {parseInt(dd.slice(8), 10)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

function StatBox({ value, label, color, C }: { value: string; label: string; color: string; C: any }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', backgroundColor: C.card, borderRadius: 16, paddingVertical: 14, borderWidth: 1, borderColor: C.border }}>
      <Text style={{ fontSize: 20, fontWeight: '800', color }}>{value}</Text>
      <Text style={{ fontSize: 10, color: C.muted, marginTop: 2, fontWeight: '600' }}>{label}</Text>
    </View>
  );
}

export default function PRScreen() {
  const { showAlert } = useCustomAlert();
  const { C, isDark } = useTheme();
  const styles = makeStyles(C, isDark);

  const [prs, setPrs]               = useState<PR[]>([]);
  const [starred, setStarred]       = useState<string[]>([]);
  const [recentHistory, setRecent]  = useState<(PRProgressionEntry & { one_rep_max?: number })[]>([]);
  const [prDates, setPrDates]       = useState<string[]>([]);
  const [selDay, setSelDay]         = useState(todayStr());
  const [dayPRs, setDayPRs]         = useState<(PRProgressionEntry & { one_rep_max?: number })[]>([]);
  const [exNames, setExNames]       = useState<string[]>([]);
  const [refresh, setRefresh]       = useState(false);
  const [activeTab, setActiveTab]   = useState<'overview' | 'history' | 'chart'>('overview');
  const [categoryFilter, setCategoryFilter] = useState<MuscleCategory>('All');
  const [selEx, setSelEx]           = useState('');
  const [history, setHistory]       = useState<PRProgressionEntry[]>([]);
  const [allPRsModal, setAllPRsModal]           = useState(false);
  const [logModal, setLogModal]                 = useState(false);
  const [chartPickerModal, setChartPickerModal] = useState(false);
  const [pickingForLog, setPickingForLog]       = useState(false);
  const [exSearch, setExSearch]                 = useState('');
  const [logEx, setLogEx]       = useState('Bench Press');
  const [customEx, setCustomEx] = useState('');
  const [useCustom, setUseCustom] = useState(false);
  const [logWeight, setLogWeight] = useState('');
  const [logSets, setLogSets]   = useState('3');
  const [logReps, setLogReps]   = useState('1');
  const [logUnit, setLogUnit]   = useState<'kg' | 'lbs'>('kg');
  const [logRpe, setLogRpe]     = useState<number | null>(null);
  const [logNotes, setLogNotes] = useState('');

  const load = useCallback(() => {
    const allPRs = getAllPRs();
    setPrs(allPRs);
    const starredList = getStarredPRExercises();
    setStarred(starredList);
    setPrDates(getPRDates());
    setRecent(getRecentPRHistory(12));
    setDayPRs(getPRsForDate(selDay));
    const currentSel = selEx;
    const chartEx = currentSel && allPRs.find(p => p.exercise_name === currentSel)
      ? currentSel : starredList[0] || (allPRs[0]?.exercise_name ?? '');
    if (chartEx && chartEx !== currentSel) { setSelEx(chartEx); setHistory(getPRProgressionHistory(chartEx)); }
    else if (currentSel) { setHistory(getPRProgressionHistory(currentSel)); }
    const names = getAllExerciseNames();
    const libNames = Object.values(EXERCISE_LIBRARY).flat();
    const combined = [...libNames, ...names.filter(n => !libNames.includes(n))];
    setExNames([...new Set(combined)]);
  }, [selEx, selDay]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  const onRefresh = () => { setRefresh(true); load(); setRefresh(false); };
  const onSelectDay = (day: string) => { setSelDay(day); setDayPRs(getPRsForDate(day)); };
  const toggleStar = (name: string) => {
    if (starred.includes(name)) unstarPRExercise(name); else starPRExercise(name);
    setStarred(getStarredPRExercises());
  };
  const selectChart = (name: string) => {
    setSelEx(name); setHistory(getPRProgressionHistory(name)); setActiveTab('chart');
  };

  const prMap = Object.fromEntries(prs.map(p => [p.exercise_name, p]));
  const chartData = history.map((h, i) => ({ x: i + 1, y: parseFloat(calc1RM(h.weight, h.reps).toFixed(1)), weight: h.weight, reps: h.reps, date: h.session_date }));
  const maxPoint = chartData.length ? chartData.reduce((a, b) => a.y > b.y ? a : b) : null;
  const effectiveEx = useCustom ? customEx.trim() : logEx;

  const handleLogPR = () => {
    const exName = effectiveEx;
    const w = parseFloat(logWeight), s = parseInt(logSets, 10), r = parseInt(logReps, 10);
    if (!exName)            { showAlert('Error', 'Please select or enter an exercise.'); return; }
    if (isNaN(w) || w <= 0) { showAlert('Error', 'Enter a valid weight.'); return; }
    if (isNaN(s) || s <= 0) { showAlert('Error', 'Enter valid sets.'); return; }
    if (isNaN(r) || r <= 0) { showAlert('Error', 'Enter valid reps.'); return; }
    const e1rm = calc1RM(w, r);
    const existing = prMap[exName];
    if (existing && e1rm <= existing.one_rep_max) {
      showAlert('Not a New PR', `Your current e1RM for ${exName} is ${existing.one_rep_max.toFixed(1)} kg.\nThis attempt is ${e1rm.toFixed(1)} kg — log anyway?`,
        [{ text: 'Cancel', style: 'cancel' }, { text: 'Log Anyway', onPress: () => { logPRManually(exName, s, r, w, logUnit); resetLogForm(); load(); selectChart(exName); } }]);
      return;
    }
    logPRManually(exName, s, r, w, logUnit);
    const badge = getBadge(e1rm);
    const rpePart = logRpe ? `\nRPE: ${logRpe}` : '';
    const notesPart = logNotes.trim() ? `\n"${logNotes.trim()}"` : '';
    resetLogForm(); load(); selectChart(exName);
    showAlert(badge ? `New PR! 🏆 ${badge.label}` : 'New PR! 🏆',
      `${exName}\n${w}${logUnit} × ${r} rep${r !== 1 ? 's' : ''} × ${s} set${s !== 1 ? 's' : ''}\ne1RM: ${e1rm.toFixed(1)} kg${rpePart}${notesPart}`);
  };

  const resetLogForm = () => {
    setLogModal(false); setLogWeight(''); setLogSets('3'); setLogReps('1');
    setUseCustom(false); setCustomEx(''); setPickingForLog(false); setExSearch('');
    setLogRpe(null); setLogNotes('');
  };
  const openLogFor = (exName: string) => { setLogEx(exName); setUseCustom(false); setLogModal(true); };

  const starredPRs = starred.map(n => prMap[n]).filter(Boolean);
  const filteredPRs = categoryFilter === 'All' ? prs : prs.filter(p => EXERCISE_MUSCLE_MAP[p.exercise_name] === categoryFilter);
  const totalPRs = prs.length;
  const bestE1RM = prs.length ? Math.max(...prs.map(p => p.one_rep_max)).toFixed(1) : '—';
  const starredCount = starred.length;

  const TABS = [
    { id: 'overview', label: 'Overview', icon: 'trophy-outline' },
    { id: 'history',  label: 'History',  icon: 'calendar-outline' },
    { id: 'chart',    label: 'Chart',    icon: 'stats-chart-outline' },
  ] as const;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Personal Records</Text>
          <Text style={styles.headerSub}>{totalPRs} lifts tracked · Epley e1RM</Text>
        </View>
        <TouchableOpacity style={styles.logBtn} onPress={() => setLogModal(true)} activeOpacity={0.85}>
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={styles.logBtnText}>Log PR</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.tabBar}>
        {TABS.map(tab => (
          <TouchableOpacity key={tab.id} style={[styles.tabItem, activeTab === tab.id && styles.tabActive]}
            onPress={() => setActiveTab(tab.id)} activeOpacity={0.8}>
            <Ionicons name={tab.icon as any} size={16} color={activeTab === tab.id ? C.accent : C.muted} />
            <Text style={[styles.tabLabel, activeTab === tab.id && { color: C.accent }]}>{tab.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refresh} onRefresh={onRefresh} tintColor={C.accent} />}
        showsVerticalScrollIndicator={false}>

        {activeTab === 'overview' && (
          <>
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
              <StatBox value={String(totalPRs)} label="Total PRs" color={C.accent} C={C} />
              <StatBox value={`${bestE1RM}kg`} label="Best e1RM" color={C.yellow} C={C} />
              <StatBox value={String(starredCount)} label="Pinned" color={C.purple} C={C} />
            </View>

            <View style={styles.quickSection}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <Text style={styles.sectionTitle}>Quick Log</Text>
                <TouchableOpacity onPress={() => { setPickingForLog(false); setLogModal(true); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text style={{ fontSize: 12, color: C.accent, fontWeight: '700' }}>Custom</Text>
                  <Ionicons name="chevron-forward" size={14} color={C.accent} />
                </TouchableOpacity>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingBottom: 4 }}>
                {QUICK_EXERCISES.map(ex => {
                  const pr = prMap[ex];
                  const feat = FEATURED_EXERCISES.find(f => f.name === ex);
                  const color = feat?.color || C.accent;
                  return (
                    <TouchableOpacity key={ex} style={[styles.quickChip, { borderColor: color + '55', backgroundColor: color + '11' }]}
                      onPress={() => openLogFor(ex)} activeOpacity={0.8}>
                      <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: color + '22', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
                        <Ionicons name="barbell-outline" size={17} color={color} />
                      </View>
                      <Text style={{ fontSize: 11, fontWeight: '800', color: C.text, textAlign: 'center', maxWidth: 82 }} numberOfLines={2}>{ex}</Text>
                      {pr ? <Text style={{ fontSize: 10, color, fontWeight: '700', marginTop: 4 }}>{pr.weight}{pr.unit}×{pr.reps}</Text>
                           : <Text style={{ fontSize: 10, color: C.muted, marginTop: 4 }}>No PR yet</Text>}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <SectionHeader title="Pinned PRs" />
              <TouchableOpacity onPress={() => setAllPRsModal(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingRight: 16 }}>
                <Text style={{ fontSize: 12, color: C.accent, fontWeight: '700' }}>See All ({prs.length})</Text>
              </TouchableOpacity>
            </View>

            {starredPRs.length === 0 ? (
              <Card accent={C.accent}>
                <View style={{ alignItems: 'center', paddingVertical: 26, paddingHorizontal: 20 }}>
                  <Ionicons name="star-outline" size={36} color={C.muted} />
                  <Text style={[styles.emptyTitle, { marginTop: 10 }]}>No pinned exercises</Text>
                  <Text style={styles.emptySub}>Tap "See All" then ⭐ to pin your favourite lifts</Text>
                </View>
              </Card>
            ) : (
              <View style={{ gap: 10, marginBottom: 4 }}>
                {starredPRs.map(pr => {
                  const badge = getBadge(pr.one_rep_max);
                  const isActive = selEx === pr.exercise_name;
                  return (
                    <TouchableOpacity key={pr.exercise_name}
                      style={[styles.prCard, isActive && { borderColor: C.accent, borderWidth: 1.5 }]}
                      onPress={() => selectChart(pr.exercise_name)} activeOpacity={0.85}>
                      <View style={[styles.prIcon, { backgroundColor: C.yellow + '22' }]}>
                        <Ionicons name="star" size={20} color={C.yellow} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.prName}>{pr.exercise_name}</Text>
                        {badge && <TrophyChip label={badge.label} color={badge.color} />}
                        <Text style={styles.pr1rm}>e1RM {pr.one_rep_max.toFixed(1)} kg</Text>
                      </View>
                      <View style={{ alignItems: 'flex-end', gap: 4 }}>
                        <View style={{ backgroundColor: C.accent + '22', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: C.accent + '33' }}>
                          <Text style={{ fontSize: 15, fontWeight: '800', color: C.accent }}>{pr.weight}{pr.unit}</Text>
                          <Text style={{ fontSize: 10, color: C.muted, textAlign: 'center' }}>× {pr.reps}</Text>
                        </View>
                        <Text style={styles.prDate}>{pr.record_date}</Text>
                      </View>
                      <TouchableOpacity onPress={() => toggleStar(pr.exercise_name)} style={{ padding: 6 }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Ionicons name="star" size={18} color={C.yellow} />
                      </TouchableOpacity>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {recentHistory.length > 0 && (
              <>
                <SectionHeader title="Recent Activity" />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingBottom: 4, paddingHorizontal: 2 }}>
                  {recentHistory.map((h, i) => {
                    const orm = h.one_rep_max ?? calc1RM(h.weight, h.reps);
                    const isActive = selEx === h.exercise_name;
                    const feat = FEATURED_EXERCISES.find(f => f.name === h.exercise_name);
                    const color = feat?.color || C.accent;
                    return (
                      <TouchableOpacity key={i} style={[styles.recentCard, isActive && { borderColor: C.accent, borderWidth: 1.5 }]}
                        onPress={() => selectChart(h.exercise_name)} activeOpacity={0.8}>
                        <View style={{ width: 30, height: 30, borderRadius: 10, backgroundColor: color + '22', alignItems: 'center', justifyContent: 'center', marginBottom: 6 }}>
                          <Ionicons name="trophy" size={14} color={color} />
                        </View>
                        <Text style={styles.recentEx} numberOfLines={1}>{h.exercise_name}</Text>
                        <Text style={[styles.recentWeight, { color }]}>{h.weight}{h.unit}×{h.reps}</Text>
                        <Text style={styles.recentOrm}>e1RM {orm.toFixed(0)}</Text>
                        <Text style={styles.recentDate}>{fmtDate(h.session_date)}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </>
            )}
          </>
        )}

        {activeTab === 'history' && (
          <>
            <PRCalendarStrip C={C} selectedDay={selDay} onSelectDay={onSelectDay} prDates={prDates} />
            {dayPRs.length > 0 ? (
              <Card accent={C.yellow}>
                <View style={{ padding: 14 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                    <Ionicons name="trophy" size={16} color={C.yellow} style={{ marginRight: 6 }} />
                    <Text style={{ fontSize: 15, fontWeight: '800', color: C.text }}>PRs on {fmtDate(selDay)}</Text>
                    <View style={{ marginLeft: 'auto', backgroundColor: C.yellow + '22', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 }}>
                      <Text style={{ fontSize: 11, fontWeight: '800', color: C.yellow }}>{dayPRs.length} PR{dayPRs.length !== 1 ? 's' : ''}</Text>
                    </View>
                  </View>
                  {dayPRs.map((p, i) => {
                    const orm = p.one_rep_max ?? calc1RM(p.weight, p.reps);
                    return (
                      <TouchableOpacity key={i} style={[styles.dayRow, i === dayPRs.length - 1 && { borderBottomWidth: 0 }]}
                        onPress={() => selectChart(p.exercise_name)} activeOpacity={0.8}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.dayName} numberOfLines={1}>{p.exercise_name}</Text>
                          <Text style={{ fontSize: 11, color: C.muted }}>{p.sets} sets × {p.reps} reps</Text>
                        </View>
                        <Text style={[styles.dayWeight, { color: C.accent }]}>{p.weight}{p.unit}</Text>
                        <View style={[styles.ormBadge, { backgroundColor: C.yellow + '22' }]}>
                          <Text style={[styles.ormText, { color: C.yellow }]}>{orm.toFixed(0)} kg</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={14} color={C.border} />
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </Card>
            ) : (
              <Card accent={C.accent}>
                <View style={{ alignItems: 'center', paddingVertical: 28 }}>
                  <Ionicons name="trophy-outline" size={32} color={C.muted} />
                  <Text style={[styles.emptyTitle, { marginTop: 10 }]}>No PRs on {fmtDate(selDay)}</Text>
                  <Text style={styles.emptySub}>Days with PRs show a 🏆 on the calendar</Text>
                </View>
              </Card>
            )}

            <SectionHeader title="All Records" />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 10, paddingHorizontal: 2 }}>
              {MUSCLE_CATEGORIES.map(cat => (
                <TouchableOpacity key={cat} style={[styles.filterChip, categoryFilter === cat && { backgroundColor: C.accent, borderColor: C.accent }]}
                  onPress={() => setCategoryFilter(cat)} activeOpacity={0.8}>
                  <Text style={[styles.filterChipTxt, categoryFilter === cat && { color: '#fff' }]}>{cat}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <View style={{ gap: 8 }}>
              {filteredPRs.length === 0 ? (
                <Card accent={C.accent}><EmptyState icon="trophy-outline" message={`No ${categoryFilter} PRs yet`} sub="Log one with '+ Log PR'" /></Card>
              ) : filteredPRs.map(pr => {
                const isStarred = starred.includes(pr.exercise_name);
                const isActive = selEx === pr.exercise_name;
                const badge = getBadge(pr.one_rep_max);
                return (
                  <TouchableOpacity key={pr.exercise_name} style={[styles.allRow, isActive && { borderColor: C.accent, borderWidth: 1.5 }]}
                    onPress={() => selectChart(pr.exercise_name)} activeOpacity={0.8}>
                    <TouchableOpacity onPress={() => toggleStar(pr.exercise_name)} style={{ padding: 4 }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Ionicons name={isStarred ? 'star' : 'star-outline'} size={20} color={isStarred ? C.yellow : C.muted} />
                    </TouchableOpacity>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.prName, { fontSize: 13 }]}>{pr.exercise_name}</Text>
                      <Text style={styles.prDate}>{pr.record_date}</Text>
                      {badge && <TrophyChip label={badge.label} color={badge.color} />}
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={[styles.prWeight, { color: C.accent, fontSize: 13 }]}>{pr.weight}{pr.unit} × {pr.reps}</Text>
                      <Text style={styles.pr1rm}>e1RM {pr.one_rep_max.toFixed(1)}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={C.border} style={{ marginLeft: 4 }} />
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}

        {activeTab === 'chart' && (
          <>
            {selEx === '' ? (
              <Card accent={C.accent}><EmptyState icon="stats-chart-outline" message="No exercise selected" sub="Pick an exercise from Overview or History" /></Card>
            ) : (
              <Card accent={C.accent}>
                <View style={styles.chartHead}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.chartTitle}>{selEx}</Text>
                    {maxPoint && <Text style={styles.chartPeak}>Peak e1RM: {maxPoint.y} kg</Text>}
                  </View>
                  <TouchableOpacity style={styles.changeBtn} onPress={() => { setExSearch(''); setChartPickerModal(true); }}>
                    <Ionicons name="swap-horizontal-outline" size={14} color={C.accent} style={{ marginRight: 4 }} />
                    <Text style={styles.changeBtnTxt}>Change</Text>
                  </TouchableOpacity>
                </View>
                {chartData.length < 2 ? (
                  <EmptyState icon="stats-chart-outline" message={`Not enough data for ${selEx}`} sub="Log more sessions to see progression" />
                ) : (
                  <>
                    <VictoryChart width={SW - 40} height={230} padding={{ top: 24, bottom: 50, left: 56, right: 20 }} style={{ background: { fill: 'transparent' } }}>
                      <VictoryAxis tickFormat={t => { const d = chartData[t-1]; return d ? d.date.slice(5) : ''; }}
                        style={{ axis: { stroke: C.border }, tickLabels: { fill: C.muted, fontSize: 9, angle: -30 }, grid: { stroke: 'transparent' } }} />
                      <VictoryAxis dependentAxis style={{ axis: { stroke: C.border }, tickLabels: { fill: C.muted, fontSize: 9 }, grid: { stroke: C.border + '44', strokeDasharray: '4,4' } }} />
                      <VictoryArea data={chartData} style={{ data: { fill: C.accent + '22', stroke: C.accent, strokeWidth: 2.5 } }} interpolation="monotoneX" />
                      <VictoryScatter data={chartData} size={5} style={{ data: { fill: C.accent } }} />
                      {maxPoint && (
                        <VictoryScatter data={[maxPoint]} size={9} style={{ data: { fill: C.yellow } }}
                          labels={() => `PR\n${maxPoint.y}`}
                          labelComponent={<VictoryLabel dy={-20} style={{ fill: C.yellow, fontSize: 9, fontWeight: '700' }} />} />
                      )}
                    </VictoryChart>
                    <View style={styles.table}>
                      <View style={[styles.tr, styles.th]}>
                        {['Date','Weight','Sets×Reps','e1RM'].map(h => <Text key={h} style={[styles.tc, styles.thTxt]}>{h}</Text>)}
                      </View>
                      {history.slice(-10).map((h, i) => {
                        const orm = calc1RM(h.weight, h.reps);
                        const isPR = maxPoint && Math.abs(orm - maxPoint.y) < 0.01;
                        return (
                          <View key={i} style={[styles.tr, isPR && styles.prRow]}>
                            <Text style={[styles.tc, isPR && { color: C.yellow }]}>{h.session_date.slice(5)}</Text>
                            <Text style={[styles.tc, { color: C.accent }]}>{h.weight}{h.unit}</Text>
                            <Text style={[styles.tc, { color: C.textSub }]}>{h.sets}×{h.reps}</Text>
                            <Text style={[styles.tc, isPR && { color: C.yellow, fontWeight: '700' }]}>{orm.toFixed(1)}{isPR ? ' ★' : ''}</Text>
                          </View>
                        );
                      })}
                    </View>
                    <View style={{ paddingHorizontal: 16, paddingBottom: 14 }}>
                      <TouchableOpacity style={{ backgroundColor: C.accent, borderRadius: 14, paddingVertical: 13, alignItems: 'center' }}
                        onPress={() => openLogFor(selEx)} activeOpacity={0.85}>
                        <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>+ Log New {selEx} Attempt</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                )}
              </Card>
            )}
            {prs.length > 0 && (
              <>
                <SectionHeader title="Switch Exercise" />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 4, paddingHorizontal: 2 }}>
                  {prs.map(pr => (
                    <TouchableOpacity key={pr.exercise_name}
                      style={[styles.filterChip, selEx === pr.exercise_name && { backgroundColor: C.accent, borderColor: C.accent }]}
                      onPress={() => selectChart(pr.exercise_name)} activeOpacity={0.8}>
                      <Text style={[styles.filterChipTxt, selEx === pr.exercise_name && { color: '#fff' }]} numberOfLines={1}>{pr.exercise_name}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </>
            )}
          </>
        )}
      </ScrollView>

      <Modal visible={allPRsModal} transparent animationType="slide" onRequestClose={() => setAllPRsModal(false)}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setAllPRsModal(false)}>
          <TouchableOpacity activeOpacity={1} style={[styles.sheet, { maxHeight: '90%' }]} onPress={e => e.stopPropagation()}>
            <View style={styles.handle} />
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <Text style={styles.sheetTitle}>All Personal Records</Text>
              <Text style={{ color: C.muted, fontSize: 12, fontWeight: '600' }}>{prs.length} total</Text>
            </View>
            <Text style={{ fontSize: 12, color: C.muted, marginBottom: 12 }}>Tap ⭐ to pin. Tap row to view chart.</Text>
            <View style={styles.searchBox}>
              <Ionicons name="search-outline" size={18} color={C.muted} style={{ marginRight: 8 }} />
              <TextInput style={styles.searchInput} placeholder="Search..." placeholderTextColor={C.muted} value={exSearch} onChangeText={setExSearch} />
              {exSearch.length > 0 && <TouchableOpacity onPress={() => setExSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}><Ionicons name="close-circle" size={18} color={C.muted} /></TouchableOpacity>}
            </View>
            {prs.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                <Ionicons name="trophy-outline" size={40} color={C.muted} />
                <Text style={[styles.emptyTitle, { marginTop: 12 }]}>No PRs logged yet</Text>
                <Text style={styles.emptySub}>Tap "+ Log PR" to get started</Text>
              </View>
            ) : (
              <FlatList
                data={prs.filter(p => p.exercise_name.toLowerCase().includes(exSearch.toLowerCase()))}
                keyExtractor={item => item.exercise_name}
                showsVerticalScrollIndicator={false}
                renderItem={({ item }) => {
                  const isStarred = starred.includes(item.exercise_name);
                  const isActive = selEx === item.exercise_name;
                  const badge = getBadge(item.one_rep_max);
                  return (
                    <TouchableOpacity style={[styles.allRow, isActive && { borderColor: C.accent, borderWidth: 1.5 }, { marginBottom: 8 }]}
                      onPress={() => { selectChart(item.exercise_name); setAllPRsModal(false); }} activeOpacity={0.8}>
                      <TouchableOpacity onPress={() => toggleStar(item.exercise_name)} style={{ padding: 4 }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Ionicons name={isStarred ? 'star' : 'star-outline'} size={22} color={isStarred ? C.yellow : C.muted} />
                      </TouchableOpacity>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.prName, { fontSize: 14 }]}>{item.exercise_name}</Text>
                        <Text style={styles.prDate}>{item.record_date}</Text>
                        {badge && <TrophyChip label={badge.label} color={badge.color} />}
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={[styles.prWeight, { color: C.accent, fontSize: 14 }]}>{item.weight}{item.unit} × {item.reps}</Text>
                        <Text style={styles.pr1rm}>e1RM {item.one_rep_max.toFixed(1)}</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color={C.border} style={{ marginLeft: 4 }} />
                    </TouchableOpacity>
                  );
                }}
              />
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <Modal visible={chartPickerModal} transparent animationType="slide" onRequestClose={() => setChartPickerModal(false)}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setChartPickerModal(false)}>
          <TouchableOpacity activeOpacity={1} style={[styles.sheet, { maxHeight: '85%' }]} onPress={e => e.stopPropagation()}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>Select Exercise</Text>
            <View style={styles.searchBox}>
              <Ionicons name="search-outline" size={18} color={C.muted} style={{ marginRight: 8 }} />
              <TextInput style={styles.searchInput} placeholder="Search exercise..." placeholderTextColor={C.muted} value={exSearch} onChangeText={setExSearch} />
              {exSearch.length > 0 && <TouchableOpacity onPress={() => setExSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}><Ionicons name="close-circle" size={18} color={C.muted} /></TouchableOpacity>}
            </View>
            <FlatList data={exNames.filter(e => e.toLowerCase().includes(exSearch.toLowerCase()))} keyExtractor={item => item} showsVerticalScrollIndicator={false}
              renderItem={({ item }) => (
                <TouchableOpacity style={[styles.pickerRow, selEx === item && { backgroundColor: C.accentDim }]}
                  onPress={() => { selectChart(item); setChartPickerModal(false); setExSearch(''); }}>
                  <Text style={[styles.pickerTxt, selEx === item && { color: C.accent, fontWeight: '700' }]}>{item}</Text>
                  {selEx === item && <Ionicons name="checkmark" size={16} color={C.accent} />}
                </TouchableOpacity>
              )} />
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <Modal visible={logModal} transparent animationType="slide" onRequestClose={resetLogForm}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={resetLogForm}>
          <TouchableOpacity activeOpacity={1} style={[styles.sheet, pickingForLog && { maxHeight: '88%' }]} onPress={e => e.stopPropagation()}>
            <View style={styles.handle} />
            {pickingForLog ? (
              <View style={{ flex: 1, minHeight: 360 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
                  <TouchableOpacity onPress={() => { setPickingForLog(false); setExSearch(''); }} style={{ padding: 6, marginRight: 8, borderRadius: 10, backgroundColor: C.bg }}>
                    <Ionicons name="arrow-back" size={20} color={C.text} />
                  </TouchableOpacity>
                  <Text style={[styles.sheetTitle, { marginBottom: 0, fontSize: 18 }]}>Select Exercise</Text>
                </View>
                <View style={styles.searchBox}>
                  <Ionicons name="search-outline" size={18} color={C.muted} style={{ marginRight: 8 }} />
                  <TextInput style={styles.searchInput} placeholder="Search (e.g. Squat, Curl)..." placeholderTextColor={C.muted} value={exSearch} onChangeText={setExSearch} autoFocus />
                  {exSearch.length > 0 && <TouchableOpacity onPress={() => setExSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}><Ionicons name="close-circle" size={18} color={C.muted} /></TouchableOpacity>}
                </View>
                <FlatList data={exNames.filter(e => e.toLowerCase().includes(exSearch.toLowerCase()))} keyExtractor={item => item} showsVerticalScrollIndicator={false}
                  renderItem={({ item }) => {
                    const isSelected = logEx === item;
                    return (
                      <TouchableOpacity style={[styles.pickerRow, isSelected && { backgroundColor: C.accentDim }]} onPress={() => { setLogEx(item); setPickingForLog(false); setExSearch(''); }}>
                        <Text style={[styles.pickerTxt, isSelected && { color: C.accent, fontWeight: '700' }]}>{item}</Text>
                        {isSelected && <Ionicons name="checkmark-circle" size={18} color={C.accent} />}
                      </TouchableOpacity>
                    );
                  }} />
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 18 }}>
                  <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: C.yellow + '22', alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
                    <Ionicons name="trophy" size={20} color={C.yellow} />
                  </View>
                  <View>
                    <Text style={[styles.sheetTitle, { marginBottom: 0, fontSize: 20 }]}>Log a PR</Text>
                    <Text style={{ fontSize: 11, color: C.muted }}>Track your best lift</Text>
                  </View>
                </View>

                <Text style={styles.lbl}>Exercise</Text>
                <View style={styles.exToggleRow}>
                  <TouchableOpacity style={[styles.exToggleBtn, !useCustom && { backgroundColor: C.accent, borderColor: C.accent }]} onPress={() => setUseCustom(false)}>
                    <Ionicons name="list-outline" size={14} color={!useCustom ? '#fff' : C.muted} style={{ marginRight: 4 }} />
                    <Text style={[styles.exToggleTxt, !useCustom && { color: '#fff' }]}>Pick from List</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.exToggleBtn, useCustom && { backgroundColor: C.accent, borderColor: C.accent }]} onPress={() => setUseCustom(true)}>
                    <Ionicons name="pencil-outline" size={14} color={useCustom ? '#fff' : C.muted} style={{ marginRight: 4 }} />
                    <Text style={[styles.exToggleTxt, useCustom && { color: '#fff' }]}>Custom Name</Text>
                  </TouchableOpacity>
                </View>
                {!useCustom ? (
                  <TouchableOpacity style={styles.exSelector} onPress={() => { setExSearch(''); setPickingForLog(true); }}>
                    <Ionicons name="barbell-outline" size={18} color={C.accent} style={{ marginRight: 10 }} />
                    <Text style={styles.exSelectorTxt}>{logEx}</Text>
                    <Ionicons name="chevron-down" size={18} color={C.accent} />
                  </TouchableOpacity>
                ) : (
                  <TextInput style={styles.input} placeholder="e.g. Hack Squat, Incline Curl..." placeholderTextColor={C.muted} value={customEx} onChangeText={setCustomEx} autoCapitalize="words" />
                )}

                <Text style={styles.lbl}>Weight</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <TextInput style={[styles.input, { flex: 1 }]} placeholder="e.g. 100" placeholderTextColor={C.muted} keyboardType="decimal-pad" value={logWeight} onChangeText={setLogWeight} />
                  <View style={styles.unitToggle}>
                    {(['kg', 'lbs'] as const).map(u => (
                      <TouchableOpacity key={u} style={[styles.unitBtn, logUnit === u && styles.unitActive]} onPress={() => setLogUnit(u)}>
                        <Text style={[styles.unitTxt, logUnit === u && { color: '#fff', fontWeight: '800' }]}>{u}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.lbl}>Sets</Text>
                    <TextInput style={styles.input} placeholder="3" placeholderTextColor={C.muted} keyboardType="numeric" value={logSets} onChangeText={setLogSets} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.lbl}>Reps</Text>
                    <TextInput style={styles.input} placeholder="1" placeholderTextColor={C.muted} keyboardType="numeric" value={logReps} onChangeText={setLogReps} />
                  </View>
                </View>

                <Text style={styles.lbl}>RPE — Optional</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 6 }}>
                  {RPE_OPTIONS.map(rpe => (
                    <TouchableOpacity key={rpe} style={[styles.rpeChip, logRpe === rpe && { backgroundColor: C.accent, borderColor: C.accent }]}
                      onPress={() => setLogRpe(logRpe === rpe ? null : rpe)} activeOpacity={0.8}>
                      <Text style={[styles.rpeChipTxt, logRpe === rpe && { color: '#fff' }]}>{rpe}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                {logRpe != null && (
                  <Text style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>
                    {logRpe <= 7 ? '😊 Moderate — more in the tank' : logRpe <= 8.5 ? '😤 Hard — 1-2 reps left' : '🔥 Max effort — nothing left'}
                  </Text>
                )}

                <Text style={styles.lbl}>Notes — Optional</Text>
                <TextInput style={[styles.input, { height: 64, textAlignVertical: 'top' }]}
                  placeholder="e.g. Paused reps, felt great, belt used..." placeholderTextColor={C.muted}
                  value={logNotes} onChangeText={setLogNotes} multiline maxLength={120} />

                {logWeight.trim() && logReps.trim() && !isNaN(parseFloat(logWeight)) && !isNaN(parseInt(logReps)) && (
                  <View style={styles.e1rmPreview}>
                    <View>
                      <Text style={styles.e1rmLbl}>Estimated 1RM</Text>
                      {(() => { const e1rm = calc1RM(parseFloat(logWeight), parseInt(logReps, 10)); const b = getBadge(e1rm); return b ? <TrophyChip label={b.label} color={b.color} /> : null; })()}
                    </View>
                    <Text style={styles.e1rmVal}>{calc1RM(parseFloat(logWeight), parseInt(logReps, 10)).toFixed(1)} kg</Text>
                  </View>
                )}

                <View style={{ gap: 10, marginTop: 10 }}>
                  <TouchableOpacity style={{ backgroundColor: C.accent, borderRadius: 16, paddingVertical: 15, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}
                    onPress={handleLogPR} activeOpacity={0.85}>
                    <Ionicons name="trophy" size={18} color="#fff" />
                    <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>Save PR</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={{ borderRadius: 16, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: C.border }} onPress={resetLogForm} activeOpacity={0.8}>
                    <Text style={{ color: C.muted, fontWeight: '600', fontSize: 14 }}>Cancel</Text>
                  </TouchableOpacity>
                </View>
                <View style={{ height: 20 }} />
              </ScrollView>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

function makeStyles(C: any, isDark?: boolean) {
  return StyleSheet.create({
    safe:           { flex: 1, backgroundColor: C.bg },
    header:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, backgroundColor: C.bg, borderBottomWidth: 1, borderBottomColor: C.border },
    headerTitle:    { fontSize: 22, fontWeight: '800', color: C.text },
    headerSub:      { fontSize: 11, color: C.muted, marginTop: 2 },
    logBtn:         { backgroundColor: C.accent, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 6, elevation: 5, shadowColor: C.accent, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.4, shadowRadius: 6 },
    logBtnText:     { color: '#fff', fontWeight: '800', fontSize: 14 },
    tabBar:         { flexDirection: 'row', backgroundColor: C.card, borderBottomWidth: 1, borderBottomColor: C.border },
    tabItem:        { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12 },
    tabActive:      { borderBottomWidth: 2.5, borderBottomColor: C.accent },
    tabLabel:       { fontSize: 12, fontWeight: '700', color: C.muted },
    scroll:         { padding: 16, paddingBottom: 60 },
    sectionTitle:   { fontSize: 13, fontWeight: '800', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.8 },
    quickSection:   { backgroundColor: C.card, borderRadius: 20, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: C.border },
    quickChip:      { alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14, borderRadius: 16, borderWidth: 1, minWidth: 90 },
    filterChip:     { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: C.card, borderWidth: 1, borderColor: C.border },
    filterChipTxt:  { fontSize: 12, fontWeight: '700', color: C.muted },
    prCard:         { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: 18, padding: 14, gap: 12, borderWidth: 1, borderColor: C.border, elevation: 5, shadowColor: isDark ? '#000' : '#BFC8D6', shadowOffset: { width: 3, height: 3 }, shadowOpacity: 0.8, shadowRadius: 8 },
    prIcon:         { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    prName:         { fontSize: 14, fontWeight: '700', color: C.text, marginBottom: 2 },
    pr1rm:          { fontSize: 11, color: C.yellow, fontWeight: '600', marginTop: 2 },
    prWeight:       { fontSize: 14, fontWeight: '700' },
    prDate:         { fontSize: 10, color: C.muted },
    recentCard:     { backgroundColor: C.card, borderRadius: 16, padding: 12, alignItems: 'center', minWidth: 110, borderWidth: 1, borderColor: C.border, elevation: 4 },
    recentEx:       { fontSize: 11, fontWeight: '700', color: C.text, textAlign: 'center', maxWidth: 100 },
    recentWeight:   { fontSize: 12, fontWeight: '800', marginTop: 2 },
    recentOrm:      { fontSize: 10, color: C.yellow, fontWeight: '600' },
    recentDate:     { fontSize: 10, color: C.muted, marginTop: 2 },
    emptyTitle:     { fontSize: 15, fontWeight: '700', color: C.text, textAlign: 'center' },
    emptySub:       { fontSize: 12, color: C.muted, textAlign: 'center', marginTop: 6, lineHeight: 18 },
    dayRow:         { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 10, borderBottomWidth: 1, borderBottomColor: C.border },
    dayName:        { fontSize: 13, fontWeight: '600', color: C.text },
    dayWeight:      { fontSize: 14, fontWeight: '800' },
    ormBadge:       { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
    ormText:        { fontSize: 11, fontWeight: '800' },
    allRow:         { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.card, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: C.border, elevation: 2 },
    chartHead:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, paddingBottom: 0 },
    chartTitle:     { fontSize: 15, fontWeight: '700', color: C.text },
    chartPeak:      { fontSize: 11, color: C.yellow, marginTop: 2, fontWeight: '600' },
    changeBtn:      { backgroundColor: C.accentDim, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: C.accent + '33' },
    changeBtnTxt:   { fontSize: 12, color: C.accent, fontWeight: '600' },
    table:          { marginHorizontal: 16, marginBottom: 8, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: C.border },
    tr:             { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: C.border },
    th:             { backgroundColor: C.border + '66' },
    thTxt:          { fontWeight: '700', color: C.muted },
    tc:             { flex: 1, fontSize: 11, color: C.textSub, padding: 8, textAlign: 'center' },
    prRow:          { backgroundColor: C.yellow + '11' },
    overlay:        { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
    sheet:          { backgroundColor: C.card, borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: 20, paddingBottom: 40, borderWidth: 1, borderColor: C.border, elevation: 20 },
    handle:         { width: 40, height: 5, backgroundColor: C.border, borderRadius: 3, alignSelf: 'center', marginBottom: 16 },
    sheetTitle:     { fontSize: 20, fontWeight: '800', color: C.text, marginBottom: 16 },
    lbl:            { fontSize: 11, color: C.muted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6, marginTop: 12 },
    exToggleRow:    { flexDirection: 'row', gap: 8, marginBottom: 10 },
    exToggleBtn:    { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 12, backgroundColor: C.bg, borderWidth: 1, borderColor: C.border },
    exToggleTxt:    { fontSize: 13, fontWeight: '700', color: C.muted },
    exSelector:     { backgroundColor: C.bg, borderRadius: 14, padding: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: C.border },
    exSelectorTxt:  { fontSize: 15, fontWeight: '700', color: C.text, flex: 1 },
    input:          { backgroundColor: C.bg, borderRadius: 12, padding: 13, fontSize: 16, fontWeight: '700', color: C.text, borderWidth: 1, borderColor: C.border },
    unitToggle:     { flexDirection: 'row', borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: C.border },
    unitBtn:        { paddingHorizontal: 14, paddingVertical: 13, backgroundColor: C.bg },
    unitActive:     { backgroundColor: C.accent },
    unitTxt:        { fontSize: 13, fontWeight: '700', color: C.textSub },
    rpeChip:        { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, backgroundColor: C.bg, borderWidth: 1, borderColor: C.border },
    rpeChipTxt:     { fontSize: 13, fontWeight: '700', color: C.muted },
    e1rmPreview:    { backgroundColor: C.accentDim, borderRadius: 14, padding: 14, marginTop: 12, marginBottom: 4, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: C.accent + '33' },
    e1rmLbl:        { fontSize: 12, color: C.accent, fontWeight: '700' },
    e1rmVal:        { fontSize: 22, fontWeight: '800', color: C.accent },
    pickerRow:      { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    pickerTxt:      { fontSize: 15, color: C.text, fontWeight: '500' },
    searchBox:      { flexDirection: 'row', alignItems: 'center', backgroundColor: C.bg, borderRadius: 12, paddingHorizontal: 12, marginBottom: 12, borderWidth: 1, borderColor: C.border },
    searchInput:    { flex: 1, paddingVertical: 10, fontSize: 14, color: C.text, fontWeight: '600' },
  });
}
