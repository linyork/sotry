import { useEffect, useState } from 'react';
import { X, RefreshCw } from 'lucide-react';
import { Settings } from '../types';
import { fetchModels, updateSettings } from '../api';

interface Props {
  settings: Settings;
  onClose: () => void;
  onSave: (s: Settings) => void;
  onOpenDb: () => void;
}

export function SettingsModal({ settings, onClose, onSave, onOpenDb }: Props) {
  const [models, setModels] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<Settings>({ ...settings });

  const loadModels = async () => {
    setLoading(true);
    try {
      const list = await fetchModels();
      setModels(list);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadModels();
  }, []);

  const handleSave = async () => {
    const saved = await updateSettings(form);
    onSave(saved);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-md mx-4 shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-lg font-semibold text-white">模型設定</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-400">可用模型</span>
            <button
              onClick={loadModels}
              className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
              重新整理
            </button>
          </div>

          <ModelSelect
            label="Director 模型"
            desc="決定下一個說話的角色與載入哪些 Block"
            value={form.director_model}
            models={models}
            onChange={(v) => setForm((f) => ({ ...f, director_model: v }))}
          />

          <ModelSelect
            label="Generator 模型"
            desc="實際產生角色或旁白的對話內容"
            value={form.generator_model}
            models={models}
            onChange={(v) => setForm((f) => ({ ...f, generator_model: v }))}
          />

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              連續 AI 輪次上限
            </label>
            <p className="text-xs text-gray-500 mb-2">超過後強制等待使用者輸入</p>
            <input
              type="number"
              min={1}
              max={10}
              value={form.max_consecutive_ai_turns}
              onChange={(e) => setForm((f) => ({ ...f, max_consecutive_ai_turns: e.target.value }))}
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Director 歷史視窗</label>
            <p className="text-xs text-gray-500 mb-2">Director 看到的最近對話條數</p>
            <input type="number" min={4} max={30} value={form.director_history_window}
              onChange={(e) => setForm((f) => ({ ...f, director_history_window: e.target.value }))}
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Generator 歷史視窗</label>
            <p className="text-xs text-gray-500 mb-2">Generator 看到的最近對話條數</p>
            <input type="number" min={4} max={40} value={form.generator_history_window}
              onChange={(e) => setForm((f) => ({ ...f, generator_history_window: e.target.value }))}
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">角色摘要行數（Director 用）</label>
            <p className="text-xs text-gray-500 mb-2">Director 每個角色 block 只看前幾行</p>
            <input type="number" min={2} max={20} value={form.director_char_summary_lines}
              onChange={(e) => setForm((f) => ({ ...f, director_char_summary_lines: e.target.value }))}
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">自動摘要間隔（條訊息）</label>
            <p className="text-xs text-gray-500 mb-2">累積幾條訊息後自動更新 plot block</p>
            <input type="number" min={10} max={100} value={form.summarize_every}
              onChange={(e) => setForm((f) => ({ ...f, summarize_every: e.target.value }))}
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500" />
          </div>

        <div className="flex gap-2 p-4 border-t border-gray-700">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 text-sm text-gray-400 hover:text-white border border-gray-600 rounded-lg transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            className="flex-1 px-4 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors"
          >
            儲存
          </button>
        </div>

        <div className="px-4 pb-4 text-center">
          <button
            onClick={onOpenDb}
            className="text-xs text-gray-500 hover:text-indigo-400 transition-colors underline underline-offset-2"
          >
            查看資料庫
          </button>
        </div>
      </div>
    </div>
  );
}

function ModelSelect({
  label,
  desc,
  value,
  models,
  onChange,
}: {
  label: string;
  desc: string;
  value: string;
  models: string[];
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-300 mb-1">{label}</label>
      <p className="text-xs text-gray-500 mb-2">{desc}</p>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
      >
        <option value="">-- 選擇模型 --</option>
        {models.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
    </div>
  );
}
