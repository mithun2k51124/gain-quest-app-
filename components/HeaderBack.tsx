// components/HeaderBack.tsx — back arrow for screens that aren't tabs (Settings, Analytics).
// Returns to the screen that opened them (the `from` param), else Home; Android back does the same.
import React, { useCallback } from 'react';
import { TouchableOpacity, StyleSheet, BackHandler } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '../contexts/ThemeContext';

export function HeaderBack({ self }: { self: string }) {
  const { C } = useTheme();
  const router = useRouter();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const goBack = useCallback(() => {
    router.navigate((from && from !== self ? from : '/') as any);
  }, [router, from, self]);
  useFocusEffect(useCallback(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { goBack(); return true; });
    return () => sub.remove();
  }, [goBack]));

  return (
    <TouchableOpacity style={[styles.btn, { backgroundColor: C.card, borderColor: C.border }]} onPress={goBack}
      activeOpacity={0.75} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel="Back">
      <Ionicons name="chevron-back" size={20} color={C.accent} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
});
