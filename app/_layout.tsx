import 'react-native-gesture-handler';
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { GestureHandlerRootView, Gesture, GestureDetector } from 'react-native-gesture-handler';
import { View, Text } from 'react-native';
import { Tabs, useRouter, usePathname } from 'expo-router';

import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { initializeDatabase, getOnboardingComplete } from '../db/database';
import { ThemeProvider, useTheme } from '../contexts/ThemeContext';
import { AlertProvider } from '../contexts/AlertContext';
import OnboardingModal from '../components/OnboardingModal';
import AIWorkoutLogger from '../components/AIWorkoutLogger';
import { AnimatedTabBar, TabDef } from '../components/AnimatedTabBar';
import { initReminders, onReminderTap } from '../utils/reminders';
import { isSwipeLocked } from '../utils/swipeLock';

// Swipe order = tab bar order
const TAB_ROUTES = [
  '/',
  '/workouts',
  '/tracker',
  '/prs',
  '/overall',
];


const getTabIndex = (path: string): number => {
  if (!path || path === '/' || path === '') return 0;
  if (path.startsWith('/workouts')) return 1;
  if (path.startsWith('/tracker')) return 2;
  if (path.startsWith('/prs')) return 3;
  if (path.startsWith('/overall')) return 4;
  return -1;  // Settings and Analytics aren't tabs: no swiping from them
};

// Tab definitions — single source of truth (each tab has its own colour in the bar)
const TAB_DEFS: TabDef[] = [
  { name: 'index',    label: 'Home',     icon: 'grid-outline',        activeIcon: 'grid',        colorKey: 'accent' },
  { name: 'workouts', label: 'Workouts', icon: 'barbell-outline',     activeIcon: 'barbell',     colorKey: 'purple' },
  { name: 'tracker',  label: 'Tracker',  icon: 'clipboard-outline',   activeIcon: 'clipboard',   colorKey: 'teal' },
  { name: 'prs',      label: 'PRs',      icon: 'trophy-outline',      activeIcon: 'trophy',      colorKey: 'orange' },
  { name: 'overall',  label: 'Overall',  icon: 'speedometer-outline', activeIcon: 'speedometer', colorKey: 'green' },
];

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
      // Never a page swipe while a widget is being dragged (utils/swipeLock)
      .onTouchesMove((_e, manager) => { if (isSwipeLocked()) manager.fail(); })
      .activeOffsetX([-15, 15])
      // Mostly-vertical moves (scrolling, dragging widgets) are never a page swipe
      .failOffsetY([-24, 24])
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
      initReminders();
      const done = getOnboardingComplete();
      setShowOnboarding(!done);
      setReady(true);
    } catch (e: any) {
      setError(e.message);
    }
  }, []);

  // Tapping a reminder notification opens the matching part of the app
  useEffect(() => {
    if (!ready) return;
    return onReminderTap(kind => {
      // Small delay so the navigator is mounted when the app was launched by the tap
      setTimeout(() => {
        const t = String(Date.now());
        switch (kind) {
          case 'water':    router.navigate({ pathname: '/tracker', params: { openSection: 'water', t } } as any); break;
          case 'protein':  router.navigate({ pathname: '/tracker', params: { openSection: 'nutrition', t } } as any); break;
          case 'supplement': router.navigate({ pathname: '/tracker', params: { openSection: 'supplements', t } } as any); break;
          case 'workout':  router.navigate({ pathname: '/workouts', params: { openTab: 'Log' } } as any); break;
          default: break; // custom: just open the app
        }
      }, 300);
    });
  }, [ready, router]);

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
            }}
            tabBar={props => <AnimatedTabBar {...props} tabs={TAB_DEFS} />}
          >
        {TAB_DEFS.map((tab) => (
          <Tabs.Screen key={tab.name} name={tab.name} options={{ title: tab.label }} />
        ))}
        {/* Settings opens from the gear in each screen's header, not from the tab bar */}
        <Tabs.Screen name="settings" options={{ href: null, title: 'Settings' }} />
        {/* Analytics opens from the chart button in the Home header */}
        <Tabs.Screen name="analytics" options={{ href: null, title: 'Analytics' }} />
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
