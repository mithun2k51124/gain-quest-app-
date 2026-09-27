import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
  TextInput,
  Modal,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, G } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import {
  getTodayLog,
  getGoals,
  updateGoals,
  addWater,
  getStreak,
  getLatestWeight,
  logWeight,
  getTodaysPlan,
  getWeeklyStats,
  DailyLog,
  Goals,
  Streak,
  WorkoutPlan,
} from '../db/database';
import { Card, ProgressBar, Ring, MuscleTag, SectionHeader } from '../components/ui';
import { useTheme } from '../contexts/ThemeContext';
import { useCustomAlert } from '../contexts/AlertContext';

export default function DashboardScreen() {
  const { showAlert } = useCustomAlert();
  const router = useRouter();

  const { C } = useTheme();
  const [log, setLog] = useState<DailyLog | null>(null);
  const [goals, setGoals] = useState<Goals | null>(null);
  const [streak, setStreak] = useState<Streak | null>(null);
  const [weight, setWeight] = useState<number | null>(null);
  const [plan, setPlan] = useState<WorkoutPlan | null>(null);
  const [weekly, setWeekly] = useState<any>(null);
  const [refresh, setRefresh] = useState(false);

  // Body weight popup
  const [weightPopup, setWeightPopup] = useState(false);
  const [weightInput, setWeightInput] = useState('');

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

  const styles = makeStyles(C);

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
      showAlert('No changes', 'Enter at least one intake goal.');
      return;
    }

    updateGoals(next);
    setGoalWater('');
    setGoalProtein('');
    setGoalCalories('');
    load();
    showAlert('Saved', 'Your intake goals were updated.');
  };

  const handleLogWeight = () => {
    const w = parseFloat(weightInput);
    if (isNaN(w) || w <= 0) {
      showAlert('Invalid', 'Enter a valid body weight in kg.');
      return;
    }
    logWeight(w);
    setWeightInput('');
    setWeightPopup(false);
    load();
    showAlert('Weight Logged ✓', `Body weight ${w} kg saved!`);
  };

  const habits = [
    {
      icon: 'barbell-outline',
      label: 'Workout',
      done: !!log.workout_completed,
      info: 'Auto-tracked when you log a workout session in the Workouts tab.',
    },
    {
      icon: 'flash-outline',
      label: 'Creatine',
      done: !!log.creatine_taken,
      info: 'Logged from the Tracker tab when you mark creatine as taken.',
    },
    {
      icon: 'water-outline',
      label: 'Water',
      done: !!log.water_goal_reached,
      info: 'Auto-marks when your water intake reaches your daily goal.',
    },
    {
      icon: 'restaurant-outline',
      label: 'Protein',
      done: !!log.protein_goal_reached,
      info: 'Auto-marks when your protein intake reaches your daily goal.',
    },
    {
      icon: 'moon-outline',
      label: 'Sleep',
      done: !!log.slept_well,
      info: 'Logged from the Tracker tab when you mark sleep as good.',
    },
  ];
  const habitsDone = habits.filter(h => h.done).length;

  const reminders: { icon: string; msg: string; color: string }[] = [];
  if (!log.creatine_taken) reminders.push({ icon: 'flash-outline', msg: 'Take your creatine', color: C.orange });
  if (waterPct < 1) reminders.push({ icon: 'water-outline', msg: `Water at ${Math.round(waterPct * 100)}% of goal`, color: C.water });
  if (proteinPct < 1) reminders.push({ icon: 'restaurant-outline', msg: 'Hit your protein goal', color: C.protein });
  if (!reminders.length) reminders.push({ icon: 'star-outline', msg: 'All goals done! Amazing work!', color: C.green });

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
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refresh} onRefresh={onRefresh} tintColor={C.accent} />}
      >
        {/* 1. TODAY'S WORKOUT */}
        {plan && (
          <View style={styles.section}>
            <SectionHeader title="Today's Workout" />
            <Card accent={C.purple}>
              <View style={styles.workoutRow}>
                <View style={styles.workoutIconWrap}>
                  <Ionicons name="barbell-outline" size={24} color={C.purple} />
                </View>
                <View style={{ flex: 1, paddingLeft: 12 }}>
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
                    { backgroundColor: log.workout_completed ? C.greenDim : C.accentDim },
                  ]}
                >
                  <Text
                    style={{
                      color: log.workout_completed ? C.green : C.muted,
                      fontWeight: '700',
                      fontSize: 12,
                    }}
                  >
                    {log.workout_completed ? '✓ Completed' : 'Pending'}
                  </Text>
                </View>
              </View>
            </Card>
          </View>
        )}

        {/* 2. OVERVIEW */}
        <View style={styles.section}>
          <SectionHeader title="Overview" />
          <View style={styles.overviewGrid}>
            <OverviewCard
              icon="flame-outline"
              title="Streak"
              val={`${streak?.current_streak ?? 0} days`}
              sub={`Best: ${streak?.longest_streak ?? 0}`}
              color="#FF6B35"
            />
            <OverviewCard
              icon="flash-outline"
              title="Creatine"
              val={log.creatine_taken ? 'Taken' : 'Not Logged'}
              sub={log.creatine_taken ? 'Logged today' : 'Tap to log'}
              color={log.creatine_taken ? C.green : C.red}
            />
            <OverviewCard
              icon="barbell-outline"
              title="Workout"
              val={log.workout_completed ? 'Done' : 'Pending'}
              sub={log.workout_completed ? 'Tap to log more' : 'Tap to log'}
              color={log.workout_completed ? C.purple : C.muted}
              onPress={() => router.push({ pathname: '/workouts', params: { openTab: 'Log' } })}
            />
            <OverviewCard
              icon="scale-outline"
              title="Body Weight"
              val={weight ? `${weight.toFixed(1)} kg` : '-- kg'}
              sub={weight ? `Goal: ${goals.weight_goal} kg` : 'Tap to log'}
              color={C.water}
              onPress={() => setWeightPopup(true)}
            />
          </View>
        </View>

        {/* 3. INTAKE GOALS */}
        <View style={styles.section}>
          <SectionHeader title="Intake Goals" />
          <Card>
            <View style={styles.intakeContainer}>
              {/* Left Column - Progress */}
              <View style={styles.intakeLeft}>
                <MacroProgress
                  icon="water-outline"
                  name="Water"
                  val={`${log.water_intake.toFixed(2)} / ${goals.water_goal} L`}
                  pct={waterPct}
                  color={C.water}
                />
                <View style={styles.divider} />
                <MacroProgress
                  icon="restaurant-outline"
                  name="Protein"
                  val={`${Math.round(log.protein_intake)} / ${goals.protein_goal} g`}
                  pct={proteinPct}
                  color={C.protein}
                />
                <View style={styles.divider} />
                <MacroProgress
                  icon="flame-outline"
                  name="Calories"
                  val={`${log.calorie_intake} / ${goals.calorie_goal} kcal`}
                  pct={calPct}
                  color={C.calories}
                />
              </View>

              {/* Right Column - Inputs */}
              <View style={styles.intakeRight}>
                <TextInput
                  style={styles.intakeInput}
                  placeholder={`Water: ${goals.water_goal} L`}
                  placeholderTextColor={C.muted}
                  keyboardType="decimal-pad"
                  value={goalWater}
                  onChangeText={setGoalWater}
                />
                <TextInput
                  style={styles.intakeInput}
                  placeholder={`Protein: ${goals.protein_goal} g`}
                  placeholderTextColor={C.muted}
                  keyboardType="numeric"
                  value={goalProtein}
                  onChangeText={setGoalProtein}
                />
                <TextInput
                  style={styles.intakeInput}
                  placeholder={`Calories: ${goals.calorie_goal} kcal`}
                  placeholderTextColor={C.muted}
                  keyboardType="numeric"
                  value={goalCalories}
                  onChangeText={setGoalCalories}
                />
                <TouchableOpacity style={styles.saveBtn} onPress={saveHomeGoals}>
                  <Text style={styles.saveBtnText}>Save Goals</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Card>
        </View>

        {/* 4. THIS WEEK & TODAY'S HABITS */}
        <View style={styles.twoColSection}>
          <View style={styles.colLeft}>
            <SectionHeader title="This Week" />
            <Card style={{ flex: 1 }}>
              <View style={[styles.weekStatsBox, { flex: 1, justifyContent: 'space-evenly' }]}>
                <View style={styles.weekStatItem}>
                  <Ionicons name="trophy-outline" size={24} color={C.purple} style={styles.weekStatIcon} />
                  <Text style={[styles.weekStatVal, { color: C.purple }]}>{weekly?.workouts || 0}</Text>
                  <Text style={styles.weekStatLbl}>Workouts</Text>
                </View>
                <View style={styles.weekStatItem}>
                  <Ionicons name="water-outline" size={24} color={C.water} style={styles.weekStatIcon} />
                  <Text style={[styles.weekStatVal, { color: C.water }]}>{weekly?.waterSuccess || 0}</Text>
                  <Text style={styles.weekStatLbl}>Water Days</Text>
                </View>
                <View style={styles.weekStatItem}>
                  <Ionicons name="flash-outline" size={24} color={C.green} style={styles.weekStatIcon} />
                  <Text style={[styles.weekStatVal, { color: C.green }]}>{weekly?.creatineTaken || 0}</Text>
                  <Text style={styles.weekStatLbl}>Creatine</Text>
                </View>
              </View>
            </Card>
          </View>

          <View style={styles.colRight}>
            <SectionHeader title="Today's Habits" />
            <Card style={{ flex: 1 }}>
              <View style={[styles.habitsBox, { flex: 1, justifyContent: 'space-between' }]}>
                <View>
                  {habits.map((h, i) => (
                    <TouchableOpacity
                      key={i}
                      style={styles.habitRow}
                      activeOpacity={0.7}
                      onPress={() => showAlert(
                        h.done ? `✅ ${h.label} Done!` : `○ ${h.label} Pending`,
                        h.info
                      )}
                    >
                      <View style={styles.habitIconWrap}>
                        <Ionicons name={h.icon as any} size={16} color={h.done ? C.green : C.muted} />
                      </View>
                      <Text style={[styles.habitLabel, h.done && { color: C.text, fontWeight: '700' }]}>{h.label}</Text>
                      <Text style={{ color: h.done ? C.green : C.muted, fontWeight: '800' }}>
                        {h.done ? '✓' : '○'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={styles.habitProgressBox}>
                  <Text style={styles.habitProgressTxt}>{habitsDone} / {habits.length} Complete</Text>
                  <ProgressBar value={habitsDone / habits.length} color={C.green} height={6} />
                </View>
              </View>
            </Card>
          </View>
        </View>

        {/* 5. REMINDERS */}
        <View style={styles.section}>
          <SectionHeader title="Reminders" />
          <View style={styles.remindersGrid}>
            {reminders.map((r, i) => (
              <View key={i} style={[styles.reminderPill, { borderColor: r.color }]}>
                <Ionicons name={r.icon as any} size={16} color={r.color} style={{ marginRight: 8 }} />
                <Text style={[styles.reminderTxt, { color: r.color }]}>{r.msg}</Text>
              </View>
            ))}
          </View>
        </View>

      </ScrollView>

      {/* Body Weight Popup */}
      <Modal visible={weightPopup} transparent animationType="fade" onRequestClose={() => setWeightPopup(false)}>
        <TouchableOpacity style={styles.bwOverlay} activeOpacity={1} onPress={() => setWeightPopup(false)}>
          <TouchableOpacity activeOpacity={1} style={[styles.bwSheet, { backgroundColor: C.card }]} onPress={e => e.stopPropagation()}>
            <View style={styles.bwHandle} />
            <View style={[styles.bwIconWrap, { backgroundColor: C.water + '22' }]}>
              <Ionicons name="scale-outline" size={30} color={C.water} />
            </View>
            <Text style={[styles.bwTitle, { color: C.text }]}>Log Body Weight</Text>
            {weight && <Text style={[styles.bwCurrent, { color: C.muted }]}>Current: {weight.toFixed(1)} kg  •  Goal: {goals.weight_goal} kg</Text>}
            <TextInput
              style={[styles.bwInput, { backgroundColor: C.bg, color: C.text, borderColor: C.water }]}
              placeholder="Enter weight in kg (e.g. 75.5)"
              placeholderTextColor={C.muted}
              keyboardType="decimal-pad"
              value={weightInput}
              onChangeText={setWeightInput}
              autoFocus
            />
            <TouchableOpacity style={[styles.bwBtn, { backgroundColor: C.water }]} onPress={handleLogWeight}>
              <Ionicons name="checkmark-circle" size={18} color="#fff" />
              <Text style={styles.bwBtnTxt}>Save Weight</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setWeightPopup(false)} style={styles.bwCancel}>
              <Text style={[styles.bwCancelTxt, { color: C.muted }]}>Cancel</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Subcomponents for the new layout
// ─────────────────────────────────────────────────────────────────────────────
function OverviewCard({ icon, title, val, sub, color, onPress }: any) {
  const { C } = useTheme();
  const styles = makeStyles(C);
  const Wrapper = onPress ? TouchableOpacity : View;
  return (
    <Wrapper style={styles.ovCardWrap} onPress={onPress} activeOpacity={0.82}>
      <Card accent={color}>
        <View style={styles.ovCard}>
          <View style={[styles.ovIconBox, { backgroundColor: color + '15' }]}>
            <Ionicons name={icon} size={20} color={color} />
          </View>
          <Text style={styles.ovTitle} numberOfLines={1}>{title}</Text>
          <Text style={[styles.ovVal, { color }]} numberOfLines={1}>{val}</Text>
          <Text style={styles.ovSub} numberOfLines={1}>{sub}</Text>
        </View>
      </Card>
    </Wrapper>
  );
}

function MacroProgress({ icon, name, val, pct, color }: any) {
  const { showAlert } = useCustomAlert();

  const { C } = useTheme();
  const styles = makeStyles(C);
  const size = 44;
  const strokeW = 4;
  const r = (size - strokeW) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (circ * Math.min(Math.max(pct, 0), 1));

  return (
    <View style={styles.macroProgressRow}>
      <View style={styles.macroIconWrap}>
        <Ionicons name={icon} size={24} color={color} />
      </View>
      <View style={{ flex: 1, paddingHorizontal: 12 }}>
        <Text style={styles.macroName}>{name}</Text>
        <Text style={[styles.macroValTxt, { color }]}>{val}</Text>
        <View style={{ marginTop: 4 }}>
          <ProgressBar value={pct} color={color} height={6} />
        </View>
      </View>
      <View style={styles.macroRingBox}>
        <Svg width={size} height={size}>
          <G rotation="-90" origin={`${size/2},${size/2}`}>
            <Circle cx={size/2} cy={size/2} r={r} stroke={C.shadowDark} strokeWidth={strokeW} fill="none" />
            <Circle cx={size/2} cy={size/2} r={r} stroke={color} strokeWidth={strokeW} fill="none" strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round" />
          </G>
        </Svg>
        <View style={styles.macroRingCenter}>
          <Text style={[styles.macroRingTxt, { color }]}>{Math.round(pct * 100)}%</Text>
        </View>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────
function makeStyles(C: any) { return StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: C.bg,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  headerTitle: { fontSize: 22, fontWeight: '800', color: C.text },
  headerDate: { fontSize: 12, color: C.muted, marginTop: 2 },
  scroll: { padding: 16, paddingBottom: 40 },
  section: { marginBottom: 20 },

  // Workout
  workoutRow: { flexDirection: 'row', alignItems: 'center', padding: 16 },
  workoutIconWrap: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: C.purple + '22',
    alignItems: 'center', justifyContent: 'center'
  },
  workoutName: { fontSize: 16, fontWeight: '800', color: C.purple, marginBottom: 6 },
  mgRow: { flexDirection: 'row', flexWrap: 'wrap' },
  statusBadge: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },

  // Overview
  overviewGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  ovCardWrap: { width: '48%', marginBottom: 16 },
  ovCard: { padding: 14, alignItems: 'center', width: '100%' },
  ovIconBox: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  ovTitle: { fontSize: 11, color: C.muted, fontWeight: '700', marginBottom: 6, textAlign: 'center' },
  ovVal: { fontSize: 15, fontWeight: '800', marginBottom: 4, textAlign: 'center' },
  ovSub: { fontSize: 10, color: C.textSub, textAlign: 'center' },

  // Intake Goals
  intakeContainer: { flexDirection: 'row', minHeight: 220 },
  intakeLeft: { flex: 1.3, paddingVertical: 16, paddingLeft: 16, paddingRight: 8 },
  intakeRight: { flex: 1, backgroundColor: C.surface, padding: 16, borderLeftWidth: 1, borderLeftColor: C.border, justifyContent: 'center' },
  divider: { height: 1, backgroundColor: C.border, marginVertical: 12 },
  macroProgressRow: { flexDirection: 'row', alignItems: 'center' },
  macroIconWrap: { width: 32, alignItems: 'center' },
  macroName: { fontSize: 12, fontWeight: '700', color: C.text, marginBottom: 2 },
  macroValTxt: { fontSize: 11, fontWeight: '700' },
  macroRingBox: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  macroRingCenter: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  macroRingTxt: { fontSize: 11, fontWeight: '800' },
  intakeInput: {
    backgroundColor: C.bg,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.border,
    color: C.text,
    padding: 10,
    fontSize: 11,
    marginBottom: 12,
  },
  saveBtn: {
    backgroundColor: C.accent,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    shadowColor: '#BFC8D6',
    shadowOffset: { width: 2, height: 2 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
    elevation: 3,
  },
  saveBtnText: { color: '#FFF', fontSize: 12, fontWeight: '700' },

  // Two Column Layout
  twoColSection: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  colLeft: { flex: 1 },
  colRight: { flex: 1.2 },

  // This Week
  weekStatsBox: { padding: 16, gap: 16, alignItems: 'center' },
  weekStatItem: { alignItems: 'center' },
  weekStatIcon: { marginBottom: 4 },
  weekStatVal: { fontSize: 22, fontWeight: '800' },
  weekStatLbl: { fontSize: 10, color: C.muted, fontWeight: '600', marginTop: 2 },

  // Habits
  habitsBox: { padding: 16 },
  habitRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  habitIconWrap: { width: 20, marginRight: 8, alignItems: 'center' },
  habitLabel: { flex: 1, fontSize: 11, color: C.textSub, fontWeight: '600' },
  habitProgressBox: { marginTop: 8, borderTopWidth: 1, borderTopColor: C.border, paddingTop: 12 },
  habitProgressTxt: { fontSize: 10, color: C.muted, marginBottom: 6, fontWeight: '600' },

  // Reminders
  remindersGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  reminderPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.bg,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    shadowColor: '#BFC8D6',
    shadowOffset: { width: 2, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
    elevation: 2,
  },
  reminderTxt: { fontSize: 12, fontWeight: '700' },

  // Body Weight Popup
  bwOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 },
  bwSheet: { width: '100%', borderRadius: 24, padding: 24, alignItems: 'center' },
  bwHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(150,150,150,0.3)', marginBottom: 16 },
  bwIconWrap: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  bwTitle: { fontSize: 20, fontWeight: '800', marginBottom: 6 },
  bwCurrent: { fontSize: 12, marginBottom: 16, textAlign: 'center' },
  bwInput: { width: '100%', borderRadius: 14, borderWidth: 2, paddingHorizontal: 16, paddingVertical: 14, fontSize: 18, fontWeight: '700', textAlign: 'center', marginBottom: 16 },
  bwBtn: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 15, borderRadius: 16, marginBottom: 10 },
  bwBtnTxt: { color: '#fff', fontSize: 16, fontWeight: '800' },
  bwCancel: { paddingVertical: 8 },
  bwCancelTxt: { fontSize: 14, fontWeight: '600' },
}); }