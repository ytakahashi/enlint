import { assertEquals, assertMatch, assertStringIncludes } from "@std/assert";
import type { LintResult } from "#core/domain/lint_result.ts";
import { formatAdviceText, formatLintText } from "./text.ts";

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

Deno.test("formatLintText renders the stable human-readable layout", () => {
  assertEquals(
    formatLintText(RESULT, { color: false }),
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

Deno.test("formatLintText states when no issues were found", () => {
  assertMatch(
    formatLintText({ ...RESULT, issues: [] }, { color: false }),
    /Issues\nNone\n/,
  );
});

Deno.test("formatLintText maps every status and only colors when enabled", () => {
  const labels = {
    ready: "Ready to send",
    improvable: "Understandable, but could be improved",
    "needs-revision": "Needs revision",
  } as const;

  for (const [status, label] of Object.entries(labels)) {
    const plain = formatLintText(
      { ...RESULT, status: status as LintResult["status"] },
      { color: false },
    );
    assertMatch(plain, new RegExp(`Status: ${label}$`, "m"));
    assertEquals(plain.includes("\u001b["), false);
  }

  assertEquals(
    formatLintText(RESULT, { color: true }).includes("\u001b["),
    true,
  );
});

Deno.test("formatLintText marks only unusually low confidence", () => {
  const output = formatLintText(
    {
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
    },
    { color: false },
  );

  assertMatch(output, /Naturalness\s+82\/100 {2}\(low confidence\)/);
  assertMatch(output, /Grammar\s+94\/100\n/);
  assertMatch(output, /Tone: slightly formal {2}\(low confidence\)/);
});

Deno.test("formatAdviceText lists explanations in issue order", () => {
  const output = formatAdviceText(RESULT, {
    explanations: [
      {
        issueIndex: 1,
        explanation: "Use a more direct phrase.\nAvoid unnecessary words.",
      },
      { issueIndex: 0, explanation: "Name the document." },
    ],
    candidates: [],
  }, { color: false });

  assertStringIncludes(
    output,
    `
Explanations
- context: Name the document.
- wording: Use a more direct phrase.
           Avoid unnecessary words.
`,
  );
});

Deno.test("formatAdviceText renders rewrite candidates and their rationale", () => {
  const output = formatAdviceText(RESULT, {
    explanations: [],
    candidates: [{
      text: "Could you review this document\ntoday?",
      rationale: "It names the object.\nIt remains concise.",
    }],
  }, { color: false });

  assertEquals(
    output,
    `
Explanations
None

Suggested rewrites
1. Could you review this document
   today?
   Reason: It names the object.
           It remains concise.
`,
  );
});

Deno.test("formatAdviceText states when no rewrite is suggested", () => {
  const output = formatAdviceText(
    RESULT,
    { explanations: [], candidates: [] },
    { color: false },
  );

  assertMatch(output, /Suggested rewrites\nNone\n$/);
});

Deno.test("formatAdviceText only colors when enabled", () => {
  const advice = { explanations: [], candidates: [] };
  assertEquals(
    formatAdviceText(RESULT, advice, { color: false }).includes("\u001b["),
    false,
  );
  assertEquals(
    formatAdviceText(RESULT, advice, { color: true }).includes("\u001b["),
    true,
  );
});

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
