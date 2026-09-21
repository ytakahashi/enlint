import type { MetricId, Status, ToneValue } from "#core/mod.ts";
import type {
  GoldenCorpus,
  GoldenPair,
  GoldenSendability,
  GoldenSeverity,
  GoldenSplit,
} from "./corpus.ts";

export type GoldenVariantName = "better" | "worse";

export type GoldenObservation = {
  readonly pairId: string;
  readonly variant: GoldenVariantName;
  readonly run: number;
  readonly overallScore: number;
  readonly metricScores: Readonly<Record<MetricId, number>>;
  readonly metricConfidences: Readonly<
    Partial<Record<MetricId, number>>
  >;
  readonly tone: ToneValue;
  readonly toneConfidence: number | undefined;
  readonly needsFixProbability: number;
  readonly status: Status;
  readonly focusSeverity: GoldenSeverity;
  readonly highestIssueSeverity: GoldenSeverity;
};

export type AggregatedGoldenVariant =
  & Omit<
    GoldenObservation,
    "run" | "metricConfidences" | "toneConfidence"
  >
  & {
    readonly metricConfidences: Readonly<
      Partial<Record<MetricId, number>>
    >;
    readonly toneConfidence: number | undefined;
  };

export type GoldenPairAnalysis = {
  readonly pair: GoldenPair;
  readonly better: AggregatedGoldenVariant;
  readonly worse: AggregatedGoldenVariant;
  readonly overallMargin: number;
  readonly focusMargin: number;
};

export type GoldenAnalysis = {
  readonly pairs: readonly GoldenPairAnalysis[];
  readonly overallOrderingRate: number;
  readonly focusOrderingRate: number;
  readonly sendabilityAccuracy: number;
  readonly severityAccuracy: number;
  readonly toneAccuracy: number;
  readonly statusIssueTensionRate: number;
};

export type DistributionSummary = {
  readonly count: number;
  readonly minimum: number;
  readonly p10: number;
  readonly median: number;
  readonly p90: number;
  readonly maximum: number;
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

export function analyzeGoldenCorpus(
  corpus: GoldenCorpus,
  observations: readonly GoldenObservation[],
  split?: GoldenSplit,
): GoldenAnalysis {
  const pairs = corpus.pairs
    .filter((pair) => split === undefined || pair.split === split)
    .map((pair) => analyzePair(pair, observations));
  if (pairs.length === 0) {
    throw new TypeError("golden analysis requires at least one pair");
  }

  const variants = pairs.flatMap(({ pair, better, worse }) => [
    { expected: pair.better.expected, actual: better },
    { expected: pair.worse.expected, actual: worse },
  ]);

  return {
    pairs,
    overallOrderingRate: fraction(
      pairs.filter(({ overallMargin }) => overallMargin > 0).length,
      pairs.length,
    ),
    focusOrderingRate: fraction(
      pairs.filter(({ focusMargin }) => focusMargin > 0).length,
      pairs.length,
    ),
    sendabilityAccuracy: fraction(
      variants.filter(({ expected, actual }) =>
        STATUS_BY_SENDABILITY[expected.sendability] === actual.status
      ).length,
      variants.length,
    ),
    severityAccuracy: fraction(
      variants.filter(({ expected, actual }) =>
        expected.focusSeverity === actual.focusSeverity
      ).length,
      variants.length,
    ),
    toneAccuracy: fraction(
      variants.filter(({ expected, actual }) =>
        expected.acceptableTones.includes(actual.tone)
      ).length,
      variants.length,
    ),
    statusIssueTensionRate: fraction(
      variants.filter(({ actual }) => hasStatusIssueTension(actual)).length,
      variants.length,
    ),
  };
}

export function confidenceDistributions(
  observations: readonly GoldenObservation[],
): {
  readonly metrics: DistributionSummary | undefined;
  readonly tone: DistributionSummary | undefined;
} {
  const metrics = observations.flatMap((observation) =>
    Object.values(observation.metricConfidences).filter(isNumber)
  );
  const tones = observations.map(({ toneConfidence }) => toneConfidence)
    .filter(isNumber);
  return {
    metrics: summarizeDistribution(metrics),
    tone: summarizeDistribution(tones),
  };
}

function analyzePair(
  pair: GoldenPair,
  observations: readonly GoldenObservation[],
): GoldenPairAnalysis {
  const better = aggregateVariant(pair, "better", observations);
  const worse = aggregateVariant(pair, "worse", observations);
  return {
    pair,
    better,
    worse,
    overallMargin: better.overallScore - worse.overallScore,
    focusMargin: better.metricScores[pair.focus] -
      worse.metricScores[pair.focus],
  };
}

function aggregateVariant(
  pair: GoldenPair,
  variant: GoldenVariantName,
  observations: readonly GoldenObservation[],
): AggregatedGoldenVariant {
  const matches = observations.filter((observation) =>
    observation.pairId === pair.id && observation.variant === variant
  );
  if (matches.length === 0) {
    throw new TypeError(
      `missing observations for golden pair "${pair.id}" ${variant}`,
    );
  }

  return {
    pairId: pair.id,
    variant,
    overallScore: median(matches.map(({ overallScore }) => overallScore)),
    metricScores: Object.fromEntries(
      METRIC_IDS.map((id) => [
        id,
        median(matches.map(({ metricScores }) => metricScores[id])),
      ]),
    ) as Record<MetricId, number>,
    metricConfidences: Object.fromEntries(
      METRIC_IDS.flatMap((id) => {
        const values = matches.map(({ metricConfidences }) =>
          metricConfidences[id]
        ).filter(isNumber);
        return values.length === 0 ? [] : [[id, median(values)]];
      }),
    ),
    tone: mode(matches.map(({ tone }) => tone)),
    toneConfidence: optionalMedian(
      matches.map(({ toneConfidence }) => toneConfidence).filter(isNumber),
    ),
    needsFixProbability: median(
      matches.map(({ needsFixProbability }) => needsFixProbability),
    ),
    status: mode(matches.map(({ status }) => status)),
    focusSeverity: mode(matches.map(({ focusSeverity }) => focusSeverity)),
    highestIssueSeverity: mode(
      matches.map(({ highestIssueSeverity }) => highestIssueSeverity),
    ),
  };
}

function hasStatusIssueTension(actual: AggregatedGoldenVariant): boolean {
  const severity = SEVERITY_ORDER[actual.highestIssueSeverity];
  return (actual.status === "ready" && severity >= SEVERITY_ORDER.medium) ||
    (actual.status === "needs-revision" && severity <= SEVERITY_ORDER.low);
}

function summarizeDistribution(
  values: readonly number[],
): DistributionSummary | undefined {
  if (values.length === 0) {
    return undefined;
  }
  const sorted = values.toSorted((left, right) => left - right);
  return {
    count: sorted.length,
    minimum: sorted[0],
    p10: percentile(sorted, 0.1),
    median: percentile(sorted, 0.5),
    p90: percentile(sorted, 0.9),
    maximum: sorted[sorted.length - 1],
  };
}

function percentile(sorted: readonly number[], fractionValue: number): number {
  const index = (sorted.length - 1) * fractionValue;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) {
    return sorted[lower];
  }
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function median(values: readonly number[]): number {
  if (values.length === 0) {
    throw new TypeError("median requires at least one value");
  }
  return percentile(values.toSorted((left, right) => left - right), 0.5);
}

function optionalMedian(values: readonly number[]): number | undefined {
  return values.length === 0 ? undefined : median(values);
}

function mode<T extends string>(values: readonly T[]): T {
  const counts = new Map<T, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return values.reduce((best, value) =>
    (counts.get(value) ?? 0) > (counts.get(best) ?? 0) ? value : best
  );
}

function fraction(numerator: number, denominator: number): number {
  return numerator / denominator;
}

function isNumber(value: number | undefined): value is number {
  return value !== undefined;
}
