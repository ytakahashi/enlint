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

const PROBABILITY_TOLERANCE = 1e-6;

export class InvalidJevResponseError extends Error {
  override readonly name = "InvalidJevResponseError";
}

export function mapJevResponse(
  request: EvaluationRequest,
  response: unknown,
): EvaluationOutcome {
  if (!isRecord(response)) {
    throw invalid("response must contain an answer map");
  }
  const answers = response.answers;
  if (!isRecord(answers)) {
    throw invalid("response must contain an answer map");
  }

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

  const rounding = mapRounding(response.rounding);
  // Jev reports confidence as how concentrated a probability distribution is,
  // so it is returned for score and choice answers but never for boolean ones.
  const confidences = extractConfidences(response.providerMetadata, [
    ...request.metrics.map(({ id }) => id),
    ...request.classifications.map(({ id }) => id),
  ]);
  const metrics = Object.fromEntries(
    request.metrics.map((definition) => [
      definition.id,
      mapScoreAnswer(
        answers[definition.id],
        definition.id,
        definition.levels.length,
        confidences[definition.id],
        rounding.probabilityError,
        rounding.scoreError,
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
        confidences[definition.id],
        rounding.probabilityError,
      ),
    ]),
  ) as Record<"tone", RawChoiceAnswer>;
  const judgements = Object.fromEntries(
    request.judgements.map((definition) => [
      definition.id,
      mapBooleanAnswer(
        answers[definition.id],
        definition.id,
        confidences[definition.id],
      ),
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
  confidence: number | undefined,
  probabilityError: number,
  scoreError: number,
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

  const keys = Array.from({ length: levelCount }, (_, index) => String(index));
  const probabilities = mapDistribution(
    value.probabilities,
    keys,
    id,
    probabilityError,
  );
  if (probabilities !== undefined) {
    const mean = Object.entries(probabilities).reduce(
      (sum, [index, probability]) => sum + Number(index) * probability,
      0,
    );
    const meanRoundingError = keys.reduce(
      (sum, index) => sum + Number(index) * probabilityError,
      0,
    );
    if (
      Math.abs(mean - value.score) >
        PROBABILITY_TOLERANCE + meanRoundingError + scoreError
    ) {
      throw invalid(
        `question "${id}" score must equal its probability-weighted mean`,
      );
    }
  }

  return {
    rawLevel: value.score,
    confidence,
    probabilities,
  };
}

function mapChoiceAnswer(
  value: unknown,
  id: string,
  choices: readonly string[],
  confidence: number | undefined,
  probabilityError: number,
): RawChoiceAnswer {
  if (
    !isRecord(value) || value.type !== "choice" ||
    typeof value.choice !== "string" || !choices.includes(value.choice)
  ) {
    throw invalid(`question "${id}" must select a defined choice`);
  }

  const probabilities = mapDistribution(
    value.probabilities,
    choices,
    id,
    probabilityError,
  );
  if (probabilities !== undefined) {
    const selected = probabilities[value.choice];
    if (
      Object.values(probabilities).some((probability) =>
        probability > selected + PROBABILITY_TOLERANCE
      )
    ) {
      throw invalid(
        `question "${id}" must select a highest-probability choice`,
      );
    }
  }

  return {
    value: value.choice as ToneValue,
    confidence,
    probabilities: probabilities as
      | Readonly<Record<ToneValue, number>>
      | undefined,
  };
}

function mapBooleanAnswer(
  value: unknown,
  id: string,
  confidence: number | undefined,
): RawBooleanAnswer {
  if (
    !isRecord(value) || value.type !== "boolean" ||
    !isProbability(value.probability)
  ) {
    throw invalid(`question "${id}" must contain P(true) from 0 to 1`);
  }

  return { probability: value.probability, confidence };
}

function mapDistribution(
  value: unknown,
  keys: readonly string[],
  id: string,
  probabilityError: number,
): Readonly<Record<string, number>> | undefined {
  if (value === undefined) {
    return undefined;
  }
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
  if (
    Math.abs(total - 1) >
      PROBABILITY_TOLERANCE + keys.length * probabilityError
  ) {
    throw invalid(`question "${id}" probabilities must sum to 1`);
  }
  return probabilities;
}

function mapRounding(value: unknown): {
  probabilityError: number;
  scoreError: number;
} {
  if (value === undefined) {
    return { probabilityError: 0, scoreError: 0 };
  }
  if (!isRecord(value)) {
    throw invalid("rounding must be an object");
  }
  return {
    probabilityError: roundingError(
      value.probabilityDecimals,
      "probabilityDecimals",
    ),
    scoreError: roundingError(value.scoreDecimals, "scoreDecimals"),
  };
}

function roundingError(value: unknown, name: string): number {
  if (value === undefined) {
    return 0;
  }
  // IEEE-754 values beyond 15 decimal places cannot provide a meaningful
  // validation tolerance, so reject them at the adapter boundary.
  if (
    !Number.isInteger(value) || (value as number) < 0 || (value as number) > 15
  ) {
    throw invalid(`rounding.${name} must be an integer from 0 to 15`);
  }
  return 0.5 * 10 ** -(value as number);
}

function extractConfidences(
  providerMetadata: unknown,
  /** Score and choice question IDs only; boolean answers carry no confidence. */
  questionIds: readonly string[],
): Readonly<Record<string, number | undefined>> {
  if (providerMetadata === undefined) {
    return {};
  }
  if (!isRecord(providerMetadata)) {
    throw invalid("provider metadata must be an object");
  }

  const typesafe = providerMetadata.typesafe;
  if (typesafe === undefined) {
    return {};
  }
  if (!isRecord(typesafe)) {
    throw invalid("typesafe provider metadata must be an object");
  }

  const confidence = typesafe.confidence;
  if (confidence === undefined) {
    return {};
  }
  if (
    !isRecord(confidence) || !hasExactKeys(confidence, questionIds) ||
    !Object.values(confidence).every(isProbability)
  ) {
    throw invalid(
      "typesafe confidence must contain a probability for every score and choice question",
    );
  }

  return confidence as Record<string, number>;
}

function mapUsage(value: unknown): EvaluationUsage | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!isRecord(value)) {
    throw invalid("usage must be an object");
  }

  const inputTokens = tokenCount(value.inputTokens, "inputTokens");
  const outputTokens = tokenCount(value.outputTokens, "outputTokens");
  const totalTokens = tokenCount(value.totalTokens, "totalTokens");
  if (
    inputTokens === undefined && outputTokens === undefined &&
    totalTokens === undefined
  ) {
    return undefined;
  }
  return { inputTokens, outputTokens, totalTokens };
}

function tokenCount(value: unknown, name: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }
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
