// Main chat application
(function() {
  const messagesEl = document.getElementById('messages');
  const chatForm = document.getElementById('chat-form');
  const userInput = document.getElementById('user-input');
  const sendBtn = document.getElementById('send-btn');

  // Conversation history (Anthropic format)
  let conversationHistory = [];
  let isStreaming = false;

  chatForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = userInput.value.trim();
    if (!text || isStreaming) return;

    // Clear welcome message
    const welcome = messagesEl.querySelector('.welcome');
    if (welcome) welcome.remove();

    // Add user message to history
    conversationHistory.push({ role: 'user', content: text });

    // Render user message
    renderUserMessage(text);
    userInput.value = '';
    scrollToBottom();

    // Send to backend
    await sendMessage();
  });

  // Submit on Enter (Shift+Enter for newline)
  userInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      chatForm.dispatchEvent(new Event('submit'));
    }
  });

  function renderUserMessage(text) {
    const div = document.createElement('div');
    div.className = 'message user';
    div.textContent = text;
    messagesEl.appendChild(div);
  }

  function createAssistantMessage() {
    const div = document.createElement('div');
    div.className = 'message assistant';
    const content = document.createElement('div');
    content.className = 'content';
    div.appendChild(content);
    messagesEl.appendChild(div);
    return content;
  }

  async function sendMessage() {
    isStreaming = true;
    sendBtn.disabled = true;

    const contentEl = createAssistantMessage();

    // Add typing indicator
    const typing = document.createElement('div');
    typing.className = 'typing-indicator';
    typing.innerHTML = '<span></span><span></span><span></span>';
    contentEl.appendChild(typing);
    scrollToBottom();

    // Track text per segment (each loop iteration gets its own segment)
    let currentSegmentText = '';
    let currentTextEl = null;
    let allText = '';
    let hadToolCall = false;

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: conversationHistory,
          system: '',
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      // Remove typing indicator on first event
      let typingRemoved = false;
      // eventType must persist across chunks (event: and data: may arrive in separate chunks)
      let eventType = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventType = line.slice(7);
          } else if (line.startsWith('data: ') && eventType) {
            if (!typingRemoved) {
              typing.remove();
              typingRemoved = true;
            }

            const data = JSON.parse(line.slice(6));

            switch (eventType) {
              case 'text_delta': {
                // After a tool result, start a new text segment
                if (hadToolCall) {
                  currentTextEl = null;
                  currentSegmentText = '';
                  hadToolCall = false;
                }
                if (!currentTextEl) {
                  currentTextEl = document.createElement('div');
                  currentTextEl.className = 'text-content';
                  contentEl.appendChild(currentTextEl);
                }
                currentSegmentText += data.text;
                allText += data.text;
                currentTextEl.innerHTML = renderMarkdown(currentSegmentText);
                scrollToBottom();
                break;
              }

              case 'tool_call': {
                hadToolCall = true;
                const toolEl = document.createElement('div');
                toolEl.className = 'tool-call';
                toolEl.id = `tool-${data.id}`;

                const displayName = data.name.includes('__')
                  ? data.name.split('__').slice(1).join('__')
                  : data.name;
                const serverName = data.name.includes('__')
                  ? data.name.split('__')[0]
                  : '';

                toolEl.innerHTML = `
                  <div class="tool-call-header" onclick="this.nextElementSibling.classList.toggle('expanded')">
                    <span class="icon">&#9654;</span>
                    <span class="name">${escapeHtml(displayName)}</span>
                    ${serverName ? `<span style="color:var(--text-dim);font-size:11px">[${escapeHtml(serverName)}]</span>` : ''}
                    <span class="status running">running...</span>
                  </div>
                  <div class="tool-call-body">
                    <div class="section">
                      <div class="label">Input</div>
                      <pre>${escapeHtml(JSON.stringify(data.input, null, 2))}</pre>
                    </div>
                    <div class="result-section"></div>
                  </div>
                `;
                contentEl.appendChild(toolEl);
                scrollToBottom();
                break;
              }

              case 'tool_result': {
                const toolEl = document.getElementById(`tool-${data.tool_use_id}`);
                if (!toolEl) break;

                const statusEl = toolEl.querySelector('.status');
                statusEl.className = `status ${data.isError ? 'error' : 'done'}`;
                statusEl.textContent = data.isError ? 'error' : 'done';

                const resultSection = toolEl.querySelector('.result-section');
                const resultText = data.content?.map(c => c.text || JSON.stringify(c)).join('\n') || 'No output';
                resultSection.innerHTML = `
                  <div class="label">Result</div>
                  <pre>${escapeHtml(truncate(resultText, 2000))}</pre>
                `;
                scrollToBottom();
                break;
              }

              case 'ui_resource': {
                if (data.html && window.mcpAppHost) {
                  const container = document.createElement('div');
                  container.className = 'mcp-app-container';
                  contentEl.appendChild(container);
                  window.mcpAppHost.renderApp(
                    container,
                    data.html,
                    data.toolUseId,
                    data.toolName,
                    data.toolInput,
                    data.toolResult,
                    data.toolDef
                  );
                  scrollToBottom();
                }
                break;
              }

              case 'error': {
                const errEl = document.createElement('div');
                errEl.style.color = 'var(--error)';
                errEl.textContent = `Error: ${data.message}`;
                contentEl.appendChild(errEl);
                scrollToBottom();
                break;
              }

              case 'done':
                break;
            }

            eventType = null;
          }
        }
      }

      // Ensure typing indicator is removed
      if (!typingRemoved) typing.remove();

      // Add assistant response to history
      if (allText) {
        conversationHistory.push({ role: 'assistant', content: allText });
      }

    } catch (error) {
      typing.remove();
      const errEl = document.createElement('div');
      errEl.style.color = 'var(--error)';
      errEl.textContent = `Error: ${error.message}`;
      contentEl.appendChild(errEl);
    }

    isStreaming = false;
    sendBtn.disabled = false;
    userInput.focus();
  }

  function scrollToBottom() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function truncate(str, maxLen) {
    if (str.length <= maxLen) return str;
    return str.slice(0, maxLen) + '\n... (truncated)';
  }
})();
