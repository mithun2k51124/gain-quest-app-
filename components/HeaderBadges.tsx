// components/HeaderBadges.tsx — small live badges that sit beside the settings gear:
// the streak (Workouts), a trophy (PRs) and the day's score (Overall). Each one animates in
// whenever its screen comes into focus and keeps a gentle loop going while shown.
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Animated, {
  Easing, useAnimatedProps, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../contexts/ThemeContext';
import { getStreak } from '../db/database';
import { FireIcon } from './FireIcon';
import { FLAME } from './StreakDots';
import { FONT } from '../constants/fonts';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/** Counts a number up from 0 over `duration` ms each time `replay` changes. */
function useCountUp(target: number, replay: number, duration = 800) {
  const [shown, setShown] = useState(target);
  useEffect(() => {
    let frame = 0;
    const start = Date.now();
    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / duration);
      setShown(Math.round(target * (1 - Math.pow(1 - t, 3))));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [target, replay, duration]);
  return shown;
}

/** Bumps a counter every time the screen is focused, to replay entry animations. */
function useFocusReplay() {
  const [n, setN] = useState(0);
  useFocusEffect(useCallback(() => { setN(k => k + 1); }, []));
  return n;
}

function useBoxColors() {
  const { isDark } = useTheme();
  return {
    backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)',
    borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)',
  };
}

/** The current workout streak: a burning flame and a day count that ticks up. Bump `refreshKey` after logging. */
export function StreakBadge({ refreshKey }: { refreshKey?: number }) {
  const { C } = useTheme();
  const replay = useFocusReplay();
  const [streak, setStreak] = useState(0);
  useFocusEffect(useCallback(() => { setStreak(getStreak().current_streak); }, [refreshKey]));
  const shown = useCountUp(streak, replay);

  const enter = useSharedValue(0);
  const heat = useSharedValue(0);
  useEffect(() => {
    enter.value = 0;
    enter.value = withTiming(1, { duration: 380, easing: Easing.out(Easing.cubic) });
  }, [enter, replay]);
  useEffect(() => {
    heat.value = withRepeat(withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [heat]);
  const pillStyle = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [{ translateX: (1 - enter.value) * 10 }],
    borderColor: `rgba(255,107,53,${0.3 + heat.value * 0.35})`,
  }));

  return (
    <Animated.View
      accessibilityLabel={`${streak} day streak`}
      style={[styles.pill, { backgroundColor: FLAME + '1A' }, pillStyle]}
    >
      <FireIcon size={18} />
      <Text style={[styles.pillNum, { color: C.text }]}>{shown}</Text>
      <Text style={[styles.pillUnit, { color: FLAME }]}>day{streak === 1 ? '' : 's'}</Text>
    </Animated.View>
  );
}

function Sparkle({ delay, style }: { delay: number; style: object }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(delay, withRepeat(withSequence(
      withTiming(1, { duration: 450, easing: Easing.out(Easing.quad) }),
      withTiming(0, { duration: 450, easing: Easing.in(Easing.quad) }),
      withTiming(0, { duration: 900 }),
    ), -1, false));
  }, [t, delay]);
  const anim = useAnimatedStyle(() => ({ opacity: t.value, transform: [{ scale: 0.4 + t.value * 0.6 }, { rotate: `${t.value * 90}deg` }] }));
  return (
    <Animated.View pointerEvents="none" style={[styles.sparkle, style, anim]}>
      <Ionicons name="sparkles" size={9} color="#FFD54F" />
    </Animated.View>
  );
}

/** A trophy that sways and glints, with sparkles twinkling around it. A tap makes it hop. */
export function TrophyBadge() {
  const { C } = useTheme();
  const box = useBoxColors();
  const replay = useFocusReplay();
  const sway = useSharedValue(0);
  const hop = useSharedValue(0);
  const shine = useSharedValue(0);

  useEffect(() => {
    sway.value = withRepeat(withTiming(1, { duration: 1300, easing: Easing.inOut(Easing.sin) }), -1, true);
    shine.value = withRepeat(withSequence(
      withTiming(1, { duration: 700, easing: Easing.inOut(Easing.quad) }),
      withTiming(1, { duration: 1600 }),
      withTiming(0, { duration: 0 }),
    ), -1, false);
  }, [sway, shine]);

  const lift = useCallback(() => {
    hop.value = withSequence(
      withTiming(1, { duration: 180, easing: Easing.out(Easing.quad) }),
      withTiming(0, { duration: 260, easing: Easing.in(Easing.quad) }),
    );
  }, [hop]);
  useEffect(() => { lift(); }, [lift, replay]);

  const trophyStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -hop.value * 5 }, { rotate: `${(sway.value - 0.5) * 12}deg` }, { scale: 1 + hop.value * 0.12 }],
  }));
  const shineStyle = useAnimatedStyle(() => ({
    opacity: shine.value > 0 && shine.value < 1 ? 0.55 : 0,
    transform: [{ translateX: -22 + shine.value * 44 }, { rotate: '25deg' }],
  }));

  return (
    <Pressable
      onPress={() => { lift(); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); }}
      hitSlop={10}
      accessibilityLabel="Personal records"
    >
      <View style={[styles.box, box]}>
        <Animated.View style={[styles.fromBottom, trophyStyle]}>
          <Ionicons name="trophy" size={18} color={C.orange} />
        </Animated.View>
        <Animated.View pointerEvents="none" style={[styles.shine, shineStyle]} />
        <Sparkle delay={0} style={{ top: 4, right: 5 }} />
        <Sparkle delay={900} style={{ bottom: 5, left: 4 }} />
      </View>
    </Pressable>
  );
}

const RING = 20;
const RING_R = 8;
const RING_CIRC = 2 * Math.PI * RING_R;

/** Today's score: a ring fills to the percentage while the number counts up to it. */
export function ScoreBadge({ score }: { score: number }) {
  const { C, isDark } = useTheme();
  const replay = useFocusReplay();
  const shown = useCountUp(score, replay, 900);
  const color = score >= 70 ? C.accent : score >= 40 ? '#FBBF24' : '#EF4444';

  const fill = useSharedValue(0);
  const pulse = useSharedValue(0);
  useEffect(() => {
    fill.value = 0;
    fill.value = withTiming(score / 100, { duration: 900, easing: Easing.out(Easing.cubic) });
  }, [fill, score, replay]);
  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 1800, easing: Easing.out(Easing.quad) }), -1, false);
  }, [pulse]);

  const ringProps = useAnimatedProps(() => ({ strokeDashoffset: RING_CIRC * (1 - fill.value) }));
  const pulseStyle = useAnimatedStyle(() => ({ opacity: 0.45 * (1 - pulse.value), transform: [{ scale: 0.8 + pulse.value * 0.7 }] }));

  return (
    <View
      accessibilityLabel={`Today's score ${score} percent`}
      style={[styles.pill, {
        backgroundColor: isDark ? '#111318' : '#F8FAFC',
        borderColor: isDark ? '#1E1E26' : '#E2E8F0',
      }]}
    >
      <View style={{ width: RING, height: RING }}>
        <Animated.View style={[styles.pulse, { backgroundColor: color }, pulseStyle]} />
        <Svg width={RING} height={RING} style={{ transform: [{ rotate: '-90deg' }] }}>
          <Circle cx={RING / 2} cy={RING / 2} r={RING_R} stroke={color + '33'} strokeWidth={3} fill="none" />
          <AnimatedCircle
            cx={RING / 2} cy={RING / 2} r={RING_R} stroke={color} strokeWidth={3} fill="none"
            strokeLinecap="round" strokeDasharray={RING_CIRC} animatedProps={ringProps}
          />
        </Svg>
      </View>
      <Text style={[styles.pillNum, { color }]}>{shown}%</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill:       { flexDirection: 'row', alignItems: 'center', gap: 6, height: 38, paddingHorizontal: 11, borderRadius: 12, borderWidth: 1 },
  pillNum:    { fontFamily: FONT.bold, fontSize: 16 },
  pillUnit:   { fontFamily: FONT.sub, fontSize: 12, marginLeft: -2 },
  box:        { width: 38, height: 38, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  fromBottom: { transformOrigin: 'bottom' },
  shine:      { position: 'absolute', width: 8, height: 56, backgroundColor: '#FFFFFF' },
  sparkle:    { position: 'absolute' },
  pulse:      { position: 'absolute', width: RING, height: RING, borderRadius: RING / 2 },
});
