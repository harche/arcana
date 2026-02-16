import { AnthropicVertex } from '@anthropic-ai/vertex-sdk';

export class VertexClient {
  constructor() {
    this.client = new AnthropicVertex({
      projectId: 'itpc-gcp-hybrid-pe-eng-claude',
      region: 'us-east5',
    });
    this.model = 'claude-opus-4-6';
  }

  async sendMessage(messages, tools = [], systemPrompt = '') {
    const params = {
      model: this.model,
      max_tokens: 8192,
      messages,
    };
    if (tools.length > 0) params.tools = tools;
    if (systemPrompt) params.system = systemPrompt;

    return this.client.messages.create(params);
  }
}
