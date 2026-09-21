import { METRIC_DEFINITIONS, type MetricId, type Status } from "#core/mod.ts";
import {
  type AggregatedGoldenVariant,
  analyzeGoldenCorpus,
  type GoldenObservation,
  type GoldenPairAnalysis,
  type GoldenVariantName,
} from "./analysis.ts";
import type {
  GoldenCorpus,
  GoldenPair,
  GoldenSendability,
  GoldenSeverity,
  GoldenSplit,
} from "./corpus.ts";

export type MetricWeights = Readonly<Record<MetricId, number>>;

export type WeightCandidate = {
  readonly weights: MetricWeights;
  readonly correctPairs: number;
  readonly meanMargin: number;
};

export type StatusThresholdCandidate = {
  readonly readyScore: number;
  readonly needsFixProbability: number;
  readonly errors: number;
  readonly cost: number;
};

export type IssueThresholdCandidate = {
  readonly readyScore: number;
  readonly mediumScore: number;
  readonly highScore: number;
  readonly errors: number;
  readonly cost: number;
};

const METRIC_IDS = [
  "naturalness",
  "grammar",
  "clarity",
  "contextFit",
] as const satisfies readonly MetricId[];

const STATUS_BY_SENDABILITY = {
  ready: "ready",
  improvable: "improvable",
  revise: "needs-revision",
} as const satisfies Readonly<Record<GoldenSendability, Status>>;

const SEVERITY_ORDER = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
} as const satisfies Readonly<Record<GoldenSeverity, number>>;

// Equivalent candidates should not produce a large recommendation solely from
// iteration order, so the search falls back to the configuration already in
// use. These are tie-breakers only and never contribute to the fit score.
//
// core/application/_thresholds.ts stays internal to Core, so the threshold
// references are copied here and tuning_test.ts asserts they stay in step. A
// stale copy would silently pull recommendations back toward the old values.
export const STATUS_SEARCH_REFERENCE = {
  readyScore: 85,
  needsFixProbability: 0.5,
};
export const ISSUE_SEARCH_REFERENCE = {
  readyScore: 80,
  mediumScore: 70,
  highScore: 55,
};
export const WEIGHT_SEARCH_REFERENCE: MetricWeights = Object.fromEntries(
  METRIC_DEFINITIONS.map(({ id, weight }) => [id, weight]),
) as MetricWeights;

export function findBestWeights(
  corpus: GoldenCorpus,
  observations: readonly GoldenObservation[],
  split: GoldenSplit = "calibration",
  step = 0.05,
  minimum = 0.1,
): WeightCandidate {
  const pairs = analyzeGoldenCorpus(corpus, observations, split).pairs;
  const units = Math.round(1 / step);
  const minimumUnits = Math.ceil(minimum / step);
  if (
    !Number.isFinite(step) || step <= 0 ||
    Math.abs(units * step - 1) > 1e-9 ||
    minimumUnits * METRIC_IDS.length > units
  ) {
    throw new RangeError(
      "weight step must divide 1 and leave room for every minimum weight",
    );
  }

  let best: WeightCandidate | undefined;
  for (const weights of weightCandidates(units, minimumUnits, step)) {
    const candidate = scoreWeights(pairs, weights);
    if (
      best === undefined || candidate.correctPairs > best.correctPairs ||
      (candidate.correctPairs === best.correctPairs &&
        (weightDistance(candidate.weights) < weightDistance(best.weights) ||
          (weightDistance(candidate.weights) === weightDistance(best.weights) &&
            candidate.meanMargin > best.meanMargin)))
    ) {
      best = candidate;
    }
  }

  if (best === undefined) {
    throw new Error("no valid weight candidates were generated");
  }
  return best;
}

export function evaluateWeights(
  corpus: GoldenCorpus,
  observations: readonly GoldenObservation[],
  weights: MetricWeights,
  split: GoldenSplit,
): WeightCandidate {
  return scoreWeights(
    analyzeGoldenCorpus(corpus, observations, split).pairs,
    weights,
  );
}

export function findBestStatusThresholds(
  corpus: GoldenCorpus,
  observations: readonly GoldenObservation[],
  split: GoldenSplit = "calibration",
): StatusThresholdCandidate {
  const variants = aggregatedVariants(corpus, observations, split);
  let best: StatusThresholdCandidate | undefined;

  for (let readyScore = 65; readyScore <= 95; readyScore++) {
    for (
      let probabilityUnits = 4;
      probabilityUnits <= 16;
      probabilityUnits++
    ) {
      const needsFixProbability = probabilityUnits * 0.05;
      const candidate = scoreStatusThresholds(
        variants,
        readyScore,
        needsFixProbability,
      );
      if (
        isBetterThresholdCandidate(candidate, best) ||
        (isEquivalentThresholdCandidate(candidate, best) &&
          statusThresholdDistance(candidate) < statusThresholdDistance(best))
      ) {
        best = candidate;
      }
    }
  }

  if (best === undefined) {
    throw new Error("no status threshold candidates were generated");
  }
  return best;
}

export function evaluateStatusThresholds(
  corpus: GoldenCorpus,
  observations: readonly GoldenObservation[],
  thresholds: Pick<
    StatusThresholdCandidate,
    "readyScore" | "needsFixProbability"
  >,
  split: GoldenSplit,
): StatusThresholdCandidate {
  return scoreStatusThresholds(
    aggregatedVariants(corpus, observations, split),
    thresholds.readyScore,
    thresholds.needsFixProbability,
  );
}

export function findBestIssueThresholds(
  corpus: GoldenCorpus,
  observations: readonly GoldenObservation[],
  split: GoldenSplit = "calibration",
): IssueThresholdCandidate {
  const variants = aggregatedVariants(corpus, observations, split);
  let best: IssueThresholdCandidate | undefined;

  for (let highScore = 30; highScore <= 60; highScore += 5) {
    for (
      let mediumScore = highScore + 5;
      mediumScore <= 80;
      mediumScore += 5
    ) {
      for (
        let readyScore = mediumScore + 5;
        readyScore <= 95;
        readyScore += 5
      ) {
        const candidate = scoreIssueThresholds(
          variants,
          readyScore,
          mediumScore,
          highScore,
        );
        if (
          isBetterThresholdCandidate(candidate, best) ||
          (isEquivalentThresholdCandidate(candidate, best) &&
            issueThresholdDistance(candidate) < issueThresholdDistance(best))
        ) {
          best = candidate;
        }
      }
    }
  }

  if (best === undefined) {
    throw new Error("no issue threshold candidates were generated");
  }
  return best;
}

export function evaluateIssueThresholds(
  corpus: GoldenCorpus,
  observations: readonly GoldenObservation[],
  thresholds: Pick<
    IssueThresholdCandidate,
    "readyScore" | "mediumScore" | "highScore"
  >,
  split: GoldenSplit,
): IssueThresholdCandidate {
  return scoreIssueThresholds(
    aggregatedVariants(corpus, observations, split),
    thresholds.readyScore,
    thresholds.mediumScore,
    thresholds.highScore,
  );
}

type AggregatedVariant = {
  readonly pair: GoldenPair;
  readonly expected: GoldenPair[GoldenVariantName]["expected"];
  readonly actual: AggregatedGoldenVariant;
};

function aggregatedVariants(
  corpus: GoldenCorpus,
  observations: readonly GoldenObservation[],
  split: GoldenSplit,
): readonly AggregatedVariant[] {
  return analyzeGoldenCorpus(corpus, observations, split).pairs.flatMap(
    ({ pair, better, worse }) => [
      { pair, expected: pair.better.expected, actual: better },
      { pair, expected: pair.worse.expected, actual: worse },
    ],
  );
}

function* weightCandidates(
  units: number,
  minimumUnits: number,
  step: number,
): Generator<MetricWeights> {
  for (
    let naturalness = minimumUnits;
    naturalness <= units - minimumUnits * 3;
    naturalness++
  ) {
    for (
      let grammar = minimumUnits;
      grammar <= units - naturalness - minimumUnits * 2;
      grammar++
    ) {
      for (
        let clarity = minimumUnits;
        clarity <= units - naturalness - grammar - minimumUnits;
        clarity++
      ) {
        const contextFit = units - naturalness - grammar - clarity;
        yield {
          naturalness: roundWeight(naturalness * step),
          grammar: roundWeight(grammar * step),
          clarity: roundWeight(clarity * step),
          contextFit: roundWeight(contextFit * step),
        };
      }
    }
  }
}

function scoreWeights(
  pairs: readonly GoldenPairAnalysis[],
  weights: MetricWeights,
): WeightCandidate {
  const margins = pairs.map(({ better, worse }) =>
    weightedScore(better.metricScores, weights) -
    weightedScore(worse.metricScores, weights)
  );
  return {
    weights,
    correctPairs: margins.filter((margin) => margin > 0).length,
    meanMargin: mean(margins),
  };
}

function weightedScore(
  scores: Readonly<Record<MetricId, number>>,
  weights: MetricWeights,
): number {
  return METRIC_IDS.reduce(
    (total, id) => total + scores[id] * weights[id],
    0,
  );
}

function weightDistance(weights: MetricWeights): number {
  return METRIC_IDS.reduce(
    (distance, id) =>
      distance + Math.abs(weights[id] - WEIGHT_SEARCH_REFERENCE[id]),
    0,
  );
}

function roundWeight(value: number): number {
  return Number(value.toFixed(12));
}

function predictStatus(
  overallScore: number,
  needsFixProbability: number,
  readyScore: number,
  needsFixThreshold: number,
): Status {
  if (needsFixProbability >= needsFixThreshold) {
    return "needs-revision";
  }
  return overallScore >= readyScore ? "ready" : "improvable";
}

function predictSeverity(
  score: number,
  readyScore: number,
  mediumScore: number,
  highScore: number,
): GoldenSeverity {
  if (score >= readyScore) {
    return "none";
  }
  if (score >= mediumScore) {
    return "low";
  }
  if (score >= highScore) {
    return "medium";
  }
  return "high";
}

function scoreStatusThresholds(
  variants: readonly AggregatedVariant[],
  readyScore: number,
  needsFixProbability: number,
): StatusThresholdCandidate {
  let errors = 0;
  let cost = 0;
  for (const { expected, actual } of variants) {
    const predicted = predictStatus(
      actual.overallScore,
      actual.needsFixProbability,
      readyScore,
      needsFixProbability,
    );
    const wanted = STATUS_BY_SENDABILITY[expected.sendability];
    if (predicted !== wanted) {
      errors++;
    }
    cost += statusErrorCost(wanted, predicted);
  }
  return { readyScore, needsFixProbability, errors, cost };
}

function scoreIssueThresholds(
  variants: readonly AggregatedVariant[],
  readyScore: number,
  mediumScore: number,
  highScore: number,
): IssueThresholdCandidate {
  let errors = 0;
  let cost = 0;
  for (const { pair, expected, actual } of variants) {
    const predicted = predictSeverity(
      actual.metricScores[pair.focus],
      readyScore,
      mediumScore,
      highScore,
    );
    if (predicted !== expected.focusSeverity) {
      errors++;
    }
    cost += Math.abs(
      SEVERITY_ORDER[predicted] - SEVERITY_ORDER[expected.focusSeverity],
    );
  }
  return { readyScore, mediumScore, highScore, errors, cost };
}

function statusErrorCost(expected: Status, actual: Status): number {
  if (expected === actual) {
    return 0;
  }
  // Calling a message ready when it needs revision is the most harmful error.
  if (expected === "needs-revision" && actual === "ready") {
    return 5;
  }
  if (expected === "ready" && actual === "needs-revision") {
    return 2;
  }
  return 1;
}

function isBetterThresholdCandidate<T extends { errors: number; cost: number }>(
  candidate: T,
  current: T | undefined,
): boolean {
  return current === undefined || candidate.cost < current.cost ||
    (candidate.cost === current.cost && candidate.errors < current.errors);
}

function isEquivalentThresholdCandidate<
  T extends { errors: number; cost: number },
>(candidate: T, current: T | undefined): current is T {
  return current !== undefined && candidate.cost === current.cost &&
    candidate.errors === current.errors;
}

function statusThresholdDistance(candidate: StatusThresholdCandidate): number {
  return Math.abs(candidate.readyScore - STATUS_SEARCH_REFERENCE.readyScore) +
    Math.abs(
        candidate.needsFixProbability -
          STATUS_SEARCH_REFERENCE.needsFixProbability,
      ) * 100;
}

function issueThresholdDistance(candidate: IssueThresholdCandidate): number {
  return Math.abs(candidate.readyScore - ISSUE_SEARCH_REFERENCE.readyScore) +
    Math.abs(candidate.mediumScore - ISSUE_SEARCH_REFERENCE.mediumScore) +
    Math.abs(candidate.highScore - ISSUE_SEARCH_REFERENCE.highScore);
}

function mean(values: readonly number[]): number {
  if (values.length === 0) {
    throw new TypeError("mean requires at least one value");
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
