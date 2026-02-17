// Chat history sidebar manager
(function () {
  const panel = document.getElementById('history-panel');
  const listEl = document.getElementById('conversation-list');
  const newChatBtn = document.getElementById('new-chat-btn');

  let currentConversationId = null;

  const api = {
    async list() {
      const res = await fetch('/api/conversations');
      return res.json();
    },
    async create(title) {
      const res = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      return res.json();
    },
    async get(id) {
      const res = await fetch(`/api/conversations/${id}`);
      return res.json();
    },
    async rename(id, title) {
      const res = await fetch(`/api/conversations/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      return res.json();
    },
    async remove(id) {
      await fetch(`/api/conversations/${id}`, { method: 'DELETE' });
    },
    async addMessage(id, role, content) {
      await fetch(`/api/conversations/${id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, content }),
      });
    },
  };

  function renderList(conversations) {
    listEl.innerHTML = '';
    for (const conv of conversations) {
      const item = document.createElement('div');
      item.className = 'conversation-item' + (conv.id === currentConversationId ? ' active' : '');
      item.dataset.id = conv.id;

      const titleSpan = document.createElement('span');
      titleSpan.className = 'conversation-title';
      titleSpan.textContent = conv.title;
      titleSpan.title = conv.title;

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'conversation-delete';
      deleteBtn.textContent = '\u00d7';
      deleteBtn.title = 'Delete conversation';
      deleteBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await api.remove(conv.id);
        if (conv.id === currentConversationId) {
          currentConversationId = null;
          if (chatHistory.onNewChat) chatHistory.onNewChat();
        }
        await chatHistory.refreshList();
      });

      item.appendChild(titleSpan);
      item.appendChild(deleteBtn);

      item.addEventListener('click', async () => {
        if (conv.id === currentConversationId) return;
        const data = await api.get(conv.id);
        currentConversationId = conv.id;
        const messages = data.messages.map((m) => ({
          role: m.role,
          content: JSON.parse(m.content),
        }));
        if (chatHistory.onConversationLoad) chatHistory.onConversationLoad(messages);
        highlightActive();
      });

      listEl.appendChild(item);
    }
  }

  function highlightActive() {
    listEl.querySelectorAll('.conversation-item').forEach((el) => {
      el.classList.toggle('active', Number(el.dataset.id) === currentConversationId);
    });
  }

  newChatBtn.addEventListener('click', () => {
    currentConversationId = null;
    highlightActive();
    if (chatHistory.onNewChat) chatHistory.onNewChat();
  });

  // Public API
  const chatHistory = {
    onConversationLoad: null,
    onNewChat: null,

    async ensureConversation(text) {
      if (!currentConversationId) {
        const title = text.length > 50 ? text.slice(0, 50) + '...' : text;
        const conv = await api.create(title);
        currentConversationId = conv.id;
        await this.refreshList();
      }
      return currentConversationId;
    },

    async saveMessage(role, content) {
      if (!currentConversationId) return;
      await api.addMessage(currentConversationId, role, content);
    },

    async refreshList() {
      const conversations = await api.list();
      renderList(conversations);
    },

    getCurrentId() {
      return currentConversationId;
    },
  };

  window.chatHistory = chatHistory;

  // Initial load
  chatHistory.refreshList();
})();
