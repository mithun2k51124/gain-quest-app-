// components/ExerciseGuide.tsx — "how to" preview popup for an exercise + the small icon that opens it
import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView, Animated, Image, useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { findExercise, CatalogExercise } from '../constants/exerciseCatalog';
import { useTheme } from '../contexts/ThemeContext';

type ExerciseGuide = CatalogExercise;

/** The preview guide for an exercise, however its name is spelled ("Lateral Raises", "pull-ups"...). */
export function findExerciseGuide(name: string): ExerciseGuide | undefined {
  return findExercise(name);
}

const HIT = { top: 10, bottom: 10, left: 10, right: 10 };
const HOLD_MS = 1100;
const FADE_MS = 380;

/** Loops between the start and end photos with a crossfade, like a two-frame animation. */
function MotionPreview({ guide, width, color }: { guide: ExerciseGuide; width: number; color: string }) {
  const { C } = useTheme();
  const fade = useRef(new Animated.Value(0)).current;
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(true);
  const height = Math.round(width * (2 / 3));
  const two = guide.images.length > 1;

  useEffect(() => {
    if (!two || !playing) return;
    let toEnd = frame === 0;
    let cancelled = false;
    const step = () => {
      if (cancelled) return;
      Animated.sequence([
        Animated.delay(HOLD_MS),
        Animated.timing(fade, { toValue: toEnd ? 1 : 0, duration: FADE_MS, useNativeDriver: true }),
      ]).start(({ finished }) => {
        if (!finished || cancelled) return;
        setFrame(toEnd ? 1 : 0);
        toEnd = !toEnd;
        step();
      });
    };
    step();
    return () => { cancelled = true; fade.stopAnimation(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [two, playing]);

  const show = (i: number) => {
    setPlaying(false);
    fade.stopAnimation();
    Animated.timing(fade, { toValue: i, duration: 200, useNativeDriver: true }).start();
    setFrame(i);
  };

  return (
    <View>
      <TouchableOpacity activeOpacity={0.95} onPress={() => two && setPlaying(p => !p)}
        style={[styles.frame, { width, height, borderColor: C.border, backgroundColor: C.bg }]}>
        <Image source={guide.images[0]} style={{ width, height }} resizeMode="cover" />
        {two && (
          <Animated.Image source={guide.images[1]} resizeMode="cover"
            style={[StyleSheet.absoluteFill, { width, height, opacity: fade }]} />
        )}
        {two && !playing && (
          <View style={styles.pausedBadge}>
            <Ionicons name="play" size={12} color="#fff" />
          </View>
        )}
      </TouchableOpacity>
      {two && (
        <View style={styles.frameTabs}>
          {['Start', 'End'].map((l, i) => {
            const on = frame === i;
            return (
              <TouchableOpacity key={l} onPress={() => show(i)} hitSlop={HIT} activeOpacity={0.7} style={styles.frameTab}>
                <View style={[styles.frameDot, { backgroundColor: on ? color : C.border }]} />
                <Text style={[styles.frameTxt, { color: on ? C.text : C.muted }]}>{l}</Text>
              </TouchableOpacity>
            );
          })}
          <Text style={[styles.frameHint, { color: C.muted }]}>{playing ? 'Tap to pause' : 'Tap to play'}</Text>
        </View>
      )}
    </View>
  );
}

export function ExerciseGuideModal({ name, color, onClose }: { name: string; color?: string; onClose: () => void }) {
  const { C } = useTheme();
  const { width: SW } = useWindowDimensions();
  const guide = findExerciseGuide(name);
  const accent = color ?? C.accent;
  if (!guide) return null;

  const tags = [guide.equipment, guide.level].filter(Boolean) as string[];

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} onPress={e => e.stopPropagation()}
          style={[styles.sheet, { backgroundColor: C.card, borderColor: C.border }]}>
          <View style={[styles.handle, { backgroundColor: C.border }]} />
          <View style={styles.head}>
            <Text style={[styles.title, { color: C.text }]} numberOfLines={2}>{name}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={HIT} style={[styles.closeBtn, { backgroundColor: C.bg, borderColor: C.border }]}>
              <Ionicons name="close" size={18} color={C.muted} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={styles.tags}>
              {guide.primary.map(m => (
                <View key={m} style={[styles.tag, { backgroundColor: accent + '1F' }]}>
                  <Text style={[styles.tagTxt, { color: accent }]}>{m}</Text>
                </View>
              ))}
              {tags.map(t => (
                <View key={t} style={[styles.tag, { backgroundColor: C.bg, borderColor: C.border, borderWidth: 1 }]}>
                  <Text style={[styles.tagTxt, { color: C.muted }]}>{t}</Text>
                </View>
              ))}
            </View>

            <MotionPreview guide={guide} width={SW - 40} color={accent} />

            {guide.steps.length > 0 && (
              <>
                <Text style={[styles.label, { color: C.muted }]}>How to</Text>
                {guide.steps.map((s, i) => (
                  <View key={i} style={styles.step}>
                    <View style={[styles.stepNum, { backgroundColor: accent + '1F' }]}>
                      <Text style={[styles.stepNumTxt, { color: accent }]}>{i + 1}</Text>
                    </View>
                    <Text style={[styles.stepTxt, { color: C.textSub }]}>{s}</Text>
                  </View>
                ))}
              </>
            )}

            {guide.secondary.length > 0 && (
              <Text style={[styles.secondary, { color: C.muted }]}>Also works: {guide.secondary.join(', ')}</Text>
            )}
            <Text style={[styles.credit, { color: C.muted }]}>Images: free-exercise-db (public domain)</Text>
          </ScrollView>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

/**
 * Opens the exercise preview. `icon`: a small ▶ in a tinted circle (for lists);
 * `pill`: "▶ Preview" label (for cards). Renders nothing when there's no guide.
 */
export function ExerciseGuideButton({ name, color, variant = 'icon' }: {
  name: string; color?: string; variant?: 'icon' | 'pill';
}) {
  const { C } = useTheme();
  const [open, setOpen] = useState(false);
  if (!findExerciseGuide(name)) return null;
  const col = color ?? C.accent;
  return (
    <>
      <TouchableOpacity onPress={() => setOpen(true)} hitSlop={HIT} activeOpacity={0.7}
        accessibilityLabel={`Preview ${name}`}
        style={variant === 'pill'
          ? [styles.pill, { backgroundColor: col + '1A', borderColor: col + '40' }]
          : [styles.iconBtn, { backgroundColor: col + '1A' }]}>
        <Ionicons name="play" size={variant === 'pill' ? 11 : 12} color={col} style={{ marginLeft: 1 }} />
        {variant === 'pill' && <Text style={[styles.pillTxt, { color: col }]}>Preview</Text>}
      </TouchableOpacity>
      {open && <ExerciseGuideModal name={name} color={color} onClose={() => setOpen(false)} />}
    </>
  );
}

const styles = StyleSheet.create({
  overlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet:      { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: 28, maxHeight: '90%', borderWidth: 1 },
  handle:     { width: 40, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: 14 },
  head:       { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  title:      { flex: 1, fontSize: 20, fontWeight: '800', marginRight: 10 },
  closeBtn:   { width: 32, height: 32, borderRadius: 11, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  tags:       { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 },
  tag:        { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  tagTxt:     { fontSize: 12, fontWeight: '800' },
  frame:      { borderRadius: 18, overflow: 'hidden', borderWidth: 1 },
  pausedBadge:{ position: 'absolute', right: 10, bottom: 10, width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  frameTabs:  { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 10, paddingHorizontal: 2 },
  frameTab:   { flexDirection: 'row', alignItems: 'center', gap: 6 },
  frameDot:   { width: 8, height: 8, borderRadius: 4 },
  frameTxt:   { fontSize: 12, fontWeight: '800' },
  frameHint:  { marginLeft: 'auto', fontSize: 11, fontWeight: '600' },
  label:      { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.7, marginTop: 20, marginBottom: 10 },
  step:       { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  stepNum:    { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginRight: 10, marginTop: 1 },
  stepNumTxt: { fontSize: 11, fontWeight: '800' },
  stepTxt:    { flex: 1, fontSize: 13, lineHeight: 19, fontWeight: '500' },
  secondary:  { fontSize: 12, fontWeight: '600', marginTop: 6 },
  credit:     { fontSize: 10, fontWeight: '600', marginTop: 14, textAlign: 'center', opacity: 0.8 },
  iconBtn:    { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
  pill:       { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 10, borderWidth: 1 },
  pillTxt:    { fontSize: 11, fontWeight: '800' },
});
