import { type LintResult, METRIC_DEFINITIONS, type Status } from "#core/mod.ts";

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

// Corpus p10 was 0.44 for metrics and 0.42 for tone. A lower cutoff keeps the
// default output quiet while still surfacing unusually diffuse distributions.
const LOW_CONFIDENCE_THRESHOLD = 0.4;

export function formatText(
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

function lowConfidenceSuffix(confidence: number | undefined): string {
  return confidence !== undefined && confidence < LOW_CONFIDENCE_THRESHOLD
    ? "  (low confidence)"
    : "";
}

function style(text: string, code: number, enabled: boolean): string {
  return enabled ? `\u001b[${code}m${text}\u001b[0m` : text;
}
