import {
  CLASSIFICATION_DEFINITIONS,
  type ClassificationResult,
} from "../domain/classification.ts";
import type { ContextProfile } from "../domain/context_profile.ts";
import type { Evaluator } from "../domain/evaluator.ts";
import {
  JUDGEMENT_DEFINITIONS,
  type JudgementResult,
} from "../domain/judgement.ts";
import type { LintResult } from "../domain/lint_result.ts";
import { METRIC_DEFINITIONS } from "../domain/metric.ts";
import { deriveIssues } from "./issue_derivation.ts";
import { calculateScores, resolveMetricDefinitions } from "./scoring.ts";
import { determineStatus } from "./status.ts";

export type LintMessageInput = {
  readonly text: string;
  readonly profile: ContextProfile;
};

export async function lintMessage(
  input: LintMessageInput,
  evaluator: Evaluator,
): Promise<LintResult> {
  const metrics = resolveMetricDefinitions(METRIC_DEFINITIONS, input.profile);
  const outcome = await evaluator.evaluate({
    text: input.text,
    profile: input.profile,
    metrics,
    classifications: CLASSIFICATION_DEFINITIONS,
    judgements: JUDGEMENT_DEFINITIONS,
  });

  const scoring = calculateScores(metrics, outcome.metrics);
  // The outcome is typed as a total record, but it is assembled from an
  // external evaluator response, so every answer is checked at runtime.
  const classifications: readonly ClassificationResult[] =
    CLASSIFICATION_DEFINITIONS.map(({ id }) => {
      const answer = outcome.classifications[id];
      if (answer === undefined) {
        throw new TypeError(`missing answer for classification "${id}"`);
      }

      return {
        id,
        value: answer.value,
        confidence: answer.confidence,
        probabilities: answer.probabilities,
      };
    });
  const judgements: readonly JudgementResult[] = JUDGEMENT_DEFINITIONS.map(
    ({ id }) => {
      const answer = outcome.judgements[id];
      if (answer === undefined) {
        throw new TypeError(`missing answer for judgement "${id}"`);
      }

      return {
        id,
        probability: answer.probability,
        confidence: answer.confidence,
      };
    },
  );
  const issues = deriveIssues(
    scoring.metrics,
    classifications,
    input.profile,
  );
  // determineStatus depends on this judgement, so the dependency is explicit
  // rather than relying on the map above having already validated it.
  const needsFix = judgements.find(({ id }) => id === "needsFix");
  if (needsFix === undefined) {
    throw new TypeError('missing answer for judgement "needsFix"');
  }

  const status = determineStatus(scoring.overallScore, needsFix.probability);

  return {
    text: input.text,
    contextId: input.profile.id,
    overallScore: scoring.overallScore,
    metrics: scoring.metrics,
    classifications,
    judgements,
    issues,
    status,
    usage: outcome.usage,
  };
}
