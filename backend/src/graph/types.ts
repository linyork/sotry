export interface Block {
  id: number;
  name: string;
  type: 'timespace' | 'location' | 'character' | 'other' | 'plot' | 'response_style';
  content: string;
  parent_id: number | null; // legacy, kept for DB compat; use parent_ids from block_parents table
  parent_ids?: number[];    // resolved from block_parents table
  is_player: number; // 1 = player character (cannot speak, AI context only)
  for_character: number; // response_style only: 1 = applies when any character speaks, 0 = applies when narrator speaks
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  speaker?: string;
}

export interface DirectorResult {
  nextSpeaker: string;
  selectedBlockIds: number[];
  prompt?: string;
  fallback?: boolean;
}
