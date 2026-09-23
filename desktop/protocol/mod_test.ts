import { assertEquals } from "@std/assert";
import {
  type AdviceOutcome,
  type EvaluationOutcome,
  getBuiltInContextProfile,
  lintMessage,
} from "#core/mod.ts";
import { FakeEvaluator } from "#core/testing/fake_evaluator.ts";
import type { Result } from "./mod.ts";

/** What the bindings boundary does to every argument and return value. */
function crossBoundary(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
}

/**
 * The boundary drops `undefined` properties, which the protocol accepts. Only
 * those are removed from the expectation, so a `Date`, `Map`, or class
 * instance still fails the comparison.
 */
function withoutUndefinedProperties(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(withoutUndefinedProperties);
  }
  if (
    typeof value === "object" && value !== null &&
    Object.getPrototypeOf(value) === Object.prototype
  ) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .map(([key, entry]) => [key, withoutUndefinedProperties(entry)]),
    );
  }
  return value;
}

function assertSurvivesBoundary(value: unknown): void {
  assertEquals(crossBoundary(value), withoutUndefinedProperties(value));
}

const DETAILED_OUTCOME = {
  metrics: {
    naturalness: score(1, 0.35),
    grammar: score(4, 0.9),
    clarity: score(2, 0.6),
    contextFit: score(3, 0.7),
  },
  classifications: {
    tone: {
      value: "casual",
      confidence: 0.38,
      probabilities: {
        "very casual": 0.2,
        casual: 0.38,
        neutral: 0.3,
        "slightly formal": 0.1,
        formal: 0.02,
      },
    },
  },
  judgements: { needsFix: { probability: 0.8, confidence: undefined } },
  usage: { inputTokens: 120, outputTokens: 30, totalTokens: 150 },
} as const satisfies EvaluationOutcome;

const SPARSE_OUTCOME = {
  metrics: {
    naturalness: score(4, undefined),
    grammar: score(4, undefined),
    clarity: score(4, undefined),
    contextFit: score(4, undefined),
  },
  classifications: {
    tone: { value: "neutral", confidence: undefined, probabilities: undefined },
  },
  judgements: { needsFix: { probability: 0.1, confidence: undefined } },
} as const satisfies EvaluationOutcome;

function score(rawLevel: number, confidence: number | undefined) {
  return {
    rawLevel,
    confidence,
    probabilities: confidence === undefined
      ? undefined
      : { [rawLevel]: confidence, [rawLevel === 0 ? 1 : 0]: 1 - confidence },
  };
}

Deno.test("lint results survive the bindings boundary", async () => {
  const profile = getBuiltInContextProfile("work");
  if (profile === undefined) throw new Error("missing built-in profile");

  for (const outcome of [DETAILED_OUTCOME, SPARSE_OUTCOME]) {
    const result = await lintMessage(
      { text: "Could you review this today?", profile },
      new FakeEvaluator(outcome),
    );
    const response: Result<typeof result> = { ok: true, value: result };

    assertSurvivesBoundary(response);
  }
});

Deno.test("advice outcomes and errors survive the bindings boundary", () => {
  const advice: AdviceOutcome = {
    explanations: [{ issueIndex: 0, explanation: "Use the past tense." }],
    candidates: [{ text: "I reviewed it.", rationale: "Tense agreement." }],
  };
  const failure: Result<null> = {
    ok: false,
    error: { kind: "missing-credentials", provider: "openai" },
  };

  assertSurvivesBoundary({ ok: true, value: advice });
  assertSurvivesBoundary(failure);
  assertSurvivesBoundary({ ok: true, value: null });
});
