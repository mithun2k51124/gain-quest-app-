// components/DumbbellIcon.tsx — a dumbbell that keeps doing reps: it lifts and tilts like a curl,
// holds at the top while effort lines flash, comes back down and lands with a little squash. Its
// shadow shrinks while it's up and a soft glow follows the lift. All on the UI thread.
import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

const CYCLE = 2300;

const phase = (t: number, a: number, b: number) => {
  'worklet';
  return Math.min(1, Math.max(0, (t - a) / (b - a)));
};

/** 0 resting → 1 at the top of the rep */
const liftAt = (t: number) => {
  'worklet';
  if (t < 0.26) { const p = phase(t, 0, 0.26); return 1 - (1 - p) * (1 - p) * (1 - p); }
  if (t < 0.4) return 1;
  if (t < 0.64) { const p = phase(t, 0.4, 0.64); return 1 - (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2); }
  return 0;
};

export function DumbbellIcon({ size = 24, color }: { size?: number; color: string }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withRepeat(withTiming(1, { duration: CYCLE, easing: Easing.linear }), -1, false);
  }, [t]);

  const bellStyle = useAnimatedStyle(() => {
    const lift = liftAt(t.value);
    // A small shake while it's held up, a squash as it lands
    const hold = t.value >= 0.26 && t.value < 0.4 ? Math.sin((t.value - 0.26) * 90) * 1.6 : 0;
    const land = Math.sin(phase(t.value, 0.64, 0.75) * Math.PI);
    return {
      transform: [
        { translateY: -lift * size * 0.17 },
        { rotate: `${-lift * 16 + hold}deg` },
        { scaleX: 1 + land * 0.08 },
        { scaleY: 1 - land * 0.1 },
      ],
    };
  });
  const shadowStyle = useAnimatedStyle(() => {
    const lift = liftAt(t.value);
    return { opacity: 0.32 - lift * 0.18, transform: [{ scaleX: 1 - lift * 0.45 }] };
  });
  const glowStyle = useAnimatedStyle(() => {
    const lift = liftAt(t.value);
    return { opacity: 0.1 + lift * 0.22, transform: [{ scale: 0.8 + lift * 0.25 }] };
  });
  const effortStyle = useAnimatedStyle(() => {
    const e = Math.sin(phase(t.value, 0.24, 0.42) * Math.PI);
    return { opacity: e, transform: [{ scale: 0.6 + e * 0.4 }] };
  });

  const line = { width: Math.max(1.5, size * 0.07), height: size * 0.2, borderRadius: size, backgroundColor: color };
  return (
    <View style={{ width: size, height: size }}>
      <Animated.View style={[styles.glow, { width: size, height: size, borderRadius: size / 2, backgroundColor: color }, glowStyle]} />
      <Animated.View style={[styles.shadow, {
        width: size * 0.62, height: size * 0.09, borderRadius: size, left: size * 0.19, top: size * 0.84, backgroundColor: color,
      }, shadowStyle]} />
      {/* Effort lines either side at the top of the rep */}
      <Animated.View style={[styles.abs, { left: size * 0.04, top: size * 0.02 }, effortStyle]}>
        <View style={[line, { transform: [{ rotate: '-35deg' }] }]} />
      </Animated.View>
      <Animated.View style={[styles.abs, { right: size * 0.04, top: size * 0.02 }, effortStyle]}>
        <View style={[line, { transform: [{ rotate: '35deg' }] }]} />
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, bellStyle]}>
        <Svg width={size} height={size} viewBox="0 0 24 24">
          {/* Bar, inner plates, outer plates, then a highlight on each inner plate */}
          <Rect x={6.5} y={10.3} width={11} height={2.6} rx={1.3} fill={color} opacity={0.75} />
          <Rect x={4.1} y={6.4} width={3.3} height={10.4} rx={1.5} fill={color} />
          <Rect x={16.6} y={6.4} width={3.3} height={10.4} rx={1.5} fill={color} />
          <Rect x={1.5} y={8.1} width={2.9} height={7} rx={1.2} fill={color} opacity={0.85} />
          <Rect x={19.6} y={8.1} width={2.9} height={7} rx={1.2} fill={color} opacity={0.85} />
          <Rect x={4.75} y={7.4} width={0.9} height={3.6} rx={0.45} fill="#FFFFFF" opacity={0.45} />
          <Rect x={17.25} y={7.4} width={0.9} height={3.6} rx={0.45} fill="#FFFFFF" opacity={0.45} />
        </Svg>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  abs:    { position: 'absolute' },
  glow:   { position: 'absolute' },
  shadow: { position: 'absolute' },
});
