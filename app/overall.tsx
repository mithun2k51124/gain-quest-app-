import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getTodayLog, getGoals, DailyLog, Goals } from '../db/database';
import { Card, ProgressBar, Ring, SectionHeader } from '../components/ui';
import { useTheme } from '../contexts/ThemeContext';

export default function OverallScreen() {
  const { C } = useTheme();
  const [log, setLog] = useState<DailyLog | null>(null);
  const [goals, setGoals] = useState<Goals | null>(null);
  const [refresh, setRefresh] = useState(false);

  const load = useCallback(() => {
    setLog(getTodayLog());
    setGoals(getGoals());
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = () => {
    setRefresh(true);
    load();
    setRefresh(false);
  };

  if (!log || !goals) return null;

  const styles = makeStyles(C);

  const waterPct = Math.min((log.water_intake || 0) / goals.water_goal, 1);
  const caloriePct = Math.min((log.calorie_intake || 0) / goals.calorie_goal, 1);
  const proteinPct = Math.min((log.protein_intake || 0) / goals.protein_goal, 1);
  const creatinePct = log.creatine_taken ? 1 : 0;

  const score = Math.round(
    waterPct * 30 +
    caloriePct * 30 +
    proteinPct * 20 +
    creatinePct * 20
  );

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Overall</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refresh} onRefresh={onRefresh} tintColor={C.accent} />}
      >
        <SectionHeader title="Today Score" />
        <Card accent={C.accent}>
          <View style={styles.scoreBox}>
            <Ring value={score / 100} color={C.accent} size={120} />
            <Text style={styles.scoreText}>{score}/100</Text>
            <Text style={styles.scoreSub}>Based on water, calories, protein, and creatine.</Text>
          </View>
        </Card>

        <SectionHeader title="Intake Details" />
        <Metric label="Water" value={`${log.water_intake.toFixed(2)} / ${goals.water_goal} L`} pct={waterPct} color={C.water} />
        <Metric label="Calories" value={`${log.calorie_intake} / ${goals.calorie_goal} kcal`} pct={caloriePct} color={C.calories} />
        <Metric label="Protein" value={`${Math.round(log.protein_intake)} / ${goals.protein_goal} g`} pct={proteinPct} color={C.protein} />
        <Metric label="Creatine" value={log.creatine_taken ? 'Taken' : 'Not taken'} pct={creatinePct} color={log.creatine_taken ? C.green : C.red} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Metric({
  label, value, pct, color,
}: { label: string; value: string; pct: number; color: string }) {
  const { C } = useTheme();
  const styles = makeStyles(C);
  return (
    <Card accent={color}>
      <View style={styles.metric}>
        <View style={styles.metricTop}>
          <Text style={styles.metricLabel}>{label}</Text>
          <Text style={[styles.metricValue, { color }]}>{value}</Text>
        </View>
        <ProgressBar value={pct} color={color} height={8} />
      </View>
    </Card>
  );
}

function makeStyles(C: any) { return StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: C.bg,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  headerTitle: { fontSize: 22, fontWeight: '800', color: C.text },
  scroll: { padding: 16, paddingBottom: 40 },
  scoreBox: { padding: 20, alignItems: 'center' },
  scoreText: { fontSize: 28, fontWeight: '900', color: C.text, marginTop: 10 },
  scoreSub: { fontSize: 12, color: C.muted, marginTop: 4, textAlign: 'center' },
  metric: { padding: 16 },
  metricTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  metricLabel: { color: C.text, fontSize: 14, fontWeight: '700' },
  metricValue: { fontSize: 13, fontWeight: '700' },
}); }
