import type { ToneValue } from "#core/domain/classification.ts";
import type {
  EvaluationOutcome,
  EvaluationRequest,
  EvaluationUsage,
  RawBooleanAnswer,
  RawChoiceAnswer,
  RawScoreAnswer,
} from "#core/domain/evaluator.ts";
import type { JudgementId } from "#core/domain/judgement.ts";
import type { MetricId } from "#core/domain/metric.ts";

// The live contract test verifies that probabilities and scores use a
// two-decimal grid. The API does not expose that precision as metadata, so
// aggregate checks account for half a unit of error per contributing value.
const RESPONSE_VALUE_ROUNDING_ERROR = 0.005;
const PROBABILITY_COMPARISON_TOLERANCE = 1e-6;

export class InvalidJevResponseError extends Error {
  override readonly name = "InvalidJevResponseError";
}

export function mapJevResponse(
  request: EvaluationRequest,
  response: unknown,
): EvaluationOutcome {
  if (!isRecord(response) || !isRecord(response.answers)) {
    throw invalid("response must contain an answer map");
  }
  const answers = response.answers;
  const expectedIds = [
    ...request.metrics.map(({ id }) => id),
    ...request.classifications.map(({ id }) => id),
    ...request.judgements.map(({ id }) => id),
  ];
  if (new Set(expectedIds).size !== expectedIds.length) {
    throw invalid("evaluation request contains duplicate question IDs");
  }
  if (!hasExactKeys(answers, expectedIds)) {
    throw invalid(
      "response must contain exactly one answer for every question",
    );
  }

  const metrics = Object.fromEntries(
    request.metrics.map((definition) => [
      definition.id,
      mapScoreAnswer(
        answers[definition.id],
        definition.id,
        definition.levels.length,
      ),
    ]),
  ) as Record<MetricId, RawScoreAnswer>;
  const classifications = Object.fromEntries(
    request.classifications.map((definition) => [
      definition.id,
      mapChoiceAnswer(
        answers[definition.id],
        definition.id,
        Object.keys(definition.choices),
      ),
    ]),
  ) as Record<"tone", RawChoiceAnswer>;
  const judgements = Object.fromEntries(
    request.judgements.map((definition) => [
      definition.id,
      mapNoulAnswer(answers[definition.id], definition.id),
    ]),
  ) as Record<JudgementId, RawBooleanAnswer>;

  return {
    metrics,
    classifications,
    judgements,
    usage: mapUsage(response.usage),
  };
}

function mapScoreAnswer(
  value: unknown,
  id: string,
  levelCount: number,
): RawScoreAnswer {
  if (
    !isRecord(value) || value.type !== "score" ||
    !isFiniteNumber(value.score) || value.score < 0 ||
    value.score > levelCount - 1
  ) {
    throw invalid(
      `question "${id}" must contain a score from 0 to ${levelCount - 1}`,
    );
  }
  const confidence = requiredProbability(value.confidence, id, "confidence");
  const keys = Array.from({ length: levelCount }, (_, index) => String(index));
  const probabilities = mapDistribution(value.probabilities, keys, id);
  const mean = Object.entries(probabilities).reduce(
    (sum, [index, probability]) => sum + Number(index) * probability,
    0,
  );
  const meanTolerance = RESPONSE_VALUE_ROUNDING_ERROR + keys.reduce(
    (total, index) => total + Number(index) * RESPONSE_VALUE_ROUNDING_ERROR,
    0,
  );
  if (exceedsTolerance(Math.abs(mean - value.score), meanTolerance)) {
    throw invalid(
      `question "${id}" score must equal its probability-weighted mean`,
    );
  }
  return { rawLevel: value.score, confidence, probabilities };
}

function mapChoiceAnswer(
  value: unknown,
  id: string,
  choices: readonly string[],
): RawChoiceAnswer {
  if (
    !isRecord(value) || value.type !== "choice" ||
    typeof value.choice !== "string" || !choices.includes(value.choice)
  ) {
    throw invalid(`question "${id}" must select a defined choice`);
  }
  const confidence = requiredProbability(value.confidence, id, "confidence");
  const probabilities = mapDistribution(value.probabilities, choices, id);
  const selected = probabilities[value.choice];
  if (
    Object.values(probabilities).some((probability) =>
      probability > selected + PROBABILITY_COMPARISON_TOLERANCE
    )
  ) {
    throw invalid(`question "${id}" must select a highest-probability choice`);
  }
  return {
    value: value.choice as ToneValue,
    confidence,
    probabilities: probabilities as Readonly<Record<ToneValue, number>>,
  };
}

function mapNoulAnswer(value: unknown, id: string): RawBooleanAnswer {
  if (!isRecord(value) || value.type !== "noul" || !isProbability(value.noul)) {
    throw invalid(`question "${id}" must contain P(true) from 0 to 1`);
  }
  return { probability: value.noul, confidence: undefined };
}

function mapDistribution(
  value: unknown,
  keys: readonly string[],
  id: string,
): Readonly<Record<string, number>> {
  if (
    !isRecord(value) || !hasExactKeys(value, keys) ||
    !Object.values(value).every(isProbability)
  ) {
    throw invalid(
      `question "${id}" probabilities must cover every defined outcome`,
    );
  }
  const probabilities = value as Record<string, number>;
  const total = Object.values(probabilities).reduce(
    (sum, probability) => sum + probability,
    0,
  );
  const sumTolerance = keys.length * RESPONSE_VALUE_ROUNDING_ERROR;
  if (exceedsTolerance(Math.abs(total - 1), sumTolerance)) {
    throw invalid(`question "${id}" probabilities must sum to 1`);
  }
  return probabilities;
}

function requiredProbability(
  value: unknown,
  id: string,
  name: string,
): number {
  if (!isProbability(value)) {
    throw invalid(`question "${id}" ${name} must be from 0 to 1`);
  }
  return value;
}

function mapUsage(value: unknown): EvaluationUsage {
  if (!isRecord(value)) {
    throw invalid("usage must be an object");
  }
  const inputTokens = tokenCount(value.input_tokens, "input_tokens");
  const outputTokens = tokenCount(value.output_tokens, "output_tokens");
  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
  };
}

function tokenCount(value: unknown, name: string): number {
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw invalid(`usage.${name} must be a non-negative integer`);
  }
  return value as number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isProbability(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0 && value <= 1;
}

function exceedsTolerance(difference: number, tolerance: number): boolean {
  return difference - tolerance > Number.EPSILON * 10;
}

function hasExactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  return Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key));
}

function invalid(message: string): InvalidJevResponseError {
  return new InvalidJevResponseError(message);
}
