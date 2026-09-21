import type { ClassificationResult } from "../domain/classification.ts";
import type { ContextProfile } from "../domain/context_profile.ts";
import type { Issue, IssueCategory, IssueSeverity } from "../domain/issue.ts";
import type { MetricId, MetricResult } from "../domain/metric.ts";
import {
  HIGH_ISSUE_SCORE_THRESHOLD,
  MEDIUM_ISSUE_SCORE_THRESHOLD,
  READY_SCORE_THRESHOLD,
} from "./_thresholds.ts";

const METRIC_CATEGORIES = {
  naturalness: "wording",
  grammar: "grammar",
  clarity: "clarity",
  contextFit: "context",
} as const satisfies Readonly<Record<MetricId, IssueCategory>>;

export function deriveIssues(
  metrics: readonly MetricResult[],
  classifications: readonly ClassificationResult[],
  profile: ContextProfile,
): readonly Issue[] {
  const issues: Issue[] = [];

  for (const metric of metrics) {
    const severity = severityForScore(metric.score);
    if (severity === undefined) {
      continue;
    }

    issues.push({
      category: METRIC_CATEGORIES[metric.id],
      severity,
      target: { kind: "message" },
      detail:
        `Metric "${metric.id}" scored ${metric.score}, below the ready threshold of ${READY_SCORE_THRESHOLD}.`,
    });
  }

  const tone = classifications.find(({ id }) => id === "tone");
  if (tone !== undefined && !profile.expectedTones.includes(tone.value)) {
    issues.push({
      category: "tone",
      severity: "low",
      target: { kind: "message" },
      detail:
        `Tone "${tone.value}" is not expected for context "${profile.id}".`,
    });
  }

  return issues;
}

function severityForScore(score: number): IssueSeverity | undefined {
  if (!Number.isFinite(score) || score < 0 || score > 100) {
    throw new RangeError("metric score must be a finite number from 0 to 100");
  }
  if (score >= READY_SCORE_THRESHOLD) {
    return undefined;
  }
  if (score >= MEDIUM_ISSUE_SCORE_THRESHOLD) {
    return "low";
  }
  if (score >= HIGH_ISSUE_SCORE_THRESHOLD) {
    return "medium";
  }
  return "high";
}
