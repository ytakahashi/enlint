// These values are validated against the golden corpus. Status and issue
// thresholds represent different decisions, so keep them independent and run
// the golden report before adopting a change. tools/golden/tuning.ts mirrors
// them as search tie-breakers; update both locations together. Its test enforces
// their synchronization.
export const READY_STATUS_SCORE_THRESHOLD = 85;
export const ISSUE_FREE_SCORE_THRESHOLD = 80;
export const MEDIUM_ISSUE_SCORE_THRESHOLD = 70;
export const HIGH_ISSUE_SCORE_THRESHOLD = 55;
export const NEEDS_FIX_PROBABILITY_THRESHOLD = 0.5;
