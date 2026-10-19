// components/FireIcon.tsx — a small fire that keeps burning: an outer and an inner flame flicker
// at different speeds, a warm glow pulses behind them and sparks drift up. All on the UI thread.
import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Path, Defs, LinearGradient, Stop } from 'react-native-svg';
import Animated, {
  Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming,
} from 'react-native-reanimated';

const OUTER = 'M12 1.5c1.7 3.4 5.6 5.8 5.6 11.1a5.6 5.6 0 0 1-11.2 0c0-2.7 1.3-4.6 2.7-5.9-.1 1.8.7 3.1 1.8 3.6C10.6 7.4 11 4.3 12 1.5z';
const INNER = 'M12 10.2c1 1.8 2.9 2.9 2.9 5.3a2.9 2.9 0 0 1-5.8 0c0-1.5.8-2.5 1.6-3.1 0 .9.4 1.6 1 1.8-.2-1.5.1-2.9.3-4z';

function Spark({ size, delay, x }: { size: number; delay: number; x: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(delay, withRepeat(withTiming(1, { duration: 1300, easing: Easing.out(Easing.quad) }), -1, false));
  }, [t, delay]);
  const style = useAnimatedStyle(() => ({
    opacity: t.value < 0.1 ? t.value * 8 : 0.8 * (1 - t.value),
    transform: [{ translateY: -t.value * size * 0.75 }, { translateX: Math.sin(t.value * 6) * 2 }, { scale: 1 - t.value * 0.6 }],
  }));
  return <Animated.View style={[styles.spark, { left: size / 2 + x, top: size * 0.3 }, style]} />;
}

export function FireIcon({ size = 24 }: { size?: number }) {
  const outer = useSharedValue(0);
  const inner = useSharedValue(0);
  const glow = useSharedValue(0);

  useEffect(() => {
    const ease = Easing.inOut(Easing.sin);
    outer.value = withRepeat(withSequence(
      withTiming(1, { duration: 260, easing: ease }),
      withTiming(-0.6, { duration: 300, easing: ease }),
      withTiming(0.5, { duration: 220, easing: ease }),
      withTiming(0, { duration: 280, easing: ease }),
    ), -1, false);
    inner.value = withRepeat(withSequence(
      withTiming(1, { duration: 180, easing: ease }),
      withTiming(-0.8, { duration: 210, easing: ease }),
      withTiming(0, { duration: 190, easing: ease }),
    ), -1, false);
    glow.value = withRepeat(withTiming(1, { duration: 900, easing: ease }), -1, true);
  }, [outer, inner, glow]);

  // The flames sway from their base, stretching up and leaning a little
  const outerStyle = useAnimatedStyle(() => ({
    transform: [{ scaleY: 1 + outer.value * 0.07 }, { scaleX: 1 - outer.value * 0.03 }, { rotate: `${outer.value * 3}deg` }],
  }));
  const innerStyle = useAnimatedStyle(() => ({
    transform: [{ scaleY: 1 + inner.value * 0.14 }, { translateY: -inner.value * 0.8 }, { rotate: `${-inner.value * 4}deg` }],
    opacity: 0.85 + inner.value * 0.15,
  }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: 0.25 + glow.value * 0.35, transform: [{ scale: 0.85 + glow.value * 0.25 }] }));

  return (
    <View style={{ width: size, height: size }}>
      <Animated.View style={[styles.glow, { width: size, height: size, borderRadius: size / 2 }, glowStyle]} />
      <Animated.View style={[StyleSheet.absoluteFill, styles.base, outerStyle]}>
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Defs>
            <LinearGradient id="fireOuter" x1="0" y1="1" x2="0" y2="0">
              <Stop offset="0" stopColor="#FF3D00" />
              <Stop offset="0.6" stopColor="#FF6B35" />
              <Stop offset="1" stopColor="#FFA040" />
            </LinearGradient>
          </Defs>
          <Path d={OUTER} fill="url(#fireOuter)" />
        </Svg>
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, styles.base, innerStyle]}>
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Defs>
            <LinearGradient id="fireInner" x1="0" y1="1" x2="0" y2="0">
              <Stop offset="0" stopColor="#FFD54F" />
              <Stop offset="1" stopColor="#FFF3C4" />
            </LinearGradient>
          </Defs>
          <Path d={INNER} fill="url(#fireInner)" />
        </Svg>
      </Animated.View>
      <Spark size={size} delay={0} x={-2} />
      <Spark size={size} delay={650} x={2} />
    </View>
  );
}

const styles = StyleSheet.create({
  base:  { transformOrigin: 'bottom' },
  glow:  { position: 'absolute', backgroundColor: '#FF6B35' },
  spark: { position: 'absolute', width: 3, height: 3, borderRadius: 1.5, backgroundColor: '#FFC046' },
});
