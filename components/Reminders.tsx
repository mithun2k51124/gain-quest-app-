// components/Reminders.tsx — Home reminders widget + reminders editor sheet
import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView, Switch, TextInput,
  KeyboardAvoidingView, Platform, Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  getReminders, addReminder, updateReminder, deleteReminder, getWorkoutPlans, getSupplements, getSupplementsTaken,
  DailyLog, Goals, Reminder, ReminderKind,
} from '../db/database';
import {
  REMINDER_KINDS, remindersEnabled, isReminderDone, rescheduleReminders, turnOnReminders, turnOffReminders,
  notificationsAvailable, REMINDERS_UNAVAILABLE_MSG,
} from '../utils/reminders';
import { useTheme } from '../contexts/ThemeContext';
import { useCustomAlert } from '../contexts/AlertContext';
import { WheelPicker } from './WheelPicker';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const HOURS = Array.from({ length: 12 }, (_, i) => String(i + 1));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));
const AMPM = ['AM', 'PM'];
const KIND_ORDER: ReminderKind[] = ['water', 'protein', 'supplement', 'workout', 'custom'];
// Supplement reminders are set up from the Tracker's Supplements section, where the supplement is picked
const ADDABLE_KINDS = KIND_ORDER.filter(k => k !== 'supplement');

export function fmtTime(h: number, m: number): string {
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

function useKindColor() {
  const { C } = useTheme();
  return (k: ReminderKind): string => (C as Record<string, any>)[REMINDER_KINDS[k].colorKey] ?? C.accent;
}

// ─────────────────────────────────────────────────────────────────────────────
// Home widget
// ─────────────────────────────────────────────────────────────────────────────

export function RemindersWidget({ log, goals, refreshKey, onEdit, onTurnOn }: {
  log: DailyLog; goals: Goals; refreshKey: number; onEdit: () => void; onTurnOn: () => void;
}) {
  const { C } = useTheme();
  const styles = makeStyles(C);
  const colorOf = useKindColor();

  const { enabled, today, taken, supplements } = useMemo(() => {
    const weekday = String(new Date().getDay());
    const supplements = new Map(getSupplements().map(s => [s.id, s]));
    return {
      enabled: remindersEnabled(),
      // A supplement reminder whose supplement was deleted is left out
      today: getReminders().filter(r => r.enabled && r.days.includes(weekday)
        && (r.kind !== 'supplement' || (r.ref_id != null && supplements.has(r.ref_id)))),
      taken: getSupplementsTaken(),
      supplements,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey, log]);

  const todaysPlan = useMemo(
    () => getWorkoutPlans().find(p => p.day_of_week === DAY_NAMES[new Date().getDay()]),
    [refreshKey]
  );

  if (!enabled) {
    return (
      <View style={[styles.card, { flexDirection: 'row', alignItems: 'center' }]}>
        <View style={[styles.bigIcon, { backgroundColor: C.accent + '1A' }]}>
          <Ionicons name="notifications" size={20} color={C.accent} />
        </View>
        <View style={{ flex: 1, marginHorizontal: 12 }}>
          <Text style={styles.ctaTitle}>Stay on track</Text>
          <Text style={styles.ctaSub}>Set your own reminders for water, protein and more.</Text>
        </View>
        <TouchableOpacity style={styles.ctaBtn} onPress={onTurnOn} activeOpacity={0.85}>
          <Text style={styles.ctaBtnTxt}>Turn on</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  const rows = today.map(r => {
    const done = isReminderDone(r, log, goals, taken);
    const rest = r.kind === 'workout' && (!todaysPlan || todaysPlan.muscle_groups === 'Rest');
    return { r, done, rest, past: r.hour * 60 + r.minute < nowMin };
  });
  const nextId = rows.find(x => !x.done && !x.rest && !x.past)?.r.id;
  const doneCount = rows.filter(x => x.done).length;

  const detail = (r: Reminder, rest: boolean): string => {
    switch (r.kind) {
      case 'water':    return goals.water_goal > 0 ? `${log.water_intake.toFixed(1)} / ${goals.water_goal} L` : 'Stay hydrated';
      case 'protein':  return goals.protein_goal > 0 ? `${Math.round(log.protein_intake)} / ${goals.protein_goal} g` : 'Protein intake';
      case 'supplement': {
        const s = r.ref_id != null ? supplements.get(r.ref_id) : undefined;
        return r.ref_id != null && taken[r.ref_id] ? 'Taken today' : s?.dose || 'Supplement';
      }
      case 'workout':  return rest ? 'Rest day — skipped' : log.workout_completed ? 'Workout logged' : todaysPlan?.plan_name ?? 'Training';
      default:         return 'Custom';
    }
  };

  return (
    <View style={styles.card}>
      {rows.length === 0 ? (
        <TouchableOpacity onPress={onEdit} activeOpacity={0.8} style={{ alignItems: 'center', paddingVertical: 10 }}>
          <Text style={styles.ctaSub}>No reminders today · tap to add</Text>
        </TouchableOpacity>
      ) : (
        <>
          {rows.map(({ r, done, rest }, i) => {
            const col = colorOf(r.kind);
            const isNext = r.id === nextId;
            const dim = done || rest;
            return (
              <View key={r.id} style={[styles.wRow, i === rows.length - 1 && { borderBottomWidth: 0 }]}>
                <View style={{ width: 62 }}>
                  <Text style={[styles.wTime, isNext && { color: C.accent }, dim && { color: C.muted }]}>
                    {fmtTime(r.hour, r.minute).replace(/ (AM|PM)/, '')}
                  </Text>
                  <Text style={styles.wAmpm}>{r.hour < 12 ? 'AM' : 'PM'}</Text>
                </View>
                <View style={[styles.wIcon, { backgroundColor: col + (dim ? '10' : '1F') }]}>
                  <Ionicons name={REMINDER_KINDS[r.kind].icon as any} size={15} color={dim ? C.muted : col} />
                </View>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={[styles.wLabel, dim && { color: C.muted, textDecorationLine: done ? 'line-through' : 'none' }]}
                    numberOfLines={1}>{r.label}</Text>
                  <Text style={styles.wSub} numberOfLines={1}>{detail(r, rest)}</Text>
                </View>
                {isNext ? (
                  <View style={styles.nextPill}><Text style={styles.nextTxt}>Next</Text></View>
                ) : done ? (
                  <Ionicons name="checkmark-circle" size={20} color={C.green} />
                ) : (
                  <View style={[styles.ring, { borderColor: C.border }]} />
                )}
              </View>
            );
          })}
          <Text style={styles.wFoot}>{doneCount} of {rows.length} done · reminders skip themselves once done</Text>
        </>
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Editor sheet — one card per reminder type, each holding any number of times
// ─────────────────────────────────────────────────────────────────────────────

type Group = { key: string; kind: ReminderKind; label: string; rows: Reminder[] };

/** Rows sharing a kind (for custom, a name; for supplements, the supplement) form one reminder with several times. */
function groupReminders(list: Reminder[]): Group[] {
  const map = new Map<string, Group>();
  for (const r of list) {
    const key = r.kind === 'custom' ? `custom:${r.label}` : r.kind === 'supplement' ? `supplement:${r.ref_id}` : r.kind;
    const g = map.get(key) ?? { key, kind: r.kind, label: r.label, rows: [] };
    g.rows.push(r);
    map.set(key, g);
  }
  return [...map.values()].sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
}

export function RemindersSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { C } = useTheme();
  const styles = makeStyles(C);
  const colorOf = useKindColor();
  const { showAlert } = useCustomAlert();
  const insets = useSafeAreaInsets();
  const [list, setList] = useState<Reminder[]>([]);
  const [on, setOn] = useState(false);
  const [selId, setSelId] = useState<number | null>(null);

  const reload = () => {
    // Reminders of a deleted supplement are hidden (they never fire either)
    const ids = new Set(getSupplements().map(s => s.id));
    setList(getReminders().filter(r => r.kind !== 'supplement' || (r.ref_id != null && ids.has(r.ref_id))));
  };
  useEffect(() => {
    if (visible) { reload(); setOn(remindersEnabled()); setSelId(null); }
  }, [visible]);

  const groups = useMemo(() => groupReminders(list), [list]);
  const usedKinds = new Set(groups.map(g => g.kind));

  const close = () => { rescheduleReminders(); onClose(); };

  const toggleMaster = async (v: boolean) => {
    if (v) {
      if (!notificationsAvailable) { showAlert('Not available here', REMINDERS_UNAVAILABLE_MSG); return; }
      const ok = await turnOnReminders();
      if (!ok) {
        showAlert('Notifications are off', 'Allow notifications for GainQuest in your phone settings to get reminders.');
        return;
      }
    } else {
      await turnOffReminders();
    }
    setOn(v);
  };

  const patchRows = (rows: Reminder[], fields: Partial<Omit<Reminder, 'id'>>) => {
    rows.forEach(r => updateReminder(r.id, fields));
    const ids = new Set(rows.map(r => r.id));
    setList(l => l.map(r => (ids.has(r.id) ? { ...r, ...fields } : r)));
  };

  /** Next time slot: an hour from now for a new reminder, 2 h after the latest for another time. */
  const suggestTime = (rows: Reminder[]) => {
    if (!rows.length) return { h: Math.min(23, new Date().getHours() + 1), m: 0 };
    const last = rows[rows.length - 1];
    return { h: Math.min(23, last.hour + 2), m: last.minute };
  };

  const addGroup = (kind: ReminderKind) => {
    const { h, m } = suggestTime([]);
    const id = addReminder(kind, kind === 'custom' ? 'Reminder' : REMINDER_KINDS[kind].label, h, m);
    reload();
    setSelId(id);
  };

  const addTime = (g: Group) => {
    const { h, m } = suggestTime(g.rows);
    const id = addReminder(g.kind, g.label, h, m, g.rows[0].days, g.rows[0].enabled, g.rows[0].ref_id);
    reload();
    setSelId(id);
  };

  const removeTime = (id: number) => { deleteReminder(id); setSelId(null); reload(); };
  const removeGroup = (g: Group) => { g.rows.forEach(r => deleteReminder(r.id)); setSelId(null); reload(); };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* The backdrop is its own layer, so it never competes with the sheet's scrolling */}
        <View style={styles.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Close" />
          <View style={[styles.sheet, { paddingBottom: 28 + insets.bottom }]}>
            <View style={styles.handle} />
            <View style={styles.sheetHead}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetTitle}>Reminders</Text>
                <Text style={styles.sheetSub}>{on ? 'Notifications on · skipped once done' : 'Notifications off'}</Text>
              </View>
              <Switch value={on} onValueChange={toggleMaster}
                trackColor={{ false: C.border, true: C.accent }} thumbColor="#fff" />
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" nestedScrollEnabled
              style={{ flexGrow: 0, flexShrink: 1 }}>
              {groups.length === 0 && (
                <View style={styles.empty}>
                  <Ionicons name="notifications-outline" size={26} color={C.muted} />
                  <Text style={styles.emptyTxt}>No reminders yet. Add one below.</Text>
                </View>
              )}

              {groups.map(g => {
                const col = colorOf(g.kind);
                const enabled = !!g.rows[0].enabled;
                const days = g.rows[0].days;
                const sel = g.rows.find(r => r.id === selId);
                return (
                  <View key={g.key} style={[styles.group, !enabled && { opacity: 0.55 }]}>
                    <View style={styles.groupHead}>
                      <View style={[styles.gIcon, { backgroundColor: col + '1F' }]}>
                        <Ionicons name={REMINDER_KINDS[g.kind].icon as any} size={16} color={col} />
                      </View>
                      {g.kind === 'custom' ? (
                        <TextInput style={styles.nameInput} defaultValue={g.label} placeholder="Name"
                          placeholderTextColor={C.muted}
                          onEndEditing={e => patchRows(g.rows, { label: e.nativeEvent.text.trim() || 'Reminder' })} />
                      ) : (
                        <Text style={styles.gLabel}>{g.label}</Text>
                      )}
                      <TouchableOpacity onPress={() => removeGroup(g)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ marginRight: 10 }}>
                        <Ionicons name="trash-outline" size={17} color={C.muted} />
                      </TouchableOpacity>
                      <Switch value={enabled} onValueChange={v => patchRows(g.rows, { enabled: v ? 1 : 0 })}
                        trackColor={{ false: C.border, true: col }} thumbColor="#fff" />
                    </View>

                    {/* Times */}
                    <View style={styles.times}>
                      {g.rows.map(r => {
                        const active = r.id === selId;
                        return (
                          <TouchableOpacity key={r.id} onPress={() => setSelId(active ? null : r.id)} activeOpacity={0.8}
                            style={[styles.timeChip, active && { backgroundColor: col, borderColor: col }]}>
                            <Text style={[styles.timeTxt, active && { color: '#fff' }]}>{fmtTime(r.hour, r.minute)}</Text>
                          </TouchableOpacity>
                        );
                      })}
                      <TouchableOpacity onPress={() => addTime(g)} activeOpacity={0.8} style={[styles.timeChip, styles.addTimeChip]}>
                        <Ionicons name="add" size={16} color={col} />
                      </TouchableOpacity>
                    </View>

                    {/* Time editor for the selected chip */}
                    {sel && (
                      <View style={styles.editor}>
                        <View style={styles.wheels}>
                          <WheelPicker key={`h${sel.id}`} items={HOURS} width={52} index={(sel.hour % 12 || 12) - 1}
                            onChange={i => patchRows([sel], { hour: ((i + 1) % 12) + (sel.hour >= 12 ? 12 : 0) })} />
                          <Text style={styles.colon}>:</Text>
                          <WheelPicker key={`m${sel.id}`} items={MINUTES} width={52} index={sel.minute}
                            onChange={i => patchRows([sel], { minute: i })} />
                          <WheelPicker key={`p${sel.id}`} items={AMPM} width={56} fontSize={15} index={sel.hour >= 12 ? 1 : 0}
                            onChange={i => patchRows([sel], { hour: (sel.hour % 12) + i * 12 })} />
                        </View>
                        <TouchableOpacity onPress={() => removeTime(sel.id)} activeOpacity={0.7} style={styles.removeTime}>
                          <Text style={styles.removeTimeTxt}>Remove this time</Text>
                        </TouchableOpacity>
                      </View>
                    )}

                    {/* Days */}
                    <View style={styles.days}>
                      {DAY_LETTERS.map((l, d) => {
                        const isOn = days.includes(String(d));
                        return (
                          <TouchableOpacity key={d} activeOpacity={0.7}
                            onPress={() => {
                              const next = isOn ? days.replace(String(d), '') : [...days, String(d)].sort().join('');
                              if (next) patchRows(g.rows, { days: next });
                            }}
                            style={[styles.day, isOn && { backgroundColor: col + '22' }]}>
                            <Text style={[styles.dayTxt, isOn && { color: col }]}>{l}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                );
              })}

              <Text style={styles.addLabel}>Add</Text>
              <View style={styles.addRow}>
                {ADDABLE_KINDS.filter(k => k === 'custom' || !usedKinds.has(k)).map(k => {
                  const col = colorOf(k);
                  return (
                    <TouchableOpacity key={k} onPress={() => addGroup(k)} activeOpacity={0.8} style={styles.addChip}>
                      <Ionicons name={REMINDER_KINDS[k].icon as any} size={14} color={col} />
                      <Text style={styles.addTxt}>{k[0].toUpperCase() + k.slice(1)}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <View style={{ height: 8 }} />
            </ScrollView>

            <TouchableOpacity style={styles.doneBtn} onPress={close} activeOpacity={0.85}>
              <Text style={styles.doneTxt}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function makeStyles(C: any) {
  return StyleSheet.create({
    card:      { backgroundColor: C.card, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 12, borderWidth: 1, borderColor: C.border },
    bigIcon:   { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    ctaTitle:  { fontSize: 15, fontWeight: '800', color: C.text },
    ctaSub:    { fontSize: 12, color: C.muted, fontWeight: '600', marginTop: 2 },
    ctaBtn:    { backgroundColor: C.accent, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 9 },
    ctaBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 13 },

    wRow:      { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border },
    wTime:     { fontSize: 16, fontWeight: '800', color: C.text, fontVariant: ['tabular-nums'] },
    wAmpm:     { fontSize: 10, fontWeight: '800', color: C.muted, marginTop: -1 },
    wIcon:     { width: 32, height: 32, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
    wLabel:    { fontSize: 14, fontWeight: '700', color: C.text },
    wSub:      { fontSize: 11, fontWeight: '600', color: C.muted, marginTop: 1 },
    nextPill:  { backgroundColor: C.accent, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 3 },
    nextTxt:   { color: '#fff', fontSize: 11, fontWeight: '800' },
    ring:      { width: 18, height: 18, borderRadius: 9, borderWidth: 2, marginRight: 1 },
    wFoot:     { fontSize: 11, color: C.muted, fontWeight: '600', textAlign: 'center', marginTop: 8 },

    overlay:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
    sheet:     { backgroundColor: C.card, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: 28, maxHeight: '88%', borderWidth: 1, borderColor: C.border },
    handle:    { width: 40, height: 5, backgroundColor: C.border, borderRadius: 3, alignSelf: 'center', marginBottom: 16 },
    sheetHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
    sheetTitle:{ fontSize: 20, fontWeight: '800', color: C.text },
    sheetSub:  { fontSize: 12, color: C.muted, fontWeight: '600', marginTop: 2 },

    empty:     { alignItems: 'center', paddingVertical: 24, gap: 8 },
    emptyTxt:  { fontSize: 13, color: C.muted, fontWeight: '600' },

    group:     { backgroundColor: C.bg, borderRadius: 18, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: C.border },
    groupHead: { flexDirection: 'row', alignItems: 'center' },
    gIcon:     { width: 32, height: 32, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
    gLabel:    { flex: 1, fontSize: 15, fontWeight: '800', color: C.text },
    nameInput: { flex: 1, fontSize: 15, fontWeight: '800', color: C.text, paddingVertical: 2, borderBottomWidth: 1, borderBottomColor: C.border, marginRight: 10 },
    times:     { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
    timeChip:  { paddingHorizontal: 11, paddingVertical: 7, borderRadius: 11, borderWidth: 1, borderColor: C.border, backgroundColor: C.card, justifyContent: 'center' },
    timeTxt:   { fontSize: 13, fontWeight: '800', color: C.text, fontVariant: ['tabular-nums'] },
    addTimeChip: { paddingHorizontal: 9, borderStyle: 'dashed' },
    editor:    { marginTop: 10, backgroundColor: C.card, borderRadius: 14, paddingVertical: 6, borderWidth: 1, borderColor: C.border },
    wheels:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2 },
    colon:     { fontSize: 18, fontWeight: '800', color: C.muted },
    removeTime:{ alignItems: 'center', paddingVertical: 6 },
    removeTimeTxt: { fontSize: 12, fontWeight: '800', color: C.red },
    days:      { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
    day:       { width: 32, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
    dayTxt:    { fontSize: 12, fontWeight: '800', color: C.muted },

    addLabel:  { fontSize: 11, fontWeight: '800', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 8, marginBottom: 8 },
    addRow:    { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    addChip:   { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: C.border, backgroundColor: C.bg },
    addTxt:    { fontSize: 13, fontWeight: '700', color: C.text },
    doneBtn:   { backgroundColor: C.accent, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 12 },
    doneTxt:   { color: '#fff', fontWeight: '800', fontSize: 15 },
  });
}
