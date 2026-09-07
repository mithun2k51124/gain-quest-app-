// components/OnboardingModal.tsx
// First-time onboarding modal — shows ONCE and never again.

import React, { useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  setOnboardingComplete,
  setSetting,
  updateGoals,
  logWeight,
} from '../db/database';
import { useTheme } from '../contexts/ThemeContext';

const { width } = Dimensions.get('window');

interface Props {
  visible: boolean;
  onComplete: () => void;
}

const TOTAL_STEPS = 2;

interface FieldProps {
  icon: any;
  label: string;
  placeholder: string;
  value: string;
  onChangeText: (t: string) => void;
  keyboardType?: 'default' | 'numeric' | 'email-address' | 'phone-pad' | 'number-pad' | 'decimal-pad';
  unit?: string;
  C: any;
}

function Field({
  icon,
  label,
  placeholder,
  value,
  onChangeText,
  keyboardType = 'default',
  unit,
  C,
}: FieldProps) {
  const styles = makeFieldStyles(C);
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.fieldRow}>
        <View style={styles.fieldIconBox}>
          <Ionicons name={icon} size={18} color={C.accent} />
        </View>
        <TextInput
          style={styles.fieldInput}
          placeholder={placeholder}
          placeholderTextColor={C.muted}
          value={value}
          onChangeText={onChangeText}
          keyboardType={keyboardType}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {unit ? <Text style={styles.fieldUnit}>{unit}</Text> : null}
      </View>
    </View>
  );
}

export default function OnboardingModal({ visible, onComplete }: Props) {
  const { C } = useTheme();
  const styles = makeStyles(C);
  const [step, setStep] = useState(0);

  // ── Step 0 – Profile ──────────────────────────────────────────────
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [bodyWeight, setBodyWeight] = useState('');

  // ── Step 1 – Goals ────────────────────────────────────────────────
  const [water, setWater] = useState('');
  const [protein, setProtein] = useState('');
  const [calories, setCalories] = useState('');
  const [weightGoal, setWeightGoal] = useState('');
  const [creatine, setCreatine] = useState('');

  // ── Animation ─────────────────────────────────────────────────────
  const slideAnim = useRef(new Animated.Value(0)).current;

  const goNext = () => {
    Animated.sequence([
      Animated.timing(slideAnim, { toValue: -30, duration: 120, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 180, useNativeDriver: true }),
    ]).start();
    setStep(s => s + 1);
  };

  const goBack = () => {
    Animated.sequence([
      Animated.timing(slideAnim, { toValue: 30, duration: 120, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 180, useNativeDriver: true }),
    ]).start();
    setStep(s => s - 1);
  };

  const handleSave = () => {
    // Persist profile
    if (name.trim()) setSetting('name', name.trim());
    if (age.trim()) setSetting('age', age.trim());
    if (bodyWeight.trim()) {
      setSetting('body_weight', bodyWeight.trim());
      const w = parseFloat(bodyWeight.trim());
      if (!isNaN(w) && w > 0) logWeight(w);
    }

    // Persist goals (default to 0 if blank)
    updateGoals({
      water_goal: parseFloat(water) || 0,
      protein_goal: parseFloat(protein) || 0,
      calorie_goal: parseInt(calories, 10) || 0,
      weight_goal: parseFloat(weightGoal) || 0,
      creatine_dose: parseFloat(creatine) || 0,
    });

    setOnboardingComplete();
    onComplete();
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      statusBarTranslucent
      onRequestClose={handleSave}
    >
      <View style={styles.overlay}>
        {/* ── Backdrop ────────────────────────────────────────────── */}
        <View style={styles.backdrop} pointerEvents="none" />

        <KeyboardAvoidingView
          style={styles.keyboardWrap}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {/* ── Card ────────────────────────────────────────────────── */}
          <Animated.View style={[styles.card, { transform: [{ translateX: slideAnim }] }]}>
            {/* Header */}
            <View style={styles.cardHeader}>
              <View style={styles.logoRow}>
                <Text style={styles.logoEmoji}>🏋️</Text>
                <Text style={styles.logoText}>GainQuest</Text>
              </View>
              <Text style={styles.welcomeTitle}>
                {step === 0 ? "Welcome! Let's get you set up" : 'Set Your Daily Goals'}
              </Text>
              <Text style={styles.welcomeSub}>
                {step === 0
                  ? 'Tell us a bit about yourself to personalise your experience.'
                  : 'Enter your targets — you can always change them in Settings.'}
              </Text>
            </View>

            {/* Step dots */}
            <View style={styles.dotsRow}>
              {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
                <View
                  key={i}
                  style={[styles.dot, i === step && styles.dotActive]}
                />
              ))}
            </View>

            {/* Content */}
            <ScrollView
              style={styles.scrollArea}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {step === 0 ? (
                // ── Step 0 — Profile ───────────────────────────────────
                <View>
                  <Field
                    C={C}
                    icon="person-outline"
                    label="Your Name"
                    placeholder="e.g. Alex"
                    value={name}
                    onChangeText={setName}
                  />
                  <Field
                    C={C}
                    icon="calendar-outline"
                    label="Age"
                    placeholder="e.g. 22"
                    value={age}
                    onChangeText={setAge}
                    keyboardType="number-pad"
                    unit="yrs"
                  />
                  <Field
                    C={C}
                    icon="scale-outline"
                    label="Current Body Weight"
                    placeholder="e.g. 75"
                    value={bodyWeight}
                    onChangeText={setBodyWeight}
                    keyboardType="decimal-pad"
                    unit="kg"
                  />
                </View>
              ) : (
                // ── Step 1 — Goals ─────────────────────────────────────
                <View>
                  <Field
                    C={C}
                    icon="water-outline"
                    label="Daily Water Goal"
                    placeholder="e.g. 3"
                    value={water}
                    onChangeText={setWater}
                    keyboardType="decimal-pad"
                    unit="L"
                  />
                  <Field
                    C={C}
                    icon="restaurant-outline"
                    label="Daily Protein Goal"
                    placeholder="e.g. 160"
                    value={protein}
                    onChangeText={setProtein}
                    keyboardType="number-pad"
                    unit="g"
                  />
                  <Field
                    C={C}
                    icon="flame-outline"
                    label="Daily Calorie Goal"
                    placeholder="e.g. 2800"
                    value={calories}
                    onChangeText={setCalories}
                    keyboardType="number-pad"
                    unit="kcal"
                  />
                  <Field
                    C={C}
                    icon="fitness-outline"
                    label="Target Body Weight"
                    placeholder="e.g. 80"
                    value={weightGoal}
                    onChangeText={setWeightGoal}
                    keyboardType="decimal-pad"
                    unit="kg"
                  />
                  <Field
                    C={C}
                    icon="flash-outline"
                    label="Creatine Dose"
                    placeholder="e.g. 5"
                    value={creatine}
                    onChangeText={setCreatine}
                    keyboardType="decimal-pad"
                    unit="g"
                  />
                </View>
              )}
            </ScrollView>

            {/* Footer buttons */}
            <View style={styles.footerRow}>
              {step > 0 ? (
                <TouchableOpacity style={styles.backBtn} onPress={goBack} activeOpacity={0.75}>
                  <Ionicons name="arrow-back-outline" size={18} color={C.accent} />
                  <Text style={styles.backBtnText}>Back</Text>
                </TouchableOpacity>
              ) : (
                <View style={{ flex: 1 }} />
              )}

              {step < TOTAL_STEPS - 1 ? (
                <TouchableOpacity style={styles.nextBtn} onPress={goNext} activeOpacity={0.8}>
                  <Text style={styles.nextBtnText}>Next</Text>
                  <Ionicons name="arrow-forward-outline" size={18} color="#fff" />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={styles.saveBtn} onPress={handleSave} activeOpacity={0.8}>
                  <Ionicons name="checkmark-done-outline" size={18} color="#fff" />
                  <Text style={styles.saveBtnText}>Let's Go!</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Skip link */}
            <TouchableOpacity onPress={handleSave} style={styles.skipWrap} activeOpacity={0.7}>
              <Text style={styles.skipText}>Skip for now — I'll set this up later</Text>
            </TouchableOpacity>
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function makeFieldStyles(C: any) {
  return StyleSheet.create({
    fieldWrap: {
      marginBottom: 14,
    },
    fieldLabel: {
      fontSize: 12,
      fontWeight: '700',
      color: C.textSub,
      marginBottom: 6,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    fieldRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: C.card || C.bg,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: C.border,
      shadowColor: C.shadowDark,
      shadowOffset: { width: 3, height: 3 },
      shadowOpacity: 0.6,
      shadowRadius: 6,
      elevation: 2,
      paddingRight: 12,
    },
    fieldIconBox: {
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    fieldInput: {
      flex: 1,
      fontSize: 15,
      color: C.text,
      height: 44,
      fontWeight: '600',
    },
    fieldUnit: {
      fontSize: 12,
      color: C.muted,
      fontWeight: '700',
      marginLeft: 4,
    },
  });
}

function makeStyles(C: any) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    backdrop: {
      ...StyleSheet.absoluteFill,
      backgroundColor: 'rgba(45, 55, 72, 0.55)',
    },
    keyboardWrap: {
      width: '100%',
      alignItems: 'center',
      justifyContent: 'center',
    },
    card: {
      width: Math.min(width - 40, 440),
      backgroundColor: C.bg,
      borderRadius: 28,
      overflow: 'hidden',
      shadowColor: C.shadowDark,
      shadowOffset: { width: 10, height: 10 },
      shadowOpacity: 1,
      shadowRadius: 20,
      elevation: 20,
      maxHeight: '90%',
    },

    // ── Header ──────────────────────────────────────────────────────
    cardHeader: {
      paddingHorizontal: 24,
      paddingTop: 24,
      paddingBottom: 14,
      backgroundColor: C.bg,
      borderBottomWidth: 1,
      borderBottomColor: C.border,
    },
    logoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 12,
    },
    logoEmoji: { fontSize: 26, marginRight: 8 },
    logoText: {
      fontSize: 20,
      fontWeight: '900',
      color: C.accent,
      letterSpacing: -0.5,
    },
    welcomeTitle: {
      fontSize: 17,
      fontWeight: '800',
      color: C.text,
      marginBottom: 4,
    },
    welcomeSub: {
      fontSize: 12,
      color: C.muted,
      lineHeight: 18,
    },

    // ── Step dots ────────────────────────────────────────────────────
    dotsRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 12,
      backgroundColor: C.bg,
    },
    dot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: C.border,
    },
    dotActive: {
      backgroundColor: C.accent,
      width: 22,
    },

    // ── Scroll content ───────────────────────────────────────────────
    scrollArea: {
      maxHeight: 320,
    },
    scrollContent: {
      paddingHorizontal: 24,
      paddingBottom: 8,
    },

    // ── Footer ───────────────────────────────────────────────────────
    footerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 24,
      paddingTop: 14,
      paddingBottom: 8,
      borderTopWidth: 1,
      borderTopColor: C.border,
      backgroundColor: C.bg,
    },
    backBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: C.border,
      flex: 1,
      justifyContent: 'center',
    },
    backBtnText: {
      color: C.accent,
      fontWeight: '700',
      fontSize: 14,
    },
    nextBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: C.accent,
      paddingVertical: 13,
      paddingHorizontal: 24,
      borderRadius: 12,
      flex: 1,
      justifyContent: 'center',
      shadowColor: C.accent,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 6,
    },
    nextBtnText: {
      color: '#fff',
      fontWeight: '800',
      fontSize: 14,
    },
    saveBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: C.green,
      paddingVertical: 13,
      paddingHorizontal: 24,
      borderRadius: 12,
      flex: 1,
      justifyContent: 'center',
      shadowColor: C.green,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 6,
    },
    saveBtnText: {
      color: '#fff',
      fontWeight: '800',
      fontSize: 14,
    },

    // ── Skip link ────────────────────────────────────────────────────
    skipWrap: {
      alignItems: 'center',
      paddingVertical: 12,
      backgroundColor: C.bg,
    },
    skipText: {
      fontSize: 12,
      color: C.muted,
      textDecorationLine: 'underline',
    },
  });
}
