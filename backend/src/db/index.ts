import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../data/sotry.db');

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    runMigrations(db);
  }
  return db;
}

function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _schema_version (version INTEGER NOT NULL DEFAULT 0);
    INSERT OR IGNORE INTO _schema_version (version) VALUES (0);
  `);

  const row = db.prepare('SELECT version FROM _schema_version').get() as { version: number };
  let version = row.version;

  if (version < 1) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS blocks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('timespace', 'location', 'character', 'other', 'plot')),
        content TEXT NOT NULL DEFAULT '',
        parent_id INTEGER REFERENCES blocks(id) ON DELETE SET NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL DEFAULT ''
      );

      INSERT OR IGNORE INTO settings (key, value) VALUES ('director_model', '');
      INSERT OR IGNORE INTO settings (key, value) VALUES ('generator_model', '');
      INSERT OR IGNORE INTO settings (key, value) VALUES ('max_consecutive_ai_turns', '3');

      CREATE TABLE IF NOT EXISTS conversations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL DEFAULT '新對話',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
        content TEXT NOT NULL DEFAULT '',
        speaker TEXT,
        sent_blocks TEXT,
        sent_history TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
    db.prepare('UPDATE _schema_version SET version = 1').run();
    version = 1;
  }

  if (version < 2) {
    // Migrate old blocks table that lacks 'plot' type
    let needsBlocksMigration = false;
    try {
      db.prepare(`INSERT INTO blocks (name, type, content) VALUES ('__test__', 'plot', '')`).run();
      db.prepare(`DELETE FROM blocks WHERE name = '__test__'`).run();
    } catch {
      needsBlocksMigration = true;
    }

    if (needsBlocksMigration) {
      db.pragma('foreign_keys = OFF');
      db.exec(`
        CREATE TABLE blocks_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          type TEXT NOT NULL CHECK(type IN ('timespace', 'location', 'character', 'other', 'plot')),
          content TEXT NOT NULL DEFAULT '',
          parent_id INTEGER REFERENCES blocks_new(id) ON DELETE SET NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        INSERT OR IGNORE INTO blocks_new SELECT * FROM blocks;
        DROP TABLE blocks;
        ALTER TABLE blocks_new RENAME TO blocks;
      `);
      db.pragma('foreign_keys = ON');
    }

    db.exec(`
      CREATE TABLE IF NOT EXISTS conversations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL DEFAULT '新對話',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
        content TEXT NOT NULL DEFAULT '',
        speaker TEXT,
        sent_blocks TEXT,
        sent_history TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    db.prepare('UPDATE _schema_version SET version = 2').run();
  }

  if (version < 3) {
    // Add director_decisions column to user messages
    try {
      db.exec('ALTER TABLE messages ADD COLUMN director_decisions TEXT');
    } catch {
      // column already exists
    }
    db.prepare('UPDATE _schema_version SET version = 3').run();
    version = 3;
  }

  if (version < 4) {
    // Lower default max_consecutive_ai_turns from 3 to 2
    db.prepare(`UPDATE settings SET value = '2' WHERE key = 'max_consecutive_ai_turns' AND value = '3'`).run();
    db.prepare('UPDATE _schema_version SET version = 4').run();
    version = 4;
  }

  if (version < 5) {
    // Add is_player column to blocks (marks a character block as the player character)
    try {
      db.exec('ALTER TABLE blocks ADD COLUMN is_player INTEGER NOT NULL DEFAULT 0');
    } catch {
      // column already exists
    }
    db.prepare('UPDATE _schema_version SET version = 5').run();
    version = 5;
  }

  if (version < 6) {
    // Add response_style type + for_character boolean column
    // Must recreate table to update CHECK constraint
    db.pragma('foreign_keys = OFF');
    db.exec(`
      CREATE TABLE blocks_v6 (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('timespace', 'location', 'character', 'other', 'plot', 'response_style')),
        content TEXT NOT NULL DEFAULT '',
        parent_id INTEGER REFERENCES blocks_v6(id) ON DELETE SET NULL,
        is_player INTEGER NOT NULL DEFAULT 0,
        for_character INTEGER NOT NULL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO blocks_v6 (id, name, type, content, parent_id, is_player, created_at, updated_at)
        SELECT id, name, type, content, parent_id, is_player, created_at, updated_at FROM blocks;
      DROP TABLE blocks;
      ALTER TABLE blocks_v6 RENAME TO blocks;
    `);
    db.pragma('foreign_keys = ON');
    db.prepare('UPDATE _schema_version SET version = 6').run();
    version = 6;
  }

  if (version < 7) {
    // Replace attached_character_id with simpler for_character boolean
    try {
      db.exec('ALTER TABLE blocks ADD COLUMN for_character INTEGER NOT NULL DEFAULT 0');
    } catch {
      // column already exists
    }
    db.prepare('UPDATE _schema_version SET version = 7').run();
    version = 7;
  }

  if (version < 8) {
    // Create block_parents junction table for multi-parent support
    db.exec(`
      CREATE TABLE IF NOT EXISTS block_parents (
        block_id INTEGER NOT NULL REFERENCES blocks(id) ON DELETE CASCADE,
        parent_id INTEGER NOT NULL REFERENCES blocks(id) ON DELETE CASCADE,
        PRIMARY KEY (block_id, parent_id)
      );
      INSERT OR IGNORE INTO block_parents (block_id, parent_id)
        SELECT id, parent_id FROM blocks WHERE parent_id IS NOT NULL;
    `);
    db.prepare('UPDATE _schema_version SET version = 8').run();
    version = 8;
  }

  if (version < 9) {
    // Add raw prompt storage: director_prompts (per-round array) and generator_prompt
    try { db.exec('ALTER TABLE messages ADD COLUMN director_prompts TEXT'); } catch {}
    try { db.exec('ALTER TABLE messages ADD COLUMN generator_prompt TEXT'); } catch {}
    db.prepare('UPDATE _schema_version SET version = 9').run();
    version = 9;
  }

  if (version < 10) {
    // Add configurable parameters to settings
    const newSettings = [
      ['director_history_window', '12'],
      ['generator_history_window', '20'],
      ['summarize_every', '20'],
      ['director_char_summary_lines', '4'],
    ];
    for (const [key, value] of newSettings) {
      db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)').run(key, value);
    }
    db.prepare('UPDATE _schema_version SET version = 10').run();
    version = 10;
  }
}
