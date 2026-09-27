import 'react-native-gesture-handler';
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { GestureHandlerRootView, Gesture, GestureDetector } from 'react-native-gesture-handler';
import { View, Text } from 'react-native';
import { Tabs, useRouter, usePathname } from 'expo-router';

import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { initializeDatabase, getOnboardingComplete } from '../db/database';
import { ThemeProvider, useTheme } from '../contexts/ThemeContext';
import { AlertProvider } from '../contexts/AlertContext';
import OnboardingModal from '../components/OnboardingModal';
import AIWorkoutLogger from '../components/AIWorkoutLogger';

const TAB_ROUTES = [
  '/',
  '/tracker',
  '/overall',
  '/workouts',
  '/prs',
  '/analytics',
  '/settings',
];


const getTabIndex = (path: string): number => {
  if (!path || path === '/' || path === '') return 0;
  if (path.startsWith('/tracker')) return 1;
  if (path.startsWith('/overall')) return 2;
  if (path.startsWith('/workouts')) return 3;
  if (path.startsWith('/prs')) return 4;
  if (path.startsWith('/analytics')) return 5;
  if (path.startsWith('/settings')) return 6;
  return -1;
};

export default function RootLayout() {
  return (
    <ThemeProvider>
      <AlertProvider>
        <RootLayoutInner />
      </AlertProvider>
    </ThemeProvider>
  );
}

function RootLayoutInner() {
  const { C, isDark } = useTheme();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);

  const router = useRouter();
  const pathname = usePathname();

  const handleSwipeLeft = useCallback(() => {
    const idx = getTabIndex(pathname);
    if (idx >= 0 && idx < TAB_ROUTES.length - 1) {
      router.navigate(TAB_ROUTES[idx + 1] as any);
    }
  }, [pathname, router]);

  const handleSwipeRight = useCallback(() => {
    const idx = getTabIndex(pathname);
    if (idx > 0) {
      router.navigate(TAB_ROUTES[idx - 1] as any);
    }
  }, [pathname, router]);

  const panGesture = useMemo(() => {
    return Gesture.Pan()
      .runOnJS(true)
      .activeOffsetX([-20, 20])
      .failOffsetY([-18, 18])
      .onEnd((e) => {
        const isQuickFling = Math.abs(e.velocityX) > 260 && Math.abs(e.translationX) > 16;
        const isLongSwipe = Math.abs(e.translationX) > 48;
        if (isQuickFling || isLongSwipe) {
          if (e.translationX < 0) {
            handleSwipeLeft();
          } else {
            handleSwipeRight();
          }
        }
      });
  }, [handleSwipeLeft, handleSwipeRight]);

  useEffect(() => {
    try {
      initializeDatabase();
      const done = getOnboardingComplete();
      setShowOnboarding(!done);
      setReady(true);
    } catch (e: any) {
      setError(e.message);
    }
  }, []);

  if (error) {
    return (
      <View style={{ flex:1, backgroundColor: C.bg, alignItems:'center', justifyContent:'center' }}>
        <Text style={{ fontSize: 14, color: C.red, textAlign: 'center', padding: 20 }}>DB Error: {error}</Text>
      </View>
    );
  }

  if (!ready) {
    return (
      <View style={{ flex:1, backgroundColor: C.bg, alignItems:'center', justifyContent:'center' }}>
        <Text style={{ fontSize: 64 }}>🏋️</Text>
        <Text style={{ fontSize: 28, fontWeight: '800', color: C.text, marginBottom: 6 }}>GainQuest</Text>
        <Text style={{ fontSize: 14, color: C.muted }}>Loading...</Text>
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider style={{ backgroundColor: C.bg }}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <GestureDetector gesture={panGesture}>
        <View style={{ flex: 1 }}>
          <Tabs
            screenOptions={{
              headerShown: false,
              animation: 'fade',
              tabBarStyle: {
                backgroundColor: C.bg,
                borderTopColor: C.border,
                borderTopWidth: 1,
                height: 60,
                paddingBottom: 8,
                shadowColor: '#BFC8D6',
                shadowOffset: { width: 0, height: -4 },
                shadowOpacity: 0.8,
                shadowRadius: 10,
                elevation: 12,
              },
              tabBarActiveTintColor: C.accent,
              tabBarInactiveTintColor: C.muted,
              tabBarLabelStyle: { fontSize: 10, fontWeight: '600' },
            }}
          >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Home',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="grid-outline" size={size} color={color} />
            ),
          }}
        />

        <Tabs.Screen
          name="tracker"
          options={{
            title: 'Tracker',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="clipboard-outline" size={size} color={color} />
            ),
          }}
        />

        <Tabs.Screen
          name="overall"
          options={{
            title: 'Overall',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="speedometer-outline" size={size} color={color} />
            ),
          }}
        />

        <Tabs.Screen
          name="workouts"
          options={{
            title: 'Workouts',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="barbell-outline" size={size} color={color} />
            ),
          }}
        />

        <Tabs.Screen
          name="prs"
          options={{
            title: 'PRs',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="trophy-outline" size={size} color={color} />
            ),
          }}
        />

        <Tabs.Screen
          name="analytics"
          options={{
            title: 'Analytics',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="stats-chart-outline" size={size} color={color} />
            ),
          }}
        />

        <Tabs.Screen
          name="settings"
          options={{
            title: 'Settings',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="settings-outline" size={size} color={color} />
            ),
          }}
        />
      </Tabs>
        </View>
      </GestureDetector>

      {/* First-launch onboarding — shown only once */}
      <OnboardingModal
        visible={showOnboarding}
        onComplete={() => setShowOnboarding(false)}
      />

      {/* Global AI Workout Logger FAB — visible on all tabs */}
      <AIWorkoutLogger />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
