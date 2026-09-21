import { assertEquals, assertStrictEquals, assertThrows } from "@std/assert";
import { CLASSIFICATION_DEFINITIONS } from "#core/domain/classification.ts";
import { BUILT_IN_CONTEXT_PROFILES } from "#core/domain/context_profile.ts";
import type { EvaluationRequest } from "#core/domain/evaluator.ts";
import { JUDGEMENT_DEFINITIONS } from "#core/domain/judgement.ts";
import { METRIC_DEFINITIONS } from "#core/domain/metric.ts";
import { InvalidJevResponseError, mapJevResponse } from "./answer_mapper.ts";

type MutableFixture = {
  answers: Record<string, Record<string, unknown>>;
  rounding?: Record<string, unknown>;
  usage?: Record<string, unknown>;
  providerMetadata?: Record<string, unknown>;
};

const REQUEST: EvaluationRequest = {
  text: "Could you review this today?",
  profile: BUILT_IN_CONTEXT_PROFILES.work,
  metrics: METRIC_DEFINITIONS,
  classifications: CLASSIFICATION_DEFINITIONS,
  judgements: JUDGEMENT_DEFINITIONS,
};

async function fixture(name: string): Promise<MutableFixture> {
  const text = await Deno.readTextFile(
    new URL(`./_fixtures/${name}`, import.meta.url),
  );
  return JSON.parse(text) as MutableFixture;
}

Deno.test("mapJevResponse preserves complete answers, confidence, and usage", async () => {
  const response = await fixture("complete_response.json");

  const outcome = mapJevResponse(REQUEST, response);

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
  // Jev returns no confidence for boolean answers.
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

Deno.test("mapJevResponse accepts omitted optional evidence", async () => {
  const response = await fixture("minimal_response.json");

  const outcome = mapJevResponse(REQUEST, response);

  assertEquals(outcome.metrics.grammar, {
    rawLevel: 4,
    confidence: undefined,
    probabilities: undefined,
  });
  assertEquals(outcome.classifications.tone, {
    value: "neutral",
    confidence: undefined,
    probabilities: undefined,
  });
  assertEquals(outcome.judgements.needsFix, {
    probability: 0.1,
    confidence: undefined,
  });
  assertEquals(outcome.usage, undefined);
});

Deno.test("mapJevResponse honors declared rounding precision", async () => {
  const response = await fixture("complete_response.json");
  response.answers.clarity.probabilities = {
    "0": 0,
    "1": 0,
    "2": 0,
    "3": 0.4,
    "4": 0.59,
  };

  const outcome = mapJevResponse(REQUEST, response);

  assertEquals(outcome.metrics.clarity.rawLevel, 3.6);

  const badRounding = await fixture("complete_response.json");
  if (badRounding.rounding !== undefined) {
    badRounding.rounding.probabilityDecimals = 16;
  }
  assertThrows(
    () => mapJevResponse(REQUEST, badRounding),
    InvalidJevResponseError,
    "rounding.probabilityDecimals must be an integer from 0 to 15",
  );
});

Deno.test("mapJevResponse rejects missing or mismatched answers", async () => {
  const missing = await fixture("complete_response.json");
  delete missing.answers.grammar;
  assertThrows(
    () => mapJevResponse(REQUEST, missing),
    InvalidJevResponseError,
    "response must contain exactly one answer for every question",
  );

  const wrongType = await fixture("complete_response.json");
  wrongType.answers.grammar.type = "choice";
  assertThrows(
    () => mapJevResponse(REQUEST, wrongType),
    InvalidJevResponseError,
    'question "grammar" must contain a score',
  );

  const unknownChoice = await fixture("complete_response.json");
  unknownChoice.answers.tone.choice = "urgent";
  assertThrows(
    () => mapJevResponse(REQUEST, unknownChoice),
    InvalidJevResponseError,
    'question "tone" must select a defined choice',
  );
});

Deno.test("mapJevResponse rejects malformed evidence and metadata", async () => {
  const badDistribution = await fixture("complete_response.json");
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

  const badConfidence = await fixture("complete_response.json");
  const typesafe = badConfidence.providerMetadata?.typesafe as
    | Record<string, unknown>
    | undefined;
  const confidence = typesafe?.confidence as
    | Record<string, unknown>
    | undefined;
  assertStrictEquals(confidence !== undefined, true);
  delete confidence?.tone;
  assertThrows(
    () => mapJevResponse(REQUEST, badConfidence),
    InvalidJevResponseError,
    "typesafe confidence must contain a probability for every score and choice question",
  );

  const booleanConfidence = await fixture("complete_response.json");
  const booleanTypesafe = booleanConfidence.providerMetadata?.typesafe as
    | Record<string, Record<string, unknown>>
    | undefined;
  booleanTypesafe!.confidence.needsFix = 0.82;
  assertThrows(
    () => mapJevResponse(REQUEST, booleanConfidence),
    InvalidJevResponseError,
    "typesafe confidence must contain a probability for every score and choice question",
  );
});
