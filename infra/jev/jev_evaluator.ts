import type {
  EvaluationOutcome,
  EvaluationRequest,
  Evaluator,
} from "#core/domain/evaluator.ts";
import type { JevEvaluationRunner } from "./_types.ts";
import { mapJevResponse } from "./answer_mapper.ts";
import { buildJevInput } from "./question_builder.ts";

const MODEL_ID = "typesafe-ai/jev";
const MAX_RETRIES = 2;
// A measured evaluation takes well under a second, so this only bounds a call
// that has stopped making progress.
const REQUEST_TIMEOUT_MS = 5_000;

export class JevRequestTimeoutError extends Error {
  override readonly name = "JevRequestTimeoutError";
}

/**
 * Runs `call` under a wall-clock deadline.
 *
 * `maxRetries` bounds how many times a request may fail, not how long it may
 * take: a stalled connection never fails, so the deadline is enforced here.
 */
export async function withRequestTimeout<T>(
  timeoutMs: number,
  call: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await call(controller.signal);
  } catch (error) {
    // The controller is local, so an abort can only come from the timer.
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
  { model, state, questions, maxRetries, timeoutMs },
) => {
  // Loading the SDK initializes its authentication providers. Keep that work
  // on the real evaluation path so injected evaluators remain side-effect free.
  const { experimental_evaluate: evaluate } = await import("ai");
  const result = await withRequestTimeout(timeoutMs, (abortSignal) =>
    evaluate({
      model,
      state,
      // Spreading restores a mutable record for the SDK generic while
      // preserving the adapter's readonly boundary everywhere else.
      questions: { ...questions },
      maxRetries,
      abortSignal,
    }));

  return {
    answers: result.answers,
    rounding: result.rounding,
    usage: result.usage,
    providerMetadata: result.providerMetadata,
  };
};

export class JevEvaluator implements Evaluator {
  readonly #runEvaluation: JevEvaluationRunner;
  readonly #timeoutMs: number;

  constructor(options: JevEvaluatorOptions | JevEvaluationRunner = {}) {
    const resolved = typeof options === "function"
      ? { runEvaluation: options }
      : options;
    const timeoutMs = resolved.timeoutMs ?? REQUEST_TIMEOUT_MS;
    if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
      throw new RangeError("Jev evaluator timeout must be a positive integer");
    }

    this.#runEvaluation = resolved.runEvaluation ?? runJevEvaluation;
    this.#timeoutMs = timeoutMs;
  }

  async evaluate(request: EvaluationRequest): Promise<EvaluationOutcome> {
    const input = buildJevInput(request);
    const response = await this.#runEvaluation({
      model: MODEL_ID,
      state: input.state,
      questions: input.questions,
      maxRetries: MAX_RETRIES,
      timeoutMs: this.#timeoutMs,
    });

    return mapJevResponse(request, response);
  }
}

export type JevEvaluatorOptions = {
  readonly runEvaluation?: JevEvaluationRunner;
  /** Per-request deadline. Batch tools may need longer than the CLI default. */
  readonly timeoutMs?: number;
};
