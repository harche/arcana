// Main chat application
(function() {
  const messagesEl = document.getElementById('messages');
  const chatForm = document.getElementById('chat-form');
  const userInput = document.getElementById('user-input');
  const sendBtn = document.getElementById('send-btn');

  // Conversation history (Anthropic format)
  let conversationHistory = [];
  let isStreaming = false;
  let pendingUserMessage = null;

  // Wire up MCP App interactive messages (e.g. clicking a table cell)
  if (window.mcpAppHost) {
    window.mcpAppHost.onUserMessage = (text) => {
      if (isStreaming) {
        // Queue the message to be sent after current stream ends
        pendingUserMessage = text;
        return;
      }
      submitUserMessage(text);
    };
  }

  function submitUserMessage(text) {
    const welcome = messagesEl.querySelector('.welcome');
    if (welcome) welcome.remove();

    conversationHistory.push({ role: 'user', content: text });
    renderUserMessage(text);
    scrollToBottom();
    sendMessage();
  }

  chatForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = userInput.value.trim();
    if (!text || isStreaming) return;

    const welcome = messagesEl.querySelector('.welcome');
    if (welcome) welcome.remove();

    conversationHistory.push({ role: 'user', content: text });

    renderUserMessage(text);
    userInput.value = '';
    scrollToBottom();

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

    // Thinking indicator
    const thinking = document.createElement('div');
    thinking.className = 'thinking-indicator';
    thinking.innerHTML = '<span class="thinking-icon">&#9679;</span> Thinking...';
    contentEl.appendChild(thinking);
    scrollToBottom();

    // Track text per segment (each loop iteration gets its own segment)
    let currentSegmentText = '';
    let currentTextEl = null;
    let allText = '';
    let hadToolCall = false;
    let hadUiResource = false;

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

      let thinkingRemoved = false;
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
            if (!thinkingRemoved) {
              thinking.remove();
              thinkingRemoved = true;
            }

            const data = JSON.parse(line.slice(6));

            switch (eventType) {
              case 'text_delta': {
                if (hadToolCall) {
                  currentTextEl = null;
                  currentSegmentText = '';
                  hadToolCall = false;
                }
                if (hadUiResource) {
                  allText += data.text;
                  break;
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
                hadUiResource = false;

                // Show thinking label for tool execution
                const thinkingTool = document.createElement('div');
                thinkingTool.className = 'thinking-indicator';
                thinkingTool.innerHTML = `<span class="thinking-icon">&#9679;</span> Calling <strong>${escapeHtml(data.name.includes('__') ? data.name.split('__').slice(1).join('__') : data.name)}</strong>...`;
                thinkingTool.id = `thinking-${data.id}`;
                contentEl.appendChild(thinkingTool);

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
                // Remove the thinking label for this tool
                const thinkingEl = document.getElementById(`thinking-${data.tool_use_id}`);
                if (thinkingEl) thinkingEl.remove();

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
                  hadUiResource = true;
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

      if (!thinkingRemoved) thinking.remove();

      if (allText) {
        conversationHistory.push({ role: 'assistant', content: allText });
      }

    } catch (error) {
      thinking.remove();
      const errEl = document.createElement('div');
      errEl.style.color = 'var(--error)';
      errEl.textContent = `Error: ${error.message}`;
      contentEl.appendChild(errEl);
    }

    isStreaming = false;
    sendBtn.disabled = false;
    userInput.focus();

    // Process any queued message from MCP App interactive clicks
    if (pendingUserMessage) {
      const msg = pendingUserMessage;
      pendingUserMessage = null;
      submitUserMessage(msg);
    }
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
