import { useState, useEffect } from 'react';
import { X, Loader2 } from 'lucide-react';
import { fetchGeneratorDebug, fetchDirectorDebug } from '../api';
import { GeneratorDebugInfo, DirectorDebugInfo, DirectorDecision } from '../types';

const TYPE_LABELS: Record<string, string> = {
  timespace: '時空背景', plot: '當前劇情', location: '地點',
  character: '角色', other: '其他設定',
};

const TYPE_COLORS: Record<string, string> = {
  timespace: 'bg-purple-900/40 border-purple-700 text-purple-300',
  plot: 'bg-teal-900/40 border-teal-700 text-teal-300',
  location: 'bg-emerald-900/40 border-emerald-700 text-emerald-300',
  character: 'bg-sky-900/40 border-sky-700 text-sky-300',
  other: 'bg-amber-900/40 border-amber-700 text-amber-300',
};

// ── Generator overlay ────────────────────────────────────────────────────────

interface GeneratorProps {
  msgId: number;
  speaker: string;
  onClose: () => void;
}

export function GeneratorDebugOverlay({ msgId, speaker, onClose }: GeneratorProps) {
  const [info, setInfo] = useState<GeneratorDebugInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'blocks' | 'prompt'>('blocks');

  useEffect(() => {
    fetchGeneratorDebug(msgId).then(setInfo).finally(() => setLoading(false));
  }, [msgId]);

  return (
    <Overlay title={`Generator 送出內容 — ${speaker === 'narrator' ? '旁白' : speaker}`} onClose={onClose}>
      <div className="flex gap-1 px-4 pt-3 shrink-0">
        <Tab active={tab === 'blocks'} onClick={() => setTab('blocks')}>
          Block ({info?.sentBlocks.length ?? '…'})
        </Tab>
        <Tab active={tab === 'prompt'} onClick={() => setTab('prompt')}>
          Prompt
        </Tab>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loading && <LoadingSpinner />}

        {!loading && info && tab === 'blocks' && (
          info.sentBlocks.length === 0
            ? <Empty text="沒有送出任何 Block" />
            : info.sentBlocks.map((b) => (
              <div key={b.id} className={`rounded-lg border p-3 text-sm ${TYPE_COLORS[b.type] || 'bg-gray-800 border-gray-700 text-gray-300'}`}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-semibold opacity-70">{TYPE_LABELS[b.type] || b.type}</span>
                  <span className="font-medium">{b.name}</span>
                </div>
                <pre className="whitespace-pre-wrap text-xs opacity-80 font-mono leading-relaxed">{b.content || '（無內容）'}</pre>
              </div>
            ))
        )}

        {!loading && info && tab === 'prompt' && (
          info.generatorPrompt
            ? <pre className="whitespace-pre-wrap text-xs text-gray-300 font-mono leading-relaxed bg-gray-800 rounded-lg p-4 border border-gray-700">{info.generatorPrompt}</pre>
            : <Empty text="無 Prompt 紀錄（舊訊息不支援）" />
        )}
      </div>
    </Overlay>
  );
}

// ── Director overlay ─────────────────────────────────────────────────────────

interface DirectorProps {
  msgId: number;
  cachedDecisions?: DirectorDecision[];
  onClose: () => void;
}

export function DirectorDebugOverlay({ msgId, cachedDecisions, onClose }: DirectorProps) {
  const [info, setInfo] = useState<DirectorDebugInfo | null>(
    cachedDecisions ? { decisions: cachedDecisions, directorPrompts: [] } : null
  );
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'blocks' | 'prompt'>('blocks');

  useEffect(() => {
    fetchDirectorDebug(msgId)
      .then((data) => setInfo((prev) => ({
        decisions: data.decisions.length > 0 ? data.decisions : (prev?.decisions ?? []),
        directorPrompts: data.directorPrompts,
      })))
      .finally(() => setLoading(false));
  }, [msgId]);

  const decisions = info?.decisions ?? [];
  const directorPrompts = info?.directorPrompts ?? [];

  return (
    <Overlay title="Director 決策" onClose={onClose}>
      <div className="flex gap-1 px-4 pt-3 shrink-0">
        <Tab active={tab === 'blocks'} onClick={() => setTab('blocks')}>
          Block
        </Tab>
        <Tab active={tab === 'prompt'} onClick={() => setTab('prompt')}>
          Prompt ({directorPrompts.length})
        </Tab>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {loading && <LoadingSpinner />}

        {!loading && tab === 'blocks' && (
          <>
            {decisions.length === 0 && <Empty text="無 Director 紀錄" />}
            {decisions.map((d, i) => (
              <div key={i} className="rounded-xl border border-gray-700 bg-gray-800/50 overflow-hidden">
                <div className="px-4 py-2.5 border-b border-gray-700 flex items-center gap-3">
                  <span className="text-xs text-gray-500">第 {i + 1} 輪</span>
                  <span className="font-semibold text-white">
                    {d.speaker === 'narrator' ? '旁白' : d.speaker}
                  </span>
                  {d.speaker === 'narrator' && (
                    <span className="text-xs bg-gray-700 text-gray-400 px-2 py-0.5 rounded">不使用角色區塊</span>
                  )}
                </div>
                <div className="p-3 space-y-1.5">
                  <p className="text-xs text-gray-500 mb-2">載入的 Block：</p>
                  {d.resolvedBlocks.length === 0 && <p className="text-xs text-gray-600 italic">（無 Block）</p>}
                  {d.resolvedBlocks.map((b) => (
                    <div key={b.id} className={`flex items-center gap-2 text-xs px-2.5 py-1.5 rounded-lg border ${TYPE_COLORS[b.type] || 'bg-gray-700 border-gray-600 text-gray-300'}`}>
                      <span className="opacity-60">{TYPE_LABELS[b.type] || b.type}</span>
                      <span className="font-medium">{b.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}

        {!loading && tab === 'prompt' && (
          directorPrompts.length === 0
            ? <Empty text="無 Prompt 紀錄（舊訊息不支援）" />
            : directorPrompts.map((p, i) => (
              <div key={i} className="rounded-xl border border-gray-700 bg-gray-800/50 overflow-hidden">
                <div className="px-4 py-2 border-b border-gray-700">
                  <span className="text-xs text-gray-500">第 {i + 1} 輪 Director Prompt</span>
                </div>
                <pre className="whitespace-pre-wrap text-xs text-gray-300 font-mono leading-relaxed p-4">{p}</pre>
              </div>
            ))
        )}
      </div>
    </Overlay>
  );
}

// ── Shared UI ────────────────────────────────────────────────────────────────

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${active ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}
    >
      {children}
    </button>
  );
}

function Overlay({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-2xl mx-4 shadow-2xl max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-gray-700 shrink-0">
          <h2 className="text-base font-semibold text-white">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function LoadingSpinner() {
  return (
    <div className="flex items-center gap-2 text-gray-400 justify-center py-8">
      <Loader2 size={16} className="animate-spin" />
      <span className="text-sm">載入中...</span>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="text-gray-500 text-sm text-center py-4">{text}</p>;
}
