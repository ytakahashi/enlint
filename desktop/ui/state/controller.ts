import { type ReadonlySignal, signal } from "@preact/signals-core";
import type { Result } from "../../protocol/mod.ts";
import type { EnlintGateway } from "../gateway.ts";
import {
  adviceKindOf,
  canCheck,
  type CheckOptions,
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
  setOptions(options: CheckOptions): void;
  /** Lints the current text, then requests advice if an option asks for it. */
  check(): Promise<void>;
  /** Replaces the text with a rewrite candidate of the shown result. */
  apply(candidate: string): void;
  undoApply(): void;
  copy(text: string): Promise<Result<null>>;
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

    setOptions(options) {
      update({ options });
    },

    async check() {
      const { text, contextId, options } = session.value;
      if (!canCheck(session.value)) return;
      const requestNumber = ++latestCheck;
      const isCurrent = () => requestNumber === latestCheck;
      // Read the options once, so toggling them mid-flight does not change
      // what this Check asks for.
      const kind = adviceKindOf(options);

      setCheck({ phase: "linting" });
      const lint = await gateway.lint({ text, contextId });
      if (!isCurrent()) return;
      if (!lint.ok) {
        setCheck({ phase: "failed", error: lint.error });
        return;
      }
      const result = lint.value;
      if (kind === undefined) {
        setCheck({ phase: "done", result });
        return;
      }

      setCheck({ phase: "advising", result, kind });
      const advice = await gateway.advise({ lintResult: result, kind });
      if (!isCurrent()) return;
      setCheck({
        phase: "done",
        result,
        advice: advice.ok
          ? { kind, outcome: advice.value }
          : { kind, error: advice.error },
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

    copy(text) {
      return gateway.copyText(text);
    },
  };
}

function isCandidateOf(session: Session, candidate: string): boolean {
  const { check } = session;
  return check.phase === "done" && !isStale(session) &&
    check.advice !== undefined && "outcome" in check.advice &&
    check.advice.outcome.candidates.some(({ text }) => text === candidate);
}
