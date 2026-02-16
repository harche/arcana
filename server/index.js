import express from 'express';
import { fileURLToPath } from 'url';
import path from 'path';
import { MCPManager } from './mcp-manager.js';
import { VertexClient } from './vertex-client.js';
import { createChatRouter } from './routes/chat.js';
import { createMCPRouter } from './routes/mcp.js';
import { createResourcesRouter } from './routes/resources.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const mcpManager = new MCPManager();
const vertexClient = new VertexClient();

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api/chat', createChatRouter(vertexClient, mcpManager));
app.use('/api/mcp', createMCPRouter(mcpManager));
app.use('/api/resources', createResourcesRouter(mcpManager));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`MCP Chat running on http://localhost:${PORT}`);
});
