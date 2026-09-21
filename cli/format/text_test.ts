import { assertEquals, assertMatch } from "@std/assert";
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
    formatText(RESULT, { color: false }),
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
    formatText({ ...RESULT, issues: [] }, { color: false }),
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
      { ...RESULT, status: status as LintResult["status"] },
      { color: false },
    );
    assertMatch(plain, new RegExp(`Status: ${label}$`, "m"));
    assertEquals(plain.includes("\u001b["), false);
  }

  assertEquals(formatText(RESULT, { color: true }).includes("\u001b["), true);
});

function metric(
  id: LintResult["metrics"][number]["id"],
  score: number,
): LintResult["metrics"][number] {
  return {
    id,
    score,
    rawLevel: score / 25,
    levelCount: 5,
    confidence: undefined,
    probabilities: undefined,
  };
}
