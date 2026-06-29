// app/settings.tsx — Settings Screen
import React, { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, Alert, RefreshControl,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  getGoals, updateGoals, getSetting, setSetting, Goals,
} from '../db/database';
import { Card, SectionHeader, Btn, SelectBtn, PickerModal, Toggle } from '../components/ui';
import { C } from '../constants/theme';

// Option generators
const range = (start: number, end: number, step = 1) => {
  const arr = [];
  for (let i = start; i <= end; i += step) arr.push(i);
  return arr;
};

const WATER_OPTS   = range(1, 6, 0.5).map(v => ({ label: `${v} L`, value: String(v) }));
const PROTEIN_OPTS = range(60, 300, 5).map(v => ({ label: `${v} g`, value: String(v) }));
const CAL_OPTS     = range(1200, 5000, 50).map(v => ({ label: `${v} kcal`, value: String(v) }));
const WEIGHT_OPTS  = range(40, 150, 0.5).map(v => ({ label: `${v} kg`, value: String(v) }));
const CREAT_OPTS   = ['3','3.5','4','4.5','5','5.5','6','7','8','10'].map(v => ({ label: `${v} g`, value: v }));

type ModalKey = 'water'|'protein'|'calories'|'weight'|'creatine'|null;

export default function SettingsScreen() {
  const [goals,    setGoals]    = useState<Goals | null>(null);
  const [darkMode, setDarkMode] = useState(true);
  const [name,     setNameVal]  = useState('Athlete');
  const [modal,    setModal]    = useState<ModalKey>(null);
  const [refresh,  setRefresh]  = useState(false);

  // Pending changes
  const [pending, setPending] = useState<Partial<Goals>>({});

  const load = useCallback(() => {
    const g = getGoals();
    setGoals(g);
    setPending({});
    setDarkMode(getSetting('dark_mode', 'true') === 'true');
    setNameVal(getSetting('name', 'Athlete'));
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  const onRefresh = () => { setRefresh(true); load(); setRefresh(false); };

  if (!goals) return null;

  const merged = { ...goals, ...pending };

  const setPend = (key: keyof Goals, val: number) => {
    setPending(p => ({ ...p, [key]: val }));
  };

  const saveGoals = () => {
    if (!Object.keys(pending).length) {
      Alert.alert('No changes', 'Adjust a goal first.');
      return;
    }
    updateGoals(pending);
    setSetting('name', name);
    setSetting('dark_mode', darkMode ? 'true' : 'false');
    load();
    Alert.alert('Saved ✓', 'Your goals have been updated!');
  };

  const modalOptions: Record<NonNullable<ModalKey>, { opts: {label:string;value:string}[]; key: keyof Goals }> = {
    water:    { opts: WATER_OPTS,   key: 'water_goal' },
    protein:  { opts: PROTEIN_OPTS, key: 'protein_goal' },
    calories: { opts: CAL_OPTS,     key: 'calorie_goal' },
    weight:   { opts: WEIGHT_OPTS,  key: 'weight_goal' },
    creatine: { opts: CREAT_OPTS,   key: 'creatine_dose' },
  };

  const curModal = modal ? modalOptions[modal] : null;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Settings</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refresh} onRefresh={onRefresh} tintColor={C.accent} />}>

        {/* ── Goals ────────────────────────────────────────────────────── */}
        <SectionHeader title="🎯 Daily Goals" />
        <Card accent={C.accent}>
          <View style={styles.section}>
            <SelectBtn label="💧 Water Goal"
              value={`${merged.water_goal} L / day`}
              color={C.water}
              onPress={() => setModal('water')} />
            <SelectBtn label="🥩 Protein Goal"
              value={`${merged.protein_goal} g / day`}
              color={C.protein}
              onPress={() => setModal('protein')} />
            <SelectBtn label="🔥 Calorie Goal"
              value={`${merged.calorie_goal} kcal / day`}
              color={C.calories}
              onPress={() => setModal('calories')} />
            <SelectBtn label="⚖️ Weight Goal"
              value={`${merged.weight_goal} kg`}
              color={C.water}
              onPress={() => setModal('weight')} />
            <SelectBtn label="💊 Creatine Dose"
              value={`${merged.creatine_dose} g / day`}
              color={C.green}
              onPress={() => setModal('creatine')} />

            {Object.keys(pending).length > 0 && (
              <View style={styles.pendingBanner}>
                <Text style={styles.pendingText}>
                  {Object.keys(pending).length} change{Object.keys(pending).length > 1 ? 's' : ''} pending
                </Text>
              </View>
            )}

            <Btn label="💾  Save Goals" color={C.accent} onPress={saveGoals} />
          </View>
        </Card>

        {/* ── Preferences ──────────────────────────────────────────────── */}
        <SectionHeader title="⚙️ Preferences" />
        <Card accent="#607D8B">
          <View style={styles.section}>
            <View style={styles.prefRow}>
              <View>
                <Text style={styles.prefLabel}>Dark Mode</Text>
                <Text style={styles.prefSub}>Always on for best experience</Text>
              </View>
              <Toggle value={darkMode} onToggle={() => setDarkMode(v => !v)} />
            </View>
          </View>
        </Card>

        {/* ── About ────────────────────────────────────────────────────── */}
        <SectionHeader title="ℹ️ About" />
        <Card accent="#607D8B">
          <View style={styles.section}>
            {[
              { label: 'App', value: 'GainQuest Mobile' },
              { label: 'Version', value: '1.0.0' },
              { label: 'Framework', value: 'React Native + Expo' },
              { label: 'Database', value: 'SQLite (local)' },
              { label: 'Charts', value: 'Victory Native' },
              { label: 'Original', value: 'Python + CustomTkinter' },
            ].map(({ label, value }) => (
              <View key={label} style={styles.aboutRow}>
                <Text style={styles.aboutLabel}>{label}</Text>
                <Text style={styles.aboutValue}>{value}</Text>
              </View>
            ))}
            <Text style={styles.privacyNote}>
              All data is stored locally on your device.{'\n'}
              No internet connection required. No data is ever sent anywhere.
            </Text>
          </View>
        </Card>

        {/* ── Danger Zone ──────────────────────────────────────────────── */}
        <SectionHeader title="⚠️ Data" />
        <Card accent={C.red}>
          <View style={styles.section}>
            <Text style={styles.dangerText}>
              Your data is stored in a local SQLite database on this device.
              Uninstalling the app will delete all data permanently.
            </Text>
          </View>
        </Card>

      </ScrollView>

      {/* Picker modal for any goal */}
      {modal && curModal && (
        <PickerModal
          visible={true}
          title={`Set ${modal.charAt(0).toUpperCase() + modal.slice(1)} Goal`}
          options={curModal.opts}
          onSelect={v => {
            const num = parseFloat(v);
            if (!isNaN(num)) setPend(curModal.key, num);
            setModal(null);
          }}
          onClose={() => setModal(null)}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:         { flex: 1, backgroundColor: C.bg },
  header:       { paddingHorizontal: 16, paddingVertical: 14, backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border },
  headerTitle:  { fontSize: 22, fontWeight: '800', color: C.text },
  scroll:       { padding: 16, paddingBottom: 40 },
  section:      { padding: 16 },
  prefRow:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  prefLabel:    { fontSize: 14, color: C.text, fontWeight: '600' },
  prefSub:      { fontSize: 11, color: C.muted, marginTop: 2 },
  pendingBanner:{ backgroundColor: C.accentDim, borderRadius: 10, padding: 10, marginBottom: 12, alignItems: 'center' },
  pendingText:  { color: C.accent, fontSize: 13, fontWeight: '700' },
  aboutRow:     { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.border },
  aboutLabel:   { fontSize: 13, color: C.muted },
  aboutValue:   { fontSize: 13, color: C.textSub, fontWeight: '600' },
  privacyNote:  { fontSize: 12, color: C.muted, textAlign: 'center', marginTop: 16, lineHeight: 18 },
  dangerText:   { fontSize: 13, color: C.muted, lineHeight: 20 },
});
