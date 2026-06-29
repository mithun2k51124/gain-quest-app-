import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  RefreshControl,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  getWorkoutPlans,
  updateWorkoutPlan,
  getWorkoutPlanExercises,
  addWorkoutPlanExercise,
  deleteWorkoutPlanExercise,
  getMuscleTracker,
  createWorkoutSession,
  logExercise,
  getSessionExercises,
  getWorkoutSessions,
  checkPRForLog,
  updateDailyLog,
  updateStreak,
  todayStr,
  WorkoutPlan,
  WorkoutPlanExercise,
  MuscleEntry,
  ExerciseLog,
} from '../db/database';
import { Card, Btn, MuscleTag, SectionHeader, PickerModal, EmptyState } from '../components/ui';
import { C, MUSCLE_GROUPS, DAYS, EXERCISE_LIBRARY } from '../constants/theme';

type Tab = 'Planner' | 'Muscles' | 'Log' | 'History';

export default function WorkoutsScreen() {
  const [tab, setTab] = useState<Tab>('Planner');
  const [plans, setPlans] = useState<WorkoutPlan[]>([]);
  const [planExercises, setPlanExercises] = useState<WorkoutPlanExercise[]>([]);
  const [muscles, setMuscles] = useState<MuscleEntry[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [refresh, setRefresh] = useState(false);

  const [sessionId, setSessionId] = useState<number | null>(null);
  const [sessionDate, setSessionDate] = useState(todayStr());
  const [sessionMGs, setSessionMGs] = useState<string[]>([]);
  const [sessionNotes, setSessionNotes] = useState('');
  const [exercises, setExercises] = useState<any[]>([]);

  const [selMuscle, setSelMuscle] = useState('Chest');
  const [selExercise, setSelExercise] = useState('Bench Press');
  const [sets, setSets] = useState('4');
  const [reps, setReps] = useState('8');
  const [weight, setWeight] = useState('');
  const [muscleModal, setMuscleModal] = useState(false);
  const [exModal, setExModal] = useState(false);
  const [setsModal, setSetsModal] = useState(false);
  const [repsModal, setRepsModal] = useState(false);

  const [prData, setPrData] = useState<any | null>(null);

  const load = useCallback(() => {
    setPlans(getWorkoutPlans());
    setPlanExercises(getWorkoutPlanExercises());
    setMuscles(getMuscleTracker());
    setSessions(getWorkoutSessions(20));
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = () => {
    setRefresh(true);
    load();
    setRefresh(false);
  };

  const tabs: Tab[] = ['Planner', 'Muscles', 'Log', 'History'];

  const startSession = () => {
    if (!sessionMGs.length) {
      Alert.alert('Select', 'Pick at least one muscle group.');
      return;
    }

    const id = createWorkoutSession(sessionDate, sessionMGs.join(','), sessionNotes);
    setSessionId(id);
    setExercises([]);

    if (sessionDate === todayStr()) {
      updateDailyLog(todayStr(), { workout_completed: 1 });
      updateStreak();
    }

    Alert.alert('Session Started!', 'Log your exercises below.');
  };

  const addExercise = () => {
    if (!sessionId) {
      Alert.alert('Start a session first.');
      return;
    }

    const w = parseFloat(weight);
    if (!w || isNaN(w)) {
      Alert.alert('Enter weight.');
      return;
    }

    const s = parseInt(sets, 10);
    const r = parseInt(reps, 10);

    const { isNewPR, oldPR, new1RM } = checkPRForLog(selExercise, s, r, w);

    logExercise(sessionId, sessionDate, selExercise, selMuscle, s, r, w);

    setExercises(prev => [
      ...prev,
      { name: selExercise, muscle: selMuscle, sets: s, reps: r, weight: w },
    ]);
    setWeight('');

    if (isNewPR) {
      setPrData({ exercise: selExercise, oldPR, new1RM, weight: w, reps: r });
    }
  };

  const finishSession = () => {
    if (!exercises.length) {
      Alert.alert('Add at least one exercise.');
      return;
    }

    Alert.alert('Session Complete!', `${exercises.length} exercises logged.`);
    setSessionId(null);
    setExercises([]);
    setSessionMGs([]);
    load();
  };

  const toggleMG = (mg: string) => {
    setSessionMGs(prev =>
      prev.includes(mg) ? prev.filter(m => m !== mg) : [...prev, mg]
    );
  };

  const getDaysAgo = (lastTrained: string | null) => {
    if (!lastTrained) return 999;
    return Math.floor((Date.now() - new Date(lastTrained).getTime()) / 86400000);
  };

  const urgencyColor = (days: number) => {
    if (days === 0) return C.green;
    if (days <= 3) return C.orange;
    if (days <= 7) return '#FF5722';
    return C.red;
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Workouts</Text>
      </View>

      <View style={styles.tabBar}>
        {tabs.map(t => (
          <TouchableOpacity
            key={t}
            style={[styles.tabBtn, tab === t && styles.tabActive]}
            onPress={() => setTab(t)}
          >
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refresh} onRefresh={onRefresh} tintColor={C.accent} />}
      >
        {tab === 'Planner' && (
          <PlannerTab
            plans={plans}
            planExercises={planExercises}
            onSave={(day, name, mgs) => {
              updateWorkoutPlan(day, name, mgs);
              load();
            }}
            onAddExercise={(day, exercise, muscle) => {
              addWorkoutPlanExercise(day, exercise, muscle);
              load();
            }}
            onDeleteExercise={id => {
              deleteWorkoutPlanExercise(id);
              load();
            }}
          />
        )}

        {tab === 'Muscles' && (
          <>
            <SectionHeader title="Muscle Group Recovery" />
            {muscles.map(m => {
              const daysAgo = getDaysAgo(m.last_trained);
              const color = urgencyColor(daysAgo);
              const mgColor = C.mg[m.muscle_group] || C.accent;

              return (
                <View
                  key={m.muscle_group}
                  style={[styles.muscleCard, { borderColor: daysAgo > 7 ? C.red : C.border }]}
                >
                  <View style={[styles.muscleIcon, { backgroundColor: mgColor + '33' }]}>
                    <Text style={{ fontSize: 20 }}>💪</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.muscleName}>{m.muscle_group}</Text>
                    <Text style={[styles.muscleStatus, { color }]}>
                      {daysAgo === 999
                        ? 'Never trained'
                        : daysAgo === 0
                          ? 'Trained Today'
                          : `${daysAgo} day${daysAgo > 1 ? 's' : ''} ago`}
                    </Text>
                    <Text style={styles.muscleSessions}>Sessions: {m.total_sessions}</Text>
                  </View>
                </View>
              );
            })}
          </>
        )}

        {tab === 'Log' && (
          <>
            {!sessionId ? (
              <Card accent={C.accent}>
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>New Session</Text>

                  <Text style={styles.fieldLabel}>Date</Text>
                  <TextInput
                    style={styles.input}
                    value={sessionDate}
                    onChangeText={setSessionDate}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={C.muted}
                  />

                  <Text style={styles.fieldLabel}>Muscle Groups</Text>
                  <View style={styles.mgGrid}>
                    {MUSCLE_GROUPS.map(mg => (
                      <TouchableOpacity
                        key={mg}
                        style={[
                          styles.mgPill,
                          {
                            borderColor: sessionMGs.includes(mg) ? C.mg[mg] : C.border,
                            backgroundColor: sessionMGs.includes(mg) ? C.mg[mg] + '33' : C.surface,
                          },
                        ]}
                        onPress={() => toggleMG(mg)}
                      >
                        <Text
                          style={[
                            styles.mgPillText,
                            { color: sessionMGs.includes(mg) ? C.mg[mg] : C.muted },
                          ]}
                        >
                          {mg}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={styles.fieldLabel}>Notes</Text>
                  <TextInput
                    style={styles.input}
                    value={sessionNotes}
                    onChangeText={setSessionNotes}
                    placeholder="Session notes..."
                    placeholderTextColor={C.muted}
                  />

                  <Btn label="Start Session" color={C.accent} onPress={startSession} />
                </View>
              </Card>
            ) : (
              <>
                <Card accent={C.green}>
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Add Exercise - Session #{sessionId}</Text>

                    <TouchableOpacity style={styles.selectRow} onPress={() => setMuscleModal(true)}>
                      <Text style={styles.fieldLabel}>Muscle Group</Text>
                      <Text style={[styles.selectVal, { color: C.mg[selMuscle] }]}>
                        {selMuscle} ›
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.selectRow} onPress={() => setExModal(true)}>
                      <Text style={styles.fieldLabel}>Exercise</Text>
                      <Text style={[styles.selectVal, { color: C.accent }]}>
                        {selExercise} ›
                      </Text>
                    </TouchableOpacity>

                    <View style={styles.setsRow}>
                      <TouchableOpacity
                        style={[styles.setsBox, { borderColor: C.border }]}
                        onPress={() => setSetsModal(true)}
                      >
                        <Text style={styles.setsLabel}>Sets</Text>
                        <Text style={styles.setsVal}>{sets}</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.setsBox, { borderColor: C.border }]}
                        onPress={() => setRepsModal(true)}
                      >
                        <Text style={styles.setsLabel}>Reps</Text>
                        <Text style={styles.setsVal}>{reps}</Text>
                      </TouchableOpacity>

                      <View style={[styles.setsBox, { borderColor: C.border, flex: 2 }]}>
                        <Text style={styles.setsLabel}>Weight (kg)</Text>
                        <TextInput
                          style={styles.setsInput}
                          keyboardType="decimal-pad"
                          value={weight}
                          onChangeText={setWeight}
                          placeholder="60"
                          placeholderTextColor={C.muted}
                        />
                      </View>
                    </View>

                    <View style={[styles.btnRow, { marginTop: 12 }]}>
                      <View style={{ flex: 1, marginRight: 8 }}>
                        <Btn label="+ Add Exercise" color={C.green} onPress={addExercise} />
                      </View>
                      <Btn label="Finish" color={C.water} onPress={finishSession} />
                    </View>
                  </View>
                </Card>

                {exercises.length > 0 && (
                  <Card accent={C.accent}>
                    <View style={styles.section}>
                      <Text style={styles.sectionTitle}>
                        {exercises.length} Exercise{exercises.length > 1 ? 's' : ''} Logged
                      </Text>
                      {exercises.map((ex, i) => (
                        <View key={i} style={styles.exRow}>
                          <View style={[styles.exDot, { backgroundColor: C.mg[ex.muscle] || C.accent }]} />
                          <Text style={styles.exName}>{ex.name}</Text>
                          <Text style={styles.exDetail}>
                            {ex.sets}x{ex.reps} @ {ex.weight}kg
                          </Text>
                        </View>
                      ))}
                    </View>
                  </Card>
                )}
              </>
            )}
          </>
        )}

        {tab === 'History' && (
          <>
            <SectionHeader title="Workout History" />
            {sessions.length === 0 ? (
              <EmptyState icon="📋" message="No workouts logged yet" sub="Go to Log tab to start tracking" />
            ) : (
              sessions.map(s => {
                const exs = getSessionExercises(s.id);

                return (
                  <Card key={s.id} accent={C.accent}>
                    <View style={styles.section}>
                      <View style={styles.histHeader}>
                        <Text style={styles.histDate}>{s.session_date}</Text>
                        <View style={styles.mgRow}>
                          {s.muscle_groups.split(',').slice(0, 3).map((g: string) => (
                            <MuscleTag key={g} name={g.trim()} />
                          ))}
                        </View>
                      </View>

                      {exs.slice(0, 5).map((ex: ExerciseLog) => (
                        <View key={ex.id} style={styles.exRow}>
                          <View style={[styles.exDot, { backgroundColor: C.mg[ex.muscle_group] || C.accent }]} />
                          <Text style={styles.exName}>{ex.exercise_name}</Text>
                          <Text style={styles.exDetail}>
                            {ex.sets}x{ex.reps} @ {ex.weight}{ex.unit}
                          </Text>
                        </View>
                      ))}

                      {exs.length > 5 && (
                        <Text style={styles.moreText}>+ {exs.length - 5} more exercises</Text>
                      )}
                    </View>
                  </Card>
                );
              })
            )}
          </>
        )}
      </ScrollView>

      <PickerModal
        visible={muscleModal}
        title="Select Muscle Group"
        options={MUSCLE_GROUPS.map(m => ({ label: m, value: m }))}
        onSelect={v => {
          setSelMuscle(v);
          setSelExercise(EXERCISE_LIBRARY[v]?.[0] || '');
        }}
        onClose={() => setMuscleModal(false)}
      />

      <PickerModal
        visible={exModal}
        title="Select Exercise"
        options={(EXERCISE_LIBRARY[selMuscle] || []).map(e => ({ label: e, value: e }))}
        onSelect={v => setSelExercise(v)}
        onClose={() => setExModal(false)}
      />

      <PickerModal
        visible={setsModal}
        title="Sets"
        options={['1', '2', '3', '4', '5', '6', '7', '8'].map(v => ({ label: v, value: v }))}
        onSelect={v => setSets(v)}
        onClose={() => setSetsModal(false)}
      />

      <PickerModal
        visible={repsModal}
        title="Reps"
        options={['1', '2', '3', '4', '5', '6', '8', '10', '12', '15', '20', '25'].map(v => ({ label: v, value: v }))}
        onSelect={v => setReps(v)}
        onClose={() => setRepsModal(false)}
      />

      {prData && (
        <View style={styles.prOverlay}>
          <View style={styles.prCard}>
            <Text style={{ fontSize: 48, textAlign: 'center' }}>🎉</Text>
            <Text style={styles.prTitle}>NEW PERSONAL RECORD!</Text>
            <Text style={styles.prExercise}>{prData.exercise}</Text>
            {prData.oldPR && (
              <Text style={styles.prOld}>
                Previous: {prData.oldPR.weight}kg x {prData.oldPR.reps} reps
              </Text>
            )}
            <Text style={styles.prNew}>
              {prData.weight}kg x {prData.reps} reps
            </Text>
            <Text style={styles.pr1rm}>e1RM: {prData.new1RM.toFixed(1)} kg</Text>
            <Btn label="Let's Go!" color={C.accent} onPress={() => setPrData(null)} />
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

function PlannerTab({
  plans,
  planExercises,
  onSave,
  onAddExercise,
  onDeleteExercise,
}: {
  plans: WorkoutPlan[];
  planExercises: WorkoutPlanExercise[];
  onSave: (d: string, n: string, m: string) => void;
  onAddExercise: (day: string, exercise: string, muscle: string) => void;
  onDeleteExercise: (id: number) => void;
}) {
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long' });
  const planMap = Object.fromEntries(plans.map(p => [p.day_of_week, p]));
  const [edits, setEdits] = useState<Record<string, { name: string; mgs: string[] }>>({});
  const [exerciseDay, setExerciseDay] = useState<string | null>(null);

  const getEdit = (day: string) =>
    edits[day] || {
      name: planMap[day]?.plan_name || '',
      mgs: (planMap[day]?.muscle_groups || '').split(',').filter(Boolean),
    };

  const updateEdit = (day: string, field: 'name' | 'mgs', val: any) => {
    const cur = getEdit(day);
    setEdits(prev => ({ ...prev, [day]: { ...cur, [field]: val } }));
  };

  const togglePlanMG = (day: string, mg: string) => {
    const cur = getEdit(day);
    const mgs = cur.mgs.includes(mg) ? cur.mgs.filter(m => m !== mg) : [...cur.mgs, mg];

    updateEdit(day, 'mgs', mgs);
  };

  const exerciseOptions = (() => {
    if (!exerciseDay) return [];

    const selected = getEdit(exerciseDay).mgs.filter(mg => mg !== 'Rest');
    const muscles = selected.length ? selected : MUSCLE_GROUPS;

    return muscles.flatMap(mg =>
      (EXERCISE_LIBRARY[mg] || []).map(ex => ({
        label: `${ex} (${mg})`,
        value: `${mg}:::${ex}`,
      }))
    );
  })();

  return (
    <>
      <SectionHeader title="Weekly Plan" />

      {DAYS.map(day => {
        const isToday = day === today;
        const edit = getEdit(day);
        const exercisesForDay = planExercises.filter(ex => ex.day_of_week === day);

        return (
          <View key={day} style={[styles.planCard, isToday && styles.planCardToday]}>
            <View style={styles.planHeader}>
              <Text style={[styles.planDay, isToday && { color: C.accent }]}>
                {isToday ? '▶ ' : ''}{day}
              </Text>
              {isToday && (
                <View style={styles.todayBadge}>
                  <Text style={styles.todayText}>TODAY</Text>
                </View>
              )}
            </View>

            <TextInput
              style={styles.input}
              value={edit.name}
              onChangeText={v => updateEdit(day, 'name', v)}
              placeholder="Plan name"
              placeholderTextColor={C.muted}
            />

            <View style={styles.mgGrid}>
              {[...MUSCLE_GROUPS, 'Rest'].map(mg => {
                const sel = edit.mgs.includes(mg);
                const col = mg === 'Rest' ? C.muted : C.mg[mg] || C.accent;

                return (
                  <TouchableOpacity
                    key={mg}
                    style={[
                      styles.mgPill,
                      {
                        borderColor: sel ? col : C.border,
                        backgroundColor: sel ? col + '33' : C.surface,
                      },
                    ]}
                    onPress={() => togglePlanMG(day, mg)}
                  >
                    <Text style={[styles.mgPillText, { color: sel ? col : C.muted }]}>
                      {mg}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {exercisesForDay.length > 0 && (
              <View style={styles.plannedList}>
                {exercisesForDay.map(ex => (
                  <View key={ex.id} style={styles.plannedExerciseRow}>
                    <View style={[styles.exDot, { backgroundColor: C.mg[ex.muscle_group] || C.accent }]} />
                    <Text style={styles.exName}>{ex.exercise_name}</Text>
                    <Text style={styles.plannedMuscle}>{ex.muscle_group}</Text>
                    <TouchableOpacity
                      onPress={() => onDeleteExercise(ex.id)}
                      style={styles.deletePlanExBtn}
                    >
                      <Text style={styles.deletePlanExText}>×</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            <View style={styles.btnRow}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Btn label="+ Exercise" color={C.green} small onPress={() => setExerciseDay(day)} />
              </View>
              <Btn
                label="Save"
                color={C.accent}
                small
                onPress={() => onSave(day, edit.name, edit.mgs.join(','))}
              />
            </View>
          </View>
        );
      })}

      <PickerModal
        visible={!!exerciseDay}
        title="Add Exercise"
        options={exerciseOptions}
        onSelect={v => {
          if (!exerciseDay) return;

          const [muscle, exercise] = v.split(':::');

          onAddExercise(exerciseDay, exercise, muscle);
          setExerciseDay(null);
        }}
        onClose={() => setExerciseDay(null)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: C.surface,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  headerTitle: { fontSize: 22, fontWeight: '800', color: C.text },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: C.surface,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  tabBtn: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabActive: { borderBottomWidth: 2, borderBottomColor: C.accent },
  tabText: { fontSize: 12, color: C.muted, fontWeight: '600' },
  tabTextActive: { color: C.accent },
  scroll: { padding: 16, paddingBottom: 40 },
  section: { padding: 16 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: C.text, marginBottom: 12 },
  fieldLabel: { fontSize: 11, color: C.muted, marginBottom: 4, marginTop: 8 },
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
  mgGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  mgPill: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  mgPillText: { fontSize: 12, fontWeight: '600' },
  selectRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  selectVal: { fontSize: 14, fontWeight: '600' },
  setsRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  setsBox: {
    flex: 1,
    backgroundColor: C.card,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
  },
  setsLabel: { fontSize: 10, color: C.muted, marginBottom: 4 },
  setsVal: { fontSize: 20, fontWeight: '800', color: C.text },
  setsInput: {
    fontSize: 20,
    fontWeight: '800',
    color: C.text,
    textAlign: 'center',
    width: '100%',
  },
  btnRow: { flexDirection: 'row', alignItems: 'center' },
  exRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  exDot: { width: 8, height: 8, borderRadius: 4, marginRight: 10 },
  exName: { flex: 1, fontSize: 13, color: C.text },
  exDetail: { fontSize: 12, color: C.accent, fontWeight: '600' },
  mgRow: { flexDirection: 'row', flexWrap: 'wrap' },
  histHeader: { marginBottom: 8 },
  histDate: { fontSize: 14, fontWeight: '700', color: C.accent, marginBottom: 6 },
  moreText: { fontSize: 11, color: C.muted, marginTop: 4 },
  muscleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.card,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 10,
    gap: 14,
  },
  muscleIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  muscleName: { fontSize: 15, fontWeight: '700', color: C.text, marginBottom: 2 },
  muscleStatus: { fontSize: 12, marginBottom: 2 },
  muscleSessions: { fontSize: 11, color: C.muted },
  planCard: {
    backgroundColor: C.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    padding: 14,
    marginBottom: 12,
  },
  planCardToday: { borderColor: C.accent, borderWidth: 2 },
  planHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  planDay: { fontSize: 15, fontWeight: '700', color: C.text },
  todayBadge: {
    backgroundColor: '#1E1B4B',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  todayText: { fontSize: 10, color: C.accent, fontWeight: '700' },
  plannedList: {
    borderTopWidth: 1,
    borderTopColor: C.border,
    marginBottom: 10,
  },
  plannedExerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  plannedMuscle: {
    fontSize: 11,
    color: C.muted,
    marginRight: 8,
  },
  deletePlanExBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  deletePlanExText: {
    color: C.red,
    fontSize: 18,
    fontWeight: '800',
  },
  prOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#000000CC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  prCard: {
    backgroundColor: C.surface,
    borderRadius: 20,
    padding: 28,
    width: '85%',
    alignItems: 'center',
    gap: 8,
  },
  prTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: C.yellow,
    textAlign: 'center',
  },
  prExercise: {
    fontSize: 16,
    fontWeight: '700',
    color: C.text,
    textAlign: 'center',
  },
  prOld: { fontSize: 13, color: C.muted },
  prNew: { fontSize: 18, fontWeight: '800', color: C.green },
  pr1rm: { fontSize: 16, fontWeight: '700', color: C.yellow },
});