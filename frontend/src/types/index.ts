export interface Block {
  id: number;
  name: string;
  type: 'timespace' | 'location' | 'character' | 'other' | 'plot' | 'response_style';
  content: string;
  parent_id: number | null; // legacy DB column
  parent_ids: number[];     // from block_parents junction table (multi-parent)
  is_player: number; // 1 = player character (AI uses for context, never speaks as this character)
  for_character: number; // response_style only: 1 = applies when any character speaks, 0 = narrator
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  dbId?: number;
  role: 'user' | 'assistant';
  content: string;
  speaker?: string;
  isStreaming?: boolean;
  // Director decisions (stored on user messages)
  directorDecisions?: DirectorDecision[];
  // Blocks used for this AI response (stored on assistant messages)
  resolvedBlocks?: Array<{ id: number; name: string; type: string }>;
}

export interface DirectorDecision {
  speaker: string;
  selectedBlockIds: number[];
  resolvedBlocks: Array<{ id: number; name: string; type: string }>;
}

export interface Settings {
  director_model: string;
  generator_model: string;
  max_consecutive_ai_turns: string;
  director_history_window: string;
  generator_history_window: string;
  summarize_every: string;
  director_char_summary_lines: string;
}

export interface Conversation {
  id: number;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface GeneratorDebugInfo {
  sentBlocks: Array<{ id: number; name: string; type: string; content: string }>;
  sentHistory: Array<{ role: string; content: string; speaker?: string }>;
  generatorPrompt: string | null;
}

export interface DirectorDebugInfo {
  decisions: DirectorDecision[];
  directorPrompts: string[];
}
