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
  runOpenAiAdvice,
} from "./openai_advisor.ts";
import { buildOpenAiAdviceRequest } from "./prompt_builder.ts";

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

const REPO_ROOT = new URL("../../", import.meta.url);
const decoder = new TextDecoder();

/** Minimal Responses API body the SDK accepts as a completed response. */
function sdkResponseBody(outputText: string) {
  return {
    id: "resp_test",
    object: "response",
    created_at: 0,
    status: "completed",
    model: "gpt-6-luna",
    output: [{
      type: "message",
      id: "msg_test",
      status: "completed",
      role: "assistant",
      content: [{ type: "output_text", text: outputText, annotations: [] }],
    }],
  };
}

/**
 * The SDK picks up globalThis.fetch when the client is constructed, so a stub
 * installed around the runner call keeps the real SDK path off the network.
 */
async function withFakeFetch<T>(
  respond: (request: Request) => Response,
  run: () => Promise<T>,
): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = (input, init) =>
    Promise.resolve(respond(new Request(input, init)));
  try {
    return await run();
  } finally {
    globalThis.fetch = original;
  }
}

// Runs in a child process fed through stdin; prints the request the SDK built.
const ENV_PROBE_SCRIPT = `
import { runOpenAiAdvice } from "#infra/llm/openai_advisor.ts";
import { buildOpenAiAdviceRequest } from "#infra/llm/prompt_builder.ts";

let captured;
globalThis.fetch = (input, init) => {
  const request = new Request(input, init);
  captured = {
    url: request.url,
    authorization: request.headers.get("authorization"),
    organization: request.headers.get("openai-organization"),
    project: request.headers.get("openai-project"),
    injected: request.headers.get("x-injected"),
  };
  return Promise.resolve(Response.json(${
  JSON.stringify(sdkResponseBody("{}"))
}));
};
await runOpenAiAdvice({
  apiKey: "sk-test-dummy",
  model: "gpt-6-luna",
  body: buildOpenAiAdviceRequest(${JSON.stringify(REQUEST)}),
  timeoutMs: 30000,
  maxRetries: 0,
});
console.log(JSON.stringify(captured));
`;

Deno.test("OpenAiAdvisor sends configured SDK input and maps the response", async () => {
  const calls: OpenAiAdviceCall[] = [];
  const response = await completeResponse();
  const advisor = new OpenAiAdvisor({
    apiKey: "test-key",
    runResponse: (call) => {
      calls.push(call);
      return Promise.resolve(response);
    },
  });

  const outcome = await advisor.advise(REQUEST);

  assertEquals(calls.length, 1);
  assertEquals(calls[0].apiKey, "test-key");
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
    apiKey: "test-key",
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

Deno.test("OpenAiAdvisor resolves a lazy API key only when advice is requested", async () => {
  const calls: OpenAiAdviceCall[] = [];
  let reads = 0;
  const response = await completeResponse();
  const advisor = new OpenAiAdvisor({
    apiKey: () => {
      reads++;
      return "lazy-key";
    },
    runResponse: (call) => {
      calls.push(call);
      return Promise.resolve(response);
    },
  });

  assertEquals(reads, 0);
  await advisor.advise(REQUEST);

  assertEquals(reads, 1);
  assertEquals(calls[0].apiKey, "lazy-key");
});

Deno.test("OpenAiAdvisor rejects invalid constructor options", () => {
  assertThrows(
    () => new OpenAiAdvisor({ apiKey: "test-key", model: " " }),
    TypeError,
    "model must not be empty",
  );
  assertThrows(
    () => new OpenAiAdvisor({ apiKey: "test-key", timeoutMs: 0 }),
    RangeError,
    "timeout must be a positive integer",
  );
  assertThrows(
    () => new OpenAiAdvisor({ apiKey: "test-key", maxRetries: -1 }),
    RangeError,
    "retries must be a non-negative integer",
  );
});

Deno.test("OpenAiAdvisor preserves runner errors for presentation mapping", async () => {
  const failure = new Error("service unavailable");
  const advisor = new OpenAiAdvisor({
    apiKey: "test-key",
    runResponse: () => Promise.reject(failure),
  });

  const caught = await assertRejects(() => advisor.advise(REQUEST));

  assertStrictEquals(caught, failure);
});

Deno.test("OpenAiAdvisor rejects incomplete and unexpected response statuses", async () => {
  const incomplete = new OpenAiAdvisor({
    apiKey: "test-key",
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
    apiKey: "test-key",
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
    apiKey: "test-key",
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
    apiKey: "test-key",
    runResponse: () =>
      Promise.resolve({ status: "completed", outputText: "  " }),
  });

  await assertRejects(
    () => advisor.advise(REQUEST),
    OpenAiAdviceResponseError,
    "contained no output text",
  );
});

Deno.test("runOpenAiAdvice rejects a blank API key as an authentication failure", async () => {
  const error = await assertRejects(
    () =>
      runOpenAiAdvice({
        apiKey: "  ",
        model: "gpt-6-luna",
        body: buildOpenAiAdviceRequest(REQUEST),
        timeoutMs: 30_000,
        maxRetries: 0,
      }),
    OpenAiAuthenticationError,
  );

  assertEquals(classifyOpenAiError(error), "authentication");
});

Deno.test("runOpenAiAdvice sends the explicit key to the fixed endpoint", async () => {
  const outputText = (await completeResponse()).outputText;
  const requests: Request[] = [];

  const response = await withFakeFetch((request) => {
    requests.push(request);
    return Response.json(sdkResponseBody(outputText));
  }, () =>
    runOpenAiAdvice({
      apiKey: "sk-test-dummy",
      model: "gpt-6-luna",
      body: buildOpenAiAdviceRequest(REQUEST),
      timeoutMs: 30_000,
      maxRetries: 0,
    }));

  assertEquals(requests.length, 1);
  const [request] = requests;
  assertEquals(request.method, "POST");
  assertEquals(request.url, "https://api.openai.com/v1/responses");
  assertEquals(request.headers.get("authorization"), "Bearer sk-test-dummy");
  assertEquals(request.headers.get("openai-organization"), null);
  assertEquals(request.headers.get("openai-project"), null);
  const sent = await request.json();
  assertEquals(sent.model, "gpt-6-luna");
  assertEquals(sent.store, false);
  assertEquals(response, {
    status: "completed",
    outputText,
    refusal: undefined,
    incompleteReason: undefined,
  });
});

// The test task grants no env access, so in-process SDK reads are silently
// denied and indistinguishable from reads that never happen. A child process
// with full env access and Deno's permission audit log shows what the SDK
// would actually read, and the misleading values prove none of them apply.
Deno.test("runOpenAiAdvice reads no OpenAI configuration from the environment", async () => {
  const child = new Deno.Command("deno", {
    args: [
      "run",
      "--quiet",
      "--config",
      "deno.json",
      "--allow-env",
      // Mirrors the presentations' grant: the SDK reads this unconditionally.
      "--deny-env=OPENAI_CUSTOM_HEADERS",
      "--no-prompt",
      "-",
    ],
    cwd: REPO_ROOT,
    env: {
      DENO_AUDIT_PERMISSIONS: "/dev/stderr",
      OPENAI_API_KEY: "sk-from-env",
      OPENAI_BASE_URL: "https://attacker.invalid/v1",
      OPENAI_ORG_ID: "org-from-env",
      OPENAI_PROJECT_ID: "proj-from-env",
      OPENAI_LOG: "debug",
      OPENAI_CUSTOM_HEADERS: "X-Injected: from-env",
    },
    stdin: "piped",
    stdout: "piped",
    stderr: "piped",
  }).spawn();
  const writer = child.stdin.getWriter();
  await writer.write(new TextEncoder().encode(ENV_PROBE_SCRIPT));
  await writer.close();
  const { code, stdout, stderr } = await child.output();

  const errorOutput = decoder.decode(stderr);
  assertEquals(code, 0, errorOutput);
  const envReads = errorOutput.split("\n")
    .filter((line) => line.startsWith("{"))
    .map((line) => JSON.parse(line))
    .filter(({ permission }) => permission === "env")
    .map(({ value }) => value);
  assertEquals([...new Set(envReads)], ["OPENAI_CUSTOM_HEADERS"]);
  assertEquals(JSON.parse(decoder.decode(stdout)), {
    url: "https://api.openai.com/v1/responses",
    authorization: "Bearer sk-test-dummy",
    organization: null,
    project: null,
    injected: null,
  });
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
