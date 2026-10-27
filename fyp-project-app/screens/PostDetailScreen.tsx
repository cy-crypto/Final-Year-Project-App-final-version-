import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

import { Colors, Font, Radius } from '../constants/theme';
import type { RootStackParamList } from '../navigation/types';
import { toApiErrorMessage } from '../services/api';
import {
  addComment,
  deleteComment,
  deletePost,
  getComments,
  getPost,
  timeAgo,
  toggleLike,
  type Comment,
  type Post,
} from '../services/communityService';
import { Avatar, PostCard } from '../components/community/PostCard';
import { CenterLoader, EmptyCard, ModuleHeader, SectionHeader, moduleStyles } from '../components/module/ModuleUI';

type Route = RouteProp<RootStackParamList, 'PostDetail'>;

export function PostDetailScreen() {
  const navigation = useNavigation();
  const { params } = useRoute<Route>();
  const [post, setPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    try {
      const [p, c] = await Promise.all([getPost(params.postId), getComments(params.postId)]);
      setPost(p);
      setComments(c);
      setError(null);
    } catch (err) {
      setError(toApiErrorMessage(err, 'This post is no longer available.'));
    }
  }, [params.postId]);

  useEffect(() => navigation.addListener('focus', load), [navigation, load]);

  const like = async () => {
    if (!post) return;
    setPost({ ...post, liked: !post.liked, like_count: post.like_count + (post.liked ? -1 : 1) });
    try {
      const res = await toggleLike(post.id);
      setPost((p) => (p ? { ...p, ...res } : p));
    } catch {
      setPost(post);
    }
  };

  const send = async () => {
    const content = text.trim();
    if (!content || !post) return;
    setSending(true);
    try {
      const created = await addComment(post.id, content);
      setComments((prev) => [...prev, created]);
      setPost({ ...post, comment_count: post.comment_count + 1 });
      setText('');
    } catch (err) {
      Alert.alert('Could not comment', toApiErrorMessage(err, 'Please try again.'));
    } finally {
      setSending(false);
    }
  };

  const removeComment = (comment: Comment) =>
    Alert.alert('Delete comment', comment.content, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteComment(comment.id);
            setComments((prev) => prev.filter((c) => c.id !== comment.id));
            setPost((p) => (p ? { ...p, comment_count: Math.max(p.comment_count - 1, 0) } : p));
          } catch (err) {
            Alert.alert('Error', toApiErrorMessage(err, 'Could not delete the comment.'));
          }
        },
      },
    ]);

  const postMenu = () =>
    Alert.alert('Your post', undefined, [
      {
        text: 'Delete post',
        style: 'destructive',
        onPress: async () => {
          try {
            await deletePost(params.postId);
            navigation.goBack();
          } catch (err) {
            Alert.alert('Error', toApiErrorMessage(err, 'Could not delete the post.'));
          }
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);

  return (
    <SafeAreaView style={moduleStyles.container}>
      <ModuleHeader title="Post" subtitle={post ? `${post.comment_count} comments` : undefined} />
      {!post ? (
        error ? (
          <View style={moduleStyles.content}>
            <EmptyCard text={error} icon="chatbubble-ellipses-outline" />
          </View>
        ) : (
          <CenterLoader />
        )
      ) : (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={8}>
          <ScrollView contentContainerStyle={[moduleStyles.content, { paddingBottom: 24 }]} keyboardShouldPersistTaps="handled">
            <PostCard post={post} onLike={like} onMenu={postMenu} showComments={false} />
            <SectionHeader title="Comments" />
            {comments.length === 0 ? (
              <EmptyCard text="No comments yet. Say something nice!" />
            ) : (
              comments.map((c) => (
                <Pressable key={c.id} style={styles.comment} onLongPress={() => (c.is_mine || post.is_mine) && removeComment(c)}>
                  <Avatar author={c.author} size={34} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={styles.commentName}>
                      {c.author.name} <Text style={styles.commentTime}>· {timeAgo(c.created_at)}</Text>
                    </Text>
                    <Text style={styles.commentText}>{c.content}</Text>
                  </View>
                  {c.is_mine || post.is_mine ? (
                    <Pressable onPress={() => removeComment(c)} hitSlop={8}>
                      <Ionicons name="trash-outline" size={16} color={Colors.textHint} />
                    </Pressable>
                  ) : null}
                </Pressable>
              ))
            )}
          </ScrollView>
          <View style={styles.inputBar}>
            <TextInput
              style={styles.input}
              placeholder="Write a comment..."
              placeholderTextColor={Colors.textHint}
              value={text}
              onChangeText={(v) => setText(v.slice(0, 500))}
              multiline
            />
            <Pressable style={[styles.send, !text.trim() && { opacity: 0.5 }]} onPress={send} disabled={!text.trim() || sending}>
              {sending ? <ActivityIndicator size="small" color={Colors.white} /> : <Ionicons name="send" size={18} color={Colors.white} />}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  comment: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    backgroundColor: Colors.surfaceLight,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.borderSoft,
    padding: 12,
  },
  commentName: { fontFamily: Font.bold, fontSize: 14, color: Colors.textPrimary },
  commentTime: { fontFamily: Font.medium, fontSize: 12, color: Colors.textSecondary },
  commentText: { fontFamily: Font.medium, fontSize: 14, lineHeight: 20, color: Colors.textPrimary },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.borderSoft,
    backgroundColor: Colors.surfaceLight,
  },
  input: {
    flex: 1,
    minHeight: 42,
    maxHeight: 110,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderRadius: Radius.md,
    backgroundColor: Colors.bgLight,
    paddingHorizontal: 12,
    paddingTop: 11,
    paddingBottom: 11,
    fontFamily: Font.medium,
    fontSize: 15,
    color: Colors.textPrimary,
  },
  send: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
