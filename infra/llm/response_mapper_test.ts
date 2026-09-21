import { assertEquals, assertThrows } from "@std/assert";
import type { AdviceKind, AdviceRequest } from "#core/domain/advisor.ts";
import type { ContextProfile } from "#core/domain/context_profile.ts";
import type { LintResult } from "#core/domain/lint_result.ts";
import {
  InvalidOpenAiAdviceResponseError,
  mapOpenAiAdviceResponse,
} from "./response_mapper.ts";

const PROFILE = {
  id: "work",
  label: "Work",
  description: "A message to a colleague in a professional setting.",
  expectedTones: ["neutral", "slightly formal"],
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

function request(kind: AdviceKind): AdviceRequest {
  return { kind, lintResult: LINT_RESULT, profile: PROFILE };
}

async function fixture(name: string): Promise<string> {
  return await Deno.readTextFile(
    new URL(`./_fixtures/${name}`, import.meta.url),
  );
}

Deno.test("mapOpenAiAdviceResponse maps explanations and candidates", async () => {
  assertEquals(
    mapOpenAiAdviceResponse(
      request("both"),
      await fixture("both_response.json"),
    ),
    {
      explanations: [{
        issueIndex: 0,
        explanation:
          "A third-person singular subject requires the verb form 'goes'.",
      }],
      candidates: [{
        text: "She goes to work every day.",
        rationale: "This uses the correct third-person singular verb form.",
      }],
    },
  );
});

Deno.test("mapOpenAiAdviceResponse accepts a requested fix with no rewrite", async () => {
  assertEquals(
    mapOpenAiAdviceResponse(
      request("fix"),
      await fixture("no_rewrite_response.json"),
    ),
    { explanations: [], candidates: [] },
  );
});

Deno.test("mapOpenAiAdviceResponse rejects malformed JSON and object shapes", () => {
  const invalidValues = [
    "not JSON",
    "null",
    JSON.stringify({ explanations: [] }),
    JSON.stringify({ explanations: [], candidates: [], extra: true }),
  ];

  for (const value of invalidValues) {
    assertThrows(
      () => mapOpenAiAdviceResponse(request("fix"), value),
      InvalidOpenAiAdviceResponseError,
      "invalid OpenAI advice response",
    );
  }
});

Deno.test("mapOpenAiAdviceResponse rejects missing, repeated, and invalid explanations", () => {
  const invalidExplanations = [
    [],
    [{ issueIndex: 1, explanation: "Out of range." }],
    [{ issueIndex: 0, explanation: "   " }],
    [
      { issueIndex: 0, explanation: "First." },
      { issueIndex: 0, explanation: "Second." },
    ],
  ];

  for (const explanations of invalidExplanations) {
    assertThrows(
      () =>
        mapOpenAiAdviceResponse(
          request("explain"),
          JSON.stringify({ explanations, candidates: [] }),
        ),
      InvalidOpenAiAdviceResponseError,
    );
  }
});

Deno.test("mapOpenAiAdviceResponse rejects advice that was not requested", () => {
  assertThrows(
    () =>
      mapOpenAiAdviceResponse(
        request("explain"),
        JSON.stringify({
          explanations: [{ issueIndex: 0, explanation: "Explanation." }],
          candidates: [{ text: "Rewrite.", rationale: "Rationale." }],
        }),
      ),
    InvalidOpenAiAdviceResponseError,
    "at most 0 rewrite candidates",
  );

  assertThrows(
    () =>
      mapOpenAiAdviceResponse(
        request("fix"),
        JSON.stringify({
          explanations: [{ issueIndex: 0, explanation: "Explanation." }],
          candidates: [],
        }),
      ),
    InvalidOpenAiAdviceResponseError,
    "0 explanations",
  );
});

Deno.test("mapOpenAiAdviceResponse rejects empty and excessive rewrite candidates", () => {
  const invalidCandidate = { text: " ", rationale: "Rationale." };
  assertThrows(
    () =>
      mapOpenAiAdviceResponse(
        request("fix"),
        JSON.stringify({ explanations: [], candidates: [invalidCandidate] }),
      ),
    InvalidOpenAiAdviceResponseError,
    "non-empty text and rationale",
  );

  const candidate = { text: "Rewrite.", rationale: "Rationale." };
  assertThrows(
    () =>
      mapOpenAiAdviceResponse(
        request("fix"),
        JSON.stringify({
          explanations: [],
          candidates: [candidate, candidate, candidate, candidate],
        }),
      ),
    InvalidOpenAiAdviceResponseError,
    "at most 3 rewrite candidates",
  );
});

Deno.test("mapOpenAiAdviceResponse rejects rewrites when nothing was flagged", () => {
  const lintResult = { ...LINT_RESULT, issues: [] };
  const candidates = [{ text: LINT_RESULT.text, rationale: "No change." }];

  assertThrows(
    () =>
      mapOpenAiAdviceResponse(
        { kind: "fix", lintResult, profile: PROFILE },
        JSON.stringify({ explanations: [], candidates }),
      ),
    InvalidOpenAiAdviceResponseError,
    "at most 0 rewrite candidates",
  );

  assertEquals(
    mapOpenAiAdviceResponse(
      { kind: "fix", lintResult, profile: PROFILE },
      JSON.stringify({ explanations: [], candidates: [] }),
    ).candidates,
    [],
  );
});
