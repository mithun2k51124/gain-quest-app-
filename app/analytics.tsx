// app/analytics.tsx — Analytics Screen
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  RefreshControl, Dimensions, Modal, Image,
  FlatList, Alert, ActionSheetIOS, Platform,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { VictoryChart, VictoryLine, VictoryAxis,
         VictoryTheme, VictoryBar, VictoryArea } from 'victory-native';
import {
  getWeeklyStats, getLastNDaysLogs,
  getGoals, getMuscleTracker,
  todayStr, DailyLog, Goals,
  addProgressPhoto, getProgressPhotos, getProgressPhotoDates,
  deleteProgressPhoto, ProgressPhoto,
  getWorkoutSessionsForDate, getExerciseLogsForDate, getWorkoutDates,
  getDailyLogForDate, getFoodLog, getWaterLog, getNutritionDates,
  getAllPRs, WorkoutSession, ExerciseLog, FoodEntry, WaterEntry,
} from '../db/database';
import { Card, SectionHeader, ProgressBar, MuscleTag } from '../components/ui';
import BodyAnatomy from '../components/BodyAnatomy';
import { useTheme } from '../contexts/ThemeContext';
import { useCustomAlert } from '../contexts/AlertContext';
import { MUSCLE_GROUPS } from '../constants/theme';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';

const { width: SW } = Dimensions.get('window');
type Tab = 'Overview' | 'Nutrition' | 'Workouts' | 'Progress';

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function formatDateLabel(dateStr: string): string {
  try {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
}

export default function AnalyticsScreen() {
  const { showAlert } = useCustomAlert();
  const { C, isDark } = useTheme();

  const [tab, setTab] = useState<Tab>('Overview');
  const [weekly, setWeekly] = useState<any>(null);
  const [logs, setLogs] = useState<DailyLog[]>([]);
  const [muscles, setMuscles] = useState<any[]>([]);
  const [goals, setGoals] = useState<Goals | null>(null);
  const [refresh, setRefresh] = useState(false);

  // Selected date shared across detail views
  const [selectedDay, setSelectedDay] = useState<string>(todayStr());

  // Active dates for all tabs
  const [photoDates, setPhotoDates] = useState<string[]>([]);
  const [workoutDates, setWorkoutDates] = useState<string[]>([]);
  const [nutritionDates, setNutritionDates] = useState<string[]>([]);

  // Day specific data for Workouts
  const [daySessions, setDaySessions] = useState<WorkoutSession[]>([]);
  const [dayExercises, setDayExercises] = useState<ExerciseLog[]>([]);
  const [allPRs, setAllPRs] = useState<any[]>([]);

  // Day specific data for Nutrition
  const [dayDailyLog, setDayDailyLog] = useState<DailyLog | null>(null);
  const [dayFoods, setDayFoods] = useState<FoodEntry[]>([]);
  const [dayWater, setDayWater] = useState<WaterEntry[]>([]);

  // Progress photo state
  const [dayPhotos, setDayPhotos] = useState<ProgressPhoto[]>([]);
  const [photoModal, setPhotoModal] = useState(false);
  const [modalPhotos, setModalPhotos] = useState<ProgressPhoto[]>([]);
  const [modalDay, setModalDay] = useState<string>('');
  const [activeModalIdx, setActiveModalIdx] = useState<number>(0);

  const styles = makeStyles(C, isDark);

  const loadDayData = useCallback((day: string) => {
    setDayPhotos(getProgressPhotos(day));
    setDaySessions(getWorkoutSessionsForDate(day));
    setDayExercises(getExerciseLogsForDate(day));
    setDayDailyLog(getDailyLogForDate(day));
    setDayFoods(getFoodLog(day));
    setDayWater(getWaterLog(day));
  }, []);

  const loadAll = useCallback(() => {
    setWeekly(getWeeklyStats());
    setLogs(getLastNDaysLogs(30));
    setMuscles(getMuscleTracker());
    setGoals(getGoals());
    setAllPRs(getAllPRs());

    setPhotoDates(getProgressPhotoDates());
    setWorkoutDates(getWorkoutDates());
    setNutritionDates(getNutritionDates());

    loadDayData(selectedDay);
  }, [selectedDay, loadDayData]);

  useEffect(() => {
    loadDayData(selectedDay);
  }, [selectedDay, loadDayData]);

  useFocusEffect(
    useCallback(() => {
      loadAll();
    }, [loadAll])
  );

  const onRefresh = () => {
    setRefresh(true);
    loadAll();
    setRefresh(false);
  };

  const openDayModal = (day: string, initialIdx = 0) => {
    const photos = getProgressPhotos(day);
    if (photos.length === 0) return;
    setModalDay(day);
    setModalPhotos(photos);
    setActiveModalIdx(Math.min(initialIdx, photos.length - 1));
    setPhotoModal(true);
  };

  const pickPhoto = async () => {
    const options = ['Take Photo', 'Choose from Gallery', 'Browse Files', 'Cancel'];
    const doAction = async (idx: number) => {
      let result: ImagePicker.ImagePickerResult | null = null;
      if (idx === 0) {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') { Alert.alert('Permission needed', 'Camera access is required.'); return; }
        result = await ImagePicker.launchCameraAsync({ quality: 1, allowsEditing: false, aspect: [4,3] });
      } else if (idx === 1) {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') { Alert.alert('Permission needed', 'Gallery access is required.'); return; }
        result = await ImagePicker.launchImageLibraryAsync({ quality: 1, allowsMultipleSelection: true, mediaTypes: 'images' });
      } else if (idx === 2) {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') { Alert.alert('Permission needed', 'Files access is required.'); return; }
        result = await ImagePicker.launchImageLibraryAsync({ quality: 1, allowsMultipleSelection: true, mediaTypes: 'images' });
      }
      if (!result || result.canceled || !result.assets) return;
      for (const asset of result.assets) {
        try {
          // Compress to max 900px wide, 75% quality
          const compressed = await ImageManipulator.manipulateAsync(
            asset.uri,
            [{ resize: { width: Math.min(asset.width || 900, 900) } }],
            { compress: 0.75, format: ImageManipulator.SaveFormat.JPEG }
          );
          // Copy to app documents dir for persistence
          const filename = `progress_${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`;
          const destUri = FileSystem.documentDirectory + filename;
          await FileSystem.copyAsync({ from: compressed.uri, to: destUri });
          addProgressPhoto(selectedDay, destUri);
        } catch (e) { console.warn('Photo save error', e); }
      }
      setPhotoDates(getProgressPhotoDates());
      setDayPhotos(getProgressPhotos(selectedDay));
    };

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options, cancelButtonIndex: 3 },
        doAction
      );
    } else {
      Alert.alert('Add Progress Photo', 'Choose source', [
        { text: 'Take Photo',        onPress: () => doAction(0) },
        { text: 'Choose from Gallery', onPress: () => doAction(1) },
        { text: 'Browse Files',      onPress: () => doAction(2) },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  };

  const deletePhoto = async (photo: ProgressPhoto) => {
    Alert.alert('Delete Photo', 'Remove this progress photo?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { await FileSystem.deleteAsync(photo.uri, { idempotent: true }); } catch {}
        deleteProgressPhoto(photo.id, photo.uri);
        const updated = getProgressPhotos(modalDay);
        setModalPhotos(updated);
        if (updated.length === 0) setPhotoModal(false);
        setPhotoDates(getProgressPhotoDates());
        setDayPhotos(getProgressPhotos(selectedDay));
      }}
    ]);
  };

  const tabs: Tab[] = ['Overview', 'Nutrition', 'Workouts', 'Progress'];

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
                { icon:'barbell-outline', label:'Workouts', val: weekly.workouts, color: C.purple },
                { icon:'water-outline', label:'Water Goals', val: weekly.waterSuccess, color: C.water },
                { icon:'restaurant-outline', label:'Protein Goals', val: weekly.proteinSuccess, color: C.protein },
                { icon:'flash-outline', label:'Creatine Days', val: weekly.creatineTaken, color: C.green },
              ].map((s, i) => (
                <View key={i} style={styles.statBox}>
                  <Ionicons name={s.icon as any} size={28} color={s.color} style={{ marginBottom: 4 }} />
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
                    { icon: 'water-outline', label: 'Water', key: 'water_goal_reached', color: C.water },
                    { icon: 'restaurant-outline', label: 'Protein', key: 'protein_goal_reached', color: C.protein },
                    { icon: 'barbell-outline', label: 'Workout', key: 'workout_completed', color: C.purple },
                    { icon: 'flash-outline', label: 'Creatine', key: 'creatine_taken', color: C.green },
                  ].map(({ icon, label, key, color }) => {
                    const done = logs.filter(l => (l as any)[key]).length;
                    const pct  = logs.length ? done / logs.length : 0;
                    return (
                      <View key={key} style={{ marginBottom: 14 }}>
                        <View style={styles.consRow}>
                          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <Ionicons name={icon as any} size={16} color={color} style={{ marginRight: 6 }} />
                            <Text style={styles.consLabel}>{label}</Text>
                          </View>
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

        {/* ── NUTRITION ──────────────────────────────────────────────── */}
        {tab === 'Nutrition' && (
          <NutritionTab
            C={C}
            isDark={isDark}
            styles={styles}
            selectedDay={selectedDay}
            setSelectedDay={setSelectedDay}
            dayDailyLog={dayDailyLog}
            dayFoods={dayFoods}
            dayWater={dayWater}
            nutritionDates={nutritionDates}
            goals={goals}
            logs={logs}
          />
        )}

        {/* ── WORKOUTS ───────────────────────────────────────────────── */}
        {tab === 'Workouts' && (
          <WorkoutsTab
            C={C}
            isDark={isDark}
            styles={styles}
            selectedDay={selectedDay}
            setSelectedDay={setSelectedDay}
            daySessions={daySessions}
            dayExercises={dayExercises}
            dayDailyLog={dayDailyLog}
            workoutDates={workoutDates}
            allPRs={allPRs}
            logs={logs}
          />
        )}

        {/* ── PROGRESS ────────────────────────────────────────────── */}
        {tab === 'Progress' && (
          <ProgressTab
            C={C}
            isDark={isDark}
            styles={styles}
            selectedDay={selectedDay}
            setSelectedDay={setSelectedDay}
            dayPhotos={dayPhotos}
            photoDates={photoDates}
            pickPhoto={pickPhoto}
            openDayModal={openDayModal}
          />
        )}

      </ScrollView>

      {/* Photo full-screen modal */}
      <Modal visible={photoModal} animationType="fade" presentationStyle="fullScreen" onRequestClose={() => setPhotoModal(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: '#07090E' }}>
          {/* Top Bar */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1A2130' }}>
            <TouchableOpacity onPress={() => setPhotoModal(false)} style={{ padding: 6, borderRadius: 20, backgroundColor: '#161D2B' }}>
              <Ionicons name="close" size={22} color="#E8ECF0" />
            </TouchableOpacity>
            <View style={{ alignItems: 'center' }}>
              <Text style={{ color: '#E8ECF0', fontSize: 16, fontWeight: '800' }}>{modalDay}</Text>
              {modalPhotos.length > 0 && (
                <Text style={{ color: '#5A6880', fontSize: 12, fontWeight: '600' }}>
                  Photo {activeModalIdx + 1} of {modalPhotos.length}
                </Text>
              )}
            </View>
            {modalPhotos[activeModalIdx] ? (
              <TouchableOpacity
                onPress={() => deletePhoto(modalPhotos[activeModalIdx])}
                style={{ padding: 6, borderRadius: 20, backgroundColor: '#E05C5C22', borderWidth: 1, borderColor: '#E05C5C55' }}>
                <Ionicons name="trash-outline" size={20} color="#E05C5C" />
              </TouchableOpacity>
            ) : <View style={{ width: 34 }} />}
          </View>

          {/* Swipable Full-Screen Photo List */}
          <FlatList
            data={modalPhotos}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            keyExtractor={item => String(item.id)}
            initialScrollIndex={modalPhotos.length > activeModalIdx ? activeModalIdx : 0}
            getItemLayout={(_, index) => ({ length: SW, offset: SW * index, index })}
            onMomentumScrollEnd={(e) => {
              const idx = Math.round(e.nativeEvent.contentOffset.x / SW);
              setActiveModalIdx(Math.max(0, Math.min(idx, modalPhotos.length - 1)));
            }}
            renderItem={({ item }) => (
              <View style={{ width: SW, flex: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: 40 }}>
                <Image
                  source={{ uri: item.uri }}
                  style={{ width: SW, height: SW * 1.35, resizeMode: 'contain' }}
                />
              </View>
            )}
          />

          {/* Dots Indicator */}
          {modalPhotos.length > 1 && (
            <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, paddingVertical: 16 }}>
              {modalPhotos.map((_, i) => (
                <View
                  key={i}
                  style={{
                    width: i === activeModalIdx ? 18 : 6,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: i === activeModalIdx ? C.accent : C.border,
                  }}
                />
              ))}
            </View>
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Reusable DayCalendarNav Component (Samsung Health Inspired)
// ─────────────────────────────────────────────────────────────────────────────
interface DayCalendarNavProps {
  C: any;
  isDark: boolean;
  styles: any;
  selectedDay: string;
  onSelectDay: (day: string) => void;
  activeDates: string[];
  activeColor: string;
  activeIcon: any;
  targetText: string;
}

function DayCalendarNav({
  C,
  isDark,
  styles,
  selectedDay,
  onSelectDay,
  activeDates,
  activeColor,
  activeIcon,
  targetText,
}: DayCalendarNavProps) {
  const [showFullCal, setShowFullCal] = useState(false);
  const [calMonth, setCalMonth] = useState(() => {
    const d = new Date(selectedDay + 'T00:00:00');
    return isNaN(d.getTime())
      ? { year: new Date().getFullYear(), month: new Date().getMonth() }
      : { year: d.getFullYear(), month: d.getMonth() };
  });

  const activeSet = new Set(activeDates);
  const today = todayStr();

  // 7 days of the selected week (Sunday to Saturday)
  const getWeekDays = (dateStr: string) => {
    try {
      const d = new Date(dateStr + 'T00:00:00');
      const dow = d.getDay(); // 0=Sun
      const days = [];
      for (let i = -dow; i < 7 - dow; i++) {
        const nd = new Date(d);
        nd.setDate(d.getDate() + i);
        days.push(nd.toISOString().slice(0, 10));
      }
      return days;
    } catch {
      return [dateStr];
    }
  };
  const weekDays = getWeekDays(selectedDay);

  // Month navigation & days
  const { year, month } = calMonth;
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const calCells: (string | null)[] = Array(firstDay).fill(null);
  for (let d = 1; d <= daysInMonth; d++) {
    calCells.push(`${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  }

  const shiftDay = (delta: number) => {
    try {
      const d = new Date(selectedDay + 'T00:00:00');
      d.setDate(d.getDate() + delta);
      const nextStr = d.toISOString().slice(0, 10);
      onSelectDay(nextStr);
    } catch {}
  };

  const formattedSelected = formatDateLabel(selectedDay);

  return (
    <>
      {/* ── Top Samsung Health Date Navigation Pill ─────────────────────── */}
      <View style={styles.navRow}>
        <TouchableOpacity
          onPress={() => shiftDay(-1)}
          style={styles.navArrowBtn}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={20} color={C.text} />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => onSelectDay(today)}
          style={[styles.navPill, selectedDay === today && styles.navPillToday]}
          activeOpacity={0.8}
        >
          <Text style={[styles.navPillTxt, selectedDay === today && styles.navPillTxtToday]}>
            {selectedDay === today ? 'Today' : formattedSelected}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => shiftDay(1)}
          style={styles.navArrowBtn}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-forward" size={20} color={C.text} />
        </TouchableOpacity>

        {/* Full Calendar Toggle */}
        <TouchableOpacity
          onPress={() => setShowFullCal(!showFullCal)}
          style={[styles.calToggleBtn, showFullCal && { backgroundColor: C.accent }]}
          activeOpacity={0.8}
        >
          <Ionicons
            name={showFullCal ? 'calendar' : 'calendar-outline'}
            size={18}
            color={showFullCal ? '#fff' : C.accent}
          />
        </TouchableOpacity>
      </View>

      {/* ── Week Strip (Samsung Health style) ────────────────────────────── */}
      {!showFullCal && (
        <Card accent={C.accent}>
          <View style={{ paddingVertical: 14, paddingHorizontal: 8 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' }}>
              {DAY_LABELS.map((lbl, i) => {
                const dayDate = weekDays[i];
                if (!dayDate) return null;
                const isSel = dayDate === selectedDay;
                const isToday = dayDate === today;
                const isActive = activeSet.has(dayDate);
                const dayNum = parseInt(dayDate.slice(8), 10);

                return (
                  <TouchableOpacity
                    key={dayDate}
                    onPress={() => onSelectDay(dayDate)}
                    activeOpacity={0.8}
                    style={[styles.weekDayCol, isSel && styles.weekDayColSel]}
                  >
                    {/* Day name (S in red for Sunday) */}
                    <Text style={[styles.weekDayLbl, i === 0 && { color: C.red }, isSel && { color: '#fff', fontWeight: '800' }]}>
                      {lbl}
                    </Text>

                    {/* Glowing ring/icon indicator */}
                    <View style={[
                      styles.photoRing,
                      isActive && [styles.photoRingActive, { borderColor: activeColor, backgroundColor: activeColor + '22' }],
                      isSel && isActive && { borderColor: '#fff' },
                    ]}>
                      {isActive ? (
                        <Ionicons name={activeIcon} size={12} color={isSel ? '#fff' : activeColor} />
                      ) : (
                        <View style={[styles.photoEmptyDot, isToday && { backgroundColor: C.accent }]} />
                      )}
                    </View>

                    {/* Day number */}
                    <Text style={[styles.weekDayNum, isSel && { color: '#fff', fontWeight: '800' }, isToday && !isSel && { color: C.accent }]}>
                      {dayNum}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </Card>
      )}

      {/* ── Full Calendar (Samsung Health Month Grid) ────────────────────── */}
      {showFullCal && (
        <Card accent={C.accent}>
          <View style={{ padding: 14 }}>
            {/* Month Nav Header */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <TouchableOpacity onPress={() => {
                const m = month === 0 ? 11 : month - 1;
                const y = month === 0 ? year - 1 : year;
                setCalMonth({ year: y, month: m });
              }} style={styles.navArrowBtn}>
                <Ionicons name="chevron-back" size={20} color={C.text} />
              </TouchableOpacity>
              <Text style={{ fontSize: 16, fontWeight: '800', color: C.text }}>
                {MONTHS[month]} {year}
              </Text>
              <TouchableOpacity onPress={() => {
                const m = month === 11 ? 0 : month + 1;
                const y = month === 11 ? year + 1 : year;
                setCalMonth({ year: y, month: m });
              }} style={styles.navArrowBtn}>
                <Ionicons name="chevron-forward" size={20} color={C.text} />
              </TouchableOpacity>
            </View>

            {/* Target achieved stats row */}
            <View style={styles.monthStatsRow}>
              <Ionicons name="sparkles" size={14} color={activeColor} style={{ marginRight: 6 }} />
              <Text style={{ fontSize: 12, fontWeight: '700', color: C.text }}>
                {targetText}
              </Text>
            </View>

            {/* Day Header Row */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginBottom: 8 }}>
              {DAY_LABELS.map((l, i) => (
                <Text key={i} style={{ width: 36, textAlign: 'center', fontSize: 11, color: i === 0 ? C.red : C.muted, fontWeight: '700' }}>
                  {l}
                </Text>
              ))}
            </View>

            {/* Days Grid */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {calCells.map((cell, i) => {
                if (!cell) {
                  return <View key={`empty-${i}`} style={styles.calCellEmpty} />;
                }
                const isSel = cell === selectedDay;
                const isToday = cell === today;
                const isActive = activeSet.has(cell);
                const dayNum = parseInt(cell.slice(8), 10);

                return (
                  <TouchableOpacity
                    key={cell}
                    onPress={() => onSelectDay(cell)}
                    activeOpacity={0.75}
                    style={[
                      styles.calCell,
                      isSel && styles.calCellSel,
                      isToday && !isSel && { borderColor: C.accent, borderWidth: 1.5 },
                    ]}
                  >
                    {isActive && (
                      <View style={[styles.calPhotoDot, { backgroundColor: activeColor }, isSel && { backgroundColor: '#fff' }]} />
                    )}
                    <Text style={[
                      styles.calCellNum,
                      isSel && { color: '#fff', fontWeight: '800' },
                      isToday && !isSel && { color: C.accent, fontWeight: '800' },
                    ]}>
                      {dayNum}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </Card>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// NUTRITION TAB (Calendar + Daily Results + Macros + History + Trends)
// ─────────────────────────────────────────────────────────────────────────────
function NutritionTab({
  C,
  isDark,
  styles,
  selectedDay,
  setSelectedDay,
  dayDailyLog,
  dayFoods,
  dayWater,
  nutritionDates,
  goals,
  logs,
}: {
  C: any;
  isDark: boolean;
  styles: any;
  selectedDay: string;
  setSelectedDay: (d: string) => void;
  dayDailyLog: DailyLog | null;
  dayFoods: FoodEntry[];
  dayWater: WaterEntry[];
  nutritionDates: string[];
  goals: Goals | null;
  logs: DailyLog[];
}) {
  const today = todayStr();
  const isToday = selectedDay === today;
  const formattedSelected = formatDateLabel(selectedDay);

  const calIntake = dayDailyLog?.calorie_intake || 0;
  const calGoal = goals?.calorie_goal || 2500;
  const calPct = calGoal > 0 ? Math.min(calIntake / calGoal, 1) : 0;

  const protIntake = dayDailyLog?.protein_intake || 0;
  const protGoal = goals?.protein_goal || 120;
  const protPct = protGoal > 0 ? Math.min(protIntake / protGoal, 1) : 0;

  const waterIntake = dayDailyLog?.water_intake || 0;
  const waterGoal = goals?.water_goal || 3.0;
  const waterPct = waterGoal > 0 ? Math.min(waterIntake / waterGoal, 1) : 0;

  const creatineTaken = !!dayDailyLog?.creatine_taken;
  const hasNutrition = calIntake > 0 || protIntake > 0 || waterIntake > 0 || dayFoods.length > 0 || dayWater.length > 0 || creatineTaken;

  return (
    <>
      {/* ── Samsung Health Calendar / Week Strip Navigation ── */}
      <DayCalendarNav
        C={C}
        isDark={isDark}
        styles={styles}
        selectedDay={selectedDay}
        onSelectDay={setSelectedDay}
        activeDates={nutritionDates}
        activeColor={C.protein}
        activeIcon="restaurant"
        targetText={`Target: ${nutritionDates.length} nutrition days recorded`}
      />

      {/* ── Selected Day Header ── */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, marginBottom: 10, paddingHorizontal: 4 }}>
        <View style={{ flex: 1, paddingRight: 8 }}>
          <Text style={{ fontSize: 18, fontWeight: '800', color: C.text }}>
            {isToday ? "Today's Nutrition" : formattedSelected}
          </Text>
          <Text style={{ fontSize: 12, color: C.muted, fontWeight: '600', marginTop: 2 }}>
            {hasNutrition
              ? `${calIntake} kcal · ${protIntake}g protein · ${waterIntake.toFixed(1)}L water`
              : 'No nutrition logged for this date'}
          </Text>
        </View>

        <View style={[
          styles.statusBadge,
          {
            backgroundColor: hasNutrition
              ? (protPct >= 1 && waterPct >= 1 ? C.green + '22' : C.protein + '22')
              : (isDark ? C.card : '#E8ECF0'),
            borderColor: hasNutrition
              ? (protPct >= 1 && waterPct >= 1 ? C.green : C.protein)
              : C.border,
            borderWidth: 1,
          }
        ]}>
          <Text style={{
            fontSize: 11,
            fontWeight: '800',
            color: hasNutrition
              ? (protPct >= 1 && waterPct >= 1 ? C.green : C.protein)
              : C.muted,
          }}>
            {hasNutrition
              ? (protPct >= 1 && waterPct >= 1 ? 'Goals Met 🎉' : `${Math.round(((calPct + protPct + waterPct) / 3) * 100)}% Goals`)
              : 'No Data'}
          </Text>
        </View>
      </View>

      {/* ── Daily Nutrition Results ── */}
      {hasNutrition ? (
        <View style={{ marginBottom: 12 }}>
          {/* Macro Cards Grid */}
          <Card accent={C.protein}>
            <View style={{ padding: 16 }}>
              {/* Calories Progress Row */}
              <View style={{ marginBottom: 14 }}>
                <View style={styles.consRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Ionicons name="flame" size={18} color={C.calories} style={{ marginRight: 6 }} />
                    <Text style={styles.consLabel}>Calories</Text>
                  </View>
                  <Text style={[styles.consPct, { color: C.calories }]}>
                    {calIntake.toLocaleString()} / {calGoal.toLocaleString()} kcal ({Math.round(calPct * 100)}%)
                  </Text>
                </View>
                <ProgressBar value={calPct} color={C.calories} height={8} />
              </View>

              {/* Protein Progress Row */}
              <View style={{ marginBottom: 14 }}>
                <View style={styles.consRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Ionicons name="restaurant" size={18} color={C.protein} style={{ marginRight: 6 }} />
                    <Text style={styles.consLabel}>Protein</Text>
                  </View>
                  <Text style={[styles.consPct, { color: C.protein }]}>
                    {protIntake} / {protGoal} g ({Math.round(protPct * 100)}%)
                  </Text>
                </View>
                <ProgressBar value={protPct} color={C.protein} height={8} />
              </View>

              {/* Water Progress Row */}
              <View style={{ marginBottom: 14 }}>
                <View style={styles.consRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Ionicons name="water" size={18} color={C.water} style={{ marginRight: 6 }} />
                    <Text style={styles.consLabel}>Water Intake</Text>
                  </View>
                  <Text style={[styles.consPct, { color: C.water }]}>
                    {waterIntake.toFixed(2)} / {waterGoal.toFixed(1)} L ({Math.round(waterPct * 100)}%)
                  </Text>
                </View>
                <ProgressBar value={waterPct} color={C.water} height={8} />
              </View>

              {/* Creatine Row */}
              <View style={styles.creatineRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Ionicons name="flash" size={18} color={creatineTaken ? C.green : C.muted} style={{ marginRight: 6 }} />
                  <Text style={[styles.consLabel, { color: creatineTaken ? C.text : C.muted }]}>
                    Creatine Intake
                  </Text>
                </View>
                <View style={[
                  styles.statusBadge,
                  {
                    backgroundColor: creatineTaken ? C.green + '22' : (isDark ? C.card : '#E8ECF0'),
                    borderColor: creatineTaken ? C.green : C.border,
                    borderWidth: 1,
                  }
                ]}>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: creatineTaken ? C.green : C.muted }}>
                    {creatineTaken ? 'Taken ✓' : 'Not Taken'}
                  </Text>
                </View>
              </View>
            </View>
          </Card>

          {/* Meals & Foods Logged for that day */}
          {dayFoods.length > 0 && (
            <View style={{ marginTop: 12 }}>
              <SectionHeader title={`Meals Logged (${dayFoods.length})`} />
              <Card accent={C.protein}>
                <View style={{ padding: 14 }}>
                  {dayFoods.map((f: FoodEntry, i: number) => (
                    <View key={f.id || i} style={styles.foodItemRow}>
                      <View style={{ flex: 1, marginRight: 8 }}>
                        <Text style={{ fontSize: 14, fontWeight: '700', color: C.text }}>{f.food_name}</Text>
                        <Text style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                          {f.protein}g protein · {f.calories} kcal
                        </Text>
                      </View>
                      <View style={{ flexDirection: 'row', gap: 6 }}>
                        <View style={[styles.pillBadge, { backgroundColor: C.calories + '22', borderColor: C.calories + '55' }]}>
                          <Text style={{ fontSize: 11, fontWeight: '800', color: C.calories }}>{f.calories} kcal</Text>
                        </View>
                        <View style={[styles.pillBadge, { backgroundColor: C.protein + '22', borderColor: C.protein + '55' }]}>
                          <Text style={{ fontSize: 11, fontWeight: '800', color: C.protein }}>{f.protein}g</Text>
                        </View>
                      </View>
                    </View>
                  ))}
                </View>
              </Card>
            </View>
          )}

          {/* Water Log entries for that day */}
          {dayWater.length > 0 && (
            <View style={{ marginTop: 12 }}>
              <SectionHeader title={`Water Log (${dayWater.length} entries)`} />
              <Card accent={C.water}>
                <View style={{ padding: 14 }}>
                  {dayWater.map((w: WaterEntry, i: number) => (
                    <View key={w.id || i} style={styles.foodItemRow}>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Ionicons name="water-outline" size={16} color={C.water} style={{ marginRight: 8 }} />
                        <Text style={{ fontSize: 14, fontWeight: '700', color: C.text }}>+{w.amount_ml} ml</Text>
                      </View>
                      <Text style={{ fontSize: 11, color: C.muted }}>
                        {w.logged_at ? w.logged_at.slice(11, 16) : ''}
                      </Text>
                    </View>
                  ))}
                </View>
              </Card>
            </View>
          )}
        </View>
      ) : (
        <Card accent={C.protein}>
          <View style={{ padding: 28, alignItems: 'center' }}>
            <View style={[styles.emptyCameraCircle, { backgroundColor: C.protein + '22', borderColor: C.protein + '44' }]}>
              <Ionicons name="restaurant-outline" size={32} color={C.protein} />
            </View>
            <Text style={{ color: C.text, fontWeight: '700', fontSize: 15, marginTop: 12 }}>
              No Nutrition Logged for this Day
            </Text>
            <Text style={{ color: C.muted, marginTop: 4, textAlign: 'center', fontSize: 12, paddingHorizontal: 20 }}>
              Track your calories, protein, and water in the Daily Tracker to see your full breakdown here.
            </Text>
          </View>
        </Card>
      )}

      {/* ── All Recorded Nutrition Days List ──────────────────────────────── */}
      {nutritionDates.length > 0 && (
        <View style={{ marginTop: 14 }}>
          <SectionHeader title="All Nutrition Days" />
          <Card accent={C.protein}>
            <View style={{ padding: 12 }}>
              {nutritionDates.slice().reverse().map((d: string) => {
                const isCur = d === selectedDay;
                const dLog = getDailyLogForDate(d);
                const cal = dLog?.calorie_intake || 0;
                const prot = dLog?.protein_intake || 0;
                const wat = dLog?.water_intake || 0;

                return (
                  <TouchableOpacity
                    key={d}
                    onPress={() => setSelectedDay(d)}
                    style={[styles.historyRow, isCur && { backgroundColor: C.accentDim + '33', borderRadius: 10 }]}
                    activeOpacity={0.8}
                  >
                    <View style={[styles.historyDot, { backgroundColor: isCur ? C.accent : C.protein }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.historyDateTxt, isCur && { color: C.accent, fontWeight: '800' }]}>
                        {d === today ? `Today (${d})` : d}
                      </Text>
                      <Text style={{ fontSize: 11, color: C.muted }}>
                        {cal} kcal · {prot}g protein · {wat.toFixed(1)}L water
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={C.muted} />
                  </TouchableOpacity>
                );
              })}
            </View>
          </Card>
        </View>
      )}

      {/* ── 30-Day Macro Trends ─────────────────────────────────────────── */}
      <View style={{ marginTop: 16 }}>
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
                tickFormat={(_, i: number) => {
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
                data={logs.map((l: DailyLog, i: number) => ({
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
            {logs.filter((l: DailyLog) => l.protein_intake > 0).length > 0 && goals && (
              <View style={{ padding: 16 }}>
                {[
                  { label: 'Avg Protein', val: `${Math.round(logs.reduce((s: number, l: DailyLog) => s + (l.protein_intake||0), 0) / logs.length)} g`, color: C.protein },
                  { label: 'Avg Calories', val: `${Math.round(logs.reduce((s: number, l: DailyLog) => s + (l.calorie_intake||0), 0) / logs.length)} kcal`, color: C.calories },
                  { label: 'Avg Water', val: `${(logs.reduce((s: number, l: DailyLog) => s + (l.water_intake||0), 0) / logs.length).toFixed(2)} L`, color: C.water },
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
            <View style={{ padding: 24, alignItems: 'center' }}>
              <Ionicons name="restaurant-outline" size={32} color={C.muted} />
              <Text style={{ color: C.muted, marginTop: 8, textAlign: 'center', fontSize: 13 }}>
                Log food in the Tracker to see 30-day nutrition charts
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
                tickFormat={(_, i: number) => {
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
                data={logs.map((l: DailyLog, i: number) => ({ x: i + 1, y: l.calorie_intake || 0 }))}
                style={{ data: { fill: C.calories + '22', stroke: C.calories, strokeWidth: 2 } }}
                interpolation="monotoneX"
              />
            </VictoryChart>
          </Card>
        ) : null}
      </View>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// WORKOUTS TAB (Calendar + Daily Results + Exercises + Anatomy + History + Trends)
// ─────────────────────────────────────────────────────────────────────────────
function WorkoutsTab({
  C,
  isDark,
  styles,
  selectedDay,
  setSelectedDay,
  daySessions,
  dayExercises,
  dayDailyLog,
  workoutDates,
  allPRs,
  logs,
}: {
  C: any;
  isDark: boolean;
  styles: any;
  selectedDay: string;
  setSelectedDay: (d: string) => void;
  daySessions: WorkoutSession[];
  dayExercises: ExerciseLog[];
  dayDailyLog: DailyLog | null;
  workoutDates: string[];
  allPRs: any[];
  logs: DailyLog[];
}) {
  const today = todayStr();
  const isToday = selectedDay === today;
  const formattedSelected = formatDateLabel(selectedDay);

  const isCompleted = !!dayDailyLog?.workout_completed || daySessions.length > 0 || dayExercises.length > 0;
  const totalSets = dayExercises.reduce((sum: number, e: ExerciseLog) => sum + (e.sets || 0), 0);
  const totalVolume = dayExercises.reduce((sum: number, e: ExerciseLog) => sum + ((e.weight || 0) * (e.reps || 0) * (e.sets || 1)), 0);

  // Collect muscle groups hit on that day
  const uniqueMgs = Array.from(new Set([
    ...daySessions.flatMap((s: WorkoutSession) => (s.muscle_groups || '').split(',').map((m: string) => m.trim()).filter(Boolean)),
    ...dayExercises.map((e: ExerciseLog) => e.muscle_group).filter(Boolean),
  ]));

  // Heatmap mapping for BodyAnatomy
  const setCountsMap: Record<string, number> = {};
  for (const ex of dayExercises) {
    if (ex.muscle_group) {
      setCountsMap[ex.muscle_group] = (setCountsMap[ex.muscle_group] || 0) + (ex.sets || 1);
    }
  }
  if (Object.keys(setCountsMap).length === 0 && uniqueMgs.length > 0) {
    for (const mg of uniqueMgs) {
      setCountsMap[mg] = 1;
    }
  }

  return (
    <>
      {/* ── Samsung Health Calendar / Week Strip Navigation ── */}
      <DayCalendarNav
        C={C}
        isDark={isDark}
        styles={styles}
        selectedDay={selectedDay}
        onSelectDay={setSelectedDay}
        activeDates={workoutDates}
        activeColor={C.purple}
        activeIcon="barbell"
        targetText={`Target: ${workoutDates.length} workout days recorded`}
      />

      {/* ── Selected Day Header ── */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, marginBottom: 10, paddingHorizontal: 4 }}>
        <View style={{ flex: 1, paddingRight: 8 }}>
          <Text style={{ fontSize: 18, fontWeight: '800', color: C.text }}>
            {isToday ? "Today's Workouts" : formattedSelected}
          </Text>
          <Text style={{ fontSize: 12, color: C.muted, fontWeight: '600', marginTop: 2 }}>
            {isCompleted
              ? `${daySessions.length} session${daySessions.length !== 1 ? 's' : ''} · ${dayExercises.length} exercise${dayExercises.length !== 1 ? 's' : ''}`
              : 'Rest Day / No exercises recorded'}
          </Text>
        </View>

        <View style={[
          styles.statusBadge,
          {
            backgroundColor: isCompleted ? C.green + '22' : (isDark ? C.card : '#E8ECF0'),
            borderColor: isCompleted ? C.green : C.border,
            borderWidth: 1,
          }
        ]}>
          <Text style={{
            fontSize: 11,
            fontWeight: '800',
            color: isCompleted ? C.green : C.muted,
          }}>
            {isCompleted ? 'Completed ✓' : 'Rest Day'}
          </Text>
        </View>
      </View>

      {/* ── Daily Workout Results ── */}
      {isCompleted ? (
        <View style={{ marginBottom: 12 }}>
          {/* Quick Metrics Grid */}
          <View style={styles.statsGrid}>
            <View style={styles.statBox}>
              <Ionicons name="barbell" size={24} color={C.purple} style={{ marginBottom: 2 }} />
              <Text style={[styles.statNum, { color: C.purple, fontSize: 22 }]}>
                {daySessions.length || 1}
              </Text>
              <Text style={styles.statLbl}>Sessions</Text>
            </View>

            <View style={styles.statBox}>
              <Ionicons name="layers" size={24} color={C.water} style={{ marginBottom: 2 }} />
              <Text style={[styles.statNum, { color: C.water, fontSize: 22 }]}>
                {totalSets}
              </Text>
              <Text style={styles.statLbl}>Total Sets</Text>
            </View>

            <View style={styles.statBox}>
              <Ionicons name="speedometer" size={24} color={C.calories} style={{ marginBottom: 2 }} />
              <Text style={[styles.statNum, { color: C.calories, fontSize: 22 }]}>
                {Math.round(totalVolume)}
              </Text>
              <Text style={styles.statLbl}>Volume (kg)</Text>
            </View>

            <View style={styles.statBox}>
              <Ionicons name="fitness" size={24} color={C.green} style={{ marginBottom: 2 }} />
              <Text style={[styles.statNum, { color: C.green, fontSize: 22 }]}>
                {uniqueMgs.length}
              </Text>
              <Text style={styles.statLbl}>Muscles Hit</Text>
            </View>
          </View>

          {/* Sessions & Exercises Breakdown */}
          {daySessions.length > 0 ? (
            daySessions.map((session: WorkoutSession) => {
              const sessionExs = dayExercises.filter((e: ExerciseLog) => e.session_id === session.id);
              const mgs = (session.muscle_groups || '').split(',').map((m: string) => m.trim()).filter(Boolean);

              return (
                <View key={session.id} style={{ marginBottom: 12 }}>
                  <Card accent={C.purple}>
                    <View style={{ padding: 14 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, flex: 1 }}>
                          {mgs.map((g: string) => (
                            <MuscleTag key={g} name={g} />
                          ))}
                        </View>
                        {session.duration_minutes ? (
                          <Text style={{ fontSize: 11, color: C.muted, fontWeight: '700' }}>
                            {session.duration_minutes} mins
                          </Text>
                        ) : null}
                      </View>

                      {session.notes ? (
                        <Text style={{ fontSize: 12, color: C.textSub, fontStyle: 'italic', marginBottom: 8 }}>
                          "{session.notes}"
                        </Text>
                      ) : null}

                      {sessionExs.length > 0 ? (
                        <View style={{ marginTop: 4 }}>
                          {sessionExs.map((ex: ExerciseLog) => {
                            const isPR = allPRs.some(
                              (p: any) => p.exercise_name === ex.exercise_name &&
                                         p.record_date === selectedDay &&
                                         p.weight === ex.weight
                            );
                            const mgColor = C.mg[ex.muscle_group] || C.accent;

                            return (
                              <View key={ex.id} style={styles.exItemRow}>
                                <View style={{ flex: 1 }}>
                                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                    <View style={[styles.exDot, { backgroundColor: mgColor }]} />
                                    <Text style={{ fontSize: 14, fontWeight: '700', color: C.text }}>
                                      {ex.exercise_name}
                                    </Text>
                                    {isPR && (
                                      <View style={styles.prBadge}>
                                        <Text style={{ color: '#FF5722', fontSize: 10, fontWeight: '800' }}>🔥 PR</Text>
                                      </View>
                                    )}
                                  </View>
                                  <Text style={{ fontSize: 11, color: C.muted, marginLeft: 12, marginTop: 2 }}>
                                    {ex.muscle_group}
                                  </Text>
                                </View>
                                <Text style={{ fontSize: 13, fontWeight: '800', color: C.text }}>
                                  {ex.sets} × {ex.reps} @ {ex.weight}{ex.unit}
                                </Text>
                              </View>
                            );
                          })}
                        </View>
                      ) : (
                        <Text style={{ fontSize: 12, color: C.muted }}>No individual exercises logged for this session.</Text>
                      )}
                    </View>
                  </Card>
                </View>
              );
            })
          ) : dayExercises.length > 0 ? (
            <Card accent={C.purple}>
              <View style={{ padding: 14 }}>
                <Text style={{ fontSize: 14, fontWeight: '800', color: C.text, marginBottom: 8 }}>
                  Exercises Performed ({dayExercises.length})
                </Text>
                {dayExercises.map((ex: ExerciseLog) => {
                  const mgColor = C.mg[ex.muscle_group] || C.accent;
                  return (
                    <View key={ex.id} style={styles.exItemRow}>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <View style={[styles.exDot, { backgroundColor: mgColor }]} />
                          <Text style={{ fontSize: 14, fontWeight: '700', color: C.text }}>{ex.exercise_name}</Text>
                        </View>
                        <Text style={{ fontSize: 11, color: C.muted, marginLeft: 12, marginTop: 2 }}>{ex.muscle_group}</Text>
                      </View>
                      <Text style={{ fontSize: 13, fontWeight: '800', color: C.text }}>
                        {ex.sets} × {ex.reps} @ {ex.weight}{ex.unit}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </Card>
          ) : (
            <Card accent={C.green}>
              <View style={{ padding: 16, alignItems: 'center' }}>
                <Ionicons name="checkmark-circle" size={32} color={C.green} />
                <Text style={{ fontSize: 15, fontWeight: '800', color: C.text, marginTop: 6 }}>
                  Workout Completed
                </Text>
                <Text style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
                  Marked as complete in Daily Tracker.
                </Text>
              </View>
            </Card>
          )}

          {/* Muscle Anatomy Heatmap for this Day */}
          {Object.keys(setCountsMap).length > 0 && (
            <View style={{ marginTop: 12 }}>
              <SectionHeader title="Targeted Muscles Heatmap" />
              <Card accent={C.accent}>
                <View style={{ padding: 12 }}>
                  <BodyAnatomy muscleSetCounts={setCountsMap} showToggle={true} />
                </View>
              </Card>
            </View>
          )}
        </View>
      ) : (
        <Card accent={C.purple}>
          <View style={{ padding: 28, alignItems: 'center' }}>
            <View style={[styles.emptyCameraCircle, { backgroundColor: C.purple + '22', borderColor: C.purple + '44' }]}>
              <Ionicons name="barbell-outline" size={32} color={C.purple} />
            </View>
            <Text style={{ color: C.text, fontWeight: '700', fontSize: 15, marginTop: 12 }}>
              No Workouts Logged for this Day
            </Text>
            <Text style={{ color: C.muted, marginTop: 4, textAlign: 'center', fontSize: 12, paddingHorizontal: 20 }}>
              Rest day or no exercises recorded. Log your workouts in the Workouts tab to see your daily breakdown here.
            </Text>
          </View>
        </Card>
      )}

      {/* ── All Recorded Workout Days List ──────────────────────────────── */}
      {workoutDates.length > 0 && (
        <View style={{ marginTop: 14 }}>
          <SectionHeader title="All Workout Days" />
          <Card accent={C.purple}>
            <View style={{ padding: 12 }}>
              {workoutDates.slice().reverse().map((d: string) => {
                const isCur = d === selectedDay;
                const dSessions = getWorkoutSessionsForDate(d);
                const dExs = getExerciseLogsForDate(d);
                const mgs = Array.from(new Set([
                  ...dSessions.flatMap((s: WorkoutSession) => (s.muscle_groups || '').split(',').map((m: string) => m.trim()).filter(Boolean)),
                  ...dExs.map((e: ExerciseLog) => e.muscle_group).filter(Boolean)
                ]));

                return (
                  <TouchableOpacity
                    key={d}
                    onPress={() => setSelectedDay(d)}
                    style={[styles.historyRow, isCur && { backgroundColor: C.accentDim + '33', borderRadius: 10 }]}
                    activeOpacity={0.8}
                  >
                    <View style={[styles.historyDot, { backgroundColor: isCur ? C.accent : C.purple }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.historyDateTxt, isCur && { color: C.accent, fontWeight: '800' }]}>
                        {d === today ? `Today (${d})` : d}
                      </Text>
                      <Text style={{ fontSize: 11, color: C.muted }}>
                        {mgs.length > 0 ? mgs.slice(0, 3).join(', ') : 'Workout Completed'}
                        {dExs.length > 0 ? ` · ${dExs.length} exercise${dExs.length !== 1 ? 's' : ''}` : ''}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={C.muted} />
                  </TouchableOpacity>
                );
              })}
            </View>
          </Card>
        </View>
      )}

      {/* ── 30-Day Completion Rate Chart ─────────────────────────────────── */}
      <View style={{ marginTop: 16 }}>
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
                tickFormat={(_, i: number) => {
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
                data={logs.map((l: DailyLog, i: number) => ({
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
                { label: 'Workouts completed', val: String(logs.filter((l: DailyLog) => l.workout_completed).length), color: C.purple },
                { label: 'Days tracked', val: String(logs.length), color: C.muted },
                {
                  label: 'Completion rate',
                  val: logs.length ? `${Math.round(logs.filter((l: DailyLog) => l.workout_completed).length / logs.length * 100)}%` : '0%',
                  color: C.green,
                },
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
            <View style={{ padding: 24, alignItems: 'center' }}>
              <Ionicons name="barbell-outline" size={32} color={C.muted} />
              <Text style={{ color: C.muted, marginTop: 8, textAlign: 'center', fontSize: 13 }}>
                Log workouts to see completion charts
              </Text>
            </View>
          </Card>
        )}
      </View>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PROGRESS TAB (Calendar + Daily Photos + Modal + History)
// ─────────────────────────────────────────────────────────────────────────────
function ProgressTab({
  C,
  isDark,
  styles,
  selectedDay,
  setSelectedDay,
  dayPhotos,
  photoDates,
  pickPhoto,
  openDayModal,
}: any) {
  const today = todayStr();
  const formattedSelected = formatDateLabel(selectedDay);

  return (
    <>
      {/* ── Samsung Health Calendar / Week Strip Navigation ── */}
      <DayCalendarNav
        C={C}
        isDark={isDark}
        styles={styles}
        selectedDay={selectedDay}
        onSelectDay={setSelectedDay}
        activeDates={photoDates}
        activeColor={C.green}
        activeIcon="camera"
        targetText={`Target: ${photoDates.length} progress days recorded`}
      />

      {/* ── Selected Day Header & Add Photo Button ───────────────────────── */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, marginBottom: 10, paddingHorizontal: 4 }}>
        <View>
          <Text style={{ fontSize: 18, fontWeight: '800', color: C.text }}>
            {selectedDay === today ? "Today's Progress" : formattedSelected}
          </Text>
          <Text style={{ fontSize: 12, color: C.muted, fontWeight: '600', marginTop: 2 }}>
            {dayPhotos.length} {dayPhotos.length === 1 ? 'photo' : 'photos'} saved
          </Text>
        </View>

        <TouchableOpacity onPress={pickPhoto} style={styles.addPhotoBtn} activeOpacity={0.85}>
          <Ionicons name="camera" size={16} color="#fff" />
          <Text style={styles.addPhotoBtnTxt}>Add Photo</Text>
        </TouchableOpacity>
      </View>

      {/* ── Horizontal Scrolling Photos Strip ────────────────────────────── */}
      {dayPhotos.length > 0 ? (
        <View style={{ marginBottom: 16 }}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            decelerationRate="fast"
            contentContainerStyle={{ gap: 12, paddingHorizontal: 4, paddingVertical: 6 }}
          >
            {dayPhotos.map((photo: ProgressPhoto, idx: number) => (
              <TouchableOpacity
                key={photo.id}
                onPress={() => openDayModal(photo.photo_date, idx)}
                activeOpacity={0.88}
                style={styles.photoCard}
              >
                <Image
                  source={{ uri: photo.uri }}
                  style={styles.photoCardImg}
                  resizeMode="cover"
                />
                {/* Number Badge */}
                <View style={styles.photoIndexBadge}>
                  <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>#{idx + 1}</Text>
                </View>
                {/* Bottom Overlay with Expand Hint */}
                <View style={styles.photoExpandOverlay}>
                  <Ionicons name="expand-outline" size={14} color="#fff" />
                  <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700', marginLeft: 4 }}>Expand</Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Quick full-screen review button */}
          <TouchableOpacity
            onPress={() => openDayModal(selectedDay, 0)}
            style={styles.viewFullBtn}
            activeOpacity={0.85}
          >
            <Ionicons name="images-outline" size={16} color={C.accent} />
            <Text style={[styles.viewFullBtnTxt, { color: C.accent }]}>
              View All {dayPhotos.length} Photos in Fullscreen
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <Card accent={C.accent}>
          <View style={{ padding: 28, alignItems: 'center' }}>
            <View style={styles.emptyCameraCircle}>
              <Ionicons name="camera-outline" size={32} color={C.accent} />
            </View>
            <Text style={{ color: C.text, fontWeight: '700', fontSize: 15, marginTop: 12 }}>
              No Progress Photos for this Day
            </Text>
            <Text style={{ color: C.muted, marginTop: 4, textAlign: 'center', fontSize: 12, paddingHorizontal: 20 }}>
              Track your muscle definition and gym transformation by capturing daily progress photos.
            </Text>
            <TouchableOpacity onPress={pickPhoto} style={[styles.addPhotoBtn, { marginTop: 14 }]} activeOpacity={0.85}>
              <Ionicons name="camera" size={16} color="#fff" />
              <Text style={styles.addPhotoBtnTxt}>Take or Pick Photo</Text>
            </TouchableOpacity>
          </View>
        </Card>
      )}

      {/* ── All Recorded Progress Days List ──────────────────────────────── */}
      {photoDates.length > 0 && (
        <View style={{ marginTop: 12 }}>
          <SectionHeader title="All Progress Days" />
          <Card accent={C.accent}>
            <View style={{ padding: 12 }}>
              {photoDates.slice().reverse().map((d: string) => {
                const count = getProgressPhotos(d).length;
                const isCur = d === selectedDay;
                return (
                  <TouchableOpacity
                    key={d}
                    onPress={() => { setSelectedDay(d); openDayModal(d, 0); }}
                    style={[styles.historyRow, isCur && { backgroundColor: C.accentDim + '33', borderRadius: 10 }]}
                    activeOpacity={0.8}
                  >
                    <View style={[styles.historyDot, { backgroundColor: isCur ? C.accent : C.green }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.historyDateTxt, isCur && { color: C.accent, fontWeight: '800' }]}>
                        {d === today ? `Today (${d})` : d}
                      </Text>
                      <Text style={{ fontSize: 11, color: C.muted }}>
                        {count} photo{count !== 1 ? 's' : ''} stored
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={C.muted} />
                  </TouchableOpacity>
                );
              })}
            </View>
          </Card>
        </View>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────────────────────────────────────
function makeStyles(C: any, isDark: boolean) {
  return StyleSheet.create({
    safe:          { flex: 1, backgroundColor: C.bg },
    header:        { paddingHorizontal: 16, paddingVertical: 14, backgroundColor: C.bg, borderBottomWidth: 1, borderBottomColor: C.border },
    headerTitle:   { fontSize: 22, fontWeight: '800', color: C.text },
    tabBar:        { flexDirection: 'row', backgroundColor: C.bg, borderBottomWidth: 1, borderBottomColor: C.border },
    tabBtn:        { flex: 1, paddingVertical: 12, alignItems: 'center' },
    tabActive:     { borderBottomWidth: 2, borderBottomColor: C.accent },
    tabText:       { fontSize: 12, color: C.muted, fontWeight: '700' },
    tabTextActive: { color: C.accent },
    scroll:        { padding: 16, paddingBottom: 40 },
    section:       { padding: 16 },
    statsGrid:     { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
    statBox:       { flex: 1, minWidth: '45%', backgroundColor: C.card, borderRadius: 16, alignItems: 'center', padding: 16, shadowColor: '#BFC8D6', shadowOffset: { width: 5, height: 5 }, shadowOpacity: 0.9, shadowRadius: 10, elevation: 6 },
    statNum:       { fontSize: 28, fontWeight: '800', marginTop: 4 },
    statLbl:       { fontSize: 11, color: C.muted, marginTop: 2, textAlign: 'center' },
    consRow:       { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
    consLabel:     { fontSize: 13, color: C.textSub, fontWeight: '600' },
    consPct:       { fontSize: 13, fontWeight: '700' },
    avgRow:        { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.border },
    avgLabel:      { fontSize: 13, color: C.textSub },
    avgVal:        { fontSize: 13, fontWeight: '700' },

    // Samsung Health Style Navigation & Calendar
    navRow:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 12, gap: 10 },
    navArrowBtn:   { width: 34, height: 34, borderRadius: 17, backgroundColor: isDark ? C.card : '#E8ECF0', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border },
    navPill:       { paddingVertical: 8, paddingHorizontal: 22, borderRadius: 20, backgroundColor: isDark ? C.card : '#E8ECF0', borderWidth: 1, borderColor: C.border },
    navPillToday:  { backgroundColor: C.accent, borderColor: C.accent },
    navPillTxt:    { fontSize: 14, fontWeight: '700', color: C.text },
    navPillTxtToday: { color: '#fff' },
    calToggleBtn:  { width: 34, height: 34, borderRadius: 17, backgroundColor: C.accentDim, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border },

    // Week Strip
    weekDayCol:    { alignItems: 'center', paddingVertical: 6, paddingHorizontal: 8, borderRadius: 18 },
    weekDayColSel: { backgroundColor: C.accent },
    weekDayLbl:    { fontSize: 11, fontWeight: '700', color: C.muted, marginBottom: 6 },
    photoRing:     { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'transparent', marginBottom: 4 },
    photoRingActive: { borderColor: C.green, backgroundColor: C.green + '22' },
    photoEmptyDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: isDark ? '#2D3748' : '#CBD5E1' },
    weekDayNum:    { fontSize: 13, fontWeight: '700', color: C.text },

    // Full Calendar Grid
    monthStatsRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: isDark ? C.bg : '#F0F4F8', padding: 8, borderRadius: 10, marginBottom: 10, borderWidth: 1, borderColor: C.border },
    calCell:       { width: '14.28%', height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
    calCellEmpty:  { width: '14.28%', height: 44 },
    calCellSel:    { backgroundColor: C.accent },
    calCellNum:    { fontSize: 13, fontWeight: '600', color: C.text },
    calPhotoDot:   { width: 5, height: 5, borderRadius: 2.5, backgroundColor: C.green, marginBottom: 2 },

    // Action & Photo Cards
    addPhotoBtn:   { flexDirection: 'row', alignItems: 'center', backgroundColor: C.accent, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, gap: 6, elevation: 3 },
    addPhotoBtnTxt:{ color: '#fff', fontWeight: '700', fontSize: 13 },
    photoCard:     { width: 140, height: 185, borderRadius: 16, overflow: 'hidden', backgroundColor: C.card, borderWidth: 1, borderColor: C.border, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 5 },
    photoCardImg:  { width: '100%', height: '100%' },
    photoIndexBadge: { position: 'absolute', top: 8, left: 8, backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
    photoExpandOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.5)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 4 },
    viewFullBtn:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, marginTop: 6, borderRadius: 12, backgroundColor: C.accentDim, borderWidth: 1, borderColor: C.border },
    viewFullBtnTxt:{ fontSize: 13, fontWeight: '700', marginLeft: 6 },
    emptyCameraCircle: { width: 64, height: 64, borderRadius: 32, backgroundColor: C.accentDim, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border },

    // History List
    historyRow:    { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: C.border },
    historyDot:    { width: 10, height: 10, borderRadius: 5, marginRight: 12 },
    historyDateTxt:{ fontSize: 14, fontWeight: '700', color: C.text },

    // Specific Day Details Styling
    statusBadge:   { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, alignSelf: 'center' },
    pillBadge:     { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1 },
    creatineRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 6 },
    foodItemRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border },
    exItemRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border },
    exDot:         { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
    prBadge:       { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FF572222', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, borderWidth: 1, borderColor: '#FF572255', marginLeft: 6 },
  });
}
