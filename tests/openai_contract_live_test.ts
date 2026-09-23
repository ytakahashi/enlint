import { assert, assertEquals } from "@std/assert";
import type { AdviceKind, AdviceRequest } from "#core/domain/advisor.ts";
import type { ContextProfile } from "#core/domain/context_profile.ts";
import type { LintResult } from "#core/domain/lint_result.ts";
// The live contract must verify that real responses honor the adapter's private
// schema limit, so this file is an explicit exception to the `_` prefix rule.
import { MAX_REWRITE_CANDIDATES } from "#infra/llm/_types.ts";
import { runOpenAiAdvice } from "#infra/llm/openai_advisor.ts";
import { buildOpenAiAdviceRequest } from "#infra/llm/prompt_builder.ts";
import { mapOpenAiAdviceResponse } from "#infra/llm/response_mapper.ts";

const MODEL_ID = "gpt-6-luna";
const TIMEOUT_MS = 60_000;
const MAX_RETRIES = 2;

const PROFILE = {
  id: "work",
  label: "Work",
  description: "A message to a colleague in a professional setting.",
  expectedTones: ["neutral", "slightly formal"],
} as const satisfies ContextProfile;

// Two issues, so a response that ignores minItems/maxItems cannot accidentally
// produce the expected count.
const LINT_RESULT = {
  text: "She go to work every day, and i will asking her about the report.",
  contextId: "work",
  overallScore: 48,
  metrics: [],
  classifications: [],
  judgements: [],
  issues: [
    {
      category: "grammar",
      severity: "high",
      target: { kind: "message" },
      detail:
        'Metric "grammar" scored 40, below the issue-free threshold of 80.',
    },
    {
      category: "clarity",
      severity: "medium",
      target: { kind: "message" },
      detail:
        'Metric "clarity" scored 62, below the issue-free threshold of 80.',
    },
  ],
  status: "needs-revision",
  usage: undefined,
} as const satisfies LintResult;

Deno.test("live OpenAI advice satisfies the requested response schema", async () => {
  const apiKey = requireCredential();

  for (const kind of ["explain", "fix", "both"] as const) {
    const request = adviceRequest(kind);
    const response = await runOpenAiAdvice({
      apiKey,
      model: MODEL_ID,
      body: buildOpenAiAdviceRequest(request),
      timeoutMs: TIMEOUT_MS,
      maxRetries: MAX_RETRIES,
    });

    await printCapturedContract(kind, response.outputText);

    assertEquals(response.status, "completed", `${kind}: response status`);
    assertEquals(
      response.incompleteReason,
      undefined,
      `${kind}: response was truncated`,
    );
    assertEquals(
      response.refusal,
      undefined,
      `${kind}: model refused a benign request`,
    );

    // This exercises the same untrusted-response boundary as production; a
    // schema the provider did not honor fails here rather than in the CLI.
    const outcome = mapOpenAiAdviceResponse(request, response.outputText);

    assertEquals(
      outcome.explanations.length,
      kind === "fix" ? 0 : LINT_RESULT.issues.length,
      `${kind}: explanation count must follow the schema item bounds`,
    );
    assertEquals(
      outcome.explanations.map(({ issueIndex }) => issueIndex).toSorted(),
      kind === "fix" ? [] : [0, 1],
      `${kind}: every lint issue must be explained exactly once`,
    );
    // Only the explain-only bound is asserted in both directions. With fixes
    // requested the schema sets no minItems, and the Advisor port allows an
    // empty list when no issue is worth a rewrite; the model does return one
    // occasionally, so requiring a candidate would make this test flaky.
    if (kind === "explain") {
      assertEquals(
        outcome.candidates.length,
        0,
        `${kind}: candidates must be empty when fixes are unrequested`,
      );
    }
    assert(
      outcome.candidates.length <= MAX_REWRITE_CANDIDATES,
      `${kind}: candidate count must respect maxItems`,
    );
  }
});

function adviceRequest(kind: AdviceKind): AdviceRequest {
  return { kind, lintResult: LINT_RESULT, profile: PROFILE };
}

function requireCredential(): string {
  const apiKey = Deno.env.get("OPENAI_API_KEY") ?? "";
  if (!apiKey.trim()) {
    throw new Error("set OPENAI_API_KEY before running live tests");
  }
  return apiKey;
}

/** Prints the captured contract so fixtures can be refreshed deliberately. */
async function printCapturedContract(
  kind: AdviceKind,
  outputText: string,
): Promise<void> {
  const output = `\n--- ${kind} ---\n${outputText}\n`;
  await Deno.stdout.write(new TextEncoder().encode(output));
}
