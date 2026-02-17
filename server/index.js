import express from 'express';
import { fileURLToPath } from 'url';
import path from 'path';
import { MCPManager } from './mcp-manager.js';
import { createProvider } from './providers/index.js';
import { createChatRouter } from './routes/chat.js';
import { createMCPRouter } from './routes/mcp.js';
import { createResourcesRouter } from './routes/resources.js';
import { createConversationsRouter } from './routes/conversations.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const mcpManager = new MCPManager();
const aiProvider = await createProvider();

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api/chat', createChatRouter(aiProvider, mcpManager));
app.use('/api/mcp', createMCPRouter(mcpManager));
app.use('/api/resources', createResourcesRouter(mcpManager));
app.use('/api/conversations', createConversationsRouter());

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Arcana running on http://localhost:${PORT}`);
});
