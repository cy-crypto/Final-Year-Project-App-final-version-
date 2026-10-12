import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import DateTimePicker from '@react-native-community/datetimepicker';

import {
  getTransactions,
  deleteTransaction,
  getSummary,
  getSettings,
  TransactionDto,
  TransactionType,
  SummaryRow,
  BudgetSettingsDto,
} from '../services/budgetService';
import { toApiErrorMessage } from '../services/api';
import { Colors } from '../constants/theme';
import type { RootStackParamList } from '../navigation/types';
import { BudgetSummaryChart } from '../components/BudgetSummaryChart';

type BudgetScreenNavigationProp = NativeStackNavigationProp<RootStackParamList>;

type TypeFilter = 'all' | TransactionType;

function todayString() {
  return new Date().toISOString().split('T')[0];
}

function currentMonthRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { from: from.toISOString().split('T')[0], to: to.toISOString().split('T')[0] };
}

export function BudgetScreen() {
  const navigation = useNavigation<BudgetScreenNavigationProp>();

  const [transactions, setTransactions] = useState<TransactionDto[]>([]);
  const [summary, setSummary] = useState<SummaryRow[]>([]);
  const [settings, setSettings] = useState<BudgetSettingsDto | null>(null);
  const [monthlyExpenseTotal, setMonthlyExpenseTotal] = useState(0);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [searchText, setSearchText] = useState('');
  const [dateFrom, setDateFrom] = useState<string | null>(null);
  const [dateTo, setDateTo] = useState<string | null>(null);
  const [pickerTarget, setPickerTarget] = useState<'from' | 'to' | null>(null);

  const fetchTransactions = useCallback(async () => {
    try {
      const data = await getTransactions({
        type: typeFilter === 'all' ? undefined : typeFilter,
        category: categoryFilter.trim() || undefined,
        dateFrom: dateFrom ?? undefined,
        dateTo: dateTo ?? undefined,
        search: searchText.trim() || undefined,
      });
      setTransactions(data);
      setError(null);
    } catch (err) {
      setError(toApiErrorMessage(err, 'Failed to load transactions'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [typeFilter, categoryFilter, dateFrom, dateTo, searchText]);

  const fetchSummary = useCallback(async () => {
    try {
      setSummary(await getSummary());
    } catch (err) {
      // non-critical — chart just stays empty
    }
  }, []);

  const fetchSettings = useCallback(async () => {
    try {
      setSettings(await getSettings());
    } catch (err) {
      // non-critical — progress indicator just stays hidden
    }
  }, []);

  const fetchMonthlyExpenseTotal = useCallback(async () => {
    try {
      const { from, to } = currentMonthRange();
      const monthTxns = await getTransactions({ type: 'expense', dateFrom: from, dateTo: to });
      setMonthlyExpenseTotal(monthTxns.reduce((sum, t) => sum + Number(t.amount), 0));
    } catch (err) {
      // non-critical
    }
  }, []);

  const fetchAll = useCallback(async () => {
    await Promise.all([fetchTransactions(), fetchSummary(), fetchSettings(), fetchMonthlyExpenseTotal()]);
  }, [fetchTransactions, fetchSummary, fetchSettings, fetchMonthlyExpenseTotal]);

  useEffect(() => {
    setLoading(true);
    fetchTransactions();
  }, [fetchTransactions]);

  useEffect(() => {
    fetchSummary();
    fetchSettings();
    fetchMonthlyExpenseTotal();
  }, []);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fetchAll();
    });
    return unsubscribe;
  }, [navigation, fetchAll]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchAll();
  };

  const totalIncome = transactions.filter((t) => t.type === 'income').reduce((sum, t) => sum + Number(t.amount), 0);
  const totalExpense = transactions.filter((t) => t.type === 'expense').reduce((sum, t) => sum + Number(t.amount), 0);
  const netBalance = totalIncome - totalExpense;

  const monthlyLimit = settings?.monthlyLimit ? Number(settings.monthlyLimit) : null;
  const currency = settings?.currency ?? 'PKR';
  const monthlyProgressPct = monthlyLimit ? Math.min((monthlyExpenseTotal / monthlyLimit) * 100, 100) : 0;

  const handleAdd = () => navigation.navigate('AddTransaction');
  const handleEdit = (transaction: TransactionDto) => navigation.navigate('AddTransaction', { transaction });
  const handleSettings = () => navigation.navigate('BudgetSettings');

  const handleDelete = (transaction: TransactionDto) => {
    Alert.alert(
      'Delete Transaction',
      `Delete this ${transaction.type} of ${currency} ${transaction.amount}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteTransaction(transaction.id);
              await fetchAll();
            } catch (err) {
              Alert.alert('Error', toApiErrorMessage(err, 'Failed to delete transaction'));
            }
          },
        },
      ]
    );
  };

  const handlePickerChange = (event: any, selectedDate?: Date) => {
    const target = pickerTarget;
    setPickerTarget(null);
    if (event.type === 'set' && selectedDate && target) {
      const value = selectedDate.toISOString().split('T')[0];
      if (target === 'from') setDateFrom(value);
      else setDateTo(value);
    }
  };

  const renderTransaction = ({ item }: { item: TransactionDto }) => {
    const isIncome = item.type === 'income';
    return (
      <Pressable onPress={() => handleEdit(item)}>
        <View style={styles.txnCard}>
          <View style={styles.txnRow}>
            <View style={styles.txnInfo}>
              <Text style={[styles.txnAmount, { color: isIncome ? Colors.success : Colors.error }]}>
                {isIncome ? '+' : '-'}{currency} {item.amount}
              </Text>
              <Text style={styles.txnMeta}>{item.category || 'Uncategorized'} • {item.date}</Text>
              {item.description ? <Text style={styles.txnDescription} numberOfLines={2}>{item.description}</Text> : null}
            </View>
            <Pressable style={styles.deleteButton} onPress={() => handleDelete(item)}>
              <Text style={styles.deleteButtonText}>🗑️</Text>
            </Pressable>
          </View>
        </View>
      </Pressable>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading budget...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Budget</Text>
          <Text style={styles.subtitle}>Track your income and expenses.</Text>
        </View>
        <Pressable style={styles.settingsButton} onPress={handleSettings}>
          <Text style={styles.settingsButtonText}>⚙️</Text>
        </Pressable>
      </View>

      <FlatList
        data={transactions}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>💸</Text>
            <Text style={styles.emptyText}>{error ? error : 'No transactions match your filters.'}</Text>
          </View>
        }
        ListHeaderComponent={
          <View>
            <View style={styles.summaryCard}>
              <View style={styles.summaryRow}>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryLabel}>Income</Text>
                  <Text style={[styles.summaryValue, { color: Colors.success }]}>{currency} {totalIncome.toFixed(2)}</Text>
                </View>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryLabel}>Expenses</Text>
                  <Text style={[styles.summaryValue, { color: Colors.error }]}>{currency} {totalExpense.toFixed(2)}</Text>
                </View>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryLabel}>Net</Text>
                  <Text style={[styles.summaryValue, { color: netBalance >= 0 ? Colors.success : Colors.error }]}>
                    {currency} {netBalance.toFixed(2)}
                  </Text>
                </View>
              </View>

              {monthlyLimit ? (
                <View style={styles.limitSection}>
                  <Text style={styles.limitText}>
                    {currency} {monthlyExpenseTotal.toFixed(0)} / {monthlyLimit.toFixed(0)} this month
                  </Text>
                  <View style={styles.progressBar}>
                    <View
                      style={[
                        styles.progressFill,
                        {
                          width: `${monthlyProgressPct}%`,
                          backgroundColor: monthlyProgressPct >= 100 ? Colors.error : Colors.primary,
                        },
                      ]}
                    />
                  </View>
                </View>
              ) : null}
            </View>

            <BudgetSummaryChart summary={summary} />

            <View style={styles.filtersCard}>
              <TextInput
                style={styles.searchInput}
                placeholder="Search description or category..."
                placeholderTextColor="#9CA3AF"
                value={searchText}
                onChangeText={setSearchText}
              />

              <View style={styles.typeFilterRow}>
                {(['all', 'income', 'expense'] as const).map((option) => (
                  <Pressable
                    key={option}
                    style={[styles.typeFilterButton, typeFilter === option && styles.typeFilterButtonActive]}
                    onPress={() => setTypeFilter(option)}
                  >
                    <Text style={[styles.typeFilterText, typeFilter === option && styles.typeFilterTextActive]}>
                      {option === 'all' ? 'All' : option === 'income' ? 'Income' : 'Expense'}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <TextInput
                style={styles.categoryInput}
                placeholder="Filter by category..."
                placeholderTextColor="#9CA3AF"
                value={categoryFilter}
                onChangeText={setCategoryFilter}
              />

              <View style={styles.dateFilterRow}>
                <Pressable style={styles.dateFilterButton} onPress={() => setPickerTarget('from')}>
                  <Text style={styles.dateFilterText}>{dateFrom ?? 'From date'}</Text>
                </Pressable>
                <Pressable style={styles.dateFilterButton} onPress={() => setPickerTarget('to')}>
                  <Text style={styles.dateFilterText}>{dateTo ?? 'To date'}</Text>
                </Pressable>
                {(dateFrom || dateTo) && (
                  <Pressable
                    style={styles.clearDatesButton}
                    onPress={() => {
                      setDateFrom(null);
                      setDateTo(null);
                    }}
                  >
                    <Text style={styles.clearDatesText}>✕</Text>
                  </Pressable>
                )}
              </View>
            </View>

            {pickerTarget && (
              <DateTimePicker
                value={new Date((pickerTarget === 'from' ? dateFrom : dateTo) ?? todayString())}
                mode="date"
                display={Platform.OS === 'ios' ? 'inline' : 'default'}
                onChange={handlePickerChange}
              />
            )}

            <Text style={styles.sectionTitle}>Transactions</Text>
          </View>
        }
        renderItem={renderTransaction}
      />

      <Pressable style={styles.fab} onPress={handleAdd}>
        <Text style={styles.fabText}>+</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bgLight,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: Colors.textSecondary,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: Colors.primary,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  settingsButton: {
    padding: 8,
  },
  settingsButtonText: {
    fontSize: 22,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  summaryCard: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    padding: 14,
    marginTop: 8,
    marginBottom: 16,
    gap: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  summaryItem: {
    alignItems: 'center',
    flex: 1,
  },
  summaryLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: '700',
  },
  limitSection: {
    gap: 6,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
    paddingTop: 10,
  },
  limitText: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  progressBar: {
    height: 8,
    backgroundColor: Colors.borderLight,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  filtersCard: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    padding: 12,
    marginBottom: 16,
    gap: 10,
  },
  searchInput: {
    height: 42,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderRadius: 8,
    backgroundColor: Colors.white,
    paddingHorizontal: 12,
    fontSize: 14,
    color: Colors.textPrimary,
  },
  typeFilterRow: {
    flexDirection: 'row',
    gap: 8,
  },
  typeFilterButton: {
    flex: 1,
    height: 36,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderRadius: 8,
    backgroundColor: Colors.white,
    justifyContent: 'center',
    alignItems: 'center',
  },
  typeFilterButtonActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  typeFilterText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  typeFilterTextActive: {
    color: Colors.white,
  },
  categoryInput: {
    height: 38,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderRadius: 8,
    backgroundColor: Colors.white,
    paddingHorizontal: 12,
    fontSize: 13,
    color: Colors.textPrimary,
  },
  dateFilterRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  dateFilterButton: {
    flex: 1,
    height: 36,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderRadius: 8,
    backgroundColor: Colors.white,
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  dateFilterText: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  clearDatesButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.borderLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  clearDatesText: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 8,
  },
  txnCard: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    padding: 12,
  },
  txnRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  txnInfo: {
    flex: 1,
    gap: 4,
  },
  txnAmount: {
    fontSize: 16,
    fontWeight: '700',
  },
  txnMeta: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  txnDescription: {
    fontSize: 12,
    color: Colors.textHint,
  },
  deleteButton: {
    padding: 4,
  },
  deleteButtonText: {
    fontSize: 16,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  fabText: {
    color: Colors.white,
    fontSize: 28,
    fontWeight: '700',
    lineHeight: 30,
  },
});
