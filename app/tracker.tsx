import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  RefreshControl,
  LayoutChangeEvent,
} from 'react-native';

import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  getTodayLog,
  getGoals,
  addWater,
  resetWater,
  addFood,
  getFoodLog,
  deleteFoodEntry,
  logCreatine,
  unlogCreatine,
  updateDailyLog,
  updateStreak,
  todayStr,
  DailyLog,
  Goals,
  FoodEntry,
} from '../db/database';
import { Card, Btn, ProgressBar, Ring, Toggle, PickerModal, SectionHeader } from '../components/ui';
import { useTheme } from '../contexts/ThemeContext';
import { useCustomAlert } from '../contexts/AlertContext';
import { WATER_OPTIONS, FOOD_DB } from '../constants/theme';
import FoodScannerModal from '../components/FoodScannerModal';
import FoodSearchModal from '../components/FoodSearchModal';

export default function TrackerScreen() {
  const { showAlert } = useCustomAlert();

  const { C, isDark } = useTheme();
  const [log, setLog] = useState<DailyLog | null>(null);
  const [goals, setGoals] = useState<Goals | null>(null);
  const [foods, setFoods] = useState<FoodEntry[]>([]);
  const [refresh, setRefresh] = useState(false);
  const [scannerModal, setScannerModal] = useState(false);

  const [waterModal, setWaterModal] = useState(false);
  const [lastWaterAdd, setLastWaterAdd] = useState(0);
  const [foodModal, setFoodModal] = useState(false);

  // Section scroll-to
  const { openSection } = useLocalSearchParams<{ openSection?: string }>();
  const scrollRef = useRef<ScrollView>(null);
  const sectionOffsets = useRef<Record<string, number>>({});

  const load = useCallback(() => {
    setLog(getTodayLog());
    setGoals(getGoals());
    setFoods(getFoodLog());
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      // Scroll to section if openSection param is provided
      if (openSection) {
        setTimeout(() => {
          const key = openSection as string;
          const y = sectionOffsets.current[key];
          if (y !== undefined && scrollRef.current) {
            scrollRef.current.scrollTo({ y, animated: true });
          }
        }, 300);
      }
    }, [load, openSection])
  );

  const onRefresh = () => {
    setRefresh(true);
    load();
    setRefresh(false);
  };

  const styles = makeStyles(C, isDark);

  const handleScannerLogFood = (name: string, protein: number, calories: number) => {
    addFood(name, protein, calories);
    load();
  };

  if (!log || !goals) return null;

  const waterPct = Math.min(log.water_intake / goals.water_goal, 1);
  const proteinPct = Math.min(log.protein_intake / goals.protein_goal, 1);
  const calPct = Math.min(log.calorie_intake / goals.calorie_goal, 1);

  const handleAddWater = (mlStr: string) => {
    const ml = parseInt(mlStr, 10);
    if (!ml || isNaN(ml)) return;
    addWater(ml);
    setLastWaterAdd(ml);
    load();
  };

  const handleUndoWater = () => {
    if (lastWaterAdd > 0) {
      addWater(-lastWaterAdd);
      setLastWaterAdd(0);
      load();
    } else {
      showAlert('Undo', 'No recent water entry to undo.');
    }
  };

  const handleLogFoodsFromModal = (items: Array<{ name: string; protein: number; calories: number }>) => {
    for (const item of items) {
      addFood(item.name, item.protein, item.calories);
    }
    load();
    if (items.length === 1) {
      showAlert('Food Logged ✓', `Added ${items[0].name} (${items[0].calories} kcal, ${items[0].protein}g protein)!`);
    } else {
      const totCals = items.reduce((a, b) => a + b.calories, 0);
      const totProt = items.reduce((a, b) => a + b.protein, 0);
      showAlert('Meal Logged ✓', `Added ${items.length} items (${totCals} kcal, ${totProt.toFixed(1)}g protein) to your daily intake!`);
    }
  };

  const toggleHabit = (key: keyof DailyLog) => {
    const cur = !!(log as any)[key];

    if (key === 'creatine_taken') {
      cur ? unlogCreatine() : logCreatine();
    } else {
      updateDailyLog(todayStr(), { [key]: cur ? 0 : 1 } as any);
      if (key === 'workout_completed' && !cur) updateStreak();
    }

    load();
  };

  const waterOptions = WATER_OPTIONS.map(w => ({
    label: w.label,
    value: String(w.ml),
  }));

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Daily Tracker</Text>
        <Text style={styles.headerDate}>
          {new Date().toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
          })}
        </Text>
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refresh} onRefresh={onRefresh} tintColor={C.accent} />}
      >
        <View onLayout={(e: LayoutChangeEvent) => { sectionOffsets.current['water'] = e.nativeEvent.layout.y; }}>
          <SectionHeader title="Water Intake" icon="water-outline" />
        <Card accent={C.water}>
          <View style={styles.section}>
            <View style={styles.macroTopRow}>
              <Ring value={waterPct} color={C.water} size={72} />
              <View style={{ flex: 1, marginLeft: 16 }}>
                <Text style={[styles.bigVal, { color: C.water }]}>
                  {log.water_intake.toFixed(2)} L
                </Text>
                <Text style={styles.goalText}>Goal: {goals.water_goal} L</Text>
                <ProgressBar value={waterPct} color={C.water} height={8} />
              </View>
            </View>

            <View style={styles.quickBtns}>
              {[100, 250].map(ml => (
                <TouchableOpacity
                  key={ml}
                  style={[styles.quickBtn, { borderColor: C.water }]}
                  onPress={() => {
                    addWater(ml);
                    setLastWaterAdd(ml);
                    load();
                  }}
                >
                  <Text style={[styles.quickBtnText, { color: C.water }]}>
                    {ml}ml
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.btnRow}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Btn
                  label="+ Add Water"
                  color={C.water}
                  onPress={() => setWaterModal(true)}
                />
              </View>
              <TouchableOpacity
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 14,
                  backgroundColor: C.surface,
                  borderWidth: 1,
                  borderColor: C.border,
                  justifyContent: 'center',
                  alignItems: 'center'
                }}
                onPress={handleUndoWater}
              >
                <Ionicons name="arrow-undo" size={20} color={C.muted} />
              </TouchableOpacity>
            </View>
          </View>
        </Card>
        </View>

        <View onLayout={(e: LayoutChangeEvent) => { sectionOffsets.current['nutrition'] = e.nativeEvent.layout.y; }}>
          <SectionHeader title="Nutrition" icon="restaurant-outline" />
        <Card accent={C.protein}>
          <View style={styles.section}>
            <View style={styles.nutritionStats}>
              <View style={styles.nutritionStat}>
                <Ring value={proteinPct} color={C.protein} size={64} />
                <Text style={[styles.nutritionVal, { color: C.protein }]}>
                  {Math.round(log.protein_intake)}g
                </Text>
                <Text style={styles.nutritionLabel}>Protein</Text>
              </View>

              <View style={styles.nutritionStat}>
                <Ring value={calPct} color={C.calories} size={64} />
                <Text style={[styles.nutritionVal, { color: C.calories }]}>
                  {log.calorie_intake}
                </Text>
                <Text style={styles.nutritionLabel}>kcal</Text>
              </View>
            </View>

            <Btn
              label="+ Add Food / Search"
              color={C.calories}
              onPress={() => setFoodModal(true)}
            />

            {foods.length > 0 && (
              <View style={styles.foodList}>
                {foods.map(f => (
                  <View key={f.id} style={styles.foodRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.foodName}>{f.food_name}</Text>
                      <Text style={styles.foodMacros}>
                        <Text style={{ color: C.protein }}>{f.protein}g protein</Text>
                        {'  '}
                        <Text style={{ color: C.calories }}>{f.calories} kcal</Text>
                      </Text>
                    </View>

                    <TouchableOpacity
                      onPress={() => {
                        deleteFoodEntry(f.id);
                        load();
                      }}
                      style={styles.deleteBtn}
                    >
                      <Text style={{ color: C.red, fontSize: 16 }}>×</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
          </View>
        </Card>
        </View>

        {/* ── Barcode & Nutrition Scanner (Above Creatine) ── */}
        <SectionHeader title="Scan & Calculate Macros" icon="barcode-outline" />
        <Card accent="#4ADE80">
          <View style={styles.section}>
            <View style={styles.scannerHeroRow}>
              <View style={[styles.scannerIconBox, { backgroundColor: isDark ? '#112F18' : '#DCFCE7' }]}>
                <Ionicons name="scan" size={26} color="#4ADE80" />
              </View>
              <View style={{ flex: 1, marginLeft: 14 }}>
                <Text style={styles.scannerHeroTitle}>Barcode & Label Scanner</Text>
                <Text style={styles.scannerHeroSub}>
                  Scan barcodes or snap nutrition labels. Automatically calculates exact macros for your portion (e.g. 30g).
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.openScannerBtn}
              onPress={() => setScannerModal(true)}
            >
              <Ionicons name="camera" size={18} color="#0A0E1A" style={{ marginRight: 8 }} />
              <Text style={styles.openScannerBtnTxt}>Open Barcode & Label Scanner</Text>
            </TouchableOpacity>
          </View>
        </Card>

        <View onLayout={(e: LayoutChangeEvent) => { sectionOffsets.current['creatine'] = e.nativeEvent.layout.y; }}>
          <SectionHeader title="Creatine" icon="flash-outline" />
        <Card accent={log.creatine_taken ? C.green : C.red}>
          <View style={styles.section}>
            <TouchableOpacity
              style={[
                styles.creatineBtn,
                {
                  borderColor: log.creatine_taken ? C.green : C.border,
                  backgroundColor: log.creatine_taken ? C.greenDim : C.bg,
                },
              ]}
              onPress={() => toggleHabit('creatine_taken')}
            >
              <Ionicons name="flash-outline" size={32} color={log.creatine_taken ? C.green : C.muted} style={{ marginBottom: 6 }} />
              <Text
                style={[
                  styles.creatineBtnText,
                  { color: log.creatine_taken ? C.green : C.muted },
                ]}
              >
                {log.creatine_taken ? '✓ Taken Today' : 'Mark as Taken'}
              </Text>

              {log.creatine_time && (
                <Text style={styles.creatineTime}>
                  Logged at {new Date(log.creatine_time).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </Card>
        </View>

        <SectionHeader title="Daily Habits" icon="checkmark-circle-outline" />
        <Card accent={C.accent}>
          <View style={styles.section}>
            {(([
              ['workout_completed',    'barbell-outline',     'Workout Completed',    'Auto-tracked when a session is logged in Workouts.'],
              ['water_goal_reached',   'water-outline',       'Water Goal Reached',   'Auto-tracks when your water intake hits your daily goal.'],
              ['protein_goal_reached', 'restaurant-outline',  'Protein Goal Reached', 'Auto-tracks when your protein intake hits your daily goal.'],
            ] as [keyof DailyLog, string, string, string][])).map(([key, icon, label, info]) => {
              const done = !!(log as any)[key];
              return (
                <TouchableOpacity
                  key={key}
                  activeOpacity={0.75}
                  onPress={() => showAlert(
                    done ? `✅ ${label}` : `⏳ ${label}`,
                    info
                  )}
                  style={[
                    styles.habitRow,
                    done && styles.habitRowDone,
                  ]}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                    <View style={[styles.habitIconWrap, { backgroundColor: done ? C.green + '22' : C.border + '44' }]}>
                      <Ionicons name={icon as any} size={18} color={done ? C.green : C.muted} />
                    </View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={[styles.habitText, done && { color: C.text, fontWeight: '700' }]}>{label}</Text>
                      <Text style={styles.habitSub}>Auto-tracked</Text>
                    </View>
                  </View>
                  <View style={[styles.habitStatus, { backgroundColor: done ? C.green : C.border }]}>
                    <Ionicons name={done ? 'checkmark' : 'time-outline'} size={14} color={done ? '#fff' : C.muted} />
                  </View>
                </TouchableOpacity>
              );
            })}

            <View style={{ marginTop: 16 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                <Text style={{ fontSize: 11, color: C.muted, fontWeight: '600' }}>Daily Progress</Text>
                <Text style={{ fontSize: 11, color: C.green, fontWeight: '700' }}>
                  {[log.workout_completed, log.water_goal_reached, log.protein_goal_reached].filter(Boolean).length} / 3
                </Text>
              </View>
              <ProgressBar
                value={[log.workout_completed, log.water_goal_reached, log.protein_goal_reached].filter(Boolean).length / 3}
                color={C.green}
                height={8}
              />
            </View>
          </View>
        </Card>
      </ScrollView>

      <PickerModal
        visible={waterModal}
        title="Select Water Amount"
        options={waterOptions}
        onSelect={handleAddWater}
        onClose={() => setWaterModal(false)}
      />

      {/* Search Food, Calculate Portion & Multi-Item Meal Logger */}
      <FoodSearchModal
        visible={foodModal}
        onClose={() => setFoodModal(false)}
        onLogFoods={handleLogFoodsFromModal}
        onOpenBarcodeScanner={() => setScannerModal(true)}
      />

      {/* Barcode & Nutrition Label Scanner Modal */}
      <FoodScannerModal
        visible={scannerModal}
        onClose={() => setScannerModal(false)}
        onLogFood={handleScannerLogFood}
      />
    </SafeAreaView>
  );
}

function makeStyles(C: any, isDark?: boolean) { return StyleSheet.create({
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
  headerDate: { fontSize: 12, color: C.muted },
  scroll: { padding: 16, paddingBottom: 40 },
  section: { padding: 16 },
  macroTopRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  bigVal: { fontSize: 28, fontWeight: '800', marginBottom: 4 },
  goalText: { fontSize: 12, color: C.muted, marginBottom: 8 },
  quickBtns: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  quickBtn: {
    flex: 1,
    backgroundColor: C.card,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    shadowColor: '#BFC8D6',
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 0.9,
    shadowRadius: 8,
    elevation: 4,
  },
  quickBtnText: { fontSize: 13, fontWeight: '700' },
  btnRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  nutritionStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 16,
  },
  nutritionStat: { alignItems: 'center', gap: 6 },
  nutritionVal: { fontSize: 18, fontWeight: '800' },
  nutritionLabel: { fontSize: 11, color: C.muted },
  customForm: {
    backgroundColor: C.card,
    borderRadius: 16,
    padding: 14,
    marginTop: 12,
    shadowColor: '#BFC8D6',
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 0.8,
    shadowRadius: 10,
    elevation: 5,
  },
  customTitle: { fontSize: 14, fontWeight: '700', color: C.text, marginBottom: 10 },
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
  foodList: { marginTop: 12, borderTopWidth: 1, borderTopColor: C.border },
  foodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  foodName: { fontSize: 13, color: C.text, marginBottom: 2 },
  foodMacros: { fontSize: 11 },
  deleteBtn: { padding: 8 },
  creatineBtn: {
    alignItems: 'center',
    borderRadius: 20,
    borderWidth: 0,
    paddingVertical: 24,
    backgroundColor: C.card,
    shadowColor: '#BFC8D6',
    shadowOffset: { width: 6, height: 6 },
    shadowOpacity: 0.9,
    shadowRadius: 12,
    elevation: 8,
  },
  creatineBtnText: { fontSize: 16, fontWeight: '700' },
  creatineTime: { fontSize: 11, color: C.muted, marginTop: 4 },
  habitRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 2,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  habitRowDone: {
    backgroundColor: C.greenDim,
    borderRadius: 12,
    paddingHorizontal: 10,
    borderBottomWidth: 0,
    marginBottom: 2,
  },
  habitIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  habitText: { fontSize: 14, color: C.textSub },
  habitSub: { fontSize: 10, color: C.muted, marginTop: 1 },
  habitStatus: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scannerHeroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  scannerIconBox: {
    width: 48,
    height: 48,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#4ADE8055',
  },
  scannerHeroTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: C.text,
    marginBottom: 2,
  },
  scannerHeroSub: {
    fontSize: 12,
    color: C.muted,
    lineHeight: 16,
    fontWeight: '500',
  },
  openScannerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4ADE80',
    borderRadius: 14,
    paddingVertical: 13,
    shadowColor: '#4ADE80',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 3,
  },
  openScannerBtnTxt: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0A0E1A',
  },
}); }