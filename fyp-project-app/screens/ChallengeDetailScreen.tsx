import React, { useCallback, useEffect, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';

import { Colors, Font } from '../constants/theme';
import type { RootStackParamList } from '../navigation/types';
import { toApiErrorMessage } from '../services/api';
import {
  METRIC_LABELS,
  deleteChallenge,
  getStandings,
  toggleJoinChallenge,
  type Challenge,
  type Standing,
} from '../services/communityService';
import {
  Card,
  CenterLoader,
  EmptyCard,
  HeroCard,
  HeroStat,
  HeroStats,
  ModuleHeader,
  PrimaryButton,
  ProgressBar,
  SecondaryButton,
  SectionHeader,
  moduleStyles,
} from '../components/module/ModuleUI';

type Route = RouteProp<RootStackParamList, 'ChallengeDetail'>;

export function ChallengeDetailScreen() {
  const navigation = useNavigation();
  const { params } = useRoute<Route>();
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [rows, setRows] = useState<Standing[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await getStandings(params.challengeId);
      setChallenge(data.challenge);
      setRows(data.rows);
      setError(null);
    } catch (err) {
      setError(toApiErrorMessage(err, 'Could not load the challenge.'));
    } finally {
      setRefreshing(false);
    }
  }, [params.challengeId]);

  useEffect(() => navigation.addListener('focus', load), [navigation, load]);

  const join = async () => {
    try {
      await toggleJoinChallenge(params.challengeId);
      load();
    } catch (err) {
      Alert.alert('Error', toApiErrorMessage(err, 'Please try again.'));
    }
  };

  const remove = () =>
    Alert.alert('Delete challenge', 'This removes it for everyone who joined.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteChallenge(params.challengeId);
            navigation.goBack();
          } catch (err) {
            Alert.alert('Error', toApiErrorMessage(err, 'Could not delete the challenge.'));
          }
        },
      },
    ]);

  if (!challenge) {
    return (
      <SafeAreaView style={moduleStyles.container}>
        <ModuleHeader title="Challenge" />
        {error ? (
          <View style={moduleStyles.content}>
            <EmptyCard text={error} icon="flag-outline" />
          </View>
        ) : (
          <CenterLoader />
        )}
      </SafeAreaView>
    );
  }

  const unit = METRIC_LABELS[challenge.metric].unit;
  const me = rows.find((r) => r.is_me);
  const finishers = rows.filter((r) => r.completed).length;

  return (
    <SafeAreaView style={moduleStyles.container}>
      <ModuleHeader title="Challenge" subtitle={METRIC_LABELS[challenge.metric].label} />
      <ScrollView
        contentContainerStyle={moduleStyles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
      >
        <HeroCard label={`Goal: ${challenge.target.toLocaleString()} ${unit}`} value={challenge.title}>
          {me ? (
            <View style={{ marginTop: 6 }}>
              <ProgressBar pct={me.pct} color={Colors.white} />
            </View>
          ) : null}
          <HeroStats>
            <HeroStat icon="person" label="Your progress" value={me ? `${me.progress.toLocaleString()} ${unit}` : 'Not joined'} />
            <HeroStat icon="ribbon" label="Finished" value={`${finishers}/${rows.length}`} />
          </HeroStats>
        </HeroCard>

        {challenge.description ? (
          <Card title="About">
            <Text style={moduleStyles.body}>{challenge.description}</Text>
            <Text style={moduleStyles.muted}>
              {challenge.start_date} → {challenge.end_date} · {challenge.status}
            </Text>
          </Card>
        ) : null}

        <SectionHeader title="Standings" />
        {rows.length === 0 ? (
          <EmptyCard text="Nobody has joined yet." icon="people-outline" />
        ) : (
          rows.map((row) => (
            <View key={`${row.rank}-${row.name}`} style={[styles.row, row.is_me && styles.rowMe]}>
              <Text style={[styles.rank, row.rank <= 3 && { color: Colors.primary }]}>#{row.rank}</Text>
              <View style={{ flex: 1, gap: 6 }}>
                <View style={moduleStyles.rowBetween}>
                  <Text style={styles.name} numberOfLines={1}>
                    {row.name}
                    {row.is_me ? ' (you)' : ''}
                  </Text>
                  <Text style={styles.value}>{row.completed ? 'Done' : `${row.pct}%`}</Text>
                </View>
                <ProgressBar pct={row.pct} color={row.completed ? Colors.success : Colors.primary} />
                <Text style={moduleStyles.muted}>
                  {row.progress.toLocaleString()} / {challenge.target.toLocaleString()} {unit}
                </Text>
              </View>
            </View>
          ))
        )}

        {challenge.status !== 'ended' ? (
          challenge.joined ? (
            <SecondaryButton label="Leave challenge" icon="exit-outline" onPress={join} />
          ) : (
            <PrimaryButton label="Join challenge" icon="flag" onPress={join} />
          )
        ) : null}
        {challenge.is_mine ? <SecondaryButton label="Delete challenge" icon="trash-outline" danger onPress={remove} /> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.borderSoft,
    padding: 12,
  },
  rowMe: { borderColor: Colors.primary, backgroundColor: Colors.primarySurface },
  rank: { width: 34, fontFamily: Font.extrabold, fontSize: 16, color: Colors.textSecondary, textAlign: 'center' },
  name: { flex: 1, fontFamily: Font.bold, fontSize: 15, color: Colors.textPrimary },
  value: { fontFamily: Font.extrabold, fontSize: 15, color: Colors.primary },
});
