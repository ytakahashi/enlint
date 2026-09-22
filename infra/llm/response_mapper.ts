import type {
  AdviceKind,
  AdviceOutcome,
  AdviceRequest,
  IssueExplanation,
  RewriteCandidate,
} from "#core/mod.ts";
import { MAX_REWRITE_CANDIDATES } from "./_types.ts";

export class InvalidOpenAiAdviceResponseError extends Error {
  override readonly name = "InvalidOpenAiAdviceResponseError";
}

export function mapOpenAiAdviceResponse(
  request: AdviceRequest,
  outputText: string,
): AdviceOutcome {
  let value: unknown;
  try {
    value = JSON.parse(outputText);
  } catch {
    throw invalid("response must contain valid JSON");
  }

  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["explanations", "candidates"])
  ) {
    throw invalid("response must contain explanations and candidates only");
  }

  return {
    explanations: mapExplanations(value.explanations, request),
    candidates: mapCandidates(value.candidates, request),
  };
}

function mapExplanations(
  value: unknown,
  request: AdviceRequest,
): readonly IssueExplanation[] {
  if (!Array.isArray(value)) {
    throw invalid("explanations must be an array");
  }

  const expectedCount = includes(request.kind, "explain")
    ? request.lintResult.issues.length
    : 0;
  if (value.length !== expectedCount) {
    throw invalid(`response must contain ${expectedCount} explanations`);
  }

  const seen = new Set<number>();
  return value.map((item) => {
    if (
      !isRecord(item) ||
      !hasExactKeys(item, ["issueIndex", "explanation"]) ||
      !Number.isInteger(item.issueIndex) ||
      (item.issueIndex as number) < 0 ||
      (item.issueIndex as number) >= request.lintResult.issues.length ||
      !isNonEmptyString(item.explanation)
    ) {
      throw invalid(
        "each explanation must identify one lint issue and contain non-empty text",
      );
    }

    const issueIndex = item.issueIndex as number;
    if (seen.has(issueIndex)) {
      throw invalid(`issue ${issueIndex} must not be explained more than once`);
    }
    seen.add(issueIndex);
    return { issueIndex, explanation: item.explanation as string };
  });
}

function mapCandidates(
  value: unknown,
  request: AdviceRequest,
): readonly RewriteCandidate[] {
  if (!Array.isArray(value)) {
    throw invalid("candidates must be an array");
  }

  // Mirrors the bound the prompt builder puts in the schema, so a response that
  // ignored the schema is rejected here instead of reaching presentation.
  const limit =
    includes(request.kind, "fix") && request.lintResult.issues.length > 0
      ? MAX_REWRITE_CANDIDATES
      : 0;
  if (value.length > limit) {
    throw invalid(`response must contain at most ${limit} rewrite candidates`);
  }

  return value.map((item) => {
    if (
      !isRecord(item) ||
      !hasExactKeys(item, ["text", "rationale"]) ||
      !isNonEmptyString(item.text) ||
      !isNonEmptyString(item.rationale)
    ) {
      throw invalid(
        "each rewrite candidate must contain non-empty text and rationale",
      );
    }
    return { text: item.text as string, rationale: item.rationale as string };
  });
}

function includes(kind: AdviceKind, part: "explain" | "fix"): boolean {
  return kind === "both" || kind === part;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Readonly<Record<string, unknown>>,
  keys: readonly string[],
): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => key in value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function invalid(message: string): InvalidOpenAiAdviceResponseError {
  return new InvalidOpenAiAdviceResponseError(
    `invalid OpenAI advice response: ${message}`,
  );
}
