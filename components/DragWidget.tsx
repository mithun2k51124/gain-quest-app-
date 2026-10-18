// components/DragWidget.tsx — one reorderable widget row for the Home and Tracker lists.
// Long-press lifts the widget with a spring (scale, shadow and an accent glow all animate on
// the UI thread), and it settles back the same way when dropped. The layout never changes on
// lift, so the list doesn't re-measure mid-drag, and the tab swipe is paused while dragging.
import React, { useEffect, useRef } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, { interpolate, useAnimatedStyle } from 'react-native-reanimated';
import { useOnCellActiveAnimation } from 'react-native-draggable-flatlist';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../contexts/ThemeContext';
import { setSwipeLocked } from '../utils/swipeLock';

const LIFT = { damping: 18, stiffness: 220, mass: 0.7 };

export function DragWidget({ drag, isActive, children }: {
  drag: () => void;
  isActive: boolean;
  children: React.ReactNode;
}) {
  const { C } = useTheme();
  const { onActiveAnim } = useOnCellActiveAnimation({ animationConfig: LIFT });
  // The tab swipe comes back on drop, or right away if a drag never got going
  const activeRef = useRef(isActive);
  activeRef.current = isActive;
  const wasActive = useRef(false);
  useEffect(() => {
    if (wasActive.current && !isActive) setSwipeLocked(false);
    wasActive.current = isActive;
  }, [isActive]);

  const lift = useAnimatedStyle(() => {
    const t = onActiveAnim.value;
    return {
      transform: [{ scale: interpolate(t, [0, 1], [1, 1.03]) }],
      shadowOpacity: interpolate(t, [0, 1], [0, 0.35]),
      shadowRadius: interpolate(t, [0, 1], [0, 18]),
      elevation: interpolate(t, [0, 1], [0, 14]),
    };
  });
  const glow = useAnimatedStyle(() => ({ opacity: onActiveAnim.value }));

  return (
    <Animated.View style={[styles.wrap, { backgroundColor: C.bg, shadowColor: C.accent }, lift]}>
      <Pressable
        onLongPress={() => {
          setSwipeLocked(true);
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
          drag();
          setTimeout(() => { if (!activeRef.current) setSwipeLocked(false); }, 800);
        }}
        delayLongPress={250}
        disabled={isActive}
      >
        {children}
      </Pressable>
      <Animated.View pointerEvents="none" style={[styles.glow, { borderColor: C.accent }, glow]} />
    </Animated.View>
  );
}

/** Props every widget list passes to DraggableFlatList: calm springs and the swipe unlock. */
export const DRAG_LIST_PROPS = {
  activationDistance: 6,
  autoscrollThreshold: 60,
  autoscrollSpeed: 120,
  animationConfig: { damping: 22, stiffness: 200, mass: 0.6, overshootClamping: false },
  onRelease: () => setSwipeLocked(false),
} as const;

const styles = StyleSheet.create({
  wrap: { marginBottom: 16, borderRadius: 22, shadowOffset: { width: 0, height: 10 } },
  glow: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 22, borderWidth: 1.5 },
});
