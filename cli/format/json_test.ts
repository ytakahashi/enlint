import { assertEquals } from "@std/assert";
import type { LintResult } from "#core/domain/lint_result.ts";
import { formatJson } from "./json.ts";

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
  const output = JSON.parse(formatJson(RESULT));

  assertEquals(output.version, 1);
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
});

Deno.test("formatJson orders probability keys by their definitions", () => {
  const output = JSON.parse(formatJson(RESULT));

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
  const output = JSON.parse(formatJson({ ...RESULT, usage: undefined }));
  assertEquals(output.usage, null);
  assertEquals(formatJson(RESULT).endsWith("\n"), true);
});
