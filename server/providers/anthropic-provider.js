export class AnthropicProvider {
  constructor(client, model, maxTokens) {
    this.client = client;
    this.model = model;
    this.maxTokens = maxTokens;
  }

  async streamMessage(messages, tools = [], systemPrompt = '') {
    const params = {
      model: this.model,
      max_tokens: this.maxTokens,
      messages,
      thinking: {
        type: 'enabled',
        budget_tokens: 4096,
      },
      stream: true,
    };
    if (tools.length > 0) params.tools = tools;
    if (systemPrompt) params.system = systemPrompt;

    return this.client.messages.create(params);
  }
}
