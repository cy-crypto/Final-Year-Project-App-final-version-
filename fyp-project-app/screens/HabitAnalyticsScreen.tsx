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
import { getHabitHistory } from '../services/habitService';

const CELL_SIZE = 14;
const CELL_GAP = 3;
const WEEKS_TO_SHOW = 13; // 90 days = ~13 weeks

interface DayData {
  date: string;
  completionRatio: number;
  hasData: boolean;
}

export function HabitAnalyticsScreen() {
  const navigation = useNavigation();
  const { habits } = useAppContext();
  const [loading, setLoading] = useState(true);
  const [habitHistories, setHabitHistories] = useState<Record<string, string[]>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchHabitHistories();
  }, [habits]);

  const fetchHabitHistories = async () => {
    if (habits.length === 0) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const histories: Record<string, string[]> = {};
      await Promise.all(
        habits.map(async (habit) => {
          const history = await getHabitHistory(habit.id);
          histories[habit.id] = history;
        })
      );
      setHabitHistories(histories);
    } catch (err) {
      console.error('Failed to fetch habit histories:', err);
      setError('Failed to load analytics data');
    } finally {
      setLoading(false);
    }
  };

  const heatmapData = useMemo(() => {
    const data: DayData[] = [];
    const today = new Date();
    
    // Generate last 90 days
    for (let i = 89; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(today.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      
      // Calculate completion ratio for this date
      let completedHabits = 0;
      let totalHabits = habits.length;
      
      Object.values(habitHistories).forEach(history => {
        if (history.includes(dateStr)) {
          completedHabits++;
        }
      });
      
      const completionRatio = totalHabits > 0 ? completedHabits / totalHabits : 0;
      
      data.push({
        date: dateStr,
        completionRatio,
        hasData: totalHabits > 0,
      });
    }
    
    return data;
  }, [habits, habitHistories]);

  const stats = useMemo(() => {
    if (heatmapData.length === 0) {
      return { totalCompletions: 0, bestDay: 0, currentMonth: 0 };
    }

    const totalCompletions = heatmapData.reduce((sum, day) => {
      return sum + (day.completionRatio * habits.length);
    }, 0);

    const bestDay = Math.max(...heatmapData.map(day => day.completionRatio)) * 100;

    // Current month completion
    const currentMonth = new Date().getMonth();
    const currentMonthData = heatmapData.filter(day => {
      const dayDate = new Date(day.date);
      return dayDate.getMonth() === currentMonth;
    });
    
    const currentMonthAvg = currentMonthData.length > 0 
      ? (currentMonthData.reduce((sum, day) => sum + day.completionRatio, 0) / currentMonthData.length) * 100
      : 0;

    return {
      totalCompletions: Math.round(totalCompletions),
      bestDay: Math.round(bestDay),
      currentMonth: Math.round(currentMonthAvg),
    };
  }, [heatmapData, habits.length]);

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
      <Text style={styles.title}>Habit Analytics</Text>

      {/* Subtitle */}
      <Text style={styles.subtitle}>Your completion history over the past 3 months</Text>

        {/* Heatmap */}
        {habits.length > 0 ? (
          <>
            {renderHeatmap()}
            
            {/* Stats */}
            <View style={styles.statsContainer}>
              <View style={styles.statCard}>
                <Text style={styles.statNumber}>{stats.totalCompletions}</Text>
                <Text style={styles.statLabel}>Total Completions</Text>
              </View>
              
              <View style={styles.statCard}>
                <Text style={styles.statNumber}>{stats.bestDay}%</Text>
                <Text style={styles.statLabel}>Best Day</Text>
              </View>
              
              <View style={styles.statCard}>
                <Text style={styles.statNumber}>{stats.currentMonth}%</Text>
                <Text style={styles.statLabel}>Current Month</Text>
              </View>
            </View>
          </>
        ) : (
          <View style={styles.noDataContainer}>
            <Text style={styles.noDataText}>No habits to analyze yet</Text>
            <Text style={styles.noDataSubtext}>Add some habits to see your analytics</Text>
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
  heatmapContainer: {
    alignSelf: 'center',
    marginBottom: 30,
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 40,
  },
  statCard: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    flex: 1,
    marginHorizontal: 4,
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
