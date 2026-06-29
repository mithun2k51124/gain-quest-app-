// app/analytics.tsx — Analytics Screen
import React, { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, Alert, RefreshControl, Dimensions,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { VictoryChart, VictoryLine, VictoryScatter, VictoryAxis,
         VictoryTheme, VictoryBar, VictoryArea, VictoryLabel } from 'victory-native';
import {
  getWeeklyStats, getLastNDaysLogs, getWeightHistory,
  logWeight, getLatestWeight, getGoals, getMuscleTracker,
  todayStr, DailyLog,
} from '../db/database';
import { Card, SectionHeader, Btn, ProgressBar } from '../components/ui';
import { C, MUSCLE_GROUPS } from '../constants/theme';

const { width: SW } = Dimensions.get('window');
type Tab = 'Overview' | 'Weight' | 'Nutrition' | 'Workouts';

export default function AnalyticsScreen() {
  const [tab,       setTab]      = useState<Tab>('Overview');
  const [weekly,    setWeekly]   = useState<any>(null);
  const [logs,      setLogs]     = useState<DailyLog[]>([]);
  const [weights,   setWeights]  = useState<any[]>([]);
  const [muscles,   setMuscles]  = useState<any[]>([]);
  const [goals,     setGoals]    = useState<any>(null);
  const [latestW,   setLatestW]  = useState<number | null>(null);
  const [weightInput, setWeightInput] = useState('');
  const [refresh,   setRefresh]  = useState(false);

  const load = useCallback(() => {
    setWeekly(getWeeklyStats());
    setLogs(getLastNDaysLogs(30));
    setWeights(getWeightHistory(60));
    setMuscles(getMuscleTracker());
    setGoals(getGoals());
    setLatestW(getLatestWeight());
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  const onRefresh = () => { setRefresh(true); load(); setRefresh(false); };

  const handleLogWeight = () => {
    const w = parseFloat(weightInput);
    if (!w || isNaN(w)) { Alert.alert('Enter a valid weight.'); return; }
    logWeight(w);
    setWeightInput('');
    load();
  };

  const tabs: Tab[] = ['Overview', 'Weight', 'Nutrition', 'Workouts'];

  // Chart colours array
  const mgColors = MUSCLE_GROUPS.map(m => C.mg[m] || C.accent);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Analytics</Text>
      </View>

      <View style={styles.tabBar}>
        {tabs.map(t => (
          <TouchableOpacity key={t} style={[styles.tabBtn, tab === t && styles.tabActive]}
            onPress={() => setTab(t)}>
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refresh} onRefresh={onRefresh} tintColor={C.accent} />}>

        {/* ── OVERVIEW ───────────────────────────────────────────────── */}
        {tab === 'Overview' && weekly && (
          <>
            <SectionHeader title="This Week" />
            <View style={styles.statsGrid}>
              {[
                { icon:'🏋️', label:'Workouts',      val: weekly.workouts,      color: C.purple },
                { icon:'💧', label:'Water Goals',    val: weekly.waterSuccess,  color: C.water },
                { icon:'🥩', label:'Protein Goals',  val: weekly.proteinSuccess,color: C.protein },
                { icon:'💊', label:'Creatine Days',  val: weekly.creatineTaken, color: C.green },
              ].map((s, i) => (
                <View key={i} style={styles.statBox}>
                  <Text style={{ fontSize: 26 }}>{s.icon}</Text>
                  <Text style={[styles.statNum, { color: s.color }]}>{s.val}</Text>
                  <Text style={styles.statLbl}>{s.label}</Text>
                </View>
              ))}
            </View>

            {/* 30-day consistency */}
            <SectionHeader title="30-Day Consistency" />
            {logs.length > 0 && (
              <Card accent={C.accent}>
                <View style={{ padding: 16 }}>
                  {[
                    { label: '💧 Water',    key: 'water_goal_reached',   color: C.water },
                    { label: '🥩 Protein',  key: 'protein_goal_reached', color: C.protein },
                    { label: '🏋️ Workout',  key: 'workout_completed',    color: C.purple },
                    { label: '💊 Creatine', key: 'creatine_taken',       color: C.green },
                  ].map(({ label, key, color }) => {
                    const done = logs.filter(l => (l as any)[key]).length;
                    const pct  = logs.length ? done / logs.length : 0;
                    return (
                      <View key={key} style={{ marginBottom: 14 }}>
                        <View style={styles.consRow}>
                          <Text style={styles.consLabel}>{label}</Text>
                          <Text style={[styles.consPct, { color }]}>{Math.round(pct * 100)}%</Text>
                        </View>
                        <ProgressBar value={pct} color={color} height={8} />
                      </View>
                    );
                  })}
                </View>
              </Card>
            )}

            {/* Muscle frequency */}
            <SectionHeader title="Muscle Frequency" />
            <Card accent={C.accent}>
              <View style={{ padding: 16 }}>
                {muscles.map(m => {
                  const color = C.mg[m.muscle_group] || C.accent;
                  const max   = Math.max(...muscles.map(x => x.total_sessions), 1);
                  return (
                    <View key={m.muscle_group} style={{ marginBottom: 10 }}>
                      <View style={styles.consRow}>
                        <Text style={[styles.consLabel, { color }]}>{m.muscle_group}</Text>
                        <Text style={[styles.consPct, { color }]}>{m.total_sessions} sessions</Text>
                      </View>
                      <ProgressBar value={m.total_sessions / max} color={color} height={6} />
                    </View>
                  );
                })}
              </View>
            </Card>
          </>
        )}

        {/* ── WEIGHT ─────────────────────────────────────────────────── */}
        {tab === 'Weight' && (
          <>
            <SectionHeader title="Log Weight" />
            <Card accent={C.water}>
              <View style={styles.section}>
                {latestW && (
                  <Text style={styles.currentWeight}>
                    Current: <Text style={{ color: C.water }}>{latestW.toFixed(1)} kg</Text>
                    {goals && (
                      <Text style={{ color: C.muted }}>  |  Goal: {goals.weight_goal} kg</Text>
                    )}
                  </Text>
                )}
                <View style={styles.weightRow}>
                  <TextInput
                    style={[styles.weightInput, { flex: 1, marginRight: 10 }]}
                    placeholder="Weight in kg"
                    placeholderTextColor={C.muted}
                    keyboardType="decimal-pad"
                    value={weightInput}
                    onChangeText={setWeightInput}
                  />
                  <Btn label="Log" color={C.water} onPress={handleLogWeight} />
                </View>
              </View>
            </Card>

            {weights.length >= 2 ? (
              <>
                <SectionHeader title="Weight Trend" />
                <Card accent={C.water}>
                  <VictoryChart
                    width={SW - 40}
                    height={220}
                    theme={VictoryTheme.material}
                    padding={{ top: 20, bottom: 50, left: 50, right: 20 }}
                  >
                    <VictoryAxis
                      tickFormat={(_, i) => {
                        const d = weights[i];
                        return d ? d.record_date.slice(5) : '';
                      }}
                      tickCount={Math.min(weights.length, 7)}
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
                      data={weights.map((w, i) => ({ x: i + 1, y: w.weight }))}
                      style={{ data: { fill: C.water + '22', stroke: C.water, strokeWidth: 2.5 } }}
                      interpolation="monotoneX"
                    />
                    <VictoryScatter
                      data={weights.map((w, i) => ({ x: i + 1, y: w.weight }))}
                      size={4}
                      style={{ data: { fill: C.water } }}
                    />
                    {goals && (
                      <VictoryLine
                        data={[{ x: 1, y: goals.weight_goal }, { x: weights.length, y: goals.weight_goal }]}
                        style={{ data: { stroke: C.yellow, strokeDasharray: '6,3', strokeWidth: 1.5 } }}
                      />
                    )}
                  </VictoryChart>

                  {/* Weight history list */}
                  <View style={styles.table}>
                    {weights.slice(-8).reverse().map((w, i) => (
                      <View key={i} style={[styles.tableRow, i === 0 && { backgroundColor: '#0A1A2A' }]}>
                        <Text style={styles.tableCell}>{w.record_date}</Text>
                        <Text style={[styles.tableCell, { color: C.water, fontWeight: '700' }]}>
                          {w.weight.toFixed(1)} kg
                        </Text>
                        {goals && (
                          <Text style={[styles.tableCell, {
                            color: w.weight <= goals.weight_goal ? C.green : C.red
                          }]}>
                            {(w.weight - goals.weight_goal).toFixed(1)} kg
                          </Text>
                        )}
                      </View>
                    ))}
                  </View>
                </Card>
              </>
            ) : (
              <Card accent={C.water}>
                <View style={{ padding: 30, alignItems: 'center' }}>
                  <Text style={{ fontSize: 36 }}>⚖️</Text>
                  <Text style={{ color: C.muted, marginTop: 10, textAlign: 'center' }}>
                    Log at least 2 weights to see your trend chart
                  </Text>
                </View>
              </Card>
            )}
          </>
        )}

        {/* ── NUTRITION ──────────────────────────────────────────────── */}
        {tab === 'Nutrition' && (
          <>
            <SectionHeader title="30-Day Protein Intake" />
            {logs.length >= 3 ? (
              <Card accent={C.protein}>
                <VictoryChart
                  width={SW - 40}
                  height={200}
                  theme={VictoryTheme.material}
                  padding={{ top: 20, bottom: 50, left: 50, right: 20 }}
                >
                  <VictoryAxis
                    tickCount={6}
                    tickFormat={(_, i) => {
                      const d = logs[Math.floor(i * (logs.length / 6))];
                      return d ? d.log_date.slice(5) : '';
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
                  <VictoryBar
                    data={logs.map((l, i) => ({
                      x: i + 1,
                      y: l.protein_intake || 0,
                      fill: (l.protein_intake || 0) >= (goals?.protein_goal || 120) ? C.green : C.protein,
                    }))}
                    style={{ data: { fill: ({ datum }: any) => datum.fill } }}
                    barWidth={Math.max(4, (SW - 100) / logs.length - 2)}
                  />
                  {goals && (
                    <VictoryLine
                      data={[{ x: 1, y: goals.protein_goal }, { x: logs.length, y: goals.protein_goal }]}
                      style={{ data: { stroke: C.red, strokeDasharray: '4,3', strokeWidth: 1.5 } }}
                    />
                  )}
                </VictoryChart>

                {/* Averages */}
                {logs.filter(l => l.protein_intake > 0).length > 0 && goals && (
                  <View style={{ padding: 16 }}>
                    {[
                      { label: 'Avg Protein', val: `${Math.round(logs.reduce((s,l) => s + (l.protein_intake||0), 0) / logs.length)} g`, color: C.protein },
                      { label: 'Avg Calories', val: `${Math.round(logs.reduce((s,l) => s + (l.calorie_intake||0), 0) / logs.length)} kcal`, color: C.calories },
                      { label: 'Avg Water', val: `${(logs.reduce((s,l) => s + (l.water_intake||0), 0) / logs.length).toFixed(2)} L`, color: C.water },
                    ].map(({ label, val, color }) => (
                      <View key={label} style={styles.avgRow}>
                        <Text style={styles.avgLabel}>{label}</Text>
                        <Text style={[styles.avgVal, { color }]}>{val}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </Card>
            ) : (
              <Card accent={C.protein}>
                <View style={{ padding: 30, alignItems: 'center' }}>
                  <Text style={{ fontSize: 36 }}>🥩</Text>
                  <Text style={{ color: C.muted, marginTop: 10, textAlign: 'center' }}>
                    Log food in the Tracker to see nutrition charts
                  </Text>
                </View>
              </Card>
            )}

            <SectionHeader title="30-Day Calorie Intake" />
            {logs.length >= 3 ? (
              <Card accent={C.calories}>
                <VictoryChart
                  width={SW - 40}
                  height={180}
                  theme={VictoryTheme.material}
                  padding={{ top: 20, bottom: 50, left: 60, right: 20 }}
                >
                  <VictoryAxis
                    tickCount={6}
                    tickFormat={(_, i) => {
                      const d = logs[Math.floor(i * (logs.length / 6))];
                      return d ? d.log_date.slice(5) : '';
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
                    data={logs.map((l, i) => ({ x: i + 1, y: l.calorie_intake || 0 }))}
                    style={{ data: { fill: C.calories + '22', stroke: C.calories, strokeWidth: 2 } }}
                    interpolation="monotoneX"
                  />
                </VictoryChart>
              </Card>
            ) : null}
          </>
        )}

        {/* ── WORKOUTS ───────────────────────────────────────────────── */}
        {tab === 'Workouts' && (
          <>
            <SectionHeader title="Workout Completion (30 days)" />
            {logs.length >= 3 ? (
              <Card accent={C.purple}>
                <VictoryChart
                  width={SW - 40}
                  height={180}
                  theme={VictoryTheme.material}
                  padding={{ top: 20, bottom: 50, left: 40, right: 20 }}
                >
                  <VictoryAxis
                    tickCount={6}
                    tickFormat={(_, i) => {
                      const d = logs[Math.floor(i * (logs.length / 6))];
                      return d ? d.log_date.slice(5) : '';
                    }}
                    style={{
                      axis: { stroke: C.border },
                      tickLabels: { fill: C.muted, fontSize: 9, angle: -30 },
                      grid: { stroke: 'transparent' },
                    }}
                  />
                  <VictoryAxis dependentAxis
                    tickValues={[0, 1]}
                    tickFormat={v => v === 1 ? '✓' : ''}
                    style={{
                      axis: { stroke: C.border },
                      tickLabels: { fill: C.muted, fontSize: 10 },
                      grid: { stroke: C.border, strokeDasharray: '4,4' },
                    }}
                  />
                  <VictoryBar
                    data={logs.map((l, i) => ({
                      x: i + 1,
                      y: l.workout_completed ? 1 : 0,
                    }))}
                    style={{ data: { fill: C.purple } }}
                    barWidth={Math.max(4, (SW - 80) / logs.length - 2)}
                    cornerRadius={{ top: 3 }}
                  />
                </VictoryChart>

                {/* Workout stats summary */}
                <View style={{ padding: 16 }}>
                  {[
                    { label: 'Workouts completed', val: String(logs.filter(l => l.workout_completed).length), color: C.purple },
                    { label: 'Days tracked',        val: String(logs.length), color: C.muted },
                    { label: 'Completion rate',
                      val: logs.length ? `${Math.round(logs.filter(l => l.workout_completed).length / logs.length * 100)}%` : '0%',
                      color: C.green },
                  ].map(({ label, val, color }) => (
                    <View key={label} style={styles.avgRow}>
                      <Text style={styles.avgLabel}>{label}</Text>
                      <Text style={[styles.avgVal, { color }]}>{val}</Text>
                    </View>
                  ))}
                </View>
              </Card>
            ) : (
              <Card accent={C.purple}>
                <View style={{ padding: 30, alignItems: 'center' }}>
                  <Text style={{ fontSize: 36 }}>🏋️</Text>
                  <Text style={{ color: C.muted, marginTop: 10, textAlign: 'center' }}>
                    Log workouts to see completion charts
                  </Text>
                </View>
              </Card>
            )}
          </>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:          { flex: 1, backgroundColor: C.bg },
  header:        { paddingHorizontal: 16, paddingVertical: 14, backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border },
  headerTitle:   { fontSize: 22, fontWeight: '800', color: C.text },
  tabBar:        { flexDirection: 'row', backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border },
  tabBtn:        { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabActive:     { borderBottomWidth: 2, borderBottomColor: C.accent },
  tabText:       { fontSize: 11, color: C.muted, fontWeight: '600' },
  tabTextActive: { color: C.accent },
  scroll:        { padding: 16, paddingBottom: 40 },
  section:       { padding: 16 },
  statsGrid:     { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  statBox:       { flex: 1, minWidth: '45%', backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.border, alignItems: 'center', padding: 16 },
  statNum:       { fontSize: 28, fontWeight: '800', marginTop: 4 },
  statLbl:       { fontSize: 11, color: C.muted, marginTop: 2, textAlign: 'center' },
  consRow:       { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  consLabel:     { fontSize: 13, color: C.textSub, fontWeight: '600' },
  consPct:       { fontSize: 13, fontWeight: '700' },
  currentWeight: { fontSize: 14, color: C.textSub, marginBottom: 12 },
  weightRow:     { flexDirection: 'row', alignItems: 'center' },
  weightInput:   { backgroundColor: C.card, borderRadius: 10, borderWidth: 1, borderColor: C.border, color: C.text, padding: 12, fontSize: 16, fontWeight: '700' },
  table:         { marginHorizontal: 16, marginBottom: 16, borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: C.border },
  tableRow:      { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: C.border },
  tableCell:     { flex: 1, fontSize: 12, color: C.textSub, padding: 10, textAlign: 'center' },
  avgRow:        { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.border },
  avgLabel:      { fontSize: 13, color: C.textSub },
  avgVal:        { fontSize: 13, fontWeight: '700' },
});
