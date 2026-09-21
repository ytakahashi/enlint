import { assertEquals, assertThrows } from "@std/assert";
import { CLASSIFICATION_DEFINITIONS } from "#core/domain/classification.ts";
import { BUILT_IN_CONTEXT_PROFILES } from "#core/domain/context_profile.ts";
import type { EvaluationRequest } from "#core/domain/evaluator.ts";
import { JUDGEMENT_DEFINITIONS } from "#core/domain/judgement.ts";
import { METRIC_DEFINITIONS } from "#core/domain/metric.ts";
import { InvalidJevResponseError, mapJevResponse } from "./answer_mapper.ts";

type MutableFixture = {
  answers: Record<string, Record<string, unknown>>;
  model?: unknown;
  usage?: Record<string, unknown>;
};

const REQUEST: EvaluationRequest = {
  text: "Could you review this today?",
  profile: BUILT_IN_CONTEXT_PROFILES.work,
  metrics: METRIC_DEFINITIONS,
  classifications: CLASSIFICATION_DEFINITIONS,
  judgements: JUDGEMENT_DEFINITIONS,
};

async function fixture(
  name = "complete_response.json",
): Promise<MutableFixture> {
  const text = await Deno.readTextFile(
    new URL(`./_fixtures/${name}`, import.meta.url),
  );
  return JSON.parse(text) as MutableFixture;
}

Deno.test("mapJevResponse preserves required evidence and derives token totals", async () => {
  const outcome = mapJevResponse(REQUEST, await fixture());

  assertEquals(outcome.metrics.naturalness, {
    rawLevel: 3.28,
    confidence: 0.81,
    probabilities: { "0": 0, "1": 0, "2": 0, "3": 0.72, "4": 0.28 },
  });
  assertEquals(outcome.classifications.tone, {
    value: "slightly formal",
    confidence: 0.74,
    probabilities: {
      "very casual": 0.01,
      casual: 0.04,
      neutral: 0.2,
      "slightly formal": 0.65,
      formal: 0.1,
    },
  });
  assertEquals(outcome.judgements.needsFix, {
    probability: 0.31,
    confidence: undefined,
  });
  assertEquals(outcome.usage, {
    inputTokens: 120,
    outputTokens: 18,
    totalTokens: 138,
  });
});

Deno.test("mapJevResponse accepts valid response boundary values", async () => {
  const outcome = mapJevResponse(
    REQUEST,
    await fixture("boundary_response.json"),
  );

  assertEquals(outcome.metrics.naturalness.rawLevel, 0);
  assertEquals(outcome.metrics.grammar.rawLevel, 4);
  assertEquals(outcome.metrics.grammar.confidence, 1);
  assertEquals(outcome.judgements.needsFix.probability, 0);
  assertEquals(outcome.usage?.totalTokens, 0);
});

Deno.test("mapJevResponse accepts aggregate two-decimal rounding error", async () => {
  const response = await fixture();
  response.answers.clarity.score = 3.05;
  response.answers.clarity.probabilities = {
    "0": 0,
    "1": 0,
    "2": 0,
    "3": 1,
    "4": 0,
  };
  response.answers.tone.probabilities = {
    "very casual": 0,
    casual: 0.09,
    neutral: 0.3,
    // Five rounded values allow a total error of exactly 5 * 0.005 = 0.025.
    "slightly formal": 0.585,
    formal: 0,
  };

  const outcome = mapJevResponse(REQUEST, response);

  assertEquals(outcome.metrics.clarity.rawLevel, 3.05);
  assertEquals(outcome.classifications.tone.value, "slightly formal");
});

Deno.test("mapJevResponse rejects missing or mismatched answers", async () => {
  const missing = await fixture();
  delete missing.answers.grammar;
  assertThrows(
    () => mapJevResponse(REQUEST, missing),
    InvalidJevResponseError,
    "response must contain exactly one answer for every question",
  );

  const wrongType = await fixture();
  wrongType.answers.grammar.type = "choice";
  assertThrows(
    () => mapJevResponse(REQUEST, wrongType),
    InvalidJevResponseError,
    'question "grammar" must contain a score',
  );

  const unknownChoice = await fixture();
  unknownChoice.answers.tone.choice = "urgent";
  assertThrows(
    () => mapJevResponse(REQUEST, unknownChoice),
    InvalidJevResponseError,
    'question "tone" must select a defined choice',
  );
});

Deno.test("mapJevResponse rejects missing required evidence", async () => {
  for (const field of ["confidence", "probabilities"] as const) {
    const score = await fixture();
    delete score.answers.clarity[field];
    assertThrows(
      () => mapJevResponse(REQUEST, score),
      InvalidJevResponseError,
      `question "clarity" ${field}`,
    );

    const choice = await fixture();
    delete choice.answers.tone[field];
    assertThrows(
      () => mapJevResponse(REQUEST, choice),
      InvalidJevResponseError,
      `question "tone" ${field}`,
    );
  }
});

Deno.test("mapJevResponse rejects malformed evidence and usage", async () => {
  const badDistribution = await fixture();
  badDistribution.answers.clarity.probabilities = {
    "0": 0,
    "1": 0,
    "2": 0,
    "3": 0.2,
    "4": 0.2,
  };
  assertThrows(
    () => mapJevResponse(REQUEST, badDistribution),
    InvalidJevResponseError,
    'question "clarity" probabilities must sum to 1',
  );

  const badMean = await fixture();
  badMean.answers.clarity.score = 3.8;
  assertThrows(
    () => mapJevResponse(REQUEST, badMean),
    InvalidJevResponseError,
    "score must equal its probability-weighted mean",
  );

  const badUsage = await fixture();
  delete badUsage.usage?.output_tokens;
  assertThrows(
    () => mapJevResponse(REQUEST, badUsage),
    InvalidJevResponseError,
    "usage.output_tokens must be a non-negative integer",
  );
});
