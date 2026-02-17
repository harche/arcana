import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { initDb } from '../server/db.js';
import { createConversationsRouter } from '../server/routes/conversations.js';

describe('Conversations API', () => {
  let app;
  let stmts;

  beforeEach(() => {
    ({ stmts } = initDb(':memory:'));
    app = express();
    app.use(express.json());
    app.use('/', createConversationsRouter(stmts));
  });

  describe('GET /', () => {
    it('returns empty array when no conversations exist', async () => {
      const res = await request(app).get('/');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('returns conversations list', async () => {
      stmts.createConversation.run('Chat A');
      stmts.createConversation.run('Chat B');

      const res = await request(app).get('/');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
    });
  });

  describe('POST /', () => {
    it('creates a conversation and returns 201', async () => {
      const res = await request(app)
        .post('/')
        .send({ title: 'New Chat' });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ id: 1, title: 'New Chat' });
      expect(res.body.created_at).toBeTruthy();
    });

    it('returns 400 without title', async () => {
      const res = await request(app).post('/').send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/title/i);
    });
  });

  describe('GET /:id', () => {
    it('returns conversation with messages', async () => {
      stmts.createConversation.run('Chat');
      stmts.addMessage.run(1, 'user', '"hello"');

      const res = await request(app).get('/1');
      expect(res.status).toBe(200);
      expect(res.body.title).toBe('Chat');
      expect(res.body.messages).toHaveLength(1);
      expect(res.body.messages[0].role).toBe('user');
    });

    it('returns 404 for missing conversation', async () => {
      const res = await request(app).get('/999');
      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /:id', () => {
    it('renames a conversation', async () => {
      stmts.createConversation.run('Old Name');

      const res = await request(app)
        .patch('/1')
        .send({ title: 'New Name' });

      expect(res.status).toBe(200);
      expect(res.body.title).toBe('New Name');
    });

    it('returns 400 without title', async () => {
      stmts.createConversation.run('Chat');
      const res = await request(app).patch('/1').send({});
      expect(res.status).toBe(400);
    });

    it('returns 404 for missing conversation', async () => {
      const res = await request(app)
        .patch('/999')
        .send({ title: 'X' });
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /:id', () => {
    it('deletes a conversation and cascades messages', async () => {
      stmts.createConversation.run('Chat');
      stmts.addMessage.run(1, 'user', '"hi"');

      const res = await request(app).delete('/1');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });

      // Verify it's gone
      const getRes = await request(app).get('/1');
      expect(getRes.status).toBe(404);
    });

    it('returns 404 for missing conversation', async () => {
      const res = await request(app).delete('/999');
      expect(res.status).toBe(404);
    });
  });

  describe('POST /:id/messages', () => {
    it('adds a message and returns 201', async () => {
      stmts.createConversation.run('Chat');

      const res = await request(app)
        .post('/1/messages')
        .send({ role: 'user', content: 'hello' });

      expect(res.status).toBe(201);
      expect(res.body.id).toBe(1);
    });

    it('updates conversation timestamp', async () => {
      stmts.createConversation.run('Chat');
      const before = stmts.getConversation.get(1);

      await request(app)
        .post('/1/messages')
        .send({ role: 'user', content: 'hello' });

      const after = stmts.getConversation.get(1);
      expect(after.updated_at).toBeTruthy();
    });

    it('returns 400 without role', async () => {
      stmts.createConversation.run('Chat');
      const res = await request(app)
        .post('/1/messages')
        .send({ content: 'hello' });
      expect(res.status).toBe(400);
    });

    it('returns 404 for missing conversation', async () => {
      const res = await request(app)
        .post('/999/messages')
        .send({ role: 'user', content: 'hello' });
      expect(res.status).toBe(404);
    });
  });
});
