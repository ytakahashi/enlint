import { assertEquals } from "@std/assert";
import type { AdviceOutcome, LintResult } from "#core/mod.ts";
import type { AdviseRequest, LintRequest, Result } from "../../protocol/mod.ts";
import type { EnlintGateway } from "../gateway.ts";
import { createSessionController } from "./controller.ts";
import { INITIAL_SESSION, isStale, type Session } from "./session.ts";

function lintResult(text: string, contextId = "work"): LintResult {
  return {
    text,
    contextId,
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
  };
}

const ADVICE: AdviceOutcome = {
  explanations: [{ issueIndex: 0, explanation: "Use 'goes'." }],
  candidates: [{ text: "She goes to work.", rationale: "Agreement." }],
};

type Pending<T> = {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
};

function pending<T>(): Pending<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => resolve = settle);
  return { promise, resolve };
}

/** A gateway whose responses the test releases one call at a time. */
function fakeGateway() {
  const lints: {
    request: LintRequest;
    response: Pending<Result<LintResult>>;
  }[] = [];
  const advices: {
    request: AdviseRequest;
    response: Pending<Result<AdviceOutcome>>;
  }[] = [];
  const copies: string[] = [];
  const gateway: EnlintGateway = {
    lint(request) {
      const response = pending<Result<LintResult>>();
      lints.push({ request, response });
      return response.promise;
    },
    advise(request) {
      const response = pending<Result<AdviceOutcome>>();
      advices.push({ request, response });
      return response.promise;
    },
    copyText(text) {
      copies.push(text);
      return Promise.resolve({ ok: true, value: null });
    },
  };
  return { gateway, lints, advices, copies };
}

/** Lets pending continuations of the controller run. */
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function startWith(session: Partial<Session>) {
  const fake = fakeGateway();
  const controller = createSessionController(fake.gateway, {
    ...INITIAL_SESSION,
    text: "She go to work.",
    contextId: "work",
    ...session,
  });
  return { ...fake, controller };
}

Deno.test("check lints the text and skips advice when no option is set", async () => {
  const { controller, lints, advices } = startWith({});

  const done = controller.check();
  assertEquals(controller.session.value.check, { phase: "linting" });
  assertEquals(lints[0].request, {
    text: "She go to work.",
    contextId: "work",
  });

  lints[0].response.resolve({ ok: true, value: lintResult("She go to work.") });
  await done;

  assertEquals(controller.session.value.check, {
    phase: "done",
    result: lintResult("She go to work."),
  });
  assertEquals(advices.length, 0);
});

Deno.test("check shows the lint result while advice is pending", async () => {
  const { controller, lints, advices } = startWith({
    options: { explain: true, fix: true },
  });
  const result = lintResult("She go to work.");

  const done = controller.check();
  lints[0].response.resolve({ ok: true, value: result });
  await settle();

  assertEquals(controller.session.value.check, {
    phase: "advising",
    result,
    kind: "both",
  });
  assertEquals(advices[0].request, { lintResult: result, kind: "both" });

  advices[0].response.resolve({ ok: true, value: ADVICE });
  await done;

  assertEquals(controller.session.value.check, {
    phase: "done",
    result,
    advice: { kind: "both", outcome: ADVICE },
  });
});

Deno.test("an advice failure keeps the lint result", async () => {
  const { controller, lints, advices } = startWith({
    options: { explain: false, fix: true },
  });
  const result = lintResult("She go to work.");

  const done = controller.check();
  lints[0].response.resolve({ ok: true, value: result });
  await settle();
  advices[0].response.resolve({
    ok: false,
    error: { kind: "missing-credentials", provider: "openai" },
  });
  await done;

  assertEquals(controller.session.value.check, {
    phase: "done",
    result,
    advice: {
      kind: "fix",
      error: { kind: "missing-credentials", provider: "openai" },
    },
  });
});

Deno.test("a lint failure is shown without requesting advice", async () => {
  const { controller, lints, advices } = startWith({
    options: { explain: true, fix: false },
  });

  const done = controller.check();
  lints[0].response.resolve({
    ok: false,
    error: { kind: "timeout", provider: "jev" },
  });
  await done;

  assertEquals(controller.session.value.check, {
    phase: "failed",
    error: { kind: "timeout", provider: "jev" },
  });
  assertEquals(advices.length, 0);
});

Deno.test("check does nothing for blank text", async () => {
  const { controller, lints } = startWith({ text: "  \n" });

  await controller.check();

  assertEquals(lints.length, 0);
  assertEquals(controller.session.value.check, { phase: "idle" });
});

Deno.test("a newer check supersedes one still in flight", async () => {
  const { controller, lints } = startWith({});

  const first = controller.check();
  controller.setText("She goes to work.");
  const second = controller.check();

  // The superseded response arrives first and must not replace the pending
  // state of the newer check.
  lints[0].response.resolve({ ok: true, value: lintResult("She go to work.") });
  await first;
  assertEquals(controller.session.value.check, { phase: "linting" });

  lints[1].response.resolve({
    ok: true,
    value: lintResult("She goes to work."),
  });
  await second;
  assertEquals(controller.session.value.check, {
    phase: "done",
    result: lintResult("She goes to work."),
  });
});

Deno.test("a superseded check drops a late response", async () => {
  const { controller, lints } = startWith({});

  const first = controller.check();
  const second = controller.check();
  lints[1].response.resolve({ ok: true, value: lintResult("She go to work.") });
  await second;
  lints[0].response.resolve({
    ok: false,
    error: { kind: "connection", provider: "jev" },
  });
  await first;

  assertEquals(controller.session.value.check, {
    phase: "done",
    result: lintResult("She go to work."),
  });
});

Deno.test("a superseded check drops late advice", async () => {
  const { controller, lints, advices } = startWith({
    options: { explain: true, fix: false },
  });

  const first = controller.check();
  lints[0].response.resolve({ ok: true, value: lintResult("She go to work.") });
  await settle();
  const second = controller.check();
  advices[0].response.resolve({ ok: true, value: ADVICE });
  await first;

  assertEquals(controller.session.value.check, { phase: "linting" });

  lints[1].response.resolve({
    ok: false,
    error: { kind: "connection", provider: "jev" },
  });
  await second;
  assertEquals(controller.session.value.check, {
    phase: "failed",
    error: { kind: "connection", provider: "jev" },
  });
});

Deno.test("options changed during a check apply to the next one", async () => {
  const { controller, lints, advices } = startWith({});

  const done = controller.check();
  controller.setOptions({ explain: true, fix: true });
  lints[0].response.resolve({ ok: true, value: lintResult("She go to work.") });
  await done;

  assertEquals(advices.length, 0);
  assertEquals(controller.session.value.options, { explain: true, fix: true });
});

Deno.test("checking again discards the previous advice", async () => {
  const { controller, lints, advices } = startWith({
    options: { explain: true, fix: false },
  });
  const first = controller.check();
  lints[0].response.resolve({ ok: true, value: lintResult("She go to work.") });
  await settle();
  advices[0].response.resolve({ ok: true, value: ADVICE });
  await first;

  void controller.check();

  assertEquals(controller.session.value.check, { phase: "linting" });
});

/** A controller showing a result with ADVICE, whose candidate is CANDIDATE. */
async function withFixAdvice() {
  const started = startWith({ options: { explain: false, fix: true } });
  const done = started.controller.check();
  started.lints[0].response.resolve({
    ok: true,
    value: lintResult("She go to work."),
  });
  await settle();
  started.advices[0].response.resolve({ ok: true, value: ADVICE });
  await done;
  return started;
}

const CANDIDATE = ADVICE.candidates[0].text;

Deno.test("apply replaces the text and can be undone once", async () => {
  const { controller } = await withFixAdvice();

  controller.apply(CANDIDATE);

  assertEquals(controller.session.value.text, CANDIDATE);
  assertEquals(isStale(controller.session.value), true);

  controller.undoApply();
  assertEquals(controller.session.value.text, "She go to work.");
  assertEquals(isStale(controller.session.value), false);

  controller.undoApply();
  assertEquals(controller.session.value.text, "She go to work.");
});

Deno.test("a manual edit drops the undo point", async () => {
  const { controller } = await withFixAdvice();

  controller.apply(CANDIDATE);
  controller.setText("She goes to work daily.");
  controller.undoApply();

  assertEquals(controller.session.value.text, "She goes to work daily.");
});

Deno.test("apply is ignored once the result is stale", async () => {
  const { controller } = await withFixAdvice();

  controller.setText("She went to work.");
  controller.apply(CANDIDATE);

  assertEquals(controller.session.value.text, "She went to work.");
  assertEquals(controller.session.value.textBeforeApply, undefined);
});

Deno.test("apply accepts only a candidate of the result on screen", async () => {
  const { controller } = await withFixAdvice();

  controller.apply("She goes to the office.");

  assertEquals(controller.session.value.text, "She go to work.");
});

Deno.test("apply is ignored while no result with candidates is shown", async () => {
  // Idle, and a result whose Check asked for no advice.
  const idle = startWith({});
  idle.controller.apply(CANDIDATE);
  assertEquals(idle.controller.session.value.text, "She go to work.");

  const linted = startWith({});
  const done = linted.controller.check();
  linted.lints[0].response.resolve({
    ok: true,
    value: lintResult("She go to work."),
  });
  await done;
  linted.controller.apply(CANDIDATE);
  assertEquals(linted.controller.session.value.text, "She go to work.");

  // A late click on a candidate after Check started again.
  const { controller } = await withFixAdvice();
  void controller.check();
  controller.apply(CANDIDATE);
  assertEquals(controller.session.value.text, "She go to work.");

  // And after the newer Check failed.
  const failed = await withFixAdvice();
  const retry = failed.controller.check();
  failed.lints[1].response.resolve({
    ok: false,
    error: { kind: "timeout", provider: "jev" },
  });
  await retry;
  failed.controller.apply(CANDIDATE);
  assertEquals(failed.controller.session.value.text, "She go to work.");
});

Deno.test("an edit during lint abandons the check", async () => {
  const { controller, lints, advices } = startWith({
    options: { explain: true, fix: true },
  });

  const done = controller.check();
  controller.setText("She goes to work.");
  assertEquals(controller.session.value.check, { phase: "idle" });

  lints[0].response.resolve({ ok: true, value: lintResult("She go to work.") });
  await done;

  assertEquals(controller.session.value.check, { phase: "idle" });
  assertEquals(advices.length, 0);
});

Deno.test("a context change during lint abandons the check", async () => {
  const { controller, lints, advices } = startWith({
    options: { explain: true, fix: false },
  });

  const done = controller.check();
  controller.setContextId("chat");
  lints[0].response.resolve({ ok: true, value: lintResult("She go to work.") });
  await done;

  assertEquals(controller.session.value.check, { phase: "idle" });
  assertEquals(advices.length, 0);
});

Deno.test("an edit during advice keeps the lint result and drops the advice", async () => {
  const { controller, lints, advices } = startWith({
    options: { explain: true, fix: false },
  });
  const result = lintResult("She go to work.");

  const done = controller.check();
  lints[0].response.resolve({ ok: true, value: result });
  await settle();
  controller.setText("She goes to work.");
  advices[0].response.resolve({ ok: true, value: ADVICE });
  await done;

  assertEquals(controller.session.value.check, { phase: "done", result });
  assertEquals(isStale(controller.session.value), true);
});

Deno.test("undoing an apply abandons a check started after it", async () => {
  const { controller, lints } = await withFixAdvice();
  controller.apply(CANDIDATE);

  const done = controller.check();
  controller.undoApply();
  lints[1].response.resolve({ ok: true, value: lintResult(CANDIDATE) });
  await done;

  assertEquals(controller.session.value.text, "She go to work.");
  assertEquals(controller.session.value.check, { phase: "idle" });
});

Deno.test("setting unchanged text or context keeps the check running", async () => {
  const { controller, lints } = startWith({});

  const done = controller.check();
  controller.setText("She go to work.");
  controller.setContextId("work");
  lints[0].response.resolve({ ok: true, value: lintResult("She go to work.") });
  await done;

  assertEquals(controller.session.value.check, {
    phase: "done",
    result: lintResult("She go to work."),
  });
});

Deno.test("copyCandidate copies a candidate of the result on screen", async () => {
  const { controller, copies } = await withFixAdvice();

  assertEquals(await controller.copyCandidate(CANDIDATE), {
    ok: true,
    value: null,
  });
  assertEquals(copies, [CANDIDATE]);
});

Deno.test("copyCandidate copies nothing once the candidate no longer matches", async () => {
  const unknown = await withFixAdvice();
  assertEquals(
    await unknown.controller.copyCandidate("She goes to the office."),
    undefined,
  );

  const edited = await withFixAdvice();
  edited.controller.setText("She went to work.");
  assertEquals(await edited.controller.copyCandidate(CANDIDATE), undefined);

  const recontexted = await withFixAdvice();
  recontexted.controller.setContextId("chat");
  assertEquals(
    await recontexted.controller.copyCandidate(CANDIDATE),
    undefined,
  );

  const rechecked = await withFixAdvice();
  void rechecked.controller.check();
  assertEquals(await rechecked.controller.copyCandidate(CANDIDATE), undefined);

  for (const { copies } of [unknown, edited, recontexted, rechecked]) {
    assertEquals(copies, []);
  }
});
