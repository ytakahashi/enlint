import type { ContextProfile } from "../domain/context_profile.ts";
import type { RawScoreAnswer } from "../domain/evaluator.ts";
import type {
  MetricDefinition,
  MetricId,
  MetricResult,
} from "../domain/metric.ts";

const REQUIRED_METRIC_IDS = [
  "naturalness",
  "grammar",
  "clarity",
  "contextFit",
] as const satisfies readonly MetricId[];

const WEIGHT_SUM_TOLERANCE = 1e-9;

export type ScoringResult = {
  readonly metrics: readonly MetricResult[];
  readonly overallScore: number;
};

export function resolveMetricDefinitions(
  definitions: readonly MetricDefinition[],
  profile: ContextProfile,
): readonly MetricDefinition[] {
  const resolved = definitions.map((definition) => ({
    ...definition,
    levels: profile.criteriaOverrides?.[definition.id] ?? definition.levels,
    weight: profile.weights?.[definition.id] ?? definition.weight,
  }));

  validateMetricDefinitions(resolved);
  return resolved;
}

export function normalizeScore(rawLevel: number, levelCount: number): number {
  if (!Number.isInteger(levelCount) || levelCount < 2) {
    throw new RangeError("levelCount must be an integer of at least 2");
  }
  if (
    !Number.isFinite(rawLevel) || rawLevel < 0 || rawLevel > levelCount - 1
  ) {
    throw new RangeError(
      `rawLevel must be a finite number from 0 to ${levelCount - 1}`,
    );
  }

  return Math.round((rawLevel / (levelCount - 1)) * 100);
}

export function calculateScores(
  definitions: readonly MetricDefinition[],
  answers: Readonly<Record<MetricId, RawScoreAnswer>>,
): ScoringResult {
  validateMetricDefinitions(definitions);

  const metrics = definitions.map((definition): MetricResult => {
    const answer = answers[definition.id];
    if (answer === undefined) {
      throw new TypeError(`missing answer for metric "${definition.id}"`);
    }

    return {
      id: definition.id,
      score: normalizeScore(answer.rawLevel, definition.levels.length),
      rawLevel: answer.rawLevel,
      levelCount: definition.levels.length,
      confidence: answer.confidence,
      probabilities: answer.probabilities,
    };
  });

  const overallScore = Math.round(
    metrics.reduce(
      (sum, metric, index) => sum + metric.score * definitions[index].weight,
      0,
    ),
  );

  return { metrics, overallScore };
}

function validateMetricDefinitions(
  definitions: readonly MetricDefinition[],
): void {
  // Overall score semantics require every built-in metric exactly once.
  const ids = definitions.map(({ id }) => id);
  if (
    ids.length !== REQUIRED_METRIC_IDS.length ||
    REQUIRED_METRIC_IDS.some((id) =>
      ids.filter((value) => value === id).length !== 1
    )
  ) {
    throw new TypeError(
      "metric definitions must contain every metric exactly once",
    );
  }

  for (const definition of definitions) {
    if (definition.levels.length < 2) {
      throw new RangeError(
        `metric "${definition.id}" must define at least 2 levels`,
      );
    }
    if (!Number.isFinite(definition.weight) || definition.weight <= 0) {
      throw new RangeError(
        `metric "${definition.id}" weight must be a finite positive number`,
      );
    }
  }

  // Decimal weights are user-configurable, so tolerate floating-point noise.
  const totalWeight = definitions.reduce(
    (sum, definition) => sum + definition.weight,
    0,
  );
  if (Math.abs(totalWeight - 1) >= WEIGHT_SUM_TOLERANCE) {
    throw new RangeError("metric weights must sum to 1");
  }
}
