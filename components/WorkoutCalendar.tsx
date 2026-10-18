// components/WorkoutCalendar.tsx — compact day picker for workout history: arrows step between
// workout days, the calendar button opens a small month grid with workout days marked.
// A smaller take on the nutrition tab's DayCalendarNav, sized to sit inside a card.
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { todayStr } from '../db/database';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const SHORT_MONTHS = MONTHS.map(m => m.slice(0, 3));
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/** 'Mon, 13 Oct 2026' */
export function longDate(s: string): string {
  const d = new Date(s + 'T00:00:00');
  if (isNaN(d.getTime())) return s;
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${SHORT_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function WorkoutCalendar({ selected, workoutDates, onSelect, color }: {
  selected: string;
  workoutDates: string[];        // days with a workout, any order
  onSelect: (date: string) => void;
  color: string;
}) {
  const { C } = useTheme();
  const styles = makeStyles(C);
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => ({ y: +selected.slice(0, 4), m: +selected.slice(5, 7) - 1 }));
  // Follow the selection when it moves to another month (arrows)
  useEffect(() => { setMonth({ y: +selected.slice(0, 4), m: +selected.slice(5, 7) - 1 }); }, [selected]);

  const days = new Set(workoutDates);
  const sorted = [...days].sort();
  const prev = [...sorted].reverse().find(d => d < selected);
  const next = sorted.find(d => d > selected);
  const today = todayStr();

  const { y, m } = month;
  const cells: (string | null)[] = Array(new Date(y, m, 1).getDay()).fill(null);
  const inMonth = new Date(y, m + 1, 0).getDate();
  for (let d = 1; d <= inMonth; d++) cells.push(`${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  while (cells.length % 7) cells.push(null);
  const monthCount = cells.filter(c => c && days.has(c)).length;
  const shiftMonth = (delta: number) => setMonth(({ y, m }) => {
    const d = new Date(y, m + delta, 1);
    return { y: d.getFullYear(), m: d.getMonth() };
  });

  return (
    <View>
      <View style={styles.navRow}>
        <TouchableOpacity style={[styles.arrow, !prev && styles.off]} disabled={!prev}
          onPress={() => prev && onSelect(prev)} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={18} color={C.text} />
        </TouchableOpacity>
        <View style={styles.datePill}>
          <Text style={styles.dateTxt} numberOfLines={1}>{selected === today ? 'Today' : longDate(selected)}</Text>
          <Text style={styles.dateSub}>{days.has(selected) ? 'Workout day' : 'No workout'}</Text>
        </View>
        <TouchableOpacity style={[styles.arrow, !next && styles.off]} disabled={!next}
          onPress={() => next && onSelect(next)} activeOpacity={0.7}>
          <Ionicons name="chevron-forward" size={18} color={C.text} />
        </TouchableOpacity>
        <TouchableOpacity style={[styles.calBtn, open && { backgroundColor: color, borderColor: color }]}
          onPress={() => setOpen(o => !o)} activeOpacity={0.8}>
          <Ionicons name={open ? 'calendar' : 'calendar-outline'} size={17} color={open ? '#fff' : color} />
        </TouchableOpacity>
      </View>

      {open && (
        <View style={styles.cal}>
          <View style={styles.monthRow}>
            <TouchableOpacity onPress={() => shiftMonth(-1)} hitSlop={8}>
              <Ionicons name="chevron-back" size={16} color={C.text} />
            </TouchableOpacity>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text style={styles.monthTxt}>{MONTHS[m]} {y}</Text>
              <Text style={styles.monthSub}>{monthCount} workout {monthCount === 1 ? 'day' : 'days'}</Text>
            </View>
            <TouchableOpacity onPress={() => shiftMonth(1)} hitSlop={8}>
              <Ionicons name="chevron-forward" size={16} color={C.text} />
            </TouchableOpacity>
          </View>
          <View style={styles.week}>
            {DAY_LETTERS.map((l, i) => <Text key={i} style={styles.weekTxt}>{l}</Text>)}
          </View>
          <View style={styles.grid}>
            {cells.map((c, i) => {
              if (!c) return <View key={`e${i}`} style={styles.cell} />;
              const sel = c === selected;
              const has = days.has(c);
              return (
                <TouchableOpacity key={c} style={styles.cell} activeOpacity={0.7}
                  onPress={() => { onSelect(c); setOpen(false); }}>
                  <View style={[
                    styles.day,
                    has && { backgroundColor: color + '22' },
                    sel && { backgroundColor: color },
                    c === today && !sel && { borderWidth: 1.5, borderColor: C.accent },
                  ]}>
                    <Text style={[styles.dayTxt, has && { color, fontWeight: '800' }, sel && { color: '#fff', fontWeight: '800' }]}>
                      {+c.slice(8)}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}
    </View>
  );
}

function makeStyles(C: any) {
  return StyleSheet.create({
    navRow:   { flexDirection: 'row', alignItems: 'center', gap: 6 },
    arrow:    { width: 34, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg, borderWidth: 1, borderColor: C.border },
    off:      { opacity: 0.35 },
    datePill: { flex: 1, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg, borderWidth: 1, borderColor: C.border, paddingHorizontal: 6 },
    dateTxt:  { fontSize: 13, fontWeight: '800', color: C.text },
    dateSub:  { fontSize: 10, fontWeight: '600', color: C.muted, marginTop: 1 },
    calBtn:   { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg, borderWidth: 1, borderColor: C.border },
    cal:      { marginTop: 10, padding: 10, borderRadius: 14, backgroundColor: C.bg, borderWidth: 1, borderColor: C.border },
    monthRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, paddingHorizontal: 4 },
    monthTxt: { fontSize: 14, fontWeight: '800', color: C.text },
    monthSub: { fontSize: 10, fontWeight: '600', color: C.muted, marginTop: 1 },
    week:     { flexDirection: 'row', marginBottom: 4 },
    weekTxt:  { flex: 1, textAlign: 'center', fontSize: 10, fontWeight: '700', color: C.muted },
    grid:     { flexDirection: 'row', flexWrap: 'wrap' },
    cell:     { width: `${100 / 7}%`, aspectRatio: 1.15, alignItems: 'center', justifyContent: 'center' },
    day:      { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
    dayTxt:   { fontSize: 12, fontWeight: '600', color: C.textSub },
  });
}
