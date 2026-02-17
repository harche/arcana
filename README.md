# Arcana

A chat interface for Claude with Model Context Protocol (MCP) server support, extended thinking, and persistent conversation history.

## Features

- **Multi-provider support** — Claude via Vertex AI, Anthropic API, or OpenAI-compatible endpoints
- **MCP server integration** — Connect HTTP and stdio-based MCP servers, with automatic tool discovery and execution
- **MCP Apps** — Interactive iframe-based tool UIs with JSON-RPC 2.0 communication
- **Extended thinking** — Collapsible thinking blocks showing Claude's reasoning
- **Streaming responses** — Real-time SSE streaming of thinking, text, and tool calls
- **Chat history** — SQLite-backed conversation persistence with a sidebar for browsing past chats
- **Markdown rendering** — Built-in renderer with tables, code blocks, and syntax highlighting
- **Tool use loop** — Automatic multi-turn tool execution (up to 10 iterations)

## Quick start

```bash
npm install
```

Set your provider credentials (Vertex AI is the default):

```bash
export VERTEX_PROJECT_ID=your-gcp-project-id
npm start
```

Open `http://localhost:4000`.

## Environment variables

| Variable | Description | Default |
|---|---|---|
| `AI_PROVIDER` | `vertex`, `anthropic`, `openai`, or `openai-compatible` | `vertex` |
| `VERTEX_PROJECT_ID` | GCP project ID (required for vertex) | — |
| `VERTEX_REGION` | GCP region | `us-east5` |
| `ANTHROPIC_API_KEY` | API key (required for anthropic) | — |
| `OPENAI_API_KEY` | API key (required for openai / openai-compatible) | — |
| `OPENAI_BASE_URL` | Base URL (required for openai-compatible) | — |
| `MODEL_ID` | Model to use | `claude-opus-4-6` / `gpt-4o` |
| `MAX_TOKENS` | Max response tokens | `16384` |
| `PORT` | Server port | `4000` |

## Architecture

```
server/
├── index.js                  # Express app setup
├── db.js                     # SQLite (WAL mode, foreign keys)
├── mcp-manager.js            # MCP server lifecycle & tool management
├── providers/
│   ├── index.js              # Provider factory
│   ├── anthropic-provider.js # Anthropic/Vertex wrapper
│   └── openai-provider.js    # OpenAI wrapper with stream normalization
└── routes/
    ├── chat.js               # SSE streaming chat endpoint
    ├── mcp.js                # MCP server management API
    ├── resources.js          # MCP resource fetching
    └── conversations.js      # Chat history CRUD API

public/
├── index.html                # Three-panel layout
├── app.js                    # Main chat application
├── history.js                # Sidebar conversation manager
├── mcp-config.js             # MCP server configuration UI
├── mcp-app-host.js           # MCP Apps iframe host
├── markdown.js               # Markdown-to-HTML renderer
└── style.css                 # Styles with CSS variables
```

**Tech stack:** Express, better-sqlite3, vanilla JS, SSE streaming. No frontend framework.

## License

[MIT](LICENSE)
