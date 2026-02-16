import { Router } from 'express';

export function createMCPRouter(mcpManager) {
  const router = Router();

  // List all servers
  router.get('/servers', (req, res) => {
    res.json({ servers: mcpManager.getServers() });
  });

  // Add a server
  router.post('/servers', async (req, res) => {
    const { id, type, url, command, args, env } = req.body;

    if (!id) {
      return res.status(400).json({ error: 'id is required' });
    }

    let serverConfig;

    if (type === 'http') {
      if (!url) {
        return res.status(400).json({ error: 'url is required for http type' });
      }
      serverConfig = { type: 'http', url };
    } else {
      if (!command) {
        return res.status(400).json({ error: 'command is required for stdio type' });
      }
      // Parse env from "KEY=val KEY2=val2" string if needed
      let envObj = env || {};
      if (typeof env === 'string' && env.trim()) {
        envObj = {};
        env.trim().split(/\s+/).forEach(pair => {
          const eqIdx = pair.indexOf('=');
          if (eqIdx > 0) {
            envObj[pair.slice(0, eqIdx)] = pair.slice(eqIdx + 1);
          }
        });
      }
      serverConfig = {
        type: 'stdio',
        command,
        args: Array.isArray(args) ? args : (args || '').split(/\s+/).filter(Boolean),
        env: envObj,
      };
    }

    try {
      await mcpManager.addServer(id, serverConfig);
      res.json({ status: 'connected', servers: mcpManager.getServers() });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Remove a server
  router.delete('/servers/:id', async (req, res) => {
    try {
      await mcpManager.removeServer(req.params.id);
      res.json({ status: 'removed', servers: mcpManager.getServers() });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Debug: get raw tool metadata
  router.get('/servers/:id/tools-debug', (req, res) => {
    const meta = mcpManager.getToolMeta(req.params.id, 'prodisco_runSandbox');
    res.json({ tool: meta, hasUiMeta: !!meta?._meta });
  });

  // Reconnect a server
  router.post('/servers/:id/reconnect', async (req, res) => {
    try {
      await mcpManager.reconnectServer(req.params.id);
      res.json({ status: 'reconnected', servers: mcpManager.getServers() });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Proxy tool call (used by MCP App iframes)
  router.post('/tool-call', async (req, res) => {
    const { serverId, name, arguments: args } = req.body;

    if (!serverId || !name) {
      return res.status(400).json({ error: 'serverId and name are required' });
    }

    try {
      const result = await mcpManager.callTool(serverId, name, args || {});
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
