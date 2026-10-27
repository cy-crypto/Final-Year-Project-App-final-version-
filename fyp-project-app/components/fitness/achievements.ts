import { Alert } from 'react-native';
import { claimGoalAchievements, type FitnessGoalDto } from '../../services/fitnessService';

let checking = false;
const labels = { steps: 'daily steps', calories: 'daily calories burned', sleep: 'sleep', workout_frequency: 'weekly workouts' };

export async function notifyFitnessAchievements(goals: FitnessGoalDto[]): Promise<void> {
  if (checking || !goals.some((g) => g.isActive && g.progress.complete && !g.progress.achievement_notified)) return;
  checking = true;
  try {
    const achievements = await claimGoalAchievements();
    if (achievements.length) {
      Alert.alert('Goal reached!', `Well done! You reached your ${achievements.map((a) => labels[a.goal_type]).join(' and ')} target.`);
    }
  } finally {
    checking = false;
  }
}
