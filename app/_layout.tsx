import 'react-native-gesture-handler';
import React, { useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { View, Text } from 'react-native';
import { Tabs } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { initializeDatabase, getOnboardingComplete } from '../db/database';
import { ThemeProvider, useTheme } from '../contexts/ThemeContext';
import { AlertProvider } from '../contexts/AlertContext';
import OnboardingModal from '../components/OnboardingModal';
import AIWorkoutLogger from '../components/AIWorkoutLogger';

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
      <Tabs
        screenOptions={{
          headerShown: false,
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
