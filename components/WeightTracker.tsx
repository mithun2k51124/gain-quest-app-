// components/WeightTracker.tsx — the Tracker's Body Weight section: current weight, a target with
// progress towards it, a chart of every weigh-in (1M / 3M / 6M / All, tap a point to read it)
// and quick logging.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal, TextInput, Pressable, LayoutChangeEvent,
  KeyboardAvoidingView, Platform, GestureResponderEvent,
} from 'react-native';
import Svg, { Path, Line, Circle, Defs, LinearGradient, Stop, Text as SvgText } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  getWeightHistory, logWeight, deleteWeightEntry, getGoals, updateGoals, todayStr, toDateStr, WeightEntry,
} from '../db/database';
import { useTheme } from '../contexts/ThemeContext';
import { useCustomAlert } from '../contexts/AlertContext';
import { WheelPicker } from './WheelPicker';

type Range = '1M' | '3M' | '6M' | 'All';
const RANGES: Range[] = ['1M', '3M', '6M', 'All'];
const RANGE_DAYS: Record<Range, number> = { '1M': 30, '3M': 91, '6M': 182, All: 100000 };
const CHART_H = 170;
const PAD_L = 34;    // room for the kg labels
const PAD_R = 10;
const PAD_T = 12;
const PAD_B = 22;    // room for the dates
const HIT = { top: 8, bottom: 8, left: 8, right: 8 };

const shortDate = (s: string) =>
  new Date(s + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const fmt = (kg: number) => (Math.round(kg * 10) / 10).toFixed(1);

export function WeightCard({ refreshKey, onChanged }: { refreshKey: number; onChanged?: () => void }) {
  const { C } = useTheme();
  const styles = makeStyles(C);
  const { showAlert } = useCustomAlert();
  const [all, setAll] = useState<WeightEntry[]>([]);
  const [goal, setGoal] = useState(0);
  const [range, setRange] = useState<Range>('3M');
  const [w, setW] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [sheet, setSheet] = useState<'log' | 'target' | null>(null);

  const reload = useCallback(() => {
    setAll(getWeightHistory(100000));
    setGoal(getGoals().weight_goal || 0);
    setPicked(null);
  }, []);
  useEffect(reload, [reload, refreshKey]);

  const latest = all[all.length - 1];
  const first = all[0];

  // Entries inside the chosen range
  const points = useMemo(() => {
    const from = new Date();
    from.setDate(from.getDate() - RANGE_DAYS[range]);
    const cut = toDateStr(from);
    return all.filter(e => e.record_date >= cut);
  }, [all, range]);

  // Progress from the first weigh-in towards the target
  const progress = (() => {
    if (!latest || !first || !goal) return null;
    const total = goal - first.weight;
    const done = latest.weight - first.weight;
    const left = +(goal - latest.weight).toFixed(1);
    const reached = total === 0 ? true : total > 0 ? latest.weight >= goal : latest.weight <= goal;
    return { pct: reached ? 1 : total === 0 ? 1 : Math.max(0, Math.min(1, done / total)), left, reached };
  })();

  // ── Chart geometry ──
  const chart = useMemo(() => {
    if (points.length === 0 || w <= 0) return null;
    const vals = points.map(p => p.weight).concat(goal ? [goal] : []);
    let lo = Math.min(...vals);
    let hi = Math.max(...vals);
    if (hi - lo < 2) { lo -= 1; hi += 1; }
    const pad = (hi - lo) * 0.12;
    lo = Math.floor(lo - pad);
    hi = Math.ceil(hi + pad);
    const t0 = new Date(points[0].record_date + 'T00:00:00').getTime();
    const t1 = new Date(points[points.length - 1].record_date + 'T00:00:00').getTime();
    const span = Math.max(1, t1 - t0);
    const iw = w - PAD_L - PAD_R;
    const ih = CHART_H - PAD_T - PAD_B;
    const x = (d: string) => points.length === 1
      ? PAD_L + iw / 2
      : PAD_L + ((new Date(d + 'T00:00:00').getTime() - t0) / span) * iw;
    const y = (kg: number) => PAD_T + (1 - (kg - lo) / (hi - lo)) * ih;
    const xy = points.map(p => ({ x: x(p.record_date), y: y(p.weight), p }));
    const line = xy.map((q, i) => `${i ? 'L' : 'M'}${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(' ');
    const area = `${line} L${xy[xy.length - 1].x.toFixed(1)},${PAD_T + ih} L${xy[0].x.toFixed(1)},${PAD_T + ih} Z`;
    return { xy, line, area, lo, hi, y, ih };
  }, [points, w, goal]);

  const onChartPress = (e: GestureResponderEvent) => {
    if (!chart) return;
    const lx = e.nativeEvent.locationX;
    let best = 0;
    chart.xy.forEach((q, i) => { if (Math.abs(q.x - lx) < Math.abs(chart.xy[best].x - lx)) best = i; });
    Haptics.selectionAsync().catch(() => {});
    setPicked(best === picked ? null : best);
  };

  const shown = picked !== null && chart ? chart.xy[picked] : null;
  const rangeChange = points.length > 1 ? +(points[points.length - 1].weight - points[0].weight).toFixed(1) : null;

  const remove = (e: WeightEntry) => {
    showAlert(`Delete ${fmt(e.weight)} kg?`, `The weigh-in on ${shortDate(e.record_date)} will be removed.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => { deleteWeightEntry(e.record_date); reload(); onChanged?.(); } },
    ]);
  };

  return (
    <View style={styles.wrap}>
      {/* Current, change and target */}
      <View style={styles.stats}>
        <View style={styles.stat}>
          <Text style={styles.statLbl}>CURRENT</Text>
          <Text style={styles.statBig}>{latest ? fmt(latest.weight) : '--'}<Text style={styles.unit}> kg</Text></Text>
          <Text style={styles.statSub}>{latest ? (latest.record_date === todayStr() ? 'Today' : shortDate(latest.record_date)) : 'Not logged yet'}</Text>
        </View>
        <View style={styles.statSep} />
        <View style={styles.stat}>
          <Text style={styles.statLbl}>{range === 'All' ? 'CHANGE' : `${range} CHANGE`}</Text>
          <Text style={[styles.statBig, { color: rangeChange === null ? C.text : rangeChange > 0 ? C.orange : rangeChange < 0 ? C.green : C.text }]}>
            {rangeChange === null ? '--' : `${rangeChange > 0 ? '+' : ''}${fmt(rangeChange)}`}<Text style={styles.unit}> kg</Text>
          </Text>
          <Text style={styles.statSub}>{points.length} weigh-in{points.length === 1 ? '' : 's'}</Text>
        </View>
        <View style={styles.statSep} />
        <TouchableOpacity style={styles.stat} onPress={() => setSheet('target')} activeOpacity={0.75} accessibilityLabel="Set target weight">
          <Text style={styles.statLbl}>TARGET <Ionicons name="pencil" size={9} color={C.muted} /></Text>
          <Text style={[styles.statBig, { color: C.water }]}>{goal ? fmt(goal) : 'Set'}{!!goal && <Text style={styles.unit}> kg</Text>}</Text>
          <Text style={styles.statSub}>{goal ? 'Tap to change' : 'Tap to set'}</Text>
        </TouchableOpacity>
      </View>

      {/* Progress towards the target */}
      {progress && (
        <View style={styles.progressBox}>
          <View style={styles.progressHead}>
            <Text style={styles.progressTxt}>
              {progress.reached ? 'Target reached. Nice work!' : `${fmt(Math.abs(progress.left))} kg to ${progress.left > 0 ? 'gain' : 'lose'}`}
            </Text>
            <Text style={[styles.progressPct, { color: progress.reached ? C.green : C.water }]}>{Math.round(progress.pct * 100)}%</Text>
          </View>
          <View style={[styles.track, { backgroundColor: C.water + '22' }]}>
            <View style={[styles.fill, { width: `${Math.round(progress.pct * 100)}%`, backgroundColor: progress.reached ? C.green : C.water }]} />
          </View>
          <View style={styles.progressEnds}>
            <Text style={styles.endTxt}>Start {fmt(first!.weight)} kg</Text>
            <Text style={styles.endTxt}>Target {fmt(goal)} kg</Text>
          </View>
        </View>
      )}

      {/* Range */}
      <View style={styles.ranges}>
        {RANGES.map(r => (
          <TouchableOpacity key={r} onPress={() => { setRange(r); setPicked(null); }} activeOpacity={0.8}
            style={[styles.rangeBtn, range === r && { backgroundColor: C.water, borderColor: C.water }]}>
            <Text style={[styles.rangeTxt, range === r && { color: '#fff' }]}>{r}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Chart */}
      <View style={styles.chartBox} onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)}>
        {points.length === 0 ? (
          <View style={styles.emptyChart}>
            <Ionicons name="analytics-outline" size={26} color={C.muted} />
            <Text style={styles.emptyTxt}>{all.length ? 'No weigh-ins in this range' : 'Log your weight to start the chart'}</Text>
          </View>
        ) : chart && (
          <Pressable onPress={onChartPress}>
            <Svg width={w} height={CHART_H}>
              <Defs>
                <LinearGradient id="wfill" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={C.water} stopOpacity={0.35} />
                  <Stop offset="1" stopColor={C.water} stopOpacity={0} />
                </LinearGradient>
              </Defs>
              {/* Grid with kg labels */}
              {[chart.hi, (chart.hi + chart.lo) / 2, chart.lo].map((v, i) => (
                <React.Fragment key={i}>
                  <Line x1={PAD_L} x2={w - PAD_R} y1={chart.y(v)} y2={chart.y(v)} stroke={C.border} strokeWidth={1} />
                  <SvgText x={PAD_L - 6} y={chart.y(v) + 4} fontSize={10} fontWeight="700" fill={C.muted} textAnchor="end">{Math.round(v)}</SvgText>
                </React.Fragment>
              ))}
              {/* Target line */}
              {!!goal && goal >= chart.lo && goal <= chart.hi && (
                <>
                  <Line x1={PAD_L} x2={w - PAD_R} y1={chart.y(goal)} y2={chart.y(goal)} stroke={C.green} strokeWidth={1.5} strokeDasharray="5 4" />
                  <SvgText x={w - PAD_R - 2} y={chart.y(goal) - 5} fontSize={10} fontWeight="800" fill={C.green} textAnchor="end">Target</SvgText>
                </>
              )}
              <Path d={chart.area} fill="url(#wfill)" />
              <Path d={chart.line} stroke={C.water} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
              {chart.xy.length <= 40 && chart.xy.map((q, i) => (
                <Circle key={i} cx={q.x} cy={q.y} r={i === picked ? 6 : 3} fill={i === picked ? C.water : C.card} stroke={C.water} strokeWidth={2} />
              ))}
              {shown && (
                <Line x1={shown.x} x2={shown.x} y1={PAD_T} y2={CHART_H - PAD_B} stroke={C.water} strokeWidth={1} strokeDasharray="3 3" />
              )}
              {/* First and last date */}
              <SvgText x={PAD_L} y={CHART_H - 6} fontSize={10} fontWeight="700" fill={C.muted}>{shortDate(points[0].record_date)}</SvgText>
              {points.length > 1 && (
                <SvgText x={w - PAD_R} y={CHART_H - 6} fontSize={10} fontWeight="700" fill={C.muted} textAnchor="end">
                  {shortDate(points[points.length - 1].record_date)}
                </SvgText>
              )}
            </Svg>
            {shown && (
              <View pointerEvents="none" style={[styles.bubble, { left: Math.min(Math.max(shown.x - 52, 0), w - 104), top: Math.max(0, shown.y - 46) }]}>
                <Text style={styles.bubbleKg}>{fmt(shown.p.weight)} kg</Text>
                <Text style={styles.bubbleDate}>{shortDate(shown.p.record_date)}</Text>
              </View>
            )}
          </Pressable>
        )}
      </View>
      {points.length > 0 && <Text style={styles.chartHint}>Tap the chart to read a weigh-in</Text>}

      {/* Recent weigh-ins */}
      {all.length > 0 && (
        <View style={styles.recent}>
          {all.slice(-3).reverse().map(e => (
            <View key={e.record_date} style={styles.recentRow}>
              <Text style={styles.recentDate}>{e.record_date === todayStr() ? 'Today' : shortDate(e.record_date)}</Text>
              <Text style={styles.recentKg}>{fmt(e.weight)} kg</Text>
              <TouchableOpacity onPress={() => remove(e)} hitSlop={HIT} accessibilityLabel="Delete weigh-in">
                <Ionicons name="trash-outline" size={16} color={C.muted} />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      <TouchableOpacity onPress={() => setSheet('log')} activeOpacity={0.85} style={styles.logBtn}>
        <Ionicons name="add-circle" size={18} color="#fff" />
        <Text style={styles.logTxt}>Log weight</Text>
      </TouchableOpacity>

      <NumberSheet
        visible={sheet !== null}
        title={sheet === 'target' ? 'Target weight' : 'Log your weight'}
        sub={sheet === 'target' ? 'The weight you are working towards' : 'Weigh yourself at the same time of day for a fair trend'}
        start={sheet === 'target' ? goal || latest?.weight || 70 : latest?.weight || goal || 70}
        onClose={() => setSheet(null)}
        onSave={(kg, date) => {
          if (sheet === 'target') updateGoals({ weight_goal: kg });
          else logWeight(kg, date);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          setSheet(null);
          reload();
          onChanged?.();
        }}
      />
    </View>
  );
}

// Scroll wheels: whole kilos and tenths
const KG_MIN = 25;
const KG_ITEMS = Array.from({ length: 276 }, (_, i) => String(KG_MIN + i));   // 25 … 300
const TENTHS = Array.from({ length: 10 }, (_, i) => `.${i}`);

/** A weight entry sheet: two scroll wheels (kg and tenths). A weigh-in is always for today. */
function NumberSheet({ visible, title, sub, start, onClose, onSave }: {
  visible: boolean; title: string; sub: string; start: number;
  onClose: () => void; onSave: (kg: number, date: string) => void;
}) {
  const { C } = useTheme();
  const styles = makeStyles(C);
  const insets = useSafeAreaInsets();
  const [whole, setWhole] = useState(70);
  const [tenth, setTenth] = useState(0);
  useEffect(() => {
    if (!visible) return;
    const v = Math.min(300, Math.max(KG_MIN, Math.round(start * 10) / 10));
    setWhole(Math.floor(v));
    setTenth(Math.round((v - Math.floor(v)) * 10) % 10);
  }, [visible, start]);
  const kg = whole + tenth / 10;
  const date = todayStr();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
          <View style={[styles.sheet, { paddingBottom: 24 + insets.bottom }]}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>{title}</Text>
            <Text style={styles.sheetSub}>{sub}</Text>
            <View style={styles.entryRow}>
              <WheelPicker key={`w${visible}`} items={KG_ITEMS} width={92} itemHeight={44} visible={3} fontSize={30}
                index={whole - KG_MIN} onChange={i => setWhole(KG_MIN + i)} />
              <WheelPicker key={`t${visible}`} items={TENTHS} width={64} itemHeight={44} visible={3} fontSize={30}
                index={tenth} onChange={setTenth} />
              <Text style={styles.entryUnit}>kg</Text>
            </View>
            <Text style={styles.nudgeHint}>{fmt(kg)} kg · scroll to change</Text>
            <TouchableOpacity onPress={() => onSave(Math.round(kg * 10) / 10, date)} activeOpacity={0.85}
              style={[styles.logBtn, { marginTop: 18 }]}>
              <Ionicons name="checkmark-circle" size={18} color="#fff" />
              <Text style={styles.logTxt}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function makeStyles(C: any) {
  return StyleSheet.create({
    wrap:        { padding: 16 },
    stats:       { flexDirection: 'row', alignItems: 'stretch' },
    stat:        { flex: 1, alignItems: 'center' },
    statSep:     { width: 1, backgroundColor: C.border, marginVertical: 4 },
    statLbl:     { fontSize: 10, fontWeight: '800', color: C.muted, letterSpacing: 0.5 },
    statBig:     { fontSize: 20, fontWeight: '900', color: C.text, marginTop: 3 },
    unit:        { fontSize: 12, fontWeight: '700', color: C.muted },
    statSub:     { fontSize: 10, fontWeight: '600', color: C.muted, marginTop: 1 },
    progressBox: { marginTop: 14, padding: 12, borderRadius: 14, backgroundColor: C.bg, borderWidth: 1, borderColor: C.border },
    progressHead:{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    progressTxt: { fontSize: 13, fontWeight: '800', color: C.text },
    progressPct: { fontSize: 13, fontWeight: '900' },
    track:       { height: 8, borderRadius: 4, overflow: 'hidden' },
    fill:        { height: '100%', borderRadius: 4 },
    progressEnds:{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
    endTxt:      { fontSize: 10, fontWeight: '700', color: C.muted },
    ranges:      { flexDirection: 'row', gap: 6, marginTop: 14 },
    rangeBtn:    { flex: 1, alignItems: 'center', paddingVertical: 6, borderRadius: 10, borderWidth: 1, borderColor: C.border, backgroundColor: C.bg },
    rangeTxt:    { fontSize: 12, fontWeight: '800', color: C.textSub },
    chartBox:    { marginTop: 10, minHeight: CHART_H },
    emptyChart:  { height: CHART_H, alignItems: 'center', justifyContent: 'center', gap: 6 },
    emptyTxt:    { fontSize: 12, fontWeight: '700', color: C.muted },
    chartHint:   { fontSize: 10, fontWeight: '600', color: C.muted, textAlign: 'center', marginTop: 2 },
    bubble:      { position: 'absolute', width: 104, paddingVertical: 5, borderRadius: 10, alignItems: 'center', backgroundColor: C.text },
    bubbleKg:    { fontSize: 13, fontWeight: '900', color: C.card },
    bubbleDate:  { fontSize: 10, fontWeight: '700', color: C.card, opacity: 0.8 },
    recent:      { marginTop: 10, borderTopWidth: 1, borderTopColor: C.border },
    recentRow:   { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.border + '99' },
    recentDate:  { flex: 1, fontSize: 13, fontWeight: '700', color: C.textSub },
    recentKg:    { fontSize: 14, fontWeight: '900', color: C.text, marginRight: 14 },
    logBtn:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 12, paddingVertical: 12, borderRadius: 14, backgroundColor: C.water },
    logTxt:      { fontSize: 14, fontWeight: '800', color: '#fff' },

    overlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
    sheet:       { backgroundColor: C.card, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, borderWidth: 1, borderColor: C.border },
    handle:      { width: 40, height: 5, backgroundColor: C.border, borderRadius: 3, alignSelf: 'center', marginBottom: 14 },
    sheetTitle:  { fontSize: 19, fontWeight: '800', color: C.text, textAlign: 'center' },
    sheetSub:    { fontSize: 12, fontWeight: '600', color: C.muted, textAlign: 'center', marginTop: 4 },
    entryRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 16 },
    nudge:       { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg, borderWidth: 1, borderColor: C.border },
    entryBox:    { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
    entryInput:  { fontSize: 40, fontWeight: '900', color: C.text, minWidth: 110, textAlign: 'center', paddingVertical: 0 },
    entryUnit:   { fontSize: 16, fontWeight: '800', color: C.muted },
    nudgeHint:   { fontSize: 11, fontWeight: '600', color: C.muted, textAlign: 'center', marginTop: 6 },
    dayRow:      { flexDirection: 'row', gap: 8, justifyContent: 'center', marginTop: 14 },
    dayChip:     { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 12, borderWidth: 1, borderColor: C.border, backgroundColor: C.bg },
    dayTxt:      { fontSize: 12, fontWeight: '800', color: C.textSub },
  });
}
