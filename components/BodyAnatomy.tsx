// components/BodyAnatomy.tsx
// Dots placed directly ON TOP of each muscle â€” Upper Back & Lower Back split.

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
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

const FRONT_DOTS = [
  { id: 'fs-l',  muscle: 'Shoulders',  cx: 80,  cy: 106 },
  { id: 'fs-r',  muscle: 'Shoulders',  cx: 180, cy: 106 },
  { id: 'fc-l',  muscle: 'Chest',      cx: 110, cy: 118 },
  { id: 'fc-r',  muscle: 'Chest',      cx: 150, cy: 118 },
  { id: 'fb-l',  muscle: 'Biceps',     cx: 80,  cy: 136 },
  { id: 'fb-r',  muscle: 'Biceps',     cx: 180, cy: 136 },
  { id: 'ftr-l', muscle: 'Triceps',    cx: 68,  cy: 130 },
  { id: 'ftr-r', muscle: 'Triceps',    cx: 192, cy: 130 },
  { id: 'ff-l',  muscle: 'Forearms',   cx: 68,  cy: 172 },
  { id: 'ff-r',  muscle: 'Forearms',   cx: 192, cy: 172 },
  { id: 'fub-l', muscle: 'Upper Back', cx: 112, cy: 84  },
  { id: 'fub-r', muscle: 'Upper Back', cx: 148, cy: 84  },
  { id: 'fa-u',  muscle: 'Core',       cx: 130, cy: 136 },
  { id: 'fa-m',  muscle: 'Core',       cx: 130, cy: 152 },
  { id: 'fa-l',  muscle: 'Core',       cx: 130, cy: 170 },
  { id: 'fo-l',  muscle: 'Core',       cx: 112, cy: 154 },
  { id: 'fo-r',  muscle: 'Core',       cx: 148, cy: 154 },
  { id: 'fq-l',  muscle: 'Legs',       cx: 114, cy: 236 },
  { id: 'fq-r',  muscle: 'Legs',       cx: 146, cy: 236 },
  { id: 'fca-l', muscle: 'Legs',       cx: 112, cy: 318 },
  { id: 'fca-r', muscle: 'Legs',       cx: 148, cy: 318 },
];

const BACK_DOTS = [
  // 2 points for Upper Back
  { id: 'bub-l', muscle: 'Upper Back', cx: 114, cy: 116 },
  { id: 'bub-r', muscle: 'Upper Back', cx: 146, cy: 116 },
  // Shoulders (rear deltoids)
  { id: 'bd-l',  muscle: 'Shoulders',  cx: 82,  cy: 104 },
  { id: 'bd-r',  muscle: 'Shoulders',  cx: 178, cy: 104 },
  // 2 points for Lower Back (lumbar / erector spinae)
  { id: 'blb-l', muscle: 'Lower Back', cx: 118, cy: 168 },
  { id: 'blb-r', muscle: 'Lower Back', cx: 142, cy: 168 },
  // Triceps
  { id: 'btr-l', muscle: 'Triceps',    cx: 74,  cy: 134 },
  { id: 'btr-r', muscle: 'Triceps',    cx: 186, cy: 134 },
  // Forearms
  { id: 'bfr-l', muscle: 'Forearms',   cx: 68,  cy: 172 },
  { id: 'bfr-r', muscle: 'Forearms',   cx: 192, cy: 172 },
  // Legs: Glutes
  { id: 'bg-l',  muscle: 'Legs',       cx: 114, cy: 208 },
  { id: 'bg-r',  muscle: 'Legs',       cx: 146, cy: 208 },
  // Legs: Hamstrings
  { id: 'bh-l',  muscle: 'Legs',       cx: 114, cy: 268 },
  { id: 'bh-r',  muscle: 'Legs',       cx: 146, cy: 268 },
  // Legs: Calves
  { id: 'bca-l', muscle: 'Legs',       cx: 112, cy: 326 },
  { id: 'bca-r', muscle: 'Legs',       cx: 148, cy: 326 },
];

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
  const normalizedCounts = normalizeSetCounts(muscleSetCounts, activeMuscleGroups);
  const getSets = (muscle: string): number => normalizedCounts[muscle] || 0;

  const getGreenColor = (sets: number): string => {
    if (sets === 1) return '#4ADE80';
    if (sets === 2) return '#22C55E';
    if (sets === 3) return '#15803D';
    return '#14532D';
  };

  const press = (m: string) => onSelectMuscle?.(m, getSets(m));
  const dots = view === 'front' ? FRONT_DOTS : BACK_DOTS;
  const styles = makeStyles(C, isDark);

  return (
    <View style={styles.container}>
      {showToggle && (
        <View style={styles.toggleRow}>
          <TouchableOpacity style={[styles.btn, view === 'front' && styles.btnA]}
            onPress={() => setView('front')} activeOpacity={0.85}>
            <Text style={[styles.btnTxt, view === 'front' && styles.btnTxtA]}>Front</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btn, view === 'back' && styles.btnA]}
            onPress={() => setView('back')} activeOpacity={0.85}>
            <Text style={[styles.btnTxt, view === 'back' && styles.btnTxtA]}>Back</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={{ width: W, height: H, borderRadius: 12, overflow: 'hidden', position: 'relative' }}>
        <Image
          source={view === 'front' ? require('../assets/body_front.jpg') : require('../assets/body_back.jpg')}
          style={{ width: W, height: H, resizeMode: 'cover' }}
        />
        <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={StyleSheet.absoluteFill} pointerEvents="box-none">
          {dots.map(d => {
            const s = getSets(d.muscle);
            if (s <= 0) return null;
            const color = getGreenColor(s);
            return (
              <G key={d.id}>
                <Circle cx={d.cx} cy={d.cy} r={10} fill={color} fillOpacity={0.28} />
                <Circle cx={d.cx} cy={d.cy} r={6} fill={color} stroke="#FFFFFF" strokeWidth={1.8} onPress={() => press(d.muscle)} />
              </G>
            );
          })}
        </Svg>
      </View>

      <View style={styles.legendWrap}>
        <Text style={styles.legendTitle}>Set Volume Intensity (Green Scale)</Text>
        <View style={styles.legendRow}>
          {[
            { label: '0 Sets',  bg: isDark ? '#2A3347' : '#E5E7EB', border: true },
            { label: '1 Set',   bg: '#4ADE80' },
            { label: '2 Sets',  bg: '#22C55E' },
            { label: '3 Sets',  bg: '#15803D' },
            { label: '4+ Sets', bg: '#14532D' },
          ].map((item: any) => (
            <View key={item.label} style={styles.legendItem}>
              <View style={[styles.legendBox, { backgroundColor: item.bg }, item.border && { borderWidth: 1, borderColor: C.border }]} />
              <Text style={styles.legendTxt}>{item.label}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

function makeStyles(C: any, isDark: boolean) {
  return StyleSheet.create({
    container:   { alignItems: 'center', paddingVertical: 10 },
    toggleRow:   { flexDirection: 'row', backgroundColor: isDark ? '#1C2333' : '#E8EBF3', borderRadius: 14, padding: 4, marginBottom: 14, gap: 4, borderWidth: 1, borderColor: C.border },
    btn:         { paddingVertical: 7, paddingHorizontal: 28, borderRadius: 10 },
    btnA:        { backgroundColor: C.accent, shadowColor: C.accent, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 3 },
    btnTxt:      { fontSize: 13, fontWeight: '700', color: C.muted },
    btnTxtA:     { color: '#FFFFFF' },
    legendWrap:  { width: '100%', marginTop: 14, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.border, alignItems: 'center' },
    legendTitle: { fontSize: 11, fontWeight: '700', color: C.muted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.6 },
    legendRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, flexWrap: 'wrap' },
    legendItem:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
    legendBox:   { width: 12, height: 12, borderRadius: 3 },
    legendTxt:   { fontSize: 11, fontWeight: '600', color: C.textSub },
  });
}


