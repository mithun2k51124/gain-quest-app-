// components/FoodPortion.tsx — what the food search and the scanner share: a food row for the lists,
// the bar that shows where a food's calories come from, and the portion editor: servings or grams with
// steppers and quick picks, the macros updating live, values you can correct (they apply as you type),
// what a nutrition label said (serving size, ingredients, allergens) and the Add button.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Pressable, StyleSheet, Keyboard, Image, ScrollView, useWindowDimensions,
} from 'react-native';
import Animated, { FadeIn, FadeInDown, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../contexts/ThemeContext';
import { PillSwitch } from './PillSwitch';
import {
  FoodItem, Macros, PortionMode, Portion, portionOf, canServe, canWeigh, servingMacros, per100Macros, unitName, fmtNum,
} from '../utils/foodScannerService';

/** The keyboard's height while it's open (modals draw edge to edge, so nothing moves up by itself). */
export function useKeyboardHeight(): number {
  const [h, setH] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', e => setH(e.endCoordinates?.height ?? 0));
    const hide = Keyboard.addListener('keyboardDidHide', () => setH(0));
    return () => { show.remove(); hide.remove(); };
  }, []);
  return h;
}

/**
 * For a scroll view in a sheet: while a value box low down has the keyboard, room is added under the
 * content and it scrolls up, so the box sits above the keyboard. Inside a modal Android doesn't always
 * report the keyboard (kb stays 0); when it does, the sheet itself moves up instead.
 */
export function useLiftWhileTyping(kb: number) {
  const ref = useRef<ScrollView>(null);
  const { height } = useWindowDimensions();
  const [typing, setTyping] = useState(false);
  const onTyping = useCallback((t: boolean) => {
    setTyping(t);
    if (t) setTimeout(() => ref.current?.scrollToEnd({ animated: true }), 90);
  }, []);
  return { ref, onTyping, extra: typing && !kb ? Math.round(height * 0.42) : 0 };
}

/** Where the calories come from: protein, carbs and fat as one bar. */
export function MacroSplitBar({ m, height = 5 }: { m: Pick<Macros, 'protein' | 'carbs' | 'fat'>; height?: number }) {
  const { C } = useTheme();
  const p = m.protein * 4, c = m.carbs * 4, f = m.fat * 9;
  const total = p + c + f;
  if (total <= 0) return <View style={[styles.split, { height, backgroundColor: C.border }]} />;
  return (
    <View style={[styles.split, { height, backgroundColor: C.border }]}>
      <View style={{ flex: p, backgroundColor: C.protein }} />
      <View style={{ flex: c, backgroundColor: C.carbs }} />
      <View style={{ flex: f, backgroundColor: C.fat }} />
    </View>
  );
}

/** One food in a list: name, portion, calories, where they come from, and an optional quick add. */
export function FoodRow({ name, detail, kcal, macros, icon = 'restaurant-outline', tint, onPress, onQuickAdd, index = 0 }: {
  name: string;
  detail: string;
  kcal: number;
  macros?: Pick<Macros, 'protein' | 'carbs' | 'fat'>;
  icon?: keyof typeof Ionicons.glyphMap;
  tint: string;
  onPress: () => void;
  onQuickAdd?: () => void;
  index?: number;
}) {
  const { C } = useTheme();
  const press = useSharedValue(1);
  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: press.value }] }));
  return (
    <Animated.View entering={index < 14 ? FadeInDown.delay(index * 35).duration(320) : undefined}>
      <Pressable onPress={onPress}
        onPressIn={() => { press.value = withSpring(0.97, { damping: 15, stiffness: 400 }); }}
        onPressOut={() => { press.value = withSpring(1, { damping: 10, stiffness: 260 }); }}>
        <Animated.View style={[styles.row, { backgroundColor: C.card, borderColor: C.border }, pressStyle]}>
          <View style={[styles.rowIcon, { backgroundColor: tint + '1F' }]}>
            <Ionicons name={icon} size={18} color={tint} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.rowName, { color: C.text }]} numberOfLines={1}>{name}</Text>
            <Text style={[styles.rowDetail, { color: C.muted }]} numberOfLines={1}>{detail}</Text>
            {macros && <View style={{ marginTop: 6 }}><MacroSplitBar m={macros} height={4} /></View>}
          </View>
          <View style={styles.rowKcal}>
            <Text style={[styles.rowKcalNum, { color: C.text }]}>{Math.round(kcal)}</Text>
            <Text style={[styles.rowKcalUnit, { color: C.muted }]}>kcal</Text>
          </View>
          {onQuickAdd && (
            <TouchableOpacity onPress={onQuickAdd} hitSlop={{ top: 10, bottom: 10, left: 6, right: 10 }}
              style={[styles.quickAdd, { backgroundColor: C.accent }]} accessibilityLabel={`Add ${name} again`}>
              <Ionicons name="add" size={18} color="#fff" />
            </TouchableOpacity>
          )}
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

/** A food's icon from its name: an egg, a fish, a cup, a leaf… */
export function iconFor(name: string): keyof typeof Ionicons.glyphMap {
  const n = name.toLowerCase();
  if (/\begg|omelet/.test(n)) return 'egg-outline';
  if (/fish|salmon|tuna|prawn|shrimp/.test(n)) return 'fish-outline';
  if (/pizza/.test(n)) return 'pizza-outline';
  if (/burger|fries|sandwich|samosa|momo|pav bhaji|chips|noodle/.test(n)) return 'fast-food-outline';
  if (/coffee|tea\b|chai/.test(n)) return 'cafe-outline';
  if (/beer/.test(n)) return 'beer-outline';
  if (/ice cream/.test(n)) return 'ice-cream-outline';
  if (/milk \(|juice|lassi|chaas|buttermilk|water|cola|drink/.test(n)) return 'water-outline';
  if (/banana|apple|orange|mango|grape|papaya|melon|pineapple|berr|pomegranate|guava|date|raisin|avocado|fruit/.test(n)) return 'nutrition-outline';
  if (/broccoli|spinach|carrot|cucumber|tomato|onion|salad|mushroom|peas|sabzi|vegetable|sprout/.test(n)) return 'leaf-outline';
  return 'restaurant-outline';
}

/** The colour of whichever macro gives a food most of its calories. */
export function tintFor(m: Pick<Macros, 'protein' | 'carbs' | 'fat'> | undefined, C: any): string {
  if (!m) return C.accent;
  const p = m.protein * 4, c = m.carbs * 4, f = m.fat * 9;
  if (p <= 0 && c <= 0 && f <= 0) return C.accent;
  return p >= c && p >= f ? C.protein : c >= f ? C.carbs : C.fat;
}

export function sourceOf(item: FoodItem): { icon: keyof typeof Ionicons.glyphMap; text: string } {
  const brand = item.brand ? ` · ${item.brand}` : '';
  switch (item.source) {
    case 'common': return { icon: 'nutrition-outline', text: item.approx ? 'Everyday food · home-style, values vary' : 'Everyday food' };
    case 'online': return { icon: 'globe-outline', text: `Open Food Facts${brand}` };
    case 'barcode': return { icon: 'barcode-outline', text: `Barcode ${item.barcode ?? ''}${brand}` };
    case 'label': return { icon: 'document-text-outline', text: 'Read from the label' };
    default: return { icon: 'create-outline', text: 'Typed in' };
  }
}

/** The amount people usually start from: 1 roti, 1 scoop, 100 g of chicken. */
export function startingPortion(item: FoodItem): { mode: PortionMode; amount: number } {
  if (canServe(item) && !(item.source === 'common' && item.servingUnit === 'portion')) return { mode: 'servings', amount: 1 };
  return { mode: 'grams', amount: 100 };
}

type ValueKey = 'kcal' | 'protein' | 'carbs' | 'fat';
const FIELDS: { key: ValueKey; label: string; unit: string }[] = [
  { key: 'kcal', label: 'Energy', unit: 'kcal' },
  { key: 'protein', label: 'Protein', unit: 'g' },
  { key: 'carbs', label: 'Carbs', unit: 'g' },
  { key: 'fat', label: 'Fat', unit: 'g' },
];

export function PortionEditor({ item, onChange, onAdd, goals, onTyping }: {
  item: FoodItem;
  onChange: (item: FoodItem) => void;      // values corrected by hand
  onAdd: (portion: Portion, name: string) => void;
  goals?: { calorie_goal: number; protein_goal: number };
  onTyping?: (typing: boolean) => void;    // a value box low in the sheet has the keyboard: lift it into view
}) {
  const { C, isDark } = useTheme();
  const start = startingPortion(item);
  const [name, setName] = useState(item.name);
  const [mode, setMode] = useState<PortionMode>(start.mode);
  const [amountText, setAmountText] = useState(fmtNum(start.amount));
  // A product with no values (or a label that was hard to read) opens straight into the values
  const [editing, setEditing] = useState(!item.hasNutrition || (item.label ? item.label.found < 3 : false));
  const amount = parseFloat(amountText.replace(',', '.'));
  const portion = portionOf(item, isNaN(amount) ? 0 : amount, mode);
  // A plain 100 g portion is just grams: no need to offer both
  const both = canServe(item) && canWeigh(item) && !(item.source === 'common' && item.servingUnit === 'portion');

  // Values typed in for a product that had none, or a serving size cleared: start from a sensible amount
  const hasValues = canServe(item) || canWeigh(item);
  const servable = canServe(item), weighable = canWeigh(item);
  useEffect(() => {
    if (!hasValues) return;
    if ((mode === 'servings' && !servable) || (mode === 'grams' && !weighable)) {
      const s = startingPortion(item);
      setMode(s.mode);
      setAmountText(fmtNum(s.amount));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasValues, servable, weighable]);

  // The total bumps whenever it changes
  const bump = useSharedValue(1);
  useEffect(() => {
    bump.value = withSequence(withTiming(1.1, { duration: 90 }), withSpring(1, { damping: 7, stiffness: 260 }));
  }, [portion.kcal, bump]);
  const bumpStyle = useAnimatedStyle(() => ({ transform: [{ scale: bump.value }] }));

  const step = mode === 'servings' ? 0.5 : (amount || 0) < 50 ? 5 : 10;
  const nudge = (dir: 1 | -1) => {
    Haptics.selectionAsync().catch(() => {});
    const cur = isNaN(amount) ? 0 : amount;
    const next = Math.max(step, Math.round((cur + dir * step) / step) * step);
    setAmountText(fmtNum(next));
  };
  const switchMode = (m: PortionMode) => {
    // Keep the same amount of food when switching: 1 roti ⇄ 40 g
    if (m === 'grams' && portion.grams) setAmountText(String(Math.round(portion.grams)));
    else if (m === 'servings' && item.servingGrams && !isNaN(amount)) setAmountText(fmtNum(Math.max(0.5, Math.round((amount / item.servingGrams) * 2) / 2)));
    else setAmountText(m === 'grams' ? '100' : '1');
    setMode(m);
  };

  const chips = mode === 'servings'
    ? [0.5, 1, 1.5, 2, 3]
    : [...new Set([...(item.servingGrams ? [Math.round(item.servingGrams)] : []), 50, 100, 150, 200, 250])].sort((a, b) => a - b).slice(0, 6);
  const unitLine = mode === 'servings'
    ? `${unitName(item.servingUnit, isNaN(amount) ? 0 : amount)}${portion.grams ? ` · ${Math.round(portion.grams)} ${item.unit}` : ''}`
    : item.unit === 'ml' ? 'millilitres' : 'grams';

  const energy = portion.protein * 4 + portion.carbs * 4 + portion.fat * 9;
  const share = (n: number) => (energy > 0 ? Math.round((n / energy) * 100) : 0);
  const tiles = [
    { key: 'protein', label: 'Protein', value: `${fmtNum(portion.protein)} g`, color: C.protein,
      note: goals?.protein_goal ? `${Math.round((portion.protein / goals.protein_goal) * 100)}% of goal` : `${share(portion.protein * 4)}% of kcal` },
    { key: 'carbs', label: 'Carbs', value: `${fmtNum(portion.carbs)} g`, color: C.carbs, note: `${share(portion.carbs * 4)}% of kcal` },
    { key: 'fat', label: 'Fat', value: `${fmtNum(portion.fat)} g`, color: C.fat, note: `${share(portion.fat * 9)}% of kcal` },
  ];

  const src = sourceOf(item);
  const base100 = per100Macros(item);
  const baseServ = servingMacros(item);

  return (
    <View>
      {/* What it is */}
      <View style={styles.headRow}>
        {item.image ? <Image source={{ uri: item.image }} style={[styles.thumb, { borderColor: C.border }]} /> : null}
        <View style={{ flex: 1 }}>
          <TextInput
            style={[styles.nameInput, { color: C.text, borderBottomColor: name.trim() ? 'transparent' : C.accent + '88' }]}
            value={name} onChangeText={setName} placeholder="Name this food" placeholderTextColor={C.muted}
            multiline={false} returnKeyType="done"
          />
          <View style={styles.srcRow}>
            <Ionicons name={src.icon} size={12} color={C.muted} />
            <Text style={[styles.srcTxt, { color: C.muted }]} numberOfLines={1}>{src.text}</Text>
          </View>
        </View>
      </View>

      {item.source === 'label' && <LabelInsights item={item} />}

      {!item.hasNutrition && !editing && (
        <Text style={[styles.note, { color: C.orange }]}>No nutrition values yet: add them below.</Text>
      )}

      {/* How much */}
      {(canServe(item) || canWeigh(item)) && (
        <Animated.View entering={FadeIn.duration(250)} style={[styles.amountCard, { backgroundColor: C.bg, borderColor: C.border }]}>
          {both && (
            <View style={{ marginBottom: 12 }}>
              <PillSwitch
                options={[
                  { key: 'servings', label: item.servingGrams ? `${item.servingUnit === 'serving' ? 'Servings' : cap(unitName(item.servingUnit, 2))} (${Math.round(item.servingGrams)} ${item.unit})` : 'Servings', icon: 'layers-outline' },
                  { key: 'grams', label: item.unit === 'ml' ? 'Millilitres' : 'Grams', icon: 'scale-outline' },
                ]}
                value={mode} onChange={switchMode} color={C.accent} height={36}
              />
            </View>
          )}
          <View style={styles.stepRow}>
            <StepButton icon="remove" onPress={() => nudge(-1)} />
            <View style={{ alignItems: 'center', flex: 1 }}>
              <TextInput
                style={[styles.amountInput, { color: C.text }]}
                value={amountText} onChangeText={setAmountText} keyboardType="decimal-pad" selectTextOnFocus
                returnKeyType="done" maxLength={6}
              />
              <Text style={[styles.unitLine, { color: C.muted }]} numberOfLines={1}>{unitLine}</Text>
            </View>
            <StepButton icon="add" onPress={() => nudge(1)} />
          </View>
          <View style={styles.chips}>
            {chips.map(v => {
              const on = Math.abs((amount || 0) - v) < 0.001;
              const label = mode === 'servings' ? ({ 0.5: '½', 1.5: '1½' } as Record<number, string>)[v] ?? String(v) : `${v} ${item.unit}`;
              return (
                <TouchableOpacity key={v} onPress={() => { Haptics.selectionAsync().catch(() => {}); setAmountText(fmtNum(v)); }} activeOpacity={0.8}
                  style={[styles.chip, { borderColor: on ? C.accent : C.border, backgroundColor: on ? C.accent + '22' : C.card }]}>
                  <Text style={[styles.chipTxt, { color: on ? C.accent : C.textSub }]}>{label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Animated.View>
      )}

      {/* What that adds up to */}
      <View style={[styles.totals, { backgroundColor: isDark ? '#0B1220' : '#EEF4FD', borderColor: C.accent + '33' }]}>
        <View style={styles.kcalRow}>
          <Animated.Text style={[styles.kcalBig, { color: C.text }, bumpStyle]}>{portion.kcal}</Animated.Text>
          <View style={{ marginLeft: 8, flex: 1 }}>
            <Text style={[styles.kcalUnit, { color: C.textSub }]}>kcal</Text>
            {goals?.calorie_goal ? (
              <Text style={[styles.kcalGoal, { color: C.muted }]}>{Math.round((portion.kcal / goals.calorie_goal) * 100)}% of your daily goal</Text>
            ) : null}
          </View>
        </View>
        <MacroSplitBar m={portion} height={6} />
        <View style={styles.tiles}>
          {tiles.map(t => (
            <View key={t.key} style={styles.tile}>
              <View style={styles.tileHead}>
                <View style={[styles.dot, { backgroundColor: t.color }]} />
                <Text style={[styles.tileLbl, { color: C.muted }]}>{t.label}</Text>
              </View>
              <Text style={[styles.tileVal, { color: t.color }]}>{t.value}</Text>
              <Text style={[styles.tileNote, { color: C.muted }]}>{t.note}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* The values everything is worked out from — correct them if the pack says otherwise */}
      <View style={[styles.valuesCard, { borderColor: C.border, backgroundColor: C.card }]}>
        <TouchableOpacity style={styles.valuesHead} onPress={() => setEditing(e => !e)} activeOpacity={0.8}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.valuesTitle, { color: C.text }]}>
              {base100 ? `Per 100 ${item.unit}` : baseServ ? `Per ${item.servingUnit}` : 'Nutrition values'}
            </Text>
            <Text style={[styles.valuesSub, { color: C.muted }]} numberOfLines={1}>
              {base100 || baseServ
                ? macrosLine((base100 ?? baseServ)!) + (item.servingGrams && base100 ? ` · 1 ${item.servingUnit} = ${Math.round(item.servingGrams)} ${item.unit}` : '')
                : 'Tap to add them from the pack'}
            </Text>
          </View>
          <View style={[styles.editPill, { backgroundColor: C.accent + '1A', borderColor: C.accent + '44' }]}>
            <Ionicons name={editing ? 'chevron-up' : 'create-outline'} size={13} color={C.accent} />
            <Text style={[styles.editPillTxt, { color: C.accent }]}>{editing ? 'Close' : 'Edit'}</Text>
          </View>
        </TouchableOpacity>
        {editing && <ValuesEditor item={item} onChange={onChange} onTyping={onTyping} />}
      </View>

      <AddButton
        label={`Add to today · ${portion.kcal} kcal`}
        disabled={!(canServe(item) || canWeigh(item)) || !(amount > 0)}
        onPress={() => {
          Keyboard.dismiss();
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          onAdd(portion, name);
        }}
      />
    </View>
  );
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const macrosLine = (m: Macros) => `${Math.round(m.kcal)} kcal · P ${fmtNum(m.protein)} · C ${fmtNum(m.carbs)} · F ${fmtNum(m.fat)}`;

function StepButton({ icon, onPress }: { icon: 'add' | 'remove'; onPress: () => void }) {
  const { C } = useTheme();
  const s = useSharedValue(1);
  const st = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <Pressable onPress={onPress} hitSlop={8}
      onPressIn={() => { s.value = withSpring(0.85, { damping: 14, stiffness: 420 }); }}
      onPressOut={() => { s.value = withSpring(1, { damping: 7, stiffness: 260 }); }}>
      <Animated.View style={[styles.stepBtn, { backgroundColor: C.card, borderColor: C.border }, st]}>
        <Ionicons name={icon} size={22} color={C.accent} />
      </Animated.View>
    </Pressable>
  );
}

export function AddButton({ label, onPress, disabled, icon = 'add-circle' }: {
  label: string; onPress: () => void; disabled?: boolean; icon?: keyof typeof Ionicons.glyphMap;
}) {
  const { C } = useTheme();
  const s = useSharedValue(1);
  const st = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <Pressable onPress={onPress} disabled={disabled}
      onPressIn={() => { s.value = withSpring(0.96, { damping: 15, stiffness: 400 }); }}
      onPressOut={() => { s.value = withSpring(1, { damping: 8, stiffness: 240 }); }}>
      <Animated.View style={[styles.addBtn, { backgroundColor: disabled ? C.border : C.accent, shadowColor: C.accent }, st]}>
        <Ionicons name={icon} size={20} color={disabled ? C.muted : '#fff'} />
        <Text style={[styles.addTxt, { color: disabled ? C.muted : '#fff' }]}>{label}</Text>
      </Animated.View>
    </Pressable>
  );
}

/** Per-100 g or per-serving values, applied as they're typed. Energy left empty is worked out from the macros. */
function ValuesEditor({ item, onChange, onTyping }: { item: FoodItem; onChange: (item: FoodItem) => void; onTyping?: (typing: boolean) => void }) {
  const focus = { onFocus: () => onTyping?.(true), onBlur: () => onTyping?.(false) };
  const { C } = useTheme();
  // Typed-in food is usually known per serving (the pack, the plate); everything else per 100 g
  const [basis, setBasis] = useState<'100' | 'serving'>(
    item.source === 'manual' ? 'serving' : item.per100 || !item.perServing ? '100' : 'serving');
  const startFrom = (b: '100' | 'serving') => (b === '100' ? per100Macros(item) : servingMacros(item));
  const toText = (m?: Macros) => Object.fromEntries(FIELDS.map(f => [f.key, m ? fmtNum(m[f.key]) : ''])) as Record<ValueKey, string>;
  const [vals, setVals] = useState<Record<ValueKey, string>>(() => toText(startFrom(basis)));
  const [servingText, setServingText] = useState(item.servingGrams ? fmtNum(item.servingGrams) : '');

  const apply = (next: Record<ValueKey, string>, b: '100' | 'serving', sText: string) => {
    const n = (k: ValueKey) => { const v = parseFloat(next[k].replace(',', '.')); return isNaN(v) ? 0 : Math.max(0, v); };
    const m: Macros = { kcal: n('kcal'), protein: n('protein'), carbs: n('carbs'), fat: n('fat') };
    if (!next.kcal.trim()) m.kcal = Math.round(m.protein * 4 + m.carbs * 4 + m.fat * 9);
    const sg = parseFloat(sText.replace(',', '.'));
    const servingGrams = sg > 0 ? sg : undefined;
    const any = FIELDS.some(f => next[f.key].trim());
    onChange({
      ...item,
      per100: b === '100' ? (any ? m : undefined) : servingGrams && any ? scaleM(m, 100 / servingGrams) : undefined,
      perServing: b === 'serving' ? (any ? m : undefined) : undefined,
      servingGrams,
      hasNutrition: any,
    });
  };
  const set = (k: ValueKey, v: string) => { const next = { ...vals, [k]: v }; setVals(next); apply(next, basis, servingText); };

  return (
    <Animated.View entering={FadeInDown.duration(220)} style={{ marginTop: 12 }}>
      <PillSwitch
        options={[{ key: '100', label: `Per 100 ${item.unit}` }, { key: 'serving', label: 'Per serving' }]}
        value={basis} color={C.accent} height={32}
        onChange={b => {
          // Re-express what's there in the other basis
          const m = startFrom(b as '100' | 'serving');
          const next = toText(m);
          setBasis(b as '100' | 'serving');
          setVals(next);
          if (m) apply(next, b as '100' | 'serving', servingText);
        }}
      />
      <View style={styles.fieldGrid}>
        {FIELDS.map(f => (
          <View key={f.key} style={[styles.field, { borderColor: C.border, backgroundColor: C.bg }]}>
            <Text style={[styles.fieldLbl, { color: C.muted }]}>{f.label}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
              <TextInput style={[styles.fieldInput, { color: C.text }]} value={vals[f.key]} onChangeText={v => set(f.key, v)} {...focus}
                keyboardType="decimal-pad" placeholder={f.key === 'kcal' ? 'auto' : '0'} placeholderTextColor={C.muted} maxLength={6} />
              <Text style={[styles.fieldUnit, { color: C.muted }]}>{f.unit}</Text>
            </View>
          </View>
        ))}
      </View>
      <View style={[styles.field, { borderColor: C.border, backgroundColor: C.bg, marginTop: 8, flexDirection: 'row', alignItems: 'center' }]}>
        <Text style={[styles.fieldLbl, { color: C.muted, flex: 1 }]}>One {item.servingUnit === 'serving' ? 'serving' : item.servingUnit} weighs</Text>
        <TextInput style={[styles.fieldInput, { color: C.text, minWidth: 56, textAlign: 'right' }]} value={servingText} {...focus}
          onChangeText={v => { setServingText(v); apply(vals, basis, v); }}
          keyboardType="decimal-pad" placeholder="—" placeholderTextColor={C.muted} maxLength={6} />
        <Text style={[styles.fieldUnit, { color: C.muted }]}>{item.unit}</Text>
      </View>
    </Animated.View>
  );
}

const scaleM = (m: Macros, f: number): Macros => ({ kcal: m.kcal * f, protein: m.protein * f, carbs: m.carbs * f, fat: m.fat * f });

/** What the camera read off a label: how sure it is, the serving it found, ingredients and allergens. */
function LabelInsights({ item }: { item: FoodItem }) {
  const { C } = useTheme();
  const [showAll, setShowAll] = useState(false);
  const l = item.label;
  if (!l) return null;
  const tone = l.confidence === 'high' ? C.accent : l.confidence === 'medium' ? C.orange : C.red;
  const msg = l.confidence === 'high' ? 'Every value read cleanly from the label'
    : l.confidence === 'medium' ? 'Most values read. Give them a quick check'
    : l.found ? 'Only part of the label could be read. Fill in the rest below'
    : "Couldn't read the numbers. Type them in below, or retake the photo closer";
  const found: string[] = [];
  if (item.servingGrams) found.push(`Serving ${fmtNum(item.servingGrams)} ${item.unit}`);
  if (l.servingsPerPack) found.push(`${fmtNum(l.servingsPerPack)} servings per pack`);
  if (l.kcalFromMacros) found.push('Energy worked out from the macros');
  const ingredients = item.ingredients ?? [];
  return (
    <Animated.View entering={FadeInDown.duration(260)} style={[styles.insight, { borderColor: tone + '55', backgroundColor: tone + '12' }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Ionicons name={l.confidence === 'high' ? 'checkmark-circle' : 'alert-circle'} size={16} color={tone} />
        <Text style={[styles.insightTitle, { color: C.text }]}>{msg}</Text>
      </View>
      {found.length > 0 && (
        <View style={styles.insightChips}>
          {found.map(f => (
            <View key={f} style={[styles.insightChip, { backgroundColor: C.card, borderColor: C.border }]}>
              <Text style={[styles.insightChipTxt, { color: C.textSub }]}>{f}</Text>
            </View>
          ))}
        </View>
      )}
      {(item.allergens?.length || item.notes?.length) ? (
        <View style={styles.insightChips}>
          {(item.allergens ?? []).map(a => (
            <View key={a} style={[styles.insightChip, { backgroundColor: C.red + '18', borderColor: C.red + '55' }]}>
              <Text style={[styles.insightChipTxt, { color: C.red }]}>Contains {a.toLowerCase()}</Text>
            </View>
          ))}
          {(item.notes ?? []).map(n => (
            <View key={n} style={[styles.insightChip, { backgroundColor: C.orange + '18', borderColor: C.orange + '55' }]}>
              <Text style={[styles.insightChipTxt, { color: C.orange }]}>{n}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {ingredients.length > 0 && (
        <TouchableOpacity onPress={() => setShowAll(s => !s)} activeOpacity={0.8} style={{ marginTop: 8 }}>
          <Text style={[styles.ingredients, { color: C.textSub }]} numberOfLines={showAll ? undefined : 2}>
            <Text style={{ fontWeight: '900', color: C.text }}>Ingredients ({ingredients.length}): </Text>
            {ingredients.join(', ')}
          </Text>
          {ingredients.join(', ').length > 90 && (
            <Text style={[styles.more, { color: C.accent }]}>{showAll ? 'Show less' : 'Show all'}</Text>
          )}
        </TouchableOpacity>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  split:       { flexDirection: 'row', borderRadius: 4, overflow: 'hidden', width: '100%' },
  row:         { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 18, borderWidth: 1, marginBottom: 8 },
  rowIcon:     { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  rowName:     { fontSize: 15, fontWeight: '800' },
  rowDetail:   { fontSize: 12, fontWeight: '600', marginTop: 2 },
  rowKcal:     { alignItems: 'flex-end', minWidth: 44 },
  rowKcalNum:  { fontSize: 17, fontWeight: '900' },
  rowKcalUnit: { fontSize: 10, fontWeight: '700', marginTop: -2 },
  quickAdd:    { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },

  headRow:     { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  thumb:       { width: 52, height: 52, borderRadius: 14, borderWidth: 1, backgroundColor: '#fff' },
  nameInput:   { fontSize: 20, fontWeight: '900', paddingVertical: 2, paddingHorizontal: 0, borderBottomWidth: 1.5 },
  srcRow:      { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  srcTxt:      { fontSize: 12, fontWeight: '700', flex: 1 },
  note:        { fontSize: 13, fontWeight: '700', marginBottom: 10 },

  amountCard:  { borderRadius: 20, borderWidth: 1, padding: 14, marginBottom: 12 },
  stepRow:     { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepBtn:     { width: 50, height: 50, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  amountInput: { fontSize: 36, fontWeight: '900', textAlign: 'center', minWidth: 110, paddingVertical: 0 },
  unitLine:    { fontSize: 12, fontWeight: '700', marginTop: -2 },
  chips:       { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 12 },
  chip:        { paddingHorizontal: 13, paddingVertical: 7, borderRadius: 12, borderWidth: 1 },
  chipTxt:     { fontSize: 13, fontWeight: '800' },

  totals:      { borderRadius: 20, borderWidth: 1, padding: 14, marginBottom: 12, gap: 12 },
  kcalRow:     { flexDirection: 'row', alignItems: 'center' },
  kcalBig:     { fontSize: 40, fontWeight: '900', letterSpacing: -1 },
  kcalUnit:    { fontSize: 15, fontWeight: '900' },
  kcalGoal:    { fontSize: 12, fontWeight: '700', marginTop: 1 },
  tiles:       { flexDirection: 'row', gap: 8 },
  tile:        { flex: 1 },
  tileHead:    { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot:         { width: 8, height: 8, borderRadius: 4 },
  tileLbl:     { fontSize: 11, fontWeight: '800', letterSpacing: 0.3 },
  tileVal:     { fontSize: 18, fontWeight: '900', marginTop: 3 },
  tileNote:    { fontSize: 10.5, fontWeight: '700', marginTop: 1 },

  valuesCard:  { borderRadius: 18, borderWidth: 1, padding: 12, marginBottom: 14 },
  valuesHead:  { flexDirection: 'row', alignItems: 'center', gap: 10 },
  valuesTitle: { fontSize: 13, fontWeight: '900' },
  valuesSub:   { fontSize: 12, fontWeight: '600', marginTop: 2 },
  editPill:    { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 11, borderWidth: 1 },
  editPillTxt: { fontSize: 12, fontWeight: '800' },
  fieldGrid:   { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  field:       { width: '48%', flexGrow: 1, borderRadius: 14, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
  fieldLbl:    { fontSize: 11, fontWeight: '800' },
  fieldInput:  { fontSize: 20, fontWeight: '900', paddingVertical: 0, minWidth: 40 },
  fieldUnit:   { fontSize: 12, fontWeight: '700', marginLeft: 4 },

  addBtn:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16, borderRadius: 18, shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 5 },
  addTxt:      { fontSize: 16, fontWeight: '900' },

  insight:     { borderRadius: 16, borderWidth: 1, padding: 12, marginBottom: 12 },
  insightTitle:{ fontSize: 13, fontWeight: '800', flex: 1 },
  insightChips:{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  insightChip: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 10, borderWidth: 1 },
  insightChipTxt: { fontSize: 11.5, fontWeight: '800' },
  ingredients: { fontSize: 12, fontWeight: '600', lineHeight: 17 },
  more:        { fontSize: 12, fontWeight: '800', marginTop: 3 },
});
