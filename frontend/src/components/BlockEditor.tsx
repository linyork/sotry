import { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { Block } from '../types';
import { createBlock, updateBlock } from '../api';

interface Props {
  block?: Block | null;
  defaultType?: Block['type'];
  allBlocks: Block[];
  onSave: (block: Block) => void;
  onClose: () => void;
}

const TYPE_LABELS: Record<Block['type'], string> = {
  timespace: '時空背景',
  plot: '當前劇情',
  location: '地點',
  character: '角色',
  response_style: '回復風格',
  other: '其他設定',
};

const SINGLE_TYPES: Block['type'][] = ['timespace', 'plot'];

export function BlockEditor({ block, defaultType = 'other', allBlocks, onSave, onClose }: Props) {
  const isEdit = !!block;
  const [name, setName] = useState(block?.name ?? '');
  const [type, setType] = useState<Block['type']>(block?.type ?? defaultType);
  const [content, setContent] = useState(block?.content ?? '');
  const [parentIds, setParentIds] = useState<number[]>(block?.parent_ids ?? []);
  const [isPlayer, setIsPlayer] = useState<boolean>(block?.is_player === 1 ?? false);
  const [forCharacter, setForCharacter] = useState<boolean>(block?.for_character === 1 ?? false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const textareaFocused = useRef(false);

  useEffect(() => {
    if (block) {
      setName(block.name);
      setType(block.type);
      setContent(block.content);
      setParentIds(block.parent_ids ?? []);
      setIsPlayer(block.is_player === 1);
      setForCharacter(block.for_character === 1);
    }
  }, [block]);

  // ESC to close, Enter to save (when not in textarea)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'Enter' && !textareaFocused.current && !e.shiftKey) {
        // Don't trigger if focus is inside a textarea or select
        const tag = (e.target as HTMLElement).tagName;
        if (tag !== 'TEXTAREA' && tag !== 'SELECT') {
          e.preventDefault();
          handleSave();
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  });

  const eligibleParents = allBlocks.filter(
    (b) => b.type !== 'response_style' && (!isEdit || b.id !== block!.id)
  );

  const toggleParent = (id: number) => {
    setParentIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  const handleSave = async () => {
    if (!name.trim()) { setError('請輸入名稱'); return; }
    setSaving(true);
    setError('');
    try {
      let saved: Block;
      if (isEdit) {
        saved = await updateBlock(block!.id, {
          name,
          content,
          parent_ids: parentIds,
          is_player: isPlayer ? 1 : 0,
          for_character: forCharacter ? 1 : 0,
        } as Partial<Block> & { parent_ids: number[] });
      } else {
        saved = await createBlock({
          name,
          type,
          content,
          parent_ids: parentIds,
          parent_id: null,
          is_player: isPlayer ? 1 : 0,
          for_character: forCharacter ? 1 : 0,
        } as Omit<Block, 'id' | 'created_at' | 'updated_at'> & { parent_ids: number[] });
      }
      onSave(saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : '儲存失敗');
    } finally {
      setSaving(false);
    }
  };

  // Group eligible parents by type for display
  const groupedParents: Array<{ type: Block['type']; label: string; blocks: Block[] }> = [];
  const typeOrder: Block['type'][] = ['timespace', 'plot', 'location', 'character', 'other'];
  for (const t of typeOrder) {
    const bs = eligibleParents.filter((b) => b.type === t);
    if (bs.length > 0) groupedParents.push({ type: t, label: TYPE_LABELS[t], blocks: bs });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-3xl shadow-2xl flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700 shrink-0">
          <h2 className="text-lg font-semibold text-white">{isEdit ? '編輯區塊' : '新增區塊'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          {/* Type selector (new only) */}
          {!isEdit && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">類型</label>
              <div className="grid grid-cols-3 gap-2">
                {(Object.keys(TYPE_LABELS) as Block['type'][]).map((t) => {
                  const isDisabled = SINGLE_TYPES.includes(t) && allBlocks.some((b) => b.type === t);
                  return (
                    <button
                      key={t}
                      onClick={() => setType(t)}
                      disabled={isDisabled}
                      className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                        type === t ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                      } disabled:opacity-30 disabled:cursor-not-allowed`}
                    >
                      {TYPE_LABELS[t]}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">名稱</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={
                type === 'character' ? '蕭峰' :
                type === 'location' ? '少林寺' :
                type === 'timespace' ? '北宋武俠世界' :
                type === 'plot' ? '當前劇情' : '境界規則'
              }
              autoFocus
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Content */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">內容</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onFocus={() => { textareaFocused.current = true; }}
              onBlur={() => { textareaFocused.current = false; }}
              rows={10}
              placeholder="在這裡描述這個區塊的設定內容，會直接作為 prompt 送給 LLM..."
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500 resize-none"
            />
          </div>

          {/* is_player checkbox (character only) */}
          {type === 'character' && (
            <div
              className={`flex items-start gap-3 rounded-lg border px-4 py-3 cursor-pointer transition-colors ${
                isPlayer ? 'bg-sky-900/30 border-sky-600' : 'bg-gray-800/50 border-gray-700 hover:border-gray-500'
              }`}
              onClick={() => setIsPlayer((v) => !v)}
            >
              <div className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                isPlayer ? 'bg-sky-500 border-sky-500' : 'border-gray-500'
              }`}>
                {isPlayer && (
                  <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                    <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </div>
              <div>
                <p className={`text-sm font-medium ${isPlayer ? 'text-sky-300' : 'text-gray-300'}`}>主角（玩家角色）</p>
                <p className="text-xs text-gray-500 mt-0.5">此角色設定會作為 LLM 背景資訊，但 AI 永遠不會代替此角色說話</p>
              </div>
            </div>
          )}

          {/* for_character toggle (response_style only) */}
          {type === 'response_style' && (
            <div
              className={`flex items-start gap-3 rounded-lg border px-4 py-3 cursor-pointer transition-colors ${
                forCharacter ? 'bg-pink-900/30 border-pink-600' : 'bg-gray-800/50 border-gray-700 hover:border-gray-500'
              }`}
              onClick={() => setForCharacter((v) => !v)}
            >
              <div className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                forCharacter ? 'bg-pink-500 border-pink-500' : 'border-gray-500'
              }`}>
                {forCharacter && (
                  <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                    <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </div>
              <div>
                <p className={`text-sm font-medium ${forCharacter ? 'text-pink-300' : 'text-gray-300'}`}>
                  {forCharacter ? '作用於角色說話時' : '作用於旁白說話時'}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {forCharacter ? '任何角色說話時自動載入此風格' : '旁白敘述時自動載入此風格'}
                </p>
              </div>
            </div>
          )}

          {/* Multi-select parent blocks (not for response_style) */}
          {type !== 'response_style' && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">從屬區塊（Parents）</label>
              <p className="text-xs text-gray-500 mb-2">載入此區塊時自動在前面插入所有選取的 Parent，支援多層 DAG</p>
              {eligibleParents.length === 0 ? (
                <p className="text-xs text-gray-600 italic px-1">（尚無可選的區塊）</p>
              ) : (
                <div className="bg-gray-800 border border-gray-600 rounded-lg overflow-hidden max-h-52 overflow-y-auto">
                  {groupedParents.map(({ type: gt, label, blocks }) => (
                    <div key={gt}>
                      <div className="px-3 py-1.5 bg-gray-750 border-b border-gray-700 sticky top-0 bg-gray-800">
                        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{label}</span>
                      </div>
                      {blocks.map((b) => {
                        const checked = parentIds.includes(b.id);
                        return (
                          <label
                            key={b.id}
                            className={`flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors hover:bg-gray-700/60 ${
                              checked ? 'bg-indigo-900/20' : ''
                            }`}
                          >
                            <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                              checked ? 'bg-indigo-500 border-indigo-500' : 'border-gray-500'
                            }`}>
                              {checked && (
                                <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                                  <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                              )}
                            </div>
                            <input
                              type="checkbox"
                              className="sr-only"
                              checked={checked}
                              onChange={() => toggleParent(b.id)}
                            />
                            <span className={`text-sm ${checked ? 'text-indigo-200' : 'text-gray-300'}`}>{b.name}</span>
                          </label>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}
              {parentIds.length > 0 && (
                <p className="text-xs text-indigo-400 mt-1.5">
                  已選 {parentIds.length} 個：{parentIds.map((pid) => allBlocks.find((b) => b.id === pid)?.name ?? pid).join('、')}
                </p>
              )}
            </div>
          )}

          {error && (
            <p className="text-red-400 text-sm bg-red-900/20 border border-red-800 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-6 py-4 border-t border-gray-700 shrink-0">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 text-sm text-gray-400 hover:text-white border border-gray-600 rounded-lg transition-colors"
          >
            取消 <span className="text-xs text-gray-600 ml-1">ESC</span>
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 px-4 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg transition-colors"
          >
            {saving ? '儲存中...' : <>儲存 <span className="text-xs text-indigo-300 ml-1">Enter</span></>}
          </button>
        </div>
      </div>
    </div>
  );
}
