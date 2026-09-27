// components/FoodScannerModal.tsx
// Barcode Scanner & Nutrition Label AI Scanner with Grams / Per Serving Macro Calculator

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Dimensions,
  Animated,
  Platform,
  Vibration,
  ScrollView,
  KeyboardAvoidingView,
  FlatList,
} from 'react-native';
import { CameraView, useCameraPermissions, BarcodeScanningResult } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import {
  ScannedFoodItem,
  fetchFoodByBarcode,
  parseNutritionLabelOnDevice,
  calculatePortionMacros,
  saveFoodToCache,
  searchFoodOnline,
} from '../utils/foodScannerService';
import { FOOD_DB } from '../constants/theme';

const { width: SW } = Dimensions.get('window');

const LOCAL_STAPLES: ScannedFoodItem[] = Object.entries(FOOD_DB).map(([name, [protein, calories]]) => {
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

interface FoodScannerModalProps {
  visible: boolean;
  onClose: () => void;
  onLogFood: (name: string, protein: number, calories: number) => void;
}

export default function FoodScannerModal({
  visible,
  onClose,
  onLogFood,
}: FoodScannerModalProps) {
  const { C, isDark } = useTheme();
  const [permission, requestPermission] = useCameraPermissions();

  // Mode: 'barcode' | 'label' | 'search' | 'calculator'
  const [mode, setMode] = useState<'barcode' | 'label' | 'search' | 'calculator'>('barcode');
  const [torch, setTorch] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Search mode state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ScannedFoodItem[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const [sessionLoggedCount, setSessionLoggedCount] = useState(0);
  const searchTimer = useRef<any>(null);

  // Scanned item & calculator state
  const [scannedItem, setScannedItem] = useState<ScannedFoodItem | null>(null);
  const [customFoodName, setCustomFoodName] = useState('');
  
  // Portion calculation mode: 'grams' | 'servings'
  const [portionMode, setPortionMode] = useState<'grams' | 'servings'>('grams');
  const [gramInput, setGramInput] = useState('30'); // Default to 30g
  const [servingInput, setServingInput] = useState('1'); // Default to 1 serving
  const [hasScannedBarcode, setHasScannedBarcode] = useState(false);

  // Editable base values (if database values are 0 or user wants to adjust)
  const [editBaseOpen, setEditBaseOpen] = useState(false);
  const [baseDisplayMode, setBaseDisplayMode] = useState<'100g' | 'serving'>('serving');
  const [baseCalsInput, setBaseCalsInput] = useState('0');
  const [baseProtInput, setBaseProtInput] = useState('0');
  const [baseCarbsInput, setBaseCarbsInput] = useState('0');
  const [baseFatInput, setBaseFatInput] = useState('0');
  const [baseServingGramsInput, setBaseServingGramsInput] = useState('30');

  const cameraRef = useRef<any>(null);
  const laserAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible && (mode === 'barcode' || mode === 'label')) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(laserAnim, {
            toValue: 1,
            duration: 1800,
            useNativeDriver: true,
          }),
          Animated.timing(laserAnim, {
            toValue: 0,
            duration: 1800,
            useNativeDriver: true,
          }),
        ])
      ).start();
    }
  }, [visible, mode]);

  useEffect(() => {
    if (visible) {
      setHasScannedBarcode(false);
      setErrorMessage(null);
      setLoading(false);
      setSessionLoggedCount(0);
      setSuccessToast(null);
    }
  }, [visible]);

  // Handle barcode scanned
  const handleBarcodeScanned = async (result: BarcodeScanningResult) => {
    if (hasScannedBarcode || loading || mode !== 'barcode') return;
    setHasScannedBarcode(true);

    try {
      if (Platform.OS === 'android') {
        Vibration.vibrate(80);
      }
    } catch (_) {}

    setLoading(true);
    setLoadingMessage(`Looking up barcode ${result.data}...`);
    setErrorMessage(null);

    try {
      const food = await fetchFoodByBarcode(result.data);
      if (food) {
        setupLoadedItem(food);
      } else {
        setErrorMessage(`Product not found for barcode: ${result.data}. You can scan its Nutrition Label or enter it manually.`);
        setHasScannedBarcode(false);
      }
    } catch (err: any) {
      setErrorMessage('Could not reach food database. Check your internet connection.');
      setHasScannedBarcode(false);
    } finally {
      setLoading(false);
    }
  };

  const setupLoadedItem = (food: ScannedFoodItem) => {
    setScannedItem(food);
    setCustomFoodName(food.name + (food.brand ? ` (${food.brand})` : ''));
    setBaseCalsInput(String(food.caloriesPer100g || 0));
    setBaseProtInput(String(food.proteinPer100g || 0));
    setBaseCarbsInput(String(food.carbsPer100g || 0));
    setBaseFatInput(String(food.fatPer100g || 0));
    const servingGrams = Math.round(food.servingSizeGrams || 30);
    setBaseServingGramsInput(String(servingGrams));

    // Only open base editor if nutrition data was truly missing from the database
    if (food.hasNutritionData === false) {
      setEditBaseOpen(true);
    } else {
      setEditBaseOpen(false);
    }

    setGramInput(String(servingGrams));
    setServingInput('1');
    // If product has per-serving information, default to serving view/mode
    setPortionMode(food.caloriesPerServing !== undefined ? 'servings' : 'grams');
    setBaseDisplayMode(food.caloriesPerServing !== undefined ? 'serving' : '100g');
    setMode('calculator');
  };

  // Handle capturing picture of Nutrition Label (100% On-Device OCR - Zero API Key!)
  const handleCaptureLabel = async () => {
    if (!cameraRef.current || loading) return;

    try {
      setLoading(true);
      setLoadingMessage('Scanning nutrition label on-device...');
      setErrorMessage(null);

      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
      });

      if (!photo || !photo.uri) {
        throw new Error('Failed to capture photo');
      }

      const food = await parseNutritionLabelOnDevice(photo.uri);
      setupLoadedItem(food);
    } catch (err: any) {
      setErrorMessage(err.message || 'Could not read nutrition text on this photo.');
    } finally {
      setLoading(false);
    }
  };

  // Handle picking image from gallery (100% On-Device OCR - Zero API Key!)
  const handlePickLabelImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]?.uri) {
        setLoading(true);
        setLoadingMessage('Scanning nutrition label on-device...');
        setErrorMessage(null);

        const food = await parseNutritionLabelOnDevice(result.assets[0].uri);
        setupLoadedItem(food);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Could not read nutrition text on selected photo.');
    } finally {
      setLoading(false);
    }
  };

  // Update base values when manually edited
  const handleApplyBaseValues = () => {
    if (!scannedItem) return;
    const newCal = Math.max(0, parseInt(baseCalsInput, 10) || 0);
    const newProt = Math.max(0, parseFloat(baseProtInput) || 0);
    const newCarbs = Math.max(0, parseFloat(baseCarbsInput) || 0);
    const newFat = Math.max(0, parseFloat(baseFatInput) || 0);
    const newServingGrams = Math.max(1, parseFloat(baseServingGramsInput) || 30);

    const updated: ScannedFoodItem = {
      ...scannedItem,
      caloriesPer100g: newCal,
      proteinPer100g: newProt,
      carbsPer100g: newCarbs,
      fatPer100g: newFat,
      servingSizeGrams: newServingGrams,
      caloriesPerServing: Math.round((newCal * newServingGrams) / 100),
      proteinPerServing: Number(((newProt * newServingGrams) / 100).toFixed(1)),
      carbsPerServing: Number(((newCarbs * newServingGrams) / 100).toFixed(1)),
      fatPerServing: Number(((newFat * newServingGrams) / 100).toFixed(1)),
      hasNutritionData: true,
    };
    setScannedItem(updated);
    saveFoodToCache(updated);
    setEditBaseOpen(false);
  };

  // Log calculated food to tracker (keeps scanner open by default, or closes if requested)
  const handleLogIntake = (closeAfter = false) => {
    if (!scannedItem || !currentCalc) return;
    const portionDesc = portionMode === 'servings'
      ? `${currentCalc.servingCount} serv (${currentCalc.grams}g)`
      : `${currentCalc.grams}g`;
    const finalName = `${customFoodName.trim() || scannedItem.name || 'Food Item'} (${portionDesc})`;

    onLogFood(finalName, currentCalc.protein, currentCalc.calories);
    setSessionLoggedCount(prev => prev + 1);

    if (closeAfter) {
      handleClose();
    } else {
      setSuccessToast(`✓ Logged ${finalName} (${currentCalc.calories} kcal, ${currentCalc.protein}g protein)!`);
      setTimeout(() => setSuccessToast(null), 4000);
      setScannedItem(null);
      setHasScannedBarcode(false);
      setErrorMessage(null);
      setMode('barcode');
    }
  };

  // Log food and keep scanner open for next item (multi-item)
  const handleLogAndAddAnother = () => {
    handleLogIntake(false);
  };

  // Start manual food entry
  const handleStartManualEntry = () => {
    setupLoadedItem({
      name: '',
      caloriesPer100g: 100,
      proteinPer100g: 10,
      carbsPer100g: 10,
      fatPer100g: 2,
      servingSizeGrams: 100,
      source: 'manual',
      hasNutritionData: true,
    });
    setCustomFoodName('');
    setEditBaseOpen(true);
  };

  // Live search handler for Open Food Facts
  const handleScannerSearchQuery = (text: string) => {
    setSearchQuery(text);
    if (searchTimer.current) clearTimeout(searchTimer.current);

    if (!text.trim()) {
      setSearchResults(LOCAL_STAPLES.slice(0, 15));
      setSearchLoading(false);
      return;
    }

    const lower = text.toLowerCase().trim();
    const localMatches = LOCAL_STAPLES.filter(s => s.name.toLowerCase().includes(lower));

    searchTimer.current = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const onlineMatches = await searchFoodOnline(lower);
        const combined = [
          ...localMatches,
          ...onlineMatches.filter(o => !localMatches.some(l => l.name.toLowerCase() === o.name.toLowerCase())),
        ];
        setSearchResults(combined);
      } catch (_) {
        setSearchResults(localMatches);
      } finally {
        setSearchLoading(false);
      }
    }, 450);
  };

  const handleClose = () => {
    setScannedItem(null);
    setHasScannedBarcode(false);
    setLoading(false);
    setErrorMessage(null);
    setMode('barcode');
    setSuccessToast(null);
    onClose();
  };

  const styles = makeStyles(C, isDark);

  // Dynamic calculated macros
  const currentCalc = scannedItem
    ? calculatePortionMacros(
        scannedItem,
        portionMode === 'servings' ? (parseFloat(servingInput) || 1) : (parseFloat(gramInput) || 30),
        portionMode
      )
    : null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={handleClose}
    >
      <View style={styles.container}>
        {/* Top Header Bar (matches app theme) */}
        <View style={styles.topHeader}>
          <TouchableOpacity onPress={handleClose} style={styles.iconCircleBtn}>
            <Ionicons name="close" size={22} color={C.text} />
          </TouchableOpacity>

          <View style={{ alignItems: 'center' }}>
            <Text style={styles.topHeaderTitle}>
              {mode === 'calculator' ? 'Portion & Macros' : 'Food Scanner'}
            </Text>
            {sessionLoggedCount > 0 && (
              <Text style={styles.sessionCounterSub}>
                {sessionLoggedCount} item{sessionLoggedCount > 1 ? 's' : ''} logged today
              </Text>
            )}
          </View>

          {sessionLoggedCount > 0 ? (
            <TouchableOpacity onPress={handleClose} style={styles.doneHeaderBtn}>
              <Ionicons name="checkmark" size={16} color="#0A0E1A" style={{ marginRight: 2 }} />
              <Text style={styles.doneHeaderBtnTxt}>Done</Text>
            </TouchableOpacity>
          ) : (mode === 'barcode' || mode === 'label') ? (
            <TouchableOpacity
              onPress={() => setTorch(prev => !prev)}
              style={[styles.iconCircleBtn, torch && styles.torchActive]}
            >
              <Ionicons
                name={torch ? 'flash' : 'flash-off'}
                size={18}
                color={torch ? '#FEF08A' : C.text}
              />
            </TouchableOpacity>
          ) : (
            <View style={{ width: 40 }} />
          )}
        </View>

        {/* Success Toast Banner */}
        {successToast && (
          <View style={styles.successToastBar}>
            <Ionicons name="checkmark-circle" size={16} color="#4ADE80" style={{ marginRight: 6 }} />
            <Text style={styles.successToastTxt}>{successToast}</Text>
          </View>
        )}

        {/* ── Search Food Mode (100% Free Open Internet Search) ── */}
        {mode === 'search' ? (
          <View style={{ flex: 1, backgroundColor: isDark ? '#080B12' : '#F8FAFC' }}>

            {/* Search Input Bar */}
            <View style={styles.searchBarBox}>
              <Ionicons name="search" size={18} color={C.muted} style={{ marginRight: 8 }} />
              <TextInput
                style={styles.searchBarInput}
                placeholder="Search any food off the internet..."
                placeholderTextColor={C.muted}
                value={searchQuery}
                onChangeText={handleScannerSearchQuery}
                autoFocus={true}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => handleScannerSearchQuery('')} style={{ padding: 4 }}>
                  <Ionicons name="close-circle" size={18} color={C.muted} />
                </TouchableOpacity>
              )}
            </View>

            {/* Search Results List */}
            <View style={{ flex: 1 }}>
              <View style={styles.searchHeaderRow}>
                <Text style={styles.searchHeaderTitle}>
                  {searchQuery.trim() ? 'Internet Food Results' : 'Common Staples'}
                </Text>
                {searchLoading && <ActivityIndicator size="small" color="#4ADE80" />}
              </View>

              <FlatList<ScannedFoodItem>
                data={searchResults.length > 0 ? searchResults : LOCAL_STAPLES}
                keyExtractor={(item: ScannedFoodItem, idx: number) => `${item.name}_${item.barcode || idx}`}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100 }}
                renderItem={({ item }: { item: ScannedFoodItem }) => {
                  const cal = item.caloriesPerServing ?? item.caloriesPer100g;
                  const prot = item.proteinPerServing ?? item.proteinPer100g;
                  const carbs = item.carbsPerServing ?? item.carbsPer100g ?? 0;
                  const fat = item.fatPerServing ?? item.fatPer100g ?? 0;
                  return (
                    <TouchableOpacity
                      style={styles.searchResultRow}
                      onPress={() => setupLoadedItem(item)}
                      activeOpacity={0.75}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.searchResultName} numberOfLines={1}>{item.name}</Text>
                        {item.brand && <Text style={styles.searchResultBrand} numberOfLines={1}>{item.brand}</Text>}
                        <View style={styles.searchResultPills}>
                          <View style={[styles.macroPillBadge, { backgroundColor: isDark ? '#2D1414' : '#FEE2E2' }]}>
                            <Ionicons name="flame" size={11} color={C.calories} style={{ marginRight: 3 }} />
                            <Text style={[styles.macroTagTxt, { color: C.calories }]}>{cal} kcal</Text>
                          </View>
                          <View style={[styles.macroPillBadge, { backgroundColor: isDark ? '#2D200A' : '#FEF3C7' }]}>
                            <Ionicons name="barbell-outline" size={11} color={C.protein} style={{ marginRight: 3 }} />
                            <Text style={[styles.macroTagTxt, { color: C.protein }]}>{prot}g P</Text>
                          </View>
                          <View style={[styles.macroPillBadge, { backgroundColor: isDark ? '#14253D' : '#E0F2FE' }]}>
                            <Ionicons name="leaf-outline" size={11} color="#0284C7" style={{ marginRight: 3 }} />
                            <Text style={[styles.macroTagTxt, { color: '#0284C7' }]}>{carbs}g C</Text>
                          </View>
                          <View style={[styles.macroPillBadge, { backgroundColor: isDark ? '#12261A' : '#DCFCE7' }]}>
                            <Ionicons name="water-outline" size={11} color="#16A34A" style={{ marginRight: 3 }} />
                            <Text style={[styles.macroTagTxt, { color: '#16A34A' }]}>{fat}g F</Text>
                          </View>
                        </View>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={C.muted} />
                    </TouchableOpacity>
                  );
                }}
                ListEmptyComponent={
                  !searchLoading ? (
                    <View style={styles.emptySearchBox}>
                      <Text style={styles.emptySearchTxt}>Type a food to search Open Food Facts open-web database.</Text>
                      <TouchableOpacity style={styles.manualFallbackBtn} onPress={handleStartManualEntry}>
                        <Ionicons name="create-outline" size={16} color="#4ADE80" style={{ marginRight: 6 }} />
                        <Text style={styles.manualFallbackTxt}>Or Enter Manually</Text>
                      </TouchableOpacity>
                    </View>
                  ) : null
                }
              />
            </View>
          </View>
        ) : mode !== 'calculator' ? (
          /* ── Camera View Mode (Barcode or Label) ── */
          <View style={styles.cameraWrapper}>
            {!permission ? (
              <View style={styles.permissionBox}>
                <ActivityIndicator size="large" color="#4ADE80" />
                <Text style={styles.permissionTxt}>Checking camera permissions...</Text>
              </View>
            ) : !permission.granted ? (
              <View style={styles.permissionBox}>
                <Ionicons name="camera-outline" size={54} color="#4ADE80" style={{ marginBottom: 14 }} />
                <Text style={styles.permissionTitle}>Camera Access Required</Text>
                <Text style={styles.permissionTxt}>
                  GainQuest needs camera access to scan product barcodes and nutrition labels.
                </Text>
                <TouchableOpacity style={styles.grantBtn} onPress={requestPermission}>
                  <Text style={styles.grantBtnTxt}>Enable Camera</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={StyleSheet.absoluteFill}>
                <CameraView
                  ref={cameraRef}
                  style={StyleSheet.absoluteFill}
                  facing="back"
                  enableTorch={torch}
                  barcodeScannerSettings={{
                    barcodeTypes: ['qr', 'ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39'],
                  }}
                  onBarcodeScanned={mode === 'barcode' ? handleBarcodeScanned : undefined}
                />

                {/* Viewfinder Overlays */}
                <View style={styles.reticleOverlay} pointerEvents="box-none">

                  {/* Target Aiming Box */}
                  <View style={[styles.targetBox, mode === 'label' && styles.targetBoxLabel]}>
                    <View style={[styles.corner, styles.cornerTL]} />
                    <View style={[styles.corner, styles.cornerTR]} />
                    <View style={[styles.corner, styles.cornerBL]} />
                    <View style={[styles.corner, styles.cornerBR]} />

                    {/* Animated Scanning Laser */}
                    <Animated.View
                      style={[
                        styles.laserLine,
                        {
                          transform: [
                            {
                              translateY: laserAnim.interpolate({
                                inputRange: [0, 1],
                                outputRange: [10, (mode === 'label' ? 320 : 180)],
                              }),
                            },
                          ],
                        },
                      ]}
                    />

                    {mode === 'barcode' && (
                      <View style={styles.targetHintBadge}>
                        <Text style={styles.targetHintTxt}>Align barcode in frame</Text>
                      </View>
                    )}
                  </View>

                  {/* Reticle Status Alerts */}
                  <View style={styles.bottomControls}>
                    {errorMessage && (
                      <View style={styles.errorAlert}>
                        <Ionicons name="alert-circle" size={18} color="#EF4444" style={{ marginRight: 6 }} />
                        <Text style={styles.errorAlertTxt}>{errorMessage}</Text>
                      </View>
                    )}

                    {loading && (
                      <View style={styles.loadingBanner}>
                        <ActivityIndicator size="small" color="#4ADE80" style={{ marginRight: 10 }} />
                        <Text style={styles.loadingBannerTxt}>{loadingMessage}</Text>
                      </View>
                    )}
                  </View>
                </View>
              </View>
            )}
          </View>
        ) : (
          /* ── Portion & Macro Calculator Screen ── */
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={{ flex: 1 }}
          >
            <ScrollView contentContainerStyle={styles.calcScroll} keyboardShouldPersistTaps="handled">
              {/* Scanned Badge & Source */}
              <View style={styles.scannedSourceRow}>
                <View style={styles.sourcePill}>
                  <Ionicons
                    name={scannedItem?.source === 'barcode' ? 'barcode' : 'sparkles'}
                    size={13}
                    color="#4ADE80"
                    style={{ marginRight: 4 }}
                  />
                  <Text style={styles.sourcePillTxt}>
                    {scannedItem?.source === 'barcode' ? 'Open Food Facts' : 'On-Device Scanner'}
                  </Text>
                </View>
                {scannedItem?.brand && (
                  <Text style={styles.brandTxt}>{scannedItem.brand}</Text>
                )}
              </View>

              {/* Editable Food Name */}
              <Text style={styles.calcSectionTitle}>Food Item</Text>
              <TextInput
                style={styles.foodNameInput}
                value={customFoodName}
                onChangeText={setCustomFoodName}
                placeholder="Product Name"
                placeholderTextColor={C.muted}
              />

              {/* Warning banner ONLY if product truly has no nutritional fields in database */}
              {scannedItem?.hasNutritionData === false && (
                <View style={styles.zeroWarningBanner}>
                  <Ionicons name="information-circle" size={20} color="#FBBF24" style={{ marginRight: 8 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.zeroWarningTitle}>Nutritional values missing in database</Text>
                    <Text style={styles.zeroWarningSub}>
                      Tap below to enter the package macros. They will be saved to your device!
                    </Text>
                  </View>
                </View>
              )}

              {/* Base Reference Box with Per 100g / Per Serving Toggle & Quick Edit */}
              <View style={styles.baseRefBox}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  {/* Mode Toggle: Per Serving vs Per 100g */}
                  <View style={styles.baseModePill}>
                    <TouchableOpacity
                      style={[styles.baseModeBtn, baseDisplayMode === 'serving' && styles.baseModeBtnActive]}
                      onPress={() => setBaseDisplayMode('serving')}
                    >
                      <Text style={[styles.baseModeTxt, baseDisplayMode === 'serving' && styles.baseModeTxtActive]}>
                        Per Serving ({Math.round(scannedItem?.servingSizeGrams || 30)}g)
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.baseModeBtn, baseDisplayMode === '100g' && styles.baseModeBtnActive]}
                      onPress={() => setBaseDisplayMode('100g')}
                    >
                      <Text style={[styles.baseModeTxt, baseDisplayMode === '100g' && styles.baseModeTxtActive]}>
                        Per 100g
                      </Text>
                    </TouchableOpacity>
                  </View>

                  <TouchableOpacity
                    style={styles.editBaseToggle}
                    onPress={() => setEditBaseOpen(prev => !prev)}
                  >
                    <Ionicons name={editBaseOpen ? 'checkmark' : 'pencil'} size={14} color="#4ADE80" style={{ marginRight: 4 }} />
                    <Text style={styles.editBaseToggleTxt}>{editBaseOpen ? 'Close Edit' : 'Edit Base'}</Text>
                  </TouchableOpacity>
                </View>

                {editBaseOpen ? (
                  <View style={styles.editBaseInputsWrap}>
                    <View style={{ flexDirection: 'row', gap: 10, marginBottom: 8 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.editFieldLabel}>Calories / 100g</Text>
                        <TextInput
                          style={styles.editFieldInput}
                          keyboardType="numeric"
                          value={baseCalsInput}
                          onChangeText={setBaseCalsInput}
                          placeholder="e.g. 350"
                          placeholderTextColor={C.muted}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.editFieldLabel}>Protein (g) / 100g</Text>
                        <TextInput
                          style={styles.editFieldInput}
                          keyboardType="numeric"
                          value={baseProtInput}
                          onChangeText={setBaseProtInput}
                          placeholder="e.g. 24"
                          placeholderTextColor={C.muted}
                        />
                      </View>
                    </View>

                    <View style={{ flexDirection: 'row', gap: 10, marginBottom: 8 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.editFieldLabel}>Carbs (g) / 100g</Text>
                        <TextInput
                          style={styles.editFieldInput}
                          keyboardType="numeric"
                          value={baseCarbsInput}
                          onChangeText={setBaseCarbsInput}
                          placeholder="e.g. 45"
                          placeholderTextColor={C.muted}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.editFieldLabel}>Fat (g) / 100g</Text>
                        <TextInput
                          style={styles.editFieldInput}
                          keyboardType="numeric"
                          value={baseFatInput}
                          onChangeText={setBaseFatInput}
                          placeholder="e.g. 8"
                          placeholderTextColor={C.muted}
                        />
                      </View>
                    </View>

                    <View style={{ marginBottom: 10 }}>
                      <Text style={styles.editFieldLabel}>1 Serving Size (Grams)</Text>
                      <TextInput
                        style={styles.editFieldInput}
                        keyboardType="numeric"
                        value={baseServingGramsInput}
                        onChangeText={setBaseServingGramsInput}
                        placeholder="e.g. 30"
                        placeholderTextColor={C.muted}
                      />
                    </View>

                    <TouchableOpacity style={styles.applyBaseBtn} onPress={handleApplyBaseValues}>
                      <Text style={styles.applyBaseBtnTxt}>Apply Base Values</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.baseRefGrid}>
                    <View style={styles.baseRefCol}>
                      <Text style={styles.baseRefVal}>
                        {baseDisplayMode === 'serving'
                          ? (scannedItem?.caloriesPerServing ?? Math.round(((scannedItem?.caloriesPer100g || 0) * (scannedItem?.servingSizeGrams || 30)) / 100))
                          : (scannedItem?.caloriesPer100g || 0)}
                      </Text>
                      <Text style={styles.baseRefLabel}>kcal</Text>
                    </View>
                    <View style={styles.baseRefCol}>
                      <Text style={[styles.baseRefVal, { color: C.protein }]}>
                        {baseDisplayMode === 'serving'
                          ? (scannedItem?.proteinPerServing ?? Number((((scannedItem?.proteinPer100g || 0) * (scannedItem?.servingSizeGrams || 30)) / 100).toFixed(1)))
                          : (scannedItem?.proteinPer100g || 0)}g
                      </Text>
                      <Text style={styles.baseRefLabel}>Protein</Text>
                    </View>
                    <View style={styles.baseRefCol}>
                      <Text style={[styles.baseRefVal, { color: '#FBBF24' }]}>
                        {baseDisplayMode === 'serving'
                          ? (scannedItem?.carbsPerServing ?? Number((((scannedItem?.carbsPer100g || 0) * (scannedItem?.servingSizeGrams || 30)) / 100).toFixed(1)))
                          : (scannedItem?.carbsPer100g || 0)}g
                      </Text>
                      <Text style={styles.baseRefLabel}>Carbs</Text>
                    </View>
                    <View style={styles.baseRefCol}>
                      <Text style={[styles.baseRefVal, { color: '#F472B6' }]}>
                        {baseDisplayMode === 'serving'
                          ? (scannedItem?.fatPerServing ?? Number((((scannedItem?.fatPer100g || 0) * (scannedItem?.servingSizeGrams || 30)) / 100).toFixed(1)))
                          : (scannedItem?.fatPer100g || 0)}g
                      </Text>
                      <Text style={styles.baseRefLabel}>Fat</Text>
                    </View>
                  </View>
                )}
              </View>

              {/* Mode Toggle: "By Grams" vs "Per Serving" */}
              <View style={styles.portionModeTabs}>
                <TouchableOpacity
                  style={[styles.portionModeTab, portionMode === 'grams' && styles.portionModeTabActive]}
                  onPress={() => setPortionMode('grams')}
                >
                  <Ionicons
                    name="scale-outline"
                    size={16}
                    color={portionMode === 'grams' ? '#0A0E1A' : C.text}
                    style={{ marginRight: 6 }}
                  />
                  <Text style={[styles.portionModeTabTxt, portionMode === 'grams' && styles.portionModeTabTxtActive]}>
                    By Grams (g)
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.portionModeTab, portionMode === 'servings' && styles.portionModeTabActive]}
                  onPress={() => setPortionMode('servings')}
                >
                  <Ionicons
                    name="nutrition-outline"
                    size={16}
                    color={portionMode === 'servings' ? '#0A0E1A' : C.text}
                    style={{ marginRight: 6 }}
                  />
                  <Text style={[styles.portionModeTabTxt, portionMode === 'servings' && styles.portionModeTabTxtActive]}>
                    Per Serving ({scannedItem?.servingSizeGrams ? `${Math.round(scannedItem.servingSizeGrams)}g` : '30g'})
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Dynamic Portion Input Card */}
              <View style={styles.portionInputCard}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={styles.portionCardTitle}>
                    {portionMode === 'grams' ? 'How many grams did you take?' : 'How many servings?'}
                  </Text>
                  <Text style={styles.unitBadge}>
                    {portionMode === 'grams' ? 'Grams (g)' : 'Servings'}
                  </Text>
                </View>

                {/* Big Reactive Input */}
                <View style={styles.bigGramInputRow}>
                  <TextInput
                    style={styles.bigGramInput}
                    keyboardType="numeric"
                    value={portionMode === 'grams' ? gramInput : servingInput}
                    onChangeText={portionMode === 'grams' ? setGramInput : setServingInput}
                    placeholder={portionMode === 'grams' ? '30' : '1'}
                    placeholderTextColor={C.muted}
                    selectTextOnFocus
                  />
                  <Text style={styles.bigGramUnit}>
                    {portionMode === 'grams' ? 'grams' : (parseFloat(servingInput) === 1 ? 'serving' : 'servings')}
                  </Text>
                </View>

                {/* Quick Selection Chips (30g, 45g, 60g, 100g, etc. / 0.5, 1, 1.5, 2 serv) */}
                <View style={styles.quickChipsRow}>
                  {portionMode === 'grams' ? (
                    ['30', '45', '60', '100', '150'].map(chip => (
                      <TouchableOpacity
                        key={chip}
                        style={[styles.chipBtn, gramInput === chip && styles.chipBtnActive]}
                        onPress={() => setGramInput(chip)}
                      >
                        <Text style={[styles.chipTxt, gramInput === chip && styles.chipTxtActive]}>
                          {chip}g
                        </Text>
                      </TouchableOpacity>
                    ))
                  ) : (
                    ['0.5', '1', '1.5', '2', '3'].map(chip => (
                      <TouchableOpacity
                        key={chip}
                        style={[styles.chipBtn, servingInput === chip && styles.chipBtnActive]}
                        onPress={() => setServingInput(chip)}
                      >
                        <Text style={[styles.chipTxt, servingInput === chip && styles.chipTxtActive]}>
                          {chip} {chip === '1' ? 'Serv' : 'Servs'}
                        </Text>
                      </TouchableOpacity>
                    ))
                  )}

                  {portionMode === 'grams' && scannedItem?.servingSizeGrams && (
                    <TouchableOpacity
                      style={[
                        styles.chipBtn,
                        gramInput === String(Math.round(scannedItem.servingSizeGrams)) && styles.chipBtnActive,
                      ]}
                      onPress={() => setGramInput(String(Math.round(scannedItem.servingSizeGrams!)))}
                    >
                      <Text
                        style={[
                          styles.chipTxt,
                          gramInput === String(Math.round(scannedItem.servingSizeGrams)) && styles.chipTxtActive,
                        ]}
                      >
                        1 Serv ({Math.round(scannedItem.servingSizeGrams)}g)
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {/* Calculated Macro Summary Card (All 4 Macros) */}
              <View style={styles.resultCard}>
                <Text style={styles.resultCardHeader}>
                  Calculated Intake ({portionMode === 'servings' ? `${currentCalc?.servingCount} Serv (${currentCalc?.grams}g)` : `${currentCalc?.grams}g`})
                </Text>
                <View style={styles.resultGrid}>
                  <View style={styles.resultGridItem}>
                    <Ionicons name="flame" size={20} color="#4ADE80" style={{ marginBottom: 2 }} />
                    <Text style={styles.resultVal}>{currentCalc?.calories || 0}</Text>
                    <Text style={styles.resultLabel}>Calories (kcal)</Text>
                  </View>
                  <View style={styles.resultGridItem}>
                    <Ionicons name="barbell-outline" size={20} color={C.protein} style={{ marginBottom: 2 }} />
                    <Text style={[styles.resultVal, { color: C.protein }]}>
                      {currentCalc?.protein || 0}g
                    </Text>
                    <Text style={styles.resultLabel}>Protein</Text>
                  </View>
                  <View style={styles.resultGridItem}>
                    <Ionicons name="leaf-outline" size={20} color="#FBBF24" style={{ marginBottom: 2 }} />
                    <Text style={[styles.resultVal, { color: '#FBBF24' }]}>
                      {currentCalc?.carbs || 0}g
                    </Text>
                    <Text style={styles.resultLabel}>Carbs</Text>
                  </View>
                  <View style={styles.resultGridItem}>
                    <Ionicons name="water-outline" size={20} color="#F472B6" style={{ marginBottom: 2 }} />
                    <Text style={[styles.resultVal, { color: '#F472B6' }]}>
                      {currentCalc?.fat || 0}g
                    </Text>
                    <Text style={styles.resultLabel}>Fat</Text>
                  </View>
                </View>
              </View>

              {/* Action Buttons: Log & Scan Next OR Log & Finish */}
              <TouchableOpacity
                style={styles.logIntakeBtn}
                onPress={() => handleLogIntake(false)}
              >
                <Ionicons name="add-circle" size={22} color="#0A0E1A" style={{ marginRight: 8 }} />
                <Text style={styles.logIntakeBtnTxt}>
                  Log {currentCalc?.calories || 0} kcal & Scan Next
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.logFinishBtn}
                onPress={() => handleLogIntake(true)}
              >
                <Ionicons name="checkmark-circle-outline" size={20} color="#4ADE80" style={{ marginRight: 8 }} />
                <Text style={styles.logFinishBtnTxt}>
                  Log & Finish
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.scanAgainBtn}
                onPress={() => {
                  setScannedItem(null);
                  setHasScannedBarcode(false);
                  setMode('barcode');
                }}
              >
                <Ionicons name="arrow-back-outline" size={16} color={C.muted} style={{ marginRight: 6 }} />
                <Text style={styles.scanAgainTxt}>Back to Scanner</Text>
              </TouchableOpacity>

              <View style={{ height: 40 }} />
            </ScrollView>
          </KeyboardAvoidingView>
        )}

        {/* Thumb-Zone Bottom Floating Dock (Mode Switcher & Direct Controls within reach) */}
        {mode !== 'calculator' && (
          <View style={styles.bottomDockContainer}>
            {/* Session logged banner if multi-item scanning */}
            {sessionLoggedCount > 0 && (
              <View style={styles.sessionPillBottom}>
                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 }}>
                  <Ionicons name="checkmark-done-circle" size={18} color="#4ADE80" style={{ marginRight: 6 }} />
                  <Text style={styles.sessionPillTxt} numberOfLines={1}>
                    {sessionLoggedCount} food{sessionLoggedCount > 1 ? 's' : ''} logged
                  </Text>
                </View>
                <TouchableOpacity onPress={handleClose} style={styles.sessionPillBtn}>
                  <Text style={styles.sessionPillBtnTxt}>Finish Logging</Text>
                  <Ionicons name="chevron-forward" size={13} color="#0A0E1A" style={{ marginLeft: 2 }} />
                </TouchableOpacity>
              </View>
            )}

            {/* Label Mode Thumb Actions: Gallery, Snap Photo, Torch */}
            {mode === 'label' && (
              <View style={styles.labelActionRow}>
                <TouchableOpacity style={styles.pickPhotoBtn} onPress={handlePickLabelImage} activeOpacity={0.75}>
                  <Ionicons name="images-outline" size={22} color={C.text} />
                  <Text style={styles.pickPhotoTxt}>Gallery</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.snapPhotoBtn} onPress={handleCaptureLabel} activeOpacity={0.85}>
                  <View style={styles.snapPhotoInner}>
                    <Ionicons name="scan" size={26} color="#0A0E1A" />
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.pickPhotoBtn, torch && styles.torchBtnActive]}
                  onPress={() => setTorch(prev => !prev)}
                  activeOpacity={0.75}
                >
                  <Ionicons
                    name={torch ? 'flash' : 'flash-off'}
                    size={22}
                    color={torch ? '#FEF08A' : C.text}
                  />
                  <Text style={[styles.pickPhotoTxt, torch && { color: '#FEF08A' }]}>
                    {torch ? 'Flash On' : 'Flash'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Barcode Mode Thumb Guidance & Quick Torch Toggle */}
            {mode === 'barcode' && (
              <View style={styles.barcodeActionRow}>
                <View style={styles.barcodeInstructionPill}>
                  <Ionicons name="barcode-outline" size={16} color="#4ADE80" style={{ marginRight: 8 }} />
                  <Text style={styles.barcodeInstructionTxt}>Align barcode in reticle to auto-scan</Text>
                </View>
                <TouchableOpacity
                  style={[styles.thumbTorchBtn, torch && styles.torchBtnActive]}
                  onPress={() => setTorch(prev => !prev)}
                  activeOpacity={0.75}
                >
                  <Ionicons
                    name={torch ? 'flash' : 'flash-off'}
                    size={16}
                    color={torch ? '#FEF08A' : C.text}
                  />
                  <Text style={[styles.thumbTorchBtnTxt, torch && { color: '#FEF08A' }]}>
                    {torch ? 'On' : 'Flash'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Unified 4-Segment Mode Selector Bar at Thumb Level */}
            <View style={styles.unifiedSegmentBar}>
              <TouchableOpacity
                style={[styles.segmentBtn, mode === 'barcode' && styles.segmentBtnActive]}
                onPress={() => {
                  setMode('barcode');
                  setHasScannedBarcode(false);
                  setErrorMessage(null);
                }}
              >
                <Ionicons
                  name="barcode-outline"
                  size={15}
                  color={mode === 'barcode' ? '#4ADE80' : C.muted}
                  style={{ marginRight: 5 }}
                />
                <Text style={[styles.segmentTxt, mode === 'barcode' && styles.segmentTxtActive]}>
                  Barcode
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.segmentBtn, mode === 'label' && styles.segmentBtnActive]}
                onPress={() => {
                  setMode('label');
                  setErrorMessage(null);
                }}
              >
                <Ionicons
                  name="document-text-outline"
                  size={15}
                  color={mode === 'label' ? '#4ADE80' : C.muted}
                  style={{ marginRight: 5 }}
                />
                <Text style={[styles.segmentTxt, mode === 'label' && styles.segmentTxtActive]}>
                  Label
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.segmentBtn, mode === 'search' && styles.segmentBtnActive]}
                onPress={() => {
                  setMode('search');
                  handleScannerSearchQuery(searchQuery);
                  setErrorMessage(null);
                }}
              >
                <Ionicons
                  name="search-outline"
                  size={15}
                  color={mode === 'search' ? '#4ADE80' : C.muted}
                  style={{ marginRight: 5 }}
                />
                <Text style={[styles.segmentTxt, mode === 'search' && styles.segmentTxtActive]}>
                  Search
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.segmentBtn}
                onPress={handleStartManualEntry}
              >
                <Ionicons
                  name="create-outline"
                  size={15}
                  color={C.muted}
                  style={{ marginRight: 5 }}
                />
                <Text style={styles.segmentTxt}>
                  Manual
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}

function makeStyles(C: any, isDark: boolean) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: isDark ? '#080B12' : '#F8FAFC',
    },
    topHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingTop: Platform.OS === 'ios' ? 50 : 20,
      paddingBottom: 12,
      backgroundColor: isDark ? '#0A0E1A' : '#FFFFFF',
      borderBottomWidth: 1,
      borderBottomColor: C.border,
      zIndex: 10,
    },
    topHeaderTitle: {
      fontSize: 18,
      fontWeight: '800',
      color: C.text,
      letterSpacing: -0.2,
    },
    sessionCounterSub: {
      fontSize: 11,
      fontWeight: '700',
      color: '#4ADE80',
      marginTop: 2,
    },
    iconCircleBtn: {
      width: 38,
      height: 38,
      borderRadius: 12,
      backgroundColor: isDark ? '#141B2D' : '#F1F5F9',
      borderWidth: 1,
      borderColor: C.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    doneHeaderBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#4ADE80',
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 7,
      shadowColor: '#4ADE80',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.3,
      shadowRadius: 4,
      elevation: 3,
    },
    doneHeaderBtnTxt: {
      fontSize: 13,
      fontWeight: '900',
      color: '#0A0E1A',
    },
    torchActive: {
      backgroundColor: '#FEF08A33',
      borderWidth: 1,
      borderColor: '#FEF08A',
    },

    // Inline Key Prompt
    keyPromptOverlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.85)',
      zIndex: 100,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    keyPromptCard: {
      backgroundColor: isDark ? '#0F172A' : '#FFFFFF',
      borderRadius: 20,
      padding: 20,
      width: '100%',
      borderWidth: 1,
      borderColor: '#4ADE8055',
    },
    keyIconBox: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: isDark ? '#112918' : '#DCFCE7',
      alignItems: 'center',
      justifyContent: 'center',
    },
    keyPromptTitle: {
      fontSize: 16,
      fontWeight: '800',
      color: C.text,
    },
    keyPromptSub: {
      fontSize: 12,
      color: C.muted,
      marginTop: 2,
    },
    keyPromptBody: {
      fontSize: 13,
      color: C.muted,
      lineHeight: 18,
      marginBottom: 14,
    },
    keyInput: {
      backgroundColor: isDark ? '#1E293B' : '#F1F5F9',
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 14,
      color: C.text,
      borderWidth: 1,
      borderColor: C.border,
      marginBottom: 16,
    },
    keyBtnRow: {
      flexDirection: 'row',
      gap: 10,
    },
    keySaveBtn: {
      flex: 1,
      backgroundColor: '#4ADE80',
      borderRadius: 12,
      paddingVertical: 12,
      alignItems: 'center',
    },
    keySaveBtnTxt: {
      fontSize: 14,
      fontWeight: '800',
      color: '#0A0E1A',
    },
    keyCancelBtn: {
      paddingHorizontal: 16,
      paddingVertical: 12,
      alignItems: 'center',
    },
    keyCancelBtnTxt: {
      fontSize: 14,
      fontWeight: '600',
      color: C.muted,
    },

    // Camera view styles
    cameraWrapper: {
      flex: 1,
      backgroundColor: '#000000',
      position: 'relative',
    },
    permissionBox: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 30,
      backgroundColor: '#0A0E1A',
    },
    permissionTitle: {
      fontSize: 20,
      fontWeight: '800',
      color: '#FFFFFF',
      marginBottom: 8,
      textAlign: 'center',
    },
    permissionTxt: {
      fontSize: 14,
      color: '#94A3B8',
      textAlign: 'center',
      lineHeight: 20,
      marginBottom: 24,
    },
    grantBtn: {
      backgroundColor: '#4ADE80',
      paddingHorizontal: 24,
      paddingVertical: 12,
      borderRadius: 14,
    },
    grantBtnTxt: {
      color: '#0A0E1A',
      fontWeight: '800',
      fontSize: 15,
    },

    // Viewfinder overlays
    reticleOverlay: {
      ...StyleSheet.absoluteFill,
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 20,
    },
    modeTabs: {
      flexDirection: 'row',
      backgroundColor: 'rgba(15, 23, 42, 0.75)',
      borderRadius: 24,
      padding: 4,
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.15)',
    },
    modeTab: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 20,
    },
    modeTabActive: {
      backgroundColor: '#4ADE80',
    },
    modeTabTxt: {
      fontSize: 13,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    modeTabTxtActive: {
      color: '#0A0E1A',
    },

    // Target box
    targetBox: {
      width: SW * 0.75,
      height: 200,
      position: 'relative',
      justifyContent: 'center',
      alignItems: 'center',
    },
    targetBoxLabel: {
      height: 340,
    },
    corner: {
      position: 'absolute',
      width: 26,
      height: 26,
      borderColor: '#4ADE80',
    },
    cornerTL: { top: 0, left: 0, borderTopWidth: 3.5, borderLeftWidth: 3.5, borderTopLeftRadius: 8 },
    cornerTR: { top: 0, right: 0, borderTopWidth: 3.5, borderRightWidth: 3.5, borderTopRightRadius: 8 },
    cornerBL: { bottom: 0, left: 0, borderBottomWidth: 3.5, borderLeftWidth: 3.5, borderBottomLeftRadius: 8 },
    cornerBR: { bottom: 0, right: 0, borderBottomWidth: 3.5, borderRightWidth: 3.5, borderBottomRightRadius: 8 },
    laserLine: {
      position: 'absolute',
      left: 10,
      right: 10,
      height: 2.5,
      backgroundColor: '#4ADE80',
      shadowColor: '#4ADE80',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 1,
      shadowRadius: 8,
      borderRadius: 2,
    },
    targetHintBadge: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 14,
      backgroundColor: 'rgba(0, 0, 0, 0.65)',
    },
    targetHintTxt: {
      fontSize: 12,
      color: '#FFFFFF',
      fontWeight: '600',
    },

    // Bottom controls
    bottomControls: {
      width: '100%',
      paddingHorizontal: 20,
      alignItems: 'center',
    },
    cameraInstructions: {
      color: 'rgba(255, 255, 255, 0.8)',
      fontSize: 13,
      fontWeight: '500',
      textAlign: 'center',
      backgroundColor: 'rgba(0, 0, 0, 0.6)',
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 16,
    },
    errorAlert: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: 'rgba(239, 68, 68, 0.2)',
      borderWidth: 1,
      borderColor: '#EF4444',
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 12,
      marginBottom: 14,
      width: '100%',
    },
    errorAlertTxt: {
      color: '#FCA5A5',
      fontSize: 12,
      fontWeight: '600',
      flex: 1,
    },
    loadingBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: 'rgba(15, 23, 42, 0.9)',
      paddingHorizontal: 20,
      paddingVertical: 12,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: '#4ADE80',
    },
    loadingBannerTxt: {
      color: '#FFFFFF',
      fontSize: 14,
      fontWeight: '700',
    },
    labelActionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-around',
      width: '100%',
      paddingHorizontal: 16,
      marginBottom: 12,
    },
    pickPhotoBtn: {
      alignItems: 'center',
      justifyContent: 'center',
      width: 62,
      height: 62,
      borderRadius: 31,
      backgroundColor: isDark ? '#151C2C' : '#F1F5F9',
      borderWidth: 1,
      borderColor: isDark ? '#1E293B' : '#CBD5E1',
    },
    pickPhotoTxt: {
      color: C.text,
      fontSize: 11,
      fontWeight: '700',
      marginTop: 2,
    },
    snapPhotoBtn: {
      width: 74,
      height: 74,
      borderRadius: 37,
      backgroundColor: 'rgba(74, 222, 128, 0.3)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    snapPhotoInner: {
      width: 58,
      height: 58,
      borderRadius: 29,
      backgroundColor: '#4ADE80',
      alignItems: 'center',
      justifyContent: 'center',
    },

    // ── Calculator Screen Styles ──
    calcScroll: {
      padding: 18,
    },
    scannedSourceRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    sourcePill: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
      backgroundColor: isDark ? '#112918' : '#DCFCE7',
      borderWidth: 1,
      borderColor: '#4ADE8044',
    },
    sourcePillTxt: {
      fontSize: 12,
      fontWeight: '800',
      color: '#4ADE80',
    },
    brandTxt: {
      fontSize: 13,
      color: C.muted,
      fontWeight: '600',
    },
    calcSectionTitle: {
      fontSize: 13,
      fontWeight: '800',
      color: C.muted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 6,
    },
    foodNameInput: {
      backgroundColor: C.card,
      borderRadius: 14,
      paddingHorizontal: 16,
      paddingVertical: 12,
      fontSize: 16,
      fontWeight: '700',
      color: C.text,
      borderWidth: 1,
      borderColor: C.border,
      marginBottom: 14,
    },

    // Zero Warning
    zeroWarningBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? '#2E1E05' : '#FEF3C7',
      borderRadius: 14,
      padding: 12,
      borderWidth: 1,
      borderColor: '#F59E0B',
      marginBottom: 14,
    },
    zeroWarningTitle: {
      fontSize: 13,
      fontWeight: '800',
      color: isDark ? '#FDE68A' : '#92400E',
    },
    zeroWarningSub: {
      fontSize: 11,
      color: isDark ? '#FCD34D' : '#B45309',
      marginTop: 2,
    },

    // Base Reference
    baseRefBox: {
      backgroundColor: C.card,
      borderRadius: 16,
      padding: 14,
      borderWidth: 1,
      borderColor: C.border,
      marginBottom: 14,
    },
    baseRefHeader: {
      fontSize: 13,
      fontWeight: '700',
      color: C.muted,
    },
    editBaseToggle: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? '#112918' : '#DCFCE7',
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 10,
    },
    editBaseToggleTxt: {
      fontSize: 12,
      fontWeight: '800',
      color: '#4ADE80',
    },
    editBaseInputsWrap: {
      paddingTop: 8,
    },
    editFieldLabel: {
      fontSize: 11,
      fontWeight: '700',
      color: C.muted,
      marginBottom: 4,
    },
    editFieldInput: {
      backgroundColor: isDark ? '#151C2C' : '#E2E8F0',
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 8,
      fontSize: 14,
      fontWeight: '700',
      color: C.text,
      borderWidth: 1,
      borderColor: C.border,
    },
    applyBaseBtn: {
      backgroundColor: '#4ADE80',
      borderRadius: 10,
      paddingVertical: 10,
      alignItems: 'center',
      marginTop: 4,
    },
    applyBaseBtnTxt: {
      fontSize: 13,
      fontWeight: '800',
      color: '#0A0E1A',
    },
    baseRefGrid: {
      flexDirection: 'row',
      justifyContent: 'space-around',
    },
    baseRefCol: {
      alignItems: 'center',
    },
    baseRefVal: {
      fontSize: 16,
      fontWeight: '900',
      color: C.text,
    },
    baseRefLabel: {
      fontSize: 11,
      color: C.muted,
      marginTop: 2,
    },

    // Portion Mode Tabs (Grams vs Servings)
    portionModeTabs: {
      flexDirection: 'row',
      backgroundColor: isDark ? '#151C2C' : '#E2E8F0',
      borderRadius: 14,
      padding: 4,
      marginBottom: 14,
    },
    portionModeTab: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 10,
      borderRadius: 10,
    },
    portionModeTabActive: {
      backgroundColor: '#4ADE80',
    },
    portionModeTabTxt: {
      fontSize: 13,
      fontWeight: '700',
      color: C.text,
    },
    portionModeTabTxtActive: {
      color: '#0A0E1A',
      fontWeight: '800',
    },

    // Portion Input Card
    portionInputCard: {
      backgroundColor: C.card,
      borderRadius: 18,
      padding: 16,
      borderWidth: 1,
      borderColor: C.border,
      marginBottom: 16,
    },
    portionCardTitle: {
      fontSize: 15,
      fontWeight: '800',
      color: C.text,
    },
    unitBadge: {
      fontSize: 12,
      fontWeight: '700',
      color: '#4ADE80',
      backgroundColor: isDark ? '#112918' : '#DCFCE7',
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 8,
    },
    bigGramInputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      marginVertical: 12,
    },
    bigGramInput: {
      fontSize: 38,
      fontWeight: '900',
      color: '#4ADE80',
      textAlign: 'center',
      minWidth: 100,
      borderBottomWidth: 2,
      borderBottomColor: '#4ADE80',
      paddingBottom: 2,
    },
    bigGramUnit: {
      fontSize: 18,
      fontWeight: '800',
      color: C.muted,
      marginLeft: 8,
      alignSelf: 'flex-end',
      paddingBottom: 6,
    },
    quickChipsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      justifyContent: 'center',
      marginTop: 6,
    },
    chipBtn: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 12,
      backgroundColor: isDark ? '#151C2C' : '#E2E8F0',
      borderWidth: 1,
      borderColor: C.border,
    },
    chipBtnActive: {
      backgroundColor: '#4ADE80',
      borderColor: '#4ADE80',
    },
    chipTxt: {
      fontSize: 13,
      fontWeight: '700',
      color: C.text,
    },
    chipTxtActive: {
      color: '#0A0E1A',
    },

    // Calculated Result Card
    resultCard: {
      backgroundColor: isDark ? '#0E1726' : '#EFF6FF',
      borderRadius: 18,
      padding: 16,
      borderWidth: 1.5,
      borderColor: isDark ? '#1E293B' : '#BFDBFE',
      marginBottom: 20,
    },
    resultCardHeader: {
      fontSize: 12,
      fontWeight: '800',
      color: C.muted,
      textTransform: 'uppercase',
      textAlign: 'center',
      marginBottom: 14,
    },
    baseModePill: {
      flexDirection: 'row',
      backgroundColor: isDark ? '#151C2C' : '#E2E8F0',
      borderRadius: 10,
      padding: 2,
    },
    baseModeBtn: {
      paddingHorizontal: 8,
      paddingVertical: 5,
      borderRadius: 8,
    },
    baseModeBtnActive: {
      backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
    },
    baseModeTxt: {
      fontSize: 11,
      fontWeight: '600',
      color: C.muted,
    },
    baseModeTxtActive: {
      color: C.text,
      fontWeight: '800',
    },
    resultGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      rowGap: 8,
      columnGap: 8,
    },
    resultGridItem: {
      width: '48%',
      backgroundColor: isDark ? '#151C2C' : '#FFFFFF',
      borderRadius: 14,
      paddingVertical: 12,
      paddingHorizontal: 10,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: isDark ? '#1E293B' : '#E2E8F0',
    },
    resultRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-around',
    },
    resultItem: {
      alignItems: 'center',
      flex: 1,
    },
    resultDivider: {
      width: 1,
      height: 48,
      backgroundColor: isDark ? '#1E293B' : '#BFDBFE',
    },
    resultVal: {
      fontSize: 20,
      fontWeight: '900',
      color: '#4ADE80',
    },
    resultLabel: {
      fontSize: 11,
      fontWeight: '600',
      color: C.muted,
      marginTop: 2,
    },

    // Bottom Action Buttons
    logIntakeBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#4ADE80',
      borderRadius: 16,
      paddingVertical: 16,
      shadowColor: '#4ADE80',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 10,
      elevation: 4,
      marginBottom: 12,
    },
    logIntakeBtnTxt: {
      fontSize: 16,
      fontWeight: '900',
      color: '#0A0E1A',
    },
    scanAgainBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 12,
    },
    scanAgainTxt: {
      fontSize: 14,
      fontWeight: '700',
      color: C.muted,
    },
    addAnotherBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#2563EB',
      borderRadius: 16,
      paddingVertical: 15,
      shadowColor: '#2563EB',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 4,
      marginBottom: 8,
    },
    addAnotherBtnTxt: {
      fontSize: 15,
      fontWeight: '800',
      color: '#FFFFFF',
    },
    successToastBar: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? '#112918' : '#DCFCE7',
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: '#4ADE8055',
    },
    successToastTxt: {
      fontSize: 13,
      fontWeight: '700',
      color: '#4ADE80',
    },
    logFinishBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? '#112918' : '#DCFCE7',
      borderRadius: 16,
      paddingVertical: 14,
      borderWidth: 1,
      borderColor: '#4ADE8066',
      marginBottom: 8,
    },
    logFinishBtnTxt: {
      fontSize: 15,
      fontWeight: '800',
      color: '#4ADE80',
    },
    bottomDockContainer: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: isDark ? 'rgba(11, 15, 25, 0.94)' : 'rgba(255, 255, 255, 0.96)',
      borderTopWidth: 1,
      borderTopColor: isDark ? '#1E293B' : '#E2E8F0',
      paddingTop: 10,
      paddingBottom: Platform.OS === 'ios' ? 28 : 14,
      paddingHorizontal: 16,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: -6 },
      shadowOpacity: 0.3,
      shadowRadius: 10,
      elevation: 20,
      zIndex: 50,
    },
    unifiedSegmentBar: {
      flexDirection: 'row',
      backgroundColor: isDark ? '#151C2C' : '#E2E8F0',
      borderRadius: 14,
      padding: 4,
      borderWidth: 1,
      borderColor: isDark ? '#1E293B' : '#CBD5E1',
    },
    segmentBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 10,
      borderRadius: 10,
    },
    segmentBtnActive: {
      backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
      borderWidth: 1,
      borderColor: isDark ? '#334155' : '#CBD5E1',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.15,
      shadowRadius: 3,
      elevation: 2,
    },
    segmentTxt: {
      fontSize: 12,
      fontWeight: '700',
      color: C.muted,
    },
    segmentTxtActive: {
      color: '#4ADE80',
      fontWeight: '800',
    },
    barcodeActionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 10,
    },
    barcodeInstructionPill: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? '#151C2C' : '#F1F5F9',
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: isDark ? '#1E293B' : '#E2E8F0',
      flex: 1,
      marginRight: 10,
    },
    barcodeInstructionTxt: {
      fontSize: 12,
      fontWeight: '600',
      color: C.text,
      flex: 1,
    },
    thumbTorchBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 12,
      backgroundColor: isDark ? '#151C2C' : '#F1F5F9',
      borderWidth: 1,
      borderColor: isDark ? '#1E293B' : '#E2E8F0',
    },
    thumbTorchBtnTxt: {
      fontSize: 12,
      fontWeight: '700',
      color: C.text,
      marginLeft: 4,
    },
    torchBtnActive: {
      backgroundColor: 'rgba(254, 240, 138, 0.2)',
      borderColor: '#FEF08A',
    },
    sessionPillBottom: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: isDark ? '#112F18' : '#DCFCE7',
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 8,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: '#4ADE8055',
    },
    sessionPillTxt: {
      fontSize: 13,
      fontWeight: '800',
      color: '#4ADE80',
    },
    sessionPillBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#4ADE80',
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 8,
    },
    sessionPillBtnTxt: {
      fontSize: 12,
      fontWeight: '900',
      color: '#0A0E1A',
    },
    macroPillBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 7,
    },
    macroTagTxt: {
      fontSize: 12,
      fontWeight: '700',
    },
    searchBarBox: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? '#151C2C' : '#FFFFFF',
      marginHorizontal: 16,
      marginBottom: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: C.border,
    },
    searchBarInput: {
      flex: 1,
      fontSize: 14,
      color: C.text,
      paddingVertical: 2,
    },
    searchHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 6,
    },
    searchHeaderTitle: {
      fontSize: 11,
      fontWeight: '800',
      color: C.muted,
      textTransform: 'uppercase',
    },
    searchResultRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? '#0F172A' : '#FFFFFF',
      padding: 14,
      borderRadius: 14,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: C.border,
    },
    searchResultName: {
      fontSize: 15,
      fontWeight: '700',
      color: C.text,
      marginBottom: 2,
    },
    searchResultBrand: {
      fontSize: 12,
      color: C.muted,
      marginBottom: 6,
    },
    searchResultPills: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
    },
    macroTag: {
      fontSize: 12,
      fontWeight: '700',
      backgroundColor: isDark ? '#1A2333' : '#F1F5F9',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
    },
    emptySearchBox: {
      alignItems: 'center',
      paddingVertical: 40,
      paddingHorizontal: 20,
    },
    emptySearchTxt: {
      fontSize: 13,
      color: C.muted,
      textAlign: 'center',
      marginBottom: 14,
    },
    manualFallbackBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? '#112918' : '#DCFCE7',
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: '#4ADE8055',
    },
    manualFallbackTxt: {
      fontSize: 13,
      fontWeight: '800',
      color: '#4ADE80',
    },
  });
}
