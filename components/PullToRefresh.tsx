// components/PullToRefresh.tsx — pull down at the top of a screen to reload it.
// Replaces the platform RefreshControl: the pull runs on the UI thread (no waiting on JS), the
// reload itself is quick, and the indicator is ours: a puck that drops in as you pull, its ring
// filling up, a tick when it's armed, a spin while it reloads and a green check when it's done.
//
// The pull is a Pan gesture around the scroll view that only activates when the list is at the
// top and the finger moves down, so scrolling, the tab swipe and long-press drags are untouched.
import React, { useCallback, useRef, useState } from 'react';
import { StyleSheet, View, Text, ViewStyle, StyleProp } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing, SharedValue, cancelAnimation, interpolate, runOnJS, useAnimatedProps, useAnimatedReaction,
  useAnimatedRef, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, withRepeat, withSequence,
  withSpring, withTiming, Extrapolation,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../contexts/ThemeContext';
import { logError } from '../utils/logError';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const THRESHOLD = 66;    // pull (px) that arms a refresh
const HOLD = 62;         // where the list rests while it reloads
const MAX_PULL = 130;    // rubber band limit
const START_SLOP = 6;    // px of downward travel before the pull takes over
const HOLD_MS = 250;     // a pull gets going within this; a finger that rests longer is a long-press drag
const MIN_SPIN_MS = 420; // long enough to read as "reloaded", short enough to never feel slow
const DONE_MS = 420;     // the check stays this long before the list springs back

const PUCK = 42;
const R = 15;
const CIRC = 2 * Math.PI * R;

// Phases, shared with the UI thread
const IDLE = 0, PULLING = 1, ARMED = 2, REFRESHING = 3, DONE = 4;
type Phase = 0 | 1 | 2 | 3 | 4;

const rubber = (d: number) => {
  'worklet';
  return d <= 0 ? 0 : MAX_PULL * (1 - Math.exp(-d / 136));
};

/**
 * Wraps a scroll view. `scrollY` must be that scroll view's offset (see useRefreshScroll or
 * RefreshScrollView). The child is moved down by the pull; the indicator sits in the gap.
 */
export function PullToRefresh({ onRefresh, scrollY, enabled = true, style, children }: {
  onRefresh: () => void | Promise<unknown>;
  scrollY: SharedValue<number>;
  enabled?: boolean;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const pull = useSharedValue(0);
  const phase = useSharedValue<number>(IDLE);
  const start = useSharedValue({ x: 0, y: 0, t: 0 });
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  const tick = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
  }, []);

  const finish = useCallback(() => {
    phase.value = DONE;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setTimeout(() => {
      pull.value = withTiming(0, { duration: 260, easing: Easing.out(Easing.cubic) }, () => {
        phase.value = IDLE;
      });
    }, DONE_MS);
  }, [phase, pull]);

  const runRefresh = useCallback(() => {
    const began = Date.now();
    // Let the release animation get going before the (synchronous) reload runs
    requestAnimationFrame(async () => {
      try {
        await onRefreshRef.current();
      } catch (e) {
        logError('pullToRefresh', e);
      }
      setTimeout(finish, Math.max(0, MIN_SPIN_MS - (Date.now() - began)));
    });
  }, [finish]);

  const gesture = Gesture.Pan()
    .enabled(enabled)
    .manualActivation(true)
    .onTouchesDown(e => {
      const t = e.allTouches[0];
      if (t) start.value = { x: t.absoluteX, y: t.absoluteY, t: Date.now() };
    })
    .onTouchesMove((e, manager) => {
      const t = e.allTouches[0];
      if (!t || e.numberOfTouches > 1 || phase.value >= REFRESHING) { manager.fail(); return; }
      const dx = t.absoluteX - start.value.x;
      const dy = t.absoluteY - start.value.y;
      // Sideways is a tab swipe, upwards is a scroll, a hold first is a drag: not ours
      if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy)) { manager.fail(); return; }
      if (dy < -START_SLOP) { manager.fail(); return; }
      if (Date.now() - start.value.t > HOLD_MS) { manager.fail(); return; }
      if (dy > START_SLOP) {
        if (scrollY.value <= 0.5) manager.activate();
        else manager.fail();
      }
    })
    .onStart(() => {
      phase.value = PULLING;
    })
    .onUpdate(e => {
      pull.value = rubber(e.translationY - START_SLOP);
      const armed = pull.value >= THRESHOLD;
      if (armed !== (phase.value === ARMED)) {
        phase.value = armed ? ARMED : PULLING;
        if (armed) runOnJS(tick)();
      }
    })
    .onEnd(() => {
      if (phase.value === ARMED) {
        phase.value = REFRESHING;
        pull.value = withSpring(HOLD, { damping: 16, stiffness: 180, mass: 0.6 });
        runOnJS(runRefresh)();
      }
    })
    .onFinalize(() => {
      if (phase.value === PULLING || phase.value === ARMED) {
        phase.value = IDLE;
        pull.value = withSpring(0, { damping: 18, stiffness: 200, mass: 0.6 });
      }
    });

  const contentStyle = useAnimatedStyle(() => ({ transform: [{ translateY: pull.value }] }));

  return (
    <GestureDetector gesture={gesture}>
      <View style={[styles.wrap, style]}>
        <RefreshIndicator pull={pull} phase={phase} />
        <Animated.View style={[styles.content, contentStyle]}>{children}</Animated.View>
      </View>
    </GestureDetector>
  );
}

const LABEL: Record<Phase, string> = {
  0: 'Pull to refresh', 1: 'Pull to refresh', 2: 'Release to refresh', 3: 'Refreshing', 4: 'Up to date',
};

function RefreshIndicator({ pull, phase }: { pull: SharedValue<number>; phase: SharedValue<number> }) {
  const { C, isDark } = useTheme();
  const [label, setLabel] = useState<Phase>(IDLE);
  const spin = useSharedValue(0);
  const pop = useSharedValue(1);

  // The label (JS) and the spin / pop (UI) follow the phase
  useAnimatedReaction(() => phase.value, (cur, prev) => {
    if (cur === prev) return;
    runOnJS(setLabel)(cur as Phase);
    if (cur === REFRESHING) {
      spin.value = 0;
      spin.value = withRepeat(withTiming(1, { duration: 720, easing: Easing.linear }), -1, false);
    } else {
      cancelAnimation(spin);
    }
    if (cur === ARMED || cur === DONE) {
      pop.value = withSequence(withTiming(1.16, { duration: 110 }), withSpring(1, { damping: 7, stiffness: 220 }));
    }
  });

  const progress = useAnimatedStyle(() => {
    const p = pull.value;
    return {
      height: p,
      opacity: interpolate(p, [0, 18, 34], [0, 0, 1], Extrapolation.CLAMP),
    };
  });

  const puck = useAnimatedStyle(() => {
    const p = Math.min(1, pull.value / THRESHOLD);
    const refreshing = phase.value === REFRESHING;
    return {
      transform: [
        { scale: interpolate(p, [0, 1], [0.6, 1]) * pop.value },
        { rotate: `${refreshing ? spin.value * 360 : p * 220}deg` },
      ],
    };
  });

  const arc = useAnimatedProps(() => {
    const p = Math.min(1, pull.value / THRESHOLD);
    // Spinning while it reloads: a 30% arc. Otherwise the ring fills as you pull
    const filled = phase.value === REFRESHING ? 0.3 : phase.value === DONE ? 1 : p;
    return { strokeDashoffset: CIRC * (1 - filled) };
  });

  // The icon counter-rotates so it stays upright while the ring turns
  const iconStyle = useAnimatedStyle(() => {
    const p = Math.min(1, pull.value / THRESHOLD);
    const refreshing = phase.value === REFRESHING;
    return { transform: [{ rotate: `${-(refreshing ? spin.value * 360 : p * 220)}deg` }] };
  });
  const barbell = useAnimatedStyle(() => ({ opacity: phase.value === DONE ? 0 : 1 }));
  const check = useAnimatedStyle(() => ({ opacity: phase.value === DONE ? 1 : 0 }));

  const done = label === DONE;
  const ring = done ? C.green : C.accent;

  return (
    <Animated.View pointerEvents="none" style={[styles.indicator, progress]}>
      <View style={styles.row}>
        <Animated.View style={[styles.puck, {
          backgroundColor: C.card, borderColor: done ? C.green + '66' : C.border,
          shadowColor: ring, shadowOpacity: isDark ? 0.5 : 0.28,
        }, puck]}>
          <Svg width={PUCK} height={PUCK} style={StyleSheet.absoluteFill}>
            <Circle cx={PUCK / 2} cy={PUCK / 2} r={R} stroke={ring + '26'} strokeWidth={3} fill="none" />
            <AnimatedCircle cx={PUCK / 2} cy={PUCK / 2} r={R} stroke={ring} strokeWidth={3} fill="none"
              strokeDasharray={`${CIRC}`} strokeLinecap="round" animatedProps={arc}
              transform={`rotate(-90 ${PUCK / 2} ${PUCK / 2})`} />
          </Svg>
          <Animated.View style={iconStyle}>
            <Animated.View style={[styles.icon, barbell]}>
              <Ionicons name="barbell" size={16} color={C.accent} />
            </Animated.View>
            <Animated.View style={[styles.icon, StyleSheet.absoluteFill, check]}>
              <Ionicons name="checkmark" size={19} color={C.green} />
            </Animated.View>
          </Animated.View>
        </Animated.View>
        <Text style={[styles.label, { color: done ? C.green : label === ARMED ? C.accent : C.muted }]}>{LABEL[label]}</Text>
      </View>
    </Animated.View>
  );
}

/** A scroll offset to hand to PullToRefresh, plus the handler and ref for the scroll view. */
export function useRefreshScroll() {
  const scrollY = useSharedValue(0);
  const ref = useAnimatedRef<Animated.ScrollView>();
  const onScroll = useAnimatedScrollHandler({ onScroll: e => { scrollY.value = e.contentOffset.y; } });
  return { scrollY, ref, onScroll };
}

type ScrollProps = React.ComponentProps<typeof Animated.ScrollView>;

/** A ScrollView with pull-to-refresh, for screens that don't need anything more. */
export function RefreshScrollView({ onRefresh, wrapperStyle, children, ...props }: ScrollProps & {
  onRefresh: () => void | Promise<unknown>;
  wrapperStyle?: StyleProp<ViewStyle>;
}) {
  const { scrollY, ref, onScroll } = useRefreshScroll();
  return (
    <PullToRefresh onRefresh={onRefresh} scrollY={scrollY} style={wrapperStyle}>
      <Animated.ScrollView ref={ref} onScroll={onScroll} scrollEventThrottle={16} overScrollMode="never" {...props}>
        {children}
      </Animated.ScrollView>
    </PullToRefresh>
  );
}

const styles = StyleSheet.create({
  wrap:      { flex: 1, overflow: 'hidden' },
  content:   { flex: 1 },
  indicator: { position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center' },
  row:       { flexDirection: 'row', alignItems: 'center', gap: 10 },
  puck: {
    width: PUCK, height: PUCK, borderRadius: PUCK / 2, borderWidth: 1, alignItems: 'center', justifyContent: 'center',
    shadowOffset: { width: 0, height: 4 }, shadowRadius: 10, elevation: 6,
  },
  icon:  { width: PUCK, height: PUCK, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 12, fontWeight: '800', letterSpacing: 0.3, minWidth: 108 },
});
