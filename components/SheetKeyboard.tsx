// components/SheetKeyboard.tsx — keeps text boxes in pop-up sheets above the keyboard.
// The app draws edge to edge, so inside a Modal Android doesn't move anything up for the keyboard
// and often doesn't report it either. A SheetScroll adds room under its content while one of its
// SheetInputs is focused and scrolls that box up near the top of the sheet.
import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { ScrollView, ScrollViewProps, TextInput, TextInputProps, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKeyboardHeight } from './FoodPortion';

type Ctx = { focus: (input: any) => void; blur: () => void };
const SheetCtx = createContext<Ctx | null>(null);

/**
 * The scrolling body of a bottom sheet with inputs. Its height is capped to the screen minus
 * `reserve` (room for the sheet's own header and padding above and below it).
 */
export function SheetScroll({ children, contentContainerStyle, style, reserve = 60, ...rest }:
  ScrollViewProps & { children: React.ReactNode; reserve?: number }) {
  const scrollRef = useRef<ScrollView>(null);
  const innerRef = useRef<View>(null);
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const kb = useKeyboardHeight();
  const [typing, setTyping] = useState(false);

  const focus = useCallback((input: any) => {
    setTyping(true);
    // Wait for the extra room to lay out, then bring the box up under the sheet's top
    setTimeout(() => {
      if (!input?.measureLayout || !innerRef.current) return;
      input.measureLayout(innerRef.current, (_x: number, y: number) => {
        scrollRef.current?.scrollTo({ y: Math.max(0, y - 70), animated: true });
      }, () => {});
    }, 120);
  }, []);
  const blur = useCallback(() => setTyping(false), []);

  const room = typing ? (kb || Math.round(height * 0.42)) : 0;
  return (
    <SheetCtx.Provider value={{ focus, blur }}>
      <ScrollView
        ref={scrollRef}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        style={[{ maxHeight: height - insets.top - reserve }, style]}
        contentContainerStyle={[contentContainerStyle, { paddingBottom: room }]}
        {...rest}
      >
        <View ref={innerRef} collapsable={false}>{children}</View>
      </ScrollView>
    </SheetCtx.Provider>
  );
}

/** A TextInput that tells the SheetScroll around it when it has the keyboard. */
export const SheetInput = React.forwardRef<TextInput, TextInputProps>(function SheetInput(props, ref) {
  const ctx = useContext(SheetCtx);
  const own = useRef<TextInput>(null);
  const setRef = (r: TextInput | null) => {
    own.current = r;
    if (typeof ref === 'function') ref(r);
    else if (ref) ref.current = r;
  };
  return (
    <TextInput
      {...props}
      ref={setRef}
      onFocus={e => { ctx?.focus(own.current); props.onFocus?.(e); }}
      onBlur={e => { ctx?.blur(); props.onBlur?.(e); }}
    />
  );
});
