import { Ollama } from '@langchain/ollama';
import { Block, ChatMessage } from './types';

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';

const TYPE_ORDER: Record<string, number> = {
  timespace: 0,
  plot: 1,
  location: 2,
  other: 3,
  character: 4,
  response_style: 5,
};

export function buildSystemPrompt(speaker: string, selectedBlocks: Block[]): string {
  const isNarrator = speaker === 'narrator';
  const orderedBlocks = [...selectedBlocks].sort(
    (a, b) => (TYPE_ORDER[a.type] ?? 9) - (TYPE_ORDER[b.type] ?? 9)
  );

  const role = isNarrator ? '故事旁白' : `角色「${speaker}」`;

  let prompt = `你正在參與一個名為 Sotry 的 AI 互動敘事系統。

Sotry 的運作方式：
- 使用者（玩家）與 AI 共同推進一段角色扮演故事
- 系統由兩個 LLM 分工：Director 負責決定誰說話、載入哪些設定；Generator（你）負責實際生成對白或旁白
- 故事的世界觀、角色、地點、劇情等資訊以「Block」的形式組織，由 Director 根據當前情境選取後提供給你
- 你現在的身份是 Generator，你的任務是扮演${role}，根據以下提供的資料產生這一輪的輸出

以下是本輪載入的場景資料：
`;

  for (const block of orderedBlocks) {
    if (block.type === 'character' && !isNarrator && block.name !== speaker) continue;
    const sectionLabel: Record<string, string> = {
      timespace: '世界設定',
      plot: '當前劇情',
      location: '地點',
      character: '角色資料',
      other: '其他設定',
      response_style: '回覆風格規則',
    };
    prompt += `\n=== ${sectionLabel[block.type] || block.type}：${block.name} ===\n${block.content}\n`;
  }

  prompt += '\n=== 你的任務 ===\n';

  if (isNarrator) {
    prompt += `你是本輪的旁白。
- 用第三人稱生動描述當前場景與事件，推動劇情發展
- 直接輸出旁白內容，不要加任何前綴（如「旁白：」「[narrator]」等）
- 不要描述「使用者在操作介面」，把對話當成角色互動來敘述`;
  } else {
    prompt += `你現在只扮演「${speaker}」這一個角色。
- 只輸出「${speaker}」本人這一輪的說話內容，一段連貫的回應
- 絕對不代替其他任何角色說話，不寫出其他角色的對話或行為
- 保持「${speaker}」的語氣、個性與口吻
- 直接輸出說話內容，不要加角色名前綴（如「${speaker}：」「[${speaker}]」等）`;
  }

  return prompt;
}

export async function* runGenerator(
  model: string,
  speaker: string,
  selectedBlocks: Block[],
  history: ChatMessage[],
  historyWindow = 20
): AsyncGenerator<string> {
  const systemPrompt = buildSystemPrompt(speaker, selectedBlocks);

  // Build history without any speaker prefixes in content
  const messages = history.slice(-historyWindow).map((m) => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }));

  const llm = new Ollama({
    baseUrl: OLLAMA_BASE_URL,
    model,
    temperature: 0.8,
    numCtx: 8192,
    numPredict: 1000,
  });

  const stream = await llm.stream([
    { role: 'system', content: systemPrompt },
    ...messages,
  ]);

  for await (const chunk of stream) {
    const content = typeof chunk === 'string' ? chunk : (chunk.content as string);
    if (content) yield content;
  }
}
