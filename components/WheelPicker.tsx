// components/WheelPicker.tsx — compact scroll wheel for picking a number
import React, { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import { Animated, FlatList, NativeScrollEvent, NativeSyntheticEvent, Pressable, View } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { tick } from '../utils/tickFeedback';

type ItemProps = {
  label: string;
  i: number;
  scrollY: Animated.Value;
  itemHeight: number;
  fontSize: number;
  color: string;
  onPress: (i: number) => void;
};

// Memoised so scrolling never re-renders rows — all motion runs on the native driver
const WheelItem = memo(function WheelItem({ label, i, scrollY, itemHeight, fontSize, color, onPress }: ItemProps) {
  const anim = useMemo(() => {
    const inputRange = [-2, -1, 0, 1, 2].map(d => (i + d) * itemHeight);
    const opts = { inputRange, extrapolate: 'clamp' as const };
    return {
      opacity: scrollY.interpolate({ ...opts, outputRange: [0.15, 0.4, 1, 0.4, 0.15] }),
      scale: scrollY.interpolate({ ...opts, outputRange: [0.72, 0.84, 1, 0.84, 0.72] }),
      rotateX: scrollY.interpolate({ ...opts, outputRange: ['-70deg', '-38deg', '0deg', '38deg', '70deg'] }),
    };
  }, [scrollY, i, itemHeight]);

  return (
    <Pressable onPress={() => onPress(i)} style={{ height: itemHeight }}>
      <Animated.View style={{
        flex: 1, alignItems: 'center', justifyContent: 'center',
        opacity: anim.opacity,
        transform: [{ perspective: 300 }, { rotateX: anim.rotateX }, { scale: anim.scale }],
      }}>
        <Animated.Text style={{ fontSize, fontWeight: '800', color, fontVariant: ['tabular-nums'] }}>{label}</Animated.Text>
      </Animated.View>
    </Pressable>
  );
});

export function WheelPicker({
  items, index, onChange, width = 64, itemHeight = 34, visible = 3, fontSize = 20,
}: {
  items: string[];
  index: number;
  /** Called once the wheel comes to rest (or an item is tapped). */
  onChange: (index: number) => void;
  width?: number;
  itemHeight?: number;
  visible?: number;
  fontSize?: number;
}) {
  const { C } = useTheme();
  const listRef = useRef<FlatList<string>>(null);
  const scrollY = useRef(new Animated.Value(index * itemHeight)).current;
  const committed = useRef(index);  // last value reported to the parent
  const lastTickIdx = useRef(index);
  const armed = useRef(false);       // only tick for user-driven movement
  const placed = useRef(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const pad = (itemHeight * (visible - 1)) / 2;
  const clamp = useCallback((i: number) => Math.max(0, Math.min(items.length - 1, i)), [items.length]);

  // Tick + vibrate each time a new number crosses the centre
  useEffect(() => {
    const id = scrollY.addListener(({ value }) => {
      const i = clamp(Math.round(value / itemHeight));
      if (i !== lastTickIdx.current) {
        lastTickIdx.current = i;
        if (armed.current) tick();
      }
    });
    return () => scrollY.removeListener(id);
  }, [scrollY, itemHeight, clamp]);

  const commit = useCallback((i: number) => {
    const c = clamp(i);
    if (c !== committed.current) { committed.current = c; onChangeRef.current(c); }
  }, [clamp]);

  // Parent changed the value (typed in, or prefilled) → glide there without ticking
  useEffect(() => {
    if (index !== committed.current) {
      committed.current = index;
      armed.current = false;
      lastTickIdx.current = clamp(index);
      listRef.current?.scrollToOffset({ offset: clamp(index) * itemHeight, animated: true });
    }
  }, [index, itemHeight, clamp]);

  const onEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) =>
    commit(Math.round(e.nativeEvent.contentOffset.y / itemHeight));

  const onItemPress = useCallback((i: number) => {
    armed.current = true;
    listRef.current?.scrollToOffset({ offset: i * itemHeight, animated: true });
    commit(i);
  }, [itemHeight, commit]);

  const renderItem = useCallback(({ item, index: i }: { item: string; index: number }) => (
    <WheelItem label={item} i={i} scrollY={scrollY} itemHeight={itemHeight} fontSize={fontSize} color={C.text} onPress={onItemPress} />
  ), [scrollY, itemHeight, fontSize, C.text, onItemPress]);

  const spacer = useMemo(() => <View style={{ height: pad }} />, [pad]);

  return (
    <View style={{ width, height: itemHeight * visible, overflow: 'hidden' }}>
      {/* Selection band */}
      <View pointerEvents="none" style={{
        position: 'absolute', left: 2, right: 2, top: pad, height: itemHeight,
        borderRadius: 10, backgroundColor: C.accent + '1F',
      }} />
      <Animated.FlatList
        ref={listRef}
        data={items}
        keyExtractor={(_, i) => String(i)}
        renderItem={renderItem}
        ListHeaderComponent={spacer}
        ListFooterComponent={spacer}
        getItemLayout={(_, i) => ({ length: itemHeight, offset: pad + i * itemHeight, index: i })}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
        overScrollMode="never"
        snapToInterval={itemHeight}
        decelerationRate="fast"
        initialNumToRender={12}
        maxToRenderPerBatch={12}
        windowSize={5}
        contentOffset={{ x: 0, y: clamp(index) * itemHeight }}
        onLayout={() => {
          if (placed.current) return;
          placed.current = true;
          listRef.current?.scrollToOffset({ offset: clamp(committed.current) * itemHeight, animated: false });
        }}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
        scrollEventThrottle={16}
        onScrollBeginDrag={() => { armed.current = true; }}
        onScrollEndDrag={onEnd}
        onMomentumScrollEnd={onEnd}
      />
    </View>
  );
}
