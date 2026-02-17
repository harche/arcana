import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, 'arcana.db');

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
  );
`);

export const stmts = {
  listConversations: db.prepare(
    'SELECT id, title, created_at, updated_at FROM conversations ORDER BY updated_at DESC'
  ),
  createConversation: db.prepare(
    'INSERT INTO conversations (title) VALUES (?)'
  ),
  getConversation: db.prepare(
    'SELECT id, title, created_at, updated_at FROM conversations WHERE id = ?'
  ),
  updateConversation: db.prepare(
    'UPDATE conversations SET title = ?, updated_at = datetime(\'now\') WHERE id = ?'
  ),
  touchConversation: db.prepare(
    'UPDATE conversations SET updated_at = datetime(\'now\') WHERE id = ?'
  ),
  deleteConversation: db.prepare(
    'DELETE FROM conversations WHERE id = ?'
  ),
  getMessages: db.prepare(
    'SELECT id, role, content, created_at FROM messages WHERE conversation_id = ? ORDER BY created_at ASC'
  ),
  addMessage: db.prepare(
    'INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)'
  ),
};

export default db;
