// components/AnimatedTabBar.tsx — the bottom navigation bar.
// Each tab has its own colour and sits in its own cell, with thin dividers between them. A
// tinted pill glides to the tab you pick and changes colour on the way; the icon fills in,
// hops and sends out a ripple, with a light haptic tick.
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, LayoutChangeEvent } from 'react-native';
import type { Tabs } from 'expo-router';
import Animated, {
  Easing, interpolateColor, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../contexts/ThemeContext';

export interface TabDef {
  name: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;        // inactive (outline)
  activeIcon: keyof typeof Ionicons.glyphMap;  // active (filled)
  colorKey: 'accent' | 'purple' | 'teal' | 'orange' | 'green';
}

/** What expo-router's Tabs hands a custom tab bar. */
type TabBarProps = Parameters<NonNullable<React.ComponentProps<typeof Tabs>['tabBar']>>[0];

export const BAR_HEIGHT = 68;
const PILL_INSET = 6;
const PILL_H = 52;
const GLIDE = { damping: 18, stiffness: 190, mass: 0.8 };

export function AnimatedTabBar({ state, navigation, insets, tabs }: TabBarProps & { tabs: TabDef[] }) {
  const { C, isDark } = useTheme();
  const routes = tabs.map(t => state.routes.find(r => r.name === t.name)).filter(Boolean) as typeof state.routes;
  const focusedName = state.routes[state.index]?.name;
  // Settings and Analytics aren't tabs: no pill while they're open
  const activeIdx = tabs.findIndex(t => t.name === focusedName);
  const colors = tabs.map(t => C[t.colorKey]);
  // The pill blends between the tabs' colours (hex #RRGGBBAA, so the tints blend too)
  const steps = tabs.map((_, i) => i);
  const fills = colors.map(c => c + (isDark ? '26' : '1F'));
  const edges = colors.map(c => c + '59');

  const [width, setWidth] = useState(0);
  const cellW = width / Math.max(1, tabs.length);
  const pos = useSharedValue(Math.max(0, activeIdx));
  const shown = useSharedValue(activeIdx >= 0 ? 1 : 0);

  useEffect(() => {
    if (activeIdx >= 0) pos.value = withSpring(activeIdx, GLIDE);
    shown.value = withTiming(activeIdx >= 0 ? 1 : 0, { duration: 180 });
  }, [activeIdx, pos, shown]);

  const pillStyle = useAnimatedStyle(() => ({
    opacity: shown.value,
    width: Math.max(0, cellW - PILL_INSET * 2),
    transform: [{ translateX: pos.value * cellW + PILL_INSET }],
    backgroundColor: interpolateColor(pos.value, steps, fills),
    borderColor: interpolateColor(pos.value, steps, edges),
  }));
  const barStyle = useAnimatedStyle(() => {
    const color = interpolateColor(pos.value, steps, colors);
    return { backgroundColor: color, shadowColor: color };
  });

  return (
    <View style={[styles.bar, {
      height: BAR_HEIGHT + insets.bottom,
      paddingBottom: insets.bottom,
      backgroundColor: C.bg,
      borderTopColor: C.border,
      shadowColor: isDark ? '#000000' : '#BFC8D6',
    }]}>
      <View style={styles.row} onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
        {width > 0 && (
          <Animated.View pointerEvents="none" style={[styles.pill, pillStyle]}>
            <Animated.View style={[styles.pillBar, barStyle]} />
          </Animated.View>
        )}
        {/* Dividers between the cells */}
        {width > 0 && tabs.slice(1).map((t, i) => (
          <View key={`d${t.name}`} pointerEvents="none"
            style={[styles.divider, { left: cellW * (i + 1) - 0.5, backgroundColor: C.border }]} />
        ))}
        {routes.map((route, i) => (
          <TabCell
            key={route.key}
            def={tabs[i]}
            color={colors[i]}
            muted={C.muted}
            focused={i === activeIdx}
            onPress={() => {
              const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (i !== activeIdx && !event.defaultPrevented) {
                Haptics.selectionAsync().catch(() => {});
                navigation.navigate(route.name, route.params);
              }
            }}
            onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
          />
        ))}
      </View>
    </View>
  );
}

function TabCell({ def, color, muted, focused, onPress, onLongPress }: {
  def: TabDef; color: string; muted: string; focused: boolean; onPress: () => void; onLongPress: () => void;
}) {
  const press = useSharedValue(1);
  const hop = useSharedValue(0);
  const pop = useSharedValue(1);
  const ripple = useSharedValue(0);

  // Becoming the active tab: the icon hops, pops and sends out a ripple
  useEffect(() => {
    if (!focused) return;
    hop.value = withSequence(withTiming(-6, { duration: 130, easing: Easing.out(Easing.quad) }), withSpring(0, { damping: 7, stiffness: 260 }));
    pop.value = withSequence(withTiming(1.22, { duration: 130 }), withSpring(1, { damping: 6, stiffness: 240 }));
    ripple.value = 0;
    ripple.value = withTiming(1, { duration: 560, easing: Easing.out(Easing.cubic) });
  }, [focused, hop, pop, ripple]);

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: hop.value }, { scale: pop.value * press.value }],
  }));
  const rippleStyle = useAnimatedStyle(() => ({
    opacity: ripple.value === 0 || ripple.value === 1 ? 0 : 0.4 * (1 - ripple.value),
    transform: [{ scale: 0.4 + ripple.value * 1.4 }],
  }));

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={() => { press.value = withSpring(0.82, { damping: 14, stiffness: 420 }); }}
      onPressOut={() => { press.value = withSpring(1, { damping: 8, stiffness: 260 }); }}
      style={styles.cell}
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={def.label}
    >
      <View style={styles.iconWrap}>
        <Animated.View pointerEvents="none" style={[styles.ripple, { borderColor: color }, rippleStyle]} />
        <Animated.View style={iconStyle}>
          <Ionicons name={focused ? def.activeIcon : def.icon} size={21} color={focused ? color : muted} />
        </Animated.View>
      </View>
      <Text style={[styles.label, { color: focused ? color : muted }, focused && styles.labelOn]} numberOfLines={1}>
        {def.label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    borderTopWidth: 1,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.8,
    shadowRadius: 10,
    elevation: 12,
  },
  row:     { flex: 1, flexDirection: 'row' },
  pill:    { position: 'absolute', top: (BAR_HEIGHT - PILL_H) / 2, height: PILL_H, borderRadius: 18, borderWidth: 1, alignItems: 'center' },
  pillBar: { width: 22, height: 3, borderBottomLeftRadius: 3, borderBottomRightRadius: 3, marginTop: -1, shadowOpacity: 0.9, shadowRadius: 5, shadowOffset: { width: 0, height: 1 }, elevation: 3 },
  divider: { position: 'absolute', top: (BAR_HEIGHT - 26) / 2, width: 1, height: 26, opacity: 0.8 },
  cell:    { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 2 },
  iconWrap:{ width: 34, height: 28, alignItems: 'center', justifyContent: 'center' },
  ripple:  { position: 'absolute', width: 34, height: 34, borderRadius: 17, borderWidth: 2 },
  label:   { fontSize: 10, fontWeight: '700', marginTop: 2, letterSpacing: 0.2 },
  labelOn: { fontWeight: '800' },
});
