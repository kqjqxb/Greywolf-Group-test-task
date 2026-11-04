import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { OUTPUT_SCHEMAS, type OutputKind } from './outputSchema';
import type { ModelProvider, ProviderCall, ProviderError, ProviderResult } from './provider';

/**
 * Claude (Anthropic Messages API) through the official SDK.
 * - Structured outputs: `output_config.format` with a JSON Schema derived from the Zod contract.
 *   The SDK helper moves constraints the API does not support (e.g. maxItems, minLength, pattern)
 *   into descriptions; our own Zod validation checks them afterwards.
 * - `effort: "low"`: extraction needs little reasoning, and lower effort keeps latency and cost down.
 * - No temperature/top_p/top_k: the current API version rejects them.
 */

/** Room for the full JSON result plus a little thinking; the test PDF needs ~2–3k output tokens. */
export const CLAUDE_MAX_TOKENS = 8_000;

/** JSON Schemas for `output_config.format`, built once from the Zod schemas. */
export const CLAUDE_OUTPUT_FORMATS: Record<OutputKind, Anthropic.JSONOutputFormat> = {
  analysis: { type: 'json_schema', schema: zodOutputFormat(OUTPUT_SCHEMAS.analysis).schema },
  summary: { type: 'json_schema', schema: zodOutputFormat(OUTPUT_SCHEMAS.summary).schema },
};

export interface ClaudeProviderOptions {
  apiKey: string;
  model: string;
  /** Injectable for tests; defaults to the global fetch. */
  fetch?: typeof fetch;
}

/** Maps an SDK exception to our category. Order matters: timeout is a subclass of connection error. */
function errorCategory(error: unknown): ProviderError {
  if (error instanceof Anthropic.RateLimitError) {
    return 'rate_limited';
  }
  if (
    error instanceof Anthropic.APIConnectionTimeoutError ||
    error instanceof Anthropic.APIUserAbortError
  ) {
    return 'timeout';
  }
  // 5xx/529 overloaded, 4xx (e.g. bad key) and network errors: try the next provider.
  return 'unavailable';
}

/** Joins the text blocks of the answer. Thinking blocks (adaptive thinking) come first and are skipped. */
function answerText(message: Anthropic.Message): string {
  return message.content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('');
}

async function callClaude(
  client: Anthropic,
  model: string,
  request: ProviderCall,
): Promise<ProviderResult> {
  try {
    const message = await client.messages.create(
      {
        model,
        max_tokens: CLAUDE_MAX_TOKENS,
        system: request.systemInstruction,
        messages: request.messages.map((m) => ({ role: m.role, content: m.text })),
        output_config: { effort: 'low', format: CLAUDE_OUTPUT_FORMATS[request.output] },
      },
      { timeout: request.timeoutMs },
    );

    // A refusal says nothing about the document; the next provider may answer it.
    if (message.stop_reason === 'refusal') {
      return { ok: false, error: 'refused' };
    }
    const usage = {
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
    };
    // Cut off at max_tokens: the JSON is incomplete, so return no text and let validation retry.
    if (message.stop_reason === 'max_tokens') {
      return { ok: true, text: '', usage };
    }
    return { ok: true, text: answerText(message), usage };
  } catch (error) {
    return { ok: false, error: errorCategory(error) };
  }
}

/**
 * Claude model as a provider of the chain. `maxRetries: 0`: the SDK must not retry on its own —
 * our chain decides between a retry and a fallback within the shared deadline.
 */
export function createClaudeProvider(options: ClaudeProviderOptions): ModelProvider {
  const client = new Anthropic({
    apiKey: options.apiKey,
    maxRetries: 0,
    ...(options.fetch ? { fetch: options.fetch } : {}),
  });
  return {
    model: options.model,
    paid: true,
    call: (request) => callClaude(client, options.model, request),
  };
}
