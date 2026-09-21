import { assert, assertEquals } from "@std/assert";
import { METRIC_DEFINITIONS, type MetricId } from "#core/mod.ts";
// Reaching into Core's internal thresholds is deliberate: this file exists to
// prove the tuning references still mirror the shipped configuration.
import {
  HIGH_ISSUE_SCORE_THRESHOLD,
  ISSUE_FREE_SCORE_THRESHOLD,
  MEDIUM_ISSUE_SCORE_THRESHOLD,
  NEEDS_FIX_PROBABILITY_THRESHOLD,
  READY_STATUS_SCORE_THRESHOLD,
} from "#core/application/_thresholds.ts";
import type { GoldenObservation } from "./analysis.ts";
import { type GoldenPair, parseGoldenCorpus } from "./corpus.ts";
import {
  evaluateStatusThresholds,
  findBestIssueThresholds,
  findBestStatusThresholds,
  findBestWeights,
  ISSUE_SEARCH_REFERENCE,
  STATUS_SEARCH_REFERENCE,
  WEIGHT_SEARCH_REFERENCE,
} from "./tuning.ts";

Deno.test("search references mirror the shipped configuration", () => {
  assertEquals(STATUS_SEARCH_REFERENCE, {
    readyScore: READY_STATUS_SCORE_THRESHOLD,
    needsFixProbability: NEEDS_FIX_PROBABILITY_THRESHOLD,
  });
  assertEquals(ISSUE_SEARCH_REFERENCE, {
    readyScore: ISSUE_FREE_SCORE_THRESHOLD,
    mediumScore: MEDIUM_ISSUE_SCORE_THRESHOLD,
    highScore: HIGH_ISSUE_SCORE_THRESHOLD,
  });
  assertEquals<Record<string, number>>(
    { ...WEIGHT_SEARCH_REFERENCE },
    Object.fromEntries(
      METRIC_DEFINITIONS.map(({ id, weight }) => [id, weight]),
    ),
  );
});

Deno.test("findBestWeights keeps an equally accurate baseline", () => {
  const candidate = findBestWeights(BALANCED_CORPUS, BALANCED_OBSERVATIONS);

  assertEquals(candidate.correctPairs, 1);
  assertEquals(candidate.weights, WEIGHT_SEARCH_REFERENCE);
});

Deno.test("threshold searches preserve ordering and fit labeled examples", () => {
  const status = findBestStatusThresholds(
    BALANCED_CORPUS,
    BALANCED_OBSERVATIONS,
  );
  const issue = findBestIssueThresholds(BALANCED_CORPUS, BALANCED_OBSERVATIONS);

  assertEquals(status.errors, 0);
  assertEquals(issue.errors, 0);
  assert(issue.highScore < issue.mediumScore);
  assert(issue.mediumScore < issue.readyScore);
});

Deno.test("findBestIssueThresholds moves away from the reference when the labels require it", () => {
  // Focus scores 75/72/62/50 can only be labelled none/low/medium/high by a
  // ready cutoff of 75, which the shipped 80 gets wrong.
  const best = findBestIssueThresholds(SEVERITY_CORPUS, SEVERITY_OBSERVATIONS);

  assertEquals(best.errors, 0);
  // Among the zero-error candidates the tie-breaker keeps the two thresholds
  // that need no change.
  assertEquals(best, {
    readyScore: 75,
    mediumScore: ISSUE_SEARCH_REFERENCE.mediumScore,
    highScore: ISSUE_SEARCH_REFERENCE.highScore,
    errors: 0,
    cost: 0,
  });
});

Deno.test("status scoring penalizes a false ready more than a false revise", () => {
  const scored = evaluateStatusThresholds(
    STATUS_COST_CORPUS,
    STATUS_COST_OBSERVATIONS,
    STATUS_SEARCH_REFERENCE,
    "calibration",
  );

  // One message is wrongly called ready (5) and one wrongly called
  // needs-revision (2); a symmetric cost would make these two errors equal.
  assertEquals(scored.errors, 2);
  assertEquals(scored.cost, 7);
});

const BALANCED_CORPUS = parseGoldenCorpus({
  version: 1,
  pairs: [
    pair("grammar-01", "grammar", {
      better: ["ready", "none"],
      worse: ["revise", "high"],
    }),
  ],
});

const BALANCED_OBSERVATIONS = [
  observation("grammar-01", "better", 90, scores(90, 90, 90, 90), 0.1),
  observation("grammar-01", "worse", 64, scores(80, 30, 80, 80), 0.9),
] as const satisfies readonly GoldenObservation[];

const SEVERITY_CORPUS = parseGoldenCorpus({
  version: 1,
  pairs: [
    pair("grammar-near", "grammar", {
      better: ["ready", "none"],
      worse: ["improvable", "low"],
    }),
    pair("grammar-far", "grammar", {
      better: ["improvable", "medium"],
      worse: ["revise", "high"],
    }),
  ],
});

const SEVERITY_OBSERVATIONS = [
  observation("grammar-near", "better", 90, scores(90, 75, 90, 90), 0.1),
  observation("grammar-near", "worse", 88, scores(90, 72, 90, 90), 0.1),
  observation("grammar-far", "better", 84, scores(90, 62, 90, 90), 0.1),
  observation("grammar-far", "worse", 81, scores(90, 50, 90, 90), 0.9),
] as const satisfies readonly GoldenObservation[];

const STATUS_COST_CORPUS = parseGoldenCorpus({
  version: 1,
  pairs: [
    pair("cost-false-ready", "grammar", {
      better: ["ready", "none"],
      worse: ["revise", "high"],
    }),
    pair("cost-false-revise", "grammar", {
      better: ["ready", "none"],
      worse: ["revise", "high"],
    }),
  ],
});

const STATUS_COST_OBSERVATIONS = [
  observation("cost-false-ready", "better", 95, scores(95, 95, 95, 95), 0.1),
  // Labelled revise, but scores high and is not flagged: a false ready.
  observation("cost-false-ready", "worse", 90, scores(90, 90, 90, 90), 0.1),
  // Labelled ready, but flagged by needsFix: a false revise.
  observation("cost-false-revise", "better", 90, scores(90, 90, 90, 90), 0.9),
  observation("cost-false-revise", "worse", 40, scores(40, 40, 40, 40), 0.9),
] as const satisfies readonly GoldenObservation[];

type Expectation = readonly [
  GoldenPair["better"]["expected"]["sendability"],
  GoldenPair["better"]["expected"]["focusSeverity"],
];

function pair(
  id: string,
  focus: MetricId,
  expectations: { readonly better: Expectation; readonly worse: Expectation },
) {
  const variant = ([sendability, focusSeverity]: Expectation) => ({
    text: `${id} ${sendability}`,
    expected: { sendability, focusSeverity, acceptableTones: ["neutral"] },
  });

  return {
    id,
    context: "work",
    focus,
    split: "calibration",
    intent: "Ask for a review.",
    better: variant(expectations.better),
    worse: variant(expectations.worse),
  };
}

function observation(
  pairId: string,
  variant: GoldenObservation["variant"],
  overallScore: number,
  metricScores: Readonly<Record<MetricId, number>>,
  needsFixProbability: number,
): GoldenObservation {
  return {
    pairId,
    variant,
    run: 0,
    overallScore,
    metricScores,
    metricConfidences: {
      naturalness: 0.6,
      grammar: 0.6,
      clarity: 0.6,
      contextFit: 0.6,
    },
    tone: "neutral",
    toneConfidence: 0.5,
    needsFixProbability,
    // Only the threshold searches read these; they recompute their own labels.
    status: "improvable",
    focusSeverity: "none",
    highestIssueSeverity: "none",
  };
}

function scores(
  naturalness: number,
  grammar: number,
  clarity: number,
  contextFit: number,
): Readonly<Record<MetricId, number>> {
  return { naturalness, grammar, clarity, contextFit };
}
