import { useEffect, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { Chat } from './components/Chat';
import { SettingsModal } from './components/SettingsModal';
import { Block, ChatMessage, Settings } from './types';
import { fetchBlocks, fetchSettings, fetchConversations, createConversation, fetchMessages } from './api';

const DEFAULT_SETTINGS: Settings = {
  director_model: '',
  generator_model: '',
  max_consecutive_ai_turns: '3',
  director_history_window: '12',
  generator_history_window: '20',
  summarize_every: '20',
  director_char_summary_lines: '4',
};

export default function App() {
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [showSettings, setShowSettings] = useState(false);
  const [showDb, setShowDb] = useState(false);
  const [conversationId, setConversationId] = useState<number | null>(null);

  useEffect(() => {
    const init = async () => {
      const [loadedBlocks, loadedSettings] = await Promise.all([fetchBlocks(), fetchSettings()]);
      setBlocks(loadedBlocks);
      setSettings(loadedSettings);

      const convs = await fetchConversations();
      const conv = convs[0] ?? (await createConversation('預設對話'));
      setConversationId(conv.id);
      setMessages(await fetchMessages(conv.id));
    };
    init();
  }, []);

  return (
    <div className="flex h-screen bg-gray-950 text-gray-100 overflow-hidden">
      <Sidebar
        blocks={blocks}
        onBlocksChange={setBlocks}
        onOpenSettings={() => setShowSettings(true)}
        onGoHome={() => setShowDb(false)}
      />

      {showDb ? (
        <iframe src="/db" className="flex-1 h-screen border-0" title="DB UI" />
      ) : (
        <Chat
          conversationId={conversationId}
          messages={messages}
          onMessagesChange={setMessages}
          isGenerating={isGenerating}
          onGeneratingChange={setIsGenerating}
        />
      )}

      {showSettings && (
        <SettingsModal
          settings={settings}
          onClose={() => setShowSettings(false)}
          onSave={setSettings}
          onOpenDb={() => { setShowDb(true); setShowSettings(false); }}
        />
      )}
    </div>
  );
}
