import { useState } from 'react';
import { Plus, Edit2, Trash2, ChevronDown, ChevronRight, Settings } from 'lucide-react';
import { Block } from '../types';
import { BlockEditor } from './BlockEditor';
import { deleteBlock } from '../api';

interface Props {
  blocks: Block[];
  onBlocksChange: (blocks: Block[]) => void;
  onOpenSettings: () => void;
  onGoHome: () => void;
}

type SectionType = Block['type'];

const SECTION_CONFIG: Array<{ type: SectionType; label: string; color: string; badge?: string }> = [
  { type: 'timespace', label: '時空背景', color: 'text-purple-400', badge: '必載' },
  { type: 'plot', label: '當前劇情', color: 'text-teal-400', badge: '必載' },
  { type: 'location', label: '地點', color: 'text-emerald-400' },
  { type: 'character', label: '角色', color: 'text-sky-400' },
  { type: 'response_style', label: '回復風格', color: 'text-pink-400', badge: '依說話者' },
  { type: 'other', label: '其他設定', color: 'text-amber-400' },
];

const SINGLE_TYPES: SectionType[] = ['timespace', 'plot'];

export function Sidebar({ blocks, onBlocksChange, onOpenSettings, onGoHome }: Props) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [editingBlock, setEditingBlock] = useState<Block | null | undefined>(undefined);
  const [addingType, setAddingType] = useState<SectionType | null>(null);

  const toggleSection = (type: SectionType) =>
    setCollapsed((prev) => ({ ...prev, [type]: !prev[type] }));

  const handleDelete = async (block: Block) => {
    if (!confirm(`確定刪除「${block.name}」？`)) return;
    await deleteBlock(block.id);
    onBlocksChange(blocks.filter((b) => b.id !== block.id));
  };

  const handleSaved = (saved: Block) => {
    const exists = blocks.find((b) => b.id === saved.id);
    onBlocksChange(exists ? blocks.map((b) => (b.id === saved.id ? saved : b)) : [...blocks, saved]);
    setEditingBlock(undefined);
    setAddingType(null);
  };

  const parentName = (block: Block) =>
    block.parent_id ? (blocks.find((b) => b.id === block.parent_id)?.name ?? null) : null;

  const responseStyleTarget = (block: Block) =>
    block.type === 'response_style'
      ? (block.for_character ? '角色' : '旁白')
      : null;

  return (
    <aside className="w-72 shrink-0 bg-gray-950 border-r border-gray-800 flex flex-col h-screen">
      <div className="p-4 border-b border-gray-800">
        <h1
          className="text-xl font-bold text-white tracking-wide cursor-pointer hover:text-indigo-400 transition-colors"
          onClick={onGoHome}
        >Sotry</h1>
        <p className="text-xs text-gray-500 mt-0.5">本地角色扮演</p>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {SECTION_CONFIG.map(({ type, label, color, badge }) => {
          const sectionBlocks = blocks.filter((b) => b.type === type);
          const isCollapsed = collapsed[type];
          const canAdd = !SINGLE_TYPES.includes(type) || sectionBlocks.length === 0;

          return (
            <div key={type}>
              <div
                className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gray-800/50 rounded-lg transition-colors"
                onClick={() => toggleSection(type)}
              >
                {isCollapsed
                  ? <ChevronRight size={14} className="text-gray-500 shrink-0" />
                  : <ChevronDown size={14} className="text-gray-500 shrink-0" />}
                <span className={`text-xs font-semibold uppercase tracking-wider ${color}`}>{label}</span>
                {badge && (
                  <span className="text-xs text-gray-600 bg-gray-800 px-1.5 py-0.5 rounded">{badge}</span>
                )}
                <span className="text-xs text-gray-600 ml-auto">{sectionBlocks.length}</span>
                {canAdd && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setAddingType(type); }}
                    className="text-gray-500 hover:text-white transition-colors ml-1"
                    title="新增"
                  >
                    <Plus size={14} />
                  </button>
                )}
              </div>

              {!isCollapsed && (
                <div className="px-2 pb-1 space-y-0.5">
                  {sectionBlocks.length === 0 && (
                    <p className="text-xs text-gray-600 px-2 py-1.5 italic">尚無設定</p>
                  )}
                  {sectionBlocks.map((block) => (
                    <BlockItem
                      key={block.id}
                      block={block}
                      parentName={parentName(block)}
                      styleTarget={responseStyleTarget(block)}
                      onEdit={() => setEditingBlock(block)}
                      onDelete={() => handleDelete(block)}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="p-3 border-t border-gray-800">
        <button
          onClick={onOpenSettings}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
        >
          <Settings size={16} />
          模型設定
        </button>
      </div>

      {(editingBlock !== undefined || addingType !== null) && (
        <BlockEditor
          block={editingBlock ?? null}
          defaultType={addingType ?? editingBlock?.type ?? 'other'}
          allBlocks={blocks}
          onSave={handleSaved}
          onClose={() => { setEditingBlock(undefined); setAddingType(null); }}
        />
      )}
    </aside>
  );
}

function BlockItem({ block, parentName, styleTarget, onEdit, onDelete }: {
  block: Block;
  parentName: string | null;
  styleTarget: string | null;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="group flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-800/50 transition-colors">
      <div className="w-1.5 h-1.5 rounded-full bg-gray-600 shrink-0 ml-1" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-sm text-gray-300 truncate">{block.name}</p>
          {block.is_player === 1 && (
            <span className="text-xs text-sky-400 bg-sky-900/40 px-1.5 py-0.5 rounded shrink-0">主角</span>
          )}
        </div>
        {parentName && <p className="text-xs text-gray-600 truncate">↑ {parentName}</p>}
        {styleTarget && (
          <p className={`text-xs truncate ${styleTarget === '角色' ? 'text-pink-500' : 'text-gray-500'}`}>
            {styleTarget}
          </p>
        )}
      </div>
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={(e) => { e.stopPropagation(); onEdit(); }} className="text-gray-500 hover:text-white transition-colors">
          <Edit2 size={12} />
        </button>
        <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="text-gray-500 hover:text-red-400 transition-colors">
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}
