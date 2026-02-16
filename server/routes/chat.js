import { Router } from 'express';

function sendSSE(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
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

        const response = await vertexClient.sendMessage(
          conversationMessages, tools, system || ''
        );

        // Stream text blocks
        for (const block of response.content) {
          if (block.type === 'text') {
            sendSSE(res, 'text_delta', { text: block.text });
          }
        }

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
          sendSSE(res, 'tool_call', {
            id: toolUse.id,
            name: toolUse.name,
            input: toolUse.input,
          });

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

          console.log(`[MCP Result] Keys: ${Object.keys(result).join(', ')}`);
          if (result.structuredContent) console.log(`[MCP Result] structuredContent keys: ${Object.keys(result.structuredContent).join(', ')}`);
          if (result._meta) console.log(`[MCP Result] _meta keys: ${Object.keys(result._meta).join(', ')}`);

          sendSSE(res, 'tool_result', {
            tool_use_id: toolUse.id,
            content: result.content,
            isError: result.isError || false,
          });

          // Check for UI resource (MCP Apps)
          const toolMeta = mcpManager.getToolMeta(serverId, toolName);
          const uiUri = toolMeta?._meta?.ui?.resourceUri || toolMeta?._meta?.['ui/resourceUri'];
          console.log(`[MCP UI] Tool: ${toolName}, serverId: ${serverId}, uiUri: ${uiUri || 'none'}`);
          if (uiUri) {
            try {
              console.log(`[MCP UI] Fetching resource: ${uiUri} from server: ${serverId}`);
              const resource = await mcpManager.getResourceContent(serverId, uiUri);
              const html = resource.contents?.[0]?.text || '';
              console.log(`[MCP UI] Got HTML: ${html.length} chars`);
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
              console.log(`[MCP UI] Sent ui_resource SSE event`);
            } catch (uiErr) {
              console.error('UI resource fetch failed:', uiErr.message, uiErr.stack);
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
