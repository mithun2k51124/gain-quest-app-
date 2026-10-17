// components/NutritionTrend.tsx — selectable water / protein / calorie trend chart
import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Svg, { Path, Rect, Line, Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { Card } from './ui';
import { useTheme } from '../contexts/ThemeContext';
import { DailyLog, Goals, todayStr, toDateStr } from '../db/database';

type MetricKey = 'water' | 'protein' | 'calories';
type Metric = {
  key: MetricKey; label: string; icon: string; unit: string;
  field: keyof Pick<DailyLog, 'water_intake' | 'protein_intake' | 'calorie_intake'>;
  goal: (g: Goals | null) => number;
  fmt: (v: number) => string;
};

const METRICS: Metric[] = [
  { key: 'water', label: 'Water', icon: 'water', unit: 'L', field: 'water_intake',
    goal: g => g?.water_goal || 0, fmt: v => v.toFixed(1) },
  { key: 'protein', label: 'Protein', icon: 'restaurant', unit: 'g', field: 'protein_intake',
    goal: g => g?.protein_goal || 0, fmt: v => String(Math.round(v)) },
  { key: 'calories', label: 'Calories', icon: 'flame', unit: 'kcal', field: 'calorie_intake',
    goal: g => g?.calorie_goal || 0, fmt: v => Math.round(v).toLocaleString() },
];
const RANGES = [7, 30] as const;
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const CHART_H = 160;
const PAD_TOP = 18;

function dayLabel(ds: string, today: string): string {
  if (ds === today) return 'Today';
  const d = new Date(ds + 'T00:00:00');
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

/** Smooth curve through points (Catmull-Rom → cubic Bézier), clamped to the plot. */
function smoothPath(pts: { x: number; y: number }[], minY: number, maxY: number): string {
  if (!pts.length) return '';
  const c = (y: number) => Math.max(minY, Math.min(maxY, y));
  let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6, c1y = c(p1.y + (p2.y - p0.y) / 6);
    const c2x = p2.x - (p3.x - p1.x) / 6, c2y = c(p2.y - (p3.y - p1.y) / 6);
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return d;
}

export function NutritionTrend({ logs, goals }: { logs: DailyLog[]; goals: Goals | null }) {
  const { C } = useTheme();
  const styles = makeStyles(C);
  const [selected, setSelected] = useState<MetricKey[]>(['protein']);
  const [range, setRange] = useState<(typeof RANGES)[number]>(30);
  const [width, setWidth] = useState(0);
  const [focus, setFocus] = useState<number | null>(null);

  const today = todayStr();
  const colorOf = (k: MetricKey) => (k === 'water' ? C.water : k === 'protein' ? C.protein : C.calories);
  const active = METRICS.filter(m => selected.includes(m.key));

  // One slot per calendar day, including days with nothing logged
  const days = useMemo(() => {
    const byDate = new Map(logs.map(l => [l.log_date, l]));
    return Array.from({ length: range }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (range - 1 - i));
      const ds = toDateStr(d);
      return { date: ds, log: byDate.get(ds) };
    });
  }, [logs, range]);

  const value = (m: Metric, i: number) => Number(days[i].log?.[m.field] || 0);
  const toggle = (k: MetricKey) => {
    setSelected(s => (s.includes(k) ? (s.length > 1 ? s.filter(x => x !== k) : s) : [...s, k]));
  };

  const n = days.length;
  const plotH = CHART_H - PAD_TOP;
  const slot = width / n;
  const xOf = (i: number) => slot * i + slot / 2;
  const sel = focus ?? n - 1;
  const single = active.length === 1;

  // Single metric: absolute bars. Several: % of goal so different units share one scale.
  const scale = useMemo(() => {
    if (single) {
      const m = active[0];
      const max = Math.max(m.goal(goals), ...days.map((_, i) => value(m, i)), 1);
      return { max: max * 1.12, goalY: m.goal(goals) };
    }
    return { max: 1.6, goalY: 1 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [single, active.map(m => m.key).join(), days, goals]);

  const yOf = (v: number) => PAD_TOP + plotH - (Math.min(v, scale.max) / scale.max) * plotH;
  const pct = (m: Metric, i: number) => {
    const g = m.goal(goals);
    if (g > 0) return value(m, i) / g;
    const max = Math.max(...days.map((_, j) => value(m, j)), 1);
    return value(m, i) / max;
  };

  const pick = (x: number) => {
    if (!width) return;
    const i = Math.max(0, Math.min(n - 1, Math.floor(x / slot)));
    if (i !== focus) setFocus(i);
  };

  const hasAny = days.some((_, i) => active.some(m => value(m, i) > 0));

  return (
    <Card>
      <View style={{ padding: 16 }}>
        {/* Header */}
        <View style={styles.headRow}>
          <Text style={styles.title}>Trends</Text>
          <View style={styles.rangeWrap}>
            {RANGES.map(r => (
              <TouchableOpacity key={r} onPress={() => { setRange(r); setFocus(null); }} activeOpacity={0.8}
                style={[styles.rangeBtn, range === r && { backgroundColor: C.accent }]}>
                <Text style={[styles.rangeTxt, range === r && { color: '#fff' }]}>{r}D</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Metric selector */}
        <View style={styles.chips}>
          {METRICS.map(m => {
            const on = selected.includes(m.key);
            const col = colorOf(m.key);
            return (
              <TouchableOpacity key={m.key} onPress={() => toggle(m.key)} activeOpacity={0.8}
                style={[styles.chip, on && { backgroundColor: col + '1F', borderColor: col }]}>
                <Ionicons name={(on ? m.icon : `${m.icon}-outline`) as any} size={14} color={on ? col : C.muted} />
                <Text style={[styles.chipTxt, on && { color: col }]}>{m.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Focused day readout */}
        <View style={styles.readout}>
          <Text style={styles.readDate}>{dayLabel(days[sel].date, today)}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'flex-end', flex: 1 }}>
            {active.map(m => (
              <Text key={m.key} style={[styles.readVal, { color: colorOf(m.key) }]}>
                {m.fmt(value(m, sel))}<Text style={styles.readUnit}> {m.unit}</Text>
              </Text>
            ))}
          </View>
        </View>

        {/* Chart */}
        <View
          onLayout={e => setWidth(e.nativeEvent.layout.width)}
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => true}
          onResponderTerminationRequest={() => false}
          onResponderGrant={e => pick(e.nativeEvent.locationX)}
          onResponderMove={e => pick(e.nativeEvent.locationX)}
          style={{ height: CHART_H }}
        >
          {width > 0 && (
            <Svg width={width} height={CHART_H}>
              <Defs>
                {active.map(m => (
                  <LinearGradient key={m.key} id={`fill-${m.key}`} x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0" stopColor={colorOf(m.key)} stopOpacity={0.22} />
                    <Stop offset="1" stopColor={colorOf(m.key)} stopOpacity={0} />
                  </LinearGradient>
                ))}
              </Defs>

              {/* Baseline + focus guide */}
              <Line x1={0} y1={CHART_H - 0.5} x2={width} y2={CHART_H - 0.5} stroke={C.border} strokeWidth={1} />
              <Rect x={xOf(sel) - slot / 2} y={PAD_TOP - 6} width={slot} height={plotH + 6} rx={Math.min(6, slot / 2)}
                fill={C.text} opacity={0.05} />

              {single ? (() => {
                const m = active[0];
                const col = colorOf(m.key);
                const g = m.goal(goals);
                const bw = Math.max(3, Math.min(18, slot * 0.6));
                return days.map((_, i) => {
                  const v = value(m, i);
                  const top = v > 0 ? Math.min(yOf(v), CHART_H - 4) : CHART_H - 3;
                  const hit = g > 0 && v >= g;
                  return (
                    <Rect key={i} x={xOf(i) - bw / 2} y={top} width={bw} height={CHART_H - top}
                      rx={Math.min(bw / 2, 5)}
                      fill={v > 0 ? col : C.border}
                      opacity={v === 0 ? 0.7 : i === sel ? 1 : hit ? 0.9 : 0.45} />
                  );
                });
              })() : active.map(m => {
                const col = colorOf(m.key);
                const pts = days.map((_, i) => ({ x: xOf(i), y: yOf(pct(m, i)) }));
                const line = smoothPath(pts, PAD_TOP, CHART_H);
                const area = `${line} L${pts[pts.length - 1].x.toFixed(1)},${CHART_H} L${pts[0].x.toFixed(1)},${CHART_H} Z`;
                return (
                  <React.Fragment key={m.key}>
                    {active.length <= 2 && <Path d={area} fill={`url(#fill-${m.key})`} />}
                    <Path d={line} stroke={col} strokeWidth={2.2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                    <Circle cx={pts[sel].x} cy={pts[sel].y} r={4.5} fill={col} stroke={C.card} strokeWidth={2} />
                  </React.Fragment>
                );
              })}

              {/* Goal line */}
              {scale.goalY > 0 && (
                <Line x1={0} y1={yOf(scale.goalY)} x2={width} y2={yOf(scale.goalY)}
                  stroke={C.muted} strokeWidth={1} strokeDasharray="4,5" opacity={0.8} />
              )}
            </Svg>
          )}
          {width > 0 && scale.goalY > 0 && (
            <Text style={[styles.goalTag, { top: yOf(scale.goalY) - 16 }]}>
              {single ? `Goal ${active[0].fmt(scale.goalY)} ${active[0].unit}` : 'Goal'}
            </Text>
          )}
          {!hasAny && (
            <View style={styles.emptyOverlay} pointerEvents="none">
              <Text style={styles.emptyTxt}>Nothing logged in the last {range} days</Text>
            </View>
          )}
        </View>

        {/* X axis */}
        <View style={styles.axis}>
          <Text style={styles.axisTxt}>{dayLabel(days[0].date, today)}</Text>
          <Text style={styles.axisTxt}>{dayLabel(days[Math.floor((n - 1) / 2)].date, today)}</Text>
          <Text style={styles.axisTxt}>Today</Text>
        </View>

        {/* Stats */}
        <View style={styles.stats}>
          {active.map(m => {
            const vals = days.map((_, i) => value(m, i));
            const logged = vals.filter(v => v > 0);
            const avg = logged.length ? logged.reduce((s, v) => s + v, 0) / logged.length : 0;
            const g = m.goal(goals);
            const hits = g > 0 ? vals.filter(v => v >= g).length : 0;
            const col = colorOf(m.key);
            return (
              <View key={m.key} style={styles.statRow}>
                <View style={[styles.statDot, { backgroundColor: col }]} />
                <Text style={styles.statLabel}>{m.label}</Text>
                <Text style={styles.statVal}>avg {m.fmt(avg)} {m.unit}</Text>
                {g > 0 && (
                  <View style={[styles.hitPill, { backgroundColor: col + '1A' }]}>
                    <Text style={[styles.hitTxt, { color: col }]}>{hits}/{n} days on goal</Text>
                  </View>
                )}
              </View>
            );
          })}
        </View>
        <Text style={styles.hint}>
          {single ? 'Touch the chart to see any day' : 'Lines show % of each daily goal · touch to see any day'}
        </Text>
      </View>
    </Card>
  );
}

function makeStyles(C: any) {
  return StyleSheet.create({
    headRow:   { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
    title:     { flex: 1, fontSize: 16, fontWeight: '800', color: C.text },
    rangeWrap: { flexDirection: 'row', backgroundColor: C.bg, borderRadius: 10, padding: 3, borderWidth: 1, borderColor: C.border },
    rangeBtn:  { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 7 },
    rangeTxt:  { fontSize: 12, fontWeight: '800', color: C.muted },
    chips:     { flexDirection: 'row', gap: 8, marginBottom: 14 },
    chip:      { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: C.border, backgroundColor: C.bg },
    chipTxt:   { fontSize: 12, fontWeight: '800', color: C.muted },
    readout:   { flexDirection: 'row', alignItems: 'baseline', marginBottom: 6, minHeight: 26 },
    readDate:  { fontSize: 12, fontWeight: '800', color: C.muted, marginRight: 10 },
    readVal:   { fontSize: 20, fontWeight: '800' },
    readUnit:  { fontSize: 11, fontWeight: '700', color: C.muted },
    goalTag:   { position: 'absolute', right: 0, fontSize: 10, fontWeight: '800', color: C.muted, backgroundColor: C.card, paddingHorizontal: 4 },
    emptyOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
    emptyTxt:  { fontSize: 12, fontWeight: '700', color: C.muted },
    axis:      { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
    axisTxt:   { fontSize: 10, fontWeight: '700', color: C.muted },
    stats:     { marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.border, gap: 10 },
    statRow:   { flexDirection: 'row', alignItems: 'center' },
    statDot:   { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
    statLabel: { fontSize: 13, fontWeight: '700', color: C.textSub, width: 64 },
    statVal:   { flex: 1, fontSize: 13, fontWeight: '800', color: C.text },
    hitPill:   { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
    hitTxt:    { fontSize: 11, fontWeight: '800' },
    hint:      { fontSize: 11, color: C.muted, fontWeight: '600', textAlign: 'center', marginTop: 12 },
  });
}
