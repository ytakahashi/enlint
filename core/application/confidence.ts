// Corpus p10 was 0.44 for metrics and 0.42 for tone, and 0.43 for both after
// the SDK migration. A lower cutoff keeps presentations quiet while still
// surfacing unusually diffuse distributions. Every presentation must flag the
// same answers, so the cutoff lives here rather than in a formatter.
const LOW_CONFIDENCE_THRESHOLD = 0.4;

/**
 * Whether an answer's distribution is too diffuse to present without a caveat.
 * An absent confidence is not low: boolean judgements never report one.
 */
export function isLowConfidence(confidence: number | undefined): boolean {
  return confidence !== undefined && confidence < LOW_CONFIDENCE_THRESHOLD;
}
