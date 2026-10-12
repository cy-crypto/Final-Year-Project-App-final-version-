import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Dimensions, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors } from '../constants/theme';
import { useAppContext } from '../context/AppContext';

const { width, height } = Dimensions.get('window');

type ReportPeriod = 'daily' | 'weekly' | 'monthly';

type ReportData = {
  summary: {
    total: number;
    completed: number;
    pending: number;
    in_progress: number;
  };
  by_priority: Record<string, { label: string; total: number; completed: number; color: string }>;
  by_category: Record<string, { label: string; total: number; completed: number; color: string }>;
  chart_data: {
    labels: string[];
    completed: number[];
    created: number[];
  };
};

export function ReportsScreen() {
  const { getTaskReport } = useAppContext();
  const [loading, setLoading] = useState(false);
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [reportPeriod, setReportPeriod] = useState<ReportPeriod>('weekly');

  const fetchReportData = async () => {
    setLoading(true);
    try {
      const data = await getTaskReport(reportPeriod);
      setReportData(data);
    } catch (error) {
      console.error('Failed to fetch report data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReportData();
  }, [reportPeriod]);

  const renderSummaryCards = () => {
    if (!reportData) return null;

    const { summary } = reportData;
    const completionRate = summary.total > 0 
      ? Math.round((summary.completed / summary.total) * 100) 
      : 0;

    return (
      <View style={styles.summaryCards}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Total Tasks</Text>
          <Text style={styles.summaryValue}>{summary.total}</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Completed</Text>
          <Text style={styles.summaryValue}>{summary.completed}</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Completion Rate</Text>
          <Text style={styles.summaryValue}>{completionRate}%</Text>
        </View>
      </View>
    );
  };

  const renderChart = () => {
    if (!reportData?.chart_data) {
      return (
        <View style={styles.chartContainer}>
          <Text style={styles.chartPlaceholder}>No chart data available</Text>
        </View>
      );
    }

    return (
      <View style={styles.chartContainer}>
        <Text style={styles.chartPlaceholder}>Chart component would go here</Text>
        <View style={styles.chartLegend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: Colors.success }]} />
            <Text style={styles.legendText}>Completed</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: Colors.primary }]} />
            <Text style={styles.legendText}>Created</Text>
          </View>
        </View>
      </View>
    );
  };

  const renderProgressRows = (data: Record<string, any>, title: string) => {
    return (
      <View style={styles.progressSection}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {Object.entries(data).map(([key, item]) => {
          const percentage = item.total > 0 ? Math.round((item.completed / item.total) * 100) : 0;
          return (
            <View key={key} style={styles.progressRow}>
              <View style={styles.progressLabelContainer}>
                <Text style={styles.progressLabel}>{item.label}</Text>
              </View>
              <View style={styles.progressContainer}>
                <View style={styles.progressBar}>
                  <View 
                    style={[
                      styles.progressFill, 
                      { 
                        width: `${percentage}%`,
                        backgroundColor: item.color || Colors.primary 
                      }
                    ]} 
                  />
                </View>
                <Text style={styles.progressText}>{percentage}%</Text>
              </View>
            </View>
          );
        })}
      </View>
    );
  };

  if (loading && !reportData) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading reports...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => {/* Handle back navigation */}}>
          <Text style={styles.backButton}>←</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Reports</Text>
        <Pressable onPress={fetchReportData}>
          <Text style={styles.refreshButton}>↻</Text>
        </Pressable>
      </View>

      {/* Period Toggle */}
      <View style={styles.periodToggle}>
        {(['daily', 'weekly', 'monthly'] as ReportPeriod[]).map(period => (
          <Pressable
            key={period}
            style={[
              styles.periodToggleItem,
              reportPeriod === period && styles.periodToggleItemActive
            ]}
            onPress={() => setReportPeriod(period)}
          >
            <Text style={[
              styles.periodToggleText,
              reportPeriod === period && styles.periodToggleTextActive
            ]}>
              {period.charAt(0).toUpperCase() + period.slice(1)}
            </Text>
          </Pressable>
        ))}
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Summary Cards */}
        {renderSummaryCards()}

        {/* Chart */}
        <View style={styles.chartSection}>
          <Text style={styles.sectionTitle}>Completion trend</Text>
          {renderChart()}
        </View>

        {/* Priority Breakdown */}
        {reportData?.by_priority && renderProgressRows(reportData.by_priority, 'By priority')}
        
        {/* Category Breakdown */}
        {reportData?.by_category && renderProgressRows(reportData.by_category, 'By category')}
        
        {/* Insights */}
        {reportData && (
          <View style={styles.insightsSection}>
            <Text style={styles.sectionTitle}>Key Insights</Text>
            <View style={styles.insightCard}>
              <Text style={styles.insightText}>
                📊 Completion Rate: {reportData.summary.total > 0 
                  ? Math.round((reportData.summary.completed / reportData.summary.total) * 100)
                  : 0}%
              </Text>
            </View>
            <View style={styles.insightCard}>
              <Text style={styles.insightText}>
                🎯 Most Active Priority: {Object.entries(reportData.by_priority)
                  .sort(([,a], [,b]) => b.total - a.total)[0]?.[1]?.label || 'N/A'}
              </Text>
            </View>
            <View style={styles.insightCard}>
              <Text style={styles.insightText}>
                📝 Tasks Created: {reportData.summary.total} this {reportPeriod}
              </Text>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Loading Overlay */}
      {loading && reportData && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="small" color={Colors.primary} />
          <Text style={styles.loadingText}>Updating...</Text>
        </View>
      )}
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
    marginTop: height * 0.04,
    color: Colors.textSecondary,
    fontSize: width * 0.04,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: width * 0.04,
    paddingVertical: height * 0.03,
    backgroundColor: Colors.surfaceLight,
    borderBottomWidth: 1,
    borderBottomColor: Colors.primaryLight,
  },
  backButton: {
    fontSize: width * 0.06,
    fontWeight: '600',
    color: Colors.primary,
  },
  headerTitle: {
    fontSize: width * 0.05,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  refreshButton: {
    fontSize: width * 0.05,
    fontWeight: '600',
    color: Colors.primary,
  },
  periodToggle: {
    flexDirection: 'row',
    backgroundColor: Colors.surfaceLight,
    marginHorizontal: width * 0.04,
    marginVertical: height * 0.02,
    borderRadius: width * 0.02,
    padding: width * 0.01,
  },
  periodToggleItem: {
    flex: 1,
    paddingVertical: height * 0.02,
    alignItems: 'center',
    borderRadius: width * 0.015,
  },
  periodToggleItemActive: {
    backgroundColor: Colors.primary,
  },
  periodToggleText: {
    fontSize: width * 0.035,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  periodToggleTextActive: {
    color: Colors.white,
  },
  content: {
    flex: 1,
    padding: width * 0.04,
  },
  summaryCards: {
    flexDirection: 'row',
    gap: width * 0.03,
    marginBottom: height * 0.06,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: Colors.surfaceLight,
    borderRadius: width * 0.03,
    padding: width * 0.04,
    alignItems: 'center',
    shadowColor: Colors.primary,
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  summaryLabel: {
    fontSize: width * 0.03,
    color: Colors.textSecondary,
    marginBottom: height * 0.01,
    fontWeight: '600',
  },
  summaryValue: {
    fontSize: width * 0.06,
    fontWeight: '700',
    color: Colors.primary,
  },
  chartSection: {
    marginBottom: height * 0.06,
  },
  sectionTitle: {
    fontSize: width * 0.045,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: height * 0.04,
  },
  chartContainer: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: width * 0.03,
    padding: width * 0.04,
    alignItems: 'center',
  },
  chartPlaceholder: {
    color: Colors.textSecondary,
    fontSize: width * 0.04,
    textAlign: 'center',
    paddingVertical: height * 0.1,
  },
  chartLegend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: width * 0.05,
    marginTop: height * 0.03,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: width * 0.015,
  },
  legendDot: {
    width: width * 0.02,
    height: width * 0.02,
    borderRadius: width * 0.01,
  },
  legendText: {
    fontSize: width * 0.03,
    color: Colors.textSecondary,
  },
  progressSection: {
    marginBottom: height * 0.06,
  },
  progressRow: {
    marginBottom: height * 0.04,
  },
  progressLabelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: height * 0.02,
  },
  progressLabel: {
    fontSize: width * 0.035,
    fontWeight: '600',
    color: Colors.textPrimary,
    flex: 1,
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: width * 0.03,
  },
  progressBar: {
    flex: 1,
    height: height * 0.02,
    borderRadius: width * 0.01,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: width * 0.01,
  },
  progressText: {
    fontSize: width * 0.03,
    color: Colors.textSecondary,
    fontWeight: '600',
    minWidth: width * 0.1,
    textAlign: 'right',
  },
  insightsSection: {
    marginBottom: height * 0.06,
  },
  insightCard: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: width * 0.03,
    padding: width * 0.04,
    marginBottom: height * 0.03,
    borderLeftWidth: 4,
    borderLeftColor: Colors.primary,
  },
  insightText: {
    fontSize: width * 0.035,
    color: Colors.textSecondary,
    lineHeight: height * 0.03,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
