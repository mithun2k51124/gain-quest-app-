// components/DragWidget.tsx — the reorderable widget board used by Home and Tracker.
//
// Hold a widget to lift it: it pops up under your finger while the rest of the board frosts
// over (a real blur on Android 12+ and iOS, a tinted glass elsewhere). Each widget behind the
// glass keeps a small name tag, so you can still tell them apart. Drag over another widget and
// they swap places; let go and it settles into its slot.
//
// How it stays smooth and glitch-free
// - Every widget is absolutely positioned from a shared order + measured heights, so all motion
//   (the lift, the swaps, the drop) is transforms on the UI thread. React's child order never
//   changes, so committing the new order can't flicker.
// - The lifted widget is drawn as a copy above the glass; the original keeps its slot.
// - The lift is a Pan that activates after a long press: a quick tap still reaches the buttons
//   inside a widget, scrolling or a sideways swipe cancels it, and while it's active neither the
//   list nor the tab swipe can move.
import React, {
  forwardRef, memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState,
} from 'react';
import { StyleSheet, View, Text, LayoutChangeEvent, StyleProp, ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing, SharedValue, interpolate, makeMutable, measure, runOnJS, scrollTo, useAnimatedReaction,
  useAnimatedRef, useAnimatedScrollHandler, useAnimatedStyle, useFrameCallback, useSharedValue,
  withSpring, withTiming, Extrapolation,
} from 'react-native-reanimated';
import { BlurView, BlurTargetView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../contexts/ThemeContext';
import { setSwipeLocked } from '../utils/swipeLock';
import { PullToRefresh } from './PullToRefresh';

const LONG_PRESS_MS = 280;
const LIFT_SCALE = 1.035;
const EDGE = 70;           // px from the top / bottom edge where dragging scrolls the list
const MAX_AUTO_SCROLL = 14; // px per frame
const SWAP_SPRING = { damping: 20, stiffness: 240, mass: 0.7 };
const DROP_SPRING = { damping: 18, stiffness: 210, mass: 0.75 };

export interface WidgetLabel { title: string; icon: string; color: string }

export interface DragBoardHandle {
  /** Scroll a widget into view; viewPosition 0 = top of the screen. */
  scrollToKey: (key: string, viewPosition?: number) => void;
}

interface Props<K extends string> {
  data: K[];
  onReorder: (next: K[]) => void;
  /** lifted = drawn as the copy that follows the finger */
  renderItem: (key: K, lifted: boolean) => React.ReactNode;
  labelFor: (key: K) => WidgetLabel;
  onRefresh?: () => void;
  footer?: React.ReactNode;
  /** horizontal and top padding of the board; bottom room comes from bottomInset */
  padding?: number;
  bottomInset?: number;
  gap?: number;
  style?: StyleProp<ViewStyle>;
}

/** Top of each widget (relative to the first one) for an order and measured heights. */
function topsFor(order: string[], heights: Record<string, number>, gap: number): Record<string, number> {
  'worklet';
  const out: Record<string, number> = {};
  let y = 0;
  for (let i = 0; i < order.length; i++) {
    out[order[i]] = y;
    y += (heights[order[i]] ?? 0) + gap;
  }
  return out;
}

function DragBoardInner<K extends string>(
  { data, onReorder, renderItem, labelFor, onRefresh, footer, padding = 16, bottomInset = 120, gap = 6, style }: Props<K>,
  ref: React.ForwardedRef<DragBoardHandle>,
) {
  const { C, isDark } = useTheme();

  // ── Shared state ──
  const order = useSharedValue<string[]>(data);
  const heights = useSharedValue<Record<string, number>>({});
  const measured = useSharedValue(0);       // 1 once every widget has a height
  const active = useSharedValue<string | null>(null);
  const ghostReady = useSharedValue(0);     // the copy is mounted and laid out
  const dropping = useSharedValue(0);
  const springy = useSharedValue(0);        // widgets glide (vs jump) to new spots
  const lift = useSharedValue(0);           // 0 → 1 as a widget lifts (glass, scale)
  const dragTop = useSharedValue(0);        // the copy's top, in board coordinates
  const startTop = useSharedValue(0);
  const fingerY = useSharedValue(0);        // finger, in board coordinates
  const pageY = useSharedValue(0);          // board's top on screen
  const scrollY = useSharedValue(0);
  const listTop = useSharedValue(0);      // first widget's y inside the scroll content
  const viewH = useSharedValue(0);
  const contentH = useSharedValue(0);

  const boardRef = useAnimatedRef<View>();
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const blurTarget = useRef<View>(null);
  const ghostRef = useRef<GhostHandle>(null);

  // Each widget's animated top lives outside React, keyed by widget
  const keysSig = [...data].sort().join('|');
  const ys = useMemo(
    () => Object.fromEntries(data.map(k => [k, makeMutable(0)])) as Record<string, SharedValue<number>>,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [keysSig],
  );
  // React renders widgets in a fixed order, so reordering never moves native views
  const stableKeys = useMemo(() => [...data].sort() as K[], [keysSig]); // eslint-disable-line react-hooks/exhaustive-deps

  // A new order from outside (reset, arrows in Customize) is adopted when nothing is being dragged
  useEffect(() => {
    if (active.value) return;
    if (order.value.join('|') !== data.join('|')) {
      springy.value = 1;
      order.value = data;
      setTimeout(() => { if (!active.value) springy.value = 0; }, 450);
    }
  }, [data, active, order, springy]);

  // Positions follow the order and heights
  useAnimatedReaction(
    () => topsFor(order.value, heights.value, gap),
    (tops) => {
      for (const k of Object.keys(tops)) {
        const y = ys[k];
        if (!y) continue;
        if (springy.value && measured.value) y.value = withSpring(tops[k], SWAP_SPRING);
        else y.value = tops[k];
      }
    },
    [ys, gap],
  );

  // Nothing shows until every widget has been measured (one frame), so nothing jumps into place
  const totalH = useAnimatedStyle(() => {
    let h = 0;
    for (const k of order.value) h += (heights.value[k] ?? 0) + gap;
    return { height: h, opacity: withTiming(measured.value, { duration: 160 }) };
  });
  const footerFade = useAnimatedStyle(() => ({ opacity: withTiming(measured.value, { duration: 160 }) }));

  // Heights are collected in a plain JS record: all widgets report in the same frame, and a shared
  // value written from JS isn't readable back straight away, so building on it would drop reports
  const heightsJS = useRef<Record<string, number>>({});
  const shownRef = useRef(false);
  const onItemLayout = useCallback((key: string, h: number) => {
    const cur = heightsJS.current;
    if (Math.abs((cur[key] ?? -1) - h) < 0.5) return;
    const next = { ...cur, [key]: h };
    heightsJS.current = next;
    heights.value = next;
    if (!shownRef.current && Object.keys(ys).every(k => next[k] !== undefined)) {
      shownRef.current = true;
      measured.value = 1;
    }
  }, [heights, measured, ys]);

  // Never stay hidden: show the board even if a widget somehow never reports its height
  useEffect(() => {
    const t = setTimeout(() => {
      if (!shownRef.current) { shownRef.current = true; measured.value = 1; }
    }, 500);
    return () => clearTimeout(t);
  }, [measured]);

  // ── Drag lifecycle (JS side) ──
  // Gestures are built once, so they reach the latest props through refs
  const dataRef = useRef(data);
  dataRef.current = data;
  const onReorderRef = useRef(onReorder);
  onReorderRef.current = onReorder;
  const autoScrollRef = useRef<ReturnType<typeof useFrameCallback> | null>(null);

  const onLift = useCallback((key: string) => {
    setSwipeLocked(true);
    autoScrollRef.current?.setActive(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    ghostRef.current?.show(key);
  }, []);

  const onSwap = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
  }, []);

  const onDrop = useCallback((next: string[]) => {
    autoScrollRef.current?.setActive(false);
    ghostRef.current?.hide();
    setSwipeLocked(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (next.join('|') !== dataRef.current.join('|')) onReorderRef.current(next as K[]);
    setTimeout(() => { if (!active.value) springy.value = 0; }, 450);
  }, [active, springy]);

  // ── Drag lifecycle (UI side) ──
  const reorderFromDrag = () => {
    'worklet';
    const k = active.value;
    if (!k) return;
    const others = order.value.filter(x => x !== k);
    // The copy's top inside the list → the slot whose top is nearest
    const y = dragTop.value + scrollY.value - listTop.value;
    let best = 0;
    let bestDist = Number.MAX_VALUE;
    let acc = 0;
    for (let p = 0; p <= others.length; p++) {
      const d = Math.abs(y - acc);
      if (d < bestDist) { bestDist = d; best = p; }
      if (p < others.length) acc += (heights.value[others[p]] ?? 0) + gap;
    }
    if (order.value.indexOf(k) !== best) {
      const next = others.slice();
      next.splice(best, 0, k);
      order.value = next;
      runOnJS(onSwap)();
    }
  };

  const drop = () => {
    'worklet';
    const k = active.value;
    if (!k || dropping.value) return;
    dropping.value = 1;
    const tops = topsFor(order.value, heights.value, gap);
    const target = listTop.value + (tops[k] ?? 0) - scrollY.value;
    lift.value = withTiming(0, { duration: 280, easing: Easing.out(Easing.cubic) });
    dragTop.value = withSpring(target, DROP_SPRING, () => {
      // Swap the copy for the original in the same frame
      active.value = null;
      ghostReady.value = 0;
      dropping.value = 0;
      runOnJS(onDrop)(order.value);
    });
  };

  // Near the top or bottom edge, the list scrolls under the finger (runs only while lifted)
  const autoScroll = useFrameCallback(() => {
    if (!active.value || dropping.value) return;
    const f = fingerY.value;
    let v = 0;
    if (f < EDGE) v = -MAX_AUTO_SCROLL * Math.min(1, (EDGE - f) / EDGE);
    else if (f > viewH.value - EDGE) v = MAX_AUTO_SCROLL * Math.min(1, (f - (viewH.value - EDGE)) / EDGE);
    if (!v) return;
    const max = Math.max(0, contentH.value - viewH.value);
    const next = Math.min(max, Math.max(0, scrollY.value + v));
    if (next === scrollY.value) return;
    scrollY.value = next;
    scrollTo(scrollRef, 0, next, false);
    reorderFromDrag();
  }, false);
  autoScrollRef.current = autoScroll;

  const gestureFor = (key: string) => Gesture.Pan()
    .activateAfterLongPress(LONG_PRESS_MS)
    .onStart(e => {
      if (active.value || dropping.value) return;
      const m = measure(boardRef);
      pageY.value = m ? m.pageY : 0;
      const tops = topsFor(order.value, heights.value, gap);
      const top = listTop.value + (tops[key] ?? 0) - scrollY.value;
      startTop.value = top;
      dragTop.value = top;
      fingerY.value = e.absoluteY - pageY.value;
      springy.value = 1;
      active.value = key;
      lift.value = withTiming(1, { duration: 220, easing: Easing.out(Easing.cubic) });
      runOnJS(onLift)(key);
    })
    .onUpdate(e => {
      if (active.value !== key || dropping.value) return;
      dragTop.value = startTop.value + e.translationY;
      fingerY.value = e.absoluteY - pageY.value;
      reorderFromDrag();
    })
    .onFinalize(() => {
      if (active.value === key) drop();
    });
  // One gesture per widget, kept for the board's lifetime
  const gestures = useMemo(
    () => Object.fromEntries(stableKeys.map(k => [k, gestureFor(k)])) as Record<string, ReturnType<typeof Gesture.Pan>>,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stableKeys, gap],
  );

  const onScroll = useAnimatedScrollHandler({
    onScroll: e => {
      // While dragging, auto-scroll owns the offset
      if (!active.value) scrollY.value = e.contentOffset.y;
    },
  });

  // JS copies of the layout numbers, for scrolling from JS (shared values may lag behind there)
  const listTopJS = useRef(0);
  const viewHJS = useRef(0);
  useImperativeHandle(ref, () => ({
    scrollToKey: (key, viewPosition = 0) => {
      const tops = topsFor(dataRef.current, heightsJS.current, gap);
      if (tops[key] === undefined) return;
      const y = Math.max(0, listTopJS.current + tops[key] - viewPosition * viewHJS.current - 8);
      scrollRef.current?.scrollTo({ y, animated: true });
    },
  }), [gap, scrollRef]);

  // Release the tab swipe if the board unmounts mid-drag
  useEffect(() => () => setSwipeLocked(false), []);

  const list = (
    <BlurTargetView ref={blurTarget} style={styles.fill}>
      <Animated.ScrollView
        ref={scrollRef}
        onScroll={onScroll}
        scrollEventThrottle={16}
        overScrollMode="never"
        showsVerticalScrollIndicator={false}
        onLayout={e => { viewH.value = e.nativeEvent.layout.height; viewHJS.current = e.nativeEvent.layout.height; }}
        onContentSizeChange={(_, h) => { contentH.value = h; }}
        contentContainerStyle={{ paddingHorizontal: padding, paddingTop: padding, paddingBottom: bottomInset }}
      >
        <Animated.View style={totalH} onLayout={e => { listTop.value = e.nativeEvent.layout.y; listTopJS.current = e.nativeEvent.layout.y; }}>
          {stableKeys.map(k => (
            <BoardItem key={k} itemKey={k} y={ys[k]} active={active} ghostReady={ghostReady} lift={lift}
              gesture={gestures[k]} onHeight={onItemLayout} render={renderItem} />
          ))}
        </Animated.View>
        <Animated.View style={footerFade}>{footer}</Animated.View>
      </Animated.ScrollView>
    </BlurTargetView>
  );

  return (
    <View ref={boardRef} style={[styles.fill, style]} collapsable={false}>
      {onRefresh ? <PullToRefresh onRefresh={onRefresh} scrollY={scrollY}>{list}</PullToRefresh> : list}

      {/* Everything above the list only shows while a widget is lifted */}
      <Glass target={blurTarget} lift={lift} isDark={isDark} tint={C.bg} />
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {stableKeys.map(k => (
          <NameTag key={k} itemKey={k} label={labelFor(k)} y={ys[k]} heights={heights} active={active} lift={lift}
            listTop={listTop} scrollY={scrollY} left={padding} />
        ))}
        <SlotOutline active={active} ys={ys} heights={heights} lift={lift} listTop={listTop} scrollY={scrollY}
          inset={padding} color={C.accent} />
        <Ghost ref={ghostRef} render={renderItem} dragTop={dragTop} lift={lift} active={active}
          ghostReady={ghostReady} inset={padding} glow={C.accent} />
      </View>
    </View>
  );
}

export const DragBoard = forwardRef(DragBoardInner) as <K extends string>(
  props: Props<K> & { ref?: React.Ref<DragBoardHandle> }
) => React.ReactElement;

// ─────────────────────────────────────────────────────────────────────────────
// One widget on the board
// ─────────────────────────────────────────────────────────────────────────────

const BoardItem = memo(function BoardItem({ itemKey, y, active, ghostReady, lift, gesture, onHeight, render }: {
  itemKey: string;
  y: SharedValue<number>;
  active: SharedValue<string | null>;
  ghostReady: SharedValue<number>;
  lift: SharedValue<number>;
  gesture: ReturnType<typeof Gesture.Pan>;
  onHeight: (key: string, h: number) => void;
  render: (key: any, lifted: boolean) => React.ReactNode;
}) {
  const style = useAnimatedStyle(() => {
    const isActive = active.value === itemKey;
    // The others sink back a touch behind the glass
    const sink = isActive ? 1 : interpolate(lift.value, [0, 1], [1, 0.97], Extrapolation.CLAMP);
    return {
      transform: [{ translateY: y.value }, { scale: sink }],
      opacity: isActive && ghostReady.value ? 0 : 1,
    };
  });
  const onLayout = (e: LayoutChangeEvent) => onHeight(itemKey, e.nativeEvent.layout.height);
  return (
    <Animated.View style={[styles.item, style]} onLayout={onLayout}>
      <GestureDetector gesture={gesture}>
        <View collapsable={false}>{render(itemKey, false)}</View>
      </GestureDetector>
    </Animated.View>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// The glass, name tags, drop slot and the lifted copy
// ─────────────────────────────────────────────────────────────────────────────

function Glass({ target, lift, isDark, tint }: {
  target: React.RefObject<View | null>; lift: SharedValue<number>; isDark: boolean; tint: string;
}) {
  // The blur is only switched on while something is lifted (an idle blur still costs frames)
  const [on, setOn] = useState(false);
  useAnimatedReaction(() => lift.value > 0.001, (now, prev) => {
    if (now !== prev) runOnJS(setOn)(now);
  });
  const fade = useAnimatedStyle(() => ({ opacity: lift.value }));
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, fade]}>
      <BlurView
        style={StyleSheet.absoluteFill}
        intensity={on ? 34 : 0}
        tint={isDark ? 'dark' : 'light'}
        blurMethod="dimezisBlurViewSdk31Plus"
        blurTarget={target}
      />
      {/* A light wash on top keeps it reading as frosted glass on every device */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: tint + (isDark ? '59' : '4D') }]} />
    </Animated.View>
  );
}

const TAG_H = 48;

function NameTag({ itemKey, label, y, heights, active, lift, listTop, scrollY, left }: {
  itemKey: string; label: WidgetLabel; y: SharedValue<number>; heights: SharedValue<Record<string, number>>;
  active: SharedValue<string | null>; lift: SharedValue<number>; listTop: SharedValue<number>;
  scrollY: SharedValue<number>; left: number;
}) {
  const { C, isDark } = useTheme();
  // A big label in the middle of each widget behind the glass, so you can see what's where
  const style = useAnimatedStyle(() => {
    const h = heights.value[itemKey] ?? TAG_H;
    return {
      opacity: active.value && active.value !== itemKey ? lift.value : 0,
      transform: [
        { translateY: listTop.value + y.value - scrollY.value + Math.max(6, h / 2 - TAG_H / 2 - 4) },
        { scale: interpolate(lift.value, [0, 1], [0.85, 1], Extrapolation.CLAMP) },
      ],
    };
  });
  return (
    <Animated.View style={[styles.tag, { left, right: left }, style]}>
      <View style={[styles.tagInner, {
        backgroundColor: isDark ? 'rgba(20,20,26,0.92)' : 'rgba(255,255,255,0.95)',
        borderColor: label.color,
        shadowColor: label.color,
      }]}>
        <View style={[styles.tagIcon, { backgroundColor: label.color }]}>
          <Ionicons name={label.icon as any} size={18} color="#fff" />
        </View>
        <Text style={[styles.tagTxt, { color: C.text }]} numberOfLines={1}>{label.title}</Text>
      </View>
    </Animated.View>
  );
}

function SlotOutline({ active, ys, heights, lift, listTop, scrollY, inset, color }: {
  active: SharedValue<string | null>; ys: Record<string, SharedValue<number>>; heights: SharedValue<Record<string, number>>;
  lift: SharedValue<number>; listTop: SharedValue<number>; scrollY: SharedValue<number>; inset: number; color: string;
}) {
  // Where the lifted widget will land: follows the empty slot as the others move
  const style = useAnimatedStyle(() => {
    const k = active.value;
    const y = k ? ys[k] : undefined;
    if (!k || !y) return { opacity: 0, height: 0, transform: [{ translateY: 0 }] };
    return {
      opacity: lift.value,
      height: Math.max(0, (heights.value[k] ?? 0) - 8),
      transform: [{ translateY: listTop.value + y.value - scrollY.value }],
    };
  });
  return <Animated.View style={[styles.slot, { left: inset, right: inset, borderColor: color + 'AA', backgroundColor: color + '14' }, style]} />;
}

interface GhostHandle { show: (key: string) => void; hide: () => void }

// The lifted copy sits on a glass panel a little bigger than the widget
const PAD_X = 8;
const PAD_TOP = 6;

const Ghost = forwardRef<GhostHandle, {
  render: (key: any, lifted: boolean) => React.ReactNode;
  dragTop: SharedValue<number>; lift: SharedValue<number>; active: SharedValue<string | null>;
  ghostReady: SharedValue<number>; inset: number; glow: string;
}>(function Ghost({ render, dragTop, lift, active, ghostReady, inset, glow }, ref) {
  const { isDark } = useTheme();
  const [key, setKey] = useState<string | null>(null);
  useImperativeHandle(ref, () => ({ show: setKey, hide: () => setKey(null) }), []);
  const style = useAnimatedStyle(() => ({
    opacity: active.value && ghostReady.value ? 1 : 0,
    transform: [
      { translateY: dragTop.value - PAD_TOP },
      { scale: interpolate(lift.value, [0, 1], [1, LIFT_SCALE], Extrapolation.CLAMP) },
    ],
    shadowOpacity: interpolate(lift.value, [0, 1], [0, 0.45]),
  }));
  const ring = useAnimatedStyle(() => ({ opacity: lift.value }));
  if (!key) return null;
  return (
    <Animated.View
      style={[styles.ghost, {
        left: inset - PAD_X, right: inset - PAD_X, paddingHorizontal: PAD_X, paddingTop: PAD_TOP,
        shadowColor: glow, backgroundColor: isDark ? 'rgba(14,14,20,0.78)' : 'rgba(250,252,255,0.80)',
      }, style]}
      onLayout={() => { ghostReady.value = 1; }}>
      {/* Widgets end with a 14 px card margin: trim most of it so the panel hugs the card */}
      <View style={{ marginBottom: -8 }}>{render(key, true)}</View>
      <Animated.View pointerEvents="none" style={[styles.ghostRing, { borderColor: glow }, ring]} />
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  fill:      { flex: 1 },
  item:      { position: 'absolute', top: 0, left: 0, right: 0 },
  ghost:     { position: 'absolute', top: 0, borderRadius: 24, shadowOffset: { width: 0, height: 14 }, shadowRadius: 22, elevation: 16 },
  ghostRing: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 24, borderWidth: 1.5 },
  slot:      { position: 'absolute', top: 0, borderRadius: 22, borderWidth: 1.5, borderStyle: 'dashed' },
  tag:       { position: 'absolute', top: 0, alignItems: 'center' },
  tagInner:  {
    height: TAG_H, flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 8, paddingRight: 18,
    borderRadius: TAG_H / 2, borderWidth: 2, shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
  tagIcon:   { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  tagTxt:    { fontSize: 17, fontWeight: '900', maxWidth: 240 },
});
