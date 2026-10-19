// components/HeaderIconButton.tsx — the round buttons at the top right of each screen, each with
// a small animation of its own when tapped: the settings gear turns like a tuning wheel, the bell
// rings, the chart's bars grow. A soft ripple spreads out behind the icon on every tap.
// The action runs a beat after the tap, so the animation is seen before the screen changes.
import React, { useCallback } from 'react';
import { Pressable, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import Animated, {
  Easing, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../contexts/ThemeContext';

export type IconMotion = 'spin' | 'ring' | 'bars';

const HIT = { top: 10, bottom: 10, left: 10, right: 10 };
// How long the action waits for the animation to read
const ACTION_DELAY: Record<IconMotion, number> = { spin: 170, ring: 0, bars: 150 };

export function HeaderIconButton({ icon, motion, onPress, color, label, style }: {
  icon: keyof typeof Ionicons.glyphMap;
  motion: IconMotion;
  onPress: () => void;
  color?: string;
  label: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { C, isDark } = useTheme();
  const press = useSharedValue(1);
  const rotate = useSharedValue(0);
  const grow = useSharedValue(1);
  const ripple = useSharedValue(0);

  const play = useCallback(() => {
    ripple.value = 0;
    ripple.value = withTiming(1, { duration: 520, easing: Easing.out(Easing.cubic) });
    if (motion === 'spin') {
      // A gear with 8 teeth looks the same every 45°, so ending on 180° then snapping to 0 is seamless
      rotate.value = 0;
      rotate.value = withSequence(
        withTiming(200, { duration: 380, easing: Easing.out(Easing.cubic) }),
        withSpring(180, { damping: 9, stiffness: 180 }),
        withTiming(0, { duration: 0 }),
      );
    } else if (motion === 'ring') {
      rotate.value = withSequence(
        withTiming(-20, { duration: 70 }), withTiming(17, { duration: 90 }), withTiming(-13, { duration: 85 }),
        withTiming(9, { duration: 80 }), withTiming(-5, { duration: 75 }), withSpring(0, { damping: 8, stiffness: 220 }),
      );
    } else {
      grow.value = withSequence(
        withTiming(0.35, { duration: 120, easing: Easing.in(Easing.quad) }),
        withSpring(1, { damping: 6, stiffness: 240, mass: 0.6 }),
      );
    }
  }, [motion, ripple, rotate, grow]);

  const onTap = () => {
    play();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const wait = ACTION_DELAY[motion];
    if (wait) setTimeout(onPress, wait);
    else onPress();
  };

  const boxStyle = useAnimatedStyle(() => ({ transform: [{ scale: press.value }] }));
  const iconStyle = useAnimatedStyle(() => (motion === 'bars'
    ? { transform: [{ scaleY: grow.value }] }
    : { transform: [{ rotate: `${rotate.value}deg` }] }));
  const rippleStyle = useAnimatedStyle(() => ({
    opacity: ripple.value === 0 ? 0 : 0.35 * (1 - ripple.value),
    transform: [{ scale: 0.6 + ripple.value * 0.9 }],
  }));

  const tint = color ?? C.accent;
  return (
    <Pressable
      onPress={onTap}
      onPressIn={() => { press.value = withSpring(0.86, { damping: 14, stiffness: 400 }); }}
      onPressOut={() => { press.value = withSpring(1, { damping: 9, stiffness: 260 }); }}
      hitSlop={HIT}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={style}
    >
      <Animated.View style={[styles.btn, {
        backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)',
        borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)',
      }, boxStyle]}>
        <Animated.View pointerEvents="none" style={[styles.ripple, { backgroundColor: tint }, rippleStyle]} />
        {/* The bell swings from its top, the bars grow from the bottom */}
        <Animated.View style={[iconStyle, motion === 'ring' && styles.fromTop, motion === 'bars' && styles.fromBottom]}>
          <Ionicons name={icon} size={18} color={tint} />
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn:        { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  ripple:     { position: 'absolute', width: 38, height: 38, borderRadius: 19 },
  fromTop:    { transformOrigin: 'top' },
  fromBottom: { transformOrigin: 'bottom' },
});
