// app/prs.tsx — Personal Records Screen
import React, { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  RefreshControl, Dimensions,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { VictoryChart, VictoryLine, VictoryScatter, VictoryAxis,
         VictoryTheme, VictoryArea, VictoryLabel } from 'victory-native';
import {
  getAllPRs, getExerciseHistory, getAllExerciseNames,
  PR, ExerciseLog,
} from '../db/database';
import { Card, SectionHeader, PickerModal, EmptyState } from '../components/ui';
import { C, FEATURED_EXERCISES } from '../constants/theme';

const { width: SW } = Dimensions.get('window');

function calc1RM(weight: number, reps: number): number {
  return reps === 1 ? weight : weight * (1 + reps / 30);
}

export default function PRScreen() {
  const [prs,       setPrs]       = useState<PR[]>([]);
  const [history,   setHistory]   = useState<ExerciseLog[]>([]);
  const [selEx,     setSelEx]     = useState('Bench Press');
  const [exNames,   setExNames]   = useState<string[]>([]);
  const [exModal,   setExModal]   = useState(false);
  const [refresh,   setRefresh]   = useState(false);

  const load = useCallback(() => {
    setPrs(getAllPRs());
    const names = getAllExerciseNames();
    const featured = FEATURED_EXERCISES.map(f => f.name);
    const combined = [...featured, ...names.filter(n => !featured.includes(n))];
    setExNames(combined);
    setHistory(getExerciseHistory(selEx));
  }, [selEx]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
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

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Personal Records</Text>
        <Text style={styles.headerSub}>Epley e1RM formula</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refresh} onRefresh={onRefresh} tintColor={C.accent} />}>

        {/* ── Featured PR Cards ──────────────────────────────────────── */}
        <SectionHeader title="Featured Lifts" />
        {FEATURED_EXERCISES.map(fe => {
          const pr = prMap[fe.name];
          return (
            <TouchableOpacity key={fe.name}
              style={[styles.prCard, { borderColor: pr ? fe.color : C.border }]}
              onPress={() => { setSelEx(fe.name); setHistory(getExerciseHistory(fe.name)); }}>
              <View style={[styles.prIcon, { backgroundColor: fe.color + '22' }]}>
                <Text style={{ fontSize: 22 }}>{fe.icon}</Text>
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
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.noPr}>No record</Text>
                  <Text style={{ fontSize: 10, color: C.accent }}>Log it →</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}

        {/* Other PRs not in featured */}
        {prs.filter(p => !FEATURED_EXERCISES.find(f => f.name === p.exercise_name)).map(pr => (
          <TouchableOpacity key={pr.exercise_name}
            style={[styles.prCard, { borderColor: C.accent }]}
            onPress={() => { setSelEx(pr.exercise_name); setHistory(getExerciseHistory(pr.exercise_name)); }}>
            <View style={[styles.prIcon, { backgroundColor: C.accentDim }]}>
              <Text style={{ fontSize: 22 }}>🏆</Text>
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
            <EmptyState icon="📈"
              message={`No history for ${selEx}`}
              sub="Log this exercise in Workouts to see progression" />
          ) : (
            <>
              <VictoryChart
                width={SW - 40}
                height={220}
                theme={VictoryTheme.material}
                padding={{ top: 20, bottom: 50, left: 50, right: 20 }}
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
                        {orm.toFixed(1)}{isPR ? ' 🏆' : ''}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </>
          )}
        </Card>
      </ScrollView>

      <PickerModal
        visible={exModal}
        title="Select Exercise"
        options={exNames.map(n => ({ label: n, value: n }))}
        onSelect={v => { setSelEx(v); setHistory(getExerciseHistory(v)); }}
        onClose={() => setExModal(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:        { flex: 1, backgroundColor: C.bg },
  header:      { paddingHorizontal: 16, paddingVertical: 14, backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border },
  headerTitle: { fontSize: 22, fontWeight: '800', color: C.text },
  headerSub:   { fontSize: 11, color: C.muted, marginTop: 2 },
  scroll:      { padding: 16, paddingBottom: 40 },
  prCard:      { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 10, gap: 12 },
  prIcon:      { width: 46, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  prName:      { fontSize: 14, fontWeight: '700', color: C.text, marginBottom: 2 },
  prMuscle:    { fontSize: 11, color: C.muted },
  prWeight:    { fontSize: 14, fontWeight: '700' },
  pr1rm:       { fontSize: 11, color: C.yellow },
  prDate:      { fontSize: 10, color: C.muted },
  noPr:        { fontSize: 12, color: C.muted },
  chartHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, paddingBottom: 0 },
  chartTitle:  { fontSize: 15, fontWeight: '700', color: C.text },
  changeBtn:   { backgroundColor: C.accentDim, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  changeBtnText:{ fontSize: 12, color: C.accent, fontWeight: '600' },
  table:       { marginHorizontal: 16, marginBottom: 16, borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: C.border },
  tableRow:    { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: C.border },
  tableHeader: { backgroundColor: C.surface },
  tableHeaderText: { fontWeight: '700', color: C.muted },
  tableCell:   { flex: 1, fontSize: 11, color: C.textSub, padding: 8, textAlign: 'center' },
  prRow:       { backgroundColor: '#0A1A00' },
});
