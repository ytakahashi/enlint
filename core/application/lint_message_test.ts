import { assertEquals, assertRejects, assertStrictEquals } from "@std/assert";
import type { ContextProfile } from "../domain/context_profile.ts";
import type { EvaluationOutcome } from "../domain/evaluator.ts";
import { FakeEvaluator } from "../testing/fake_evaluator.ts";
import { lintMessage } from "./lint_message.ts";

const PROFILE = {
  id: "focused-work",
  label: "Focused work",
  description: "A concise workplace update.",
  expectedTones: ["neutral", "slightly formal"],
  weights: {
    naturalness: 0.4,
    grammar: 0.2,
    clarity: 0.2,
    contextFit: 0.2,
  },
  criteriaOverrides: {
    grammar: ["Incorrect.", "Mostly correct.", "Correct."],
  },
} as const satisfies ContextProfile;

const TONE_PROBABILITIES = {
  "very casual": 0.01,
  casual: 0.02,
  neutral: 0.07,
  "slightly formal": 0.2,
  formal: 0.7,
} as const;

const OUTCOME: EvaluationOutcome = {
  metrics: {
    naturalness: {
      rawLevel: 4,
      confidence: 0.91,
      probabilities: { "0": 0, "1": 0, "2": 0, "3": 0, "4": 1 },
    },
    grammar: {
      rawLevel: 1,
      confidence: 0.82,
      probabilities: { "0": 0.1, "1": 0.8, "2": 0.1 },
    },
    clarity: {
      rawLevel: 4,
      confidence: 0.93,
      probabilities: { "0": 0, "1": 0, "2": 0, "3": 0, "4": 1 },
    },
    contextFit: {
      rawLevel: 4,
      confidence: 0.88,
      probabilities: { "0": 0, "1": 0, "2": 0, "3": 0, "4": 1 },
    },
  },
  classifications: {
    tone: {
      value: "formal",
      confidence: 0.75,
      probabilities: TONE_PROBABILITIES,
    },
  },
  judgements: {
    needsFix: { probability: 0.2, confidence: 0.86 },
  },
  usage: { inputTokens: 120, outputTokens: 18, totalTokens: 138 },
};

Deno.test("lintMessage composes a deterministic result through the evaluator port", async () => {
  const evaluator = new FakeEvaluator(OUTCOME);

  const result = await lintMessage(
    { text: "I deployed it yesterday.", profile: PROFILE },
    evaluator,
  );

  assertEquals(evaluator.requests.length, 1);
  const request = evaluator.requests[0];
  assertEquals(request.text, "I deployed it yesterday.");
  assertStrictEquals(request.profile, PROFILE);
  assertEquals(request.metrics.map(({ weight }) => weight), [
    0.4,
    0.2,
    0.2,
    0.2,
  ]);
  assertEquals(request.metrics[1].levels, PROFILE.criteriaOverrides.grammar);

  assertEquals(result.text, "I deployed it yesterday.");
  assertEquals(result.contextId, "focused-work");
  assertEquals(result.overallScore, 90);
  assertEquals(result.metrics.map(({ score }) => score), [100, 50, 100, 100]);
  assertEquals(result.metrics[1].levelCount, 3);
  assertEquals(result.metrics[1].confidence, 0.82);
  assertStrictEquals(
    result.metrics[1].probabilities,
    OUTCOME.metrics.grammar.probabilities,
  );
  assertEquals(result.classifications, [{
    id: "tone",
    value: "formal",
    confidence: 0.75,
    probabilities: TONE_PROBABILITIES,
  }]);
  assertEquals(result.judgements, [{
    id: "needsFix",
    probability: 0.2,
    confidence: 0.86,
  }]);
  assertEquals(
    result.issues.map(({ category, severity }) => ({ category, severity })),
    [
      { category: "grammar", severity: "high" },
      { category: "tone", severity: "low" },
    ],
  );
  assertEquals(result.status, "ready");
  assertStrictEquals(result.usage, OUTCOME.usage);
});

Deno.test("lintMessage names the answer missing from the evaluator outcome", async () => {
  const withoutAnswer = (key: "classifications" | "judgements") =>
    lintMessage(
      { text: "I deployed it yesterday.", profile: PROFILE },
      new FakeEvaluator({ ...OUTCOME, [key]: {} } as EvaluationOutcome),
    );

  await assertRejects(
    () => withoutAnswer("classifications"),
    TypeError,
    'missing answer for classification "tone"',
  );
  await assertRejects(
    () => withoutAnswer("judgements"),
    TypeError,
    'missing answer for judgement "needsFix"',
  );
});
