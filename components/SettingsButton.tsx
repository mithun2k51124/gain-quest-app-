// components/SettingsButton.tsx — the gear in the top-right of every screen (Settings is no
// longer a tab). It turns like a tuning wheel before Settings opens.
import React from 'react';
import { useRouter, usePathname } from 'expo-router';
import { HeaderIconButton } from './HeaderIconButton';

export function SettingsButton() {
  const router = useRouter();
  const path = usePathname();
  return (
    <HeaderIconButton
      icon="settings-outline"
      motion="spin"
      label="Settings"
      // Remember where we came from so Settings' back arrow returns there
      onPress={() => router.navigate({ pathname: '/settings', params: { from: path } } as any)}
    />
  );
}
