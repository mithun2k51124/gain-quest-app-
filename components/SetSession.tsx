// components/SetSession.tsx — full-screen "do the set" page opened by Start exercise on the
// Log tab: the exercise, this set's weight and reps, a big running timer and an I'm done button.
// Done logs one set, asks how it went (thumbs up / down) and suggests the next set's weight
// (or reps for bodyweight moves), one step heavier or lighter.
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, ImageSourcePropType, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../contexts/ThemeContext';
import { stepsAway } from '../constants/startingLoads';
import { getSetting, setSetting } from '../db/database';
import { LoopingThumb } from './ExerciseGuide';

type Phase = 'set' | 'rate' | 'next';

const PREVIEW_KEY = 'set_preview_always';

const mmss = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

export function SetSession({
  visible, name, color, doneSets, goalSets, reps: reps0, kg: kg0, repsOnly, steps, images, onLog, onChange, onClose,
}: {
  visible: boolean;
  name: string;
  images?: ImageSourcePropType[];   // the exercise's start/end photos, for the preview
  color: string;
  doneSets: number;           // sets logged so far today
  goalSets?: number;
  reps: number;
  kg: number;
  repsOnly: boolean;
  steps: number[];            // the weights this exercise can use
  onLog: (reps: number, kg: number) => void;
  onChange: (reps: number, kg: number) => void;  // keeps the Log card's wheels in step
  onClose: () => void;
}) {
  const { C } = useTheme();
  const styles = makeStyles(C);
  const [phase, setPhase] = useState<Phase>('set');
  const [reps, setReps] = useState(reps0);
  const [kg, setKg] = useState(kg0);
  const [next, setNext] = useState<{ reps: number; kg: number } | null>(null);
  const [lastTime, setLastTime] = useState(0);

  // Stopwatch: counts up while the set is going
  const [start, setStart] = useState(Date.now());
  const [paused, setPaused] = useState<number | null>(null);   // elapsed ms when paused
  const [now, setNow] = useState(Date.now());
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsed = paused ?? now - start;

  // Every time the page opens: fresh set, values from the card
  useEffect(() => {
    if (!visible) return;
    setPhase('set'); setReps(reps0); setKg(kg0); setNext(null);
    setStart(Date.now()); setPaused(null); setNow(Date.now());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);
  useEffect(() => {
    if (visible && phase === 'set' && paused === null) {
      tick.current = setInterval(() => setNow(Date.now()), 250);
      return () => { if (tick.current) clearInterval(tick.current); };
    }
  }, [visible, phase, paused]);

  // Preview: the exercise playing big with a small clock. "Always" is remembered across sets
  const { width: SW } = useWindowDimensions();
  const hasImages = !!images && images.length > 0;
  const [alwaysPreview, setAlwaysPreview] = useState(() => getSetting(PREVIEW_KEY, '0') === '1');
  const [preview, setPreview] = useState(alwaysPreview);
  const [hint, setHint] = useState<string | null>(null);
  // Each opening re-reads the setting (another exercise's page may have changed it)
  useEffect(() => {
    if (!visible) return;
    const on = getSetting(PREVIEW_KEY, '0') === '1';
    setAlwaysPreview(on); setPreview(on);
  }, [visible]);
  const [boxH, setBoxH] = useState(0);  // room for the preview between the reps row and I'm done
  const toggleAlways = () => {
    const on = !alwaysPreview;
    setAlwaysPreview(on);
    setSetting(PREVIEW_KEY, on ? '1' : '0');
    if (on) setPreview(true);
    setHint(on ? 'Preview will always show when a set starts' : 'Preview off by default');
    setTimeout(() => setHint(null), 1800);
  };


  const setNo = phase === 'set' ? doneSets + 1 : doneSets;   // after logging, doneSets includes it
  const allDone = goalSets !== undefined && doneSets >= goalSets;

  const stepKg = (dir: 1 | -1) => setKg(k => stepsAway(k, steps, dir, 1)[0] ?? k);
  const startSet = (r: number, w: number) => {
    setReps(r); setKg(w); onChange(r, w);
    setPhase('set'); setStart(Date.now()); setPaused(null); setNow(Date.now());
  };
  const done = () => {
    setLastTime(elapsed);
    onLog(reps, repsOnly ? 0 : kg);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setPhase('rate');
  };
  const rate = (up: boolean) => {
    // Bodyweight: two reps more or fewer; weights: one step on this exercise's ladder
    const suggestion = repsOnly
      ? { reps: Math.max(1, reps + (up ? 2 : -2)), kg }
      : { reps, kg: stepsAway(kg, steps, up ? 1 : -1, 1)[0] ?? kg };
    setNext(suggestion);
    setPhase('next');
  };

  const load = repsOnly ? `${reps} reps` : `${kg} kg × ${reps}`;
  const change = next && (repsOnly ? next.reps - reps : +(next.kg - kg).toFixed(2));

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.page}>
        {/* Top bar */}
        <View style={styles.top}>
          <TouchableOpacity onPress={onClose} style={styles.close} hitSlop={10}>
            <Ionicons name="chevron-down" size={22} color={C.text} />
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={[styles.kicker, { color }]}>
              {phase === 'set' ? `SET ${setNo}${goalSets ? ` OF ${goalSets}` : ''}` : `SET ${setNo} LOGGED`}
            </Text>
            <Text style={styles.name} numberOfLines={2}>{name}</Text>
          </View>
          {/* Always show the preview when a set starts (remembered) */}
          {hasImages ? (
            <TouchableOpacity onPress={toggleAlways} hitSlop={10} accessibilityLabel="Always show preview"
              style={[styles.close, alwaysPreview && { backgroundColor: color, borderColor: color }]}>
              <Ionicons name={alwaysPreview ? 'eye' : 'eye-outline'} size={19} color={alwaysPreview ? '#fff' : C.text} />
            </TouchableOpacity>
          ) : <View style={{ width: 40 }} />}
        </View>
        {hint && (
          <View style={[styles.hint, { borderColor: color + '55' }]}>
            <Text style={styles.hintTxt}>{hint}</Text>
          </View>
        )}

        {phase === 'set' ? (
          <>
            {/* Weight and reps for this set */}
            <View style={styles.loadRow}>
              {!repsOnly && (
                <View style={styles.loadBox}>
                  <Text style={styles.loadLbl}>WEIGHT</Text>
                  <View style={styles.stepper}>
                    <TouchableOpacity onPress={() => stepKg(-1)} style={styles.stepBtn} hitSlop={6}>
                      <Ionicons name="remove" size={18} color={C.text} />
                    </TouchableOpacity>
                    <Text style={styles.loadVal}>{kg}<Text style={styles.loadUnit}> kg</Text></Text>
                    <TouchableOpacity onPress={() => stepKg(1)} style={styles.stepBtn} hitSlop={6}>
                      <Ionicons name="add" size={18} color={C.text} />
                    </TouchableOpacity>
                  </View>
                </View>
              )}
              <View style={styles.loadBox}>
                <Text style={styles.loadLbl}>REPS</Text>
                <View style={styles.stepper}>
                  <TouchableOpacity onPress={() => setReps(r => Math.max(1, r - 1))} style={styles.stepBtn} hitSlop={6}>
                    <Ionicons name="remove" size={18} color={C.text} />
                  </TouchableOpacity>
                  <Text style={styles.loadVal}>{reps}</Text>
                  <TouchableOpacity onPress={() => setReps(r => r + 1)} style={styles.stepBtn} hitSlop={6}>
                    <Ionicons name="add" size={18} color={C.text} />
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            {/* The timer, or the exercise playing with a small clock over it */}
            <View style={styles.timerWrap} onLayout={e => setBoxH(e.nativeEvent.layout.height)}>
              {preview && hasImages ? (
                <View style={[styles.previewBox, { borderColor: color + '55' }]}>
                  <LoopingThumb images={images!} width={SW - 40}
                    height={Math.round(Math.max(160, Math.min((SW - 40) * 0.9, (boxH || 9999) - 80)))} />
                  <View style={styles.miniClock}>
                    <View style={[styles.miniDot, { backgroundColor: paused !== null ? C.orange : C.green }]} />
                    <Text style={styles.miniClockTxt}>{mmss(elapsed)}</Text>
                  </View>
                </View>
              ) : (
                <View style={[styles.timerRing, { borderColor: color + '55', shadowColor: color }]}>
                  <Text style={styles.timer} adjustsFontSizeToFit numberOfLines={1}>{mmss(elapsed)}</Text>
                  <Text style={styles.timerSub}>{paused !== null ? 'PAUSED' : 'SET TIME'}</Text>
                </View>
              )}
              <View style={styles.timerCtrls}>
                {hasImages && (
                  <TouchableOpacity style={[styles.ctrl, preview && { borderColor: color, backgroundColor: color + '1F' }]}
                    activeOpacity={0.8} onPress={() => setPreview(p => !p)}>
                    <Ionicons name={preview ? 'timer-outline' : 'play-circle-outline'} size={16} color={preview ? color : C.text} />
                    <Text style={[styles.ctrlTxt, preview && { color }]}>{preview ? 'Big clock' : 'Preview'}</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={styles.ctrl} activeOpacity={0.8}
                  onPress={() => {
                    if (paused === null) setPaused(Date.now() - start);
                    else { setStart(Date.now() - paused); setPaused(null); setNow(Date.now()); }
                  }}>
                  <Ionicons name={paused === null ? 'pause' : 'play'} size={16} color={C.text} />
                  <Text style={styles.ctrlTxt}>{paused === null ? 'Pause' : 'Resume'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.ctrl} activeOpacity={0.8}
                  onPress={() => { setStart(Date.now()); setNow(Date.now()); setPaused(paused === null ? null : 0); }}>
                  <Ionicons name="refresh" size={16} color={C.text} />
                  <Text style={styles.ctrlTxt}>Reset</Text>
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity style={[styles.primary, { backgroundColor: color }]} onPress={done} activeOpacity={0.85}>
              <Ionicons name="checkmark-circle" size={22} color="#fff" />
              <Text style={styles.primaryTxt}>I'm done</Text>
            </TouchableOpacity>
          </>
        ) : (
          <View style={{ flex: 1 }}>
            {/* What was just logged */}
            <View style={styles.loggedCard}>
              <Ionicons name="checkmark-circle" size={20} color={C.green} />
              <Text style={styles.loggedTxt}>{load}</Text>
              <Text style={styles.loggedTime}>{mmss(lastTime)}</Text>
            </View>

            {phase === 'rate' ? (
              <View style={styles.center}>
                <Text style={styles.question}>Nice set!</Text>
                <Text style={styles.questionSub}>
                  How was that set? Tap one for a {repsOnly ? 'reps' : 'weight'} suggestion, or just rest.
                </Text>
                <View style={{ flexDirection: 'row', gap: 12, alignSelf: 'stretch', marginTop: 24 }}>
                  <TouchableOpacity style={[styles.thumb, { borderColor: C.green + '66', backgroundColor: C.green + '14' }]}
                    onPress={() => rate(true)} activeOpacity={0.85}>
                    <View style={[styles.thumbIcon, { backgroundColor: C.green }]}>
                      <Ionicons name="thumbs-up" size={26} color="#fff" />
                    </View>
                    <Text style={styles.thumbTxt}>Felt good</Text>
                    <Text style={styles.thumbSub}>I could do more</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.thumb, { borderColor: C.red + '66', backgroundColor: C.red + '14' }]}
                    onPress={() => rate(false)} activeOpacity={0.85}>
                    <View style={[styles.thumbIcon, { backgroundColor: C.red }]}>
                      <Ionicons name="thumbs-down" size={26} color="#fff" />
                    </View>
                    <Text style={styles.thumbTxt}>Too heavy</Text>
                    <Text style={styles.thumbSub}>It was a struggle</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : next && (
              <View style={styles.center}>
                <Text style={styles.kickerBig}>{allDone ? 'ALL SETS DONE' : 'NEXT SET'}</Text>
                <Text style={styles.nextVal}>
                  {repsOnly ? `${next.reps} reps` : `${next.kg} kg`}
                </Text>
                {change !== 0 && change !== null && (
                  <Text style={[styles.nextChange, { color: (change ?? 0) > 0 ? C.green : C.orange }]}>
                    {(change ?? 0) > 0 ? '▲ ' : '▼ '}{Math.abs(change ?? 0)}{repsOnly ? ' reps' : ' kg'} {(change ?? 0) > 0 ? 'heavier' : 'lighter'}
                  </Text>
                )}
                {change === 0 && <Text style={[styles.nextChange, { color: C.muted }]}>Same as this set</Text>}
                {!repsOnly && <Text style={styles.questionSub}>{next.reps} reps</Text>}
              </View>
            )}

            {/* Back to the Log tab to rest; the card is ready for the next set */}
            {phase === 'rate' && (
              <TouchableOpacity style={[styles.primary, { backgroundColor: color }]} onPress={onClose} activeOpacity={0.85}
                accessibilityLabel="Rest now">
                <Ionicons name="cafe" size={22} color="#fff" />
                <Text style={styles.primaryTxt}>Rest now</Text>
              </TouchableOpacity>
            )}

            {phase === 'next' && next && (
              <View style={{ gap: 10 }}>
                <TouchableOpacity style={[styles.primary, { backgroundColor: allDone ? C.green : color }]} activeOpacity={0.85}
                  onPress={() => (allDone ? (onChange(next.reps, next.kg), onClose()) : startSet(next.reps, next.kg))}>
                  <Ionicons name={allDone ? 'flag' : 'play'} size={20} color="#fff" />
                  <Text style={styles.primaryTxt}>{allDone ? 'Finish exercise' : `Start set ${doneSets + 1}`}</Text>
                </TouchableOpacity>
                {allDone ? (
                  <TouchableOpacity style={styles.secondary} onPress={() => startSet(next.reps, next.kg)} activeOpacity={0.8}>
                    <Text style={styles.secondaryTxt}>Do one more set</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity style={styles.secondary} onPress={() => startSet(reps, kg)} activeOpacity={0.8}>
                    <Text style={styles.secondaryTxt}>Keep {repsOnly ? `${reps} reps` : `${kg} kg`} instead</Text>
                  </TouchableOpacity>
                )}
                {!allDone && (
                  <TouchableOpacity style={styles.secondary} onPress={() => { onChange(next.reps, next.kg); onClose(); }} activeOpacity={0.8}>
                    <Text style={[styles.secondaryTxt, { color: C.muted }]}>Stop for now</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}

function makeStyles(C: any) {
  return StyleSheet.create({
    page:       { flex: 1, backgroundColor: C.bg, paddingHorizontal: 20, paddingBottom: 20 },
    top:        { flexDirection: 'row', alignItems: 'center', paddingTop: 8, paddingBottom: 12 },
    close:      { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: C.card, borderWidth: 1, borderColor: C.border },
    kicker:     { fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
    name:       { fontSize: 18, fontWeight: '800', color: C.text, textAlign: 'center', marginTop: 2 },
    loadRow:    { flexDirection: 'row', gap: 10, marginTop: 8 },
    loadBox:    { flex: 1, backgroundColor: C.card, borderRadius: 18, borderWidth: 1, borderColor: C.border, padding: 12, alignItems: 'center' },
    loadLbl:    { fontSize: 10, fontWeight: '800', color: C.muted, letterSpacing: 0.8, marginBottom: 6 },
    stepper:    { flexDirection: 'row', alignItems: 'center', gap: 10 },
    stepBtn:    { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg, borderWidth: 1, borderColor: C.border },
    loadVal:    { fontSize: 24, fontWeight: '900', color: C.text, minWidth: 56, textAlign: 'center' },
    loadUnit:   { fontSize: 13, fontWeight: '700', color: C.muted },
    timerWrap:  { flex: 1, alignItems: 'center', justifyContent: 'center' },
    previewBox: { borderRadius: 22, overflow: 'hidden', borderWidth: 1.5, backgroundColor: C.card },
    miniClock:  {
      position: 'absolute', top: 10, right: 10, flexDirection: 'row', alignItems: 'center', gap: 6,
      paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, backgroundColor: 'rgba(10,12,20,0.72)',
    },
    miniDot:    { width: 7, height: 7, borderRadius: 4 },
    miniClockTxt: { fontSize: 20, fontWeight: '300', color: '#fff', fontVariant: ['tabular-nums'], letterSpacing: 1 },
    hint:       { alignSelf: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, borderWidth: 1, backgroundColor: C.card, marginBottom: 4 },
    hintTxt:    { fontSize: 12, fontWeight: '700', color: C.textSub },
    timerRing:  {
      width: '92%', aspectRatio: 1, maxWidth: 340, borderRadius: 999, borderWidth: 3, alignItems: 'center', justifyContent: 'center',
      backgroundColor: C.card, shadowOpacity: 0.4, shadowRadius: 24, shadowOffset: { width: 0, height: 0 }, elevation: 8,
    },
    timer:      { fontSize: 88, fontWeight: '200', color: C.text, fontVariant: ['tabular-nums'], letterSpacing: 2, paddingHorizontal: 24 },
    timerSub:   { fontSize: 11, fontWeight: '800', color: C.muted, letterSpacing: 1.5, marginTop: -4 },
    timerCtrls: { flexDirection: 'row', gap: 10, marginTop: 18 },
    ctrl:       { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 14, backgroundColor: C.card, borderWidth: 1, borderColor: C.border },
    ctrlTxt:    { fontSize: 13, fontWeight: '800', color: C.text },
    primary:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 18, borderRadius: 20 },
    primaryTxt: { fontSize: 18, fontWeight: '900', color: '#fff' },
    secondary:  { alignItems: 'center', paddingVertical: 12 },
    secondaryTxt: { fontSize: 14, fontWeight: '800', color: C.accent },
    loggedCard: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 16, backgroundColor: C.green + '14', borderWidth: 1, borderColor: C.green + '44', marginTop: 8 },
    loggedTxt:  { flex: 1, fontSize: 16, fontWeight: '800', color: C.text },
    loggedTime: { fontSize: 14, fontWeight: '700', color: C.muted, fontVariant: ['tabular-nums'] },
    center:     { flex: 1, alignItems: 'center', justifyContent: 'center' },
    question:   { fontSize: 24, fontWeight: '900', color: C.text },
    questionSub:{ fontSize: 14, color: C.muted, marginTop: 6, textAlign: 'center' },
    thumb:      { flex: 1, alignItems: 'center', paddingVertical: 22, borderRadius: 22, borderWidth: 1.5 },
    thumbIcon:  { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
    thumbTxt:   { fontSize: 16, fontWeight: '900', color: C.text },
    thumbSub:   { fontSize: 12, color: C.muted, marginTop: 2 },
    kickerBig:  { fontSize: 12, fontWeight: '800', color: C.muted, letterSpacing: 1.5 },
    nextVal:    { fontSize: 64, fontWeight: '900', color: C.text, marginTop: 6 },
    nextChange: { fontSize: 15, fontWeight: '800', marginTop: 2 },
  });
}
