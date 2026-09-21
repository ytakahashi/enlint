import { assertEquals, assertRejects, assertStrictEquals } from "@std/assert";
import type { AdviceOutcome, AdviceRequest } from "../domain/advisor.ts";
import type { ContextProfile } from "../domain/context_profile.ts";
import type { Issue } from "../domain/issue.ts";
import type { LintResult } from "../domain/lint_result.ts";
import { FakeAdvisor } from "./fake_advisor.ts";

const PROFILE = {
  id: "work",
  label: "Work",
  description: "A message to a colleague in a professional setting.",
  expectedTones: ["neutral", "slightly formal"],
  weights: {
    naturalness: 0.3,
    grammar: 0.25,
    clarity: 0.25,
    contextFit: 0.2,
  },
  criteriaOverrides: {},
} as const satisfies ContextProfile;

const ISSUE = {
  category: "grammar",
  severity: "high",
  target: { kind: "message" },
  detail: "The verb form is incorrect.",
} as const satisfies Issue;

const LINT_RESULT = {
  text: "She go to work every day.",
  contextId: "work",
  overallScore: 60,
  metrics: [],
  classifications: [],
  judgements: [],
  issues: [ISSUE],
  status: "needs-revision",
  usage: undefined,
} as const satisfies LintResult;

const REQUEST = {
  lintResult: LINT_RESULT,
  profile: PROFILE,
  kind: "both",
} as const satisfies AdviceRequest;

const OUTCOME = {
  explanations: [{
    issueIndex: 0,
    explanation: "A third-person singular subject requires 'goes'.",
  }],
  candidates: [{
    text: "She goes to work every day.",
    rationale: "Use the third-person singular form of the verb.",
  }],
} as const satisfies AdviceOutcome;

Deno.test("FakeAdvisor returns its configured outcome and records requests", async () => {
  const advisor = new FakeAdvisor({ outcome: OUTCOME });

  const outcome = await advisor.advise(REQUEST);

  assertStrictEquals(outcome, OUTCOME);
  assertEquals(advisor.requests.length, 1);
  assertStrictEquals(advisor.requests[0], REQUEST);
  assertStrictEquals(advisor.requests[0].lintResult, LINT_RESULT);
  assertStrictEquals(advisor.requests[0].profile, PROFILE);
});

Deno.test("FakeAdvisor rejects with its configured error after recording the request", async () => {
  const error = new Error("advice failed");
  const advisor = new FakeAdvisor({ error });

  const thrown = await assertRejects(
    () => advisor.advise(REQUEST),
    Error,
    "advice failed",
  );

  assertStrictEquals(thrown, error);
  assertEquals(advisor.requests.length, 1);
  assertStrictEquals(advisor.requests[0], REQUEST);
});
