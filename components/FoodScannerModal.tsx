// components/FoodScannerModal.tsx — Scan food, no API keys anywhere. Barcode: hold a barcode in the
// frame and it's looked up on Open Food Facts by itself. Label: take a photo of the nutrition table and
// the phone reads it (ML Kit, offline): calories, protein, carbs and fat per 100 g and per serving, the
// serving size, ingredients and allergens. The result slides up as the portion editor; once it's added
// the camera is ready for the next food. Close, the mode switch and the flash sit at the top; the
// shutter sits well above the navigation bar.
import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, Modal, StyleSheet, TouchableOpacity, TextInput, ScrollView, Pressable, Linking,
  useWindowDimensions, ActivityIndicator,
} from 'react-native';
import Animated, {
  Easing, FadeIn, FadeInDown, FadeInUp, FadeOut, SlideInDown, SlideOutDown, ZoomIn, ZoomOut,
  useAnimatedStyle, useSharedValue, withRepeat, withSequence, withSpring, withTiming, SharedValue,
} from 'react-native-reanimated';
import { CameraView, useCameraPermissions, BarcodeScanningResult } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../contexts/ThemeContext';
import { addFood, getGoals } from '../db/database';
import { FoodItem, Portion, fetchFoodByBarcode, readLabelPhoto, rememberBarcode, manualItem, logName } from '../utils/foodScannerService';
import { PortionEditor, useKeyboardHeight, useLiftWhileTyping } from './FoodPortion';
import { PillSwitch } from './PillSwitch';
import { logError } from '../utils/logError';

type Mode = 'barcode' | 'label';
type Phase = 'aim' | 'looking' | 'reading' | 'notfound' | 'result';

const BEAM = '#60A5FA';   // the scanning light: the app's blue, a shade lighter so it glows on camera

export default function FoodScannerModal({ visible, onClose, onChanged }: {
  visible: boolean;
  onClose: () => void;
  onChanged: () => void;     // a food was logged
}) {
  const { C } = useTheme();
  const insets = useSafeAreaInsets();
  const { width: W, height: H } = useWindowDimensions();
  const kb = useKeyboardHeight();
  const lift = useLiftWhileTyping(kb);
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

  const [mode, setMode] = useState<Mode>('barcode');
  const [phase, setPhase] = useState<Phase>('aim');
  const [torch, setTorch] = useState(false);
  const [item, setItem] = useState<FoodItem | null>(null);
  const [itemKey, setItemKey] = useState(0);
  const [photo, setPhoto] = useState<string | null>(null);
  const [lookingFor, setLookingFor] = useState('');
  const [notFound, setNotFound] = useState<{ code?: string; text: string } | null>(null);
  const [codeEntry, setCodeEntry] = useState<string | null>(null);   // typing a barcode by hand
  const [session, setSession] = useState({ count: 0, kcal: 0 });
  const [flash, setFlash] = useState(0);                             // the ✓ after each add
  const [flashOn, setFlashOn] = useState(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (flashTimer.current) clearTimeout(flashTimer.current); }, []);
  const [goals, setGoals] = useState<{ calorie_goal: number; protein_goal: number } | undefined>();
  const busy = useRef(false);

  useEffect(() => {
    if (!visible) return;
    setMode('barcode'); setPhase('aim'); setItem(null); setPhoto(null); setNotFound(null); setCodeEntry(null);
    setTorch(false); setSession({ count: 0, kcal: 0 }); setGoals(getGoals());
    busy.current = false;
  }, [visible]);
  // First time: ask for the camera straight away instead of making them tap a button first
  useEffect(() => {
    if (visible && permission && !permission.granted && permission.status === 'undetermined') requestPermission();
  }, [visible, permission, requestPermission]);

  // The frame: wide for a barcode, tall for a nutrition table (but never down into the shutter)
  const frameW = Math.min(W * 0.8, 340);
  const frameTop = insets.top + 150;
  const room = H - frameTop - (insets.bottom + 22 + 96) - 64;
  const frameH = mode === 'barcode' ? frameW * 0.58 : Math.max(170, Math.min(frameW * 1.2, room));

  const backToCamera = () => {
    setItem(null); setPhoto(null); setNotFound(null); setPhase('aim');
    busy.current = false;
  };

  const showResult = (food: FoodItem) => {
    setItemKey(k => k + 1);
    setItem(food);
    setPhase('result');
  };

  const lookUp = async (code: string) => {
    if (busy.current) return;
    busy.current = true;
    setLookingFor(code);
    setPhase('looking');
    try {
      const food = await fetchFoodByBarcode(code);
      if (food) showResult(food);
      else {
        setNotFound({ code, text: 'This barcode isn\'t on Open Food Facts yet. Scan its nutrition label instead, or type the values in.' });
        setPhase('notfound');
      }
    } catch (e) {
      logError('barcodeLookup', e);
      setNotFound({ code, text: 'Couldn\'t reach Open Food Facts. Check your connection, or scan the nutrition label: that works offline.' });
      setPhase('notfound');
    }
  };

  const onBarcode = (r: BarcodeScanningResult) => {
    if (busy.current || phase !== 'aim' || mode !== 'barcode') return;
    const code = (r.data || '').replace(/\D/g, '');
    if (code.length < 6) return;   // QR codes and partial reads aren't product barcodes
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    lookUp(code);
  };

  const read = async (uri: string) => {
    busy.current = true;
    setPhoto(uri);
    setPhase('reading');
    try {
      const { item: food } = await readLabelPhoto(uri);
      Haptics.notificationAsync(food.label && food.label.found >= 3
        ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning).catch(() => {});
      showResult(food);
    } catch (e) {
      logError('readLabel', e);
      setNotFound({ text: 'Couldn\'t read that photo. Hold the phone steady, fill the frame with the nutrition table and try again.' });
      setPhase('notfound');
    } finally {
      // Label photos are only needed for reading: drop the app's own copy (never a gallery original)
      if (FileSystem.cacheDirectory && uri.startsWith(FileSystem.cacheDirectory)) {
        FileSystem.deleteAsync(uri, { idempotent: true }).catch(e => logError('dropLabelPhoto', e));
      }
    }
  };

  const snap = async () => {
    if (busy.current || !cameraRef.current) return;
    busy.current = true;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      const pic = await cameraRef.current.takePictureAsync({ quality: 0.9 });
      if (!pic?.uri) throw new Error('no photo');
      await read(pic.uri);
    } catch (e) {
      logError('takeLabelPhoto', e);
      busy.current = false;
      setPhase('aim');
    }
  };

  const fromGallery = async () => {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', allowsEditing: true, quality: 1 });
      if (!res.canceled && res.assets[0]?.uri) await read(res.assets[0].uri);
    } catch (e) {
      logError('pickLabelPhoto', e);
    }
  };

  const typeItIn = (name = '') => {
    showResult({ ...manualItem(name, 0, { kcal: 0, protein: 0, carbs: 0, fat: 0 }), hasNutrition: false, perServing: undefined, per100: undefined });
  };

  const add = (p: Portion, name: string) => {
    if (!item) return;
    const n = name.trim() || item.name || 'Scanned food';
    // A barcode whose values were filled in or corrected scans right next time
    if (item.barcode && item.source === 'barcode') rememberBarcode({ ...item, name: n });
    addFood(logName(n, p), p.protein, p.kcal);
    setSession(s => ({ count: s.count + 1, kcal: s.kcal + p.kcal }));
    setFlash(f => f + 1);
    setFlashOn(true);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlashOn(false), 850);
    onChanged();
    backToCamera();
  };

  const switchMode = (m: Mode) => {
    setMode(m);
    if (phase === 'notfound') backToCamera();
  };

  const granted = !!permission?.granted;
  const scanning = phase === 'aim' || phase === 'looking';

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent navigationBarTranslucent
      // Back steps out of whatever is on top first: the code box, then a result, then the scanner
      onRequestClose={() => (codeEntry !== null ? setCodeEntry(null) : phase === 'result' || phase === 'notfound' ? backToCamera() : onClose())}>
      <View style={styles.root}>
        {/* Camera, or the photo being read */}
        {granted && visible && (
          <CameraView
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            facing="back"
            enableTorch={torch}
            barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39'] }}
            onBarcodeScanned={mode === 'barcode' && phase === 'aim' ? onBarcode : undefined}
          />
        )}
        {photo && phase === 'reading' && (
          <Animated.Image entering={FadeIn.duration(150)} source={{ uri: photo }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        )}

        {!granted ? (
          <Permission asked={!!permission} canAsk={permission?.canAskAgain !== false} onAllow={requestPermission} top={insets.top} onClose={onClose} />
        ) : (
          <>
            <Viewfinder x={(W - frameW) / 2} y={frameTop} w={frameW} h={frameH} W={W} H={H}
              state={phase === 'looking' ? 'locked' : phase === 'reading' ? 'reading' : phase === 'notfound' ? 'idle' : 'scanning'} />

            {/* Hint under the frame */}
            {scanning && (
              <Animated.View key={`${mode}-${phase}`} entering={FadeInDown.duration(250)} style={[styles.hintWrap, { top: frameTop + frameH + 18 }]}>
                <View style={styles.hintPill}>
                  {phase === 'looking' ? <ActivityIndicator size="small" color="#fff" /> : (
                    <Ionicons name={mode === 'barcode' ? 'barcode-outline' : 'document-text-outline'} size={15} color="#fff" />
                  )}
                  <Text style={styles.hintTxt}>
                    {phase === 'looking' ? `Looking up ${lookingFor}…`
                      : mode === 'barcode' ? 'Hold the barcode inside the frame' : 'Fit the whole nutrition table in the frame'}
                  </Text>
                </View>
              </Animated.View>
            )}
            {phase === 'reading' && (
              <Animated.View entering={FadeInDown.duration(250)} style={[styles.hintWrap, { top: frameTop + frameH + 18 }]}>
                <View style={styles.hintPill}>
                  <ActivityIndicator size="small" color="#fff" />
                  <Text style={styles.hintTxt}>Reading the label…</Text>
                </View>
              </Animated.View>
            )}

            {/* Not found / couldn't read */}
            {phase === 'notfound' && notFound && (
              <Animated.View entering={FadeInUp.springify().damping(18)} style={[styles.glassCard, { bottom: insets.bottom + 22 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="help-circle" size={20} color={C.orange} />
                  <Text style={styles.glassTitle}>{notFound.code ? 'Product not found' : 'Couldn\'t read it'}</Text>
                </View>
                <Text style={styles.glassBody}>{notFound.text}</Text>
                <View style={styles.glassActions}>
                  {notFound.code && (
                    <GlassAction icon="document-text-outline" label="Scan label" primary onPress={() => { setMode('label'); backToCamera(); }} />
                  )}
                  <GlassAction icon="create-outline" label="Type it in" primary={!notFound.code} onPress={() => typeItIn()} />
                  <GlassAction icon="refresh" label="Try again" onPress={backToCamera} />
                </View>
              </Animated.View>
            )}

            {/* Top: close, title, flash, then the mode switch */}
            <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
              <View style={styles.topRow}>
                <RoundButton icon="close" onPress={onClose} label="Close" />
                <View style={{ flex: 1, alignItems: 'center' }}>
                  <Text style={styles.topTitle}>Scan food</Text>
                  {session.count > 0 && (
                    <Animated.Text key={session.count} entering={FadeIn} style={styles.topSub}>
                      {session.count} added · {session.kcal} kcal
                    </Animated.Text>
                  )}
                </View>
                <RoundButton icon={torch ? 'flash' : 'flash-off'} onPress={() => setTorch(t => !t)} label="Flash" on={torch} />
              </View>
              <View style={{ marginTop: 12 }}>
                <PillSwitch
                  options={[{ key: 'barcode', label: 'Barcode', icon: 'barcode-outline' }, { key: 'label', label: 'Nutrition label', icon: 'document-text-outline' }]}
                  value={mode} onChange={switchMode} color={C.accent} variant="glass"
                />
              </View>
            </View>

            {/* Bottom: well above the navigation bar */}
            {phase !== 'result' && phase !== 'notfound' && (
              <View style={[styles.bottom, { paddingBottom: insets.bottom + 22 }]}>
                {mode === 'label' ? (
                  <View style={styles.bottomRow}>
                    <GlassAction icon="images-outline" label="Gallery" onPress={fromGallery} />
                    <Shutter onPress={snap} disabled={phase !== 'aim'} />
                    <GlassAction icon="create-outline" label="Type it in" onPress={() => typeItIn()} />
                  </View>
                ) : (
                  <View style={styles.bottomRow}>
                    <GlassAction icon="keypad-outline" label="Enter code" onPress={() => setCodeEntry('')} />
                    <GlassAction icon="create-outline" label="Type it in" onPress={() => typeItIn()} />
                  </View>
                )}
              </View>
            )}
          </>
        )}

        {/* A tick each time something is added */}
        {flashOn && <AddedFlash key={flash} />}

        {/* Typing a barcode by hand */}
        {codeEntry !== null && (
          // Up top, so the keyboard never covers it
          <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(150)}
            style={[StyleSheet.absoluteFill, styles.dim, { justifyContent: 'flex-start', paddingTop: insets.top + 90 }]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setCodeEntry(null)} />
            <Animated.View entering={ZoomIn.springify().damping(16)} exiting={ZoomOut.duration(120)}
              style={[styles.codeCard, { backgroundColor: C.card, borderColor: C.border }]}>
              <Text style={[styles.codeTitle, { color: C.text }]}>Enter the barcode</Text>
              <Text style={[styles.codeSub, { color: C.muted }]}>The digits under the bars</Text>
              <TextInput style={[styles.codeInput, { color: C.text, borderColor: C.accent }]} value={codeEntry}
                onChangeText={t => setCodeEntry(t.replace(/\D/g, ''))} keyboardType="number-pad" autoFocus maxLength={14}
                placeholder="8901234567890" placeholderTextColor={C.muted}
                onSubmitEditing={() => { const c = codeEntry; setCodeEntry(null); if (c && c.length >= 6) lookUp(c); }} />
              <TouchableOpacity activeOpacity={0.85} disabled={!codeEntry || codeEntry.length < 6}
                style={[styles.codeBtn, { backgroundColor: codeEntry && codeEntry.length >= 6 ? C.accent : C.border }]}
                onPress={() => { const c = codeEntry!; setCodeEntry(null); lookUp(c); }}>
                <Text style={styles.codeBtnTxt}>Look it up</Text>
              </TouchableOpacity>
            </Animated.View>
          </Animated.View>
        )}

        {/* The result */}
        {phase === 'result' && item && (
          <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(200)} style={[StyleSheet.absoluteFill, styles.dim]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={backToCamera} accessibilityLabel="Back to the camera" />
          </Animated.View>
        )}
        {phase === 'result' && item && (
          <Animated.View entering={SlideInDown.springify().damping(20).stiffness(190)} exiting={SlideOutDown.duration(220)}
            style={[styles.sheet, {
              backgroundColor: C.card, borderColor: C.border, bottom: kb,
              maxHeight: H - insets.top - 40 - kb, paddingBottom: kb ? 12 : insets.bottom + 14,
            }]}>
            <View style={styles.sheetTop}>
              <View style={[styles.handle, { backgroundColor: C.border }]} />
              <TouchableOpacity onPress={backToCamera} style={[styles.againBtn, { borderColor: C.border, backgroundColor: C.bg }]} activeOpacity={0.8}>
                <Ionicons name={item.source === 'label' ? 'camera-reverse-outline' : 'scan-outline'} size={14} color={C.accent} />
                <Text style={[styles.againTxt, { color: C.accent }]}>{item.source === 'label' ? 'Retake' : 'Scan another'}</Text>
              </TouchableOpacity>
            </View>
            <ScrollView ref={lift.ref} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: lift.extra }}>
              <PortionEditor key={itemKey} item={item} onChange={setItem} onAdd={add} goals={goals} onTyping={lift.onTyping} />
            </ScrollView>
          </Animated.View>
        )}
      </View>
    </Modal>
  );
}

// ─── The viewfinder: a dimmed cutout, breathing corners and a sweeping beam ──
function Viewfinder({ x, y, w, h, W, H, state }: {
  x: number; y: number; w: number; h: number; W: number; H: number;
  state: 'scanning' | 'locked' | 'reading' | 'idle';
}) {
  const fh = useSharedValue(h);
  const breathe = useSharedValue(0);
  const sweep = useSharedValue(0);
  const snap = useSharedValue(1);
  useEffect(() => { fh.value = withSpring(h, { damping: 18, stiffness: 160 }); }, [h, fh]);
  useEffect(() => {
    breathe.value = withRepeat(withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.sin) }), -1, true);
    sweep.value = withRepeat(withTiming(1, { duration: 2400, easing: Easing.linear }), -1, false);
  }, [breathe, sweep]);
  // Locking on to a barcode: the frame snaps in a little
  useEffect(() => {
    if (state === 'locked') snap.value = withSequence(withTiming(0.92, { duration: 110 }), withSpring(1, { damping: 8, stiffness: 220 }));
  }, [state, snap]);

  const maskTop = useAnimatedStyle(() => ({ height: y }));
  const maskBottom = useAnimatedStyle(() => ({ top: y + fh.value }));
  const maskSide = useAnimatedStyle(() => ({ top: y, height: fh.value }));
  const frame = useAnimatedStyle(() => ({
    height: fh.value,
    transform: [{ scale: snap.value * (state === 'scanning' ? 1 + breathe.value * 0.025 : 1) }],
  }));

  const locked = state === 'locked';
  const cornerColor = locked ? BEAM : '#FFFFFF';
  const L = Math.min(34, w * 0.14);
  return (
    <>
      <Animated.View pointerEvents="none" style={[styles.mask, { left: 0, right: 0, top: 0 }, maskTop]} />
      <Animated.View pointerEvents="none" style={[styles.mask, { left: 0, right: 0, height: H }, maskBottom]} />
      <Animated.View pointerEvents="none" style={[styles.mask, { left: 0, width: x }, maskSide]} />
      <Animated.View pointerEvents="none" style={[styles.mask, { right: 0, width: W - x - w }, maskSide]} />
      <Animated.View pointerEvents="none" style={[styles.frame, { left: x, top: y, width: w }, frame]}>
        {[
          { top: -2, left: -2, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 18 },
          { top: -2, right: -2, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 18 },
          { bottom: -2, left: -2, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 18 },
          { bottom: -2, right: -2, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 18 },
        ].map((c, i) => (
          <View key={i} style={[styles.corner, { width: L, height: L, borderColor: cornerColor, shadowColor: BEAM }, c]} />
        ))}
        {state !== 'idle' && <Beam sweep={sweep} fh={fh} count={state === 'reading' ? 3 : 1} />}
      </Animated.View>
    </>
  );
}

/** The scanning light: glides down and back up the frame with a soft trail behind it. */
function Beam({ sweep, fh, count }: { sweep: SharedValue<number>; fh: SharedValue<number>; count: number }) {
  return (
    <View style={[StyleSheet.absoluteFill, { overflow: 'hidden', borderRadius: 16 }]}>
      {Array.from({ length: count }, (_, i) => <BeamLine key={i} sweep={sweep} fh={fh} offset={i / count} />)}
    </View>
  );
}

function BeamLine({ sweep, fh, offset }: { sweep: SharedValue<number>; fh: SharedValue<number>; offset: number }) {
  const line = useAnimatedStyle(() => {
    const t = (sweep.value + offset) % 1;
    const pos = (1 - Math.cos(t * 2 * Math.PI)) / 2;          // 0 → 1 → 0, easing at the ends
    return { transform: [{ translateY: 8 + pos * (fh.value - 16) }] };
  });
  const trail = useAnimatedStyle(() => {
    const t = (sweep.value + offset) % 1;
    const pos = (1 - Math.cos(t * 2 * Math.PI)) / 2;
    const down = Math.sin(t * 2 * Math.PI) >= 0;
    return {
      opacity: 0.18 + Math.abs(Math.sin(t * 2 * Math.PI)) * 0.22,
      // Behind the beam: above it on the way down, below it on the way up
      transform: [{ translateY: 8 + pos * (fh.value - 16) + (down ? -34 : 2) }],
    };
  });
  return (
    <>
      <Animated.View style={[styles.trail, trail]} />
      <Animated.View style={[styles.beam, line]} />
    </>
  );
}

function Shutter({ onPress, disabled }: { onPress: () => void; disabled?: boolean }) {
  const s = useSharedValue(1);
  const ring = useSharedValue(0);
  useEffect(() => {
    ring.value = withRepeat(withTiming(1, { duration: 1800, easing: Easing.out(Easing.quad) }), -1, false);
  }, [ring]);
  const st = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  const ringSt = useAnimatedStyle(() => ({ opacity: 0.5 * (1 - ring.value), transform: [{ scale: 1 + ring.value * 0.35 }] }));
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityLabel="Take a photo of the label"
      onPressIn={() => { s.value = withSpring(0.88, { damping: 14, stiffness: 420 }); }}
      onPressOut={() => { s.value = withSpring(1, { damping: 7, stiffness: 240 }); }}>
      <View style={styles.shutterWrap}>
        {!disabled && <Animated.View style={[styles.shutterRing, ringSt]} />}
        <Animated.View style={[styles.shutter, st, disabled && { opacity: 0.5 }]}>
          <View style={styles.shutterInner}>
            <Ionicons name="scan" size={28} color="#0B1220" />
          </View>
        </Animated.View>
      </View>
    </Pressable>
  );
}

function GlassAction({ icon, label, onPress, primary }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; primary?: boolean }) {
  const { C } = useTheme();
  const s = useSharedValue(1);
  const st = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <Pressable onPress={onPress}
      onPressIn={() => { s.value = withSpring(0.9, { damping: 14, stiffness: 420 }); }}
      onPressOut={() => { s.value = withSpring(1, { damping: 8, stiffness: 260 }); }}>
      <Animated.View style={[styles.glassBtn, primary && { backgroundColor: C.accent, borderColor: C.accent }, st]}>
        <Ionicons name={icon} size={18} color="#fff" />
        <Text style={styles.glassBtnTxt}>{label}</Text>
      </Animated.View>
    </Pressable>
  );
}

function RoundButton({ icon, onPress, label, on }: { icon: keyof typeof Ionicons.glyphMap; onPress: () => void; label: string; on?: boolean }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} accessibilityLabel={label} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      style={[styles.round, on && { backgroundColor: 'rgba(253,224,71,0.25)', borderColor: '#FDE047' }]}>
      <Ionicons name={icon} size={20} color={on ? '#FDE047' : '#fff'} />
    </TouchableOpacity>
  );
}

function AddedFlash() {
  const { C } = useTheme();
  return (
    <Animated.View pointerEvents="none" entering={FadeIn.duration(120)} exiting={FadeOut.duration(250)} style={[StyleSheet.absoluteFill, styles.flashWrap]}>
      <Animated.View entering={ZoomIn.springify().damping(10)} style={[styles.flashBadge, { backgroundColor: C.accent }]}>
        <Ionicons name="checkmark" size={46} color="#fff" />
      </Animated.View>
    </Animated.View>
  );
}

function Permission({ asked, canAsk, onAllow, top, onClose }: { asked: boolean; canAsk: boolean; onAllow: () => void; top: number; onClose: () => void }) {
  const { C } = useTheme();
  return (
    <View style={[StyleSheet.absoluteFill, styles.permission, { backgroundColor: C.bg }]}>
      <View style={{ position: 'absolute', top: top + 8, left: 16 }}>
        <TouchableOpacity onPress={onClose} style={[styles.round, { backgroundColor: C.card, borderColor: C.border }]}>
          <Ionicons name="close" size={20} color={C.text} />
        </TouchableOpacity>
      </View>
      {!asked ? <ActivityIndicator color={C.accent} /> : (
        <Animated.View entering={FadeInDown.duration(300)} style={{ alignItems: 'center' }}>
          <View style={[styles.permIcon, { backgroundColor: C.accent + '1F' }]}>
            <Ionicons name="camera-outline" size={40} color={C.accent} />
          </View>
          <Text style={[styles.permTitle, { color: C.text }]}>Let GainQuest use the camera</Text>
          <Text style={[styles.permBody, { color: C.muted }]}>
            {canAsk ? 'It reads barcodes and nutrition labels. Photos stay on your phone.'
              : 'Camera access is turned off for GainQuest. Turn it on in your phone settings to scan.'}
          </Text>
          <TouchableOpacity onPress={canAsk ? onAllow : () => Linking.openSettings().catch(() => {})}
            style={[styles.permBtn, { backgroundColor: C.accent }]} activeOpacity={0.85}>
            <Text style={styles.permBtnTxt}>{canAsk ? 'Allow camera' : 'Open settings'}</Text>
          </TouchableOpacity>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root:        { flex: 1, backgroundColor: '#000' },
  mask:        { position: 'absolute', backgroundColor: 'rgba(3,6,14,0.62)' },
  frame:       { position: 'absolute', borderRadius: 16 },
  corner:      { position: 'absolute', shadowOpacity: 0.9, shadowRadius: 8, shadowOffset: { width: 0, height: 0 } },
  beam:        { position: 'absolute', left: 10, right: 10, top: 0, height: 2.5, borderRadius: 2, backgroundColor: BEAM, shadowColor: BEAM, shadowOpacity: 1, shadowRadius: 10, elevation: 6 },
  trail:       { position: 'absolute', left: 10, right: 10, top: 0, height: 34, borderRadius: 10, backgroundColor: BEAM },

  top:         { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 16 },
  topRow:      { flexDirection: 'row', alignItems: 'center', gap: 12 },
  topTitle:    { color: '#fff', fontSize: 18, fontWeight: '900' },
  topSub:      { color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: '700', marginTop: 1 },
  round:       { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(10,12,20,0.55)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)' },

  hintWrap:    { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  hintPill:    { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 16, backgroundColor: 'rgba(10,12,20,0.62)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)' },
  hintTxt:     { color: '#fff', fontSize: 13, fontWeight: '700' },

  glassCard:   { position: 'absolute', left: 16, right: 16, padding: 16, borderRadius: 20, backgroundColor: 'rgba(12,16,28,0.92)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)' },
  glassTitle:  { color: '#fff', fontSize: 16, fontWeight: '900' },
  glassBody:   { color: 'rgba(255,255,255,0.78)', fontSize: 13, fontWeight: '600', lineHeight: 19, marginTop: 6 },
  glassActions:{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },

  bottom:      { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 20 },
  bottomRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-evenly' },
  glassBtn:    { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 14, paddingVertical: 11, borderRadius: 16, backgroundColor: 'rgba(10,12,20,0.6)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)' },
  glassBtnTxt: { color: '#fff', fontSize: 13, fontWeight: '800' },

  shutterWrap: { width: 92, height: 92, alignItems: 'center', justifyContent: 'center' },
  shutterRing: { position: 'absolute', width: 80, height: 80, borderRadius: 40, borderWidth: 2, borderColor: BEAM },
  shutter:     { width: 78, height: 78, borderRadius: 39, backgroundColor: 'rgba(255,255,255,0.28)', alignItems: 'center', justifyContent: 'center' },
  shutterInner:{ width: 62, height: 62, borderRadius: 31, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },

  dim:         { backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center' },
  codeCard:    { width: '86%', borderRadius: 24, borderWidth: 1, padding: 20 },
  codeTitle:   { fontSize: 18, fontWeight: '900' },
  codeSub:     { fontSize: 13, fontWeight: '600', marginTop: 2 },
  codeInput:   { fontSize: 24, fontWeight: '900', letterSpacing: 2, borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, marginTop: 14, textAlign: 'center' },
  codeBtn:     { marginTop: 12, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  codeBtnTxt:  { color: '#fff', fontSize: 15, fontWeight: '900' },

  sheet:       { position: 'absolute', left: 0, right: 0, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, paddingHorizontal: 18, paddingTop: 10, shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 18, shadowOffset: { width: 0, height: -6 }, elevation: 24 },
  sheetTop:    { alignItems: 'center', marginBottom: 10 },
  handle:      { width: 42, height: 5, borderRadius: 3 },
  againBtn:    { position: 'absolute', right: 0, top: -2, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, borderWidth: 1 },
  againTxt:    { fontSize: 12, fontWeight: '800' },

  flashWrap:   { alignItems: 'center', justifyContent: 'center' },
  flashBadge:  { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 16, elevation: 12 },

  permission:  { alignItems: 'center', justifyContent: 'center', padding: 28 },
  permIcon:    { width: 84, height: 84, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  permTitle:   { fontSize: 20, fontWeight: '900', textAlign: 'center' },
  permBody:    { fontSize: 14, fontWeight: '600', textAlign: 'center', lineHeight: 20, marginTop: 6, marginBottom: 22 },
  permBtn:     { paddingHorizontal: 26, paddingVertical: 14, borderRadius: 16 },
  permBtnTxt:  { color: '#fff', fontSize: 15, fontWeight: '900' },
});
