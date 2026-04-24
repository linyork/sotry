import { Router } from 'express';
import { getDb } from '../db/index';
import { runSummarizer } from '../graph/summarizer';
import { Block, ChatMessage } from '../graph/types';

const router = Router();

router.get('/', (_req, res) => {
  const db = getDb();
  res.json(db.prepare('SELECT * FROM conversations ORDER BY updated_at DESC').all());
});

router.post('/', (req, res) => {
  const db = getDb();
  const { title } = req.body as { title?: string };
  const result = db.prepare('INSERT INTO conversations (title) VALUES (?)').run(title || '新對話');
  res.status(201).json(db.prepare('SELECT * FROM conversations WHERE id = ?').get(result.lastInsertRowid));
});

router.delete('/:id', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM conversations WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

router.delete('/:id/messages', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM messages WHERE conversation_id = ?').run(req.params.id);
  res.json({ success: true });
});

router.get('/:id/messages', (req, res) => {
  const db = getDb();
  const messages = db
    .prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC')
    .all(req.params.id);
  res.json(messages);
});

// Generator debug: sent_blocks + sent_history + generator_prompt for an AI message
router.get('/messages/:msgId/debug', (req, res) => {
  const db = getDb();
  const msg = db
    .prepare('SELECT sent_blocks, sent_history, generator_prompt FROM messages WHERE id = ?')
    .get(req.params.msgId) as { sent_blocks: string; sent_history: string; generator_prompt: string } | undefined;
  if (!msg) return res.status(404).json({ error: 'not found' });
  res.json({
    sentBlocks: msg.sent_blocks ? JSON.parse(msg.sent_blocks) : [],
    sentHistory: msg.sent_history ? JSON.parse(msg.sent_history) : [],
    generatorPrompt: msg.generator_prompt || null,
  });
});

// Director debug: director_decisions + director_prompts for a user message
router.get('/messages/:msgId/director', (req, res) => {
  const db = getDb();
  const msg = db
    .prepare('SELECT director_decisions, director_prompts FROM messages WHERE id = ?')
    .get(req.params.msgId) as { director_decisions: string; director_prompts: string } | undefined;
  if (!msg) return res.status(404).json({ error: 'not found' });
  res.json({
    decisions: msg.director_decisions ? JSON.parse(msg.director_decisions) : [],
    directorPrompts: msg.director_prompts ? JSON.parse(msg.director_prompts) : [],
  });
});

// Manual plot summarization trigger
router.post('/:id/summarize', async (req, res) => {
  const db = getDb();
  const conversationId = req.params.id;

  const allBlocks = db.prepare('SELECT * FROM blocks').all() as Block[];
  const plotBlock = allBlocks.find((b) => b.type === 'plot');
  const timespaceBlock = allBlocks.find((b) => b.type === 'timespace');

  if (!plotBlock || !timespaceBlock) {
    return res.status(400).json({ error: '找不到 plot 或 timespace block' });
  }

  const rows = db.prepare('SELECT key, value FROM settings').all() as Array<{ key: string; value: string }>;
  const s = Object.fromEntries(rows.map((r: { key: string; value: string }) => [r.key, r.value]));
  const model = s.generator_model || s.director_model || '';

  if (!model) return res.status(400).json({ error: '尚未設定模型' });

  const messages = db
    .prepare('SELECT role, content, speaker FROM messages WHERE conversation_id = ? ORDER BY created_at ASC')
    .all(conversationId) as ChatMessage[];

  try {
    const newContent = await runSummarizer(model, plotBlock.content, timespaceBlock.content, messages);
    db.prepare('UPDATE blocks SET content = ?, updated_at = datetime("now") WHERE id = ?')
      .run(newContent, plotBlock.id);
    res.json({ success: true, content: newContent });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Summarizer 失敗' });
  }
});

export default router;
