// components/ScanIcon.tsx — the scan icon with a beam that never stops sweeping up and down between
// its corners, a faint trail behind it, like it's reading whatever it's pointed at.
import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

export function ScanIcon({ size = 16, color }: { size?: number; color: string }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withRepeat(withTiming(1, { duration: 2200, easing: Easing.linear }), -1, false);
  }, [t]);

  const reach = size * 0.27;
  // Down then up, slowing at each end; the trail sits behind the beam's direction of travel
  const beam = useAnimatedStyle(() => ({ transform: [{ translateY: -Math.cos(t.value * 2 * Math.PI) * reach }] }));
  const trail = useAnimatedStyle(() => {
    const dir = Math.sin(t.value * 2 * Math.PI);
    return {
      opacity: 0.35 * Math.abs(dir),
      transform: [{ translateY: -Math.cos(t.value * 2 * Math.PI) * reach - dir * size * 0.13 }],
    };
  });

  const inset = size * 0.24;
  return (
    <View style={{ width: size, height: size }}>
      <Ionicons name="scan" size={size} color={color} />
      <Animated.View pointerEvents="none" style={[styles.bar, {
        left: inset, right: inset, top: size / 2 - size * 0.1, height: size * 0.2, borderRadius: size, backgroundColor: color,
      }, trail]} />
      <Animated.View pointerEvents="none" style={[styles.bar, {
        left: inset - 1, right: inset - 1, top: size / 2 - 0.8, height: 1.6, borderRadius: 1, backgroundColor: color,
      }, beam]} />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { position: 'absolute' },
});
