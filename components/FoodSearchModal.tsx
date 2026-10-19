// components/FoodSearchModal.tsx — Add food. Search finds everyday foods instantly (built in, works
// offline, forgiving of typos) and then packaged products from Open Food Facts (free, no API key);
// foods you had lately are one tap away; or type a food in yourself. Picking a food slides up its
// portion editor. Every food is logged the moment it's added (the tray at the bottom lists them and
// takes one back out), so there's no save step.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, Modal, StyleSheet, TouchableOpacity, TextInput, ScrollView, Pressable, useWindowDimensions,
} from 'react-native';
import Animated, {
  Easing, FadeIn, FadeInDown, FadeInLeft, FadeInRight, FadeOut, LinearTransition, SlideInDown, SlideOutDown, ZoomIn,
  useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../contexts/ThemeContext';
import { addFood, deleteFoodEntry, getRecentFoods, getTodayLog, getGoals } from '../db/database';
import { POPULAR_FOODS, searchCommonFoods, CommonFood } from '../constants/foods';
import {
  FoodItem, Portion, fromCommon, searchFoodsOnline, logName, fmtNum, servingMacros, per100Macros,
} from '../utils/foodScannerService';
import { FoodRow, PortionEditor, AddButton, MacroSplitBar, useKeyboardHeight, useLiftWhileTyping, iconFor, tintFor } from './FoodPortion';
import { PillSwitch } from './PillSwitch';
import { ScanIcon } from './ScanIcon';

interface Added { id: number; name: string; kcal: number; protein: number }
type Recent = { food_name: string; protein: number; calories: number };
type Tab = 'search' | 'manual';

const r1 = (n: number) => Math.round(n * 10) / 10;

export default function FoodSearchModal({ visible, onClose, onChanged, onOpenScanner }: {
  visible: boolean;
  onClose: () => void;
  onChanged: () => void;            // a food was logged or taken back out
  onOpenScanner?: () => void;
}) {
  const { C } = useTheme();
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  const kb = useKeyboardHeight();

  const [tab, setTab] = useState<Tab>('search');
  const [tabDir, setTabDir] = useState<1 | -1>(1);
  const [query, setQuery] = useState('');
  const [online, setOnline] = useState<FoodItem[]>([]);
  const [onlineState, setOnlineState] = useState<'idle' | 'loading' | 'done' | 'offline'>('idle');
  const [recent, setRecent] = useState<Recent[]>([]);
  const [picked, setPicked] = useState<FoodItem | null>(null);
  const [pickKey, setPickKey] = useState(0);
  const [added, setAdded] = useState<Added[]>([]);
  const [trayOpen, setTrayOpen] = useState(false);
  const [today, setToday] = useState({ kcal: 0, protein: 0 });
  const [goals, setGoals] = useState<{ calorie_goal: number; protein_goal: number } | undefined>();

  // Typed-in food
  const [mName, setMName] = useState('');
  const [mGrams, setMGrams] = useState('');
  const [mVals, setMVals] = useState({ kcal: '', protein: '', carbs: '', fat: '' });
  // The form scrolls the box being typed in up above the keyboard
  const manualScroll = useRef<ScrollView>(null);
  const [gridY, setGridY] = useState(0);
  const [mTyping, setMTyping] = useState(false);
  const typeAt = (y: number) => {
    setMTyping(true);
    setTimeout(() => manualScroll.current?.scrollTo({ y: Math.max(0, y), animated: true }), 90);
  };
  const lift = useLiftWhileTyping(kb);

  const refreshToday = useCallback(() => {
    const log = getTodayLog();
    setToday({ kcal: log.calorie_intake || 0, protein: log.protein_intake || 0 });
  }, []);

  // Every opening starts fresh on the search
  useEffect(() => {
    if (!visible) return;
    setTab('search'); setQuery(''); setPicked(null); setAdded([]); setTrayOpen(false);
    setMName(''); setMGrams(''); setMVals({ kcal: '', protein: '', carbs: '', fat: '' });
    setRecent(getRecentFoods(8));
    setGoals(getGoals());
    refreshToday();
  }, [visible, refreshToday]);

  // Everyday foods match as you type; packaged products follow once typing pauses
  const q = query.trim();
  const local = useMemo(() => searchCommonFoods(q, 20), [q]);
  useEffect(() => {
    if (q.length < 2) { setOnline([]); setOnlineState('idle'); return; }
    setOnlineState('loading');
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      const res = await searchFoodsOnline(q, ctrl.signal);
      if (ctrl.signal.aborted) return;
      setOnline(res ?? []);
      setOnlineState(res ? 'done' : 'offline');
    }, 380);
    return () => { clearTimeout(timer); ctrl.abort(); };
  }, [q]);

  const switchTab = (t: Tab) => {
    setTabDir(t === 'manual' ? 1 : -1);
    setTab(t);
  };

  const logIt = (name: string, kcal: number, protein: number) => {
    const id = addFood(name, r1(protein), Math.round(kcal));
    setAdded(a => [...a, { id, name, kcal: Math.round(kcal), protein: r1(protein) }]);
    refreshToday();
    onChanged();
  };
  const takeOut = (id: number) => {
    Haptics.selectionAsync().catch(() => {});
    deleteFoodEntry(id);
    setAdded(a => {
      const next = a.filter(x => x.id !== id);
      if (!next.length) setTrayOpen(false);
      return next;
    });
    refreshToday();
    onChanged();
  };
  const pick = (item: FoodItem) => {
    Haptics.selectionAsync().catch(() => {});
    setPickKey(k => k + 1);
    setPicked(item);
  };
  const addPicked = (p: Portion, name: string) => {
    if (!picked) return;
    logIt(logName(name || picked.name, p), p.kcal, p.protein);
    setPicked(null);
  };

  // ── Typed-in food: energy left empty is worked out from the macros ──
  const mNum = (s: string) => { const v = parseFloat(s.replace(',', '.')); return isNaN(v) ? 0 : Math.max(0, v); };
  const mMacros = { protein: mNum(mVals.protein), carbs: mNum(mVals.carbs), fat: mNum(mVals.fat) };
  const fromMacros = Math.round(mMacros.protein * 4 + mMacros.carbs * 4 + mMacros.fat * 9);
  const mKcal = mVals.kcal.trim() ? Math.round(mNum(mVals.kcal)) : fromMacros;
  const canAddManual = mKcal > 0 || mMacros.protein > 0;
  const addManual = () => {
    const grams = mNum(mGrams);
    const name = mName.trim() || 'Food';
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    logIt(grams ? `${name} · ${fmtNum(grams)} g` : name, mKcal, mMacros.protein);
    setMName(''); setMGrams(''); setMVals({ kcal: '', protein: '', carbs: '', fat: '' });
  };

  const trayKcal = added.reduce((n, a) => n + a.kcal, 0);
  const trayProtein = added.reduce((n, a) => n + a.protein, 0);
  const showTray = added.length > 0 && !picked && kb === 0;
  const bottomPad = insets.bottom + (showTray ? 104 : 24) + kb;

  // ── Rows ──
  const commonRow = (f: CommonFood, i: number) => {
    const item = fromCommon(f);
    const per = f.serving.unit === 'portion'
      ? { kcal: f.per100.kcal, protein: f.per100.protein, text: `100 ${item.unit}` }
      : { kcal: (f.per100.kcal * f.serving.grams) / 100, protein: (f.per100.protein * f.serving.grams) / 100, text: `1 ${f.serving.unit} · ${f.serving.grams} ${item.unit}` };
    return (
      <FoodRow key={f.name} index={i} name={f.name} kcal={per.kcal} macros={f.per100}
        detail={`${per.text} · ${fmtNum(per.protein)} g protein${f.approx ? ' · approx' : ''}`}
        icon={iconFor(f.name)} tint={tintFor(f.per100, C)} onPress={() => pick(item)} />
    );
  };
  const onlineRow = (item: FoodItem, i: number) => {
    const serv = servingMacros(item);
    const m = serv ?? per100Macros(item)!;
    const basis = serv ? `1 ${item.servingUnit}${item.servingGrams ? ` (${fmtNum(item.servingGrams)} ${item.unit})` : ''}` : `100 ${item.unit}`;
    return (
      <FoodRow key={`${item.barcode ?? item.name}-${i}`} index={i} name={item.name} kcal={m.kcal} macros={m}
        detail={`${item.brand ? `${item.brand} · ` : ''}${basis} · ${fmtNum(m.protein)} g protein`}
        icon="cube-outline" tint={tintFor(m, C)} onPress={() => pick(item)} />
    );
  };

  const searchPane = (
    <View style={{ flex: 1 }}>
      <View style={[styles.searchBox, { backgroundColor: C.card, borderColor: q ? C.accent + '88' : C.border }]}>
        <Ionicons name="search" size={19} color={q ? C.accent : C.muted} />
        <TextInput
          style={[styles.searchInput, { color: C.text }]}
          value={query} onChangeText={setQuery}
          placeholder="Search foods: paneer, oats, banana…" placeholderTextColor={C.muted}
          returnKeyType="search" autoCorrect={false} autoCapitalize="none"
        />
        {q ? (
          <TouchableOpacity onPress={() => setQuery('')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close-circle" size={19} color={C.muted} />
          </TouchableOpacity>
        ) : null}
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: bottomPad }}>
        {!q ? (
          <>
            {recent.length > 0 && (
              <Section title="Recent" note="tap to add it again">
                {recent.map((r, i) => (
                  <FoodRow key={r.food_name} index={i} name={r.food_name} kcal={r.calories}
                    detail={`${fmtNum(r.protein)} g protein`} icon="time-outline" tint={C.accent}
                    onPress={() => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}); logIt(r.food_name, r.calories, r.protein); }}
                    onQuickAdd={() => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}); logIt(r.food_name, r.calories, r.protein); }} />
                ))}
              </Section>
            )}
            <Section title="Popular">
              {POPULAR_FOODS.map((f, i) => commonRow(f, i + recent.length))}
            </Section>
            <Text style={[styles.foot, { color: C.muted }]}>
              Search covers everyday foods (works offline) and packaged products from Open Food Facts.
            </Text>
          </>
        ) : (
          <>
            {local.length > 0 && <Section title="Everyday foods">{local.map(commonRow)}</Section>}
            <Section title="Packaged products" right={onlineState === 'loading' ? <Pulse color={C.accent} /> : null}>
              {onlineState === 'loading' && !online.length && [0, 1, 2].map(i => <SkeletonRow key={i} delay={i * 120} />)}
              {/* The last search's products fade while the new ones load */}
              <View style={{ opacity: onlineState === 'loading' ? 0.45 : 1 }}>{online.map(onlineRow)}</View>
              {onlineState === 'offline' && (
                <Text style={[styles.hint, { color: C.muted }]}>Couldn't reach Open Food Facts. Check your connection: everyday foods above still work offline.</Text>
              )}
              {onlineState === 'done' && !online.length && (
                <Text style={[styles.hint, { color: C.muted }]}>No packaged products match "{q}".</Text>
              )}
            </Section>
            {!local.length && onlineState !== 'loading' && !online.length && (
              <Animated.View entering={FadeInDown.duration(300)} style={[styles.empty, { borderColor: C.border, backgroundColor: C.card }]}>
                <Ionicons name="create-outline" size={26} color={C.accent} />
                <Text style={[styles.emptyTitle, { color: C.text }]}>Not on the list?</Text>
                <Text style={[styles.emptySub, { color: C.muted }]}>Type it in with its calories and macros.</Text>
                <TouchableOpacity style={[styles.emptyBtn, { backgroundColor: C.accent }]} activeOpacity={0.85}
                  onPress={() => { setMName(q.charAt(0).toUpperCase() + q.slice(1)); switchTab('manual'); }}>
                  <Text style={styles.emptyBtnTxt}>Add "{q}" yourself</Text>
                </TouchableOpacity>
              </Animated.View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );

  const field = (key: keyof typeof mVals, label: string, unit: string, color: string, i: number) => (
    <Animated.View key={key} entering={FadeInDown.delay(80 + i * 50).duration(300)}
      style={[styles.mField, { backgroundColor: C.card, borderColor: C.border }]}>
      <View style={[styles.mBar, { backgroundColor: color }]} />
      <Text style={[styles.mLbl, { color: C.muted }]}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
        <TextInput style={[styles.mInput, { color: C.text }]} value={mVals[key]} keyboardType="decimal-pad" maxLength={6}
          onChangeText={v => setMVals(s => ({ ...s, [key]: v }))}
          onFocus={() => typeAt(gridY - 34)} onBlur={() => setMTyping(false)}
          placeholder={key === 'kcal' && fromMacros > 0 ? String(fromMacros) : '0'} placeholderTextColor={C.muted} />
        <Text style={[styles.mUnit, { color: C.muted }]}>{unit}</Text>
      </View>
    </Animated.View>
  );

  const manualPane = (
    <ScrollView ref={manualScroll} keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ padding: 16, paddingBottom: bottomPad + (mTyping && !kb ? Math.round(winH * 0.42) : 0) }}>
      <Animated.View entering={FadeInDown.duration(300)} style={[styles.mCard, { backgroundColor: C.card, borderColor: C.border }]}>
        <Text style={[styles.mLbl, { color: C.muted }]}>Food</Text>
        <TextInput style={[styles.mName, { color: C.text }]} value={mName} onChangeText={setMName}
          onFocus={() => typeAt(0)} onBlur={() => setMTyping(false)}
          placeholder="e.g. Chicken rice bowl" placeholderTextColor={C.muted} returnKeyType="next" />
        <View style={[styles.mDivider, { backgroundColor: C.border }]} />
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={[styles.mLbl, { color: C.muted, flex: 1 }]}>How much (optional)</Text>
          <TextInput style={[styles.mGrams, { color: C.text }]} value={mGrams} onChangeText={setMGrams} keyboardType="decimal-pad"
            onFocus={() => typeAt(0)} onBlur={() => setMTyping(false)}
            placeholder="—" placeholderTextColor={C.muted} maxLength={5} />
          <Text style={[styles.mUnit, { color: C.muted }]}>g</Text>
        </View>
      </Animated.View>

      <Text style={[styles.mSection, { color: C.muted }]}>FOR THAT AMOUNT</Text>
      <View style={styles.mGrid} onLayout={e => setGridY(e.nativeEvent.layout.y)}>
        {field('kcal', 'Energy', 'kcal', C.calories, 0)}
        {field('protein', 'Protein', 'g', C.protein, 1)}
        {field('carbs', 'Carbs', 'g', C.carbs, 2)}
        {field('fat', 'Fat', 'g', C.fat, 3)}
      </View>
      {!mVals.kcal.trim() && fromMacros > 0 && (
        <Animated.Text entering={FadeIn} style={[styles.hint, { color: C.muted, marginTop: 8 }]}>
          Energy left empty: {fromMacros} kcal worked out from the macros.
        </Animated.Text>
      )}
      {(mMacros.protein + mMacros.carbs + mMacros.fat) > 0 && (
        <Animated.View entering={FadeIn} style={{ marginTop: 14 }}>
          <MacroSplitBar m={mMacros} height={7} />
        </Animated.View>
      )}
      <View style={{ marginTop: 18 }}>
        <AddButton label={canAddManual ? `Add to today · ${mKcal} kcal` : 'Add to today'} disabled={!canAddManual} onPress={addManual} />
      </View>
    </ScrollView>
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={() => (picked ? setPicked(null) : onClose())} statusBarTranslucent navigationBarTranslucent>
      <View style={[styles.container, { backgroundColor: C.bg }]}>
        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top + 10, borderBottomColor: C.border }]}>
          <TouchableOpacity onPress={onClose} style={[styles.iconBtn, { backgroundColor: C.card, borderColor: C.border }]}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel="Close">
            <Ionicons name="close" size={20} color={C.text} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: C.text }]}>Add food</Text>
            <Text style={[styles.sub, { color: C.muted }]}>
              Today · <Text style={{ color: C.calories, fontWeight: '800' }}>{today.kcal} kcal</Text> · <Text style={{ color: C.protein, fontWeight: '800' }}>{fmtNum(today.protein)} g protein</Text>
            </Text>
          </View>
          {onOpenScanner && (
            <TouchableOpacity onPress={() => { onClose(); onOpenScanner(); }} activeOpacity={0.85}
              style={[styles.scanBtn, { backgroundColor: C.accent + '1A', borderColor: C.accent + '55' }]} accessibilityLabel="Scan a barcode or label">
              <ScanIcon size={17} color={C.accent} />
              <Text style={[styles.scanTxt, { color: C.accent }]}>Scan</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.switchWrap}>
          <PillSwitch
            options={[{ key: 'search', label: 'Search', icon: 'search' }, { key: 'manual', label: 'Type it in', icon: 'create-outline' }]}
            value={tab} onChange={switchTab} color={C.accent}
          />
        </View>

        {/* The pane slides in from the side of the option picked */}
        <Animated.View key={tab} style={{ flex: 1 }}
          entering={(tabDir > 0 ? FadeInRight : FadeInLeft).duration(260).easing(Easing.out(Easing.cubic))}>
          {tab === 'search' ? searchPane : manualPane}
        </Animated.View>

        {/* What's been added this time, with a way to take each back out */}
        {showTray && (
          <Animated.View entering={SlideInDown.springify().damping(18).stiffness(170)} exiting={SlideOutDown.duration(200)}
            layout={LinearTransition.springify().damping(18)}
            style={[styles.tray, { paddingBottom: insets.bottom + 12, backgroundColor: C.card, borderColor: C.border }]}>
            {trayOpen && added.map(a => (
              <Animated.View key={a.id} entering={FadeInDown.duration(200)} exiting={FadeOut.duration(150)}
                style={[styles.trayItem, { borderBottomColor: C.border }]}>
                <Text style={[styles.trayItemName, { color: C.text }]} numberOfLines={1}>{a.name}</Text>
                <Text style={[styles.trayItemKcal, { color: C.muted }]}>{a.kcal} kcal</Text>
                <TouchableOpacity onPress={() => takeOut(a.id)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel={`Take ${a.name} out`}>
                  <Ionicons name="close-circle" size={20} color={C.red} />
                </TouchableOpacity>
              </Animated.View>
            ))}
            <View style={styles.trayRow}>
              <Pressable style={{ flex: 1 }} onPress={() => setTrayOpen(o => !o)}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Animated.View key={added.length} entering={ZoomIn.springify()} style={[styles.trayCount, { backgroundColor: C.accent }]}>
                    <Text style={styles.trayCountTxt}>{added.length}</Text>
                  </Animated.View>
                  <Text style={[styles.trayTitle, { color: C.text }]}>added · {trayKcal} kcal · {fmtNum(trayProtein)} g protein</Text>
                </View>
                <Text style={[styles.traySub, { color: C.muted }]}>{trayOpen ? 'Tap × to take one out' : 'Tap to see them'}</Text>
              </Pressable>
              <TouchableOpacity onPress={onClose} style={[styles.doneBtn, { backgroundColor: C.accent }]} activeOpacity={0.85}>
                <Text style={styles.doneTxt}>Done</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        )}

        {/* The picked food's portion editor */}
        {picked && (
          <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(200)} style={[StyleSheet.absoluteFill, styles.backdrop]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setPicked(null)} accessibilityLabel="Close" />
          </Animated.View>
        )}
        {picked && (
          <Animated.View entering={SlideInDown.springify().damping(20).stiffness(190)} exiting={SlideOutDown.duration(220)}
            style={[styles.sheet, {
              backgroundColor: C.card, borderColor: C.border, bottom: kb,
              maxHeight: winH - insets.top - 24 - kb, paddingBottom: (kb ? 12 : insets.bottom + 14),
            }]}>
            <View style={[styles.handle, { backgroundColor: C.border }]} />
            <ScrollView ref={lift.ref} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 4 + lift.extra }}>
              <PortionEditor key={pickKey} item={picked} onChange={setPicked} onAdd={addPicked} goals={goals} onTyping={lift.onTyping} />
            </ScrollView>
          </Animated.View>
        )}
      </View>
    </Modal>
  );
}

function Section({ title, note, right, children }: { title: string; note?: string; right?: React.ReactNode; children: React.ReactNode }) {
  const { C } = useTheme();
  return (
    <View style={{ marginTop: 14 }}>
      <View style={styles.sectionHead}>
        <Text style={[styles.sectionTitle, { color: C.muted }]}>{title.toUpperCase()}</Text>
        {note ? <Text style={[styles.sectionNote, { color: C.muted }]}>{note}</Text> : null}
        <View style={{ flex: 1 }} />
        {right}
      </View>
      {children}
    </View>
  );
}

/** A placeholder row that breathes while packaged products load. */
function SkeletonRow({ delay }: { delay: number }) {
  const { C } = useTheme();
  const o = useSharedValue(0.4);
  useEffect(() => {
    const t = setTimeout(() => {
      o.value = withRepeat(withSequence(withTiming(1, { duration: 650 }), withTiming(0.4, { duration: 650 })), -1, false);
    }, delay);
    return () => clearTimeout(t);
  }, [o, delay]);
  const st = useAnimatedStyle(() => ({ opacity: o.value }));
  return (
    <Animated.View style={[styles.skel, { backgroundColor: C.card, borderColor: C.border }, st]}>
      <View style={[styles.skelIcon, { backgroundColor: C.border }]} />
      <View style={{ flex: 1, gap: 7 }}>
        <View style={[styles.skelLine, { width: '70%', backgroundColor: C.border }]} />
        <View style={[styles.skelLine, { width: '45%', backgroundColor: C.border }]} />
      </View>
    </Animated.View>
  );
}

/** Three dots that pulse in turn: still searching. */
function Pulse({ color }: { color: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 4 }}>
      {[0, 1, 2].map(i => <PulseDot key={i} color={color} delay={i * 160} />)}
    </View>
  );
}
function PulseDot({ color, delay }: { color: string; delay: number }) {
  const s = useSharedValue(0.5);
  useEffect(() => {
    const t = setTimeout(() => {
      s.value = withRepeat(withSequence(withTiming(1, { duration: 320 }), withTiming(0.5, { duration: 320 })), -1, false);
    }, delay);
    return () => clearTimeout(t);
  }, [s, delay]);
  const st = useAnimatedStyle(() => ({ opacity: s.value, transform: [{ scale: s.value }] }));
  return <Animated.View style={[{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }, st]} />;
}

const styles = StyleSheet.create({
  container:   { flex: 1 },
  header:      { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1 },
  iconBtn:     { width: 40, height: 40, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  title:       { fontSize: 21, fontWeight: '900' },
  sub:         { fontSize: 12, fontWeight: '600', marginTop: 1 },
  scanBtn:     { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 40, borderRadius: 13, borderWidth: 1 },
  scanTxt:     { fontSize: 13, fontWeight: '900' },
  switchWrap:  { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },

  searchBox:   { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, marginTop: 8, paddingHorizontal: 14, height: 52, borderRadius: 18, borderWidth: 1.5 },
  searchInput: { flex: 1, fontSize: 16, fontWeight: '700', paddingVertical: 0 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  sectionTitle:{ fontSize: 11, fontWeight: '900', letterSpacing: 0.8 },
  sectionNote: { fontSize: 11, fontWeight: '600' },
  hint:        { fontSize: 12.5, fontWeight: '600', lineHeight: 18, marginVertical: 6 },
  foot:        { fontSize: 11.5, fontWeight: '600', textAlign: 'center', marginTop: 16, lineHeight: 17, opacity: 0.9 },
  empty:       { alignItems: 'center', padding: 20, borderRadius: 20, borderWidth: 1, marginTop: 12, gap: 4 },
  emptyTitle:  { fontSize: 16, fontWeight: '900', marginTop: 4 },
  emptySub:    { fontSize: 13, fontWeight: '600' },
  emptyBtn:    { marginTop: 10, paddingHorizontal: 16, paddingVertical: 11, borderRadius: 14 },
  emptyBtnTxt: { color: '#fff', fontSize: 14, fontWeight: '900' },
  skel:        { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 18, borderWidth: 1, marginBottom: 8 },
  skelIcon:    { width: 40, height: 40, borderRadius: 13 },
  skelLine:    { height: 10, borderRadius: 5 },

  mCard:       { borderRadius: 20, borderWidth: 1, padding: 14 },
  mLbl:        { fontSize: 11.5, fontWeight: '800', letterSpacing: 0.3 },
  mName:       { fontSize: 19, fontWeight: '900', paddingVertical: 4, paddingHorizontal: 0 },
  mDivider:    { height: 1, marginVertical: 10 },
  mGrams:      { fontSize: 19, fontWeight: '900', minWidth: 60, textAlign: 'right', paddingVertical: 0 },
  mUnit:       { fontSize: 13, fontWeight: '700', marginLeft: 4 },
  mSection:    { fontSize: 11, fontWeight: '900', letterSpacing: 0.8, marginTop: 18, marginBottom: 8 },
  mGrid:       { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  mField:      { width: '47%', flexGrow: 1, borderRadius: 18, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, overflow: 'hidden' },
  mBar:        { position: 'absolute', left: 0, top: 12, bottom: 12, width: 3, borderRadius: 2 },
  mInput:      { fontSize: 26, fontWeight: '900', paddingVertical: 0, minWidth: 50 },

  tray:        { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, paddingHorizontal: 16, paddingTop: 12, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 14, shadowOffset: { width: 0, height: -4 }, elevation: 16 },
  trayRow:     { flexDirection: 'row', alignItems: 'center', gap: 12 },
  trayCount:   { minWidth: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  trayCountTxt:{ color: '#fff', fontSize: 12, fontWeight: '900' },
  trayTitle:   { fontSize: 14, fontWeight: '900', flexShrink: 1 },
  traySub:     { fontSize: 11.5, fontWeight: '600', marginTop: 2, marginLeft: 32 },
  trayItem:    { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderBottomWidth: 1 },
  trayItemName:{ flex: 1, fontSize: 13.5, fontWeight: '700' },
  trayItemKcal:{ fontSize: 12.5, fontWeight: '700' },
  doneBtn:     { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 14 },
  doneTxt:     { color: '#fff', fontSize: 15, fontWeight: '900' },

  backdrop:    { backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet:       { position: 'absolute', left: 0, right: 0, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, paddingHorizontal: 18, paddingTop: 10, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 18, shadowOffset: { width: 0, height: -6 }, elevation: 24 },
  handle:      { width: 42, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: 14 },
});
