// app/index.tsx — Home Dashboard with Interactive Drag-and-Drop Widgets
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Modal,
  Image,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, G } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import {
  getTodayLog,
  getGoals,
  updateGoals,
  getStreak,
  getLatestWeight,
  logWeight,
  getTodaysPlan,
  getWeeklyStats,
  getSetting,
  setSetting,
  getWorkoutPlanExercises,
  getExercisesForDate,
  getWorkoutDates,
  toDateStr,
  todayStr,
  DailyLog,
  Goals,
  Streak,
  WorkoutPlan,
} from '../db/database';
import { Card, ProgressBar, MuscleTag, SectionHeader } from '../components/ui';
import { SettingsButton } from '../components/SettingsButton';
import { HeaderIconButton } from '../components/HeaderIconButton';
import { HomeOverview, OverviewData } from '../components/HomeOverview';
import { BatteryMeter } from '../components/BatteryMeter';
import { DumbbellIcon } from '../components/DumbbellIcon';
import { BookIcon } from '../components/BookIcon';
import { SplitBuildIcon } from '../components/SplitBuildIcon';
import { useTheme } from '../contexts/ThemeContext';
import { logError } from '../utils/logError';
import { useCustomAlert } from '../contexts/AlertContext';
import { RemindersWidget, RemindersSheet } from '../components/Reminders';
import { ExerciseLibrary } from '../components/ExerciseLibrary';
import { ExerciseGuideModal } from '../components/ExerciseGuide';
import { getSplitConfig, targetFor } from '../components/SplitWizard';
import { DragBoard, DragBoardHandle, WidgetLabel } from '../components/DragWidget';
import { EXERCISE_CATALOG, findExercise } from '../constants/exerciseCatalog';
import { turnOnReminders, notificationsAvailable, remindersEnabled, REMINDERS_UNAVAILABLE_MSG } from '../utils/reminders';
import { currentPicks, subscribePicks } from '../utils/libraryPicks';

export type HomeSectionKey = 'workout' | 'overview' | 'week_habits' | 'reminders' | 'library';

// Order on a fresh install (and after Reset); a saved order wins
const DEFAULT_SECTIONS: HomeSectionKey[] = [
  'workout',
  'overview',
  'library',
  'week_habits',
  'reminders',
];

// Names and icons for the Customize sheet and the tags shown while a widget is being moved
const WIDGET_INFO: Record<HomeSectionKey, { title: string; icon: string }> = {
  workout:     { title: "Today's Workout", icon: 'barbell-outline' },
  overview:    { title: 'Overview', icon: 'grid-outline' },
  week_habits: { title: "Today's Habits", icon: 'battery-charging-outline' },
  reminders:   { title: 'Reminders', icon: 'notifications-outline' },
  library:     { title: 'Exercise Library', icon: 'book-outline' },
};

/** Monday → Sunday: whether a workout was logged on each day of this week. */
function weekTrained(): { days: boolean[]; todayIndex: number } {
  const now = new Date();
  const todayIndex = (now.getDay() + 6) % 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() - todayIndex);
  const trained = new Set(getWorkoutDates());
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return trained.has(toDateStr(d));
  });
  return { days, todayIndex };
}

/**
 * Today's planned exercises and how many are finished: every target set logged (one set
 * when the exercise has no split target).
 */
function todaysWorkoutProgress(): { done: number; total: number } {
  const day = new Date().toLocaleDateString('en-US', { weekday: 'long' });
  const planned = getWorkoutPlanExercises(day);
  const logged = getExercisesForDate(todayStr());
  const cfg = getSplitConfig();
  const setsOf = (name: string) =>
    logged.filter(l => l.exercise_name === name).reduce((n, l) => n + (l.sets || 1), 0);
  const names = [...new Set(planned.map(p => p.exercise_name))];
  const done = names.filter(n => setsOf(n) >= (targetFor(cfg, day, n)?.sets ?? 1)).length;
  return { done, total: names.length };
}

export default function DashboardScreen() {
  const { showAlert } = useCustomAlert();
  const router = useRouter();

  const { C, isDark } = useTheme();
  const [log, setLog] = useState<DailyLog | null>(null);
  const [goals, setGoals] = useState<Goals | null>(null);
  const [streak, setStreak] = useState<Streak | null>(null);
  const [weight, setWeight] = useState<number | null>(null);
  const [plan, setPlan] = useState<WorkoutPlan | null>(null);
  const [weekly, setWeekly] = useState<any>(null);
  const [week, setWeek] = useState<{ days: boolean[]; todayIndex: number }>({ days: [], todayIndex: 0 });
  const [hasPlan, setHasPlan] = useState(true);

  // Body weight popup
  const [weightPopup, setWeightPopup] = useState(false);
  const [weightInput, setWeightInput] = useState('');

  // Quick Goals edit modal
  const [goalModal, setGoalModal] = useState(false);
  const [waterGoalInput, setWaterGoalInput] = useState('');
  const [proteinGoalInput, setProteinGoalInput] = useState('');
  const [calorieGoalInput, setCalorieGoalInput] = useState('');

  // Edit / configure modal
  const [editModal, setEditModal] = useState(false);

  // Reminders editor
  const [remindersOpen, setRemindersOpen] = useState(false);
  const [remindersKey, setRemindersKey] = useState(0);
  const remindersOn = useMemo(() => remindersEnabled(), [remindersKey]);
  const [flashReminders, setFlashReminders] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [workoutProgress, setWorkoutProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
  const [guideFor, setGuideFor] = useState<string | null>(null);
  // Three new library picks every time the app is opened
  const [pickNames, setPickNames] = useState(currentPicks);
  useEffect(() => subscribePicks(setPickNames), []);
  const picks = useMemo(
    () => pickNames.map(n => findExercise(n)).filter((e): e is NonNullable<typeof e> => !!e),
    [pickNames]
  );
  const boardRef = useRef<DragBoardHandle>(null);

  // Draggable section order
  const [sections, setSections] = useState<HomeSectionKey[]>(() => {
    try {
      const saved = getSetting('home_sections_order', '');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const valid = parsed.filter((k: any) => DEFAULT_SECTIONS.includes(k));
          const missing = DEFAULT_SECTIONS.filter(k => !valid.includes(k));
          return [...valid, ...missing];
        }
      }
    } catch (e) { logError('homeLayout', e); }
    return DEFAULT_SECTIONS;
  });

  const load = useCallback(() => {
    setWorkoutProgress(todaysWorkoutProgress());
    setLog(getTodayLog());
    setGoals(getGoals());
    setStreak(getStreak());
    setWeight(getLatestWeight());
    setPlan(getTodaysPlan());
    setWeekly(getWeeklyStats());
    setWeek(weekTrained());
    // A plan exists once a split was built or any exercise was put in the planner
    setHasPlan(!!getSplitConfig() || getWorkoutPlanExercises().length > 0);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      setRemindersKey(k => k + 1); // permission or reminders may have changed elsewhere
    }, [load])
  );

  const onRefresh = useCallback(() => {
    load();
    setRemindersKey(k => k + 1);
  }, [load]);

  const handleDragEnd = useCallback((data: HomeSectionKey[]) => {
    if (!data || !Array.isArray(data) || data.length === 0) return;
    const valid = Array.from(new Set(data.filter(k => DEFAULT_SECTIONS.includes(k))));
    const missing = DEFAULT_SECTIONS.filter(k => !valid.includes(k));
    const finalData = [...valid, ...missing];
    setSections(finalData);
    try {
      setSetting('home_sections_order', JSON.stringify(finalData));
    } catch (e) { logError('homeLayout', e); }
  }, []);

  const handleResetLayout = () => {
    setSections(DEFAULT_SECTIONS);
    try {
      setSetting('home_sections_order', JSON.stringify(DEFAULT_SECTIONS));
    } catch (e) { logError('homeLayout', e); }
    showAlert('Reset ✓', 'Home widgets layout restored to default.');
  };

  const moveWidget = (fromIdx: number, dir: -1 | 1) => {
    const toIdx = fromIdx + dir;
    if (toIdx < 0 || toIdx >= sections.length) return;
    const next = [...sections];
    [next[fromIdx], next[toIdx]] = [next[toIdx], next[fromIdx]];
    setSections(next);
    try { setSetting('home_sections_order', JSON.stringify(next)); } catch (e) { logError('homeLayout', e); }
  };

  const openGoalsModal = () => {
    if (goals) {
      setWaterGoalInput(String(goals.water_goal || 3.0));
      setProteinGoalInput(String(goals.protein_goal || 120));
      setCalorieGoalInput(String(goals.calorie_goal || 2800));
    }
    setGoalModal(true);
  };

  // Goals save as they're changed (a half-typed or empty box keeps the last good value)
  const setGoalInput = (key: 'water_goal' | 'protein_goal' | 'calorie_goal', text: string) => {
    ({ water_goal: setWaterGoalInput, protein_goal: setProteinGoalInput, calorie_goal: setCalorieGoalInput })[key](text);
    const n = key === 'calorie_goal' ? parseInt(text, 10) : parseFloat(text);
    const min = { water_goal: 0.5, protein_goal: 20, calorie_goal: 500 }[key];
    if (!isNaN(n)) updateGoals({ [key]: Math.max(min, n) });
  };
  const closeGoalsModal = () => {
    setGoalModal(false);
    load();
  };

  const handleEditFromModal = (key: HomeSectionKey) => {
    setEditModal(false);
    setTimeout(() => {
      switch (key) {
        case 'workout':
          router.push({ pathname: '/workouts', params: { openTab: 'Planner' } } as any);
          break;
        case 'overview':
          router.push('/overall' as any);
          break;
        case 'week_habits':
          // The habits' batteries fill against these goals
          openGoalsModal();
          break;
        case 'reminders':
          setRemindersOpen(true);
          break;
        case 'library':
          setLibraryOpen(true);
          break;
      }
    }, 180);
  };

  const styles = makeStyles(C, isDark);

  if (!log || !goals) return null;

  const waterPct = goals.water_goal > 0 ? Math.min((log.water_intake || 0) / goals.water_goal, 1) : 0;
  const proteinPct = goals.protein_goal > 0 ? Math.min((log.protein_intake || 0) / goals.protein_goal, 1) : 0;
  const calPct = goals.calorie_goal > 0 ? Math.min((log.calorie_intake || 0) / goals.calorie_goal, 1) : 0;

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

  // Done = every exercise planned for today finished; with nothing planned, any logged workout
  const workoutDone = workoutProgress.total > 0
    ? workoutProgress.done === workoutProgress.total
    : !!log.workout_completed;
  const workoutStatus = workoutDone ? '✓ Done'
    : workoutProgress.done > 0 ? `${workoutProgress.done}/${workoutProgress.total} done`
    : 'Tap to Log';

  // Each habit's battery, in its own colour: water and protein against their goals, the workout by
  // exercises finished (shown as just done/total, e.g. 1/3)
  const habits = [
    {
      icon: 'barbell',
      label: 'Workout',
      color: C.purple,
      done: workoutDone,
      pct: workoutProgress.total > 0 ? workoutProgress.done / workoutProgress.total : workoutDone ? 1 : 0,
      detail: workoutProgress.total > 0 ? `${workoutProgress.done}/${workoutProgress.total}`
        : workoutDone ? 'Done' : plan?.muscle_groups === 'Rest' ? 'Rest day' : 'Not planned',
      onPress: () => router.push({ pathname: '/workouts', params: { openTab: 'Log' } } as any),
    },
    {
      icon: 'water',
      label: 'Water',
      color: C.water,
      done: !!log.water_goal_reached,
      pct: waterPct,
      detail: `${(log.water_intake || 0).toFixed(1).replace(/\.0$/, '')}/${goals.water_goal || 0} L`,
      onPress: () => router.push({ pathname: '/tracker', params: { openSection: 'water', t: String(Date.now()) } } as any),
    },
    {
      icon: 'restaurant',
      label: 'Protein',
      color: C.protein,
      done: !!log.protein_goal_reached,
      pct: proteinPct,
      detail: `${Math.round(log.protein_intake || 0)}/${goals.protein_goal || 0} g`,
      onPress: () => router.push({ pathname: '/tracker', params: { openSection: 'nutrition', t: String(Date.now()) } } as any),
    },
  ];
  const habitsDone = habits.filter(h => h.done).length;

  // ─────────────────────────────────────────────────────────────────────────
  // Section Renderers (100% of Original Content & Functionality Preserved)
  // ─────────────────────────────────────────────────────────────────────────
  const renderWorkoutSection = (isActive: boolean) => (
    <View style={styles.sectionWrap}>
      <View style={styles.sectionHeaderRow}>
        <SectionHeader title="Today's Workout" />
        <View style={styles.dragGripBox}>
          <Ionicons name="reorder-two" size={18} color={isActive ? C.purple : C.muted + '77'} />
        </View>
      </View>
      {!hasPlan ? (
        // Nothing planned yet: no made-up workout, just the way to build one
        <TouchableOpacity activeOpacity={0.85}
          onPress={() => router.push({ pathname: '/workouts', params: { openTab: 'Planner', openSplit: String(Date.now()) } } as any)}>
          <Card accent={C.purple} style={isActive ? styles.activeCardGlow : undefined}>
            <View style={styles.workoutCardInner}>
              <View style={styles.workoutTopRow}>
                <View style={styles.workoutIconWrap}>
                  <SplitBuildIcon size={24} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.workoutName}>Start working out</Text>
                  <Text style={{ fontSize: 12, color: C.muted, marginTop: 2, fontWeight: '600' }}>
                    Tap to build your split: a plan made for you in a few questions
                  </Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: C.purple }]}>
                  <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>Build</Text>
                </View>
              </View>
            </View>
          </Card>
        </TouchableOpacity>
      ) : plan ? (
        <Card accent={C.purple} style={isActive ? styles.activeCardGlow : undefined}>
          <View style={styles.workoutCardInner}>
            <View style={styles.workoutTopRow}>
              <View style={styles.workoutIconWrap}>
                <DumbbellIcon size={26} color={C.purple} />
              </View>
              <TouchableOpacity
                style={{ flex: 1 }}
                activeOpacity={0.8}
                onPress={() => router.push({ pathname: '/workouts', params: { openTab: 'Log' } } as any)}
              >
                <Text style={styles.workoutName} numberOfLines={1}>{plan.plan_name || 'Workout'}</Text>
                {plan.muscle_groups !== 'Rest' && !workoutDone && (
                  <View style={styles.pendingRow}>
                    <View style={[styles.pendingDot, { backgroundColor: C.orange }]} />
                    <Text style={[styles.pendingTxt, { color: C.orange }]}>
                      Workout pending{workoutProgress.done > 0 ? ` · ${workoutProgress.total - workoutProgress.done} exercises left` : ''}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
              <View style={styles.workoutActions}>
                <TouchableOpacity
                  onPress={(e) => {
                    e.stopPropagation();
                    const dayName = new Date().toLocaleDateString('en-US', { weekday: 'long' });
                    router.push({ pathname: '/workouts', params: { openTab: 'Planner', scrollToDay: dayName } } as any);
                  }}
                  style={styles.editPlanBtn}
                  activeOpacity={0.75}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="create-outline" size={16} color={C.purple} />
                </TouchableOpacity>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => router.push({ pathname: '/workouts', params: { openTab: 'Log' } } as any)}
                  style={[
                    styles.statusBadge,
                    { backgroundColor: workoutDone ? C.greenDim : C.accentDim },
                  ]}
                >
                  <Text
                    style={{
                      color: workoutDone ? C.green : C.muted,
                      fontWeight: '700',
                      fontSize: 11,
                    }}
                  >
                    {workoutStatus}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {(() => {
              const mgs = (plan.muscle_groups || '')
                .split(',')
                .map(g => g.trim())
                .filter(Boolean);
              if (mgs.length === 0) return null;
              return (
                <View style={styles.mgRow}>
                  {mgs.map(g => (
                    <MuscleTag key={g} name={g} />
                  ))}
                </View>
              );
            })()}
          </View>
        </Card>
      ) : (
        <TouchableOpacity
          activeOpacity={0.82}
          onPress={() => router.push({ pathname: '/workouts', params: { openTab: 'Planner' } } as any)}
        >
          <Card accent={C.purple} style={isActive ? styles.activeCardGlow : undefined}>
            <View style={styles.workoutCardInner}>
              <View style={styles.workoutTopRow}>
                <View style={styles.workoutIconWrap}>
                  <Ionicons name="calendar-outline" size={22} color={C.purple} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.workoutName}>Nothing planned today</Text>
                  <Text style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>Tap to plan today's workout</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={C.purple} />
              </View>
            </View>
          </Card>
        </TouchableOpacity>
      )}
    </View>
  );

  const overview: OverviewData = {
    streak: streak?.current_streak ?? 0,
    bestStreak: streak?.longest_streak ?? 0,
    weekTrained: week.days,
    todayIndex: week.todayIndex,
  };

  const renderOverviewSection = (isActive: boolean) => (
    <View style={styles.sectionWrap}>
      <View style={styles.sectionHeaderRow}>
        <SectionHeader title="Overview" />
        <View style={styles.dragGripBox}>
          <Ionicons name="reorder-two" size={18} color={isActive ? C.accent : C.muted + '77'} />
        </View>
      </View>
      <HomeOverview data={overview} />
    </View>
  );

  const renderWeekHabitsSection = (isActive: boolean) => (
    <View style={styles.sectionWrap}>
      <View style={styles.sectionHeaderRow}>
        <SectionHeader title="Today's Habits" />
        <View style={styles.dragGripBox}>
          <Ionicons name="reorder-two" size={18} color={isActive ? C.water : C.muted + '77'} />
        </View>
      </View>
      <Card style={isActive ? styles.activeCardGlow : undefined}>
        <View style={{ padding: 14 }}>
          {/* Today: each habit with a battery in its own colour that charges as you get there */}
          <View style={styles.habitHead}>
            <Text style={[styles.intakeLbl, { color: C.muted }]}>TODAY</Text>
            <Text style={[styles.habitCount, { color: habitsDone === habits.length ? C.accent : C.textSub }]}>
              {habitsDone} of {habits.length} done
            </Text>
          </View>
          {habits.map((h, i) => (
            <TouchableOpacity key={h.label} activeOpacity={0.8} onPress={h.onPress}
              style={[styles.habitRow, i > 0 && { borderTopWidth: 1, borderTopColor: C.border }]}>
              <View style={[styles.habitRowIcon, { backgroundColor: h.color + '1F' }]}>
                <Ionicons name={(h.done ? 'checkmark' : h.icon) as any} size={17} color={h.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.habitRowLbl, { color: C.text }]}>{h.label}</Text>
                <Text style={[styles.habitRowSub, { color: h.done ? h.color : C.textSub }]} numberOfLines={1}>{h.detail}</Text>
              </View>
              <Text style={[styles.habitPct, { color: h.done ? h.color : C.textSub }]}>{Math.round(Math.min(1, h.pct) * 100)}%</Text>
              <BatteryMeter pct={h.pct} color={h.color} />
            </TouchableOpacity>
          ))}
        </View>
      </Card>
    </View>
  );

  /** Header bell: bring the Reminders widget into view and briefly highlight it. */
  const scrollToReminders = () => {
    boardRef.current?.scrollToKey('reminders', 0.1);
    setFlashReminders(true);
    setTimeout(() => setFlashReminders(false), 1400);
  };

  const handleTurnOnReminders = async () => {
    if (!notificationsAvailable) { showAlert('Not available here', REMINDERS_UNAVAILABLE_MSG); return; }
    const ok = await turnOnReminders();
    if (!ok) showAlert('Notifications are off', 'Allow notifications for GainQuest in your phone settings to get reminders.');
    setRemindersKey(k => k + 1);
  };

  const renderRemindersSection = (isActive: boolean) => (
    <View style={styles.sectionWrap}>
      <View style={styles.sectionHeaderRow}>
        <SectionHeader title="Reminders" />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <TouchableOpacity onPress={() => setRemindersOpen(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={styles.reminderEditBtn} activeOpacity={0.8}>
            <Ionicons name="options-outline" size={15} color={C.accent} />
            <Text style={styles.reminderEditTxt}>Edit</Text>
          </TouchableOpacity>
          <View style={styles.dragGripBox}>
            <Ionicons name="reorder-two" size={18} color={isActive ? C.orange : C.muted + '77'} />
          </View>
        </View>
      </View>
      <View style={[styles.reminderFlashWrap, flashReminders && { borderColor: C.accent }]}>
        <RemindersWidget log={log} goals={goals} refreshKey={remindersKey}
          onEdit={() => setRemindersOpen(true)} onTurnOn={handleTurnOnReminders} />
      </View>
    </View>
  );

  const renderLibrarySection = (isActive: boolean) => (
    <View style={styles.sectionWrap}>
      <View style={styles.sectionHeaderRow}>
        <SectionHeader title="Exercise Library" />
        <View style={styles.dragGripBox}>
          <Ionicons name="reorder-two" size={18} color={isActive ? C.accent : C.muted + '77'} />
        </View>
      </View>
      <Card accent={C.accent}>
        <View style={{ padding: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={[styles.libIcon, { backgroundColor: C.accent + '1F' }]}>
              <BookIcon size={26} color={C.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.libTitle, { color: C.text }]}>{EXERCISE_CATALOG.length} exercises with guides</Text>
              <Text style={[styles.libSub, { color: C.muted }]}>Photos, step-by-step form and the muscles each one works.</Text>
            </View>
          </View>

          <Text style={[styles.libKicker, { color: C.muted }]}>NEW PICKS EVERY TIME YOU OPEN · TAP FOR THE GUIDE</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {picks.map(ex => {
              const mc = C.mg[ex.group] || C.accent;
              return (
                <TouchableOpacity key={ex.name} style={[styles.libPick, { backgroundColor: C.bg, borderColor: C.border }]}
                  onPress={() => setGuideFor(ex.name)} activeOpacity={0.8}>
                  {ex.images[0] ? (
                    <Image source={ex.images[0]} style={styles.libThumb} resizeMode="cover" />
                  ) : (
                    <View style={[styles.libThumb, { alignItems: 'center', justifyContent: 'center', backgroundColor: mc + '22' }]}>
                      <Ionicons name="barbell-outline" size={22} color={mc} />
                    </View>
                  )}
                  <View style={{ padding: 7 }}>
                    <Text style={[styles.libPickName, { color: C.text }]} numberOfLines={2}>{ex.name}</Text>
                    <Text style={[styles.libPickGroup, { color: mc }]}>{ex.group}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity style={[styles.libBtn, { backgroundColor: C.accent }]} onPress={() => setLibraryOpen(true)} activeOpacity={0.85}>
            <Ionicons name="search" size={15} color="#fff" />
            <Text style={styles.libBtnTxt}>Browse the library</Text>
          </TouchableOpacity>
        </View>
      </Card>
    </View>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // Widgets on the board
  // ─────────────────────────────────────────────────────────────────────────
  const renderItem = (item: HomeSectionKey, isActive: boolean) => {
    switch (item) {
      case 'workout': return renderWorkoutSection(isActive);
      case 'overview': return renderOverviewSection(isActive);
      case 'week_habits': return renderWeekHabitsSection(isActive);
      case 'reminders': return renderRemindersSection(isActive);
      case 'library': return renderLibrarySection(isActive);
    }
  };

  const widgetColor: Record<HomeSectionKey, string> = {
    workout: C.purple, overview: '#FF6B35', week_habits: C.water, reminders: C.orange, library: C.accent,
  };
  const labelFor = (k: HomeSectionKey): WidgetLabel => ({ ...WIDGET_INFO[k], color: widgetColor[k] });

  return (
    <SafeAreaView style={styles.safe}>
      {/* ── Header ── */}
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

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {/* Reminders bell — rings when tapped; full colour when notifications are on, toned down when off */}
          <HeaderIconButton
            icon={remindersOn ? 'notifications' : 'notifications-outline'}
            motion="ring"
            label="Reminders"
            color={remindersOn ? C.accent : C.muted}
            style={!remindersOn && { opacity: 0.45 }}
            onPress={scrollToReminders}
          />

          {/* Analytics (no longer a tab) — its bars grow when tapped */}
          <HeaderIconButton
            icon="stats-chart-outline"
            motion="bars"
            label="Analytics"
            onPress={() => router.navigate({ pathname: '/analytics', params: { from: '/' } } as any)}
          />

          <SettingsButton />
        </View>
      </View>

      {/* ── Widgets: hold one to move it ── */}
      <DragBoard
        ref={boardRef}
        data={sections}
        onReorder={handleDragEnd}
        renderItem={renderItem}
        labelFor={labelFor}
        onRefresh={onRefresh}
        footer={
          <TouchableOpacity style={[styles.customizeBtn, { borderColor: C.border }]} onPress={() => setEditModal(true)} activeOpacity={0.75}>
            <Ionicons name="apps-outline" size={16} color={C.accent} />
            <Text style={[styles.customizeTxt, { color: C.accent }]}>Customize widgets</Text>
          </TouchableOpacity>
        }
      />
      {guideFor && <ExerciseGuideModal name={guideFor} color={C.accent} onClose={() => setGuideFor(null)} />}

      {/* ── Body Weight Popup ── */}
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

      {/* ── Edit / Configure Widgets Modal ── */}
      <Modal visible={editModal} transparent animationType="slide" onRequestClose={() => setEditModal(false)}>
        <TouchableOpacity style={styles.glassOverlay} activeOpacity={1} onPress={() => setEditModal(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.glassSheet} onPress={e => e.stopPropagation()}>
            {/* Frost top strip */}
            <View style={styles.glassHandle} />

            {/* Header */}
            <View style={styles.glassModalHeader}>
              <View style={[styles.glassIconCircle, { backgroundColor: C.accent + '22' }]}>
                <Ionicons name="apps-outline" size={22} color={C.accent} />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[styles.glassModalTitle, { color: C.text }]}>Widget Layout</Text>
                <Text style={[styles.glassModalSub, { color: C.muted }]}>Long-press any widget to drag & reorder</Text>
              </View>
              <TouchableOpacity
                style={[styles.glassCloseBtn, { backgroundColor: C.border + '80' }]}
                onPress={() => setEditModal(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={16} color={C.text} />
              </TouchableOpacity>
            </View>

            {/* Tip row */}
            <View style={[styles.glassTipRow, { backgroundColor: C.accent + '12', borderColor: C.accent + '30' }]}>
              <Ionicons name="information-circle-outline" size={16} color={C.accent} style={{ marginRight: 8 }} />
              <Text style={[styles.glassTipTxt, { color: C.accent }]}>
                Use ↑↓ arrows to reorder, or long-press on the screen to drag
              </Text>
            </View>

            {/* Current widget order — tap arrows to reorder */}
            <View style={styles.glassWidgetList}>
              {sections.map((key, idx) => {
                return (
                  <View key={key} style={[styles.glassWidgetRow, { borderColor: C.border }]}>
                    <View style={[styles.glassWidgetNum, { backgroundColor: C.accent + '18' }]}>
                      <Text style={[styles.glassWidgetNumTxt, { color: C.accent }]}>{idx + 1}</Text>
                    </View>
                    <Ionicons name={WIDGET_INFO[key].icon as any} size={16} color={C.muted} style={{ marginHorizontal: 8 }} />
                    <Text style={[styles.glassWidgetLabel, { color: C.text }]} numberOfLines={1}>{WIDGET_INFO[key].title}</Text>

                    {/* Direct Edit Button */}
                    <TouchableOpacity
                      style={[styles.glassEditItemBtn, { backgroundColor: C.accent + '15', borderColor: C.accent + '35' }]}
                      onPress={() => handleEditFromModal(key)}
                      activeOpacity={0.75}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    >
                      <Ionicons name="create-outline" size={13} color={C.accent} style={{ marginRight: 4 }} />
                      <Text style={[styles.glassEditItemTxt, { color: C.accent }]}>Edit</Text>
                    </TouchableOpacity>

                    {/* Up / Down reorder arrows */}
                    <View style={styles.glassArrowGroup}>
                      <TouchableOpacity
                        style={[styles.glassArrowBtn, { opacity: idx === 0 ? 0.25 : 1 }]}
                        onPress={() => moveWidget(idx, -1)}
                        disabled={idx === 0}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      >
                        <Ionicons name="chevron-up" size={15} color={C.accent} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.glassArrowBtn, { opacity: idx === sections.length - 1 ? 0.25 : 1 }]}
                        onPress={() => moveWidget(idx, 1)}
                        disabled={idx === sections.length - 1}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      >
                        <Ionicons name="chevron-down" size={15} color={C.accent} />
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </View>

            {/* Reset action */}
            <TouchableOpacity
              style={[styles.glassResetBtn, { borderColor: '#EF4444' + '40', backgroundColor: '#EF4444' + '12' }]}
              onPress={() => {
                setEditModal(false);
                setTimeout(handleResetLayout, 200);
              }}
              activeOpacity={0.8}
            >
              <Ionicons name="refresh-circle-outline" size={20} color="#EF4444" style={{ marginRight: 8 }} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.glassResetTitle, { color: '#EF4444' }]}>Reset to Default Layout</Text>
                <Text style={[styles.glassResetSub, { color: C.muted }]}>Restores original widget order</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="#EF4444" opacity={0.6} />
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setEditModal(false)} style={styles.glassDoneBtn}>
              <Text style={[styles.glassdoneTxt, { color: C.text }]}>Done</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ── Quick Goals Edit Modal ── */}
      <Modal visible={goalModal} transparent animationType="slide" onRequestClose={closeGoalsModal}>
        <TouchableOpacity style={styles.glassOverlay} activeOpacity={1} onPress={closeGoalsModal}>
          <TouchableOpacity activeOpacity={1} style={styles.glassSheet} onPress={e => e.stopPropagation()}>
            <View style={styles.glassHandle} />

            <View style={styles.glassModalHeader}>
              <View style={[styles.glassIconCircle, { backgroundColor: C.water + '22' }]}>
                <Ionicons name="nutrition-outline" size={22} color={C.water} />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[styles.glassModalTitle, { color: C.text }]}>Edit Intake Goals</Text>
                <Text style={[styles.glassModalSub, { color: C.muted }]}>Set your daily targets for water, protein & calories</Text>
              </View>
              <TouchableOpacity
                style={[styles.glassCloseBtn, { backgroundColor: C.border + '80' }]}
                onPress={closeGoalsModal}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={16} color={C.text} />
              </TouchableOpacity>
            </View>

            {/* Target 1: Water */}
            <View style={[styles.targetInputCard, { backgroundColor: C.card, borderColor: C.border }]}>
              <View style={styles.targetCardHeader}>
                <Ionicons name="water-outline" size={18} color={C.water} />
                <Text style={[styles.targetCardTitle, { color: C.text }]}>Water Goal (Liters)</Text>
              </View>
              <View style={styles.stepperRow}>
                <TouchableOpacity
                  style={[styles.stepperBtn, { borderColor: C.border }]}
                  onPress={() => {
                    const cur = parseFloat(waterGoalInput) || 3.0;
                    setGoalInput('water_goal', (Math.max(0.5, cur - 0.25)).toFixed(2));
                  }}
                >
                  <Ionicons name="remove" size={16} color={C.text} />
                </TouchableOpacity>
                <TextInput
                  style={[styles.targetInput, { color: C.water, borderColor: C.water + '50' }]}
                  value={waterGoalInput}
                  onChangeText={v => setGoalInput('water_goal', v)}
                  keyboardType="decimal-pad"
                  placeholder="3.0"
                  placeholderTextColor={C.muted}
                />
                <TouchableOpacity
                  style={[styles.stepperBtn, { borderColor: C.border }]}
                  onPress={() => {
                    const cur = parseFloat(waterGoalInput) || 3.0;
                    setGoalInput('water_goal', (cur + 0.25).toFixed(2));
                  }}
                >
                  <Ionicons name="add" size={16} color={C.text} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Target 2: Protein */}
            <View style={[styles.targetInputCard, { backgroundColor: C.card, borderColor: C.border }]}>
              <View style={styles.targetCardHeader}>
                <Ionicons name="restaurant-outline" size={18} color={C.protein} />
                <Text style={[styles.targetCardTitle, { color: C.text }]}>Protein Goal (Grams)</Text>
              </View>
              <View style={styles.stepperRow}>
                <TouchableOpacity
                  style={[styles.stepperBtn, { borderColor: C.border }]}
                  onPress={() => {
                    const cur = parseFloat(proteinGoalInput) || 120;
                    setGoalInput('protein_goal', String(Math.max(20, Math.round(cur - 10))));
                  }}
                >
                  <Ionicons name="remove" size={16} color={C.text} />
                </TouchableOpacity>
                <TextInput
                  style={[styles.targetInput, { color: C.protein, borderColor: C.protein + '50' }]}
                  value={proteinGoalInput}
                  onChangeText={v => setGoalInput('protein_goal', v)}
                  keyboardType="numeric"
                  placeholder="120"
                  placeholderTextColor={C.muted}
                />
                <TouchableOpacity
                  style={[styles.stepperBtn, { borderColor: C.border }]}
                  onPress={() => {
                    const cur = parseFloat(proteinGoalInput) || 120;
                    setGoalInput('protein_goal', String(Math.round(cur + 10)));
                  }}
                >
                  <Ionicons name="add" size={16} color={C.text} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Target 3: Calories */}
            <View style={[styles.targetInputCard, { backgroundColor: C.card, borderColor: C.border }]}>
              <View style={styles.targetCardHeader}>
                <Ionicons name="flame-outline" size={18} color={C.calories} />
                <Text style={[styles.targetCardTitle, { color: C.text }]}>Calorie Goal (kcal)</Text>
              </View>
              <View style={styles.stepperRow}>
                <TouchableOpacity
                  style={[styles.stepperBtn, { borderColor: C.border }]}
                  onPress={() => {
                    const cur = parseInt(calorieGoalInput, 10) || 2800;
                    setGoalInput('calorie_goal', String(Math.max(500, cur - 100)));
                  }}
                >
                  <Ionicons name="remove" size={16} color={C.text} />
                </TouchableOpacity>
                <TextInput
                  style={[styles.targetInput, { color: C.calories, borderColor: C.calories + '50' }]}
                  value={calorieGoalInput}
                  onChangeText={v => setGoalInput('calorie_goal', v)}
                  keyboardType="numeric"
                  placeholder="2800"
                  placeholderTextColor={C.muted}
                />
                <TouchableOpacity
                  style={[styles.stepperBtn, { borderColor: C.border }]}
                  onPress={() => {
                    const cur = parseInt(calorieGoalInput, 10) || 2800;
                    setGoalInput('calorie_goal', String(cur + 100));
                  }}
                >
                  <Ionicons name="add" size={16} color={C.text} />
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity onPress={closeGoalsModal} style={styles.glassDoneBtn}>
              <Text style={[styles.glassdoneTxt, { color: C.text }]}>Done</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <RemindersSheet
        visible={remindersOpen}
        onClose={() => { setRemindersOpen(false); setRemindersKey(k => k + 1); }}
      />

      <ExerciseLibrary visible={libraryOpen} onClose={() => setLibraryOpen(false)} />
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Subcomponents for the layout
// ─────────────────────────────────────────────────────────────────────────────
function MacroProgress({ icon, name, val, pct, color, onPress }: any) {
  const { C } = useTheme();
  const styles = makeStyles(C);
  const size = 44;
  const strokeW = 4;
  const r = (size - strokeW) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (circ * Math.min(Math.max(pct, 0), 1));

  const Wrapper = onPress ? TouchableOpacity : View;

  return (
    <Wrapper onPress={onPress} activeOpacity={0.78} style={styles.macroProgressRow}>
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
      {onPress && (
        <View style={{ justifyContent: 'center', paddingLeft: 4 }}>
          <Ionicons name="chevron-forward" size={14} color={color} style={{ opacity: 0.6 }} />
        </View>
      )}
    </Wrapper>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────
function makeStyles(C: any, isDark?: boolean) {
  return StyleSheet.create({
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
    editHeaderBtn: {
      width: 38,
      height: 38,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)',
    },
    scroll: { padding: 16, paddingBottom: 120 },
    customizeBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
      paddingVertical: 12, borderRadius: 14, borderWidth: 1, borderStyle: 'dashed', marginTop: 4,
    },
    customizeTxt: { fontSize: 13, fontWeight: '800' },
    // Intake Goals widget
    intakeLbl: { fontSize: 10, fontWeight: '800', letterSpacing: 0.6 },
    waterHero: { borderRadius: 18, borderWidth: 1, padding: 14 },
    waterIcon: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
    waterBig: { fontSize: 24, fontWeight: '900', marginTop: 1 },
    waterUnit: { fontSize: 13, fontWeight: '700' },
    waterAdd: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12 },
    waterAddTxt: { fontSize: 13, fontWeight: '800', color: '#fff' },
    waterTrack: { height: 10, borderRadius: 5, overflow: 'hidden', marginTop: 12 },
    waterFill: { height: '100%', borderRadius: 5 },
    waterNote: { fontSize: 12, fontWeight: '700', marginTop: 7 },
    macroTile: { flex: 1, borderRadius: 16, borderWidth: 1, padding: 12 },
    macroPct: { marginLeft: 'auto', fontSize: 11, fontWeight: '800' },
    macroBig: { fontSize: 18, fontWeight: '900', marginTop: 6 },
    macroTrack: { height: 6, borderRadius: 3, overflow: 'hidden', marginTop: 8 },
    // This Week & Habits widget
    habitHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
    habitCount: { fontSize: 12, fontWeight: '800' },
    habitRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
    habitRowIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    habitRowLbl: { fontSize: 14, fontWeight: '800' },
    habitRowSub: { fontSize: 11, fontWeight: '800', marginTop: 1 },
    habitPct: { fontSize: 12, fontWeight: '900', minWidth: 34, textAlign: 'right' },
    habitTile: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 16, borderWidth: 1 },
    habitTileIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
    habitTileLbl: { fontSize: 13, fontWeight: '800' },
    habitTileState: { fontSize: 10, fontWeight: '700', marginTop: 1, textTransform: 'uppercase', letterSpacing: 0.4 },
    weekRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
    weekRowLbl: { width: 92, fontSize: 13, fontWeight: '700' },
    weekTrack: { flex: 1, height: 8, borderRadius: 4, overflow: 'hidden' },
    weekRowNum: { width: 34, textAlign: 'right', fontSize: 13, fontWeight: '900' },
    // Exercise Library widget
    libIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    libTitle: { fontSize: 15, fontWeight: '800' },
    libSub: { fontSize: 12, marginTop: 2, lineHeight: 16 },
    libKicker: { fontSize: 10, fontWeight: '800', letterSpacing: 0.6, marginTop: 14, marginBottom: 8 },
    libPick: { flex: 1, borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
    libThumb: { width: '100%', height: 64 },
    libPickName: { fontSize: 11, fontWeight: '700', lineHeight: 14 },
    libPickGroup: { fontSize: 10, fontWeight: '800', marginTop: 3 },
    libBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 12, paddingVertical: 11, borderRadius: 12 },
    libBtnTxt: { fontSize: 14, fontWeight: '800', color: '#fff' },

    // Drag item wrapper & active state
    dragItemContainer: {
      marginBottom: 16,
      borderRadius: 22,
    },
    activeDragItem: {
      zIndex: 9999,
      borderRadius: 22,
      backgroundColor: isDark ? '#10131E' : '#FFFFFF',
      elevation: 12,
      shadowColor: C.accent,
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.45,
      shadowRadius: 20,
      borderWidth: 1.5,
      borderColor: C.accent + '99',
    },
    // Clips inner content to rounded corners during drag
    activeRoundedWrap: {
      borderRadius: 22,
      overflow: 'hidden',
    },
    activeInnerContent: {
      borderRadius: 22,
      overflow: 'hidden',
      backgroundColor: isDark ? 'rgba(15, 18, 30, 0.95)' : 'rgba(255, 255, 255, 0.95)',
      padding: 8,
    },
    activeCardGlow: {
      borderColor: C.accent,
      borderWidth: 1.5,
    },
    // Frost overlay — sits inside the clipped rounded wrapper
    frostOverlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 10,
      borderRadius: 22,
    },
    frostInner: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.55)',
      borderWidth: 2,
      borderColor: isDark ? 'rgba(255, 255, 255, 0.35)' : 'rgba(255, 255, 255, 0.95)',
      borderRadius: 22,
    },
    // Glass bottom-sheet modal
    glassOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.6)',
      justifyContent: 'flex-end',
    },
    glassSheet: {
      backgroundColor: isDark ? 'rgba(15,18,30,0.97)' : 'rgba(245,247,252,0.97)',
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      paddingTop: 12,
      paddingHorizontal: 20,
      paddingBottom: 36,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)',
      // Simulate frost shimmer
      shadowColor: '#000',
      shadowOffset: { width: 0, height: -6 },
      shadowOpacity: 0.3,
      shadowRadius: 20,
      elevation: 30,
    },
    glassHandle: {
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)',
      alignSelf: 'center',
      marginBottom: 20,
    },
    glassModalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 16,
    },
    glassIconCircle: {
      width: 44,
      height: 44,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    glassModalTitle: {
      fontSize: 17,
      fontWeight: '800',
    },
    glassModalSub: {
      fontSize: 12,
      marginTop: 1,
    },
    glassCloseBtn: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
    },
    glassTipRow: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: 12,
      borderWidth: 1,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginBottom: 16,
    },
    glassTipTxt: {
      fontSize: 12,
      fontWeight: '600',
      flex: 1,
      lineHeight: 16,
    },
    glassWidgetList: {
      gap: 8,
      marginBottom: 20,
    },
    glassArrowGroup: {
      flexDirection: 'row',
      gap: 4,
      marginLeft: 'auto',
    },
    glassArrowBtn: {
      width: 30,
      height: 30,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.09)',
    },
    glassWidgetRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 12,
      borderRadius: 14,
      borderWidth: 1,
      backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
    },
    glassWidgetNum: {
      width: 24,
      height: 24,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    glassWidgetNumTxt: {
      fontSize: 11,
      fontWeight: '800',
    },
    glassWidgetLabel: {
      fontSize: 14,
      fontWeight: '600',
      flex: 1,
    },
    glassEditItemBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 8,
      paddingVertical: 5,
      borderRadius: 8,
      borderWidth: 1,
      marginRight: 8,
    },
    glassEditItemTxt: {
      fontSize: 11,
      fontWeight: '700',
    },
    glassResetBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: 16,
      borderWidth: 1,
      paddingHorizontal: 16,
      paddingVertical: 14,
      marginBottom: 12,
    },
    glassResetTitle: {
      fontSize: 14,
      fontWeight: '700',
    },
    glassResetSub: {
      fontSize: 11,
      marginTop: 1,
    },
    glassDoneBtn: {
      alignItems: 'center',
      paddingVertical: 10,
    },
    glassdoneTxt: {
      fontSize: 15,
      fontWeight: '700',
      opacity: 0.6,
    },

    // Section Header row with drag grip hint
    sectionWrap: {
      width: '100%',
    },
    sectionHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 6,
    },
    headerRightControls: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    headerEditBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 8,
      backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)',
    },
    headerEditBadgeTxt: {
      fontSize: 11,
      fontWeight: '700',
      marginLeft: 4,
    },
    dragGripBox: {
      paddingHorizontal: 6,
      paddingVertical: 2,
    },

    // Target Goals Modal
    targetInputCard: {
      borderRadius: 16,
      borderWidth: 1,
      padding: 14,
      marginBottom: 12,
    },
    targetCardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 10,
    },
    targetCardTitle: {
      fontSize: 14,
      fontWeight: '700',
    },
    stepperRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    stepperBtn: {
      width: 40,
      height: 40,
      borderRadius: 12,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
    },
    targetInput: {
      flex: 1,
      height: 40,
      borderRadius: 12,
      borderWidth: 1,
      paddingHorizontal: 12,
      fontSize: 16,
      fontWeight: '700',
      textAlign: 'center',
      backgroundColor: isDark ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.8)',
    },
    saveTargetsBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 14,
      borderRadius: 16,
      marginTop: 4,
      marginBottom: 4,
    },
    saveTargetsBtnTxt: {
      color: '#FFFFFF',
      fontSize: 15,
      fontWeight: '700',
    },

    // Workout Card
    workoutCardInner: {
      padding: 16,
    },
    pendingRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
    pendingDot: { width: 7, height: 7, borderRadius: 4 },
    pendingTxt: { fontSize: 12, fontWeight: '800' },
    workoutTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    workoutIconWrap: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: C.purple + '22',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 10,
    },
    workoutName: {
      flex: 1,
      fontSize: 16,
      fontWeight: '800',
      color: C.purple,
      marginRight: 8,
    },
    workoutActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    editPlanBtn: {
      width: 32,
      height: 32,
      borderRadius: 10,
      backgroundColor: C.purple + '20',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: C.purple + '40',
    },
    statusBadge: {
      borderRadius: 16,
      paddingHorizontal: 10,
      paddingVertical: 6,
      alignItems: 'center',
      justifyContent: 'center',
    },
    mgRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      marginTop: 12,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: C.border + '50',
    },

    // Overview
    overviewGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
    ovCardWrap: { width: '48.5%', marginBottom: 10 },
    ovCard: { padding: 14, alignItems: 'center', width: '100%' },
    ovIconBox: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
    ovTitle: { fontSize: 11, color: C.muted, fontWeight: '700', marginBottom: 6, textAlign: 'center' },
    ovVal: { fontSize: 15, fontWeight: '800', marginBottom: 4, textAlign: 'center' },
    ovSub: { fontSize: 10, color: C.textSub, textAlign: 'center' },

    // Intake Goals
    intakeContainer: { paddingHorizontal: 16, paddingVertical: 16 },
    divider: { height: 1, backgroundColor: C.border, marginVertical: 14 },
    macroProgressRow: { flexDirection: 'row', alignItems: 'center' },
    macroIconWrap: { width: 32, alignItems: 'center' },
    macroName: { fontSize: 12, fontWeight: '700', color: C.text, marginBottom: 2 },
    macroValTxt: { fontSize: 11, fontWeight: '700' },
    macroRingBox: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
    macroRingCenter: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
    macroRingTxt: { fontSize: 11, fontWeight: '800' },

    // Two Column Layout
    twoColSection: { flexDirection: 'row', gap: 12, marginBottom: 4 },
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
    habitIconWrap: { width: 20, marginRight: 8, alignItems: 'center' },
    habitLabel: { flex: 1, fontSize: 11, color: C.textSub, fontWeight: '600' },
    habitProgressBox: { marginTop: 8, borderTopWidth: 1, borderTopColor: C.border, paddingTop: 12 },
    habitProgressTxt: { fontSize: 10, color: C.muted, marginBottom: 6, fontWeight: '600' },

    // Reminders
    reminderEditBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, backgroundColor: C.accent + '14', borderWidth: 1, borderColor: C.accent + '40' },
    reminderEditTxt: { fontSize: 12, fontWeight: '800', color: C.accent },
    reminderFlashWrap: { borderRadius: 22, borderWidth: 1.5, borderColor: 'transparent', marginBottom: 16 },

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
  });
}