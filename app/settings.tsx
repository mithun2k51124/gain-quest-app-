import React, { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl, TouchableOpacity,
  Modal, TextInput, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';;
import * as ImagePicker from 'expo-image-picker';
import {
  getGoals, updateGoals, getSetting, setSetting, Goals, resetDatabase,
} from '../db/database';
import { Card, SectionHeader, Btn, SelectBtn, PickerModal, Toggle } from '../components/ui';
import { useTheme } from '../contexts/ThemeContext';
import { useCustomAlert } from '../contexts/AlertContext';

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
  const { showAlert } = useCustomAlert();
  const { C, isDark, toggleDark } = useTheme();
  const [goals,    setGoals]    = useState<Goals | null>(null);
  const [name,     setNameVal]  = useState('Athlete');
  const [modal,    setModal]    = useState<ModalKey>(null);
  const [refresh,  setRefresh]  = useState(false);
  const [profilePic, setProfilePic] = useState<string | null>(null);
  const [editProfileVisible, setEditProfileVisible] = useState(false);
  const [editNameText, setEditNameText] = useState('');

  // Pending changes
  const [pending, setPending] = useState<Partial<Goals>>({});

  const load = useCallback(() => {
    const g = getGoals();
    setGoals(g);
    setPending({});
    setNameVal(getSetting('name', 'Athlete'));
    setProfilePic(getSetting('profile_pic', '') || null);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );
  const onRefresh = () => { setRefresh(true); load(); setRefresh(false); };

  const styles = makeStyles(C, isDark);

  if (!goals) return null;

  const merged = { ...goals, ...pending };

  const setPend = (key: keyof Goals, val: number) => {
    setPending((p: any) => ({ ...p, [key]: val }));
  };

  const saveGoals = () => {
    if (!Object.keys(pending).length) {
      showAlert('No changes', 'Adjust a goal first.');
      return;
    }
    updateGoals(pending);
    setSetting('name', name);
    load();
    showAlert('Saved ✓', 'Your goals have been updated!');
  };

  const handleResetData = () => {
    showAlert(
      'Reset All Data?',
      'This will permanently delete all daily logs, workout history, PRs, weight entries, and reset goals back to clean defaults. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset Everything',
          style: 'destructive',
          onPress: () => {
            resetDatabase();
            load();
            showAlert('App Reset ✓', 'All entries and logs have been reset.');
          },
        },
      ]
    );
  };

  const pickProfileImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        showAlert('Permission needed', 'Allow photo access to set a profile picture.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images',
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      });
      if (!result.canceled && result.assets[0]) {
        const uri = result.assets[0].uri;
        setSetting('profile_pic', uri);
        setProfilePic(uri);
      }
    } catch (e) {
      showAlert('Error', 'Could not pick image.');
    }
  };

  const saveProfile = () => {
    const n = editNameText.trim() || 'Athlete';
    setNameVal(n);
    setSetting('name', n);
    setEditProfileVisible(false);
    showAlert('Profile Updated ✓', `Name set to "${n}"`);
  };

  const initials = name
    .split(' ')
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const modalOptions: Record<NonNullable<ModalKey>, { opts: {label:string;value:string}[]; key: keyof Goals }> = {
    water:    { opts: WATER_OPTS,   key: 'water_goal' },
    protein:  { opts: PROTEIN_OPTS, key: 'protein_goal' },
    calories: { opts: CAL_OPTS,     key: 'calorie_goal' },
    weight:   { opts: WEIGHT_OPTS,  key: 'weight_goal' },
    creatine: { opts: CREAT_OPTS,   key: 'creatine_dose' },
  };

  const curModal = modal ? (modalOptions as any)[modal] : null;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Settings</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refresh} onRefresh={onRefresh} tintColor={C.accent} />}>

        {/* ── Profile Card ────────────────────────────────────────────────── */}
        <View style={styles.profileCard}>
          <TouchableOpacity style={styles.avatarWrap} onPress={pickProfileImage} activeOpacity={0.8}>
            {profilePic ? (
              <Image source={{ uri: profilePic }} style={styles.avatarImg} />
            ) : (
              <View style={[styles.avatarPlaceholder, { backgroundColor: C.accent + '22' }]}>
                <Text style={[styles.avatarInitials, { color: C.accent }]}>{initials}</Text>
              </View>
            )}
            <View style={[styles.avatarEditBadge, { backgroundColor: C.accent }]}>
              <Ionicons name="camera" size={12} color="#fff" />
            </View>
          </TouchableOpacity>

          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>{name}</Text>
            <Text style={styles.profileSub}>GainQuest Athlete</Text>
            <View style={styles.profileGoalRow}>
              <Ionicons name="scale-outline" size={12} color={C.muted} />
              <Text style={styles.profileGoalTxt}>  Goal: {merged.weight_goal} kg</Text>
              <Ionicons name="restaurant-outline" size={12} color={C.muted} style={{ marginLeft: 10 }} />
              <Text style={styles.profileGoalTxt}>  {merged.protein_goal}g protein</Text>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.editProfileBtn, { borderColor: C.accent }]}
            onPress={() => { setEditNameText(name); setEditProfileVisible(true); }}
          >
            <Ionicons name="pencil-outline" size={14} color={C.accent} />
            <Text style={[styles.editProfileTxt, { color: C.accent }]}>Edit</Text>
          </TouchableOpacity>
        </View>

        {/* ── Goals ────────────────────────────────────────────────────── */}
        <SectionHeader title="Daily Goals" icon="locate-outline" />
        <Card accent={C.accent}>
          <View style={styles.section}>
            <SelectBtn label="Water Goal"
              value={`${merged.water_goal} L / day`}
              color={C.water}
              icon="water-outline"
              onPress={() => setModal('water')} />
            <SelectBtn label="Protein Goal"
              value={`${merged.protein_goal} g / day`}
              color={C.protein}
              icon="restaurant-outline"
              onPress={() => setModal('protein')} />
            <SelectBtn label="Calorie Goal"
              value={`${merged.calorie_goal} kcal / day`}
              color={C.calories}
              icon="flame-outline"
              onPress={() => setModal('calories')} />
            <SelectBtn label="Weight Goal"
              value={`${merged.weight_goal} kg`}
              color={C.water}
              icon="scale-outline"
              onPress={() => setModal('weight')} />
            <SelectBtn label="Creatine Dose"
              value={`${merged.creatine_dose} g / day`}
              color={C.green}
              icon="flash-outline"
              onPress={() => setModal('creatine')} />

            {Object.keys(pending).length > 0 && (
              <View style={styles.pendingBanner}>
                <Text style={styles.pendingText}>
                  {Object.keys(pending).length} change{Object.keys(pending).length > 1 ? 's' : ''} pending
                </Text>
              </View>
            )}

            <Btn label="Save Goals" icon="save-outline" color={C.accent} onPress={saveGoals} />
          </View>
        </Card>

        {/* ── Preferences ──────────────────────────────────────────────── */}
        <SectionHeader title="Preferences" icon="settings-outline" />
        <Card accent="#607D8B">
          <View style={styles.section}>
            <View style={styles.prefRow}>
              <View>
                <Text style={styles.prefLabel}>Dark Mode</Text>
                <Text style={styles.prefSub}>Switch between light and dark themes</Text>
              </View>
              <Toggle value={isDark} onToggle={toggleDark} />
            </View>
          </View>
        </Card>

        {/* ── Data Management (no "Danger Zone" header) ────────────────── */}
        <SectionHeader title="Data Management" icon="server-outline" />
        <Card accent={C.red}>
          <View style={styles.section}>
            <Text style={styles.dangerText}>
              Resetting will permanently erase all workout sessions, exercises, daily logs, food and water records, PRs, and custom goals back to fresh start.
            </Text>
            <View style={{ marginTop: 16 }}>
              <Btn
                label="Reset All App Data"
                icon="trash-outline"
                color={C.red}
                onPress={handleResetData}
              />
            </View>
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

      {/* Edit Profile Modal */}
      <Modal visible={editProfileVisible} transparent animationType="slide" onRequestClose={() => setEditProfileVisible(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setEditProfileVisible(false)}>
          <TouchableOpacity activeOpacity={1} style={[styles.editModalSheet, { backgroundColor: C.card }]} onPress={e => e.stopPropagation()}>
            <View style={styles.editModalHandle} />
            <Text style={[styles.editModalTitle, { color: C.text }]}>Edit Profile</Text>

            <TouchableOpacity style={[styles.bigAvatarWrap]} onPress={pickProfileImage} activeOpacity={0.8}>
              {profilePic ? (
                <Image source={{ uri: profilePic }} style={styles.bigAvatar} />
              ) : (
                <View style={[styles.bigAvatar, { backgroundColor: C.accent + '22', alignItems: 'center', justifyContent: 'center' }]}>
                  <Text style={[styles.avatarInitials, { color: C.accent, fontSize: 32 }]}>{initials}</Text>
                </View>
              )}
              <View style={[styles.bigAvatarBadge, { backgroundColor: C.accent }]}>
                <Ionicons name="camera" size={16} color="#fff" />
              </View>
            </TouchableOpacity>
            <Text style={[styles.editModalHint, { color: C.muted }]}>Tap photo to change</Text>

            <Text style={[styles.editModalLabel, { color: C.muted }]}>YOUR NAME</Text>
            <TextInput
              style={[styles.editNameInput, { backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : C.bg, color: C.text, borderColor: C.border }]}
              value={editNameText}
              onChangeText={setEditNameText}
              placeholder="Enter your name"
              placeholderTextColor={C.muted}
              autoCapitalize="words"
            />

            <TouchableOpacity style={[styles.saveProfileBtn, { backgroundColor: C.accent }]} onPress={saveProfile}>
              <Ionicons name="checkmark-circle" size={18} color="#fff" />
              <Text style={styles.saveProfileBtnTxt}>Save Profile</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

function makeStyles(C: any, isDark: boolean) { return StyleSheet.create({
  safe:         { flex: 1, backgroundColor: C.bg },
  header:       { paddingHorizontal: 16, paddingVertical: 14, backgroundColor: C.bg, borderBottomWidth: 1, borderBottomColor: C.border },
  headerTitle:  { fontSize: 22, fontWeight: '800', color: C.text },
  scroll:       { padding: 16, paddingBottom: 40 },
  section:      { padding: 16 },

  // Profile card
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.card,
    borderRadius: 20,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: C.border,
  },
  avatarWrap: { position: 'relative', marginRight: 14 },
  avatarImg: { width: 64, height: 64, borderRadius: 32, borderWidth: 2, borderColor: C.accent },
  avatarPlaceholder: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: C.accent + '44' },
  avatarInitials: { fontSize: 22, fontWeight: '800' },
  avatarEditBadge: { position: 'absolute', bottom: 0, right: 0, width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: C.bg },
  profileInfo: { flex: 1 },
  profileName: { fontSize: 18, fontWeight: '800', color: C.text, marginBottom: 2 },
  profileSub: { fontSize: 11, color: C.muted, marginBottom: 6 },
  profileGoalRow: { flexDirection: 'row', alignItems: 'center' },
  profileGoalTxt: { fontSize: 11, color: C.muted },
  editProfileBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, borderWidth: 1 },
  editProfileTxt: { fontSize: 12, fontWeight: '700' },

  prefRow:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  prefLabel:    { fontSize: 14, color: C.text, fontWeight: '600' },
  prefSub:      { fontSize: 11, color: C.muted, marginTop: 2 },
  pendingBanner:{ backgroundColor: C.accentDim, borderRadius: 12, padding: 10, marginBottom: 12, alignItems: 'center' },
  pendingText:  { color: C.accent, fontSize: 13, fontWeight: '700' },
  dangerText:   { fontSize: 13, color: C.muted, lineHeight: 20 },

  // Edit profile modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  editModalSheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 40 },
  editModalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)', alignSelf: 'center', marginBottom: 20 },
  editModalTitle: { fontSize: 20, fontWeight: '800', marginBottom: 20, textAlign: 'center' },
  bigAvatarWrap: { position: 'relative', alignSelf: 'center', marginBottom: 8 },
  bigAvatar: { width: 100, height: 100, borderRadius: 50 },
  bigAvatarBadge: { position: 'absolute', bottom: 4, right: 4, width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: isDark ? C.card : '#fff' },
  editModalHint: { fontSize: 12, textAlign: 'center', marginBottom: 20 },
  editModalLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginBottom: 8 },
  editNameInput: { borderRadius: 14, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 13, fontSize: 16, fontWeight: '600', marginBottom: 20 },
  saveProfileBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 15, borderRadius: 16, elevation: 4 },
  saveProfileBtnTxt: { color: '#fff', fontSize: 15, fontWeight: '800' },
}); }
