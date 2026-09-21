import type { Status } from "../domain/lint_result.ts";
import {
  NEEDS_FIX_PROBABILITY_THRESHOLD,
  READY_STATUS_SCORE_THRESHOLD,
} from "./_thresholds.ts";

export function determineStatus(
  overallScore: number,
  needsFixProbability: number,
): Status {
  if (
    !Number.isFinite(overallScore) || overallScore < 0 || overallScore > 100
  ) {
    throw new RangeError("overallScore must be a finite number from 0 to 100");
  }
  if (
    !Number.isFinite(needsFixProbability) ||
    needsFixProbability < 0 ||
    needsFixProbability > 1
  ) {
    throw new RangeError(
      "needsFixProbability must be a finite number from 0 to 1",
    );
  }

  if (needsFixProbability >= NEEDS_FIX_PROBABILITY_THRESHOLD) {
    return "needs-revision";
  }
  if (overallScore >= READY_STATUS_SCORE_THRESHOLD) {
    return "ready";
  }
  return "improvable";
}
