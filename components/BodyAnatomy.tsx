// components/BodyAnatomy.tsx
// Front / back body picture with each trained muscle shaded red: the more sets, the deeper the red.
// Each muscle group has a mask traced from the picture's own outlines (assets/muscles), so the
// colour fills exactly that muscle and nothing around it.

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, ImageSourcePropType } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';

export type BodyView = 'front' | 'back';

interface Props {
  muscleSetCounts?: Record<string, number>;
  activeMuscleGroups?: string[];
  onSelectMuscle?: (muscle: string, sets: number) => void;
  showToggle?: boolean;
}

const W = 260;
const H = 390;

// Masks per view; a group missing from a view isn't visible from that side
const MASKS: Record<BodyView, Partial<Record<string, ImageSourcePropType>>> = {
  front: {
    Shoulders: require('../assets/muscles/front_shoulders.png'),
    Chest:     require('../assets/muscles/front_chest.png'),
    Biceps:    require('../assets/muscles/front_biceps.png'),
    Forearms:  require('../assets/muscles/front_forearms.png'),
    Core:      require('../assets/muscles/front_core.png'),
    Legs:      require('../assets/muscles/front_legs.png'),
  },
  back: {
    'Upper Back': require('../assets/muscles/back_upperback.png'),
    'Lower Back': require('../assets/muscles/back_lowerback.png'),
    Shoulders:    require('../assets/muscles/back_shoulders.png'),
    Triceps:      require('../assets/muscles/back_triceps.png'),
    Forearms:     require('../assets/muscles/back_forearms.png'),
    Legs:         require('../assets/muscles/back_legs.png'),
  },
};

// Side columns: upper body on the left, lower body on the right
const UPPER = ['Chest', 'Shoulders', 'Upper Back', 'Biceps', 'Triceps', 'Forearms'];
const LOWER = ['Core', 'Lower Back', 'Legs'];
const SIDE_W = 74;

/** Reds for 1, 2, 3, 4 and 5+ sets: light red deepening to dark red. */
export const SHADES: { color: string; opacity: number }[] = [
  { color: '#F25C54', opacity: 0.6 },
  { color: '#E53935', opacity: 0.68 },
  { color: '#C62828', opacity: 0.76 },
  { color: '#A01818', opacity: 0.84 },
  { color: '#7A0E0E', opacity: 0.9 },
];
const shadeFor = (sets: number) => SHADES[Math.min(sets, SHADES.length) - 1];

function normalizeSetCounts(
  muscleSetCounts: Record<string, number>,
  activeMuscleGroups: string[]
): Record<string, number> {
  const norm: Record<string, number> = {};

  const addSets = (muscleName: string, count: number) => {
    const raw = muscleName.trim();
    if (!raw) return;
    const parts = raw.split(/[,&/]| and /i);
    for (const p of parts) {
      const lower = p.trim().toLowerCase();
      if (!lower) continue;
      let target = '';
      if (['chest', 'pectoral', 'pecs'].some(x => lower.includes(x))) target = 'Chest';
      else if (['shoulder', 'delt', 'deltoid'].some(x => lower.includes(x))) target = 'Shoulders';
      else if (['bicep'].some(x => lower.includes(x))) target = 'Biceps';
      else if (['tricep'].some(x => lower.includes(x))) target = 'Triceps';
      else if (['forearm', 'wrist'].some(x => lower.includes(x))) target = 'Forearms';
      else if (['upper back', 'trap', 'trapezius', 'rhomboid', 'lat'].some(x => lower.includes(x))) target = 'Upper Back';
      else if (['lower back', 'lumbar', 'erector'].some(x => lower.includes(x))) target = 'Lower Back';
      else if (lower === 'back') {
        // legacy 'Back' → light up both
        norm['Upper Back'] = (norm['Upper Back'] || 0) + count;
        norm['Lower Back'] = (norm['Lower Back'] || 0) + count;
        continue;
      }
      else if (['leg', 'quad', 'hamstring', 'glute', 'calf', 'calves'].some(x => lower.includes(x))) target = 'Legs';
      else if (['core', 'abs', 'oblique', 'abdominal'].some(x => lower.includes(x))) target = 'Core';
      if (target) norm[target] = (norm[target] || 0) + count;
    }
  };

  for (const [key, val] of Object.entries(muscleSetCounts)) { if (val > 0) addSets(key, val); }
  for (const g of activeMuscleGroups) addSets(g, 1);
  return norm;
}

export default function BodyAnatomy({
  muscleSetCounts = {},
  activeMuscleGroups = [],
  onSelectMuscle,
  showToggle = true,
}: Props) {
  const { C, isDark } = useTheme();
  const [view, setView] = useState<BodyView>('front');
  const counts = normalizeSetCounts(muscleSetCounts, activeMuscleGroups);
  const styles = makeStyles(C, isDark);

  const masks = MASKS[view];
  const trained = Object.entries(counts).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  // Groups trained but only visible from the other side
  const otherSide = trained.filter(([m]) => !masks[m]).map(([m]) => m);

  // The body shrinks to leave room for a muscle column on each side
  const [rowW, setRowW] = useState(0);
  const bw = rowW ? Math.max(150, Math.min(W, rowW - 2 * (SIDE_W + 8))) : 200;
  const bh = Math.round(bw * (H / W));

  const renderSide = (title: string, group: string[]) => {
    const list = trained.filter(([m]) => group.includes(m));
    return (
      <View style={styles.side}>
        <Text style={styles.sideTitle}>{title}</Text>
        {list.length === 0 && <Text style={styles.sideNone}>Not trained</Text>}
        {list.map(([muscle, sets]) => {
          const shade = shadeFor(sets);
          return (
            <TouchableOpacity key={muscle} style={styles.sideItem} activeOpacity={0.8}
              disabled={!onSelectMuscle} onPress={() => onSelectMuscle?.(muscle, sets)}>
              <View style={[styles.chipDot, { backgroundColor: shade.color }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.chipTxt} numberOfLines={1} adjustsFontSizeToFit>{muscle}</Text>
                <Text style={styles.chipSets}>{sets} {sets === 1 ? 'set' : 'sets'}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {showToggle && (
        <View style={styles.toggleRow}>
          {(['front', 'back'] as BodyView[]).map(v => (
            <TouchableOpacity key={v} style={[styles.btn, view === v && styles.btnA]}
              onPress={() => setView(v)} activeOpacity={0.85}>
              <Text style={[styles.btnTxt, view === v && styles.btnTxtA]}>{v === 'front' ? 'Front' : 'Back'}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Upper-body muscles on the left, lower body on the right, the body in between */}
      <View style={styles.bodyRow} onLayout={e => setRowW(e.nativeEvent.layout.width)}>
        {renderSide('Upper body', UPPER)}
        <View style={{ width: bw, height: bh, borderRadius: 12, overflow: 'hidden' }}>
          <Image
            source={view === 'front' ? require('../assets/body_front.jpg') : require('../assets/body_back.jpg')}
            style={{ width: bw, height: bh, resizeMode: 'cover' }}
          />
          {trained.map(([muscle, sets]) => {
            const src = masks[muscle];
            if (!src) return null;
            const shade = shadeFor(sets);
            return (
              <Image key={`${view}-${muscle}`} source={src} fadeDuration={0}
                style={[StyleSheet.absoluteFill, { width: bw, height: bh, resizeMode: 'cover', tintColor: shade.color, opacity: shade.opacity }]} />
            );
          })}
        </View>
        {renderSide('Lower body', LOWER)}
      </View>

      {otherSide.length > 0 && (
        <TouchableOpacity onPress={() => setView(view === 'front' ? 'back' : 'front')} activeOpacity={0.7}>
          <Text style={styles.otherSide}>
            {otherSide.join(', ')} {otherSide.length === 1 ? 'is' : 'are'} on the {view === 'front' ? 'back' : 'front'} view. Tap to flip
          </Text>
        </TouchableOpacity>
      )}

      <View style={styles.legendWrap}>
        <Text style={styles.legendTitle}>Sets per muscle</Text>
        <View style={styles.scaleRow}>
          {SHADES.map((s, i) => (
            <View key={i} style={styles.scaleCell}>
              <View style={[styles.scaleBox, { backgroundColor: s.color }]} />
              <Text style={styles.legendTxt}>{i === SHADES.length - 1 ? `${i + 1}+` : i + 1}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

function makeStyles(C: any, isDark: boolean) {
  return StyleSheet.create({
    container:   { alignItems: 'center', paddingTop: 2, paddingBottom: 4 },
    toggleRow:   { flexDirection: 'row', backgroundColor: isDark ? C.card : '#E8EBF3', borderRadius: 14, padding: 4, marginBottom: 10, gap: 4, borderWidth: 1, borderColor: C.border },
    bodyRow:     { flexDirection: 'row', alignSelf: 'stretch', justifyContent: 'space-between', alignItems: 'flex-start' },
    side:        { width: SIDE_W, paddingTop: 6, gap: 6 },
    sideTitle:   { fontSize: 9, fontWeight: '800', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 2 },
    sideNone:    { fontSize: 11, fontWeight: '600', color: C.muted },
    sideItem:    { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 7, paddingVertical: 6, borderRadius: 10, backgroundColor: C.bg, borderWidth: 1, borderColor: C.border },
    btn:         { paddingVertical: 7, paddingHorizontal: 28, borderRadius: 10 },
    btnA:        { backgroundColor: C.accent, shadowColor: C.accent, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 3 },
    btnTxt:      { fontSize: 13, fontWeight: '700', color: C.muted },
    btnTxtA:     { color: '#FFFFFF' },
    otherSide:   { fontSize: 12, fontWeight: '600', color: C.accent, marginTop: 10, textAlign: 'center' },
    chipDot:     { width: 9, height: 9, borderRadius: 5 },
    chipTxt:     { fontSize: 11, fontWeight: '700', color: C.text },
    chipSets:    { fontSize: 10, fontWeight: '600', color: C.muted },
    legendWrap:  { width: '100%', marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: C.border, alignItems: 'center' },
    legendTitle: { fontSize: 10, fontWeight: '700', color: C.muted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.6 },
    scaleRow:    { flexDirection: 'row', gap: 4 },
    scaleCell:   { alignItems: 'center', gap: 4 },
    scaleBox:    { width: 30, height: 10, borderRadius: 3 },
    legendTxt:   { fontSize: 11, fontWeight: '600', color: C.textSub },
  });
}
