import { assertEquals } from "@std/assert";
import type { LintResult } from "#core/mod.ts";
import type { Bindings } from "../protocol/mod.ts";
import { createBindingsGateway } from "./gateway.ts";

const LINT_RESULT = {
  text: "Hello.",
  contextId: "general",
  overallScore: 90,
  metrics: [],
  classifications: [],
  judgements: [],
  issues: [],
  status: "ready",
  usage: undefined,
} as const satisfies LintResult;

Deno.test("bindings gateway forwards calls and their results", async () => {
  const calls: unknown[] = [];
  const bindings: Bindings = {
    lint: (request) => {
      calls.push(["lint", request]);
      return Promise.resolve({ ok: true, value: LINT_RESULT });
    },
    advise: (request) => {
      calls.push(["advise", request]);
      return Promise.resolve({
        ok: false,
        error: { kind: "refused", provider: "openai" },
      });
    },
    copyText: (text) => {
      calls.push(["copyText", text]);
      return Promise.resolve({ ok: true, value: null });
    },
  };
  const gateway = createBindingsGateway(bindings);

  assertEquals(await gateway.lint({ text: "Hello.", contextId: "general" }), {
    ok: true,
    value: LINT_RESULT,
  });
  assertEquals(await gateway.advise({ lintResult: LINT_RESULT, kind: "fix" }), {
    ok: false,
    error: { kind: "refused", provider: "openai" },
  });
  assertEquals(await gateway.copyText("Hello."), { ok: true, value: null });
  assertEquals(calls, [
    ["lint", { text: "Hello.", contextId: "general" }],
    ["advise", { lintResult: LINT_RESULT, kind: "fix" }],
    ["copyText", "Hello."],
  ]);
});

Deno.test("bindings gateway turns a rejected call into an unexpected result", async () => {
  // A binding that is not registered rejects with a plain Error.
  const reject = () => Promise.reject(new Error("binding is not registered"));
  const gateway = createBindingsGateway({
    lint: reject,
    advise: reject,
    copyText: reject,
  });
  const unexpected = { ok: false, error: { kind: "unexpected" } } as const;

  assertEquals(
    await gateway.lint({ text: "Hello.", contextId: "general" }),
    unexpected,
  );
  assertEquals(
    await gateway.advise({ lintResult: LINT_RESULT, kind: "explain" }),
    unexpected,
  );
  assertEquals(await gateway.copyText("Hello."), unexpected);
});
