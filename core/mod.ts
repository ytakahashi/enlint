export { adviseLintResult } from "./application/advise_lint_result.ts";
export { lintMessage } from "./application/lint_message.ts";
export type { LintMessageInput } from "./application/lint_message.ts";
export type {
  AdviceKind,
  AdviceOutcome,
  AdviceRequest,
  Advisor,
  IssueExplanation,
  RewriteCandidate,
} from "./domain/advisor.ts";
export {
  CLASSIFICATION_DEFINITIONS,
  TONE_DEFINITION,
} from "./domain/classification.ts";
export type {
  ClassificationDefinition,
  ClassificationId,
  ClassificationResult,
  ToneValue,
} from "./domain/classification.ts";
export {
  BUILT_IN_CONTEXT_PROFILE_IDS,
  BUILT_IN_CONTEXT_PROFILES,
  DEFAULT_CONTEXT_PROFILE_ID,
  getBuiltInContextProfile,
} from "./domain/context_profile.ts";
export type {
  BuiltInContextProfileId,
  ContextProfile,
} from "./domain/context_profile.ts";
export type {
  EvaluationOutcome,
  EvaluationRequest,
  EvaluationUsage,
  Evaluator,
  RawBooleanAnswer,
  RawChoiceAnswer,
  RawScoreAnswer,
} from "./domain/evaluator.ts";
export type {
  Issue,
  IssueCategory,
  IssueSeverity,
  IssueTarget,
} from "./domain/issue.ts";
export {
  JUDGEMENT_DEFINITIONS,
  NEEDS_FIX_DEFINITION,
} from "./domain/judgement.ts";
export type {
  JudgementDefinition,
  JudgementId,
  JudgementResult,
} from "./domain/judgement.ts";
export type { LintResult, Status } from "./domain/lint_result.ts";
export { METRIC_DEFINITIONS } from "./domain/metric.ts";
export type {
  MetricDefinition,
  MetricId,
  MetricResult,
} from "./domain/metric.ts";
