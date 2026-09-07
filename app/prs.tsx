// app/prs.tsx — Personal Records Screen
import React, { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  RefreshControl, Dimensions, TextInput, Modal,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { VictoryChart, VictoryLine, VictoryScatter, VictoryAxis,
         VictoryArea, VictoryLabel } from 'victory-native';
import {
  getAllPRs, getExerciseHistory, getAllExerciseNames,
  getPRProgressionHistory, logPRManually,
  PR, ExerciseLog, PRProgressionEntry,
} from '../db/database';
import { Card, SectionHeader, PickerModal, EmptyState, Btn } from '../components/ui';
import { useTheme } from '../contexts/ThemeContext';
import { useCustomAlert } from '../contexts/AlertContext';
import { FEATURED_EXERCISES, EXERCISE_LIBRARY, MUSCLE_GROUPS } from '../constants/theme';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

const { width: SW } = Dimensions.get('window');

function calc1RM(weight: number, reps: number): number {
  return reps === 1 ? weight : weight * (1 + reps / 30);
}

export default function PRScreen() {
  const { showAlert } = useCustomAlert();


  const { C } = useTheme();
  const styles = makeStyles(C);
  const [prs,       setPrs]       = useState<PR[]>([]);
  const [history,   setHistory]   = useState<PRProgressionEntry[]>([]);
  const [selEx,     setSelEx]     = useState('Bench Press');
  const [exNames,   setExNames]   = useState<string[]>([]);
  const [exModal,   setExModal]   = useState(false);
  const [refresh,   setRefresh]   = useState(false);

  // Log PR modal state
  const [logModal,    setLogModal]    = useState(false);
  const [logExModal,  setLogExModal]  = useState(false);
  const [logEx,       setLogEx]       = useState('Bench Press');
  const [logWeight,   setLogWeight]   = useState('');
  const [logSets,     setLogSets]     = useState('3');
  const [logReps,     setLogReps]     = useState('1');
  const [logUnit,     setLogUnit]     = useState<'kg' | 'lbs'>('kg');

  const load = useCallback(() => {
    setPrs(getAllPRs());
    const names = getAllExerciseNames();
    const featured = FEATURED_EXERCISES.map(f => f.name);
    // All exercise library names
    const libNames = Object.values(EXERCISE_LIBRARY).flat();
    const combined = [
      ...featured,
      ...libNames.filter(n => !featured.includes(n)),
      ...names.filter(n => !featured.includes(n) && !libNames.includes(n)),
    ];
    // Deduplicate
    setExNames([...new Set(combined)]);
    setHistory(getPRProgressionHistory(selEx));
  }, [selEx]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );
  const onRefresh = () => { setRefresh(true); load(); setRefresh(false); };

  const prMap = Object.fromEntries(prs.map(p => [p.exercise_name, p]));

  const chartData = history.map((h, i) => ({
    x: i + 1,
    y: parseFloat(calc1RM(h.weight, h.reps).toFixed(1)),
    weight: h.weight,
    reps: h.reps,
    date: h.session_date,
  }));

  const maxPoint = chartData.length
    ? chartData.reduce((a, b) => a.y > b.y ? a : b)
    : null;

  // All exercise options for log modal
  const allLogExOptions = (() => {
    const featured = FEATURED_EXERCISES.map(f => f.name);
    const libNames = Object.values(EXERCISE_LIBRARY).flat();
    const names = getAllExerciseNames();
    const all = [...featured, ...libNames, ...names];
    return [...new Set(all)].map(n => ({ label: n, value: n }));
  })();

  const handleLogPR = () => {
    const w = parseFloat(logWeight);
    const s = parseInt(logSets, 10);
    const r = parseInt(logReps, 10);

    if (!logEx.trim()) { showAlert('Error', 'Select an exercise.'); return; }
    if (isNaN(w) || w <= 0) { showAlert('Error', 'Enter a valid weight.'); return; }
    if (isNaN(s) || s <= 0) { showAlert('Error', 'Enter valid sets (e.g. 3).'); return; }
    if (isNaN(r) || r <= 0) { showAlert('Error', 'Enter valid reps (e.g. 1).'); return; }

    const e1rm = calc1RM(w, r);
    const existing = prMap[logEx];

    if (existing && e1rm <= existing.one_rep_max) {
      showAlert(
        'Not a PR',
        `Your current e1RM for ${logEx} is ${existing.one_rep_max.toFixed(1)} kg.\nThis lift (${e1rm.toFixed(1)} kg e1RM) doesn't beat it.\n\nLog anyway?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Log Anyway',
            onPress: () => {
              logPRManually(logEx, s, r, w, logUnit);
              resetLogForm();
              load();
              setHistory(getPRProgressionHistory(logEx));
              showAlert('Logged ✓', `PR saved for ${logEx}`);
            },
          },
        ]
      );
      return;
    }

    logPRManually(logEx, s, r, w, logUnit);
    resetLogForm();
    load();
    setHistory(getPRProgressionHistory(logEx));
    showAlert('New PR!', `${logEx}\n${w}${logUnit} × ${r} reps\ne1RM: ${e1rm.toFixed(1)} kg`);
  };

  const resetLogForm = () => {
    setLogModal(false);
    setLogWeight('');
    setLogSets('3');
    setLogReps('1');
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Personal Records</Text>
          <Text style={styles.headerSub}>Epley e1RM formula</Text>
        </View>
        {/* Log PR button */}
        <TouchableOpacity style={styles.logBtn} onPress={() => setLogModal(true)}>
          <Text style={styles.logBtnText}>+ Log PR</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refresh} onRefresh={onRefresh} tintColor={C.accent} />}>

        {/* ── Featured PR Cards ──────────────────────────────────────── */}
        <SectionHeader title="Featured Lifts" />
        {FEATURED_EXERCISES.map(fe => {
          const pr = prMap[fe.name];
          return (
            <TouchableOpacity key={fe.name}
              style={styles.prCard}
              onPress={() => { setSelEx(fe.name); setHistory(getPRProgressionHistory(fe.name)); }}>
              <View style={[styles.prIcon, { backgroundColor: fe.color + '22' }]}>
                {fe.family === 'MaterialCommunityIcons' ? (
                  <MaterialCommunityIcons name={fe.icon as any} size={24} color={fe.color} />
                ) : (
                  <Ionicons name={fe.icon as any} size={22} color={fe.color} />
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.prName}>{fe.name}</Text>
                <Text style={styles.prMuscle}>{fe.muscle}</Text>
              </View>
              {pr ? (
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[styles.prWeight, { color: fe.color }]}>
                    {pr.weight}{pr.unit} × {pr.reps}
                  </Text>
                  <Text style={styles.pr1rm}>e1RM {pr.one_rep_max.toFixed(1)} kg</Text>
                  <Text style={styles.prDate}>{pr.record_date}</Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.logSmallBtn}
                  onPress={() => {
                    setLogEx(fe.name);
                    setLogModal(true);
                  }}
                >
                  <Text style={styles.logSmallText}>+ Log</Text>
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          );
        })}

        {/* Other PRs not in featured */}
        {prs.filter(p => !FEATURED_EXERCISES.find(f => f.name === p.exercise_name)).map(pr => (
          <TouchableOpacity key={pr.exercise_name}
            style={styles.prCard}
            onPress={() => { setSelEx(pr.exercise_name); setHistory(getPRProgressionHistory(pr.exercise_name)); }}>
            <View style={[styles.prIcon, { backgroundColor: C.accentDim }]}>
              <Ionicons name="trophy-outline" size={24} color={C.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.prName}>{pr.exercise_name}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[styles.prWeight, { color: C.accent }]}>
                {pr.weight}{pr.unit} × {pr.reps}
              </Text>
              <Text style={styles.pr1rm}>e1RM {pr.one_rep_max.toFixed(1)} kg</Text>
            </View>
          </TouchableOpacity>
        ))}

        {/* ── Progression Chart ──────────────────────────────────────── */}
        <SectionHeader title="Progression Chart" />
        <Card accent={C.accent}>
          <View style={styles.chartHeader}>
            <Text style={styles.chartTitle}>{selEx}</Text>
            <TouchableOpacity style={styles.changeBtn} onPress={() => setExModal(true)}>
              <Text style={styles.changeBtnText}>Change ›</Text>
            </TouchableOpacity>
          </View>

          {chartData.length < 2 ? (
            <EmptyState icon="stats-chart-outline"
              message={`No history for ${selEx}`}
              sub="Log this exercise in Workouts or tap '+ Log PR' above" />
          ) : (
            <>
              <VictoryChart
                width={SW - 40}
                height={220}
                padding={{ top: 20, bottom: 50, left: 50, right: 20 }}
                style={{ background: { fill: 'transparent' } }}
              >
                <VictoryAxis
                  tickFormat={(t) => {
                    const d = chartData[t - 1];
                    return d ? d.date.slice(5) : '';
                  }}
                  style={{
                    axis: { stroke: C.border },
                    tickLabels: { fill: C.muted, fontSize: 9, angle: -30 },
                    grid: { stroke: 'transparent' },
                  }}
                />
                <VictoryAxis dependentAxis
                  style={{
                    axis: { stroke: C.border },
                    tickLabels: { fill: C.muted, fontSize: 9 },
                    grid: { stroke: C.border, strokeDasharray: '4,4' },
                  }}
                />
                <VictoryArea
                  data={chartData}
                  style={{
                    data: { fill: C.accent + '22', stroke: C.accent, strokeWidth: 2.5 },
                  }}
                  interpolation="monotoneX"
                />
                <VictoryScatter
                  data={chartData}
                  size={5}
                  style={{ data: { fill: C.accent } }}
                />
                {maxPoint && (
                  <VictoryScatter
                    data={[maxPoint]}
                    size={7}
                    style={{ data: { fill: C.yellow } }}
                    labels={() => `PR\n${maxPoint.y}`}
                    labelComponent={
                      <VictoryLabel
                        dy={-18}
                        style={{ fill: C.yellow, fontSize: 9, fontWeight: '700' }}
                      />
                    }
                  />
                )}
              </VictoryChart>

              {/* History Table */}
              <View style={styles.table}>
                <View style={[styles.tableRow, styles.tableHeader]}>
                  {['Date','Weight','Sets×Reps','e1RM'].map(h => (
                    <Text key={h} style={[styles.tableCell, styles.tableHeaderText]}>{h}</Text>
                  ))}
                </View>
                {history.slice(-8).map((h, i) => {
                  const orm = calc1RM(h.weight, h.reps);
                  const isPR = maxPoint && orm === maxPoint.y;
                  return (
                    <View key={i} style={[styles.tableRow, isPR && styles.prRow]}>
                      <Text style={[styles.tableCell, isPR && { color: C.yellow }]}>
                        {h.session_date.slice(5)}
                      </Text>
                      <Text style={[styles.tableCell, { color: C.accent }]}>
                        {h.weight}{h.unit}
                      </Text>
                      <Text style={[styles.tableCell, { color: C.textSub }]}>
                        {h.sets}×{h.reps}
                      </Text>
                      <Text style={[styles.tableCell, isPR && { color: C.yellow, fontWeight: '700' }]}>
                        {orm.toFixed(1)}{isPR ? ' ★' : ''}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </>
          )}
        </Card>
      </ScrollView>

      {/* ── Exercise picker for chart ── */}
      <PickerModal
        visible={exModal}
        title="Select Exercise"
        options={exNames.map(n => ({ label: n, value: n }))}
        onSelect={v => { setSelEx(v); setHistory(getPRProgressionHistory(v)); }}
        onClose={() => setExModal(false)}
      />

      {/* ── Log PR exercise picker ── */}
      <PickerModal
        visible={logExModal}
        title="Select Exercise"
        options={allLogExOptions}
        onSelect={v => { setLogEx(v); setLogExModal(false); }}
        onClose={() => setLogExModal(false)}
      />

      {/* ── Log PR Modal ── */}
      <Modal visible={logModal} transparent animationType="slide" onRequestClose={resetLogForm}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={resetLogForm}>
          <TouchableOpacity activeOpacity={1} style={styles.sheet} onPress={e => e.stopPropagation()}>
            <View style={styles.sheetHandle} />
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
              <Ionicons name="trophy-outline" size={24} color={C.text} style={{ marginRight: 8 }} />
              <Text style={[styles.sheetTitle, { marginBottom: 0 }]}>Log a PR</Text>
            </View>

            {/* Exercise selector */}
            <Text style={styles.fieldLabel}>Exercise</Text>
            <TouchableOpacity style={styles.exSelector} onPress={() => setLogExModal(true)}>
              <Text style={styles.exSelectorText}>{logEx}</Text>
              <Text style={{ color: C.accent, fontSize: 16, fontWeight: '700' }}>›</Text>
            </TouchableOpacity>

            {/* Weight */}
            <Text style={styles.fieldLabel}>Weight</Text>
            <View style={styles.weightRow}>
              <TextInput
                style={[styles.input, { flex: 1, marginRight: 10 }]}
                placeholder="e.g. 100"
                placeholderTextColor={C.muted}
                keyboardType="decimal-pad"
                value={logWeight}
                onChangeText={setLogWeight}
              />
              {/* kg / lbs toggle */}
              <View style={styles.unitToggle}>
                {(['kg', 'lbs'] as const).map(u => (
                  <TouchableOpacity
                    key={u}
                    style={[styles.unitBtn, logUnit === u && styles.unitBtnActive]}
                    onPress={() => setLogUnit(u)}
                  >
                    <Text style={[styles.unitBtnText, logUnit === u && { color: '#fff' }]}>{u}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Sets & Reps */}
            <View style={styles.setsRepsRow}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={styles.fieldLabel}>Sets</Text>
                <TextInput
                  style={styles.input}
                  placeholder="3"
                  placeholderTextColor={C.muted}
                  keyboardType="numeric"
                  value={logSets}
                  onChangeText={setLogSets}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Reps</Text>
                <TextInput
                  style={styles.input}
                  placeholder="1"
                  placeholderTextColor={C.muted}
                  keyboardType="numeric"
                  value={logReps}
                  onChangeText={setLogReps}
                />
              </View>
            </View>

            {/* e1RM preview */}
            {logWeight.trim() && logReps.trim() && !isNaN(parseFloat(logWeight)) && !isNaN(parseInt(logReps)) && (
              <View style={styles.e1rmPreview}>
                <Text style={styles.e1rmLabel}>Estimated 1RM</Text>
                <Text style={styles.e1rmValue}>
                  {calc1RM(parseFloat(logWeight), parseInt(logReps, 10)).toFixed(1)} kg
                </Text>
              </View>
            )}

            <Btn label="Save PR" color={C.accent} onPress={handleLogPR} />
            <View style={{ height: 10 }} />
            <Btn label="Cancel" color={C.muted} textColor={C.text} onPress={resetLogForm} />
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

function makeStyles(C: any) { return StyleSheet.create({
  safe:        { flex: 1, backgroundColor: C.bg },
  header:      {
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: C.bg,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: { fontSize: 22, fontWeight: '800', color: C.text },
  headerSub:   { fontSize: 11, color: C.muted, marginTop: 2 },
  logBtn: {
    backgroundColor: C.accent,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
    shadowColor: '#BFC8D6',
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 0.9,
    shadowRadius: 8,
    elevation: 5,
  },
  logBtnText:  { color: '#fff', fontWeight: '700', fontSize: 13 },
  scroll:      { padding: 16, paddingBottom: 40 },
  prCard:      {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.card,
    borderRadius: 16,
    borderWidth: 0,
    padding: 14,
    marginBottom: 12,
    gap: 12,
    shadowColor: '#BFC8D6',
    shadowOffset: { width: 5, height: 5 },
    shadowOpacity: 0.9,
    shadowRadius: 10,
    elevation: 6,
  },
  prIcon:      { width: 46, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  prName:      { fontSize: 14, fontWeight: '700', color: C.text, marginBottom: 2 },
  prMuscle:    { fontSize: 11, color: C.muted },
  prWeight:    { fontSize: 14, fontWeight: '700' },
  pr1rm:       { fontSize: 11, color: C.yellow },
  prDate:      { fontSize: 10, color: C.muted },
  noPr:        { fontSize: 12, color: C.muted },
  logSmallBtn: {
    backgroundColor: C.accentDim,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  logSmallText: { fontSize: 12, color: C.accent, fontWeight: '700' },
  chartHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, paddingBottom: 0 },
  chartTitle:  { fontSize: 15, fontWeight: '700', color: C.text },
  changeBtn:   { backgroundColor: C.accentDim, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  changeBtnText:{ fontSize: 12, color: C.accent, fontWeight: '600' },
  table:       { marginHorizontal: 16, marginBottom: 16, borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: C.border },
  tableRow:    { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: C.border },
  tableHeader: { backgroundColor: C.border },
  tableHeaderText: { fontWeight: '700', color: C.muted },
  tableCell:   { flex: 1, fontSize: 11, color: C.textSub, padding: 8, textAlign: 'center' },
  prRow:       { backgroundColor: C.greenDim },

  // Log PR Modal
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(40,50,70,0.35)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: C.card,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 20,
    paddingBottom: 40,
    shadowColor: '#BFC8D6',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 20,
  },
  sheetHandle: {
    width: 40,
    height: 5,
    backgroundColor: C.shadowDark,
    borderRadius: 3,
    alignSelf: 'center',
    marginBottom: 16,
  },
  sheetTitle:  { fontSize: 20, fontWeight: '800', color: C.text, marginBottom: 16 },
  fieldLabel:  { fontSize: 11, color: C.muted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6, marginTop: 10 },
  exSelector:  {
    backgroundColor: C.card,
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#BFC8D6',
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 0.9,
    shadowRadius: 8,
    elevation: 4,
  },
  exSelectorText: { fontSize: 15, fontWeight: '700', color: C.text },
  weightRow:   { flexDirection: 'row', alignItems: 'center' },
  input: {
    backgroundColor: C.bg,
    borderRadius: 12,
    padding: 13,
    fontSize: 16,
    fontWeight: '700',
    color: C.text,
    shadowColor: '#BFC8D6',
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 0.9,
    shadowRadius: 8,
    elevation: 4,
  },
  unitToggle:  { flexDirection: 'row', borderRadius: 12, overflow: 'hidden', shadowColor: '#BFC8D6', shadowOffset: { width: 3, height: 3 }, shadowOpacity: 0.8, shadowRadius: 6, elevation: 3 },
  unitBtn:     { paddingHorizontal: 14, paddingVertical: 13, backgroundColor: C.bg },
  unitBtnActive: { backgroundColor: C.accent },
  unitBtnText: { fontSize: 13, fontWeight: '700', color: C.textSub },
  setsRepsRow: { flexDirection: 'row' },
  e1rmPreview: {
    backgroundColor: C.accentDim,
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
    marginBottom: 4,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  e1rmLabel:   { fontSize: 12, color: C.accent, fontWeight: '600' },
  e1rmValue:   { fontSize: 18, fontWeight: '800', color: C.accent },
}); }
