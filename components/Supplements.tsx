// components/Supplements.tsx — the Tracker's Supplements section: the user's own supplements,
// ticked off once a day, each with an optional reminder (one or more times on chosen days).
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView, TextInput, Switch, Animated,
  KeyboardAvoidingView, Platform, Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { SupplementIcon } from './SupplementIcon';
import * as Haptics from 'expo-haptics';
import {
  getSupplements, addSupplement, updateSupplement, deleteSupplement, getSupplementsTaken,
  setSupplementTaken, getReminders, addReminder, deleteReminder, Supplement, Reminder,
} from '../db/database';
import {
  rescheduleReminders, remindersEnabled, turnOnReminders, notificationsAvailable,
  REMINDERS_UNAVAILABLE_MSG, supplementReminderLabel,
} from '../utils/reminders';
import { useTheme } from '../contexts/ThemeContext';
import { useCustomAlert } from '../contexts/AlertContext';
import { WheelPicker } from './WheelPicker';
import { fmtTime } from './Reminders';

export const SUPPLEMENT_COLORS = ['#14B8A6', '#8B5CF6', '#F59E0B', '#EC4899', '#3B82F6', '#22C55E'];
const QUICK_NAMES = ['Multivitamin', 'Vitamin D3', 'Omega-3', 'Magnesium', 'Zinc', 'Protein powder', 'Electrolytes', 'Pre-workout'];
const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const HOURS = Array.from({ length: 12 }, (_, i) => String(i + 1));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));
const AMPM = ['AM', 'PM'];
const HIT = { top: 8, bottom: 8, left: 8, right: 8 };

type Time = { h: number; m: number };

const colorOf = (s: Supplement, i: number) => s.color || SUPPLEMENT_COLORS[i % SUPPLEMENT_COLORS.length];
const takenTime = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

function remindersOf(id: number, all: Reminder[]): Reminder[] {
  return all.filter(r => r.kind === 'supplement' && r.ref_id === id);
}

// ─────────────────────────────────────────────────────────────────────────────
// Tracker section
// ─────────────────────────────────────────────────────────────────────────────

/** `refreshKey` changes whenever the Tracker reloads; `onChanged` runs after anything is saved. */
export function SupplementsCard({ refreshKey, onChanged }: { refreshKey: number; onChanged?: () => void }) {
  const { C } = useTheme();
  const styles = makeStyles(C);
  const [list, setList] = useState<Supplement[]>([]);
  const [taken, setTaken] = useState<Record<number, string>>({});
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [editing, setEditing] = useState<Supplement | 'new' | null>(null);
  const [preset, setPreset] = useState('');

  const reload = useCallback(() => {
    setList(getSupplements());
    setTaken(getSupplementsTaken());
    setReminders(getReminders());
  }, []);
  useEffect(reload, [reload, refreshKey]);

  const toggle = (s: Supplement) => {
    const now = !taken[s.id];
    setSupplementTaken(s.id, now);
    Haptics.impactAsync(now ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    reload();
    rescheduleReminders();  // a taken supplement's reminder skips itself today
    onChanged?.();
  };

  const openNew = (name = '') => { setPreset(name); setEditing('new'); };
  const doneCount = list.filter(s => taken[s.id]).length;

  return (
    <View style={styles.wrap}>
      {list.length === 0 ? (
        <View style={styles.empty}>
          <View style={[styles.emptyIcon, { backgroundColor: C.teal + '1F' }]}>
            <SupplementIcon size={26} color={C.teal} />
          </View>
          <Text style={styles.emptyTitle}>Track what you take</Text>
          <Text style={styles.emptySub}>Add your supplements, tick them off each day and get a reminder when it's time.</Text>
          <View style={styles.quickWrap}>
            {QUICK_NAMES.slice(0, 6).map(n => (
              <TouchableOpacity key={n} onPress={() => openNew(n)} activeOpacity={0.8} style={styles.quickChip}>
                <Ionicons name="add" size={13} color={C.teal} />
                <Text style={styles.quickTxt}>{n}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ) : (
        <>
          {/* One segment per supplement fills in as they're taken */}
          <View style={styles.progressHead}>
            <Text style={styles.kicker}>TODAY</Text>
            <Text style={[styles.progressTxt, doneCount === list.length && { color: C.green }]}>
              {doneCount === list.length ? 'All taken' : `${doneCount} of ${list.length} taken`}
            </Text>
          </View>
          <View style={styles.segments}>
            {list.map((s, i) => (
              <View key={s.id} style={[styles.segment, { backgroundColor: taken[s.id] ? colorOf(s, i) : C.border }]} />
            ))}
          </View>

          {list.map((s, i) => (
            <SupplementRow key={s.id} supplement={s} color={colorOf(s, i)} takenAt={taken[s.id]}
              times={remindersOf(s.id, reminders)} onToggle={() => toggle(s)} onEdit={() => setEditing(s)} />
          ))}
        </>
      )}

      <TouchableOpacity onPress={() => openNew()} activeOpacity={0.8} style={styles.addBtn}>
        <Ionicons name="add-circle-outline" size={17} color={C.teal} />
        <Text style={styles.addTxt}>{list.length ? 'Add supplement' : 'Add your own'}</Text>
      </TouchableOpacity>

      <SupplementEditor
        visible={editing !== null}
        supplement={editing === 'new' ? null : editing}
        presetName={preset}
        colorIndex={list.length}
        reminders={editing && editing !== 'new' ? remindersOf(editing.id, reminders) : []}
        onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); reload(); onChanged?.(); }}
      />
    </View>
  );
}

function SupplementRow({ supplement: s, color, takenAt, times, onToggle, onEdit }: {
  supplement: Supplement; color: string; takenAt?: string; times: Reminder[];
  onToggle: () => void; onEdit: () => void;
}) {
  const { C } = useTheme();
  const styles = makeStyles(C);
  const done = !!takenAt;
  // The tick pops when it's toggled
  const pop = useRef(new Animated.Value(1)).current;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    pop.setValue(0.82);
    Animated.spring(pop, { toValue: 1, friction: 4, tension: 160, useNativeDriver: true }).start();
  }, [done, pop]);

  const timeText = times.length
    ? times.slice(0, 2).map(r => fmtTime(r.hour, r.minute)).join(', ') + (times.length > 2 ? ` +${times.length - 2}` : '')
    : null;

  return (
    <View style={[styles.row, done && { borderColor: color + '55', backgroundColor: color + '0F' }]}>
      <TouchableOpacity onPress={onEdit} activeOpacity={0.75} style={styles.rowMain} accessibilityLabel={`Edit ${s.name}`}>
        <View style={[styles.rowIcon, { backgroundColor: color + '22' }]}>
          <SupplementIcon size={20} color={color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowName} numberOfLines={1}>{s.name}</Text>
          <View style={styles.rowMeta}>
            {timeText && (
              <View style={styles.rowBell}>
                <Ionicons name="alarm-outline" size={11} color={C.muted} />
                <Text style={styles.rowSub} numberOfLines={1}>{timeText}</Text>
              </View>
            )}
            {!timeText && <Text style={styles.rowSub}>Tap to set a reminder</Text>}
          </View>
        </View>
      </TouchableOpacity>
      <Animated.View style={{ transform: [{ scale: pop }] }}>
        <TouchableOpacity onPress={onToggle} activeOpacity={0.85} hitSlop={HIT}
          style={[styles.takeBtn, done ? { backgroundColor: color, borderColor: color } : { borderColor: color + '88' }]}
          accessibilityRole="switch" accessibilityState={{ checked: done }} accessibilityLabel={`${s.name} taken`}>
          <Ionicons name={done ? 'checkmark-circle' : 'ellipse-outline'} size={16} color={done ? '#fff' : color} />
          <Text style={[styles.takeTxt, { color: done ? '#fff' : color }]}>{done ? takenTime(takenAt!) : 'Taken?'}</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Add / edit sheet
// ─────────────────────────────────────────────────────────────────────────────

function SupplementEditor({ visible, supplement, presetName, colorIndex, reminders, onClose, onSaved }: {
  visible: boolean;
  supplement: Supplement | null;
  presetName: string;
  colorIndex: number;
  reminders: Reminder[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { C } = useTheme();
  const styles = makeStyles(C);
  const { showAlert } = useCustomAlert();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [color, setColor] = useState(SUPPLEMENT_COLORS[0]);
  const [remind, setRemind] = useState(false);
  const [times, setTimes] = useState<Time[]>([]);
  const [days, setDays] = useState('0123456');
  const [sel, setSel] = useState<number | null>(null);
  const [notifOn, setNotifOn] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setName(supplement?.name ?? presetName);
    setColor(supplement?.color || SUPPLEMENT_COLORS[colorIndex % SUPPLEMENT_COLORS.length]);
    setRemind(reminders.length > 0);
    setTimes(reminders.map(r => ({ h: r.hour, m: r.minute })));
    setDays(reminders[0]?.days ?? '0123456');
    setSel(null);
    setNotifOn(remindersEnabled());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const trimmed = name.trim();
  const sortedTimes = useMemo(() => [...times].sort((a, b) => a.h * 60 + a.m - (b.h * 60 + b.m)), [times]);

  const toggleRemind = (v: boolean) => {
    setRemind(v);
    // Turning it on starts with one time: 9:00 AM, a typical with-breakfast dose
    if (v && times.length === 0) { setTimes([{ h: 9, m: 0 }]); setSel(0); }
  };
  const addTime = () => {
    const last = sortedTimes[sortedTimes.length - 1];
    setTimes(t => [...t, last ? { h: Math.min(23, last.h + 4), m: last.m } : { h: 9, m: 0 }]);
    setSel(times.length);
  };
  const patchTime = (i: number, t: Partial<Time>) => setTimes(ts => ts.map((x, j) => (j === i ? { ...x, ...t } : x)));
  const removeTime = (i: number) => {
    setTimes(ts => ts.filter((_, j) => j !== i));
    setSel(null);
  };

  const enableNotifications = async () => {
    if (!notificationsAvailable) { showAlert('Not available here', REMINDERS_UNAVAILABLE_MSG); return; }
    const ok = await turnOnReminders();
    if (!ok) showAlert('Notifications are off', 'Allow notifications for GainQuest in your phone settings to get reminders.');
    setNotifOn(remindersEnabled());
  };

  const save = () => {
    if (!trimmed) return;
    const id = supplement
      ? (updateSupplement(supplement.id, { name: trimmed, dose: '', color }), supplement.id)
      : addSupplement(trimmed, '', color);
    // Reminder times are rewritten as a set
    reminders.forEach(r => deleteReminder(r.id));
    if (remind) {
      for (const t of times) addReminder('supplement', supplementReminderLabel(trimmed), t.h, t.m, days, 1, id);
    }
    rescheduleReminders();
    onSaved();
  };

  const remove = () => {
    if (!supplement) return;
    showAlert(`Delete ${supplement.name}?`, 'Its history and reminders are removed too.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => { deleteSupplement(supplement.id); rescheduleReminders(); onSaved(); } },
    ]);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* The backdrop is its own layer, so it never competes with the sheet's scrolling */}
        <View style={styles.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
          <View style={[styles.sheet, { paddingBottom: 26 + insets.bottom }]}>
            <View style={styles.handle} />
            <View style={styles.sheetHead}>
              <View style={[styles.sheetIcon, { backgroundColor: color + '22' }]}>
                <SupplementIcon size={24} color={color} />
              </View>
              <Text style={styles.sheetTitle}>{supplement ? 'Edit supplement' : 'Add supplement'}</Text>
              <TouchableOpacity onPress={onClose} hitSlop={HIT} style={styles.closeBtn}>
                <Ionicons name="close" size={18} color={C.muted} />
              </TouchableOpacity>
            </View>

            {/* flexShrink lets the list scroll inside the sheet instead of pushing the buttons off screen */}
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" nestedScrollEnabled
              style={{ flexGrow: 0, flexShrink: 1 }} contentContainerStyle={{ paddingBottom: 8 }}>
              <Text style={styles.label}>Name</Text>
              <TextInput value={name} onChangeText={setName} placeholder="e.g. Vitamin D3" placeholderTextColor={C.muted}
                style={styles.input} maxLength={40} autoCapitalize="words" />
              {!supplement && (
                <View style={[styles.quickWrap, { marginTop: 8 }]}>
                  {QUICK_NAMES.map(n => (
                    <TouchableOpacity key={n} onPress={() => setName(n)} activeOpacity={0.8}
                      style={[styles.quickChip, trimmed === n && { borderColor: color, backgroundColor: color + '18' }]}>
                      <Text style={[styles.quickTxt, trimmed === n && { color }]}>{n}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* Reminder, right under the name so the clock is in view without scrolling */}
              <View style={styles.remindRow}>
                <Ionicons name="alarm-outline" size={18} color={remind ? color : C.muted} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.remindTitle}>Remind me</Text>
                  <Text style={styles.remindSub}>Skipped on days you've already ticked it off</Text>
                </View>
                <Switch value={remind} onValueChange={toggleRemind} trackColor={{ false: C.border, true: color }} thumbColor="#fff" />
              </View>

              {remind && (
                <View style={styles.remindBox}>
                  {!notifOn && (
                    <TouchableOpacity onPress={enableNotifications} activeOpacity={0.85} style={[styles.notifWarn, { borderColor: C.orange + '66' }]}>
                      <Ionicons name="notifications-off-outline" size={16} color={C.orange} />
                      <Text style={styles.notifTxt}>Notifications are off. Tap to turn them on.</Text>
                    </TouchableOpacity>
                  )}
                  <View style={styles.times}>
                    {times.map((t, i) => (
                      <TouchableOpacity key={i} onPress={() => setSel(sel === i ? null : i)} activeOpacity={0.8}
                        style={[styles.timeChip, sel === i && { backgroundColor: color, borderColor: color }]}>
                        <Text style={[styles.timeTxt, sel === i && { color: '#fff' }]}>{fmtTime(t.h, t.m)}</Text>
                      </TouchableOpacity>
                    ))}
                    <TouchableOpacity onPress={addTime} activeOpacity={0.8} style={[styles.timeChip, styles.addTimeChip]}>
                      <Ionicons name="add" size={16} color={color} />
                    </TouchableOpacity>
                  </View>

                  {sel !== null && times[sel] && (
                    <View style={styles.editor}>
                      <View style={styles.wheels}>
                        <WheelPicker key={`h${sel}`} items={HOURS} width={52} index={(times[sel].h % 12 || 12) - 1}
                          onChange={i => patchTime(sel, { h: ((i + 1) % 12) + (times[sel].h >= 12 ? 12 : 0) })} />
                        <Text style={styles.colon}>:</Text>
                        <WheelPicker key={`m${sel}`} items={MINUTES} width={52} index={times[sel].m}
                          onChange={i => patchTime(sel, { m: i })} />
                        <WheelPicker key={`p${sel}`} items={AMPM} width={56} fontSize={15} index={times[sel].h >= 12 ? 1 : 0}
                          onChange={i => patchTime(sel, { h: (times[sel].h % 12) + i * 12 })} />
                      </View>
                      {times.length > 1 && (
                        <TouchableOpacity onPress={() => removeTime(sel)} activeOpacity={0.7} style={styles.removeTime}>
                          <Text style={styles.removeTimeTxt}>Remove this time</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}

                  <View style={styles.days}>
                    {DAY_LETTERS.map((l, d) => {
                      const on = days.includes(String(d));
                      return (
                        <TouchableOpacity key={d} activeOpacity={0.7} hitSlop={{ top: 4, bottom: 4, left: 2, right: 2 }}
                          onPress={() => {
                            const next = on ? days.replace(String(d), '') : [...days, String(d)].sort().join('');
                            if (next) setDays(next);
                          }}
                          style={[styles.day, on && { backgroundColor: color + '22' }]}>
                          <Text style={[styles.dayTxt, on && { color }]}>{l}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}

              <Text style={styles.label}>Colour</Text>
              <View style={styles.swatches}>
                {SUPPLEMENT_COLORS.map(c => (
                  <TouchableOpacity key={c} onPress={() => setColor(c)} activeOpacity={0.85} hitSlop={HIT}
                    style={[styles.swatch, { backgroundColor: c }, color === c && styles.swatchOn]}>
                    {color === c && <Ionicons name="checkmark" size={15} color="#fff" />}
                  </TouchableOpacity>
                ))}
              </View>
              <View style={{ height: 6 }} />
            </ScrollView>

            <TouchableOpacity onPress={save} disabled={!trimmed} activeOpacity={0.85}
              style={[styles.saveBtn, { backgroundColor: color }, !trimmed && { opacity: 0.4 }]}>
              <Ionicons name="checkmark-circle" size={18} color="#fff" />
              <Text style={styles.saveTxt}>{supplement ? 'Save changes' : 'Add supplement'}</Text>
            </TouchableOpacity>
            {supplement && (
              <TouchableOpacity onPress={remove} activeOpacity={0.7} style={styles.deleteBtn}>
                <Text style={styles.deleteTxt}>Delete supplement</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function makeStyles(C: any) {
  return StyleSheet.create({
    wrap:        { padding: 16 },
    kicker:      { fontSize: 10, fontWeight: '800', letterSpacing: 0.6, color: C.muted },
    progressHead:{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
    progressTxt: { fontSize: 12, fontWeight: '800', color: C.textSub },
    segments:    { flexDirection: 'row', gap: 4, marginBottom: 12 },
    segment:     { flex: 1, height: 6, borderRadius: 3 },

    row:         { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 16, borderWidth: 1, borderColor: C.border, backgroundColor: C.bg, marginBottom: 8 },
    rowMain:     { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
    rowIcon:     { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    rowName:     { fontSize: 15, fontWeight: '800', color: C.text },
    rowMeta:     { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2, flexWrap: 'wrap' },
    rowBell:     { flexDirection: 'row', alignItems: 'center', gap: 3 },
    rowSub:      { fontSize: 11, fontWeight: '600', color: C.muted },
    takeBtn:     { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 14, borderWidth: 1.5, minWidth: 92, justifyContent: 'center' },
    takeTxt:     { fontSize: 12, fontWeight: '800' },

    empty:       { alignItems: 'center', paddingTop: 4 },
    emptyIcon:   { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
    emptyTitle:  { fontSize: 16, fontWeight: '800', color: C.text },
    emptySub:    { fontSize: 12, fontWeight: '600', color: C.muted, textAlign: 'center', marginTop: 4, lineHeight: 17, paddingHorizontal: 10 },
    quickWrap:   { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginTop: 12 },
    quickChip:   { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 12, borderWidth: 1, borderColor: C.border, backgroundColor: C.bg },
    quickTxt:    { fontSize: 12, fontWeight: '700', color: C.textSub },
    addBtn:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 6, paddingVertical: 11, borderRadius: 14, borderWidth: 1, borderStyle: 'dashed', borderColor: C.teal + '88' },
    addTxt:      { fontSize: 13, fontWeight: '800', color: C.teal },

    overlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
    sheet:       { backgroundColor: C.card, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: 26, maxHeight: '90%', borderWidth: 1, borderColor: C.border },
    handle:      { width: 40, height: 5, backgroundColor: C.border, borderRadius: 3, alignSelf: 'center', marginBottom: 14 },
    sheetHead:   { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 6 },
    sheetIcon:   { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    sheetTitle:  { flex: 1, fontSize: 19, fontWeight: '800', color: C.text },
    closeBtn:    { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: C.border + '80' },
    label:       { fontSize: 11, fontWeight: '800', color: C.muted, letterSpacing: 0.5, textTransform: 'uppercase', marginTop: 16, marginBottom: 6 },
    optional:    { fontWeight: '600', textTransform: 'none', letterSpacing: 0 },
    input:       { borderWidth: 1, borderColor: C.border, backgroundColor: C.bg, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, fontWeight: '700', color: C.text },
    swatches:    { flexDirection: 'row', gap: 12 },
    swatch:      { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
    swatchOn:    { borderWidth: 3, borderColor: C.card, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 4, elevation: 4 },

    remindRow:   { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 18, padding: 12, borderRadius: 16, borderWidth: 1, borderColor: C.border, backgroundColor: C.bg },
    remindTitle: { fontSize: 14, fontWeight: '800', color: C.text },
    remindSub:   { fontSize: 11, fontWeight: '600', color: C.muted, marginTop: 1 },
    remindBox:   { marginTop: 10 },
    notifWarn:   { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 12, borderWidth: 1, marginBottom: 10 },
    notifTxt:    { flex: 1, fontSize: 12, fontWeight: '700', color: C.orange },
    times:       { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    timeChip:    { paddingHorizontal: 11, paddingVertical: 7, borderRadius: 11, borderWidth: 1, borderColor: C.border, backgroundColor: C.bg, justifyContent: 'center' },
    timeTxt:     { fontSize: 13, fontWeight: '800', color: C.text, fontVariant: ['tabular-nums'] },
    addTimeChip: { paddingHorizontal: 9, borderStyle: 'dashed' },
    editor:      { marginTop: 10, backgroundColor: C.bg, borderRadius: 14, paddingVertical: 6, borderWidth: 1, borderColor: C.border },
    wheels:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2 },
    colon:       { fontSize: 18, fontWeight: '800', color: C.muted },
    removeTime:  { alignItems: 'center', paddingVertical: 6 },
    removeTimeTxt: { fontSize: 12, fontWeight: '800', color: C.red },
    days:        { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
    day:         { width: 34, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    dayTxt:      { fontSize: 12, fontWeight: '800', color: C.muted },

    saveBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 16, paddingVertical: 14, marginTop: 14 },
    saveTxt:     { color: '#fff', fontWeight: '800', fontSize: 15 },
    deleteBtn:   { alignItems: 'center', paddingVertical: 10 },
    deleteTxt:   { fontSize: 13, fontWeight: '800', color: C.red },
  });
}
