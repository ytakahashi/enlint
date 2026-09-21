export type MetricId =
  | "naturalness"
  | "grammar"
  | "clarity"
  | "contextFit";

export type MetricDefinition = {
  readonly id: MetricId;
  readonly label: string;
  readonly instructions: string;
  /** Ordered from the least desirable outcome to the most desirable one. */
  readonly levels: readonly string[];
  readonly weight: number;
};

export type MetricResult = {
  readonly id: MetricId;
  /** Score normalized to the inclusive range from 0 to 100. */
  readonly score: number;
  /** Evaluator score in the inclusive range from 0 to levelCount - 1. */
  readonly rawLevel: number;
  /** Number of rubric levels used to produce rawLevel. */
  readonly levelCount: number;
  readonly confidence: number | undefined;
  readonly probabilities: Readonly<Record<string, number>> | undefined;
};

export const METRIC_DEFINITIONS = [
  {
    id: "naturalness",
    label: "Naturalness",
    instructions:
      "Assess how naturally the message reads to a native English speaker, independent of whether its meaning can be understood.",
    levels: [
      "Reads as machine-translated or clearly non-native English.",
      "Understandable but visibly unnatural phrasing.",
      "Acceptable, though a native speaker would phrase it differently.",
      "Natural, with only minor awkwardness.",
      "Reads exactly as a native speaker would write it.",
    ],
    weight: 0.3,
  },
  {
    id: "grammar",
    label: "Grammar",
    instructions:
      "Assess grammatical correctness, including sentence structure, agreement, tense, articles, prepositions, and punctuation.",
    levels: [
      "Frequent or fundamental grammatical errors make the message difficult to understand.",
      "Several clear grammatical errors disrupt reading, though the main meaning can be recovered.",
      "Generally understandable, with noticeable grammatical errors that should be corrected.",
      "Grammatically sound, with at most a minor error that does not distract the reader.",
      "Consistently correct grammar and punctuation throughout the message.",
    ],
    weight: 0.25,
  },
  {
    id: "clarity",
    label: "Clarity",
    instructions:
      "Assess whether the message communicates its intended meaning directly and unambiguously, without unnecessary complexity or missing connections.",
    levels: [
      "The intended meaning is unclear or cannot be reliably determined.",
      "The main point is difficult to follow because of ambiguity, omissions, or confusing structure.",
      "The main point is understandable, but parts require rereading or interpretation.",
      "Clear and easy to follow, with only a minor opportunity to be more direct or precise.",
      "Immediately clear, concise, and unambiguous throughout.",
    ],
    weight: 0.25,
  },
  {
    id: "contextFit",
    label: "Context Fit",
    instructions:
      "Assess how well the message fits the provided communication context, including its audience, purpose, directness, and level of formality.",
    levels: [
      "Strongly inappropriate for the stated context and likely to cause misunderstanding or offense.",
      "Poorly suited to the context in several important respects.",
      "Usable in the context, but with noticeable mismatches in tone, directness, or convention.",
      "Well suited to the context, with only a minor mismatch.",
      "Fully appropriate for the audience, purpose, and conventions of the stated context.",
    ],
    weight: 0.2,
  },
] as const satisfies readonly MetricDefinition[];
