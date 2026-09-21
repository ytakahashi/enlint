import type {
  AdviceKind,
  AdviceOutcome,
  AdviceRequest,
  Advisor,
} from "../domain/advisor.ts";

export async function adviseLintResult(
  request: AdviceRequest,
  advisor: Advisor,
): Promise<AdviceOutcome> {
  // The resolved profile drives the advice prompt, so it must be the context
  // that produced the lint result rather than another profile with new rules.
  if (request.profile.id !== request.lintResult.contextId) {
    throw new TypeError(
      `advice profile "${request.profile.id}" does not match lint result context "${request.lintResult.contextId}"`,
    );
  }

  const outcome = await advisor.advise(request);
  // The port's contract is checked here rather than only in an adapter, so it
  // holds for every Advisor implementation.
  validateOutcome(outcome, request);
  return outcome;
}

function validateOutcome(
  outcome: AdviceOutcome,
  request: AdviceRequest,
): void {
  const issueCount = request.lintResult.issues.length;
  const seen = new Set<number>();

  for (const { issueIndex } of outcome.explanations) {
    if (
      !Number.isInteger(issueIndex) || issueIndex < 0 ||
      issueIndex >= issueCount
    ) {
      throw new RangeError(
        `advice explanation index ${issueIndex} is outside the ${issueCount} lint issues`,
      );
    }
    if (seen.has(issueIndex)) {
      throw new TypeError(
        `advice contains more than one explanation for issue ${issueIndex}`,
      );
    }
    seen.add(issueIndex);
  }

  if (!includes(request.kind, "explain") && outcome.explanations.length > 0) {
    throw new TypeError(
      `advice contains explanations that "${request.kind}" did not request`,
    );
  }
  if (!includes(request.kind, "fix") && outcome.candidates.length > 0) {
    throw new TypeError(
      `advice contains rewrite candidates that "${request.kind}" did not request`,
    );
  }
}

/** An empty candidate list is valid, so only the unrequested side is checked. */
function includes(kind: AdviceKind, part: "explain" | "fix"): boolean {
  return kind === "both" || kind === part;
}
