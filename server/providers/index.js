const DEFAULTS = {
  vertex: { model: 'claude-opus-4-6' },
  anthropic: { model: 'claude-opus-4-6' },
  openai: { model: 'gpt-4o' },
  'openai-compatible': { model: 'gpt-4o' },
};

function detectProvider() {
  if (process.env.AI_PROVIDER) return process.env.AI_PROVIDER;
  if (process.env.VERTEX_PROJECT_ID || process.env.ANTHROPIC_VERTEX_PROJECT_ID) return 'vertex';
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  if (process.env.OPENAI_API_KEY && process.env.OPENAI_BASE_URL) return 'openai-compatible';
  if (process.env.OPENAI_API_KEY) return 'openai';
  throw new Error(
    'No AI provider credentials found. Set one of: VERTEX_PROJECT_ID / ANTHROPIC_VERTEX_PROJECT_ID, ANTHROPIC_API_KEY, OPENAI_API_KEY'
  );
}

export async function createProvider() {
  const provider = detectProvider();
  const maxTokens = parseInt(process.env.MAX_TOKENS, 10) || 16384;
  const model = process.env.MODEL_ID || DEFAULTS[provider]?.model || 'gpt-4o';

  switch (provider) {
    case 'vertex': {
      const projectId = process.env.VERTEX_PROJECT_ID || process.env.ANTHROPIC_VERTEX_PROJECT_ID;
      if (!projectId) {
        throw new Error('VERTEX_PROJECT_ID or ANTHROPIC_VERTEX_PROJECT_ID environment variable is required for vertex provider');
      }
      const { AnthropicVertex } = await import('@anthropic-ai/vertex-sdk');
      const { AnthropicProvider } = await import('./anthropic-provider.js');
      const client = new AnthropicVertex({
        projectId,
        region: process.env.VERTEX_REGION || 'us-east5',
      });
      return new AnthropicProvider(client, model, maxTokens);
    }

    case 'anthropic': {
      if (!process.env.ANTHROPIC_API_KEY) {
        throw new Error('ANTHROPIC_API_KEY environment variable is required for anthropic provider');
      }
      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      const { AnthropicProvider } = await import('./anthropic-provider.js');
      const client = new Anthropic();
      return new AnthropicProvider(client, model, maxTokens);
    }

    case 'openai': {
      if (!process.env.OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY environment variable is required for openai provider');
      }
      const { default: OpenAI } = await import('openai');
      const { OpenAIProvider } = await import('./openai-provider.js');
      const client = new OpenAI();
      return new OpenAIProvider(client, model, maxTokens);
    }

    case 'openai-compatible': {
      if (!process.env.OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY environment variable is required for openai-compatible provider');
      }
      if (!process.env.OPENAI_BASE_URL) {
        throw new Error('OPENAI_BASE_URL environment variable is required for openai-compatible provider');
      }
      const { default: OpenAI } = await import('openai');
      const { OpenAIProvider } = await import('./openai-provider.js');
      const client = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
        baseURL: process.env.OPENAI_BASE_URL,
      });
      return new OpenAIProvider(client, model, maxTokens);
    }

    default:
      throw new Error(`Unknown AI_PROVIDER: "${provider}". Must be one of: vertex, anthropic, openai, openai-compatible`);
  }
}
