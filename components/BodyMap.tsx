// components/BodyMap.tsx — a tappable body for picking a muscle group.
// The front / back body picture with a labelled "callout" bubble for each muscle group, joined to
// the muscle by a thin line. Tap a bubble or the muscle itself: it lights up in its colour.
// Groups that already have something logged get a small count badge.
import React, { useEffect, useState } from 'react';
import { View, Text, Image, Pressable, StyleSheet, ImageSourcePropType, LayoutChangeEvent } from 'react-native';
import Svg, { Line, Circle } from 'react-native-svg';
import Animated, {
  Easing, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import { useTheme } from '../contexts/ThemeContext';

export type BodySide = 'front' | 'back';

const BODY: Record<BodySide, ImageSourcePropType> = {
  front: require('../assets/body_front.png'),
  back: require('../assets/body_back.png'),
};
const BODY_AR = 654 / 1199;

// Muscle masks (traced from the body pictures), as used by the History heat map
const MASKS: Record<BodySide, Record<string, ImageSourcePropType>> = {
  front: {
    Shoulders: require('../assets/muscles/front_shoulders.png'),
    Chest: require('../assets/muscles/front_chest.png'),
    Biceps: require('../assets/muscles/front_biceps.png'),
    Forearms: require('../assets/muscles/front_forearms.png'),
    Core: require('../assets/muscles/front_core.png'),
    Legs: require('../assets/muscles/front_legs.png'),
  },
  back: {
    'Upper Back': require('../assets/muscles/back_upperback.png'),
    'Lower Back': require('../assets/muscles/back_lowerback.png'),
    Shoulders: require('../assets/muscles/back_shoulders.png'),
    Triceps: require('../assets/muscles/back_triceps.png'),
    Forearms: require('../assets/muscles/back_forearms.png'),
    Legs: require('../assets/muscles/back_legs.png'),
  },
};

// Where each bubble points: the centre of its muscle on one side of the body (as a fraction of
// the picture, measured from the masks) and the hit areas on both sides
interface Spot { group: string; side: 'left' | 'right'; x: number; y: number; mirrorX: number; w: number; h: number }
const SPOTS: Record<BodySide, Spot[]> = {
  front: [
    { group: 'Shoulders', side: 'left', x: 0.295, y: 0.226, mirrorX: 0.704, w: 0.16, h: 0.07 },
    { group: 'Biceps', side: 'left', x: 0.277, y: 0.312, mirrorX: 0.723, w: 0.13, h: 0.08 },
    { group: 'Forearms', side: 'left', x: 0.217, y: 0.417, mirrorX: 0.783, w: 0.13, h: 0.11 },
    { group: 'Chest', side: 'right', x: 0.586, y: 0.248, mirrorX: 0.413, w: 0.18, h: 0.08 },
    { group: 'Core', side: 'right', x: 0.571, y: 0.386, mirrorX: 0.428, w: 0.16, h: 0.16 },
    { group: 'Legs', side: 'right', x: 0.610, y: 0.676, mirrorX: 0.389, w: 0.2, h: 0.36 },
  ],
  back: [
    { group: 'Shoulders', side: 'left', x: 0.271, y: 0.220, mirrorX: 0.729, w: 0.15, h: 0.07 },
    { group: 'Triceps', side: 'left', x: 0.235, y: 0.318, mirrorX: 0.765, w: 0.13, h: 0.1 },
    { group: 'Forearms', side: 'left', x: 0.160, y: 0.424, mirrorX: 0.839, w: 0.13, h: 0.11 },
    { group: 'Upper Back', side: 'right', x: 0.595, y: 0.265, mirrorX: 0.405, w: 0.2, h: 0.17 },
    { group: 'Lower Back', side: 'right', x: 0.545, y: 0.400, mirrorX: 0.455, w: 0.2, h: 0.06 },
    { group: 'Legs', side: 'right', x: 0.615, y: 0.624, mirrorX: 0.385, w: 0.2, h: 0.36 },
  ],
};

const LABEL_H = 30;
const LABEL_GAP = 8;

export function BodyMap({ side, selected, counts, onPick, maxHeight = 340 }: {
  side: BodySide;
  selected: string | null;
  counts: Record<string, number>;
  onPick: (group: string) => void;
  maxHeight?: number;
}) {
  const { C, isDark } = useTheme();
  const [w, setW] = useState(0);
  const colorOf = (g: string) => C.mg[g] ?? C.accent;

  // The body gets what the two bubble columns leave, up to maxHeight tall
  const colW = Math.min(104, Math.max(78, w * 0.27));
  const bodyH = Math.max(200, Math.min(maxHeight, (w - colW * 2) / BODY_AR));
  const bodyW = bodyH * BODY_AR;
  const bodyX = (w - bodyW) / 2;

  // Bubbles sit level with their muscle, pushed down a little when they'd overlap
  const placed = (['left', 'right'] as const).flatMap(s => {
    let floor = -Infinity;
    return SPOTS[side].filter(p => p.side === s).sort((a, b) => a.y - b.y).map(p => {
      const ay = p.y * bodyH;
      const top = Math.max(ay - LABEL_H / 2, floor);
      floor = top + LABEL_H + LABEL_GAP;
      return { ...p, top, ax: bodyX + p.x * bodyW, ay };
    });
  });

  return (
    <View style={[styles.wrap, { height: bodyH }]} onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)}>
      {w > 0 && (
        <>
          <Image source={BODY[side]} style={{ position: 'absolute', left: bodyX, top: 0, width: bodyW, height: bodyH }} />
          {/* Muscles light up: the picked one strongly, ones already logged faintly */}
          {Object.entries(MASKS[side]).map(([g, src]) => {
            const on = g === selected;
            const logged = (counts[g] ?? 0) > 0;
            if (!on && !logged) return null;
            return (
              <MaskTint key={`${side}-${g}`} src={src} color={colorOf(g)} strong={on}
                style={{ left: bodyX, width: bodyW, height: bodyH }} />
            );
          })}

          {/* Leader lines and the dots they point at */}
          <Svg width={w} height={bodyH} style={StyleSheet.absoluteFill} pointerEvents="none">
            {placed.map(p => {
              const col = colorOf(p.group);
              // From the bubble's inner edge to the muscle
              const x0 = p.side === 'left' ? colW - 6 : w - colW + 6;
              const y0 = p.top + LABEL_H / 2;
              const on = p.group === selected;
              return (
                <React.Fragment key={`l-${p.group}`}>
                  <Line x1={x0} y1={y0} x2={p.ax} y2={p.ay} stroke={col} strokeOpacity={on ? 0.95 : 0.55}
                    strokeWidth={on ? 2 : 1.3} strokeDasharray={on ? undefined : '3 3'} />
                  <Circle cx={p.ax} cy={p.ay} r={on ? 5 : 3.5} fill={col} stroke={isDark ? '#000' : '#fff'} strokeWidth={1.5} />
                </React.Fragment>
              );
            })}
          </Svg>
          {placed.map(p => <PulseDot key={`p-${p.group}`} x={p.ax} y={p.ay} color={colorOf(p.group)} />)}

          {/* Tapping the muscle itself works too (both sides of the body) */}
          {SPOTS[side].flatMap(p => [p.x, p.mirrorX].map((x, i) => (
            <Pressable key={`hit-${p.group}-${i}`} onPress={() => onPick(p.group)} accessibilityLabel={p.group}
              style={{
                position: 'absolute',
                left: bodyX + (x - p.w / 2) * bodyW, top: (p.y - p.h / 2) * bodyH,
                width: p.w * bodyW, height: p.h * bodyH,
              }} />
          )))}

          {/* The bubbles */}
          {placed.map(p => (
            <Callout key={`c-${p.group}`} group={p.group} color={colorOf(p.group)} on={p.group === selected}
              count={counts[p.group] ?? 0} onPress={() => onPick(p.group)}
              style={{ top: p.top, width: colW - 6, ...(p.side === 'left' ? { left: 0 } : { right: 0 }) }} />
          ))}
        </>
      )}
    </View>
  );
}

function MaskTint({ src, color, strong, style }: { src: ImageSourcePropType; color: string; strong: boolean; style: object }) {
  const o = useSharedValue(0);
  useEffect(() => {
    o.value = withTiming(strong ? 0.85 : 0.35, { duration: 260, easing: Easing.out(Easing.cubic) });
  }, [strong, o]);
  const anim = useAnimatedStyle(() => ({ opacity: o.value }));
  return (
    <Animated.Image source={src} fadeDuration={0}
      style={[{ position: 'absolute', top: 0, tintColor: color }, style, anim]} />
  );
}

function PulseDot({ x, y, color }: { x: number; y: number; color: string }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withRepeat(withTiming(1, { duration: 1600, easing: Easing.out(Easing.quad) }), -1, false);
  }, [t]);
  const anim = useAnimatedStyle(() => ({
    opacity: 0.45 * (1 - t.value),
    transform: [{ scale: 0.6 + t.value * 1.6 }],
  }));
  return (
    <Animated.View pointerEvents="none"
      style={[{ position: 'absolute', left: x - 9, top: y - 9, width: 18, height: 18, borderRadius: 9, backgroundColor: color }, anim]} />
  );
}

function Callout({ group, color, on, count, onPress, style }: {
  group: string; color: string; on: boolean; count: number; onPress: () => void; style: object;
}) {
  const { C } = useTheme();
  const s = useSharedValue(1);
  useEffect(() => {
    if (on) s.value = withSequence(withTiming(1.12, { duration: 110 }), withSpring(1, { damping: 7, stiffness: 240 }));
  }, [on, s]);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <Animated.View style={[styles.callout, style, anim]}>
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${group}, pick an exercise`}
        onPressIn={() => { s.value = withSpring(0.92, { damping: 14, stiffness: 400 }); }}
        onPressOut={() => { s.value = withSpring(1, { damping: 8, stiffness: 260 }); }}
        style={[styles.bubble, on
          ? { backgroundColor: color, borderColor: color }
          : { backgroundColor: C.card, borderColor: color + '88' }]}>
        <Text style={[styles.bubbleTxt, { color: on ? '#fff' : C.text }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
          {group}
        </Text>
        {count > 0 && (
          <View style={[styles.count, { backgroundColor: on ? '#ffffff' : color }]}>
            <Text style={[styles.countTxt, { color: on ? color : '#fff' }]}>{count}</Text>
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap:      { alignSelf: 'stretch' },
  callout:   { position: 'absolute', height: LABEL_H },
  bubble:    {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: 10,
    borderWidth: 1.5, paddingHorizontal: 6,
    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  bubbleTxt: { fontSize: 11, fontWeight: '800', flexShrink: 1 },
  count:     { minWidth: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  countTxt:  { fontSize: 10, fontWeight: '900' },
});
