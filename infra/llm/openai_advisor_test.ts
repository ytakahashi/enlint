import {
  assertEquals,
  assertInstanceOf,
  assertRejects,
  assertStrictEquals,
  assertThrows,
} from "@std/assert";
import type { AdviceRequest } from "#core/domain/advisor.ts";
import type { ContextProfile } from "#core/domain/context_profile.ts";
import type { LintResult } from "#core/domain/lint_result.ts";
import type { OpenAiAdviceCall, OpenAiAdviceResponse } from "./_types.ts";
import {
  classifyOpenAiError,
  OpenAiAdviceRefusalError,
  OpenAiAdviceResponseError,
  OpenAiAdvisor,
  OpenAiAuthenticationError,
  OpenAiConnectionError,
  OpenAiRateLimitError,
  OpenAiTimeoutError,
} from "./openai_advisor.ts";

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

const REQUEST = {
  kind: "both",
  lintResult: LINT_RESULT,
  profile: PROFILE,
} as const satisfies AdviceRequest;

async function completeResponse(): Promise<OpenAiAdviceResponse> {
  const outputText = await Deno.readTextFile(
    new URL("./_fixtures/both_response.json", import.meta.url),
  );
  return { status: "completed", outputText };
}

Deno.test("OpenAiAdvisor sends configured SDK input and maps the response", async () => {
  const calls: OpenAiAdviceCall[] = [];
  const response = await completeResponse();
  const advisor = new OpenAiAdvisor({
    runResponse: (call) => {
      calls.push(call);
      return Promise.resolve(response);
    },
  });

  const outcome = await advisor.advise(REQUEST);

  assertEquals(calls.length, 1);
  assertEquals(calls[0].model, "gpt-6-luna");
  assertEquals(calls[0].timeoutMs, 30_000);
  assertEquals(calls[0].maxRetries, 2);
  assertEquals(calls[0].body.store, false);
  assertEquals(
    JSON.parse(calls[0].body.input[1].content).message,
    LINT_RESULT.text,
  );
  assertEquals(outcome.explanations[0].issueIndex, 0);
  assertEquals(outcome.candidates[0].text, "She goes to work every day.");
});

Deno.test("OpenAiAdvisor allows model and request options to be overridden", async () => {
  const calls: OpenAiAdviceCall[] = [];
  const response = await completeResponse();
  const advisor = new OpenAiAdvisor({
    model: "custom-model",
    timeoutMs: 60_000,
    maxRetries: 0,
    runResponse: (call) => {
      calls.push(call);
      return Promise.resolve(response);
    },
  });

  await advisor.advise(REQUEST);

  assertEquals(calls[0].model, "custom-model");
  assertEquals(calls[0].timeoutMs, 60_000);
  assertEquals(calls[0].maxRetries, 0);
});

Deno.test("OpenAiAdvisor rejects invalid constructor options", () => {
  assertThrows(
    () => new OpenAiAdvisor({ model: " " }),
    TypeError,
    "model must not be empty",
  );
  assertThrows(
    () => new OpenAiAdvisor({ timeoutMs: 0 }),
    RangeError,
    "timeout must be a positive integer",
  );
  assertThrows(
    () => new OpenAiAdvisor({ maxRetries: -1 }),
    RangeError,
    "retries must be a non-negative integer",
  );
});

Deno.test("OpenAiAdvisor preserves runner errors for presentation mapping", async () => {
  const failure = new Error("service unavailable");
  const advisor = new OpenAiAdvisor({
    runResponse: () => Promise.reject(failure),
  });

  const caught = await assertRejects(() => advisor.advise(REQUEST));

  assertStrictEquals(caught, failure);
});

Deno.test("OpenAiAdvisor rejects incomplete and unexpected response statuses", async () => {
  const incomplete = new OpenAiAdvisor({
    runResponse: () =>
      Promise.resolve({
        status: "incomplete",
        incompleteReason: "max_output_tokens",
        outputText: "",
      }),
  });
  await assertRejects(
    () => incomplete.advise(REQUEST),
    OpenAiAdviceResponseError,
    'status "incomplete": max_output_tokens',
  );

  const unknown = new OpenAiAdvisor({
    runResponse: () => Promise.resolve({ status: "unknown", outputText: "" }),
  });
  await assertRejects(
    () => unknown.advise(REQUEST),
    OpenAiAdviceResponseError,
    'status "unknown"',
  );
});

Deno.test("OpenAiAdvisor exposes refusals without treating them as structured output", async () => {
  const advisor = new OpenAiAdvisor({
    runResponse: () =>
      Promise.resolve({
        status: "completed",
        outputText: "",
        refusal: "I cannot help with that request.",
      }),
  });

  const error = await assertRejects(
    () => advisor.advise(REQUEST),
    OpenAiAdviceRefusalError,
    "OpenAI refused to provide writing advice",
  );

  assertInstanceOf(error, OpenAiAdviceRefusalError);
  assertEquals(error.refusal, "I cannot help with that request.");
});

Deno.test("OpenAiAdvisor rejects a completed response without output text", async () => {
  const advisor = new OpenAiAdvisor({
    runResponse: () =>
      Promise.resolve({ status: "completed", outputText: "  " }),
  });

  await assertRejects(
    () => advisor.advise(REQUEST),
    OpenAiAdviceResponseError,
    "contained no output text",
  );
});

Deno.test("classifyOpenAiError classifies adapter errors without SDK types", () => {
  const cause = new Error("SDK failure");
  const cases = [
    [new OpenAiAuthenticationError(cause), "authentication"],
    [new OpenAiRateLimitError(cause), "rate-limit"],
    [new OpenAiTimeoutError(cause), "timeout"],
    [new OpenAiConnectionError(cause), "connection"],
  ] as const;

  for (const [error, kind] of cases) {
    assertEquals(classifyOpenAiError(error), kind);
    assertStrictEquals(error.cause, cause);
  }
  assertEquals(classifyOpenAiError(new Error("unrelated")), undefined);
});
