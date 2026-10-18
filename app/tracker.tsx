// app/tracker.tsx — Daily Tracker with Interactive Drag-and-Drop Widgets
import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  Vibration,
} from 'react-native';

import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Modal } from 'react-native';
import DraggableFlatList, {
  ScaleDecorator,
  ShadowDecorator,
  OpacityDecorator,
  RenderItemParams,
} from 'react-native-draggable-flatlist';
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
  getSetting,
  setSetting,
  todayStr,
  DailyLog,
  Goals,
  FoodEntry,
} from '../db/database';
import { Card, Btn, ProgressBar, Ring, PickerModal, SectionHeader } from '../components/ui';
import { SettingsButton } from '../components/SettingsButton';
import { useTheme } from '../contexts/ThemeContext';
import { logError } from '../utils/logError';
import { useCustomAlert } from '../contexts/AlertContext';
import { WATER_OPTIONS } from '../constants/theme';
import FoodScannerModal from '../components/FoodScannerModal';
import FoodSearchModal from '../components/FoodSearchModal';

export type TrackerSectionKey = 'water' | 'nutrition' | 'scanner' | 'creatine' | 'habits';

const DEFAULT_SECTIONS: TrackerSectionKey[] = [
  'water',
  'nutrition',
  'scanner',
  'creatine',
  'habits',
];

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

  const flatListRef = useRef<any>(null);

  // Widget custom ordering state
  const [sections, setSections] = useState<TrackerSectionKey[]>(() => {
    try {
      const saved = getSetting('tracker_sections_order', '');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const valid = parsed.filter((k: any) => DEFAULT_SECTIONS.includes(k));
          const missing = DEFAULT_SECTIONS.filter(k => !valid.includes(k));
          return [...valid, ...missing];
        }
      }
    } catch (e) { logError('trackerLayout', e); }
    return DEFAULT_SECTIONS;
  });

  // Edit / configure modal
  const [editModal, setEditModal] = useState(false);

  // Section scroll-to
  // `t` changes on every request (e.g. a notification tap) so we re-scroll even if already here
  const { openSection, t: openNonce } = useLocalSearchParams<{ openSection?: string; t?: string }>();

  const load = useCallback(() => {
    setLog(getTodayLog());
    setGoals(getGoals());
    setFoods(getFoodLog());
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      if (openSection) {
        setTimeout(() => {
          const targetIdx = sections.indexOf(openSection as TrackerSectionKey);
          if (targetIdx >= 0 && flatListRef.current) {
            try {
              flatListRef.current.scrollToIndex({ index: targetIdx, animated: true, viewPosition: 0 });
            } catch (_) {}
          }
        }, 350);
      }
    }, [load, openSection, openNonce, sections])
  );

  const onRefresh = () => {
    setRefresh(true);
    load();
    setRefresh(false);
  };

  const handleDragEnd = ({ data }: { data: TrackerSectionKey[] }) => {
    if (!data || !Array.isArray(data) || data.length === 0) return;
    const valid = Array.from(new Set(data.filter(k => DEFAULT_SECTIONS.includes(k))));
    const missing = DEFAULT_SECTIONS.filter(k => !valid.includes(k));
    const finalData = [...valid, ...missing];
    setSections(finalData);
    try {
      setSetting('tracker_sections_order', JSON.stringify(finalData));
    } catch (e) { logError('trackerLayout', e); }
    try { Vibration.vibrate(22); } catch (_) {}
  };

  const handleResetLayout = () => {
    setSections(DEFAULT_SECTIONS);
    try {
      setSetting('tracker_sections_order', JSON.stringify(DEFAULT_SECTIONS));
    } catch (e) { logError('trackerLayout', e); }
    showAlert('Reset ✓', 'Tracker widgets layout restored to default.');
  };

  const moveWidget = (fromIdx: number, dir: -1 | 1) => {
    const toIdx = fromIdx + dir;
    if (toIdx < 0 || toIdx >= sections.length) return;
    const next = [...sections];
    [next[fromIdx], next[toIdx]] = [next[toIdx], next[fromIdx]];
    setSections(next);
    try { setSetting('tracker_sections_order', JSON.stringify(next)); } catch (e) { logError('trackerLayout', e); }
  };

  const handleEditFromModal = (key: TrackerSectionKey) => {
    setEditModal(false);
    setTimeout(() => {
      switch (key) {
        case 'water':
          setWaterModal(true);
          break;
        case 'nutrition':
          setFoodModal(true);
          break;
        case 'scanner':
          setScannerModal(true);
          break;
        case 'creatine':
          toggleHabit('creatine_taken');
          break;
        case 'habits':
          showAlert('Daily Habits', 'Tap any habit card on the tracker screen to mark it done or pending.');
          break;
      }
    }, 180);
  };

  const styles = makeStyles(C, isDark);

  const handleScannerLogFood = (name: string, protein: number, calories: number) => {
    addFood(name, protein, calories);
    load();
  };

  if (!log || !goals) return null;

  const waterPct = goals.water_goal > 0 ? Math.min(log.water_intake / goals.water_goal, 1) : 0;
  const proteinPct = goals.protein_goal > 0 ? Math.min(log.protein_intake / goals.protein_goal, 1) : 0;
  const calPct = goals.calorie_goal > 0 ? Math.min(log.calorie_intake / goals.calorie_goal, 1) : 0;

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

  // ─────────────────────────────────────────────────────────────────────────
  // Section Renderers (100% of Original Code & Functionality Preserved)
  // ─────────────────────────────────────────────────────────────────────────
  const renderWaterSection = (isActive: boolean) => (
    <View style={styles.sectionWrap}>
      <View style={styles.sectionHeaderRow}>
        <SectionHeader title="Water Intake" icon="water-outline" />
        <View style={styles.dragGripBox}>
          <Ionicons name="reorder-two" size={18} color={isActive ? C.water : C.muted + '77'} />
        </View>
      </View>
      <Card accent={C.water} style={isActive ? styles.activeCardGlow : undefined}>
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
  );

  const renderNutritionSection = (isActive: boolean) => (
    <View style={styles.sectionWrap}>
      <View style={styles.sectionHeaderRow}>
        <SectionHeader title="Nutrition" icon="restaurant-outline" />
        <View style={styles.dragGripBox}>
          <Ionicons name="reorder-two" size={18} color={isActive ? C.protein : C.muted + '77'} />
        </View>
      </View>
      <Card accent={C.protein} style={isActive ? styles.activeCardGlow : undefined}>
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
  );

  const renderScannerSection = (isActive: boolean) => (
    <View style={styles.sectionWrap}>
      <View style={styles.sectionHeaderRow}>
        <SectionHeader title="Scan & Calculate Macros" icon="barcode-outline" />
        <View style={styles.dragGripBox}>
          <Ionicons name="reorder-two" size={18} color={isActive ? '#4ADE80' : C.muted + '77'} />
        </View>
      </View>
      <Card accent="#4ADE80" style={isActive ? styles.activeCardGlow : undefined}>
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
    </View>
  );

  const renderCreatineSection = (isActive: boolean) => (
    <View style={styles.sectionWrap}>
      <View style={styles.sectionHeaderRow}>
        <SectionHeader title="Creatine" icon="flash-outline" />
        <View style={styles.dragGripBox}>
          <Ionicons name="reorder-two" size={18} color={isActive ? C.green : C.muted + '77'} />
        </View>
      </View>
      <Card accent={log.creatine_taken ? C.green : C.red} style={isActive ? styles.activeCardGlow : undefined}>
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
  );

  const renderHabitsSection = (isActive: boolean) => (
    <View style={styles.sectionWrap}>
      <View style={styles.sectionHeaderRow}>
        <SectionHeader title="Daily Habits" icon="checkmark-circle-outline" />
        <View style={styles.dragGripBox}>
          <Ionicons name="reorder-two" size={18} color={isActive ? C.accent : C.muted + '77'} />
        </View>
      </View>
      <Card accent={C.accent} style={isActive ? styles.activeCardGlow : undefined}>
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
    </View>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // Render Draggable Item
  // ─────────────────────────────────────────────────────────────────────────
  const renderItem = ({ item, drag, isActive }: RenderItemParams<TrackerSectionKey>) => {
    return (
      <ScaleDecorator activeScale={1.03}>
        <OpacityDecorator activeOpacity={1}>
          <TouchableOpacity
            activeOpacity={1}
            onLongPress={() => {
              try { Vibration.vibrate([0, 18, 40, 12]); } catch {}
              drag();
            }}
            delayLongPress={160}
            disabled={isActive}
            style={[
              styles.dragItemContainer,
              isActive && styles.activeDragItem,
            ]}
          >
            <View style={isActive ? styles.activeInnerContent : undefined}>
              {isActive && (
                <View style={styles.frostOverlay} pointerEvents="none">
                  <View style={styles.frostInner} />
                </View>
              )}
              {item === 'water' && renderWaterSection(isActive)}
              {item === 'nutrition' && renderNutritionSection(isActive)}
              {item === 'scanner' && renderScannerSection(isActive)}
              {item === 'creatine' && renderCreatineSection(isActive)}
              {item === 'habits' && renderHabitsSection(isActive)}
            </View>
          </TouchableOpacity>
        </OpacityDecorator>
      </ScaleDecorator>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Daily Tracker</Text>
          <Text style={styles.headerDate}>
            {new Date().toLocaleDateString('en-US', {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
            })}
          </Text>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {/* Edit / Configure Button */}
          <TouchableOpacity
            style={styles.editHeaderBtn}
            onPress={() => setEditModal(true)}
            activeOpacity={0.75}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="create-outline" size={18} color={C.accent} />
          </TouchableOpacity>
          <SettingsButton />
        </View>
      </View>

      {/* ── Interactive Draggable FlatList ── */}
      <DraggableFlatList
        ref={flatListRef}
        data={sections}
        extraData={sections}
        onDragEnd={handleDragEnd}
        keyExtractor={(item) => item}
        renderItem={renderItem}
        activationDistance={8}
        autoscrollThreshold={40}
        autoscrollSpeed={35}
        animationConfig={{
          damping: 40,
          mass: 0.08,
          stiffness: 700,
          overshootClamping: true,
        }}
        refreshControl={<RefreshControl refreshing={refresh} onRefresh={onRefresh} tintColor={C.accent} />}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      />

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

      {/* ── Edit / Configure Widgets Modal ── */}
      <Modal visible={editModal} transparent animationType="slide" onRequestClose={() => setEditModal(false)}>
        <TouchableOpacity style={styles.glassOverlay} activeOpacity={1} onPress={() => setEditModal(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.glassSheet} onPress={e => e.stopPropagation()}>
            <View style={styles.glassHandle} />

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

            <View style={[styles.glassTipRow, { backgroundColor: C.accent + '12', borderColor: C.accent + '30' }]}>
              <Ionicons name="information-circle-outline" size={16} color={C.accent} style={{ marginRight: 8 }} />
              <Text style={[styles.glassTipTxt, { color: C.accent }]}>
                Use ↑↓ arrows to reorder, or long-press on the screen to drag
              </Text>
            </View>

            <View style={styles.glassWidgetList}>
              {sections.map((key, idx) => {
                const labels: Record<string, string> = {
                  water: 'Water Intake',
                  nutrition: 'Nutrition',
                  scanner: 'Scan & Calculate Macros',
                  creatine: 'Creatine',
                  habits: 'Daily Habits',
                };
                const icons: Record<string, any> = {
                  water: 'water-outline',
                  nutrition: 'restaurant-outline',
                  scanner: 'barcode-outline',
                  creatine: 'flash-outline',
                  habits: 'checkmark-circle-outline',
                };
                return (
                  <View key={key} style={[styles.glassWidgetRow, { borderColor: C.border }]}>
                    <View style={[styles.glassWidgetNum, { backgroundColor: C.accent + '18' }]}>
                      <Text style={[styles.glassWidgetNumTxt, { color: C.accent }]}>{idx + 1}</Text>
                    </View>
                    <Ionicons name={icons[key]} size={16} color={C.muted} style={{ marginHorizontal: 8 }} />
                    <Text style={[styles.glassWidgetLabel, { color: C.text }]} numberOfLines={1}>{labels[key]}</Text>

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
    </SafeAreaView>
  );
}

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
    headerDate: { fontSize: 12, color: C.muted },
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

    // Drag item wrapper & active state
    dragItemContainer: {
      marginBottom: 16,
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
    // Clips inner content to rounded corners ONLY when actively dragging
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
    glassModalTitle: { fontSize: 17, fontWeight: '800' },
    glassModalSub: { fontSize: 12, marginTop: 1 },
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
    glassTipTxt: { fontSize: 12, fontWeight: '600', flex: 1, lineHeight: 16 },
    glassWidgetList: { gap: 8, marginBottom: 20 },
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
    glassWidgetLabel: { fontSize: 14, fontWeight: '600', flex: 1 },
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
    glassResetTitle: { fontSize: 14, fontWeight: '700' },
    glassResetSub: { fontSize: 11, marginTop: 1 },
    glassDoneBtn: { alignItems: 'center', paddingVertical: 10 },
    glassdoneTxt: { fontSize: 15, fontWeight: '700', opacity: 0.6 },

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
    dragGripBox: {
      paddingHorizontal: 6,
      paddingVertical: 2,
    },

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
      shadowColor: isDark ? '#000000' : '#BFC8D6',
      shadowOffset: { width: 4, height: 4 },
      shadowOpacity: isDark ? 0.3 : 0.9,
      shadowRadius: 8,
      elevation: 4,
      borderWidth: 1,
      borderColor: C.border,
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
      borderWidth: 1,
      borderColor: C.border,
      paddingVertical: 24,
      backgroundColor: C.card,
      shadowColor: isDark ? '#000000' : '#BFC8D6',
      shadowOffset: { width: 6, height: 6 },
      shadowOpacity: isDark ? 0.3 : 0.9,
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
  });
}