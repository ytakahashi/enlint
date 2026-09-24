import { assertEquals } from "@std/assert";
import type { LintResult } from "#core/mod.ts";
import {
  adviceKindOf,
  canCheck,
  currentResult,
  INITIAL_SESSION,
  isStale,
  type Session,
} from "./session.ts";

const RESULT = {
  text: "She go to work.",
  contextId: "work",
  overallScore: 60,
  metrics: [],
  classifications: [],
  judgements: [],
  issues: [],
  status: "needs-revision",
  usage: undefined,
} as const satisfies LintResult;

const CHECKED: Session = {
  ...INITIAL_SESSION,
  text: RESULT.text,
  contextId: RESULT.contextId,
  check: { phase: "done", result: RESULT },
};

Deno.test("adviceKindOf follows the Explain and Fix options", () => {
  assertEquals(adviceKindOf({ explain: false, fix: false }), undefined);
  assertEquals(adviceKindOf({ explain: true, fix: false }), "explain");
  assertEquals(adviceKindOf({ explain: false, fix: true }), "fix");
  assertEquals(adviceKindOf({ explain: true, fix: true }), "both");
});

Deno.test("the initial session starts unchecked with the default context", () => {
  assertEquals(INITIAL_SESSION.options, { explain: false, fix: false });
  assertEquals(INITIAL_SESSION.contextId, "general");
  assertEquals(currentResult(INITIAL_SESSION), undefined);
});

Deno.test("currentResult is available while advice is pending", () => {
  assertEquals(
    currentResult({
      ...CHECKED,
      check: { phase: "advising", result: RESULT, kind: "fix" },
    }),
    RESULT,
  );
  assertEquals(
    currentResult({ ...CHECKED, check: { phase: "linting" } }),
    undefined,
  );
});

Deno.test("isStale detects edits and context changes after a check", () => {
  assertEquals(isStale(CHECKED), false);
  assertEquals(isStale({ ...CHECKED, text: "She goes to work." }), true);
  assertEquals(isStale({ ...CHECKED, contextId: "chat" }), true);
  assertEquals(isStale({ ...CHECKED, check: { phase: "idle" } }), false);
});

Deno.test("canCheck requires non-blank text", () => {
  assertEquals(canCheck({ ...INITIAL_SESSION, text: "" }), false);
  assertEquals(canCheck({ ...INITIAL_SESSION, text: " \n\t" }), false);
  assertEquals(canCheck({ ...INITIAL_SESSION, text: "Hi." }), true);
});
