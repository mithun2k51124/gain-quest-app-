// app/prs.tsx — Personal Records Screen
import React, { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  RefreshControl, Dimensions, TextInput, Modal, FlatList,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { VictoryChart, VictoryScatter, VictoryAxis,
         VictoryArea, VictoryLabel } from 'victory-native';
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
import { EXERCISE_LIBRARY } from '../constants/theme';
import { Ionicons } from '@expo/vector-icons';

const { width: SW } = Dimensions.get('window');
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAY_LABELS = ['S','M','T','W','T','F','S'];

function calc1RM(weight: number, reps: number): number {
  return reps === 1 ? weight : weight * (1 + reps / 30);
}

function fmtDate(s: string): string {
  try {
    return new Date(s + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch { return s; }
}

// ─────────────────────────────────────────────────────────────────────────────
// PR Calendar Component
// ─────────────────────────────────────────────────────────────────────────────
function PRCalendarNav({ C, selectedDay, onSelectDay, prDates }: {
  C: any; selectedDay: string;
  onSelectDay: (d: string) => void; prDates: string[];
}) {
  const [showFullCal, setShowFullCal] = useState(false);
  const [calMonth, setCalMonth] = useState(() => {
    const d = new Date(selectedDay + 'T00:00:00');
    return isNaN(d.getTime())
      ? { year: new Date().getFullYear(), month: new Date().getMonth() }
      : { year: d.getFullYear(), month: d.getMonth() };
  });

  const activeSet = new Set(prDates);
  const today = todayStr();

  const getWeekDays = (ds: string) => {
    try {
      const d = new Date(ds + 'T00:00:00');
      const dow = d.getDay();
      return Array.from({ length: 7 }, (_, i) => {
        const nd = new Date(d); nd.setDate(d.getDate() + (i - dow));
        return nd.toISOString().slice(0, 10);
      });
    } catch { return [ds]; }
  };
  const weekDays = getWeekDays(selectedDay);

  const { year, month } = calMonth;
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const calCells: (string | null)[] = Array(firstDay).fill(null);
  for (let d = 1; d <= daysInMonth; d++)
    calCells.push(`${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`);

  const shiftDay = (delta: number) => {
    try {
      const d = new Date(selectedDay + 'T00:00:00');
      d.setDate(d.getDate() + delta);
      onSelectDay(d.toISOString().slice(0, 10));
    } catch {}
  };

  const s = calStyles(C);

  return (
    <>
      {/* Nav row */}
      <View style={s.navRow}>
        <TouchableOpacity onPress={() => shiftDay(-1)} style={s.arrowBtn}>
          <Ionicons name="chevron-back" size={20} color={C.text} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => onSelectDay(today)}
          style={[s.pill, selectedDay === today && { backgroundColor: C.accent }]}
        >
          <Ionicons name="trophy-outline" size={13} color={selectedDay === today ? '#fff' : C.accent} style={{ marginRight: 5 }} />
          <Text style={[s.pillTxt, selectedDay === today && { color: '#fff' }]}>
            {selectedDay === today ? 'Today' : fmtDate(selectedDay)}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => shiftDay(1)} style={s.arrowBtn}>
          <Ionicons name="chevron-forward" size={20} color={C.text} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setShowFullCal(v => !v)}
          style={[s.calBtn, showFullCal && { backgroundColor: C.accent }]}
        >
          <Ionicons name={showFullCal ? 'calendar' : 'calendar-outline'} size={18} color={showFullCal ? '#fff' : C.accent} />
        </TouchableOpacity>
      </View>

      {/* Week strip */}
      {!showFullCal && (
        <Card accent={C.accent}>
          <View style={{ paddingVertical: 14, paddingHorizontal: 8 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
              {DAY_LABELS.map((lbl, i) => {
                const dd = weekDays[i]; if (!dd) return null;
                const isSel = dd === selectedDay, isToday = dd === today, has = activeSet.has(dd);
                const num = parseInt(dd.slice(8), 10);
                return (
                  <TouchableOpacity key={dd} onPress={() => onSelectDay(dd)} style={[s.wDay, isSel && { backgroundColor: C.accent, borderRadius: 14 }]}>
                    <Text style={[s.wLbl, i === 0 && { color: C.red }, isSel && { color: '#fff', fontWeight: '800' }]}>{lbl}</Text>
                    <View style={[s.ring, has && { borderColor: C.yellow, backgroundColor: C.yellow + '22' }, isSel && has && { borderColor: '#fff' }]}>
                      {has
                        ? <Ionicons name="trophy" size={11} color={isSel ? '#fff' : C.yellow} />
                        : <View style={[s.dot, isToday && !isSel && { backgroundColor: C.accent }]} />}
                    </View>
                    <Text style={[s.wNum, isSel && { color: '#fff', fontWeight: '800' }, isToday && !isSel && { color: C.accent }]}>{num}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </Card>
      )}

      {/* Full calendar */}
      {showFullCal && (
        <Card accent={C.accent}>
          <View style={{ padding: 14 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <TouchableOpacity onPress={() => setCalMonth(({ year: y, month: m }) => m === 0 ? { year: y-1, month: 11 } : { year: y, month: m-1 })} style={s.arrowBtn}>
                <Ionicons name="chevron-back" size={20} color={C.text} />
              </TouchableOpacity>
              <Text style={{ fontSize: 16, fontWeight: '800', color: C.text }}>{MONTHS[month]} {year}</Text>
              <TouchableOpacity onPress={() => setCalMonth(({ year: y, month: m }) => m === 11 ? { year: y+1, month: 0 } : { year: y, month: m+1 })} style={s.arrowBtn}>
                <Ionicons name="chevron-forward" size={20} color={C.text} />
              </TouchableOpacity>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginBottom: 8 }}>
              {DAY_LABELS.map((l, i) => (
                <Text key={i} style={{ width: 36, textAlign: 'center', fontSize: 11, color: i === 0 ? C.red : C.muted, fontWeight: '700' }}>{l}</Text>
              ))}
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {calCells.map((cell, i) => {
                if (!cell) return <View key={`e${i}`} style={s.cell} />;
                const isSel = cell === selectedDay, isToday = cell === today, has = activeSet.has(cell);
                return (
                  <TouchableOpacity key={cell} onPress={() => onSelectDay(cell)} style={[s.cell, isSel && { backgroundColor: C.accent, borderRadius: 10 }, isToday && !isSel && { borderColor: C.accent, borderWidth: 1.5, borderRadius: 10 }]}>
                    {has && <View style={[s.calDot, { backgroundColor: C.yellow }, isSel && { backgroundColor: '#fff' }]} />}
                    <Text style={[s.cellNum, isSel && { color: '#fff', fontWeight: '800' }, isToday && !isSel && { color: C.accent, fontWeight: '800' }]}>{parseInt(cell.slice(8), 10)}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </Card>
      )}
    </>
  );
}

function calStyles(C: any) {
  return StyleSheet.create({
    navRow:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
    arrowBtn:{ width: 36, height: 36, borderRadius: 12, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center', elevation: 3, shadowColor: C.shadowDark, shadowOffset: { width: 3, height: 3 }, shadowOpacity: 0.8, shadowRadius: 5 },
    pill:    { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: C.accentDim, borderRadius: 14, paddingVertical: 8 },
    pillTxt: { fontSize: 13, fontWeight: '700', color: C.accent },
    calBtn:  { width: 36, height: 36, borderRadius: 12, backgroundColor: C.accentDim, alignItems: 'center', justifyContent: 'center' },
    wDay:    { alignItems: 'center', paddingVertical: 6, paddingHorizontal: 4, minWidth: 36 },
    wLbl:    { fontSize: 11, fontWeight: '700', color: C.muted, marginBottom: 4 },
    wNum:    { fontSize: 13, fontWeight: '600', color: C.text, marginTop: 4 },
    ring:    { width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
    dot:     { width: 5, height: 5, borderRadius: 2.5, backgroundColor: C.muted },
    cell:    { width: 36, height: 40, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
    cellNum: { fontSize: 13, color: C.textSub, textAlign: 'center' },
    calDot:  { width: 5, height: 5, borderRadius: 2.5, position: 'absolute', top: 4 },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Screen
// ─────────────────────────────────────────────────────────────────────────────
export default function PRScreen() {
  const { showAlert } = useCustomAlert();
  const { C } = useTheme();
  const styles = makeStyles(C);

  const [prs, setPrs]               = useState<PR[]>([]);
  const [starred, setStarred]       = useState<string[]>([]);
  const [recentHistory, setRecent]  = useState<(PRProgressionEntry & { one_rep_max?: number })[]>([]);
  const [prDates, setPrDates]       = useState<string[]>([]);
  const [selDay, setSelDay]         = useState(todayStr());
  const [dayPRs, setDayPRs]         = useState<(PRProgressionEntry & { one_rep_max?: number })[]>([]);
  const [exNames, setExNames]       = useState<string[]>([]);
  const [refresh, setRefresh]       = useState(false);

  // Chart
  const [selEx, setSelEx]           = useState('');
  const [history, setHistory]       = useState<PRProgressionEntry[]>([]);

  // Modals
  const [allPRsModal, setAllPRsModal] = useState(false);
  const [logModal, setLogModal]     = useState(false);
  const [chartPickerModal, setChartPickerModal] = useState(false);
  const [pickingForLog, setPickingForLog] = useState(false);
  const [exSearch, setExSearch]     = useState('');

  // Log PR form
  const [logEx, setLogEx]           = useState('Bench Press');
  const [customEx, setCustomEx]     = useState('');
  const [useCustom, setUseCustom]   = useState(false);
  const [logWeight, setLogWeight]   = useState('');
  const [logSets, setLogSets]       = useState('3');
  const [logReps, setLogReps]       = useState('1');
  const [logUnit, setLogUnit]       = useState<'kg' | 'lbs'>('kg');

  const load = useCallback(() => {
    const allPRs = getAllPRs();
    setPrs(allPRs);
    const starredList = getStarredPRExercises();
    setStarred(starredList);
    setPrDates(getPRDates());
    setRecent(getRecentPRHistory(12));
    setDayPRs(getPRsForDate(selDay));

    // Auto-select first starred or first PR for chart
    const currentSel = selEx;
    const chartEx = currentSel && allPRs.find(p => p.exercise_name === currentSel)
      ? currentSel
      : starredList[0] || (allPRs[0]?.exercise_name ?? '');
    if (chartEx && chartEx !== currentSel) {
      setSelEx(chartEx);
      setHistory(getPRProgressionHistory(chartEx));
    } else if (currentSel) {
      setHistory(getPRProgressionHistory(currentSel));
    }

    const names = getAllExerciseNames();
    const libNames = Object.values(EXERCISE_LIBRARY).flat();
    const combined = [...libNames, ...names.filter(n => !libNames.includes(n))];
    setExNames([...new Set(combined)]);
  }, [selEx, selDay]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = () => { setRefresh(true); load(); setRefresh(false); };

  const onSelectDay = (day: string) => {
    setSelDay(day);
    setDayPRs(getPRsForDate(day));
  };

  const toggleStar = (name: string) => {
    if (starred.includes(name)) {
      unstarPRExercise(name);
    } else {
      starPRExercise(name);
    }
    setStarred(getStarredPRExercises());
  };

  const selectChart = (name: string) => {
    setSelEx(name);
    setHistory(getPRProgressionHistory(name));
  };

  const prMap = Object.fromEntries(prs.map(p => [p.exercise_name, p]));

  const chartData = history.map((h, i) => ({
    x: i + 1,
    y: parseFloat(calc1RM(h.weight, h.reps).toFixed(1)),
    weight: h.weight, reps: h.reps, date: h.session_date,
  }));
  const maxPoint = chartData.length ? chartData.reduce((a, b) => a.y > b.y ? a : b) : null;

  const effectiveEx = useCustom ? customEx.trim() : logEx;

  const handleLogPR = () => {
    const exName = effectiveEx;
    const w = parseFloat(logWeight), s = parseInt(logSets, 10), r = parseInt(logReps, 10);
    if (!exName) { showAlert('Error', 'Please enter or select an exercise.'); return; }
    if (isNaN(w) || w <= 0) { showAlert('Error', 'Enter a valid weight.'); return; }
    if (isNaN(s) || s <= 0) { showAlert('Error', 'Enter valid sets.'); return; }
    if (isNaN(r) || r <= 0) { showAlert('Error', 'Enter valid reps.'); return; }

    const e1rm = calc1RM(w, r);
    const existing = prMap[exName];

    if (existing && e1rm <= existing.one_rep_max) {
      showAlert('Not a PR', `Current e1RM for ${exName} is ${existing.one_rep_max.toFixed(1)} kg.\nThis is ${e1rm.toFixed(1)} kg — log anyway?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Log Anyway', onPress: () => { logPRManually(exName, s, r, w, logUnit); resetLogForm(); load(); selectChart(exName); showAlert('Logged ✓', `Saved for ${exName}`); } },
      ]);
      return;
    }

    logPRManually(exName, s, r, w, logUnit);
    resetLogForm();
    load();
    selectChart(exName);
    showAlert('New PR! 🏆', `${exName}\n${w}${logUnit} × ${r} reps\ne1RM: ${e1rm.toFixed(1)} kg`);
  };

  const resetLogForm = () => {
    setLogModal(false); setLogWeight(''); setLogSets('3'); setLogReps('1');
    setUseCustom(false); setCustomEx(''); setPickingForLog(false); setExSearch('');
  };

  const starredPRs = starred.map(n => prMap[n]).filter(Boolean);
  const nonStarred = prs.filter(p => !starred.includes(p.exercise_name));

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Personal Records</Text>
          <Text style={styles.headerSub}>Epley e1RM · ⭐ star to pin</Text>
        </View>
        <TouchableOpacity style={styles.logBtn} onPress={() => setLogModal(true)}>
          <Ionicons name="add" size={16} color="#fff" />
          <Text style={styles.logBtnText}>Log PR</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refresh} onRefresh={onRefresh} tintColor={C.accent} />}
      >

        {/* ── Recent PRs Strip ── */}
        {recentHistory.length > 0 && (
          <>
            <SectionHeader title="Recent Activity" />
            <ScrollView horizontal showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 16, gap: 10, paddingBottom: 4 }}>
              {recentHistory.map((h, i) => {
                const orm = h.one_rep_max ?? calc1RM(h.weight, h.reps);
                const isActive = selEx === h.exercise_name;
                return (
                  <TouchableOpacity key={i} style={[styles.recentCard, isActive && { borderColor: C.accent, borderWidth: 1.5 }]}
                    onPress={() => selectChart(h.exercise_name)} activeOpacity={0.8}>
                    <View style={styles.recentIconWrap}>
                      <Ionicons name="trophy" size={13} color={C.yellow} />
                    </View>
                    <Text style={styles.recentEx} numberOfLines={1}>{h.exercise_name}</Text>
                    <Text style={[styles.recentWeight, { color: C.accent }]}>{h.weight}{h.unit}×{h.reps}</Text>
                    <Text style={styles.recentOrm}>e1RM {orm.toFixed(0)}</Text>
                    <Text style={styles.recentDate}>{fmtDate(h.session_date)}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </>
        )}

        {/* ── Starred PRs ── */}
        <SectionHeader title="Starred PRs" />
        {starredPRs.length === 0 ? (
          <Card accent={C.accent}>
            <View style={{ alignItems: 'center', paddingVertical: 28, paddingHorizontal: 20 }}>
              <Ionicons name="star-outline" size={36} color={C.muted} />
              <Text style={[styles.emptyTitle, { marginTop: 12 }]}>No starred exercises yet</Text>
              <Text style={styles.emptySub}>Tap "View All PRs" below and star the ones you want to track here</Text>
            </View>
          </Card>
        ) : (
          starredPRs.map(pr => {
            const isActive = selEx === pr.exercise_name;
            return (
              <TouchableOpacity
                key={pr.exercise_name}
                style={[styles.prCard, isActive && { borderColor: C.accent, borderWidth: 1.5 }]}
                onPress={() => selectChart(pr.exercise_name)}
                activeOpacity={0.85}
              >
                <View style={[styles.prIcon, { backgroundColor: C.yellow + '22' }]}>
                  <Ionicons name="star" size={22} color={C.yellow} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.prName}>{pr.exercise_name}</Text>
                  <Text style={styles.pr1rm}>e1RM {pr.one_rep_max.toFixed(1)} kg</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[styles.prWeight, { color: C.accent }]}>{pr.weight}{pr.unit} × {pr.reps}</Text>
                  <Text style={styles.prDate}>{pr.record_date}</Text>
                </View>
                <TouchableOpacity onPress={() => toggleStar(pr.exercise_name)} style={styles.starBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="star" size={18} color={C.yellow} />
                </TouchableOpacity>
              </TouchableOpacity>
            );
          })
        )}

        {/* ── View All PRs ── */}
        <TouchableOpacity style={styles.viewAllBtn} onPress={() => setAllPRsModal(true)} activeOpacity={0.8}>
          <Ionicons name="list-outline" size={18} color={C.accent} />
          <Text style={styles.viewAllText}>
            View All PRs{prs.length > 0 ? ` (${prs.length})` : ''}
          </Text>
          <Ionicons name="chevron-forward" size={18} color={C.accent} />
        </TouchableOpacity>

        {/* ── PR Calendar ── */}
        <SectionHeader title="PR Calendar" />
        <PRCalendarNav C={C} selectedDay={selDay} onSelectDay={onSelectDay} prDates={prDates} />

        {/* Day Detail */}
        {dayPRs.length > 0 && (
          <Card accent={C.yellow}>
            <View style={{ padding: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                <Ionicons name="trophy" size={15} color={C.yellow} style={{ marginRight: 6 }} />
                <Text style={{ fontSize: 14, fontWeight: '800', color: C.text }}>PRs on {fmtDate(selDay)}</Text>
              </View>
              {dayPRs.map((p, i) => {
                const orm = p.one_rep_max ?? calc1RM(p.weight, p.reps);
                return (
                  <TouchableOpacity key={i} style={styles.dayRow} onPress={() => selectChart(p.exercise_name)} activeOpacity={0.8}>
                    <Text style={styles.dayName} numberOfLines={1}>{p.exercise_name}</Text>
                    <Text style={[styles.dayWeight, { color: C.accent }]}>{p.weight}{p.unit} × {p.reps}</Text>
                    <View style={[styles.ormBadge, { backgroundColor: C.yellow + '22' }]}>
                      <Text style={[styles.ormText, { color: C.yellow }]}>{orm.toFixed(0)}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </Card>
        )}

        {dayPRs.length === 0 && selDay !== todayStr() && (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 10, opacity: 0.5 }}>
            <Ionicons name="trophy-outline" size={16} color={C.muted} />
            <Text style={{ color: C.muted, fontSize: 13, fontWeight: '600' }}>No PRs on {fmtDate(selDay)}</Text>
          </View>
        )}

        {/* ── Progression Chart ── */}
        <SectionHeader title="Progression Chart" />
        {selEx === '' ? (
          <Card accent={C.accent}>
            <EmptyState icon="stats-chart-outline" message="No exercise selected" sub="Tap a Recent PR or a Starred card above" />
          </Card>
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
              <EmptyState icon="stats-chart-outline" message={`Not enough data for ${selEx}`} sub="Log more sessions or tap '+ Log PR'" />
            ) : (
              <>
                <VictoryChart width={SW - 40} height={220} padding={{ top: 20, bottom: 50, left: 52, right: 20 }} style={{ background: { fill: 'transparent' } }}>
                  <VictoryAxis tickFormat={t => { const d = chartData[t-1]; return d ? d.date.slice(5) : ''; }}
                    style={{ axis: { stroke: C.border }, tickLabels: { fill: C.muted, fontSize: 9, angle: -30 }, grid: { stroke: 'transparent' } }} />
                  <VictoryAxis dependentAxis
                    style={{ axis: { stroke: C.border }, tickLabels: { fill: C.muted, fontSize: 9 }, grid: { stroke: C.border, strokeDasharray: '4,4' } }} />
                  <VictoryArea data={chartData} style={{ data: { fill: C.accent + '22', stroke: C.accent, strokeWidth: 2.5 } }} interpolation="monotoneX" />
                  <VictoryScatter data={chartData} size={5} style={{ data: { fill: C.accent } }} />
                  {maxPoint && (
                    <VictoryScatter data={[maxPoint]} size={8} style={{ data: { fill: C.yellow } }}
                      labels={() => `PR\n${maxPoint.y}`}
                      labelComponent={<VictoryLabel dy={-18} style={{ fill: C.yellow, fontSize: 9, fontWeight: '700' }} />} />
                  )}
                </VictoryChart>

                {/* History table */}
                <View style={styles.table}>
                  <View style={[styles.tr, styles.th]}>
                    {['Date','Weight','Sets×Reps','e1RM'].map(h => (
                      <Text key={h} style={[styles.tc, styles.thTxt]}>{h}</Text>
                    ))}
                  </View>
                  {history.slice(-8).map((h, i) => {
                    const orm = calc1RM(h.weight, h.reps);
                    const isPR = maxPoint && orm === maxPoint.y;
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
              </>
            )}
          </Card>
        )}

      </ScrollView>

      {/* ── All PRs Modal ── */}
      <Modal visible={allPRsModal} transparent animationType="slide" onRequestClose={() => setAllPRsModal(false)}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setAllPRsModal(false)}>
          <TouchableOpacity activeOpacity={1} style={[styles.sheet, { maxHeight: '90%' }]} onPress={e => e.stopPropagation()}>
            <View style={styles.handle} />
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <Text style={styles.sheetTitle}>All Personal Records</Text>
              <Text style={{ color: C.muted, fontSize: 12, fontWeight: '600' }}>{prs.length} total</Text>
            </View>
            <Text style={{ fontSize: 12, color: C.muted, marginBottom: 16 }}>Tap ⭐ to pin. Tap row to view chart.</Text>
            {prs.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                <Ionicons name="trophy-outline" size={40} color={C.muted} />
                <Text style={[styles.emptyTitle, { marginTop: 12 }]}>No PRs logged yet</Text>
                <Text style={styles.emptySub}>Tap "+ Log PR" to get started</Text>
              </View>
            ) : (
              <FlatList
                data={prs}
                keyExtractor={item => item.exercise_name}
                showsVerticalScrollIndicator={false}
                renderItem={({ item }) => {
                  const isStarred = starred.includes(item.exercise_name);
                  const isActive = selEx === item.exercise_name;
                  return (
                    <TouchableOpacity
                      style={[styles.allRow, isActive && { borderColor: C.accent, borderWidth: 1.5 }]}
                      onPress={() => { selectChart(item.exercise_name); setAllPRsModal(false); }}
                      activeOpacity={0.8}
                    >
                      {/* Star toggle */}
                      <TouchableOpacity onPress={() => toggleStar(item.exercise_name)} style={styles.starBtnLarge} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Ionicons name={isStarred ? 'star' : 'star-outline'} size={22} color={isStarred ? C.yellow : C.muted} />
                      </TouchableOpacity>
                      {/* Info */}
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.prName, { fontSize: 14 }]}>{item.exercise_name}</Text>
                        <Text style={styles.prDate}>{item.record_date}</Text>
                      </View>
                      {/* PR value */}
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={[styles.prWeight, { color: C.accent, fontSize: 14 }]}>{item.weight}{item.unit} × {item.reps}</Text>
                        <Text style={styles.pr1rm}>e1RM {item.one_rep_max.toFixed(1)}</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color={C.border} style={{ marginLeft: 4 }} />
                    </TouchableOpacity>
                  );
                }}
                ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
              />
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ── Exercise Picker for Chart ── */}
      <Modal visible={chartPickerModal} transparent animationType="slide" onRequestClose={() => setChartPickerModal(false)}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setChartPickerModal(false)}>
          <TouchableOpacity activeOpacity={1} style={[styles.sheet, { maxHeight: '85%' }]} onPress={e => e.stopPropagation()}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>Select Chart Exercise</Text>
            <View style={styles.searchBox}>
              <Ionicons name="search-outline" size={18} color={C.muted} style={{ marginRight: 8 }} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search exercise..."
                placeholderTextColor={C.muted}
                value={exSearch}
                onChangeText={setExSearch}
              />
              {exSearch.length > 0 && (
                <TouchableOpacity onPress={() => setExSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close-circle" size={18} color={C.muted} />
                </TouchableOpacity>
              )}
            </View>
            <FlatList
              data={exNames.filter(e => e.toLowerCase().includes(exSearch.toLowerCase()))}
              keyExtractor={item => item}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.pickerRow, selEx === item && { backgroundColor: C.accentDim }]}
                  onPress={() => { selectChart(item); setChartPickerModal(false); setExSearch(''); }}
                >
                  <Text style={[styles.pickerTxt, selEx === item && { color: C.accent, fontWeight: '700' }]}>{item}</Text>
                  {selEx === item && <Ionicons name="checkmark" size={16} color={C.accent} />}
                </TouchableOpacity>
              )}
            />
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ── Log PR Modal ── */}
      <Modal visible={logModal} transparent animationType="slide" onRequestClose={resetLogForm}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={resetLogForm}>
          <TouchableOpacity activeOpacity={1} style={[styles.sheet, pickingForLog && { maxHeight: '85%' }]} onPress={e => e.stopPropagation()}>
            <View style={styles.handle} />

            {pickingForLog ? (
              <View style={{ flex: 1, minHeight: 360 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
                  <TouchableOpacity
                    onPress={() => { setPickingForLog(false); setExSearch(''); }}
                    style={{ padding: 6, marginRight: 8, borderRadius: 10, backgroundColor: C.bg }}
                  >
                    <Ionicons name="arrow-back" size={20} color={C.text} />
                  </TouchableOpacity>
                  <Text style={[styles.sheetTitle, { marginBottom: 0, fontSize: 18 }]}>Select Exercise for PR</Text>
                </View>

                <View style={styles.searchBox}>
                  <Ionicons name="search-outline" size={18} color={C.muted} style={{ marginRight: 8 }} />
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Search exercise (e.g. Squat, Curl)..."
                    placeholderTextColor={C.muted}
                    value={exSearch}
                    onChangeText={setExSearch}
                    autoFocus
                  />
                  {exSearch.length > 0 && (
                    <TouchableOpacity onPress={() => setExSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Ionicons name="close-circle" size={18} color={C.muted} />
                    </TouchableOpacity>
                  )}
                </View>

                <FlatList
                  data={exNames.filter(e => e.toLowerCase().includes(exSearch.toLowerCase()))}
                  keyExtractor={item => item}
                  showsVerticalScrollIndicator={false}
                  renderItem={({ item }) => {
                    const isSelected = logEx === item;
                    return (
                      <TouchableOpacity
                        style={[styles.pickerRow, isSelected && { backgroundColor: C.accentDim }]}
                        onPress={() => {
                          setLogEx(item);
                          setPickingForLog(false);
                          setExSearch('');
                        }}
                      >
                        <Text style={[styles.pickerTxt, isSelected && { color: C.accent, fontWeight: '700' }]}>{item}</Text>
                        {isSelected && <Ionicons name="checkmark-circle" size={18} color={C.accent} />}
                      </TouchableOpacity>
                    );
                  }}
                />
              </View>
            ) : (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
                  <Ionicons name="trophy" size={22} color={C.yellow} style={{ marginRight: 8 }} />
                  <Text style={[styles.sheetTitle, { marginBottom: 0 }]}>Log a PR</Text>
                </View>

                {/* Exercise */}
                <Text style={styles.lbl}>Exercise</Text>
                <View style={styles.exToggleRow}>
                  <TouchableOpacity style={[styles.exToggleBtn, !useCustom && { backgroundColor: C.accent }]} onPress={() => setUseCustom(false)}>
                    <Ionicons name="list-outline" size={14} color={!useCustom ? '#fff' : C.muted} style={{ marginRight: 4 }} />
                    <Text style={[styles.exToggleTxt, !useCustom && { color: '#fff' }]}>Pick</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.exToggleBtn, useCustom && { backgroundColor: C.accent }]} onPress={() => setUseCustom(true)}>
                    <Ionicons name="pencil-outline" size={14} color={useCustom ? '#fff' : C.muted} style={{ marginRight: 4 }} />
                    <Text style={[styles.exToggleTxt, useCustom && { color: '#fff' }]}>Custom</Text>
                  </TouchableOpacity>
                </View>

                {!useCustom ? (
                  <TouchableOpacity style={styles.exSelector} onPress={() => { setExSearch(''); setPickingForLog(true); }}>
                    <Text style={styles.exSelectorTxt}>{logEx}</Text>
                    <Ionicons name="chevron-down" size={18} color={C.accent} />
                  </TouchableOpacity>
                ) : (
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. Hack Squat, Incline Curl…"
                    placeholderTextColor={C.muted}
                    value={customEx}
                    onChangeText={setCustomEx}
                    autoCapitalize="words"
                  />
                )}

                {/* Weight */}
                <Text style={styles.lbl}>Weight</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <TextInput
                    style={[styles.input, { flex: 1, marginRight: 10 }]}
                    placeholder="e.g. 100"
                    placeholderTextColor={C.muted}
                    keyboardType="decimal-pad"
                    value={logWeight}
                    onChangeText={setLogWeight}
                  />
                  <View style={styles.unitToggle}>
                    {(['kg', 'lbs'] as const).map(u => (
                      <TouchableOpacity key={u} style={[styles.unitBtn, logUnit === u && styles.unitActive]} onPress={() => setLogUnit(u)}>
                        <Text style={[styles.unitTxt, logUnit === u && { color: '#fff' }]}>{u}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {/* Sets & Reps */}
                <View style={{ flexDirection: 'row' }}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={styles.lbl}>Sets</Text>
                    <TextInput style={styles.input} placeholder="3" placeholderTextColor={C.muted} keyboardType="numeric" value={logSets} onChangeText={setLogSets} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.lbl}>Reps</Text>
                    <TextInput style={styles.input} placeholder="1" placeholderTextColor={C.muted} keyboardType="numeric" value={logReps} onChangeText={setLogReps} />
                  </View>
                </View>

                {/* e1RM preview */}
                {logWeight.trim() && logReps.trim() && !isNaN(parseFloat(logWeight)) && !isNaN(parseInt(logReps)) && (
                  <View style={styles.e1rmPreview}>
                    <Text style={styles.e1rmLbl}>Estimated 1RM</Text>
                    <Text style={styles.e1rmVal}>{calc1RM(parseFloat(logWeight), parseInt(logReps,10)).toFixed(1)} kg</Text>
                  </View>
                )}

                <Btn label="Save PR 🏆" color={C.accent} onPress={handleLogPR} />
                <View style={{ height: 10 }} />
                <Btn label="Cancel" color={C.muted} textColor={C.text} onPress={resetLogForm} />
              </>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

function makeStyles(C: any) {
  return StyleSheet.create({
    safe:         { flex: 1, backgroundColor: C.bg },
    header:       { paddingHorizontal: 16, paddingVertical: 14, backgroundColor: C.bg, borderBottomWidth: 1, borderBottomColor: C.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    headerTitle:  { fontSize: 22, fontWeight: '800', color: C.text },
    headerSub:    { fontSize: 11, color: C.muted, marginTop: 2 },
    logBtn:       { backgroundColor: C.accent, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 4, elevation: 5, shadowColor: C.accent, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.4, shadowRadius: 6 },
    logBtnText:   { color: '#fff', fontWeight: '700', fontSize: 13 },
    scroll:       { padding: 16, paddingBottom: 60 },

    // Recent strip
    recentCard:   { backgroundColor: C.card, borderRadius: 16, padding: 12, alignItems: 'center', minWidth: 110, borderWidth: 1, borderColor: C.border, elevation: 4, shadowColor: C.shadowDark, shadowOffset: { width: 2, height: 2 }, shadowOpacity: 0.8, shadowRadius: 6 },
    recentIconWrap:{ width: 28, height: 28, borderRadius: 8, backgroundColor: C.yellow + '22', alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
    recentEx:     { fontSize: 11, fontWeight: '700', color: C.text, textAlign: 'center', maxWidth: 100 },
    recentWeight: { fontSize: 12, fontWeight: '800', marginTop: 2 },
    recentOrm:    { fontSize: 10, color: C.yellow, fontWeight: '600' },
    recentDate:   { fontSize: 10, color: C.muted, marginTop: 2 },

    // PR Cards (starred)
    prCard:       { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: 16, padding: 14, marginBottom: 10, gap: 12, borderWidth: 1, borderColor: C.border, elevation: 5, shadowColor: C.shadowDark, shadowOffset: { width: 3, height: 3 }, shadowOpacity: 0.8, shadowRadius: 8 },
    prIcon:       { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    prName:       { fontSize: 14, fontWeight: '700', color: C.text, marginBottom: 2 },
    pr1rm:        { fontSize: 11, color: C.yellow },
    prWeight:     { fontSize: 14, fontWeight: '700' },
    prDate:       { fontSize: 10, color: C.muted },
    starBtn:      { padding: 4 },

    emptyTitle:   { fontSize: 15, fontWeight: '700', color: C.text, textAlign: 'center' },
    emptySub:     { fontSize: 12, color: C.muted, textAlign: 'center', marginTop: 6, lineHeight: 18 },

    // View All
    viewAllBtn:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: C.accentDim, borderRadius: 16, paddingVertical: 14, marginBottom: 4, marginTop: 4, borderWidth: 1, borderColor: C.accent + '44' },
    viewAllText:  { fontSize: 14, fontWeight: '700', color: C.accent, flex: 1, textAlign: 'center' },

    // Day PR
    dayRow:       { flexDirection: 'row', alignItems: 'center', paddingVertical: 9, gap: 8, borderBottomWidth: 1, borderBottomColor: C.border },
    dayName:      { fontSize: 13, fontWeight: '600', color: C.text, flex: 1 },
    dayWeight:    { fontSize: 13, fontWeight: '700' },
    ormBadge:     { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
    ormText:      { fontSize: 11, fontWeight: '800' },

    // Chart
    chartHead:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, paddingBottom: 0 },
    chartTitle:   { fontSize: 15, fontWeight: '700', color: C.text },
    chartPeak:    { fontSize: 11, color: C.yellow, marginTop: 2, fontWeight: '600' },
    changeBtn:    { backgroundColor: C.accentDim, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: C.accent + '33' },
    changeBtnTxt: { fontSize: 12, color: C.accent, fontWeight: '600' },
    table:        { marginHorizontal: 16, marginBottom: 16, borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: C.border },
    tr:           { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: C.border },
    th:           { backgroundColor: C.border },
    thTxt:        { fontWeight: '700', color: C.muted },
    tc:           { flex: 1, fontSize: 11, color: C.textSub, padding: 8, textAlign: 'center' },
    prRow:        { backgroundColor: C.greenDim },

    // Modal shared
    overlay:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.72)', justifyContent: 'flex-end' },
    sheet:        { backgroundColor: C.card, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: 40, borderWidth: 1, borderColor: C.border, elevation: 20, shadowColor: '#000', shadowOffset: { width: 0, height: -6 }, shadowOpacity: 0.5, shadowRadius: 16 },
    handle:       { width: 40, height: 5, backgroundColor: C.border, borderRadius: 3, alignSelf: 'center', marginBottom: 16 },
    sheetTitle:   { fontSize: 20, fontWeight: '800', color: C.text, marginBottom: 16 },
    lbl:          { fontSize: 11, color: C.muted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6, marginTop: 10 },

    // Log modal
    exToggleRow:  { flexDirection: 'row', gap: 8, marginBottom: 10 },
    exToggleBtn:  { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 12, backgroundColor: C.bg, borderWidth: 1, borderColor: C.border, elevation: 2, shadowColor: C.shadowDark, shadowOffset: { width: 2, height: 2 }, shadowOpacity: 0.6, shadowRadius: 4 },
    exToggleTxt:  { fontSize: 13, fontWeight: '700', color: C.muted },
    exSelector:   { backgroundColor: C.bg, borderRadius: 14, padding: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: C.border, elevation: 4, shadowColor: C.shadowDark, shadowOffset: { width: 4, height: 4 }, shadowOpacity: 0.9, shadowRadius: 8 },
    exSelectorTxt:{ fontSize: 15, fontWeight: '700', color: C.text, flex: 1 },
    input:        { backgroundColor: C.bg, borderRadius: 12, padding: 13, fontSize: 16, fontWeight: '700', color: C.text, borderWidth: 1, borderColor: C.border, elevation: 4, shadowColor: C.shadowDark, shadowOffset: { width: 4, height: 4 }, shadowOpacity: 0.9, shadowRadius: 8 },
    unitToggle:   { flexDirection: 'row', borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: C.border, elevation: 3, shadowColor: C.shadowDark, shadowOffset: { width: 3, height: 3 }, shadowOpacity: 0.8, shadowRadius: 6 },
    unitBtn:      { paddingHorizontal: 14, paddingVertical: 13, backgroundColor: C.bg },
    unitActive:   { backgroundColor: C.accent },
    unitTxt:      { fontSize: 13, fontWeight: '700', color: C.textSub },
    e1rmPreview:  { backgroundColor: C.accentDim, borderRadius: 12, padding: 12, marginTop: 12, marginBottom: 4, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: C.accent + '33' },
    e1rmLbl:      { fontSize: 12, color: C.accent, fontWeight: '600' },
    e1rmVal:      { fontSize: 18, fontWeight: '800', color: C.accent },

    // All PRs list
    allRow:       { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.bg, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: C.border, elevation: 2, shadowColor: C.shadowDark, shadowOffset: { width: 2, height: 2 }, shadowOpacity: 0.5, shadowRadius: 4 },
    starBtnLarge: { padding: 4 },

    // Picker
    pickerRow:    { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    pickerTxt:    { fontSize: 15, color: C.text, fontWeight: '500' },
    searchBox:    { flexDirection: 'row', alignItems: 'center', backgroundColor: C.bg, borderRadius: 12, paddingHorizontal: 12, marginBottom: 12, borderWidth: 1, borderColor: C.border },
    searchInput:  { flex: 1, paddingVertical: 10, fontSize: 14, color: C.text, fontWeight: '600' },
  });
}
