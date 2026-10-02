import 'react-native-gesture-handler';
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { GestureHandlerRootView, Gesture, GestureDetector } from 'react-native-gesture-handler';
import { View, Text, Animated, StyleSheet, Pressable } from 'react-native';
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

// Tab definitions — single source of truth
const TAB_DEFS = [
  { name: 'index',     label: 'Home',      icon: 'grid-outline' as const },
  { name: 'tracker',   label: 'Tracker',   icon: 'clipboard-outline' as const },
  { name: 'overall',   label: 'Overall',   icon: 'speedometer-outline' as const },
  { name: 'workouts',  label: 'Workouts',  icon: 'barbell-outline' as const },
  { name: 'prs',       label: 'PRs',       icon: 'trophy-outline' as const },
  { name: 'analytics', label: 'Analytics', icon: 'stats-chart-outline' as const },
  { name: 'settings',  label: 'Settings',  icon: 'settings-outline' as const },
];

// Custom tab button: full-width colored indicator line + spring press animation
function CustomTabButton({
  children,
  onPress,
  onLongPress,
  accessibilityState,
  accentColor,
  inactiveColor,
}: any) {
  const isActive = accessibilityState?.selected;
  const scaleAnim = useMemo(() => new Animated.Value(1), []);

  const handlePressIn = useCallback(() => {
    Animated.spring(scaleAnim, {
      toValue: 0.85,
      useNativeDriver: true,
      speed: 30,
      bounciness: 6,
    }).start();
  }, [scaleAnim]);

  const handlePressOut = useCallback(() => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 20,
      bounciness: 10,
    }).start();
  }, [scaleAnim]);

  const lineColor = isActive ? accentColor : 'transparent';

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      android_ripple={{ color: `${accentColor}33`, borderless: false }}
      style={tabStyles.buttonOuter}
      accessibilityRole="button"
      accessibilityState={accessibilityState}
    >
      {/* Full-width indicator line at top */}
      <View
        style={[
          tabStyles.indicatorLine,
          {
            backgroundColor: lineColor,
            shadowColor: lineColor,
            shadowOpacity: isActive ? 0.9 : 0,
            shadowRadius: 5,
            shadowOffset: { width: 0, height: 1 },
            elevation: isActive ? 5 : 0,
          },
        ]}
      />
      {/* Icon + label with spring scale */}
      <Animated.View
        style={[tabStyles.tabContent, { transform: [{ scale: scaleAnim }] }]}
      >
        {children}
      </Animated.View>
    </Pressable>
  );
}

const tabStyles = StyleSheet.create({
  buttonOuter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    overflow: 'hidden',
  },
  indicatorLine: {
    width: '100%',
    height: 3,
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 2,
  },
  tabContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
});

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
      .activeOffsetX([-15, 15])
      .failOffsetY([-35, 35])
      .onEnd((e) => {
        const isQuickFling = Math.abs(e.velocityX) > 200 && Math.abs(e.translationX) > 16;
        const isLongSwipe = Math.abs(e.translationX) > 40;
        if ((isQuickFling || isLongSwipe) && Math.abs(e.translationX) > Math.abs(e.translationY)) {
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
                // Taller bar so all 7 tabs (icon + label) are fully visible
                height: 68,
                paddingBottom: 0,
                paddingTop: 0,
                shadowColor: isDark ? '#000000' : '#BFC8D6',
                shadowOffset: { width: 0, height: -4 },
                shadowOpacity: 0.8,
                shadowRadius: 10,
                elevation: 12,
              },
              tabBarActiveTintColor: C.accent,
              tabBarInactiveTintColor: C.muted,
              tabBarLabelStyle: {
                fontSize: 9,
                fontWeight: '600',
                marginTop: 0,
                marginBottom: 4,
              },
              tabBarIconStyle: {
                marginTop: 2,
              },
              tabBarItemStyle: {
                paddingHorizontal: 0,
                paddingVertical: 0,
              },
            }}
          >
        {TAB_DEFS.map((tab) => (
          <Tabs.Screen
            key={tab.name}
            name={tab.name}
            options={{
              title: tab.label,
              tabBarIcon: ({ color }) => (
                <Ionicons name={tab.icon} size={20} color={color} />
              ),
              tabBarButton: (props) => (
                <CustomTabButton
                  {...props}
                  accentColor={C.accent}
                  inactiveColor={C.muted}
                />
              ),
            }}
          />
        ))}
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
