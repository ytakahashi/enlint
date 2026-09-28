import { type ReadonlySignal, signal } from "@preact/signals-core";
import { isAdvisable } from "#core/mod.ts";
import type { Result } from "../../protocol/mod.ts";
import type { EnlintGateway } from "../gateway.ts";
import {
  canCheck,
  type CheckState,
  INITIAL_SESSION,
  isStale,
  type Session,
} from "./session.ts";

export type SessionController = {
  readonly session: ReadonlySignal<Session>;
  /** A manual edit; it also drops the undo point left by Apply. */
  setText(text: string): void;
  setContextId(contextId: string): void;
  /** Lints the current text, then requests advice if it reports issues. */
  check(): Promise<void>;
  /** Replaces the text with a rewrite candidate of the shown result. */
  apply(candidate: string): void;
  undoApply(): void;
  /**
   * Copies a candidate of the result on screen. Resolves to undefined without
   * copying when the candidate no longer matches the input, like apply.
   */
  copyCandidate(candidate: string): Promise<Result<null> | undefined>;
};

export function createSessionController(
  gateway: EnlintGateway,
  initial: Session = INITIAL_SESSION,
): SessionController {
  const session = signal(initial);
  // Only the latest Check may update the screen. A newer Check, or an edit to
  // the text or context it was started for, supersedes one in flight; its
  // responses are dropped when they arrive.
  let latestCheck = 0;

  const update = (change: Partial<Session>) => {
    session.value = { ...session.value, ...change };
  };
  const setCheck = (check: CheckState) => update({ check });

  /**
   * Applies a change to what a Check evaluates. An in-flight Check no longer
   * describes the editor, so it is abandoned: lint in flight has nothing to
   * show yet, and advice in flight leaves its lint result on screen, stale.
   */
  const changeInput = (change: Partial<Session>) => {
    const { check } = session.value;
    const next = { ...session.value, ...change };
    if (
      next.text === session.value.text &&
      next.contextId === session.value.contextId
    ) {
      session.value = next;
      return;
    }

    latestCheck++;
    session.value = {
      ...next,
      check: check.phase === "linting"
        ? { phase: "idle" }
        : check.phase === "advising"
        ? { phase: "done", result: check.result }
        : check,
    };
  };

  return {
    session,

    setText(text) {
      changeInput({ text, textBeforeApply: undefined });
    },

    setContextId(contextId) {
      changeInput({ contextId });
    },

    async check() {
      const { text, contextId } = session.value;
      if (!canCheck(session.value)) return;
      const requestNumber = ++latestCheck;
      const isCurrent = () => requestNumber === latestCheck;

      setCheck({ phase: "linting" });
      const lint = await gateway.lint({ text, contextId });
      if (!isCurrent()) return;
      if (!lint.ok) {
        setCheck({ phase: "failed", error: lint.error });
        return;
      }
      const result = lint.value;
      if (!isAdvisable(result)) {
        setCheck({ phase: "done", result });
        return;
      }

      setCheck({ phase: "advising", result });
      const advice = await gateway.advise({ lintResult: result, kind: "both" });
      if (!isCurrent()) return;
      // Advice is optional: without an advice key the Check completes with the
      // lint result alone, rather than reporting an error for advice nobody
      // set up.
      if (!advice.ok && advice.error.kind === "missing-credentials") {
        setCheck({ phase: "done", result });
        return;
      }
      setCheck({
        phase: "done",
        result,
        advice: advice.ok ? { outcome: advice.value } : { error: advice.error },
      });
    },

    apply(candidate) {
      // Only a candidate of the result on screen may replace the text, and
      // only while that result still describes it. A late click from an
      // earlier result, or one after an edit, would otherwise overwrite text
      // the candidate was never written for.
      if (!isCandidateOf(session.value, candidate)) return;
      update({ text: candidate, textBeforeApply: session.value.text });
    },

    undoApply() {
      const { textBeforeApply } = session.value;
      if (textBeforeApply === undefined) return;
      changeInput({ text: textBeforeApply, textBeforeApply: undefined });
    },

    copyCandidate(candidate) {
      // Copying is how a candidate leaves the app, so it gets the same guard
      // as apply: a candidate for edited text or another context is not a
      // rewrite of what the writer now has.
      if (!isCandidateOf(session.value, candidate)) {
        return Promise.resolve(undefined);
      }
      return gateway.copyText(candidate);
    },
  };
}

function isCandidateOf(session: Session, candidate: string): boolean {
  const { check } = session;
  return check.phase === "done" && !isStale(session) &&
    check.advice !== undefined && "outcome" in check.advice &&
    check.advice.outcome.candidates.some(({ text }) => text === candidate);
}
