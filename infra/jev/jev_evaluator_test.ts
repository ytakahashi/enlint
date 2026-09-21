import { assertEquals, assertRejects, assertStrictEquals } from "@std/assert";
import { CLASSIFICATION_DEFINITIONS } from "#core/domain/classification.ts";
import { BUILT_IN_CONTEXT_PROFILES } from "#core/domain/context_profile.ts";
import type { EvaluationRequest } from "#core/domain/evaluator.ts";
import { JUDGEMENT_DEFINITIONS } from "#core/domain/judgement.ts";
import { METRIC_DEFINITIONS } from "#core/domain/metric.ts";
import type { JevEvaluationOptions, JevEvaluationResponse } from "./_types.ts";
import {
  JevEvaluator,
  JevRequestTimeoutError,
  withRequestTimeout,
} from "./jev_evaluator.ts";

const REQUEST: EvaluationRequest = {
  text: "Could you review this today?",
  profile: BUILT_IN_CONTEXT_PROFILES.work,
  metrics: METRIC_DEFINITIONS,
  classifications: CLASSIFICATION_DEFINITIONS,
  judgements: JUDGEMENT_DEFINITIONS,
};

async function completeResponse(): Promise<JevEvaluationResponse> {
  const text = await Deno.readTextFile(
    new URL("./_fixtures/complete_response.json", import.meta.url),
  );
  return JSON.parse(text) as JevEvaluationResponse;
}

Deno.test("JevEvaluator sends configured SDK input and maps the response", async () => {
  const calls: JevEvaluationOptions[] = [];
  const response = await completeResponse();
  const evaluator = new JevEvaluator((options) => {
    calls.push(options);
    return Promise.resolve(response);
  });

  const outcome = await evaluator.evaluate(REQUEST);

  assertEquals(calls.length, 1);
  assertEquals(calls[0].model, "typesafe-ai/jev");
  assertEquals(calls[0].maxRetries, 2);
  assertEquals(calls[0].timeoutMs, 5_000);
  assertEquals(
    calls[0].state,
    `Context: ${BUILT_IN_CONTEXT_PROFILES.work.description}\n\nMessage:\nCould you review this today?`,
  );
  assertEquals(Object.keys(calls[0].questions), [
    "naturalness",
    "grammar",
    "clarity",
    "contextFit",
    "tone",
    "needsFix",
  ]);
  assertEquals(outcome.metrics.naturalness.rawLevel, 3.28);
  assertEquals(outcome.metrics.naturalness.confidence, 0.81);
  assertEquals(outcome.classifications.tone.value, "slightly formal");
  assertEquals(outcome.judgements.needsFix.probability, 0.31);
  assertEquals(outcome.usage?.totalTokens, 138);
});

Deno.test("JevEvaluator preserves runner errors for presentation mapping", async () => {
  const failure = new Error("gateway unavailable");
  const evaluator = new JevEvaluator(() => Promise.reject(failure));

  const caught = await assertRejects(() => evaluator.evaluate(REQUEST));

  assertStrictEquals(caught, failure);
});

Deno.test("withRequestTimeout returns the value and stops the deadline", async () => {
  assertEquals(
    await withRequestTimeout(5_000, () => Promise.resolve("done")),
    "done",
  );
});

Deno.test("withRequestTimeout aborts a call that stops making progress", async () => {
  let observed: AbortSignal | undefined;

  await assertRejects(
    () =>
      withRequestTimeout(10, (signal) => {
        observed = signal;
        // Mirrors a stalled connection: it settles only once aborted.
        return new Promise((_, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason));
        });
      }),
    JevRequestTimeoutError,
    "Jev evaluation did not respond within 10ms",
  );
  assertEquals(observed?.aborted, true);
});

Deno.test("withRequestTimeout preserves failures that are not the deadline", async () => {
  const failure = new Error("gateway unavailable");

  const caught = await assertRejects(() =>
    withRequestTimeout(5_000, () => Promise.reject(failure))
  );

  assertStrictEquals(caught, failure);
});
