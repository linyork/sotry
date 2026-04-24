import { Router } from 'express';
import { getDb } from '../db/index';
import { Block } from '../graph/types';

const router = Router();

const SINGLE_TYPE = ['timespace', 'plot'];

function getParentIds(db: ReturnType<typeof getDb>, blockId: number): number[] {
  const rows = db.prepare('SELECT parent_id FROM block_parents WHERE block_id = ?').all(blockId) as Array<{ parent_id: number }>;
  return rows.map((r) => r.parent_id);
}

function buildParentLinksMap(db: ReturnType<typeof getDb>): Map<number, number[]> {
  const rows = db.prepare('SELECT block_id, parent_id FROM block_parents').all() as Array<{ block_id: number; parent_id: number }>;
  const map = new Map<number, number[]>();
  for (const r of rows) {
    if (!map.has(r.block_id)) map.set(r.block_id, []);
    map.get(r.block_id)!.push(r.parent_id);
  }
  return map;
}

/** DFS reachability check: can we reach `targetId` starting from `startId` following parent links? */
function isReachableViaParents(startId: number, targetId: number, parentLinks: Map<number, number[]>): boolean {
  const visited = new Set<number>();
  const stack = [startId];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    if (cur === targetId) return true;
    if (visited.has(cur)) continue;
    visited.add(cur);
    for (const pid of parentLinks.get(cur) ?? []) {
      stack.push(pid);
    }
  }
  return false;
}

router.get('/', (_req, res) => {
  const db = getDb();
  const blocks = db.prepare('SELECT * FROM blocks ORDER BY type, id').all() as Block[];
  const parentLinks = buildParentLinksMap(db);
  const result = blocks.map((b) => ({ ...b, parent_ids: parentLinks.get(b.id) ?? [] }));
  res.json(result);
});

router.post('/', (req, res) => {
  const db = getDb();
  const { name, type, content, parent_ids, is_player, for_character } = req.body as Partial<Block> & { parent_ids?: number[] };

  if (!name || !type) {
    return res.status(400).json({ error: 'name 和 type 為必填' });
  }

  if (SINGLE_TYPE.includes(type)) {
    const existing = db.prepare('SELECT id FROM blocks WHERE type = ?').get(type);
    if (existing) {
      const label = type === 'timespace' ? '時空背景' : '當前劇情';
      return res.status(400).json({ error: `${label}只能有一個` });
    }
  }

  const isPlayer = type === 'character' && is_player ? 1 : 0;
  if (isPlayer) {
    db.prepare('UPDATE blocks SET is_player = 0 WHERE type = ?').run('character');
  }

  const forChar = type === 'response_style' && for_character ? 1 : 0;

  const result = db
    .prepare('INSERT INTO blocks (name, type, content, is_player, for_character) VALUES (?, ?, ?, ?, ?)')
    .run(name, type, content || '', isPlayer, forChar);

  const newId = result.lastInsertRowid as number;

  if (Array.isArray(parent_ids) && parent_ids.length > 0) {
    for (const pid of parent_ids) {
      if (pid === newId) continue; // skip self
      db.prepare('INSERT OR IGNORE INTO block_parents (block_id, parent_id) VALUES (?, ?)').run(newId, pid);
    }
  }

  const block = db.prepare('SELECT * FROM blocks WHERE id = ?').get(newId) as Block;
  res.status(201).json({ ...block, parent_ids: getParentIds(db, newId) });
});

router.put('/:id', (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id, 10);
  const { name, content, parent_ids, is_player, for_character } = req.body as Partial<Block> & { parent_ids?: number[] };

  if (Array.isArray(parent_ids) && parent_ids.length > 0) {
    const parentLinks = buildParentLinksMap(db);
    for (const pid of parent_ids) {
      if (pid === id) {
        return res.status(400).json({ error: '不能將自己設為父層區塊' });
      }
      // Check if pid is reachable from id (would create a cycle: id -> pid -> ... -> id)
      if (isReachableViaParents(id, pid, parentLinks)) {
        return res.status(400).json({ error: '此設定會造成循環依賴' });
      }
    }
  }

  const current = db.prepare('SELECT type FROM blocks WHERE id = ?').get(id) as { type: string } | undefined;
  const isPlayer = current?.type === 'character' && is_player ? 1 : 0;
  const forChar = current?.type === 'response_style' && for_character ? 1 : 0;

  if (isPlayer) {
    db.prepare('UPDATE blocks SET is_player = 0 WHERE type = ? AND id != ?').run('character', id);
  }

  db.prepare(
    'UPDATE blocks SET name = ?, content = ?, is_player = ?, for_character = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
  ).run(name, content, isPlayer, forChar, id);

  // Replace parent links
  db.prepare('DELETE FROM block_parents WHERE block_id = ?').run(id);
  if (Array.isArray(parent_ids)) {
    for (const pid of parent_ids) {
      if (pid === id) continue;
      db.prepare('INSERT OR IGNORE INTO block_parents (block_id, parent_id) VALUES (?, ?)').run(id, pid);
    }
  }

  const block = db.prepare('SELECT * FROM blocks WHERE id = ?').get(id) as Block | undefined;
  if (!block) return res.status(404).json({ error: 'Block not found' });
  res.json({ ...block, parent_ids: getParentIds(db, id) });
});

router.delete('/:id', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM blocks WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

export default router;
