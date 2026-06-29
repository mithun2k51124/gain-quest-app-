import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Tabs } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { initializeDatabase } from '../db/database';
import { C } from '../constants/theme';

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      initializeDatabase();
      setReady(true);
    } catch (e: any) {
      setError(e.message);
    }
  }, []);

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>DB Error: {error}</Text>
      </View>
    );
  }

  if (!ready) {
    return (
      <View style={styles.center}>
        <Text style={styles.logo}>🏋️</Text>
        <Text style={styles.logoText}>GainQuest</Text>
        <Text style={styles.subText}>Loading...</Text>
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="light" backgroundColor={C.bg} />
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: C.surface,
            borderTopColor: C.border,
            borderTopWidth: 1,
            height: 60,
            paddingBottom: 8,
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
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    backgroundColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: { fontSize: 64, marginBottom: 12 },
  logoText: { fontSize: 28, fontWeight: '800', color: C.text, marginBottom: 6 },
  subText: { fontSize: 14, color: C.muted },
  errorText: { fontSize: 14, color: C.red, textAlign: 'center', padding: 20 },
});