// components/ExerciseLibrary.tsx — browse every exercise: muscle group → movement type → exercise,
// with search, equipment filters and a preview for each one.
import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, TextInput, FlatList, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { EXERCISE_CATALOG, MUSCLE_GROUP_ORDER, CatalogExercise } from '../constants/exerciseCatalog';
import { ExerciseGuideModal } from './ExerciseGuide';
import { BookIcon } from './BookIcon';
import { useTheme } from '../contexts/ThemeContext';

const HIT = { top: 8, bottom: 8, left: 8, right: 8 };

// Equipment filter chips → matching catalog equipment values
const EQUIPMENT: { label: string; match: (e: string | null) => boolean }[] = [
  { label: 'All', match: () => true },
  { label: 'Bodyweight', match: e => e === 'Body only' || e === null },
  { label: 'Dumbbell', match: e => e === 'Dumbbell' },
  { label: 'Barbell', match: e => e === 'Barbell' || e === 'E-z curl bar' },
  { label: 'Cable', match: e => e === 'Cable' },
  { label: 'Machine', match: e => e === 'Machine' },
  { label: 'Kettlebell', match: e => e === 'Kettlebells' },
  { label: 'Bands', match: e => e === 'Bands' },
  { label: 'Other', match: e => ['Other', 'Medicine ball', 'Exercise ball', 'Foam roll'].includes(e ?? '') },
];

type Item =
  | { kind: 'group'; group: string; count: number }
  | { kind: 'pattern'; group: string; pattern: string; count: number }
  | { kind: 'exercise'; ex: CatalogExercise; showGroup: boolean };

export function ExerciseLibrary({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { C } = useTheme();
  const styles = makeStyles(C);
  const [query, setQuery] = useState('');
  const [equip, setEquip] = useState(0);
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const [openPatterns, setOpenPatterns] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<CatalogExercise | null>(null);

  const colorOf = (g: string) => C.mg[g] ?? C.accent;
  const toggle = (set: Set<string>, key: string, setter: (s: Set<string>) => void) => {
    const next = new Set(set);
    next.has(key) ? next.delete(key) : next.add(key);
    setter(next);
  };

  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const searching = words.length > 0;

  const filtered = useMemo(
    () => EXERCISE_CATALOG.filter(e => EQUIPMENT[equip].match(e.equipment)
      && words.every(w => e.name.toLowerCase().includes(w))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [equip, query]
  );

  // Flatten the open parts of the tree into one virtualised list
  const items: Item[] = useMemo(() => {
    if (searching) return filtered.slice(0, 200).map(ex => ({ kind: 'exercise', ex, showGroup: true }));
    const out: Item[] = [];
    for (const group of MUSCLE_GROUP_ORDER) {
      const inGroup = filtered.filter(e => e.group === group);
      if (!inGroup.length) continue;
      out.push({ kind: 'group', group, count: inGroup.length });
      if (!openGroups.has(group)) continue;
      const patterns = [...new Set(inGroup.map(e => e.pattern))].sort((a, b) =>
        a === 'Other' ? 1 : b === 'Other' ? -1 : a.localeCompare(b));
      for (const pattern of patterns) {
        const list = inGroup.filter(e => e.pattern === pattern);
        const key = `${group}/${pattern}`;
        out.push({ kind: 'pattern', group, pattern, count: list.length });
        if (openPatterns.has(key)) list.forEach(ex => out.push({ kind: 'exercise', ex, showGroup: false }));
      }
    }
    return out;
  }, [filtered, searching, openGroups, openPatterns]);

  const renderItem = ({ item }: { item: Item }) => {
    if (item.kind === 'group') {
      const col = colorOf(item.group);
      const open = openGroups.has(item.group);
      return (
        <TouchableOpacity onPress={() => toggle(openGroups, item.group, setOpenGroups)} activeOpacity={0.8}
          style={[styles.groupHead, { backgroundColor: col + '18', borderColor: col + '44' }]}>
          <View style={[styles.groupIcon, { backgroundColor: col + '28' }]}>
            <Ionicons name="barbell" size={18} color={col} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.groupName, { color: col }]}>{item.group}</Text>
            <Text style={styles.groupMeta}>{item.count} exercises</Text>
          </View>
          <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={col} />
        </TouchableOpacity>
      );
    }
    if (item.kind === 'pattern') {
      const key = `${item.group}/${item.pattern}`;
      const open = openPatterns.has(key);
      const col = colorOf(item.group);
      return (
        <TouchableOpacity onPress={() => toggle(openPatterns, key, setOpenPatterns)} activeOpacity={0.75} style={styles.patternRow}>
          <View style={[styles.patternBar, { backgroundColor: open ? col : C.border }]} />
          <Text style={[styles.patternName, open && { color: C.text }]}>{item.pattern}</Text>
          <Text style={styles.patternCount}>{item.count}</Text>
          <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={14} color={C.muted} />
        </TouchableOpacity>
      );
    }
    const { ex, showGroup } = item;
    const col = colorOf(ex.group);
    return (
      <TouchableOpacity onPress={() => setPreview(ex)} activeOpacity={0.7}
        style={[styles.exRow, !showGroup && { marginLeft: 14 }]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.exName} numberOfLines={2}>{ex.name}</Text>
          <Text style={styles.exMeta} numberOfLines={1}>
            {showGroup ? `${ex.group} · ${ex.pattern} · ` : ''}{ex.equipment ?? 'Bodyweight'} · {ex.level}
          </Text>
        </View>
        <View style={[styles.playBtn, { backgroundColor: col + '1A' }]}>
          <Ionicons name="play" size={12} color={col} style={{ marginLeft: 1 }} />
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.head}>
            <View style={[styles.bookBox, { backgroundColor: C.accent + '1F' }]}>
              <BookIcon size={28} color={C.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Exercise Library</Text>
              <Text style={styles.sub}>{EXERCISE_CATALOG.length} exercises · tap one for a preview</Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={HIT} style={styles.closeBtn}>
              <Ionicons name="close" size={18} color={C.muted} />
            </TouchableOpacity>
          </View>

          <View style={styles.search}>
            <Ionicons name="search" size={16} color={C.muted} />
            <TextInput style={styles.searchInput} value={query} onChangeText={setQuery}
              placeholder="Search exercises" placeholderTextColor={C.muted} returnKeyType="search" />
            {searching && (
              <TouchableOpacity onPress={() => setQuery('')} hitSlop={HIT}>
                <Ionicons name="close-circle" size={18} color={C.muted} />
              </TouchableOpacity>
            )}
          </View>

          <View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              {EQUIPMENT.map((f, i) => (
                <TouchableOpacity key={f.label} onPress={() => setEquip(i)} activeOpacity={0.8}
                  style={[styles.chip, equip === i && { backgroundColor: C.accent, borderColor: C.accent }]}>
                  <Text style={[styles.chipTxt, equip === i && { color: '#fff' }]}>{f.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          <FlatList
            data={items}
            keyExtractor={it => it.kind === 'group' ? `g:${it.group}` : it.kind === 'pattern' ? `p:${it.group}/${it.pattern}` : `e:${it.ex.name}`}
            renderItem={renderItem}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            initialNumToRender={20}
            windowSize={9}
            ListEmptyComponent={<Text style={styles.empty}>No exercises match your search</Text>}
            ListFooterComponent={
              searching && filtered.length > 200
                ? <Text style={styles.empty}>Showing 200 of {filtered.length} — keep typing to narrow it down</Text>
                : <Text style={styles.credit}>Exercises & photos: free-exercise-db (public domain)</Text>
            }
          />
        </View>
      </View>
      {preview && <ExerciseGuideModal name={preview.name} color={colorOf(preview.group)} onClose={() => setPreview(null)} />}
    </Modal>
  );
}

function makeStyles(C: any) {
  return StyleSheet.create({
    overlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
    sheet:      { height: '92%', backgroundColor: C.card, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 18, paddingTop: 12, borderWidth: 1, borderColor: C.border },
    handle:     { width: 40, height: 5, backgroundColor: C.border, borderRadius: 3, alignSelf: 'center', marginBottom: 14 },
    head:       { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
    bookBox:    { width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
    title:      { fontSize: 20, fontWeight: '800', color: C.text },
    sub:        { fontSize: 12, fontWeight: '600', color: C.muted, marginTop: 2 },
    closeBtn:   { width: 32, height: 32, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg, borderWidth: 1, borderColor: C.border },
    search:     { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.bg, borderRadius: 14, paddingHorizontal: 12, borderWidth: 1, borderColor: C.border },
    searchInput:{ flex: 1, paddingVertical: 10, fontSize: 14, color: C.text, fontWeight: '600' },
    chips:      { gap: 8, paddingVertical: 12 },
    chip:       { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, borderWidth: 1, borderColor: C.border, backgroundColor: C.bg },
    chipTxt:    { fontSize: 12, fontWeight: '800', color: C.muted },
    groupHead:  { flexDirection: 'row', alignItems: 'center', borderRadius: 16, borderWidth: 1.5, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 8 },
    groupIcon:  { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
    groupName:  { fontSize: 15, fontWeight: '800' },
    groupMeta:  { fontSize: 11, color: C.muted, marginTop: 1, fontWeight: '600' },
    patternRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 6, marginLeft: 6 },
    patternBar: { width: 3, height: 16, borderRadius: 2 },
    patternName:{ flex: 1, fontSize: 14, fontWeight: '700', color: C.textSub },
    patternCount:{ fontSize: 12, fontWeight: '800', color: C.muted },
    exRow:      { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, backgroundColor: C.bg, marginBottom: 6, borderWidth: 1, borderColor: C.border },
    exName:     { fontSize: 14, fontWeight: '700', color: C.text },
    exMeta:     { fontSize: 11, fontWeight: '600', color: C.muted, marginTop: 2 },
    playBtn:    { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    empty:      { fontSize: 13, color: C.muted, fontWeight: '600', textAlign: 'center', paddingVertical: 24 },
    credit:     { fontSize: 10, color: C.muted, fontWeight: '600', textAlign: 'center', paddingVertical: 18, opacity: 0.8 },
  });
}
