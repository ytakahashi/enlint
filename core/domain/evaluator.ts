import type {
  ClassificationDefinition,
  ClassificationId,
  ToneValue,
} from "./classification.ts";
import type { ContextProfile } from "./context_profile.ts";
import type { JudgementDefinition, JudgementId } from "./judgement.ts";
import type { MetricDefinition, MetricId } from "./metric.ts";

export type RawScoreAnswer = {
  readonly rawLevel: number;
  readonly confidence: number | undefined;
  readonly probabilities: Readonly<Record<string, number>> | undefined;
};

export type RawChoiceAnswer = {
  readonly value: ToneValue;
  readonly confidence: number | undefined;
  readonly probabilities:
    | Readonly<Record<ToneValue, number>>
    | undefined;
};

export type RawBooleanAnswer = {
  /** Model-estimated P(true), not confidence in the selected outcome. */
  readonly probability: number;
  readonly confidence: number | undefined;
};

export type EvaluationRequest = {
  readonly text: string;
  readonly profile: ContextProfile;
  readonly metrics: readonly MetricDefinition[];
  readonly classifications: readonly ClassificationDefinition[];
  readonly judgements: readonly JudgementDefinition[];
};

export type EvaluationUsage = {
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly totalTokens?: number;
};

export type EvaluationOutcome = {
  readonly metrics: Readonly<Record<MetricId, RawScoreAnswer>>;
  readonly classifications: Readonly<
    Record<ClassificationId, RawChoiceAnswer>
  >;
  readonly judgements: Readonly<Record<JudgementId, RawBooleanAnswer>>;
  readonly usage?: EvaluationUsage;
};

export interface Evaluator {
  evaluate(request: EvaluationRequest): Promise<EvaluationOutcome>;
}
