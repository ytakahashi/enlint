import {
  type AdviceOutcome,
  isLowConfidence,
  type Issue,
  type IssueExplanation,
  type LintResult,
  METRIC_DEFINITIONS,
  type RewriteCandidate,
  type Status,
} from "#core/mod.ts";

export type TextFormatOptions = {
  readonly color: boolean;
};

const STATUS_LABELS = {
  ready: "Ready to send",
  improvable: "Understandable, but could be improved",
  "needs-revision": "Needs revision",
} as const satisfies Readonly<Record<Status, string>>;

const STATUS_COLORS = {
  ready: 32,
  improvable: 33,
  "needs-revision": 31,
} as const satisfies Readonly<Record<Status, number>>;

const METRIC_LABEL_WIDTH = Math.max(
  ...METRIC_DEFINITIONS.map(({ label }) => label.length),
) + 3;

/**
 * Formats the lint result alone. Advice is formatted separately by
 * formatAdviceText so the result can be written before advice is requested.
 */
export function formatLintText(
  result: LintResult,
  options: TextFormatOptions,
): string {
  const metrics = METRIC_DEFINITIONS.map((definition) => {
    const metric = result.metrics.find(({ id }) => id === definition.id);
    if (metric === undefined) {
      throw new TypeError(`missing result for metric "${definition.id}"`);
    }
    return `${definition.label.padEnd(METRIC_LABEL_WIDTH)}${metric.score}/100${
      lowConfidenceSuffix(metric.confidence)
    }`;
  });
  const tone = result.classifications.find(({ id }) => id === "tone");
  if (tone === undefined) {
    throw new TypeError('missing result for classification "tone"');
  }

  const issueLines = result.issues.length === 0
    ? ["None"]
    : result.issues.map(({ category, severity }) =>
      `- ${category}: ${severity}`
    );
  const status = style(
    STATUS_LABELS[result.status],
    STATUS_COLORS[result.status],
    options.color,
  );

  return [
    style(`Score: ${result.overallScore}/100`, 1, options.color),
    "",
    ...metrics,
    "",
    `Tone: ${tone.value}${lowConfidenceSuffix(tone.confidence)}`,
    "",
    style("Issues", 1, options.color),
    ...issueLines,
    "",
    `Status: ${status}`,
    "",
  ].join("\n");
}

/** Formats advice as a block that follows the output of formatLintText. */
export function formatAdviceText(
  result: LintResult,
  advice: AdviceOutcome,
  options: TextFormatOptions,
): string {
  return [
    "",
    style("Explanations", 1, options.color),
    ...formatExplanations(result.issues, advice.explanations),
    "",
    style("Suggested rewrites", 1, options.color),
    ...formatCandidates(advice.candidates),
    "",
  ].join("\n");
}

function formatExplanations(
  issues: readonly Issue[],
  explanations: readonly IssueExplanation[],
): readonly string[] {
  if (explanations.length === 0) {
    return ["None"];
  }

  // Listed in issue order, whatever order the advisor returned them in.
  return [...explanations]
    .sort((left, right) => left.issueIndex - right.issueIndex)
    .flatMap(({ issueIndex, explanation }) => {
      const prefix = `- ${issues[issueIndex].category}: `;
      return prefixLines(explanation, prefix, " ".repeat(prefix.length));
    });
}

function formatCandidates(
  candidates: readonly RewriteCandidate[],
): readonly string[] {
  if (candidates.length === 0) {
    return ["None"];
  }

  return candidates.flatMap((candidate, index) => [
    ...prefixLines(candidate.text, `${index + 1}. `, "   "),
    ...prefixLines(candidate.rationale, "   Reason: ", "           "),
  ]);
}

// Model output can contain line breaks; indent every continuation so it cannot
// be mistaken for another issue or rewrite candidate in the CLI layout.
function prefixLines(
  value: string,
  firstPrefix: string,
  continuationPrefix: string,
): readonly string[] {
  return value.split(/\r?\n/).map((line, index) =>
    `${index === 0 ? firstPrefix : continuationPrefix}${line}`
  );
}

function lowConfidenceSuffix(confidence: number | undefined): string {
  return isLowConfidence(confidence) ? "  (low confidence)" : "";
}

function style(text: string, code: number, enabled: boolean): string {
  return enabled ? `\u001b[${code}m${text}\u001b[0m` : text;
}
