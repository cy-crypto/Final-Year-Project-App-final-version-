import React from 'react';
import { Dimensions, StyleSheet, Text, View } from 'react-native';
import { BarChart } from 'react-native-chart-kit';

import { Colors } from '../constants/theme';
import type { SummaryRow } from '../services/budgetService';

type Props = {
  summary: SummaryRow[];
};

const screenWidth = Dimensions.get('window').width;

export function BudgetSummaryChart({ summary }: Props) {
  const expenseRows = summary.filter((row) => row.type === 'expense' && row.totalAmount > 0);

  if (expenseRows.length === 0) {
    return (
      <View style={styles.emptyCard}>
        <Text style={styles.emptyText}>No spending data yet — add a transaction to see the breakdown.</Text>
      </View>
    );
  }

  const labels = expenseRows.map((row) => {
    const label = row.category?.trim() || 'Other';
    return label.length > 8 ? `${label.slice(0, 7)}…` : label;
  });
  const data = expenseRows.map((row) => row.totalAmount);

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Spending by Category</Text>
      <BarChart
        data={{ labels, datasets: [{ data }] }}
        width={screenWidth - 64}
        height={200}
        fromZero
        yAxisLabel=""
        yAxisSuffix=""
        chartConfig={{
          backgroundGradientFrom: Colors.surfaceLight,
          backgroundGradientTo: Colors.surfaceLight,
          decimalPlaces: 0,
          color: (opacity = 1) => `rgba(29, 158, 117, ${opacity})`,
          labelColor: (opacity = 1) => `rgba(74, 124, 89, ${opacity})`,
          barPercentage: 0.6,
        }}
        style={styles.chart}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    padding: 12,
    marginHorizontal: 16,
    marginBottom: 16,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 8,
  },
  chart: {
    borderRadius: 8,
  },
  emptyCard: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    padding: 20,
    marginHorizontal: 16,
    marginBottom: 16,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
});
