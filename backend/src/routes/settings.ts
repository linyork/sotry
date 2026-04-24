import { Router } from 'express';
import { getDb } from '../db/index';

const router = Router();

router.get('/', (_req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT key, value FROM settings').all() as Array<{ key: string; value: string }>;
  res.json(Object.fromEntries(rows.map((r) => [r.key, r.value])));
});

router.put('/', (req, res) => {
  const db = getDb();
  const updates = req.body as Record<string, string>;

  const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  const updateMany = db.transaction((data: Record<string, string>) => {
    for (const [key, value] of Object.entries(data)) {
      stmt.run(key, String(value));
    }
  });
  updateMany(updates);

  const rows = db.prepare('SELECT key, value FROM settings').all() as Array<{ key: string; value: string }>;
  res.json(Object.fromEntries(rows.map((r) => [r.key, r.value])));
});

export default router;
