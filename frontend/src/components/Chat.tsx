import { useEffect, useRef, useState } from 'react';
import { Send, Loader2, Clapperboard, BookOpen, Trash2, RefreshCw } from 'lucide-react';
import { ChatMessage, DirectorDecision } from '../types';
import { startChat, clearMessages, summarizeConversation } from '../api';
import { GeneratorDebugOverlay, DirectorDebugOverlay } from './DebugOverlay';

interface Props {
  conversationId: number | null;
  messages: ChatMessage[];
  onMessagesChange: (msgs: ChatMessage[]) => void;
  isGenerating: boolean;
  onGeneratingChange: (v: boolean) => void;
  onClear?: () => void;
}

const SPEAKER_COLORS: Record<string, string> = {};
const PALETTE = ['text-sky-400', 'text-emerald-400', 'text-amber-400', 'text-rose-400', 'text-violet-400', 'text-orange-400'];
let colorIdx = 0;

function getSpeakerColor(speaker: string): string {
  if (speaker === 'narrator') return 'text-gray-400';
  if (!SPEAKER_COLORS[speaker]) { SPEAKER_COLORS[speaker] = PALETTE[colorIdx % PALETTE.length]; colorIdx++; }
  return SPEAKER_COLORS[speaker];
}

type DebugState =
  | { type: 'generator'; msgId: number; speaker: string }
  | { type: 'director'; msgId: number; decisions?: DirectorDecision[] }
  | null;

export function Chat({ conversationId, messages, onMessagesChange, isGenerating, onGeneratingChange, onClear }: Props) {
  const [input, setInput] = useState('');
  const [debug, setDebug] = useState<DebugState>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [fallbackWarning, setFallbackWarning] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<ChatMessage[]>(messages);

  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const updateMessages = (updater: (msgs: ChatMessage[]) => ChatMessage[]) => {
    const updated = updater(messagesRef.current);
    messagesRef.current = updated;
    onMessagesChange([...updated]);
  };

  const send = () => {
    const text = input.trim();
    if (!text || isGenerating || !conversationId) return;
    setInput('');
    onGeneratingChange(true);

    const userMsg: ChatMessage = { id: `user-${Date.now()}`, role: 'user', content: text };
    updateMessages((msgs) => [...msgs, userMsg]);

    let streamingId = '';

    startChat(text, conversationId, [...messagesRef.current].filter((m) => !m.isStreaming).map((m) => ({ role: m.role, content: m.content, speaker: m.speaker })), {
      onUserSaved: (id) => {
        updateMessages((msgs) => msgs.map((m) => m.id === userMsg.id ? { ...m, dbId: id } : m));
      },
      onDirector: (speaker, resolvedBlocks) => {
        if (speaker !== 'waitForUser') {
          streamingId = `ai-${Date.now()}-${Math.random()}`;
          updateMessages((msgs) => [...msgs, {
            id: streamingId, role: 'assistant', content: '', speaker, isStreaming: true, resolvedBlocks,
          }]);
        }
      },
      onToken: (token) => {
        updateMessages((msgs) => msgs.map((m) => m.id === streamingId ? { ...m, content: m.content + token } : m));
      },
      onDone: (id, content, speaker, resolvedBlocks) => {
        updateMessages((msgs) => msgs.map((m) =>
          m.id === streamingId ? { ...m, dbId: id ?? undefined, content, speaker, isStreaming: false, resolvedBlocks } : m
        ));
        streamingId = '';
      },
      onDirectorDone: (decisions) => {
        // Attach director decisions to the user message
        updateMessages((msgs) => msgs.map((m) =>
          m.id === userMsg.id ? { ...m, directorDecisions: decisions } : m
        ));
      },
      onWaitForUser: () => {
        updateMessages((msgs) => msgs.filter((m) => !(m.isStreaming && m.content === '')));
        onGeneratingChange(false);
      },
      onDirectorFallback: (msg) => {
        setFallbackWarning(msg);
        setTimeout(() => setFallbackWarning(null), 5000);
      },
      onError: (msg) => {
        updateMessages((msgs) => msgs.map((m) =>
          m.id === streamingId ? { ...m, content: `[錯誤] ${msg}`, isStreaming: false } : m
        ));
        onGeneratingChange(false);
      },
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const handleSummarize = async () => {
    if (!conversationId || isSummarizing) return;
    setIsSummarizing(true);
    try {
      await summarizeConversation(conversationId);
    } finally {
      setIsSummarizing(false);
    }
  };

  const handleClear = async () => {
    if (!conversationId) return;
    await clearMessages(conversationId);
    onMessagesChange([]);
    messagesRef.current = [];
    setConfirmClear(false);
    onClear?.();
  };

  return (
    <div className="flex flex-col flex-1 min-w-0 h-screen">
      <div className="flex items-center px-4 py-3 border-b border-gray-800 shrink-0">
        <span className="text-sm text-gray-500">Director 自動選取 Block</span>
        <div className="flex items-center gap-2 ml-auto">
          {fallbackWarning && (
            <span className="text-xs text-amber-400 bg-amber-400/10 px-2 py-1 rounded-lg">{fallbackWarning}</span>
          )}
          {isGenerating && (
            <div className="flex items-center gap-1.5 text-indigo-400 text-sm">
              <Loader2 size={14} className="animate-spin" />
              <span>生成中...</span>
            </div>
          )}
          {conversationId && (
            <button onClick={handleSummarize} disabled={isSummarizing || isGenerating} title="更新劇情摘要"
              className="p-1.5 text-gray-600 hover:text-teal-400 hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-30">
              <RefreshCw size={16} className={isSummarizing ? 'animate-spin' : ''} />
            </button>
          )}
          {conversationId && (
            <button onClick={() => setConfirmClear(true)} title="清除對話紀錄"
              className="p-1.5 text-gray-600 hover:text-red-400 hover:bg-gray-800 rounded-lg transition-colors">
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center text-gray-600 mt-20">
            <p className="text-lg mb-2">開始你的故事</p>
            <p className="text-sm">在左側建立 Block，或直接開始對話</p>
          </div>
        )}
        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            onDirectorDebug={msg.role === 'user' && msg.dbId
              ? () => setDebug({ type: 'director', msgId: msg.dbId!, decisions: msg.directorDecisions })
              : undefined}
            onGeneratorDebug={msg.role === 'assistant' && msg.dbId
              ? () => setDebug({ type: 'generator', msgId: msg.dbId!, speaker: msg.speaker || 'narrator' })
              : undefined}
          />
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="p-4 border-t border-gray-800 shrink-0">
        <div className="flex gap-2 items-end">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            placeholder={conversationId ? 'Enter 送出，Shift+Enter 換行' : '載入中...'}
            disabled={isGenerating || !conversationId}
            className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-indigo-500 resize-none disabled:opacity-50 transition-colors"
            style={{ minHeight: '42px', maxHeight: '120px' }}
            onInput={(e) => {
              const el = e.currentTarget;
              el.style.height = 'auto';
              el.style.height = Math.min(el.scrollHeight, 120) + 'px';
            }}
          />
          <button onClick={send} disabled={!input.trim() || isGenerating || !conversationId}
            className="flex items-center justify-center w-10 h-10 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 rounded-xl transition-colors shrink-0">
            <Send size={16} className="text-white" />
          </button>
        </div>
      </div>

      {debug?.type === 'generator' && (
        <GeneratorDebugOverlay msgId={debug.msgId} speaker={debug.speaker} onClose={() => setDebug(null)} />
      )}
      {debug?.type === 'director' && (
        <DirectorDebugOverlay msgId={debug.msgId} cachedDecisions={debug.decisions} onClose={() => setDebug(null)} />
      )}
      {confirmClear && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={() => setConfirmClear(false)}>
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 mx-4 shadow-2xl max-w-sm w-full flex flex-col gap-4"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 text-red-400">
              <Trash2 size={20} />
              <h2 className="text-base font-semibold text-white">清除對話紀錄</h2>
            </div>
            <p className="text-sm text-gray-400">確定要刪除所有對話訊息與 LLM 送出紀錄嗎？Block 不受影響。</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setConfirmClear(false)}
                className="px-4 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors">
                取消
              </button>
              <button onClick={handleClear}
                className="px-4 py-2 text-sm bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors">
                確定清除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MessageBubble({ message, onDirectorDebug, onGeneratorDebug }: {
  message: ChatMessage;
  onDirectorDebug?: () => void;
  onGeneratorDebug?: () => void;
}) {
  const isUser = message.role === 'user';

  if (isUser) {
    return (
      <div className="flex justify-end items-center gap-2">
        {/* Director debug button — left of user bubble */}
        {onDirectorDebug ? (
          <button onClick={onDirectorDebug} title="查看 Director 決策"
            className="shrink-0 p-1.5 text-gray-600 hover:text-indigo-400 hover:bg-gray-800 rounded-lg transition-colors">
            <Clapperboard size={14} />
          </button>
        ) : <div className="w-7 shrink-0" />}
        <div className="max-w-[75%] bg-indigo-600 text-white rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm">
          {message.content}
        </div>
      </div>
    );
  }

  const isNarrator = message.speaker === 'narrator';

  return (
    <div className="flex items-start gap-1">
      <div className="flex flex-col gap-1 max-w-[83%]">
        {message.speaker && (
          <span className={`text-xs font-medium px-1 ${getSpeakerColor(message.speaker)}`}>
            {isNarrator ? '旁白' : message.speaker}
          </span>
        )}
        <div className={`rounded-2xl rounded-tl-sm px-4 py-2.5 text-sm text-gray-100 whitespace-pre-wrap ${isNarrator ? 'bg-gray-800/60 italic text-gray-400' : 'bg-gray-800'}`}>
          {message.content}
          {message.isStreaming && (
            <span className="inline-block w-0.5 h-4 bg-gray-400 animate-pulse ml-0.5 align-middle" />
          )}
        </div>
      </div>
      {/* Generator debug button — right of AI bubble */}
      {onGeneratorDebug ? (
        <button onClick={onGeneratorDebug} title="查看 Generator 送出內容"
          className="shrink-0 mt-5 p-1.5 text-gray-600 hover:text-emerald-400 hover:bg-gray-800 rounded-lg transition-colors">
          <BookOpen size={14} />
        </button>
      ) : <div className="w-7 shrink-0" />}
    </div>
  );
}
