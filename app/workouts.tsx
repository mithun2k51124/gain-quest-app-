import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  RefreshControl,
  Modal,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
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
import { Card, Btn, MuscleTag, SectionHeader, EmptyState } from '../components/ui';
import BodyAnatomy from '../components/BodyAnatomy';
import { NestableScrollContainer, NestableDraggableFlatList, ScaleDecorator } from 'react-native-draggable-flatlist';
import { useTheme } from '../contexts/ThemeContext';
import { useCustomAlert } from '../contexts/AlertContext';
import { MUSCLE_GROUPS, DAYS, EXERCISE_LIBRARY } from '../constants/theme';

type Tab = 'Planner' | 'Muscles' | 'Log' | 'History';

// ─────────────────────────────────────────────────────────────────────────────
// Neumorphic Bottom-Sheet Picker  (replaces old PickerModal from ui.tsx for
// this screen, with grouped support)
// ─────────────────────────────────────────────────────────────────────────────
function NeuModal({
  visible, title, onClose, children,
}: {
  visible: boolean; title: string; onClose: () => void; children: React.ReactNode;
}) {
  const { C } = useTheme();
  const neuStyles = makeNeuStyles(C);
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={neuStyles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={neuStyles.sheet} onPress={e => e.stopPropagation()}>
          <View style={neuStyles.handle} />
          <Text style={neuStyles.sheetTitle}>{title}</Text>
          {children}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

function FlatOptions({
  options, onSelect,
}: { options: { label: string; value: string }[]; onSelect: (v: string) => void; }) {
  const { C } = useTheme();
  const neuStyles = makeNeuStyles(C);
  return (
    <ScrollView style={{ maxHeight: 380 }}>
      {options.map(opt => (
        <TouchableOpacity key={opt.value} style={neuStyles.optRow} onPress={() => onSelect(opt.value)}>
          <Text style={neuStyles.optText}>{opt.label}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

function GroupedExercisePicker({
  muscleGroups, onConfirm,
}: {
  muscleGroups: string[];
  onConfirm: (selected: { muscle: string; exercise: string }[]) => void;
}) {
  const { C } = useTheme();
  const neuStyles = makeNeuStyles(C);
  const [openGroup, setOpenGroup] = useState<string | null>(muscleGroups[0] ?? null);
  const [selected, setSelected] = useState<{ muscle: string; exercise: string }[]>([]);

  const isSelected = (exercise: string) =>
    selected.some(s => s.exercise === exercise);

  const toggle = (muscle: string, exercise: string) => {
    setSelected(prev =>
      prev.some(s => s.exercise === exercise)
        ? prev.filter(s => s.exercise !== exercise)
        : [...prev, { muscle, exercise }]
    );
  };

  return (
    <View>
      <ScrollView style={{ maxHeight: 360 }}>
        {muscleGroups.map(mg => {
          const exercises = EXERCISE_LIBRARY[mg] || [];
          const isOpen = openGroup === mg;
          const color = C.mg[mg] || C.accent;
          const selectedInGroup = selected.filter(s => s.muscle === mg).length;

          return (
            <View key={mg}>
              {/* Group header */}
              <TouchableOpacity
                style={[neuStyles.groupHeader, { borderLeftColor: color }]}
                onPress={() => setOpenGroup(isOpen ? null : mg)}
              >
                <Text style={[neuStyles.groupTitle, { color }]}>{mg}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  {selectedInGroup > 0 && (
                    <View style={[neuStyles.groupBadge, { backgroundColor: color }]}>
                      <Text style={neuStyles.groupBadgeText}>{selectedInGroup}</Text>
                    </View>
                  )}
                  <Text style={[neuStyles.groupChevron, { color }]}>{isOpen ? '▲' : '▼'}</Text>
                </View>
              </TouchableOpacity>

              {/* Exercises */}
              {isOpen && exercises.map(ex => {
                const sel = isSelected(ex);
                return (
                  <TouchableOpacity
                    key={ex}
                    style={[neuStyles.exOptRow, sel && { backgroundColor: color + '18' }]}
                    onPress={() => toggle(mg, ex)}
                    activeOpacity={0.7}
                  >
                    <View style={[neuStyles.exCheckbox, sel && { backgroundColor: color, borderColor: color }]}>
                      {sel && <Text style={neuStyles.exCheckmark}>✓</Text>}
                    </View>
                    <View style={[neuStyles.exDot, { backgroundColor: color }]} />
                    <Text style={[neuStyles.exOptText, sel && { color: C.text, fontWeight: '700' }]}>{ex}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          );
        })}
      </ScrollView>

      {/* Confirm button */}
      <TouchableOpacity
        style={[
          neuStyles.confirmBtn,
          { backgroundColor: selected.length > 0 ? C.accent : C.border },
        ]}
        onPress={() => {
          if (selected.length > 0) onConfirm(selected);
        }}
        disabled={selected.length === 0}
        activeOpacity={0.8}
      >
        <Text style={[
          neuStyles.confirmBtnText,
          { color: selected.length > 0 ? '#fff' : C.muted },
        ]}>
          {selected.length === 0
            ? 'Select exercises above'
            : `Add ${selected.length} Exercise${selected.length > 1 ? 's' : ''} ✓`}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Save Confirmation Toast
// ─────────────────────────────────────────────────────────────────────────────
function SaveToast({ visible, day }: { visible: boolean; day: string }) {
  const { showAlert } = useCustomAlert();

  const { C } = useTheme();
  const neuStyles = makeNeuStyles(C);
  if (!visible) return null;
  return (
    <View style={neuStyles.toast}>
      <Text style={neuStyles.toastIcon}>✓</Text>
      <Text style={neuStyles.toastText}>{day} plan saved!</Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Exercise Log Card (Log tab)
// ─────────────────────────────────────────────────────────────────────────────
function ExerciseLogCard({
  ex,
  onLog,
  loggedSets,
  onDelete
}: {
  ex: WorkoutPlanExercise;
  onLog: (s: number, r: number, w: number) => void;
  loggedSets: ExerciseLog[];
  onDelete?: () => void;
}) {
  const { C } = useTheme();
  const styles = makeStyles(C);
  const { showAlert } = useCustomAlert();
  const [sets, setSets] = useState('1');
  const [reps, setReps] = useState('8');
  const [weight, setWeight] = useState('');

  const [setsModal, setSetsModal] = useState(false);
  const [repsModal, setRepsModal] = useState(false);

  const handleLog = () => {
    const w = parseFloat(weight);
    if (isNaN(w)) {
      showAlert('Weight', 'Enter a valid weight.');
      return;
    }
    const s = parseInt(sets, 10);
    const r = parseInt(reps, 10);
    onLog(s, r, w);
  };

  return (
    <Card accent={C.mg[ex.muscle_group] || C.accent}>
      <View style={styles.section}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Text style={[styles.sectionTitle, { flex: 1 }]}>{ex.exercise_name}</Text>
          {onDelete && (
            <TouchableOpacity onPress={onDelete} style={{ padding: 4 }}>
              <Ionicons name="trash-outline" size={20} color={C.red} />
            </TouchableOpacity>
          )}
        </View>
        <Text style={{ fontSize: 13, color: C.mg[ex.muscle_group], marginBottom: 12, fontWeight: '700' }}>
          {ex.muscle_group.toUpperCase()}
        </Text>

        {loggedSets.length > 0 && (
          <View style={{ marginBottom: 16 }}>
            {loggedSets.map((s, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: C.mg[ex.muscle_group] || C.accent, marginRight: 8 }} />
                <Text style={{ color: C.text, fontSize: 14 }}>
                  Set {i + 1}:  <Text style={{ fontWeight: '700' }}>{s.reps}</Text> reps @ <Text style={{ fontWeight: '700' }}>{s.weight}</Text> kg
                </Text>
              </View>
            ))}
          </View>
        )}

        <View style={styles.setsRow}>
          <TouchableOpacity style={styles.setsBox} onPress={() => setSetsModal(true)}>
            <Text style={styles.setsLabel}>Sets</Text>
            <Text style={styles.setsVal}>{sets}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.setsBox} onPress={() => setRepsModal(true)}>
            <Text style={styles.setsLabel}>Reps</Text>
            <Text style={styles.setsVal}>{reps}</Text>
          </TouchableOpacity>
          <View style={[styles.setsBox, { flex: 2 }]}>
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

        <View style={{ marginTop: 16 }}>
          <Btn label="+ Log Set" color={C.mg[ex.muscle_group] || C.accent} onPress={handleLog} small />
        </View>
      </View>

      <NeuModal visible={setsModal} title="Sets" onClose={() => setSetsModal(false)}>
        <FlatOptions
          options={['1','2','3','4','5'].map(v => ({ label: v, value: v }))}
          onSelect={v => { setSets(v); setSetsModal(false); }}
        />
      </NeuModal>
      <NeuModal visible={repsModal} title="Reps" onClose={() => setRepsModal(false)}>
        <FlatOptions
          options={['1','2','3','4','5','6','8','10','12','15','20'].map(v => ({ label: v, value: v }))}
          onSelect={v => { setReps(v); setRepsModal(false); }}
        />
      </NeuModal>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Screen
// ─────────────────────────────────────────────────────────────────────────────
export default function WorkoutsScreen() {
  const { showAlert } = useCustomAlert();


  const { C, isDark } = useTheme();
  const styles = makeStyles(C);
  const [tab, setTab] = useState<Tab>('Planner');
  const [plans, setPlans] = useState<WorkoutPlan[]>([]);
  const [planExercises, setPlanExercises] = useState<WorkoutPlanExercise[]>([]);
  const [muscles, setMuscles] = useState<MuscleEntry[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [selectedHistoryId, setSelectedHistoryId] = useState<number | null>(null);
  const [refresh, setRefresh] = useState(false);

  const [sessionId, setSessionId] = useState<number | null>(null);
  const [sessionDate, setSessionDate] = useState(todayStr());
  const [sessionNotes, setSessionNotes] = useState('');
  const [exercises, setExercises] = useState<any[]>([]);
  const [sessionMGs, setSessionMGs] = useState<string[]>([]);
  const [todaysExercises, setTodaysExercises] = useState<WorkoutPlanExercise[]>([]);

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

  // Saved toast state
  const [savedDay, setSavedDay] = useState<string | null>(null);

  const load = useCallback(() => {
    setPlans(getWorkoutPlans());
    setPlanExercises(getWorkoutPlanExercises());
    setMuscles(getMuscleTracker());
    setSessions(getWorkoutSessions(20));
    
    const dayName = new Date().toLocaleDateString('en-US', { weekday: 'long' });
    setTodaysExercises(getWorkoutPlanExercises(dayName));
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
  const tabs: Tab[] = ['Planner', 'Log', 'Muscles', 'History'];

  const addExerciseSet = (exName: string, exMuscle: string, s: number, r: number, w: number) => {
    let currentSessionId = sessionId;
    
    if (!currentSessionId) {
      const mgs = Array.from(new Set(todaysExercises.map(e => e.muscle_group))).join(', ');
      currentSessionId = createWorkoutSession(sessionDate, mgs || 'Mixed', sessionNotes);
      setSessionId(currentSessionId);

      if (sessionDate === todayStr()) {
        updateDailyLog(todayStr(), { workout_completed: 1 });
        updateStreak();
      }
    }

    const { isNewPR, oldPR, new1RM } = checkPRForLog(exName, s, r, w);

    logExercise(currentSessionId, sessionDate, exName, exMuscle, s, r, w);

    setExercises(prev => [
      ...prev,
      { name: exName, muscle: exMuscle, sets: s, reps: r, weight: w },
    ]);

    if (isNewPR) {
      setPrData({ exercise: exName, oldPR, new1RM, weight: w, reps: r });
    }
  };

  const finishSession = () => {
    if (!exercises.length) {
      showAlert('Add at least one exercise.');
      return;
    }

    showAlert('Session Complete!', `${exercises.length} exercises logged.`);
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

      <NestableScrollContainer
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
              // Show toast feedback
              setSavedDay(day);
              setTimeout(() => setSavedDay(null), 2000);
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
                  style={styles.muscleCard}
                >
                  <View style={[styles.muscleIcon, { backgroundColor: mgColor + '22' }]}>
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
                  {/* Recovery indicator bar */}
                  <View style={[styles.recoveryDot, { backgroundColor: color }]} />
                </View>
              );
            })}
          </>
        )}

        {tab === 'Log' && (
          <>
            <View style={{ paddingHorizontal: 4, marginBottom: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 20, fontWeight: '800', color: C.text }}>
                {sessionId ? `Session #${sessionId}` : "Today's Workout"}
              </Text>
              {sessionId !== null && (
                <TouchableOpacity onPress={finishSession} style={{ paddingHorizontal: 16, paddingVertical: 8, backgroundColor: C.water, borderRadius: 12 }}>
                  <Text style={{ color: '#fff', fontWeight: '700' }}>Finish</Text>
                </TouchableOpacity>
              )}
            </View>

            {todaysExercises.length === 0 ? (
              <EmptyState
                icon="calendar-outline"
                message="No Plan for Today"
                sub="Go to Planner tab and add exercises for today."
              />
            ) : (
              <>
                {!sessionId && (
                  <Card accent={C.accent}>
                    <View style={styles.section}>
                      <Text style={styles.fieldLabel}>Date</Text>
                      <TextInput
                        style={styles.input}
                        value={sessionDate}
                        onChangeText={setSessionDate}
                        placeholder="YYYY-MM-DD"
                        placeholderTextColor={C.muted}
                      />

                      <Text style={styles.fieldLabel}>Notes</Text>
                      <TextInput
                        style={[styles.input, { marginBottom: 0 }]}
                        value={sessionNotes}
                        onChangeText={setSessionNotes}
                        placeholder="Session notes..."
                        placeholderTextColor={C.muted}
                      />
                    </View>
                  </Card>
                )}

                <NestableDraggableFlatList
                  data={todaysExercises}
                  keyExtractor={(item) => item.id.toString() + item.exercise_name}
                  onDragEnd={({ data }) => setTodaysExercises(data)}
                  renderItem={({ item, drag, isActive }) => (
                    <ScaleDecorator>
                      <TouchableOpacity
                        onLongPress={drag}
                        disabled={isActive}
                        activeOpacity={1}
                        style={{ elevation: isActive ? 5 : 0 }}
                      >
                        <ExerciseLogCard
                          ex={item}
                          onLog={(s, r, w) => addExerciseSet(item.exercise_name, item.muscle_group, s, r, w)}
                          loggedSets={exercises.filter(e => e.name === item.exercise_name)}
                          onDelete={() => setTodaysExercises(prev => prev.filter(e => e.id !== item.id))}
                        />
                      </TouchableOpacity>
                    </ScaleDecorator>
                  )}
                />

                {sessionId !== null && (
                  <Card accent={C.green}>
                    <View style={styles.section}>
                      <Text style={styles.sectionTitle}>Done For Today?</Text>
                      <Btn label="Finish Workout" color={C.water} onPress={finishSession} />
                    </View>
                  </Card>
                )}
              </>
            )}
          </>
        )}

        {tab === 'History' && (() => {
          const activeSession = sessions.find(s => s.id === selectedHistoryId) || sessions[0] || null;
          const exsForActive = activeSession ? getSessionExercises(activeSession.id) : [];

          // Compute total sets per muscle group for active session
          const setCountsMap: Record<string, number> = {};
          if (activeSession) {
            for (const ex of exsForActive) {
              const mg = ex.muscle_group;
              if (mg) {
                setCountsMap[mg] = (setCountsMap[mg] || 0) + (ex.sets || 1);
              }
            }
            // Fallback to session.muscle_groups if no individual exercise logs exist
            if (Object.keys(setCountsMap).length === 0 && activeSession.muscle_groups) {
              for (const p of activeSession.muscle_groups.split(',')) {
                const cleaned = p.trim();
                if (cleaned) setCountsMap[cleaned] = 1;
              }
            }
          }

          return (
            <>
              <SectionHeader title="Workout Anatomy & History" />

              {/* ── Anatomy Diagram Card ── */}
              <Card accent={C.red}>
                <View style={styles.section}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <Text style={styles.sectionTitle}>
                      {activeSession ? `Session: ${activeSession.session_date}` : 'Target Muscles'}
                    </Text>
                    {activeSession && (
                      <View style={{ backgroundColor: C.red + '22', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 }}>
                        <Text style={{ fontSize: 11, color: C.red, fontWeight: '800' }}>
                          {activeSession.muscle_groups}
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text style={{ fontSize: 12, color: C.muted, marginBottom: 8 }}>
                    Green intensity increases with sets completed (1 set light green, 4+ sets deep emerald).
                  </Text>

                  {/* Body Vector Anatomy with Set Volume Heatmap */}
                  <BodyAnatomy muscleSetCounts={setCountsMap} />

                  {/* Date / Session Selector Horizontal Carousel */}
                  {sessions.length > 0 && (
                    <View style={{ marginTop: 12 }}>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: C.muted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        Select Date / Session:
                      </Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
                        {sessions.map(s => {
                          const isSel = activeSession?.id === s.id;
                          return (
                            <TouchableOpacity
                              key={s.id}
                              onPress={() => setSelectedHistoryId(s.id)}
                              style={{
                                paddingVertical: 6,
                                paddingHorizontal: 14,
                                borderRadius: 12,
                                backgroundColor: isSel ? C.red : (isDark ? '#1C2333' : '#E2E8F0'),
                                borderWidth: 1,
                                borderColor: isSel ? C.red : C.border,
                              }}
                            >
                              <Text style={{ fontSize: 12, fontWeight: '700', color: isSel ? '#FFF' : C.text }}>
                                {s.session_date}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </ScrollView>
                    </View>
                  )}
                </View>
              </Card>

              <SectionHeader title="Past Sessions" />
              {sessions.length === 0 ? (
                <EmptyState icon="clipboard-outline" message="No workouts logged yet" sub="Go to Log tab to start tracking" />
              ) : (
                sessions.map(s => {
                  const isSelected = activeSession?.id === s.id;
                  const exs = getSessionExercises(s.id);

                  return (
                    <TouchableOpacity
                      key={s.id}
                      activeOpacity={0.85}
                      onPress={() => setSelectedHistoryId(s.id)}
                      style={{ marginBottom: 14 }}
                    >
                      <Card accent={isSelected ? C.red : C.accent}>
                        <View style={styles.section}>
                          <View style={styles.histHeader}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                              <Text style={[styles.histDate, isSelected && { color: C.red, fontWeight: '800' }]}>
                                {s.session_date}
                              </Text>
                              {isSelected && (
                                <View style={{ backgroundColor: C.red, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                                  <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>VIEWING</Text>
                                </View>
                              )}
                            </View>
                            <View style={styles.mgRow}>
                              {s.muscle_groups.split(',').slice(0, 3).map((g: string) => (
                                <MuscleTag key={g} name={g.trim()} />
                              ))}
                            </View>
                          </View>
                          {s.notes ? (
                            <Text style={{ fontSize: 13, color: C.textSub, marginBottom: 12, fontStyle: 'italic' }}>
                              "{s.notes}"
                            </Text>
                          ) : null}

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
                    </TouchableOpacity>
                  );
                })
              )}
            </>
          );
        })()}
      </NestableScrollContainer>

      {/* ── Save Toast ── */}
      <SaveToast visible={!!savedDay} day={savedDay || ''} />

      {/* ── Muscle Group Picker (Log tab) ── */}
      <NeuModal visible={muscleModal} title="Select Muscle Group" onClose={() => setMuscleModal(false)}>
        <FlatOptions
          options={MUSCLE_GROUPS.map(m => ({ label: m, value: m }))}
          onSelect={v => {
            setSelMuscle(v);
            setSelExercise(EXERCISE_LIBRARY[v]?.[0] || '');
            setMuscleModal(false);
          }}
        />
      </NeuModal>

      {/* ── Exercise Picker (Log tab) ── */}
      <NeuModal visible={exModal} title="Select Exercise" onClose={() => setExModal(false)}>
        <FlatOptions
          options={(EXERCISE_LIBRARY[selMuscle] || []).map(e => ({ label: e, value: e }))}
          onSelect={v => {
            setSelExercise(v);
            setExModal(false);
          }}
        />
      </NeuModal>

      {/* ── Sets Picker ── */}
      <NeuModal visible={setsModal} title="Sets" onClose={() => setSetsModal(false)}>
        <FlatOptions
          options={['1','2','3','4','5','6','7','8'].map(v => ({ label: v, value: v }))}
          onSelect={v => { setSets(v); setSetsModal(false); }}
        />
      </NeuModal>

      {/* ── Reps Picker ── */}
      <NeuModal visible={repsModal} title="Reps" onClose={() => setRepsModal(false)}>
        <FlatOptions
          options={['1','2','3','4','5','6','8','10','12','15','20','25'].map(v => ({ label: v, value: v }))}
          onSelect={v => { setReps(v); setRepsModal(false); }}
        />
      </NeuModal>

      {/* ── PR Celebration Overlay ── */}
      {prData && (
        <View style={styles.prOverlay}>
          <View style={styles.prCard}>
            <Text style={{ fontSize: 52, textAlign: 'center' }}>🏆</Text>
            <Text style={styles.prTitle}>NEW PERSONAL{'\n'}RECORD!</Text>
            <Text style={styles.prExercise}>{prData.exercise}</Text>
            <View style={styles.prDivider} />
            {prData.oldPR && (
              <Text style={styles.prOld}>
                Previous: {prData.oldPR.weight}kg × {prData.oldPR.reps} reps
              </Text>
            )}
            <Text style={styles.prNew}>
              {prData.weight}kg × {prData.reps} reps
            </Text>
            <Text style={styles.pr1rm}>e1RM: {prData.new1RM.toFixed(1)} kg</Text>
            <View style={{ width: '100%', marginTop: 8 }}>
              <Btn label="Let's Go! 🎉" color={C.accent} onPress={() => setPrData(null)} />
            </View>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PlannerTab
// ─────────────────────────────────────────────────────────────────────────────
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
  const { C } = useTheme();
  const styles = makeStyles(C);
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long' });
  const planMap = Object.fromEntries(plans.map(p => [p.day_of_week, p]));
  const [edits, setEdits] = useState<Record<string, { name: string; mgs: string[] }>>({});
  const [exerciseDay, setExerciseDay] = useState<string | null>(null);
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());

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

  // Which muscle groups are selected for the current exercise day
  const exerciseMuscles = exerciseDay
    ? getEdit(exerciseDay).mgs.filter(mg => mg !== 'Rest' && EXERCISE_LIBRARY[mg])
    : [];
  const musclesForPicker = exerciseMuscles.length ? exerciseMuscles : MUSCLE_GROUPS;

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
                        backgroundColor: sel ? col + '22' : C.bg,
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
                {/* Collapse/Expand toggle */}
                <TouchableOpacity
                  style={styles.viewExBtn}
                  onPress={() =>
                    setExpandedDays(prev => {
                      const next = new Set(prev);
                      next.has(day) ? next.delete(day) : next.add(day);
                      return next;
                    })
                  }
                  activeOpacity={0.75}
                >
                  <Text style={styles.viewExBtnText}>
                    {expandedDays.has(day)
                      ? `▲ Hide exercises`
                      : `▼ View ${exercisesForDay.length} exercise${exercisesForDay.length > 1 ? 's' : ''}`}
                  </Text>
                </TouchableOpacity>

                {/* Expanded list */}
                {expandedDays.has(day) && (
                  <View style={{ marginTop: 10 }}>
                    {Object.entries(
                      exercisesForDay.reduce((acc, ex) => {
                        if (!acc[ex.muscle_group]) acc[ex.muscle_group] = [];
                        acc[ex.muscle_group].push(ex);
                        return acc;
                      }, {} as Record<string, WorkoutPlanExercise[]>)
                    ).map(([mg, exList]) => (
                      <View key={mg}>
                        <Text style={[styles.plannedMuscleHeader, { color: C.mg[mg] || C.accent }]}>
                          {mg}
                        </Text>
                        {exList.map(ex => (
                          <View key={ex.id} style={styles.plannedExerciseRow}>
                            <View style={[styles.exDot, { backgroundColor: C.mg[ex.muscle_group] || C.accent }]} />
                            <Text style={styles.exName}>{ex.exercise_name}</Text>
                            <TouchableOpacity
                              onPress={() => onDeleteExercise(ex.id)}
                              style={styles.deletePlanExBtn}
                            >
                              <Text style={styles.deletePlanExText}>×</Text>
                            </TouchableOpacity>
                          </View>
                        ))}
                      </View>
                    ))}
                  </View>
                )}
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

      {/* ── Grouped Exercise Picker for Weekly Plan — Multi-select ── */}
      <NeuModal
        visible={!!exerciseDay}
        title={`Add Exercises${exerciseDay ? ` — ${exerciseDay}` : ''}`}
        onClose={() => setExerciseDay(null)}
      >
        <GroupedExercisePicker
          muscleGroups={musclesForPicker}
          onConfirm={(selections) => {
            if (!exerciseDay) return;
            selections.forEach(({ muscle, exercise }) => {
              onAddExercise(exerciseDay, exercise, muscle);
            });
            setExerciseDay(null);
          }}
        />
      </NeuModal>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────
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
  tabBar: {
    flexDirection: 'row',
    backgroundColor: C.bg,
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
  fieldLabel: { fontSize: 11, color: C.muted, marginBottom: 4, marginTop: 8, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  input: {
    backgroundColor: C.bg,
    borderRadius: 12,
    borderWidth: 0,
    color: C.text,
    padding: 12,
    fontSize: 14,
    marginBottom: 10,
    shadowColor: '#BFC8D6',
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 0.9,
    shadowRadius: 8,
    elevation: 4,
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
    borderWidth: 0,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    shadowColor: '#BFC8D6',
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 0.9,
    shadowRadius: 8,
    elevation: 4,
  },
  setsLabel: { fontSize: 10, color: C.muted, marginBottom: 4, textTransform: 'uppercase' },
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
  recoveryDot: { width: 10, height: 10, borderRadius: 5 },
  muscleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.card,
    borderRadius: 16,
    borderWidth: 0,
    padding: 14,
    marginBottom: 12,
    gap: 14,
    shadowColor: '#BFC8D6',
    shadowOffset: { width: 5, height: 5 },
    shadowOpacity: 0.9,
    shadowRadius: 10,
    elevation: 6,
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
    borderRadius: 16,
    borderWidth: 0,
    padding: 14,
    marginBottom: 12,
    shadowColor: '#BFC8D6',
    shadowOffset: { width: 5, height: 5 },
    shadowOpacity: 0.9,
    shadowRadius: 10,
    elevation: 6,
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
    backgroundColor: C.accentDim,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  todayText: { fontSize: 10, color: C.accent, fontWeight: '700' },
  plannedList: {
    borderTopWidth: 1,
    borderTopColor: C.border,
    marginBottom: 10,
    paddingTop: 4,
  },
  plannedMuscleHeader: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: 8,
    marginBottom: 4,
    paddingLeft: 4,
  },
  plannedExerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
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
  viewExBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.accent,
    backgroundColor: C.accentDim,
  },
  viewExBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: C.accent,
  },
  // PR overlay
  prOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(40,50,70,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  prCard: {
    backgroundColor: C.card,
    borderRadius: 24,
    padding: 28,
    width: '85%',
    alignItems: 'center',
    gap: 8,
    shadowColor: '#BFC8D6',
    shadowOffset: { width: 8, height: 8 },
    shadowOpacity: 0.95,
    shadowRadius: 16,
    elevation: 16,
  },
  prTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: C.yellow,
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  prExercise: {
    fontSize: 16,
    fontWeight: '700',
    color: C.text,
    textAlign: 'center',
  },
  prDivider: {
    width: '80%',
    height: 1,
    backgroundColor: C.border,
    marginVertical: 4,
  },
  prOld: { fontSize: 13, color: C.muted },
  prNew: { fontSize: 20, fontWeight: '800', color: C.green },
  pr1rm: { fontSize: 16, fontWeight: '700', color: C.accent },
}); }

// ─────────────────────────────────────────────────────────────────────────────
// Neumorphic Modal Styles
// ─────────────────────────────────────────────────────────────────────────────
function makeNeuStyles(C: any) { return StyleSheet.create({
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
    paddingBottom: 36,
    shadowColor: '#BFC8D6',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 20,
  },
  handle: {
    width: 40,
    height: 5,
    backgroundColor: C.shadowDark,
    borderRadius: 3,
    alignSelf: 'center',
    marginBottom: 16,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: C.text,
    marginBottom: 12,
  },
  // Flat option row
  optRow: {
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  optText: {
    fontSize: 15,
    color: C.textSub,
    fontWeight: '500',
  },
  // Grouped exercise picker
  groupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 10,
    marginTop: 6,
    borderLeftWidth: 3,
    backgroundColor: C.border,
    borderRadius: 8,
  },
  groupTitle: {
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  groupChevron: {
    fontSize: 11,
    fontWeight: '700',
  },
  exOptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  exDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 12,
  },
  exOptText: {
    fontSize: 14,
    color: C.textSub,
  },
  // Checkbox for multi-select
  exCheckbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: C.border,
    marginRight: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.bg,
  },
  exCheckmark: {
    fontSize: 12,
    color: '#fff',
    fontWeight: '900',
  },
  // Badge showing count of selected exercises per group
  groupBadge: {
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
    marginRight: 8,
  },
  groupBadgeText: {
    fontSize: 11,
    color: '#fff',
    fontWeight: '800',
  },
  // Confirm / Add button
  confirmBtn: {
    marginTop: 12,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    shadowColor: C.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  confirmBtnText: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  // Save toast
  toast: {
    position: 'absolute',
    bottom: 80,
    alignSelf: 'center',
    backgroundColor: C.green,
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#BFC8D6',
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 0.8,
    shadowRadius: 10,
    elevation: 10,
  },
  toastIcon: { fontSize: 16, color: '#fff', fontWeight: '900' },
  toastText: { fontSize: 14, color: '#fff', fontWeight: '700' },
}); }