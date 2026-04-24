import { Router } from 'express';

const router = Router();
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';

router.get('/', async (_req, res) => {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
    const data = (await response.json()) as { models: Array<{ name: string }> };
    res.json((data.models || []).map((m) => m.name));
  } catch {
    res.status(500).json({ error: '無法連接 ollama，請確認服務是否啟動' });
  }
});

export default router;
