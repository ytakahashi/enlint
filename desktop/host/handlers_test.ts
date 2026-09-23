import { assert, assertEquals } from "@std/assert";
import type {
  AdviceOutcome,
  Advisor,
  EvaluationOutcome,
  Evaluator,
  LintResult,
} from "#core/mod.ts";
import { FakeAdvisor } from "#core/testing/fake_advisor.ts";
import { FakeEvaluator } from "#core/testing/fake_evaluator.ts";
import { JevAuthenticationError } from "#infra/jev/jev_evaluator.ts";
import { OpenAiAdviceRefusalError } from "#infra/llm/openai_advisor.ts";
import type { AdviseRequest, LintRequest } from "../protocol/mod.ts";
import type { CredentialName } from "./credentials.ts";
import { createHandlers, type HandlerDependencies } from "./handlers.ts";

const OUTCOME = {
  metrics: {
    naturalness: level(4),
    grammar: level(4),
    clarity: level(2),
    contextFit: level(4),
  },
  classifications: {
    tone: { value: "neutral", confidence: 0.8, probabilities: undefined },
  },
  judgements: { needsFix: { probability: 0.7, confidence: undefined } },
} as const satisfies EvaluationOutcome;

function level(rawLevel: number) {
  return { rawLevel, confidence: 0.8, probabilities: undefined };
}

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

const ADVICE = {
  explanations: [{ issueIndex: 0, explanation: "Use 'goes'." }],
  candidates: [],
} as const satisfies AdviceOutcome;

type Harness = {
  readonly dependencies: HandlerDependencies;
  readonly evaluatorKeys: string[];
  readonly advisorKeys: string[];
  readonly resolved: CredentialName[];
  readonly copied: string[];
  readonly reported: unknown[];
};

function harness(options: {
  readonly credentials?: Partial<Record<CredentialName, string>>;
  readonly evaluator?: Evaluator;
  readonly advisor?: Advisor;
  readonly clipboardError?: Error;
  readonly credentialError?: Error;
} = {}): Harness {
  const credentials = options.credentials ?? {
    TYPESAFE_API_KEY: "jev-key",
    OPENAI_API_KEY: "openai-key",
  };
  const result: Harness = {
    evaluatorKeys: [],
    advisorKeys: [],
    resolved: [],
    copied: [],
    reported: [],
    dependencies: {
      resolveCredential: (name) => {
        result.resolved.push(name);
        return options.credentialError === undefined
          ? Promise.resolve(credentials[name])
          : Promise.reject(options.credentialError);
      },
      createEvaluator: (apiKey) => {
        result.evaluatorKeys.push(apiKey);
        return options.evaluator ?? new FakeEvaluator(OUTCOME);
      },
      createAdvisor: (apiKey) => {
        result.advisorKeys.push(apiKey);
        return options.advisor ?? new FakeAdvisor({ outcome: ADVICE });
      },
      clipboard: {
        writeText: (text) => {
          result.copied.push(text);
          return options.clipboardError === undefined
            ? Promise.resolve()
            : Promise.reject(options.clipboardError);
        },
      },
      reportError: (error) => result.reported.push(error),
    },
  };
  return result;
}

Deno.test("lint evaluates the text with the requested context", async () => {
  const evaluator = new FakeEvaluator(OUTCOME);
  const h = harness({ evaluator });

  const response = await createHandlers(h.dependencies).lint({
    text: "Could you review this today?",
    contextId: "email",
  });

  assert(response.ok);
  assertEquals(response.value.text, "Could you review this today?");
  assertEquals(response.value.contextId, "email");
  assertEquals(evaluator.requests[0].profile.id, "email");
  assertEquals(h.evaluatorKeys, ["jev-key"]);
});

Deno.test("lint rejects an unknown context before resolving credentials", async () => {
  const h = harness();

  const response = await createHandlers(h.dependencies).lint({
    text: "Hello.",
    contextId: "unknown",
  });

  assertEquals(response, { ok: false, error: { kind: "unknown-context" } });
  assertEquals(h.resolved, []);
});

Deno.test("lint reports a missing key without calling the evaluator", async () => {
  const h = harness({ credentials: { OPENAI_API_KEY: "openai-key" } });

  const response = await createHandlers(h.dependencies).lint({
    text: "Hello.",
    contextId: "work",
  });

  assertEquals(response, {
    ok: false,
    error: { kind: "missing-credentials", provider: "jev" },
  });
  assertEquals(h.evaluatorKeys, []);
});

Deno.test("lint classifies evaluator failures and reports them", async () => {
  const failure = new JevAuthenticationError(new Error("401"));
  const h = harness({
    evaluator: { evaluate: () => Promise.reject(failure) },
  });

  const response = await createHandlers(h.dependencies).lint({
    text: "Hello.",
    contextId: "work",
  });

  assertEquals(response, {
    ok: false,
    error: { kind: "authentication", provider: "jev" },
  });
  assertEquals(h.reported, [failure]);
});

Deno.test("lint reports a failed credential lookup as unexpected", async () => {
  const failure = new Error("Keychain unavailable");
  const h = harness({ credentialError: failure });

  const response = await createHandlers(h.dependencies).lint({
    text: "Hello.",
    contextId: "work",
  });

  assertEquals(response, { ok: false, error: { kind: "unexpected" } });
  assertEquals(h.reported, [failure]);
});

Deno.test("advise uses the profile named by the lint result", async () => {
  const advisor = new FakeAdvisor({ outcome: ADVICE });
  const h = harness({ advisor });

  const response = await createHandlers(h.dependencies).advise({
    lintResult: LINT_RESULT,
    kind: "explain",
  });

  assertEquals(response, { ok: true, value: ADVICE });
  assertEquals(advisor.requests[0].profile.id, "work");
  assertEquals(advisor.requests[0].kind, "explain");
  assertEquals(h.advisorKeys, ["openai-key"]);
});

Deno.test("advise reports a missing OpenAI key without calling the advisor", async () => {
  const h = harness({ credentials: { TYPESAFE_API_KEY: "jev-key" } });

  const response = await createHandlers(h.dependencies).advise({
    lintResult: LINT_RESULT,
    kind: "fix",
  });

  assertEquals(response, {
    ok: false,
    error: { kind: "missing-credentials", provider: "openai" },
  });
  assertEquals(h.advisorKeys, []);
});

Deno.test("advise rejects a lint result from an unknown context", async () => {
  const h = harness();

  const response = await createHandlers(h.dependencies).advise({
    lintResult: { ...LINT_RESULT, contextId: "unknown" },
    kind: "both",
  });

  assertEquals(response, { ok: false, error: { kind: "unknown-context" } });
  assertEquals(h.resolved, []);
});

Deno.test("advise classifies advisor failures and reports them", async () => {
  const failure = new OpenAiAdviceRefusalError("I cannot help.");
  const h = harness({ advisor: new FakeAdvisor({ error: failure }) });

  const response = await createHandlers(h.dependencies).advise({
    lintResult: LINT_RESULT,
    kind: "fix",
  });

  assertEquals(response, {
    ok: false,
    error: { kind: "refused", provider: "openai" },
  });
  assertEquals(h.reported, [failure]);
});

Deno.test("copyText writes to the clipboard", async () => {
  const h = harness();

  const response = await createHandlers(h.dependencies).copyText("Hello.");

  assertEquals(response, { ok: true, value: null });
  assertEquals(h.copied, ["Hello."]);
});

Deno.test("copyText reports clipboard failures", async () => {
  const failure = new Error("clipboard did not respond");
  const h = harness({ clipboardError: failure });

  const response = await createHandlers(h.dependencies).copyText("Hello.");

  assertEquals(response, { ok: false, error: { kind: "clipboard" } });
  assertEquals(h.reported, [failure]);
});

// Bindings arguments are untyped JSON at run time, so the casts below stand in
// for whatever the webview might send.
Deno.test("lint resolves malformed requests to a result", async () => {
  const requests = [
    null,
    undefined,
    {},
    { text: "Hello." },
    { text: null, contextId: "work" },
    { text: 1, contextId: "work" },
  ];

  for (const request of requests) {
    const h = harness();
    const response = await createHandlers(h.dependencies).lint(
      request as unknown as LintRequest,
    );

    assertEquals(
      response,
      { ok: false, error: { kind: "unexpected" } },
      JSON.stringify(request),
    );
    assertEquals(h.resolved, [], JSON.stringify(request));
    assertEquals(h.reported.length, 1, JSON.stringify(request));
  }
});

Deno.test("advise resolves malformed requests to a result", async () => {
  const requests = [
    null,
    {},
    { lintResult: null, kind: "fix" },
    { lintResult: {}, kind: "fix" },
    { lintResult: LINT_RESULT },
    { lintResult: LINT_RESULT, kind: "rewrite" },
    // A result that does not match LintResult must not reach the paid advisor.
    { lintResult: { ...LINT_RESULT, text: 123 }, kind: "fix" },
    {
      lintResult: { ...LINT_RESULT, issues: [{ category: "grammar" }] },
      kind: "fix",
    },
  ];

  for (const request of requests) {
    const h = harness();
    const response = await createHandlers(h.dependencies).advise(
      request as unknown as AdviseRequest,
    );

    assertEquals(
      response,
      { ok: false, error: { kind: "unexpected" } },
      JSON.stringify(request),
    );
    assertEquals(h.resolved, [], JSON.stringify(request));
    assertEquals(h.advisorKeys, [], JSON.stringify(request));
    assertEquals(h.reported.length, 1, JSON.stringify(request));
  }
});

Deno.test("copyText writes nothing for a non-string argument", async () => {
  for (const text of [null, undefined, 1]) {
    const h = harness();
    const response = await createHandlers(h.dependencies).copyText(
      text as unknown as string,
    );

    assertEquals(response, { ok: false, error: { kind: "unexpected" } });
    assertEquals(h.copied, []);
    assertEquals(h.reported.length, 1);
  }
});
