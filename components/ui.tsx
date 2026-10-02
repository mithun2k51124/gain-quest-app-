import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  ScrollView,
  ActivityIndicator,
  Dimensions,
  Modal,
  Platform,
} from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';

const { width: SW } = Dimensions.get('window');
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// ─────────────────────────────────────────────────────────────────────────────
// Neumorphic shadow helper – returns platform-aware shadow styles
// RN only supports ONE shadowColor per element, so we stack two Views:
//   outer = dark shadow, inner wrapper = white shadow
// ─────────────────────────────────────────────────────────────────────────────
function neuShadow(C: any, intensity: 'raised' | 'flat' = 'raised') {
  const isDark = C.bg === '#000000';
  if (intensity === 'flat') {
    return {
      shadowColor: C.shadowDark || '#000000',
      shadowOffset: { width: isDark ? 0 : 3, height: isDark ? 1 : 3 },
      shadowOpacity: isDark ? 0.4 : 0.8,
      shadowRadius: isDark ? 3 : 6,
      elevation: isDark ? 1 : 3,
    };
  }
  return {
    shadowColor: C.shadowDark || '#000000',
    shadowOffset: { width: isDark ? 0 : 6, height: isDark ? 2 : 6 },
    shadowOpacity: isDark ? 0.6 : 0.9,
    shadowRadius: isDark ? 6 : 12,
    elevation: isDark ? 2 : 8,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Card  –  raised neumorphic panel
// ─────────────────────────────────────────────────────────────────────────────
export function Card({
  children,
  accent,
  style,
}: {
  children: React.ReactNode;
  accent?: string;
  style?: object;
}) {
  const { C } = useTheme();
  const styles = makeStyles(C);
  accent = accent || C.accent;
  return (
    <View style={[styles.cardOuter, neuShadow(C, 'raised'), style]}>
      {/* top-left white highlight */}
      <View style={styles.cardHighlight} />
      <View style={styles.cardInner}>{children}</View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// StatCard
// ─────────────────────────────────────────────────────────────────────────────
export function StatCard({
  icon,
  title,
  value,
  sub,
  color,
}: {
  icon: string;
  title: string;
  value: string;
  sub: string;
  color: string;
}) {
  const { C } = useTheme();
  const styles = makeStyles(C);
  return (
    <View style={[styles.statCard, neuShadow(C, 'raised')]}>
      <View style={styles.statCardHighlight} />
      <View style={[styles.statPill, { backgroundColor: color + '22' }, neuShadow(C, 'flat')]}>
        <Text style={styles.statIcon}>{icon}</Text>
      </View>
      <Text style={styles.statTitle}>{title}</Text>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statSub}>{sub}</Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ProgressBar  –  inset track + filled bar
// ─────────────────────────────────────────────────────────────────────────────
export function ProgressBar({
  value,
  color,
  height = 8,
}: {
  value: number;
  color?: string;
  height?: number;
}) {
  const { C } = useTheme();
  const styles = makeStyles(C);
  color = color || C.accent;
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: Math.min(Math.max(value, 0), 1),
      duration: 600,
      useNativeDriver: false,
    }).start();
  }, [value, anim]);

  return (
    <View style={[styles.barTrack, { height, borderRadius: height / 2 }]}>
      <Animated.View
        style={[
          styles.barFill,
          {
            height,
            borderRadius: height / 2,
            backgroundColor: color,
            width: anim.interpolate({
              inputRange: [0, 1],
              outputRange: ['0%', '100%'],
            }),
          },
        ]}
      />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Ring  –  circular progress (SVG)
// ─────────────────────────────────────────────────────────────────────────────
export function Ring({
  value,
  size = 90,
  color,
  label,
}: {
  value: number;
  size?: number;
  color?: string;
  label?: string;
}) {
  const { C } = useTheme();
  const styles = makeStyles(C);
  color = color || C.accent;
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: Math.min(Math.max(value, 0), 1),
      duration: 700,
      useNativeDriver: false,
    }).start();
  }, [value, anim]);

  const r = (size - 14) / 2;
  const circ = 2 * Math.PI * r;

  return (
    <View
      style={[
        { width: size, height: size, alignItems: 'center', justifyContent: 'center', borderRadius: size / 2 },
        neuShadow(C, 'raised'),
        { backgroundColor: C.bg },
      ]}
    >
      <Svg width={size} height={size}>
        <G rotation="-90" origin={`${size / 2},${size / 2}`}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={C.shadowDark}
            strokeWidth={7}
            fill="none"
          />
          <AnimatedCircle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={color}
            strokeWidth={7}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={anim.interpolate({
              inputRange: [0, 1],
              outputRange: [circ, 0],
            })}
          />
        </G>
      </Svg>

      <View pointerEvents="none" style={styles.ringCenter}>
        <Text style={{ color, fontSize: size * 0.16, fontWeight: '700' }}>
          {Math.round(Math.min(Math.max(value, 0), 1) * 100)}%
        </Text>
        {label && <Text style={{ color: C.muted, fontSize: 9 }}>{label}</Text>}
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Btn  –  neumorphic button (raised or inset on press)
// ─────────────────────────────────────────────────────────────────────────────
export function Btn({
  label,
  onPress,
  color,
  textColor = '#FFF',
  outline = false,
  small = false,
  disabled = false,
  icon,
}: {
  label: string;
  onPress: () => void;
  color?: string;
  textColor?: string;
  outline?: boolean;
  small?: boolean;
  disabled?: boolean;
  icon?: string;
}) {
  const { C } = useTheme();
  const styles = makeStyles(C);
  const scale = useRef(new Animated.Value(1)).current;

  const onPressIn = () => {
    Animated.spring(scale, { toValue: 0.96, useNativeDriver: true, speed: 30 }).start();
  };
  const onPressOut = () => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 20 }).start();
  };

  const bgColor = outline ? C.bg : disabled ? C.shadowDark : color;

  return (
    <TouchableOpacity
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      disabled={disabled}
      activeOpacity={1}
    >
      <Animated.View
        style={[
          styles.btn,
          small && styles.btnSmall,
          { backgroundColor: bgColor, transform: [{ scale }], flexDirection: icon ? 'row' : 'column', alignItems: 'center', justifyContent: 'center' },
          neuShadow(C, 'raised'),
          outline && { borderWidth: 1.5, borderColor: color },
        ]}
      >
        {icon && <Ionicons name={icon as any} size={small ? 16 : 20} color={outline ? color : textColor} style={{ marginRight: 8 }} />}
        <Text style={[styles.btnText, small && { fontSize: 12 }, { color: outline ? color : textColor }]}>
          {label}
        </Text>
      </Animated.View>
    </TouchableOpacity>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Toggle  –  neumorphic pill switch
// ─────────────────────────────────────────────────────────────────────────────
export function Toggle({
  value,
  onToggle,
}: {
  value: boolean;
  onToggle: () => void;
}) {
  const { C } = useTheme();
  const styles = makeStyles(C);
  const anim = useRef(new Animated.Value(value ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(anim, {
      toValue: value ? 1 : 0,
      useNativeDriver: false,
      speed: 20,
    }).start();
  }, [value, anim]);

  return (
    <TouchableOpacity onPress={onToggle} activeOpacity={0.85}>
      <Animated.View
        style={[
          styles.toggleTrack,
          {
            backgroundColor: anim.interpolate({
              inputRange: [0, 1],
              outputRange: [C.shadowDark, C.accent],
            }),
          },
          neuShadow(C, 'flat'),
        ]}
      >
        <Animated.View
          style={[
            styles.toggleThumb,
            {
              transform: [
                {
                  translateX: anim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [2, 22],
                  }),
                },
              ],
            },
            neuShadow(C, 'flat'),
          ]}
        />
      </Animated.View>
    </TouchableOpacity>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MuscleTag
// ─────────────────────────────────────────────────────────────────────────────
export function MuscleTag({ name }: { name: string }) {
  const { C } = useTheme();
  const styles = makeStyles(C);
  const color = C.mg[name] || C.accent;
  const bg    = C.mgDark[name] || C.accentDim;

  return (
    <View style={[styles.muscleTag, { backgroundColor: bg }, neuShadow(C, 'flat')]}>
      <Text style={[styles.muscleTagText, { color }]}>{name}</Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SectionHeader
// ─────────────────────────────────────────────────────────────────────────────
export function SectionHeader({ title, icon }: { title: string; icon?: string }) {
  const { C } = useTheme();
  const styles = makeStyles(C);
  if (icon) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10, marginTop: 6 }}>
        <Ionicons name={icon as any} size={16} color={C.muted} style={{ marginRight: 6 }} />
        <Text style={[styles.sectionHeader, { marginBottom: 0, marginTop: 0 }]}>{title}</Text>
      </View>
    );
  }
  return <Text style={styles.sectionHeader}>{title}</Text>;
}

// ─────────────────────────────────────────────────────────────────────────────
// EmptyState
// ─────────────────────────────────────────────────────────────────────────────
export function EmptyState({
  icon,
  message,
  sub,
}: {
  icon: string;
  message: string;
  sub?: string;
}) {
  const { C } = useTheme();
  const styles = makeStyles(C);
  return (
    <View style={styles.emptyState}>
      <Ionicons name={icon as any} size={48} color={C.muted} style={{ marginBottom: 12 }} />
      <Text style={styles.emptyMsg}>{message}</Text>
      {sub && <Text style={styles.emptySub}>{sub}</Text>}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PickerModal  –  bottom-sheet style
// ─────────────────────────────────────────────────────────────────────────────
export function PickerModal({
  visible,
  title,
  options,
  onSelect,
  onClose,
}: {
  visible: boolean;
  title: string;
  options: { label: string; value: string }[];
  onSelect: (v: string) => void;
  onClose: () => void;
}) {
  const { C } = useTheme();
  const styles = makeStyles(C);
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.modalOverlay} onPress={onClose} activeOpacity={1}>
        <TouchableOpacity
          activeOpacity={1}
          style={styles.modalSheet}
          onPress={event => event.stopPropagation()}
        >
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>{title}</Text>

          <ScrollView style={{ maxHeight: 400 }}>
            {options.map(opt => (
              <TouchableOpacity
                key={opt.value}
                style={styles.modalOption}
                onPress={() => {
                  onClose();
                  requestAnimationFrame(() => onSelect(opt.value));
                }}
              >
                <Text style={styles.modalOptionText}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SelectBtn
// ─────────────────────────────────────────────────────────────────────────────
export function SelectBtn({
  label,
  value,
  onPress,
  color,
  icon,
}: {
  label: string;
  value: string;
  onPress: () => void;
  color?: string;
  icon?: string;
}) {
  const { C } = useTheme();
  const styles = makeStyles(C);
  return (
    <TouchableOpacity
      style={[styles.selectBtn, neuShadow(C, 'raised')]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {icon && <Ionicons name={icon as any} size={16} color={C.textSub} style={{ marginRight: 6 }} />}
          <Text style={styles.selectBtnLabel}>{label}</Text>
        </View>
        <Text style={[styles.selectBtnValue, { color }]}>{value}</Text>
      </View>
      <View style={[styles.selectChevron, neuShadow(C, 'flat')]}>
        <Ionicons name="chevron-forward" size={16} color={C.accent} />
      </View>
    </TouchableOpacity>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Loading
// ─────────────────────────────────────────────────────────────────────────────
export function Loading() {
  const { C } = useTheme();
  const styles = makeStyles(C);
  return (
    <View style={styles.emptyState}>
      <ActivityIndicator size="large" color={C.accent} />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────
function makeStyles(C: any) { return StyleSheet.create({
  // Card
  cardOuter: {
    backgroundColor: C.card,
    borderRadius: 20,
    marginBottom: 14,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: C.border,
  },
  cardHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: C.bg === '#000000' ? 'transparent' : 'rgba(255, 255, 255, 0.2)',
    zIndex: 1,
  },

  cardInner: {
    // content goes here
  },

  // StatCard
  statCard: {
    flex: 1,
    backgroundColor: C.card,
    borderRadius: 18,
    padding: 14,
    minWidth: (SW - 48) / 2,
    position: 'relative',
    borderWidth: 1,
    borderColor: C.border,
  },
  statCardHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: C.bg === '#000000' ? 'transparent' : '#FFFFFF',
    opacity: C.bg === '#000000' ? 0 : 0.9,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
  },
  statPill: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    backgroundColor: C.bg,
  },
  statIcon: {
    fontSize: 22,
  },
  statTitle: {
    fontSize: 11,
    color: C.textDim,
    marginBottom: 2,
    fontWeight: '500',
  },
  statValue: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 2,
    color: C.text,
  },
  statSub: {
    fontSize: 11,
    color: C.muted,
  },

  // ProgressBar
  barTrack: {
    backgroundColor: C.shadowDark,
    overflow: 'hidden',
    width: '100%',
    borderRadius: 99,
  },
  barFill: {
    backgroundColor: C.accent,
  },

  // Ring
  ringCenter: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Btn
  btn: {
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: 'center',
    backgroundColor: C.accent,
  },
  btnSmall: {
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  btnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFF',
    letterSpacing: 0.3,
  },

  // Toggle
  toggleTrack: {
    width: 50,
    height: 28,
    borderRadius: 14,
    padding: 2,
    justifyContent: 'center',
    backgroundColor: C.shadowDark,
  },
  toggleThumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
  },

  // MuscleTag
  muscleTag: {
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginRight: 6,
    marginBottom: 4,
  },
  muscleTagText: {
    fontSize: 11,
    fontWeight: '700',
  },

  // SectionHeader
  sectionHeader: {
    fontSize: 14,
    fontWeight: '700',
    color: C.muted,
    marginBottom: 10,
    marginTop: 6,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },

  // EmptyState
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyMsg: {
    fontSize: 16,
    color: C.textSub,
    textAlign: 'center',
    marginBottom: 6,
  },
  emptySub: {
    fontSize: 13,
    color: C.muted,
    textAlign: 'center',
  },

  // PickerModal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(40,50,70,0.35)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: C.card,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 20,
    paddingBottom: 36,
    shadowColor: '#BFC8D6',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 20,
  },
  modalHandle: {
    width: 40,
    height: 5,
    backgroundColor: C.shadowDark,
    borderRadius: 3,
    alignSelf: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: C.text,
    marginBottom: 12,
  },
  modalOption: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  modalOptionText: {
    fontSize: 14,
    color: C.textSub,
  },

  // SelectBtn
  selectBtn: {
    backgroundColor: C.card,
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  selectBtnLabel: {
    fontSize: 11,
    color: C.muted,
    marginBottom: 2,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  selectBtnValue: {
    fontSize: 15,
    fontWeight: '700',
    color: C.text,
  },
  selectChevron: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
}); }