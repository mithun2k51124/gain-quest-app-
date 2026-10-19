// components/HomeOverview.tsx — Home's Overview widget: the workout streak and this week's
// training days, in one compact card.
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { FireIcon } from './FireIcon';

const WEEK_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const FLAME = '#FF6B35';

export interface OverviewData {
  streak: number;
  bestStreak: number;
  weekTrained: boolean[];      // Monday → Sunday
  todayIndex: number;          // 0 = Monday
}

export function HomeOverview({ data }: { data: OverviewData }) {
  const { C } = useTheme();
  const styles = makeStyles(C);
  const best = Math.max(data.bestStreak, data.streak);
  const trainedThisWeek = data.weekTrained.filter(Boolean).length;

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={[styles.flameBox, { backgroundColor: FLAME + '1F' }]}>
          <FireIcon size={26} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.streakNum}>
            {data.streak}<Text style={styles.streakUnit}> day{data.streak === 1 ? '' : 's'} streak</Text>
          </Text>
          <Text style={styles.streakSub}>
            Best {best} · {trainedThisWeek} workout{trainedThisWeek === 1 ? '' : 's'} this week
          </Text>
        </View>
      </View>
      <View style={styles.week}>
        {WEEK_LETTERS.map((l, i) => {
          const trained = data.weekTrained[i];
          const today = i === data.todayIndex;
          const future = i > data.todayIndex;
          return (
            <View key={i} style={styles.weekCol}>
              <View style={[
                styles.weekDot,
                trained ? { backgroundColor: FLAME, borderColor: FLAME } : { borderColor: future ? C.border : C.muted + '66' },
                today && !trained && { borderColor: FLAME, borderWidth: 2 },
              ]}>
                {trained && <Ionicons name="checkmark" size={11} color="#fff" />}
              </View>
              <Text style={[styles.weekLetter, today && { color: C.text }]}>{l}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function makeStyles(C: any) {
  return StyleSheet.create({
    card:       { backgroundColor: C.card, borderRadius: 20, borderWidth: 1, borderColor: C.border, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 14 },
    row:        { flexDirection: 'row', alignItems: 'center', gap: 12 },
    flameBox:   { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    streakNum:  { fontSize: 22, fontWeight: '900', color: C.text },
    streakUnit: { fontSize: 13, fontWeight: '800', color: C.textSub },
    streakSub:  { fontSize: 11, fontWeight: '600', color: C.muted, marginTop: 1 },
    week:       { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, paddingHorizontal: 2 },
    weekCol:    { alignItems: 'center', gap: 4 },
    weekDot:    { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
    weekLetter: { fontSize: 10, fontWeight: '800', color: C.muted },
  });
}
