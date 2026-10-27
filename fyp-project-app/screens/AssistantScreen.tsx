import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import {
  AudioQuality,
  IOSOutputFormat,
  createAudioPlayer,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  type AudioPlayer,
  type AudioStatus,
  type RecordingOptions,
} from 'expo-audio';
import { File, Paths } from 'expo-file-system';

import { Colors, Radius } from '../constants/theme';
import { useAppContext } from '../context/AppContext';
import {
  sendAssistantMessage,
  speakText,
  transcribeAudio,
  type ChatMessage,
} from '../services/assistantService';
import { toApiErrorMessage } from '../services/api';

const SUGGESTIONS = [
  'Which medicine do I have to take today?',
  'Add a task: call the bank tomorrow',
  'میں نے کھانے پر 500 خرچ کیے',
  'مینوں اج دے ٹاسک دسو',
];

// Small mono recordings keep uploads light. Android records AAC, iOS records WAV (both accepted by Gemini).
const VOICE_RECORDING: RecordingOptions = {
  extension: '.aac',
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 32000,
  android: { extension: '.aac', outputFormat: 'aac_adts', audioEncoder: 'aac' },
  ios: {
    extension: '.wav',
    outputFormat: IOSOutputFormat.LINEARPCM,
    audioQuality: AudioQuality.MEDIUM,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: {},
};
const VOICE_MIME_TYPE = Platform.OS === 'ios' ? 'audio/wav' : 'audio/aac';

type ListItem = ChatMessage & { id: string; isError?: boolean };

// Spoken replies should not read out markdown symbols.
function toSpeakable(text: string) {
  return text.replace(/[*_#`>]+/g, '').trim();
}

export function AssistantScreen() {
  const navigation = useNavigation();
  const { fetchTasks, fetchHabits } = useAppContext();
  const recorder = useAudioRecorder(VOICE_RECORDING);
  const [messages, setMessages] = useState<ListItem[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const listRef = useRef<FlatList<ListItem>>(null);
  const playerRef = useRef<AudioPlayer | null>(null);

  const stopSpeaking = useCallback(() => {
    if (playerRef.current) {
      try {
        playerRef.current.remove();
      } catch {
        // player already released
      }
      playerRef.current = null;
    }
    setSpeakingId(null);
  }, []);

  useEffect(() => stopSpeaking, [stopSpeaking]);

  const speak = useCallback(
    async (id: string, text: string) => {
      if (speakingId === id) {
        stopSpeaking();
        return;
      }
      stopSpeaking();
      setSpeakingId(id);
      setNotice(null);

      try {
        const { audio } = await speakText(toSpeakable(text));
        const file = new File(Paths.cache, `assistant-reply-${Date.now()}.wav`);
        file.create({ overwrite: true });
        file.write(audio, { encoding: 'base64' });

        await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
        const player = createAudioPlayer({ uri: file.uri });
        playerRef.current = player;
        player.addListener('playbackStatusUpdate', (status: AudioStatus) => {
          if (status.didJustFinish) {
            player.remove();
            if (playerRef.current === player) {
              playerRef.current = null;
            }
            setSpeakingId((current) => (current === id ? null : current));
            try {
              file.delete();
            } catch {
              // cache file may already be gone
            }
          }
        });
        player.play();
      } catch (error) {
        setSpeakingId(null);
        setNotice(toApiErrorMessage(error, 'Voice reply is unavailable right now.'));
      }
    },
    [speakingId, stopSpeaking]
  );

  const send = useCallback(
    async (text: string, viaVoice = false) => {
      const content = text.trim();
      if (!content || sending) {
        return;
      }

      const userMessage: ListItem = { id: `u${Date.now()}`, role: 'user', content };
      const next = [...messages, userMessage];
      setMessages(next);
      setInput('');
      setNotice(null);
      setSending(true);

      try {
        // Error bubbles are local only; never send them back as conversation history.
        const history = next.filter((m) => !m.isError).map(({ role, content: c }) => ({ role, content: c }));
        const result = await sendAssistantMessage(history);
        const replyId = `a${Date.now()}`;
        setMessages((prev) => [...prev, { id: replyId, role: 'assistant', content: result.reply }]);

        // Tasks and habits are cached in AppContext; other modules reload when their screen opens.
        if (result.changed.includes('tasks')) {
          void fetchTasks(true);
        }
        if (result.changed.includes('habits')) {
          void fetchHabits(true);
        }

        // Talk back when the user talked.
        if (viaVoice) {
          void speak(replyId, result.reply);
        }
      } catch (error) {
        setMessages((prev) => [
          ...prev,
          {
            id: `e${Date.now()}`,
            role: 'assistant',
            content: toApiErrorMessage(error, 'The assistant could not answer. Please try again.'),
            isError: true,
          },
        ]);
      } finally {
        setSending(false);
      }
    },
    [messages, sending, fetchTasks, fetchHabits, speak]
  );

  const startRecording = useCallback(async () => {
    setNotice(null);
    stopSpeaking();
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        setNotice('Microphone permission is needed for voice messages.');
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setRecording(true);
    } catch (error) {
      console.warn('Could not start recording', error);
      setNotice('Could not start the microphone.');
    }
  }, [recorder, stopSpeaking]);

  const finishRecording = useCallback(
    async (shouldSend: boolean) => {
      setRecording(false);
      try {
        await recorder.stop();
        await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
        const uri = recorder.uri;
        if (!shouldSend || !uri) {
          return;
        }

        setTranscribing(true);
        const file = new File(uri);
        const audio = await file.base64();
        try {
          file.delete();
        } catch {
          // recording lives in the cache; the system cleans it up anyway
        }
        const text = await transcribeAudio(audio, VOICE_MIME_TYPE);
        setTranscribing(false);
        await send(text, true);
      } catch (error) {
        setNotice(toApiErrorMessage(error, 'Could not understand that recording. Please try again.'));
      } finally {
        setTranscribing(false);
      }
    },
    [recorder, send]
  );

  const busy = sending || transcribing;
  const canSend = !busy && !recording && input.trim().length > 0;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12} style={styles.back}>
          <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
        </Pressable>
        <Text style={styles.title}>Assistant</Text>
        <View style={styles.back} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}>
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.list}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <Ionicons name="happy" size={30} color={Colors.primary} />
              </View>
              <Text style={styles.emptyTitle}>Ask me anything about your day</Text>
              <Text style={styles.emptyText}>
                Type or tap the mic and speak in English, Urdu or Punjabi. I can add tasks, log medicines,
                habits, expenses and water, and answer from your own data.
              </Text>
              {SUGGESTIONS.map((s) => (
                <Pressable key={s} style={styles.chip} onPress={() => send(s)}>
                  <Text style={styles.chipText}>{s}</Text>
                </Pressable>
              ))}
            </View>
          }
          renderItem={({ item }) => (
            <View style={[styles.bubble, item.role === 'user' ? styles.userBubble : styles.botBubble]}>
              <Text
                style={[
                  styles.bubbleText,
                  item.role === 'user' && styles.userText,
                  item.isError && styles.errorText,
                ]}>
                {item.content}
              </Text>
              {item.role === 'assistant' && !item.isError ? (
                <Pressable
                  onPress={() => speak(item.id, item.content)}
                  hitSlop={8}
                  accessibilityLabel={speakingId === item.id ? 'Stop reading' : 'Read aloud'}
                  style={styles.speakButton}>
                  {speakingId === item.id ? (
                    <ActivityIndicator size="small" color={Colors.primary} />
                  ) : (
                    <Ionicons name="volume-high-outline" size={18} color={Colors.textSecondary} />
                  )}
                </Pressable>
              ) : null}
            </View>
          )}
          ListFooterComponent={
            busy ? (
              <View style={[styles.bubble, styles.botBubble, styles.typing]}>
                <ActivityIndicator size="small" color={Colors.primary} />
              </View>
            ) : undefined
          }
        />

        {notice ? <Text style={styles.notice}>{notice}</Text> : null}

        <View style={styles.inputRow}>
          {recording ? (
            <>
              <Pressable onPress={() => finishRecording(false)} style={styles.cancel} accessibilityLabel="Cancel">
                <Ionicons name="close" size={22} color={Colors.textSecondary} />
              </Pressable>
              <View style={styles.listening}>
                <Ionicons name="radio-button-on" size={14} color={Colors.error} />
                <Text style={styles.listeningText}>Listening… tap send when done</Text>
              </View>
              <Pressable onPress={() => finishRecording(true)} style={styles.send} accessibilityLabel="Send voice message">
                <Ionicons name="arrow-up" size={20} color={Colors.white} />
              </Pressable>
            </>
          ) : (
            <>
              <TextInput
                style={styles.input}
                value={input}
                onChangeText={setInput}
                placeholder="Message your assistant"
                placeholderTextColor={Colors.textHint}
                multiline
                maxLength={1000}
                editable={!busy}
              />
              {input.trim().length > 0 ? (
                <Pressable
                  onPress={() => send(input)}
                  disabled={!canSend}
                  style={[styles.send, !canSend && styles.sendDisabled]}>
                  <Ionicons name="arrow-up" size={20} color={Colors.white} />
                </Pressable>
              ) : (
                <Pressable
                  onPress={startRecording}
                  disabled={busy}
                  accessibilityLabel="Speak to the assistant"
                  style={[styles.send, busy && styles.sendDisabled]}>
                  <Ionicons name="mic" size={20} color={Colors.white} />
                </Pressable>
              )}
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bgLight },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '800', color: Colors.textPrimary },
  list: { padding: 16, paddingBottom: 8, flexGrow: 1 },
  empty: { alignItems: 'center', paddingTop: 32, gap: 10 },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.primarySurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: Colors.textPrimary },
  emptyText: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', marginBottom: 8 },
  chip: {
    alignSelf: 'stretch',
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderRadius: Radius.lg,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  chipText: { fontSize: 14, color: Colors.textPrimary, fontWeight: '600' },
  bubble: { maxWidth: '85%', borderRadius: 18, paddingVertical: 10, paddingHorizontal: 14, marginBottom: 8 },
  userBubble: { alignSelf: 'flex-end', backgroundColor: Colors.primary, borderBottomRightRadius: 4 },
  botBubble: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderBottomLeftRadius: 4,
  },
  typing: { paddingVertical: 12 },
  bubbleText: { fontSize: 15, lineHeight: 21, color: Colors.textPrimary },
  userText: { color: Colors.white },
  errorText: { color: Colors.error },
  speakButton: { alignSelf: 'flex-end', marginTop: 6 },
  notice: { color: Colors.error, fontSize: 13, paddingHorizontal: 16, paddingBottom: 6 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.borderSoft,
    backgroundColor: Colors.surfaceLight,
  },
  input: {
    flex: 1,
    maxHeight: 120,
    minHeight: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    backgroundColor: Colors.bgLight,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    fontSize: 15,
    color: Colors.textPrimary,
  },
  listening: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 22,
    backgroundColor: Colors.tintRose,
  },
  listeningText: { fontSize: 14, color: Colors.textPrimary, fontWeight: '600' },
  cancel: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  send: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendDisabled: { opacity: 0.4 },
});
