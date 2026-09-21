import type {
  EvaluationOutcome,
  EvaluationRequest,
  Evaluator,
} from "#core/domain/evaluator.ts";
import type { Questions } from "@typesafe-ai/sdk";
import type { JevEvaluationRunner, JevQuestion } from "./_types.ts";
import { mapJevResponse } from "./answer_mapper.ts";
import { buildJevInput } from "./question_builder.ts";

export const JEV_MODEL_ID = "jev-latest";
const BASE_URL = "https://api.typesafe.ai";
const MAX_RETRIES = 2;
const REQUEST_TIMEOUT_MS = 5_000;

export type JevErrorKind =
  | "authentication"
  | "rate-limit"
  | "timeout"
  | "connection";

class JevSdkError extends Error {
  constructor(message: string, cause: unknown) {
    super(message, { cause });
  }
}

export class JevAuthenticationError extends JevSdkError {
  override readonly name = "JevAuthenticationError";

  constructor(cause: unknown) {
    super("Jev authentication failed", cause);
  }
}

export class JevRateLimitError extends JevSdkError {
  override readonly name = "JevRateLimitError";

  constructor(cause: unknown) {
    super("Jev service is unavailable after retrying", cause);
  }
}

export class JevTimeoutError extends JevSdkError {
  override readonly name = "JevTimeoutError";

  constructor(cause: unknown) {
    super("Jev request timed out", cause);
  }
}

export class JevConnectionError extends JevSdkError {
  override readonly name = "JevConnectionError";

  constructor(cause: unknown) {
    super("Jev connection failed", cause);
  }
}

export class JevRequestTimeoutError extends Error {
  override readonly name = "JevRequestTimeoutError";
}

/** Classifies adapter errors without making callers load the optional SDK. */
export function classifyJevError(error: unknown): JevErrorKind | undefined {
  if (error instanceof JevAuthenticationError) return "authentication";
  if (error instanceof JevRateLimitError) return "rate-limit";
  if (
    error instanceof JevTimeoutError ||
    error instanceof JevRequestTimeoutError
  ) {
    return "timeout";
  }
  if (error instanceof JevConnectionError) return "connection";
  return undefined;
}

/** Runs `call` under a wall-clock deadline, including retry delays. */
export async function withRequestTimeout<T>(
  timeoutMs: number,
  call: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await call(controller.signal);
  } catch (error) {
    if (controller.signal.aborted) {
      throw new JevRequestTimeoutError(
        `Jev evaluation did not respond within ${timeoutMs}ms`,
      );
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/** Low-level SDK boundary exposed for live contract verification. */
export const runJevEvaluation: JevEvaluationRunner = async (
  { apiKey, model, state, questions, maxRetries, timeoutMs },
) => {
  const sdk = await import("@typesafe-ai/sdk");
  if (apiKey.trim().length === 0) {
    throw new JevAuthenticationError(new Error("TypeSafe API key is missing"));
  }

  try {
    const client = new sdk.TypeSafeClient({
      apiKey,
      // Specify every env-backed option so the SDK never reads process.env.
      baseURL: BASE_URL,
      defaultModel: JEV_MODEL_ID,
      logLevel: "off",
    });
    const result = await withRequestTimeout(
      timeoutMs,
      (signal) =>
        client.systemOne(
          {
            model,
            state,
            questions: toSdkQuestions(questions),
          },
          {
            signal,
            timeout: timeoutMs,
            retry: { maxRetries },
          },
        ),
    );

    return {
      answers: result.answers,
      model: result.model,
      usage: result.usage,
    };
  } catch (error) {
    if (
      error instanceof sdk.AuthenticationError ||
      error instanceof sdk.PermissionDeniedError
    ) {
      throw new JevAuthenticationError(error);
    }
    if (
      error instanceof sdk.RateLimitError ||
      error instanceof sdk.InternalServerError
    ) {
      throw new JevRateLimitError(error);
    }
    if (error instanceof sdk.APITimeoutError) {
      throw new JevTimeoutError(error);
    }
    if (error instanceof sdk.APIConnectionError) {
      throw new JevConnectionError(error);
    }
    throw error;
  }
};

/** Lists model names for live contract verification. */
export async function listJevModels(
  apiKey: string,
  timeoutMs: number,
): Promise<readonly string[]> {
  const { TypeSafeClient } = await import("@typesafe-ai/sdk");
  const client = new TypeSafeClient({
    apiKey,
    baseURL: BASE_URL,
    defaultModel: JEV_MODEL_ID,
    logLevel: "off",
  });
  const models = await withRequestTimeout(
    timeoutMs,
    (signal) =>
      client.models.list({
        signal,
        timeout: timeoutMs,
        retry: { maxRetries: MAX_RETRIES },
      }),
  );
  return models.map(({ name }) => name);
}

function toSdkQuestions(
  questions: Readonly<Record<string, JevQuestion>>,
): Questions {
  return Object.fromEntries(
    Object.entries(questions).map(([id, question]) => {
      if (question.type !== "score") return [id, question];
      const [first, second, ...rest] = question.criteria;
      // The SDK requires at least two score criteria. Enforce that invariant at
      // the conversion point instead of asserting a tuple type unsafely.
      if (first === undefined || second === undefined) {
        throw new TypeError(
          `score question "${id}" must contain at least two criteria`,
        );
      }
      return [id, {
        ...question,
        criteria: [first, second, ...rest] as const,
      }];
    }),
  );
}

export class JevEvaluator implements Evaluator {
  readonly #apiKey: string;
  readonly #runEvaluation: JevEvaluationRunner;
  readonly #timeoutMs: number;

  constructor(options: JevEvaluatorOptions) {
    const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
    if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
      throw new RangeError("Jev evaluator timeout must be a positive integer");
    }
    this.#apiKey = options.apiKey;
    this.#runEvaluation = options.runEvaluation ?? runJevEvaluation;
    this.#timeoutMs = timeoutMs;
  }

  async evaluate(request: EvaluationRequest): Promise<EvaluationOutcome> {
    const input = buildJevInput(request);
    const response = await this.#runEvaluation({
      apiKey: this.#apiKey,
      model: JEV_MODEL_ID,
      state: input.state,
      questions: input.questions,
      maxRetries: MAX_RETRIES,
      timeoutMs: this.#timeoutMs,
    });
    return mapJevResponse(request, response);
  }
}

export type JevEvaluatorOptions = {
  readonly apiKey: string;
  readonly runEvaluation?: JevEvaluationRunner;
  /** Per-request deadline. Batch tools may need longer than the CLI default. */
  readonly timeoutMs?: number;
};
