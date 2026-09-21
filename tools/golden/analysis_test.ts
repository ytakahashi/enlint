import { assertEquals } from "@std/assert";
import type { MetricId } from "#core/mod.ts";
import {
  analyzeGoldenCorpus,
  confidenceDistributions,
  type GoldenObservation,
} from "./analysis.ts";
import { parseGoldenCorpus } from "./corpus.ts";

const CORPUS = parseGoldenCorpus({
  version: 1,
  pairs: [{
    id: "grammar-01",
    context: "work",
    focus: "grammar",
    split: "calibration",
    intent: "Ask for a review.",
    better: {
      text: "Could you review this?",
      expected: {
        sendability: "ready",
        focusSeverity: "none",
        acceptableTones: ["neutral"],
      },
    },
    worse: {
      text: "Could you reviews this?",
      expected: {
        sendability: "revise",
        focusSeverity: "high",
        acceptableTones: ["neutral"],
      },
    },
  }],
});

const OBSERVATIONS = [
  observation("better", 0, 90, scores(90, 90, 90, 90), 0.1, "ready", "none"),
  observation("better", 1, 92, scores(92, 92, 92, 92), 0.12, "ready", "none"),
  observation(
    "worse",
    0,
    64,
    scores(80, 30, 80, 80),
    0.9,
    "needs-revision",
    "high",
  ),
  observation(
    "worse",
    1,
    66,
    scores(82, 32, 82, 82),
    0.88,
    "needs-revision",
    "high",
  ),
] as const satisfies readonly GoldenObservation[];

Deno.test("analyzeGoldenCorpus uses medians and labeled expectations", () => {
  const analysis = analyzeGoldenCorpus(CORPUS, OBSERVATIONS);

  assertEquals(analysis.overallOrderingRate, 1);
  assertEquals(analysis.focusOrderingRate, 1);
  assertEquals(analysis.sendabilityAccuracy, 1);
  assertEquals(analysis.severityAccuracy, 1);
  assertEquals(analysis.toneAccuracy, 1);
  assertEquals(analysis.statusIssueTensionRate, 0);
  assertEquals(analysis.pairs[0].overallMargin, 26);
  assertEquals(analysis.pairs[0].focusMargin, 60);
});

Deno.test("confidenceDistributions separates metric and tone values", () => {
  const distributions = confidenceDistributions(OBSERVATIONS);

  assertEquals(distributions.metrics?.count, OBSERVATIONS.length * 4);
  assertEquals(distributions.metrics?.median, 0.6);
  assertEquals(distributions.tone?.count, OBSERVATIONS.length);
  assertEquals(distributions.tone?.median, 0.5);
});

function observation(
  variant: GoldenObservation["variant"],
  run: number,
  overallScore: number,
  metricScores: Readonly<Record<MetricId, number>>,
  needsFixProbability: number,
  status: GoldenObservation["status"],
  focusSeverity: GoldenObservation["focusSeverity"],
): GoldenObservation {
  return {
    pairId: "grammar-01",
    variant,
    run,
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
    status,
    focusSeverity,
    highestIssueSeverity: focusSeverity,
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
