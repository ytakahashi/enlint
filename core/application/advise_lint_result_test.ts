import { assertEquals, assertRejects, assertStrictEquals } from "@std/assert";
import type {
  AdviceKind,
  AdviceOutcome,
  AdviceRequest,
} from "../domain/advisor.ts";
import type { ContextProfile } from "../domain/context_profile.ts";
import type { LintResult } from "../domain/lint_result.ts";
import { FakeAdvisor } from "../testing/fake_advisor.ts";
import { adviseLintResult } from "./advise_lint_result.ts";

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

const LINT_RESULT = {
  text: "She go to work every day.",
  contextId: "work",
  overallScore: 60,
  metrics: [],
  classifications: [],
  judgements: [],
  issues: [{
    category: "grammar",
    severity: "high",
    target: { kind: "message" },
    detail: "The verb form is incorrect.",
  }],
  status: "needs-revision",
  usage: undefined,
} as const satisfies LintResult;

const EXPLANATIONS = [{
  issueIndex: 0,
  explanation: "A third-person singular subject requires 'goes'.",
}] as const;

const CANDIDATES = [{
  text: "She goes to work every day.",
  rationale: "Use the third-person singular form of the verb.",
}] as const;

/** Mirrors what a well-behaved advisor returns for each requested kind. */
function outcomeFor(kind: AdviceKind): AdviceOutcome {
  return {
    explanations: kind === "fix" ? [] : EXPLANATIONS,
    candidates: kind === "explain" ? [] : CANDIDATES,
  };
}

function requestFor(kind: AdviceKind): AdviceRequest {
  return { lintResult: LINT_RESULT, profile: PROFILE, kind };
}

Deno.test("adviseLintResult passes the shared lint result and requested kind to the advisor", async () => {
  const kinds: readonly AdviceKind[] = ["explain", "fix", "both"];

  for (const kind of kinds) {
    const expected = outcomeFor(kind);
    const advisor = new FakeAdvisor({ outcome: expected });
    const request = requestFor(kind);

    const outcome = await adviseLintResult(request, advisor);

    assertStrictEquals(outcome, expected);
    assertEquals(advisor.requests.length, 1);
    assertStrictEquals(advisor.requests[0], request);
    assertStrictEquals(advisor.requests[0].lintResult, LINT_RESULT);
    assertStrictEquals(advisor.requests[0].profile, PROFILE);
    assertEquals(advisor.requests[0].kind, kind);
  }
});

Deno.test("adviseLintResult accepts a fix request that needs no rewrite", async () => {
  const outcome = { explanations: [], candidates: [] } satisfies AdviceOutcome;

  assertStrictEquals(
    await adviseLintResult(
      requestFor("fix"),
      new FakeAdvisor({ outcome }),
    ),
    outcome,
  );
});

Deno.test("adviseLintResult rejects rewrites for a result with no issues", async () => {
  const lintResult = { ...LINT_RESULT, issues: [] };
  const request = { lintResult, profile: PROFILE, kind: "fix" } as const;

  await assertRejects(
    () =>
      adviseLintResult(
        request,
        new FakeAdvisor({
          outcome: {
            explanations: [],
            candidates: [{ text: lintResult.text, rationale: "No change." }],
          },
        }),
      ),
    TypeError,
    "advice contains rewrite candidates for a lint result with no issues",
  );

  const outcome = { explanations: [], candidates: [] } satisfies AdviceOutcome;
  assertStrictEquals(
    await adviseLintResult(request, new FakeAdvisor({ outcome })),
    outcome,
  );
});

Deno.test("adviseLintResult rejects explanation indexes outside the lint issues", async () => {
  // LINT_RESULT carries exactly one issue, so only index 0 is addressable.
  for (const issueIndex of [1, -1, 0.5, Number.NaN]) {
    await assertRejects(
      () =>
        adviseLintResult(
          requestFor("explain"),
          new FakeAdvisor({
            outcome: {
              explanations: [{ issueIndex, explanation: "x" }],
              candidates: [],
            },
          }),
        ),
      RangeError,
      `advice explanation index ${issueIndex} is outside the 1 lint issues`,
    );
  }
});

Deno.test("adviseLintResult rejects repeated explanations for one issue", async () => {
  await assertRejects(
    () =>
      adviseLintResult(
        requestFor("explain"),
        new FakeAdvisor({
          outcome: {
            explanations: [
              { issueIndex: 0, explanation: "first" },
              { issueIndex: 0, explanation: "second" },
            ],
            candidates: [],
          },
        }),
      ),
    TypeError,
    "advice contains more than one explanation for issue 0",
  );
});

Deno.test("adviseLintResult rejects advice that was not requested", async () => {
  await assertRejects(
    () =>
      adviseLintResult(
        requestFor("explain"),
        new FakeAdvisor({
          outcome: { explanations: [], candidates: CANDIDATES },
        }),
      ),
    TypeError,
    'advice contains rewrite candidates that "explain" did not request',
  );

  await assertRejects(
    () =>
      adviseLintResult(
        requestFor("fix"),
        new FakeAdvisor({
          outcome: { explanations: EXPLANATIONS, candidates: [] },
        }),
      ),
    TypeError,
    'advice contains explanations that "fix" did not request',
  );
});

Deno.test("adviseLintResult rejects a profile from a different lint context", async () => {
  const advisor = new FakeAdvisor({ outcome: outcomeFor("explain") });
  const otherProfile = { ...PROFILE, id: "casual" };

  await assertRejects(
    () =>
      adviseLintResult(
        {
          lintResult: LINT_RESULT,
          profile: otherProfile,
          kind: "explain",
        },
        advisor,
      ),
    TypeError,
    'advice profile "casual" does not match lint result context "work"',
  );

  assertEquals(advisor.requests.length, 0);
});

Deno.test("adviseLintResult preserves advisor failures", async () => {
  const error = new Error("advice failed");
  const advisor = new FakeAdvisor({ error });
  const request = requestFor("fix");

  const thrown = await assertRejects(
    () => adviseLintResult(request, advisor),
    Error,
    "advice failed",
  );

  assertStrictEquals(thrown, error);
  assertEquals(advisor.requests.length, 1);
  assertStrictEquals(advisor.requests[0], request);
});
