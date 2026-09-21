import type { ContextProfile } from "./context_profile.ts";
import type { LintResult } from "./lint_result.ts";

export type AdviceKind = "explain" | "fix" | "both";

export type AdviceRequest = {
  /** The source text is taken from lintResult.text to keep advice tied to it. */
  readonly lintResult: LintResult;
  /**
   * Must be the profile lintResult.contextId names. Advisors need the
   * description that the ID alone does not carry, so the context is repeated
   * here; a mismatch would advise against the wrong register unnoticed.
   */
  readonly profile: ContextProfile;
  readonly kind: AdviceKind;
};

export type IssueExplanation = {
  /** Zero-based index into the request's lintResult.issues. */
  readonly issueIndex: number;
  readonly explanation: string;
};

export type RewriteCandidate = {
  readonly text: string;
  readonly rationale: string;
};

export type AdviceOutcome = {
  /** Empty when explanations were not requested; at most one per issue. */
  readonly explanations: readonly IssueExplanation[];
  /**
   * Empty when fixes were not requested. Also empty when they were requested
   * and the text needs no rewrite, so that an advisor never has to invent one.
   */
  readonly candidates: readonly RewriteCandidate[];
};

export interface Advisor {
  advise(request: AdviceRequest): Promise<AdviceOutcome>;
}
