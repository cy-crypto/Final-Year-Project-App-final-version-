import React, { useEffect, useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';

import { useAppContext } from '../context/AppContext';
import { Colors, Font, Radius } from '../constants/theme';
import type { RootStackParamList } from '../navigation/types';
import { toApiErrorMessage } from '../services/api';
import { createPost, shareAchievement, type PostKind } from '../services/communityService';
import {
  ChipRow,
  ErrorText,
  Field,
  FormCard,
  FormHeader,
  Input,
  PrimaryButton,
  moduleStyles,
} from '../components/module/ModuleUI';

type Route = RouteProp<RootStackParamList, 'ComposePost'>;
type ShareKind = Exclude<PostKind, 'post'>;

const SHARE_OPTIONS: { kind: ShareKind; icon: keyof typeof Ionicons.glyphMap; title: string; meta: string }[] = [
  { kind: 'habit_streak', icon: 'flame-outline', title: 'Habit streak', meta: 'Your running streak' },
  { kind: 'task_milestone', icon: 'checkmark-done-outline', title: 'Tasks done', meta: 'Finished this week' },
  { kind: 'fitness_milestone', icon: 'footsteps-outline', title: 'Steps', meta: 'Walked this week' },
];

export function ComposePostScreen() {
  const navigation = useNavigation();
  const { params } = useRoute<Route>();
  const { habits, fetchHabits } = useAppContext();
  const [shareKind, setShareKind] = useState<ShareKind | null>(params?.share ? 'habit_streak' : null);
  const [habitId, setHabitId] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchHabits();
  }, [fetchHabits]);

  const streakHabits = habits.filter((h) => h.streakCount > 0);

  const pickImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Allow photo access to add a picture.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 0.7 });
    if (!result.canceled && result.assets[0]) setImageUri(result.assets[0].uri);
  };

  const submit = async () => {
    setError(null);
    if (!shareKind && !text.trim() && !imageUri) {
      setError('Write something or add a photo.');
      return;
    }
    setPosting(true);
    try {
      if (shareKind) await shareAchievement(shareKind, text.trim(), habitId ? Number(habitId) : undefined);
      else await createPost(text.trim(), imageUri);
      navigation.goBack();
    } catch (err) {
      setError(toApiErrorMessage(err, 'Could not publish your post.'));
    } finally {
      setPosting(false);
    }
  };

  return (
    <SafeAreaView style={moduleStyles.container}>
      <FormHeader title={shareKind ? 'Share Achievement' : 'New Post'} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={moduleStyles.formContent} keyboardShouldPersistTaps="handled">
          <FormCard>
            <Field label="Share an achievement (optional)">
              <View style={{ gap: 8 }}>
                {SHARE_OPTIONS.map((option) => {
                  const active = shareKind === option.kind;
                  return (
                    <Pressable
                      key={option.kind}
                      style={[styles.option, active && styles.optionActive]}
                      onPress={() => setShareKind(active ? null : option.kind)}
                    >
                      <Ionicons name={option.icon} size={22} color={active ? Colors.white : Colors.primary} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.optionTitle, active && { color: Colors.white }]}>{option.title}</Text>
                        <Text style={[styles.optionMeta, active && { color: 'rgba(255,255,255,0.9)' }]}>{option.meta}</Text>
                      </View>
                      <Ionicons
                        name={active ? 'checkmark-circle' : 'ellipse-outline'}
                        size={22}
                        color={active ? Colors.white : Colors.textHint}
                      />
                    </Pressable>
                  );
                })}
              </View>
            </Field>
            {shareKind === 'habit_streak' && streakHabits.length > 0 ? (
              <Field label="Which habit?">
                <ChipRow
                  options={[
                    { key: 'best', label: 'Best streak' },
                    ...streakHabits.map((h) => ({ key: h.id, label: `${h.name} · ${h.streakCount}d` })),
                  ]}
                  value={habitId ?? 'best'}
                  onChange={(k) => setHabitId(k === 'best' ? null : k)}
                />
              </Field>
            ) : null}
            <Field label={shareKind ? 'Add a message (optional)' : 'What do you want to share?'}>
              <Input
                placeholder={shareKind ? 'e.g. Feeling great!' : 'Write a post...'}
                multiline
                value={text}
                onChangeText={(v) => setText(v.slice(0, 1000))}
                style={{ height: 120 }}
              />
            </Field>
            {!shareKind ? (
              <Field label="Photo (optional)">
                {imageUri ? (
                  <View>
                    <Image source={{ uri: imageUri }} style={styles.preview} />
                    <Pressable style={styles.removeImage} onPress={() => setImageUri(null)} hitSlop={8}>
                      <Ionicons name="close" size={18} color={Colors.white} />
                    </Pressable>
                  </View>
                ) : (
                  <Pressable style={styles.addPhoto} onPress={pickImage}>
                    <Ionicons name="image-outline" size={20} color={Colors.primary} />
                    <Text style={styles.addPhotoText}>Add a photo</Text>
                  </Pressable>
                )}
              </Field>
            ) : null}
            <Text style={moduleStyles.muted}>Posts are visible to everyone in the community. You can delete yours any time.</Text>
          </FormCard>
          <View style={{ paddingHorizontal: 16, gap: 8 }}>
            <ErrorText text={error} />
            <PrimaryButton label={shareKind ? 'Share' : 'Post'} icon="send" onPress={submit} loading={posting} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    backgroundColor: Colors.primarySurface,
  },
  optionActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  optionTitle: { fontFamily: Font.bold, fontSize: 15, color: Colors.textPrimary },
  optionMeta: { fontFamily: Font.medium, fontSize: 13, color: Colors.textSecondary },
  preview: { width: '100%', aspectRatio: 4 / 3, borderRadius: Radius.md },
  removeImage: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addPhoto: {
    height: 46,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: Colors.primary,
    backgroundColor: Colors.primarySurface,
  },
  addPhotoText: { fontFamily: Font.semibold, fontSize: 14, color: Colors.primary },
});
