import React, { useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Print from 'expo-print';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Ionicons } from '@expo/vector-icons';

import { Colors, Font, Radius, Shadows } from '../constants/theme';
import { useAuth } from '../context/AuthContext';
import {
  getCategoryBudgets,
  getGoals,
  getSettings,
  getSubscriptions,
  getTransactions,
} from '../services/budgetService';
import { toApiErrorMessage } from '../services/api';
import { buildReportHtml, periodRange, REPORT_PERIODS, ReportPeriod } from '../utils/budgetReport';

type Props = {
  visible: boolean;
  onClose: () => void;
};

export function ReportModal({ visible, onClose }: Props) {
  const { user } = useAuth();
  const [period, setPeriod] = useState<ReportPeriod>('thisMonth');
  const [busy, setBusy] = useState(false);

  const range = periodRange(period);

  const handleExport = async () => {
    setBusy(true);
    // Tracks which step is running so a failure can say what actually went wrong.
    let stage: 'data' | 'pdf' | 'share' = 'data';
    try {
      const [transactions, settings, budgets, goals, subscriptions] = await Promise.all([
        getTransactions({ dateFrom: range.from, dateTo: range.to }),
        getSettings().catch(() => null),
        getCategoryBudgets().catch(() => []),
        getGoals().catch(() => []),
        getSubscriptions().catch(() => []),
      ]);

      const html = buildReportHtml({
        periodLabel: range.label,
        singleMonth: period === 'thisMonth' || period === 'lastMonth',
        currency: settings?.currency ?? 'PKR',
        preparedFor: user?.fullName || undefined,
        transactions,
        budgets,
        goals,
        subscriptions,
      });

      stage = 'pdf';
      // Ask for the PDF's bytes too: in Expo Go the file expo-print writes can't be read back
      // (sandbox permissions), so we write our own copy inside the app's allowed cache folder.
      const printed = await Print.printToFileAsync({ html, base64: true });

      let shareUri = printed.uri;
      if (printed.base64) {
        try {
          const target = new File(Paths.cache, `Budget-Report-${range.label.replace(/[^A-Za-z0-9]+/g, '-')}.pdf`);
          target.create({ overwrite: true });
          target.write(printed.base64, { encoding: 'base64' });
          shareUri = target.uri;
        } catch (writeError) {
          console.warn('Could not write report to app cache, using original file', writeError);
        }
      }
      const uri = shareUri;

      stage = 'share';
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert('Report ready', `The PDF was saved to:\n${uri}`);
        return;
      }
      await Sharing.shareAsync(shareUri, {
        mimeType: 'application/pdf',
        UTI: 'com.adobe.pdf',
        dialogTitle: `Budget report — ${range.label}`,
      });
      onClose();
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      console.warn(`Report export failed while ${stage}:`, err);
      if (stage === 'data') {
        Alert.alert('Could not load your data', toApiErrorMessage(err, 'Check your connection and try again.'));
      } else if (stage === 'pdf') {
        Alert.alert('Could not create the PDF', `${detail}

If this mentions a native module, the app needs to be rebuilt.`);
      } else {
        Alert.alert('PDF created, but sharing failed', detail);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={busy ? undefined : onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={busy ? undefined : onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.titleRow}>
            <View style={styles.titleIcon}>
              <Ionicons name="document-text" size={22} color={Colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Export report</Text>
              <Text style={styles.subtitle}>A PDF you can save, print or share.</Text>
            </View>
          </View>

          <Text style={styles.label}>Period</Text>
          <View style={styles.chips}>
            {REPORT_PERIODS.map((p) => (
              <Pressable
                key={p.key}
                style={[styles.chip, period === p.key && styles.chipActive]}
                onPress={() => setPeriod(p.key)}
                disabled={busy}
              >
                <Text style={[styles.chipText, period === p.key && styles.chipTextActive]}>{p.label}</Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.includes}>
            <Text style={styles.includesTitle}>{range.label} includes</Text>
            {[
              'Income, expenses, net and savings rate',
              'Spending by category with a chart',
              'Category budgets, goals and subscriptions',
              'Every transaction in the period',
            ].map((line) => (
              <View key={line} style={styles.includeRow}>
                <Ionicons name="checkmark-circle" size={18} color={Colors.success} />
                <Text style={styles.includeText}>{line}</Text>
              </View>
            ))}
          </View>

          <Pressable style={[styles.export, busy && { opacity: 0.75 }]} onPress={handleExport} disabled={busy}>
            {busy ? (
              <>
                <ActivityIndicator color={Colors.white} />
                <Text style={styles.exportText}>Creating PDF…</Text>
              </>
            ) : (
              <>
                <Ionicons name="download-outline" size={22} color={Colors.white} />
                <Text style={styles.exportText}>Export PDF</Text>
              </>
            )}
          </Pressable>
          <Pressable style={styles.cancel} onPress={onClose} disabled={busy}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </View>
      </View>
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
  },
  handle: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: Colors.borderLight, marginBottom: 14 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 },
  titleIcon: { width: 46, height: 46, borderRadius: 15, backgroundColor: Colors.primarySurface, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: Font.extrabold, fontSize: 21, color: Colors.textPrimary },
  subtitle: { fontFamily: Font.medium, fontSize: 14, color: Colors.textSecondary },
  label: { fontFamily: Font.bold, fontSize: 15, color: Colors.textSecondary, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 16,
    height: 40,
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
  includes: { backgroundColor: Colors.primarySurface, borderRadius: Radius.md, padding: 14, gap: 8, marginTop: 18 },
  includesTitle: { fontFamily: Font.extrabold, fontSize: 14, color: Colors.textPrimary },
  includeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  includeText: { flex: 1, fontFamily: Font.medium, fontSize: 13, color: Colors.textPrimary },
  export: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    height: 54,
    borderRadius: Radius.md,
    backgroundColor: Colors.primary,
    marginTop: 20,
    ...Shadows.button,
  },
  exportText: { fontFamily: Font.bold, fontSize: 17, color: Colors.white },
  cancel: { height: 46, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  cancelText: { fontFamily: Font.bold, fontSize: 15, color: Colors.textSecondary },
});
