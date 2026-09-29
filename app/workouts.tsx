import React, { useCallback, useEffect, useRef, useState } from 'react';
import Svg, { Path, Rect, Circle } from 'react-native-svg';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  RefreshControl,
  Modal,
  LayoutChangeEvent,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
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
  getExercisesForDate,
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
  visible, title, onClose, children, fullScreen,
}: {
  visible: boolean; title: string; onClose: () => void; children: React.ReactNode; fullScreen?: boolean;
}) {
  const { C } = useTheme();
  const neuStyles = makeNeuStyles(C);
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={neuStyles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity
          activeOpacity={1}
          style={[neuStyles.sheet, fullScreen && neuStyles.sheetFull]}
          onPress={e => e.stopPropagation()}
        >
          <View style={neuStyles.handle} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Text style={neuStyles.sheetTitle}>{title}</Text>
            <TouchableOpacity onPress={onClose} style={{ padding: 4 }}>
              <Ionicons name="close-circle" size={24} color={C.muted} />
            </TouchableOpacity>
          </View>
          <View style={fullScreen ? { flex: 1 } : {}}>
            {children}
          </View>
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
  const allGroups = muscleGroups.length ? muscleGroups : Object.keys(EXERCISE_LIBRARY);
  const [activeTab, setActiveTab] = useState<string>(allGroups[0] ?? '');
  const [selected, setSelected] = useState<{ muscle: string; exercise: string }[]>([]);

  // Custom exercise creation
  const [showCustom, setShowCustom] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customMuscle, setCustomMuscle] = useState(allGroups[0] ?? 'Chest');

  const isSelected = (exercise: string) =>
    selected.some(s => s.exercise === exercise);

  const toggle = (muscle: string, exercise: string) => {
    setSelected(prev =>
      prev.some(s => s.exercise === exercise)
        ? prev.filter(s => s.exercise !== exercise)
        : [...prev, { muscle, exercise }]
    );
  };

  const removeSelected = (exercise: string) => {
    setSelected(prev => prev.filter(s => s.exercise !== exercise));
  };

  const addCustomExercise = () => {
    const name = customName.trim();
    if (!name) return;
    if (!isSelected(name)) {
      setSelected(prev => [...prev, { muscle: customMuscle, exercise: name }]);
    }
    setCustomName('');
    setShowCustom(false);
  };

  const exercises = EXERCISE_LIBRARY[activeTab] || [];
  const activeColor = C.mg[activeTab] || C.accent;

  return (
    <View style={{ flex: 1 }}>

      {/* ── Selected pills strip (sticky at top) ── */}
      {selected.length > 0 && (
        <View style={neuStyles.selectedStrip}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 2 }}>
            {selected.map(s => {
              const col = C.mg[s.muscle] || C.accent;
              return (
                <TouchableOpacity
                  key={s.exercise}
                  style={[neuStyles.selectedPill, { backgroundColor: col + '28', borderColor: col }]}
                  onPress={() => removeSelected(s.exercise)}
                  activeOpacity={0.75}
                >
                  <Text style={[neuStyles.selectedPillText, { color: col }]}>{s.exercise}</Text>
                  <Text style={[neuStyles.selectedPillX, { color: col }]}>  ×</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* ── Muscle group tabs (horizontal scroll) ── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={neuStyles.tabScroll}
        contentContainerStyle={{ gap: 8, paddingVertical: 4, paddingHorizontal: 2 }}
      >
        {allGroups.map(mg => {
          const col = C.mg[mg] || C.accent;
          const isActive = activeTab === mg;
          const count = selected.filter(s => s.muscle === mg).length;
          return (
            <TouchableOpacity
              key={mg}
              style={[
                neuStyles.mgTab,
                isActive && { backgroundColor: col, borderColor: col },
                !isActive && { borderColor: C.border },
              ]}
              onPress={() => setActiveTab(mg)}
              activeOpacity={0.8}
            >
              <Text style={[neuStyles.mgTabText, { color: isActive ? '#fff' : col }]}>{mg}</Text>
              {count > 0 && (
                <View style={[neuStyles.mgTabBadge, { backgroundColor: isActive ? 'rgba(255,255,255,0.3)' : col }]}>
                  <Text style={neuStyles.mgTabBadgeText}>{count}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* ── Exercise list for active tab ── */}
      <ScrollView style={neuStyles.exListScroll} showsVerticalScrollIndicator={false}>

        {/* Custom exercise creation row */}
        {!showCustom ? (
          <TouchableOpacity
            style={neuStyles.createCustomBtn}
            onPress={() => setShowCustom(true)}
            activeOpacity={0.75}
          >
            <Ionicons name="add-circle-outline" size={18} color={C.accent} />
            <Text style={[neuStyles.createCustomText, { color: C.accent }]}>  Create custom exercise</Text>
          </TouchableOpacity>
        ) : (
          <View style={neuStyles.customInputRow}>
            <TextInput
              style={[neuStyles.customInput, { color: C.text, borderColor: C.accent }]}
              placeholder="Exercise name…"
              placeholderTextColor={C.muted}
              value={customName}
              onChangeText={setCustomName}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={addCustomExercise}
            />
            {/* Muscle picker for custom */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }} contentContainerStyle={{ gap: 6 }}>
              {allGroups.map(mg => {
                const col = C.mg[mg] || C.accent;
                const sel = customMuscle === mg;
                return (
                  <TouchableOpacity
                    key={mg}
                    style={[neuStyles.mgTab, { borderColor: sel ? col : C.border, backgroundColor: sel ? col + '22' : 'transparent', paddingVertical: 4, paddingHorizontal: 10 }]}
                    onPress={() => setCustomMuscle(mg)}
                  >
                    <Text style={[neuStyles.mgTabText, { color: sel ? col : C.muted, fontSize: 11 }]}>{mg}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
              <TouchableOpacity
                style={[neuStyles.confirmBtn, { flex: 1, paddingVertical: 10, backgroundColor: C.accent, marginTop: 0 }]}
                onPress={addCustomExercise}
              >
                <Text style={[neuStyles.confirmBtnText, { color: '#fff' }]}>Add</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[neuStyles.confirmBtn, { flex: 1, paddingVertical: 10, backgroundColor: C.border, marginTop: 0 }]}
                onPress={() => { setShowCustom(false); setCustomName(''); }}
              >
                <Text style={[neuStyles.confirmBtnText, { color: C.muted }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Exercise rows */}
        {exercises.map((ex, idx) => {
          const sel = isSelected(ex);
          return (
            <TouchableOpacity
              key={ex}
              style={[
                neuStyles.exOptRow,
                sel && { backgroundColor: activeColor + '18' },
                idx === exercises.length - 1 && { borderBottomWidth: 0 },
              ]}
              onPress={() => toggle(activeTab, ex)}
              activeOpacity={0.7}
            >
              <View style={[neuStyles.exCheckbox, sel && { backgroundColor: activeColor, borderColor: activeColor }]}>
                {sel && <Text style={neuStyles.exCheckmark}>✓</Text>}
              </View>
              <View style={[neuStyles.exDot, { backgroundColor: activeColor }]} />
              <Text style={[neuStyles.exOptText, sel && { color: C.text, fontWeight: '700' }]}>{ex}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* ── Confirm button ── */}
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
// Muscle Group Accordion (Log tab) — groups exercises by muscle with collapse
// ─────────────────────────────────────────────────────────────────────────────
const MUSCLE_DISTINCT_COLORS: Record<string, string> = {
  'Chest': '#E05C5C',        // Coral Red
  'Back': '#3B82F6',         // Ocean Blue
  'Upper Back': '#2563EB',   // Royal Blue
  'Lower Back': '#1D4ED8',   // Deep Indigo Blue
  'Shoulders': '#8B5CF6',    // Vibrant Violet
  'Biceps': '#10B981',       // Emerald Green
  'Triceps': '#06B6D4',      // Bright Cyan / Turquoise
  'Legs': '#F59E0B',         // Golden Amber
  'Quads': '#D97706',        // Deep Amber
  'Hamstrings': '#B45309',   // Bronze Amber
  'Calves': '#CA8A04',       // Mustard Gold
  'Core': '#EF4444',         // Ruby Red
  'Abs': '#EF4444',          // Crimson
  'Forearms': '#EC4899',     // Magenta Pink
  'Traps': '#6366F1',        // Indigo Purple
  'Cardio': '#F43F5E',       // Rose Red
};

function MuscleGroupAccordion({
  muscle, exercises, loggedSets, onLog, onDelete, expandAll,
}: {
  muscle: string;
  exercises: WorkoutPlanExercise[];
  loggedSets: any[];
  onLog: (exName: string, s: number, r: number, w: number) => void;
  onDelete: (id: number) => void;
  expandAll?: boolean;
}) {
  const { C } = useTheme();
  const mgColor = MUSCLE_DISTINCT_COLORS[muscle] || C.mg[muscle] || C.accent;
  const [localExpanded, setLocalExpanded] = useState(false);
  const expanded = expandAll || localExpanded;

  const doneCount = exercises.filter(ex =>
    loggedSets.some(s => s.name === ex.exercise_name)
  ).length;

  return (
    <View style={{ marginBottom: 10 }}>
      {/* Accordion Header */}
      <TouchableOpacity
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: mgColor + '18',
          borderRadius: 16,
          borderWidth: 1.5,
          borderColor: mgColor + '44',
          paddingHorizontal: 14,
          paddingVertical: 12,
          marginBottom: expanded ? 6 : 0,
        }}
        onPress={() => setLocalExpanded(e => !e)}
        activeOpacity={0.8}
      >
        {/* Consistent Dumbbell Icon with Distinct Category Color */}
        <View style={{
          width: 38, height: 38, borderRadius: 12,
          backgroundColor: mgColor + '28',
          alignItems: 'center', justifyContent: 'center',
          marginRight: 12,
        }}>
          <Ionicons name="barbell" size={20} color={mgColor} />
        </View>

        {/* Title + count */}
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, fontWeight: '800', color: mgColor }}>{muscle}</Text>
          <Text style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>
            {exercises.length} exercise{exercises.length > 1 ? 's' : ''}
            {doneCount > 0 ? `  •  ${doneCount} logged` : ''}
          </Text>
        </View>

        {/* Exercise icon pills (up to 3) when collapsed */}
        {!expanded && (
          <View style={{ flexDirection: 'row', gap: 4, marginRight: 8 }}>
            {exercises.slice(0, 3).map((ex, i) => {
              const done = loggedSets.some(s => s.name === ex.exercise_name);
              return (
                <View key={i} style={{
                  width: 28, height: 28, borderRadius: 8,
                  backgroundColor: done ? mgColor : mgColor + '20',
                  alignItems: 'center', justifyContent: 'center',
                  borderWidth: 1, borderColor: mgColor + '55',
                }}>
                  <Ionicons name={done ? 'checkmark' : 'barbell-outline'} size={12} color={done ? '#fff' : mgColor} />
                </View>
              );
            })}
            {exercises.length > 3 && (
              <View style={{
                width: 28, height: 28, borderRadius: 8,
                backgroundColor: C.border,
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Text style={{ fontSize: 10, fontWeight: '800', color: C.muted }}>+{exercises.length - 3}</Text>
              </View>
            )}
          </View>
        )}

        {/* Done badge */}
        {doneCount === exercises.length && exercises.length > 0 && (
          <View style={{ backgroundColor: C.green + '22', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, marginRight: 8 }}>
            <Text style={{ fontSize: 10, color: C.green, fontWeight: '800' }}>✓ DONE</Text>
          </View>
        )}

        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={mgColor} />
      </TouchableOpacity>

      {/* Expanded exercise cards */}
      {expanded && (
        <>
          {exercises.map(ex => (
            <ExerciseLogCard
              key={ex.id}
              ex={ex}
              onLog={(s, r, w) => onLog(ex.exercise_name, s, r, w)}
              loggedSets={loggedSets.filter(s => s.name === ex.exercise_name)}
              onDelete={() => onDelete(ex.id)}
            />
          ))}
        </>
      )}
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
  const { openTab, scrollToDay } = useLocalSearchParams<{ openTab?: string; scrollToDay?: string }>();
  const [tab, setTab] = useState<Tab>((openTab as Tab) || 'Planner');
  // Keep tab in sync when screen re-focuses with a different openTab param
  useEffect(() => {
    if (openTab && ['Planner', 'Log', 'Muscles', 'History'].includes(openTab)) {
      setTab(openTab as Tab);
    }
  }, [openTab]);
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

  // View All state for Log tab accordion
  const [viewAll, setViewAll] = useState(false);

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

  // Planner day scroll ref
  const plannerScrollRef = useRef<any>(null);
  const dayOffsets = useRef<Record<string, number>>({});

  // When scrollToDay changes (edit button from home), switch to Planner and scroll
  useEffect(() => {
    if (scrollToDay && tab === 'Planner') {
      setTimeout(() => {
        const y = dayOffsets.current[scrollToDay as string];
        if (y !== undefined && plannerScrollRef.current) {
          plannerScrollRef.current.scrollTo({ y, animated: true });
        }
      }, 400);
    }
  }, [scrollToDay, tab]);

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
        ref={plannerScrollRef}
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refresh} onRefresh={onRefresh} tintColor={C.accent} />}
      >
        {tab === 'Planner' && (
          <PlannerTab
            plans={plans}
            planExercises={planExercises}
            dayOffsets={dayOffsets}
            onSave={(day, name, mgs) => {
              updateWorkoutPlan(day, name, mgs);
              load();
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
                    <Svg width={26} height={26} viewBox="0 0 64 64">
                      {/* Dumbbell bar */}
                      <Rect x="20" y="29" width="24" height="6" rx="3" fill={mgColor} />
                      {/* Left weight plate outer */}
                      <Rect x="6" y="20" width="8" height="24" rx="4" fill={mgColor} opacity={0.85} />
                      {/* Left weight plate inner */}
                      <Rect x="14" y="24" width="6" height="16" rx="3" fill={mgColor} />
                      {/* Right weight plate outer */}
                      <Rect x="50" y="20" width="8" height="24" rx="4" fill={mgColor} opacity={0.85} />
                      {/* Right weight plate inner */}
                      <Rect x="44" y="24" width="6" height="16" rx="3" fill={mgColor} />
                    </Svg>
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

                {/* View All toggle + Grouped accordion */}
                {(() => {
                  const groups: Record<string, WorkoutPlanExercise[]> = {};
                  for (const ex of todaysExercises) {
                    if (!groups[ex.muscle_group]) groups[ex.muscle_group] = [];
                    groups[ex.muscle_group].push(ex);
                  }
                  const groupEntries = Object.entries(groups);
                  return (
                    <>
                      {/* View All / Collapse button */}
                      <TouchableOpacity
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'flex-end',
                          paddingHorizontal: 4,
                          paddingVertical: 8,
                          marginBottom: 4,
                          gap: 6,
                        }}
                        onPress={() => setViewAll(v => !v)}
                        activeOpacity={0.7}
                      >
                        <Ionicons
                          name={viewAll ? 'contract-outline' : 'expand-outline'}
                          size={16}
                          color={C.accent}
                        />
                        <Text style={{ fontSize: 13, fontWeight: '700', color: C.accent }}>
                          {viewAll ? 'Collapse All' : 'View All'}
                        </Text>
                      </TouchableOpacity>

                      {groupEntries.map(([muscle, exList]) => (
                        <MuscleGroupAccordion
                          key={muscle}
                          muscle={muscle}
                          exercises={exList}
                          loggedSets={exercises}
                          expandAll={viewAll}
                          onLog={(exName, s, r, w) => addExerciseSet(exName, muscle, s, r, w)}
                          onDelete={(id) => setTodaysExercises(prev => prev.filter(e => e.id !== id))}
                        />
                      ))}
                    </>
                  );
                })()}

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
          // ── Group sessions by date ──────────────────────────────────────────
          const dateGroups: Record<string, { sessions: typeof sessions; allMuscles: string[] }> = {};
          for (const s of sessions) {
            if (!dateGroups[s.session_date]) {
              dateGroups[s.session_date] = { sessions: [], allMuscles: [] };
            }
            dateGroups[s.session_date].sessions.push(s);
            // Collect all unique muscle groups for the date
            if (s.muscle_groups) {
              for (const mg of s.muscle_groups.split(',')) {
                const trimmed = mg.trim();
                if (trimmed && !dateGroups[s.session_date].allMuscles.includes(trimmed)) {
                  dateGroups[s.session_date].allMuscles.push(trimmed);
                }
              }
            }
          }
          // Sorted dates descending
          const sortedDates = Object.keys(dateGroups).sort((a, b) => b.localeCompare(a));

          // Which date is currently "active"
          const activeDate: string | null =
            selectedHistoryId != null
              ? (sessions.find(s => s.id === selectedHistoryId)?.session_date ?? null)
              : (sortedDates[0] ?? null);

          // All exercises for the active date across ALL sessions that day
          const exsForActiveDate: ExerciseLog[] = activeDate ? getExercisesForDate(activeDate) : [];

          // Compute total sets per muscle group for active date
          const setCountsMap: Record<string, number> = {};
          for (const ex of exsForActiveDate) {
            const mg = ex.muscle_group;
            if (mg) {
              setCountsMap[mg] = (setCountsMap[mg] || 0) + (ex.sets || 1);
            }
          }
          // Fallback: if no exercise logs exist yet, use session muscle_groups
          if (Object.keys(setCountsMap).length === 0 && activeDate && dateGroups[activeDate]) {
            for (const mg of dateGroups[activeDate].allMuscles) {
              if (mg) setCountsMap[mg] = 1;
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
                      {activeDate ? activeDate : 'Target Muscles'}
                    </Text>
                    {activeDate && dateGroups[activeDate] && (
                      <View style={{ backgroundColor: C.red + '22', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, flexShrink: 1, maxWidth: '55%' }}>
                        <Text style={{ fontSize: 11, color: C.red, fontWeight: '800' }} numberOfLines={1}>
                          {dateGroups[activeDate].allMuscles.join(', ')}
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text style={{ fontSize: 12, color: C.muted, marginBottom: 8 }}>
                    Green intensity increases with sets completed (1 set light green, 4+ sets deep emerald).
                  </Text>

                  {/* Body Vector Anatomy with Set Volume Heatmap */}
                  <BodyAnatomy muscleSetCounts={setCountsMap} />

                  {/* Date Selector — one button per unique date */}
                  {sortedDates.length > 0 && (
                    <View style={{ marginTop: 12 }}>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: C.muted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        Select Day:
                      </Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
                        {sortedDates.map(date => {
                          const isSel = activeDate === date;
                          return (
                            <TouchableOpacity
                              key={date}
                              onPress={() => {
                                // Set selectedHistoryId to the first session of that date
                                const firstSession = dateGroups[date].sessions[0];
                                setSelectedHistoryId(firstSession?.id ?? null);
                              }}
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
                                {date}
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
                sortedDates.map(date => {
                  const group = dateGroups[date];
                  const isSelected = activeDate === date;
                  const dayExs = getExercisesForDate(date);
                  // Deduplicate exercises by name (keep highest weight/reps)
                  const seenEx = new Set<string>();
                  const dedupedExs = dayExs.filter(ex => {
                    if (seenEx.has(ex.exercise_name)) return false;
                    seenEx.add(ex.exercise_name);
                    return true;
                  });

                  return (
                    <TouchableOpacity
                      key={date}
                      activeOpacity={0.85}
                      onPress={() => {
                        const firstSession = group.sessions[0];
                        setSelectedHistoryId(firstSession?.id ?? null);
                      }}
                      style={{ marginBottom: 14 }}
                    >
                      <Card accent={isSelected ? C.red : C.accent}>
                        <View style={styles.section}>
                          <View style={styles.histHeader}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                              <Text style={[styles.histDate, isSelected && { color: C.red, fontWeight: '800' }]}>
                                {date}
                              </Text>
                              {isSelected && (
                                <View style={{ backgroundColor: C.red, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                                  <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>VIEWING</Text>
                                </View>
                              )}
                              {group.sessions.length > 1 && (
                                <View style={{ backgroundColor: C.accent + '22', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                                  <Text style={{ color: C.accent, fontSize: 10, fontWeight: '700' }}>{group.sessions.length} sessions</Text>
                                </View>
                              )}
                            </View>
                            <View style={styles.mgRow}>
                              {group.allMuscles.slice(0, 4).map((g: string) => (
                                <MuscleTag key={g} name={g} />
                              ))}
                              {group.allMuscles.length > 4 && (
                                <View style={{ paddingHorizontal: 8, paddingVertical: 4 }}>
                                  <Text style={{ fontSize: 11, color: C.muted, fontWeight: '600' }}>+{group.allMuscles.length - 4} more</Text>
                                </View>
                              )}
                            </View>
                          </View>

                          {dedupedExs.slice(0, 5).map((ex: ExerciseLog) => (
                            <View key={ex.id} style={styles.exRow}>
                              <View style={[styles.exDot, { backgroundColor: C.mg[ex.muscle_group] || C.accent }]} />
                              <Text style={styles.exName}>{ex.exercise_name}</Text>
                              <Text style={styles.exDetail}>
                                {ex.sets}x{ex.reps} @ {ex.weight}{ex.unit}
                              </Text>
                            </View>
                          ))}

                          {dedupedExs.length > 5 && (
                            <Text style={styles.moreText}>+ {dedupedExs.length - 5} more exercises</Text>
                          )}
                          {dedupedExs.length === 0 && dayExs.length === 0 && (
                            <Text style={styles.moreText}>Tap to view anatomy for this day</Text>
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
  dayOffsets,
  onSave,
  onAddExercise,
  onDeleteExercise,
}: {
  plans: WorkoutPlan[];
  planExercises: WorkoutPlanExercise[];
  dayOffsets?: React.MutableRefObject<Record<string, number>>;
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
          <View
            key={day}
            style={[styles.planCard, isToday && styles.planCardToday]}
            onLayout={(e: LayoutChangeEvent) => {
              if (dayOffsets) dayOffsets.current[day] = e.nativeEvent.layout.y;
            }}
          >
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
        fullScreen
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
    backgroundColor: 'rgba(20,30,50,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: C.card,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 20,
    paddingBottom: 36,
    maxHeight: '60%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 20,
  },
  sheetFull: {
    height: '92%',
    maxHeight: '92%',
  },
  handle: {
    width: 40,
    height: 5,
    backgroundColor: C.shadowDark,
    borderRadius: 3,
    alignSelf: 'center',
    marginBottom: 12,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: C.text,
  },
  // Selected pills strip
  selectedStrip: {
    marginBottom: 10,
    paddingVertical: 4,
  },
  selectedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  selectedPillText: {
    fontSize: 12,
    fontWeight: '700',
  },
  selectedPillX: {
    fontSize: 14,
    fontWeight: '900',
  },
  // Muscle group horizontal tabs
  tabScroll: {
    marginBottom: 10,
    flexGrow: 0,
  },
  mgTab: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
    gap: 5,
  },
  mgTabText: {
    fontSize: 12,
    fontWeight: '700',
  },
  mgTabBadge: {
    borderRadius: 8,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  mgTabBadgeText: {
    fontSize: 11,
    color: '#fff',
    fontWeight: '800',
  },
  // Exercise list scroll area
  exListScroll: {
    flex: 1,
    marginBottom: 8,
  },
  // Custom exercise creation
  createCustomBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    marginBottom: 4,
  },
  createCustomText: {
    fontSize: 14,
    fontWeight: '600',
  },
  customInputRow: {
    backgroundColor: C.bg,
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: C.accent,
  },
  customInput: {
    fontSize: 15,
    fontWeight: '600',
    borderBottomWidth: 1,
    paddingBottom: 6,
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