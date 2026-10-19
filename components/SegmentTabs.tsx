// components/SegmentTabs.tsx — a section switcher built like the bottom tab bar (Workouts' Planner /
// Log / Muscles / History). Each section has its own colour and icon. A tinted pill glides to the one
// you pick, stretching as it travels and changing colour on the way, with a glowing bar under it; the
// icon fills in, hops and sends out a ripple, with a light haptic tick.
import React, { useEffect, useState } from 'react';
import { View, Pressable, StyleSheet, LayoutChangeEvent } from 'react-native';
import Animated, {
  Easing, interpolateColor, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../contexts/ThemeContext';

export interface SegmentDef<K extends string> {
  key: K;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;        // inactive (outline)
  activeIcon: keyof typeof Ionicons.glyphMap;  // active (filled)
  color: string;                               // #RRGGBB
}

const H = 50;
const PAD = 4;
const GLIDE = { damping: 17, stiffness: 190, mass: 0.8 };

export function SegmentTabs<K extends string>({ tabs, active, onChange }: {
  tabs: SegmentDef<K>[];
  active: K;
  onChange: (key: K) => void;
}) {
  const { C, isDark } = useTheme();
  const idx = Math.max(0, tabs.findIndex(t => t.key === active));
  const [width, setWidth] = useState(0);
  const cellW = width / Math.max(1, tabs.length);
  const pos = useSharedValue(idx);
  const target = useSharedValue(idx);

  useEffect(() => {
    target.value = idx;
    pos.value = withSpring(idx, GLIDE);
  }, [idx, pos, target]);

  // The pill blends between the sections' colours (hex #RRGGBBAA, so the tints blend too)
  const steps = tabs.map((_, i) => i);
  const colors = tabs.map(t => t.color);
  const fills = colors.map(c => c + (isDark ? '2B' : '22'));
  const edges = colors.map(c => c + '66');

  const pillStyle = useAnimatedStyle(() => {
    // Stretched while it's on its way, back to size as it arrives
    const away = Math.min(1, Math.abs(target.value - pos.value));
    return {
      width: Math.max(0, cellW),
      transform: [{ translateX: pos.value * cellW }, { scaleX: 1 + away * 0.22 }, { scaleY: 1 - away * 0.08 }],
      backgroundColor: interpolateColor(pos.value, steps, fills),
      borderColor: interpolateColor(pos.value, steps, edges),
    };
  });
  const barStyle = useAnimatedStyle(() => {
    const color = interpolateColor(pos.value, steps, colors);
    return { backgroundColor: color, shadowColor: color };
  });

  return (
    <View style={[styles.wrap, { backgroundColor: C.card, borderColor: C.border }]}>
      <View style={styles.row} onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
        {width > 0 && (
          <Animated.View pointerEvents="none" style={[styles.pill, pillStyle]}>
            <Animated.View style={[styles.bar, barStyle]} />
          </Animated.View>
        )}
        {tabs.map((t, i) => (
          <Cell key={t.key} def={t} muted={C.muted} focused={i === idx}
            onPress={() => {
              if (i === idx) return;
              Haptics.selectionAsync().catch(() => {});
              onChange(t.key);
            }} />
        ))}
      </View>
    </View>
  );
}

function Cell<K extends string>({ def, muted, focused, onPress }: { def: SegmentDef<K>; muted: string; focused: boolean; onPress: () => void }) {
  const press = useSharedValue(1);
  const hop = useSharedValue(0);
  const pop = useSharedValue(1);
  const ripple = useSharedValue(0);

  // Becoming the active section: the icon hops, pops and sends out a ripple
  useEffect(() => {
    if (!focused) return;
    hop.value = withSequence(withTiming(-5, { duration: 120, easing: Easing.out(Easing.quad) }), withSpring(0, { damping: 7, stiffness: 260 }));
    pop.value = withSequence(withTiming(1.25, { duration: 120 }), withSpring(1, { damping: 6, stiffness: 240 }));
    ripple.value = 0;
    ripple.value = withTiming(1, { duration: 540, easing: Easing.out(Easing.cubic) });
  }, [focused, hop, pop, ripple]);

  const iconStyle = useAnimatedStyle(() => ({ transform: [{ translateY: hop.value }, { scale: pop.value * press.value }] }));
  const labelStyle = useAnimatedStyle(() => ({ transform: [{ scale: press.value }] }));
  const rippleStyle = useAnimatedStyle(() => ({
    opacity: ripple.value === 0 || ripple.value === 1 ? 0 : 0.45 * (1 - ripple.value),
    transform: [{ scale: 0.4 + ripple.value * 1.5 }],
  }));

  const color = focused ? def.color : muted;
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => { press.value = withSpring(0.86, { damping: 14, stiffness: 420 }); }}
      onPressOut={() => { press.value = withSpring(1, { damping: 8, stiffness: 260 }); }}
      style={styles.cell}
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={def.label}
    >
      <View style={styles.iconWrap}>
        <Animated.View pointerEvents="none" style={[styles.ripple, { borderColor: def.color }, rippleStyle]} />
        <Animated.View style={iconStyle}>
          <Ionicons name={focused ? def.activeIcon : def.icon} size={19} color={color} />
        </Animated.View>
      </View>
      <Animated.Text style={[styles.label, { color }, focused && styles.labelOn, labelStyle]} numberOfLines={1}>
        {def.label}
      </Animated.Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap:     { borderRadius: 18, borderWidth: 1, padding: PAD },
  row:      { flexDirection: 'row', height: H },
  pill:     { position: 'absolute', top: 0, height: H, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'flex-end' },
  bar:      { width: 20, height: 3, borderTopLeftRadius: 3, borderTopRightRadius: 3, marginBottom: -1, shadowOpacity: 0.9, shadowRadius: 5, shadowOffset: { width: 0, height: -1 }, elevation: 3 },
  cell:     { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 2 },
  iconWrap: { width: 28, height: 22, alignItems: 'center', justifyContent: 'center' },
  ripple:   { position: 'absolute', width: 28, height: 28, borderRadius: 14, borderWidth: 2 },
  label:    { fontSize: 11, fontWeight: '700', marginTop: 1, letterSpacing: 0.2 },
  labelOn:  { fontWeight: '900' },
});
