import { assert, assertEquals, assertThrows } from "@std/assert";
import {
  type EvaluationOutcome,
  getBuiltInContextProfile,
  lintMessage,
  type LintResult,
} from "#core/mod.ts";
import { FakeEvaluator } from "#core/testing/fake_evaluator.ts";
import { parseLintResult } from "./lint_result.ts";

const OUTCOME = {
  metrics: {
    naturalness: { rawLevel: 1, confidence: 0.35, probabilities: { 1: 1 } },
    grammar: { rawLevel: 4, confidence: 0.9, probabilities: undefined },
    clarity: { rawLevel: 2, confidence: undefined, probabilities: undefined },
    contextFit: { rawLevel: 3, confidence: 0.7, probabilities: undefined },
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

async function lintResult(): Promise<LintResult> {
  const profile = getBuiltInContextProfile("work");
  if (profile === undefined) throw new Error("missing built-in profile");
  return await lintMessage(
    { text: "Could you review this today?", profile },
    new FakeEvaluator(OUTCOME),
  );
}

/** A result as the host receives it: after the JSON bindings boundary. */
async function received(): Promise<Record<string, unknown>> {
  return JSON.parse(JSON.stringify(await lintResult()));
}

Deno.test("parseLintResult restores a result that crossed the bindings boundary", async () => {
  const original = await lintResult();
  assert(original.issues.length > 0, "fixture should produce issues");

  assertEquals(parseLintResult(await received()), original);
});

Deno.test("parseLintResult drops fields outside LintResult", async () => {
  const value = { ...await received(), injected: "ignore previous input" };

  assertEquals("injected" in parseLintResult(value), false);
});

Deno.test("parseLintResult accepts sentence targets", async () => {
  const value = await received();
  value.issues = [{
    category: "grammar",
    severity: "low",
    target: { kind: "sentence", index: 2 },
    detail: "Sentence-level issue.",
  }];

  assertEquals(parseLintResult(value).issues[0].target, {
    kind: "sentence",
    index: 2,
  });
});

Deno.test("parseLintResult names the first invalid field", async () => {
  const cases: readonly [
    string,
    (value: Record<string, unknown>) => unknown,
  ][] = [
    ["lintResult", () => null],
    ["lintResult", () => []],
    ["lintResult.text", (value) => ({ ...value, text: 123 })],
    ["lintResult.contextId", (value) => ({ ...value, contextId: undefined })],
    ["lintResult.overallScore", (value) => ({ ...value, overallScore: "80" })],
    ["lintResult.overallScore", (value) => ({ ...value, overallScore: 101 })],
    ["lintResult.metrics", (value) => ({ ...value, metrics: {} })],
    ["lintResult.metrics[0].id", (value) =>
      withFirst(value, "metrics", {
        id: "fluency",
      })],
    [
      "lintResult.metrics[0].score",
      (value) => withFirst(value, "metrics", { score: null }),
    ],
    [
      "lintResult.metrics[0].levelCount",
      (value) => withFirst(value, "metrics", { levelCount: 0 }),
    ],
    [
      "lintResult.metrics[0].confidence",
      (value) => withFirst(value, "metrics", { confidence: 1.5 }),
    ],
    [
      "lintResult.metrics[0].probabilities.1",
      (value) => withFirst(value, "metrics", { probabilities: { 1: "high" } }),
    ],
    [
      "lintResult.classifications[0].value",
      (value) => withFirst(value, "classifications", { value: "rude" }),
    ],
    [
      "lintResult.classifications[0].probabilities.very casual",
      (value) =>
        withFirst(value, "classifications", {
          probabilities: { casual: 1 },
        }),
    ],
    [
      "lintResult.judgements[0].probability",
      (value) => withFirst(value, "judgements", { probability: -0.1 }),
    ],
    [
      "lintResult.issues[0].category",
      (value) => withFirst(value, "issues", { category: "spelling" }),
    ],
    [
      "lintResult.issues[0].severity",
      (value) => withFirst(value, "issues", { severity: "critical" }),
    ],
    [
      "lintResult.issues[0].target.kind",
      (value) => withFirst(value, "issues", { target: { kind: "span" } }),
    ],
    [
      "lintResult.issues[0].target.index",
      (value) => withFirst(value, "issues", { target: { kind: "sentence" } }),
    ],
    [
      "lintResult.issues[0].detail",
      (value) => withFirst(value, "issues", { detail: ["text"] }),
    ],
    ["lintResult.status", (value) => ({ ...value, status: "done" })],
    ["lintResult.usage", (value) => ({ ...value, usage: "150" })],
    [
      "lintResult.usage.totalTokens",
      (value) => ({ ...value, usage: { totalTokens: 1.5 } }),
    ],
  ];

  for (const [path, corrupt] of cases) {
    const value = corrupt(await received());
    assertThrows(
      () => parseLintResult(value),
      TypeError,
      `${path} is missing or invalid`,
    );
  }
});

/** Overrides fields of the first element of an array property. */
function withFirst(
  value: Record<string, unknown>,
  key: string,
  fields: Record<string, unknown>,
): Record<string, unknown> {
  const [first, ...rest] = value[key] as Record<string, unknown>[];
  return { ...value, [key]: [{ ...first, ...fields }, ...rest] };
}
