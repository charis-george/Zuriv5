const Anthropic = require('@anthropic-ai/sdk');

const apiKey = process.env.ANTHROPIC_API_KEY;
const client = apiKey ? new Anthropic({ apiKey }) : null;

const DEFAULT_MODEL = 'claude-sonnet-4-20250514';

/**
 * Call Claude with system and user messages. Returns the text content or null if disabled/fails.
 * @param {string} systemPrompt
 * @param {string} userMessage
 * @param {{ maxTokens?: number }} options
 * @returns {Promise<string|null>}
 */
async function askClaude(systemPrompt, userMessage, options = {}) {
  if (!client) {
    console.warn('Claude AI: ANTHROPIC_API_KEY not set, skipping.');
    return null;
  }
  try {
    const response = await client.messages.create({
      model: options.model || DEFAULT_MODEL,
      max_tokens: options.maxTokens ?? 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }]
    });
    const textBlock = response.content?.find(b => b.type === 'text');
    return textBlock ? textBlock.text : null;
  } catch (err) {
    console.error('Claude API error:', err);
    return null;
  }
}

module.exports = { askClaude };
