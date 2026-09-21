import type { ClassificationResult } from "./classification.ts";
import type { EvaluationUsage } from "./evaluator.ts";
import type { Issue } from "./issue.ts";
import type { JudgementResult } from "./judgement.ts";
import type { MetricResult } from "./metric.ts";

export type Status = "ready" | "improvable" | "needs-revision";

export type LintResult = {
  readonly text: string;
  readonly contextId: string;
  /** Overall score in the inclusive range from 0 to 100. */
  readonly overallScore: number;
  readonly metrics: readonly MetricResult[];
  readonly classifications: readonly ClassificationResult[];
  readonly judgements: readonly JudgementResult[];
  readonly issues: readonly Issue[];
  readonly status: Status;
  readonly usage: EvaluationUsage | undefined;
};
