import type { AdviceKind, AdviceOutcome, LintResult } from "#core/mod.ts";

export type AdviceReport = {
  readonly kind: AdviceKind;
  readonly outcome: AdviceOutcome;
};

/** Presentation data composed by the CLI without changing the lint result. */
export type LintReport = {
  readonly lintResult: LintResult;
  readonly advice: AdviceReport | undefined;
};
