import { Block, Settings, ChatMessage, Conversation, GeneratorDebugInfo, DirectorDebugInfo } from '../types';

const BASE = '/api';

export async function fetchBlocks(): Promise<Block[]> {
  const res = await fetch(`${BASE}/blocks`);
  return res.json();
}

export async function createBlock(block: Omit<Block, 'id' | 'created_at' | 'updated_at'>): Promise<Block> {
  const res = await fetch(`${BASE}/blocks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(block),
  });
  if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Failed'); }
  return res.json();
}

export async function updateBlock(id: number, data: Partial<Block>): Promise<Block> {
  const res = await fetch(`${BASE}/blocks/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Failed'); }
  return res.json();
}

export async function deleteBlock(id: number): Promise<void> {
  await fetch(`${BASE}/blocks/${id}`, { method: 'DELETE' });
}

export async function fetchModels(): Promise<string[]> {
  const res = await fetch(`${BASE}/models`);
  if (!res.ok) return [];
  return res.json();
}

export async function fetchSettings(): Promise<Settings> {
  const res = await fetch(`${BASE}/settings`);
  return res.json();
}

export async function updateSettings(data: Partial<Settings>): Promise<Settings> {
  const res = await fetch(`${BASE}/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function fetchConversations(): Promise<Conversation[]> {
  const res = await fetch(`${BASE}/conversations`);
  return res.json();
}

export async function createConversation(title?: string): Promise<Conversation> {
  const res = await fetch(`${BASE}/conversations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: title || '新對話' }),
  });
  return res.json();
}

export async function deleteConversation(id: number): Promise<void> {
  await fetch(`${BASE}/conversations/${id}`, { method: 'DELETE' });
}

export async function clearMessages(conversationId: number): Promise<void> {
  await fetch(`${BASE}/conversations/${conversationId}/messages`, { method: 'DELETE' });
}

export async function fetchMessages(conversationId: number): Promise<ChatMessage[]> {
  const res = await fetch(`${BASE}/conversations/${conversationId}/messages`);
  const rows = await res.json() as Array<{
    id: number;
    role: 'user' | 'assistant';
    content: string;
    speaker?: string;
    sent_blocks?: string;
    director_decisions?: string;
  }>;
  return rows.map((r) => ({
    id: `db-${r.id}`,
    dbId: r.id,
    role: r.role,
    content: r.content,
    speaker: r.speaker ?? undefined,
    resolvedBlocks: r.sent_blocks ? JSON.parse(r.sent_blocks).map((b: { id: number; name: string; type: string }) => ({ id: b.id, name: b.name, type: b.type })) : undefined,
    directorDecisions: r.director_decisions ? JSON.parse(r.director_decisions) : undefined,
  }));
}

export async function fetchGeneratorDebug(msgId: number): Promise<GeneratorDebugInfo> {
  const res = await fetch(`${BASE}/conversations/messages/${msgId}/debug`);
  return res.json();
}

export async function fetchDirectorDebug(msgId: number): Promise<DirectorDebugInfo> {
  const res = await fetch(`${BASE}/conversations/messages/${msgId}/director`);
  return res.json();
}

export async function summarizeConversation(conversationId: number): Promise<{ success: boolean; content: string }> {
  const res = await fetch(`${BASE}/conversations/${conversationId}/summarize`, { method: 'POST' });
  if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Summarize failed'); }
  return res.json();
}

export interface ChatCallbacks {
  onUserSaved: (id: number) => void;
  onDirector: (speaker: string, resolvedBlocks: Array<{ id: number; name: string; type: string }>) => void;
  onToken: (token: string) => void;
  onDone: (id: number | null, content: string, speaker: string, resolvedBlocks: Array<{ id: number; name: string; type: string }>) => void;
  onDirectorDone: (decisions: Array<{ speaker: string; selectedBlockIds: number[]; resolvedBlocks: Array<{ id: number; name: string; type: string }> }>) => void;
  onWaitForUser: () => void;
  onDirectorFallback: (msg: string) => void;
  onError: (msg: string) => void;
}

export function startChat(
  message: string,
  conversationId: number,
  history: Array<Pick<ChatMessage, 'role' | 'content' | 'speaker'>>,
  callbacks: ChatCallbacks
): () => void {
  const controller = new AbortController();

  fetch(`${BASE}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, conversationId, history }),
    signal: controller.signal,
  })
    .then(async (res) => {
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let currentEvent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (currentEvent === 'user_saved') callbacks.onUserSaved(data.id);
              else if (currentEvent === 'director') callbacks.onDirector(data.speaker, data.resolvedBlocks || []);
              else if (currentEvent === 'token') callbacks.onToken(data.content);
              else if (currentEvent === 'done') callbacks.onDone(data.id, data.content, data.speaker, data.resolvedBlocks || []);
              else if (currentEvent === 'director_done') callbacks.onDirectorDone(data.decisions || []);
              else if (currentEvent === 'wait_for_user') callbacks.onWaitForUser();
              else if (currentEvent === 'director_fallback') callbacks.onDirectorFallback(data.message);
              else if (currentEvent === 'error') callbacks.onError(data.message);
            } catch { /* skip */ }
            currentEvent = '';
          }
        }
      }
    })
    .catch((err) => { if (err.name !== 'AbortError') callbacks.onError(err.message); });

  return () => controller.abort();
}
