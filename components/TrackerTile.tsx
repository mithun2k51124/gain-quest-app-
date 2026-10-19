// components/TrackerTile.tsx — one Tracker section as a compact card: an icon with a progress ring,
// the title, a one-line summary and a quick action. Tap it to open the full section below.
// Cards slide in one after another when the page opens; the ring fills and the chevron turns.
import React, { useEffect } from 'react';
import { View, Text, Pressable, TouchableOpacity, StyleSheet } from 'react-native';
import Animated, {
  Easing, FadeIn, FadeInDown, useAnimatedProps, useAnimatedStyle, useSharedValue, withSpring, withTiming,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../contexts/ThemeContext';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const ICON = 44;
const R = 19;
const CIRC = 2 * Math.PI * R;

export interface TileAction { label: string; icon: keyof typeof Ionicons.glyphMap; onPress: () => void }

export function TrackerTile({
  title, icon, color, summary, progress, action, open, onToggle, index = 0, lifted = false, children,
}: {
  title: string;
  icon: React.ReactNode;
  color: string;
  summary: string;
  progress?: number;          // 0–1, drawn as a ring round the icon
  action?: TileAction;
  open: boolean;
  onToggle: () => void;
  index?: number;             // for the staggered slide-in
  lifted?: boolean;           // the copy shown while dragging: no entrance animation
  children: React.ReactNode;
}) {
  const { C } = useTheme();
  const styles = makeStyles(C);
  const ring = useSharedValue(0);
  const turn = useSharedValue(open ? 1 : 0);
  const press = useSharedValue(1);

  useEffect(() => {
    if (progress !== undefined) ring.value = withTiming(Math.max(0, Math.min(1, progress)), { duration: 800, easing: Easing.out(Easing.cubic) });
  }, [progress, ring]);
  useEffect(() => {
    turn.value = withSpring(open ? 1 : 0, { damping: 14, stiffness: 180 });
  }, [open, turn]);

  const ringProps = useAnimatedProps(() => ({ strokeDashoffset: CIRC * (1 - ring.value) }));
  const chevron = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value * 180}deg` }] }));
  const headStyle = useAnimatedStyle(() => ({ transform: [{ scale: press.value }] }));

  return (
    <Animated.View entering={lifted ? undefined : FadeInDown.delay(index * 70).duration(380)}
      style={[styles.card, open && { borderColor: color + '66' }]}>
      <Pressable
        onPress={() => { Haptics.selectionAsync().catch(() => {}); onToggle(); }}
        onPressIn={() => { press.value = withSpring(0.98, { damping: 15, stiffness: 400 }); }}
        onPressOut={() => { press.value = withSpring(1, { damping: 10, stiffness: 260 }); }}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${title}, ${summary}`}
      >
        <Animated.View style={[styles.head, headStyle]}>
          <View style={styles.iconWrap}>
            {progress !== undefined && (
              <Svg width={ICON} height={ICON} style={StyleSheet.absoluteFill}>
                <Circle cx={ICON / 2} cy={ICON / 2} r={R} stroke={color + '26'} strokeWidth={3} fill="none" />
                <AnimatedCircle cx={ICON / 2} cy={ICON / 2} r={R} stroke={color} strokeWidth={3} fill="none"
                  strokeDasharray={`${CIRC}`} strokeLinecap="round" animatedProps={ringProps}
                  transform={`rotate(-90 ${ICON / 2} ${ICON / 2})`} />
              </Svg>
            )}
            <View style={[styles.iconInner, { backgroundColor: color + '1F' }]}>{icon}</View>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.title} numberOfLines={1}>{title}</Text>
            <Text style={styles.summary} numberOfLines={1}>{summary}</Text>
          </View>
          {action && (
            <TouchableOpacity onPress={action.onPress} activeOpacity={0.85} hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
              style={[styles.action, { backgroundColor: color }]} accessibilityLabel={action.label}>
              <Ionicons name={action.icon} size={14} color="#fff" />
              <Text style={styles.actionTxt}>{action.label}</Text>
            </TouchableOpacity>
          )}
          <Animated.View style={chevron}>
            <Ionicons name="chevron-down" size={18} color={open ? color : C.muted} />
          </Animated.View>
        </Animated.View>
      </Pressable>
      {open && (
        <Animated.View entering={FadeIn.duration(240)} style={styles.body}>
          {children}
        </Animated.View>
      )}
    </Animated.View>
  );
}

function makeStyles(C: any) {
  return StyleSheet.create({
    card:      { backgroundColor: C.card, borderRadius: 20, borderWidth: 1, borderColor: C.border, marginBottom: 8, overflow: 'hidden' },
    head:      { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 11 },
    iconWrap:  { width: ICON, height: ICON, alignItems: 'center', justifyContent: 'center' },
    iconInner: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
    title:     { fontSize: 15, fontWeight: '800', color: C.text },
    summary:   { fontSize: 12, fontWeight: '600', color: C.muted, marginTop: 1 },
    action:    { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 12 },
    actionTxt: { fontSize: 12, fontWeight: '800', color: '#fff' },
    body:      { borderTopWidth: 1, borderTopColor: C.border },
  });
}
