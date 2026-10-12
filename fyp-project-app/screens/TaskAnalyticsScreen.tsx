import React, { useEffect, useState, useMemo } from 'react';
import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Dimensions,
  Pressable,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Svg, Rect, Text as SvgText } from 'react-native-svg';
import { useAppContext } from '../context/AppContext';
import { Colors } from '../constants/theme';

const CELL_SIZE = 14;
const CELL_GAP = 3;
const WEEKS_TO_SHOW = 13; // 90 days = ~13 weeks

interface DayData {
  date: string;
  completionRatio: number;
  hasData: boolean;
}

export function TaskAnalyticsScreen() {
  const navigation = useNavigation();
  const { tasks } = useAppContext();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Simulate loading and error handling
    setLoading(false);
  }, [tasks]);

  const heatmapData = useMemo(() => {
    const data: DayData[] = [];
    const today = new Date();
    
    // Generate last 90 days
    for (let i = 89; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(today.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      
      // Calculate completion ratio for this date
      let completedTasks = 0;
      let totalTasks = 0;
      
      tasks.forEach(task => {
        const taskDate = task.deadline ? new Date(task.deadline).toISOString().split('T')[0] : null;
        if (taskDate === dateStr) {
          totalTasks++;
          if (task.status === 'done') {
            completedTasks++;
          }
        }
      });
      
      const completionRatio = totalTasks > 0 ? completedTasks / totalTasks : 0;
      
      data.push({
        date: dateStr,
        completionRatio,
        hasData: totalTasks > 0,
      });
    }
    
    return data;
  }, [tasks]);

  const stats = useMemo(() => {
    if (tasks.length === 0) {
      return { 
        totalTasks: 0, 
        completedTasks: 0, 
        completionRate: 0, 
        overdueTasks: 0,
        todayTasks: 0
      };
    }

    const completedTasks = tasks.filter(task => task.status === 'done').length;
    const overdueTasks = tasks.filter(task => {
      return task.deadline && 
             new Date(task.deadline) < new Date() && 
             task.status !== 'done';
    }).length;
    
    const today = new Date().toISOString().split('T')[0];
    const todayTasks = tasks.filter(task => {
      const taskDate = task.deadline ? new Date(task.deadline).toISOString().split('T')[0] : null;
      return taskDate === today;
    }).length;

    const completionRate = tasks.length > 0 ? Math.round((completedTasks / tasks.length) * 100) : 0;

    return {
      totalTasks: tasks.length,
      completedTasks,
      completionRate,
      overdueTasks,
      todayTasks,
    };
  }, [tasks]);

  const getHeatmapColor = (ratio: number, hasData: boolean): string => {
    if (!hasData) return '#ebedf0'; // No data
    
    if (ratio === 0) return '#ebedf0'; // 0% - light grey
    if (ratio <= 0.33) return '#c6e48b'; // 1-33% - light green
    if (ratio <= 0.66) return '#7bc96f'; // 34-66% - medium green
    if (ratio <= 0.99) return '#239a3b'; // 67-99% - dark green
    return '#196127'; // 100% - darkest green
  };

  const renderHeatmap = () => {
    const { width } = Dimensions.get('window');
    const svgWidth = Math.min(width - 32, 400); // Leave padding, max width
    const svgHeight = 7 * (CELL_SIZE + CELL_GAP); // 7 rows
    
    const startX = 20; // Space for day labels
    const startY = 30; // Space for month labels

    return (
      <View style={styles.heatmapContainer}>
        <Svg width={svgWidth} height={svgHeight + 40}>
          {/* Month labels */}
          {(() => {
            const months: { name: string; weekIndex: number }[] = [];
            heatmapData.forEach((day, index) => {
              const date = new Date(day.date);
              const monthName = date.toLocaleDateString('en-US', { month: 'short' });
              const weekIndex = Math.floor(index / 7);
              
              if (index % 7 === 0 && !months.find(m => m.name === monthName)) {
                months.push({ name: monthName, weekIndex });
              }
            });
            
            return months.map((month, i) => (
              <SvgText
                key={`month-label-${i}`}
                x={startX + month.weekIndex * (CELL_SIZE + CELL_GAP)}
                y={15}
                fontSize={10}
                fill={Colors.textSecondary}
                textAnchor="middle"
              >
                {month.name}
              </SvgText>
            ));
          })()}

          {/* Day labels */}
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, index) => (
            <SvgText
              key={`day-label-${index}`}
              x={10}
              y={startY + index * (CELL_SIZE + CELL_GAP) + CELL_SIZE / 2 + 3}
              fontSize={10}
              fill={Colors.textSecondary}
              textAnchor="middle"
            >
              {day}
            </SvgText>
          ))}

          {/* Heatmap cells */}
          {heatmapData.map((day, index) => {
            const weekIndex = Math.floor(index / 7);
            const dayIndex = index % 7;
            const x = startX + weekIndex * (CELL_SIZE + CELL_GAP);
            const y = startY + dayIndex * (CELL_SIZE + CELL_GAP);
            
            return (
              <Rect
                key={`cell-${weekIndex}-${dayIndex}`}
                x={x}
                y={y}
                width={CELL_SIZE}
                height={CELL_SIZE}
                fill={getHeatmapColor(day.completionRatio, day.hasData)}
                rx={2}
              />
            );
          })}
        </Svg>
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading analytics...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Back button row */}
      <View style={styles.backButtonRow}>
        <Pressable style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonText}>←</Text>
        </Pressable>
      </View>

      {/* Title */}
      <Text style={styles.title}>Task Analytics</Text>

      {/* Subtitle */}
      <Text style={styles.subtitle}>Your task completion history over past 3 months</Text>

      {tasks.length > 0 ? (
        <>
          {/* Stats */}
          <View style={styles.statsContainer}>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{stats.totalTasks}</Text>
              <Text style={styles.statLabel}>Total Tasks</Text>
            </View>
            
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{stats.completedTasks}</Text>
              <Text style={styles.statLabel}>Completed</Text>
            </View>
            
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{stats.completionRate}%</Text>
              <Text style={styles.statLabel}>Completion Rate</Text>
            </View>
            
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{stats.overdueTasks}</Text>
              <Text style={styles.statLabel}>Overdue</Text>
            </View>
          </View>

          {/* Heatmap */}
          {renderHeatmap()}
          
          {/* Today's Tasks */}
          <View style={styles.todayContainer}>
            <Text style={styles.todayTitle}>Today's Tasks</Text>
            <Text style={styles.todayCount}>{stats.todayTasks} tasks scheduled</Text>
          </View>
        </>
      ) : (
        <View style={styles.noDataContainer}>
          <Text style={styles.noDataText}>No tasks to analyze yet</Text>
          <Text style={styles.noDataSubtext}>Add some tasks to see your analytics</Text>
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
    marginTop: 16,
    fontSize: 16,
    color: Colors.textSecondary,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  errorText: {
    fontSize: 16,
    color: Colors.error,
    textAlign: 'center',
  },
  backButtonRow: {
    paddingTop: 50,
    paddingHorizontal: 16,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  backButtonText: {
    fontSize: 20,
    fontWeight: '600',
    color: Colors.primary,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: Colors.primary,
    textAlign: 'center',
    marginTop: 12,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 30,
  },
  statsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginBottom: 30,
  },
  statCard: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    flex: 1,
    marginHorizontal: 4,
    marginBottom: 8,
    minWidth: 100,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  statNumber: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.primary,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  heatmapContainer: {
    alignSelf: 'center',
    marginBottom: 30,
  },
  todayContainer: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  todayTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  todayCount: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  noDataContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 60,
  },
  noDataText: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: 8,
  },
  noDataSubtext: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
});
