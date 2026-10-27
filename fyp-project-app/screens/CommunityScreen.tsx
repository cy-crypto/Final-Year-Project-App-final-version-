import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { useAuth } from '../context/AuthContext';
import { Colors, Font, Radius, Shadows } from '../constants/theme';
import type { RootStackParamList } from '../navigation/types';
import { toApiErrorMessage } from '../services/api';
import {
  METRIC_LABELS,
  deletePost,
  getChallenges,
  getFeed,
  getLeaderboard,
  toggleJoinChallenge,
  toggleLike,
  type Challenge,
  type Leaderboard,
  type Post,
} from '../services/communityService';
import { Avatar, PostCard } from '../components/community/PostCard';
import {
  Card,
  CenterLoader,
  ChipRow,
  EmptyCard,
  Fab,
  HeroCard,
  HeroStat,
  HeroStats,
  ModuleHeader,
  PillTabs,
  ProgressBar,
  SectionHeader,
  moduleStyles,
} from '../components/module/ModuleUI';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type TabKey = 'feed' | 'mine' | 'leaders' | 'challenges';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'feed', label: 'Feed' },
  { key: 'mine', label: 'My posts' },
  { key: 'leaders', label: 'Leaders' },
  { key: 'challenges', label: 'Challenges' },
];

export function CommunityScreen() {
  const navigation = useNavigation<Nav>();
  const { user } = useAuth();
  const [tab, setTab] = useState<TabKey>('feed');
  const [posts, setPosts] = useState<Post[]>([]);
  const [nextBefore, setNextBefore] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [board, setBoard] = useState<Leaderboard | null>(null);
  const [metric, setMetric] = useState<'streak' | 'tasks'>('streak');
  const [challenges, setChallenges] = useState<Challenge[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // What is on screen, readable from the focus listener without re-subscribing.
  const view = useRef<{ tab: TabKey; metric: 'streak' | 'tasks' }>({ tab: 'feed', metric: 'streak' });

  const load = useCallback(async (which: TabKey, m: 'streak' | 'tasks') => {
    try {
      if (which === 'feed' || which === 'mine') {
        const page = await getFeed({ mine: which === 'mine' });
        if (view.current.tab !== which) return; // the user switched tabs meanwhile
        setPosts(page.results);
        setNextBefore(page.next_before);
      } else if (which === 'leaders') setBoard(await getLeaderboard(m));
      else setChallenges(await getChallenges());
      setError(null);
    } catch (err) {
      setError(toApiErrorMessage(err, 'Could not load the community.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Reload the visible tab on every focus: first open and coming back from a post or form.
  useEffect(
    () => navigation.addListener('focus', () => load(view.current.tab, view.current.metric)),
    [navigation, load]
  );

  const switchTab = (next: TabKey) => {
    view.current.tab = next;
    setLoading(true);
    setTab(next);
    load(next, view.current.metric);
  };

  const switchMetric = (next: 'streak' | 'tasks') => {
    view.current.metric = next;
    setBoard(null);
    setMetric(next);
    load('leaders', next);
  };

  const loadMore = async () => {
    if (!nextBefore || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await getFeed({ before: nextBefore, mine: tab === 'mine' });
      setPosts((prev) => [...prev, ...page.results]);
      setNextBefore(page.next_before);
    } catch (err) {
      Alert.alert('Could not load more', toApiErrorMessage(err, 'Please try again.'));
    } finally {
      setLoadingMore(false);
    }
  };

  const like = async (post: Post) => {
    // Optimistic heart, corrected by the server's count.
    setPosts((prev) =>
      prev.map((p) => (p.id === post.id ? { ...p, liked: !p.liked, like_count: p.like_count + (p.liked ? -1 : 1) } : p))
    );
    try {
      const res = await toggleLike(post.id);
      setPosts((prev) => prev.map((p) => (p.id === post.id ? { ...p, ...res } : p)));
    } catch {
      setPosts((prev) => prev.map((p) => (p.id === post.id ? post : p)));
    }
  };

  const postMenu = (post: Post) =>
    Alert.alert('Your post', undefined, [
      {
        text: 'Delete post',
        style: 'destructive',
        onPress: async () => {
          try {
            await deletePost(post.id);
            setPosts((prev) => prev.filter((p) => p.id !== post.id));
          } catch (err) {
            Alert.alert('Error', toApiErrorMessage(err, 'Could not delete the post.'));
          }
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);

  const join = async (challenge: Challenge) => {
    try {
      const updated = await toggleJoinChallenge(challenge.id);
      setChallenges((prev) => prev?.map((c) => (c.id === updated.id ? updated : c)) ?? null);
    } catch (err) {
      Alert.alert('Error', toApiErrorMessage(err, 'Could not update the challenge.'));
    }
  };

  const renderFeed = () => (
    <>
      <Pressable style={styles.composer} onPress={() => navigation.navigate('ComposePost')}>
        <Avatar author={{ name: user?.fullName || user?.email || '?', avatar_url: user?.avatarUrl ?? '' }} size={38} />
        <Text style={styles.composerText}>Share an update or an achievement...</Text>
        <Ionicons name="image-outline" size={22} color={Colors.primary} />
      </Pressable>
      {posts.length === 0 ? (
        <EmptyCard
          text={error ?? (tab === 'mine' ? 'You have not posted yet.' : 'No posts yet. Be the first to share something!')}
          icon="chatbubbles-outline"
        />
      ) : (
        <View style={moduleStyles.list}>
          {posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              onPress={() => navigation.navigate('PostDetail', { postId: post.id })}
              onLike={() => like(post)}
              onMenu={() => postMenu(post)}
            />
          ))}
        </View>
      )}
      {nextBefore ? (
        <Pressable style={styles.more} onPress={loadMore}>
          {loadingMore ? <ActivityIndicator color={Colors.primary} /> : <Text style={moduleStyles.link}>Load older posts</Text>}
        </Pressable>
      ) : null}
    </>
  );

  const renderLeaders = () => (
    <>
      <ChipRow
        options={[
          { key: 'streak', label: 'Habit streaks' },
          { key: 'tasks', label: 'Tasks this week' },
        ]}
        value={metric}
        onChange={switchMetric}
      />
      {!board ? (
        <ActivityIndicator color={Colors.primary} style={{ marginTop: 24 }} />
      ) : (
        <>
          <HeroCard
            label={metric === 'streak' ? 'Your best running streak' : 'Your tasks this week'}
            value={board.me ? `${board.me.score} ${metric === 'streak' ? 'days' : 'tasks'}` : '–'}
          >
            <HeroStats>
              <HeroStat icon="trophy" label="Your rank" value={board.me && board.me.score > 0 ? `#${board.me.rank}` : '–'} />
              <HeroStat icon="people" label="Ranked" value={String(board.rows.filter((r) => r.score > 0).length)} />
            </HeroStats>
          </HeroCard>
          {board.rows.filter((r) => r.score > 0).length === 0 ? (
            <EmptyCard text="Nobody is on the board yet. Keep a streak going to be first!" icon="trophy-outline" />
          ) : (
            <View style={moduleStyles.list}>
              {board.rows
                .filter((r) => r.score > 0)
                .map((row) => (
                  <View key={row.user_id} style={[styles.leaderRow, row.is_me && styles.leaderMe]}>
                    <Text style={[styles.rank, row.rank <= 3 && { color: Colors.primary }]}>#{row.rank}</Text>
                    <Avatar author={row} size={38} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.leaderName} numberOfLines={1}>
                        {row.name}
                        {row.is_me ? ' (you)' : ''}
                      </Text>
                      <Text style={moduleStyles.muted} numberOfLines={1}>
                        {row.detail}
                      </Text>
                    </View>
                    <Text style={styles.score}>{row.score}</Text>
                  </View>
                ))}
            </View>
          )}
          <Text style={[moduleStyles.muted, { textAlign: 'center' }]}>You can hide yourself from rankings in Profile → Preferences.</Text>
        </>
      )}
    </>
  );

  const renderChallenges = () =>
    challenges === null ? (
      <ActivityIndicator color={Colors.primary} style={{ marginTop: 24 }} />
    ) : challenges.length === 0 ? (
      <EmptyCard text="No challenges running. Start one with the + button!" icon="flag-outline" />
    ) : (
      <View style={moduleStyles.list}>
        {challenges.map((c) => {
          const unit = METRIC_LABELS[c.metric].unit;
          const pct = c.my_progress !== null ? Math.min((c.my_progress / c.target) * 100, 100) : 0;
          return (
            <Card
              key={c.id}
              title={c.title}
              right={<Text style={styles.status}>{c.status === 'upcoming' ? 'Starts soon' : c.status === 'ended' ? 'Ended' : 'Active'}</Text>}
            >
              {c.description ? <Text style={moduleStyles.body}>{c.description}</Text> : null}
              <Text style={moduleStyles.muted}>
                {METRIC_LABELS[c.metric].label}: {c.target.toLocaleString()} {unit} · {formatRange(c.start_date, c.end_date)} · {c.participant_count} joined
              </Text>
              {c.joined && c.my_progress !== null ? (
                <>
                  <ProgressBar pct={pct} color={pct >= 100 ? Colors.success : Colors.primary} />
                  <Text style={moduleStyles.bodyStrong}>
                    {c.my_progress.toLocaleString()} / {c.target.toLocaleString()} {unit}
                    {pct >= 100 ? ' · completed!' : ''}
                  </Text>
                </>
              ) : null}
              <View style={moduleStyles.grid}>
                <Pressable style={[styles.btn, c.joined ? styles.btnGhost : styles.btnSolid]} onPress={() => join(c)}>
                  <Text style={[styles.btnText, c.joined ? { color: Colors.primary } : { color: Colors.white }]}>
                    {c.joined ? 'Leave' : 'Join'}
                  </Text>
                </Pressable>
                <Pressable style={[styles.btn, styles.btnGhost]} onPress={() => navigation.navigate('ChallengeDetail', { challengeId: c.id })}>
                  <Text style={[styles.btnText, { color: Colors.primary }]}>Standings</Text>
                </Pressable>
              </View>
            </Card>
          );
        })}
      </View>
    );

  return (
    <SafeAreaView style={moduleStyles.container}>
      <ModuleHeader
        title="Community"
        subtitle="Grow together, stay motivated."
        actions={[{ icon: 'trophy-outline', label: 'Share an achievement', onPress: () => navigation.navigate('ComposePost', { share: true }) }]}
      />
      <PillTabs
        tabs={TABS}
        value={tab}
        onChange={switchTab}
      />
      {loading ? (
        <CenterLoader />
      ) : (
        <ScrollView
          contentContainerStyle={moduleStyles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(tab, metric); }} tintColor={Colors.primary} />}
        >
          {tab === 'feed' || tab === 'mine' ? renderFeed() : tab === 'leaders' ? renderLeaders() : renderChallenges()}
          {error && tab !== 'feed' && tab !== 'mine' ? <SectionHeader title={error} /> : null}
        </ScrollView>
      )}
      {tab === 'challenges' ? (
        <Fab onPress={() => navigation.navigate('CreateChallenge')} label="New challenge" />
      ) : tab === 'feed' || tab === 'mine' ? (
        <Fab onPress={() => navigation.navigate('ComposePost')} icon="create-outline" label="New post" />
      ) : null}
    </SafeAreaView>
  );
}

function formatRange(start: string, end: string) {
  const fmt = (s: string) => {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
  };
  return `${fmt(start)} – ${fmt(end)}`;
}

const styles = StyleSheet.create({
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.surfaceLight,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.borderSoft,
    padding: 12,
    ...Shadows.card,
  },
  composerText: { flex: 1, fontFamily: Font.medium, fontSize: 15, color: Colors.textHint },
  more: { alignItems: 'center', paddingVertical: 12 },
  leaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.surfaceLight,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.borderSoft,
    padding: 10,
    ...Shadows.card,
  },
  leaderMe: { borderColor: Colors.primary, backgroundColor: Colors.primarySurface },
  rank: { width: 34, fontFamily: Font.extrabold, fontSize: 16, color: Colors.textSecondary, textAlign: 'center' },
  leaderName: { fontFamily: Font.bold, fontSize: 15, color: Colors.textPrimary },
  score: { fontFamily: Font.extrabold, fontSize: 20, color: Colors.primary, minWidth: 36, textAlign: 'right' },
  status: { fontFamily: Font.bold, fontSize: 13, color: Colors.primary },
  btn: { flex: 1, height: 40, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  btnSolid: { backgroundColor: Colors.primary, ...Shadows.button },
  btnGhost: { borderWidth: 1.5, borderColor: Colors.primary, backgroundColor: Colors.surfaceLight },
  btnText: { fontFamily: Font.bold, fontSize: 15 },
});
