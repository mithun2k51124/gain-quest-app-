import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
  TextInput,
  RefreshControl,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
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
import { C, WATER_OPTIONS, FOOD_DB } from '../constants/theme';

export default function TrackerScreen() {
  const [log, setLog] = useState<DailyLog | null>(null);
  const [goals, setGoals] = useState<Goals | null>(null);
  const [foods, setFoods] = useState<FoodEntry[]>([]);
  const [refresh, setRefresh] = useState(false);

  const [waterModal, setWaterModal] = useState(false);
  const [foodModal, setFoodModal] = useState(false);

  const [showCustom, setShowCustom] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customProt, setCustomProt] = useState('0');
  const [customCals, setCustomCals] = useState('0');

  const load = useCallback(() => {
    setLog(getTodayLog());
    setGoals(getGoals());
    setFoods(getFoodLog());
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = () => {
    setRefresh(true);
    load();
    setRefresh(false);
  };

  if (!log || !goals) return null;

  const waterPct = Math.min(log.water_intake / goals.water_goal, 1);
  const proteinPct = Math.min(log.protein_intake / goals.protein_goal, 1);
  const calPct = Math.min(log.calorie_intake / goals.calorie_goal, 1);

  const handleAddWater = (mlStr: string) => {
    const ml = parseInt(mlStr, 10);
    if (!ml || isNaN(ml)) return;
    addWater(ml);
    load();
  };

  const handleResetWater = () => {
    Alert.alert('Reset Water', "Reset today's water to 0?", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reset',
        style: 'destructive',
        onPress: () => {
          resetWater();
          load();
        },
      },
    ]);
  };

  const handleAddFood = (foodKey: string) => {
    if (foodKey === 'Custom...') {
      setShowCustom(true);
      return;
    }

    const [prot, cals] = FOOD_DB[foodKey] || [0, 0];
    addFood(foodKey, prot, cals);
    load();
  };

  const handleAddCustomFood = () => {
    if (!customName.trim()) {
      Alert.alert('Error', 'Enter a food name.');
      return;
    }

    addFood(customName.trim(), parseFloat(customProt) || 0, parseInt(customCals, 10) || 0);
    setCustomName('');
    setCustomProt('0');
    setCustomCals('0');
    setShowCustom(false);
    load();
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

  const foodOptions = [
    ...Object.keys(FOOD_DB).map(k => ({ label: k, value: k })),
    { label: 'Custom...', value: 'Custom...' },
  ];

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
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refresh} onRefresh={onRefresh} tintColor={C.accent} />}
      >
        <SectionHeader title="💧 Water Intake" />
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
              <Btn
                label="Reset"
                color={C.surface}
                textColor={C.muted}
                outline
                onPress={handleResetWater}
                small
              />
            </View>
          </View>
        </Card>

        <SectionHeader title="🥗 Nutrition" />
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
              label="+ Add Food"
              color={C.calories}
              onPress={() => setFoodModal(true)}
            />

            {showCustom && (
              <View style={styles.customForm}>
                <Text style={styles.customTitle}>Custom Food</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Food name"
                  placeholderTextColor={C.muted}
                  value={customName}
                  onChangeText={setCustomName}
                />

                <View style={styles.btnRow}>
                  <View style={{ flex: 1, marginRight: 6 }}>
                    <TextInput
                      style={styles.input}
                      placeholder="Protein (g)"
                      placeholderTextColor={C.muted}
                      keyboardType="numeric"
                      value={customProt}
                      onChangeText={setCustomProt}
                    />
                  </View>
                  <View style={{ flex: 1, marginLeft: 6 }}>
                    <TextInput
                      style={styles.input}
                      placeholder="Calories"
                      placeholderTextColor={C.muted}
                      keyboardType="numeric"
                      value={customCals}
                      onChangeText={setCustomCals}
                    />
                  </View>
                </View>

                <View style={styles.btnRow}>
                  <View style={{ flex: 1, marginRight: 6 }}>
                    <Btn label="Add" color={C.green} onPress={handleAddCustomFood} />
                  </View>
                  <View style={{ flex: 1, marginLeft: 6 }}>
                    <Btn label="Cancel" color={C.muted} onPress={() => setShowCustom(false)} />
                  </View>
                </View>
              </View>
            )}

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

        <SectionHeader title="💊 Creatine" />
        <Card accent={log.creatine_taken ? C.green : C.red}>
          <View style={styles.section}>
            <TouchableOpacity
              style={[
                styles.creatineBtn,
                {
                  borderColor: log.creatine_taken ? C.green : C.border,
                  backgroundColor: log.creatine_taken ? '#0A2010' : C.surface,
                },
              ]}
              onPress={() => toggleHabit('creatine_taken')}
            >
              <Text style={{ fontSize: 32, marginBottom: 6 }}>💊</Text>
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

        <SectionHeader title="✅ Daily Habits" />
        <Card accent={C.accent}>
          <View style={styles.section}>
            {([
              ['workout_completed', '🏋️', 'Workout Completed'],
              ['water_goal_reached', '💧', 'Water Goal Reached'],
              ['protein_goal_reached', '🥩', 'Protein Goal Reached'],
              ['slept_well', '😴', 'Slept 7+ Hours'],
            ] as [keyof DailyLog, string, string][]).map(([key, icon, label]) => (
              <View
                key={key}
                style={[
                  styles.habitRow,
                  !!(log as any)[key] && styles.habitRowDone,
                ]}
              >
                <Text style={styles.habitText}>{icon}  {label}</Text>
                <Toggle value={!!(log as any)[key]} onToggle={() => toggleHabit(key)} />
              </View>
            ))}

            <View style={{ marginTop: 12 }}>
              <ProgressBar
                value={[
                  log.workout_completed,
                  log.water_goal_reached,
                  log.protein_goal_reached,
                  log.slept_well,
                ].filter(Boolean).length / 4}
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

      <PickerModal
        visible={foodModal}
        title="Select Food"
        options={foodOptions}
        onSelect={handleAddFood}
        onClose={() => setFoodModal(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: C.surface,
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
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
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
    backgroundColor: C.surface,
    borderRadius: 12,
    padding: 14,
    marginTop: 12,
  },
  customTitle: { fontSize: 14, fontWeight: '700', color: C.text, marginBottom: 10 },
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
    borderRadius: 16,
    borderWidth: 2,
    paddingVertical: 24,
  },
  creatineBtnText: { fontSize: 16, fontWeight: '700' },
  creatineTime: { fontSize: 11, color: C.muted, marginTop: 4 },
  habitRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  habitRowDone: {
    backgroundColor: '#091509',
    borderRadius: 8,
    paddingHorizontal: 10,
  },
  habitText: { fontSize: 14, color: C.textSub },
});