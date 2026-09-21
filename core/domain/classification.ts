export type ClassificationId = "tone";

export type ToneValue =
  | "very casual"
  | "casual"
  | "neutral"
  | "slightly formal"
  | "formal";

export type ClassificationDefinition = {
  readonly id: ClassificationId;
  readonly label: string;
  readonly instructions: string;
  readonly choices: Readonly<Record<ToneValue, string>>;
};

export type ClassificationResult = {
  readonly id: ClassificationId;
  readonly value: ToneValue;
  readonly confidence: number | undefined;
  readonly probabilities:
    | Readonly<Record<ToneValue, number>>
    | undefined;
};

export const TONE_DEFINITION = {
  id: "tone",
  label: "Tone",
  instructions:
    "Classify the message by the level of formality it conveys. Judge the wording itself rather than whether that tone is appropriate for the provided context.",
  choices: {
    "very casual":
      "Highly relaxed or intimate language, often using slang, fragments, or playful shorthand.",
    casual:
      "Conversational and relaxed language suitable for familiar people or informal exchanges.",
    neutral:
      "Plain, broadly usable language that is neither notably casual nor notably formal.",
    "slightly formal":
      "Polished and courteous language with some professional distance, without sounding ceremonial or stiff.",
    formal:
      "Deliberately formal, deferential, or ceremonial language with clear social or professional distance.",
  },
} as const satisfies ClassificationDefinition;

export const CLASSIFICATION_DEFINITIONS = [
  TONE_DEFINITION,
] as const satisfies readonly ClassificationDefinition[];
