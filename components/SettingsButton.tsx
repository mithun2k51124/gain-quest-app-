// components/SettingsButton.tsx — the gear in the top-right of every screen (Settings is no
// longer a tab). Same box as the Home header buttons.
import React from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, usePathname } from 'expo-router';
import { useTheme } from '../contexts/ThemeContext';

export function SettingsButton() {
  const { C, isDark } = useTheme();
  const router = useRouter();
  const path = usePathname();
  return (
    <TouchableOpacity
      style={[styles.btn, {
        backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)',
        borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)',
      }]}
      // Remember where we came from so Settings' back arrow returns there
      onPress={() => router.navigate({ pathname: '/settings', params: { from: path } } as any)}
      activeOpacity={0.75}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      accessibilityLabel="Settings"
    >
      <Ionicons name="settings-outline" size={18} color={C.accent} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
});
