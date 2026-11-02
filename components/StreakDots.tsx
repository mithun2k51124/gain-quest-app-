// components/StreakDots.tsx — the day circles in Home's Overview week row. A trained day holds the
// same burning flame as the streak icon; a missed day gets an X; a rest day (or a day with nothing
// planned) keeps the streak and shows a small moon.
import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { FireIcon } from './FireIcon';

export const FLAME = '#FF6B35';

/**
 * A trained day: the streak icon's flame (flickering, glowing, sparks rising) burning inside the
 * circle. The circle clips it, so the glow and sparks never reach the days beside it.
 */
export function FireDot({ size = 24, delay = 0 }: { size?: number; delay?: number }) {
  const pop = useSharedValue(0);
  useEffect(() => {
    pop.value = withDelay(delay, withTiming(1, { duration: 320, easing: Easing.out(Easing.cubic) }));
  }, [pop, delay]);
  const style = useAnimatedStyle(() => ({ opacity: pop.value, transform: [{ scale: 0.5 + pop.value * 0.5 }] }));
  const flame = Math.round(size * 0.7);

  return (
    <View style={[styles.dot, { width: size, height: size, borderRadius: size / 2, borderWidth: 1.5, borderColor: FLAME, backgroundColor: FLAME + '2E' }]}>
      {/* Nudged down a touch: the flame's tip is taller than its base is wide */}
      <Animated.View style={[{ marginTop: size * 0.04 }, style]}>
        <FireIcon size={flame} />
      </Animated.View>
    </View>
  );
}

/** A skipped planned day: an X that pops in, in the theme's red. */
export function MissedDot({ size = 24, color, delay = 0 }: { size?: number; color: string; delay?: number }) {
  const pop = useSharedValue(0);
  useEffect(() => {
    pop.value = withDelay(delay, withTiming(1, { duration: 280, easing: Easing.out(Easing.cubic) }));
  }, [pop, delay]);
  const style = useAnimatedStyle(() => ({ opacity: pop.value, transform: [{ scale: 0.6 + pop.value * 0.4 }, { rotate: `${(1 - pop.value) * -45}deg` }] }));
  return (
    <View style={[styles.dot, { width: size, height: size, borderRadius: size / 2, borderWidth: 1.5, borderColor: color + '99', backgroundColor: color + '1F' }]}>
      <Animated.View style={style}>
        <Ionicons name="close" size={size * 0.6} color={color} />
      </Animated.View>
    </View>
  );
}

/** A rest day, or a day with nothing planned: the streak carries on, shown with a softly glowing moon. */
export function RestDot({ size = 24 }: { size?: number }) {
  const glow = useSharedValue(0);
  useEffect(() => {
    glow.value = withRepeat(withSequence(
      withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.sin) }),
      withTiming(0, { duration: 1600, easing: Easing.inOut(Easing.sin) }),
    ), -1, false);
  }, [glow]);
  const style = useAnimatedStyle(() => ({ opacity: 0.65 + glow.value * 0.35 }));
  return (
    <View style={[styles.dot, { width: size, height: size, borderRadius: size / 2, borderWidth: 1.5, borderColor: FLAME + '66', backgroundColor: FLAME + '12' }]}>
      <Animated.View style={style}>
        <Ionicons name="moon" size={size * 0.45} color={FLAME} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  dot: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});
