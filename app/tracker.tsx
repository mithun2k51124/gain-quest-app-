// app/tracker.tsx — Daily Tracker with Interactive Drag-and-Drop Widgets
import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';

import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Modal } from 'react-native';
import * as Haptics from 'expo-haptics';
import {
  getTodayLog,
  updateDailyLog,
  todayStr,
  getGoals,
  addWater,
  getFoodLog,
  deleteFoodEntry,
  getSetting,
  setSetting,
  getSupplementProgress,
  getLatestWeight,
  DailyLog,
  Goals,
  FoodEntry,
} from '../db/database';
import { Card, Btn, ProgressBar, Ring, PickerModal, SectionHeader } from '../components/ui';
import { SettingsButton } from '../components/SettingsButton';
import { DragBoard, DragBoardHandle, WidgetLabel } from '../components/DragWidget';
import { SupplementsCard } from '../components/Supplements';
import { WeightCard } from '../components/WeightTracker';
import { TrackerTile } from '../components/TrackerTile';
import { SupplementIcon } from '../components/SupplementIcon';
import { ScanIcon } from '../components/ScanIcon';
import { useTheme } from '../contexts/ThemeContext';
import { logError } from '../utils/logError';
import { useCustomAlert } from '../contexts/AlertContext';
import { WATER_OPTIONS } from '../constants/theme';
import FoodScannerModal from '../components/FoodScannerModal';
import FoodSearchModal from '../components/FoodSearchModal';

// The barcode & label scanner lives in the header now, not in the list
export type TrackerSectionKey = 'water' | 'nutrition' | 'supplements' | 'weight' | 'habits';

const DEFAULT_SECTIONS: TrackerSectionKey[] = [
  'water',
  'nutrition',
  'supplements',
  'weight',
  'habits',
];
const OPEN_KEY = 'tracker_open_sections';

const SECTION_INFO: Record<TrackerSectionKey, { title: string; icon: string }> = {
  water:       { title: 'Water Intake', icon: 'water-outline' },
  nutrition:   { title: 'Nutrition', icon: 'restaurant-outline' },
  supplements: { title: 'Supplements', icon: 'leaf-outline' },
  weight:      { title: 'Body Weight', icon: 'scale-outline' },
  habits:      { title: 'Daily Habits', icon: 'checkmark-circle-outline' },
};

export default function TrackerScreen() {
  const { showAlert } = useCustomAlert();

  const { C, isDark } = useTheme();
  const [log, setLog] = useState<DailyLog | null>(null);
  const [goals, setGoals] = useState<Goals | null>(null);
  const [foods, setFoods] = useState<FoodEntry[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [scannerModal, setScannerModal] = useState(false);

  const [waterModal, setWaterModal] = useState(false);
  const [lastWaterAdd, setLastWaterAdd] = useState(0);
  const [foodModal, setFoodModal] = useState(false);

  const boardRef = useRef<DragBoardHandle>(null);

  // Widget custom ordering state
  const [sections, setSections] = useState<TrackerSectionKey[]>(() => {
    try {
      const saved = getSetting('tracker_sections_order', '');
      if (saved) {
        // Supplements took Creatine's place
        const parsed = (JSON.parse(saved) as any[]).map(k => (k === 'creatine' ? 'supplements' : k));
        if (Array.isArray(parsed) && parsed.length > 0) {
          const valid: TrackerSectionKey[] = parsed.filter((k: any) => DEFAULT_SECTIONS.includes(k));
          // New sections go in after the one they follow by default (Body Weight after Supplements)
          DEFAULT_SECTIONS.forEach((k, i) => {
            if (valid.includes(k)) return;
            const after = valid.indexOf(DEFAULT_SECTIONS[i - 1]);
            valid.splice(after >= 0 ? after + 1 : valid.length, 0, k);
          });
          return valid;
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
  const router = useRouter();

  // Which sections are open (all closed at first, so the whole page is visible at a glance)
  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(getSetting(OPEN_KEY, '{}')) || {}; } catch { return {}; }
  });
  const toggleOpen = (k: TrackerSectionKey) => setOpen(o => {
    const next = { ...o, [k]: !o[k] };
    try { setSetting(OPEN_KEY, JSON.stringify(next)); } catch (e) { logError('trackerOpen', e); }
    return next;
  });

  // Numbers for the closed cards' one-line summaries
  const [summary, setSummary] = useState({ weight: null as number | null, weightGoal: 0, suppTaken: 0, suppTotal: 0 });

  const load = useCallback(() => {
    const g = getGoals();
    setLog(getTodayLog());
    setGoals(g);
    setFoods(getFoodLog());
    const supp = getSupplementProgress();
    setSummary({ weight: getLatestWeight(), weightGoal: g.weight_goal || 0, suppTaken: supp.taken, suppTotal: supp.total });
    setRefreshKey(k => k + 1);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      if (openSection) {
        // A section asked for from elsewhere opens, then scrolls into view
        if (DEFAULT_SECTIONS.includes(openSection as TrackerSectionKey)) setOpen(o => ({ ...o, [openSection]: true }));
        // Wait for the widgets to be measured before scrolling to one
        setTimeout(() => boardRef.current?.scrollToKey(openSection, 0), 350);
        // A request is used once: opening the Tracker tab later starts at the top as usual
        router.setParams({ openSection: undefined, t: undefined } as any);
      }
    }, [load, openSection, openNonce, router])
  );

  const handleDragEnd = useCallback((data: TrackerSectionKey[]) => {
    if (!data || !Array.isArray(data) || data.length === 0) return;
    const valid = Array.from(new Set(data.filter(k => DEFAULT_SECTIONS.includes(k))));
    const missing = DEFAULT_SECTIONS.filter(k => !valid.includes(k));
    const finalData = [...valid, ...missing];
    setSections(finalData);
    try {
      setSetting('tracker_sections_order', JSON.stringify(finalData));
    } catch (e) { logError('trackerLayout', e); }
  }, []);

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
        case 'supplements':
        case 'weight':
          boardRef.current?.scrollToKey(key, 0);
          break;
        case 'habits':
          showAlert('Daily Habits', 'Tap any habit card on the tracker screen to mark it done or pending.');
          break;
      }
    }, 180);
  };

  const styles = makeStyles(C, isDark);

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

  const waterOptions = WATER_OPTIONS.map(w => ({
    label: w.label,
    value: String(w.ml),
  }));

  // ─────────────────────────────────────────────────────────────────────────
  // Sections: each is a compact card (summary + quick action) that opens to the full controls
  // ─────────────────────────────────────────────────────────────────────────
  const indexOf = (k: TrackerSectionKey) => Math.max(0, sections.indexOf(k));
  const habitsDone = [log.workout_completed, log.water_goal_reached, log.protein_goal_reached].filter(Boolean).length;
  const fmtL = (l: number) => (Math.round(l * 100) / 100).toString();

  const renderWaterSection = (isActive: boolean) => (
    <TrackerTile title="Water" color={C.water} icon={<Ionicons name="water" size={17} color={C.water} />}
      summary={`${fmtL(log.water_intake)} / ${goals.water_goal || 0} L${waterPct >= 1 ? ' · goal reached' : ''}`}
      progress={waterPct} open={!!open.water} onToggle={() => toggleOpen('water')} index={indexOf('water')} lifted={isActive}
      action={{ label: '250 ml', icon: 'add', onPress: () => { addWater(250); setLastWaterAdd(250); load(); } }}>
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
    </TrackerTile>
  );

  const renderNutritionSection = (isActive: boolean) => (
    <TrackerTile title="Nutrition" color={C.protein} icon={<Ionicons name="restaurant" size={16} color={C.protein} />}
      summary={`${Math.round(log.protein_intake)} g protein · ${log.calorie_intake} kcal${foods.length ? ` · ${foods.length} food${foods.length === 1 ? '' : 's'}` : ''}`}
      progress={proteinPct} open={!!open.nutrition} onToggle={() => toggleOpen('nutrition')} index={indexOf('nutrition')} lifted={isActive}
      action={{ label: 'Food', icon: 'add', onPress: () => setFoodModal(true) }}>
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
    </TrackerTile>
  );

  const renderWeightSection = (isActive: boolean) => (
    <TrackerTile title="Body Weight" color={C.water} icon={<Ionicons name="scale" size={16} color={C.water} />}
      summary={summary.weight ? `${summary.weight.toFixed(1)} kg${summary.weightGoal ? ` · target ${summary.weightGoal} kg` : ''}` : 'Log your first weigh-in'}
      open={!!open.weight} onToggle={() => toggleOpen('weight')} index={indexOf('weight')} lifted={isActive}>
      <WeightCard refreshKey={refreshKey} onChanged={load} />
    </TrackerTile>
  );

  const renderSupplementsSection = (isActive: boolean) => (
    <TrackerTile title="Supplements" color={C.teal} icon={<SupplementIcon size={18} color={C.teal} />}
      summary={summary.suppTotal ? `${summary.suppTaken} of ${summary.suppTotal} taken today` : 'Add the supplements you take'}
      progress={summary.suppTotal ? summary.suppTaken / summary.suppTotal : undefined}
      open={!!open.supplements} onToggle={() => toggleOpen('supplements')} index={indexOf('supplements')} lifted={isActive}>
      <SupplementsCard refreshKey={refreshKey} onChanged={load} />
    </TrackerTile>
  );

  const renderHabitsSection = (isActive: boolean) => (
    <TrackerTile title="Daily Habits" color={C.green} icon={<Ionicons name="checkmark-done" size={17} color={C.green} />}
      summary={`${habitsDone} of 3 done · workout, water, protein`} progress={habitsDone / 3}
      open={!!open.habits} onToggle={() => toggleOpen('habits')} index={indexOf('habits')} lifted={isActive}>
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

          {/* Sleep can't be tracked automatically: a tap marks it (it fills Overall's sleep ring) */}
          <TouchableOpacity
            activeOpacity={0.75}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              updateDailyLog(todayStr(), { slept_well: log.slept_well ? 0 : 1 });
              load();
            }}
            style={[styles.habitRow, !!log.slept_well && { backgroundColor: C.purple + '1A', borderRadius: 12, paddingHorizontal: 10, borderBottomWidth: 0 }]}
            accessibilityRole="checkbox" accessibilityState={{ checked: !!log.slept_well }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
              <View style={[styles.habitIconWrap, { backgroundColor: log.slept_well ? C.purple + '22' : C.border + '44' }]}>
                <Ionicons name="moon-outline" size={18} color={log.slept_well ? C.purple : C.muted} />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[styles.habitText, !!log.slept_well && { color: C.text, fontWeight: '700' }]}>Slept Well</Text>
                <Text style={styles.habitSub}>Tap to mark last night</Text>
              </View>
            </View>
            <View style={[styles.habitStatus, { backgroundColor: log.slept_well ? C.purple : C.border }]}>
              <Ionicons name={log.slept_well ? 'checkmark' : 'ellipse-outline'} size={14} color={log.slept_well ? '#fff' : C.muted} />
            </View>
          </TouchableOpacity>

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
    </TrackerTile>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // Widgets on the board
  // ─────────────────────────────────────────────────────────────────────────
  const renderItem = (item: TrackerSectionKey, isActive: boolean) => {
    switch (item) {
      case 'water': return renderWaterSection(isActive);
      case 'nutrition': return renderNutritionSection(isActive);
      case 'supplements': return renderSupplementsSection(isActive);
      case 'weight': return renderWeightSection(isActive);
      case 'habits': return renderHabitsSection(isActive);
    }
  };

  const sectionColor: Record<TrackerSectionKey, string> = {
    water: C.water, nutrition: C.protein, supplements: C.teal, weight: C.water, habits: C.green,
  };
  const labelFor = (k: TrackerSectionKey): WidgetLabel => ({ ...SECTION_INFO[k], color: sectionColor[k] });

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
          {/* Barcode & nutrition-label scanner */}
          <TouchableOpacity onPress={() => setScannerModal(true)} activeOpacity={0.8}
            style={[styles.scanPill, { borderColor: '#4ADE80' + '88', backgroundColor: '#4ADE80' + '1A' }]}
            accessibilityLabel="Scan and calculate macros" hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}>
            <ScanIcon size={16} color="#22C55E" />
            <View>
              <Text style={styles.scanTxt}>Scan</Text>
              <Text style={styles.scanSub}>& calculate macros</Text>
            </View>
          </TouchableOpacity>
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
        onRefresh={load}
        footer={
          <TouchableOpacity style={[styles.customizeBtn, { borderColor: C.border }]} onPress={() => setEditModal(true)} activeOpacity={0.75}>
            <Ionicons name="apps-outline" size={16} color={C.accent} />
            <Text style={[styles.customizeTxt, { color: C.accent }]}>Customize sections</Text>
          </TouchableOpacity>
        }
      />

      <PickerModal
        visible={waterModal}
        title="Select Water Amount"
        options={waterOptions}
        onSelect={handleAddWater}
        onClose={() => setWaterModal(false)}
      />

      {/* Add food: search, recent foods, type it in (each food is logged as it's added) */}
      <FoodSearchModal
        visible={foodModal}
        onClose={() => setFoodModal(false)}
        onChanged={load}
        onOpenScanner={() => setScannerModal(true)}
      />

      {/* Barcode & nutrition-label scanner */}
      <FoodScannerModal
        visible={scannerModal}
        onClose={() => setScannerModal(false)}
        onChanged={load}
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
                return (
                  <View key={key} style={[styles.glassWidgetRow, { borderColor: C.border }]}>
                    <View style={[styles.glassWidgetNum, { backgroundColor: C.accent + '18' }]}>
                      <Text style={[styles.glassWidgetNumTxt, { color: C.accent }]}>{idx + 1}</Text>
                    </View>
                    <Ionicons name={SECTION_INFO[key].icon as any} size={16} color={C.muted} style={{ marginHorizontal: 8 }} />
                    <Text style={[styles.glassWidgetLabel, { color: C.text }]} numberOfLines={1}>{SECTION_INFO[key].title}</Text>

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
    scanPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, height: 38, borderRadius: 12, borderWidth: 1 },
    scanTxt: { fontSize: 13, fontWeight: '900', color: '#22C55E', lineHeight: 15 },
    scanSub: { fontSize: 9, fontWeight: '700', color: C.muted, lineHeight: 11 },
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