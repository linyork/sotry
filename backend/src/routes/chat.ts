import { Router } from 'express';
import { getDb } from '../db/index';
import { runDirector } from '../graph/director';
import { runGenerator, buildSystemPrompt } from '../graph/generator';
import { runSummarizer } from '../graph/summarizer';
import { resolveBlocksWithChains } from '../graph/resolver';
import { Block, ChatMessage } from '../graph/types';

const DEFAULT_SUMMARIZE_EVERY = 20;

const router = Router();

interface DirectorDecision {
  speaker: string;
  selectedBlockIds: number[];
  resolvedBlocks: Array<{ id: number; name: string; type: string }>;
}

router.post('/', async (req, res) => {
  const {
    message,
    conversationId,
    history,
  }: {
    message: string;
    conversationId: number;
    history: ChatMessage[];
  } = req.body;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  // Declared outside try so fire-and-forget block can access them
  let allBlocks: Block[] = [];
  let messagesAddedThisRequest = 0;
  let summarizerModel = '';

  try {
    const db = getDb();
    allBlocks = db.prepare('SELECT * FROM blocks').all() as Block[];
    const parentLinkRows = db.prepare('SELECT block_id, parent_id FROM block_parents').all() as Array<{ block_id: number; parent_id: number }>;
    const parentLinks = new Map<number, number[]>();
    for (const r of parentLinkRows) {
      if (!parentLinks.has(r.block_id)) parentLinks.set(r.block_id, []);
      parentLinks.get(r.block_id)!.push(r.parent_id);
    }
    const rows = db.prepare('SELECT key, value FROM settings').all() as Array<{ key: string; value: string }>;
    const s = Object.fromEntries(rows.map((r) => [r.key, r.value]));

    const directorModel = s.director_model || '';
    const generatorModel = s.generator_model || '';
    const maxTurns = parseInt(s.max_consecutive_ai_turns || '3', 10);
    const directorHistoryWindow = parseInt(s.director_history_window || '12', 10);
    const generatorHistoryWindow = parseInt(s.generator_history_window || '20', 10);
    const charSummaryLines = parseInt(s.director_char_summary_lines || '4', 10);
    summarizerModel = generatorModel || directorModel;

    // Always-loaded blocks: timespace + plot
    const alwaysBlocks = resolveBlocksWithChains(
      allBlocks.filter((b) => b.type === 'timespace' || b.type === 'plot').map((b) => b.id),
      allBlocks,
      parentLinks
    );

    // Helper: find the response_style block for a given speaker
    const getResponseStyleBlock = (speaker: string): Block | undefined => {
      const isNarrator = speaker === 'narrator';
      return allBlocks.find(
        (b) => b.type === 'response_style' && (isNarrator ? !b.for_character : !!b.for_character)
      );
    };

    let externalConsecutive = 0;
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].role === 'assistant') externalConsecutive++;
      else break;
    }

    const workingHistory: ChatMessage[] = [...history];
    let userMsgId: number | null = null;

    if (message.trim()) {
      workingHistory.push({ role: 'user', content: message });
      if (conversationId) {
        const result = db
          .prepare('INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)')
          .run(conversationId, 'user', message);
        userMsgId = result.lastInsertRowid as number;
        messagesAddedThisRequest++;
        send('user_saved', { id: userMsgId });
      }
    }

    let loopTurns = 0;
    const directorDecisions: DirectorDecision[] = [];
    const directorPrompts: string[] = [];

    while (true) {
      const totalConsecutive = externalConsecutive + loopTurns;

      const directorResult = await runDirector(
        directorModel,
        workingHistory,
        allBlocks,
        totalConsecutive,
        maxTurns,
        directorHistoryWindow,
        charSummaryLines
      );

      if (directorResult.fallback) {
        send('director_fallback', { message: 'Director 多次失敗，已自動選擇預設角色' });
      }

      if (directorResult.prompt) directorPrompts.push(directorResult.prompt);

      if (directorResult.nextSpeaker === 'waitForUser') {
        if (userMsgId && directorDecisions.length > 0) {
          db.prepare('UPDATE messages SET director_decisions = ?, director_prompts = ? WHERE id = ?')
            .run(JSON.stringify(directorDecisions), JSON.stringify(directorPrompts), userMsgId);
        }
        send('director_done', { decisions: directorDecisions });
        send('wait_for_user', {});
        break;
      }

      const selectedBlocks = resolveBlocksWithChains(directorResult.selectedBlockIds, allBlocks, parentLinks);

      const seenIds = new Set(selectedBlocks.map((b) => b.id));
      const finalBlocks = [
        ...alwaysBlocks.filter((b) => !seenIds.has(b.id)),
        ...selectedBlocks,
      ];

      const styleBlock = getResponseStyleBlock(directorResult.nextSpeaker);
      if (styleBlock && !seenIds.has(styleBlock.id) && !alwaysBlocks.find((b) => b.id === styleBlock.id)) {
        finalBlocks.push(styleBlock);
      }

      const decision: DirectorDecision = {
        speaker: directorResult.nextSpeaker,
        selectedBlockIds: directorResult.selectedBlockIds,
        resolvedBlocks: finalBlocks.map((b) => ({ id: b.id, name: b.name, type: b.type })),
      };
      directorDecisions.push(decision);

      send('director', { speaker: directorResult.nextSpeaker, resolvedBlocks: decision.resolvedBlocks });

      let fullContent = '';
      const generatorPrompt = buildSystemPrompt(directorResult.nextSpeaker, finalBlocks);
      const generator = runGenerator(generatorModel, directorResult.nextSpeaker, finalBlocks, workingHistory, generatorHistoryWindow);

      for await (const token of generator) {
        fullContent += token;
        send('token', { content: token });
      }

      const sentBlocksJson = JSON.stringify(
        finalBlocks.map((b) => ({ id: b.id, name: b.name, type: b.type, content: b.content }))
      );
      const sentHistoryJson = JSON.stringify(
        workingHistory.slice(-20).map((m) => ({ role: m.role, content: m.content, speaker: m.speaker }))
      );

      let aiMsgId: number | null = null;
      if (conversationId) {
        const result = db
          .prepare(
            'INSERT INTO messages (conversation_id, role, content, speaker, sent_blocks, sent_history, generator_prompt) VALUES (?, ?, ?, ?, ?, ?, ?)'
          )
          .run(conversationId, 'assistant', fullContent, directorResult.nextSpeaker, sentBlocksJson, sentHistoryJson, generatorPrompt);
        aiMsgId = result.lastInsertRowid as number;
        messagesAddedThisRequest++;
      }

      send('done', {
        id: aiMsgId,
        content: fullContent,
        speaker: directorResult.nextSpeaker,
        resolvedBlocks: decision.resolvedBlocks,
      });

      workingHistory.push({ role: 'assistant', content: fullContent, speaker: directorResult.nextSpeaker });
      loopTurns++;

      if (loopTurns >= maxTurns) {
        if (userMsgId && directorDecisions.length > 0) {
          db.prepare('UPDATE messages SET director_decisions = ?, director_prompts = ? WHERE id = ?')
            .run(JSON.stringify(directorDecisions), JSON.stringify(directorPrompts), userMsgId);
        }
        send('director_done', { decisions: directorDecisions });
        send('wait_for_user', {});
        break;
      }
    }
  } catch (error) {
    console.error('Chat error:', error);
    send('error', { message: error instanceof Error ? error.message : 'Unknown error' });
  }

  res.end();

  // Fire-and-forget: update plot block with structured summary every SUMMARIZE_EVERY messages
  if (conversationId && messagesAddedThisRequest > 0 && summarizerModel) {
    try {
      const db = getDb();
      const { cnt: totalMessages } = db
        .prepare('SELECT COUNT(*) as cnt FROM messages WHERE conversation_id = ?')
        .get(conversationId) as { cnt: number };

      const settingRows = db.prepare('SELECT key, value FROM settings').all() as Array<{ key: string; value: string }>;
      const settingsMap = Object.fromEntries(settingRows.map((r) => [r.key, r.value]));
      const summarizeEvery = parseInt(settingsMap.summarize_every || String(DEFAULT_SUMMARIZE_EVERY), 10);

      const prevCount = totalMessages - messagesAddedThisRequest;
      const crossed =
        totalMessages >= summarizeEvery &&
        Math.floor(totalMessages / summarizeEvery) > Math.floor(prevCount / summarizeEvery);

      if (crossed) {
        const plotBlock = allBlocks.find((b) => b.type === 'plot');
        const timespaceBlock = allBlocks.find((b) => b.type === 'timespace');

        if (plotBlock && timespaceBlock) {
          const keepLast = 6;
          const oldMessages = db
            .prepare(
              'SELECT role, content, speaker FROM messages WHERE conversation_id = ? ORDER BY created_at ASC LIMIT ?'
            )
            .all(conversationId, Math.max(0, totalMessages - keepLast)) as ChatMessage[];

          runSummarizer(summarizerModel, plotBlock.content, timespaceBlock.content, oldMessages)
            .then((newContent) => {
              db.prepare('UPDATE blocks SET content = ?, updated_at = datetime("now") WHERE id = ?')
                .run(newContent, plotBlock.id);
              console.log(`[summarizer] plot block updated at ${totalMessages} messages`);
            })
            .catch((err) => console.error('[summarizer] error:', err));
        }
      }
    } catch (err) {
      console.error('[summarizer] trigger error:', err);
    }
  }
});

export default router;
