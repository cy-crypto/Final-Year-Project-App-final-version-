import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { Colors, Font, Radius, Shadows } from '../constants/theme';
import {
  getSettings,
  getSubscriptions,
  paySubscription,
  SubscriptionDto,
} from '../services/budgetService';
import { toApiErrorMessage } from '../services/api';
import { notifyBudgetAlert, syncSubscriptionReminders } from '../services/notificationService';
import type { RootStackParamList } from '../navigation/types';
import { SubscriptionFormModal } from '../components/SubscriptionFormModal';
import { categoryIcon, formatDateLong, formatMoney } from '../utils/budgetFormat';
import { advanceDueDate, dueInfo, FREQUENCY_LABEL, monthlyEquivalent } from '../utils/subscriptions';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const DUE_COLORS = {
  overdue: { fg: Colors.error, bg: Colors.tintRose },
  today: { fg: Colors.primary, bg: Colors.primarySurface },
  soon: { fg: Colors.primary, bg: Colors.primarySurface },
  later: { fg: Colors.textSecondary, bg: Colors.tintSlate },
} as const;

export function SubscriptionsScreen() {
  const navigation = useNavigation<Nav>();

  const [subs, setSubs] = useState<SubscriptionDto[]>([]);
  const [currency, setCurrency] = useState('PKR');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payingId, setPayingId] = useState<string | null>(null);

  const [formVisible, setFormVisible] = useState(false);
  const [editing, setEditing] = useState<SubscriptionDto | null>(null);

  const load = useCallback(async () => {
    try {
      const [list, settings] = await Promise.all([getSubscriptions(), getSettings().catch(() => null)]);
      const cur = settings?.currency ?? 'PKR';
      setSubs(list);
      setCurrency(cur);
      setError(null);
      // Keep the "due tomorrow" notifications in step with whatever is on screen.
      syncSubscriptionReminders(list, cur);
    } catch (err) {
      setError(toApiErrorMessage(err, 'Failed to load subscriptions'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => navigation.addListener('focus', load), [navigation, load]);

  const active = useMemo(
    () => subs.filter((s) => s.isActive).sort((a, b) => (a.nextDueDate < b.nextDueDate ? -1 : 1)),
    [subs]
  );
  const paused = useMemo(() => subs.filter((s) => !s.isActive), [subs]);
  const monthlyTotal = active.reduce((sum, s) => sum + monthlyEquivalent(s.amount, s.frequency), 0);
  const nextUp = active[0];

  const openAdd = () => {
    setEditing(null);
    setFormVisible(true);
  };

  const openEdit = (s: SubscriptionDto) => {
    setEditing(s);
    setFormVisible(true);
  };

  const handlePay = (s: SubscriptionDto) => {
    const next = formatDateLong(advanceDueDate(s.nextDueDate, s.frequency));
    Alert.alert(
      'Mark as paid',
      `Log ${currency} ${formatMoney(s.amount)} for ${s.name} as an expense? Next due date moves to ${next}.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Mark paid',
          onPress: async () => {
            setPayingId(s.id);
            try {
              const { budgetAlert } = await paySubscription(s.id);
              await load();
              if (budgetAlert) {
                const exceeded = budgetAlert.level === 'exceeded';
                const title = exceeded
                  ? `${budgetAlert.category} budget exceeded`
                  : `${budgetAlert.category} budget almost used`;
                const body = `You have used ${budgetAlert.percent}% of your ${budgetAlert.category} budget this month.`;
                notifyBudgetAlert(title, body);
                Alert.alert(title, body);
              }
            } catch (err) {
              Alert.alert('Error', toApiErrorMessage(err, 'Failed to mark as paid'));
            } finally {
              setPayingId(null);
            }
          },
        },
      ]
    );
  };

  const renderCard = (s: SubscriptionDto) => {
    const info = dueInfo(s.nextDueDate);
    const colors = s.isActive ? DUE_COLORS[info.status] : DUE_COLORS.later;
    return (
      <Pressable key={s.id} style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]} onPress={() => openEdit(s)}>
        <View style={styles.cardTop}>
          <View style={styles.icon}>
            <Ionicons name={categoryIcon(s.category ?? s.name, 'expense')} size={22} color={Colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.name} numberOfLines={1}>{s.name}</Text>
            <Text style={styles.meta} numberOfLines={1}>
              {FREQUENCY_LABEL[s.frequency]}
              {s.category ? ` · ${s.category}` : ''}
            </Text>
          </View>
          <Text style={styles.amount}>{currency} {formatMoney(s.amount)}</Text>
        </View>

        <View style={styles.cardBottom}>
          <View style={[styles.duePill, { backgroundColor: colors.bg }]}>
            <Ionicons name={s.isActive ? 'time-outline' : 'pause-circle-outline'} size={15} color={colors.fg} />
            <Text style={[styles.dueText, { color: colors.fg }]}>
              {s.isActive ? info.text : 'Paused'} · {formatDateLong(s.nextDueDate)}
            </Text>
          </View>
          {s.isActive ? (
            <Pressable
              style={[styles.payBtn, payingId === s.id && { opacity: 0.6 }]}
              onPress={() => handlePay(s)}
              disabled={payingId === s.id}
              hitSlop={6}
            >
              {payingId === s.id ? (
                <ActivityIndicator size="small" color={Colors.white} />
              ) : (
                <Text style={styles.payText}>Mark paid</Text>
              )}
            </Pressable>
          ) : null}
        </View>
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <Pressable style={styles.backBtn} onPress={() => navigation.goBack()} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
        </Pressable>
        <Text style={styles.title}>Subscriptions</Text>
        <View style={styles.backBtn} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load();
              }}
              tintColor={Colors.primary}
            />
          }
        >
          <View style={styles.hero}>
            <Text style={styles.heroLabel}>Monthly cost</Text>
            <Text style={styles.heroValue}>{currency} {formatMoney(monthlyTotal)}</Text>
            <Text style={styles.heroNote}>
              {active.length} active subscription{active.length === 1 ? '' : 's'}
              {nextUp ? ` · next: ${nextUp.name} ${dueInfo(nextUp.nextDueDate).text.toLowerCase()}` : ''}
            </Text>
          </View>

          <View style={styles.reminder}>
            <Ionicons name="notifications" size={18} color={Colors.primary} />
            <Text style={styles.reminderText}>You are reminded one day before each due date.</Text>
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          {active.length === 0 && paused.length === 0 ? (
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <Ionicons name="repeat" size={34} color={Colors.primary} />
              </View>
              <Text style={styles.emptyTitle}>No subscriptions yet</Text>
              <Text style={styles.emptyText}>
                Add rent, Netflix, your gym or any bill that repeats. We will remind you the day before and log it as an
                expense when you pay.
              </Text>
            </View>
          ) : null}

          {active.length > 0 && (
            <>
              <Text style={styles.section}>Upcoming</Text>
              {active.map(renderCard)}
            </>
          )}

          {paused.length > 0 && (
            <>
              <Text style={styles.section}>Paused</Text>
              {paused.map(renderCard)}
            </>
          )}
        </ScrollView>
      )}

      <Pressable style={styles.fab} onPress={openAdd}>
        <Ionicons name="add" size={32} color={Colors.white} />
      </Pressable>

      <SubscriptionFormModal
        visible={formVisible}
        currency={currency}
        editing={editing}
        onClose={() => setFormVisible(false)}
        onSaved={() => {
          setFormVisible(false);
          load();
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgLight },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 8 },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: Font.extrabold, fontSize: 22, color: Colors.textPrimary },
  content: { paddingHorizontal: 16, paddingBottom: 120, gap: 12 },

  hero: { backgroundColor: Colors.primary, borderRadius: Radius.xl, padding: 16, gap: 4, ...Shadows.button },
  heroLabel: { fontFamily: Font.semibold, fontSize: 14, color: 'rgba(255,255,255,0.9)' },
  heroValue: { fontFamily: Font.extrabold, fontSize: 30, color: Colors.white, letterSpacing: -0.6 },
  heroNote: { fontFamily: Font.medium, fontSize: 13, color: 'rgba(255,255,255,0.92)' },
  reminder: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.primarySurface,
    borderRadius: Radius.md,
    padding: 12,
  },
  reminderText: { flex: 1, fontFamily: Font.semibold, fontSize: 13, color: Colors.textPrimary },
  error: { fontFamily: Font.semibold, fontSize: 14, color: Colors.error },
  section: { fontFamily: Font.extrabold, fontSize: 17, color: Colors.textPrimary, marginTop: 6 },

  card: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.borderSoft,
    padding: 12,
    gap: 12,
    ...Shadows.card,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { width: 44, height: 44, borderRadius: 14, backgroundColor: Colors.primarySurface, alignItems: 'center', justifyContent: 'center' },
  name: { fontFamily: Font.bold, fontSize: 16, color: Colors.textPrimary },
  meta: { fontFamily: Font.medium, fontSize: 13, color: Colors.textSecondary },
  amount: { fontFamily: Font.extrabold, fontSize: 15, color: Colors.textPrimary },
  cardBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  duePill: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, height: 34, borderRadius: Radius.pill },
  dueText: { flexShrink: 1, fontFamily: Font.bold, fontSize: 12 },
  payBtn: { height: 34, paddingHorizontal: 14, borderRadius: Radius.pill, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center', minWidth: 92 },
  payText: { fontFamily: Font.bold, fontSize: 13, color: Colors.white },

  empty: {
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.surfaceLight,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.borderSoft,
    padding: 28,
    ...Shadows.card,
  },
  emptyIcon: { width: 64, height: 64, borderRadius: 22, backgroundColor: Colors.primarySurface, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontFamily: Font.extrabold, fontSize: 18, color: Colors.textPrimary },
  emptyText: { fontFamily: Font.medium, fontSize: 14, lineHeight: 21, color: Colors.textSecondary, textAlign: 'center' },

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
