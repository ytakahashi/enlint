import type { AdviceOutcome, AdviceRequest, Advisor } from "#core/mod.ts";
import type { OpenAiAdviceCall, OpenAiAdviceRunner } from "./_types.ts";
import { buildOpenAiAdviceRequest } from "./prompt_builder.ts";
import { mapOpenAiAdviceResponse } from "./response_mapper.ts";

const DEFAULT_MODEL_ID = "gpt-5.6-luna";
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_TIMEOUT_MS = 30_000;

export type OpenAiErrorKind =
  | "authentication"
  | "rate-limit"
  | "timeout"
  | "connection";

export class OpenAiAdviceResponseError extends Error {
  override readonly name = "OpenAiAdviceResponseError";
}

export class OpenAiAdviceRefusalError extends Error {
  override readonly name = "OpenAiAdviceRefusalError";
  readonly refusal: string;

  constructor(refusal: string) {
    super("OpenAI refused to provide writing advice");
    this.refusal = refusal;
  }
}

class OpenAiSdkError extends Error {
  constructor(message: string, cause: unknown) {
    super(message, { cause });
  }
}

export class OpenAiAuthenticationError extends OpenAiSdkError {
  override readonly name = "OpenAiAuthenticationError";

  constructor(cause: unknown) {
    super("OpenAI authentication failed", cause);
  }
}

export class OpenAiRateLimitError extends OpenAiSdkError {
  override readonly name = "OpenAiRateLimitError";

  constructor(cause: unknown) {
    super("OpenAI rate limit was exceeded", cause);
  }
}

export class OpenAiTimeoutError extends OpenAiSdkError {
  override readonly name = "OpenAiTimeoutError";

  constructor(cause: unknown) {
    super("OpenAI request timed out", cause);
  }
}

export class OpenAiConnectionError extends OpenAiSdkError {
  override readonly name = "OpenAiConnectionError";

  constructor(cause: unknown) {
    super("OpenAI connection failed", cause);
  }
}

/** Classifies adapter errors without making callers load the optional SDK. */
export function classifyOpenAiError(
  error: unknown,
): OpenAiErrorKind | undefined {
  if (error instanceof OpenAiAuthenticationError) {
    return "authentication";
  }
  if (error instanceof OpenAiRateLimitError) {
    return "rate-limit";
  }
  if (error instanceof OpenAiTimeoutError) {
    return "timeout";
  }
  if (error instanceof OpenAiConnectionError) {
    return "connection";
  }
  return undefined;
}

/** Low-level SDK boundary exposed for live contract verification. */
export const runOpenAiAdvice: OpenAiAdviceRunner = async (
  { model, body, timeoutMs, maxRetries },
) => {
  // Loading the SDK initializes its environment-based authentication. Keep it
  // on the advice path so lint-only CLI runs do not load an unused provider.
  const { default: OpenAI } = await import("openai");

  try {
    const client = new OpenAI();
    const response = await client.responses.create(
      {
        model,
        input: body.input.map(({ role, content }) => ({ role, content })),
        text: {
          format: {
            ...body.text.format,
            schema: { ...body.text.format.schema },
          },
        },
        store: body.store,
      },
      { timeout: timeoutMs, maxRetries },
    );

    let refusal: string | undefined;
    for (const output of response.output) {
      if (output.type !== "message") {
        continue;
      }
      for (const content of output.content) {
        if (content.type === "refusal") {
          refusal ??= content.refusal;
        }
      }
    }

    return {
      status: response.status ?? "unknown",
      outputText: response.output_text,
      refusal,
      incompleteReason: response.incomplete_details?.reason,
    };
  } catch (error) {
    // Translate while the SDK constructors are available. Callers can then
    // classify failures synchronously without importing the SDK themselves.
    if (error instanceof OpenAI.AuthenticationError) {
      throw new OpenAiAuthenticationError(error);
    }
    if (error instanceof OpenAI.RateLimitError) {
      throw new OpenAiRateLimitError(error);
    }
    if (error instanceof OpenAI.APIConnectionTimeoutError) {
      throw new OpenAiTimeoutError(error);
    }
    if (error instanceof OpenAI.APIConnectionError) {
      throw new OpenAiConnectionError(error);
    }
    throw error;
  }
};

export class OpenAiAdvisor implements Advisor {
  readonly #model: string;
  readonly #timeoutMs: number;
  readonly #maxRetries: number;
  readonly #runResponse: OpenAiAdviceRunner;

  constructor(options: OpenAiAdvisorOptions = {}) {
    const model = options.model ?? DEFAULT_MODEL_ID;
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;

    if (model.trim().length === 0) {
      throw new TypeError("OpenAI advisor model must not be empty");
    }
    if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
      throw new RangeError("OpenAI advisor timeout must be a positive integer");
    }
    if (!Number.isInteger(maxRetries) || maxRetries < 0) {
      throw new RangeError(
        "OpenAI advisor retries must be a non-negative integer",
      );
    }

    this.#model = model;
    this.#timeoutMs = timeoutMs;
    this.#maxRetries = maxRetries;
    this.#runResponse = options.runResponse ?? runOpenAiAdvice;
  }

  async advise(request: AdviceRequest): Promise<AdviceOutcome> {
    const call: OpenAiAdviceCall = {
      model: this.#model,
      body: buildOpenAiAdviceRequest(request),
      timeoutMs: this.#timeoutMs,
      maxRetries: this.#maxRetries,
    };
    const response = await this.#runResponse(call);

    if (response.status !== "completed") {
      const reason = response.incompleteReason === undefined
        ? ""
        : `: ${response.incompleteReason}`;
      throw new OpenAiAdviceResponseError(
        `OpenAI advice response ended with status "${response.status}"${reason}`,
      );
    }
    if (response.refusal !== undefined) {
      throw new OpenAiAdviceRefusalError(response.refusal);
    }
    if (response.outputText.trim().length === 0) {
      throw new OpenAiAdviceResponseError(
        "OpenAI advice response contained no output text",
      );
    }

    return mapOpenAiAdviceResponse(request, response.outputText);
  }
}

export type OpenAiAdvisorOptions = {
  readonly model?: string;
  readonly timeoutMs?: number;
  readonly maxRetries?: number;
  readonly runResponse?: OpenAiAdviceRunner;
};
