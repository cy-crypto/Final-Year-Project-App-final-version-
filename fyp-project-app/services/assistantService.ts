import { api, parseJsonData } from './api';

export type ChatRole = 'user' | 'assistant';

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

export type AssistantModule = 'tasks' | 'medications' | 'habits' | 'budget' | 'fitness' | 'weather' | 'prayer' | 'community';

export type AssistantReply = {
  reply: string;
  changed: AssistantModule[];
};

// The assistant call can run several tool rounds on the server, so allow more than the default 20s.
const ASSISTANT_TIMEOUT_MS = 60000;

export async function sendAssistantMessage(messages: ChatMessage[]): Promise<AssistantReply> {
  const response = await api.post('/api/assistant/chat/', { messages }, { timeout: ASSISTANT_TIMEOUT_MS });
  return parseJsonData<AssistantReply>(response.data);
}

export async function transcribeAudio(audioBase64: string, mimeType: string): Promise<string> {
  const response = await api.post(
    '/api/assistant/transcribe/',
    { audio: audioBase64, mime_type: mimeType },
    { timeout: ASSISTANT_TIMEOUT_MS }
  );
  return parseJsonData<{ text: string }>(response.data).text;
}

export async function speakText(text: string): Promise<{ audio: string; mimeType: string }> {
  const response = await api.post('/api/assistant/speak/', { text }, { timeout: ASSISTANT_TIMEOUT_MS });
  const data = parseJsonData<{ audio: string; mime_type: string }>(response.data);
  return { audio: data.audio, mimeType: data.mime_type };
}
