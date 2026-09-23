import {
  CLASSIFICATION_DEFINITIONS,
  type ClassificationResult,
  type EvaluationUsage,
  type Issue,
  type IssueCategory,
  type IssueSeverity,
  type IssueTarget,
  JUDGEMENT_DEFINITIONS,
  type JudgementResult,
  type LintResult,
  METRIC_DEFINITIONS,
  type MetricResult,
  type Status,
  TONE_DEFINITION,
  type ToneValue,
} from "#core/mod.ts";

// Core has no runtime list of these unions. Records keyed by the union make the
// type checker report a value that is added to or removed from Core.
const ISSUE_CATEGORIES = keysOf(
  {
    wording: true,
    grammar: true,
    clarity: true,
    context: true,
    tone: true,
  } satisfies Record<IssueCategory, true>,
);
const ISSUE_SEVERITIES = keysOf(
  { low: true, medium: true, high: true } satisfies Record<
    IssueSeverity,
    true
  >,
);
const STATUSES = keysOf(
  { ready: true, improvable: true, "needs-revision": true } satisfies Record<
    Status,
    true
  >,
);
const METRIC_IDS = METRIC_DEFINITIONS.map(({ id }) => id);
const CLASSIFICATION_IDS = CLASSIFICATION_DEFINITIONS.map(({ id }) => id);
const JUDGEMENT_IDS = JUDGEMENT_DEFINITIONS.map(({ id }) => id);
const TONE_VALUES = keysOf(TONE_DEFINITION.choices);

/**
 * Rebuilds a lint result received from the webview, or throws a TypeError
 * naming the first invalid field.
 *
 * The host keeps no session state, so advice is requested with the result the
 * webview sends back. Its declared type is not checked at run time, and it is
 * forwarded to a paid provider, so its shape is validated before that call.
 * Only the fields of LintResult are copied; anything else is dropped.
 */
export function parseLintResult(value: unknown): LintResult {
  const path = "lintResult";
  const record = requireRecord(value, path);
  return {
    text: requireString(record.text, `${path}.text`),
    contextId: requireString(record.contextId, `${path}.contextId`),
    overallScore: requireScore(record.overallScore, `${path}.overallScore`),
    metrics: requireArrayOf(record.metrics, `${path}.metrics`, parseMetric),
    classifications: requireArrayOf(
      record.classifications,
      `${path}.classifications`,
      parseClassification,
    ),
    judgements: requireArrayOf(
      record.judgements,
      `${path}.judgements`,
      parseJudgement,
    ),
    issues: requireArrayOf(record.issues, `${path}.issues`, parseIssue),
    status: requireMember(record.status, STATUSES, `${path}.status`),
    usage: optional(record.usage, `${path}.usage`, parseUsage),
  };
}

function parseMetric(value: unknown, path: string): MetricResult {
  const record = requireRecord(value, path);
  return {
    id: requireMember(record.id, METRIC_IDS, `${path}.id`),
    score: requireScore(record.score, `${path}.score`),
    rawLevel: requireFiniteNumber(record.rawLevel, `${path}.rawLevel`),
    levelCount: requirePositiveInteger(
      record.levelCount,
      `${path}.levelCount`,
    ),
    confidence: optional(record.confidence, `${path}.confidence`, requireUnit),
    probabilities: optional(
      record.probabilities,
      `${path}.probabilities`,
      parseProbabilities,
    ),
  };
}

function parseClassification(
  value: unknown,
  path: string,
): ClassificationResult {
  const record = requireRecord(value, path);
  return {
    id: requireMember(record.id, CLASSIFICATION_IDS, `${path}.id`),
    value: requireMember(record.value, TONE_VALUES, `${path}.value`),
    confidence: optional(record.confidence, `${path}.confidence`, requireUnit),
    probabilities: optional(
      record.probabilities,
      `${path}.probabilities`,
      parseToneProbabilities,
    ),
  };
}

function parseJudgement(value: unknown, path: string): JudgementResult {
  const record = requireRecord(value, path);
  return {
    id: requireMember(record.id, JUDGEMENT_IDS, `${path}.id`),
    probability: requireUnit(record.probability, `${path}.probability`),
    confidence: optional(record.confidence, `${path}.confidence`, requireUnit),
  };
}

function parseIssue(value: unknown, path: string): Issue {
  const record = requireRecord(value, path);
  return {
    category: requireMember(
      record.category,
      ISSUE_CATEGORIES,
      `${path}.category`,
    ),
    severity: requireMember(
      record.severity,
      ISSUE_SEVERITIES,
      `${path}.severity`,
    ),
    target: parseIssueTarget(record.target, `${path}.target`),
    detail: requireString(record.detail, `${path}.detail`),
  };
}

function parseIssueTarget(value: unknown, path: string): IssueTarget {
  const record = requireRecord(value, path);
  switch (record.kind) {
    case "message":
      return { kind: "message" };
    case "sentence":
      return {
        kind: "sentence",
        index: requireNonNegativeInteger(record.index, `${path}.index`),
      };
    default:
      throw invalid(`${path}.kind`);
  }
}

function parseUsage(value: unknown, path: string): EvaluationUsage {
  const record = requireRecord(value, path);
  const count = (key: keyof EvaluationUsage) =>
    optional(record[key], `${path}.${key}`, requireNonNegativeInteger);
  return {
    inputTokens: count("inputTokens"),
    outputTokens: count("outputTokens"),
    totalTokens: count("totalTokens"),
  };
}

function parseProbabilities(
  value: unknown,
  path: string,
): Readonly<Record<string, number>> {
  const record = requireRecord(value, path);
  return Object.fromEntries(
    Object.entries(record).map((
      [key, entry],
    ) => [key, requireUnit(entry, `${path}.${key}`)]),
  );
}

function parseToneProbabilities(
  value: unknown,
  path: string,
): Readonly<Record<ToneValue, number>> {
  const record = requireRecord(value, path);
  const entries = TONE_VALUES.map((tone) =>
    [tone, requireUnit(record[tone], `${path}.${tone}`)] as const
  );
  return Object.fromEntries(entries) as Record<ToneValue, number>;
}

/** Absent and undefined are the same after crossing the JSON boundary. */
function optional<T>(
  value: unknown,
  path: string,
  parse: (value: unknown, path: string) => T,
): T | undefined {
  return value === undefined ? undefined : parse(value, path);
}

function requireArrayOf<T>(
  value: unknown,
  path: string,
  parse: (value: unknown, path: string) => T,
): readonly T[] {
  if (!Array.isArray(value)) throw invalid(path);
  return value.map((item, index) => parse(item, `${path}[${index}]`));
}

function requireRecord(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw invalid(path);
  }
  return value as Record<string, unknown>;
}

function requireMember<T extends string>(
  value: unknown,
  members: readonly T[],
  path: string,
): T {
  const member = members.find((candidate) => candidate === value);
  if (member === undefined) throw invalid(path);
  return member;
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== "string") throw invalid(path);
  return value;
}

function requireFiniteNumber(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw invalid(path);
  }
  return value;
}

function requireScore(value: unknown, path: string): number {
  return requireInRange(value, path, 0, 100);
}

function requireUnit(value: unknown, path: string): number {
  return requireInRange(value, path, 0, 1);
}

function requireInRange(
  value: unknown,
  path: string,
  min: number,
  max: number,
): number {
  const number = requireFiniteNumber(value, path);
  if (number < min || number > max) throw invalid(path);
  return number;
}

function requireNonNegativeInteger(value: unknown, path: string): number {
  const number = requireFiniteNumber(value, path);
  if (!Number.isInteger(number) || number < 0) throw invalid(path);
  return number;
}

function requirePositiveInteger(value: unknown, path: string): number {
  const number = requireNonNegativeInteger(value, path);
  if (number === 0) throw invalid(path);
  return number;
}

function invalid(path: string): TypeError {
  return new TypeError(`${path} is missing or invalid`);
}

function keysOf<T extends string>(record: Readonly<Record<T, unknown>>): T[] {
  return Object.keys(record) as T[];
}
