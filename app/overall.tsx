// app/overall.tsx — Overall Activity & Samsung Health Concentric Heart Screen
import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path, G, Defs, LinearGradient, Stop } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { getTodayLog, getGoals, getStreak, DailyLog, Goals, Streak, todayStr } from '../db/database';
import { SectionHeader } from '../components/ui';
import { useTheme } from '../contexts/ThemeContext';

const { width: SW } = Dimensions.get('window');

// ── Authentic Concentric Activity Heart ─────────────────────────────────────
// Iconic proper heart geometry that looks unmistakably like a heart:
// - Multi-layer rendering: physical contact drop shadow + ambient aura + core bloom + vibrant gradient + 3D specular highlight
const HEART_RINGS_CONFIG = [
  {
    key: 'calories',
    label: 'Calories',
    icon: 'flame',
    color: '#4ADE80',
    glowColor: '#4ADE80',
    trackDark: '#112F18',
    trackLight: '#D1FAE5',
    gradientId: 'grad-calories',
    gradientColors: ['#86EFAC', '#4ADE80', '#16A34A'],
    strokeWidth: 12.0,
    len: 561,
    pathD: 'M 120.0,62.0 C 138.0,28.0 182.0,24.0 206.0,68.0 C 222.0,98.0 148.0,178.0 120.0,210.0 C 92.0,178.0 18.0,98.0 34.0,68.0 C 58.0,24.0 102.0,28.0 120.0,62.0',
    shadowPathD: 'M 120.0,64.5 C 138.0,30.5 182.0,26.5 206.0,70.5 C 222.0,100.5 148.0,180.5 120.0,212.5 C 92.0,180.5 18.0,100.5 34.0,70.5 C 58.0,26.5 102.0,30.5 120.0,64.5',
    highlightPathD: 'M 120.0,61.0 C 138.0,27.0 182.0,23.0 206.0,67.0 C 222.0,97.0 148.0,177.0 120.0,209.0 C 92.0,177.0 18.0,97.0 34.0,67.0 C 58.0,23.0 102.0,27.0 120.0,61.0',
  },
  {
    key: 'water',
    label: 'Water',
    icon: 'water',
    color: '#00D4E6',
    glowColor: '#00D4E6',
    trackDark: '#0B2533',
    trackLight: '#E0F2FE',
    gradientId: 'grad-water',
    gradientColors: ['#67E8F9', '#00D4E6', '#0284C7'],
    strokeWidth: 11.5,
    len: 473,
    pathD: 'M 120.0,75.5 C 139.5,43.0 170.0,39.0 191.0,72.5 C 207.0,96.5 139.0,167.5 120.0,195.0 C 101.0,167.5 33.0,96.5 49.0,72.5 C 70.0,39.0 100.5,43.0 120.0,75.5',
    shadowPathD: 'M 120.0,78.0 C 139.5,45.5 170.0,41.5 191.0,75.0 C 207.0,99.0 139.0,170.0 120.0,197.5 C 101.0,170.0 33.0,99.0 49.0,75.0 C 70.0,41.5 100.5,45.5 120.0,78.0',
    highlightPathD: 'M 120.0,74.5 C 139.5,42.0 170.0,38.0 191.0,71.5 C 207.0,95.5 139.0,166.5 120.0,194.0 C 101.0,166.5 33.0,95.5 49.0,71.5 C 70.0,38.0 100.5,42.0 120.0,74.5',
  },
  {
    key: 'protein',
    label: 'Protein',
    icon: 'restaurant',
    color: '#C084FC',
    glowColor: '#C084FC',
    trackDark: '#24133A',
    trackLight: '#F3E8FF',
    gradientId: 'grad-protein',
    gradientColors: ['#F0ABFC', '#C084FC', '#9333EA'],
    strokeWidth: 11.0,
    len: 387,
    pathD: 'M 120.0,89.0 C 141.0,58.0 158.0,54.0 176.0,77.0 C 192.0,95.0 130.0,157.0 120.0,180.0 C 110.0,157.0 48.0,95.0 64.0,77.0 C 82.0,54.0 99.0,58.0 120.0,89.0',
    shadowPathD: 'M 120.0,91.5 C 141.0,60.5 158.0,56.5 176.0,79.5 C 192.0,97.5 130.0,159.5 120.0,182.5 C 110.0,159.5 48.0,97.5 64.0,79.5 C 82.0,56.5 99.0,60.5 120.0,91.5',
    highlightPathD: 'M 120.0,88.0 C 141.0,57.0 158.0,53.0 176.0,76.0 C 192.0,94.0 130.0,156.0 120.0,179.0 C 110.0,156.0 48.0,94.0 64.0,76.0 C 82.0,53.0 99.0,57.0 120.0,88.0',
  },
  {
    key: 'creatine',
    label: 'Creatine',
    icon: 'flash',
    color: '#FB923C',
    glowColor: '#FB923C',
    trackDark: '#321B0B',
    trackLight: '#FFEDD5',
    gradientId: 'grad-creatine',
    gradientColors: ['#FEF08A', '#FB923C', '#EA580C'],
    strokeWidth: 10.5,
    len: 304,
    pathD: 'M 120.0,102.5 C 142.5,73.0 146.0,69.0 161.0,81.5 C 177.0,93.5 121.0,146.5 120.0,165.0 C 119.0,146.5 63.0,93.5 79.0,81.5 C 94.0,69.0 97.5,73.0 120.0,102.5',
    shadowPathD: 'M 120.0,105.0 C 142.5,75.5 146.0,71.5 161.0,84.0 C 177.0,96.0 121.0,149.0 120.0,167.5 C 119.0,149.0 63.0,96.0 79.0,84.0 C 94.0,71.5 97.5,75.5 120.0,105.0',
    highlightPathD: 'M 120.0,101.5 C 142.5,72.0 146.0,68.0 161.0,80.5 C 177.0,92.5 121.0,145.5 120.0,164.0 C 119.0,145.5 63.0,92.5 79.0,80.5 C 94.0,68.0 97.5,72.0 120.0,101.5',
  },
];

export default function OverallScreen() {
  const { C, isDark } = useTheme();
  const [log, setLog] = useState<DailyLog | null>(null);
  const [goals, setGoals] = useState<Goals | null>(null);
  const [streak, setStreak] = useState<Streak | null>(null);
  const [refresh, setRefresh] = useState(false);

  const load = useCallback(() => {
    setLog(getTodayLog());
    setGoals(getGoals());
    setStreak(getStreak());
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

  const styles = makeStyles(C, isDark);

  if (!log || !goals) return null;

  const calorieGoal = goals.calorie_goal || 2500;
  const waterGoal = goals.water_goal || 3.0;
  const proteinGoal = goals.protein_goal || 120;

  const calorieIntake = log.calorie_intake || 0;
  const waterIntake = log.water_intake || 0;
  const proteinIntake = log.protein_intake || 0;
  const creatineTaken = !!log.creatine_taken;

  const caloriePct = calorieGoal > 0 ? Math.min(calorieIntake / calorieGoal, 1) : 0;
  const waterPct = waterGoal > 0 ? Math.min(waterIntake / waterGoal, 1) : 0;
  const proteinPct = proteinGoal > 0 ? Math.min(proteinIntake / proteinGoal, 1) : 0;
  const creatinePct = creatineTaken ? 1 : 0;

  const score = Math.round(
    caloriePct * 30 +
    waterPct * 30 +
    proteinPct * 25 +
    creatinePct * 15
  );

  const goalsCompletedCount = [
    caloriePct >= 1,
    waterPct >= 1,
    proteinPct >= 1,
    creatinePct >= 1,
  ].filter(Boolean).length;

  const rings = [
    {
      ...HEART_RINGS_CONFIG[0],
      valueStr: `${calorieIntake.toLocaleString()} / ${calorieGoal.toLocaleString()} kcal`,
      subText: calorieIntake >= calorieGoal
        ? 'Goal reached! 🎉'
        : `${(calorieGoal - calorieIntake).toLocaleString()} kcal remaining`,
      pct: caloriePct,
    },
    {
      ...HEART_RINGS_CONFIG[1],
      valueStr: `${waterIntake.toFixed(2)} / ${waterGoal.toFixed(1)} L`,
      subText: waterIntake >= waterGoal
        ? 'Hydration goal smashed!'
        : `${Math.max(0, waterGoal - waterIntake).toFixed(2)} L remaining`,
      pct: waterPct,
    },
    {
      ...HEART_RINGS_CONFIG[2],
      valueStr: `${Math.round(proteinIntake)} / ${proteinGoal} g`,
      subText: proteinIntake >= proteinGoal
        ? 'Target reached! 🥩'
        : `${Math.max(0, proteinGoal - Math.round(proteinIntake))}g more needed`,
      pct: proteinPct,
    },
    {
      ...HEART_RINGS_CONFIG[3],
      valueStr: creatineTaken ? '5g Taken ✓' : 'Not Taken',
      subText: creatineTaken
        ? 'Muscle saturation maintained'
        : 'Daily dose of 5g recommended',
      pct: creatinePct,
    },
  ];

  const todayFormatted = (() => {
    try {
      return new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
    } catch {
      return todayStr();
    }
  })();

  return (
    <SafeAreaView style={styles.safe}>
      {/* ── Top Header ── */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Overall Activity</Text>
          <Text style={styles.headerSubtitle}>{todayFormatted}</Text>
        </View>
        <View style={styles.scorePill}>
          <Ionicons name="sparkles" size={14} color="#4ADE80" style={{ marginRight: 4 }} />
          <Text style={styles.scorePillTxt}>{score} pts</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refresh} onRefresh={onRefresh} tintColor={C.accent} />}
      >
        {/* ── Hero Samsung Health Concentric Heart Showcase ── */}
        <View style={styles.heartCard}>
          {/* Top Title & Score Pill */}
          <View style={styles.heartCardTop}>
            <View>
              <Text style={styles.heartCardTitle}>Daily Activity</Text>
              <Text style={styles.heartCardSubtitle}>
                {goalsCompletedCount} of 4 targets completed
              </Text>
            </View>
            <View style={styles.heartScoreBadge}>
              <Ionicons name="flame" size={13} color="#4ADE80" style={{ marginRight: 4 }} />
              <Text style={styles.heartScoreBadgeTxt}>{score}% Done</Text>
            </View>
          </View>

          {/* SVG Concentric Heart with Recessed Grooves, Multi-Layer Shadows & 3D Glowing Tubes */}
          <View style={styles.heartSvgContainer}>
            <Svg width={250} height={250} viewBox="0 0 240 240">
              <Defs>
                {rings.map(r => (
                  <LinearGradient key={r.gradientId} id={r.gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
                    <Stop offset="0%" stopColor={r.gradientColors[0]} />
                    <Stop offset="50%" stopColor={r.gradientColors[1]} />
                    <Stop offset="100%" stopColor={r.gradientColors[2]} />
                  </LinearGradient>
                ))}
              </Defs>

              <G>
                {rings.map(ring => {
                  const perimeter = ring.len;
                  const dashoffset = perimeter * (1 - Math.min(Math.max(ring.pct, 0), 1));
                  const hasProgress = ring.pct > 0;

                  return (
                    <React.Fragment key={ring.key}>
                      {/* 1. Recessed Channel Backing (gives tactile engraved bezel depth) */}
                      <Path
                        d={ring.pathD}
                        stroke={isDark ? '#040711' : '#E2E8F0'}
                        strokeWidth={ring.strokeWidth + 2.5}
                        strokeOpacity={isDark ? 0.95 : 0.6}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        fill="none"
                      />

                      {/* 2. Deep Muted Jewel Tone Track */}
                      <Path
                        d={ring.pathD}
                        stroke={isDark ? ring.trackDark : ring.trackLight}
                        strokeWidth={ring.strokeWidth}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        fill="none"
                      />

                      {/* 3. Physical Drop Shadow directly under active stroke for 3D elevation */}
                      {hasProgress && (
                        <Path
                          d={ring.shadowPathD}
                          stroke="#000000"
                          strokeWidth={ring.strokeWidth + 1.5}
                          strokeOpacity={isDark ? 0.65 : 0.25}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          fill="none"
                          strokeDasharray={`${perimeter}, ${perimeter}`}
                          strokeDashoffset={dashoffset}
                        />
                      )}

                      {/* 4. Wide Ambient Neon Glow Aura */}
                      {hasProgress && (
                        <Path
                          d={ring.pathD}
                          stroke={ring.glowColor}
                          strokeWidth={ring.strokeWidth + 7}
                          strokeOpacity={isDark ? 0.22 : 0.14}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          fill="none"
                          strokeDasharray={`${perimeter}, ${perimeter}`}
                          strokeDashoffset={dashoffset}
                        />
                      )}

                      {/* 5. Concentrated Core Bloom */}
                      {hasProgress && (
                        <Path
                          d={ring.pathD}
                          stroke={ring.glowColor}
                          strokeWidth={ring.strokeWidth + 2.5}
                          strokeOpacity={isDark ? 0.45 : 0.32}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          fill="none"
                          strokeDasharray={`${perimeter}, ${perimeter}`}
                          strokeDashoffset={dashoffset}
                        />
                      )}

                      {/* 6. High-Voltage Gradient Active Tube */}
                      {hasProgress && (
                        <Path
                          d={ring.pathD}
                          stroke={`url(#${ring.gradientId})`}
                          strokeWidth={ring.strokeWidth}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          fill="none"
                          strokeDasharray={`${perimeter}, ${perimeter}`}
                          strokeDashoffset={dashoffset}
                        />
                      )}

                      {/* 7. 3D Specular Highlight Ridge (Glossy Sheen) */}
                      {hasProgress && (
                        <Path
                          d={ring.highlightPathD}
                          stroke="rgba(255, 255, 255, 0.42)"
                          strokeWidth={ring.strokeWidth * 0.22}
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
              </G>
            </Svg>
          </View>

          {/* Concentric Heart 4-Color Legend Row */}
          <View style={styles.heartLegendRow}>
            {rings.map(ring => (
              <View key={ring.key} style={styles.legendItem}>
                <View style={[styles.legendDotOuter, { borderColor: ring.color + '40', backgroundColor: ring.color + '15' }]}>
                  <View style={[styles.legendDot, { backgroundColor: ring.color }]} />
                </View>
                <Text style={styles.legendLabel}>{ring.label}</Text>
                <Text style={[styles.legendPct, { color: ring.color }]}>
                  {Math.round(ring.pct * 100)}%
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── Daily Score & Consistency Banner ── */}
        <View style={styles.summaryBanner}>
          <View style={styles.summaryBannerLeft}>
            <Text style={styles.summaryScoreNum}>{score}</Text>
            <Text style={styles.summaryScoreLabel}>Daily Score</Text>
          </View>
          <View style={styles.summaryBannerDivider} />
          <View style={styles.summaryBannerRight}>
            <Text style={styles.summaryBannerTitle}>
              {score >= 90
                ? 'Outstanding Consistency! 🏆'
                : score >= 70
                ? 'Great Progress! Keep pushing 🔥'
                : score >= 40
                ? 'Good Start! Crush your goals 💪'
                : 'Day Underway! Log your habits ⚡'}
            </Text>
            <Text style={styles.summaryBannerSub}>
              {streak ? `${streak.current_streak} day workout streak active` : 'Consistency is key to gains'}
            </Text>
          </View>
        </View>

        {/* ── Section Header ── */}
        <SectionHeader title="Target Breakdowns" />

        {/* ── 4 Modern Elevated Metric Cards ── */}
        {rings.map(ring => (
          <View key={ring.key} style={[styles.modernMetricCard, { borderLeftColor: ring.color }]}>
            <View style={styles.metricCardHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={[styles.metricIconBox, { backgroundColor: ring.color + '1A', borderColor: ring.color + '44' }]}>
                  <Ionicons name={ring.icon as any} size={20} color={ring.color} />
                </View>
                <View style={{ marginLeft: 12 }}>
                  <Text style={styles.metricCardLabel}>{ring.label}</Text>
                  <Text style={styles.metricCardSub}>{ring.subText}</Text>
                </View>
              </View>

              <View style={[styles.metricPctPill, { backgroundColor: ring.color + '18', borderColor: ring.color + '40' }]}>
                <Text style={[styles.metricPctPillTxt, { color: ring.color }]}>
                  {Math.round(ring.pct * 100)}%
                </Text>
              </View>
            </View>

            {/* Values Row */}
            <View style={styles.metricCardValueRow}>
              <Text style={styles.metricCardValue}>{ring.valueStr}</Text>
              {ring.pct >= 1 && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Ionicons name="checkmark-circle" size={16} color={ring.color} />
                  <Text style={{ fontSize: 12, fontWeight: '800', color: ring.color }}>Done</Text>
                </View>
              )}
            </View>

            {/* Glowing Smooth Progress Bar */}
            <View style={styles.progressBarTrack}>
              <View
                style={[
                  styles.progressBarFill,
                  {
                    width: `${Math.round(Math.min(ring.pct, 1) * 100)}%`,
                    backgroundColor: ring.color,
                  },
                ]}
              />
            </View>
          </View>
        ))}

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(C: any, isDark: boolean) {
  return StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: C.bg,
    },
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
      backgroundColor: isDark ? '#132C1B' : '#D4F5DE',
      borderWidth: 1,
      borderColor: '#4ADE8055',
    },
    scorePillTxt: {
      fontSize: 13,
      fontWeight: '800',
      color: '#4ADE80',
    },
    scroll: {
      padding: 16,
      paddingBottom: 40,
    },

    // ── Samsung Health Heart Card ──
    heartCard: {
      backgroundColor: isDark ? '#0A0E18' : '#FFFFFF',
      borderRadius: 28,
      paddingVertical: 20,
      paddingHorizontal: 16,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255, 255, 255, 0.07)' : '#E2E8F0',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: isDark ? 0.6 : 0.08,
      shadowRadius: 20,
      elevation: 9,
      alignItems: 'center',
    },
    heartCardTop: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      width: '100%',
      paddingHorizontal: 4,
      marginBottom: 8,
    },
    heartCardTitle: {
      fontSize: 18,
      fontWeight: '900',
      color: C.text,
      letterSpacing: -0.3,
    },
    heartCardSubtitle: {
      fontSize: 12,
      fontWeight: '600',
      color: C.muted,
      marginTop: 2,
    },
    heartScoreBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 14,
      backgroundColor: isDark ? 'rgba(74, 222, 128, 0.12)' : 'rgba(74, 222, 128, 0.15)',
      borderWidth: 1,
      borderColor: 'rgba(74, 222, 128, 0.3)',
    },
    heartScoreBadgeTxt: {
      fontSize: 12,
      fontWeight: '800',
      color: '#4ADE80',
    },
    heartSvgContainer: {
      width: 250,
      height: 250,
      alignItems: 'center',
      justifyContent: 'center',
      marginVertical: 4,
    },
    heartLegendRow: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      width: '100%',
      paddingTop: 16,
      marginTop: 4,
      borderTopWidth: 1,
      borderTopColor: isDark ? 'rgba(255, 255, 255, 0.06)' : '#EDF2F7',
    },
    legendItem: {
      alignItems: 'center',
    },
    legendDotOuter: {
      width: 16,
      height: 16,
      borderRadius: 8,
      borderWidth: 1.5,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 5,
    },
    legendDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
    },
    legendLabel: {
      fontSize: 11,
      color: C.muted,
      fontWeight: '700',
    },
    legendPct: {
      fontSize: 13,
      fontWeight: '900',
      marginTop: 2,
    },

    // ── Summary Score Banner ──
    summaryBanner: {
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
      shadowOpacity: 0.1,
      shadowRadius: 6,
      elevation: 3,
    },
    summaryBannerLeft: {
      alignItems: 'center',
      paddingRight: 16,
    },
    summaryScoreNum: {
      fontSize: 32,
      fontWeight: '900',
      color: C.text,
      lineHeight: 36,
    },
    summaryScoreLabel: {
      fontSize: 10,
      fontWeight: '800',
      color: C.muted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginTop: 2,
    },
    summaryBannerDivider: {
      width: 1,
      height: 38,
      backgroundColor: C.border,
      marginRight: 16,
    },
    summaryBannerRight: {
      flex: 1,
    },
    summaryBannerTitle: {
      fontSize: 14,
      fontWeight: '800',
      color: C.text,
    },
    summaryBannerSub: {
      fontSize: 12,
      color: C.muted,
      fontWeight: '600',
      marginTop: 2,
    },

    // ── Modern Metric Card ──
    modernMetricCard: {
      backgroundColor: C.card,
      borderRadius: 18,
      padding: 16,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: C.border,
      borderLeftWidth: 4,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.08,
      shadowRadius: 6,
      elevation: 2,
    },
    metricCardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    metricIconBox: {
      width: 42,
      height: 42,
      borderRadius: 13,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
    },
    metricCardLabel: {
      fontSize: 15,
      fontWeight: '800',
      color: C.text,
    },
    metricCardSub: {
      fontSize: 12,
      color: C.muted,
      fontWeight: '500',
      marginTop: 1,
    },
    metricPctPill: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
      borderWidth: 1,
    },
    metricPctPillTxt: {
      fontSize: 12,
      fontWeight: '800',
    },
    metricCardValueRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 8,
    },
    metricCardValue: {
      fontSize: 16,
      fontWeight: '800',
      color: C.text,
    },
    progressBarTrack: {
      height: 8,
      borderRadius: 4,
      backgroundColor: isDark ? '#151C2C' : '#E2E8F0',
      overflow: 'hidden',
    },
    progressBarFill: {
      height: '100%',
      borderRadius: 4,
    },
  });
}
