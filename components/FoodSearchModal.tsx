// components/FoodSearchModal.tsx
// Comprehensive Food Search, Grams/Macro Calculator & Multi-Item Meal Logger
// 100% Free Open Food Facts Internet Search + Local Staples (Zero API Keys)

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { useCustomAlert } from '../contexts/AlertContext';
import { FOOD_DB } from '../constants/theme';
import {
  ScannedFoodItem,
  searchFoodOnline,
  calculatePortionMacros,
  CalculatedMacros,
} from '../utils/foodScannerService';

export interface StagedFoodItem {
  id: string;
  name: string;
  protein: number;
  calories: number;
  carbs: number;
  fat: number;
  grams: number;
  portionDesc: string;
}

interface FoodSearchModalProps {
  visible: boolean;
  onClose: () => void;
  onLogFoods: (items: Array<{ name: string; protein: number; calories: number }>) => void;
  onOpenBarcodeScanner?: () => void;
}

// Convert local FOOD_DB to ScannedFoodItem format
const LOCAL_STAPLES: ScannedFoodItem[] = Object.entries(FOOD_DB).map(([name, [protein, calories]]) => {
  // Extract grams from name like "Chicken Breast (100g)"
  const gMatch = name.match(/(\d+)\s*g/i);
  const servingGrams = gMatch ? parseInt(gMatch[1], 10) : 100;
  return {
    name: name.replace(/\s*\([^)]*\)/g, '').trim(),
    caloriesPer100g: Math.round((calories / servingGrams) * 100),
    proteinPer100g: Number(((protein / servingGrams) * 100).toFixed(1)),
    carbsPer100g: 0,
    fatPer100g: 0,
    caloriesPerServing: calories,
    proteinPerServing: protein,
    servingSizeGrams: servingGrams,
    source: 'manual',
    hasNutritionData: true,
  };
});

export default function FoodSearchModal({
  visible,
  onClose,
  onLogFoods,
  onOpenBarcodeScanner,
}: FoodSearchModalProps) {
  const { C, isDark } = useTheme();
  const { showAlert } = useCustomAlert();

  // Mode: 'search' | 'manual' | 'portion'
  const [activeTab, setActiveTab] = useState<'search' | 'manual'>('search');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ScannedFoodItem[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

  // Selected item for portion calculation
  const [selectedItem, setSelectedItem] = useState<ScannedFoodItem | null>(null);
  const [customName, setCustomName] = useState('');
  const [portionMode, setPortionMode] = useState<'grams' | 'servings'>('grams');
  const [gramInput, setGramInput] = useState('100');
  const [servingInput, setServingInput] = useState('1');

  // Manual entry fields
  const [manualName, setManualName] = useState('');
  const [manualGrams, setManualGrams] = useState('100');
  const [manualCals, setManualCals] = useState('');
  const [manualProt, setManualProt] = useState('');
  const [manualCarbs, setManualCarbs] = useState('');
  const [manualFat, setManualFat] = useState('');

  // Staged meal basket for multi-item logging
  const [stagedItems, setStagedItems] = useState<StagedFoodItem[]>([]);

  // Search debounce timer
  const searchTimer = useRef<any>(null);

  useEffect(() => {
    if (visible) {
      // Initialize with staples or popular items
      setResults(LOCAL_STAPLES);
      setSearchQuery('');
      setSelectedItem(null);
      setHasSearched(false);
    } else {
      setStagedItems([]);
    }
  }, [visible]);

  // Handle live search
  const handleQueryChange = (text: string) => {
    setSearchQuery(text);
    if (searchTimer.current) clearTimeout(searchTimer.current);

    if (!text.trim()) {
      setResults(LOCAL_STAPLES);
      setHasSearched(false);
      setLoading(false);
      return;
    }

    // Fast local filter
    const lower = text.toLowerCase().trim();
    const localMatches = LOCAL_STAPLES.filter(s =>
      s.name.toLowerCase().includes(lower)
    );

    searchTimer.current = setTimeout(async () => {
      setLoading(true);
      setHasSearched(true);
      try {
        const onlineMatches = await searchFoodOnline(lower);
        // Combine local matches at top, followed by online matches
        const combined = [
          ...localMatches,
          ...onlineMatches.filter(o => !localMatches.some(l => l.name.toLowerCase() === o.name.toLowerCase())),
        ];
        setResults(combined);
      } catch (_) {
        setResults(localMatches);
      } finally {
        setLoading(false);
      }
    }, 450);
  };

  const executeSearch = async () => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!searchQuery.trim()) return;

    setLoading(true);
    setHasSearched(true);
    const lower = searchQuery.toLowerCase().trim();
    const localMatches = LOCAL_STAPLES.filter(s =>
      s.name.toLowerCase().includes(lower)
    );

    try {
      const onlineMatches = await searchFoodOnline(lower);
      const combined = [
        ...localMatches,
        ...onlineMatches.filter(o => !localMatches.some(l => l.name.toLowerCase() === o.name.toLowerCase())),
      ];
      setResults(combined);
    } catch (_) {
      setResults(localMatches);
    } finally {
      setLoading(false);
    }
  };

  // Select item to configure grams/portion
  const handleSelectItem = (item: ScannedFoodItem) => {
    setSelectedItem(item);
    setCustomName(item.name + (item.brand ? ` (${item.brand})` : ''));
    const defaultG = item.servingSizeGrams || 100;
    setGramInput(String(Math.round(defaultG)));
    setServingInput('1');
    setPortionMode(item.caloriesPerServing !== undefined && defaultG !== 100 ? 'servings' : 'grams');
  };

  // Quick preset grams
  const setQuickGrams = (g: number) => {
    setPortionMode('grams');
    setGramInput(String(g));
  };

  // Current calculation for selected item
  const currentCalc: CalculatedMacros | null = selectedItem
    ? calculatePortionMacros(
        selectedItem,
        portionMode === 'servings' ? (parseFloat(servingInput) || 1) : (parseFloat(gramInput) || 100),
        portionMode
      )
    : null;

  // Add current selected item to staged list (multi-item)
  const handleAddToMealAndAddAnother = () => {
    if (!selectedItem || !currentCalc) return;

    const portionDesc = portionMode === 'servings'
      ? `${currentCalc.servingCount} serv (${currentCalc.grams}g)`
      : `${currentCalc.grams}g`;
    const finalName = `${customName.trim() || selectedItem.name} (${portionDesc})`;

    const newItem: StagedFoodItem = {
      id: `${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: finalName,
      protein: currentCalc.protein,
      calories: currentCalc.calories,
      carbs: currentCalc.carbs,
      fat: currentCalc.fat,
      grams: currentCalc.grams,
      portionDesc,
    };

    setStagedItems(prev => [...prev, newItem]);
    setSelectedItem(null);
    showAlert('✓ Added to Meal', `Added "${finalName}". Search for your next food item or tap "Log All Items" when ready!`);
  };

  // Directly log single selected item
  const handleLogSingleItem = () => {
    if (!selectedItem || !currentCalc) return;

    const portionDesc = portionMode === 'servings'
      ? `${currentCalc.servingCount} serv (${currentCalc.grams}g)`
      : `${currentCalc.grams}g`;
    const finalName = `${customName.trim() || selectedItem.name} (${portionDesc})`;

    const itemsToLog = [
      ...stagedItems.map(s => ({ name: s.name, protein: s.protein, calories: s.calories })),
      { name: finalName, protein: currentCalc.protein, calories: currentCalc.calories },
    ];

    onLogFoods(itemsToLog);
    onClose();
  };

  // Add manual item to meal
  const handleAddManualItem = (addAnother = false) => {
    if (!manualName.trim()) {
      showAlert('Food Name Required', 'Please enter a name for this food.');
      return;
    }
    const cals = parseInt(manualCals, 10) || 0;
    const prot = parseFloat(manualProt) || 0;
    const carbs = parseFloat(manualCarbs) || 0;
    const fat = parseFloat(manualFat) || 0;
    const grams = parseFloat(manualGrams) || 100;
    const finalName = `${manualName.trim()} (${grams}g)`;

    const newItem: StagedFoodItem = {
      id: `${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: finalName,
      protein: prot,
      calories: cals,
      carbs,
      fat,
      grams,
      portionDesc: `${grams}g`,
    };

    if (addAnother) {
      setStagedItems(prev => [...prev, newItem]);
      setManualName('');
      setManualCals('');
      setManualProt('');
      setManualCarbs('');
      setManualFat('');
      setManualGrams('100');
      showAlert('✓ Added to Meal', `Added "${finalName}". You can enter another item or tap "Log All Items"!`);
    } else {
      const itemsToLog = [
        ...stagedItems.map(s => ({ name: s.name, protein: s.protein, calories: s.calories })),
        { name: finalName, protein: prot, calories: cals },
      ];
      onLogFoods(itemsToLog);
      onClose();
    }
  };

  // Log all staged items
  const handleLogAllStaged = () => {
    if (stagedItems.length === 0) return;
    onLogFoods(stagedItems.map(s => ({ name: s.name, protein: s.protein, calories: s.calories })));
    onClose();
  };

  const handleRemoveStagedItem = (id: string) => {
    setStagedItems(prev => prev.filter(i => i.id !== id));
  };

  const totalStagedCals = stagedItems.reduce((acc, i) => acc + i.calories, 0);
  const totalStagedProt = stagedItems.reduce((acc, i) => acc + i.protein, 0);

  const styles = makeStyles(C, isDark);

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.container}>
          {/* Top Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color={C.text} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>
              {selectedItem ? 'Portion & Macros' : 'Add Food'}
            </Text>
            {onOpenBarcodeScanner ? (
              <TouchableOpacity
                onPress={() => {
                  onClose();
                  onOpenBarcodeScanner();
                }}
                style={styles.barcodeHeaderBtn}
              >
                <Ionicons name="barcode-outline" size={20} color="#4ADE80" />
              </TouchableOpacity>
            ) : (
              <View style={{ width: 40 }} />
            )}
          </View>

          {/* Staged Meal Banner (When 1+ items added) */}
          {stagedItems.length > 0 && !selectedItem && (
            <View style={styles.stagedBanner}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Ionicons name="basket-outline" size={16} color="#4ADE80" style={{ marginRight: 6 }} />
                  <Text style={styles.stagedTitle}>
                    Meal Basket ({stagedItems.length} item{stagedItems.length > 1 ? 's' : ''})
                  </Text>
                </View>
                <Text style={styles.stagedSub}>
                  Total: <Text style={{ fontWeight: '800', color: C.calories }}>{totalStagedCals} kcal</Text> • <Text style={{ fontWeight: '800', color: C.protein }}>{totalStagedProt.toFixed(1)}g Protein</Text>
                </Text>
              </View>
              <TouchableOpacity style={styles.logAllBtn} onPress={handleLogAllStaged}>
                <Text style={styles.logAllBtnTxt}>✓ Log All ({stagedItems.length})</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Main Content */}
          {selectedItem ? (
            /* ── PORTION & GRAMS CALCULATOR VIEW ── */
            <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
              <TouchableOpacity
                style={styles.backToSearchBtn}
                onPress={() => setSelectedItem(null)}
              >
                <Ionicons name="arrow-back" size={16} color={C.accent} style={{ marginRight: 6 }} />
                <Text style={styles.backToSearchTxt}>Back to search results</Text>
              </TouchableOpacity>

              {/* Food Name & Brand */}
              <View style={styles.card}>
                <Text style={styles.cardLabel}>FOOD NAME</Text>
                <TextInput
                  style={styles.foodNameInput}
                  value={customName}
                  onChangeText={setCustomName}
                  placeholder="Food name"
                  placeholderTextColor={C.muted}
                />
                {selectedItem.brand && (
                  <Text style={styles.brandSub}>Brand: {selectedItem.brand}</Text>
                )}
              </View>

              {/* Portion Mode Selector */}
              <View style={styles.tabRow}>
                <TouchableOpacity
                  style={[styles.tabBtn, portionMode === 'grams' && styles.tabBtnActive]}
                  onPress={() => setPortionMode('grams')}
                >
                  <Text style={[styles.tabBtnTxt, portionMode === 'grams' && styles.tabBtnTxtActive]}>
                    Custom Grams (g)
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.tabBtn, portionMode === 'servings' && styles.tabBtnActive]}
                  onPress={() => setPortionMode('servings')}
                >
                  <Text style={[styles.tabBtnTxt, portionMode === 'servings' && styles.tabBtnTxtActive]}>
                    Per Serving ({selectedItem.servingSizeGrams || 100}g)
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Quantity Input */}
              <View style={styles.card}>
                <Text style={styles.cardLabel}>
                  {portionMode === 'grams' ? 'HOW MANY GRAMS ARE YOU EATING?' : 'HOW MANY SERVINGS?'}
                </Text>
                <View style={styles.portionInputRow}>
                  <TextInput
                    style={styles.bigNumberInput}
                    keyboardType="numeric"
                    value={portionMode === 'grams' ? gramInput : servingInput}
                    onChangeText={portionMode === 'grams' ? setGramInput : setServingInput}
                    selectTextOnFocus
                  />
                  <Text style={styles.unitSuffix}>
                    {portionMode === 'grams' ? 'grams (g)' : 'servings'}
                  </Text>
                </View>

                {/* Quick Gram Chips */}
                {portionMode === 'grams' && (
                  <View style={styles.chipRow}>
                    {[30, 50, 100, 150, 200, 250].map(g => (
                      <TouchableOpacity
                        key={g}
                        style={[styles.chip, gramInput === String(g) && styles.chipActive]}
                        onPress={() => setQuickGrams(g)}
                      >
                        <Text style={[styles.chipTxt, gramInput === String(g) && styles.chipTxtActive]}>
                          {g}g
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>

              {/* Calculated Macros Grid */}
              {currentCalc && (
                <View style={styles.card}>
                  <View style={styles.macroHeaderRow}>
                    <Text style={styles.cardLabel}>CALCULATED INTAKE</Text>
                    <Text style={styles.portionBadge}>{currentCalc.grams}g</Text>
                  </View>

                  <View style={styles.macroGrid}>
                    <View style={[styles.macroBox, { backgroundColor: isDark ? '#2D0E0E' : '#FEE2E2' }]}>
                      <Text style={[styles.macroValue, { color: C.calories }]}>
                        {currentCalc.calories}
                      </Text>
                      <Text style={[styles.macroTitle, { color: C.calories }]}>Calories</Text>
                      <Text style={styles.macroSub}>kcal</Text>
                    </View>

                    <View style={[styles.macroBox, { backgroundColor: isDark ? '#2D200A' : '#FEF3C7' }]}>
                      <Text style={[styles.macroValue, { color: C.protein }]}>
                        {currentCalc.protein}g
                      </Text>
                      <Text style={[styles.macroTitle, { color: C.protein }]}>Protein</Text>
                      <Text style={styles.macroSub}>muscle gain</Text>
                    </View>

                    <View style={[styles.macroBox, { backgroundColor: isDark ? '#1A2E4A' : '#E0F2FE' }]}>
                      <Text style={[styles.macroValue, { color: '#0284C7' }]}>
                        {currentCalc.carbs}g
                      </Text>
                      <Text style={[styles.macroTitle, { color: '#0284C7' }]}>Carbs</Text>
                      <Text style={styles.macroSub}>energy</Text>
                    </View>

                    <View style={[styles.macroBox, { backgroundColor: isDark ? '#1A261A' : '#DCFCE7' }]}>
                      <Text style={[styles.macroValue, { color: '#16A34A' }]}>
                        {currentCalc.fat}g
                      </Text>
                      <Text style={[styles.macroTitle, { color: '#16A34A' }]}>Fat</Text>
                      <Text style={styles.macroSub}>healthy fats</Text>
                    </View>
                  </View>
                </View>
              )}

              {/* Action Buttons for Multi-Item Logging */}
              <View style={styles.actionButtons}>
                <TouchableOpacity
                  style={styles.addAnotherBtn}
                  onPress={handleAddToMealAndAddAnother}
                >
                  <Ionicons name="add-circle-outline" size={20} color="#FFFFFF" style={{ marginRight: 6 }} />
                  <Text style={styles.addAnotherBtnTxt}>+ Add to Meal & Add Another</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.logSingleBtn}
                  onPress={handleLogSingleItem}
                >
                  <Ionicons name="checkmark-circle-outline" size={20} color="#0A0E1A" style={{ marginRight: 6 }} />
                  <Text style={styles.logSingleBtnTxt}>
                    {stagedItems.length > 0 ? `Log All (${stagedItems.length + 1} Items)` : 'Log This Item to Diary'}
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          ) : (
            /* ── SEARCH & STAPLES / MANUAL ENTRY VIEW ── */
            <View style={{ flex: 1 }}>
              {/* Tab Selector: Search vs Manual */}
              <View style={styles.mainTabRow}>
                <TouchableOpacity
                  style={[styles.mainTab, activeTab === 'search' && styles.mainTabActive]}
                  onPress={() => setActiveTab('search')}
                >
                  <Ionicons
                    name="search-outline"
                    size={16}
                    color={activeTab === 'search' ? '#4ADE80' : C.muted}
                    style={{ marginRight: 6 }}
                  />
                  <Text style={[styles.mainTabTxt, activeTab === 'search' && styles.mainTabTxtActive]}>
                    Search Food
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.mainTab, activeTab === 'manual' && styles.mainTabActive]}
                  onPress={() => setActiveTab('manual')}
                >
                  <Ionicons
                    name="create-outline"
                    size={16}
                    color={activeTab === 'manual' ? '#4ADE80' : C.muted}
                    style={{ marginRight: 6 }}
                  />
                  <Text style={[styles.mainTabTxt, activeTab === 'manual' && styles.mainTabTxtActive]}>
                    Manual Entry
                  </Text>
                </TouchableOpacity>
              </View>

              {activeTab === 'search' ? (
                <View style={{ flex: 1 }}>
                  {/* Search Bar */}
                  <View style={styles.searchBarWrap}>
                    <Ionicons name="search" size={20} color={C.muted} style={{ marginRight: 8 }} />
                    <TextInput
                      style={styles.searchInput}
                      placeholder="Search any food (e.g. Oats, Egg, Pasta, Salmon)..."
                      placeholderTextColor={C.muted}
                      value={searchQuery}
                      onChangeText={handleQueryChange}
                      onSubmitEditing={executeSearch}
                      returnKeyType="search"
                      autoFocus={false}
                    />
                    {searchQuery.length > 0 && (
                      <TouchableOpacity onPress={() => handleQueryChange('')} style={{ padding: 4 }}>
                        <Ionicons name="close-circle" size={18} color={C.muted} />
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* Staged Items List (Mini Drawer) */}
                  {stagedItems.length > 0 && (
                    <View style={styles.miniStagedList}>
                      <Text style={styles.miniStagedHeader}>ITEMS IN CURRENT MEAL:</Text>
                      {stagedItems.map((item, idx) => (
                        <View key={item.id} style={styles.miniStagedRow}>
                          <Text style={styles.miniStagedIdx}>{idx + 1}.</Text>
                          <View style={{ flex: 1, marginHorizontal: 8 }}>
                            <Text style={styles.miniStagedName} numberOfLines={1}>{item.name}</Text>
                            <Text style={styles.miniStagedMacros}>
                              {item.calories} kcal • {item.protein}g P • {item.carbs}g C • {item.fat}g F
                            </Text>
                          </View>
                          <TouchableOpacity onPress={() => handleRemoveStagedItem(item.id)} style={{ padding: 6 }}>
                            <Ionicons name="trash-outline" size={16} color={C.red} />
                          </TouchableOpacity>
                        </View>
                      ))}
                    </View>
                  )}

                  {/* Search Results List */}
                  <View style={{ flex: 1 }}>
                    <View style={styles.resultsHeaderRow}>
                      <Text style={styles.resultsHeader}>
                        {searchQuery.trim() ? (hasSearched ? 'Search Results' : 'Searching...') : 'Popular Fitness Staples'}
                      </Text>
                      {loading && <ActivityIndicator size="small" color="#4ADE80" />}
                    </View>

                    <FlatList
                      data={results}
                      keyExtractor={(item, index) => `${item.name}_${item.barcode || index}`}
                      keyboardShouldPersistTaps="handled"
                      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: stagedItems.length > 0 ? 80 : 30 }}
                      renderItem={({ item }) => {
                        const cal = item.caloriesPerServing ?? item.caloriesPer100g;
                        const prot = item.proteinPerServing ?? item.proteinPer100g;
                        const carbs = item.carbsPerServing ?? item.carbsPer100g ?? 0;
                        const fat = item.fatPerServing ?? item.fatPer100g ?? 0;
                        const isServing = item.caloriesPerServing !== undefined && item.servingSizeGrams !== 100;
                        const portionTag = isServing ? `${item.servingSizeGrams}g serv` : '100g';

                        return (
                          <TouchableOpacity
                            style={styles.foodItemRow}
                            onPress={() => handleSelectItem(item)}
                            activeOpacity={0.7}
                          >
                            <View style={{ flex: 1 }}>
                              <Text style={styles.foodItemName} numberOfLines={1}>
                                {item.name}
                              </Text>
                              {item.brand && (
                                <Text style={styles.foodItemBrand} numberOfLines={1}>
                                  {item.brand}
                                </Text>
                              )}
                              <View style={styles.foodMacroPills}>
                                <View style={[styles.macroPillBadge, { backgroundColor: isDark ? '#2D1414' : '#FEE2E2' }]}>
                                  <Ionicons name="flame" size={11} color={C.calories} style={{ marginRight: 3 }} />
                                  <Text style={[styles.macroPillTxt, { color: C.calories }]}>{cal} kcal</Text>
                                </View>
                                <View style={[styles.macroPillBadge, { backgroundColor: isDark ? '#2D200A' : '#FEF3C7' }]}>
                                  <Ionicons name="barbell-outline" size={11} color={C.protein} style={{ marginRight: 3 }} />
                                  <Text style={[styles.macroPillTxt, { color: C.protein }]}>{prot}g P</Text>
                                </View>
                                <View style={[styles.macroPillBadge, { backgroundColor: isDark ? '#14253D' : '#E0F2FE' }]}>
                                  <Ionicons name="leaf-outline" size={11} color="#0284C7" style={{ marginRight: 3 }} />
                                  <Text style={[styles.macroPillTxt, { color: '#0284C7' }]}>{carbs}g C</Text>
                                </View>
                                <View style={[styles.macroPillBadge, { backgroundColor: isDark ? '#12261A' : '#DCFCE7' }]}>
                                  <Ionicons name="water-outline" size={11} color="#16A34A" style={{ marginRight: 3 }} />
                                  <Text style={[styles.macroPillTxt, { color: '#16A34A' }]}>{fat}g F</Text>
                                </View>
                              </View>
                            </View>

                            <View style={styles.addBtnCircle}>
                              <Text style={styles.portionTagTxt}>{portionTag}</Text>
                              <Ionicons name="chevron-forward" size={16} color={C.muted} />
                            </View>
                          </TouchableOpacity>
                        );
                      }}
                      ListEmptyComponent={
                        !loading ? (
                          <View style={styles.emptyState}>
                            <Ionicons name="search" size={40} color={C.muted} style={{ marginBottom: 12 }} />
                            <Text style={styles.emptyTitle}>No exact food found</Text>
                            <Text style={styles.emptySub}>
                              Try searching another keyword, or use the "Manual Entry" tab above to type your macros directly!
                            </Text>
                          </View>
                        ) : null
                      }
                    />
                  </View>
                </View>
              ) : (
                /* ── MANUAL FOOD ENTRY TAB ── */
                <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
                  <View style={styles.card}>
                    <Text style={styles.cardLabel}>FOOD NAME</Text>
                    <TextInput
                      style={styles.foodNameInput}
                      placeholder="e.g. Homemade Chicken Rice Bowl"
                      placeholderTextColor={C.muted}
                      value={manualName}
                      onChangeText={setManualName}
                    />
                  </View>

                  <View style={styles.card}>
                    <Text style={styles.cardLabel}>PORTION (GRAMS)</Text>
                    <TextInput
                      style={styles.foodNameInput}
                      placeholder="100"
                      placeholderTextColor={C.muted}
                      keyboardType="numeric"
                      value={manualGrams}
                      onChangeText={setManualGrams}
                    />
                  </View>

                  <View style={styles.card}>
                    <Text style={styles.cardLabel}>NUTRITION MACROS</Text>
                    <View style={styles.manualGrid}>
                      <View style={{ flex: 1, marginRight: 6 }}>
                        <Text style={[styles.miniLabel, { color: C.calories }]}>Calories (kcal)</Text>
                        <TextInput
                          style={styles.manualInput}
                          placeholder="0"
                          placeholderTextColor={C.muted}
                          keyboardType="numeric"
                          value={manualCals}
                          onChangeText={setManualCals}
                        />
                      </View>
                      <View style={{ flex: 1, marginLeft: 6 }}>
                        <Text style={[styles.miniLabel, { color: C.protein }]}>Protein (g)</Text>
                        <TextInput
                          style={styles.manualInput}
                          placeholder="0"
                          placeholderTextColor={C.muted}
                          keyboardType="numeric"
                          value={manualProt}
                          onChangeText={setManualProt}
                        />
                      </View>
                    </View>

                    <View style={[styles.manualGrid, { marginTop: 12 }]}>
                      <View style={{ flex: 1, marginRight: 6 }}>
                        <Text style={[styles.miniLabel, { color: '#0284C7' }]}>Carbs (g)</Text>
                        <TextInput
                          style={styles.manualInput}
                          placeholder="0"
                          placeholderTextColor={C.muted}
                          keyboardType="numeric"
                          value={manualCarbs}
                          onChangeText={setManualCarbs}
                        />
                      </View>
                      <View style={{ flex: 1, marginLeft: 6 }}>
                        <Text style={[styles.miniLabel, { color: '#16A34A' }]}>Fat (g)</Text>
                        <TextInput
                          style={styles.manualInput}
                          placeholder="0"
                          placeholderTextColor={C.muted}
                          keyboardType="numeric"
                          value={manualFat}
                          onChangeText={setManualFat}
                        />
                      </View>
                    </View>
                  </View>

                  {/* Manual Action Buttons */}
                  <View style={styles.actionButtons}>
                    <TouchableOpacity
                      style={styles.addAnotherBtn}
                      onPress={() => handleAddManualItem(true)}
                    >
                      <Ionicons name="add-circle-outline" size={20} color="#FFFFFF" style={{ marginRight: 6 }} />
                      <Text style={styles.addAnotherBtnTxt}>+ Add to Meal & Add Another</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.logSingleBtn}
                      onPress={() => handleAddManualItem(false)}
                    >
                      <Ionicons name="checkmark-circle-outline" size={20} color="#0A0E1A" style={{ marginRight: 6 }} />
                      <Text style={styles.logSingleBtnTxt}>
                        {stagedItems.length > 0 ? `Log All (${stagedItems.length + 1} Items)` : 'Log This Item to Diary'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </ScrollView>
              )}
            </View>
          )}

          {/* Floating Bottom Log All Bar (If items are staged and we're in search view) */}
          {stagedItems.length > 0 && !selectedItem && (
            <View style={styles.floatingBottomBar}>
              <TouchableOpacity style={styles.floatingLogBtn} onPress={handleLogAllStaged}>
                <Ionicons name="checkmark-done" size={20} color="#0A0E1A" style={{ marginRight: 8 }} />
                <Text style={styles.floatingLogTxt}>
                  Log Meal ({stagedItems.length} items • {totalStagedCals} kcal • {totalStagedProt.toFixed(1)}g P)
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function makeStyles(C: any, isDark?: boolean) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: C.bg,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingTop: Platform.OS === 'ios' ? 50 : 20,
      paddingBottom: 14,
      borderBottomWidth: 1,
      borderBottomColor: C.border,
      backgroundColor: C.surface,
    },
    closeBtn: {
      padding: 6,
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: '800',
      color: C.text,
    },
    barcodeHeaderBtn: {
      width: 38,
      height: 38,
      borderRadius: 12,
      backgroundColor: isDark ? '#112F18' : '#DCFCE7',
      alignItems: 'center',
      justifyContent: 'center',
    },
    mainTabRow: {
      flexDirection: 'row',
      marginHorizontal: 16,
      marginTop: 12,
      marginBottom: 8,
      backgroundColor: isDark ? '#1A2234' : '#E8EEF5',
      borderRadius: 12,
      padding: 4,
    },
    mainTab: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 10,
      borderRadius: 10,
    },
    mainTabActive: {
      backgroundColor: isDark ? '#243048' : '#FFFFFF',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 3,
      elevation: 2,
    },
    mainTabTxt: {
      fontSize: 13,
      fontWeight: '700',
      color: C.muted,
    },
    mainTabTxtActive: {
      color: '#4ADE80',
    },
    searchBarWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: C.card,
      marginHorizontal: 16,
      marginVertical: 8,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: C.border,
    },
    searchInput: {
      flex: 1,
      fontSize: 14,
      color: C.text,
      paddingVertical: 2,
    },
    stagedBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: isDark ? '#112F18' : '#DCFCE7',
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: '#4ADE8044',
    },
    stagedTitle: {
      fontSize: 13,
      fontWeight: '800',
      color: '#4ADE80',
    },
    stagedSub: {
      fontSize: 12,
      color: isDark ? '#E8ECF0' : '#1F2937',
      marginTop: 2,
    },
    logAllBtn: {
      backgroundColor: '#4ADE80',
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    logAllBtnTxt: {
      fontSize: 12,
      fontWeight: '800',
      color: '#0A0E1A',
    },
    miniStagedList: {
      marginHorizontal: 16,
      marginBottom: 10,
      backgroundColor: C.card,
      borderRadius: 12,
      padding: 10,
      borderWidth: 1,
      borderColor: C.border,
    },
    miniStagedHeader: {
      fontSize: 11,
      fontWeight: '800',
      color: C.muted,
      marginBottom: 6,
    },
    miniStagedRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 6,
      borderBottomWidth: 1,
      borderBottomColor: C.border,
    },
    miniStagedIdx: {
      fontSize: 12,
      fontWeight: '700',
      color: C.muted,
      width: 18,
    },
    miniStagedName: {
      fontSize: 13,
      fontWeight: '700',
      color: C.text,
    },
    miniStagedMacros: {
      fontSize: 11,
      color: C.muted,
      marginTop: 1,
    },
    resultsHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 6,
    },
    resultsHeader: {
      fontSize: 12,
      fontWeight: '800',
      color: C.muted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    foodItemRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: C.card,
      padding: 14,
      borderRadius: 14,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: C.border,
    },
    foodItemName: {
      fontSize: 15,
      fontWeight: '700',
      color: C.text,
      marginBottom: 2,
    },
    foodItemBrand: {
      fontSize: 12,
      color: C.muted,
      marginBottom: 6,
    },
    foodMacroPills: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      marginTop: 2,
    },
    macroPill: {
      fontSize: 12,
      fontWeight: '700',
      backgroundColor: isDark ? '#1C2638' : '#F1F5F9',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
    },
    macroPillBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 7,
    },
    macroPillTxt: {
      fontSize: 12,
      fontWeight: '700',
    },
    addBtnCircle: {
      alignItems: 'flex-end',
      marginLeft: 10,
    },
    portionTagTxt: {
      fontSize: 11,
      fontWeight: '700',
      color: C.muted,
      marginBottom: 4,
    },
    emptyState: {
      alignItems: 'center',
      paddingVertical: 40,
      paddingHorizontal: 20,
    },
    emptyTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: C.text,
      marginBottom: 6,
    },
    emptySub: {
      fontSize: 13,
      color: C.muted,
      textAlign: 'center',
      lineHeight: 18,
    },
    scroll: {
      flex: 1,
    },
    scrollContent: {
      padding: 16,
      paddingBottom: 40,
    },
    backToSearchBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 14,
    },
    backToSearchTxt: {
      fontSize: 14,
      fontWeight: '700',
      color: C.accent,
    },
    card: {
      backgroundColor: C.card,
      borderRadius: 16,
      padding: 16,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: C.border,
    },
    cardLabel: {
      fontSize: 11,
      fontWeight: '800',
      color: C.muted,
      marginBottom: 8,
      letterSpacing: 0.5,
    },
    foodNameInput: {
      fontSize: 16,
      fontWeight: '700',
      color: C.text,
      backgroundColor: isDark ? '#1A2234' : '#F8FAFC',
      padding: 12,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: C.border,
    },
    brandSub: {
      fontSize: 12,
      color: C.muted,
      marginTop: 6,
    },
    tabRow: {
      flexDirection: 'row',
      marginBottom: 12,
      backgroundColor: isDark ? '#1A2234' : '#E8EEF5',
      borderRadius: 12,
      padding: 4,
    },
    tabBtn: {
      flex: 1,
      paddingVertical: 10,
      alignItems: 'center',
      borderRadius: 10,
    },
    tabBtnActive: {
      backgroundColor: isDark ? '#243048' : '#FFFFFF',
    },
    tabBtnTxt: {
      fontSize: 13,
      fontWeight: '700',
      color: C.muted,
    },
    tabBtnTxtActive: {
      color: C.text,
    },
    portionInputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? '#1A2234' : '#F8FAFC',
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderWidth: 1,
      borderColor: C.border,
    },
    bigNumberInput: {
      fontSize: 26,
      fontWeight: '900',
      color: '#4ADE80',
      width: 100,
      paddingVertical: 2,
    },
    unitSuffix: {
      fontSize: 15,
      fontWeight: '700',
      color: C.muted,
      marginLeft: 8,
    },
    chipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 12,
    },
    chip: {
      backgroundColor: isDark ? '#1C2638' : '#F1F5F9',
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: C.border,
    },
    chipActive: {
      backgroundColor: '#4ADE8022',
      borderColor: '#4ADE80',
    },
    chipTxt: {
      fontSize: 13,
      fontWeight: '700',
      color: C.muted,
    },
    chipTxtActive: {
      color: '#4ADE80',
    },
    macroHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
    },
    portionBadge: {
      fontSize: 12,
      fontWeight: '800',
      color: '#4ADE80',
      backgroundColor: isDark ? '#112F18' : '#DCFCE7',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
    },
    macroGrid: {
      flexDirection: 'row',
      gap: 8,
    },
    macroBox: {
      flex: 1,
      borderRadius: 12,
      padding: 10,
      alignItems: 'center',
    },
    macroValue: {
      fontSize: 16,
      fontWeight: '900',
      marginBottom: 2,
    },
    macroTitle: {
      fontSize: 11,
      fontWeight: '800',
    },
    macroSub: {
      fontSize: 9,
      color: C.muted,
      marginTop: 2,
    },
    actionButtons: {
      gap: 10,
      marginTop: 8,
    },
    addAnotherBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#2563EB',
      borderRadius: 14,
      paddingVertical: 14,
    },
    addAnotherBtnTxt: {
      fontSize: 15,
      fontWeight: '800',
      color: '#FFFFFF',
    },
    logSingleBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#4ADE80',
      borderRadius: 14,
      paddingVertical: 14,
    },
    logSingleBtnTxt: {
      fontSize: 15,
      fontWeight: '800',
      color: '#0A0E1A',
    },
    manualGrid: {
      flexDirection: 'row',
    },
    miniLabel: {
      fontSize: 11,
      fontWeight: '800',
      marginBottom: 6,
    },
    manualInput: {
      backgroundColor: isDark ? '#1A2234' : '#F8FAFC',
      borderRadius: 10,
      borderWidth: 1,
      borderColor: C.border,
      padding: 10,
      fontSize: 15,
      fontWeight: '700',
      color: C.text,
    },
    floatingBottomBar: {
      position: 'absolute',
      bottom: 16,
      left: 16,
      right: 16,
    },
    floatingLogBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#4ADE80',
      borderRadius: 16,
      paddingVertical: 15,
      shadowColor: '#4ADE80',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.4,
      shadowRadius: 8,
      elevation: 6,
    },
    floatingLogTxt: {
      fontSize: 14,
      fontWeight: '900',
      color: '#0A0E1A',
    },
  });
}
