import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Colors, Font, Radius, Shadows } from '../../constants/theme';
import { timeAgo, type Author, type Post } from '../../services/communityService';

const ACHIEVEMENT: Record<string, { icon: keyof typeof Ionicons.glyphMap; title: (meta: any) => string; sub: (meta: any) => string }> = {
  habit_streak: {
    icon: 'flame',
    title: (m) => `${m.streak}-day streak`,
    sub: (m) => `${m.habit}${m.best_streak > m.streak ? ` · best ${m.best_streak}` : ''}`,
  },
  task_milestone: {
    icon: 'checkmark-done',
    title: (m) => `${m.tasks_this_week} task${m.tasks_this_week === 1 ? '' : 's'} done`,
    sub: () => 'This week',
  },
  fitness_milestone: {
    icon: 'footsteps',
    title: (m) => `${Number(m.steps_week).toLocaleString()} steps`,
    sub: (m) => `This week · ${Number(m.steps_today).toLocaleString()} today`,
  },
};

export function Avatar({ author, size = 40 }: { author: Pick<Author, 'name' | 'avatar_url'>; size?: number }) {
  const initials = author.name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return author.avatar_url ? (
    <Image source={{ uri: author.avatar_url }} style={{ width: size, height: size, borderRadius: size / 2 }} />
  ) : (
    <View style={[styles.avatarFallback, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[styles.initials, { fontSize: size * 0.38 }]}>{initials}</Text>
    </View>
  );
}

type Props = {
  post: Post;
  onPress?: () => void;
  onLike: () => void;
  onMenu?: () => void;
  showComments?: boolean;
};

export function PostCard({ post, onPress, onLike, onMenu, showComments = true }: Props) {
  const achievement = ACHIEVEMENT[post.kind];
  return (
    <Pressable style={styles.card} onPress={onPress} disabled={!onPress}>
      <View style={styles.head}>
        <Avatar author={post.author} />
        <View style={{ flex: 1 }}>
          <Text style={styles.name} numberOfLines={1}>
            {post.author.name}
          </Text>
          <Text style={styles.time}>{timeAgo(post.created_at)}</Text>
        </View>
        {post.is_mine && onMenu ? (
          <Pressable onPress={onMenu} hitSlop={10} accessibilityLabel="Post options">
            <Ionicons name="ellipsis-horizontal" size={20} color={Colors.textSecondary} />
          </Pressable>
        ) : null}
      </View>

      {achievement ? (
        <View style={styles.badge}>
          <View style={styles.badgeIcon}>
            <Ionicons name={achievement.icon} size={20} color={Colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.badgeTitle}>{achievement.title(post.meta)}</Text>
            <Text style={styles.badgeSub} numberOfLines={1}>
              {achievement.sub(post.meta)}
            </Text>
          </View>
        </View>
      ) : null}

      {post.content ? <Text style={styles.content}>{post.content}</Text> : null}
      {post.image_url ? <Image source={{ uri: post.image_url }} style={styles.image} resizeMode="cover" /> : null}

      <View style={styles.actions}>
        <Pressable style={styles.action} onPress={onLike} hitSlop={8}>
          <Ionicons name={post.liked ? 'heart' : 'heart-outline'} size={20} color={post.liked ? Colors.error : Colors.textSecondary} />
          <Text style={[styles.actionText, post.liked && { color: Colors.error }]}>{post.like_count}</Text>
        </Pressable>
        <Pressable style={styles.action} onPress={onPress} hitSlop={8} disabled={!onPress}>
          <Ionicons name="chatbubble-outline" size={19} color={Colors.textSecondary} />
          <Text style={styles.actionText}>{post.comment_count}</Text>
        </Pressable>
      </View>

      {showComments && post.recent_comments.length > 0 ? (
        <View style={styles.comments}>
          {post.recent_comments.map((c) => (
            <Text key={c.id} style={styles.comment} numberOfLines={2}>
              <Text style={styles.commentName}>{c.author.name} </Text>
              {c.content}
            </Text>
          ))}
          {post.comment_count > post.recent_comments.length ? (
            <Text style={styles.more}>View all {post.comment_count} comments</Text>
          ) : null}
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.borderSoft,
    padding: 14,
    gap: 10,
    ...Shadows.card,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatarFallback: { backgroundColor: Colors.primarySurface, alignItems: 'center', justifyContent: 'center' },
  initials: { fontFamily: Font.extrabold, color: Colors.primary },
  name: { fontFamily: Font.bold, fontSize: 15, color: Colors.textPrimary },
  time: { fontFamily: Font.medium, fontSize: 12, color: Colors.textSecondary },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.primarySurface,
    borderRadius: Radius.md,
    padding: 12,
  },
  badgeIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.white, alignItems: 'center', justifyContent: 'center' },
  badgeTitle: { fontFamily: Font.extrabold, fontSize: 17, color: Colors.primary },
  badgeSub: { fontFamily: Font.medium, fontSize: 13, color: Colors.textSecondary },
  content: { fontFamily: Font.medium, fontSize: 15, lineHeight: 22, color: Colors.textPrimary },
  image: { width: '100%', aspectRatio: 4 / 3, borderRadius: Radius.md, backgroundColor: Colors.tintSlate },
  actions: { flexDirection: 'row', gap: 20 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actionText: { fontFamily: Font.semibold, fontSize: 14, color: Colors.textSecondary },
  comments: { gap: 4, borderTopWidth: 1, borderTopColor: Colors.borderSoft, paddingTop: 8 },
  comment: { fontFamily: Font.medium, fontSize: 14, color: Colors.textPrimary },
  commentName: { fontFamily: Font.bold },
  more: { fontFamily: Font.semibold, fontSize: 13, color: Colors.primary },
});
