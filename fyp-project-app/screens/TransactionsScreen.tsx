import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';

import {
  deleteTransaction,
  getSettings,
  getSummary,
  getTransactions,
  TransactionDto,
  TransactionType,
} from '../services/budgetService';
import { toApiErrorMessage } from '../services/api';
import { Colors, Font, Radius, Shadows } from '../constants/theme';
import type { RootStackParamList } from '../navigation/types';
import { TransactionRow } from '../components/TransactionRow';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { dayLabel, formatMoney, toDateStr } from '../utils/budgetFormat';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type TypeFilter = 'all' | TransactionType;

const TYPE_OPTIONS: { key: TypeFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'income', label: 'Income' },
  { key: 'expense', label: 'Expense' },
];

export function TransactionsScreen() {
  const navigation = useNavigation<Nav>();

  const [transactions, setTransactions] = useState<TransactionDto[]>([]);
  const [currency, setCurrency] = useState('PKR');
  const [categories, setCategories] = useState<string[]>([]);

  const [initialLoading, setInitialLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [searchInput, setSearchInput] = useState('');
  const search = useDebouncedValue(searchInput.trim(), 450);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [category, setCategory] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState<string | null>(null);
  const [dateTo, setDateTo] = useState<string | null>(null);
  const [pickerTarget, setPickerTarget] = useState<'from' | 'to' | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Only the latest request is allowed to update state, so a slow earlier
  // response can never overwrite newer results.
  const requestId = useRef(0);

  useEffect(() => {
    const id = ++requestId.current;
    setFetching(true);
    getTransactions({
      type: typeFilter === 'all' ? undefined : typeFilter,
      category: category ?? undefined,
      dateFrom: dateFrom ?? undefined,
      dateTo: dateTo ?? undefined,
      search: search || undefined,
    })
      .then((data) => {
        if (id !== requestId.current) return;
        setTransactions(data);
        setError(null);
      })
      .catch((err) => {
        if (id !== requestId.current) return;
        setError(toApiErrorMessage(err, 'Failed to load transactions'));
      })
      .finally(() => {
        if (id !== requestId.current) return;
        setFetching(false);
        setInitialLoading(false);
        setRefreshing(false);
      });
  }, [typeFilter, category, dateFrom, dateTo, search, reloadKey]);

  // Currency + category chips only need loading when the screen opens or regains focus.
  const loadMeta = useCallback(async () => {
    try {
      const [settings, summary] = await Promise.all([getSettings(), getSummary()]);
      setCurrency(settings.currency || 'PKR');
      const names = summary.map((r) => r.category?.trim()).filter((c): c is string => !!c);
      setCategories(Array.from(new Set(names)).sort());
    } catch {
      // non-critical — filters just stay minimal
    }
  }, []);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      loadMeta();
      setReloadKey((k) => k + 1);
    });
    return unsubscribe;
  }, [navigation, loadMeta]);

  const sections = useMemo(() => {
    const byDay = new Map<string, TransactionDto[]>();
    transactions.forEach((t) => {
      const list = byDay.get(t.date) ?? [];
      list.push(t);
      byDay.set(t.date, list);
    });
    return Array.from(byDay.entries())
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([date, data]) => ({ title: dayLabel(date), date, data }));
  }, [transactions]);

  const hasFilters = !!(searchInput || typeFilter !== 'all' || category || dateFrom || dateTo);

  const clearFilters = () => {
    setSearchInput('');
    setTypeFilter('all');
    setCategory(null);
    setDateFrom(null);
    setDateTo(null);
  };

  const handleDelete = (t: TransactionDto) => {
    Alert.alert('Delete transaction', `Delete this ${t.type} of ${currency} ${formatMoney(Number(t.amount))}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteTransaction(t.id);
            setReloadKey((k) => k + 1);
            loadMeta();
          } catch (err) {
            Alert.alert('Error', toApiErrorMessage(err, 'Failed to delete transaction'));
          }
        },
      },
    ]);
  };

  const handlePickerChange = (event: any, selected?: Date) => {
    const target = pickerTarget;
    setPickerTarget(null);
    if (event.type === 'set' && selected && target) {
      const value = toDateStr(selected);
      if (target === 'from') setDateFrom(value);
      else setDateTo(value);
    }
  };

  const header = (
    <View style={styles.filters}>
      <View style={styles.searchBox}>
        <Ionicons name="search" size={20} color={Colors.textHint} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search transactions"
          placeholderTextColor={Colors.textHint}
          value={searchInput}
          onChangeText={setSearchInput}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
        />
        {fetching ? (
          <ActivityIndicator size="small" color={Colors.primary} />
        ) : searchInput ? (
          <Pressable onPress={() => setSearchInput('')} hitSlop={10}>
            <Ionicons name="close-circle" size={20} color={Colors.textHint} />
          </Pressable>
        ) : null}
      </View>

      <View style={styles.chipRow}>
        {TYPE_OPTIONS.map((o) => (
          <Pressable
            key={o.key}
            style={[styles.chip, typeFilter === o.key && styles.chipActive]}
            onPress={() => setTypeFilter(o.key)}
          >
            <Text style={[styles.chipText, typeFilter === o.key && styles.chipTextActive]}>{o.label}</Text>
          </Pressable>
        ))}
      </View>

      {categories.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          <Pressable style={[styles.chip, !category && styles.chipActive]} onPress={() => setCategory(null)}>
            <Text style={[styles.chipText, !category && styles.chipTextActive]}>All categories</Text>
          </Pressable>
          {categories.map((c) => (
            <Pressable
              key={c}
              style={[styles.chip, category === c && styles.chipActive]}
              onPress={() => setCategory(category === c ? null : c)}
            >
              <Text style={[styles.chipText, category === c && styles.chipTextActive]}>{c}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      <View style={styles.chipRow}>
        <Pressable style={[styles.dateBtn, dateFrom && styles.dateBtnActive]} onPress={() => setPickerTarget('from')}>
          <Ionicons name="calendar-outline" size={16} color={dateFrom ? Colors.primary : Colors.textSecondary} />
          <Text style={[styles.dateText, dateFrom && { color: Colors.primary }]}>{dateFrom ?? 'From'}</Text>
        </Pressable>
        <Pressable style={[styles.dateBtn, dateTo && styles.dateBtnActive]} onPress={() => setPickerTarget('to')}>
          <Ionicons name="calendar-outline" size={16} color={dateTo ? Colors.primary : Colors.textSecondary} />
          <Text style={[styles.dateText, dateTo && { color: Colors.primary }]}>{dateTo ?? 'To'}</Text>
        </Pressable>
        {hasFilters && (
          <Pressable onPress={clearFilters} hitSlop={8}>
            <Text style={styles.clear}>Clear all</Text>
          </Pressable>
        )}
      </View>

      {pickerTarget && (
        <DateTimePicker
          value={new Date((pickerTarget === 'from' ? dateFrom : dateTo) ?? toDateStr(new Date()))}
          mode="date"
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          onChange={handlePickerChange}
        />
      )}

      <Text style={styles.count}>
        {transactions.length} transaction{transactions.length === 1 ? '' : 's'}
        {transactions.length > 0 ? ' · long-press one to delete' : ''}
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <Pressable style={styles.backBtn} onPress={() => navigation.goBack()} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
        </Pressable>
        <Text style={styles.title}>Transactions</Text>
        <View style={styles.backBtn} />
      </View>

      {initialLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        // The list (and its search box) stays mounted while results reload.
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          stickySectionHeadersEnabled={false}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                setReloadKey((k) => k + 1);
              }}
              tintColor={Colors.primary}
            />
          }
          ListHeaderComponent={header}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          SectionSeparatorComponent={() => <View style={{ height: 4 }} />}
          renderSectionHeader={({ section }) => <Text style={styles.sectionTitle}>{section.title}</Text>}
          renderItem={({ item }) => (
            <TransactionRow
              item={item}
              currency={currency}
              onPress={() => navigation.navigate('AddTransaction', { transaction: item })}
              onDelete={() => handleDelete(item)}
            />
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="receipt-outline" size={48} color={Colors.textHint} />
              <Text style={styles.emptyText}>
                {error ?? (hasFilters ? 'No transactions match your filters.' : 'No transactions yet.')}
              </Text>
            </View>
          }
        />
      )}

      <Pressable style={styles.fab} onPress={() => navigation.navigate('AddTransaction')}>
        <Ionicons name="add" size={32} color={Colors.white} />
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgLight },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 8 },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: Font.extrabold, fontSize: 22, color: Colors.textPrimary },
  listContent: { paddingHorizontal: 16, paddingBottom: 110 },

  filters: { gap: 12, marginBottom: 8 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 52,
    paddingHorizontal: 14,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    backgroundColor: Colors.surfaceLight,
  },
  searchInput: { flex: 1, fontFamily: Font.medium, fontSize: 16, color: Colors.textPrimary, padding: 0 },
  chipRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chip: {
    paddingHorizontal: 16,
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
  dateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    height: 38,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    backgroundColor: Colors.surfaceLight,
  },
  dateBtnActive: { borderColor: Colors.primary, backgroundColor: Colors.primarySurface },
  dateText: { fontFamily: Font.semibold, fontSize: 14, color: Colors.textSecondary },
  clear: { fontFamily: Font.bold, fontSize: 14, color: Colors.primary, marginLeft: 4 },
  count: { fontFamily: Font.medium, fontSize: 13, color: Colors.textSecondary },

  sectionTitle: { fontFamily: Font.extrabold, fontSize: 16, color: Colors.textPrimary, marginTop: 14, marginBottom: 8 },
  empty: { alignItems: 'center', gap: 12, paddingVertical: 48 },
  emptyText: { fontFamily: Font.medium, fontSize: 16, color: Colors.textSecondary, textAlign: 'center', paddingHorizontal: 24 },
  fab: {
    position: 'absolute',
    right: 24,
    bottom: 28,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.button,
  },
});
