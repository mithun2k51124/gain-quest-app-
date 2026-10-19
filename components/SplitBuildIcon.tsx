// components/SplitBuildIcon.tsx — "build your split": three blocks in muscle-group colours drop in
// one after another and land with a squash, building a little skyline of training days; a shine runs
// across them, they sink away and the build starts again. All on the UI thread.
import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, { Easing, SharedValue, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useTheme } from '../contexts/ThemeContext';

const CYCLE = 3000;
// Column left edge and height, as fractions of the icon
const BLOCKS: { x: number; h: number }[] = [{ x: 0.1, h: 0.36 }, { x: 0.39, h: 0.62 }, { x: 0.68, h: 0.48 }];
const BASE = 0.86;   // the ground line

const phase = (t: number, a: number, b: number) => {
  'worklet';
  return Math.min(1, Math.max(0, (t - a) / (b - a)));
};

function Block({ t, i, size, color }: { t: SharedValue<number>; i: number; size: number; color: string }) {
  const b = BLOCKS[i];
  const start = 0.04 + i * 0.13;
  const style = useAnimatedStyle(() => {
    const p = phase(t.value, start, start + 0.24);
    const out = phase(t.value, 0.84, 0.97);
    let y = 0, sx = 1, sy = 1;
    if (p < 0.55) {
      // Falling, faster and faster
      const f = p / 0.55;
      y = -(1 - f * f) * size * 0.95;
    } else if (p < 0.8) {
      // Landing squash
      const s = Math.sin(((p - 0.55) / 0.25) * Math.PI);
      sy = 1 - s * 0.2; sx = 1 + s * 0.12;
    } else {
      y = -Math.sin(((p - 0.8) / 0.2) * Math.PI) * size * 0.05;
    }
    return {
      opacity: (p > 0 ? Math.min(1, p * 5) : 0) * (1 - out),
      transform: [{ translateY: y + out * size * 0.06 }, { scaleX: sx }, { scaleY: sy * (1 - out * 0.7) }],
    };
  });
  return (
    <Animated.View style={[styles.block, {
      left: b.x * size, width: size * 0.22, height: b.h * size, top: (BASE - b.h) * size, borderRadius: size * 0.06,
      backgroundColor: color,
    }, style]} />
  );
}

export function SplitBuildIcon({ size = 26, colors }: { size?: number; colors?: string[] }) {
  const { C } = useTheme();
  const palette = colors ?? [C.mg.Chest, C.mg['Upper Back'], C.mg.Legs];
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withRepeat(withTiming(1, { duration: CYCLE, easing: Easing.linear }), -1, false);
  }, [t]);

  // Once all three have landed, a shine sweeps across them
  const shine = useAnimatedStyle(() => {
    const p = phase(t.value, 0.58, 0.78);
    return { opacity: p > 0 && p < 1 ? 0.55 : 0, transform: [{ translateX: (p * 1.6 - 0.5) * size }, { rotate: '20deg' }] };
  });
  // The ground line glows as the last block lands
  const ground = useAnimatedStyle(() => ({ opacity: 0.35 + Math.sin(phase(t.value, 0.4, 0.62) * Math.PI) * 0.5 }));

  return (
    <View style={{ width: size, height: size }}>
      <View style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]}>
        {BLOCKS.map((_, i) => <Block key={i} t={t} i={i} size={size} color={palette[i % palette.length]} />)}
        <Animated.View style={[styles.shine, { width: size * 0.16, height: size * 1.4, top: -size * 0.2 }, shine]} />
      </View>
      <Animated.View style={[styles.ground, {
        left: size * 0.04, right: size * 0.04, top: BASE * size + 1, height: Math.max(1.5, size * 0.06), backgroundColor: C.textSub,
      }, ground]} />
    </View>
  );
}

const styles = StyleSheet.create({
  block:  { position: 'absolute', transformOrigin: 'bottom' },
  shine:  { position: 'absolute', left: 0, backgroundColor: '#FFFFFF' },
  ground: { position: 'absolute', borderRadius: 2 },
});
