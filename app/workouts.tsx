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
  isRepsOnly,
  getLastWeight,
  getExerciseLogsSince,
  toDateStr,
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
import { ExerciseGuideButton } from '../components/ExerciseGuide';
import { findExercise } from '../constants/exerciseCatalog';
import { SplitWizard, SplitCard, getSplitConfig, targetFor, targetText, targetSentence, withKg } from '../components/SplitWizard';
import { WheelPicker } from '../components/WheelPicker';
import { WorkoutCalendar, longDate } from '../components/WorkoutCalendar';
import { weightStepsFor } from '../constants/equipment';
import { closestOnLadder, stepsAway } from '../constants/startingLoads';
import { getLoadFeedback, saveLoadFeedback, Vote } from '../utils/loadFeedback';
import { NestableScrollContainer, NestableDraggableFlatList, ScaleDecorator } from 'react-native-draggable-flatlist';
import { useTheme } from '../contexts/ThemeContext';
import { useCustomAlert } from '../contexts/AlertContext';
import { MUSCLE_GROUPS, DAYS, EXERCISE_LIBRARY } from '../constants/theme';

type Tab = 'Planner' | 'Muscles' | 'Log' | 'History';

// ─────────────────────────────────────────────────────────────────────────────
// Muscle recovery and frequency (Muscles tab)
// ─────────────────────────────────────────────────────────────────────────────
/** YYYY-MM-DD for n days before today */
function daysAgoStr(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toDateStr(d);
}
const dayDiff = (from: string, to: string) =>
  Math.round((new Date(to + 'T00:00:00').getTime() - new Date(from + 'T00:00:00').getTime()) / 86400000);

/** Days a muscle needs between hard sessions: big groups longer, small ones less. */
const RECOVERY_DAYS: Record<string, number> = {
  Legs: 3, 'Lower Back': 3, 'Upper Back': 2, Chest: 2, Shoulders: 2, Biceps: 2, Triceps: 2, Forearms: 1, Core: 1,
};

type MuscleStatus = 'ready' | 'recovering' | 'overworked' | 'overdue' | 'new';

interface MuscleInsight {
  muscle: string;
  status: MuscleStatus;
  daysSince: number | null;   // null = never trained
  readyIn: number;            // days of rest left
  recovery: number;           // 0–1
  hitsWeek: number;           // days trained in the last 7
  hitsMonth: number;          // days trained in the last 28
  setsWeek: number;
  week: boolean[];            // last 7 days, oldest first, trained or not
}

function muscleInsights(logs: ExerciseLog[], tracker: MuscleEntry[]): MuscleInsight[] {
  const today = todayStr();
  const days: Record<string, Set<string>> = {};
  const setsWeek: Record<string, number> = {};
  const weekStart = daysAgoStr(6);
  for (const l of logs) {
    // Old logs used a single 'Back' group: it counts for both halves
    const groups = l.muscle_group === 'Back' ? ['Upper Back', 'Lower Back'] : [l.muscle_group];
    for (const g of groups) {
      (days[g] ??= new Set()).add(l.session_date);
      if (l.session_date >= weekStart) setsWeek[g] = (setsWeek[g] ?? 0) + (l.sets || 1);
    }
  }
  return MUSCLE_GROUPS.map(muscle => {
    const trained = days[muscle] ?? new Set<string>();
    const sorted = [...trained].sort();
    // Older than four weeks: fall back to the tracker's last-trained date
    const tracked = tracker.find(t => t.muscle_group === muscle)?.last_trained ?? null;
    const last = sorted[sorted.length - 1] ?? tracked?.slice(0, 10) ?? null;
    const daysSince = last ? Math.max(0, dayDiff(last, today)) : null;
    const need = RECOVERY_DAYS[muscle] ?? 2;
    const week = Array.from({ length: 7 }, (_, i) => trained.has(daysAgoStr(6 - i)));
    const hitsWeek = week.filter(Boolean).length;
    const readyIn = daysSince === null ? 0 : Math.max(0, need - daysSince);
    const status: MuscleStatus =
      daysSince === null ? 'new'
      : hitsWeek >= 4 ? 'overworked'
      : readyIn > 0 ? 'recovering'
      : daysSince >= 8 ? 'overdue'
      : 'ready';
    return {
      muscle, status, daysSince, readyIn,
      recovery: daysSince === null ? 1 : Math.min(1, daysSince / need),
      hitsWeek, hitsMonth: trained.size, setsWeek: setsWeek[muscle] ?? 0, week,
    };
  });
}

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

  // Search covers every muscle group, not just this day's; otherwise show the tab
  // with a header for each movement type (the library is pre-sorted by type)
  const [query, setQuery] = useState('');
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const searching = words.length > 0;
  const rows: { ex: string; muscle: string; header?: string }[] = searching
    ? Object.entries(EXERCISE_LIBRARY)
        .flatMap(([g, list]) => list.filter(e => words.every(w => e.toLowerCase().includes(w))).map(ex => ({ ex, muscle: g })))
        .slice(0, 120)
    : exercises.map((ex, i) => {
        const pattern = findExercise(ex)?.pattern;
        const prev = i > 0 ? findExercise(exercises[i - 1])?.pattern : undefined;
        return { ex, muscle: activeTab, header: pattern !== prev ? pattern : undefined };
      });

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

      {/* ── Search every exercise ── */}
      <View style={neuStyles.searchBox}>
        <Ionicons name="search" size={16} color={C.muted} />
        <TextInput
          style={neuStyles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Search all exercises"
          placeholderTextColor={C.muted}
          returnKeyType="search"
        />
        {searching && (
          <TouchableOpacity onPress={() => setQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close-circle" size={18} color={C.muted} />
          </TouchableOpacity>
        )}
      </View>

      {/* ── Exercise list for active tab ── */}
      <ScrollView style={neuStyles.exListScroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

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

        {/* Exercise rows — grouped by movement type, or search results across every group */}
        {searching && rows.length === 0 && (
          <Text style={neuStyles.noResults}>No exercises match "{query.trim()}"</Text>
        )}
        {rows.map(({ ex, muscle, header }, idx) => {
          const sel = isSelected(ex);
          const col = C.mg[muscle] || C.accent;
          return (
            <React.Fragment key={`${muscle}-${ex}`}>
              {header && <Text style={neuStyles.patternHeader}>{header}</Text>}
              <TouchableOpacity
                style={[
                  neuStyles.exOptRow,
                  sel && { backgroundColor: col + '18' },
                  idx === rows.length - 1 && { borderBottomWidth: 0 },
                ]}
                onPress={() => toggle(muscle, ex)}
                activeOpacity={0.7}
              >
                <View style={[neuStyles.exCheckbox, sel && { backgroundColor: col, borderColor: col }]}>
                  {sel && <Text style={neuStyles.exCheckmark}>✓</Text>}
                </View>
                <View style={[neuStyles.exDot, { backgroundColor: col }]} />
                <View style={{ flex: 1 }}>
                  <Text style={[neuStyles.exOptText, sel && { color: C.text, fontWeight: '700' }]}>{ex}</Text>
                  {searching && <Text style={neuStyles.exOptMeta}>{muscle} · {findExercise(ex)?.pattern}</Text>}
                </View>
                <ExerciseGuideButton name={ex} color={col} />
              </TouchableOpacity>
            </React.Fragment>
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
const REP_ITEMS = Array.from({ length: 100 }, (_, i) => String(i + 1));

/** The pop-up after "Felt strong" / "Too heavy": how many kg to go up or down next session. */
function WeightChange({ up, usedKg, options, onPick }: {
  up: boolean; usedKg: number; options: number[]; onPick: (kg: number) => void;
}) {
  const { C } = useTheme();
  const styles = makeStyles(C);
  const color = up ? C.green : C.red;
  const [sel, setSel] = useState<number>(options[0] ?? usedKg);
  const fmt = (n: number) => `${+n.toFixed(2)}`;
  return (
    <View>
      <View style={[styles.fbIcon, { backgroundColor: color + '1F' }]}>
        <Ionicons name={up ? 'thumbs-up' : 'thumbs-down'} size={28} color={color} />
      </View>
      <Text style={styles.fbText}>
        {up ? `You hit your sets at ${usedKg} kg. How many kilos can you go up next time?`
          : `No problem, that's part of training. How many kilos should you drop to keep good form?`}
      </Text>
      {options.length > 0 ? (
        <View style={styles.fbChips}>
          {options.map(kg => {
            const on = sel === kg;
            return (
              <TouchableOpacity key={kg} onPress={() => setSel(kg)} activeOpacity={0.85}
                style={[styles.fbChip, on && { backgroundColor: color, borderColor: color }]}>
                <Text style={[styles.fbChipDelta, { color: on ? '#FFFFFF' : color }]}>
                  {up ? '+' : '−'}{fmt(Math.abs(kg - usedKg))} kg
                </Text>
                <Text style={[styles.fbChipTo, on && { color: '#FFFFFFCC' }]}>→ {kg} kg</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : (
        <Text style={[styles.fbText, { marginBottom: 12 }]}>
          {up ? "You're already at the heaviest weight." : "You're already at the lightest weight."}
        </Text>
      )}
      {options.length > 0 && (
        <TouchableOpacity style={[styles.fbSave, { backgroundColor: color }]} onPress={() => onPick(sel)} activeOpacity={0.85}>
          <Text style={styles.fbSaveText}>{up ? 'Go up' : 'Go down'} to {sel} kg</Text>
        </TouchableOpacity>
      )}
      <TouchableOpacity style={styles.fbStay} onPress={() => onPick(usedKg)} activeOpacity={0.7}>
        <Text style={styles.fbStayText}>{up ? 'Stay' : 'Keep'} at {usedKg} kg</Text>
      </TouchableOpacity>
    </View>
  );
}

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
  const name = ex.exercise_name;
  // Bodyweight moves (push-ups, pull-ups, dips, band work...) are logged as reps only
  const [repsOnly] = useState(() => isRepsOnly(name));
  // The weights this exercise can actually be done with (dumbbell sizes, 5 kg machine steps...)
  const [steps] = useState(() => weightStepsFor(name));
  const [feedback, setFeedback] = useState(() => getLoadFeedback(name));
  // What the split builder set for this exercise today, shown as the goal. A 👍 / 👎 from an
  // earlier session moves the weight to the one picked then.
  const [target] = useState(() => {
    const t = targetFor(getSplitConfig(), ex.day_of_week, name);
    const fb = getLoadFeedback(name);
    return t && t.kg !== undefined && fb && fb.date < todayStr() ? withKg(t, fb.kg) : t;
  });
  // Sets go one at a time: the counter moves on by itself after each log
  const doneSets = loggedSets.reduce((n, s) => n + (s.sets || 1), 0);
  const goalSets = target?.sets;
  const [extraSet, setExtraSet] = useState(false);  // "One more set" after the goal is done
  const allDone = goalSets !== undefined && doneSets >= goalSets && !extraSet;
  // Start the reps at the bottom of the target range ('8–12' → 8); timed holds keep the default
  const [reps, setReps] = useState(() => Number(target?.reps.match(/^(\d+)(?:–\d+)?$/)?.[1] ?? 8));
  // The recommended weight is on the wheel, ready to log or scroll to change: the latest feedback,
  // else the plan, else what was logged last time
  const [kg, setKg] = useState(() =>
    closestOnLadder(getLoadFeedback(name)?.kg ?? target?.kg ?? getLastWeight(name) ?? 20, steps));
  const [vote, setVote] = useState<Vote | null>(null);  // the pop-up being shown

  const handleLog = () => {
    onLog(1, reps, repsOnly ? 0 : kg);
    setExtraSet(false);
  };

  // Feedback is about the heaviest weight used today
  const usedKg = loggedSets.reduce((m, s) => Math.max(m, s.weight), 0) || kg;
  const heavier = stepsAway(usedKg, steps, 1, 4);   // dumbbells +2.5, +5...; bars and machines +5, +10...
  const lighter = stepsAway(usedKg, steps, -1, 4);
  const votedToday = feedback && feedback.date === todayStr() ? feedback.vote : null;
  const choose = (v: Vote, nextKg: number) => {
    setFeedback(saveLoadFeedback(name, v, nextKg));
    setKg(nextKg);  // any sets still to do use it too
    setVote(null);
  };
  const muscleColor = C.mg[ex.muscle_group] || C.accent;
  // Goal stats: weight shows the number with what it means ('10 kg' · 'in each hand')
  const loadStat = !target ? null
    : target.kg === undefined ? { value: target.load ?? 'Bodyweight', label: 'no weights' }
    : target.load?.startsWith('+') ? { value: `+${target.kg} kg`, label: 'added weight' }
    : { value: `${target.kg} kg`, label: target.load?.endsWith(' each') ? 'in each hand' : 'weight' };

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
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <Text style={{ fontSize: 13, color: C.mg[ex.muscle_group], fontWeight: '700' }}>
            {ex.muscle_group.toUpperCase()}
          </Text>
          <ExerciseGuideButton name={ex.exercise_name} color={C.mg[ex.muscle_group] || C.accent} variant="pill" />
        </View>

        {target && loadStat && (
          <View style={styles.goalBox}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
              <Ionicons name="flag-outline" size={13} color={C.accent} />
              <Text style={styles.goalKicker}>TODAY'S GOAL</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={styles.goalStat}>
                <Text style={styles.goalValue}>{target.sets}</Text>
                <Text style={styles.goalLabel}>sets</Text>
              </View>
              <View style={styles.goalStat}>
                <Text style={styles.goalValue}>{target.reps}</Text>
                <Text style={styles.goalLabel}>{/\d s\b/.test(target.reps) ? 'hold each set' : 'reps per set'}</Text>
              </View>
              <View style={[styles.goalStat, { flex: 1.3 }]}>
                <Text style={styles.goalValue} numberOfLines={1} adjustsFontSizeToFit>{loadStat.value}</Text>
                <Text style={styles.goalLabel}>{loadStat.label}</Text>
              </View>
            </View>
            <Text style={styles.goalSentence}>{targetSentence(target)} Log each set below when you finish it.</Text>
          </View>
        )}

        {loggedSets.length > 0 && (
          <View style={{ marginBottom: 14 }}>
            {loggedSets.map((s, i) => (
              <View key={i} style={styles.doneRow}>
                <View style={[styles.doneTick, { backgroundColor: muscleColor + '22' }]}>
                  <Ionicons name="checkmark" size={13} color={muscleColor} />
                </View>
                <Text style={{ color: C.text, fontSize: 14 }}>
                  Set {i + 1}:  <Text style={{ fontWeight: '700' }}>{s.reps}</Text> reps
                  {!repsOnly && <> @ <Text style={{ fontWeight: '700' }}>{s.weight}</Text> kg</>}
                </Text>
              </View>
            ))}
          </View>
        )}

        {allDone ? (
          <View style={styles.allDone}>
            <Ionicons name="checkmark-circle" size={20} color={C.green} />
            <Text style={styles.allDoneText}>All {goalSets} sets done</Text>
          </View>
        ) : (
          <>
            {/* The set number is fixed; reps and weight are scroll wheels set to the recommendation */}
            <View style={styles.wheelCard}>
              <View style={styles.wheelCol}>
                <Text style={styles.setsLabel}>Set</Text>
                <View style={styles.setNow}>
                  <Text style={styles.setNowNum}>{doneSets + 1}</Text>
                  {goalSets !== undefined && doneSets < goalSets && <Text style={styles.setNowOf}>of {goalSets}</Text>}
                  {extraSet && <Text style={styles.setNowOf}>extra</Text>}
                </View>
              </View>
              <View style={styles.wheelCol}>
                <Text style={styles.setsLabel}>Reps</Text>
                <WheelPicker items={REP_ITEMS} width={56} index={reps - 1} onChange={i => setReps(i + 1)} />
              </View>
              {!repsOnly && (
                <View style={[styles.wheelCol, { flex: 1.3 }]}>
                  <Text style={styles.setsLabel}>Weight (kg)</Text>
                  <WheelPicker items={steps.map(String)} width={72} index={Math.max(0, steps.indexOf(kg))}
                    onChange={i => setKg(steps[i])} />
                </View>
              )}
            </View>
          </>
        )}

        <View style={{ marginTop: 14, flexDirection: 'row', gap: 10 }}>
          {!allDone && (
            <View style={{ flex: 1 }}>
              <Btn label={`Log set ${doneSets + 1}`} color={muscleColor} onPress={handleLog} small />
            </View>
          )}
          {/* Once the goal is met (or with no goal), another set can always be added */}
          {doneSets > 0 && !extraSet && (allDone || goalSets === undefined) && (
            <TouchableOpacity style={[styles.moreSetBtn, { borderColor: muscleColor }, allDone && { flex: 1 }]}
              onPress={() => setExtraSet(true)} activeOpacity={0.85}>
              <Ionicons name="add" size={16} color={muscleColor} />
              <Text style={[styles.moreSetText, { color: muscleColor }]}>One more set</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* How did it feel → the weight for next time */}
        {loggedSets.length > 0 && !repsOnly && (
          <View style={styles.rateCard}>
            <Text style={styles.rateLabel}>How did it feel?</Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {([
                { v: 'up' as Vote, icon: 'thumbs-up', label: 'Felt strong', color: C.green },
                { v: 'down' as Vote, icon: 'thumbs-down', label: 'Too heavy', color: C.red },
              ] as const).map(o => {
                const on = votedToday === o.v;
                return (
                  <TouchableOpacity key={o.v} activeOpacity={0.85} onPress={() => setVote(o.v)}
                    style={[styles.rateBtn, on ? { backgroundColor: o.color, borderColor: o.color } : { borderColor: o.color + '55' }]}>
                    <View style={[styles.rateIcon, { backgroundColor: on ? '#FFFFFF33' : o.color + '1F' }]}>
                      <Ionicons name={o.icon} size={16} color={on ? '#FFFFFF' : o.color} />
                    </View>
                    <Text style={[styles.rateBtnText, { color: on ? '#FFFFFF' : C.text }]}>{o.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {votedToday && feedback && (
              <Text style={styles.rateNote}>Next session starts at {feedback.kg} kg</Text>
            )}
          </View>
        )}
      </View>

      {/* Felt strong / too heavy → how much to change the weight */}
      <NeuModal visible={vote !== null} title={vote === 'up' ? 'Nice lift!' : 'Too heavy today?'} onClose={() => setVote(null)}>
        {vote && (
          <WeightChange
            up={vote === 'up'} usedKg={usedKg} options={vote === 'up' ? heavier : lighter}
            onPick={nextKg => choose(vote, nextKg)}
          />
        )}
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
  const [histDate, setHistDate] = useState<string | null>(null);  // History day; null = latest workout
  const [recentLogs, setRecentLogs] = useState<ExerciseLog[]>([]);  // last 4 weeks, for the Muscles tab
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
    setSessions(getWorkoutSessions(-1));  // all of them: the History calendar can reach any day
    setRecentLogs(getExerciseLogsSince(daysAgoStr(27)));
    
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
    setRecentLogs(getExerciseLogsSince(daysAgoStr(27)));
    setMuscles(getMuscleTracker());

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
            onPlanReplaced={load}
          />
        )}

        {tab === 'Muscles' && (() => {
          const insights = muscleInsights(recentLogs, muscles);
          const STATUS: Record<MuscleStatus, { label: string; color: string; icon: keyof typeof Ionicons.glyphMap }> = {
            ready:      { label: 'Ready',      color: C.green,  icon: 'flash' },
            recovering: { label: 'Recovering', color: C.orange, icon: 'battery-half' },
            overworked: { label: 'Rest it',    color: C.red,    icon: 'warning' },
            overdue:    { label: 'Overdue',    color: C.accent, icon: 'time' },
            new:        { label: 'Not trained', color: C.muted, icon: 'add-circle' },
          };
          const advice = (m: MuscleInsight) =>
            m.status === 'new' ? 'No sessions yet. Add it to your plan.'
            : m.status === 'overworked' ? `Hit ${m.hitsWeek}× this week. Take a rest day.`
            : m.status === 'recovering' ? (m.daysSince === 0 ? `Trained today. Rest ${m.readyIn} ${m.readyIn === 1 ? 'day' : 'days'}.` : `Still recovering. Ready in ${m.readyIn} ${m.readyIn === 1 ? 'day' : 'days'}.`)
            : m.status === 'overdue' ? `${m.daysSince} days since you trained it. Train it soon.`
            : `Recovered. Good to train today.`;
          // Today's call: what to train (most rested first) and what to leave alone
          const train = insights.filter(m => m.status === 'overdue' || m.status === 'ready')
            .sort((a, b) => (b.daysSince ?? 0) - (a.daysSince ?? 0));
          const rest = insights.filter(m => m.status === 'recovering' || m.status === 'overworked');
          const count = (s: MuscleStatus[]) => insights.filter(m => s.includes(m.status)).length;
          const weekLetters = Array.from({ length: 7 }, (_, i) => 'SMTWTFS'[new Date(daysAgoStr(6 - i) + 'T00:00:00').getDay()]);

          return (
            <>
              <SectionHeader title="Muscle Recovery" />

              {/* ── Today's call ── */}
              <View style={styles.mcHero}>
                <Text style={styles.mcKicker}>TODAY'S CALL</Text>
                <View style={styles.mcCounts}>
                  {([['ready', 'overdue'], ['recovering'], ['overworked']] as MuscleStatus[][]).map(s => (
                    <View key={s[0]} style={styles.mcCount}>
                      <Text style={[styles.mcCountNum, { color: STATUS[s[0]].color }]}>{count(s)}</Text>
                      <Text style={styles.mcCountLbl}>{s[0] === 'ready' ? 'ready' : s[0] === 'recovering' ? 'recovering' : 'need rest'}</Text>
                    </View>
                  ))}
                </View>
                <View style={styles.mcAdvice}>
                  <Ionicons name="flash" size={14} color={C.green} />
                  <Text style={styles.mcAdviceTxt}>
                    <Text style={{ fontWeight: '800', color: C.text }}>Train: </Text>
                    {train.length ? train.slice(0, 4).map(m => m.muscle).join(' · ') : 'Everything is recovering. Take a rest day.'}
                  </Text>
                </View>
                {rest.length > 0 && (
                  <View style={styles.mcAdvice}>
                    <Ionicons name="bed" size={14} color={C.orange} />
                    <Text style={styles.mcAdviceTxt}>
                      <Text style={{ fontWeight: '800', color: C.text }}>Rest: </Text>
                      {rest.map(m => m.muscle).join(' · ')}
                    </Text>
                  </View>
                )}
              </View>

              {/* ── Every main muscle group ── */}
              {insights.map(m => {
                const st = STATUS[m.status];
                const mc = C.mg[m.muscle] || C.accent;
                const R = 20, CIRC = 2 * Math.PI * R;
                return (
                  <View key={m.muscle} style={styles.mcCard}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                      {/* Recovery ring */}
                      <View style={{ width: 50, height: 50, alignItems: 'center', justifyContent: 'center' }}>
                        <Svg width={50} height={50} style={StyleSheet.absoluteFill}>
                          <Circle cx={25} cy={25} r={R} stroke={C.border} strokeWidth={4} fill="none" />
                          <Circle cx={25} cy={25} r={R} stroke={st.color} strokeWidth={4} fill="none"
                            strokeDasharray={`${CIRC * m.recovery} ${CIRC}`} strokeLinecap="round"
                            transform="rotate(-90 25 25)" />
                        </Svg>
                        <Text style={[styles.mcPct, { color: st.color }]}>{Math.round(m.recovery * 100)}%</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <View style={[styles.exDot, { backgroundColor: mc }]} />
                          <Text style={styles.muscleName}>{m.muscle}</Text>
                        </View>
                        <Text style={styles.mcAdviceSmall}>{advice(m)}</Text>
                      </View>
                      <View style={[styles.mcPill, { backgroundColor: st.color + '1F', borderColor: st.color + '55' }]}>
                        <Ionicons name={st.icon} size={11} color={st.color} />
                        <Text style={[styles.mcPillTxt, { color: st.color }]}>{st.label}</Text>
                      </View>
                    </View>

                    {/* Last 7 days + frequency */}
                    <View style={styles.mcFoot}>
                      <View style={styles.mcWeek}>
                        {m.week.map((hit, i) => (
                          <View key={i} style={{ alignItems: 'center', gap: 3 }}>
                            <View style={[styles.mcDay, hit && { backgroundColor: mc, borderColor: mc }]} />
                            <Text style={[styles.mcDayLbl, i === 6 && { color: C.text }]}>{weekLetters[i]}</Text>
                          </View>
                        ))}
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={styles.mcFreq}>{m.hitsWeek}×<Text style={styles.mcFreqUnit}> this week</Text></Text>
                        <Text style={styles.mcFreqSub}>{m.setsWeek} sets · {m.hitsMonth}× in 4 weeks</Text>
                      </View>
                    </View>
                  </View>
                );
              })}
              <Text style={styles.mcNote}>
                Recovery: legs and lower back need about 3 days, chest, back, shoulders and arms about 2, core and forearms 1. Training a muscle 2–3× a week is the sweet spot.
              </Text>
            </>
          );
        })()}

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
          const activeDate: string | null = histDate ?? sortedDates[0] ?? null;

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

              {sessions.length === 0 ? (
                <EmptyState icon="clipboard-outline" message="No workouts logged yet" sub="Go to Log tab to start tracking" />
              ) : (
                <>
                  {/* ── Anatomy card with the day picker ── */}
                  <Card accent={C.red}>
                    <View style={styles.section}>
                      {activeDate && (
                        <WorkoutCalendar selected={activeDate} workoutDates={sortedDates} color={C.red} onSelect={setHistDate} />
                      )}
                      <View style={{ height: 12 }} />
                      <BodyAnatomy muscleSetCounts={setCountsMap} />
                    </View>
                  </Card>

                  {/* ── That day's workout ── */}
                  {activeDate && (() => {
                    // Sets of the same exercise sit together, in the order they were done
                    const byEx: { name: string; muscle: string; sets: ExerciseLog[] }[] = [];
                    for (const ex of exsForActiveDate) {
                      const g = byEx.find(e => e.name === ex.exercise_name);
                      if (g) g.sets.push(ex); else byEx.push({ name: ex.exercise_name, muscle: ex.muscle_group, sets: [ex] });
                    }
                    const totalSets = exsForActiveDate.reduce((n, e) => n + (e.sets || 1), 0);
                    const volume = exsForActiveDate.reduce((n, e) => n + (e.sets || 1) * e.reps * e.weight, 0);
                    return (
                      <Card accent={C.accent}>
                        <View style={styles.section}>
                          <Text style={styles.histKicker}>YOUR WORKOUT</Text>
                          <Text style={styles.histTitle}>{longDate(activeDate)}</Text>
                          {byEx.length > 0 ? (
                            <>
                              <View style={styles.histStats}>
                                {/* Three equal boxes; big numbers shrink to fit rather than widen a box */}
                                {[
                                  { num: String(byEx.length), lbl: 'exercises' },
                                  { num: String(totalSets), lbl: 'sets' },
                                  { num: Math.round(volume).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ','), lbl: 'kg lifted' },
                                ].map(s => (
                                  <View key={s.lbl} style={styles.histStat}>
                                    <Text style={styles.histStatNum} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}>{s.num}</Text>
                                    <Text style={styles.histStatLbl} numberOfLines={1}>{s.lbl}</Text>
                                  </View>
                                ))}
                              </View>
                              {byEx.map(e => {
                                const mc = C.mg[e.muscle] || C.accent;
                                return (
                                  <View key={e.name} style={styles.histEx}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                      <View style={[styles.exDot, { backgroundColor: mc }]} />
                                      <Text style={[styles.exName, { flex: 1 }]} numberOfLines={1}>{e.name}</Text>
                                      <Text style={[styles.histMuscle, { color: mc }]}>{e.muscle}</Text>
                                    </View>
                                    <View style={styles.histSets}>
                                      {e.sets.map((s, i) => (
                                        <View key={s.id ?? i} style={styles.histSet}>
                                          <Text style={styles.histSetTxt}>
                                            {(s.sets || 1) > 1 ? `${s.sets}×` : ''}{s.reps}{s.weight > 0 ? ` × ${s.weight} kg` : ' reps'}
                                          </Text>
                                        </View>
                                      ))}
                                    </View>
                                  </View>
                                );
                              })}
                            </>
                          ) : (
                            <Text style={[styles.moreText, { marginTop: 10 }]}>
                              {dateGroups[activeDate] ? 'Session saved without exercise details.' : 'Rest day: nothing logged.'}
                            </Text>
                          )}
                        </View>
                      </Card>
                    );
                  })()}
                </>
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
      <Modal visible={!!prData} transparent animationType="fade" onRequestClose={() => setPrData(null)}>
        {prData && (() => {
          const reps = isRepsOnly(prData.exercise);
          const lift = (w: number, r: number) => (reps ? `${r} reps` : `${w} kg × ${r}`);
          const old = prData.oldPR;
          const gain = old ? prData.new1RM - old.one_rep_max : 0;
          return (
            <View style={styles.prOverlay}>
              <View style={styles.prCard}>
                <View style={styles.prBadge}>
                  <Ionicons name="trophy" size={30} color={C.yellow} />
                </View>
                <Text style={styles.prKicker}>NEW PERSONAL RECORD</Text>
                <Text style={styles.prExercise}>{prData.exercise}</Text>

                <View style={styles.prCompare}>
                  {old && (
                    <>
                      <View style={styles.prBox}>
                        <Text style={styles.prBoxLabel}>Before</Text>
                        <Text style={styles.prBoxOld}>{lift(old.weight, old.reps)}</Text>
                      </View>
                      <Ionicons name="arrow-forward" size={18} color={C.muted} />
                    </>
                  )}
                  <View style={[styles.prBox, styles.prBoxNewWrap]}>
                    <Text style={[styles.prBoxLabel, { color: C.green }]}>{old ? 'Now' : 'First record'}</Text>
                    <Text style={styles.prBoxNew}>{lift(prData.weight, prData.reps)}</Text>
                  </View>
                </View>

                {!reps && (
                  <View style={styles.prStat}>
                    <Text style={styles.prStatLabel}>Estimated 1-rep max</Text>
                    <Text style={styles.prStatValue}>{+prData.new1RM.toFixed(1)} kg</Text>
                    {gain > 0 && <Text style={styles.prGain}>+{+gain.toFixed(1)} kg</Text>}
                  </View>
                )}
                {reps && old && prData.reps > old.reps && (
                  <Text style={styles.prGain}>+{prData.reps - old.reps} reps on your best</Text>
                )}

                <TouchableOpacity style={styles.prBtn} onPress={() => setPrData(null)} activeOpacity={0.85}>
                  <Text style={styles.prBtnText}>Keep going</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })()}
      </Modal>
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
  onPlanReplaced,
}: {
  plans: WorkoutPlan[];
  planExercises: WorkoutPlanExercise[];
  dayOffsets?: React.MutableRefObject<Record<string, number>>;
  onSave: (d: string, n: string, m: string) => void;
  onAddExercise: (day: string, exercise: string, muscle: string) => void;
  onDeleteExercise: (id: number) => void;
  onPlanReplaced: () => void;
}) {
  const { C } = useTheme();
  const styles = makeStyles(C);
  const ps = makePlannerStyles(C);
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long' });
  const planMap = Object.fromEntries(plans.map(p => [p.day_of_week, p]));
  const [edits, setEdits] = useState<Record<string, { name: string; mgs: string[] }>>({});
  const [exerciseDay, setExerciseDay] = useState<string | null>(null);
  // Days fold up like the Log tab's muscle groups; today starts open
  const [expandedDays, setExpandedDays] = useState<Set<string>>(() => new Set([today]));
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardMode, setWizardMode] = useState<'setup' | 'next'>('setup');
  const [splitConfig, setSplitConfig] = useState(() => getSplitConfig());

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

  const toggleDay = (day: string) =>
    setExpandedDays(prev => {
      const next = new Set(prev);
      next.has(day) ? next.delete(day) : next.add(day);
      return next;
    });

  // Which muscle groups are selected for the current exercise day
  // Planner chips say 'Upper Back' / 'Lower Back'; the exercise library files both under 'Back'
  const toLibraryGroup = (mg: string) => (mg === 'Upper Back' || mg === 'Lower Back' ? 'Back' : mg);
  const exerciseMuscles = exerciseDay
    ? [...new Set(getEdit(exerciseDay).mgs.map(toLibraryGroup))].filter(mg => EXERCISE_LIBRARY[mg])
    : [];
  const musclesForPicker = exerciseMuscles.length ? exerciseMuscles : Object.keys(EXERCISE_LIBRARY);

  const renderDay = (day: string) => {
    const isToday = day === today;
    const edit = getEdit(day);
    const exercisesForDay = planExercises.filter(ex => ex.day_of_week === day);
    const expanded = expandedDays.has(day);
    const groups = edit.mgs.filter(mg => mg !== 'Rest');
    const isRest = edit.mgs.includes('Rest') || (!groups.length && !exercisesForDay.length);

    return (
      <View
        key={day}
        style={[ps.card, isToday && ps.cardToday]}
        onLayout={(e: LayoutChangeEvent) => {
          if (dayOffsets) dayOffsets.current[day] = e.nativeEvent.layout.y;
        }}
      >
        <TouchableOpacity style={ps.head} onPress={() => toggleDay(day)} activeOpacity={0.75}>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={[ps.day, isToday && { color: C.accent }]}>{day}</Text>
              {isToday && (
                <View style={styles.todayBadge}>
                  <Text style={styles.todayText}>TODAY</Text>
                </View>
              )}
            </View>
            <Text style={ps.sub} numberOfLines={1}>
              {isRest
                ? 'Rest day'
                : `${edit.name || 'Workout'} · ${exercisesForDay.length} exercise${exercisesForDay.length === 1 ? '' : 's'}`}
            </Text>
          </View>
          {!isRest && (
            <View style={ps.dots}>
              {groups.slice(0, 4).map(mg => (
                <View key={mg} style={[ps.dot, { backgroundColor: C.mg[mg] || C.accent }]} />
              ))}
            </View>
          )}
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={isToday ? C.accent : C.muted} />
        </TouchableOpacity>

        {expanded && (
          <View style={ps.body}>
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
                    style={[styles.mgPill, { borderColor: sel ? col : C.border, backgroundColor: sel ? col + '22' : C.bg }]}
                    onPress={() => togglePlanMG(day, mg)}
                  >
                    <Text style={[styles.mgPillText, { color: sel ? col : C.muted }]}>{mg}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {exercisesForDay.length > 0 && (
              <View style={styles.plannedList}>
                {Object.entries(
                  exercisesForDay.reduce((acc, ex) => {
                    if (!acc[ex.muscle_group]) acc[ex.muscle_group] = [];
                    acc[ex.muscle_group].push(ex);
                    return acc;
                  }, {} as Record<string, WorkoutPlanExercise[]>)
                ).map(([mg, exList]) => (
                  <View key={mg}>
                    <Text style={[styles.plannedMuscleHeader, { color: C.mg[mg] || C.accent }]}>{mg}</Text>
                    {exList.map(ex => {
                      // Sets × reps and starting weight the split builder picked for this exercise on this day
                      const target = targetFor(splitConfig, day, ex.exercise_name);
                      return (
                        <View key={ex.id} style={styles.plannedExerciseRow}>
                          <View style={[styles.exDot, { backgroundColor: C.mg[ex.muscle_group] || C.accent }]} />
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.exName, { flex: 0 }]}>{ex.exercise_name}</Text>
                            {target ? <Text style={ps.dose}>{targetText(target)}</Text> : null}
                          </View>
                          <ExerciseGuideButton name={ex.exercise_name} color={C.mg[ex.muscle_group] || C.accent} />
                          <TouchableOpacity onPress={() => onDeleteExercise(ex.id)} style={[styles.deletePlanExBtn, { marginLeft: 10 }]}>
                            <Text style={styles.deletePlanExText}>×</Text>
                          </TouchableOpacity>
                        </View>
                      );
                    })}
                  </View>
                ))}
              </View>
            )}

            <View style={styles.btnRow}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Btn label="+ Exercise" color={C.green} small onPress={() => setExerciseDay(day)} />
              </View>
              <Btn label="Save" color={C.accent} small onPress={() => onSave(day, edit.name, edit.mgs.join(','))} />
            </View>
          </View>
        )}
      </View>
    );
  };

  return (
    <>
      <SectionHeader title="Split" />
      <SplitCard
        config={splitConfig}
        plans={plans}
        onOpen={() => { setWizardMode('setup'); setWizardOpen(true); }}
        onNewBlock={() => { setWizardMode('next'); setWizardOpen(true); }}
      />

      <SectionHeader title="Today" />
      {renderDay(today)}

      <SectionHeader title="This Week" />
      {DAYS.filter(d => d !== today).map(renderDay)}

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

      <SplitWizard
        visible={wizardOpen}
        mode={wizardMode}
        onClose={() => setWizardOpen(false)}
        onApplied={() => {
          setSplitConfig(getSplitConfig());
          setEdits({});
          setExpandedDays(new Set([today]));
          onPlanReplaced();
        }}
      />
    </>
  );
}

function makePlannerStyles(C: any) {
  return StyleSheet.create({
    card:      { backgroundColor: C.card, borderRadius: 18, borderWidth: 1, borderColor: C.border, marginBottom: 10, overflow: 'hidden' },
    cardToday: { borderColor: C.accent, borderWidth: 1.5 },
    head:      { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 14 },
    day:       { fontSize: 16, fontWeight: '800', color: C.text },
    sub:       { fontSize: 12, fontWeight: '600', color: C.muted, marginTop: 2 },
    dots:      { flexDirection: 'row', gap: 4 },
    dot:       { width: 8, height: 8, borderRadius: 4 },
    body:      { paddingHorizontal: 16, paddingBottom: 16, borderTopWidth: 1, borderTopColor: C.border, paddingTop: 12 },
    dose:      { fontSize: 12, fontWeight: '700', color: C.accent, marginTop: 2 },
  });
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
  // Log tab: the split builder's goal for an exercise
  goalBox: {
    marginBottom: 14,
    padding: 12,
    borderRadius: 14,
    backgroundColor: C.accent + '12',
    borderWidth: 1,
    borderColor: C.accent + '40',
  },
  goalKicker: { fontSize: 11, fontWeight: '800', color: C.accent, letterSpacing: 0.6 },
  goalStat: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 10,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
  },
  goalValue: { fontSize: 17, fontWeight: '800', color: C.text },
  goalLabel: { fontSize: 10, fontWeight: '700', color: C.muted, marginTop: 2, textAlign: 'center' },
  goalSentence: { fontSize: 12, fontWeight: '600', color: C.textSub, marginTop: 10, lineHeight: 17 },
  wheelCard: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 10,
    backgroundColor: C.bg, borderRadius: 16, borderWidth: 1, borderColor: C.border,
  },
  wheelCol: { flex: 1, alignItems: 'center' },
  setNow: { height: 102, alignItems: 'center', justifyContent: 'center' },
  setNowNum: { fontSize: 30, fontWeight: '800', color: C.text },
  setNowOf: { fontSize: 11, fontWeight: '700', color: C.muted, marginTop: -2 },
  doneRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  doneTick: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  allDone: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14,
    backgroundColor: C.green + '14', borderRadius: 16, borderWidth: 1, borderColor: C.green + '44',
  },
  allDoneText: { fontSize: 15, fontWeight: '800', color: C.green },
  moreSetBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    paddingHorizontal: 14, borderRadius: 12, borderWidth: 1.5, minHeight: 40,
  },
  moreSetText: { fontSize: 14, fontWeight: '800' },
  rateCard: { marginTop: 14, padding: 12, backgroundColor: C.bg, borderRadius: 16, borderWidth: 1, borderColor: C.border },
  rateLabel: { fontSize: 11, fontWeight: '800', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 },
  rateBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 10, borderRadius: 14, borderWidth: 1.5, backgroundColor: C.card,
  },
  rateIcon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  rateBtnText: { fontSize: 14, fontWeight: '800' },
  rateNote: { fontSize: 12, fontWeight: '600', color: C.textSub, textAlign: 'center', marginTop: 10 },
  fbIcon: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 12 },
  fbText: { fontSize: 14, color: C.textSub, textAlign: 'center', lineHeight: 20, marginBottom: 16, paddingHorizontal: 8 },
  fbChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  fbChip: {
    flexGrow: 1, flexBasis: '45%', alignItems: 'center', paddingVertical: 12,
    backgroundColor: C.bg, borderRadius: 14, borderWidth: 1.5, borderColor: C.border,
  },
  fbChipDelta: { fontSize: 17, fontWeight: '800' },
  fbChipTo: { fontSize: 12, fontWeight: '600', color: C.muted, marginTop: 2 },
  fbSave: { borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  fbSaveText: { fontSize: 15, fontWeight: '800', color: '#FFFFFF' },
  fbStay: { paddingVertical: 14, alignItems: 'center' },
  fbStayText: { fontSize: 14, fontWeight: '700', color: C.muted },
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
  // History: the selected day's workout
  histKicker: { fontSize: 11, fontWeight: '800', color: C.accent, letterSpacing: 1 },
  histTitle: { fontSize: 18, fontWeight: '800', color: C.text, marginTop: 2 },
  histStats: { flexDirection: 'row', gap: 8, marginTop: 12, marginBottom: 6 },
  histStat: { flex: 1, flexBasis: 0, minWidth: 0, alignItems: 'center', paddingVertical: 10, paddingHorizontal: 6, backgroundColor: C.bg, borderRadius: 12, borderWidth: 1, borderColor: C.border },
  histStatNum: { fontSize: 18, fontWeight: '800', color: C.text },
  histStatLbl: { fontSize: 10, fontWeight: '700', color: C.muted, marginTop: 2, textTransform: 'uppercase' },
  histEx: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border },
  histMuscle: { fontSize: 11, fontWeight: '800' },
  histSets: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8, paddingLeft: 16 },
  histSet: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8, backgroundColor: C.bg, borderWidth: 1, borderColor: C.border },
  histSetTxt: { fontSize: 12, fontWeight: '700', color: C.textSub },
  // Muscles tab
  mcHero: {
    backgroundColor: C.card, borderRadius: 20, padding: 16, marginBottom: 14,
    borderWidth: 1, borderColor: C.accent + '55',
    shadowColor: C.accent, shadowOpacity: 0.25, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 4,
  },
  mcKicker: { fontSize: 11, fontWeight: '800', color: C.accent, letterSpacing: 1.2 },
  mcCounts: { flexDirection: 'row', gap: 8, marginTop: 12, marginBottom: 12 },
  mcCount: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 14, backgroundColor: C.bg, borderWidth: 1, borderColor: C.border },
  mcCountNum: { fontSize: 24, fontWeight: '900' },
  mcCountLbl: { fontSize: 10, fontWeight: '700', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 },
  mcAdvice: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 6 },
  mcAdviceTxt: { flex: 1, fontSize: 13, color: C.textSub, lineHeight: 18 },
  mcCard: { backgroundColor: C.card, borderRadius: 18, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: C.border },
  mcPct: { fontSize: 11, fontWeight: '800' },
  mcAdviceSmall: { fontSize: 12, color: C.muted, marginTop: 3, lineHeight: 16 },
  mcPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10, borderWidth: 1 },
  mcPillTxt: { fontSize: 11, fontWeight: '800' },
  mcFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.border },
  mcWeek: { flexDirection: 'row', gap: 6 },
  mcDay: { width: 14, height: 14, borderRadius: 4, backgroundColor: C.bg, borderWidth: 1, borderColor: C.border },
  mcDayLbl: { fontSize: 9, fontWeight: '700', color: C.muted },
  mcFreq: { fontSize: 16, fontWeight: '900', color: C.text },
  mcFreqUnit: { fontSize: 11, fontWeight: '700', color: C.muted },
  mcFreqSub: { fontSize: 10, fontWeight: '600', color: C.muted, marginTop: 1 },
  mcNote: { fontSize: 11, color: C.muted, lineHeight: 16, marginTop: 4, marginBottom: 12, paddingHorizontal: 4 },
  prOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15,20,30,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  prCard: {
    backgroundColor: C.card,
    borderRadius: 24,
    paddingHorizontal: 22,
    paddingTop: 26,
    paddingBottom: 20,
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.border,
    elevation: 16,
  },
  prBadge: {
    width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.yellow + '22', borderWidth: 2, borderColor: C.yellow + '55', marginBottom: 12,
  },
  prKicker: { fontSize: 11, fontWeight: '800', color: C.yellow, letterSpacing: 1.2 },
  prExercise: { fontSize: 19, fontWeight: '800', color: C.text, textAlign: 'center', marginTop: 4, marginBottom: 18 },
  prCompare: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'stretch', justifyContent: 'center' },
  prBox: {
    flex: 1, alignItems: 'center', paddingVertical: 12, paddingHorizontal: 6,
    backgroundColor: C.bg, borderRadius: 14, borderWidth: 1, borderColor: C.border,
  },
  prBoxNewWrap: { backgroundColor: C.green + '14', borderColor: C.green + '55' },
  prBoxLabel: { fontSize: 10, fontWeight: '800', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4 },
  prBoxOld: { fontSize: 15, fontWeight: '700', color: C.textSub },
  prBoxNew: { fontSize: 17, fontWeight: '800', color: C.green },
  prStat: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 },
  prStatLabel: { fontSize: 13, color: C.muted, fontWeight: '600' },
  prStatValue: { fontSize: 15, color: C.text, fontWeight: '800' },
  prGain: { fontSize: 12, fontWeight: '800', color: C.green, marginTop: 2 },
  prBtn: { alignSelf: 'stretch', marginTop: 20, paddingVertical: 14, borderRadius: 14, backgroundColor: C.accent, alignItems: 'center' },
  prBtnText: { fontSize: 15, fontWeight: '800', color: '#FFFFFF' },
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
  exOptMeta: { fontSize: 11, color: C.muted, fontWeight: '600', marginTop: 1 },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.bg, borderRadius: 12,
    paddingHorizontal: 12, borderWidth: 1, borderColor: C.border, marginBottom: 8,
  },
  searchInput: { flex: 1, paddingVertical: 9, fontSize: 14, color: C.text, fontWeight: '600' },
  patternHeader: {
    fontSize: 11, fontWeight: '800', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.6,
    marginTop: 12, marginBottom: 2, paddingHorizontal: 4,
  },
  noResults: { fontSize: 13, color: C.muted, fontWeight: '600', textAlign: 'center', paddingVertical: 20 },
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