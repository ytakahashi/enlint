import { assertEquals, assertThrows } from "@std/assert";
import type { ClassificationResult } from "../domain/classification.ts";
import { BUILT_IN_CONTEXT_PROFILES } from "../domain/context_profile.ts";
import type { MetricId, MetricResult } from "../domain/metric.ts";
import { deriveIssues } from "./issue_derivation.ts";

function metric(id: MetricId, score: number): MetricResult {
  return {
    id,
    score,
    rawLevel: 0,
    levelCount: 5,
    confidence: undefined,
    probabilities: undefined,
  };
}

function tone(value: ClassificationResult["value"]): ClassificationResult {
  return {
    id: "tone",
    value,
    confidence: undefined,
    probabilities: undefined,
  };
}

Deno.test("deriveIssues applies score thresholds at their boundaries", () => {
  const cases = [
    { score: 80, severity: undefined },
    { score: 79.999, severity: "low" },
    { score: 70, severity: "low" },
    { score: 69.999, severity: "medium" },
    { score: 55, severity: "medium" },
    { score: 54.999, severity: "high" },
  ] as const;

  for (const { score, severity } of cases) {
    const issues = deriveIssues(
      [metric("naturalness", score)],
      [],
      BUILT_IN_CONTEXT_PROFILES.general,
    );
    assertEquals(issues[0]?.severity, severity);
  }
});

Deno.test("deriveIssues maps metrics in input order", () => {
  const issues = deriveIssues(
    [
      metric("naturalness", 79),
      metric("grammar", 69),
      metric("clarity", 54),
      metric("contextFit", 70),
    ],
    [],
    BUILT_IN_CONTEXT_PROFILES.general,
  );

  assertEquals(
    issues.map(({ category, severity, target }) => ({
      category,
      severity,
      target,
    })),
    [
      { category: "wording", severity: "low", target: { kind: "message" } },
      { category: "grammar", severity: "medium", target: { kind: "message" } },
      { category: "clarity", severity: "high", target: { kind: "message" } },
      { category: "context", severity: "low", target: { kind: "message" } },
    ],
  );
  assertEquals(
    issues[0].detail,
    'Metric "naturalness" scored 79, below the issue-free threshold of 80.',
  );
});

Deno.test("deriveIssues reports only unexpected tones", () => {
  assertEquals(
    deriveIssues([], [tone("casual")], BUILT_IN_CONTEXT_PROFILES.casual),
    [],
  );
  assertEquals(
    deriveIssues([], [tone("formal")], BUILT_IN_CONTEXT_PROFILES.casual),
    [{
      category: "tone",
      severity: "low",
      target: { kind: "message" },
      detail: 'Tone "formal" is not expected for context "casual".',
    }],
  );
});

Deno.test("deriveIssues rejects scores outside the normalized range", () => {
  assertThrows(
    () =>
      deriveIssues(
        [metric("grammar", 101)],
        [],
        BUILT_IN_CONTEXT_PROFILES.general,
      ),
    RangeError,
  );
});
