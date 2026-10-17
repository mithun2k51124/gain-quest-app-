// components/SplitWizard.tsx — 4 quick questions → a personalised weekly split
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { useCustomAlert } from '../contexts/AlertContext';
import { getSetting, setSetting, replaceWeeklyPlan } from '../db/database';
import {
  generateSplit, defaultRestDays, exercisesPerSession, RECOMMENDED_DAYS, WEEK_ORDER, DAY_NAMES,
  Level, SplitAnswers,
} from '../utils/splitGenerator';
import { ExerciseGuideButton } from './ExerciseGuide';
import { logError } from '../utils/logError';

export interface SplitConfig extends SplitAnswers {
  name: string;
  prescription: string;
}

const SETTING_KEY = 'split_config';
const STEPS = 5;
const LEVELS: { key: Level; title: string; sub: string; icon: string }[] = [
  { key: 'beginner', title: 'Beginner', sub: 'New to lifting or under 1 year', icon: 'leaf-outline' },
  { key: 'intermediate', title: 'Intermediate', sub: '1–3 years of consistent training', icon: 'trending-up-outline' },
  { key: 'advanced', title: 'Pro', sub: '3+ years, comfortable with heavy lifts', icon: 'flame-outline' },
];
const MINUTES = [30, 45, 60, 75, 90];
const DAYS = [2, 3, 4, 5, 6];
const LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
// Muscle-group chips in the planner use 'Upper Back'; the exercise library uses 'Back'
const toPlannerGroup = (m: string) => (m === 'Back' ? 'Upper Back' : m);

export function getSplitConfig(): SplitConfig | null {
  try {
    const raw = getSetting(SETTING_KEY, '');
    return raw ? (JSON.parse(raw) as SplitConfig) : null;
  } catch (e) {
    logError('splitConfig', e);
    return null;
  }
}

export function SplitWizard({ visible, onClose, onApplied }: {
  visible: boolean; onClose: () => void; onApplied: () => void;
}) {
  const { C } = useTheme();
  const styles = makeStyles(C);
  const { showAlert } = useCustomAlert();
  const [step, setStep] = useState(0);
  const [level, setLevel] = useState<Level>('beginner');
  const [minutes, setMinutes] = useState(60);
  const [days, setDays] = useState(3);
  const [restDays, setRestDays] = useState<number[]>(defaultRestDays(3));
  const [openDay, setOpenDay] = useState<number | null>(null);

  // Start from the current split's answers when changing it
  useEffect(() => {
    if (!visible) return;
    const cfg = getSplitConfig();
    setStep(0);
    setOpenDay(null);
    if (cfg) {
      setLevel(cfg.level); setMinutes(cfg.minutes); setDays(cfg.daysPerWeek); setRestDays(cfg.restDays);
    }
  }, [visible]);

  const needRest = 7 - days;
  const restOk = restDays.length === needRest;
  const plan = useMemo(
    () => generateSplit({ level, minutes, daysPerWeek: days, restDays }),
    [level, minutes, days, restDays]
  );

  const chooseDays = (d: number) => { setDays(d); setRestDays(defaultRestDays(d)); };
  const toggleRest = (d: number) =>
    setRestDays(r => (r.includes(d) ? r.filter(x => x !== d) : [...r, d]));

  const canNext = step !== 3 || restOk;

  const apply = () => {
    const doApply = () => {
      replaceWeeklyPlan(plan.days.map(d => ({
        dayOfWeek: d.dayName,
        planName: d.title,
        muscleGroups: d.rest ? 'Rest' : [...new Set(d.exercises.map(e => toPlannerGroup(e.muscle)))].join(','),
        exercises: d.exercises.map(e => ({ name: e.name, muscle: e.muscle })),
      })));
      const cfg: SplitConfig = { level, minutes, daysPerWeek: days, restDays, name: plan.name, prescription: plan.prescription };
      setSetting(SETTING_KEY, JSON.stringify(cfg));
      onApplied();
      onClose();
    };
    showAlert('Use this plan?', 'This replaces the exercises in your weekly planner. Your workout history and PRs are not affected.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Use plan', onPress: doApply },
    ]);
  };

  const Option = ({ on, onPress, children }: { on: boolean; onPress: () => void; children: React.ReactNode }) => (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85}
      style={[styles.option, on && { borderColor: C.accent, backgroundColor: C.accent + '14' }]}>
      {children}
    </TouchableOpacity>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} onPress={e => e.stopPropagation()} style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.topRow}>
            <View style={styles.dots}>
              {Array.from({ length: STEPS }, (_, i) => (
                <View key={i} style={[styles.dot, i <= step && { backgroundColor: C.accent, width: i === step ? 18 : 6 }]} />
              ))}
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={20} color={C.muted} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} style={{ flexGrow: 0 }}>
            {step === 0 && (
              <>
                <Text style={styles.q}>What's your experience?</Text>
                <Text style={styles.qSub}>Sets the exercises, volume and rep ranges.</Text>
                {LEVELS.map(l => (
                  <Option key={l.key} on={level === l.key} onPress={() => setLevel(l.key)}>
                    <View style={[styles.optIcon, { backgroundColor: C.accent + '1A' }]}>
                      <Ionicons name={l.icon as any} size={18} color={C.accent} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.optTitle}>{l.title}</Text>
                      <Text style={styles.optSub}>{l.sub}</Text>
                    </View>
                    {level === l.key && <Ionicons name="checkmark-circle" size={20} color={C.accent} />}
                  </Option>
                ))}
              </>
            )}

            {step === 1 && (
              <>
                <Text style={styles.q}>How long per workout?</Text>
                <Text style={styles.qSub}>Including a short warm-up.</Text>
                <View style={styles.grid}>
                  {MINUTES.map(m => (
                    <TouchableOpacity key={m} onPress={() => setMinutes(m)} activeOpacity={0.85}
                      style={[styles.bigChip, minutes === m && { borderColor: C.accent, backgroundColor: C.accent + '14' }]}>
                      <Text style={[styles.bigChipNum, minutes === m && { color: C.accent }]}>{m}</Text>
                      <Text style={styles.bigChipUnit}>min</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={styles.hint}>≈ {exercisesPerSession(level, minutes)} exercises per session</Text>
              </>
            )}

            {step === 2 && (
              <>
                <Text style={styles.q}>Days per week?</Text>
                <Text style={styles.qSub}>Pick what you can stick to — consistency beats everything.</Text>
                <View style={styles.grid}>
                  {DAYS.map(d => (
                    <TouchableOpacity key={d} onPress={() => chooseDays(d)} activeOpacity={0.85}
                      style={[styles.bigChip, days === d && { borderColor: C.accent, backgroundColor: C.accent + '14' }]}>
                      <Text style={[styles.bigChipNum, days === d && { color: C.accent }]}>{d}</Text>
                      <Text style={styles.bigChipUnit}>days</Text>
                      {RECOMMENDED_DAYS[level] === d && <View style={styles.recDot} />}
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={styles.hint}>
                  <Text style={{ color: C.green }}>●</Text> Recommended for {LEVELS.find(l => l.key === level)!.title.toLowerCase()}s: {RECOMMENDED_DAYS[level]} days
                </Text>
              </>
            )}

            {step === 3 && (
              <>
                <Text style={styles.q}>Which are your rest days?</Text>
                <Text style={styles.qSub}>Pick {needRest} {needRest === 1 ? 'day' : 'days'} off.</Text>
                <View style={styles.week}>
                  {WEEK_ORDER.map(d => {
                    const rest = restDays.includes(d);
                    return (
                      <TouchableOpacity key={d} onPress={() => toggleRest(d)} activeOpacity={0.8} style={styles.weekCol}>
                        <View style={[styles.weekDay, rest ? { backgroundColor: C.border } : { backgroundColor: C.accent }]}>
                          <Text style={[styles.weekLetter, { color: rest ? C.muted : '#fff' }]}>{LETTERS[d]}</Text>
                        </View>
                        <Text style={[styles.weekLbl, { color: rest ? C.muted : C.accent }]}>{rest ? 'Rest' : 'Train'}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <Text style={[styles.hint, !restOk && { color: C.orange }]}>
                  {restOk ? 'Looks good' : `${restDays.length} of ${needRest} rest days selected`}
                </Text>
              </>
            )}

            {step === 4 && (
              <>
                <Text style={styles.kicker}>Your split</Text>
                <Text style={styles.planName}>{plan.name}</Text>
                <Text style={styles.qSub}>{plan.summary}</Text>
                <View style={styles.rx}>
                  <Ionicons name="barbell-outline" size={16} color={C.accent} />
                  <Text style={styles.rxTxt}>{plan.prescription}</Text>
                </View>
                {plan.days.map(d => {
                  const open = openDay === d.weekday;
                  return (
                    <View key={d.weekday} style={[styles.dayRow, d.rest && { opacity: 0.55 }]}>
                      <TouchableOpacity disabled={d.rest} onPress={() => setOpenDay(open ? null : d.weekday)}
                        activeOpacity={0.75} style={styles.dayHead}>
                        <Text style={styles.dayName}>{DAY_NAMES[d.weekday].slice(0, 3)}</Text>
                        <Text style={styles.dayTitle}>{d.title}</Text>
                        {!d.rest && <Text style={styles.dayCount}>{d.exercises.length} ex</Text>}
                        {!d.rest && <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={C.muted} />}
                      </TouchableOpacity>
                      {open && d.exercises.map(e => (
                        <View key={e.name} style={styles.exRow}>
                          <View style={[styles.exDot, { backgroundColor: C.mg[e.muscle] ?? C.accent }]} />
                          <Text style={styles.exName} numberOfLines={1}>{e.name}</Text>
                          <Text style={styles.exDose}>{e.sets} × {e.reps}</Text>
                          <ExerciseGuideButton name={e.name} color={C.mg[e.muscle] ?? C.accent} />
                        </View>
                      ))}
                    </View>
                  );
                })}
              </>
            )}
          </ScrollView>

          <View style={styles.footer}>
            {step > 0 && (
              <TouchableOpacity onPress={() => setStep(s => s - 1)} style={styles.backBtn} activeOpacity={0.8}>
                <Text style={styles.backTxt}>Back</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={() => (step < STEPS - 1 ? setStep(s => s + 1) : apply())}
              disabled={!canNext} activeOpacity={0.85}
              style={[styles.nextBtn, !canNext && { opacity: 0.4 }]}>
              <Text style={styles.nextTxt}>{step === STEPS - 2 ? 'Build my split' : step === STEPS - 1 ? 'Use this plan' : 'Next'}</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

/** Planner header card: the current split at a glance, or a prompt to build one. */
export function SplitCard({ config, plans, onOpen }: {
  config: SplitConfig | null;
  plans: { day_of_week: string; muscle_groups: string }[];
  onOpen: () => void;
}) {
  const { C } = useTheme();
  const styles = makeStyles(C);
  const todayIdx = new Date().getDay();

  if (!config) {
    return (
      <TouchableOpacity onPress={onOpen} activeOpacity={0.85} style={[styles.card, { flexDirection: 'row', alignItems: 'center' }]}>
        <View style={[styles.optIcon, { backgroundColor: C.accent + '1A', width: 44, height: 44, borderRadius: 14 }]}>
          <Ionicons name="sparkles-outline" size={20} color={C.accent} />
        </View>
        <View style={{ flex: 1, marginHorizontal: 12 }}>
          <Text style={styles.optTitle}>Build your split</Text>
          <Text style={styles.optSub}>4 quick questions → a weekly plan made for you</Text>
        </View>
        <View style={styles.startPill}><Text style={styles.startTxt}>Start</Text></View>
      </TouchableOpacity>
    );
  }

  const levelName = LEVELS.find(l => l.key === config.level)?.title ?? '';
  const isRest = (d: number) => (plans.find(p => p.day_of_week === DAY_NAMES[d])?.muscle_groups ?? 'Rest') === 'Rest';

  return (
    <View style={styles.card}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          <Text style={styles.kicker}>Your split</Text>
          <Text style={[styles.planName, { fontSize: 20 }]}>{config.name}</Text>
          <Text style={styles.optSub}>{levelName} · {config.daysPerWeek} days · {config.minutes} min</Text>
        </View>
        <TouchableOpacity onPress={onOpen} activeOpacity={0.8} style={styles.changePill}>
          <Ionicons name="options-outline" size={14} color={C.accent} />
          <Text style={styles.changeTxt}>Change</Text>
        </TouchableOpacity>
      </View>
      <View style={[styles.week, { marginTop: 14 }]}>
        {WEEK_ORDER.map(d => {
          const rest = isRest(d);
          const today = d === todayIdx;
          return (
            <View key={d} style={styles.weekCol}>
              <View style={[styles.miniDay, rest ? { backgroundColor: C.bg } : { backgroundColor: C.accent + '26' },
                today && { borderColor: C.accent, borderWidth: 2 }]}>
                <Text style={[styles.miniLetter, { color: rest ? C.muted : C.accent }]}>{LETTERS[d]}</Text>
              </View>
              <View style={[styles.miniDot, { backgroundColor: rest ? 'transparent' : C.accent }]} />
            </View>
          );
        })}
      </View>
    </View>
  );
}

function makeStyles(C: any) {
  return StyleSheet.create({
    card:      { backgroundColor: C.card, borderRadius: 20, padding: 16, borderWidth: 1, borderColor: C.border, marginBottom: 6 },
    startPill: { backgroundColor: C.accent, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 9 },
    startTxt:  { color: '#fff', fontWeight: '800', fontSize: 13 },
    changePill:{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, backgroundColor: C.accent + '14', borderWidth: 1, borderColor: C.accent + '40' },
    changeTxt: { fontSize: 12, fontWeight: '800', color: C.accent },
    miniDay:   { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border },
    miniLetter:{ fontSize: 13, fontWeight: '800' },
    miniDot:   { width: 4, height: 4, borderRadius: 2 },
    overlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
    sheet:     { backgroundColor: C.card, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: 24, maxHeight: '92%', borderWidth: 1, borderColor: C.border },
    handle:    { width: 40, height: 5, backgroundColor: C.border, borderRadius: 3, alignSelf: 'center', marginBottom: 14 },
    topRow:    { flexDirection: 'row', alignItems: 'center', marginBottom: 18 },
    dots:      { flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center' },
    dot:       { width: 6, height: 6, borderRadius: 3, backgroundColor: C.border },
    q:         { fontSize: 22, fontWeight: '800', color: C.text },
    qSub:      { fontSize: 13, color: C.muted, fontWeight: '600', marginTop: 4, marginBottom: 16, lineHeight: 19 },
    option:    { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, borderWidth: 1, borderColor: C.border, backgroundColor: C.bg, marginBottom: 10 },
    optIcon:   { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    optTitle:  { fontSize: 15, fontWeight: '800', color: C.text },
    optSub:    { fontSize: 12, color: C.muted, fontWeight: '600', marginTop: 2 },
    grid:      { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    bigChip:   { width: 76, height: 76, borderRadius: 18, borderWidth: 1, borderColor: C.border, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' },
    bigChipNum:{ fontSize: 24, fontWeight: '800', color: C.text },
    bigChipUnit: { fontSize: 11, fontWeight: '700', color: C.muted },
    recDot:    { position: 'absolute', top: 8, right: 8, width: 7, height: 7, borderRadius: 4, backgroundColor: C.green },
    hint:      { fontSize: 12, color: C.muted, fontWeight: '700', marginTop: 14 },
    week:      { flexDirection: 'row', justifyContent: 'space-between' },
    weekCol:   { alignItems: 'center', gap: 6 },
    weekDay:   { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
    weekLetter:{ fontSize: 14, fontWeight: '800' },
    weekLbl:   { fontSize: 10, fontWeight: '800' },
    kicker:    { fontSize: 11, fontWeight: '800', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.7 },
    planName:  { fontSize: 26, fontWeight: '800', color: C.accent, marginTop: 2 },
    rx:        { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.bg, borderRadius: 12, padding: 10, marginBottom: 12, borderWidth: 1, borderColor: C.border },
    rxTxt:     { flex: 1, fontSize: 12, fontWeight: '700', color: C.textSub },
    dayRow:    { borderBottomWidth: 1, borderBottomColor: C.border },
    dayHead:   { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
    dayName:   { width: 44, fontSize: 13, fontWeight: '800', color: C.muted },
    dayTitle:  { flex: 1, fontSize: 15, fontWeight: '800', color: C.text },
    dayCount:  { fontSize: 12, fontWeight: '700', color: C.muted, marginRight: 8 },
    exRow:     { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingLeft: 44 },
    exDot:     { width: 6, height: 6, borderRadius: 3, marginRight: 8 },
    exName:    { flex: 1, fontSize: 13, fontWeight: '600', color: C.textSub },
    exDose:    { fontSize: 12, fontWeight: '800', color: C.text },
    footer:    { flexDirection: 'row', gap: 10, marginTop: 16 },
    backBtn:   { paddingHorizontal: 20, paddingVertical: 14, borderRadius: 14, borderWidth: 1, borderColor: C.border },
    backTxt:   { fontSize: 15, fontWeight: '700', color: C.muted },
    nextBtn:   { flex: 1, backgroundColor: C.accent, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
    nextTxt:   { color: '#fff', fontWeight: '800', fontSize: 15 },
  });
}
