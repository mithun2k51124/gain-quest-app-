// app/overall.tsx — Overall Activity with Stadium Racetrack Concentric Rings
import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
  Modal,
  Dimensions,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Rect, Path, Circle, G, Defs, LinearGradient, Stop } from 'react-native-svg';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import {
  getTodayLog,
  getGoals,
  getStreak,
  getWeeklyStats,
  getLatestWeight,
  getSetting,
  setSetting,
  DailyLog,
  Goals,
  Streak,
  todayStr,
} from '../db/database';
import { SectionHeader } from '../components/ui';
import { SettingsButton } from '../components/SettingsButton';
import { useTheme } from '../contexts/ThemeContext';
import { logError } from '../utils/logError';

const { width: SW } = Dimensions.get('window');

// ── Metric Registry ──────────────────────────────────────────────────────────
export type MetricId =
  | 'calories'
  | 'water'
  | 'protein'
  | 'creatine'
  | 'workout'
  | 'sleep'
  | 'streak'
  | 'weekly'
  | 'weight';

export interface MetricDefinition {
  id: MetricId;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  glowColor: string;
  category: 'Nutrition' | 'Habits' | 'Fitness';
  description: string;
}

export const METRIC_REGISTRY: Record<MetricId, MetricDefinition> = {
  calories: {
    id: 'calories',
    label: 'Calories',
    icon: 'flame',
    color: '#EF4444',
    glowColor: '#FF6B6B',
    category: 'Nutrition',
    description: 'Daily energy intake vs goal',
  },
  water: {
    id: 'water',
    label: 'Water',
    icon: 'water',
    color: '#38BDF8',
    glowColor: '#67D4FF',
    category: 'Nutrition',
    description: 'Daily hydration volume in liters',
  },
  protein: {
    id: 'protein',
    label: 'Protein',
    icon: 'restaurant',
    color: '#A855F7',
    glowColor: '#C084FC',
    category: 'Nutrition',
    description: 'Muscle building protein target',
  },
  creatine: {
    id: 'creatine',
    label: 'Creatine',
    icon: 'flash',
    color: '#F97316',
    glowColor: '#FB923C',
    category: 'Habits',
    description: 'Daily 5g creatine intake dose',
  },
  workout: {
    id: 'workout',
    label: 'Workout',
    icon: 'barbell',
    color: '#3B82F6',
    glowColor: '#60A5FA',
    category: 'Fitness',
    description: 'Completed daily training session',
  },
  sleep: {
    id: 'sleep',
    label: 'Sleep',
    icon: 'moon',
    color: '#818CF8',
    glowColor: '#A5B4FC',
    category: 'Habits',
    description: 'Quality rest & night recovery',
  },
  streak: {
    id: 'streak',
    label: 'Streak',
    icon: 'bonfire',
    color: '#EC4899',
    glowColor: '#F472B6',
    category: 'Fitness',
    description: 'Consecutive active workout streak',
  },
  weekly: {
    id: 'weekly',
    label: 'Weekly',
    icon: 'trophy',
    color: '#10B981',
    glowColor: '#34D399',
    category: 'Fitness',
    description: 'Weekly sessions logged vs target',
  },
  weight: {
    id: 'weight',
    label: 'Weight',
    icon: 'scale',
    color: '#14B8A6',
    glowColor: '#2DD4BF',
    category: 'Fitness',
    description: 'Current body weight logging',
  },
};

const DEFAULT_METRICS: MetricId[] = ['calories', 'protein', 'water'];

const PRESETS: { label: string; icon: keyof typeof Ionicons.glyphMap; keys: MetricId[] }[] = [
  { label: 'Nutrition', icon: 'nutrition-outline', keys: ['calories', 'protein', 'water'] },
  { label: 'Athlete', icon: 'barbell-outline', keys: ['workout', 'protein', 'streak'] },
  { label: 'Habits', icon: 'water-outline', keys: ['water', 'creatine', 'sleep'] },
  { label: 'Gains', icon: 'flame-outline', keys: ['calories', 'protein', 'workout'] },
];

// ── Stadium Racetrack SVG Path Builder ────────────────────────────────────────
// Creates a rounded rectangle (stadium) path with given dimensions
function buildStadiumPath(
  cx: number,
  cy: number,
  width: number,
  height: number,
  cornerRadius: number,
): { d: string; length: number } {
  const r = Math.min(cornerRadius, height / 2);
  const x = cx - width / 2;
  const y = cy - height / 2;

  // Rounded rect path
  const d = [
    `M ${x + r},${y}`,
    `L ${x + width - r},${y}`,
    `A ${r},${r} 0 0 1 ${x + width},${y + r}`,
    `L ${x + width},${y + height - r}`,
    `A ${r},${r} 0 0 1 ${x + width - r},${y + height}`,
    `L ${x + r},${y + height}`,
    `A ${r},${r} 0 0 1 ${x},${y + height - r}`,
    `L ${x},${y + r}`,
    `A ${r},${r} 0 0 1 ${x + r},${y}`,
    'Z',
  ].join(' ');

  // Approximate perimeter: 2 * straight sides + 4 quarter circles = 2*(W-2r) + 2*(H-2r) + 2*PI*r
  const length = 2 * (width - 2 * r) + 2 * (height - 2 * r) + 2 * Math.PI * r;
  return { d, length };
}

// 3 concentric stadium tracks (outer, middle, inner)
const TRACK_CENTER_X = 140;
const TRACK_CENTER_Y = 110;
const TRACK_CONFIGS = [
  { name: 'Outer Ring', width: 250, height: 160, radius: 68, strokeWidth: 13 },
  { name: 'Middle Ring', width: 210, height: 126, radius: 54, strokeWidth: 12 },
  { name: 'Inner Ring', width: 172, height: 96, radius: 42, strokeWidth: 11 },
];

const STADIUM_GEOMETRIES = TRACK_CONFIGS.map((cfg) => {
  const { d, length } = buildStadiumPath(
    TRACK_CENTER_X,
    TRACK_CENTER_Y,
    cfg.width,
    cfg.height,
    cfg.radius,
  );
  return {
    slotName: cfg.name,
    pathD: d,
    len: length,
    strokeWidth: cfg.strokeWidth,
  };
});

// ── Custom SVG Icons ─────────────────────────────────────────────────────────
// Premium SVG icons matching dark theme (used in the legend dots area)
const FILLED_ICONS: Partial<Record<MetricId, keyof typeof MaterialCommunityIcons.glyphMap>> = {
  calories: 'fire',
  protein: 'food-drumstick',
  water: 'cup-water',
};

function MetricSvgIcon({ metricId, size = 20, color }: { metricId: MetricId; size?: number; color: string }) {
  const s = size;
  const half = s / 2;

  // Calories, protein and water use clear, filled icons
  const filled = FILLED_ICONS[metricId];
  if (filled) return <MaterialCommunityIcons name={filled} size={s} color={color} />;

  switch (metricId) {
    case 'calories':
      // Fire/flame icon
      return (
        <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
          <Path
            d="M12 2C9.5 6.5 6 8 6 13a6 6 0 0012 0c0-5-3.5-6.5-6-11z"
            fill={color}
            opacity={0.25}
          />
          <Path
            d="M12 2C9.5 6.5 6 8 6 13a6 6 0 0012 0c0-5-3.5-6.5-6-11z"
            stroke={color}
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          <Path
            d="M12 22c-2 0-4-1.5-4-4.5 0-2.5 2-3.5 4-7 2 3.5 4 4.5 4 7 0 3-2 4.5-4 4.5z"
            fill={color}
            opacity={0.5}
          />
        </Svg>
      );
    case 'water':
      // Water drop icon
      return (
        <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
          <Path
            d="M12 2L6 12a6 6 0 1012 0L12 2z"
            fill={color}
            opacity={0.2}
          />
          <Path
            d="M12 2L6 12a6 6 0 1012 0L12 2z"
            stroke={color}
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          <Path
            d="M9.5 15a2.5 2.5 0 005 0"
            stroke={color}
            strokeWidth={1.5}
            strokeLinecap="round"
            fill="none"
            opacity={0.6}
          />
        </Svg>
      );
    case 'protein':
      // Steak/muscle icon
      return (
        <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
          <Circle cx={12} cy={12} r={8} fill={color} opacity={0.15} />
          <Path
            d="M8 12c0-2 1.5-4 4-4s4 2 4 4-1.5 4-4 4-4-2-4-4z"
            stroke={color}
            strokeWidth={1.8}
            fill="none"
          />
          <Path d="M10 10l4 4M14 10l-4 4" stroke={color} strokeWidth={1.2} strokeLinecap="round" opacity={0.5} />
          <Circle cx={12} cy={12} r={1.5} fill={color} opacity={0.6} />
        </Svg>
      );
    case 'creatine':
      // Lightning bolt icon
      return (
        <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
          <Path
            d="M13 2L4 14h7l-1 8 9-12h-7l1-8z"
            fill={color}
            opacity={0.2}
          />
          <Path
            d="M13 2L4 14h7l-1 8 9-12h-7l1-8z"
            stroke={color}
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </Svg>
      );
    case 'workout':
      // Dumbbell icon
      return (
        <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
          <Path d="M6 7v10M18 7v10M6 12h12" stroke={color} strokeWidth={2} strokeLinecap="round" />
          <Rect x={3} y={9} width={3} height={6} rx={1} fill={color} opacity={0.3} stroke={color} strokeWidth={1.2} />
          <Rect x={18} y={9} width={3} height={6} rx={1} fill={color} opacity={0.3} stroke={color} strokeWidth={1.2} />
        </Svg>
      );
    case 'sleep':
      // Moon + stars icon
      return (
        <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
          <Path
            d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"
            fill={color}
            opacity={0.2}
          />
          <Path
            d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"
            stroke={color}
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          <Circle cx={18} cy={6} r={1} fill={color} opacity={0.6} />
          <Circle cx={20} cy={9} r={0.7} fill={color} opacity={0.4} />
        </Svg>
      );
    case 'streak':
      // Fire streak icon
      return (
        <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
          <Path
            d="M12 2C9 7 5 9 5 14a7 7 0 0014 0c0-5-4-7-7-12z"
            fill={color}
            opacity={0.2}
          />
          <Path
            d="M12 2C9 7 5 9 5 14a7 7 0 0014 0c0-5-4-7-7-12z"
            stroke={color}
            strokeWidth={1.8}
            strokeLinecap="round"
            fill="none"
          />
          <Path
            d="M12 12c-1 2-2 3-2 5a2 2 0 004 0c0-2-1-3-2-5z"
            fill={color}
            opacity={0.5}
          />
        </Svg>
      );
    case 'weekly':
      // Trophy icon
      return (
        <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
          <Path
            d="M8 2h8v8a4 4 0 01-8 0V2z"
            fill={color}
            opacity={0.15}
            stroke={color}
            strokeWidth={1.6}
          />
          <Path d="M4 4h4M16 4h4" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
          <Path d="M4 4c0 3 2 5 4 6M20 4c0 3-2 5-4 6" stroke={color} strokeWidth={1.4} strokeLinecap="round" fill="none" opacity={0.5} />
          <Path d="M9 18h6M12 14v4" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
          <Rect x={8} y={18} width={8} height={3} rx={1} fill={color} opacity={0.25} stroke={color} strokeWidth={1.2} />
        </Svg>
      );
    case 'weight':
      // Scale icon
      return (
        <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
          <Circle cx={12} cy={12} r={9} fill={color} opacity={0.12} stroke={color} strokeWidth={1.6} />
          <Path d="M12 6v6l4 2" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
          <Circle cx={12} cy={12} r={2} fill={color} opacity={0.4} />
        </Svg>
      );
    default:
      return <Ionicons name="ellipse" size={s} color={color} />;
  }
}

// ── Main Screen ──────────────────────────────────────────────────────────────
export default function OverallScreen() {
  const { C, isDark } = useTheme();
  const [log, setLog] = useState<DailyLog | null>(null);
  const [goals, setGoals] = useState<Goals | null>(null);
  const [streak, setStreak] = useState<Streak | null>(null);
  const [weekly, setWeekly] = useState<any>(null);
  const [weight, setWeight] = useState<number | null>(null);
  const [refresh, setRefresh] = useState(false);
  const [customizing, setCustomizing] = useState(false);  // ring setup panel in the rings card

  // Selected metrics for the 3 concentric rings
  const [selectedMetrics, setSelectedMetrics] = useState<MetricId[]>(() => {
    try {
      const saved = getSetting('overall_ring_metrics_v2', '');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length === 3) {
          const validKeys = Object.keys(METRIC_REGISTRY);
          if (parsed.every((k: any) => validKeys.includes(k))) {
            return parsed;
          }
        }
      }
    } catch (e) { logError('overallMetrics', e); }
    return DEFAULT_METRICS;
  });

  const [pickerSlot, setPickerSlot] = useState<number | null>(null);

  const load = useCallback(() => {
    setLog(getTodayLog());
    setGoals(getGoals());
    setStreak(getStreak());
    setWeekly(getWeeklyStats());
    setWeight(getLatestWeight());
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = () => {
    setRefresh(true);
    load();
    setRefresh(false);
  };

  const handleSelectMetricForSlot = (metricId: MetricId) => {
    if (pickerSlot === null) return;
    const updated = [...selectedMetrics];
    updated[pickerSlot] = metricId;
    setSelectedMetrics(updated);
    try {
      setSetting('overall_ring_metrics_v2', JSON.stringify(updated));
    } catch (e) { logError('overallMetrics', e); }
    setPickerSlot(null);
  };

  const handleApplyPreset = (presetKeys: MetricId[]) => {
    setSelectedMetrics(presetKeys);
    try {
      setSetting('overall_ring_metrics_v2', JSON.stringify(presetKeys));
    } catch (e) { logError('overallMetrics', e); }
  };

  const handleResetDefaults = () => {
    setSelectedMetrics(DEFAULT_METRICS);
    try {
      setSetting('overall_ring_metrics_v2', JSON.stringify(DEFAULT_METRICS));
    } catch (e) { logError('overallMetrics', e); }
  };

  const styles = makeStyles(C, isDark);

  if (!log || !goals) return null;

  // ── Calculate Metric Details ─────────────────────────────────────────────
  const getMetricDetails = (id: MetricId) => {
    const meta = METRIC_REGISTRY[id];
    let current = 0;
    let target = 1;
    let valueStr = '';
    let subText = '';
    let pct = 0;
    let isDone = false;

    switch (id) {
      case 'calories': {
        current = log.calorie_intake || 0;
        target = goals.calorie_goal || 2500;
        pct = target > 0 ? Math.min(current / target, 1) : 0;
        valueStr = `${current.toLocaleString()} / ${target.toLocaleString()} kcal`;
        subText = current >= target ? 'Target achieved' : `${(target - current).toLocaleString()} kcal left`;
        isDone = current >= target;
        break;
      }
      case 'water': {
        current = log.water_intake || 0;
        target = goals.water_goal || 3.0;
        pct = target > 0 ? Math.min(current / target, 1) : 0;
        valueStr = `${current.toFixed(2)} / ${target.toFixed(1)} L`;
        subText = current >= target ? 'Hydration goal hit' : `${Math.max(0, target - current).toFixed(2)} L remaining`;
        isDone = current >= target;
        break;
      }
      case 'protein': {
        current = Math.round(log.protein_intake || 0);
        target = goals.protein_goal || 120;
        pct = target > 0 ? Math.min(current / target, 1) : 0;
        valueStr = `${current} / ${target} g`;
        subText = current >= target ? 'Protein target hit' : `${Math.max(0, target - current)}g more needed`;
        isDone = current >= target;
        break;
      }
      case 'creatine': {
        const taken = !!log.creatine_taken;
        pct = taken ? 1 : 0;
        valueStr = taken ? '5g Taken ✓' : 'Not Logged';
        subText = taken ? 'Muscle saturation on track' : 'Daily 5g dose recommended';
        isDone = taken;
        break;
      }
      case 'workout': {
        const done = !!log.workout_completed;
        pct = done ? 1 : 0;
        valueStr = done ? 'Completed ✓' : 'Pending';
        subText = done ? 'Session completed' : 'Crush your training today';
        isDone = done;
        break;
      }
      case 'sleep': {
        const slept = !!log.slept_well;
        pct = slept ? 1 : 0;
        valueStr = slept ? 'Rested ✓' : 'Pending';
        subText = slept ? 'Recovery logged' : 'Log rest in tracker';
        isDone = slept;
        break;
      }
      case 'streak': {
        current = streak?.current_streak || 0;
        target = Math.max(7, streak?.longest_streak || 7);
        pct = target > 0 ? Math.min(current / target, 1) : 0;
        valueStr = `${current} days`;
        subText = `Best: ${streak?.longest_streak || 0} days`;
        isDone = current >= 7;
        break;
      }
      case 'weekly': {
        current = weekly?.workouts || 0;
        target = 5;
        pct = target > 0 ? Math.min(current / target, 1) : 0;
        valueStr = `${current} / ${target} sessions`;
        subText = current >= target ? 'Weekly goal done' : `${target - current} more to go`;
        isDone = current >= target;
        break;
      }
      case 'weight': {
        current = weight || 0;
        target = goals.weight_goal || 75.0;
        pct = current > 0 ? 1 : 0;
        valueStr = current > 0 ? `${current.toFixed(1)} kg` : '-- kg';
        subText = current > 0 ? `Target: ${target} kg` : 'Tap to log weight';
        isDone = current > 0;
        break;
      }
    }

    return { ...meta, current, target, valueStr, subText, pct, isDone };
  };

  // Build the 3 active rings
  const activeRings = selectedMetrics.map((id, index) => {
    const geom = STADIUM_GEOMETRIES[index];
    const data = getMetricDetails(id);
    return { ...geom, ...data, slotIndex: index };
  });

  const score = Math.round(
    (activeRings.reduce((sum, r) => sum + Math.min(r.pct, 1), 0) / activeRings.length) * 100
  );
  const targetsCompletedCount = activeRings.filter((r) => r.pct >= 1).length;

  const todayFormatted = (() => {
    try {
      return new Date().toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return todayStr();
    }
  })();

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Today's Activities</Text>
          <Text style={styles.headerSubtitle}>{todayFormatted}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={styles.scorePill}>
            <View style={[styles.scoreDot, { backgroundColor: score >= 70 ? '#4ADE80' : score >= 40 ? '#FBBF24' : '#EF4444' }]} />
            <Text style={[styles.scorePillTxt, { color: score >= 70 ? '#4ADE80' : score >= 40 ? '#FBBF24' : '#EF4444' }]}>
              {score}%
            </Text>
          </View>
          <SettingsButton />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refresh} onRefresh={onRefresh} tintColor={C.accent} />}
      >
        {/* ── Stadium Racetrack Card ── */}
        <View style={styles.trackCard}>
          {/* Card top row */}
          <View style={styles.trackCardTop}>
            <Text style={styles.trackCardTitle}>Activity Rings</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={styles.trackScoreBadge}>
                <Text style={styles.trackScoreBadgeTxt}>{targetsCompletedCount}/3 Done</Text>
              </View>
              {/* Ring setup lives here, in the rings card */}
              <TouchableOpacity
                style={[styles.ringEditBtn, customizing && { backgroundColor: C.accent, borderColor: C.accent }]}
                onPress={() => setCustomizing(v => !v)}
                activeOpacity={0.8}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityLabel="Customize rings"
              >
                <Ionicons name={customizing ? 'close' : 'options-outline'} size={16} color={customizing ? '#fff' : C.accent} />
              </TouchableOpacity>
            </View>
          </View>

          {/* SVG Stadium */}
          <View style={styles.trackSvgWrap}>
            <Svg width={280} height={220} viewBox="0 0 280 220">
              <Defs>
                {activeRings.map((ring) => (
                  <LinearGradient
                    key={`grad-${ring.slotIndex}`}
                    id={`ring-grad-${ring.slotIndex}`}
                    x1="0%" y1="0%" x2="100%" y2="100%"
                  >
                    <Stop offset="0%" stopColor={ring.glowColor} stopOpacity={1} />
                    <Stop offset="100%" stopColor={ring.color} stopOpacity={1} />
                  </LinearGradient>
                ))}
              </Defs>

              {activeRings.map((ring) => {
                const perimeter = ring.len;
                const progressLen = perimeter * Math.min(Math.max(ring.pct, 0), 1);
                const dashoffset = perimeter - progressLen;
                const hasProgress = ring.pct > 0;

                return (
                  <React.Fragment key={`track-${ring.slotIndex}`}>
                    {/* Background track */}
                    <Path
                      d={ring.pathD}
                      stroke={isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)'}
                      strokeWidth={ring.strokeWidth}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      fill="none"
                    />
                    {/* Progress track */}
                    {hasProgress && (
                      <Path
                        d={ring.pathD}
                        stroke={`url(#ring-grad-${ring.slotIndex})`}
                        strokeWidth={ring.strokeWidth}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        fill="none"
                        strokeDasharray={`${perimeter}, ${perimeter}`}
                        strokeDashoffset={dashoffset}
                      />
                    )}
                  </React.Fragment>
                );
              })}
            </Svg>

            {/* Center overlay */}
            <View style={styles.trackCenterOverlay} pointerEvents="none">
              <Text style={styles.trackCenterScore}>{score}%</Text>
              <Text style={styles.trackCenterLabel}>OVERALL</Text>
            </View>
          </View>

          {/* Metric stat items below the track */}
          <View style={styles.trackStatsRow}>
            {activeRings.map((ring) => (
              <TouchableOpacity
                key={`stat-${ring.slotIndex}`}
                style={styles.trackStatItem}
                activeOpacity={0.7}
                onPress={() => setPickerSlot(ring.slotIndex)}
              >
                <View style={[styles.trackStatDot, { backgroundColor: ring.color }]} />
                <View style={[styles.trackStatIconWrap, { backgroundColor: ring.color + '18' }]}>
                  <MetricSvgIcon metricId={ring.id} size={22} color={ring.color} />
                </View>
                <Text style={styles.trackStatLabel}>{ring.label}</Text>
                <Text style={[styles.trackStatValue, { color: ring.color }]}>
                  {Math.round(ring.pct * 100)}%
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* ── Ring setup (opens from the button in the card's top row) ── */}
          {customizing && (
            <View style={styles.ringSetup}>
              <View style={styles.customizeTopRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.customizeTitle}>Customize rings</Text>
                  <Text style={styles.customizeSub}>Pick a preset or choose what each ring shows</Text>
                </View>
                <TouchableOpacity onPress={handleResetDefaults} style={styles.resetBtn} activeOpacity={0.75}>
                  <Ionicons name="refresh-outline" size={13} color={C.accent} style={{ marginRight: 3 }} />
                  <Text style={styles.resetBtnTxt}>Reset</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.presetRow}>
                {PRESETS.map((p) => (
                  <TouchableOpacity
                    key={p.label}
                    style={styles.presetChip}
                    onPress={() => handleApplyPreset(p.keys)}
                    activeOpacity={0.75}
                  >
                    <Ionicons name={p.icon} size={14} color={C.accent} style={{ marginRight: 4 }} />
                    <Text style={styles.presetChipTxt}>{p.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.slotsList}>
                {activeRings.map((ring) => (
                  <TouchableOpacity
                    key={`slot-${ring.slotIndex}`}
                    style={styles.slotRow}
                    activeOpacity={0.8}
                    onPress={() => setPickerSlot(ring.slotIndex)}
                  >
                    <View style={[styles.slotColorBar, { backgroundColor: ring.color }]} />
                    <View style={styles.slotInfo}>
                      <Text style={styles.slotTierName}>{ring.slotName}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
                        <MetricSvgIcon metricId={ring.id} size={16} color={ring.color} />
                        <Text style={[styles.slotMetricName, { color: ring.color }]}>{ring.label}</Text>
                        <Text style={styles.slotMetricVal}>{ring.valueStr}</Text>
                      </View>
                    </View>
                    <View style={styles.slotChangeBtn}>
                      <Text style={styles.slotChangeBtnTxt}>Change</Text>
                      <Ionicons name="chevron-forward" size={14} color={C.accent} />
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
        </View>

        {/* ── Score Banner ── */}
        <View style={styles.scoreBanner}>
          <View style={styles.scoreBannerLeft}>
            <Text style={styles.scoreBannerNum}>{score}</Text>
            <Text style={styles.scoreBannerUnit}>pts</Text>
          </View>
          <View style={styles.scoreBannerDivider} />
          <View style={styles.scoreBannerRight}>
            <Text style={styles.scoreBannerTitle}>
              {score >= 90 ? 'Outstanding day'
                : score >= 70 ? 'Great progress'
                : score >= 40 ? 'Keep pushing'
                : 'Just getting started'}
            </Text>
            <Text style={styles.scoreBannerSub}>
              {streak?.current_streak
                ? `${streak.current_streak} day workout streak active`
                : 'Consistency builds permanent gains'}
            </Text>
          </View>
        </View>

        {/* ── Metric Breakdown Cards ── */}
        <SectionHeader title="Ring Breakdown" />

        {activeRings.map((ring) => (
          <TouchableOpacity
            key={`breakdown-${ring.slotIndex}`}
            style={styles.breakdownCard}
            activeOpacity={0.85}
            onPress={() => setPickerSlot(ring.slotIndex)}
          >
            <View style={styles.breakdownHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={[styles.breakdownIconBox, { backgroundColor: ring.color + '1A', borderColor: ring.color + '40' }]}>
                  <MetricSvgIcon metricId={ring.id} size={22} color={ring.color} />
                </View>
                <View style={{ marginLeft: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={styles.breakdownLabel}>{ring.label}</Text>
                    <View style={[styles.breakdownRingBadge, { backgroundColor: ring.color + '18' }]}>
                      <Text style={[styles.breakdownRingBadgeTxt, { color: ring.color }]}>{ring.slotName}</Text>
                    </View>
                  </View>
                  <Text style={styles.breakdownSub}>{ring.subText}</Text>
                </View>
              </View>
              <View style={[styles.breakdownPctPill, { backgroundColor: ring.color + '15', borderColor: ring.color + '35' }]}>
                <Text style={[styles.breakdownPctTxt, { color: ring.color }]}>{Math.round(ring.pct * 100)}%</Text>
              </View>
            </View>

            <View style={styles.breakdownValueRow}>
              <Text style={styles.breakdownValue}>{ring.valueStr}</Text>
              {ring.isDone ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Ionicons name="checkmark-circle" size={16} color={ring.color} />
                  <Text style={{ fontSize: 12, fontWeight: '800', color: ring.color }}>Done</Text>
                </View>
              ) : (
                <Text style={{ fontSize: 11, color: C.muted, fontWeight: '600' }}>Tap to swap</Text>
              )}
            </View>

            <View style={styles.breakdownBarTrack}>
              <View
                style={[
                  styles.breakdownBarFill,
                  { width: `${Math.round(Math.min(ring.pct, 1) * 100)}%`, backgroundColor: ring.color },
                ]}
              />
            </View>
          </TouchableOpacity>
        ))}

        <View style={{ height: 32 }} />
      </ScrollView>

      {/* ── Metric Picker Modal ── */}
      <Modal
        visible={pickerSlot !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setPickerSlot(null)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setPickerSlot(null)}
        >
          <TouchableOpacity
            style={styles.modalSheet}
            activeOpacity={1}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.sheetHandle} />

            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>
                  Select Metric for {pickerSlot !== null ? STADIUM_GEOMETRIES[pickerSlot].slotName : ''}
                </Text>
                <Text style={styles.modalSub}>Choose which stat to display on this ring</Text>
              </View>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => setPickerSlot(null)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={20} color={C.text} />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={{ maxHeight: 420 }}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 20 }}
            >
              {Object.values(METRIC_REGISTRY).map((meta) => {
                const details = getMetricDetails(meta.id);
                const isSelectedForThisSlot =
                  pickerSlot !== null && selectedMetrics[pickerSlot] === meta.id;
                const isUsedInAnotherSlot =
                  pickerSlot !== null &&
                  selectedMetrics.some((id, idx) => id === meta.id && idx !== pickerSlot);

                return (
                  <TouchableOpacity
                    key={meta.id}
                    style={[
                      styles.metricOptionCard,
                      isSelectedForThisSlot && { borderColor: meta.color, borderWidth: 1.5 },
                    ]}
                    activeOpacity={0.78}
                    onPress={() => handleSelectMetricForSlot(meta.id)}
                  >
                    <View
                      style={[
                        styles.metricOptionIconBox,
                        { backgroundColor: meta.color + '1A', borderColor: meta.color + '40' },
                      ]}
                    >
                      <MetricSvgIcon metricId={meta.id} size={22} color={meta.color} />
                    </View>

                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={styles.metricOptionTitle}>{meta.label}</Text>
                        <View style={[styles.categoryPill, { backgroundColor: C.border + '60' }]}>
                          <Text style={styles.categoryPillTxt}>{meta.category}</Text>
                        </View>
                        {isUsedInAnotherSlot && (
                          <Text style={{ fontSize: 10, color: C.muted, fontWeight: '600' }}>(Active)</Text>
                        )}
                      </View>
                      <Text style={styles.metricOptionDesc}>{meta.description}</Text>
                      <Text style={[styles.metricOptionLiveVal, { color: meta.color }]}>
                        Current: {details.valueStr}
                      </Text>
                    </View>

                    <View style={styles.radioBox}>
                      <Ionicons
                        name={isSelectedForThisSlot ? 'checkmark-circle' : 'ellipse-outline'}
                        size={22}
                        color={isSelectedForThisSlot ? meta.color : C.muted}
                      />
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
function makeStyles(C: any, isDark: boolean) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.bg },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 18,
      paddingVertical: 14,
      backgroundColor: C.bg,
      borderBottomWidth: 1,
      borderBottomColor: C.border,
    },
    headerTitle: {
      fontSize: 22,
      fontWeight: '900',
      color: C.text,
      letterSpacing: -0.3,
    },
    headerSubtitle: {
      fontSize: 12,
      color: C.muted,
      fontWeight: '600',
      marginTop: 2,
    },
    scorePill: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 20,
      backgroundColor: isDark ? '#111318' : '#F8FAFC',
      borderWidth: 1,
      borderColor: isDark ? '#1E1E26' : '#E2E8F0',
    },
    scoreDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      marginRight: 6,
    },
    scorePillTxt: {
      fontSize: 15,
      fontWeight: '900',
    },
    scroll: {
      padding: 16,
      paddingBottom: 40,
    },

    // ── Stadium Track Card ──
    trackCard: {
      backgroundColor: isDark ? '#0A0D14' : '#FFFFFF',
      borderRadius: 24,
      paddingVertical: 18,
      paddingHorizontal: 16,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255, 255, 255, 0.06)' : '#E2E8F0',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: isDark ? 0.4 : 0.08,
      shadowRadius: 16,
      elevation: 6,
      alignItems: 'center',
    },
    trackCardTop: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      width: '100%',
      paddingHorizontal: 4,
      marginBottom: 4,
    },
    trackCardTitle: {
      fontSize: 18,
      fontWeight: '900',
      color: C.text,
      letterSpacing: -0.3,
    },
    trackScoreBadge: {
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 12,
      backgroundColor: isDark ? 'rgba(74, 222, 128, 0.1)' : 'rgba(74, 222, 128, 0.15)',
      borderWidth: 1,
      borderColor: 'rgba(74, 222, 128, 0.25)',
    },
    trackScoreBadgeTxt: {
      fontSize: 12,
      fontWeight: '800',
      color: '#4ADE80',
    },
    trackSvgWrap: {
      width: 280,
      height: 220,
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
    },
    trackCenterOverlay: {
      position: 'absolute',
      alignItems: 'center',
      justifyContent: 'center',
    },
    trackCenterScore: {
      fontSize: 28,
      fontWeight: '900',
      color: C.text,
      letterSpacing: -0.5,
    },
    trackCenterLabel: {
      fontSize: 10,
      fontWeight: '800',
      color: C.muted,
      letterSpacing: 1.5,
      marginTop: 2,
    },
    trackStatsRow: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      width: '100%',
      paddingTop: 16,
      marginTop: 6,
      borderTopWidth: 1,
      borderTopColor: isDark ? 'rgba(255, 255, 255, 0.05)' : '#EDF2F7',
    },
    trackStatItem: {
      alignItems: 'center',
      flex: 1,
    },
    trackStatDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      marginBottom: 6,
    },
    trackStatIconWrap: {
      width: 36,
      height: 36,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 6,
    },
    trackStatLabel: {
      fontSize: 11,
      color: C.muted,
      fontWeight: '700',
      marginBottom: 2,
    },
    trackStatValue: {
      fontSize: 16,
      fontWeight: '900',
    },

    // ── Score Banner ──
    scoreBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: C.card,
      borderRadius: 18,
      padding: 16,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: C.border,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.08,
      shadowRadius: 6,
      elevation: 3,
    },
    scoreBannerLeft: {
      alignItems: 'center',
      paddingRight: 16,
      flexDirection: 'row',
      gap: 4,
    },
    scoreBannerNum: {
      fontSize: 34,
      fontWeight: '900',
      color: C.text,
      lineHeight: 38,
    },
    scoreBannerUnit: {
      fontSize: 12,
      fontWeight: '700',
      color: C.muted,
      marginTop: 10,
    },
    scoreBannerDivider: {
      width: 1,
      height: 38,
      backgroundColor: C.border,
      marginRight: 16,
    },
    scoreBannerRight: {
      flex: 1,
    },
    scoreBannerTitle: {
      fontSize: 14,
      fontWeight: '800',
      color: C.text,
    },
    scoreBannerSub: {
      fontSize: 12,
      color: C.muted,
      fontWeight: '600',
      marginTop: 2,
    },

    // ── Breakdown Card ──
    breakdownCard: {
      backgroundColor: C.card,
      borderRadius: 18,
      padding: 16,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: C.border,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.06,
      shadowRadius: 6,
      elevation: 2,
    },
    breakdownHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    breakdownIconBox: {
      width: 42,
      height: 42,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
    },
    breakdownLabel: {
      fontSize: 15,
      fontWeight: '800',
      color: C.text,
    },
    breakdownRingBadge: {
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderRadius: 6,
    },
    breakdownRingBadgeTxt: {
      fontSize: 9,
      fontWeight: '700',
      textTransform: 'uppercase',
    },
    breakdownSub: {
      fontSize: 12,
      color: C.muted,
      fontWeight: '500',
      marginTop: 2,
    },
    breakdownPctPill: {
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 12,
      borderWidth: 1,
    },
    breakdownPctTxt: {
      fontSize: 13,
      fontWeight: '900',
    },
    breakdownValueRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 10,
    },
    breakdownValue: {
      fontSize: 15,
      fontWeight: '800',
      color: C.text,
    },
    breakdownBarTrack: {
      height: 7,
      borderRadius: 4,
      backgroundColor: isDark ? '#151C2C' : '#E2E8F0',
      overflow: 'hidden',
    },
    breakdownBarFill: {
      height: '100%',
      borderRadius: 4,
    },

    // ── Customize Section ──
    ringSetup: {
      marginTop: 14,
      paddingTop: 14,
      borderTopWidth: 1,
      borderTopColor: C.border,
    },
    ringEditBtn: {
      width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
      backgroundColor: C.accent + '14', borderWidth: 1, borderColor: C.accent + '40',
    },
    customizeTopRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 12,
    },
    customizeTitle: {
      fontSize: 15,
      fontWeight: '800',
      color: C.text,
    },
    customizeSub: {
      fontSize: 11,
      color: C.muted,
      marginTop: 2,
      maxWidth: 220,
    },
    resetBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: C.accentDim,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: C.accent + '33',
    },
    resetBtnTxt: {
      fontSize: 11,
      fontWeight: '700',
      color: C.accent,
    },
    presetRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 14,
    },
    presetChip: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? '#111827' : '#F1F5F9',
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: C.border,
    },
    presetChipTxt: {
      fontSize: 11,
      fontWeight: '700',
      color: C.text,
    },
    slotsList: {
      gap: 10,
    },
    slotRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? '#0C1120' : '#F8FAFC',
      padding: 12,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: C.border,
    },
    slotColorBar: {
      width: 4,
      height: 36,
      borderRadius: 2,
      marginRight: 10,
    },
    slotInfo: {
      flex: 1,
    },
    slotTierName: {
      fontSize: 11,
      fontWeight: '700',
      color: C.muted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    slotMetricName: {
      fontSize: 14,
      fontWeight: '800',
    },
    slotMetricVal: {
      fontSize: 11,
      color: C.muted,
      fontWeight: '500',
    },
    slotChangeBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 8,
      backgroundColor: C.accentDim,
    },
    slotChangeBtnTxt: {
      fontSize: 11,
      fontWeight: '700',
      color: C.accent,
    },

    // ── Picker Modal ──
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.65)',
      justifyContent: 'flex-end',
    },
    modalSheet: {
      backgroundColor: C.card,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingHorizontal: 18,
      paddingTop: 12,
      paddingBottom: 24,
      borderWidth: 1,
      borderColor: C.border,
    },
    sheetHandle: {
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: C.muted + '55',
      alignSelf: 'center',
      marginBottom: 12,
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 14,
    },
    modalTitle: {
      fontSize: 16,
      fontWeight: '800',
      color: C.text,
    },
    modalSub: {
      fontSize: 12,
      color: C.muted,
      marginTop: 2,
    },
    modalCloseBtn: {
      padding: 6,
      borderRadius: 16,
      backgroundColor: C.bg,
    },
    metricOptionCard: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 12,
      backgroundColor: isDark ? '#0B1120' : '#F8FAFC',
      borderRadius: 14,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: C.border,
    },
    metricOptionIconBox: {
      width: 40,
      height: 40,
      borderRadius: 13,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
    },
    metricOptionTitle: {
      fontSize: 14,
      fontWeight: '800',
      color: C.text,
    },
    categoryPill: {
      paddingHorizontal: 6,
      paddingVertical: 1,
      borderRadius: 6,
    },
    categoryPillTxt: {
      fontSize: 9,
      fontWeight: '700',
      color: C.muted,
    },
    metricOptionDesc: {
      fontSize: 11,
      color: C.muted,
      marginTop: 1,
    },
    metricOptionLiveVal: {
      fontSize: 11,
      fontWeight: '700',
      marginTop: 2,
    },
    radioBox: {
      paddingLeft: 10,
    },
  });
}
