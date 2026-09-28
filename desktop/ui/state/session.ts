import {
  type AdviceOutcome,
  DEFAULT_CONTEXT_PROFILE_ID,
  type LintResult,
} from "#core/mod.ts";
import type { DesktopError } from "../../protocol/mod.ts";

/** What came back when advice was requested for one lint result. */
export type AdviceReport =
  | { readonly outcome: AdviceOutcome }
  | { readonly error: DesktopError };

/**
 * One Check runs lint, then advice when the result reports issues. The lint
 * result is shown as soon as it arrives, so the advising phase already carries
 * it.
 */
export type CheckState =
  | { readonly phase: "idle" }
  | { readonly phase: "linting" }
  | { readonly phase: "advising"; readonly result: LintResult }
  | {
    readonly phase: "done";
    readonly result: LintResult;
    readonly advice?: AdviceReport;
  }
  | { readonly phase: "failed"; readonly error: DesktopError };

export type Session = {
  readonly text: string;
  readonly contextId: string;
  readonly check: CheckState;
  /** The text before the last Apply, for a single level of undo. */
  readonly textBeforeApply?: string;
};

export const INITIAL_SESSION: Session = {
  text: "",
  contextId: DEFAULT_CONTEXT_PROFILE_ID,
  check: { phase: "idle" },
};

/** The result on screen, if any, whether or not advice has arrived. */
export function currentResult(session: Session): LintResult | undefined {
  const { check } = session;
  return check.phase === "advising" || check.phase === "done"
    ? check.result
    : undefined;
}

/**
 * Whether the shown result no longer describes the editor. A stale result stays
 * visible so the writer can see what they were fixing, but actions that would
 * act on it, such as Apply, are disabled.
 */
export function isStale(session: Session): boolean {
  const result = currentResult(session);
  return result !== undefined &&
    (result.text !== session.text || result.contextId !== session.contextId);
}

/** Blank text is never sent: an evaluation of nothing only costs a request. */
export function canCheck(session: Session): boolean {
  return session.text.trim().length > 0;
}
