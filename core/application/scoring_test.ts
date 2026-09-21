import { assertEquals, assertStrictEquals, assertThrows } from "@std/assert";
import { BUILT_IN_CONTEXT_PROFILES } from "../domain/context_profile.ts";
import type { RawScoreAnswer } from "../domain/evaluator.ts";
import {
  METRIC_DEFINITIONS,
  type MetricDefinition,
  type MetricId,
} from "../domain/metric.ts";
import {
  calculateScores,
  normalizeScore,
  resolveMetricDefinitions,
} from "./scoring.ts";

const PROBABILITIES = { "0": 0, "1": 0.1, "2": 0.2, "3": 0.6, "4": 0.1 };

function answers(
  rawLevels: Readonly<Record<MetricId, number>>,
): Readonly<Record<MetricId, RawScoreAnswer>> {
  const answer = (rawLevel: number): RawScoreAnswer => ({
    rawLevel,
    confidence: 0.8,
    probabilities: PROBABILITIES,
  });

  return {
    naturalness: answer(rawLevels.naturalness),
    grammar: answer(rawLevels.grammar),
    clarity: answer(rawLevels.clarity),
    contextFit: answer(rawLevels.contextFit),
  };
}

Deno.test("normalizeScore handles boundaries and fractional levels", () => {
  assertEquals(normalizeScore(0, 5), 0);
  assertEquals(normalizeScore(4, 5), 100);
  assertEquals(normalizeScore(2, 5), 50);
  assertEquals(normalizeScore(3.28, 5), 82);
});

Deno.test("normalizeScore rejects invalid ranges", () => {
  assertThrows(() => normalizeScore(0, 1), RangeError);
  assertThrows(() => normalizeScore(0, 2.5), RangeError);
  assertThrows(() => normalizeScore(-0.01, 5), RangeError);
  assertThrows(() => normalizeScore(4.01, 5), RangeError);
  assertThrows(() => normalizeScore(Number.NaN, 5), RangeError);
});

Deno.test("calculateScores preserves evidence and computes weighted score", () => {
  const metricAnswers = answers({
    naturalness: 3.28,
    grammar: 3.76,
    clarity: 3.6,
    contextFit: 2.92,
  });

  const result = calculateScores(METRIC_DEFINITIONS, metricAnswers);

  assertEquals(
    result.metrics.map(({ id, score, rawLevel, levelCount }) => ({
      id,
      score,
      rawLevel,
      levelCount,
    })),
    [
      { id: "naturalness", score: 82, rawLevel: 3.28, levelCount: 5 },
      { id: "grammar", score: 94, rawLevel: 3.76, levelCount: 5 },
      { id: "clarity", score: 90, rawLevel: 3.6, levelCount: 5 },
      { id: "contextFit", score: 73, rawLevel: 2.92, levelCount: 5 },
    ],
  );
  assertEquals(result.overallScore, 85);
  assertEquals(result.metrics[0].confidence, 0.8);
  assertStrictEquals(result.metrics[0].probabilities, PROBABILITIES);
});

Deno.test("resolveMetricDefinitions applies profile overrides immutably", () => {
  const profile = {
    ...BUILT_IN_CONTEXT_PROFILES.work,
    weights: {
      naturalness: 0.4,
      grammar: 0.2,
      clarity: 0.2,
      contextFit: 0.2,
    },
    criteriaOverrides: {
      grammar: ["Incorrect.", "Mostly correct.", "Correct."],
    },
  } as const;

  const resolved = resolveMetricDefinitions(METRIC_DEFINITIONS, profile);

  assertEquals(resolved.map(({ weight }) => weight), [0.4, 0.2, 0.2, 0.2]);
  assertEquals(resolved[1].levels, profile.criteriaOverrides.grammar);
  assertEquals(METRIC_DEFINITIONS[1].levels.length, 5);
  assertEquals(METRIC_DEFINITIONS[1].weight, 0.25);
});

Deno.test("scoring rejects invalid metric definitions", () => {
  assertThrows(
    () =>
      calculateScores(
        METRIC_DEFINITIONS.slice(0, 3),
        answers({
          naturalness: 4,
          grammar: 4,
          clarity: 4,
          contextFit: 4,
        }),
      ),
    TypeError,
    "metric definitions must contain every metric exactly once",
  );

  const duplicate = [
    ...METRIC_DEFINITIONS.slice(0, 3),
    METRIC_DEFINITIONS[0],
  ];
  assertThrows(
    () =>
      calculateScores(
        duplicate,
        answers({
          naturalness: 4,
          grammar: 4,
          clarity: 4,
          contextFit: 4,
        }),
      ),
    TypeError,
  );

  const invalidWeights: readonly MetricDefinition[] = METRIC_DEFINITIONS.map(
    (definition) => ({ ...definition, weight: 0.25 }),
  ).map((definition, index) =>
    index === 0 ? { ...definition, weight: 0.3 } : definition
  );
  assertThrows(
    () =>
      resolveMetricDefinitions(
        invalidWeights,
        BUILT_IN_CONTEXT_PROFILES.general,
      ),
    RangeError,
    "metric weights must sum to 1",
  );

  const invalidLevels: readonly MetricDefinition[] = METRIC_DEFINITIONS.map(
    (definition) =>
      definition.id === "grammar"
        ? { ...definition, levels: ["Only"] }
        : definition,
  );
  assertThrows(
    () =>
      resolveMetricDefinitions(
        invalidLevels,
        BUILT_IN_CONTEXT_PROFILES.general,
      ),
    RangeError,
    'metric "grammar" must define at least 2 levels',
  );
});
