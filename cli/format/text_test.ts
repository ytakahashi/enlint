import { assertEquals, assertMatch, assertStringIncludes } from "@std/assert";
import type { LintResult } from "#core/domain/lint_result.ts";
import { formatText } from "./text.ts";

const RESULT: LintResult = {
  text: "Could you review this today?",
  contextId: "work",
  overallScore: 85,
  status: "ready",
  metrics: [
    metric("naturalness", 82),
    metric("grammar", 94),
    metric("clarity", 90),
    metric("contextFit", 73),
  ],
  classifications: [{
    id: "tone",
    value: "slightly formal",
    confidence: 0.74,
    probabilities: undefined,
  }],
  judgements: [{ id: "needsFix", probability: 0.31, confidence: undefined }],
  issues: [
    {
      category: "context",
      severity: "low",
      target: { kind: "message" },
      detail: "Context fit can be improved.",
    },
    {
      category: "wording",
      severity: "low",
      target: { kind: "message" },
      detail: "Wording can be improved.",
    },
  ],
  usage: undefined,
};

Deno.test("formatText renders the stable human-readable layout", () => {
  assertEquals(
    formatText(report(), { color: false }),
    `Score: 85/100

Naturalness   82/100
Grammar       94/100
Clarity       90/100
Context Fit   73/100

Tone: slightly formal

Issues
- context: low
- wording: low

Status: Ready to send
`,
  );
});

Deno.test("formatText states when no issues were found", () => {
  assertMatch(
    formatText(report({ ...RESULT, issues: [] }), { color: false }),
    /Issues\nNone\n/,
  );
});

Deno.test("formatText maps every status and only colors when enabled", () => {
  const labels = {
    ready: "Ready to send",
    improvable: "Understandable, but could be improved",
    "needs-revision": "Needs revision",
  } as const;

  for (const [status, label] of Object.entries(labels)) {
    const plain = formatText(
      report({ ...RESULT, status: status as LintResult["status"] }),
      { color: false },
    );
    assertMatch(plain, new RegExp(`Status: ${label}$`, "m"));
    assertEquals(plain.includes("\u001b["), false);
  }

  assertEquals(
    formatText(report(), { color: true }).includes("\u001b["),
    true,
  );
});

Deno.test("formatText marks only unusually low confidence", () => {
  const output = formatText(
    report({
      ...RESULT,
      metrics: [
        metric("naturalness", 82, 0.39),
        metric("grammar", 94, 0.4),
        metric("clarity", 90),
        metric("contextFit", 73),
      ],
      classifications: [{
        ...RESULT.classifications[0],
        confidence: 0.39,
      }],
    }),
    { color: false },
  );

  assertMatch(output, /Naturalness\s+82\/100 {2}\(low confidence\)/);
  assertMatch(output, /Grammar\s+94\/100\n/);
  assertMatch(output, /Tone: slightly formal {2}\(low confidence\)/);
});

Deno.test("formatText places explanations under their indexed issues", () => {
  const output = formatText({
    lintResult: RESULT,
    advice: {
      kind: "explain",
      outcome: {
        explanations: [{
          issueIndex: 1,
          explanation: "Use a more direct phrase.\nAvoid unnecessary words.",
        }],
        candidates: [],
      },
    },
  }, { color: false });

  assertStringIncludes(
    output,
    `- context: low
- wording: low
  Explanation: Use a more direct phrase.
               Avoid unnecessary words.`,
  );
  assertEquals(output.includes("Suggested rewrites"), false);
});

Deno.test("formatText renders rewrite candidates and their rationale", () => {
  const output = formatText({
    lintResult: RESULT,
    advice: {
      kind: "fix",
      outcome: {
        explanations: [],
        candidates: [{
          text: "Could you review this document\ntoday?",
          rationale: "It names the object.\nIt remains concise.",
        }],
      },
    },
  }, { color: false });

  assertStringIncludes(
    output,
    `Suggested rewrites
1. Could you review this document
   today?
   Reason: It names the object.
           It remains concise.`,
  );
});

Deno.test("formatText states when no rewrite is suggested", () => {
  const output = formatText({
    lintResult: RESULT,
    advice: {
      kind: "both",
      outcome: { explanations: [], candidates: [] },
    },
  }, { color: false });

  assertMatch(output, /Suggested rewrites\nNone\n/);
});

function report(lintResult: LintResult = RESULT) {
  return { lintResult, advice: undefined };
}

function metric(
  id: LintResult["metrics"][number]["id"],
  score: number,
  confidence?: number,
): LintResult["metrics"][number] {
  return {
    id,
    score,
    rawLevel: score / 25,
    levelCount: 5,
    confidence,
    probabilities: undefined,
  };
}
