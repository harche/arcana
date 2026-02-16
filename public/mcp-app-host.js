// MCP Apps iframe host - implements JSON-RPC 2.0 over postMessage
// Protocol: https://blog.modelcontextprotocol.io/posts/2025-11-21-mcp-apps/
(function() {
  class MCPAppHost {
    constructor() {
      this.bridges = new Map();
      this.nextId = 1;

      window.addEventListener('message', (event) => {
        for (const [id, bridge] of this.bridges) {
          if (event.source === bridge.iframe.contentWindow) {
            this.handleMessage(id, event.data);
            return;
          }
        }
      });
    }

    renderApp(container, html, toolUseId, toolName, toolInput, toolResult, toolDef) {
      const iframeId = `mcp-app-${this.nextId++}`;

      const iframe = document.createElement('iframe');
      iframe.id = iframeId;
      iframe.className = 'mcp-app';
      iframe.sandbox = 'allow-scripts';
      iframe.style.width = '100%';
      iframe.style.minHeight = '300px';
      iframe.style.border = 'none';
      iframe.style.background = 'white';
      iframe.style.borderRadius = '6px';

      this.bridges.set(iframeId, {
        iframe,
        toolUseId,
        toolName,
        toolInput: toolInput || {},
        toolResult: toolResult || { content: [], isError: false },
        toolDef: toolDef || { name: toolName, inputSchema: { type: 'object' } },
        initialized: false,
      });

      container.appendChild(iframe);

      // Set srcdoc after appending to DOM so contentWindow is available
      iframe.srcdoc = html;

      return iframeId;
    }

    handleMessage(iframeId, data) {
      if (!data || data.jsonrpc !== '2.0') return;
      const bridge = this.bridges.get(iframeId);
      if (!bridge) return;

      console.debug('[MCP App Host] Received:', data.method || `response:${data.id}`, data);

      if (data.method === 'ui/initialize') {
        // Respond with host capabilities matching the ext-apps schema
        this.sendResponse(bridge, data.id, {
          protocolVersion: '2026-01-26',
          hostInfo: { name: 'mcp-chat', version: '1.0.0' },
          hostCapabilities: {
            serverTools: { callTool: true },
          },
          hostContext: {
            toolInfo: {
              id: bridge.toolUseId || undefined,
              tool: bridge.toolDef,
            },
          },
        });
        bridge.initialized = true;
        console.debug('[MCP App Host] Initialized, sending tool data...');

        // The app sends ui/notifications/initialized after processing our response.
        // We defer sending tool data slightly to ensure the app is ready.
        setTimeout(() => {
          this.sendToolData(bridge);
        }, 50);

      } else if (data.method === 'ui/notifications/initialized') {
        // App confirmed initialization - send tool data now if not already sent
        if (!bridge.toolDataSent) {
          this.sendToolData(bridge);
        }
      } else if (data.method === 'tools/call') {
        this.proxyToolCall(bridge, data);
      } else if (data.method === 'ui/open-link') {
        const url = data.params?.uri;
        if (url && confirm(`MCP App wants to open: ${url}`)) {
          window.open(url, '_blank');
        }
        if (data.id) this.sendResponse(bridge, data.id, {});
      } else if (data.method === 'ui/notifications/size-changed') {
        // App reports its content size
        const height = data.params?.height;
        if (height && height > 0) {
          bridge.iframe.style.height = Math.min(height + 20, 800) + 'px';
        }
      } else if (data.id && !data.method) {
        // This is a response to something we sent - ignore
      } else {
        console.debug('[MCP App Host] Unhandled method:', data.method);
      }
    }

    sendToolData(bridge) {
      if (bridge.toolDataSent) return;
      bridge.toolDataSent = true;

      // Send tool input (arguments)
      this.sendNotification(bridge, 'ui/notifications/tool-input', {
        arguments: bridge.toolInput,
      });

      // Send tool result
      this.sendNotification(bridge, 'ui/notifications/tool-result', bridge.toolResult);

      console.debug('[MCP App Host] Sent tool-input and tool-result');
    }

    async proxyToolCall(bridge, request) {
      try {
        const response = await fetch('/api/mcp/tool-call', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            serverId: bridge.toolName?.split('__')[0] || '',
            name: request.params?.name || '',
            arguments: request.params?.arguments || {},
          }),
        });
        const result = await response.json();
        this.sendResponse(bridge, request.id, result);
      } catch (error) {
        this.sendError(bridge, request.id, -32000, error.message);
      }
    }

    sendResponse(bridge, id, result) {
      bridge.iframe.contentWindow?.postMessage({
        jsonrpc: '2.0',
        id,
        result,
      }, '*');
    }

    sendNotification(bridge, method, params) {
      bridge.iframe.contentWindow?.postMessage({
        jsonrpc: '2.0',
        method,
        params,
      }, '*');
    }

    sendError(bridge, id, code, message) {
      bridge.iframe.contentWindow?.postMessage({
        jsonrpc: '2.0',
        id,
        error: { code, message },
      }, '*');
    }
  }

  window.mcpAppHost = new MCPAppHost();
})();
