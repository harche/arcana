import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { ToolListChangedNotificationSchema } from '@modelcontextprotocol/sdk/types.js';

export class MCPManager {
  constructor() {
    // serverId -> { config, client, transport, tools, resources, status }
    this.servers = new Map();
  }

  async addServer(id, config) {
    if (this.servers.has(id)) {
      throw new Error(`Server "${id}" already exists`);
    }

    let transport;
    if (config.type === 'http') {
      transport = new StreamableHTTPClientTransport(new URL(config.url));
    } else {
      transport = new StdioClientTransport({
        command: config.command,
        args: config.args || [],
        env: { ...process.env, ...(config.env || {}) },
      });
    }

    const client = new Client(
      { name: 'arcana', version: '1.0.0' },
      { capabilities: {} }
    );

    await client.connect(transport);

    let tools = [];
    let resources = [];

    try {
      const toolsResult = await client.listTools();
      tools = toolsResult.tools || [];
    } catch (_) {
      // Server may not support tools
    }

    try {
      const resourcesResult = await client.listResources();
      resources = resourcesResult.resources || [];
    } catch (_) {
      // Server may not support resources
    }

    const server = {
      config,
      client,
      transport,
      tools,
      resources,
      status: 'connected',
    };

    this.servers.set(id, server);

    // Handle disconnection
    transport.onclose = () => {
      server.status = 'disconnected';
      console.log(`MCP server "${id}" disconnected`);
    };

    // Listen for tool list changes
    client.setNotificationHandler(
      ToolListChangedNotificationSchema,
      async () => {
        try {
          const result = await client.listTools();
          server.tools = result.tools || [];
          console.log(`Tools updated for server "${id}": ${server.tools.map(t => t.name).join(', ')}`);
        } catch (_) {}
      }
    );

    console.log(`MCP server "${id}" connected. Tools: ${tools.map(t => t.name).join(', ') || 'none'}`);
    return server;
  }

  async removeServer(id) {
    const server = this.servers.get(id);
    if (!server) {
      throw new Error(`Server "${id}" not found`);
    }

    try {
      await server.client.close();
    } catch (_) {}

    this.servers.delete(id);
  }

  async reconnectServer(id) {
    const server = this.servers.get(id);
    if (!server) {
      throw new Error(`Server "${id}" not found`);
    }

    const config = server.config;
    await this.removeServer(id);
    return this.addServer(id, config);
  }

  getServers() {
    const result = [];
    for (const [id, server] of this.servers) {
      result.push({
        id,
        type: server.config.type || 'stdio',
        command: server.config.command,
        args: server.config.args,
        url: server.config.url,
        status: server.status,
        tools: server.tools.map(t => t.name),
        resourceCount: server.resources.length,
      });
    }
    return result;
  }

  getAnthropicTools() {
    const tools = [];
    for (const [serverId, server] of this.servers) {
      if (server.status !== 'connected') continue;
      for (const tool of server.tools) {
        tools.push({
          name: `${serverId}__${tool.name}`,
          description: tool.description || '',
          input_schema: tool.inputSchema,
        });
      }
    }
    return tools;
  }

  getToolMeta(serverId, toolName) {
    const server = this.servers.get(serverId);
    if (!server) return null;
    return server.tools.find(t => t.name === toolName) || null;
  }

  async callTool(serverId, toolName, args) {
    const server = this.servers.get(serverId);
    if (!server) {
      throw new Error(`Server "${serverId}" not found`);
    }
    if (server.status !== 'connected') {
      // Try to reconnect automatically
      try {
        await this.reconnectServer(serverId);
      } catch (e) {
        throw new Error(`Server "${serverId}" is disconnected and reconnection failed: ${e.message}`);
      }
    }

    try {
      return await server.client.callTool({ name: toolName, arguments: args });
    } catch (err) {
      // If we get a session/initialization error, try reconnecting once
      if (err.message?.includes('not initialized') || err.message?.includes('session')) {
        console.log(`[MCP] Reconnecting "${serverId}" after session error`);
        try {
          await this.reconnectServer(serverId);
          const reconnected = this.servers.get(serverId);
          return await reconnected.client.callTool({ name: toolName, arguments: args });
        } catch (reconnectErr) {
          throw new Error(`Reconnection failed: ${reconnectErr.message}`);
        }
      }
      throw err;
    }
  }

  async getResourceContent(serverId, uri) {
    const server = this.servers.get(serverId);
    if (!server) {
      throw new Error(`Server "${serverId}" not found`);
    }

    return server.client.readResource({ uri });
  }
}
