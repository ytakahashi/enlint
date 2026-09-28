import type { AdviceOutcome, LintResult } from "#core/mod.ts";

/** Presentation data composed by the CLI without changing the lint result. */
export type LintReport = {
  readonly lintResult: LintResult;
  readonly advice: AdviceOutcome | undefined;
};
