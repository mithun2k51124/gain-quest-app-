import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
  TextInput,
  Modal,
  PanResponder,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, G } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import DraggableFlatList, {
  ScaleDecorator,
  RenderItemParams,
} from 'react-native-draggable-flatlist';
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
  getSetting,
  setSetting,
  DailyLog,
  Goals,
  Streak,
  WorkoutPlan,
} from '../db/database';
import { Card, ProgressBar, Ring, MuscleTag, SectionHeader } from '../components/ui';
import { useTheme } from '../contexts/ThemeContext';
import { useCustomAlert } from '../contexts/AlertContext';

type HomeSectionKey = 'workout' | 'overview' | 'intake' | 'week_habits' | 'reminders';

const DEFAULT_SECTIONS: HomeSectionKey[] = [
  'workout',
  'overview',
  'intake',
  'week_habits',
  'reminders',
];

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
  const [refresh, setRefresh] = useState(false);

  // Body weight popup
  const [weightPopup, setWeightPopup] = useState(false);
  const [weightInput, setWeightInput] = useState('');

  // Widget custom ordering
  const [isArranging, setIsArranging] = useState(false);
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
    } catch (_) {}
    return DEFAULT_SECTIONS;
  });

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

  const handleDragEnd = ({ data }: { data: HomeSectionKey[] }) => {
    setSections(data);
    try {
      setSetting('home_sections_order', JSON.stringify(data));
    } catch (_) {}
  };

  const handleResetLayout = () => {
    setSections(DEFAULT_SECTIONS);
    try {
      setSetting('home_sections_order', JSON.stringify(DEFAULT_SECTIONS));
    } catch (_) {}
    showAlert('Reset ✓', 'Home widgets layout restored to default.');
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponderCapture: (_, gestureState) => {
          if (isArranging) return false;
          return (
            Math.abs(gestureState.dx) > 18 &&
            Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 1.5
          );
        },
        onPanResponderRelease: (_, gestureState) => {
          const isQuickFling = Math.abs(gestureState.vx) > 0.3 && Math.abs(gestureState.dx) > 15;
          const isLongSwipe = Math.abs(gestureState.dx) > 40;
          if (isQuickFling || isLongSwipe) {
            if (gestureState.dx < 0) {
              router.navigate('/tracker' as any);
            }
          }
        },
      }),
    [isArranging, router]
  );

  const styles = makeStyles(C, isDark);

  if (!log || !goals) return null;

  const waterPct = Math.min((log.water_intake || 0) / goals.water_goal, 1);
  const proteinPct = Math.min((log.protein_intake || 0) / goals.protein_goal, 1);
  const calPct = Math.min((log.calorie_intake || 0) / goals.calorie_goal, 1);

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

  // ─────────────────────────────────────────────────────────────────────────
  // Section Renderers
  // ─────────────────────────────────────────────────────────────────────────
  const renderWorkoutSection = (drag: () => void, isActive: boolean) => (
    <View style={styles.sectionWrap}>
      <View style={styles.sectionHeaderRow}>
        <SectionHeader title="Today's Workout" />
        <TouchableOpacity
          onPressIn={drag}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={[styles.dragGripBtn, isActive && { backgroundColor: C.purple + '25', borderColor: C.purple }]}
        >
          <Ionicons name="reorder-two" size={20} color={isActive ? C.purple : C.muted} />
        </TouchableOpacity>
      </View>
      {plan ? (
        <TouchableOpacity
          activeOpacity={0.82}
          onPress={() => router.push({ pathname: '/workouts', params: { openTab: 'Log' } } as any)}
          onLongPress={drag}
          delayLongPress={220}
        >
          <Card accent={C.purple} style={isActive ? styles.activeCardGlow : undefined}>
            <View style={styles.workoutCardInner}>
              <View style={styles.workoutTopRow}>
                <View style={styles.workoutIconWrap}>
                  <Ionicons name="barbell-outline" size={22} color={C.purple} />
                </View>
                <Text style={styles.workoutName} numberOfLines={1}>{plan.plan_name || 'Workout'}</Text>
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
                        fontSize: 11,
                      }}
                    >
                      {log.workout_completed ? '✓ Done' : 'Tap to Log'}
                    </Text>
                  </View>
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
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          activeOpacity={0.82}
          onPress={() => router.push({ pathname: '/workouts', params: { openTab: 'Planner' } } as any)}
          onLongPress={drag}
          delayLongPress={220}
        >
          <Card accent={C.purple} style={isActive ? styles.activeCardGlow : undefined}>
            <View style={styles.workoutCardInner}>
              <View style={styles.workoutTopRow}>
                <View style={styles.workoutIconWrap}>
                  <Ionicons name="bed-outline" size={22} color={C.purple} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.workoutName}>Rest Day / No Workout</Text>
                  <Text style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>Tap to set up a workout routine</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={C.purple} />
              </View>
            </View>
          </Card>
        </TouchableOpacity>
      )}
    </View>
  );

  const renderOverviewSection = (drag: () => void, isActive: boolean) => (
    <View style={styles.sectionWrap}>
      <View style={styles.sectionHeaderRow}>
        <SectionHeader title="Overview" />
        <TouchableOpacity
          onPressIn={drag}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={[styles.dragGripBtn, isActive && { backgroundColor: C.accent + '25', borderColor: C.accent }]}
        >
          <Ionicons name="reorder-two" size={20} color={isActive ? C.accent : C.muted} />
        </TouchableOpacity>
      </View>
      <View style={styles.overviewGrid}>
        <OverviewCard
          icon="flame-outline"
          title="Streak"
          val={`${streak?.current_streak ?? 0} days`}
          sub={`Best: ${streak?.longest_streak ?? 0}`}
          color="#FF6B35"
          onLongPress={drag}
        />
        <OverviewCard
          icon="flash-outline"
          title="Creatine"
          val={log.creatine_taken ? 'Taken' : 'Not Logged'}
          sub={log.creatine_taken ? 'Logged today' : 'Tap to log'}
          color={log.creatine_taken ? C.green : C.red}
          onPress={() => router.push({ pathname: '/tracker', params: { openSection: 'creatine' } } as any)}
          onLongPress={drag}
        />
        <OverviewCard
          icon="barbell-outline"
          title="Workout"
          val={log.workout_completed ? 'Done' : 'Pending'}
          sub={log.workout_completed ? 'Tap to log more' : 'Tap to log'}
          color={log.workout_completed ? C.purple : C.muted}
          onPress={() => router.push({ pathname: '/workouts', params: { openTab: 'Log' } })}
          onLongPress={drag}
        />
        <OverviewCard
          icon="scale-outline"
          title="Body Weight"
          val={weight ? `${weight.toFixed(1)} kg` : '-- kg'}
          sub={weight ? `Goal: ${goals.weight_goal} kg` : 'Tap to log'}
          color={C.water}
          onPress={() => setWeightPopup(true)}
          onLongPress={drag}
        />
      </View>
    </View>
  );

  const renderIntakeSection = (drag: () => void, isActive: boolean) => (
    <View style={styles.sectionWrap}>
      <View style={styles.sectionHeaderRow}>
        <SectionHeader title="Intake Goals" />
        <TouchableOpacity
          onPressIn={drag}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={[styles.dragGripBtn, isActive && { backgroundColor: C.water + '25', borderColor: C.water }]}
        >
          <Ionicons name="reorder-two" size={20} color={isActive ? C.water : C.muted} />
        </TouchableOpacity>
      </View>
      <TouchableOpacity activeOpacity={1} onLongPress={drag} delayLongPress={220}>
        <Card style={isActive ? styles.activeCardGlow : undefined}>
          <View style={styles.intakeContainer}>
            <MacroProgress
              icon="water-outline"
              name="Water"
              val={`${log.water_intake.toFixed(2)} / ${goals.water_goal} L`}
              pct={waterPct}
              color={C.water}
              onPress={() => router.push({ pathname: '/tracker', params: { openSection: 'water' } } as any)}
            />
            <View style={styles.divider} />
            <MacroProgress
              icon="restaurant-outline"
              name="Protein"
              val={`${Math.round(log.protein_intake)} / ${goals.protein_goal} g`}
              pct={proteinPct}
              color={C.protein}
              onPress={() => router.push({ pathname: '/tracker', params: { openSection: 'nutrition' } } as any)}
            />
            <View style={styles.divider} />
            <MacroProgress
              icon="flame-outline"
              name="Calories"
              val={`${log.calorie_intake} / ${goals.calorie_goal} kcal`}
              pct={calPct}
              color={C.calories}
              onPress={() => router.push({ pathname: '/tracker', params: { openSection: 'nutrition' } } as any)}
            />
          </View>
        </Card>
      </TouchableOpacity>
    </View>
  );

  const renderWeekHabitsSection = (drag: () => void, isActive: boolean) => (
    <View style={styles.sectionWrap}>
      <View style={styles.sectionHeaderRow}>
        <SectionHeader title="This Week & Habits" />
        <TouchableOpacity
          onPressIn={drag}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={[styles.dragGripBtn, isActive && { backgroundColor: C.green + '25', borderColor: C.green }]}
        >
          <Ionicons name="reorder-two" size={20} color={isActive ? C.green : C.muted} />
        </TouchableOpacity>
      </View>
      <View style={styles.twoColSection}>
        <View style={styles.colLeft}>
          <TouchableOpacity activeOpacity={1} onLongPress={drag} delayLongPress={220} style={{ flex: 1 }}>
            <Card style={[{ flex: 1 }, isActive && styles.activeCardGlow]}>
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
          </TouchableOpacity>
        </View>

        <View style={styles.colRight}>
          <TouchableOpacity activeOpacity={1} onLongPress={drag} delayLongPress={220} style={{ flex: 1 }}>
            <Card style={[{ flex: 1 }, isActive && styles.activeCardGlow]}>
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
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  const renderRemindersSection = (drag: () => void, isActive: boolean) => (
    <View style={styles.sectionWrap}>
      <View style={styles.sectionHeaderRow}>
        <SectionHeader title="Reminders" />
        <TouchableOpacity
          onPressIn={drag}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={[styles.dragGripBtn, isActive && { backgroundColor: C.orange + '25', borderColor: C.orange }]}
        >
          <Ionicons name="reorder-two" size={20} color={isActive ? C.orange : C.muted} />
        </TouchableOpacity>
      </View>
      <TouchableOpacity activeOpacity={1} onLongPress={drag} delayLongPress={220}>
        <View style={styles.remindersGrid}>
          {reminders.map((r, i) => (
            <View key={i} style={[styles.reminderPill, { borderColor: r.color }]}>
              <Ionicons name={r.icon as any} size={16} color={r.color} style={{ marginRight: 8 }} />
              <Text style={[styles.reminderTxt, { color: r.color }]}>{r.msg}</Text>
            </View>
          ))}
        </View>
      </TouchableOpacity>
    </View>
  );

  const renderItem = ({ item, drag, isActive }: RenderItemParams<HomeSectionKey>) => {
    return (
      <ScaleDecorator activeScale={1.03}>
        <View style={[styles.dragItemContainer, isActive && styles.activeDragItem]}>
          {item === 'workout' && renderWorkoutSection(drag, isActive)}
          {item === 'overview' && renderOverviewSection(drag, isActive)}
          {item === 'intake' && renderIntakeSection(drag, isActive)}
          {item === 'week_habits' && renderWeekHabitsSection(drag, isActive)}
          {item === 'reminders' && renderRemindersSection(drag, isActive)}
        </View>
      </ScaleDecorator>
    );
  };

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
        <TouchableOpacity
          style={[styles.arrangeBtn, isArranging && { backgroundColor: C.accent, borderColor: C.accent }]}
          onPress={() => setIsArranging(prev => !prev)}
          activeOpacity={0.8}
        >
          <Ionicons
            name={isArranging ? "checkmark" : "apps-outline"}
            size={16}
            color={isArranging ? '#fff' : C.accent}
          />
          <Text style={[styles.arrangeBtnTxt, isArranging && { color: '#fff' }]}>
            {isArranging ? 'Done' : 'Widgets'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* ── Widget Arrangement Helper Banner ── */}
      {isArranging && (
        <View style={styles.arrangeBanner}>
          <Ionicons name="information-circle-outline" size={18} color={C.accent} style={{ marginRight: 8 }} />
          <Text style={styles.arrangeBannerTxt}>Hold ⠿ or any section to drag & drop anywhere</Text>
          <TouchableOpacity onPress={handleResetLayout} style={styles.resetBtn} activeOpacity={0.75}>
            <Text style={styles.resetBtnTxt}>Reset</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Reorderable Draggable FlatList ── */}
      <View style={{ flex: 1 }} {...panResponder.panHandlers}>
        <DraggableFlatList
          data={sections}
          onDragEnd={handleDragEnd}
          keyExtractor={(item) => item}
          renderItem={renderItem}
          activationDistance={20}
          animationConfig={{ damping: 24, stiffness: 240, mass: 0.55 }}
          refreshControl={<RefreshControl refreshing={refresh} onRefresh={onRefresh} tintColor={C.accent} />}
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        />
      </View>

      {/* ── Body Weight Popup ── */}
      <Modal visible={weightPopup} transparent animationType="fade" onRequestClose={() => setWeightPopup(false)}>
        <TouchableOpacity style={styles.bwOverlay} activeOpacity={1} onPress={() => setWeightPopup(false)}>
          <TouchableOpacity activeOpacity={1} style={[styles.bwSheet, { backgroundColor: C.card, borderWidth: 1, borderColor: C.border }]} onPress={e => e.stopPropagation()}>
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
// Subcomponents for the layout
// ─────────────────────────────────────────────────────────────────────────────
function OverviewCard({ icon, title, val, sub, color, onPress, onLongPress }: any) {
  const { C } = useTheme();
  const styles = makeStyles(C);
  const Wrapper = (onPress || onLongPress) ? TouchableOpacity : View;
  return (
    <Wrapper
      style={styles.ovCardWrap}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={220}
      activeOpacity={0.82}
    >
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
    arrangeBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor: C.accentDim,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: C.accent + '44',
    },
    arrangeBtnTxt: { fontSize: 12, fontWeight: '700', color: C.accent },
    arrangeBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: C.card,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 14,
      marginHorizontal: 16,
      marginTop: 12,
      borderWidth: 1,
      borderColor: C.accent + '55',
    },
    arrangeBannerTxt: { flex: 1, fontSize: 11, color: C.text, fontWeight: '600' },
    resetBtn: {
      backgroundColor: C.accentDim,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: C.accent + '33',
    },
    resetBtnTxt: { fontSize: 11, fontWeight: '700', color: C.accent },
    scroll: { padding: 16, paddingBottom: 50 },

    // Draggable container
    dragItemContainer: {
      marginBottom: 16,
    },
    activeDragItem: {
      zIndex: 9999,
    },
    activeCardGlow: {
      borderColor: C.accent,
      borderWidth: 1.5,
      shadowColor: C.accent,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.5,
      shadowRadius: 12,
      elevation: 10,
    },

    // Section Header row with drag handle
    sectionWrap: {
      width: '100%',
    },
    sectionHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 4,
    },
    dragGripBtn: {
      width: 32,
      height: 32,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: C.card,
      borderWidth: 1,
      borderColor: C.border,
    },

    // Workout Card
    workoutCardInner: {
      padding: 16,
    },
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
    ovCardWrap: { width: '48%', marginBottom: 14 },
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
    twoColSection: { flexDirection: 'row', gap: 12 },
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
      backgroundColor: C.card,
      borderWidth: 1,
      borderRadius: 20,
      paddingHorizontal: 16,
      paddingVertical: 10,
      shadowColor: C.shadowDark,
      shadowOffset: { width: 2, height: 2 },
      shadowOpacity: 0.5,
      shadowRadius: 6,
      elevation: 2,
    },
    reminderTxt: { fontSize: 12, fontWeight: '700' },

    // Body Weight Popup
    bwOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 },
    bwSheet: { width: '100%', borderRadius: 24, padding: 24, alignItems: 'center' },
    bwHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(150,150,150,0.3)', marginBottom: 16 },
    bwIconWrap: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
    bwTitle: { fontSize: 20, fontWeight: '800', marginBottom: 6 },
    bwCurrent: { fontSize: 12, marginBottom: 16, textAlign: 'center' },
    bwInput: { width: '100%', borderRadius: 14, borderWidth: 1.5, paddingHorizontal: 16, paddingVertical: 14, fontSize: 18, fontWeight: '700', textAlign: 'center', marginBottom: 16 },
    bwBtn: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 15, borderRadius: 16, marginBottom: 10 },
    bwBtnTxt: { color: '#fff', fontSize: 16, fontWeight: '800' },
    bwCancel: { paddingVertical: 8 },
    bwCancelTxt: { fontSize: 14, fontWeight: '600' },
  });
}