import React, { useEffect, useState, useCallback } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  FlatList,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { api, parseJsonData, toApiErrorMessage } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Colors } from '../constants/theme';
import type { RootStackParamList } from '../navigation/types';

type MedicationHistoryScreenNavigationProp = NativeStackNavigationProp<RootStackParamList>;

type FilterType = 'all' | 'taken' | 'skipped' | 'deferred';

interface MedicationLog {
  id: number;
  medication: number;
  medication_name: string;
  status: 'taken' | 'skipped' | 'deferred';
  scheduled_time: string;
  taken_at?: string;
  notes?: string;
  created_at: string;
}

interface GroupedLogs {
  date: string;
  logs: MedicationLog[];
}

interface Stats {
  adherence: number;
  taken: number;
  skipped: number;
  deferred: number;
  total: number;
}

export function MedicationHistoryScreen() {
  const { user } = useAuth();
  const navigation = useNavigation<MedicationHistoryScreenNavigationProp>();

  const [logs, setLogs] = useState<MedicationLog[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<MedicationLog[]>([]);
  const [groupedLogs, setGroupedLogs] = useState<GroupedLogs[]>([]);
  const [stats, setStats] = useState<Stats>({
    adherence: 0,
    taken: 0,
    skipped: 0,
    deferred: 0,
    total: 0,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const calculateStats = useCallback((logsArray: MedicationLog[]) => {
    const taken = logsArray.filter(log => log.status === 'taken').length;
    const skipped = logsArray.filter(log => log.status === 'skipped').length;
    const deferred = logsArray.filter(log => log.status === 'deferred').length;
    const total = logsArray.length;
    const adherence = total > 0 ? Math.round((taken / total) * 100) : 0;

    setStats({
      adherence,
      taken,
      skipped,
      deferred,
      total,
    });
  }, []);

  const groupLogsByDate = useCallback((logsArray: MedicationLog[]) => {
    const grouped: { [key: string]: MedicationLog[] } = {};
    
    logsArray.forEach(log => {
      const date = new Date(log.scheduled_time).toDateString();
      if (!grouped[date]) {
        grouped[date] = [];
      }
      grouped[date].push(log);
    });

    const groupedArray: GroupedLogs[] = Object.entries(grouped)
      .map(([date, logs]) => ({
        date: formatDate(date),
        logs: logs.sort((a, b) => 
          new Date(b.scheduled_time).getTime() - new Date(a.scheduled_time).getTime()
        ),
      }))
      .sort((a, b) => {
        const dateA = new Date(a.logs[0].scheduled_time);
        const dateB = new Date(b.logs[0].scheduled_time);
        return dateB.getTime() - dateA.getTime();
      });

    setGroupedLogs(groupedArray);
  }, []);

  const fetchLogs = useCallback(async () => {
    try {
      setError(null);
      const response = await api.get('/medication-logs/');
      const data = parseJsonData(response.data);
      const logsArray = Array.isArray(data) ? data : [];
      setLogs(logsArray);
      calculateStats(logsArray);
      
      // Apply current filter
      let filtered = logsArray;
      if (activeFilter !== 'all') {
        filtered = logsArray.filter(log => log.status === activeFilter);
      }
      setFilteredLogs(filtered);
      groupLogsByDate(filtered);
    } catch (err) {
      console.error('Error fetching medication logs:', err);
      setError(toApiErrorMessage(err, 'Failed to load medication history. Please try again.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeFilter, calculateStats, groupLogsByDate]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    // Re-filter logs when filter changes
    let filtered = logs;
    if (activeFilter !== 'all') {
      filtered = logs.filter(log => log.status === activeFilter);
    }
    setFilteredLogs(filtered);
    groupLogsByDate(filtered);
  }, [activeFilter, logs, groupLogsByDate]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchLogs();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'taken':
        return Colors.success;
      case 'skipped':
        return Colors.error;
      case 'deferred':
        return Colors.warning;
      default:
        return Colors.textSecondary;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'taken':
        return '✓';
      case 'skipped':
        return '✕';
      case 'deferred':
        return '⏸';
      default:
        return '?';
    }
  };

  const renderStatCard = (title: string, value: string | number, color: string) => (
    <View style={[styles.statCard, { borderColor: color }]}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statTitle}>{title}</Text>
    </View>
  );

  const renderFilterTab = (filter: FilterType, label: string) => (
    <Pressable
      style={[
        styles.filterTab,
        activeFilter === filter && styles.filterTabActive,
      ]}
      onPress={() => setActiveFilter(filter)}
    >
      <Text
        style={[
          styles.filterTabText,
          activeFilter === filter && styles.filterTabTextActive,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );

  const renderLogItem = ({ item }: { item: MedicationLog }) => (
    <View style={styles.logCard}>
      <View style={styles.logHeader}>
        <Text style={styles.medicationName}>{item.medication_name}</Text>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) }]}>
          <Text style={styles.statusText}>{getStatusIcon(item.status)} {item.status}</Text>
        </View>
      </View>
      
      <View style={styles.logDetails}>
        <Text style={styles.logTime}>
          Scheduled: {formatTime(item.scheduled_time)}
        </Text>
        {item.taken_at && (
          <Text style={styles.logTime}>
            Taken: {formatTime(item.taken_at)}
          </Text>
        )}
      </View>
      
      {item.notes && (
        <Text style={styles.logNotes}>Notes: {item.notes}</Text>
      )}
    </View>
  );

  const renderDateGroup = ({ item }: { item: GroupedLogs }) => (
    <View style={styles.dateGroup}>
      <Text style={styles.dateHeader}>{item.date}</Text>
      {item.logs.map((log) => (
        <View key={log.id} style={styles.logItem}>
          {renderLogItem({ item: log })}
        </View>
      ))}
    </View>
  );

  const renderContent = () => {
    if (loading) {
      return (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading medication history...</Text>
        </View>
      );
    }

    if (error) {
      return (
        <View style={styles.centerContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable style={styles.retryButton} onPress={fetchLogs}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </Pressable>
        </View>
      );
    }

    if (filteredLogs.length === 0) {
      return (
        <View style={styles.centerContainer}>
          <Text style={styles.emptyIcon}>💊</Text>
          <Text style={styles.emptyText}>
            {activeFilter === 'all' 
              ? 'No medication logs found' 
              : `No ${activeFilter} medications found`}
          </Text>
        </View>
      );
    }

    return (
      <FlatList
        data={groupedLogs}
        renderItem={renderDateGroup}
        keyExtractor={(item) => item.date}
        contentContainerStyle={styles.listContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
        showsVerticalScrollIndicator={false}
      />
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonText}>← Back</Text>
        </Pressable>
        <Text style={styles.title}>Medication History</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Stats Bar */}
      <View style={styles.statsContainer}>
        {renderStatCard('Adherence', `${stats.adherence}%`, Colors.primary)}
        {renderStatCard('Taken', stats.taken, Colors.success)}
        {renderStatCard('Skipped', stats.skipped, Colors.error)}
        {renderStatCard('Deferred', stats.deferred, Colors.warning)}
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterContainer}>
        {renderFilterTab('all', 'All')}
        {renderFilterTab('taken', 'Taken')}
        {renderFilterTab('skipped', 'Skipped')}
        {renderFilterTab('deferred', 'Deferred')}
      </View>

      {/* Content */}
      <View style={styles.content}>
        {renderContent()}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bgLight,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  backButton: {
    backgroundColor: Colors.primary,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  backButtonText: {
    color: Colors.white,
    fontWeight: '600',
    fontSize: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.primary,
    textAlign: 'center',
    flex: 1,
  },
  headerSpacer: {
    width: 60,
  },
  statsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 8,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.white,
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 4,
  },
  statTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  filterContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
    gap: 8,
  },
  filterTab: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: Colors.bgLight,
    alignItems: 'center',
  },
  filterTabActive: {
    backgroundColor: Colors.primary,
  },
  filterTabText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  filterTabTextActive: {
    color: Colors.white,
  },
  content: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  errorText: {
    fontSize: 16,
    color: Colors.error,
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: Colors.white,
    fontWeight: '600',
    fontSize: 16,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 16,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  listContainer: {
    padding: 16,
  },
  dateGroup: {
    marginBottom: 24,
  },
  dateHeader: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.primary,
    marginBottom: 12,
  },
  logItem: {
    marginBottom: 8,
  },
  logCard: {
    backgroundColor: Colors.white,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  logHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  medicationName: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.white,
  },
  logDetails: {
    marginBottom: 8,
  },
  logTime: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 2,
  },
  logNotes: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontStyle: 'italic',
  },
});
