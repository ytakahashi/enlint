import type { AdviceKind, AdviceOutcome, LintResult } from "#core/mod.ts";

/**
 * Contract between the desktop host and its webview.
 *
 * Every value crosses the bindings boundary as JSON: `undefined` properties are
 * dropped, and `Date`, `Map`, class instances, and functions do not survive.
 * Core results are carried as they are because they are plain data; the
 * adjacent test keeps that assumption checked.
 */
export type Bindings = {
  lint(request: LintRequest): Promise<Result<LintResult>>;
  advise(request: AdviseRequest): Promise<Result<AdviceOutcome>>;
  copyText(text: string): Promise<Result<null>>;
};

export type LintRequest = {
  readonly text: string;
  readonly contextId: string;
};

export type AdviseRequest = {
  /**
   * The result being advised on. The host keeps no session state, so the
   * webview sends back the result it holds, and the host resolves the profile
   * from its `contextId`.
   */
  readonly lintResult: LintResult;
  readonly kind: AdviceKind;
};

/**
 * Failures are returned rather than thrown: a rejected binding reaches the
 * webview as a plain `Error` whose name is always "Error", so its kind could
 * not be told apart there.
 */
export type Result<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: DesktopError };

export type DesktopError = {
  readonly kind: DesktopErrorKind;
  /** Set when the failure belongs to one provider. */
  readonly provider?: Provider;
};

export type DesktopErrorKind =
  | "missing-credentials"
  | "authentication"
  | "rate-limit"
  | "timeout"
  | "connection"
  | "invalid-response"
  | "refused"
  | "unknown-context"
  | "clipboard"
  | "unexpected";

export type Provider = "jev" | "openai";
