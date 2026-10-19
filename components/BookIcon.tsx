// components/BookIcon.tsx — an open book whose pages keep turning: a page lifts off the right side,
// swings over the spine (darkening as it turns edge-on) and settles on the left, with the next page
// close behind, then a short pause before the next riffle. All on the UI thread.
import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Path, Line } from 'react-native-svg';
import Animated, { Easing, SharedValue, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

const CYCLE = 2600;
// Each page's turn, as a slice of the cycle
const PAGES: [number, number][] = [[0, 0.36], [0.2, 0.56]];

const PAGE_L = 'M12 7.2C9.6 5.9 6.3 5.6 3 6.2V18c3.3-.6 6.6-.3 9 1z';
const PAGE_R = 'M12 7.2c2.4-1.3 5.7-1.6 9-1V18c-3.3-.6-6.6-.3-9 1z';

function TurningPage({ t, from, to, size, color }: { t: SharedValue<number>; from: number; to: number; size: number; color: string }) {
  const u = size / 24;
  const style = useAnimatedStyle(() => {
    const p = Math.min(1, Math.max(0, (t.value - from) / (to - from)));
    const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    const turning = p > 0 && p < 1;
    return {
      opacity: turning ? 1 : 0,
      // The page curls up a touch as it lifts
      transform: [{ perspective: size * 9 }, { rotateY: `${-e * 180}deg` }, { scaleY: 1 + Math.sin(e * Math.PI) * 0.07 }],
    };
  });
  const shade = useAnimatedStyle(() => {
    const p = Math.min(1, Math.max(0, (t.value - from) / (to - from)));
    return { opacity: Math.sin(p * Math.PI) * 0.35 };
  });
  return (
    <Animated.View style={[styles.page, {
      left: 12 * u, top: 6.4 * u, width: 9 * u, height: 12 * u,
      borderColor: color, backgroundColor: color + '40', borderRadius: 1.6 * u, borderWidth: Math.max(1, 1.2 * u),
    }, style]}>
      {[2.6, 5.1, 7.6].map(y => (
        <View key={y} style={{ position: 'absolute', left: 1.8 * u, right: 1.8 * u, top: y * u, height: Math.max(1, 0.9 * u), borderRadius: u, backgroundColor: color, opacity: 0.55 }} />
      ))}
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#000' }, shade]} />
    </Animated.View>
  );
}

export function BookIcon({ size = 24, color }: { size?: number; color: string }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withRepeat(withTiming(1, { duration: CYCLE, easing: Easing.linear }), -1, false);
  }, [t]);

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path d={PAGE_L} fill={color} fillOpacity={0.2} stroke={color} strokeWidth={1.4} strokeLinejoin="round" />
        <Path d={PAGE_R} fill={color} fillOpacity={0.2} stroke={color} strokeWidth={1.4} strokeLinejoin="round" />
        {/* Lines of text on each page */}
        {[9.6, 12.1, 14.6].map(y => (
          <React.Fragment key={y}>
            <Line x1={5.2} y1={y - 0.3} x2={10} y2={y + 0.4} stroke={color} strokeWidth={1} strokeLinecap="round" opacity={0.6} />
            <Line x1={14} y1={y + 0.4} x2={18.8} y2={y - 0.3} stroke={color} strokeWidth={1} strokeLinecap="round" opacity={0.6} />
          </React.Fragment>
        ))}
        <Line x1={12} y1={7.4} x2={12} y2={18.8} stroke={color} strokeWidth={1.2} />
      </Svg>
      {PAGES.map(([from, to]) => <TurningPage key={from} t={t} from={from} to={to} size={size} color={color} />)}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { position: 'absolute', overflow: 'hidden', transformOrigin: 'left' },
});
