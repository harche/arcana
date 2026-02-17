import { Router } from 'express';
import { stmts } from '../db.js';

export function createConversationsRouter() {
  const router = Router();

  // List all conversations (most recent first)
  router.get('/', (_req, res) => {
    const rows = stmts.listConversations.all();
    res.json(rows);
  });

  // Create a new conversation
  router.post('/', (req, res) => {
    const { title } = req.body;
    if (!title) return res.status(400).json({ error: 'title is required' });
    const result = stmts.createConversation.run(title);
    const conversation = stmts.getConversation.get(result.lastInsertRowid);
    res.status(201).json(conversation);
  });

  // Get a conversation with all its messages
  router.get('/:id', (req, res) => {
    const conversation = stmts.getConversation.get(req.params.id);
    if (!conversation) return res.status(404).json({ error: 'not found' });
    const messages = stmts.getMessages.all(req.params.id);
    res.json({ ...conversation, messages });
  });

  // Rename a conversation
  router.patch('/:id', (req, res) => {
    const { title } = req.body;
    if (!title) return res.status(400).json({ error: 'title is required' });
    const result = stmts.updateConversation.run(title, req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: 'not found' });
    const conversation = stmts.getConversation.get(req.params.id);
    res.json(conversation);
  });

  // Delete a conversation (cascades messages)
  router.delete('/:id', (req, res) => {
    const result = stmts.deleteConversation.run(req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: 'not found' });
    res.json({ ok: true });
  });

  // Add a message to a conversation
  router.post('/:id/messages', (req, res) => {
    const { role, content } = req.body;
    if (!role || content === undefined) {
      return res.status(400).json({ error: 'role and content are required' });
    }
    const conversation = stmts.getConversation.get(req.params.id);
    if (!conversation) return res.status(404).json({ error: 'conversation not found' });
    const result = stmts.addMessage.run(req.params.id, role, JSON.stringify(content));
    stmts.touchConversation.run(req.params.id);
    res.status(201).json({ id: result.lastInsertRowid });
  });

  return router;
}
