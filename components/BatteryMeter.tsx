// components/BatteryMeter.tsx — a phone-style battery that fills to a percentage in its habit's own
// colour: the charge slides in, a light sweep runs across it while it's charging, and a full battery
// pulses with a bolt.
import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  Easing, interpolate, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming, cancelAnimation,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';

const W = 46;
const H = 22;
const PAD = 2.5;

export function BatteryMeter({ pct, color }: { pct: number; color?: string }) {
  const { C } = useTheme();
  const p = Math.max(0, Math.min(1, pct || 0));
  const full = p >= 1;
  const tint = color ?? C.accent;

  const fill = useSharedValue(0);
  const sweep = useSharedValue(0);
  const pulse = useSharedValue(0);

  useEffect(() => {
    fill.value = withTiming(p, { duration: 900, easing: Easing.out(Easing.cubic) });
  }, [p, fill]);

  useEffect(() => {
    if (full) {
      cancelAnimation(sweep);
      pulse.value = withRepeat(withSequence(withTiming(1, { duration: 700 }), withTiming(0, { duration: 700 })), -1, false);
    } else {
      cancelAnimation(pulse);
      pulse.value = 0;
      // Still charging: a soft light keeps sweeping across the charge
      sweep.value = 0;
      sweep.value = withRepeat(withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.quad) }), -1, false);
    }
  }, [full, sweep, pulse]);

  const inner = W - PAD * 2;
  const fillStyle = useAnimatedStyle(() => ({ width: Math.max(fill.value > 0 ? 3 : 0, inner * fill.value) }));
  const sweepStyle = useAnimatedStyle(() => ({
    opacity: full ? 0 : 0.55,
    transform: [{ translateX: interpolate(sweep.value, [0, 1], [-14, inner * fill.value]) }],
  }));
  const bodyStyle = useAnimatedStyle(() => ({
    shadowOpacity: full ? 0.25 + pulse.value * 0.5 : 0,
    transform: [{ scale: full ? 1 + pulse.value * 0.05 : 1 }],
  }));

  return (
    <Animated.View style={[styles.wrap, { shadowColor: tint }, bodyStyle]}>
      {/* The empty part is a faint wash of the same colour, so each battery reads as its habit's */}
      <View style={[styles.body, { borderColor: tint, backgroundColor: tint + '14' }]}>
        <Animated.View style={[styles.fill, { backgroundColor: tint }, fillStyle]}>
          <Animated.View style={[styles.sweep, sweepStyle]} />
        </Animated.View>
        {full && (
          <View style={styles.bolt}>
            <Ionicons name="flash" size={12} color="#fff" />
          </View>
        )}
      </View>
      <View style={[styles.cap, { backgroundColor: tint }]} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap:  { flexDirection: 'row', alignItems: 'center', shadowOffset: { width: 0, height: 0 }, shadowRadius: 6 },
  body:  { width: W, height: H, borderRadius: 6, borderWidth: 2, padding: PAD - 1, overflow: 'hidden', justifyContent: 'center' },
  fill:  { height: '100%', borderRadius: 3, overflow: 'hidden' },
  sweep: { position: 'absolute', top: 0, bottom: 0, width: 12, backgroundColor: '#FFFFFF' },
  bolt:  { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  cap:   { width: 3, height: 9, borderTopRightRadius: 2, borderBottomRightRadius: 2, marginLeft: 1 },
});
