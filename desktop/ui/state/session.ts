import {
  type AdviceKind,
  type AdviceOutcome,
  DEFAULT_CONTEXT_PROFILE_ID,
  type LintResult,
} from "#core/mod.ts";
import type { DesktopError } from "../../protocol/mod.ts";

export type CheckOptions = {
  readonly explain: boolean;
  readonly fix: boolean;
};

/** Advice for one lint result: what was asked for, and what came back. */
export type AdviceReport =
  | { readonly kind: AdviceKind; readonly outcome: AdviceOutcome }
  | { readonly kind: AdviceKind; readonly error: DesktopError };

/**
 * One Check runs lint, then advice when an option asks for it. The lint result
 * is shown as soon as it arrives, so the advising phase already carries it.
 */
export type CheckState =
  | { readonly phase: "idle" }
  | { readonly phase: "linting" }
  | {
    readonly phase: "advising";
    readonly result: LintResult;
    readonly kind: AdviceKind;
  }
  | {
    readonly phase: "done";
    readonly result: LintResult;
    readonly advice?: AdviceReport;
  }
  | { readonly phase: "failed"; readonly error: DesktopError };

export type Session = {
  readonly text: string;
  readonly contextId: string;
  /** Kept in memory only; every launch starts with both unchecked. */
  readonly options: CheckOptions;
  readonly check: CheckState;
  /** The text before the last Apply, for a single level of undo. */
  readonly textBeforeApply?: string;
};

export const INITIAL_SESSION: Session = {
  text: "",
  contextId: DEFAULT_CONTEXT_PROFILE_ID,
  options: { explain: false, fix: false },
  check: { phase: "idle" },
};

export function adviceKindOf(options: CheckOptions): AdviceKind | undefined {
  if (options.explain && options.fix) return "both";
  if (options.explain) return "explain";
  if (options.fix) return "fix";
  return undefined;
}

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
