import { assertEquals } from "@std/assert";
import type { LintResult } from "#core/domain/lint_result.ts";
import { formatJson } from "./json.ts";
import type { LintReport } from "./report.ts";

const RESULT: LintResult = {
  text: "Could you review this today?",
  contextId: "work",
  overallScore: 85,
  status: "ready",
  metrics: [
    {
      id: "naturalness",
      score: 82,
      rawLevel: 3.28,
      levelCount: 5,
      confidence: 0.81,
      probabilities: { "4": 0.17, "2": 0.15, "0": 0, "3": 0.66, "1": 0.02 },
    },
    ...(["grammar", "clarity", "contextFit"] as const).map((id) => ({
      id,
      score: 100,
      rawLevel: 4,
      levelCount: 5,
      confidence: undefined,
      probabilities: undefined,
    })),
  ],
  classifications: [{
    id: "tone",
    value: "slightly formal",
    confidence: 0.74,
    probabilities: {
      formal: 0.1,
      neutral: 0.2,
      casual: 0.04,
      "slightly formal": 0.65,
      "very casual": 0.01,
    },
  }],
  judgements: [{ id: "needsFix", probability: 0.31, confidence: undefined }],
  issues: [{
    category: "context",
    severity: "low",
    target: { kind: "message" },
    detail: "Context fit can be improved.",
  }],
  usage: { inputTokens: 120, totalTokens: 138 },
};

Deno.test("formatJson preserves evidence and normalizes missing values", () => {
  const output = JSON.parse(formatJson(report()));

  assertEquals(output.version, 2);
  assertEquals(output.context, "work");
  assertEquals(output.metrics[1].confidence, null);
  assertEquals(output.metrics[1].probabilities, null);
  assertEquals(output.judgements[0].confidence, null);
  assertEquals(output.usage, {
    inputTokens: 120,
    outputTokens: null,
    totalTokens: 138,
  });
  assertEquals(output.issues, RESULT.issues);
  assertEquals(output.advice, null);
});

Deno.test("formatJson orders probability keys by their definitions", () => {
  const output = JSON.parse(formatJson(report()));

  assertEquals(Object.keys(output.metrics[0].probabilities), [
    "0",
    "1",
    "2",
    "3",
    "4",
  ]);
  assertEquals(Object.keys(output.classifications[0].probabilities), [
    "very casual",
    "casual",
    "neutral",
    "slightly formal",
    "formal",
  ]);
});

Deno.test("formatJson emits null when usage is unavailable", () => {
  const output = JSON.parse(
    formatJson(report({ ...RESULT, usage: undefined })),
  );
  assertEquals(output.usage, null);
  assertEquals(formatJson(report()).endsWith("\n"), true);
});

Deno.test("formatJson includes successful advice", () => {
  const advice = {
    explanations: [{ issueIndex: 0, explanation: "More context is needed." }],
    candidates: [{
      text: "Could you review this document today?",
      rationale: "The object makes the request more specific.",
    }],
  };

  const output = JSON.parse(formatJson({
    lintResult: RESULT,
    advice: { kind: "both", outcome: advice },
  }));

  assertEquals(output.advice, advice);
});

function report(lintResult: LintResult = RESULT): LintReport {
  return { lintResult, advice: undefined };
}
