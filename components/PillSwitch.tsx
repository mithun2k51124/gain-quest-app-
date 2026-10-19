// components/PillSwitch.tsx — a two-to-four way switch: a coloured pill springs across to the option
// you tap (squashing a little on the way) and its icon pops, with a light haptic tick. 'glass' sits
// on top of the camera, 'card' on the app's own surfaces.
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../contexts/ThemeContext';

export interface PillOption<K extends string> { key: K; label: string; icon?: keyof typeof Ionicons.glyphMap }

const SPRING = { damping: 16, stiffness: 210, mass: 0.7 };

export function PillSwitch<K extends string>({ options, value, onChange, color, variant = 'card', height = 42 }: {
  options: PillOption<K>[];
  value: K;
  onChange: (key: K) => void;
  color: string;
  variant?: 'card' | 'glass';
  height?: number;
}) {
  const { C } = useTheme();
  const idx = Math.max(0, options.findIndex(o => o.key === value));
  const [width, setWidth] = useState(0);
  const cellW = width / Math.max(1, options.length);
  const pos = useSharedValue(idx);
  const target = useSharedValue(idx);
  useEffect(() => {
    target.value = idx;
    pos.value = withSpring(idx, SPRING);
  }, [idx, pos, target]);

  const pill = useAnimatedStyle(() => {
    const away = Math.min(1, Math.abs(target.value - pos.value));
    return { width: cellW, transform: [{ translateX: pos.value * cellW }, { scaleX: 1 + away * 0.18 }, { scaleY: 1 - away * 0.1 }] };
  });

  const glass = variant === 'glass';
  return (
    <View style={[styles.wrap, { height: height + 8 },
      glass ? styles.glass : { backgroundColor: C.bg, borderColor: C.border }]}>
      <View style={{ flex: 1, flexDirection: 'row' }} onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
        {width > 0 && (
          <Animated.View pointerEvents="none" style={[styles.pill, { height, backgroundColor: color, shadowColor: color }, pill]} />
        )}
        {options.map((o, i) => (
          <Option key={o.key} option={o} on={i === idx} height={height}
            idle={glass ? 'rgba(255,255,255,0.75)' : C.textSub}
            onPress={() => {
              if (i === idx) return;
              Haptics.selectionAsync().catch(() => {});
              onChange(o.key);
            }} />
        ))}
      </View>
    </View>
  );
}

function Option<K extends string>({ option, on, idle, height, onPress }: {
  option: PillOption<K>; on: boolean; idle: string; height: number; onPress: () => void;
}) {
  const pop = useSharedValue(1);
  const press = useSharedValue(1);
  useEffect(() => {
    if (on) pop.value = withSequence(withTiming(1.25, { duration: 110 }), withSpring(1, { damping: 6, stiffness: 240 }));
  }, [on, pop]);
  const iconStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value * press.value }] }));
  const color = on ? '#FFFFFF' : idle;
  return (
    <Pressable onPress={onPress} style={[styles.option, { height }]}
      onPressIn={() => { press.value = withSpring(0.88, { damping: 14, stiffness: 420 }); }}
      onPressOut={() => { press.value = withSpring(1, { damping: 8, stiffness: 260 }); }}
      accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={option.label}>
      {option.icon && (
        <Animated.View style={iconStyle}>
          <Ionicons name={option.icon} size={16} color={color} />
        </Animated.View>
      )}
      <Text style={[styles.label, { color }, on && styles.labelOn]} numberOfLines={1}>{option.label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap:    { borderRadius: 16, borderWidth: 1, padding: 4 },
  glass:   { backgroundColor: 'rgba(10,12,20,0.55)', borderColor: 'rgba(255,255,255,0.16)' },
  pill:    { position: 'absolute', top: 0, left: 0, borderRadius: 12, shadowOpacity: 0.45, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 4 },
  option:  { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  label:   { fontSize: 13, fontWeight: '700' },
  labelOn: { fontWeight: '900' },
});
