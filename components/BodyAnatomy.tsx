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
const SIDE_W = 54;
const SIDE_GAP = 6;
// body_front/back.png are cut to the body with a transparent background (masks match)
const BODY_AR = 654 / 1199;
const MAX_H = 420;

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
        // legacy 'Back' â†’ light up both
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

  // The body takes all the width the two side panels leave, up to MAX_H tall
  const [rowW, setRowW] = useState(0);
  const room = rowW ? rowW - 2 * (SIDE_W + SIDE_GAP) : 180;
  const bh = Math.round(Math.min(MAX_H, room / BODY_AR));
  const bw = Math.round(bh * BODY_AR);

  // One slim vertical panel per side, as tall as the body
  const renderSide = (title: string, group: string[]) => {
    const list = trained.filter(([m]) => group.includes(m));
    return (
      <View style={[styles.side, { minHeight: bh }]}>
        <Text style={styles.sideTitle}>{title}</Text>
        {list.length === 0 && <Text style={styles.sideNone}>—</Text>}
        {list.map(([muscle, sets], i) => {
          const shade = shadeFor(sets);
          return (
            <TouchableOpacity key={muscle} activeOpacity={0.8} disabled={!onSelectMuscle}
              onPress={() => onSelectMuscle?.(muscle, sets)}
              style={[styles.sideItem, i > 0 && styles.sideDivider]}>
              <Text style={[styles.sideNum, { color: shade.color }]}>{sets}</Text>
              <Text style={styles.sideUnit}>{sets === 1 ? 'set' : 'sets'}</Text>
              <Text style={styles.sideName} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.8}>{muscle}</Text>
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
        <View style={{ width: bw, height: bh }}>
          <Image
            source={view === 'front' ? require('../assets/body_front.png') : require('../assets/body_back.png')}
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
    bodyRow:     { flexDirection: 'row', alignSelf: 'stretch', justifyContent: 'space-between', alignItems: 'center' },
    side:        { width: SIDE_W, borderRadius: 16, paddingVertical: 10, paddingHorizontal: 4, alignItems: 'center', backgroundColor: C.bg, borderWidth: 1, borderColor: C.border },
    sideTitle:   { fontSize: 8, fontWeight: '800', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'center', marginBottom: 6 },
    sideNone:    { fontSize: 14, fontWeight: '700', color: C.border, marginTop: 4 },
    sideItem:    { alignSelf: 'stretch', alignItems: 'center', paddingVertical: 5 },
    sideDivider: { borderTopWidth: 1, borderTopColor: C.border },
    sideNum:     { fontSize: 17, fontWeight: '900', lineHeight: 19 },
    sideUnit:    { fontSize: 8, fontWeight: '700', color: C.muted, textTransform: 'uppercase' },
    sideName:    { fontSize: 10, fontWeight: '700', color: C.text, textAlign: 'center', marginTop: 3 },
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
