// components/AIWorkoutLogger.tsx
// All-in-one AI Fitness Assistant: Workouts, Nutrition, & Fitness Q&A
// Inspired by Siri / Bixby aesthetic: glowing fluid visualizer, zero-beep listening, single-tap activation.

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Modal, StyleSheet,
  Animated, Dimensions, Platform, ScrollView, KeyboardAvoidingView,
  Easing,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { ParsedExercise } from '../utils/workoutParser';
import {
  queryFitnessAI,
  ParsedFoodItem,
  setGeminiApiKey,
} from '../utils/geminiParser';
import {
  createWorkoutSession, logExercise,
  updateDailyLog, updateStreak, todayStr, getSetting,
  addFood,
} from '../db/database';

const { height: SH, width: SW } = Dimensions.get('window');

// ── Safe lazy loader for expo-speech-recognition ─────────────────────────────
let SpeechModule: any = null;
let useSpeechEvent: any = null;
try {
  const mod = require('expo-speech-recognition');
  SpeechModule = mod.ExpoSpeechRecognitionModule;
  useSpeechEvent = mod.useSpeechRecognitionEvent;
} catch {
  SpeechModule = null;
  useSpeechEvent = null;
}

const VOICE_AVAILABLE = !!SpeechModule;

interface AIWorkoutLoggerProps {
  onLogged?: () => void;
}

type Phase =
  | 'idle'
  | 'listening'
  | 'processing'
  | 'confirm_workout'
  | 'confirm_nutrition'
  | 'chat'
  | 'success';

function useSafeVoiceEvent(event: string, cb: (e: any) => void) {
  if (useSpeechEvent) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useSpeechEvent(event, cb);
  }
}

export default function AIWorkoutLogger({ onLogged }: AIWorkoutLoggerProps) {
  const { C, isDark } = useTheme();
  const [visible, setVisible]                 = useState(false);
  const [phase, setPhase]                     = useState<Phase>('idle');
  const [transcript, setTranscript]           = useState('');
  const [inputText, setInputText]             = useState('');
  const [chatFollowup, setChatFollowup]       = useState('');
  const [isVoiceMode, setIsVoiceMode]         = useState(VOICE_AVAILABLE);
  const [hasPermission, setHasPermission]     = useState(false);
  const [parseError, setParseError]           = useState('');

  // Results state
  const [workoutExercises, setWorkoutExercises] = useState<ParsedExercise[]>([]);
  const [nutritionItems, setNutritionItems]   = useState<ParsedFoodItem[]>([]);
  const [chatMessage, setChatMessage]         = useState<{ answer: string; topic?: string } | null>(null);
  const [successInfo, setSuccessInfo]         = useState<{ title: string; subtitle: string }>({ title: '', subtitle: '' });

  // ── Animation refs ─────────────────────────────────────────────────────────
  const fadeAnim        = useRef(new Animated.Value(0)).current;
  const slideAnim       = useRef(new Animated.Value(SH)).current;
  const fabScale        = useRef(new Animated.Value(1)).current;
  const volumeAnim      = useRef(new Animated.Value(0.2)).current;
  const siriBreath      = useRef(new Animated.Value(1)).current;
  const siriRotate      = useRef(new Animated.Value(0)).current;
  const processingRing  = useRef(new Animated.Value(0)).current;
  const processingPulse = useRef(new Animated.Value(1)).current;
  const successScale    = useRef(new Animated.Value(0)).current;
  const successOpacity  = useRef(new Animated.Value(0)).current;
  const inputRef        = useRef<TextInput>(null);

  // ── Load Gemini API key from db on mount ───────────────────────────────────
  useEffect(() => {
    const key = getSetting('gemini_api_key', '');
    if (key) setGeminiApiKey(key);
  }, []);

  // Eager microphone permission check
  useEffect(() => {
    if (!VOICE_AVAILABLE) return;
    (async () => {
      try {
        const existing = await SpeechModule.getPermissionsAsync();
        if (existing.granted) {
          setHasPermission(true);
        } else if (existing.canAskAgain !== false) {
          const { granted } = await SpeechModule.requestPermissionsAsync();
          setHasPermission(granted);
        }
      } catch {
        try {
          const { granted } = await SpeechModule.requestPermissionsAsync();
          setHasPermission(granted);
        } catch {
          setHasPermission(false);
        }
      }
    })();
  }, []);

  // ── Voice events ────────────────────────────────────────────────────────────
  useSafeVoiceEvent('result', (e: any) => {
    const t = e.results?.[0]?.transcript || '';
    setTranscript(t);
    setInputText(t);
  });

  useSafeVoiceEvent('volumechange', (e: any) => {
    const val = typeof e.value === 'number' ? e.value : 0;
    // Map volume (-2 to 10) to 0.2 .. 1.2
    const normalized = Math.max(0.2, Math.min(1.2, 0.2 + (val + 2) / 8));
    Animated.spring(volumeAnim, {
      toValue: normalized,
      tension: 140,
      friction: 6,
      useNativeDriver: true,
    }).start();
  });

  useSafeVoiceEvent('end', () => {
    if (phase === 'listening') {
      setTimeout(() => {
        const text = transcript || inputText;
        if (text.trim()) {
          processInput(text);
        } else {
          setPhase('idle');
        }
      }, 400);
    }
  });

  useSafeVoiceEvent('error', () => {
    if (phase === 'listening') {
      const text = transcript || inputText;
      if (text.trim()) {
        processInput(text);
      } else {
        setPhase('idle');
      }
    }
  });

  // ── Siri/Bixby dynamic pulsing and rotating aura ────────────────────────────
  useEffect(() => {
    if (phase === 'listening') {
      // Fluid breathing loop
      const breathAnim = Animated.loop(
        Animated.sequence([
          Animated.timing(siriBreath, {
            toValue: 1.14,
            duration: 1100,
            useNativeDriver: true,
            easing: Easing.inOut(Easing.sin),
          }),
          Animated.timing(siriBreath, {
            toValue: 0.94,
            duration: 1100,
            useNativeDriver: true,
            easing: Easing.inOut(Easing.sin),
          }),
        ])
      );
      // Gentle aura rotation
      siriRotate.setValue(0);
      const rotateAnim = Animated.loop(
        Animated.timing(siriRotate, {
          toValue: 1,
          duration: 6000,
          useNativeDriver: true,
          easing: Easing.linear,
        })
      );
      breathAnim.start();
      rotateAnim.start();
      return () => {
        breathAnim.stop();
        rotateAnim.stop();
      };
    } else {
      Animated.spring(siriBreath, { toValue: 1, useNativeDriver: true }).start();
      Animated.spring(volumeAnim, { toValue: 0.2, useNativeDriver: true }).start();
    }
  }, [phase]);

  // ── Processing animation ────────────────────────────────────────────────────
  useEffect(() => {
    if (phase === 'processing') {
      processingRing.setValue(0);
      const ringLoop = Animated.loop(
        Animated.timing(processingRing, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
          easing: Easing.linear,
        })
      );
      const pulseLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(processingPulse, { toValue: 1.15, duration: 600, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
          Animated.timing(processingPulse, { toValue: 0.9, duration: 600, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
        ])
      );
      ringLoop.start();
      pulseLoop.start();
      return () => {
        ringLoop.stop();
        pulseLoop.stop();
      };
    } else {
      processingRing.setValue(0);
      processingPulse.setValue(1);
    }
  }, [phase]);

  // ── Success animation ────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase === 'success') {
      successScale.setValue(0);
      successOpacity.setValue(0);
      Animated.parallel([
        Animated.spring(successScale, { toValue: 1, useNativeDriver: true, tension: 90, friction: 6 }),
        Animated.timing(successOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
    }
  }, [phase]);

  // ── Modal open / close ───────────────────────────────────────────────────────
  const openOverlay = async () => {
    setVisible(true);
    setPhase('idle');
    setTranscript('');
    setInputText('');
    setChatFollowup('');
    setWorkoutExercises([]);
    setNutritionItems([]);
    setChatMessage(null);
    setParseError('');

    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 240,
        useNativeDriver: true,
        easing: Easing.out(Easing.ease),
      }),
      Animated.spring(slideAnim, {
        toValue: 0,
        tension: 65,
        friction: 11,
        useNativeDriver: true,
      }),
    ]).start();

    if (VOICE_AVAILABLE && !hasPermission) {
      try {
        const { granted } = await SpeechModule.requestPermissionsAsync();
        setHasPermission(granted);
      } catch {}
    }
  };

  const closeOverlay = useCallback(() => {
    stopListening();
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
        easing: Easing.in(Easing.ease),
      }),
      Animated.timing(slideAnim, {
        toValue: SH,
        duration: 240,
        useNativeDriver: true,
        easing: Easing.bezier(0.3, 0.05, 0.8, 0.4),
      }),
    ]).start(() => {
      setVisible(false);
      setPhase('idle');
    });
  }, []);

  // ── Voice control: Single-Tap & Silent Mute ─────────────────────────────────
  const startListening = async () => {
    if (!VOICE_AVAILABLE) {
      setIsVoiceMode(false);
      return;
    }

    if (!hasPermission) {
      try {
        const { granted } = await SpeechModule.requestPermissionsAsync();
        setHasPermission(granted);
        if (!granted) return;
      } catch {
        return;
      }
    }

    setTranscript('');
    setInputText('');
    setParseError('');
    setPhase('listening');

    try {
      // continuous: true & recordingOptions.persist: true mute the Android hardware beep sound!
      SpeechModule.start({
        lang: 'en-US',
        interimResults: true,
        continuous: true,
        recordingOptions: {
          persist: true,
        },
        androidIntentOptions: {
          EXTRA_LANGUAGE_MODEL: 'web_search',
        },
        volumeChangeEventOptions: {
          enabled: true,
          intervalMillis: 40,
        },
      });
    } catch {
      try {
        SpeechModule.start({
          lang: 'en-US',
          interimResults: true,
          continuous: false,
        });
      } catch {
        setPhase('idle');
      }
    }
  };

  const stopListening = () => {
    if (!VOICE_AVAILABLE) return;
    try {
      SpeechModule.stop();
    } catch {}
  };

  const handleMicPress = () => {
    if (phase === 'listening') {
      stopListening();
      const text = transcript.trim() || inputText.trim();
      if (text) {
        processInput(text);
      } else {
        setPhase('idle');
      }
    } else {
      startListening();
    }
  };

  // ── Unified AI Processing ───────────────────────────────────────────────────
  const processInput = async (text: string) => {
    const raw = text.trim();
    if (!raw) return;

    setPhase('processing');
    setParseError('');

    try {
      const result = await queryFitnessAI(raw);

      if (result.intent === 'workout') {
        if (result.exercises.length > 0) {
          setWorkoutExercises(result.exercises);
          setPhase('confirm_workout');
          return;
        }
      } else if (result.intent === 'nutrition') {
        if (result.items.length > 0) {
          setNutritionItems(result.items);
          setPhase('confirm_nutrition');
          return;
        }
      } else if (result.intent === 'chat') {
        setChatMessage({
          answer: result.answer,
          topic: result.topic || 'Fitness AI',
        });
        setPhase('chat');
        return;
      }

      // Default fallback
      setChatMessage({
        answer: "I processed your request, but could not determine workout or nutrition data. How else can I help?",
        topic: 'GainQuest AI',
      });
      setPhase('chat');
    } catch (err: any) {
      setParseError('Failed to process. Please try again or type directly.');
      setPhase('idle');
    }
  };

  // ── Commit Workout ──────────────────────────────────────────────────────────
  const commitWorkout = () => {
    const today = todayStr();
    const muscleGroups = [...new Set(workoutExercises.map(p => p.muscleGroup))].join(',');
    const sessionId = createWorkoutSession(today, muscleGroups, 'Logged via AI');
    for (const ex of workoutExercises) {
      logExercise(sessionId, today, ex.exercise, ex.muscleGroup, ex.sets, ex.reps, ex.weight, ex.unit);
    }
    updateDailyLog(today, { workout_completed: 1 });
    updateStreak();
    setSuccessInfo({
      title: 'Workout Logged! 💪',
      subtitle: `${workoutExercises.length} exercise${workoutExercises.length > 1 ? 's' : ''} saved to Workouts & PRs.`,
    });
    setPhase('success');
    onLogged?.();
    setTimeout(() => closeOverlay(), 2100);
  };

  // ── Commit Nutrition ────────────────────────────────────────────────────────
  const commitNutrition = () => {
    const today = todayStr();
    for (const item of nutritionItems) {
      if (item.food_name.trim()) {
        addFood(item.food_name.trim(), item.protein, item.calories, today);
      }
    }
    setSuccessInfo({
      title: 'Saved to Nutrition! 🥗',
      subtitle: `${nutritionItems.length} food item${nutritionItems.length > 1 ? 's' : ''} added to your daily tracker.`,
    });
    setPhase('success');
    onLogged?.();
    setTimeout(() => closeOverlay(), 2100);
  };

  const updateWorkoutField = (index: number, field: keyof ParsedExercise, value: any) => {
    setWorkoutExercises(prev => prev.map((item, idx) => idx === index ? { ...item, [field]: value } : item));
  };

  const removeWorkoutExercise = (index: number) => {
    const next = workoutExercises.filter((_, idx) => idx !== index);
    if (next.length === 0) setPhase('idle');
    else setWorkoutExercises(next);
  };

  const updateNutritionField = (index: number, field: keyof ParsedFoodItem, value: any) => {
    setNutritionItems(prev => prev.map((item, idx) => idx === index ? { ...item, [field]: value } : item));
  };

  const removeNutritionItem = (index: number) => {
    const next = nutritionItems.filter((_, idx) => idx !== index);
    if (next.length === 0) setPhase('idle');
    else setNutritionItems(next);
  };

  const addNutritionRow = () => {
    setNutritionItems(prev => [...prev, { food_name: 'New Food', protein: 0, calories: 0 }]);
  };

  const s = makeStyles(C, isDark);

  const ringRotate = processingRing.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const auraRotate = siriRotate.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  // Dynamic Siri Orb scale based on volume + breathing
  const siriCombinedScale = Animated.multiply(siriBreath, volumeAnim);

  return (
    <>
      {/* ── Global Floating Assistant Button ── */}
      <Animated.View style={[s.fabWrapper, { transform: [{ scale: fabScale }] }]}>
        <TouchableOpacity
          style={s.fab}
          onPress={openOverlay}
          onPressIn={() => Animated.spring(fabScale, { toValue: 0.92, useNativeDriver: true }).start()}
          onPressOut={() => Animated.spring(fabScale, { toValue: 1, useNativeDriver: true }).start()}
          activeOpacity={1}
        >
          <View style={s.fabInner}>
            <Ionicons name="sparkles" size={17} color="#fff" />
            <Text style={s.fabLabel}>AI Assistant</Text>
          </View>
        </TouchableOpacity>
      </Animated.View>

      {/* ── Modal Pop-up ── */}
      <Modal
        visible={visible}
        transparent
        animationType="none"
        onRequestClose={closeOverlay}
        statusBarTranslucent
      >
        <Animated.View style={[s.backdrop, { opacity: fadeAnim }]}>
          <BlurView intensity={isDark ? 55 : 35} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={closeOverlay} />
        </Animated.View>

        <Animated.View style={[s.sheet, { transform: [{ translateY: slideAnim }] }]}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>

            {/* Top Sheet Drag Handle */}
            <View style={s.handle} />

            {/* Header */}
            <View style={s.sheetHeader}>
              <View style={s.headerLeft}>
                <View style={s.headerIcon}>
                  <Ionicons name="sparkles" size={18} color={C.accent} />
                </View>
                <View>
                  <Text style={s.sheetTitle}>GainQuest AI</Text>
                  <Text style={s.sheetSub}>Workouts • Nutrition • Fitness Coach</Text>
                </View>
              </View>
              <TouchableOpacity onPress={closeOverlay} style={s.closeBtn}>
                <Ionicons name="close" size={20} color={C.muted} />
              </TouchableOpacity>
            </View>

            {/* ── IDLE / LISTENING ── */}
            {(phase === 'idle' || phase === 'listening') && (
              <View style={s.body}>

                {/* Mode Selector */}
                {VOICE_AVAILABLE && (
                  <View style={s.modeToggle}>
                    <TouchableOpacity
                      style={[s.modeBtn, isVoiceMode && s.modeBtnActive]}
                      onPress={() => {
                        setIsVoiceMode(true);
                        stopListening();
                        setPhase('idle');
                      }}
                    >
                      <Ionicons name="mic" size={15} color={isVoiceMode ? '#fff' : C.muted} />
                      <Text style={[s.modeTxt, isVoiceMode && { color: '#fff' }]}>Voice</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[s.modeBtn, !isVoiceMode && s.modeBtnActive]}
                      onPress={() => {
                        setIsVoiceMode(false);
                        stopListening();
                        setPhase('idle');
                        setTimeout(() => inputRef.current?.focus(), 150);
                      }}
                    >
                      <Ionicons name="chatbox-ellipses" size={15} color={!isVoiceMode ? '#fff' : C.muted} />
                      <Text style={[s.modeTxt, !isVoiceMode && { color: '#fff' }]}>Text / Ask</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* ── Siri/Bixby Voice Mode ── */}
                {isVoiceMode && VOICE_AVAILABLE && (
                  <View style={s.voiceContainer}>
                    <View style={s.siriOrbContainer}>

                      {/* Siri Outer Radiant Aura */}
                      {phase === 'listening' && (
                        <Animated.View
                          style={[
                            s.siriAuraOuter,
                            {
                              transform: [{ rotate: auraRotate }, { scale: siriCombinedScale }],
                            },
                          ]}
                        />
                      )}

                      {/* Siri Middle Cyan / Violet Ring */}
                      {phase === 'listening' && (
                        <Animated.View
                          style={[
                            s.siriAuraMid,
                            {
                              transform: [{ scale: volumeAnim }],
                            },
                          ]}
                        />
                      )}

                      {/* Main Mic Button Orb (Single tap activates/stops immediately) */}
                      <Animated.View style={{ transform: [{ scale: phase === 'listening' ? siriBreath : 1 }] }}>
                        <TouchableOpacity
                          style={[s.siriOrb, phase === 'listening' && s.siriOrbListening]}
                          onPress={handleMicPress}
                          activeOpacity={0.88}
                        >
                          <Ionicons
                            name={phase === 'listening' ? 'stop' : 'mic'}
                            size={34}
                            color="#fff"
                          />
                        </TouchableOpacity>
                      </Animated.View>
                    </View>

                    {/* Fluid Voice Spectrum Waves */}
                    {phase === 'listening' ? (
                      <SiriWaves volumeAnim={volumeAnim} C={C} />
                    ) : null}

                    {/* Prompt status */}
                    <Text style={s.statusHint}>
                      {phase === 'listening'
                        ? 'Listening… tap ■ or speak to finish'
                        : 'Single tap mic to speak your workout, food, or question'}
                    </Text>

                    {/* Live Transcript Display */}
                    {(transcript || inputText) ? (
                      <View style={s.transcriptBox}>
                        <Ionicons name="chatbubble-ellipses-outline" size={16} color={C.accent} style={{ marginTop: 2 }} />
                        <Text style={s.transcriptTxt}>"{transcript || inputText}"</Text>
                      </View>
                    ) : null}

                    {parseError ? (
                      <View style={s.errorBox}>
                        <Ionicons name="alert-circle-outline" size={15} color={C.red} />
                        <Text style={s.errorTxt}>{parseError}</Text>
                      </View>
                    ) : null}

                    {/* Quick Suggestion Chips */}
                    <View style={s.quickChipWrap}>
                      <Text style={s.chipHeader}>TRY SAYING:</Text>
                      <View style={s.chipsRow}>
                        <TouchableOpacity
                          style={s.chipPill}
                          onPress={() => {
                            const val = 'bench press 100kg 3 sets 8 reps';
                            setInputText(val);
                            processInput(val);
                          }}
                        >
                          <Ionicons name="barbell-outline" size={12} color={C.accent} />
                          <Text style={s.chipTxt}>"bench press 100kg 3x8"</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={s.chipPill}
                          onPress={() => {
                            const val = 'I ate 3 eggs and a bowl of oatmeal';
                            setInputText(val);
                            processInput(val);
                          }}
                        >
                          <Ionicons name="restaurant-outline" size={12} color={C.protein} />
                          <Text style={[s.chipTxt, { color: C.protein }]}>"ate 3 eggs & oatmeal"</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={s.chipPill}
                          onPress={() => {
                            const val = 'How much rest between bench press sets?';
                            setInputText(val);
                            processInput(val);
                          }}
                        >
                          <Ionicons name="help-circle-outline" size={12} color={C.yellow} />
                          <Text style={[s.chipTxt, { color: C.yellow }]}>"how much rest between sets?"</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                )}

                {/* ── Text / Type Mode ── */}
                {(!isVoiceMode || !VOICE_AVAILABLE) && (
                  <View style={s.typeArea}>
                    <View style={s.inputWrapper}>
                      <Ionicons name="chatbubble-outline" size={16} color={C.muted} style={{ marginTop: 2 }} />
                      <TextInput
                        ref={inputRef}
                        style={s.textInput}
                        placeholder='Log workout ("bench press 100kg 3x8"), log food ("ate 200g chicken & rice"), or ask any fitness question...'
                        placeholderTextColor={C.muted}
                        value={inputText}
                        onChangeText={setInputText}
                        multiline
                        autoFocus={!VOICE_AVAILABLE}
                        onSubmitEditing={() => {
                          if (inputText.trim()) processInput(inputText);
                        }}
                      />
                    </View>

                    {parseError ? (
                      <View style={s.errorBox}>
                        <Ionicons name="alert-circle-outline" size={15} color={C.red} />
                        <Text style={s.errorTxt}>{parseError}</Text>
                      </View>
                    ) : null}

                    <TouchableOpacity
                      style={[s.submitBtn, !inputText.trim() && { opacity: 0.4 }]}
                      onPress={() => {
                        if (inputText.trim()) processInput(inputText);
                      }}
                      disabled={!inputText.trim()}
                      activeOpacity={0.85}
                    >
                      <Ionicons name="sparkles" size={18} color="#fff" />
                      <Text style={s.submitTxt}>Send to AI</Text>
                    </TouchableOpacity>

                    {/* Horizontal scroll pills */}
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingTop: 14 }}>
                      {[
                        { label: 'bench press 100kg 3x8', icon: 'barbell-outline', color: C.accent },
                        { label: 'ate 200g chicken & rice', icon: 'restaurant-outline', color: C.protein },
                        { label: 'how to improve bench press?', icon: 'help-circle-outline', color: C.yellow },
                        { label: 'squats 120kg 4 sets 6 reps', icon: 'barbell-outline', color: C.accent },
                        { label: 'protein shake with 30g protein', icon: 'nutrition-outline', color: C.calories },
                      ].map((item, idx) => (
                        <TouchableOpacity
                          key={idx}
                          style={s.hintPill}
                          onPress={() => {
                            setInputText(item.label);
                            processInput(item.label);
                          }}
                        >
                          <Ionicons name={item.icon as any} size={12} color={item.color} />
                          <Text style={[s.hintTxt, { color: item.color }]}>{item.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}
              </View>
            )}

            {/* ── PROCESSING ── */}
            {phase === 'processing' && (
              <View style={[s.body, { alignItems: 'center', paddingVertical: 44 }]}>
                <Animated.View style={[s.processingOuter, { transform: [{ scale: processingPulse }] }]}>
                  <Animated.View style={[s.processingArc, { transform: [{ rotate: ringRotate }] }]} />
                  <View style={s.processingInner}>
                    <Ionicons name="sparkles" size={26} color={C.accent} />
                  </View>
                </Animated.View>
                <Text style={[s.processingTitle, { marginTop: 20 }]}>AI is Thinking…</Text>
                <Text style={s.processingSubtitle}>Analyzing your workout, nutrition, or query</Text>
              </View>
            )}

            {/* ── CONFIRM WORKOUT ── */}
            {phase === 'confirm_workout' && (
              <View style={s.body}>
                <View style={s.confirmHeader}>
                  <View style={s.confirmIconWrap}>
                    <Ionicons name="barbell" size={18} color={C.accent} />
                  </View>
                  <Text style={s.confirmTitle}>
                    Logged Workout ({workoutExercises.length} exercise{workoutExercises.length > 1 ? 's' : ''}):
                  </Text>
                </View>

                <ScrollView style={{ maxHeight: 290 }} showsVerticalScrollIndicator={false}>
                  {workoutExercises.map((ex, i) => (
                    <View key={i} style={s.itemCard}>
                      <View style={s.itemCardTop}>
                        <View style={s.exIconWrap}>
                          <Ionicons name="barbell-outline" size={18} color={C.accent} />
                        </View>
                        <Text style={s.itemName} numberOfLines={1}>{ex.exercise}</Text>
                        <Text style={s.itemBadge}>{ex.muscleGroup}</Text>
                        <TouchableOpacity onPress={() => removeWorkoutExercise(i)} style={{ padding: 4 }}>
                          <Ionicons name="trash-outline" size={16} color={C.red} />
                        </TouchableOpacity>
                      </View>
                      <View style={s.fieldsRow}>
                        <View style={s.fieldBox}>
                          <Text style={s.fieldLbl}>SETS</Text>
                          <TextInput
                            style={s.fieldInput}
                            value={String(ex.sets)}
                            onChangeText={v => updateWorkoutField(i, 'sets', parseInt(v) || 0)}
                            keyboardType="numeric"
                          />
                        </View>
                        <View style={s.fieldBox}>
                          <Text style={s.fieldLbl}>REPS</Text>
                          <TextInput
                            style={s.fieldInput}
                            value={String(ex.reps)}
                            onChangeText={v => updateWorkoutField(i, 'reps', parseInt(v) || 0)}
                            keyboardType="numeric"
                          />
                        </View>
                        <View style={s.fieldBox}>
                          <Text style={s.fieldLbl}>WEIGHT</Text>
                          <TextInput
                            style={s.fieldInput}
                            value={String(ex.weight)}
                            onChangeText={v => updateWorkoutField(i, 'weight', parseFloat(v) || 0)}
                            keyboardType="decimal-pad"
                          />
                        </View>
                        <TouchableOpacity
                          style={[s.unitToggle, ex.unit === 'kg' && s.unitActive]}
                          onPress={() => updateWorkoutField(i, 'unit', ex.unit === 'kg' ? 'lbs' : 'kg')}
                        >
                          <Text style={[s.unitTxt, ex.unit === 'kg' && { color: C.accent }]}>{ex.unit}</Text>
                        </TouchableOpacity>
                      </View>
                      {ex.weight > 0 && (
                        <View style={s.e1rmRow}>
                          <Ionicons name="trophy-outline" size={12} color={C.yellow} />
                          <Text style={s.e1rmTxt}>e1RM ≈ {(ex.weight * (1 + ex.reps / 30)).toFixed(1)} {ex.unit}</Text>
                        </View>
                      )}
                    </View>
                  ))}
                </ScrollView>

                <TouchableOpacity style={s.confirmBtn} onPress={commitWorkout} activeOpacity={0.85}>
                  <Ionicons name="checkmark-circle" size={20} color="#fff" />
                  <Text style={s.confirmBtnTxt}>Save to Workout & PRs</Text>
                </TouchableOpacity>

                <TouchableOpacity onPress={() => setPhase('idle')} style={s.cancelLink}>
                  <Text style={s.cancelTxt}>Start over</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* ── CONFIRM NUTRITION ── */}
            {phase === 'confirm_nutrition' && (
              <View style={s.body}>
                <View style={s.confirmHeader}>
                  <View style={[s.confirmIconWrap, { backgroundColor: C.protein + '22' }]}>
                    <Ionicons name="restaurant" size={18} color={C.protein} />
                  </View>
                  <Text style={s.confirmTitle}>
                    Logged Nutrition ({nutritionItems.length} item{nutritionItems.length > 1 ? 's' : ''}):
                  </Text>
                  <TouchableOpacity onPress={addNutritionRow} style={s.addSmallBtn}>
                    <Ionicons name="add" size={16} color={C.accent} />
                    <Text style={s.addSmallTxt}>Add</Text>
                  </TouchableOpacity>
                </View>

                {/* Macro Summary Header */}
                <View style={s.macroSummaryBar}>
                  <View style={s.macroCol}>
                    <Text style={s.macroNum}>
                      {nutritionItems.reduce((acc, c) => acc + (Number(c.protein) || 0), 0)}g
                    </Text>
                    <Text style={s.macroLbl}>PROTEIN</Text>
                  </View>
                  <View style={s.macroDivider} />
                  <View style={s.macroCol}>
                    <Text style={[s.macroNum, { color: C.calories }]}>
                      {nutritionItems.reduce((acc, c) => acc + (Number(c.calories) || 0), 0)}
                    </Text>
                    <Text style={s.macroLbl}>KCAL</Text>
                  </View>
                </View>

                <ScrollView style={{ maxHeight: 260 }} showsVerticalScrollIndicator={false}>
                  {nutritionItems.map((food, i) => (
                    <View key={i} style={s.itemCard}>
                      <View style={s.itemCardTop}>
                        <View style={[s.exIconWrap, { backgroundColor: C.calories + '22' }]}>
                          <Ionicons name="nutrition-outline" size={18} color={C.calories} />
                        </View>
                        <TextInput
                          style={[s.itemName, { borderBottomWidth: 1, borderBottomColor: C.border, paddingBottom: 2 }]}
                          value={food.food_name}
                          onChangeText={v => updateNutritionField(i, 'food_name', v)}
                          placeholder="Food name"
                          placeholderTextColor={C.muted}
                        />
                        <TouchableOpacity onPress={() => removeNutritionItem(i)} style={{ padding: 4 }}>
                          <Ionicons name="trash-outline" size={16} color={C.red} />
                        </TouchableOpacity>
                      </View>

                      <View style={s.fieldsRow}>
                        <View style={s.fieldBox}>
                          <Text style={s.fieldLbl}>PROTEIN (g)</Text>
                          <TextInput
                            style={s.fieldInput}
                            value={String(food.protein)}
                            onChangeText={v => updateNutritionField(i, 'protein', parseInt(v) || 0)}
                            keyboardType="numeric"
                          />
                        </View>
                        <View style={s.fieldBox}>
                          <Text style={s.fieldLbl}>CALORIES (kcal)</Text>
                          <TextInput
                            style={s.fieldInput}
                            value={String(food.calories)}
                            onChangeText={v => updateNutritionField(i, 'calories', parseInt(v) || 0)}
                            keyboardType="numeric"
                          />
                        </View>
                      </View>
                    </View>
                  ))}
                </ScrollView>

                <TouchableOpacity style={[s.confirmBtn, { backgroundColor: C.calories }]} onPress={commitNutrition} activeOpacity={0.85}>
                  <Ionicons name="checkmark-circle" size={20} color="#fff" />
                  <Text style={s.confirmBtnTxt}>Save to Nutrition Section</Text>
                </TouchableOpacity>

                <TouchableOpacity onPress={() => setPhase('idle')} style={s.cancelLink}>
                  <Text style={s.cancelTxt}>Start over</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* ── CHATBOT VIEW ── */}
            {phase === 'chat' && chatMessage && (
              <View style={s.body}>
                <View style={s.chatHeader}>
                  <View style={s.chatBadge}>
                    <Ionicons name="bulb-outline" size={14} color={C.yellow} />
                    <Text style={s.chatBadgeTxt}>{chatMessage.topic || 'Fitness Advice'}</Text>
                  </View>
                  <TouchableOpacity onPress={() => setPhase('idle')} style={s.chatResetBtn}>
                    <Ionicons name="refresh-outline" size={16} color={C.muted} />
                    <Text style={s.chatResetTxt}>New Query</Text>
                  </TouchableOpacity>
                </View>

                {/* AI Answer Bubble */}
                <ScrollView style={{ maxHeight: 280 }} showsVerticalScrollIndicator={false}>
                  <View style={s.chatCard}>
                    <Text style={s.chatAnswerTxt}>{chatMessage.answer}</Text>
                  </View>
                </ScrollView>

                {/* Follow-up input row */}
                <View style={s.followupRow}>
                  <TextInput
                    style={s.followupInput}
                    placeholder="Ask a follow-up question..."
                    placeholderTextColor={C.muted}
                    value={chatFollowup}
                    onChangeText={setChatFollowup}
                    onSubmitEditing={() => {
                      if (chatFollowup.trim()) {
                        processInput(chatFollowup);
                        setChatFollowup('');
                      }
                    }}
                  />
                  <TouchableOpacity
                    style={[s.followupSendBtn, !chatFollowup.trim() && { opacity: 0.4 }]}
                    onPress={() => {
                      if (chatFollowup.trim()) {
                        processInput(chatFollowup);
                        setChatFollowup('');
                      }
                    }}
                    disabled={!chatFollowup.trim()}
                  >
                    <Ionicons name="send" size={16} color="#fff" />
                  </TouchableOpacity>
                </View>

                {/* Return to voice button */}
                {VOICE_AVAILABLE && (
                  <TouchableOpacity
                    style={s.voiceFollowupBtn}
                    onPress={() => {
                      setPhase('listening');
                      startListening();
                    }}
                  >
                    <Ionicons name="mic-outline" size={16} color={C.accent} />
                    <Text style={s.voiceFollowupTxt}>Ask by voice</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* ── SUCCESS ── */}
            {phase === 'success' && (
              <View style={[s.body, { alignItems: 'center', paddingVertical: 44 }]}>
                <Animated.View style={[s.successCircle, { transform: [{ scale: successScale }], opacity: successOpacity }]}>
                  <Ionicons name="checkmark" size={42} color="#fff" />
                </Animated.View>
                <Text style={s.successTitle}>{successInfo.title || 'Saved Successfully!'}</Text>
                <Text style={s.successSub}>{successInfo.subtitle || 'Your progress has been recorded.'}</Text>
              </View>
            )}

          </KeyboardAvoidingView>
        </Animated.View>
      </Modal>
    </>
  );
}

// ── Siri Spectrum Waves Component ─────────────────────────────────────────────
function SiriWaves({ volumeAnim, C }: { volumeAnim: Animated.Value; C: any }) {
  const bars = [0.25, 0.5, 0.85, 0.6, 1.0, 0.7, 0.9, 0.4, 0.75, 0.35, 0.8, 0.5];
  const barAnims = useRef(bars.map(() => new Animated.Value(0.3))).current;

  useEffect(() => {
    const loops = barAnims.map((anim, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 45),
          Animated.timing(anim, {
            toValue: bars[i],
            duration: 320,
            useNativeDriver: true,
            easing: Easing.inOut(Easing.sin),
          }),
          Animated.timing(anim, {
            toValue: 0.2,
            duration: 320,
            useNativeDriver: true,
            easing: Easing.inOut(Easing.sin),
          }),
        ])
      )
    );
    loops.forEach(l => l.start());
    return () => loops.forEach(l => l.stop());
  }, []);

  return (
    <View style={styles.wavesContainer}>
      {barAnims.map((anim, i) => {
        const heightMultiplier = Animated.multiply(anim, volumeAnim);
        return (
          <Animated.View
            key={i}
            style={[
              styles.waveBar,
              {
                backgroundColor: i % 2 === 0 ? C.accent : '#00E5FF',
                transform: [{ scaleY: heightMultiplier }],
              },
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wavesContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    height: 48,
    marginVertical: 12,
  },
  waveBar: {
    width: 3.5,
    height: 44,
    borderRadius: 3,
  },
});

// ── Styles ─────────────────────────────────────────────────────────────────────
function makeStyles(C: any, isDark: boolean) {
  const glass = {
    backgroundColor: isDark ? 'rgba(18,24,38,0.97)' : 'rgba(244,248,255,0.98)',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.85)',
  };

  return StyleSheet.create({
    fabWrapper: { position: 'absolute', bottom: 75, alignSelf: 'center', zIndex: 999 },
    fab:        { shadowColor: C.accent, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.55, shadowRadius: 18, elevation: 14 },
    fabInner:   { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.accent, paddingHorizontal: 22, paddingVertical: 13, borderRadius: 32 },
    fabLabel:   { color: '#fff', fontWeight: '800', fontSize: 14, letterSpacing: 0.3 },

    backdrop:   { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: isDark ? 'rgba(3,6,12,0.65)' : 'rgba(0,0,0,0.35)' },
    sheet:      { position: 'absolute', bottom: 0, left: 0, right: 0, ...glass, borderTopLeftRadius: 36, borderTopRightRadius: 36, paddingBottom: 36, maxHeight: SH * 0.92, overflow: 'hidden' },
    handle:     { width: 44, height: 4, borderRadius: 2, backgroundColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.18)', alignSelf: 'center', marginTop: 12, marginBottom: 8 },

    sheetHeader:{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: isDark ? 'rgba(255,255,255,0.07)' : C.border },
    headerLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 12 },
    headerIcon: { width: 40, height: 40, borderRadius: 14, backgroundColor: C.accentDim, alignItems: 'center', justifyContent: 'center' },
    sheetTitle: { fontSize: 17, fontWeight: '800', color: C.text },
    sheetSub:   { fontSize: 11, color: C.muted, marginTop: 1 },
    closeBtn:   { width: 32, height: 32, borderRadius: 10, backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : C.border, alignItems: 'center', justifyContent: 'center' },

    body:       { paddingHorizontal: 20, paddingTop: 16 },

    modeToggle: { flexDirection: 'row', backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : C.bg, borderRadius: 14, padding: 4, marginBottom: 16, gap: 4 },
    modeBtn:    { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8, borderRadius: 11 },
    modeBtnActive: { backgroundColor: C.accent },
    modeTxt:    { fontSize: 13, fontWeight: '700', color: C.muted },

    // Siri / Bixby Voice Container
    voiceContainer:  { alignItems: 'center', paddingBottom: 8 },
    siriOrbContainer:{ width: 160, height: 160, alignItems: 'center', justifyContent: 'center', marginTop: 4, marginBottom: 4 },
    siriAuraOuter:   {
      position: 'absolute',
      width: 154,
      height: 154,
      borderRadius: 77,
      borderWidth: 2,
      borderColor: 'rgba(0, 229, 255, 0.4)',
      backgroundColor: isDark ? 'rgba(124, 77, 255, 0.18)' : 'rgba(0, 229, 255, 0.15)',
    },
    siriAuraMid: {
      position: 'absolute',
      width: 120,
      height: 120,
      borderRadius: 60,
      backgroundColor: isDark ? 'rgba(255, 64, 129, 0.22)' : 'rgba(124, 77, 255, 0.25)',
    },
    siriOrb: {
      width: 86,
      height: 86,
      borderRadius: 43,
      backgroundColor: C.accent,
      alignItems: 'center',
      justifyContent: 'center',
      elevation: 12,
      shadowColor: C.accent,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.6,
      shadowRadius: 18,
    },
    siriOrbListening: {
      backgroundColor: '#FF3B30',
      shadowColor: '#FF3B30',
    },

    statusHint:  { fontSize: 13, color: C.muted, textAlign: 'center', marginTop: 6, fontWeight: '600', lineHeight: 18 },
    transcriptBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 12,
      backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : C.bg,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 10,
      width: '100%',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.1)' : C.border,
    },
    transcriptTxt: { fontSize: 14, color: C.text, fontWeight: '500', flex: 1, lineHeight: 20 },

    errorBox:    { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.redDim, borderRadius: 12, padding: 10, marginTop: 10, width: '100%' },
    errorTxt:    { fontSize: 12, color: C.red, flex: 1, fontWeight: '600' },

    quickChipWrap: { width: '100%', marginTop: 16 },
    chipHeader:    { fontSize: 10, fontWeight: '800', color: C.muted, letterSpacing: 0.8, marginBottom: 8 },
    chipsRow:      { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    chipPill:      { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : C.bg, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.08)' : C.border },
    chipTxt:       { fontSize: 11, fontWeight: '600', color: C.text },

    // Type Area
    typeArea:    { paddingBottom: 10 },
    inputWrapper:{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : C.bg, borderRadius: 18, padding: 14, borderWidth: 1.5, borderColor: C.border, minHeight: 90 },
    textInput:   { flex: 1, fontSize: 14, color: C.text, textAlignVertical: 'top', lineHeight: 21 },
    submitBtn:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.accent, borderRadius: 16, paddingVertical: 14, marginTop: 12, elevation: 8, shadowColor: C.accent, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 10 },
    submitTxt:   { color: '#fff', fontWeight: '800', fontSize: 14 },
    hintPill:    { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : C.accentDim, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8 },
    hintTxt:     { fontSize: 12, fontWeight: '600' },

    // Processing
    processingOuter: { width: 96, height: 96, alignItems: 'center', justifyContent: 'center' },
    processingArc:   {
      position: 'absolute', width: 96, height: 96, borderRadius: 48,
      borderWidth: 3, borderColor: 'transparent',
      borderTopColor: C.accent, borderRightColor: C.accent + '66',
    },
    processingInner: { width: 68, height: 68, borderRadius: 34, backgroundColor: C.accentDim, alignItems: 'center', justifyContent: 'center' },
    processingTitle: { fontSize: 17, fontWeight: '800', color: C.text },
    processingSubtitle: { fontSize: 13, color: C.muted, marginTop: 4, fontWeight: '500' },

    // Cards (Workout & Nutrition)
    confirmHeader:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
    confirmIconWrap:{ width: 30, height: 30, borderRadius: 10, backgroundColor: C.accentDim, alignItems: 'center', justifyContent: 'center' },
    confirmTitle:   { fontSize: 14, fontWeight: '800', color: C.text, flex: 1 },
    addSmallBtn:    { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: C.accentDim, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8 },
    addSmallTxt:    { fontSize: 11, fontWeight: '700', color: C.accent },

    macroSummaryBar:{ flexDirection: 'row', alignItems: 'center', backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : C.bg, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 16, marginBottom: 12, borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.08)' : C.border },
    macroCol:       { flex: 1, alignItems: 'center' },
    macroNum:       { fontSize: 18, fontWeight: '900', color: C.protein },
    macroLbl:       { fontSize: 10, fontWeight: '700', color: C.muted, letterSpacing: 0.8, marginTop: 1 },
    macroDivider:   { width: 1, height: 26, backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : C.border },

    itemCard:    { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : C.bg, borderRadius: 18, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.08)' : C.border },
    itemCardTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
    exIconWrap:  { width: 30, height: 30, borderRadius: 9, backgroundColor: C.accentDim, alignItems: 'center', justifyContent: 'center' },
    itemName:    { flex: 1, fontSize: 14, fontWeight: '700', color: C.text },
    itemBadge:   { fontSize: 11, color: C.muted, backgroundColor: C.accentDim, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
    fieldsRow:   { flexDirection: 'row', gap: 8, alignItems: 'center' },
    fieldBox:    { flex: 1 },
    fieldLbl:    { fontSize: 9, color: C.muted, fontWeight: '700', letterSpacing: 0.8, marginBottom: 4 },
    fieldInput:  { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : C.border, borderRadius: 10, padding: 8, fontSize: 14, fontWeight: '800', color: C.text, textAlign: 'center' },
    unitToggle:  { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : C.border },
    unitActive:  { backgroundColor: C.accentDim },
    unitTxt:     { fontSize: 13, fontWeight: '700', color: C.muted },
    e1rmRow:     { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8 },
    e1rmTxt:     { fontSize: 11, color: C.yellow, fontWeight: '600' },

    confirmBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.green, borderRadius: 16, paddingVertical: 15, marginTop: 10, elevation: 8, shadowColor: C.green, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 10 },
    confirmBtnTxt:{ color: '#fff', fontWeight: '800', fontSize: 15 },
    cancelLink:  { alignItems: 'center', paddingVertical: 10 },
    cancelTxt:   { color: C.muted, fontSize: 13, fontWeight: '600' },

    // Chatbot UI
    chatHeader:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
    chatBadge:   { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.yellow + '22', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
    chatBadgeTxt:{ fontSize: 11, fontWeight: '700', color: C.yellow },
    chatResetBtn:{ flexDirection: 'row', alignItems: 'center', gap: 4 },
    chatResetTxt:{ fontSize: 12, color: C.muted, fontWeight: '600' },
    chatCard:    { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : C.bg, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.09)' : C.border },
    chatAnswerTxt:{ fontSize: 14, lineHeight: 22, color: C.text, fontWeight: '400' },

    followupRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
    followupInput:{ flex: 1, backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : C.bg, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, fontSize: 13, color: C.text, borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.1)' : C.border },
    followupSendBtn: { width: 40, height: 40, borderRadius: 13, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
    voiceFollowupBtn:{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, marginTop: 6 },
    voiceFollowupTxt:{ fontSize: 13, fontWeight: '700', color: C.accent },

    // Success
    successCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center', marginBottom: 16, elevation: 10, shadowColor: C.green, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.5, shadowRadius: 16 },
    successTitle:  { fontSize: 24, fontWeight: '800', color: C.text },
    successSub:    { fontSize: 13, color: C.muted, marginTop: 6, textAlign: 'center', lineHeight: 19, maxWidth: 280 },
  });
}
