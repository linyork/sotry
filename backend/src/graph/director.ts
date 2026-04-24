import { Ollama } from '@langchain/ollama';
import { Block, DirectorResult, ChatMessage } from './types';

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';

export async function runDirector(
  model: string,
  history: ChatMessage[],
  allBlocks: Block[],
  consecutiveAiTurns: number,
  maxConsecutiveAiTurns: number,
  historyWindow = 12,
  charSummaryLines = 4
): Promise<DirectorResult> {
  const forceWait = consecutiveAiTurns >= maxConsecutiveAiTurns;

  if (forceWait) {
    return { nextSpeaker: 'waitForUser', selectedBlockIds: [] };
  }

  if (!model) {
    const firstChar = allBlocks.find((b) => b.type === 'character' && !b.is_player);
    const nonCharBlocks = allBlocks.filter((b) => b.type !== 'character' && b.type !== 'timespace' && b.type !== 'plot' && b.type !== 'response_style');
    return {
      nextSpeaker: firstChar?.name || 'narrator',
      selectedBlockIds: [
        ...(firstChar ? [firstChar.id] : []),
        ...nonCharBlocks.map((b) => b.id),
      ],
    };
  }

  // Director sees all blocks (excluding always-loaded timespace/plot and auto-loaded response_style)
  const selectableBlocks = allBlocks.filter(
    (b) => b.type !== 'timespace' && b.type !== 'plot' && b.type !== 'response_style'
  );

  // World context: timespace + plot content fed directly to Director
  const timespaceBlock = allBlocks.find((b) => b.type === 'timespace');
  const plotBlock = allBlocks.find((b) => b.type === 'plot');

  const worldContext = [
    timespaceBlock ? `【世界設定】\n${timespaceBlock.content}` : null,
    plotBlock ? `【當前劇情】\n${plotBlock.content}` : null,
  ].filter(Boolean).join('\n\n');

  // Character summaries: first N lines only — Director needs identity/relationship, not full details
  const characterSummaries = allBlocks
    .filter((b) => b.type === 'character')
    .map((b) => {
      const tag = b.is_player ? '（主角／玩家角色，禁止選為說話者）' : '';
      const summary = b.content.split('\n').slice(0, charSummaryLines).join('\n');
      return `【${b.name}${tag}】\n${summary}`;
    })
    .join('\n\n');

  const blockList = selectableBlocks
    .filter((b) => b.type !== 'character')
    .map((b) => `- [${b.type}] ${b.name} (id: ${b.id})`)
    .join('\n');

  // Player character blocks — AI must never speak as these
  const playerCharacterNames = selectableBlocks
    .filter((b) => b.type === 'character' && b.is_player)
    .map((b) => b.name);

  const characterNames = selectableBlocks
    .filter((b) => b.type === 'character' && !b.is_player)
    .map((b) => b.name);

  const historyText = history
    .slice(-historyWindow)
    .map((m) => {
      const label = m.role === 'user' ? '【玩家】' : `【${m.speaker || 'AI'}】`;
      return `${label}: ${m.content}`;
    })
    .join('\n');

  const validSpeakers = [...characterNames, 'narrator', 'waitForUser'];

  const playerForbidLine = playerCharacterNames.length > 0
    ? `\n絕對禁止說話的角色（主角/玩家角色，由真人扮演）：${playerCharacterNames.map(n => `「${n}」`).join('、')}`
    : '';

  const prompt = `你正在參與一個名為 Sotry 的 AI 互動敘事系統。

Sotry 的運作方式：
- 使用者（玩家）與 AI 共同推進一段角色扮演故事
- 系統由兩個 LLM 分工：你是 Director，負責根據當前情境決定「誰說話」以及「載入哪些 Block」；另一個 LLM（Generator）再根據你的決策實際產生對白
- 故事資料以「Block」形式組織，分為：世界設定（timespace）、當前劇情（plot）、地點（location）、角色（character）、其他設定（other）、回覆風格（response_style）
- 世界設定與當前劇情由系統自動載入給 Generator，你不需要選；其餘 Block 由你依情境挑選

你現在的任務是：根據以下提供的世界設定、劇情、角色資料與對話歷史，做出本輪的導演決策。

=== 世界設定與當前劇情 ===
${worldContext || '（無）'}

=== 角色資料 ===
${characterSummaries || '（無）'}

=== 可供選取的非角色 Block（地點、其他設定） ===
${blockList || '（無）'}

=== 最近對話紀錄 ===
${historyText || '（尚無對話）'}

=== 導演決策規則 ===
根據世界設定、當前劇情與角色資料，判斷當前場景中哪些角色合理在場、適合說話。

可選說話者（nextSpeaker 必須完整符合以下其中一個字串）：
${characterNames.length > 0 ? characterNames.map(n => `- "${n}"`).join('\n') : '（無可用角色）'}
- "narrator"（旁白，用於場景描述或無角色可用時）
- "waitForUser"（結束本回合，讓玩家回應）
${playerForbidLine}

其他規則：
- 玩家剛說完話，AI 必須回應，不可立即選 waitForUser
- AI 連續說話 ${consecutiveAiTurns} 輪（上限 ${maxConsecutiveAiTurns} 輪），接近上限時優先選 waitForUser
- 絕對禁止選玩家角色、「使用者」「user」等名稱
- 絕對禁止組合多個角色名稱
- selectedBlockIds 原則：說話角色的 Block 必選；只選與當前場景直接相關的地點與其他設定；不選沉默角色的 Block

只回應 JSON，不要其他文字：
{"nextSpeaker": "角色名或narrator或waitForUser", "selectedBlockIds": [數字陣列]}`;

  // Valid speaker set for post-parse validation (player characters are explicitly forbidden)
  const validSpeakerSet = new Set(validSpeakers);
  const forbiddenSpeakerSet = new Set(playerCharacterNames);

  const llm = new Ollama({ baseUrl: OLLAMA_BASE_URL, model, temperature: 0.3 });

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await llm.invoke(prompt);
      const text = typeof response === 'string' ? response : (response.content as string);
      const jsonMatch = text.match(/\{[\s\S]*?\}/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]) as DirectorResult;
        result.prompt = prompt;
        if (result.nextSpeaker && Array.isArray(result.selectedBlockIds)) {
          // Reject any speaker that isn't a known non-player character, narrator, or waitForUser
          // Also reject if it's a player character name
          if (!validSpeakerSet.has(result.nextSpeaker) || forbiddenSpeakerSet.has(result.nextSpeaker)) {
            result.nextSpeaker = characterNames[0] || 'narrator';
          }
          // Never waitForUser on the very first AI turn
          if (result.nextSpeaker === 'waitForUser' && consecutiveAiTurns === 0) {
            result.nextSpeaker = characterNames[0] || 'narrator';
          }

          // Post-process selectedBlockIds:
          // 1. Remove all non-speaker character blocks (they confuse the generator)
          // 2. Ensure the speaker's own character block is included
          const nonSpeakerCharIds = new Set(
            selectableBlocks
              .filter((b) => b.type === 'character' && b.name !== result.nextSpeaker)
              .map((b) => b.id)
          );
          result.selectedBlockIds = result.selectedBlockIds.filter((id) => !nonSpeakerCharIds.has(id));

          if (result.nextSpeaker !== 'narrator' && result.nextSpeaker !== 'waitForUser') {
            const speakerBlock = selectableBlocks.find(
              (b) => b.type === 'character' && b.name === result.nextSpeaker
            );
            if (speakerBlock && !result.selectedBlockIds.includes(speakerBlock.id)) {
              result.selectedBlockIds.push(speakerBlock.id);
            }
          }

          return result;
        }
      }
    } catch {
      // retry
    }
  }

  const firstChar = selectableBlocks.find((b) => b.type === 'character');
  return {
    nextSpeaker: firstChar?.name || 'narrator',
    selectedBlockIds: selectableBlocks.map((b) => b.id),
    fallback: true,
  };
}
