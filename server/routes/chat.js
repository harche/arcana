import { Router } from 'express';

function sendSSE(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

// Consume the Anthropic streaming response event by event,
// forwarding thinking/text deltas to the client in real-time,
// and collecting the full content blocks for the tool-use loop.
async function consumeStream(stream, res) {
  const contentBlocks = [];
  let currentBlock = null;
  let stopReason = null;
  let thinkingText = '';
  let signatureText = '';
  let currentText = '';
  let currentInput = '';

  for await (const event of stream) {
    switch (event.type) {
      case 'content_block_start': {
        currentBlock = event.content_block;
        thinkingText = '';
        signatureText = '';
        currentText = '';
        currentInput = '';
        if (currentBlock.type === 'thinking') {
          sendSSE(res, 'thinking_start', {});
        }
        break;
      }

      case 'content_block_delta': {
        const delta = event.delta;
        if (delta.type === 'thinking_delta') {
          thinkingText += delta.thinking;
          sendSSE(res, 'thinking_delta', { text: delta.thinking });
        } else if (delta.type === 'signature_delta') {
          signatureText += delta.signature;
        } else if (delta.type === 'text_delta') {
          currentText += delta.text;
          sendSSE(res, 'text_delta', { text: delta.text });
        } else if (delta.type === 'input_json_delta') {
          currentInput += delta.partial_json;
        }
        break;
      }

      case 'content_block_stop': {
        if (currentBlock) {
          if (currentBlock.type === 'thinking') {
            contentBlocks.push({
              type: 'thinking',
              thinking: thinkingText,
              signature: signatureText,
            });
            sendSSE(res, 'thinking_end', {});
          } else if (currentBlock.type === 'text') {
            contentBlocks.push({ ...currentBlock, text: currentText });
          } else if (currentBlock.type === 'tool_use') {
            let parsedInput = {};
            try { parsedInput = JSON.parse(currentInput); } catch (_) {}
            const block = { ...currentBlock, input: parsedInput };
            contentBlocks.push(block);
            sendSSE(res, 'tool_call', {
              id: block.id,
              name: block.name,
              input: block.input,
            });
          } else {
            contentBlocks.push(currentBlock);
          }
        }
        currentBlock = null;
        break;
      }

      case 'message_delta': {
        stopReason = event.delta?.stop_reason || stopReason;
        break;
      }
    }
  }

  return { content: contentBlocks, stop_reason: stopReason };
}

export function createChatRouter(vertexClient, mcpManager) {
  const router = Router();

  router.post('/', async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const { messages, system } = req.body;
    const tools = mcpManager.getAnthropicTools();
    const conversationMessages = messages.map(m => ({ ...m }));

    let iterations = 0;
    const MAX_ITERATIONS = 10;

    try {
      while (iterations < MAX_ITERATIONS) {
        iterations++;

        const stream = await vertexClient.streamMessage(
          conversationMessages, tools, system || ''
        );

        // Consume stream, forwarding thinking/text deltas in real-time
        const response = await consumeStream(stream, res);

        if (response.stop_reason === 'end_turn' || response.stop_reason === 'max_tokens') {
          sendSSE(res, 'done', { stop_reason: response.stop_reason });
          break;
        }

        // Handle tool use
        const toolUseBlocks = response.content.filter(b => b.type === 'tool_use');
        if (toolUseBlocks.length === 0) {
          sendSSE(res, 'done', { stop_reason: response.stop_reason });
          break;
        }

        // Append assistant response to conversation
        conversationMessages.push({ role: 'assistant', content: response.content });

        // Execute each tool call
        const toolResults = [];
        for (const toolUse of toolUseBlocks) {
          const parts = toolUse.name.split('__');
          const serverId = parts[0];
          const toolName = parts.slice(1).join('__');

          let result;
          try {
            result = await mcpManager.callTool(serverId, toolName, toolUse.input);
          } catch (err) {
            result = {
              content: [{ type: 'text', text: `Error: ${err.message}` }],
              isError: true,
            };
          }

          sendSSE(res, 'tool_result', {
            tool_use_id: toolUse.id,
            content: result.content,
            isError: result.isError || false,
          });

          // Check for UI resource (MCP Apps)
          const toolMeta = mcpManager.getToolMeta(serverId, toolName);
          const uiUri = toolMeta?._meta?.ui?.resourceUri || toolMeta?._meta?.['ui/resourceUri'];
          if (uiUri) {
            try {
              const resource = await mcpManager.getResourceContent(serverId, uiUri);
              const html = resource.contents?.[0]?.text || '';
              sendSSE(res, 'ui_resource', {
                toolName: toolUse.name,
                toolUseId: toolUse.id,
                toolInput: toolUse.input,
                resourceUri: uiUri,
                html,
                toolDef: {
                  name: toolMeta.name,
                  description: toolMeta.description,
                  inputSchema: toolMeta.inputSchema,
                },
                toolResult: {
                  content: result.content || [],
                  structuredContent: result.structuredContent,
                  _meta: result._meta,
                  isError: result.isError || false,
                },
              });
            } catch (uiErr) {
              console.error('UI resource fetch failed:', uiErr.message);
            }
          }

          // Format tool result for Anthropic API
          const resultContent = result.content?.map(c => {
            if (c.type === 'text') return { type: 'text', text: c.text };
            if (c.type === 'image') return c;
            return { type: 'text', text: JSON.stringify(c) };
          }) || [{ type: 'text', text: 'No output' }];

          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: resultContent,
            is_error: result.isError || false,
          });
        }

        // Append tool results as user message
        conversationMessages.push({ role: 'user', content: toolResults });
      }

      if (iterations >= MAX_ITERATIONS) {
        sendSSE(res, 'error', { message: 'Maximum tool use iterations reached' });
      }
    } catch (error) {
      console.error('Chat error:', error);
      sendSSE(res, 'error', { message: error.message || 'Unknown error' });
    }

    res.end();
  });

  return router;
}
