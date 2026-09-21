import type { AdviceKind, AdviceRequest } from "#core/domain/advisor.ts";
import type { LintResult } from "#core/domain/lint_result.ts";
import { METRIC_DEFINITIONS } from "#core/domain/metric.ts";
import {
  ADVICE_SCHEMA_NAME,
  MAX_REWRITE_CANDIDATES,
  type OpenAiAdviceRequestBody,
} from "./_types.ts";

// The linter, not this model, decides which issues exist. Explaining a score
// does require reading the message, so the instructions bound that reading to
// the supplied assessment instead of forbidding it.
const SYSTEM_INSTRUCTIONS = `You are an English writing advisor.
The supplied lint result is authoritative: explain only the issues it lists, and never add, remove, or re-rank them.
For each issue, say what in this message caused its category to be scored as the assessment reports, using the metric criteria supplied.
Keep every explanation within the scope of its own category.
When fixes are requested, return rewrites that address the listed issues, preserving the writer's meaning and the stated context.
Return no rewrite candidates when the lint result lists no issues; never restate the message as a candidate.
Return only the structured response requested by the schema.`;

export function buildOpenAiAdviceRequest(
  request: AdviceRequest,
): OpenAiAdviceRequestBody {
  const explanationCount = includes(request.kind, "explain")
    ? request.lintResult.issues.length
    : 0;
  // Nothing was flagged, so there is nothing to rewrite. Bounding the schema
  // rather than only instructing the model keeps it from restating the message.
  const candidateLimit =
    includes(request.kind, "fix") && request.lintResult.issues.length > 0
      ? MAX_REWRITE_CANDIDATES
      : 0;

  const payload = {
    message: request.lintResult.text,
    context: {
      id: request.profile.id,
      description: request.profile.description,
    },
    requested: {
      explain: includes(request.kind, "explain"),
      fix: includes(request.kind, "fix"),
    },
    assessment: assessment(request.lintResult),
    issues: request.lintResult.issues.map((issue, issueIndex) => ({
      issueIndex,
      category: issue.category,
      severity: issue.severity,
      target: issue.target,
      detail: issue.detail,
    })),
  };

  return {
    input: [
      { role: "system", content: SYSTEM_INSTRUCTIONS },
      { role: "user", content: JSON.stringify(payload) },
    ],
    text: {
      format: {
        type: "json_schema",
        name: ADVICE_SCHEMA_NAME,
        strict: true,
        schema: adviceSchema(explanationCount, candidateLimit),
      },
    },
    store: false,
  };
}

function adviceSchema(
  explanationCount: number,
  candidateLimit: number,
): Readonly<Record<string, unknown>> {
  return {
    type: "object",
    properties: {
      explanations: {
        type: "array",
        minItems: explanationCount,
        maxItems: explanationCount,
        items: {
          type: "object",
          properties: {
            issueIndex: {
              type: "integer",
              minimum: 0,
              maximum: Math.max(0, explanationCount - 1),
            },
            explanation: { type: "string", minLength: 1 },
          },
          required: ["issueIndex", "explanation"],
          additionalProperties: false,
        },
      },
      candidates: {
        type: "array",
        maxItems: candidateLimit,
        items: {
          type: "object",
          properties: {
            text: { type: "string", minLength: 1 },
            rationale: { type: "string", minLength: 1 },
          },
          required: ["text", "rationale"],
          additionalProperties: false,
        },
      },
    },
    required: ["explanations", "candidates"],
    additionalProperties: false,
  };
}

/**
 * The scores and tone the linter produced. Issue details only restate a score,
 * so without this the model has nothing but the message to reason from.
 */
function assessment(lintResult: LintResult): Readonly<Record<string, unknown>> {
  const tone = lintResult.classifications.find(({ id }) => id === "tone");

  return {
    overallScore: lintResult.overallScore,
    ...(tone === undefined ? {} : { tone: tone.value }),
    metrics: lintResult.metrics.map((metric) => ({
      id: metric.id,
      score: metric.score,
      criteria: criteriaFor(metric.id),
    })),
  };
}

function criteriaFor(id: string): string {
  const definition = METRIC_DEFINITIONS.find((metric) => metric.id === id);
  if (definition === undefined) {
    throw new TypeError(`no metric definition for "${id}"`);
  }
  return definition.instructions;
}

function includes(kind: AdviceKind, part: "explain" | "fix"): boolean {
  return kind === "both" || kind === part;
}
