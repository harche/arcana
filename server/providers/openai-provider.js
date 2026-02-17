export class OpenAIProvider {
  constructor(client, model, maxTokens) {
    this.client = client;
    this.model = model;
    this.maxTokens = maxTokens;
  }

  _convertTools(tools) {
    return tools.map(t => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description || '',
        parameters: t.input_schema || { type: 'object', properties: {} },
      },
    }));
  }

  _convertMessages(messages, systemPrompt) {
    const out = [];
    if (systemPrompt) {
      out.push({ role: 'system', content: systemPrompt });
    }

    for (const msg of messages) {
      if (msg.role === 'assistant') {
        if (typeof msg.content === 'string') {
          out.push({ role: 'assistant', content: msg.content });
          continue;
        }

        // Build a single assistant message with optional text + tool_calls
        let text = '';
        const toolCalls = [];

        for (const block of msg.content) {
          if (block.type === 'text') {
            text += block.text;
          } else if (block.type === 'tool_use') {
            toolCalls.push({
              id: block.id,
              type: 'function',
              function: {
                name: block.name,
                arguments: JSON.stringify(block.input || {}),
              },
            });
          }
          // Skip thinking/signature blocks
        }

        const assistantMsg = { role: 'assistant' };
        if (text) assistantMsg.content = text;
        else assistantMsg.content = null;
        if (toolCalls.length > 0) assistantMsg.tool_calls = toolCalls;
        out.push(assistantMsg);
      } else if (msg.role === 'user') {
        if (typeof msg.content === 'string') {
          out.push({ role: 'user', content: msg.content });
          continue;
        }

        // User content can be an array with text and tool_result blocks
        const toolResults = [];
        let userText = '';

        for (const block of msg.content) {
          if (block.type === 'tool_result') {
            let resultText = '';
            if (typeof block.content === 'string') {
              resultText = block.content;
            } else if (Array.isArray(block.content)) {
              resultText = block.content
                .map(c => (c.type === 'text' ? c.text : JSON.stringify(c)))
                .join('\n');
            }
            toolResults.push({
              role: 'tool',
              tool_call_id: block.tool_use_id,
              content: resultText || 'No output',
            });
          } else if (block.type === 'text') {
            userText += block.text;
          }
        }

        // Tool results become separate messages
        for (const tr of toolResults) {
          out.push(tr);
        }
        if (userText) {
          out.push({ role: 'user', content: userText });
        }
      }
    }

    return out;
  }

  async *_normalizeStream(openaiStream) {
    const toolCalls = new Map(); // index -> {id, name, arguments}
    let textBlockOpen = false;
    let blockIndex = 0;

    for await (const chunk of openaiStream) {
      const choice = chunk.choices?.[0];
      if (!choice) continue;

      const delta = choice.delta || {};
      const finishReason = choice.finish_reason;

      // Handle text content
      if (delta.content) {
        if (!textBlockOpen) {
          yield { type: 'content_block_start', index: blockIndex, content_block: { type: 'text', text: '' } };
          textBlockOpen = true;
        }
        yield { type: 'content_block_delta', index: blockIndex, delta: { type: 'text_delta', text: delta.content } };
      }

      // Handle tool calls
      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index;
          if (!toolCalls.has(idx)) {
            // Close text block if open
            if (textBlockOpen) {
              yield { type: 'content_block_stop', index: blockIndex };
              blockIndex++;
              textBlockOpen = false;
            }

            // New tool call
            toolCalls.set(idx, {
              id: tc.id,
              name: tc.function?.name || '',
              arguments: tc.function?.arguments || '',
            });

            yield {
              type: 'content_block_start',
              index: blockIndex + idx,
              content_block: { type: 'tool_use', id: tc.id, name: tc.function?.name || '', input: {} },
            };
          } else {
            const existing = toolCalls.get(idx);
            if (tc.function?.arguments) {
              existing.arguments += tc.function.arguments;
              yield {
                type: 'content_block_delta',
                index: blockIndex + idx,
                delta: { type: 'input_json_delta', partial_json: tc.function.arguments },
              };
            }
          }
        }
      }

      // Handle finish
      if (finishReason) {
        // Close text block if still open
        if (textBlockOpen) {
          yield { type: 'content_block_stop', index: blockIndex };
          blockIndex++;
          textBlockOpen = false;
        }

        // Close all tool call blocks
        for (const [idx] of toolCalls) {
          yield { type: 'content_block_stop', index: blockIndex + idx };
        }

        // Map finish reason
        const stopReasonMap = {
          stop: 'end_turn',
          tool_calls: 'tool_use',
          length: 'max_tokens',
        };

        yield {
          type: 'message_delta',
          delta: { stop_reason: stopReasonMap[finishReason] || 'end_turn' },
        };
      }
    }
  }

  async streamMessage(messages, tools = [], systemPrompt = '') {
    const openaiMessages = this._convertMessages(messages, systemPrompt);
    const params = {
      model: this.model,
      max_tokens: this.maxTokens,
      messages: openaiMessages,
      stream: true,
    };
    if (tools.length > 0) {
      params.tools = this._convertTools(tools);
    }

    const openaiStream = await this.client.chat.completions.create(params);
    return this._normalizeStream(openaiStream);
  }
}
