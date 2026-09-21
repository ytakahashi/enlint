import { assertEquals } from "@std/assert";
import { FakeEvaluator } from "#core/testing/fake_evaluator.ts";
import { evaluateGoldenCorpus } from "./evaluate.ts";
import { parseGoldenCorpus } from "./corpus.ts";

Deno.test("evaluateGoldenCorpus evaluates every variant and repetition", async () => {
  const corpus = parseGoldenCorpus({
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
  const evaluator = new FakeEvaluator({
    metrics: {
      naturalness: score(4),
      grammar: score(4),
      clarity: score(4),
      contextFit: score(4),
    },
    classifications: {
      tone: {
        value: "neutral",
        confidence: 0.7,
        probabilities: undefined,
      },
    },
    judgements: {
      needsFix: { probability: 0.1, confidence: undefined },
    },
  });

  const progress: number[] = [];
  const observations = await evaluateGoldenCorpus(corpus, evaluator, {
    repeats: 2,
    concurrency: 2,
    onProgress: (completed) => progress.push(completed),
  });

  assertEquals(observations.length, 4);
  assertEquals(evaluator.requests.length, 4);
  assertEquals(
    observations.map(({ variant, run }) => ({ variant, run })),
    [
      { variant: "better", run: 0 },
      { variant: "better", run: 1 },
      { variant: "worse", run: 0 },
      { variant: "worse", run: 1 },
    ],
  );
  assertEquals(observations[0].focusSeverity, "none");
  assertEquals(progress, [1, 2, 3, 4]);
});

Deno.test("evaluateGoldenCorpus resumes completed observations", async () => {
  const corpus = parseGoldenCorpus({
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
  const evaluator = new FakeEvaluator({
    metrics: {
      naturalness: score(4),
      grammar: score(4),
      clarity: score(4),
      contextFit: score(4),
    },
    classifications: {
      tone: {
        value: "neutral",
        confidence: 0.7,
        probabilities: undefined,
      },
    },
    judgements: {
      needsFix: { probability: 0.1, confidence: undefined },
    },
  });
  const existing = [{
    pairId: "grammar-01",
    variant: "better",
    run: 0,
    overallScore: 100,
    metricScores: {
      naturalness: 100,
      grammar: 100,
      clarity: 100,
      contextFit: 100,
    },
    metricConfidences: {},
    tone: "neutral",
    toneConfidence: undefined,
    needsFixProbability: 0.1,
    status: "ready",
    focusSeverity: "none",
    highestIssueSeverity: "none",
  }] as const;

  const observations = await evaluateGoldenCorpus(corpus, evaluator, {
    repeats: 1,
    concurrency: 1,
    existingObservations: existing,
  });

  assertEquals(observations.length, 2);
  assertEquals(evaluator.requests.length, 1);
});

function score(rawLevel: number) {
  return {
    rawLevel,
    confidence: 0.8,
    probabilities: undefined,
  };
}
