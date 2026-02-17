import { describe, it, expect, beforeEach } from 'vitest';
import { initDb } from '../server/db.js';

describe('DB layer', () => {
  let stmts;
  let db;

  beforeEach(() => {
    ({ db, stmts } = initDb(':memory:'));
  });

  it('creates conversations and messages tables', () => {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all()
      .map((r) => r.name);
    expect(tables).toContain('conversations');
    expect(tables).toContain('messages');
  });

  it('createConversation + getConversation', () => {
    const result = stmts.createConversation.run('Test Chat');
    const conv = stmts.getConversation.get(result.lastInsertRowid);
    expect(conv).toMatchObject({ id: 1, title: 'Test Chat' });
    expect(conv.created_at).toBeTruthy();
    expect(conv.updated_at).toBeTruthy();
  });

  it('listConversations returns most recent first', () => {
    stmts.createConversation.run('First');
    stmts.createConversation.run('Second');
    // touch the first one so it becomes most recent
    stmts.touchConversation.run(1);

    const list = stmts.listConversations.all();
    expect(list).toHaveLength(2);
    expect(list[0].title).toBe('First');
    expect(list[1].title).toBe('Second');
  });

  it('updateConversation changes title and updated_at', () => {
    stmts.createConversation.run('Original');
    const before = stmts.getConversation.get(1);

    stmts.updateConversation.run('Renamed', 1);
    const after = stmts.getConversation.get(1);

    expect(after.title).toBe('Renamed');
    expect(after.updated_at).toBeTruthy();
  });

  it('deleteConversation cascades messages', () => {
    stmts.createConversation.run('Chat');
    stmts.addMessage.run(1, 'user', 'hello');
    stmts.addMessage.run(1, 'assistant', 'hi');

    expect(stmts.getMessages.all(1)).toHaveLength(2);

    stmts.deleteConversation.run(1);
    expect(stmts.getConversation.get(1)).toBeUndefined();
    expect(stmts.getMessages.all(1)).toHaveLength(0);
  });

  it('addMessage + getMessages returns messages in order', () => {
    stmts.createConversation.run('Chat');
    stmts.addMessage.run(1, 'user', 'first');
    stmts.addMessage.run(1, 'assistant', 'second');
    stmts.addMessage.run(1, 'user', 'third');

    const msgs = stmts.getMessages.all(1);
    expect(msgs).toHaveLength(3);
    expect(msgs[0]).toMatchObject({ role: 'user', content: 'first' });
    expect(msgs[1]).toMatchObject({ role: 'assistant', content: 'second' });
    expect(msgs[2]).toMatchObject({ role: 'user', content: 'third' });
  });

  it('touchConversation updates the timestamp', () => {
    stmts.createConversation.run('Chat');
    const before = stmts.getConversation.get(1);

    stmts.touchConversation.run(1);
    const after = stmts.getConversation.get(1);

    expect(after.updated_at).toBeTruthy();
  });
});
