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
} from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { C } from '../constants/theme';

const { width: SW } = Dimensions.get('window');
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export function Card({
  children,
  accent = C.accent,
  style,
}: {
  children: React.ReactNode;
  accent?: string;
  style?: object;
}) {
  return (
    <View style={[styles.card, { borderColor: C.border }, style]}>
      <View style={[styles.cardAccentBar, { backgroundColor: accent }]} />
      {children}
    </View>
  );
}

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
  return (
    <View style={[styles.statCard, { borderColor: C.border }]}>
      <View style={[styles.statPill, { backgroundColor: color + '33' }]}>
        <Text style={styles.statIcon}>{icon}</Text>
      </View>
      <Text style={styles.statTitle}>{title}</Text>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statSub}>{sub}</Text>
    </View>
  );
}

export function ProgressBar({
  value,
  color = C.accent,
  height = 8,
}: {
  value: number;
  color?: string;
  height?: number;
}) {
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

export function Ring({
  value,
  size = 90,
  color = C.accent,
  label,
}: {
  value: number;
  size?: number;
  color?: string;
  label?: string;
}) {
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
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size}>
        <G rotation="-90" origin={`${size / 2},${size / 2}`}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={C.border}
            strokeWidth={8}
            fill="none"
          />
          <AnimatedCircle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={color}
            strokeWidth={8}
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

export function Btn({
  label,
  onPress,
  color = C.accent,
  textColor = '#FFF',
  outline = false,
  small = false,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  color?: string;
  textColor?: string;
  outline?: boolean;
  small?: boolean;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.75}
      style={[
        styles.btn,
        small && styles.btnSmall,
        outline
          ? { backgroundColor: 'transparent', borderWidth: 1, borderColor: color }
          : { backgroundColor: disabled ? C.muted : color },
      ]}
    >
      <Text style={[styles.btnText, small && { fontSize: 12 }, { color: outline ? color : textColor }]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export function Toggle({
  value,
  onToggle,
}: {
  value: boolean;
  onToggle: () => void;
}) {
  const anim = useRef(new Animated.Value(value ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(anim, {
      toValue: value ? 1 : 0,
      useNativeDriver: false,
    }).start();
  }, [value, anim]);

  return (
    <TouchableOpacity onPress={onToggle} activeOpacity={0.8}>
      <Animated.View
        style={[
          styles.toggleTrack,
          {
            backgroundColor: anim.interpolate({
              inputRange: [0, 1],
              outputRange: [C.muted, C.green],
            }),
          },
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
          ]}
        />
      </Animated.View>
    </TouchableOpacity>
  );
}

export function MuscleTag({ name }: { name: string }) {
  const color = C.mg[name] || C.accent;
  const dark = C.mgDark[name] || C.accentDim;

  return (
    <View style={[styles.muscleTag, { backgroundColor: dark }]}>
      <Text style={[styles.muscleTagText, { color }]}>{name}</Text>
    </View>
  );
}

export function SectionHeader({ title }: { title: string }) {
  return <Text style={styles.sectionHeader}>{title}</Text>;
}

export function EmptyState({
  icon,
  message,
  sub,
}: {
  icon: string;
  message: string;
  sub?: string;
}) {
  return (
    <View style={styles.emptyState}>
      <Text style={{ fontSize: 48, marginBottom: 12 }}>{icon}</Text>
      <Text style={styles.emptyMsg}>{message}</Text>
      {sub && <Text style={styles.emptySub}>{sub}</Text>}
    </View>
  );
}

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

export function SelectBtn({
  label,
  value,
  onPress,
  color = C.accent,
}: {
  label: string;
  value: string;
  onPress: () => void;
  color?: string;
}) {
  return (
    <TouchableOpacity style={[styles.selectBtn, { borderColor: C.border }]} onPress={onPress}>
      <View style={{ flex: 1 }}>
        <Text style={styles.selectBtnLabel}>{label}</Text>
        <Text style={[styles.selectBtnValue, { color }]}>{value}</Text>
      </View>
      <Text style={{ color: C.muted, fontSize: 18 }}>›</Text>
    </TouchableOpacity>
  );
}

export function Loading() {
  return (
    <View style={styles.emptyState}>
      <ActivityIndicator size="large" color={C.accent} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: C.card,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 12,
    overflow: 'hidden',
  },
  cardAccentBar: {
    height: 4,
  },
  statCard: {
    flex: 1,
    backgroundColor: C.card,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    minWidth: (SW - 48) / 2,
  },
  statPill: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  statIcon: {
    fontSize: 22,
  },
  statTitle: {
    fontSize: 11,
    color: C.textDim,
    marginBottom: 2,
  },
  statValue: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 2,
  },
  statSub: {
    fontSize: 11,
    color: C.muted,
  },
  barTrack: {
    backgroundColor: '#0A0E1A',
    overflow: 'hidden',
    width: '100%',
  },
  barFill: {
    backgroundColor: C.accent,
  },
  ringCenter: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btn: {
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  btnSmall: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  btnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFF',
  },
  toggleTrack: {
    width: 48,
    height: 28,
    borderRadius: 14,
    padding: 2,
    justifyContent: 'center',
  },
  toggleThumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FFF',
  },
  muscleTag: {
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginRight: 6,
    marginBottom: 4,
  },
  muscleTagText: {
    fontSize: 11,
    fontWeight: '600',
  },
  sectionHeader: {
    fontSize: 16,
    fontWeight: '700',
    color: C.text,
    marginBottom: 10,
    marginTop: 4,
  },
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
  modalOverlay: {
    flex: 1,
    backgroundColor: '#000000AA',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: C.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 36,
  },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: C.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 16,
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
    color: C.text,
  },
  selectBtn: {
    backgroundColor: C.card,
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  selectBtnLabel: {
    fontSize: 11,
    color: C.muted,
    marginBottom: 2,
  },
  selectBtnValue: {
    fontSize: 14,
    fontWeight: '600',
  },
});