import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Colors, Font, Radius, Shadows } from '../constants/theme';
import {
  CategoryBudgetDto,
  createCategoryBudget,
  deleteCategoryBudget,
  updateCategoryBudget,
} from '../services/budgetService';
import { toApiErrorMessage } from '../services/api';
import { DEFAULT_CATEGORIES } from '../utils/budgetFormat';

type Props = {
  visible: boolean;
  currency: string;
  /** Budget being edited, or null to add a new one. */
  editing: CategoryBudgetDto | null;
  /** Categories that already have a budget (hidden from the picker when adding). */
  takenCategories: string[];
  onClose: () => void;
  onSaved: () => void;
};

export function CategoryBudgetModal({ visible, currency, editing, takenCategories, onClose, onSaved }: Props) {
  const [category, setCategory] = useState('');
  const [limit, setLimit] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setCategory(editing?.category ?? '');
    setLimit(editing ? String(editing.monthlyLimit) : '');
    setError(null);
  }, [visible, editing]);

  const taken = new Set(takenCategories.map((c) => c.toLowerCase()));
  const suggestions = DEFAULT_CATEGORIES.filter((c) => !taken.has(c.toLowerCase()));

  const handleSave = async () => {
    const name = category.trim();
    const amount = Number(limit.trim());
    if (!name) {
      setError('Pick or type a category.');
      return;
    }
    if (!limit.trim() || Number.isNaN(amount) || amount <= 0) {
      setError('Limit must be greater than 0.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      if (editing) {
        await updateCategoryBudget(editing.id, { category: name, monthlyLimit: String(amount) });
      } else {
        await createCategoryBudget({ category: name, monthlyLimit: String(amount) });
      }
      onSaved();
    } catch (err) {
      setError(toApiErrorMessage(err, 'Failed to save budget'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    if (!editing) return;
    Alert.alert('Remove budget', `Stop tracking a limit for ${editing.category}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteCategoryBudget(editing.id);
            onSaved();
          } catch (err) {
            setError(toApiErrorMessage(err, 'Failed to remove budget'));
          }
        },
      },
    ]);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title}>{editing ? 'Edit budget' : 'New category budget'}</Text>

          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Text style={styles.label}>Category</Text>
            <View style={styles.chips}>
              {suggestions.map((c) => (
                <Pressable
                  key={c}
                  style={[styles.chip, category.toLowerCase() === c.toLowerCase() && styles.chipActive]}
                  onPress={() => setCategory(c)}
                >
                  <Text style={[styles.chipText, category.toLowerCase() === c.toLowerCase() && styles.chipTextActive]}>
                    {c}
                  </Text>
                </Pressable>
              ))}
            </View>
            <TextInput
              style={styles.input}
              placeholder="Or type your own category"
              placeholderTextColor={Colors.textHint}
              value={category}
              onChangeText={setCategory}
            />

            <Text style={[styles.label, { marginTop: 16 }]}>Monthly limit ({currency})</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 15000"
              placeholderTextColor={Colors.textHint}
              keyboardType="decimal-pad"
              value={limit}
              onChangeText={setLimit}
            />

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Pressable style={[styles.save, saving && { opacity: 0.7 }]} onPress={handleSave} disabled={saving}>
              {saving ? (
                <ActivityIndicator color={Colors.white} />
              ) : (
                <Text style={styles.saveText}>{editing ? 'Save changes' : 'Set budget'}</Text>
              )}
            </Pressable>

            {editing ? (
              <Pressable style={styles.remove} onPress={handleDelete}>
                <Text style={styles.removeText}>Remove this budget</Text>
              </Pressable>
            ) : null}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: Colors.surfaceLight,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 20,
    paddingBottom: 28,
    maxHeight: '85%',
  },
  handle: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: Colors.borderLight, marginBottom: 14 },
  title: { fontFamily: Font.extrabold, fontSize: 22, color: Colors.textPrimary, marginBottom: 16 },
  label: { fontFamily: Font.bold, fontSize: 15, color: Colors.textSecondary, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  chip: {
    paddingHorizontal: 14,
    height: 38,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { fontFamily: Font.semibold, fontSize: 14, color: Colors.textSecondary },
  chipTextActive: { color: Colors.white },
  input: {
    height: 52,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderRadius: Radius.md,
    backgroundColor: Colors.bgLight,
    paddingHorizontal: 14,
    fontFamily: Font.medium,
    fontSize: 16,
    color: Colors.textPrimary,
  },
  error: { fontFamily: Font.semibold, fontSize: 14, color: Colors.error, marginTop: 12 },
  save: {
    height: 54,
    borderRadius: Radius.md,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    ...Shadows.button,
  },
  saveText: { fontFamily: Font.bold, fontSize: 17, color: Colors.white },
  remove: { height: 48, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  removeText: { fontFamily: Font.bold, fontSize: 15, color: Colors.error },
});
