import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
  TextInput,
  Alert,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  getTodayLog,
  getGoals,
  updateGoals,
  addWater,
  getStreak,
  getLatestWeight,
  getTodaysPlan,
  getWeeklyStats,
  DailyLog,
  Goals,
  Streak,
  WorkoutPlan,
} from '../db/database';
import { Card, StatCard, ProgressBar, Ring, MuscleTag, SectionHeader } from '../components/ui';
import { C } from '../constants/theme';

export default function DashboardScreen() {
  const [log, setLog] = useState<DailyLog | null>(null);
  const [goals, setGoals] = useState<Goals | null>(null);
  const [streak, setStreak] = useState<Streak | null>(null);
  const [weight, setWeight] = useState<number | null>(null);
  const [plan, setPlan] = useState<WorkoutPlan | null>(null);
  const [weekly, setWeekly] = useState<any>(null);
  const [refresh, setRefresh] = useState(false);

  const [goalWater, setGoalWater] = useState('');
  const [goalProtein, setGoalProtein] = useState('');
  const [goalCalories, setGoalCalories] = useState('');

  const load = useCallback(() => {
    setLog(getTodayLog());
    setGoals(getGoals());
    setStreak(getStreak());
    setWeight(getLatestWeight());
    setPlan(getTodaysPlan());
    setWeekly(getWeeklyStats());
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = () => {
    setRefresh(true);
    load();
    setRefresh(false);
  };

  if (!log || !goals) return null;

  const waterPct = Math.min((log.water_intake || 0) / goals.water_goal, 1);
  const proteinPct = Math.min((log.protein_intake || 0) / goals.protein_goal, 1);
  const calPct = Math.min((log.calorie_intake || 0) / goals.calorie_goal, 1);

  const saveHomeGoals = () => {
    const next: Partial<Goals> = {};

    if (goalWater.trim()) {
      const value = parseFloat(goalWater);
      if (!isNaN(value) && value > 0) next.water_goal = value;
    }

    if (goalProtein.trim()) {
      const value = parseFloat(goalProtein);
      if (!isNaN(value) && value > 0) next.protein_goal = value;
    }

    if (goalCalories.trim()) {
      const value = parseInt(goalCalories, 10);
      if (!isNaN(value) && value > 0) next.calorie_goal = value;
    }

    if (!Object.keys(next).length) {
      Alert.alert('No changes', 'Enter at least one intake goal.');
      return;
    }

    updateGoals(next);
    setGoalWater('');
    setGoalProtein('');
    setGoalCalories('');
    load();
    Alert.alert('Saved', 'Your intake goals were updated.');
  };

  const habits = [
    { icon: '🏋️', label: 'Workout Completed', done: !!log.workout_completed },
    { icon: '💊', label: 'Creatine Taken', done: !!log.creatine_taken },
    { icon: '💧', label: 'Water Goal Reached', done: !!log.water_goal_reached },
    { icon: '🥩', label: 'Protein Goal Reached', done: !!log.protein_goal_reached },
    { icon: '😴', label: 'Slept 7+ Hours', done: !!log.slept_well },
  ];

  const habitsDone = habits.filter(h => h.done).length;

  const reminders: { icon: string; msg: string; color: string }[] = [];

  if (!log.creatine_taken) reminders.push({ icon: '💊', msg: 'Take your creatine', color: C.orange });
  if (waterPct < 1) reminders.push({ icon: '💧', msg: `Water at ${Math.round(waterPct * 100)}% of goal`, color: C.water });
  if (!log.workout_completed && plan && !plan.plan_name.toLowerCase().includes('rest')) {
    reminders.push({ icon: '🏋️', msg: `Workout: ${plan.plan_name}`, color: C.accent });
  }
  if (proteinPct < 1) reminders.push({ icon: '🥩', msg: 'Hit your protein goal', color: C.protein });
  if (!reminders.length) reminders.push({ icon: '🎉', msg: 'All goals done! Amazing work!', color: C.green });

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Home</Text>
          <Text style={styles.headerDate}>
            {new Date().toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            })}
          </Text>
        </View>
        <Text style={{ fontSize: 32 }}>🏋️</Text>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refresh} onRefresh={onRefresh} tintColor={C.accent} />}
      >
        <View style={styles.row}>
          <StatCard
            icon="⚖️"
            title="Body Weight"
            value={weight ? `${weight.toFixed(1)} kg` : '-- kg'}
            sub={`Goal: ${goals.weight_goal} kg`}
            color={C.water}
          />
          <View style={{ width: 10 }} />
          <StatCard
            icon="🔥"
            title="Streak"
            value={`${streak?.current_streak ?? 0} days`}
            sub={`Best: ${streak?.longest_streak ?? 0}`}
            color="#FF6B35"
          />
        </View>

        <View style={[styles.row, { marginTop: 10 }]}>
          <StatCard
            icon="💊"
            title="Creatine"
            value={log.creatine_taken ? 'Taken' : 'Not Logged'}
            sub={log.creatine_taken ? 'logged today' : 'tap tracker'}
            color={log.creatine_taken ? C.green : C.red}
          />
          <View style={{ width: 10 }} />
          <StatCard
            icon="🏋️"
            title="Workout"
            value={log.workout_completed ? 'Done' : 'Pending'}
            sub={plan?.plan_name ?? 'No plan set'}
            color={log.workout_completed ? C.purple : C.muted}
          />
        </View>

        <SectionHeader title="Intake Goals" />
        <Card accent={C.accent}>
          <View style={styles.goalBox}>
            <TextInput
              style={styles.input}
              placeholder={`Water goal, current ${goals.water_goal} L`}
              placeholderTextColor={C.muted}
              keyboardType="decimal-pad"
              value={goalWater}
              onChangeText={setGoalWater}
            />
            <TextInput
              style={styles.input}
              placeholder={`Protein goal, current ${goals.protein_goal} g`}
              placeholderTextColor={C.muted}
              keyboardType="numeric"
              value={goalProtein}
              onChangeText={setGoalProtein}
            />
            <TextInput
              style={styles.input}
              placeholder={`Calories goal, current ${goals.calorie_goal} kcal`}
              placeholderTextColor={C.muted}
              keyboardType="numeric"
              value={goalCalories}
              onChangeText={setGoalCalories}
            />
            <TouchableOpacity style={styles.saveGoalBtn} onPress={saveHomeGoals}>
              <Text style={styles.saveGoalText}>Save Intake Goals</Text>
            </TouchableOpacity>
          </View>
        </Card>

        <SectionHeader title="Daily Macros" />
        <Card accent={C.water}>
          <View style={styles.macroRow}>
            <Ring value={waterPct} color={C.water} size={80} />
            <View style={styles.macroInfo}>
              <Text style={styles.macroName}>💧 Water</Text>
              <Text style={[styles.macroVal, { color: C.water }]}>
                {log.water_intake.toFixed(2)} / {goals.water_goal} L
              </Text>
              <ProgressBar value={waterPct} color={C.water} height={6} />
              <Text style={styles.macroRem}>
                {waterPct >= 1
                  ? 'Goal reached!'
                  : `${Math.max(goals.water_goal - log.water_intake, 0).toFixed(2)} L remaining`}
              </Text>

              <View style={styles.quickBtns}>
                {[100, 250].map(ml => (
                  <TouchableOpacity
                    key={ml}
                    style={[styles.quickBtn, { borderColor: C.water }]}
                    onPress={() => {
                      addWater(ml);
                      load();
                    }}
                  >
                    <Text style={[styles.quickBtnText, { color: C.water }]}>
                      +{ml}ml
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
        </Card>

        <Card accent={C.protein}>
          <View style={styles.macroRow}>
            <Ring value={proteinPct} color={C.protein} size={80} />
            <View style={styles.macroInfo}>
              <Text style={styles.macroName}>🥩 Protein</Text>
              <Text style={[styles.macroVal, { color: C.protein }]}>
                {Math.round(log.protein_intake)} / {goals.protein_goal} g
              </Text>
              <ProgressBar value={proteinPct} color={C.protein} height={6} />
              <Text style={styles.macroRem}>
                {proteinPct >= 1
                  ? 'Goal reached!'
                  : `${Math.max(Math.round(goals.protein_goal - log.protein_intake), 0)} g remaining`}
              </Text>
            </View>
          </View>
        </Card>

        <Card accent={C.calories}>
          <View style={styles.macroRow}>
            <Ring value={calPct} color={C.calories} size={80} />
            <View style={styles.macroInfo}>
              <Text style={styles.macroName}>🔥 Calories</Text>
              <Text style={[styles.macroVal, { color: C.calories }]}>
                {log.calorie_intake} / {goals.calorie_goal} kcal
              </Text>
              <ProgressBar value={calPct} color={C.calories} height={6} />
              <Text style={styles.macroRem}>
                {calPct >= 1
                  ? 'Goal reached!'
                  : `${Math.max(goals.calorie_goal - log.calorie_intake, 0)} kcal remaining`}
              </Text>
            </View>
          </View>
        </Card>

        {weekly && (
          <>
            <SectionHeader title="This Week" />
            <View style={styles.row}>
              {[
                { icon: '🏋️', label: 'Workouts', val: String(weekly.workouts), color: C.purple },
                { icon: '💧', label: 'Water Days', val: String(weekly.waterSuccess), color: C.water },
                { icon: '💊', label: 'Creatine', val: String(weekly.creatineTaken), color: C.green },
              ].map((s, i) => (
                <View key={s.label} style={[styles.quickStat, i === 1 && { marginHorizontal: 8 }]}>
                  <Text style={{ fontSize: 22 }}>{s.icon}</Text>
                  <Text style={[styles.quickVal, { color: s.color }]}>{s.val}</Text>
                  <Text style={styles.quickLabel}>{s.label}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        <SectionHeader title="Today's Habits" />
        <Card accent={C.green}>
          <View style={{ padding: 14 }}>
            {habits.map((h, i) => (
              <View key={i} style={[styles.habitRow, h.done && styles.habitRowDone]}>
                <Text style={styles.habitText}>{h.icon}  {h.label}</Text>
                <Text style={{ color: h.done ? C.green : C.muted, fontWeight: '700' }}>
                  {h.done ? '✓' : '○'}
                </Text>
              </View>
            ))}
            <Text style={styles.habitCount}>{habitsDone} / {habits.length} complete</Text>
            <ProgressBar value={habitsDone / habits.length} color={C.green} height={8} />
          </View>
        </Card>

        <SectionHeader title="Reminders" />
        <Card accent={C.accent}>
          <View style={{ padding: 14 }}>
            {reminders.map((r, i) => (
              <View key={i} style={styles.reminderPill}>
                <View style={[styles.reminderStrip, { backgroundColor: r.color }]} />
                <Text style={[styles.reminderText, { color: r.color }]}>
                  {r.icon}  {r.msg}
                </Text>
              </View>
            ))}
          </View>
        </Card>

        {plan && (
          <>
            <SectionHeader title="Today's Workout" />
            <Card accent={C.purple}>
              <View style={styles.workoutBody}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.workoutName}>{plan.plan_name}</Text>
                  <View style={styles.mgRow}>
                    {plan.muscle_groups
                      .split(',')
                      .map(g => g.trim())
                      .filter(Boolean)
                      .map(g => (
                        <MuscleTag key={g} name={g} />
                      ))}
                  </View>
                </View>
                <View
                  style={[
                    styles.statusBadge,
                    { backgroundColor: log.workout_completed ? '#091509' : '#12102A' },
                  ]}
                >
                  <Text
                    style={{
                      color: log.workout_completed ? C.green : C.muted,
                      fontWeight: '700',
                      fontSize: 12,
                    }}
                  >
                    {log.workout_completed ? 'Done' : 'Pending'}
                  </Text>
                </View>
              </View>
            </Card>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: C.surface,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  headerTitle: { fontSize: 22, fontWeight: '800', color: C.text },
  headerDate: { fontSize: 12, color: C.muted, marginTop: 2 },
  scroll: { padding: 16, paddingBottom: 32 },
  row: { flexDirection: 'row' },
  goalBox: { padding: 16 },
  input: {
    backgroundColor: C.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    color: C.text,
    padding: 12,
    fontSize: 14,
    marginBottom: 8,
  },
  saveGoalBtn: {
    backgroundColor: C.accent,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveGoalText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
  },
  macroRow: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 16 },
  macroInfo: { flex: 1, gap: 6 },
  macroName: { fontSize: 14, fontWeight: '700', color: C.text },
  macroVal: { fontSize: 16, fontWeight: '700' },
  macroRem: { fontSize: 11, color: C.muted },
  quickBtns: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  quickBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  quickBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  quickStat: {
    flex: 1,
    backgroundColor: C.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    padding: 16,
  },
  quickVal: { fontSize: 26, fontWeight: '800', marginTop: 4 },
  quickLabel: { fontSize: 11, color: C.muted, marginTop: 2 },
  habitRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  habitRowDone: { backgroundColor: '#091509', borderRadius: 8, paddingHorizontal: 8 },
  habitText: { fontSize: 13, color: C.textSub },
  habitCount: { fontSize: 12, color: C.muted, marginTop: 12, marginBottom: 8 },
  reminderPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface,
    borderRadius: 10,
    marginBottom: 8,
    overflow: 'hidden',
  },
  reminderStrip: { width: 4, alignSelf: 'stretch' },
  reminderText: { flex: 1, fontSize: 13, padding: 12 },
  workoutBody: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
  workoutName: { fontSize: 20, fontWeight: '800', color: '#CE93D8', marginBottom: 8 },
  mgRow: { flexDirection: 'row', flexWrap: 'wrap' },
  statusBadge: { borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8 },
});