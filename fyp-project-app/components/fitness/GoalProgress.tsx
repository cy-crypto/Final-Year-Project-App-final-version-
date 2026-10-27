import React from 'react';
import { Text, View } from 'react-native';
import { ProgressBar, moduleStyles as s } from '../module/ModuleUI';
import { Colors } from '../../constants/theme';
import type { FitnessGoalDto } from '../../services/fitnessService';

export function GoalProgress({ goal }: { goal: FitnessGoalDto }) {
  const p = goal.progress;
  return (
    <View style={{ gap: 8 }}>
      <Text style={s.muted}>Target: {Number(goal.targetValue).toLocaleString()} {goal.unit} · {p.period}</Text>
      {!goal.isActive ? <Text style={s.muted}>Archived</Text> : p.available ? (
        <>
          <Text style={s.body}>{p.current?.toLocaleString()} recorded · {p.remaining?.toLocaleString()} {goal.unit} remaining</Text>
          <View accessible accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: p.percent ?? 0 }} accessibilityLabel={`${goal.goalType} goal progress`}>
            <ProgressBar pct={p.percent ?? 0} color={p.complete ? Colors.success : Colors.primary} />
          </View>
          <Text style={[s.bodyStrong, p.complete && { color: Colors.success }]}>{p.complete ? 'Completed' : 'In progress'}</Text>
        </>
      ) : <Text style={s.body}>Progress unavailable. {p.unavailable_reason}</Text>}
      {goal.isActive ? <Text style={s.muted}>{p.period === 'weekly' ? 'Week starting' : 'Day'} {p.period_start} · {p.timezone}</Text> : null}
    </View>
  );
}
